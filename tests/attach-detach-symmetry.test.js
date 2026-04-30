// (TODO 8.38) Tests for the role-aware attach surface and the
// two-step detach confirmation. Mix of behavioural assertions
// (detectAgentRole / AttachStore.add / heal-on-load) and source-grep
// assertions for the SessionsView UI contract.

const { describe, it } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const SESSIONS_VIEW = path.join(ROOT, 'web/src/components/SessionsView.tsx');

const sessionAttach = require('../src/session-attach');
const { detectAgentRole, AttachStore, ROLE_VALUES } = sessionAttach;

function readText(p) {
  return fs.readFileSync(p, 'utf8');
}

function makeTempJsonl(content) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'c4-attach-test-'));
  const file = path.join(dir, 'session.jsonl');
  fs.writeFileSync(file, content, 'utf8');
  return file;
}

describe('detectAgentRole', () => {
  it('returns "generic" for falsy input', () => {
    assert.strictEqual(detectAgentRole(''), 'generic');
    assert.strictEqual(detectAgentRole(null), 'generic');
    assert.strictEqual(detectAgentRole(undefined), 'generic');
  });

  it('detects manager via Korean role prefix in JSONL prelude', () => {
    const file = makeTempJsonl(JSON.stringify({
      type: 'user',
      message: { role: 'user', content: '[역할: Manager] 작업을 분배하라.' },
    }) + '\n');
    assert.strictEqual(detectAgentRole(file), 'manager');
  });

  it('detects manager via English role prefix', () => {
    const file = makeTempJsonl(JSON.stringify({
      type: 'user',
      message: { role: 'user', content: '[Role: Manager] Halt-prevention applies.' },
    }) + '\n');
    assert.strictEqual(detectAgentRole(file), 'manager');
  });

  it('detects manager via auto-spawn signal', () => {
    const file = makeTempJsonl(JSON.stringify({
      type: 'system',
      content: 'Auto-spawned by c4 auto. approval protocol enabled.',
    }) + '\n');
    assert.strictEqual(detectAgentRole(file), 'manager');
  });

  it('detects planner / executor / reviewer prefixes', () => {
    const planner = makeTempJsonl(JSON.stringify({ content: '[역할: Planner] design.' }) + '\n');
    const executor = makeTempJsonl(JSON.stringify({ content: '[Role: Executor] implement.' }) + '\n');
    const reviewer = makeTempJsonl(JSON.stringify({ content: '[Role: Reviewer] review only.' }) + '\n');
    assert.strictEqual(detectAgentRole(planner), 'planner');
    assert.strictEqual(detectAgentRole(executor), 'executor');
    assert.strictEqual(detectAgentRole(reviewer), 'reviewer');
  });

  it('uses the path heuristic for c4-mgr-* and auto-mgr-*', () => {
    // Path-only: file content is empty / unreadable.
    assert.strictEqual(detectAgentRole('/tmp/c4-worktree-c4-mgr-foo/session.jsonl'), 'manager');
    assert.strictEqual(detectAgentRole('/tmp/auto-mgr-2026/session.jsonl'), 'manager');
  });

  it('treats c4 worktree paths without -mgr- as worker', () => {
    const file = makeTempJsonl('{"type":"user","content":"hello"}\n');
    // Move to a "c4-worktree-" path to trigger the heuristic.
    const dir = path.dirname(file);
    const newDir = dir + '-c4-worktree-w-foo';
    fs.renameSync(dir, newDir);
    const moved = path.join(newDir, 'session.jsonl');
    assert.strictEqual(detectAgentRole(moved), 'worker');
  });

  it('falls back to generic for plain user transcripts', () => {
    const file = makeTempJsonl('{"type":"user","content":"plain hello"}\n');
    assert.strictEqual(detectAgentRole(file), 'generic');
  });

  it('returns generic without throwing on missing files', () => {
    assert.strictEqual(detectAgentRole('/no/such/file.jsonl'), 'generic');
  });
});

