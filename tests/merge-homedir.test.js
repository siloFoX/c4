// merge-homedir tests
// Tests config.json projectRoot fallback for cli.js merge handler

const assert = require('assert');
const { describe, it } = require('node:test');
const path = require('path');
const fs = require('fs');

describe('merge-homedir: config.json projectRoot fallback', () => {

  // Simulate the fallback logic extracted from cli.js merge handler
  function detectRepoRoot(cwd, configPath) {
    let repoRoot;

    // Step 1: try git rev-parse (simulated)
    if (cwd && cwd._isGitRepo) {
      repoRoot = cwd.root;
      return repoRoot;
    }

    // Step 2: fallback to config.json
    try {
      const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      if (config.worktree && config.worktree.projectRoot) {
        repoRoot = path.resolve(config.worktree.projectRoot);
      }
    } catch {}

    return repoRoot || null;
  }

  // Create temp config for tests
  const tmpDir = path.join(require('os').tmpdir(), 'c4-merge-test-' + Date.now());
  const configPath = path.join(tmpDir, 'config.json');

  // Setup
  fs.mkdirSync(tmpDir, { recursive: true });

  it('returns null when not in git repo and no config', () => {
    const result = detectRepoRoot(null, path.join(tmpDir, 'nonexistent.json'));
    assert.strictEqual(result, null, 'should return null');
  });

  it('uses git repo root when available', () => {
    const result = detectRepoRoot({ _isGitRepo: true, root: '/repo' }, configPath);
    assert.strictEqual(result, '/repo', 'should use git root');
  });

  it('falls back to config.worktree.projectRoot', () => {
    fs.writeFileSync(configPath, JSON.stringify({
      worktree: { enabled: true, projectRoot: '/home/user/myproject' }
    }));
    const result = detectRepoRoot(null, configPath);
    assert.strictEqual(result, path.resolve('/home/user/myproject'), 'should use config projectRoot');
  });

  it('returns null when config has empty projectRoot', () => {
    fs.writeFileSync(configPath, JSON.stringify({
      worktree: { enabled: true, projectRoot: '' }
    }));
    const result = detectRepoRoot(null, configPath);
    assert.strictEqual(result, null, 'should return null for empty projectRoot');
  });

  it('returns null when config has no worktree section', () => {
    fs.writeFileSync(configPath, JSON.stringify({ maxWorkers: 3 }));
    const result = detectRepoRoot(null, configPath);
    assert.strictEqual(result, null, 'should return null without worktree section');
  });

  it('returns null when config is invalid JSON', () => {
    fs.writeFileSync(configPath, 'not json');
    const result = detectRepoRoot(null, configPath);
    assert.strictEqual(result, null, 'should return null for invalid JSON');
  });

  it('resolves relative projectRoot to absolute path', () => {
    fs.writeFileSync(configPath, JSON.stringify({
      worktree: { enabled: true, projectRoot: '../myproject' }
    }));
    const result = detectRepoRoot(null, configPath);
    assert.ok(path.isAbsolute(result), 'should be absolute path');
    assert.strictEqual(result, path.resolve('../myproject'), 'should resolve relative path');
  });

  it('git repo root takes priority over config', () => {
    fs.writeFileSync(configPath, JSON.stringify({
      worktree: { enabled: true, projectRoot: '/config/path' }
    }));
    const result = detectRepoRoot({ _isGitRepo: true, root: '/git/path' }, configPath);
    assert.strictEqual(result, '/git/path', 'git root should take priority');
  });

  it('handles config with worktree.projectRoot = null', () => {
    fs.writeFileSync(configPath, JSON.stringify({
      worktree: { enabled: true, projectRoot: null }
    }));
    const result = detectRepoRoot(null, configPath);
    assert.strictEqual(result, null, 'should return null for null projectRoot');
  });

  // Verify actual cli.js code structure
  it('cli.js merge handler contains config fallback code', () => {
    const cliPath = path.resolve(__dirname, '..', 'src', 'cli.js');
    const cliCode = fs.readFileSync(cliPath, 'utf8');
    assert.ok(cliCode.includes('config.worktree.projectRoot'), 'cli.js should reference config.worktree.projectRoot');
    assert.ok(cliCode.includes('config.worktree && config.worktree.projectRoot'), 'cli.js should check worktree exists before accessing projectRoot');
  });

  // Cleanup
  it('cleanup temp files', () => {
    try { fs.unlinkSync(configPath); } catch {}
    try { fs.rmdirSync(tmpDir); } catch {}
    assert.ok(true, 'cleanup done');
  });
});
