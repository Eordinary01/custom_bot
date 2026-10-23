# Implementation Plan: JARVIS Conversational AI Assistant

## Overview

This implementation plan transforms the Custom Bot from a pattern-matching command assistant into a JARVIS-like conversational AI system. The implementation will leverage local language models (Phi-3-mini-4k), fine-tuning with LoRA, and sophisticated intent classification while preserving the existing robust command execution infrastructure. All processing will be 100% local with no external APIs.

The plan follows a phased approach: environment setup, core LLM integration, intent classification, response generation, context management, action integration, orchestration, training pipeline, and comprehensive testing.

## Tasks

- [x] 1. Set up development environment and dependencies
  - [x] 1.1 Configure Python environment and install ML dependencies
    - Create Python virtual environment (venv)
    - Install llama-cpp-python with CUDA support if GPU available
    - Install transformers, torch, bitsandbytes, peft, datasets, accelerate
    - Create python/requirements.txt with pinned versions
    - Test Python-Node.js IPC communication
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.6_

  - [x] 1.2 Download and validate base language model
    - Download Phi-3-mini-4k-instruct GGUF (Q4_K_M quantized, ~2.3GB)
    - Store in models/phi-3-mini-4k-q4.gguf
    - Test model loading with llama-cpp
    - Verify inference generates coherent responses
    - Benchmark inference speed (target >20 tokens/sec CPU, >50 GPU)
    - _Requirements: 3.1, 3.3, 9.1, 9.2_

  - [x] 1.3 Create project directory structure
    - Create src/ directory for JARVIS components
    - Create python/ directory for Python ML code
    - Create config/ directory for configuration files
    - Create data/training/ for training datasets
    - Create data/memory/ for conversation database
    - Update .gitignore to exclude models, logs, data
    - _Requirements: 3.1, 13.1, 13.5_

- [x] 2. Implement LLM Engine for local inference
  - [x] 2.1 Create Python LLM server with JSON-RPC interface
    - Implement python/llm_server.py with model loader
    - Add JSON-RPC protocol over stdio for Node.js communication
    - Implement request handlers: generate, embed, health
    - Add error handling and structured logging
    - Configure sampling parameters (temperature, top_p, top_k)
    - Test with mock JSON-RPC requests
    - _Requirements: 3.1, 3.2, 3.4, 9.1, 14.1, 14.2_

  - [x] 2.2 Create Node.js LLM Engine client
    - Implement src/llm-engine.js with Python process manager
    - Build JSON-RPC client for request/response handling
    - Add request queue and timeout handling (3s max)
    - Implement health checks and auto-restart on crash
    - Add performance metrics logging (inference time, tokens generated)
    - _Requirements: 3.1, 3.4, 9.1, 9.3, 14.4_

  - [x] 2.3 Write unit tests for LLM Engine
    - Test process startup and shutdown
    - Test request/response flow with mock data
    - Test timeout and error handling
    - Test auto-restart on process failure
    - Target 80%+ code coverage
    - _Requirements: 3.1, 9.1_

  - [x] 2.4 Design and test JARVIS system prompt template
    - Create JARVIS personality prompt (professional, helpful, witty)
    - Design prompt formatting utilities for context injection
    - Test different temperature/top_p settings for optimal quality
    - Document prompt engineering best practices
    - _Requirements: 2.2, 2.5, 7.1, 7.2, 7.3_

- [x] 3. Implement Intent Classification system
  - [x] 3.1 Create fast pattern-based intent matcher
    - Implement src/intent-classifier.js with regex patterns
    - Define action keywords (open, close, launch, start, etc.)
    - Define conversational patterns (what, how, tell me, etc.)
    - Add confidence scoring for pattern matches
    - Return intent type: action, conversational, hybrid, needs_llm
    - _Requirements: 1.1, 1.2, 6.1, 6.2, 9.6_

  - [x] 3.2 Write unit tests for fast intent matcher
    - Test action intent classification (90%+ accuracy)
    - Test conversational intent classification
    - Test hybrid intent detection
    - Test edge cases and ambiguous inputs
    - _Requirements: 1.1, 1.2, 9.6_

  - [x] 3.3 Implement LLM-based fallback intent classification
    - Design intent classification prompt template
    - Implement LLM fallback when confidence < 0.8
    - Add confidence threshold logic
    - Handle ambiguous cases with clarifying questions
    - _Requirements: 1.1, 1.6, 8.1, 8.2, 9.6_

  - [x] 3.4 Add hybrid and multi-intent detection
    - Detect multi-intent inputs ("do X and Y")
    - Extract multiple actions from single input
    - Order actions correctly for execution
    - _Requirements: 1.5, 6.3, 11.1_

  - [x] 3.5 Write integration tests for Intent Classifier
    - Test fast matcher + LLM fallback integration
    - Test classification accuracy on validation dataset
    - Test response time (<200ms for 95% of inputs)
    - _Requirements: 1.1, 1.2, 9.6_

