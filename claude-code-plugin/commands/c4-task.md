---
name: c4-task
description: Send a task to an existing c4 worker.
allowed-tools: Bash
---

Send a task to c4 worker `$1`. The rest of the line (`$2` onwards) is
the task body.

Invoke the plugin handler:

```bash
node "$CLAUDE_PLUGIN_ROOT/commands/c4-task.js" $ARGUMENTS
```

Report the JSON response. If the daemon returns a non-2xx status, do
not retry silently - surface the status and body to the user.
