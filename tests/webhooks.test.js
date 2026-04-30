// 10.4 CI/CD webhook tests.
// HMAC verification + event routing — uses a stub manager that records
// dispatch / sendTask calls.

'use strict';

const { describe, it } = require('node:test');
const assert = require('assert');
const crypto = require('crypto');

const CicdWebhooks = require('../src/webhooks');

function makeManager(cicdConfig = {}) {
  return {
    config: { cicd: { enabled: true, secret: 'topsecret', ...cicdConfig } },
    dispatchCalls: [],
    sendTaskCalls: [],
    dispatch: async function (args) { this.dispatchCalls.push(args); return { success: true }; },
    sendTask: async function (name, task, opts) { this.sendTaskCalls.push({ name, task, opts }); return { sent: true }; },
    create: () => ({}),
  };
}

function githubSig(body, secret) {
  return 'sha256=' + crypto.createHmac('sha256', secret).update(body).digest('hex');
}

describe('GitHub webhook (10.4)', () => {
  it('rejects when signature is missing', async () => {
    const wh = new CicdWebhooks(makeManager());
    const r = await wh.handle('github', { 'x-github-event': 'pull_request' }, '{}', {});
    assert.ok(r.error);
  });

  it('rejects forged signature', async () => {
    const wh = new CicdWebhooks(makeManager());
    const r = await wh.handle('github', {
      'x-github-event': 'pull_request',
      'x-hub-signature-256': 'sha256=00',
    }, '{}', {});
    assert.ok(r.error);
  });

  it('routes pull_request opened → dispatch with review tags', async () => {
    const mgr = makeManager();
    const wh = new CicdWebhooks(mgr);
    const body = {
      action: 'opened',
      pull_request: { number: 42, title: 'fix bug', body: 'desc' },
      repository: { full_name: 'org/repo' },
    };
    const raw = JSON.stringify(body);
    const r = await wh.handle('github', {
      'x-github-event': 'pull_request',
      'x-hub-signature-256': githubSig(raw, 'topsecret'),
    }, raw, body);
    assert.strictEqual(r.success, true);
    assert.strictEqual(mgr.dispatchCalls.length, 1);
    assert.strictEqual(mgr.dispatchCalls[0].branch, 'c4/review-pr-42');
    assert.ok(mgr.dispatchCalls[0].tags.includes('review'));
  });

  it('skips pull_request with unsupported action', async () => {
    const mgr = makeManager();
    const wh = new CicdWebhooks(mgr);
    const body = {
      action: 'closed',
      pull_request: { number: 1, title: 't' },
      repository: { full_name: 'o/r' },
    };
    const raw = JSON.stringify(body);
    const r = await wh.handle('github', {
      'x-github-event': 'pull_request',
      'x-hub-signature-256': githubSig(raw, 'topsecret'),
    }, raw, body);
    assert.ok(r.skipped);
    assert.strictEqual(mgr.dispatchCalls.length, 0);
  });
});

describe('GitLab webhook (10.4)', () => {
  it('rejects bad token', async () => {
    const wh = new CicdWebhooks(makeManager());
    const r = await wh.handle('gitlab', { 'x-gitlab-event': 'Merge Request Hook', 'x-gitlab-token': 'wrong' }, '{}', {});
    assert.ok(r.error);
  });

  it('routes merge request open → dispatch', async () => {
    const mgr = makeManager();
    const wh = new CicdWebhooks(mgr);
    const body = { object_attributes: { iid: 7, action: 'open', title: 'mr', description: 'd' } };
    const r = await wh.handle('gitlab', {
      'x-gitlab-event': 'Merge Request Hook',
      'x-gitlab-token': 'topsecret',
    }, JSON.stringify(body), body);
    assert.strictEqual(r.success, true);
    assert.strictEqual(mgr.dispatchCalls[0].branch, 'c4/review-mr-7');
  });
});

describe('disabled cicd', () => {
  it('rejects with "cicd disabled" when config.cicd.enabled=false', async () => {
    const mgr = makeManager({ enabled: false });
    const wh = new CicdWebhooks(mgr);
    const r = await wh.handle('github', {}, '{}', {});
    assert.ok(r.error && /disabled/.test(r.error));
  });
});
