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
![Platform](https://img.shields.io/badge/tested-Win11%20%7C%20Ubuntu_(aarch64)-blue.svg)

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
npm link
```

Then open Claude Code and ask it to run:
```
c4 init
```

This sets up:
- `~/.claude/settings.json` — adds c4 bash permissions
- `config.json` — copies from `config.example.json`, auto-detects `claude` binary path
- `c4` command registration — npm link → ~/.local/bin symlink → .bashrc alias (3-step fallback)
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
| `compatibility` | Claude Code TUI patterns for version compatibility |
| `worktree` | Git worktree settings for multi-agent isolation |
| `logs` | Raw logging, rotation |

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
| `c4 new <name> [--target t]` | Create a worker |
| `c4 task <name> <text> [--branch b]` | Send task with git branch/worktree isolation |
| `c4 merge <worker\|branch>` | Merge branch to main (with pre-checks) |
| `c4 send <name> <text>` | Send raw text to worker |
| `c4 key <name> <key>` | Send special key (Enter, C-c, etc.) |
| `c4 read <name>` | Read new output (idle snapshots) |
| `c4 read-now <name>` | Read current screen immediately |
| `c4 wait <name> [timeout]` | Wait until idle, then read |
| `c4 list` | List all workers |
| `c4 close <name>` | Close a worker |
| `c4 scribe scan` | Scan all sessions and generate context summary |
| `c4 scribe start\|stop\|status` | Manage periodic scribe scanning |
| `c4 config [reload]` | View or hot-reload config |

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

- **Auto-setup**: Trust folder + max effort automatically configured on worker creation
- **Auto-approve**: Safe commands (read, grep, find) approved automatically; dangerous commands (rm, sudo) denied
- **Git worktree**: Each worker gets isolated directory — no conflicts between parallel workers
- **SSH workers**: Spawn workers on remote servers transparently
- **Recursive C4**: Workers can spawn sub-workers for hierarchical task delegation
- **Merge protection**: `c4 merge` enforces test/docs checks; pre-commit hook blocks direct main commits
- **ScreenBuffer**: Virtual terminal processes ANSI escape sequences — clean text, no spinner noise
- **Scribe**: Session context persistence — scans JSONL transcripts, extracts key decisions/errors/progress, survives context compaction via PostCompact hook
- **Daemon manager**: `c4 daemon start/stop/restart/status` with PID tracking and health checks
- **Worker timeout**: Detects idle workers (default 10min) and logs warnings
- **Version compatibility**: TUI patterns configurable per Claude Code version

## FAQ

**Q: C4 is not a standalone CLI tool?**
A: Correct. C4 is a toolkit that Claude Code (the manager) uses. You talk to Claude Code, and it runs `c4` commands to manage worker instances.

**Q: Does it work with models other than Claude?**
A: Currently C4 is designed for Claude Code CLI only. The TUI pattern matching and auto-approve engine are tuned for Claude Code's interface.

**Q: How many workers can I run?**
A: Depends on your Claude Max plan limits. Each worker is a separate Claude Code session consuming tokens.

**Q: What if the daemon crashes?**
A: Use `c4 daemon start` to restart. Workers are lost on daemon crash (session recovery is on the roadmap).

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

See [TODO.md](TODO.md) for the full roadmap. Current priorities:

- **Phase 1**: Core features (auto-approve, worktree, daemon manager, merge protection) — mostly done
- **Phase 2**: Operational stability (healthcheck, timeout, session recovery)
- **Phase 3**: Advanced features (subagent swarm, hook-based architecture, planner worker)

## Author

**siloFoX** — [GitHub](https://github.com/siloFoX) · [Instagram](https://instagram.com/_chobo___)

## License

MIT
