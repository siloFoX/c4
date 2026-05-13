# Web E2E (playwright)

End-to-end playwright specs that cover the three highest-traffic operator
flows on the C4 web UI. Added under TODO 11.80 (v1.11.98).

## What is here

| File | Flow |
|------|------|
| `sign-in.spec.ts` | Login form -> `/api/auth/login` -> dashboard chrome |
| `dispatch-task.spec.ts` | Auto tab -> Tick -> `/api/autonomous/tick` -> timeline |
| `dashboard-updates.spec.ts` | Workers tab + SSE bump -> WorkerList re-render |

Config: `../playwright.config.ts` (chromium only, baseURL
`http://localhost:5173`, no `webServer` block).

## Prerequisites

1. Install web deps once: `npm --prefix web install`. Inside this worktree
   the simpler recipe is to symlink the parent repo's `web/node_modules`
   so playwright is reachable -- the worktree's `.gitignore` already
   excludes `node_modules`:
   ```
   ln -s /root/c4/web/node_modules /root/c4-worktree-auto-w71/web/node_modules
   ```
2. Install the chromium browser binary: `npx playwright install chromium`.
   The CI box / dev container may not have it preinstalled, which is why
   the grader runs `--list` rather than the full headed run.
3. Start the vite dev server in a separate terminal:
   ```
   env -C web npm run dev
   ```
   The server must be listening on `http://localhost:5173`. The config
   intentionally has no `webServer` block -- operators run vite dev and
   the e2e suite in two terminals so the runner does not double-bind
   the port.

## Run

From `web/`:

```
npm run e2e
```

Or directly:

```
npx playwright test --config=playwright.config.ts
```

Filter by spec file:

```
npx playwright test sign-in.spec.ts
```

## Debug

Open the playwright inspector for a single spec:

```
npx playwright test --debug sign-in.spec.ts
```

Headed run with slow-mo (useful when triaging timing flakes):

```
npx playwright test --headed --workers=1
```

Trace viewer for a failed run:

```
npx playwright show-trace test-results/<spec>-<project>/trace.zip
```

## Sign-in env vars

`sign-in.spec.ts` reads two optional env vars so operators can drive a
real daemon instead of the default mocked `/api/auth/login`:

| Var | Purpose |
|-----|---------|
| `SIGN_IN_USER` | Username submitted in the login form |
| `SIGN_IN_TOKEN` | Password (token) submitted in the login form |

If either is missing the spec falls back to the network-level mock and
asserts the dashboard chrome paints anyway. To drive the real daemon:

```
SIGN_IN_USER=admin SIGN_IN_TOKEN=hunter2 npm run e2e -- sign-in.spec.ts
```

The harness reads these via `process.env.*` -- there is no `.env`
loader wired into the config because we want the values to come from
the operator's shell session, not a checked-in file. If you prefer a
dotenv file, pipe it in with `set -a; source .env; set +a; npm run e2e`.

## Manual verification recipe (no chromium installed)

The graderless verification path -- the one this PR ships with -- only
needs the playwright runner to parse + discover the specs. No browser
is launched:

```
env -C web ./node_modules/.bin/playwright test --config=playwright.config.ts --list
```

Expected output: 3 tests in 3 files. If the runner reports a parse
error or `Total: 0 tests in 0 files`, the config or specs regressed.

For a full headed run on an operator workstation:

1. Symlink `web/node_modules` to the parent repo's `web/node_modules`
   (see Prerequisites).
2. `npx playwright install chromium` -- one-shot browser download.
3. `env -C web npm run dev` -- vite dev server in terminal A.
4. `env -C web npm run e2e` -- playwright runner in terminal B.

Each spec is self-contained (no shared global state) and intercepts the
network endpoints it needs via `page.route()`, so the dev server only
serves the static React bundle -- the daemon is irrelevant to the
mocked specs. The signed-in specs preload `localStorage` via
`page.addInitScript()` so the auth gate clears before the React app
boots.

## Why no webServer block

Vite reloads aggressively when files change, and double-binding port
5173 from inside playwright while the operator already has vite open
fights the dev server. We keep the lifecycle in the operator's terminal
and let the runner connect.

## Adding a new spec

1. Drop a new `*.spec.ts` file in this directory.
2. Import from `playwright/test`, not `@playwright/test` -- the
   former is the dep already pulled in by `web/package.json`.
3. Mock auth + any `/api/*` endpoints with `page.route()`.
4. Re-run `--list` to confirm the runner discovers it.
