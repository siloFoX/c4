'use strict';

// External Claude session import (8.17) tests.
//
// Covers src/session-attach.js unit behavior + daemon/web wiring via
// source-greps. The fixture session.jsonl from 8.18 is reused so we
// do not carry two transcripts. Every test that touches the persisted
// store uses a tmpdir path so the operator's real ~/.c4/attached.json
// is never read or written.

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { describe, it, before, after } = require('node:test');

const attach = require('../src/session-attach');
const parser = require('../src/session-parser');

const FIXTURE_PATH = path.join(__dirname, 'fixtures', 'session.jsonl');

function makeTmpStore() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'c4-attach-test-'));
  return {
    dir: tmp,
    storePath: path.join(tmp, 'attached.json'),
    cleanup: () => fs.rmSync(tmp, { recursive: true, force: true }),
  };
}

// Build an isolated projects root with a fixture copy under a
// synthetic project dir. resolveSessionPath's UUID branch scans this
// root so we can exercise single-match / multi-match / zero-match
// paths without touching the real ~/.claude/projects.
function makeProjectsRoot({ withDuplicate = false } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'c4-attach-root-'));
  const projA = path.join(root, '-home-test-demo');
  fs.mkdirSync(projA, { recursive: true });
  const source = fs.readFileSync(FIXTURE_PATH);
  fs.writeFileSync(path.join(projA, 'uuid-aaa.jsonl'), source);
  if (withDuplicate) {
    const projB = path.join(root, '-var-log');
    fs.mkdirSync(projB, { recursive: true });
    fs.writeFileSync(path.join(projB, 'uuid-aaa.jsonl'), source);
  }
  return {
    root,
    cleanup: () => fs.rmSync(root, { recursive: true, force: true }),
  };
}

describe('session-attach.AttachStore', () => {
  it('starts empty when no file exists', () => {
    const { storePath, cleanup } = makeTmpStore();
    try {
      const store = new attach.AttachStore({ storePath });
      assert.deepStrictEqual(store.list(), []);
    } finally {
      cleanup();
    }
  });

  it('persists a record and reloads it from disk', () => {
    const { storePath, cleanup } = makeTmpStore();
    try {
      const store = new attach.AttachStore({ storePath });
      store.add({
        name: 'demo-1',
        jsonlPath: '/tmp/one.jsonl',
        sessionId: 'abc',
        projectPath: '/tmp',
        createdAt: '2026-04-18T00:00:00.000Z',
        lastOffset: 0,
      });
      const reloaded = new attach.AttachStore({ storePath });
      const list = reloaded.list();
      assert.strictEqual(list.length, 1);
      assert.strictEqual(list[0].name, 'demo-1');
      assert.strictEqual(list[0].sessionId, 'abc');
      assert.strictEqual(list[0].jsonlPath, '/tmp/one.jsonl');
    } finally {
      cleanup();
    }
  });

  it('rejects duplicate names with a clear error', () => {
    const { storePath, cleanup } = makeTmpStore();
    try {
      const store = new attach.AttachStore({ storePath });
      const rec = {
        name: 'dup',
        jsonlPath: '/tmp/a.jsonl',
        sessionId: 'a',
        projectPath: null,
        createdAt: null,
        lastOffset: 0,
      };
      store.add(rec);
      assert.throws(() => store.add({ ...rec, jsonlPath: '/tmp/b.jsonl' }),
        /already exists/);
    } finally {
      cleanup();
    }
  });

  it('remove returns false for unknown names and true when it actually removed', () => {
    const { storePath, cleanup } = makeTmpStore();
    try {
      const store = new attach.AttachStore({ storePath });
      assert.strictEqual(store.remove('nope'), false);
      store.add({
        name: 'goner',
        jsonlPath: '/tmp/g.jsonl',
        sessionId: null,
        projectPath: null,
        createdAt: null,
        lastOffset: 0,
      });
      assert.strictEqual(store.remove('goner'), true);
      assert.deepStrictEqual(store.list(), []);
    } finally {
      cleanup();
    }
  });

  it('normalizeRecord drops records missing name or jsonlPath', () => {
    assert.strictEqual(attach.normalizeRecord(null), null);
    assert.strictEqual(attach.normalizeRecord({ name: 'x' }), null);
    assert.strictEqual(attach.normalizeRecord({ jsonlPath: '/x' }), null);
    const ok = attach.normalizeRecord({ name: 'a', jsonlPath: '/a.jsonl' });
    assert.ok(ok);
    assert.strictEqual(ok.name, 'a');
  });

  it('reload ignores malformed store contents and falls back to empty', () => {
    const { storePath, cleanup } = makeTmpStore();
    try {
      fs.writeFileSync(storePath, '{not json');
      const store = new attach.AttachStore({ storePath });
      assert.deepStrictEqual(store.list(), []);
    } finally {
      cleanup();
    }
  });
});

