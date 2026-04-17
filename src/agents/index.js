/**
 * Agent Framework - Factory (9.1 phase 1)
 *
 * createAdapter(agentConfig, legacyOpts) returns the concrete Adapter for
 * the requested agent type. `agentConfig` follows the config.example.json
 * `agent` shape:
 *   {
 *     "type": "claude-code",          // registry key (default)
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
 */

const { validateAdapter } = require('./adapter');
const ClaudeCodeAdapter = require('./claude-code');

const REGISTRY = {
  'claude-code': ClaudeCodeAdapter,
};

/**
 * @param {{ type?: string, options?: object }} agentConfig
 * @param {object} legacyOpts - merged under agentConfig.options
 * @returns {import('./adapter').Adapter}
 */
function createAdapter(agentConfig = {}, legacyOpts = {}) {
  const type = (agentConfig && agentConfig.type) || 'claude-code';
  const AdapterClass = REGISTRY[type];
  if (!AdapterClass) {
    const known = Object.keys(REGISTRY).join(', ');
    throw new Error(`Unknown agent type: ${type}. Registered: ${known}`);
  }
  const merged = { ...(legacyOpts || {}), ...((agentConfig && agentConfig.options) || {}) };
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

module.exports = { createAdapter, listAdapterTypes, REGISTRY };
