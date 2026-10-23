# Migration Guide: Custom Bot v1.0 to JARVIS v2.0

This document outlines the migration path, architectural enhancements, and backward-compatibility guarantees when upgrading from **Custom Bot v1.0** to **JARVIS v2.0 Conversational AI**.

---

## 1. Overview of Changes

| Feature | Custom Bot v1.0 | JARVIS v2.0 |
|---|---|---|
| **Interaction Paradigm** | Strict command pattern matching | Natural conversational English + Multi-turn dialogue |
| **System Actions** | 60 hardcoded regex commands | 60+ actions with semantic resolution, synonyms, and LLM extraction |
| **Ambiguity Handling** | "I didn't understand that" fallback | Interactive clarification ("Did you mean Gmail or Outlook?") |
| **Conversational Intelligence** | Static responses (`lastResponse`) | Local SLM (Phi-3 Mini 4K Instruct) via local Python server |
| **Context & Memory** | Stateless (no memory between inputs) | 20-turn sliding window + persistent SQLite memory store |
| **Pronoun Resolution** | None ("close it" fails) | Contextual anaphora resolution ("open Chrome" -> "close it") |
| **Configuration** | Static code constants | Debounced JSON schema validation with real-time hot-reloading |
| **Logging** | Console stdout only | Structured JSON logger with privacy masking & 10MB auto-rotation |
| **Execution Mode** | Direct OS execution only | Direct execution + Safe Dry-Run mode (`--dry-run`) |

---

## 2. Backward Compatibility Guarantees

JARVIS v2.0 is designed with **100% backward compatibility** for all existing v1.0 commands and integrations:

1. **All 60 Actions Preserved**: Every action defined in `executor.js` remains fully executable with exact naming semantics.
2. **Parallel Mode Support**: You can run the assistant in legacy mode at any time using the `--mode classic` CLI flag.
3. **Programmatic API**: The `TextAssistant` class remains exported from `assistant.js` with identical methods (`handleInput`, `start`, `router`, `executor`).

---

## 3. CLI Mode Switching

The application entry point `assistant.js` dynamically selects the operational engine based on CLI parameters:

```bash
# Start in new JARVIS Conversational Mode (Default)
node assistant.js

# Explicitly start in JARVIS Mode
node assistant.js --mode jarvis

# Start in Legacy Classic Mode (v1.0 Pattern Matcher)
node assistant.js --mode classic

# Start in Safe Dry-Run Mode (Simulates OS actions without modifications)
node assistant.js --dry-run

# Start with a specific Personality Preset (strict | balanced | casual)
node assistant.js --personality strict

# Start with a Custom Configuration File
node assistant.js --config config/custom.json
```

---

## 4. Programmatic Migration

If your scripts import `assistant.js`:

### Before (v1.0):
```javascript
import { TextAssistant } from './assistant.js';

const bot = new TextAssistant();
await bot.handleInput('open calculator');
```

### After (v2.0 - Universal Factory):
```javascript
import { createAssistant } from './assistant.js';

// Create JARVIS conversational assistant
const jarvis = await createAssistant({ mode: 'jarvis', dryRun: true });
const result = await jarvis.process('Could you please launch the calculator for me?');
console.log(result.text);

// Or create legacy classic assistant
const classic = await createAssistant({ mode: 'classic', dryRun: true });
await classic.handleInput('open calculator');
```

---

## 5. Configuration Migration

JARVIS v2.0 introduces centralized configuration via `config/default.json`. You can customize assistant behavior without touching code:

```json
{
  "assistant": {
    "name": "JARVIS",
    "mode": "jarvis"
  },
  "personality": {
    "preset": "balanced",
    "formality": 0.7,
    "verbosity": 0.6,
    "humor": 0.5
  },
  "features": {
    "contextMemory": true,
    "longTermPersistence": true,
    "hotReload": true
  }
}
```

Any edits to `config/default.json` are automatically hot-reloaded by `ConfigManager` in real time.

---

## 6. Verification & Testing

To verify both classic and JARVIS modes on your local machine:

```bash
# Run migration verification suite
node test_migration_modes.js

# Run full cross-component integration tests
npm run test:cross

# Run comprehensive test suite
npm run test:comprehensive
```
