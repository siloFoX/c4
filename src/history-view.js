'use strict';

// History view helpers (8.7).
//
// Pure functions that the daemon uses to build the `/history`, `/history/:name`,
// and `/scribe-context` responses. Kept dependency-free so tests can require
// the module without pulling node-pty.

const fs = require('fs');
const path = require('path');

function normalizeRecord(rec) {
  if (!rec || typeof rec !== 'object') return null;
  return {
    name: typeof rec.name === 'string' ? rec.name : null,
    task: typeof rec.task === 'string' ? rec.task : null,
    branch: typeof rec.branch === 'string' ? rec.branch : null,
    startedAt: typeof rec.startedAt === 'string' ? rec.startedAt : null,
    completedAt: typeof rec.completedAt === 'string' ? rec.completedAt : null,
    commits: Array.isArray(rec.commits) ? rec.commits : [],
    status: typeof rec.status === 'string' ? rec.status : null,
  };
}

function filterRecords(records, options) {
  const opts = options || {};
  const q = opts.q ? String(opts.q).toLowerCase() : '';
  const out = [];
  for (const raw of records || []) {
    const r = normalizeRecord(raw);
    if (!r) continue;
    if (opts.worker && r.name !== opts.worker) continue;
    if (opts.status && r.status !== opts.status) continue;
    if (opts.since && r.completedAt && r.completedAt < opts.since) continue;
    if (opts.until && r.completedAt && r.completedAt > opts.until) continue;
    if (q) {
      const hay = `${r.name || ''} ${r.task || ''} ${r.branch || ''}`.toLowerCase();
      if (!hay.includes(q)) continue;
    }
    out.push(r);
  }
  if (opts.limit && opts.limit > 0) {
    return out.slice(-opts.limit);
  }
  return out;
}

function summarizeWorkers(records, liveWorkers) {
  const byName = new Map();
  for (const raw of records || []) {
    const r = normalizeRecord(raw);
    if (!r || !r.name) continue;
    const slot = byName.get(r.name) || {
      name: r.name,
      taskCount: 0,
      firstTaskAt: null,
      lastTaskAt: null,
      lastTask: null,
      lastStatus: null,
      branches: new Set(),
      alive: false,
      liveStatus: null,
    };
    slot.taskCount += 1;
    if (r.completedAt) {
      if (!slot.firstTaskAt || r.completedAt < slot.firstTaskAt) slot.firstTaskAt = r.completedAt;
      if (!slot.lastTaskAt || r.completedAt > slot.lastTaskAt) {
        slot.lastTaskAt = r.completedAt;
        slot.lastTask = r.task;
        slot.lastStatus = r.status;
      }
    }
    if (r.branch) slot.branches.add(r.branch);
    byName.set(r.name, slot);
  }
  for (const w of liveWorkers || []) {
    if (!w || !w.name) continue;
    const slot = byName.get(w.name) || {
      name: w.name,
      taskCount: 0,
      firstTaskAt: null,
      lastTaskAt: null,
      lastTask: null,
      lastStatus: null,
      branches: new Set(),
      alive: false,
      liveStatus: null,
    };
    slot.alive = w.status !== 'exited';
    slot.liveStatus = w.status || null;
    if (w.branch) slot.branches.add(w.branch);
    byName.set(w.name, slot);
  }
  const out = [];
  for (const slot of byName.values()) {
    out.push({
      name: slot.name,
      taskCount: slot.taskCount,
      firstTaskAt: slot.firstTaskAt,
      lastTaskAt: slot.lastTaskAt,
      lastTask: slot.lastTask,
      lastStatus: slot.lastStatus,
      branches: Array.from(slot.branches),
      alive: slot.alive,
      liveStatus: slot.liveStatus,
    });
  }
  out.sort((a, b) => {
    const la = a.lastTaskAt || '';
    const lb = b.lastTaskAt || '';
    if (la > lb) return -1;
    if (la < lb) return 1;
    return a.name.localeCompare(b.name);
  });
  return out;
}

function readScribeContext(projectRoot, options) {
  const opts = options || {};
  const outputRel = typeof opts.outputPath === 'string' && opts.outputPath
    ? opts.outputPath
    : path.join('docs', 'session-context.md');
  const root = projectRoot || process.cwd();
  const candidatePath = path.isAbsolute(outputRel)
    ? outputRel
    : path.join(root, outputRel);
  const limit = Number(opts.maxBytes) > 0 ? Math.floor(Number(opts.maxBytes)) : 256 * 1024;
  try {
    const stat = fs.statSync(candidatePath);
    let content;
    let truncated = false;
    if (stat.size > limit) {
      truncated = true;
      const fd = fs.openSync(candidatePath, 'r');
      try {
        const buf = Buffer.alloc(limit);
        const start = Math.max(0, stat.size - limit);
        const bytesRead = fs.readSync(fd, buf, 0, limit, start);
        content = buf.slice(0, bytesRead).toString('utf8');
      } finally {
        fs.closeSync(fd);
      }
    } else {
      content = fs.readFileSync(candidatePath, 'utf8');
    }
    return {
      exists: true,
      path: candidatePath,
      size: stat.size,
      updatedAt: new Date(stat.mtimeMs).toISOString(),
      truncated,
      content,
    };
  } catch (e) {
    if (e && e.code === 'ENOENT') {
      return { exists: false, path: candidatePath, size: 0, updatedAt: null, truncated: false, content: '' };
    }
    return { exists: false, path: candidatePath, size: 0, updatedAt: null, truncated: false, content: '', error: e.message };
  }
}

module.exports = {
  normalizeRecord,
  filterRecords,
  summarizeWorkers,
  readScribeContext,
};
