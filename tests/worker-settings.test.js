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
          },
          web: {
            description: 'Web development project preset',
            permissions: {
              allow: ['Bash(npm:*)', 'Bash(npx:*)', 'Bash(node:*)', 'Bash(yarn:*)', 'Edit', 'Write'],
              deny: ['Bash(rm:*)', 'Bash(sudo:*)', 'Bash(docker:*)']
            }
          },
          ml: {
            description: 'ML/Data Science project preset',
            permissions: {
              allow: ['Bash(python:*)', 'Bash(pip:*)', 'Bash(conda:*)', 'Bash(jupyter:*)', 'Edit', 'Write'],
              deny: ['Bash(rm:*)', 'Bash(sudo:*)']
            }
          },
          infra: {
            description: 'Infrastructure/DevOps project preset',
            permissions: {
              allow: ['Bash(docker:*)', 'Bash(docker-compose:*)', 'Bash(terraform:*)', 'Bash(kubectl:*)', 'Edit', 'Write'],
              deny: ['Bash(rm -rf:*)', 'Bash(sudo:*)']
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

    mgr._buildCompoundBlockCommand = function() {
      const script = [
        "let d='';",
        "process.stdin.on('data',c=>d+=c);",
        "process.stdin.on('end',()=>{",
        "try{const j=JSON.parse(d);const cmd=j.tool_input&&j.tool_input.command||'';",
        "if(/&&|\\|\\||[|;]/.test(cmd)){",
        "console.error('BLOCKED: compound commands (&&, ||, |, ;) are not allowed. Use single commands.');",
        "process.exit(2)}",
        "}catch{}process.exit(0)})"
      ].join('');
      return `node -e "${script}"`;
    };

    mgr._buildAutoManagerPermissions = function() {
      return {
        allow: [
          'Bash(c4:*)', 'Bash(MSYS_NO_PATHCONV=1 c4:*)',
          'Bash(git -C:*)',
          'Agent'
        ],
        deny: [
          'Read', 'Write', 'Edit', 'Grep', 'Glob',
          'Bash(rm -rf:*)', 'Bash(sudo:*)', 'Bash(shutdown:*)', 'Bash(reboot:*)'
        ],
        defaultMode: 'auto'
      };
    };

    mgr.listProfiles = function() {
      const profiles = this.config.profiles || {};
      const result = {};
      for (const [name, prof] of Object.entries(profiles)) {
        result[name] = {
          description: prof.description || '',
          allow: (prof.permissions && prof.permissions.allow) || [],
          deny: (prof.permissions && prof.permissions.deny) || []
        };
      }
      return result;
    };

    mgr._buildWorkerSettings = function(workerName, options = {}) {
      const profileName = options.profile || options.template || '';
      const profile = profileName ? this._getProfile(profileName) : null;
      const hooksCfg = this.config.hooks || {};
      const settings = {};

      if (options._autoWorker) {
        settings.permissions = this._buildAutoManagerPermissions();
      } else {
        const permissions = { allow: [], deny: [] };

        if (profile && profile.permissions) {
          if (Array.isArray(profile.permissions.allow)) permissions.allow.push(...profile.permissions.allow);
          if (Array.isArray(profile.permissions.deny)) permissions.deny.push(...profile.permissions.deny);
          if (profile.permissions.defaultMode) permissions.defaultMode = profile.permissions.defaultMode;
        }

        const defaultPerms = [
          'Bash(c4:*)', 'Bash(MSYS_NO_PATHCONV=1 c4:*)', 'Bash(git:*)',
          'Bash(npm:*)', 'Bash(npx:*)', 'Bash(node:*)',
          'Bash(python:*)', 'Bash(python3:*)', 'Bash(pip:*)', 'Bash(pip3:*)',
          'Bash(cargo:*)', 'Bash(go:*)', 'Bash(rustc:*)',
          'Bash(make:*)', 'Bash(cmake:*)',
          'Bash(ffmpeg:*)', 'Bash(ffprobe:*)',
          'Bash(docker:*)', 'Bash(docker-compose:*)',
          'Bash(ls:*)', 'Bash(cat:*)', 'Bash(head:*)', 'Bash(tail:*)',
          'Bash(grep:*)', 'Bash(find:*)', 'Bash(wc:*)',
          'Bash(mkdir:*)', 'Bash(cp:*)', 'Bash(mv:*)', 'Bash(touch:*)',
          'Bash(pwd)', 'Bash(echo:*)', 'Bash(test:*)',
          'Bash(curl:*)', 'Bash(wget:*)',
          'Read', 'Edit', 'Write', 'Glob', 'Grep',
        ];
        for (const perm of defaultPerms) {
          if (!permissions.allow.includes(perm)) permissions.allow.push(perm);
        }
        settings.permissions = permissions;
      }

      // Complete hook set: build all hooks explicitly
      settings.hooks = {};

      // PreToolUse: compound blocking FIRST
      settings.hooks.PreToolUse = [
        {
          matcher: 'Bash',
          hooks: [{ type: 'command', command: this._buildCompoundBlockCommand() }]
        }
      ];

      // Daemon communication hooks
      settings.hooks.PostToolUse = [];
      if (hooksCfg.enabled !== false && hooksCfg.injectToWorkers !== false) {
        const daemonHooks = this._buildHookCommands(workerName);
        if (daemonHooks.PreToolUse) {
          settings.hooks.PreToolUse.push(...daemonHooks.PreToolUse);
        }
        if (daemonHooks.PostToolUse) {
          settings.hooks.PostToolUse.push(...daemonHooks.PostToolUse);
        }
      }

      // PostCompact: context reload
      settings.hooks.PostCompact = [
        { hooks: [{ type: 'command', command: 'cat CLAUDE.md' }] }
      ];

      // Profile-specific hooks
      if (profile && profile.hooks) {
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

  it('has compound blocking but no daemon hooks when hooks disabled', () => {
    const mgr = createMockManager({ hooks: { enabled: false } });
    const settings = mgr._buildWorkerSettings('w1');
    assert.ok(settings.hooks);
    // PreToolUse has compound blocking only (no daemon hook)
    assert.strictEqual(settings.hooks.PreToolUse.length, 1);
    assert.strictEqual(settings.hooks.PreToolUse[0].matcher, 'Bash');
    // PostToolUse is empty (no daemon hook)
    assert.strictEqual(settings.hooks.PostToolUse.length, 0);
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

  // --- Complete hook set (4.6/4.9 fix) ---

  it('compound blocking is first PreToolUse hook', () => {
    const mgr = createMockManager();
    const settings = mgr._buildWorkerSettings('w1');
    assert.strictEqual(settings.hooks.PreToolUse[0].matcher, 'Bash');
    assert.ok(settings.hooks.PreToolUse[0].hooks[0].command.includes('BLOCKED'));
  });

  it('daemon hook comes after compound blocking in PreToolUse', () => {
    const mgr = createMockManager();
    const settings = mgr._buildWorkerSettings('w1');
    assert.strictEqual(settings.hooks.PreToolUse.length, 2);
    // First: compound blocking (has matcher: 'Bash')
    assert.strictEqual(settings.hooks.PreToolUse[0].matcher, 'Bash');
    // Second: daemon hook (no matcher = global)
    assert.strictEqual(settings.hooks.PreToolUse[1].matcher, undefined);
  });

  it('includes PostCompact hooks', () => {
    const mgr = createMockManager();
    const settings = mgr._buildWorkerSettings('w1');
    assert.ok(settings.hooks.PostCompact);
    assert.ok(settings.hooks.PostCompact.length > 0);
  });

  it('includes all three hook types in complete set', () => {
    const mgr = createMockManager();
    const settings = mgr._buildWorkerSettings('w1');
    assert.ok(settings.hooks.PreToolUse, 'PreToolUse must exist');
    assert.ok(settings.hooks.PostToolUse, 'PostToolUse must exist');
    assert.ok(settings.hooks.PostCompact, 'PostCompact must exist');
  });

  // --- no duplicate default permissions ---

  it('does not duplicate Bash(git:*) if profile already includes it', () => {
    const mgr = createMockManager();
    const settings = mgr._buildWorkerSettings('w1', { profile: 'reviewer' });
    const gitPerms = settings.permissions.allow.filter(p => p === 'Bash(git:*)');
    assert.strictEqual(gitPerms.length, 1);
  });

  // --- Auto-manager tool restrictions (5.1) ---

  it('auto-manager denies Read, Write, Edit, Grep, Glob', () => {
    const mgr = createMockManager();
    const settings = mgr._buildWorkerSettings('auto-mgr', { _autoWorker: true });
    const denied = ['Read', 'Write', 'Edit', 'Grep', 'Glob'];
    for (const tool of denied) {
      assert.ok(settings.permissions.deny.includes(tool), `${tool} must be denied`);
      assert.ok(!settings.permissions.allow.includes(tool), `${tool} must not be allowed`);
    }
  });

  it('auto-manager allows only c4 and git -C bash patterns', () => {
    const mgr = createMockManager();
    const settings = mgr._buildWorkerSettings('auto-mgr', { _autoWorker: true });
    assert.ok(settings.permissions.allow.includes('Bash(c4:*)'));
    assert.ok(settings.permissions.allow.includes('Bash(MSYS_NO_PATHCONV=1 c4:*)'));
    assert.ok(settings.permissions.allow.includes('Bash(git -C:*)'));
    // General Bash must not be allowed
    assert.ok(!settings.permissions.allow.includes('Bash'));
    assert.ok(!settings.permissions.allow.includes('Bash(git:*)'));
  });

  it('auto-manager has defaultMode auto', () => {
    const mgr = createMockManager();
    const settings = mgr._buildWorkerSettings('auto-mgr', { _autoWorker: true });
    assert.strictEqual(settings.permissions.defaultMode, 'auto');
  });

  it('auto-manager allows Agent tool', () => {
    const mgr = createMockManager();
    const settings = mgr._buildWorkerSettings('auto-mgr', { _autoWorker: true });
    assert.ok(settings.permissions.allow.includes('Agent'));
  });

  // --- expanded default permissions (5.24) ---

  it('default perms include dev tools (python, npm, cargo, docker, etc.)', () => {
    const mgr = createMockManager();
    const settings = mgr._buildWorkerSettings('w1');
    const expected = [
      'Bash(npm:*)', 'Bash(npx:*)', 'Bash(node:*)',
      'Bash(python:*)', 'Bash(python3:*)', 'Bash(pip:*)', 'Bash(pip3:*)',
      'Bash(cargo:*)', 'Bash(go:*)', 'Bash(rustc:*)',
      'Bash(make:*)', 'Bash(cmake:*)',
      'Bash(ffmpeg:*)', 'Bash(ffprobe:*)',
      'Bash(docker:*)', 'Bash(docker-compose:*)',
    ];
    for (const perm of expected) {
      assert.ok(settings.permissions.allow.includes(perm), `missing: ${perm}`);
    }
  });

  it('default perms include shell utilities and file tools', () => {
    const mgr = createMockManager();
    const settings = mgr._buildWorkerSettings('w1');
    const expected = [
      'Bash(ls:*)', 'Bash(cat:*)', 'Bash(head:*)', 'Bash(tail:*)',
      'Bash(grep:*)', 'Bash(find:*)', 'Bash(wc:*)',
      'Bash(mkdir:*)', 'Bash(cp:*)', 'Bash(mv:*)', 'Bash(touch:*)',
      'Bash(pwd)', 'Bash(echo:*)', 'Bash(test:*)',
      'Bash(curl:*)', 'Bash(wget:*)',
      'Read', 'Edit', 'Write', 'Glob', 'Grep',
    ];
    for (const perm of expected) {
      assert.ok(settings.permissions.allow.includes(perm), `missing: ${perm}`);
    }
  });

  it('auto-manager is NOT affected by expanded default perms', () => {
    const mgr = createMockManager();
    const settings = mgr._buildWorkerSettings('auto-mgr', { _autoWorker: true });
    // auto-manager should NOT have expanded dev tool perms
    assert.ok(!settings.permissions.allow.includes('Bash(python:*)'));
    assert.ok(!settings.permissions.allow.includes('Bash(docker:*)'));
    assert.ok(!settings.permissions.allow.includes('Bash(npm:*)'));
  });

  it('non-auto worker is not affected by auto-manager restrictions', () => {
    const mgr = createMockManager();
    const settings = mgr._buildWorkerSettings('w1');
    // Normal workers should NOT have Read/Write/Edit in deny
    assert.ok(!settings.permissions.deny.includes('Read'));
    assert.ok(!settings.permissions.deny.includes('Write'));
    assert.ok(!settings.permissions.deny.includes('Edit'));
  });

  // --- Project-type profiles (5.26) ---

  it('web profile includes frontend tooling permissions', () => {
    const mgr = createMockManager();
    const settings = mgr._buildWorkerSettings('w1', { profile: 'web' });
    assert.ok(settings.permissions.allow.includes('Bash(npm:*)'));
    assert.ok(settings.permissions.allow.includes('Bash(npx:*)'));
    assert.ok(settings.permissions.allow.includes('Bash(yarn:*)'));
    assert.ok(settings.permissions.deny.includes('Bash(docker:*)'));
  });

  it('ml profile includes python/conda permissions', () => {
    const mgr = createMockManager();
    const settings = mgr._buildWorkerSettings('w1', { profile: 'ml' });
    assert.ok(settings.permissions.allow.includes('Bash(python:*)'));
    assert.ok(settings.permissions.allow.includes('Bash(pip:*)'));
    assert.ok(settings.permissions.allow.includes('Bash(conda:*)'));
    assert.ok(settings.permissions.allow.includes('Bash(jupyter:*)'));
  });

  it('infra profile includes docker/k8s/terraform permissions', () => {
    const mgr = createMockManager();
    const settings = mgr._buildWorkerSettings('w1', { profile: 'infra' });
    assert.ok(settings.permissions.allow.includes('Bash(docker:*)'));
    assert.ok(settings.permissions.allow.includes('Bash(docker-compose:*)'));
    assert.ok(settings.permissions.allow.includes('Bash(terraform:*)'));
    assert.ok(settings.permissions.allow.includes('Bash(kubectl:*)'));
    assert.ok(settings.permissions.deny.includes('Bash(rm -rf:*)'));
  });

  // --- listProfiles (5.26) ---

  it('listProfiles returns all profiles with description', () => {
    const mgr = createMockManager();
    const profiles = mgr.listProfiles();
    assert.ok(profiles.web);
    assert.ok(profiles.ml);
    assert.ok(profiles.infra);
    assert.strictEqual(profiles.web.description, 'Web development project preset');
    assert.strictEqual(profiles.ml.description, 'ML/Data Science project preset');
  });

  it('listProfiles includes allow/deny counts', () => {
    const mgr = createMockManager();
    const profiles = mgr.listProfiles();
    assert.ok(profiles.executor.allow.length > 0);
    assert.ok(profiles.executor.deny.length > 0);
  });

  it('listProfiles returns empty for profiles without description', () => {
    const mgr = createMockManager();
    const profiles = mgr.listProfiles();
    assert.strictEqual(profiles.default.description, '');
  });

  it('listProfiles returns empty object when no profiles configured', () => {
    const mgr = createMockManager({ profiles: undefined });
    mgr.config.profiles = undefined;
    const profiles = mgr.listProfiles();
    assert.deepStrictEqual(profiles, {});
  });
});
