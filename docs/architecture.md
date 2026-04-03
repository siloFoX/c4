# Architecture

## System Overview

```
┌──────────────────────────────────────────────┐
│  You (human)                                 │
└────────────────┬─────────────────────────────┘
                 │ conversation
┌────────────────▼─────────────────────────────┐
│  Manager (Claude Code CLI)                   │
│  - Talks to you                              │
│  - Sends c4 commands via Bash                │
│  - Reviews worker output                     │
│  - Approves/denies worker actions            │
└────────────────┬─────────────────────────────┘
                 │ HTTP (localhost:3456)
┌────────────────▼─────────────────────────────┐
│  C4 Daemon (daemon.js → Node.js HTTP server) │
│  ┌─────────────────────────────────────────┐ │
│  │ PtyManager (pty-manager.js)             │ │
│  │  - Worker lifecycle (create/send/close) │ │
│  │  - Auto-approve engine                  │ │
│  │  - Health check + auto-restart          │ │
│  │  - Task queue (dependency/rate-limit)   │ │
│  │  - Scope guard enforcement              │ │
│  │  - Intervention detection               │ │
│  │  - SSE event streaming                  │ │
│  │  - Hook event processing                │ │
│  │  - Token usage monitoring               │ │
│  │  - Worker pooling                       │ │
│  │  - Context transfer                     │ │
│  │  - Git worktree management              │ │
│  ├─────────────────────────────────────────┤ │
│  │ ScreenBuffer  │ StateMachine            │ │
│  │ AdaptivePolling │ SummaryLayer          │ │
│  │ TerminalInterface │ ScopeGuard          │ │
│  │ Scribe │ Planner │ McpHandler           │ │
│  └─────────────────────────────────────────┘ │
└──┬───────────┬───────────┬───────────────────┘
   │           │           │
┌──▼──┐    ┌──▼──┐    ┌──▼──┐
│PTY A│    │PTY B│    │PTY C│
│local│    │local│    │ SSH │
│(wt) │    │(wt) │    │(wt) │
└─────┘    └─────┘    └─────┘
  wt = git worktree (isolated branch)
```

## Data Flow

```
1. CLI (cli.js) → HTTP request → Daemon (daemon.js)
2. Daemon routes to PtyManager method
3. PtyManager spawns PTY (node-pty) per worker
4. PTY output → ScreenBuffer (ANSI parse) → idle snapshot
5. Idle snapshot → auto-approve / scope check / intervention detect
6. Snapshot stored → CLI reads via /read or /wait-read
7. Hook events (PreToolUse/PostToolUse) → POST /hook-event → PtyManager
8. SSE events → GET /events → real-time client streaming
```

## Source Modules

| Module | Lines | Role |
|--------|-------|------|
| pty-manager.js | 2720 | Core orchestrator — worker lifecycle, auto-approve, health check, task queue, scope, intervention, hooks, SSE, tokens, pooling, worktree |
| cli.js | 948 | CLI entry point — HTTP client, command parser, `c4 init`/`c4 merge` logic |
| scribe.js | 434 | Session context persistence — JSONL scan, content extraction, classification, `docs/session-context.md` generation |
| screen-buffer.js | 325 | Virtual terminal — ANSI CSI parser, scrollback buffer, screen text extraction |
| scope-guard.js | 236 | Scope enforcement — file glob matching, bash command prefix, drift keyword detection |
| daemon.js | 209 | HTTP server — route handler, server lifecycle, signal handling |
| terminal-interface.js | 205 | TUI abstraction — Claude Code pattern detection, keystroke generation |
| state-machine.js | 196 | Worker phase tracking — plan/edit/test/fix transitions, test failure escalation |
| daemon-manager.js | 195 | Daemon process manager — start/stop/restart, PID file, health check |
| mcp-handler.js | 194 | MCP protocol — JSON-RPC 2.0, 5 tools (create/task/list/read/close) |
| summary-layer.js | 157 | Snapshot summarization — error/file/test/decision extraction, tail context |
| adaptive-polling.js | 95 | Dynamic polling — activity-based interval adjustment (500ms ~ 5000ms) |
| planner.js | 80 | Plan mode — plan.md generation prompt, plan file read |
| **Total** | **5994** | |

## Test Files

18 test files, 3346 lines total.

| File | Lines | Target |
|------|-------|--------|
| hook-architecture.test.js | 399 | Hook PreToolUse/PostToolUse |
| task-queue.test.js | 251 | Task queue, dependency, rate limit |
| worker-settings.test.js | 235 | Per-worker settings.json |
| role-templates.test.js | 202 | Planner/Executor/Reviewer templates |
| state-machine.test.js | 200 | Phase transitions, escalation |
| history.test.js | 199 | JSONL history persistence |
| platform.test.js | 192 | Cross-platform utilities |
| summary-layer.test.js | 182 | Snapshot summarization |
| subagent-swarm.test.js | 181 | Subagent tracking |
| mcp-handler.test.js | 174 | MCP JSON-RPC protocol |
| terminal-interface.test.js | 174 | TUI pattern detection |
| adaptive-polling.test.js | 165 | Dynamic idle interval |
| screen-buffer.test.js | 159 | ANSI parsing, scrollback |
| auto-mode.test.js | 158 | Auto mode permissions |
| scope-guard.test.js | 152 | File/bash scope check |
| effort-dynamic.test.js | 122 | Dynamic effort determination |
| sse.test.js | 107 | SSE event streaming |
| planner.test.js | 94 | Plan mode prompt |

## Module Dependency Graph

```
daemon.js (entry point)
├── pty-manager.js (core)
│   ├── node-pty          (external: PTY process spawning)
│   ├── screen-buffer.js  (ANSI terminal emulation)
│   ├── scribe.js         (session context persistence)
│   ├── scope-guard.js    (scope enforcement)
│   ├── state-machine.js  (worker phase tracking)
│   ├── adaptive-polling.js (dynamic polling interval)
│   ├── terminal-interface.js (TUI pattern abstraction)
│   └── summary-layer.js  (snapshot summarization)
├── mcp-handler.js        (MCP JSON-RPC 2.0)
├── planner.js            (plan-only mode)
└── scribe.js             (session recording)

cli.js (CLI entry point)
├── daemon-manager.js     (daemon start/stop)
└── http (stdlib)         (HTTP client to daemon)
```

## Key Design Decisions

**PTY + ScreenBuffer over screen capture**: Raw terminal output is parsed through a virtual terminal emulator instead of taking screenshots. This is 10-100x more efficient than image-based approaches (no encoding/decoding, text tokens vs image tokens).

**Idle detection + snapshot**: Workers are only read when their terminal output stops changing (idle). The idle threshold is dynamically adjusted by AdaptivePolling based on output activity level.

**Git worktree isolation**: Each worker gets its own worktree directory, preventing git conflicts between parallel workers sharing the same repository.

**Hook architecture (3.15)**: PreToolUse/PostToolUse hooks POST structured JSON to the daemon, enabling precise scope checking and progress tracking without relying on screen text parsing.

**Config-driven behavior**: All patterns, thresholds, and rules are configurable via `config.json`. Version-specific TUI patterns are isolated in `compatibility.patterns` so Claude Code updates only require config changes.
