# DGX-Spark feature pack — operator guide

Reference for the c4 features added in the dgx-spark/* PR series.
Each section covers what the feature is, how to enable it, and the
flag/test surface so you can verify it locally.

---

## 1. Per-worker CPU/RSS metrics — `GET /metrics`

**PRs:** `cherry-pick-1.6.17`, `wireup-metrics`, `cli-metrics`,
`metricsbar-wireup`

`manager.list()` now carries `cpuPct`, `rssKb`, and `threads` per worker
on Linux. `GET /metrics` returns a daemon-wide rollup:

```json
{
  "daemon": { "rssKb": 82_000, "heapUsedKb": 14_000, "loadavg": [...] },
  "workers": [{ "name": "w1", "cpuPct": 8.2, "rssKb": 60_100, "threads": 2 }],
  "totals": { "liveWorkers": 3, "totalCpuPct": 12.5, "totalRssKb": 180_400 }
}
```

CLI:

```bash
c4 metrics             # pretty-printed table
c4 metrics --json      # raw JSON
```

Web UI: a thin `MetricsBar` strip below the header polls `/api/metrics`
every 5s. Returns null until the first response so it doesn't shift
layout when the daemon is unreachable.

**Linux-only.** Other platforms get null fields gracefully.

---

## 2. Multi-repo workspaces — `config.workspaces`

**PRs:** `workspaces`, `cli-workspaces`

A flat name → path map lets a single daemon dispatch tasks against
multiple repo checkouts without `--repo` per call.

```jsonc
{
  "workspaces": {
    "arps":     "/home/shinc/arps",
    "datalake": "/home/shinc/arps-datalake"
  }
}
```

Use:

```bash
c4 workspaces                              # list configured entries
c4 task w1 --workspace arps "fix bug ..."  # uses /home/shinc/arps as projectRoot
```

`POST /task` body also accepts `workspace` directly. Explicit `--repo`
still wins over the workspace lookup.

`manager.resolveWorkspace(name)` returns
`{ name, path }` or `{ error: "Unknown workspace 'X'. Known: arps, datalake" }`.

---

## 3. Audit log rotation + SQLite read accelerator

**PRs:** `audit-rotation`, `audit-csv-bom`, `audit-sqlite-wireup`,
`audit-sqlite-query`

### Rotation

`audit.jsonl` rotates by size while preserving the SHA-256 hash chain.
Opt in via constructor opts:

```js
const log = new AuditLogger({
  logPath: '/path/to/audit.jsonl',
  maxSizeBytes: 10_000_000,   // 10 MB
  keep: 5,                     // retain newest 5 rotated files
});
```

Rotated files are named `audit-<isoTs>.jsonl`. `_lastHash` lives on the
logger instance, so the new file's first event still references the
rotated file's last hash — concatenating rotated + live in mtime order
and running `verify()` on the merged stream still passes.

### CSV export (Excel-friendly)

`AuditLogger.exportCsv(filter, opts)` emits UTF-8 BOM + CRLF by default
so the file opens correctly in Excel / LibreOffice / Google Sheets:

```js
const out = log.exportCsv({ type: 'task.sent' }); // { contentType, body }
// body starts with 0xEF 0xBB 0xBF, lines end with 0D 0A
```

Also exposed at `GET /audit/export?type=...&from=...&bom=0&lineEnd=lf`
(the last two opt out for shell pipelines that don't tolerate the BOM).

### SQLite read accelerator

`new AuditLogger({ logPath, useSqlite: true })` creates a sibling
`audit.db` and mirrors every `record()` into an indexed table. JSONL
remains the source of truth (the hash chain lives there); `query()`
uses SQLite when present so filtered queries are O(log n) instead of
full-file scans. Requires Node 22+ (`node:sqlite`). Failure isolation
is total — a SQLite-side error never blocks the JSONL append, and
`query()` falls back to the line-scan path on any throw.

---

## 4. Workflow engine: retry, parallel, audit nodes

**PRs:** `workflow-retry`, `workflow-parallel`, `workflow-audit-action`,
`workflow-config-validate`

### Per-node retry

```jsonc
{
  "id": "flaky-step",
  "type": "task",
  "config": {
    "retry": { "maxRetries": 3, "backoffMs": 250 }
  }
}
```

The executor wraps each `_executeNode` call in a retry loop; exhausted
retries mark the node `FAILED` with the last error. `backoffMs` sleeps
between attempts so flaky network steps don't hammer.

### Bounded parallel execution

```jsonc
{
  "name": "fan-out-3",
  "config": { "maxConcurrency": 3 },
  "nodes": [...],
  "edges": [...]
}
```

Default `maxConcurrency=1` keeps the previous strict-sequential walk.
Setting it to N runs ready peer nodes (deps satisfied + activated) up
to N at a time via Promise.race, draining in-flight nodes on failure
before reporting the run as FAILED.

### Audit node type

```jsonc
{
  "id": "log-completion",
  "type": "audit",
  "config": {
    "eventType": "task.completed",
    "target": "w1",
    "details": { "note": "PR review done" }
  }
}
```

Inject the logger:

```js
const exec = new WorkflowExecutor({ manager, auditLogger });
```

Each audit node calls `auditLogger.record(eventType, details, { target })`
so the run leaves a tamper-evident trail in the same audit log
backing `/audit/query` and `/audit/verify`. `prevOutput` (the previous
node's output) is forwarded under details.

### Config validation

`validateGraph` now type-checks per-node config fields up-front:
`retry.maxRetries / backoffMs` non-negative numbers, `wait.delayMs`
non-negative, `condition.expression` a string, `audit.eventType /
target / details` correct shapes. A typo or negative value surfaces
on `createWorkflow` / `updateWorkflow` instead of leaking into the
executor.

---

## 5. Worker hierarchy + failure-pattern hints

**PRs:** `wireup-failure-hints`, `worker-tree-ui`, `failure-hint-ui`,
`failure-patterns-extra`

`list()` carries:

- `parent` — workspace name of the worker that spawned this one
  (already in origin since 8.46)
- `failureHint` — `{ id, label, hint, sample, count }` when any of 21
  curated regex patterns matches the worker's recent error history /
  latest snapshot. Patterns: ENOSPC, EACCES, ENOENT, git dirty/
  conflict, hook denied, rate-limit, auth, OOM, port collision, test
  fail, timeout, ESLint, **connection-refused, connection-reset,
  dns-fail, tls-cert, subprocess-killed, node-stack, lockfile,
  npm-eintegrity** (8 added in `failure-patterns-extra`). Korean
  variants for disk-full / permission-denied.

Web UI sidebar renders the workers as a tree by `parent` field
(connector lines + indent + "{n} sub" badge on parents) and shows the
`failureHint` as a yellow alert at the bottom of each card with the
sample line as a hover tooltip.

---

## 6. Token attribution + dept cost rollup

**PRs:** `token-attribution`, `dept-attribution`

`_tokenUsage.daily[date]` now tracks `bySession: { [sessionId]:
{ input, output } }` alongside the existing global daily total. Claude
Code stores one JSONL per session at
`~/.claude/projects/<projectId>/<sessionId>.jsonl`, so the basename is
the session ID. Workers carry `_sessionId`, which lets callers roll
usage back to a worker / department.

```js
manager.monthlyBySession();
// { 'sess-eng': { input: 1_200_000, output: 200_000 }, ... }

manager.attributedCostsByGroup({ model: 'opus' });
// { byGroup: [{ name: 'w-eng', tokens: 1_400_000, costUSD: 21.0 }, ...] }
```

`attributedCostsByGroup` returns the `byGroup` shape `OrgManager.computeUsage`
already expects from external cost reports — depts now get real
per-worker attribution instead of a single global cost number.

Pricing comes from `config.costs.models[<model>]` (defaults to the
`default` bucket). Sessions whose worker is no longer alive land in
an `unattributed` bucket so totals still reconcile to the bill.

---

## 7. Misc ops surfaces

**PRs:** `cli-config-validate`, `cli-doctor`, `hook-noise-gating`,
`pm-board`, `nl-llm-fallback`, `npm-packaging`, `fix-file-transfer-test`

- `c4 config validate [path]` — ANSI-colored errors / warnings /
  info; exit 1 on any error.
- `c4 doctor` — aggregated env check (daemon reachable + version
  match, config validates, web/dist built, logs/ writable).
- `config.debug.hookEvents` / `config.debug.hookEventLog` gate the
  per-event stderr noise. Default off; rejection log
  (`/hook-event rejected: missing worker name`) stays always-on.
- `pm-board.js` — append-only JSONL kanban (backlog/in_progress/
  review/done) with optional TODO.md two-way sync via
  `config.pm.todoSync`.
- `src/nl-llm-fallback.js` — Anthropic API fallback module (opt-in via
  `enabled: true` + `ANTHROPIC_API_KEY`). Diagnostic returns instead
  of throws on missing SDK / API failure.
- `package.json files: ["web/dist/", ...]` + `prepublishOnly` builds
  the SPA + runs tests so `npm publish` can never ship a stale dist.
- `tests/file-transfer.test.js` no longer hard-codes `/root/project`
  for non-root test runners.

---

## Test surface

```bash
# Module-level (no daemon):
node --test tests/worker-metrics.test.js
node --test tests/failure-patterns.test.js
node --test tests/config-validate.test.js
node --test tests/audit-rotation.test.js
node --test tests/audit-csv-export.test.js
node --test tests/workflow-retry.test.js
node --test tests/workflow-parallel.test.js
node --test tests/workflow-audit-action.test.js
node --test tests/workflow-config-validate.test.js

# Wire-up integration:
node --test tests/metrics-wireup.test.js
node --test tests/failure-hint-wireup.test.js
node --test tests/audit-sqlite-wireup.test.js
node --test tests/audit-sqlite-query.test.js
node --test tests/dept-attribution.test.js

# Full suite:
node tests/run-all.js
```
