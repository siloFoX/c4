'use strict';

const assert = require('assert');
const { describe, it } = require('node:test');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');
const { EventEmitter } = require('events');

const repoRoot = path.join(__dirname, '..');
const cliPath = path.join(repoRoot, 'src', 'cli.js');
const schedulerPath = path.join(repoRoot, 'src', 'pinned-memory-scheduler.js');
const rulesDir = path.join(repoRoot, 'docs', 'rules');

const {
  PinnedMemoryScheduler,
  REFRESH_PREFIX,
  DEFAULT_INTERVAL_MS,
  MIN_INTERVAL_MS,
  ROLE_TEMPLATES,
  clampInterval,
  resolveRoleTemplate,
  formatRefreshBlock,
} = require(schedulerPath);

// Run the CLI against a deliberately-unreachable daemon so every command
// fails at the network layer. That gives us a clean way to assert the
// pre-daemon flag parsing without spinning up a real daemon. Mirrors
// tests/batch.test.js.
function runCli(args, opts = {}) {
  try {
    const out = execSync(`node "${cliPath}" ${args}`, {
      encoding: 'utf8',
      stdio: 'pipe',
      timeout: 5000,
      env: { ...process.env, C4_URL: 'http://127.0.0.1:19999', ...(opts.env || {}) },
      cwd: opts.cwd,
    });
    return { code: 0, stdout: out, stderr: '' };
  } catch (e) {
    return {
      code: e.status || 1,
      stdout: (e.stdout || '').toString(),
      stderr: (e.stderr || '').toString(),
    };
  }
}

