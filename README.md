# 🤖 JARVIS Conversational AI (v3.0)

> **A 100% local, privacy-first conversational desktop assistant for Windows.**  
> Powered by an embedded Small Language Model (SLM - Phi-3 Mini 4K Instruct), dynamic vector memory, local-first search, and a high-performance system execution bridge with zero commercial external API dependencies.

---

## 🌟 Key Highlights

- **🔒 100% Local & Privacy-First**: Operates completely on your machine. Zero cloud APIs, zero subscription fees, and complete data privacy.
- **🗣️ Voice-First by Default**: Native local Text-to-Speech active on every turn (whether input is typed or spoken) with `--mute` / `--silent` opt-out. Default Windows SAPI (`Microsoft David Desktop` / `Microsoft Zira Desktop`) for zero-install speech, plus optional Piper neural TTS (`en_GB-alan-medium`). Features sentence-chunked streaming TTS and sensitive fact speech shielding.
- **🌐 Local-First Web Search & Content Grounding**: Self-hosted meta-search via local SearxNG (`http://localhost:8080`) with zero vendor tracking or API keys. Enforces strict grounding rules: time-sensitive news/prices decline honestly when offline rather than hallucinating.
- **⚡ Real-Time Progressive Streaming**: Token-by-token streaming output on stdout with sub-second Time to First Token (**TTFT < 850 ms**).
- **🎭 Dynamic Persona Drift & Hard-Pin**: Automatically drifts between **Strict** (OS tasks), **Balanced** (intellectual), **Casual**, and **Buddy** (companion banter) per turn, tracking multi-turn conversational frustration or camaraderie, with `--personality` available as a hard-pin override.
- **🧠 Dynamic Memory & Conflict Resolution**: Discovers facts, nicknames, and preferences online. Implements versioned `superseded_by` conflict resolution, feature hashing vector embeddings, semantic vector retrieval, and 30-day TTL fact retention.
- **🛡️ Safe Environmental & Browser Observation**: Standalone `SystemObserver` module with domain blocklists (banking, healthcare, credentials), incognito filtering, safe SQLite WAL copy, and strict `<observed_data>` XML prompt fencing against prompt injection.
- **⚡ 60+ System Automation Actions**: Seamless control over Windows applications, volume, brightness, browser tabs, power states, and file operations.
- **💬 Pronoun & Context Resolution**: Automatically tracks conversation subjects and resolves referential pronouns (*"Let's focus on Chrome" -> "Could you open it?" -> "Now please maximize it"*).
- **🔀 Hybrid Intent Execution**: Handles compound requests seamlessly (*"Open Notepad and tell me what time it is"*).
- **🛑 Destructive-Action Safety Invariant**: High-impact operations (`shutdown`, `restart`, `delete_file`) are gated by confirmation prompts and strictly excluded from fine-tuning datasets.
- **🚀 Safe Continuous Improvement Pipeline**: Online conversation export (`npm run data:export-chat`), QLoRA fine-tuning (`npm run train:buddy`), and an automated **Evaluation Gate** that validates safety invariants before promoting adapters.

---

## 🏗️ Architecture Overview

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

## 🚀 Quick Start

### 1. Prerequisites
- **Node.js**: `v22.5.0+` (uses native `node:sqlite`, which was introduced in Node.js 22.5.0)
- **Python**: `v3.10+` (for local LLM inference server and training pipeline)

### 2. Hardware Requirements (Local SLM Inference)
- **Architecture**: 64-bit x86 processor (AVX2 instruction support recommended for CPU acceleration)
- **System Memory (RAM)**: Minimum 8 GB (for OS + Node runtime + SLM); 16 GB recommended
- **Disk Storage**: ~3 GB free storage (~2.39 GB for `phi-3-mini-4k-q4.gguf` model weights)
- **Default Quantization**: Q4_K_M (Phi-3 Mini 4K Instruct, 3.82B parameters)
- **Inference Speed**: ~5–8 tokens/sec on baseline 4-8 core x86 CPUs (e.g. AMD Ryzen 5 / Intel Core i5/i7); ~25–40 tokens/sec with GPU acceleration (`n_gpu_layers > 0`)

### 3. Setup
```bash
# Clone the repository
git clone https://github.com/parth-manocha/custom_bot.git
cd custom_bot

# Install Node dependencies
npm install

# Activate Python Virtual Environment
.\venv\Scripts\Activate.ps1
```

### 4. Launching JARVIS
```bash
# (Optional) Launch local SearxNG search aggregator before starting:
npm run dev:searx

# Launch interactive JARVIS in voice-first conversational mode (offline by default)
node assistant.js

# Launch with live meta-search enabled (hits SearxNG or automatic DuckDuckGo fallback)
node assistant.js --online

# Launch in quiet text-only mode (mute Text-to-Speech)
node assistant.js --mute

# Launch with pinned open-world Buddy / Companion mode
node assistant.js --personality buddy

# Safe Dry-Run Mode (Simulates all OS actions safely)
node assistant.js --dry-run

# Run with formal butler personality
node assistant.js --personality strict

# Continuous learning: Export conversation history into fine-tuning dataset
npm run data:export-chat

# Continuous learning: Fine-tune local LoRA adapter on your conversation data
npm run train:buddy

# Legacy Classic Mode (v1.0 pattern router)
node assistant.js --mode classic
```

