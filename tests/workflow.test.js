// (11.3) Workflow engine tests.
//
// Exercises src/workflow.js against an isolated tmpdir so the suite
// never writes to the operator's real ~/.c4/workflows.json or
// workflow-runs.json.
//
// Coverage targets:
//  - WorkflowManager CRUD (create, update, delete, list, get,
//    enable/disable, duplicate-id rejection)
//  - validateGraph: detects cycles, missing nodes, duplicate edges,
//    orphan nodes, missing terminal, invalid node types, self edges
//  - WorkflowExecutor:
//    * linear chain (task -> task -> end)
//    * conditional branch (true and false paths follow distinct nodes)
//    * parallel fan-out + join (downstream join executes once)
//    * disabled workflow rejected with a typed error
//  - Sandboxed condition: blocks `eval`, `process`, `require`; allows
//    Math/JSON/Date arithmetic on `output` / `input`
//  - Storage roundtrip (workflows + runs survive a reload)
//  - Run history retention (oldest entries dropped past retention)

'use strict';
require('./jest-shim');

const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  WorkflowManager,
  WorkflowExecutor,
  WorkflowStore,
  NODE_TYPES,
  RUN_STATUS,
  NODE_STATUS,
  RUN_RETENTION,
  defaultWorkflowsPath,
  defaultRunsPath,
  validateGraph,
  topoSort,
  evalCondition,
  ensureWorkflowsShape,
  normalizeWorkflow,
  isId,
  genWorkflowId,
} = require('../src/workflow');

function mkTmpStore() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'c4-workflow-test-'));
  return {
    workflowsPath: path.join(dir, 'workflows.json'),
    runsPath: path.join(dir, 'workflow-runs.json'),
  };
}

function newMgr(extra) {
  return new WorkflowManager({ ...mkTmpStore(), ...(extra || {}) });
}

function linearWf(idPrefix = 'wf1') {
  return {
    id: idPrefix,
    name: 'Linear ' + idPrefix,
    description: 'task -> task -> end',
    nodes: [
      { id: 'a', type: 'task', name: 'A', config: { workerName: 'worker-a' } },
      { id: 'b', type: 'task', name: 'B', config: { workerName: 'worker-b' } },
      { id: 'end1', type: 'end', name: 'End', config: {} },
    ],
    edges: [
      { from: 'a', to: 'b' },
      { from: 'b', to: 'end1' },
    ],
  };
}

function conditionalWf(idPrefix = 'wf-cond') {
  return {
    id: idPrefix,
    name: 'Conditional',
    description: 'cond -> [true]task1 -> end ; cond -> [false]task2 -> end',
    nodes: [
      { id: 'start', type: 'task', name: 'Start', config: {} },
      { id: 'cond', type: 'condition', name: 'Branch', config: { expression: 'output.flag === true' } },
      { id: 't', type: 'task', name: 'TruePath', config: {} },
      { id: 'f', type: 'task', name: 'FalsePath', config: {} },
      { id: 'end1', type: 'end', name: 'End', config: {} },
    ],
    edges: [
      { from: 'start', to: 'cond' },
      { from: 'cond', to: 't', condition: 'output.value === true' },
      { from: 'cond', to: 'f', condition: 'output.value === false' },
      { from: 't', to: 'end1' },
      { from: 'f', to: 'end1' },
    ],
  };
}

function parallelWf(idPrefix = 'wf-par') {
  return {
    id: idPrefix,
    name: 'Parallel',
    description: 'fan-out + join',
    nodes: [
      { id: 'p', type: 'parallel', name: 'Fan', config: {} },
      { id: 'a', type: 'task', name: 'BranchA', config: {} },
      { id: 'b', type: 'task', name: 'BranchB', config: {} },
      { id: 'j', type: 'task', name: 'Join', config: {} },
      { id: 'end1', type: 'end', name: 'End', config: {} },
    ],
    edges: [
      { from: 'p', to: 'a' },
      { from: 'p', to: 'b' },
      { from: 'a', to: 'j' },
      { from: 'b', to: 'j' },
      { from: 'j', to: 'end1' },
    ],
  };
}

