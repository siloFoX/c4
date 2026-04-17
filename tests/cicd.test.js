// (10.4) CI/CD pipeline integration tests.
//
// Exercises the CicdManager core (storage, CRUD, webhook dispatch),
// the HMAC-SHA256 signature verifier, the GitHub event parser, the
// workflow_dispatch payload builder, and the config reload path. All
// fixtures use fs.mkdtempSync paths so the operator's real
// ~/.c4/cicd.json is never touched.

'use strict';
require('./jest-shim');

const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');

const {
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
} = require('../src/cicd');

function mkTmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'c4-cicd-test-'));
}

function newManager(overrides) {
  const dir = mkTmpDir();
  return new CicdManager(Object.assign({
    storePath: path.join(dir, 'cicd.json'),
  }, overrides || {}));
}

function signBody(secret, body) {
  const bodyStr = typeof body === 'string' ? body : JSON.stringify(body);
  return 'sha256=' + crypto.createHmac('sha256', secret).update(bodyStr).digest('hex');
}

describe('(10.4) CI/CD module exports', () => {
  test('(a) defaultCicdPath ends with ~/.c4/cicd.json', () => {
    const p = defaultCicdPath();
    expect(p.endsWith(path.join('.c4', 'cicd.json'))).toBe(true);
    expect(p.startsWith(os.homedir())).toBe(true);
  });

  test('(b) PROVIDERS covers github-actions + gitlab-ci + jenkins', () => {
    expect(PROVIDERS).toContain('github-actions');
    expect(PROVIDERS).toContain('gitlab-ci');
    expect(PROVIDERS).toContain('jenkins');
  });

  test('(c) TRIGGERS exposes canonical internal event names', () => {
    expect(TRIGGERS).toContain('pr.opened');
    expect(TRIGGERS).toContain('pr.merged');
    expect(TRIGGERS).toContain('merge.main');
    expect(TRIGGERS).toContain('tag.created');
    expect(TRIGGERS).toContain('pr.closed');
  });

  test('(d) ACTION_TYPES lists both action kinds', () => {
    expect(ACTION_TYPES).toContain('worker.task');
    expect(ACTION_TYPES).toContain('workflow.trigger');
    expect(ACTION_TYPES.length).toBe(2);
  });

  test('(e) isNonEmptyString validator handles empty / non-string', () => {
    expect(isNonEmptyString('x')).toBe(true);
    expect(isNonEmptyString('')).toBe(false);
    expect(isNonEmptyString(null)).toBe(false);
    expect(isNonEmptyString(undefined)).toBe(false);
    expect(isNonEmptyString(42)).toBe(false);
  });
});

describe('(10.4) verifySignature', () => {
  test('(a) accepts a correct sha256 HMAC', () => {
    const body = JSON.stringify({ hello: 'world' });
    const sig = signBody('topsecret', body);
    expect(verifySignature('topsecret', body, sig)).toBe(true);
  });

  test('(b) rejects when the secret differs', () => {
    const body = JSON.stringify({ hello: 'world' });
    const sig = signBody('topsecret', body);
    expect(verifySignature('other-secret', body, sig)).toBe(false);
  });

  test('(c) rejects when the body is altered', () => {
    const sig = signBody('s', JSON.stringify({ a: 1 }));
    expect(verifySignature('s', JSON.stringify({ a: 2 }), sig)).toBe(false);
  });

  test('(d) rejects when the header is missing or empty', () => {
    const body = JSON.stringify({ a: 1 });
    expect(verifySignature('s', body, '')).toBe(false);
    expect(verifySignature('s', body, null)).toBe(false);
    expect(verifySignature('s', body, undefined)).toBe(false);
  });

  test('(e) rejects when the secret is missing or empty', () => {
    const body = JSON.stringify({ a: 1 });
    const sig = signBody('', body);
    expect(verifySignature('', body, sig)).toBe(false);
    expect(verifySignature(null, body, sig)).toBe(false);
  });

  test('(f) does not throw on malformed header bytes', () => {
    const body = JSON.stringify({ a: 1 });
    expect(verifySignature('s', body, 'sha256=notahexstringatall')).toBe(false);
  });

  test('(g) accepts Buffer body input', () => {
    const bodyStr = JSON.stringify({ x: 1 });
    const buf = Buffer.from(bodyStr);
    const sig = signBody('secret', bodyStr);
    expect(verifySignature('secret', buf, sig)).toBe(true);
  });
});

