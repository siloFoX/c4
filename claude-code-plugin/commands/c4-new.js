'use strict';

// /c4-new <name> [--target local|dgx] [--parent <parent>] [--command <cmd>]
//
// POST /create on the c4 daemon. Tests import { handler } and drive it
// directly with stub fetch; the CLI entry at the bottom is for the
// slash-command Bash invocation and argv parsing.

const { getClient } = require('./_client');

async function handler(opts) {
  const input = opts || {};
  const args = input.args || {};
  const env = input.env || process.env;

  const positional = Array.isArray(args._) ? args._ : [];
  const name = args.name || positional[0];
  if (!name || typeof name !== 'string') {
    const err = new Error('c4-new: name is required');
    err.code = 'MISSING_ARG';
    err.argName = 'name';
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

  const createOpts = {};
  if (args.target) createOpts.target = args.target;
  if (args.cwd) createOpts.cwd = args.cwd;
  if (args.parent) createOpts.parent = args.parent;
  if (args.command) createOpts.command = args.command;
  if (Array.isArray(args.args)) createOpts.args = args.args;

  const result = await client.createWorker(name, createOpts);
  return { ok: true, command: 'c4-new', name, sent: createOpts, result };
}

if (require.main === module) {
  const { parseArgv } = require('./_argv');
  const parsed = parseArgv(process.argv.slice(2), { positional: ['name'] });
  handler({ args: parsed })
    .then((out) => { process.stdout.write(JSON.stringify(out, null, 2) + '\n'); })
    .catch((err) => {
      process.stderr.write((err && err.message ? err.message : String(err)) + '\n');
      process.exit(1);
    });
}

module.exports = { handler };
