# TODO 8.26 — Monitoring gap / approval miss prevention

Branch: `c4/monitor-gap` (auto-created).
Base off `main` (8.21-8.23 all shipped).

---

## Problem

`c4 wait --interrupt-on-intervention` currently returns as soon as
the worker enters idle. If the worker becomes idle because it's
waiting on an approval prompt (a different kind of idle), and the
reviewer session doesn't re-arm the wait, the approval sits for up
to 30 minutes until the next monitor cron fires. User report
2026-04-20:

> 일 안 하는 거 아냐? todo에 놓치지 않게 해줘야지.

Actual case: the manager was blocked on a `bash /tmp/run-tests-main.sh`
approval prompt for 20+ minutes while reviewer sessions were all in
idle+no-wait state.

---

## Fix (P1 — MUST LAND)

### 1. Daemon SSE intervention event stream

New endpoint `GET /api/events/interventions` (auth-gated, RBAC action
`FLEET_WATCH`) — SSE stream that emits an event every time any
worker's `intervention` field changes to `approval_pending` (8.21
narrowed this), and another event when it clears. Payload:

```json
event: intervention
data: {
  "worker": "<name>",
  "state": "approval_pending" | "cleared",
  "lastQuestion": "<tail-extracted prompt text or null>",
  "since": "<ISO timestamp of transition>"
}
```

Hook into `src/pty-manager.js` — wherever `_interventionState`
transitions happen, emit a change event on a shared EventEmitter.
`src/daemon.js`'s SSE handler subscribes and forwards.

### 2. `c4 watch-interventions` CLI

New subcommand in `src/cli.js`:

```
c4 watch-interventions              # stream forever, one line per event
c4 watch-interventions --once       # exit after the next event
c4 watch-interventions --notify     # also print ANSI bell + Slack ping
```

Uses the SSE endpoint above. Exits cleanly on Ctrl-C. Prints:

```
[2026-04-20T07:12:03Z] APPROVAL  <worker>  <first 80 chars of prompt>
[2026-04-20T07:14:12Z] CLEARED   <worker>
```

### 3. Slack timeout ping

Daemon-internal: if a worker's `intervention === 'approval_pending'`
for more than `config.notifications.approvalTimeout` seconds
(default **60**), emit a Slack notification via the 8.15 event
emitter. Don't re-emit every tick — only once per approval episode.
Reset the "already pinged" flag when the state clears.

Config knob in `config.json` under `notifications`:
```json
"approval": {
  "slackAfterSeconds": 60,
  "autoRejectAfterSeconds": 3600
}
```

### 4. Persistent reviewer wait (P2 within scope)

Add a `--follow` flag to `c4 wait --interrupt-on-intervention`. When
present, after an intervention is delivered, do NOT exit — re-arm
the wait for the next one. The existing flag returns immediately on
the first hit; `--follow` keeps streaming. Prints the same format as
`c4 watch-interventions` for consistency.

### 5. Auto-reject timeout (P2)

If an approval is pending for `autoRejectAfterSeconds` (default **3600**),
daemon sends Ctrl-C to the worker and emits a Slack notification
(`approval_timeout` event type). This is a safety net, not the
primary flow — don't let it fire inside a normal review cycle.

Gated behind `config.notifications.approval.autoRejectEnabled: false`
by default (opt-in).

### 6. Manager rulebook update

Update `.claude/agents/manager.md` with guidance:

- Prefer `c4 watch-interventions --notify` in a background shell
  over polling `c4 list` in a loop.
- Or `c4 wait --follow --interrupt-on-intervention` for a single
  worker.
- Cron-based monitoring is a safety net, not the primary path —
  cron cadence can stay at 30min since persistent watcher catches
  everything within seconds.

---

## Tests

`tests/monitor-gap.test.js` — real unit coverage:

1. EventEmitter hook: call the pty-manager transition helper with
   `(worker, 'approval_pending')` → emitter fires `intervention`
   event with correct payload.
2. Transition dedup: two back-to-back `approval_pending`s for the
   same worker → only one event. Transition through `null` between
   them → two events.
3. SSE handler source-grep: `/api/events/interventions` route,
   `FLEET_WATCH` RBAC gate, writes `event: intervention\n`,
   flushes on each change.
4. `c4 watch-interventions` CLI: `--once` exits after one event,
   `--notify` emits Slack on receipt.
5. Slack timeout: mock clock, set approval-pending at t=0, advance
   to t=60s → Slack emit called once; advance to t=120s without
   transition → still only one call.
6. `c4 wait --follow`: first event does not exit; second event
   prints + keeps waiting.

Full suite **108 -> 109 pass** (new file).

---

## Docs

- `docs/patches/8.26-monitor-gap.md` — SSE event stream, CLI
  subcommand, Slack timeout, manager rule update.
- `TODO.md` — flip 8.26 to **done**.
- `CHANGELOG.md` — `[Unreleased]` Added entries.
- `.claude/agents/manager.md` — new section "Monitoring approval
  requests" under the operating protocol.

---

## Rules

- Branch: `c4/monitor-gap` (auto-created). Base off `main`.
- Never merge yourself.
- No compound bash.
- Worker routine: implement → `npm test` → docs → commit → push.
- Do NOT touch 8.24 / 8.25 scope.
- Use `/root/c4-worktree-monitor-gap` worktree.
- Special caution: the intervention event emitter runs inside the
  live daemon that spawned you. Test the emitter in isolation; do
  not crash pty-manager.

Start with (1) EventEmitter hook in pty-manager, (2) SSE endpoint,
(3) CLI subcommand, (4) Slack timeout, (5) `--follow` flag, (6)
tests + docs + commit.
