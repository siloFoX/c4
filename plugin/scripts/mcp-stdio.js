#!/usr/bin/env node
// c4 plugin MCP stdio shim. Reads JSON-RPC frames from stdin, forwards them
// to the c4 daemon's HTTP MCP endpoint, and writes the response to stdout.
//
// Claude Code launches us with stdio transport (default). We expect a c4
// daemon to be reachable on http://127.0.0.1:3456 (override via env
// C4_DAEMON_URL).
//
// Standalone — no `require('../../src/...')` so the plugin works as a
// git-subdir install without the rest of the repo.
'use strict';

const http = require('http');
const https = require('https');

const URL_BASE = process.env.C4_DAEMON_URL || 'http://127.0.0.1:3456';

function send(obj) {
  // MCP stdio uses LSP-style framing: Content-Length header + body.
  // Claude Code accepts both line-delimited JSON and LSP framing; we use
  // line-delimited (one JSON object per line) which is simpler and what
  // most JS-based servers ship.
  process.stdout.write(JSON.stringify(obj) + '\n');
}

function postMcp(payload, cb) {
  const url = new URL(URL_BASE + '/mcp');
  const lib = url.protocol === 'https:' ? https : http;
  const headers = { 'Content-Type': 'application/json' };
  // Forward bearer token if the daemon has RBAC enabled. Operators set
  // C4_DAEMON_TOKEN in the plugin env (.mcp.json `env` block) or via
  // shell environment when launching claude.
  if (process.env.C4_DAEMON_TOKEN) {
    headers.Authorization = `Bearer ${process.env.C4_DAEMON_TOKEN}`;
  }
  const opts = {
    hostname: url.hostname,
    port: url.port,
    path: url.pathname,
    method: 'POST',
    headers,
    timeout: 30000,
  };
  const req = lib.request(opts, (res) => {
    let buf = '';
    res.setEncoding('utf8');
    res.on('data', (c) => { buf += c; });
    res.on('end', () => {
      let parsed;
      try { parsed = JSON.parse(buf); }
      catch { parsed = { jsonrpc: '2.0', id: payload.id, error: { code: -32700, message: 'Invalid JSON from daemon' } }; }
      cb(parsed);
    });
  });
  req.on('timeout', () => { req.destroy(); cb({ jsonrpc: '2.0', id: payload.id, error: { code: -32001, message: 'daemon timeout' } }); });
  req.on('error', (e) => cb({ jsonrpc: '2.0', id: payload.id, error: { code: -32002, message: `daemon unreachable: ${e.message}` } }));
  req.write(JSON.stringify(payload));
  req.end();
}

let buffer = '';
let inFlight = 0;
let stdinClosed = false;

const tryExit = () => {
  if (stdinClosed && inFlight === 0) process.exit(0);
};

process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => {
  buffer += chunk;
  // Split on newlines; process complete JSON frames.
  let nl;
  while ((nl = buffer.indexOf('\n')) !== -1) {
    const line = buffer.slice(0, nl);
    buffer = buffer.slice(nl + 1);
    if (!line.trim()) continue;
    let req;
    try { req = JSON.parse(line); }
    catch {
      send({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } });
      continue;
    }
    inFlight++;
    postMcp(req, (resp) => {
      inFlight--;
      // Some methods are notifications (no `id`) — we still respond if the
      // daemon answered, otherwise drop silently.
      if (!(req.id == null && (resp == null || resp.id == null))) {
        send(resp);
      }
      tryExit();
    });
  }
});

process.stdin.on('end', () => { stdinClosed = true; tryExit(); });
process.on('SIGTERM', () => process.exit(0));
