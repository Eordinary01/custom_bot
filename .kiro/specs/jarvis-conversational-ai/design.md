# Technical Design Document: JARVIS Conversational AI Assistant

## 1. Executive Summary

This document provides the technical design for transforming the Custom Bot from a pattern-matching command assistant into a JARVIS-like conversational AI system. The design leverages local language models, fine-tuning capabilities, and a sophisticated intent classification system while preserving the existing robust command execution infrastructure.

**Key Design Principles:**
- 100% local operation (no external APIs)
- Seamless integration with existing Executor system
- Modular architecture for easy testing and maintenance
- Performance-optimized for real-time conversation
- Extensible for future capabilities (voice, multimodal)

---

## 2. System Architecture

### 2.1 High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         User Interface Layer                      │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐          │
│  │ Text Input   │  │ Voice Input  │  │ GUI (Future) │          │
│  │ (Readline)   │  │ (Future)     │  │              │          │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘          │
└─────────┼──────────────────┼──────────────────┼──────────────────┘
          │                  │                  │
          └──────────────────┴──────────────────┘
                             │
          ┌──────────────────▼─────────────────────┐
          │    JARVIS Assistant Orchestrator       │
          │  (Main controller & conversation loop)  │
          └──────────────────┬─────────────────────┘
                             │
       ┌─────────────────────┼─────────────────────┐
       │                     │                     │
  ┌────▼────┐         ┌──────▼──────┐      ┌──────▼──────┐
  │ Context │         │   Intent    │      │  Response   │
  │ Manager │◄────────┤ Classifier  │──────►  Generator  │
  └────┬────┘         └──────┬──────┘      └──────┬──────┘
       │                     │                     │
       │              ┌──────▼──────┐              │
       │              │   Local     │              │
       │              │  LLM Engine │◄─────────────┘
       │              └──────┬──────┘
       │                     │
       │              ┌──────▼──────┐
       │              │   Model     │
       │              │   Cache     │
       │              └─────────────┘
       │
  ┌────▼─────────────────────────────────┐
  │      Action Execution Layer          │
  │  ┌──────────────┐  ┌──────────────┐ │
  │  │   Executor   │  │   Command    │ │
  │  │  (existing)  │◄─┤   Router     │ │
  │  │              │  │  (existing)  │ │
  │  └──────────────┘  └──────────────┘ │
  └──────────────────────────────────────┘
          │
  ┌───────▼───────────────────────────────┐
  │       Persistence Layer               │
  │  ┌──────────┐  ┌──────────┐          │
  │  │ Memory   │  │  Config  │          │
  │  │  Store   │  │  Store   │          │
  │  └──────────┘  └──────────┘          │
  └────────────────────────────────────────┘

       TRAINING PIPELINE (Offline)
  ┌────────────────────────────────────────┐
  │  ┌──────────────┐  ┌──────────────┐   │
  │  │ Training     │  │ Data         │   │
  │  │ Orchestrator │◄─┤ Generator    │   │
  │  └──────┬───────┘  └──────────────┘   │
  │         │                              │
  │  ┌──────▼───────┐  ┌──────────────┐   │
  │  │ Fine-Tuning  │  │ Model        │   │
  │  │ Engine       │─►│ Evaluator    │   │
  │  └──────────────┘  └──────────────┘   │
  └────────────────────────────────────────┘
```

### 2.2 Technology Stack

| Layer | Technology | Rationale |
|-------|-----------|-----------|
| **Language Model** | Phi-3-mini-4k (3.8B params) | Microsoft's efficient small model, excellent for conversations, quantizable to 4-bit |
| **Alternative Models** | Llama 3.2 (3B), Gemma 2 (2B) | Backup options for different performance/quality tradeoffs |
| **Inference Engine** | llama.cpp (via llama-cpp-python) | Fast C++ inference, quantization support, runs on CPU/GPU |
| **Model Quantization** | GGUF 4-bit (Q4_K_M) | Reduces 3.8B model from ~7.6GB to ~2.3GB with minimal quality loss |
| **Fine-Tuning Framework** | Hugging Face transformers + PEFT (LoRA) | Industry standard, LoRA enables efficient fine-tuning |
| **Training Acceleration** | bitsandbytes (8-bit), CUDA | GPU acceleration for training |
| **Intent Classification** | Lightweight distilled model OR regex + LLM | Fast initial classification, LLM for complex cases |
| **Context Management** | SQLite + JSON | Lightweight, reliable, no external DB required |
| **Configuration** | JSON with JSON Schema validation | Simple, human-readable, validated |
| **Logging** | Winston (Node.js) | Structured logging with rotation |
| **Language Runtime** | Node.js (existing) + Python (for ML) | Leverage existing codebase, Python for ML tasks |
| **IPC** | Child process + JSON-RPC over stdio | Communication between Node.js and Python |

---

## 3. Component Design

### 3.1 JARVIS Assistant Orchestrator

**Responsibility:** Main controller that manages the conversation loop and coordinates all components.

**Interface:**
```javascript
class JarvisAssistant {
  constructor(config) {
    this.contextManager = new ContextManager(config);
    this.intentClassifier = new IntentClassifier(config);
    this.responseGenerator = new ResponseGenerator(config);
    this.llmEngine = new LLMEngine(config);
    this.executor = new Executor();
    this.config = config;
  }

