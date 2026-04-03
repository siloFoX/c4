// Notifications module unit tests
'use strict';

const { describe, it, beforeEach } = require('node:test');
const assert = require('assert');
const Notifications = require('../src/notifications');

describe('Notifications constructor', () => {
  it('uses Korean language by default', () => {
    const n = new Notifications({});
    assert.strictEqual(n.lang.done, '\uC644\uB8CC');
    assert.strictEqual(n.lang.error, '\uC624\uB958');
  });

  it('uses Korean language when language is "ko"', () => {
    const n = new Notifications({ language: 'ko' });
    assert.strictEqual(n.lang.done, '\uC644\uB8CC');
    assert.strictEqual(n.lang.idle, '\uB300\uAE30');
  });

  it('uses English language when language is "en"', () => {
    const n = new Notifications({ language: 'en' });
    assert.strictEqual(n.lang.done, 'done');
    assert.strictEqual(n.lang.error, 'ERROR');
    assert.strictEqual(n.lang.idle, 'idle');
  });

  it('initializes with empty slack buffer', () => {
    const n = new Notifications({});
    assert.deepStrictEqual(n._slackBuffer, []);
  });
});

describe('Notifications._time()', () => {
  it('returns a string', () => {
    const n = new Notifications({ language: 'ko' });
    const result = n._time();
    assert.strictEqual(typeof result, 'string');
    assert.ok(result.length > 0, '_time() should return a non-empty string');
  });

  it('returns a string for English locale', () => {
    const n = new Notifications({ language: 'en' });
    const result = n._time();
    assert.strictEqual(typeof result, 'string');
    assert.ok(result.length > 0);
  });
});

describe('Notifications._fmtWorker()', () => {
  let n;

  beforeEach(() => {
    n = new Notifications({ language: 'ko' });
  });

  it('formats idle worker (no task)', () => {
    const result = n._fmtWorker({ name: 'w1' });
    assert.ok(result.includes('w1'));
    assert.ok(result.includes('\uB300\uAE30'));
  });

  it('formats worker with task', () => {
    const result = n._fmtWorker({ name: 'w2', task: 'build feature' });
    assert.ok(result.includes('w2'));
    assert.ok(result.includes('build feature'));
  });

  it('includes elapsed time when taskStarted is set', () => {
    const started = new Date(Date.now() - 5 * 60000).toISOString();
    const result = n._fmtWorker({ name: 'w3', task: 'deploy', taskStarted: started });
    assert.ok(result.includes('w3'));
    assert.ok(result.includes('\uBD84'));
  });
});

describe('Notifications.notifyHealthCheck()', () => {
  it('pushes to slack buffer when dead workers exist', () => {
    const n = new Notifications({ language: 'ko', slack: { enabled: true, webhookUrl: 'http://example.com/hook' } });
    n.notifyHealthCheck({
      workers: [
        { name: 'w1', status: 'exited' },
        { name: 'w2', status: 'alive', task: 'test' }
      ]
    });
    assert.strictEqual(n._slackBuffer.length, 1);
    assert.ok(n._slackBuffer[0].text.includes('\uC911\uB2E8'));
  });

  it('pushes to slack buffer when all workers alive', () => {
    const n = new Notifications({ language: 'en', slack: { enabled: true, webhookUrl: 'http://example.com/hook' } });
    n.notifyHealthCheck({
      workers: [
        { name: 'w1', status: 'alive' }
      ]
    });
    assert.strictEqual(n._slackBuffer.length, 1);
  });

  it('pushes heartbeat when no workers', () => {
    const n = new Notifications({ language: 'ko', slack: { enabled: true, webhookUrl: 'http://example.com/hook' } });
    n.notifyHealthCheck({ workers: [] });
    assert.strictEqual(n._slackBuffer.length, 1);
    assert.ok(n._slackBuffer[0].text.includes('daemon OK'));
  });
});

describe('Notifications.statusUpdate()', () => {
  it('pushes message to slack buffer', () => {
    const n = new Notifications({ language: 'ko', slack: { enabled: true, webhookUrl: 'http://example.com/hook' } });
    n.statusUpdate('worker1', 'doing stuff');
    assert.strictEqual(n._slackBuffer.length, 1);
    assert.ok(n._slackBuffer[0].text.includes('worker1'));
    assert.ok(n._slackBuffer[0].text.includes('doing stuff'));
  });
});

describe('Notifications.notifyEdits()', () => {
  it('pushes edits summary to slack buffer', () => {
    const n = new Notifications({ language: 'ko', slack: { enabled: true, webhookUrl: 'http://example.com/hook' } });
    n.notifyEdits(2, [{ text: 'file1.js' }, { text: 'file2.js' }]);
    assert.strictEqual(n._slackBuffer.length, 1);
    assert.ok(n._slackBuffer[0].text.includes('file1.js'));
    assert.ok(n._slackBuffer[0].text.includes('file2.js'));
  });

  it('does not push when toolActions is empty', () => {
    const n = new Notifications({ language: 'ko', slack: { enabled: true, webhookUrl: 'http://example.com/hook' } });
    n.notifyEdits(0, []);
    assert.strictEqual(n._slackBuffer.length, 0);
  });
});

