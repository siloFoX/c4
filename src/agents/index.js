/**
 * Agent Framework - Factory (9.1 phase 1 + 9.2 local LLM + hybrid routing)
 *
 * createAdapter(agentConfig, legacyOpts) returns the concrete Adapter for
 * the requested agent type. `agentConfig` follows the config.example.json
 * `agent` shape:
 *   {
 *     "type": "claude-code" | "local-ollama" | "local-llama-cpp"
 *           | "local-vllm" | "hybrid",
 *     "options": { ... }              // adapter-specific options
 *   }
 *
 * `legacyOpts` is a compatibility slot so existing call sites that already
 * pass `patterns` + `alwaysApproveForSession` keep working without
 * restructuring - these are merged under `agentConfig.options`.
 *
 * To add a new adapter (e.g. the 9.2 local-llm work):
 *   1. Implement a class extending Adapter in src/agents/<name>.js
 *   2. Register it in REGISTRY below
 *   3. Document it in patches/<version>-<name>.md
 * No daemon wiring change is required: PtyManager speaks to whatever
 * adapter the factory returns.
 *
 * Hybrid routing (9.2):
 *   - When `agentConfig.type === 'hybrid'` or `legacyOpts.hybrid === true`,
 *     the factory inspects the prompt / task string (`legacyOpts.task` or
 *     `legacyOpts.prompt`) and picks between a local backend and Claude
 *     Code based on a heuristic:
 *       * char length > hybridThreshold (default 2000) -> complex
 *       * matches any complex keyword (default: refactor / architect /
 *         design) -> complex
 *       * otherwise -> local
 *   - Config knobs on `agentConfig`:
 *       local:            registry key for the "simple" branch (default
 *                         'local-ollama')
 *       complex:          registry key for the "complex" branch (default
 *                         'claude-code')
 *       hybridThreshold:  integer, chars
 *       complexKeywords:  array of string keywords (case-insensitive)
 */

const { validateAdapter } = require('./adapter');
const ClaudeCodeAdapter = require('./claude-code');
const {
  LocalLLMAdapter,
  LocalOllamaAdapter,
  LocalLlamaCppAdapter,
  LocalVllmAdapter,
} = require('./local-llm');
const MockAdapter = require('./mock');
const CodexAdapter = require('./codex');

const REGISTRY = {
  'claude-code': ClaudeCodeAdapter,
  'local-ollama': LocalOllamaAdapter,
  'local-llama-cpp': LocalLlamaCppAdapter,
  'local-vllm': LocalVllmAdapter,
  // (v1.10.71) mock adapter — test infra + reference for new
  // backends (codex, claude-agent-sdk, …). Always available; the
  // factory doesn't load production credentials so registering it
  // costs nothing.
  'mock': MockAdapter,
  // (v1.10.75) codex adapter — PTY-driven scaffold for OpenAI's
  // codex CLI. Operator supplies binary path + readyPrompt /
  // readyIndicator patterns via config; C4 doesn't hard-code codex
  // UI strings since they drift release-to-release.
  'codex': CodexAdapter,
};

const DEFAULT_HYBRID_THRESHOLD = 2000;
const DEFAULT_COMPLEX_KEYWORDS = ['refactor', 'architect', 'architecture', 'design'];
const DEFAULT_HYBRID_LOCAL = 'local-ollama';
const DEFAULT_HYBRID_COMPLEX = 'claude-code';

/**
 * Decide whether a task string looks "complex" and therefore belongs on
 * Claude Code instead of a local LLM.
 * @param {string} task
 * @param {{threshold?: number, keywords?: string[]}} [opts]
 * @returns {boolean}
 */
function isComplexTask(task, opts) {
  if (typeof task !== 'string' || task.length === 0) return false;
  const o = opts || {};
  const threshold = Number.isFinite(Number(o.threshold)) && Number(o.threshold) > 0
    ? Number(o.threshold)
    : DEFAULT_HYBRID_THRESHOLD;
  if (task.length > threshold) return true;
  const kw = (Array.isArray(o.keywords) && o.keywords.length > 0) ? o.keywords : DEFAULT_COMPLEX_KEYWORDS;
  const lowered = task.toLowerCase();
  for (const raw of kw) {
    if (typeof raw !== 'string' || !raw) continue;
    if (lowered.includes(raw.toLowerCase())) return true;
  }
  return false;
}

/**
 * Given a hybrid agent config + a task string, decide which registry key to
 * actually instantiate.
 * @param {string} task
 * @param {object} [agentConfig]
 * @returns {string}
 */
function pickHybridType(task, agentConfig) {
  const cfg = agentConfig || {};
  const local = typeof cfg.local === 'string' && cfg.local ? cfg.local : DEFAULT_HYBRID_LOCAL;
  const complex = typeof cfg.complex === 'string' && cfg.complex ? cfg.complex : DEFAULT_HYBRID_COMPLEX;
  const complexKeywords = Array.isArray(cfg.complexKeywords) ? cfg.complexKeywords : undefined;
  const threshold = cfg.hybridThreshold;
  return isComplexTask(task, { threshold, keywords: complexKeywords }) ? complex : local;
}

