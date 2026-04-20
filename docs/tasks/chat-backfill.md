# TODO 8.25 — ChatView history backfill

Branch: `c4/chat-backfill` (auto-created).
Base off `main` (8.21-8.23 all shipped).

---

## Problem

`web/src/components/ChatView.tsx` only subscribes to `/api/watch` SSE
for real-time chunks. On mount / refresh / worker-switch, the view
shows "No messages yet" even when scrollback holds hundreds of lines.
User report 2026-04-20:

> chat에서 과거에 나온 거 왜 안 나와?

---

## Fix (P1 — MUST LAND)

### 1. Mount-time backfill from JSONL (preferred)

On mount (or when `workerName` changes), fetch the worker's current
Claude Code session JSONL:

```
GET /api/sessions?workerName=<name>
  -> { sessionId, jsonlPath, messages: [...] }  (8.18 session-parser shape)
```

If the endpoint doesn't exist yet (check `src/daemon.js` for the 8.18
routes — `/api/sessions/:id` definitely exists; a `workerName` query
may need a new route that does the lookup internally), add it:

- Read `~/.c4/worker-state.json` (or wherever `pty-manager.js` stores
  `sessionId` per worker) to resolve worker → sessionId.
- Reuse `src/session-parser.js` (8.18) to parse the JSONL and return
  the same `Conversation` shape the 8.18 code already produces.
- Gated by `auth.checkRequest` + `rbac.ACTIONS.WORKER_READ`.

### 2. Fallback: scrollback

If the worker has no active Claude Code session (plain bash / exited
/ attached-only), fall back to `GET /api/scrollback?name=<worker>&lines=2000`
(already exists). Strip ANSI and parse into `{role: 'user' | 'worker',
text}` bubbles using simple heuristics — this is best-effort, the
JSONL path is the primary.

### 3. Stitching backfill with SSE

After backfill completes, connect SSE. De-dup incoming messages:

- If backfill comes from JSONL, each message has a stable `turn` id
  or `timestamp`. Keep a `Set<string>` of seen ids; skip SSE chunks
  whose id is already in the set.
- If backfill is scrollback, there's no id — use a "freeze the
  backfill at time T, only accept SSE messages after T" policy.

### 4. UX polish

- Loading skeleton (`shadcn Skeleton` x 3) while backfill is pending.
- Badge: `Loaded {N} past messages` at the top of the chat, dismissible.
- "Load older" button at the top when scrolled to top — triggers
  `GET /api/sessions/:id?before=<cursor>&limit=50` for pagination.
  If the endpoint doesn't exist, mark as P2 and add a stub that
  always returns empty with a note.
- Worker switch resets all state. Do not persist chat history across
  worker selection.

---

## Tests

`tests/chat-backfill.test.js` — mix of real unit + source-grep:

Real units:
1. `web/src/lib/chat-history.ts` (new pure helper): `mergeBackfillWithStream(backfill, streamed, seenIds)` — given a backfill array + a streamed array + a seen-id set, returns the deduplicated merged list in chronological order. Cover: empty backfill, empty stream, overlapping ids (backfill wins), out-of-order timestamps.
2. `parseScrollbackBubbles(raw: string)` (new) — naive bubble parser: split on `\n`, detect user-input lines by leading `> ` or `❯ `, everything else is worker. Cover: empty, single user, single worker, mixed, ANSI-stripped.

Source-grep:
3. `ChatView.tsx` — uses `mergeBackfillWithStream`, fetches `/api/sessions?workerName=`, falls back to `/api/scrollback?name=`, shows `Loaded ... past messages` badge, resets state on `workerName` change.
4. `src/daemon.js` — `?workerName=` query path on `/api/sessions` (or a new route), RBAC gate, 404 when worker has no session.

Full suite **108 -> 109 pass** (new file).

---

## Docs

- `docs/patches/8.25-chat-backfill.md` — backfill flow, dedup strategy,
  fallback to scrollback, new helper API.
- `TODO.md` — flip 8.25 to **done**.
- `CHANGELOG.md` — `[Unreleased]` Added entry.

---

## Rules

- Branch: `c4/chat-backfill` (auto-created). Base off `main`.
- Never merge yourself.
- No compound bash.
- Worker routine: implement → `npm test` → `cd web && npm run build`
  → docs → commit → push.
- Do NOT touch 8.24 scope (xterm + WorkerDetail). This TODO is
  ChatView only.
- Use `/root/c4-worktree-chat-backfill` worktree.

Start with (1) daemon endpoint, (2) helpers, (3) ChatView wiring,
(4) skeleton + badge + older-load, (5) tests + docs.
