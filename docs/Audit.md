# 🎯 Quick‑Start Audit & Fix‑Plan

> **Scope:** `dev/custom_bot` (JARVIS Conversational AI v3.0)
> **Goal:** Get local voice input, full JARVIS behaviour (YouTube control, vision, web search) running.

---

## 🏗️ Current Architecture Snapshot

```
dev/custom_bot/
├── assistant.js          # CLI entry point (JARVIS mode)
├── jarvis.js             # Full orchestrator (1038 L)
├── index.js              # Legacy real‑voice assistant (991 L) – dead code
├── commandRouter.js      # Classic pattern matcher (60+ commands)
├── executor.js           # OS‑action dispatcher
├── commands.json         # 67 command definitions
├── src/
│   ├── action-bridge.js   (semantic command mapping)
│   ├── audio-interface.js   (TTS, state machine)
│   ├── context-manager.js    (sliding context, pronoun)
│   ├── intent-classifier.js (regex ➜ LLM fallback)
│   ├── llm-engine.js        (Python llama‑cpp JSON‑RPC)
│   ├── system-observer.js   (SQLite recorder – never used)
│   ├── web-search.js        (SearxNG meta‑search)
│   └── prompt‑templates.js  (Phi‑3 prompts)
├── scripts/
│   ├── speech_listener.ps1 (# async Recognition → BUG)
│   ├── speech_recognition.ps1 (# legacy power plant)
│   ├── get_system_volume.ps1
│   ├── get_system_brightness.ps1
│   └── train_buddy.py
├── python/llm_server.py    (llama‑cpp Python server)
├── models/                 # 2x 4.4 GB GGUF dumps
├── config/default.json    # hot‑reloadable settings
├── docs/                   # USER_GUIDE, VOICE_INTEGRATION, etc.
├── logs/jarvis.log         # structured JSON
└── tests/                   # 25+ test scripts (no real subsystem tests)
```

---

## 🔑 Core Issues & Evidence

| # | Issue | Evidence | Severity |
|---|--------|-----------|----------|
| 1 | **Voice Recognition never produces `YOU_SAID:` lines** | `speech_listener.ps1` uses `RecognizeAsync` + events that run on a background thread. PowerShell has no runspace → no output. <br> `assistant.js` spawns this script but never consumes its output. | **Critical** |
| 2 | **JARVIS "What am I seeing" / YouTube control missing** | `system-observer.js` never called; no code to capture browser tabs, screen, or OCR. `executor.js` only opens YouTube URL, no video control. | **High** |
| 3 | **Web search requires external SearxNG** | `web-search.js` expects `http://localhost:8080`. No setup docs or fallback. Log shows "I am currently operating in offline mode" when `--online` omitted. | **High** |
| 4 | **Legacy `index.js` + `commands.json` drift** | Two separate registries – classic vs. orchestrator. Checks for absolute consistency fail. | Medium |
| 5 | **Pattern‑matching bugs** | `commandRouter.js` uses `String.includes()`; "sleep" matches before "sleep now".  Mis‑handled shortcuts. | Medium |
| 6 | **Missing TTS/voice stack** | Docs reference Whisper/Piper but code uses Windows SAPI only, no Whisper integration for STT, no trained TTS. | Low |
| 7 | **Large duplicate model files** | `models/` contains 2 x 4.4 GB GGUFs. One is unused. | Low |

---

## 🚧 Step‑by‑Step Fix Plan

> **Prerequisites** – We assume you can install PowerShell modules, Docker, and Python packages locally. **Goal** – After the steps, a single `node assistant.js` will greet you, understand spoken commands, control YouTube, talk back, and browse the web in‑depth.

### 1️⃣ Voice Recognition – Replace `speech_listener.ps1`

| Sub‑step | Action | Why |
|---|---|---|
| 1.1 | Edit `scripts/speech_listener.ps1` to use **synchronous** `Recognize()` inside a `while($true)` loop. | Guarantees the PowerShell runspace stays alive and `Write-Host` outputs line per recognition, matching `YOU_SAID:` convention. |
| 1.2 | Remove event‑based `add_SpeechRecognized` / `add_SpeechRejected`. | They ever fire on a background thread that isn't connected to PowerShell's stdout. |
| 1.3 | Add a **confidence filter** in PowerShell: after `Recognize()`, only echo if `$result.Confidence >= 0.25`. | Matches the Node `speech-recognizer.js` `minConfidence` setting. |
| 1.4 | Ensure the script terminates gracefully on `ESC` or `Ctrl‑C` by trapping `Stop-Process` or listening to stdin commands `PAUSE/RESUME/STOP`. | Keeps the main Node process from hanging. |
| 1.5 | Add a **PowerShell wrapper** (`scripts/start_speech.ps1`) that launches `speech_listener.ps1` with `-NoProfile -ExecutionPolicy Bypass`. | Decouples script execution from Node; easier debugging. |
| 1.6 | Test locally: `powershell.exe -File scripts/speech_listener.ps1` and speak "hey JARVIS open calculator". You should see a line like `YOU_SAID: open calculator (confidence: 0.83)`. | Confirms the script works before integration. |