/**
 * Rules-based router (v1.10.76) — supersedes the binary hybrid heuristic
 * for callers who need multi-tier routing (e.g. local-ollama for short,
 * local-vllm for medium, claude-code for complex).
 *
 * Each rule is `{ if?: <Condition>, default?: true, use: <REGISTRY key> }`.
 * Rules are evaluated in order; first match wins. A `default: true` rule
 * (typically last) catches anything that didn't match upstream.
 *
 * Condition shape (all keys optional, all must be true if multiple
 * specified — AND semantics):
 *   - lengthLte:  number   — task.length <= n
 *   - lengthGte:  number   — task.length >= n
 *   - matches:    string   — regex source (case-insensitive); task matches
 *   - notMatches: string   — regex source (case-insensitive); task does NOT match
 *
 * Returns the first matching rule's `use`. Falls back to
 * `agentConfig.fallback` (or DEFAULT_HYBRID_COMPLEX) if no rule matches
 * AND no default rule was supplied.
 *
 * Bad rule entries (missing `use`, invalid regex, non-array `rules`) are
 * skipped silently — operator config errors should not crash the daemon.
 *
 * @param {string} task
 * @param {object} [agentConfig]
 * @returns {string}
 */
function pickRoutedType(task, agentConfig) {
  const cfg = agentConfig || {};
  const fallback = typeof cfg.fallback === 'string' && cfg.fallback
    ? cfg.fallback
    : DEFAULT_HYBRID_COMPLEX;
  const rules = Array.isArray(cfg.rules) ? cfg.rules : [];
  const t = typeof task === 'string' ? task : '';

  for (const rule of rules) {
    if (!rule || typeof rule !== 'object') continue;
    if (typeof rule.use !== 'string' || rule.use.length === 0) continue;
    if (rule.default === true) {
      return rule.use;
    }
    if (_matchesRule(t, rule.if)) {
      return rule.use;
    }
  }
  return fallback;
}

/**
 * Pure helper: evaluate one Condition. Empty / missing condition matches
 * (so `{ default: true, use: ... }` doesn't need an empty `if: {}`).
 * @param {string} task
 * @param {object|undefined} cond
 * @returns {boolean}
 */
function _matchesRule(task, cond) {
  if (!cond || typeof cond !== 'object') return false;
  if (typeof cond.lengthLte === 'number' && Number.isFinite(cond.lengthLte)) {
    if (task.length > cond.lengthLte) return false;
  }
  if (typeof cond.lengthGte === 'number' && Number.isFinite(cond.lengthGte)) {
    if (task.length < cond.lengthGte) return false;
  }
  if (typeof cond.matches === 'string' && cond.matches.length > 0) {
    let re;
    try { re = new RegExp(cond.matches, 'i'); } catch { return false; }
    if (!re.test(task)) return false;
  }
  if (typeof cond.notMatches === 'string' && cond.notMatches.length > 0) {
    let re;
    try { re = new RegExp(cond.notMatches, 'i'); } catch { return false; }
    if (re.test(task)) return false;
  }
  // At least one criterion must have been specified — empty `if: {}`
  // is a configuration smell, treat as no-match so the operator
  // notices.
  const hasAny = ['lengthLte', 'lengthGte', 'matches', 'notMatches']
    .some((k) => cond[k] !== undefined);
  return hasAny;
}

/**
 * Prefer per-type sub-bag under options[type]; fall back to flat options so
 * legacy callers that pass a flat options object keep working.
 */
function resolveAdapterOptions(agentConfig, type) {
  const opts = (agentConfig && agentConfig.options) || {};
  if (opts && typeof opts === 'object' && opts[type] && typeof opts[type] === 'object') {
    return opts[type];
  }
  return opts;
}

/**
 * @param {{ type?: string, options?: object, hybrid?: boolean,
 *           hybridThreshold?: number, complexKeywords?: string[],
 *           local?: string, complex?: string }} agentConfig
 * @param {object} legacyOpts - merged under agentConfig.options; may carry a
 *                              `task` / `prompt` string used for hybrid
 *                              routing, and a `hybrid` boolean override
 * @returns {import('./adapter').Adapter}
 */
function createAdapter(agentConfig = {}, legacyOpts = {}) {
  let type = (agentConfig && agentConfig.type) || 'claude-code';
  const hybridRequested = type === 'hybrid'
    || Boolean(legacyOpts && legacyOpts.hybrid === true);
  if (hybridRequested) {
    const task = String(
      (legacyOpts && (legacyOpts.task || legacyOpts.prompt)) || ''
    );
    type = pickHybridType(task, agentConfig);
  }
  // (v1.10.76) Rules-based router — multi-tier alternative to hybrid.
  // Evaluated AFTER hybrid resolution so a `'router'` type takes the
  // routing path; existing `'hybrid'` callers keep their behavior
  // unchanged.
  if (type === 'router') {
    const task = String(
      (legacyOpts && (legacyOpts.task || legacyOpts.prompt)) || ''
    );
    type = pickRoutedType(task, agentConfig);
  }
  const AdapterClass = REGISTRY[type];
  if (!AdapterClass) {
    const known = Object.keys(REGISTRY).join(', ');
    throw new Error(`Unknown agent type: ${type}. Registered: ${known}`);
  }
  const adapterOpts = resolveAdapterOptions(agentConfig, type);
  const merged = { ...(legacyOpts || {}), ...(adapterOpts || {}) };
  const patterns = merged.patterns || {};
  const instance = new AdapterClass(patterns, merged);
  validateAdapter(instance);
  return instance;
}

/**
 * List adapter types currently registered.
 * @returns {string[]}
 */
function listAdapterTypes() {
  return Object.keys(REGISTRY);
}

module.exports = {
  createAdapter,
  listAdapterTypes,
  REGISTRY,
  isComplexTask,
  pickHybridType,
  pickRoutedType,
  resolveAdapterOptions,
  DEFAULT_HYBRID_THRESHOLD,
  DEFAULT_COMPLEX_KEYWORDS,
  DEFAULT_HYBRID_LOCAL,
  DEFAULT_HYBRID_COMPLEX,
  LocalLLMAdapter,
  LocalOllamaAdapter,
  LocalLlamaCppAdapter,
  LocalVllmAdapter,
  MockAdapter,
  CodexAdapter,
};
