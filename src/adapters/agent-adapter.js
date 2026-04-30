// (TODO 9.1) AgentAdapter — abstract surface PtyManager talks to instead of
// hard-coding Claude Code TUI assumptions. The default adapter wraps the
// existing TerminalInterface (3.13) so today's c4 keeps working unchanged.
// Future adapters (Cursor / Aider / OpenHands / local LLM) implement the
// same interface and slot in via `config.agentDefaults.adapter` or
// per-target `adapter: 'name'`.
//
// API the manager relies on (mirrors what TerminalInterface already does):
//   isTrustPrompt(text)      -> boolean
//   isPermissionPrompt(text) -> boolean
//   isReady(text)            -> boolean
//   isModelMenu(text)        -> boolean
//   getPromptType(text)      -> 'create'|'edit'|'bash'|'unknown'
//   extractBashCommand(text) -> string
//   extractFileName(text)    -> string
//   countOptions(text)       -> number
//   getApproveKeys(text)     -> string
//   getDenyKeys(text)        -> string
//   getTrustKeys()           -> string
//   getModelMenuKeys()       -> string
//   getEffortKeys(level, default) -> string
//   getEscapeKey()           -> string
//
// Adapters MAY add:
//   matchVersion(version)    -> boolean      (used during boot to pick adapter)
//   patternsForVersion(v)    -> object       (override patterns per-version)

'use strict';

const TerminalInterface = require('../terminal-interface');

class AgentAdapter {
  constructor({ name, patterns = {}, alwaysApproveForSession = false } = {}) {
    this.name = name || 'generic';
    this.terminal = new TerminalInterface(patterns, { alwaysApproveForSession });
  }

  // Detection
  isTrustPrompt(text)      { return this.terminal.isTrustPrompt(text); }
  isPermissionPrompt(text) { return this.terminal.isPermissionPrompt(text); }
  isReady(text)            { return this.terminal.isReady(text); }
  isModelMenu(text)        { return this.terminal.isModelMenu(text); }
  getPromptType(text)      { return this.terminal.getPromptType(text); }
  extractBashCommand(text) { return this.terminal.extractBashCommand(text); }
  extractFileName(text)    { return this.terminal.extractFileName(text); }
  countOptions(text)       { return this.terminal.countOptions(text); }

  // Keystrokes
  getApproveKeys(text)     { return this.terminal.getApproveKeys(text); }
  getDenyKeys(text)        { return this.terminal.getDenyKeys(text); }
  getTrustKeys()           { return this.terminal.getTrustKeys(); }
  getModelMenuKeys()       { return this.terminal.getModelMenuKeys(); }
  getEffortKeys(level, def){ return this.terminal.getEffortKeys(level, def); }
  getEscapeKey()           { return this.terminal.getEscapeKey(); }

  // Optional version negotiation
  matchVersion(/* version */) { return true; }
  patternsForVersion(/* version */) { return {}; }
}

module.exports = AgentAdapter;
