# C4 Claude Code Plugin

Native Claude Code plugin that exposes the C4 daemon (worker lifecycle:
new, task, list, merge, close) as slash commands.

- Talks to the local c4 daemon over HTTP (default `http://localhost:3456`)
- Uses `c4-sdk` when the package is resolvable; otherwise falls back to
  a built-in minimal fetch client (zero dependencies)
- Handlers are pure Node.js modules so they run with nothing more than
  Node >= 18, no `node-pty`, no Claude Code runtime

## Commands

| Slash command | Daemon route | Purpose |
| --- | --- | --- |
| `/c4-new <name> [--target local\|dgx] [--parent <p>] [--command <c>]` | `POST /create` | Spawn a new worker |
| `/c4-task <name> <task ...> [--auto-mode] [--branch <b>] [--reuse]` | `POST /task` | Send a task to a worker |
| `/c4-list` | `GET /list` | List workers and queued tasks |
| `/c4-merge <name> [--skip-checks]` | `POST /merge` | Merge a worker branch into main |
| `/c4-close <name>` | `POST /close` | Close a worker and tear down its worktree |

Under the hood every slash command calls out to the matching
`commands/<name>.js` module through Bash (`$CLAUDE_PLUGIN_ROOT` resolves
to this directory when the plugin is loaded by Claude Code). The module
prints a JSON envelope shaped like:

```json
{
  "ok": true,
  "command": "c4-new",
  "name": "worker1",
  "result": { "name": "worker1", "branch": "c4/worker1", ... }
}
```

## Install

Claude Code loads plugins from `~/.claude/plugins/<plugin-name>/`.
Three install paths:

### Option 1 - Symlink this directory

From a checkout of the c4 repository:

```bash
mkdir -p ~/.claude/plugins
ln -s /absolute/path/to/c4/claude-code-plugin ~/.claude/plugins/c4
```

### Option 2 - Copy the directory

```bash
mkdir -p ~/.claude/plugins/c4
cp -R /absolute/path/to/c4/claude-code-plugin/. ~/.claude/plugins/c4/
```

### Option 3 - Per-project plugin

If your project uses Claude Code's per-project plugin folder
(`.claude/plugins/` inside the repo), drop the directory there instead.

After install, restart Claude Code (or run its plugin reload) and the
five slash commands should autocomplete as `/c4-new`, `/c4-task`,
`/c4-list`, `/c4-merge`, `/c4-close`.

## Prerequisites

- **c4 daemon running.** Start it once per machine:

  ```bash
  c4 daemon start
  ```

  The daemon listens on `http://localhost:3456` by default.

- **Node.js >= 18** available on `PATH` (the plugin's handlers run as
  `node commands/*.js` under the hood).

- **Optional: JWT** if the daemon has auth enabled (see 8.14). The
  plugin reads the token in this order:

  1. `C4_TOKEN` environment variable
  2. `~/.c4-token` file (the CLI writes this on `c4 login`)

  The token is attached as `Authorization: Bearer <jwt>` on every
  request.

- **Optional: `c4-sdk`.** If the `c4-sdk` package is resolvable from
  the plugin directory (either installed globally, locally under
  `node_modules/c4-sdk/`, or as the sibling `sdk/` directory in the
  c4 source tree), the handlers use it. Otherwise they use the
  built-in `MinimalC4Client` inside `commands/_client.js`.

## Environment variables

| Variable | Default | Notes |
| --- | --- | --- |
| `C4_BASE` | `http://localhost:3456` | Daemon base URL. `C4_URL` is accepted as an alias. |
| `C4_TOKEN` | (from `~/.c4-token`) | JWT for `auth.enabled: true` deployments. |

## Running a command by hand

Every handler doubles as a tiny CLI, so you can exercise them without
going through Claude Code. This is handy for smoke-testing after
install:

```bash
node ~/.claude/plugins/c4/commands/c4-list.js
node ~/.claude/plugins/c4/commands/c4-new.js worker1 --target local
node ~/.claude/plugins/c4/commands/c4-task.js worker1 "write tests" --auto-mode
node ~/.claude/plugins/c4/commands/c4-merge.js worker1
node ~/.claude/plugins/c4/commands/c4-close.js worker1
```

Each command prints a JSON envelope on success and writes an error
message to stderr with exit code 1 on failure.

## Testing

The plugin ships pure-function handlers so tests never need Claude Code
or a running daemon. The c4 repository has `tests/cc-plugin.test.js`
which:

- Validates `plugin.json` against a small JSON Schema (name, version,
  five commands, required argument shape)
- Imports each handler, passes a stub fetch, and asserts the recorded
  URL / HTTP method / request body

Run it with the rest of the suite:

```bash
npm test
```

## Limitations

- **Slash command surface.** Only the five lifecycle commands ship in
  this batch. Additional c4 features (`c4 plan`, `c4 approve`, fleet
  management, recovery, etc.) are intentionally out of scope; call the
  `c4` CLI or the SDK for those.
- **No streaming.** The plugin does not expose the daemon's SSE watch
  endpoint - slash commands return a single JSON response. Use
  `c4 watch <name>` or the SDK's `watch()` iterator for live tailing.
- **No interactive approval.** If a worker raises a critical-deny or
  asks the operator for a decision, the plugin does not render the
  prompt. Use `c4 approve` or the Web UI.
- **Single daemon.** The plugin always talks to the local daemon
  resolved via `C4_BASE`. Fleet routing (9.6) is a CLI-only concept
  today.
- **Claude Code plugin loader** must be at a version that supports
  `plugin.json` manifests + `commands/` directory with markdown
  slash-command files. Older Claude Code releases that only honor
  `~/.claude/commands/` individual markdown files can still use the
  plugin - symlink the five `commands/*.md` files into that directory
  (the markdown files invoke the sibling `*.js` handlers through
  `$CLAUDE_PLUGIN_ROOT`; if that env var is not set, edit the path in
  each markdown file to match your install location).

## Relationship to other c4 pieces

| Surface | Transport | Audience |
| --- | --- | --- |
| `c4` CLI (`src/cli.js`) | Local shell | Humans on a terminal |
| `c4-sdk` package (`sdk/`) | Node.js module | Application code |
| MCP server (`src/mcp-handler.js`, 9.4) | JSON-RPC over stdio / HTTP | Claude Desktop, MCP clients |
| **This plugin** | Claude Code slash commands | Humans inside Claude Code |
| Web UI (`web/`) | Browser | Humans on any machine |

All five surfaces talk to the same daemon routes, so a worker spawned
via `/c4-new` inside Claude Code is the same worker you can inspect
with `c4 list`, the MCP `list_workers` tool, or the Web UI.
