'use strict';

// Intelligent exception recovery (8.4).
//
// Classifies worker failures from their scrollback tail and selects a
// pluggable strategy (retry-same, retry-simpler, retry-with-smaller-scope,
// ask-manager). The daemon calls `recoverWorker` when a worker's
// `_interventionState` transitions to `escalation` without an explicit
// user mark (question / critical_deny mean "human needed", we do not
// touch those). Manual pass is exposed via the `c4 recover <name>` CLI
// which hits `POST /recover`.
//
// Every strategy is intentionally non-destructive:
//   - never calls manager.close / rollback / cleanup
//   - never writes anywhere except .c4/recovery-history.jsonl
//   - never bypasses pre-merge checks or modifies git state
//   - only action surface = manager.sendTask (to re-ask the worker) or a
//     notify ping routed through manager.notifications (if present)
//
// Module is pure Node (no node-pty / no manager dep at require-time) so
// tests can require it directly and drive the logic with fakes.

const fs = require('fs');
const path = require('path');

// --- Error classification ---------------------------------------------------
//
// Ordered most-specific -> least-specific. Tool-denial patterns beat the
// generic "Error:" net so a permission-deny cascade does not get filed as
// a random error.
const CATEGORY_PATTERNS = [
  {
    category: 'tool-deny',
    patterns: [
      /permission denied/i,
      /tool.*denied/i,
      /operation not permitted/i,
      /\b(EACCES|EPERM)\b/,
      /denied by policy/i,
    ],
  },
  {
    category: 'timeout',
    patterns: [
      /\b(ETIMEDOUT|ECONNABORTED|ESOCKETTIMEDOUT)\b/,
      /request timed out/i,
      /operation timed out/i,
      /timeout.*exceeded/i,
    ],
  },
  {
    category: 'test-fail',
    patterns: [
      /Tests?:\s+\d+\s+failed/i,
      /\bFAIL\s+/,
      /npm ERR!.*test/i,
      /AssertionError/i,
      /Expected[\s\S]{0,120}Received/i,
      /pytest.*failed/i,
      /jest.*failing/i,
    ],
  },
  {
    category: 'build-fail',
    patterns: [
      /\bTS\d{4}:/,                  // tsc error code
      /error TS\d+/i,
      /SyntaxError\b/,
      /ParseError\b/,
      /ReferenceError\b/,
      /Cannot find module/i,
      /Module not found/i,
      /webpack.*error/i,
      /vite.*error/i,
      /eslint.*error/i,
    ],
  },
  {
    category: 'dependency',
    patterns: [
      /npm ERR!.*ENOENT/i,
      /npm ERR!.*EINVAL/i,
      /Could not resolve dependency/i,
      /peer dep missing/i,
    ],
  },
];

function classifyError(scrollback, options = {}) {
  if (scrollback == null) {
    return { category: 'unknown', signal: null, confidence: 0 };
  }
  const text = typeof scrollback === 'string' ? scrollback : String(scrollback);
  if (!text.trim()) {
    return { category: 'unknown', signal: null, confidence: 0 };
  }

  const tailBytes = Number(options.tailBytes) > 0 ? Number(options.tailBytes) : 8000;
  const tail = text.length > tailBytes ? text.slice(-tailBytes) : text;

  for (const bucket of CATEGORY_PATTERNS) {
    for (const re of bucket.patterns) {
      const m = tail.match(re);
      if (m) {
        return {
          category: bucket.category,
          signal: (m[0] || '').trim().slice(0, 200),
          confidence: 0.9,
        };
      }
    }
  }

  // Generic error keyword fallback (lower confidence).
  const generic = tail.match(/\b(Error|Exception|FAIL|failed)\b[^\n]{0,160}/);
  if (generic) {
    return {
      category: 'unknown',
      signal: generic[0].trim().slice(0, 200),
      confidence: 0.3,
    };
  }
  return { category: 'unknown', signal: null, confidence: 0 };
}

