# openapi-gen — `GET /openapi.json` auto-generated OpenAPI 3.0 spec

## Why

The 1.6.17-cumulative cherry-pick (1262b3e) added a doc reference pointing operators at `GET /openapi.json` for the full route reference, but the actual route was never landed on main (8a43044's curated-summary route conflicted heavily during cherry-pick attempts and was held back). Following the broken URL gave operators the SPA HTML fallback.

This implementation closes the gap: the spec is auto-generated at request time from the daemon's actual route handlers, so it never drifts from the code.

## What changed

### `src/openapi-gen.js`

Pure-node module, zero new runtime deps. Three exports:

- **`extractRoutes(source)`** — regex-walk over a daemon.js source string. Captures every `req.method === 'X' && route === '/y'` clause. Returns `[{method, path}, ...]` with `(method, path)` deduplication. Non-literal route checks (`startsWith` / `match` / etc) are skipped — the spec only documents URLs the operator can hit reliably.

- **`buildSpec({daemonPath?, version?, baseUrl?})`** — reads daemon.js (default: `<this dir>/daemon.js`), runs `extractRoutes`, namespaces every path under `/api/`, fills in a curated summary from `ROUTE_SUMMARIES` (or a `<METHOD> <path>` fallback), and produces a minimal OpenAPI 3.0.3 envelope:

  ```json
  {
    "openapi": "3.0.3",
    "info": { "title", "version", "description" },
    "servers": [{ "url" }],
    "paths": { "<path>": { "<method>": { "summary", "responses" } } }
  }
  ```

  Each operation declares the standard 200 / 400 / 401 / 403 / 404 / 500 response shapes — no concrete body schemas (those still live in `docs/api.md` + each patch note's payload examples).

- **`ROUTE_SUMMARIES`** — curated `<METHOD> <path>` → summary string map. Initial seed covers ~25 high-traffic routes (health / metrics / list / create / send / key / read / task / merge / events / sessions / attach / workflows / openapi.json / auth.* / audit.verify). Follow-up rounds extend the map as operator docs evolve.

### `src/daemon.js`

```diff
+ } else if (req.method === 'GET' && route === '/openapi.json') {
+   const { buildSpec } = require('./openapi-gen');
+   result = buildSpec({
+     version: manager._daemonVersion || null,
+     baseUrl: `http://${req.headers.host || 'localhost:3456'}`,
+   });
```

Inline `require` so the spec module is paid for only when an operator actually hits the route.

### `src/auth.js`

```diff
const OPEN_API_ROUTES = new Set([
  '/auth/login',
  '/auth/status',
  '/health',
+ '/openapi.json',
]);
```

Whitelisted alongside `/health` + `/auth/status` — operators introspecting the API surface should not need to authenticate first.

### `docs/api-reference.md`

The cherry-picked note now points at the live `/openapi.json` invocation (jq path-keys query) instead of the grep-based fallback I added when the route didn't exist.

## Tests

`tests/openapi-gen.test.js` — 12 assertions across 3 suites:
- `extractRoutes` — literal-only extraction, dedup, non-literal skip.
- `buildSpec` — envelope shape, 80+ paths, /api/ namespacing, every-op summary + 200 response, curated-summary override, openapi.json self-reference, version override.
- `ROUTE_SUMMARIES` — key shape (`<METHOD> /path`), value non-empty.

Full suite: 143 → 144 pass.

## Live verification (2026-05-01)

```
$ curl -sf http://127.0.0.1:3456/openapi.json | jq '.paths | length'
99

$ curl -sf http://127.0.0.1:3456/openapi.json | jq '.paths | keys[0:3]'
[
  "/api/auth/login",
  "/api/auth/logout",
  "/api/auth/status"
]
```

99 paths in the served spec — 98 from daemon.js + 1 for `/api/openapi.json` itself.
