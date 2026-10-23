/**
 * JARVIS Conversational AI — Faster-Whisper Bridge
 * 
 * Invokes the local neural Faster-Whisper service (python/whisper_service.py)
 * to transcribe audio recordings with high accuracy (95%+) and ambient fan noise rejection.
 */

import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const pythonPath = path.resolve(__dirname, '../venv/Scripts/python.exe');
const serviceScript = path.resolve(__dirname, '../python/whisper_service.py');

export class WhisperBridge {
  constructor(options = {}) {
    this.pythonPath = options.pythonPath || pythonPath;
    this.serviceScript = options.serviceScript || serviceScript;
  }

  /**
   * Transcribe an audio file on disk
   * @param {string} filePath Path to audio file (wav, webm, mp3, etc.)
   * @returns {Promise<{text: string, language?: string, latency_ms?: number, error?: string}>}
   */
  transcribeFile(filePath) {
    return new Promise((resolve) => {
      const proc = spawn(this.pythonPath, [this.serviceScript, filePath], {
        windowsHide: true
      });

      let stdout = '';
      let stderr = '';

      proc.stdout.on('data', (chunk) => {
        stdout += chunk.toString();
      });

      proc.stderr.on('data', (chunk) => {
        stderr += chunk.toString();
      });

      proc.on('close', (code) => {
        if (code === 0 && stdout.trim()) {
          try {
            const data = JSON.parse(stdout.trim());
            resolve(data);
          } catch (_) {
            resolve({ text: stdout.trim(), latency_ms: 0 });
          }
        } else {
          resolve({ text: '', error: stderr || `Process exited with code ${code}` });
        }
      });

      proc.on('error', (err) => {
        resolve({ text: '', error: err.message });
      });
    });
  }

  /**
   * Transcribe an audio Buffer (from Electron renderer MediaRecorder)
   * @param {Buffer|Uint8Array|ArrayBuffer} buffer
   * @param {string} [extension='.webm']
   * @returns {Promise<{text: string, language?: string, latency_ms?: number, error?: string}>}
   */
  async transcribeBuffer(buffer, extension = '.webm') {
    const tempFile = path.join(os.tmpdir(), `jarvis_audio_${Date.now()}_${Math.random().toString(36).substring(7)}${extension}`);
    try {
      const data = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);
      await fs.promises.writeFile(tempFile, data);
      const result = await this.transcribeFile(tempFile);
      return result;
    } catch (err) {
      return { text: '', error: err.message };
    } finally {
      fs.unlink(tempFile, () => {});
    }
  }
}

export default WhisperBridge;
