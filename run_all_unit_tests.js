/**
 * JARVIS Conversational AI - Master Unit Test Runner
 * 
 * Executes all component unit tests across the system:
 * 1. Command Router (Core)
 * 2. Action Executor (Core)
 * 3. Base Bot Integration (Core)
 * 4. LLM Engine (Python subprocess + IPC)
 * 5. Prompt Templates (Phi-3 formatting)
 * 6. Intent Classifier (Two-stage hybrid)
 * 7. Response Generator (Persona + tone)
 * 8. Context Manager (Sliding window + reference resolution)
 * 9. Memory Store (SQLite persistence)
 * 10. Action Bridge (60 actions + ambiguity detection)
 * 11. Hybrid Execution (Action + conversation sequencing)
 * 12. JARVIS Orchestrator (Full system integration)
 * 
 * Requirements: 1.2, 2.1, 9.1
 */

import { spawnSync } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const TEST_SUITES = [
  { name: 'Command Router', file: 'test_router.js', category: 'Core Bot' },
  { name: 'Action Executor', file: 'test_executor.js', category: 'Core Bot' },
  { name: 'Base Integration', file: 'test_integration.js', category: 'Core Bot' },
  { name: 'LLM Engine', file: 'test_llm_engine.js', category: 'LLM Subsystem' },
  { name: 'Prompt Templates', file: 'test_prompt_templates.js', category: 'LLM Subsystem' },
  { name: 'Intent Classifier', file: 'test_intent_classifier.js', category: 'Intelligence' },
  { name: 'Response Generator', file: 'test_response_generator.js', category: 'Intelligence' },
  { name: 'Context Manager', file: 'test_context_manager.js', category: 'Memory & Context' },
  { name: 'Memory Store', file: 'test_memory_store.js', category: 'Memory & Context' },
  { name: 'Action Bridge', file: 'test_action_bridge.js', category: 'Execution Bridge' },
  { name: 'Hybrid Execution', file: 'test_hybrid_execution.js', category: 'Execution Bridge' },
  { name: 'JARVIS Orchestrator', file: 'test_jarvis_orchestrator.js', category: 'Orchestration' }
];

console.log('='.repeat(75));
console.log('🧪 JARVIS COMPREHENSIVE UNIT TEST SUITE RUNNER');
console.log('='.repeat(75));
console.log(`Running ${TEST_SUITES.length} test suites across all subsystems...\n`);

const results = [];
let totalPassed = 0;
let totalFailed = 0;
const startTime = Date.now();

for (const suite of TEST_SUITES) {
  const filePath = path.join(__dirname, suite.file);
  const suiteStart = Date.now();
  
  process.stdout.write(`• [${suite.category}] ${suite.name.padEnd(22)}: `);
  
  const res = spawnSync(process.execPath, [filePath], {
    cwd: __dirname,
    encoding: 'utf-8',
    env: { ...process.env, NODE_ENV: 'test' }
  });

  const duration = Date.now() - suiteStart;
  const success = res.status === 0;

  if (success) {
    totalPassed++;
    console.log(`✅ PASSED (${duration}ms)`);
    results.push({ ...suite, success: true, duration });
  } else {
    totalFailed++;
    console.log(`❌ FAILED (exit code: ${res.status}, ${duration}ms)`);
    if (res.stderr) console.error(res.stderr);
    results.push({ ...suite, success: false, duration, error: res.stderr || res.stdout });
  }
}

const totalDuration = Date.now() - startTime;

console.log('\n' + '='.repeat(75));
console.log('📊 UNIT TEST SUITE SUMMARY MATRIX');
console.log('='.repeat(75));
console.log(`${'Category'.padEnd(18)} | ${'Test Suite'.padEnd(24)} | ${'Duration'.padEnd(10)} | Status`);
console.log('-'.repeat(75));

for (const r of results) {
  const statusStr = r.success ? '✅ PASS' : '❌ FAIL';
  console.log(`${r.category.padEnd(18)} | ${r.name.padEnd(24)} | ${(r.duration + 'ms').padEnd(10)} | ${statusStr}`);
}

console.log('='.repeat(75));
console.log(`Summary: ${totalPassed}/${TEST_SUITES.length} test suites passed (${Math.round((totalPassed / TEST_SUITES.length) * 100)}%)`);
console.log(`Total Execution Time: ${totalDuration}ms`);
console.log('='.repeat(75));

if (totalFailed > 0) {
  console.error(`\n❌ ${totalFailed} test suite(s) failed.`);
  process.exit(1);
} else {
  console.log(`\n🎉 ALL ${TEST_SUITES.length} UNIT TEST SUITES PASSED FLAWLESSLY!`);
  process.exit(0);
}
