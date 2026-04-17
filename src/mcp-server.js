'use strict';

// MCP transport layer for C4.
//
// Two transports are wired up here:
//   - stdio: the transport Claude Desktop uses. We read newline-delimited
//     JSON-RPC messages from stdin, proxy each to the running daemon's
//     POST /mcp endpoint, and write the responses back to stdout. Pure
//     notifications (no id) produce no response per JSON-RPC 2.0.
//   - inline: expose McpHandler directly (e.g. for tests or the daemon's
//     in-process POST /mcp handler) without any transport I/O.
//
// SSE / streamable-http is layered on top of the daemon's existing HTTP
// server in src/daemon.js; no code lives in this module for that case
// because Node's http.Server already owns the socket.
//
// The stdio transport intentionally proxies to the daemon over HTTP
// instead of constructing its own PtyManager. That avoids two competing
// worker registries on one host and keeps `c4 mcp start` cheap: it is
// purely a bridge process that exits when the daemon exits.

const http = require('http');
const readline = require('readline');
const McpHandler = require('./mcp-handler');

const DEFAULT_BASE = process.env.C4_URL || 'http://127.0.0.1:3456';

function postJson(base, pathname, body, { timeout = 30000, token } = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(pathname, base);
    const payload = Buffer.from(JSON.stringify(body || {}), 'utf8');
    const headers = {
      'Content-Type': 'application/json',
      'Content-Length': String(payload.length),
    };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    const req = http.request({
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      method: 'POST',
      headers,
      timeout,
    }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8');
        try { resolve({ status: res.statusCode, body: JSON.parse(text) }); }
        catch { resolve({ status: res.statusCode, body: { raw: text } }); }
      });
    });
    req.on('timeout', () => { req.destroy(new Error('request timeout')); });
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

// Read the user's saved JWT (matches the c4 CLI behavior so `c4 mcp start`
// works even when config.auth.enabled is true).
function readToken() {
  if (process.env.C4_TOKEN) return process.env.C4_TOKEN.trim();
  try {
    const fs = require('fs');
    const os = require('os');
    const path = require('path');
    return (fs.readFileSync(path.join(os.homedir(), '.c4-token'), 'utf8') || '').trim() || null;
  } catch {
    return null;
  }
}

function isNotification(request) {
  return request && typeof request === 'object' && !('id' in request);
}

// Entry point for `c4 mcp start` — proxies stdio to the daemon.
async function startStdio({ base = DEFAULT_BASE, stdin = process.stdin, stdout = process.stdout, stderr = process.stderr, exit = process.exit } = {}) {
  const rl = readline.createInterface({ input: stdin, crlfDelay: Infinity });
  const token = readToken();

  stderr.write(`[c4-mcp] stdio transport connected to ${base}\n`);

  const send = (obj) => {
    try { stdout.write(JSON.stringify(obj) + '\n'); }
    catch (err) { stderr.write(`[c4-mcp] write error: ${err.message}\n`); }
  };

  const closeSoon = () => {
    // Ensure buffered output flushes before the process ends so Claude
    // Desktop receives any trailing responses.
    try { stdout.end && stdout.end(); } catch {}
    setImmediate(() => exit(0));
  };

  rl.on('line', async (line) => {
    const trimmed = line.trim();
    if (!trimmed) return;
    let request;
    try { request = JSON.parse(trimmed); }
    catch (err) {
      send({ jsonrpc: '2.0', id: null, error: { code: -32700, message: `Parse error: ${err.message}` } });
      return;
    }
    try {
      const { status, body } = await postJson(base, '/mcp', request, { token });
      if (status && status >= 400) {
        const errId = request && 'id' in request ? request.id : null;
        send({ jsonrpc: '2.0', id: errId, error: { code: -32603, message: `daemon returned HTTP ${status}`, data: body } });
        return;
      }
      if (!isNotification(request)) send(body);
    } catch (err) {
      const errId = request && 'id' in request ? request.id : null;
      send({ jsonrpc: '2.0', id: errId, error: { code: -32603, message: `daemon unreachable: ${err.message}` } });
    }
  });

  rl.on('close', () => {
    stderr.write('[c4-mcp] stdin closed, exiting\n');
    closeSoon();
  });

  process.on('SIGTERM', closeSoon);
  process.on('SIGINT', closeSoon);
}

// Thin inline wrapper: wraps a PtyManager into an McpHandler without any
// transport concerns. Useful for tests and for the daemon's existing
// POST /mcp route.
function createInlineServer(manager, options) {
  return new McpHandler(manager, options || {});
}

module.exports = {
  startStdio,
  createInlineServer,
  postJson,
  readToken,
  DEFAULT_BASE,
  isNotification,
};
