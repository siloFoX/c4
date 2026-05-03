'use strict';

// Claude Code process discovery (8.32 slice 2).
//
// Given an attached session's JSONL path, locate the running Claude
// Code process (if any) that is currently writing to it. We scan
// /proc/<pid>/fd/ for an open file descriptor whose readlink target
// matches the JSONL path, and filter pids whose cmdline contains
// 'claude' so we don't have to walk every fd in the system.
//
// Linux-only — procfs is required. On other platforms every helper
// degrades gracefully to a null/empty result so the daemon can keep
// serving the read-only attach view without exploding. The /proc
// scan is deliberately read-only and never opens the target's fds.

const fs = require('fs');
const path = require('path');
const sessionParser = require('./session-parser');

function listPids() {
  let entries;
  try { entries = fs.readdirSync('/proc'); }
  catch { return []; }
  const pids = [];
  for (const e of entries) {
    if (/^\d+$/.test(e)) pids.push(parseInt(e, 10));
  }
  return pids;
}

function readCmdline(pid) {
  try {
    const buf = fs.readFileSync(`/proc/${pid}/cmdline`);
    // /proc/.../cmdline is NUL-separated. Empty trailing slot from
    // the final NUL is filtered with Boolean.
    return buf.toString('utf8').split('\0').filter(Boolean);
  } catch { return null; }
}

function readCwd(pid) {
  try { return fs.readlinkSync(`/proc/${pid}/cwd`); }
  catch { return null; }
}

function readStartTime(pid) {
  try { return fs.statSync(`/proc/${pid}`).mtime.toISOString(); }
  catch { return null; }
}

// Resolve every open fd to the path it points at. Many fds point to
// pipes / sockets / anon_inode entries (e.g. `socket:[12345]`); we
// return them verbatim so the caller can decide how to filter.
function listOpenFiles(pid) {
  let entries;
  try { entries = fs.readdirSync(`/proc/${pid}/fd`); }
  catch { return []; }
  const files = [];
  for (const e of entries) {
    try {
      const target = fs.readlinkSync(`/proc/${pid}/fd/${e}`);
      files.push(target);
    } catch { /* fd vanished mid-scan */ }
  }
  return files;
}

function looksLikeClaudeCode(cmdline) {
  if (!Array.isArray(cmdline) || cmdline.length === 0) return false;
  return cmdline.some((arg) => typeof arg === 'string' && /\bclaude\b/i.test(arg));
}

// Returns { pid, cmdline, cwd, startedAt, jsonlPath } for the first
// process that has the target jsonl open, or null if none found.
//
// Options:
//   cmdlinePredicate(cmdline) -> boolean
//     Custom filter. Defaults to looksLikeClaudeCode. Tests inject
//     their own predicate so a child `node` process opening a fixture
//     JSONL can stand in for the real Claude Code binary.
//   selfPid (number)
//     Override the pid that the scanner skips. Defaults to
//     process.pid so the daemon does not match itself when an
//     attached file lives in our own working set.
// Decode the project segment of a Claude Code session JSONL path.
//   /home/shinc/.claude/projects/-home-shinc-arps/<sid>.jsonl
//     -> '/home/shinc/arps'
// Returns null if the path is not under .claude/projects/.
function decodeProjectFromJsonl(jsonlPath) {
  if (!jsonlPath || typeof jsonlPath !== 'string') return null;
  const idx = jsonlPath.indexOf('/.claude/projects/');
  if (idx < 0) return null;
  const after = jsonlPath.slice(idx + '/.claude/projects/'.length);
  const slash = after.indexOf('/');
  if (slash < 0) return null;
  const dirSegment = after.slice(0, slash);
  return sessionParser.decodeProjectDir(dirSegment);
}

