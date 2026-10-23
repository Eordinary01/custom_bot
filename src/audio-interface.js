/**
 * JARVIS Conversational AI - Audio Interface & Voice Integration Layer
 * 
 * Provides future-proof audio abstraction, wake word detection integration points,
 * speech-to-text (STT) ingestion, sentence-chunked streamed TTS synthesis,
 * sensitive fact speech gating, and persona-to-voice mapping.
 * 
 * Requirements: 12.1, 12.2, 12.3, 12.4, 12.5, 12.6
 */

import { EventEmitter } from 'events';
import { spawn } from 'child_process';
import { SpeechRecognizer, RecognizerState } from './speech-recognizer.js';

/**
 * Voice Interaction States
 */
export const AudioState = {
  IDLE: 'idle',                 // Waiting for wake word or input
  LISTENING: 'listening',       // Actively capturing microphone audio
  PROCESSING: 'processing',     // Transcribing or running JARVIS reasoning
  SPEAKING: 'speaking'          // Vocalizing assistant response via TTS
};

/**
 * Clean and format assistant responses for natural Text-To-Speech (TTS) vocalization.
 * Enforces conciseness (<200 words), removes markdown/code blocks, and expands symbols.
 * 
 * @param {string} text Raw text output from JARVIS
 * @param {number} [maxWords=150] Max spoken word limit (Requirement 12.2: <200 words)
 * @returns {string} TTS-optimized natural speech string
 */
