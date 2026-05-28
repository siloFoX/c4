import { expect, test } from 'playwright/test';

// Skeleton loading states (TODO 11.1087, v1.11.1105).
//
// Scoped to the two real gaps from the functional audit:
//   1. The Features > Workers hero showed zero-value count tiles (a
//      literal 0) during the first /api/list poll. It now shows
//      skeleton stat tiles until the poll settles.
//   2. ChartLineGallery's lazy tiles fell back to a static
//      "Loading chart..." line; they now show an animated Skeleton
//      while each chunk mounts.
//
// Each test throttles the relevant response so the skeleton is visible
// long enough to assert + screenshot, then verifies the loading
// placeholder renders. Auth is stubbed disabled so the dashboard
// chrome renders without a login.

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

interface StubOpts {
  topView: string;
  throttleListMs?: number;
}

async function stubCommon(
  page: import('playwright/test').Page,
  opts: StubOpts,
): Promise<void> {
  await page.addInitScript((tv) => {
    try {
      localStorage.setItem('c4.topView', tv);
      localStorage.setItem('c4.onboardingTour.v1', 'seen');
    } catch {
      /* ignore */
    }
  }, opts.topView);

  await page.route('**/api/**', async (route) => {
    const url = route.request().url();
    const json = (body: unknown, status = 200) =>
      route.fulfill({
        status,
        contentType: 'application/json',
        body: JSON.stringify(body),
      });
    if (url.includes('/api/auth/status')) return json({ enabled: false });
    if (url.includes('/api/metrics')) return json(METRICS_BODY);
    if (url.includes('/api/events')) {
      return route.fulfill({
        status: 200,
        contentType: 'text/event-stream',
        body: 'event: connected\ndata: {"type":"connected"}\n\n',
      });
    }
    if (url.includes('/api/list')) {
      // Throttle so the Workers hero skeleton stays visible.
      if (opts.throttleListMs) {
        await new Promise((r) => setTimeout(r, opts.throttleListMs));
      }
      return json({ workers: [], queuedTasks: [], lostWorkers: [] });
    }
    // Everything else: empty success object.
    return json({});
  });
}

test('Features Workers hero shows skeleton stat tiles while /api/list loads', async ({
  page,
}) => {
  test.setTimeout(45_000);
  await stubCommon(page, { topView: 'features', throttleListMs: 4000 });

  // topView=features (localStorage) + the feature hash select the
  // Workers hero page.
  await page.goto('/#/feature/workers-hero');

  const skeleton = page
    .locator('[data-section="workers-hero-count-skeleton"]')
    .first();
  await expect(skeleton).toBeVisible({ timeout: 12_000 });

  // While the skeleton shows, the real count tiles are NOT present.
  await expect(page.getByTestId('workers-hero-count-busy')).toHaveCount(0);

  await page.screenshot({
    path: 'test-results/loading-skeleton-workers.png',
    animations: 'disabled',
    timeout: 10_000,
  });

  // Once the throttled /api/list response resolves, the real count
  // tiles replace the skeletons.
  await expect(page.getByTestId('workers-hero-count-busy')).toBeVisible({
    timeout: 15_000,
  });
});

test('Chart gallery shows skeleton tiles while lazy charts mount', async ({
  page,
}) => {
  test.setTimeout(60_000);
  await stubCommon(page, { topView: 'gallery' });

  // Throttle the lazy chart-line module requests so the per-tile
  // skeletons stay visible long enough to assert + screenshot.
  await page.route('**/chart-line-**', async (route) => {
    await new Promise((r) => setTimeout(r, 3000));
    return route.continue();
  });

  await page.goto('/');

  const skeleton = page
    .locator('[data-section="chart-gallery-tile-skeleton"]')
    .first();
  await expect(skeleton).toBeVisible({ timeout: 20_000 });

  await page.screenshot({
    path: 'test-results/loading-skeleton-gallery.png',
    animations: 'disabled',
    timeout: 10_000,
  });
});
