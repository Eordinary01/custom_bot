// Quick smoke test for assistant interactive mode
import { spawn } from 'child_process';

console.log('🧪 Testing Interactive Assistant\n');

const assistant = spawn('node', ['assistant.js']);

let output = '';

assistant.stdout.on('data', (data) => {
  output += data.toString();
  process.stdout.write(data);
});

assistant.stderr.on('data', (data) => {
  console.error('Error:', data.toString());
});

// Wait for startup message
setTimeout(() => {
  console.log('\n📤 Sending: help');
  assistant.stdin.write('help\n');
}, 1000);

setTimeout(() => {
  console.log('\n📤 Sending: time');
  assistant.stdin.write('time\n');
}, 2000);

setTimeout(() => {
  console.log('\n📤 Sending: joke');
  assistant.stdin.write('joke\n');
}, 3000);

setTimeout(() => {
  console.log('\n📤 Sending: exit');
  assistant.stdin.write('exit\n');
}, 4000);

assistant.on('close', (code) => {
  console.log(`\n✅ Assistant exited with code ${code}`);
  
  // Verify output contains expected elements
  const checks = [
    { text: 'Text Assistant started', pass: output.includes('Text Assistant started') },
    { text: 'AVAILABLE COMMANDS', pass: output.includes('AVAILABLE COMMANDS') },
    { text: 'Executing', pass: output.includes('Executing') },
    { text: 'Goodbye', pass: output.includes('Goodbye') }
  ];
  
  console.log('\n📊 Verification:');
  let allPassed = true;
  checks.forEach(check => {
    const status = check.pass ? '✅' : '❌';
    console.log(`${status} ${check.text}`);
    if (!check.pass) allPassed = false;
  });
  
  if (allPassed) {
    console.log('\n🎉 Interactive mode test PASSED');
    process.exit(0);
  } else {
    console.log('\n❌ Interactive mode test FAILED');
    process.exit(1);
  }
});

// Timeout fallback
setTimeout(() => {
  console.log('\n⏱️ Test timeout - killing process');
  assistant.kill();
  process.exit(1);
}, 6000);
