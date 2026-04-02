# Changelog

## [0.1.0] - 2026-04-02

### Added
- Core daemon with HTTP API (localhost:3456)
- PTY-based worker management (create, send, read, close)
- ScreenBuffer virtual terminal — clean screen state without spinner noise
- Idle detection and snapshot system
- SSH remote workers (`--target` flag)
- Auto-approve engine with pattern-based rules
- CLI tool (`c4`) with all management commands
- `config.json` for all settings (daemon, pty, targets, autoApprove, logs)
- Hot-reload config via `c4 config reload`
- Claude Code plugin structure (marketplace, commands, skills)
- Support for special keys (Enter, C-c, C-b, arrows, etc.)

### Architecture
- Node.js daemon + `node-pty` for pseudo-terminal management
- Custom ScreenBuffer replaces xterm-headless (no browser deps)
- Snapshot-based reading — only idle/finished states are captured
- SSH workers via `ssh.exe` with `pendingCommands` for initial setup