  async processInput(userInput) {
    // 1. Add to context
    this.contextManager.addUserMessage(userInput);
    
    // 2. Classify intent
    const intent = await this.intentClassifier.classify(
      userInput,
      this.contextManager.getRecentContext()
    );
    
    // 3. Route based on intent type
    let response;
    if (intent.type === 'action' || intent.type === 'hybrid') {
      response = await this.executeAction(intent);
    }
    if (intent.type === 'conversational' || intent.type === 'hybrid') {
      response = await this.generateConversationalResponse(intent, userInput);
    }
    
    // 4. Add response to context
    this.contextManager.addAssistantMessage(response);
    
    return response;
  }

  async executeAction(intent) { /* ... */ }
  async generateConversationalResponse(intent, input) { /* ... */ }
}
```

**State Management:**
- Current conversation session
- Active model instance
- Configuration parameters
- Performance metrics

---

### 3.2 Local LLM Engine

**Responsibility:** Manages model loading, inference, and caching.

**Architecture:**
```
Python Process (llm_server.py)
├─ Model Loader
│  ├─ GGUF model loading
│  ├─ Quantization config
│  └─ GPU/CPU detection
├─ Inference Pipeline
│  ├─ Prompt formatting
│  ├─ Token generation
│  └─ Sampling parameters
└─ Response Formatter
   ├─ Token decoding
   └─ Post-processing

Node.js Client (llmEngine.js)
├─ Process Manager
│  ├─ Start Python server
│  ├─ Health checks
│  └─ Restart on failure
└─ JSON-RPC Client
   ├─ Request formatting
   └─ Response handling
```

**Communication Protocol (JSON-RPC over stdio):**
```json
// Request
{
  "jsonrpc": "2.0",
  "method": "generate",
  "params": {
    "prompt": "...",
    "max_tokens": 150,
    "temperature": 0.7,
    "stop": ["User:", "\n\n"]
  },
  "id": 1
}

// Response
{
  "jsonrpc": "2.0",
  "result": {
    "text": "...",
    "tokens": 45,
    "inference_time_ms": 342
  },
  "id": 1
}
```

**Model Files Structure:**
```
models/
├── phi-3-mini-4k-q4.gguf           # Main model (2.3GB)
├── intent-classifier-distilbert/   # Lightweight classifier
│   ├── model.onnx
│   └── tokenizer.json
└── config.json                     # Model configs
```

---

### 3.3 Intent Classifier

**Responsibility:** Determine if input requires action, conversation, or both.

**Two-Stage Classification:**

**Stage 1: Fast Pattern Matching (20ms)**
```javascript
class FastIntentMatcher {
  match(input) {
    const lower = input.toLowerCase();
    
    // Action keywords
    if (/\b(open|close|start|launch|stop|shutdown|restart|lock)\b/.test(lower)) {
      return { type: 'action', confidence: 0.9 };
    }
    
    // System control keywords
    if (/\b(volume|mute|minimize|maximize)\b/.test(lower)) {
      return { type: 'action', confidence: 0.9 };
    }
    
    // Question patterns
    if (/^(what|when|where|why|how|who|can you|could you|tell me)\b/.test(lower)) {
      return { type: 'conversational', confidence: 0.8 };
    }
    
    // Hybrid indicators
    if (/\b(and|then|after|also)\b/.test(lower)) {
      return { type: 'needs_llm', confidence: 0.5 };
    }
    
    return { type: 'needs_llm', confidence: 0.0 };
  }
}
```

**Stage 2: LLM-Based Classification (if confidence < 0.8)**
```python
# Prompt template for intent classification
INTENT_PROMPT = """You are an intent classifier. Classify the user input into one of:
- action: User wants to execute a system command
- conversational: User wants to chat or ask questions
- hybrid: User wants both action and conversation

User: {input}
Recent context: {context}

Respond with ONLY the classification word.
Classification:"""
```

**Intent Types:**
```javascript
const IntentType = {
  ACTION: 'action',              // "open chrome"
  CONVERSATIONAL: 'conversational', // "how are you?"
  HYBRID: 'hybrid',              // "open chrome and tell me a joke"
  UNKNOWN: 'unknown'             // Fallback
};
```

---

### 3.4 Response Generator

**Responsibility:** Generate natural language responses with JARVIS personality.

**Prompt Engineering:**
```javascript
const JARVIS_SYSTEM_PROMPT = `You are JARVIS, an AI assistant inspired by Tony Stark's JARVIS from Iron Man. Your personality traits:
- Professional and efficient
- Helpful and knowledgeable
- Slightly witty and clever
- Respectful (use "sir" occasionally, but not excessively)
- Calm and reassuring in errors
- Concise but informative

Communication style:
- Use formal but approachable language
- Avoid slang and emojis
- Keep responses under 3 sentences for simple queries
- Provide detailed explanations when asked
- Acknowledge commands with brief confirmations

Current date: {date}
Current time: {time}
User name: {user_name}

Respond naturally to the user's message.`;

