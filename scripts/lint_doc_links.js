/**
 * Markdown Link Linter & CI Validator
 * 
 * Verifies that no markdown file in the repository contains absolute file:/// links,
 * enforcing repository-relative file paths.
 */

import fs from 'fs';
import path from 'path';

function findMarkdownFiles(dir, fileList = []) {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const filePath = path.join(dir, file);
    if (file === 'node_modules' || file === '.git' || file === 'venv') continue;
    const stat = fs.statSync(filePath);
    if (stat.isDirectory()) {
      findMarkdownFiles(filePath, fileList);
    } else if (file.endsWith('.md')) {
      fileList.push(filePath);
    }
  }
  return fileList;
}

const mdFiles = findMarkdownFiles(process.cwd());
let errors = 0;

console.log(`Checking ${mdFiles.length} markdown files for forbidden absolute file:/// links...`);

for (const file of mdFiles) {
  const content = fs.readFileSync(file, 'utf-8');
  const lines = content.split('\n');
  lines.forEach((line, idx) => {
    if (/file:\/\/\/[a-zA-Z]:/i.test(line)) {
      console.error(`❌ [${file}:${idx + 1}] Forbidden absolute file:/// link found: ${line.trim()}`);
      errors++;
    }
  });
}

if (errors > 0) {
  console.error(`\nFound ${errors} link violations. Please convert them to relative paths.`);
  process.exit(1);
} else {
  console.log('✅ All markdown documentation links are properly relative.');
  process.exit(0);
}
