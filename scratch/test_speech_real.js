import { spawn } from 'child_process';
import { AudioInterface } from '../src/audio-interface.js';

console.log('Testing AudioInterface.speak direct synthesis...');
const audio = new AudioInterface({ voiceOutput: true });

// Test direct synthesis with logging
const text = "Hello sir, this is your assistant speaking to verify audio output.";
console.log('Invoking audio.speak...');
const speechText = audio.speak(text);
console.log('Spoken text prepared:', speechText);

// Also test the exact powershell execution and inspect stdout/stderr
const script = `Add-Type -AssemblyName System.Speech; $synth = New-Object System.Speech.Synthesis.SpeechSynthesizer; try { $synth.SelectVoice('Microsoft David Desktop'); } catch {}; $synth.Rate = 1; $synth.Speak("${text.replace(/"/g, "'")}");`;
const encoded = Buffer.from(script, 'utf16le').toString('base64');

const child = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-EncodedCommand', encoded]);
child.stdout.on('data', d => console.log('PS stdout:', d.toString()));
child.stderr.on('data', d => console.error('PS stderr:', d.toString()));
child.on('close', code => console.log('PS closed with code:', code));
