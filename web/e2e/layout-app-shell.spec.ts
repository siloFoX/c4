import { expect, test } from 'playwright/test';

// App-shell layout centering (TODO 11.1080, v1.11.1098).
//
// Regression guard for the "content crowds to the top-left" bug:
// App.tsx now wraps the page content in a centered responsive
// container (`mx-auto max-w-6xl px-4`, data-testid
// "app-main-container"). On a wide viewport the column caps at
// 1152px (max-w-6xl) and gains symmetric side margins, so its left
// edge sits well inside the viewport. On narrow viewports the
// column uses full width, so mobile is unaffected.
//
// Auth handling: the dev daemon has auth ENABLED, so a plain
// navigate would land on the Login modal (no app-main-container).
// A single /api/** route handler fulfills /api/auth/status with
// { enabled: false } so useAuthState resolves to 'disabled' and
// App.tsx renders the dashboard chrome directly. /api/list and
// /api/events get empty payloads; every other /api call is ABORTED
// (a network error, not an HTTP 401, so it never trips the
// AUTH_EVENT that would flip the UI to the Login surface). A single
// handler avoids any route-precedence ambiguity -- auth/status is
// always fulfilled.

const LIST_BODY = JSON.stringify({
  workers: [],
  queuedTasks: [],
  lostWorkers: [],
});

async function stubApi(page: import('playwright/test').Page): Promise<void> {
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
    // Everything else: abort (network error, not 401) so the auth
    // machine stays 'disabled' and the layout renders.
    return route.abort();
  });
}

test.describe('app-shell layout centering', () => {
  test('centers the main content container on a 1440px viewport', async ({
    page,
  }) => {
    await stubApi(page);

    // Wide viewport: at 1440px the centered max-w-6xl (1152px)
    // column gains ~144px side margins.
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/');

    const container = page.locator('[data-testid="app-main-container"]');
    await expect(container).toBeVisible();

    // The centered container's left edge must sit well inside the
    // viewport (proving the column is centered, not flush-left).
    // Centered 1152px column on 1440px viewport -> left edge ~144px.
    const box = await container.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.x).toBeGreaterThan(120);

    // Sanity: the column must also be capped (not full-width) so the
    // centering is real. max-w-6xl = 1152px; allow slack for the
    // px-4 padding and sub-pixel rounding.
    expect(box!.width).toBeLessThanOrEqual(1200);

    // Screenshot the wide-viewport layout into test-results for
    // visual inspection (the dispatch mandates a 1440px capture).
    // `animations: 'disabled'` keeps the capture from waiting on the
    // route-progress / fade-in motion.
    await page.screenshot({
      path: 'test-results/layout-app-shell-1440.png',
      animations: 'disabled',
      timeout: 10_000,
    });
  });

  test('uses full width on a narrow mobile viewport', async ({ page }) => {
    await stubApi(page);

    // 375px phone viewport: the column should span (almost) the full
    // width -- only the px-4 (16px each side) inset applies, so the
    // left edge stays small and the width stays near the viewport.
    await page.setViewportSize({ width: 375, height: 720 });
    await page.goto('/');

    const container = page.locator('[data-testid="app-main-container"]');
    await expect(container).toBeVisible();

    const box = await container.boundingBox();
    expect(box).not.toBeNull();
    // No centering margins on mobile -- left edge hugs the viewport.
    expect(box!.x).toBeLessThan(40);
    // Column fills the viewport (minus the modest px-4 inset).
    expect(box!.width).toBeGreaterThan(330);
  });
});
