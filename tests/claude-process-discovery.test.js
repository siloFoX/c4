'use strict';

// Tests for src/claude-process-discovery.js (8.32 slice 2).
//
// Stand-up a child node process that opens a fixture JSONL, then
// verify the scanner can find it via /proc fd inspection. We use a
// custom cmdlinePredicate (matching 'node') so the test does not
// require an actual Claude Code binary on PATH.

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const mod = require('../src/claude-process-discovery');
const {
  findProcessForJsonl,
  listClaudeProcesses,
  looksLikeClaudeCode,
  listPids,
  readCmdline,
  decodeProjectFromJsonl,
} = mod;

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
  return fs.mkdtempSync(path.join(os.tmpdir(), 'c4-proc-discover-'));
}

function wait(ms) { return new Promise((r) => setTimeout(r, ms)); }

// Spawn a child node that holds the fixture JSONL open and reports
// its pid back via stdout once the fd is established.
function spawnHolder(filePath) {
  return new Promise((resolve, reject) => {
    const script = `
      const fs = require('fs');
      const fd = fs.openSync(${JSON.stringify(filePath)}, 'a');
      process.stdout.write('READY:' + process.pid + '\\n');
      // Stay alive until parent kills us.
      setInterval(() => {}, 60000);
    `;
    const child = spawn(process.execPath, ['-e', script], { stdio: ['ignore', 'pipe', 'pipe'] });
    let buf = '';
    child.stdout.on('data', (chunk) => {
      buf += chunk.toString('utf8');
      const m = buf.match(/READY:(\d+)/);
      if (m) resolve({ child, pid: parseInt(m[1], 10) });
    });
    child.on('error', reject);
    setTimeout(() => reject(new Error('holder did not become ready in time')), 4000);
  });
}

function killHolder(holder) {
  if (!holder || !holder.child) return;
  try { holder.child.kill('SIGKILL'); } catch { /* noop */ }
}

t('module exports surface', () => {
  assert.strictEqual(typeof findProcessForJsonl, 'function');
  assert.strictEqual(typeof listClaudeProcesses, 'function');
  assert.strictEqual(typeof looksLikeClaudeCode, 'function');
  assert.strictEqual(typeof listPids, 'function');
  assert.strictEqual(typeof readCmdline, 'function');
});

t('looksLikeClaudeCode positive + negative cases', () => {
  assert.strictEqual(looksLikeClaudeCode(['/usr/bin/claude']), true);
  assert.strictEqual(looksLikeClaudeCode(['node', '/usr/bin/claude', '--resume']), true);
  assert.strictEqual(looksLikeClaudeCode(['claude-code', 'session']), true);
  assert.strictEqual(looksLikeClaudeCode(['/usr/bin/node', 'index.js']), false);
  assert.strictEqual(looksLikeClaudeCode([]), false);
  assert.strictEqual(looksLikeClaudeCode(null), false);
  assert.strictEqual(looksLikeClaudeCode(undefined), false);
  assert.strictEqual(looksLikeClaudeCode([null, 5]), false);
});

t('listPids returns at least our own pid', () => {
  const pids = listPids();
  assert.ok(Array.isArray(pids), 'pids should be array');
  assert.ok(pids.includes(process.pid), 'should include self');
  assert.ok(pids.length > 1, 'should be more than one process on this box');
});

t('findProcessForJsonl returns null for non-existent path', () => {
  const r = findProcessForJsonl('/tmp/c4-discover-does-not-exist.jsonl');
  assert.strictEqual(r, null);
});

t('findProcessForJsonl returns null for invalid input', () => {
  assert.strictEqual(findProcessForJsonl(''), null);
  assert.strictEqual(findProcessForJsonl(null), null);
  assert.strictEqual(findProcessForJsonl(undefined), null);
});

t('findProcessForJsonl finds a child holding the fd', async () => {
  const dir = makeTmpDir();
  const file = path.join(dir, 'session-X.jsonl');
  fs.writeFileSync(file, '');
  let holder;
  try {
    holder = await spawnHolder(file);
    // Custom predicate matches 'node' so we can verify discovery
    // without needing an actual Claude Code binary running in CI.
    const found = findProcessForJsonl(file, {
      cmdlinePredicate: (cmd) => Array.isArray(cmd) && cmd.some((a) =>
        typeof a === 'string' && a.includes('node')),
    });
    assert.ok(found, 'expected to find the holder process');
    assert.strictEqual(found.pid, holder.pid);
    assert.strictEqual(found.jsonlPath, path.resolve(file));
    assert.strictEqual(found.match, 'fd', 'fd-based path is preferred when available');
    assert.ok(Array.isArray(found.cmdline));
    assert.ok(typeof found.cwd === 'string' || found.cwd === null);
  } finally {
    killHolder(holder);
  }
});

