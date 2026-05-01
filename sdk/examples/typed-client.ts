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

  // 3) CPU/RSS metrics. v1.10.24+ types the response richly:
  //    m.daemon.pid / .rssKb / .uptimeSec / etc
  //    m.workers[i].name / .status / .cpuPct
  //    m.totals.liveWorkers / .totalRssKb
  const m = await c4.getMetrics();
  console.log(`daemon pid ${m.daemon?.pid} — uptime ${m.daemon?.uptimeSec}s`);
  console.log(`live workers: ${m.totals?.liveWorkers} / ${m.totals?.totalWorkers}`);

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
  // Response shape (v1.10.28+): { content, lines, totalScrollback }.
  const scroll = await c4.getScrollback({ name: 'demo-worker', lines: 50 });
  console.log(`scrollback: ${scroll.lines}/${scroll.totalScrollback} lines`);

  // 6) Audit log query with typed filters.
  const audit = await c4.getAuditQuery({
    type: 'worker.created',
    limit: 10,
  });
  console.log(`recent worker.created events: ${audit.events?.length ?? 0}`);

  // 7) Stream events for a few seconds to demonstrate SSE.
  console.log('streaming events for 3 seconds…');
  const eventStream = c4.getEvents();
  const tail = setTimeout(() => eventStream.return(undefined), 3000);
  for await (const ev of eventStream) {
    console.log(`  [${ev.type}]`, ev.data);
  }
  clearTimeout(tail);

  // 8) Cleanup.
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