describe('(11.3) helpers + constants', () => {
  test('(a) NODE_TYPES exposes the canonical types', () => {
    expect(NODE_TYPES).toContain('task');
    expect(NODE_TYPES).toContain('condition');
    expect(NODE_TYPES).toContain('parallel');
    expect(NODE_TYPES).toContain('wait');
    expect(NODE_TYPES).toContain('audit');
    expect(NODE_TYPES).toContain('notify');
    expect(NODE_TYPES).toContain('end');
    expect(NODE_TYPES.length).toBe(7);
  });

  test('(b) RUN_STATUS / NODE_STATUS expose lifecycle constants', () => {
    expect(RUN_STATUS.RUNNING).toBe('running');
    expect(RUN_STATUS.COMPLETED).toBe('completed');
    expect(RUN_STATUS.FAILED).toBe('failed');
    expect(NODE_STATUS.SKIPPED).toBe('skipped');
  });

  test('(c) RUN_RETENTION default is 200', () => {
    expect(RUN_RETENTION).toBe(200);
  });

  test('(d) defaultWorkflowsPath and defaultRunsPath live under ~/.c4', () => {
    expect(defaultWorkflowsPath().endsWith(path.join('.c4', 'workflows.json'))).toBe(true);
    expect(defaultRunsPath().endsWith(path.join('.c4', 'workflow-runs.json'))).toBe(true);
    expect(defaultWorkflowsPath().startsWith(os.homedir())).toBe(true);
  });

  test('(e) isId rejects bad ids', () => {
    expect(isId('wf_1')).toBe(true);
    expect(isId('daily.report')).toBe(true);
    expect(isId('')).toBe(false);
    expect(isId('bad id')).toBe(false);
    expect(isId(null)).toBe(false);
  });

  test('(f) genWorkflowId returns a wf_ prefixed string', () => {
    const id = genWorkflowId();
    expect(typeof id).toBe('string');
    expect(id.startsWith('wf_')).toBe(true);
    expect(id.length).toBeGreaterThan(3);
  });
});

