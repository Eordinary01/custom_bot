/**
 * JARVIS Conversational AI - Conversation Context Manager
 * 
 * Manages in-memory conversation history with a sliding window of the last 20 turns,
 * formats context for LLM prompts, resolves pronouns and references,
 * tracks topic transitions, and coordinates with long-term memory.
 * 
 * Requirements: 5.1, 5.2, 5.6, 11.1, 11.2, 11.4
 */

import { randomUUID } from 'crypto';

/**
 * Short-term In-Memory Conversation Context
 */
export class ConversationContext {
  /**
   * @param {number} [maxTurns=20] Maximum turns in sliding window
   * @param {string} [sessionId] Optional existing session ID
   */
  constructor(maxTurns = 20, sessionId = null) {
    this.maxTurns = maxTurns;
    this.sessionId = sessionId || randomUUID();
    this.startedAt = new Date().toISOString();
    this.turns = []; // Array of { role: 'user'|'assistant', content: string, timestamp: string, metadata?: object }
    this.currentTopic = null;
    this.lastReferencedEntity = null;
  }

  /**
   * Add a turn to context with sliding window maintenance
   * @param {'user'|'assistant'} role Speaker role
   * @param {string} content Message text
   * @param {object} [metadata={}] Extra metadata (intent, actions, etc.)
   * @returns {object} The created turn
   */
  addTurn(role, content, metadata = {}) {
    if (!content || typeof content !== 'string') return null;

    const turn = {
      role,
      content: content.trim(),
      timestamp: new Date().toISOString(),
      metadata
    };

    this.turns.push(turn);

    // Enforce sliding window (maximum maxTurns)
    while (this.turns.length > this.maxTurns) {
      this.turns.shift();
    }

    return turn;
  }

  /**
   * Add user message turn
   * @param {string} content User input
   * @param {object} [metadata={}] Optional metadata
   */
  addUserMessage(content, metadata = {}) {
    return this.addTurn('user', content, metadata);
  }

  /**
   * Add assistant message turn
   * @param {string} content Assistant response
   * @param {object} [metadata={}] Optional metadata
   */
  addAssistantMessage(content, metadata = {}) {
    return this.addTurn('assistant', content, metadata);
  }

  /**
   * Get the N most recent turns
   * @param {number} [n=5] Number of recent turns
   * @returns {Array<{role: string, content: string, timestamp: string}>}
   */
  getRecentContext(n = 5) {
    return this.turns.slice(-n);
  }

  /**
   * Get all active turns in memory
   * @returns {Array<{role: string, content: string, timestamp: string}>}
   */
  getAllTurns() {
    return [...this.turns];
  }

  /**
   * Clear in-memory turns
   */
  clear() {
    this.turns = [];
    this.currentTopic = null;
    this.lastReferencedEntity = null;
  }
}

/**
 * ContextManager coordinates short-term conversation context,
 * reference resolution, topic tracking, and long-term memory integration.
 */
export class ContextManager {
  /**
   * @param {object} [options={}]
   * @param {number} [options.maxTurns=20] Max sliding window size
   * @param {import('./memory-store.js').MemoryStore} [options.memoryStore] Persistent SQLite store
   */
  constructor(options = {}) {
    this.maxTurns = options.maxTurns || 20;
    this.memoryStore = options.memoryStore || null;
    this.currentSession = new ConversationContext(this.maxTurns);
    this.topicKeywords = new Set();
  }

  /**
   * Start a new session, optionally saving previous session to memory store
   * @returns {string} New session ID
   */
  async startNewSession() {
    if (this.memoryStore && this.currentSession.turns.length > 0) {
      await this.saveCurrentSession();
    }

    this.currentSession = new ConversationContext(this.maxTurns);
    this.topicKeywords.clear();
    return this.currentSession.sessionId;
  }

  /**
   * Record a user message and track topic/entities
   * @param {string} content User text
   * @param {object} [metadata={}]
   */
  addUserMessage(content, metadata = {}) {
    const turn = this.currentSession.addUserMessage(content, metadata);
    this._extractAndTrackEntities(content);
    return turn;
  }

