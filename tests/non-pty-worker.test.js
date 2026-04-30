// 11.2 non-PTY worker tests. We register a fake adapter that declares
// mode='computer-use' and verify create() takes the non-PTY branch.

'use strict';

const { describe, it, before, after } = require('node:test');
const assert = require('assert');

const adapters = require('../src/adapters');

class FakeNonPtyAdapter extends adapters.AgentAdapter {
  constructor() {
    super({ name: 'fake-cu', patterns: {} });
    this.mode = 'computer-use';
    this.model = 'fake-model';
  }
}

describe('non-PTY worker (11.2)', () => {
  before(() => {
    adapters.register('fake-cu', FakeNonPtyAdapter);
  });

  // We must instantiate PtyManager carefully — its constructor side-effects
  // (state load, scribe lazy init, etc.) are fine; the only PTY interaction
  // is in the spawn paths which we deliberately avoid via mode='computer-use'.
  it('create() takes the non-PTY branch when adapter mode != pty', () => {
    const PtyManager = require('../src/pty-manager');
    const mgr = new PtyManager();
    const r = mgr.create('cu1', undefined, [], { adapter: 'fake-cu', target: 'local' });
    assert.strictEqual(r.status, 'running');
    assert.strictEqual(r.mode, 'computer-use');
    assert.strictEqual(r.pid, null);
    const w = mgr.workers.get('cu1');
    assert.strictEqual(w._nonPty, true);
    assert.strictEqual(w.alive, true);
    // close should mark alive=false without throwing on missing proc
    const c = mgr.close('cu1');
    assert.ok(c.success === undefined ? !c.error : c.success);
    assert.strictEqual(w.alive, false);
  });

  after(() => {
    // Restore default registry by re-registering the original adapter
    adapters.register('fake-cu', class extends adapters.AgentAdapter {});
  });
});
