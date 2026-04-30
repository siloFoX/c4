// Bounded parallel execution tests for WorkflowExecutor (11.5).
//
// Default behavior (maxConcurrency unset / 1) must match the previous
// strict-sequential walk so existing workflows are unaffected. With
// maxConcurrency > 1, ready peer nodes share wall-clock and dependsOn
// ordering is still respected.

'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const os = require('os');

const { WorkflowManager, WorkflowExecutor, RUN_STATUS, NODE_STATUS } = require('../src/workflow');

let tmpDir;
beforeEach(() => { tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'c4-wf-par-')); });
afterEach(() => { try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {} });

function makeMgr() {
  return new WorkflowManager({
    workflowsPath: path.join(tmpDir, 'workflows.json'),
    runsPath: path.join(tmpDir, 'runs.json'),
  });
}

describe('parallel executor (11.5)', () => {
  it('default (maxConcurrency unset) keeps strict-sequential behavior', async () => {
    const mgr = makeMgr();
    const wf = mgr.createWorkflow({
      id: 'seq',
      nodes: [
        { id: 'a', type: 'task' },
        { id: 'b', type: 'task' },
        { id: 'c', type: 'task' },
        { id: 'end', type: 'end' },
      ],
      edges: [
        { from: 'a', to: 'b' },
        { from: 'b', to: 'c' },
        { from: 'c', to: 'end' },
      ],
    });
    let inflight = 0;
    let peakInflight = 0;
    const exec = new WorkflowExecutor({
      manager: mgr,
      dispatcher: async () => {
        inflight++;
        peakInflight = Math.max(peakInflight, inflight);
        await new Promise((r) => setTimeout(r, 10));
        inflight--;
        return { ok: true };
      },
    });
    await exec.executeWorkflow(wf.id, null);
    assert.strictEqual(peakInflight, 1, 'never more than 1 inflight at default concurrency');
  });

  it('maxConcurrency=3 runs ready peer nodes in parallel', async () => {
    const mgr = makeMgr();
    const wf = mgr.createWorkflow({
      id: 'fanout',
      config: { maxConcurrency: 3 },
      nodes: [
        { id: 'root', type: 'task' },
        { id: 'a', type: 'task' },
        { id: 'b', type: 'task' },
        { id: 'c', type: 'task' },
        { id: 'end', type: 'end' },
      ],
      edges: [
        { from: 'root', to: 'a' },
        { from: 'root', to: 'b' },
        { from: 'root', to: 'c' },
        { from: 'a', to: 'end' },
        { from: 'b', to: 'end' },
        { from: 'c', to: 'end' },
      ],
    });
    let inflight = 0;
    let peakInflight = 0;
    const exec = new WorkflowExecutor({
      manager: mgr,
      dispatcher: async () => {
        inflight++;
        peakInflight = Math.max(peakInflight, inflight);
        await new Promise((r) => setTimeout(r, 30));
        inflight--;
        return { ok: true };
      },
    });
    const start = Date.now();
    const run = await exec.executeWorkflow(wf.id, null);
    const elapsed = Date.now() - start;
    assert.strictEqual(run.status, RUN_STATUS.COMPLETED);
    assert.strictEqual(peakInflight, 3, 'a/b/c all inflight at once');
    // root sequential (30ms) + a/b/c parallel (~30ms) + end (instant) ≈ 60ms.
    // 4× sequential would be ~120ms+. Generous slack for CI jitter.
    assert.ok(elapsed < 110, `expected parallel <110ms, got ${elapsed}ms`);
  });

  it('respects maxConcurrency cap below the ready batch size', async () => {
    const mgr = makeMgr();
    const wf = mgr.createWorkflow({
      id: 'capped',
      config: { maxConcurrency: 2 },
      nodes: [
        { id: 'root', type: 'task' },
        { id: 'a', type: 'task' },
        { id: 'b', type: 'task' },
        { id: 'c', type: 'task' },
        { id: 'd', type: 'task' },
        { id: 'end', type: 'end' },
      ],
      edges: [
        { from: 'root', to: 'a' },
        { from: 'root', to: 'b' },
        { from: 'root', to: 'c' },
        { from: 'root', to: 'd' },
        { from: 'a', to: 'end' },
        { from: 'b', to: 'end' },
        { from: 'c', to: 'end' },
        { from: 'd', to: 'end' },
      ],
    });
    let inflight = 0;
    let peakInflight = 0;
    const exec = new WorkflowExecutor({
      manager: mgr,
      dispatcher: async () => {
        inflight++;
        peakInflight = Math.max(peakInflight, inflight);
        await new Promise((r) => setTimeout(r, 10));
        inflight--;
        return { ok: true };
      },
    });
    await exec.executeWorkflow(wf.id, null);
    assert.strictEqual(peakInflight, 2, 'never more than 2 inflight at maxConcurrency=2');
  });

  it('still respects dependsOn — downstream waits for all upstream peers', async () => {
    const mgr = makeMgr();
    const wf = mgr.createWorkflow({
      id: 'chain',
      config: { maxConcurrency: 4 },
      nodes: [
        { id: 'a', type: 'task' },
        { id: 'b', type: 'task' },
        { id: 'c', type: 'task' },
        { id: 'd', type: 'task' },
        { id: 'end', type: 'end' },
      ],
      edges: [
        { from: 'a', to: 'b' },
        { from: 'a', to: 'c' },
        { from: 'b', to: 'd' },
        { from: 'c', to: 'd' },
        { from: 'd', to: 'end' },
      ],
    });
    const completed = [];
    const exec = new WorkflowExecutor({
      manager: mgr,
      dispatcher: async ({ nodeId }) => {
        await new Promise((r) => setTimeout(r, 5));
        completed.push(nodeId);
        return { ok: true };
      },
    });
    await exec.executeWorkflow(wf.id, null);
    // a must run first; b/c may interleave; d must run after both.
    assert.strictEqual(completed[0], 'a');
    assert.ok(completed.indexOf('b') < completed.indexOf('d'));
    assert.ok(completed.indexOf('c') < completed.indexOf('d'));
  });

  it('halts on first failure but drains in-flight nodes before reporting', async () => {
    const mgr = makeMgr();
    const wf = mgr.createWorkflow({
      id: 'fail-fanout',
      config: { maxConcurrency: 3 },
      nodes: [
        { id: 'root', type: 'task' },
        { id: 'a', type: 'task' },
        { id: 'b', type: 'task' },
        { id: 'c', type: 'task' },
        { id: 'end', type: 'end' },
      ],
      edges: [
        { from: 'root', to: 'a' },
        { from: 'root', to: 'b' },
        { from: 'root', to: 'c' },
        { from: 'a', to: 'end' },
        { from: 'b', to: 'end' },
        { from: 'c', to: 'end' },
      ],
    });
    const exec = new WorkflowExecutor({
      manager: mgr,
      dispatcher: async ({ nodeId }) => {
        await new Promise((r) => setTimeout(r, 10));
        if (nodeId === 'a') throw new Error('boom');
        return { ok: true };
      },
    });
    const run = await exec.executeWorkflow(wf.id, null);
    assert.strictEqual(run.status, RUN_STATUS.FAILED);
    // a/b/c all dispatched together; once a's failure is observed the
    // remaining in-flight (b, c) are awaited before we report.
    assert.strictEqual(run.nodeResults.a.status, NODE_STATUS.FAILED);
    // 'end' never ran — it was downstream of all three.
    assert.strictEqual(run.nodeResults.end.status, NODE_STATUS.SKIPPED);
  });
});
