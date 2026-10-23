/**
 * JARVIS Conversational AI - Environmental & Browser Observation Module
 * 
 * Standalone, read-only observer that safely inspects active windows and browser context.
 * Features:
 * - Zero execution / write privileges (read-only SQLite & system metadata)
 * - Strict domain blocklists (banking, healthcare, credentials)
 * - Incognito / InPrivate browsing exclusion
 * - Safe SQLite WAL copy mechanism to prevent database locks or corruption
 * - Strict XML fencing against prompt injection (<observed_data source="...">)
 * - Automatic sensitivity tagging
 */

import fs from 'fs';
import path from 'path';
import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'crypto';

// High-security domain and URL blocklists
const BLOCKED_DOMAINS = [
  // Financial & Banking
  'chase.com', 'bankofamerica.com', 'wellsfargo.com', 'citi.com', 'paypal.com',
  'fidelity.com', 'schwab.com', 'vanguard.com', 'stripe.com', 'coinbase.com', 'binance.com',
  'capitalone.com', 'usbank.com', 'americanexpress.com',
  // Healthcare & Medical
  'mychart', 'epic.com', 'webmd.com', 'cvs.com', 'walgreens.com', 'mayoclinic.org',
  'kaiserpermanente.org', 'healthgrades.com', 'teladoc.com',
  // Authentication & Passwords
  'accounts.google.com', 'login.microsoftonline.com', 'auth0.com', 'okta.com',
  'bitwarden', '1password', 'lastpass', 'dashlane', 'appleid.apple.com', 'github.com/login',
  'login.live.com', 'signin.aws.amazon.com'
];

// Incognito / Private browsing window indicators
const INCOGNITO_PATTERNS = [
  /\bincognito\b/i,
  /\binprivate\b/i,
  /\bprivate\s+browsing\b/i,
  /\btor\s+browser\b/i
];

// Sensitive content patterns in title or snippet
const SENSITIVE_CONTENT_PATTERNS = [
  /\b(?:password|pin|secret|api[_\s-]?key|auth|token|credit\s*card|ssn|statement|tax\s*return|diagnosis|prescription)\b/i
];

export class SystemObserver {
  /**
   * @param {object} [options={}]
   * @param {string[]} [options.blockedDomains=[]] Additional custom blocked domains
   * @param {string} [options.scratchDir] Directory for temp SQLite copies
   */
  constructor(options = {}) {
    this.blockedDomains = Array.from(new Set([...BLOCKED_DOMAINS, ...(options.blockedDomains || [])]));
    this.scratchDir = options.scratchDir || path.join(process.cwd(), 'data', 'scratch');

    if (!fs.existsSync(this.scratchDir)) {
      fs.mkdirSync(this.scratchDir, { recursive: true });
    }
  }

  /**
   * Check if a domain, URL, or title matches blocked security categories
   * @param {string} target
   * @returns {boolean}
   */
  isBlocked(target) {
    if (!target || typeof target !== 'string') return false;
    const lower = target.toLowerCase();

    // Check incognito
    if (INCOGNITO_PATTERNS.some(p => p.test(lower))) {
      return true;
    }

    // Check domain blocklist
    return this.blockedDomains.some(d => lower.includes(d.toLowerCase()));
  }

  /**
   * Evaluate whether observed metadata is sensitive (e.g. should not be spoken aloud)
   * @param {string} text
   * @returns {boolean}
   */
  isSensitive(text) {
    if (!text || typeof text !== 'string') return false;
    if (this.isBlocked(text)) return true;
    return SENSITIVE_CONTENT_PATTERNS.some(p => p.test(text));
  }

