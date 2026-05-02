'use strict';

/**
 * Risk Sandbox Exec (11.5 Stage 2 — v1.10.83)
 *
 * THE function that actually runs a command inside a configured
 * SandboxRuntime. Intentionally NOT wired into the daemon's HTTP
 * surface or the CLI in this cut — surface lives in a follow-up
 * once the audit-event type lands.
 *
 * Why a separate module from `risk-sandbox-runtime.js`:
 *   - That module is pure (no exec, fully testable without
 *     spawn). It builds the argv. This module spawns the argv.
 *   - Splitting them lets `prepareArgs()` continue to be the
 *     "preview" surface that has zero side effects, and
 *     `executeInSandbox()` to be the "actually run it" surface
 *     that operators opt into per-call.
 *
 * Safety guarantees:
 *   - **Refuses NullRuntime.** No isolation == no exec. The
 *     operator must explicitly configure a real runtime
 *     (`docker` today). Even with `--sandbox-preview null` the
 *     exec path will throw `BlockedByRuntimeError`.
 *   - **Hard timeout.** Default 5s; SIGKILL after timeout. Caller
 *     can override via `opts.timeoutMs` but minimum 100ms,
 *     maximum 300_000ms (5 min) — clamped silently to keep
 *     accidental "sleep 1d" inputs from pinning the host.
 *   - **Stdout/stderr capped.** Default 16KB each, truncated tail
 *     marker `\n[...truncated]\n` appended. Caller can override
 *     via `opts.bufferLimit` but minimum 1024, maximum 1MB.
 *   - **No leaked errors.** Spawn failures, timeouts, and
 *     runtime-not-available probes all surface in the result
 *     shape — no thrown error reaches the caller. The only
 *     thrown errors are `BlockedByRuntimeError` (caller passed a
 *     NullRuntime) and `TypeError` (bad arg shape). Both are
 *     synchronous + happen before the spawn.
 *
 * Result shape:
 *   {
 *     exitCode:  number | null   // null when killed by timeout
 *     stdout:    string           // truncated to bufferLimit
 *     stderr:    string           // truncated to bufferLimit
 *     durationMs: number
 *     killed:    boolean          // true when timeout fired
 *     command:   string           // echoed for audit
 *     runtime:   { name, isolation }
 *     spawnError: string | null   // only set when spawn itself failed
 *                                 // (binary missing, perms, etc.)
 *   }
 */

const { spawn } = require('child_process');
const { NullRuntime } = require('./risk-sandbox-runtime');

class BlockedByRuntimeError extends Error {
  constructor(message) {
    super(message);
    this.name = 'BlockedByRuntimeError';
  }
}

const DEFAULT_TIMEOUT_MS = 5000;
const MIN_TIMEOUT_MS = 100;
const MAX_TIMEOUT_MS = 5 * 60 * 1000;

const DEFAULT_BUFFER_LIMIT = 16 * 1024;
const MIN_BUFFER_LIMIT = 1024;
const MAX_BUFFER_LIMIT = 1024 * 1024;

const TRUNC_MARKER = '\n[...truncated]\n';

function _clamp(n, lo, hi, dflt) {
  if (typeof n !== 'number' || !Number.isFinite(n)) return dflt;
  return Math.max(lo, Math.min(hi, Math.floor(n)));
}

/**
 * @param {{prepareArgs: Function, available: Function, describeIsolation: Function}} runtime
 * @param {string} command
 * @param {{ timeoutMs?: number, bufferLimit?: number,
 *           spawnImpl?: Function }} [opts]
 * @returns {Promise<object>}
 */
