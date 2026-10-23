/**
 * JARVIS Conversational AI - Speech Recognizer Subsystem
 * 
 * Manages the background speech recognition process (`scripts/speech_listener.ps1`).
 * Handles process lifecycle, line-buffered stdout streaming, confidence filtering,
 * wake-word routing, and deterministic acoustic echo suppression via stdin pause/resume.
 * 
 * Requirements: 12.1, 12.2, 12.3, 12.4
 */

import { EventEmitter } from 'events';
import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const RecognizerState = {
  STOPPED: 'stopped',
  STARTING: 'starting',
  LISTENING: 'listening',
  PAUSED: 'paused',
  ERROR: 'error'
};

export class SpeechRecognizer extends EventEmitter {
  /**
   * @param {object} [options={}]
   * @param {string} [options.scriptPath] Path to PowerShell speech listener script
   * @param {number} [options.minConfidence=0.25] Minimum confidence threshold (0.0 to 1.0)
   * @param {string[]} [options.wakeWords] Wake word phrases
   * @param {boolean} [options.autoRestart=true] Restart on unexpected process exit
   */
  constructor(options = {}) {
    super();
    this.scriptPath = options.scriptPath || path.resolve(__dirname, '../scripts/speech_listener.ps1');
    this.minConfidence = options.minConfidence ?? 0.25;
    this.wakeWords = options.wakeWords || ['hey jarvis', 'jarvis', 'hello jarvis', 'ok jarvis', 'wake up'];
    this.wakeAliases = options.wakeAliases || [
      'their job is', 'their job was', 'their job', 'the job', 'the jarvis',
      'hey service', 'hey travis', 'a service', 'hi service'
    ];
    this.autoRestart = options.autoRestart ?? false;

    this.process = null;
    this.state = RecognizerState.STOPPED;
    this.stdoutBuffer = '';
    this.stderrBuffer = '';
    this.isManuallyStopped = false;
  }

  /**
   * Current operational state of the speech recognizer
   * @returns {string}
   */
  getState() {
    return this.state;
  }

  /**
   * Check if speech recognizer is actively capturing audio
   * @returns {boolean}
   */
  isListening() {
    return this.state === RecognizerState.LISTENING;
  }

  /**
   * Start the speech recognizer child process
   * @returns {Promise<boolean>} Resolves true when engine is ready
   */
  start() {
    if (this.state === RecognizerState.LISTENING || this.state === RecognizerState.STARTING) {
      return Promise.resolve(true);
    }

    this.isManuallyStopped = false;
    this.state = RecognizerState.STARTING;

    return new Promise((resolve, reject) => {
      let resolved = false;

      const timer = setTimeout(() => {
        if (!resolved) {
          resolved = true;
          this.state = RecognizerState.ERROR;
          this.emit('error', new Error('Speech recognizer initialization timed out after 10 seconds.'));
          reject(new Error('Speech recognizer startup timeout'));
        }
      }, 10000);

      try {
        this.process = spawn('powershell.exe', [
          '-NoProfile',
          '-NonInteractive',
          '-ExecutionPolicy', 'Bypass',
          '-File', this.scriptPath
        ], {
          stdio: ['pipe', 'pipe', 'pipe'],
          windowsHide: true
        });

        this.process.stdout.on('data', (chunk) => {
          this.stdoutBuffer += chunk.toString();
          const lines = this.stdoutBuffer.split(/\r?\n/);
          this.stdoutBuffer = lines.pop(); // Retain incomplete trailing line

          for (const line of lines) {
            this._handleStdoutLine(line, () => {
              if (!resolved) {
                resolved = true;
                clearTimeout(timer);
                resolve(true);
              }
            });
          }
        });

        this.process.stderr.on('data', (chunk) => {
          const errStr = chunk.toString();
          // Filter out CLIXML noise from PowerShell
          if (!errStr.includes('CLIXML')) {
            this.stderrBuffer += errStr;
            this.emit('warning', errStr.trim());
          }
        });

        this.process.on('close', (code) => {
          clearTimeout(timer);
          const wasListening = this.state === RecognizerState.LISTENING || this.state === RecognizerState.PAUSED;
          this.state = RecognizerState.STOPPED;
          this.process = null;
          this.emit('exit', { code, manuallyStopped: this.isManuallyStopped });

          if (!resolved) {
            resolved = true;
            reject(new Error(`Speech recognizer exited during startup with code ${code}. Stderr: ${this.stderrBuffer}`));
          } else if (!this.isManuallyStopped && wasListening && this.autoRestart) {
            // Auto-recovery
            this.emit('restarting');
            setTimeout(() => {
              if (!this.isManuallyStopped) {
                this.start().catch(() => {});
              }
            }, 1000);
          }
        });

        this.process.on('error', (err) => {
          clearTimeout(timer);
          this.state = RecognizerState.ERROR;
          this.emit('error', err);
          if (!resolved) {
            resolved = true;
            reject(err);
          }
        });
      } catch (err) {
        clearTimeout(timer);
        this.state = RecognizerState.ERROR;
        this.emit('error', err);
        reject(err);
      }
    });
  }

