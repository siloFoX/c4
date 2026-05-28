import { expect, test } from 'playwright/test';

// MetricsBar 401 flood + polling backoff (TODO 11.1082, v1.11.1100).
//
// Before the fix MetricsBar polled /api/metrics every 5s and, on a
// persistent 401, kept hammering the daemon (and spamming the
// console) every interval. The fix stops polling after a 401 and
// surfaces a quiet needs-login strip (data-section
// "metrics-bar-needs-login"); the healthy interval is also raised
// from 5s to 20s with exponential backoff on transient errors.
//
// This spec intercepts /api/metrics -> 401, counts how many times
// it is requested, and asserts:
//   1. the needs-login strip renders, and
//   2. no more than 2 metrics requests fire in a 10s window (one
//      mount tick, plus at most one StrictMode double-invoke in
//      dev -- the loop must NOT keep firing every interval).
//
// Auth: a single /api/** route handler fulfills /api/auth/status
// with { enabled: false } so the dashboard renders, returns 401 for
// /api/metrics (the unit under test), serves empty /api/list +
// /api/events, and aborts everything else (network error, not 401,
// so no AUTH_EVENT login flip). The onboarding tour is suppressed
// via localStorage so it does not occlude the bar.

test.describe('MetricsBar 401 backoff', () => {
  test('stops polling on 401, shows needs-login, <= 2 requests in 10s', async ({
    page,
  }) => {
    test.setTimeout(40_000);

    await page.addInitScript(() => {
      try {
        window.localStorage.setItem('c4.onboardingTour.v1', 'seen');
      } catch {
        // ignore private-mode storage failures
      }
    });

    let metricsRequests = 0;
    await page.route('**/api/**', (route) => {
      const url = route.request().url();
      if (url.includes('/api/metrics')) {
        metricsRequests += 1;
        return route.fulfill({
          status: 401,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'unauthorized' }),
        });
      }
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
          body: JSON.stringify({
            workers: [],
            queuedTasks: [],
            lostWorkers: [],
          }),
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

    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/');

    // The quiet needs-login strip must render once the mount poll
    // gets its 401.
    const strip = page.locator('[data-section="metrics-bar-needs-login"]');
    await expect(strip).toBeVisible();
    await expect(strip).toContainText(/sign in/i);

    // Watch a full 10s window. With the old 5s loop this would fire
    // ~3 requests (0s, 5s, 10s); the fix must hold it at <= 2.
    await page.waitForTimeout(10_000);
    expect(metricsRequests).toBeLessThanOrEqual(2);

    // The strip must still be the needs-login state (no recovery
    // flicker back to the live bar without a successful poll).
    await expect(strip).toBeVisible();
  });
});
