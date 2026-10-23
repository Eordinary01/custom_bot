# Custom Bot Project Context

## 1. Project Overview

- **Name**: `custom_bot` – a Windows‑only voice assistant written in Node.js.
- **Goal**: Listen for wake words, recognize spoken commands, and execute common system actions (open apps, control volume, browse URLs, etc.).
- **Tech stack**: Node.js (ES modules), PowerShell scripts, Windows Speech API.
- **Main entry**: `index.js`.  The bot builds a PowerShell script at runtime (`speech_recognition.ps1`) that streams speech‑to‑text back to the Node process via stdout lines prefixed with `YOU_SAID:`.

## 2. Current Capabilities

| Category | Commands (sample) | Implementation detail |
|----------|-------------------|-----------------------|
| Wake words | `hey bot`, `wake up`, … | Array in class constructor |
| I/O | Text input via terminal when speech fails | After `[Command timed out after 30s]` prompt appears |
| Application launch | `open chrome`, `open notepad` | `exec('start ``chrome.exe``')` |
| System control | `volume up/down`, `shutdown` | `exec()` calling `powershell -Command "..."` |
| Web browse | `open youtube`, `open google` | `exec('start https://youtube.com')` |
| Voice recognition | PowerShell `System.Speech.RecognitionEngine` | Emits `YOU_SAID:` lines to node |

## 3. Pain Points & Known Issues

1. **Silent voice input** – PowerShell script never emits `YOU_SAID:` despite the PowerShell console indicating the recognizer is running. Likely due to event handling on a background thread.
2. **Grammar mismatch** – The PowerShell grammar only contains ~33 phrases, while `index.js` contains ~60 command patterns.
3. **Missing command cases** – Many actions reach `default` because `executeCommand` switch is incomplete.
4. **Command ordering / substring bugs** – `'sleep'` matches before `'sleep now'`, leading to wrong behavior.
5. **Telemetry / logs** – stdout is cluttered with debug lines; hard to debug.
6. **No text‑only fallback** – The node process exits after a 30 s timeout; no way to continue listening after user stops speaking.
7. **Dependency noise** – `mic`, `node-record-lpcm16` are unused; `fs` npm package is wrong, Node uses native `fs`.
8. **No persistence for volume state** – Volume changes happen per command, no rollback.

## 4. Use‑case Discussion

> *“I want an AI buddy that can navigate my browser, set timers, lower the volume of the first tab and raise the second, and automate everyday tasks. I’m not going to fix voice issues; I want a purely text‑based assistant.”*

**Primary use‑cases** for the new bot architecture:

1. **Command orchestration** – Accept natural‑language commands (textual) and translate them into OS actions.
2. **Task automation** – Schedule recurring tasks (volume adjustments, browser tab switches, file operations) via lightweight scripts.
3. **Multi‑step workflows** – Combine several system actions into a single high‑level command (`“prepare my morning”` → open calendar, mute notifications, set alarm).
4. **Fallback strategies** – If an action fails, report detailed error and propose retries.
5. **Extensibility** – Plug in new AI services (OpenAI GPT, Claude) to parse natural language and suggest or execute commands.
6. **UI‑agnostic** – Operate from a terminal or a minimal web UI; no voice input required.

## 5. High‑Level Refactor Plan

1. **Core Layer** – Separate concerns:
   * `CommandRouter`: maps raw input → `Command` objects.
   * `Executor`: executes commands using OS utilities (PowerShell, robotjs, nircmd).
   * `SpeechBridge` (optional): thin wrapper that can be disabled for text‑only tests.
2. **Command Definition** – Use a declarative schema (JSON/TS interface) that lists patterns, action name, and a handler function.
3. **Voice Layer** – Keep `speech_recognition.ps1` but refactor to
   * use synchronous `Recognize()` inside a while loop,
   * output only `YOU_SAID:` lines; discard debug logs.
   * Optionally replace with cross‑platform recognizer like `vosk` if Windows SAPI proves unstable.
4. **Text Input** – Keep a simple REPL fallback. When no voice is detected after a short wait, prompt the user for text.
5. **Volume & Tab Control** – Replace PowerShell commands with `nircmd`, `SoundVolumeView`, or native Windows APIs via Node modules (`win-audio`). Use `robotjs` to send keyboard shortcuts for browser tab switching.
6. **State Persistence** – Store last known volume levels per app in a small JSON config for rollback.
7. **Logging** – Replace console emojis with structured JSON logs (`{level:'info',msg:'...'}`) while still printing human‑friendly lines.
8. **Testing** – Add jest/vitest unit tests for command lookup, executor stubs.
9. **Documentation** – Auto‑generate a `USAGE.md` from `CommandRouter` listing all patterns.
10. **Deployment** – Provide a lightweight wrapper `start.sh` that sets up environment and launches `node index.js` (support for Windows via `cmd /c`).

## 6. Suggested Command Enhancements

| New Command | Description |
|-------------|--------------|
| `volume <app> up/down` | Explicitly adjust volume of a given application using per‑app volume APIs |
| `switch tab <index>` | Use `Ctrl+Tab`/`Ctrl+PageUp/Down` via robotjs to change browser tabs |
| `schedule <cron> <command>` | Persist a cron‑style schedule and run a command automatically |
| `undo last` | Roll back the most recent state change |
| `alias <name> <pattern>` | User‑defined shortcuts |
| `teach <pattern> <command>` | Machine‑learning training or simple mapping persistence |

## 7. Implementation Checklist

1. **Remove unused dependencies** (mic, node-record-lpcm16, fs npm).  Run `pnpm prune`.
2. **Set up `commands.json`** with all patterns.
3. **Implement `CommandRouter`** that performs fuzzy matching and chooses the best command.
4. **Port existing switch cases** into `Executor` functions.
5. **Rewrite `speech_recognition.ps1`** to produce clean, line‑oriented output.
6. **Add text‑only fallback** with graceful timeout.
7. **Integrate `nircmd`** for volume and window management (include download links).
8. **Write unit tests** for router and executor.
9. **Document** new usage in `USAGE.md`.
10. **Bundle** everything in a single `start.bat` for Windows.

## 8. Timeline & Milestones

| Week | Deliverable |
|------|-------------|
| 1 | Core refactor (router + executor), remove dependencies |
| 2 | Voice bridge fixed, text‑only mode verified |
| 3 | Volume & tab control implemented, testing |
| 4 | Command registry & documentation, CI setup |
| 5 | Export as a versatile CLI tool, optional web UI |

## 9. Risks & Mitigations

- **Speech quality**: If Windows SAPI remains unreliable, consider third‑party recognizer (e.g., VOSK).  Mitigation: keep text fallback.
- **Permission issues**: `robotjs` and `nircmd` may require admin rights for some actions.  Mitigation: run agent with necessary privileges.
- **Cross‑app volume**: Windows can change per-application volume only via `Audio Session API`.  We may need a C++ wrapper or the `nircmd` `changesoundvolume` command with app ID.
- **Security**: Exposing system commands via text interface opens injection risk.  Mitigation: whitelist commands, use strict regex for arguments.

---

**Next steps**: If you agree with this plan, let me know which part you want to start working on – e.g., refactoring the command router or fixing the PowerShell speech script. I can generate the skeleton code or patch the existing files automatically.