---

## 📖 Documentation Directory

Comprehensive documentation is available in the [`docs/`](docs/) folder:

- **[User Guide](docs/USER_GUIDE.md)**: Natural interaction patterns, complete 60+ command directory, and personality presets.
- **[Developer Guide](docs/DEVELOPER_GUIDE.md)**: Architecture diagrams, subsystem interfaces, IPC protocol, and adding new actions.
- **[Configuration Manual](docs/CONFIGURATION.md)**: Schema parameters, bounds, and hot-reload behavior.
- **[Migration Guide](docs/MIGRATION.md)**: Upgrading from v1.0 to v2.0 and backward compatibility guarantees.
- **[Training Pipeline Guide](docs/TRAINING_GUIDE.md)**: QLoRA fine-tuning, dataset generation, LoRA merging, and GGUF quantization.
- **[Voice Integration Guide](docs/VOICE_INTEGRATION.md)**: Offline STT (Whisper) & TTS (Piper) audio architecture.

---

## ⚡ Performance Benchmarks

> **Hardware Baseline**: AMD Ryzen 5 5500U (6 physical cores / 12 threads @ 2.1–4.0 GHz), 16 GB DDR4 RAM, Windows 11 64-bit, Node.js v24.19.0.  
> Benchmarks measured via `npm run test:perf` across warm runs (sample sizes noted).

### Fast-Path Regex & Subsystem Latencies (N = 50–100 runs)

| Component / Subsystem | Execution Path | Target | Measured Latency | Throughput / Status |
|---|---|---|---|---|
| **Fast Intent Classification** | Regex Fast-Path | < 200 ms | **0.05 ms** (P95: 0.09 ms, Max: 1.03 ms) | 🚀 20,000 req/s (✅ PASS) |
| **Simple Action Execution** | Direct OS Exec | < 500 ms | **5.25 ms** (P50: 2.62 ms, P95: 10.17 ms) | 🚀 95x faster than limit (✅ PASS) |
| **Context Window Retrieval** | In-Memory Sliding Window | < 100 ms | **< 0.01 ms** (P95: 0.002 ms) | 🚀 10,000x faster than limit (✅ PASS) |
| **SQLite Keyword Memory Search**| Native `node:sqlite` | < 500 ms | **0.54 ms** (P95: 0.97 ms) | 🚀 925x faster than limit (✅ PASS) |
| **Burst Concurrency Load (100 reqs)** | Sustained Pipeline | < 200 ms avg | **3.23 ms avg** | 🚀 P99 = 6.56 ms (308.6 req/s) |
| **Process Heap Memory Usage** | Node V8 Engine | < 200 MB | **11.04 MB** (RSS: 59.07 MB) | 🚀 < 6% of maximum limit |

### Local SLM Fallback Path (Neural Inference Benchmark)

The local LLM fallback path runs full neural language model inference (Phi-3 Mini 4K Instruct, Q4_K_M GGUF) via `llama-cpp-python` when fast regex patterns do not match:

| Metric | Target | Measured Baseline (Mobile CPU) | Measured Baseline (Warm / Desktop) | Measurement Details |
|---|---|---|---|---|
| **Time to First Token (TTFT)** | < 1,500 ms | **~1,200 ms** | **~850 ms** | 4 CPU threads, warm context |
| **Total Inference Latency (25 tokens)** | < 30,000 ms | **23,641 ms** (cold) | **4,306 ms** (warm) | 25 tokens generated |
| **Tokens per Second (Generation)** | > 0.5 tok/s | **1.06 tok/s** (cold mobile) | **5.81 tok/s** (warm CPU) | CPU-only AVX2 (~25-40 tok/s GPU) |
| **Model Cold Load Time into RAM** | < 10,000 ms | **6,437 ms** | **6,437 ms** | One-time cold load from NVMe SSD |
| **Voice Mode Concurrent Load (STT+LLM+TTS)** | < 6,000 ms | **N/A** | **4,850 ms** | 4 threads LLM + spawned SAPI synth |

> **CPU Core & Concurrency Budget**: On 6-core Ryzen processors, the LLM engine is pinned to 4 CPU threads, leaving 2 physical cores dedicated to the OS event loop, STT transcription, and asynchronous SAPI/Piper TTS synthesis. Within each response, streamed sentence chunking overlaps generation and vocalization; cross-turn execution is serialized strictly to prevent acoustic contention and CPU starvation.

---

## 🧪 Automated Testing

JARVIS is backed by an automated testing pyramid:

```bash
# Run all 12 component unit test suites
npm run test:unit

# Run cross-component integration test
npm run test:cross

# Run end-to-end scenario tests (5+ turns, hybrid, 3-strike)
npm run test:e2e

# Run latency, throughput, and memory benchmarks
npm run test:perf

# Run training pipeline dry-run verification
npm run test:training

# Run the master comprehensive test suite
npm run test:comprehensive
```

---

## 📄 License
MIT License. Built with privacy and local autonomy in mind.