// Locate the Claude Code process for an attached JSONL.
//
// Strategy in order:
//   (A) fd-based exact match — scan /proc/<pid>/fd for a symlink
//       whose target is the JSONL path. Works for clients that hold
//       the file open (some local replay tools, our own tests).
//   (B) cwd-based fallback — Claude Code itself does not keep the
//       session JSONL open; it watches the project directory via
//       inotify and rewrites the file with each turn. So we match
//       the running claude process whose /proc/<pid>/cwd matches
//       the decoded project path of the JSONL. With multiple
//       candidates we pick the one whose start time best matches
//       the JSONL's first turn; if that fails we just return the
//       first match and surface `multipleCandidates: true` so the
//       UI can offer a picker.
function findProcessForJsonl(jsonlPath, opts = {}) {
  if (!jsonlPath || typeof jsonlPath !== 'string') return null;
  const target = path.resolve(jsonlPath);
  const cmdlinePredicate = typeof opts.cmdlinePredicate === 'function'
    ? opts.cmdlinePredicate : looksLikeClaudeCode;
  const selfPid = Number.isInteger(opts.selfPid) ? opts.selfPid : process.pid;

  const pids = listPids();
  const matches = [];

  for (const pid of pids) {
    if (pid === selfPid) continue;
    const cmdline = readCmdline(pid);
    if (!cmdline) continue;
    if (!cmdlinePredicate(cmdline)) continue;
    matches.push({ pid, cmdline });
  }

  // (A) fd-based — preferred whenever available.
  for (const m of matches) {
    const files = listOpenFiles(m.pid);
    if (files.some((p) => p === target)) {
      return {
        pid: m.pid,
        cmdline: m.cmdline,
        cwd: readCwd(m.pid),
        startedAt: readStartTime(m.pid),
        jsonlPath: target,
        match: 'fd',
      };
    }
  }

  // (B) cwd-based fallback. Skipped when the JSONL is outside the
  // standard projects/ tree (operator imported a custom transcript
  // — no encoding to compare against).
  const decodedProject = decodeProjectFromJsonl(target);
  if (!decodedProject) return null;

  const cwdMatches = [];
  for (const m of matches) {
    const cwd = readCwd(m.pid);
    if (!cwd) continue;
    if (cwd === decodedProject) {
      cwdMatches.push({
        pid: m.pid,
        cmdline: m.cmdline,
        cwd,
        startedAt: readStartTime(m.pid),
      });
    }
  }
  if (cwdMatches.length === 0) return null;

  return {
    ...cwdMatches[0],
    jsonlPath: target,
    match: 'cwd',
    multipleCandidates: cwdMatches.length > 1,
    candidatePids: cwdMatches.length > 1 ? cwdMatches.map((c) => c.pid) : undefined,
  };
}

// Enumerate every Claude Code process that has at least one
// .claude/projects/.../<uuid>.jsonl open. Used by a future fleet-
// view endpoint and as a sanity check during attach (so the UI can
// display "no live process" when the JSONL is just an exported
// transcript).
function listClaudeProcesses(opts = {}) {
  const cmdlinePredicate = typeof opts.cmdlinePredicate === 'function'
    ? opts.cmdlinePredicate : looksLikeClaudeCode;
  const selfPid = Number.isInteger(opts.selfPid) ? opts.selfPid : process.pid;

  const pids = listPids();
  const result = [];
  for (const pid of pids) {
    if (pid === selfPid) continue;
    const cmdline = readCmdline(pid);
    if (!cmdline) continue;
    if (!cmdlinePredicate(cmdline)) continue;
    const files = listOpenFiles(pid);
    const sessionPaths = files.filter((p) =>
      typeof p === 'string'
      && p.includes('/.claude/projects/')
      && p.endsWith('.jsonl'));
    if (sessionPaths.length === 0) continue;
    result.push({
      pid,
      cmdline,
      cwd: readCwd(pid),
      startedAt: readStartTime(pid),
      sessionPaths,
    });
  }
  return result;
}

module.exports = {
  findProcessForJsonl,
  listClaudeProcesses,
  listOpenFiles,
  listPids,
  readCmdline,
  readCwd,
  readStartTime,
  looksLikeClaudeCode,
  decodeProjectFromJsonl,
};
