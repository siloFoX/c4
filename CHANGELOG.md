# Changelog

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
