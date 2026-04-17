'use strict';

// /c4-task <name> <task> [--auto-mode] [--branch <branch>] [--reuse]
//
// POST /task on the c4 daemon. Accepts every option the daemon /task
// route understands; forwards only the fields that were set so the
// daemon default stays in charge of the rest.

const { getClient } = require('./_client');

const PASSTHROUGH_KEYS = [
  'branch',
  'useBranch',
  'useWorktree',
  'projectRoot',
  'cwd',
  'scope',
  'scopePreset',
  'after',
  'command',
  'target',
  'contextFrom',
  'reuse',
  'profile',
  'autoMode',
  'budgetUsd',
  'maxRetries',
];

function toBool(v) {
  if (typeof v === 'boolean') return v;
  if (typeof v === 'string') {
    const s = v.toLowerCase();
    if (s === 'true' || s === '1' || s === 'yes') return true;
    if (s === 'false' || s === '0' || s === 'no') return false;
  }
  return Boolean(v);
}

async function handler(opts) {
  const input = opts || {};
  const args = input.args || {};
  const env = input.env || process.env;

  const positional = Array.isArray(args._) ? args._ : [];
  const name = args.name || positional[0];
  if (!name || typeof name !== 'string') {
    const err = new Error('c4-task: name is required');
    err.code = 'MISSING_ARG';
    err.argName = 'name';
    throw err;
  }

  let task = args.task;
  if (!task) {
    const tail = positional.slice(1);
    if (tail.length > 0) task = tail.join(' ');
  }
  if (!task || typeof task !== 'string') {
    const err = new Error('c4-task: task is required');
    err.code = 'MISSING_ARG';
    err.argName = 'task';
    throw err;
  }

  const { client } = getClient({
    env,
    fetch: input.fetch,
    ClientClass: input.ClientClass,
    useSdk: input.useSdk,
    base: input.base,
    token: input.token,
  });

  const sendOpts = {};
  if ('autoMode' in args) sendOpts.autoMode = toBool(args.autoMode);
  else if ('auto-mode' in args) sendOpts.autoMode = toBool(args['auto-mode']);
  if ('reuse' in args) sendOpts.reuse = toBool(args.reuse);
  if ('useBranch' in args) sendOpts.useBranch = toBool(args.useBranch);
  if ('useWorktree' in args) sendOpts.useWorktree = toBool(args.useWorktree);

  for (const k of PASSTHROUGH_KEYS) {
    if (k in sendOpts) continue;
    if (k in args && args[k] !== undefined && args[k] !== null) {
      sendOpts[k] = args[k];
    }
  }

  const result = await client.sendTask(name, task, sendOpts);
  return { ok: true, command: 'c4-task', name, task, sent: sendOpts, result };
}

if (require.main === module) {
  const { parseArgv } = require('./_argv');
  const parsed = parseArgv(process.argv.slice(2), {
    positional: ['name'],
    boolFlags: ['auto-mode', 'autoMode', 'reuse', 'useBranch', 'useWorktree'],
  });
  handler({ args: parsed })
    .then((out) => { process.stdout.write(JSON.stringify(out, null, 2) + '\n'); })
    .catch((err) => {
      process.stderr.write((err && err.message ? err.message : String(err)) + '\n');
      process.exit(1);
    });
}

module.exports = { handler };
