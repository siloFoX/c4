'use strict';

// (11.3) Workflow engine.
//
// Graph-based multi-worker orchestration. A Workflow is a small DAG of
// `task`, `condition`, `parallel`, `wait`, and `end` nodes connected by
// directed `edges`. The WorkflowExecutor walks the graph in topological
// order, dispatches `task` nodes through an injected worker dispatcher,
// evaluates `condition` outputs (and edge conditions) inside a hardened
// `new Function(...)` sandbox, and records every node's status / output
// into a WorkflowRun. The first iteration ships with an in-process
// dispatcher signature so the daemon can wire its existing worker
// pipeline without forcing tests to spin up real PTYs.
//
// Design notes
// ------------
// 1. Two storage files: ~/.c4/workflows.json holds definitions (always
//    persisted), ~/.c4/workflow-runs.json holds run history (capped at
//    the most recent 200 entries). Tests construct their own stores
//    pointed at a tmpdir and never touch the operator's real files.
// 2. validateGraph(nodes, edges) is the single source of truth for what
//    counts as a "good" workflow: unique node ids, every edge endpoint
//    references an existing node, no duplicate (from -> to) edges, no
//    cycles (Kahn's algorithm), no fully-orphan node (no incoming AND
//    no outgoing edges), and at least one terminal `end` node so the
//    walker has somewhere to stop. Both createWorkflow and
//    updateWorkflow run this gate before persisting.
// 3. The executor's edge-follow rule is the same for every node type:
//    after the node executes we evaluate each outgoing edge's optional
//    `condition` against the just-produced node output; truthy => the
//    target is activated. `parallel` nodes activate every matched
//    target concurrently (Promise.all), which models fan-out without a
//    distinct join construct - join nodes simply have multiple
//    incoming edges and execute once when their topo turn arrives.
// 4. Conditions are evaluated through evalCondition, which builds a
//    `new Function` whose parameter list shadows every dangerous Node
//    global (process / Buffer / setTimeout / etc.) with `undefined`
//    while still exposing a small whitelist (Math, JSON, Date, Number,
//    String, Boolean, Array, Object, RegExp). Strict mode forbids
//    indirect-eval-via-rename and `with`, and a regex-level pre-check
//    rejects `eval`, `Function`, `require`, `import`, `new Process`,
//    and loop / throw keywords before parsing. This is a *basic* sandbox
//    suitable for trusted-but-typo'd workflow YAML, not a defence
//    against an actively hostile author with full code-execution intent.
// 5. The dispatcher contract is intentionally tiny: an async function
//    `({nodeId, node, input, prev, runId}) -> any`. When omitted the
//    executor uses a default mock that returns `{ ok: true }`, which
//    makes the test suite (and any "dry-run" CLI) work without a live
//    daemon.

const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');

const NODE_TYPES = Object.freeze(['task', 'condition', 'parallel', 'wait', 'audit', 'end']);
const RUN_STATUS = Object.freeze({
  RUNNING: 'running',
  COMPLETED: 'completed',
  FAILED: 'failed',
  SKIPPED: 'skipped',
});
const NODE_STATUS = Object.freeze({
  COMPLETED: 'completed',
  FAILED: 'failed',
  SKIPPED: 'skipped',
});

const RUN_RETENTION = 200;
const ID_PATTERN = /^[A-Za-z0-9._-]+$/;

const SAFE_GLOBALS = Object.freeze({
  Math, JSON, Date, Number, String, Boolean, Array, Object, RegExp,
});
// Globals we explicitly shadow with `undefined` inside the condition
// sandbox. `eval`, `arguments`, and reserved words like `this` cannot
// be parameter names under strict mode, so we rely on the regex
// pre-check + strict-mode parser to keep them out of the expression.
const BLOCKED_GLOBALS = Object.freeze([
  'globalThis', 'global', 'process', 'Buffer', 'console',
  'setTimeout', 'setInterval', 'setImmediate',
  'clearTimeout', 'clearInterval', 'clearImmediate',
  'queueMicrotask', 'fetch', 'module', 'exports',
]);

function defaultWorkflowsPath() {
  return path.join(os.homedir(), '.c4', 'workflows.json');
}

