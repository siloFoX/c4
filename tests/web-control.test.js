'use strict';

// 8.8 - Web UI Worker Control Panel
//
// Tests cover:
//   (a) PtyManager.cancelTask + restart - behavioural unit tests with a
//       stubbed create() and fake PTY proc so we do not need to spawn a
//       real worker during the test suite.
//   (b) daemon.js routes - source-grep only; the daemon is otherwise
//       covered by tests/dashboard + tests/session-auth.
//   (c) ControlPanel.tsx + App.tsx - source-grep to lock the wiring
//       between the UI buttons and the /api/* endpoints (same strategy
//       tests/chat-view.test.js uses for the ChatView TSX).

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { describe, it } = require('node:test');

const REPO_ROOT = path.join(__dirname, '..');
const PANEL_TSX = path.join(REPO_ROOT, 'web', 'src', 'components', 'ControlPanel.tsx');
const APP_TSX = path.join(REPO_ROOT, 'web', 'src', 'App.tsx');
const DAEMON_JS = path.join(REPO_ROOT, 'src', 'daemon.js');

const PtyManager = require('../src/pty-manager');

function makeFakeWorker(overrides = {}) {
  const writes = [];
  const killed = { called: 0 };
  const proc = {
    pid: 4242,
    write(buf) { writes.push(String(buf)); },
    kill() { killed.called += 1; },
  };
  const worker = {
    proc,
    screen: { getText: () => '', getScrollback: () => '' },
    alive: true,
    command: 'claude --foo bar',
    target: 'local',
    parent: null,
    branch: 'c4/my-worker',
    worktree: '/tmp/fake-worktree',
    worktreeRepoRoot: '/tmp/fake-repo',
    _startCommit: 'abc1234',
    _pendingTask: null,
    _pendingTaskSent: false,
    _pendingTaskTimer: null,
    _pendingTaskTimeoutTimer: null,
    _pendingTaskVerifyTimer: null,
    _taskText: null,
    idleTimer: null,
    rawLogStream: null,
    snapshots: [],
    ...overrides,
  };
  worker._fakeInternals = { writes, killed };
  return worker;
}

function makeManager() {
  const mgr = new PtyManager();
  // Keep tests deterministic: no-op persistence + no ambient state.
  mgr._saveState = () => {};
  mgr.workers = new Map();
  mgr._taskQueue = [];
  return mgr;
}

describe('PtyManager.cancelTask (8.8)', () => {
  it('rejects missing name', () => {
    const mgr = makeManager();
    const res = mgr.cancelTask('');
    assert.ok(res.error);
  });

  it('removes a queued entry and returns kind=queued', () => {
    const mgr = makeManager();
    mgr._taskQueue = [
      { name: 'alpha', task: 'build alpha' },
      { name: 'beta', task: 'build beta' },
    ];
    const res = mgr.cancelTask('beta');
    assert.strictEqual(res.success, true);
    assert.strictEqual(res.kind, 'queued');
    assert.strictEqual(res.task, 'build beta');
    assert.strictEqual(mgr._taskQueue.length, 1);
    assert.strictEqual(mgr._taskQueue[0].name, 'alpha');
  });

  it('clears a pending task (not yet sent) and returns kind=pending', () => {
    const mgr = makeManager();
    let timerCleared = false;
    const fakeTimer = setInterval(() => {}, 1000);
    const w = makeFakeWorker({
      _pendingTask: { task: 'pending task text', options: {} },
      _pendingTaskSent: false,
      _pendingTaskTimer: fakeTimer,
    });
    // Override clearInterval via timer capture: node clears it for us, just
    // verify the fields are reset after the call.
    mgr.workers.set('w1', w);
    const res = mgr.cancelTask('w1');
    assert.strictEqual(res.success, true);
    assert.strictEqual(res.kind, 'pending');
    assert.strictEqual(res.task, 'pending task text');
    assert.strictEqual(w._pendingTask, null);
    assert.strictEqual(w._pendingTaskSent, false);
    assert.strictEqual(w._pendingTaskTimer, null);
    // Best-effort cleanup; ignore if already cleared inside cancelTask.
    try { clearInterval(fakeTimer); } catch (_) { /* noop */ }
    void timerCleared;
  });

  it('interrupts an in-flight task by writing \\x03 and clearing _taskText', () => {
    const mgr = makeManager();
    const w = makeFakeWorker({ _taskText: 'run long job' });
    mgr.workers.set('w1', w);
    const res = mgr.cancelTask('w1');
    assert.strictEqual(res.success, true);
    assert.strictEqual(res.kind, 'interrupt');
    assert.strictEqual(res.task, 'run long job');
    assert.deepStrictEqual(w._fakeInternals.writes, ['\x03']);
    assert.strictEqual(w._taskText, null);
  });

  it('sends Ctrl+C to an alive worker with no tracked task', () => {
    const mgr = makeManager();
    const w = makeFakeWorker({ _taskText: null });
    mgr.workers.set('w1', w);
    const res = mgr.cancelTask('w1');
    assert.strictEqual(res.success, true);
    assert.strictEqual(res.kind, 'interrupt');
    assert.deepStrictEqual(w._fakeInternals.writes, ['\x03']);
  });

  it('returns an error when the worker has exited', () => {
    const mgr = makeManager();
    const w = makeFakeWorker({ alive: false });
    mgr.workers.set('w1', w);
    const res = mgr.cancelTask('w1');
    assert.ok(res.error);
    assert.match(res.error, /exited/);
  });

  it('returns an error when the worker does not exist and nothing is queued', () => {
    const mgr = makeManager();
    const res = mgr.cancelTask('nope');
    assert.ok(res.error);
    assert.match(res.error, /not found/);
  });
});

