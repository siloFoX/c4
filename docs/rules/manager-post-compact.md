# C4 Manager Rules (post-compact re-injection)

Context was just compacted. Re-load the following rules before any
further Bash call, worker spawn, or merge.

## Halt-prevention (never negotiable)

1. No compound commands. Do NOT chain `&&`, `||`, `;`, or `|` to run
   another program. Split every compound into separate tool calls.
2. Never `cd X && git Y`. Use `git -C <path> Y` instead.
3. Never `sleep N && c4 read-now`. Use `c4 wait <name>` - it returns
   the moment the worker goes idle.
4. Never `--no-verify`, `--no-gpg-sign`, or `--force-with-lease` unless
   the operator explicitly asked for it in this turn.
5. Never `git stash` to hide work temporarily. Commit a WIP branch.
6. Slash commands like `/model` go through `MSYS_NO_PATHCONV=1 c4 send`
   so Git Bash does not rewrite the leading `/`.

## Approval protocol (blind approval is banned)

Before sending `c4 key <name> Enter` you MUST:

1. `c4 read-now <name>` or `c4 scrollback <name>` - read exactly what
   the worker is asking for.
2. Judge: is the requested file/command inside the worker's scope, is
   it safe (no `rm -rf`, no `git push --force`, no dropped tables), and
   is the question actually needed?
3. Only then either `c4 key <name> Enter` (approve), `c4 send <name>
   "<correction>"` (redirect), or `c4 close <name>` (abort).

Do not set up cron jobs or polling loops that blindly send Enter. The
5.28 incident is documented in `docs/known-issues.md`.

## Merge criteria (apply before `c4 merge`)

- Tests pass. `npm test` is green on the worker branch.
- Docs touched: TODO.md entry flipped to `done`, CHANGELOG.md updated,
  `docs/patches/<id>-<slug>.md` exists.
- Diff reviewed. No destructive changes (no drops, no secret commits,
  no mass deletions).
- Branch is rebased onto `main` or conflicts resolved manually - never
  `git reset --hard` somebody else's work.

## Anti-spawn (stop creating duplicate workers)

Before `c4 new <name>`:

1. `c4 list` to confirm the worker does not already exist.
2. If the task belongs to an existing worker branch, `c4 task <existing>`
   instead of spawning a new one.
3. Manager must not spawn more than `config.maxWorkers` live workers.
4. Attached sessions count against capacity too - check the tree.

## Ack

Reply `rules received` in your next assistant turn so the daemon can
confirm the re-injection landed.
