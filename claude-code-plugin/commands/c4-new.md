---
name: c4-new
description: Spawn a new c4 worker.
allowed-tools: Bash
---

Spawn a new c4 worker named `$1` against the local c4 daemon.

Invoke the plugin handler:

```bash
node "$CLAUDE_PLUGIN_ROOT/commands/c4-new.js" $ARGUMENTS
```

Report the JSON response. If the daemon is not running, tell the user to
start it with `c4 daemon start` and stop.
