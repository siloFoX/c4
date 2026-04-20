'use strict';

// Autonomous TODO dispatch loop (8.28).
//
// Parses TODO.md, picks the next eligible item by priority and
// dependency resolution, and hands a sendTask-compatible prompt to an
// injected `dispatch` callback so the daemon can fire it into an idle
// manager without a human reviewer in the loop.
//
// Pure module: every side effect (file read, manager state probe, task
// dispatch, slack emit, wall clock) is pluggable through options so
// tests drive the full tick loop without a live daemon.
//
// Priority rules (spec 8.28):
//   urgent tag  > halt-related  > numerical id asc
//
// Safety rails:
//   - Unsafe patterns in the todo detail (compound shell connectors,
//     `rm -rf`, `sudo`, `git push --force`, `shutdown`, `chmod -R 777`)
//     pause the loop and surface the todo id + matched pattern.
//   - Circuit breaker: 3 consecutive halt/rollback records auto-pause
//     the dispatcher. `resume()` clears the counter.
//   - Throttle: one dispatch per `throttleMs` window (default 5 min)
//     regardless of manager idle state.
//
// Intended call sites:
//   - daemon.js owns one `AutoDispatcher` instance, starts/stops its
//     timer alongside healthCheck, and exposes /autonomous/{status,
//     pause, resume, tick} routes that proxy to the instance.
//   - tests/auto-dispatch.test.js drives tick() with mock readers +
//     dispatch stubs to cover parsing, sorting, dependency checks, and
//     the circuit breaker without spawning real workers.

const fs = require('fs');

// GFM table row: | <id> | <title> | <status> | <detail> |
// Matches both plain ids ("8.28") and strikethrough ids ("~~7.8~~").
// The leading and trailing pipes are required; a single-pipe line in a
// narrative bullet does not match.
const ROW_RE = /^\|\s*~?~?\s*(\d+(?:\.\d+)?)\s*~?~?\s*\|([^|]+)\|\s*\*?\*?\s*([\w-]+)\s*\*?\*?\s*\|([\s\S]*?)\|\s*$/;

const STATUS_DONE = new Set(['done']);
const STATUS_TODO = new Set(['todo', 'pending', 'open', 'wip']);

