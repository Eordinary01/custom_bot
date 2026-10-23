import CommandRouter from './commandRouter.js';

const router = new CommandRouter();

const tests = [
  ['open chrome', 'open_chrome'],
  ['sleep now', 'sleep_assistant'],
  ['sleep', 'sleep'],
  ['volume up', 'volume_up'],
  ['switch tab', 'switch_tab'],
  ['previous tab', 'previous_tab'],
  ['garbage', null],
  ['open notepad', 'open_notepad'],
  ['open visual studio code', 'open_vscode'],
  ['what time is it', 'time'],
  ['tell me a joke', 'joke'],
];

let pass = 0;
let fail = 0;

for (const [input, expected] of tests) {
  const result = router.match(input);
  const actual = result ? result.action : null;
  if (actual === expected) {
    console.log(`PASS  ${input.padEnd(30)} => ${actual}`);
    pass++;
  } else {
    console.log(`FAIL  ${input.padEnd(30)} => ${actual} (expected ${expected})`);
    fail++;
  }
}

console.log(`\n${pass}/${pass + fail} tests passed`);

if (fail > 0) process.exit(1);