async function executeInSandbox(runtime, command, opts) {
  if (!runtime || typeof runtime.prepareArgs !== 'function') {
    throw new TypeError('executeInSandbox: runtime must implement prepareArgs');
  }
  if (typeof command !== 'string') {
    throw new TypeError('executeInSandbox: command must be a string');
  }
  if (runtime instanceof NullRuntime) {
    throw new BlockedByRuntimeError(
      'executeInSandbox refuses NullRuntime — no isolation == no exec'
    );
  }

  const o = opts && typeof opts === 'object' ? opts : {};
  const timeoutMs = _clamp(o.timeoutMs, MIN_TIMEOUT_MS, MAX_TIMEOUT_MS, DEFAULT_TIMEOUT_MS);
  const bufferLimit = _clamp(o.bufferLimit, MIN_BUFFER_LIMIT, MAX_BUFFER_LIMIT, DEFAULT_BUFFER_LIMIT);
  const spawnImpl = typeof o.spawnImpl === 'function' ? o.spawnImpl : spawn;

  const prep = runtime.prepareArgs(command);
  const isolation = prep.isolation;

  // Result envelope — built up as exec progresses, returned in
  // every code path.
  const result = {
    exitCode: null,
    stdout: '',
    stderr: '',
    durationMs: 0,
    killed: false,
    command,
    runtime: {
      name: isolation && isolation.name ? isolation.name : 'unknown',
      isolation: isolation || {},
    },
    spawnError: null,
  };

  // Probe runtime availability up front. Saves a noisy ENOENT
  // when docker isn't on PATH.
  if (typeof runtime.available === 'function') {
    const probe = runtime.available();
    if (probe && probe.ok === false) {
      result.spawnError = probe.reason || 'runtime not available';
      return result;
    }
  }

  const start = Date.now();
  return new Promise((resolve) => {
    let child;
    try {
      child = spawnImpl(prep.binary, prep.args, {
        env: { ...process.env, ...(prep.env || {}) },
        stdio: ['ignore', 'pipe', 'pipe'],
      });
    } catch (err) {
      result.spawnError = (err && err.message) || String(err);
      result.durationMs = Date.now() - start;
      resolve(result);
      return;
    }

    let stdoutBytes = 0;
    let stderrBytes = 0;
    let stdoutTruncated = false;
    let stderrTruncated = false;
    const stdoutChunks = [];
    const stderrChunks = [];

    if (child.stdout) {
      child.stdout.on('data', (buf) => {
        if (stdoutTruncated) return;
        if (stdoutBytes + buf.length > bufferLimit) {
          const room = bufferLimit - stdoutBytes;
          if (room > 0) stdoutChunks.push(buf.slice(0, room));
          stdoutTruncated = true;
          stdoutBytes = bufferLimit;
        } else {
          stdoutChunks.push(buf);
          stdoutBytes += buf.length;
        }
      });
    }
    if (child.stderr) {
      child.stderr.on('data', (buf) => {
        if (stderrTruncated) return;
        if (stderrBytes + buf.length > bufferLimit) {
          const room = bufferLimit - stderrBytes;
          if (room > 0) stderrChunks.push(buf.slice(0, room));
          stderrTruncated = true;
          stderrBytes = bufferLimit;
        } else {
          stderrChunks.push(buf);
          stderrBytes += buf.length;
        }
      });
    }

    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      try { child.kill('SIGKILL'); } catch { /* swallow */ }
    }, timeoutMs);

    child.on('error', (err) => {
      result.spawnError = (err && err.message) || String(err);
    });

    child.on('close', (code, signal) => {
      clearTimeout(timer);
      result.durationMs = Date.now() - start;
      // exitCode null when killed by signal (matches Node convention)
      result.exitCode = (typeof code === 'number') ? code : null;
      result.killed = timedOut || signal === 'SIGKILL';
      result.stdout = Buffer.concat(stdoutChunks).toString('utf8')
        + (stdoutTruncated ? TRUNC_MARKER : '');
      result.stderr = Buffer.concat(stderrChunks).toString('utf8')
        + (stderrTruncated ? TRUNC_MARKER : '');
      resolve(result);
    });
  });
}

module.exports = {
  executeInSandbox,
  BlockedByRuntimeError,
  DEFAULT_TIMEOUT_MS,
  MIN_TIMEOUT_MS,
  MAX_TIMEOUT_MS,
  DEFAULT_BUFFER_LIMIT,
  MIN_BUFFER_LIMIT,
  MAX_BUFFER_LIMIT,
  TRUNC_MARKER,
};
