/**
 * Unit & Integration Tests for Intent Classification System
 * Tests Task 3 requirements:
 * 1. Fast Pattern-Based Matcher accuracy (>90% target)
 * 2. Conversational vs Action distinction
 * 3. Multi-Action and Hybrid intent detection
 * 4. Ambiguous input handling and edge cases
 * 5. Latency benchmarking (<200ms target, typically <5ms)
 * 6. LLM Fallback Integration (Stage 2)
 */

import { IntentClassifier, FastIntentMatcher, IntentType } from './src/intent-classifier.js';
import { LLMEngine } from './src/llm-engine.js';
import path from 'path';
import fs from 'fs';

let testsPassed = 0;
let testsFailed = 0;

function assert(condition, message) {
  if (!condition) {
    testsFailed++;
    console.error(`  ❌ Assertion Failed: ${message}`);
    throw new Error(message);
  }
}

function runSyncTest(name, fn) {
  console.log(`\n--- Test: ${name} ---`);
  try {
    fn();
    testsPassed++;
    console.log(`  ✓ Passed`);
  } catch (err) {
    console.error(`  ❌ Failed: ${err.message}`);
  }
}

async function runAsyncTest(name, fn) {
  console.log(`\n--- Test: ${name} ---`);
  try {
    await fn();
    testsPassed++;
    console.log(`  ✓ Passed`);
  } catch (err) {
    console.error(`  ❌ Failed: ${err.message}`);
  }
}