describe('(10.4) parseGithubEvent', () => {
  test('(a) pull_request/opened -> pr.opened', () => {
    expect(parseGithubEvent('pull_request', { action: 'opened', pull_request: {} })).toBe('pr.opened');
  });

  test('(b) pull_request/closed with merged=true -> pr.merged', () => {
    expect(parseGithubEvent('pull_request', { action: 'closed', pull_request: { merged: true } })).toBe('pr.merged');
  });

  test('(c) pull_request/closed with merged=false -> pr.closed', () => {
    expect(parseGithubEvent('pull_request', { action: 'closed', pull_request: { merged: false } })).toBe('pr.closed');
  });

  test('(d) push on refs/heads/main -> merge.main', () => {
    expect(parseGithubEvent('push', { ref: 'refs/heads/main' })).toBe('merge.main');
    expect(parseGithubEvent('push', { ref: 'refs/heads/master' })).toBe('merge.main');
  });

  test('(e) push on non-main branch -> null', () => {
    expect(parseGithubEvent('push', { ref: 'refs/heads/feature' })).toBe(null);
  });

  test('(f) create with ref_type=tag -> tag.created', () => {
    expect(parseGithubEvent('create', { ref: 'v1.2.3', ref_type: 'tag' })).toBe('tag.created');
  });

  test('(g) create with ref_type=branch -> null', () => {
    expect(parseGithubEvent('create', { ref: 'foo', ref_type: 'branch' })).toBe(null);
  });

  test('(h) unrecognized header -> null', () => {
    expect(parseGithubEvent('ping', {})).toBe(null);
    expect(parseGithubEvent('', {})).toBe(null);
  });
});

describe('(10.4) buildGithubPayload', () => {
  test('(a) builds {ref} with default main when not provided', () => {
    expect(buildGithubPayload({})).toEqual({ ref: 'main' });
  });

  test('(b) respects custom ref and copies inputs as a new object', () => {
    const inputs = { env: 'staging', version: '1.2.3' };
    const payload = buildGithubPayload({ ref: 'develop', inputs });
    expect(payload.ref).toBe('develop');
    expect(payload.inputs).toEqual(inputs);
    expect(payload.inputs !== inputs).toBe(true);
  });

  test('(c) drops inputs when non-object or array', () => {
    const p1 = buildGithubPayload({ ref: 'main', inputs: null });
    expect(p1.inputs).toBeUndefined();
    const p2 = buildGithubPayload({ ref: 'main', inputs: [1, 2, 3] });
    expect(p2.inputs).toBeUndefined();
  });
});

