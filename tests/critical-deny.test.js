const assert = require('assert');
const { describe, it } = require('node:test');

// Mirror of CRITICAL_DENY_PATTERNS from src/pty-manager.js (5.13 / 7.26)
const CRITICAL_DENY_PATTERNS = [
  /\brm\s+-rf\s+[\/\\]/,
  /\bgit\s+push\s+--force/,
  /\bgit\s+push\s+-f\b/,
  /\bDROP\s+(TABLE|DATABASE)/i,
  /\bsudo\s+rm\b/,
  /\bshutdown\b/,
  /\breboot\b/,
  /\bmkfs\b/,
  /\bdd\s+if=/,
  /\bgit\s+reset\s+--hard\s+origin/,
  /\bgit\s+filter-branch\b/,
  /\bchmod\s+-R\s+777\b/,
  /\bchmod\s+777\s+\//,
  /\bfind\s+\/[^|]*\s-delete\b/,
  />\s*\/dev\/sd[a-z]\b/,
  /:\s*\(\)\s*\{\s*:\s*\|\s*:\s*&\s*\}\s*;\s*:/,
];

describe('CRITICAL_DENY_PATTERNS (5.13)', () => {

  // --- Pattern matching tests ---

  it('matches rm -rf /', () => {
    assert.ok(CRITICAL_DENY_PATTERNS.some(p => p.test('rm -rf /')));
  });

  it('matches rm -rf /tmp', () => {
    assert.ok(CRITICAL_DENY_PATTERNS.some(p => p.test('rm -rf /tmp')));
  });

  it('matches rm -rf \\Windows', () => {
    assert.ok(CRITICAL_DENY_PATTERNS.some(p => p.test('rm -rf \\Windows')));
  });

  it('matches git push --force', () => {
    assert.ok(CRITICAL_DENY_PATTERNS.some(p => p.test('git push --force')));
  });

  it('matches git push -f', () => {
    assert.ok(CRITICAL_DENY_PATTERNS.some(p => p.test('git push -f origin main')));
  });

  it('matches DROP TABLE', () => {
    assert.ok(CRITICAL_DENY_PATTERNS.some(p => p.test('DROP TABLE users')));
  });

  it('matches drop database (case insensitive)', () => {
    assert.ok(CRITICAL_DENY_PATTERNS.some(p => p.test('drop database production')));
  });

  it('matches sudo rm', () => {
    assert.ok(CRITICAL_DENY_PATTERNS.some(p => p.test('sudo rm -rf /etc')));
  });

  it('matches shutdown', () => {
    assert.ok(CRITICAL_DENY_PATTERNS.some(p => p.test('shutdown -h now')));
  });

  it('matches reboot', () => {
    assert.ok(CRITICAL_DENY_PATTERNS.some(p => p.test('reboot')));
  });

  it('matches mkfs', () => {
    assert.ok(CRITICAL_DENY_PATTERNS.some(p => p.test('mkfs.ext4 /dev/sda1')));
  });

  it('matches dd if=', () => {
    assert.ok(CRITICAL_DENY_PATTERNS.some(p => p.test('dd if=/dev/zero of=/dev/sda')));
  });

  it('matches git reset --hard origin', () => {
    assert.ok(CRITICAL_DENY_PATTERNS.some(p => p.test('git reset --hard origin/main')));
  });

  // --- Non-matching (safe commands) ---

  it('does NOT match rm (without -rf /)', () => {
    assert.ok(!CRITICAL_DENY_PATTERNS.some(p => p.test('rm file.txt')));
  });

  it('does NOT match git push (without --force)', () => {
    assert.ok(!CRITICAL_DENY_PATTERNS.some(p => p.test('git push origin main')));
  });

  it('does NOT match git reset --hard HEAD', () => {
    assert.ok(!CRITICAL_DENY_PATTERNS.some(p => p.test('git reset --hard HEAD')));
  });

  it('does NOT match ls -la', () => {
    assert.ok(!CRITICAL_DENY_PATTERNS.some(p => p.test('ls -la')));
  });

  // --- 7.26 additions ---

  it('matches git filter-branch', () => {
    assert.ok(CRITICAL_DENY_PATTERNS.some(p => p.test('git filter-branch --tree-filter foo')));
  });

  it('matches chmod -R 777 anywhere', () => {
    assert.ok(CRITICAL_DENY_PATTERNS.some(p => p.test('chmod -R 777 /var/www')));
  });

  it('matches chmod 777 / (root)', () => {
    assert.ok(CRITICAL_DENY_PATTERNS.some(p => p.test('chmod 777 /')));
  });

  it('matches find / -delete', () => {
    assert.ok(CRITICAL_DENY_PATTERNS.some(p => p.test('find /etc -name "*.conf" -delete')));
  });

  it('matches raw disk write', () => {
    assert.ok(CRITICAL_DENY_PATTERNS.some(p => p.test('cat junk > /dev/sda')));
  });

  it('matches fork bomb', () => {
    assert.ok(CRITICAL_DENY_PATTERNS.some(p => p.test(':(){ :|:& };:')));
  });

  it('does NOT match safe chmod 755', () => {
    assert.ok(!CRITICAL_DENY_PATTERNS.some(p => p.test('chmod 755 script.sh')));
  });

  it('does NOT match find . -delete in cwd-relative path', () => {
    // Restricted to absolute paths starting with /
    assert.ok(!CRITICAL_DENY_PATTERNS.some(p => p.test('find . -name "*.tmp" -delete')));
  });
});

