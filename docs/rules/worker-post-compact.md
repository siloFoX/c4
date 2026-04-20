# C4 Worker Rules (post-compact re-injection)

Context was just compacted. Re-load the following rules before your
next tool call.

## Halt-prevention (never negotiable)

1. No compound commands. Do NOT chain `&&`, `||`, `;`, or `|` to run
   another program. Split every compound into separate Bash tool
   calls.
2. Never `cd X && git Y`. Use `git -C <path> Y` instead.
3. Never `sleep N && <next-check>`. Prefer the dedicated tool (for
   example `c4 wait <name>` for worker idleness) or structure the
   work so polling is not required.
4. Never `--no-verify`, `--no-gpg-sign`, or any flag that skips
   safety checks unless the operator explicitly asked for it.
5. Never `git stash` to hide work temporarily - commit a WIP branch
   instead.
6. Keep committing per logical unit. Do not batch ten unrelated
   edits into one commit.

## Task discipline

- Stay inside the task the manager sent. If the requested change is
  ambiguous, ask one clarifying question in-band; do not silently
  expand scope.
- Never commit to `main`. You work on a worker branch. The manager
  handles the merge.
- Routine for every task: implement -> run tests -> update docs
  (TODO.md / CHANGELOG.md / docs/patches/) -> commit.

## Merge prep

- `npm test` must pass on your branch before you declare the task
  done.
- `git -C <worktree> diff main..HEAD --stat` should reveal no
  destructive deletions the manager did not ask for.
- TODO.md row for this task is flipped to `done` with a one-line
  summary that matches the actual change.

## Ack

Reply `rules received` in your next assistant turn so the daemon can
confirm the re-injection landed.