describe('(11.3) validateGraph', () => {
  test('(a) accepts a minimal end-only workflow', () => {
    const v = validateGraph(
      [{ id: 'end1', type: 'end', name: 'End' }],
      [],
    );
    expect(v.valid).toBe(true);
    expect(v.errors.length).toBe(0);
  });

  test('(b) rejects empty graph', () => {
    const v = validateGraph([], []);
    expect(v.valid).toBe(false);
  });

  test('(c) detects duplicate node ids', () => {
    const v = validateGraph(
      [
        { id: 'a', type: 'task' },
        { id: 'a', type: 'end' },
      ],
      [],
    );
    expect(v.valid).toBe(false);
    expect(v.errors.some((e) => e.includes('duplicate node id'))).toBe(true);
  });

  test('(d) flags edges referencing unknown nodes', () => {
    const v = validateGraph(
      [{ id: 'a', type: 'task' }, { id: 'end1', type: 'end' }],
      [{ from: 'a', to: 'ghost' }, { from: 'ghost2', to: 'end1' }],
    );
    expect(v.valid).toBe(false);
    expect(v.errors.some((e) => e.includes('unknown node'))).toBe(true);
  });

  test('(e) flags duplicate edges', () => {
    const v = validateGraph(
      [{ id: 'a', type: 'task' }, { id: 'end1', type: 'end' }],
      [
        { from: 'a', to: 'end1' },
        { from: 'a', to: 'end1' },
      ],
    );
    expect(v.valid).toBe(false);
    expect(v.errors.some((e) => e.includes('duplicate edge'))).toBe(true);
  });

  test('(f) flags self-edges', () => {
    const v = validateGraph(
      [{ id: 'a', type: 'task' }, { id: 'end1', type: 'end' }],
      [{ from: 'a', to: 'a' }, { from: 'a', to: 'end1' }],
    );
    expect(v.valid).toBe(false);
    expect(v.errors.some((e) => e.includes('self-edge'))).toBe(true);
  });

  test('(g) detects cycles', () => {
    const v = validateGraph(
      [
        { id: 'a', type: 'task' },
        { id: 'b', type: 'task' },
        { id: 'c', type: 'task' },
        { id: 'end1', type: 'end' },
      ],
      [
        { from: 'a', to: 'b' },
        { from: 'b', to: 'c' },
        { from: 'c', to: 'a' },
        { from: 'a', to: 'end1' },
      ],
    );
    expect(v.valid).toBe(false);
    expect(v.errors.some((e) => e.includes('cycle'))).toBe(true);
  });

  test('(h) flags orphan nodes (no incoming + no outgoing edges)', () => {
    const v = validateGraph(
      [
        { id: 'a', type: 'task' },
        { id: 'orphan', type: 'task' },
        { id: 'end1', type: 'end' },
      ],
      [{ from: 'a', to: 'end1' }],
    );
    expect(v.valid).toBe(false);
    expect(v.errors.some((e) => e.includes('orphan'))).toBe(true);
  });

  test('(i) requires at least one end node', () => {
    const v = validateGraph(
      [{ id: 'a', type: 'task' }, { id: 'b', type: 'task' }],
      [{ from: 'a', to: 'b' }],
    );
    expect(v.valid).toBe(false);
    expect(v.errors.some((e) => e.includes('end node'))).toBe(true);
  });

  test('(j) rejects unknown node types', () => {
    const v = validateGraph(
      [{ id: 'a', type: 'invented' }, { id: 'end1', type: 'end' }],
      [{ from: 'a', to: 'end1' }],
    );
    expect(v.valid).toBe(false);
    expect(v.errors.some((e) => e.includes('unknown node type'))).toBe(true);
  });

  test('(k) accepts the linear example', () => {
    const wf = linearWf();
    const v = validateGraph(wf.nodes, wf.edges);
    expect(v.valid).toBe(true);
  });

  test('(l) topoSort returns null on cycle, ordered list otherwise', () => {
    const order = topoSort(linearWf().nodes, linearWf().edges);
    expect(Array.isArray(order)).toBe(true);
    expect(order.indexOf('a')).toBeLessThan(order.indexOf('b'));
    expect(order.indexOf('b')).toBeLessThan(order.indexOf('end1'));
    const cycleOrder = topoSort(
      [{ id: 'a', type: 'task' }, { id: 'b', type: 'task' }, { id: 'end1', type: 'end' }],
      [
        { from: 'a', to: 'b' },
        { from: 'b', to: 'a' },
      ],
    );
    expect(cycleOrder).toBe(null);
  });
});

describe('(11.3) sandboxed condition evaluator', () => {
  test('(a) evaluates simple expressions against the context', () => {
    expect(evalCondition('output.x > 5', { output: { x: 10 } })).toBe(true);
    expect(evalCondition('output.x > 5', { output: { x: 1 } })).toBe(false);
    expect(evalCondition('input.name === "alice"', { input: { name: 'alice' } })).toBe(true);
    expect(evalCondition('Math.max(output.a, output.b) >= 3', { output: { a: 1, b: 5 } })).toBe(true);
  });

  test('(b) blocks eval / Function / require / import keywords', () => {
    expect(() => evalCondition('eval("1")', {})).toThrow();
    expect(() => evalCondition('Function("return process")()', {})).toThrow();
    expect(() => evalCondition('require("fs")', {})).toThrow();
    expect(() => evalCondition('import("fs")', {})).toThrow();
    expect(() => evalCondition('throw 1', {})).toThrow();
  });

  test('(c) shadows process / globalThis / setTimeout with undefined', () => {
    expect(evalCondition('typeof process', {})).toBe('undefined');
    expect(evalCondition('typeof globalThis', {})).toBe('undefined');
    expect(evalCondition('typeof setTimeout', {})).toBe('undefined');
    expect(evalCondition('typeof console', {})).toBe('undefined');
  });

  test('(d) rejects empty / non-string / oversized expressions', () => {
    expect(() => evalCondition('', {})).toThrow();
    expect(() => evalCondition(null, {})).toThrow();
    const huge = 'true && '.repeat(200) + 'true';
    expect(() => evalCondition(huge, {})).toThrow();
  });
});

