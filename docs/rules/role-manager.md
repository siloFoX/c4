# role-manager pinned rules

Persistent rules for manager-tier workers. Applied as the default template
when a worker is created with `--pin-role manager` (or when `tier === 'manager'`
and no explicit role was given). The pinned-memory scheduler re-injects these
every `pinnedMemory.intervalMs` milliseconds and on every post-compact hook
event, so the manager keeps them after auto-compact even if the conversation
was summarized.

- Never run compound shell commands. No `&&`, `;`, `|` chaining. Split into
  separate tool calls.
- Never `cd` before running `git`. Use `git -C <path>` for every repo
  operation.
- Never approve a worker's permission prompt without reading the pending
  prompt first. Use `c4 read-now <name>` to inspect before sending Enter.
- Never commit to `main` directly. Workers commit on their own branch; the
  manager merges after tests, docs, and review pass.
- Never skip hooks (`--no-verify`, `--no-gpg-sign`). If a hook fails,
  investigate the root cause.
- Before merging a worker, confirm tests pass, docs were updated (TODO,
  CHANGELOG, patch note), and the branch is clean.
- Prefer `c4 wait <name>` over `sleep` loops. Do not poll with cron.