- [x] 4. Implement Response Generation system
  - [x] 4.1 Create Response Generator core
    - Implement src/response-generator.js
    - Build conversation context formatting for prompts
    - Integrate LLM generation with JARVIS system prompt
    - Add post-processing (cleanup, formatting, length limits)
    - Ensure responses under 150 tokens for simple queries
    - _Requirements: 2.1, 2.2, 2.3, 2.6, 7.5, 9.1_

  - [x] 4.2 Implement personality configuration system
    - Design personality parameter structure (formality, verbosity, humor)
    - Create personality presets (strict, balanced, casual)
    - Implement tone adaptation based on user emotion
    - Add response phrasing variation to avoid repetition
    - _Requirements: 2.2, 2.3, 2.5, 7.1, 7.2, 13.2_

  - [x] 4.3 Add response quality validation and fallback
    - Implement response length limits
    - Filter inappropriate or incoherent content
    - Add fallback responses for LLM failures
    - Validate response coherence before returning
    - _Requirements: 2.4, 8.4, 8.5_

  - [x] 4.4 Write unit tests for Response Generator
    - Test JARVIS personality consistency
    - Test response length limits
    - Test tone adaptation
    - Test fallback handling
    - _Requirements: 2.1, 2.2, 2.3, 7.1_

- [x] 5. Implement Context and Memory Management
  - [x] 5.1 Create Conversation Context Manager
    - Implement src/context-manager.js with in-memory storage
    - Maintain sliding window of last 20 conversation turns
    - Add context formatting for LLM prompts
    - Implement reference resolution (pronouns, "that", "it")
    - Track topic transitions
    - _Requirements: 5.1, 5.2, 5.6, 11.1, 11.2, 11.4_

  - [x] 5.2 Write unit tests for Context Manager
    - Test sliding window maintenance (max 20 turns)
    - Test context retrieval and formatting
    - Test reference resolution
    - Test topic transition tracking
    - _Requirements: 5.1, 5.2, 11.3_

  - [x] 5.3 Create Long-Term Memory Store with SQLite
    - Implement src/memory-store.js with SQLite integration
    - Design database schema (sessions, turns, preferences, entities)
    - Implement session persistence after conversation ends
    - Add conversation search by keyword
    - Store user preferences with 30-day retention
    - _Requirements: 5.3, 5.5, 13.3, 13.4, 14.1_

  - [x] 5.4 Implement context retrieval and relevance scoring
    - Build keyword-based search for historical context
    - Add relevance scoring for search results
    - Load relevant context on session start (<500ms)
    - Implement privacy controls (encryption, retention policies)
    - _Requirements: 5.4, 5.5, 14.6_

  - [x] 5.5 Write integration tests for Memory Store
    - Test session persistence and retrieval
    - Test conversation search accuracy
    - Test preference storage and retrieval
    - Test data retention policies
    - _Requirements: 5.3, 5.4, 5.5_