  /**
   * Process a single line emitted from the PowerShell script stdout
   * @private
   */
  _handleStdoutLine(line, onReadyCallback) {
    const trimmed = line.trim();
    if (!trimmed) return;

    // Emit raw line for diagnostic logging
    this.emit('rawOutput', trimmed);

    if (trimmed.startsWith('READY:')) {
      this.state = RecognizerState.LISTENING;
      this.emit('ready', { message: trimmed.substring(6).trim() });
      if (typeof onReadyCallback === 'function') {
        onReadyCallback();
      }
      return;
    }

    if (trimmed.startsWith('INFO:')) {
      this.emit('info', { message: trimmed.substring(5).trim() });
      return;
    }

    if (trimmed.startsWith('STATUS:')) {
      const status = trimmed.substring(7).trim();
      if (status === 'PAUSED') {
        this.state = RecognizerState.PAUSED;
      } else if (status === 'RESUMED') {
        this.state = RecognizerState.LISTENING;
      }
      this.emit('statusChange', { status, state: this.state });
      return;
    }

    if (trimmed.startsWith('AUDIO_LEVEL:')) {
      const level = parseInt(trimmed.substring(12).trim(), 10) || 0;
      this.emit('audioLevel', { level });
      return;
    }

    if (trimmed.startsWith('DETECTED:')) {
      // Speech audio activity detected by the microphone
      this.emit('speechDetected', { raw: trimmed.substring(9).trim() });
      return;
    }

    if (trimmed.startsWith('HYPOTHESIS:')) {
      // Interim partial recognition result
      const parts = trimmed.substring(11).split('|');
      const text = (parts[0] || '').trim();
      let confidence = 0;
      for (let i = 1; i < parts.length; i++) {
        const [k, v] = parts[i].split(':');
        if (k && v && k.trim().toUpperCase() === 'CONFIDENCE') {
          confidence = parseFloat(v.trim()) || 0;
        }
      }
      this.emit('hypothesis', { text, confidence });
      return;
    }

    if (trimmed.startsWith('REJECTED:')) {
      // Audio was heard but not matched by any grammar
      const confMatch = trimmed.match(/Confidence[=:](\S+)/i);
      const confidence = confMatch ? parseFloat(confMatch[1]) || 0 : 0;
      this.emit('rejected', { confidence, raw: trimmed.substring(9).trim() });
      return;
    }

    if (trimmed.startsWith('RECOGNIZED:')) {
      const parts = trimmed.substring(11).split('|');
      const text = (parts[0] || '').trim();
      let confidence = 1.0;
      let grammar = 'Dictation';

      for (let i = 1; i < parts.length; i++) {
        const [k, v] = parts[i].split(':');
        if (k && v) {
          const key = k.trim().toUpperCase();
          if (key === 'CONFIDENCE') {
            confidence = parseFloat(v.trim()) || 1.0;
          } else if (key === 'GRAMMAR') {
            grammar = v.trim();
          }
        }
      }

      // Enforce confidence threshold
      if (confidence < this.minConfidence) {
        this.emit('lowConfidence', { text, confidence, minConfidence: this.minConfidence });
        return;
      }

      // Check if text triggers wake word
      const wakeMatch = this._checkWakeWord(text);
      if (wakeMatch) {
        this.emit('wakeWord', {
          wakeWord: wakeMatch.wakeWord,
          raw: text,
          commandText: wakeMatch.commandText,
          confidence,
          grammar
        });
      }

      // Always emit recognized utterance
      this.emit('recognized', {
        text,
        confidence,
        grammar,
        isWakeWord: !!wakeMatch,
        commandText: wakeMatch ? wakeMatch.commandText : text
      });
    }
  }