describe('session-attach.resolveSessionPath', () => {
  it('resolves an absolute .jsonl path that exists', () => {
    const out = attach.resolveSessionPath(FIXTURE_PATH);
    assert.strictEqual(out.path, FIXTURE_PATH);
    assert.ok(typeof out.sessionId === 'string');
  });

  it('rejects a path that does not exist', () => {
    const out = attach.resolveSessionPath('/tmp/does/not/exist.jsonl');
    assert.strictEqual(out.code, 'ENOENT');
  });

  it('rejects a non-.jsonl extension when the input looks like a path', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'c4-attach-badext-'));
    try {
      const wrong = path.join(tmp, 'not.txt');
      fs.writeFileSync(wrong, 'hi');
      const out = attach.resolveSessionPath(wrong);
      assert.strictEqual(out.code, 'BAD_EXT');
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('finds a single matching UUID under projectsRoot', () => {
    const { root, cleanup } = makeProjectsRoot();
    try {
      const out = attach.resolveSessionPath('uuid-aaa', { projectsRoot: root });
      assert.strictEqual(out.sessionId, 'uuid-aaa');
      assert.ok(out.path.endsWith('uuid-aaa.jsonl'));
    } finally {
      cleanup();
    }
  });

  it('surfaces ambiguity when the same UUID appears under two project dirs', () => {
    const { root, cleanup } = makeProjectsRoot({ withDuplicate: true });
    try {
      const out = attach.resolveSessionPath('uuid-aaa', { projectsRoot: root });
      assert.strictEqual(out.code, 'AMBIGUOUS');
      assert.ok(Array.isArray(out.matches) && out.matches.length === 2);
    } finally {
      cleanup();
    }
  });

  it('returns NOT_FOUND when the UUID has no match under projectsRoot', () => {
    const { root, cleanup } = makeProjectsRoot();
    try {
      const out = attach.resolveSessionPath('missing-uuid', { projectsRoot: root });
      assert.strictEqual(out.code, 'NOT_FOUND');
    } finally {
      cleanup();
    }
  });

  it('rejects empty / missing input', () => {
    assert.strictEqual(attach.resolveSessionPath('').code, 'MISSING_INPUT');
    assert.strictEqual(attach.resolveSessionPath(null).code, 'MISSING_INPUT');
  });
});