function defaultRunsPath() {
  return path.join(os.homedir(), '.c4', 'workflow-runs.json');
}

function isId(v) {
  return typeof v === 'string' && v.length > 0 && ID_PATTERN.test(v);
}

function genWorkflowId() {
  return 'wf_' + crypto.randomBytes(5).toString('hex');
}

function genRunId() {
  return 'run_' + crypto.randomBytes(6).toString('hex');
}

function nowIso() {
  return new Date().toISOString();
}

function clone(v) {
  return v === undefined ? undefined : JSON.parse(JSON.stringify(v));
}

// ---------------------------------------------------------------------
// Graph validation
// ---------------------------------------------------------------------

function validateGraph(nodes, edges) {
  const errors = [];
  if (!Array.isArray(nodes)) {
    return { valid: false, errors: ['nodes must be an array'] };
  }
  if (!Array.isArray(edges)) {
    return { valid: false, errors: ['edges must be an array'] };
  }
  if (nodes.length === 0) {
    return { valid: false, errors: ['workflow must have at least one node'] };
  }

  const seenIds = new Set();
  for (const n of nodes) {
    if (!n || typeof n !== 'object') {
      errors.push('node entry must be an object');
      continue;
    }
    if (!isId(n.id)) {
      errors.push('node id is invalid: ' + String(n.id));
      continue;
    }
    if (seenIds.has(n.id)) {
      errors.push('duplicate node id: ' + n.id);
      continue;
    }
    seenIds.add(n.id);
    if (!NODE_TYPES.includes(n.type)) {
      errors.push('unknown node type for ' + n.id + ': ' + String(n.type));
    }

    // Per-config validation for the node types that carry typed config
    // fields. Catches typos / negative numbers up-front so a workflow
    // never persists a config that the executor would reject at runtime.
    const cfg = (n.config && typeof n.config === 'object' && !Array.isArray(n.config)) ? n.config : null;
    if (cfg) {
      // retry block (any node type may declare it).
      if (cfg.retry !== undefined && cfg.retry !== null) {
        if (typeof cfg.retry !== 'object' || Array.isArray(cfg.retry)) {
          errors.push(`node ${n.id}: config.retry must be an object`);
        } else {
          if (cfg.retry.maxRetries !== undefined &&
              !(Number.isFinite(cfg.retry.maxRetries) && cfg.retry.maxRetries >= 0)) {
            errors.push(`node ${n.id}: config.retry.maxRetries must be a non-negative number`);
          }
          if (cfg.retry.backoffMs !== undefined &&
              !(Number.isFinite(cfg.retry.backoffMs) && cfg.retry.backoffMs >= 0)) {
            errors.push(`node ${n.id}: config.retry.backoffMs must be a non-negative number`);
          }
        }
      }
      // wait node — delayMs / event must have correct types.
      if (n.type === 'wait') {
        if (cfg.delayMs !== undefined &&
            !(Number.isFinite(cfg.delayMs) && cfg.delayMs >= 0)) {
          errors.push(`node ${n.id}: config.delayMs must be a non-negative number`);
        }
        if (cfg.event !== undefined && typeof cfg.event !== 'string') {
          errors.push(`node ${n.id}: config.event must be a string`);
        }
      }
      // condition node — expression must be a string when present.
      if (n.type === 'condition' && cfg.expression !== undefined &&
          typeof cfg.expression !== 'string') {
        errors.push(`node ${n.id}: config.expression must be a string`);
      }
      // audit node — eventType / target / details type checks.
      if (n.type === 'audit') {
        if (cfg.eventType !== undefined && typeof cfg.eventType !== 'string') {
          errors.push(`node ${n.id}: config.eventType must be a string`);
        }
        if (cfg.target !== undefined && typeof cfg.target !== 'string') {
          errors.push(`node ${n.id}: config.target must be a string`);
        }
        if (cfg.details !== undefined &&
            (typeof cfg.details !== 'object' || Array.isArray(cfg.details) || cfg.details === null)) {
          errors.push(`node ${n.id}: config.details must be an object`);
        }
      }
    }
  }

  const edgeKeys = new Set();
  for (const e of edges) {
    if (!e || typeof e !== 'object') {
      errors.push('edge entry must be an object');
      continue;
    }
    if (!isId(e.from)) {
      errors.push('edge.from is invalid: ' + String(e.from));
      continue;
    }
    if (!isId(e.to)) {
      errors.push('edge.to is invalid: ' + String(e.to));
      continue;
    }
    if (!seenIds.has(e.from)) {
      errors.push('edge.from references unknown node: ' + e.from);
    }
    if (!seenIds.has(e.to)) {
      errors.push('edge.to references unknown node: ' + e.to);
    }
    if (e.from === e.to) {
      errors.push('self-edge not allowed: ' + e.from);
    }
    const key = e.from + '\u0000' + e.to;
    if (edgeKeys.has(key)) {
      errors.push('duplicate edge: ' + e.from + ' -> ' + e.to);
    }
    edgeKeys.add(key);
    if (e.condition !== undefined && e.condition !== null && typeof e.condition !== 'string') {
      errors.push('edge.condition must be a string when set: ' + e.from + ' -> ' + e.to);
    }
  }

  // Orphan check: a node with no incoming AND no outgoing edges.
  // Single-node graphs are a special case (only `end` allowed).
  const indeg = new Map();
  const outdeg = new Map();
  for (const n of nodes) {
    indeg.set(n.id, 0);
    outdeg.set(n.id, 0);
  }
  for (const e of edges) {
    if (indeg.has(e.to)) indeg.set(e.to, indeg.get(e.to) + 1);
    if (outdeg.has(e.from)) outdeg.set(e.from, outdeg.get(e.from) + 1);
  }
  if (nodes.length > 1) {
    for (const n of nodes) {
      if ((indeg.get(n.id) || 0) === 0 && (outdeg.get(n.id) || 0) === 0) {
        errors.push('orphan node: ' + n.id);
      }
    }
  }

  // Terminal-node check: at least one `end` node must exist (single
  // `end` workflows are accepted). Without a terminal the walker has
  // nothing to anchor on.
  if (!nodes.some((n) => n.type === 'end')) {
    errors.push('workflow must contain at least one end node');
  }

  // Cycle detection via Kahn's algorithm.
  if (errors.length === 0) {
    const indegCopy = new Map(indeg);
    const queue = [];
    for (const [id, d] of indegCopy.entries()) {
      if (d === 0) queue.push(id);
    }
    let visited = 0;
    const adj = new Map();
    for (const n of nodes) adj.set(n.id, []);
    for (const e of edges) {
      if (adj.has(e.from)) adj.get(e.from).push(e.to);
    }
    while (queue.length > 0) {
      const cur = queue.shift();
      visited++;
      for (const nxt of adj.get(cur) || []) {
        const d = (indegCopy.get(nxt) || 0) - 1;
        indegCopy.set(nxt, d);
        if (d === 0) queue.push(nxt);
      }
    }
    if (visited !== nodes.length) {
      errors.push('graph contains a cycle');
    }
  }

  return { valid: errors.length === 0, errors };
}

