/**
 * JARVIS Conversational AI - Training Pipeline Integration Test
 * 
 * Verifies:
 * 1. Data Generator outputs >= 2,000 diverse examples covering all 60 actions
 * 2. Dataset Validator enforces schema integrity and creates 80/10/10 train/val/test split
 * 3. Validation report contains comprehensive statistics and 0 duplicates
 * 4. QLoRA training script executes dry-run forward/backward pass with resource estimation
 * 5. Model export and merging pipeline executes dry-run weight merge & verification
 * 
 * Requirements: 10.1, 10.2, 10.3, 10.4, 10.5, 10.6
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { spawnSync } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATA_DIR = path.join(__dirname, 'data', 'training');
const RAW_DATASET = path.join(DATA_DIR, 'raw_dataset.jsonl');
const TRAIN_DATASET = path.join(DATA_DIR, 'train.jsonl');
const VAL_DATASET = path.join(DATA_DIR, 'val.jsonl');
const TEST_DATASET = path.join(DATA_DIR, 'test.jsonl');
const REPORT_FILE = path.join(DATA_DIR, 'dataset_report.json');
const PYTHON_PATH = path.join(__dirname, 'venv', 'Scripts', 'python.exe');

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

function countLines(filePath) {
  if (!fs.existsSync(filePath)) return 0;
  const content = fs.readFileSync(filePath, 'utf-8');
  return content.trim().split('\n').filter(Boolean).length;
}

console.log('='.repeat(65));
console.log('🧪 JARVIS TRAINING PIPELINE INTEGRATION TEST SUITE');
console.log('='.repeat(65));

// Test 1: Raw dataset generated and exceeds 2,000 records
console.log('\n[1/5] Checking Raw Dataset Generation...');
assert(fs.existsSync(RAW_DATASET), `Raw dataset file exists at ${RAW_DATASET}`);
const rawCount = countLines(RAW_DATASET);
console.log(`      Total raw examples generated: ${rawCount.toLocaleString()}`);
assert(rawCount >= 2000, `Raw dataset has >= 2,000 examples (Actual: ${rawCount})`);

// Sample record format verification
const firstLine = fs.readFileSync(RAW_DATASET, 'utf-8').trim().split('\n')[0];
const sample = JSON.parse(firstLine);
assert(typeof sample.input === 'string' && sample.input.length > 0, 'Sample record has non-empty input');
assert(typeof sample.output === 'string' && sample.output.length > 0, 'Sample record has non-empty output');
assert(typeof sample.text === 'string' && sample.text.includes('<|system|>'), 'Sample record contains Phi-3 formatted text');

// Test 2: Dataset partitioning (80/10/10 split)
console.log('\n[2/5] Checking Dataset Partitioning & Splits...');
assert(fs.existsSync(TRAIN_DATASET), 'Train split (train.jsonl) exists');
assert(fs.existsSync(VAL_DATASET), 'Val split (val.jsonl) exists');
assert(fs.existsSync(TEST_DATASET), 'Test split (test.jsonl) exists');

const trainCount = countLines(TRAIN_DATASET);
const valCount = countLines(VAL_DATASET);
const testCount = countLines(TEST_DATASET);
const totalSplitCount = trainCount + valCount + testCount;

console.log(`      Train split: ${trainCount} (${((trainCount / totalSplitCount) * 100).toFixed(1)}%)`);
console.log(`      Val split:   ${valCount} (${((valCount / totalSplitCount) * 100).toFixed(1)}%)`);
console.log(`      Test split:  ${testCount} (${((testCount / totalSplitCount) * 100).toFixed(1)}%)`);

assert(Math.abs(trainCount / totalSplitCount - 0.8) < 0.02, 'Train partition is ~80% of dataset');
assert(Math.abs(valCount / totalSplitCount - 0.1) < 0.02, 'Val partition is ~10% of dataset');
assert(Math.abs(testCount / totalSplitCount - 0.1) < 0.02, 'Test partition is ~10% of dataset');

// Test 3: Validation Report & Quality Metrics
console.log('\n[3/5] Checking Validation Report Quality Metrics...');
assert(fs.existsSync(REPORT_FILE), 'dataset_report.json exists');
const report = JSON.parse(fs.readFileSync(REPORT_FILE, 'utf-8'));

assert(report.validation_summary.data_integrity_score === 100, 'Data integrity score is 100%');
assert(report.validation_summary.duplicates_removed === 0, 'Zero duplicates in dataset');
assert(report.splits.train.unique_actions_covered === 60, 'All 60 unique actions covered in training data');
console.log(`      Unique actions verified: ${report.splits.train.unique_actions_covered}/60`);

// Test 4: QLoRA Training Dry-Run Execution
console.log('\n[4/5] Testing QLoRA Training Dry-Run...');
const trainProc = spawnSync(PYTHON_PATH, ['python/training/train.py', '--dry-run'], {
  cwd: __dirname,
  encoding: 'utf-8'
});

console.log(trainProc.stdout.split('\n').filter(l => l.includes('✅') || l.includes('LoRA Applied')).join('\n      '));
assert(trainProc.status === 0, 'train.py --dry-run exited with code 0');
assert(trainProc.stdout.includes('DRY RUN COMPLETED SUCCESSFULLY'), 'train.py logged dry run success message');

// Test 5: Model Export and Merging Dry-Run Execution
console.log('\n[5/5] Testing Model Export and Merging Pipeline...');
const exportProc = spawnSync(PYTHON_PATH, ['python/training/export_model.py', '--dry-run'], {
  cwd: __dirname,
  encoding: 'utf-8'
});

console.log(exportProc.stdout.split('\n').filter(l => l.includes('✅')).join('\n      '));
assert(exportProc.status === 0, 'export_model.py --dry-run exited with code 0');
assert(fs.existsSync(path.join(__dirname, 'models', 'jarvis-merged', 'config.json')), 'Exported merged model config.json exists');

console.log('\n' + '='.repeat(65));
console.log(`🎉 ALL ${passedTests}/${totalTests} TRAINING PIPELINE INTEGRATION TESTS PASSED!`);
console.log('='.repeat(65));
