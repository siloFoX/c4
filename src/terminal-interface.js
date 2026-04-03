/**
 * TerminalInterface (3.13)
 *
 * Abstract layer between C4 and Claude Code (or any terminal agent).
 * Isolates all Claude-Code-specific detection patterns and keystrokes
 * so that version changes or alternative agents only require updating
 * this single file.
 */

class TerminalInterface {
  /**
   * @param {object} patterns - Pattern configuration (from config.compatibility.patterns)
   * @param {object} options
   * @param {boolean} options.alwaysApproveForSession
   */
  constructor(patterns = {}, options = {}) {
    this.patterns = {
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
      ...patterns,
    };
    this.alwaysApproveForSession = options.alwaysApproveForSession || false;
  }

  // --- Detection methods ---

  /**
   * Detect if screen shows a trust folder prompt.
   */
  isTrustPrompt(screenText) {
    return screenText.includes(this.patterns.trustPrompt);
  }

  /**
   * Detect if screen shows any permission prompt.
   */
  isPermissionPrompt(screenText) {
    return screenText.includes(this.patterns.permissionPrompt) ||
           screenText.includes(this.patterns.fileCreatePrompt) ||
           screenText.includes(this.patterns.fileEditPrompt);
  }

  /**
   * Detect if the agent is ready to accept input (idle at prompt).
   */
  isReady(screenText) {
    return screenText.includes(this.patterns.readyPrompt) &&
           screenText.includes(this.patterns.readyIndicator);
  }

  /**
   * Detect if the model selection menu is showing.
   */
  isModelMenu(screenText) {
    return screenText.includes(this.patterns.modelMenuIndicator) &&
           screenText.includes(this.patterns.effortIndicator);
  }

  /**
   * Get the type of permission prompt being displayed.
   */
  getPromptType(screenText) {
    if (screenText.includes(this.patterns.fileCreatePrompt)) return 'create';
    if (screenText.includes(this.patterns.fileEditPrompt)) return 'edit';
    if (screenText.includes(this.patterns.bashHeader)) return 'bash';
    if (screenText.includes(this.patterns.editHeader)) return 'edit';
    if (screenText.includes(this.patterns.createHeader)) return 'create';
    return 'unknown';
  }

  /**
   * Extract bash command from permission prompt screen.
   */
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
            trimmed.startsWith('❯') ||
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

  /**
   * Extract file name from permission prompt screen.
   */
  extractFileName(screenText) {
    let match = screenText.match(/Do you want to create ([^\s?]+)\??/);
    if (match) return match[1];
    match = screenText.match(/Do you want to make this edit to ([^\s?]+)\??/);
    if (match) return match[1];
    return '';
  }

  /**
   * Count numbered options in a prompt.
   */
  countOptions(screenText) {
    const matches = screenText.match(/^\s*\d+\.\s/gm);
    return matches ? matches.length : 2;
  }

  // --- Keystroke generation ---

  /**
   * Get keystrokes to approve a permission prompt.
   */
  getApproveKeys(screenText) {
    const numOptions = this.countOptions(screenText);
    if (this.alwaysApproveForSession && numOptions >= 2) {
      return '\x1b[B\r'; // Down + Enter (select "don't ask again")
    }
    return '\r'; // Enter (first option)
  }

  /**
   * Get keystrokes to deny a permission prompt.
   */
  getDenyKeys(screenText) {
    const numOptions = this.countOptions(screenText);
    let keys = '';
    for (let i = 1; i < numOptions; i++) {
      keys += '\x1b[B'; // Down
    }
    keys += '\r'; // Enter
    return keys;
  }

  /**
   * Get keystrokes to trust folder.
   */
  getTrustKeys() {
    return '\r'; // Enter
  }

  /**
   * Get keystrokes to open model menu.
   */
  getModelMenuKeys() {
    return '/model\r';
  }

  /**
   * Get keystrokes to set effort level from model menu.
   * @param {string} targetLevel - 'low', 'medium', 'high', 'max'
   * @param {string} defaultLevel - Current default level (default: 'high')
   */
  getEffortKeys(targetLevel, defaultLevel = 'high') {
    const levels = ['low', 'medium', 'high', 'max'];
    const defaultIdx = levels.indexOf(defaultLevel);
    const targetIdx = levels.indexOf(targetLevel);
    const steps = targetIdx - defaultIdx;

    let keys = '';
    if (steps > 0) {
      for (let i = 0; i < steps; i++) keys += '\x1b[C'; // Right
    } else if (steps < 0) {
      for (let i = 0; i < Math.abs(steps); i++) keys += '\x1b[D'; // Left
    }
    keys += '\r'; // Enter to confirm
    return keys;
  }

  /**
   * Get escape key to cancel/clear.
   */
  getEscapeKey() {
    return '\x1b';
  }
}

module.exports = TerminalInterface;
