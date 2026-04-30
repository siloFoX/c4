---
name: c4-orchestrator
description: This skill should be used when the user wants to spawn, monitor, or coordinate parallel Claude Code workers via c4. Triggers include "use c4", "spawn a worker", "run on DGX / fleet peer", "review this PR with another worker", "schedule a task", "queue this in the background", or any orchestration / multi-agent request that benefits from running parallel Claude Code sessions.
version: 0.1.0
---

# c4 — Claude Code orchestrator

c4 manages multiple Claude Code instances (workers) through a daemon at
`http://127.0.0.1:3456`. Each worker runs in its own PTY (or non-PTY adapter)
and you control them via the `c4` CLI from Bash.

## Quick decision tree

- **One short follow-up task** → don't spawn a worker. Just answer in this
  session.
- **Long-running side task** (e.g. run tests, generate report) → `c4 task <name> "..." --branch c4/<name>` and `c4 wait <name>`.
- **Multiple parallel jobs** → spawn N workers and `c4 wait --all`.
- **Don't know which machine to run on** → `c4 dispatch "..." --tags <tag>`.
- **Recurring job** → `c4 schedule add <id> '<cron>' <task...>`.
- **Multi-step plan with dependencies** → write a workflow JSON (see below)
  and `c4 workflow run <file>`.

## Core commands (call from Bash, single command per call)

```bash
c4 daemon start                       # idempotent
c4 new <name>                          # spawn idle worker
c4 task <name> "task text..." --branch c4/<name> [--auto-mode]
c4 wait <name> [timeout_ms]
c4 wait <name1> <name2> ... --all     # mode=all (collect-all)
c4 read <name>                         # idle snapshots
c4 read-now <name>                     # current screen
c4 send <name> "text"                  # text + Enter
c4 key  <name> Enter|C-c|Up|Down|...
c4 approve <name> [option]             # critical_deny manual approval
c4 suspend <name>                      # SIGSTOP (Unix only)
c4 resume  <name>                      # SIGCONT
c4 restart <name> [--no-resume]        # close + respawn (resumes session)
c4 cancel  <name>                      # Ctrl+C × 2
c4 batch-action close|suspend|... <name1> <name2> ...
c4 rollback <name>                     # branch reset to pre-task commit
c4 merge    <name>                     # merge worker branch into main
c4 close    <name>
c4 list                                # status snapshot (10s cache)
```

## Phase 9-11 surfaces

```bash
# Fleet (peer daemons in config.fleet.peers)
c4 fleet peers
c4 fleet list
c4 dispatch "task..." [--tags gpu,review] [--strategy least-load|round-robin|tag-match]
c4 transfer <fromPeer> <toPeer> <src> <dst> [--mode rsync|scp]

# Scheduler (5-field cron)
c4 schedules
c4 schedule add <id> '<cron>' <task...>
c4 schedule run <id>
c4 schedule enable <id> on|off
c4 schedule remove <id>

# PM kanban
c4 board <project>
c4 board add  <project> <title...>
c4 board move <project> <cardId> <to>

# Audit / cost / projects / departments
c4 audit [--worker X] [--actor Y] [--limit N]
c4 cost  [--model X] [--since YYYY-MM-DD]
c4 projects
c4 departments

# Workflow / NL
c4 workflow run <file.json>
c4 nl "<one-line instruction>" [--preview]

# Backup / restore (admin)
c4 backup  --out /tmp/c4-snapshot.tar.gz
c4 restore /tmp/c4-snapshot.tar.gz [--dry-run]
```

## Workflow JSON shape

```json
{
  "name": "morning-routine",
  "steps": [
    { "id": "scan",   "action": "task",     "args": { "name": "scanner", "task": "scan recent logs" } },
    { "id": "review", "action": "dispatch", "args": { "task": "review last night's PRs", "tags": ["review"] }, "dependsOn": ["scan"] },
    { "id": "report", "action": "shell",    "args": { "cmd": "node tools/report.js" }, "dependsOn": ["review"] }
  ]
}
```

Builtin step actions: `task`, `dispatch`, `wait`, `shell` (whitelist via
`config.workflow.shellWhitelist`), `notify`, `sleep`, `list`, `create`, `close`,
`schedule`. Each step may set `dependsOn: [..]` and `on_failure: 'abort' | 'continue'`.

## Rules of the road

- Always run `c4 daemon start` once at session start; it's idempotent.
- Use `--branch c4/<name>` so workers run in isolated worktrees and main stays clean.
- Don't compound shell commands. One `c4 ...` call per Bash invocation.
- Prefer `c4 wait` over polling `c4 list` (idle detection is built in).
- For long messages with `#` characters, c4 auto-routes through a task file
  to avoid Claude Code's "history hides arguments" warning.
- See `~/c4/docs/ops.md` for daemon ops, auth, backups, troubleshooting.

## When **not** to spawn a worker

- Answering a single-step question in this conversation.
- Simple file edits the user is already watching.
- Anything requiring strict sequential reasoning where parallelism doesn't help.