describe('(10.4) normalizePipeline + sanitizers', () => {
  test('(a) normalizePipeline rejects missing repo', () => {
    expect(normalizePipeline({ name: 'x' })).toBe(null);
    expect(normalizePipeline(null)).toBe(null);
  });

  test('(b) normalizePipeline fills defaults for provider/name/createdAt', () => {
    const n = normalizePipeline({ repo: 'org/repo' });
    expect(n.repo).toBe('org/repo');
    expect(n.provider).toBe('github-actions');
    // name falls back to id, or to repo when id was not supplied.
    expect(n.name === n.id || n.name === 'org/repo').toBe(true);
    expect(typeof n.createdAt).toBe('string');
    expect(n.createdAt.length > 0).toBe(true);
  });

  test('(c) sanitizeTriggers drops unknown triggers + dedupes', () => {
    expect(sanitizeTriggers(['pr.opened', 'bogus', 'pr.opened', 'merge.main']))
      .toEqual(['pr.opened', 'merge.main']);
    expect(sanitizeTriggers(null)).toEqual([]);
  });

  test('(d) sanitizeActions drops unknown action types', () => {
    const out = sanitizeActions([
      { type: 'worker.task', template: 'Review PR' },
      { type: 'unknown.action', foo: 'bar' },
      { type: 'workflow.trigger', workflow: 'deploy.yml' },
      'garbage',
    ]);
    expect(out.length).toBe(2);
    expect(out[0].type).toBe('worker.task');
    expect(out[0].template).toBe('Review PR');
    expect(out[1].type).toBe('workflow.trigger');
    expect(out[1].workflow).toBe('deploy.yml');
  });

  test('(e) sanitizeActions copies workflow.trigger inputs as new object', () => {
    const inputs = { env: 'staging' };
    const out = sanitizeActions([{ type: 'workflow.trigger', workflow: 'w.yml', inputs }]);
    expect(out[0].inputs).toEqual(inputs);
    expect(out[0].inputs !== inputs).toBe(true);
  });
});

describe('(10.4) Pipeline CRUD', () => {
  test('(a) registerPipeline creates a pipeline and writes JSON', () => {
    const mgr = newManager();
    const p = mgr.registerPipeline({
      repo: 'org/repo',
      workflow: 'deploy.yml',
      triggers: ['merge.main'],
      actions: [{ type: 'workflow.trigger', workflow: 'deploy.yml' }],
      name: 'Main Deploy',
    });
    expect(p.id.length > 0).toBe(true);
    expect(p.repo).toBe('org/repo');
    expect(p.triggers).toEqual(['merge.main']);
    expect(fs.existsSync(mgr.storePath)).toBe(true);
  });

  test('(b) registerPipeline rejects missing repo', () => {
    const mgr = newManager();
    let err = null;
    try { mgr.registerPipeline({}); } catch (e) { err = e; }
    expect(err instanceof Error).toBe(true);
    expect(/repo is required/i.test(err.message)).toBe(true);
  });

  test('(c) registerPipeline requires object input', () => {
    const mgr = newManager();
    let err = null;
    try { mgr.registerPipeline(null); } catch (e) { err = e; }
    expect(err instanceof Error).toBe(true);
  });

  test('(d) listPipelines returns stored pipelines sorted by createdAt', () => {
    const mgr = newManager();
    mgr.registerPipeline({ repo: 'a/a', createdAt: '2024-01-01T00:00:00.000Z' });
    mgr.registerPipeline({ repo: 'b/b', createdAt: '2024-01-02T00:00:00.000Z' });
    const list = mgr.listPipelines();
    expect(list.length).toBe(2);
    expect(list[0].repo).toBe('a/a');
    expect(list[1].repo).toBe('b/b');
  });

  test('(e) getPipeline returns null for unknown id', () => {
    const mgr = newManager();
    expect(mgr.getPipeline('missing')).toBe(null);
  });

  test('(f) deletePipeline removes it; second delete returns false', () => {
    const mgr = newManager();
    const p = mgr.registerPipeline({ repo: 'org/repo' });
    expect(mgr.deletePipeline(p.id)).toBe(true);
    expect(mgr.deletePipeline(p.id)).toBe(false);
    expect(mgr.getPipeline(p.id)).toBe(null);
  });

  test('(g) accepts an explicit id and preserves it across storage roundtrip', () => {
    const mgr = newManager();
    const p = mgr.registerPipeline({ id: 'my-pipe', repo: 'org/repo' });
    expect(p.id).toBe('my-pipe');
    const reopened = new CicdManager({ storePath: mgr.storePath });
    expect(reopened.getPipeline('my-pipe').repo).toBe('org/repo');
  });
});

