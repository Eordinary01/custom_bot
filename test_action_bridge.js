/**
 * Test Suite: Action Bridge & Natural Language Action Mapping
 * 
 * Verifies:
 * - 100% coverage of all 60 existing Executor actions via natural language
 * - Natural language variation and semantic mapping accuracy
 * - Rejection of invalid actions
 * - Ambiguous action detection and clarification prompts
 * - Safe execution in dry-run mode
 * - End-to-end execution of non-destructive live actions
 * 
 * Requirements: 6.1, 6.2, 6.4, 6.5
 */

import { ActionBridge, VALID_ACTIONS, ACTION_METADATA } from './src/action-bridge.js';
import Executor from './executor.js';

console.log('============================================================');
console.log('JARVIS Action Bridge Integration Test Suite');
console.log('Testing Tasks 6.1 & 6.2 Requirements');
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
  const bridge = new ActionBridge({ dryRun: true });

  // -------------------------------------------------------------
  // Test 1: Registry Integrity - Exactly 60 valid actions
  // -------------------------------------------------------------
  console.log('--- Test 1: Action Registry Integrity (60+ Actions) ---');
  const validActions = bridge.getValidActions();
  assert(validActions.length >= 60, `Comprehensive action registry contains 60+ actions (found ${validActions.length})`);
  assert(VALID_ACTIONS.size >= 60, `VALID_ACTIONS set has size >= 60 (found ${VALID_ACTIONS.size})`);

  let allHaveMeta = true;
  for (const act of validActions) {
    if (!ACTION_METADATA[act]) {
      allHaveMeta = false;
      console.error(`Missing metadata for action: ${act}`);
    }
  }
  assert(allHaveMeta, 'All 60 actions have comprehensive metadata and patterns');

  // -------------------------------------------------------------
  // Test 2: 100% Coverage of All 60 Actions via Natural Language
  // -------------------------------------------------------------
  console.log('\n--- Test 2: 100% Coverage of All 60 Actions via Natural Language ---');

  // Test map containing at least one natural query for each of the 60 actions
  const all60Queries = {
    // Applications (31)
    open_chrome: 'please open chrome',
    open_notepad: 'launch notepad for me',
    open_calculator: 'open calculator',
    open_explorer: 'open file explorer',
    open_settings: 'open windows settings',
    open_cmd: 'open command prompt',
    open_powershell: 'launch powershell',
    open_taskmanager: 'open task manager',
    open_control_panel: 'open control panel',
    open_outlook: 'open microsoft outlook',
    open_gmail: 'open gmail',
    open_discord: 'open discord app',
    open_teams: 'open microsoft teams',
    open_whatsapp: 'launch whatsapp',
    open_facebook: 'open facebook',
    open_twitter: 'open twitter',
    open_instagram: 'open instagram',
    open_linkedin: 'open linkedin',
    open_reddit: 'open reddit',
    open_youtube: 'open youtube',
    open_google: 'search google',
    open_netflix: 'open netflix',
    open_spotify: 'open spotify',
    open_prime: 'open amazon prime',
    open_steam: 'launch steam',
    open_word: 'open microsoft word',
    open_excel: 'open microsoft excel',
    open_powerpoint: 'open powerpoint',
    open_paint: 'open paint',
    open_vscode: 'open vs code',
    open_github: 'open github',

    // System & Window Controls (13)
    volume_up: 'turn up volume',
    volume_down: 'turn down volume',
    mute: 'toggle mute',
    volume_app_up: 'volume app up',
    volume_app_down: 'volume app down',
    lock: 'lock screen',
    sleep: 'put computer to sleep',
    shutdown: 'shut down the pc',
    restart: 'reboot computer',
    maximize: 'maximize window',
    minimize: 'minimize window',
    switch_tab: 'switch tab',
    previous_tab: 'previous tab',

    // Files & Folders (6)
    open_downloads: 'open downloads folder',
    open_documents: 'open documents folder',
    open_desktop: 'show desktop folder',
    open_pictures: 'open pictures folder',
    create_file: 'create new file',
    create_folder: 'create new folder',

    // Assistant & Utilities (10)
    greeting: 'hello jarvis',
    time: 'what time is it',
    date: 'what date is today',
    write_email: 'compose new email',
    joke: 'tell me a joke',
    thanks: 'thank you very much',
    test_speech: 'test voice speech',
    sleep_assistant: 'stop listening go to sleep',
    repeat: 'say that again',
    help: 'what commands are available'
  };

  let mappedCount = 0;
  for (const [expectedAction, query] of Object.entries(all60Queries)) {
    const res = await bridge.resolveAction(query);
    if (res.matched && res.action === expectedAction) {
      mappedCount++;
    } else {
      console.error(`Failed mapping for "${query}": expected ${expectedAction}, got ${res.action || res.reason}`);
    }
  }

  assert(mappedCount === 60, `All 60 actions resolved accurately from natural language (${mappedCount}/60)`);

  // -------------------------------------------------------------
  // Test 3: Natural Language Semantic Variations
  // -------------------------------------------------------------
  console.log('\n--- Test 3: Natural Language Semantic Variations ---');

  const semanticVariations = [
    { query: 'surf the internet', expected: 'open_chrome' },
    { query: 'browse the web', expected: 'open_chrome' },
    { query: 'take some notes', expected: 'open_notepad' },
    { query: 'calculate something', expected: 'open_calculator' },
    { query: 'crank it up', expected: 'volume_up' },
    { query: 'make it louder', expected: 'volume_up' },
    { query: 'quieter please', expected: 'volume_down' },
    { query: 'silence audio', expected: 'mute' },
    { query: 'reboot the system', expected: 'restart' },
    { query: 'suspend system', expected: 'sleep' },
    { query: 'lock workstation', expected: 'lock' },
    { query: 'mkdir voice folder', expected: 'create_folder' },
    { query: 'touch text file', expected: 'create_file' },
    { query: 'draft a mail', expected: 'write_email' },
    { query: 'check the clock', expected: 'time' },
    { query: 'what day is it', expected: 'date' },
    { query: 'fullscreen window', expected: 'maximize' },
    { query: 'hide the window', expected: 'minimize' },
    { query: 'cycle to next tab', expected: 'switch_tab' }
  ];

  let semanticMatches = 0;
  for (const item of semanticVariations) {
    const res = await bridge.resolveAction(item.query);
    if (res.matched && res.action === item.expected) {
      semanticMatches++;
    } else {
      console.error(`Semantic mismatch for "${item.query}": expected ${item.expected}, got ${res.action}`);
    }
  }

  assert(semanticMatches === semanticVariations.length, `Semantic variations matched (${semanticMatches}/${semanticVariations.length})`);

  // -------------------------------------------------------------
  // Test 4: Invalid Action Rejection
  // -------------------------------------------------------------
  console.log('\n--- Test 4: Invalid Action Rejection ---');

  assert(!bridge.isValidAction('launch_spaceship'), 'isValidAction correctly rejects non-existent action');
  assert(!bridge.isValidAction(null), 'isValidAction safely handles null');
  assert(!bridge.isValidAction(''), 'isValidAction safely handles empty string');

  const invalidExecResult = await bridge.executeAction('hack_the_pentagon', 'hack');
  assert(!invalidExecResult.success, 'executeAction cleanly fails for invalid action code');
  assert(invalidExecResult.suggestedAlternatives.includes('help'), 'Invalid action execution suggests help alternative');

  const unrecognizedQuery = await bridge.resolveAction('cook me spaghetti carbonara');
  assert(!unrecognizedQuery.matched, 'Unrecognized action query marked as not matched');
  assert(unrecognizedQuery.action === null, 'Unrecognized action query returns null action');

  // -------------------------------------------------------------
  // Test 5: Ambiguous Action Clarification (Requirement 6.5)
  // -------------------------------------------------------------
  console.log('\n--- Test 5: Ambiguous Action Clarification ---');

  const ambiguousQueries = [
    { query: 'check my email', candidates: ['open_gmail', 'open_outlook'] },
    { query: 'watch videos', candidates: ['open_youtube', 'open_netflix', 'open_prime'] },
    { query: 'play music', candidates: ['open_spotify', 'open_youtube'] },
    { query: 'open terminal', candidates: ['open_cmd', 'open_powershell'] },
    { query: 'change volume', candidates: ['volume_up', 'volume_down'] }
  ];

  for (const item of ambiguousQueries) {
    const res = await bridge.resolveAction(item.query);
    assert(res.ambiguous === true, `Detected ambiguity for "${item.query}"`);
    assert(res.clarificationPrompt && res.clarificationPrompt.length > 5, `Provides polite clarification prompt for "${item.query}"`);
    const hasCandidate = item.candidates.some(c => res.candidates.includes(c));
    assert(hasCandidate, `Candidate actions included for "${item.query}"`);
  }

  // Execute directly with ambiguous query
  const nlResult = await bridge.executeFromNaturalLanguage('check my email');
  assert(nlResult.ambiguous === true, 'executeFromNaturalLanguage halts and reports ambiguity');
  assert(nlResult.clarificationPrompt.includes('Gmail') || nlResult.clarificationPrompt.includes('Outlook'), 'Clarification prompt asks user to choose between options');

  // -------------------------------------------------------------
  // Test 6: Safe Dry-Run Mode & Live Non-Destructive Actions
  // -------------------------------------------------------------
  console.log('\n--- Test 6: Safe Execution & Live Non-Destructive Verification ---');

  // Dry run for dangerous action
  const dryShutdown = await bridge.executeAction('shutdown', 'shut down pc', { dryRun: true });
  assert(dryShutdown.success === true, 'Dry-run execution succeeds without running system command');
  assert(dryShutdown.dryRun === true, 'Dry-run flag confirmed on result');

  // Live execution for safe non-destructive actions
  const liveExecutor = new Executor();
  const liveBridge = new ActionBridge({ executor: liveExecutor, dryRun: false });

  const liveTime = await liveBridge.executeAction('time', 'what time');
  assert(liveTime.success === true, 'Live time action succeeds');
  assert(liveTime.response.includes('The time is'), `Live time response received: "${liveTime.response}"`);

  const liveThanks = await liveBridge.executeAction('thanks', 'thank you');
  assert(liveThanks.success === true, 'Live thanks action succeeds');
  assert(liveThanks.response.includes('welcome'), `Live thanks response received: "${liveThanks.response}"`);

  const liveJoke = await liveBridge.executeAction('joke', 'tell a joke');
  assert(liveJoke.success === true, 'Live joke action succeeds');
  assert(typeof liveJoke.response === 'string' && liveJoke.response.length > 10, 'Live joke received');

  // -------------------------------------------------------------
  // Test 7: Metrics Tracking
  // -------------------------------------------------------------
  console.log('\n--- Test 7: Metrics Tracking ---');
  assert(bridge.metrics.totalRequests > 60, `Metrics tracked total requests (${bridge.metrics.totalRequests})`);
  assert(bridge.metrics.ambiguousQueries >= 5, `Metrics tracked ambiguous queries (${bridge.metrics.ambiguousQueries})`);

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
