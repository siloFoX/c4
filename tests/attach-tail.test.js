'use strict';

// Tests for src/attach-tail.js (8.32 slice 1).
//
// Covers the live-tail module that powers the SSE endpoint feeding
// the web UI new turns as the underlying JSONL grows.

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const mod = require('../src/attach-tail');
const { AttachTail, watchAttachedSession, DEFAULT_DEBOUNCE_MS } = mod;

let passed = 0;
let failed = 0;
const pending = [];
function t(label, fn) {
  pending.push(async () => {
    try {
      await fn();
      passed += 1;
      console.log(`  PASS  ${label}`);
    } catch (err) {
      failed += 1;
      console.log(`  FAIL  ${label}\n        ${err.message}`);
      if (err.stack) console.log(err.stack.split('\n').slice(1, 4).join('\n'));
    }
  });
}

function makeTmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'c4-attach-tail-'));
}

function userTurnLine(text, ts = '2026-05-03T00:00:00.000Z', sessionId = 's1') {
  return JSON.stringify({
    type: 'user',
    sessionId,
    timestamp: ts,
    cwd: '/tmp/proj',
    message: { role: 'user', content: [{ type: 'text', text }] },
  });
}

function asstTurnLine(text, ts = '2026-05-03T00:00:01.000Z', sessionId = 's1') {
  return JSON.stringify({
    type: 'assistant',
    sessionId,
    timestamp: ts,
    cwd: '/tmp/proj',
    message: {
      role: 'assistant',
      model: 'claude-opus-4-7',
      content: [{ type: 'text', text }],
      usage: { input_tokens: 1, output_tokens: 1 },
    },
  });
}

function wait(ms) { return new Promise((r) => setTimeout(r, ms)); }

// Helpers

t('module exports surface', () => {
  assert.strictEqual(typeof AttachTail, 'function');
  assert.strictEqual(typeof watchAttachedSession, 'function');
  assert.strictEqual(typeof DEFAULT_DEBOUNCE_MS, 'number');
});

t('constructor rejects missing path', () => {
  assert.throws(() => new AttachTail(''));
  assert.throws(() => new AttachTail(null));
  assert.throws(() => new AttachTail(undefined));
});

t('start with empty file → no turns until something appended', async () => {
  const dir = makeTmpDir();
  const file = path.join(dir, 's1.jsonl');
  fs.writeFileSync(file, '');
  const tail = new AttachTail(file, { debounceMs: 5 });
  const seen = [];
  tail.on('turn', (turn) => seen.push(turn));
  tail.start();
  await wait(30);
  assert.strictEqual(seen.length, 0, 'no turns from empty file');
  tail.stop();
});

t('appended user turn fires turn event', async () => {
  const dir = makeTmpDir();
  const file = path.join(dir, 's2.jsonl');
  fs.writeFileSync(file, '');
  const tail = watchAttachedSession(file, { debounceMs: 5 });
  const seen = [];
  tail.on('turn', (turn) => seen.push(turn));

  fs.appendFileSync(file, userTurnLine('hello there') + '\n');
  // wait long enough for fs.watch + debounce + read
  for (let i = 0; i < 20 && seen.length === 0; i += 1) await wait(20);
  assert.ok(seen.length >= 1, `expected at least 1 turn, got ${seen.length}`);
  assert.strictEqual(seen[0].role, 'user');
  tail.stop();
});

t('multiple appended lines preserved in order', async () => {
  const dir = makeTmpDir();
  const file = path.join(dir, 's3.jsonl');
  fs.writeFileSync(file, '');
  const tail = watchAttachedSession(file, { debounceMs: 5 });
  const seen = [];
  tail.on('turn', (turn) => seen.push(turn));

  fs.appendFileSync(file,
    userTurnLine('one', '2026-05-03T00:00:00.000Z') + '\n' +
    asstTurnLine('two', '2026-05-03T00:00:01.000Z') + '\n' +
    userTurnLine('three', '2026-05-03T00:00:02.000Z') + '\n');
  for (let i = 0; i < 25 && seen.length < 3; i += 1) await wait(20);
  assert.strictEqual(seen.length, 3);
  assert.strictEqual(seen[0].role, 'user');
  assert.strictEqual(seen[1].role, 'assistant');
  assert.strictEqual(seen[2].role, 'user');
  tail.stop();
});

t('startOffset:0 replays full existing file', async () => {
  const dir = makeTmpDir();
  const file = path.join(dir, 's4.jsonl');
  fs.writeFileSync(file,
    userTurnLine('preexisting one', '2026-05-03T00:00:00.000Z') + '\n' +
    asstTurnLine('preexisting two', '2026-05-03T00:00:01.000Z') + '\n');
  const tail = watchAttachedSession(file, { debounceMs: 5, startOffset: 0 });
  const seen = [];
  tail.on('turn', (turn) => seen.push(turn));
  for (let i = 0; i < 20 && seen.length < 2; i += 1) await wait(20);
  assert.strictEqual(seen.length, 2, `expected backfill of 2 turns, got ${seen.length}`);
  tail.stop();
});

