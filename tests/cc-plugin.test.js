'use strict';

// Tests for TODO 9.5 - Claude Code plugin.
//
// Two layers:
//   1. Validate plugin.json (manifest schema: name, version, engines,
//      five commands with the right arguments).
//   2. Import each handler, hand in a stub fetch, verify the HTTP
//      method / URL / body the daemon would see, and confirm the
//      parsed response flows back to the caller.
//
// Nothing here spawns Claude Code, starts a daemon, or touches the
// network.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const PLUGIN_ROOT = path.join(__dirname, '..', 'claude-code-plugin');

function makeStubFetch(responses) {
  const list = Array.isArray(responses) ? responses.slice() : [responses];
  const calls = [];
  async function fetchImpl(url, init) {
    const res = list.length > 1 ? list.shift() : list[0];
    const status = res && typeof res.status === 'number' ? res.status : 200;
    const bodyStr = res && res.body !== undefined
      ? (typeof res.body === 'string' ? res.body : JSON.stringify(res.body))
      : '{}';
    calls.push({ url: String(url), init: init || {} });
    return {
      ok: status >= 200 && status < 300,
      status,
      statusText: (res && res.statusText) || '',
      text: async () => bodyStr,
    };
  }
  return { fetch: fetchImpl, calls };
}

function parseBody(init) {
  if (!init || !init.body) return null;
  if (typeof init.body !== 'string') return init.body;
  try { return JSON.parse(init.body); } catch (_) { return init.body; }
}

function loadHandler(name) {
  return require(path.join(PLUGIN_ROOT, 'commands', name + '.js')).handler;
}

// --------------------------------------------------------------------
// 1. Manifest
// --------------------------------------------------------------------

test('plugin.json - structure + required fields', () => {
  const raw = fs.readFileSync(path.join(PLUGIN_ROOT, 'plugin.json'), 'utf8');
  const manifest = JSON.parse(raw);

  assert.strictEqual(manifest.name, 'c4', 'plugin.name');
  assert.ok(/^\d+\.\d+\.\d+/.test(manifest.version), 'plugin.version must be semver-like');
  assert.ok(manifest.description && manifest.description.length > 10, 'description populated');
  assert.ok(manifest.engines && manifest.engines.node, 'engines.node declared');
  assert.ok(/>=\s*18/.test(manifest.engines.node), 'engines.node demands >= 18');

  assert.ok(Array.isArray(manifest.commands), 'commands array exists');
  assert.strictEqual(manifest.commands.length, 5, 'exactly five commands');

  const names = manifest.commands.map((c) => c.name).sort();
  assert.deepStrictEqual(names, ['c4-close', 'c4-list', 'c4-merge', 'c4-new', 'c4-task'].sort(),
    'command set matches the spec');
});

test('plugin.json - every command has description, handler, file, arguments array', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(PLUGIN_ROOT, 'plugin.json'), 'utf8'));
  for (const cmd of manifest.commands) {
    assert.ok(typeof cmd.description === 'string' && cmd.description.length > 0,
      cmd.name + '.description');
    assert.ok(cmd.handler && cmd.handler.startsWith('commands/') && cmd.handler.endsWith('.js'),
      cmd.name + '.handler points into commands/*.js');
    assert.ok(cmd.file && cmd.file.startsWith('commands/') && cmd.file.endsWith('.md'),
      cmd.name + '.file points into commands/*.md');
    assert.ok(Array.isArray(cmd.arguments), cmd.name + '.arguments is an array');
    for (const arg of cmd.arguments) {
      assert.ok(typeof arg.name === 'string' && arg.name.length > 0,
        cmd.name + ' argument needs a name');
      assert.strictEqual(typeof arg.required, 'boolean',
        cmd.name + '.' + arg.name + '.required must be boolean');
    }
  }
});

test('plugin.json - handler + file paths exist on disk', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(PLUGIN_ROOT, 'plugin.json'), 'utf8'));
  for (const cmd of manifest.commands) {
    const handlerPath = path.join(PLUGIN_ROOT, cmd.handler);
    const mdPath = path.join(PLUGIN_ROOT, cmd.file);
    assert.ok(fs.existsSync(handlerPath), cmd.name + ' handler file exists: ' + handlerPath);
    assert.ok(fs.existsSync(mdPath), cmd.name + ' markdown file exists: ' + mdPath);
  }
});

