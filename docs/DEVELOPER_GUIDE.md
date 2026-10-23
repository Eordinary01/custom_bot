# JARVIS Conversational AI - Developer Architecture Guide

This guide details the internal architecture, subsystem contracts, IPC protocols, and extension workflows for the **JARVIS Conversational AI** codebase.

---

## 1. System Architecture

```
                        +---------------------------------------+
                        |       CLI / Unified Entry Point       |
                        |             assistant.js              |
                        +-------------------+-------------------+
                                            |
                                            v
                        +---------------------------------------+
                        |          JarvisOrchestrator           |
                        |              (jarvis.js)              |
                        +--+--------+--------+--------+------+--+
                           |        |        |        |      |
            +--------------+        |        |        |      +--------------+
            v                       v        v        v                     v
    +---------------+       +-------+--+  +--+-----+  +--------------+  +---------------+
    | ConfigManager |       | Logger   |  | Memory |  | FactExtractor|  | AudioInterface|
    | (Hot-Reload)  |       | (Rotate) |  | (SQLite)|  | (Continuous) |  | (SAPI TTS)    |
    +---------------+       +----------+  +--------+  +--------------+  +---------------+
                                            |
                         [Input + Resolved Context]
                                            v
                        +---------------------------------------+
                        |      Intent Classification Layer      |
                        |     (Fast Regex -> LLM Fallback)      |
                        +-------------------+-------------------+
                                            |
                          +-----------------+-----------------+
                          |                                   |
                          v [Action Intent]                   v [Conversational]
              +-----------------------+           +-----------------------+
              |     ActionBridge      |           |   ResponseGenerator   |
              |   (60 Actions + Safe  |           |   (Persona Presets +  |
              |  Destructive Gating)  |           |    Tone Adaptation)   |
              +-----------+-----------+           +-----------+-----------+
                          |                                   |
                          v                                   v
              +-----------------------+           +-----------------------+
              |      Executor.js      |           |       LLMEngine       |
              |  (Direct OS Actions)  |           | (Phi-3 Mini 4K GGUF)  |
              +-----------+-----------+           +-----------+-----------+
                          |                                   |
                          |                                   v [JSON-RPC Streaming]
                          |                       +-----------------------+
                          |                       |   python/llm_server   |
                          |                       |     (llama-cpp)       |
                          |                       +-----------+-----------+
                          |                                   |
                          +-----------------+-----------------+
                                            |
                                  [Synthesized Output]
                                            v
                                +-----------------------+
                                |  Progressive Stream   |
                                |    (stdout / TTS)     |
                                +-----------------------+
```

---

## 2. Directory Structure

```
custom_bot/
├── assistant.js                   # Universal CLI entry point (classic & jarvis modes)
├── jarvis.js                      # Core JARVIS Orchestrator pipeline
├── executor.js                    # 60+ Windows OS automation actions
├── commandRouter.js               # Legacy fast regex command matcher
├── config/
│   └── default.json               # Default configuration schema
├── docs/
│   ├── CONFIGURATION.md           # Configuration options manual
│   ├── DEVELOPER_GUIDE.md         # Architecture & developer guide (this file)
│   ├── MIGRATION.md               # v1 to v2 migration & backward compatibility
│   ├── TRAINING_GUIDE.md          # LoRA fine-tuning & dataset guide
│   ├── USER_GUIDE.md              # User interaction & command directory
│   └── VOICE_INTEGRATION.md       # Audio interface & STT/TTS specification
├── models/
│   └── phi-3-mini-4k-q4.gguf      # Quantized 3.8B local model (~2.3GB)
├── python/
│   ├── llm_server.py              # Persistent stdio JSON-RPC inference server
│   └── training/
│       ├── data_generator.py      # Synthetic dataset generator (17k+ pairs)
│       ├── dataset_validator.py   # Integrity validator & 80/10/10 partitioner
│       ├── train.py               # QLoRA fine-tuning with early stopping
│       ├── export_model.py        # LoRA adapter merging & GGUF export
│       └── evaluate.py            # Test partition benchmark & loss evaluator
├── src/
│   ├── action-bridge.js           # 60-action semantic bridge & ambiguity detector
│   ├── audio-interface.js         # Future-proof audio/TTS formatting hooks
│   ├── config-manager.js          # Hot-reloading configuration manager
│   ├── context-manager.js         # 20-turn sliding window & pronoun resolution
│   ├── intent-classifier.js       # Fast regex + LLM two-stage classifier
│   ├── llm-engine.js              # Node.js subprocess manager for Python LLM
│   ├── logger.js                  # Structured JSON logger with privacy redaction
│   ├── memory-store.js            # Native SQLite long-term storage
│   ├── prompt-templates.js        # Phi-3 Instruct prompt builders
│   └── response-generator.js      # Persona synthesis & emotion detector
└── tests/                         # Full automated test suites
```