// Unsafe patterns: compound shell connectors from 7.26 plus the
// destructive operations the spec explicitly calls out. Kept as a flat
// array so `detectUnsafe` can return the first match for logging.
const UNSAFE_PATTERNS = Object.freeze([
  { name: 'compound-&&', re: /&&/ },
  { name: 'compound-||', re: /\|\|/ },
  { name: 'compound-;', re: /(^|[^\\]);/ },
  { name: 'rm-rf', re: /\brm\s+-rf\b/i },
  { name: 'sudo', re: /\bsudo\s+\S/i },
  { name: 'fork-bomb', re: /:\(\)\s*\{/ },
  { name: 'git-push-force', re: /git\s+push\s+.*--force\b/i },
  { name: 'shutdown', re: /\bshutdown\b/i },
  { name: 'reboot', re: /\breboot\b/i },
  { name: 'chmod-777-r', re: /chmod\s+-R\s+777/i },
]);

function detectUnsafe(text) {
  if (typeof text !== 'string' || text.length === 0) return null;
  for (const p of UNSAFE_PATTERNS) {
    if (p.re.test(text)) return p.name;
  }
  return null;
}

// Priority detection uses explicit tag markers so a narrative mention
// of "urgent" or "halt" inside a long detail string cannot accidentally
// promote an ordinary todo. Supported forms:
//   [urgent] / (urgent) / urgent:          in the title or first 200 chars
//   [긴급] / (긴급) / 긴급:                 Korean equivalent
//   [halt] / (halt) / halt:                second-tier
function detectPriority(text) {
  if (typeof text !== 'string' || text.length === 0) return 'normal';
  const head = text.slice(0, 200);
  if (/\[\s*urgent\s*\]|\(\s*urgent\s*\)|(^|\s)urgent:/i.test(head)) return 'urgent';
  if (/\[\s*긴급\s*\]|\(\s*긴급\s*\)|(^|\s)긴급:/.test(head)) return 'urgent';
  if (/\[\s*halt\s*\]|\(\s*halt\s*\)|(^|\s)halt:/i.test(head)) return 'halt';
  if (/\bhalt-related\b/i.test(head)) return 'halt';
  return 'normal';
}

function priorityRank(tag) {
  if (tag === 'urgent') return 0;
  if (tag === 'halt') return 1;
  return 2;
}

function extractDependencies(detail) {
  const deps = new Set();
  if (typeof detail !== 'string') return [];
  const patterns = [
    /depends on\s+(\d+(?:\.\d+)?)/gi,
    /blocked by\s+(\d+(?:\.\d+)?)/gi,
    /needs\s+(\d+(?:\.\d+)?)/gi,
    /requires\s+(\d+(?:\.\d+)?)/gi,
  ];
  for (const re of patterns) {
    let m;
    while ((m = re.exec(detail)) !== null) deps.add(m[1]);
  }
  return Array.from(deps);
}

function compareById(a, b) {
  const aParts = String(a.id).split('.');
  const bParts = String(b.id).split('.');
  const aMajor = parseInt(aParts[0] || '0', 10);
  const bMajor = parseInt(bParts[0] || '0', 10);
  if (aMajor !== bMajor) return aMajor - bMajor;
  const aMinor = parseInt(aParts[1] || '0', 10);
  const bMinor = parseInt(bParts[1] || '0', 10);
  return aMinor - bMinor;
}

function parseTodos(markdown) {
  if (typeof markdown !== 'string' || markdown.length === 0) return [];
  const lines = markdown.split(/\r?\n/);
  const out = [];
  const seen = new Set();
  for (const line of lines) {
    const m = line.match(ROW_RE);
    if (!m) continue;
    const id = m[1].trim();
    if (seen.has(id)) continue;
    const title = m[2].trim();
    const status = m[3].trim().toLowerCase();
    const detail = m[4].trim();
    if (!STATUS_DONE.has(status) && !STATUS_TODO.has(status)) continue;
    const priorityText = title + ' ' + detail;
    const entry = {
      id,
      title,
      status,
      detail,
      priority: detectPriority(priorityText),
      dependencies: extractDependencies(detail),
      unsafe: detectUnsafe(detail),
    };
    out.push(entry);
    seen.add(id);
  }
  return out;
}

function sortByPriority(todos) {
  return todos.slice().sort((a, b) => {
    const pa = priorityRank(a.priority);
    const pb = priorityRank(b.priority);
    if (pa !== pb) return pa - pb;
    return compareById(a, b);
  });
}

// Completed ids come from two places: the todo list itself (done rows)
// and any injected override (e.g. a persisted success log). The union
// satisfies dependency checks even when the caller knows about commits
// that have not yet been reflected in TODO.md.
//
// By default unsafe rows are returned so the caller (tick) can pause
// and surface the pattern. Pass { skipUnsafe: true } to filter them out
// instead - useful when the caller wants a "safest available" choice.
function pickNext(todos, options) {
  const opts = options || {};
  const skipUnsafe = opts.skipUnsafe === true;
  const completed = new Set(opts.completedIds || []);
  for (const t of todos) {
    if (STATUS_DONE.has(t.status)) completed.add(t.id);
  }
  const sorted = sortByPriority(todos);
  for (const t of sorted) {
    if (STATUS_DONE.has(t.status)) continue;
    if (skipUnsafe && t.unsafe) continue;
    if (t.dependencies.some((d) => !completed.has(d))) continue;
    return t;
  }
  return null;
}

// --- AutoDispatcher -------------------------------------------------------

const DEFAULT_THROTTLE_MS = 5 * 60 * 1000;
const DEFAULT_CIRCUIT_THRESHOLD = 3;
const DEFAULT_LOG_CAP = 50;

class AutoDispatcher {
  constructor(options) {
    const opts = options || {};
    this.todoPath = opts.todoPath || '';
    this.throttleMs = Number.isFinite(opts.throttleMs) && opts.throttleMs > 0
      ? opts.throttleMs
      : DEFAULT_THROTTLE_MS;
    this.circuitThreshold = Number.isFinite(opts.circuitThreshold) && opts.circuitThreshold > 0
      ? opts.circuitThreshold
      : DEFAULT_CIRCUIT_THRESHOLD;
    this.managerName = opts.managerName || 'c4-mgr-auto';
    this.enabled = opts.enabled !== false;
    this.paused = false;
    this.pauseReason = null;
    this.consecutiveHalts = 0;
    this.lastDispatchAt = 0;
    this.lastDispatchId = null;
    this.lastError = null;
    this.dispatchLog = [];
    this._dispatch = typeof opts.dispatch === 'function' ? opts.dispatch : null;
    this._idleCheck = typeof opts.idleCheck === 'function' ? opts.idleCheck : null;
    this._completedIds = typeof opts.completedIds === 'function' ? opts.completedIds : null;
    this._notifier = typeof opts.notifier === 'function' ? opts.notifier : null;
    this._clock = typeof opts.clock === 'function' ? opts.clock : Date.now;
    this._reader = typeof opts.reader === 'function' ? opts.reader : null;
    this._timer = null;
    this._logCap = Number.isFinite(opts.logCap) && opts.logCap > 0
      ? opts.logCap
      : DEFAULT_LOG_CAP;
  }

  getStatus() {
    return {
      enabled: this.enabled,
      paused: this.paused,
      pauseReason: this.pauseReason,
      consecutiveHalts: this.consecutiveHalts,
      circuitThreshold: this.circuitThreshold,
      throttleMs: this.throttleMs,
      managerName: this.managerName,
      todoPath: this.todoPath,
      lastDispatchAt: this.lastDispatchAt
        ? new Date(this.lastDispatchAt).toISOString()
        : null,
      lastDispatchId: this.lastDispatchId,
      lastError: this.lastError,
      recent: this.dispatchLog.slice(-10),
    };
  }

  pause(reason) {
    this.paused = true;
    this.pauseReason = reason || 'manual';
    this._emit('auto_dispatch_paused', { reason: this.pauseReason });
    return this.getStatus();
  }

  resume() {
    this.paused = false;
    this.pauseReason = null;
    this.consecutiveHalts = 0;
    this._emit('auto_dispatch_resumed', { manager: this.managerName });
    return this.getStatus();
  }

  // External signals: the daemon calls recordHalt / recordSuccess when
  // it observes the manager's outcome so the circuit breaker counts
  // consecutive halt/rollback events.
  recordHalt(todoId, reason) {
    this.consecutiveHalts += 1;
    this._append({
      type: 'halt',
      id: todoId || this.lastDispatchId,
      reason: String(reason || ''),
      at: this._clock(),
    });
    if (this.consecutiveHalts >= this.circuitThreshold && !this.paused) {
      this.pause('circuit-breaker: ' + this.consecutiveHalts + ' consecutive halts');
    }
  }

  recordSuccess(todoId) {
    this.consecutiveHalts = 0;
    this._append({
      type: 'success',
      id: todoId || this.lastDispatchId,
      at: this._clock(),
    });
  }

  _append(entry) {
    this.dispatchLog.push(entry);
    if (this.dispatchLog.length > this._logCap) {
      this.dispatchLog = this.dispatchLog.slice(-this._logCap);
    }
  }

  _emit(event, payload) {
    if (!this._notifier) return;
    try { this._notifier(event, payload || {}); } catch { /* best-effort */ }
  }

  _readTodos() {
    if (this._reader) return this._reader(this.todoPath);
    return fs.readFileSync(this.todoPath, 'utf8');
  }

  async tick() {
    if (!this.enabled) return { skipped: 'disabled' };
    if (this.paused) return { skipped: 'paused', reason: this.pauseReason };

    const now = this._clock();
    if (this.lastDispatchAt && (now - this.lastDispatchAt) < this.throttleMs) {
      return {
        skipped: 'throttled',
        nextEligibleInMs: this.throttleMs - (now - this.lastDispatchAt),
      };
    }

    if (this._idleCheck) {
      let idle = false;
      try { idle = await this._idleCheck(); }
      catch (e) {
        this.lastError = String((e && e.message) || e);
        return { skipped: 'idle-check-failed', error: this.lastError };
      }
      if (!idle) return { skipped: 'manager-busy' };
    }

    let markdown;
    try { markdown = this._readTodos(); }
    catch (e) {
      this.lastError = String((e && e.message) || e);
      return { skipped: 'todo-read-failed', error: this.lastError };
    }

    const todos = parseTodos(markdown);
    const externalCompleted = this._completedIds
      ? (this._completedIds() || [])
      : [];
    const next = pickNext(todos, { completedIds: externalCompleted });
    if (!next) return { skipped: 'no-eligible-todo' };

    const combined = next.title + '\n' + next.detail;
    const unsafe = detectUnsafe(combined);
    if (unsafe) {
      this.pause('unsafe-pattern:' + unsafe + ' in ' + next.id);
      return { skipped: 'unsafe-pattern', id: next.id, pattern: unsafe };
    }

    if (!this._dispatch) {
      return { skipped: 'no-dispatch-fn', would: next.id };
    }

    let dispatchResult;
    try {
      dispatchResult = await this._dispatch(next);
    } catch (e) {
      this.lastError = String((e && e.message) || e);
      this._append({
        type: 'dispatch-error',
        id: next.id,
        error: this.lastError,
        at: now,
      });
      return { skipped: 'dispatch-failed', error: this.lastError };
    }

    this.lastDispatchAt = now;
    this.lastDispatchId = next.id;
    this.lastError = null;
    this._append({
      type: 'dispatch',
      id: next.id,
      title: next.title,
      priority: next.priority,
      at: now,
    });
    this._emit('auto_dispatch_sent', {
      id: next.id,
      title: next.title,
      priority: next.priority,
      manager: this.managerName,
    });
    return { dispatched: next.id, priority: next.priority, result: dispatchResult };
  }

  start() {
    if (this._timer) return;
    this._timer = setInterval(() => {
      this.tick().catch(() => { /* best-effort */ });
    }, this.throttleMs);
    // setInterval retains the event loop; the daemon wants a clean
    // shutdown when SIGTERM fires, so unref lets Node exit cleanly.
    if (this._timer && typeof this._timer.unref === 'function') {
      this._timer.unref();
    }
  }

  stop() {
    if (this._timer) {
      clearInterval(this._timer);
      this._timer = null;
    }
  }

  reload(options) {
    const opts = options || {};
    if (Number.isFinite(opts.throttleMs) && opts.throttleMs > 0) {
      this.throttleMs = opts.throttleMs;
    }
    if (opts.enabled != null) this.enabled = opts.enabled !== false;
    if (Number.isFinite(opts.circuitThreshold) && opts.circuitThreshold > 0) {
      this.circuitThreshold = opts.circuitThreshold;
    }
    if (typeof opts.managerName === 'string' && opts.managerName.length > 0) {
      this.managerName = opts.managerName;
    }
    if (typeof opts.todoPath === 'string' && opts.todoPath.length > 0) {
      this.todoPath = opts.todoPath;
    }
  }
}

// Build a manager-bound prompt so the worker knows which todo id to
// tackle and that the branch isolation rules from CLAUDE.md still
// apply. Exported for daemon.js wiring + test assertions.
function buildDispatchPrompt(todo, options) {
  const opts = options || {};
  const repoRoot = opts.repoRoot || '';
  const branch = opts.branch || ('c4/auto-' + String(todo.id).replace(/\./g, '-'));
  const header = '[C4 autonomous dispatch 8.28]';
  const lines = [
    header,
    'TODO id: ' + todo.id,
    'Title: ' + todo.title,
    'Priority: ' + todo.priority,
  ];
  if (repoRoot) lines.push('Repo: ' + repoRoot);
  lines.push('Branch: ' + branch);
  if (todo.dependencies && todo.dependencies.length > 0) {
    lines.push('Dependencies: ' + todo.dependencies.join(', '));
  }
  lines.push('');
  lines.push('Detail:');
  lines.push(todo.detail);
  lines.push('');
  lines.push('Rules: single-command only (no && or ;), git -C <path>, ASCII English responses, commit on branch before merge.');
  return lines.join('\n');
}

module.exports = {
  AutoDispatcher,
  parseTodos,
  sortByPriority,
  pickNext,
  detectPriority,
  detectUnsafe,
  extractDependencies,
  priorityRank,
  compareById,
  buildDispatchPrompt,
  UNSAFE_PATTERNS,
  STATUS_DONE,
  STATUS_TODO,
  DEFAULT_THROTTLE_MS,
  DEFAULT_CIRCUIT_THRESHOLD,
};
