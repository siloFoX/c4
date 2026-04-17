// Git identity helper tests (7.25).
//
// Verifies src/git-identity.js — the helper used by `c4 init` to check and
// set `git config user.name` / `user.email`, and by `c4 merge` / `c4 daemon`
// to gate/warn on missing identity. All tests use mocked spawn / readline
// dependencies so no real git config is touched.

'use strict';

const assert = require('assert');
const { describe, it } = require('node:test');
const { EventEmitter } = require('events');

const {
  getIdentity,
  identityComplete,
  missingIdentityKeys,
  setGlobalIdentity,
  promptIdentity,
  ensureIdentity,
} = require('../src/git-identity');

// Build a spawnSync stand-in whose responses come from a lookup table keyed
// by the args join. Each value is the object spawnSync would return.
function makeSpawn(responses) {
  return function fakeSpawn(cmd, args) {
    const key = [cmd, ...args].join(' ');
    if (key in responses) return responses[key];
    // default: not configured → exit status 1 (as real git would)
    return { status: 1, stdout: '', stderr: '' };
  };
}

// Capture console-like logger calls
function makeLogger() {
  const lines = [];
  return {
    lines,
    log: (...args) => lines.push(args.join(' ')),
  };
}

// Minimal fake readline that answers queued responses in order.
function makeFakeReadline(answers) {
  const queue = answers.slice();
  const rl = new EventEmitter();
  let closed = false;
  rl.question = (_prompt, cb) => {
    if (queue.length === 0) cb('');
    else cb(queue.shift());
  };
  rl.close = () => { closed = true; };
  return {
    createInterface: () => rl,
    isClosed: () => closed,
  };
}

describe('getIdentity', () => {
  it('returns both values when git config succeeds', () => {
    const spawn = makeSpawn({
      'git config --get user.name': { status: 0, stdout: 'Alice\n', stderr: '' },
      'git config --get user.email': { status: 0, stdout: 'alice@example.com\n', stderr: '' },
    });
    const id = getIdentity({ spawn });
    assert.deepStrictEqual(id, { name: 'Alice', email: 'alice@example.com' });
  });

  it('returns empty strings when config is unset (non-zero status)', () => {
    const spawn = makeSpawn({
      'git config --get user.name': { status: 1, stdout: '', stderr: '' },
      'git config --get user.email': { status: 1, stdout: '', stderr: '' },
    });
    assert.deepStrictEqual(getIdentity({ spawn }), { name: '', email: '' });
  });

  it('returns empty for missing value even when stdout is present', () => {
    const spawn = makeSpawn({
      'git config --get user.name': { status: 0, stdout: 'Bob', stderr: '' },
      'git config --get user.email': { status: 1, stdout: '', stderr: '' },
    });
    assert.deepStrictEqual(getIdentity({ spawn }), { name: 'Bob', email: '' });
  });

  it('handles spawn returning null stdout defensively', () => {
    const spawn = () => ({ status: 0, stdout: null, stderr: null });
    assert.deepStrictEqual(getIdentity({ spawn }), { name: '', email: '' });
  });
});

describe('identityComplete / missingIdentityKeys', () => {
  it('identityComplete is true only when both are set', () => {
    const both = makeSpawn({
      'git config --get user.name': { status: 0, stdout: 'A', stderr: '' },
      'git config --get user.email': { status: 0, stdout: 'a@b', stderr: '' },
    });
    assert.strictEqual(identityComplete({ spawn: both }), true);
  });

  it('identityComplete is false when one is missing', () => {
    const nameOnly = makeSpawn({
      'git config --get user.name': { status: 0, stdout: 'A', stderr: '' },
      'git config --get user.email': { status: 1, stdout: '', stderr: '' },
    });
    assert.strictEqual(identityComplete({ spawn: nameOnly }), false);
  });

  it('missingIdentityKeys lists every unset key', () => {
    const none = makeSpawn({});
    assert.deepStrictEqual(
      missingIdentityKeys({ spawn: none }).sort(),
      ['user.email', 'user.name']
    );
  });

  it('missingIdentityKeys returns empty when both are set', () => {
    const both = makeSpawn({
      'git config --get user.name': { status: 0, stdout: 'A', stderr: '' },
      'git config --get user.email': { status: 0, stdout: 'a@b', stderr: '' },
    });
    assert.deepStrictEqual(missingIdentityKeys({ spawn: both }), []);
  });
});

