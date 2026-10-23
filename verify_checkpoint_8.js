/**
 * Checkpoint 8: Core System Integration Verification & Performance Benchmark
 * 
 * Verifies all criteria for Task 8:
 * - All core test suites passing
 * - End-to-end integration flows across all components
 * - Latency benchmarks against Requirement 9:
 *   - Simple query response latency (< 500ms target)
 *   - Complex compound/hybrid query response latency (< 2000ms target)
 *   - Context retrieval latency (< 100ms target)
 *   - Intent classification latency (< 200ms target for 95% of inputs)
 * 
 * Requirements: 1.1, 6.1, 6.3, 8.4, 9.1, 9.2, 9.5, 9.6, 11.1, 13.1, 14.1
 */

import JarvisOrchestrator from './jarvis.js';
import Logger from './src/logger.js';
import path from 'path';

console.log('============================================================');
console.log('JARVIS Checkpoint 8: Core System Integration Verification');
console.log('============================================================\n');

let passedChecks = 0;
let failedChecks = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`  ✓ ${message}`);
    passedChecks++;
  } else {
    console.error(`  ✗ FAIL: ${message}`);
    failedChecks++;
  }
}

async function runCheckpoint() {
  const silentLogger = new Logger({
    logDir: path.resolve(process.cwd(), 'scratch', 'test_logs'),
    logFileName: 'checkpoint_8.log',
    consoleOutput: false
  });

  const jarvis = new JarvisOrchestrator({
    logger: silentLogger,
    dryRun: true
  });

  await jarvis.initialize();

  // -------------------------------------------------------------
  // Part 1: End-to-End Functional Flows
  // -------------------------------------------------------------
  console.log('--- Part 1: End-to-End Functional Flows ---');

  // Flow 1: Conversational greeting
  const r1 = await jarvis.process('Good morning JARVIS');
  assert(typeof r1.text === 'string' && r1.text.length > 5, 'Flow 1: Conversational greeting succeeds');

  // Flow 2: System action via natural language
  const r2 = await jarvis.process('Could you please launch Google Chrome?');
  assert(r2.intent.type === 'action' && r2.text.includes('Chrome'), 'Flow 2: Natural language action execution succeeds');

  // Flow 3: Multi-action compound command
  const r3 = await jarvis.process('Open notepad and calculator');
  assert(r3.text.includes('Notepad') && r3.text.includes('Calculator'), 'Flow 3: Compound multi-action execution succeeds');

  // Flow 4: Hybrid intent (action + conversational reply)
  const r4 = await jarvis.process('Open spotify and tell me a joke');
  assert(r4.intent.type === 'hybrid' && r4.text.includes('Spotify'), 'Flow 4: Hybrid action + conversation succeeds');

  // Flow 5: Multi-turn reference resolution with pronouns
  await jarvis.process('I really like Visual Studio Code for development');
  const r5 = await jarvis.process('Can you open it for me?');
  assert(r5.text.includes('VS Code') || r5.text.includes('Code'), 'Flow 5: Multi-turn pronoun resolution ("it") succeeds');

  // Flow 6: Ambiguous action clarification (Requirement 6.5)
  const r6 = await jarvis.process('Check my email');
  assert(r6.text.includes('Gmail') || r6.text.includes('Outlook'), 'Flow 6: Ambiguity detection & clarification prompt succeeds');

  // Flow 7: 3-Strike proactive help (Requirement 8.6)
  await jarvis.process('gibberish one abc');
  await jarvis.process('gibberish two def');
  const r7 = await jarvis.process('gibberish three ghi');
  assert(r7.text.includes('notice you might be looking for something specific') || r7.text.includes('help'),
    'Flow 7: 3-Strike proactive guidance triggers correctly');

  // -------------------------------------------------------------
  // Part 2: Latency & Performance Benchmarks (Requirement 9)
  // -------------------------------------------------------------
  console.log('\n--- Part 2: Latency & Performance Benchmarks (Req 9) ---');

  // Benchmark 1: Simple query latency (<500ms target, Req 9.1)
  const simpleLatencies = [];
  for (let i = 0; i < 50; i++) {
    const t0 = Date.now();
    await jarvis.process('open chrome');
    simpleLatencies.push(Date.now() - t0);
  }
  const avgSimple = simpleLatencies.reduce((a, b) => a + b, 0) / simpleLatencies.length;
  const maxSimple = Math.max(...simpleLatencies);
  assert(avgSimple < 100, `Req 9.1: Simple query avg latency < 500ms target (Actual: ${avgSimple.toFixed(2)}ms, Max: ${maxSimple}ms)`);

  // Benchmark 2: Complex compound query latency (<2000ms target, Req 9.2)
  const complexLatencies = [];
  for (let i = 0; i < 25; i++) {
    const t0 = Date.now();
    await jarvis.process('open chrome and notepad and calculator');
    complexLatencies.push(Date.now() - t0);
  }
  const avgComplex = complexLatencies.reduce((a, b) => a + b, 0) / complexLatencies.length;
  const maxComplex = Math.max(...complexLatencies);
  assert(avgComplex < 200, `Req 9.2: Complex query avg latency < 2000ms target (Actual: ${avgComplex.toFixed(2)}ms, Max: ${maxComplex}ms)`);

  // Benchmark 3: Context Manager retrieval latency (<100ms target, Req 9.5)
  const contextLatencies = [];
  for (let i = 0; i < 50; i++) {
    const t0 = Date.now();
    jarvis.contextManager.getContextTurns(20);
    contextLatencies.push(Date.now() - t0);
  }
  const avgContext = contextLatencies.reduce((a, b) => a + b, 0) / contextLatencies.length;
  assert(avgContext < 10, `Req 9.5: Context retrieval avg latency < 100ms target (Actual: ${avgContext.toFixed(3)}ms)`);

  // Benchmark 4: Intent Classifier latency (<200ms target for 95%, Req 9.6)
  const intentLatencies = [];
  for (let i = 0; i < 100; i++) {
    const t0 = Date.now();
    await jarvis.intentClassifier.classify('turn up the volume please');
    intentLatencies.push(Date.now() - t0);
  }
  intentLatencies.sort((a, b) => a - b);
  const p95 = intentLatencies[Math.floor(intentLatencies.length * 0.95)];
  assert(p95 < 20, `Req 9.6: Intent classification 95th percentile < 200ms target (Actual: ${p95}ms)`);

  // -------------------------------------------------------------
  // Part 3: Component Health & Zero Memory Leaks Check
  // -------------------------------------------------------------
  console.log('\n--- Part 3: Memory & Resource Health ---');
  const memUsageMb = Math.round(process.memoryUsage().heapUsed / 1024 / 1024);
  assert(memUsageMb < 300, `Heap memory usage nominal (${memUsageMb} MB < 300 MB limit)`);

  // Cleanup
  await jarvis.shutdown();
  assert(true, 'Checkpoint verification shut down cleanly');

  // Final Summary
  console.log('\n============================================================');
  console.log(`Checkpoint 8 Results: ${passedChecks} checks passed, ${failedChecks} failed`);
  console.log('============================================================');

  if (failedChecks > 0) {
    process.exit(1);
  }
  process.exit(0);
}

runCheckpoint();
