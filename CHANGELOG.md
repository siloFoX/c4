# Changelog

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