describe('session-attach.attach', () => {
  it('happy path: persists the record and returns a parse summary', () => {
    const { storePath, cleanup } = makeTmpStore();
    try {
      const store = new attach.AttachStore({ storePath });
      const out = attach.attach(FIXTURE_PATH, { store });
      assert.strictEqual(out.ok, true);
      assert.strictEqual(out.record.jsonlPath, FIXTURE_PATH);
      // The fixture has an explicit sessionId inside the file.
      assert.strictEqual(out.record.sessionId, 'fixture-1');
      assert.ok(out.summary.turns > 0);
      // Round-trip: another store pointed at the same file sees the record.
      const reloaded = new attach.AttachStore({ storePath });
      assert.strictEqual(reloaded.list().length, 1);
    } finally {
      cleanup();
    }
  });

  it('blocks re-attaching the same path a second time', () => {
    const { storePath, cleanup } = makeTmpStore();
    try {
      const store = new attach.AttachStore({ storePath });
      const first = attach.attach(FIXTURE_PATH, { store });
      assert.strictEqual(first.ok, true);
      const second = attach.attach(FIXTURE_PATH, { store });
      assert.strictEqual(second.code, 'ALREADY_ATTACHED');
      assert.strictEqual(second.existing.name, first.record.name);
    } finally {
      cleanup();
    }
  });

  it('resolves by UUID under projectsRoot', () => {
    const { root, cleanup: cleanRoot } = makeProjectsRoot();
    const { storePath, cleanup: cleanStore } = makeTmpStore();
    try {
      const store = new attach.AttachStore({ storePath });
      const out = attach.attach('uuid-aaa', { store, projectsRoot: root });
      assert.strictEqual(out.ok, true);
      assert.ok(out.record.jsonlPath.endsWith('uuid-aaa.jsonl'));
    } finally {
      cleanStore();
      cleanRoot();
    }
  });

  it('accepts a custom alias via opts.name', () => {
    const { storePath, cleanup } = makeTmpStore();
    try {
      const store = new attach.AttachStore({ storePath });
      const out = attach.attach(FIXTURE_PATH, { store, name: 'my-alias' });
      assert.strictEqual(out.ok, true);
      assert.strictEqual(out.record.name, 'my-alias');
    } finally {
      cleanup();
    }
  });

  it('summary includes model + warnings count', () => {
    const { storePath, cleanup } = makeTmpStore();
    try {
      const store = new attach.AttachStore({ storePath });
      const out = attach.attach(FIXTURE_PATH, { store });
      assert.strictEqual(out.summary.model, 'claude-opus-4-7');
      // The fixture has a malformed line so the parser records a
      // warning; confirm we surface the count faithfully.
      assert.ok(out.summary.warnings >= 1);
    } finally {
      cleanup();
    }
  });
});

describe('session-attach.detach', () => {
  it('removes a known attachment', () => {
    const { storePath, cleanup } = makeTmpStore();
    try {
      const store = new attach.AttachStore({ storePath });
      const out = attach.attach(FIXTURE_PATH, { store });
      const detOut = attach.detach(out.record.name, { store });
      assert.strictEqual(detOut.ok, true);
      assert.deepStrictEqual(store.list(), []);
    } finally {
      cleanup();
    }
  });

  it('returns NOT_FOUND for unknown names', () => {
    const { storePath, cleanup } = makeTmpStore();
    try {
      const store = new attach.AttachStore({ storePath });
      const detOut = attach.detach('nobody', { store });
      assert.strictEqual(detOut.code, 'NOT_FOUND');
    } finally {
      cleanup();
    }
  });
});