  /**
   * Safe SQLite reader that copies database + WAL/SHM files to scratch directory
   * before querying, preventing locks and corruption on live browser databases.
   * 
   * @param {string} dbFilePath Absolute path to live SQLite database
   * @param {(db: DatabaseSync) => any} queryFn Callback with readonly database instance
   * @returns {any} Result of queryFn or null if failed/blocked
   */
  readDatabaseSafely(dbFilePath, queryFn) {
    if (!dbFilePath || !fs.existsSync(dbFilePath)) return null;

    const runId = randomUUID().slice(0, 8);
    const tempDir = path.join(this.scratchDir, `db_obs_${runId}`);
    fs.mkdirSync(tempDir, { recursive: true });

    const baseName = path.basename(dbFilePath);
    const tempDbPath = path.join(tempDir, baseName);

    try {
      // Copy main DB file
      fs.copyFileSync(dbFilePath, tempDbPath);

      // Copy WAL and SHM if present
      const walPath = `${dbFilePath}-wal`;
      const shmPath = `${dbFilePath}-shm`;
      if (fs.existsSync(walPath)) {
        fs.copyFileSync(walPath, `${tempDbPath}-wal`);
      }
      if (fs.existsSync(shmPath)) {
        fs.copyFileSync(shmPath, `${tempDbPath}-shm`);
      }

      // Open read-only SQLite database
      const db = new DatabaseSync(tempDbPath, { readOnly: true });
      try {
        const result = queryFn(db);
        return result;
      } finally {
        db.close();
      }
    } catch (err) {
      return null;
    } finally {
      // Clean up temp scratch files
      try {
        if (fs.existsSync(tempDir)) {
          fs.rmSync(tempDir, { recursive: true, force: true });
        }
      } catch (_) {}
    }
  }

  /**
   * Filter and sanitize a list of observed window or tab records
   * @param {Array<{title: string, url?: string, app?: string}>} items
   * @returns {Array<{title: string, url?: string, app?: string, sensitivity: 'normal'|'sensitive'}>}
   */
  filterObservedItems(items) {
    if (!Array.isArray(items)) return [];

    const allowed = [];
    for (const item of items) {
      const fullText = `${item.title || ''} ${item.url || ''} ${item.app || ''}`;

      // Completely drop blocked domains and incognito windows
      if (this.isBlocked(fullText)) {
        continue;
      }

      const sensitivity = this.isSensitive(fullText) ? 'sensitive' : 'normal';
      allowed.push({
        ...item,
        sensitivity
      });
    }

    return allowed;
  }

  /**
   * Neutralize prompt injection attempts in observed raw strings
   * @param {string} rawString
   * @returns {string} Sanitized string
   */
  sanitizeForPrompt(rawString) {
    if (!rawString || typeof rawString !== 'string') return '';

    return rawString
      // Neutralize model control tokens
      .replace(/<\|endoftext\|>/gi, '[endoftext]')
      .replace(/<\|system\|>/gi, '[system]')
      .replace(/<\|user\|>/gi, '[user]')
      .replace(/<\|assistant\|>/gi, '[assistant]')
      .replace(/<\|end\|>/gi, '[end]')
      // Neutralize boundary injection
      .replace(/<\/observed_data>/gi, '&lt;/observed_data&gt;')
      .replace(/<observed_data/gi, '&lt;observed_data')
      // Neutralize command override tricks
      .replace(/\b(?:ignore\s+all\s+previous\s+instructions|disregard\s+prior\s+instructions|system\s+override)\b/gi, '[filtered command override]')
      .trim();
  }

  /**
   * Wrap observed data in a strict prompt fence
   * @param {string} source Source identifier (e.g. 'active_window', 'open_tabs', 'system_state')
   * @param {string|object} content Data to enclose
   * @returns {string} XML-fenced data string
   */
  formatForPrompt(source, content) {
    const rawText = typeof content === 'object' ? JSON.stringify(content) : String(content);
    const sanitized = this.sanitizeForPrompt(rawText);
    const safeSource = source.replace(/[^a-zA-Z0-9_\-]/g, '_');

    return `<observed_data source="${safeSource}">\n${sanitized}\n</observed_data>`;
  }
}

export default SystemObserver;