- [x] 6. Integrate with Action Executor
  - [x] 6.1 Create Action Executor Bridge
    - Implement src/action-bridge.js
    - Build natural language to action mapping (60+ actions)
    - Map common NL patterns to existing Executor actions
    - Implement semantic action matching
    - Add LLM-based action extraction for novel phrasings
    - Validate extracted actions before execution
    - _Requirements: 6.1, 6.2, 6.4, 6.5_

  - [x] 6.2 Write integration tests for Action Bridge
    - Test all 60+ existing actions via natural language
    - Test NL variations map correctly
    - Test invalid action rejection
    - Test ambiguous action clarification
    - 100% coverage of existing Executor actions
    - _Requirements: 6.1, 6.4, 6.5_

  - [x] 6.3 Implement hybrid intent execution flow
    - Handle action + conversation sequencing
    - Execute multiple actions in correct order
    - Coordinate responses for completed actions
    - Handle action failures gracefully with natural messages
    - _Requirements: 6.3, 6.6, 8.4_

  - [x] 6.4 Write integration tests for hybrid intents
    - Test complex multi-action scenarios
    - Test action sequencing correctness
    - Test conversational responses interspersed with actions
    - _Requirements: 6.3, 6.6_

- [x] 7. Build JARVIS Orchestrator
  - [x] 7.1 Create main JARVIS controller
    - Implement jarvis.js orchestrating all components
    - Build main processing loop (input → classify → route → respond)
    - Integrate Intent Classifier, Response Generator, Context Manager
    - Integrate Action Bridge and Executor
    - Add comprehensive error handling and recovery
    - _Requirements: 1.1, 6.3, 8.4, 8.5, 14.3_

  - [x] 7.2 Write integration tests for JARVIS Orchestrator
    - Test end-to-end conversation flows
    - Test action execution flows
    - Test hybrid intent flows
    - Test multi-turn conversations
    - Test error scenarios and recovery
    - _Requirements: 1.1, 6.1, 11.1, 11.3_

  - [x] 7.3 Implement configuration system
    - Create config/default.json with all parameters
    - Implement config loading and JSON schema validation
    - Add hot-reload for config changes without restart
    - Create configuration documentation
    - _Requirements: 13.1, 13.2, 13.3, 13.4, 13.5, 13.6_

  - [x] 7.4 Set up logging and monitoring
    - Configure Winston logging with structured output
    - Log all user inputs and responses with timestamps
    - Log performance metrics (inference time, response time)
    - Implement log rotation at 10MB
    - Add privacy controls for log content
    - _Requirements: 14.1, 14.2, 14.3, 14.4, 14.5, 14.6_

- [x] 8. Checkpoint - Verify core system integration
  - Ensure all tests pass
  - Test end-to-end flows manually
  - Verify response times meet targets
  - Ask the user if questions arise

- [x] 9. Build Training Pipeline
  - [x] 9.1 Create training data generator
    - Implement python/training/data_generator.py
    - Convert existing 60+ commands to training examples
    - Generate synthetic conversations with variations
    - Create manual high-quality examples (100+ curated)
    - Format as JSON Lines (.jsonl)
    - Target 2000+ training examples
    - _Requirements: 4.2, 10.1, 10.2, 10.3, 10.5, 10.6_

  - [x] 9.2 Prepare and validate training dataset
    - Validate all examples have input and output
    - Deduplicate training examples
    - Split into train/val/test (80/10/10)
    - Generate dataset quality report
    - _Requirements: 4.4, 10.4, 10.5, 10.6_

  - [x] 9.3 Set up LoRA fine-tuning pipeline
    - Create python/training/train.py
    - Configure Hugging Face training pipeline
    - Set LoRA parameters (r=16, alpha=32)
    - Configure training hyperparameters (lr=2e-4, epochs=3)
    - Implement training loop with progress logging
    - Add checkpoint saving every 500 steps
    - _Requirements: 4.1, 4.3, 4.6_

  - [x] 9.4 Execute model training
    - Train initial model (3 epochs on 2000+ examples)
    - Monitor training loss and validation metrics
    - Evaluate on validation set during training
    - Target training completion in <3 hours with GPU
    - _Requirements: 4.1, 4.3, 4.6_

  - [x] 9.5 Export and quantize trained model
    - Merge LoRA weights with base Phi-3 model
    - Export to Hugging Face format
    - Convert to GGUF format
    - Quantize to 4-bit (Q4_K_M)
    - Validate quantized model size (~2.3GB)
    - _Requirements: 3.5, 4.1_

  - [x] 9.6 Create evaluation and testing framework
    - Implement python/training/evaluate.py
    - Run evaluation on test set
    - Generate evaluation report with metrics
    - Compare trained vs. base model performance
    - Identify failure cases for data augmentation
    - _Requirements: 4.7, 15.1, 15.2, 15.3, 15.4, 15.5, 15.6_

