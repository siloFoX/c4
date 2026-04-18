'use strict';

// merge-core: worktreePath sanitization for branch names with slashes.
// Reproduces the v8.1 hygiene bug where the regex char class
// `[^A-Za-z0-9._/-]` left '/' intact, producing
// '../c4-worktree-c4/slack-events' (a non-existent path) instead of
// '../c4-worktree-c4-slack-events'. The fix removes '/' from the
// allowed set so it gets replaced with '-'. Pure path computation —
// no filesystem touch required.

const assert = require('assert');
const { describe, it } = require('node:test');
const path = require('path');
const fs = require('fs');

// Mirror the (post-fix) logic from src/merge-core.js so the test is a
// regression guard on the regex itself rather than on the surrounding
// runPreMergeChecks plumbing.
function computeWorktreePath(repoRoot, branch) {
  return path.resolve(
    repoRoot,
    '..',
    'c4-worktree-' + branch.replace(/[^A-Za-z0-9._-]/g, '-')
  );
}

describe('merge-core: worktreePath generation', () => {
  const repoRoot = '/tmp/repo';

  it('passes a plain branch name through unchanged', () => {
    const got = computeWorktreePath(repoRoot, 'hygiene-v8');
    assert.strictEqual(got, path.resolve('/tmp', 'c4-worktree-hygiene-v8'));
  });

  it('replaces a single slash with a hyphen', () => {
    // Regression: pre-fix this produced '../c4-worktree-c4/slack-events'
    // which existsSync() would never see, so the validation check
    // silently SKIP-ed for any worker branch.
    const got = computeWorktreePath(repoRoot, 'c4/slack-events');
    assert.strictEqual(got, path.resolve('/tmp', 'c4-worktree-c4-slack-events'));
    assert.ok(!got.includes('/c4-worktree-c4/'),
      'worktreePath must not retain raw slashes from branch name');
  });

  it('replaces multiple slashes with hyphens', () => {
    const got = computeWorktreePath(repoRoot, 'feature/sub/leaf');
    assert.strictEqual(got, path.resolve('/tmp', 'c4-worktree-feature-sub-leaf'));
  });

  it('preserves dot, hyphen, and underscore characters', () => {
    const got = computeWorktreePath(repoRoot, 'c4/v1.2_alpha-rc');
    assert.strictEqual(got, path.resolve('/tmp', 'c4-worktree-c4-v1.2_alpha-rc'));
  });

  it('replaces every other special character with hyphens', () => {
    const got = computeWorktreePath(repoRoot, 'feat/foo bar@baz#1');
    assert.strictEqual(got, path.resolve('/tmp', 'c4-worktree-feat-foo-bar-baz-1'));
  });

  // Source-grep guard: confirms the production regex no longer carries
  // '/' inside the negated char class. Belt-and-suspenders so a future
  // refactor cannot quietly reintroduce the bug.
  it('src/merge-core.js regex no longer allows / through the char class', () => {
    const src = fs.readFileSync(
      path.resolve(__dirname, '..', 'src', 'merge-core.js'),
      'utf8'
    );
    assert.ok(
      src.includes("branch.replace(/[^A-Za-z0-9._-]/g, '-')"),
      'merge-core.js should sanitize branch names with regex /[^A-Za-z0-9._-]/g'
    );
    assert.ok(
      !src.includes("branch.replace(/[^A-Za-z0-9._/-]/g, '-')"),
      'merge-core.js must not retain the buggy regex with / in the char class'
    );
  });
});