class ResponseGenerator {
  async generate(userInput, context, intent) {
    const conversationHistory = this.formatContext(context);
    
    const prompt = `${JARVIS_SYSTEM_PROMPT}

${conversationHistory}

User: ${userInput}
JARVIS:`;

    const response = await this.llmEngine.generate({
      prompt,
      max_tokens: 150,
      temperature: 0.7,
      top_p: 0.9,
      stop: ["User:", "JARVIS:", "\n\n\n"]
    });

    return this.postProcess(response);
  }

  formatContext(context) {
    // Format last 5 turns for context
    return context.slice(-5).map(turn => 
      `${turn.role === 'user' ? 'User' : 'JARVIS'}: ${turn.content}`
    ).join('\n');
  }

  postProcess(response) {
    // Remove artifacts, trim, ensure proper ending
    return response.trim()
      .replace(/^JARVIS:\s*/i, '')
      .replace(/\s+$/, '.');
  }
}
```

---

### 3.5 Context Manager

**Responsibility:** Maintain conversation history and session state.

**Data Structures:**
```javascript
// Short-term memory (in-memory)
class ConversationContext {
  constructor(maxTurns = 20) {
    this.turns = [];  // Array of {role, content, timestamp}
    this.maxTurns = maxTurns;
    this.sessionId = uuid.v4();
    this.startedAt = new Date();
  }

  addTurn(role, content) {
    this.turns.push({
      role,       // 'user' | 'assistant'
      content,
      timestamp: new Date()
    });

    // Maintain window size
    if (this.turns.length > this.maxTurns) {
      this.turns.shift();
    }
  }

  getRecentContext(n = 5) {
    return this.turns.slice(-n);
  }

  getAllContext() {
    return this.turns;
  }
}
```

**Long-term Memory (SQLite):**
```sql
-- Schema
CREATE TABLE conversation_sessions (
  session_id TEXT PRIMARY KEY,
  started_at DATETIME,
  ended_at DATETIME,
  summary TEXT,
  turn_count INTEGER
);

CREATE TABLE conversation_turns (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT,
  role TEXT,  -- 'user' or 'assistant'
  content TEXT,
  timestamp DATETIME,
  FOREIGN KEY (session_id) REFERENCES conversation_sessions(session_id)
);

CREATE TABLE user_preferences (
  key TEXT PRIMARY KEY,
  value TEXT,
  updated_at DATETIME
);

CREATE TABLE entities (
  name TEXT PRIMARY KEY,
  type TEXT,  -- 'person', 'place', 'thing', 'concept'
  properties JSON,
  created_at DATETIME
);
```

**Context Retrieval:**
```javascript
class ContextManager {
  async loadRelevantContext(currentInput) {
    // 1. Get current session context (last 20 turns)
    const recent = this.currentSession.getAllContext();
    
    // 2. Search long-term memory for relevant past conversations
    const relevant = await this.searchHistory(currentInput);
    
    // 3. Combine and prioritize
    return {
      recent,      // Always included
      historical: relevant.slice(0, 3)  // Top 3 relevant past conversations
    };
  }

