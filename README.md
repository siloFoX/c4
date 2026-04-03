```
     ██████╗ ██╗  ██╗
    ██╔════╝ ██║  ██║
    ██║      ███████║   Claude { Claude Code } Code
    ██║      ╚════██║   Agent-on-Agent Orchestrator
    ╚██████╗      ██║
     ╚═════╝      ╚═╝
```

An agent-on-agent orchestrator. C4 lets Claude Code manage multiple Claude Code workers through virtual terminals — no screen capture, no token waste.

```
You ↔ Claude Code (Manager) ↔ C4 Daemon ↔ Worker A (Claude Code)
                                         ↔ Worker B (Claude Code)
                                         ↔ Worker C (Claude Code, remote SSH)
```

## How It Works

You open Claude Code and talk to it normally. Claude Code uses `c4` commands via Bash to spawn and manage worker Claude Code instances. You never run `c4` directly — Claude Code is both the manager and your interface.

```
You: "ARPS 프로젝트에 로깅 추가하고 테스트까지 해줘"

Claude Code (Manager):
  → c4 daemon start
  → c4 new worker-a claude --target dgx
  → c4 task worker-a "로깅 추가해" --branch c4/add-logging
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
- `config.json` — copies from `config.example.json`
- `CLAUDE.md` symlink — project instructions

## Usage

Open Claude Code in any project directory and give it tasks:

```
You: "이 프로젝트의 TODO를 정리해줘. 작업자 2개 띄워서 병렬로 해"

Claude Code will:
1. c4 daemon start
2. c4 new worker-a claude
3. c4 new worker-b claude
4. c4 task worker-a "TODO 분석" --branch c4/todo-analysis
5. c4 task worker-b "코드 정리" --branch c4/cleanup
6. Monitor, approve, report back to you
```

### Remote Workers (SSH)

Workers can run on remote servers:

```
You: "DGX 서버에서 모델 학습시켜줘"

Claude Code will:
1. c4 new trainer claude --target dgx
2. c4 task trainer "모델 학습 시작해"
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
| `c4 init` | First-time setup (permissions, config, CLAUDE.md) |
| `c4 daemon start\|stop\|status` | Manage the daemon |
| `c4 new <name> [--target t]` | Create a worker |
| `c4 task <name> <text> [--branch b]` | Send task with git branch/worktree isolation |
| `c4 send <name> <text>` | Send raw text to worker |
| `c4 key <name> <key>` | Send special key (Enter, C-c, etc.) |
| `c4 read <name>` | Read new output (idle snapshots) |
| `c4 read-now <name>` | Read current screen immediately |
| `c4 wait <name> [timeout]` | Wait until idle, then read |
| `c4 list` | List all workers |
| `c4 close <name>` | Close a worker |
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
└─────┘    └─────┘
  wt = git worktree (isolated branch)
```

## Key Features

- **Auto-setup**: Trust folder + max effort automatically configured on worker creation
- **Auto-approve**: Safe commands (read, grep, find) approved automatically; dangerous commands (rm, sudo) denied
- **Git worktree**: Each worker gets isolated directory — no conflicts between parallel workers
- **SSH workers**: Spawn workers on remote servers transparently
- **ScreenBuffer**: Virtual terminal processes ANSI escape sequences — clean text, no spinner noise
- **Daemon manager**: `c4 daemon start/stop/status` with PID tracking and health checks
- **Version compatibility**: TUI patterns configurable per Claude Code version

## License

MIT
