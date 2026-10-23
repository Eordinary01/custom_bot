/**
 * Unit Tests for ContextManager and ConversationContext
 * Tests Task 5.1 & 5.2 requirements:
 * 1. Sliding window maintenance (max 20 turns invariant)
 * 2. Context retrieval and formatting for prompts
 * 3. Reference and pronoun resolution ("it", "that", "again")
 * 4. Topic transition tracking
 * 5. Session creation and lifecycle
 */

import { ContextManager, ConversationContext } from './src/context-manager.js';

let testsPassed = 0;
let testsFailed = 0;

function assert(condition, message) {
  if (!condition) {
    testsFailed++;
    console.error(`  ❌ Assertion Failed: ${message}`);
    throw new Error(message);
  }
}

function runTest(name, fn) {
  console.log(`\n--- Test: ${name} ---`);
  try {
    fn();
    testsPassed++;
    console.log(`  ✓ Passed`);
  } catch (err) {
    console.error(`  ❌ Failed: ${err.message}`);
  }
}

async function runAllTests() {
  console.log('='.repeat(60));
  console.log('ContextManager Test Suite');
  console.log('Testing Task 5.1 & 5.2 requirements');
  console.log('='.repeat(60));

  // 1. Sliding Window Invariant (max 20 turns)
  runTest('Sliding Window Boundary (Max 20 Turns)', () => {
    const context = new ConversationContext(20);

    // Add 25 turns
    for (let i = 1; i <= 25; i++) {
      context.addUserMessage(`User message ${i}`);
      context.addAssistantMessage(`Assistant reply ${i}`);
    }

    // Each iteration adds 2 turns, 25 * 2 = 50 total added
    const turns = context.getAllTurns();
    assert(turns.length === 20, `Context turns should be capped at 20, got ${turns.length}`);

    // Verify oldest turns were evicted and newest retained
    assert(turns[turns.length - 1].content === 'Assistant reply 25', 'Latest assistant turn retained');
    assert(turns[turns.length - 2].content === 'User message 25', 'Latest user turn retained');
    console.log(`  Sliding window properly maintains exactly ${turns.length} turns`);
  });

  // 2. Context Formatting for LLM Prompts
  runTest('Context Formatting for Prompts', () => {
    const manager = new ContextManager({ maxTurns: 10 });
    manager.addUserMessage("Hello JARVIS");
    manager.addAssistantMessage("Good day, sir. How may I assist?");
    manager.addUserMessage("What time is it?");
    manager.addAssistantMessage("It is currently 9:30 PM, sir.");

    const formatted = manager.formatForPrompt(3);
    assert(formatted.length === 3, 'Returns last 3 turns');
    assert(formatted[0].role === 'assistant', 'Turn 0 role matches');
    assert(formatted[1].role === 'user', 'Turn 1 role matches');
    assert(formatted[2].role === 'assistant', 'Turn 2 role matches');
    assert(formatted[2].content === 'It is currently 9:30 PM, sir.', 'Turn 2 content matches');
    console.log(`  Formatted turns: ${JSON.stringify(formatted)}`);
  });

  // 3. Reference and Pronoun Resolution
  runTest('Reference Resolution for Pronouns ("it", "that", "again")', () => {
    const manager = new ContextManager();

    // Setup prior conversation about Google Chrome
    manager.addUserMessage("Tell me about Google Chrome");
    manager.addAssistantMessage("Google Chrome is a fast, secure web browser developed by Google.");

    // Test 1: "open it" -> resolves "it" to "Google Chrome"
    const res1 = manager.resolveReferences("Can you open it?");
    assert(res1.hasResolution === true, 'Resolved "it"');
    assert(res1.resolvedInput.toLowerCase().includes('google chrome'), `Expected Google Chrome, got: "${res1.resolvedInput}"`);
    console.log(`  "Can you open it?" => "${res1.resolvedInput}"`);

    // Test 2: "close it" -> resolves "it"
    const res2 = manager.resolveReferences("Please close it");
    assert(res2.hasResolution === true, 'Resolved "close it"');
    assert(res2.resolvedInput.toLowerCase().includes('google chrome'), `Resolved: "${res2.resolvedInput}"`);
    console.log(`  "Please close it" => "${res2.resolvedInput}"`);

    // Test 3: "tell me more about it"
    const res3 = manager.resolveReferences("tell me more about it");
    assert(res3.hasResolution === true, 'Resolved "about it"');
    assert(res3.resolvedInput.toLowerCase().includes('google chrome'), `Resolved: "${res3.resolvedInput}"`);
    console.log(`  "tell me more about it" => "${res3.resolvedInput}"`);

    // Test 4: Input without pronouns remains unchanged
    const res4 = manager.resolveReferences("What is the speed of sound?");
    assert(res4.hasResolution === false, 'No resolution for pronoun-less query');
    assert(res4.resolvedInput === "What is the speed of sound?", 'Input unchanged');
  });

  // 4. Topic Transition Tracking
  runTest('Topic Transition Tracking', () => {
    const manager = new ContextManager();

    // Initial conversation about astronomy
    manager.addUserMessage("Tell me about black holes and gravitational event horizons in astronomy");
    manager.addAssistantMessage("Black holes are astronomical regions where gravity is so strong nothing escapes.");

    // Related follow-up: should NOT flag as transition
    const related = manager.trackTopicTransition("How do black holes form from collapsing stars?");
    assert(related.isTransition === false, 'Continuous topic correctly recognized as non-transition');
    console.log(`  Follow-up topic transition: ${related.isTransition}`);

    // Complete shift to local system administration / audio
    const shift = manager.trackTopicTransition("Increase audio volume and maximize the browser window");
    assert(shift.isTransition === true, 'Topic shift correctly detected');
    console.log(`  Divergent topic transition detected: ${shift.isTransition}`);
  });

  // 5. Session Lifecycle and Reset
  runTest('Session Lifecycle and In-Memory Reset', async () => {
    const manager = new ContextManager();
    const sessionId1 = manager.currentSession.sessionId;

    manager.addUserMessage("Message in session 1");
    assert(manager.currentSession.turns.length === 1, 'Turn added to session 1');

    const sessionId2 = await manager.startNewSession();
    assert(sessionId1 !== sessionId2, 'New session has distinct session ID');
    assert(manager.currentSession.turns.length === 0, 'New session starts with clean turns');
    console.log(`  Old session: ${sessionId1} -> New session: ${sessionId2}`);
  });

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