  async searchHistory(query) {
    // Simple keyword-based search for now
    // Can be upgraded to semantic search with embeddings
    const sql = `
      SELECT session_id, content, timestamp
      FROM conversation_turns
      WHERE role = 'user' AND content LIKE ?
      ORDER BY timestamp DESC
      LIMIT 10
    `;
    return await this.db.all(sql, `%${query}%`);
  }
}
```

---

### 3.6 Action Executor Integration

**Responsibility:** Bridge between intent classification and existing Executor system.

**Natural Language to Action Mapping:**
```javascript
class ActionExecutorBridge {
  constructor(executor, commandRouter) {
    this.executor = executor;
    this.commandRouter = commandRouter;
    this.actionMap = this.buildActionMap();
  }

  buildActionMap() {
    // Map common natural language patterns to actions
    return {
      // Direct mappings
      'open chrome': 'open_chrome',
      'launch chrome': 'open_chrome',
      'start chrome': 'open_chrome',
      
      // Semantic mappings
      'browse the web': 'open_chrome',
      'surf the internet': 'open_chrome',
      'check my email': 'open_gmail',
      
      // System actions
      'turn up volume': 'volume_up',
      'make it louder': 'volume_up',
      'increase sound': 'volume_up',
      
      // ... 60+ mappings
    };
  }

  async executeFromNaturalLanguage(input, llmEngine) {
    // 1. Try direct pattern match first
    const directMatch = this.commandRouter.match(input);
    if (directMatch) {
      return await this.executor.run(directMatch.action, input);
    }

    // 2. Check semantic mapping
    const semanticAction = this.findSemanticMatch(input);
    if (semanticAction) {
      return await this.executor.run(semanticAction, input);
    }

    // 3. Use LLM to extract action intent
    const extractedAction = await this.extractActionWithLLM(input, llmEngine);
    if (extractedAction && this.isValidAction(extractedAction)) {
      return await this.executor.run(extractedAction, input);
    }

    // 4. Fallback
    return {
      success: false,
      message: "I'm not sure how to execute that action. Could you rephrase?"
    };
  }

  async extractActionWithLLM(input, llmEngine) {
    const prompt = `Given the user request, extract the system action needed.

Valid actions: ${this.getValidActions().join(', ')}

User request: "${input}"

Action (respond with ONLY the action name, or "NONE" if no action):`;

    const response = await llmEngine.generate({
      prompt,
      max_tokens: 20,
      temperature: 0.3
    });

    return response.text.trim().toLowerCase();
  }

  getValidActions() {
    return Object.values(this.actionMap);
  }

  isValidAction(action) {
    return this.getValidActions().includes(action);
  }
}
```

---

## 4. Training Pipeline Design

### 4.1 Training Architecture

```
Training Workflow
├─ 1. Data Collection & Generation
│  ├─ Manual conversation examples
│  ├─ Synthetic data generation
│  └─ Existing command patterns conversion
├─ 2. Data Preprocessing
│  ├─ Formatting & validation
│  ├─ Deduplication
│  └─ Train/val/test split (80/10/10)
├─ 3. Base Model Selection
│  ├─ Download Phi-3-mini-4k
│  └─ Convert to training format
├─ 4. LoRA Fine-Tuning
│  ├─ Configure LoRA (r=16, alpha=32)
│  ├─ Training loop (AdamW, lr=2e-4)
│  └─ Evaluation on validation set
├─ 5. Model Merging & Export
│  ├─ Merge LoRA weights with base
│  └─ Export to GGUF format
└─ 6. Quantization & Testing
   ├─ Quantize to 4-bit (Q4_K_M)
   └─ Final evaluation on test set
```

### 4.2 Training Data Format

**JSON Lines (.jsonl):**
```json
{"input": "Hey JARVIS, can you open Chrome for me?", "output": "Opening Google Chrome right away, sir.", "intent": "action", "action": "open_chrome"}
{"input": "What time is it?", "output": "The current time is 3:45 PM.", "intent": "conversational"}
{"input": "Tell me a joke and open the calculator", "output": "Why don't scientists trust atoms? Because they make up everything! Opening calculator now.", "intent": "hybrid", "action": "open_calculator"}
{"input": "How are you doing today?", "output": "I'm functioning optimally, thank you for asking. How may I assist you?", "intent": "conversational"}
{"input": "Shut down the computer", "output": "Initiating system shutdown in 10 seconds.", "intent": "action", "action": "shutdown"}
```

### 4.3 Data Generation Strategy

**1. Convert Existing Commands (60+ examples):**
```javascript
// Auto-generate training data from commands.json
function generateTrainingFromCommands(commands) {
  const training = [];
  
  for (const cmd of commands) {
    for (const pattern of cmd.patterns) {
      // Natural variations
      training.push({
        input: `Can you ${pattern}?`,
        output: `${cmd.response || 'Executing now.'}`,
        intent: 'action',
        action: cmd.action
      });
      
      training.push({
        input: `Hey JARVIS, ${pattern}`,
        output: `Right away, sir. ${cmd.response || 'Executing.'}`,
        intent: 'action',
        action: cmd.action
      });
      
      // More variations...
    }
  }
  
  return training;
}
```

**2. Synthetic Conversation Generation:**
```python
# Use a larger model to generate training conversations
GENERATION_PROMPT = """Generate a natural conversation between a user and JARVIS (AI assistant).
The conversation should demonstrate JARVIS's personality: professional, helpful, slightly witty.

Topic: {topic}
Length: 3-5 exchanges
Format: 
User: ...
JARVIS: ...

Generate:"""

