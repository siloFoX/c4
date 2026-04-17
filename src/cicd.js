'use strict';

// (10.4) CI/CD pipeline integration.
//
// Pipeline definitions live at ~/.c4/cicd.json (overridable via
// config.cicd.path). Each pipeline binds triggers (pr.opened,
// pr.merged, merge.main, tag.created, pr.closed) to actions:
//   - worker.task     spawn a c4 worker running a task template
//   - workflow.trigger  fire a GitHub Actions workflow_dispatch
//
// The module is pure storage + dispatch. Worker creation flows through
// an injected `dispatchWorker` callback so tests run without the daemon,
// and GitHub API calls flow through an injected `fetch` so tests can
// assert the request shape without network traffic.
//
// Webhook verification uses HMAC-SHA256 in the same format GitHub sends
// via X-Hub-Signature-256 ("sha256=<hex>"), compared timing-safely.

const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');

const PROVIDERS = Object.freeze(['github-actions', 'gitlab-ci', 'jenkins']);
const TRIGGERS = Object.freeze([
  'pr.opened',
  'pr.merged',
  'pr.closed',
  'merge.main',
  'tag.created',
]);
const ACTION_TYPES = Object.freeze(['worker.task', 'workflow.trigger']);

function defaultCicdPath() {
  return path.join(os.homedir(), '.c4', 'cicd.json');
}

function genId() {
  return 'pipe_' + crypto.randomBytes(5).toString('hex');
}

function isNonEmptyString(s) {
  return typeof s === 'string' && s.length > 0;
}

