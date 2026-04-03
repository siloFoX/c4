const assert = require('assert');
const { describe, it } = require('node:test');

describe('Auto Mode (3.19)', () => {
  function createMockManager(config = {}) {
    const mgr = {
      config: {
        autoMode: { enabled: false, allowOverride: true },
        hooks: { enabled: true, injectToWorkers: true },
        daemon: { port: 3456, host: '127.0.0.1' },
        profiles: {},
        ...config
      }
    };

    mgr._isAutoModeEnabled = function(options = {}) {
      if (options.autoMode === true) return true;
      if (options.autoMode === false) return false;
      return this.config.autoMode?.enabled === true;
    };

    mgr._applyAutoMode = function(settings, enabled) {
      if (!enabled) return settings;
      if (!settings.permissions) settings.permissions = {};
      settings.permissions.defaultMode = 'auto';
      return settings;
    };

    mgr._getAutoModeConfig = function() {
      return this.config.autoMode || { enabled: false, allowOverride: true };
    };

    mgr._getProfile = function(profileName) {
      const profiles = this.config.profiles || {};
      return profiles[profileName] || null;
    };

    mgr._buildHookCommands = function() {
      return {
        PreToolUse: [{ hooks: [{ type: 'command', command: 'echo hook' }] }],
        PostToolUse: [{ hooks: [{ type: 'command', command: 'echo hook' }] }]
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

      if (this._isAutoModeEnabled(options)) {
        this._applyAutoMode(settings, true);
      }

      return settings;
    };

    return mgr;
  }

  // --- _isAutoModeEnabled ---

  it('returns false when config disabled and no flag', () => {
    const mgr = createMockManager();
    assert.strictEqual(mgr._isAutoModeEnabled({}), false);
  });

  it('returns true when config enabled', () => {
    const mgr = createMockManager({ autoMode: { enabled: true } });
    assert.strictEqual(mgr._isAutoModeEnabled({}), true);
  });

  it('--auto-mode flag overrides config disabled', () => {
    const mgr = createMockManager({ autoMode: { enabled: false } });
    assert.strictEqual(mgr._isAutoModeEnabled({ autoMode: true }), true);
  });

  it('autoMode: false in options overrides config enabled', () => {
    const mgr = createMockManager({ autoMode: { enabled: true } });
    assert.strictEqual(mgr._isAutoModeEnabled({ autoMode: false }), false);
  });

  // --- _applyAutoMode ---

  it('sets permissions.defaultMode to auto', () => {
    const mgr = createMockManager();
    const settings = { permissions: { allow: [] } };
    mgr._applyAutoMode(settings, true);
    assert.strictEqual(settings.permissions.defaultMode, 'auto');
  });

  it('creates permissions object if missing', () => {
    const mgr = createMockManager();
    const settings = {};
    mgr._applyAutoMode(settings, true);
    assert.strictEqual(settings.permissions.defaultMode, 'auto');
  });

  it('does nothing when not enabled', () => {
    const mgr = createMockManager();
    const settings = { permissions: { allow: [] } };
    mgr._applyAutoMode(settings, false);
    assert.ok(!settings.permissions.defaultMode);
  });

  // --- _buildWorkerSettings with auto mode ---

  it('settings include defaultMode auto when autoMode flag set', () => {
    const mgr = createMockManager();
    const settings = mgr._buildWorkerSettings('w1', { autoMode: true });
    assert.strictEqual(settings.permissions.defaultMode, 'auto');
  });

  it('settings do not include defaultMode when autoMode off', () => {
    const mgr = createMockManager();
    const settings = mgr._buildWorkerSettings('w1', {});
    assert.ok(!settings.permissions.defaultMode);
  });

  it('config autoMode.enabled applies to all workers', () => {
    const mgr = createMockManager({ autoMode: { enabled: true } });
    const settings = mgr._buildWorkerSettings('w1', {});
    assert.strictEqual(settings.permissions.defaultMode, 'auto');
  });

  // --- _getAutoModeConfig ---

  it('returns config defaults', () => {
    const mgr = createMockManager();
    const cfg = mgr._getAutoModeConfig();
    assert.strictEqual(cfg.enabled, false);
    assert.strictEqual(cfg.allowOverride, true);
  });

  it('returns custom config', () => {
    const mgr = createMockManager({ autoMode: { enabled: true, allowOverride: false } });
    const cfg = mgr._getAutoModeConfig();
    assert.strictEqual(cfg.enabled, true);
    assert.strictEqual(cfg.allowOverride, false);
  });
});
