# JARVIS Conversational AI - User Guide

Welcome to **JARVIS (v3.0)**, your 100% local, privacy-first desktop AI assistant for Windows. JARVIS combines high-performance operating system automation, screen intelligence, local speech processing, and conversational intelligence powered by an embedded Small Language Model (Phi-3 Mini 4K Instruct).

---

## 1. Prerequisites & First-Time Setup

Before launching JARVIS, ensure the following dependencies are installed and configured:

### 1. System Requirements
- **Operating System**: Windows 10 / 11 (64-bit)
- **Node.js**: `v22.5.0` or higher (JARVIS utilizes the native `node:sqlite` engine introduced in Node.js 22.5.0)
- **Python**: `v3.10` to `v3.12` (for the local inference server, vision OCR, and training pipelines)
- **RAM**: Minimum 8 GB (16 GB recommended for concurrent SLM inference and audio synthesis)

### 2. Install Project Dependencies
In your PowerShell or terminal:

```powershell
# 1. Install Node.js packages
npm install

# 2. Activate Python Virtual Environment
.\venv\Scripts\Activate.ps1

# 3. Ensure required Python packages are installed
pip install pillow pytesseract llama-cpp-python
```

### 3. (Optional) Vision & Screen Intelligence Setup
To allow JARVIS to read text from your screen via OCR (*"What's on my screen?"*):
- Install the standalone Tesseract OCR binary:
  ```powershell
  winget install UB-Mannheim.TesseractOCR
  ```
  *(JARVIS automatically detects `C:\Program Files\Tesseract-OCR\tesseract.exe`)*

### 4. (Optional) Local Meta-Search Engine (SearxNG)
To enable privacy-first web retrieval with zero third-party API keys:
```powershell
# Starts the local SearxNG Docker container at http://localhost:8080
npm run dev:searx
```

---

## 2. Launching the Application

JARVIS provides multiple launch modes tailored to your workflow:

### Mode 1: Interactive Conversational Terminal (Default)
Runs the full conversational AI in voice-first mode directly in your terminal:

```powershell
# Default launch (interactive CLI, offline, voice-first TTS enabled)
node assistant.js

# Or use the npm shortcut
npm run jarvis
# or
npm start
```

### Mode 2: Desktop GUI (Electron HUD)
Runs JARVIS inside a sleek, dark-mode desktop window with a system tray icon:

```powershell
npm run gui
# or
npm run electron
```

- **Global Summon Hotkey**: Press `Ctrl + Shift + Space` anywhere in Windows to summon or hide the JARVIS HUD.
- **System Tray**: Right-click the system tray icon for quick access to Summon, Mute/Unmute, and Exit.
- **Visual Waveform**: Real-time visual feedback during speech output and query processing.

### Mode 3: Live Microphone Listening (Voice Input)
Enable continuous speech-to-text input through your microphone:

```powershell
# Launch with live microphone listening enabled
node assistant.js --listen

# Short flag equivalent
node assistant.js -l
```

### Mode 4: Quiet / Text-Only Mode (Muted TTS)
By default, JARVIS speaks responses aloud using Windows SAPI TTS. To run purely with text output on stdout:

```powershell
node assistant.js --mute
# or
node assistant.js --silent
```

### Mode 5: Live Web Search Mode (Online)
By default, JARVIS operates 100% offline for complete data sovereignty. When online mode is enabled, JARVIS can query your local SearxNG engine (or DuckDuckGo fallback) to ground time-sensitive queries:

```powershell
node assistant.js --online
```

### Mode 6: Safe Dry-Run Mode
Simulate actions safely without modifying your OS (no files created, no applications closed or launched, no system power changes):

```powershell
node assistant.js --dry-run
```

### Mode 7: Legacy Classic Mode (v1.0 Pattern Router)
If you only need instant, deterministic regex matching without neural SLM processing:

```powershell
node assistant.js --mode classic
```

---

## 3. Command Line Options Reference

| Option | Shorthand | Default | Description |
|---|---|---|---|
| `--mode <jarvis\|classic>` | | `jarvis` | Choose assistant mode (`jarvis` for full conversational SLM, `classic` for fast regex router) |
| `--listen` | `-l` | `false` | Enable live microphone speech recognition (STT) |
| `--mute`, `--silent` | | `false` | Silence Text-to-Speech vocal output (TTS is enabled by default) |
| `--voice` | | `true` | Explicitly enable Text-to-Speech audio output |
| `--voice-name <name>` | | System Default | Select Windows SAPI voice (e.g. `'Microsoft David Desktop'`, `'Microsoft Zira Desktop'`) |
| `--online` | | `false` | Enable local meta-search web retrieval for live information |
| `--offline` | | `true` | Enforce 100% offline mode (declines live news/prices honestly without hallucinating) |
| `--dry-run` | | `false` | Safely simulate OS automation actions without altering system state |
| `--personality <preset>` | | Dynamic Drift | Hard-pin a personality preset: `strict`, `balanced`, `casual`, or `buddy` |
| `--config <path>` | | `config/default.json` | Load a custom JSON configuration file |
| `--help` | `-h` | | Display CLI help menu |

---

## 4. Conversational Intelligence & Interaction

JARVIS understands flexible, natural phrasing and maintains conversational context across turns.

### Natural Phrasings
- *"Could you please launch Google Chrome for me?"*
- *"I need to write some notes, would you mind bringing up Notepad?"*
- *"At your convenience, please lower the volume a bit."*

### Multi-Turn Context & Pronoun Resolution
JARVIS tracks active subjects, applications, and conversation topics across turns:
- **User**: *"Let's talk about Google Chrome."*
- **JARVIS**: *"Certainly, sir. Chrome is ready whenever you need it."*
- **User**: *"Could you open it?"* *(JARVIS recognizes "it" = Google Chrome and launches it).*
- **User**: *"Now please maximize it."* *(JARVIS maximizes the active Chrome window).*

