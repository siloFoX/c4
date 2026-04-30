# Audit log SQLite read accelerator (query)

Branch: `dgx-spark/audit-sqlite-query`

## What ships

`AuditLogger.query()` now routes through an optional SQLite read
accelerator. The JSONL log remains the source of truth (the hash
chain lives there). When the constructor receives
`{ useSqlite: true }`, `record()` ALSO inserts the canonicalised
event into a sibling `audit.db` so subsequent `query({type, target,
from, to, limit})` calls hit indexed columns instead of a
full-file scan.

Failure paths swallow errors — losing the SQLite mirror is
preferable to losing audit events. A query() failure on the SQLite
side falls through to the JSONL line scan so the public contract
is identical either way.

The branch also bundles the same five subsystems as
`audit-rotation` and `audit-csv-bom` (audit-sqlite store, config-
validate, failure-patterns, worker-metrics + MetricsBar).

## Tests

`tests/audit-sqlite-query.test.js` — 6 assertions:

1. SQLite path returns the same shape as JSONL path on identical
   data.
2. SQLite path applies type / target / from / to filters
   correctly.
3. Target filter behaviour.
4. `limit` caps result count.
5. SQLite query throw → falls back to JSONL scan.
6. **Review fix (2026-05-01)**: default-limit parity. Both paths
   default to 200 when the caller doesn't supply `limit` so the
   exact same `query({})` call returns the same number of events
   regardless of whether `useSqlite` was on.

## Review round 1 fixes (2026-05-01)

Pre-fix behaviour:

- SQLite path: `limit ?? 200` → caps at 200 events.
- JSONL fallback: `limit ?? 0` → returns ALL events (line 217 of
  audit-log.js had `: 0`, then `if (limit > 0 && results.length
  >= limit) break` skipped the cap entirely).

Result: a daemon with `useSqlite:false` could blow up memory on
a multi-MB audit.jsonl when an operator hit `/api/audit/query`
without `?limit=N`, while the same call against a SQLite-backed
daemon would safely return 200. Aligned both paths to a shared
`DEFAULT_LIMIT = 200` constant. The constant is locally declared
inside `query()` so it can't drift across renames or imports.

## Test results

`npm test` full suite: 119 / 120 pass — the lone failure is the
pre-existing `file-transfer` test PR #24 fixes (unchanged
baseline). 6 / 6 audit-sqlite-query tests pass.

## Test plan (manual)

1. `c4 daemon start` and generate >300 audit events.
2. `curl http://192.168.10.222:5173/api/audit/query` (no limit
   param) — response should always cap at 200 events whether
   SQLite is enabled or not.
3. `curl 'http://192.168.10.222:5173/api/audit/query?limit=50'`
   — response capped at 50 either way.
4. Stop the daemon, delete `audit.db` (the SQLite mirror), restart.
   The JSONL fallback path takes over; same query returns the same
   200-event cap.
