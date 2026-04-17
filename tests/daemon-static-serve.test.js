// Static file serving for built web UI (8.12)
'use strict';

const { describe, it, before, after } = require('node:test');
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { PassThrough } = require('stream');

const {
  serveStatic,
  pickFile,
  resolveSafePath,
  mimeFor,
  webDistExists,
  resolveApiRoute,
} = require('../src/static-server');

let tmpRoot;
let webDist;

before(() => {
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'c4-static-test-'));
  webDist = path.join(tmpRoot, 'dist');
  fs.mkdirSync(webDist, { recursive: true });
  fs.mkdirSync(path.join(webDist, 'assets'), { recursive: true });
  fs.writeFileSync(path.join(webDist, 'index.html'),
    '<!DOCTYPE html><html><body>index</body></html>');
  fs.writeFileSync(path.join(webDist, 'assets', 'app.js'),
    'console.log("hi");');
  fs.writeFileSync(path.join(webDist, 'assets', 'style.css'),
    'body{color:red}');
});

after(() => {
  try { fs.rmSync(tmpRoot, { recursive: true, force: true }); } catch {}
});

// Writable sink that captures writeHead + body. fs.createReadStream(...).pipe()
// treats it as a stream.Writable, so PassThrough is fine as the base.
function makeSink() {
  const sink = new PassThrough();
  const captured = { status: null, headers: {} };
  sink.writeHead = (code, hdrs) => {
    captured.status = code;
    if (hdrs) for (const k of Object.keys(hdrs)) captured.headers[k.toLowerCase()] = String(hdrs[k]);
    sink.headersSent = true;
  };
  sink.setHeader = (k, v) => { captured.headers[k.toLowerCase()] = String(v); };
  sink.getHeader = (k) => captured.headers[k.toLowerCase()];
  sink.headersSent = false;
  const chunks = [];
  sink.on('data', (c) => chunks.push(c));
  const done = new Promise((resolve) => sink.on('end', resolve));
  sink.captured = captured;
  sink.body = () => Buffer.concat(chunks);
  sink.waitDone = () => done;
  return sink;
}

describe('mimeFor', () => {
  it('maps common extensions', () => {
    assert.ok(mimeFor('a.html').startsWith('text/html'));
    assert.ok(mimeFor('a.js').includes('javascript'));
    assert.ok(mimeFor('a.css').startsWith('text/css'));
    assert.strictEqual(mimeFor('a.svg'), 'image/svg+xml');
    assert.strictEqual(mimeFor('a.png'), 'image/png');
  });

  it('falls back to octet-stream for unknown', () => {
    assert.strictEqual(mimeFor('blob.xyz'), 'application/octet-stream');
  });
});

describe('resolveSafePath', () => {
  it('resolves plain paths under webDist', () => {
    const p = resolveSafePath(webDist, '/index.html');
    assert.strictEqual(p, path.resolve(webDist, 'index.html'));
  });

  it('contains traversal attempts within webDist', () => {
    // path.posix.normalize collapses leading `..` at root, so the result
    // stays under webDist rather than escaping. Verify containment.
    const a = resolveSafePath(webDist, '/../secret');
    const b = resolveSafePath(webDist, '/../../etc/passwd');
    const distRes = path.resolve(webDist);
    assert.ok(a && a.startsWith(distRes + path.sep), `${a} not under ${distRes}`);
    assert.ok(b && b.startsWith(distRes + path.sep), `${b} not under ${distRes}`);
  });

  it('strips query/fragment', () => {
    const p = resolveSafePath(webDist, '/index.html?v=1#x');
    assert.strictEqual(p, path.resolve(webDist, 'index.html'));
  });
});

describe('pickFile', () => {
  it('returns file for existing asset', () => {
    const r = pickFile(webDist, '/assets/app.js');
    assert.strictEqual(r.kind, 'file');
    assert.ok(r.path.endsWith('app.js'));
    assert.ok(r.size > 0);
  });

  it('returns index.html for /', () => {
    const r = pickFile(webDist, '/');
    assert.strictEqual(r.kind, 'file');
    assert.ok(r.path.endsWith('index.html'));
  });

  it('SPA fallback for unknown routes', () => {
    const r = pickFile(webDist, '/workers/worker-1/detail');
    assert.strictEqual(r.kind, 'spa-fallback');
    assert.ok(r.path.endsWith('index.html'));
  });

  it('traversal-style path is SPA-fallbacked (contained, then miss)', () => {
    // `/../outside` normalizes to `outside` under webDist, which does not
    // exist, so the pickFile() result is spa-fallback — not `forbidden`.
    const r = pickFile(webDist, '/../outside');
    assert.strictEqual(r.kind, 'spa-fallback');
  });

  it('missing-dist when webDist absent', () => {
    const r = pickFile(path.join(tmpRoot, 'does-not-exist'), '/');
    assert.strictEqual(r.kind, 'missing-dist');
  });

  it('no-index when dist exists but index.html missing', () => {
    const bare = fs.mkdtempSync(path.join(os.tmpdir(), 'c4-no-index-'));
    try {
      const r = pickFile(bare, '/anything');
      assert.strictEqual(r.kind, 'no-index');
    } finally {
      try { fs.rmSync(bare, { recursive: true, force: true }); } catch {}
    }
  });
});

