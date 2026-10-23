/**
 * JARVIS Conversational AI - SQLite Long-Term Memory Store
 * 
 * Persistent storage using native Node.js SQLite (DatabaseSync):
 * - Stores conversation sessions and individual conversation turns
 * - Keyword search with relevance scoring across historical context (<500ms)
 * - User preferences management with 30-day retention policy
 * - Named entity and knowledge storage
 * - Privacy controls (data purging & session deletion)
 * 
 * Requirements: 5.3, 5.4, 5.5, 13.3, 13.4, 14.1, 14.6
 */

import { DatabaseSync } from 'node:sqlite';
import path from 'path';
import fs from 'fs';
import {
  generateEmbedding,
  cosineSimilarity,
  vectorToBlob,
  blobToVector
} from './embedding-helper.js';

export class MemoryStore {
  /**
   * @param {object} [options={}]
   * @param {string} [options.dbPath] Path to SQLite database file (defaults to data/memory/jarvis_memory.db)
   * @param {boolean} [options.inMemory=false] Use in-memory database for testing
   */
  constructor(options = {}) {
    this.inMemory = options.inMemory ?? false;

    if (this.inMemory) {
      this.dbPath = ':memory:';
    } else {
      const defaultDir = path.join(process.cwd(), 'data', 'memory');
      if (!fs.existsSync(defaultDir)) {
        fs.mkdirSync(defaultDir, { recursive: true });
      }
      this.dbPath = options.dbPath || path.join(defaultDir, 'jarvis_memory.db');
    }

    this.db = new DatabaseSync(this.dbPath);
    this._initializeSchema();
  }

  /**
   * Initialize SQLite tables and indices
   * @private
   */
  _initializeSchema() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS conversation_sessions (
        session_id TEXT PRIMARY KEY,
        started_at TEXT NOT NULL,
        ended_at TEXT,
        summary TEXT,
        turn_count INTEGER DEFAULT 0
      );

