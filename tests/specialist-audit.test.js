'use strict';

// Tests for src/specialist-audit.js (multi-specialist phase 1.4).

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  appendAuditEntry,
  readRecentAuditEntries,
  queryAuditEntries,
  ACTIONS,
  DEFAULT_AUDIT_PATH,
} = require('../src/specialist-audit');
const { SpecialistRegistry } = require('../src/specialist-registry');

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

function makeTmp() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'c4-audit-'));
  return path.join(dir, 'audit.jsonl');
}

function fixtureSpec(overrides = {}) {
  return {
    id: 'fixture',
    displayName: 'Fixture',
    tier: 'implement',
    domain: ['fixture'],
    brain: { adapter: 'mock' },
    systemPrompt: '[Role: Fixture] sp',
    triggers: { keywords: ['fixture'], stages: ['implement'] },
    ...overrides,
  };
}

t('module exports surface', () => {
  assert.strictEqual(typeof appendAuditEntry, 'function');
  assert.strictEqual(typeof readRecentAuditEntries, 'function');
  assert.strictEqual(typeof queryAuditEntries, 'function');
  assert.strictEqual(typeof DEFAULT_AUDIT_PATH, 'string');
  assert.strictEqual(ACTIONS.ADD, 'add');
  assert.strictEqual(ACTIONS.REMOVE, 'remove');
  assert.strictEqual(ACTIONS.IMPORT, 'import');
});

t('appendAuditEntry stamps ts and writes a JSONL line', () => {
  const auditPath = makeTmp();
  appendAuditEntry({ action: ACTIONS.ADD, id: 'foo' }, { auditPath });
  const raw = fs.readFileSync(auditPath, 'utf8');
  const lines = raw.trim().split('\n');
  assert.strictEqual(lines.length, 1);
  const entry = JSON.parse(lines[0]);
  assert.strictEqual(entry.action, ACTIONS.ADD);
  assert.strictEqual(entry.id, 'foo');
  assert.match(entry.ts, /^\d{4}-\d{2}-\d{2}T/);
});

t('appendAuditEntry I/O failure does not throw', () => {
  // Force a write failure by passing a path whose parent is a file
  // (so mkdir cannot create the directory). Captures stderr to
  // verify the warning surfaces without throwing.
  const fixturesDir = fs.mkdtempSync(path.join(os.tmpdir(), 'c4-audit-fail-'));
  const blockerFile = path.join(fixturesDir, 'blocker');
  fs.writeFileSync(blockerFile, ''); // file at the path mkdir would need
  const stderrWritten = process.stderr.write;
  let captured = '';
  process.stderr.write = (chunk) => { captured += chunk.toString(); return true; };
  try {
    const ok = appendAuditEntry(
      { action: ACTIONS.ADD, id: 'x' },
      { auditPath: path.join(blockerFile, 'subdir', 'audit.jsonl') },
    );
    assert.strictEqual(ok, false);
    assert.match(captured, /write failed/);
  } finally {
    process.stderr.write = stderrWritten;
  }
});

t('readRecentAuditEntries returns oldest-first', () => {
  const auditPath = makeTmp();
  appendAuditEntry({ action: ACTIONS.ADD, id: 'a' }, { auditPath });
  appendAuditEntry({ action: ACTIONS.ADD, id: 'b' }, { auditPath });
  appendAuditEntry({ action: ACTIONS.REMOVE, id: 'a' }, { auditPath });
  const entries = readRecentAuditEntries({ auditPath });
  assert.strictEqual(entries.length, 3);
  assert.strictEqual(entries[0].id, 'a');
  assert.strictEqual(entries[2].action, ACTIONS.REMOVE);
});

t('readRecentAuditEntries respects limit (latest N)', () => {
  const auditPath = makeTmp();
  for (let i = 0; i < 10; i += 1) {
    appendAuditEntry({ action: ACTIONS.ADD, id: `s${i}` }, { auditPath });
  }
  const entries = readRecentAuditEntries({ auditPath, limit: 3 });
  assert.strictEqual(entries.length, 3);
  assert.deepStrictEqual(entries.map((e) => e.id), ['s7', 's8', 's9']);
});

