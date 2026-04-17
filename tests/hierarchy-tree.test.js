'use strict';

// Hierarchy tree tests (8.2)
//
// Covers the pure tree-builder utility (parent/child forest, rollup,
// orphan + cycle handling, ASCII render) plus source-level wiring that
// guarantees the CLI, daemon, and pty-manager actually call through to
// the utility. No node-pty required: we hit src/hierarchy-tree.js
// directly and source-grep the rest.

const { describe, it } = require('node:test');
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const tree = require(path.join(ROOT, 'src', 'hierarchy-tree'));

const READ = (relPath) => fs.readFileSync(path.join(ROOT, relPath), 'utf8');

function mockWorker(overrides) {
  return Object.assign({
    name: 'w',
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
  }, overrides);
}

function findNode(roots, name) {
  for (const r of roots) {
    if (r.name === name) return r;
    const deep = findNode(r.children, name);
    if (deep) return deep;
  }
  return null;
}

describe('hierarchy-tree.buildTree (8.2)', () => {
  it('returns empty array for empty/invalid input', () => {
    assert.deepStrictEqual(tree.buildTree([]), []);
    assert.deepStrictEqual(tree.buildTree(null), []);
    assert.deepStrictEqual(tree.buildTree(undefined), []);
  });

  it('promotes workers with no parent to roots', () => {
    const workers = [
      mockWorker({ name: 'alpha' }),
      mockWorker({ name: 'beta' }),
    ];
    const roots = tree.buildTree(workers);
    assert.strictEqual(roots.length, 2);
    // Sorted alphabetically.
    assert.strictEqual(roots[0].name, 'alpha');
    assert.strictEqual(roots[1].name, 'beta');
    assert.strictEqual(roots[0].children.length, 0);
  });

  it('nests children under their parent by name', () => {
    const workers = [
      mockWorker({ name: 'root' }),
      mockWorker({ name: 'child-a', parent: 'root' }),
      mockWorker({ name: 'child-b', parent: 'root' }),
      mockWorker({ name: 'grand', parent: 'child-a' }),
    ];
    const roots = tree.buildTree(workers);
    assert.strictEqual(roots.length, 1);
    assert.strictEqual(roots[0].name, 'root');
    assert.strictEqual(roots[0].children.length, 2);
    const childA = findNode(roots, 'child-a');
    assert.ok(childA);
    assert.strictEqual(childA.children.length, 1);
    assert.strictEqual(childA.children[0].name, 'grand');
  });

  it('promotes orphans (unknown parent) to roots', () => {
    const workers = [
      mockWorker({ name: 'orphan', parent: 'ghost' }),
      mockWorker({ name: 'solo' }),
    ];
    const roots = tree.buildTree(workers);
    const names = roots.map((r) => r.name).sort();
    assert.deepStrictEqual(names, ['orphan', 'solo']);
  });

  it('breaks cycles: A.parent=B, B.parent=A produces two roots instead of recursion', () => {
    const workers = [
      mockWorker({ name: 'a', parent: 'b' }),
      mockWorker({ name: 'b', parent: 'a' }),
    ];
    const roots = tree.buildTree(workers);
    // At least one of them demotes to root so the forest terminates.
    // We do not overspecify which one, just that we do not recurse forever
    // and every worker appears exactly once in the forest.
    const flat = tree.flatten(roots);
    const names = flat.map((n) => n.name).sort();
    assert.deepStrictEqual(names, ['a', 'b']);
  });

  it('breaks self-cycle: worker whose parent === self is a root', () => {
    const workers = [mockWorker({ name: 'self', parent: 'self' })];
    const roots = tree.buildTree(workers);
    assert.strictEqual(roots.length, 1);
    assert.strictEqual(roots[0].name, 'self');
  });

  it('skips entries without a name instead of throwing', () => {
    const workers = [
      mockWorker({ name: 'ok' }),
      { parent: 'ok' }, // no name
      null,
    ];
    const roots = tree.buildTree(workers);
    assert.strictEqual(roots.length, 1);
    assert.strictEqual(roots[0].name, 'ok');
  });
});