// --- Strategy registry ------------------------------------------------------
//
// Each strategy: { name, description, transform(originalTask, context) }
// where transform returns a NEW task string (never mutates input) or null
// when the strategy chooses not to act (e.g. ask-manager).
const STRATEGIES = {
  'retry-same': {
    description: 'Re-send the task unchanged (for flakes / transient failures).',
    transform(originalTask /* , context */) {
      return originalTask || '';
    },
  },
  'retry-simpler': {
    description: 'Strip options, flags, checklists. Ask worker to focus on the core requirement.',
    transform(originalTask /* , context */) {
      const core = stripTaskOptions(originalTask || '');
      const prefix = '[C4 RECOVERY] Previous attempt failed. Retry the core requirement only — ignore optional flags / checklists, keep the change minimal:\n\n';
      return prefix + core;
    },
  },
  'retry-with-smaller-scope': {
    description: 'Ask the worker to tackle one file / one symptom at a time.',
    transform(originalTask /* , context */) {
      const core = stripTaskOptions(originalTask || '');
      const prefix = '[C4 RECOVERY] Previous attempt failed. Narrow the scope: pick ONE file (or ONE failing test) and fix just that in this pass. Report back so we can handle the rest separately.\n\nOriginal task (for reference):\n';
      return prefix + core;
    },
  },
  'ask-manager': {
    description: 'Auto-recovery has been exhausted; escalate to the human manager.',
    transform() {
      return null;
    },
  },
};

function listStrategies() {
  return Object.keys(STRATEGIES);
}

function getStrategy(name) {
  return STRATEGIES[name] || null;
}

// Strip task-level option lists / flags / bullet checklists so "retry-simpler"
// has less noise to chew through. Keeps the first line (usually the action
// verb + target) and drops any subsequent bullet/options-heavy lines.
function stripTaskOptions(task) {
  if (!task) return '';
  const lines = String(task).split(/\r?\n/);
  const kept = [];
  let keptOne = false;
  for (const ln of lines) {
    const t = ln.trim();
    if (!t) {
      if (kept.length) kept.push('');
      continue;
    }
    const isOption = /^[-*+]\s+/.test(t) || /^\d+\.\s+/.test(t) || /^(options?|flags?)\s*:/i.test(t);
    if (isOption && keptOne) continue;
    // Strip trailing "... [opts]" brackets on the action line.
    const cleaned = t.replace(/\s*\[[^\]]*\]\s*$/g, '').trim();
    if (cleaned) {
      kept.push(cleaned);
      keptOne = true;
    }
  }
  const out = kept.join('\n').trim();
  return out || String(task).trim().split(/\r?\n/)[0] || '';
}

// --- Strategy selector -------------------------------------------------------
//
// Picks a strategy for the given (category, attempt, history). `config` lets
// operators override the order via config.recovery.strategies for each
// category. Escalation: on each repeated attempt we advance one step down
// the list so the worker isn't asked the same thing twice.
function pickStrategy(category, attempt, config = {}) {
  const attemptIdx = Math.max(0, (Number(attempt) || 1) - 1);
  const ordering = resolveStrategyOrder(category, config);
  if (ordering.length === 0) return 'ask-manager';
  const idx = Math.min(attemptIdx, ordering.length - 1);
  const pick = ordering[idx];
  return STRATEGIES[pick] ? pick : 'ask-manager';
}

function resolveStrategyOrder(category, config) {
  const cfg = config && config.recovery ? config.recovery : (config || {});
  const strategies = cfg.strategies || {};
  const perCategory = strategies[category];
  if (Array.isArray(perCategory) && perCategory.length > 0) {
    return perCategory.filter((s) => !!STRATEGIES[s]);
  }
  // Sensible defaults per category.
  switch (category) {
    case 'test-fail':
      return ['retry-same', 'retry-simpler', 'retry-with-smaller-scope', 'ask-manager'];
    case 'build-fail':
      return ['retry-simpler', 'retry-with-smaller-scope', 'ask-manager'];
    case 'tool-deny':
      // Tool-denials usually need human approval; go straight to manager
      // after one simpler re-ask in case the worker asked for an over-broad
      // permission (retry-simpler lets it try a narrower approach first).
      return ['retry-simpler', 'ask-manager'];
    case 'timeout':
      return ['retry-same', 'retry-same', 'ask-manager'];
    case 'dependency':
      return ['ask-manager'];
    case 'unknown':
    default:
      return ['retry-simpler', 'ask-manager'];
  }
}

