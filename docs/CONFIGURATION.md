# JARVIS Configuration Guide

This guide details all configuration options available in `config/default.json` for customizing JARVIS's personality, performance limits, feature toggles, logging parameters, and model backend.

---

## 1. Overview & Hot-Reload

JARVIS automatically loads `config/default.json` upon startup and watches the file for changes on disk. **Modifications to personality traits, log levels, or feature flags take effect immediately without needing to restart the process** (Requirement 13.4).

---

## 2. Configuration Parameters

### 2.1 Assistant Identity (`assistant`)
| Parameter | Type | Default | Description |
|---|---|---|---|
| `name` | String | `"JARVIS"` | The name used by the AI assistant in system prompts and signatures. |
| `userName` | String | `"Sir"` | The default title or name JARVIS uses to address the user. |
| `systemStatus` | String | `"All systems nominal"` | Operational status injected into the dynamic context prompt. |

### 2.2 Personality & Tone (`personality`)
| Parameter | Type | Range | Default | Description |
|---|---|---|---|---|
| `preset` | String | `"STRICT" \| "BALANCED" \| "CASUAL"` | `"BALANCED"` | Personality preset profile. |
| `formality` | Number | `0.0` - `1.0` | `0.7` | Degree of formality (1.0 = highly formal, 0.0 = relaxed). |
| `verbosity` | Number | `0.0` - `1.0` | `0.6` | Length and detail of responses (0.0 = terse, 1.0 = detailed). |
| `humor` | Number | `0.0` - `1.0` | `0.5` | Frequency and dryness of witty remarks. |
| `empathy` | Number | `0.0` - `1.0` | `0.8` | Level of emotional attunement and calming tone. |

### 2.3 Performance & Token Limits (`performance`)
| Parameter | Type | Default | Description |
|---|---|---|---|
| `responseTimeoutMs` | Number | `15000` | Maximum time (ms) to await a response before fallback engaging. |
| `inferenceTimeoutMs` | Number | `12000` | Model inference timeout (ms). |
| `maxContextTurns` | Number | `20` | Maximum conversation turns kept in in-memory sliding window. |
| `maxResponseTokens` | Number | `150` | Default token generation limit for conversational replies. |

### 2.4 Feature Toggles (`features`)
| Parameter | Type | Default | Description |
|---|---|---|---|
| `contextMemory` | Boolean | `true` | Enables in-memory sliding window and reference resolution. |
| `longTermPersistence` | Boolean | `true` | Enables SQLite session and preference persistence across restarts. |
| `actionExecution` | Boolean | `true` | Enables executing system commands via ActionBridge and Executor. |
| `llmFallback` | Boolean | `true` | Enables Phi-3 model fallback when fast pattern confidence is low. |
| `privacyMasking` | Boolean | `true` | Automatically masks sensitive tokens, passwords, and keys in logs. |

### 2.5 Logging & Diagnostics (`logging`)
| Parameter | Type | Default | Description |
|---|---|---|---|
| `level` | String | `"INFO"` | Minimum logging level: `"DEBUG"`, `"INFO"`, `"WARN"`, or `"ERROR"`. |
| `logDir` | String | `"logs"` | Directory where structured log files are written. |
| `logFileName` | String | `"jarvis.log"` | Active log filename. |
| `maxFileSizeBytes` | Number | `10485760` | Log file size before rotation occurs (10MB). |
| `maxFiles` | Number | `5` | Maximum number of rotated log files retained. |
| `consoleOutput` | Boolean | `true` | Whether to echo formatted log messages to the console. |

### 2.6 Model Backend (`model`)
| Parameter | Type | Default | Description |
|---|---|---|---|
| `modelPath` | String | `"models/phi-3-mini-4k-q4.gguf"` | Path to the local quantized GGUF model file. |
| `pythonServerPath` | String | `"python/llm_server.py"` | Path to the Python JSON-RPC server script. |
| `threads` | Number | `4` | CPU inference threads allocated to llama.cpp. |
| `contextWindow` | Number | `4096` | Context window size in tokens. |

---

## 3. Programmatic Usage

```javascript
import ConfigManager from './src/config-manager.js';

const config = new ConfigManager({ autoWatch: true });

// Read nested values
const formality = config.get('personality.formality');

// Update value programmatically
config.set('personality.preset', 'STRICT');

// Listen for hot-reload file updates
config.on('change', (newConfig) => {
  console.log('Configuration reloaded from disk!', newConfig.personality.preset);
});
```
