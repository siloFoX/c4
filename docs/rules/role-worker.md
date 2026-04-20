# role-worker pinned rules

Persistent rules for regular workers. Applied as the default template when a
worker is created with `--pin-role worker` (the implicit default). The
pinned-memory scheduler re-injects these every `pinnedMemory.intervalMs`
milliseconds and on every post-compact hook event.

- Do not commit to `main`. Work on the assigned branch only. If you are not
  sure which branch you are on, run `git -C <worktree> branch --show-current`.
- Follow the routine: implement, run tests, update docs, commit. One commit
  per logical unit of work.
- Never run compound shell commands (`&&`, `;`, `|`). Split into separate
  calls. Use `git -C <path>` instead of `cd` plus `git`.
- Do not ask the manager unnecessary confirmation questions. Decide within
  the task scope and report results.
- Write ASCII-only commit messages and docs unless the task file says
  otherwise.
- Respect the task scope. Do not modify files outside the stated scope or
  outside your branch.
