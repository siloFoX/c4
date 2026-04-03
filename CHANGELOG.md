# Changelog

## [0.12.0] - 2026-04-03

### Added
- **Context transfer** (3.1): Inject another worker's recent snapshots into a new task
  - `sendTask()` `contextFrom` option: injects up to 3 recent non-autoAction snapshots
  - `_getContextSnapshots()`: extracts relevant snapshots from source worker
  - `c4 task <name> <text> --context <worker>`: CLI flag
  - `POST /task { contextFrom }`: API parameter
  - Propagated through queue, pending-task, and auto-create paths
- **Worker pooling** (3.4): Recycle idle workers instead of spawning new processes
  - `_findPoolWorker()`: finds idle worker within `pool.maxIdleMs` window
  - `_reuseWorker()`: renames and resets worker state for new task
  - Config: `pool.enabled` (default: false), `pool.maxIdleMs` (default: 300000)
  - `c4 task --reuse` / `--no-reuse`: CLI flags
  - `POST /task { reuse }`: API parameter
- **Rollback support** (3.6): Revert worker's branch to pre-task state
  - `sendTask()` records `_startCommit` (HEAD before task) on each worker
  - `rollback()`: executes `git reset --soft` to start commit
  - `c4 rollback <worker-name>`: CLI command
  - `POST /rollback { name }`: API route
  - `[ROLLBACK]` snapshot logged on successful reset

### Changed
- `config.example.json`: Added `pool` section

## [0.11.0] - 2026-04-03

### Added
- **Task history persistence** (3.7): Record worker task history across sessions
  - `history.jsonl`: JSONL log with `{ name, task, branch, startedAt, completedAt, commits, status }`
  - `close()` auto-records history before worker cleanup
  - `_getCommits()`: Collects branch commits via `git log main..<branch>`
  - `c4 history` CLI command: View task history with formatted output
  - `c4 history <worker>` / `c4 history --worker <name>`: Filter by worker
  - `c4 history --limit N`: Show last N records
  - `GET /history` daemon route with `?worker=` and `?limit=` query params
  - `tests/history.test.js`: 25 unit tests
- **Autonomous operation structure** (2.9): watchdog + manager auto-creation + scribe context recovery
- **Auto-validate task results** (3.2): Post-task test/lint execution with feedback loop

## [0.10.0] - 2026-04-03

### Added
- **Task queue with rate limiting** (2.8): `maxWorkers` config limits concurrent workers
  - Excess tasks queued automatically, dequeued when workers exit or in healthCheck
  - Queue persisted in `state.json`, `c4 list` shows QUEUED section
- **Task dependencies** (2.2): `c4 task worker-b "..." --after worker-a`
  - Queued task waits until dependency worker exits before starting
- **Duplicate task prevention** (2.3): Reject `c4 task` if same name already queued or running
- **Auto-create workers**: `c4 task` on non-existent worker auto-creates it
  - `tests/task-queue.test.js`: Unit tests
- **SSH disconnect recovery** (2.4): Automatic SSH connection resilience
  - ControlMaster (Unix) + ServerAlive + auto-reconnect on SSH worker exit
  - `[SSH WARN]` snapshots, health check integration
  - Config: `ssh.controlMaster`, `ssh.reconnect`, `ssh.maxReconnects`, etc.
- **Token usage monitoring** (2.5): Track daily token consumption from JSONL session files
  - `_parseTokensFromJsonl()`, `_checkTokenUsage()`: daily aggregation + 7-day history
  - `[TOKEN WARN]` snapshots, `c4 token-usage` CLI command
  - Config: `tokenMonitor.enabled`, `tokenMonitor.dailyLimit`, `tokenMonitor.warnThreshold`

### Changed
- `config.json`: Added `maxWorkers`, `ssh`, `tokenMonitor` sections
- `state.json`: Added `taskQueue` array (backward compatible)

## [0.9.0] - 2026-04-03

### Added
- **Scope Guard** (1.8): Task scope definition + drift detection
  - `src/scope-guard.js`: `ScopeGuard` class with file/bash scope checking and drift keyword detection
  - `checkFile()`: Validates file paths against `allowFiles`/`denyFiles` glob patterns
  - `checkBash()`: Validates bash commands against `allowBash`/`denyBash` prefix lists
  - `detectDrift()`: Detects scope drift keywords in worker output (Korean + English)
  - `resolveScope()`: Resolves scope from explicit → preset → default (priority order)
  - Out-of-scope access → auto-deny + `[SCOPE DENY]` snapshot
  - Drift keywords → `[SCOPE DRIFT]` snapshot
  - `c4 task --scope '...'` / `--scope-preset` CLI flags
  - `config.json`: `scope.presets`, `scope.defaultScope`
  - `tests/scope-guard.test.js`: Unit tests
