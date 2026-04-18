// (11.4) NL interface tests.
//
// Covers the rule-based parser, adapter dispatch, session storage, the
// chat-turn handler (parse -> execute -> format -> persist), and
// formatResponse rendering. Tests construct a fresh tmpdir-backed
// SessionStore and a mocked adapter so nothing touches a real daemon or
// the operator's ~/.c4/nl-sessions.json.

'use strict';
require('./jest-shim');

const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  INTENTS,
  INTENT_LIST,
  NlInterface,
  SessionStore,
  parseIntent,
  executeIntent,
  formatResponse,
  defaultSessionsPath,
  buildActions,
} = require('../src/nl-interface');

function mkTmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'c4-nl-test-'));
}

function newStore() {
  const dir = mkTmpDir();
  return {
    dir,
    store: new SessionStore({ storePath: path.join(dir, 'nl-sessions.json') }),
  };
}

function mockAdapter(overrides = {}) {
  const calls = [];
  const base = {
    async listWorkers() {
      calls.push(['listWorkers']);
      return { workers: [{ name: 'w1', status: 'idle' }, { name: 'w2', status: 'busy' }] };
    },
    async createWorker(name) {
      calls.push(['createWorker', name]);
      return { name, pid: 1234 };
    },
    async sendTask(name, task) {
      calls.push(['sendTask', name, task]);
      return { ok: true };
    },
    async getStatus() {
      calls.push(['getStatus']);
      return { ok: true, workers: 2, version: '1.7.0' };
    },
    async getHistory(name) {
      calls.push(['getHistory', name]);
      return { entries: [{ at: '2026-04-18T00:00:00Z', task: 'did something' }] };
    },
    async readOutput(name) {
      calls.push(['readOutput', name]);
      return { output: 'hello from ' + name };
    },
    async closeWorker(name) {
      calls.push(['closeWorker', name]);
      return { closed: true, name };
    },
  };
  return { adapter: Object.assign(base, overrides), calls };
}

describe('(11.4) NL exports + constants', () => {
  test('(a) INTENTS enum exposes the canonical intent names', () => {
    expect(INTENTS.LIST_WORKERS).toBe('list_workers');
    expect(INTENTS.CREATE_WORKER).toBe('create_worker');
    expect(INTENTS.SEND_TASK).toBe('send_task');
    expect(INTENTS.GET_STATUS).toBe('get_status');
    expect(INTENTS.GET_HISTORY).toBe('get_history');
    expect(INTENTS.READ_OUTPUT).toBe('read_output');
    expect(INTENTS.CLOSE_WORKER).toBe('close_worker');
    expect(INTENTS.UNKNOWN).toBe('unknown');
  });

  test('(b) INTENT_LIST has 8 entries and is frozen', () => {
    expect(INTENT_LIST.length).toBe(8);
    expect(Object.isFrozen(INTENT_LIST)).toBe(true);
  });

  test('(c) defaultSessionsPath points under home/.c4/nl-sessions.json', () => {
    const p = defaultSessionsPath();
    expect(p.endsWith(path.join('.c4', 'nl-sessions.json'))).toBe(true);
    expect(p.startsWith(os.homedir())).toBe(true);
  });
});

describe('(11.4) parseIntent — list_workers', () => {
  test('(a) "show me workers"', () => {
    expect(parseIntent('show me workers').intent).toBe(INTENTS.LIST_WORKERS);
  });
  test('(b) "list workers"', () => {
    expect(parseIntent('list workers').intent).toBe(INTENTS.LIST_WORKERS);
  });
  test('(c) "what workers are running"', () => {
    expect(parseIntent('what workers are running').intent).toBe(INTENTS.LIST_WORKERS);
  });
  test('(d) "workers status"', () => {
    expect(parseIntent('workers status').intent).toBe(INTENTS.LIST_WORKERS);
  });
  test('(e) "workers?"', () => {
    expect(parseIntent('workers?').intent).toBe(INTENTS.LIST_WORKERS);
  });
});

describe('(11.4) parseIntent — create_worker', () => {
  test('(a) "make a new worker called foo"', () => {
    const r = parseIntent('make a new worker called foo');
    expect(r.intent).toBe(INTENTS.CREATE_WORKER);
    expect(r.params.name).toBe('foo');
  });
  test('(b) "create worker bar"', () => {
    const r = parseIntent('create worker bar');
    expect(r.intent).toBe(INTENTS.CREATE_WORKER);
    expect(r.params.name).toBe('bar');
  });
  test('(c) "spawn worker baz"', () => {
    const r = parseIntent('spawn worker baz');
    expect(r.intent).toBe(INTENTS.CREATE_WORKER);
    expect(r.params.name).toBe('baz');
  });
  test('(d) "new worker q1"', () => {
    const r = parseIntent('new worker q1');
    expect(r.intent).toBe(INTENTS.CREATE_WORKER);
    expect(r.params.name).toBe('q1');
  });
});