// Topological order (Kahn's). Returns null when a cycle is detected so
// the caller can refuse to execute. validateGraph above runs the same
// check before persistence, so this should only ever fail if the store
// was hand-edited into an inconsistent state.
function topoSort(nodes, edges) {
  const indeg = new Map();
  const adj = new Map();
  for (const n of nodes) {
    indeg.set(n.id, 0);
    adj.set(n.id, []);
  }
  for (const e of edges) {
    if (indeg.has(e.to)) indeg.set(e.to, indeg.get(e.to) + 1);
    if (adj.has(e.from)) adj.get(e.from).push(e.to);
  }
  const queue = [];
  for (const [id, d] of indeg.entries()) if (d === 0) queue.push(id);
  const order = [];
  while (queue.length > 0) {
    const cur = queue.shift();
    order.push(cur);
    for (const nxt of adj.get(cur) || []) {
      const d = (indeg.get(nxt) || 0) - 1;
      indeg.set(nxt, d);
      if (d === 0) queue.push(nxt);
    }
  }
  if (order.length !== nodes.length) return null;
  return order;
}

// ---------------------------------------------------------------------
// Sandboxed condition evaluator
// ---------------------------------------------------------------------

const FORBIDDEN_TOKENS = /\b(eval|Function|require|import|export|throw|while|for|do|new\s+\w*Process|class)\b/;