topics = [
  "general questions", "system help", "small talk", 
  "time and date", "jokes and entertainment",
  "troubleshooting", "clarification requests"
]
```

**3. Manual High-Quality Examples (100-200):**
- Complex multi-turn conversations
- Edge cases and ambiguities
- Personality showcases
- Error handling examples

**Target Dataset Size:**
- **Phase 1 (MVP):** 1,000-2,000 examples
- **Phase 2 (Production):** 5,000-10,000 examples
- **Continuous Learning:** Add new examples from user interactions (with consent)

### 4.4 Fine-Tuning Configuration

**LoRA Configuration:**
```python
from peft import LoraConfig, get_peft_model

lora_config = LoraConfig(
    r=16,                    # Rank
    lora_alpha=32,           # Scaling factor
    target_modules=[         # Which layers to adapt
        "q_proj", 
        "k_proj", 
        "v_proj", 
        "o_proj"
    ],
    lora_dropout=0.05,
    bias="none",
    task_type="CAUSAL_LM"
)
```

**Training Hyperparameters:**
```python
training_args = TrainingArguments(
    output_dir="./models/jarvis-phi3-lora",
    num_train_epochs=3,
    per_device_train_batch_size=4,
    per_device_eval_batch_size=4,
    gradient_accumulation_steps=4,  # Effective batch size: 16
    learning_rate=2e-4,
    warmup_steps=100,
    logging_steps=10,
    save_steps=500,
    eval_steps=500,
    fp16=True,                # Mixed precision training
    optim="adamw_torch",
    load_best_model_at_end=True,
    metric_for_best_model="eval_loss"
)
```

**Estimated Training Time:**
- **GPU (RTX 3060 12GB):** ~2-3 hours for 2,000 examples
- **CPU (fallback):** ~12-24 hours (not recommended)

---

## 5. Inference Pipeline

### 5.1 Request Flow

```
User Input
    │
    ├─► Context Manager (add user message)
    │
    ├─► Intent Classifier
    │   ├─ Fast Pattern Match (20ms)
    │   └─ LLM Classification (200ms) [if needed]
    │
    ├─► Route by Intent Type
    │   │
    │   ├─[action]─► Action Executor Bridge
    │   │             ├─ Pattern match → Executor
    │   │             └─ LLM extraction → Executor
    │   │
    │   ├─[conversational]─► Response Generator
    │   │                     ├─ Format prompt with context
    │   │                     ├─ LLM inference
    │   │                     └─ Post-process
    │   │
    │   └─[hybrid]─► Both paths in sequence
    │
    ├─► Context Manager (add assistant message)
    │
    └─► Return to user