describe('(11.4) parseIntent — send_task', () => {
  test('(a) "tell w1 to run the tests"', () => {
    const r = parseIntent('tell w1 to run the tests');
    expect(r.intent).toBe(INTENTS.SEND_TASK);
    expect(r.params.name).toBe('w1');
    expect(r.params.task).toBe('run the tests');
  });
  test('(b) "task w1 \'write README\'"', () => {
    const r = parseIntent("task w1 'write README'");
    expect(r.intent).toBe(INTENTS.SEND_TASK);
    expect(r.params.name).toBe('w1');
    expect(r.params.task).toBe('write README');
  });
  test('(c) "ask w2 to deploy"', () => {
    const r = parseIntent('ask w2 to deploy');
    expect(r.intent).toBe(INTENTS.SEND_TASK);
    expect(r.params.name).toBe('w2');
    expect(r.params.task).toBe('deploy');
  });
  test('(d) "worker w3 should refactor utils"', () => {
    const r = parseIntent('worker w3 should refactor utils');
    expect(r.intent).toBe(INTENTS.SEND_TASK);
    expect(r.params.name).toBe('w3');
    expect(r.params.task).toBe('refactor utils');
  });
});

describe('(11.4) parseIntent — other intents', () => {
  test('(a) "status"', () => {
    expect(parseIntent('status').intent).toBe(INTENTS.GET_STATUS);
  });
  test('(b) "daemon health"', () => {
    expect(parseIntent('daemon health').intent).toBe(INTENTS.GET_STATUS);
  });
  test('(c) "what did w1 do"', () => {
    const r = parseIntent('what did w1 do');
    expect(r.intent).toBe(INTENTS.GET_HISTORY);
    expect(r.params.name).toBe('w1');
  });
  test('(d) "recent activity"', () => {
    expect(parseIntent('recent activity').intent).toBe(INTENTS.GET_HISTORY);
  });
  test('(e) "show me w1 output"', () => {
    const r = parseIntent('show me w1 output');
    expect(r.intent).toBe(INTENTS.READ_OUTPUT);
    expect(r.params.name).toBe('w1');
  });
  test('(f) "read w2"', () => {
    const r = parseIntent('read w2');
    expect(r.intent).toBe(INTENTS.READ_OUTPUT);
    expect(r.params.name).toBe('w2');
  });
  test('(g) "close w1"', () => {
    const r = parseIntent('close w1');
    expect(r.intent).toBe(INTENTS.CLOSE_WORKER);
    expect(r.params.name).toBe('w1');
  });
  test('(h) "stop worker w2"', () => {
    const r = parseIntent('stop worker w2');
    expect(r.intent).toBe(INTENTS.CLOSE_WORKER);
    expect(r.params.name).toBe('w2');
  });
  test('(i) "kill w3"', () => {
    const r = parseIntent('kill w3');
    expect(r.intent).toBe(INTENTS.CLOSE_WORKER);
    expect(r.params.name).toBe('w3');
  });
});

describe('(11.4) parseIntent — rejection', () => {
  test('(a) empty input returns unknown with zero confidence', () => {
    const r = parseIntent('');
    expect(r.intent).toBe(INTENTS.UNKNOWN);
    expect(r.confidence).toBe(0);
  });
  test('(b) nonsense returns unknown', () => {
    const r = parseIntent('xyzzy plugh mumble frotz');
    expect(r.intent).toBe(INTENTS.UNKNOWN);
  });
  test('(c) null input is handled gracefully', () => {
    const r = parseIntent(null);
    expect(r.intent).toBe(INTENTS.UNKNOWN);
  });
  test('(d) unknown keeps raw text under params.text', () => {
    const r = parseIntent('hello world');
    expect(r.intent).toBe(INTENTS.UNKNOWN);
    expect(r.params.text).toBe('hello world');
  });
});

