/**
 * JARVIS Conversational AI - Speech Recognition & Voice Input Integration Test Suite
 * 
 * Verifies:
 * 1. SpeechRecognizer instantiation & state machine (STOPPED -> STARTING -> LISTENING -> PAUSED)
 * 2. Stdout stream parsing (READY, STATUS, RECOGNIZED with confidence and grammar)
 * 3. Confidence thresholding (filtering sub-threshold noisy utterances)
 * 4. Wake-word extraction ("Hey JARVIS", "JARVIS", "Computer")
 * 5. Deterministic acoustic echo suppression (mic paused when SPEAKING, resumed on IDLE)
 * 6. Push-to-Talk (PTT) state transitions
 * 7. Sensitive data shielding in speech input/output pipeline
 * 8. Speech input suppression while assistant is vocalizing (acoustic feedback defense)
 * 
 * Requirements: 12.1, 12.2, 12.3, 12.4, 12.5, 12.6
 */

import { AudioInterface, AudioState } from './src/audio-interface.js';
import { SpeechRecognizer, RecognizerState } from './src/speech-recognizer.js';

let passedTests = 0;
let totalTests = 0;

function assert(condition, message) {
  totalTests++;
  if (condition) {
    passedTests++;
    console.log(`  ✅ PASS: ${message}`);
  } else {
    console.error(`  ❌ FAIL: ${message}`);
    throw new Error(`Assertion failed: ${message}`);
  }
}