      CREATE TABLE IF NOT EXISTS conversation_turns (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id TEXT NOT NULL,
        role TEXT NOT NULL,
        content TEXT NOT NULL,
        timestamp TEXT NOT NULL,
        FOREIGN KEY (session_id) REFERENCES conversation_sessions(session_id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_turns_session ON conversation_turns(session_id);
      CREATE INDEX IF NOT EXISTS idx_turns_role ON conversation_turns(role);

      CREATE TABLE IF NOT EXISTS user_preferences (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS entities (
        name TEXT PRIMARY KEY,
        type TEXT NOT NULL,
        properties TEXT,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS facts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        category TEXT NOT NULL DEFAULT 'fact',
        key TEXT NOT NULL,
        value TEXT NOT NULL,
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        confidence REAL NOT NULL DEFAULT 1.0,
        source_turn_id INTEGER,
        created_at INTEGER NOT NULL DEFAULT 0,
        superseded_by INTEGER,
        embedding BLOB,
        sensitivity TEXT DEFAULT 'normal'
      );

      CREATE INDEX IF NOT EXISTS idx_facts_key ON facts(key);
      CREATE INDEX IF NOT EXISTS idx_facts_category ON facts(category);
    `);

    // Safe column migrations for existing SQLite database files
    const columnsToEnsure = [
      { name: 'confidence', type: 'REAL DEFAULT 1.0' },
      { name: 'source_turn_id', type: 'INTEGER' },
      { name: 'created_at', type: 'INTEGER DEFAULT 0' },
      { name: 'superseded_by', type: 'INTEGER' },
      { name: 'embedding', type: 'BLOB' },
      { name: 'sensitivity', type: 'TEXT DEFAULT "normal"' }
    ];

    for (const col of columnsToEnsure) {
      try {
        this.db.exec(`ALTER TABLE facts ADD COLUMN ${col.name} ${col.type};`);
      } catch (_) {
        // Column already exists, safe to ignore
      }
    }

    try {
      this.db.exec(`CREATE INDEX IF NOT EXISTS idx_facts_active ON facts(superseded_by);`);
    } catch (_) {}
  }

  /**
   * Save a completed conversation session and its turns
   * @param {object} session
   * @param {string} session.sessionId Session ID
   * @param {string} session.startedAt ISO timestamp
   * @param {string} [session.endedAt] ISO timestamp
   * @param {string} [session.summary] Optional text summary
   * @param {number} [session.turnCount] Number of turns
   * @param {Array<{role: string, content: string, timestamp: string}>} session.turns Conversation turns
   */
  saveSession({ sessionId, startedAt, endedAt = null, summary = null, turnCount = 0, turns = [] }) {
    const insertSession = this.db.prepare(`
      INSERT OR REPLACE INTO conversation_sessions (session_id, started_at, ended_at, summary, turn_count)
      VALUES (?, ?, ?, ?, ?)
    `);

    insertSession.run(
      sessionId,
      startedAt,
      endedAt || new Date().toISOString(),
      summary,
      turnCount || turns.length
    );

    if (turns.length > 0) {
      const insertTurn = this.db.prepare(`
        INSERT INTO conversation_turns (session_id, role, content, timestamp)
        VALUES (?, ?, ?, ?)
      `);

      for (const turn of turns) {
        insertTurn.run(sessionId, turn.role, turn.content, turn.timestamp || new Date().toISOString());
      }
    }

    return sessionId;
  }

  /**
   * Save a single turn to the database
   * @param {string} sessionId
   * @param {string} role 'user' | 'assistant'
   * @param {string} content Turn content
   * @param {string} [timestamp] ISO timestamp
   */
  saveTurn(sessionId, role, content, timestamp = null) {
    try {
      const ensureSession = this.db.prepare(`
        INSERT OR IGNORE INTO conversation_sessions (session_id, started_at, turn_count)
        VALUES (?, ?, 0)
      `);
      ensureSession.run(sessionId, new Date().toISOString());
    } catch (_) {}

    const insertTurn = this.db.prepare(`
      INSERT INTO conversation_turns (session_id, role, content, timestamp)
      VALUES (?, ?, ?, ?)
    `);
    return insertTurn.run(sessionId, role, content, timestamp || new Date().toISOString());
  }

  /**
   * Initialize or verify tables
   */
  initialize() {
    this._initializeSchema();
    return true;
  }

  /**
   * Retrieve a session and its turns by session ID
   * @param {string} sessionId
   * @returns {object|null}
   */
  getSession(sessionId) {
    const sessionStmt = this.db.prepare(`
      SELECT session_id, started_at, ended_at, summary, turn_count
      FROM conversation_sessions
      WHERE session_id = ?
    `);

    const session = sessionStmt.get(sessionId);
    if (!session) return null;

    const turnsStmt = this.db.prepare(`
      SELECT id, role, content, timestamp
      FROM conversation_turns
      WHERE session_id = ?
      ORDER BY id ASC
    `);

    const turns = turnsStmt.all(sessionId);
    return {
      ...session,
      turns
    };
  }

  /**
   * Keyword search across historical turns with relevance scoring
   * @param {string} query Search query string
   * @param {number} [limit=5] Max results
   * @returns {Array<{id: number, sessionId: string, role: string, content: string, timestamp: string, relevanceScore: number}>}
   */
  searchTurns(query, limit = 5) {
    if (!query || typeof query !== 'string') return [];

    const startTime = Date.now();
    const cleanTokens = query.toLowerCase()
      .replace(/[^a-z0-9\s]/g, '')
      .split(/\s+/)
      .filter(w => w.length >= 3 && !['the', 'and', 'what', 'how', 'why', 'who', 'when', 'are', 'was', 'for', 'you'].includes(w));

    if (cleanTokens.length === 0) return [];

    // Query candidate turns containing any keyword
    const likeClauses = cleanTokens.map(() => `content LIKE ?`).join(' OR ');
    const params = cleanTokens.map(token => `%${token}%`);

    const stmt = this.db.prepare(`
      SELECT id, session_id, role, content, timestamp
      FROM conversation_turns
      WHERE ${likeClauses}
      ORDER BY id DESC
      LIMIT 50
    `);

    const candidates = stmt.all(...params);

    // Compute relevance scores
    const scored = candidates.map(turn => {
      let score = 0;
      const lowerContent = turn.content.toLowerCase();

      // 1. Exact query match bonus (+10)
      if (lowerContent.includes(query.toLowerCase())) {
        score += 10;
      }

      // 2. Token frequency match (+2 per token match)
      for (const token of cleanTokens) {
        const regex = new RegExp(`\\b${token}\\b`, 'gi');
        const matches = lowerContent.match(regex);
        if (matches) {
          score += matches.length * 2;
        }
      }

      // 3. Recency bonus (more recent = higher score)
      const ageHours = (Date.now() - new Date(turn.timestamp).getTime()) / (1000 * 60 * 60);
      if (ageHours < 24) score += 3;
      else if (ageHours < 72) score += 1;

      return {
        ...turn,
        relevanceScore: score
      };
    });

    // Sort by relevance score descending
    scored.sort((a, b) => b.relevanceScore - a.relevanceScore);
    const results = scored.slice(0, limit);

    // Latency guarantee requirement: < 500ms
    const duration = Date.now() - startTime;
    return results;
  }

  /**
   * Set a user preference (upsert)
   * @param {string} key Preference name
   * @param {string|object} value Preference value (objects serialized to JSON)
   */
  setPreference(key, value) {
    const stringValue = typeof value === 'object' ? JSON.stringify(value) : String(value);
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO user_preferences (key, value, updated_at)
      VALUES (?, ?, ?)
    `);

    stmt.run(key, stringValue, new Date().toISOString());
    return true;
  }

  /**
   * Get a user preference by key
   * @param {string} key
   * @returns {string|null}
   */
  getPreference(key) {
    const stmt = this.db.prepare(`
      SELECT value, updated_at
      FROM user_preferences
      WHERE key = ?
    `);

    const row = stmt.get(key);
    if (!row) return null;

    try {
      return JSON.parse(row.value);
    } catch (_) {
      return row.value;
    }
  }

  /**
   * Get all active user preferences as a key-value object
   * @returns {object}
   */
  getAllPreferences() {
    const stmt = this.db.prepare(`
      SELECT key, value
      FROM user_preferences
    `);

    const rows = stmt.all();
    const result = {};

    for (const row of rows) {
      try {
        result[row.key] = JSON.parse(row.value);
      } catch (_) {
        result[row.key] = row.value;
      }
    }

    return result;
  }

  /**
   * Enforce 30-day retention policy: remove preferences older than maxAgeDays
   * @param {number} [maxAgeDays=30] Retention window in days
   * @returns {number} Count of pruned records
   */
  cleanupExpiredPreferences(maxAgeDays = 30) {
    const cutoffDate = new Date(Date.now() - (maxAgeDays * 24 * 60 * 60 * 1000)).toISOString();
    const stmt = this.db.prepare(`
      DELETE FROM user_preferences
      WHERE updated_at < ?
    `);

    stmt.run(cutoffDate);
    return true;
  }

  /**
   * Enforce retention/TTL policy for dynamic facts (browser, observed, or learned facts)
   * Prevents unbounded accumulation of temporal facts over time.
   * 
   * @param {number} [maxAgeDays=30] Retention period in days
   * @param {string[]} [categories=['browser', 'observed', 'learned']] Target fact categories to prune
   * @returns {number} Number of pruned fact rows
   */
  cleanupExpiredFacts(maxAgeDays = 30, categories = ['browser', 'observed', 'learned']) {
    const cutoffTimestamp = Date.now() - (maxAgeDays * 24 * 60 * 60 * 1000);
    const placeholders = categories.map(() => '?').join(', ');
    const stmt = this.db.prepare(`
      DELETE FROM facts
      WHERE created_at > 0 AND created_at < ? AND category IN (${placeholders})
    `);

    const info = stmt.run(cutoffTimestamp, ...categories);
    return info.changes || 0;
  }


  /**
   * Store or update a recognized entity
   * @param {string} name Entity name
   * @param {string} type Entity category ('app', 'topic', 'person')
   * @param {object} [properties={}] Additional entity properties
   */
  saveEntity(name, type, properties = {}) {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO entities (name, type, properties, created_at)
      VALUES (?, ?, ?, ?)
    `);

    stmt.run(name, type, JSON.stringify(properties), new Date().toISOString());
    return true;
  }

  /**
   * Retrieve an entity by name
   * @param {string} name
   * @returns {object|null}
   */
  getEntity(name) {
    const stmt = this.db.prepare(`
      SELECT name, type, properties, created_at
      FROM entities
      WHERE name = ?
    `);

    const row = stmt.get(name);
    if (!row) return null;

    return {
      name: row.name,
      type: row.type,
      properties: row.properties ? JSON.parse(row.properties) : {},
      createdAt: row.created_at
    };
  }

  /**
   * Upsert a fact with versioning, conflict resolution, and vector embedding.
   * If an active fact with the same key exists, mark it as superseded by this new fact.
   *
   * @param {object} fact
   * @param {string} [fact.category='fact']
   * @param {string} fact.key
   * @param {string} fact.value
   * @param {number} [fact.confidence=1.0]
   * @param {number|null} [fact.sourceTurnId=null]
   * @param {string} [fact.sensitivity='normal']
   * @param {Buffer|Float32Array|null} [fact.embedding=null]
   * @returns {number} ID of newly created fact
   */
  upsertFact(firstArg, ...rest) {
    let factObj;
    if (typeof firstArg === 'string') {
      factObj = {
        category: firstArg,
        key: rest[0],
        value: rest[1],
        confidence: rest[2] ?? 1.0,
        sourceTurnId: rest[3] ?? null,
        sensitivity: rest[4] ?? 'normal',
        embedding: rest[5] ?? null
      };
    } else if (firstArg && typeof firstArg === 'object') {
      factObj = firstArg;
    } else {
      throw new Error('Key and value are required to upsert fact');
    }

    const {
      category = 'fact',
      key,
      value,
      confidence = 1.0,
      sourceTurnId = null,
      sensitivity = 'normal',
      embedding = null
    } = factObj;

    if (!key || value === undefined || value === null) {
      throw new Error('Key and value are required to upsert fact');
    }

    const strVal = String(value);
    const now = Date.now();

    // Prepare embedding blob
    let embeddingBlob = null;
    if (embedding instanceof Buffer) {
      embeddingBlob = embedding;
    } else if (embedding instanceof Float32Array) {
      embeddingBlob = vectorToBlob(embedding);
    } else {
      const vec = generateEmbedding(`${key} ${strVal}`);
      embeddingBlob = vectorToBlob(vec);
    }

    // Begin transaction for conflict resolution
    this.db.exec('BEGIN TRANSACTION;');
    try {
      // Find existing active fact for this key
      const activeStmt = this.db.prepare(`
        SELECT id FROM facts
        WHERE key = ? AND superseded_by IS NULL
        ORDER BY id DESC
        LIMIT 1
      `);
      const existing = activeStmt.get(key);

      // Insert new fact
      const insertStmt = this.db.prepare(`
        INSERT INTO facts (category, key, value, updated_at, confidence, source_turn_id, created_at, superseded_by, embedding, sensitivity)
        VALUES (?, ?, ?, ?, ?, ?, ?, NULL, ?, ?)
      `);
      insertStmt.run(
        category,
        key,
        strVal,
        new Date().toISOString(),
        Number(confidence) || 1.0,
        sourceTurnId,
        now,
        embeddingBlob,
        sensitivity || 'normal'
      );

      // Retrieve new fact ID
      const newIdRow = this.db.prepare('SELECT last_insert_rowid() as id').get();
      const newId = newIdRow.id;

      // If previous active fact existed, point its superseded_by to the new ID
      if (existing && existing.id !== newId) {
        this.db.prepare('UPDATE facts SET superseded_by = ? WHERE id = ?').run(newId, existing.id);
      }

      this.db.exec('COMMIT;');
      return newId;
    } catch (err) {
      this.db.exec('ROLLBACK;');
      throw err;
    }
  }

  /**
   * Retrieve active (non-superseded) facts
   * @param {string} [category=null] Optional category filter
   * @returns {Array<{id: number, category: string, key: string, value: string, confidence: number, sourceTurnId: number|null, createdAt: number, supersededBy: number|null, sensitivity: string}>}
   */
  getActiveFacts(category = null) {
    let stmt;
    if (category) {
      stmt = this.db.prepare(`
        SELECT id, category, key, value, confidence, source_turn_id as sourceTurnId,
               created_at as createdAt, superseded_by as supersededBy, sensitivity
        FROM facts
        WHERE superseded_by IS NULL AND category = ?
        ORDER BY id ASC
      `);
      return stmt.all(category);
    } else {
      stmt = this.db.prepare(`
        SELECT id, category, key, value, confidence, source_turn_id as sourceTurnId,
               created_at as createdAt, superseded_by as supersededBy, sensitivity
        FROM facts
        WHERE superseded_by IS NULL
        ORDER BY id ASC
      `);
      return stmt.all();
    }
  }

  /**
   * Semantic vector search across active facts using feature hashing embeddings
   * @param {string} query Search query string
   * @param {number} [limit=5] Max results
   * @param {number} [minSimilarity=0.2] Minimum cosine similarity threshold
   * @returns {Array<{id: number, category: string, key: string, value: string, confidence: number, sensitivity: string, similarity: number}>}
   */
  searchFactsSemantic(query, limit = 5, minSimilarity = 0.2) {
    if (!query || typeof query !== 'string') return [];

    const queryVec = generateEmbedding(query);
    const stmt = this.db.prepare(`
      SELECT id, category, key, value, confidence, source_turn_id as sourceTurnId,
             created_at as createdAt, superseded_by as supersededBy, embedding, sensitivity
      FROM facts
      WHERE superseded_by IS NULL
    `);
    const rows = stmt.all();

    const scored = [];
    for (const row of rows) {
      let factVec = null;
      if (row.embedding) {
        factVec = blobToVector(row.embedding);
      }
      if (!factVec) {
        factVec = generateEmbedding(`${row.key} ${row.value}`);
      }

      const sim = cosineSimilarity(queryVec, factVec);
      if (sim >= minSimilarity) {
        const { embedding, ...cleanRow } = row;
        scored.push({
          ...cleanRow,
          similarity: +sim.toFixed(4)
        });
      }
    }

    scored.sort((a, b) => b.similarity - a.similarity);
    return scored.slice(0, limit);
  }

  /**
   * Save or update a learned fact or user preference (backward-compatible)
   * @param {string} category 'preference' | 'identity' | 'fact' | 'interest'
   * @param {string} key Unique identifier for fact
   * @param {string} value Fact content or setting
   */
  saveFact(category, key, value) {
    return this.upsertFact({ category, key, value });
  }

  /**
   * Retrieve active facts by category or all active facts
   * @param {string} [category=null]
   * @returns {Array<{id: number, category: string, key: string, value: string, createdAt: number, sensitivity: string}>}
   */
  getFacts(category = null) {
    if (category) {
      const stmt = this.db.prepare(`
        SELECT id, category, key, value, created_at as createdAt, sensitivity
        FROM facts
        WHERE superseded_by IS NULL AND category = ?
        ORDER BY id ASC
      `);
      return stmt.all(category);
    }

    const stmt = this.db.prepare(`
      SELECT id, category, key, value, created_at as createdAt, sensitivity
      FROM facts
      WHERE superseded_by IS NULL
      ORDER BY id ASC
    `);
    return stmt.all();
  }

  /**
   * General search alias across conversation turns
   * @param {string} query
   * @param {number} [limit=5]
   */
  search(query, limit = 5) {
    return this.searchTurns(query, limit);
  }

  /**
   * Retrieve recent conversation turns across all sessions
   * @param {number} [limit=1000]
   * @returns {Array<{id: number, sessionId: string, role: string, content: string, timestamp: string}>}
   */
  getRecentTurns(limit = 1000) {
    const stmt = this.db.prepare(`
      SELECT id, session_id as sessionId, role, content, timestamp
      FROM conversation_turns
      ORDER BY id ASC
      LIMIT ?
    `);
    return stmt.all(limit);
  }

  /**
   * Purge a single conversation session and its turns
   * @param {string} sessionId
   */
  purgeSession(sessionId) {
    this.db.exec(`BEGIN TRANSACTION;`);
    try {
      this.db.prepare(`DELETE FROM conversation_turns WHERE session_id = ?`).run(sessionId);
      this.db.prepare(`DELETE FROM conversation_sessions WHERE session_id = ?`).run(sessionId);
      this.db.exec(`COMMIT;`);
      return true;
    } catch (err) {
      this.db.exec(`ROLLBACK;`);
      throw err;
    }
  }

  /**
   * Privacy Purge: clears all sessions, turns, preferences, entities, and facts
   */
  purgeAll() {
    this.db.exec(`
      DELETE FROM conversation_turns;
      DELETE FROM conversation_sessions;
      DELETE FROM user_preferences;
      DELETE FROM entities;
      DELETE FROM facts;
    `);
    return true;
  }

  /**
   * Close the SQLite connection
   */
  close() {
    if (this.db) {
      this.db.close();
      this.db = null;
    }
  }
}

export default MemoryStore;
