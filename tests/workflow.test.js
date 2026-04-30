// 11.3 workflow engine tests.

'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const os = require('os');

const Workflow = require('../src/workflow');

let tmpDir;

function makeMgr() {
  return {
    logsDir: tmpDir,
    config: {},
    sendTaskCalls: [],
    sendTask: async function (name, task, opts) { this.sendTaskCalls.push({ name, task, opts }); return { sent: true }; },
    create: () => ({}),
    dispatch: async (args) => ({ success: true, peer: 'local', name: args.name || 'auto' }),
    audit: () => {},
  };
}

describe('WorkflowEngine (11.3)', () => {
  beforeEach(() => { tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'c4-wf-')); });
  afterEach(() => { try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {} });

  it('runs steps in dependency order', async () => {
    const mgr = makeMgr();
    const wf = new Workflow(mgr);
    const r = await wf.run({
      name: 'simple',
      steps: [
        { id: 'b', action: 'task', dependsOn: ['a'], args: { name: 'b', task: 'second' } },
        { id: 'a', action: 'task', args: { name: 'a', task: 'first' } },
      ],
    });
    assert.deepStrictEqual(r.order, ['a', 'b']);
    assert.strictEqual(r.ok, true);
  });

  it('aborts downstream steps when a required step fails', async () => {
    const mgr = makeMgr();
    const wf = new Workflow(mgr);
    wf.register('boom', async () => ({ error: 'kaboom' }));
    const r = await wf.run({
      name: 'fail-fast',
      steps: [
        { id: 'a', action: 'boom' },
        { id: 'b', action: 'task', dependsOn: ['a'], args: { name: 'b', task: 't' } },
      ],
    });
    assert.strictEqual(r.results.a.error, 'kaboom');
    assert.ok(r.results.b.error);
  });

  it('on_failure: continue lets siblings run after a failure', async () => {
    const mgr = makeMgr();
    const wf = new Workflow(mgr);
    wf.register('boom', async () => ({ error: 'oops' }));
    const r = await wf.run({
      name: 'continue-after-fail',
      steps: [
        { id: 'a', action: 'boom', on_failure: 'continue' },
        { id: 'b', action: 'task', args: { name: 'b', task: 't' } },
      ],
    });
    assert.strictEqual(r.results.a.error, 'oops');
    assert.strictEqual(r.results.b.sent, true);
  });

  it('rejects shell commands not on the whitelist', async () => {
    const mgr = makeMgr();
    mgr.config.workflow = { shellWhitelist: ['echo'] };
    const wf = new Workflow(mgr);
    const r = await wf.run({
      name: 'shell',
      steps: [
        { id: 'bad',  action: 'shell', args: { cmd: 'rm -rf /' } },
        { id: 'good', action: 'shell', args: { cmd: 'echo hi' } },
      ],
    });
    assert.match(r.results.bad.error, /not in workflow.shellWhitelist/);
    assert.strictEqual(r.results.good.exitCode, 0);
  });

  it('returns error on missing steps array', async () => {
    const wf = new Workflow(makeMgr());
    const r = await wf.run({ name: 'x' });
    assert.ok(r.error);
  });

  it('persists run record to logs/workflow-runs.jsonl', async () => {
    const mgr = makeMgr();
    const wf = new Workflow(mgr);
    await wf.run({ name: 'log-me', steps: [{ id: 'a', action: 'sleep', args: { ms: 1 } }] });
    const file = path.join(tmpDir, 'workflow-runs.jsonl');
    assert.ok(fs.existsSync(file));
    const log = fs.readFileSync(file, 'utf8');
    assert.match(log, /"name":"log-me"/);
  });

  // (TODO #102) Slack notify on failure — verify the [WORKFLOW FAIL]
  // prefix is emitted so notifications.js Block Kit formatter colors it.
  it('pushes a [WORKFLOW FAIL] Slack message when overall ok=false', async () => {
    const mgr = makeMgr();
    // Force step failure by giving a task that the mock sendTask rejects.
    mgr.sendTask = async () => ({ error: 'boom from mock' });
    const pushed = [];
    mgr._notifications = {
      pushAll: (msg) => pushed.push(msg),
    };
    const wf = new Workflow(mgr);
    const r = await wf.run({
      name: 'failing',
      steps: [{ id: 'a', action: 'task', args: { name: 'a', task: 't' } }],
    });
    assert.strictEqual(r.ok, false);
    assert.strictEqual(pushed.length, 1);
    assert.match(pushed[0], /^\[WORKFLOW FAIL\] failing/);
    assert.match(pushed[0], /a: boom from mock/);
  });

  // (TODO #108) on_failure='retry' semantics.
  it("on_failure: 'retry' re-runs a flaky step until it succeeds", async () => {
    const mgr = makeMgr();
    let calls = 0;
    const wf = new Workflow(mgr);
    wf.register('flaky', async () => {
      calls++;
      if (calls < 3) return { error: `still flaky (call ${calls})` };
      return { ok: true };
    });
    const r = await wf.run({
      name: 'flaky-flow',
      steps: [{ id: 'a', action: 'flaky', on_failure: 'retry', maxRetries: 5 }],
    });
    assert.strictEqual(r.ok, true);
    assert.strictEqual(calls, 3);
    assert.strictEqual(r.results.a.retries, 2);
  });

  it("on_failure: 'retry' aborts when retries exhausted", async () => {
    const mgr = makeMgr();
    const wf = new Workflow(mgr);
    let calls = 0;
    wf.register('always-fails', async () => { calls++; return { error: `nope (call ${calls})` }; });
    const r = await wf.run({
      name: 'doomed',
      steps: [{ id: 'a', action: 'always-fails', on_failure: 'retry', maxRetries: 2 }],
    });
    assert.strictEqual(r.ok, false);
    assert.strictEqual(calls, 3, 'initial + 2 retries');
    assert.match(r.results.a.error, /nope/);
  });

  it("on_failure: 'retry' with backoffMs sleeps between attempts", async () => {
    const mgr = makeMgr();
    const wf = new Workflow(mgr);
    wf.register('tries', async () => ({ error: 'no' }));
    const start = Date.now();
    await wf.run({
      name: 'backoff',
      steps: [{ id: 'a', action: 'tries', on_failure: 'retry', maxRetries: 2, backoffMs: 30 }],
    });
    const elapsed = Date.now() - start;
    assert.ok(elapsed >= 50, `expected ≥50ms (2 backoffs * 30ms), got ${elapsed}`);
  });

  it('does not push when workflow succeeds', async () => {
    const mgr = makeMgr();
    const pushed = [];
    mgr._notifications = { pushAll: (m) => pushed.push(m) };
    const wf = new Workflow(mgr);
    const r = await wf.run({ name: 'happy', steps: [{ id: 'a', action: 'sleep', args: { ms: 1 } }] });
    assert.strictEqual(r.ok, true);
    assert.strictEqual(pushed.length, 0);
  });
});
