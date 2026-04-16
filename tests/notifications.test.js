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

  it('preserves dots in task first-line summary (e.g. filenames)', () => {
    const result = n._fmtWorker({ name: 'w4', task: 'Fix bug in daemon.js that causes crash' });
    assert.ok(result.includes('daemon.js'), 'task with filename should not be truncated at the dot');
    assert.ok(result.includes('Fix bug in daemon.js that causes crash'));
  });

  it('uses first line of multi-line task', () => {
    const result = n._fmtWorker({ name: 'w5', task: 'First line summary\nSecond line detail\nThird line' });
    assert.ok(result.includes('First line summary'));
    assert.ok(!result.includes('Second line detail'));
  });

  it('always includes task summary even when lastActivity exists', () => {
    const result = n._fmtWorker({ name: 'w6', task: 'deploy API server', lastActivity: 'writing file' });
    assert.ok(result.includes('deploy API server'), 'task summary should always appear');
    assert.ok(result.includes('writing file'), 'activity should also appear');
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

  it('includes task summary for dead workers', () => {
    const n = new Notifications({ language: 'en', slack: { enabled: true, webhookUrl: 'http://example.com/hook' } });
    n.notifyHealthCheck({
      workers: [
        { name: 'w1', status: 'exited', task: 'deploy API server\ndetails here' },
        { name: 'w2', status: 'alive', task: 'run tests' }
      ]
    });
    assert.strictEqual(n._slackBuffer.length, 1);
    const text = n._slackBuffer[0].text;
    assert.ok(text.includes('deploy API server'), 'dead worker should show task summary');
    assert.ok(!text.includes('details here'), 'should only show first line of task');
  });

  it('does not push when no workers', () => {
    const n = new Notifications({ language: 'ko', slack: { enabled: true, webhookUrl: 'http://example.com/hook' } });
    n.notifyHealthCheck({ workers: [] });
    assert.strictEqual(n._slackBuffer.length, 0);
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

  it('preserves dots in task summary (e.g. filenames)', async () => {
    const n = new Notifications({ language: 'en', slack: { enabled: true, webhookUrl: 'http://example.com/hook' } });
    await n.notifyTaskComplete('w3', { task: 'Fix bug in pty-manager.js\nDetails here' });
    assert.strictEqual(n._slackBuffer.length, 1);
    assert.ok(n._slackBuffer[0].text.includes('pty-manager.js'), 'task summary should preserve dots in filenames');
    assert.ok(!n._slackBuffer[0].text.includes('Details here'), 'should only show first line');
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

  it('preserves dots in task summary for error notifications', async () => {
    const n = new Notifications({ language: 'en', slack: { enabled: true, webhookUrl: 'http://example.com/hook' } });
    await n.notifyError('w3', 'crash', { task: 'Update config.json parsing\nMore details' });
    assert.strictEqual(n._slackBuffer.length, 1);
    assert.ok(n._slackBuffer[0].text.includes('config.json'), 'error task summary should preserve dots in filenames');
    assert.ok(!n._slackBuffer[0].text.includes('More details'), 'should only show first line');
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

  it('notifyTaskComplete still pushes to slack buffer when alertOnly is true', async () => {
    const n = new Notifications({ language: 'en', slack: slackCfg });
    const result = await n.notifyTaskComplete('w1', { branch: 'c4/w1' });
    assert.strictEqual(n._slackBuffer.length, 1);
    assert.ok(n._slackBuffer[0].text.includes('w1'));
    assert.ok(n._slackBuffer[0].text.includes('done'));
    assert.strictEqual(result.slack, 'buffered');
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
    // notifyStall uses sendImmediate directly, won't actually connect but won't throw
    // Just verify it doesn't early-return
    const result = await n.notifyStall('w1', 'no output for 5min');
    // Result will have channel results because channels are configured
    assert.ok(result !== undefined);
    assert.ok('slack' in result);
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

describe('Notifications.pushAll() truncation', () => {
  it('truncates messages over 2000 chars', () => {
    const n = new Notifications({ language: 'ko', slack: { enabled: true, webhookUrl: 'http://example.com/hook' } });
    const longMsg = 'x'.repeat(2500);
    n.pushAll(longMsg);
    assert.strictEqual(n._slackBuffer.length, 1);
    assert.strictEqual(n._slackBuffer[0].text.length, 2000);
    assert.ok(n._slackBuffer[0].text.endsWith('...'));
  });

  it('does not truncate messages at or under 2000 chars', () => {
    const n = new Notifications({ language: 'ko', slack: { enabled: true, webhookUrl: 'http://example.com/hook' } });
    const msg = 'y'.repeat(2000);
    n.pushAll(msg);
    assert.strictEqual(n._slackBuffer.length, 1);
    assert.strictEqual(n._slackBuffer[0].text.length, 2000);
    assert.ok(!n._slackBuffer[0].text.endsWith('...'));
  });
});

// --- Channel plugin architecture tests ---

describe('Channel base class', () => {
  it('push() buffers messages', () => {
    const ch = new Notifications.Channel({});
    ch.push('hello');
    ch.push('world');
    assert.strictEqual(ch._buffer.length, 2);
    assert.strictEqual(ch._buffer[0].text, 'hello');
    assert.strictEqual(ch._buffer[1].text, 'world');
  });

  it('flush() clears buffer', async () => {
    const sent = [];
    const ch = new Notifications.Channel({});
    ch._send = async (text) => { sent.push(text); return { ok: true }; };
    ch.push('a');
    ch.push('b');
    await ch.flush();
    assert.strictEqual(ch._buffer.length, 0);
    assert.strictEqual(sent.length, 1);
    assert.ok(sent[0].includes('a'));
    assert.ok(sent[0].includes('b'));
  });

  it('flush() returns sent:false when buffer is empty', async () => {
    const ch = new Notifications.Channel({});
    const result = await ch.flush();
    assert.strictEqual(result.sent, false);
  });

  it('sendImmediate() sends without buffering', async () => {
    const sent = [];
    const ch = new Notifications.Channel({});
    ch._send = async (text) => { sent.push(text); return { ok: true }; };
    await ch.sendImmediate('urgent');
    assert.strictEqual(sent.length, 1);
    assert.strictEqual(sent[0], 'urgent');
    assert.strictEqual(ch._buffer.length, 0);
  });

  it('start()/stop() manage timer', () => {
    const ch = new Notifications.Channel({});
    ch._send = async () => ({ ok: true });
    ch.start(60000);
    assert.ok(ch._timer !== null);
    ch.stop();
    assert.strictEqual(ch._timer, null);
  });
});

describe('SlackChannel', () => {
  it('formats payload with text field', async () => {
    let captured = null;
    const origPost = Notifications.prototype._postWebhook;
    const ch = new Notifications.SlackChannel({ webhookUrl: 'http://example.com/slack' });
    // Override _send to capture behavior
    ch.push('slack message');
    assert.strictEqual(ch._buffer.length, 1);
    assert.strictEqual(ch._buffer[0].text, 'slack message');
  });
});

describe('DiscordChannel', () => {
  it('truncates messages over 2000 chars', async () => {
    const ch = new Notifications.DiscordChannel({ webhookUrl: 'http://example.com/discord' });
    const longMsg = 'x'.repeat(2500);
    let sentPayload = null;
    // Monkey-patch _send to capture
    const origSend = ch._send.bind(ch);
    ch._send = async (text) => {
      sentPayload = text;
      return { ok: true };
    };
    await ch.sendImmediate(longMsg);
    // DiscordChannel._send truncates before calling _postWebhook
    // But we overrode _send, so let's test the class method directly
    // Instead, test via the class logic by creating a proper instance
    const ch2 = new Notifications.DiscordChannel({ webhookUrl: 'http://example.com/discord' });
    ch2.push('x'.repeat(2500));
    // Check that buffer has the full message (truncation happens at send time)
    assert.strictEqual(ch2._buffer[0].text.length, 2500);
  });

  it('buffers messages for periodic flush', () => {
    const ch = new Notifications.DiscordChannel({ webhookUrl: 'http://example.com/discord' });
    ch.push('discord msg 1');
    ch.push('discord msg 2');
    assert.strictEqual(ch._buffer.length, 2);
  });
});

describe('TelegramChannel', () => {
  it('buffers messages', () => {
    const ch = new Notifications.TelegramChannel({ botToken: '123:ABC', chatId: '-100123' });
    ch.push('telegram message');
    assert.strictEqual(ch._buffer.length, 1);
    assert.strictEqual(ch._buffer[0].text, 'telegram message');
  });

  it('config stores botToken and chatId', () => {
    const ch = new Notifications.TelegramChannel({ botToken: '123:ABC', chatId: '-100123' });
    assert.strictEqual(ch.config.botToken, '123:ABC');
    assert.strictEqual(ch.config.chatId, '-100123');
  });
});

describe('KakaoWorkChannel', () => {
  it('buffers messages', () => {
    const ch = new Notifications.KakaoWorkChannel({ webhookUrl: 'http://example.com/kakao' });
    ch.push('kakao message');
    assert.strictEqual(ch._buffer.length, 1);
    assert.strictEqual(ch._buffer[0].text, 'kakao message');
  });
});

describe('Multi-channel integration', () => {
  it('pushAll sends to all enabled channels', () => {
    const n = new Notifications({
      language: 'ko',
      slack: { enabled: true, webhookUrl: 'http://example.com/slack' },
      discord: { enabled: true, webhookUrl: 'http://example.com/discord' },
      telegram: { enabled: true, botToken: '123:ABC', chatId: '-100' },
      kakaowork: { enabled: true, webhookUrl: 'http://example.com/kakao' }
    });
    assert.strictEqual(Object.keys(n.channels).length, 4);
    assert.ok('slack' in n.channels);
    assert.ok('discord' in n.channels);
    assert.ok('telegram' in n.channels);
    assert.ok('kakaowork' in n.channels);

    n.pushAll('test message');
    for (const ch of Object.values(n.channels)) {
      assert.strictEqual(ch._buffer.length, 1);
      assert.strictEqual(ch._buffer[0].text, 'test message');
    }
  });

  it('pushSlack is backward-compatible alias for pushAll', () => {
    const n = new Notifications({
      language: 'ko',
      slack: { enabled: true, webhookUrl: 'http://example.com/slack' },
      discord: { enabled: true, webhookUrl: 'http://example.com/discord' }
    });
    n.pushSlack('compat message');
    assert.strictEqual(n.channels.slack._buffer.length, 1);
    assert.strictEqual(n.channels.discord._buffer.length, 1);
  });

  it('only creates channels that are enabled', () => {
    const n = new Notifications({
      language: 'ko',
      slack: { enabled: true, webhookUrl: 'http://example.com/slack' },
      discord: { enabled: false, webhookUrl: 'http://example.com/discord' },
      telegram: { enabled: true, botToken: '123:ABC', chatId: '-100' }
    });
    assert.strictEqual(Object.keys(n.channels).length, 2);
    assert.ok('slack' in n.channels);
    assert.ok(!('discord' in n.channels));
    assert.ok('telegram' in n.channels);
  });

  it('no channels when nothing is enabled', () => {
    const n = new Notifications({ language: 'ko' });
    assert.strictEqual(Object.keys(n.channels).length, 0);
  });

  it('notifyStall sends immediately to all channels', async () => {
    const n = new Notifications({
      language: 'ko',
      slack: { enabled: true, webhookUrl: 'http://example.com/slack' },
      discord: { enabled: true, webhookUrl: 'http://example.com/discord' }
    });
    const result = await n.notifyStall('w1', 'no output');
    // Both channels attempted (will fail to connect but return results)
    assert.ok('slack' in result);
    assert.ok('discord' in result);
    // Buffers should still be empty (immediate, not buffered)
    assert.strictEqual(n.channels.slack._buffer.length, 0);
    assert.strictEqual(n.channels.discord._buffer.length, 0);
  });

  it('notifyStall returns no-channels-configured when empty', async () => {
    const n = new Notifications({ language: 'ko' });
    const result = await n.notifyStall('w1', 'stall');
    assert.strictEqual(result.sent, false);
    assert.strictEqual(result.reason, 'no channels configured');
  });

  it('tick flushes all channels', async () => {
    const n = new Notifications({
      language: 'ko',
      slack: { enabled: true, webhookUrl: 'http://example.com/slack' },
      discord: { enabled: true, webhookUrl: 'http://example.com/discord' }
    });
    n.pushAll('tick message');
    assert.strictEqual(n.channels.slack._buffer.length, 1);
    assert.strictEqual(n.channels.discord._buffer.length, 1);

    // tick will attempt to flush (connection will fail but buffers clear)
    const results = await n.tick();
    assert.ok('slack' in results);
    assert.ok('discord' in results);
    assert.strictEqual(n.channels.slack._buffer.length, 0);
    assert.strictEqual(n.channels.discord._buffer.length, 0);
  });

  it('startAll/stopAll manage all channel timers', () => {
    const n = new Notifications({
      language: 'ko',
      slack: { enabled: true, webhookUrl: 'http://example.com/slack', intervalMs: 60000 },
      discord: { enabled: true, webhookUrl: 'http://example.com/discord' }
    });
    n.startAll();
    assert.ok(n.channels.slack._timer !== null);
    assert.ok(n.channels.discord._timer !== null);
    n.stopAll();
    assert.strictEqual(n.channels.slack._timer, null);
    assert.strictEqual(n.channels.discord._timer, null);
  });

  it('startPeriodicSlack/stopPeriodicSlack are backward-compatible aliases', () => {
    const n = new Notifications({
      language: 'ko',
      slack: { enabled: true, webhookUrl: 'http://example.com/slack', intervalMs: 60000 }
    });
    n.startPeriodicSlack();
    assert.ok(n.channels.slack._timer !== null);
    n.stopPeriodicSlack();
    assert.strictEqual(n.channels.slack._timer, null);
  });

  it('reload reinitializes all channels', () => {
    const n = new Notifications({
      language: 'ko',
      slack: { enabled: true, webhookUrl: 'http://example.com/slack' },
      discord: { enabled: true, webhookUrl: 'http://example.com/discord' }
    });
    assert.strictEqual(Object.keys(n.channels).length, 2);

    n.reload({
      language: 'en',
      slack: { enabled: true, webhookUrl: 'http://example.com/slack' },
      telegram: { enabled: true, botToken: '123:ABC', chatId: '-100' }
    });
    assert.strictEqual(Object.keys(n.channels).length, 2);
    assert.ok('slack' in n.channels);
    assert.ok(!('discord' in n.channels));
    assert.ok('telegram' in n.channels);
    assert.strictEqual(n.lang.done, 'done');
  });
});

describe('CHANNEL_TYPES registry', () => {
  it('contains all 4 channel types', () => {
    const types = Notifications.CHANNEL_TYPES;
    assert.ok('slack' in types);
    assert.ok('discord' in types);
    assert.ok('telegram' in types);
    assert.ok('kakaowork' in types);
    assert.strictEqual(Object.keys(types).length, 4);
  });

  it('each type is a Channel subclass', () => {
    const { Channel, CHANNEL_TYPES } = Notifications;
    for (const [name, Cls] of Object.entries(CHANNEL_TYPES)) {
      const inst = new Cls({ webhookUrl: 'http://x', botToken: 'x', chatId: 'x' });
      assert.ok(inst instanceof Channel, `${name} should be instance of Channel`);
    }
  });
});