---

## 3. Subsystem Lifecycle & Contracts

### 3.1 Intent Classification Pipeline
1. **Stage 1 (Fast Pattern Matcher)**:
   - Uses compiled regex word boundaries to match canonical commands in `< 1ms`.
   - Returns confidence $\ge 0.85$ on match.
2. **Stage 2 (LLM Fallback)**:
   - Invoked when Stage 1 confidence $< 0.80$.
   - Prompts local LLM via `buildIntentClassificationPrompt` with classification constraints.
   - Categorizes query into `action`, `conversational`, or `hybrid`.

### 3.2 Action Bridge (`src/action-bridge.js`)
- Enforces strict parameter validation for all 60 actions.
- Detects ambiguous requests (`check my email` -> Gmail vs. Outlook) and triggers interactive clarification.
- Enforces `dryRun: true` mode during automated tests to avoid OS side effects.

### 3.3 Context & Memory (`src/context-manager.js` & `src/memory-store.js`)
- **Short-Term Context**: In-memory sliding window maintaining the last 20 conversation turns.
- **Reference Resolution**: Resolves pronouns ("it", "that", "the browser", "again") to previous entities.
- **Long-Term Storage**: Native `node:sqlite` DatabaseSync storing conversation turns, sessions, user preferences, and entities with 30-day retention pruning.

### 3.4 Python LLM Server IPC Protocol
- Communication with `python/llm_server.py` operates via standard I/O (stdio) using single-line JSON RPC:
  - **Request**: `{"id": "req-1", "prompt": "<|system|>...", "max_tokens": 150, "temperature": 0.7}\n`
  - **Response**: `{"id": "req-1", "status": "ok", "text": "...", "tokens": 42, "latency_ms": 120}\n`
- Automatically respawns crashed subprocesses and includes health checks.

---

## 4. How to Add a New System Action

To register a new system action:

1. **Implement the Action in `executor.js`**:
   ```javascript
   case 'open_vlc':
     exec('start vlc');
     this.lastResponse = 'Opening VLC Media Player';
     break;
   ```

2. **Register Action in `src/action-bridge.js`**:
   - Add to `VALID_ACTIONS` Set:
     ```javascript
     'open_vlc',
     ```
   - Add semantic mapping to `ACTION_METADATA`:
     ```javascript
     open_vlc: {
       label: 'VLC Media Player',
       category: ACTION_CATEGORIES.APPLICATION,
       defaultResponse: 'Opening VLC Media Player',
       patterns: ['open vlc', 'launch vlc', 'play media in vlc', 'vlc player'],
       keywords: ['vlc', 'media player'],
       alternatives: ['open_spotify']
     }
     ```

3. **Verify with Action Bridge Tests**:
   ```bash
   npm run test:bridge
   ```

---

## 5. Testing & Verification

JARVIS includes a comprehensive multi-tier automated test suite:

```bash
# Run all 12 unit test suites
npm run test:unit

# Run cross-component integration test
npm run test:cross

# Run end-to-end scenario tests (5+ turns, hybrid, 3-strike)
npm run test:e2e

# Run latency, load, and memory benchmarks
npm run test:perf

# Run training pipeline dry-run verification
npm run test:training

# Run dynamic agent architecture verification
npm run test:dynamic

# Run the master comprehensive test suite
npm run test:comprehensive
```

---

## 6. JARVIS v2.0 Dynamic Agent Architecture

JARVIS v2.0 introduces five core architectural pillars transforming the assistant from a reactive command-responder into an autonomous, voice-first desktop companion:

### 6.1 Dynamic Memory & Conflict Resolution
- **Versioned Fact Store**: Facts are recorded in SQLite with schema columns `(confidence, source_turn_id, created_at, superseded_by, embedding, sensitivity)`.
- **Automatic Conflict Pointer**: When an existing active fact is updated (e.g. user moved from London to Berlin), `MemoryStore.upsertFact` marks the prior record with `superseded_by = new_id`, preserving audit history while keeping active retrieval clean.
- **Zero-Dependency Vector Embeddings**: In-process feature hashing (`src/embedding-helper.js`) generates 64-dimensional dense vectors stored as SQLite BLOBs, enabling sub-millisecond semantic search via `MemoryStore.searchFactsSemantic()`.

### 6.2 Dynamic Persona Selection & Hard-Pin Override
- **Single-Pass Classification**: In a single pass, `IntentClassifier` outputs `{ type, action, persona, tone, isPinned }`.
- **Per-Turn Persona Drift**: Automatically infers persona from conversational tone:
  - System commands $\rightarrow$ `strict` (concise)
  - Casual questions $\rightarrow$ `casual` (friendly)
  - Slang, enthusiasm, nicknames $\rightarrow$ `buddy` (witty)
  - Polite scientific inquiries $\rightarrow$ `balanced` (courteous)
- **Hard-Pin Override**: Passing `--personality <preset>` locks the persona across all turns (`isPinned = true`), bypassing dynamic adaptation.

### 6.3 Voice-First by Default & Streamed TTS
- **Always-Spoken Output**: Voice synthesis via Windows native SAPI (`System.Speech`) is enabled by default across all conversational turns (typed or spoken input). Users can opt out with `--mute` or `--silent`.
- **Sentence-Chunked Streaming TTS**: `StreamSpeechBuffer` monitors incoming tokens during local SLM generation. As each sentence delimiter (`.`, `!`, `?`, `\n`) is encountered, the completed sentence is immediately synthesized while the model continues generating.
- **Sensitive Fact Speech Shield**: Facts tagged as `sensitive` (passwords, tokens, credentials, health, banking) are masked during vocalization (`AudioInterface.isSensitive()`), informing the user that sensitive details are displayed on screen only.

### 6.4 Safe Environmental & Browser Observation
- **Zero-Execution Isolation**: `SystemObserver` (`src/system-observer.js`) runs strictly read-only queries with zero OS modification capability.
- **Security Blocklists**: Automatically filters out banking domains (`chase.com`, `paypal.com`), auth providers (`accounts.google.com`, `okta.com`), and healthcare portals (`mychart`).
- **Incognito Exclusion**: Drops any windows matching Incognito, InPrivate, or Private Browsing.
- **Safe SQLite WAL Copy**: Copies live browser databases and their `-wal`/`-shm` companion files to a temporary scratch directory before executing read-only queries, preventing database locks.
- **Strict XML Prompt Fencing**: Wraps observed data in `<observed_data source="...">...sanitized data...</observed_data>`, neutralizing prompt injection tokens (`<|system|>`, control tokens, and fence escapes).

### 6.5 Safe Continuous Improvement
- **Destructive Action Invariant**: High-impact system operations (`shutdown`, `restart`, `delete_file`) and credentials are strictly excluded from training dataset exports (`scripts/export_chat_dataset.js`).
- **Automated Evaluation Gate**: `scripts/train_buddy.py` runs a multi-point verification gate validating weight existence, parameter shapes, and safety invariants before promoting newly trained adapters to production.

