const { describe, test, beforeEach } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const hook = require('../src/post-compact-hook');

describe('post-compact-hook / detectCompactEvent', () => {
  test('matches the "Context compacted" marker', () => {
    const result = hook.detectCompactEvent('... Context compacted. Summary below ...');
    assert.strictEqual(result.fired, true);
    assert.ok(result.pattern);
    assert.ok(Number.isFinite(result.at));
  });

  test('matches "Conversation was compacted" verbiage', () => {
    const result = hook.detectCompactEvent('Conversation was compacted to 2000 tokens.');
    assert.strictEqual(result.fired, true);
  });

  test('matches "/compact complete" confirmation', () => {
    const result = hook.detectCompactEvent('user ran /compact complete  ');
    assert.strictEqual(result.fired, true);
  });

  test('matches "Compacting conversation" progress text', () => {
    const result = hook.detectCompactEvent('Compacting conversation...');
    assert.strictEqual(result.fired, true);
  });

  test('matches "Previous Conversation Compacted" banner', () => {
    const result = hook.detectCompactEvent('=== Previous Conversation Compacted ===');
    assert.strictEqual(result.fired, true);
  });

  test('does not fire on unrelated screen chatter', () => {
    const result = hook.detectCompactEvent('npm install finished. All packages up to date.');
    assert.strictEqual(result.fired, false);
  });

  test('does not fire on empty / null chunks', () => {
    assert.strictEqual(hook.detectCompactEvent('').fired, false);
    assert.strictEqual(hook.detectCompactEvent(null).fired, false);
    assert.strictEqual(hook.detectCompactEvent(undefined).fired, false);
  });

  test('debounces repeat markers within the window', () => {
    const now = 1_700_000_000_000;
    const state = { lastFiredAt: now - 5_000, debounceMs: 60_000, now };
    const result = hook.detectCompactEvent('Context compacted', state);
    assert.strictEqual(result.fired, false);
    assert.strictEqual(result.suppressed, true);
    assert.strictEqual(result.reason, 'debounce');
  });

  test('re-fires once the debounce window has elapsed', () => {
    const now = 1_700_000_000_000;
    const state = { lastFiredAt: now - 70_000, debounceMs: 60_000, now };
    const result = hook.detectCompactEvent('Context compacted', state);
    assert.strictEqual(result.fired, true);
    assert.strictEqual(result.at, now);
  });

  test('accepts Buffer input', () => {
    const buf = Buffer.from('... Context compacted ...');
    const result = hook.detectCompactEvent(buf);
    assert.strictEqual(result.fired, true);
  });
});

describe('post-compact-hook / resolveWorkerType', () => {
  test('managers are tagged via _autoWorker', () => {
    assert.strictEqual(hook.resolveWorkerType({ _autoWorker: true }), 'manager');
  });

  test('managers are tagged via tier=manager', () => {
    assert.strictEqual(hook.resolveWorkerType({ tier: 'manager' }), 'manager');
  });

  test('attached sessions are tagged via kind', () => {
    assert.strictEqual(hook.resolveWorkerType({ kind: 'attached' }), 'attached');
  });

  test('attached sessions are tagged via tier=attached', () => {
    assert.strictEqual(hook.resolveWorkerType({ tier: 'attached' }), 'attached');
  });

  test('default role is worker', () => {
    assert.strictEqual(hook.resolveWorkerType({}), 'worker');
    assert.strictEqual(hook.resolveWorkerType(null), 'worker');
  });
});

describe('post-compact-hook / getRuleTemplate', () => {
  let tmp;

  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'c4-rules-'));
    fs.writeFileSync(path.join(tmp, 'manager-post-compact.md'), '# manager rules\n');
    fs.writeFileSync(path.join(tmp, 'worker-post-compact.md'), '# worker rules\n');
  });

  test('resolves manager template', () => {
    const t = hook.getRuleTemplate('manager', { templateDir: tmp });
    assert.ok(t.content.includes('manager rules'));
    assert.strictEqual(t.fallback, false);
    assert.ok(t.path.endsWith('manager-post-compact.md'));
  });

  test('falls back to worker template when role-specific file is missing', () => {
    const t = hook.getRuleTemplate('attached', { templateDir: tmp });
    assert.ok(t.content.includes('worker rules'));
    assert.strictEqual(t.fallback, true);
  });

  test('returns null content when no template file exists', () => {
    const emptyDir = fs.mkdtempSync(path.join(os.tmpdir(), 'c4-rules-empty-'));
    const t = hook.getRuleTemplate('manager', { templateDir: emptyDir });
    assert.strictEqual(t.content, null);
    assert.strictEqual(t.path, null);
  });

  test('invalid worker type falls through to worker template', () => {
    const t = hook.getRuleTemplate('', { templateDir: tmp });
    assert.ok(t.content);
  });

  test('default templateDir points at docs/rules in repo', () => {
    // Sanity: the real templates ship in the repo and load without
    // an override, proving the DEFAULT_TEMPLATE_DIR path is right.
    const t = hook.getRuleTemplate('worker');
    assert.ok(t.content, 'expected worker-post-compact.md to resolve by default');
  });
});