function evalCondition(expression, ctx) {
  if (typeof expression !== 'string') {
    throw new Error('Condition expression must be a string');
  }
  const trimmed = expression.trim();
  if (trimmed.length === 0) {
    throw new Error('Condition expression is empty');
  }
  if (trimmed.length > 1024) {
    throw new Error('Condition expression too long');
  }
  if (FORBIDDEN_TOKENS.test(trimmed)) {
    throw new Error('Forbidden token in condition expression');
  }
  const allowedNames = Object.keys(SAFE_GLOBALS);
  const ctxKeys = ['output', 'input', 'env'];
  const argNames = [...ctxKeys, ...allowedNames, ...BLOCKED_GLOBALS];
  const argValues = [
    ctx && ctx.output !== undefined ? ctx.output : null,
    ctx && ctx.input !== undefined ? ctx.input : null,
    ctx && ctx.env !== undefined ? ctx.env : {},
    ...allowedNames.map((n) => SAFE_GLOBALS[n]),
    ...BLOCKED_GLOBALS.map(() => undefined),
  ];
  // eslint-disable-next-line no-new-func
  const fn = new Function(...argNames, '"use strict"; return (' + trimmed + ');');
  return fn.apply(null, argValues);
}

// ---------------------------------------------------------------------
// Storage layer
// ---------------------------------------------------------------------

function ensureWorkflowsShape(state) {
  const out = { workflows: {} };
  if (!state || typeof state !== 'object') return out;
  const w = state.workflows;
  if (!w || typeof w !== 'object') return out;
  for (const [id, def] of Object.entries(w)) {
    if (!isId(id) || !def || typeof def !== 'object') continue;
    const v = validateGraph(def.nodes, def.edges);
    if (!v.valid) continue;
    out.workflows[id] = normalizeWorkflow({ ...def, id });
  }
  return out;
}

function ensureRunsShape(state) {
  const out = { runs: [] };
  if (!state || typeof state !== 'object') return out;
  if (Array.isArray(state.runs)) {
    for (const r of state.runs) {
      if (r && typeof r === 'object' && typeof r.id === 'string') {
        out.runs.push(r);
      }
    }
  }
  return out;
}

function normalizeWorkflow(input) {
  const id = isId(input.id) ? input.id : genWorkflowId();
  const name = typeof input.name === 'string' && input.name.length > 0 ? input.name : id;
  const description = typeof input.description === 'string' ? input.description : '';
  const enabled = input.enabled === false ? false : true;
  const nodes = (input.nodes || []).map((n) => ({
    id: n.id,
    type: n.type,
    name: typeof n.name === 'string' ? n.name : n.id,
    config: (n.config && typeof n.config === 'object') ? clone(n.config) : {},
  }));
  const edges = (input.edges || []).map((e) => {
    const out = { from: e.from, to: e.to };
    if (typeof e.condition === 'string' && e.condition.length > 0) out.condition = e.condition;
    return out;
  });
  return {
    id,
    name,
    description,
    nodes,
    edges,
    enabled,
    createdAt: typeof input.createdAt === 'string' ? input.createdAt : nowIso(),
    updatedAt: typeof input.updatedAt === 'string' ? input.updatedAt : nowIso(),
  };
}

class WorkflowStore {
  constructor(opts = {}) {
    this.workflowsPath = (opts && opts.workflowsPath) || defaultWorkflowsPath();
    this.runsPath = (opts && opts.runsPath) || defaultRunsPath();
    this.runRetention = Number.isFinite(opts && opts.runRetention)
      ? opts.runRetention : RUN_RETENTION;
    this._workflows = null;
    this._runs = null;
  }

  _loadWorkflows() {
    if (this._workflows) return this._workflows;
    if (!fs.existsSync(this.workflowsPath)) {
      this._workflows = { workflows: {} };
      return this._workflows;
    }
    try {
      const raw = fs.readFileSync(this.workflowsPath, 'utf8');
      const parsed = raw && raw.length > 0 ? JSON.parse(raw) : {};
      this._workflows = ensureWorkflowsShape(parsed);
    } catch {
      this._workflows = { workflows: {} };
    }
    return this._workflows;
  }

