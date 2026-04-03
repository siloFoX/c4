#!/usr/bin/env node
'use strict';

// C4 Test Suite Runner
// Discovers all .test.js files and runs them with the appropriate runner:
//   - node:test style  → node --test <file>
//   - Jest-style       → node -r tests/jest-shim.js <file>
//   - Plain script     → node <file>

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const testsDir = path.join(__dirname);
const shimPath = path.join(testsDir, 'jest-shim.js');
const rootDir = path.dirname(testsDir);

// Discover test files
const testFiles = fs.readdirSync(testsDir)
  .filter(f => f.endsWith('.test.js'))
  .sort();

if (testFiles.length === 0) {
  console.log('No test files found.');
  process.exit(0);
}

// Detect test style by reading first few lines
function detectStyle(filePath) {
  const head = fs.readFileSync(filePath, 'utf8').slice(0, 1000);
  if (head.includes("require('node:test')") || head.includes('require("node:test")')) {
    return 'node-test';
  }
  if (/\b(describe|test|expect|jest\.fn)\s*\(/.test(head)) {
    return 'jest';
  }
  return 'script';
}

// Run
const results = [];
const startAll = Date.now();

console.log(`\n  C4 Test Suite\n  ${'='.repeat(50)}\n`);

for (const file of testFiles) {
  const filePath = path.join(testsDir, file);
  const style = detectStyle(filePath);
  const label = file.replace('.test.js', '');

  let cmd;
  switch (style) {
    case 'node-test':
      cmd = `node --test "${filePath}"`;
      break;
    case 'jest':
      cmd = `node -r "${shimPath}" "${filePath}"`;
      break;
    default:
      cmd = `node "${filePath}"`;
      break;
  }

  const start = Date.now();
  try {
    execSync(cmd, { cwd: rootDir, stdio: 'pipe', timeout: 30000 });
    const ms = Date.now() - start;
    results.push({ file: label, pass: true, ms });
    console.log(`  \x1b[32mPASS\x1b[0m  ${label} \x1b[90m(${ms}ms)\x1b[0m`);
  } catch (err) {
    const ms = Date.now() - start;
    results.push({ file: label, pass: false, ms, output: (err.stderr || err.stdout || '').toString().trim() });
    console.log(`  \x1b[31mFAIL\x1b[0m  ${label} \x1b[90m(${ms}ms)\x1b[0m`);
  }
}

// Summary
const passed = results.filter(r => r.pass).length;
const failed = results.filter(r => !r.pass).length;
const totalMs = Date.now() - startAll;

console.log(`\n  ${'='.repeat(50)}`);
console.log(`  Tests: ${passed} passed, ${failed} failed, ${results.length} total`);
console.log(`  Time:  ${(totalMs / 1000).toFixed(2)}s\n`);

// Print failure details
if (failed > 0) {
  console.log(`  ${'─'.repeat(50)}`);
  console.log('  Failure details:\n');
  for (const r of results.filter(r => !r.pass)) {
    console.log(`  \x1b[31m● ${r.file}\x1b[0m`);
    if (r.output) {
      const lines = r.output.split('\n').slice(-15);
      for (const line of lines) {
        console.log(`    ${line}`);
      }
    }
    console.log('');
  }
}

process.exit(failed > 0 ? 1 : 0);
