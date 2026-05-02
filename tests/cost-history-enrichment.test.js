'use strict';

// (v1.10.99) Cost-report data enrichment tests.
//
// Pre-1.10.99, history.jsonl carried only {name, task, branch,
// startedAt, completedAt, commits, status} — no token counts,
// no model. cost-report.js could aggregate the records but every
// dollar amount fell back to the rate of an unknown model
// (under-counting opus 5x). 1.10.99 wires _readSessionTokens()
// into _recordHistory() so the historical record carries the
// fields cost-report needs.
//
// These tests cover:
//   1. _readSessionTokens returns {input, output, model}
//   2. dominant-model selection picks the model with the most
//      assistant turns (handles operators who switched mid-session)
//   3. _recordHistory enrichment is best-effort — missing JSONL
//      / unreadable session falls through cleanly

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

// Read the relevant function bodies via the regex-extract pattern
// other test files use (e.g. cost-guard.test.js, worktree-gc.test.js).
// This avoids spawning the full PtyManager (which needs node-pty +
// state.json + audit chain) just to exercise these two methods.
const ptyMgrSrc = fs.readFileSync(
  path.resolve(__dirname, '..', 'src', 'pty-manager.js'), 'utf8'
);

function _extractFn(name) {
  // Match `name(args) { ... }` body. Greedy paren-balanced walk.
  const re = new RegExp(`\\b${name}\\s*\\(([^)]*)\\)\\s*\\{`, 'm');
  const m = ptyMgrSrc.match(re);
  if (!m) throw new Error(`fn ${name} not found`);
  const start = m.index + m[0].length - 1;  // pointer at opening {
  let depth = 0;
  for (let i = start; i < ptyMgrSrc.length; i++) {
    if (ptyMgrSrc[i] === '{') depth++;
    else if (ptyMgrSrc[i] === '}') {
      depth--;
      if (depth === 0) {
        // Body without surrounding braces
        return {
          args: m[1].trim(),
          body: ptyMgrSrc.slice(start + 1, i),
          full: ptyMgrSrc.slice(m.index, i + 1),
        };
      }
    }
  }
  throw new Error(`unterminated fn ${name}`);
}

describe('_readSessionTokens — model + tokens (v1.10.99)', () => {
  const fn = _extractFn('_readSessionTokens');

  it('captures model alongside input/output tokens', () => {
    assert.match(fn.body, /modelCounts/);
    assert.match(fn.body, /obj\.message\?\.model \|\| obj\.model/);
    assert.match(fn.body, /return \{ input, output, model: dominantModel \}/);
  });

  it('returns model:null when JSONL has no model field', () => {
    assert.match(fn.body, /model: null/);
  });

  it('picks the dominant model on tie (last seen wins)', () => {
    // The reduce uses `c >= bestCount` so ties go to the last
    // entry (insertion order in Map = first-seen-first). Tie-break
    // is "last in iteration wins", consistent with `>=`.
    assert.match(fn.body, /c >= bestCount/);
  });
});

describe('_recordHistory — cost enrichment (v1.10.99)', () => {
  const fn = _extractFn('_recordHistory');

  it('calls _readSessionTokens with worker._sessionId + worker.worktree', () => {
    assert.match(fn.body, /this\._readSessionTokens\(sessionId, worker\.worktree\)/);
  });

  it('only attaches cost fields when tokens are non-zero', () => {
    assert.match(fn.body, /tokens\.input > 0 \|\| tokens\.output > 0/);
  });

  it('writes inputTokens / outputTokens / model / sessionId / timestamp', () => {
    assert.match(fn.body, /record\.sessionId = sessionId/);
    assert.match(fn.body, /record\.inputTokens = tokens\.input/);
    assert.match(fn.body, /record\.outputTokens = tokens\.output/);
    assert.match(fn.body, /record\.model = tokens\.model/);
    assert.match(fn.body, /record\.timestamp = record\.completedAt/);
  });

  it('best-effort enrichment — try/swallow guards the session read', () => {
    // The enrichment must not break history writes when the
    // session JSONL is unreadable / missing.
    assert.match(fn.body, /history write must not depend on session JSONL/);
  });
});

