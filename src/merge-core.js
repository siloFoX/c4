'use strict';

// (8.5) Shared merge orchestration used by both the CLI (`c4 merge`) and
// the daemon's POST /merge endpoint. Extracting the logic here means the
// HTTP surface and the CLI exit with the same pre-merge reasoning — so a
// Web UI operator never gets a different answer than the terminal
// operator for the same branch.
//
// Design notes
// ------------
// 1. runPreMergeChecks(branch, opts) returns {passed, reasons[]}. Each
//    reason is a structured entry ({check, status, detail}) so callers
//    can render a terse CLI table or a JSON payload without re-deriving
//    them.
// 2. performMerge(branch, opts) does the `git merge --no-ff` itself and
//    returns {success, sha, summary}. When the merge fails we surface
//    the git error verbatim so the caller can decide how to display it.
// 3. Neither function touches the CLI's console output directly. The CLI
//    wraps these calls with its existing progress lines; the daemon
//    returns the reasons list in JSON. Keeping I/O at the edges makes
//    the module trivially unit-testable.
// 4. Dirty-tree and auto-stash handling stay in the CLI path (7.28) —
//    the HTTP flow assumes the operator understands the repo state and
//    refuses to stash on their behalf.

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

function runPreMergeChecks(branch, opts) {
  const options = opts || {};
  const repoRoot = options.repoRoot;
  const skipChecks = options.skipChecks === true;
  const reasons = [];

  if (!branch || typeof branch !== 'string') {
    return {
      passed: false,
      reasons: [{ check: 'input', status: 'FAIL', detail: 'branch name required' }],
    };
  }
  if (!repoRoot || typeof repoRoot !== 'string') {
    return {
      passed: false,
      reasons: [{ check: 'input', status: 'FAIL', detail: 'repoRoot required' }],
    };
  }

  try {
    execSync('git rev-parse --verify ' + JSON.stringify(branch), {
      cwd: repoRoot, encoding: 'utf8', stdio: 'pipe',
    });
  } catch {
    return {
      passed: false,
      reasons: [{ check: 'branch-exists', status: 'FAIL', detail: 'branch ' + branch + ' does not exist' }],
    };
  }
  reasons.push({ check: 'branch-exists', status: 'PASS' });

  if (branch === 'main') {
    return {
      passed: false,
      reasons: reasons.concat([{ check: 'not-main', status: 'FAIL', detail: 'cannot merge main into itself' }]),
    };
  }
  reasons.push({ check: 'not-main', status: 'PASS' });

  let currentBranch = '';
  try {
    currentBranch = execSync('git rev-parse --abbrev-ref HEAD', {
      cwd: repoRoot, encoding: 'utf8', stdio: 'pipe',
    }).trim();
  } catch (e) {
    return {
      passed: false,
      reasons: reasons.concat([{ check: 'on-main', status: 'FAIL', detail: e.message }]),
    };
  }
  if (currentBranch !== 'main') {
    return {
      passed: false,
      reasons: reasons.concat([{ check: 'on-main', status: 'FAIL', detail: 'must be on main branch (currently on ' + currentBranch + ')' }]),
    };
  }
  reasons.push({ check: 'on-main', status: 'PASS' });

  if (skipChecks) {
    reasons.push({ check: 'pre-merge', status: 'SKIP', detail: '--skip-checks flag set' });
    return { passed: true, reasons };
  }

  const validationLib = require('./validation');

  // Validation JSON (9.9): if a worktree exists at the conventional
  // location, require test_passed=true. Missing worktree is a soft
  // skip — the CLI path also degrades to SKIP rather than hard-failing
  // when the caller merges a branch that never had a worker.
  const worktreePath = path.resolve(repoRoot, '..', 'c4-worktree-' + branch.replace(/[^A-Za-z0-9._/-]/g, '-'));
  let validationObj = null;
  try {
    if (fs.existsSync(worktreePath)) {
      validationObj = validationLib.captureValidation(worktreePath, branch);
    }
  } catch {
    validationObj = null;
  }
  if (!validationObj) {
    reasons.push({ check: 'validation.test_passed', status: 'SKIP', detail: 'no worktree for branch' });
  } else if (validationObj.test_passed === true) {
    reasons.push({ check: 'validation.test_passed', status: 'PASS', detail: 'source=' + validationObj._source });
  } else {
    reasons.push({ check: 'validation.test_passed', status: 'FAIL', detail: 'worker did not confirm green tests (source=' + validationObj._source + ')' });
  }

  // TODO.md + CHANGELOG.md diff checks (1.11).
  let diffNames = '';
  try {
    diffNames = execSync('git diff main...' + JSON.stringify(branch) + ' --name-only', {
      cwd: repoRoot, encoding: 'utf8', stdio: 'pipe',
    });
  } catch (e) {
    diffNames = '';
    reasons.push({ check: 'diff', status: 'FAIL', detail: 'could not diff main..' + branch + ': ' + e.message });
  }
  const changed = diffNames.split('\n').map((s) => s.trim());
  if (changed.includes('TODO.md')) {
    reasons.push({ check: 'TODO.md', status: 'PASS' });
  } else {
    reasons.push({ check: 'TODO.md', status: 'FAIL', detail: 'TODO.md was not modified in this branch' });
  }
  if (changed.includes('CHANGELOG.md')) {
    reasons.push({ check: 'CHANGELOG.md', status: 'PASS' });
  } else {
    reasons.push({ check: 'CHANGELOG.md', status: 'FAIL', detail: 'CHANGELOG.md was not modified in this branch' });
  }

  const passed = reasons.every((r) => r.status !== 'FAIL');
  return { passed, reasons };
}

function performMerge(branch, opts) {
  const options = opts || {};
  const repoRoot = options.repoRoot;
  if (!branch || typeof branch !== 'string') {
    return { success: false, error: 'branch name required' };
  }
  if (!repoRoot || typeof repoRoot !== 'string') {
    return { success: false, error: 'repoRoot required' };
  }
  try {
    const summary = execSync(
      'git merge ' + JSON.stringify(branch) + ' --no-ff -m ' + JSON.stringify("Merge branch '" + branch + "'"),
      { cwd: repoRoot, encoding: 'utf8', stdio: 'pipe' }
    );
    let sha = '';
    try {
      sha = execSync('git rev-parse HEAD', { cwd: repoRoot, encoding: 'utf8', stdio: 'pipe' }).trim();
    } catch {
      sha = '';
    }
    return { success: true, sha, summary: String(summary || '').trim() };
  } catch (e) {
    const stderr = (e && e.stderr) ? String(e.stderr) : '';
    return { success: false, error: 'git merge failed: ' + (e.message || stderr || 'unknown error'), stderr };
  }
}

function resolveBranchForWorker(workerName, repoRoot) {
  if (!workerName || typeof workerName !== 'string') return workerName;
  if (!repoRoot || typeof repoRoot !== 'string') return workerName;
  const wtPath = path.resolve(repoRoot, '..', 'c4-worktree-' + workerName);
  try {
    if (fs.existsSync(wtPath)) {
      const branch = execSync(
        'git -C ' + JSON.stringify(wtPath.replace(/\\/g, '/')) + ' rev-parse --abbrev-ref HEAD',
        { encoding: 'utf8', stdio: 'pipe' }
      ).trim();
      if (branch) return branch;
    }
  } catch {}
  return workerName;
}

module.exports = {
  runPreMergeChecks,
  performMerge,
  resolveBranchForWorker,
};