```

### 5.2 Performance Budget

| Component | Target Time | Max Time |
|-----------|------------|----------|
| Context Manager (add) | 10ms | 50ms |
| Fast Intent Match | 20ms | 50ms |
| LLM Intent Classification | 200ms | 500ms |
| Action Execution | 100ms | 1000ms |
| LLM Response Generation | 300ms | 2000ms |
| Context Manager (retrieve) | 50ms | 100ms |
| **Total (simple query)** | **< 500ms** | **2000ms** |
| **Total (complex query)** | **< 1000ms** | **3000ms** |

### 5.3 Optimization Strategies

**1. Model Quantization:**
- 4-bit quantization (GGUF Q4_K_M)
- Reduces model size from 7.6GB → 2.3GB
- Minimal quality degradation (<2% perplexity increase)
- 2-3x inference speed improvement

**2. KV Cache:**
```python
# Enable KV cache for faster multi-turn conversations
llm = Llama(
    model_path="phi-3-mini-4k-q4.gguf",
    n_ctx=4096,           # Context window
    n_threads=8,          # CPU threads
    n_gpu_layers=35,      # Offload to GPU (if available)
    use_mlock=True,       # Lock model in RAM
    use_mmap=True         # Memory-map model file
)
```

**3. Prompt Optimization:**
- Keep prompts concise (< 1000 tokens)
- Use efficient context formatting
- Truncate old context when needed

**4. Async Processing:**
```javascript
// Non-blocking inference
async function processInput(input) {
  const [context, intent] = await Promise.all([
    contextManager.getContext(),
    intentClassifier.classify(input)
  ]);
  
  // Process based on intent
  // ...
}
```

---

## 6. Configuration Management

### 6.1 Configuration Schema

**config.json:**
```json
{
  "model": {
    "name": "phi-3-mini-4k-q4",
    "path": "./models/phi-3-mini-4k-q4.gguf",
    "context_length": 4096,
    "gpu_layers": 35,
    "threads": 8
  },
  "personality": {
    "formality": 0.8,
    "humor_frequency": 0.3,
    "verbosity": "medium",
    "use_sir": true
  },
  "performance": {
    "response_timeout_ms": 3000,
    "context_window_turns": 20,
    "max_response_tokens": 150
  },
  "inference": {
    "temperature": 0.7,
    "top_p": 0.9,
    "top_k": 40,
    "repeat_penalty": 1.1
  },
  "intent_classification": {
    "confidence_threshold": 0.8,
    "use_fast_matching": true,
    "fallback_to_llm": true
  },
  "features": {
    "context_memory": true,
    "long_term_memory": true,
    "action_execution": true,
    "voice_output": false
  },
  "logging": {
    "level": "info",
    "log_user_inputs": true,
    "log_responses": true,
    "max_log_size_mb": 10
  }
}
```

---

## 7. Data Models

### 7.1 Core Data Structures

**Conversation Turn:**
```typescript
interface ConversationTurn {
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  metadata?: {
    intent?: IntentType;
    action?: string;
    confidence?: number;
    execution_result?: any;
  };
}
```

**Intent Classification Result:**
```typescript
interface IntentResult {
  type: IntentType;  // 'action' | 'conversational' | 'hybrid' | 'unknown'
  confidence: number;  // 0.0 to 1.0
  actions?: string[];  // If type is 'action' or 'hybrid'
  reasoning?: string;  // Why this classification
}
```

**Model Generation Request:**
```typescript
interface GenerationRequest {
  prompt: string;
  max_tokens: number;
  temperature: number;
  top_p: number;
  top_k: number;
  stop: string[];
  stream?: boolean;
}
```

**Model Generation Response:**
```typescript
interface GenerationResponse {
  text: string;
  tokens_generated: number;
  inference_time_ms: number;
  finish_reason: 'stop' | 'length' | 'error';
  error?: string;
}
```

---

## 8. Migration Strategy

### 8.1 Phased Rollout

**Phase 1: Parallel Mode (2 weeks)**
- Run both old and new systems side-by-side
- Log inputs to both systems
- Compare outputs
- User can choose which to use (`--mode classic` or `--mode jarvis`)

**Phase 2: Hybrid Mode (2 weeks)**
- New system as default
- Fallback to old system for unrecognized patterns
- Collect failure cases for training data

**Phase 3: Full Migration (ongoing)**
- Old system available as fallback only
- Continuous improvement based on user feedback

### 8.2 Backward Compatibility

```javascript
class JarvisAssistant {
  constructor(config) {
    // ...
    this.classicMode = config.compatibility.enable_classic_fallback;
    this.classicRouter = new CommandRouter();
  }

  async processInput(input) {
    try {
      // Try new JARVIS system
      return await this.processWithJarvis(input);
    } catch (error) {
      if (this.classicMode) {
        console.warn('Falling back to classic mode', error);
        return await this.processWithClassic(input);
      }
      throw error;
    }
  }

  async processWithClassic(input) {
    const match = this.classicRouter.match(input);
    if (match) {
      return await this.executor.run(match.action, input);
    }
    return "Command not recognized.";
  }
}
```

---

## 9. Security and Privacy

### 9.1 Data Privacy

**Principles:**
- All data stays local (no external transmission)
- Conversation logs stored encrypted at rest (optional)
- User can disable logging
- Clear data retention policy (30 days default)

**Implementation:**
```javascript
class MemoryStore {
  constructor(config) {
    this.encryption_enabled = config.privacy.encrypt_logs;
    this.retention_days = config.privacy.retention_days;
    this.anonymize = config.privacy.anonymize_logs;
  }