async function runAllTests() {
  console.log('='.repeat(60));
  console.log('Intent Classifier Test Suite');
  console.log('Testing Task 3.1 - 3.5 requirements');
  console.log('='.repeat(60));

  const fastMatcher = new FastIntentMatcher();

  // 1. Action Intent Classification Accuracy
  runSyncTest('Action Intent Classification (>90% Accuracy)', () => {
    const actionInputs = [
      'open chrome',
      'launch notepad',
      'start calculator',
      'fire up visual studio code',
      'open file explorer',
      'mute volume',
      'turn up the volume',
      'volume down',
      'crank up the volume',
      'shutdown the computer',
      'restart pc',
      'lock screen',
      'switch tab',
      'create new folder',
      'open spotify',
      'launch task manager',
      'open command prompt',
      'maximize window',
      'kill notepad',
      'can you open chrome'
    ];

    let correct = 0;
    for (const input of actionInputs) {
      const result = fastMatcher.match(input);
      if (result.type === IntentType.ACTION && result.confidence >= 0.8) {
        correct++;
      } else {
        console.warn(`    Misclassified action input: "${input}" => ${result.type} (${result.confidence})`);
      }
    }

    const accuracy = (correct / actionInputs.length) * 100;
    console.log(`  Action accuracy: ${correct}/${actionInputs.length} (${accuracy.toFixed(1)}%)`);
    assert(accuracy >= 90, `Expected action accuracy >= 90%, got ${accuracy}%`);
  });

  // 2. Conversational Intent Classification
  runSyncTest('Conversational Intent Classification', () => {
    const conversationalInputs = [
      'how are you doing today',
      'who was Albert Einstein',
      'what is the speed of light',
      'why is the sky blue',
      'tell me a story about Mars',
      'how does an internal combustion engine work',
      'can you explain string theory',
      'what do you think about artificial intelligence',
      'do you believe computers have consciousness'
    ];

    let correct = 0;
    for (const input of conversationalInputs) {
      const result = fastMatcher.match(input);
      if (result.type === IntentType.CONVERSATIONAL && result.confidence >= 0.8) {
        correct++;
      } else {
        console.warn(`    Misclassified conversational input: "${input}" => ${result.type} (${result.confidence})`);
      }
    }

    const accuracy = (correct / conversationalInputs.length) * 100;
    console.log(`  Conversational accuracy: ${correct}/${conversationalInputs.length} (${accuracy.toFixed(1)}%)`);
    assert(accuracy >= 85, `Expected conversational accuracy >= 85%, got ${accuracy}%`);
  });

  // 3. Multi-Action Intent Detection
  runSyncTest('Multi-Action Intent Detection ("do X and Y")', () => {
    const testCases = [
      {
        input: 'open chrome and open notepad',
        expectedActions: ['open_chrome', 'open_notepad']
      },
      {
        input: 'open calculator, then mute volume',
        expectedActions: ['open_calculator', 'mute']
      },
      {
        input: 'open chrome and notepad',
        expectedActions: ['open_chrome', 'open_notepad']
      },
      {
        input: 'launch spotify and turn up volume',
        expectedActions: ['open_spotify', 'volume_up']
      }
    ];

    for (const tc of testCases) {
      const result = fastMatcher.match(tc.input);
      assert(result.type === IntentType.ACTION, `Expected ACTION intent for: "${tc.input}"`);
      assert(result.isMultiAction === true, `Expected isMultiAction=true for: "${tc.input}"`);
      assert(result.actions.length >= 2, `Expected at least 2 actions extracted`);

      const extractedNames = result.actions.map(a => a.action);
      for (const expected of tc.expectedActions) {
        assert(extractedNames.includes(expected), `Missing action ${expected} in [${extractedNames.join(', ')}]`);
      }
      console.log(`  "${tc.input}" => Actions: [${extractedNames.join(', ')}]`);
    }
  });

  // 4. Hybrid Intent Detection (Action + Conversation)
  runSyncTest('Hybrid Intent Detection (Action + Conversation Sequencing)', () => {
    const testCases = [
      'open chrome and tell me a joke',
      'launch notepad and how does photosynthesis work?',
      'open calculator and what is the capital of France?'
    ];

    for (const input of testCases) {
      const result = fastMatcher.match(input);
      assert(result.type === IntentType.HYBRID, `Expected HYBRID for: "${input}", got ${result.type}`);
      assert(result.actions.length >= 1, `Expected at least 1 action in hybrid intent`);
      assert(result.conversationalQuery && result.conversationalQuery.length > 0, 'Expected conversational query clause');
      console.log(`  "${input}" => Hybrid: Action=${result.actions[0].action}, Query="${result.conversationalQuery}"`);
    }
  });

  // 5. Edge Cases & Robustness
  runSyncTest('Edge Cases & Normalization Handling', () => {
    // Empty input
    const emptyResult = fastMatcher.match('');
    assert(emptyResult.type === IntentType.UNKNOWN, 'Empty string is UNKNOWN');

    // Whitespace only
    const wsResult = fastMatcher.match('   \t\n  ');
    assert(wsResult.type === IntentType.UNKNOWN, 'Whitespace is UNKNOWN');

    // Case insensitivity and punctuation tolerance
    const caseResult = fastMatcher.match('   OPEN CHROME!!!!   ');
    assert(caseResult.type === IntentType.ACTION, 'Uppercase with punctuation recognized as action');
    assert(caseResult.action === 'open_chrome', 'Matched open_chrome');

    // Gibberish
    const gibberish = fastMatcher.match('qwertyasdf zxcvbnm 12345');
    assert(gibberish.type === IntentType.NEEDS_LLM || gibberish.type === IntentType.UNKNOWN, 'Gibberish routes to LLM or unknown');
  });

  // 6. Response Time Benchmark (<200ms target, Requirement 9.6)
  runSyncTest('Performance Benchmark (<200ms for 95% of inputs)', () => {
    const sampleInputs = [
      'open chrome',
      'how are you today',
      'open chrome and notepad',
      'launch calculator and tell me a joke',
      'mute volume',
      'what is the speed of light',
      'create new folder',
      'who made you',
      'shutdown the computer'
    ];

    const iterations = 500;
    const start = Date.now();

    for (let i = 0; i < iterations; i++) {
      const idx = i % sampleInputs.length;
      fastMatcher.match(sampleInputs[idx]);
    }

    const elapsed = Date.now() - start;
    const avgLatencyMs = elapsed / iterations;

    console.log(`  Processed ${iterations} classifications in ${elapsed}ms (avg: ${avgLatencyMs.toFixed(3)}ms/op)`);
    assert(avgLatencyMs < 2.0, `Expected avg latency < 2ms, got ${avgLatencyMs}ms`);
    assert(elapsed < 200, `Total batch elapsed time should be well under 200ms`);
  });

  // 7. Integrated IntentClassifier (Stage 1 + Stage 2 LLM Fallback)
  await runAsyncTest('Integrated IntentClassifier Pipeline', async () => {
    const classifier = new IntentClassifier({
      confidenceThreshold: 0.80
    });

    // Fast path evaluation
    const actionRes = await classifier.classify('open google chrome');
    assert(actionRes.type === IntentType.ACTION, 'Classified action on fast path');
    assert(actionRes.stage === 'fast_pattern', 'Stage is fast_pattern');
    assert(actionRes.latencyMs < 10, 'Fast path completed in <10ms');

    const convRes = await classifier.classify('what is the distance to the moon');
    assert(convRes.type === IntentType.CONVERSATIONAL, 'Classified conversational on fast path');
    assert(convRes.stage === 'fast_pattern', 'Stage is fast_pattern');

    const hybridRes = await classifier.classify('open notepad and tell me a joke');
    assert(hybridRes.type === IntentType.HYBRID, 'Classified hybrid on fast path');

    const metrics = classifier.getMetrics();
    console.log(`  Classifier metrics: Total=${metrics.totalClassifications}, Fast=${metrics.fastMatches}, AvgLatency=${metrics.avgLatencyMs}ms`);
    assert(metrics.totalClassifications === 3, 'Metrics recorded 3 classifications');
  });

  // 8. Live LLM Fallback Test (if GGUF model exists)
  const modelPath = path.resolve('models/phi-3-mini-4k-q4.gguf');
  if (fs.existsSync(modelPath)) {
    await runAsyncTest('Stage 2 Live LLM Fallback Test', async () => {
      console.log('  Initializing LLMEngine for fallback classification...');
      const engine = new LLMEngine({ defaultTimeout: 30000 });

      try {
        await engine.start();
        await engine.loadModel(modelPath, { n_ctx: 2048, n_threads: 4, n_gpu_layers: 0 });

        const classifier = new IntentClassifier({
          llmEngine: engine,
          confidenceThreshold: 0.80
        });

        // Input that triggers fallback: subtle conversational query that doesn't use simple question words
        const ambiguousQuery = "I was wondering if stars ever collide with each other in galaxies";
        console.log(`  Evaluating input with LLM fallback: "${ambiguousQuery}"`);

        const result = await classifier.classify(ambiguousQuery);
        console.log(`  LLM Fallback Result: Type=${result.type}, Confidence=${result.confidence}, Stage=${result.stage}, Latency=${result.latencyMs}ms`);

        assert(result.type === IntentType.CONVERSATIONAL || result.type === IntentType.ACTION, 'Valid classification type returned');
        assert(result.stage === 'llm_fallback' || result.stage === 'fast_pattern', 'Executed appropriate stage');
      } finally {
        await engine.stop();
      }
    });
  }

  console.log('\n' + '='.repeat(60));
  console.log(`Test Results: ${testsPassed} passed, ${testsFailed} failed`);
  console.log('='.repeat(60));

  if (testsFailed > 0) {
    process.exit(1);
  }
}

runAllTests().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