describe('L4 Critical Deny integration (5.13)', () => {

  function createMockManager(configOverrides = {}) {
    const mgr = {
      config: {
        autoApprove: {
          enabled: true,
          autonomyLevel: 4,
          rules: [
            { pattern: 'Bash(rm:*)', action: 'deny' },
            { pattern: 'Bash(sudo:*)', action: 'deny' },
            { pattern: 'Bash(shutdown:*)', action: 'deny' },
            { pattern: 'Bash(git:*)', action: 'deny' },
            { pattern: 'Bash(dd:*)', action: 'deny' },
            { pattern: 'Bash(mkfs:*)', action: 'deny' },
            { pattern: 'Bash(reboot:*)', action: 'deny' },
            { pattern: 'Bash(ls:*)', action: 'approve' },
          ],
          defaultAction: 'ask',
          ...configOverrides
        },
        compatibility: { patterns: {} },
      },
      _globalAutoMode: false,
      _notifications: null,
    };

    mgr._getAutonomyLevel = function() {
      return this.config.autoApprove?.autonomyLevel ?? 0;
    };

    mgr._getPatterns = function() {
      return {
        bashHeader: 'Run shell command',
        fileCreatePrompt: 'Create new file',
        fileEditPrompt: 'Edit file',
      };
    };

    mgr._getPromptType = function(screenText) {
      const p = this._getPatterns();
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
      }

      // Level 4: full autonomy — override deny to approve, EXCEPT critical commands (5.13)
      if (autonomyLevel >= 4 && action === 'deny') {
        const command = this._extractBashCommand(screenText) || '';
        const isCritical = CRITICAL_DENY_PATTERNS.some(p => p.test(command));
        if (isCritical) {
          if (worker) {
            worker.snapshots = worker.snapshots || [];
            worker.snapshots.push({
              time: Date.now(),
              screen: `[AUTONOMY L4 BLOCKED] critical command denied: ${command.substring(0, 100)}`,
              autoAction: true
            });
          }
          if (this._notifications) {
            this._notifications.notifyStall(worker?._taskText ? 'worker' : 'unknown', `CRITICAL DENY: ${command.substring(0, 80)}`);
          }
          return 'deny';
        }
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

  // --- Critical commands stay denied at L4 ---

  it('L4: rm -rf / is denied (critical)', () => {
    const mgr = createMockManager();
    const screen = 'Run shell command\n   rm -rf /tmp/data\n1. Yes\n2. No';
    const worker = { snapshots: [] };
    assert.strictEqual(mgr._classifyPermission(screen, worker), 'deny');
    assert.ok(worker.snapshots[0].screen.includes('[AUTONOMY L4 BLOCKED]'));
  });

  it('L4: git push --force is denied (critical)', () => {
    const mgr = createMockManager();
    const screen = 'Run shell command\n   git push --force origin main\n1. Yes\n2. No';
    const worker = { snapshots: [] };
    assert.strictEqual(mgr._classifyPermission(screen, worker), 'deny');
  });

  it('L4: git push -f is denied (critical)', () => {
    const mgr = createMockManager();
    const screen = 'Run shell command\n   git push -f origin main\n1. Yes\n2. No';
    const worker = { snapshots: [] };
    assert.strictEqual(mgr._classifyPermission(screen, worker), 'deny');
  });

  it('L4: sudo rm is denied (critical)', () => {
    const mgr = createMockManager();
    const screen = 'Run shell command\n   sudo rm -rf /etc\n1. Yes\n2. No';
    const worker = { snapshots: [] };
    assert.strictEqual(mgr._classifyPermission(screen, worker), 'deny');
  });

  it('L4: shutdown is denied (critical)', () => {
    const mgr = createMockManager();
    const screen = 'Run shell command\n   shutdown -h now\n1. Yes\n2. No';
    const worker = { snapshots: [] };
    assert.strictEqual(mgr._classifyPermission(screen, worker), 'deny');
  });

  it('L4: git reset --hard origin is denied (critical)', () => {
    const mgr = createMockManager();
    const screen = 'Run shell command\n   git reset --hard origin/main\n1. Yes\n2. No';
    const worker = { snapshots: [] };
    assert.strictEqual(mgr._classifyPermission(screen, worker), 'deny');
  });

  // --- Non-critical denied commands still get L4 override ---

  it('L4: non-critical deny is still overridden to approve', () => {
    const mgr = createMockManager({
      rules: [
        { pattern: 'Bash(curl:*)', action: 'deny' },
      ]
    });
    const screen = 'Run shell command\n   curl http://example.com\n1. Yes\n2. No';
    const worker = { snapshots: [] };
    assert.strictEqual(mgr._classifyPermission(screen, worker), 'approve');
    assert.ok(worker.snapshots[0].screen.includes('[AUTONOMY L4]'));
    assert.strictEqual(worker.snapshots[0].autonomyOverride, true);
  });

  // --- Notification test ---

  it('L4: critical deny triggers notification if available', () => {
    const mgr = createMockManager();
    let notified = false;
    mgr._notifications = {
      notifyStall: (name, msg) => {
        notified = true;
        assert.ok(msg.includes('CRITICAL DENY'));
      }
    };
    const screen = 'Run shell command\n   rm -rf /var\n1. Yes\n2. No';
    const worker = { snapshots: [] };
    mgr._classifyPermission(screen, worker);
    assert.ok(notified);
  });

  it('L4: critical deny works with null worker', () => {
    const mgr = createMockManager();
    const screen = 'Run shell command\n   rm -rf /tmp\n1. Yes\n2. No';
    assert.strictEqual(mgr._classifyPermission(screen, null), 'deny');
  });
});
