/**
 * JARVIS Conversational AI - Node.js LLM Engine Client
 * 
 * Manages the Python LLM server child process, JSON-RPC 2.0 communication over stdio,
 * request timeouts, automatic restarts on failure, and performance metrics tracking.
 * 
 * Requirements: 3.1, 3.4, 9.1, 9.3, 14.4
 */

import { spawn } from 'child_process';
import readline from 'readline';
import path from 'path';
import fs from 'fs';
import { EventEmitter } from 'events';

export class LLMEngine extends EventEmitter {
  constructor(options = {}) {
    super();
    // Resolve default python path based on OS and virtual environment
    const defaultPython = process.platform === 'win32'
      ? path.join('venv', 'Scripts', 'python.exe')
      : path.join('venv', 'bin', 'python');

    this.options = {
      pythonPath: options.pythonPath || (fs.existsSync(defaultPython) ? defaultPython : 'python'),
      serverScript: options.serverScript || path.join('python', 'llm_server.py'),
      modelPath: options.modelPath || path.join('models', 'phi-3-mini-4k-q4.gguf'),
      modelConfig: {
        n_ctx: 2048,
        n_threads: 4,
        n_gpu_layers: 0,
        verbose: false,
        ...(options.modelConfig || {})
      },
      defaultTimeout: options.defaultTimeout || 45000, // 45s for CPU inference
      maxRestarts: options.maxRestarts ?? 3,
      restartBackoffMs: options.restartBackoffMs || 1000,
      autoRestart: options.autoRestart ?? true,
      logStderr: options.logStderr ?? false,
      ...options
    };

    this.process = null;
    this.rl = null;
    this.isReady = false;
    this.isStopping = false;
    this.restartCount = 0;
    this.requestId = 0;
    this.pendingRequests = new Map();
    this.queue = [];
    this.isProcessingQueue = false;

    // Stored model load state for auto-reloading after restart
    this.loadedModelPath = null;
    this.loadedModelConfig = null;

    // Performance metrics
    this.metrics = {
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      totalTokens: 0,
      totalInferenceTimeMs: 0,
      lastInferenceTimeMs: 0,
      lastTokensGenerated: 0,
      avgInferenceTimeMs: 0,
      avgTokensPerSec: 0,
      restarts: 0,
      startedAt: null
    };
  }

  /**
   * Start the Python LLM server subprocess and wait for readiness.
   * @param {number} timeoutMs Maximum wait time for server ready signal
   * @returns {Promise<void>}
   */
  start(timeoutMs = 15000) {
    if (this.process && this.isReady) {
      return Promise.resolve();
    }

    this.isStopping = false;

    return new Promise((resolve, reject) => {
      let startupTimer = null;

      try {
        const pythonExecutable = this.options.pythonPath;
        const scriptPath = this.options.serverScript;

        this.process = spawn(pythonExecutable, [scriptPath], {
          stdio: ['pipe', 'pipe', 'pipe'],
          env: {
            ...process.env,
            PYTHONIOENCODING: 'utf-8',
            PYTHONUNBUFFERED: '1'
          }
        });

        this.metrics.startedAt = new Date().toISOString();

        this.rl = readline.createInterface({
          input: this.process.stdout,
          crlfDelay: Infinity
        });

        const onReady = () => {
          if (startupTimer) clearTimeout(startupTimer);
          this.isReady = true;
          this.restartCount = 0; // Reset restart counter on successful startup
          this._processNextInQueue();
          resolve();
        };

        startupTimer = setTimeout(() => {
          if (!this.isReady) {
            reject(new Error(`LLM server failed to start within ${timeoutMs}ms`));
          }
        }, timeoutMs);

        // Readline event handler for stdout lines from Python server
        this.rl.on('line', (line) => {
          const trimmed = line.trim();
          if (!trimmed) return;

          if (trimmed === 'LLM_SERVER_READY') {
            onReady();
            return;
          }

          try {
            const response = JSON.parse(trimmed);
            this._handleRpcResponse(response);
          } catch (err) {
            // Ignore non-JSON lines or pass through
          }
        });

        // Stderr handler
        this.process.stderr.on('data', (data) => {
          const message = data.toString();
          if (this.options.logStderr) {
            console.error('[LLMServer stderr]', message.trim());
          }
        });

        // Error handler
        this.process.on('error', (err) => {
          if (startupTimer) clearTimeout(startupTimer);
          reject(new Error(`Failed to spawn LLM server process: ${err.message}`));
        });

        // Exit handler
        this.process.on('exit', (code, signal) => {
          this._handleProcessExit(code, signal);
        });

      } catch (err) {
        if (startupTimer) clearTimeout(startupTimer);
        reject(err);
      }
    });
  }

