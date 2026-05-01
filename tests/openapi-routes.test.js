'use strict';

// Integration test for the daemon-side openapi routes — spins up an
// in-process HTTP server, asks it for /openapi.json + /api-docs +
// /api-docs/swagger-ui.css, asserts shape + content-type + size.
//
// We don't reuse the prod daemon (heavy startup) — a tiny harness
// imitates the dispatch shape that openapi.json + the static handler
// rely on.

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const path = require('path');
const fs = require('fs');

const { buildSpec } = require('../src/openapi-gen');

function startServer() {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      const url = req.url || '/';
      if (url === '/openapi.json') {
        const spec = buildSpec({ version: '1.8.0', baseUrl: 'http://test' });
        res.setHeader('Content-Type', 'application/json');
        res.writeHead(200);
        res.end(JSON.stringify(spec));
      } else if (url === '/api-docs') {
        const html = `<!DOCTYPE html><html><head><title>C4 daemon API · Swagger UI</title></head><body><script src="/api-docs/swagger-ui-bundle.js"></script></body></html>`;
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.writeHead(200);
        res.end(html);
      } else if (url.startsWith('/api-docs/')) {
        const filename = url.slice('/api-docs/'.length);
        const allowed = new Set([
          'swagger-ui.css',
          'swagger-ui-bundle.js',
          'swagger-ui-standalone-preset.js',
        ]);
        if (!allowed.has(filename)) {
          res.writeHead(404);
          res.end(JSON.stringify({ error: 'Not found' }));
          return;
        }
        try {
          const swagger = require('swagger-ui-dist');
          const filePath = path.join(swagger.getAbsoluteFSPath(), filename);
          const content = fs.readFileSync(filePath);
          const ct = filename.endsWith('.css') ? 'text/css' : 'application/javascript';
          res.setHeader('Content-Type', ct + '; charset=utf-8');
          res.writeHead(200);
          res.end(content);
        } catch (e) {
          res.writeHead(500);
          res.end(JSON.stringify({ error: e.message }));
        }
      } else {
        res.writeHead(404);
        res.end(JSON.stringify({ error: 'Not found' }));
      }
    });
    server.listen(0, '127.0.0.1', () => resolve(server));
  });
}

function get(server, url) {
  const port = server.address().port;
  return new Promise((resolve, reject) => {
    http.get(`http://127.0.0.1:${port}${url}`, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve({
        status: res.statusCode,
        headers: res.headers,
        body: Buffer.concat(chunks),
      }));
    }).on('error', reject);
  });
}

describe('daemon /openapi.json route', () => {
  let server;
  before(async () => { server = await startServer(); });
  after(() => server && server.close());

  it('returns 200 + application/json + valid spec', async () => {
    const r = await get(server, '/openapi.json');
    assert.equal(r.status, 200);
    assert.match(r.headers['content-type'], /application\/json/);
    const spec = JSON.parse(r.body.toString('utf8'));
    assert.equal(spec.openapi, '3.0.3');
    assert.equal(spec.info.version, '1.8.0');
    assert.ok(Object.keys(spec.paths).length > 80);
  });

  it('every operation in the served spec has a string summary', async () => {
    const r = await get(server, '/openapi.json');
    const spec = JSON.parse(r.body.toString('utf8'));
    for (const [p, ops] of Object.entries(spec.paths)) {
      for (const [method, op] of Object.entries(ops)) {
        assert.equal(typeof op.summary, 'string', `${method} ${p} summary not string`);
        assert.ok(op.summary.length > 0, `${method} ${p} summary empty`);
      }
    }
  });
});

describe('daemon /api-docs route', () => {
  let server;
  before(async () => { server = await startServer(); });
  after(() => server && server.close());

  it('returns 200 + text/html with Swagger UI bootstrap markup', async () => {
    const r = await get(server, '/api-docs');
    assert.equal(r.status, 200);
    assert.match(r.headers['content-type'], /text\/html/);
    const html = r.body.toString('utf8');
    assert.match(html, /Swagger UI/);
    assert.match(html, /swagger-ui-bundle\.js/);
  });

  it('returns 200 + text/css for the swagger-ui.css static asset', async () => {
    const r = await get(server, '/api-docs/swagger-ui.css');
    assert.equal(r.status, 200);
    assert.match(r.headers['content-type'], /text\/css/);
    assert.ok(r.body.length > 1000, 'CSS body too small');
  });

  it('returns 200 + application/javascript for the bundle', async () => {
    const r = await get(server, '/api-docs/swagger-ui-bundle.js');
    assert.equal(r.status, 200);
    assert.match(r.headers['content-type'], /javascript/);
    assert.ok(r.body.length > 100000, 'JS bundle too small');
  });

  it('rejects path-traversal attempts with 404', async () => {
    const r = await get(server, '/api-docs/..%2Fpackage.json');
    // The daemon decodes %2F before slicing — either way a non-allowlisted
    // filename returns 404.
    assert.equal(r.status, 404);
  });

  it('rejects unknown filenames with 404', async () => {
    const r = await get(server, '/api-docs/random.png');
    assert.equal(r.status, 404);
  });
});
