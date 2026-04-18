'use strict';

// (9.9) Manager-Worker validation object.
//
// Prevents hallucination spiral by forcing a structured completion contract
// the manager can cross-check against git state before merging. The worker
// writes .c4-validation.json to its worktree root on completion; if the
// file is missing or malformed the daemon falls back to a synthesized
// object built from git diff + the last test-run stdout. c4 merge rejects
// when test_passed !== true or when test_count disagrees with the
// npm test output observed during pre-merge checks.

const fs = require('fs');
const path = require('path');
const { execSync: _execSync } = require('child_process');
const depSmoke = require('./dep-smoke');

const VALIDATION_FILENAME = '.c4-validation.json';
const TEST_STDOUT_FILENAME = '.c4-last-test.txt';

function execSafe(cmd, opts = {}) {
  return _execSync(cmd, { windowsHide: true, ...opts });
}

// Normalize a raw JSON string or a parsed object into the canonical
// validation shape. Returns null when input is empty/malformed/non-object
// so callers can distinguish "absent" from "all defaults".
function parseValidationObject(raw) {
  if (raw === null || raw === undefined || raw === '') return null;
  let obj;
  if (typeof raw === 'string') {
    try { obj = JSON.parse(raw); } catch { return null; }
  } else if (typeof raw === 'object') {
    obj = raw;
  } else {
    return null;
  }
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return null;
  const n = Number(obj.test_count);
  return {
    test_passed: obj.test_passed === true,
    test_count: Number.isFinite(n) && n >= 0 ? Math.floor(n) : 0,
    files_changed: Array.isArray(obj.files_changed)
      ? obj.files_changed.map(x => String(x))
      : [],
    merge_commit_hash: typeof obj.merge_commit_hash === 'string'
      ? obj.merge_commit_hash
      : '',
    lint_clean: obj.lint_clean === true,
    implementation_summary: typeof obj.implementation_summary === 'string'
      ? obj.implementation_summary
      : '',
    _source: typeof obj._source === 'string' ? obj._source : 'file',
  };
}

function readValidationFile(worktreePath, { fsImpl = fs } = {}) {
  if (!worktreePath) return null;
  const p = path.join(worktreePath, VALIDATION_FILENAME);
  try {
    if (!fsImpl.existsSync(p)) return null;
    const raw = fsImpl.readFileSync(p, 'utf8');
    const parsed = parseValidationObject(raw);
    if (parsed) parsed._source = 'file';
    return parsed;
  } catch {
    return null;
  }
}

// Build a minimal validation object from git state for the worktree when
// the worker failed to write .c4-validation.json. files_changed,
// merge_commit_hash, and implementation_summary come from git; test
// fields come from .c4-last-test.txt if the worker left one behind,
// otherwise default to "no tests / not passed" so the pre-merge gate
// correctly refuses to merge unverified work.
function synthesizeValidation(worktreePath, branch, opts = {}) {
  const {
    mainBranch = 'main',
    exec = execSafe,
    fsImpl = fs,
  } = opts || {};
  const result = {
    test_passed: false,
    test_count: 0,
    files_changed: [],
    merge_commit_hash: '',
    lint_clean: false,
    implementation_summary: '',
    _source: 'synthesized',
  };
  if (!worktreePath) return result;
  const wt = worktreePath.replace(/\\/g, '/');
  try {
    const diff = exec(
      `git -C "${wt}" diff ${mainBranch}...HEAD --name-only`,
      { encoding: 'utf8', timeout: 10000, stdio: ['pipe', 'pipe', 'pipe'] }
    );
    result.files_changed = String(diff)
      .split('\n').map(s => s.trim()).filter(Boolean);
  } catch {}
  try {
    const head = exec(`git -C "${wt}" rev-parse HEAD`, {
      encoding: 'utf8', timeout: 5000, stdio: ['pipe', 'pipe', 'pipe']
    });
    result.merge_commit_hash = String(head).trim();
  } catch {}
  try {
    const log = exec(
      `git -C "${wt}" log ${mainBranch}..HEAD --format=%s`,
      { encoding: 'utf8', timeout: 5000, stdio: ['pipe', 'pipe', 'pipe'] }
    );
    const lines = String(log).split('\n').map(s => s.trim()).filter(Boolean);
    result.implementation_summary = lines.join('; ').slice(0, 500);
  } catch {}
  const testOut = path.join(worktreePath, TEST_STDOUT_FILENAME);
  try {
    if (fsImpl.existsSync(testOut)) {
      const txt = fsImpl.readFileSync(testOut, 'utf8');
      const count = extractNpmTestCount(txt);
      if (count !== null) result.test_count = count;
      const failMatch = txt.match(/(\d+)\s+failed/);
      if (failMatch) {
        const failed = parseInt(failMatch[1], 10) || 0;
        result.test_passed = failed === 0 && result.test_count > 0;
      } else if (count !== null && count > 0) {
        result.test_passed = true;
      }
    }
  } catch {}
  return result;
}

function captureValidation(worktreePath, branch, opts = {}) {
  const file = readValidationFile(worktreePath, opts);
  if (file) return file;
  return synthesizeValidation(worktreePath, branch, opts);
}