test('plugin.json - argument coverage for required positional args', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(PLUGIN_ROOT, 'plugin.json'), 'utf8'));
  const byName = Object.fromEntries(manifest.commands.map((c) => [c.name, c]));

  assert.ok(byName['c4-new'].arguments.some((a) => a.name === 'name' && a.required === true),
    'c4-new requires name');
  assert.ok(byName['c4-task'].arguments.some((a) => a.name === 'name' && a.required === true),
    'c4-task requires name');
  assert.ok(byName['c4-task'].arguments.some((a) => a.name === 'task' && a.required === true),
    'c4-task requires task');
  assert.ok(byName['c4-merge'].arguments.some((a) => a.name === 'name' && a.required === true),
    'c4-merge requires name');
  assert.ok(byName['c4-close'].arguments.some((a) => a.name === 'name' && a.required === true),
    'c4-close requires name');
  assert.strictEqual(byName['c4-list'].arguments.length, 0, 'c4-list takes no arguments');
});

// --------------------------------------------------------------------
// 2. Shared client
// --------------------------------------------------------------------

test('MinimalC4Client - _request wires method + URL + body and honors token', async () => {
  const { MinimalC4Client } = require(path.join(PLUGIN_ROOT, 'commands', '_client.js'));
  const { fetch, calls } = makeStubFetch({ status: 200, body: { ok: true } });
  const client = new MinimalC4Client({ base: 'http://127.0.0.1:3456/', token: 'jwt-xxx', fetch });

  const r = await client.createWorker('w-a', { target: 'local', parent: 'mgr' });
  assert.deepStrictEqual(r, { ok: true });
  assert.strictEqual(calls.length, 1);
  assert.strictEqual(calls[0].url, 'http://127.0.0.1:3456/create');
  assert.strictEqual(calls[0].init.method, 'POST');
  assert.strictEqual(calls[0].init.headers.Authorization, 'Bearer jwt-xxx');
  assert.strictEqual(calls[0].init.headers['Content-Type'], 'application/json');
  const body = parseBody(calls[0].init);
  assert.deepStrictEqual(body, { name: 'w-a', target: 'local', parent: 'mgr' },
    'undefined option fields are stripped');
});

test('MinimalC4Client - non-2xx throws an error with status + body', async () => {
  const { MinimalC4Client } = require(path.join(PLUGIN_ROOT, 'commands', '_client.js'));
  const { fetch } = makeStubFetch({ status: 409, body: { error: 'name taken' } });
  const client = new MinimalC4Client({ base: 'http://localhost:3456', fetch });
  await assert.rejects(
    () => client.createWorker('w1'),
    (err) => err.status === 409 && err.body && err.body.error === 'name taken'
  );
});

test('MinimalC4Client - missing fetch throws at construction', () => {
  const { MinimalC4Client } = require(path.join(PLUGIN_ROOT, 'commands', '_client.js'));
  assert.throws(
    () => new MinimalC4Client({ base: 'http://localhost:3456', fetch: null }),
    /no fetch implementation/i
  );
});

test('getClient - prefers injected ClientClass over SDK + minimal fallback', () => {
  const { getClient } = require(path.join(PLUGIN_ROOT, 'commands', '_client.js'));
  class FakeClient {
    constructor(opts) { this.opts = opts; }
  }
  const res = getClient({ env: { C4_BASE: 'http://stub:1234' }, fetch: () => {}, ClientClass: FakeClient });
  assert.ok(res.client instanceof FakeClient);
  assert.strictEqual(res.source, 'injected');
  assert.strictEqual(res.base, 'http://stub:1234');
});

test('getClient - falls back to MinimalC4Client when SDK is disabled', () => {
  const { getClient, MinimalC4Client } = require(path.join(PLUGIN_ROOT, 'commands', '_client.js'));
  const res = getClient({ env: {}, fetch: () => {}, useSdk: false });
  assert.ok(res.client instanceof MinimalC4Client);
  assert.strictEqual(res.source, 'minimal');
  assert.strictEqual(res.base, 'http://localhost:3456');
});

test('getClient - uses c4-sdk when resolvable', () => {
  const { getClient } = require(path.join(PLUGIN_ROOT, 'commands', '_client.js'));
  const res = getClient({ env: { C4_BASE: 'http://sdk:1234' }, fetch: () => {} });
  assert.ok(res.client, 'client returned');
  assert.ok(res.source === 'c4-sdk' || res.source === 'minimal',
    'source is c4-sdk (if sibling sdk/ resolvable) or minimal fallback');
  if (res.source === 'c4-sdk') {
    assert.strictEqual(res.client.constructor.name, 'C4Client');
  }
});

// --------------------------------------------------------------------
// 3. argv parser
// --------------------------------------------------------------------

