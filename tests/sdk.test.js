// 9.3: SDK URL construction + request shape tests.
// Spawns a tiny mock HTTP server, points the SDK at it, and asserts the
// requests look correct (method/path/body/query). No PTY or daemon required.

'use strict';

const { describe, it, before, after } = require('node:test');
const assert = require('assert');
const http = require('http');

const { create } = require('../src/sdk');

function startMockServer(handler) {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      let body = '';
      req.on('data', (c) => { body += c; });
      req.on('end', () => handler(req, body, res));
    });
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      resolve({ server, host: '127.0.0.1', port: addr.port });
    });
  });
}

describe('C4 SDK', () => {
  let server;
  let client;
  let lastRequest;

  before(async () => {
    const setup = await startMockServer((req, body, res) => {
      lastRequest = {
        method: req.method,
        url: req.url,
        body: body ? JSON.parse(body) : null,
      };
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, echo: lastRequest }));
    });
    server = setup.server;
    client = create({ host: setup.host, port: setup.port });
  });

  after(() => {
    server.close();
  });

  it('create posts /create with worker spec', async () => {
    await client.create('w1', 'claude', { target: 'dgx', cwd: '/tmp/proj' });
    assert.strictEqual(lastRequest.method, 'POST');
    assert.strictEqual(lastRequest.url, '/create');
    assert.deepStrictEqual(lastRequest.body, {
      name: 'w1',
      command: 'claude',
      args: [],
      target: 'dgx',
      cwd: '/tmp/proj',
    });
  });

  it('task posts /task with options merged in', async () => {
    await client.task('w1', 'do the thing', { branch: 'c4/foo', autoMode: true });
    assert.strictEqual(lastRequest.method, 'POST');
    assert.strictEqual(lastRequest.url, '/task');
    assert.deepStrictEqual(lastRequest.body, {
      name: 'w1',
      task: 'do the thing',
      branch: 'c4/foo',
      autoMode: true,
    });
  });

  it('key uses POST /key with key field', async () => {
    await client.key('w1', 'Enter');
    assert.strictEqual(lastRequest.url, '/key');
    assert.deepStrictEqual(lastRequest.body, { name: 'w1', key: 'Enter' });
  });

  it('approve passes optionNumber', async () => {
    await client.approve('w1', 2);
    assert.strictEqual(lastRequest.url, '/approve');
    assert.deepStrictEqual(lastRequest.body, { name: 'w1', optionNumber: 2 });
  });

  it('suspend / resume / rollback / close hit their respective routes', async () => {
    await client.suspend('w1');
    assert.strictEqual(lastRequest.url, '/suspend');
    await client.resume('w1');
    assert.strictEqual(lastRequest.url, '/resume');
    await client.rollback('w1');
    assert.strictEqual(lastRequest.url, '/rollback');
    await client.close('w1');
    assert.strictEqual(lastRequest.url, '/close');
  });

  it('wait builds query with timeout + interruptOnIntervention', async () => {
    await client.wait('w1', { timeoutMs: 30000, interruptOnIntervention: true });
    assert.strictEqual(lastRequest.method, 'GET');
    assert.match(lastRequest.url, /^\/wait-read\?/);
    assert.match(lastRequest.url, /name=w1/);
    assert.match(lastRequest.url, /timeout=30000/);
    assert.match(lastRequest.url, /interruptOnIntervention=1/);
  });

  it('waitMulti includes mode + comma-joined names', async () => {
    await client.waitMulti(['w1', 'w2'], { mode: 'all' });
    assert.match(lastRequest.url, /^\/wait-read-multi\?/);
    assert.match(lastRequest.url, /names=w1%2Cw2/);
    assert.match(lastRequest.url, /mode=all/);
  });

  it('readNow / scrollback / list / history fetch GET routes', async () => {
    await client.readNow('w1');
    assert.match(lastRequest.url, /^\/read-now\?name=w1/);
    await client.scrollback('w1', 50);
    assert.match(lastRequest.url, /lines=50/);
    await client.list();
    assert.strictEqual(lastRequest.url, '/list');
    await client.history({ worker: 'w1', limit: 10 });
    assert.match(lastRequest.url, /worker=w1/);
    assert.match(lastRequest.url, /limit=10/);
  });

  it('scribe routes hit /scribe/*', async () => {
    await client.scribeStart();
    assert.strictEqual(lastRequest.url, '/scribe/start');
    await client.scribeStatus();
    assert.strictEqual(lastRequest.url, '/scribe/status');
    await client.scribeContext();
    assert.strictEqual(lastRequest.url, '/scribe/context');
  });

  it('returns parsed JSON on 2xx', async () => {
    const r = await client.list();
    assert.strictEqual(r.ok, true);
  });

  it('surfaces error field on non-2xx responses', async () => {
    server.close();
    const setup = await startMockServer((req, _body, res) => {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Not found' }));
    });
    server = setup.server;
    client = create({ host: setup.host, port: setup.port });
    const r = await client.list();
    assert.strictEqual(r.error, 'Not found');
    assert.strictEqual(r._httpStatus, 404);
  });
});
