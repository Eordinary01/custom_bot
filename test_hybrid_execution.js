/**
 * Test Suite: Hybrid Intent & Multi-Action Execution Flow
 * 
 * Verifies:
 * - Multi-action sequencing and execution order
 * - Hybrid intent coordination (action + conversation)
 * - Conversational responses interspersed with actions
 * - Graceful failure handling and alternative suggestions
 * 
 * Requirements: 6.3, 6.6, 8.4
 */

import { ActionBridge } from './src/action-bridge.js';
import { FastIntentMatcher } from './src/intent-classifier.js';

console.log('============================================================');
console.log('JARVIS Hybrid Execution Flow Integration Test Suite');
console.log('Testing Tasks 6.3 & 6.4 Requirements');
console.log('============================================================\n');

let passedTests = 0;
let failedTests = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`  ✓ ${message}`);
    passedTests++;
  } else {
    console.error(`  ✗ FAIL: ${message}`);
    failedTests++;
  }
}

async function runTests() {
  // Use dryRun bridge to ensure safe tests
  const bridge = new ActionBridge({ dryRun: true });

  // -------------------------------------------------------------
  // Test 1: Multi-Action Sequencing & Execution Order
  // -------------------------------------------------------------
  console.log('--- Test 1: Multi-Action Sequencing & Execution Order ---');

  const multiActions = [
    { action: 'open_chrome', raw: 'open chrome' },
    { action: 'open_notepad', raw: 'open notepad' }
  ];

  const seqResult = await bridge.executeSequence(multiActions);
  assert(seqResult.success === true, 'Multi-action sequence execution succeeds');
  assert(seqResult.executedCount === 2, `Executed 2 actions in sequence (found ${seqResult.executedCount})`);
  assert(seqResult.results[0].action === 'open_chrome', 'First executed action is open_chrome');
  assert(seqResult.results[1].action === 'open_notepad', 'Second executed action is open_notepad');
  assert(seqResult.combinedResponse.includes('Chrome') && seqResult.combinedResponse.includes('Notepad'),
    `Combined response acknowledges both: "${seqResult.combinedResponse}"`);

  // Test 3-action sequence
  const tripleActions = ['open_chrome', 'open_calculator', 'open_explorer'];
  const tripleResult = await bridge.executeSequence(tripleActions);
  assert(tripleResult.executedCount === 3, `Executed 3 actions in sequence (found ${tripleResult.executedCount})`);
  assert(tripleResult.results[0].action === 'open_chrome', 'Order 1: open_chrome');
  assert(tripleResult.results[1].action === 'open_calculator', 'Order 2: open_calculator');
  assert(tripleResult.results[2].action === 'open_explorer', 'Order 3: open_explorer');
  assert(tripleResult.combinedResponse.includes('Chrome') &&
         tripleResult.combinedResponse.includes('Calculator') &&
         tripleResult.combinedResponse.includes('File Explorer'),
    `Triple combined response correctly formatted: "${tripleResult.combinedResponse}"`);

  // -------------------------------------------------------------
  // Test 2: Hybrid Intent Flow (Action + Conversational Query)
  // -------------------------------------------------------------
  console.log('\n--- Test 2: Hybrid Intent Flow (Action + Conversation) ---');

  const hybridActionFirst = {
    actions: ['open_spotify'],
    conversationalQuery: 'tell me a joke',
    executionOrder: ['action', 'conversation']
  };

  const hybridRes1 = await bridge.executeHybrid(hybridActionFirst);
  assert(hybridRes1.success === true, 'Hybrid action-first execution succeeds');
  assert(hybridRes1.unifiedResponse.includes('Spotify'), 'Unified response confirms Spotify action');
  assert(hybridRes1.conversationalResponse.length > 5, 'Conversational response generated for joke');
  assert(hybridRes1.unifiedResponse.startsWith('Opened Spotify'),
    `Unified response starts with action confirmation: "${hybridRes1.unifiedResponse.substring(0, 40)}..."`);

  // Test Conversation-First Ordering
  const hybridConvFirst = {
    actions: ['open_chrome'],
    conversationalQuery: 'what time is it',
    executionOrder: ['conversation', 'action']
  };

  const hybridRes2 = await bridge.executeHybrid(hybridConvFirst);
  assert(hybridRes2.success === true, 'Hybrid conversation-first execution succeeds');
  assert(hybridRes2.conversationalResponse.includes('The current time is'),
    `Conversational response has time: "${hybridRes2.conversationalResponse}"`);
  assert(hybridRes2.unifiedResponse.includes('Opened Google Chrome'),
    'Unified response includes action confirmation');

  // -------------------------------------------------------------
  // Test 3: Raw Natural Language Compound / Hybrid Input
  // -------------------------------------------------------------
  console.log('\n--- Test 3: Raw Natural Language Compound / Hybrid Input ---');

  const rawMultiAction = await bridge.executeHybrid('open chrome and notepad');
  assert(rawMultiAction.success === true, 'Raw compound "open chrome and notepad" succeeds');
  assert(rawMultiAction.unifiedResponse.includes('Chrome') && rawMultiAction.unifiedResponse.includes('Notepad'),
    `Raw compound unified response contains both apps: "${rawMultiAction.unifiedResponse}"`);

  const rawHybrid = await bridge.executeHybrid('open chrome and tell me a joke');
  assert(rawHybrid.success === true, 'Raw hybrid "open chrome and tell me a joke" succeeds');
  assert(rawHybrid.unifiedResponse.includes('Chrome'), 'Raw hybrid executes chrome action');
  assert(rawHybrid.conversationalResponse.length > 10,
    `Raw hybrid generated conversational joke: "${rawHybrid.conversationalResponse}"`);

  // -------------------------------------------------------------
  // Test 4: Graceful Action Failure & Alternative Suggestion (Req 6.6, 8.4)
  // -------------------------------------------------------------
  console.log('\n--- Test 4: Graceful Action Failure & Alternative Suggestion ---');

  // Create a bridge with a mock executor that fails on a specific action
  class MockFailingExecutor {
    constructor() {
      this.lastResponse = null;
    }
    async run(action, text) {
      if (action === 'open_word') {
        this.lastResponse = 'Failed to launch Word: application not installed';
        return;
      }
      this.lastResponse = `Opening ${action}`;
    }
  }

  const failingBridge = new ActionBridge({
    executor: new MockFailingExecutor(),
    dryRun: false
  });

  // Single action failure test
  const singleFail = await failingBridge.executeAction('open_word', 'open word');
  assert(singleFail.success === false, 'Failing action reported with success: false');
  assert(singleFail.suggestedAlternatives.includes('open_notepad'),
    'Failed open_word suggests open_notepad alternative');
  assert(singleFail.suggestion.includes('Notepad'),
    `Natural suggestion generated: "${singleFail.suggestion}"`);

  // Multi-action partial failure test
  const partialFail = await failingBridge.executeSequence(['open_chrome', 'open_word']);
  assert(partialFail.success === false, 'Partial sequence failure returns overall success: false');
  assert(partialFail.executedCount === 1, 'First action succeeded');
  assert(partialFail.failedCount === 1, 'Second action failed');
  assert(partialFail.combinedResponse.includes('Opened Google Chrome'),
    'Combined response acknowledges succeeded action');
  assert(partialFail.combinedResponse.includes('unable to execute Microsoft Word'),
    'Combined response acknowledges failed action');
  assert(partialFail.combinedResponse.includes('Notepad'),
    `Combined response includes suggested alternatives: "${partialFail.combinedResponse}"`);

  // -------------------------------------------------------------
  // Test 5: Edge Cases
  // -------------------------------------------------------------
  console.log('\n--- Test 5: Edge Cases ---');

  const emptySeq = await bridge.executeSequence([]);
  assert(emptySeq.success === false, 'Empty sequence returns success: false');
  assert(emptySeq.combinedResponse === 'No actions to execute.', 'Empty sequence response handled cleanly');

  const nullHybrid = await bridge.executeHybrid(null);
  assert(nullHybrid.success === false, 'Null hybrid intent handled safely');

  const allInvalid = await bridge.executeSequence(['non_existent_1', 'non_existent_2']);
  assert(allInvalid.success === false, 'Sequence of invalid actions fails cleanly');
  assert(allInvalid.failedCount === 2, 'Tracks failed count accurately');

  // Summary
  console.log('\n============================================================');
  console.log(`Test Results: ${passedTests} passed, ${failedTests} failed`);
  console.log('============================================================');

  if (failedTests > 0) {
    process.exit(1);
  }
  process.exit(0);
}

runTests();
