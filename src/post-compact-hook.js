/**
 * Post-compact hook (8.45)
 *
 * Detect Claude Code auto-compact events in worker PTY output and
 * re-inject a role-specific rule template so halt-prevention rules,
 * merge criteria, and anti-spawn guidance survive context compaction.
 *
 * Also exposes a drift detector so the first N Bash tool invocations
 * after a compact can be audited for forbidden compound patterns; a
 * drift signals that the worker has already started regressing toward
 * behavior that was supposed to be pruned by the rules.
 *
 * Pure-logic module by design. `injectRules` takes the manager as an
 * argument instead of importing it so this file is easy to unit-test
 * without spinning up a PTY.
 */

const fs = require('fs');
const path = require('path');

// Markers emitted by Claude Code when /compact completes (either the
// operator ran it, or Claude Code triggered it automatically past the
// context threshold). The list is intentionally conservative - it is
// better to miss a detection than to spam re-injections on unrelated
// chatter. When Claude Code ships a new surface string, add it here.
const COMPACT_MARKERS = [
  /Context (?:compacted|was compacted|has been compacted)/i,
  /Conversation (?:compacted|was compacted|has been compacted)/i,
  /Compacting conversation/i,
  /\/compact (?:complete|completed|done|finished)/i,
  /Previous Conversation Compacted/i,
  /Context window compacted/i,
];

// Patterns the manager/worker rule templates explicitly forbid. Drift
// detection uses these on the first few Bash tool invocations that
// follow a compact - if any match we assume the worker forgot the
// halt-prevention rules and needs a stronger nudge.
const DRIFT_PATTERNS = [
  { name: 'and-chain', re: /&&/ },
  { name: 'or-chain', re: /\|\|/ },
  // Single pipe (excludes '||'). Uses a leading negative lookbehind
  // approximation: reject '|' that is not preceded or followed by
  // another '|'. Works for both 'a | b' and '| b' at string start.
  { name: 'pipe', re: /(^|[^|])\|(?!\|)/ },
  { name: 'semicolon', re: /;\s*\w/ },
  { name: 'cd-then-git', re: /\bcd\s+\S+[\s\S]*?\bgit\b/ },
  { name: 'sleep-poll', re: /\bsleep\s+\d+/ },
  { name: 'for-loop', re: /^\s*for\s+\S+\s+in\b/m },
  { name: 'while-loop', re: /^\s*while\s+/m },
];

const DEFAULT_DEBOUNCE_MS = 60 * 1000;
const DEFAULT_DRIFT_WINDOW = 3;
const DEFAULT_VERIFY_TIMEOUT_MS = 10000;
const DEFAULT_TEMPLATE_DIR = path.join(__dirname, '..', 'docs', 'rules');

/**
 * Detect whether `chunk` contains a compact completion marker.
 *
 * @param {string|Buffer} chunk - PTY output chunk.
 * @param {object} [state] - Per-worker detection state.
 *   { lastFiredAt: number, debounceMs: number, now: number }
 * @returns {{ fired: boolean, at?: number, pattern?: string,
 *             suppressed?: boolean, reason?: string }}
 */
function detectCompactEvent(chunk, state = {}) {
  if (chunk == null) return { fired: false };
  const text = typeof chunk === 'string' ? chunk : String(chunk);
  if (!text) return { fired: false };
  let matched = null;
  for (const re of COMPACT_MARKERS) {
    if (re.test(text)) { matched = re; break; }
  }
  if (!matched) return { fired: false };
  const now = Number.isFinite(state.now) ? state.now : Date.now();
  const debounceMs = Number.isFinite(state.debounceMs) ? state.debounceMs : DEFAULT_DEBOUNCE_MS;
  const last = state.lastFiredAt || 0;
  if (last > 0 && now - last < debounceMs) {
    return { fired: false, suppressed: true, reason: 'debounce', at: now };
  }
  return { fired: true, at: now, pattern: matched.source };
}

/**
 * Resolve the worker tier used to pick the rule template. Attached
 * sessions get the lightest template, managers get the strictest one.
 */
function resolveWorkerType(worker) {
  if (!worker || typeof worker !== 'object') return 'worker';
  if (worker.kind === 'attached' || worker.tier === 'attached') return 'attached';
  if (worker._autoWorker || worker.tier === 'manager') return 'manager';
  return 'worker';
}

/**
 * Load the rule template for `workerType` from `templateDir`. Falls
 * back to the generic `worker` template if the role-specific file
 * does not exist so an unknown role still gets sane rules instead of
 * silently skipping re-injection.
 */
function getRuleTemplate(workerType, options = {}) {
  const baseDir = options.templateDir || DEFAULT_TEMPLATE_DIR;
  const type = typeof workerType === 'string' && workerType ? workerType : 'worker';
  const candidates = [path.join(baseDir, `${type}-post-compact.md`)];
  if (type !== 'worker') {
    candidates.push(path.join(baseDir, 'worker-post-compact.md'));
  }
  for (const file of candidates) {
    try {
      if (fs.existsSync(file)) {
        return { content: fs.readFileSync(file, 'utf8'), path: file, fallback: file !== candidates[0] };
      }
    } catch {
      // Unreadable file - try the next candidate.
    }
  }
  return { content: null, path: null, fallback: false };
}