t('default startOffset (live-only) skips existing content', async () => {
  const dir = makeTmpDir();
  const file = path.join(dir, 's5.jsonl');
  fs.writeFileSync(file, userTurnLine('old', '2026-05-03T00:00:00.000Z') + '\n');
  const tail = watchAttachedSession(file, { debounceMs: 5 });
  const seen = [];
  tail.on('turn', (turn) => seen.push(turn));
  await wait(40);
  assert.strictEqual(seen.length, 0, 'live-only mode must not replay history');
  fs.appendFileSync(file, userTurnLine('new', '2026-05-03T00:01:00.000Z') + '\n');
  for (let i = 0; i < 25 && seen.length < 1; i += 1) await wait(20);
  assert.strictEqual(seen.length, 1);
  tail.stop();
});

t('partial line at chunk boundary held until newline arrives', async () => {
  const dir = makeTmpDir();
  const file = path.join(dir, 's6.jsonl');
  fs.writeFileSync(file, '');
  const tail = watchAttachedSession(file, { debounceMs: 5 });
  const seen = [];
  const warnings = [];
  tail.on('turn', (turn) => seen.push(turn));
  tail.on('warning', (w) => warnings.push(w));

  const full = userTurnLine('split me', '2026-05-03T00:00:00.000Z');
  // write half without newline first
  fs.appendFileSync(file, full.slice(0, Math.floor(full.length / 2)));
  await wait(40);
  assert.strictEqual(seen.length, 0, 'no turn before newline');
  assert.strictEqual(warnings.length, 0, 'no malformed-json warning for in-flight write');

  fs.appendFileSync(file, full.slice(Math.floor(full.length / 2)) + '\n');
  for (let i = 0; i < 25 && seen.length < 1; i += 1) await wait(20);
  assert.strictEqual(seen.length, 1, `expected 1 turn after newline, got ${seen.length}`);
  tail.stop();
});

t('shrink-truncation resets offset and re-emits', async () => {
  const dir = makeTmpDir();
  const file = path.join(dir, 's7.jsonl');
  // start with two pre-existing turns so the post-truncate file is
  // strictly shorter than the original
  fs.writeFileSync(file,
    userTurnLine('preexisting one', '2026-05-03T00:00:00.000Z', 'a') + '\n' +
    asstTurnLine('preexisting two', '2026-05-03T00:00:01.000Z', 'a') + '\n');
  const tail = watchAttachedSession(file, { debounceMs: 5 });
  const seen = [];
  tail.on('turn', (turn) => seen.push(turn));
  await wait(40);
  assert.strictEqual(seen.length, 0, 'live-only mode skips backfill');

  // truncate to a strictly smaller payload (one short turn)
  fs.writeFileSync(file,
    userTurnLine('hi', '2026-05-03T01:00:00.000Z', 'b') + '\n');
  for (let i = 0; i < 30 && seen.length < 1; i += 1) await wait(20);
  assert.strictEqual(seen.length, 1, `expected re-tail after shrink, got ${seen.length}`);
  tail.stop();
});

t('stop() is idempotent and emits closed', async () => {
  const dir = makeTmpDir();
  const file = path.join(dir, 's8.jsonl');
  fs.writeFileSync(file, '');
  const tail = watchAttachedSession(file, { debounceMs: 5 });
  let closedCount = 0;
  tail.on('closed', () => { closedCount += 1; });
  tail.stop();
  tail.stop();
  await wait(10);
  assert.strictEqual(closedCount, 1, 'second stop() should not re-emit');
});

t('start() on missing file emits error, no crash', async () => {
  const tail = new AttachTail('/tmp/c4-attach-tail-does-not-exist.jsonl', { debounceMs: 5 });
  let err;
  tail.on('error', (e) => { err = e; });
  tail.start();
  await wait(20);
  assert.ok(err, 'expected error event for missing file');
  tail.stop();
});

t('currentOffset advances after read', async () => {
  const dir = makeTmpDir();
  const file = path.join(dir, 's9.jsonl');
  fs.writeFileSync(file, '');
  const tail = watchAttachedSession(file, { debounceMs: 5 });
  assert.strictEqual(tail.currentOffset, 0);
  fs.appendFileSync(file, userTurnLine('measure me', '2026-05-03T00:00:00.000Z') + '\n');
  for (let i = 0; i < 25 && tail.currentOffset === 0; i += 1) await wait(20);
  assert.ok(tail.currentOffset > 0, `offset should advance, got ${tail.currentOffset}`);
  tail.stop();
});

(async () => {
  for (const fn of pending) await fn();
  console.log(`\n  ${passed} passed, ${failed} failed (attach-tail)`);
  if (failed > 0) process.exit(1);
})();
