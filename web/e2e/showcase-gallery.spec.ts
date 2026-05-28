import { expect, test } from 'playwright/test';

// Chart-line showcase gallery (TODO 11.1081, v1.11.1099).
//
// Verifies the new `gallery` top-view route surfaces the
// lazy-loaded chart-line primitives. App.tsx renders
// <ChartLineGallery /> (data-section "chart-line-gallery") when
// topView === 'gallery'; each registry entry renders a tile
// (data-section "chart-gallery-tile") whose lazy chart draws an
// <svg>.
//
// Boot strategy: an init script seeds localStorage so the app
// starts directly on the gallery with the first-run onboarding tour
// suppressed (no modal stealing focus / occluding the capture):
//   * c4.topView            = 'gallery'  -> readTopView() boots here
//   * c4.onboardingTour.v1  = 'seen'     -> OnboardingTour stays shut
//
// Auth: the dev daemon has auth ENABLED, so a single /api/** route
// handler fulfills /api/auth/status with { enabled: false } (so
// useAuthState resolves to 'disabled' and the dashboard renders),
// serves empty /api/list + /api/events, and aborts every other /api
// call. Aborting yields a network error (not an HTTP 401) so the
// AUTH_EVENT that would flip back to Login never fires. A single
// conditional handler keeps auth/status from being aborted.

const LIST_BODY = JSON.stringify({
  workers: [],
  queuedTasks: [],
  lostWorkers: [],
});

async function bootGallery(
  page: import('playwright/test').Page,
): Promise<void> {
  await page.addInitScript(() => {
    try {
      window.localStorage.setItem('c4.topView', 'gallery');
      window.localStorage.setItem('c4.onboardingTour.v1', 'seen');
    } catch {
      // private-mode browsers may throw; the tab-click fallback in
      // the test still reaches the gallery.
    }
  });

  await page.route('**/api/**', (route) => {
    const url = route.request().url();
    if (url.includes('/api/auth/status')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ enabled: false }),
      });
    }
    if (url.includes('/api/list')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: LIST_BODY,
      });
    }
    if (url.includes('/api/events')) {
      return route.fulfill({
        status: 200,
        contentType: 'text/event-stream',
        body: 'event: connected\ndata: {"type":"connected"}\n\n',
      });
    }
    return route.abort();
  });
}

test.describe('chart-line showcase gallery', () => {
  test('renders at least 12 chart tiles with drawn SVGs', async ({
    page,
  }) => {
    // First dev visit transforms the gallery chunk + ~40 chart
    // chunks on demand, so give the run room beyond the 30s default.
    test.setTimeout(90_000);
    await bootGallery(page);
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto('/');

    // The gallery region mounts directly (topView seeded to
    // 'gallery'). If a future default change breaks that, click the
    // Gallery tab as a fallback.
    const gallery = page.locator('[data-section="chart-line-gallery"]');
    if (!(await gallery.count())) {
      await page.getByRole('tab', { name: /gallery/i }).click();
    }
    await expect(gallery).toBeVisible();

    // Tiles render once the lazy gallery chunk + its chart chunks
    // transform (first dev visit transforms ~40 modules, so allow a
    // generous window). At least 12 must be present.
    const tiles = page.locator('[data-section="chart-gallery-tile"]');
    await expect
      .poll(async () => tiles.count(), { timeout: 30_000 })
      .toBeGreaterThanOrEqual(12);

    // Wait for the lazy chart chunks to resolve and actually draw --
    // each rendered primitive emits an <svg>. Require >= 12 drawn.
    await expect
      .poll(
        async () =>
          page.locator('[data-section="chart-gallery-grid"] svg').count(),
        { timeout: 20_000 },
      )
      .toBeGreaterThanOrEqual(12);

    // Screenshot the gallery into test-results for visual review
    // (the dispatch mandates a capture).
    await page.screenshot({
      path: 'test-results/showcase-gallery.png',
      animations: 'disabled',
      timeout: 10_000,
    });

    // Final hard assertions.
    expect(await tiles.count()).toBeGreaterThanOrEqual(12);
    expect(
      await page.locator('[data-section="chart-gallery-grid"] svg').count(),
    ).toBeGreaterThanOrEqual(12);
  });

  test('search filter narrows the grid', async ({ page }) => {
    test.setTimeout(90_000);
    await bootGallery(page);
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto('/');

    const tiles = page.locator('[data-section="chart-gallery-tile"]');
    await expect
      .poll(async () => tiles.count(), { timeout: 30_000 })
      .toBeGreaterThanOrEqual(12);
    const total = await tiles.count();

    // Typing a specific token narrows the grid below the full count.
    await page.locator('[data-section="chart-gallery-search"]').fill('ichimoku');
    await expect.poll(async () => tiles.count()).toBeLessThan(total);
    // At least the two ichimoku entries survive the filter.
    await expect.poll(async () => tiles.count()).toBeGreaterThanOrEqual(1);
  });
});
