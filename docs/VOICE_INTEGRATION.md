# JARVIS Conversational AI - Voice Interaction Architecture

This specification documents the audio input/output architecture, wake word detection integration points, offline Speech-to-Text (STT), and local Text-to-Speech (TTS) synthesis for JARVIS.

---

## 1. Architectural Overview

```
 [Microphone] 
      |
      v
+-------------------------------+
|     Wake Word Detector        |  Listens for "Hey JARVIS" or "JARVIS"
| (openWakeWord / Porcupine)    |  using ultra-low CPU footprint (<1% CPU).
+---------------+---------------+
                |
                v [Triggers Speech Capture]
+-------------------------------+
|   Speech-to-Text (STT) Engine |  Transcribes audio stream to text
|  (Whisper.cpp / Faster-Whisper|  using 100% offline local models.
+---------------+---------------+
                |
                v [Transcribed Command Text]
+-------------------------------+
|       AudioInterface          |  Coordinates states (IDLE, LISTENING,
|    (src/audio-interface.js)   |  PROCESSING, SPEAKING) and event hooks.
+---------------+---------------+
                |
                v
+-------------------------------+
|      JarvisOrchestrator       |  Executes intent classification, action
|          (jarvis.js)          |  execution, context resolution, and LLM.
+---------------+---------------+
                |
                v [Raw Response Text]
+-------------------------------+
|        prepareForTTS()        |  Enforces <200 word ceiling, strips
|    (src/audio-interface.js)   |  markdown/code blocks, expands symbols.
+---------------+---------------+
                |
                v [Vocal Speech String]
+-------------------------------+
|   Text-to-Speech (TTS) Engine |  Synthesizes natural British butler voice
|  (Piper TTS / Windows SAPI)   |  with zero cloud dependency.
+---------------+---------------+
                |
                v
          [Speakers]
```

---

## 2. Voice State Machine

The audio interface manages four distinct states:

```
  +---------+   Wake Word Detected    +-------------+
  |  IDLE   | ----------------------> |  LISTENING  |
  +---------+                         +-------------+
       ^                                     |
       |                                     | User Finishes Speaking (VAD)
       | Playback Finished                   v
  +---------+                         +-------------+
  | SPEAKING|<----------------------- | PROCESSING  |
  +---------+      Response Ready     +-------------+
```

---

## 3. Supported 100% Local Voice Stack

### 3.1 Text-to-Speech (TTS) Engines
JARVIS supports two 100% offline voice synthesis engines:
- **Windows Native SAPI (Default Built-in)**:
  - **Voices**: `Microsoft David Desktop` (default male voice), `Microsoft Zira Desktop` (female voice).
  - **Setup**: Zero installation required; utilizes native Windows `System.Speech.Synthesis`.
  - **Latency**: `< 50ms` initialization, streamed sentence-by-sentence via `StreamSpeechBuffer`.
  - **Persona Tuning**: Dynamically adjusts speech rate according to active persona (`buddy` = +2 rate, `strict` = +1 rate).
- **Piper TTS (Optional Neural Synthesis)**:
  - **Model**: `en_GB-alan-medium` (British male voice matching Tony Stark's JARVIS persona).
  - **Inference Speed**: Real-time factor `0.1x` (1 second of audio generated in 100ms on CPU).
  - **Quality**: Studio-grade neural ONNX synthesis with zero cloud dependency.

### 3.2 Input Modality & Privacy
- **Default Input Mode**: **Push-to-Talk (PTT)** / turn-taking (via Enter/Space in interactive mode or keypress). Eliminates continuous ambient room recording, protecting user privacy and preventing acoustic feedback/echo loops.
- **Acoustic Echo Protection**: When speaking, the assistant suppresses microphone audio ingestion during `AudioState.SPEAKING` to prevent self-trigger loops.
- **Speech-to-Text (STT)**: `Whisper.cpp` (`ggml-base.en.bin` or `ggml-tiny.en.bin`) converting voice to text immediately into the unified input pipeline.
- **Sensitive Fact Speech Gate**: Credentials, passwords, and private tokens are masked from audio output (`[CONFIDENTIAL/SENSITIVE]`), displayed only on screen.

---

## 4. TTS Text Conditioning (`prepareForTTS`)

Voice interaction requires specialized text preparation compared to terminal output:

| Input Text Pattern | Processed for Voice Output |
|---|---|
| Markdown code blocks (` ```python...``` `) | Replaced with *"Code snippet omitted for speech."* |
| Markdown headers & asterisks (`### **Heading**`) | Stripped cleanly to plain text |
| Markdown links (`[Chrome](https://...)`) | Replaced with anchor label only (*"Chrome"*) |
| File paths (`C:\Users\...\file.txt`) | Replaced with *"local file path"* |
| Technical abbreviations (`vs`, `cmd`, `calc`) | Expanded to *"versus"*, *"command prompt"*, *"calculator"* |
| Length Constraint | Strictly capped at `< 200 words` (Requirement 12.2) |

---

## 5. Programmatic Voice Integration Example

```javascript
import { JarvisOrchestrator } from './jarvis.js';
import { AudioInterface, AudioState } from './src/audio-interface.js';

// 1. Initialize JARVIS and Audio Interface
const jarvis = new JarvisOrchestrator({ dryRun: false });
await jarvis.initialize();

const audio = new AudioInterface({
  wakeWord: 'hey jarvis',
  maxTtsWords: 150
});

// 2. Connect Audio events to Orchestrator
audio.attachToOrchestrator(jarvis);

// 3. Listen for audio events
audio.on('wakeWordDetected', (e) => {
  console.log(`🎤 Wake word detected: "${e.wakeWord}". Listening for command...`);
});

audio.on('speak', (e) => {
  console.log(`🔊 Speaking (${e.wordCount} words): "${e.text}"`);
});

// 4. Simulate Speech Input (e.g. from local Whisper engine)
audio.handleSpeechInput('Hey JARVIS, could you please open the calculator?');
```
