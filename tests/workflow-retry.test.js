// Workflow retry policy tests. Verifies that node.config.retry triggers
// re-execution on failure, that backoffMs sleeps between attempts, and
// that exhausting retries marks the node as FAILED with the attempt
// count reported on the result.

'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const os = require('os');

const { WorkflowManager, WorkflowExecutor, RUN_STATUS, NODE_STATUS } = require('../src/workflow');

let tmpDir;
beforeEach(() => { tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'c4-wf-retry-')); });
afterEach(() => { try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {} });

function makeMgr() {
  return new WorkflowManager({
    workflowsPath: path.join(tmpDir, 'workflows.json'),
    runsPath: path.join(tmpDir, 'runs.json'),
  });
}

describe('Workflow per-node retry', () => {
  it('re-runs a flaky task until it succeeds', async () => {
    const mgr = makeMgr();
    const wf = mgr.createWorkflow({
      id: 'flaky',
      nodes: [
        { id: 'a', type: 'task', config: { retry: { maxRetries: 5 } } },
        { id: 'end', type: 'end' },
      ],
      edges: [{ from: 'a', to: 'end' }],
    });
    let calls = 0;
    const exec = new WorkflowExecutor({
      manager: mgr,
      dispatcher: async () => {
        calls++;
        if (calls < 3) throw new Error('still flaky');
        return { ok: true };
      },
    });
    const run = await exec.executeWorkflow(wf.id, null);
    assert.strictEqual(run.status, RUN_STATUS.COMPLETED);
    assert.strictEqual(calls, 3);
    assert.strictEqual(run.nodeResults.a.status, NODE_STATUS.COMPLETED);
    assert.strictEqual(run.nodeResults.a.attempts, 3);
  });

  it('marks the node FAILED when retries are exhausted', async () => {
    const mgr = makeMgr();
    const wf = mgr.createWorkflow({
      id: 'doomed',
      nodes: [
        { id: 'a', type: 'task', config: { retry: { maxRetries: 2 } } },
        { id: 'end', type: 'end' },
      ],
      edges: [{ from: 'a', to: 'end' }],
    });
    let calls = 0;
    const exec = new WorkflowExecutor({
      manager: mgr,
      dispatcher: async () => { calls++; throw new Error(`nope ${calls}`); },
    });
    const run = await exec.executeWorkflow(wf.id, null);
    assert.strictEqual(run.status, RUN_STATUS.FAILED);
    assert.strictEqual(calls, 3, '1 initial + 2 retries');
    assert.strictEqual(run.nodeResults.a.status, NODE_STATUS.FAILED);
    assert.strictEqual(run.nodeResults.a.attempts, 3);
    assert.match(run.nodeResults.a.error, /nope 3/);
  });

  it('sleeps backoffMs between attempts', async () => {
    const mgr = makeMgr();
    const wf = mgr.createWorkflow({
      id: 'backoff',
      nodes: [
        { id: 'a', type: 'task', config: { retry: { maxRetries: 2, backoffMs: 30 } } },
        { id: 'end', type: 'end' },
      ],
      edges: [{ from: 'a', to: 'end' }],
    });
    const sleeps = [];
    const exec = new WorkflowExecutor({
      manager: mgr,
      dispatcher: async () => { throw new Error('boom'); },
      waitImpl: async (ms) => { sleeps.push(ms); /* skip real sleep for speed */ },
    });
    await exec.executeWorkflow(wf.id, null);
    // 1 initial + 2 retries = 2 backoff sleeps in between.
    assert.deepStrictEqual(sleeps, [30, 30]);
  });

  it('disabled retry (default) attempts exactly once', async () => {
    const mgr = makeMgr();
    const wf = mgr.createWorkflow({
      id: 'no-retry',
      nodes: [
        { id: 'a', type: 'task' },
        { id: 'end', type: 'end' },
      ],
      edges: [{ from: 'a', to: 'end' }],
    });
    let calls = 0;
    const exec = new WorkflowExecutor({
      manager: mgr,
      dispatcher: async () => { calls++; throw new Error('once'); },
    });
    const run = await exec.executeWorkflow(wf.id, null);
    assert.strictEqual(calls, 1);
    assert.strictEqual(run.nodeResults.a.status, NODE_STATUS.FAILED);
    assert.strictEqual(run.nodeResults.a.attempts, undefined, 'attempts only set when retry configured');
  });
});
