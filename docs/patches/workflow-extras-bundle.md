# workflow-extras — audit / config-validate / notify / parallel / retry node types

## Scope

Five workflow features that landed as separate branches but share the same `src/workflow.js` surface. Bundled here because they're mutually compatible and tested together as one runtime unit.

## What changed

### Audit node (`workflow-audit-action`)

New node `type: 'audit'` records an event into the hash chain. `node.config = {type, target, details?}` becomes the audit event payload. Hash chain stays tamper-evident across workflow runs.

```yaml
- id: log-merge
  type: audit
  config:
    type: workflow.merge.completed
    target: branch-name
    details: { branch: main, sha: <ref> }
```

### Config validation (`workflow-config-validate`)

`validateGraph` now checks per-node config field types in addition to structural DAG validation:

- `wait.config.ms` must be a finite number
- `audit.config.type` must be a non-empty string
- `notify.config.channel` must be `'slack' | 'email'`
- `task.config.template` (when present) must be a string
- etc.

Type mismatches surface early (at create/update) instead of failing mid-run.

### Notify node (`workflow-notify-node`)

New node `type: 'notify'` pushes to Slack (via existing webhook plumbing) or email (via SMTP config).

```yaml
- id: alert-team
  type: notify
  config:
    channel: slack
    target: '#ops'
    body: 'Workflow {{runId}} completed'
```

Template interpolation reads upstream node outputs.

### Parallel execution (`workflow-parallel`)

`wf.config.maxConcurrency` (default `1`, preserves the previous strict-sequential walk) lets ready peer nodes run concurrently up to the cap. The DAG order is still respected via the per-node deps gate; only nodes whose dependencies all completed AND are activated dispatch in the same batch.

Parallel fan-out branches now actually share wall-clock with their siblings instead of serializing.

### Retry policy (`workflow-retry`)

`node.config.retry = {maxRetries, backoffMs}` re-runs the node up to `1 + maxRetries` times with `backoffMs` sleeps between attempts. `result.attempts` surfaces the final attempt count when retries occurred. Combines cleanly with bounded parallel — retries happen inside `startNode`'s per-node async closure so a flaky branch doesn't block its peers' in-flight execution.

## Tests

- `tests/workflow-audit-action.test.js` — 135 lines
- `tests/workflow-config-validate.test.js` — 107 lines
- `tests/workflow-notify-node.test.js`
- `tests/workflow-parallel.test.js` — 218 lines
- `tests/workflow-retry.test.js` — 118 lines

## Live verification (2026-05-01)

```
# Retry
$ node /tmp/test-workflow-retry.js
status: completed
flaky.attempts: 3
flaky.output: { ok: true, attempt: 3 }
OK: per-node retry policy works (1 failed, 2 failed, 3 succeeded)

# Parallel
$ node /tmp/test-workflow-parallel.js
status: completed, elapsed: 102ms
OK: 3 nodes started within 0ms (parallel), total 102ms (vs ~300ms serial)
```

102ms total for 3 nodes × 100ms work confirms the 3-way parallel runs are actually concurrent (sequential would take 300ms+).