/**
 * Compose the injection payload: banner + template body. The banner
 * is deliberately short so the operator / log reader can tell at a
 * glance which worker was reminded and when.
 */
function buildBanner(workerType, workerName, now) {
  const role = workerType === 'manager' ? 'MANAGER'
    : workerType === 'attached' ? 'ATTACHED'
    : 'WORKER';
  const ts = new Date(Number.isFinite(now) ? now : Date.now()).toISOString();
  return [
    '<!-- C4 POST-COMPACT RULE RE-INJECTION (8.45) -->',
    `[C4 POST-COMPACT ${role}] context was compacted for ${workerName} at ${ts}.`,
    'Re-read the rules below before your next action and reply "rules received" to acknowledge.',
  ].join('\n');
}

function buildPayload(template, banner) {
  return `${banner}\n\n${template}\n`;
}

/**
 * Inject the post-compact template into `workerName`. Caller owns the
 * manager reference so this stays easy to unit-test (pass a stub with
 * a matching `send` / `workers` surface).
 */
async function injectRules(manager, workerName, options = {}) {
  if (!manager || typeof manager !== 'object') {
    return { injected: false, error: 'manager required' };
  }
  const worker = manager.workers && typeof manager.workers.get === 'function'
    ? manager.workers.get(workerName)
    : null;
  if (!worker) return { injected: false, error: `Worker '${workerName}' not found` };
  const workerType = options.workerType || resolveWorkerType(worker);
  const tpl = getRuleTemplate(workerType, options);
  if (!tpl.content) {
    return { injected: false, error: `No template for workerType=${workerType}`, workerType };
  }
  const now = Number.isFinite(options.now) ? options.now : Date.now();
  const banner = buildBanner(workerType, workerName, now);
  const payload = buildPayload(tpl.content, banner);
  let sendResult = null;
  try {
    if (typeof manager.send === 'function') {
      sendResult = await manager.send(workerName, payload, false);
    } else {
      return { injected: false, error: 'manager.send missing', workerType };
    }
  } catch (err) {
    return { injected: false, error: String(err && err.message || err), workerType };
  }
  // Snapshot so `c4 read` / SSE observers see the injection in-band.
  if (Array.isArray(worker.snapshots)) {
    worker.snapshots.push({
      time: now,
      screen: `[C4 POST-COMPACT] rules re-injected for ${workerName} (role=${workerType}, bytes=${payload.length})`,
      autoAction: true,
    });
  }
  return {
    injected: true,
    workerType,
    templatePath: tpl.path,
    fallback: tpl.fallback,
    bytes: payload.length,
    sendResult,
  };
}

/**
 * Inspect a Bash command string for patterns the post-compact rules
 * forbid. Returns the matching pattern or null.
 */
function detectDrift(bashCommand) {
  if (bashCommand == null) return null;
  const cmd = typeof bashCommand === 'string' ? bashCommand : String(bashCommand);
  if (!cmd) return null;
  for (const { name, re } of DRIFT_PATTERNS) {
    if (re.test(cmd)) {
      return { name, pattern: re.source, command: cmd.slice(0, 200) };
    }
  }
  return null;
}

/**
 * Track whether a Bash observation falls inside the drift-inspection
 * window that follows a compact. Returns { inWindow, observed, drift }.
 *
 * The caller owns the window state object and is responsible for
 * persisting it on the worker. Designed so tests can drive the window
 * explicitly without wall-clock timers.
 */
function updateDriftWindow(state, bashCommand, options = {}) {
  const windowSize = Number.isFinite(options.windowSize) ? options.windowSize : DEFAULT_DRIFT_WINDOW;
  if (!state || !state.active) {
    return { inWindow: false, observed: 0, drift: null };
  }
  state.observed = (state.observed || 0) + 1;
  const drift = detectDrift(bashCommand);
  if (drift) state.drifts = (state.drifts || []).concat(drift);
  if (state.observed >= windowSize) state.active = false;
  return {
    inWindow: true,
    observed: state.observed,
    drift,
    closed: !state.active,
    windowSize,
  };
}

function createDriftWindow() {
  return { active: false, observed: 0, drifts: [] };
}

function armDriftWindow(state, opts = {}) {
  if (!state || typeof state !== 'object') return createDriftWindow();
  state.active = true;
  state.observed = 0;
  state.drifts = [];
  state.openedAt = Number.isFinite(opts.now) ? opts.now : Date.now();
  return state;
}

module.exports = {
  COMPACT_MARKERS,
  DRIFT_PATTERNS,
  DEFAULT_DEBOUNCE_MS,
  DEFAULT_DRIFT_WINDOW,
  DEFAULT_VERIFY_TIMEOUT_MS,
  DEFAULT_TEMPLATE_DIR,
  detectCompactEvent,
  resolveWorkerType,
  getRuleTemplate,
  buildBanner,
  buildPayload,
  injectRules,
  detectDrift,
  updateDriftWindow,
  createDriftWindow,
  armDriftWindow,
};