- **Manager intervention protocol** (1.9): Automated detection of worker states requiring manager attention
  - **Question detection**: Korean + English question patterns, `[QUESTION]` snapshots
  - **Escalation detection**: Repeated error tracking → `[ESCALATION]` snapshot
  - **Routine monitoring**: implement → test → docs → commit compliance, `[ROUTINE SKIP]` snapshot
  - Worker intervention state: `c4 list` shows INTERVENTION column
  - Config: `intervention.enabled`, `intervention.questionPatterns`, `intervention.escalation.maxRetries`, `intervention.routineCheck`

## [0.8.1] - 2026-04-03

### Added
- **`c4 merge --skip-checks`** (1.16): Skip pre-merge checks for doc-only commits

### Fixed
- **Worktree main-protection hooks** (1.17): `_createWorktree()` sets `core.hooksPath` to enforce pre-commit hook in worktrees

## [0.8.0] - 2026-04-03

### Added
- **Log rotation** (2.7): Auto-rotate `logs/*.raw.log` when exceeding size limit
  - `_checkLogRotation()`: checks file size against `config.logs.maxLogSizeMb` (default 50MB)
  - Rotates `.raw.log` → `.raw.log.1` (deletes previous `.log.1`)
  - Re-opens log stream for active workers after rotation
  - Runs automatically in `healthCheck()` timer
- **Exited worker log cleanup** (2.7): Auto-delete logs of long-exited workers
  - `_cleanupExitedLogs()`: removes workers exited longer than `config.logs.cleanupAfterMinutes` (default 60min)
  - Deletes both `.raw.log` and `.raw.log.1` files
  - Removes cleaned-up workers from internal map
  - Runs automatically in `healthCheck()` timer
- **Lost worker recovery display** (2.7): Daemon restart awareness
  - `_loadState()` detects previously-alive workers from `state.json` on startup
  - Marks them as `lost` (daemon restarted, PTY sessions gone)
  - `_saveState()` includes `exitedAt` timestamp for exited workers
  - `c4 list` shows LOST section with name, pid, branch, and lost timestamp

## [0.7.0] - 2026-04-03

### Added
- **Scribe system** (1.6): Session context persistence via JSONL parsing
  - `src/scribe.js`: Core module — scans `~/.claude/projects/<project>/*.jsonl` files
  - JSONL parser with offset tracking (reads only new messages per scan)
  - Content extraction: user text, assistant text, tool uses (Write/Edit)
  - Auto-classification into categories: decision, error, fix, todo, intent, progress
  - Korean + English keyword pattern matching for classification
  - Structured output to `docs/session-context.md` (grouped by category, newest first)
  - Subagent session files included in scan
  - `c4 scribe start` — activate periodic scanning (default 5min interval)
  - `c4 scribe stop` — deactivate scribe
  - `c4 scribe status` — show scribe state (entries, tracked files, interval)
  - `c4 scribe scan` — run one-time scan immediately
  - Daemon integration: `/scribe/start`, `/scribe/stop`, `/scribe/status`, `/scribe/scan` API routes
  - Config: `scribe.enabled`, `scribe.intervalMs`, `scribe.outputPath`, `scribe.projectId`, `scribe.maxEntries`
  - PostCompact hook compatible: `cat docs/session-context.md` restores context after compaction

## [0.6.0] - 2026-04-03

### Added
- **CLAUDE.md rule enforcement** (1.13): Automated rule compliance for workers
  - Pre-commit hook warns on compound commands (`&&`, `|`, `;`) in staged diffs
  - `sendTask()` auto-prepends CLAUDE.md key rules to task text
  - Default rules summary: no compound commands, use `git -C`, use `c4 wait`, no main commits, work routine
  - Config: `rules.appendToTask` (default: true) enables/disables rule injection
  - Config: `rules.summary` for custom rules text (empty = built-in default)

## [0.5.0] - 2026-04-03

### Added
- **Worker health check** (1.7): Periodic alive check with auto-restart support
  - `healthCheck()` method: scans all workers, detects dead ones, logs `[HEALTH] worker exited` to snapshots
  - `startHealthCheck()` / `stopHealthCheck()`: timer-based periodic execution (default 30s)
  - Config: `healthCheck.enabled` (default: true), `healthCheck.intervalMs` (default: 30000), `healthCheck.autoRestart` (default: false)
  - Auto-restart: when enabled, dead workers are re-created with same command/target
  - `c4 list` shows last health check time (seconds ago + timestamp)
  - Daemon starts health check on boot, stops on shutdown

## [0.4.0] - 2026-04-03

### Added
- **`c4 merge` command** (1.11): Merge branch to main with pre-merge checks
  - Accepts worker name (`c4 merge worker-a`) or branch name (`c4 merge c4/feature`)
  - Pre-merge checks: npm test, TODO.md modified, CHANGELOG.md modified
  - Rejects merge if any check fails with clear error messages
  - Executes `git merge --no-ff` on success
- **Main branch protection** (1.11): Pre-commit hook blocks direct commits to main
  - `.githooks/pre-commit` prevents commits on main branch
  - `c4 init` sets `git config core.hooksPath .githooks` automatically