describe('PtyManager.restart (8.8)', () => {
  it('rejects missing worker', () => {
    const mgr = makeManager();
    const res = mgr.restart('nope');
    assert.ok(res.error);
    assert.match(res.error, /not found/);
  });

  it('kills the old PTY, preserves branch/worktree, and re-creates the worker', () => {
    const mgr = makeManager();
    const oldWorker = makeFakeWorker({
      command: 'claude --dangerously-skip-permissions',
      branch: 'c4/keep-this',
      worktree: '/tmp/keep/worktree',
      worktreeRepoRoot: '/tmp/keep',
      target: 'local',
      parent: 'parent-worker',
      _startCommit: 'deadbeef',
      _autoWorker: true,
    });
    mgr.workers.set('w1', oldWorker);

    const createCalls = [];
    let newWorker = null;
    mgr.create = (name, command, args, options) => {
      createCalls.push({ name, command, args, options });
      newWorker = makeFakeWorker({
        command: [command, ...args].join(' ').trim(),
        branch: null,
        worktree: null,
        worktreeRepoRoot: null,
      });
      mgr.workers.set(name, newWorker);
      return { success: true, name };
    };

    const res = mgr.restart('w1');
    assert.strictEqual(res.success, true);
    assert.strictEqual(res.branch, 'c4/keep-this');
    assert.strictEqual(res.worktree, '/tmp/keep/worktree');
    assert.strictEqual(res.target, 'local');
    assert.strictEqual(res.restarted, true);

    // Old PTY killed exactly once.
    assert.strictEqual(oldWorker._fakeInternals.killed.called, 1);

    // create() received command/args parsed from the stored command string
    // and the worktree cwd + parent propagated through options.
    assert.strictEqual(createCalls.length, 1);
    assert.strictEqual(createCalls[0].name, 'w1');
    assert.strictEqual(createCalls[0].command, 'claude');
    assert.deepStrictEqual(createCalls[0].args, ['--dangerously-skip-permissions']);
    assert.strictEqual(createCalls[0].options.target, 'local');
    assert.strictEqual(createCalls[0].options.parent, 'parent-worker');
    assert.strictEqual(createCalls[0].options.cwd, '/tmp/keep/worktree');

    // Post-create snapshot restored onto the fresh worker entry.
    assert.ok(newWorker, 'new worker must be created');
    assert.strictEqual(newWorker.branch, 'c4/keep-this');
    assert.strictEqual(newWorker.worktree, '/tmp/keep/worktree');
    assert.strictEqual(newWorker.worktreeRepoRoot, '/tmp/keep');
    assert.strictEqual(newWorker._startCommit, 'deadbeef');
    assert.strictEqual(newWorker._autoWorker, true);
  });

  it('propagates create() errors and does not attempt restoration', () => {
    const mgr = makeManager();
    const w = makeFakeWorker();
    mgr.workers.set('w1', w);
    mgr.create = () => ({ error: 'spawn failed' });

    const res = mgr.restart('w1');
    assert.strictEqual(res.error, 'spawn failed');
    assert.strictEqual(mgr.workers.has('w1'), false);
  });

  it('defaults command to "claude" when stored command is empty', () => {
    const mgr = makeManager();
    const w = makeFakeWorker({ command: '' });
    mgr.workers.set('w1', w);

    let calledWith = null;
    mgr.create = (name, command, args, options) => {
      calledWith = { command, args };
      mgr.workers.set(name, makeFakeWorker({ command }));
      return { success: true };
    };

    const res = mgr.restart('w1');
    assert.strictEqual(res.success, true);
    assert.strictEqual(calledWith.command, 'claude');
    assert.deepStrictEqual(calledWith.args, []);
  });
});

describe('daemon.js /cancel + /restart wiring (8.8)', () => {
  const src = fs.readFileSync(DAEMON_JS, 'utf8');

  it('registers POST /cancel route', () => {
    assert.match(src, /route === '\/cancel'/);
    assert.match(src, /manager\.cancelTask\(name\)/);
  });

  it('registers POST /restart route', () => {
    assert.match(src, /route === '\/restart'/);
    assert.match(src, /manager\.restart\(name\)/);
  });

  it('both new routes guard against missing name', () => {
    // Grab the handler window around /cancel to make sure the guard is there.
    const cancelBlock = src.match(/route === '\/cancel'[\s\S]{0,300}/);
    assert.ok(cancelBlock, 'cancel block must exist');
    assert.match(cancelBlock[0], /Missing name/);

    const restartBlock = src.match(/route === '\/restart'[\s\S]{0,300}/);
    assert.ok(restartBlock, 'restart block must exist');
    assert.match(restartBlock[0], /Missing name/);
  });
});

