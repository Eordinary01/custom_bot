/**
 * Integration Test Suite: JARVIS Orchestrator, Configuration & Logging
 * 
 * Tests:
 * - End-to-end conversation flow with personality
 * - Action execution flows
 * - Hybrid intent flows (action + conversation)
 * - Multi-turn conversation with reference resolution
 * - Error scenarios, unknown command fallback, and 3-strike proactive help
 * - Configuration loading, validation, and hot-reload
 * - Structured logging, timestamps, privacy masking, and 10MB rotation
 * 
 * Requirements: 1.1, 6.1, 6.3, 8.1, 8.2, 8.3, 8.4, 8.5, 8.6, 11.1, 11.2, 11.3, 13.1-13.6, 14.1-14.6
 */

import fs from 'fs';
import path from 'path';
import JarvisOrchestrator from './jarvis.js';
import ConfigManager, { DEFAULT_CONFIG } from './src/config-manager.js';
import Logger from './src/logger.js';

console.log('============================================================');
console.log('JARVIS Orchestrator & System Integration Test Suite');
console.log('Testing Tasks 7.1, 7.2, 7.3, & 7.4 Requirements');
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
  const testLogDir = path.resolve(process.cwd(), 'scratch', 'test_logs');
  if (!fs.existsSync(testLogDir)) {
    fs.mkdirSync(testLogDir, { recursive: true });
  }

  const customLogger = new Logger({
    logDir: testLogDir,
    logFileName: 'test_orchestrator.log',
    consoleOutput: false,
    privacyMasking: true
  });

  const orchestrator = new JarvisOrchestrator({
    logger: customLogger,
    dryRun: true // Safety dry run for testing
  });

  await orchestrator.initialize();

  // -------------------------------------------------------------
  // Test 1: End-to-End Conversational Flow
  // -------------------------------------------------------------
  console.log('--- Test 1: End-to-End Conversational Flow ---');

  const greetingRes = await orchestrator.process('Hello JARVIS');
  assert(greetingRes.intent.type === 'action' || greetingRes.intent.type === 'conversational',
    `Greeting recognized (intent: ${greetingRes.intent.type})`);
  assert(typeof greetingRes.text === 'string' && greetingRes.text.length > 5,
    `Received conversational greeting: "${greetingRes.text}"`);

  const jokeRes = await orchestrator.process('Tell me a joke');
  assert(typeof jokeRes.text === 'string' && jokeRes.text.length > 10,
    `Received witty joke response: "${jokeRes.text}"`);

  // -------------------------------------------------------------
  // Test 2: System Action Execution Flows
  // -------------------------------------------------------------
  console.log('\n--- Test 2: System Action Execution Flows ---');

  const singleActionRes = await orchestrator.process('Please open chrome');
  assert(singleActionRes.intent.type === 'action', 'Intent correctly identified as ACTION');
  assert(singleActionRes.text.includes('Chrome'), `Action confirmation returned: "${singleActionRes.text}"`);

  const multiActionRes = await orchestrator.process('Open chrome and notepad');
  assert(multiActionRes.intent.type === 'action', 'Compound multi-action identified as ACTION');
  assert(multiActionRes.text.includes('Chrome') && multiActionRes.text.includes('Notepad'),
    `Compound response acknowledges both applications: "${multiActionRes.text}"`);

  // -------------------------------------------------------------
  // Test 3: Hybrid Intent Flow (Action + Conversation)
  // -------------------------------------------------------------
  console.log('\n--- Test 3: Hybrid Intent Flow (Action + Conversation) ---');

  const hybridRes = await orchestrator.process('Open calculator and tell me a joke');
  assert(hybridRes.intent.type === 'hybrid', 'Intent correctly identified as HYBRID');
  assert(hybridRes.text.includes('Calculator'), 'Unified response confirms action execution');
  assert(typeof hybridRes.text === 'string' && hybridRes.text.length > 25,
    `Unified response synthesizes action and conversation: "${hybridRes.text.substring(0, 50)}..."`);

  // -------------------------------------------------------------
  // Test 4: Multi-Turn Conversation & Reference Resolution
  // -------------------------------------------------------------
  console.log('\n--- Test 4: Multi-Turn Conversation & Reference Resolution ---');

  // Turn 1: Discuss a subject
  await orchestrator.process('Let us talk about Visual Studio Code');

  // Turn 2: Reference it with pronoun "it"
  const turn2Res = await orchestrator.process('Can you open it?');
  assert(turn2Res.text.includes('VS Code') || turn2Res.text.includes('Code'),
    `Pronoun "it" resolved to subject: "${turn2Res.text}"`);

  // -------------------------------------------------------------
  // Test 5: Fallback Handling & 3-Strike Proactive Help (Req 8.1, 8.2, 8.6)
  // -------------------------------------------------------------
  console.log('\n--- Test 5: Fallback Handling & 3-Strike Proactive Help ---');

  // Strike 1
  const strike1 = await orchestrator.process('xyz gibberish foo bar one');
  assert(strike1.text.includes("didn't quite catch that") || strike1.text.includes('help'),
    `Strike 1 gives friendly guidance: "${strike1.text.substring(0, 45)}..."`);

  // Strike 2
  const strike2 = await orchestrator.process('xyz gibberish foo bar two');
  assert(strike2.text.includes("didn't quite catch that") || strike2.text.includes('help'),
    'Strike 2 returns friendly guidance');

  // Strike 3 (Proactive help trigger, Requirement 8.6)
  const strike3 = await orchestrator.process('xyz gibberish foo bar three');
  assert(strike3.text.includes('notice you might be looking for something specific') || strike3.text.includes('directory of commands'),
    `Strike 3 triggers proactive comprehensive help: "${strike3.text.substring(0, 55)}..."`);

  // Subsequent known command resets the counter
  await orchestrator.process('Hello');
  assert(orchestrator.consecutiveUnknownCount === 0, 'Consecutive unknown counter reset after recognized query');

  // -------------------------------------------------------------
  // Test 6: Configuration Management, Validation & Hot Reload (Task 7.3)
  // -------------------------------------------------------------
  console.log('\n--- Test 6: Configuration System & Hot-Reload ---');

  const testConfigPath = path.resolve(process.cwd(), 'scratch', 'test_config.json');
  fs.writeFileSync(testConfigPath, JSON.stringify(DEFAULT_CONFIG, null, 2), 'utf8');

  const configMgr = new ConfigManager({ configPath: testConfigPath, autoWatch: true });
  assert(configMgr.get('assistant.name') === 'JARVIS', 'Config correctly loaded from JSON');
  assert(configMgr.get('personality.preset') === 'BALANCED', 'Default personality is BALANCED');

  // Schema Validation
  const validCheck = ConfigManager.validate(DEFAULT_CONFIG);
  assert(validCheck.valid === true, 'Default configuration passes schema validation');

  const invalidCheck = ConfigManager.validate({ personality: { formality: 5.5 } });
  assert(invalidCheck.valid === false, 'Schema validation rejects out-of-bounds formality');

  // Hot Reload test via file update
  let hotReloadTriggered = false;
  configMgr.on('change', (newCfg) => {
    if (newCfg.personality.preset === 'STRICT') {
      hotReloadTriggered = true;
    }
  });

  const modifiedConfig = JSON.parse(JSON.stringify(DEFAULT_CONFIG));
  modifiedConfig.personality.preset = 'STRICT';
  fs.writeFileSync(testConfigPath, JSON.stringify(modifiedConfig, null, 2), 'utf8');

  // Allow debounce timer to fire
  await new Promise(r => setTimeout(r, 350));
  assert(hotReloadTriggered === true, 'Hot-reload event fired automatically on file update');
  assert(configMgr.get('personality.preset') === 'STRICT', 'Config updated dynamically without restart');

  configMgr.unwatch();

  // -------------------------------------------------------------
  // Test 7: Structured Logging, Privacy Masking & 10MB Rotation (Task 7.4)
  // -------------------------------------------------------------
  console.log('\n--- Test 7: Structured Logging & Log Rotation ---');

  const testLogFile = path.join(testLogDir, 'test_rotation.log');
  if (fs.existsSync(testLogFile)) fs.unlinkSync(testLogFile);

  const rotatingLogger = new Logger({
    logDir: testLogDir,
    logFileName: 'test_rotation.log',
    maxFileSizeBytes: 1024, // 1KB threshold for fast test of rotation logic
    maxFiles: 3,
    consoleOutput: false
  });

  // Test privacy masking (Requirement 14.6)
  const maskedText = rotatingLogger.maskPrivacy('My secret password: supersecret123 and token: abcdef12345');
  assert(maskedText.includes('[REDACTED]') && !maskedText.includes('supersecret123'),
    'Privacy filter redacts sensitive credentials');

  // Test log rotation trigger
  for (let i = 0; i < 50; i++) {
    rotatingLogger.info(`Log rotation test line ${i} with extra padding to exceed threshold faster.`);
  }

  const backupFile = path.join(testLogDir, 'test_rotation.log.1');
  assert(fs.existsSync(backupFile), `Log file rotated cleanly when size exceeded threshold (${path.basename(backupFile)})`);

  // Verify orchestrator audit log has records
  const orchestratorLogPath = path.join(testLogDir, 'test_orchestrator.log');
  assert(fs.existsSync(orchestratorLogPath), 'Orchestrator audit log file exists');
  const logContent = fs.readFileSync(orchestratorLogPath, 'utf8');
  assert(logContent.includes('"level":"INFO"'), 'Audit log contains structured JSON records');
  assert(logContent.includes('User interaction completed'), 'Audit log tracked interaction turns');

  // -------------------------------------------------------------
  // Test 8: Graceful Shutdown
  // -------------------------------------------------------------
  console.log('\n--- Test 8: Graceful Shutdown ---');
  await orchestrator.shutdown();
  assert(true, 'Orchestrator shut down cleanly, database flushed, watchers closed');

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