### Fixed
- **Effort auto-setup stabilized** (1.15): `/model` menu setup intermittent failure fix
  - Retry logic with configurable `retries` (default: 3) and `phaseTimeoutMs` (default: 8000ms)
  - Escape key sent on timeout to clear partial TUI state before retry
  - Configurable `inputDelayMs` and `confirmDelayMs` (previously hardcoded 500ms)
  - Config: `workerDefaults.effortSetup` object in `config.json`
  - Failure snapshot logged after max retries exhausted
  - Success snapshot shows retry count if retries were needed

### Improved
- **`c4 init` enhanced** (1.10): Full initialization with auto-detection and fallbacks
  - Auto-detect `claude` binary path (`where`/`which`) → saves to `config.json`
  - Register `c4` command: `npm link` → `~/.local/bin/c4` symlink → `.bashrc` alias (3-step fallback)
  - EPERM handling: graceful error on Windows symlink permission issues

## [0.3.1] - 2026-04-03

### Added
- **`c4 init` command** (1.10): One-time project initialization
  - Merges c4 permissions into `~/.claude/settings.json` (non-destructive)
  - Copies `config.example.json` → `config.json` (skips if exists)
  - Creates `~/CLAUDE.md` symlink → repo `CLAUDE.md`

## [0.3.0] - 2026-04-03

### Added
- **Git worktree support** (1.12): Each worker gets an isolated worktree directory
  - `sendTask()` auto-creates `git worktree add ../c4-worktree-<name> -b <branch>`
  - Worker is instructed to `cd` into the worktree before starting work
  - `close()` auto-removes worktree with `git worktree remove --force`
  - `list()` shows worktree path per worker
  - Stale worktree cleanup on re-creation
  - Config: `worktree.enabled` (default: true), `worktree.projectRoot` (auto-detect from git)
  - API: `useWorktree`, `projectRoot` options in `/task` endpoint
  - Fallback to branch-only mode with `useWorktree: false`
- **TODO roadmap expansion** (3.10-3.19): Planner Worker, State Machine, Adaptive Polling, Interface Abstraction, Summary Layer, Hook architecture, Subagent Swarm, Role templates, Auto Mode

### Fixed
- **Git Bash MSYS path fix** (1.4): Cherry-picked `MSYS_NO_PATHCONV=1` + `fixMsysArgs()` to main branch

## [0.2.0] - 2026-04-02

### Added
- **Auto-approve engine** (1.1): Config-based TUI pattern matching for permission prompts
  - Version compatibility system (`compatibility.patterns` in config)
  - Tested on v2.1.85, v2.1.90
  - Bash command extraction from screen, file name extraction
  - Option count detection (2-opt vs 3-opt prompts)
  - `alwaysApproveForSession` toggle for "don't ask again" option
  - Audit trail: auto-approve/deny decisions logged in snapshots
- **Worker auto-setup** (1.3): Trust folder + max effort fully automated
  - 2-phase idle detection: prompt detect → /model → menu detect → Right+Enter
  - Configurable effort level via `workerDefaults.effortLevel`
- **Git branch isolation** (1.5): `c4 task` command with auto branch creation
  - `--branch` flag for custom branch, `--no-branch` to skip
  - Workers instructed to commit per unit of work
  - Branch info shown in `c4 list`
- **`c4 task`** command: send task with branch isolation in one step
- **`c4 config` / `c4 config reload`**: view and hot-reload config
- **Claude Code plugin marketplace**: self-hosted via `.claude-plugin/`
- **TODO.md roadmap**: Phase 1/2/3 with task scope, manager protocol, design-doc workflow

### Changed
- Renamed project from `dispatch-terminal-mcp` to `c4` (Claude {Claude Code} Code)
- CLI command: `dispatch` → `c4`
- `config.json` moved to `.gitignore`, `config.example.json` provided
- Git commands added to autoApprove rules

### Fixed
- SSH argument passing on Windows (cmd.exe `&&` splitting issue → pendingCommands approach)
- Git Bash path conversion for `/model` → `MSYS_NO_PATHCONV=1` workaround

## [0.1.0] - 2026-04-02

### Added
- Core daemon with HTTP API (localhost:3456)
- PTY-based worker management (create, send, read, close)
- ScreenBuffer virtual terminal — clean screen state without spinner noise
- Idle detection and snapshot system
- SSH remote workers (`--target` flag)
- CLI tool with all management commands
- `config.json` for all settings (daemon, pty, targets, autoApprove, logs)
- Support for special keys (Enter, C-c, C-b, arrows, etc.)

### Architecture
- Node.js daemon + `node-pty` for pseudo-terminal management
- Custom ScreenBuffer replaces xterm-headless (no browser deps)
- Snapshot-based reading — only idle/finished states are captured
- SSH workers via `ssh.exe` with `pendingCommands` for initial setup
