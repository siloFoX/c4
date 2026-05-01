# pm-board — append-only kanban + TODO.md two-way sync

## Why

Distinct from the 10.8 `ProjectBoard` (full project management with milestones / sprints / tasks): `PmBoard` is a lightweight per-project kanban that appends one event per move/create/delete to a JSONL log. State replays from the log on boot — no separate snapshot file to keep in sync.

The TODO.md two-way sync makes external editors (vim / VS Code / GitHub Web) and the board agree on truth: edit TODO.md by hand → next sync imports the new rows; move a card on the board → next sync writes back the new TODO.md.

## What changed

### `src/pm-board.js`

Append-only JSONL event log per project at `~/.c4/board-<projectId>.jsonl`. Events:

- `{type: 'create', cardId, title, description, status, assignee, tags}`
- `{type: 'update', cardId, ...patch}`
- `{type: 'move', cardId, to}`
- `{type: 'delete', cardId}`

State map replays from the log on every read (`get(project)`).

Columns: `backlog / in_progress / review / done` (overridable via `STATUSES`).

API:

- `createCard(project, {title, description?, status?, assignee?, tags?})`
- `updateCard(project, cardId, patch)`
- `moveCard(project, cardId, to)`
- `deleteCard(project, cardId)`
- `get(project)` — `{project, statuses, columns: {<status>: [card, ...]}}`
- `importTodoMd(project, todoPath)` — parse markdown table, emit `create` / `update` events

### Daemon wireup (`src/daemon.js`)

Optional emit-SSE hook: when `manager._emitSSE` exists, `_append` fires `board_event` so Web UI subscribers see the move in real time.

## Tests

- `tests/pm-board.test.js`

## Live verification (2026-05-01)

```
$ node /tmp/test-pm-board.js
created: c4-momh0h34-wfks c4-momh0h35-pzwe
total cards: 2
  [in_progress] Fix login bug
  [done] Refactor API
replay: 2 cards from JSONL
OK: append-only JSONL + replay works
```

(Two cards created → moved across columns → fresh PmBoard instance reads them back from the JSONL with correct columns.)
