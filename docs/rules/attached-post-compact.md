# C4 Attached Session Rules (post-compact re-injection)

Context was just compacted. This session is attached to c4 for
read-through and light-touch assistance. The rules below are the
short form of the worker template.

## Halt-prevention

1. No compound commands. Do NOT chain `&&`, `||`, `;`, or `|`; keep
   each command in its own tool call.
2. Use `git -C <path>` instead of `cd X && git`.
3. Avoid `sleep`-based polling; prefer the dedicated wait command.
4. Never `--no-verify` or otherwise bypass safety hooks.

## Scope

- Attached sessions do not own a worktree. Do not create branches or
  perform merges; the originating terminal user owns the working
  directory.
- Read-first: prefer `Read`, `Grep`, `Glob`, and `git -C <repo>
  status` over destructive actions.
- If a task requires writes, surface the intended change to the user
  in chat and wait for their go-ahead.

## Ack

Reply `rules received` in your next assistant turn so c4 can confirm
the re-injection landed.