test('parseArgv - positional + long options + --flag=value + boolFlags', () => {
  const { parseArgv } = require(path.join(PLUGIN_ROOT, 'commands', '_argv.js'));
  const out = parseArgv(
    ['worker1', 'do it now', '--branch=c4/my', '--auto-mode', '--target', 'local', '--', '-extra-'],
    { positional: ['name'], boolFlags: ['auto-mode'] }
  );
  assert.strictEqual(out.name, 'worker1');
  assert.deepStrictEqual(out._, ['worker1', 'do it now', '-extra-']);
  assert.strictEqual(out.branch, 'c4/my');
  assert.strictEqual(out['auto-mode'], true);
  assert.strictEqual(out.target, 'local');
});

// --------------------------------------------------------------------
// 4. Per-command handlers
// --------------------------------------------------------------------

test('c4-new - POSTs /create with name + target + optional opts', async () => {
  const handler = loadHandler('c4-new');
  const { fetch, calls } = makeStubFetch({ status: 200, body: { name: 'w1', branch: 'c4/w1' } });

  const out = await handler({
    args: { name: 'w1', target: 'local', parent: 'mgr', command: 'claude' },
    env: { C4_BASE: 'http://host:3456' },
    fetch,
    useSdk: false,
  });

  assert.strictEqual(out.ok, true);
  assert.strictEqual(out.command, 'c4-new');
  assert.strictEqual(out.name, 'w1');
  assert.deepStrictEqual(out.result, { name: 'w1', branch: 'c4/w1' });

  assert.strictEqual(calls.length, 1);
  assert.strictEqual(calls[0].init.method, 'POST');
  const u = new URL(calls[0].url);
  assert.strictEqual(u.pathname, '/create');
  assert.deepStrictEqual(parseBody(calls[0].init), {
    name: 'w1', target: 'local', parent: 'mgr', command: 'claude',
  });
});

test('c4-new - rejects missing name synchronously', async () => {
  const handler = loadHandler('c4-new');
  const { fetch, calls } = makeStubFetch({ status: 200, body: {} });
  await assert.rejects(
    () => handler({ args: {}, env: {}, fetch, useSdk: false }),
    (err) => err.code === 'MISSING_ARG' && err.argName === 'name'
  );
  assert.strictEqual(calls.length, 0, 'no network call on missing arg');
});

test('c4-new - accepts name via positional _[0]', async () => {
  const handler = loadHandler('c4-new');
  const { fetch, calls } = makeStubFetch({ status: 200, body: { name: 'w-pos' } });
  const out = await handler({
    args: { _: ['w-pos'] },
    env: {},
    fetch,
    useSdk: false,
  });
  assert.strictEqual(out.name, 'w-pos');
  assert.strictEqual(calls.length, 1);
  assert.strictEqual(parseBody(calls[0].init).name, 'w-pos');
});

test('c4-task - POSTs /task with name + task + autoMode + passthrough opts', async () => {
  const handler = loadHandler('c4-task');
  const { fetch, calls } = makeStubFetch({ status: 200, body: { queued: true } });

  const out = await handler({
    args: {
      name: 'w1',
      task: 'write tests',
      'auto-mode': 'true',
      branch: 'c4/foo',
      reuse: 'yes',
    },
    env: {},
    fetch,
    useSdk: false,
  });

  assert.strictEqual(out.ok, true);
  assert.strictEqual(out.command, 'c4-task');
  assert.strictEqual(out.task, 'write tests');

  assert.strictEqual(calls.length, 1);
  assert.strictEqual(calls[0].init.method, 'POST');
  assert.strictEqual(new URL(calls[0].url).pathname, '/task');
  const body = parseBody(calls[0].init);
  assert.strictEqual(body.name, 'w1');
  assert.strictEqual(body.task, 'write tests');
  assert.strictEqual(body.autoMode, true);
  assert.strictEqual(body.branch, 'c4/foo');
  assert.strictEqual(body.reuse, true);
});

test('c4-task - rejects missing task synchronously', async () => {
  const handler = loadHandler('c4-task');
  const { fetch, calls } = makeStubFetch({ status: 200, body: {} });
  await assert.rejects(
    () => handler({ args: { name: 'w1' }, env: {}, fetch, useSdk: false }),
    (err) => err.code === 'MISSING_ARG' && err.argName === 'task'
  );
  assert.strictEqual(calls.length, 0);
});

test('c4-task - folds positional tail into task', async () => {
  const handler = loadHandler('c4-task');
  const { fetch, calls } = makeStubFetch({ status: 200, body: {} });
  await handler({
    args: { _: ['w1', 'hello', 'world'] },
    env: {},
    fetch,
    useSdk: false,
  });
  assert.strictEqual(parseBody(calls[0].init).task, 'hello world');
});