// --- History tracking --------------------------------------------------------
//
// Writes one JSON line per recovery attempt. Non-destructive: append-only,
// creates the directory on demand, silently tolerates transient write errors
// (the recovery action itself already happened; losing the audit line is not
// a reason to fail the recovery).
function historyPath(projectRoot) {
  const root = projectRoot || process.cwd();
  return path.join(root, '.c4', 'recovery-history.jsonl');
}

function appendHistory(projectRoot, entry) {
  const file = historyPath(projectRoot);
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
  } catch {}
  const record = {
    time: new Date().toISOString(),
    ...entry,
  };
  try {
    fs.appendFileSync(file, JSON.stringify(record) + '\n', 'utf8');
    return { ok: true, path: file, record };
  } catch (err) {
    return { ok: false, path: file, error: err && err.message ? err.message : String(err) };
  }
}

function readHistory(projectRoot, filter = {}) {
  const file = historyPath(projectRoot);
  let raw;
  try {
    raw = fs.readFileSync(file, 'utf8');
  } catch {
    return [];
  }
  const out = [];
  for (const line of raw.split(/\r?\n/)) {
    const t = line.trim();
    if (!t) continue;
    let obj;
    try { obj = JSON.parse(t); } catch { continue; }
    if (filter.worker && obj.worker !== filter.worker) continue;
    if (filter.category && obj.category !== filter.category) continue;
    out.push(obj);
  }
  if (Number(filter.limit) > 0) return out.slice(-Number(filter.limit));
  return out;
}

