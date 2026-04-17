// Daemon bindHost resolution tests (8.10).
//
// Verifies src/web-external.js resolveBindHost — used by src/daemon.js to
// decide which interface to listen on. Default stays 127.0.0.1 for
// backward compatibility; bindHost takes precedence over the legacy host.

'use strict';

const assert = require('assert');
const { describe, it } = require('node:test');

const { resolveBindHost } = require('../src/web-external');

describe('resolveBindHost', () => {
  it('defaults to 127.0.0.1 when no config is supplied', () => {
    assert.strictEqual(resolveBindHost(), '127.0.0.1');
    assert.strictEqual(resolveBindHost(null), '127.0.0.1');
    assert.strictEqual(resolveBindHost({}), '127.0.0.1');
    assert.strictEqual(resolveBindHost({ daemon: {} }), '127.0.0.1');
  });

  it('returns bindHost when explicitly set', () => {
    assert.strictEqual(resolveBindHost({ daemon: { bindHost: '0.0.0.0' } }), '0.0.0.0');
    assert.strictEqual(resolveBindHost({ daemon: { bindHost: '192.168.10.15' } }), '192.168.10.15');
  });

  it('falls back to legacy host key when bindHost is absent', () => {
    assert.strictEqual(resolveBindHost({ daemon: { host: '127.0.0.1' } }), '127.0.0.1');
    assert.strictEqual(resolveBindHost({ daemon: { host: '10.0.0.1' } }), '10.0.0.1');
  });

  it('prefers bindHost over legacy host when both present', () => {
    const cfg = { daemon: { host: '127.0.0.1', bindHost: '0.0.0.0' } };
    assert.strictEqual(resolveBindHost(cfg), '0.0.0.0');
  });

  it('ignores empty-string bindHost and falls back', () => {
    const cfg = { daemon: { bindHost: '', host: '10.0.0.5' } };
    assert.strictEqual(resolveBindHost(cfg), '10.0.0.5');
  });

  it('ignores non-string bindHost types', () => {
    assert.strictEqual(resolveBindHost({ daemon: { bindHost: 0 } }), '127.0.0.1');
    assert.strictEqual(resolveBindHost({ daemon: { bindHost: null } }), '127.0.0.1');
  });
});

describe('daemon.js wires resolveBindHost', () => {
  const fs = require('fs');
  const path = require('path');
  const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'daemon.js'), 'utf8');

  it('daemon.js requires ./web-external', () => {
    assert.ok(
      /require\(['"]\.\/web-external['"]\)/.test(src),
      'daemon.js should require ./web-external'
    );
  });

  it('daemon.js invokes resolveBindHost(cfg) for HOST', () => {
    assert.ok(
      /resolveBindHost\s*\(\s*cfg\s*\)/.test(src),
      'daemon.js should call resolveBindHost(cfg)'
    );
  });
});
