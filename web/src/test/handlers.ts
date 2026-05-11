import { http, HttpResponse } from 'msw';

// Default daemon-API handlers used as the baseline by every test. Each
// individual test can override per-case via `server.use(...)` inside the
// `it()` body — `setup.ts` runs `server.resetHandlers()` after each test
// so the per-case overrides don't bleed across files.
export const handlers = [
  http.get('/api/health', () =>
    HttpResponse.json({
      ok: true,
      version: '1.10.780',
      pid: 12345,
      uptime: 1234,
      workers: 0,
      activeWorkers: 0,
      idleWorkers: 0,
      busyWorkers: 0,
    }),
  ),
  http.get('/api/auth/status', () => HttpResponse.json({ enabled: true })),
];
