---
name: c4-merge
description: Merge a c4 worker branch into main.
allowed-tools: Bash
---

Merge c4 worker `$1` branch into main via the daemon's guarded merge
route.

Invoke the plugin handler:

```bash
node "$CLAUDE_PLUGIN_ROOT/commands/c4-merge.js" $ARGUMENTS
```

Only pass `--skip-checks` when the user explicitly asked for it. Report
the JSON response verbatim.
