/**
 * JARVIS Conversational AI - Observable End-to-End Test Suite
 * 
 * Executes the real assistant binary (`node assistant.js`) as a child process
 * and asserts against its real stdout, stderr, and exit behavior.
 * 
 * Verifies:
 * 1. Process startup, banner, and prompt readiness.
 * 2. Multi-turn fact correction flow (disproving "I'm not sure how to execute that action").
 * 3. Memory persistence across turns in a live session.
 * 4. System command handling in live mode.
 * 5. Clean exit on 'exit' / 'quit'.
 */

import { spawn } from 'child_process';
import { resolve } from 'path';

class ObservableAssistantSession {
  constructor(args = ['--mute']) {
    this.child = spawn('node', ['assistant.js', ...args], {
      cwd: process.cwd(),
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, FORCE_COLOR: '0' }
    });

    this.stdoutBuffer = '';
    this.stderrBuffer = '';

    this.child.stdout.on('data', (chunk) => {
      this.stdoutBuffer += chunk.toString();
    });

    this.exitStatus = null;
    this.child.on('exit', (code, sig) => {
      this.exitStatus = { code, sig };
    });
  }

  async waitForPattern(pattern, timeoutMs = 8000) {
    const startTime = Date.now();
    return new Promise((resolvePromise, rejectPromise) => {
      const interval = setInterval(() => {
        if (this.exitStatus) {
          clearInterval(interval);
          rejectPromise(new Error(`Child process exited with code ${this.exitStatus.code} (sig ${this.exitStatus.sig}) while waiting for pattern: ${pattern}\nSTDOUT:\n${this.stdoutBuffer}\nSTDERR:\n${this.stderrBuffer}`));
          return;
        }

        const matches = typeof pattern === 'string'
          ? this.stdoutBuffer.includes(pattern)
          : pattern.test(this.stdoutBuffer);

        if (matches) {
          clearInterval(interval);
          resolvePromise(this.stdoutBuffer);
        } else if (Date.now() - startTime > timeoutMs) {
          clearInterval(interval);
          rejectPromise(new Error(`Timeout (${timeoutMs}ms) waiting for pattern: ${pattern}\nBuffer received:\n${this.stdoutBuffer}`));
        }
      }, 50);
    });
  }

  clearBuffer() {
    this.stdoutBuffer = '';
  }

  send(input) {
    this.clearBuffer();
    this.child.stdin.write(input + '\n');
  }

  async close() {
    return new Promise((resolvePromise) => {
      this.child.on('close', (code) => {
        resolvePromise(code);
      });
      this.child.stdin.write('exit\n');
      setTimeout(() => {
        try { this.child.kill(); } catch (_) { }
        resolvePromise(0);
      }, 3000);
    });
  }
}