describe('(11.4) SessionStore CRUD', () => {
  test('(a) createSession returns a fresh session with id and timestamps', () => {
    const { store } = newStore();
    const s = store.createSession();
    expect(typeof s.id).toBe('string');
    expect(s.id.length).toBeGreaterThan(0);
    expect(s.history).toEqual([]);
    expect(s.lastWorker).toBeNull();
    expect(typeof s.createdAt).toBe('string');
    expect(typeof s.updatedAt).toBe('string');
  });

  test('(b) appendMessage pushes user + assistant turns', () => {
    const { store } = newStore();
    const s = store.createSession();
    store.appendMessage(s.id, 'user', 'hi');
    const after = store.appendMessage(s.id, 'assistant', 'hello');
    expect(after.history.length).toBe(2);
    expect(after.history[0].role).toBe('user');
    expect(after.history[1].role).toBe('assistant');
  });

  test('(c) appendMessage creates a new session when id is unknown', () => {
    const { store } = newStore();
    const before = store.listSessions().length;
    store.appendMessage('missing-id', 'user', 'hi');
    expect(store.listSessions().length).toBe(before + 1);
  });

  test('(d) appendMessage rejects invalid role', () => {
    const { store } = newStore();
    const s = store.createSession();
    expect(() => store.appendMessage(s.id, 'bot', 'hi')).toThrow('Invalid role');
  });

  test('(e) setLastWorker persists and listSessions reflects it', () => {
    const { store } = newStore();
    const s = store.createSession();
    store.setLastWorker(s.id, 'w9');
    const list = store.listSessions();
    expect(list[0].lastWorker).toBe('w9');
  });

  test('(f) deleteSession removes the entry', () => {
    const { store } = newStore();
    const s = store.createSession();
    expect(store.deleteSession(s.id)).toBe(true);
    expect(store.getSession(s.id)).toBeNull();
    expect(store.deleteSession(s.id)).toBe(false);
  });

  test('(g) storage roundtrip through reload()', () => {
    const dir = mkTmpDir();
    const storePath = path.join(dir, 'nl-sessions.json');
    const s1 = new SessionStore({ storePath });
    const created = s1.createSession();
    s1.appendMessage(created.id, 'user', 'persist me');
    const s2 = new SessionStore({ storePath });
    const loaded = s2.getSession(created.id);
    expect(loaded).not.toBeNull();
    expect(loaded.history.length).toBe(1);
    expect(loaded.history[0].text).toBe('persist me');
  });

  test('(h) malformed JSON yields an empty store', () => {
    const dir = mkTmpDir();
    const storePath = path.join(dir, 'nl-sessions.json');
    fs.writeFileSync(storePath, '{not json');
    const store = new SessionStore({ storePath });
    expect(store.listSessions()).toEqual([]);
  });
});

describe('(11.4) executeIntent dispatch', () => {
  test('(a) list_workers routes to adapter.listWorkers', async () => {
    const { adapter, calls } = mockAdapter();
    const r = await executeIntent(INTENTS.LIST_WORKERS, {}, { adapter });
    expect(r.ok).toBe(true);
    expect(calls[0][0]).toBe('listWorkers');
    expect(r.data.workers.length).toBe(2);
  });

  test('(b) create_worker routes and surfaces the worker name', async () => {
    const { adapter, calls } = mockAdapter();
    const r = await executeIntent(INTENTS.CREATE_WORKER, { name: 'w5' }, { adapter });
    expect(r.ok).toBe(true);
    expect(r.worker).toBe('w5');
    expect(calls[0]).toEqual(['createWorker', 'w5']);
  });

  test('(c) create_worker without name returns a validation error', async () => {
    const { adapter } = mockAdapter();
    const r = await executeIntent(INTENTS.CREATE_WORKER, {}, { adapter });
    expect(r.ok).toBe(false);
    expect(r.error).toContain('Missing worker name');
  });

  test('(d) send_task without task text returns a validation error', async () => {
    const { adapter } = mockAdapter();
    const r = await executeIntent(INTENTS.SEND_TASK, { name: 'w1' }, { adapter });
    expect(r.ok).toBe(false);
    expect(r.error).toContain('Missing task');
  });

  test('(e) adapter throw is captured as ok:false', async () => {
    const { adapter } = mockAdapter({
      async listWorkers() { throw new Error('daemon offline'); },
    });
    const r = await executeIntent(INTENTS.LIST_WORKERS, {}, { adapter });
    expect(r.ok).toBe(false);
    expect(r.error).toBe('daemon offline');
  });

  test('(f) unknown intent returns ok:false without calling the adapter', async () => {
    const { adapter, calls } = mockAdapter();
    const r = await executeIntent(INTENTS.UNKNOWN, { text: 'nope' }, { adapter });
    expect(r.ok).toBe(false);
    expect(r.intent).toBe(INTENTS.UNKNOWN);
    expect(calls.length).toBe(0);
  });

  test('(g) missing adapter returns ok:false', async () => {
    const r = await executeIntent(INTENTS.LIST_WORKERS, {}, {});
    expect(r.ok).toBe(false);
    expect(r.error).toContain('No adapter');
  });
});

