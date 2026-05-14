'use strict';

// (v1.11.132 / TODO 11.114) POST /client-errors browser-frame error
// sink. The daemon's new handler validates the minimum shape
// (kind in {error, unhandledrejection}, message is a string),
// appends a JSONL line to a ring file at C4_CLIENT_ERRORS_PATH (or
// ~/.c4/client-errors.jsonl), logs via the structured logger, and
// always returns 204 No Content -- even on malformed bodies -- so the
// browser-side capture path never re-fires from a non-2xx response.
//
// daemon.js does not export the handler -- the file eagerly creates
// and listens on http.createServer at load time, so we cannot require
// it from a test process. We mirror the same handler logic in a small
// in-process http.Server here (same trade tests/daemon-routes.test.js
// and tests/daemon-list-procmetrics.test.js make for /auth, /list,
// /autonomous, /config) and assert the response shape, the JSONL line
// content, and the no-write-on-invalid-kind path. A
// `daemon.js source integration` block at the bottom greps the real
// source so a refactor that drops the route or the JSONL append trips
// the test.

const assert = require('assert');
const fs = require('fs');
const http = require('http');
const os = require('os');
const path = require('path');
const { describe, it, before, after, afterEach } = require('node:test');

const request = require('supertest');

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

const CLIENT_ERRORS_MAX_BYTES = 10 * 1024 * 1024;

function resolveClientErrorsPath() {
  if (process.env.C4_CLIENT_ERRORS_PATH) return process.env.C4_CLIENT_ERRORS_PATH;
  const home = process.env.HOME || process.env.USERPROFILE || '.';
  return path.join(home, '.c4', 'client-errors.jsonl');
}

function appendClientErrorLine(obj) {
  try {
    const p = resolveClientErrorsPath();
    const dir = path.dirname(p);
    try { fs.mkdirSync(dir, { recursive: true }); } catch (_) { /* best-effort */ }
    try {
      const st = fs.statSync(p);
      if (st && typeof st.size === 'number' && st.size >= CLIENT_ERRORS_MAX_BYTES) {
        try { fs.renameSync(p, p + '.1'); } catch (_) { /* best-effort */ }
      }
    } catch (_) { /* file may not exist yet */ }
    fs.appendFileSync(p, JSON.stringify(obj) + '\n');
  } catch (_) { /* swallow */ }
}

// In-process server that mirrors daemon.js POST /client-errors. Each
// case calls `request(server).post('/client-errors').send(...)`.
function buildClientErrorsServer() {
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://127.0.0.1');
    const route = url.pathname.replace(/^\/api/, '') || '/';
    if (req.method !== 'POST' || route !== '/client-errors') {
      res.writeHead(404);
      res.end('not found');
      return;
    }
    let raw = '';
    req.on('data', (chunk) => { raw += chunk; });
    req.on('end', () => {
      let body = {};
      try { body = raw ? JSON.parse(raw) : {}; } catch (_) { body = {}; }
      try {
        const kind = body && body.kind;
        const message = body && body.message;
        const validKind = kind === 'error' || kind === 'unhandledrejection';
        if (validKind && typeof message === 'string') {
          appendClientErrorLine({
            kind,
            message,
            stack: typeof body.stack === 'string' ? body.stack : '',
            url: typeof body.url === 'string' ? body.url : '',
            line: typeof body.line === 'number' ? body.line : null,
            column: typeof body.column === 'number' ? body.column : null,
            userAgent: typeof body.userAgent === 'string' ? body.userAgent : '',
            timestamp: typeof body.timestamp === 'string'
              ? body.timestamp
              : new Date().toISOString(),
          });
        }
      } catch (_) { /* never fail */ }
      res.writeHead(204);
      res.end();
    });
  });
  return server;
}

function readLines(p) {
  if (!fs.existsSync(p)) return [];
  const raw = fs.readFileSync(p, 'utf8');
  return raw.split('\n').filter((l) => l.length > 0).map((l) => JSON.parse(l));
}

// ---------------------------------------------------------------------------
// POST /client-errors handler
// ---------------------------------------------------------------------------