describe('setGlobalIdentity', () => {
  it('invokes git config --global for provided name and email', () => {
    const calls = [];
    const spawn = (cmd, args) => {
      calls.push([cmd, ...args].join(' '));
      return { status: 0, stdout: '', stderr: '' };
    };
    const applied = setGlobalIdentity({
      name: 'Alice',
      email: 'alice@example.com',
      spawn,
    });
    assert.deepStrictEqual(applied, { name: 'Alice', email: 'alice@example.com' });
    assert.ok(calls.includes('git config --global user.name Alice'));
    assert.ok(calls.includes('git config --global user.email alice@example.com'));
  });

  it('only sets provided keys', () => {
    const calls = [];
    const spawn = (cmd, args) => {
      calls.push([cmd, ...args].join(' '));
      return { status: 0, stdout: '', stderr: '' };
    };
    setGlobalIdentity({ email: 'only@email', spawn });
    assert.strictEqual(
      calls.filter((c) => c.includes('user.name')).length,
      0
    );
    assert.strictEqual(
      calls.filter((c) => c.includes('user.email')).length,
      1
    );
  });

  it('throws when git config set fails', () => {
    const spawn = () => ({ status: 128, stdout: '', stderr: 'boom' });
    assert.throws(
      () => setGlobalIdentity({ name: 'X', spawn }),
      /git config user\.name failed: boom/
    );
  });

  it('does not shell-escape values (uses argv)', () => {
    // Values with spaces / quotes are passed verbatim to spawn args, not as
    // a single shell string, so no escaping is needed and none happens.
    const received = [];
    const spawn = (cmd, args) => {
      received.push(args.slice());
      return { status: 0, stdout: '', stderr: '' };
    };
    setGlobalIdentity({ name: 'First Last "Jr"', spawn });
    assert.deepStrictEqual(received[0], [
      'config', '--global', 'user.name', 'First Last "Jr"',
    ]);
  });
});

describe('promptIdentity', () => {
  it('asks for all missing keys in order', async () => {
    const rlMock = makeFakeReadline(['Alice', 'alice@example.com']);
    const answers = await promptIdentity({
      readlineImpl: rlMock,
      input: {},
      output: {},
      missing: ['user.name', 'user.email'],
    });
    assert.deepStrictEqual(answers, { name: 'Alice', email: 'alice@example.com' });
    assert.strictEqual(rlMock.isClosed(), true);
  });

  it('skips the key that is already present', async () => {
    const rlMock = makeFakeReadline(['only@email.com']);
    const answers = await promptIdentity({
      readlineImpl: rlMock,
      input: {},
      output: {},
      missing: ['user.email'],
    });
    assert.strictEqual(answers.name, '');
    assert.strictEqual(answers.email, 'only@email.com');
  });

  it('returns empty for blank input', async () => {
    const rlMock = makeFakeReadline(['', '']);
    const answers = await promptIdentity({
      readlineImpl: rlMock,
      input: {},
      output: {},
      missing: ['user.name', 'user.email'],
    });
    assert.deepStrictEqual(answers, { name: '', email: '' });
  });
});

describe('ensureIdentity — already-set branch', () => {
  it('does not prompt or set when both identity values exist', async () => {
    const spawn = makeSpawn({
      'git config --get user.name': { status: 0, stdout: 'Alice', stderr: '' },
      'git config --get user.email': { status: 0, stdout: 'alice@example.com', stderr: '' },
    });
    const logger = makeLogger();
    // readline that would error if touched
    const readlineImpl = {
      createInterface: () => { throw new Error('readline should not be used'); },
    };
    const res = await ensureIdentity({
      spawn,
      isTTY: true,
      logger,
      readlineImpl,
      input: {},
      output: {},
    });
    assert.strictEqual(res.status, 'already-set');
    assert.strictEqual(res.name, 'Alice');
    assert.strictEqual(res.email, 'alice@example.com');
    assert.ok(logger.lines.some((l) => l.includes('already set')));
  });
});

describe('ensureIdentity — non-TTY branch', () => {
  it('warns and returns non-tty-skip without prompting', async () => {
    const spawn = makeSpawn({});
    const logger = makeLogger();
    const readlineImpl = {
      createInterface: () => { throw new Error('readline should not be used'); },
    };
    const res = await ensureIdentity({
      spawn,
      isTTY: false,
      logger,
      readlineImpl,
      input: {},
      output: {},
    });
    assert.strictEqual(res.status, 'non-tty-skip');
    assert.deepStrictEqual(res.missing.sort(), ['user.email', 'user.name']);
    const joined = logger.lines.join('\n');
    assert.ok(/non-TTY/.test(joined));
    assert.ok(/user\.name/.test(joined));
    assert.ok(/user\.email/.test(joined));
    // Must not tell users to use env vars (7.25 rule)
    assert.ok(!/GIT_AUTHOR_NAME/.test(joined));
    assert.ok(!/GIT_AUTHOR_EMAIL/.test(joined));
  });

  it('exits 0 path: non-TTY skip returns a status, never throws', async () => {
    const res = await ensureIdentity({
      spawn: makeSpawn({}),
      isTTY: false,
      logger: makeLogger(),
    });
    assert.strictEqual(typeof res.status, 'string');
  });
});

