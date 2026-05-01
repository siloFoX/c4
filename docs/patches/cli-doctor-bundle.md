# cli-doctor stack — environment health check + 5 base modules

## Why

Operators had no single command to answer "is c4 healthy?" — they had to chain `c4 health` + `c4 config show` + `ls web/dist` + check daemon version manually. `c4 doctor` collapses that into one green-ticked / red-crossed output.

The same stack also ships five foundational backend modules that the cli-metrics / cli-workspaces / audit-rotation / audit-sqlite / failure-hint feature branches depend on.

## What changed

### `c4 doctor` (`src/cli.js`)

Aggregated environment health check. Probes:

1. **Daemon reachable** — calls `/health`, compares `version` against installed `package.json`. Mismatch warns "run `c4 daemon restart`".
2. **`config.json` validation** — runs `config-validate.js` and reports errors / warnings count.
3. **`web/dist` built** — checks `web/dist/index.html` exists (else: "run `npm run build:web`").
4. **`logs/` writable** — touches `.doctor-probe` then unlinks.

Exit code: `0` = all pass, `1` = any failure (warnings alone exit 0).

### Base modules

- **`src/worker-metrics.js`** — per-worker CPU / RSS / threads sampling via `/proc/<pid>/stat` + `/proc/<pid>/status` on Linux, `ps` shell-out on macOS.
- **`src/failure-patterns.js`** — curated catalog of 13 failure-pattern matchers (ENOSPC / EACCES / OOM / port collision / ESLint / TypeScript / tsc / pytest / etc) — id / label / regex / hint / sample.
- **`src/config-validate.js`** — schema + type + cross-field invariant validator. Returns `{errors: [], warnings: [], info: []}`.
- **`src/audit-sqlite.js`** — opt-in SQLite mirror module via `node:sqlite`. `isReady()` probes whether the experimental SQLite addon is present; `append(row)` and `query(filter)` are no-ops when not.
- **`web/src/components/MetricsBar.tsx`** — live CPU/RSS strip component (mounted in App.tsx via metricsbar-wireup follow-up).

## Tests

- `tests/worker-metrics.test.js`
- `tests/failure-patterns.test.js`
- `tests/config-validate.test.js`

## Live verification (2026-05-01)

```
$ c4 doctor
  ✓ daemon reachable (v1.7.0)
  ✓ config.json: 0 error(s), 0 warning(s)
  ✓ web/dist built
  ✓ logs/ writable (/home/shinc/c4/logs)

All checks passed.
```
