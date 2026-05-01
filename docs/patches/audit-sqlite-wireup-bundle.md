# Audit log SQLite mirror (write-through wireup)

Branch: `dgx-spark/audit-sqlite-wireup`

## What ships

`AuditLogger` gains `{ useSqlite: true }` constructor option. When
set, `record()` continues to write the JSONL hash-chain entry
first (source of truth) and ALSO inserts a flat row into a sibling
`audit.db` SQLite mirror via `AuditSqlite.append()`. The mirror is
opt-in so callers that don't need indexed queries pay no overhead.

JSONL stays the source of truth for the hash chain — SQLite append
failure is swallowed (the JSONL write already succeeded so the
record itself isn't lost). Operators can delete the SQLite mirror
at any time and restart; the chain replays from JSONL into a fresh
mirror.

This branch only handles the WRITE side. The READ side (routing
`query()` through SQLite for indexed lookups) lives in the sibling
`audit-sqlite-query` branch — both branches converge on the same
`_toSqliteRow` shape so they can be merged independently.

The branch also bundles four other subsystems (config-validate,
failure-patterns, worker-metrics, MetricsBar) — same bundle pattern
as `audit-csv-bom` / `audit-rotation` / `audit-sqlite-query`.

## Tests

`tests/audit-sqlite-wireup.test.js` — 5 assertions:

1. Default (no opt-in) leaves `_sqlite` null and writes JSONL only.
2. `useSqlite:true` creates the sibling `.db` and mirrors records;
   newest-first ordering verified via `_sqlite.query()`.
3. SQLite append failure does not block JSONL write — the hash
   chain advances and `verify()` still passes.
4. `verify()` validates the JSONL hash chain unchanged after
   SQLite mirror writes (the mirror doesn't perturb the chain).
5. **Review fix (2026-05-01)**: SQLite row carries the full audit
   event verbatim under `event`. Reconstructed via
   `JSON.parse(raw)` round-trips `type / target / details.reason
   / details.branch / hash` — without this guarantee a future
   reader (e.g. `audit-sqlite-query` branch's `query()`) would
   only see the flat columns + `bodyKeys` (a list of keys, not
   the values), losing the security-relevant payload.

## Review round 1 fixes (2026-05-01)

Pre-fix `_toSqliteRow` returned only the flat index columns. The
`raw` column stored `JSON.stringify(record)` so it roundtripped
the FLAT shape — ts, actor, action, worker, ok, error, bodyKeys,
hash. Original audit fields were either renamed (timestamp → ts,
type → action, target → worker) or lost (`details` collapsed to
`bodyKeys` — the list of keys, not the values).

Added `event: fullEvent` to the row so `JSON.stringify(record)`
also embeds the full audit event verbatim. Future readers can
unwrap via `r.event || r` and get back the original audit-log
event shape with `details` intact. The flat index columns remain
unchanged so existing query() filters keep using the SQLite
indexes.

## Test results

`npm test` full suite: 119 / 120 pass — the lone failure is the
pre-existing `file-transfer` test PR #24 fixes (unchanged
baseline). 5 / 5 audit-sqlite-wireup tests pass.

## Test plan (manual)

1. Build c4 on Node 22+ so `node:sqlite` is available.
2. `c4 daemon start` with `config.audit.useSqlite: true`.
3. Generate audit events (`c4 task ...`, `c4 approve ...`, etc.).
4. `sqlite3 ~/.c4/audit.db "SELECT json_extract(raw, '$.event.details.reason') FROM audit;"`
   — should return the original `details.reason` strings, not
   nulls. Without the review fix this returns NULL because
   `details` was never embedded in `raw`.
