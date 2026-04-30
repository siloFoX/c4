# C4 Claude Code plugin (TODO 9.5)

Drop the `plugin/` directory into the Claude Code plugin discovery path
(see Claude Code docs for the per-platform location) or symlink it from
the project root:

```bash
ln -s /path/to/c4/plugin ~/.claude/plugins/c4
```

The slash commands speak to a running c4 daemon via the SDK
(`src/sdk.js`):

| Slash command | What it calls |
|---------------|---------------|
| `/c4-new <name>`              | `POST /create` |
| `/c4-task <name> <task...>`   | `POST /task` (auto branch + worktree) |
| `/c4-list`                    | `GET /list` |
| `/c4-read <name>`             | `GET /read-now` |
| `/c4-close <name>`            | `POST /close` |
| `/c4-dispatch <task...>`      | `POST /dispatch` (least-load) |

If the daemon isn't on `127.0.0.1:3456`, override with the plugin's
`config.daemon` block in `manifest.json` or the host's plugin settings.

## Status

This is **scaffolding** — wired to the existing daemon API and ready to
be picked up by Claude Code's plugin loader once that loader stabilises.
Once the plugin host API is finalised, the slash commands' return shape
may need to wrap into Claude Code's content-block format (similar to
MCP tools/call), but the SDK calls themselves stay the same.
