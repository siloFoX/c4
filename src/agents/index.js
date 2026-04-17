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

const REGISTRY = {
  'claude-code': ClaudeCodeAdapter,
  'local-ollama': LocalOllamaAdapter,
  'local-llama-cpp': LocalLlamaCppAdapter,
  'local-vllm': LocalVllmAdapter,
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
  resolveAdapterOptions,
  DEFAULT_HYBRID_THRESHOLD,
  DEFAULT_COMPLEX_KEYWORDS,
  DEFAULT_HYBRID_LOCAL,
  DEFAULT_HYBRID_COMPLEX,
  LocalLLMAdapter,
  LocalOllamaAdapter,
  LocalLlamaCppAdapter,
  LocalVllmAdapter,
};