describe('(11.3) WorkflowManager CRUD', () => {
  test('(a) createWorkflow validates and persists', () => {
    const m = newMgr();
    const wf = m.createWorkflow(linearWf('wf-create'));
    expect(wf.id).toBe('wf-create');
    expect(wf.nodes.length).toBe(3);
    expect(wf.enabled).toBe(true);
    expect(typeof wf.createdAt).toBe('string');
    expect(fs.existsSync(m.store.workflowsPath)).toBe(true);
  });

  test('(b) createWorkflow rejects duplicate ids', () => {
    const m = newMgr();
    m.createWorkflow(linearWf('dup'));
    expect(() => m.createWorkflow(linearWf('dup'))).toThrow();
  });

  test('(c) createWorkflow rejects invalid graphs', () => {
    const m = newMgr();
    let threw = false;
    try {
      m.createWorkflow({ id: 'bad', name: 'x', nodes: [], edges: [] });
    } catch (e) {
      threw = true;
      expect(Array.isArray(e.errors)).toBe(true);
    }
    expect(threw).toBe(true);
  });

  test('(d) updateWorkflow re-validates when nodes/edges change', () => {
    const m = newMgr();
    m.createWorkflow(linearWf('wf-up'));
    const next = m.updateWorkflow('wf-up', { description: 'updated' });
    expect(next.description).toBe('updated');
    expect(() =>
      m.updateWorkflow('wf-up', { nodes: [{ id: 'x', type: 'task' }], edges: [] }),
    ).toThrow();
  });

  test('(e) deleteWorkflow removes from store and returns false on miss', () => {
    const m = newMgr();
    m.createWorkflow(linearWf('wf-del'));
    expect(m.deleteWorkflow('wf-del')).toBe(true);
    expect(m.getWorkflow('wf-del')).toBe(null);
    expect(m.deleteWorkflow('wf-del')).toBe(false);
    expect(m.deleteWorkflow('!!')).toBe(false);
  });

  test('(f) listWorkflows filters on enabled and nameContains', () => {
    const m = newMgr();
    const a = m.createWorkflow({ ...linearWf('a'), name: 'Alpha pipeline' });
    const b = m.createWorkflow({ ...linearWf('b'), name: 'Beta pipeline' });
    m.disableWorkflow(b.id);
    const enabled = m.listWorkflows({ enabled: true });
    expect(enabled.length).toBe(1);
    expect(enabled[0].id).toBe('a');
    const disabled = m.listWorkflows({ enabled: false });
    expect(disabled.length).toBe(1);
    expect(disabled[0].id).toBe('b');
    const alpha = m.listWorkflows({ nameContains: 'alpha' });
    expect(alpha.length).toBe(1);
    expect(alpha[0].id).toBe(a.id);
  });

  test('(g) enable/disableWorkflow toggle the flag', () => {
    const m = newMgr();
    m.createWorkflow(linearWf('toggle'));
    m.disableWorkflow('toggle');
    expect(m.getWorkflow('toggle').enabled).toBe(false);
    m.enableWorkflow('toggle');
    expect(m.getWorkflow('toggle').enabled).toBe(true);
  });
});

