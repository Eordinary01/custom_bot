/**
 * JARVIS Conversational AI - Configuration Manager
 * 
 * Manages system configuration, schema validation, defaults, and hot-reload.
 * Emits 'change' events when config file updates on disk, allowing live tuning
 * of personality, performance, and features without restarting the process.
 * 
 * Requirements: 13.1, 13.2, 13.3, 13.4, 13.5, 13.6
 */

import fs from 'fs';
import path from 'path';
import { EventEmitter } from 'events';

/**
 * Default fallback configuration parameters
 */
export const DEFAULT_CONFIG = {
  assistant: {
    name: 'JARVIS',
    userName: 'Sir',
    systemStatus: 'All systems nominal'
  },
  personality: {
    preset: 'BALANCED',
    formality: 0.7,
    verbosity: 0.6,
    humor: 0.5,
    empathy: 0.8
  },
  performance: {
    responseTimeoutMs: 15000,
    inferenceTimeoutMs: 12000,
    maxContextTurns: 20,
    maxResponseTokens: 150
  },
  features: {
    contextMemory: true,
    longTermPersistence: true,
    actionExecution: true,
    llmFallback: true,
    privacyMasking: true
  },
  logging: {
    level: 'INFO',
    logDir: 'logs',
    logFileName: 'jarvis.log',
    maxFileSizeBytes: 10485760, // 10MB
    maxFiles: 5,
    consoleOutput: true
  },
  model: {
    modelPath: 'models/phi-3-mini-4k-q4.gguf',
    pythonServerPath: 'python/llm_server.py',
    threads: 4,
    contextWindow: 4096
  },
  security: {
    confirmDestructiveActions: true,
    destructiveActions: [
      'shutdown',
      'restart',
      'delete_file'
    ]
  }
};

/**
 * Allowed values for enum-like fields
 */
const VALID_PRESETS = new Set(['STRICT', 'BALANCED', 'CASUAL']);
const VALID_LOG_LEVELS = new Set(['DEBUG', 'INFO', 'WARN', 'ERROR']);

export class ConfigManager extends EventEmitter {
  /**
   * @param {object} [options={}]
   * @param {string} [options.configPath] Path to config JSON file
   * @param {boolean} [options.autoWatch=false] Automatically enable hot-reload watching
   */
  constructor(options = {}) {
    super();
    this.configPath = options.configPath || path.resolve(process.cwd(), 'config', 'default.json');
    this.config = JSON.parse(JSON.stringify(DEFAULT_CONFIG));
    this.watcher = null;
    this.watchDebounceTimer = null;

    this.load();

    if (options.autoWatch) {
      this.watch();
    }
  }

