import { describe, it, expect } from 'vitest';
import type { Worker } from '../types';
import { zeroRollup, buildTree, type TreeNode } from './hierarchy-tree';

function makeWorker(overrides: Partial<Worker> & { name: string }): Worker {
  return {
    command: 'claude',
    target: 'local',
    branch: null,
    worktree: null,
    parent: null,
    scope: false,
    pid: null,
    status: 'idle',
    unreadSnapshots: 0,
    totalSnapshots: 0,
    intervention: null,
    lastQuestion: null,
    errorCount: 0,
    phase: null,
    testFailCount: 0,
    ...overrides,
  };
}

function flattenNames(roots: TreeNode[]): Set<string> {
  const out = new Set<string>();
  function walk(n: TreeNode): void {
    out.add(n.worker.name);
    for (const c of n.children) walk(c);
  }
  roots.forEach(walk);
  return out;
}

describe('zeroRollup', () => {
  it('returns all-zero counts', () => {
    expect(zeroRollup()).toEqual({
      total: 0, idle: 0, busy: 0, exited: 0, intervention: 0, error: 0,
    });
  });
});

describe('buildTree', () => {
  it('returns an empty forest for an empty input', () => {
    expect(buildTree([])).toEqual([]);
  });

  it('promotes parentless workers to roots', () => {
    const ws = [makeWorker({ name: 'a' }), makeWorker({ name: 'b' })];
    const roots = buildTree(ws);
    expect(roots.map((r) => r.worker.name)).toEqual(['a', 'b']);
    expect(roots[0]!.children).toEqual([]);
  });

  it('attaches children under their declared parent', () => {
    const ws = [
      makeWorker({ name: 'mgr' }),
      makeWorker({ name: 'wkr1', parent: 'mgr' }),
      makeWorker({ name: 'wkr2', parent: 'mgr' }),
    ];
    const roots = buildTree(ws);
    expect(roots).toHaveLength(1);
    expect(roots[0]!.worker.name).toBe('mgr');
    expect(roots[0]!.children.map((c) => c.worker.name)).toEqual(['wkr1', 'wkr2']);
  });

  it('promotes children whose parent name is unknown', () => {
    const ws = [makeWorker({ name: 'orphan', parent: 'ghost' })];
    const roots = buildTree(ws);
    expect(roots).toHaveLength(1);
    expect(roots[0]!.worker.name).toBe('orphan');
  });

  it('demotes self-parent edges to root (cycle guard)', () => {
    const ws = [makeWorker({ name: 'self', parent: 'self' })];
    const roots = buildTree(ws);
    expect(roots).toHaveLength(1);
    expect(roots[0]!.worker.name).toBe('self');
    expect(roots[0]!.children).toEqual([]);
  });

  it('breaks two-node cycles without losing either node', () => {
    const ws = [
      makeWorker({ name: 'a', parent: 'b' }),
      makeWorker({ name: 'b', parent: 'a' }),
    ];
    const roots = buildTree(ws);
    const visited = flattenNames(roots);
    expect(visited.has('a')).toBe(true);
    expect(visited.has('b')).toBe(true);
  });

  it('sorts siblings by name (locale ascending)', () => {
    const ws = [
      makeWorker({ name: 'b' }),
      makeWorker({ name: 'a' }),
      makeWorker({ name: 'c' }),
    ];
    const roots = buildTree(ws);
    expect(roots.map((r) => r.worker.name)).toEqual(['a', 'b', 'c']);
  });
});

describe('rollup (computed by buildTree)', () => {
  it('counts a single idle worker', () => {
    const roots = buildTree([makeWorker({ name: 'a', status: 'idle' })]);
    expect(roots[0]!.rollup).toEqual({
      total: 1, idle: 1, busy: 0, exited: 0, intervention: 0, error: 0,
    });
  });

  it('aggregates child counts into the parent rollup', () => {
    const ws = [
      makeWorker({ name: 'mgr', status: 'idle' }),
      makeWorker({ name: 'w1', parent: 'mgr', status: 'busy' }),
      makeWorker({ name: 'w2', parent: 'mgr', status: 'exited' }),
    ];
    const roots = buildTree(ws);
    expect(roots[0]!.rollup).toEqual({
      total: 3, idle: 1, busy: 1, exited: 1, intervention: 0, error: 0,
    });
  });

  it("counts intervention='approval_pending' as active", () => {
    const ws = [
      makeWorker({ name: 'mgr' }),
      makeWorker({ name: 'w1', parent: 'mgr', intervention: 'approval_pending' }),
    ];
    const roots = buildTree(ws);
    expect(roots[0]!.rollup.intervention).toBe(1);
  });

  it("treats intervention='past_resolved' as inactive", () => {
    const roots = buildTree([
      makeWorker({ name: 'a', intervention: 'past_resolved' }),
    ]);
    expect(roots[0]!.rollup.intervention).toBe(0);
  });

  it('counts errorCount>0 toward the error rollup', () => {
    const ws = [
      makeWorker({ name: 'a', errorCount: 1 }),
      makeWorker({ name: 'b', parent: 'a', errorCount: 0 }),
      makeWorker({ name: 'c', parent: 'a', errorCount: 5 }),
    ];
    const roots = buildTree(ws);
    expect(roots[0]!.rollup.error).toBe(2);
  });
});
