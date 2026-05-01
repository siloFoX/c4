// 'notify' workflow node tests.

'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const os = require('os');

const { WorkflowManager, WorkflowExecutor, RUN_STATUS, NODE_STATUS } = require('../src/workflow');

let tmpDir;
beforeEach(() => { tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'c4-wf-notify-')); });
afterEach(() => { try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {} });

function makeMgr() {
  return new WorkflowManager({
    workflowsPath: path.join(tmpDir, 'workflows.json'),
    runsPath: path.join(tmpDir, 'runs.json'),
  });
}

function fakeNotifications() {
  const pushed = [];
  return {
    pushed,
    pushAll: (msg) => pushed.push(msg),
  };
}

describe('notify node', () => {
  it('pushAll-s the literal message when config.message is set', async () => {
    const mgr = makeMgr();
    const wf = mgr.createWorkflow({
      id: 'msg',
      nodes: [
        { id: 'n', type: 'notify', config: { message: 'pipeline done' } },
        { id: 'end', type: 'end' },
      ],
      edges: [{ from: 'n', to: 'end' }],
    });
    const notif = fakeNotifications();
    const exec = new WorkflowExecutor({ manager: mgr, notifications: notif });
    const run = await exec.executeWorkflow(wf.id, null);
    assert.strictEqual(run.status, RUN_STATUS.COMPLETED);
    assert.strictEqual(run.nodeResults.n.output.sent, true);
    assert.strictEqual(notif.pushed.length, 1);
    assert.strictEqual(notif.pushed[0], 'pipeline done');
  });

  it('interpolates ${runId} / ${nodeId} / ${prev} in template', async () => {
    const mgr = makeMgr();
    const wf = mgr.createWorkflow({
      id: 'tmpl',
      nodes: [
        { id: 'work', type: 'task' },
        { id: 'n', type: 'notify', config: { template: 'run=${runId} prev=${prev} nodeId=${nodeId}' } },
        { id: 'end', type: 'end' },
      ],
      edges: [
        { from: 'work', to: 'n' },
        { from: 'n', to: 'end' },
      ],
    });
    const notif = fakeNotifications();
    const exec = new WorkflowExecutor({
      manager: mgr,
      notifications: notif,
      dispatcher: async () => ({ ok: true }),
    });
    const run = await exec.executeWorkflow(wf.id, null);
    assert.strictEqual(run.status, RUN_STATUS.COMPLETED);
    assert.strictEqual(notif.pushed.length, 1);
    assert.match(notif.pushed[0], /run=run_[a-f0-9]+/);
    assert.match(notif.pushed[0], /prev=\{"ok":true\}/);
    assert.match(notif.pushed[0], /nodeId=n/);
  });

  it('prefixes message when config.prefix is set', async () => {
    const mgr = makeMgr();
    const wf = mgr.createWorkflow({
      id: 'pfx',
      nodes: [
        { id: 'n', type: 'notify', config: { message: 'critical', prefix: '[WORKFLOW FAIL]' } },
        { id: 'end', type: 'end' },
      ],
      edges: [{ from: 'n', to: 'end' }],
    });
    const notif = fakeNotifications();
    const exec = new WorkflowExecutor({ manager: mgr, notifications: notif });
    await exec.executeWorkflow(wf.id, null);
    assert.strictEqual(notif.pushed[0], '[WORKFLOW FAIL] critical');
  });

  it('skips when no notifications instance is injected', async () => {
    const mgr = makeMgr();
    const wf = mgr.createWorkflow({
      id: 'no-notif',
      nodes: [
        { id: 'n', type: 'notify', config: { message: 'hi' } },
        { id: 'end', type: 'end' },
      ],
      edges: [{ from: 'n', to: 'end' }],
    });
    const exec = new WorkflowExecutor({ manager: mgr });
    const run = await exec.executeWorkflow(wf.id, null);
    assert.strictEqual(run.status, RUN_STATUS.COMPLETED);
    assert.strictEqual(run.nodeResults.n.output.skipped, true);
    assert.match(run.nodeResults.n.output.reason, /no notifications/);
  });

  it('skips when neither message nor template is set', async () => {
    const mgr = makeMgr();
    const wf = mgr.createWorkflow({
      id: 'no-body',
      nodes: [
        { id: 'n', type: 'notify' },
        { id: 'end', type: 'end' },
      ],
      edges: [{ from: 'n', to: 'end' }],
    });
    const notif = fakeNotifications();
    const exec = new WorkflowExecutor({ manager: mgr, notifications: notif });
    const run = await exec.executeWorkflow(wf.id, null);
    assert.strictEqual(run.nodeResults.n.output.skipped, true);
    assert.match(run.nodeResults.n.output.reason, /message or config\.template required/);
    assert.strictEqual(notif.pushed.length, 0);
  });

  it('captures pushAll throw without failing the run', async () => {
    const mgr = makeMgr();
    const wf = mgr.createWorkflow({
      id: 'throws',
      nodes: [
        { id: 'n', type: 'notify', config: { message: 'hi' } },
        { id: 'end', type: 'end' },
      ],
      edges: [{ from: 'n', to: 'end' }],
    });
    const notif = { pushAll: () => { throw new Error('slack down'); } };
    const exec = new WorkflowExecutor({ manager: mgr, notifications: notif });
    const run = await exec.executeWorkflow(wf.id, null);
    assert.strictEqual(run.status, RUN_STATUS.COMPLETED);
    assert.strictEqual(run.nodeResults.n.output.sent, false);
    assert.match(run.nodeResults.n.output.error, /slack down/);
  });

  it('validateGraph accepts the new notify type', () => {
    const mgr = makeMgr();
    mgr.createWorkflow({
      id: 'shape',
      nodes: [
        { id: 'a', type: 'notify' },
        { id: 'end', type: 'end' },
      ],
      edges: [{ from: 'a', to: 'end' }],
    });
  });
});
