// 9.8 file-transfer unit tests.
// We don't actually run rsync — instead we exercise validation paths
// (peer resolution, src/dst checks, mode/flags whitelist) which are pure
// and don't require spawning anything. The "spawn the real rsync" path is
// covered by an end-to-end smoke test the user can run manually.

'use strict';

const { describe, it } = require('node:test');
const assert = require('assert');
const PtyManager = require('../src/pty-manager');

function makeManager(peers = {}) {
  const mgr = Object.create(PtyManager.prototype);
  mgr.workers = new Map();
  mgr.config = { fleet: { peers } };
  return mgr;
}

describe('fileTransfer (9.8) validation', () => {
  it('requires src and dst', () => {
    const r = makeManager().fileTransfer({ from: 'local', to: 'local' });
    assert.ok(r.error && /src and dst/.test(r.error));
  });

  it('requires from or to', () => {
    const r = makeManager().fileTransfer({ src: '/a', dst: '/b' });
    assert.ok(r.error && /from and to/.test(r.error));
  });

  it('rejects unknown peer', () => {
    const r = makeManager().fileTransfer({
      from: 'local', to: 'ghost', src: '/a', dst: '/b'
    });
    assert.ok(r.error && /Unknown peer/.test(r.error));
  });

  it('requires sshHost on remote peer', () => {
    const r = makeManager({
      remote: { host: '127.0.0.1', port: 3456 }, // no sshHost
    }).fileTransfer({
      from: 'local', to: 'remote', src: '/a', dst: '/b'
    });
    assert.ok(r.error && /sshHost/.test(r.error));
  });

  it('rejects unsupported mode', () => {
    const r = makeManager({
      remote: { sshHost: 'user@x' },
    }).fileTransfer({
      from: 'local', to: 'remote', src: '/a', dst: '/b', mode: 'bittorrent'
    });
    assert.ok(r.error && /Unsupported transfer mode/.test(r.error));
  });

  it('rejects flags with shell metacharacters', () => {
    const r = makeManager({
      remote: { sshHost: 'user@x' },
    }).fileTransfer({
      from: 'local', to: 'remote', src: '/a', dst: '/b', flags: '-aP; rm /'
    });
    assert.ok(r.error && /flags contain unsupported/.test(r.error));
  });

  it('local→remote builds rsync command with sshHost prefix on dst', () => {
    // We can't actually spawn rsync here without it failing on the test
    // box, but we can check that the record we register has the right cmd.
    // Stub spawn to a no-op child.
    const mgr = makeManager({
      remote: { sshHost: 'user@host' },
    });
    const childMock = {
      stdout: { on: () => {} },
      stderr: { on: () => {} },
      on: () => {},
      pid: 9999,
    };
    require('child_process').spawn = () => childMock;
    const r = mgr.fileTransfer({ from: 'local', to: 'remote', src: '/tmp/a', dst: '/tmp/b' });
    assert.strictEqual(r.status, 'running');
    assert.match(r.cmd, /^rsync /);
    assert.match(r.cmd, / -aP /);
    assert.match(r.cmd, / \/tmp\/a user@host:\/tmp\/b$/);
  });

  it('remote→local builds rsync command with sshHost prefix on src', () => {
    const mgr = makeManager({
      remote: { sshHost: 'user@host' },
    });
    const childMock = {
      stdout: { on: () => {} },
      stderr: { on: () => {} },
      on: () => {},
      pid: 9999,
    };
    require('child_process').spawn = () => childMock;
    const r = mgr.fileTransfer({ from: 'remote', to: 'local', src: '/r/a', dst: '/l/b' });
    assert.match(r.cmd, / user@host:\/r\/a \/l\/b$/);
  });

  it('listTransfers returns recent records', () => {
    const mgr = makeManager({ remote: { sshHost: 'user@host' } });
    require('child_process').spawn = () => ({
      stdout: { on: () => {} }, stderr: { on: () => {} }, on: () => {}, pid: 1
    });
    mgr.fileTransfer({ from: 'local', to: 'remote', src: '/a', dst: '/b' });
    mgr.fileTransfer({ from: 'local', to: 'remote', src: '/c', dst: '/d' });
    const list = mgr.listTransfers({ limit: 10 });
    assert.strictEqual(list.transfers.length, 2);
  });

  it('getTransfer returns error for unknown id', () => {
    const mgr = makeManager();
    const r = mgr.getTransfer('nope');
    assert.ok(r.error && /Unknown transfer id/.test(r.error));
  });
});