test('c4-list - GETs /list without a body', async () => {
  const handler = loadHandler('c4-list');
  const { fetch, calls } = makeStubFetch({ status: 200, body: { workers: [{ name: 'a' }], queuedTasks: [] } });

  const out = await handler({ env: {}, fetch, useSdk: false });
  assert.strictEqual(out.ok, true);
  assert.strictEqual(out.command, 'c4-list');
  assert.deepStrictEqual(out.result, { workers: [{ name: 'a' }], queuedTasks: [] });

  assert.strictEqual(calls.length, 1);
  assert.strictEqual(calls[0].init.method, 'GET');
  assert.strictEqual(new URL(calls[0].url).pathname, '/list');
  assert.strictEqual(calls[0].init.body, undefined, 'GET has no body');
});

test('c4-merge - POSTs /merge with name and optional skipChecks flag', async () => {
  const handler = loadHandler('c4-merge');
  const { fetch, calls } = makeStubFetch({ status: 200, body: { merged: true, commit: 'abc' } });

  const out = await handler({
    args: { name: 'w1', 'skip-checks': 'true' },
    env: {},
    fetch,
    useSdk: false,
  });
  assert.strictEqual(out.ok, true);
  assert.strictEqual(out.command, 'c4-merge');
  assert.deepStrictEqual(out.result, { merged: true, commit: 'abc' });

  assert.strictEqual(calls.length, 1);
  assert.strictEqual(calls[0].init.method, 'POST');
  assert.strictEqual(new URL(calls[0].url).pathname, '/merge');
  const body = parseBody(calls[0].init);
  assert.strictEqual(body.name, 'w1');
  assert.strictEqual(body.skipChecks, true);
});

test('c4-merge - omits skipChecks when flag not given', async () => {
  const handler = loadHandler('c4-merge');
  const { fetch, calls } = makeStubFetch({ status: 200, body: {} });
  await handler({ args: { name: 'w1' }, env: {}, fetch, useSdk: false });
  const body = parseBody(calls[0].init);
  assert.strictEqual(body.name, 'w1');
  assert.ok(!('skipChecks' in body), 'skipChecks field not sent when flag absent');
});

test('c4-merge - rejects missing name', async () => {
  const handler = loadHandler('c4-merge');
  const { fetch } = makeStubFetch({ status: 200, body: {} });
  await assert.rejects(
    () => handler({ args: {}, env: {}, fetch, useSdk: false }),
    (err) => err.code === 'MISSING_ARG' && err.argName === 'name'
  );
});

test('c4-close - POSTs /close with { name }', async () => {
  const handler = loadHandler('c4-close');
  const { fetch, calls } = makeStubFetch({ status: 200, body: { closed: true } });

  const out = await handler({ args: { name: 'w1' }, env: {}, fetch, useSdk: false });
  assert.strictEqual(out.ok, true);
  assert.strictEqual(out.command, 'c4-close');
  assert.deepStrictEqual(out.result, { closed: true });

  assert.strictEqual(calls.length, 1);
  assert.strictEqual(calls[0].init.method, 'POST');
  assert.strictEqual(new URL(calls[0].url).pathname, '/close');
  const body = parseBody(calls[0].init);
  assert.strictEqual(body.name, 'w1');
});

test('c4-close - rejects missing name', async () => {
  const handler = loadHandler('c4-close');
  const { fetch } = makeStubFetch({ status: 200, body: {} });
  await assert.rejects(
    () => handler({ args: {}, env: {}, fetch, useSdk: false }),
    (err) => err.code === 'MISSING_ARG' && err.argName === 'name'
  );
});

// --------------------------------------------------------------------
// 5. Auth header propagation through a handler
// --------------------------------------------------------------------

test('handler - attaches Authorization: Bearer when C4_TOKEN is set', async () => {
  const handler = loadHandler('c4-list');
  const { fetch, calls } = makeStubFetch({ status: 200, body: { workers: [] } });
  await handler({
    env: { C4_BASE: 'http://auth-host:3456', C4_TOKEN: 'jwt-abc' },
    fetch,
    useSdk: false,
  });
  assert.strictEqual(calls[0].init.headers.Authorization, 'Bearer jwt-abc');
});

test('handler - surfaces daemon 401 as a thrown error with status', async () => {
  const handler = loadHandler('c4-new');
  const { fetch } = makeStubFetch({ status: 401, body: { error: 'Authentication required' } });
  await assert.rejects(
    () => handler({ args: { name: 'w1' }, env: {}, fetch, useSdk: false }),
    (err) => err.status === 401 && err.body && err.body.error === 'Authentication required'
  );
});
