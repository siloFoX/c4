'use strict';

// c4-sdk basic example (TODO 9.3)
//
// Walks through the typical spawn -> task -> wait -> read -> close
// lifecycle against a running c4 daemon. Run it with:
//
//   node sdk/examples/basic.js
//
// Pre-reqs:
//   - c4 daemon running on http://localhost:3456 (c4 daemon start)
//   - If auth is enabled, export C4_TOKEN with a JWT from POST /auth/login
//
// Tweak WORKER / TASK below to exercise your own flow.

const { C4Client, C4Error } = require('..');

const WORKER = process.env.C4_WORKER || 'sdk-demo';
const TASK = process.env.C4_TASK || 'echo "hello from c4-sdk" > hello.txt';

async function main() {
  const c4 = new C4Client({
    base: process.env.C4_BASE || 'http://localhost:3456',
    token: process.env.C4_TOKEN || null,
  });

  const health = await c4.health();
  console.log('[health]', health);

  const existing = await c4.getWorker(WORKER);
  if (!existing) {
    console.log('[create]', WORKER);
    const created = await c4.createWorker(WORKER, { target: 'local' });
    console.log('[created]', created);
  } else {
    console.log('[reuse]', existing.name, existing.status);
  }

  console.log('[task]', TASK);
  const taskRes = await c4.sendTask(WORKER, TASK, { autoMode: true });
  console.log('[task queued]', taskRes);

  // Stream worker output while we wait. The watch iterator yields decoded
  // SSE events; use controller.abort() (or break) to stop.
  const controller = new AbortController();
  const watchTimer = setTimeout(() => controller.abort(), 60_000);

  (async () => {
    try {
      for await (const ev of c4.watch(WORKER, { signal: controller.signal })) {
        if (ev.type === 'output') process.stdout.write(ev.dataText || '');
        else console.log('[event]', ev);
      }
    } catch (err) {
      if (!(err instanceof Error) || !/abort/i.test(err.message)) {
        console.error('[watch error]', err);
      }
    }
  })();

  // Wait for the worker to return to idle, then read the final output.
  const final = await c4.readOutput(WORKER, { wait: true, timeoutMs: 60_000 });
  console.log('\n[final output]', (final.output || '').slice(-400));
  clearTimeout(watchTimer);
  controller.abort();

  // Optional: close the worker when done. Comment out to keep it alive.
  const closed = await c4.close(WORKER);
  console.log('[closed]', closed);
}

main().catch((err) => {
  if (err instanceof C4Error) {
    console.error(`C4 API error (${err.status}):`, err.message, err.body);
  } else {
    console.error(err);
  }
  process.exit(1);
});
