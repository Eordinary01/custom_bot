import { spawn } from 'child_process';

const child = spawn('node', ['assistant.js', '--mute', '--dry-run'], {
  cwd: process.cwd(),
  stdio: ['pipe', 'pipe', 'pipe'],
  env: { ...process.env, FORCE_COLOR: '0' }
});

child.stdout.on('data', (d) => {
  console.log('[STDOUT CHUNK]:', JSON.stringify(d.toString()));
});

child.stderr.on('data', (d) => {
  console.log('[STDERR CHUNK]:', JSON.stringify(d.toString()));
});

child.on('exit', (code) => {
  console.log('[EXIT]:', code);
});

// Send after prompt
setTimeout(() => {
  console.log('SENDING chat query...');
  child.stdin.write('I just feel like chatting today, so are you up to it\n');
}, 3000);

setTimeout(() => {
  console.log('SENDING exit...');
  child.stdin.write('exit\n');
}, 15000);
