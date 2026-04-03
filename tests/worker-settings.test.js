const assert = require('assert');
const { describe, it } = require('node:test');
const fs = require('fs');
const path = require('path');
const os = require('os');

describe('Worker Settings Profile (3.16)', () => {
  function createMockManager(config = {}) {
    const mgr = {
      config: {
        daemon: { port: 3456, host: '127.0.0.1' },
        hooks: { enabled: true, injectToWorkers: true },
        profiles: {
          default: {
            permissions: {
              allow: ['Bash(git:*)', 'Bash(grep:*)'],
              deny: ['Bash(rm:*)']
            }
          },
          executor: {
            permissions: {
              allow: ['Bash(npm:*)', 'Bash(node:*)', 'Edit', 'Write'],
              deny: ['Bash(rm:*)', 'Bash(sudo:*)']
            }
          },
          reviewer: {
            permissions: {
              allow: ['Bash(git:*)'],
              deny: ['Edit', 'Write']
            }
          },
          custom_hooks: {
            permissions: { allow: [] },
            hooks: {
              PostToolUse: [{ hooks: [{ type: 'command', command: 'echo custom' }] }]
            }
          }
        },
        ...config
      }
    };

    // Inline methods from PtyManager
    mgr._getProfile = function(profileName) {
      const profiles = this.config.profiles || {};
      return profiles[profileName] || null;
    };

    mgr._buildHookCommands = function(workerName) {
      const port = this.config.daemon?.port || 3456;
      const host = this.config.daemon?.host || '127.0.0.1';
      const baseUrl = `http://${host}:${port}`;
      const curlCmd = process.platform === 'win32'
        ? `powershell -NoProfile -Command "$input = [Console]::In.ReadToEnd(); Invoke-RestMethod -Uri '${baseUrl}/hook-event' -Method Post -ContentType 'application/json' -Body $input"`
        : `curl -s -X POST -H 'Content-Type: application/json' -d @- '${baseUrl}/hook-event'`;
      return {
        PreToolUse: [{ hooks: [{ type: 'command', command: curlCmd }] }],
        PostToolUse: [{ hooks: [{ type: 'command', command: curlCmd }] }]
      };
    };

    mgr._buildWorkerSettings = function(workerName, options = {}) {
      const profileName = options.profile || options.template || '';
      const profile = profileName ? this._getProfile(profileName) : null;
      const hooksCfg = this.config.hooks || {};
      const settings = {};
      const permissions = { allow: [], deny: [] };

      if (profile && profile.permissions) {
        if (Array.isArray(profile.permissions.allow)) permissions.allow.push(...profile.permissions.allow);
        if (Array.isArray(profile.permissions.deny)) permissions.deny.push(...profile.permissions.deny);
        if (profile.permissions.defaultMode) permissions.defaultMode = profile.permissions.defaultMode;
      }

      const defaultPerms = ['Bash(c4:*)', 'Bash(MSYS_NO_PATHCONV=1 c4:*)', 'Bash(git:*)'];
      for (const perm of defaultPerms) {
        if (!permissions.allow.includes(perm)) permissions.allow.push(perm);
      }
      settings.permissions = permissions;

      if (hooksCfg.enabled !== false && hooksCfg.injectToWorkers !== false) {
        settings.hooks = this._buildHookCommands(workerName);
      }

      if (profile && profile.hooks) {
        if (!settings.hooks) settings.hooks = {};
        for (const [hookName, hookDefs] of Object.entries(profile.hooks)) {
          if (!settings.hooks[hookName]) {
            settings.hooks[hookName] = hookDefs;
          } else {
            settings.hooks[hookName] = [...settings.hooks[hookName], ...hookDefs];
          }
        }
      }

      return settings;
    };

    mgr._writeWorkerSettings = function(worktreePath, workerName, options = {}) {
      const settings = this._buildWorkerSettings(workerName, options);
      const claudeDir = path.join(worktreePath, '.claude');
      const settingsPath = path.join(claudeDir, 'settings.json');
      if (!fs.existsSync(claudeDir)) fs.mkdirSync(claudeDir, { recursive: true });
      fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + '\n');
      return settingsPath;
    };

    return mgr;
  }

  function tmpDir() {
    return fs.mkdtempSync(path.join(os.tmpdir(), 'c4-test-'));
  }

  // --- _getProfile ---

  it('returns profile by name', () => {
    const mgr = createMockManager();
    const profile = mgr._getProfile('executor');
    assert.ok(profile);
    assert.ok(profile.permissions.allow.includes('Edit'));
  });

  it('returns null for unknown profile', () => {
    const mgr = createMockManager();
    assert.strictEqual(mgr._getProfile('nonexistent'), null);
  });

  // --- _buildWorkerSettings ---

  it('includes default c4 permissions without profile', () => {
    const mgr = createMockManager();
    const settings = mgr._buildWorkerSettings('w1');
    assert.ok(settings.permissions.allow.includes('Bash(c4:*)'));
    assert.ok(settings.permissions.allow.includes('Bash(git:*)'));
  });

  it('merges profile permissions with defaults', () => {
    const mgr = createMockManager();
    const settings = mgr._buildWorkerSettings('w1', { profile: 'executor' });
    // Profile permissions
    assert.ok(settings.permissions.allow.includes('Bash(npm:*)'));
    assert.ok(settings.permissions.allow.includes('Edit'));
    // Default permissions
    assert.ok(settings.permissions.allow.includes('Bash(c4:*)'));
    // Profile denies
    assert.ok(settings.permissions.deny.includes('Bash(rm:*)'));
  });

  it('injects hook commands when hooks enabled', () => {
    const mgr = createMockManager();
    const settings = mgr._buildWorkerSettings('w1');
    assert.ok(settings.hooks);
    assert.ok(settings.hooks.PreToolUse);
    assert.ok(settings.hooks.PostToolUse);
  });

  it('skips hook injection when hooks disabled', () => {
    const mgr = createMockManager({ hooks: { enabled: false } });
    const settings = mgr._buildWorkerSettings('w1');
    assert.ok(!settings.hooks);
  });

  it('merges profile hooks with injected hooks', () => {
    const mgr = createMockManager();
    const settings = mgr._buildWorkerSettings('w1', { profile: 'custom_hooks' });
    // Should have both injected and custom PostToolUse hooks
    assert.ok(settings.hooks.PostToolUse.length >= 2);
    const hasCustom = settings.hooks.PostToolUse.some(h =>
      h.hooks.some(hh => hh.command === 'echo custom')
    );
    assert.ok(hasCustom);
  });

  it('reviewer profile denies Edit and Write', () => {
    const mgr = createMockManager();
    const settings = mgr._buildWorkerSettings('w1', { profile: 'reviewer' });
    assert.ok(settings.permissions.deny.includes('Edit'));
    assert.ok(settings.permissions.deny.includes('Write'));
  });

  // --- _writeWorkerSettings ---

  it('creates .claude/settings.json in worktree path', () => {
    const mgr = createMockManager();
    const dir = tmpDir();
    try {
      const settingsPath = mgr._writeWorkerSettings(dir, 'w1');
      assert.ok(fs.existsSync(settingsPath));
      const data = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
      assert.ok(data.permissions);
      assert.ok(data.hooks);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('creates .claude directory if not exists', () => {
    const mgr = createMockManager();
    const dir = tmpDir();
    try {
      mgr._writeWorkerSettings(dir, 'w1');
      assert.ok(fs.existsSync(path.join(dir, '.claude')));
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('applies profile when writing settings', () => {
    const mgr = createMockManager();
    const dir = tmpDir();
    try {
      mgr._writeWorkerSettings(dir, 'w1', { profile: 'executor' });
      const data = JSON.parse(fs.readFileSync(path.join(dir, '.claude', 'settings.json'), 'utf8'));
      assert.ok(data.permissions.allow.includes('Bash(npm:*)'));
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('uses template as alias for profile', () => {
    const mgr = createMockManager();
    const settings = mgr._buildWorkerSettings('w1', { template: 'reviewer' });
    assert.ok(settings.permissions.deny.includes('Edit'));
  });

  // --- no duplicate default permissions ---

  it('does not duplicate Bash(git:*) if profile already includes it', () => {
    const mgr = createMockManager();
    const settings = mgr._buildWorkerSettings('w1', { profile: 'reviewer' });
    const gitPerms = settings.permissions.allow.filter(p => p === 'Bash(git:*)');
    assert.strictEqual(gitPerms.length, 1);
  });
});
