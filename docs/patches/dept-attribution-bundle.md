# dept-attribution — per-session token attribution + dept budget bridge

## Scope

Two sibling branches that ship token-usage roll-ups for the dept-monthly-budget tier (8.3):

1. `token-attribution` — per-session token tracking
2. `dept-attribution` — `attributedCostsByGroup` rolls per-group totals

## What changed

### Per-session attribution (`pty-manager.js`)

Tracks tokens per session ID across the worker's lifetime. Each PTY chunk that surfaces a model token count attaches to the session's running total.

### Group roll-up

```ts
attributedCostsByGroup({groupBy: 'session' | 'project' | 'tier' | 'dept'})
```

Returns `{[group]: {tokens, costUsd, sessionCount}}`. The dept-monthly-budget tier (8.3) charges against actual usage instead of a flat per-worker estimate.

`groupBy: 'dept'` reads `config.workers[<name>].dept` (or falls back to `'unknown'`).

## Tests

- `tests/token-attribution.test.js` — per-session tracker
- `tests/dept-attribution.test.js` — group roll-up
