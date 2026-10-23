/**
 * Real-Process Live Telemetry & Non-Blocking Verification Test
 * 
 * Verifies both:
 * 1. Live audio level & speech streaming (samples active microphone for 3 seconds)
 * 2. Instantaneous non-blocking stdin command handling (PAUSE -> RESUME -> STOP)
 */

import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const scriptPath = path.resolve(__dirname, 'scripts/speech_listener.ps1');

console.log('='.repeat(70));
console.log('🔍 LIVE VERIFICATION: scripts/speech_listener.ps1');
console.log('='.repeat(70));
console.log(`Target: ${scriptPath}`);
console.log('Launching live PowerShell child process with redirected pipes...\n');

const startTime = Date.now();
let audioLevelCount = 0;
let isReady = false;
let isPaused = false;
let isResumed = false;
let isStopped = false;

const proc = spawn('powershell.exe', [
  '-NoProfile',
  '-ExecutionPolicy', 'Bypass',
  '-File', scriptPath
], {
  stdio: ['pipe', 'pipe', 'pipe'],
  windowsHide: true
});

proc.stdout.on('data', (chunk) => {
  const text = chunk.toString();
  const lines = text.split(/\r?\n/).filter(l => l.trim().length > 0);

  for (const line of lines) {
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
    console.log(`[+${elapsed}s STDOUT] ${line}`);

    if (line.startsWith('AUDIO_LEVEL:')) {
      audioLevelCount++;
    }

    if (line.startsWith('READY:') && !isReady) {
      isReady = true;
      console.log('\n>>> Engine is READY and actively capturing microphone.');
      console.log('>>> [Phase 1] Sampling live audio levels for 3 seconds (speak now into mic!)...\n');

      setTimeout(() => {
        console.log(`\n>>> [Phase 2] Live audio sampled (${audioLevelCount} level packets received).`);
        console.log('>>> Testing instantaneous PAUSE (acoustic echo suppression)...');
        try { proc.stdin.write('PAUSE\n'); } catch (_) {}
      }, 3000);

    } else if (line.includes('STATUS: PAUSED') && !isPaused) {
      isPaused = true;
      console.log('>>> PAUSE acknowledged! Now testing instantaneous RESUME...');
      setTimeout(() => {
        try { proc.stdin.write('RESUME\n'); } catch (_) {}
      }, 800);

    } else if (line.includes('STATUS: RESUMED') && !isResumed) {
      isResumed = true;
      console.log('>>> RESUME acknowledged! Recognition is active again.');
      console.log('>>> Testing clean STOP command...');
      setTimeout(() => {
        try { proc.stdin.write('STOP\n'); } catch (_) {}
      }, 800);

    } else if (line.includes('Stop command received')) {
      isStopped = true;
    }
  }
});

proc.stderr.on('data', (chunk) => {
  const errStr = chunk.toString();
  if (!errStr.includes('CLIXML')) {
    console.error(`[STDERR] ${errStr.trim()}`);
  }
});

// Fail-safe timeout
const timeoutTimer = setTimeout(() => {
  console.error('\n❌ FAIL: Test timed out after 20 seconds.');
  try { proc.kill('SIGKILL'); } catch (_) {}
  process.exit(1);
}, 20000);

proc.on('close', (code) => {
  clearTimeout(timeoutTimer);
  const totalDuration = ((Date.now() - startTime) / 1000).toFixed(2);

  console.log('\n' + '='.repeat(70));
  console.log(`Process exited with code ${code} in ${totalDuration}s`);
  console.log('='.repeat(70));

  let passed = true;

  if (!isReady) {
    console.error('❌ FAIL: Process never emitted READY: signal.');
    passed = false;
  } else {
    console.log('✅ PASS: Engine initialized and emitted READY signal');
  }

  if (audioLevelCount === 0) {
    console.error('❌ FAIL: No AUDIO_LEVEL packets were received.');
    passed = false;
  } else {
    console.log(`✅ PASS: Live microphone streaming verified (${audioLevelCount} AUDIO_LEVEL packets)`);
  }

  if (!isPaused) {
    console.error('❌ FAIL: Process did not respond to PAUSE command.');
    passed = false;
  } else {
    console.log('✅ PASS: Instantaneous non-blocking PAUSE verified');
  }

  if (!isResumed) {
    console.error('❌ FAIL: Process did not respond to RESUME command.');
    passed = false;
  } else {
    console.log('✅ PASS: Instantaneous non-blocking RESUME verified');
  }

  if (!isStopped) {
    console.error('❌ FAIL: Process did not acknowledge STOP command.');
    passed = false;
  } else {
    console.log('✅ PASS: Process acknowledged STOP and exited cleanly');
  }

  if (code !== 0) {
    console.error(`❌ FAIL: Process exited with non-zero exit code: ${code}`);
    passed = false;
  } else {
    console.log('✅ PASS: Exit code was 0 (clean shutdown)');
  }

  console.log('='.repeat(70));
  if (passed) {
    console.log('🎉 ALL CHECKS PASSED: Live audio streaming & instant control verified!');
    console.log('='.repeat(70));
    process.exit(0);
  } else {
    console.error('❌ TEST FAILED');
    console.log('='.repeat(70));
    process.exit(1);
  }
});