describe('(v1.11.132) POST /client-errors', () => {
  let tmpPath;
  let server;

  before(() => {
    tmpPath = path.join(
      os.tmpdir(),
      `c4-client-errors-test-${process.pid}-${Date.now()}.jsonl`,
    );
    process.env.C4_CLIENT_ERRORS_PATH = tmpPath;
    server = buildClientErrorsServer();
  });

  afterEach(() => {
    try { fs.unlinkSync(tmpPath); } catch (_) { /* file may not exist */ }
  });

  after(() => {
    delete process.env.C4_CLIENT_ERRORS_PATH;
    try { fs.unlinkSync(tmpPath); } catch (_) { /* best-effort */ }
    try { fs.unlinkSync(tmpPath + '.1'); } catch (_) { /* best-effort */ }
    if (server) server.close();
  });

  it('returns 204 with no body on a valid kind=error payload', async () => {
    const res = await request(server)
      .post('/client-errors')
      .send({
        kind: 'error',
        message: 'something broke',
        stack: 'Error: something broke\n  at app.js:10:5',
        url: 'http://test/app.js',
        line: 10,
        column: 5,
        userAgent: 'TestAgent/1.0',
        timestamp: '2026-05-14T00:00:00.000Z',
      })
      .expect(204);
    assert.strictEqual(res.text, '');
    const lines = readLines(tmpPath);
    assert.strictEqual(lines.length, 1, 'one JSONL line written');
    assert.strictEqual(lines[0].kind, 'error');
    assert.strictEqual(lines[0].message, 'something broke');
    assert.strictEqual(lines[0].url, 'http://test/app.js');
    assert.strictEqual(lines[0].line, 10);
    assert.strictEqual(lines[0].column, 5);
    assert.strictEqual(lines[0].userAgent, 'TestAgent/1.0');
    assert.strictEqual(lines[0].timestamp, '2026-05-14T00:00:00.000Z');
  });

  it('accepts kind=unhandledrejection and writes a JSONL row', async () => {
    await request(server)
      .post('/client-errors')
      .send({
        kind: 'unhandledrejection',
        message: 'async failure',
        stack: '',
        url: 'http://test/',
        line: null,
        column: null,
        userAgent: 'TestAgent/1.0',
        timestamp: '2026-05-14T00:00:01.000Z',
      })
      .expect(204);
    const lines = readLines(tmpPath);
    assert.strictEqual(lines.length, 1);
    assert.strictEqual(lines[0].kind, 'unhandledrejection');
    assert.strictEqual(lines[0].message, 'async failure');
    assert.strictEqual(lines[0].line, null);
    assert.strictEqual(lines[0].column, null);
  });

  it('returns 204 and writes nothing on an invalid kind', async () => {
    await request(server)
      .post('/client-errors')
      .send({ kind: 'totally-bogus', message: 'should not land' })
      .expect(204);
    assert.deepStrictEqual(readLines(tmpPath), [],
      'invalid kind must not write a JSONL line');
  });

  it('returns 204 and writes nothing on a non-string message', async () => {
    await request(server)
      .post('/client-errors')
      .send({ kind: 'error', message: 12345 })
      .expect(204);
    assert.deepStrictEqual(readLines(tmpPath), [],
      'non-string message must not write a JSONL line');
  });

  it('returns 204 and writes nothing on an empty body', async () => {
    await request(server)
      .post('/client-errors')
      .send({})
      .expect(204);
    assert.deepStrictEqual(readLines(tmpPath), []);
  });

  it('ignores unknown extra fields without rejecting the payload', async () => {
    await request(server)
      .post('/client-errors')
      .send({
        kind: 'error',
        message: 'ok',
        extraField: 'ignored',
        anotherUnknown: { nested: true },
      })
      .expect(204);
    const lines = readLines(tmpPath);
    assert.strictEqual(lines.length, 1);
    assert.strictEqual(lines[0].kind, 'error');
    assert.strictEqual(lines[0].message, 'ok');
    assert.strictEqual(lines[0].extraField, undefined,
      'unknown fields must not bleed into the persisted line');
    assert.strictEqual(lines[0].anotherUnknown, undefined);
  });

  it('appends -- multiple valid POSTs produce one line each in order', async () => {
    await request(server)
      .post('/client-errors')
      .send({ kind: 'error', message: 'first' })
      .expect(204);
    await request(server)
      .post('/client-errors')
      .send({ kind: 'unhandledrejection', message: 'second' })
      .expect(204);
    await request(server)
      .post('/client-errors')
      .send({ kind: 'error', message: 'third' })
      .expect(204);
    const lines = readLines(tmpPath);
    assert.strictEqual(lines.length, 3);
    assert.deepStrictEqual(
      lines.map((l) => [l.kind, l.message]),
      [['error', 'first'], ['unhandledrejection', 'second'], ['error', 'third']],
    );
  });

  it('coerces non-number line/column to null and missing string fields to ""', async () => {
    await request(server)
      .post('/client-errors')
      .send({
        kind: 'error',
        message: 'coerce-me',
        line: 'NaN',
        column: { not: 'a number' },
      })
      .expect(204);
    const lines = readLines(tmpPath);
    assert.strictEqual(lines.length, 1);
    assert.strictEqual(lines[0].line, null);
    assert.strictEqual(lines[0].column, null);
    assert.strictEqual(lines[0].stack, '');
    assert.strictEqual(lines[0].url, '');
    assert.strictEqual(lines[0].userAgent, '');
  });
});

