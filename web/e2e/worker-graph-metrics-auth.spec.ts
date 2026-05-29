import { expect, test } from 'playwright/test';

// /api/metrics 401 flood from the per-row WorkerResourceGraph
// (TODO 11.1101, v1.11.1119).
//
// /api/metrics is auth-gated. 11.1086 made the MetricsBar poll
// (use-metrics) attach the session token, but a SECOND consumer --
// WorkerResourceGraph, mounted once per worker row in the sidebar --
// kept doing a bare `fetch('/api/metrics')` with no Authorization
// header and never stopped polling on failure. For a signed-in admin
// with any workers listed, every row's 5s poll 401'd, flooding the
// console (c4-qa saw 14 of 18 /api/metrics responses come back 401).
// (The dispatch blamed the service worker, but sw.ts is never
// registered -- registerServiceWorker is not called from main.tsx --
// so the SW cannot reissue anything. The real fix is in
// WorkerResourceGraph.)
//
// This spec runs as a signed-in admin (token seeded in localStorage),
// returns one worker from /api/list so a row + its graph mount, and
// gates /api/metrics on the Authorization header (401 without, 200
// with). It dwells past 3+ of the graph's 5s poll intervals and
// asserts ZERO /api/metrics responses came back 401, and that the
// metrics polls carried the session header. Screenshots the sidebar.

const TOKEN = 'test-admin-token-1101';

const METRICS_BODY = {
  daemon: {
    platform: 'linux',
    pid: 4242,
    uptimeSec: 3600,
    rssKb: 102400,
    heapUsedKb: 51200,
    heapTotalKb: 81920,
    cpus: 8,
    loadavg: [0.5, 0.6, 0.7],
  },
  workers: [
    { name: 'auto-w1', pid: 12345, status: 'idle', cpuPct: 12, rssKb: 51200, threads: 7 },
  ],
  totals: { liveWorkers: 1, totalWorkers: 1, totalRssKb: 51200, totalCpuPct: 12 },
};

const WORKER = {
  name: 'auto-w1',
  command: 'claude',
  target: 'local',
  branch: 'c4/auto-w1',
  worktree: '/root/c4-worktree-auto-w1',
  parent: null,
  scope: false,
  pid: 12345,
  status: 'idle',
  unreadSnapshots: 0,
  totalSnapshots: 0,
  intervention: null,
  lastQuestion: null,
  errorCount: 0,
  phase: null,
  testFailCount: 0,
  tier: 'worker',
};

test('per-row metrics poll never 401s for a signed-in admin', async ({ page }) => {
  test.setTimeout(60_000);

  const metricsResponses: Array<{ status: number }> = [];
  const metricsAuthHeaders: Array<string | undefined> = [];

  await page.addInitScript((token) => {
    try {
      localStorage.setItem('c4.authToken', token);
      localStorage.setItem('c4.authUser', 'admin');
      localStorage.setItem('c4.authRole', 'admin');
      localStorage.setItem('c4.onboardingTour.v1', 'seen');
    } catch {
      /* ignore */
    }
  }, TOKEN);

  page.on('request', (req) => {
    if (req.url().includes('/api/metrics')) {
      metricsAuthHeaders.push(req.headers()['authorization']);
    }
  });
  page.on('response', (res) => {
    if (res.url().includes('/api/metrics')) {
      metricsResponses.push({ status: res.status() });
    }
  });

  await page.route('**/api/**', (route) => {
    const req = route.request();
    const url = req.url();
    const auth = req.headers()['authorization'];
    const json = (body: unknown, status = 200) =>
      route.fulfill({
        status,
        contentType: 'application/json',
        body: JSON.stringify(body),
      });

    if (url.includes('/api/auth/status')) return json({ enabled: true });
    if (url.includes('/api/metrics')) {
      // Gate on the session header: 401 without it (the bug), 200 with.
      if (!auth) return json({ error: 'unauthorized' }, 401);
      return json(METRICS_BODY);
    }
    if (url.includes('/api/list')) {
      return json({ workers: [WORKER], queuedTasks: [], lostWorkers: [] });
    }
    if (url.includes('/api/events')) {
      return route.fulfill({
        status: 200,
        contentType: 'text/event-stream',
        body: 'event: connected\ndata: {"type":"connected"}\n\n',
      });
    }
    return json({});
  });

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  await page.locator('header').first().waitFor({ state: 'visible', timeout: 20_000 });

  // The worker row's resource graph must actually mount -- otherwise the
  // tokenless poll under test never fires and the assertion is hollow.
  await expect(page.getByTestId('worker-resource-graph').first()).toBeVisible({
    timeout: 20_000,
  });

  // Dwell past 3+ of the graph's 5s poll intervals (t=0,5,10,15s).
  await page.waitForTimeout(16_000);

  await page.screenshot({
    path: 'test-results/worker-graph-metrics-auth.png',
    animations: 'disabled',
    timeout: 10_000,
  });

  const status401 = metricsResponses.filter((r) => r.status === 401);
  expect(metricsResponses.length).toBeGreaterThan(0);
  expect(
    status401.length,
    `${status401.length} of ${metricsResponses.length} /api/metrics responses were 401`,
  ).toBe(0);
  // The polls carried the session header (the whole point of the fix).
  expect(
    metricsAuthHeaders.some((h) => typeof h === 'string' && h.length > 0),
  ).toBe(true);
});
