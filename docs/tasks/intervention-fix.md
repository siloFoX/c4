# TODO 8.21 — Intervention / escalation false-positive fix

Branch: `c4/intervention-fix` (auto-created by c4 worker spawn).
Base off `main` (which now has 8.22 ux-visual and 8.23 mobile-audit shipped).

The `intervention` column in `c4 list` flags workers that don't
actually need human attention, and the sticky flag never clears once
set. Current observed false positives on 2026-04-19 ~ 20:

- **ux-explorer**: spawned a helper `vite` on port 5174 during its
  audit. After the audit completed, vite exited 144 (normal shutdown)
  but that fired the `escalation` flag — there was nothing to
  intervene on, the child had exited on purpose.
- **c4-mgr-auto**: idle for hours, but the `escalation` flag from a
  long-ago resolved intervention never cleared — the flag is sticky.
- **Monitor cron**: runs `c4 read-now <name>` against every flagged
  worker every tick, burning tokens on workers that aren't actually
  stuck.

---

## Investigate first

Before editing, map the current code:

1. Where is `intervention` computed / set? Grep:
   - `src/pty-manager.js` — worker row shape, `intervention` field.
   - `src/daemon.js` — `list()` route assembly, `escalation` detection.
   - `src/stall-detection.js` / `src/state-machine.js` — stall logic.
   - `tests/stall-detection.test.js` — expected states.
2. Find the detection criteria. Is it really an OR-combination of
   "background job non-zero exit" / "past intervention history" /
   "approval prompt on screen"? Document what you find at the top of
   your patch note.
3. Find where the flag is cleared. If `escalation` is set but never
   reset, that's the sticky-state bug. Look for resets on
   `user-message` / `key-sent` / `next-task` / `successful-read-now`.

---

## Fix (P1 — MUST LAND)

### 1. Split "active approval prompt" from "past event"

`intervention` today conflates several conditions. Split into
explicit states on the worker row (shape is negotiable; this is the
target):

```js
// pty-manager list() row:
{
  intervention: 'approval_pending' | 'idle' | 'background_exit' | 'past_resolved' | null,
  hasPastIntervention: boolean,  // ever flagged, informational
  lastInterventionAt: string | null,
}
```

- `approval_pending`: the live terminal has a TUI approval prompt
  visible ("Do you want to...?", `Continue?`, `[y/N]`, etc.). This is
  the only state that actually warrants human attention.
- `background_exit`: a spawned child died with non-zero exit but the
  worker itself is running fine. Informational. Do NOT route to cron.
- `past_resolved`: flag was active at some point, has since cleared.
  Read-only breadcrumb; should NOT trigger escalation alerts.
- `idle`: worker is idle, no active prompt. Default.

The existing `intervention` string field can keep existing semantics
for back-compat but should only equal `'approval_pending'` /
`'background_exit'` / `null`; callers that care about "needs human"
should check `=== 'approval_pending'` explicitly, not truthy.

If renaming is risky (API consumers elsewhere), keep the existing
field name but narrow its semantics + add the new fields alongside
with JSDoc explaining the change.

### 2. Sticky-state clear

When does `intervention` become `null` again?

- Approval prompt disappears from the last N lines of the terminal
  snapshot (re-run the detector per snapshot, don't cache).
- User sends an `Enter` / typed text / closes the worker.
- Task completes (`status: 'idle'` + no prompt text).

Add a `clearInterventionIfResolved(workerRow, snapshot)` helper on
pty-manager that runs every list() call (it's cheap; the detector is
a small regex sweep).

### 3. Don't escalate on expected background exits

When `src/pty-manager.js` reaps a spawned background child:

- Exit code 0 → no flag (already correct).
- Exit code non-zero BUT the parent worker is still running + no
  approval prompt → set `intervention: 'background_exit'` (downgraded
  from `escalation`).
- Exit code non-zero AND the worker subsequently hits stall (>10 min
  no output + no prompt) → THEN escalate. This is the original intent.

### 4. Monitor cron token savings

Find the autonomous-loop cron / monitor prompt (check
`src/autonomous-loop.js`, `src/autonomous-queue.js`, or wherever the
watcher is — grep for `intervention` usages). Narrow the "which
workers need read-now" predicate to `intervention === 'approval_pending'`
only. Past resolved / background-exit workers should NOT get a
read-now call.

---

## `c4 list` UI/JSON surface (P2)

`c4 list --json` should emit the new fields. Human-readable `c4 list`
table: the `Intervention` column should show:

- Empty for `null` / `idle` / `past_resolved`
- `APPROVAL` (red) for `approval_pending`
- `bg-exit` (yellow) for `background_exit`

Truncate to fit the column width the existing table uses.

---

## Tests

`tests/intervention-fix.test.js` — new file with real unit coverage,
NOT pure source-grep:

1. `clearInterventionIfResolved`: pass a mock snapshot without a
   prompt → flag clears; pass one with `Do you want to proceed?`
   visible → flag stays.
2. Approval-prompt detector: regex + sample strings (at least 4 real
   Claude Code TUI prompts from the wild; grep scrollback history if
   needed or use representative samples).
3. Background-exit downgrade: simulate `child.exit` with code=1 while
   parent is alive → `intervention === 'background_exit'`, not
   `'escalation'`.
4. Stall + background-exit promotes to escalation: same scenario as
   (3), then advance fake clock 11min with no output → flag escalates
   to `'approval_pending'` / `'stall'`. (Keep whatever the existing
   stall name is if renaming is invasive.)
5. Source-grep on the monitor cron change so future refactors don't
   silently re-broaden the predicate.

`tests/stall-detection.test.js` + `tests/state-machine.test.js`:
update any existing assertions that broke because the field semantics
narrowed. Do NOT relax them — fix the call sites to use the new
explicit states.

Full suite must be **107 -> 108 pass** (add 1 new test file, keep all
existing tests green).

---

## Docs

- `docs/patches/8.21-intervention-fix.md` — what the old logic was
  (the OR-combination), what the new semantics are, the sticky-state
  fix, the monitor cron predicate narrowing, any API-shape changes.
- `TODO.md`: flip 8.21 to **done** with a compact summary row
  matching the Phase 8 format.
- `CHANGELOG.md`: `[Unreleased]` section — Fixed entry for sticky
  escalation flag + token-waste on monitor cron; Changed entry if
  the field shape changed.

---

## Rules

- Branch: `c4/intervention-fix` (will be auto-created). Base off `main`.
- Never merge yourself — the manager merges.
- No compound bash (`&&`, `|`, `;`) — `git -C`, separate commands.
- Worker routine: implement → `npm test` → docs → commit → push.
- If spec has ambiguity, make the call, record it in the patch note.
- Do NOT touch 8.22 or 8.23 scope (both shipped on main).
- Use `/root/c4-worktree-intervention-fix` worktree.
- Special caution: the autonomous-loop / monitor cron touches
  production flags that c4-mgr-auto itself reads. Test on a throwaway
  worker first; don't kill the manager loop.

Start with investigation (grep + read current semantics), then
implement fixes in order P1.1 → P1.4, then P2 surfaces, then tests
+ docs + commit.