describe('Notifications.notifyTaskComplete()', () => {
  it('pushes to slack buffer', async () => {
    const n = new Notifications({ language: 'en', slack: { enabled: true, webhookUrl: 'http://example.com/hook' } });
    await n.notifyTaskComplete('w1', { branch: 'c4/w1' });
    assert.strictEqual(n._slackBuffer.length, 1);
    assert.ok(n._slackBuffer[0].text.includes('w1'));
    assert.ok(n._slackBuffer[0].text.includes('done'));
    assert.ok(n._slackBuffer[0].text.includes('c4/w1'));
  });

  it('works without branch details', async () => {
    const n = new Notifications({ language: 'ko', slack: { enabled: true, webhookUrl: 'http://example.com/hook' } });
    await n.notifyTaskComplete('w2');
    assert.strictEqual(n._slackBuffer.length, 1);
    assert.ok(n._slackBuffer[0].text.includes('w2'));
    assert.ok(n._slackBuffer[0].text.includes('\uC644\uB8CC'));
  });
});

describe('Notifications.notifyError()', () => {
  it('pushes error to slack buffer', async () => {
    const n = new Notifications({ language: 'en', slack: { enabled: true, webhookUrl: 'http://example.com/hook' } });
    await n.notifyError('w1', 'something broke');
    assert.strictEqual(n._slackBuffer.length, 1);
    assert.ok(n._slackBuffer[0].text.includes('w1'));
    assert.ok(n._slackBuffer[0].text.includes('ERROR'));
    assert.ok(n._slackBuffer[0].text.includes('something broke'));
  });

  it('handles non-string error', async () => {
    const n = new Notifications({ language: 'ko', slack: { enabled: true, webhookUrl: 'http://example.com/hook' } });
    await n.notifyError('w2', new Error('fail'));
    assert.strictEqual(n._slackBuffer.length, 1);
    assert.ok(n._slackBuffer[0].text.includes('w2'));
  });
});

describe('Notifications.reload()', () => {
  it('resets state with new config', () => {
    const n = new Notifications({ language: 'ko', slack: { enabled: true, webhookUrl: 'http://example.com/hook' } });
    n.pushSlack('old message');
    assert.strictEqual(n._slackBuffer.length, 1);

    n.reload({ language: 'en' });
    assert.strictEqual(n._slackBuffer.length, 0);
    assert.strictEqual(n.lang.done, 'done');
    assert.deepStrictEqual(n.slack, {});
  });

  it('resets to defaults when called with no args', () => {
    const n = new Notifications({ language: 'en', slack: { enabled: true, webhookUrl: 'http://x' } });
    n.pushSlack('msg');
    n.reload();
    assert.strictEqual(n._slackBuffer.length, 0);
    assert.strictEqual(n.lang.done, '\uC644\uB8CC');
  });
});

describe('Notifications alertOnly mode', () => {
  const slackCfg = { enabled: true, webhookUrl: 'http://example.com/hook', alertOnly: true };

  it('statusUpdate does not push to slack buffer when alertOnly is true', () => {
    const n = new Notifications({ language: 'ko', slack: slackCfg });
    n.statusUpdate('w1', 'doing stuff');
    assert.strictEqual(n._slackBuffer.length, 0);
  });

  it('notifyEdits does not push to slack buffer when alertOnly is true', () => {
    const n = new Notifications({ language: 'ko', slack: slackCfg });
    n.notifyEdits(2, [{ text: 'file1.js' }, { text: 'file2.js' }]);
    assert.strictEqual(n._slackBuffer.length, 0);
  });

  it('notifyTaskComplete does not push to slack buffer when alertOnly is true', async () => {
    const n = new Notifications({ language: 'en', slack: slackCfg });
    const result = await n.notifyTaskComplete('w1', { branch: 'c4/w1' });
    assert.strictEqual(n._slackBuffer.length, 0);
    assert.strictEqual(result.slack, 'skipped(alertOnly)');
  });

  it('notifyHealthCheck does not push to slack buffer when alertOnly is true', () => {
    const n = new Notifications({ language: 'ko', slack: slackCfg });
    n.notifyHealthCheck({
      workers: [
        { name: 'w1', status: 'alive', task: 'test' },
        { name: 'w2', status: 'exited' }
      ]
    });
    assert.strictEqual(n._slackBuffer.length, 0);
  });

  it('notifyError still pushes to slack buffer when alertOnly is true', async () => {
    const n = new Notifications({ language: 'en', slack: slackCfg });
    await n.notifyError('w1', 'something broke');
    assert.strictEqual(n._slackBuffer.length, 1);
    assert.ok(n._slackBuffer[0].text.includes('ERROR'));
  });

  it('notifyStall still sends when alertOnly is true', async () => {
    const n = new Notifications({ language: 'ko', slack: slackCfg });
    // notifyStall uses _postWebhook directly, won't actually connect but won't throw
    // Just verify it doesn't early-return
    const result = await n.notifyStall('w1', 'no output for 5min');
    // Result will have ok:false because it can't connect, but it tried (not skipped)
    assert.ok(result !== undefined);
    assert.ok('ok' in result || 'error' in result);
  });

  it('alertOnly false allows all notifications normally', () => {
    const n = new Notifications({ language: 'ko', slack: { enabled: true, webhookUrl: 'http://example.com/hook', alertOnly: false } });
    n.statusUpdate('w1', 'doing stuff');
    assert.strictEqual(n._slackBuffer.length, 1);
    n.notifyEdits(1, [{ text: 'file.js' }]);
    assert.strictEqual(n._slackBuffer.length, 2);
  });

  it('alertOnly undefined (default) allows all notifications', () => {
    const n = new Notifications({ language: 'ko', slack: { enabled: true, webhookUrl: 'http://example.com/hook' } });
    n.statusUpdate('w1', 'doing stuff');
    assert.strictEqual(n._slackBuffer.length, 1);
  });
});