  /**
   * Record an assistant response and track topic/entities
   * @param {string} content Assistant text
   * @param {object} [metadata={}]
   */
  addAssistantMessage(content, metadata = {}) {
    const turn = this.currentSession.addAssistantMessage(content, metadata);
    this._extractAndTrackEntities(content);
    return turn;
  }

  /**
   * Record a turn with role
   * @param {'user'|'assistant'} role
   * @param {string} content
   * @param {object} [metadata={}]
   */
  addTurn(role, content, metadata = {}) {
    if (role === 'user') return this.addUserMessage(content, metadata);
    return this.addAssistantMessage(content, metadata);
  }

  /**
   * Get formatted context turns for prompts
   * @param {number} [maxTurns=10]
   */
  getContextTurns(maxTurns = 10) {
    return this.formatForPrompt(maxTurns);
  }

  /**
   * Alias for trackTopicTransition
   * @param {string} userInput
   */
  trackTopic(userInput) {
    return this.trackTopicTransition(userInput);
  }

  /**
   * Extract potential entities and subject nouns to track for reference resolution
   * @private
   */
  _extractAndTrackEntities(text) {
    if (!text || typeof text !== 'string') return;

    // Detect app names and technical targets
    const appMatch = text.match(/\b(chrome|google chrome|notepad|calculator|spotify|vs code|vscode|visual studio code|file explorer|task manager|cmd|powershell|netflix|youtube)\b/i);
    if (appMatch) {
      this.currentSession.lastReferencedEntity = appMatch[1].trim();
    }

    // Detect proper nouns / subjects (e.g. "Albert Einstein", "photosynthesis", "quantum computing")
    const subjectMatch = text.match(/(?:about|for|is|regarding)\s+([A-Z][a-zA-Z0-9]*(?:\s+[A-Z][a-zA-Z0-9]*)*)/);
    if (subjectMatch) {
      this.currentSession.lastReferencedEntity = subjectMatch[1].trim();
    }

    // Extract significant keywords (length >= 4) for topic tracking
    const words = text.toLowerCase()
      .replace(/[^a-z0-9\s]/g, '')
      .split(/\s+/)
      .filter(w => w.length >= 4 && !['what', 'when', 'where', 'that', 'this', 'have', 'from', 'with', 'about', 'your', 'tell', 'show'].includes(w));

    for (const word of words) {
      this.topicKeywords.add(word);
    }
  }

  /**
   * Resolve pronouns and referential phrases ("it", "that", "the other one", "again")
   * using recent conversation turns.
   * @param {string} userInput User message
   * @returns {{resolvedInput: string, hasResolution: boolean, originalInput: string, resolvedEntity?: string}}
   */
  resolveReferences(userInput) {
    if (!userInput || typeof userInput !== 'string') {
      return { resolvedInput: userInput, hasResolution: false, originalInput: userInput };
    }

    const trimmed = userInput.trim();
    const lower = trimmed.toLowerCase();

    // Check if input contains pronouns or referential expressions
    const pronounMatch = lower.match(/\b(it|that|this|them|the other one|again)\b/i);
    if (!pronounMatch) {
      return { resolvedInput: trimmed, hasResolution: false, originalInput: trimmed };
    }

    // Exclude non-referential expletive phrases (e.g. "what time is it", "what day is it")
    if (/\b(?:what\s+time\s+is\s+it|what\s+day\s+is\s+it|how\s+is\s+it\s+going|who\s+is\s+it)\b/i.test(lower)) {
      return { resolvedInput: trimmed, hasResolution: false, originalInput: trimmed };
    }

    // Check if we have a tracked referenced entity in session
    let entity = this.currentSession.lastReferencedEntity;

    // If no tracked entity, inspect the last 3 turns for potential targets
    if (!entity) {
      const recent = this.currentSession.getRecentContext(3);
      for (let i = recent.length - 1; i >= 0; i--) {
        const turn = recent[i];
        const match = turn.content.match(/\b(chrome|google chrome|notepad|calculator|spotify|vs code|vscode|file explorer|task manager|cmd|netflix|youtube)\b/i);
        if (match) {
          entity = match[1];
          break;
        }
      }
    }

    if (!entity) {
      return { resolvedInput: trimmed, hasResolution: false, originalInput: trimmed };
    }

    // Resolve specific patterns:
    // e.g. "open it" -> "open <entity>"
    // e.g. "close it" -> "close <entity>"
    // e.g. "tell me more about it" -> "tell me more about <entity>"
    // e.g. "what is it" -> "what is <entity>"
    let resolved = trimmed;

    if (/\b(?:open|launch|start|run|close|kill|show|maximize|minimize)\s+(?:it|that|this)\b/i.test(lower)) {
      resolved = trimmed.replace(/\b(it|that|this)\b/i, entity);
    } else if (/\b(?:about|regarding|with)\s+(?:it|that|this)\b/i.test(lower)) {
      resolved = trimmed.replace(/\b(it|that|this)\b/i, entity);
    } else if (/\b(?:do\s+it\s+again|again)\b/i.test(lower)) {
      resolved = `repeat ${entity}`;
    } else if (/\b(it|that|this)\b/i.test(lower) && trimmed.split(/\s+/).length <= 6) {
      resolved = trimmed.replace(/\b(it|that|this)\b/i, entity);
    }

    const hasResolution = resolved !== trimmed;
    return {
      resolvedInput: resolved,
      hasResolution,
      originalInput: trimmed,
      resolvedEntity: entity
    };
  }