  /**
   * Handle JSON-RPC response from Python server.
   * @private
   */
  _handleRpcResponse(response) {
    // Handle streaming token notification
    if (response.method === 'token' && response.params) {
      const { id, token } = response.params;
      if (id !== undefined && this.pendingRequests.has(id)) {
        const pending = this.pendingRequests.get(id);
        if (typeof pending.onToken === 'function') {
          try {
            pending.onToken(token);
          } catch (_) {}
        }
        this.emit('token', { id, token });
      }
      return;
    }

    const { id, result, error } = response;
    if (id === undefined || !this.pendingRequests.has(id)) {
      return;
    }

    const pending = this.pendingRequests.get(id);
    this.pendingRequests.delete(id);

    if (pending.timer) {
      clearTimeout(pending.timer);
    }

    const duration = Date.now() - pending.startTime;

    if (error) {
      this.metrics.failedRequests++;
      pending.reject(new Error(error.message || `RPC Error (${error.code})`));
    } else {
      this.metrics.successfulRequests++;
      // Update metrics if generate response
      if (pending.method === 'generate' && result && result.success) {
        const tokens = result.tokens_generated || 0;
        const infTime = result.inference_time_ms || duration;
        this.metrics.totalTokens += tokens;
        this.metrics.totalInferenceTimeMs += infTime;
        this.metrics.lastInferenceTimeMs = infTime;
        this.metrics.lastTokensGenerated = tokens;

        if (this.metrics.successfulRequests > 0) {
          this.metrics.avgInferenceTimeMs = Math.round(
            this.metrics.totalInferenceTimeMs / this.metrics.successfulRequests
          );
        }
        if (this.metrics.totalInferenceTimeMs > 0) {
          this.metrics.avgTokensPerSec = +(
            (this.metrics.totalTokens / (this.metrics.totalInferenceTimeMs / 1000))
          ).toFixed(2);
        }
      }

      pending.resolve(result);
    }

    // Process next queued request if any
    this._processNextInQueue();
  }

  /**
   * Handle unexpected process exit and trigger auto-restart.
   * @private
   */
  async _handleProcessExit(code, signal) {
    this.isReady = false;

    // Reject all currently pending requests
    for (const [id, pending] of this.pendingRequests.entries()) {
      if (pending.timer) clearTimeout(pending.timer);
      pending.reject(new Error(`LLM server process exited with code ${code}, signal ${signal}`));
    }
    this.pendingRequests.clear();

    if (this.isStopping) {
      return;
    }

    this.metrics.restarts++;

    if (this.options.autoRestart && this.restartCount < this.options.maxRestarts) {
      this.restartCount++;
      const delay = this.options.restartBackoffMs * this.restartCount;
      console.warn(`LLM server exited unexpectedly (code ${code}). Restarting in ${delay}ms (attempt ${this.restartCount}/${this.options.maxRestarts})...`);

      await new Promise((r) => setTimeout(r, delay));

      try {
        await this.start();
        // If a model was loaded before the crash, reload it automatically
        if (this.loadedModelPath) {
          console.warn(`Reloading model after restart: ${this.loadedModelPath}`);
          await this.loadModel(this.loadedModelPath, this.loadedModelConfig);
        }
        // Resume queue processing
        this._processNextInQueue();
      } catch (err) {
        console.error('Failed to restart LLM server:', err.message);
      }
    } else if (this.restartCount >= this.options.maxRestarts) {
      console.error(`LLM server reached maximum restart attempts (${this.options.maxRestarts}). Will not restart.`);
    }
  }

  /**
   * Send JSON-RPC call over stdin to Python server.
   * Requests are serialized through a FIFO queue for predictable latency.
   * @param {string} method RPC method name
   * @param {object} params RPC method parameters
   * @param {number} timeoutMs Custom timeout in milliseconds
   * @param {function} [onToken] Optional streaming token callback
   * @param {AbortSignal} [signal] Optional abort signal
   * @returns {Promise<any>}
   */
  call(method, params = {}, timeoutMs = null, onToken = null, signal = null) {
    return new Promise((resolve, reject) => {
      if (signal && signal.aborted) {
        return reject(new Error('Request aborted by caller'));
      }

      const timeout = timeoutMs || this.options.defaultTimeout;
      const id = ++this.requestId;

      if (signal) {
        signal.addEventListener('abort', () => {
          const idx = this.queue.findIndex(q => q.id === id);
          if (idx !== -1) {
            this.queue.splice(idx, 1);
          }
          this.abort(id);
          reject(new Error('Request aborted by caller'));
        }, { once: true });
      }

      const queueItem = {
        id,
        method,
        params,
        timeout,
        onToken,
        resolve,
        reject
      };

      this.queue.push(queueItem);
      this._processNextInQueue();
    });
  }