### Compound & Hybrid Requests
Combine system actions and conversational inquiries into a single request:
- *"Please open Notepad and tell me what the weather looks like today."*
- *"Launch Spotify and tell me a quick joke."*
- *"Open Chrome and tell me what time it is."*

### Safety Confirmation Gate for Destructive Actions
High-impact operations (such as system shutdown, reboot, or file deletions) cannot be executed accidentally. When requested, JARVIS will ask for explicit confirmation:
- **User**: *"Shut down the computer."*
- **JARVIS**: *"⚠️ Warning: 'shutdown' is a destructive system action. Are you certain you wish to proceed? (yes/no)"*
- **User**: *"yes"* *(Action proceeds)*

---

## 5. Vision & Screen Understanding

JARVIS includes built-in screen perception via the **VisionProvider** module:

### How It Works
1. Captures a temporary screenshot of your screen or active window.
2. Extracts on-screen text using Tesseract OCR.
3. Inspects active window titles, process names, and open YouTube tabs.
4. Synthesizes a structured summary while protecting against prompt injection.

### Example Queries
- *"What am I seeing?"*
- *"What's on my screen right now?"*
- *"Tell me what video is playing."*
- *"What application is currently in focus?"*

---

## 6. Personality Customization & Dynamic Drift

JARVIS can dynamically drift between personalities based on conversational context, or you can hard-pin your preferred persona:

| Preset | Formality | Verbosity | Humor | Character Profile |
|---|---|---|---|---|
| **Balanced** *(Default)* | 0.7 | 0.6 | 0.5 | Courteous, efficient, and subtly witty British assistant. |
| **Strict** | 0.9 | 0.3 | 0.1 | Formal, highly concise, and strictly task-focused butler. |
| **Casual** | 0.4 | 0.8 | 0.8 | Relaxed, conversational, friendly, and playful. |
| **Buddy** | 0.2 | 0.9 | 0.9 | Warm companion, humorous banter, and high camaraderie. |

### Pinned Persona Example
```powershell
# Launch with the Buddy companion persona pinned
node assistant.js --personality buddy

# Launch with the Strict butler persona pinned
node assistant.js --personality strict
```

---

## 7. Directory of Supported Actions (60+ System Controls)

### Applications & Office (31)
| Category | Supported Actions |
|---|---|
| **Browsers & Web** | Google Chrome, Google Search, YouTube, GitHub, Reddit, Wikipedia |
| **Productivity & Office** | Microsoft Word, Excel, PowerPoint, Paint, VS Code, Notepad |
| **Communication** | Outlook, Gmail, Discord, Microsoft Teams, WhatsApp, Slack |
| **Social & Entertainment** | Spotify, Netflix, Prime Video, Steam, Twitter/X, Instagram, Facebook, LinkedIn |
| **System Utilities** | Calculator, File Explorer, Windows Settings, Command Prompt, PowerShell, Task Manager, Control Panel |

### Media & YouTube Controls (3)
- **Play / Pause**: *"pause youtube"*, *"play video"*, *"resume video"*
- **Next Track / Skip**: *"next video"*, *"skip video"*, *"next track"*
- **Mute / Unmute Video**: *"mute youtube"*, *"unmute video"*

### System, Audio & Display Management (15)
- **Audio Volume**: *"volume up"*, *"volume down"*, *"mute"*, *"what is the volume?"*
- **App-Specific Volume**: *"volume app up"*, *"volume app down"*
- **Display Brightness**: *"what is the brightness?"*, *"screen brightness"*
- **Power & Security**: *"lock screen"*, *"sleep"*, *"shutdown"*, *"restart"*
- **Window Controls**: *"maximize window"*, *"minimize window"*, *"switch tab"*, *"previous tab"*

### Files & Folders (6)
- **Quick Folders**: Open Downloads, Open Documents, Open Desktop, Open Pictures
- **Creation**: *"create file <filename>"*, *"create folder <foldername>"*

### Assistant & Screen Intelligence (11)
- **Screen Intelligence**: *"what am I seeing?"*, *"what is on screen?"*, *"what video is this?"*
- **Time & Date**: *"what time is it"*, *"what is today's date"*
- **Drafting**: *"write email"*, *"compose email"*
- **Utility**: *"help"*, *"repeat"*, *"test voice"*, *"sleep now"*

---

## 8. Continuous Improvement & Training Pipeline

JARVIS features a self-improving training pipeline to fine-tune local LoRA adapters on your conversations:

```powershell
# 1. Export conversational history into structured dataset
npm run data:export-chat

# 2. Generate and validate synthetic training pairs
npm run data:generate

# 3. Fine-tune local LoRA adapter on your interaction data
npm run train:buddy

# Dry-run validation of the training pipeline
npm run train:buddy:dry
```

---

## 9. Automated Testing & Verification

Ensure all system components, audio bridges, and IPC protocols are functioning properly:

```powershell
# Run all unit tests
npm run test:unit

# Run end-to-end multi-turn scenario tests
npm run test:e2e

# Run performance and latency benchmarks
npm run test:perf

# Run master comprehensive verification suite
npm run test:comprehensive
```

---

## 10. Privacy & Offline Guarantee

- **100% Local Inference**: LLM generation, vector memory storage, and intent parsing execute on your device with no telemetry.
- **Zero Cloud API Keys**: No recurring subscriptions or external API dependencies required.
- **Prompt Fencing**: External data (web results, active window titles, OCR text) is strictly enclosed in `<observed_data>` XML fences to eliminate prompt injection risks.
- **Sensitive Data Redaction**: Passwords, secrets, and auth tokens are automatically scrubbed from local memory logs.