// Pull a "N passed" count from test runner stdout. Returns null when
// no recognizable tally exists so callers can treat null as
// "cannot cross-check" instead of "zero".
function extractNpmTestCount(stdout) {
  if (!stdout) return null;
  const txt = String(stdout);
  let m = txt.match(/Tests:\s+(\d+)\s+passed/);
  if (m) return parseInt(m[1], 10) || 0;
  m = txt.match(/(\d+)\s+passed,\s+\d+\s+failed/);
  if (m) return parseInt(m[1], 10) || 0;
  m = txt.match(/(\d+)\s+passed/);
  if (m) return parseInt(m[1], 10) || 0;
  return null;
}

// Pre-merge gate. Returns { ok: true } when the validation object accepts
// the merge; otherwise returns { ok: false, reason, detail } so the
// caller can surface a specific failure to the operator. npmTestCount
// may be null when the cross-check is unavailable; in that case we only
// enforce the test_passed flag.
function checkPreMerge(validation, { npmTestCount = null } = {}) {
  if (!validation) {
    return {
      ok: false,
      reason: 'missing-validation',
      detail: 'No validation object found (file missing and git state unavailable).',
    };
  }
  if (validation.test_passed !== true) {
    return {
      ok: false,
      reason: 'test-not-passed',
      detail: `validation.test_passed is ${String(validation.test_passed)}; refusing to merge. Fix tests or re-run the worker before retrying.`,
    };
  }
  if (npmTestCount !== null && npmTestCount !== undefined) {
    const expected = validation.test_count;
    if (expected !== npmTestCount) {
      return {
        ok: false,
        reason: 'test-count-mismatch',
        detail: `validation.test_count=${expected} does not match npm test output (${npmTestCount}). Tests were likely added or removed after the validation object was written.`,
      };
    }
  }
  return { ok: true };
}

// (8.16) package-deps-installed gate. Prevents the regression where a
// branch adds a new entry to package.json dependencies but main never
// gets `npm install` run against it, so the first consumer on main hits
// `Cannot find module <newDep>` (the bcryptjs/8.14 pattern).
//
// Flow when package.json changed on the branch:
//   1. detectNewDeps via git diff-tree
//   2. If new prod deps exist, run `npm ci` in repoRoot so main's
//      node_modules matches the branch's package-lock.json exactly
//   3. For each new dep, spawn `node -e "require(dep)"` in repoRoot
//   4. Return {ok, reason, detail, detect} -- ok:true only when every
//      new prod dep is loadable
//
// devDependencies are reported separately (warn-only) so test-only deps
// do not block a merge. `skipInstall:true` lets unit tests exercise the
// gate without shelling out to npm.
function checkPackageDepsInstalled(opts = {}) {
  const {
    baseSha,
    headSha,
    repoRoot,
    exec = execSafe,
    spawn = null,
    skipInstall = false,
    includeDev = false,
  } = opts || {};
  if (!baseSha || !headSha || !repoRoot) {
    return {
      ok: true,
      skipped: true,
      reason: 'missing-args',
      detail: 'baseSha, headSha, or repoRoot missing -- package-deps-installed check cannot run.',
    };
  }
  let detect;
  try {
    detect = depSmoke.detectNewDeps(baseSha, headSha, repoRoot, { exec });
  } catch (err) {
    return {
      ok: false,
      skipped: false,
      reason: 'invalid-package-json',
      detail: (err && err.message) || 'package.json parse error',
    };
  }
  if (!detect.hasChanges) {
    return {
      ok: true,
      skipped: true,
      reason: 'package-json-unchanged',
      detail: 'package.json did not change in this branch.',
      detect,
    };
  }
  if (detect.deps.length === 0 && detect.devDeps.length === 0) {
    return {
      ok: true,
      skipped: true,
      reason: 'no-new-deps',
      detail: 'package.json changed but no new dependency entries were added.',
      detect,
    };
  }
  if (detect.deps.length > 0 && !skipInstall) {
    try {
      exec(`npm ci`, {
        cwd: repoRoot,
        encoding: 'utf8',
        stdio: ['pipe', 'pipe', 'pipe'],
        timeout: 300000,
      });
    } catch (err) {
      const stderr = String((err && err.stderr) || '').trim();
      const msg = stderr || (err && err.message) || 'npm ci failed';
      return {
        ok: false,
        skipped: false,
        reason: 'npm-ci-failed',
        detail: `npm ci failed in ${repoRoot}: ${msg.slice(0, 500)}`,
        detect,
      };
    }
  }
  const prodNames = detect.deps.map(d => d.name);
  const devNames = detect.devDeps.map(d => d.name);
  const verifyOpts = spawn ? { spawn } : {};
  const prodResult = depSmoke.verifyDepsLoadable(prodNames, repoRoot, verifyOpts);
  const devResult = includeDev
    ? depSmoke.verifyDepsLoadable(devNames, repoRoot, verifyOpts)
    : { ok: true, failed: [] };
  if (!prodResult.ok) {
    return {
      ok: false,
      skipped: false,
      reason: 'require-failed',
      detail: depSmoke.formatFailure(prodResult),
      detect,
      prod: prodResult,
      dev: devResult,
    };
  }
  return {
    ok: true,
    skipped: false,
    reason: 'ok',
    detail: `Verified ${prodNames.length} new prod dep(s)` +
      (devNames.length > 0 ? `, ${devNames.length} devDep(s) reported` : ''),
    detect,
    prod: prodResult,
    dev: devResult,
  };
}

module.exports = {
  VALIDATION_FILENAME,
  TEST_STDOUT_FILENAME,
  parseValidationObject,
  readValidationFile,
  synthesizeValidation,
  captureValidation,
  extractNpmTestCount,
  checkPreMerge,
  checkPackageDepsInstalled,
};