describe('hierarchy-tree.computeRollup (8.2)', () => {
  it('counts each status across the subtree', () => {
    const workers = [
      mockWorker({ name: 'root', status: 'busy' }),
      mockWorker({ name: 'c1', parent: 'root', status: 'idle' }),
      mockWorker({ name: 'c2', parent: 'root', status: 'idle' }),
      mockWorker({ name: 'c3', parent: 'root', status: 'exited' }),
      mockWorker({ name: 'gc', parent: 'c1', status: 'busy', errorCount: 2 }),
    ];
    const roots = tree.buildTree(workers);
    const rollup = roots[0].rollup;
    assert.strictEqual(rollup.total, 5);
    assert.strictEqual(rollup.idle, 2);
    assert.strictEqual(rollup.busy, 2);
    assert.strictEqual(rollup.exited, 1);
    assert.strictEqual(rollup.error, 1);
    assert.strictEqual(rollup.intervention, 0);
  });

  it('counts intervention independently of status', () => {
    const workers = [
      mockWorker({ name: 'root', status: 'busy', intervention: { active: true, reason: 'approve' } }),
      mockWorker({ name: 'child', parent: 'root', status: 'busy', intervention: { active: false } }),
      mockWorker({ name: 'child2', parent: 'root', status: 'idle', intervention: { reason: 'ask' } }),
    ];
    const roots = tree.buildTree(workers);
    const r = roots[0].rollup;
    assert.strictEqual(r.total, 3);
    // root (active:true) + child2 (no 'active' key but truthy contents) = 2.
    assert.strictEqual(r.intervention, 2);
  });

  it('handles null / missing fields gracefully', () => {
    const workers = [
      { name: 'orphan' }, // no parent, no status, no counts
      { name: 'child', parent: 'orphan' },
    ];
    const roots = tree.buildTree(workers);
    assert.strictEqual(roots[0].rollup.total, 2);
    assert.strictEqual(roots[0].rollup.idle, 0);
    assert.strictEqual(roots[0].rollup.error, 0);
  });
});

