// Test runner: finds all tests/*.test.js, runs each with node, reports results
'use strict';

const { readdirSync } = require('fs');
const { join } = require('path');
const { execFileSync } = require('child_process');

const testsDir = __dirname;
const files = readdirSync(testsDir)
  .filter(f => f.endsWith('.test.js'))
  .sort();

if (files.length === 0) {
  console.log('No test files found.');
  process.exit(0);
}

console.log(`Running ${files.length} test file(s)...\n`);

const results = [];

for (const file of files) {
  const filePath = join(testsDir, file);
  const entry = { file, exitCode: 0, stdout: '', stderr: '' };

  try {
    const stdout = execFileSync(process.execPath, [filePath], {
      encoding: 'utf8',
      timeout: 30000,
      stdio: ['pipe', 'pipe', 'pipe']
    });
    entry.stdout = stdout;
    entry.exitCode = 0;
  } catch (err) {
    entry.exitCode = err.status != null ? err.status : 1;
    entry.stdout = err.stdout || '';
    entry.stderr = err.stderr || '';
  }

  const tag = entry.exitCode === 0 ? 'PASS' : 'FAIL';
  console.log(`  ${tag}  ${file}`);

  if (entry.exitCode !== 0) {
    if (entry.stderr) {
      const lines = entry.stderr.trim().split('\n');
      for (const line of lines) {
        console.log(`        ${line}`);
      }
    }
    if (entry.stdout) {
      const lines = entry.stdout.trim().split('\n');
      for (const line of lines) {
        console.log(`        ${line}`);
      }
    }
  }

  results.push(entry);
}

const passed = results.filter(r => r.exitCode === 0).length;
const failed = results.filter(r => r.exitCode !== 0).length;

console.log(`\n--- Summary ---`);
console.log(`Total: ${results.length}  Passed: ${passed}  Failed: ${failed}`);

if (failed > 0) {
  process.exit(1);
}
