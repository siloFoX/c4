// 10.7 scheduler unit tests.
// Cron parsing + state machine; we drive _tick() and assertions on the
// fire path through a stub manager.

'use strict';

const { describe, it } = require('node:test');
const assert = require('assert');

const Scheduler = require('../src/scheduler');

function makeStubManager() {
  return {
    config: {},
    sendTaskCalls: [],
    sendTask: async function (name, task, options) {
      this.sendTaskCalls.push({ name, task, options });
      return { sent: true };
    },
    create: () => ({ name: 'unused' }),
    audit: () => {},
  };
}

describe('Scheduler cron parser', () => {
  it('validates 5-field cron expressions', () => {
    assert.ok(Scheduler._validateCron('* * * * *'));
    assert.ok(Scheduler._validateCron('0 2 * * *'));
    assert.ok(Scheduler._validateCron('*/5 * * * 1-5'));
    assert.ok(!Scheduler._validateCron('not a cron'));
    assert.ok(!Scheduler._validateCron('60 * * * *'));      // 60 > 59 minutes
    assert.ok(!Scheduler._validateCron('0 * * 13 *'));      // 13 > 12 month
    assert.ok(!Scheduler._validateCron('* * * *'));         // 4 fields
  });

  it('matches a specific minute correctly', () => {
    const date = new Date('2026-04-30T02:30:00');
    assert.ok(Scheduler._cronMatches('30 2 * * *', date));
    assert.ok(!Scheduler._cronMatches('31 2 * * *', date));
  });

  it('matches step expressions', () => {
    const date = new Date('2026-04-30T02:15:00');
    assert.ok(Scheduler._cronMatches('*/15 * * * *', date));
    const offDate = new Date('2026-04-30T02:14:00');
    assert.ok(!Scheduler._cronMatches('*/15 * * * *', offDate));
  });

  it('matches comma lists and ranges', () => {
    const date = new Date('2026-04-30T08:00:00');
    assert.ok(Scheduler._cronMatches('0 0,8,16 * * *', date));
    assert.ok(Scheduler._cronMatches('0 6-10 * * *', date));
    assert.ok(!Scheduler._cronMatches('0 9-23 * * *', date));
  });
});

describe('Scheduler add/remove/enable', () => {
  function makeFreshScheduler() {
    const mgr = makeStubManager();
    const sched = Object.create(Scheduler.prototype);
    sched.manager = mgr;
    sched.tickMs = 30000;
    sched._timer = null;
    sched._entries = new Map();
    sched._loadState = () => {};
    sched._saveState = () => {};
    return { sched, mgr };
  }

  it('add rejects entries missing required fields', () => {
    const { sched } = makeFreshScheduler();
    assert.ok(sched.add({}).error);
    assert.ok(sched.add({ id: 'x' }).error);
    assert.ok(sched.add({ id: 'x', cron: '* * * * *' }).error);
    assert.ok(sched.add({ id: 'x', cron: 'bad', task: 't' }).error);
  });

  it('add then list returns the entry', () => {
    const { sched } = makeFreshScheduler();
    sched.add({ id: 'nightly', cron: '0 2 * * *', task: 'train' });
    const list = sched.list();
    assert.strictEqual(list.schedules.length, 1);
    assert.strictEqual(list.schedules[0].id, 'nightly');
    assert.strictEqual(list.schedules[0].enabled, true);
  });

  it('enable toggles entry state', () => {
    const { sched } = makeFreshScheduler();
    sched.add({ id: 'x', cron: '* * * * *', task: 't' });
    sched.enable('x', false);
    assert.strictEqual(sched.list().schedules[0].enabled, false);
    sched.enable('x', true);
    assert.strictEqual(sched.list().schedules[0].enabled, true);
  });

  it('remove deletes runtime entries but rejects config entries', () => {
    const { sched } = makeFreshScheduler();
    sched.add({ id: 'runtime', cron: '* * * * *', task: 't' });
    assert.ok(sched.remove('runtime').success);
    sched._entries.set('cfg', { id: 'cfg', cron: '* * * * *', task: 't', fromConfig: true });
    assert.ok(sched.remove('cfg').error);
  });

  it('runNow fires immediately regardless of cron / enabled', async () => {
    const { sched, mgr } = makeFreshScheduler();
    sched.add({ id: 'x', cron: '0 0 1 1 *', task: 'go', enabled: false });
    await sched.runNow('x');
    assert.strictEqual(mgr.sendTaskCalls.length, 1);
    assert.strictEqual(mgr.sendTaskCalls[0].task, 'go');
  });

  it('_tick fires only matching entries and only once per minute', async () => {
    const { sched, mgr } = makeFreshScheduler();
    const minute = new Date();
    minute.setSeconds(0, 0);
    const cron = `${minute.getMinutes()} ${minute.getHours()} * * *`;
    sched.add({ id: 'now', cron, task: 'do' });
    sched._tickFor = async () => {};
    // Force the tick to use our `minute` value.
    const realDate = global.Date;
    global.Date = class extends realDate {
      constructor(...args) {
        return args.length === 0 ? minute : new realDate(...args);
      }
      static now() { return minute.getTime(); }
    };
    try {
      await sched._tick();
      await sched._tick(); // second tick within same minute → no-op
    } finally {
      global.Date = realDate;
    }
    assert.strictEqual(mgr.sendTaskCalls.length, 1);
  });
});
