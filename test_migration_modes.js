/**
 * JARVIS Conversational AI - Migration & Mode Switching Test
 * 
 * Verifies parallel support for both Classic (v1.0) and JARVIS (v2.0) modes:
 * 1. CLI argument parser validation
 * 2. Classic mode instantiation & execution (TextAssistant)
 * 3. JARVIS mode instantiation & execution (JarvisOrchestrator)
 * 4. Side-by-side command execution parity
 * 5. Dry-run safety across both modes
 * 
 * Requirements: 6.4, 13.1, 13.6
 */

import { parseCliArgs, createAssistant, TextAssistant } from './assistant.js';
import { JarvisOrchestrator } from './jarvis.js';

let passedTests = 0;
let totalTests = 0;

function assert(condition, message) {
  totalTests++;
  if (condition) {
    passedTests++;
    console.log(`  ✅ PASS: ${message}`);
  } else {
    console.error(`  ❌ FAIL: ${message}`);
    throw new Error(`Assertion failed: ${message}`);
  }
}

async function runMigrationTests() {
  console.log('='.repeat(70));
  console.log('🔄 JARVIS MIGRATION & MODE SWITCHING VERIFICATION SUITE');
  console.log('='.repeat(70));

  // 1. CLI Flag Parsing
  console.log('\n[1/4] Testing CLI Argument Parsing...');
  {
    const opt1 = parseCliArgs(['--mode', 'classic', '--dry-run']);
    assert(opt1.mode === 'classic', 'CLI parses --mode classic');
    assert(opt1.dryRun === true, 'CLI parses --dry-run');

    const opt2 = parseCliArgs(['--mode', 'jarvis', '--personality', 'strict']);
    assert(opt2.mode === 'jarvis', 'CLI parses --mode jarvis');
    assert(opt2.personality === 'strict', 'CLI parses --personality strict');

    const optDefault = parseCliArgs([]);
    assert(optDefault.mode === 'jarvis', 'CLI defaults to mode jarvis');
  }

  // 2. Classic Mode Instantiation & Execution
  console.log('\n[2/4] Testing Classic Mode (v1.0 Assistant)...');
  {
    const classicAssistant = await createAssistant({ mode: 'classic', dryRun: true });
    assert(classicAssistant instanceof TextAssistant, 'createAssistant creates TextAssistant in classic mode');
    assert(classicAssistant.mode === 'classic', 'Assistant confirms mode classic');

    // Test input handling in classic mode
    let lastLog = '';
    const origLog = console.log;
    console.log = (...args) => { lastLog += args.join(' ') + '\n'; origLog(...args); };

    await classicAssistant.handleInput('open calculator');
    console.log = origLog;

    assert(lastLog.includes('open_calculator'), 'Classic mode executes open_calculator');
    assert(lastLog.includes('[Dry-Run]'), 'Classic mode enforces dry-run');
  }

  // 3. JARVIS Mode Instantiation & Execution
  console.log('\n[3/4] Testing JARVIS Mode (v2.0 Orchestrator)...');
  {
    const jarvisAssistant = await createAssistant({
      mode: 'jarvis',
      dryRun: true,
      personality: 'strict'
    });

    assert(jarvisAssistant instanceof JarvisOrchestrator, 'createAssistant creates JarvisOrchestrator in jarvis mode');

    // Natural language test
    const res = await jarvisAssistant.process('Could you please launch the calculator for me?');
    assert(res.actionResult !== null, 'JARVIS mode executes natural language action request');
    assert(res.actionResult.action === 'open_calculator', 'JARVIS mode resolves correct action code');
    assert(res.actionResult.dryRun === true, 'JARVIS mode enforces dryRun');

    await jarvisAssistant.shutdown();
  }

  // 4. Side-by-Side Execution Parity
  console.log('\n[4/4] Testing Side-by-Side Execution Parity...');
  {
    const classic = await createAssistant({ mode: 'classic', dryRun: true });
    const jarvis = await createAssistant({ mode: 'jarvis', dryRun: true });

    // Both should handle canonical system commands
    const testCmd = 'open notepad';

    // Classic execution
    const match = classic.router.match(testCmd);
    assert(match && match.action === 'open_notepad', 'Classic router matches "open notepad"');

    // JARVIS execution
    const jarvisRes = await jarvis.process(testCmd);
    assert(jarvisRes.actionResult && jarvisRes.actionResult.action === 'open_notepad', 'JARVIS orchestrator executes "open notepad"');

    await jarvis.shutdown();
  }

  console.log('\n' + '='.repeat(70));
  console.log(`🎉 ALL ${passedTests}/${totalTests} MIGRATION & MODE SWITCHING TESTS PASSED!`);
  console.log('='.repeat(70));
}

runMigrationTests().catch(err => {
  console.error('\n❌ Unhandled error in migration test suite:', err);
  process.exit(1);
});
