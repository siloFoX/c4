'use strict';

// Dependency smoke check (TODO 8.16).
//
// Prevents the regression pattern where a worker branch adds a package
// to package.json (and updates package-lock.json), tests pass locally
// because the worker's worktree already has node_modules from an
// earlier install, but main never gets `npm install` run against the
// newly declared dependency -- so the first consumer who runs `c4 init`
// on a fresh clone hits `Cannot find module <newDep>`. (This is how
// bcryptjs slipped through after 8.14.)
//
// The module exposes two pure helpers plus a small orchestrator:
//
//   detectNewDeps(baseSha, headSha, repoRoot)
//     Walks `git show <sha>:package.json` for both commits, diffs the
//     dependencies map, and returns {deps, devDeps, hasChanges, reason}
//     so callers can decide whether a check is needed at all.
//
//   verifyDepsLoadable(depNames, cwd)
//     For each dep name, spawns `node -e "require(dep)"` in cwd so the
//     check sees exactly what a fresh consumer would see. Returns
//     {ok, failed:[{name, error}]}. Never throws on resolution failure.
//
//   runCheck(opts) runs the full gate in the same process.
//
// Design notes:
// - We deliberately do NOT install packages here. Installation belongs
//   to the merge flow (src/cli.js) which may need to surface progress
//   or honor a --skip-checks flag. This module is the detector + probe;
//   the orchestrator glues it to `npm ci` elsewhere.
// - devDependencies are reported but treated as warn-only by callers
//   because devDeps are not required for a production consumer and a
//   missing devDep shouldn't block a merge. The flag lets the caller
//   choose.
// - git is invoked through `git -C <repoRoot>` so the helpers work from
//   any cwd (the merge flow runs from repoRoot already but tests use
//   tmpdirs).

const { execSync: _execSync, spawnSync: _spawnSync } = require('child_process');
const path = require('path');

function execSafe(cmd, opts = {}) {
  return _execSync(cmd, { windowsHide: true, ...opts });
}

function readPkgAtSha(baseSha, repoRoot, exec = execSafe) {
  if (!baseSha) return null;
  try {
    const out = exec(`git -C "${repoRoot}" show ${baseSha}:package.json`, {
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: 10000,
    });
    return String(out);
  } catch {
    return null;
  }
}

function parsePkgJson(raw) {
  if (raw === null || raw === undefined) return null;
  try {
    const obj = JSON.parse(raw);
    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) {
      const e = new Error('package.json root is not an object');
      e.code = 'INVALID_PACKAGE_JSON';
      throw e;
    }
    return obj;
  } catch (err) {
    if (err && err.code === 'INVALID_PACKAGE_JSON') throw err;
    const e = new Error(`package.json is not valid JSON: ${err.message}`);
    e.code = 'INVALID_PACKAGE_JSON';
    throw e;
  }
}

function depMap(pkg, key) {
  if (!pkg || typeof pkg !== 'object') return {};
  const m = pkg[key];
  if (!m || typeof m !== 'object' || Array.isArray(m)) return {};
  const out = {};
  for (const k of Object.keys(m)) {
    if (typeof m[k] === 'string') out[k] = m[k];
  }
  return out;
}

function diffDepMaps(before, after) {
  const added = [];
  for (const name of Object.keys(after)) {
    if (!(name in before)) {
      added.push({ name, version: after[name] });
    }
  }
  added.sort((a, b) => a.name.localeCompare(b.name));
  return added;
}

