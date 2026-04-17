/**
 * Claude Code Adapter (9.1 phase 1)
 *
 * Concrete Adapter implementation for the Claude Code CLI. Carries all the
 * pattern-matching, keystroke generation, and idle detection that used to
 * live on src/terminal-interface.js, plus the new Agent Framework surface
 * (init / sendInput / sendKey / onOutput / detectIdle + metadata).
 *
 * The daemon (src/pty-manager.js) still spawns `claude` via node-pty - this
 * adapter does not own the PTY lifecycle. It only speaks the agent protocol
 * once the PTY is attached via init(workerCtx).
 */

const { Adapter } = require('./adapter');

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
  readyPrompt: '\u276f',
  readyIndicator: 'for shortcuts',
  modelMenuIndicator: 'to adjust',
  effortIndicator: 'effort',
};

const KEY_MAP = {
  Enter: '\r',
  Return: '\r',
  Escape: '\x1b',
  Esc: '\x1b',
  Tab: '\t',
  Backspace: '\x7f',
  Up: '\x1b[A',
  Down: '\x1b[B',
  Right: '\x1b[C',
  Left: '\x1b[D',
  'C-c': '\x03',
  'C-d': '\x04',
};

class ClaudeCodeAdapter extends Adapter {
  /**
   * @param {object} patterns - Pattern overrides (from config.compatibility.patterns)
   * @param {object} options
   * @param {boolean} options.alwaysApproveForSession
   */
  constructor(patterns = {}, options = {}) {
    super();
    this.patterns = { ...DEFAULT_PATTERNS, ...(patterns || {}) };
    this.alwaysApproveForSession = !!(options && options.alwaysApproveForSession);
  }

  // --- Adapter interface ---

  get metadata() {
    return { name: 'claude-code', version: '1.0.0' };
  }

  get supportsPause() {
    return false;
  }

  init(workerCtx) {
    this._workerCtx = workerCtx || null;
  }

  sendInput(text) {
    if (typeof text !== 'string') {
      throw new TypeError('sendInput requires a string');
    }
    const proc = this._workerCtx && this._workerCtx.proc;
    if (proc && typeof proc.write === 'function') {
      proc.write(text);
    }
  }

  sendKey(key) {
    const mapped = Object.prototype.hasOwnProperty.call(KEY_MAP, key) ? KEY_MAP[key] : key;
    this.sendInput(mapped);
  }

  detectIdle(chunk) {
    return this.isReady(String(chunk == null ? '' : chunk));
  }

  // --- Claude Code specific detection ---

  isTrustPrompt(screenText) {
    return screenText.includes(this.patterns.trustPrompt);
  }

  isPermissionPrompt(screenText) {
    return screenText.includes(this.patterns.permissionPrompt) ||
           screenText.includes(this.patterns.fileCreatePrompt) ||
           screenText.includes(this.patterns.fileEditPrompt);
  }

  isReady(screenText) {
    return screenText.includes(this.patterns.readyPrompt) &&
           screenText.includes(this.patterns.readyIndicator);
  }

  isModelMenu(screenText) {
    return screenText.includes(this.patterns.modelMenuIndicator) &&
           screenText.includes(this.patterns.effortIndicator);
  }

  getPromptType(screenText) {
    if (screenText.includes(this.patterns.fileCreatePrompt)) return 'create';
    if (screenText.includes(this.patterns.fileEditPrompt)) return 'edit';
    if (screenText.includes(this.patterns.bashHeader)) return 'bash';
    if (screenText.includes(this.patterns.editHeader)) return 'edit';
    if (screenText.includes(this.patterns.createHeader)) return 'create';
    return 'unknown';
  }

  extractBashCommand(screenText) {
    const lines = screenText.split('\n');
    let inBashBlock = false;
    let command = '';

    for (const line of lines) {
      if (line.includes(this.patterns.bashHeader)) {
        inBashBlock = true;
        continue;
      }
      if (inBashBlock) {
        const trimmed = line.trim();
        if (trimmed.includes('Do you want') ||
            trimmed.includes('Esc to cancel') ||
            trimmed.startsWith('\u276f') ||
            trimmed.match(/^\d+\.\s/)) {
          break;
        }
        if (line.match(/^\s{2,}/) && trimmed.length > 0 &&
            !trimmed.includes('Run shell command') &&
            !trimmed.includes('This command requires')) {
          command += (command ? ' ' : '') + trimmed;
        }
      }
    }

    return command;
  }

  extractFileName(screenText) {
    let match = screenText.match(/Do you want to create ([^\s?]+)\??/);
    if (match) return match[1];
    match = screenText.match(/Do you want to make this edit to ([^\s?]+)\??/);
    if (match) return match[1];
    return '';
  }

  countOptions(screenText) {
    const matches = screenText.match(/^\s*\d+\.\s/gm);
    return matches ? matches.length : 2;
  }

  // --- Keystroke generators ---

  getApproveKeys(screenText) {
    const numOptions = this.countOptions(screenText);
    if (this.alwaysApproveForSession && numOptions >= 2) {
      return '\x1b[B\r';
    }
    return '\r';
  }

  getDenyKeys(screenText) {
    const numOptions = this.countOptions(screenText);
    let keys = '';
    for (let i = 1; i < numOptions; i++) {
      keys += '\x1b[B';
    }
    keys += '\r';
    return keys;
  }

  getTrustKeys() {
    return '\r';
  }

  getModelMenuKeys() {
    return '/model\r';
  }

  getEffortKeys(targetLevel, defaultLevel = 'high') {
    const levels = ['low', 'medium', 'high', 'max'];
    const defaultIdx = levels.indexOf(defaultLevel);
    const targetIdx = levels.indexOf(targetLevel);
    const steps = targetIdx - defaultIdx;

    let keys = '';
    if (steps > 0) {
      for (let i = 0; i < steps; i++) keys += '\x1b[C';
    } else if (steps < 0) {
      for (let i = 0; i < Math.abs(steps); i++) keys += '\x1b[D';
    }
    keys += '\r';
    return keys;
  }

  getEscapeKey() {
    return '\x1b';
  }
}

module.exports = ClaudeCodeAdapter;
module.exports.DEFAULT_PATTERNS = DEFAULT_PATTERNS;
module.exports.KEY_MAP = KEY_MAP;
