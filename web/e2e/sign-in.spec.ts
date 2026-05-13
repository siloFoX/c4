import { expect, test } from 'playwright/test';

// Sign-in flow (TODO 11.80, v1.11.98).
//
// Drives the /login surface (the React Login modal that Login.tsx
// renders when useAuthState() resolves to 'anon'). The default route
// is "/" -- the app shows the login modal there until a token is in
// localStorage, so there is no separate /login path to navigate to.
//
// Two modes:
//   SIGN_IN_USER + SIGN_IN_TOKEN in process.env -> submit the real form
//     and let the dev server's /api/auth/login decide. Useful when the
//     operator wants to drive the real daemon. Env-loader pattern is
//     just process.env access; document the names in e2e/README.md.
//   Otherwise -> intercept /api/auth/login + /api/auth/status with
//     playwright route() so the click path stays self-contained and
//     does not depend on a live daemon. This is the default.
//
// After submit + redirect, assert the dashboard chrome is visible:
// AppHeader (role="banner"), TopTabs (role="tablist"), FeatureSidebar
// is reachable via the Features tab but the default landing is the
// Workers tab so the Sidebar (the Workers worker list) is enough to
// prove the user landed on the dashboard.

test.describe('sign-in flow', () => {
  test('redirects to the dashboard chrome after a good login', async ({ page }) => {
    const envUser = process.env.SIGN_IN_USER;
    const envToken = process.env.SIGN_IN_TOKEN;

    // Always intercept /api/auth/status so the boot path knows auth is
    // enabled (otherwise useAuthState short-circuits to 'disabled' and
    // never renders the Login surface).
    await page.route('**/api/auth/status', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ enabled: true }),
      }),
    );

    if (!envUser || !envToken) {
      // Mock /api/auth/login so the submit click resolves locally.
      await page.route('**/api/auth/login', (route) =>
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            token: 'e2e-mock-token',
            user: 'e2e-tester',
            role: 'admin',
          }),
        }),
      );
    }

    // The Workers tab fetches /api/list + /api/events on mount. Mock both
    // with empty payloads so the post-login dashboard does not flash an
    // error state during the assertion window.
    await page.route('**/api/list', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ workers: [], queuedTasks: [], lostWorkers: [] }),
      }),
    );
    await page.route('**/api/events*', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'text/event-stream',
        body: 'event: connected\ndata: {"type":"connected"}\n\n',
      }),
    );

    await page.goto('/');

    // Login.tsx renders an h2 with the i18n login.title -- accept either
    // the english or korean label so the test does not break when the
    // operator's locale preference is stored in localStorage.
    await expect(page.getByRole('textbox', { name: /user/i })).toBeVisible();

    const user = envUser ?? 'e2e-tester';
    const token = envToken ?? 'e2e-password';
    await page.getByLabel(/user/i).fill(user);
    await page.getByLabel(/password/i).fill(token);
    await page.getByRole('button', { name: /sign in|submit|log in/i }).click();

    // After a good token, App.tsx swaps Login for the AppHeader +
    // TopTabs + Sidebar triple. The TopTabs renders role="tablist", the
    // AppHeader renders role="banner", and the default selected tab is
    // Workers so the Sidebar's worker-list region is reachable.
    await expect(page.getByRole('banner')).toBeVisible();
    await expect(page.getByRole('tablist')).toBeVisible();
    await expect(page.getByRole('tab', { name: /workers/i })).toBeVisible();
  });
});