async function runTests() {
  console.log('='.repeat(75));
  console.log('🎙️ JARVIS v3.0 — SPEECH RECOGNITION & VOICE INPUT TEST SUITE');
  console.log('='.repeat(75));

  // --- 1. SpeechRecognizer Stream Parsing & Confidence ---
  console.log('\n[1/4] Testing SpeechRecognizer Output Parsing & Confidence Thresholds...');
  {
    const recognizer = new SpeechRecognizer({ minConfidence: 0.3 });
    assert(recognizer.getState() === RecognizerState.STOPPED, 'Initial state is STOPPED');
    assert(!recognizer.isListening(), 'isListening() returns false when stopped');

    // Simulate READY line
    let readyEmitted = false;
    recognizer._handleStdoutLine('READY: Speech listener initialized', () => {
      readyEmitted = true;
    });
    assert(readyEmitted, 'READY line triggers ready callback');
    assert(recognizer.getState() === RecognizerState.LISTENING, 'State transitioned to LISTENING on READY');
    assert(recognizer.isListening(), 'isListening() returns true after READY');

    // Simulate high-confidence utterance
    let recognizedUtterance = null;
    recognizer.on('recognized', (data) => {
      recognizedUtterance = data;
    });
    recognizer._handleStdoutLine('RECOGNIZED: what is the weather today|CONFIDENCE: 0.85|GRAMMAR: Dictation');
    assert(recognizedUtterance !== null, 'Recognized high-confidence utterance');
    assert(recognizedUtterance.text === 'what is the weather today', 'Extracted correct text');
    assert(recognizedUtterance.confidence === 0.85, 'Parsed confidence value correctly');
    assert(recognizedUtterance.grammar === 'Dictation', 'Parsed grammar correctly');

    // Simulate low-confidence utterance (below threshold 0.3)
    let lowConfEmitted = false;
    recognizedUtterance = null;
    recognizer.on('lowConfidence', (data) => {
      lowConfEmitted = true;
    });
    recognizer._handleStdoutLine('RECOGNIZED: mumble mumble noise|CONFIDENCE: 0.15|GRAMMAR: Dictation');
    assert(lowConfEmitted, 'Low confidence utterance triggers lowConfidence event');
    assert(recognizedUtterance === null, 'Low confidence utterance is filtered from recognized event');

    // Simulate STATUS changes
    recognizer._handleStdoutLine('STATUS: PAUSED');
    assert(recognizer.getState() === RecognizerState.PAUSED, 'STATUS: PAUSED transitions state to PAUSED');
    assert(!recognizer.isListening(), 'isListening() returns false when PAUSED');

    recognizer._handleStdoutLine('STATUS: RESUMED');
    assert(recognizer.getState() === RecognizerState.LISTENING, 'STATUS: RESUMED transitions state to LISTENING');
    assert(recognizer.isListening(), 'isListening() returns true after RESUMED');
  }

  // --- 2. Wake-Word Extraction & Command Parsing ---
  console.log('\n[2/4] Testing Wake-Word Extraction & Gating...');
  {
    const recognizer = new SpeechRecognizer({
      minConfidence: 0.25,
      wakeWords: ['hey jarvis', 'jarvis', 'computer']
    });
    recognizer.state = RecognizerState.LISTENING;

    let wakeEvent = null;
    recognizer.on('wakeWord', (data) => {
      wakeEvent = data;
    });

    // Case A: Multi-word wake word
    recognizer._handleStdoutLine('RECOGNIZED: hey jarvis what is the current volume|CONFIDENCE: 0.9|GRAMMAR: WakeWord');
    assert(wakeEvent !== null, 'Detected "hey jarvis" wake word');
    assert(wakeEvent.wakeWord === 'hey jarvis', 'Identified wake word correctly');
    assert(wakeEvent.commandText === 'what is the current volume', 'Extracted command text cleanly');

    // Case B: Standalone wake word
    wakeEvent = null;
    recognizer._handleStdoutLine('RECOGNIZED: jarvis open notepad|CONFIDENCE: 0.88|GRAMMAR: WakeWord');
    assert(wakeEvent !== null, 'Detected "jarvis" wake word');
    assert(wakeEvent.wakeWord === 'jarvis', 'Identified standalone wake word');
    assert(wakeEvent.commandText === 'open notepad', 'Extracted command text without wake word');

    // Case C: Conversational speech without wake word
    wakeEvent = null;
    let normalEvent = null;
    recognizer.once('recognized', (data) => {
      normalEvent = data;
    });
    recognizer._handleStdoutLine('RECOGNIZED: how are you doing today|CONFIDENCE: 0.75|GRAMMAR: Dictation');
    assert(wakeEvent === null, 'No wake word triggered for normal conversational speech');
    assert(normalEvent !== null && normalEvent.text === 'how are you doing today', 'Dictation text emitted for downstream routing');
  }

  // --- 3. Deterministic Acoustic Echo Suppression & PTT ---
  console.log('\n[3/4] Testing Acoustic Echo Suppression & Push-to-Talk (PTT)...');
  {
    // Mock child process and SpeechRecognizer
    let pauseCalls = 0;
    let resumeCalls = 0;
    const mockRecognizer = {
      state: RecognizerState.LISTENING,
      isListening() { return this.state === RecognizerState.LISTENING; },
      getState() { return this.state; },
      pause() {
        pauseCalls++;
        this.state = RecognizerState.PAUSED;
        return true;
      },
      resume() {
        resumeCalls++;
        this.state = RecognizerState.LISTENING;
        return true;
      },
      on() {},
      start() { return Promise.resolve(true); },
      stop() { return Promise.resolve(); }
    };

    const audio = new AudioInterface({
      speechRecognizer: mockRecognizer,
      voiceOutput: false
    });

    assert(audio.state === AudioState.IDLE, 'AudioInterface initial state is IDLE');

    // Step 1: Vocalize text -> Transitions to SPEAKING
    audio.setState(AudioState.SPEAKING);
    assert(pauseCalls === 1, 'Microphone recognizer deterministically paused when entering SPEAKING state');
    assert(mockRecognizer.state === RecognizerState.PAUSED, 'Recognizer state is PAUSED');

    // Step 2: While SPEAKING, ensure handleSpeechInput suppresses microphone audio
    const suppressed = audio.handleSpeechInput('Hey JARVIS, turn off');
    assert(suppressed.commandText === '', 'Speech input is completely suppressed while assistant is SPEAKING (acoustic echo prevented)');

    // Step 3: Assistant finishes speaking -> Transitions to IDLE
    audio.notifyPlaybackFinished();
    assert(audio.state === AudioState.IDLE, 'AudioInterface returned to IDLE');
    assert(resumeCalls === 1, 'Microphone recognizer deterministically resumed when playback finishes');
    assert(mockRecognizer.state === RecognizerState.LISTENING, 'Recognizer state restored to LISTENING');

    // Step 4: Test Push-to-Talk (PTT)
    mockRecognizer.state = RecognizerState.PAUSED;
    let pttEmitted = false;
    audio.on('pttTriggered', () => { pttEmitted = true; });

    const pttResult = audio.triggerPtt();
    assert(pttResult === true, 'triggerPtt() returns true');
    assert(pttEmitted === true, 'pttTriggered event emitted');
    assert(audio.state === AudioState.LISTENING, 'Audio state transitioned to LISTENING for PTT turn');
    assert(mockRecognizer.state === RecognizerState.LISTENING, 'Recognizer resumed for PTT utterance');
  }

  // --- 4. Sensitive Fact Audio Shielding on Speech Output ---
  console.log('\n[4/4] Testing Sensitive Fact Speech Masking & Audio Gating...');
  {
    const audio = new AudioInterface();

    // Sensitive fact test
    const sensitiveResponse = 'Your master password is supersecret123 and should be guarded.';
    const spoken = audio.speak(sensitiveResponse);

    assert(!spoken.includes('supersecret123'), 'Sensitive password excluded from vocal speech text');
    assert(spoken.includes('Credentials displayed on screen'), 'Spoken text notifies user that credentials are on screen');
  }

  console.log('\n' + '='.repeat(75));
  console.log(`🎉 ALL ${passedTests}/${totalTests} SPEECH RECOGNITION TESTS PASSED!`);
  console.log('='.repeat(75));
}

runTests().catch(err => {
  console.error('\n❌ Unhandled error in speech recognition test suite:', err);
  process.exit(1);
});
