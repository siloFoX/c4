# Audit log size-based rotation

Branch: `dgx-spark/audit-rotation`

## What ships

`src/audit-log.js` `AuditLogger` gains two constructor options:

- `maxSizeBytes` (default `0` = off): when set, `record()` renames
  `audit.jsonl` to `audit-<isoTs>.jsonl` on the next append once
  the file exceeds the threshold, then starts a fresh file. The
  hash chain continues across the boundary because `_lastHash`
  lives in memory — the new file's first line still references
  the rotated file's last hash.
- `keep` (default `0` = unlimited): caps how many rotated files
  are retained, mtime newest-first. Older files are unlinked on
  every rotation.

Failure paths swallow errors — losing one rotation is preferable
to losing audit events.

The branch also bundles four other subsystems that share the
same release window:
`audit-sqlite.js`, `config-validate.js`, `failure-patterns.js`,
`worker-metrics.js` + the `MetricsBar` UI. Each ships its own
test file.

## Tests

`tests/audit-rotation.test.js` — 6 assertions:

1. No rotation when `maxSizeBytes === 0` (off-by-default).
2. Rotation triggers once `audit.jsonl` exceeds the threshold;
   live file resets to one entry and a single `audit-<ts>.jsonl`
   appears next to it.
3. Hash chain stays intact across rotation when files are
   manually concatenated and verified.
4. `keep=N` retains only the newest N rotated files, oldest
   unlinked.
5. **Review fix (2026-05-01)**: `verify({ includeRotated: true })`
   walks the rotated + live files as a single stream so a fresh
   AuditLogger after rotation no longer falsely reports
   `valid: false` at index 0 (which was happening because the
   live file's first event was hashed against the rotated
   file's last hash, a value the live-only walk reconstructed
   from `null`). The pre-fix `verify()` would have alarmed
   operators every time they ran `c4 audit verify` after a
   rotation.
6. **Review fix (2026-05-01)**: corruption detection across
   merged streams — tampering with a rotated file surfaces as
   `valid: false` with a `corruptedAt` index relative to the
   merged stream.

`src/daemon.js` `/audit/verify` route accepts
`?includeRotated=1` (or `=true`) and threads it into
`audit.verify(...)`. The response also carries `includeRotated`
so the Web UI knows which mode it's looking at.

## Test results

`npm test` full suite: 119 / 120 pass — the lone failure is the
pre-existing `file-transfer` test PR #24 fixes (unchanged
baseline). 6 / 6 audit-rotation tests pass.

## Test plan (manual)

1. `c4 daemon start` and generate enough audit events to exceed
   the configured `maxSizeBytes`. Confirm an `audit-<ts>.jsonl`
   appears alongside the live `audit.jsonl`.
2. `curl http://192.168.10.222:5173/api/audit/verify` — without
   `includeRotated=1`, post-rotation this should return
   `valid:false`. With `?includeRotated=1`, the same request
   walks the full history and returns `valid:true`.
3. Set `keep=2` and trigger several rotations. Confirm only the
   2 newest `audit-*.jsonl` files survive in the directory.

## Not in scope (follow-ups)

- The branch bundles five subsystems (audit rotation +
  audit-sqlite + config-validate + failure-patterns +
  worker-metrics + MetricsBar). Each warrants its own focused
  branch in future patches; the bundling is documented here so
  reviewers can scan per-concern.
- `c4 audit verify` CLI doesn't yet expose the `--include-rotated`
  flag — currently only the daemon's HTTP route honours the
  option. Future patch wires the CLI flag.
- Rotation by time (daily / weekly), not just size, is a
  separate follow-up. The current API also doesn't auto-archive
  rotated files to a cold-storage path.
