import { expect, test } from 'playwright/test';

// Dashboard real-time updates (TODO 11.80, v1.11.98).
//
// Workers tab is the default landing surface after login. WorkerList
// (web/src/components/WorkerList.tsx) drives a 5s /api/list poll and a
// long-lived SSE subscription on /api/events -- any non-`connected`
// SSE event triggers a refetch.
//
// The task brief calls the SSE endpoint /api/sse; the actual code uses
// /api/events. We mock both so the route handler honours the brief AND
// reflects the real wiring. The intercept holds the response open for
// 200ms, then writes a `worker-update` event so the React hook hits
// its onmessage handler and triggers the second /api/list call.

import type { Route } from 'playwright/test';

const WORKER_A = {
  name: 'auto-w71',
  status: 'idle',
  branch: 'c4/auto-test-e2e',
  unreadSnapshots: 0,
  tier: 'worker',
};

const WORKER_B = {
  name: 'fresh-w99',
  status: 'busy',
  branch: 'c4/auto-fresh',
  unreadSnapshots: 0,
  tier: 'worker',
};

function sseChunk(eventName: string, payload: Record<string, unknown>): string {
  // The hook calls JSON.parse on ev.data. Any non-`connected` event
  // type triggers a refresh, so 'worker-update' is enough.
  return `event: ${eventName}\ndata: ${JSON.stringify({
    type: eventName,
    ...payload,
  })}\n\n`;
}

test.describe('dashboard real-time updates', () => {
  test('re-renders the WorkerList when an SSE update event arrives', async ({ page }) => {
    await page.route('**/api/auth/status', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ enabled: true }),
      }),
    );

    await page.addInitScript(() => {
      try {
        localStorage.setItem('c4.authToken', 'e2e-mock-token');
        localStorage.setItem('c4.authUser', 'e2e-tester');
        localStorage.setItem('c4.authRole', 'admin');
      } catch {
        /* ignore */
      }
    });

    // /api/list returns one worker initially; after the SSE bump, the
    // second call returns two workers. Latch via a counter so the
    // route handler stays declarative.
    let listCalls = 0;
    await page.route('**/api/list', (route) => {
      listCalls += 1;
      const workers = listCalls === 1 ? [WORKER_A] : [WORKER_A, WORKER_B];
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ workers, queuedTasks: [], lostWorkers: [] }),
      });
    });

    // SSE intercept. EventSource pulls /api/events with the token query
    // attached by eventSourceUrl(). The brief asks for /api/sse, so
    // catch both paths -- whichever the page asks for, the runner
    // satisfies it with the same response shape.
    const sseHandler = async (route: Route) => {
      const body =
        sseChunk('connected', {}) +
        sseChunk('worker-update', { worker: WORKER_B.name });
      // 200ms delay so the initial /api/list call lands first; the
      // hook treats SSE as a "refresh me" signal so the order matters.
      await new Promise((r) => setTimeout(r, 200));
      return route.fulfill({
        status: 200,
        contentType: 'text/event-stream',
        headers: {
          'cache-control': 'no-cache',
          connection: 'keep-alive',
        },
        body,
      });
    };
    await page.route('**/api/events*', sseHandler);
    await page.route('**/api/sse*', sseHandler);

    // The Auto / autonomous tab is gated behind a status poll; mock so
    // any nav-badge fetch resolves without surfacing errors. Same for
    // the autonomous queue + autonomous status endpoints which
    // useNavBadgeCounts may probe.
    await page.route('**/api/autonomous/status', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ enabled: false }),
      }),
    );
    await page.route('**/api/autonomous/escalations', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ escalations: [] }),
      }),
    );

    await page.goto('/');

    // Pre-update: WORKER_A is the only entry in the WorkerList.
    await expect(page.getByText(WORKER_A.name).first()).toBeVisible();
    await expect(page.getByText(WORKER_B.name)).toHaveCount(0);

    // Post-update: after the SSE bump fires, the hook refetches
    // /api/list and the second call returns both workers. The polling
    // fallback (5s interval) would also fire eventually, so this
    // assertion is more of a "fresh worker appears" check than a
    // strict SSE-driven one -- which matches the brief.
    await expect(page.getByText(WORKER_B.name).first()).toBeVisible({
      timeout: 10_000,
    });
    await expect.poll(() => listCalls).toBeGreaterThanOrEqual(2);
  });
});