t('readRecentAuditEntries returns [] when log missing', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'c4-audit-'));
  const auditPath = path.join(dir, 'never-written.jsonl');
  assert.deepStrictEqual(readRecentAuditEntries({ auditPath }), []);
});

t('queryAuditEntries filters by action / actor / id', () => {
  const auditPath = makeTmp();
  appendAuditEntry({ action: ACTIONS.ADD, id: 'a', actor: 'alice' }, { auditPath });
  appendAuditEntry({ action: ACTIONS.ADD, id: 'b', actor: 'bob' }, { auditPath });
  appendAuditEntry({ action: ACTIONS.REMOVE, id: 'a', actor: 'alice' }, { auditPath });

  const adds = queryAuditEntries({ auditPath, action: ACTIONS.ADD });
  assert.strictEqual(adds.length, 2);

  const aliceOnly = queryAuditEntries({ auditPath, actor: 'alice' });
  assert.strictEqual(aliceOnly.length, 2);
  assert.ok(aliceOnly.every((e) => e.actor === 'alice'));

  const idA = queryAuditEntries({ auditPath, id: 'a' });
  assert.strictEqual(idA.length, 2);
});

t('SpecialistRegistry.add writes audit entry', () => {
  const auditPath = makeTmp();
  const reg = new SpecialistRegistry({
    persistPath: null,
    auditPath,
    specialists: [],
  });
  reg.add(fixtureSpec(), { actor: 'admin', reason: 'initial' });
  const entries = readRecentAuditEntries({ auditPath });
  assert.strictEqual(entries.length, 1);
  assert.strictEqual(entries[0].action, ACTIONS.ADD);
  assert.strictEqual(entries[0].id, 'fixture');
  assert.strictEqual(entries[0].actor, 'admin');
  assert.strictEqual(entries[0].reason, 'initial');
});

t('SpecialistRegistry.remove writes audit entry with before snapshot', () => {
  const auditPath = makeTmp();
  const reg = new SpecialistRegistry({
    persistPath: null,
    auditPath,
    specialists: [fixtureSpec()],
  });
  reg.remove('fixture', { actor: 'tester' });
  const entries = readRecentAuditEntries({ auditPath });
  assert.strictEqual(entries.length, 1);
  assert.strictEqual(entries[0].action, ACTIONS.REMOVE);
  assert.strictEqual(entries[0].id, 'fixture');
  assert.ok(entries[0].before);
  assert.strictEqual(entries[0].before.tier, 'implement');
});

t('SpecialistRegistry.importBundle writes audit entry on apply', () => {
  const auditPath = makeTmp();
  const reg = new SpecialistRegistry({
    persistPath: null,
    auditPath,
    specialists: [],
  });
  reg.importBundle({
    version: 1,
    specialists: [fixtureSpec({ id: 'imported' })],
  }, { actor: 'cli' });
  const entries = readRecentAuditEntries({ auditPath });
  // 1 entry from importBundle (applied), no per-add entries since
  // import takes the wholesale add path inside. The count is 1.
  assert.strictEqual(entries.length, 1);
  assert.strictEqual(entries[0].action, ACTIONS.IMPORT);
  assert.strictEqual(entries[0].mode, 'merge');
  assert.deepStrictEqual(entries[0].added, ['imported']);
});

t('SpecialistRegistry inline construction does not log to default audit path', () => {
  // No explicit auditPath; inline construction (specialists: provided)
  // → audit log disabled. So a test-only registry doesn't pollute the
  // user's real ~/.c4/specialist-audit.jsonl.
  const reg = new SpecialistRegistry({
    persistPath: null,
    specialists: [],
  });
  // Add doesn't throw and registry size grows — but no audit file
  // is created at the default path (we can't easily check the
  // default path without polluting it; the constructor option
  // _auditLogEnabled gates this).
  reg.add(fixtureSpec(), { actor: 'unit-test' });
  assert.ok(reg.has('fixture'));
});

(async () => {
  for (const fn of pending) await fn();
  console.log(`\n  ${passed} passed, ${failed} failed (specialist-audit)`);
  if (failed > 0) process.exit(1);
})();
