import { expect, test } from 'playwright/test';

// Help/onboarding panel first-run gating (TODO 11.1099, v1.11.1117).
//
// The Sessions onboarding tour auto-opened over page content on view
// load. Its first-run flag (localStorage 'sessions-tour-v1') was only
// written on dismiss, so a user who saw it but navigated away without
// dismissing got it re-opened every visit. It now writes the flag on
// the first auto-open, so it opens AT MOST ONCE and never re-opens
// automatically; a visible "Tour" control reopens it manually.
//
// This spec loads Sessions with the flag cleared (asserts the tour
// auto-opens) and set (asserts it does NOT auto-open), plus a reload
// after the first auto-open (asserts it does not re-open -- the flag
// was written on open, not just dismiss). Screenshots both states.

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

const SESSION_TOUR_KEY = 'sessions-tour-v1';

async function stubApi(
  page: import('playwright/test').Page,
  opts: { tourSeen: boolean },
): Promise<void> {
  await page.addInitScript(
    ([seen, key]) => {
      try {
        // Dismiss the global onboarding tour so only the Sessions tour
        // is under test, and land on Sessions.
        localStorage.setItem('c4.onboardingTour.v1', 'seen');
        localStorage.setItem('c4.topView', 'sessions');
        // Only SET the flag for the "already seen" case. For the
        // first-run case leave it absent (fresh context) -- do NOT
        // remove it on every load, or the reload would wipe the flag the
        // hook wrote on the first auto-open and defeat the persistence
        // check.
        if (seen) localStorage.setItem(key as string, 'seen');
      } catch {
        /* ignore */
      }
    },
    [opts.tourSeen, SESSION_TOUR_KEY] as const,
  );
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
    if (url.includes('/api/sessions')) return json({ groups: [], total: 0 });
    if (url.includes('/api/attach/list')) return json({ attached: [] });
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

const tour = (page: import('playwright/test').Page) =>
  page.locator('[data-section="sessions-tour"]');

test.describe('sessions tour first-run gating', () => {
  test('auto-opens on the first visit (flag cleared), then not after reload', async ({
    page,
  }) => {
    await stubApi(page, { tourSeen: false });
    await page.setViewportSize({ width: 768, height: 1024 });
    await page.goto('/');

    // First run: the tour auto-opens over the Sessions content.
    await expect(tour(page)).toBeVisible({ timeout: 10_000 });
    await page.screenshot({
      path: 'test-results/help-drawer-firstrun-open.png',
      animations: 'disabled',
      timeout: 10_000,
    });

    // The first-run flag was written on open (not just on dismiss), so a
    // reload (without ever dismissing) must NOT re-auto-open the tour.
    await page.reload();
    await expect(page.locator('[data-testid="sessions-tour-reopen"]')).toBeVisible({
      timeout: 10_000,
    });
    await expect(tour(page)).toHaveCount(0);
  });

  test('does not auto-open on a later visit (flag set)', async ({ page }) => {
    await stubApi(page, { tourSeen: true });
    await page.setViewportSize({ width: 768, height: 1024 });
    await page.goto('/');

    // The manual reopen control is present, but the tour is not auto-open.
    await expect(page.locator('[data-testid="sessions-tour-reopen"]')).toBeVisible({
      timeout: 10_000,
    });
    await expect(tour(page)).toHaveCount(0);

    await page.screenshot({
      path: 'test-results/help-drawer-firstrun-closed.png',
      animations: 'disabled',
      timeout: 10_000,
    });

    // The manual control reopens it on demand.
    await page.locator('[data-testid="sessions-tour-reopen"]').click();
    await expect(tour(page)).toBeVisible({ timeout: 10_000 });
  });
});