  /**
   * Check if recognized text contains or begins with a configured wake word
   * @private
   */
  _checkWakeWord(text) {
    if (!text || typeof text !== 'string') return null;
    const lower = text.toLowerCase().trim();

    for (const w of this.wakeWords) {
      const pattern = new RegExp(`(^|\\b)${w}(\\b|$)`, 'i');
      if (pattern.test(lower)) {
        const commandText = lower.replace(pattern, '').replace(/^[,\s]+/, '').trim();
        return { wakeWord: w, commandText, isStandalone: (commandText.length === 0) };
      }
    }

    // Check phonetic acoustic mishearings under fan/ambient noise
    for (const alias of this.wakeAliases) {
      const pattern = new RegExp(`(^|\\b)${alias}(\\b|$)`, 'i');
      if (pattern.test(lower)) {
        const commandText = lower.replace(pattern, '').replace(/^[,\s]+/, '').trim();
        return { wakeWord: 'hey jarvis', commandText, isStandalone: (commandText.length === 0) };
      }
    }
    return null;
  }

  /**
   * Pause speech recognition (used during TTS speech to prevent acoustic echo loops)
   */
  pause() {
    if (this.state !== RecognizerState.LISTENING || !this.process || !this.process.stdin) {
      return false;
    }
    try {
      this.process.stdin.write('PAUSE\n');
      this.state = RecognizerState.PAUSED;
      this.emit('paused');
      return true;
    } catch (_) {
      return false;
    }
  }

  /**
   * Resume speech recognition after TTS speech finishes
   */
  resume() {
    if (this.state !== RecognizerState.PAUSED || !this.process || !this.process.stdin) {
      return false;
    }
    try {
      this.process.stdin.write('RESUME\n');
      this.state = RecognizerState.LISTENING;
      this.emit('resumed');
      return true;
    } catch (_) {
      return false;
    }
  }

  /**
   * Gracefully stop the speech recognizer child process
   * @returns {Promise<void>}
   */
  stop() {
    this.isManuallyStopped = true;
    this.state = RecognizerState.STOPPED;

    if (!this.process) {
      return Promise.resolve();
    }

    return new Promise((resolve) => {
      const proc = this.process;
      this.process = null;

      let killTimeout = setTimeout(() => {
        try {
          proc.kill('SIGKILL');
        } catch (_) {}
        resolve();
      }, 1500);

      proc.once('close', () => {
        clearTimeout(killTimeout);
        resolve();
      });

      try {
        if (proc.stdin && proc.stdin.writable) {
          proc.stdin.write('STOP\n');
          proc.stdin.end();
        } else {
          proc.kill();
        }
      } catch (_) {
        try { proc.kill(); } catch (__) {}
        clearTimeout(killTimeout);
        resolve();
      }
    });
  }
}

export default SpeechRecognizer;