describe('(10.4) Storage roundtrip', () => {
  test('(a) save-load-reload preserves pipelines across instances', () => {
    const dir = mkTmpDir();
    const storePath = path.join(dir, 'cicd.json');
    const mgr1 = new CicdManager({ storePath });
    const p1 = mgr1.registerPipeline({
      repo: 'org/r',
      workflow: 'ci.yml',
      triggers: ['pr.opened', 'merge.main'],
      actions: [
        { type: 'worker.task', template: 'Review', profile: 'web' },
        { type: 'workflow.trigger', workflow: 'deploy.yml', inputs: { env: 'prod' } },
      ],
    });
    const mgr2 = new CicdManager({ storePath });
    const loaded = mgr2.getPipeline(p1.id);
    expect(loaded).toBeDefined();
    expect(loaded.triggers).toEqual(['pr.opened', 'merge.main']);
    expect(loaded.actions.length).toBe(2);
    expect(loaded.actions[0].template).toBe('Review');
    expect(loaded.actions[1].inputs).toEqual({ env: 'prod' });
  });

  test('(b) reload() refreshes state from disk', () => {
    const mgr = newManager();
    mgr.registerPipeline({ id: 'first', repo: 'org/r' });
    // External editor tacks on a second pipeline manually.
    const raw = fs.readFileSync(mgr.storePath, 'utf8');
    const state = JSON.parse(raw);
    state.pipelines['second'] = {
      id: 'second', repo: 'org/r', provider: 'github-actions',
      triggers: [], actions: [], createdAt: '2024-02-02T00:00:00.000Z',
    };
    fs.writeFileSync(mgr.storePath, JSON.stringify(state));
    mgr.reload();
    expect(mgr.listPipelines().length).toBe(2);
    expect(mgr.getPipeline('second')).toBeDefined();
  });

  test('(c) missing file yields empty list (no crash)', () => {
    const dir = mkTmpDir();
    const mgr = new CicdManager({ storePath: path.join(dir, 'nope.json') });
    expect(mgr.listPipelines()).toEqual([]);
  });

  test('(d) malformed JSON yields empty state', () => {
    const dir = mkTmpDir();
    const p = path.join(dir, 'cicd.json');
    fs.writeFileSync(p, 'not-json');
    const mgr = new CicdManager({ storePath: p });
    expect(mgr.listPipelines()).toEqual([]);
  });
});

