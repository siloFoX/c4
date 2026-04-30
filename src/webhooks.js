// 10.4 CI/CD webhook receiver. GitHub-style + GitLab-style. Verifies the
// shared secret, parses the event, and turns it into a c4 task via the
// dispatcher (or a local sendTask).
//
// Supported events:
//   - GitHub `pull_request` (action: opened, synchronize, reopened) →
//       review worker spawned with --branch c4/review-pr-<n>
//   - GitHub `push` to default branch → optional deploy worker
//   - GitLab `Merge Request Hook` and `Push Hook` → same shape
//
// Off by default. Enable with `config.cicd.enabled = true` and set
// `config.cicd.secret` (used to verify HMAC SHA-256 over the raw body).

'use strict';

const crypto = require('crypto');

class CicdWebhooks {
  constructor(manager) {
    this.manager = manager;
  }

  _config() {
    return (this.manager.config && this.manager.config.cicd) || {};
  }

  // Verify GitHub `X-Hub-Signature-256: sha256=...` header against `secret`.
  _verifyGitHub(headers, rawBody) {
    const cfg = this._config();
    if (!cfg.secret) return false;
    const sig = headers['x-hub-signature-256'];
    if (!sig || !sig.startsWith('sha256=')) return false;
    const expected = 'sha256=' + crypto.createHmac('sha256', cfg.secret)
      .update(rawBody).digest('hex');
    try {
      return crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
    } catch { return false; }
  }

  // GitLab uses `X-Gitlab-Token` (plaintext shared secret).
  _verifyGitLab(headers) {
    const cfg = this._config();
    if (!cfg.secret) return false;
    const token = headers['x-gitlab-token'];
    return token === cfg.secret;
  }

  // Main entry point — daemon hands us (vendor, headers, rawBody, parsedBody).
  async handle(vendor, headers, rawBody, body) {
    const cfg = this._config();
    if (cfg.enabled === false) return { error: 'cicd disabled' };

    if (vendor === 'github') {
      if (!this._verifyGitHub(headers, rawBody)) return { error: 'github signature invalid' };
      const event = headers['x-github-event'];
      return this._dispatchGitHub(event, body);
    }
    if (vendor === 'gitlab') {
      if (!this._verifyGitLab(headers)) return { error: 'gitlab token invalid' };
      const event = (headers['x-gitlab-event'] || '').replace(' Hook', '').toLowerCase();
      return this._dispatchGitLab(event, body);
    }
    return { error: `unknown vendor: ${vendor}` };
  }

  async _dispatchGitHub(event, body) {
    const cfg = this._config();
    if (event === 'pull_request' && body.pull_request) {
      const action = body.action;
      if (!['opened', 'synchronize', 'reopened'].includes(action)) {
        return { skipped: true, reason: `pull_request action ignored: ${action}` };
      }
      const pr = body.pull_request;
      const task = `Review pull request #${pr.number} on ${body.repository?.full_name}: ${pr.title}\n\n${pr.body || ''}`;
      const branch = `c4/review-pr-${pr.number}`;
      return this._runTask({ task, branch, tags: cfg.reviewTags || ['review'] });
    }
    if (event === 'push' && body.ref && body.repository?.default_branch) {
      const isDefault = body.ref === `refs/heads/${body.repository.default_branch}`;
      if (!isDefault || !cfg.deployTask) return { skipped: true };
      return this._runTask({
        task: cfg.deployTask,
        branch: `c4/deploy-${body.after.slice(0, 7)}`,
        tags: cfg.deployTags || ['deploy'],
      });
    }
    return { skipped: true, reason: `unhandled github event: ${event}` };
  }

  async _dispatchGitLab(event, body) {
    const cfg = this._config();
    if (event === 'merge request' && body.object_attributes) {
      const mr = body.object_attributes;
      if (!['open', 'reopen', 'update'].includes(mr.action)) {
        return { skipped: true, reason: `mr action ignored: ${mr.action}` };
      }
      const task = `Review merge request !${mr.iid}: ${mr.title}\n\n${mr.description || ''}`;
      const branch = `c4/review-mr-${mr.iid}`;
      return this._runTask({ task, branch, tags: cfg.reviewTags || ['review'] });
    }
    if (event === 'push' && body.ref) {
      const isDefault = body.ref === `refs/heads/${body.project?.default_branch}`;
      if (!isDefault || !cfg.deployTask) return { skipped: true };
      return this._runTask({
        task: cfg.deployTask,
        branch: `c4/deploy-${(body.after || '').slice(0, 7)}`,
        tags: cfg.deployTags || ['deploy'],
      });
    }
    return { skipped: true, reason: `unhandled gitlab event: ${event}` };
  }

  async _runTask({ task, branch, tags }) {
    if (typeof this.manager.dispatch === 'function') {
      return this.manager.dispatch({ task, tags, strategy: 'least-load', branch });
    }
    if (typeof this.manager.sendTask === 'function') {
      const name = `cicd-${Date.now().toString(36)}`;
      if (this.manager.create) this.manager.create(name, 'claude', [], {});
      return this.manager.sendTask(name, task, { branch });
    }
    return { error: 'manager has no dispatch/sendTask' };
  }
}

module.exports = CicdWebhooks;