describe('(11.3) storage roundtrip', () => {
  test('(a) workflows + runs survive a reload', async () => {
    const tmp = mkTmpStore();
    const m1 = new WorkflowManager(tmp);
    const wf = m1.createWorkflow(linearWf('wf-rt'));
    const exec = new WorkflowExecutor({
      manager: m1,
      dispatcher: async () => ({ ok: true }),
    });
    const run = await exec.executeWorkflow(wf.id, { trigger: 'test' }, {});
    expect(run.status).toBe(RUN_STATUS.COMPLETED);

    const m2 = new WorkflowManager(tmp);
    const reloaded = m2.getWorkflow('wf-rt');
    expect(reloaded).not.toBe(null);
    expect(reloaded.nodes.length).toBe(3);
    const runs = m2.store.listRunsForWorkflow('wf-rt');
    expect(runs.length).toBe(1);
    expect(runs[0].id).toBe(run.id);
  });

  test('(b) ensureWorkflowsShape drops malformed entries', () => {
    const cleaned = ensureWorkflowsShape({
      workflows: {
        good: { id: 'good', nodes: [{ id: 'end1', type: 'end' }], edges: [] },
        bad: { nodes: 'oops' },
        ' ': { id: ' ', nodes: [], edges: [] },
      },
    });
    expect(cleaned.workflows.good).toBeTruthy();
    expect(cleaned.workflows.bad).toBeUndefined();
  });

  test('(c) normalizeWorkflow defaults enabled=true and fills timestamps', () => {
    const wf = normalizeWorkflow({
      id: 'norm', nodes: [{ id: 'end1', type: 'end' }], edges: [],
    });
    expect(wf.enabled).toBe(true);
    expect(typeof wf.createdAt).toBe('string');
    expect(typeof wf.updatedAt).toBe('string');
    expect(wf.description).toBe('');
  });
});

describe('(11.3) run history retention', () => {
  test('(a) keeps only the last RUN_RETENTION-equivalent entries', async () => {
    const tmp = mkTmpStore();
    const m = new WorkflowManager({ ...tmp, runRetention: 5 });
    m.createWorkflow(linearWf('ret'));
    const exec = new WorkflowExecutor({
      manager: m,
      dispatcher: async () => ({ ok: true }),
    });
    for (let i = 0; i < 8; i++) {
      // eslint-disable-next-line no-await-in-loop
      await exec.executeWorkflow('ret', {}, {});
    }
    const runs = m.store.listAllRuns();
    expect(runs.length).toBe(5);
  });
});

