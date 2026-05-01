# observability bundle — failure-patterns wireup + UI badge + Korean variants

## Scope

Three sibling branches that ship the failure-pattern hint surface end-to-end:

1. `wireup-failure-hints` — daemon-side computation
2. `failure-hint-ui` — Web UI badge
3. `failure-patterns-extra` — 8 additional pattern entries

## What changed

### Daemon wireup (`wireup-failure-hints`)

`pty-manager.js` imports `failure-patterns` and adds `_computeFailureHint(w)` that runs the catalog against the worker's recent scrollback / errorHistory / latest snapshot.

The result lands on the `Worker` row as:

```ts
failureHint: { id, label, hint, sample, count } | null
```

So the Web UI surface doesn't need a follow-up `/api/...` round-trip per worker.

### UI badge (`failure-hint-ui`)

New badge in `WorkerList.tsx` renders below the worker branch:

- Yellow alert (`bg-warning/10 border-warning/40 text-warning-foreground`)
- `Lightbulb` lucide icon
- Curated label + count (×N when count > 1) + hint
- Matched sample text in `title` attribute (tooltip)

`Worker` type gains `failureHint?: {id,label,hint,sample,count} | null` and `tier?: 'manager' | 'worker' | string` (latter for 8.37 grouping).

**Note**: The original `worker-tree-ui` branch (`780381a`) was dropped during merge — it conflicts with 8.37's Managers / Workers grouping. Tree-view ships as a follow-up under a separate axis (e.g., a view-mode toggle) so both rendering modes can coexist.

### Pattern catalog growth (`failure-patterns-extra`)

Catalog grows from 13 → 21 entries:

- TypeScript module-not-found
- Python `ModuleNotFoundError`
- Postgres connection-refused
- Redis ECONNREFUSED
- npm peer-dep conflict
- git remote ahead
- JSON parse error
- EROFS read-only filesystem

Each entry carries `id` / `label` / `regex` / `hint` / `sample`.

## Tests

- `tests/failure-hint-wireup.test.js` — 105 lines
- `tests/failure-patterns.test.js` — covers extra entries