  /**
   * Track whether the conversation topic has transitioned
   * @param {string} userInput User input to evaluate
   * @returns {{isTransition: boolean, previousTopicKeywords: string[], newTopicKeywords: string[]}}
   */
  trackTopicTransition(userInput) {
    if (!userInput || typeof userInput !== 'string') {
      return { isTransition: false, previousTopicKeywords: [], newTopicKeywords: [] };
    }

    // Extract current input keywords
    const inputWords = userInput.toLowerCase()
      .replace(/[^a-z0-9\s]/g, '')
      .split(/\s+/)
      .filter(w => w.length >= 4 && !['what', 'when', 'where', 'that', 'this', 'have', 'from', 'with', 'about', 'your', 'tell', 'show'].includes(w));

    if (inputWords.length === 0 || this.topicKeywords.size === 0) {
      return { isTransition: false, previousTopicKeywords: Array.from(this.topicKeywords), newTopicKeywords: inputWords };
    }

    // Measure overlap with previous topic keywords
    let overlapCount = 0;
    for (const word of inputWords) {
      if (this.topicKeywords.has(word)) {
        overlapCount++;
      }
    }

    // If input is non-trivial (>=3 keywords) and has 0 overlap with existing topic keywords
    const isTransition = inputWords.length >= 3 && overlapCount === 0;

    if (isTransition) {
      const prevKeywords = Array.from(this.topicKeywords);
      this.topicKeywords.clear();
      for (const w of inputWords) {
        this.topicKeywords.add(w);
      }
      return {
        isTransition: true,
        previousTopicKeywords: prevKeywords.slice(0, 5),
        newTopicKeywords: inputWords
      };
    }

    return {
      isTransition: false,
      previousTopicKeywords: Array.from(this.topicKeywords).slice(0, 5),
      newTopicKeywords: inputWords
    };
  }

  /**
   * Format context turns for LLM prompt injection
   * @param {number} [maxTurns=10] Max turns to include
   * @returns {Array<{role: string, content: string}>} Formatted turn array
   */
  formatForPrompt(maxTurns = 10) {
    return this.currentSession.getRecentContext(maxTurns).map(turn => ({
      role: turn.role,
      content: turn.content
    }));
  }

  /**
   * Save current conversation session to SQLite memory store (if configured)
   */
  async saveCurrentSession() {
    if (!this.memoryStore) return null;

    const turns = this.currentSession.getAllTurns();
    if (turns.length === 0) return null;

    const sessionId = this.currentSession.sessionId;
    const startedAt = this.currentSession.startedAt;
    const endedAt = new Date().toISOString();

    return this.memoryStore.saveSession({
      sessionId,
      startedAt,
      endedAt,
      turnCount: turns.length,
      turns
    });
  }

  /**
   * Load historical context relevant to user query from long-term memory
   * @param {string} query User query
   * @param {number} [limit=3] Maximum past turns to retrieve
   * @returns {Promise<Array<object>>}
   */
  async loadRelevantHistoricalContext(query, limit = 3) {
    if (!this.memoryStore) return [];
    return this.memoryStore.searchTurns(query, limit);
  }
}

export default ContextManager;