  async save(data) {
    if (this.anonymize) {
      data = this.removePersonalInfo(data);
    }
    if (this.encryption_enabled) {
      data = this.encrypt(data);
    }
    await this.db.insert(data);
  }

  async cleanup() {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - this.retention_days);
    await this.db.deleteOlderThan(cutoff);
  }
}
```

### 9.2 Command Safety

**Destructive Command Confirmation:**
```javascript
const DESTRUCTIVE_ACTIONS = [
  'shutdown', 'restart', 'sleep', 
  'delete', 'format', 'reset'
];

async function executeAction(action, input) {
  if (DESTRUCTIVE_ACTIONS.includes(action)) {
    const confirmed = await requestConfirmation(
      `This will ${action} your computer. Confirm? (yes/no)`
    );
    if (!confirmed) {
      return "Action cancelled.";
    }
  }
  return await executor.run(action, input);
}
```

---

## 10. Testing Strategy

### 10.1 Test Pyramid

```
           ┌─────────────────┐
           │   E2E Tests     │  (10%)
           │  Full system    │
           └─────────────────┘
          ┌───────────────────┐
          │ Integration Tests │  (30%)
          │  Component pairs  │
          └───────────────────┘
        ┌─────────────────────┐
        │    Unit Tests       │  (60%)
        │  Individual modules │
        └─────────────────────┘
```

### 10.2 Key Test Scenarios

**Intent Classification:**
```javascript
describe('Intent Classifier', () => {
  test('classifies action intents correctly', async () => {
    const inputs = [
      'open chrome',
      'can you launch notepad',
      'please start calculator'
    ];
    
    for (const input of inputs) {
      const result = await classifier.classify(input);
      expect(result.type).toBe('action');
      expect(result.confidence).toBeGreaterThan(0.8);
    }
  });

  test('classifies conversational intents correctly', async () => {
    const inputs = [
      'how are you',
      'what do you think about AI',
      'tell me about yourself'
    ];
    
    for (const input of inputs) {
      const result = await classifier.classify(input);
      expect(result.type).toBe('conversational');
    }
  });

  test('handles hybrid intents', async () => {
    const input = 'open chrome and tell me a joke';
    const result = await classifier.classify(input);
    expect(result.type).toBe('hybrid');
    expect(result.actions).toContain('open_chrome');
  });
});
```

**Response Quality:**
```javascript
describe('Response Generator', () => {
  test('maintains JARVIS personality', async () => {
    const response = await generator.generate('hello', []);
    
    // Check for personality markers
    expect(response).toMatch(/\b(sir|certainly|indeed)\b/i);
    expect(response.length).toBeLessThan(500);
    expect(response).not.toMatch(/[😀🎉]/); // No emojis
  });

  test('respects response length limits', async () => {
    const response = await generator.generate('explain quantum physics', []);
    const wordCount = response.split(/\s+/).length;
    expect(wordCount).toBeLessThan(150);
  });
});
```

**Context Management:**
```javascript
describe('Context Manager', () => {
  test('maintains conversation history within window', async () => {
    const manager = new ContextManager({ maxTurns: 5 });
    
    // Add 10 turns
    for (let i = 0; i < 10; i++) {
      manager.addTurn('user', `message ${i}`);
    }
    
    const context = manager.getAllContext();
    expect(context.length).toBe(5);
    expect(context[0].content).toBe('message 5');
  });
});
```

---

## 11. Deployment Architecture

### 11.1 Directory Structure

```
custom_bot/
├── assistant.js                 # Main entry (existing)
├── jarvis.js                    # New JARVIS orchestrator
├── config/
│   ├── default.json            # Default configuration
│   ├── personality.json        # Personality presets
│   └── training.json           # Training configs
├── src/
│   ├── intent-classifier.js
│   ├── response-generator.js
│   ├── context-manager.js
│   ├── llm-engine.js
│   ├── action-bridge.js
│   └── memory-store.js
├── python/
│   ├── llm_server.py           # Python LLM inference server
│   ├── training/
│   │   ├── train.py
│   │   ├── data_generator.py
│   │   └── evaluate.py
│   └── requirements.txt
├── models/
│   ├── phi-3-mini-4k-q4.gguf   # Main model
│   └── intent-classifier/      # Lightweight classifier
├── data/
│   ├── training/
│   │   ├── conversations.jsonl
│   │   ├── actions.jsonl
│   │   └── personality.jsonl
│   └── memory/
│       └── conversations.db    # SQLite database
├── logs/
│   └── jarvis.log
└── tests/
    ├── unit/
    ├── integration/
    └── e2e/