describe('post-compact-hook / buildBanner + buildPayload', () => {
  test('banner includes role + worker name + timestamp', () => {
    const banner = hook.buildBanner('manager', 'auto-mgr', 1_700_000_000_000);
    assert.ok(banner.includes('MANAGER'));
    assert.ok(banner.includes('auto-mgr'));
    assert.ok(banner.includes('2023-11-14'));
    assert.ok(banner.includes('rules received'));
  });

  test('payload concatenates banner + template body with newline gap', () => {
    const p = hook.buildPayload('# body', 'BANNER');
    assert.ok(p.startsWith('BANNER'));
    assert.ok(p.includes('\n\n# body'));
  });
});

describe('post-compact-hook / injectRules', () => {
  let tmp;

  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'c4-rules-inject-'));
    fs.writeFileSync(path.join(tmp, 'manager-post-compact.md'), '# manager rules body\n');
    fs.writeFileSync(path.join(tmp, 'worker-post-compact.md'), '# worker rules body\n');
  });

  function makeManager(worker) {
    const calls = [];
    return {
      calls,
      workers: new Map([[worker.name, worker]]),
      async send(name, text, isSpecialKey) {
        calls.push({ name, text, isSpecialKey });
        return { success: true };
      },
    };
  }

  test('sends banner + template body through manager.send', async () => {
    const worker = { name: 'auto-mgr', _autoWorker: true, snapshots: [] };
    const mgr = makeManager(worker);
    const result = await hook.injectRules(mgr, 'auto-mgr', { templateDir: tmp });
    assert.strictEqual(result.injected, true);
    assert.strictEqual(result.workerType, 'manager');
    assert.strictEqual(mgr.calls.length, 1);
    assert.strictEqual(mgr.calls[0].name, 'auto-mgr');
    assert.ok(mgr.calls[0].text.includes('C4 POST-COMPACT RULE RE-INJECTION'));
    assert.ok(mgr.calls[0].text.includes('manager rules body'));
    assert.strictEqual(mgr.calls[0].isSpecialKey, false);
  });

  test('records a snapshot entry so readers see the injection in-band', async () => {
    const worker = { name: 'w1', snapshots: [] };
    const mgr = makeManager(worker);
    const result = await hook.injectRules(mgr, 'w1', { templateDir: tmp });
    assert.strictEqual(result.injected, true);
    assert.strictEqual(worker.snapshots.length, 1);
    assert.ok(worker.snapshots[0].screen.includes('rules re-injected'));
  });

  test('reports error when worker is unknown', async () => {
    const mgr = makeManager({ name: 'exists', snapshots: [] });
    const result = await hook.injectRules(mgr, 'missing', { templateDir: tmp });
    assert.strictEqual(result.injected, false);
    assert.ok(/not found/i.test(result.error));
  });

  test('reports error when no template matches', async () => {
    const worker = { name: 'w1', snapshots: [] };
    const mgr = makeManager(worker);
    const empty = fs.mkdtempSync(path.join(os.tmpdir(), 'c4-rules-empty2-'));
    const result = await hook.injectRules(mgr, 'w1', { templateDir: empty });
    assert.strictEqual(result.injected, false);
    assert.ok(/No template/i.test(result.error));
  });

  test('attached sessions receive the attached template without fallback', async () => {
    fs.writeFileSync(path.join(tmp, 'attached-post-compact.md'), '# attached rules body\n');
    const worker = { name: 'att-1', kind: 'attached', snapshots: [] };
    const mgr = makeManager(worker);
    const result = await hook.injectRules(mgr, 'att-1', { templateDir: tmp });
    assert.strictEqual(result.workerType, 'attached');
    assert.strictEqual(result.fallback, false);
    assert.ok(mgr.calls[0].text.includes('attached rules body'));
  });
});

