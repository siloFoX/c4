import { expect, test } from 'playwright/test';

// Gallery render crash (TODO 11.1100, v1.11.1118).
//
// ChartLineMomentum (and any sibling chart-line-* with an unguarded
// .reduce/.map on a missing data/series prop) threw during render and
// tripped the per-tile UIErrorBoundary ("Chart failed"). This spec opens
// the gallery, waits for every lazy tile to mount, and asserts there are
// zero uncaught page errors and no UIErrorBoundary fallback tiles, and
// screenshots the grid.

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

async function stubApi(page: import('playwright/test').Page): Promise<void> {
  await page.addInitScript(() => {
    try {
      localStorage.setItem('c4.topView', 'gallery');
      localStorage.setItem('c4.onboardingTour.v1', 'seen');
    } catch {
      /* ignore */
    }
  });
  await page.route('**/api/**', (route) => {
    const url = route.request().url();
    const json = (body: unknown, status = 200) =>
      route.fulfill({
        status,
        contentType: 'application/json',
        body: JSON.stringify(body),
      });
    if (url.includes('/api/auth/status')) return json({ enabled: false });
    if (url.includes('/api/metrics')) return json(METRICS_BODY);
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
    return json({});
  });
}

test('gallery renders all tiles without a crash', async ({ page }) => {
  test.setTimeout(120_000);

  const pageErrors: string[] = [];
  page.on('pageerror', (err) => pageErrors.push(err.message));

  await stubApi(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');

  // Gallery grid is present.
  await expect(page.locator('[data-section="chart-gallery-grid"]')).toBeVisible({
    timeout: 30_000,
  });

  // Wait for every lazy tile chunk to finish mounting (no skeleton left).
  await expect
    .poll(
      async () =>
        page.locator('[data-section="chart-gallery-tile-skeleton"]').count(),
      { timeout: 90_000, intervals: [1000] },
    )
    .toBe(0);

  // Enumerate any tiles whose UIErrorBoundary fell back to "Chart failed".
  const failed = await page.evaluate(() => {
    const ids: string[] = [];
    document.querySelectorAll('[data-section="chart-gallery-tile"]').forEach((tile) => {
      if ((tile.textContent || '').includes('Chart failed')) {
        ids.push(tile.getAttribute('data-chart-id') || '(unknown)');
      }
    });
    return ids;
  });

  await page.screenshot({
    path: 'test-results/gallery-no-crash-1440.png',
    animations: 'disabled',
    timeout: 10_000,
  });

  expect(failed, `tiles that crashed: ${failed.join(', ')}`).toEqual([]);
  expect(pageErrors, `page errors:\n${pageErrors.join('\n')}`).toEqual([]);
});
