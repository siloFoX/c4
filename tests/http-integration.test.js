// HTTP integration tests. We don't run the full daemon, but we do mount
// the same handler factory against an ephemeral http.createServer so the
// SDK speaks to a real network endpoint. The manager surface is stubbed
// to keep the tests deterministic.

'use strict';

const { describe, it, before, after } = require('node:test');
const assert = require('assert');
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');

const { create: createSdk } = require('../src/sdk');
const PtyManager = require('../src/pty-manager');

let mgr;
let server;
let baseUrl;
let tmpLogsDir;

function startServer() {
  return new Promise((resolve) => {
    server = http.createServer((req, res) => {
      handle(req, res).catch((e) => {
        try { res.writeHead(500); res.end(JSON.stringify({ error: e.message })); } catch {}
      });
    });
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      baseUrl = `http://127.0.0.1:${addr.port}`;
      resolve();
    });
  });
}

function parseBody(req) {
  return new Promise((resolve) => {
    let body = '';
    req.on('data', (c) => { body += c; });
    req.on('end', () => {
      try { resolve(body ? JSON.parse(body) : {}); }
      catch { resolve({}); }
    });
  });
}

// Minimal subset of the daemon's routing — just enough to exercise the
// SDK end-to-end without dragging the full daemon module in.
async function handle(req, res) {
  const url = new URL(req.url, 'http://x');
  const route = url.pathname;
  const method = req.method;

  res.setHeader('Content-Type', 'application/json');

  let result;
  if (method === 'GET' && route === '/health') {
    result = { ok: true, workers: 0, version: '1.6.16' };
  } else if (method === 'GET' && route === '/projects') {
    result = mgr.listProjects();
  } else if (method === 'GET' && route === '/cost-report') {
    result = mgr.getCostReport({});
  } else if (method === 'GET' && route === '/audit') {
    result = mgr.getAudit({ limit: 100 });
  } else if (method === 'POST' && route === '/board/card') {
    const body = await parseBody(req);
    const { project, ...rest } = body;
    result = mgr._ensurePmBoard().createCard(project || 'default', rest);
  } else if (method === 'GET' && route === '/board') {
    result = mgr._ensurePmBoard().get(url.searchParams.get('project') || 'default');
  } else if (method === 'POST' && route === '/workflow/run') {
    const body = await parseBody(req);
    result = await mgr.runWorkflow(body);
  } else if (method === 'POST' && route === '/nl/run') {
    const body = await parseBody(req);
    result = await mgr.runNL(body.text || '', { execute: body.execute, minConfidence: body.minConfidence });
  } else {
    res.writeHead(404);
    res.end(JSON.stringify({ error: 'Not found' }));
    return;
  }

  // mimic daemon's audit + 400-on-error pattern
  if (typeof mgr.audit === 'function' && method !== 'GET') {
    mgr.audit({ actor: 'integration', action: route, ok: !result.error, error: result.error || null });
  }
  res.writeHead(result && result.error ? 400 : 200);
  res.end(JSON.stringify(result));
}

describe('HTTP integration (sdk → handler)', () => {
  before(async () => {
    tmpLogsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'c4-int-'));
    mgr = new PtyManager();
    mgr.logsDir = tmpLogsDir;
    await startServer();
  });

  after(() => {
    if (server) server.close();
    try { fs.rmSync(tmpLogsDir, { recursive: true, force: true }); } catch {}
  });

  it('health round-trips', async () => {
    const sdk = createSdk({ host: '127.0.0.1', port: Number(new URL(baseUrl).port) });
    const r = await sdk.health();
    assert.strictEqual(r.ok, true);
  });

  it('projects returns at least the unassigned bucket', async () => {
    const sdk = createSdk({ host: '127.0.0.1', port: Number(new URL(baseUrl).port) });
    const r = await sdk.projects();
    assert.ok(r.projects);
    assert.ok(r.projects.find((p) => p.name === 'unassigned'));
  });

  it('board create + get exercise SDK + handler', async () => {
    const sdk = createSdk({ host: '127.0.0.1', port: Number(new URL(baseUrl).port) });
    const created = await sdk.boardCreate('itest', { title: 'integration card' });
    assert.ok(created.success);
    const view = await sdk.board('itest');
    assert.ok(view.columns.backlog.find((c) => c.title === 'integration card'));
  });

  it('workflow round-trips with audit side-effect', async () => {
    const sdk = createSdk({ host: '127.0.0.1', port: Number(new URL(baseUrl).port) });
    const r = await sdk.runWorkflow({
      name: 'itest-flow',
      steps: [{ id: 'a', action: 'sleep', args: { ms: 5 } }],
    });
    assert.strictEqual(r.ok, true);
    const audit = await sdk.audit({ limit: 10 });
    assert.ok(audit.records && audit.records.some((rec) => rec.action === '/workflow/run'));
  });

  it('NL run end-to-end via handler', async () => {
    const sdk = createSdk({ host: '127.0.0.1', port: Number(new URL(baseUrl).port) });
    const r = await sdk.nlRun('list workers');
    assert.strictEqual(r.executed, true);
    assert.strictEqual(r.intent, 'list');
  });
});