describe('webDistExists', () => {
  it('true when index.html present', () => {
    assert.strictEqual(webDistExists(webDist), true);
  });
  it('false for empty dir', () => {
    const empty = fs.mkdtempSync(path.join(os.tmpdir(), 'c4-empty-'));
    try {
      assert.strictEqual(webDistExists(empty), false);
    } finally {
      try { fs.rmSync(empty, { recursive: true, force: true }); } catch {}
    }
  });
  it('false for missing dir', () => {
    assert.strictEqual(webDistExists(path.join(tmpRoot, 'missing')), false);
  });
});

describe('resolveApiRoute', () => {
  it('strips /api prefix', () => {
    assert.deepStrictEqual(resolveApiRoute('/api/list'),   { isApi: true,  route: '/list' });
    assert.deepStrictEqual(resolveApiRoute('/api/health'), { isApi: true,  route: '/health' });
    assert.deepStrictEqual(resolveApiRoute('/api/events'), { isApi: true,  route: '/events' });
  });

  it('treats bare /api as /', () => {
    assert.deepStrictEqual(resolveApiRoute('/api'), { isApi: true, route: '/' });
  });

  it('passes non-api paths through unchanged', () => {
    assert.deepStrictEqual(resolveApiRoute('/health'),         { isApi: false, route: '/health' });
    assert.deepStrictEqual(resolveApiRoute('/'),               { isApi: false, route: '/' });
    assert.deepStrictEqual(resolveApiRoute('/dashboard'),      { isApi: false, route: '/dashboard' });
    // "/application" must not be treated as /api — it just happens to start
    // with the letters "/api".
    assert.deepStrictEqual(resolveApiRoute('/application'),    { isApi: false, route: '/application' });
  });

  it('handles nested /api/<a>/<b>', () => {
    assert.deepStrictEqual(resolveApiRoute('/api/wait-read-multi'),
      { isApi: true, route: '/wait-read-multi' });
  });
});

describe('serveStatic', () => {
  it('serves index.html for GET /', async () => {
    const sink = makeSink();
    const handled = serveStatic({ method: 'GET', url: '/' }, sink, { webDist, urlPath: '/' });
    assert.strictEqual(handled, true);
    await sink.waitDone();
    assert.strictEqual(sink.captured.status, 200);
    assert.ok((sink.captured.headers['content-type'] || '').startsWith('text/html'));
    const body = sink.body().toString('utf8');
    assert.ok(body.includes('<!DOCTYPE html>'));
    assert.ok(body.includes('index'));
  });

  it('serves asset with correct mime + full body', async () => {
    const sink = makeSink();
    serveStatic({ method: 'GET', url: '/assets/app.js' }, sink,
      { webDist, urlPath: '/assets/app.js' });
    await sink.waitDone();
    assert.strictEqual(sink.captured.status, 200);
    assert.ok((sink.captured.headers['content-type'] || '').includes('javascript'));
    assert.ok(sink.body().toString('utf8').includes('console.log'));
  });

  it('SPA fallback returns index.html for unknown route', async () => {
    const sink = makeSink();
    serveStatic({ method: 'GET', url: '/nonexistent/route' }, sink,
      { webDist, urlPath: '/nonexistent/route' });
    await sink.waitDone();
    assert.strictEqual(sink.captured.status, 200);
    assert.ok((sink.captured.headers['content-type'] || '').startsWith('text/html'));
    assert.ok(sink.body().toString('utf8').includes('index'));
  });

  it('503 when web/dist missing — JSON with build:web hint', () => {
    // JSON response uses res.end(string) — no piping; no done-wait needed.
    const sink = makeSink();
    const handled = serveStatic({ method: 'GET', url: '/' }, sink,
      { webDist: path.join(tmpRoot, 'nope'), urlPath: '/' });
    assert.strictEqual(handled, true);
    assert.strictEqual(sink.captured.status, 503);
    const body = JSON.parse(sink.body().toString('utf8'));
    assert.ok(/web\/dist/.test(body.error));
    assert.ok(/build:web/.test(body.hint));
  });

  it('404 JSON when index.html missing in dist', () => {
    const bare = fs.mkdtempSync(path.join(os.tmpdir(), 'c4-no-index2-'));
    try {
      const sink = makeSink();
      serveStatic({ method: 'GET', url: '/' }, sink, { webDist: bare, urlPath: '/' });
      assert.strictEqual(sink.captured.status, 404);
      const body = JSON.parse(sink.body().toString('utf8'));
      assert.ok(/index\.html/.test(body.error));
    } finally {
      try { fs.rmSync(bare, { recursive: true, force: true }); } catch {}
    }
  });

  it('rejects non-GET/HEAD (does not handle)', () => {
    const sink = makeSink();
    const handled = serveStatic({ method: 'POST', url: '/' }, sink, { webDist, urlPath: '/' });
    assert.strictEqual(handled, false);
    assert.strictEqual(sink.captured.status, null);
  });

  it('HEAD returns headers + Content-Length, no body', () => {
    const sink = makeSink();
    const handled = serveStatic({ method: 'HEAD', url: '/' }, sink, { webDist, urlPath: '/' });
    assert.strictEqual(handled, true);
    assert.strictEqual(sink.captured.status, 200);
    assert.ok(Number(sink.captured.headers['content-length']) > 0);
    assert.strictEqual(sink.body().length, 0);
  });
});