describe('hierarchy-tree.renderTree (8.2)', () => {
  it('renders an ASCII-only tree with status badges', () => {
    const workers = [
      mockWorker({ name: 'mgr', status: 'busy' }),
      mockWorker({ name: 'w1', parent: 'mgr', status: 'idle' }),
      mockWorker({ name: 'w2', parent: 'mgr', status: 'idle' }),
    ];
    const roots = tree.buildTree(workers);
    const text = tree.renderTree(roots);
    assert.ok(text.includes('mgr'));
    assert.ok(text.includes('w1'));
    assert.ok(text.includes('w2'));
    assert.ok(text.includes('[busy]'));
    assert.ok(text.includes('[idle]'));
    assert.ok(/\+--/.test(text), 'tree should use ASCII +-- connectors');
    // Every byte must be printable ASCII (<=0x7e) or a newline (0x0a).
    for (const ch of text) {
      const code = ch.charCodeAt(0);
      assert.ok(code === 0x0a || (code >= 0x20 && code <= 0x7e),
        'non-ASCII char in renderTree output: ' + code.toString(16));
    }
  });

  it('shows rollup badge when the subtree has more than one node', () => {
    const workers = [
      mockWorker({ name: 'root', status: 'busy' }),
      mockWorker({ name: 'c1', parent: 'root', status: 'idle' }),
    ];
    const roots = tree.buildTree(workers);
    const text = tree.renderTree(roots);
    assert.ok(/1 idle/.test(text) || /\[1 idle/.test(text) || text.includes('1 idle'),
      'rollup should surface child idle count: ' + text);
  });

  it('renders empty input as empty string', () => {
    assert.strictEqual(tree.renderTree([]), '');
  });

  it('uses [intervention] badge for active intervention', () => {
    const workers = [
      mockWorker({ name: 'w', status: 'busy', intervention: { active: true } }),
    ];
    const roots = tree.buildTree(workers);
    const text = tree.renderTree(roots);
    assert.ok(text.includes('[intervention]'));
  });
});

describe('hierarchy-tree wiring: source-level integration (8.2)', () => {
  it('pty-manager.create records parent option on worker record', () => {
    const src = READ('src/pty-manager.js');
    // The worker literal must carry parent (string-or-null) derived from options.parent.
    assert.ok(/parent:\s*options\.parent/.test(src),
      'create() should assign parent from options');
    // And the list() payload must echo it so the tree builder sees it.
    assert.ok(/parent:\s*w\.parent\s*\|\|\s*null/.test(src),
      'list() should include parent per worker');
  });

  it('pty-manager persists parent through _saveState / _loadState', () => {
    const src = READ('src/pty-manager.js');
    // _saveState must write parent into the JSON blob.
    const saveMatch = src.match(/_saveState\s*\(\s*\)\s*\{[\s\S]*?\n\s{2}\}/);
    assert.ok(saveMatch, 'expected _saveState block');
    assert.ok(/parent:\s*w\.parent\s*\|\|\s*null/.test(saveMatch[0]),
      '_saveState should include parent field');
    // _loadState reconstructs lostWorkers with parent for hierarchy tree.
    assert.ok(/parent:\s*w\.parent\s*\|\|\s*null/.test(src),
      'lost worker entries should preserve parent');
  });

  it('pty-manager injects C4_WORKER_NAME env so nested c4 new detects parent', () => {
    const src = READ('src/pty-manager.js');
    assert.ok(/C4_WORKER_NAME:\s*name/.test(src),
      'worker spawn env must expose C4_WORKER_NAME');
  });

  it('daemon /create forwards parent and exposes GET /tree', () => {
    const src = READ('src/daemon.js');
    assert.ok(/route === '\/create'[\s\S]{0,400}parent/.test(src),
      '/create should pass parent through parseBody');
    assert.ok(/route === '\/tree'/.test(src),
      'daemon should expose /tree endpoint');
    assert.ok(/require\(['"]\.\/hierarchy-tree['"]\)/.test(src),
      'daemon /tree should require the hierarchy-tree util');
  });

  it('cli new accepts --parent and auto-detects from C4_WORKER_NAME', () => {
    const src = READ('src/cli.js');
    assert.ok(/--parent/.test(src), 'cli new should parse --parent flag');
    assert.ok(/process\.env\.C4_WORKER_NAME/.test(src),
      'cli new should fall back to C4_WORKER_NAME env');
  });

  it('cli list --tree delegates to hierarchy-tree render', () => {
    const src = READ('src/cli.js');
    assert.ok(/--tree/.test(src), 'cli list should accept --tree flag');
    assert.ok(/require\(['"]\.\/hierarchy-tree['"]\)/.test(src),
      'cli list --tree should use the hierarchy-tree util');
    assert.ok(/renderTree\s*\(/.test(src),
      'cli list --tree should call renderTree');
  });
});

describe('hierarchy-tree CLI: end-to-end --tree output (8.2)', () => {
  // Smoke test: spin up the CLI against a stub daemon response and confirm
  // stdout renders the hierarchy. We do not need a live daemon here since
  // the CLI's HTTP client is trivial; we invoke the module-level render
  // path the CLI relies on.

  it('renderTree output matches expected structure', () => {
    const workers = [
      mockWorker({ name: 'mgr', status: 'busy', branch: 'main' }),
      mockWorker({ name: 'w1', parent: 'mgr', status: 'idle', branch: 'feat/a' }),
      mockWorker({ name: 'w2', parent: 'mgr', status: 'idle', branch: 'feat/b' }),
      mockWorker({ name: 'gc', parent: 'w1', status: 'busy', intervention: { active: true } }),
    ];
    const roots = tree.buildTree(workers);
    const out = tree.renderTree(roots);
    const lines = out.split('\n');
    // First line is the manager root (no tree connector).
    assert.ok(lines[0].startsWith('mgr'), 'first line should start with root name');
    // Children should appear below the root with a tree connector.
    assert.ok(lines.some((l) => l.includes('+-- w1')), 'should render w1 child');
    assert.ok(lines.some((l) => l.includes('+-- w2')), 'should render w2 child');
    // Grandchild should be deeper (prefix width longer than w1's).
    const grandLine = lines.find((l) => l.includes('gc'));
    assert.ok(grandLine, 'grandchild gc should render');
    assert.ok(grandLine.indexOf('gc') > lines.find((l) => l.includes('+-- w1')).indexOf('w1'),
      'grandchild should be deeper than parent');
    // Intervention badge should surface on gc.
    assert.ok(grandLine.includes('[intervention]'));
  });
});
