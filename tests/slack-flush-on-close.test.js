// Worker close Slack flush tests (5.4)
'use strict';

const { describe, it, beforeEach } = require('node:test');
const assert = require('assert');
const Notifications = require('../src/notifications');

describe('Worker close forces _flushAll (5.4)', () => {
  let n;
  const slackCfg = { enabled: true, webhookUrl: 'http://example.com/hook', alertOnly: true };

  beforeEach(() => {
    n = new Notifications({ language: 'en', slack: slackCfg });
  });

  it('_flushAll clears buffer after notifyTaskComplete', async () => {
    await n.notifyTaskComplete('w1', { branch: 'c4/w1' });
    assert.strictEqual(n.channels.slack._buffer.length, 1);

    await n._flushAll();
    assert.strictEqual(n.channels.slack._buffer.length, 0);
  });

  it('_flushAll works when buffer is empty', async () => {
    const results = await n._flushAll();
    assert.ok('slack' in results);
    assert.strictEqual(n.channels.slack._buffer.length, 0);
  });

  it('_flushAll flushes all channels', async () => {
    const multi = new Notifications({
      language: 'en',
      slack: slackCfg,
      discord: { enabled: true, webhookUrl: 'http://example.com/discord' }
    });
    await multi.notifyTaskComplete('w1', { branch: 'c4/w1' });
    assert.strictEqual(multi.channels.slack._buffer.length, 1);
    assert.strictEqual(multi.channels.discord._buffer.length, 1);

    await multi._flushAll();
    assert.strictEqual(multi.channels.slack._buffer.length, 0);
    assert.strictEqual(multi.channels.discord._buffer.length, 0);
  });

  it('alertOnly buffers notifyTaskComplete but _flushAll sends it', async () => {
    await n.notifyTaskComplete('w2', { exitCode: 0, task: 'build feature' });
    assert.strictEqual(n._slackBuffer.length, 1);
    assert.strictEqual(n.channels.slack._buffer.length, 1);

    const results = await n._flushAll();
    assert.strictEqual(n.channels.slack._buffer.length, 0);
    assert.ok(results.slack);
  });

  it('sequential notifyTaskComplete + _flushAll leaves no residual buffer', async () => {
    await n.notifyTaskComplete('w3', { exitCode: 0 });
    await n._flushAll();
    assert.strictEqual(n.channels.slack._buffer.length, 0);
    assert.strictEqual(n._slackBuffer.length, 0);
  });
});
