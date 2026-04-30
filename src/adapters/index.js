// (TODO 9.1) Adapter registry. Resolves a c4 target / config to an
// AgentAdapter instance. Default = ClaudeCodeAdapter.

'use strict';

const AgentAdapter = require('./agent-adapter');
const ClaudeCodeAdapter = require('./claude-code-adapter');
const LocalLlmAdapter = require('./local-llm-adapter');
const ComputerUseAdapter = require('./computer-use-adapter');

const REGISTRY = {
  'claude-code':   ClaudeCodeAdapter,
  'local-llm':     LocalLlmAdapter,
  'computer-use':  ComputerUseAdapter,
  generic:         AgentAdapter,
};

function register(name, ctor) {
  if (typeof ctor !== 'function') throw new Error('adapter ctor must be a class/function');
  REGISTRY[name] = ctor;
}

function getAdapter(name = 'claude-code', opts = {}) {
  const Ctor = REGISTRY[name] || REGISTRY['claude-code'];
  return new Ctor(opts);
}

function listAdapters() {
  return Object.keys(REGISTRY);
}

module.exports = {
  AgentAdapter,
  ClaudeCodeAdapter,
  LocalLlmAdapter,
  ComputerUseAdapter,
  register,
  getAdapter,
  listAdapters,
};