describe('AttachStore writes role on add and heals on load', () => {
  it('add() records the sniffed role on new attachments', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'c4-attach-store-'));
    const storePath = path.join(tmpDir, 'attached.json');
    const jsonl = makeTempJsonl(JSON.stringify({
      content: '[역할: Manager] orchestrate.',
    }) + '\n');

    const store = new AttachStore({ storePath });
    const created = store.add({
      name: 'attached-mgr',
      jsonlPath: jsonl,
      sessionId: 'abc',
      projectPath: null,
      createdAt: new Date().toISOString(),
      lastOffset: 0,
    });
    assert.strictEqual(created.role, 'manager');

    // Persisted record carries the role too.
    const raw = JSON.parse(fs.readFileSync(storePath, 'utf8'));
    assert.strictEqual(raw.sessions[0].role, 'manager');
  });

  it('load() heals legacy records missing role', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'c4-attach-heal-'));
    const storePath = path.join(tmpDir, 'attached.json');
    const jsonl = makeTempJsonl(JSON.stringify({
      content: '[Role: Reviewer] review only.',
    }) + '\n');

    // Write a legacy record (no role field).
    fs.writeFileSync(storePath, JSON.stringify({
      sessions: [{
        name: 'attached-rev',
        jsonlPath: jsonl,
        sessionId: 'rev1',
        projectPath: null,
        createdAt: '2026-04-01T00:00:00.000Z',
        lastOffset: 0,
      }],
    }, null, 2));

    const store = new AttachStore({ storePath });
    const listed = store.list();
    assert.strictEqual(listed.length, 1);
    assert.strictEqual(listed[0].role, 'reviewer');

    // Heal was persisted back to disk.
    const persisted = JSON.parse(fs.readFileSync(storePath, 'utf8'));
    assert.strictEqual(persisted.sessions[0].role, 'reviewer');
  });

  it('exports ROLE_VALUES with the canonical role enum', () => {
    assert.deepStrictEqual(
      [...ROLE_VALUES].sort(),
      ['executor', 'generic', 'manager', 'planner', 'reviewer', 'worker'],
    );
  });
});

describe('SessionsView surfaces role + two-step detach', () => {
  const src = readText(SESSIONS_VIEW);

  it('declares the AttachedRole union type', () => {
    assert.match(src, /export type AttachedRole =/);
    assert.match(src, /\| 'manager'/);
    assert.match(src, /\| 'worker'/);
    assert.match(src, /\| 'planner'/);
    assert.match(src, /\| 'executor'/);
    assert.match(src, /\| 'reviewer'/);
    assert.match(src, /\| 'generic'/);
  });

  it('AttachedSession exposes optional role', () => {
    assert.match(src, /role\?: AttachedRole/);
  });

  it('attachedRoleStyle maps each role to a token-backed class', () => {
    assert.match(src, /function attachedRoleStyle\(role: AttachedRole \| undefined\): string/);
    assert.match(src, /case 'manager':/);
    assert.match(src, /case 'planner':/);
    assert.match(src, /case 'executor':/);
    assert.match(src, /case 'reviewer':/);
    assert.match(src, /case 'worker':/);
  });

  it('renders a role badge + read-only mirror hint on each attached row', () => {
    assert.match(src, /aria-label=\{`Agent role: \$\{role\}`\}/);
    assert.match(src, /read-only mirror/);
  });

  it('uses a two-step detach with terminal-keeps-running copy', () => {
    assert.match(src, /showDetachConfirm/);
    assert.match(src, /Your terminal session\s+keeps running/);
    assert.match(src, /Detach session/);
    assert.match(src, /Cancel detach/);
  });

  it('detach button toggles the confirmation strip rather than firing onDetach directly', () => {
    assert.match(src, /onClick=\{\(\) => setShowDetachConfirm\(\(v\) => !v\)\}/);
    assert.match(src, /aria-expanded=\{showDetachConfirm\}/);
  });
});