- [x] 10. Comprehensive Testing
  - [x] 10.1 Run complete unit test suite
    - Execute all component unit tests
    - Verify 80%+ code coverage achieved
    - Fix any failing tests
    - _Requirements: 1.2, 2.1, 9.1_

  - [x] 10.2 Run integration test suite
    - Test LLM Engine + Intent Classifier integration
    - Test Context Manager + Response Generator integration
    - Test Action Bridge + Executor integration
    - Test full orchestrator with all components
    - _Requirements: 6.4, 11.1, 11.3_

  - [x] 10.3 Execute end-to-end test scenarios
    - Test simple conversational flows
    - Test action execution flows
    - Test hybrid intents
    - Test multi-turn conversations (5+ turns)
    - Test error scenarios and fallback handling
    - _Requirements: 1.1, 6.1, 8.1, 8.6, 11.1, 11.5_

  - [x] 10.4 Perform performance testing
    - Benchmark response times (target <500ms simple, <2s complex)
    - Test under concurrent load
    - Profile memory usage
    - Identify and document bottlenecks
    - Optimize critical paths if needed
    - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5, 9.6_

- [x] 11. Deployment and Migration
  - [x] 11.1 Implement migration strategy
    - Add parallel mode supporting both old and new systems
    - Add CLI flag for mode switching (--mode classic|jarvis)
    - Test both modes side-by-side
    - Create migration documentation
    - _Requirements: 6.4, 13.1, 13.6_

  - [x] 11.2 Create comprehensive documentation
    - Write user guide for JARVIS features
    - Write developer guide for architecture and components
    - Document all configuration options
    - Create training pipeline guide
    - Update main README with JARVIS information
    - _Requirements: 13.1, 13.2, 13.3_

  - [x] 11.3 Prepare for voice interaction (future-proofing)
    - Ensure text-based interface can be replaced with voice
    - Generate TTS-suitable responses (<200 words)
    - Add wake word detection integration points
    - Document audio integration architecture
    - _Requirements: 12.1, 12.2, 12.3, 12.4, 12.5, 12.6_

- [x] 12. Final checkpoint - System validation
  - Run all tests end-to-end
  - Verify all 60+ actions work via natural language
  - Validate response times meet targets
  - Confirm training pipeline produces quality improvements
  - Ensure all tests pass, ask the user if questions arise

## Notes

- Tasks marked with `*` are optional testing tasks that can be skipped for faster MVP
- All implementation tasks reference specific requirements for traceability
- The design uses JavaScript (Node.js) for the main system and Python for ML components
- Core dependencies: Node.js 18+, Python 3.11+, llama-cpp-python, transformers, SQLite
- Model: Phi-3-mini-4k-instruct quantized to 4-bit (~2.3GB)
- Training approach: LoRA fine-tuning on 2000+ examples
- All processing is 100% local with no external API dependencies
- Existing Executor infrastructure is preserved and integrated via natural language bridge
- Checkpoints ensure incremental validation at major milestones

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.2", "1.3"] },
    { "id": 1, "tasks": ["2.1"] },
    { "id": 2, "tasks": ["2.2", "2.4"] },
    { "id": 3, "tasks": ["2.3", "3.1", "4.1", "5.1", "7.3", "7.4"] },
    { "id": 4, "tasks": ["3.2", "3.3", "4.2", "5.2", "5.3"] },
    { "id": 5, "tasks": ["3.4", "3.5", "4.3", "4.4", "5.4", "5.5", "6.1"] },
    { "id": 6, "tasks": ["6.2", "6.3"] },
    { "id": 7, "tasks": ["6.4", "7.1"] },
    { "id": 8, "tasks": ["7.2", "9.1"] },
    { "id": 9, "tasks": ["9.2"] },
    { "id": 10, "tasks": ["9.3"] },
    { "id": 11, "tasks": ["9.4"] },
    { "id": 12, "tasks": ["9.5", "9.6"] },
    { "id": 13, "tasks": ["10.1", "10.2", "10.3", "10.4", "11.1"] },
    { "id": 14, "tasks": ["11.2", "11.3"] }
  ]
}
```
