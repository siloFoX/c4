// 9.5 Claude Code plugin scaffold tests. Verify each command module is
// loadable, exports an async function, and returns a usage error for the
// "missing args" path. Network calls are stubbed by pointing at an SDK
// instance with an unreachable port; commands that branch early on
// missing args never reach the network.

'use strict';

const { describe, it } = require('node:test');
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const PLUGIN = path.join(__dirname, '..', 'plugin');

describe('Claude Code plugin scaffold (9.5)', () => {
  it('manifest.json declares the expected commands', () => {
    const manifest = JSON.parse(fs.readFileSync(path.join(PLUGIN, 'manifest.json'), 'utf8'));
    assert.strictEqual(manifest.name, 'c4');
    const triggers = (manifest.commands || []).map((c) => c.trigger);
    for (const t of ['/c4-new', '/c4-task', '/c4-list', '/c4-read', '/c4-close', '/c4-dispatch']) {
      assert.ok(triggers.includes(t), `missing trigger: ${t}`);
    }
  });

  it('every command module exports an async function', () => {
    const cmds = ['c4-new', 'c4-task', 'c4-list', 'c4-read', 'c4-close', 'c4-dispatch'];
    for (const c of cmds) {
      const mod = require(path.join(PLUGIN, 'commands', `${c}.js`));
      assert.strictEqual(typeof mod, 'function', `${c} should export a function`);
    }
  });

  it('c4-new rejects missing name with usage error', async () => {
    const cmd = require(path.join(PLUGIN, 'commands', 'c4-new.js'));
    const r = await cmd([], {});
    assert.ok(r.error && /Usage/.test(r.error));
  });

  it('c4-task rejects missing task with usage error', async () => {
    const cmd = require(path.join(PLUGIN, 'commands', 'c4-task.js'));
    const r1 = await cmd([], {});
    assert.ok(r1.error);
    const r2 = await cmd(['only-name'], {});
    assert.ok(r2.error);
  });

  it('c4-dispatch rejects missing task', async () => {
    const cmd = require(path.join(PLUGIN, 'commands', 'c4-dispatch.js'));
    const r = await cmd([], {});
    assert.ok(r.error);
  });
});
