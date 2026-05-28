import { expect, test } from 'playwright/test';

// Console-error sweep on main routes (TODO 11.1086, v1.11.1104).
//
// Visits the root (Workers) plus two main navigation destinations
// (History, Autonomous), collects console errors + uncaught page
// errors across all three, and asserts the count is zero.
//
// Regression guard for the dominant offender -- the MetricsBar
// /api/metrics poll 401-ing on every view because it omitted the
// session header the other /api endpoints send. This spec runs as a
// signed-in admin (a token is seeded in localStorage so the app
// resolves to 'authed' and apiFetch attaches Authorization) and the
// /api/metrics stub returns 401 UNLESS the request carries that
// Authorization header. So the pre-fix bare `fetch('/api/metrics')`
// (no header) gets a 401 -> a failed-resource console error -> this
// test fails; the fixed poll attaches the token -> 200 -> clean. The
// test also asserts directly that at least one /api/metrics request
// carried the Authorization header.

const TOKEN = 'test-admin-token-1086';

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
  workers: [],
  totals: { liveWorkers: 0, totalWorkers: 0, totalRssKb: 0, totalCpuPct: 0 },
};

const DIGEST_BODY = {
  windowMs: 86400000,
  from: '2026-05-27T00:00:00.000Z',
  to: '2026-05-28T00:00:00.000Z',
  paused: false,
  dispatched: 10,
  succeeded: 9,
  halted: 0,
  dispatchErrors: 1,
  successRate: 0.9,
  pendingEscalations: 0,
  resolvedEscalations: 3,
};

async function setup(
  page: import('playwright/test').Page,
  metricsRequests: Array<Record<string, string>>,
): Promise<void> {
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
      metricsRequests.push(req.headers());
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
      return json({ workers: [], queuedTasks: [], lostWorkers: [] });
    }
    if (url.includes('/api/events')) {
      return route.fulfill({
        status: 200,
        contentType: 'text/event-stream',
        body: 'event: connected\ndata: {"type":"connected"}\n\n',
      });
    }
    if (url.includes('/api/history')) {
      return json({ records: [], workers: [], total: 0 });
    }
    if (url.includes('/api/autonomous/status')) return json({ enabled: true });
    if (url.includes('/api/autonomous/digest')) return json(DIGEST_BODY);
    if (url.includes('/api/autonomous/escalations')) {
      return json({ count: 0, escalations: [] });
    }
    // Everything else (nav-badge polls etc.): empty success object.
    return json({});
  });
}

async function visit(
  page: import('playwright/test').Page,
  topView: string | null,
): Promise<void> {
  if (topView) {
    await page.evaluate((v) => {
      try {
        localStorage.setItem('c4.topView', v);
      } catch {
        /* ignore */
      }
    }, topView);
  }
  await page.goto('/');
  await page.locator('header').first().waitFor({ state: 'visible', timeout: 20_000 });
  // Let mount-time fetches (metrics poll, nav-badge polls, view data)
  // fire and settle so any console error they would raise is captured.
  await page.waitForTimeout(2000);
}

test('main routes are free of console + page errors', async ({ page }) => {
  test.setTimeout(60_000);

  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];
  const metricsRequests: Array<Record<string, string>> = [];

  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });
  page.on('pageerror', (err) => {
    pageErrors.push(err.message);
  });

  await setup(page, metricsRequests);

  await visit(page, null); // root -> Workers
  await visit(page, 'history'); // destination 1
  await visit(page, 'autonomous'); // destination 2

  // Direct regression guard: the metrics poll must carry the session
  // header (the whole point of the fix).
  expect(metricsRequests.length).toBeGreaterThan(0);
  expect(
    metricsRequests.some((h) => typeof h['authorization'] === 'string' && h['authorization'].length > 0),
  ).toBe(true);

  // The mandated assertion: zero console errors and zero page errors
  // across the three routes.
  expect(
    { consoleErrors, pageErrors },
    `console errors:\n${consoleErrors.join('\n')}\n\npage errors:\n${pageErrors.join('\n')}`,
  ).toEqual({ consoleErrors: [], pageErrors: [] });
});
