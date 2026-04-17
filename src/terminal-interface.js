/**
 * TerminalInterface (3.13, refactored for 9.1 phase 1)
 *
 * Historically this file held all Claude-Code-specific detection patterns
 * and keystrokes. Phase 1 of TODO 9.1 (Agent Framework) extracts that
 * behavior into src/agents/claude-code.js and keeps this file as a thin
 * backward-compatible factory wrapper:
 *
 *   new TerminalInterface(patterns, options)
 *     -> createAdapter({ type: options.agent?.type || 'claude-code' })
 *     -> returns the concrete Adapter instance directly
 *
 * Because the constructor explicitly returns the adapter, every legacy
 * call site (`new TerminalInterface(...).isReady(...)`) keeps working
 * unchanged - the returned object exposes the same method surface that
 * used to live on this class.
 *
 * New code should call createAdapter() directly and inspect
 * adapter.metadata / adapter.supportsPause to stay adapter-agnostic.
 *
 * Future adapters (local-llm, codex, claude-agent-sdk - see TODO 9.2+)
 * only need to register a new class in src/agents/index.js; this file
 * does not need to change again.
 */

const { createAdapter, listAdapterTypes, REGISTRY } = require('./agents');
const { Adapter, validateAdapter } = require('./agents/adapter');
const ClaudeCodeAdapter = require('./agents/claude-code');

class TerminalInterface {
  /**
   * @param {object} patterns - Pattern overrides (from config.compatibility.patterns)
   * @param {object} options
   * @param {boolean} [options.alwaysApproveForSession]
   * @param {{ type?: string, options?: object }} [options.agent] - agent selection
   */
  constructor(patterns = {}, options = {}) {
    const agentCfg = (options && options.agent) || { type: 'claude-code' };
    const legacyOpts = {
      patterns: patterns || {},
      alwaysApproveForSession: !!(options && options.alwaysApproveForSession),
    };
    const adapter = createAdapter(agentCfg, legacyOpts);
    return adapter;
  }
}

module.exports = TerminalInterface;
module.exports.TerminalInterface = TerminalInterface;
module.exports.createAdapter = createAdapter;
module.exports.listAdapterTypes = listAdapterTypes;
module.exports.REGISTRY = REGISTRY;
module.exports.Adapter = Adapter;
module.exports.ClaudeCodeAdapter = ClaudeCodeAdapter;
module.exports.validateAdapter = validateAdapter;