describe('(10.4) Event routing via handleWebhook', () => {
  test('(a) pr.opened triggers a worker.task action', () => {
    const dispatched = [];
    const mgr = newManager({
      dispatchWorker: (spec) => { dispatched.push(spec); return { worker: 'w1' }; },
    });
    mgr.registerPipeline({
      repo: 'org/repo',
      triggers: ['pr.opened'],
      actions: [{ type: 'worker.task', template: 'Review PR', profile: 'web' }],
    });
    const outcome = mgr.handleWebhook('pr.opened', {
      pull_request: { head: { ref: 'feature-1' } },
    });
    expect(outcome.matched).toBe(1);
    expect(outcome.dispatched.length).toBe(1);
    expect(outcome.dispatched[0].actions[0].type).toBe('worker.task');
    expect(outcome.dispatched[0].actions[0].spec.branch).toBe('feature-1');
    expect(dispatched.length).toBe(1);
    expect(dispatched[0].template).toBe('Review PR');
    expect(/Review PR/.test(dispatched[0].task)).toBe(true);
  });

  test('(b) merge.main triggers a workflow.trigger (deploy)', () => {
    const fetchCalls = [];
    const mgr = newManager({
      fetch: (url, opts) => { fetchCalls.push({ url, opts }); return Promise.resolve({ ok: true }); },
      repos: [{ name: 'org/repo', token: 'ghp_abc', defaultWorkflow: 'deploy.yml' }],
    });
    mgr.registerPipeline({
      repo: 'org/repo',
      triggers: ['merge.main'],
      actions: [{ type: 'workflow.trigger', workflow: 'deploy.yml', inputs: { env: 'prod' } }],
    });
    const outcome = mgr.handleWebhook('merge.main', { ref: 'refs/heads/main' });
    expect(outcome.matched).toBe(1);
    expect(outcome.dispatched[0].actions[0].triggered).toBe(true);
    expect(outcome.dispatched[0].actions[0].workflow).toBe('deploy.yml');
    expect(fetchCalls.length).toBe(1);
    expect(/deploy.yml/.test(fetchCalls[0].url)).toBe(true);
    const body = JSON.parse(fetchCalls[0].opts.body);
    expect(body.ref).toBe('main');
    expect(body.inputs).toEqual({ env: 'prod' });
  });

  test('(c) tag.created triggers a release workflow', () => {
    const fetchCalls = [];
    const mgr = newManager({
      fetch: (url, opts) => { fetchCalls.push({ url, opts }); return Promise.resolve({}); },
      repos: [{ name: 'org/repo', token: 'ghp_tag' }],
    });
    mgr.registerPipeline({
      repo: 'org/repo',
      triggers: ['tag.created'],
      actions: [{ type: 'workflow.trigger', workflow: 'release.yml' }],
    });
    const outcome = mgr.handleWebhook('tag.created', { ref: 'v1.0.0', ref_type: 'tag' });
    expect(outcome.matched).toBe(1);
    expect(outcome.dispatched[0].actions[0].triggered).toBe(true);
    expect(fetchCalls.length).toBe(1);
    const body = JSON.parse(fetchCalls[0].opts.body);
    expect(body.ref).toBe('v1.0.0');
  });

  test('(d) rejects unknown event names with an error', () => {
    const mgr = newManager();
    const outcome = mgr.handleWebhook('wat.event', {});
    expect(outcome.error).toBeDefined();
  });

  test('(e) missing token yields skipped action without throwing', () => {
    const mgr = newManager({
      repos: [], // no tokens registered
    });
    mgr.registerPipeline({
      repo: 'org/repo',
      triggers: ['merge.main'],
      actions: [{ type: 'workflow.trigger', workflow: 'deploy.yml' }],
    });
    const outcome = mgr.handleWebhook('merge.main', { ref: 'refs/heads/main' });
    expect(outcome.dispatched[0].actions[0].skipped).toBeDefined();
  });

  test('(f) handleWebhook returns matched=0 when no pipeline subscribes', () => {
    const mgr = newManager();
    mgr.registerPipeline({ repo: 'org/r', triggers: ['merge.main'], actions: [] });
    const outcome = mgr.handleWebhook('pr.opened', { pull_request: { head: { ref: 'x' } } });
    expect(outcome.matched).toBe(0);
    expect(outcome.dispatched.length).toBe(0);
  });
});

describe('(10.4) triggerWorkflow', () => {
  test('(a) builds the GitHub Actions URL with workflow + repo', () => {
    const mgr = newManager({
      fetch: () => Promise.resolve({}),
      repos: [{ name: 'org/repo', token: 'ghp_x' }],
    });
    const rec = mgr.triggerWorkflow('org/repo', 'deploy.yml', { env: 'prod' }, { ref: 'release/1.0' });
    expect(rec.url).toBe('https://api.github.com/repos/org/repo/actions/workflows/deploy.yml/dispatches');
    expect(rec.method).toBe('POST');
    expect(rec.body.ref).toBe('release/1.0');
    expect(rec.body.inputs).toEqual({ env: 'prod' });
  });

  test('(b) sets Authorization + Accept headers', () => {
    const mgr = newManager({
      fetch: () => Promise.resolve({}),
      repos: [{ name: 'org/repo', token: 'ghp_token' }],
    });
    const rec = mgr.triggerWorkflow('org/repo', 'deploy.yml', {}, {});
    expect(rec.headers.Authorization).toBe('Bearer ghp_token');
    expect(rec.headers.Accept).toBe('application/vnd.github+json');
    expect(rec.headers['X-GitHub-Api-Version']).toBe('2022-11-28');
  });

  test('(c) invokes fetchImpl with stringified body', () => {
    const captured = [];
    const mgr = newManager({
      fetch: (url, opts) => { captured.push({ url, opts }); return Promise.resolve({}); },
      repos: [{ name: 'org/repo', token: 'ghp_x' }],
    });
    mgr.triggerWorkflow('org/repo', 'deploy.yml', { a: 1 }, { ref: 'main' });
    expect(captured.length).toBe(1);
    expect(typeof captured[0].opts.body).toBe('string');
    expect(JSON.parse(captured[0].opts.body)).toEqual({ ref: 'main', inputs: { a: 1 } });
  });

  test('(d) throws when repo has no token', () => {
    const mgr = newManager({ repos: [] });
    let err = null;
    try { mgr.triggerWorkflow('org/repo', 'deploy.yml', {}, {}); } catch (e) { err = e; }
    expect(err instanceof Error).toBe(true);
    expect(/No token/i.test(err.message)).toBe(true);
  });

  test('(e) throws on missing repo or workflow', () => {
    const mgr = newManager({ repos: [{ name: 'org/repo', token: 't' }] });
    expect(() => mgr.triggerWorkflow('', 'deploy.yml', {}, {})).toThrow();
    expect(() => mgr.triggerWorkflow('org/repo', '', {}, {})).toThrow();
  });
});

