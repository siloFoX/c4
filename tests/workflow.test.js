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
});