describe('session-parser wiring for the attach module', () => {
  it('re-uses parser.parseJsonl via summarize (no re-implementation)', () => {
    const src = fs.readFileSync(
      path.join(__dirname, '..', 'src', 'session-attach.js'),
      'utf8',
    );
    assert.match(src, /require\(\s*['"]\.\/session-parser['"]\s*\)/);
    assert.match(src, /sessionParser\.parseJsonl/);
  });

  it('summarize matches parseJsonl output for the shared fields', () => {
    const conv = parser.parseJsonl(FIXTURE_PATH);
    const summary = attach.summarize(FIXTURE_PATH);
    assert.strictEqual(summary.sessionId, conv.sessionId);
    assert.strictEqual(summary.model, conv.model);
    assert.strictEqual(summary.tokens.input, conv.totalInputTokens);
    assert.strictEqual(summary.tokens.output, conv.totalOutputTokens);
    assert.strictEqual(summary.turns, conv.turns.length);
  });
});

describe('daemon.js wiring for /api/attach', () => {
  const src = fs.readFileSync(
    path.join(__dirname, '..', 'src', 'daemon.js'),
    'utf8',
  );

  it('requires src/session-attach.js', () => {
    assert.match(src, /require\(\s*['"]\.\/session-attach['"]\s*\)/);
  });

  it('dispatches POST /attach', () => {
    assert.match(src, /req\.method === 'POST' && route === '\/attach'/);
  });

  it('dispatches GET /attach/list', () => {
    assert.match(src, /route === '\/attach\/list'/);
  });

  it('dispatches DELETE /attach/:name via attachParams', () => {
    assert.match(src, /attachParams\s*=\s*null/);
    assert.match(src, /req\.method === 'DELETE' && attachParams && attachParams\.kind === 'one'/);
  });

  it('dispatches GET /attach/:name/conversation for the viewer', () => {
    assert.match(src, /attachParams\.kind === 'conversation'/);
    assert.match(src, /sessionParser\.parseJsonl\(record\.jsonlPath\)/);
  });

  it('gates all four attach routes behind rbac.ACTIONS.WORKER_CREATE', () => {
    // Count the number of WORKER_CREATE gates that sit in the attach
    // route block. We look for the four requireRole calls inside the
    // POST /attach + GET /attach/list + DELETE + GET conversation
    // branches by slicing between markers.
    const startIdx = src.indexOf("route === '/attach'");
    const endIdx = src.indexOf("route === '/fleet/overview'");
    assert.ok(startIdx > 0 && endIdx > startIdx);
    const block = src.slice(startIdx, endIdx);
    const matches = block.match(/rbac\.ACTIONS\.WORKER_CREATE/g) || [];
    assert.ok(matches.length >= 4, `expected 4+ WORKER_CREATE gates, saw ${matches.length}`);
  });

  it('runs attach routes through the existing auth.checkRequest gate', () => {
    assert.match(src, /auth\.checkRequest\(cfg, req, route\)/);
  });
});

describe('SessionsView.tsx wiring for attached sessions', () => {
  const src = fs.readFileSync(
    path.join(__dirname, '..', 'web', 'src', 'components', 'SessionsView.tsx'),
    'utf8',
  );

  it('fetches /api/attach/list alongside /api/sessions', () => {
    assert.match(src, /apiGet<AttachedListResponse>\('\/api\/attach\/list'\)/);
    assert.match(src, /apiGet<SessionsResponse>\('\/api\/sessions'\)/);
  });

  it('POSTs /api/attach for the "Attach new..." modal', () => {
    assert.match(src, /apiPost<AttachResponse>\('\/api\/attach'/);
  });

  it('DELETEs /api/attach/:name for the detach button', () => {
    assert.match(src, /apiDelete\(`\/api\/attach\/\$\{encodeURIComponent\(name\)\}`\)/);
  });

  it('reuses ConversationView for attached sessions via snapshotUrl', () => {
    assert.match(src, /import ConversationView from '\.\/ConversationView'/);
    assert.match(src, /snapshotUrl=\{`\/api\/attach\/\$\{encodeURIComponent\(selection\.name\)\}\/conversation`\}/);
  });
});

describe('ConversationView.tsx accepts the 8.17 snapshotUrl override', () => {
  const src = fs.readFileSync(
    path.join(__dirname, '..', 'web', 'src', 'components', 'ConversationView.tsx'),
    'utf8',
  );

  it('declares snapshotUrl + streamUrl props', () => {
    assert.match(src, /snapshotUrl\?:\s*string/);
    assert.match(src, /streamUrl\?:\s*string/);
  });

  it('prefers snapshotUrl when provided', () => {
    assert.match(src, /snapshotUrl \|\| `\/api\/sessions\/\$\{encodeURIComponent\(sessionId\)\}`/);
  });
});

describe('api.ts exposes apiDelete for the detach button', () => {
  const src = fs.readFileSync(
    path.join(__dirname, '..', 'web', 'src', 'lib', 'api.ts'),
    'utf8',
  );

  it('exports apiDelete', () => {
    assert.match(src, /export async function apiDelete/);
    assert.match(src, /method: 'DELETE'/);
  });
});

describe('cli.js exposes c4 attach / attach list / attach detach', () => {
  const src = fs.readFileSync(
    path.join(__dirname, '..', 'src', 'cli.js'),
    'utf8',
  );

  it("has case 'attach'", () => {
    assert.match(src, /case 'attach':/);
  });

  it('wires the three subcommands to the correct HTTP verbs', () => {
    assert.match(src, /request\('POST', '\/attach',/);
    assert.match(src, /request\('GET', '\/attach\/list'\)/);
    assert.match(src, /request\('DELETE', `\/attach\/\$\{encodeURIComponent\(name\)\}`\)/);
  });
});

describe('pty-manager.list() stamps kind="spawned" on every row', () => {
  it('adds kind field to every worker record (default spawned)', () => {
    const src = fs.readFileSync(
      path.join(__dirname, '..', 'src', 'pty-manager.js'),
      'utf8',
    );
    assert.match(src, /kind: w\.kind \|\| 'spawned'/);
  });
});
