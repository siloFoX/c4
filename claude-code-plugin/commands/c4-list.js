'use strict';

// /c4-list
//
// GET /list on the c4 daemon. Returns the raw payload as the daemon
// exposes it: `{workers, queuedTasks?, lostWorkers?}`.

const { getClient } = require('./_client');

async function handler(opts) {
  const input = opts || {};
  const env = input.env || process.env;

  const { client } = getClient({
    env,
    fetch: input.fetch,
    ClientClass: input.ClientClass,
    useSdk: input.useSdk,
    base: input.base,
    token: input.token,
  });

  const result = await client.listWorkers();
  return { ok: true, command: 'c4-list', result };
}

if (require.main === module) {
  handler({})
    .then((out) => { process.stdout.write(JSON.stringify(out, null, 2) + '\n'); })
    .catch((err) => {
      process.stderr.write((err && err.message ? err.message : String(err)) + '\n');
      process.exit(1);
    });
}

module.exports = { handler };
