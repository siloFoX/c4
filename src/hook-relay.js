#!/usr/bin/env node
// hook-relay.js -- Relay Claude Code hook JSON (stdin) to the C4 daemon.
// 7.23: replaces curl/PowerShell to avoid Windows encoding issues and
//       non-zero exit codes that cause Claude Code to report "Failed with
//       non-blocking status code" repeatedly.
// 7.24: Claude Code's hook payload uses `hook_event_name` and has no
//       `worker` field -- the c4 daemon reads `hook_type` and `worker`.
//       Inject `worker` from argv[3] and alias `hook_event_name` ->
//       `hook_type` here so daemon code stays unchanged on the receiving
//       side. Without this every PreToolUse/PostToolUse event was rejected
//       with "missing worker name" and auto-approve/scope/escalation hooks
//       never fired.
//
// Usage: node hook-relay.js <url> [workerName]
// Claude Code pipes hook JSON to stdin.
// Always exits 0 regardless of network errors.

'use strict';

const http = require('http');

const url = process.argv[2];
const workerName = process.argv[3] || '';
if (!url) process.exit(0);

let body = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => { body += chunk; });
process.stdin.on('end', () => {
  try {
    let payload = body;
    try {
      const obj = JSON.parse(body);
      if (workerName && !obj.worker) obj.worker = workerName;
      if (obj.hook_event_name && !obj.hook_type) {
        obj.hook_type = obj.hook_event_name;
      }
      payload = JSON.stringify(obj);
    } catch {
      // Non-JSON body -- forward raw
    }

    const parsedUrl = new URL(url);
    const options = {
      hostname: parsedUrl.hostname,
      port: parsedUrl.port,
      path: parsedUrl.pathname,
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      timeout: 3000,
    };
    const req = http.request(options);
    req.on('error', () => {}); // swallow
    req.on('timeout', () => { req.destroy(); });
    req.write(payload);
    req.end();
    // Don't wait for response -- fire and forget
    setTimeout(() => process.exit(0), 100);
  } catch {
    process.exit(0);
  }
});
process.stdin.on('error', () => process.exit(0));
// If stdin is empty/closed quickly
setTimeout(() => process.exit(0), 5000);
