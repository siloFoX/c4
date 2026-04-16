'use strict';
require('./jest-shim');

const path = require('path');
const fs = require('fs');

// --- Mock PtyManager with relevant methods ---
class MockPtyManager {
  constructor(config = {}) {
    this.config = {
      daemon: { port: 3456, host: '127.0.0.1' },
      hooks: { enabled: true, injectToWorkers: true },
      rules: { appendToTask: true },
      profiles: {},
      ...config
    };
    this.projectRoot = '/tmp/c4-project';
    this._writtenFiles = {};
    this._origWriteFileSync = fs.writeFileSync;
    fs.writeFileSync = (filePath, content, encoding) => {
      this._writtenFiles[filePath.replace(/\\/g, '/')] = { content, encoding };
    };
  }

  restore() {
    fs.writeFileSync = this._origWriteFileSync;
  }

  // 5.49: hash character detection
  _maybeWriteTaskFile(worker, fullText) {
    const hasHash = fullText.includes('#');
    if ((fullText.length > 1000 || hasHash) && worker.worktree) {
      const taskFilePath = path.join(worker.worktree, '.c4-task.md').replace(/\\/g, '/');
      fs.writeFileSync(taskFilePath, fullText, 'utf8');
      const cdPath = worker.worktree.replace(/\\/g, '/');
      return `${taskFilePath} 파일을 읽고 지시대로 작업해. cd ${cdPath} 후 작업 시작.`;
    }
    return fullText;
  }

  // 5.50: rules summary
  _getRulesSummary() {
    const rules = this.config.rules;
    if (!rules || !rules.appendToTask) return null;
    if (rules.summary) return rules.summary;

    return [
      '[C4 규칙 — 반드시 준수]',
      '- 복합 명령(&&, |, ;) 사용 금지 → 단일 명령으로 분리',
      '- IMPORTANT: git -C <path> 형태만 허용. cd 후 git 절대 금지 (cd X && git Y, cd X; git Y 모두 불가)',
      '- sleep 대신 c4 wait <name> 사용',
      '- /model 등 슬래시 명령: MSYS_NO_PATHCONV=1 c4 send 사용',
      '- main 직접 커밋 금지 → 브랜치에서 작업',
      '- 작업 루틴: 구현 → 테스트 → 문서 업데이트 → 커밋',
    ].join('\n');
  }

  // 5.48: worker settings builder (simplified for testing permissions)
  _getProfile(name) {
    return this.config.profiles[name] || null;
  }

  _buildCompoundBlockCommand() {
    return 'node "compound-check.js"';
  }

  _buildHookCommands(workerName) {
    return { PreToolUse: [], PostToolUse: [] };
  }

  _isAutoModeEnabled() { return false; }
  _applyAutoMode() {}

  _buildAutoManagerPermissions() {
    return { allow: ['Bash(c4:*)'], deny: ['Read', 'Write', 'Edit'] };
  }

  _buildWorkerSettings(workerName, options = {}) {
    const profileName = options.profile || options.template || '';
    const profile = profileName ? this._getProfile(profileName) : null;
    const settings = {};

    if (options._autoWorker) {
      settings.permissions = this._buildAutoManagerPermissions();
    } else {
      const permissions = { allow: [], deny: [] };

      if (profile && profile.permissions) {
        if (Array.isArray(profile.permissions.allow)) {
          permissions.allow.push(...profile.permissions.allow);
        }
        if (Array.isArray(profile.permissions.deny)) {
          permissions.deny.push(...profile.permissions.deny);
        }
      }

      const defaultPerms = [
        'Bash(c4:*)',
        'Bash(MSYS_NO_PATHCONV=1 c4:*)',
        'Bash(git:*)',
        // Compound command patterns (5.48)
        'Bash(cd * && *)',
        'Bash(cd * ; *)',
        'Bash(cd * || *)',
        'Bash(npm:*)', 'Bash(npx:*)', 'Bash(node:*)',
        'Read', 'Edit', 'Write', 'Glob', 'Grep',
      ];
      for (const perm of defaultPerms) {
        if (!permissions.allow.includes(perm)) {
          permissions.allow.push(perm);
        }
      }

      settings.permissions = permissions;
    }

    settings.hooks = {};
    settings.hooks.PreToolUse = [{
      matcher: 'Bash',
      hooks: [{ type: 'command', command: this._buildCompoundBlockCommand() }]
    }];

    return settings;
  }
}

