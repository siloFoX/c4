```
     ██████╗ ██╗  ██╗
    ██╔════╝ ██║  ██║
    ██║      ███████║   Claude { Claude Code } Code
    ██║      ╚════██║   Agent-on-Agent Orchestrator
    ╚██████╗      ██║
     ╚═════╝      ╚═╝
```

An agent-on-agent orchestrator. C4 lets one Claude instance manage multiple Claude Code workers through virtual terminals — no screen capture, no token waste.

```
You ↔ Manager (Claude Code) ↔ C4 ↔ Worker A (Claude Code)
                                  ↔ Worker B (Claude Code)
                                  ↔ Worker C (Claude Code, remote SSH)
```

## Why?

Claude Desktop's Dispatch uses **screen capture** to interact with code-server. This is:
- Slow (image encoding/decoding)
- Expensive (image tokens >> text tokens)
- Lossy (OCR-level accuracy)

C4 replaces this with a **virtual terminal** approach:
- PTY captures raw terminal output
- ScreenBuffer processes escape sequences → clean text
- Idle detection → snapshot only when the terminal stops updating
- **10-100x more efficient** than screenshot-based approaches

## Install

3 ways to install:

**npm** (recommended)
```bash
npm install -g c4-cli
```

**GitHub**
```bash
git clone https://github.com/siloFoX/c4.git
cd c4 && npm install && npm link
```

**Claude Code Plugin**

Add to `~/.claude/settings.json`:
```json
{
  "extraKnownMarketplaces": {
    "c4": {
      "source": {
        "source": "github",
        "repo": "siloFoX/c4"
      }
    }
  }
}
```
Then install from Claude Code's plugin menu.

## Quick Start

```bash
# Start daemon
nohup node src/daemon.js &

# Create a worker
c4 new my-worker claude

# Send a task
c4 send my-worker "Find all TODO comments in this project"
c4 key my-worker Enter

# Wait for result
c4 wait my-worker

# Read output
c4 read my-worker

# List workers
c4 list

# Close worker
c4 close my-worker
```

> **Note**: On Git Bash (Windows), prefix with `MSYS_NO_PATHCONV=1` when sending `/` commands:
> ```bash
> MSYS_NO_PATHCONV=1 c4 send my-worker "/model"
> ```

## Remote Workers (SSH)

C4 can spawn workers on remote servers via SSH:

```bash
# Create worker on remote server
c4 new remote-worker claude --target dgx

# Same commands work transparently
c4 send remote-worker "Run the test suite"
c4 key remote-worker Enter
c4 wait remote-worker
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

## Auto-Approve

Let safe commands pass without manual approval:

```json
{
  "autoApprove": {
    "enabled": true,
    "rules": [
      { "pattern": "Read", "action": "approve" },
      { "pattern": "Glob", "action": "approve" },
      { "pattern": "Grep", "action": "approve" },
      { "pattern": "Bash(ls:*)", "action": "approve" },
      { "pattern": "Bash(find:*)", "action": "approve" },
      { "pattern": "Bash(grep:*)", "action": "approve" },
      { "pattern": "Write", "action": "ask" },
      { "pattern": "Edit", "action": "ask" },
      { "pattern": "Bash(rm:*)", "action": "deny" },
      { "pattern": "Bash(sudo:*)", "action": "deny" }
    ],
    "defaultAction": "ask"
  }
}
```

## Commands

| Command | Description |
|---------|-------------|
| `c4 new <name> [cmd] [--target t]` | Create a worker |
| `c4 send <name> <text>` | Send text to worker |
| `c4 key <name> <key>` | Send special key (Enter, C-c, C-b, etc.) |
| `c4 read <name>` | Read new output (idle snapshots only) |
| `c4 read-now <name>` | Read current screen immediately |
| `c4 wait <name> [timeout]` | Wait until idle, then read |
| `c4 list` | List all workers |
| `c4 close <name>` | Close a worker |
| `c4 health` | Check daemon status |
| `c4 config` | Show current config |
| `c4 config reload` | Hot-reload config.json |

## Special Keys

`Enter`, `C-c`, `C-b`, `C-d`, `C-z`, `C-l`, `C-a`, `C-e`, `Escape`, `Tab`, `Backspace`, `Up`, `Down`, `Left`, `Right`

## Architecture

```
┌─────────────────────────────────────┐
│  Manager (Claude Code CLI)          │
│  - Talks to you                     │
│  - Sends tasks via c4 CLI           │
│  - Approves/denies worker requests  │
│  - Reports results                  │
└──────────────┬──────────────────────┘
               │ HTTP (localhost:3456)
┌──────────────▼──────────────────────┐
│  C4 Daemon (Node.js)                │
│  - Manages PTY processes            │
│  - ScreenBuffer (virtual terminal)  │
│  - Idle detection + snapshots       │
│  - Auto-approve engine              │
│  - SSH tunneling for remote workers │
└──┬───────────┬──────────────────────┘
   │           │
┌──▼──┐    ┌──▼──┐
│PTY A│    │PTY B│    ...
│local│    │ SSH │
└─────┘    └─────┘
```

## Config Reference

See [`config.json`](config.json) for all available settings:

- **daemon** — Port, host, idle threshold
- **pty** — Terminal dimensions, scrollback, default command
- **targets** — Local and SSH remote targets
- **autoApprove** — Permission auto-approval rules
- **workerDefaults** — Trust folder, effort level, model
- **logs** — Raw logging, rotation, cleanup

## How It Works

1. **PTY Spawn** — `node-pty` creates a pseudo-terminal for each worker
2. **ScreenBuffer** — Custom virtual terminal processes ANSI escape sequences (cursor movement, screen clearing, etc.) so you get the *actual screen state*, not raw bytes with spinner noise
3. **Idle Detection** — When terminal output stops for N ms, a snapshot is taken
4. **Offset Tracking** — Only new snapshots are returned on `read`, so you never re-read old output
5. **SSH Workers** — Remote workers are just SSH sessions in a PTY — same interface, transparent networking

## License

MIT