// ---------------------------------------------------------------------------
// daemon.js source integration
// ---------------------------------------------------------------------------
//
// Grep-style assertions so a future refactor that removes the route,
// the auth-bypass, or the JSONL append trips this test rather than
// silently regressing the browser-frame error sink.

describe('(v1.11.132) daemon.js source integration for /client-errors', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'daemon.js'), 'utf8');

  it('declares an isClientErrors auth-bypass alongside isCicdWebhook', () => {
    assert.ok(/isClientErrors\s*=/.test(src),
      'daemon.js must declare an isClientErrors guard for the auth check');
    assert.ok(/!isClientErrors/.test(src),
      'needsAuthCheck must subtract isClientErrors');
  });

  it('declares the POST /client-errors route handler', () => {
    assert.ok(
      /req\.method === 'POST'\s*&&\s*route === '\/client-errors'/.test(src),
      'daemon.js must declare a POST /client-errors route',
    );
  });

  it('writes a JSONL line via appendClientErrorLine() inside the handler', () => {
    const m = src.match(
      /route === '\/client-errors'[\s\S]*?res\.writeHead\(204\)/,
    );
    assert.ok(m, '/client-errors handler block not found');
    assert.ok(/appendClientErrorLine\(/.test(m[0]),
      '/client-errors handler must call appendClientErrorLine');
    assert.ok(/kind === 'error'/.test(m[0]),
      '/client-errors handler must validate kind === "error"');
    assert.ok(/kind === 'unhandledrejection'/.test(m[0]),
      '/client-errors handler must validate kind === "unhandledrejection"');
    assert.ok(/typeof message === 'string'/.test(m[0]),
      '/client-errors handler must require message to be a string');
  });

  it('returns 204 No Content on every code path', () => {
    const m = src.match(
      /route === '\/client-errors'[\s\S]*?res\.writeHead\(204\)/,
    );
    assert.ok(m, '/client-errors handler block not found');
    assert.ok(/res\.writeHead\(204\)/.test(m[0]),
      '/client-errors handler must writeHead(204)');
  });

  it('appendClientErrorLine respects the C4_CLIENT_ERRORS_PATH env var', () => {
    assert.ok(/process\.env\.C4_CLIENT_ERRORS_PATH/.test(src),
      'daemon.js must honour C4_CLIENT_ERRORS_PATH as the JSONL path override');
    assert.ok(/client-errors\.jsonl/.test(src),
      'daemon.js must default to a .jsonl ring file path');
  });

  it('rotates the ring file at the 10MB cap via rename to .1', () => {
    assert.ok(/CLIENT_ERRORS_MAX_BYTES\s*=\s*10\s*\*\s*1024\s*\*\s*1024/.test(src),
      'daemon.js must cap the ring file at 10MB');
    const rotateBlock = src.match(/appendClientErrorLine\(obj\)[\s\S]*?fs\.appendFileSync/);
    assert.ok(rotateBlock, 'appendClientErrorLine body not found');
    assert.ok(/fs\.renameSync\(p,\s*p\s*\+\s*'\.1'\)/.test(rotateBlock[0]),
      'appendClientErrorLine must one-step rotate via rename to <path>.1');
  });
});