// ============================================================
// 5.49: _maybeWriteTaskFile — hash character triggers file mode
// ============================================================
describe('5.49: _maybeWriteTaskFile hash character detection', () => {
  let mgr;

  beforeEach(() => {
    mgr = new MockPtyManager();
  });

  test('short text with # saves to file (hash triggers file mode)', () => {
    const worker = { worktree: '/tmp/wt' };
    const text = 'task with # comment';
    const result = mgr._maybeWriteTaskFile(worker, text);
    expect(result).toContain('.c4-task.md');
    expect(result).toContain('cd /tmp/wt');
    const written = mgr._writtenFiles['/tmp/wt/.c4-task.md'];
    expect(written).toBeDefined();
    expect(written.content).toBe(text);
    mgr.restore();
  });

  test('short text without # returned as-is', () => {
    const worker = { worktree: '/tmp/wt' };
    const text = 'simple task no hash';
    const result = mgr._maybeWriteTaskFile(worker, text);
    expect(result).toBe(text);
    expect(Object.keys(mgr._writtenFiles)).toHaveLength(0);
    mgr.restore();
  });

  test('hash without worktree returned as-is', () => {
    const worker = {};
    const text = 'task with # but no worktree';
    const result = mgr._maybeWriteTaskFile(worker, text);
    expect(result).toBe(text);
    expect(Object.keys(mgr._writtenFiles)).toHaveLength(0);
    mgr.restore();
  });

  test('markdown heading triggers file mode', () => {
    const worker = { worktree: '/tmp/wt' };
    const text = '## Step 1\ndo something';
    const result = mgr._maybeWriteTaskFile(worker, text);
    expect(result).toContain('.c4-task.md');
    mgr.restore();
  });

  test('code comment with # triggers file mode', () => {
    const worker = { worktree: '/tmp/wt' };
    const text = 'edit config.py\n# this is a comment';
    const result = mgr._maybeWriteTaskFile(worker, text);
    expect(result).toContain('.c4-task.md');
    const written = mgr._writtenFiles['/tmp/wt/.c4-task.md'];
    expect(written.content).toContain('# this is a comment');
    mgr.restore();
  });

  test('long text still triggers file mode (existing behavior preserved)', () => {
    const worker = { worktree: '/tmp/wt' };
    const text = 'a'.repeat(1500);
    const result = mgr._maybeWriteTaskFile(worker, text);
    expect(result).toContain('.c4-task.md');
    mgr.restore();
  });
});

// ============================================================
// 5.50: _getRulesSummary — git -C rule strengthened
// ============================================================
describe('5.50: _getRulesSummary git -C enforcement', () => {
  let mgr;

  beforeEach(() => {
    mgr = new MockPtyManager();
  });

  test('rules contain git -C enforcement', () => {
    const rules = mgr._getRulesSummary();
    expect(rules).toContain('git -C <path>');
    mgr.restore();
  });

  test('rules explicitly forbid cd followed by git', () => {
    const rules = mgr._getRulesSummary();
    expect(rules).toContain('cd 후 git 절대 금지');
    mgr.restore();
  });

  test('rules mention both && and ; patterns as forbidden', () => {
    const rules = mgr._getRulesSummary();
    expect(rules).toContain('cd X && git Y');
    expect(rules).toContain('cd X; git Y');
    mgr.restore();
  });

  test('rules marked as IMPORTANT', () => {
    const rules = mgr._getRulesSummary();
    expect(rules).toContain('IMPORTANT');
    mgr.restore();
  });

  test('null when appendToTask disabled', () => {
    mgr.config.rules = { appendToTask: false };
    const rules = mgr._getRulesSummary();
    expect(rules).toBeNull();
    mgr.restore();
  });

  test('custom summary overrides default', () => {
    mgr.config.rules = { appendToTask: true, summary: 'custom rules' };
    const rules = mgr._getRulesSummary();
    expect(rules).toBe('custom rules');
    mgr.restore();
  });
});

// ============================================================
// 5.48: _buildWorkerSettings — compound command patterns
// ============================================================
describe('5.48: _buildWorkerSettings compound command permissions', () => {
  let mgr;

  beforeEach(() => {
    mgr = new MockPtyManager();
  });

  test('includes cd && pattern', () => {
    const settings = mgr._buildWorkerSettings('w1');
    expect(settings.permissions.allow).toContain('Bash(cd * && *)');
    mgr.restore();
  });

  test('includes cd ; pattern', () => {
    const settings = mgr._buildWorkerSettings('w1');
    expect(settings.permissions.allow).toContain('Bash(cd * ; *)');
    mgr.restore();
  });

  test('includes cd || pattern', () => {
    const settings = mgr._buildWorkerSettings('w1');
    expect(settings.permissions.allow).toContain('Bash(cd * || *)');
    mgr.restore();
  });

  test('compound patterns not duplicated with profile', () => {
    mgr.config.profiles.test = {
      permissions: { allow: ['Bash(cd * && *)'], deny: [] }
    };
    const settings = mgr._buildWorkerSettings('w1', { profile: 'test' });
    const cdAndCount = settings.permissions.allow.filter(p => p === 'Bash(cd * && *)').length;
    expect(cdAndCount).toBe(1);
    mgr.restore();
  });

  test('auto-manager skips default perms (no compound patterns)', () => {
    const settings = mgr._buildWorkerSettings('mgr', { _autoWorker: true });
    expect(settings.permissions.allow).toContain('Bash(c4:*)');
    expect(settings.permissions.allow).not.toContain('Bash(cd * && *)');
    mgr.restore();
  });

  test('PreToolUse compound block hook present', () => {
    const settings = mgr._buildWorkerSettings('w1');
    expect(settings.hooks.PreToolUse).toBeDefined();
    expect(settings.hooks.PreToolUse.length).toBeGreaterThan(0);
    const bashHook = settings.hooks.PreToolUse.find(h => h.matcher === 'Bash');
    expect(bashHook).toBeDefined();
    mgr.restore();
  });
});
