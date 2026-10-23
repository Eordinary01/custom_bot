/**
 * JARVIS Conversational AI - End-to-End Scenario Test Suite
 * 
 * Tests complete user journeys through the JARVIS Orchestrator:
 * 1. Simple Conversational Flows (Greetings, status, personality, composure)
 * 2. Action Execution Flows (Direct, polite, natural phrasing across system actions)
 * 3. Hybrid Intent Flows (Action + conversation combined with proper sequencing)
 * 4. Multi-Turn Conversations (5+ turns with pronoun resolution and topic continuity)
 * 5. Error Scenarios & 3-Strike Proactive Guidance (Graceful recovery, clarification, help trigger)
 * 
 * Requirements: 1.1, 6.1, 8.1, 8.6, 11.1, 11.5
 */

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

async function runE2EScenarios() {
  console.log('='.repeat(70));
  console.log('🎭 JARVIS END-TO-END SCENARIO TEST SUITE');
  console.log('='.repeat(70));

  const jarvis = new JarvisOrchestrator({ dryRun: true });
  await jarvis.initialize();

  // =========================================================================
  // Scenario 1: Simple Conversational Flows
  // =========================================================================
  console.log('\n[Scenario 1/5] Simple Conversational Flows...');
  {
    const res1 = await jarvis.process('Good morning JARVIS. How are systems running today?');
    assert(typeof res1.text === 'string' && res1.text.length > 0, 'JARVIS responds to morning greeting');
    assert(!res1.actionResult, 'Conversational query triggers no unintended action');
    assert(res1.intent.type === 'conversational', 'Intent is accurately marked conversational');

    const res2 = await jarvis.process('Tell me something interesting about artificial intelligence.');
    assert(res2.text.length > 20, 'JARVIS provides informative response');
    assert(!res2.text.includes('undefined') && !res2.text.includes('null'), 'Response contains clean text without template artifacts');
  }

  // =========================================================================
  // Scenario 2: Action Execution Flows
  // =========================================================================
  console.log('\n[Scenario 2/5] Action Execution Flows...');
  {
    // Direct command
    const res1 = await jarvis.process('Open calculator');
    assert(res1.actionResult !== null, 'Calculator launch returns an action result');
    assert(res1.actionResult.action === 'open_calculator', 'Correct action code open_calculator resolved');
    assert(res1.actionResult.dryRun === true, 'Dry-run executed safely without spawning processes');

    // Polite command with modal auxiliary
    const res2 = await jarvis.process('Could you please launch Google Chrome for me right now?');
    assert(res2.actionResult !== null, 'Polite Chrome query returns action result');
    assert(res2.actionResult.action === 'open_chrome' || res2.actionResult.action === 'open_google', 'Natural phrasing mapped to web action');

    // System command
    const res3 = await jarvis.process('Turn up the system volume');
    assert(res3.actionResult !== null && res3.actionResult.action === 'volume_up', 'System volume up executed accurately');
  }

  // =========================================================================
  // Scenario 3: Hybrid Intent Execution
  // =========================================================================
  console.log('\n[Scenario 3/5] Hybrid Intent Execution...');
  {
    const hybridRes = await jarvis.process('Please open notepad and tell me how your day is going');
    assert(hybridRes.intent.type === 'hybrid' || hybridRes.actionResult !== null, 'Hybrid request detected with action payload');
    const hasNotepadAction = hybridRes.actionResult?.action === 'open_notepad' ||
      hybridRes.actionResult?.sequenceResult?.results?.some(r => r.action === 'open_notepad') ||
      hybridRes.intent?.actions?.some(a => a.action === 'open_notepad');
    assert(hasNotepadAction, 'Notepad action executed in hybrid flow');
    assert(typeof hybridRes.text === 'string' && hybridRes.text.length > 0, 'Conversational response included in hybrid flow');
  }

  // =========================================================================
  // Scenario 4: Multi-Turn Conversations (5+ Turns)
  // =========================================================================
  console.log('\n[Scenario 4/5] Multi-Turn Deep Conversations (5+ Turns)...');
  {
    // Clean session for multi-turn validation
    const sessionJarvis = new JarvisOrchestrator({ dryRun: true });
    await sessionJarvis.initialize();

    console.log('    • Turn 1: Initial greeting');
    const t1 = await sessionJarvis.process('Hello JARVIS, are you ready?');
    assert(t1.text.length > 0, 'Turn 1 completed');

    console.log('    • Turn 2: Setting conversation topic');
    const t2 = await sessionJarvis.process('Let us discuss Google Chrome and web browsing.');
    assert(t2.text.length > 0, 'Turn 2 completed');

    console.log('    • Turn 3: Pronoun resolution (launch it)');
    const t3 = await sessionJarvis.process('Could you please open it?');
    assert(t3.actionResult !== null && t3.actionResult.action === 'open_chrome', 'Turn 3: Pronoun "it" resolved to Chrome');

    console.log('    • Turn 4: Contextual follow-up');
    const t4 = await sessionJarvis.process('Now please maximize it.');
    assert(t4.actionResult !== null && t4.actionResult.action === 'maximize', 'Turn 4: Window control executed on active context');

    console.log('    • Turn 5: Politeness turn');
    const t5 = await sessionJarvis.process('Thank you very much JARVIS.');
    assert(t5.text.length > 0, 'Turn 5: JARVIS responds graciously to gratitude');

    console.log('    • Turn 6: Context query');
    const t6 = await sessionJarvis.process('What application were we just working with?');
    assert(typeof t6.text === 'string', 'Turn 6: Conversational reflection answered');

    const turns = sessionJarvis.contextManager.getContextTurns();
    assert(turns.length >= 10, `ContextManager maintains all 6 dialog turns (Total turns: ${turns.length})`);

    await sessionJarvis.shutdown();
  }

  // =========================================================================
  // Scenario 5: Error Scenarios, Ambiguity, & 3-Strike Proactive Guidance
  // =========================================================================
  console.log('\n[Scenario 5/5] Error Scenarios, Ambiguity, & 3-Strike Proactive Guidance...');
  {
    const recoveryJarvis = new JarvisOrchestrator({ dryRun: true });
    await recoveryJarvis.initialize();

    // 1. Ambiguity detection
    const ambig = await recoveryJarvis.process('Check my email please');
    assert(ambig.intent.type === 'needs_clarification' || ambig.text.toLowerCase().includes('gmail') || ambig.text.toLowerCase().includes('outlook') || ambig.text.toLowerCase().includes('email'), 'Ambiguous query offers helpful clarification or guidance');

    // 2. 3-Strike Proactive Help
    console.log('    • Strike 1: Gibberish input');
    const s1 = await recoveryJarvis.process('xyzqwe random gibberish 123');
    assert(s1.text.length > 0, 'Strike 1 handled politely');
    assert(recoveryJarvis.consecutiveUnknownCount === 1, 'Unrecognized count is 1');

    console.log('    • Strike 2: Second gibberish input');
    const s2 = await recoveryJarvis.process('blorp zorp florp 456');
    assert(s2.text.length > 0, 'Strike 2 handled politely');
    assert(recoveryJarvis.consecutiveUnknownCount === 2, 'Unrecognized count is 2');

    console.log('    • Strike 3: Third gibberish input -> Proactive Help Triggered');
    const s3 = await recoveryJarvis.process('glop wop plop 789');
    assert(recoveryJarvis.consecutiveUnknownCount === 0, 'Strike counter resets after 3 strikes');
    assert(s3.text.includes('Commands') || s3.text.includes('assist') || s3.text.includes('help') || s3.text.includes('applications'), 'Strike 3 triggers comprehensive proactive guidance');

    // 3. Reset strike count on successful recognized command
    await recoveryJarvis.process('another random unrecognized input');
    assert(recoveryJarvis.consecutiveUnknownCount === 1, 'Counter increments to 1 on single error');
    await recoveryJarvis.process('Open calculator');
    assert(recoveryJarvis.consecutiveUnknownCount === 0, 'Counter resets to 0 upon recognized command');

    await recoveryJarvis.shutdown();
  }

  await jarvis.shutdown();

  console.log('\n' + '='.repeat(70));
  console.log(`🎉 ALL ${passedTests}/${totalTests} END-TO-END SCENARIO TESTS PASSED!`);
  console.log('='.repeat(70));
}

runE2EScenarios().catch(err => {
  console.error('\n❌ Unhandled error in E2E scenario suite:', err);
  process.exit(1);
});
