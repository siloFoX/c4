'use strict';

// Machine-to-machine file transfer (TODO 9.8).
//
// Responsibilities:
//   - rsync over ssh for general files (source code, build artifacts,
//     model weights). Progress is streamed via --info=progress2 so the
//     daemon can fan out SSE events to connected dashboards.
//   - git push over ssh for repositories so both sides share history
//     instead of treating a .git tree as opaque bytes.
//   - Safety guards that keep stray operator input from walking off the
//     source filesystem, wiping a remote host, or triggering shell
//     expansion on the receiving side.
//
// Pure Node (no node-pty, no external deps). child_process.spawn is
// injectable so tests drive the logic with fakes and assert on the
// built arg lists without touching the network.

const fs = require('fs');
const path = require('path');
const childProcess = require('child_process');
const fleetModule = require('./fleet');

const DEFAULT_SSH_OPTS = ['-o', 'BatchMode=yes', '-o', 'StrictHostKeyChecking=accept-new'];
// Paths that must never be a transfer source even under --allow-system.
// Touching /etc or /bin on every daemon process is not a legitimate c4
// workflow; refusing them at the input layer avoids a surprised operator
// discovering that they just pushed /etc/shadow to a peer.
const ALWAYS_DENY_SRC_PREFIXES = ['/etc', '/bin', '/sbin', '/boot', '/dev', '/proc', '/sys'];