  /**
   * Actively abort an in-flight request on the Python server.
   * @param {number} id Request ID to abort
   */
  abort(id) {
    if (this.process && this.process.stdin && !this.process.stdin.destroyed) {
      try {
        const payload = JSON.stringify({
          jsonrpc: '2.0',
          method: 'abort',
          params: { id }
        }) + '\n';
        this.process.stdin.write(payload);
      } catch (_) {}
    }
  }

  /**
   * Process the next request in the FIFO queue.
   * @private
   */
  _processNextInQueue() {
    if (this.isProcessingQueue || this.queue.length === 0) {
      return;
    }

    if (!this.process || !this.isReady) {
      return;
    }

    const item = this.queue.shift();
    this.isProcessingQueue = true;
    this.metrics.totalRequests++;

    const { id, method, params, timeout, onToken, resolve, reject } = item;

    const timer = setTimeout(() => {
      if (this.pendingRequests.has(id)) {
        this.pendingRequests.delete(id);
        this.metrics.failedRequests++;
        this.isProcessingQueue = false;

        // Actively abort request on python server (Requirement 14.1)
        try {
          this.abort(id);
        } catch (_) {}

        reject(new Error(`Request ${id} (${method}) timed out after ${timeout}ms`));

        // Schedule slot watchdog to verify slot clearance / recycle if stalled
        this._scheduleSlotWatchdog();

        this._processNextInQueue();
      }
    }, timeout);

    this.pendingRequests.set(id, {
      method,
      onToken,
      startTime: Date.now(),
      timer,
      resolve: (res) => {
        this.isProcessingQueue = false;
        resolve(res);
      },
      reject: (err) => {
        this.isProcessingQueue = false;
        reject(err);
      }
    });

    const payload = JSON.stringify({
      jsonrpc: '2.0',
      method,
      params,
      id
    }) + '\n';

    try {
      this.process.stdin.write(payload);
    } catch (err) {
      clearTimeout(timer);
      this.pendingRequests.delete(id);
      this.isProcessingQueue = false;
      this.metrics.failedRequests++;
      reject(new Error(`Failed to write to LLM server stdin: ${err.message}`));
      this._processNextInQueue();
    }
  }

  /**
   * Watchdog to ensure inference slot is clear after a timeout.
   * If server is unresponsive, recycles the Python process to prevent cascading timeouts.
   * @private
   */
  _scheduleSlotWatchdog() {
    setTimeout(async () => {
      try {
        const health = await this.health(1500);
        if (!health || health.status !== 'healthy') {
          await this.recycleProcess();
        }
      } catch (_) {
        await this.recycleProcess();
      }
    }, 1000);
  }

  /**
   * Recycle stalled Python LLM process to clear stuck slot (Requirement 14.1).
   * @returns {Promise<void>}
   */
  async recycleProcess() {
    if (this.isRecycling) return;
    this.isRecycling = true;
    console.warn('[LLMEngine] Recycling LLM server process to ensure inference slot is clear...');
    try {
      const proc = this.process;
      this.process = null;
      this.isReady = false;
      if (proc) {
        try { proc.kill('SIGKILL'); } catch (_) {}
      }
      await this.start(8000);
      if (this.loadedModelPath) {
        await this.loadModel(this.loadedModelPath, this.loadedModelConfig, 15000);
      }
      this._processNextInQueue();
      console.warn('[LLMEngine] LLM server process successfully recycled. Slot is free.');
    } catch (err) {
      console.error('[LLMEngine] Error recycling LLM server:', err.message);
    } finally {
      this.isRecycling = false;
    }
  }

