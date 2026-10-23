/**
 * Unit & Integration Tests for ResponseGenerator
 * Tests Task 4 requirements:
 * 1. Personality presets and custom parameter configuration
 * 2. Emotion detection and dynamic tone adaptation
 * 3. Phrasing variation pools (avoiding repetitive responses)
 * 4. Response quality validation (repetition loop detection, length bounds)
 * 5. Fallback handling when LLM fails or is unavailable
 * 6. Live generation with JARVIS personality and length limits (<150 tokens)
 */

import {
  ResponseGenerator,
  PersonalityPresets,
  UserEmotion
} from './src/response-generator.js';
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
  console.log('ResponseGenerator Test Suite');
  console.log('Testing Task 4.1 - 4.4 requirements');
  console.log('='.repeat(60));

  const generator = new ResponseGenerator();

  // 1. Personality Presets & Parameter Structure
  runSyncTest('Personality Presets and Custom Parameters', () => {
    // Balanced preset default
    const defaultP = generator.getPersonality();
    assert(defaultP.name === 'balanced', 'Default preset is balanced');
    assert(defaultP.formality === 0.7, 'Balanced formality is 0.7');

    // Switch to strict
    generator.setPersonality('strict');
    const strictP = generator.getPersonality();
    assert(strictP.name === 'strict', 'Switched to strict');
    assert(strictP.formality === 0.9, 'Strict formality is 0.9');
    assert(strictP.humor === 0.1, 'Strict humor is 0.1');

    // Switch to casual
    generator.setPersonality('casual');
    const casualP = generator.getPersonality();
    assert(casualP.name === 'casual', 'Switched to casual');
    assert(casualP.humor === 0.8, 'Casual humor is 0.8');

    // Custom configuration with boundary clamping
    generator.setPersonality({
      formality: 1.5, // should clamp to 1.0
      verbosity: -0.2, // should clamp to 0.0
      humor: 0.6
    });
    const customP = generator.getPersonality();
    assert(customP.formality === 1.0, 'Formality clamped to 1.0');
    assert(customP.verbosity === 0.0, 'Verbosity clamped to 0.0');
    assert(customP.humor === 0.6, 'Humor set to 0.6');

    // Reset back to balanced
    generator.setPersonality('balanced');
  });

  // 2. Emotion Detection & Tone Adaptation
  runSyncTest('Emotion Detection & Tone Guidance', () => {
    // Frustration
    const frus1 = generator.detectEmotion("Why is this stupid script not working again? It failed completely!");
    assert(frus1 === UserEmotion.FRUSTRATED, `Expected FRUSTRATED, got ${frus1}`);

    // Celebratory / Success
    const celeb1 = generator.detectEmotion("Awesome, it worked! Thank you so much, brilliant job!");
    assert(celeb1 === UserEmotion.CELEBRATORY, `Expected CELEBRATORY, got ${celeb1}`);

    // Urgency
    const urg1 = generator.detectEmotion("I need this immediately, hurry up!");
    assert(urg1 === UserEmotion.URGENT, `Expected URGENT, got ${urg1}`);

    // Neutral
    const neut1 = generator.detectEmotion("What is the diameter of Jupiter?");
    assert(neut1 === UserEmotion.NEUTRAL, `Expected NEUTRAL, got ${neut1}`);

    // Tone guidance injection verification
    const frusTone = generator.buildToneGuidance(UserEmotion.FRUSTRATED);
    assert(frusTone.includes('calm empathy') || frusTone.includes('frustrated'), 'Includes empathy guidance for frustration');

    const urgTone = generator.buildToneGuidance(UserEmotion.URGENT);
    assert(urgTone.includes('urgent') || urgTone.includes('concise'), 'Includes urgency guidance');
  });

  // 3. Response Variation Pools
  runSyncTest('Response Phrasing Variation System', () => {
    const pool = [
      "Option Alpha, {name}.",
      "Option Beta, {name}.",
      "Option Gamma, {name}."
    ];

    const results = [];
    for (let i = 0; i < 3; i++) {
      results.push(generator.getVariedResponse(pool));
    }

    // Verify template replacement
    assert(results[0].includes('Sir'), 'Replaced {name} with user name');

    // Verify variation: not all 3 picks should be identical
    const unique = new Set(results);
    assert(unique.size > 1, 'Pool selection produces variation across consecutive calls');
    console.log(`  Sample variations generated: ${results.join(' | ')}`);
  });

  // 4. Response Quality Validation & Loop Detection
  runSyncTest('Quality Validation & Repetition Loop Filtering', () => {
    // Valid response
    const valid = generator.validateResponse("Good evening, sir. All systems are operating smoothly.");
    assert(valid.isValid === true, 'Valid response accepted');
    assert(valid.cleanedText.endsWith('.'), 'Ends with period');

    // Empty response
    const empty = generator.validateResponse("   ");
    assert(empty.isValid === false, 'Empty response rejected');

    // Repetition loop anomaly (same sentence repeated 3+ times)
    const loopText = "Opening Chrome now. Opening Chrome now. Opening Chrome now.";
    const loopResult = generator.validateResponse(loopText);
    assert(loopResult.isValid === false, 'Repetition loop anomaly detected and rejected');
    assert(loopResult.reason.includes('Repetition loop'), 'Correct rejection reason');

    // Length bound truncation test (using distinct sentences to avoid triggering loop detector)
    const longSentences = [
      "The exploration of deep space presents unprecedented engineering hurdles.",
      "Propulsion systems must achieve extraordinary velocities to cross interstellar distances.",
      "Autonomous guidance algorithms ensure spacecraft maintain optimal trajectories without real-time terrestrial intervention.",
      "Life support mechanisms recycle essential resources with near-perfect closed-loop efficiency.",
      "Radiation shielding protects sensitive electronics from cosmic ray bombardment across decades of transit."
    ];
    const longText = longSentences.join(" ");
    const longResult = generator.validateResponse(longText, 25); // max 25 tokens (~125 chars)
    assert(longResult.isValid === true, 'Truncated response is valid');
    assert(longResult.cleanedText.length < longText.length, 'Length bounded properly');
    assert(longResult.truncated === true, 'Reported truncated=true');
  });

  // 5. Fallback Handling when LLM Engine is unavailable
  await runAsyncTest('Graceful Fallback Handling (No LLM)', async () => {
    const noLlmGenerator = new ResponseGenerator({
      llmEngine: null,
      userName: 'Parth'
    });

    const result = await noLlmGenerator.generate("How do quantum computers work?");
    assert(result.fallbackUsed === true, 'Reported fallbackUsed=true');
    assert(typeof result.text === 'string' && result.text.length > 0, 'Returned non-empty fallback text');
    assert(result.text.includes('Parth'), 'Fallback customized with user name');
    console.log(`  Fallback message: "${result.text}"`);

    const metrics = noLlmGenerator.getMetrics();
    assert(metrics.fallbacksUsed === 1, 'Metrics recorded fallback count');
  });

  // 6. Live Generation Test with LLMEngine (if model exists)
  const modelPath = path.resolve('models/phi-3-mini-4k-q4.gguf');
  if (fs.existsSync(modelPath)) {
    await runAsyncTest('Live Generation with Personality & Length Limit', async () => {
      console.log('  Starting LLMEngine for live response generation test...');
      const engine = new LLMEngine({ defaultTimeout: 45000 });

      try {
        await engine.start();
        await engine.loadModel(modelPath, { n_ctx: 2048, n_threads: 6, n_gpu_layers: 0 });

        const liveGenerator = new ResponseGenerator({
          llmEngine: engine,
          userName: 'Parth',
          personality: 'balanced',
          defaultTimeout: 45000
        });

        // Test simple query (<150 tokens)
        console.log('  Generating response for simple query...');
        const response = await liveGenerator.generate("JARVIS, what is your primary function?");

        assert(response.fallbackUsed === false, `Generation failed, used fallback: ${response.reason}`);
        assert(response.text.length > 0, 'Received valid response');
        assert(response.tokens <= 150, `Simple query should be <= 150 tokens, got ${response.tokens}`);

        console.log(`  Generated Response (${response.tokens} tokens, ${response.inferenceTimeMs}ms):`);
        console.log(`  "${response.text}"`);

        const metrics = liveGenerator.getMetrics();
        assert(metrics.totalGenerated === 1, 'Metric tracked 1 generated response');
        assert(metrics.tokensGenerated > 0, 'Metric tracked tokens generated');
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
