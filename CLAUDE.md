# custom_bot — Windows Voice Assistant

Personal AI voice assistant for Windows. Listens for wake words, recognizes spoken
commands, and executes system actions (open apps, control volume, open websites, etc.).

## How to run

```bash
node index.js
```

No build step. Requires Windows (uses PowerShell + System.Speech), a working
microphone, and Windows Speech Recognition language pack installed.

## Architecture

- **`index.js`** — everything lives here, in the `RealVoiceAssistant` class:
  - On start, runs a PowerShell probe (`testSpeechAvailability`) to verify
    System.Speech works; falls back to text-only stdin input if not.
  - `startContinuousListening()` generates `speech_recognition.ps1` at runtime
    (overwrites the checked-in copy), spawns it via `powershell.exe -File`, and
    parses its stdout for `YOU_SAID: <text> (confidence: N)` lines.
  - Flow: speech/text → `processSpeechInput` → wake-word check (`isWakeWord`) →
    `recognizeCommand` (substring match against `patterns`) → `executeCommand`
    (big switch statement, runs `exec()` for system actions).
  - Wake words: "hey bot", "hello bot", "wake up", "computer", "assistant".
    Auto-sleeps after 45s of inactivity. Direct commands bypass the wake word.
  - TTS via `speak()` — spawns a new PowerShell `SpeechSynthesizer` per utterance.
- **`speech_recognition.ps1`** — generated artifact, not the source of truth.
  Grammar is a fixed `Choices` list (~33 phrases), so voice can only ever
  recognize those exact phrases regardless of what `index.js` defines.
- **`audio/`** — contains `input.wav`; not currently used by any code.
- **`.env`** — holds `OPENAI_API_KEY`; loaded via dotenv but **never used yet**
  (intended for future AI/conversational features).

## Dependencies (package.json)

- `dotenv` — used.
- `mic`, `node-record-lpcm16` — installed but **unused** (leftovers from an
  earlier mic-capture approach).
- `fs` (npm package `0.0.1-security`) — bogus placeholder; Node's builtin `fs`
  is what's actually used. Safe to remove from dependencies.

## Known issues / gotchas

1. **Voice recognition likely silent (main bug):** the generated PS script wires
   the event with `$speechEngine.add_SpeechRecognized({...})` and uses
   `RecognizeAsync`. .NET raises that event on a background thread where
   PowerShell has **no runspace**, so the scriptblock (and its `Write-Host`)
   never runs — Node never sees `YOU_SAID:`. Fix: use synchronous
   `$speechEngine.Recognize()` in the `while($true)` loop, or
   `Register-ObjectEvent` + `Wait-Event`.
2. **Command/grammar mismatch:** `index.js` defines ~60 commands but the PS
   grammar only contains ~33 phrases. Anything not in the `Choices` list
   (spotify, vscode, word, etc.) is unreachable by voice.
3. **Missing switch cases:** many actions returned by `recognizeCommand`
   (open_spotify, open_vscode, open_word, open_downloads, maximize, …) have no
   `case` in `executeCommand`, so they hit `default` ("I don't understand").
4. **`open_github` case has no `break`** — falls through to `default`.
5. **Pattern-order bug:** `"sleep"` (puts the PC to sleep) is matched before
   `"sleep now"` (puts the assistant to sleep). Saying "sleep now" suspends the
   computer. Substring matching (`includes`) generally causes false positives
   ("time" matches "sometimes").
6. **SIGINT handler doesn't call `assistant.cleanup()`** — orphaned PowerShell
   process can keep the mic open after Ctrl+C.
7. `speak()` starts a fresh PowerShell per utterance (~1–2s latency, can overlap).

## Conventions

- ES modules (`"type": "module"`).
- Console output uses emoji-prefixed status lines; PS→Node protocol is
  prefix-based (`INIT:`, `READY:`, `YOU_SAID:`, `ERROR:`).