  /**
   * Startup liveness check (Requirement 14.1)
   * Pings the inference server before accepting user turns.
   * @param {number} timeoutMs
   * @returns {Promise<{healthy: boolean, error?: string, details?: object}>}
   */
  async checkLiveness(timeoutMs = 4000) {
    if (!this.process || !this.isReady) {
      return { healthy: false, error: 'Inference process not running or not ready' };
    }
    try {
      const res = await this.health(timeoutMs);
      return { healthy: Boolean(res && res.status === 'healthy'), details: res };
    } catch (err) {
      return { healthy: false, error: err.message };
    }
  }

  /**
   * Load a language model into memory.
   * @param {string} modelPath Absolute or relative path to GGUF model file
   * @param {object} config Configuration options (n_ctx, n_threads, n_gpu_layers, etc.)
   * @param {number} timeoutMs Maximum wait time for loading model (default 60s)
   * @returns {Promise<object>}
   */
  async loadModel(modelPath = this.options.modelPath, config = this.options.modelConfig, timeoutMs = 90000) {
    const resolvedPath = path.resolve(modelPath);
    const result = await this.call('load_model', {
      model_path: resolvedPath,
      config: config || this.options.modelConfig
    }, timeoutMs);

    if (result && result.success) {
      this.loadedModelPath = resolvedPath;
      this.loadedModelConfig = config;
    }

    return result;
  }

  /**
   * Generate text completion for a prompt.
   * @param {object} params Generation parameters
   * @param {string} params.prompt Text prompt to complete
   * @param {number} params.max_tokens Max tokens to generate (default 150)
   * @param {number} params.temperature Sampling temperature 0.0-2.0 (default 0.7)
   * @param {number} params.top_p Nucleus sampling (default 0.9)
   * @param {number} params.top_k Top-k sampling (default 40)
   * @param {string[]} params.stop Stop sequences (default [])
   * @param {number} params.repeat_penalty Repetition penalty (default 1.1)
   * @param {number} params.timeout Custom timeout in ms
   * @returns {Promise<{success: boolean, text: string, tokens_generated: number, inference_time_ms: number, finish_reason: string}>}
   */
  async generate({
    prompt,
    max_tokens = 150,
    temperature = 0.7,
    top_p = 0.9,
    top_k = 40,
    stop = [],
    repeat_penalty = 1.1,
    timeout = null,
    stream = false,
    onToken = null
  }) {
    if (typeof prompt !== 'string' || !prompt) {
      throw new Error('prompt must be a non-empty string');
    }

    const shouldStream = Boolean(stream || onToken);

    return this.call('generate', {
      prompt,
      max_tokens,
      temperature,
      top_p,
      top_k,
      stop,
      repeat_penalty,
      stream: shouldStream
    }, timeout, onToken);
  }

  /**
   * Generate text embedding (placeholder for future implementation).
   * @param {string} text Text to embed
   * @returns {Promise<object>}
   */
  async embed(text) {
    if (typeof text !== 'string' || !text) {
      throw new Error('text must be a non-empty string');
    }
    return this.call('embed', { text });
  }

  /**
   * Query server health status and performance statistics.
   * @returns {Promise<object>}
   */
  async health() {
    return this.call('health', {}, 5000);
  }

  /**
   * Get client-side performance metrics.
   * @returns {object}
   */
  getMetrics() {
    return {
      ...this.metrics,
      pendingRequests: this.pendingRequests.size,
      queuedRequests: this.queue.length,
      isReady: this.isReady
    };
  }

  /**
   * Stop the Python LLM server gracefully.
   * @returns {Promise<void>}
   */
  stop() {
    this.isStopping = true;

    // Clear all queued requests
    while (this.queue.length > 0) {
      const item = this.queue.shift();
      item.reject(new Error('LLMEngine stopped'));
    }

    // Reject all active pending requests
    for (const [id, pending] of this.pendingRequests.entries()) {
      if (pending.timer) clearTimeout(pending.timer);
      pending.reject(new Error('LLMEngine stopped'));
    }
    this.pendingRequests.clear();

    if (this.rl) {
      this.rl.close();
      this.rl = null;
    }

    if (this.process) {
      return new Promise((resolve) => {
        const proc = this.process;
        this.process = null;
        this.isReady = false;

        proc.once('exit', () => resolve());
        proc.kill(); // SIGTERM / terminate

        // Fallback force kill after 2s
        setTimeout(() => {
          try {
            proc.kill('SIGKILL');
          } catch (_) {}
          resolve();
        }, 2000);
      });
    }

    this.isReady = false;
    return Promise.resolve();
  }

  /**
   * Alias for stop().
   */
  shutdown() {
    return this.stop();
  }
}

export default LLMEngine;
