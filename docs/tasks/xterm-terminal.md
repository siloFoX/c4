# TODO 8.24 + 8.27 - xterm.js terminal emulator

**Status:** done
**Branch:** `c4/xterm-fix` (worktree `c4/xterm-terminal` per task brief)
**Scope:** Replace the append-only `stripAnsi` pre-block in
`web/src/components/WorkerDetail.tsx` with a real xterm.js terminal
so Claude Code's in-place redraws (spinner, thinking box, alt-screen
TUI) render correctly and do not accumulate. Fold 8.27 (auto-fit
requires tab switch) into the same change because the fix is a
different code path - fit-addon + lifecycle-aware ResizeObserver.

## Reproduction

1. `npm --prefix web run dev`, open a worker, switch to Terminal.
2. Send a prompt that triggers Claude Code's spinner / thinking box.
3. Before 8.24: the spinner frame + thinking box are re-emitted on
   every render tick. stripAnsi drops the cursor-up / `ESC[2K` /
   save-restore / alt-screen sequences, so each frame appends. The
   pre-block grows unbounded, auto-scroll fires, the "what is the
   worker actually showing right now" signal is buried in history.
4. Before 8.27: resize the window or toggle the sidebar while Terminal
   is the active tab - cols update. Switch to Chat, resize, switch
   back - the terminal still renders with the stale cols until the
   next tab flip.
5. After 8.24: xterm.js parses ANSI, the spinner renders in place,
   alt-screen TUIs (htop, fzf, Claude Code's prompt list) paint at
   the correct cell positions. After 8.27 (same patch): fit-addon +
   ResizeObserver stay wired regardless of tab state.

## Design

### Dependencies (package.json)

- `xterm` (core terminal emulator)
- `@xterm/addon-fit` (measure container -> cols/rows)
- `@xterm/addon-search` (Ctrl+F search)
- `@xterm/addon-web-links` (click-to-open http(s)://)

Single `npm --prefix web install <pkgs>` call. Pinned by npm to the
current @xterm major; do not hand-pin in package.json so Dependabot
stays useful.

### XtermView.tsx

- Mounts one `Terminal` per worker (keyed by `workerName`) with:
  - `fontFamily: "ui-monospace, SFMono-Regular, ..."` matching the
    existing shadcn mono stack.
  - `convertEol: true` so lone LFs advance lines without carriage
    return (Claude Code already emits CRLF, but safer for `scrollback`).
  - `scrollback: 5000` so the user can scroll back through a long
    session before xterm starts dropping lines.
  - `cursorBlink: false` - this is a read-only view of a remote PTY.
- Loads `FitAddon`, `SearchAddon`, `WebLinksAddon` via `loadAddon`.
- Opens a SSE connection to `/api/watch?name=...` identical to
  `ChatView` (same auth via `eventSourceUrl`). Decodes each base64
  `output` chunk and feeds it to `term.write(chunk)`. **No stripAnsi.**
- Theme: reads CSS custom properties from the mounted element so the
  terminal tracks `--background`, `--foreground`, `--muted-foreground`,
  etc. Re-applies on the document `theme-change` event
  (`MutationObserver` on `<html>` classList). Works for light + dark.
- Alt-screen scroll behaviour: no custom logic needed - xterm already
  freezes scrollback when the buffer is `alternate`. Expose
  `term.buffer.active.type` through a small helper so the test can
  source-grep the branch.
- ResizeObserver on the xterm container plus a window `resize`
  listener. Both call `fit.fit()` wrapped in a 120ms debounce and
  then POST `/api/resize` with the resulting `cols` / `rows` so the
  daemon-side PTY matches. This is 8.27: the observer is attached
  when the component mounts and disconnected when it unmounts. It
  does **not** depend on tab state; WorkerDetail keeps the Terminal
  tab mounted behind `visibility: hidden` when another tab is
  active, so `fit()` keeps receiving size changes.
- Ctrl+F opens a minimal search overlay that calls
  `search.findNext(query)`. Escape clears.

### WorkerDetail.tsx

- Swap the `<pre>` block for `<XtermView>`.
- Retain the font-size / auto-fit / cols presentation controls for
  parity with 8.13/8.22 (they now drive XtermView props).
- Retain `Screen` / `Scrollback` tab skeleton for the fallback
  read-now / scrollback path; `Screen` is xterm, `Scrollback` keeps
  the stripAnsi pre so users can grep historical output without
  xterm's virtual-scrolling semantics.

### Tests (tests/xterm-view.test.js)

Same node:test + source-grep pattern as 8.21 / 8.23:

1. `web/package.json` declares `xterm` + `@xterm/addon-fit`
   + `@xterm/addon-search` + `@xterm/addon-web-links`.
2. `XtermView.tsx`:
   - imports `Terminal` from `xterm`.
   - imports `FitAddon` + `SearchAddon` + `WebLinksAddon`.
   - calls `term.loadAddon(fitAddon)` + `term.loadAddon(searchAddon)`
     + `term.loadAddon(webLinksAddon)`.
   - subscribes to `/api/watch?name=<workerName>` via
     `eventSourceUrl` + `new EventSource(url)` (same shape as
     ChatView).
   - never calls stripAnsi (the new view must preserve ANSI).
   - reads `term.buffer.active.type` so the alt-screen branch can be
     introspected.
   - wires `ResizeObserver` + `window.addEventListener('resize', ...)`
     + calls `fitAddon.fit()`.
   - maps xterm theme to the shadcn CSS vars (grep for
     `--background` + `--foreground` + `--muted-foreground`).
3. `WorkerDetail.tsx` renders `<XtermView` on the Screen tab; the
   old stripAnsi code path is gone from the terminal branch.

Full suite must pass unchanged otherwise.

### Docs

- `docs/patches/8.24-xterm-terminal.md` - patch note.
- `CHANGELOG.md` - Unreleased entry.
- `TODO.md` - 8.24 + 8.27 flipped to `done`.

## Out of scope

- 8.25 (Chat history backfill) stays separate.
- Server-side PTY work. xterm.js is a pure client change; the
  daemon already emits raw PTY bytes over SSE.
- Replacing the JSONL Conversation tab - that is a different view
  (structured per-turn), not a terminal emulation.