describe('post-compact-hook / drift detection', () => {
  test('matches compound && chain', () => {
    const d = hook.detectDrift('cd /tmp && git status');
    assert.ok(d);
    assert.strictEqual(d.name, 'and-chain');
  });

  test('matches pipeline', () => {
    const d = hook.detectDrift('ps aux | grep claude');
    assert.ok(d);
    assert.strictEqual(d.name, 'pipe');
  });

  test('rejects || as compound-or not single pipe', () => {
    const d = hook.detectDrift('echo a || echo b');
    assert.ok(d);
    assert.strictEqual(d.name, 'or-chain');
  });

  test('matches semicolon chain followed by a word', () => {
    const d = hook.detectDrift('true; ls /tmp');
    assert.ok(d);
    assert.strictEqual(d.name, 'semicolon');
  });

  test('matches sleep-based polling', () => {
    const d = hook.detectDrift('sleep 5; c4 read-now w1');
    assert.ok(d);
    // sleep pattern is preferred over semicolon when both match
    assert.ok(['sleep-poll', 'semicolon', 'cd-then-git'].includes(d.name));
  });

  test('matches cd then git compound', () => {
    const d = hook.detectDrift('cd /root/c4-worktree-foo && git log --oneline');
    assert.ok(d);
  });

  test('allows a plain safe command', () => {
    assert.strictEqual(hook.detectDrift('git -C /root/c4 status'), null);
    assert.strictEqual(hook.detectDrift('npm test'), null);
    assert.strictEqual(hook.detectDrift(''), null);
    assert.strictEqual(hook.detectDrift(null), null);
  });

  test('for-loop and while-loop are flagged', () => {
    assert.ok(hook.detectDrift('for f in *.js; do echo $f; done'));
    assert.ok(hook.detectDrift('while read line; do echo $line; done'));
  });
});

describe('post-compact-hook / drift window', () => {
  test('armDriftWindow resets observed and drifts', () => {
    const state = hook.createDriftWindow();
    state.observed = 5;
    state.drifts = [{ name: 'stale' }];
    hook.armDriftWindow(state, { now: 42 });
    assert.strictEqual(state.active, true);
    assert.strictEqual(state.observed, 0);
    assert.deepStrictEqual(state.drifts, []);
    assert.strictEqual(state.openedAt, 42);
  });

  test('updateDriftWindow is a no-op when the window is not armed', () => {
    const state = hook.createDriftWindow();
    const obs = hook.updateDriftWindow(state, 'git status');
    assert.strictEqual(obs.inWindow, false);
    assert.strictEqual(obs.observed, 0);
  });

  test('window closes after N observations', () => {
    const state = hook.armDriftWindow(hook.createDriftWindow());
    const a = hook.updateDriftWindow(state, 'git status', { windowSize: 3 });
    const b = hook.updateDriftWindow(state, 'ls', { windowSize: 3 });
    const c = hook.updateDriftWindow(state, 'pwd', { windowSize: 3 });
    const d = hook.updateDriftWindow(state, 'cat file', { windowSize: 3 });
    assert.strictEqual(a.observed, 1);
    assert.strictEqual(b.observed, 2);
    assert.strictEqual(c.observed, 3);
    assert.strictEqual(c.closed, true);
    assert.strictEqual(d.inWindow, false);
  });

  test('drift hit inside the window surfaces the match', () => {
    const state = hook.armDriftWindow(hook.createDriftWindow());
    const obs = hook.updateDriftWindow(state, 'cd /x && git status', { windowSize: 3 });
    assert.ok(obs.drift);
    assert.strictEqual(obs.drift.name, 'and-chain');
    assert.strictEqual(state.drifts.length, 1);
  });

  test('multiple drift matches accumulate up to the window size', () => {
    const state = hook.armDriftWindow(hook.createDriftWindow());
    hook.updateDriftWindow(state, 'a && b', { windowSize: 3 });
    hook.updateDriftWindow(state, 'c || d', { windowSize: 3 });
    hook.updateDriftWindow(state, 'clean', { windowSize: 3 });
    assert.strictEqual(state.drifts.length, 2);
    assert.strictEqual(state.active, false);
  });
});
