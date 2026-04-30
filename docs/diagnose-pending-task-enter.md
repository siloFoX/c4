# Diagnosing pendingTask Enter regressions (TODO 7.22)

If a worker keeps stalling after `c4 task` / `c4 send` and a single
manual `c4 key <name> Enter` unblocks it, you are likely hitting the
class of Enter-misses tracked under TODO 7.22.

c4 1.6.16 already mitigates this with verify-and-retry inside
`_writeTaskAndEnter` (re-sends `\r` up to 3 times if the task text is
still in the input prompt). The notes below help confirm whether the
mitigation fired and capture timing data when a regression slips past
it.

## 1. Turn on Enter timing log

In `config.json`:

```jsonc
{
  "workerDefaults": {
    "logEnterTiming": true
  }
}
```

`c4 daemon restart` to pick it up. Each task delivery now adds a
snapshot like:

```
[C4 TIMING] write=830ms delay=200ms cr=ok len=2120
```

(`cr=fail` means the PTY was already closed — separate failure mode.)

## 2. Run the repro harness

Spawn 3 parallel workers and send a >2KB task to each, then look for
either Enter-retry or "still typed" snapshots:

```bash
c4 daemon restart
c4 new etest1
c4 new etest2
c4 new etest3
c4 wait etest1 etest2 etest3 --all 30000

# 2KB+ task that exercises chunked write
TASK="$(node -e 'process.stdout.write("Print 50 numbered facts about " +
  "Korean cuisine, each on its own line, with no commentary. " +
  "After the last line emit the literal token DONE.")')"

c4 send etest1 "$TASK"
c4 send etest2 "$TASK"
c4 send etest3 "$TASK"
c4 wait --all 60000
```

Then inspect:

```bash
c4 read etest1 | head -50
c4 read etest2 | head -50
c4 read etest3 | head -50
```

Look for these markers:

- `[C4] pendingTask Enter retry #N — task text still in input prompt`
  - The verify path caught the miss; mitigation worked.
- `[C4 WARN] pendingTask Enter-only fallback`
  - Timeout fallback caught it; the task was typed but Enter was lost
    and the polling timer never confirmed idle.
- Worker stuck idle but the input prompt still shows the task text and
  no retry markers fired
  - This is a fresh failure mode. Capture the worker's `events-*.jsonl`,
    `[C4 TIMING]` snapshots, and the daemon log and file an issue.

## 3. What the verify path checks

`_isTaskTextInInput(screen, text)` keeps a 30-char fingerprint of the
task and looks for `❯` followed by that fingerprint in the **last 6
lines** of the rendered screen (so a chat-history occurrence of the
same text does not trigger a false retry).

## 4. Knobs

| Field | Default | Purpose |
|-------|---------|---------|
| `workerDefaults.enterDelayMs` | 200 | Delay between text and `\r`. Bump to 300-400 on slow Windows conpty boxes. |
| `workerDefaults.pendingTaskTimeout` | 30000 | Hard timeout before fallback fires. |
| `workerDefaults.logEnterTiming` | false | Emit `[C4 TIMING]` snapshot per delivery. |