describe('(10.4) runCheck', () => {
  test('(a) produces a worker task spec binding branch + check name', () => {
    const mgr = newManager();
    const spec = mgr.runCheck('feature-1', 'lint');
    expect(/lint/.test(spec.task)).toBe(true);
    expect(/feature-1/.test(spec.task)).toBe(true);
    expect(spec.branch).toBe('feature-1');
    expect(spec.checkName).toBe('lint');
  });

  test('(b) dispatchWorker callback receives the spec', () => {
    const seen = [];
    const mgr = newManager({
      dispatchWorker: (spec) => { seen.push(spec); return { ok: true }; },
    });
    mgr.runCheck('main', 'tests', { profile: 'web' });
    expect(seen.length).toBe(1);
    expect(seen[0].checkName).toBe('tests');
    expect(seen[0].branch).toBe('main');
    expect(seen[0].profile).toBe('web');
  });

  test('(c) throws on missing branch / checkName', () => {
    const mgr = newManager();
    expect(() => mgr.runCheck('', 'lint')).toThrow();
    expect(() => mgr.runCheck('main', '')).toThrow();
  });
});

describe('(10.4) applyConfig rebuilds manager surface', () => {
  test('(a) applyConfig updates secret + repos without losing pipelines', () => {
    const mgr = newManager();
    mgr.registerPipeline({ repo: 'org/r' });
    expect(mgr.webhookSecret).toBe('');
    mgr.applyConfig({
      webhooks: { secret: 's3cret' },
      repos: [{ name: 'org/r', token: 'ghp_new' }],
      provider: 'github-actions',
    });
    expect(mgr.webhookSecret).toBe('s3cret');
    expect(mgr.repos.length).toBe(1);
    expect(mgr.repos[0].token).toBe('ghp_new');
    expect(mgr.listPipelines().length).toBe(1);
  });

  test('(b) applyConfig drops repos when config clears them', () => {
    const mgr = newManager({ repos: [{ name: 'a', token: 't' }] });
    mgr.applyConfig({ webhooks: {}, repos: [] });
    expect(mgr.repos).toEqual([]);
    expect(mgr.webhookSecret).toBe('');
  });

  test('(c) applyConfig ignores invalid provider values', () => {
    const mgr = newManager();
    const before = mgr.defaultProvider;
    mgr.applyConfig({ provider: 'nope' });
    expect(mgr.defaultProvider).toBe(before);
  });
});

describe('(10.4) Shared singleton', () => {
  test('(a) getShared returns the same instance until reset', () => {
    resetShared();
    const a = getShared({ storePath: path.join(mkTmpDir(), 'cicd.json') });
    const b = getShared();
    expect(a).toBe(b);
    resetShared();
    const c = getShared({ storePath: path.join(mkTmpDir(), 'cicd.json') });
    expect(c !== a).toBe(true);
    resetShared();
  });
});
