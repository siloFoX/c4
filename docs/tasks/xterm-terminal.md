# TODO 8.24 — xterm.js terminal emulator (ANSI cursor control)

Branch: `c4/xterm-terminal` (auto-created).
Base off `main` (8.21-8.23 all shipped).

---

## Problem

`web/src/components/WorkerDetail.tsx` currently renders the PTY stream
by appending `stripAnsi(chunk)` into a `<pre>`. Claude Code's TUI uses
ANSI cursor control for spinners, "thinking" boxes, progress bars,
alt-screen switches — all of which become duplicated append-only
garbage in the current renderer. User report 2026-04-20:

> auto fit이 문제가 아니고 Claude Code는 렌더링을 계속 하는데 바뀐
> 부분만 뜨게 하거나 스크롤 조절이 안 됨.

Root cause: no terminal emulator, just a string pipe.

---

## Fix (P1 — MUST LAND)

### 1. Drop xterm.js into web/

```bash
cd /root/c4-worktree-xterm-terminal/web
npm install xterm @xterm/addon-fit @xterm/addon-search @xterm/addon-web-links
```

Use the scoped `@xterm/addon-*` packages (the older `xterm-addon-*`
are deprecated). `xterm` core stays unscoped.

### 2. `web/src/components/XtermView.tsx` (new)

Replace the `<pre>` + append logic in `WorkerDetail.tsx`'s Terminal
view path with an `XtermView` component that:

- Creates a single `Terminal` instance per worker (keyed by
  `workerName` + session) — remount if session changes, otherwise
  reuse across tab switches.
- Wires `FitAddon` + `SearchAddon` + `WebLinksAddon`.
- On mount, fetches existing scrollback via the daemon scrollback
  endpoint (there is already a `/api/scrollback?name=` — grep for
  the exact name) and `terminal.write(snapshot)` before hooking SSE.
- Subscribes to the existing `/api/watch` SSE stream and pipes
  incoming PTY chunks directly into `terminal.write(chunk)`. Do NOT
  strip ANSI — xterm handles it.
- Dispose on unmount.

The existing auto-fit logic in `WorkerDetail.tsx` (ResizeObserver +
120ms debounce + POST /api/resize from 8.22) stays, but delegate the
cols/rows calculation to `fitAddon.proposeDimensions()` instead of
the hand-rolled ruler measurement. POST /api/resize still fires with
the proposed dims so the server PTY resizes too.

### 3. Scroll + alt-screen handling

- When xterm is in alt-screen mode (`terminal.buffer.active.type ===
  'alternate'`), pin the scroll — don't auto-scroll on write (xterm
  does this natively; just don't force scrollToBottom).
- In normal-screen mode, auto-scroll on write unless the user has
  scrolled up. `terminal.onScroll` + comparing
  `terminal.buffer.active.viewportY + terminal.rows` to the bottom
  gives the "user is reading history" signal.
- A "jump to bottom" button appears when the user is scrolled up
  (shadcn `<Button variant="secondary" size="sm">`, bottom-right of
  the terminal container, click -> `terminal.scrollToBottom()`).

### 4. Theme

Use CSS variables from the existing shadcn setup. Build an xterm
`ITheme` object whose color keys map to `--background`,
`--foreground`, `--muted`, `--muted-foreground`, and the standard
ANSI palette. Read them at construction time via
`getComputedStyle(document.documentElement)`.

Re-apply theme when the `dark`/`light` class on `<html>` flips (the
8.20A settings page does this). Listen on a `MutationObserver` for
`classList` changes on `document.documentElement` and call
`terminal.options = { theme: nextTheme }`.

### 5. Copy + search

- xterm's selection + `terminal.getSelection()` gives copy-on-select.
  Wire a Ctrl-C / Cmd-C handler that does `navigator.clipboard.writeText`.
- Search bar (shadcn `<Input>`, Ctrl-F focuses it) calls
  `searchAddon.findNext(term, { caseSensitive: false })` /
  `findPrevious`. Esc closes + `terminal.focus()`.

### 6. Conversation tab stays

The 8.18 JSONL ConversationView stays untouched — it's the
structured session view, xterm is the raw terminal view. Keep both
tabs in `WorkerDetail`.

---

## Tests

`tests/xterm-terminal.test.js` — source-grep + component wiring
(tests don't run a real xterm in jsdom; headless coverage is the
8.22 baseline):

- `web/package.json` — `xterm` + `@xterm/addon-fit` +
  `@xterm/addon-search` deps.
- `web/src/components/XtermView.tsx` — `Terminal` import from
  `xterm`, `FitAddon` import, `SearchAddon` import, `WebLinksAddon`
  import, theme resolution, SSE hook, scrollback fetch, dispose on
  unmount.
- `web/src/components/WorkerDetail.tsx` — renders `<XtermView>`
  where the old `<pre>` was, `fitAddon.proposeDimensions()` replacing
  the hand-rolled ruler, auto-scroll guard via
  `buffer.active.type === 'alternate'`.
- `web/src/lib/xterm-theme.ts` (new) — `buildXtermTheme()` reads
  CSS vars; test asserts the function exists + returns an object
  with `background` / `foreground` / `cursor`.

Full suite **108 -> 109 pass**.

---

## Docs

- `docs/patches/8.24-xterm-terminal.md` — what changed, why xterm.js,
  new web deps (`xterm`, three addons), theme mapping, how to test
  manually (spin a worker, run a long Claude Code task, confirm
  spinners redraw in place).
- `TODO.md` — flip 8.24 to **done**.
- `CHANGELOG.md` — `[Unreleased]` Changed + Added entries.

---

## Rules

- Branch: `c4/xterm-terminal` (auto-created). Base off `main`.
- Never merge yourself.
- No compound bash — `git -C`, separate commands.
- Worker routine: implement → `npm test` → `cd web && npm run build`
  (TypeScript must pass) → docs → commit → push.
- If adding dev-only or runtime deps, update `web/package.json` +
  run `npm install` in `web/` so `package-lock.json` reflects.
- Do NOT touch 8.21 / 8.22 / 8.23 scope.
- Use `/root/c4-worktree-xterm-terminal` worktree.
- 8.27 (ResizeObserver lifecycle) is blocked on this work — don't
  touch it here, but leave the fit-addon lifecycle clean so 8.27
  can finish cleanly after.

Start with (1) deps, (2) XtermView skeleton, (3) SSE wiring, (4)
theme + addons, (5) WorkerDetail swap, (6) tests + docs + commit.
