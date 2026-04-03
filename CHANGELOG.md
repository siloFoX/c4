# Changelog

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
