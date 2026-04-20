'use strict';

// Hierarchy tree utility (8.2)
//
// Pure functions for assembling a parent/child tree from the flat worker
// list returned by `PtyManager.list()` and rendering it as an ASCII tree.
// Kept dependency-free so the CLI, daemon, and tests can all require it
// without pulling in node-pty.

function toArray(workers) {
  if (!workers) return [];
  if (Array.isArray(workers)) return workers;
  return [];
}

// Normalizes a single worker-like object into a tree node. Only the fields
// the tree view actually consumes get copied over; everything else stays
// untouched on the original list output.
function makeNode(w) {
  return {
    name: w.name,
    parent: w.parent || null,
    status: w.status || null,
    intervention: w.intervention || null,
    branch: w.branch || null,
    errorCount: Number.isFinite(w.errorCount) ? w.errorCount : 0,
    unreadSnapshots: Number.isFinite(w.unreadSnapshots) ? w.unreadSnapshots : 0,
    children: [],
    rollup: null,
  };
}

function zeroRollup() {
  return { total: 0, idle: 0, busy: 0, exited: 0, intervention: 0, error: 0 };
}

function isInterventionActive(node) {
  const iv = node.intervention;
  if (iv == null) return false;
  if (typeof iv === 'object') {
    if (Object.prototype.hasOwnProperty.call(iv, 'active')) {
      return Boolean(iv.active);
    }
    return Object.keys(iv).length > 0;
  }
  // (8.21) Only approval_pending is actionable. background_exit and
  // past_resolved are informational — do not count toward the rollup
  // or trigger the [intervention] badge.
  if (typeof iv === 'string') return iv === 'approval_pending';
  return Boolean(iv);
}

// Aggregates a subtree rollup: counts of each status across the node + all
// descendants. Intervention is tracked independently of status because a
// worker parked at an approval prompt is still "busy" in the scheduler.
function computeRollup(node) {
  const r = zeroRollup();
  r.total += 1;
  if (node.status === 'idle') r.idle += 1;
  else if (node.status === 'busy') r.busy += 1;
  else if (node.status === 'exited') r.exited += 1;
  if (isInterventionActive(node)) r.intervention += 1;
  if ((node.errorCount || 0) > 0) r.error += 1;
  for (const child of node.children) {
    const sub = computeRollup(child);
    r.total += sub.total;
    r.idle += sub.idle;
    r.busy += sub.busy;
    r.exited += sub.exited;
    r.intervention += sub.intervention;
    r.error += sub.error;
  }
  node.rollup = r;
  return r;
}

// Builds the tree from a flat worker list. Orphans (parent name that does
// not match any other worker) and cycles (A.parent=B, B.parent=A) get
// promoted to roots so the tree is always forest-complete and never loops.
function buildTree(workers) {
  const arr = toArray(workers).filter((w) => w && typeof w.name === 'string');
  const byName = new Map();
  for (const w of arr) byName.set(w.name, makeNode(w));

  const roots = [];
  for (const node of byName.values()) {
    const parentName = node.parent;
    if (parentName && byName.has(parentName) && parentName !== node.name) {
      // Cycle guard: walk up from the proposed parent; if we loop back to
      // the current node, treat this edge as broken and promote to root.
      let cursor = byName.get(parentName);
      let cycles = false;
      const seen = new Set([node.name]);
      while (cursor) {
        if (seen.has(cursor.name)) { cycles = true; break; }
        seen.add(cursor.name);
        const up = cursor.parent;
        if (!up || !byName.has(up)) break;
        cursor = byName.get(up);
      }
      if (cycles) {
        roots.push(node);
      } else {
        byName.get(parentName).children.push(node);
      }
    } else {
      roots.push(node);
    }
  }

  const sortNodes = (nodes) => {
    nodes.sort((a, b) => a.name.localeCompare(b.name));
    for (const n of nodes) sortNodes(n.children);
  };
  sortNodes(roots);

  for (const root of roots) computeRollup(root);
  return roots;
}

function statusBadge(node) {
  if (isInterventionActive(node)) return 'intervention';
  return node.status || 'unknown';
}

function formatRollup(r) {
  if (!r || r.total <= 1) return '';
  const parts = [];
  if (r.idle) parts.push(r.idle + ' idle');
  if (r.busy) parts.push(r.busy + ' busy');
  if (r.intervention) parts.push(r.intervention + ' intervention');
  if (r.error) parts.push(r.error + ' error');
  if (r.exited) parts.push(r.exited + ' exited');
  if (parts.length === 0) return '[' + r.total + ' total]';
  return '[' + parts.join(', ') + ']';
}

// Renders the tree as ASCII. Uses plain `|`, `+`, `-` and spaces so the
// output stays pure ASCII (the C4 project rule) and copy/pastes cleanly
// from terminals that do not render box-drawing glyphs.
function renderTree(roots) {
  const lines = [];

  const renderNode = (node, prefix, isLast, isRoot) => {
    let line;
    if (isRoot) {
      line = node.name;
    } else {
      const branch = isLast ? '+-- ' : '+-- ';
      line = prefix + branch + node.name;
    }
    const status = '[' + statusBadge(node) + ']';
    const rollup = formatRollup(node.rollup);
    const branchInfo = node.branch ? '(' + node.branch + ')' : '';
    const suffix = [status, rollup, branchInfo].filter(Boolean).join(' ');
    lines.push((line + '  ' + suffix).trimEnd());

    const childPrefix = isRoot ? '' : prefix + (isLast ? '    ' : '|   ');
    const children = node.children;
    for (let i = 0; i < children.length; i++) {
      renderNode(children[i], childPrefix, i === children.length - 1, false);
    }
  };

  for (let i = 0; i < roots.length; i++) {
    renderNode(roots[i], '', i === roots.length - 1, true);
  }
  return lines.join('\n');
}

function flatten(roots) {
  const out = [];
  const walk = (node) => {
    out.push(node);
    for (const c of node.children) walk(c);
  };
  for (const r of roots) walk(r);
  return out;
}

module.exports = {
  buildTree,
  renderTree,
  computeRollup,
  isInterventionActive,
  statusBadge,
  formatRollup,
  flatten,
};
