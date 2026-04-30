# Audit CSV BOM bundle

Branch: `dgx-spark/audit-csv-bom`

## What ships

The branch is named for the audit CSV BOM fix but bundles five
related improvements that landed together. Each subsystem has its
own test file so the PR can be reviewed in isolation per concern.

### Audit log CSV export (the namesake fix)

`src/audit-log.js` gains `exportCsv(filter, opts)` returning
`{ contentType, body }`. UTF-8 BOM + CRLF by default so the file
opens cleanly in Excel / LibreOffice / Google Sheets without the
operator picking a codec at import time. Pass
`{ bom: false, lineEnd: '\n' }` for shell pipelines (awk / csvkit)
that don't tolerate the BOM. Filter shape mirrors `query()`
(`from / to / type / target / limit`). Korean (`actor: '관리자'`,
`target: '워커-1'`) round-trips correctly.

Tests: `tests/audit-csv-export.test.js` — 6 assertions:

1. Default emits header + rows + UTF-8 BOM + CRLF.
2. `{bom: false, lineEnd: '\n'}` opts out for shell pipelines.
3. Korean text encodes correctly with the BOM in front.
4. Quotes / commas / newlines inside fields are escaped per RFC.
5. Filters (type / target / limit) thread through to `query()`.
6. **Review fix (2026-05-01)**: source uses the `'﻿'`
   escape, not a literal BOM byte sequence. The original commit
   embedded the bare 3-byte BOM (`EF BB BF`) directly in the
   source string, which is fragile — editors / formatters can
   silently strip the BOM byte, and the regression would only
   surface when Excel displayed Korean text as garbled
   characters. Switched to the explicit Unicode escape and added
   a regression guard test that fails if the literal byte
   sequence reappears in `audit-log.js`.

### Other concerns bundled in the same branch

- **`src/audit-sqlite.js`** — backing store that backfills the
  hash-chain JSONL into a SQLite table for fast `query()`.
- **`src/config-validate.js`** — schema-style validator for
  `config.json` keys, used by `src/daemon.js` on `/config/reload`.
- **`src/failure-patterns.js`** — pattern catalog for
  `failure-hint-ui` follow-up; structured `{ id, regex, hint }`
  rows.
- **`src/worker-metrics.js`** + **`web/src/components/MetricsBar.tsx`**
  — per-worker KPI strip (uptime, error count, snapshot lag).

Each subsystem ships a dedicated test file in this same branch.

## Test results

`npm test` full suite: 119 / 120 pass. The lone failure is the
pre-existing `file-transfer` test PR #24 fixes (unchanged
baseline). 6 / 6 audit-csv-export tests pass.
`npm --prefix web run build` is unaffected (TS error baseline
unchanged).

## Test plan (manual)

1. `c4 daemon start` and generate some audit events.
2. `curl -OJ http://192.168.10.222:5173/api/audit/export?format=csv`
3. Open the downloaded CSV in Excel — Korean characters render
   correctly without "Encoding > UTF-8" being selected manually.
4. `awk -F, '{print $2}' audit.csv` from a shell pipeline —
   request with `?bom=false&lineEnd=\n` instead so the BOM doesn't
   pollute the first row.

## Not in scope (follow-ups)

- The branch name suggests a single concern but bundles five.
  Future patches should each ship under their own focused branch
  so review can be granular. The bundling is documented here so
  reviewers know the scope at a glance.
- `MetricsBar` currently shows a fixed set of KPIs; a config-
  driven layout (which columns to show) is a follow-up.
- `failure-patterns.js` currently has no UI surface — a future
  patch will plug it into the worker detail tail to flag
  matching errors inline.