export function prepareForTTS(text, maxWords = 150) {
  if (!text || typeof text !== 'string') return '';

  let speech = text;

  // 1. Remove code blocks (```...```)
  speech = speech.replace(/```[\s\S]*?```/g, ' Code snippet omitted for speech. ');

  // 2. Remove inline code (`...`)
  speech = speech.replace(/`([^`]+)`/g, '$1');

  // 3. Remove markdown links -> keep anchor label only
  speech = speech.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');

  // 4. Remove markdown headers, bold, italics, bullet points
  speech = speech.replace(/^#{1,6}\s+/gm, '')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/^[ \t]*[-*•]\s+/gm, '')
    .replace(/[_~]/g, '');

  // 5. Clean remaining standalone URLs and file paths
  speech = speech.replace(/https?:\/\/\S+/g, 'link');
  speech = speech.replace(/[a-zA-Z]:\\[\w\\.-]+/g, 'local file path');

  // 6. Expand abbreviations for natural speech
  speech = speech.replace(/\bvs\b/gi, 'versus')
    .replace(/\bcalc\b/gi, 'calculator')
    .replace(/\bcmd\b/gi, 'command prompt')
    .replace(/\bps\b/gi, 'PowerShell')
    .replace(/\bapp\b/gi, 'application')
    .replace(/\bpc\b/gi, 'computer');

  // 7. Normalize whitespace
  speech = speech.replace(/\s+/g, ' ').trim();

  // 8. Enforce max word limit (<200 words for voice interaction)
  const words = speech.split(/\s+/).filter(Boolean);
  if (words.length > maxWords) {
    speech = words.slice(0, maxWords).join(' ');
    // End with clean punctuation
    const lastPunct = Math.max(speech.lastIndexOf('.'), speech.lastIndexOf('!'), speech.lastIndexOf('?'));
    if (lastPunct > speech.length * 0.7) {
      speech = speech.substring(0, lastPunct + 1);
    } else {
      speech += '...';
    }
  }

  return speech;
}

/**
 * Sentence-chunked streamed speech buffer.
 * Buffers incoming LLM tokens until a sentence boundary is met, then sends
 * the chunk to the synthesizer queue to minimize Time to First Audio (TTFA).
 */
export class StreamSpeechBuffer {
  /**
   * @param {AudioInterface} audioInterface
   */
  constructor(audioInterface) {
    this.audioInterface = audioInterface;
    this.buffer = '';
    this.queue = [];
    this.isProcessingQueue = false;
    this.isFlushed = false;
    this.chunksSpoken = 0;
  }

  /**
   * Ingest a token from the LLM generator
   * @param {string} token
   */
  appendToken(token) {
    if (!token || typeof token !== 'string') return;
    this.buffer += token;

    // Check for sentence punctuation followed by space or newline
    const match = this.buffer.match(/^(.*?[.!?\n])(?:\s+|$)(.*)$/s);
    if (match) {
      const sentence = match[1].trim();
      this.buffer = match[2] || '';
      if (sentence.length > 2) {
        this.enqueueChunk(sentence);
      }
    }
  }

  /**
   * Enqueue a sentence chunk for speech synthesis
   * @param {string} text
   */
  enqueueChunk(text) {
    this.queue.push(text);
    this._processQueue();
  }

  /**
   * Flush any remaining text in the buffer when stream ends
   */
  async flush() {
    if (this.buffer.trim().length > 0) {
      this.enqueueChunk(this.buffer.trim());
      this.buffer = '';
    }
    this.isFlushed = true;
    await this._processQueue();
  }

  /**
   * Sequentially synthesize each chunk in the queue
   * @private
   */
  async _processQueue() {
    if (this.isProcessingQueue) return;
    this.isProcessingQueue = true;

    while (this.queue.length > 0) {
      const chunk = this.queue.shift();
      if (this.audioInterface && typeof this.audioInterface.speakChunkAsync === 'function') {
        try {
          const res = await this.audioInterface.speakChunkAsync(chunk);
          if (res) this.chunksSpoken++;
        } catch (_) {}
      }
    }

    this.isProcessingQueue = false;
  }
}

/**
 * AudioInterface coordinates audio input/output, wake word hooks,
 * sentence-chunked streaming TTS, and speech synthesis events for JARVIS.
 */
export class AudioInterface extends EventEmitter {
  /**
   * @param {object} [options={}]
   * @param {string} [options.wakeWord='hey jarvis'] Wake word phrase
   * @param {number} [options.maxTtsWords=150] Max words for speech output
   * @param {boolean} [options.enabled=true] Enable audio subsystem
   * @param {boolean} [options.voiceOutput=false] Enable TTS output
   * @param {string} [options.voiceName='Microsoft David Desktop'] Voice identifier
   * @param {number} [options.voiceRate=1] Voice synthesis rate (-10 to 10)
   */
  constructor(options = {}) {
    super();
    this.wakeWord = (options.wakeWord || 'hey jarvis').toLowerCase();
    this.maxTtsWords = options.maxTtsWords || 150;
    this.enabled = options.enabled ?? true;
    this.voiceOutput = options.voiceOutput ?? false;
    this.voiceName = options.voiceName || 'Microsoft David Desktop';
    this.voiceRate = options.voiceRate ?? 1;
    this.state = AudioState.IDLE;
    this.lastTranscribedText = null;
    this.lastVocalizedText = null;
    this.speechRecognizer = options.speechRecognizer || null;
    this.listenMode = options.listenMode || 'wake_word';
    this.minConfidence = options.minConfidence ?? 0.25;

    // Wake word patterns
    this.wakeWordRegex = new RegExp(`(^|\\b)(${this.wakeWord}|jarvis)(\\b|$)`, 'i');
  }

  /**
   * Set operational audio state and emit change event
   * @param {string} newState
   */
  setState(newState) {
    const oldState = this.state;
    this.state = newState;
    this.emit('stateChange', { oldState, newState });

    // Acoustic Echo & Resource Protection: Deterministically pause microphone when speaking or processing
    if ((newState === AudioState.SPEAKING || newState === AudioState.PROCESSING) && this.speechRecognizer && typeof this.speechRecognizer.pause === 'function') {
      if (this.speechRecognizer.state !== RecognizerState.PAUSED) {
        this.speechRecognizer.pause();
      }
    }
  }

  /**
   * Check if text contains sensitive data (passwords, tokens, credentials)
   * that must be shielded from voice audio output.
   * @param {string} text
   * @returns {boolean}
   */
  isSensitive(text) {
    if (!text || typeof text !== 'string') return false;
    return /\[CONFIDENTIAL\/SENSITIVE\]|\b(?:password|passwd|pin|secret|api[_\s-]?key|auth[_\s-]?token|private[_\s-]?key|credit\s*card|ssn)\b/i.test(text);
  }

  /**
   * Dynamically tune voice rate and style based on active persona
   * @param {string} persona 'strict' | 'balanced' | 'casual' | 'buddy'
   */
  setPersona(persona) {
    if (!persona) return;
    const p = String(persona).toLowerCase();
    if (p === 'strict') {
      this.voiceRate = 1;
    } else if (p === 'buddy') {
      this.voiceRate = 2; // Lively, energetic pace for companion
    } else if (p === 'casual') {
      this.voiceRate = 1;
    } else {
      this.voiceRate = 1;
    }
  }

  /**
   * Ingest audio stream / text from external Speech-to-Text (STT) engine
   * Prevents barge-in / echo loops by ignoring microphone inputs while speaking.
   * 
   * @param {string} transcript Transcribed speech text
   * @returns {{isWakeWord: boolean, commandText: string}}
   */
  handleSpeechInput(transcript) {
    if (!this.enabled || !transcript || typeof transcript !== 'string') {
      return { isWakeWord: false, commandText: '' };
    }

    // Acoustic Echo Protection: Ignore microphone input if assistant is actively vocalizing
    if (this.state === AudioState.SPEAKING) {
      return { isWakeWord: false, commandText: '' };
    }

    const trimmed = transcript.trim();
    this.lastTranscribedText = trimmed;

    // Check for wake word trigger
    if (this.wakeWordRegex.test(trimmed)) {
      this.setState(AudioState.LISTENING);
      this.emit('wakeWordDetected', { raw: trimmed, wakeWord: this.wakeWord });

      // Strip wake word from command content
      const commandText = trimmed.replace(this.wakeWordRegex, '').trim();
      const isStandaloneWakeWord = (commandText.length === 0);
      return { isWakeWord: true, commandText, isStandaloneWakeWord };
    }

    // Direct speech without wake word (active conversation turn)
    if (this.state === AudioState.LISTENING) {
      return { isWakeWord: false, commandText: trimmed, isStandaloneWakeWord: false };
    }

    return { isWakeWord: false, commandText: trimmed, isStandaloneWakeWord: false };
  }

  /**
   * Format text, enforce sensitive data gating, and vocalize through Text-to-Speech (TTS)
   * 
   * @param {string} rawResponse Response text from JARVIS
   * @returns {string} Cleaned TTS speech text that was emitted
   */
  speak(rawResponse) {
    if (!this.enabled || !rawResponse) return '';

    let textToVocalize = rawResponse;

    // Sensitive Data Gate: Shield sensitive facts from audio output
    if (this.isSensitive(textToVocalize)) {
      textToVocalize = textToVocalize.replace(/\[CONFIDENTIAL\/SENSITIVE\]/g, 'Confidential data displayed on screen.');
      textToVocalize = textToVocalize.replace(/(?:password|pin|secret|api[_\s-]?key|token)\s*(?:is|:|=)\s*\S+/gi, 'Credentials displayed on screen.');
    }

    const speechText = prepareForTTS(textToVocalize, this.maxTtsWords);
    this.lastVocalizedText = speechText;

    this.setState(AudioState.SPEAKING);
    this.emit('speak', {
      text: speechText,
      wordCount: speechText.split(/\s+/).length
    });

    if (this.voiceOutput && speechText.length > 0) {
      this._synthesize(speechText);
    }

    return speechText;
  }

  /**
   * Asynchronously synthesize speech for complete response text, resolving when playback finishes
   * @param {string} rawResponse
   * @returns {Promise<string>}
   */
  speakAsync(rawResponse) {
    return new Promise((resolve) => {
      if (!this.enabled || !rawResponse) return resolve('');

      let textToVocalize = rawResponse;

      // Sensitive Data Gate: Shield sensitive facts from audio output
      if (this.isSensitive(textToVocalize)) {
        textToVocalize = textToVocalize.replace(/\[CONFIDENTIAL\/SENSITIVE\]/g, 'Confidential data displayed on screen.');
        textToVocalize = textToVocalize.replace(/(?:password|pin|secret|api[_\s-]?key|token)\s*(?:is|:|=)\s*\S+/gi, 'Credentials displayed on screen.');
      }

      const speechText = prepareForTTS(textToVocalize, this.maxTtsWords);
      this.lastVocalizedText = speechText;

      this.setState(AudioState.SPEAKING);
      this.emit('speak', {
        text: speechText,
        wordCount: speechText.split(/\s+/).length
      });

      if (this.voiceOutput && speechText.length > 0) {
        this._synthesize(speechText, (err) => {
          resolve(speechText);
        });
      } else {
        this.notifyPlaybackFinished();
        resolve(speechText);
      }
    });
  }

  /**
   * Asynchronously synthesize a single sentence chunk (used by StreamSpeechBuffer)
   * @param {string} rawChunk
   * @returns {Promise<string>}
   */
  speakChunkAsync(rawChunk) {
    return new Promise((resolve) => {
      if (!this.enabled || !rawChunk) {
        return resolve('');
      }

      // Sensitive Data Gate
      if (this.isSensitive(rawChunk)) {
        return resolve('');
      }

      const speechText = prepareForTTS(rawChunk, this.maxTtsWords);
      if (!speechText) return resolve('');

      this.setState(AudioState.SPEAKING);
      this.emit('speak', {
        text: speechText,
        wordCount: speechText.split(/\s+/).length,
        isChunk: true
      });

      if (this.voiceOutput) {
        this._synthesize(speechText, () => {
          resolve(speechText);
        });
      } else {
        this.notifyPlaybackFinished();
        resolve(speechText);
      }
    });
  }

  /**
   * Vocalize clean text via Windows native SAPI SpeechSynthesizer
   * @private
   */
  _synthesize(text, callback = null, isRetry = false) {
    try {
      const cleanText = text.replace(/"/g, "'");
      const voice = this.voiceName || 'Microsoft David Desktop';
      const rate = this.voiceRate ?? 1;
      // On retry, don't pin voice pack in case selected voice is missing from Windows
      const voiceClause = isRetry ? '' : `try { $synth.SelectVoice('${voice}'); } catch {};`;
      const script = `Add-Type -AssemblyName System.Speech; $synth = New-Object System.Speech.Synthesis.SpeechSynthesizer; ${voiceClause} $synth.Rate = ${rate}; $synth.Speak("${cleanText}");`;
      const encoded = Buffer.from(script, 'utf16le').toString('base64');

      const child = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-EncodedCommand', encoded], {
        windowsHide: true,
        stdio: ['ignore', 'ignore', 'pipe']
      });

      this.currentSynthProcess = child;

      let stderr = '';
      if (child.stderr) {
        child.stderr.on('data', chunk => {
          stderr += chunk.toString();
        });
      }

      child.on('close', (code) => {
        if (this.currentSynthProcess === child) {
          this.currentSynthProcess = null;
        }
        if (code !== 0 && stderr && !stderr.includes('CLIXML')) {
          console.warn(`[AudioInterface] SAPI synthesis exit code ${code}:`, stderr.trim());
          if (!isRetry) {
            console.warn('[AudioInterface] Retrying SAPI synthesis with default system voice...');
            return this._synthesize(text, callback, true);
          } else {
            this._signalAudioError('Speech synthesis failed');
            this.emit('synthesisFailed', { error: stderr.trim() });
          }
        }
        if (callback) callback();
        this.notifyPlaybackFinished();
      });

      child.on('error', (err) => {
        if (this.currentSynthProcess === child) {
          this.currentSynthProcess = null;
        }
        console.warn(`[AudioInterface] Failed to spawn SAPI synthesis:`, err.message);
        if (!isRetry) {
          return this._synthesize(text, callback, true);
        } else {
          this._signalAudioError(err.message);
          this.emit('synthesisFailed', { error: err.message });
        }
        if (callback) callback(err);
        this.notifyPlaybackFinished();
      });
    } catch (err) {
      this.currentSynthProcess = null;
      console.warn(`[AudioInterface] SAPI invocation exception:`, err.message);
      this._signalAudioError(err.message);
      this.emit('synthesisFailed', { error: err.message });
      if (callback) callback(err);
      this.notifyPlaybackFinished();
    }
  }

  /**
   * Immediately abort any active speech synthesis and return to IDLE
   */
  stopSpeaking() {
    if (this.currentSynthProcess) {
      try {
        this.currentSynthProcess.kill('SIGTERM');
      } catch (_) {}
      this.currentSynthProcess = null;
    }
    this.notifyPlaybackFinished();
  }

  /**
   * Produce an audible alert tone when voice synthesis encounters a critical failure
   * @private
   */
  _signalAudioError(reason) {
    try {
      spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-c', '[Console]::Beep(800, 200)'], {
        windowsHide: true,
        stdio: 'ignore'
      });
    } catch (_) {}
  }

  /**
   * Signal completion of TTS audio playback
   */
  notifyPlaybackFinished() {
    this.setState(AudioState.IDLE);
    // Acoustic Echo Protection: Deterministically resume microphone when playback finishes
    if (this.speechRecognizer && typeof this.speechRecognizer.resume === 'function') {
      this.speechRecognizer.resume();
    }
    this.emit('playbackFinished');
  }

  /**
   * Start live background speech recognition (mic capture via PowerShell)
   * @param {object} [options={}]
   * @returns {Promise<boolean>}
   */
  async startListening(options = {}) {
    if (!this.enabled) return false;

    if (!this.speechRecognizer) {
      this.speechRecognizer = new SpeechRecognizer({
        scriptPath: options.scriptPath,
        minConfidence: options.minConfidence ?? this.minConfidence,
        wakeWords: options.wakeWords || [this.wakeWord, 'jarvis', 'wake up']
      });

      this.speechRecognizer.on('recognized', (data) => {
        this.emit('speechHeard', data.text, data);
      });

      this.speechRecognizer.on('wakeWord', (data) => {
        this.setState(AudioState.LISTENING);
        this.emit('wakeWordDetected', data);
      });

      this.speechRecognizer.on('error', (err) => {
        this.emit('audioError', err);
      });

      // Forward diagnostic events for Electron pipeline visibility
      this.speechRecognizer.on('audioLevel', (data) => {
        this.emit('audioLevel', data);
      });

      this.speechRecognizer.on('speechDetected', (data) => {
        this.emit('speechDetected', data);
      });

      this.speechRecognizer.on('hypothesis', (data) => {
        this.emit('hypothesis', data);
      });

      this.speechRecognizer.on('rejected', (data) => {
        this.emit('rejected', data);
      });

      this.speechRecognizer.on('lowConfidence', (data) => {
        this.emit('lowConfidence', data);
      });

      this.speechRecognizer.on('info', (data) => {
        this.emit('info', data);
      });

      this.speechRecognizer.on('rawOutput', (line) => {
        this.emit('rawOutput', line);
      });
    }

    try {
      await this.speechRecognizer.start();
      return true;
    } catch (err) {
      this.emit('audioError', err);
      return false;
    }
  }

  /**
   * Stop background speech recognition process
   * @returns {Promise<void>}
   */
  async stopListening() {
    if (this.speechRecognizer) {
      await this.speechRecognizer.stop();
      this.speechRecognizer = null;
    }
  }

  /**
   * Trigger Push-to-Talk (PTT) listening mode
   * Resumes recognition for a single turn if paused
   */
  triggerPtt() {
    if (!this.speechRecognizer) return false;
    this.setState(AudioState.LISTENING);
    this.speechRecognizer.resume();
    this.emit('pttTriggered');
    return true;
  }

  /**
   * Connect AudioInterface directly to a JarvisOrchestrator instance
   * @param {import('../jarvis.js').JarvisOrchestrator} jarvis
   */
  attachToOrchestrator(jarvis) {
    if (!jarvis) return;

    this.on('speechHeard', async (transcript) => {
      // Guard against nested/re-entrant processing or talking over TTS
      if (this.state === AudioState.PROCESSING || this.state === AudioState.SPEAKING) {
        return;
      }

      const { commandText } = this.handleSpeechInput(transcript);
      if (commandText) {
        this.setState(AudioState.PROCESSING);
        try {
          const result = await jarvis.process(commandText);
          if (result && result.text) {
            await this.speakAsync(result.text);
          } else {
            this.setState(AudioState.IDLE);
          }
        } catch (_) {
          this.setState(AudioState.IDLE);
        }
      }
    });

    this.on('playbackFinished', () => {
      this.setState(AudioState.IDLE);
    });
  }
}

export default AudioInterface;