  /**
   * Validate config object against schema constraints
   * @param {object} cfg
   * @returns {{ valid: boolean, errors: string[] }}
   */
  static validate(cfg) {
    const errors = [];

    if (!cfg || typeof cfg !== 'object') {
      return { valid: false, errors: ['Configuration must be a non-null object'] };
    }

    // Assistant validation
    if (cfg.assistant) {
      if (typeof cfg.assistant.name !== 'string' || !cfg.assistant.name.trim()) {
        errors.push('assistant.name must be a non-empty string');
      }
      if (typeof cfg.assistant.userName !== 'string') {
        errors.push('assistant.userName must be a string');
      }
    }

    // Personality validation
    if (cfg.personality) {
      if (cfg.personality.preset && !VALID_PRESETS.has(cfg.personality.preset.toUpperCase())) {
        errors.push(`personality.preset must be one of: ${Array.from(VALID_PRESETS).join(', ')}`);
      }
      for (const param of ['formality', 'verbosity', 'humor', 'empathy']) {
        if (cfg.personality[param] !== undefined) {
          const val = cfg.personality[param];
          if (typeof val !== 'number' || val < 0.0 || val > 1.0) {
            errors.push(`personality.${param} must be a number between 0.0 and 1.0`);
          }
        }
      }
    }

    // Performance validation
    if (cfg.performance) {
      for (const param of ['responseTimeoutMs', 'inferenceTimeoutMs', 'maxContextTurns', 'maxResponseTokens']) {
        if (cfg.performance[param] !== undefined) {
          const val = cfg.performance[param];
          if (typeof val !== 'number' || val <= 0 || !Number.isFinite(val)) {
            errors.push(`performance.${param} must be a positive number`);
          }
        }
      }
    }

    // Features validation
    if (cfg.features) {
      for (const [key, val] of Object.entries(cfg.features)) {
        if (typeof val !== 'boolean') {
          errors.push(`features.${key} must be a boolean`);
        }
      }
    }

    // Logging validation
    if (cfg.logging) {
      if (cfg.logging.level && !VALID_LOG_LEVELS.has(cfg.logging.level.toUpperCase())) {
        errors.push(`logging.level must be one of: ${Array.from(VALID_LOG_LEVELS).join(', ')}`);
      }
      if (cfg.logging.maxFileSizeBytes !== undefined) {
        if (typeof cfg.logging.maxFileSizeBytes !== 'number' || cfg.logging.maxFileSizeBytes <= 0) {
          errors.push('logging.maxFileSizeBytes must be a positive number');
        }
      }
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * Deep merge source object into target object
   * @private
   */
  _deepMerge(target, source) {
    for (const key of Object.keys(source)) {
      if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
        if (!target[key] || typeof target[key] !== 'object') {
          target[key] = {};
        }
        this._deepMerge(target[key], source[key]);
      } else {
        target[key] = source[key];
      }
    }
    return target;
  }

  /**
   * Load configuration from file
   * @returns {object} Active configuration
   */
  load() {
    try {
      if (fs.existsSync(this.configPath)) {
        const raw = fs.readFileSync(this.configPath, 'utf8');
        const parsed = JSON.parse(raw);

        const validation = ConfigManager.validate(parsed);
        if (!validation.valid) {
          console.warn(`[ConfigManager] Configuration warnings: ${validation.errors.join('; ')}`);
        }

        // Merge defaults with loaded config
        const merged = JSON.parse(JSON.stringify(DEFAULT_CONFIG));
        this._deepMerge(merged, parsed);
        this.config = merged;
      } else {
        // If file does not exist, write defaults
        this.save();
      }
    } catch (err) {
      console.warn(`[ConfigManager] Failed to load ${this.configPath}: ${err.message}. Using defaults.`);
      this.config = JSON.parse(JSON.stringify(DEFAULT_CONFIG));
    }

    return this.config;
  }

  /**
   * Start watching configuration file for hot-reload
   */
  watch() {
    if (this.watcher) return;

    try {
      const configDir = path.dirname(this.configPath);
      if (!fs.existsSync(configDir)) {
        fs.mkdirSync(configDir, { recursive: true });
      }

      this.watcher = fs.watch(this.configPath, (eventType) => {
        if (eventType === 'change' || eventType === 'rename') {
          // Debounce rapid file writes
          if (this.watchDebounceTimer) {
            clearTimeout(this.watchDebounceTimer);
          }

          this.watchDebounceTimer = setTimeout(() => {
            try {
              if (fs.existsSync(this.configPath)) {
                const oldConfig = JSON.parse(JSON.stringify(this.config));
                this.load();
                this.emit('change', this.config, oldConfig);
              }
            } catch (err) {
              console.error(`[ConfigManager] Error during hot reload: ${err.message}`);
            }
          }, 150);
        }
      });
    } catch (err) {
      console.warn(`[ConfigManager] Unable to watch ${this.configPath}: ${err.message}`);
    }
  }

  /**
   * Stop watching configuration file
   */
  unwatch() {
    if (this.watcher) {
      this.watcher.close();
      this.watcher = null;
    }
    if (this.watchDebounceTimer) {
      clearTimeout(this.watchDebounceTimer);
      this.watchDebounceTimer = null;
    }
  }

  /**
   * Get a configuration value by dotted key path (e.g. 'personality.preset')
   * @param {string} keyPath
   * @param {*} [defaultValue]
   * @returns {*}
   */
  get(keyPath, defaultValue = undefined) {
    if (!keyPath || typeof keyPath !== 'string') return this.config;

    const parts = keyPath.split('.');
    let current = this.config;

    for (const part of parts) {
      if (current === null || current === undefined || typeof current !== 'object') {
        return defaultValue;
      }
      current = current[part];
    }

    return current !== undefined ? current : defaultValue;
  }

  /**
   * Set a configuration value by dotted key path and validate
   * @param {string} keyPath
   * @param {*} value
   */
  set(keyPath, value) {
    if (!keyPath || typeof keyPath !== 'string') return;

    const parts = keyPath.split('.');
    let current = this.config;

    for (let i = 0; i < parts.length - 1; i++) {
      const part = parts[i];
      if (!current[part] || typeof current[part] !== 'object') {
        current[part] = {};
      }
      current = current[part];
    }

    const lastKey = parts[parts.length - 1];
    current[lastKey] = value;

    const validation = ConfigManager.validate(this.config);
    if (!validation.valid) {
      throw new Error(`Invalid configuration: ${validation.errors.join('; ')}`);
    }

    this.emit('change', this.config);
  }

  /**
   * Save active configuration back to disk
   */
  save() {
    try {
      const configDir = path.dirname(this.configPath);
      if (!fs.existsSync(configDir)) {
        fs.mkdirSync(configDir, { recursive: true });
      }

      fs.writeFileSync(this.configPath, JSON.stringify(this.config, null, 2), 'utf8');
      return true;
    } catch (err) {
      console.error(`[ConfigManager] Failed to save config to ${this.configPath}: ${err.message}`);
      return false;
    }
  }

  /**
   * Return entire active configuration object
   * @returns {object}
   */
  getAll() {
    return JSON.parse(JSON.stringify(this.config));
  }
}

export default ConfigManager;
