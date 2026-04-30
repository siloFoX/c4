// Daemon static serving tests (TODO #94).
//
// Validates the _serveStatic helper extracted from daemon.js: SPA fallback,
// asset MIME types, cache headers, and path-traversal hardening.

'use strict';

const { describe, it, before, after } = require('node:test');
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const os = require('os');

// Replicate the helper logic by extracting the function from daemon.js source.
const daemonSrc = fs.readFileSync(path.join(__dirname, '..', 'src', 'daemon.js'), 'utf8');
const fnMatch = daemonSrc.match(/function _serveStatic[\s\S]*?\n\}\n/);
assert.ok(fnMatch, 'expected _serveStatic to exist in daemon.js');

// Build a sandbox dist tree, then evaluate _serveStatic against it.
const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'c4-static-'));
const distDir = path.join(tmpRoot, 'dist');
fs.mkdirSync(path.join(distDir, 'assets'), { recursive: true });
fs.writeFileSync(path.join(distDir, 'index.html'), '<!DOCTYPE html><html></html>');
fs.writeFileSync(path.join(distDir, 'assets', 'app.css'), 'body{}');
fs.writeFileSync(path.join(distDir, 'assets', 'app.js'), 'console.log(1)');

const STATIC_MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js':   'application/javascript; charset=utf-8',
  '.css':  'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg':  'image/svg+xml',
  '.png':  'image/png',
  '.jpg':  'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif':  'image/gif',
  '.ico':  'image/x-icon',
  '.txt':  'text/plain; charset=utf-8',
  '.map':  'application/json; charset=utf-8',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
};

function makeServeStatic(root) {
  // Inject our sandbox root + STATIC_MIME and rebind path/fs into closure.
  const code = `
    const STATIC_ROOT = ${JSON.stringify(root)};
    const STATIC_MIME = ${JSON.stringify(STATIC_MIME)};
    ${fnMatch[0]}
    return _serveStatic;
  `;
  return new Function('path', 'fsStatic', code)(path, fs);
}

const _serveStatic = makeServeStatic(distDir);

function fakeRes() {
  const headers = {};
  let status = 0;
  let body = null;
  return {
    headers,
    get status() { return status; },
    get body() { return body; },
    setHeader(k, v) { headers[k.toLowerCase()] = v; },
    writeHead(s) { status = s; },
    end(buf) { body = buf; },
  };
}

describe('_serveStatic (TODO #94)', () => {
  after(() => fs.rmSync(tmpRoot, { recursive: true, force: true }));

  it('returns false when STATIC_ROOT is missing', () => {
    const empty = makeServeStatic(path.join(tmpRoot, 'nope'));
    assert.strictEqual(empty('/index.html', fakeRes()), false);
  });

  it('serves index.html for /', () => {
    const res = fakeRes();
    assert.strictEqual(_serveStatic('/', res), true);
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.headers['content-type'], 'text/html; charset=utf-8');
    assert.strictEqual(res.headers['cache-control'], 'no-cache');
    assert.ok(res.body.toString().startsWith('<!DOCTYPE html>'));
  });

  it('serves CSS asset with long cache headers', () => {
    const res = fakeRes();
    assert.strictEqual(_serveStatic('/assets/app.css', res), true);
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.headers['content-type'], 'text/css; charset=utf-8');
    assert.match(res.headers['cache-control'], /immutable/);
    assert.strictEqual(res.body.toString(), 'body{}');
  });

  it('serves JS asset with long cache headers', () => {
    const res = fakeRes();
    assert.strictEqual(_serveStatic('/assets/app.js', res), true);
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.headers['content-type'], 'application/javascript; charset=utf-8');
    assert.match(res.headers['cache-control'], /immutable/);
  });

  it('returns false for missing /assets/* (so daemon falls through to JSON 404)', () => {
    const res = fakeRes();
    assert.strictEqual(_serveStatic('/assets/missing.css', res), false);
  });

  it('returns false for /api/* (lets API routes win even if dist exists)', () => {
    const res = fakeRes();
    assert.strictEqual(_serveStatic('/api/whatever', res), false);
  });

  it('falls back to index.html for unknown SPA routes', () => {
    const res = fakeRes();
    assert.strictEqual(_serveStatic('/projects/abc', res), true);
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.headers['content-type'], 'text/html; charset=utf-8');
    assert.ok(res.body.toString().startsWith('<!DOCTYPE html>'));
  });

  it('rejects path traversal escaping STATIC_ROOT', () => {
    // path.resolve normalizes ../, but a crafted absolute-like rel could escape.
    // We feed a literal ".." segment; URL parsing in real daemon strips this,
    // but the helper still defends.
    const res = fakeRes();
    // path.resolve(STATIC_ROOT, '.' + '/../../etc/passwd') jumps outside.
    // The startsWith(STATIC_ROOT) check must catch it.
    const result = _serveStatic('/../../etc/passwd', res);
    // Either false (rejected), or fallback to index.html (since the resolved
    // path is outside STATIC_ROOT and we don't fall through for /api or
    // /assets) — _serveStatic returns false in this case.
    if (result === true) {
      // If true, must be the SPA fallback (not /etc/passwd).
      assert.ok(res.body.toString().startsWith('<!DOCTYPE html>'));
    } else {
      assert.strictEqual(result, false);
    }
  });
});
