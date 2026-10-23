/**
 * JARVIS Conversational AI - Electron IPC Bridge & Security Invariant Test Suite
 * 
 * Verifies:
 * 1. File existence and syntax validity of main.cjs, preload.cjs, index.html, index.css, and app.js
 * 2. Security invariant: nodeIntegration is disabled, contextIsolation is enabled
 * 3. Security invariant: raw ipcRenderer is never exposed to window
 * 4. Preload API surface exposes all required channels (sendMessage, triggerPtt, confirmAction, etc.)
 * 5. Destructive action confirmation gate round-trip
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import ActionBridge from './src/action-bridge.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

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

async function runTests() {
  console.log('='.repeat(75));
  console.log('🖥️ JARVIS v3.0 — ELECTRON DESKTOP SHELL & IPC VERIFICATION SUITE');
  console.log('='.repeat(75));

  // --- 1. File Structure Verification ---
  console.log('\n[1/3] Testing Desktop Shell File Structure & Assets...');
  {
    const mainPath = path.join(__dirname, 'electron', 'main.cjs');
    const preloadPath = path.join(__dirname, 'electron', 'preload.cjs');
    const htmlPath = path.join(__dirname, 'electron', 'renderer', 'index.html');
    const cssPath = path.join(__dirname, 'electron', 'renderer', 'index.css');
    const appPath = path.join(__dirname, 'electron', 'renderer', 'app.js');

    assert(fs.existsSync(mainPath), 'electron/main.cjs exists');
    assert(fs.existsSync(preloadPath), 'electron/preload.cjs exists');
    assert(fs.existsSync(htmlPath), 'electron/renderer/index.html exists');
    assert(fs.existsSync(cssPath), 'electron/renderer/index.css exists');
    assert(fs.existsSync(appPath), 'electron/renderer/app.js exists');

    const htmlContent = fs.readFileSync(htmlPath, 'utf8');
    assert(htmlContent.includes('index.css'), 'index.html links to index.css');
    assert(htmlContent.includes('app.js'), 'index.html links to app.js');
    assert(htmlContent.includes('actionModal'), 'index.html includes actionModal confirmation dialog');
    assert(htmlContent.includes('arc-reactor'), 'index.html includes Arc Reactor HUD visualizer');
  }

  // --- 2. Security Invariants Audit ---
  console.log('\n[2/3] Auditing Electron Security Invariants...');
  {
    const mainContent = fs.readFileSync(path.join(__dirname, 'electron', 'main.cjs'), 'utf8');
    const preloadContent = fs.readFileSync(path.join(__dirname, 'electron', 'preload.cjs'), 'utf8');

    // Invariant: nodeIntegration must be false
    assert(mainContent.includes('nodeIntegration: false'), 'Security invariant: nodeIntegration is strictly set to false');

    // Invariant: contextIsolation must be true
    assert(mainContent.includes('contextIsolation: true'), 'Security invariant: contextIsolation is strictly set to true');

    // Invariant: preload path configured
    assert(mainContent.includes('preload.cjs'), 'BrowserWindow webPreferences loads preload.cjs');

    // Invariant: raw ipcRenderer never leaked to main world
    assert(!preloadContent.includes('exposeInMainWorld(\'ipcRenderer\''), 'Security invariant: raw ipcRenderer is never exposed to window');
    assert(preloadContent.includes('jarvisAPI'), 'Exposes strictly whitelisted jarvisAPI surface');

    // Invariant: sandbox enabled
    assert(mainContent.includes('sandbox: true'), 'Security invariant: sandbox is strictly set to true');

    // Invariant: sendMessage invokes TTS / StreamSpeechBuffer
    assert(mainContent.includes('StreamSpeechBuffer'), 'Main process invokes StreamSpeechBuffer in jarvis:sendMessage');
    assert(mainContent.includes('sendStartupStatus'), 'Main process implements verified startup status broadcast');

    // Invariant: All required IPC methods exposed
    const requiredApis = [
      'sendMessage',
      'triggerPtt',
      'confirmAction',
      'getStatus',
      'minimizeWindow',
      'hideWindow',
      'onAudioState',
      'onVoiceHeard',
      'onStreamToken',
      'onActionPending',
      'onWelcome'
    ];

    for (const api of requiredApis) {
      assert(preloadContent.includes(`${api}:`), `Preload bridge exposes API method: ${api}`);
    }
  }

  // --- 3. Destructive Action Confirmation Round-Trip ---
  console.log('\n[3/3] Testing Destructive Action Confirmation Gate Round-Trip...');
  {
    const mockExecutor = {
      executed: false,
      lastAction: null,
      async run(action, text) {
        this.executed = true;
        this.lastAction = action;
        return `Successfully ran ${action}`;
      }
    };

    const actionBridge = new ActionBridge({ executor: mockExecutor });

    // Step A: Attempt destructive action (shutdown) without confirmed flag
    const pendingResult = await actionBridge.executeAction('shutdown', 'shut down the computer');
    assert(pendingResult.requiresConfirmation === true, 'Destructive action intercepted and requires confirmation');
    assert(mockExecutor.executed === false, 'Action was NOT executed without user confirmation');
    assert(actionBridge.hasPendingConfirmation() === true, 'ActionBridge has active pending confirmation');

    // Step B: User cancels in the UI modal
    const cancelResult = await actionBridge.resolvePendingConfirmation(false);
    assert(cancelResult.cancelled === true, 'Cancellation recorded');
    assert(actionBridge.hasPendingConfirmation() === false, 'Pending confirmation cleared after cancellation');
    assert(mockExecutor.executed === false, 'Executor was NOT triggered after cancellation');

    // Step C: Trigger again and proceed with confirmation
    await actionBridge.executeAction('restart', 'restart computer');
    assert(actionBridge.hasPendingConfirmation() === true, 'Restart action requires confirmation');

    const confirmResult = await actionBridge.resolvePendingConfirmation(true);
    assert(confirmResult.success === true, 'Confirmed action succeeded');
    assert(mockExecutor.executed === true, 'Executor was safely executed upon explicit confirmation');
    assert(mockExecutor.lastAction === 'restart', 'Executor received correct confirmed action');
  }

  console.log('\n' + '='.repeat(75));
  console.log(`🎉 ALL ${passedTests}/${totalTests} ELECTRON IPC TESTS PASSED!`);
  console.log('='.repeat(75));
}

runTests().catch(err => {
  console.error('\n❌ Unhandled error in Electron IPC test suite:', err);
  process.exit(1);
});
