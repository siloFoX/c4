const assert = require('assert');
const { describe, it } = require('node:test');

describe('Autonomy Level 4 (4.5)', () => {

  function createMockManager(configOverrides = {}) {
    const mgr = {
      config: {
        autoApprove: {
          enabled: true,
          autonomyLevel: 0,
          rules: [
            { pattern: 'Bash(ls:*)', action: 'approve' },
            { pattern: 'Bash(grep:*)', action: 'approve' },
            { pattern: 'Bash(rm:*)', action: 'deny' },
            { pattern: 'Bash(sudo:*)', action: 'deny' },
            { pattern: 'Bash(shutdown:*)', action: 'deny' },
            { pattern: 'Write', action: 'approve' },
            { pattern: 'Edit', action: 'approve' },
          ],
          defaultAction: 'ask',
          ...configOverrides
        },
        compatibility: { patterns: {} },
      },
      _globalAutoMode: false,
    };

    mgr._getAutonomyLevel = function() {
      return this.config.autoApprove?.autonomyLevel ?? 0;
    };

    mgr._getPatterns = function() {
      return {
        bashHeader: 'Run shell command',
        fileCreatePrompt: 'Create new file',
        fileEditPrompt: 'Edit file',
        editHeader: 'Edit file',
        createHeader: 'Create new file',
      };
    };

    mgr._getPromptType = function(screenText) {
      const p = this._getPatterns();
      if (screenText.includes(p.fileCreatePrompt)) return 'create';
      if (screenText.includes(p.fileEditPrompt)) return 'edit';
      if (screenText.includes(p.bashHeader)) return 'bash';
      return 'unknown';
    };

    mgr._extractBashCommand = function(screenText) {
      const lines = screenText.split('\n');
      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed.startsWith('$') || (trimmed.length > 0 && !trimmed.includes('Run shell command') && !trimmed.includes('Do you want') && !trimmed.match(/^\d+\.\s/))) {
          const cmd = trimmed.replace(/^\$\s*/, '');
          if (cmd.length > 0 && cmd !== 'Run shell command') return cmd;
        }
      }
      return null;
    };

    mgr._classifyPermission = function(screenText, worker) {
      const rules = this.config.autoApprove?.rules || [];
      const autonomyLevel = this._getAutonomyLevel();
      const defaultAction = (this._globalAutoMode || worker?._autoWorker)
        ? 'approve'
        : (this.config.autoApprove?.defaultAction || 'ask');
      const promptType = this._getPromptType(screenText);

      let action = defaultAction;

      if (promptType === 'bash') {
        const command = this._extractBashCommand(screenText);
        if (!command) return defaultAction;

        const cmdName = command.split(/\s+/)[0].replace(/['"]/g, '');

        for (const rule of rules) {
          const exactMatch = rule.pattern.match(/^Bash\((\w+)\)$/);
          if (exactMatch && exactMatch[1] === cmdName) {
            action = rule.action;
            break;
          }
          const prefixMatch = rule.pattern.match(/^Bash\((\w+):\*\)$/);
          if (prefixMatch && prefixMatch[1] === cmdName) {
            action = rule.action;
            break;
          }
        }

      } else if (promptType === 'create' || promptType === 'edit') {
        for (const rule of rules) {
          if (rule.pattern === 'Write' && promptType === 'create') { action = rule.action; break; }
          if (rule.pattern === 'Edit' && promptType === 'edit') { action = rule.action; break; }
        }
      }

      // Level 4 (4.5): full autonomy — override deny to approve with logging
      if (autonomyLevel >= 4 && action === 'deny') {
        const command = this._extractBashCommand(screenText) || '';
        if (worker) {
          worker.snapshots = worker.snapshots || [];
          worker.snapshots.push({
            time: Date.now(),
            screen: `[AUTONOMY L4] deny overridden to approve: ${command.substring(0, 100)}`,
            autoAction: true,
            autonomyOverride: true
          });
        }
        return 'approve';
      }

      return action;
    };

    return mgr;
  }

  // --- _getAutonomyLevel ---

  it('returns 0 when not configured', () => {
    const mgr = createMockManager({});
    // Default is already 0 in our mock
    assert.strictEqual(mgr._getAutonomyLevel(), 0);
  });

  it('returns configured autonomyLevel', () => {
    const mgr = createMockManager({ autonomyLevel: 4 });
    assert.strictEqual(mgr._getAutonomyLevel(), 4);
  });

  it('returns 0 when config missing autonomyLevel', () => {
    const mgr = createMockManager({});
    delete mgr.config.autoApprove.autonomyLevel;
    assert.strictEqual(mgr._getAutonomyLevel(), 0);
  });

  // --- Level 0-3: deny stays deny ---

  it('Level 0: rm command is denied', () => {
    const mgr = createMockManager({ autonomyLevel: 0 });
    const screen = 'Run shell command\n   rm -rf /tmp/foo\n1. Yes\n2. No';
    const worker = { snapshots: [] };
    assert.strictEqual(mgr._classifyPermission(screen, worker), 'deny');
  });

  it('Level 3: rm command is denied', () => {
    const mgr = createMockManager({ autonomyLevel: 3 });
    const screen = 'Run shell command\n   rm -rf /tmp/foo\n1. Yes\n2. No';
    const worker = { snapshots: [] };
    assert.strictEqual(mgr._classifyPermission(screen, worker), 'deny');
  });

  // --- Level 4: deny overridden to approve ---

  it('Level 4: rm command is approved with log', () => {
    const mgr = createMockManager({ autonomyLevel: 4 });
    const screen = 'Run shell command\n   rm -rf /tmp/foo\n1. Yes\n2. No';
    const worker = { snapshots: [] };
    const result = mgr._classifyPermission(screen, worker);
    assert.strictEqual(result, 'approve');
    assert.strictEqual(worker.snapshots.length, 1);
    assert.ok(worker.snapshots[0].screen.includes('[AUTONOMY L4]'));
    assert.strictEqual(worker.snapshots[0].autonomyOverride, true);
  });

  it('Level 4: sudo command is approved with log', () => {
    const mgr = createMockManager({ autonomyLevel: 4 });
    const screen = 'Run shell command\n   sudo apt install foo\n1. Yes\n2. No';
    const worker = { snapshots: [] };
    const result = mgr._classifyPermission(screen, worker);
    assert.strictEqual(result, 'approve');
    assert.strictEqual(worker.snapshots.length, 1);
    assert.ok(worker.snapshots[0].screen.includes('sudo'));
  });

  it('Level 4: shutdown command is approved with log', () => {
    const mgr = createMockManager({ autonomyLevel: 4 });
    const screen = 'Run shell command\n   shutdown -h now\n1. Yes\n2. No';
    const worker = { snapshots: [] };
    const result = mgr._classifyPermission(screen, worker);
    assert.strictEqual(result, 'approve');
  });

  it('Level 4: approved commands stay approved (no extra log)', () => {
    const mgr = createMockManager({ autonomyLevel: 4 });
    const screen = 'Run shell command\n   ls -la\n1. Yes\n2. No';
    const worker = { snapshots: [] };
    const result = mgr._classifyPermission(screen, worker);
    assert.strictEqual(result, 'approve');
    assert.strictEqual(worker.snapshots.length, 0); // No autonomy override log
  });

  it('Level 4: unmatched command gets defaultAction', () => {
    const mgr = createMockManager({ autonomyLevel: 4 });
    const screen = 'Run shell command\n   python script.py\n1. Yes\n2. No';
    const worker = { snapshots: [] };
    const result = mgr._classifyPermission(screen, worker);
    assert.strictEqual(result, 'ask'); // defaultAction
    assert.strictEqual(worker.snapshots.length, 0);
  });

  it('Level 4 with global auto mode: unmatched returns approve', () => {
    const mgr = createMockManager({ autonomyLevel: 4 });
    mgr._globalAutoMode = true;
    const screen = 'Run shell command\n   python script.py\n1. Yes\n2. No';
    const worker = { snapshots: [] };
    const result = mgr._classifyPermission(screen, worker);
    assert.strictEqual(result, 'approve');
  });

  it('Level 4: works with null worker (no crash)', () => {
    const mgr = createMockManager({ autonomyLevel: 4 });
    const screen = 'Run shell command\n   rm -rf /tmp/foo\n1. Yes\n2. No';
    // Passing null worker should not crash
    const result = mgr._classifyPermission(screen, null);
    assert.strictEqual(result, 'approve');
  });

  // --- Level 5+ treated same as Level 4 ---

  it('Level 5: deny overridden same as Level 4', () => {
    const mgr = createMockManager({ autonomyLevel: 5 });
    const screen = 'Run shell command\n   rm -rf /tmp/foo\n1. Yes\n2. No';
    const worker = { snapshots: [] };
    const result = mgr._classifyPermission(screen, worker);
    assert.strictEqual(result, 'approve');
  });

  // --- File operations at Level 4 ---

  it('Level 4: Write (create) stays approved', () => {
    const mgr = createMockManager({ autonomyLevel: 4 });
    const screen = 'Create new file\n   /tmp/foo.js\n1. Yes\n2. No';
    const worker = { snapshots: [] };
    const result = mgr._classifyPermission(screen, worker);
    assert.strictEqual(result, 'approve');
    assert.strictEqual(worker.snapshots.length, 0); // Not an override
  });
});
