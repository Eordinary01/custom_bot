/**
 * JARVIS Conversational AI - Chat Dataset Exporter for Fine-Tuning
 * 
 * Exports dialogue history and learned interactions from SQLite memory
 * into instruction-tuning JSONL format suitable for LoRA fine-tuning.
 */

import fs from 'fs';
import path from 'path';
import { DatabaseSync } from 'node:sqlite';
import { JARVIS_SYSTEM_PROMPT } from '../src/prompt-templates.js';

const DB_PATH = path.join(process.cwd(), 'data', 'memory', 'jarvis_memory.db');
const OUTPUT_DIR = path.join(process.cwd(), 'data', 'training');
const OUTPUT_FILE = path.join(OUTPUT_DIR, 'user_chat_dataset.jsonl');

// Core companion demonstration dialogues for buddy persona fine-tuning
const BUDDY_SEEDS = [
  {
    input: "So from now your name is GOAT",
    output: "Haha, GOAT it is! I like the sound of that. What are we tackling next?"
  },
  {
    input: "Your nick name is GOAT, so what is your name",
    output: "Officially I am JARVIS, but you gave me the title GOAT — and I wear it with pride, my friend! How can I help?"
  },
  {
    input: "Hey buddy, can you give me some quick ideas for a weekend coding project?",
    output: "Absolutely! How about a local voice-activated soundboard, a CLI pomodoro timer with ambient sounds, or a personal markdown journal with sentiment tracking? Which one catches your eye?"
  },
  {
    input: "What do you think about Rust vs Python?",
    output: "They're an incredible duo rather than competitors! Python gives you unmatched developer speed and AI tooling, while Rust gives you bare-metal speed, zero-cost abstractions, and rock-solid memory safety. Many top libraries now build their core in Rust with Python bindings."
  },
  {
    input: "I feel tired and unmotivated today.",
    output: "Totally understand, friend. We all have days like that. Don't force a marathon today—take a walk, grab a drink, and pick just one tiny 5-minute task. Even small momentum counts."
  }
];

export function exportChatDataset(options = {}) {
  const dbPath = options.dbPath || DB_PATH;
  const outputDir = options.outputDir || OUTPUT_DIR;
  const outputFile = options.outputFile || OUTPUT_FILE;

  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const examples = [];

  // 1. Add Companion Demonstration Seeds
  for (const seed of BUDDY_SEEDS) {
    examples.push({
      input: seed.input,
      output: seed.output,
      text: `<|system|>\n${JARVIS_SYSTEM_PROMPT}<|end|>\n<|user|>\n${seed.input}<|end|>\n<|assistant|>\n${seed.output}<|end|>`
    });
  }

// Safety filter: Destructive system actions and sensitive credentials
// must NEVER be included in fine-tuning datasets to protect system invariants.
const DESTRUCTIVE_AND_SENSITIVE_PATTERNS = [
  /\b(?:shutdown|shut\s*down|power\s*off)\b/i,
  /\b(?:restart|reboot)\b/i,
  /\b(?:delete\s+file|remove\s+file|format\s+drive|rmdir)\b/i,
  /\b(?:password|passwd|pin|secret|api[_\s-]?key|auth[_\s-]?token|private[_\s-]?key)\b/i,
  /\b(?:credit\s*card|debit\s*card|cvv|bank\s*account|ssn)\b/i
];

function isSafeForFineTuning(userText, assistantText) {
  const combined = `${userText || ''} ${assistantText || ''}`;
  return !DESTRUCTIVE_AND_SENSITIVE_PATTERNS.some(p => p.test(combined));
}

  // 2. Read SQLite Turns with safety filtering
  if (fs.existsSync(dbPath)) {
    try {
      const db = new DatabaseSync(dbPath);
      const rows = db.prepare(`
        SELECT session_id, role, content, timestamp
        FROM conversation_turns
        ORDER BY session_id, id ASC
      `).all();

      let lastUserTurn = null;
      let excludedCount = 0;
      for (const row of rows) {
        if (row.role === 'user') {
          lastUserTurn = row.content;
        } else if (row.role === 'assistant' && lastUserTurn) {
          if (isSafeForFineTuning(lastUserTurn, row.content)) {
            examples.push({
              input: lastUserTurn,
              output: row.content,
              text: `<|system|>\n${JARVIS_SYSTEM_PROMPT}<|end|>\n<|user|>\n${lastUserTurn}<|end|>\n<|assistant|>\n${row.content}<|end|>`
            });
          } else {
            excludedCount++;
          }
          lastUserTurn = null;
        }
      }
      db.close();
      if (excludedCount > 0) {
        console.log(`[ExportDataset] Safety filter: excluded ${excludedCount} unsafe turns (destructive/sensitive) from training dataset.`);
      }
    } catch (err) {
      console.warn(`[ExportDataset] Note: Could not extract from SQLite (${err.message}). Using seed datasets.`);
    }
  }

  // 3. Write to JSONL
  const lines = examples.map(ex => JSON.stringify(ex)).join('\n');
  fs.writeFileSync(outputFile, lines + '\n', 'utf-8');

  // Also update data/training/train.jsonl for direct trainer consumption
  const trainFile = path.join(outputDir, 'train.jsonl');
  if (fs.existsSync(trainFile)) {
    fs.appendFileSync(trainFile, lines + '\n', 'utf-8');
  } else {
    fs.writeFileSync(trainFile, lines + '\n', 'utf-8');
  }

  console.log(`[ExportDataset] Successfully exported ${examples.length} fine-tuning examples to ${outputFile}`);
  return { count: examples.length, outputFile };
}

// Run directly if invoked via node
const isMain = process.argv[1] && process.argv[1].endsWith('export_chat_dataset.js');
if (isMain) {
  exportChatDataset();
}

export default exportChatDataset;
