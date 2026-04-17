// c4 init web-external helpers (8.10).
//
// Covers the vite.config.ts patch, config.json bindHost write, and the LAN
// IP detection used by `c4 init`'s external-access prompt.

'use strict';

const assert = require('assert');
const { describe, it } = require('node:test');
const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  detectLanIP,
  enableViteExternal,
  setDaemonBindHost,
} = require('../src/web-external');

function mkTmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'c4-web-ext-'));
}

function rmDir(dir) {
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch {}
}

const VITE_BASE = [
  "import { defineConfig } from 'vite';",
  "import react from '@vitejs/plugin-react';",
  '',
  'export default defineConfig({',
  '  plugins: [react()],',
  '  server: {',
  '    proxy: {',
  "      '/api': {",
  "        target: 'http://localhost:3456',",
  '        changeOrigin: true,',
  '      },',
  '    },',
  '  },',
  '});',
  '',
].join('\n');

describe('enableViteExternal', () => {
  it('injects host 0.0.0.0 and port into server block', () => {
    const dir = mkTmpDir();
    try {
      const p = path.join(dir, 'vite.config.ts');
      fs.writeFileSync(p, VITE_BASE);
      const res = enableViteExternal(p);
      assert.strictEqual(res.result, 'updated');
      const out = fs.readFileSync(p, 'utf8');
      assert.ok(/host:\s*'0\.0\.0\.0'/.test(out), 'host should be injected');
      assert.ok(/port:\s*5173/.test(out), 'port 5173 should be injected');
      // Proxy block must be preserved
      assert.ok(/proxy:\s*\{/.test(out));
      assert.ok(out.includes("target: 'http://localhost:3456'"));
    } finally { rmDir(dir); }
  });

  it('is idempotent when host is already present', () => {
    const dir = mkTmpDir();
    try {
      const p = path.join(dir, 'vite.config.ts');
      fs.writeFileSync(p, VITE_BASE);
      const first = enableViteExternal(p);
      assert.strictEqual(first.result, 'updated');
      const afterFirst = fs.readFileSync(p, 'utf8');
      const second = enableViteExternal(p);
      assert.strictEqual(second.result, 'already-present');
      assert.strictEqual(fs.readFileSync(p, 'utf8'), afterFirst);
    } finally { rmDir(dir); }
  });

  it('treats host: true as already configured', () => {
    const dir = mkTmpDir();
    try {
      const p = path.join(dir, 'vite.config.ts');
      const content = VITE_BASE.replace('server: {', 'server: {\n    host: true,');
      fs.writeFileSync(p, content);
      const res = enableViteExternal(p);
      assert.strictEqual(res.result, 'already-present');
    } finally { rmDir(dir); }
  });

  it('returns error when vite config is missing', () => {
    const res = enableViteExternal('/nonexistent/vite.config.ts');
    assert.strictEqual(res.result, 'error');
    assert.ok(res.error);
  });

  it('returns error when server block is absent', () => {
    const dir = mkTmpDir();
    try {
      const p = path.join(dir, 'vite.config.ts');
      fs.writeFileSync(p, 'export default { plugins: [] };\n');
      const res = enableViteExternal(p);
      assert.strictEqual(res.result, 'error');
      assert.ok(/server block/.test(res.error));
    } finally { rmDir(dir); }
  });
});

describe('setDaemonBindHost', () => {
  it('sets daemon.bindHost and preserves other fields', () => {
    const dir = mkTmpDir();
    try {
      const p = path.join(dir, 'config.json');
      fs.writeFileSync(p, JSON.stringify({
        daemon: { port: 3456, host: '127.0.0.1' },
        other: { keep: true },
      }, null, 2));
      const res = setDaemonBindHost(p, '0.0.0.0');
      assert.strictEqual(res.result, 'updated');
      const cfg = JSON.parse(fs.readFileSync(p, 'utf8'));
      assert.strictEqual(cfg.daemon.bindHost, '0.0.0.0');
      assert.strictEqual(cfg.daemon.port, 3456);
      assert.strictEqual(cfg.daemon.host, '127.0.0.1');
      assert.deepStrictEqual(cfg.other, { keep: true });
    } finally { rmDir(dir); }
  });

  it('creates daemon object when absent', () => {
    const dir = mkTmpDir();
    try {
      const p = path.join(dir, 'config.json');
      fs.writeFileSync(p, '{}');
      const res = setDaemonBindHost(p, '192.168.10.15');
      assert.strictEqual(res.result, 'updated');
      const cfg = JSON.parse(fs.readFileSync(p, 'utf8'));
      assert.strictEqual(cfg.daemon.bindHost, '192.168.10.15');
    } finally { rmDir(dir); }
  });

  it('is idempotent when bindHost already matches', () => {
    const dir = mkTmpDir();
    try {
      const p = path.join(dir, 'config.json');
      fs.writeFileSync(p, JSON.stringify({ daemon: { bindHost: '0.0.0.0' } }, null, 2));
      const before = fs.readFileSync(p, 'utf8');
      const res = setDaemonBindHost(p, '0.0.0.0');
      assert.strictEqual(res.result, 'already-present');
      assert.strictEqual(fs.readFileSync(p, 'utf8'), before);
    } finally { rmDir(dir); }
  });

  it('returns error for invalid JSON', () => {
    const dir = mkTmpDir();
    try {
      const p = path.join(dir, 'config.json');
      fs.writeFileSync(p, '{not json');
      const res = setDaemonBindHost(p, '0.0.0.0');
      assert.strictEqual(res.result, 'error');
      assert.ok(/invalid JSON/.test(res.error));
    } finally { rmDir(dir); }
  });
});

describe('detectLanIP', () => {
  it('returns first non-internal IPv4 from network interfaces', () => {
    const ifaces = {
      lo: [{ address: '127.0.0.1', family: 'IPv4', internal: true }],
      eth0: [
        { address: 'fe80::1', family: 'IPv6', internal: false },
        { address: '192.168.10.40', family: 'IPv4', internal: false },
      ],
    };
    assert.strictEqual(detectLanIP(ifaces), '192.168.10.40');
  });

  it('returns empty string when only loopback exists', () => {
    const ifaces = {
      lo: [{ address: '127.0.0.1', family: 'IPv4', internal: true }],
    };
    assert.strictEqual(detectLanIP(ifaces), '');
  });

  it('accepts numeric family (Node 18+ runtime variation)', () => {
    const ifaces = {
      eth0: [{ address: '10.0.0.5', family: 4, internal: false }],
    };
    assert.strictEqual(detectLanIP(ifaces), '10.0.0.5');
  });

  it('does not throw on empty or malformed interface map', () => {
    assert.strictEqual(detectLanIP({}), '');
    assert.strictEqual(detectLanIP({ eth0: [] }), '');
    assert.strictEqual(detectLanIP({ eth0: [null] }), '');
  });
});

describe('cli.js wires web-external into init', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'cli.js'), 'utf8');

  it('cli.js requires ./web-external inside init handler', () => {
    assert.ok(
      /require\(['"]\.\/web-external['"]\)/.test(src),
      'cli.js should require ./web-external'
    );
  });

  it('cli.js prompts for external access', () => {
    assert.ok(
      /external \(LAN\) access\?/i.test(src),
      'cli.js should prompt for external access'
    );
  });

  it('cli.js supports --yes-external and --no-external flags', () => {
    assert.ok(/--yes-external/.test(src));
    assert.ok(/--no-external/.test(src));
  });
});
