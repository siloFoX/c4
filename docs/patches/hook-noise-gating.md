# hook-noise-gating — debug-gate per-event hook chatter

## Why

`pty-manager` and `daemon` were emitting one stderr line per hook event (`hook fired: PreToolUse`, `hook fired: PostToolUse`, etc). On a busy fleet that drowns out anything else in the daemon log; on a quiet fleet it's still pure noise.

## What changed

`_appendEventLog` and the matching `daemon` log lines now route through a `config.debug.hookEvents` gate (default `false`). Stderr stays clean unless an operator explicitly opts in:

```json
{
  "debug": {
    "hookEvents": true
  }
}
```

When the flag flips on, every hook event still surfaces — useful when chasing a hook timing bug.

## Tests

- `tests/slack-activity.test.js` updated to assert the gating behavior — the gated path no longer emits stderr lines on the default config.
