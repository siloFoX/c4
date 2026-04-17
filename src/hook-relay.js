#!/usr/bin/env node
// hook-relay.js — Relay Claude Code hook JSON (stdin) to the C4 daemon.
// Replaces curl/PowerShell to avoid Windows encoding issues and non-zero
// exit codes that cause Claude Code to report "Failed with non-blocking
// status code" repeatedly (7.16, 7.23).
//
// Usage: node hook-relay.js http://127.0.0.1:3456/hook-event
// Claude Code pipes hook JSON to stdin.
// Always exits 0 regardless of network errors.

'use strict';

const http = require('http');

const url = process.argv[2];
if (!url) process.exit(0);

let body = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => { body += chunk; });
process.stdin.on('end', () => {
  try {
    const parsed = new URL(url);
    const options = {
      hostname: parsed.hostname,
      port: parsed.port,
      path: parsed.pathname,
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      timeout: 3000,
    };
    const req = http.request(options);
    req.on('error', () => {}); // swallow
    req.on('timeout', () => { req.destroy(); });
    req.write(body);
    req.end();
    // Don't wait for response — fire and forget
    setTimeout(() => process.exit(0), 100);
  } catch {
    process.exit(0);
  }
});
process.stdin.on('error', () => process.exit(0));
// If stdin is empty/closed quickly
setTimeout(() => process.exit(0), 5000);
