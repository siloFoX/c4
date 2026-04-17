---
name: c4-close
description: Close a c4 worker and clean up its PTY and worktree.
allowed-tools: Bash
---

Close c4 worker `$1`. The daemon tears down the PTY and cleans up the
worktree.

Invoke the plugin handler:

```bash
node "$CLAUDE_PLUGIN_ROOT/commands/c4-close.js" $ARGUMENTS
```

Report the JSON response.
