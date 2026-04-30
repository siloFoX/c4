// 'audit' workflow node tests.
//
// Verifies that an AuditLogger injected into WorkflowExecutor records
// hash-chain events when the executor walks past an audit node, that
// the previous node's output is forwarded under details.prevOutput,
// and that the node is a graceful no-op when no logger is provided.

'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const os = require('os');

const { WorkflowManager, WorkflowExecutor, RUN_STATUS, NODE_STATUS } = require('../src/workflow');
const { AuditLogger } = require('../src/audit-log');

let tmpDir;
beforeEach(() => { tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'c4-wf-audit-')); });
afterEach(() => { try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {} });

function makeMgr() {
  return new WorkflowManager({
    workflowsPath: path.join(tmpDir, 'workflows.json'),
    runsPath: path.join(tmpDir, 'runs.json'),
  });
}

describe('audit node', () => {
  it('writes a hash-chain event when an AuditLogger is injected', async () => {
    const mgr = makeMgr();
    const wf = mgr.createWorkflow({
      id: 'w-audit',
      nodes: [
        { id: 'work', type: 'task' },
        { id: 'log',  type: 'audit', config: { eventType: 'task.completed', target: 'w1' } },
        { id: 'end',  type: 'end' },
      ],
      edges: [
        { from: 'work', to: 'log' },
        { from: 'log', to: 'end' },
      ],
    });
    const auditLogger = new AuditLogger({ logPath: path.join(tmpDir, 'audit.jsonl') });
    const exec = new WorkflowExecutor({
      manager: mgr,
      auditLogger,
      dispatcher: async () => ({ ok: true, count: 7 }),
    });
    const run = await exec.executeWorkflow(wf.id, null);
    assert.strictEqual(run.status, RUN_STATUS.COMPLETED);
    assert.strictEqual(run.nodeResults.log.status, NODE_STATUS.COMPLETED);
    assert.strictEqual(run.nodeResults.log.output.recorded, true);
    assert.strictEqual(run.nodeResults.log.output.eventType, 'task.completed');
    assert.ok(run.nodeResults.log.output.hash);

    const events = auditLogger.query();
    assert.strictEqual(events.length, 1);
    assert.strictEqual(events[0].type, 'task.completed');
    assert.strictEqual(events[0].target, 'w1');
    // Previous node's output forwarded under details.prevOutput.
    assert.deepStrictEqual(events[0].details.prevOutput, { ok: true, count: 7 });
    assert.strictEqual(events[0].details.nodeId, 'log');
  });

  it('falls back to "workflow.audit" when eventType is unset', async () => {
    const mgr = makeMgr();
    const wf = mgr.createWorkflow({
      id: 'default-evt',
      nodes: [
        { id: 'log', type: 'audit' },
        { id: 'end', type: 'end' },
      ],
      edges: [{ from: 'log', to: 'end' }],
    });
    const auditLogger = new AuditLogger({ logPath: path.join(tmpDir, 'audit.jsonl') });
    const exec = new WorkflowExecutor({ manager: mgr, auditLogger });
    await exec.executeWorkflow(wf.id, null);
    const events = auditLogger.query();
    assert.strictEqual(events[0].type, 'workflow.audit');
  });

  it('is a no-op when no AuditLogger is injected', async () => {
    const mgr = makeMgr();
    const wf = mgr.createWorkflow({
      id: 'no-logger',
      nodes: [
        { id: 'log', type: 'audit', config: { eventType: 'task.sent' } },
        { id: 'end', type: 'end' },
      ],
      edges: [{ from: 'log', to: 'end' }],
    });
    const exec = new WorkflowExecutor({ manager: mgr });
    const run = await exec.executeWorkflow(wf.id, null);
    assert.strictEqual(run.status, RUN_STATUS.COMPLETED);
    assert.strictEqual(run.nodeResults.log.status, NODE_STATUS.COMPLETED);
    assert.strictEqual(run.nodeResults.log.output.skipped, true);
    assert.match(run.nodeResults.log.output.reason, /no auditLogger/);
  });

  it('captures AuditLogger throw without failing the run', async () => {
    const mgr = makeMgr();
    const wf = mgr.createWorkflow({
      id: 'logger-throws',
      nodes: [
        { id: 'log', type: 'audit', config: { eventType: 'task.completed' } },
        { id: 'end', type: 'end' },
      ],
      edges: [{ from: 'log', to: 'end' }],
    });
    const auditLogger = {
      record: () => { throw new Error('disk full'); },
    };
    const exec = new WorkflowExecutor({ manager: mgr, auditLogger });
    const run = await exec.executeWorkflow(wf.id, null);
    assert.strictEqual(run.status, RUN_STATUS.COMPLETED);
    assert.strictEqual(run.nodeResults.log.status, NODE_STATUS.COMPLETED);
    assert.strictEqual(run.nodeResults.log.output.recorded, false);
    assert.match(run.nodeResults.log.output.error, /disk full/);
  });

  it('validateGraph accepts the new audit type', () => {
    const mgr = makeMgr();
    // No throw → audit is on the NODE_TYPES whitelist.
    mgr.createWorkflow({
      id: 'shape',
      nodes: [
        { id: 'a', type: 'audit' },
        { id: 'end', type: 'end' },
      ],
      edges: [{ from: 'a', to: 'end' }],
    });
  });
});