describe('ensureIdentity — TTY branch', () => {
  it('prompts for missing values and calls git config --global', async () => {
    // getIdentity returns empty → both keys missing
    // setGlobalIdentity calls succeed
    const setCalls = [];
    const spawn = (cmd, args) => {
      const key = [cmd, ...args].join(' ');
      if (key === 'git config --get user.name') return { status: 1, stdout: '', stderr: '' };
      if (key === 'git config --get user.email') return { status: 1, stdout: '', stderr: '' };
      if (args[0] === 'config' && args[1] === '--global') {
        setCalls.push(args.slice());
        return { status: 0, stdout: '', stderr: '' };
      }
      return { status: 1, stdout: '', stderr: '' };
    };
    const rlMock = makeFakeReadline(['Alice', 'alice@example.com']);
    const logger = makeLogger();
    const res = await ensureIdentity({
      spawn,
      isTTY: true,
      logger,
      readlineImpl: rlMock,
      input: {},
      output: {},
    });
    assert.strictEqual(res.status, 'set');
    assert.strictEqual(res.name, 'Alice');
    assert.strictEqual(res.email, 'alice@example.com');
    assert.strictEqual(setCalls.length, 2);
    assert.deepStrictEqual(setCalls[0], ['config', '--global', 'user.name', 'Alice']);
    assert.deepStrictEqual(setCalls[1], ['config', '--global', 'user.email', 'alice@example.com']);
  });

  it('only prompts for and sets the missing key when one is already present', async () => {
    const setCalls = [];
    const spawn = (cmd, args) => {
      const key = [cmd, ...args].join(' ');
      if (key === 'git config --get user.name') return { status: 0, stdout: 'Alice', stderr: '' };
      if (key === 'git config --get user.email') return { status: 1, stdout: '', stderr: '' };
      if (args[0] === 'config' && args[1] === '--global') {
        setCalls.push(args.slice());
        return { status: 0, stdout: '', stderr: '' };
      }
      return { status: 1, stdout: '', stderr: '' };
    };
    const rlMock = makeFakeReadline(['alice@example.com']);
    const logger = makeLogger();
    const res = await ensureIdentity({
      spawn,
      isTTY: true,
      logger,
      readlineImpl: rlMock,
      input: {},
      output: {},
    });
    assert.strictEqual(res.status, 'set');
    assert.strictEqual(res.name, 'Alice');
    assert.strictEqual(res.email, 'alice@example.com');
    assert.strictEqual(setCalls.length, 1);
    assert.deepStrictEqual(setCalls[0], ['config', '--global', 'user.email', 'alice@example.com']);
  });

  it('returns empty-input when user enters blank at prompts', async () => {
    const spawn = makeSpawn({});
    const rlMock = makeFakeReadline(['', '']);
    const logger = makeLogger();
    const res = await ensureIdentity({
      spawn,
      isTTY: true,
      logger,
      readlineImpl: rlMock,
      input: {},
      output: {},
    });
    assert.strictEqual(res.status, 'empty-input');
  });

  it('returns error status when git config set fails', async () => {
    const spawn = (cmd, args) => {
      const key = [cmd, ...args].join(' ');
      if (key === 'git config --get user.name') return { status: 1, stdout: '', stderr: '' };
      if (key === 'git config --get user.email') return { status: 1, stdout: '', stderr: '' };
      if (args[0] === 'config' && args[1] === '--global') {
        return { status: 128, stdout: '', stderr: 'permission denied' };
      }
      return { status: 1, stdout: '', stderr: '' };
    };
    const rlMock = makeFakeReadline(['Alice', 'alice@example.com']);
    const logger = makeLogger();
    const res = await ensureIdentity({
      spawn,
      isTTY: true,
      logger,
      readlineImpl: rlMock,
      input: {},
      output: {},
    });
    assert.strictEqual(res.status, 'error');
    assert.ok(/permission denied/.test(res.error));
  });
});

describe('Source-level integration (cli.js wires git-identity helper)', () => {
  const fs = require('fs');
  const path = require('path');
  const src = fs.readFileSync(
    path.join(__dirname, '..', 'src', 'cli.js'),
    'utf8'
  );

  it('cli.js init handler calls ensureIdentity', () => {
    assert.ok(
      /ensureIdentity\s*\(/.test(src),
      'cli.js should invoke ensureIdentity() from init'
    );
  });

  it('cli.js merge gate uses identityComplete + missingIdentityKeys', () => {
    assert.ok(
      /identityComplete\s*\(/.test(src) &&
        /missingIdentityKeys\s*\(/.test(src),
      'cli.js merge case should consult identity helpers'
    );
  });

  it('cli.js merge gate does not suggest GIT_AUTHOR_NAME env workaround', () => {
    // merge slice from "case 'merge'" up to the matching return statement.
    const m = src.match(/case 'merge':\s*\{[\s\S]*?\n\s{6}\}/);
    assert.ok(m, 'could not locate merge case block');
    assert.ok(
      !/GIT_AUTHOR_NAME/.test(m[0]),
      'merge case must not hint at GIT_AUTHOR_NAME env workaround'
    );
    assert.ok(
      !/GIT_AUTHOR_EMAIL/.test(m[0]),
      'merge case must not hint at GIT_AUTHOR_EMAIL env workaround'
    );
  });

  it('cli.js daemon start warns on missing identity', () => {
    const m = src.match(/case 'daemon':\s*\{[\s\S]*?\n\s{6}\}/);
    assert.ok(m, 'could not locate daemon case block');
    assert.ok(
      /missingIdentityKeys/.test(m[0]),
      'daemon case should call missingIdentityKeys for startup warning'
    );
  });
});
