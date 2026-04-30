# C4 Claude Code plugin

Validated against the Claude Code plugin spec (`claude plugin validate`).

## Layout

```
plugin/
├── .claude-plugin/
│   └── plugin.json            # name / description / author / version
└── skills/
    └── c4-orchestrator/
        └── SKILL.md           # frontmatter (name/description/version) + body
```

## Install for development

```bash
# Per-session (no permanent install): use --plugin-dir
claude --plugin-dir /home/shinc/c4/plugin

# Or install into the user scope through Claude Code:
claude plugin install c4@<marketplace>           # once published
```

The skill auto-activates when the user mentions c4-style orchestration
("use c4", "spawn a worker", "run on DGX", "schedule…", etc.). The
skill body teaches Claude how to use the `c4` CLI from Bash; it does
not call the daemon directly. Make sure `c4 daemon start` runs once
before the skill issues any task command.

## Validation

```bash
claude plugin validate /home/shinc/c4/plugin
# ✔ Validation passed
```