// --- Orchestration -----------------------------------------------------------
//
// recoverWorker(manager, name, options)
//   - manager: an object with the narrow surface we need:
//       config        : daemon config
//       getScrollback : (name, lines) => { content } | { error }
//       workers       : Map keyed by name (optional, used for intervention check)
//       sendTask      : (name, task, opts) => result
//       notifications : (optional) with pushAll(message)
//   - options:
//       manual       : bool, true when invoked via `c4 recover <name>`
//       projectRoot  : override history directory
//       categoryHint : force a category (manual override)
//       attempt      : attempt number (computed from history when absent)
//
// Returns { ok, recovered, skipped, reason?, strategy, category, action,
//            attempt, historyPath }.
function recoverWorker(manager, name, options = {}) {
  const opts = options || {};
  const cfg = (manager && typeof manager.getConfig === 'function' ? manager.getConfig() : (manager && manager.config) || {}) || {};
  const rcfg = cfg.recovery || {};
  const enabled = rcfg.enabled === true || opts.manual === true;
  if (!enabled) {
    return { ok: true, recovered: false, skipped: true, reason: 'recovery-disabled', strategy: null };
  }

  if (!manager || typeof manager.sendTask !== 'function') {
    return { ok: false, recovered: false, skipped: true, reason: 'invalid-manager', strategy: null };
  }

  // Intervention guard: do NOT recover when the worker is parked at a user
  // question or a critical_deny - that's "human needed", not "automation
  // stuck". 'escalation' is the auto-error state we DO act on.
  const worker = (manager.workers && typeof manager.workers.get === 'function')
    ? manager.workers.get(name)
    : null;
  if (worker) {
    const iv = worker._interventionState;
    if (iv === 'question' || iv === 'critical_deny') {
      return { ok: true, recovered: false, skipped: true, reason: `intervention:${iv}`, strategy: null };
    }
  }

  // Scrollback tail -> classification.
  let scroll = '';
  try {
    const sb = typeof manager.getScrollback === 'function'
      ? manager.getScrollback(name, opts.scrollbackLines || 400)
      : null;
    if (sb && typeof sb === 'object' && !sb.error && typeof sb.content === 'string') {
      scroll = sb.content;
    }
  } catch {}
  const classification = opts.categoryHint
    ? { category: String(opts.categoryHint), signal: 'manual-hint', confidence: 1 }
    : classifyError(scroll);

  // Attempt counter is derived from existing history so repeated calls
  // escalate through the strategy list.
  const projectRoot = opts.projectRoot
    || (cfg.worktree && cfg.worktree.projectRoot)
    || path.resolve(__dirname, '..');
  const past = readHistory(projectRoot, { worker: name });
  const priorAttempts = past.filter((r) => r && r.phase !== 'give-up' && r.phase !== 'skipped').length;
  const attempt = Number(opts.attempt) > 0 ? Number(opts.attempt) : priorAttempts + 1;

  const maxAttempts = Number(rcfg.maxAttempts) > 0 ? Number(rcfg.maxAttempts) : 3;
  if (attempt > maxAttempts) {
    const rec = appendHistory(projectRoot, {
      worker: name,
      category: classification.category,
      signal: classification.signal,
      attempt,
      strategy: 'ask-manager',
      phase: 'give-up',
      reason: `max-attempts-${maxAttempts}`,
      manual: !!opts.manual,
    });
    notifyEscalation(manager, name, `[RECOVERY] ${name}: max attempts (${maxAttempts}) reached — escalating to manager.`);
    return {
      ok: true,
      recovered: false,
      skipped: false,
      reason: 'max-attempts',
      strategy: 'ask-manager',
      category: classification.category,
      attempt,
      action: 'notify',
      historyPath: rec.path,
    };
  }

  const strategyName = pickStrategy(classification.category, attempt, cfg);
  const strategy = STRATEGIES[strategyName];
  const originalTask = (worker && worker._taskText) || (opts.originalTask || '');
  const newTask = strategy && typeof strategy.transform === 'function'
    ? strategy.transform(originalTask, { classification, attempt, worker })
    : null;

  if (strategyName === 'ask-manager' || newTask == null || newTask === '') {
    notifyEscalation(manager, name, `[RECOVERY] ${name}: strategy=ask-manager category=${classification.category} attempt=${attempt}`);
    const rec = appendHistory(projectRoot, {
      worker: name,
      category: classification.category,
      signal: classification.signal,
      attempt,
      strategy: 'ask-manager',
      phase: 'notified',
      manual: !!opts.manual,
    });
    return {
      ok: true,
      recovered: false,
      skipped: false,
      strategy: 'ask-manager',
      category: classification.category,
      attempt,
      action: 'notify',
      historyPath: rec.path,
    };
  }

  // Apply strategy = re-send the transformed task. Use `reuse:true` so
  // sendTask does NOT create a fresh branch / worktree — recovery is
  // always on the live worker. Never pass `skipChecks` or similar bypass.
  let sendResult = null;
  let error = null;
  try {
    sendResult = manager.sendTask(name, newTask, {
      reuse: true,
      autoMode: !!(rcfg.autoMode),
    });
  } catch (err) {
    error = err && err.message ? err.message : String(err);
  }
  const outcome = (sendResult && !sendResult.error && !error) ? 'applied' : 'send-failed';

  const rec = appendHistory(projectRoot, {
    worker: name,
    category: classification.category,
    signal: classification.signal,
    attempt,
    strategy: strategyName,
    phase: outcome,
    manual: !!opts.manual,
    error: error || (sendResult && sendResult.error) || null,
  });

  if (outcome === 'applied' && manager.notifications && typeof manager.notifications.pushAll === 'function') {
    try {
      manager.notifications.pushAll(`[RECOVERY] ${name}: strategy=${strategyName} category=${classification.category} attempt=${attempt}/${maxAttempts}`);
    } catch {}
  }

  return {
    ok: true,
    recovered: outcome === 'applied',
    skipped: false,
    strategy: strategyName,
    category: classification.category,
    attempt,
    action: 'send-task',
    sendResult,
    error: error || (sendResult && sendResult.error) || null,
    historyPath: rec.path,
  };
}

function notifyEscalation(manager, name, message) {
  try {
    const ns = manager && manager.notifications;
    if (ns && typeof ns.pushAll === 'function') {
      ns.pushAll(message);
    }
  } catch {}
}

module.exports = {
  // classification
  classifyError,
  CATEGORY_PATTERNS,
  // strategies
  STRATEGIES,
  getStrategy,
  listStrategies,
  pickStrategy,
  resolveStrategyOrder,
  stripTaskOptions,
  // history
  historyPath,
  appendHistory,
  readHistory,
  // orchestration
  recoverWorker,
};
