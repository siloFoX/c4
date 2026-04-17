---
name: c4-list
description: List all c4 workers and their current status.
allowed-tools: Bash
---

List every c4 worker known to the local daemon.

Invoke the plugin handler:

```bash
node "$CLAUDE_PLUGIN_ROOT/commands/c4-list.js"
```

Show the JSON response. Summarize the worker names, statuses, and any
queued or lost workers at the top of the reply.
