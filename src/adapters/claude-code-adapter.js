// (TODO 9.1) ClaudeCodeAdapter — concrete adapter that targets the Claude
// Code CLI TUI. Inherits everything from AgentAdapter and pins the patterns
// c4 has been carrying inline. Adding new Claude Code versions only
// requires extending `VERSION_PATTERNS` here.

'use strict';

const AgentAdapter = require('./agent-adapter');

const DEFAULT_PATTERNS = {
  trustPrompt: 'trust this folder',
  permissionPrompt: 'Do you want to proceed?',
  fileCreatePrompt: 'Do you want to create',
  fileEditPrompt: 'Do you want to make this edit',
  bashHeader: 'Bash command',
  editHeader: 'Edit file',
  createHeader: 'Create file',
  yesOption: '1. Yes',
  yesAlwaysEditOption: 'Yes, allow all edits during this session',
  yesAlwaysBashOption: "Yes, and don't ask again for:",
  noOption: 'No',
  promptFooter: 'Esc to cancel',
  readyPrompt: '❯',
  readyIndicator: 'for shortcuts',
  modelMenuIndicator: 'to adjust',
  effortIndicator: 'effort',
};

// Per-major-version overrides. `match` returns true for versions we know
// about; merge `patterns` into DEFAULT_PATTERNS for those.
const VERSION_RULES = [
  {
    match: (v) => /^2\.1\.(11[2-9]|1[2-9][0-9])/.test(v),
    patterns: {
      // 2.1.112+ uses /effort and /model slash commands; pattern set
      // unchanged so far, but reserved for future 2.1.x deltas.
    },
  },
];

class ClaudeCodeAdapter extends AgentAdapter {
  constructor(opts = {}) {
    const version = opts.version || '';
    const overrides = ClaudeCodeAdapter.patternsForVersion(version);
    const patterns = { ...DEFAULT_PATTERNS, ...overrides, ...(opts.patterns || {}) };
    super({ name: 'claude-code', patterns, alwaysApproveForSession: opts.alwaysApproveForSession });
    this.version = version;
  }

  matchVersion(version) {
    return /^2\.\d+\.\d+/.test(version);
  }

  static patternsForVersion(version) {
    if (!version) return {};
    for (const rule of VERSION_RULES) {
      if (rule.match(version)) return rule.patterns || {};
    }
    return {};
  }
}

module.exports = ClaudeCodeAdapter;