---

### 2️⃣ Hook Voice Recognition into JARVIS Orchestrator

| Sub‑step | Action | Why |
|---|---|---|
| 2.1 | In `src/audio-interface.js`, expose a `startListening()` method that spawns **`powershell.exe -File scripts/start_speech.ps1`** and pipes stdout to Node. | Simplifies the orchestrator start up. |
| 2.2 | Wire the `AudioInterface` event `recognized` to feed text into `jarvis.js`'s `process()` method (like you would with typed input). | Gives JARVIS a unified input pipeline. |
| 2.3 | In `jarvis.js`, add a flag `this.audioEnabled = true`. When `start()` is called, first `await this.audioInterface.attachToOrchestrator(this)`; then start listening. | Boots up voice input automatically. |
| 2.4 | Update `skill_view` to show "Voice enabled: yes" in `config/default.json`. | Helps debugging. |

---

### 3️⃣ Implement the "tell me what I am seeing" Feature

| Sub‑step | Action | Why |
|---|---|---|
| 3.1 | Install **OpenCV + Tesseract** in the Python environment (or use **Ollama's llava**). | Needed for OCR/vision. |
| 3.2 | Create `src/vision.js` that launches a **Python script** (`vision_capture.py`) which:
|  | 1. Continuously grabs the active window's screenshot (`ImageGrab.grab`).
|  | 2. Runs OCR to extract text and optionally passes it to a language model (llama‑cpp). | Supplies a *visual context* to JARVIS. |
| 3.3 | Expose a method `getVisualContext()` that returns `{text, imagePath}`. |
| 3.4 | Update `jarvis.js` to call `this.vision.getVisualContext()` when the intent is "tell me what I am seeing". |
| 3.5 | In `response-generator.js`, add a prompt: IF user asks "what am I seeing" OR "tell me what is on screen" USE visual context text as an additional system prompt RETURN summarised answer |
| 3.6 | Pair this with **YouTube video capture**: - In `src/browsing.js`, use **pyautogui** + **psutil** to detect the Chrome process and its tab. - Use **yt-dlp** or **yt-dlp‑extractor** to fetch current YouTube video title/description. | Gives JARVIS a factual "I see this video about…". |

> **Tip:** Even a minimal setup that returns the Reddit/Post title of an open tab will satisfy much of the "tell me what I see" requirement.

---

### 4️⃣ Add a Local Web Search Fallback

| Sub‑step | Action | Why |
|---|---|---|
| 4.1 | Create `docker-compose.yml` that starts a lightweight **SearxNG** instance (image `koosk/sonar`, 1 GB). |
| 4.2 | Add a shell script `scripts/run_searxng.sh` that launches Docker (in background) and exposes `http://localhost:8080`. |
| 4.3 | In `package.json`, add a `dev:searx` script: `"dev:searx": "./scripts/run_searxng.sh"`. |
| 4.4 | Update README: "To enable web search, run `npm run dev:searx` before launching assistant." |
| 4.5 | In `web-search.js`, wrap fetch with a try/catch that falls back to the **DuckDuckGo scrape** (via `node-fetch + cheerio`) if SearxNG is unreachable. |
| 4.6 | Add `config/default.json` flag `features.webSearch: true` (default `false`), and fallback logic in `jarvis.js` that only initiates web searching when online. | Makes web search optional, no black‑hole when SearxNG not running. |

---

### 5️⃣ Clean Up Legacy Code & Reduce Drift

| Sub‑step | Action | Why |
|---|---|---|
| 5.1 | Remove `index.js`, `commands.json`, and `speech_recognition.ps1` from *public* source. Keep `docs/**` only. | Eliminates code churn. |
| 5.2 | Move the *adjacent* command definitions from `src/action-bridge.js` into a single JSON file (`commands.json`), and update both loaders (`commandRouter.js` and `action-bridge.js`) to read that file. | One source of truth. |
| 5.3 | Run `npm i` again to finalise modified dependencies. | Ensures package-lock stable. |
| 5.4 | Add a lint script: `"lint:clean": "yarn lint && git diff --quiet"`. | Guarantees no stray auto‑generated filler. |

---

### 6️⃣ Improve Pattern Matching

| Sub‑step | Action | Why |
|---|---|---|
| 6.1 | Replace `String.includes()` in `commandRouter.js` with **full tokenized regex** matching (exact phrase first, optional wildcard). | Avoid "sleep" vs "sleep now". |
| 6.2 | In `intent-classifier.js`, add a `confidence` field for regex matches (`1.0` if exact, `0.8` if partial). | Gives the LLM a higher‑confidence fallback for imperfect utterances. |
| 6.3 | Update `executor.js` to throw an error on unmatched action codes, and log this as *unknown action* under a new log key `unknownAction`. | Easier debugging. |

---

### 7️⃣ Integrate Whisper for STT (Optional but Recommended)

| Sub‑step | Action | Why |
|---|---|---|
| 7.1 | Install Whisper.cpp via `pip install -U --no-cache-dir -r python/requirements.txt`. | (Prep for optional Whisper usage.) |
| 7.2 | Add a new PowerShell script `scripts/whisper_listener.ps1` that records 3‑second windows, runs Whisper, and emits `YOU_SAID:` lines. | Higher accuracy, language agnostic. |
| 7.3 | Add config flag `audio.sttEngine: 'whisper'`. Conditionally load `whisper_listener.ps1` in `audio-interface.js` if set. | Gives user a choice. |
| 7.4 | Adjust `speech-recognizer.js` to parse Whisper's JSON output (word‑level super‑segment). | Keeps consistency with Node. |

---

### 8️⃣ Testing & Validation

| Test | What to Verify | Tool |
|---|---|---|
| Voice passthrough | Speak "Hey Jarvis open calculator" → JARVIS launches calc | `type 'open calculator'` with `--dry-run` first. |
| YouTube context | Open YouTube video → say "What am I watching?" → JARVIS replies with video title | `npm run dev:searx` + test script. |
| Web search | `search weather in Rome` while offline → get cached answer; enable `$ --online` → hits SearxNG | `jest test_websearch.js` |
| Ambiguous grammar | Say "Open the folder home" → JARVIS resolves *open folder* vs *open home folder* | `npm test` |

---

## 📑 Final Deliverables

| File | Description |
|---|--------------|
| `dev/custom_bot/docs/Audit.md` | Full audit summary + above fix plan. |
| `scripts/speech_listener.ps1` | Updated to synchronous recognition and confidence filter. |
| `scripts/run_searxng.sh` | Docker‑based SearxNG bootstrap script. |
| `src/vision.js` | New Vision module (Python OCR + extraction). |
| `src/browsing.js` | Browser tab extraction helper. |
| `src/response-generator.js` | Updated prompts to include visual context. |
| `src/action-bridge.js` & `src/action-bridge.json` | Unified command registry (no drift). |
| `package.json` | Added new scripts, removed legacy dependencies. |
| `docs/VOICE_INTEGRATION.md` | Updated with actual PowerShell SAPI/TTS, optional Whisper. |
| `README.md` | Update with "Run SearxNG" section. |

---

## 🚀 How to Get It Working

```bash
# 1. Pull repo and cd into it
git clone ...
cd dev/custom_bot

# 2. Setup SearxNG (for web search)
npm run dev:searx   # (builds Docker container, outputs logs to terminal)

# 3. Install Python env
python -m venv .venv
source .venv/bin/activate
pip install -r python/requirements.txt

# 4. Build or pull model GGUF
# (models folder already contains phi-3-mini-4k-q4.gguf)

# 5. Run daemonized LLM server in background
python python/llm_server.py &
# (defaults to 4 core, 4K 4‑bit; GPU not used)

# 6. Launch assistant
node assistant.js --personality balanced

# 7. Test voice input:
#    Speak "Hey Jarvis, open calculator". It should start calc w/out typing.
#    Then ask "What am I watching?" → JARVIS replies with YouTube title.

# 8. Optional: enable Whisper STT
#    npm run build:whisper   # (builds whisper.cpp binary)
#    edit config/default.json
#    audio.sttEngine: "whisper"
#    node assistant.js
```

---

### TL;DR

Add a working synchronous PowerShell recognizer, expose it through the new `AudioInterface`, link it to the orchestrator, build a minimal vision pipeline for web‑content, and switch to a single command registry. With SearxNG Docker on‑premise and a fallback fetcher, your JARVIS will:

- Recognize spoken commands (MEDIA/VOLUME, Browser control, etc.)
- Understand "What am I seeing?" via OCR + browser tab extraction
- Search locally via SearxNG or fallback scrape
- Speak back in a 100% local SAPI/TTS loop – no cloud calls

Once those plumbing steps work, you're on the micro‑second path to a fully AR‑style Iron‑Man‑in‑a‑box JARVIS. Happy hacking!
