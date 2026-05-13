import { defineConfig, devices } from 'playwright/test';

// E2E config (TODO 11.80, v1.11.98).
//
// Three operator-facing flows live in `./e2e` (sign-in / dispatch /
// dashboard updates). The config picks chromium only because that is
// what `playwright` already pulls in via the existing devDependency in
// web/package.json -- adding firefox or webkit would download two more
// browser binaries the operator has not asked for.
//
// No `webServer` block: operators run `vite dev` in a separate terminal
// and the runner just connects to localhost:5173. Booting another vite
// instance behind the runner's back would double-bind the port and
// fight the running dev server, so we leave the lifecycle to the
// operator. See e2e/README.md for the manual recipe.

export default defineConfig({
  testDir: 'e2e',
  timeout: 30_000,
  expect: { timeout: 5_000 },
  fullyParallel: true,
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:5173',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
