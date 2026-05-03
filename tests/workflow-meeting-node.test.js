// 'meeting' workflow node tests (multi-specialist phase 6.4).

'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const os = require('os');

const { WorkflowManager, WorkflowExecutor, RUN_STATUS } = require('../src/workflow');
const { resetShared: resetMeetingStore } = require('../src/meeting-session');

let tmpDir;
beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'c4-wf-meeting-'));
  resetMeetingStore();
});
afterEach(() => { try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {} });

function makeMgr() {
  return new WorkflowManager({
    workflowsPath: path.join(tmpDir, 'workflows.json'),
    runsPath: path.join(tmpDir, 'runs.json'),
  });
}

describe('meeting node', () => {
  it('runs a lightweight meeting with mock brain and returns consensus decision', async () => {
    const mgr = makeMgr();
    const wf = mgr.createWorkflow({
      id: 'wf-meeting-basic',
      nodes: [
        { id: 'm', type: 'meeting', config: { task: 'review the rollout plan', track: 'lightweight', brain: 'mock' } },
        { id: 'end', type: 'end' },
      ],
      edges: [{ from: 'm', to: 'end' }],
    });
    const exec = new WorkflowExecutor({ manager: mgr });
    const run = await exec.executeWorkflow(wf.id, null);
    assert.strictEqual(run.status, RUN_STATUS.COMPLETED);
    const out = run.nodeResults.m.output;
    assert.strictEqual(out.ok, true);
    assert.strictEqual(typeof out.meetingId, 'string');
    assert.strictEqual(typeof out.accepted, 'boolean');
    assert.ok(['completed', 'escalated', 'aborted'].includes(out.sessionStatus));
  });

  it('falls back to JSON-stringified prev when config.task missing', async () => {
    const mgr = makeMgr();
    const wf = mgr.createWorkflow({
      id: 'wf-meeting-prev',
      nodes: [
        { id: 'producer', type: 'task' },
        { id: 'm', type: 'meeting', config: { track: 'lightweight', brain: 'mock' } },
        { id: 'end', type: 'end' },
      ],
      edges: [
        { from: 'producer', to: 'm' },
        { from: 'm', to: 'end' },
      ],
    });
    const exec = new WorkflowExecutor({
      manager: mgr,
      dispatcher: async () => ({ task: 'derived from previous step', tier: 'review' }),
    });
    const run = await exec.executeWorkflow(wf.id, null);
    assert.strictEqual(run.status, RUN_STATUS.COMPLETED);
    const out = run.nodeResults.m.output;
    assert.strictEqual(out.ok, true);
    assert.strictEqual(typeof out.meetingId, 'string');
  });

  it('skips when neither config.task nor prev provides text', async () => {
    const mgr = makeMgr();
    const wf = mgr.createWorkflow({
      id: 'wf-meeting-empty',
      nodes: [
        { id: 'm', type: 'meeting', config: {} },
        { id: 'end', type: 'end' },
      ],
      edges: [{ from: 'm', to: 'end' }],
    });
    const exec = new WorkflowExecutor({ manager: mgr });
    const run = await exec.executeWorkflow(wf.id, null);
    assert.strictEqual(run.status, RUN_STATUS.COMPLETED);
    const out = run.nodeResults.m.output;
    assert.strictEqual(out.skipped, true);
  });

  it('claude brain attempt fails fast in test env (no claude binary)', async () => {
    // We can't directly inject a bogus brain string (validation
    // blocks 'gemini-bogus' at createWorkflow time), so this test
    // covers the next-most-defensive behavior: 'claude' is allowed
    // but in CI/test there's no claude CLI to spawn → orchestrator
    // surfaces the failure.
    const mgr = makeMgr();
    const wf = mgr.createWorkflow({
      id: 'wf-meeting-claude',
      nodes: [
        { id: 'm', type: 'meeting', config: { task: 'whatever', brain: 'claude' } },
        { id: 'end', type: 'end' },
      ],
      edges: [{ from: 'm', to: 'end' }],
    });
    const exec = new WorkflowExecutor({ manager: mgr });
    const run = await exec.executeWorkflow(wf.id, null);
    const out = run.nodeResults.m.output;
    // Either it returned ok:false/error (claude binary error) or it
    // returned ok:true with sessionStatus aborted/escalated. Both
    // are acceptable failure modes — the assertion is "didn't claim
    // accepted=true with no real claude behind it".
    if (out.ok === false) {
      assert.ok(typeof out.error === 'string' && out.error.length > 0);
    } else {
      assert.notStrictEqual(out.sessionStatus, 'completed');
    }
  });

  it('validation rejects bad track / brain at createWorkflow time', () => {
    const mgr = makeMgr();
    assert.throws(
      () => mgr.createWorkflow({
        id: 'wf-bad-track',
        nodes: [
          { id: 'm', type: 'meeting', config: { task: 'x', track: 'bogus' } },
          { id: 'end', type: 'end' },
        ],
        edges: [{ from: 'm', to: 'end' }],
      }),
      /track must be lightweight\|standard\|full/
    );
    assert.throws(
      () => mgr.createWorkflow({
        id: 'wf-bad-brain',
        nodes: [
          { id: 'm', type: 'meeting', config: { task: 'x', brain: 'bogus' } },
          { id: 'end', type: 'end' },
        ],
        edges: [{ from: 'm', to: 'end' }],
      }),
      /brain must be mock\|claude/
    );
  });
});
