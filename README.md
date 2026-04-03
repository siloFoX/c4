```
     ██████╗ ██╗  ██╗
    ██╔════╝ ██║  ██║
    ██║      ███████║   Claude { Claude Code } Code
    ██║      ╚════██║   Agent-on-Agent Orchestrator
    ╚██████╗      ██║
     ╚═════╝      ╚═╝
```

![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)
![Node >= 18](https://img.shields.io/badge/node-%3E%3D18-brightgreen.svg)
![Claude Code](https://img.shields.io/badge/Claude_Code-v2.1.85--2.1.91-8A2BE2.svg)
![Platform](https://img.shields.io/badge/tested-Win11%20%7C%20Ubuntu%20%7C%20macOS-blue.svg)
![Version](https://img.shields.io/badge/version-1.0.1-green.svg)

**[한국어](README.ko.md)**

An agent-on-agent orchestrator. C4 lets Claude Code manage multiple Claude Code workers through virtual terminals — no screen capture, no token waste.

```
You ↔ Claude Code (Manager) ↔ C4 Daemon ↔ Worker A (Claude Code)
                                         ↔ Worker B (Claude Code)
                                         ↔ Worker C (Claude Code, remote SSH)
```

## How It Works

You open Claude Code and talk to it normally. Claude Code uses `c4` commands via Bash to spawn and manage worker Claude Code instances. You never run `c4` directly — Claude Code is both the manager and your interface.

```
You: "Add logging to the project and run the tests"

Claude Code (Manager):
  → c4 daemon start
  → c4 new worker-a claude
  → c4 task worker-a "Add logging module" --branch c4/add-logging
  → c4 wait worker-a          (monitors progress)
  → c4 key worker-a Enter     (approves safe actions)
  → c4 read worker-a          (reads result, reports to you)
```

## Why?

Claude Desktop's Dispatch uses **screen capture** to interact with terminals:
- Slow (image encoding/decoding)
- Expensive (image tokens >> text tokens)
- Lossy (OCR-level accuracy)

C4 uses **virtual terminal** text instead:
- PTY captures raw output → ScreenBuffer processes escape sequences → clean text
- Idle detection → snapshot only when terminal stops updating
- **10-100x more efficient** than screenshot-based approaches

## Prerequisites

- [Node.js](https://nodejs.org/) >= 18
- [Claude Code](https://claude.ai/code) CLI installed

## Install

```bash
git clone https://github.com/siloFoX/c4.git
cd c4
npm install
```

Then open Claude Code and ask it to run:
```
c4 init
```

`c4 init` automatically handles everything:
- `~/.claude/settings.json` — adds c4 bash permissions
- `config.json` — copies from `config.example.json`, auto-detects `claude` binary path
- `c4` command — registers globally (npm link, or wrapper script fallback on Windows)
- `CLAUDE.md` symlink — project instructions
- `.githooks` — main branch protection (pre-commit hook)

## Usage

Open Claude Code in any project directory and give it tasks:

```
You: "Clean up the TODO list. Spin up 2 workers and do it in parallel."

Claude Code will:
1. c4 daemon start
2. c4 new worker-a claude
3. c4 new worker-b claude
4. c4 task worker-a "Analyze TODOs" --branch c4/todo-analysis
5. c4 task worker-b "Code cleanup" --branch c4/cleanup
6. Monitor, approve, report back to you
```

### Remote Workers (SSH)

Workers can run on remote servers:

```
You: "Train the model on the DGX server"

Claude Code will:
1. c4 new trainer claude --target dgx
2. c4 task trainer "Start model training"
```

Configure targets in `config.json`:
```json
{
  "targets": {
    "dgx": {
      "type": "ssh",
      "host": "user@192.168.1.100",
      "defaultCwd": "/home/user/project",
      "commandMap": {
        "claude": "/home/user/.local/bin/claude"
      }
    }
  }
}
```

### Recursive C4 (Experimental)

Workers can themselves use C4 to spawn sub-workers, creating a multi-level hierarchy:

```
You ↔ Manager (Claude Code)
       ├─ Worker A (Mid-Manager)
       │    ├─ Sub-Worker A1
       │    ├─ Sub-Worker A2
       │    └─ Sub-Worker A3
       └─ Worker B
```

Since all workers share the same daemon (localhost:3456), any worker with `c4` in PATH can create and manage sub-workers. This enables hierarchical task delegation — a manager assigns high-level tasks to mid-managers, who break them down and distribute to sub-workers.

> **Status**: Architecturally supported, not yet tested in production.

## Config

Copy `config.example.json` to `config.json` and edit:

| Section | What it does |
|---------|-------------|
| `daemon` | Port, host, idle threshold |
| `pty` | Terminal dimensions, scrollback |
| `targets` | Local and SSH remote targets |
| `autoApprove` | Auto-approve safe commands, deny dangerous ones |
| `workerDefaults` | Trust folder, effort level, model |
| `maxWorkers` | Rate limit concurrent workers (0 = unlimited) |
| `scope` | Default scope and named presets for task restrictions |
| `intervention` | Question/escalation detection settings |
| `templates` | Role-based worker presets (Planner/Executor/Reviewer) |
| `profiles` | Per-worker `.claude/settings.json` profiles |
| `pool` | Worker pooling (idle reuse) settings |
| `effort` | Dynamic effort adjustment thresholds |
| `hooks` | Hook architecture (PreToolUse/PostToolUse) |
| `swarm` | Subagent swarm monitoring settings |
| `autoMode` | Claude classifier safety delegation |
| `ssh` | SSH ControlMaster and reconnect settings |
| `tokenMonitor` | Daily token usage limits and warnings |
| `scribe` | Session context recording |
| `logs` | Raw logging, rotation, cleanup |
| `compatibility` | Claude Code TUI patterns for version compatibility |
| `worktree` | Git worktree settings for multi-agent isolation |

### Auto-Approve

C4 can auto-approve safe commands and deny dangerous ones:

```json
{
  "autoApprove": {
    "enabled": true,
    "rules": [
      { "pattern": "Read", "action": "approve" },
      { "pattern": "Bash(ls:*)", "action": "approve" },
      { "pattern": "Bash(find:*)", "action": "approve" },
      { "pattern": "Write", "action": "ask" },
      { "pattern": "Bash(rm:*)", "action": "deny" },
      { "pattern": "Bash(sudo:*)", "action": "deny" }
    ],
    "defaultAction": "ask"
  }
}
```

## Commands Reference

These are used by Claude Code (manager), not by you directly:

| Command | Description |
|---------|-------------|
| `c4 init` | First-time setup (permissions, config, CLAUDE.md, hooks) |
| `c4 daemon start\|stop\|restart\|status` | Manage the daemon |
| `c4 new <name> [--target t] [--template T]` | Create a worker (with optional role template) |
| `c4 task <name> <text> [flags]` | Send task with branch/worktree isolation |
| `c4 merge <worker\|branch>` | Merge branch to main (with pre-checks) |
| `c4 rollback <worker>` | Revert worker branch to pre-task state |
| `c4 plan <name> <text>` | Plan-only mode (no execution) |
| `c4 send <name> <text>` | Send raw text to worker |
| `c4 key <name> <key>` | Send special key (Enter, C-c, etc.) |
| `c4 read <name>` | Read new output (idle snapshots) |
| `c4 read-now <name>` | Read current screen immediately |
| `c4 wait <name> [timeout]` | Wait until idle, then read |
| `c4 list` | List all workers (with intervention/queue status) |
| `c4 close <name>` | Close a worker |
| `c4 history [worker]` | View task history |
| `c4 token-usage` | Show daily token consumption |
| `c4 scrollback <name>` | Read scrollback buffer |
| `c4 templates` | List available role templates |
| `c4 swarm <name>` | Show subagent swarm status |
| `c4 scribe start\|stop\|status\|scan` | Manage session context recording |
| `c4 config [reload]` | View or hot-reload config |

**Task flags**: `--branch`, `--after <worker>`, `--scope <json>`, `--scope-preset`, `--context <worker>`, `--reuse`, `--template`, `--auto-mode`

## Architecture

```
┌─────────────────────────────────────────┐
│  You (human)                            │
└──────────────┬──────────────────────────┘
               │ conversation
┌──────────────▼──────────────────────────┐
│  Manager (Claude Code CLI)              │
│  - Talks to you                         │
│  - Sends c4 commands via Bash           │
│  - Reviews worker output                │
│  - Approves/denies worker actions       │
│  - Reports results back to you          │
└──────────────┬──────────────────────────┘
               │ HTTP (localhost:3456)
┌──────────────▼──────────────────────────┐
│  C4 Daemon (Node.js)                    │
│  - Manages PTY processes                │
│  - ScreenBuffer (virtual terminal)      │
│  - Idle detection + snapshots           │
│  - Auto-approve engine                  │
│  - Git worktree isolation               │
└──┬───────────┬──────────────────────────┘
   │           │
┌──▼──┐    ┌──▼──┐
│PTY A│    │PTY B│    ...
│local│    │ SSH │
│(wt) │    │(wt) │
└──┬──┘    └─────┘
   │ (recursive)
┌──▼──┐
│PTY  │  Sub-workers via same daemon
│sub-1│
└─────┘
  wt = git worktree (isolated branch)
```

## Key Features

**Core**
- **Auto-setup**: Trust folder + effort level automatically configured on worker creation
- **Auto-approve**: Pattern-based approval/denial of worker actions (Read, Write, Bash commands)
- **Git worktree**: Each worker gets isolated directory — no conflicts between parallel workers
- **SSH workers**: Spawn workers on remote servers with auto-reconnect on disconnect
- **Recursive C4**: Workers spawn sub-workers for hierarchical task delegation

**Orchestration**
- **Task queue**: Rate limiting (`maxWorkers`), dependencies (`--after`), duplicate prevention
- **Scope guard**: File/command restrictions per task with drift keyword detection
- **Intervention protocol**: Auto-detect worker questions, repeated errors, routine skips
- **Role templates**: Planner (Opus), Executor (Sonnet), Reviewer (Haiku) presets
- **Worker pooling**: Recycle idle workers instead of spawning new ones
- **Context transfer**: Inject previous worker's output into new tasks

**Monitoring**
- **SSE events**: Real-time streaming of permission/complete/error/question events
- **Token monitoring**: Daily token consumption tracking with configurable limits
- **Task history**: Persistent JSONL log of all completed tasks
- **Scribe**: Session context extraction, survives context compaction via PostCompact hook
- **State machine**: Worker phase tracking (plan/edit/test/fix) with escalation

**Infrastructure**
- **Hook architecture**: PreToolUse/PostToolUse JSON event processing
- **MCP server**: HTTP MCP protocol endpoint for external tool integration
- **Adaptive polling**: Dynamic idle detection interval based on output activity
- **ScreenBuffer**: Enhanced ANSI CSI parser with scrollback API
- **Watchdog**: Autonomous operation — auto-restart daemon/manager/scribe
- **Cross-platform**: Windows, Linux, macOS support

## FAQ

**Q: C4 is not a standalone CLI tool?**
A: Correct. C4 is a toolkit that Claude Code (the manager) uses. You talk to Claude Code, and it runs `c4` commands to manage worker instances.

**Q: Does it work with models other than Claude?**
A: Currently C4 is designed for Claude Code CLI only. The TUI pattern matching and auto-approve engine are tuned for Claude Code's interface.

**Q: How many workers can I run?**
A: Depends on your Claude Max plan limits. Each worker is a separate Claude Code session consuming tokens.

**Q: What if the daemon crashes?**
A: Use `c4 daemon start` to restart. Use `watchdog.sh` for unattended operation — it auto-restarts the daemon, manager, and scribe.

**Q: Can workers manage other workers?**
A: Yes (experimental). Since all workers share the same daemon, any worker with `c4` in PATH can create sub-workers. This enables hierarchical orchestration.

## Contributing

Contributions are welcome! Please:

1. Fork the repo
2. Create a feature branch (`git checkout -b feature/amazing`)
3. Commit your changes
4. Push to the branch
5. Open a Pull Request

See [TODO.md](TODO.md) for the roadmap and open tasks.

## Roadmap

All 45 roadmap items across Phase 1/2/3 are complete. See [TODO.md](TODO.md) for full details and [CHANGELOG.md](CHANGELOG.md) for version history.

## Author

**siloFoX** — [GitHub](https://github.com/siloFoX) · [Instagram](https://instagram.com/_chobo___)

## License

MIT