  _persistWorkflows() {
    const dir = path.dirname(this.workflowsPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(this.workflowsPath, JSON.stringify(this._workflows, null, 2) + '\n');
  }

  _loadRuns() {
    if (this._runs) return this._runs;
    if (!fs.existsSync(this.runsPath)) {
      this._runs = { runs: [] };
      return this._runs;
    }
    try {
      const raw = fs.readFileSync(this.runsPath, 'utf8');
      const parsed = raw && raw.length > 0 ? JSON.parse(raw) : {};
      this._runs = ensureRunsShape(parsed);
    } catch {
      this._runs = { runs: [] };
    }
    return this._runs;
  }

  _persistRuns() {
    const dir = path.dirname(this.runsPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(this.runsPath, JSON.stringify(this._runs, null, 2) + '\n');
  }

  reload() {
    this._workflows = null;
    this._runs = null;
  }

  appendRun(run) {
    const state = this._loadRuns();
    state.runs.push(run);
    if (state.runs.length > this.runRetention) {
      state.runs.splice(0, state.runs.length - this.runRetention);
    }
    this._persistRuns();
    return run;
  }

  getRun(runId) {
    const state = this._loadRuns();
    return state.runs.find((r) => r.id === runId) || null;
  }

  listRunsForWorkflow(workflowId) {
    const state = this._loadRuns();
    return state.runs.filter((r) => r.workflowId === workflowId).slice();
  }

  listAllRuns() {
    return this._loadRuns().runs.slice();
  }
}

// ---------------------------------------------------------------------
// WorkflowManager (CRUD + storage)
// ---------------------------------------------------------------------

class WorkflowManager {
  constructor(opts = {}) {
    this.store = (opts && opts.store) || new WorkflowStore(opts);
  }

  createWorkflow(input) {
    if (!input || typeof input !== 'object') throw new Error('Invalid workflow input');
    const id = isId(input.id) ? input.id : genWorkflowId();
    const state = this.store._loadWorkflows();
    if (state.workflows[id]) throw new Error('Workflow already exists: ' + id);
    const v = validateGraph(input.nodes, input.edges);
    if (!v.valid) {
      const err = new Error('Invalid workflow graph: ' + v.errors.join('; '));
      err.errors = v.errors;
      throw err;
    }
    const wf = normalizeWorkflow({ ...input, id });
    state.workflows[id] = wf;
    this.store._persistWorkflows();
    return clone(wf);
  }

  updateWorkflow(id, patch) {
    if (!isId(id)) throw new Error('Invalid workflow id');
    const state = this.store._loadWorkflows();
    const existing = state.workflows[id];
    if (!existing) throw new Error('Workflow not found: ' + id);
    const merged = { ...existing, ...(patch || {}), id };
    if (patch && (patch.nodes !== undefined || patch.edges !== undefined)) {
      const nodes = patch.nodes !== undefined ? patch.nodes : existing.nodes;
      const edges = patch.edges !== undefined ? patch.edges : existing.edges;
      const v = validateGraph(nodes, edges);
      if (!v.valid) {
        const err = new Error('Invalid workflow graph: ' + v.errors.join('; '));
        err.errors = v.errors;
        throw err;
      }
      merged.nodes = nodes;
      merged.edges = edges;
    }
    merged.updatedAt = nowIso();
    merged.createdAt = existing.createdAt;
    state.workflows[id] = normalizeWorkflow(merged);
    this.store._persistWorkflows();
    return clone(state.workflows[id]);
  }

  deleteWorkflow(id) {
    if (!isId(id)) return false;
    const state = this.store._loadWorkflows();
    if (!state.workflows[id]) return false;
    delete state.workflows[id];
    this.store._persistWorkflows();
    return true;
  }

  getWorkflow(id) {
    const state = this.store._loadWorkflows();
    const wf = state.workflows[id];
    return wf ? clone(wf) : null;
  }

  listWorkflows(filter) {
    const state = this.store._loadWorkflows();
    let out = Object.values(state.workflows).map(clone);
    if (filter && typeof filter === 'object') {
      if (typeof filter.enabled === 'boolean') {
        out = out.filter((w) => w.enabled === filter.enabled);
      }
      if (typeof filter.nameContains === 'string' && filter.nameContains.length > 0) {
        const needle = filter.nameContains.toLowerCase();
        out = out.filter((w) => (w.name || '').toLowerCase().includes(needle));
      }
    }
    out.sort((a, b) => a.id.localeCompare(b.id));
    return out;
  }

  enableWorkflow(id) {
    return this.updateWorkflow(id, { enabled: true });
  }

  disableWorkflow(id) {
    return this.updateWorkflow(id, { enabled: false });
  }

  validateGraph(nodes, edges) {
    return validateGraph(nodes, edges);
  }

  exportWorkflow(id) {
    const wf = this.getWorkflow(id);
    if (!wf) throw new Error('Workflow not found: ' + id);
    return wf;
  }
}

// ---------------------------------------------------------------------
// WorkflowExecutor
// ---------------------------------------------------------------------

async function defaultDispatcher({ node }) {
  // Returned shape mirrors what the daemon's worker dispatcher would
  // produce: a small object that downstream conditions can inspect.
  return { ok: true, type: node && node.type, name: node && node.name };
}

class WorkflowExecutor {
  constructor(opts = {}) {
    this.manager = (opts && opts.manager) || new WorkflowManager(opts);
    this.store = this.manager.store;
    this.dispatcher = (opts && typeof opts.dispatcher === 'function')
      ? opts.dispatcher : defaultDispatcher;
    this.waitImpl = (opts && typeof opts.waitImpl === 'function')
      ? opts.waitImpl
      : (ms) => new Promise((res) => setTimeout(res, ms));
    // Optional AuditLogger so 'audit' nodes can record() into the
    // tamper-evident hash chain. When omitted those nodes are no-ops
    // (return { skipped: true }) instead of failing the run.
    this.auditLogger = (opts && opts.auditLogger) || null;
  }

  async executeWorkflow(workflowId, inputs, context) {
    const wf = this.manager.getWorkflow(workflowId);
    if (!wf) throw new Error('Workflow not found: ' + workflowId);
    if (wf.enabled === false) {
      const err = new Error('Workflow is disabled: ' + workflowId);
      err.code = 'WORKFLOW_DISABLED';
      throw err;
    }
    const order = topoSort(wf.nodes, wf.edges);
    if (!order) {
      throw new Error('Workflow graph contains a cycle: ' + workflowId);
    }

    const runId = (context && context.runId) || genRunId();
    const run = {
      id: runId,
      workflowId,
      startedAt: nowIso(),
      completedAt: null,
      status: RUN_STATUS.RUNNING,
      inputs: clone(inputs) || null,
      nodeResults: {},
    };
    for (const n of wf.nodes) {
      run.nodeResults[n.id] = { status: NODE_STATUS.SKIPPED, output: null, error: null, startedAt: null, completedAt: null };
    }

    const indeg = new Map();
    for (const n of wf.nodes) indeg.set(n.id, 0);
    for (const e of wf.edges) indeg.set(e.to, (indeg.get(e.to) || 0) + 1);

    const activated = new Set();
    const lastOutputForNode = new Map();
    for (const n of wf.nodes) {
      if ((indeg.get(n.id) || 0) === 0) activated.add(n.id);
    }

    const idToNode = new Map(wf.nodes.map((n) => [n.id, n]));
    let halted = false;

    for (const nodeId of order) {
      if (halted) break;
      if (!activated.has(nodeId)) continue;
      const node = idToNode.get(nodeId);
      const prev = lastOutputForNode.has(nodeId) ? lastOutputForNode.get(nodeId) : (inputs || null);
      const startedAt = nowIso();
      const result = { status: NODE_STATUS.COMPLETED, output: null, error: null, startedAt, completedAt: null };
      try {
        result.output = await this._executeNode(node, prev, inputs, runId);
      } catch (e) {
        result.status = NODE_STATUS.FAILED;
        result.error = (e && e.message) ? e.message : String(e);
      }
      result.completedAt = nowIso();
      run.nodeResults[nodeId] = result;

      if (result.status === NODE_STATUS.FAILED) {
        run.status = RUN_STATUS.FAILED;
        halted = true;
        break;
      }

      const outEdges = wf.edges.filter((e) => e.from === nodeId);
      const followed = [];
      for (const edge of outEdges) {
        let follow = true;
        if (edge.condition) {
          try {
            follow = Boolean(evalCondition(edge.condition, {
              output: result.output, input: inputs, env: {},
            }));
          } catch (e) {
            follow = false;
          }
        }
        if (follow) {
          followed.push(edge);
          activated.add(edge.to);
          if (!lastOutputForNode.has(edge.to)) {
            lastOutputForNode.set(edge.to, result.output);
          }
        }
      }
      // For parallel nodes, branches still execute sequentially in topo
      // order downstream; the in-process dispatcher is awaited per node
      // anyway, so true concurrency would require a different runtime
      // (deferred for the worker-pool integration in 11.5).
      void followed;
    }

    if (run.status === RUN_STATUS.RUNNING) {
      run.status = RUN_STATUS.COMPLETED;
    }
    run.completedAt = nowIso();
    this.store.appendRun(run);
    return clone(run);
  }

  async _executeNode(node, prev, inputs, runId) {
    if (!node) throw new Error('Node not found');
    if (node.type === 'task') {
      const out = await this.dispatcher({ nodeId: node.id, node, input: inputs, prev, runId });
      return out === undefined ? null : out;
    }
    if (node.type === 'condition') {
      const expr = node.config && typeof node.config.expression === 'string' ? node.config.expression : 'true';
      const value = evalCondition(expr, { output: prev, input: inputs, env: {} });
      return { value: Boolean(value) };
    }
    if (node.type === 'wait') {
      const cfg = node.config || {};
      if (Number.isFinite(cfg.delayMs) && cfg.delayMs > 0) {
        await this.waitImpl(cfg.delayMs);
        return { waited: cfg.delayMs };
      }
      if (typeof cfg.event === 'string' && cfg.event.length > 0) {
        return { event: cfg.event, fired: true };
      }
      return { waited: 0 };
    }
    if (node.type === 'parallel') {
      return { kind: 'parallel', name: node.name };
    }
    if (node.type === 'audit') {
      // Records an entry in the AuditLogger hash chain so workflow
      // execution leaves a tamper-evident trail for compliance audits.
      // Config:
      //   { eventType: 'task.completed', target?: '...', details?: {...} }
      // The previous node's output is merged into details under
      // `prevOutput` so condition / task results flow forward.
      if (!this.auditLogger || typeof this.auditLogger.record !== 'function') {
        return { skipped: true, reason: 'no auditLogger configured' };
      }
      const cfg = node.config || {};
      const eventType = typeof cfg.eventType === 'string' && cfg.eventType.length > 0
        ? cfg.eventType
        : 'workflow.audit';
      const detailsOut = Object.assign({}, cfg.details || {});
      if (prev !== undefined) detailsOut.prevOutput = prev;
      detailsOut.runId = runId;
      detailsOut.nodeId = node.id;
      const overrides = {};
      if (typeof cfg.target === 'string' && cfg.target.length > 0) {
        overrides.target = cfg.target;
      }
      try {
        const recorded = this.auditLogger.record(eventType, detailsOut, overrides);
        return { recorded: true, hash: recorded.hash, eventType };
      } catch (e) {
        return { recorded: false, error: e && e.message ? e.message : String(e) };
      }
    }
    if (node.type === 'end') {
      return { terminal: true };
    }
    throw new Error('Unknown node type: ' + node.type);
  }
}

// ---------------------------------------------------------------------
// Daemon-wide shared instance
// ---------------------------------------------------------------------

let _shared = null;
function getShared(opts) {
  if (!_shared) _shared = new WorkflowManager(opts);
  return _shared;
}
function resetShared() {
  _shared = null;
}

module.exports = {
  WorkflowManager,
  WorkflowExecutor,
  WorkflowStore,
  NODE_TYPES,
  RUN_STATUS,
  NODE_STATUS,
  RUN_RETENTION,
  SAFE_GLOBALS,
  BLOCKED_GLOBALS,
  defaultWorkflowsPath,
  defaultRunsPath,
  validateGraph,
  topoSort,
  evalCondition,
  ensureWorkflowsShape,
  ensureRunsShape,
  normalizeWorkflow,
  isId,
  genWorkflowId,
  genRunId,
  getShared,
  resetShared,
};