describe('(11.3) WorkflowExecutor', () => {
  test('(a) linear chain runs nodes in topological order', async () => {
    const m = newMgr();
    m.createWorkflow(linearWf('lin'));
    const calls = [];
    const exec = new WorkflowExecutor({
      manager: m,
      dispatcher: async ({ node }) => { calls.push(node.id); return { ok: true, ran: node.id }; },
    });
    const run = await exec.executeWorkflow('lin', { trigger: 'x' }, {});
    expect(run.status).toBe(RUN_STATUS.COMPLETED);
    expect(calls).toEqual(['a', 'b']);
    expect(run.nodeResults.a.status).toBe(NODE_STATUS.COMPLETED);
    expect(run.nodeResults.end1.status).toBe(NODE_STATUS.COMPLETED);
    expect(run.nodeResults.end1.output.terminal).toBe(true);
  });

  test('(b) conditional branch follows the matching edge only', async () => {
    const m = newMgr();
    m.createWorkflow(conditionalWf('cond-true'));
    const trueExec = new WorkflowExecutor({
      manager: m,
      dispatcher: async ({ node }) => {
        if (node.id === 'start') return { flag: true };
        return { ran: node.id };
      },
    });
    const trueRun = await trueExec.executeWorkflow('cond-true', {}, {});
    expect(trueRun.status).toBe(RUN_STATUS.COMPLETED);
    expect(trueRun.nodeResults.t.status).toBe(NODE_STATUS.COMPLETED);
    expect(trueRun.nodeResults.f.status).toBe(NODE_STATUS.SKIPPED);
    expect(trueRun.nodeResults.cond.output.value).toBe(true);

    m.createWorkflow(conditionalWf('cond-false'));
    const falseExec = new WorkflowExecutor({
      manager: m,
      dispatcher: async ({ node }) => {
        if (node.id === 'start') return { flag: false };
        return { ran: node.id };
      },
    });
    const falseRun = await falseExec.executeWorkflow('cond-false', {}, {});
    expect(falseRun.status).toBe(RUN_STATUS.COMPLETED);
    expect(falseRun.nodeResults.t.status).toBe(NODE_STATUS.SKIPPED);
    expect(falseRun.nodeResults.f.status).toBe(NODE_STATUS.COMPLETED);
    expect(falseRun.nodeResults.cond.output.value).toBe(false);
  });

  test('(c) parallel fan-out + join executes join exactly once', async () => {
    const m = newMgr();
    m.createWorkflow(parallelWf('par'));
    const calls = [];
    const exec = new WorkflowExecutor({
      manager: m,
      dispatcher: async ({ node }) => { calls.push(node.id); return { id: node.id }; },
    });
    const run = await exec.executeWorkflow('par', {}, {});
    expect(run.status).toBe(RUN_STATUS.COMPLETED);
    expect(run.nodeResults.a.status).toBe(NODE_STATUS.COMPLETED);
    expect(run.nodeResults.b.status).toBe(NODE_STATUS.COMPLETED);
    expect(run.nodeResults.j.status).toBe(NODE_STATUS.COMPLETED);
    // Join should be called once even though it has two predecessors.
    const joinCalls = calls.filter((c) => c === 'j');
    expect(joinCalls.length).toBe(1);
  });

  test('(d) disabled workflow is rejected with a typed error', async () => {
    const m = newMgr();
    m.createWorkflow(linearWf('off'));
    m.disableWorkflow('off');
    const exec = new WorkflowExecutor({
      manager: m,
      dispatcher: async () => ({ ok: true }),
    });
    let captured = null;
    try {
      await exec.executeWorkflow('off', {}, {});
    } catch (e) {
      captured = e;
    }
    expect(captured).not.toBe(null);
    expect(captured.code).toBe('WORKFLOW_DISABLED');
  });

  test('(e) wait node honours delayMs through injected waitImpl', async () => {
    const m = newMgr();
    m.createWorkflow({
      id: 'wait1',
      name: 'Wait',
      description: '',
      nodes: [
        { id: 'w', type: 'wait', name: 'Wait', config: { delayMs: 5 } },
        { id: 'end1', type: 'end', name: 'End', config: {} },
      ],
      edges: [{ from: 'w', to: 'end1' }],
    });
    let waitedFor = -1;
    const exec = new WorkflowExecutor({
      manager: m,
      waitImpl: (ms) => { waitedFor = ms; return Promise.resolve(); },
    });
    const run = await exec.executeWorkflow('wait1', {}, {});
    expect(run.status).toBe(RUN_STATUS.COMPLETED);
    expect(waitedFor).toBe(5);
    expect(run.nodeResults.w.output.waited).toBe(5);
  });

  test('(f) failed dispatcher marks the run as failed and stops downstream', async () => {
    const m = newMgr();
    m.createWorkflow(linearWf('fail'));
    const exec = new WorkflowExecutor({
      manager: m,
      dispatcher: async ({ node }) => {
        if (node.id === 'a') throw new Error('boom');
        return { ok: true };
      },
    });
    const run = await exec.executeWorkflow('fail', {}, {});
    expect(run.status).toBe(RUN_STATUS.FAILED);
    expect(run.nodeResults.a.status).toBe(NODE_STATUS.FAILED);
    expect(run.nodeResults.a.error).toBe('boom');
    expect(run.nodeResults.b.status).toBe(NODE_STATUS.SKIPPED);
  });

  test('(g) executeWorkflow throws when the workflow does not exist', async () => {
    const m = newMgr();
    const exec = new WorkflowExecutor({ manager: m });
    let threw = false;
    try { await exec.executeWorkflow('nope', {}, {}); }
    catch { threw = true; }
    expect(threw).toBe(true);
  });
});

describe('(11.3) WorkflowStore retention edge cases', () => {
  test('(a) appendRun keeps insertion order and trims old entries', () => {
    const tmp = mkTmpStore();
    const store = new WorkflowStore({ ...tmp, runRetention: 3 });
    for (let i = 0; i < 5; i++) {
      store.appendRun({ id: 'r' + i, workflowId: 'wf', startedAt: '', completedAt: '', status: 'completed', nodeResults: {} });
    }
    const all = store.listAllRuns();
    expect(all.length).toBe(3);
    expect(all[0].id).toBe('r2');
    expect(all[2].id).toBe('r4');
  });

  test('(b) getRun returns null on miss', () => {
    const store = new WorkflowStore(mkTmpStore());
    expect(store.getRun('missing')).toBe(null);
  });
});