describe('(11.4) formatResponse rendering', () => {
  test('(a) list_workers shows count and worker names', () => {
    const out = formatResponse(
      { ok: true, data: { workers: [{ name: 'a', status: 'idle' }, { name: 'b', status: 'busy' }] } },
      INTENTS.LIST_WORKERS,
    );
    expect(out).toContain('Active workers (2)');
    expect(out).toContain('a (idle)');
    expect(out).toContain('b (busy)');
  });

  test('(b) list_workers with empty list', () => {
    const out = formatResponse({ ok: true, data: { workers: [] } }, INTENTS.LIST_WORKERS);
    expect(out).toContain('No workers');
  });

  test('(c) create_worker mentions the name', () => {
    const out = formatResponse({ ok: true, worker: 'w5', data: {} }, INTENTS.CREATE_WORKER);
    expect(out).toContain("Created worker 'w5'");
  });

  test('(d) send_task echoes the task text', () => {
    const out = formatResponse(
      { ok: true, worker: 'w1', task: 'run tests', data: {} },
      INTENTS.SEND_TASK,
    );
    expect(out).toContain('w1');
    expect(out).toContain('run tests');
  });

  test('(e) get_status shows daemon summary', () => {
    const out = formatResponse(
      { ok: true, data: { ok: true, workers: 3, version: '1.7.0' } },
      INTENTS.GET_STATUS,
    );
    expect(out).toContain('Daemon: ok');
    expect(out).toContain('3 workers');
    expect(out).toContain('1.7.0');
  });

  test('(f) unknown intent returns the help fallback', () => {
    const out = formatResponse({ ok: false, intent: INTENTS.UNKNOWN }, INTENTS.UNKNOWN);
    expect(out).toContain('did not understand');
  });

  test('(g) error path surfaces the error message', () => {
    const out = formatResponse({ ok: false, error: 'boom' }, INTENTS.LIST_WORKERS);
    expect(out).toContain('Error: boom');
  });

  test('(h) read_output truncates very long output', () => {
    const big = 'x'.repeat(2000);
    const out = formatResponse(
      { ok: true, worker: 'w1', data: { output: big } },
      INTENTS.READ_OUTPUT,
    );
    expect(out.length).toBeLessThan(big.length);
    expect(out).toContain('truncated');
  });
});

describe('(11.4) NlInterface.handle full turn', () => {
  test('(a) list_workers end-to-end: session, message log, reply', async () => {
    const { adapter } = mockAdapter();
    const { store } = newStore();
    const nl = new NlInterface({ adapter, sessionStore: store });
    const out = await nl.handle(null, 'list workers');
    expect(out.sessionId).toBeDefined();
    expect(out.intent).toBe(INTENTS.LIST_WORKERS);
    expect(out.response).toContain('Active workers');
    const session = store.getSession(out.sessionId);
    expect(session.history.length).toBe(2);
    expect(session.history[0].role).toBe('user');
    expect(session.history[1].role).toBe('assistant');
  });

  test('(b) pronoun resolution: "close it" reuses lastWorker', async () => {
    const { adapter, calls } = mockAdapter();
    const { store } = newStore();
    const nl = new NlInterface({ adapter, sessionStore: store });
    const first = await nl.handle(null, 'show me w7 output');
    expect(first.result.worker).toBe('w7');
    expect(store.getSession(first.sessionId).lastWorker).toBe('w7');
    const second = await nl.handle(first.sessionId, 'close it');
    expect(second.intent).toBe(INTENTS.CLOSE_WORKER);
    expect(calls[calls.length - 1]).toEqual(['closeWorker', 'w7']);
  });

  test('(c) unknown intent does not call the adapter', async () => {
    const { adapter, calls } = mockAdapter();
    const { store } = newStore();
    const nl = new NlInterface({ adapter, sessionStore: store });
    const out = await nl.handle(null, 'foo bar baz quux');
    expect(out.intent).toBe(INTENTS.UNKNOWN);
    expect(calls.length).toBe(0);
    expect(out.response).toContain('did not understand');
  });

  test('(d) buildActions returns quick-action chips for create_worker', () => {
    const actions = buildActions(
      { intent: INTENTS.CREATE_WORKER, params: { name: 'wX' } },
      { ok: true, worker: 'wX' },
    );
    expect(actions.length).toBeGreaterThanOrEqual(1);
    expect(actions.some((a) => a.type === 'send_task')).toBe(true);
  });
});