t('findProcessForJsonl skips selfPid override', async () => {
  const dir = makeTmpDir();
  const file = path.join(dir, 'session-Y.jsonl');
  fs.writeFileSync(file, '');
  let holder;
  try {
    holder = await spawnHolder(file);
    const found = findProcessForJsonl(file, {
      cmdlinePredicate: (cmd) => Array.isArray(cmd) && cmd.some((a) =>
        typeof a === 'string' && a.includes('node')),
      selfPid: holder.pid,
    });
    assert.strictEqual(found, null, 'selfPid skip should hide the holder');
  } finally {
    killHolder(holder);
  }
});

t('findProcessForJsonl returns null when predicate excludes all', async () => {
  const dir = makeTmpDir();
  const file = path.join(dir, 'session-Z.jsonl');
  fs.writeFileSync(file, '');
  let holder;
  try {
    holder = await spawnHolder(file);
    const found = findProcessForJsonl(file, {
      cmdlinePredicate: () => false,
    });
    assert.strictEqual(found, null);
  } finally {
    killHolder(holder);
  }
});

t('decodeProjectFromJsonl decodes project segment', () => {
  assert.strictEqual(
    decodeProjectFromJsonl('/home/shinc/.claude/projects/-home-shinc-arps/abc.jsonl'),
    '/home/shinc/arps');
  assert.strictEqual(
    decodeProjectFromJsonl('/home/shinc/.claude/projects/-home-shinc/x.jsonl'),
    '/home/shinc');
  assert.strictEqual(decodeProjectFromJsonl('/tmp/no-projects-here.jsonl'), null);
  assert.strictEqual(decodeProjectFromJsonl(null), null);
  assert.strictEqual(decodeProjectFromJsonl(''), null);
  // path under projects/ but missing trailing filename — no slash after dir
  assert.strictEqual(
    decodeProjectFromJsonl('/home/shinc/.claude/projects/-home-shinc-arps'),
    null);
});

t('findProcessForJsonl falls back to cwd when fd does not match', async () => {
  // Spawn a holder with cwd = /tmp (single segment, no hyphens) so
  // the lossy `-` <-> `/` encoding used by .claude/projects/ folder
  // names roundtrips cleanly. The fake JSONL path is constructed
  // accordingly. The holder does NOT open the JSONL — we are
  // exercising the cwd-only fallback.
  const cwd = '/tmp';
  const fakeJsonlPath = '/home/anybody/.claude/projects/-tmp/pretend.jsonl';

  let holder;
  try {
    holder = await new Promise((resolve, reject) => {
      const child = spawn(process.execPath, [
        '-e',
        'process.stdout.write("READY:" + process.pid + "\\n"); setInterval(() => {}, 60000);',
      ], { stdio: ['ignore', 'pipe', 'pipe'], cwd });
      let buf = '';
      child.stdout.on('data', (c) => {
        buf += c.toString('utf8');
        const m = buf.match(/READY:(\d+)/);
        if (m) resolve({ child, pid: parseInt(m[1], 10) });
      });
      child.on('error', reject);
      setTimeout(() => reject(new Error('holder did not become ready in time')), 4000);
    });

    const found = findProcessForJsonl(fakeJsonlPath, {
      cmdlinePredicate: (cmd) => Array.isArray(cmd) && cmd.some((a) =>
        typeof a === 'string' && a.includes('node')),
    });
    assert.ok(found, 'cwd fallback should locate holder');
    // Multiple node processes may share cwd=/tmp (other test
    // fixtures, parent harness, etc) so we accept any of them as
    // long as our specific holder is in the candidate set.
    if (found.pid !== holder.pid) {
      assert.ok(
        Array.isArray(found.candidatePids) && found.candidatePids.includes(holder.pid),
        `expected holder ${holder.pid} in candidates, got ${JSON.stringify(found.candidatePids)}`);
    }
    assert.strictEqual(found.match, 'cwd');
    assert.strictEqual(found.cwd, cwd);
  } finally {
    killHolder(holder);
  }
});

t('listClaudeProcesses omits processes with no .claude/projects fd', () => {
  // Default scan with the real claude predicate. On this dev box
  // there may or may not be a real claude process running. Whatever
  // comes back must be a well-shaped array.
  const list = listClaudeProcesses();
  assert.ok(Array.isArray(list));
  for (const entry of list) {
    assert.ok(Number.isInteger(entry.pid));
    assert.ok(Array.isArray(entry.sessionPaths));
    assert.ok(entry.sessionPaths.length >= 1, 'every entry has at least one session fd');
    for (const sp of entry.sessionPaths) {
      assert.ok(sp.includes('/.claude/projects/'));
      assert.ok(sp.endsWith('.jsonl'));
    }
  }
});

(async () => {
  for (const fn of pending) await fn();
  console.log(`\n  ${passed} passed, ${failed} failed (claude-process-discovery)`);
  if (failed > 0) process.exit(1);
})();
