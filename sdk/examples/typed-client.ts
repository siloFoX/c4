// Example: typed C4 client usage.
// Generate the client with `c4 openapi --sdk > sdk/c4-client.ts`,
// then import it like below.

import { C4Client, C4ApiError } from '../c4-client';

async function main() {
  const c4 = new C4Client({
    baseUrl: 'http://127.0.0.1:3456',
    retries: 2,            // exponential 2^n * 200ms backoff between attempts
    backoffMs: 200,
  });

  // 1) Login. Auth is optional — when the daemon has auth disabled,
  // every endpoint is open and the token here is ignored.
  try {
    const auth = await c4.postAuthLogin({ user: 'admin', password: 'admin123' });
    if (auth.token) c4.setToken(auth.token);
    console.log(`logged in as ${auth.user} (role: ${auth.role})`);
  } catch (e) {
    if (e instanceof C4ApiError && e.status === 401) {
      console.warn('auth disabled — proceeding without token');
    } else {
      throw e;
    }
  }

  // 2) Daemon snapshot.
  const health = await c4.getHealth();
  console.log(`daemon v${health.version} — ${health.workers} workers`);

  // 3) CPU/RSS metrics.
  const m = await c4.getMetrics();
  console.log(`daemon pid ${m.daemon} (typed as unknown — see m.daemon below)`);
  console.log(`live workers: ${m.totals}`);

  // 4) Spawn a worker + send it a task.
  const created = await c4.postCreate({
    name: 'demo-worker',
    target: 'local',
    tier: 'worker',
  });
  console.log('created:', created);

  const taskResult = await c4.postTask({
    name: 'demo-worker',
    task: 'List the files in src/',
    autoMode: false,
  });
  console.log('task queued:', taskResult);

  // 5) Read scrollback (typed query params).
  const scroll = await c4.getScrollback({ name: 'demo-worker', lines: 50 });
  console.log(`scrollback: ${scroll.lines} lines`);

  // 6) Audit log query with typed filters.
  const audit = await c4.getAuditQuery({
    type: 'worker.created',
    limit: 10,
  });
  console.log(`recent worker.created events: ${audit.events?.length ?? 0}`);

  // 7) Cleanup.
  await c4.postClose({ name: 'demo-worker' });
  console.log('closed demo-worker');
}

main().catch((e) => {
  if (e instanceof C4ApiError) {
    console.error(`API error ${e.status}: ${e.statusText}`);
    console.error('body:', e.body);
    if (e.operationId) console.error('operationId:', e.operationId);
  } else {
    console.error(e);
  }
  process.exit(1);
});