// Diff package.json between two commits and return the newly added
// dependency entries. Returns {hasChanges:false, ...} when package.json
// did not change at all so the caller can skip the expensive probe.
// Returns {reason:'invalid-package-json'} and propagates via throw when
// either side of the diff has malformed JSON -- the merge flow should
// refuse the merge rather than silently pass.
function detectNewDeps(baseSha, headSha, repoRoot, opts = {}) {
  const { exec = execSafe, readFile } = opts;
  if (!baseSha || !headSha || !repoRoot) {
    return { hasChanges: false, deps: [], devDeps: [], reason: 'missing-args' };
  }
  let changedFiles = '';
  try {
    changedFiles = String(exec(
      `git -C "${repoRoot}" diff-tree --no-commit-id --name-only -r ${baseSha} ${headSha}`,
      { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'], timeout: 10000 }
    ));
  } catch (err) {
    return {
      hasChanges: false,
      deps: [],
      devDeps: [],
      reason: 'diff-failed',
      error: err && err.message,
    };
  }
  const names = changedFiles.split('\n').map(s => s.trim()).filter(Boolean);
  if (!names.includes('package.json')) {
    return { hasChanges: false, deps: [], devDeps: [], reason: 'unchanged' };
  }
  const beforeRaw = readPkgAtSha(baseSha, repoRoot, exec);
  let headRaw;
  if (typeof readFile === 'function') {
    try { headRaw = readFile(path.join(repoRoot, 'package.json')); } catch { headRaw = null; }
  }
  if (!headRaw) headRaw = readPkgAtSha(headSha, repoRoot, exec);
  if (beforeRaw === null && headRaw === null) {
    return { hasChanges: false, deps: [], devDeps: [], reason: 'read-failed' };
  }
  const beforePkg = beforeRaw === null ? {} : parsePkgJson(beforeRaw);
  const afterPkg = headRaw === null ? {} : parsePkgJson(headRaw);
  const before = depMap(beforePkg, 'dependencies');
  const after = depMap(afterPkg, 'dependencies');
  const beforeDev = depMap(beforePkg, 'devDependencies');
  const afterDev = depMap(afterPkg, 'devDependencies');
  const deps = diffDepMaps(before, after);
  const devDeps = diffDepMaps(beforeDev, afterDev);
  return {
    hasChanges: true,
    deps,
    devDeps,
    reason: deps.length === 0 && devDeps.length === 0 ? 'no-new-deps' : 'new-deps',
  };
}

// Probe each dep by spawning a child `node -e "require(name)"`. Using a
// subprocess (instead of a `require()` in this process) is deliberate:
// - Node's internal module cache cannot mask a missing module.
// - A syntactically broken package that would throw at require time
//   cannot crash the caller.
// Returns {ok, failed:[{name, error}]}. `failed` is empty on success.
function verifyDepsLoadable(depNames, cwd, opts = {}) {
  const { spawn = _spawnSync, timeoutMs = 15000 } = opts;
  if (!Array.isArray(depNames) || depNames.length === 0) {
    return { ok: true, failed: [] };
  }
  const failed = [];
  for (const name of depNames) {
    if (typeof name !== 'string' || name.length === 0) {
      failed.push({ name: String(name), error: 'invalid dep name' });
      continue;
    }
    let res;
    try {
      res = spawn(process.execPath, ['-e', `require(${JSON.stringify(name)});`], {
        cwd,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
        timeout: timeoutMs,
        windowsHide: true,
      });
    } catch (err) {
      failed.push({ name, error: (err && err.message) || 'spawn failed' });
      continue;
    }
    if (!res || res.status !== 0) {
      const stderr = String((res && res.stderr) || '').trim();
      const stdout = String((res && res.stdout) || '').trim();
      failed.push({
        name,
        error: stderr || stdout || `exit ${res ? res.status : '?'}`,
      });
    }
  }
  return { ok: failed.length === 0, failed };
}

function formatFailure(result) {
  if (!result || result.ok) return '';
  const lines = ['    Missing / unloadable dependencies:'];
  for (const f of result.failed) {
    const msg = (f.error || '').split('\n')[0].slice(0, 200);
    lines.push(`      - ${f.name}: ${msg}`);
  }
  lines.push('    Run `npm ci` in the merge target before retrying.');
  return lines.join('\n');
}

// Glue: detect -> (caller installs) -> verify.
// Kept thin so src/cli.js can interleave `npm ci` progress / error
// reporting without pushing that noise into the pure helpers.
function runCheck({ baseSha, headSha, repoRoot, cwd, includeDev = false, exec = execSafe, spawn = _spawnSync, afterInstall }) {
  const detect = detectNewDeps(baseSha, headSha, repoRoot, { exec });
  if (!detect.hasChanges) {
    return { skipped: true, reason: detect.reason, detect };
  }
  const depNames = detect.deps.map(d => d.name);
  const devNames = detect.devDeps.map(d => d.name);
  if (typeof afterInstall === 'function') {
    try { afterInstall({ detect }); } catch (err) {
      return {
        skipped: false,
        ok: false,
        reason: 'install-failed',
        detail: err && err.message,
        detect,
      };
    }
  }
  const prodResult = verifyDepsLoadable(depNames, cwd, { spawn });
  const devResult = includeDev
    ? verifyDepsLoadable(devNames, cwd, { spawn })
    : { ok: true, failed: [] };
  return {
    skipped: false,
    ok: prodResult.ok,
    reason: prodResult.ok ? 'ok' : 'missing-deps',
    prod: prodResult,
    dev: devResult,
    detect,
  };
}

module.exports = {
  detectNewDeps,
  verifyDepsLoadable,
  runCheck,
  formatFailure,
  parsePkgJson,
  depMap,
  diffDepMaps,
};
