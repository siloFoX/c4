'use strict';

// /c4-merge <name> [--skip-checks]
//
// POST /merge on the c4 daemon. Forwards `skipChecks` only when the
// operator explicitly opted in (the daemon's pre-merge guardrails
// stay on by default).

const { getClient } = require('./_client');

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
    const err = new Error('c4-merge: name is required');
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

  const mergeOpts = {};
  if ('skipChecks' in args) mergeOpts.skipChecks = toBool(args.skipChecks);
  else if ('skip-checks' in args) mergeOpts.skipChecks = toBool(args['skip-checks']);

  const result = await client.merge(name, mergeOpts);
  return { ok: true, command: 'c4-merge', name, sent: mergeOpts, result };
}

if (require.main === module) {
  const { parseArgv } = require('./_argv');
  const parsed = parseArgv(process.argv.slice(2), {
    positional: ['name'],
    boolFlags: ['skip-checks', 'skipChecks'],
  });
  handler({ args: parsed })
    .then((out) => { process.stdout.write(JSON.stringify(out, null, 2) + '\n'); })
    .catch((err) => {
      process.stderr.write((err && err.message ? err.message : String(err)) + '\n');
      process.exit(1);
    });
}

module.exports = { handler };