```

### 11.2 System Requirements

**Minimum:**
- OS: Windows 10/11
- CPU: 4 cores, 2.5 GHz
- RAM: 8 GB
- Storage: 10 GB free
- Runtime: Node.js 18+, Python 3.9+

**Recommended:**
- OS: Windows 11
- CPU: 8 cores, 3.5 GHz
- GPU: NVIDIA GTX 1660 or better (6GB VRAM)
- RAM: 16 GB
- Storage: 20 GB SSD
- Runtime: Node.js 20+, Python 3.11+

**For Training:**
- GPU: NVIDIA RTX 3060 or better (12GB VRAM)
- RAM: 32 GB
- Storage: 50 GB

---

## 12. Implementation Roadmap

### Phase 1: Foundation (Week 1-2)
- [ ] Set up Python environment and dependencies
- [ ] Download and test Phi-3-mini model
- [ ] Create LLM server (Python) with JSON-RPC interface
- [ ] Build LLM Engine client (Node.js)
- [ ] Basic prompt engineering and testing

### Phase 2: Intent Classification (Week 3)
- [ ] Implement fast pattern matching
- [ ] Build LLM-based intent classifier
- [ ] Create intent classification tests
- [ ] Tune confidence thresholds

### Phase 3: Response Generation (Week 4)
- [ ] Implement Response Generator with JARVIS prompts
- [ ] Create personality configuration system
- [ ] Test response quality and timing
- [ ] Implement post-processing and filtering

### Phase 4: Context Management (Week 5)
- [ ] Build Context Manager with in-memory storage
- [ ] Implement SQLite long-term memory
- [ ] Create context retrieval and search
- [ ] Test conversation continuity

### Phase 5: Action Integration (Week 6)
- [ ] Build Action Executor Bridge
- [ ] Create natural language to action mapping
- [ ] Test all 60+ existing actions
- [ ] Implement hybrid intent handling

### Phase 6: Training Pipeline (Week 7-8)
- [ ] Create data generation scripts
- [ ] Generate training dataset (2000+ examples)
- [ ] Set up LoRA fine-tuning pipeline
- [ ] Train initial model
- [ ] Evaluate and iterate

### Phase 7: Integration & Testing (Week 9)
- [ ] Integrate all components in JARVIS orchestrator
- [ ] End-to-end testing
- [ ] Performance optimization
- [ ] Bug fixes and refinements

### Phase 8: Polish & Deployment (Week 10)
- [ ] Create migration path from old system
- [ ] Write documentation
- [ ] User acceptance testing
- [ ] Production deployment

---

## 13. Open Questions & Decisions Needed

1. **Model Selection:** Confirm Phi-3-mini vs. alternatives (Llama 3.2, Gemma 2)
2. **Training Data Size:** Start with 2K or invest in 5K examples upfront?
3. **Voice Integration:** Include in Phase 1 or defer to Phase 2?
4. **GPU Requirement:** Make GPU optional or required for optimal experience?
5. **Personality Customization:** Single JARVIS personality or multiple presets?
6. **Long-term Memory:** How aggressive should retention be (30 days vs. indefinite)?

---

## 14. Success Metrics

**Performance:**
- < 500ms response time for 80% of queries
- < 2s response time for 95% of queries
- Model loads in < 10 seconds

**Quality:**
- 90%+ intent classification accuracy
- User satisfaction rating > 4/5
- < 5% fallback to "I don't understand"

**Functionality:**
- 100% of existing 60+ actions working
- 50+ unique conversation topics handled
- Multi-turn conversations (5+ turns) working seamlessly

**Training:**
- Model training completes in < 3 hours
- Training loss converges (not overfitting)
- Fine-tuned model outperforms base model

---

## Appendix A: Technology Alternatives

| Component | Primary Choice | Alternative 1 | Alternative 2 |
|-----------|---------------|---------------|---------------|
| **Base Model** | Phi-3-mini-4k (3.8B) | Llama 3.2 (3B) | Gemma 2 (2B) |
| **Inference** | llama.cpp | ONNX Runtime | transformers.js |
| **Quantization** | GGUF 4-bit | GPTQ | AWQ |
| **Training** | Hugging Face + LoRA | Unsloth | Axolotl |
| **Intent Classifier** | Fast patterns + LLM | DistilBERT ONNX | Regex only |
| **Context DB** | SQLite | LevelDB | JSON files |

---

This comprehensive technical design provides a complete blueprint for transforming Custom Bot into JARVIS. The design balances innovation with practicality, leveraging modern LLM technology while maintaining the robust command execution foundation already in place.
