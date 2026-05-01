# cli-workspaces — multi-repo workspaces + `c4 workspaces`

## Why

Operators running c4 against multiple repos from one daemon had to pass `--repo /path/to/X` on every `c4 task` call. Workspaces let them register named workspaces in `config.workspaces` and refer to them by name (`--workspace api` resolves to the registered path).

## What changed

### Manager (`src/pty-manager.js`)

- `listWorkspaces()` returns `[{name, path, exists, isGitRepo}]` — reads `config.workspaces`, stat-checks each path.
- `resolveWorkspace(name)` looks up a single workspace; returns `{path, branch?}` or `{error}` when not found.

### Daemon (`src/daemon.js`)

- `GET /workspaces` route — wraps `manager.listWorkspaces()`.
- `POST /task` — `workspace` parameter overrides `projectRoot` when set (explicit `projectRoot` still wins so callers can target arbitrary paths). Workspace lookup runs first; if the workspace name is unknown the route returns 400.

### CLI (`src/cli.js`)

- `c4 task --workspace <name>` flag.
- `c4 workspaces` — prints a table:
  ```
    NAME              PATH                                            EXISTS  GIT
    api               /home/shinc/api                                 yes     yes
  ```
- `--json` passes through the raw payload.

## Tests

- `tests/workspaces.test.js` — 91 lines covering listWorkspaces, resolveWorkspace, /workspaces route, /task workspace param.

## Coexistence with 8.39

The workspace branch's `/task` patch interacts with PR #35's `resolvedName` fallback. Resolution order during merge:
1. Workspace lookup runs (overrides projectRoot)
2. `manager.sendTask(name, task, {projectRoot: resolvedRoot, ...})` runs
3. `resolvedName` falls back to `result.name` when caller omitted name

So a `c4 task --workspace api` (no name) auto-generates a worker name from the prompt + records it correctly in audit/Slack/history.

## Live verification (2026-05-01)

```
$ c4 workspaces
No workspaces configured. Add to config.workspaces (see config.example.json).
```

(Expected — empty config; route shape verified.)
