// 9.2 LocalLlmAdapter — adapter for terminal-based local-LLM CLIs that
// accept "prompt → response" turns without Claude Code's TUI permission
// prompts. Targets Ollama, llama.cpp's `llama-run`, and any CLI exposing
// a "give me a prompt, print the answer" REPL.
//
// Detection model is much simpler than ClaudeCodeAdapter:
//   - There are no permission prompts (auto-approve everywhere).
//   - "Ready" is signalled by a configurable readyPrompt (default '> ').
//   - There are no model-menu / effort prompts.
//
// Override patterns via config.compatibility.patterns or by passing
// `patterns: { readyPrompt }` to the adapter constructor.

'use strict';

const AgentAdapter = require('./agent-adapter');

const DEFAULT_PATTERNS = {
  // No trust / permission flow — everything is local CLI.
  trustPrompt:        '__never__match__',
  permissionPrompt:   '__never__match__',
  fileCreatePrompt:   '__never__match__',
  fileEditPrompt:     '__never__match__',
  bashHeader:         '__never__match__',
  editHeader:         '__never__match__',
  createHeader:       '__never__match__',
  yesOption:          '',
  yesAlwaysEditOption:'',
  yesAlwaysBashOption:'',
  noOption:           '',
  promptFooter:       '',
  readyPrompt:        '> ',
  readyIndicator:     '> ',
  modelMenuIndicator: '__never__match__',
  effortIndicator:    '__never__match__',
};

class LocalLlmAdapter extends AgentAdapter {
  constructor(opts = {}) {
    const patterns = { ...DEFAULT_PATTERNS, ...(opts.patterns || {}) };
    super({ name: 'local-llm', patterns, alwaysApproveForSession: false });
    this.runtime = opts.runtime || 'ollama'; // ollama | llama-run | custom
    this.model = opts.model || 'llama3.1';
  }

  // Always allow — no permission flow.
  isPermissionPrompt() { return false; }
  isTrustPrompt()      { return false; }
  isModelMenu()        { return false; }

  // Approve / deny / trust have no meaning here; return Enter so the
  // PtyManager hooks become no-ops if they ever fire by accident.
  getApproveKeys() { return '\r'; }
  getDenyKeys()    { return '\r'; }
  getTrustKeys()   { return '\r'; }
  getModelMenuKeys() { return ''; }
  getEffortKeys()  { return ''; }

  matchVersion() { return false; }

  // Hint for the registry / dispatch layer: which command should the
  // PtyManager spawn for this target?
  spawnCommand() {
    if (this.runtime === 'ollama')    return ['ollama', ['run', this.model]];
    if (this.runtime === 'llama-run') return ['llama-run', ['--model', this.model]];
    return [this.runtime, []];
  }
}

module.exports = LocalLlmAdapter;