// Shell metacharacters — we pass args through spawn (no shell), but the
// ssh remote side invokes a shell for the `host:path` part of rsync and
// for git push URLs. Reject the chars that would expand there.
const SHELL_METACHAR_RE = /[;&|`$(){}<>*?!\\\n\r\t\0"']/;

function hasShellMetachars(s) {
  return SHELL_METACHAR_RE.test(s);
}

function validateAlias(alias) {
  if (typeof alias !== 'string' || !alias.trim()) {
    throw new Error('alias must be a non-empty string');
  }
  // Same grammar fleet.js enforces on stored aliases.
  if (!/^[a-zA-Z0-9][\w.-]*$/.test(alias)) {
    throw new Error(`invalid alias '${alias}'`);
  }
  return alias;
}

function resolveMachine(alias, options = {}) {
  validateAlias(alias);
  const fleet = options.fleet || fleetModule;
  const machine = fleet.getMachine(alias, options);
  if (!machine) {
    throw new Error(`alias '${alias}' not found in fleet`);
  }
  // We prefer explicit ssh overrides if they exist on the machine row;
  // otherwise fall back to the daemon host (common case: a single LAN IP
  // answers for both the daemon HTTP port and the SSH daemon).
  return {
    alias: machine.alias,
    host: machine.host,
    port: machine.port,
    sshHost: machine.sshHost || machine.host,
    sshUser: machine.sshUser || '',
    sshPort: machine.sshPort || null,
    tags: Array.isArray(machine.tags) ? machine.tags.slice() : [],
  };
}

function buildSshTarget(machine) {
  if (!machine) throw new Error('machine is required');
  const host = machine.sshHost || machine.host;
  if (!host) throw new Error('machine.host is required');
  if (hasShellMetachars(host)) {
    throw new Error(`machine.host contains unsafe characters: ${host}`);
  }
  const user = machine.sshUser || '';
  if (user && hasShellMetachars(user)) {
    throw new Error(`machine.sshUser contains unsafe characters: ${user}`);
  }
  return user ? `${user}@${host}` : host;
}

function buildSshCommand(machine) {
  const parts = ['ssh', ...DEFAULT_SSH_OPTS];
  if (machine && machine.sshPort) {
    const port = parseInt(machine.sshPort, 10);
    if (!Number.isFinite(port) || port <= 0 || port > 65535) {
      throw new Error(`invalid sshPort '${machine.sshPort}'`);
    }
    parts.push('-p', String(port));
  }
  return parts.join(' ');
}

// ---- safety guards --------------------------------------------------------

function resolveAllowedRoots(options = {}) {
  const home = options.home || process.env.HOME || '/root';
  const projectRoot = options.projectRoot || process.cwd();
  const extras = Array.isArray(options.allowedRoots) ? options.allowedRoots : [];
  const roots = new Set();
  roots.add(path.resolve(home));
  roots.add(path.resolve(projectRoot));
  for (const r of extras) {
    if (typeof r === 'string' && r) roots.add(path.resolve(r));
  }
  return Array.from(roots);
}

function isUnderRoot(resolved, root) {
  const nr = root.endsWith(path.sep) ? root : root + path.sep;
  return resolved === root || resolved.startsWith(nr);
}

function validateSrcPath(src, options = {}) {
  if (typeof src !== 'string' || !src.trim()) {
    throw new Error('src must be a non-empty string');
  }
  if (hasShellMetachars(src)) {
    throw new Error(`src contains shell metacharacters: ${src}`);
  }
  // Normalize and resolve BEFORE the traversal check so `foo/../../bar`
  // cannot smuggle itself past a whitelist by relying on the literal
  // string not containing '/..'.
  const resolved = path.resolve(src);
  for (const denied of ALWAYS_DENY_SRC_PREFIXES) {
    if (isUnderRoot(resolved, denied)) {
      throw new Error(`src '${src}' is under protected system path '${denied}'`);
    }
  }
  if (options.allowSystem) return resolved;
  const roots = resolveAllowedRoots(options);
  const allowed = roots.some((root) => isUnderRoot(resolved, root));
  if (!allowed) {
    throw new Error(
      `src '${src}' is outside allowed roots (${roots.join(', ')}); pass allowSystem to override`
    );
  }
  return resolved;
}

function validateDestPath(dest, options = {}) {
  if (typeof dest !== 'string' || !dest.trim()) {
    throw new Error('dest must be a non-empty string');
  }
  if (hasShellMetachars(dest)) {
    throw new Error(`dest contains shell metacharacters: ${dest}`);
  }
  if (dest.startsWith('/') && !options.allowSystem) {
    throw new Error(
      `dest '${dest}' is an absolute remote path; pass allowSystem to override`
    );
  }
  // rsync uses `..` against the remote side too — never let an operator
  // mean "remote home" by accident and end up one directory above it.
  if (dest.split('/').includes('..')) {
    throw new Error(`dest '${dest}' contains '..' traversal`);
  }
  return dest;
}

function validateRemoteRepoPath(remotePath, options = {}) {
  if (typeof remotePath !== 'string' || !remotePath.trim()) {
    throw new Error('remoteRepoPath must be a non-empty string');
  }
  if (hasShellMetachars(remotePath)) {
    throw new Error(`remoteRepoPath contains shell metacharacters: ${remotePath}`);
  }
  if (remotePath.startsWith('/') && !options.allowSystem) {
    throw new Error(
      `remoteRepoPath '${remotePath}' is an absolute remote path; pass allowSystem to override`
    );
  }
  if (remotePath.split('/').includes('..')) {
    throw new Error(`remoteRepoPath '${remotePath}' contains '..' traversal`);
  }
  return remotePath;
}

// ---- rsync arg building ---------------------------------------------------

// Shell metacharacter check for rsync --exclude patterns is narrower
// than the general path check because patterns legitimately use glob
// chars (`*`, `?`, `[`, `]`) and those are never shell-expanded — rsync
// parses them internally and receives each pattern as an isolated argv
// entry. We still reject the truly dangerous chars that only make
// sense if someone is trying to inject a command.
const EXCLUDE_BAD_RE = /[;&|`$(){}<>\n\r\t\0"']/;

function normalizeExcludes(raw) {
  if (raw == null) return [];
  if (!Array.isArray(raw)) {
    throw new Error('excludes must be an array of strings');
  }
  const out = [];
  for (const item of raw) {
    if (item == null) continue;
    const s = String(item).trim();
    if (!s) continue;
    if (EXCLUDE_BAD_RE.test(s)) {
      throw new Error(`exclude pattern contains shell metacharacters: ${s}`);
    }
    out.push(s);
  }
  return out;
}

function buildRsyncArgs(params) {
  const {
    src,
    dest,
    machine,
    excludes = [],
    archive = true,
    compress = true,
    verbose = true,
    partialProgress = true,
    progress = true,
    dryRun = false,
  } = params || {};
  if (!src) throw new Error('src is required');
  if (dest == null) throw new Error('dest is required');
  if (!machine) throw new Error('machine is required');

  const args = [];
  // Task spec: -avzP + --info=progress2
  if (archive) args.push('-a');
  if (verbose) args.push('-v');
  if (compress) args.push('-z');
  if (partialProgress) args.push('-P');
  if (progress) args.push('--info=progress2');
  // Never bypass the remote path with --rsync-path; a constructed -rf
  // style command there is exactly the case the spec calls out.
  if (params.delete) args.push('--delete');
  if (dryRun) args.push('-n');
  const normExcludes = normalizeExcludes(excludes);
  for (const ex of normExcludes) {
    args.push('--exclude', ex);
  }
  args.push('-e', buildSshCommand(machine));
  args.push(src);
  args.push(`${buildSshTarget(machine)}:${dest}`);
  return args;
}

// ---- progress parsing -----------------------------------------------------

// One line of rsync --info=progress2 output. The cumulative progress
// line is the only one that carries the "<bytes> <pct>% <rate> <eta>"
// shape, so a single regex is enough to distinguish it from filename
// lines and summary lines.
const PROGRESS_LINE_RE = /^\s*([\d,]+)\s+(\d+)%\s+(\S+)\s+(\d+:\d{2}:\d{2})/;

function parseRsyncProgress(line) {
  if (typeof line !== 'string') return null;
  const m = line.match(PROGRESS_LINE_RE);
  if (!m) return null;
  const bytes = parseInt(m[1].replace(/,/g, ''), 10);
  const percent = parseInt(m[2], 10);
  const bytesPerSec = m[3];
  const eta = m[4];
  return { bytes, percent, bytesPerSec, eta };
}

function parseRsyncFileLine(line) {
  if (typeof line !== 'string') return null;
  if (!line.length) return null;
  if (/^\s/.test(line)) return null; // progress + indented status
  const trimmed = line.trim();
  if (!trimmed) return null;
  if (/^(sending|sent|receiving|total|speedup|delta-transmission|sent\s)/i.test(trimmed)) {
    return null;
  }
  if (/^\d+\s+files?\s+to\s+consider/i.test(trimmed)) return null;
  if (/^incremental file list/i.test(trimmed)) return null;
  if (/^\(xfr/i.test(trimmed)) return null;
  return trimmed;
}

// ---- transfer drivers -----------------------------------------------------

function chooseSpawn(options) {
  return options && typeof options.spawn === 'function'
    ? options.spawn
    : childProcess.spawn;
}

// Wire a child_process stream to a line-oriented callback. Injected so
// transferFiles + pushRepo share the same buffering.
function lineSplitter(onLine) {
  let buf = '';
  return {
    push(chunk) {
      buf += chunk.toString('utf8');
      let nl;
      while ((nl = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, nl);
        buf = buf.slice(nl + 1);
        try { onLine(line); } catch { /* ignore listener errors */ }
      }
    },
    flush() {
      if (buf) {
        try { onLine(buf); } catch { /* ignore */ }
        buf = '';
      }
    },
  };
}

function wireProgress(child, onProgress) {
  let currentFile = null;
  const handle = (line) => {
    if (!onProgress) return;
    const fileLine = parseRsyncFileLine(line);
    if (fileLine) {
      currentFile = fileLine;
      onProgress({ type: 'file', file: currentFile });
      return;
    }
    const progress = parseRsyncProgress(line);
    if (progress) {
      onProgress({ type: 'progress', file: currentFile, ...progress });
      return;
    }
  };
  const splitter = lineSplitter(handle);
  if (child && child.stdout && typeof child.stdout.on === 'function') {
    child.stdout.on('data', (chunk) => splitter.push(chunk));
  }
  return splitter;
}

function transferFiles(src, dest, options = {}) {
  const machine = options.machine;
  if (!machine) throw new Error('options.machine is required');
  const resolvedSrc = validateSrcPath(src, options);
  const validatedDest = validateDestPath(dest, options);
  const args = buildRsyncArgs({
    src: resolvedSrc,
    dest: validatedDest,
    machine,
    excludes: options.excludes,
    delete: options.delete,
    archive: options.archive,
    compress: options.compress,
    verbose: options.verbose,
    partialProgress: options.partialProgress,
    progress: options.progress,
    dryRun: options.dryRun,
  });
  const spawn = chooseSpawn(options);
  const child = spawn('rsync', args, {
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const splitter = wireProgress(child, options.onProgress);
  const stderrChunks = [];
  if (child && child.stderr && typeof child.stderr.on === 'function') {
    child.stderr.on('data', (chunk) => stderrChunks.push(chunk.toString('utf8')));
  }
  if (child && typeof child.on === 'function') {
    child.on('exit', (code, signal) => {
      splitter.flush();
      if (typeof options.onComplete === 'function') {
        options.onComplete({
          code,
          signal,
          ok: code === 0,
          stderr: stderrChunks.join(''),
        });
      }
    });
    child.on('error', (err) => {
      if (typeof options.onError === 'function') options.onError(err);
    });
  }
  return {
    started: true,
    pid: child && typeof child.pid === 'number' ? child.pid : null,
    child,
    cmd: 'rsync',
    args,
  };
}

// ---- git push -------------------------------------------------------------

function buildGitPushArgs(params) {
  const {
    machine,
    localRepoPath,
    remoteRepoPath,
    branch = '',
    force = false,
  } = params || {};
  if (!machine) throw new Error('machine is required');
  if (!localRepoPath) throw new Error('localRepoPath is required');
  if (!remoteRepoPath) throw new Error('remoteRepoPath is required');
  if (hasShellMetachars(localRepoPath)) {
    throw new Error(`localRepoPath contains shell metacharacters: ${localRepoPath}`);
  }
  if (branch && hasShellMetachars(branch)) {
    throw new Error(`branch contains shell metacharacters: ${branch}`);
  }
  const sshTarget = buildSshTarget(machine);
  const remoteUrl = `${sshTarget}:${remoteRepoPath}`;
  const args = ['-C', localRepoPath, 'push'];
  // force-with-lease only. Straight --force is never OK for c4-managed
  // branches; if the caller wants it they can pass it through opts
  // directly, but the helper refuses to build a plain --force.
  if (force) args.push('--force-with-lease');
  args.push(remoteUrl);
  if (branch) args.push(branch);
  return args;
}

function buildGitEnv(machine) {
  const parts = ['ssh', ...DEFAULT_SSH_OPTS];
  if (machine && machine.sshPort) {
    const port = parseInt(machine.sshPort, 10);
    if (!Number.isFinite(port) || port <= 0 || port > 65535) {
      throw new Error(`invalid sshPort '${machine.sshPort}'`);
    }
    parts.push('-p', String(port));
  }
  return { GIT_SSH_COMMAND: parts.join(' ') };
}

function pushRepo(machine, localRepoPath, branch, options = {}) {
  if (!machine) throw new Error('machine is required');
  const remoteRepoPath = options.remoteRepoPath;
  if (!remoteRepoPath) throw new Error('options.remoteRepoPath is required');
  // Local path safety: same guards as rsync src so a misconfigured
  // caller cannot push /etc or /home/other-user's repo. allowSystem
  // still bypasses.
  validateSrcPath(localRepoPath, options);
  validateRemoteRepoPath(remoteRepoPath, options);
  if (branch != null && branch !== '' && typeof branch !== 'string') {
    throw new Error('branch must be a string');
  }
  const args = buildGitPushArgs({
    machine,
    localRepoPath,
    remoteRepoPath,
    branch: branch || '',
    force: Boolean(options.force),
  });
  const env = Object.assign({}, options.env || process.env, buildGitEnv(machine));
  const spawn = chooseSpawn(options);
  const child = spawn('git', args, {
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const splitter = lineSplitter((line) => {
    if (typeof options.onProgress === 'function') {
      options.onProgress({ type: 'git', line });
    }
  });
  if (child && child.stdout && typeof child.stdout.on === 'function') {
    child.stdout.on('data', (chunk) => splitter.push(chunk));
  }
  if (child && child.stderr && typeof child.stderr.on === 'function') {
    // git push prints progress to stderr by convention.
    child.stderr.on('data', (chunk) => splitter.push(chunk));
  }
  if (child && typeof child.on === 'function') {
    child.on('exit', (code, signal) => {
      splitter.flush();
      if (typeof options.onComplete === 'function') {
        options.onComplete({ code, signal, ok: code === 0 });
      }
    });
    child.on('error', (err) => {
      if (typeof options.onError === 'function') options.onError(err);
    });
  }
  return {
    started: true,
    pid: child && typeof child.pid === 'number' ? child.pid : null,
    child,
    cmd: 'git',
    args,
    env,
  };
}

// ---- path helpers exposed for tests --------------------------------------

function isPathTraversal(rawPath) {
  if (typeof rawPath !== 'string' || !rawPath) return false;
  return rawPath.split('/').includes('..');
}

module.exports = {
  // safety
  validateAlias,
  validateSrcPath,
  validateDestPath,
  validateRemoteRepoPath,
  resolveAllowedRoots,
  isPathTraversal,
  hasShellMetachars,
  // rsync
  buildRsyncArgs,
  buildSshTarget,
  buildSshCommand,
  normalizeExcludes,
  parseRsyncProgress,
  parseRsyncFileLine,
  // git
  buildGitPushArgs,
  buildGitEnv,
  // machine
  resolveMachine,
  // drivers
  transferFiles,
  pushRepo,
  // constants (for tests and operators)
  DEFAULT_SSH_OPTS,
  ALWAYS_DENY_SRC_PREFIXES,
};
