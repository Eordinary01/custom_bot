/**
 * Unit & Integration Tests for LLMEngine
 * Tests task 2.2 and 2.3 requirements:
 * 1. Process startup and shutdown
 * 2. Request/response flow with JSON-RPC
 * 3. Timeout and error handling
 * 4. Auto-restart on process failure
 * 5. Performance metrics logging
 * 6. Live model loading and generation (if model exists)
 */

import { LLMEngine } from './src/llm-engine.js';
import fs from 'fs';
import path from 'path';

let testsPassed = 0;
let testsFailed = 0;

function assert(condition, message) {
  if (!condition) {
    testsFailed++;
    console.error(`  ❌ Assertion Failed: ${message}`);
    throw new Error(message);
  }
}

async function runTest(name, fn) {
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
  console.log('LLMEngine Test Suite');
  console.log('Testing Task 2.2 & 2.3 requirements');
  console.log('='.repeat(60));

  const engine = new LLMEngine({
    autoRestart: true,
    maxRestarts: 2,
    restartBackoffMs: 500,
    defaultTimeout: 15000
  });

  try {
    // 1. Process Startup
    await runTest('Process Startup and Readiness Handshake', async () => {
      console.log('  Starting LLMEngine...');
      await engine.start();
      assert(engine.isReady === true, 'Engine should report isReady=true');
      assert(engine.process !== null, 'Child process should be spawned');
      console.log(`  Engine started with PID: ${engine.process.pid}`);
    });

    // 2. Health check via JSON-RPC
    await runTest('Health Check Request via JSON-RPC', async () => {
      const health = await engine.health();
      assert(health !== null && typeof health === 'object', 'Health response must be object');
      assert(health.status === 'not_ready' || health.status === 'healthy', 'Status must be valid');
      assert(typeof health.stats === 'object', 'Stats object must be included');
      console.log(`  Health status: ${health.status}, stats: ${JSON.stringify(health.stats)}`);
    });

    // 3. Error Handling - Generate without model
    await runTest('Error Handling: Generate without Model Loaded', async () => {
      const result = await engine.generate({ prompt: 'Hello JARVIS' });
      assert(result.success === false, 'Expected success=false when model not loaded');
      assert(result.error.includes('Model not loaded'), 'Expected "Model not loaded" error');
      console.log(`  Expected error received: ${result.error}`);
    });

    // 4. Parameter Validation - Invalid input
    await runTest('Parameter Validation: Empty Prompt Rejection', async () => {
      let threw = false;
      try {
        await engine.generate({ prompt: '' });
      } catch (err) {
        threw = true;
        assert(err.message.includes('prompt must be a non-empty string'), 'Correct validation message');
      }
      assert(threw, 'Should throw for empty prompt');
    });

    // 5. Timeout Handling
    await runTest('Timeout Handling: Short Timeout Expiration', async () => {
      let timedOut = false;
      try {
        // Send request that sleeps 0.5s with a 50ms timeout
        await engine.call('sleep', { seconds: 0.5 }, 50);
      } catch (err) {
        if (err.message.includes('timed out')) {
          timedOut = true;
        }
      }
      assert(timedOut, 'Expected request to be rejected with timeout');
      console.log('  Timeout rejection verified');
      // Brief pause to allow the server to finish sleep before next request
      await new Promise((r) => setTimeout(r, 600));
    });

    // 6. Metrics Tracking
    await runTest('Metrics Tracking Verification', async () => {
      const metrics = engine.getMetrics();
      assert(metrics.totalRequests > 0, 'Total requests should be tracked');
      assert(typeof metrics.avgInferenceTimeMs === 'number', 'Average inference time tracked');
      console.log(`  Total requests: ${metrics.totalRequests}, failed: ${metrics.failedRequests}`);
    });

    // 7. Auto-Restart on Process Crash
    await runTest('Auto-Restart on Process Failure', async () => {
      const oldPid = engine.process.pid;
      console.log(`  Simulating process crash by killing PID: ${oldPid}...`);

      // Kill the child process directly
      engine.process.kill('SIGTERM');

      // Wait for auto-restart to recover
      console.log('  Waiting for auto-restart...');
      await new Promise((r) => setTimeout(r, 2000));

      assert(engine.isReady === true, 'Engine should recover and report isReady=true');
      assert(engine.process.pid !== oldPid, 'New child process should have different PID');
      assert(engine.metrics.restarts >= 1, 'Restart metric should increment');
      console.log(`  Engine successfully recovered with new PID: ${engine.process.pid}`);

      // Verify health check works on the new process
      const healthAfterRestart = await engine.health();
      assert(healthAfterRestart.status !== undefined, 'Health check works after restart');
    });

    // 8. Live Model Loading and Inference (if model file exists)
    const modelPath = path.resolve('models/phi-3-mini-4k-q4.gguf');
    if (fs.existsSync(modelPath)) {
      await runTest('Live Model Loading & Inference Test', async () => {
        console.log(`  Loading model from: ${modelPath}`);
        const loadResult = await engine.loadModel(modelPath, {
          n_ctx: 2048,
          n_threads: 4,
          n_gpu_layers: 0,
          verbose: false
        }, 30000);

        assert(loadResult.success === true, `Model loading failed: ${loadResult.error}`);
        console.log(`  Model loaded in ${loadResult.load_time_seconds}s`);

        console.log('  Generating sample response...');
        const genResult = await engine.generate({
          prompt: 'User: Hello! Who are you?\nJARVIS:',
          max_tokens: 25,
          temperature: 0.7,
          timeout: 25000
        });

        assert(genResult.success === true, `Generation failed: ${genResult.error}`);
        assert(typeof genResult.text === 'string' && genResult.text.length > 0, 'Generated text must not be empty');
        console.log(`  Generated text: "${genResult.text.trim()}"`);
        console.log(`  Tokens: ${genResult.tokens_generated}, Time: ${genResult.inference_time_ms}ms`);

        const updatedMetrics = engine.getMetrics();
        console.log(`  Updated tokens generated: ${updatedMetrics.totalTokens}, Avg speed: ${updatedMetrics.avgTokensPerSec} tokens/sec`);
      });
    } else {
      console.log('\n[Note] GGUF model file not found at models/phi-3-mini-4k-q4.gguf. Skipping live inference test.');
    }

  } finally {
    // 9. Shutdown
    console.log('\n--- Stopping Engine ---');
    await engine.stop();
    assert(engine.isReady === false, 'Engine should report isReady=false after stop');
    assert(engine.process === null, 'Process should be cleaned up');
    console.log('  ✓ Engine stopped cleanly');
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
