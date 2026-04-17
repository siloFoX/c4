'use strict';

// c4 merge dirty-tree guard (7.28).
//
// Before `git merge` runs, the target branch (main) must have no uncommitted
// changes. Otherwise the manager has to stash, merge, then pop, and a pop
// conflict halts automated nightly runs. This module exposes pure-JS helpers
// that the cli.js merge handler calls; spawn is injectable so tests never
// touch real git.

const { spawnSync } = require('child_process');

function runGit(args, cwd, { spawn = spawnSync } = {}) {
  return spawn('git', ['-C', cwd, ...args], {
    encoding: 'utf8',
    timeout: 15000,
  });
}

// Returns each non-empty line of `git status --porcelain`. Empty array means
// a clean tree. Throws on a git failure so the caller can surface it.
function getDirtyEntries(repoRoot, opts = {}) {
  const r = runGit(['status', '--porcelain'], repoRoot, opts);
  if (!r || r.status !== 0) {
    const msg =
      r && r.stderr ? String(r.stderr).trim() : 'unknown error';
    throw new Error(`git status --porcelain failed: ${msg}`);
  }
  const out = String(r.stdout || '');
  return out.split('\n').filter((line) => line.length > 0);
}

function isDirty(repoRoot, opts = {}) {
  return getDirtyEntries(repoRoot, opts).length > 0;
}

// Format a porcelain v1 line "XY PATH" as "PATH (XY)" for operator output.
function formatEntry(line) {
  if (!line || line.length < 4) return String(line || '');
  const status = line.slice(0, 2).trim() || line.slice(0, 2);
  const rest = line.slice(3);
  return `${rest} (${status})`;
}

function buildDirtyMessage(entries) {
  const lines = ['Error: target branch has uncommitted changes:'];
  for (const e of entries) {
    lines.push(`  ${formatEntry(e)}`);
  }
  lines.push('');
  lines.push('Commit, stash, or clean these files before merging.');
  lines.push('  git -C <repo> status            # inspect changes');
  lines.push('  c4 cleanup                      # clean orphan worktrees');
  lines.push('  c4 merge <name> --auto-stash    # stash, merge, then pop');
  return lines.join('\n');
}

function stashPush(repoRoot, label, opts = {}) {
  const r = runGit(['stash', 'push', '-m', label], repoRoot, opts);
  if (!r || r.status !== 0) {
    const msg =
      r && r.stderr ? String(r.stderr).trim() : 'unknown error';
    throw new Error(`git stash push failed: ${msg}`);
  }
  return String(r.stdout || '').trim();
}

function stashPop(repoRoot, opts = {}) {
  const r = runGit(['stash', 'pop'], repoRoot, opts);
  return {
    status: r ? r.status : -1,
    stdout: r ? String(r.stdout || '') : '',
    stderr: r ? String(r.stderr || '') : '',
  };
}

function buildPopConflictMessage(label, popResult) {
  const lines = [];
  lines.push('Error: git stash pop reported conflicts after the merge.');
  if (popResult && popResult.stdout) {
    const trimmed = String(popResult.stdout).trim();
    if (trimmed) lines.push(trimmed);
  }
  if (popResult && popResult.stderr) {
    const trimmed = String(popResult.stderr).trim();
    if (trimmed) lines.push(trimmed);
  }
  lines.push('');
  lines.push(
    `Stashed changes are still in \`git stash list\` as "${label}". No data lost.`
  );
  lines.push('  git -C <repo> stash list           # confirm the stash entry');
  lines.push('  git -C <repo> status               # see conflict markers');
  lines.push('  # resolve conflicts, then:');
  lines.push('  git -C <repo> stash drop           # remove the stash entry');
  return lines.join('\n');
}

module.exports = {
  getDirtyEntries,
  isDirty,
  formatEntry,
  buildDirtyMessage,
  stashPush,
  stashPop,
  buildPopConflictMessage,
};