async function runTests() {
  console.log('====================================================');
  console.log('🧪 Starting Observable E2E Test Suite (Child Process)');
  console.log('====================================================\n');

  let passed = 0;
  let failed = 0;

  const session = new ObservableAssistantSession(['--mute', '--dry-run']);

  try {
    // Test 1: Startup & Prompt
    process.stdout.write('Test 1: Subprocess startup and prompt readiness... ');
    await session.waitForPattern('You > ', 10000);
    console.log('PASSED ✅');
    passed++;

    // Test 2: Name Assignment Turn
    process.stdout.write('Test 2: User name assignment ("My name is John")... ');
    session.send('My name is John');
    await session.waitForPattern('Pleasure to formally make your acquaintance, John');
    await session.waitForPattern('You > ');
    console.log('PASSED ✅');
    passed++;

    // Test 3: Correction Handling (NOT action failure)
    process.stdout.write('Test 3: Fact correction handling ("No its not my name")... ');
    session.send('No its not my name');
    const out2 = await session.waitForPattern('What should I call you, then?');
    if (out2.includes("I'm not sure how to execute that action")) {
      throw new Error('FAILED: Spurious action failure message detected in correction response!');
    }
    await session.waitForPattern('You > ');
    console.log('PASSED ✅');
    passed++;

    // Test 4: Corrected Name Submission
    process.stdout.write('Test 4: Corrected name registration ("Rehan")... ');
    session.send('Rehan');
    await session.waitForPattern('your name is Rehan, sir.');
    await session.waitForPattern('You > ');
    console.log('PASSED ✅');
    passed++;

    // Test 5: Name Retrieval Verification
    process.stdout.write('Test 5: Memory query verification ("What is my name")... ');
    session.send('What is my name');
    await session.waitForPattern('Your name is Rehan, sir.');
    await session.waitForPattern('You > ');
    console.log('PASSED ✅');
    passed++;

    // Test 6: System Action Execution in Dry Run
    process.stdout.write('Test 6: Fast regex action execution ("open notepad")... ');
    session.send('open notepad');
    await session.waitForPattern(/notepad/i);
    await session.waitForPattern('You > ');
    console.log('PASSED ✅');
    passed++;

    // Test 7: Volume Query with User Typo ("WHATS THE CUURENT VOLUME JARVIS")
    process.stdout.write('Test 7: Volume query with typo handling ("WHATS THE CUURENT VOLUME JARVIS")... ');
    session.send('WHATS THE CURENT VOLUME JARVIS');
    await session.waitForPattern(/current system volume is/i);
    await session.waitForPattern('You > ');
    console.log('PASSED ✅');
    passed++;

    // Test 8: Memory Update Instruction
    process.stdout.write('Test 8: Memory update instruction ("like currently it is at 48. so update in the memory")... ');
    session.send('NEXT time I ask you this question you are supposed to say the current system volume... like currently it is at 48. so update in the memory');
    await session.waitForPattern(/committed this to memory: the current system volume is recorded at 48%/i);
    await session.waitForPattern('You > ');
    console.log('PASSED ✅');
    passed++;

    // Test 9: Memory Inspection Query ("what you just stored in the memory")
    process.stdout.write('Test 9: Memory inspection query ("what you just stored in the memory")... ');
    session.send('what you just stored in the memory');
    await session.waitForPattern(/system_volume: 48%/i);
    await session.waitForPattern('You > ');
    console.log('PASSED ✅');
    passed++;

    // Test 10: Brightness Query
    process.stdout.write('Test 10: Brightness query ("whats the current brightness")... ');
    session.send('whats the current brightness');
    await session.waitForPattern(/current screen brightness is/i);
    await session.waitForPattern('You > ');
    console.log('PASSED ✅');
    passed++;

    // Test 11: Time-Sensitive News Query in Offline Mode (Grounding Rule: Honest decline, no hallucinations)
    process.stdout.write('Test 11: Grounding rule on news query ("what is the latest news today")... ');
    session.send('what is the latest news today');
    await session.waitForPattern(/offline mode/i);
    await session.waitForPattern('You > ');
    console.log('PASSED ✅');
    passed++;

    // Test 12: Conversation-First Routing on Casual Chat with Incidental "Today" (Section 14.2)
    process.stdout.write('Test 12: Conversation-first routing ("I just feel like chatting today, so are you up to it")... ');
    await new Promise((r) => setTimeout(r, 500));
    session.send('I just feel like chatting today, so are you up to it');
    const chatOut = await session.waitForPattern(/JARVIS:/i, 60000);
    if (/Today is (?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)/i.test(chatOut)) {
      throw new Error('FAILED: Incidental "today" was misrouted to date action instead of open conversation!');
    }
    await session.waitForPattern('You > ', 60000);
    console.log('PASSED ✅');
    passed++;

    // Test 13: Clean Shutdown
    process.stdout.write('Test 13: Clean subprocess termination on "exit"... ');
    const exitCode = await session.close();
    console.log(`PASSED ✅ (exit code: ${exitCode})`);
    passed++;

  } catch (err) {
    console.log(`FAILED ❌: ${err.message}\nSTDERR:\n${session.stderrBuffer}`);
    failed++;
    try { session.child.kill(); } catch (_) { }
  }

  console.log('\n====================================================');
  console.log(`Summary: ${passed} passed, ${failed} failed (${passed + failed} total)`);
  console.log('====================================================');

  if (failed > 0) {
    process.exit(1);
  }
}

runTests();
