'use strict';

// /c4-close <name>
//
// POST /close on the c4 daemon. Tears down the worker PTY + worktree.

const { getClient } = require('./_client');

async function handler(opts) {
  const input = opts || {};
  const args = input.args || {};
  const env = input.env || process.env;

  const positional = Array.isArray(args._) ? args._ : [];
  const name = args.name || positional[0];
  if (!name || typeof name !== 'string') {
    const err = new Error('c4-close: name is required');
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

  const result = await client.close(name);
  return { ok: true, command: 'c4-close', name, result };
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