// HMAC-SHA256 verification matching GitHub's X-Hub-Signature-256 header
// ("sha256=<hex digest>"). timingSafeEqual guards against leaking byte
// positions via early-exit compare; length mismatch is pre-checked so
// timingSafeEqual never throws at runtime.
function verifySignature(secret, body, signatureHeader) {
  if (!isNonEmptyString(secret)) return false;
  if (!isNonEmptyString(signatureHeader)) return false;
  const bodyStr = typeof body === 'string'
    ? body
    : Buffer.isBuffer(body) ? body.toString('utf8') : JSON.stringify(body);
  const expected = 'sha256=' + crypto.createHmac('sha256', secret).update(bodyStr).digest('hex');
  try {
    const a = Buffer.from(expected);
    const b = Buffer.from(signatureHeader);
    if (a.length !== b.length) return false;
    return crypto.timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

// Translate a GitHub webhook (X-GitHub-Event header + JSON payload)
// into the internal event name. Returns null for events we do not
// route, so the daemon can answer 400 "unknown event".
function parseGithubEvent(eventHeader, payload) {
  const p = payload && typeof payload === 'object' ? payload : {};
  if (eventHeader === 'pull_request') {
    const action = p.action;
    if (action === 'opened' || action === 'reopened') return 'pr.opened';
    if (action === 'closed') {
      const pr = p.pull_request || {};
      if (pr.merged === true) return 'pr.merged';
      return 'pr.closed';
    }
    return null;
  }
  if (eventHeader === 'push') {
    const ref = p.ref || '';
    if (ref === 'refs/heads/main' || ref === 'refs/heads/master') return 'merge.main';
    return null;
  }
  if (eventHeader === 'create') {
    if (p.ref_type === 'tag') return 'tag.created';
    return null;
  }
  return null;
}

// Standard GitHub Actions workflow_dispatch body. `ref` is required by
// GitHub; `inputs` is optional and must be an object. The daemon, CLI,
// and tests all share this builder so the wire shape stays in sync.
function buildGithubPayload(opts) {
  const o = opts && typeof opts === 'object' ? opts : {};
  const out = { ref: isNonEmptyString(o.ref) ? o.ref : 'main' };
  if (o.inputs && typeof o.inputs === 'object' && !Array.isArray(o.inputs)) {
    out.inputs = { ...o.inputs };
  }
  return out;
}

function sanitizeTriggers(triggers) {
  if (!Array.isArray(triggers)) return [];
  const seen = new Set();
  const out = [];
  for (const t of triggers) {
    if (TRIGGERS.includes(t) && !seen.has(t)) {
      seen.add(t);
      out.push(t);
    }
  }
  return out;
}

function sanitizeActions(actions) {
  if (!Array.isArray(actions)) return [];
  const out = [];
  for (const a of actions) {
    if (!a || typeof a !== 'object') continue;
    if (a.type === 'worker.task') {
      out.push({
        type: 'worker.task',
        template: isNonEmptyString(a.template) ? a.template : '',
        profile: isNonEmptyString(a.profile) ? a.profile : '',
        branch: isNonEmptyString(a.branch) ? a.branch : '',
      });
    } else if (a.type === 'workflow.trigger') {
      out.push({
        type: 'workflow.trigger',
        workflow: isNonEmptyString(a.workflow) ? a.workflow : '',
        inputs: (a.inputs && typeof a.inputs === 'object' && !Array.isArray(a.inputs))
          ? { ...a.inputs }
          : {},
      });
    }
  }
  return out;
}

function normalizePipeline(p) {
  if (!p || typeof p !== 'object') return null;
  const repo = isNonEmptyString(p.repo) ? p.repo : '';
  if (!repo) return null;
  return {
    id: isNonEmptyString(p.id) ? p.id : genId(),
    name: isNonEmptyString(p.name) ? p.name : (p.id || repo),
    provider: PROVIDERS.includes(p.provider) ? p.provider : 'github-actions',
    repo,
    workflow: isNonEmptyString(p.workflow) ? p.workflow : '',
    triggers: sanitizeTriggers(p.triggers),
    actions: sanitizeActions(p.actions),
    createdAt: isNonEmptyString(p.createdAt) ? p.createdAt : new Date().toISOString(),
  };
}

class CicdManager {
  constructor(opts) {
    const o = opts && typeof opts === 'object' ? opts : {};
    this.storePath = isNonEmptyString(o.storePath) ? o.storePath : defaultCicdPath();
    this.webhookSecret = isNonEmptyString(o.webhookSecret) ? o.webhookSecret : '';
    this.repos = Array.isArray(o.repos) ? o.repos.slice() : [];
    this.defaultProvider = PROVIDERS.includes(o.defaultProvider)
      ? o.defaultProvider
      : 'github-actions';
    this.fetchImpl = typeof o.fetch === 'function'
      ? o.fetch
      : (typeof fetch === 'function' ? fetch.bind(globalThis) : null);
    this.dispatchWorker = typeof o.dispatchWorker === 'function' ? o.dispatchWorker : null;
    this._state = null;
  }

  _load() {
    if (this._state) return this._state;
    if (!fs.existsSync(this.storePath)) {
      this._state = { pipelines: {} };
      return this._state;
    }
    try {
      const raw = fs.readFileSync(this.storePath, 'utf8');
      const parsed = raw && raw.length > 0 ? JSON.parse(raw) : {};
      const pipelines = {};
      if (parsed && parsed.pipelines && typeof parsed.pipelines === 'object') {
        for (const [id, rec] of Object.entries(parsed.pipelines)) {
          const norm = normalizePipeline(Object.assign({}, rec, { id }));
          if (norm) pipelines[norm.id] = norm;
        }
      }
      this._state = { pipelines };
    } catch {
      this._state = { pipelines: {} };
    }
    return this._state;
  }

  _persist() {
    const dir = path.dirname(this.storePath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(this.storePath, JSON.stringify(this._state, null, 2) + '\n');
  }

  reload() {
    this._state = null;
    return this._load();
  }

  registerPipeline(input) {
    if (!input || typeof input !== 'object') throw new Error('Pipeline input required');
    if (!isNonEmptyString(input.repo)) throw new Error('Pipeline repo is required');
    const state = this._load();
    const pipeline = normalizePipeline({
      id: input.id,
      name: input.name,
      provider: input.provider || this.defaultProvider,
      repo: input.repo,
      workflow: input.workflow,
      triggers: input.triggers,
      actions: input.actions,
      createdAt: input.createdAt,
    });
    if (!pipeline) throw new Error('Pipeline input rejected');
    state.pipelines[pipeline.id] = pipeline;
    this._persist();
    return pipeline;
  }

  listPipelines() {
    const state = this._load();
    return Object.values(state.pipelines).sort((a, b) => {
      const ac = a.createdAt || '';
      const bc = b.createdAt || '';
      if (ac !== bc) return ac < bc ? -1 : 1;
      return String(a.id).localeCompare(String(b.id));
    });
  }

  getPipeline(id) {
    const state = this._load();
    return state.pipelines[id] || null;
  }

  deletePipeline(id) {
    const state = this._load();
    if (!state.pipelines[id]) return false;
    delete state.pipelines[id];
    this._persist();
    return true;
  }

  // handleWebhook(event, payload) -> {event, matched, dispatched:[{pipelineId, actions:[...]}]}
  // `event` is the internal name (see TRIGGERS). `payload` is the
  // provider payload so actions can read PR number, branch, tag, etc.
  // Every action execution either returns a result record (worker spec
  // or triggered workflow body) or a {skipped, error} shape — the
  // caller never needs to catch; failures stay structured for logging.
  handleWebhook(event, payload) {
    if (!isNonEmptyString(event)) return { error: 'Missing event' };
    if (!TRIGGERS.includes(event)) return { error: 'Unknown event: ' + event };
    const state = this._load();
    const matched = Object.values(state.pipelines).filter((p) => p.triggers.includes(event));
    const dispatched = [];
    for (const pipeline of matched) {
      const executed = [];
      for (const action of pipeline.actions) {
        if (action.type === 'worker.task') {
          const branchGuess = action.branch || this._branchFromPayload(event, payload);
          const spec = {
            task: this._renderTemplate(action.template, { pipeline, event, payload, branch: branchGuess }),
            template: action.template,
            profile: action.profile,
            branch: branchGuess,
            pipeline: pipeline.id,
            repo: pipeline.repo,
          };
          if (this.dispatchWorker) {
            try {
              spec.result = this.dispatchWorker(Object.assign({ event, payload }, spec));
            } catch (e) {
              spec.error = e.message;
            }
          }
          executed.push({ type: action.type, spec });
        } else if (action.type === 'workflow.trigger') {
          const tokenEntry = this._repoToken(pipeline.repo);
          if (!tokenEntry) {
            executed.push({ type: action.type, skipped: 'no token for repo', repo: pipeline.repo });
            continue;
          }
          try {
            const ref = this._branchFromPayload(event, payload) || 'main';
            const merged = Object.assign({}, action.inputs || {});
            const trigger = this.triggerWorkflow(pipeline.repo, action.workflow, merged, { ref });
            executed.push({ type: action.type, workflow: action.workflow, triggered: true, trigger });
          } catch (e) {
            executed.push({ type: action.type, error: e.message });
          }
        }
      }
      dispatched.push({ pipelineId: pipeline.id, actions: executed });
    }
    return { event, matched: matched.length, dispatched };
  }

  _renderTemplate(template, ctx) {
    const base = isNonEmptyString(template) ? template : 'Run CI action';
    const parts = [base];
    if (ctx && ctx.pipeline && ctx.pipeline.repo) parts.push('repo=' + ctx.pipeline.repo);
    if (ctx && ctx.event) parts.push('event=' + ctx.event);
    if (ctx && ctx.branch) parts.push('branch=' + ctx.branch);
    return parts.join(' ');
  }

  _branchFromPayload(event, payload) {
    const p = payload && typeof payload === 'object' ? payload : {};
    if (event === 'pr.opened' || event === 'pr.merged' || event === 'pr.closed') {
      const pr = p.pull_request || {};
      if (pr.head && isNonEmptyString(pr.head.ref)) return pr.head.ref;
      return '';
    }
    if (event === 'merge.main') {
      if (typeof p.ref === 'string' && p.ref.startsWith('refs/heads/')) {
        return p.ref.slice('refs/heads/'.length);
      }
      return 'main';
    }
    if (event === 'tag.created') {
      if (isNonEmptyString(p.ref)) return p.ref;
      return '';
    }
    return '';
  }

  _repoToken(repoFullName) {
    if (!Array.isArray(this.repos)) return null;
    for (const entry of this.repos) {
      if (entry && entry.name === repoFullName && isNonEmptyString(entry.token)) return entry;
    }
    return null;
  }

  // Build + dispatch a GitHub Actions workflow_dispatch. Returns the
  // request record synchronously (so tests can inspect url/body); the
  // actual POST flies through `fetchImpl` if configured. fetchImpl is
  // injected by the daemon (wrapping global fetch) or by tests (a mock
  // that records calls).
  triggerWorkflow(repo, workflow, inputs, opts) {
    if (!isNonEmptyString(repo)) throw new Error('repo is required');
    if (!isNonEmptyString(workflow)) throw new Error('workflow is required');
    const o = opts && typeof opts === 'object' ? opts : {};
    const entry = this._repoToken(repo);
    if (!entry) throw new Error('No token configured for repo: ' + repo);
    const ref = isNonEmptyString(o.ref) ? o.ref : 'main';
    const url = 'https://api.github.com/repos/' + repo
      + '/actions/workflows/' + encodeURIComponent(workflow) + '/dispatches';
    const body = buildGithubPayload({ ref, inputs });
    const record = {
      url,
      method: 'POST',
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: 'Bearer ' + entry.token,
        'X-GitHub-Api-Version': '2022-11-28',
        'Content-Type': 'application/json',
      },
      body,
    };
    if (this.fetchImpl) {
      try {
        record.request = this.fetchImpl(url, {
          method: 'POST',
          headers: record.headers,
          body: JSON.stringify(body),
        });
      } catch (e) {
        record.error = e.message;
      }
    }
    return record;
  }

  // runCheck(branch, checkName) -> worker task spec. The daemon wires
  // dispatchWorker so this actually spawns a c4 worker; tests inspect
  // the spec directly without touching PTY state.
  runCheck(branch, checkName, opts) {
    if (!isNonEmptyString(branch)) throw new Error('branch is required');
    if (!isNonEmptyString(checkName)) throw new Error('checkName is required');
    const o = opts && typeof opts === 'object' ? opts : {};
    const spec = {
      task: 'Run CI check ' + checkName + ' on branch ' + branch,
      branch,
      checkName,
      profile: isNonEmptyString(o.profile) ? o.profile : '',
      template: isNonEmptyString(o.template) ? o.template : '',
    };
    if (this.dispatchWorker) {
      try {
        spec.result = this.dispatchWorker(Object.assign({ event: 'runCheck' }, spec));
      } catch (e) {
        spec.error = e.message;
      }
    }
    return spec;
  }

  // Apply a fresh config snapshot without recreating the manager (so
  // the daemon keeps its shared instance on /config/reload). Does not
  // touch storePath — that is constructor-only.
  applyConfig(cicdCfg) {
    const c = cicdCfg && typeof cicdCfg === 'object' ? cicdCfg : {};
    this.webhookSecret = isNonEmptyString(c.webhooks && c.webhooks.secret)
      ? c.webhooks.secret
      : '';
    this.repos = Array.isArray(c.repos) ? c.repos.slice() : [];
    if (PROVIDERS.includes(c.provider)) this.defaultProvider = c.provider;
  }
}

let _shared = null;
function getShared(opts) {
  if (!_shared) _shared = new CicdManager(opts);
  return _shared;
}
function resetShared() {
  _shared = null;
}

module.exports = {
  CicdManager,
  PROVIDERS,
  TRIGGERS,
  ACTION_TYPES,
  defaultCicdPath,
  verifySignature,
  parseGithubEvent,
  buildGithubPayload,
  normalizePipeline,
  sanitizeTriggers,
  sanitizeActions,
  isNonEmptyString,
  getShared,
  resetShared,
};
