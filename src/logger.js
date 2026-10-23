/**
 * JARVIS Conversational AI - Structured Logger & Diagnostics
 * 
 * Provides Winston-compatible structured JSON logging with:
 * - Log levels (DEBUG, INFO, WARN, ERROR)
 * - ISO timestamping
 * - Automatic 10MB log rotation with backup retention
 * - User input & response audit logging
 * - Intent classification and performance metrics tracking
 * - Privacy filtering / sensitive data redaction
 * 
 * Requirements: 14.1, 14.2, 14.3, 14.4, 14.5, 14.6
 */

import fs from 'fs';
import path from 'path';

export const LOG_LEVELS = {
  DEBUG: 0,
  INFO: 1,
  WARN: 2,
  ERROR: 3
};

const LEVEL_NAMES = {
  0: 'DEBUG',
  1: 'INFO',
  2: 'WARN',
  3: 'ERROR'
};

/**
 * Common sensitive patterns to redact for privacy
 */
const PRIVACY_PATTERNS = [
  /password["':\s]+([^\s"',;]+)/gi,
  /bearer\s+([a-zA-Z0-9_\-\.]+)/gi,
  /api[_-]?key["':\s]+([^\s"',;]+)/gi,
  /secret["':\s]+([^\s"',;]+)/gi,
  /token["':\s]+([^\s"',;]+)/gi
];

export class Logger {
  /**
   * @param {object} [options={}]
   * @param {string} [options.level='INFO'] Minimum log level
   * @param {string} [options.logDir='logs'] Directory for log files
   * @param {string} [options.logFileName='jarvis.log'] Base log file name
   * @param {number} [options.maxFileSizeBytes=10485760] Maximum file size before rotation (10MB)
   * @param {number} [options.maxFiles=5] Maximum rotated files to keep
   * @param {boolean} [options.consoleOutput=true] Echo logs to stdout/stderr
   * @param {boolean} [options.privacyMasking=true] Redact sensitive credentials
   */
  constructor(options = {}) {
    this.level = this._parseLevel(options.level || 'INFO');
    this.logDir = path.resolve(process.cwd(), options.logDir || 'logs');
    this.logFileName = options.logFileName || 'jarvis.log';
    this.logFilePath = path.join(this.logDir, this.logFileName);
    this.maxFileSizeBytes = options.maxFileSizeBytes || 10 * 1024 * 1024; // 10MB
    this.maxFiles = options.maxFiles || 5;
    this.consoleOutput = options.consoleOutput ?? true;
    this.privacyMasking = options.privacyMasking ?? true;

    this._ensureLogDir();
  }

  /**
   * Parse log level string to numeric value
   * @private
   */
  _parseLevel(levelStr) {
    if (typeof levelStr === 'number') return levelStr;
    const upper = (levelStr || 'INFO').toUpperCase();
    return LOG_LEVELS[upper] !== undefined ? LOG_LEVELS[upper] : LOG_LEVELS.INFO;
  }

  /**
   * Ensure destination log directory exists
   * @private
   */
  _ensureLogDir() {
    try {
      if (!fs.existsSync(this.logDir)) {
        fs.mkdirSync(this.logDir, { recursive: true });
      }
    } catch (err) {
      console.error(`[Logger] Failed to create log directory: ${err.message}`);
    }
  }

  /**
   * Redact sensitive credentials from text or object
   * @param {*} input 
   * @returns {*}
   */
  maskPrivacy(input) {
    if (!this.privacyMasking || !input) return input;

    if (typeof input === 'string') {
      let masked = input;
      for (const pattern of PRIVACY_PATTERNS) {
        masked = masked.replace(pattern, (match, val) => match.replace(val, '[REDACTED]'));
      }
      return masked;
    }

    if (typeof input === 'object') {
      try {
        const str = JSON.stringify(input);
        let masked = str;
        for (const pattern of PRIVACY_PATTERNS) {
          masked = masked.replace(pattern, (match, val) => match.replace(val, '[REDACTED]'));
        }
        return JSON.parse(masked);
      } catch {
        return input;
      }
    }

    return input;
  }

  /**
   * Check if file exceeds max size and rotate if necessary (Requirement 14.6)
   * @private
   */
  _checkRotation() {
    try {
      if (!fs.existsSync(this.logFilePath)) return;

      const stats = fs.statSync(this.logFilePath);
      if (stats.size >= this.maxFileSizeBytes) {
        this.rotate();
      }
    } catch (err) {
      console.error(`[Logger] Rotation check error: ${err.message}`);
    }
  }

  /**
   * Rotate log files: jarvis.log -> jarvis.1.log -> jarvis.2.log ...
   */
  rotate() {
    try {
      if (!fs.existsSync(this.logFilePath)) return;

      // Rotate existing backups downwards from maxFiles
      for (let i = this.maxFiles - 1; i >= 1; i--) {
        const oldFile = path.join(this.logDir, `${this.logFileName}.${i}`);
        const nextFile = path.join(this.logDir, `${this.logFileName}.${i + 1}`);

        if (fs.existsSync(oldFile)) {
          if (i + 1 > this.maxFiles) {
            fs.unlinkSync(oldFile); // Prune oldest
          } else {
            fs.renameSync(oldFile, nextFile);
          }
        }
      }

      // Move active log to .1
      const firstBackup = path.join(this.logDir, `${this.logFileName}.1`);
      fs.renameSync(this.logFilePath, firstBackup);
    } catch (err) {
      console.error(`[Logger] Failed to rotate log files: ${err.message}`);
    }
  }

  /**
   * Write structured log record
   * @param {number} levelNum Numeric log level
   * @param {string} message Log message
   * @param {object} [meta] Metadata object
   */
  log(levelNum, message, meta = {}) {
    if (levelNum < this.level) return;

    const levelStr = LEVEL_NAMES[levelNum] || 'INFO';
    const timestamp = new Date().toISOString();

    const record = {
      timestamp,
      level: levelStr,
      message: this.maskPrivacy(message)
    };

    if (meta && Object.keys(meta).length > 0) {
      record.meta = this.maskPrivacy(meta);
    }

    // Format error stack if error passed
    if (meta instanceof Error) {
      record.error = {
        name: meta.name,
        message: meta.message,
        stack: meta.stack
      };
    } else if (meta.error instanceof Error) {
      record.error = {
        name: meta.error.name,
        message: meta.error.message,
        stack: meta.error.stack
      };
    }

    const logLine = JSON.stringify(record) + '\n';

    // 1. Write to log file with rotation check
    try {
      this._checkRotation();
      fs.appendFileSync(this.logFilePath, logLine, 'utf8');
    } catch (err) {
      console.error(`[Logger] Failed to write to log file: ${err.message}`);
    }

    // 2. Output to console if enabled
    if (this.consoleOutput) {
      const consoleMsg = `[${timestamp}] [${levelStr}] ${record.message}`;
      if (levelNum >= LOG_LEVELS.ERROR) {
        console.error(consoleMsg);
        if (record.error?.stack) console.error(record.error.stack);
      } else if (levelNum === LOG_LEVELS.WARN) {
        console.warn(consoleMsg);
      } else {
        console.log(consoleMsg);
      }
    }
  }

  debug(message, meta) {
    this.log(LOG_LEVELS.DEBUG, message, meta);
  }

  info(message, meta) {
    this.log(LOG_LEVELS.INFO, message, meta);
  }

  warn(message, meta) {
    this.log(LOG_LEVELS.WARN, message, meta);
  }

  error(message, meta) {
    this.log(LOG_LEVELS.ERROR, message, meta);
  }

  /**
   * Specialized logger: Log user interaction turn (Requirement 14.1)
   */
  logInteraction({ sessionId, userInput, assistantResponse, latencyMs, intent, action }) {
    this.info('User interaction completed', {
      sessionId,
      userInput,
      assistantResponse,
      latencyMs,
      intent,
      action
    });
  }

  /**
   * Specialized logger: Log intent classification decision (Requirement 14.2)
   */
  logIntent({ input, intentType, confidence, source, latencyMs }) {
    this.debug('Intent classified', {
      input,
      intentType,
      confidence,
      source,
      latencyMs
    });
  }

  /**
   * Specialized logger: Log performance metrics (Requirement 14.4)
   */
  logPerformance({ operation, latencyMs, memoryMb, tokensGenerated }) {
    this.debug('Performance metrics', {
      operation,
      latencyMs,
      memoryMb: memoryMb || Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
      tokensGenerated
    });
  }

  /**
   * Set active log level dynamically (used during hot-reload)
   * @param {string} levelStr 
   */
  setLevel(levelStr) {
    this.level = this._parseLevel(levelStr);
  }
}

export default Logger;