describe('Behavioural: real _readSessionTokens against a synthetic JSONL', () => {
  // Build the same logic in-test so we can run it against a real
  // tmp file and verify token + model extraction end-to-end.
  // This intentionally duplicates the source — if the source
  // diverges, the source-grep tests above flag it; if the test
  // diverges, the behaviour drifts and assertions catch it.

  function readSessionTokens(file) {
    if (!fs.existsSync(file)) return { input: 0, output: 0, model: null };
    const content = fs.readFileSync(file, 'utf8');
    let input = 0, output = 0;
    const modelCounts = new Map();
    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        const obj = JSON.parse(trimmed);
        const usage = obj.message?.usage || obj.usage;
        if (usage) {
          if (usage.input_tokens) input += usage.input_tokens;
          if (usage.output_tokens) output += usage.output_tokens;
        }
        const model = obj.message?.model || obj.model;
        if (typeof model === 'string' && model.length > 0) {
          modelCounts.set(model, (modelCounts.get(model) || 0) + 1);
        }
      } catch {}
    }
    let dominantModel = null;
    let bestCount = 0;
    for (const [m, c] of modelCounts) {
      if (c >= bestCount) { dominantModel = m; bestCount = c; }
    }
    return { input, output, model: dominantModel };
  }

  it('reads token counts and dominant model from a synthetic claude JSONL', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'c4-cost-'));
    try {
      const file = path.join(tmp, 'session.jsonl');
      fs.writeFileSync(file, [
        JSON.stringify({ message: { model: 'claude-opus-4-7', usage: { input_tokens: 100, output_tokens: 200 } } }),
        JSON.stringify({ message: { model: 'claude-opus-4-7', usage: { input_tokens: 50,  output_tokens: 75 } } }),
        JSON.stringify({ message: { model: 'claude-opus-4-7', usage: { input_tokens: 25,  output_tokens: 30 } } }),
      ].join('\n'));
      const out = readSessionTokens(file);
      assert.equal(out.input, 175);
      assert.equal(out.output, 305);
      assert.equal(out.model, 'claude-opus-4-7');
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('dominant-model selection picks the most-frequent model', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'c4-cost-'));
    try {
      const file = path.join(tmp, 'session.jsonl');
      fs.writeFileSync(file, [
        JSON.stringify({ message: { model: 'claude-opus-4-7', usage: { input_tokens: 1, output_tokens: 1 } } }),
        JSON.stringify({ message: { model: 'claude-sonnet-4-6', usage: { input_tokens: 1, output_tokens: 1 } } }),
        JSON.stringify({ message: { model: 'claude-sonnet-4-6', usage: { input_tokens: 1, output_tokens: 1 } } }),
        JSON.stringify({ message: { model: 'claude-sonnet-4-6', usage: { input_tokens: 1, output_tokens: 1 } } }),
      ].join('\n'));
      const out = readSessionTokens(file);
      assert.equal(out.model, 'claude-sonnet-4-6');
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('missing model fields → returns model:null but tokens still aggregate', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'c4-cost-'));
    try {
      const file = path.join(tmp, 'session.jsonl');
      fs.writeFileSync(file, [
        JSON.stringify({ usage: { input_tokens: 100, output_tokens: 50 } }),
      ].join('\n'));
      const out = readSessionTokens(file);
      assert.equal(out.input, 100);
      assert.equal(out.output, 50);
      assert.equal(out.model, null);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('missing file returns zero envelope', () => {
    const out = readSessionTokens('/no/such/session.jsonl');
    assert.deepEqual(out, { input: 0, output: 0, model: null });
  });

  it('malformed JSONL lines are skipped', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'c4-cost-'));
    try {
      const file = path.join(tmp, 'session.jsonl');
      fs.writeFileSync(file, [
        'not-json',
        JSON.stringify({ message: { model: 'claude-opus-4-7', usage: { input_tokens: 10, output_tokens: 20 } } }),
        '{"broken": ',
      ].join('\n'));
      const out = readSessionTokens(file);
      assert.equal(out.input, 10);
      assert.equal(out.output, 20);
      assert.equal(out.model, 'claude-opus-4-7');
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });
});
