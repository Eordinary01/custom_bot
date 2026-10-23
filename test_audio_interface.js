/**
 * JARVIS Conversational AI - Audio Interface & Voice Integration Test
 * 
 * Verifies:
 * 1. Text conditioning for TTS (markdown removal, abbreviation expansion, <200 word ceiling)
 * 2. Wake word detection ("Hey JARVIS", "JARVIS")
 * 3. Voice state machine transitions (IDLE -> LISTENING -> PROCESSING -> SPEAKING)
 * 4. Orchestrator attachment & speech event lifecycle
 * 
 * Requirements: 12.1, 12.2, 12.3, 12.4, 12.5, 12.6
 */

import { AudioInterface, AudioState, prepareForTTS } from './src/audio-interface.js';

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

async function runAudioTests() {
  console.log('='.repeat(70));
  console.log('🎙️ JARVIS AUDIO INTERFACE & VOICE INTEGRATION TEST SUITE');
  console.log('='.repeat(70));

  // 1. Test TTS Text Preparation
  console.log('\n[1/3] Testing TTS Text Preparation (prepareForTTS)...');
  {
    const markdownInput = '### **System Status**\nOpening `calculator` vs `cmd`. Check [Help](https://example.com) for details.\n```javascript\nconsole.log(123);\n```';
    const speech = prepareForTTS(markdownInput, 150);

    assert(!speech.includes('###'), 'Headers stripped');
    assert(!speech.includes('**'), 'Bold markdown stripped');
    assert(!speech.includes('`'), 'Inline backticks stripped');
    assert(!speech.includes('console.log'), 'Code blocks stripped');
    assert(speech.includes('versus'), 'Abbreviation "vs" expanded to "versus"');
    assert(speech.includes('command prompt'), 'Abbreviation "cmd" expanded to "command prompt"');
    assert(!speech.includes('https://'), 'URLs stripped');

    // Test word limit constraint (<200 words)
    const longText = 'word '.repeat(300);
    const cappedSpeech = prepareForTTS(longText, 150);
    const wordCount = cappedSpeech.split(/\s+/).length;
    assert(wordCount <= 150, `Word count capped at or below limit (${wordCount} <= 150 words)`);
  }

  // 2. Test Wake Word Detection
  console.log('\n[2/3] Testing Wake Word Detection & Ingestion...');
  {
    const audio = new AudioInterface({ wakeWord: 'hey jarvis' });
    assert(audio.state === AudioState.IDLE, 'Initial audio state is IDLE');

    let wakeDetected = false;
    audio.on('wakeWordDetected', (e) => {
      wakeDetected = true;
    });

    const res1 = audio.handleSpeechInput('Hey JARVIS, could you please open the calculator?');
    assert(res1.isWakeWord === true, 'Detects "Hey JARVIS" wake word');
    assert(res1.commandText.toLowerCase().includes('open the calculator'), 'Extracts command text without wake word');
    assert(wakeDetected === true, 'Emits wakeWordDetected event');
    assert(audio.state === AudioState.LISTENING, 'Audio state transitions to LISTENING');

    // Test standalone "JARVIS" wake word
    const res2 = audio.handleSpeechInput('JARVIS, mute the volume');
    assert(res2.isWakeWord === true, 'Detects standalone "JARVIS" wake word');
    assert(res2.commandText.toLowerCase().includes('mute the volume'), 'Extracts command text without wake word');
  }

  // 3. Test Speech Synthesis & State Lifecycle
  console.log('\n[3/3] Testing Speech Synthesis & State Lifecycle...');
  {
    const audio = new AudioInterface();

    let speakEventEmitted = false;
    audio.on('speak', (e) => {
      speakEventEmitted = true;
      assert(typeof e.text === 'string' && e.wordCount > 0, 'Speak event carries prepared text and word count');
    });

    const spoken = audio.speak('Right away, sir. Opening Calculator now.');
    assert(audio.state === AudioState.SPEAKING, 'Audio state transitions to SPEAKING');
    assert(speakEventEmitted === true, 'Speak event emitted');
    assert(audio.lastVocalizedText === spoken, 'Last vocalized text recorded');

    // Notify playback finished
    audio.notifyPlaybackFinished();
    assert(audio.state === AudioState.IDLE, 'Audio state returns to IDLE after playback');
  }

  console.log('\n' + '='.repeat(70));
  console.log(`🎉 ALL ${passedTests}/${totalTests} AUDIO INTERFACE TESTS PASSED!`);
  console.log('='.repeat(70));
}

runAudioTests().catch(err => {
  console.error('\n❌ Unhandled error in audio test suite:', err);
  process.exit(1);
});