describe('Pinned memory (8.46)', () => {

  describe('role-<role>.md default templates', () => {
    it('ships role-manager, role-worker, role-attached templates', () => {
      for (const role of ['manager', 'worker', 'attached']) {
        const file = path.join(rulesDir, `role-${role}.md`);
        assert.ok(fs.existsSync(file), `expected ${file} to exist`);
        const text = fs.readFileSync(file, 'utf8');
        assert.ok(text.length > 50, `role-${role}.md must have real content`);
      }
    });

    it('ROLE_TEMPLATES maps every supported role', () => {
      assert.strictEqual(ROLE_TEMPLATES.manager, 'role-manager');
      assert.strictEqual(ROLE_TEMPLATES.worker, 'role-worker');
      assert.strictEqual(ROLE_TEMPLATES.attached, 'role-attached');
    });

    it('resolveRoleTemplate reads text for known roles', () => {
      const tpl = resolveRoleTemplate('manager', rulesDir);
      assert.ok(tpl);
      assert.strictEqual(tpl.name, 'role-manager');
      assert.ok(tpl.text.length > 0);
    });

    it('resolveRoleTemplate returns null for unknown roles', () => {
      assert.strictEqual(resolveRoleTemplate('nonsense', rulesDir), null);
      assert.strictEqual(resolveRoleTemplate('', rulesDir), null);
      assert.strictEqual(resolveRoleTemplate(null, rulesDir), null);
    });
  });

  describe('CLI parsing: c4 new --pin-memory / --pin-rules / --pin-role', () => {
    // The network call fails; we care about the flag parsing happening
    // before the request, which is visible in stderr (connection error) vs
    // a usage error (exits before parsing).
    it('accepts repeated --pin-rules without crashing the parser', () => {
      const r = runCli('new alpha --pin-rules "no compound" --pin-rules "use git -C"');
      // Should fail with a connection error, not a parse error.
      assert.notStrictEqual(
        r.code,
        0,
        'expected CLI to exit non-zero because daemon is unreachable'
      );
      assert.ok(
        !r.stderr.includes('Unknown option') &&
          !r.stderr.includes('Usage:'),
        `parsing must not error on --pin-rules; got: ${r.stderr}`
      );
    });

    it('accepts --pin-role without crashing the parser', () => {
      const r = runCli('new alpha --pin-role manager');
      assert.notStrictEqual(r.code, 0);
      assert.ok(!r.stderr.includes('Usage:'));
    });

    it('errors clearly when --pin-memory points to a missing file', () => {
      const r = runCli('new alpha --pin-memory /nonexistent/path/to/rules.md');
      assert.strictEqual(r.code, 1);
      assert.ok(
        /Error reading --pin-memory/.test(r.stderr),
        `expected --pin-memory file error; got stderr=${r.stderr}`
      );
    });

    it('reads --pin-memory file contents before calling the daemon', () => {
      const tmp = path.join(os.tmpdir(), `c4-pin-${Date.now()}.md`);
      fs.writeFileSync(tmp, 'rule A\nrule B');
      try {
        const r = runCli(`new alpha --pin-memory "${tmp}"`);
        // No parse error, no "file not found", just network failure.
        assert.notStrictEqual(r.code, 0);
        assert.ok(!r.stderr.includes('Error reading'));
      } finally {
        fs.unlinkSync(tmp);
      }
    });
  });

  describe('c4 pinned-memory subcommand', () => {
    it('shows usage when no action is given', () => {
      const r = runCli('pinned-memory');
      assert.strictEqual(r.code, 1);
      assert.ok(/Usage:/.test(r.stderr));
    });

    it('shows usage when an unknown action is given', () => {
      const r = runCli('pinned-memory frobnicate w1');
      assert.strictEqual(r.code, 1);
      assert.ok(/Usage:/.test(r.stderr));
    });

    it('accepts `get` with a worker name (fails only at the network boundary)', () => {
      const r = runCli('pinned-memory get w1');
      assert.notStrictEqual(r.code, 0);
      assert.ok(!r.stderr.includes('Usage:'));
    });

    it('accepts --rule, --file, --role, --refresh on set', () => {
      const tmp = path.join(os.tmpdir(), `c4-pin-set-${Date.now()}.md`);
      fs.writeFileSync(tmp, 'file-sourced rule');
      try {
        const r = runCli(
          `pinned-memory set w1 --file "${tmp}" --rule "inline rule" --role manager --refresh`
        );
        assert.notStrictEqual(r.code, 0);
        assert.ok(!r.stderr.includes('Usage:'));
      } finally {
        fs.unlinkSync(tmp);
      }
    });
  });

  describe('scheduler: format + clamp helpers', () => {
    it('REFRESH_PREFIX is the documented string used by tests and hooks', () => {
      assert.strictEqual(REFRESH_PREFIX, 'PINNED RULES REFRESHED:');
    });

    it('formatRefreshBlock prepends the prefix and joins rules with a fence', () => {
      const block = formatRefreshBlock(['one', 'two'], { trigger: 'interval' });
      assert.ok(block.startsWith('PINNED RULES REFRESHED: (interval)\n'));
      assert.ok(block.includes('one'));
      assert.ok(block.includes('two'));
      // Rules are fenced with `---` to stay human-readable in terminal
      // scrollback.
      assert.ok(block.includes('\n---\n'));
    });

    it('formatRefreshBlock returns empty string when no rules', () => {
      assert.strictEqual(formatRefreshBlock([]), '');
      assert.strictEqual(formatRefreshBlock([' ', '']), '');
    });

    it('clampInterval floors tiny values and falls back on garbage input', () => {
      assert.strictEqual(clampInterval(1), MIN_INTERVAL_MS);
      assert.strictEqual(clampInterval(MIN_INTERVAL_MS + 1), MIN_INTERVAL_MS + 1);
      assert.strictEqual(clampInterval(undefined), DEFAULT_INTERVAL_MS);
      assert.strictEqual(clampInterval('not-a-number'), DEFAULT_INTERVAL_MS);
      assert.strictEqual(clampInterval(-5), DEFAULT_INTERVAL_MS);
    });
  });

  describe('scheduler: interval tick + post-compact re-injection', () => {
    function makeFakeManager() {
      const mgr = new EventEmitter();
      mgr.sent = [];
      mgr.pinned = new Map();
      mgr.send = (name, input) => {
        mgr.sent.push({ name, input });
        return Promise.resolve({ success: true });
      };
      mgr.getPinnedMemory = (name) => mgr.pinned.get(name) || null;
      return mgr;
    }

    it('refreshNow sends a PINNED RULES REFRESHED block to the worker', () => {
      const mgr = makeFakeManager();
      mgr.pinned.set('w1', {
        userRules: ['no compound commands'],
        defaultTemplate: null,
      });
      const sched = new PinnedMemoryScheduler(mgr, { intervalMs: 60_000, rulesDir });
      sched.attach();
      const res = sched.refreshNow('w1', 'manual');
      assert.strictEqual(res.ok, true);
      assert.strictEqual(res.trigger, 'manual');
      assert.strictEqual(mgr.sent.length, 1);
      assert.ok(mgr.sent[0].input.startsWith('PINNED RULES REFRESHED:'));
      assert.ok(mgr.sent[0].input.includes('no compound commands'));
      sched.detach();
    });

    it('prepends the role template content ahead of userRules', () => {
      const mgr = makeFakeManager();
      mgr.pinned.set('w1', {
        userRules: ['custom line'],
        defaultTemplate: 'worker',
      });
      const sched = new PinnedMemoryScheduler(mgr, { intervalMs: 60_000, rulesDir });
      sched.refreshNow('w1');
      const msg = mgr.sent[0].input;
      const idxTemplate = msg.indexOf('role-worker pinned rules');
      const idxCustom = msg.indexOf('custom line');
      assert.ok(idxTemplate >= 0, 'expected template text in refresh block');
      assert.ok(idxCustom > idxTemplate, 'userRules must come after template');
    });

    it('refreshNow returns no-rules when there is nothing to send', () => {
      const mgr = makeFakeManager();
      mgr.pinned.set('w1', { userRules: [], defaultTemplate: null });
      const sched = new PinnedMemoryScheduler(mgr, { intervalMs: 60_000, rulesDir });
      const res = sched.refreshNow('w1');
      assert.strictEqual(res.ok, false);
      assert.strictEqual(res.reason, 'no-rules');
      assert.strictEqual(mgr.sent.length, 0);
    });

    it('subscribes to post-compact event and refreshes immediately', () => {
      const mgr = makeFakeManager();
      mgr.pinned.set('w1', {
        userRules: ['survive compact'],
        defaultTemplate: null,
      });
      const sched = new PinnedMemoryScheduler(mgr, { intervalMs: 60_000, rulesDir });
      sched.attach();
      mgr.emit('post-compact', { worker: 'w1' });
      assert.strictEqual(mgr.sent.length, 1);
      assert.ok(mgr.sent[0].input.includes('(post-compact)'));
      assert.ok(mgr.sent[0].input.includes('survive compact'));
      sched.detach();
    });

    it('register/unregister drives a per-worker setInterval', (t, done) => {
      const mgr = makeFakeManager();
      mgr.pinned.set('w1', {
        userRules: ['tick-rule'],
        defaultTemplate: null,
      });
      const sched = new PinnedMemoryScheduler(mgr, {
        intervalMs: MIN_INTERVAL_MS, // minimum real value used by scheduler
        rulesDir,
      });
      // Override with a tiny direct setInterval for the test by monkey-
      // patching after construction - the real code clamps anything lower.
      sched.register('w1');
      // Trigger an immediate "tick" by calling the private fallback path -
      // we verify register() wired up the timer via the _timers map.
      assert.ok(sched._timers.has('w1'));
      sched.unregister('w1');
      assert.ok(!sched._timers.has('w1'));
      done();
    });
  });

  describe('API route shape', () => {
    it('daemon.js defines GET and POST /workers/:name/pinned-memory', () => {
      const src = fs.readFileSync(path.join(repoRoot, 'src', 'daemon.js'), 'utf8');
      // Match the concrete handler guard clauses without being sensitive
      // to whitespace tweaks.
      const routeRe = /\/\^\\\/workers\\\/\[\^\\\/\]\+\\\/pinned-memory\$\//;
      assert.ok(
        routeRe.test(src),
        'expected /workers/:name/pinned-memory route regex in daemon.js'
      );
      assert.ok(
        /req\.method === 'GET'[^]{0,120}pinned-memory/.test(src),
        'expected a GET branch keyed on /pinned-memory'
      );
      assert.ok(
        /req\.method === 'POST'[^]{0,120}pinned-memory/.test(src),
        'expected a POST branch keyed on /pinned-memory'
      );
    });

    it('daemon.js wires PinnedMemoryScheduler on manager create/close', () => {
      const src = fs.readFileSync(path.join(repoRoot, 'src', 'daemon.js'), 'utf8');
      assert.ok(
        src.includes("require('./pinned-memory-scheduler')"),
        'daemon.js must require pinned-memory-scheduler'
      );
      assert.ok(
        src.includes('pinnedMemoryScheduler.register('),
        'daemon.js must call scheduler.register on worker create'
      );
      assert.ok(
        src.includes('pinnedMemoryScheduler.unregister('),
        'daemon.js must call scheduler.unregister on worker close'
      );
    });
  });

  describe('pty-manager metadata persistence', () => {
    it('stores pinnedMemory on the worker struct', () => {
      const src = fs.readFileSync(path.join(repoRoot, 'src', 'pty-manager.js'), 'utf8');
      assert.ok(
        /_pinnedMemory:\s*\{/.test(src),
        'expected worker struct to carry _pinnedMemory'
      );
      assert.ok(
        src.includes('getPinnedMemory(name)'),
        'expected getPinnedMemory(name) accessor'
      );
      assert.ok(
        src.includes('setPinnedMemory(name, patch)'),
        'expected setPinnedMemory(name, patch) accessor'
      );
    });

    it('_saveState round-trips pinnedMemory to disk', () => {
      const src = fs.readFileSync(path.join(repoRoot, 'src', 'pty-manager.js'), 'utf8');
      // Save side writes pinnedMemory on each worker record
      assert.ok(
        /pinnedMemory:\s*w\._pinnedMemory/.test(src),
        'expected _saveState to write pinnedMemory'
      );
      // Load side forwards pinnedMemory onto the lostWorkers snapshot
      assert.ok(
        /pinnedMemory:\s*w\.pinnedMemory/.test(src),
        'expected _loadState to carry pinnedMemory onto lostWorkers'
      );
    });

    it('list() exposes pinnedMemory to API consumers', () => {
      const src = fs.readFileSync(path.join(repoRoot, 'src', 'pty-manager.js'), 'utf8');
      // list() returns each worker's pinnedMemory so the Web UI sees the
      // same shape the CLI does without a second round-trip. Match the
      // comment tag plus the struct shape below it.
      assert.ok(
        /expose pinned rules[^]{0,200}pinnedMemory:\s*w\._pinnedMemory/.test(src),
        'expected list() to surface pinnedMemory'
      );
    });
  });

  describe('Web UI source-grep', () => {
    it('PinnedRulesEditor exports a Persistent Rules textarea', () => {
      const file = path.join(
        repoRoot, 'web', 'src', 'components', 'PinnedRulesEditor.tsx'
      );
      assert.ok(fs.existsSync(file), 'PinnedRulesEditor.tsx must exist');
      const src = fs.readFileSync(file, 'utf8');
      assert.ok(
        /Persistent Rules/.test(src),
        'expected "Persistent Rules" label in PinnedRulesEditor'
      );
      assert.ok(/<textarea/.test(src), 'expected a <textarea> element');
      assert.ok(
        /aria-label="Persistent Rules"/.test(src),
        'expected aria-label="Persistent Rules"'
      );
      assert.ok(
        /\/api\/workers\/.+\/pinned-memory/.test(src),
        'expected the component to call /api/workers/:name/pinned-memory'
      );
    });

    it('WorkerDetail mounts PinnedRulesEditor beneath the terminal card', () => {
      const file = path.join(
        repoRoot, 'web', 'src', 'components', 'WorkerDetail.tsx'
      );
      const src = fs.readFileSync(file, 'utf8');
      assert.ok(
        /PinnedRulesEditor/.test(src),
        'WorkerDetail must render PinnedRulesEditor'
      );
    });

    it('Worker type declares the pinnedMemory field', () => {
      const file = path.join(repoRoot, 'web', 'src', 'types.ts');
      const src = fs.readFileSync(file, 'utf8');
      assert.ok(
        /pinnedMemory\?:\s*PinnedMemory/.test(src),
        'Worker type must expose pinnedMemory'
      );
      assert.ok(
        /interface PinnedMemory/.test(src),
        'PinnedMemory interface must be declared'
      );
    });
  });
});