describe('ControlPanel.tsx source wiring (8.8)', () => {
  const src = fs.readFileSync(PANEL_TSX, 'utf8');

  it('imports apiFetch from the shared auth wrapper', () => {
    assert.match(src, /from '\.\.\/lib\/api'/);
    assert.match(src, /\bapiFetch\b/);
  });

  it('imports the shared Worker + ListResponse types', () => {
    assert.match(src, /from '\.\.\/types'/);
    assert.match(src, /ListResponse/);
    assert.match(src, /\bWorker\b/);
  });

  it('wires every required single-worker action endpoint', () => {
    // Pause / Resume reuse /api/key via key: 'C-c' / 'Enter'.
    assert.match(src, /'\/api\/key'/);
    assert.match(src, /key:\s*'C-c'/);
    assert.match(src, /key:\s*'Enter'/);
    // Cancel / Restart are the new endpoints from this patch.
    assert.match(src, /'\/api\/cancel'/);
    assert.match(src, /'\/api\/restart'/);
    // Rollback + Close reuse the existing endpoints.
    assert.match(src, /'\/api\/rollback'/);
    assert.match(src, /'\/api\/close'/);
  });

  it('prompts a confirm dialog for every destructive / warn action', () => {
    // Three labels that must be gated behind window.confirm.
    for (const fragment of [/Close "\$\{workerName\}"/, /Rollback "\$\{workerName\}"/, /Restart "\$\{workerName\}"/]) {
      assert.match(src, fragment);
    }
    assert.match(src, /window\.confirm\(/);
  });

  it('does NOT gate Pause or Resume behind confirm (they are reversible)', () => {
    // The confirm: null branch should be the one used for the key actions.
    const pauseIdx = src.indexOf("kind: 'pause'");
    const resumeIdx = src.indexOf("kind: 'resume'");
    assert.ok(pauseIdx > -1 && resumeIdx > -1, 'pause + resume action config must exist');
    const pauseSlice = src.slice(pauseIdx, pauseIdx + 400);
    const resumeSlice = src.slice(resumeIdx, resumeIdx + 400);
    assert.match(pauseSlice, /confirm:\s*null/);
    assert.match(resumeSlice, /confirm:\s*null/);
  });

  it('exposes batch Close + Cancel that hit the per-worker endpoints in a loop', () => {
    assert.match(src, /runBatch/);
    assert.match(src, /'\/api\/close'/);
    assert.match(src, /'\/api\/cancel'/);
    // The batch confirm prompt must count selected workers.
    assert.match(src, /Close \$\{names\.length\} worker/);
    assert.match(src, /Cancel the current task for \$\{names\.length\} worker/);
  });

  it('fetches /api/list for the batch worker picker', () => {
    assert.match(src, /'\/api\/list'/);
  });

  it('default-exports ControlPanel as a React component', () => {
    assert.match(src, /export default function ControlPanel/);
  });
});

describe('App.tsx Control tab wiring (8.8)', () => {
  const src = fs.readFileSync(APP_TSX, 'utf8');

  it('imports the new ControlPanel component', () => {
    assert.match(src, /import ControlPanel from '\.\/components\/ControlPanel'/);
  });

  it('extends DetailMode with "control"', () => {
    // After c4/web-layout the DetailMode union moved to DetailTabs.tsx.
    const detailTabsSrc = fs.readFileSync(
      path.join(REPO_ROOT, 'web', 'src', 'components', 'layout', 'DetailTabs.tsx'),
      'utf8',
    );
    assert.match(detailTabsSrc, /DetailMode = 'terminal' \| 'chat' \| 'control'/);
  });

  it('renders the Control tab button + mounts ControlPanel when selected', () => {
    // Control tab lives in DetailTabs; App.tsx is responsible for mounting
    // <ControlPanel/> when detailMode === 'control'.
    const detailTabsSrc = fs.readFileSync(
      path.join(REPO_ROOT, 'web', 'src', 'components', 'layout', 'DetailTabs.tsx'),
      'utf8',
    );
    assert.match(detailTabsSrc, /aria-selected=\{active\}/);
    assert.match(detailTabsSrc, /value: 'control'/);
    assert.match(detailTabsSrc, /label: 'Control'/);
    assert.match(src, /<ControlPanel key=\{`control-\$\{selectedWorker\}`\}/);
  });

  it('persists "control" in the c4.detail.mode localStorage key', () => {
    // After ui-settings, the detail-mode validation lives in preferences.ts.
    const prefsSrc = fs.readFileSync(
      path.join(__dirname, '..', 'web', 'src', 'lib', 'preferences.ts'),
      'utf8',
    );
    assert.match(prefsSrc, /'control'/);
    assert.match(prefsSrc, /DETAIL_VALUES/);
  });
});
