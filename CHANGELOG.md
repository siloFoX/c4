# Changelog

## [Unreleased]

### Added
- **(11.5) Risk classifier (Shadow Execution building block).** New
  `src/risk-classifier.js` — pure synchronous module, zero runtime
  dependencies. `classifyCommand(cmd)` returns `{ level: 'low' |
  'medium' | 'high' | 'critical', reasons: [{code, label, snippet}],
  suggestedAction: 'allow' | 'review' | 'deny', decoded }`. 28
  patterns across 3 tiers — critical (rm-rf-root, fork-bomb, mkfs,
  dd-block-device, curl-pipe-shell, eval-base64, etc.), high
  (rm-rf-dir incl. absolute paths like `/etc` and env-var dirs like
  `$TMPDIR`, chmod -R 777, kill-all, find-delete, git-force-push,
  system-files, ssh-known-hosts, docker-privileged,
  reboot-shutdown), medium (sudo, git-push, npm-publish,
  --no-verify, curl-script, apt-install, cron-edit). Obfuscation
  defeat: `echo "<b64>" | base64 -d` inline decode, `$()` /
  backtick command-substitution unwrap, alphabetic quoted segment
  splitting (`r"m"` → `rm`, `p"k"i"l"l` → `pkill`) without mangling
  normal quoted args. Both `rm-rf-root` and `rm-rf-tilde` accept
  long-flag forms (`rm --recursive --force ~`). The flag-block
  uses `\s+` (not `\s*`) to block backtracking exploits like
  `rm -rfffffff` from false-positiving as high. Exports
  `PATTERN_CATALOG` (codes unique across tiers) and
  `ACTION_BY_LEVEL` (`{critical: 'deny', high: 'review', medium:
  'review', low: 'allow'}`). Tests: `tests/risk-classifier.test.js`
  — 57 assertions across 10 suites covering tier coverage with
  variants, obfuscation defeat, multi-segment chain collapse in a
  single pass, return shape contract, PATTERN_CATALOG uniqueness,
  ACTION_BY_LEVEL mapping, _denoise idempotency. No daemon /
  web-side wiring yet — sandbox dispatcher, PreToolUse hook
  integration, per-machine rule overrides, and audit-log
  integration ship in follow-up patches. Patch note:
  `docs/patches/11.5-risk-classifier.md`.
- **(8.46) Per-worker pinned memory.** `c4 new` now accepts `--pin-memory
  <file>` (read client-side, repeatable), `--pin-rules "<text>"`
  (repeatable), and `--pin-role <manager|worker|attached>` so operators can
  attach persistent rules to a worker at creation time. A new `c4
  pinned-memory get|set <name>` subcommand mutates the rule set after the
  fact. `src/pinned-memory-scheduler.js` owns one `setInterval` per worker
  (default every 5 minutes via `config.pinnedMemory.intervalMs`) and
  subscribes to the manager's `post-compact` event (now emitted from
  `compactEvent()` so 8.45's PostCompact hook path triggers a refresh) and
  its `pinned-memory-updated` event. Each refresh writes `PINNED RULES
  REFRESHED:\n<role template>\n---\n<userRules>` into the worker PTY via
  `manager.send`. `pty-manager` persists `pinnedMemory` through
  `_saveState`/`_loadState` so daemon restarts do not drop the rule set.
  Web UI: `web/src/components/PinnedRulesEditor.tsx` renders a `Persistent
  Rules` textarea + role-template select under `WorkerDetail`, calls
  `GET/POST /api/workers/:name/pinned-memory`, and exposes a "Save and
  refresh now" button. Role defaults ship as `docs/rules/role-manager.md`,
  `role-worker.md`, `role-attached.md`. Tests: `tests/pinned-memory.test.js`
  - 29 assertions covering CLI parsing, scheduler ticks, post-compact
  subscription, role-default resolution, API route shape, metadata
  persistence, and Web UI source-grep. Patch note:
  `docs/patches/8.46-pinned-memory.md`.
- **(8.26) Approval-miss prevention mechanism.** Close the gap where
  `c4 wait --interrupt-on-intervention` returned on a worker's first
  idle and left subsequent approval prompts unattended until the
  30-minute stall-detection cron. New module
  `src/approval-monitor.js` is a pure diff-tracker that receives
  worker rows with their `publicIntervention` shape and fires
  `enter` / `exit` / `slack_alert` / `timeout` events on state
  transitions. `PtyManager` spins it on a 1-second interval (unref'd
  so it doesn't block process exit) with three collaborators:
  `getWorkers()` returns the live worker rows with
  `_interventionState` auto-cleared via the existing
  `intervention-state` helper, `slackEmit()` defers to the 8.15
  shared emitter through a new `setSlackEmitter` bridge, and
  `onAutoReject(name, message)` calls into `_autoRejectApproval`
  which sends a corrective line through the normal `send()` path
  and clears the intervention flag so the next tick fires `exit`.
  New daemon routes `GET /api/approvals` (one-shot snapshot) and
  `GET /api/approvals/stream` (SSE) let reviewer sessions subscribe
  once and receive every transition for every worker; the stream
  writes an initial snapshot frame so a mid-approval connect sees
  the current pending set without waiting for the next transition.
  New CLI: `c4 wait --follow` (persistent-connection reviewer mode
  on the existing wait command) and `c4 watch-interventions`
  (standalone command, safe to run outside a Claude Code reviewer
  session). Slack alert fires exactly once per pending span when
  `pendingMs >= slackAlertAfterMs` (default 60s) through the
  existing 8.15 `approval_request` event type — same webhook,
  dedup, level filter; `slackAlertAfterMs: 0` disables it. Per-
  approval timeout (default 1h, configurable via
  `config.monitor.approvalTimeoutMs`) fires a `timeout` event; when
  `autoReject: true` the monitor dispatches a corrective message to
  the worker and clears the intervention state. `.claude/agents/manager.md`
  now recommends `c4 wait --follow` over cron re-arming, with the
  existing "inspect before approving" rule preserved. Regression
  guards: `tests/monitor-gap.test.js` - 19 assertions across 5
  suites covering defaults, state transitions, slack / timeout /
  auto-reject thresholds, subscription semantics, and the SSE event
  formatter contract. Full suite delta: **+19 tests, 0 new
  failures**. Spec: `.c4-task.md` (TODO 8.26 row). Patch note:
  `docs/patches/8.26-monitor-gap.md`.
- **(8.28) Autonomous TODO dispatch loop.** New `src/auto-dispatcher.js`
  module exports `parseTodos(markdown)`, `sortByPriority`, `pickNext`,
  `detectPriority`, `detectUnsafe`, `extractDependencies`,
  `buildDispatchPrompt`, and an `AutoDispatcher` class with
  `tick()` / `pause()` / `resume()` / `recordHalt()` / `recordSuccess()`
  / `start()` / `stop()` / `reload()`. `parseTodos` handles GFM table
  rows including strikethrough ids (`~~7.8~~`) and bolded status
  markers (`**done**`). `detectPriority` uses explicit tag markers
  (`[urgent]` / `[긴급]` / `urgent:` / `[halt]`) so narrative mentions
  of "urgent" inside a long detail string stay `normal`; the priority
  ordering is `urgent > halt > normal` with numeric id tie-break.
  `detectUnsafe` matches compound shell connectors (`&&` / `||` /
  unescaped `;`) and the destructive patterns (`rm -rf`, `sudo`,
  `git push --force`, `shutdown`, `reboot`, `chmod -R 777`, fork-bomb)
  the spec calls out; tick pauses the loop when the picked todo trips
  the gate. Circuit breaker: 3 consecutive halt/rollback signals
  auto-pause with `pauseReason = "circuit-breaker: N consecutive
  halts"`; `resume()` zeroes the counter. Throttle window defaults to
  5 min and runs regardless of manager idle state. `src/daemon.js`
  owns one `AutoDispatcher` instance: `_buildAutoDispatcher()` returns
  `null` when `config.autonomous.mode !== true`, keeping the feature
  opt-in and backwards-compatible; `notifier` bridges
  `auto_dispatch_sent` → `safeEmit('task_start', {source:
  'auto-dispatch', ...})` and `auto_dispatch_paused` →
  `safeEmit('halt_detected', ...)` so the 8.15 event vocabulary stays
  at 10 types; `idleCheck` reads `manager.list()` and blocks dispatch
  unless the manager is `idle` without `approval_pending`; `dispatch`
  calls `manager.autoStart` for a missing manager else
  `manager.sendTask` for an idle one. Lifecycle hooks run
  `_startAutoDispatcher()` alongside `_startScheduleTick()` and
  `_stopAutoDispatcher()` in the SIGINT/SIGTERM/reload paths; the
  reload path preserves pause state + halt counter across a rebuild.
  New HTTP routes `GET /autonomous/status`, `POST /autonomous/pause`
  (body `{reason?}`), `POST /autonomous/resume`, `POST /autonomous/tick`.
  New CLI `c4 autonomous <status|pause|resume|tick> [reason]`. Config
  section `autonomous: {mode, throttleMs, circuitThreshold,
  managerName, todoPath}` with `mode: false` default so existing
  deployments stay untouched. Tests: `tests/auto-dispatch.test.js` —
  54 assertions across 12 sections (parseTodos, detectPriority,
  detectUnsafe, extractDependencies, sortByPriority + pickNext,
  comparators, AutoDispatcher core, circuit breaker, notifier hooks,
  status contract, buildDispatchPrompt, smoke against real TODO.md).
  Full suite: 106 pass / 5 pre-existing bcryptjs-not-found failures in
  `tests/{cli-api-prefix,mcp-hub,rbac,session-auth,web-control}.test.js`
  unchanged by this patch. Patch note: `docs/patches/8.28-auto-dispatch.md`.
  Reproduction base: 2026-04-20 session stalled for hours because
  reviewer forgot to nudge the next todo after manager went idle.
- **(8.33) Web UI feature docs + intuition.** Every page in the
  Features tab now opens with a shared `PageDescriptionBanner`
  (`web/src/components/PageDescriptionBanner.tsx`) carrying a 1-2 line
  summary, the matching `c4 <cmd>` CLI equivalent, a collapsible "When
  to use" list, and a collapsible concrete example, plus a Learn more
  button that opens the new help drawer. A `Tooltip` primitive
  (`web/src/components/ui/tooltip.tsx`) is wrapped around every action
  button, filter input, and checkbox across the 12 CLI-coverage pages
  so hover (and focus for keyboard users) reveals what each control
  does. A new help drawer
  (`web/src/components/HelpDrawer.tsx`) is reachable from a new Help
  icon in `AppHeader` or the `h` keyboard shortcut; it renders one
  searchable card per feature from the registry and scrolls the active
  feature into view on open. A keyboard shortcut cheat sheet
  (`web/src/components/KeyboardShortcutsModal.tsx`) is reachable via
  `?` / `Shift+/`. A dismissable 4-step onboarding tour
  (`web/src/components/OnboardingTour.tsx`) auto-opens on first visit
  (tracked by `c4.onboardingTour.v1` in localStorage) and can be
  replayed programmatically via the exported `startOnboardingTour()`
  helper. A shared `ConfirmDialog`
  (`web/src/components/ConfirmDialog.tsx`) replaces Cleanup's
  `window.confirm` with a concrete preview of the branches /
  worktrees / directories about to be removed before the user commits.
  Batch gains a "Try example" button that prefills task + count in
  count mode or tasksText in file mode from
  `batch.example` / `batch.exampleMulti`. Auto surfaces three typical
  scenarios (overnight refactor, triage backlog, spike a design) as a
  bulleted panel. All user-facing copy is loaded through a new tiny
  i18n layer (`web/src/lib/i18n.ts` + `web/src/i18n/en.json` +
  `web/src/i18n/ko.json`) with English fallback for missing ko keys;
  locale persists under `c4.locale` in localStorage, auto-detects from
  `navigator.language`, and is togglable from a new Language icon in
  the header. `HelpUIRoot` (`web/src/components/HelpUIRoot.tsx`) mounts
  the three overlays and wires the global keyboard shortcut + custom
  event contract (`HELP_EVENT_OPEN_DRAWER`,
  `HELP_EVENT_OPEN_SHORTCUTS`). Regression guard:
  `tests/ui-docs.test.js` - 100 assertions across 27 suites covering
  i18n-bundle integrity (parse, identical key set, per-page
  summary/cli/example/useCases coverage, required help/tour/shortcut
  keys, pipe-delimited useCases), component contracts for every new
  surface, per-page wiring (banner mount + summaryKey binding +
  onOpenHelp + localized Tooltip + useLocale subscription), and
  Cleanup/Batch/Auto specifics. Full suite
  **110 -> 111 pass**. `npm --prefix web run build` succeeds. Patch
  note: `docs/patches/8.33-ui-docs.md`.
- **(8.45) Post-compact hook: auto-detect + rule auto-reinject.**
  `src/post-compact-hook.js` is a new pure-logic module that watches
  worker PTY chunks for Claude Code's compact-completion markers
  (`Context compacted`, `Compacting conversation`,
  `/compact complete`, `Previous Conversation Compacted`, ...),
  debounces per worker (default 60s), and routes a role-specific rule
  template back into the worker via `manager.send`. `pty-manager` wires
  the module at three call sites: the `onData` handler scans every
  chunk, the existing `compactEvent` curl endpoint shares the same
  injection path, and the Bash permission branch runs a drift
  inspector over the first `driftWindow` (default 3) Bash commands
  that follow a compact. Forbidden patterns (`&&`, `||`, `|`, `;`
  before a word, `cd ... git`, `sleep`, `for`, `while`) force a deny
  keystroke, flip the worker to `critical_deny`, and fire a second
  re-injection. Three templates ship under `docs/rules/`: manager
  (halt-prevention + approval protocol + merge criteria + anti-spawn),
  worker (halt-prevention + task discipline + merge prep), attached
  (short form for read-only sessions). Each ends with an explicit
  `rules received` ack; the daemon arms a `verifyTimeoutMs` (default
  10s) timer and pushes a warning + Slack notification when the ack
  does not arrive. `config.example.json` grows a `postCompactHook`
  block (`enabled`, `templateDir`, `verifyTimeoutMs`, `debounceMs`,
  `driftWindow`). Tests: `tests/post-compact-hook.test.js` - 40
  node:test assertions across regex coverage, worker-type resolution,
  template fallback, banner composition, `injectRules` wiring against
  a stub manager, drift detector, and drift window lifecycle. Full
  suite: 112 passed, 0 failed. Patch note:
  `docs/patches/8.45-post-compact-hook.md`.
- **(8.25) Chat tab past-history backfill.** `web/src/components/ChatView.tsx`
  now fetches past conversation on mount (and on every `workerName`
  change) before attaching the SSE live stream. Primary path is
  `GET /api/sessions?workerName=<name>`; the daemon resolves the
  worker's current session id via `manager.getSessionId`, parses the
  JSONL through the 8.18 `session-parser`, and returns the full
  `Conversation`. ChatView maps `user`, `assistant`, and `tool_use`
  turns into chat bubbles (`thinking` / `tool_result` / `system`
  collapse into the dedicated ConversationView tab). Fallback is
  `GET /api/scrollback?name=<name>&lines=2000` with a naive `> `
  user-prompt splitter when the session JSONL is not yet resolvable
  (new worker / LOST / `--resume` miss). SSE chunks whose text already
  appears in the backfill are deduped via a `seenTextsRef` Set, plus a
  `seenIdsRef` mirror of JSONL turn ids so infinite-scroll reloads do
  not double-count either. Worker-change swaps reset history, live
  messages, dedup sets, scrollback cursor, and buffers; a
  closure-scoped `cancelled` flag short-circuits stale fetches when a
  fast swap races a slow backfill. UI additions: loading skeleton +
  "Loaded N past messages" badge, per-bubble "past" marker + opacity
  on historical bubbles, and an infinite-scroll `Load older` control
  (both auto-fires at scroll-to-top and exposes a manual button) that
  bumps the scrollback `lines` parameter by 2000 up to a 10000 cap.
  Regression guards: `tests/chat-backfill.test.js` - 27 assertions
  across 5 suites covering `conversationToMessages` / `scrollbackToMessages`
  pure helpers, SSE dedup contract, ChatView source wiring, and the
  daemon `/api/sessions?workerName=<name>` route contract. Full suite
  **108 -> 109 pass**. `npm --prefix web run build` succeeds. Spec:
  `.c4-task.md` (TODO 8.25 row). Patch note:
  `docs/patches/8.25-chat-backfill.md`.
- **(8.31) Sessions attach UX guidance and onboarding.** After 8.17
  shipped `c4 attach` and the Sessions tab gained an "Attach new..."
  button, operators reported the workflow was opaque — the button did
  not explain why, the modal asked for a JSONL path with no preview of
  what was available, post-attach rows carried a single trash icon with
  no visible "view the conversation" affordance, and nothing contrasted
  attached sessions against live workers. `web/src/components/Sessions
  View.tsx` grows five UX pieces (no new runtime deps, no backend route
  changes): (1) an `EmptyAttachBanner` with a "What is attach?"
  headline + the canonical `Import external Claude Code sessions
  (~/.claude/projects/*.jsonl) to view conversation history in c4 Web
  UI.` sentence + an `Attach your first session` primary button that
  replaces the bare empty-state string inside the Attached sub-section;
  (2) an expanded `AttachModal` that threads the already-fetched
  `/api/sessions` payload as an `available: SessionSummary[]` prop and
  renders a top-10 preview (project path, relative updated-at, turn
  count, shortened UUID, last assistant snippet) with a `Use this id`
  button per row that auto-fills the UUID input, plus a dashed
  `After attach you can:` help card listing `view full conversation
  timeline` / `search messages across sessions` / `resume the session
  via claude --resume`; (3) an
  `AttachedRowActions` panel beneath every attached row exposing
  `View conversation` (Eye icon, routes through setSelection),
  `Resume in terminal` (Terminal icon, expands an inline code block
  with the exact `claude --resume <sessionId>` command + copy button
  backed by a `copyToClipboard` helper that no-ops when the Clipboard
  API is absent), and `Detach` (Trash2 icon, unchanged call to
  `handleDetach`) — every button ships a contextual aria-label; (4) a
  `ComparisonCard` four-row table contrasting Attached vs Live along
  Mode / Source / Updates / Resume, rendered in two places (the empty
  right-pane card and as a self-ending side-card below the attached
  conversation view) so the distinction surfaces regardless of where
  the operator lands; (5) a dismissable 3-step onboarding `Tour`
  overlay gated on `localStorage['sessions-tour-v1']` (guarded
  by try/catch at both the read and write sites so private-browsing
  throws cannot crash the page) covering Welcome / Attach external
  sessions / View or resume, with Skip tour / Next / Done controls
  and an `N/3` step counter. All UX strings are exported module
  constants (`EMPTY_ATTACH_BANNER_TITLE`, `EMPTY_ATTACH_BANNER_BODY`,
  `POST_ATTACH_HELP_TITLE`, `POST_ATTACH_HELP_ITEMS`,
  `COMPARISON_TITLE`, `COMPARISON_ROWS`, `TOUR_STORAGE_KEY`,
  `TOUR_STEPS`) so the source-grep tests can pin them. The 8.17 wire
  contracts (`apiGet /api/attach/list`, `apiPost /api/attach`,
  `apiDelete /api/attach/:name`, `ConversationView` snapshotUrl =
  `/api/attach/${name}/conversation`) are preserved verbatim — the
  existing `tests/session-attach.test.js` SessionsView-wiring block
  still passes without edit. Tests: `tests/sessions-view.test.js` — 29
  source-grep assertions across 6 suites (empty-state banner 4, modal
  preview + help 7, row actions 8, comparison card 3, onboarding tour
  5, 8.17 wiring regression guards 4). Full suite 107 -> 108 pass.
  Patch note: `docs/patches/8.31-attach-ux.md`. Reproduction base:
  2026-04-20 operator note `User does not know what attach does`.

### Changed
- **(8.25) `GET /api/sessions` accepts `workerName`.** When called
  with `workerName=<name>` the daemon resolves the worker's current
  session id via `manager.getSessionId` + `sessionParser.parseJsonl`
  and responds with
  `{ sessionId, conversation, workerName }`. When no session resolves
  the endpoint returns `{ sessionId: null, conversation: null,
  workerName }` at HTTP 200 (not 404) so the client can fall back to
  `/api/scrollback`. Calling `/api/sessions` without `workerName`
  returns the legacy list-shape
  (`{ rootDir, sessions, groups, total }`) untouched - `SessionsView`
  and the 8.18 session-list consumers stay unaffected.
- **(8.24 + 8.27) WorkerDetail terminal now runs xterm.js.** The old
  append-only pre-block stripped ANSI in the browser, which meant
  Claude Code's in-place redraws (spinner frames, thinking box,
  alt-screen TUIs like htop / fzf / the prompt list) stacked up line
  by line instead of replacing the previous frame. 8.24 mounts a
  real `@xterm/xterm` Terminal inside a new
  `web/src/components/XtermView.tsx`, loads `FitAddon` +
  `SearchAddon` + `WebLinksAddon`, and hands raw base64 PTY chunks
  from `/api/watch` straight to `term.write(...)` without
  stripping. Cursor-up / ESC[2K / save-restore / alt-screen
  (`ESC[?1049h`) all render correctly and the terminal pane now
  reflects what the worker is showing right now instead of the full
  history of redraws. 8.27 (auto-fit needed a tab-switch) is
  resolved by the same change: the `<XtermView>` component stays
  mounted while the Scrollback tab is active
  (`tab === 'screen' ? 'block' : 'hidden'`) so the
  `ResizeObserver(container)` + `window.addEventListener('resize')`
  + `fit.fit()` pipeline keeps firing across tab switches, and a
  `useLayoutEffect` re-fits whenever the `visible` prop flips back
  to true. Auto-fit carries the 8.22 debounce + POST dedupe
  (`FIT_DEBOUNCE_MS = 120`, `lastResizeRef`) and the daemon-side
  clamp (`MIN_COLS=20` / `MAX_COLS=400` / `MIN_ROWS=5` /
  `MAX_ROWS=200`, mirrors `src/pty-manager.js _clampResizeDims`).
  Theme maps xterm tokens onto shadcn CSS vars (`--background`,
  `--foreground`, `--muted-foreground`, `--primary`, `--accent`,
  `--destructive`) via `readShadcnColor` + `buildXtermTheme` and
  re-applies whenever the `<html>` `class` attribute flips, so
  dark-mode parity stays. Alt-screen tracking reads
  `term.buffer.active.type` through `term.buffer.onBufferChange`;
  xterm already freezes the scrollbar while the alt buffer is
  active so no bespoke scroll-lock is needed. Ctrl+F opens an
  in-panel search overlay (SearchAddon `findNext` /
  `findPrevious`), Escape closes. The Scrollback tab keeps the
  existing stripAnsi pre for grep-style historical reads (we do
  not re-emit past frames there). Dropped from `WorkerDetail.tsx`:
  the ruler-based char-width measurement, `rulerRef`, `autoFit`
  toggle, and the manual `cols` input - xterm owns measurement now.
  `VITE_AUTOFIT_DEBUG` + `[autofit] ... POST /api/resize`
  console.debug carried over from 8.22 so operators can still trace
  the fit pipeline. Regression guards: `tests/xterm-view.test.js`
  (21 assertions / 3 suites) + `tests/ux-visual.test.js` P1 block
  redirected from `WorkerDetail.tsx` to `XtermView.tsx`. Full suite
  **109 pass**. Patch note: `docs/patches/8.24-xterm-terminal.md`.
  Spec: `docs/tasks/xterm-terminal.md`.

### Dependencies
- `web/package.json`: added `@xterm/xterm ^6.0.0`,
  `@xterm/addon-fit ^0.11.0`, `@xterm/addon-search ^0.16.0`,
  `@xterm/addon-web-links ^0.12.0` (8.24).

### Fixed
- **(8.21b) `/api/auth/status` 401 on trailing-slash variants.**
  The Web UI's first call after boot is `GET /api/auth/status` with
  no bearer; any proxy or URL canonicalizer that rewrote it to
  `/api/auth/status/` tripped `resolveApiRoute` into returning the
  route as `/auth/status/`, which is not in `auth.OPEN_API_ROUTES`.
  The middleware then 401'd the probe and the React app fell back to
  the login card with `fetchAuthStatus()` silently assuming
  `{ enabled: true }` (8.21 fail-safe). The same trailing-slash
  mismatch silently 404'd every exact-match handler in `daemon.js`
  too. `src/static-server.js` `resolveApiRoute` now strips one or
  more trailing slashes from the resolved route (the bare `/` root is
  preserved), so `/api/auth/status` and `/api/auth/status/` are
  indistinguishable downstream. `OPEN_API_ROUTES` semantics are
  untouched; protected routes (`/api/list/` etc.) remain 401 without
  a bearer. Tests: `tests/daemon-static-serve.test.js` grows
  `resolveApiRoute` cases for single/multiple trailing slashes, bare
  `/api/`, and non-api `/dashboard/`; `tests/session-auth.test.js`
  adds an explicit `/auth/status` open-route assertion, a `/list`
  401 regression guard, and a composed resolveApiRoute +
  checkRequest block. Full suite **108 / 108 pass**. Patch note:
  `docs/patches/8.21b-auth-status-401.md`.
- **(8.30) HistoryView scribe section transition.**
  Clicking a worker in the sidebar while the scribe viewer was open
  kept `showScribe = true` in `web/src/components/HistoryView.tsx`, so
  the main pane stayed on the scribe card and the newly fetched
  worker detail was invisible until the user manually pressed
  `Close`. Added a derived
  `activeSection: 'scribe' | 'detail' | 'placeholder'` discriminator,
  a `selectWorker(name)` helper that clears `showScribe` before
  `setSelected`, and `<main key={activeSection} ...>` so the content
  subtree remounts on section change (scroll resets with it). The
  `Scribe` button now flips to `variant='default'` +
  `aria-pressed={showScribe}` so the active section is visible, and
  the sidebar list `isSelected` predicate is narrowed to
  `!showScribe && selected === w.name` so a worker row loses the
  selection ring while scribe is the active section. Each list row
  also carries `aria-pressed={isSelected}`. Regression guards:
  `tests/history-view.test.js` gains a `section transition (8.30)`
  suite with 7 source-grep assertions (discriminator, selectWorker
  helper, onClick rewiring, narrowed isSelected, `key=activeSection`
  on `<main>`, Scribe button variant + aria-pressed, list
  aria-pressed). Full suite **108 / 108 pass**. Patch note:
  `docs/patches/8.30-history-section-fix.md`.
- **(8.21) Sticky intervention flag and monitor-cron token waste.**
  Before 8.21 the daemon tracked one `_interventionState` string and
  treated every truthy value as "needs human" forever: a helper that
  exited non-zero on teardown (ux-explorer / vite 5174, 2026-04-19)
  looked identical to a live approval prompt, and `c4-mgr-auto`
  carried a stale `escalation` flag for hours after the original
  intervention had already been resolved. Every healthCheck tick
  re-fired `notifyStall` against those workers and the autonomous
  loop burned `c4 read-now` tokens on each one.
  New `src/intervention-state.js` module splits the public surface
  into `approval_pending` | `background_exit` | `past_resolved` |
  `null`, with a tail-regex `detectApprovalPrompt` covering the
  Claude Code TUI prompt family (`Do you want to proceed/create/
  make this edit`, `Continue? [y/N]`, `[y/N]` / `(y/n)`, trust-folder,
  numbered `1. Yes`, Korean `계속하시겠습니까`) run fresh per
  `list()` - no caching, so flags clear as soon as the prompt leaves
  the tail. `clearInterventionIfResolved` drops the flag and stamps
  `_hadIntervention` + `_lastInterventionAt` so `past_resolved` stays
  available as a read-only breadcrumb. `critical_deny` is excluded
  from auto-clear so `c4 approve` still gates critical commands.
  `src/pty-manager.js` `_handlePostToolUse` + `_detectErrors` now
  downgrade to `bg_exit` whenever the parent worker is alive and no
  prompt is visible; the hook path no longer fires `notifyStall` on
  this path. healthCheck's stall-detection predicate narrows to
  `approval_pending` so `bg_exit` + `past_resolved` workers are
  ignored by the monitor cron; a 10-minute bg_exit stall promoter
  re-escalates back to `approval_pending` when a truly stuck
  background job goes idle with no output. `src/cli.js` `c4 list`
  renders the column as `APPROVAL` (red, TTY-only) / `bg-exit`
  (yellow) / blank; NO_COLOR honoured. `src/hierarchy-tree.js`
  `isInterventionActive` only treats `approval_pending` as active so
  the tree rollup + `[intervention]` badge stop lighting up on
  informational states. `web/src/components/WorkerList.tsx` matches.
  Regression guards: `tests/intervention-fix.test.js` - 6 suites /
  32 assertions - includes a source-grep on pty-manager.js that
  forbids restoring the old truthy-only `if (w._interventionState)`
  notifyStall predicate. Full suite **107 -> 108 pass**. Spec:
  `docs/tasks/intervention-fix.md`. Patch note:
  `docs/patches/8.21-intervention-fix.md`.

### Changed
- **(8.21) `manager.list()` row shape: `intervention` narrowed + new
  fields.** The `intervention` field on each worker row now publishes
  the string enum `'approval_pending' | 'background_exit' |
  'past_resolved' | null` instead of the raw internal state. Two new
  optional fields land alongside it: `hasPastIntervention: boolean`
  (ever-flagged breadcrumb) and `lastInterventionAt: string | null`
  (ISO of last set/clear). Callers that check "needs human" must
  compare explicitly to `'approval_pending'` now; truthy checks still
  treat `background_exit` and `past_resolved` as informational. The
  internal `_interventionState` keeps its legacy values (`question` |
  `escalation` | `critical_deny` | `bg_exit` | null) so hot-paths
  (`wait --interrupt-on-intervention`, `cancelCriticalCommand`, SSE
  events, existing tests) do not need a coordinated rewrite. Web UI
  types updated (`PublicIntervention` union + optional past fields).

- **(8.22) Terminal auto-fit catches parent reflows + scrollback re-wraps.**
  `web/src/components/WorkerDetail.tsx` now wires a `ResizeObserver` on
  the terminal `<pre>` alongside the existing `window.addEventListener
  ('resize')` listener so sidebar toggles and flex reflows no longer
  leave the client rendering server output at the stale 160-col PTY.
  Both paths share a single 120 ms debounce (`scheduleRecompute()`) so
  we still issue at most one `POST /api/resize` per gesture. Functional
  `setCols(prev => ...)` drops `cols` out of the callback's dep list so
  the observer stops tearing down on every fit cycle. Guards against
  `inner <= 0` and non-finite measurements ensure we never
  `POST { cols: 0 }` during initial layout. The 20..400 clamp and the
  `/api/resize` path (8.19 `withApiPrefix` refactor) are regression-
  locked by `tests/ux-visual.test.js`. `src/screen-buffer.js`'s
  `resize(cols, rows)` also re-flows `scrollback` when cols shrink —
  stored lines longer than the new width split into chunks of `c`
  characters, capped at `maxScrollback` — so historical rows render at
  the new cols instead of wrapping against the narrower `<pre>`.
  Cols-grow stays a no-op.

- **(8.19) CLI request helper now routes every call through `/api/*`.**
  After the 1.7.0 session-auth work (TODO 8.14), the middleware only
  runs for requests that arrive under the `/api` prefix. `src/cli.js`
  still addressed handlers by their legacy bare paths
  (`/create`, `/send`, `/task`, ...), so `auth.checkRequest` skipped
  the request, `authCheck.decoded` stayed unset, and the handler-level
  `requireRole` gate returned `401 Authentication required` on every
  CLI write even though the same token posted to `/api/create` by
  curl succeeded. New `withApiPrefix(p)` helper in `src/cli.js` runs
  every `request()` call through `/api/<route>` while call sites keep
  writing `/create`, `/list`, etc.; `c4 watch` now hits
  `/api/watch?name=<n>&token=<jwt>` (EventSource-style clients cannot
  set an `Authorization` header so the token rides via the `?token=`
  fallback that `auth.extractBearerToken` already honours). `main()`
  is guarded by `require.main === module` and `withApiPrefix` is
  exported so tests can exercise the classification without spawning
  a child process. See `patches/1.11.9-auth-fix.md`.
- **(8.19) `/auth/status` added to `OPEN_API_ROUTES`.** The Web UI
  polls `/api/auth/status` before rendering the login form to decide
  whether auth is enabled. Pre-fix that endpoint 401'd when
  `auth.enabled=true` and the UI fell back to `{enabled:false}`,
  skipping login entirely and then flipping to `'anon'` the moment
  the first `/api/*` call 401'd. `/auth/status` only exposes a
  boolean and carries no sensitive data, so opening it is safe.
- **(8.19) New `tests/cli-api-prefix.test.js`** pins the contract:
  three suites covering `withApiPrefix` unit behaviour, an in-process
  integration spawn of `src/cli.js` that asserts `/api/*` + bearer on
  the wire, and `auth.checkRequest` path classification
  (`/auth/login`, `/auth/status`, `/health` open; every other route
  default-deny). `spawn` + promise (not `spawnSync`) because a
  synchronous child blocks the parent's event loop and the capture
  server would never respond.

### Added
- **(8.22) `VITE_AUTOFIT_DEBUG` toggle.** Flip `VITE_AUTOFIT_DEBUG=1`
  in `web/.env.local` before `npm --prefix web run dev` to log every
  auto-fit measurement (`[autofit] measured cols=%d (inner=%d,
  charW=%f, font=%d)`) plus every resize POST
  (`[autofit] cols=%d rows=%d -> POST /api/resize`). Default off, read
  once at module load, so future regressions can be diagnosed without
  code changes.
- **(8.22) Puppeteer visual-regression pass on `tools/ux/explore.mjs`.**
  Runs after the existing click-through flow so a crash in visual
  logic cannot swallow functional issues. New `VIEWPORTS_VISUAL`
  (`desktop-xl 1920x1080`, `desktop-md 1366x768`, `tablet 1024x768`)
  times `VISUAL_PAGES` (`/`, `/workers`, `/chat`, `/history`,
  `/workflows`, `/features`, `/sessions`, `/settings`) = 24
  screenshots per run written with stable filenames to
  `patches/ui-audit-<date>/screens/<viewport>-<page>.png`. Per (viewport,
  page): overflow detector (`r.right > window.innerWidth + 1`) and
  clipping detector (`scrollWidth > clientWidth` on `text-overflow:
  ellipsis` / `overflow: hidden`) capped at 20 samples; pixelmatch +
  pngjs baseline diff against `patches/ui-audit-baseline/` flagged at
  `> 0.5%` with diff overlays under `patches/ui-audit-<date>/diffs/`;
  first-run seeds baselines and reports `baseline: 'captured'`;
  size mismatches count as 100% diff. A standalone
  `captureAutofitAnchor` pass resizes to 2000 then 600 px and captures
  the `Terminal session - dims {cols} x {rows}` label so 8.22 P1 has
  a browser-side regression anchor. Audit artifacts are gitignored
  (`patches/ui-audit-*/` + `patches/ui-audit-baseline/`).
- **(8.22) `pixelmatch` + `pngjs` added to `tools/ux/package.json`** as
  dev-only dependencies; dynamic-imported from `explore.mjs` so they
  never ship with the main runtime.
- **(8.22) `tests/ux-visual.test.js`** — 21 assertions across four
  suites (explore.mjs wiring, tools/ux/package.json deps, WorkerDetail
  auto-fit wiring, screen-buffer re-flow). Pattern matches 8.20B's
  source-grep style so no live browser boots during `npm test`.
  `tests/screen-buffer-resize.test.js` grows three assertions
  covering the re-flow behaviour. Full suite 106 / 106 pass.
- **(8.23) Mobile device emulation pass on `tools/ux/explore.mjs`.**
  Extends the 8.22 visual-regression surface without touching 8.22
  scope: a `KnownDevices` import joins the existing `puppeteer-core`
  line, a new `MOBILE_DEVICES` array binds the four device ids to
  `KnownDevices['iPhone 13' | 'iPhone SE' | 'Galaxy S20' | 'iPad
  Mini']`, and `ORIENTATIONS = ['portrait', 'landscape']` drives a
  4 x 2 x 8 = 64-screenshot sweep. The mobile pass runs *after* the
  8.22 `runVisualAudit` call in `main()` so a mobile failure cannot
  swallow the desktop/tablet report. Landscape swaps width + height on
  `page.setViewport` after `page.emulate(device)` with `isMobile:
  true`, `hasTouch: true`, `isLandscape: true` so the layout sees the
  device touch + orientation signals alongside the swapped dimensions.
  Single `puppeteer.launch` + single page across the whole sweep;
  login runs once at a neutral 1440x900 desktop viewport before the
  first `emulate` call, then auth carries through every `page.reload
  ({waitUntil:'networkidle2'})`. Screenshots land at stable
  `patches/ui-audit-<date>/mobile/<device>-<orientation>-<slug>.png`,
  baselines persist at `patches/ui-audit-baseline/mobile/` (both
  already gitignored via the 8.22 `patches/ui-audit-*` + `patches/
  ui-audit-baseline/` patterns), pixelmatch diff stays at the 0.5%
  threshold, and mobile diff overlays use a `mobile-<tag>.png`
  filename prefix inside `patches/ui-audit-<date>/diffs/` so the
  operator muscle memory from 8.22 carries over. First-run cells
  copy the candidate in and record `baseline: 'captured'`.
- **(8.23) Mobile-specific in-page checks.** Per (device, orientation,
  page) cell `runMobileAudit` records `mobile.overflow` (reused
  `detectOverflow` verbatim), `mobile.touchTargets` (new
  `detectTouchTargets`: `button, a[href], [role="button"], input,
  [role="link"], [tabindex]:not([tabindex="-1"])` with `r.width < 44
  || r.height < 44`, skipping `offsetParent === null`, capped 30),
  `mobile.smallFonts` (new `detectSmallFonts`: `TreeWalker(document.
  body, SHOW_TEXT)` with `MIN = 14` and `parseFloat(getComputedStyle.
  fontSize) < MIN`, capped 20), `mobile.hoverOnly` (new
  `detectHoverOnly`: walks `document.styleSheets` with a silent
  `try/catch` around CORS-blocked sheets, filters `:hover` selectors
  whose cssText matches `/visibility|display|opacity/i`, capped 20 -
  advisory only per spec P2 step 4), `mobile.clipping` (reused
  `detectClipping` verbatim but stored separately from the 8.22
  `visual.clipping` array), and `mobile.softKeyboard` (new
  `probeSoftKeyboard`: focuses first `<input>`/`<textarea>`, measures
  `window.visualViewport.height` before + after, records `obscured`
  when the focused element's bottom sits below the shrunken viewport;
  runs only on `/`, `/workflows`, `/settings` x iPhone 13 portrait +
  Galaxy S20 portrait to keep runtime bounded; silently skips pages
  with no input).
- **(8.23) `--skip-mobile` CLI flag on `tools/ux/explore.mjs`.**
  Minimal parsing via `process.argv.includes('--skip-mobile')` + a
  `if (!skipMobile) { runMobileAudit(...) }` guard so the 8.22
  desktop pass can still run stand-alone for fast dev iteration.
  Report-write gate relaxes from `if (visual)` to `if (visual ||
  mobile)` so `ui-audit-report.json` still lands when the visual
  pass crashes but the mobile pass completed (or vice versa).
- **(8.23) `tests/mobile-audit.test.js`** - 19 source-grep assertions
  across two suites (explore.mjs mobile wiring + tools/ux/package.json
  dep stability). No live browser boots during `npm test`; the
  pattern mirrors the 8.22 `ux-visual.test.js` approach. Full suite
  **107 / 107 pass** (106 pre-existing + 1 new file). No runtime deps
  added - puppeteer-core, pixelmatch, and pngjs were already listed
  from 8.22.

### 1.11.10 - External Claude session import (2026-04)

### Added
- **(session-attach) new `src/session-attach.js` zero-dep module**
  that registers external Claude Code JSONL transcripts as read-only
  "attached" workers. Public surface: `AttachStore` (load / list / add
  / remove against `~/.c4/attached.json`), `resolveSessionPath` (path
  or bare UUID lookup under `defaultProjectsRoot()` with structured
  ambiguity / not-found / bad-extension errors), `attach` +
  `detach` + `summarize` + `listAttached`, plus `getShared()` for the
  daemon singleton. Re-uses the 8.18 `session-parser` contract via
  `parseJsonl` + `listSessions` instead of re-implementing JSONL
  parsing. Attempting to attach the same path twice returns
  `ALREADY_ATTACHED`; duplicate aliases auto-suffix up to `-99` before
  surfacing `NAME_COLLISION`.
- **(daemon) four new endpoints behind the 8.14 auth middleware and
  gated by `rbac.ACTIONS.WORKER_CREATE`:** `POST /api/attach`
  (`{ path?, sessionId?, name? }` -> `{ name, sessionId, projectPath,
  jsonlPath, turns, tokens, model, warnings }`), `GET /api/attach/list`
  (persisted registrations), `DELETE /api/attach/:name` (pointer-only
  removal; the underlying `.jsonl` is never touched), and
  `GET /api/attach/:name/conversation` which returns the same parsed
  `Conversation` shape as `/api/sessions/:id` so the viewer can stay
  source-agnostic. `GET /api/attach/:name` returns `{ record, summary }`
  for list rows. Status codes: `400` on missing input, `404` on ENOENT
  / NOT_FOUND, `409` on AMBIGUOUS / ALREADY_ATTACHED, `410 Gone` when
  the underlying JSONL has been deleted under a live registration.
- **(pty-manager) `kind: 'spawned'` stamp on every list() row** so
  consumers that merge in attached records only need to branch on one
  field. `kind: 'attached'` lives on the 8.17 attach records.
- **(cli) `c4 attach` command group:** `c4 attach <id|path>
  [--name alias]` POSTs to `/api/attach` and pretty-prints
  name / sessionId / project / turns / tokens / model / warnings;
  `c4 attach list` prints a compact table of registered attachments;
  `c4 attach detach <name>` removes the pointer. Input type (path vs
  UUID) is auto-detected from the first positional argument.
- **(web) Attached sub-section on the Sessions tab:** distinct group
  header above the per-project session list, with a `+ Attach new...`
  button that opens a modal (JSONL path or session UUID + optional
  alias) POSTing to `/api/attach`. Clicking an attached row feeds
  `ConversationView` through a new `snapshotUrl` prop pointed at
  `/api/attach/<name>/conversation` so all markdown / tool / thinking
  rendering stays in one component. Trash-icon row action calls
  `DELETE /api/attach/:name`. `apiDelete` helper added to
  `web/src/lib/api.ts`.
- **(docs) `docs/patches/8.17-session-attach.md`** covers module
  layout, persisted shape, four endpoint contracts, CLI pretty-print
  format, Web UI wiring, the `kind` field migration, and explicitly
  records the P2 (bidirectional resume) and P3 (per-owner ACL) gaps
  that land after this ships.
- **(tests) `tests/session-attach.test.js`** (39 assertions / 11
  suites) covering attach-by-path (happy + ENOENT + BAD_EXT),
  attach-by-UUID (single / ambiguous multi / zero), duplicate path +
  duplicate name auto-suffix, persistence round-trip through a tmpdir
  store, malformed-store fallback, `summarize` vs `parseJsonl`
  equivalence, plus source-grep wiring tests against `daemon.js`,
  `cli.js`, `pty-manager.js`, `api.ts`, `ConversationView.tsx`, and
  `SessionsView.tsx`. Full suite stays green at 102 / 102.

### 1.11.9 - Claude session JSONL viewer (2026-04)

### Added
- **(session-parser) new `src/session-parser.js` dependency-free
  parser** that normalizes Claude Code transcript files
  (`~/.claude/projects/<encoded-cwd>/<session-id>.jsonl`) into a
  flat `Conversation {sessionId, projectPath, createdAt, updatedAt,
  model, totalInputTokens, totalOutputTokens, turns:Turn[], warnings}`
  stream. One Turn per content block (thinking + text + tool_use from
  one assistant event fan out to three turns) with tokens attached
  only to the first block so totals stay truthful after fan-out. Tool
  calls + results are paired by `tool_use_id` so the UI can collapse
  them into one card. Malformed lines become warnings instead of
  throws so a corrupt line cannot break a whole transcript. Exports
  `parseJsonl` / `parseJsonlStream` (async iterator for tail / import)
  / `listSessions` / `groupSessionsByProject` / `defaultProjectsRoot`
  (honours `$CLAUDE_PROJECTS_DIR`, falls back to `~/.claude/projects`).
- **(daemon) three new endpoints behind the 8.14 auth middleware:**
  `GET /api/sessions` (list + group by project + `?q=` filter),
  `GET /api/sessions/:id` (parsed Conversation; 404 when unknown),
  `GET /api/sessions/:id/stream` (SSE - emits the full snapshot as
  `event: conversation`, then `event: turn` per newly parsed Turn as
  the JSONL grows via `fs.watch` + byte-offset tracking, with
  stat-polling fallback when watch is unavailable and a 30s keepalive
  heartbeat). Override the transcript root via
  `config.sessions.projectsDir`.
- **(web) Sessions tab** with a 2-pane layout:
  `web/src/components/SessionsView.tsx` (collapsible per-project
  groups, search, short-id + snippet + relative timestamp rows)
  plus `web/src/components/ConversationView.tsx` (claude.ai-style
  chat: user right-aligned with `bg-primary/10`, assistant left-
  aligned full width with a zero-dep minimal markdown renderer,
  thinking collapsible, tool_use expandable with paired result,
  tool_result code block, system chip). Auto-scrolls only when the
  user is near the bottom, with a Jump-to-latest button otherwise.
  Live mode subscribes to the stream endpoint through EventSource
  (auth via `?token=` fallback). TopTabs grows a `Sessions` value and
  App.tsx routes `topView === 'sessions'`; existing worker list,
  history, chat, and workflow tabs are untouched.
- **(docs) `docs/patches/8.18-session-view.md`** documents the module
  layout, the stable `Conversation` / `Turn` JSON shape consumed by
  TODO 8.17 (external session import), JSONL schema assumptions, and
  the daemon endpoint contracts.
- **(tests) `tests/fixtures/session.jsonl` + `tests/session-parser.test.js`**
  (32 assertions / 8 suites) covering parseJsonl metadata + token
  totals + block fan-out + thinking text + tool pairing + warning on
  malformed line + per-message token attribution, parseJsonlStream
  order equivalence, listSessions + groupSessionsByProject, meta-type
  handling, decodeProjectDir, plus source-wiring greps on daemon.js,
  ConversationView.tsx, SessionsView.tsx, App.tsx, and TopTabs.tsx.
  Full suite 101 / 101 pass.
- **(ui-settings) Settings top tab with centralized UI preferences.**
  A new `Settings` entry in the top navigation rail (`web/src/components/layout/TopTabs.tsx`,
  lucide `Settings` icon) opens `web/src/components/SettingsView.tsx`, a
  `Card` / `Panel`-based page that groups user preferences into
  **Appearance** (theme: Light / Dark / System, selected via icon
  `radiogroup`s that toggle the `dark` class on the document root) and
  **Layout** (sidebar mode — List / Tree; detail view — Terminal / Chat /
  Control). A `Reset to defaults` button clears stored values and snaps
  every preference back to its built-in default. `App.tsx` reads and
  writes preferences through the new `web/src/lib/preferences.ts`
  helper, which consolidates the `c4.sidebar.mode` / `c4.detail.mode` /
  `c4.topView` / `c4.theme` localStorage keys, adds `resolveTheme()` +
  `applyTheme()`, keeps multiple tabs in sync via the `storage` event,
  and excludes the transient `settings` destination from the persisted
  top-view value so relaunching returns the user to their last content
  tab. Coverage added in `tests/web-ui-settings.test.js`.
### 1.11.9 - UI CLI coverage (2026-04)

### Added
- **(8.20b) Features top-tab + 12 new pages wrapping CLI-only flows.**
  `web/src/pages/{Scribe,Batch,Cleanup,Swarm,Health,TokenUsage,
  Validation,Plan,Morning,Auto,Templates,Profiles}.tsx`, grouped in a
  new `FeatureSidebar` under Operations / Cost / Automation / Config /
  Diagnostics. Pages are lazy-loaded through `web/src/pages/registry.ts`
  so the main bundle stays in the ~80 KB gzip range; each feature
  ships as its own 2-6 KB code-split chunk. Selection persists to
  `localStorage` and reflects in the URL hash as `#/feature/<id>`.
- **(8.20b) `POST /batch` daemon endpoint.** Accepts either `tasks[]` or
  `task + count` plus optional `branch / profile / autoMode /
  namePrefix / target`. Sits behind `rbac.ACTIONS.WORKER_TASK`,
  dispatches each item through `manager.sendTask`, returns
  `{ok, fail, total, results}` so the UI renders results without
  fanning out N `/task` calls.
- **(8.20b) `StatusMessageCard` on `ControlPanel`.** Posts to
  `/api/status-update` so operators can ship oncall handoff notes to
  Slack without dropping to the terminal. Rollback was already on the
  panel (1.7.5).
- **(8.20b) Shared UI helpers.** `web/src/lib/format.{js,d.ts}`
  (formatNumber / formatBytes / formatDuration / formatRelativeTime /
  formatTimestamp / dateRange / dateRangeLabel),
  `web/src/lib/fuzzyFilter.{js,d.ts}` (substring-ranking filter with
  prefix boost), `web/src/lib/markdown.tsx` (minimal markdown renderer
  covering ATX headings, fenced code, lists, blockquote, inline code,
  bold / italic / links; no new runtime deps).

### Tests
- **(8.20b) `tests/ui-cli-coverage.test.js` — 56 assertions, 15
  suites.** Unit tests for the format + fuzzy helpers (including NaN /
  negative / empty-query / prefix-rank / case-insensitivity), source-
  wiring for `POST /batch` (RBAC, body shape, 400 on missing input,
  sendTask dispatch, per-item results), Features tab + registry
  coverage (every feature id, category ordering, lazy-loader count),
  and Batch / Plan / TokenUsage / ControlPanel `StatusMessageCard`
  component wiring via the same source-grep strategy the existing
  chat-view and web-control suites use. Full suite 101 / 101 pass.

### Notes
- Templates and Profiles add/edit/remove actions currently toast
  "not implemented yet" — the GET endpoints exist, the write routes
  do not. Tracked as sub-TODOs. `/health` event-loop-lag and loaded-
  modules fields render as `-` for the same reason; extension is
  contained to the server.

### 1.11.8 - Web redesign (2026-04)

### Added
- **(web-pages) every page component re-skinned onto the new
  primitives + lucide-react vocabulary.** `web/src/components/Login.tsx`
  moves onto a `Card` + `CardHeader` + `CardContent` + `CardFooter`
  composition with a `CardTitle` "C4 Sign in" / `CardDescription`
  "Session required to access the dashboard." header, lucide
  `User` + `KeyRound` icon-prefix inputs (`pl-10` on the `<Input/>`
  primitive with an absolute-positioned icon), a destructive-token
  error row with lucide `AlertTriangle`, and a full-width
  `<Button variant="default">` submit that swaps its leading glyph
  between `LogIn` and a spinning `Loader2` when `busy`; a subtle
  dotted radial backdrop (`opacity-5 text-foreground` inline
  `background-image`) approximates the ARPS login aesthetic without
  new deps. `web/src/components/WorkerList.tsx` flips each row to
  a `Card` whose header pairs the worker name with a status `Badge`
  selected by `mapWorkerStatusToBadgeVariant` (success/warning/
  destructive/secondary), with unread + intervention chips also
  rendered through `Badge`; selection state applies
  `ring-2 ring-ring ring-offset-2 ring-offset-background` via
  `cn()` and the SSE-disconnected notice is a muted-foreground pill
  with lucide `WifiOff`. `web/src/components/WorkerDetail.tsx` wraps
  the terminal viewport in a `Card` with `CardTitle` = worker name +
  `CardDescription` = "Terminal session - dims {cols x rows}";
  Screen / Scrollback becomes a segmented `Button` group inside the
  header, font +/- uses `IconButton` with lucide `Minus` / `Plus`,
  Send + arrow keys use `Button` variants (default / secondary) so
  primary tones come from the primitive, and Merge / Close upgrade
  to default / destructive `Button` with lucide `GitMerge` / `X`.
  `web/src/components/ChatView.tsx` wraps the live-worker stream in
  a `Card` whose header pairs "Chat" with a live/disconnected
  `Badge` (success/secondary) and a `Jump to latest` `Button`
  (lucide `ArrowDown`); user / worker bubbles switch to token
  surfaces (`bg-primary` / `bg-muted`) and Send becomes a default
  `Button` with a lucide `Send` icon. `web/src/components/ControlPanel.tsx`
  splits into two `Card`s (Controls / Batch) with per-action
  `Button` variants driven by a `TONE_VARIANT` map; the batch-list
  lives inside a `Panel`, row statuses are outline `Badge`s, and
  the last-run outcomes list renders through a result `Panel` with
  emerald/destructive tinting. `web/src/components/Chat.tsx` (the
  top-level NL chat tab) wraps its pane in a `Card` with a session
  `Badge`, a secondary Reset `Button` (lucide `RotateCcw`), action
  chips inside a `Panel` via secondary `Button`s, the composer on
  the `Input` primitive, and Send promoted to a default `Button`
  with a lucide `Send`. `web/src/components/HierarchyTree.tsx` keeps
  its expand/collapse semantics but swaps `+ / -` glyphs for lucide
  `ChevronDown` / `ChevronRight` (with `Dot` for leaves), rewrites
  row surfaces to token classes (`bg-accent` selected / `hover:bg-accent/60`
  hover / `ring-ring` focus), replaces status colour classes with
  `Badge` variants, and uses outline `Badge`s for rollup pills plus
  a muted WifiOff pill for SSE disconnect. `web/src/components/HistoryView.tsx`
  frames the sidebar and main views in `Card`s; search uses an
  `<Input/>` with a prefixed lucide `Search`, the Scribe shortcut is
  a secondary `Button` with lucide `NotebookText`, worker rows use
  token surfaces + a status `Badge`, and past-task records land in
  a `Panel` with lucide `Clock` / `Hash` / `GitBranch` chrome.
  `web/src/components/WorkflowEditor.tsx` moves the catalog + main
  columns into `Card`s, adds lucide `Workflow` + `RefreshCw` +
  `Play` icons to the header actions, and renders runs / node
  properties as `Panel` instances with run statuses projected
  through a `runStatusVariant` helper; the SVG node fills keep their
  concrete hex colours because the DAG markers / labels need
  non-token shades. `web/src/components/Toast.tsx` renders inside a
  `Card` + `CardContent` with variant-aware emerald / destructive /
  sky backgrounds picked by a `TONE` map and lucide `CheckCircle2`
  / `AlertTriangle` / `Info` leading icons (adds `info` to
  `ToastType`). `web/src/components/WorkerActions.tsx` swaps each
  action for a `Button` with a lucide icon (GitMerge / Check /
  OctagonAlert / X), outline for the safe actions + destructive for
  Close, and a spinning `Loader2` replacing the old `\u2026` glyph
  during the busy state. No `bg-gray-*` / `text-gray-*` /
  `border-gray-*` utility classes survive in the touched files;
  no non-ASCII glyphs remain either.
- **(web-layout) dashboard shell composed of reusable layout
  components.** New directory `web/src/components/layout/` hosts
  `AppHeader.tsx` (header shell `rounded-none border-b border-border
  bg-card`, left slot = md:hidden sidebar-toggle `IconButton` with
  lucide `Menu` / `X`, center = `TopTabs`, right = lucide `LogOut`
  `IconButton` shown only when `authState === 'authed'`; controlled
  via `sidebarOpen` + `onToggleSidebar` props so App.tsx keeps
  ownership of the open state), `TopTabs.tsx` (segmented control for
  Workers / History / Chat / Workflows with lucide `Users` / `History`
  / `MessageSquare` / `Workflow` glyphs, `role="tablist"` +
  `aria-selected` + `role="tab"`, active tab = `bg-primary/10
  text-primary`, inactive = `text-muted-foreground hover:bg-accent`,
  exports `TopView` union), `Sidebar.tsx` (aside `md:w-72` with
  inline logo + Workers label + List/Tree segmented control that
  uses lucide `List` / `Network`; hosts `<WorkerList/>` or
  `<HierarchyTree/>` based on mode; returns `null` when `open=false`
  so mobile keeps its current hide-behaviour; exports `SidebarMode`
  union), `DetailTabs.tsx` (segmented control for Terminal / Chat /
  Control with lucide `TerminalSquare` / `MessageSquare` /
  `SlidersHorizontal`; exports `DetailMode` union), and
  `EmptyState.tsx` (`Card` + `CardHeader` + `CardTitle` "Worker
  detail" + `CardDescription` "Select a worker from the sidebar to
  view details.").
- **(web-layout) App.tsx recomposed onto the new shell.**
  `web/src/App.tsx` drops the inline header / sidebar / detail-tabs
  markup and imports the layout components instead. Outer wrapper
  now carries `bg-background text-foreground` and the loading
  early-return swaps `bg-gray-900 text-gray-400` for `bg-background
  text-muted-foreground`. All existing behaviour is preserved:
  `AuthState` + helper functions (`readSidebarMode` / `readDetailMode`
  / `readTopView`) stay in App.tsx, the three localStorage keys
  (`c4.sidebar.mode`, `c4.detail.mode`, `c4.topView`) keep their
  names and effects, `refreshAuth` / `handleLogout` / `handleSelect`
  retain their signatures, the top-view conditional structure
  (history / chat / workflows / default) is unchanged, and the anon
  early return still renders `<Login/>`. File shrinks from 353 to
  172 LOC.
- **(web-layout) Login outer background swapped to bg-background.**
  The pre-authed screen replaces `bg-gray-900` with `bg-background`
  on its outer wrapper only; the form JSX / state / submit handler
  are untouched so Login's full re-skin remains the upcoming
  web-pages worker's responsibility.
- **(web-components) shadcn-style UI primitive set.** New files under
  `web/src/components/ui/`: `button.tsx` (cva, variants default /
  destructive / outline / secondary / ghost / link, sizes sm / md / lg /
  icon, forwardRef, `Button` + `buttonVariants` exported),
  `card.tsx` (composable `Card` / `CardHeader` / `CardTitle` /
  `CardDescription` / `CardContent` / `CardFooter`, all forwardRef'd and
  token-driven), `panel.tsx` (`Panel` dense-surface wrapper with
  optional `icon` / `title` / `action` header row on `bg-muted/40`),
  `input.tsx` + `label.tsx` (forwardRef, ARPS login-compatible classes),
  `badge.tsx` (cva, variants default / secondary / destructive /
  outline / success / warning / info), `icon-button.tsx` (square lucide
  wrapper requiring `aria-label`), and `index.ts` barrel re-exporting
  every primitive. Every class string composes through `cn()` so
  overrides from consumers merge correctly with the base tokens. No
  existing component was rewritten.
- **(web-components) lucide icons in the sidebar toggle.** `App.tsx`
  swaps the two Unicode glyphs (`\u2715` close, `\u2630` open) for
  `<X className="h-5 w-5" />` and `<Menu className="h-5 w-5" />` from
  `lucide-react`. The enclosing `<button>`, its Tailwind classes, and
  the dynamic `aria-label` are preserved — the change is a pure
  rendering swap that proves the primitive-layer wiring without
  touching `WorkerList`, `WorkerDetail`, `ChatView`, `ControlPanel`,
  `HierarchyTree`, `HistoryView`, `Chat`, `Login`, `WorkflowEditor`,
  `Toast`, or `WorkerActions`.
- **(web-theme) shadcn/ui-style token system + design deps.** `web/src/index.css`
  now declares the full HSL token set (`--background`, `--foreground`,
  `--card`, `--popover`, `--primary`, `--secondary`, `--muted`, `--accent`,
  `--destructive`, `--border`, `--input`, `--ring`, `--chart-1..5`, `--radius`)
  under `@layer base` for both `:root` (light) and `.dark`, using the zinc
  base color family. The legacy `body @apply bg-gray-900 text-gray-100` was
  replaced with `bg-background text-foreground`, and a `* { @apply border-border }`
  base reset was added so every component inherits the token border color by
  default. `web/tailwind.config.js` now opts into `darkMode: ["class"]` and
  exposes every token through `hsl(var(--...))` under `theme.extend.colors`,
  plus a `borderRadius.{lg,md,sm}` scale derived from `--radius`. `web/index.html`
  pins `class="dark"` on `<html>` so the SPA renders dark-only until a toggle
  ships. New runtime deps added to `web/package.json`: `lucide-react ^0.514.0`,
  `clsx ^2.1.1`, `tailwind-merge ^3.3.1`, `class-variance-authority ^0.7.1`.
  `web/src/lib/cn.ts` exports the standard `cn(...inputs: ClassValue[])` helper
  wrapping `twMerge(clsx(inputs))` so downstream component workers can compose
  class strings idiomatically. No existing component JSX was rewritten as part
  of this change; `App.tsx` and all children keep their current markup.

## [v8.1] - 2026-04-18

### Fixed
- **(merge-core) worktreePath dropped slashes from branch names.**
  `runPreMergeChecks` built the worktree lookup path with regex
  `[^A-Za-z0-9._/-]` which left `/` intact, so a branch like
  `c4/slack-events` resolved to `../c4-worktree-c4/slack-events` —
  a path that never existed on disk. The downstream `existsSync`
  check therefore short-circuited, and `validation.test_passed`
  silently degraded to `SKIP (no worktree for branch)` for every
  worker branch (every branch carries a slash by convention). The
  regex now omits `/` from the allowed set so slashes get rewritten
  to hyphens, producing `../c4-worktree-c4-slack-events` which lines
  up with how worktrees are actually created. `resolveBranchForWorker`
  was audited and does not share the bug — it builds its path from
  worker name (no slash) and applies no regex.
- **TODO.md duplicate row 8.16.** The `8.16` row appeared twice in
  Phase 8 — once as the canonical **done** entry (still present at
  line 478) and once as a stale **todo** copy carrying the original
  pre-implementation incident notes. The stale copy has been removed;
  the surviving row is the implementation summary.

### Added
- **tests/merge-core.test.js.** Six `node:test` assertions — plain
  branch name passes through, single-slash branch maps to hyphen,
  multi-segment branch maps every slash, dot/underscore/hyphen
  preserved, every other special character gets hyphenated, plus a
  source-grep guard to keep the buggy regex from being reintroduced.
  Pure path computation (no filesystem touch).

## [v7.6] - 2026-04-18

### Added
- **(9.12) Planner Back-propagation loop.** Workers can now flag the
  plan they were dispatched against as broken, get a revised plan from
  the planner, and continue execution — without losing the original task
  context. `src/planner.js` grows `setPlanDocPath` / `getPlanDocPath`,
  `appendNeedsRevision`, `replan`, `redispatch`, `updateAndMaybeReplan`,
  and `listRevisions`. Worker records gain three fields: `plan_doc_path`
  (which plan the run is anchored to), `replan_count` (how many
  revisions have been produced), and `plan_revisions` (an array of
  `{rev, path, reason, evidence, when}` entries). The planner factory
  is abstracted: `setPlannerFactory(fn)` lets production wire a real
  Claude session while tests pass a mock; a deterministic
  `_defaultPlannerFactory` makes the loop end-to-end functional even
  without wiring.
- **`c4 task --plan-doc <path>`.** New option records which plan
  document this task is implementing. The daemon `/task` route forwards
  `planDocPath` and calls `planner.setPlanDocPath` after a successful
  `sendTask`; the response echoes `plan_doc_path` for confirmation.
- **`c4 plan-update <name> --reason <t> [--evidence <t>] [--replan]
  [--redispatch]`.** Append-only mode (no flags) writes a
  `## Needs Revision` block (When / Reason / Evidence) to the worker's
  current plan document. `--replan` invokes the planner factory with
  `{workerName, originalTask, reason, evidence, previousPlanPath,
  revisionNumber, revisionPath, partialState}` and saves the revised
  plan to `docs/plans/<name>-rev<N>.md`, then advances
  `replan_count` and points `plan_doc_path` at the new file.
  `--redispatch` additionally calls `manager.sendTask` with a templated
  prompt that references the new plan path + the original task and
  uses `contextFrom=<name>` so prior snapshots stay attached. The
  daemon route is `POST /plan-update`.
- **`c4 plan-revisions <name>`.** New CLI mirrors daemon
  `GET /plan-revisions?name=`. Returns
  `{worker, current, replanCount, maxReplans, revisions[]}`.
- **Loop limit (default 3).** When `replan_count >= maxReplans` a
  further `replan` (or `--replan` / `--redispatch`) is rejected with the
  exact message `"Loop limit N exceeded — manual intervention required"`
  and the worker record is left untouched. `_notifications.pushAll`
  fires a `[PLANNER LOOP LIMIT] <name>: <count>/<limit> — manual
  intervention required (<reason>)` line so a configured Slack webhook
  pages the operator. Override per call (`options.maxReplans`) or per
  daemon (`config.plannerLoop.maxReplans`); set to 0 to disable.
- **Tests.** `tests/planner-loop.test.js` adds 16 assertions across one
  suite covering: setPlanDocPath round-trip, append block contents,
  rev1/rev2 file creation + `replan_count` increment + `plan_doc_path`
  rotation, loop-limit rejection wording + Slack notification side
  effect, `maxReplans` config override, redispatch sends the right
  prompt with `contextFrom`, `updateAndMaybeReplan` chaining
  (append+replan+redispatch), no-flag mode skipping the factory,
  loop-limit short-circuiting redispatch, listRevisions output, default
  factory fallback, and factory error/empty content rejection. Existing
  `tests/planner.test.js` (8 assertions) untouched. Patch note:
  `patches/1.11.6-planner-loop.md`.

## [v7.5] - 2026-04-18

### Added
- **(10.9) Scribe v2 structured event log.** New `src/scribe-v2.js`
  module writes an append-only JSONL file per UTC day at
  `~/.c4/events-YYYY-MM-DD.jsonl` (overridable via
  `config.scribeV2.logDir`). Each line is one event with shape
  `{id, ts, type, worker, task_id, payload}`. Canonical 11-type
  enum: `task_start`, `task_complete`, `worker_spawn`,
  `worker_close`, `tool_call`, `approval_request`, `approval_grant`,
  `merge_attempt`, `merge_success`, `halt`, `error`. `ts` is ISO 8601
  UTC; `id` is `Date.now().toString(36) + '-' + 8 hex` so ids are
  roughly sorted yet collision-safe inside one millisecond.
- **`ScribeV2` class.** `record(event)` validates type against the
  enum and writes one line via `appendFileSync` wrapped in try/catch
  so the daemon request path never blows up on a disk error.
  `query({from, to, types, workers, limit, reverse})` accepts
  `from`/`to` as ISO string, numeric ms, or `Date`; `types`/`workers`
  as string or array; prunes non-overlapping day files without
  reading them and survives corrupt JSONL lines (JSON.parse errors
  are skipped, not thrown). `contextAround(target, minutesBefore=5,
  minutesAfter=5)` resolves `target` from an event id, ISO
  timestamp, `Date`, or ms and returns every event in the window.
  `findById(id)` walks day files newest-first. `listDays()` returns
  every discovered `YYYY-MM-DD` newest-first. Module helpers:
  `EVENT_TYPES`, `FILE_PREFIX`/`FILE_SUFFIX`/`FILE_PATTERN`,
  `defaultLogDir`, `isValidEventType`, `formatYMD` (UTC so DST never
  splits a day across two files), `parseYMD`, `nextId`,
  `normalizePayload`, `getShared`, `resetShared`.
- **Daemon wiring (src/daemon.js).** Shared `scribeLog` singleton via
  `scribeV2Mod.getShared({logDir: cfg.scribeV2?.logDir})`. A
  `safeRecord(type, {worker, task_id, payload})` wrapper runs
  alongside every existing `safeEmit` call so the new structured
  timeline stays in sync with the Slack event fabric without
  replacing it. Wired points: `worker_spawn` on /create (payload
  `{target, command, tier, pid}`), `task_start` on /task (payload
  `{branch, task, profile, autoMode, tier, model}`),
  `approval_request` / `approval_grant` on /approve (split on the
  `granted` flag), `merge_attempt` pre-check (payload
  `{branch, skipChecks, resolvedFrom}`) + `merge_success` on a
  clean merge (payload `{branch, sha, summary}`) + `error` on a
  failed merge (payload `{source:'merge', branch, message}`),
  `worker_close` on /close, `halt` on the `notifyStall` bridge
  (payload `{reason}`). Existing `src/scribe.js` (session transcript
  summariser) stays untouched — v2 is strictly additive.
- **New daemon endpoints.** `GET /events/query?from&to&types&workers
  &limit&reverse` (types/workers comma-separated) returns
  `{events, count}`. `GET /events/context?target&minutesBefore
  &minutesAfter` returns the window around an event id or
  timestamp.
- **CLI wiring (src/cli.js).** `c4 events [--from ISO] [--to ISO]
  [--type a,b] [--worker x,y] [--limit N] [--reverse] [--json]`
  filters the structured log; default output is one event per line
  (`ts type worker key=value ...`) so it stays tail-able, `--json`
  mode dumps raw JSONL so operators can pipe through `jq`.
  `c4 events --around <id|ISO> [--window MINUTES]` pulls the +/-
  window for a single event id or timestamp; default window is
  5 minutes.

### Tests
- **`tests/scribe-v2.test.js`** — 38 assertions across six suites:
  helpers (`EVENT_TYPES` membership, `defaultLogDir` under
  `$HOME/.c4`, `isValidEventType` rejections, `formatYMD` UTC
  behavior, `parseYMD` round-trip, `FILE_PATTERN` match,
  `nextId` uniqueness, `normalizePayload` coercions), `record()`
  (shape, invalid-type rejection, null-object rejection, default
  null fields, caller-supplied `ts`, dir auto-create, ordered
  append, cross-day file split), `query()` (no-filter chronological
  order, cross-day time range, single-type filter, string-form type,
  worker filter, limit cap, reverse+limit, empty-array filter,
  unknown type, corrupt-line resilience, empty log dir, day-file
  pruning), `contextAround()` (ISO target, event id target, default
  +/- 5 window, distant target, unresolvable target, `Date`
  target), `findById` + `listDays` (recorded event lookup, newest-
  first day order, unrelated-file filter), shared instance
  (singleton identity across `getShared` calls).
- Full suite: **97 / 97 pass** (96 pre-existing + 1 scribe-v2).

### Patch note
- `patches/1.11.5-scribe-v2.md`.

## [v7.4] - 2026-04-18

### Added
- **(8.3) Tier-based daily token quota + complexity-based model selection.**
  Three tiers (`manager` / `mid` / `worker`) each declare a daily token
  budget and a Claude model allow-list, persisted under
  `~/.c4/tier-quota-YYYY-MM-DD.json` so daily roll-over is automatic and
  survives daemon restarts. Defaults: manager = 500k tokens / `[opus]`,
  mid = 200k / `[opus, sonnet]`, worker = 100k / `[sonnet, haiku]`.
  `config.tierConfig` overlays per-tier fields without losing the others
  (set `worker.dailyTokens=50000` and the worker model list stays put).
- **`src/tier-quota.js` pure module.** `mergeTiers(override)`,
  `selectModel(taskDescription, tier, opts?)` (keyword score: `design` /
  `plan` / `architect` / `refactor` / `investigate` / `audit` -> opus,
  `typo` / `rename` / `format` / `lint` / `comment` -> haiku, `implement`
  / `fix` / `add` / `update` / `write` -> sonnet, length fallback >500
  chars -> opus / <80 chars -> haiku / else sonnet), `class TierQuota`
  (`chargeTier(tier, tokens)` increments + saves and throws
  `Error{code:'QUOTA_EXCEEDED', tier, used, requested, limit}` when the
  next charge would cross the cap; the failed charge does NOT advance
  the counter), `getRemaining(tier)` (returns `Infinity` when
  `dailyTokens=0` = unlimited), `resetDaily(tier?)` (zeroes one tier or
  all), `_rolloverIfNeeded()` auto-loads a new file when the injected
  clock crosses midnight UTC so day 1 totals stay intact in the
  original file, `snapshot()` returns
  `{date, tiers:{tier:{dailyTokens, models, used, remaining}}}`
  (`remaining = -1` for unlimited tiers), `selectModel(task, tier)`
  delegates to the module function with the instance tier override.
- **Daemon wiring (src/daemon.js).** `tierQuota = tierQuotaMod.getShared({tiers: cfg.tierConfig, force:true})`
  + `tierWorkerMap` (worker name -> tier). `POST /create` parses
  `{tier}` (default `'worker'`, validates against the live tier config
  and returns `400 {error, allowed[]}` on unknown), records tier in
  audit + Slack `worker_spawn` event, stamps `result.tier`.
  `POST /task` parses `{tier, model}` (explicit tier > tierWorkerMap >
  default `'worker'`), short-circuits with
  `429 {error, tier, remaining:0}` when `getRemaining(tier) === 0`,
  runs `tierQuota.selectModel(task, tier)` when `model === 'auto'` or
  omitted, stamps `result.tier` + `result.model`, threads tier+model
  into the audit + Slack `task_start` event. New `GET /quota` returns
  the full snapshot, `GET /quota/:tier` returns one tier's slice
  (`{error, allowed[]}` on unknown). `POST /config/reload` calls
  `tierQuota.setTiers(newCfg.tierConfig)` so live edits of daily caps
  or model allow-lists take effect on the next dispatch without a
  daemon restart.
- **CLI wiring (src/cli.js).** `c4 new <name> [--tier manager|mid|worker]`
  (defaults to worker server-side), `c4 task <name> "task"
  [--tier T] [--model auto|opus|sonnet|haiku]` (default `--model auto`
  resolves through `tierQuota.selectModel`), new `c4 quota [tier]`
  subcommand pretty-prints either the full table
  `worker  used=  X / 100,000 (remaining=Y) models=[sonnet, haiku]`
  or a single-tier detail block (`unlimited` rendered when limit=0).
  Help text gains a `quota [tier]` line under `token-usage`.
- **Tests (tests/tier-quota.test.js).** 23 node:test assertions across
  6 suites: defaults + `mergeTiers` (3), `chargeTier` + `getRemaining`
  + persistence round-trip + canonical file shape + unknown-tier
  rejects + non-numeric rejects (5), quota exceeded reject (3 incl.
  failed charge does not advance counter, `dailyTokens=0` = unlimited),
  daily reset + roll-over (3 incl. day-1 file kept intact when the
  clock crosses midnight, day-2 file written separately),
  `selectModel` keyword + length heuristic + tier allow-list constraint
  (6), `snapshot` output (2). All tests use isolated `tmpdir()` +
  injected `now()` so no real clock or HOME mutation. Full suite
  96 / 96 pass. Patch note: `patches/1.11.4-tier-quota.md`.

## [1.7.0] - 2026-04-17

### Added (security milestone)
- **Web UI session management + authentication (8.14).** Closes the TODO 8.14 "urgent - injection block" gap: before this release the daemon and Web UI had no authentication at all, so port-forwarding or LAN exposure let anyone spawn workers, send tasks, approve prompts, or trigger `git push`. Now every `/api/*` request (plus the legacy `/dashboard` HTML) is rejected with `401 {"error":"Authentication required"}` when `config.auth.enabled` is true and no valid `Authorization: Bearer <jwt>` is attached. New `src/auth.js` owns the primitives - `hashPassword` / `verifyPassword` (bcryptjs, 10 rounds), `signToken` / `verifyToken` (jsonwebtoken, HS256, 24h expiry), `extractBearerToken` (honors `Authorization` header first, falls back to `?token=` so EventSource streams that cannot set custom headers still authenticate), `generateSecret` (48-byte hex), and `checkRequest(cfg, req, route)` which is the single middleware decision point. Open routes: `/auth/login` and `/health`. New `src/auth-setup.js` owns the first-run provisioning - `provisionAuth({configPath, user, passwordFile, interactive})` loads `config.json` while preserving other keys, generates `auth.secret` only when missing (so the secret does not rotate on every run), bcrypt-hashes the password, and stores only the hash at `config.auth.users[<name>].passwordHash`; the source password file is never rewritten. `src/daemon.js` requires `./auth` and runs `auth.checkRequest` before every `/api/*` route, then defines `POST /auth/login`, `POST /auth/logout` (stateless - client discards the token), and `GET /auth/status` (tells the Web UI whether to render the login screen). `src/cli.js` reads `C4_TOKEN` env or `~/.c4-token` and attaches `Authorization: Bearer` to every CLI request, so existing `c4` commands keep working once auth is turned on. Config schema addition: `auth: {enabled: bool, secret: string (96 hex chars), users: {<name>: {passwordHash: string}}}`. Web UI: new `web/src/lib/api.ts` is the central fetch wrapper (`apiFetch` / `apiPost` / `apiGet`) that reads the JWT from `localStorage` (`c4.authToken`), attaches the Authorization header, clears the token on 401, and fires a `c4:auth-expired` window event so `App.tsx` can flip to the login screen without prop-drilling; `eventSourceUrl` appends `?token=` for SSE endpoints. New `web/src/components/Login.tsx` is the sign-in form (user + password, error surface, busy state). `App.tsx` gates the dashboard on `/api/auth/status` + token presence with four states (`loading` / `anon` / `authed` / `disabled`), renders `Login` when anonymous, and adds a `Sign out` button in the header when authed. `WorkerList`, `WorkerDetail`, and `WorkerActions` all migrated from direct `fetch()` to `apiFetch` so every request carries the token. `c4 init` gains two provisioning modes: **non-interactive** (`c4 init --user <name> --password-file <path>` - reads the file, bcrypt-hashes, stores the hash, never touches the source file) and **interactive** (TTY prompts for user + password with silent-echo password input). On first run the provisioner also generates `auth.secret`; on subsequent runs it reuses the existing secret and skips users that already have a hash unless `overwrite` is passed. `package.json` adds `bcryptjs` + `jsonwebtoken` runtime deps and bumps version to `1.7.0` to mark the security milestone. Tests: `tests/session-auth.test.js` adds 22 assertions across 4 suites - (a) `auth.login` returns a signed JWT whose `sub` matches the user and rejects wrong password / unknown user / missing fields / missing secret with a uniform `/invalid/i` error shape so username enumeration is not leaked, (b) `checkRequest` allows all routes when `auth.enabled` is false and allows `/auth/login` + `/health` even when enabled, (c) `checkRequest` rejects other `/api/*` with no / malformed / tampered token and accepts a valid `Bearer` header as well as a valid `?token=` query param for SSE, (d) `provisionAuth` writes the bcrypt hash + leaves the source password file byte-identical + reuses the secret across runs + skips pre-existing users + errors when only one of `--user` / `--password-file` is supplied + errors on missing / empty password file; a source-grep over `src/daemon.js` also asserts the wiring (`require('./auth')`, `route === '/auth/login'`, `auth.checkRequest(`). Full suite 66 / 66 pass. Operationally: until an operator runs `c4 init --user ... --password-file ...` the daemon still boots with `auth.enabled` absent (== disabled) so existing local-only installs do not break; once provisioned, the CLI + Web UI cooperate through tokens and external binding (`bindHost=0.0.0.0` from 8.10) becomes safe to enable.

## [Unreleased]

### Added
- **(8.15) Slack autonomous event notification integration.** The only
  way to watch c4 from Slack before 8.15 was the buffered stall/health
  digest that `src/notifications.js` flushed every five minutes; there
  was no per-event fabric, so autonomous merges, approvals, and worker
  lifecycle changes were invisible unless an operator tailed the Web UI.
  New `src/slack-events.js` introduces a daemon-level event emitter with
  a tiny, testable surface: `SlackEventEmitter` exports
  `emit(eventType, payload)` (validates the type, checks
  `config.slack.enabled`, filters by `config.slack.minLevel`, filters by
  `config.slack.events` allowlist, dedupes within
  `config.slack.dedupeWindowMs` via a SHA-1 LRU keyed by event type plus
  canonical payload JSON, POSTs `{text: "[c4:event] <type> <fields>"}`
  through an injectable `httpClient`, appends the record to an LRU
  recent-event buffer capped at 100 by default, and fans out to every
  `listen()` subscriber without letting a listener throw block the
  webhook call), `configure(partial)` (live config swap that purges
  stale dedupe hashes on window changes), `listen(cb)` (returns an
  unsubscribe function), `recentEvents(limit?)` (tail slice of the
  in-memory buffer), `clearRecent()` (drops buffer + dedupe), and a
  shared singleton via `getShared()` / `resetShared()`. Ten canonical
  event types land with pinned default severity so the filter stays
  deterministic: `task_start` / `task_complete` / `worker_spawn` /
  `worker_close` / `merge_success` / `push_success` at `info`,
  `halt_detected` / `approval_request` at `warn`, `merge_fail` /
  `error` at `error`; any caller can still escalate a specific emit by
  passing `payload.level`. The webhook payload format is the
  Slack-compatible `{text: "[c4:event] <type> key=val key=val ..."}`
  line that matches the TODO 8.15 spec (`[c4:task] 7.29 pkglock-fix
  done, pushed 0ecf4d9` shape), with 200-char truncation per field so
  a long task prompt cannot fill the channel.
- **Daemon wiring (src/daemon.js).** Imports `./slack-events`, builds the
  shared emitter via `getShared()`, calls `configure(cfg.slack)` at boot
  and again on `POST /config/reload` so live edits of
  `config.slack.enabled` / `webhookUrl` / `minLevel` /
  `dedupeWindowMs` / `events` take effect without a daemon restart,
  defines a `safeEmit(eventType, payload)` wrapper that catches every
  throw and swallows promise rejections so a broken webhook never
  breaks the request path, and fires events at five daemon lifecycle
  points: `POST /create` → `worker_spawn {worker, target, command}`,
  `POST /task` → `task_start {worker, branch, task}` (task preview
  capped at 120 chars), `POST /close` → `worker_close {worker}`,
  `POST /approve` → `approval_request {worker, optionNumber, granted}`,
  plus a `Notifications.notifyStall` monkey-wrap that converts every
  stall / intervention / escalation the pty-manager already surfaces
  into a `halt_detected {worker, reason}` event (the existing buffered
  stall send stays intact so 8.15 does not regress 1.5.x). The
  `POST /merge` handler emits `merge_success {branch, sha, worker}` on
  the success path and `merge_fail {branch, error, worker}` on git
  failure, right next to the existing `_safeAudit` records, so the
  Slack feed mirrors the audit trail without extra bookkeeping.
- **Daemon HTTP surface.** Two new endpoints: `GET /slack/events
  [?limit=N]` returns `{events, count, config}` where `events` is the
  tail of the in-memory buffer and `config` is the normalised live
  config shape (enabled / webhookUrl-presence-only / minLevel /
  dedupeWindowMs / events); open to any authenticated caller so Web UI
  dashboards can render the recent feed without elevated privileges.
  `POST /slack/emit {eventType, payload}` is gated by the new
  `rbac.ACTIONS.SLACK_WRITE='slack.write'` permission (manager + admin
  by default, viewer denied); rejects unknown event types with `400
  {error, allowed[]}` so a typoed CLI call fails fast instead of
  silently dropping the emit. `src/rbac.js` bumps `ALL_ACTIONS` to 27 and
  seeds `DEFAULT_PERMISSIONS.manager` with the new action so the manager
  role keeps its "can drive every daemon endpoint" guarantee.
- **Merge-core emit callback (src/merge-core.js).** `performMerge` now
  takes an optional `opts.emit` callback that receives `('merge_success',
  {branch, sha})` or `('merge_fail', {branch, error})`; the daemon
  passes `null` here because it emits from the request handler itself
  (avoids double-firing), but the CLI path wires its own emitter so
  `c4 merge` surfaces the same event even when the operator is working
  offline from the web UI. The wrap is defensive: `emit` throws are
  caught so a misbehaving callback never blocks the merge result.
- **CLI additions (src/cli.js).** `c4 slack test [--type <eventType>]
  [--worker <name>] [--message <text>]` POSTs `/slack/emit` (defaults
  to a `task_start` test payload), pretty-prints the webhook result
  (`[ok] emitted task_start level=info webhook=OK`), and uses the
  endpoint's allowlist when the type is rejected so operators
  immediately see which names are valid. `c4 slack status [--limit N]`
  hits `/slack/events`, prints the current config (with the webhook URL
  presence summarised as `(set)` / `(not set)` so we do not leak the
  secret), and tails the last 20 events as `[level] <iso-ts> <type>
  <message>`. `c4 merge` now accepts `--push`: on a successful merge it
  runs `git push origin main` and emits `push_success {branch, sha}`
  via a locally-constructed emitter that reads `config.slack` from
  `config.json`; the flag is opt-in so operators who never want the CLI
  to touch the remote keep the previous behaviour. The CLI emitter is
  built defensively (missing config file -> no-op emit) so a fresh
  checkout without a `config.json` does not break `c4 merge`.
- **Tests (`tests/slack-events.test.js`).** 32 assertions across 5
  node:test suites run against an injected mock httpClient and a
  controllable `now()` clock so CI never hits the network. Helpers
  suite covers `EVENT_TYPES` count + membership, `EVENT_LEVELS` group
  assignment, `LEVELS` + `LEVEL_ORDER` priority, `isEventType` /
  `isLevel` validators, `levelFor` default-plus-payload-override,
  `dedupeKey` determinism + payload-key-order independence,
  `formatMessage` field assembly + 200-char truncation, and
  `defaultHttpClient` shape. The emit suite exercises sent=true with
  webhook result on success, `enabled=false` suppression with
  `reason='disabled'`, invalid event type rejection without webhook
  call, dedupe within window plus re-fire after advancing past the
  window, payload-scoped dedupe (different workers do not collapse
  together), `minLevel='warn'` filtering, `events` allowlist
  filtering, webhook 500 returned as `ok=false` without throwing,
  missing `webhookUrl` yielding the `no-webhook` reason, `recentEvents`
  buffer capture with tail-slice limit, and the `recentCap` hard limit.
  The configure + listen suite covers live config swap, malformed-field
  fallback to defaults, listener subscribe + unsubscribe, listener
  throws that do not break emit, `clearRecent` dropping buffer + dedupe
  state, and `getConfig` returning a defensive copy. The singleton
  suite verifies `getShared` caching + `resetShared` lifecycle. The
  payload suite asserts the Slack-style `{text:"[c4:event] ..."}` shape
  and that `payload.level` overrides the event default for the minLevel
  filter. Full suite 95/95 pass.
- **(8.5) daemon API: POST /key and POST /merge for Web UI parity.** The
  Web UI used to work around two missing endpoints - sending special keys
  went through `POST /send` with `{keys: true}` (ambiguous contract, easy
  to misuse), and the "merge" button was a stub because only the CLI knew
  how to run the pre-merge gate. `POST /key {name, key}` now validates
  `key` against an allow-list (`KEY_ALLOWLIST` in `src/daemon.js`:
  `Enter`, `Escape`, `Tab`, `Backspace`, `Up`, `Down`, `Left`, `Right`,
  `C-a`..`C-e`, `C-l`, `C-n`, `C-p`, `C-r`, `C-z`), returns
  `{success, key}` on success and `400 {error, allowed}` for unknown
  labels. `POST /merge {branch | name, skipChecks?}` goes through the new
  `src/merge-core.js` so the HTTP surface runs the exact same
  `runPreMergeChecks` + `performMerge` sequence as `c4 merge`, returning
  `{success, branch, sha, summary, reasons, resolvedFrom}` on success and
  surfacing `reasons[]` (check/status/detail) on failure (`404` for
  missing branch, `409` for failing checks, `500` for git merge errors).
  The `name` payload resolves to a branch via `manager.workers.get(name)`
  first and `mergeCore.resolveBranchForWorker(name, repoRoot)` second
  (worktree HEAD probe), so Web UI callers keep passing worker names.
  RBAC: new `ACTIONS.KEY_WRITE` (`key.write`) and `ACTIONS.MERGE_WRITE`
  (`merge.write`) gate each endpoint; manager role gets both by default,
  viewer gets neither. `src/cli.js` `merge` command refactored to call
  `mergeCore.runPreMergeChecks` and `mergeCore.performMerge` so the CLI
  and HTTP paths share the same reasoning - CLI still owns the `npm test`
  / `package-deps-installed` / dirty-tree + auto-stash logic because
  those have side effects we don't want to run from the daemon. Web UI:
  `web/src/components/WorkerDetail.tsx` adds a "Keys" button row
  (`Esc`, `Ctrl-C`, `Ctrl-D`, `Tab`, arrow keys) that calls `POST /key`,
  and a new `Merge` button that confirms then calls `POST /merge {name}`.
  Tests: `tests/daemon-api.test.js` (39 assertions) spins up minimal
  in-process HTTP servers that wire the real `merge-core` + `rbac` to
  cover pre-merge check branches (missing branch -> 404, failing doc
  check -> 409, skipChecks short-circuit, branch resolution from worker
  or worktree) and `/key` behaviour (valid + invalid keys, RBAC 401/403,
  missing fields). `tests/rbac.test.js` asserts the two new actions and
  bumps `ALL_ACTIONS.length` to 26.
- **(8.16) dep smoke check — prevent bcryptjs-style regression.** `c4 merge`
  gains a fourth pre-merge gate `package-deps-installed`. When a branch
  changes `package.json`, the check computes
  `baseSha = git merge-base main <branch>` + `headSha = git rev-parse <branch>`,
  detects newly added `dependencies` entries via `git diff-tree` + `git show`,
  runs `npm ci` in the merge target, and spawns
  `node -e "require(<dep>)"` per new dep so the gate fails loudly if a
  consumer on main would hit `Cannot find module`. devDependencies are
  reported warn-only so test-only deps do not block a merge. No-op when
  `package.json` did not change between base and head. New
  `src/dep-smoke.js` pure module (`detectNewDeps`, `verifyDepsLoadable`,
  `runCheck`, `formatFailure`). `src/validation.js` grows
  `checkPackageDepsInstalled(opts)` returning
  `{ok, skipped, reason, detail, detect, prod, dev}`; `skipInstall:true`
  is available for unit tests so the gate can be exercised without
  shelling out to npm. `tests/dep-smoke.test.js` adds 35 assertions
  across 9 node:test suites (tmpdir git fixtures for `detectNewDeps`,
  real subprocess `require()` probe for `verifyDepsLoadable`, plus
  source-wiring greps on `src/cli.js` + `src/validation.js`). Full suite
  93 / 93 pass (up from 92). Patch note: `patches/1.11.1-dep-smoke.md`.
- **Computer Use agent — stub-first GUI automation pipeline (11.2).** New `src/computer-use.js` ships `ComputerUseAgent` + `Backend` abstraction for screenshot-driven automation of apps that expose no API (KakaoTalk, bank websites, legacy desktop tools). The first iteration is intentionally stub-first: three backends ship today — `StubBackend` (default; records actions to an in-memory log, writes a 1x1 placeholder PNG), `XdotoolBackend` (Linux; shells out to `xdotool` + `scrot` or ImageMagick `import`, throws `NotAvailable` when neither binary is present), and `MockBackend` (test fixture with an optional driver callback that can abort actions). `selectBackend('auto')` probes xdotool on Linux and falls through to the stub so tests stay deterministic without real input injection. Core methods on the agent: `screenshot(sessionId)` → `{id, imagePath, width, height, timestamp, backend}`, `click(sessionId, x, y, button?)`, `doubleClick`, `type(sessionId, text, delayMs?)`, `keyPress(sessionId, keyName)`, `move`, `scroll(deltaX, deltaY)`, `dragTo(fromX, fromY, toX, toY)`. Session state (`{id, backend, actions: [], screenshots: [], startedAt, endedAt}`) persists to `~/.c4/computer-use-sessions.json` (FIFO-capped at 50 entries, overridable via `config.computerUse.sessionsPath`); screenshots land at `~/.c4/screenshots/<sessionId>/<shotId>-<timestamp>.png` (`config.computerUse.screenshotsDir`). Coordinate validation rejects negative / non-finite / non-numeric values; key names normalise via a humane-spelling table (`enter`→`Return`, `esc`→`Escape`, `ctrl`→`ctrl`, with `+`-joined combos like `Ctrl+Shift+A` preserved). **Safety gate.** `startSession` refuses to fire unless `config.computerUse.enabled` is true — granting this capability is effectively remote-desktop-as-daemon, so it's opt-in at both the config layer and the single RBAC action `COMPUTER_USE` (24 total, up from 23). Admin gets it via the wildcard `*`; `manager` and `viewer` do **not** get it by default — administrators must explicitly broaden the role matrix or grant per-user before a worker can drive the display. Daemon endpoints (all gated by `rbac.COMPUTER_USE`): `GET /computer-use/sessions`, `POST /computer-use/sessions {backend?}`, `GET /computer-use/sessions/:id`, `DELETE /computer-use/sessions/:id` (soft-end, preserves audit trail), `POST /computer-use/sessions/:id/screenshot`, `POST /computer-use/sessions/:id/click {x, y, button?}`, `POST /computer-use/sessions/:id/type {text, delayMs?}`, `POST /computer-use/sessions/:id/key {key}`, `GET /computer-use/sessions/:id/screenshots/:shotId` (streams the raw PNG). Shared `ComputerUseAgent` singleton via `getComputerUseAgent()` is dropped on `/config/reload` so edits to `config.computerUse.*` pick up on the next request. Audit integration: `computer-use.session.started` + `computer-use.session.ended` events flow through `_safeAudit` so 10.2's hash chain covers every session. CLI in `src/cli.js`: `c4 computer start [--backend auto|stub|xdotool|mock]`, `c4 computer list`, `c4 computer status` (prints available backends + active/total session counts), `c4 computer show <sessionId>`, `c4 computer end <sessionId>`, `c4 computer screenshot <sessionId>`, `c4 computer click <sessionId> <X> <Y> [--button left|right|middle]`, `c4 computer type <sessionId> <text>`, `c4 computer key <sessionId> <KeyName>`. Config: new `computerUse.{enabled, backend, sessionsPath, screenshotsDir}` section in `config.example.json` (`enabled` defaults to `false`). Tests in `tests/computer-use.test.js`: 58 assertions across eight suites covering (a) helpers (defaults, validators, KEY_ALIASES, STUB_PNG signature, freshState/ensureShape repair), (b) coordinate + button validation (negative / NaN / Infinity / non-number rejection, three-button accept, unknown-button reject), (c) key normalisation (aliases, case collapse, combos, single-char passthrough, empty/non-string reject), (d) `selectBackend` + `detectAvailableBackends` (explicit stub / mock always work, auto falls back to stub, explicit xdotool throws NotAvailable when binary missing), (e) StubBackend action recording (click / type / keyPress / screenshot / move / scroll / dragTo / doubleClick), (f) MockBackend driver hook that can abort actions, (g) ComputerUseAgent session CRUD (config gate, persistence + reload, malformed-JSON fallback, SESSION_LIMIT trim), (h) input pipeline (action list + backend log stay in sync, ended-session rejection, unknown-session rejection), (i) RBAC gate (admin wildcard grants, default manager / viewer denied, unknown user denied), (j) shared singleton stability. `tests/rbac.test.js` bumps `ALL_ACTIONS.length` to 24 and adds the `COMPUTER_USE` enum check. Full suite 92 / 92 pass (up from 91). Patch note: `patches/1.10.4-computer-use.md`. Limitations: real screen capture + input injection on macOS (CGEvent) and Windows (SendInput) ship under follow-ups; the current `XdotoolBackend` handles Linux/X11 only (Wayland needs `ydotool` or portal-based capture). Tesseract OCR (screenshot-to-text) and OpenCV-based element detection are explicit future work — the agent records coordinates verbatim today, so callers must know what they're clicking. The single powerful `COMPUTER_USE` RBAC action matches the threat model: granting it is effectively remote desktop, so we do not ship per-endpoint scopes (click-only vs. type-only) until a real use case demands them.
- **Workflow engine — graph-based multi-worker orchestration (11.3).** New `src/workflow.js` ships `WorkflowManager` + `WorkflowExecutor` for defining and running directed acyclic graphs of work. A `Workflow` is `{id, name, description, nodes:[{id, type, name, config}], edges:[{from, to, condition?}], enabled, createdAt, updatedAt}`. Five node types: `task` (dispatched to a worker via the injected dispatcher), `condition` (sandboxed JS expression on the previous node's output, output `{value: boolean}` — branch edges read it via their own `condition` field), `parallel` (fan-out marker; downstream join is a normal node with multiple incoming edges that runs once), `wait` (delay-ms via injected `waitImpl` or event placeholder), `end` (terminal). Storage lives at `~/.c4/workflows.json` (definitions, overridable via `config.workflows.path`) and `~/.c4/workflow-runs.json` (run history capped at 200, `config.workflows.runsPath`). `validateGraph(nodes, edges)` is the single source of truth and runs before every persist call: rejects empty graphs, duplicate node ids, edges referencing unknown nodes, self edges, duplicate `(from, to)` pairs, fully-orphan nodes (no incoming AND no outgoing edges), unknown node types, graphs missing a terminal `end` node, and cycles (Kahn's algorithm). `WorkflowExecutor.executeWorkflow(workflowId, inputs, context)` topologically sorts the graph, executes only the activated subset (a node activates when at least one upstream edge fires), evaluates every outgoing edge's optional `condition` against the just-produced output, and writes a `WorkflowRun {id, workflowId, startedAt, completedAt, status, inputs, nodeResults: {<nodeId>: {status, output, error, startedAt, completedAt}}}` into the run store. Failed nodes halt downstream propagation and flip the run to `failed`; disabled workflows are rejected with a typed `code: 'WORKFLOW_DISABLED'` error. Conditions evaluate inside a hardened `new Function(...)` sandbox: parameter list shadows every dangerous Node global (`process`, `globalThis`, `Buffer`, `console`, `setTimeout`, `setInterval`, `setImmediate`, `clearTimeout`, `clearInterval`, `clearImmediate`, `queueMicrotask`, `fetch`, `module`, `exports`, `global`) with `undefined` while exposing a small whitelist (`Math`, `JSON`, `Date`, `Number`, `String`, `Boolean`, `Array`, `Object`, `RegExp`); strict mode forbids `with` and indirect-eval-via-rename; a regex pre-check rejects `eval`, `Function`, `require`, `import`, `export`, `throw`, `while`, `for`, `do`, `class`, and `new <Anything>Process` before parsing; the expression is capped at 1024 chars. RBAC additions in `src/rbac.js`: two new canonical actions `workflow.read` + `workflow.manage` on the `ACTIONS` enum (23 total, up from 21). Default matrix: `manager` gets both, `viewer` gets `workflow.read`. Daemon endpoints in `src/daemon.js`: `GET /workflows` (`workflow.read`, filters `?enabled=&nameContains=`), `POST /workflows` (`workflow.manage`, runs validateGraph before persist), `GET /workflows/:id` (`workflow.read`), `PUT /workflows/:id` (`workflow.manage`, re-validates when nodes/edges change), `DELETE /workflows/:id` (`workflow.manage`), `POST /workflows/:id/run` (`workflow.manage`, body `{inputs?}`, returns the WorkflowRun synchronously), `GET /workflows/:id/runs` (`workflow.read`), `GET /workflow-runs/:runId` (`workflow.read`). The shared `_workflowManager` + `_workflowExecutor` singletons drop on `/config/reload` so a new `config.workflows.path` takes effect without a daemon restart. The daemon's task dispatcher delegates to in-process `manager.create` + `manager.sendTask` so a workflow node spawns the same workers `c4 task` does (worker name `<workerName>-<runIdSuffix>`, branch from `cfg.branch` or `c4/<projectId>`, `autoMode: true` by default). Audit events: `workflow.created`, `workflow.updated`, `workflow.deleted`, `workflow.run`. CLI (`src/cli.js`): `c4 workflow list [--enabled] [--disabled] [--name N]`, `c4 workflow create --file <workflow.yaml|workflow.json>` (JSON parser first, falls back to a minimal in-CLI YAML loader covering nested mappings, sequences-of-mappings, scalars, quoted strings, and `#` comments — enough for the workflow definition shape and avoids a runtime YAML dependency), `c4 workflow show <id>`, `c4 workflow run <id> [--inputs '{...}']`, `c4 workflow runs <id>`, `c4 workflow delete <id>`, `c4 workflow export <id>`. Web UI: new `web/src/components/WorkflowEditor.tsx` ships a view-only DAG visualization. SVG-based layered layout (depth = longest path from any source, deterministic id-sorted within each column) with colour-coded node boxes, curved bezier edges with arrow markers, optional condition-string labels on edges, click-to-select node + property panel showing `id` / `type` / pretty-printed `config`, a per-workflow recent-runs list, and a `Run` button that POSTs `/workflows/:id/run`. `web/src/App.tsx` adds a fourth `Workflows` top-level tab alongside Workers / History / Chat with the selection persisted in `localStorage` under the existing `c4.topView` key. `tests/workflow.test.js`: 42 tests / 80+ assertions across eight suites covering helpers + constants (`NODE_TYPES`, `RUN_STATUS`, `NODE_STATUS`, `RUN_RETENTION`, `defaultWorkflowsPath`, `defaultRunsPath`, `isId`, `genWorkflowId`), `validateGraph` (minimal end-only graph accepted, empty graph rejected, duplicate node ids, edges referencing unknown nodes, duplicate `(from, to)` edges, self-edges, cycles, orphan nodes, missing terminal, unknown node types, linear example accepted, `topoSort` cycle detection), sandboxed condition evaluator (operates on `output` / `input` / `Math.max`, blocks `eval` / `Function` / `require` / `import` / `throw`, shadows `process` / `globalThis` / `setTimeout` / `console` to `undefined`, rejects empty / non-string / oversized expressions), `WorkflowManager` CRUD (validates + persists, duplicate-id rejection, invalid-graph rejection with `errors` array on the thrown Error, `updateWorkflow` re-validates when nodes/edges change, `deleteWorkflow` returns false on miss, `listWorkflows` filters on `enabled` + `nameContains`, `enableWorkflow` / `disableWorkflow` toggle), storage roundtrip (workflows + runs survive a fresh manager pointed at the same paths, `ensureWorkflowsShape` drops malformed entries, `normalizeWorkflow` defaults `enabled=true` + fills timestamps), run history retention (custom `runRetention` of 5 keeps only the last 5 of 8 runs), `WorkflowExecutor` (linear chain runs nodes in topo order with prev-output threading, conditional branch true-path activates `t` and skips `f`, conditional branch false-path activates `f` and skips `t`, parallel fan-out + join executes the join exactly once, disabled workflow rejected with `code: 'WORKFLOW_DISABLED'`, wait node honours `waitImpl(ms)`, failed dispatcher marks the run failed and skips downstream nodes, executeWorkflow throws when the workflow does not exist), and `WorkflowStore` retention edges (insertion-order trim, `getRun` returns null on miss). `tests/rbac.test.js` bumps `ALL_ACTIONS.length` assertion to 23 and adds `WORKFLOW_READ` / `WORKFLOW_MANAGE` enum checks. Full suite 91 / 91 pass (up from 90). Patch note: `patches/1.10.3-workflow.md`. Limitations: the Web UI editor is view-only this iteration — drag-and-drop authoring, palette + zoom, inline edge condition editing, and live-running animations slot on top of the eight REST endpoints and ship under a follow-up; the `parallel` node currently sequences its activated branches through the in-process executor (the topo walk is single-threaded), and true concurrency lands when 11.5 introduces a worker-pool runtime; the YAML loader covers the workflow-definition subset only (no anchors, multi-line scalars, or flow-style `[a, b]` collections) so anything more complex should pass JSON.
- **Natural Language Interface — chat over the daemon (11.4).** New `src/nl-interface.js` turns free-form English into structured c4 actions so the Web UI chatbox and the `c4 chat` CLI can drive the daemon without memorising command flags. Rule-based `parseIntent(text)` returns `{intent, params, confidence}` across eight intents (`list_workers`, `create_worker`, `send_task`, `get_status`, `get_history`, `read_output`, `close_worker`, `unknown`); the parser covers common phrasings ("show me workers", "create worker w1", "tell w1 to run tests", "status", "what did w1 do", "show w1 output", "close w1", etc.) with regex-first matching. `executeIntent(intent, params, {adapter})` dispatches through an injected adapter (`listWorkers`/`createWorker`/`sendTask`/`getStatus`/`getHistory`/`readOutput`/`closeWorker`) so the daemon wires the PtyManager directly in-process while tests plug in a mock. `formatResponse(result, intent)` renders a terse chat-style reply shared by Web UI + CLI + REPL. `SessionStore` persists `ChatSession { id, history, lastWorker, createdAt, updatedAt }` to `~/.c4/nl-sessions.json` (overridable via `config.nl.sessionsPath`) with `createSession` / `getSession` / `listSessions` / `appendMessage` / `setLastWorker` / `deleteSession` and storage roundtrip that tolerates missing / malformed JSON. `NlInterface.handle(sessionId, text)` ties parse -> execute -> format -> persist into one call, auto-creates sessions when the id is missing, resolves pronouns (`it`/`that`/`this`/etc.) against `lastWorker` so "close it" reuses the most recently referenced worker, and emits quick-action chips via `buildActions`. Daemon endpoints in `src/daemon.js`: `POST /nl/chat` (body `{sessionId?, text}` -> `{sessionId, response, intent, params, confidence, result, actions}`), `GET /nl/sessions` (list with `messageCount` + `lastWorker`), `GET /nl/sessions/:id` (full history), `DELETE /nl/sessions/:id`. A shared `_nlInstance` singleton drops on `/config/reload` so a new `nl.sessionsPath` kicks in without a daemon restart. Audit events: `nl.chat` (includes `intent` and `confidence`) and `nl.session.deleted`. RBAC additions in `src/rbac.js`: new `NL_CHAT = 'nl.chat'` action on the `ACTIONS` enum (21 total, up from 20); `manager` and `viewer` both get `nl.chat` in the default matrix since chat is read-ish and manager dispatches to worker lifecycle ops that have their own gates. CLI (`src/cli.js`): new `c4 chat "query"` (one-shot), `c4 chat --interactive` (readline REPL, `exit`/`quit` to leave), `c4 chat sessions` (list), `c4 chat history <id>` (dump messages). Session id is pinned at `~/.c4-nl-session` so multi-command shells keep conversation context. Web UI: new `web/src/components/Chat.tsx` with input box, message list, auto-scroll, quick-action chips, reset button, and session id persisted in `localStorage` under `c4.nl.sessionId`; `web/src/App.tsx` adds a third `Chat` top-level tab alongside Workers/History. Tests in `tests/nl-interface.test.js`: 56 assertions across 11 suites covering exports + constants, `parseIntent` for each intent (list_workers 5, create_worker 4, send_task 4, other-intents 9, rejection 4), `SessionStore` CRUD (create, append, missing-id auto-create, invalid role, lastWorker, delete, storage roundtrip, malformed JSON), `executeIntent` dispatch (list, create, missing-name, missing-task, adapter throw, unknown, no adapter), `formatResponse` rendering (list_workers count, empty list, create, send_task echo, status summary, unknown fallback, error message, long-output truncation), and `NlInterface.handle` full turn (end-to-end, pronoun resolution, unknown skip, `buildActions`). `tests/rbac.test.js` bumps the `ALL_ACTIONS.length` assertion to 21 and adds `NL_CHAT` enum check. Full suite 90 / 90 pass (up from 89). Patch note: `patches/1.10.2-nl-interface.md`. Limitations: parser is rule-based and covers roughly 80% of everyday phrasings; LLM-backed classification is listed as future work in the patch note. Complex chained workflows ("train a model and slack me when done") are out of scope for this iteration — they belong to the 11.3 workflow engine.
- **MCP Hub — dynamic per-worker MCP server registry (11.1).** New `src/mcp-hub.js` ships an `McpHub` class that stores MCP server definitions in `~/.c4/mcp-servers.json` (overridable via `config.mcp.path`) and emits a worker-scoped `.mcp.json` when a profile opts in via `mcpServers: [...]`. Each entry carries `{name, command, args, env, description, enabled, transport}`; `transport` is `'stdio'` (default) or `'http'` and is validated at register time so typos surface immediately. Methods: `registerServer` (name+command required, duplicate names rejected), `updateServer` (partial patch of command/args/env/description/enabled/transport with invalid-transport rejection), `unregisterServer`, `listServers({enabled, transport})` (sorted by name), `getServerConfig`, `enableServer` / `disableServer`, `reload`. `buildMcpJson(names)` produces the Claude Code `.mcp.json` shape for the subset the caller requests — stdio entries get `{command, args, env}`, http entries get `{type:'http', url, headers}` where `url` reuses the stored `command` and `headers` reuses `env` — and disabled servers are filtered out so flipping `disable` in the hub instantly cuts off every worker that would otherwise load the server on the next spawn. `writeWorkerMcpJson(worktreePath, names)` writes the payload to `<worktree>/.mcp.json` and returns the path, or `null` when no enabled servers match so no-MCP profiles leave the worktree clean. `testServer(name)` best-effort-launches stdio servers (spawn + kill) and returns `{ok, transport, pid}` / `{ok:false, error}` for http it reports `{ok, url}` without firing a request. `pty-manager.js` wires the hub into worker setup: `_writeWorkerSettings` calls the new `_writeWorkerMcpJson(worktreePath, options)` which resolves the profile via `_getProfile(options.profile)` and forwards `profile.mcpServers` to the shared hub (reloaded per spawn so a recent `c4 mcp add` is visible without a daemon restart). `listProfiles()` now surfaces the per-profile `mcpServers` array so operators can see which servers a profile auto-loads. RBAC additions in `src/rbac.js`: two new canonical actions `mcp.read` + `mcp.manage` on the `ACTIONS` enum (20 total, up from 18). Default matrix: `manager` gets both, `viewer` gets `mcp.read`. Daemon endpoints in `src/daemon.js`: `GET /mcp/servers` (`mcp.read`, filters `?enabled=&transport=`), `POST /mcp/servers` (`mcp.manage`, register), `GET /mcp/servers/:name` (`mcp.read`, detail), `PUT /mcp/servers/:name` (`mcp.manage`, patch), `DELETE /mcp/servers/:name` (`mcp.manage`, unregister), `POST /mcp/servers/:name/enable` + `/disable` (`mcp.manage`), `POST /mcp/servers/:name/test` (`mcp.manage`). The shared `_mcpHub` singleton drops on `/config/reload` so a new `config.mcp.path` takes effect without a daemon restart. Audit events: `mcp.registered`, `mcp.updated`, `mcp.unregistered`, `mcp.enabled`, `mcp.disabled`. CLI (`src/cli.js`): the existing `c4 mcp` dispatcher now also handles `c4 mcp list [--enabled] [--disabled] [--transport T]`, `c4 mcp add --name N --command CMD [--args 'a,b,c'] [--env 'K=V,K2=V2'] [--transport stdio|http] [--description D] [--disabled]`, `c4 mcp show <name>`, `c4 mcp enable <name>`, `c4 mcp disable <name>`, `c4 mcp remove <name>`, `c4 mcp test <name>`, while preserving the stdio-proxy subcommands (`start|status|tools`) unchanged. Tests in `tests/mcp-hub.test.js`: 40 assertions across six suites covering helpers (`defaultStorePath`, `VALID_TRANSPORTS`, `NAME_PATTERN`, `isValidName`, `isValidTransport`, `normalizeServer`, `freshState`, `ensureShape`), `registerServer` (persists + duplicate rejection + missing name/command + invalid transport + invalid name + http with URL command), list / update / delete (enabled filter, transport filter, sorted output, `updateServer` patches + invalid-transport rejection + missing-server throw, `unregisterServer` idempotence, `enableServer` / `disableServer` flip), storage roundtrip (fresh instance sees prior writes, missing file, malformed JSON, `reload()` picks up external mutation), `buildMcpJson` / `writeWorkerMcpJson` (stdio entry shape, http entry shape, enable-gate filter, skip-unknown, writes `.mcp.json`, null on empty names, null when all blocked, re-enable lands in next spawn), and profile integration (profile.mcpServers -> .mcp.json content, missing profile yields no file, ghost server yields no file, `pty-manager.listProfiles` surfaces `mcpServers`). `tests/rbac.test.js` bumps `ALL_ACTIONS.length` assertion to 20 and adds `MCP_READ` / `MCP_MANAGE` enum checks. Full suite 89 / 89 pass (up from 88). Patch note: `patches/1.10.1-mcp-hub.md`. Limitations: `c4 mcp test` only does a best-effort process launch (no MCP handshake over the stream yet); per-worker runtime reload (add a server after spawn) requires a `c4 close` + restart because Claude Code reads `.mcp.json` at boot; a Web UI panel for the registry slots on top of the six REST endpoints and ships under the 10.x UI track.
- **Schedule / calendar management (10.7).** New `src/schedule-mgmt.js` ships a `ScheduleManager` with a minimal five-field cron parser (`*`, numeric literals, comma-lists, ranges `a-b`, step `*/N` or `a-b/N`), standard DOM/DOW OR semantics, and timezone-aware `computeNextRun(expr, tz, now)` that walks minute-by-minute with a 5-year cap so leap Feb 29 resolves but unreachable expressions error out. Storage lives at `~/.c4/schedules.json` (overridable via `config.schedules.path`) with schema `{schedules: {<id>: {id, name, cronExpr, taskTemplate, projectId, assignee, enabled, timezone, nextRun, lastRun, createdAt, updatedAt, history:[{time, status}]}}}`. Methods: `createSchedule` (validates cron + timezone, seeds nextRun), `updateSchedule` (recomputes nextRun on cronExpr / timezone change), `deleteSchedule`, `listSchedules({enabled, projectId, assignee})`, `enableSchedule` / `disableSchedule`, `runDueSchedules(now)` (returns ids whose nextRun arrived, advances them), `forceRun(id)` (bumps lastRun, keeps nextRun), `scheduleTick(now, dispatch?)` (combines due-run with an optional dispatcher callback), `history(id)`, `gantt(weeks, startFrom?)`, `renderGanttText(weeks, startFrom?)` (ASCII day-bucket timeline, `#` / `.`). History retention is bounded to 100 runs per schedule. Timezones other than UTC resolve through `Intl.DateTimeFormat` so DST + regional calendars land on the right wall-clock. RBAC additions in `src/rbac.js`: two new canonical actions `schedule.read` + `schedule.manage` added to the `ACTIONS` enum (18 total, up from 16). Default matrix: `manager` gets both, `viewer` gets `schedule.read`. Daemon endpoints in `src/daemon.js`: `GET /schedules` (`schedule.read`, filters `?enabled=&projectId=&assignee=`), `POST /schedules` (`schedule.manage`), `GET /schedules/:id` (`schedule.read`), `PUT /schedules/:id` (`schedule.manage`), `DELETE /schedules/:id` (`schedule.manage`), `POST /schedules/:id/run` (`schedule.manage`, force run), `GET /schedules/:id/history` (`schedule.read`). A minute-cadence `setInterval` starts in `server.listen` and stops on SIGINT/SIGTERM; `config.schedules.enabled=false` opts out, `config.schedules.tickIntervalMs` overrides the cadence. The tick calls `_scheduleDispatch` which creates a worker `sched-<id>-<minute>` and sends the templated task through `manager.sendTask`; dispatcher exceptions are trapped so a bad handler never blocks the tick. The shared `_scheduleManager` singleton is dropped on `/config/reload` so a new `config.schedules.path` takes effect without a daemon restart. Audit events: `schedule.created`, `schedule.updated`, `schedule.deleted`, `schedule.forced`. CLI (`src/cli.js`): `c4 schedule list [--enabled] [--disabled] [--project P] [--assignee A]`, `c4 schedule create --name N --cron 'EXPR' --template T [--project P] [--timezone TZ] [--assignee A] [--id ID]`, `c4 schedule show <id>`, `c4 schedule enable <id>`, `c4 schedule disable <id>`, `c4 schedule run <id>`, `c4 schedule delete <id>`, `c4 schedule next <id>`, `c4 schedule history <id>`, `c4 schedule gantt [--weeks N] [--json]` (Gantt renders client-side against the shared module so the ASCII timeline does not need a new daemon endpoint). Tests (`tests/schedule-mgmt.test.js`): 60 assertions across ten suites covering helpers (including `ensureShape` dropping invalid cron / missing template / invalid id), `parseField` primitives (literal / wildcard / comma list / range / step over wildcard / step over range / out-of-bounds / inverted range / non-numeric / non-positive step), `parseCron`/`validateCron` (every minute, every hour, 2am, Monday 9am, step + range, comma list, field-count mismatch, non-string input), `computeNextRun` with fixed now (every minute, 2am daily before/after, 15-minute step, Monday 9am, month boundary to May 1, leap Feb 29 -> 2028-02-29, DOM/DOW OR semantics), `wallFields` + `cronMatches`, full CRUD (including invalid-cron-rejection-before-persist, duplicate-id rejection, listSchedules filters, updateSchedule recomputes nextRun, enable/disable toggling), `runDueSchedules` gating (disabled schedules do not fire even with past nextRun, enabled + past nextRun advances), `forceRun` + history retention (bumps lastRun without advancing nextRun, trims to HISTORY_LIMIT), storage roundtrip (fresh instance sees writes, missing file, malformed JSON), `scheduleTick` dispatcher (invoked per due schedule, advances without dispatcher, exceptions do not abort), and Gantt render (row counts, disabled excluded, ASCII-only + label + marker, rowless header). `tests/rbac.test.js` bumps `ALL_ACTIONS.length` to 18 and adds `SCHEDULE_READ` / `SCHEDULE_MANAGE` enum checks. Full suite 88 / 88 pass (up from 87). Patch note: `patches/1.9.7-schedule-mgmt.md`. Limitations: Google Calendar / MCP sync is deferred to a future iteration (out of scope for this batch); Web UI Gantt/timeline view slots on top of the `/schedules` endpoints and ships under the 10.x UI track; deadline-based priority auto-adjust remains a follow-up.
- **Department / team management (10.6).** New `src/org-mgmt.js` ships an `OrgManager` that models the organizational layer on top of RBAC (10.1), cost report (10.5), and project management (10.8). Departments own projects, machines, and worker quotas; teams group users under a department. Storage lives at `~/.c4/org.json` (overridable via `config.org.path`) with schema `{departments: {<id>: {id, name, parentId, managerUserIds, memberUserIds, projectIds, machineAliases, quotas:{maxWorkers, monthlyBudgetUSD, tokenLimit}}}, teams: {<id>: {id, deptId, name, memberUserIds}}}`. Departments form a tree via `parentId`; `treeView()` emits nested `[{dept, subdepts, teams, members}]` with a deduped roster per node, and `resolveUserDept(userId)` returns the nearest department by walking team membership first then parent depth (cycle-safe). Methods: `createDepartment`, `getDepartment`, `listDepartments`, `addMember` (manager role also registers as member so resolveUserDept finds them), `removeMember`, `assignProject`, `assignMachine`, `setQuota` (partial merge), `createTeam` (rejects orphans), `assignMember` (propagates to parent dept), `removeFromTeam`, `parentChain`, `getQuotaUsage(deptId, ctx)`. `getQuotaUsage` joins an injected `costReporter.monthlyReport({groupBy:'user'})` filtered to dept members with a `workers` snapshot filtered by user/project/machine and returns `{usage:{workers, costUSD, tokens}, percent, exceeded, quotas, period}` — matching the shape the budget-enforcement hook can consume in a later patch. RBAC additions in `src/rbac.js`: two new canonical actions `org.read` + `org.manage` added to the `ACTIONS` enum (16 total, up from 14). Default matrix: `manager` gets both, `viewer` gets `org.read`. Daemon endpoints in `src/daemon.js`: `GET /orgs/tree` (`org.read`), `POST /orgs/dept` / `POST /orgs/dept/:id/member` / `POST /orgs/team` / `POST /orgs/team/:id/member` / `POST /orgs/dept/:id/quota` (`org.manage`), `GET /orgs/dept/:id/usage` (`org.read`). `/orgs/dept/:id/usage` builds a fresh `CostReporter` each request (so `c4 config reload` flips the cost table) and joins `manager.list().workers` for a live snapshot. Shared `_orgManager` singleton is dropped on `POST /config/reload` alongside `_projectBoard` and `_projectDashboard`. CLI in `src/cli.js`: `c4 org tree`, `c4 org dept create --id ID --name N [--parent PID]`, `c4 org dept member add <deptId> <userId> [--role manager]`, `c4 org team create --id ID --dept DEPTID --name N`, `c4 org team member add <teamId> <userId>`, `c4 org quota set <deptId> [--max-workers N] [--budget USD] [--tokens N]`, `c4 org usage <deptId>`. Tests in `tests/org-mgmt.test.js`: 43 tests / 80+ assertions across eight suites covering helpers, department CRUD, member management, team CRUD + propagation, setQuota partial merge, treeView + parentChain, resolveUserDept depth tie-break, getQuotaUsage aggregation / worker counting / exceeded flag / zero-limit case, and storage roundtrip (reload, missing file, malformed JSON). `tests/rbac.test.js` bumps `ALL_ACTIONS.length` assertion to 16 and adds `ORG_READ` + `ORG_MANAGE` enum checks. Full suite 87 / 87 pass (up from 86). Patch note: `patches/1.9.6-org-mgmt.md`. Limitations: Web UI org chart + per-department dashboard remain as 10.x follow-ups; budget-enforcement hook that blocks `POST /create` when `exceeded.workers` is true is scoped as a follow-up (data is available via `/orgs/dept/:id/usage` but the daemon does not yet gate new workers on it).
- **CI/CD pipeline integration (10.4).** New `src/cicd.js` ships a `CicdManager` that registers CI/CD pipelines, receives GitHub webhooks, dispatches worker tasks or GitHub Actions `workflow_dispatch` calls, and runs check workers. Storage lives at `~/.c4/cicd.json` (overridable via `config.cicd.path`) with schema `{pipelines: {<id>: {id, name, provider, repo, workflow, triggers, actions, createdAt}}}`. Providers include `github-actions` (primary) plus `gitlab-ci` / `jenkins` as supported labels. Triggers cover `pr.opened`, `pr.merged`, `pr.closed`, `merge.main`, `tag.created`. Action types are `worker.task` (spawn a c4 worker running a task template, with optional `profile` + `branch` override) and `workflow.trigger` (GitHub Actions `workflow_dispatch` with `ref` + `inputs`). `handleWebhook(event, payload)` fans out every pipeline whose `triggers` include the event; worker.task actions flow through an injected `dispatchWorker` so tests never touch PTY state, and workflow.trigger actions flow through an injected `fetch` so tests assert the wire shape without network. `verifySignature(secret, body, header)` does HMAC-SHA256 matching GitHub's `X-Hub-Signature-256` ("sha256=<hex>") via `crypto.timingSafeEqual` with a pre-length check. `parseGithubEvent(header, payload)` maps `pull_request/opened|reopened` -> `pr.opened`, `pull_request/closed + merged=true` -> `pr.merged`, `pull_request/closed + merged=false` -> `pr.closed`, `push` on `refs/heads/main|master` -> `merge.main`, `create + ref_type='tag'` -> `tag.created`. `buildGithubPayload({ref, inputs})` produces the canonical `workflow_dispatch` body. New config section `cicd: {provider, path, webhooks: {secret}, repos: [{name, token, defaultWorkflow}]}`. Daemon endpoints in `src/daemon.js`: `POST /cicd/webhook` (HMAC auth, bypasses JWT, returns 200/400/401/500), `GET /cicd/pipelines` (RBAC `cicd.read`), `POST /cicd/pipelines` (RBAC `cicd.manage`), `GET /cicd/pipelines/:id`, `DELETE /cicd/pipelines/:id` (RBAC `cicd.manage`), `POST /cicd/trigger` (replay by id OR one-off `workflow_dispatch`; RBAC `cicd.manage`). `parseBodyRaw` buffers the raw body alongside parsed JSON so HMAC hashes exactly what GitHub hashed. `/config/reload` refreshes the shared `CicdManager` via `applyConfig` so a new secret or token takes effect without a daemon restart. RBAC: two new canonical actions `cicd.read` + `cicd.manage` in `ACTIONS` enum (14 total, up from 12). Default matrix: `manager` gets both, `viewer` gets `cicd.read`. CLI: `c4 cicd pipeline list`, `c4 cicd pipeline create --repo R --workflow W --trigger T [--trigger T2] --action worker.task:<template> [--action workflow.trigger:<workflow>] [--profile P] [--name N] [--id ID]`, `c4 cicd pipeline delete <id>`, `c4 cicd trigger <id>` (replay), `c4 cicd trigger --repo R --workflow W [--ref REF] [--input K=V]` (one-off). Audit events: `cicd.webhook`, `cicd.pipeline.created`, `cicd.pipeline.deleted`, `cicd.trigger`. Tests (`tests/cicd.test.js`) cover 56 cases across module exports, HMAC verification (valid / invalid secret / bad body / missing header / empty secret / malformed hex / Buffer input), GitHub event parsing (all five internal events + non-routable inputs), GitHub payload builder (default ref / custom ref+inputs copy / drops invalid inputs), sanitizers + normalizers, CRUD (register/list/get/delete/idempotent), storage roundtrip (save-load / external edit + reload / missing file / malformed JSON), event routing (pr.opened -> worker.task with branch from PR head, merge.main -> workflow_dispatch with `ref=main` + inputs, tag.created -> workflow_dispatch with tag ref, unknown event rejected, missing token skipped without throwing, no subscribers matched=0), `triggerWorkflow` (URL shape / Authorization+Accept+X-GitHub-Api-Version headers / fetchImpl body / throws without token / throws on missing repo|workflow), `runCheck` (task spec / dispatcher callback / missing input rejection), `applyConfig` (rebuilds while keeping pipelines / clears repos / rejects invalid provider), shared singleton stability + resetShared. `tests/rbac.test.js` bumps `ALL_ACTIONS.length` assertion to 14 and adds `CICD_READ` / `CICD_MANAGE` enum checks. Full suite 86 / 86 pass (up from 85). Patch note: `patches/1.9.5-cicd-integration.md`. Limitations: GitLab CI / Jenkins live as provider labels only (no dispatch implementations yet); YAML-based pipeline definitions are a follow-up; retry + dead-letter queues for failed workflow_dispatch calls are out of scope for this entry. Web UI CI/CD panel slots on top of the four REST endpoints and ships under the 10.x UI track.

- **Project-specific dashboard (10.3).** New `src/project-dashboard.js` joins the 10.8 `ProjectBoard`, 10.2 `AuditLogger`, and 10.5 `CostReporter` into a single per-project snapshot so project managers can see `tasks/workers/merges/tokens/velocity/contributors` for one project without stitching three endpoints together. `ProjectDashboard.getSnapshot(projectId)` returns `{project, activeWorkers, recentMerges, todoStats: {open, done, total, done_pct}, tokenUsage: {total, byUser, byModel}, contributors: [{user, tasks, tokens}], velocity: {tasksPerWeek, mergesPerWeek, windowWeeks, tasks, merges, windowStart, windowEnd}, generatedAt}` and caches per project for 30s. Cache keys carry a signature derived from `tasks.length + milestones.length + sprints.length + max(updatedAt)` so any `POST /projects/<id>/tasks` or `PATCH /projects/<id>/tasks/<taskId>` auto-invalidates the cached snapshot on the next read - operators never see stale dashboards after editing a task. `ProjectDashboard` is decoupled from the daemon: callers wire up `{board, auditLogger, costReporter, workers, now}` through the constructor, so tests can drop in tmpdir-backed collaborators and the daemon can wire the shared singletons. Worker matching follows the c4 branch convention (`c4/<projectId>`, `c4/<projectId>-feature`, `c4/<projectId>/sub`, or an explicit `project` field), `recentMerges` filters `merge.performed` audit events by the same branch rule and sorts newest-first, and `contributors` sums `project.tasks[].assignee` with `costReport` records that carry `{project, user, inputTokens, outputTokens}`. Daemon gains four new routes under `/projects/:id/*`: `GET /dashboard` (full snapshot, 404 on missing project), `GET /contributors` (per-user tasks+tokens), `GET /velocity?weeks=N` (tasksPerWeek/mergesPerWeek over sliding window, defaults to 4), `GET /tokens` (`{total, byUser, byModel}`). All four go through the existing `requireRole(authCheck, rbac.ACTIONS.PROJECT_READ, {type:'project', id})` gate so RBAC protects the dashboard the same way it protects `GET /projects/:id`. `config reload` drops the cached `ProjectDashboard` alongside the `ProjectBoard` so a new `projects.path` picks up on the next request without a daemon restart. CLI gains four new subcommands: `c4 project dashboard <id>` prints a compact human summary (tasks/workers/merges/tokens/velocity/contributors), `c4 project dashboard <id> --json` dumps the raw snapshot, `c4 project contributors <id>` prints the per-user list, `c4 project velocity <id> [--weeks N]` prints the velocity window, `c4 project tokens <id>` prints the token breakdown. Tests: `tests/project-dashboard.test.js` adds 28 tests (80+ assertions) covering snapshot shape, empty project zeros, todoStats rounding, activeWorkers branch matching, recentMerges newest-first ordering, tokenUsage per-user+per-model bucketing, contributors aggregation sorted by tokens desc, velocity default window + `--weeks` override, cache hit within TTL, signature-based auto-invalidation on project mutation, `invalidate()` / `invalidateAll()`, TTL expiry, resilience when `auditLogger` / `costReporter` are absent, and skipping malformed worker entries. Full suite 85 / 85 pass.
- **Role-based access control (10.1).** New `src/rbac.js` exports `RoleManager` plus helpers (`ROLES`, `ACTIONS`, `ALL_ACTIONS`, `DEFAULT_PERMISSIONS`, `defaultRbacPath`, `freshState`, `ensureShape`, `normalizeAcl`, `isRole`, `isAction`, `isUsername`, `getShared`, `resetShared`). Storage is a single JSON file at `~/.c4/rbac.json` (overridable via `config.rbac.path`) with shape `{roles, users, resources}`. Three built-in roles - `admin` (`['*']` wildcard, bypasses resource scoping), `manager` (worker.create/close/task/merge + project.create/read/update + fleet.add + config.reload + audit.read), `viewer` (project.read + audit.read only). 12 canonical actions: worker.create, worker.close, worker.task, worker.merge, project.create, project.read, project.update, fleet.add, fleet.remove, config.reload, auth.user.create, audit.read. Methods: `assignRole`, `removeUser`, `getUser`, `listUsers`, `listUsersByRole`, `listRoles`, `grantProjectAccess`, `revokeProjectAccess`, `grantMachineAccess`, `revokeMachineAccess`, `setResourceAcl`, `checkPermission(username, action, resource?)`, `reload`. The `resource` param `{type:'project'|'machine', id}` is optional - unscoped resources fall through to a role-only check so existing daemons keep working the moment auth flips on. JWT integration in `src/auth.js`: `login(cfg, body, opts)` accepts `opts.roleResolver(name) -> string|null` so the daemon injects the RBAC role without auth.js gaining a hard dependency on rbac.js; resolver -> `user.role` -> `'viewer'` fallback chain. Token payload now `{sub, role}`. Daemon middleware in `src/daemon.js`: shared `RoleManager` via `getShared`, `roleFor(name)` reads RBAC store first then `config.auth.users[name].role`, `requireRole(authCheck, action, resource?)` returns `{allow, status, body}` and is invoked at every gated route. Routes gated: `/create` (worker.create + machine ACL by target), `/task` (worker.task + machine ACL by target), `/merge` (worker.merge), `/close` (worker.close), `/config/reload` (config.reload + reload RBAC store), `/audit/query` + `/audit/verify` (audit.read), `/projects` GET (project.read), `/projects` POST (project.create), `/projects/:id` GET (project.read + per-project ACL), `/projects/:id/tasks` POST + `/projects/:id/tasks/:taskId` PATCH (project.update + per-project ACL). New endpoints: `GET /rbac/roles`, `GET /rbac/users`, `POST /rbac/role/assign`, `POST /rbac/grant/project`, `POST /rbac/grant/machine`, `POST /rbac/revoke/project`, `POST /rbac/revoke/machine`, `POST /rbac/check`. CLI (`src/cli.js`): `c4 rbac role list`, `c4 rbac role assign <user> <role>`, `c4 rbac grant project|machine <user> <id>`, `c4 rbac revoke project|machine <user> <id>`, `c4 rbac check <user> <action> [--resource type:id]`, `c4 rbac users`. Tests (`tests/rbac.test.js`): 37 tests / 80+ assertions across six suites - helpers, DEFAULT_PERMISSIONS matrix, assignRole + storage, checkPermission (admin bypass, viewer blocks, manager merge own project, grant/revoke roundtrip, unknown user/action denied, ACL allowedRoles), JWT payload (resolver, fallback, viewer default, bad credentials), shared singleton. All tests use `fs.mkdtempSync` so `~/.c4/rbac.json` is never touched. Full suite 84 / 84 pass (up from 83). Patch note: `patches/1.9.3-rbac.md`. Limitations: Web UI permission-scoped views remain a 10.x follow-up - the UI consumes `/rbac/check` per route to hide buttons the caller cannot reach.
- **Project management + TODO.md bidirectional sync (10.8).** New `src/project-mgmt.js` exports `ProjectBoard` plus helpers (`VALID_TASK_STATUS`, `MD_TO_TASK`, `TASK_TO_MD`, `defaultProjectsDir`, `stableTaskId`, `parseTodoMd`, `serializeTodoMd`). Storage is one JSON file per project at `~/.c4/projects/<projectId>.json`; schema = `{ id, name, description, createdAt, milestones:[{id,name,dueDate,status}], sprints:[{id,name,startDate,endDate,taskIds}], tasks:[{id,title,status,assignee,estimate,milestoneId,sprintId,description,createdAt,updatedAt}], backlog:[taskId...] }`. Internal task status is one of `'backlog'|'todo'|'in_progress'|'done'`; TODO.md only exposes three states so `syncTodoMd` maps `md:todo <-> internal:backlog` and keeps the other two aligned. Task IDs derive from `sha1(projectId+title).slice(0,10)` prefixed `task_` so re-import preserves assignee/sprint metadata across sync cycles. Methods: `createProject({id,name,description})`, `addTask(projectId, {...})` (dedupes by stable ID, auto-maintains `backlog` list + sprint membership), `updateTask(projectId, taskId, patch)` (patches only provided fields, invalid status throws, backlog/sprint invariants re-asserted on every mutation), `moveTaskToSprint(projectId, taskId, sprintId)` (null clears; moving a `backlog` task into a sprint promotes it to `todo` so the sprint view picks it up), `createMilestone`, `createSprint`, `listTasks(projectId, filter)` (filters by status single|array, milestoneId, sprintId, assignee — combined filters AND together), `projectProgress(projectId)` returns `{totalTasks, doneTasks, percent (2-decimal), byStatus}`, and `syncTodoMd(projectId, repoPath, opts?)` which imports `TODO.md` rows into project tasks then serialises the project back out as a canonical MD table (`| # | title | status | description |`) — second invocation over an unchanged file yields byte-identical output. CLI (`src/cli.js`): `c4 project create <id> --name N [--desc D]`, `c4 project list`, `c4 project show <id>`, `c4 project task add <projectId> <title> [--status S] [--milestone M] [--sprint S] [--assignee A] [--estimate N]`, `c4 project task update <projectId> <taskId> [--status S] [--title T] [--assignee A] [--estimate N] [--milestone M] [--sprint S] [--description D]`, `c4 project milestone add <projectId> <name> --due <date> [--id ID]`, `c4 project sprint add <projectId> <name> --start <d> --end <d> [--id ID]`, `c4 project progress <id>` (human-readable summary), `c4 project sync <id> [--repo PATH]` (defaults repo to `process.cwd()`). Daemon (`src/daemon.js`): `GET /projects`, `POST /projects`, `GET /projects/:id`, `POST /projects/:id/tasks`, `PATCH /projects/:id/tasks/:taskId`, `POST /projects/:id/milestones`, `POST /projects/:id/sprints`, `GET /projects/:id/progress`, `POST /projects/:id/sync`. The shared `ProjectBoard` honours `config.projects.path` and is dropped on `config.reload` so a live path change takes effect without a daemon restart. Tests in `tests/project-mgmt.test.js`: 54 assertions across nine suites covering helper invariants, createProject happy-path + validation, addTask append + dedup + invariants, updateTask patch semantics + sprint sync + invalid-status rejection, moveTaskToSprint cross-sprint + null clear + backlog promotion, createMilestone/createSprint uniqueness, listTasks filters (status single/array, milestone, assignee, sprint, combined AND), projectProgress empty/all-done/mixed/rounding, parseTodoMd/serializeTodoMd roundtrip + header/divider skip + bold/mixed-case tolerance, and syncTodoMd import + stable-id re-sync + status change + write-back + export-reimport-export stability. All tests run against `fs.mkdtempSync` paths so no real `~/.c4/projects` pollution. Full suite 83 / 83 pass. Patch note: `patches/1.9.2-project-mgmt.md`. Limitations: Web UI kanban/list view + per-assignee workload balancing remain as 10.x follow-ups (this entry is the storage + API + MD sync layer; the UI slots on top).
- **Cost report + billing aggregator (10.5).** New `src/cost-report.js` exports `CostReporter` plus helpers (`DEFAULT_COSTS`, `VALID_GROUP_BY`, `VALID_PERIODS`, `monthRange`, `periodRange`, `loadHistoryRecords`, `defaultHistoryPath`). Pure in-memory aggregator: accepts records via the `records` option or a `loadRecords` callback so unit tests run without the daemon and production code injects `loadHistoryRecords(history.jsonl)` per request. Record shape `{timestamp, project, team, machine, user, worker, model, inputTokens, outputTokens}`. `report({from, to, groupBy, includeModels})` aggregates by `project` / `team` / `machine` / `user` / `worker` and returns `{total: {tokens, inputTokens, outputTokens, costUSD, records}, byGroup: [{name, tokens, ..., costUSD, perModel?}], groupBy, period: {from, to}}`. `monthlyReport(year, month)` wraps `report` with UTC-safe calendar bounds (leap-year aware). `budgetCheck({limit, period, group, groupBy, warnAt})` returns `{used, limit, percent, warnAt, warning, exceeded, period, from, to, group, groupBy}` with `warning=true` at percent >= 0.8 (default) and `exceeded=true` at percent >= 1.0; throws on missing or non-positive limit and on unknown period. Cost formula `cost = inputTokens/1000 * rate.input + outputTokens/1000 * rate.output` where rates come from `config.costs.models` (opus 15/75, sonnet 3/15, haiku 0.8/4, local 0/0, default 3/15 fallback). Unknown models silently fall back to `default` so new model rollouts never break reporting. `byGroup` sorted by `costUSD` descending, ties broken by group name; totals rounded to 4 decimal places. Config addition: `costs.models` rate table + `costs.budget: {defaultPeriod, warnAt, monthlyLimitUSD}` in `config.example.json`. Daemon endpoints in `src/daemon.js`: `GET /cost/report?from=&to=&group=&models=` returns the full report, `GET /cost/monthly/<year>/<month>?group=` wraps `monthlyReport`, `POST /cost/budget` with `{limit, period, group, groupBy, warnAt}` returns the budget check. Reporter is rebuilt per request so `c4 config reload` takes effect without a daemon restart. CLI in `src/cli.js`: `c4 cost report [--from ISO] [--to ISO] [--group project|team|machine|user] [--models] [--json]`, `c4 cost monthly <YYYY-MM> [--json]`, `c4 cost budget --limit N [--period day|week|month] [--group name] [--json]`. Budget printer statuses: `[OK]` (under warn threshold), `[WARN]` (at/above warnAt, under limit), `[EXCEEDED]` (at/above limit). Tests in `tests/cost-report.test.js`: 46 assertions across seven suites covering helpers (DEFAULT_COSTS shape + VALID_GROUP_BY + VALID_PERIODS + monthRange regular/leap/January/invalid + periodRange day/week/month), getRate/costForRecord with known + unknown + zero-default fallback, groupBy variations (project/team/machine/user/worker) + `unknownLabel` override + invalid-coerces-to-default, totals + time filter + `includeModels` on/off + zero records + zero tokens + malformed records dropped + sort-by-cost-desc, `monthlyReport` calendar bounds + includeModels default-true, `budgetCheck` limit validation + under-warn ok + warn at 0.8+ + exceeded at 1.0+ + group filter + custom warnAt + unknown period throws + missing group -> used=0, and `loadHistoryRecords` JSONL roundtrip + missing file + malformed lines + `defaultHistoryPath` + full `CostReporter` integration via `loadRecords`. Full suite 82 / 82 pass. Patch note: `patches/1.9.1-cost-report.md`. Limitations: `history.jsonl` writer does not yet persist per-record token counts, so cost aggregation is accurate structurally but under-counts dollars until the history enrichment follow-up lands (additive, no schema break). Web UI cost dashboard + hard budget enforcement slot on top of the endpoints and ship under the 10.x UI track.
- **Append-only audit log with tamper-evident hash chain (10.2).** New `src/audit-log.js` exports `AuditLogger` + helpers (`canonicalize`, `hashEvent`, `getShared`, `resetShared`, `defaultLogPath`, `EVENT_TYPES`, `DEFAULT_ACTOR`). Writes one JSON event per line to `~/.c4/audit.jsonl` (path configurable via `config.audit.path`); each event carries `{timestamp, type, actor, target, details, hash}` where `hash = sha256(prevHash + canonicalize(event))` — binding every line to the chain of everything before it so any edit to an earlier line invalidates every subsequent hash. Canonical serialization pins key order (timestamp -> type -> actor -> target -> details) so `record()` and `verify()` hash the same byte string regardless of V8's JSON.parse ordering. `record(type, details, overrides)` is synchronous and uses `fs.appendFileSync` — run-to-completion in single-threaded JS means concurrent callers cannot interleave and corrupt the chain. `query({type, from, to, target, limit})` reads the file and filters by type / target / ISO-8601 time range / limit; non-existent file returns `[]`. `verify()` recomputes the full chain and returns `{valid, corruptedAt, total}` — `corruptedAt` pinpoints the 0-based line index of the first break. Daemon integration (`src/daemon.js`): shared singleton via `getShared`, `_safeAudit` wrapper so a logging failure never breaks the request, `_auditActor(authCheck)` pulls `authCheck.decoded.sub` (JWT subject) when auth is enabled and falls back to `'system'`. Hooks on `POST /auth/login` (success + failure with reason), `POST /auth/logout`, `POST /create` (`worker.created`), `POST /close` (`worker.closed`), `POST /task` (`task.sent` with first-500-char task snippet + branch + profile + autoMode), `POST /approve` (optionNumber=1 or null => `approval.granted`, otherwise `approval.denied`), `POST /merge` (`merge.performed` with branch + skipChecks flag), `POST /config/reload` (`config.reloaded`). New HTTP endpoints: `GET /audit/query` (query params: type, from, to, target, limit; returns `{events, count, path}`), `GET /audit/verify` (returns `{valid, corruptedAt, total, path}`). CLI (`src/cli.js`): `c4 audit query [--type T] [--from ISO] [--to ISO] [--target name] [--limit N]` prints one JSON event per line for machine consumption; `c4 audit verify` prints `[ok] audit log valid (N events)` or `[tamper] hash chain broken at line N` + exits 2. Tests: `tests/audit-log.test.js` adds 30 tests / 100+ assertions across six suites — helper shape (defaultLogPath + EVENT_TYPES membership + canonicalize key order + hashEvent determinism and chain), record (JSONL append + ISO-8601 regex + full field set + default actor 'system' + first-event hash = sha256 of canonical event + subsequent-event chain binding + tail-hash recovery across new logger instances), query (non-existent -> [] + no-filter returns all in order + type/target/from/to/limit filters + combined filter), verify (non-existent + fresh log -> valid, edited timestamp / edited details / corrupted JSON / deleted middle line -> corruptedAt reports correct index), concurrency (30-call burst valid chain + 10-call burst FIFO order + Promise.all-wrapped 20-call atomic serialize), shared singleton (stable instance + resetShared clears). All tests use `fs.mkdtempSync` paths so no real `~/.c4/audit.jsonl` pollution. Full suite 81 / 81 pass. Patch note: `patches/1.9.0-audit-log.md`.
- **Local LLM adapter with hybrid routing (9.2).** New `src/agents/local-llm.js` ships `LocalLLMAdapter` (and three backend-pinned subclasses `LocalOllamaAdapter` / `LocalLlamaCppAdapter` / `LocalVllmAdapter`) that plug into the 9.1 Adapter framework as a pseudo-PTY, so the daemon can drive a self-hosted inference server with the same state machine it uses for Claude Code — no PtyManager rewrite, no second scrollback implementation. Backends share one class keyed by `options.backend`: `ollama` posts to `POST <url>/api/generate` with `{model, prompt, stream:true}` and parses JSONL (one JSON object per line, `done:true` terminates); `llama-cpp` and `vllm` post to `POST <url>/v1/chat/completions` with `{model, messages, stream:true}` and parse OpenAI-style SSE frames (`data: {...}\n\n`, tokens from `choices[0].delta.content`, `data: [DONE]` terminates). Defaults: ollama `http://localhost:11434` + `llama3.1`; llama-cpp `http://localhost:8080` + `local-model`; vllm `http://localhost:8000` + `meta-llama/Llama-3.1-8B`. The adapter maintains its own `ScreenBuffer(cols, rows)` so existing scrollback / stall / hook consumers keep working, and exposes PTY lifecycle methods `spawn(opts)` / `write(data)` / `resize(cols, rows)` / `kill()` / `dispose()` alongside the Adapter interface (`init` / `sendInput` / `sendKey` / `onOutput` / `detectIdle` + `metadata:{name:'local-llm',version:'1.0.0',backend}` + `supportsPause:true`). `write()` echoes input, buffers until a CR/LF boundary, then fires `runInference(prompt)` which returns the assembled assistant text; tokens stream through the standard `onOutput(cb)` fan-out as they arrive so watchers see responses materialize chunk-by-chunk. Fragmented streams across TCP chunks re-assemble (JSONL by `\n`, SSE by `\n\n`). For OpenAI-compat backends the adapter keeps `_history` so multi-turn prompts stay coherent; Ollama's `/api/generate` is single-shot so history is not retained. `detectIdle(chunk)` returns `true` only when the prompt marker is present AND the adapter is not in-flight. Error handling is in-band (no exception leaks): connection refused, HTTP 500, missing fetch, and stream decode errors all surface as `\r\n[local-llm:<backend>] error: <msg>\r\n` on the screen and release the `_busy` flag, so a stuck inference never pins the adapter. `dispose()` aborts in-flight via `AbortController`, clears listeners + history + input buffer, and makes subsequent `write()` a no-op. `src/agents/index.js` registers `local-ollama` / `local-llama-cpp` / `local-vllm` alongside `claude-code`; the factory also resolves per-type sub-bags under `agentConfig.options[type]` (falling back to flat options for backwards compat). Hybrid routing: when `agentConfig.type === 'hybrid'` (or `legacyOpts.hybrid === true`) the factory inspects `legacyOpts.task`/`legacyOpts.prompt` and applies the heuristic `isComplexTask(task, {threshold, keywords})` — char length > `hybridThreshold` (default 2000) OR matches any `complexKeyword` (default `['refactor', 'architect', 'architecture', 'design']`, case-insensitive) => `agentConfig.complex` (default `claude-code`); otherwise => `agentConfig.local` (default `local-ollama`). `config.example.json` grows `agent.local` / `agent.complex` / `agent.hybridThreshold` / `agent.complexKeywords` knobs plus per-type sub-bags for the three local backends. Tests: `tests/local-llm.test.js` adds 40 assertions across 8 node:test suites using a stubbed `fetch` + `ReadableStream` so no real LLM server is contacted — construction + defaults (3 subclasses, URL/model overrides with trailing-slash stripping, `BACKENDS` constant, unknown-backend rejection), `buildRequest` payload shape (ollama at `/api/generate`, llama-cpp/vllm at `/v1/chat/completions`, `systemPrompt` prepended), ollama JSONL streaming including fragmented re-assembly and no-history invariant, OpenAI SSE streaming including `[DONE]` halt + fragmented re-assembly + user+assistant history, error handling (ECONNREFUSED, HTTP 500, `fetch:null`), adapter + PTY lifecycle (`spawn` emits `> `, `resize` forwards to ScreenBuffer, `sendKey` maps Escape/literal, `detectIdle` respects `_busy`, `write('hi\r')` returns inference promise + POST body carries prompt, `dispose` aborts in-flight + clears listeners + inert writes), hybrid heuristic (short/long/keyword cases, custom threshold + keywords + targets), factory integration (REGISTRY keys, `local-ollama` selection, nested options, `hybrid` + short/long/keyword, `legacyOpts.hybrid:true` override, `agentConfig.hybridThreshold` respected, `claude-code` default). Full suite 80/80 pass (79 existing + local-llm). Patch note: `patches/1.8.4-local-llm.md`.
- **Machine-to-machine file transfer (9.8).** New `src/file-transfer.js` pure-node helper provides rsync-over-ssh + git-push-over-ssh for fleet peers. `transferFiles(src, dest, {machine, excludes, delete, dryRun, allowSystem, onProgress, onComplete, onError})` spawns `rsync -avzP --info=progress2` with `-e "ssh -o BatchMode=yes -o StrictHostKeyChecking=accept-new [-p <port>]"` so key-auth failures surface immediately instead of silently prompting; `pushRepo(machine, localRepoPath, branch, {remoteRepoPath, force, allowSystem})` spawns `git -C <local> push <alias>:<remoteRepoPath> <branch>` with `GIT_SSH_COMMAND` wrapping the same BatchMode envelope. Progress parsing: `parseRsyncProgress` matches the cumulative `<bytes> <pct>% <rate> <eta>` line, `parseRsyncFileLine` filters indented + status noise (`sending incremental file list`, `sent N bytes`, `total size`, `(xfr#...)`). The driver threads the most recent filename into each progress event so consumers always know which file the bytes belong to. Safety guards refuse: src outside `$HOME` / project root / explicit allowed roots (resolve-before-check catches `/root/../etc/passwd`), anything under `/etc /bin /sbin /boot /dev /proc /sys` even with `allowSystem`, absolute remote dest without `--allow-system`, `..` traversal in dest, shell metachars that would expand on the remote side, and plain `git push --force` (maps to `--force-with-lease`). Daemon: new `POST /transfer {alias, type:'rsync'|'git', src, dest|remoteRepoPath, branch?, opts}` returns `{started, pid, alias, type, transferId, cmd, args}` immediately and emits `transfer-progress` / `transfer-complete` / `transfer-error` events on the existing `/events` SSE stream, correlated by `transferId`. CLI: `c4 send-file <alias> <localPath> <remotePath> [--delete] [--exclude pattern] [--dry-run] [--allow-system]` and `c4 push-repo <alias> [branch] --remote-repo <path> [--repo <localPath>] [--force] [--allow-system]`. Tests: `tests/file-transfer.test.js` 69 assertions across 18 suites (arg building, progress parsing, safety guards including path traversal, git push construction, fleet alias resolution, driver spawn + stream drain + complete/error, daemon + cli source-grep wiring). Full suite 79/79 pass. Limitations: cumulative progress (rsync `--info=progress2` convention, not per-file), transfers tied to daemon lifetime (no cross-restart resume), fleet.json stores HTTP host/port only so ssh keys/known_hosts remain operator-managed. Patch note: `patches/1.8.3-file-transfer.md`.
- **Fleet task dispatcher (9.7):** new `src/dispatcher.js` pure-node module ships the ranking + placement pipeline that picks which fleet peer a task lands on, so operators can run `c4 dispatch "train a model" --count 3 --tags gpu,high-mem` and the daemon decides where each worker spawns based on live machine load + role tags. Exports `normalizeStrategy` / `buildPool` / `sampleFleet` / `filterByTags` / `filterReachable` / `rankLeastLoaded` / `rankTagMatch` / `rankRoundRobin` / `rankMachines` / `pickLeastLoadedIncremental` / `pickTagMatchIncremental` / `pickRoundRobin` / `planPlacement` / `buildLocalSample` / `dispatch`. Three strategies: (a) `least-loaded` orders machines by active worker count ascending, then by tag count descending (more-specific peers win ties), then by alias; (b) `tag-match` orders by match-count descending then workers ascending, a soft filter that still returns non-matching peers as a fallback ranked last so the caller can choose whether to accept a miss; (c) `round-robin` sorts alphabetically and walks cyclically so `count=5` across three machines produces `[alpha, beta, gamma, alpha, beta]` deterministically. Placement is **incremental** -- `pickLeastLoadedIncremental` and `pickTagMatchIncremental` increment a simulated worker count per chosen slot so a 4-slot batch against 2 equally-loaded peers lands `[a, b, a, b]` instead of piling on one machine. `buildPool` honors a `locationPin` option for explicit routing (`c4 dispatch ... --location dgx`), and `buildLocalSample` synthesizes a row for the caller's own daemon so the pool always considers `_local` alongside remote peers. Every slot carries a `score` breakdown `{strategy, workers, tagCount | tagMatches, tagWanted}` so operators can see *why* a slot was placed. Fallback paths never throw: `no-machines` (empty fleet + no local), `local-only` (fleet empty, local ok), `all-unreachable` (every remote sample failed and no local), `tags-no-match` (tag filter emptied the pool); transport failures in `sampleMachine` surface as `{ok:false, error}` rows so the plan stays stable. Fleet tags live on `src/fleet.js`: `addMachine({tags: ['gpu', 'high-mem']})` validates each tag against `/^[a-z0-9][\w.-]*$/`, lowercases + dedupes via `normalizeTags`, and persists the array into `~/.c4/fleet.json`; `getMachine` / `listMachines` echo `tags: string[]` (empty array when unset); re-adding the same alias without `--tags` preserves the stored set, `clearTags:true` wipes. Daemon: `src/daemon.js` imports `./dispatcher` and exposes `POST /dispatch {task, count, strategy, tags, location, namePrefix, branch, profile, autoMode, dryRun}` behind the existing `auth.checkRequest` gate. The handler reads `manager.list()` for the live self sample, enumerates `fleet.listMachines()` for the remote set, calls `dispatcher.dispatch(...)`, and then fans out `manager.sendTask(name, task, {branch, profile, autoMode})` for local slots while remote slots route through `fleet.proxyRequest({base, token}, 'POST', '/task', payload)` so each peer's JWT auth stays honored. Response envelope is `{strategy, count, tags, fallback, plan[], samples[], created[] | null, dryRun}` where `plan[]` lists the scored placements, `samples[]` exposes the per-machine health row (alias / host / port / ok / workers / version / error / elapsedMs / tags), and `created[]` reports the per-slot `/task` or `sendTask` outcome (`{name, alias, ok, result | error, status}`). `dryRun:true` returns the plan without issuing any `/create` or `/task` calls so operators can audit a placement before committing. CLI: new `c4 dispatch "<task>" [--count N] [--tags t1,t2] [--strategy least-loaded|tag-match|round-robin] [--branch prefix] [--name prefix] [--profile name] [--auto-mode] [--dry-run] [--location alias]` with formatted output that prints `SAMPLES` (alias / ok / workers / tags / elapsed), `PLAN` (slot / name / alias / strategy / score), and `CREATED` (per-slot outcome) tables. `c4 fleet add` gains `--tags t1,t2` / `--clear-tags`, and `c4 fleet list` renders a new `TAGS` column. The top-level `c4` help text lists both new surfaces. Tests: `tests/dispatcher.test.js` adds 42 assertions across 13 node:test suites -- (a) `normalizeStrategy` defaults to least-loaded, accepts case-insensitive known names, throws on unknown; (b) `rankLeastLoaded` orders by workers asc then tag count desc then alias asc, places unknown workers (`null`) last via `Infinity`; (c) `rankTagMatch` orders by match count desc then workers asc then alias asc, handles the zero-wanted-tags edge; (d) `rankRoundRobin` alpha-sorts; (e) `filterByTags` drops missing-tag machines case-insensitively, returns the input unchanged on empty tags; (f) `filterReachable` drops `ok:false`; (g) `buildPool` filters invalid entries (missing host / port), honors `locationPin` to a single alias, returns `[]` when the pin misses; (h) `sampleFleet` folds pool `tags` + `authToken` onto sample rows so older daemons that don't echo tags still work, empty pool returns `[]`; (i) `pickLeastLoadedIncremental` increments simulated load so two slots against two equal machines do not collide, respects preexisting worker counts (slots pile on the idle machine when one peer already has 5 workers); (j) `pickRoundRobin` cycles when `count > pool`, returns `[]` on empty pool; (k) `dispatch()` end-to-end matrix -- `fallback: 'no-machines'` on empty fleet + no local, `fallback: 'local-only'` with 3 slots all routed to `_local` when no remotes exist, `fallback: 'all-unreachable'` when every remote sample fails, all-remote-unreachable-with-local-ok routes to local (no fallback flag), `fallback: 'tags-no-match'` when the filter empties the pool under a non-tag-match strategy, round-robin spreads 5 slots across 3 sorted machines deterministically, tag-match picks the gpu peer even when it has 10 workers and the cpu peer has 0 (tag match dominates load), least-loaded avoids a hot machine with 10 workers in favor of a cold one with 0 for all 3 slots, `location: 'b'` forces every slot to alias `b` even with a lower-loaded peer `a` available, plan enrichment stamps `name: 'dispatch-N'`, `branch: 'feature-N'`, and `task` on each slot; (l) fleet tags persistence through addMachine + getMachine + listMachines (store / preserve on re-add without tags / `clearTags` wipe / casing + dedup normalization / reject invalid tag chars with `/invalid tag/`); (m) daemon + cli source-grep wiring (`require('./dispatcher')`, `route === '/dispatch'`, `dispatcher.dispatch(`, CLI `case 'dispatch':`, `--strategy` / `--tags` flags, help-text `dispatch "<task>"` line, `--tags` in fleet add). Full suite 78 / 78 pass. Scope / limitations: (i) the dispatcher does not create the *worker* on the remote peer -- it sends `/task` which triggers that peer's auto-create via the existing worker lifecycle; if an operator wants a bare `/create` followed by a separate task flow, call `/dispatch` with `dryRun:true` then fan out their own create + task calls per slot; (ii) the fallback chain ends at "local ok" -- if the local daemon is also unreachable (which means the CLI cannot reach its own daemon, so this case is impossible in practice), the response carries `fallback: 'all-unreachable'` and an empty plan; (iii) tag matching is set-intersection, not substring -- `--tags gpu` matches a machine tagged `gpu` but not one tagged `gpu-pool`, so use the exact label; (iv) round-robin is *stateless* -- each `c4 dispatch` call starts from the first alias in the sorted list, so two sequential 1-slot dispatches both land on the first alias; use `--strategy least-loaded` if you want sequential dispatches to spread. Patch note: `patches/1.8.2-dispatcher.md`.
- **Claude Code native plugin (9.5):** new top-level `claude-code-plugin/` directory ships a Claude Code plugin that exposes the five core c4 worker-lifecycle operations as slash commands: `/c4-new <name>`, `/c4-task <name> <task>`, `/c4-list`, `/c4-merge <name>`, `/c4-close <name>`. The plugin lets an operator drive the c4 daemon from inside Claude Code without touching the `c4` CLI or the Web UI, complementing the existing CLI + SDK + MCP server surfaces that all talk to the same daemon routes. Manifest `claude-code-plugin/plugin.json` declares `{name:"c4", version:"1.8.1", engines:{node:">=18.0.0", "claude-code":">=2.0.0"}, commandsDir:"commands", commands:[...]}` with each command carrying `name`, `description`, `usage`, `file` (the markdown slash command), `handler` (the JS module), and a typed `arguments` array (required-boolean per arg) so plugin loaders that validate against the manifest get a complete surface. Every slash command is a pair: `commands/<name>.md` is the Claude Code slash command entry (header `allowed-tools: Bash` + an `$ARGUMENTS` invocation of the sibling `.js` handler via `$CLAUDE_PLUGIN_ROOT`) + `commands/<name>.js` is the pure-function handler. The handlers accept `{args, env, fetch, ClientClass, useSdk, base, token}` and never require Claude Code to execute - tests import them and drive HTTP behavior against a stub fetch. Under the hood every handler goes through `commands/_client.js`: `loadSdk()` first tries `require('c4-sdk')`, then falls back to the sibling `../../sdk` and `../../sdk/lib` directories so the plugin works from a source checkout even before `c4-sdk` is published; when no SDK is resolvable the handler uses a built-in `MinimalC4Client` that wraps `fetch` directly with the same method surface (`listWorkers` / `createWorker` / `sendTask` / `merge` / `close`). `getClient({env, fetch, ClientClass, useSdk, base, token})` is the single factory and returns `{client, source:'injected'|'c4-sdk'|'minimal', base, token}` so tests (and debugging) can tell which code path is active. Token resolution mirrors the `c4` CLI: `env.C4_TOKEN` > `~/.c4-token` file, attached as `Authorization: Bearer <jwt>` on every request so auth.enabled deployments (8.14) keep working. Base URL resolution honors `env.C4_BASE` > `env.C4_URL` > `http://localhost:3456`. `commands/_argv.js` is a tiny argv parser (positional -> `_`, `--flag=value`, `--flag value`, `boolFlags:['auto-mode', ...]`, `--` terminator) that each handler's CLI entry uses when invoked via `node commands/<name>.js ...` so the commands double as manual-smoke test tools. Each handler exports `{handler}` and has its own `require.main === module` guard that prints the JSON envelope on success and writes the error to stderr with exit code 1 on failure. `claude-code-plugin/README.md` is the operator-facing setup guide: three install paths (symlink `claude-code-plugin` into `~/.claude/plugins/c4/`, copy the directory, or use the project-local `.claude/plugins/` folder), prerequisites (daemon running, Node >= 18, optional JWT from 8.14, optional `c4-sdk`), the environment variable table, a manual smoke-test block (`node ~/.claude/plugins/c4/commands/c4-list.js`), and a limitations section. Tests: `tests/cc-plugin.test.js` adds 25 node:test assertions across five concerns without requiring Claude Code or a running daemon - (a) **manifest structure**: `name === 'c4'`, semver version, `engines.node >= 18`, exactly five commands with `{c4-new, c4-task, c4-list, c4-merge, c4-close}` as the name set, every command has non-empty description + `handler` pointing into `commands/*.js` + `file` pointing into `commands/*.md` + `arguments[]` with `{name, required:boolean}`, handler + markdown paths resolve on disk, required positional args match the spec (c4-new/task/merge/close require `name`, c4-task also requires `task`, c4-list takes no arguments); (b) **shared client**: `MinimalC4Client._request` wires method + URL + body + `Authorization: Bearer` header, strips undefined option fields so the `/create` body is `{name:"w-a", target:"local", parent:"mgr"}` instead of `{name, target, parent, command:undefined, args:undefined, ...}`, non-2xx throws with `err.status === 409` + `err.body.error === 'name taken'`, constructor with explicit `fetch:null` (using `Object.prototype.hasOwnProperty` check so it distinguishes "omitted" from "explicitly null") throws "no fetch implementation"; (c) **getClient factory**: injected `ClientClass` wins with `source:'injected'`, `useSdk:false` forces `MinimalC4Client` with `source:'minimal'`, `c4-sdk` is picked up with `source:'c4-sdk'` when the sibling `sdk/` is resolvable; (d) **parseArgv**: positional capture into `_`, `--flag=value` inline form, `--flag value` space form, `boolFlags` list accepts flags without value, `--` terminator ships the rest as positional; (e) **per-handler HTTP behavior**: `c4-new` -> POST /create with `{name:"w1", target:"local", parent:"mgr", command:"claude"}`; `c4-task` -> POST /task with `{name, task, autoMode:true, branch:"c4/foo", reuse:true}` (string "yes" coerces to boolean true via `toBool`); `c4-list` -> GET /list with `init.body === undefined`; `c4-merge` -> POST /merge with `{name, skipChecks:true}` when `--skip-checks` passed, and `skipChecks` field is omitted when the flag is absent (so the daemon sees the same body shape it does from the CLI); `c4-close` -> POST /close with `{name}`; every handler rejects missing required args synchronously (`err.code === 'MISSING_ARG'`, `err.argName`) without hitting the network (stub fetch call count === 0); positional `args._[0]` falls through to `name`, positional tail folds into `task` (`args._ = ['w1','hello','world']` -> body.task === 'hello world'); (f) **auth + error pass-through**: `env.C4_TOKEN='jwt-abc'` results in `Authorization: Bearer jwt-abc` header on the request; daemon 401 with `{error:'Authentication required'}` surfaces as a thrown error carrying `status:401` + parsed `body`. Full suite 77 / 77 pass. Install flow for a user: `ln -s /path/to/c4/claude-code-plugin ~/.claude/plugins/c4` + `c4 daemon start` + reload Claude Code; the five slash commands autocomplete and hit the local daemon. The plugin does not require a build step - all `.js` + `.md` + `plugin.json` files are ready-to-run. Node_modules for the plugin are inherited from the parent c4 project when installed from a source checkout (commands/_client.js's fallback resolves `../../sdk` from the plugin dir). Limitations: (i) no SSE watch proxy - the plugin exposes only lifecycle operations, so callers who need live output streaming still use `c4 watch <name>` or the SDK's `watch()` iterator; (ii) no interactive approval UI - critical-deny prompts and permission questions still require `c4 approve` or the Web UI; (iii) single daemon only - the plugin always talks to the local daemon resolved via `C4_BASE`, fleet routing (9.6) stays CLI-only; (iv) older Claude Code releases that predate `plugin.json` loaders still work if the operator symlinks the five `commands/*.md` files individually into `~/.claude/commands/` (they invoke the sibling `.js` handlers through `$CLAUDE_PLUGIN_ROOT`, and the README covers the per-command install variant). Patch note: `patches/1.8.1-cc-plugin.md`.
- **c4-sdk package for programmatic daemon control (9.3):** new top-level `sdk/` directory ships the `c4-sdk` npm package (v0.1.0) so applications can drive the c4 daemon without shelling out to the CLI. Entry point `sdk/lib/index.js` exports `C4Client` / `C4Error` / `DEFAULT_BASE` as plain CommonJS with **zero runtime dependencies** (uses global `fetch` from Node 18+ with a `opts.fetch` escape hatch), and `sdk/lib/index.d.ts` ships hand-written TypeScript declarations -- no build step. `C4Client` wraps every relevant daemon HTTP route: `health()` (GET `/health`), `listWorkers()` (GET `/list`), `getWorker(name)` (convenience filter over `/list`), `createWorker(name, {command, args, target, cwd, parent})` (POST `/create`), `sendTask(name, task, {branch, useBranch, useWorktree, projectRoot, cwd, scope, scopePreset, after, command, target, contextFrom, reuse, profile, autoMode, budgetUsd, maxRetries})` (POST `/task`), `sendInput(name, text)` (POST `/send`), `sendKey(name, key)` (POST `/key`), `readOutput(name, {now, wait, mode, timeoutMs, interruptOnIntervention})` (GET `/read` | `/read-now` | `/wait-read`), `watch(name, {signal})` (GET `/watch` SSE -> `AsyncIterable<WatchEvent>` where each `type === 'output'` event surfaces a convenience `dataText` field populated from base64-decoded `data`), `merge(name, {skipChecks})` (POST `/merge`), `close(name)` (POST `/close`), and `fleetOverview({timeoutMs})` (GET `/fleet/overview`). The watch stream is parsed manually (`Response.body.getReader()` + SSE framing on `\n\n` boundaries with `data: ` + `event: ` line handling) so the same entry point works in Node and in browser bundlers, and the iterator's `return()` / `throw()` abort the underlying fetch to clean up the EventSource-like stream when the caller breaks out of `for await`. JWT auth (from 8.14) is plumbed on two axes: the client sends `Authorization: Bearer <jwt>` on JSON calls and additionally appends `?token=<jwt>` on the SSE watch URL so EventSource-style clients that cannot set headers still authenticate (mirrors `auth.extractBearerToken` fallback in `src/auth.js`). Error handling: every non-2xx response throws `C4Error` with `.status` (HTTP code) and parsed `.body` (JSON or raw text) so callers can branch on `err.status === 401` and re-login; transport failures preserve the original error via `.cause`. Required-argument checks (`createWorker`, `sendTask`, `sendKey`, `watch`) throw synchronously so bad callers fail before hitting the network. `sdk/examples/basic.js` walks the typical spawn -> task -> watch -> wait-read -> close lifecycle with env overrides (`C4_BASE`, `C4_TOKEN`, `C4_WORKER`, `C4_TASK`). `sdk/README.md` documents install (`npm install c4-sdk`), JWT login flow (POST `/auth/login` -> pass `token` into the client), a method table mapping every method to its daemon route, the watch event shape (`connected` / `output` / `complete` / `error`), and TypeScript usage. Tests: `tests/agent-sdk.test.js` adds 27 assertions across 4 node:test suites that boot an in-process `http.createServer` mock daemon on an ephemeral port (no real PtyManager, no port conflicts) and exercise every method: (a) **basics** -- `throws when no fetch is available` (constructor respects `opts.fetch: null` via `hasOwnProperty` check so tests can force the error path even when the global exists), trailing-slash stripping on `base`, `DEFAULT_BASE` export used when `base` is absent; (b) **happy path** -- `health` / `listWorkers` / `getWorker` (filter + null on missing) / `createWorker` / `sendTask` (autoMode + branch options forwarded), `sendInput` / `sendKey` / `readOutput` in all three modes (`/read` default, `{now:true}` -> `/read-now`, `{wait:true, timeoutMs, interruptOnIntervention}` -> `/wait-read` with query mapping), `merge` with `skipChecks`, `close`, `fleetOverview` with `timeoutMs` forwarded, and `watch` decoding base64 frames into `dataText` while terminating gracefully on stream end plus returning a 404 `C4Error` for `watch('missing')`; (c) **error handling** -- 409 conflict surfaces with `C4Error.status === 409` and parsed body, unknown route returns 404, dead port surfaces as `C4Error` without eating the cause, every required-arg guard throws synchronously; (d) **JWT auth** -- daemon gate rejects calls without a token with 401, client sends `Authorization: Bearer` header on JSON endpoints, client appends `?token=` on the SSE watch URL (and also keeps the header), and `/health` remains reachable without a token per the existing 8.14 open-route list. Full suite 76 / 76 pass. Scope / follow-ups: the SDK does not re-implement CLI-only concerns (no pin file parsing, no fleet machine management beyond `fleetOverview`, no interactive approval UI); those live in the CLI. Future work: optional helpers (`waitIdle`, `createAndRunTask`), WebSocket / long-poll alternatives to SSE, and a browser-targeted build once we stabilize import conditions. Patch note: `patches/1.8.0-agent-sdk.md`.
- **Agent Framework phase 1 - adapter interface + Claude Code extraction (9.1):** first batch of TODO 9.1 migrates C4 from a Claude-Code-only orchestrator toward a pluggable agent framework without changing PTY behavior. New `src/agents/adapter.js` defines the explicit `Adapter` abstract base class with five required methods (`init(workerCtx)` / `sendInput(text)` / `sendKey(key)` / `onOutput(cb)` / `detectIdle(chunk)`) plus `metadata: {name, version}` + boolean `supportsPause`, and a thin runtime validator `validateAdapter(instance)` that throws on the first shape violation so a bad adapter fails at wire-up, not mid-task. `Adapter` is marked abstract via `new.target` guard and ships `_emitOutput(chunk)` + `onOutput` unsubscribe helpers that swallow listener errors so a buggy consumer can't kill the PTY loop. New `src/agents/claude-code.js` (`ClaudeCodeAdapter`) is the first concrete adapter: it carries the entire Claude Code pattern surface that used to live on `TerminalInterface` - `isTrustPrompt` / `isPermissionPrompt` / `isReady` / `isModelMenu` / `getPromptType` / `extractBashCommand` / `extractFileName` / `countOptions` / `getApproveKeys` / `getDenyKeys` / `getTrustKeys` / `getModelMenuKeys` / `getEffortKeys` / `getEscapeKey` plus the default pattern dictionary and a named-key map (Enter/Escape/Tab/Backspace/Up/Down/Left/Right/C-c/C-d) so `sendKey('Enter')` produces `\r`, `sendKey('C-c')` produces `\x03`, and unknown names pass through unchanged. `metadata` is `{name: 'claude-code', version: '1.0.0'}` and `supportsPause` is `false` (Claude Code has no true pause - Ctrl-C interrupts). `init(workerCtx)` captures the `{proc, screen, name}` context so `sendInput(text)` can delegate to `proc.write` with no-op fallback when no proc is attached; `detectIdle(chunk)` delegates to `isReady`. New `src/agents/index.js` exposes `createAdapter(agentConfig, legacyOpts)` as the factory: `agentConfig.type` selects from `REGISTRY` (currently `{'claude-code': ClaudeCodeAdapter}`), throws `Unknown agent type: X. Registered: claude-code` on mismatch, merges `legacyOpts` under `agentConfig.options` so existing callers that pass `patterns` + `alwaysApproveForSession` keep working without restructuring, then runs `validateAdapter` before returning. `listAdapterTypes()` exposes the registry keys for introspection. `src/terminal-interface.js` is now a thin backward-compat wrapper: `new TerminalInterface(patterns, options)` calls the factory with `agent = options.agent || {type: 'claude-code'}` and returns the adapter directly (constructor-return trick) so every legacy call site in `src/pty-manager.js` (`_termInterface.isReady`, `_termInterface.isTrustPrompt`, `_termInterface.getDenyKeys`, etc. - 23 call sites across PTY lifecycle + permission gate + effort setup + scope guard) resolves unchanged. The module also re-exports `createAdapter` / `listAdapterTypes` / `REGISTRY` / `Adapter` / `ClaudeCodeAdapter` / `validateAdapter` for migration paths. `config.example.json` grows an `agent` section documenting the full surface - `{type: 'claude-code', options: {'claude-code': {}, 'local-llm': {endpoint, model}, 'codex': {}, 'claude-agent-sdk': {}}}` - so operators can see every planned adapter slot without guessing, even though only `claude-code` is wired today. Tests: `tests/agent-framework.test.js` adds 30 node:test assertions across 4 suites: (a) **Adapter base class contract** - abstract guard via `new Adapter()` throws, `validateAdapter` accepts a well-formed ClaudeCodeAdapter, rejects null / non-object / missing required methods / invalid metadata (empty name) / non-boolean `supportsPause`; (b) **ClaudeCodeAdapter interface conformance** - metadata shape (name + semver version), `supportsPause: false`, `init` stores context, `sendInput` forwards to `proc.write`, no-op when no proc attached, rejects non-string input, `sendKey` correctly maps Enter/Escape/Down/Up/Left/Right/C-c + passes through unknown names, `onOutput` returns unsubscribe fn + rejects non-function callbacks, `_emitOutput` swallows listener errors while still notifying healthy listeners, `detectIdle` delegates to `isReady` including null/undefined inputs, every legacy pattern method (isTrustPrompt / isPermissionPrompt / isModelMenu / getPromptType / extractFileName / getTrustKeys / getModelMenuKeys / getEscapeKey) still works, `alwaysApproveForSession` flag threaded through options drives `getApproveKeys` to `\x1b[B\r`, custom `trustPrompt` pattern overrides the default; (c) **Factory selection** - default type is `claude-code`, explicit selection returns `ClaudeCodeAdapter`, unknown type throws with `Registered: claude-code` hint, legacyOpts `{patterns, alwaysApproveForSession}` reach the adapter, `agentConfig.options` wins when both sides set the same key, `listAdapterTypes` returns the registry keys, `REGISTRY['claude-code']` is the class reference; (d) **TerminalInterface backward compat** - `new TerminalInterface()` returns a `ClaudeCodeAdapter` instance, legacy `(patterns, options)` args reach the adapter, `options.agent` steers the factory, module exposes `createAdapter` + `validateAdapter` + `ClaudeCodeAdapter` for migration. The existing `tests/terminal-interface.test.js` (29 assertions covering detection + keystroke generation + custom patterns) stays green with zero edits because the returned ClaudeCodeAdapter is a superset of the old TerminalInterface surface - a hard proof that the refactor preserves every pre-9.1 behavior. Full suite 75 / 75 pass. Scope guard: this is phase 1 only - the adapter interface exists + Claude Code is extracted + the factory dispatches, but no second adapter lands in this batch. Future phases (local-llm via 9.2, codex, claude-agent-sdk, hybrid routing) only need to register a class in `src/agents/index.js` REGISTRY and document the options block; `src/terminal-interface.js` + `src/pty-manager.js` should not need to change again. Patch note: `patches/1.7.9-agent-framework-phase1.md`.
- **Multi-machine fleet management (9.6):** new `src/fleet.js` pure-node helper owns `~/.c4/fleet.json` (`{ machines: { <alias>: { host, port, authToken? } } }`) and the `~/.c4/fleet.current` pin file so a single CLI install can drive 40 + DGX + 15 peers without a central broker. Exports `loadFleet` / `saveFleet` / `addMachine` / `removeMachine` / `listMachines` / `getMachine` / `getCurrent` / `setCurrent` / `getPinnedBase` / `readSharedToken` / `sampleMachine` / `fetchOverview` / `proxyRequest` / `httpGetJson` / `validateAlias` / `normalizePort`. Pin precedence is `C4_FLEET` env > `~/.c4/fleet.current` so a single shell can retarget a peer without rewriting config; `removeMachine` auto-clears the pin when the removed alias was pinned so a stale file never routes commands into the void. `addMachine` preserves an existing `authToken` when called again with the same alias (host/port updates do not wipe the JWT). `validateAlias` rejects whitespace + special chars, `normalizePort` rejects anything outside 1-65535 and defaults to 3456. Token precedence inside `getPinnedBase`: per-machine `authToken` > env `C4_TOKEN` > shared `~/.c4-token`. CLI: new `c4 fleet <add|list|remove|use|current|status>` subcommand in `src/cli.js`. `c4 fleet add <alias> <host> [--port N] [--token T]` writes to `~/.c4/fleet.json`; `c4 fleet list` prints a TTY table with a `*` in the pinned column; `c4 fleet remove <alias>` (alias `rm`) deletes; `c4 fleet use <alias>` writes the pin file and `c4 fleet use --clear` removes it; `c4 fleet current` shows the pinned alias + URL; `c4 fleet status [--timeout ms]` hits the daemon's `/fleet/overview` endpoint and prints a self row + a per-remote table + a total summary. `src/cli.js` also reroutes every `request()` call through the pinned alias: a `resolveBase()` helper picks pinned peer > `C4_URL` > `http://127.0.0.1:3456` at CLI startup, and `readToken()` prefers the pinned machine's stored JWT before falling back to `~/.c4-token` so each peer can carry its own token without mutating the shared file. Help text under `c4` grows six new lines documenting the subcommand. Daemon: `src/daemon.js` imports `./fleet` and exposes `GET /fleet/overview` behind the existing `auth.checkRequest` gate (same JWT surface as every other `/api/*` route from 8.14). The handler builds a `self` row from the live `manager.list()` so the endpoint never self-proxies, then calls `fleet.fetchOverview({machines, self, timeoutMs})` which fires `/health` + `/list` at every registered peer in parallel with a per-machine timeout (default 3000 ms, overrideable via `?timeout=` query param). Response envelope is `{self, machines[], total:{machines, reachable, workers}, generatedAt}` — unreachable rows carry `ok:false` + `error` + `elapsedMs` but never hide reachable peers (best-effort). `sampleMachine` forwards the per-machine `authToken` as `Authorization: Bearer` so a cross-peer call authenticates against the remote daemon's 8.14 auth without leaking the local token; `defaultHttpClient` never rejects on transport errors so the aggregator always returns a stable row per alias. `tests/fleet-mgmt.test.js` adds 38 assertions across 8 node:test suites: (a) `loadFleet` / `saveFleet` roundtrip with explicit `home` override (empty-file skeleton, full roundtrip, non-object `machines` normalized, invalid JSON throws), (b) CRUD (empty alias / invalid alias / empty host / invalid port / default port 3456 / token round-trip / update preserves token / sorted list with `hasToken` / null on unknown / remove ok / remove not-found), (c) pin state (null when unset / file roundtrip / `C4_FLEET` env overrides file / `setCurrent(null)` clears / reject unknown alias / auto-clear on `removeMachine` of pinned), (d) `getPinnedBase` (unpinned returns `pinned:false` / base URL + per-machine token when pinned / shared `C4_TOKEN` fallback / error when pinned alias is stale), (e) `sampleMachine` (success aggregates workers + version with token forwarded to both calls / propagates `ECONNREFUSED` without throwing), (f) `fetchOverview` (parallel mixed reachable / unreachable with correct totals / empty machines + no self edge / timeout threaded to the injected http client), (g) `proxyRequest` (rejects unpinned / forwards Bearer + body + `timeoutMs` on POST), (h) source-grep wiring (`require('./fleet')` and `route === '/fleet/overview'` + `fleet.fetchOverview` in daemon.js, `case 'fleet':` + `fleet.addMachine` / `fleet.removeMachine` / `fleet.setCurrent` + `/fleet/overview` fetch + `getPinnedBase` + `resolveBase` + `fleet add <alias>` help line in cli.js). Full suite 74 / 74 pass. Security notes: (i) storing JWTs inside `~/.c4/fleet.json` is a convenience for scripting; the file is written in `~/.c4/` (home-only), callers can keep tokens out of the fleet file by relying on `~/.c4-token` + `C4_TOKEN` env instead, (ii) `GET /fleet/overview` is auth-gated just like every other `/api/*` route so a public daemon still has to present a valid JWT before it will enumerate peers, (iii) `?timeout=` is honored but clamped by the underlying http request options so a malicious caller cannot stall the daemon. Limitations: (i) no daemon-to-daemon state sync yet — overview is a poll, not a push, and there is no cross-peer worker dispatch (that is 9.7), (ii) dispatching `c4 task` to a pinned alias forwards the task body unchanged, so the remote daemon's `projectRoot` / worktree config is what actually executes (explicit `--repo` / `--cwd` on a remote path is recommended), (iii) the pin file is a single alias; rotating between peers rapidly is a shell-script pattern (`C4_FLEET=dgx c4 list`) rather than a built-in multi-pin. Patch note: `patches/1.7.8-fleet-mgmt.md`.
- **MCP server upgrade to the 2025-06-18 spec (9.4):** `src/mcp-handler.js` grew from a 5-tool JSON-RPC shim into a full MCP server so Claude Desktop and claude.ai connectors can drive C4 directly. Protocol version negotiation walks the supported set `[2025-06-18, 2025-03-26, 2024-11-05]` and falls back to the server default when a client advertises something unknown, so the handshake never aborts. `initialize` declares capabilities for `tools { listChanged:false }`, `resources { subscribe:false, listChanged:false }`, `prompts { listChanged:false }`, `logging {}`, and `experimental.sampling {}` so sampling-aware clients know they may receive server-to-client `sampling/createMessage` requests. The tool catalogue expands from 5 to 14 entries: `create_worker`, `send_task`, `list_workers`, `get_worker_state` (single-record view), `read_output` (snapshots / now / wait modes), `get_scrollback`, `approve_worker` (option number forwarded to PtyManager.approve), `cancel_task`, `restart_worker`, `rollback_worker`, `merge_worker` (delegates to manager.mergeBranch when the daemon exposes it, otherwise returns a clean isError message pointing to the CLI), `close_worker`, `get_token_usage` (forwards `perTask`), and `get_validation`. Each tool carries JSON Schema `inputSchema` with a `title` field so 2025-06-18 clients can render form labels while older clients ignore the extra property. New resources surface live daemon state: `c4://workers` (application/json, same shape as list_workers), `c4://token-usage`, `c4://session-context` (markdown tail of the scribe output path). URI templates `c4://worker/{name}/state`, `c4://worker/{name}/scrollback`, `c4://worker/{name}/validation` let clients read per-worker data by URI without enumerating every instance in `resources/list`. Prompt catalogue `run-task` / `triage-worker` / `review-merge` returns pre-built user messages the client can send straight to the model, with required-argument checking that returns `-32602` when the caller forgets e.g. `worker` or `task`. `logging/setLevel` accepts the full syslog level set (`debug` / `info` / `notice` / `warning` / `error` / `critical` / `alert` / `emergency`) and rejects anything else with `-32602`. `ping` returns an empty result so keep-alives work. JSON-RPC 2.0 is now strictly observed: notifications (no `id` field, e.g. `notifications/initialized`) produce no response and flip the handler into `initialized=true`, while notifications that arrive as requests (id present) still resolve `{}` for backwards compatibility. `config.mcp.allowedTools` is a whitelist - when non-empty, `tools/list` and `tools/call` filter through it and calls to tools outside the list are rejected with `-32602` pointing at the config key, so operators can trim the attack surface for shared deployments. New `src/mcp-server.js` provides two entry points: (a) `startStdio({base})` reads newline-delimited JSON-RPC from stdin, POSTs each message to the running daemon's `/mcp` endpoint (using the saved `~/.c4-token` JWT from 8.14 when auth is enabled), and writes responses to stdout - notifications correctly produce no output - so Claude Desktop launching `c4 mcp start` gets a full MCP server over stdio without spawning a second PtyManager on the host; (b) `createInlineServer(manager, options)` exposes the handler for tests and for daemon reuse. `src/cli.js` gains an `mcp` subcommand: `c4 mcp start [--base URL]` runs the stdio proxy, `c4 mcp status` probes the endpoint by calling initialize and prints the negotiated protocol + server info, `c4 mcp tools` returns the tools/list payload. `config.example.json` gets an `mcp` section (`enabled:true`, `port:3456`, `transport:"streamable-http"`, `logLevel:"info"`, `allowedTools:[]`) so operators can see the knobs without guessing. `tests/mcp-handler.test.js` adds 59 assertions across 7 node:test suites: (a) protocol basics (jsonrpc version check, missing method, invalid body, unknown method -32601, ping, notification no-response, unknown notification ignored, notifications/initialized id-path backwards compat), (b) initialize handshake (full capability advertisement, older-version negotiation, unknown-version fallback, clientInfo capture), (c) tools primitives (14-tool list, allowedTools filter, every tool's dispatch + optional arg forwarding, missing-required isError content, unknown tool -32602, allowedTools block -32602 with hint, manager-error passthrough as isError), (d) resources primitives (list, templates/list, read for each static URI + every template, unknown URI -32602, missing URI -32602, parseTemplateUri helper incl. %-decoding), (e) prompts primitives (list, get run-task with template interpolation, required-arg enforcement, unknown-prompt -32602), (f) logging primitive (default `info`, every syslog level accepted, invalid level rejected), (g) helpers (negotiateProtocolVersion over full supported set, filterToolsByAllowList, static catalogue shape checks). Full suite 73 / 73 pass. Patch note: `patches/1.7.7-mcp-upgrade.md`.
- **Intelligent exception recovery (8.4):** the daemon now analyzes a failing worker's scrollback tail and re-asks it with a transformed task instead of looping on the same prompt. New `src/recovery.js` pure-node module exports `classifyError` / `pickStrategy` / `STRATEGIES` / `stripTaskOptions` / `appendHistory` / `readHistory` / `recoverWorker`. `classifyError` buckets the tail of the scrollback (default 8KB) into `tool-deny` (Permission denied / EACCES / EPERM / denied-by-policy, ordered before the generic error fallback so a cascade of denials never lands in `unknown`), `timeout` (ETIMEDOUT / ECONNABORTED / "request timed out"), `test-fail` (jest / pytest / AssertionError / Expected...Received), `build-fail` (TypeScript `TS\d+`, SyntaxError, "Cannot find module", eslint/vite/webpack errors), `dependency` (npm ERR! ENOENT, peer-dep missing), or `unknown` with a low-confidence signal. Four pluggable strategies each own a `transform(originalTask, context)` — `retry-same` passes the task through unchanged, `retry-simpler` + `retry-with-smaller-scope` prepend a `[C4 RECOVERY]` banner after running `stripTaskOptions` (drop bullet / numbered / `[opts:]` lines so the retry message stays focused on the core verb), and `ask-manager` returns `null` to signal notify-only. `pickStrategy(category, attempt, config)` walks a per-category ordering with `config.recovery.strategies.<category>` overrides and filters unknown strategy names so a typo never crashes the selector. `recoverWorker` is the orchestrator: gated on `config.recovery.enabled` (or `manual:true` from the CLI), skipped when `_interventionState` is `question` or `critical_deny` (human-needed states are never auto-cleared), derives the attempt counter from `.c4/recovery-history.jsonl` so repeat calls escalate through the list, emits `ask-manager` + `[RECOVERY]` notify past `config.recovery.maxAttempts` (default 3), and when it does act, only calls `manager.sendTask(name, task, {reuse:true, autoMode:config.recovery.autoMode})` — never `close` / `rollback` / `cleanup`, never forwards `skipChecks`, never modifies git state. Every pass writes an append-only line to `.c4/recovery-history.jsonl` (worker, category, signal, attempt, strategy, phase, manual flag, sendTask error) so failure patterns accumulate for future learning. Daemon wiring in `src/daemon.js`: (a) imports `./recovery`; (b) `POST /recover {name, category?}` -> `recovery.recoverWorker(manager, name, { manual: true, categoryHint: category })`; (c) `GET /recovery-history?name=&limit=` -> `recovery.readHistory`; (d) an `sse` listener filters for `{type:'error', escalation:true}` and fires `recoverWorker` when `config.recovery.enabled === true`, with a `_recoveryLastRun` Map + 30s `RECOVERY_DEBOUNCE_MS` per-worker gate so a retry-storm never outpaces the worker. All three routes sit inside the existing `auth.checkRequest` gate (8.14). CLI: `c4 recover <name> [--category X] [--history] [--limit N]` in `src/cli.js`; the manual pass prints `strategy / category / attempt / action / recovered / history`, and `--history` dumps the last N JSONL entries so an operator can audit the recovery tail without hand-rolling `curl`. `config.example.json` gains a `recovery` section with `enabled:false` (opt-in), `maxAttempts:3`, `autoMode:false`, and per-category strategy arrays matching the defaults. `tests/recovery.test.js` adds 45 assertions across 9 node:test suites: (a) `classifyError` — empty/null/whitespace return `unknown`, tool-deny beats the generic fallback, test-fail / build-fail (TS codes) / timeout / dependency detection, unknown-with-low-confidence generic match, `tailBytes` ignores earlier matches; (b) `stripTaskOptions` — keeps first action line + drops bullet options, strips trailing `[opts:...]`, handles `null` / `''`; (c) `pickStrategy` — default ordering for test-fail and dependency, config override honored, invalid names filtered; (d) strategy transforms — retry-same unchanged, retry-simpler + retry-with-smaller-scope banners + option stripping, ask-manager null, `listStrategies` exposes all four; (e) history — creates `.c4/` on demand, appends one JSON line, filter by worker + limit, missing file returns `[]`, malformed lines skipped; (f) `recoverWorker` — disabled short-circuit, `manual:true` runs even when disabled, intervention `question` + `critical_deny` skip without `sendTask`, escalation classifies + transforms + sends with `reuse:true` and no `skipChecks`, attempts 1→2→3 walk the strategy list, `maxAttempts` tips over to `ask-manager` + notify, `categoryHint` override, every pass writes an audit line, destructive calls (close/rollback/cleanup) are rigged to throw so any accidental invocation would fail the test, `sendTask` errors are captured and filed as `phase='send-failed'` without crashing; (g) daemon source-greps confirm `require('./recovery')`, `route === '/recover'`, `recovery.recoverWorker`, `manual: true`, `route === '/recovery-history'`, `recovery.readHistory`, `manager.on('sse', ...)`, `event.escalation`, `recovery.enabled !== true`, `_recoveryLastRun`, `RECOVERY_DEBOUNCE_MS`; (h) cli source-greps confirm `case 'recover'`, `/recover`, `--category`, `--history`, and the help-text `recover <name>` line; (i) `config.example.json` — `recovery.enabled === false`, `maxAttempts` integer, `strategies['test-fail']` array includes `retry-same`. Full suite 73 / 73 pass. Patch note: `patches/1.7.6-smart-recovery.md`.
- **Web UI Worker Control Panel (8.8):** per-worker operational control in the browser so an operator can Pause / Resume / Cancel / Restart / Rollback / Stop a worker without dropping to the CLI, plus a batch section that applies Close or Cancel across a multi-selected worker set. New `web/src/components/ControlPanel.tsx` renders a grid of labelled action buttons (Pause sends `C-c`, Resume sends `Enter`, Cancel hits `/api/cancel`, Restart hits `/api/restart`, Rollback hits `/api/rollback`, Close hits `/api/close`) with action-specific `window.confirm` copy for every destructive action — Pause and Resume deliberately skip the confirm because they are reversible. All requests route through the shared `apiFetch` wrapper so the JWT from 8.14 stays attached automatically and the 401 handler flips back to login unchanged. Below the single-worker grid, a Batch section polls `/api/list` every 5s, renders a live checkbox list with Select all / Clear helpers, and performs bulk `Close selected` (confirm-gated, destructive) + `Cancel selected` (confirm-gated, warn) by looping the per-worker endpoints — no new `/batch-*` route on the daemon, no new auth surface, and the existing permission model keeps working unchanged; the last batch run surfaces per-name ok/error inline and a toast summarises `{ok}/{failed}`. `App.tsx` gets a third `DetailMode` literal `'control'` alongside the existing `'terminal'` and `'chat'` tabs, adds a Control tab button in the detail-area tablist, updates `readDetailMode` so the value round-trips through `c4.detail.mode` localStorage, and mounts `<ControlPanel key={`control-${selectedWorker}`} />` so switching between workers does not leak state. Daemon: two new methods on `PtyManager`. `cancelTask(name)` is a three-branch resolver — queued entry -> splice from `_taskQueue` + `_saveState` and return `{kind:'queued', task}`; worker with `_pendingTask` not yet flushed -> clear pending fields + all three pending-task timers (`_pendingTaskTimer`, `_pendingTaskTimeoutTimer`, `_pendingTaskVerifyTimer`) and return `{kind:'pending', task}`; live worker -> write `\x03` to the PTY, clear `_taskText`, and return `{kind:'interrupt', task}`; exited worker and unknown-name-with-no-queue-entry both return `{error}` so the UI can render a clean message. `restart(name)` captures a snapshot (`branch`, `worktree`, `worktreeRepoRoot`, `target`, `parent`, `_startCommit`, `_autoWorker`), clears every pending-task timer, `proc.kill()`s the old PTY, removes the worker from the Map, calls `this.create(name, command, args, {target, parent?, cwd:worktree?})` with command/args parsed from the stored `worker.command` string (defaulting to `claude` with no args when empty), propagates a `create()` error unchanged, and re-stamps the snapshot back onto the fresh worker record before `_saveState`. Unlike `close()`, `restart()` deliberately leaves the worktree and `c4/` branch intact so "same branch" actually means "same worktree on disk". Daemon wiring: `src/daemon.js` adds `POST /cancel {name}` -> `manager.cancelTask(name)` and `POST /restart {name}` -> `manager.restart(name)`; both sit inside the existing `auth.checkRequest` gate and reject a missing `name` with a 400. Every pre-existing endpoint (`/close`, `/send`, `/key`, `/rollback`, `/merge`, `/approve`) is untouched, so the change is fully backwards compatible. `tests/web-control.test.js` adds 26 assertions across 5 node:test suites: (a) `cancelTask` unit tests with a fake PTY proc + stubbed `_saveState` covering missing name, queued splice, pending-task clear with timer cleanup, in-flight `\x03` write + `_taskText` reset, alive-but-idle interrupt, exited-worker rejection, and unknown-name rejection; (b) `restart` unit tests with a stubbed `create()` capturing command/args parsing, options propagation (`target`, `parent`, `cwd=worktree`), post-create snapshot restoration (`branch`, `worktree`, `worktreeRepoRoot`, `_startCommit`, `_autoWorker`), `proc.kill()` invocation exactly once, `create()` error passthrough + workers Map cleanup, and empty-command fallback to `claude` with no args; (c) `daemon.js` source-greps for `route === '/cancel'`, `manager.cancelTask(name)`, `route === '/restart'`, `manager.restart(name)`, and the `Missing name` guards on both; (d) `ControlPanel.tsx` source-greps for `apiFetch` import, `Worker` + `ListResponse` types, every required endpoint (`/api/key`, `/api/cancel`, `/api/restart`, `/api/rollback`, `/api/close`), `C-c` + `Enter` key literals, confirm dialog copy for `Close "${workerName}"` / `Rollback "${workerName}"` / `Restart "${workerName}"`, `confirm: null` on Pause and Resume, `runBatch` with both `Close ${names.length} worker` and `Cancel the current task for ${names.length} worker` confirm prompts, `/api/list` for the batch picker, and `export default function ControlPanel`; (e) `App.tsx` source-greps for the `ControlPanel` import, `DetailMode = 'terminal' | 'chat' | 'control'`, the Control tab button (`aria-selected={detailMode === 'control'}` + `setDetailMode('control')`), the `<ControlPanel key={`control-${selectedWorker}`}` mount, and the `v === 'control'` branch in `readDetailMode`. Full suite 72 / 72 pass. `npx tsc --noEmit && npx vite build` produces a clean production bundle (~186 KB / gzip ~57 KB). Patch note: `patches/1.7.5-web-control.md`.
- **Web UI conversation / task history (8.7):** new `src/history-view.js` pure helper (`normalizeRecord` / `filterRecords` / `summarizeWorkers` / `readScribeContext`, no node-pty dep) backs three richer daemon endpoints. `GET /history` keeps the 3.7 CLI `worker=` / `limit=` query params but now also accepts `q=` (case-insensitive substring match across name / task / branch), `status=` (closed / exited), and `since=` / `until=` ISO bounds; the response grows a `workers` array summarizing each distinct name with `taskCount`, `firstTaskAt`, `lastTaskAt`, `lastTask`, `lastStatus`, `branches` (union of historical + live), `alive`, and `liveStatus` merged from the live `manager.list()` so closed workers absent from the current process still surface. Path-param `GET /history/<name>` returns `{name, records, alive, status, branch, worktree, scrollback}` where `records` is every history.jsonl entry for that worker and `scrollback` is pulled from the live `ScreenBuffer` when the worker is still in the Map (null otherwise so completed workers do not 404). `GET /scribe-context` reads `docs/session-context.md` (or `config.scribe.outputPath`) and returns `{exists, path, size, updatedAt, truncated, content}` with a tail-truncation fallback capped at 256 KiB (overridable via `maxBytes=`). `src/daemon.js` imports the helper, matches `/history/<name>` via regex at the top of `handleRequest` (same shape as the `/worker/<name>/validation` matcher from 9.9), and wires the three routes through the shared `auth.checkRequest` gate so `/api/history*` and `/api/scribe-context` require a JWT when auth is enabled. Web UI: new `web/src/components/HistoryView.tsx` renders a left-side aggregated worker list (taskCount + last-task timestamp + live-vs-closed pill) with a search input, status select, and two `type="date"` since / until filters feeding `URLSearchParams` into `/api/history`; selecting a worker loads `/api/history/<name>` and shows past tasks (task text + branch + status badge + commit hashes) plus live scrollback when the worker is still running. A Scribe button in the sidebar header opens a full-pane viewer for `/api/scribe-context` (shows path + size + updatedAt, handles `exists:false` with an empty-state message, truncation banner when tail-trimmed). `App.tsx` adds a `topView` state (`workers` | `history`) with `c4.topView` localStorage persistence and a Workers / History tab pair in the global header; History mode replaces the main content area with `<HistoryView />` so the workers sidebar + detail tabs stay untouched when topView=`workers` (backwards compatible with 8.6 / 8.2 / 8.13). `tests/history-view.test.js` adds 32 assertions across 6 node:test suites: (a) `filterRecords` — no-filter passthrough, by worker / status / since+until / q (name or task or branch, case-insensitive), limit slicing last N, malformed-entry skip, (b) `summarizeWorkers` — per-worker aggregation, newest-first ordering with name tie-break, live merge sets alive + liveStatus + appends new branches, exited status is not alive, nameless records skipped, (c) `readScribeContext` — missing file returns `exists:false` without throwing, present file returns content + size + updatedAt, custom `outputPath` option honored, `maxBytes` truncation keeps the tail, (d) daemon source-wiring greps confirm `require('./history-view')`, `route === '/history'`, path-regex `^\/history\/([^\/]+)$`, `route === '/scribe-context'`, and query-param extraction for worker/status/since/until/q, (e) HistoryView.tsx imports `apiGet` from `../lib/api`, builds `URLSearchParams` against `/api/history`, fetches `/api/history/${encodeURIComponent(name)}` and `/api/scribe-context`, renders the search placeholder + status / date aria-labels, exposes the Scribe button + `openScribe` handler, and exports `default HistoryView` + `HistoryWorkerSummary` + `HistoryWorkerDetail` types, (f) App.tsx imports HistoryView, stores `c4.topView` in localStorage, renders both Workers + History tab buttons, and conditions on `topView === 'history'` to mount `<HistoryView />`. Full suite 71 / 71 pass. `tsc --noEmit && vite build` produces a clean production bundle (~178 KB gzip 54.9 KB). Backwards compatible: the 3.7 CLI shape (`{records}`) is a subset of the richer response; existing `c4 history` calls keep working. Patch note: `patches/1.7.4-web-history.md`.
- **Web UI chat interface per worker (8.6):** new `web/src/components/ChatView.tsx` replaces the `c4 send` + `c4 read` CLI loop with a browser-native chat UI. App.tsx now exposes a Terminal / Chat tab pair in the detail area (alongside the existing Tree / List sidebar tabs) with `c4.detail.mode` localStorage persistence; the Terminal tab keeps rendering the unchanged `WorkerDetail` so the backwards-compatible TUI view is always one click away. ChatView subscribes to `eventSourceUrl('/api/watch?name=<name>')`, decodes each base64 PTY frame with `b64decode`, strips ANSI with `stripAnsi` (OSC BEL/ST-terminated, CSI colour + cursor, other `ESC =/>/()/` escapes, C0/C1 control chars except tab + newline, and lone CR -> LF so carriage returns don't collapse content), accumulates the decoded text into a pending buffer, and flushes the buffer into a single worker bubble once the SSE stream stays quiet for `WORKER_FLUSH_MS=1200` -- that window is wide enough that a full Claude TUI render pass (dozens of tiny cursor-move frames) surfaces as one coherent message instead of fragmenting into noise. User messages append instantly to the bubble list on submit (right-aligned, blue) and the composer triggers a two-step post: `apiFetch('/api/send')` with the text, then `apiFetch('/api/key')` with `Enter`, mirroring the pattern `WorkerDetail` already uses so the worker sees the same input sequence a CLI operator would send. The composer is a `<textarea>` with Enter-to-send + Shift+Enter-for-newline and disables itself mid-request to prevent double-send. Auto-scroll tracks `scrollHeight - scrollTop - clientHeight` on the scroll container: within `AUTOSCROLL_THRESHOLD_PX=24` of the bottom it stays pinned to the latest message, past that threshold it pauses (so reading scrollback doesn't fight incoming frames) and a "Jump to latest" escape hatch appears in the header. A live / disconnected pill wired to the EventSource `onopen` / `onerror` callbacks tells the operator whether streaming is actually flowing. Auth rides on the existing (8.14) `apiFetch` + `eventSourceUrl` wrappers so the JWT attaches automatically as `Authorization: Bearer` for REST and as `?token=` for the SSE URL (EventSource can't set headers), and a 401 anywhere flips the app back to login through the shared `AUTH_EVENT`. `tests/chat-view.test.js` adds 21 assertions across 4 node:test suites: (a) `stripAnsi` removes CSI colour / cursor moves, OSC BEL + ST title sequences, lone CR -> LF, and C0/C1 control chars while preserving tab + newline + ASCII; (b) `b64decode` round-trips UTF-8 and composes cleanly with `stripAnsi` so an ANSI-laden PTY payload decodes into strip-ready input; (c) source-wiring greps over `ChatView.tsx` confirm apiFetch / eventSourceUrl imports, `/api/watch?name=${encodeURIComponent(workerName)}` subscription with `new EventSource(url)`, POST `/api/send` + POST `/api/key` with `key: 'Enter'`, conditional `justify-end` vs `justify-start` alignment, auto-scroll state + `distanceFromBottom` detection, the `WORKER_FLUSH_MS` debounce constant, `b64decode(data.data)` call site, and the `export function stripAnsi` + `export function b64decode` visibility hooks; (d) source-wiring greps over `App.tsx` confirm ChatView import, `c4.detail.mode` localStorage key + write, both Terminal + Chat tab labels + click handlers, and the `term-${selectedWorker}` / `chat-${selectedWorker}` React keys so the two views don't share mounted state. Full suite 70 / 70 pass. Build verification: `npm --prefix web run build` (`tsc --noEmit && vite build`) produces `web/dist/assets/index-*.js` + `.css` + `index.html` with no TypeScript errors. Patch note: `patches/1.7.3-web-chat.md`.
- **Recursive hierarchy tree for workers (8.2):** parent/child visualization in both CLI and Web UI. New `src/hierarchy-tree.js` utility is a dependency-free module exporting `buildTree` / `renderTree` / `computeRollup` / `isInterventionActive` / `statusBadge` / `formatRollup` / `flatten`: `buildTree` walks a flat `PtyManager.list()` worker array, links children to parents by name, promotes orphans (parent name that does not match any other worker) to roots so no worker gets dropped, and breaks cycles (`A.parent=B, B.parent=A` or self-cycle `X.parent=X`) via an upward walk with a `Set` guard so the tree is always a finite forest. `computeRollup` aggregates `{total, idle, busy, exited, intervention, error}` per subtree, counting intervention independently of status (a worker parked at an approval prompt is still "busy" to the scheduler but should surface at the parent level as "1 intervention"). `renderTree` emits pure-ASCII (`+--`, `|`, space) so the output copy/pastes cleanly from terminals that lack box-drawing glyphs, prints `[status]` + rollup + optional `(branch)` per node, and skips the rollup badge on single-node roots. Worker metadata gains an optional `parent` field on four planes: `PtyManager.create()` accepts `options.parent` and stamps it on the worker record; `list()` echoes `parent: w.parent || null` so every list consumer sees it; `_saveState` / `_loadState` persist it through daemon restarts and carry it onto `lostWorkers` entries so the tree survives a daemon bounce; node-pty spawn env now carries `C4_WORKER_NAME: name` (and `C4_PARENT` when set) so a `claude` process running `c4 new <child>` from inside a worker automatically records the spawning worker as the parent. The daemon API stays backwards compatible -- `POST /create` now reads `parent` from the body (missing parent -> `null`, no schema break) and a new `GET /tree` returns `{roots, queuedTasks, lostWorkers}` with `roots` already tree-shaped so Web UI + third-party clients can skip the re-build step. CLI: `c4 new <name> --parent <name>` with `process.env.C4_WORKER_NAME` fallback (explicit `--parent` wins); `c4 list --tree` renders the ASCII forest, lists queued + lost workers beneath it, and bypasses the table formatter. Web UI: new `web/src/components/HierarchyTree.tsx` mirrors the backend rollup logic, renders each node with an expand/collapse toggle (disabled on leaves, shown as `-` / `+`), a status pill (green idle / yellow busy / red intervention / gray exited), and a wrap-flow of per-subtree rollup badges under parents (`N idle`, `N busy`, `N intervention`, `N error`, `N exited`). `App.tsx` adds a `List` / `Tree` tab pair in the sidebar header with `localStorage` persistence (`c4.sidebar.mode`) so an operator's view preference survives reload. Both views share `/api/list` and the same SSE subscription so switching tabs does not double-fetch. Tests: `tests/hierarchy-tree.test.js` adds 21 assertions across 5 suites -- (a) `buildTree` sorts siblings, nests by name, promotes orphans / self-cycle / mutual cycles to roots, skips nameless entries, (b) `computeRollup` counts status + errors across the subtree and tracks intervention independently, (c) `renderTree` emits pure ASCII (byte-level check code <= 0x7e), surfaces rollup on multi-node subtrees, returns empty string for empty input, uses `[intervention]` badge on active intervention, (d) source-wiring greps confirm `pty-manager.create` stores parent, `list()` echoes it, `_saveState` + lost-worker entries persist it, `C4_WORKER_NAME` is injected into spawn env, `daemon.js` forwards parent on `/create` and exposes `/tree`, `cli.js` accepts `--parent` + falls back to `C4_WORKER_NAME` + `c4 list --tree` calls `renderTree`, (e) end-to-end render asserts nested grandchildren are indented further than parents and intervention surfaces on descendants. Full suite 69/69 pass. Patch note: `patches/1.7.2-hierarchy-tree.md`.
- **Web UI terminal view resolution + resize (8.13):** the WorkerDetail view rendered at a fixed 160x48 grid because `src/screen-buffer.js` and the node-pty spawn defaults were locked there; on browser viewports narrower than ~160 cols the TUI wrapped inside the server's virtual terminal, producing the "lines are broken" symptom reported on 2026-04-17. `ScreenBuffer` gained a `resize(cols, rows)` method that pushes overflow rows into scrollback (respecting `maxScrollback`), truncates each line on cols shrink, pads with empty lines on grow, and clamps cursor / saved cursor / scroll region into the new bounds. `PtyManager.resize(name, cols, rows)` calls node-pty `proc.resize` then `screen.resize`, both clamped by a new static `_clampResizeDims` helper (defaults 20..400 cols / 5..200 rows, overridable via `config.pty.min*/max*`). `src/daemon.js` adds `POST /resize {name, cols, rows}` that rejects missing params and routes valid requests through `manager.resize`. Web UI `WorkerDetail` gets a terminal toolbar: Auto-fit toggle, font-size +/- (9..24px, 12px default), manual cols input, and a live `dims:` readout; prefs persist in `localStorage` (`c4.term.fontSize` / `c4.term.autoFit` / `c4.term.cols`). Auto-fit measures a hidden 1-char ruler span's bounding rect, computes `cols = floor(pre-inner-width / char-width)`, and POSTs `/api/resize` on mount, font-size change, and debounced (120ms) window resize; a ref dedupe ensures identical dims never re-hit the server. Manual cols input flips auto-fit off and syncs the server through the same dedupe path. Layout: `<main>` and the WorkerDetail flex column now both carry `min-w-0` + `min-h-0` so the `<pre>` horizontal/vertical scroll actually works inside the flex row, and under 768px a hamburger button in the header collapses the worker list sidebar (dropping padding from `p-6` to `p-3`). xterm.js was evaluated and deferred -- the existing `ScreenBuffer` ANSI-stripped text model is shared by `/read-now`, `/scrollback`, `c4 scrollback`, stall detection, and hook event logging, so swapping in xterm.js would require either double-model maintenance or a cross-cutting rewrite; the reported symptom is a dims mismatch, not a rendering fidelity gap. Tests: `tests/screen-buffer-resize.test.js` (10 node:test assertions -- no-op, shrink rows to scrollback, grow rows pad, cols truncate, cursor clamp, saved cursor + scroll region clamp, maxScrollback honored under overflow, non-numeric coercion, continued writes after resize) + `tests/pty-resize.test.js` (16 assertions: 6 `_clampResizeDims` + 7 instance `resize` + 3 daemon source-grep). Full suite 68 / 68 pass. Patch note: `patches/1.7.1-web-terminal-resize.md`.
- **Reproducible fresh install verification (8.11):** new `tests/install-verify.test.js` (19 assertions across 4 default suites + 1 opt-in suite, node:test style) simulates the documented install flow -- clone -> `npm install` -> `c4 init` -> `c4 daemon start` -> browse `http://localhost:3456/` -- against a temp-dir copy of the current repo so breakage a fresh user would hit surfaces locally. `fs.cpSync` copies `REPO_ROOT` into `os.tmpdir()/c4-install-<rand>` with a filter that excludes `node_modules`, `.git`, `web/node_modules`, `web/dist`, `.c4-task.md`, `.c4-last-test.txt`, `.c4-validation.json`, `.DS_Store`, and any `c4-worktree-*` descendants; the filter short-circuits when `src === REPO_ROOT` so the suite still runs inside a worktree whose own basename matches `^c4-worktree-`. Default suites assert (a) copy surface + exclusions (`package.json`, `README.md`, `src/cli.js`, `src/daemon.js`, `src/static-server.js`, `web/package.json`, `web/vite.config.ts`, `web/src`, `config.example.json`, `CLAUDE.md` present; `node_modules`, `.git`, `web/node_modules`, `web/dist`, `.c4-*` markers absent), (b) root `package.json` scripts (`start` / `daemon` / `build:web` / `test`) with `build:web` containing both `npm --prefix web install` and `npm --prefix web run build` as a single string, `bin.c4 -> src/cli.js` (and the target exists), `engines.node >= 18`, runtime deps `node-pty` + `nodemailer`, (c) web `package.json` has `dev` + `build` scripts and pins `vite` / `react` / `react-dom`, (d) init prerequisites -- `config.example.json` parses with `daemon.port === 3456` and `src/cli.js` declares `init` + `daemon` subcommand literals. Opt-in full mode (`C4_INSTALL_VERIFY_FULL=1`, each step 300s timeout) performs the actual `npm install` at root, `npm --prefix web install`, and `npm --prefix web run build`, then asserts `web/dist/index.html` emerges with an `<html>` tag. Default run stays offline and completes well under the `tests/run-all.js` 30s per-file cap (~300 ms); full mode takes ~5s with warm npm cache. Cleanup runs in `after()` whether assertions pass or fail. `docs/install-verify.md` is the companion manual runbook: what the automated layer asserts, how to flip the full switch, the fresh-clone command sequence, expected outputs at each step, cleanup, a failure -> fix table (node-pty toolchain / partial web install / EADDRINUSE 3456 / missing PATH after `npm link` / missing `web/dist` -> 503), and when to re-run (release, `package.json` edits, dep bumps). README Install section now leads with a Quick Install block -- four commands (clone, `npm install`, `c4 init`, `c4 daemon start`) + one browser tab (`http://localhost:3456/`) -- with an explicit note that `c4 init` cannot be skipped because `npm link` happens inside it, and links to both the runbook and the automated test. Full suite 65 / 65 pass.
- **Manager-Worker validation object to prevent hallucination spiral (9.9):** structured completion contract so the manager stops blindly trusting worker "done" text. New `src/validation.js` module (no node-pty dep) exports `parseValidationObject` / `readValidationFile` / `synthesizeValidation` / `captureValidation` / `extractNpmTestCount` / `checkPreMerge`. The worker writes `.c4-validation.json` at its worktree root with `{test_passed:bool, test_count:int, files_changed:[], merge_commit_hash:str, lint_clean:bool, implementation_summary:str}`; when the file is missing or malformed the daemon synthesizes a minimal object from `git diff main...HEAD --name-only` + `git rev-parse HEAD` + `git log main..HEAD --format=%s` + the worker's `.c4-last-test.txt` stdout so the gate never silently accepts. `src/pty-manager.js` adds a `_validation` field on the worker record plus `_captureValidation(name)` and `getValidation(name)`; `close(name)` captures the validation before `_removeWorktree` runs so `/worker/<name>/validation` stays answerable after cleanup. `src/daemon.js` exposes `GET /worker/<name>/validation` (path-param per TODO spec) and `GET /validation?name=<x>` (query alias) - both route through `manager.getValidation`, returning `{name, validation}` with `validation:null` when nothing is available. `c4 merge` gains Check 0 (validation.test_passed) and Check 1b (validation.test_count must equal the npm test stdout count from `extractNpmTestCount`); the existing `npm test` check now captures stdout instead of discarding it so the count cross-check runs even when tests pass (and salvages the count from stderr/stdout when tests fail, for diagnosis). `c4 validation <name>` CLI prints the stored JSON so operators can inspect what was claimed vs. synthesized without hand-rolling curl. Tests: `tests/validation-object.test.js` adds 32 assertions across 6 suites - (a) JSON parsing normalizes shape / coerces types / returns null on malformed / empty / non-object, file read returns null on missing file / null path / fs throw, (b) pre-merge gate rejects test_passed=false, test_count mismatch, missing-validation; accepts clean match or null cross-check, (c) synthesis pulls files_changed / merge_commit_hash / implementation_summary from git with custom mainBranch option, parses test_count from `.c4-last-test.txt`, handles `N passed, M failed` correctly, falls back to empty fields on git errors, (d) missing `.c4-validation.json` returns null. Module has no node-pty dep so tests require it directly (no regex + new Function extraction needed). Full suite 64 / 64 pass. Gemini feedback (2026-04-17) root cause: managers that only check text output cannot distinguish a worker that truly finished from one that is mid-spiral, so completion must be structured and cross-checkable against git state.
- **Cost / retry guardrails for unattended operation (9.10):** spawn-time financial safety so overnight runs cannot burn through unbounded tokens on a fix-loop. `src/pty-manager.js` gains `_resolveBudgetUsd` / `_resolveMaxRetries` / `_buildClaudeArgs`: every `claude` spawn now routes through a single arg builder that appends `--max-budget-usd <n>` when the effective budget > 0 (precedence per-task override -> `config.workerDefaults.maxBudgetUsd` -> default 5.0; `<=0` disables the flag so existing zero-configured installs keep identical spawn args). `--resume` still stacks before the budget flag. Both local and SSH branches of `create()` share the builder so remote workers get the same guard. Worker record gains `_budgetUsd`, `_maxRetries`, `_retryCount`, `_stopReason`. New `recordRetry(name, reason)` increments the counter, pushes a `[RETRY]` progress note via `_notifications.pushAll` below the cap and, once the count reaches the configured limit, sets `_stopReason`, fires a `[SAFETY STOP]` Slack push + `_flushAll()`, and invokes `close(name)`; subsequent `recordRetry` calls are no-ops so the safety stop is single-shot. `c4 task` gains `--budget <usd>` / `--max-retries <n>` with validation + forwarding via the `/task` body; the daemon passes both through `sendTask` -> `_createAndSendTask` -> `create()`. `c4 token-usage --per-task` (GET `/token-usage?perTask=1`) adds a `perTask` array from `_getPerTaskUsage` with `{name, sessionId, branch, task, input/output/total, retryCount, maxRetries, budgetUsd, stopReason, alive}` sorted by descending total; `_readSessionTokens` resolves the Claude `projects/<encoded>` subdir from the worktree path first, then falls back to `_getProjectDir()`. Config additions (`config.example.json`): `workerDefaults.maxBudgetUsd: 5.0`, `workerDefaults.maxRetries: 3`. Tests: `tests/cost-guard.test.js` adds 18 assertions across 3 suites - (a) budget flag appended under default/config/per-task paths + non-claude passthrough + --resume ordering, (b) retry counter increments, stops exactly on the boundary with close + [SAFETY STOP] Slack push + flushAll, stays off at `maxRetries=0`, errors on unknown worker, single-shot after stop, (c) per-task override wins, (d) disabled on `<=0`, `0`, negative, and NaN. Helpers are extracted from `src/pty-manager.js` via regex + `new Function` (same pattern as `tests/worktree-gc.test.js` / `tests/worker-language.test.js` / `tests/hook-setup.test.js`) so drift between the real implementation and the tests surfaces immediately without pulling `node-pty`. Full suite 63 / 63 pass. Web UI live-cost dashboard is deferred as a follow-up; spawn-level enforcement + per-task readout is the safety-critical path and ships now.
- **Daemon-internal worktree GC automation (9.11):** new `_runWorktreeGc` on `PtyManager` plus `startWorktreeGc`/`stopWorktreeGc` wired into `src/daemon.js` startup / SIGINT / SIGTERM. The GC lists c4-worktree-* entries via `git worktree list --porcelain` and removes only those that are simultaneously (a) not owned by any alive worker, (b) inactive beyond `daemon.worktreeGc.inactiveHours` (default 24h, measured from `.git/logs/HEAD` mtime with a directory-mtime fallback), (c) clean (no `git -C <wt> status --porcelain` output), and (d) merged into main per `git branch --merged main`. Dirty candidates reuse the existing `_notifyLostDirty` channel and emit a `[GC WARN]` console line rather than being touched. The manual `c4 cleanup` command, `_cleanupLostWorktrees`, and `_cleanupOrphanWorktreesByList` are untouched - GC extends them, not replaces them. Config knobs under `daemon.worktreeGc`: `enabled` (bool, default true), `intervalSec` (default 3600, min clamp 60), `inactiveHours` (default 24), `mainBranch` (default "main"). `tests/worktree-gc.test.js` adds 14 assertions across 5 suites - (a) active-worker skip, (b) clean+merged+inactive removal with branch -D, (c) dirty worktree preservation + `[GC WARN]` + `[LOST DIRTY]` notification, (d) `enabled:false` short-circuit - plus decision-helper edge cases (`branch-not-merged`, `recent-activity`, `inactive-merged-clean`) and start/stop timer semantics. Tests extract the real implementation via regex + `new Function` (same pattern as `tests/worker-language.test.js`/`tests/hook-setup.test.js`) so drift between implementation and tests surfaces immediately. Full suite 62 / 62 pass.
- **Daemon serves built web UI on port 3456 (8.12):** new `src/static-server.js` (pure Node, no express) exports `serveStatic` with SPA fallback, path-traversal containment, MIME map, and 503 + `build:web` hint when `web/dist` is missing. `src/daemon.js` aliases `/api/<x>` -> `/<x>` via a new `resolveApiRoute` helper (vite dev proxy strips the prefix in dev; this aliasing keeps the same semantics in prod) and falls through to `serveStatic` for unmatched non-/api GET/HEAD. `vite.config.ts` unchanged so HMR still works via `npm --prefix web run dev`. `package.json` gains a `build:web` script (`npm --prefix web install && npm --prefix web run build`). `c4 init` auto-runs `npm run build:web` when `web/dist` is absent (300s timeout, non-fatal on failure). `c4 daemon start` warns via `webDistExists` but still boots. Result: one forwarded port (3456) is enough — `curl http://localhost:3456/` returns the React bundle, `curl http://localhost:3456/api/list` mirrors `/list`. README "Web UI Access" section added. `tests/daemon-static-serve.test.js` adds 25 node:test assertions (mimeFor 5 + resolveSafePath 3 + pickFile 6 + webDistExists 3 + resolveApiRoute 4 + serveStatic 7 — stream.PassThrough sink, no live daemon spawn). Full suite 61 / 61 pass.

## [1.6.20] - 2026-04-17

### Fixed
- **`c4 wait --all` no longer hangs on intervention workers** (7.21): before this fix `c4 wait --all` reused the single-completion multi-worker path, so a worker parked in an approval prompt (intervention state) could block the caller indefinitely even when other workers were already idle. `PtyManager.waitAndReadMulti` now accepts a `waitAll` option and resolves only once every target worker has reached a terminal state — idle, exited, or intervention — and returns a `status:'all-settled'` envelope with a per-worker `results` array (`{name, status, intervention, content}`). Intervention is treated as terminal under `waitAll`, so all-intervention and mixed idle+intervention swarms resolve immediately instead of hanging; the existing first-completion semantics for `c4 wait w1 w2 w3` (without `--all`) are preserved. Wire-up: the CLI passes a new `waitAll=1` query parameter to the daemon `/wait-read-multi` endpoint and prints the per-worker report (including any `intervention: <kind>` tag) so the manager can immediately triage which workers need approval. `tests/parallel-wait.test.js` adds four node:test cases covering (a) all-idle returns immediately (<500 ms), (b) mixed idle + intervention returns both with correct state, (c) all-intervention resolves instead of hanging, and (d) timeout reports per-worker `busy`/`idle` without losing the intervention field. Full suite 60 / 60 pass.

## [1.6.19] - 2026-04-17

### Fixed
- **PostToolUse hook recurrence verification + ASCII hardening** (7.23): 7.16 introduced `src/hook-relay.js` to replace the curl/PowerShell hook commands that had been producing "Failed with non-blocking status code" loops on Korean Windows. Re-verified under v1.6.18 runtime: 11 recent worker session logs (~4 MB combined) grep for `Failed with non-blocking` returns 0 occurrences; the live worker's `.claude/settings.json` renders each hook as `node "<abs>/hook-relay.js" http://<host>:<port>/hook-event` with no shell operators, no PowerShell, and no curl; direct `spawnSync` invocation confirms `hook-relay.js` exits 0 under every failure mode (unreachable URL, empty stdin, malformed JSON, missing URL arg, malformed URL) and emits nothing to stderr. No runtime code change required beyond a minor hardening: replaced two U+2014 em-dashes in `src/hook-relay.js` comments with ASCII hyphens so the relay source is pure ASCII, matching the 7.16 intent and eliminating a theoretical decode-regression vector.

### Added
- **`tests/hook-setup.test.js`** (7.23 regression): 16 assertions across 3 node:test suites. Extracts `_buildHookCommands` from `src/pty-manager.js` via regex + `new Function` (same pattern as `tests/worker-language.test.js`) so the test stays coupled to the actual implementation without pulling in `node-pty`. Locks: (1) canonical hook shape — PreToolUse + PostToolUse groups, one command each, `type:'command'`; (2) command invokes `node hook-relay.js` with no PowerShell / no `Invoke-RestMethod` / no curl / no compound operators (`&&`, `||`, `;`, `|`); (3) configured + default daemon URL routing (`http://host:port/hook-event`); (4) quoted path is absolute and references an on-disk `hook-relay.js`; (5) command output is pure ASCII; (6) `hook-relay.js` exits 0 under five failure modes and emits no stderr; (7) source hygiene — after stripping comments, the `_buildHookCommands` body never re-introduces PowerShell / IRM / curl, and always routes through `hook-relay.js`. Full suite 60 / 60 pass.

### Fixed (TODO housekeeping)
- Restored the `c4 wait --all` improvement notes that had been accidentally appended to row 7.23's description back to their proper column in row 7.21.

## [1.6.18] - 2026-04-17

### Fixed
- **pendingTask delivery verification + write-failure recovery** (7.22): 7.17 5-point 방어 이후에도 v1.6.16+ 실사용에서 task 2/3 worker가 수동 `c4 send + c4 key Enter` 필요한 증상 재발. 추가 failure mode 3개 차단 + post-write 검증 도입. (1) 모든 delivery 경로(active polling, timeout fallback, post-setup trigger, idle handler pendingTask, auto-resume)에서 `_pendingTaskSent=true`가 `await _writeTaskAndEnter` 이전에 설정돼 PTY write 중 throw 발생 시 `_pendingTaskSent=true`/`_pendingTask=non-null`로 worker가 영구 stuck — try/catch로 감싸 실패 시 `_pendingTaskSent=false`로 복구 + `[C4 WARN]` 스냅샷. (2) `fireFallback`이 `_setupStableAt` 체크 없이 setupDone=true면 즉시 발사 — stable-gate 갭이 ≤2s면 한 번 defer (>2s면 영구 hang 방지로 force-send), attempt=2는 무조건 force-send. (3) idle handler와 auto-resume의 500ms `setTimeout` 스케줄 콜백이 state 재검증 없이 write — 내부에서 `worker.alive`/`isReady(screen)`/`stableGateOk`/`setupDone` 재확인, 어긋나면 abort + `_pendingTaskSent=false` 복구 + 구체적 어긋난 조건이 담긴 snapshot, auto-resume은 queue head로 되돌려 idle handler retry. 추가로 `_schedulePendingTaskVerify(worker)` 신설: 성공 write 이후 1500ms 뒤 화면이 여전히 idle 프롬프트면 `\r`만 한 번 재전송 (단발). `workerDefaults.pendingTaskVerifyMs`로 delay 조정, `pendingTaskVerifyEnabled=false`로 기능 off. 새 worker 필드 `_pendingTaskAttempts`(진단) / `_pendingTaskVerifyTimer`는 4개 cleanup 지점(existing replace / exit handler / session resume / close) 모두 해제. `tests/pending-task-verify.test.js` 22 assertions (verify 8 + write-failure 4 + fallback stable-gate 5 + idle-path revalidation 5). 전체 59 suites pass.

## [1.6.17] - 2026-04-17

### Fixed
- **package-lock.json env-drift guard** (7.29): 세션 시작부터 `web/package-lock.json`이 `M` 상태로 떠서 `c4 merge` 때마다 stash 대상이 되고 의미 없는 diff를 양산하던 문제 해결. 조사 결과 원인은 npm 버전/플랫폼 드리프트 — 커밋된 lockfile이 8개의 `"peer": true` 메타데이터를 포함했고, 로컬 npm 10.8.2가 `npm install --package-lock-only` 재계산 시 이들을 strip해서 발생. c4 코드 경로 어디에서도 `npm install`을 돌리지 않음 (`grep src/` 0건) — 트리거는 사용자가 `npm --prefix web` 계열 명령을 수동 실행할 때. 신규 `src/pkglock-guard.js` (`analyzeDiff`/`buildAdvice`/`runCli`)가 `"peer": true`-only 시그니처를 감지. `.githooks/pre-commit`이 스테이징된 lockfile에 대해 가드를 호출해 env-드리프트 진단 메시지 출력 (warning only — commit 진행). `tests/pkglock-guard.test.js`(27 assertions) + `tests/fixtures/pkglock-peer-drift.diff`로 실제 8라인 drift payload를 regression fixture로 고정. `docs/known-issues.md`에 근본 원인/재현/권장 워크플로우/gitignore 금지 근거 섹션 추가. `patches/1.6.17-pkglock-env-drift.md`. lockfile을 gitignore하면 `npm ci` 재현성이 깨지므로 명시적으로 채택하지 않음.

## [1.6.16] - 2026-04-17

### Added
- **Web UI external (LAN) access** (8.10): vite dev server와 c4 daemon 모두 기본 `127.0.0.1` 바인딩이라 외부 IP에서 접근 불가하던 문제 해결. `web/vite.config.ts`에 `server.host: '0.0.0.0'` + `port: 5173` 추가. 데몬은 `config.daemon.bindHost`(없으면 legacy `host`, 기본 `127.0.0.1`)로 listen하도록 변경 — backward compat 유지. 새로운 `src/web-external.js` 모듈에 `resolveBindHost`/`detectLanIP`/`enableViteExternal`/`setDaemonBindHost` 순수 함수 분리. `c4 init`이 "Enable Web UI external (LAN) access? (y/N)" 프롬프트 추가, `--yes-external`/`--no-external` 플래그로 scripted 실행 지원. yes 응답 시 vite.config.ts에 host 자동 주입(idempotent), `config.json`의 `daemon.bindHost=0.0.0.0` 저장, `os.networkInterfaces()` 기반 LAN IP 자동 감지·Web UI/Daemon URL 출력, 방화벽/JWT(8.1) 경고, `c4 daemon restart` 안내. `C4_BIND_HOST` 환경변수로 런타임 오버라이드도 지원. README.md에 "External (LAN) Access for the Web UI" 섹션 추가. `tests/daemon-bindhost.test.js`(8 assertions) + `tests/init-web-external.test.js`(16 assertions).

## [1.6.15] - 2026-04-17

### Fixed
- fix: c4 merge guards against uncommitted changes (7.28)
- fix: preserve src/cli.js executable bit across merges (7.27)
- **prevent manager halt from compound/markdown commands** (7.26): `.claude/agents/manager.md`에 '명령 생성 규칙 (halt 방지)' 섹션 추가 — 복합/파이프/루프/cd-chain 절대 금지, git -C / npm --prefix / c4 wait 대안, c4 task/send 메시지 규칙(markdown 헤더 금지, 긴 스펙 파일화), 위반 시 대응 프로토콜. 자동 파일화 안전망(`_maybeWriteTaskFile`, src/pty-manager.js:1185)은 5.35 + 5.49에서 이미 도입돼 1000자 초과 또는 `#` 포함 메시지를 `.c4-task.md`로 변환 (sendTask 및 _buildTaskText 경로 공통). `tests/manager-command-rules.test.js` 6 assertions로 문서 섹션 유지 검증.

### Changed
- **manager 세션 launch 명령 플래그 보강** (7.24): CLAUDE.md, README.md, README.ko.md, src/cli.js (c4 init 출력), docs/handoff.md 5곳의 `claude --agent` 안내에 `--model opus --effort max --name c4-manager` 플래그 추가. 관리자 세션을 최고 effort + Opus 모델 + 고정 세션 이름(c4-manager)으로 시작하도록 일관 유도. `--name c4-manager`는 세션 식별자 고정으로 scribe/로그 상관관계 추적 및 관리자 세션 재진입 시 동일성 확보에 기여.

### Fixed
- **c4 init이 git identity 체크/설정, merge가 identity 부재 시 명확 에러** (7.25): 야간 자동 실행이 `git config user.name/user.email` 부재로 `c4 merge` 실패 → 관리자가 `GIT_AUTHOR_NAME=... c4 merge` env prefix workaround 시도 → `Bash(c4:*)` 권한 패턴이 env prefix와 매치 안 되어 permission prompt에서 halt하던 문제 해결. 신규 `src/git-identity.js` 모듈이 `ensureIdentity` / `identityComplete` / `missingIdentityKeys` 제공. `c4 init`은 TTY에서 name/email 프롬프트 후 `git config --global` 저장, non-TTY에서는 경고만 (덮어쓰기 금지). `c4 daemon start|restart`는 미설정 시 경고 출력 후 정상 진행, `c4 merge`는 명확 에러 + exit 1 (env workaround 힌트 없음). `.claude/agents/manager.md`에 env prefix workaround 금지 규칙 추가. `tests/git-identity.test.js` 26 assertions.
- **c4 init PATH 자동 등록** (7.20): 7.13에서 `~/.local/bin/c4` symlink는 만들지만 `~/.local/bin`이 PATH에 없으면 `c4` 명령이 동작하지 않던 문제 해결. init이 PATH 포함 여부를 확인해 누락이면 `~/.bashrc`에 `export PATH="$HOME/.local/bin:$PATH"` 블록 자동 추가 (marker 기반 중복 방지). SHELL이 zsh이면 `~/.zshrc`도 함께 갱신. 로직은 `src/init-path.js`로 분리하여 fs dependency injection으로 테스트. `tests/init-path.test.js` 30 assertion 추가.

## [1.6.14] - 2026-04-17

### Changed
- **worker setup 슬래시 명령 전환** (7.19): `/effort <level>` + `/model <value>` 슬래시 명령 기반으로 전환. `_finishSetup` 헬퍼 분리. `tests/setup-slash.test.js` 16개 테스트

### Fixed
- **pendingTask 5-point 방어** (7.17): setupDone 후 stabilization window, isReady 2연속 확인, timeout fallback 가드, drain 동기화, enterDelayMs 설정화

## [1.6.13] - 2026-04-17

### Added
- **worker 영어 전용 모드** (7.18): `workerDefaults.workerLanguage: "en"` 옵션 추가. 설정 시 `_getRulesSummary()`가 "Respond in English only." 지시문을 자동 삽입

### Fixed
- **PreToolUse hook 인코딩 깨짐** (7.16): PowerShell/curl hook stderr를 suppress하여 인코딩 깨짐 + escalation 오탐 방지

## [1.6.12] - 2026-04-17

### Added
- **c4 init Linux PATH 개선** (7.13): npm link 실패 시 ~/.local/bin/c4 심볼릭 링크 자동 생성 + ~/.bashrc alias 폴백
- **c4 init --agent 안내** (7.14): init 완료 후 관리자 모드 시작 안내 메시지 출력
- **daemon 버전 불일치 경고** (7.15): c4 health/daemon status에서 daemon 버전과 설치 버전 비교, 불일치 시 restart 안내

## [1.6.11] - 2026-04-17

### Fixed
- **pendingTask Enter 누락 완전 해결** (7.1): 5.18에서 send()에만 적용했던 "input/CR 분리 전송" 패턴이 pendingTask delivery 9개 경로에는 전파되지 않아 동일 PTY/Claude Code 타이밍 문제로 Enter 인식 실패. `_writeTaskAndEnter()` 헬퍼 추가하여 모든 경로 교체

## [1.6.10] - 2026-04-16

### Fixed
- **pendingTask 근본 해결** (5.51): idle handler pendingTask 블록에 setupDone 가드 추가. setupPhase='done'~setupDone=true 사이 1000ms 창에서 effort 블록을 관통하여 모델 메뉴 활성 상태에서 task가 전송되던 근본 원인 수정. _executeSetupPhase2 완료 후 post-setup 전달 트리거 추가, active polling _chunkedWrite await 처리

## [1.6.9] - 2026-04-16

### Added
- **c4 watch 실시간 스트리밍** (5.42): `c4 watch <name>`으로 worker PTY 출력을 tail -f처럼 실시간 스트리밍. SSE `/watch` 엔드포인트, base64 인코딩, Ctrl+C 종료. `watchWorker(name, cb)` 메서드로 다중 watcher 지원

## [1.6.8] - 2026-04-16

### Added
- **프로젝트 유형별 권한 프로파일** (5.26): web/ml/infra 3종 프리셋 추가. `c4 task --profile web`으로 프로젝트에 맞는 권한 세트 자동 적용. `c4 profiles` 명령으로 전체 프로파일 목록 조회

### Fixed
- **compound command 승인 prompt 해결** (5.48): worker가 `cd path && git commit` 실행 시 Claude Code의 "bare repository attacks" 보안 경고 해결. defaultPerms에 `Bash(cd * && *)` 패턴 추가

## [1.6.7] - 2026-04-16

### Added
- **c4 approve 편의 명령** (5.36): `c4 approve <name> [option_number]` — TUI 선택 프롬프트에서 번호로 옵션 선택. option_number 지정 시 (N-1) Down + Enter 키 전송. CLI, daemon route, pty-manager approve() 3계층 확장
- **관리자 병렬 wait** (5.43): `c4 wait --all` 또는 `c4 wait w1 w2 w3`으로 여러 worker 동시 대기, 첫 idle/exited 시 즉시 반환. `waitAndReadMulti()` 메서드, `/wait-read-multi` daemon 라우트 추가
- **interrupt-on-intervention** (5.44): `c4 wait --interrupt-on-intervention`으로 intervention 감지 시 wait 즉시 종료. 단일/병렬 wait 모두 지원

## [1.6.6] - 2026-04-16

### Fixed
- **c4 send 자동 Enter 누락 수정** (5.18): send()에서 input과 CR을 분리 전송. _chunkedWrite로 input 전송 후 100ms 대기, 별도 proc.write('\r')로 Enter 전송. send()를 async로 변경, daemon.js 호출부에 await 추가

## [1.6.5] - 2026-04-16

### Fixed
- **긴 task 메시지 잘림 근본 수정** (5.35): 1000자 초과 task는 worktree/.c4-task.md 파일로 저장하고 PTY에는 경로만 전달. `_maybeWriteTaskFile()` 헬퍼로 `_buildTaskText()` + `sendTask()` 인라인 빌드 모두 적용. worktree 없으면 기존 방식 유지

## [1.6.4] - 2026-04-16

### Added
- **worker 자동 네이밍** (5.40): `c4 task --auto-name "task text"` 또는 name 생략 시 task 첫 줄에서 영문 단어 추출하여 kebab-case 이름 자동 생성 (w- 접두사, 최대 30자). 중복 시 -2, -3 자동 부여. `_generateTaskName()` 메서드 추가

## [1.6.3] - 2026-04-16

### Added
- **c4 list 10초 cooldown 캐시** (5.39): c4 list 무한 반복 방지. tmpdir에 응답 캐시 저장, 10초 이내 재호출 시 캐시 반환 + [cached] 표시. CLAUDE.md와 manager agent에 c4 list 폴링 금지 규칙 추가

### Fixed
- **Slack 메시지 길이 제한 + task 요약** (5.38): pushAll()에서 2000자 초과 메시지 truncate. _fmtWorker()에서 activity 있어도 task 첫줄 요약 항상 표시. notifyHealthCheck()에서 dead worker에도 task 요약 포함

## [1.6.2] - 2026-04-05

### Added
- **autoApprove에 개발 도구 추가** (5.34): worker defaultPerms에 nvidia-smi(GPU 모니터링), nohup(백그라운드 실행), lsof(포트/파일 잠금), env(환경변수), which(실행파일 경로), whoami, poetry 추가
- **Manager handoff summary injection** (5.12): manager rotation 전 `_injectDecisionSummary()`로 task, compaction count, intervention 경고, active worker 수를 `docs/session-context.md` 상단에 주입
- **Hook Slack routing on deny** (5.10): `_handlePreToolUse`에서 scope guard deny 시 `[HOOK DENY]` Slack 알림 전송 + 즉시 flush
- **Custom Agent definition** (5.8): `.claude/agents/manager.md` 생성. C4 Manager 에이전트 도구 제한(Bash c4/git만 allow, Read/Write/Edit/Grep/Glob deny)을 Claude Code 네이티브 Custom Agents로 정의

## [1.6.1] - 2026-04-05

### Added
- **Hybrid safety mode** (5.21): L4 critical deny 시 worker를 `critical_deny` 상태로 전환하고 Slack 승인 요청 전송. `c4 approve <name>` 명령으로 관리자가 승인. CLI, daemon route, pty-manager approve() 메서드 추가
- **Auto-approval block** (5.28): `critical_deny` 상태 worker에 Enter 키나 'y' 입력 차단. `c4 send`/`c4 key`로 위험 명령 무분별 승인 방지
- **Resume re-orientation** (5.14): worker resume 후 5초 대기 뒤 scrollback 마지막 20줄 캡처하여 `[RESUMED]` 스냅샷 생성 + Slack 알림

## [1.6.0] - 2026-04-05

### Added
- **CI feedback loop** (5.20): worker가 `git commit` 실행 후 자동으로 `npm test` 실행. 실패 시 에러 출력과 함께 worker에 자동 피드백 전송. `config.ci.enabled`, `testCommand`, `timeoutMs` 설정 지원. SSE `ci` 이벤트 + Slack `[CI PASS]`/`[CI FAIL]` 알림
- **Intervention immediate notification** (5.29): question/escalation/permission prompt 감지 시 즉시 `notifyStall()` 호출하여 Slack 알림 전송. healthCheck 30초 주기 대기 없이 실시간 알림. `_permissionNotified` 플래그로 중복 방지
- **Worker auto-approve 범위 확장** (5.24): worker defaultPerms에 개발 도구(npm, python, cargo, docker, ffmpeg, make 등), 셸 유틸리티(ls, cat, grep, mkdir, cp, mv 등), 파일 도구(Read, Edit, Write, Glob, Grep) 추가. config.example.json에 node/python/rust 프로파일 프리셋 추가

## [1.5.9] - 2026-04-05

### Added
- **Dirty worktree Slack warning** (5.15): healthCheck에서 alive worker의 worktree dirty 상태 감지 시 `[DIRTY]` Slack 알림 전송. 정리되면 플래그 리셋하여 재알림 가능
- **Submodule diff support** (5.30): `c4 merge` 완료 후 `git diff --stat --submodule=diff`로 서브모듈 변경사항 상세 표시
- **c4 cleanup command** (5.33): 수동 정리 명령어. LOST worker의 c4/ 브랜치 삭제, worktree 제거, 고아 c4-worktree-* 디렉토리 정리, git worktree prune 실행. `--dry-run` 지원

## [1.5.8] - 2026-04-05

### Added
- **L4 Critical Deny List** (5.13): `CRITICAL_DENY_PATTERNS`로 `rm -rf /`, `git push --force`, `DROP TABLE`, `sudo rm`, `shutdown`, `reboot`, `mkfs`, `dd if=`, `git reset --hard origin` 등 파괴적 명령을 L4 full autonomy에서도 절대 차단. 차단 시 스냅샷 로그 + Slack 알림
- **close() 브랜치 자동 삭제** (5.25/5.31): worker close 시 c4/ 접두사 브랜치를 자동으로 `git branch -D`로 삭제. worktree remove 후 실행
- **healthCheck worktree prune** (5.32): healthCheck 주기마다 `git worktree prune` 자동 실행하여 stale worktree 참조 정리

## [1.5.7] - 2026-04-05

### Added
- **--repo 옵션** (5.16/5.17): `c4 task worker --repo /path/to/project`로 다른 프로젝트의 worktree 생성 지원. CLI에서 파싱하여 daemon/pty-manager로 전달

### Fixed
- **PreToolUse 복합 명령 차단** (5.19): 워커가 home dir에서 스폰되어 worktree의 `.claude/settings.json` 훅을 로드하지 못하던 문제 수정. worktree + settings 생성 후 워커 스폰하도록 순서 변경. inline node -e 스크립트를 standalone `src/compound-check.js`로 분리하여 shell escaping 문제 해결

### Changed
- **c4 send 자동 Enter** (5.18): 이미 구현 확인 (send()에서 자동 `\r` 추가), TODO에 done 표시

## [1.5.6] - 2026-04-05

### Added
- **Phase 5 추가 항목**: TODO 5.31~5.33 추가 (브랜치 자동 정리, worktree prune, c4 cleanup)
- **Phase 6 추가 항목**: TODO 6.7 추가 (best-practices 문서)

## [1.5.5] - 2026-04-05

### Added
- **Phase 5 추가 항목**: TODO 5.28~5.30 추가 (자동 승인 방지, intervention 알림, 서브모듈 diff)

## [1.5.4] - 2026-04-05

### Added
- **Phase 5 추가 항목**: TODO 5.20~5.27 추가 (CI 피드백, 안전 모드, 권한 프로파일 등)
- **Phase 6 로드맵**: 마케팅/가시성 항목 추가 (6.1~6.6)

## [1.5.3] - 2026-04-05

### Changed
- **auto-mgr 도구 제한** (5.1): `_buildAutoManagerPermissions()`에서 Read/Write/Edit/Grep/Glob deny. Bash는 `c4:*`와 `git -C:*` 패턴만 allow. manager worker가 코드를 직접 수정하지 못하고 c4 명령어로 하위 worker에 위임하도록 강제

## [1.5.2] - 2026-04-05

### Fixed
- **Worker close 시 Slack flush** (5.4): worker exit 시 alertOnly 모드에서 완료 메시지가 버퍼에 남는 문제 수정. notifyTaskComplete 후 즉시 _flushAll() 호출

### Added
- **Phase 5 로드맵**: TODO.md에 실사용 테스트 + 강제 메커니즘 항목 추가 (5.1~5.16)
- **Phase 5 추가 항목**: TODO 5.17 --repo 옵션 구현, 5.18 send 자동 Enter, 5.19 PreToolUse 복합 명령 차단 실효성

## [1.5.1] - 2026-04-05

### Fixed
- **Windows 콘솔 창 숨김** (4.25): `execSyncSafe` 래퍼 도입하여 모든 `execSync` 호출에 `windowsHide: true` 기본 적용. daemon spawn에 `windowsHide: true` 추가. pty.spawn에 `useConpty: false` 추가하여 conpty 관련 이슈 방지

## [1.5.0] - 2026-04-04

### Added
- **트러블슈팅 가이드** (4.21): `docs/troubleshooting.md` 신규 작성
  - 좀비 데몬: PID 파일 잔존 + HTTP 무응답 진단/해결
  - Worktree 잔여물: 비정상 종료 후 stale worktree 정리, dirty worktree 복구
  - STALL 반복: intervention/idle 기반 멈춤 원인별 해결, autoApprove/autoRestart 예방
  - Lost 워커 복구: `c4 resume` 세션 복구, worktree dirty 상태 처리
  - CLI 에러: ECONNREFUSED, timeout, Git Bash 경로 변환 등 일반 에러 해결
  - Quick Reference 테이블로 빠른 참조
- **claude --resume 세션 이어가기** (4.1): 작업자/관리자 재시작 시 이전 세션 자동 복구
  - `_getWorkerSessionId()`: Claude Code JSONL 세션 파일에서 최신 세션 ID 추출
  - `_updateSessionId()`: healthCheck 주기마다 세션 ID 갱신, state.json에 영속화
  - `create()`: `options.resume` 지원 — `claude --resume <sessionId>`로 세션 이어가기
  - healthCheck autoRestart: resume 우선 시도, 실패 시 새 세션 폴백
  - `c4 resume <name> [sessionId]`: CLI 명령으로 수동 resume
  - `c4 session-id <name>`: 작업자 세션 ID 조회
  - `GET /session-id`, `POST /resume`: daemon API 라우트
  - watchdog.sh: 관리자 사망 시 resume 우선 시도
  - `tests/session-resume.test.js`: 13개 유닛 테스트
- **autonomyLevel 4 완전 자율** (4.5): deny 룰도 approve로 오버라이드하는 완전 자율 모드
  - `_getAutonomyLevel()`: config에서 autonomyLevel 읽기
  - `_classifyPermission()`: Level 4일 때 deny → approve + `[AUTONOMY L4]` 스냅샷 기록
  - config.example.json에 `autoApprove.autonomyLevel` 옵션 추가
  - `tests/autonomy-level.test.js`: 14개 유닛 테스트
- **관리자 자동 교체** (4.7): 컨텍스트 한계 도달 시 관리자 자동 교체
  - `compactEvent()`: PostCompact hook에서 compact 이벤트 수신, 횟수 추적
  - `_replaceManager()`: 새 관리자 생성 + 맥락 전달 (session-context.md, TODO.md, git log)
  - PostCompact hook에 daemon compact-event 보고 curl 명령 추가
  - `config.managerRotation.compactThreshold`: 교체 임계값 설정 (0=비활성)
  - healthCheck에서 임계값 근접 경고 알림
  - `POST /compact-event` daemon API 라우트
  - `tests/manager-rotation.test.js`: 13개 유닛 테스트
- **LOST worker worktree 안전 정리**: healthCheck에서 미아 worktree를 dirty 상태 확인 후 안전하게 정리
  - `_cleanupLostWorktrees()`: 삭제 전 `git status --porcelain`으로 uncommitted changes 확인
  - `_isWorktreeDirty()`: worktree의 dirty 상태 확인 (staged, unstaged, untracked 파일 검사)
  - `_notifyLostDirty()`: dirty worktree 발견 시 `[LOST DIRTY]` 알림을 모든 채널에 즉시 전송
  - dirty worktree: 삭제하지 않고 보존 + Slack/Discord/Telegram 알림으로 사용자에게 판단 위임
  - clean worktree: 기존과 동일하게 안전 삭제
  - orphan 스캔에서 lostWorkers에 속한 worktree 중복 처리 방지
  - 반환값 변경: `number` -> `{ cleaned, preserved }` 객체
  - `tests/worktree-cleanup.test.js`: 18개 유닛 테스트

### Fixed
- **알림 동작 수정** (4.24): `notifyHealthCheck`, `notifyTaskComplete` 불필요한 동작 제거
  - `notifyHealthCheck()`: 워커가 없을 때 "daemon OK" 메시지 전송 삭제 (노이즈 제거)
  - `notifyTaskComplete()`: `alertOnly` 체크 제거 - 완료 메시지는 항상 전송
- **좀비 데몬 정리** (4.21): `daemon stop`이 프로세스를 확실히 죽이도록 수정
  - SIGTERM 후 매 반복마다 프로세스 종료 확인, 죽으면 즉시 반환
  - kill 호출 중 race condition 처리 (에러 발생 시에도 프로세스 사망 여부 재확인)
  - SIGKILL 후 최대 2초간 종료 확인 루프 추가
  - Windows에서 불필요한 SIGKILL 단계 제거 (taskkill /F가 이미 강제 종료)
  - 프로세스가 SIGTERM+SIGKILL 모두 생존하면 `{ ok: true }` 대신 `{ error }` 반환
  - `tests/daemon-stop.test.js`: 9개 유닛 테스트
- **SSH target worktree 생성 방지** (4.22): SSH target(dgx 등) worker에 불필요한 로컬 worktree 생성 방지
  - `sendTask()`, `_createAndSendTask()`: `_resolveTarget()`으로 target type 확인, ssh이면 `useWorktree=false` 강제
  - SSH worker는 remote에서 실행되므로 로컬 worktree가 불필요하고 오류를 유발할 수 있음
  - `tests/pending-task-worktree.test.js`: SSH 관련 3개 유닛 테스트 추가 (총 16개)
- **notifyHealthCheck 상태 누락 수정** (4.20): `restarted`/`restart_failed` 워커가 Slack 알림에서 누락되던 문제 수정
  - `restart_failed` 워커를 dead 목록에 포함, '재시작 실패' 라벨 표시
  - `restarted` 워커를 alive 목록에 포함
  - LANG에 `restarted`/`restartFailed` 라벨 추가 (ko/en)
  - `tests/slack-activity.test.js`: 4개 유닛 테스트 추가 (총 12개)
- **Slack 알림 task 요약 절단 버그** (4.19): 파일명의 `.`에서 잘리던 task 요약 수정
  - `_fmtWorker()`, `notifyTaskComplete()`, `notifyError()`: `split(/[.\n]/)` -> `split('\n')`
  - 예: "Fix bug in daemon.js" 가 "Fix bug in daemon" 으로 잘리던 문제 해결
  - `tests/notifications.test.js`: 5개 테스트 추가 (dot 보존, multi-line 첫줄 추출)
- **merge-homedir config 폴백** (4.18): cli.js merge 핸들러에 config.json projectRoot 폴백 추가
  - `git rev-parse` 실패 시 `config.json`의 `worktree.projectRoot` 확인
  - `pty-manager.js`의 `_detectRepoRoot()`와 동일한 폴백 전략
  - 홈디렉토리에서 `c4 merge` 실행 가능
  - `tests/merge-homedir.test.js`: 11개 유닛 테스���
- **auto-resume idle 큐 확인** (4.17): 워커 idle 시 `_taskQueue`에서 매칭 태스크 자동 전송
  - idle 콜백(line 2246 부근): `_pendingTask` 없고 idle 상태일 때 `_taskQueue`에서 현재 워커명 매칭 태스크 검색 후 `sendTask()` 방식으로 전송
  - `_processQueue()`: idle 워커 감지 로직 추가 — healthCheck에서도 기존 idle 워커에 태스크 자동 할당
  - auto-mgr이 태스크 완료 후 다음 태스크를 자동으로 받을 수 있게 보장
  - `tests/auto-resume.test.js`: 13개 유닛 테스트
- **send() Enter 누락 버그 수정**: 일반 텍스트 전송(isSpecialKey=false) 시 `\r`(Enter)을 append하지 않아 명령이 실행되지 않던 문제 수정
- **pending-task worktree 미생성 버그 수정** (BF-1): `_createAndSendTask()`에서 worktree 생성 로직이 누락되어, 새 워커 생성과 동시에 task 전달 시 worktree 없이 원본 repo에서 작업이 실행되던 문제 수정. `sendTask()`의 worktree 생성 패턴을 `create()` 호출 직후에 복제하여 `_pendingTask` 저장 전에 `w.worktree`가 설정되도록 함
  - `tests/pending-task-worktree.test.js`: 13개 유닛 테스트
- **slack-activity hook 디버깅** (BF-2): hook 이벤트 수신 경로에 디버깅 로그 추가
  - `daemon.js` `/hook-event` 핸들러에 요청 수신/거부 로그 추가
  - `hookEvent()` 진입 시 workerName, hook_type, tool_name 로그 추가
  - `_appendEventLog()` 호출 시 파일 경로, 에러 로그 추가
  - `tests/slack-activity.test.js`: 8개 유닛 테스트
- **_chunkedWrite() 레이스 컨디션 수정** (1.19): setTimeout 기반 청크 전송을 async/await + drain 이벤트 기반 순차 전송으로 교체. 500자 초과 텍스트에서 `\r`이 유실되어 명령이 실행되지 않던 문제 해결. 호출처 5곳 모두 async 대응
- **worktree 완전 hook 세트** (4.17): `_buildWorkerSettings()`가 PreToolUse/PostToolUse/PostCompact 완전한 hook 세트를 직접 생성. 복합 명령 차단 hook을 PreToolUse 첫 번째로 배치하여 daemon 통신 hook 실패와 무관하게 차단 보장. Claude Code 설정 병합 의존 제거

### Changed
- **_getLastActivity 단순화**: events.jsonl 파싱 로직 전부 제거, `w._taskText` 첫 줄 반환 또는 `'idle'` 반환으로 단순화. `workerName` 파라미터 제거. 테스트 2파일 JSONL 관련 케이스 제거 후 새 로직에 맞게 재작성
- **README 배지 업데이트**: Platform 배지에서 macOS 제거, Win11 22H2+/Ubuntu 22.04+ 버전 명시. Node.js 배지에 tested v24.11.1 추가. Claude Code 지원 버전 v2.1.92로 갱신

## [1.4.0] - 2026-04-04

### Added
- **메시지 채널 확장** (4.12): notifications.js를 플러그인 구조로 리팩토링
  - Channel 베이스 클래스: push/flush/sendImmediate/start/stop 인터페이스
  - SlackChannel: 기존 Slack webhook 로직 (하위 호환 유지)
  - DiscordChannel: webhook POST `{ content }`, 2000자 초과 시 자동 truncate
  - TelegramChannel: Bot API `sendMessage`, Markdown parse_mode
  - KakaoWorkChannel: Incoming Webhook POST `{ text }`
  - `pushSlack()` -> `pushAll()` (모든 활성 채널에 push, pushSlack은 호환 alias)
  - `startPeriodicSlack()` -> `startAll()` / `stopPeriodicSlack()` -> `stopAll()`
  - `notifyStall()`: 모든 채널에 즉시(unbuffered) 전송
  - `tick()`: 모든 채널 flush
  - config.example.json에 discord/telegram/kakaowork 설정 추가
  - 새 외부 패키지 없이 Node.js 표준 http/https만 사용

## [1.3.2] - 2026-04-04

### Changed
- **_getLastActivity JSONL 기반 전환** (4.14): raw screen 패턴 매칭 제거, logs/events-<worker>.jsonl에서 최근 tool_use 이벤트 읽어 "Edit: foo.js, Write: bar.js" 형태 반환. 폴백으로 taskText 첫줄 요약

### Added
- **alertOnly 모드** (4.16): `notifications.slack.alertOnly` 옵션 추가. true이면 STALL/ERROR 알림만 Slack 전송, 일반 알림(statusUpdate, notifyEdits, notifyTaskComplete, notifyHealthCheck) 억제. 8개 유닛 테스트 추가
- **notifyStall 긴급 알림** (4.15): `notifyStall(workerName, reason)` 메서드. Slack webhook 즉시 전송 (버퍼 미사용)
  - healthCheck에서 intervention 상태 워커 자동 감지
  - busy 워커 5분+ 무출력 시 자동 감지
  - `tests/stall-detection.test.js`: 10개 유닛 테스트

---

## [1.3.1] - 2026-04-04

### Added
- **Hook 이벤트 JSONL 영속화** (4.2): `_appendEventLog()` 메서드 추가
  - 모든 PreToolUse/PostToolUse hook 이벤트를 `logs/events-<worker>.jsonl`에 JSONL 형식으로 저장
  - 워커별 개별 파일로 분리 저장 (리플레이/디버깅 용도)
  - 잘못된 입력(null, undefined, 비문자열 workerName, 비객체 hookEntry) 안전 처리
  - 파일/디렉토리 자동 생성, 기존 파일에 추가(append) 동작
  - 쓰기 실패 시 hook 처리 중단 없이 무시 (에러 격리)
  - `tests/hook-event-log.test.js`: 16개 유닛 테스트
- **Dashboard Web UI** (4.3): `GET /dashboard` route in daemon
  - Worker list with status, target, branch, phase, intervention, snapshots, PID
  - Stats bar: total workers, busy, idle, exited, queued counts
  - Queued tasks section (shown when queue is non-empty)
  - Lost workers section (shown when lost workers exist)
  - Dark theme, responsive layout (mobile-friendly)
  - XSS protection via HTML escaping
  - 30-second auto-refresh
  - No external dependencies — pure HTML string rendering
  - `tests/dashboard.test.js`: 17 unit tests

---

## [1.3.0] - 2026-04-03

### Added
- **Global auto mode**: `c4 auto` sets `_globalAutoMode=true` on daemon. All workers created during auto session inherit `defaultMode: 'auto'` and auto-approve all non-denied commands. No more overnight permission prompt stalls.
- **PostCompact hook auto-injection**: All worker `.claude/settings.json` now include PostCompact hook that re-injects CLAUDE.md + session-context.md after context compaction.
- **CLAUDE.md full CLI reference**: Added complete c4 command list and manager worker operation pattern to CLAUDE.md for worker self-guidance.

### Changed
- **Slack notifications improved**: `notifyHealthCheck()` now shows per-worker task description + elapsed time instead of generic "OK: N workers running".
- **`c4 init` permissions expanded**: 4 allow rules -> 30+ allow + 7 deny rules. Covers all common development commands out of the box.
- **`_classifyPermission` auto worker support**: Accepts worker context, auto workers default to 'approve' for unmatched commands instead of 'ask'.
- **User `~/.claude/settings.json` PostCompact**: Now injects both CLAUDE.md and session-context.md.

---

## [1.2.1] - 2026-04-04

### Updated
- **config.example.json**: `intervention` 섹션 추가, `notifications.language` 필드 추가
- **CLAUDE.md**: CLI 전체 명령어 레퍼런스 추가 (token-usage, scrollback, templates, swarm, morning, plan, plan-read, rollback, config, health)

---

## [1.2.0] - 2026-04-03

### Added
- **`c4 auto` command** (4.8): One-command autonomous execution
  - `c4 auto "작업 내용"` → manager worker + scribe auto-start + task send
  - Manager worker gets full permissions (Read, Write, Edit, Bash, etc.) + `defaultMode: auto`
  - Morning report auto-generated on worker exit
  - daemon route: `POST /auto`
- **`c4 morning` command** (4.4): Morning report generation
  - `c4 morning` → generates `docs/morning-report.md`
  - Sections: recent commits (24h), worker history (completed/needs-review), TODO status, token usage
  - Auto-called when `c4 auto` worker exits
  - daemon route: `POST /morning`

---

## [1.1.0] - 2026-04-03

### Added
- **Notifications module** (4.10): `src/notifications.js` — Slack webhook (periodic) + Email (event-based)
  - Slack: built-in `https` module, buffer + periodic flush (`notifications.slack.intervalMs`)
  - Email: optional `nodemailer` soft dependency, sends immediately on task completion
  - Config: `notifications.slack` / `notifications.email` sections in `config.json`
  - daemon.js: `startPeriodicSlack()` on boot, `tick()` in healthCheck timer
  - pty-manager.js: `notifyTaskComplete()` on worker exit, `notifyHealthCheck()` on issues
- **PreToolUse compound command blocking** (4.6/4.9): Auto-inserted into worker `.claude/settings.json`
  - `_buildCompoundBlockCommand()`: cross-platform `node -e` script
  - Matcher: `Bash` tool only, detects `&&`, `||`, `|`, `;` → exit code 2 (block)
  - Injected via `_buildWorkerSettings()` into every worktree worker

---

## [1.0.2] - 2026-04-03

### Fixed
- **ScopeGuard glob `**` zero-depth match**: `_matchGlob`에서 `**`가 0개 디렉토리도 매칭하도록 수정 (`src/**/*.js` → `src/foo.js` 정상 매칭)
- **sendTask/send PTY 잘림 버그**: `_chunkedWrite()` 도입 — 500자 청크 + 50ms 간격 전송으로 PTY 버퍼 오버플로우 방지 (1.18)

### Added
- Integration tests: SSE, MCP, Worktree, Linux cross-platform (17 tests)
- Test results: 177/177 PASS (100%)

---

## [1.0.1] - 2026-04-03

### Fixed
- **npm link Windows fallback**: `c4 init` now creates wrapper scripts (shell + .cmd) in npm global bin directory when `npm link` fails, instead of relying on symlinks that require elevated permissions on Windows

### Changed
- README Install section simplified — `npm link` removed from manual steps, `c4 init` handles command registration automatically

---

## [1.0.0] - 2026-04-03

All Phase 1/2/3 features complete. 45 roadmap items implemented.

### Highlights
- **Scope Guard** (1.8): File/command scope enforcement + drift detection
- **Intervention Protocol** (1.9): Question/escalation/routine monitoring
- **Task Queue** (2.2-2.3, 2.8): Dependencies, deduplication, rate limiting
- **SSH Recovery** (2.4): ControlMaster + auto-reconnect
- **Token Monitoring** (2.5): JSONL parsing, daily limits, warnings
- **Autonomous Ops** (2.9): watchdog.sh for unattended operation
- **Context Transfer** (3.1): Worker-to-worker snapshot injection
- **Auto Verification** (3.2): Post-commit test runner
- **Effort Dynamic** (3.3): Task length-based effort auto-adjustment
- **Worker Pooling** (3.4): Idle worker recycling
- **SSE Events** (3.5): Real-time event streaming
- **Rollback** (3.6): Pre-task commit restore
- **Task History** (3.7): JSONL persistence, `c4 history`
- **ScreenBuffer** (3.8): Enhanced CSI parser + scrollback API
- **MCP Server** (3.9): HTTP MCP protocol at `/mcp`
- **Planner Worker** (3.10): Plan-only mode, `c4 plan`
- **State Machine** (3.11): Worker phase tracking (plan/edit/test/fix)
- **Adaptive Polling** (3.12): Activity-based idle interval
- **Interface Abstraction** (3.13): Terminal-Agent decoupling
- **Summary Layer** (3.14): Long snapshot auto-summarization
- **Hook Architecture** (3.15): PreToolUse/PostToolUse JSON events
- **Worker Settings** (3.16): Per-worktree `.claude/settings.json` profiles
- **Subagent Swarm** (3.17): Agent tool usage tracking + limits
- **Role Templates** (3.18): Planner/Executor/Reviewer presets
- **Auto Mode** (3.19): Claude classifier safety delegation
- **Cross-Platform** (3.20): Windows/Linux/macOS support

### Stats
- 13 source modules, 18 test files, 200+ unit tests
- Tested on Claude Code v2.1.85-2.1.110

---

<details>
<summary>Previous versions (0.1.0 - 0.14.0)</summary>

## [0.14.0] - 2026-04-03
- Cross-platform support (3.20): Platform utility functions, macOS homebrew/nvm paths

## [0.13.0] - 2026-04-03
- Hook architecture (3.15), Worker settings profiles (3.16), Subagent Swarm (3.17), Role templates (3.18), Auto Mode (3.19)

## [0.12.0] - 2026-04-03
- Context transfer (3.1), Worker pooling (3.4), Rollback (3.6), Effort dynamic (3.3), SSE (3.5), ScreenBuffer improvements (3.8)

## [0.11.0] - 2026-04-03
- Task history persistence (3.7), Autonomous ops (2.9), Auto-verification (3.2)

## [0.10.0] - 2026-04-03

### Added
- **Task queue with rate limiting** (2.8): `maxWorkers` config limits concurrent workers
  - Excess tasks queued automatically, dequeued when workers exit or in healthCheck
  - Queue persisted in `state.json`, `c4 list` shows QUEUED section
- **Task dependencies** (2.2): `c4 task worker-b "..." --after worker-a`
  - Queued task waits until dependency worker exits before starting
- **Duplicate task prevention** (2.3): Reject `c4 task` if same name already queued or running
- **Auto-create workers**: `c4 task` on non-existent worker auto-creates it
  - `tests/task-queue.test.js`: Unit tests
- **SSH disconnect recovery** (2.4): Automatic SSH connection resilience
  - ControlMaster (Unix) + ServerAlive + auto-reconnect on SSH worker exit
  - `[SSH WARN]` snapshots, health check integration
  - Config: `ssh.controlMaster`, `ssh.reconnect`, `ssh.maxReconnects`, etc.
- **Token usage monitoring** (2.5): Track daily token consumption from JSONL session files
  - `_parseTokensFromJsonl()`, `_checkTokenUsage()`: daily aggregation + 7-day history
  - `[TOKEN WARN]` snapshots, `c4 token-usage` CLI command
  - Config: `tokenMonitor.enabled`, `tokenMonitor.dailyLimit`, `tokenMonitor.warnThreshold`

### Changed
- `config.json`: Added `maxWorkers`, `ssh`, `tokenMonitor` sections
- `state.json`: Added `taskQueue` array (backward compatible)

## [0.9.0] - 2026-04-03

### Added
- **Scope Guard** (1.8): Task scope definition + drift detection
  - `src/scope-guard.js`: `ScopeGuard` class with file/bash scope checking and drift keyword detection
  - `checkFile()`: Validates file paths against `allowFiles`/`denyFiles` glob patterns
  - `checkBash()`: Validates bash commands against `allowBash`/`denyBash` prefix lists
  - `detectDrift()`: Detects scope drift keywords in worker output (Korean + English)
  - `resolveScope()`: Resolves scope from explicit → preset → default (priority order)
  - Out-of-scope access → auto-deny + `[SCOPE DENY]` snapshot
  - Drift keywords → `[SCOPE DRIFT]` snapshot
  - `c4 task --scope '...'` / `--scope-preset` CLI flags
  - `config.json`: `scope.presets`, `scope.defaultScope`
  - `tests/scope-guard.test.js`: Unit tests
- **Manager intervention protocol** (1.9): Automated detection of worker states requiring manager attention
  - **Question detection**: Korean + English question patterns, `[QUESTION]` snapshots
  - **Escalation detection**: Repeated error tracking → `[ESCALATION]` snapshot
  - **Routine monitoring**: implement → test → docs → commit compliance, `[ROUTINE SKIP]` snapshot
  - Worker intervention state: `c4 list` shows INTERVENTION column
  - Config: `intervention.enabled`, `intervention.questionPatterns`, `intervention.escalation.maxRetries`, `intervention.routineCheck`

## [0.8.1] - 2026-04-03

### Added
- **`c4 merge --skip-checks`** (1.16): Skip pre-merge checks for doc-only commits

### Fixed
- **Worktree main-protection hooks** (1.17): `_createWorktree()` sets `core.hooksPath` to enforce pre-commit hook in worktrees

## [0.8.0] - 2026-04-03

### Added
- **Log rotation** (2.7): Auto-rotate `logs/*.raw.log` when exceeding size limit
  - `_checkLogRotation()`: checks file size against `config.logs.maxLogSizeMb` (default 50MB)
  - Rotates `.raw.log` → `.raw.log.1` (deletes previous `.log.1`)
  - Re-opens log stream for active workers after rotation
  - Runs automatically in `healthCheck()` timer
- **Exited worker log cleanup** (2.7): Auto-delete logs of long-exited workers
  - `_cleanupExitedLogs()`: removes workers exited longer than `config.logs.cleanupAfterMinutes` (default 60min)
  - Deletes both `.raw.log` and `.raw.log.1` files
  - Removes cleaned-up workers from internal map
  - Runs automatically in `healthCheck()` timer
- **Lost worker recovery display** (2.7): Daemon restart awareness
  - `_loadState()` detects previously-alive workers from `state.json` on startup
  - Marks them as `lost` (daemon restarted, PTY sessions gone)
  - `_saveState()` includes `exitedAt` timestamp for exited workers
  - `c4 list` shows LOST section with name, pid, branch, and lost timestamp

## [0.7.0] - 2026-04-03

### Added
- **Scribe system** (1.6): Session context persistence via JSONL parsing
  - `src/scribe.js`: Core module — scans `~/.claude/projects/<project>/*.jsonl` files
  - JSONL parser with offset tracking (reads only new messages per scan)
  - Content extraction: user text, assistant text, tool uses (Write/Edit)
  - Auto-classification into categories: decision, error, fix, todo, intent, progress
  - Korean + English keyword pattern matching for classification
  - Structured output to `docs/session-context.md` (grouped by category, newest first)
  - Subagent session files included in scan
  - `c4 scribe start` — activate periodic scanning (default 5min interval)
  - `c4 scribe stop` — deactivate scribe
  - `c4 scribe status` — show scribe state (entries, tracked files, interval)
  - `c4 scribe scan` — run one-time scan immediately
  - Daemon integration: `/scribe/start`, `/scribe/stop`, `/scribe/status`, `/scribe/scan` API routes
  - Config: `scribe.enabled`, `scribe.intervalMs`, `scribe.outputPath`, `scribe.projectId`, `scribe.maxEntries`
  - PostCompact hook compatible: `cat docs/session-context.md` restores context after compaction

## [0.6.0] - 2026-04-03

### Added
- **CLAUDE.md rule enforcement** (1.13): Automated rule compliance for workers
  - Pre-commit hook warns on compound commands (`&&`, `|`, `;`) in staged diffs
  - `sendTask()` auto-prepends CLAUDE.md key rules to task text
  - Default rules summary: no compound commands, use `git -C`, use `c4 wait`, no main commits, work routine
  - Config: `rules.appendToTask` (default: true) enables/disables rule injection
  - Config: `rules.summary` for custom rules text (empty = built-in default)

## [0.5.0] - 2026-04-03

### Added
- **Worker health check** (1.7): Periodic alive check with auto-restart support
  - `healthCheck()` method: scans all workers, detects dead ones, logs `[HEALTH] worker exited` to snapshots
  - `startHealthCheck()` / `stopHealthCheck()`: timer-based periodic execution (default 30s)
  - Config: `healthCheck.enabled` (default: true), `healthCheck.intervalMs` (default: 30000), `healthCheck.autoRestart` (default: false)
  - Auto-restart: when enabled, dead workers are re-created with same command/target
  - `c4 list` shows last health check time (seconds ago + timestamp)
  - Daemon starts health check on boot, stops on shutdown

## [0.4.0] - 2026-04-03

### Added
- **`c4 merge` command** (1.11): Merge branch to main with pre-merge checks
  - Accepts worker name (`c4 merge worker-a`) or branch name (`c4 merge c4/feature`)
  - Pre-merge checks: npm test, TODO.md modified, CHANGELOG.md modified
  - Rejects merge if any check fails with clear error messages
  - Executes `git merge --no-ff` on success
- **Main branch protection** (1.11): Pre-commit hook blocks direct commits to main
  - `.githooks/pre-commit` prevents commits on main branch
  - `c4 init` sets `git config core.hooksPath .githooks` automatically

### Fixed
- **Effort auto-setup stabilized** (1.15): `/model` menu setup intermittent failure fix
  - Retry logic with configurable `retries` (default: 3) and `phaseTimeoutMs` (default: 8000ms)
  - Escape key sent on timeout to clear partial TUI state before retry
  - Configurable `inputDelayMs` and `confirmDelayMs` (previously hardcoded 500ms)
  - Config: `workerDefaults.effortSetup` object in `config.json`
  - Failure snapshot logged after max retries exhausted
  - Success snapshot shows retry count if retries were needed

### Improved
- **`c4 init` enhanced** (1.10): Full initialization with auto-detection and fallbacks
  - Auto-detect `claude` binary path (`where`/`which`) → saves to `config.json`
  - Register `c4` command: `npm link` → `~/.local/bin/c4` symlink → `.bashrc` alias (3-step fallback)
  - EPERM handling: graceful error on Windows symlink permission issues

## [0.3.1] - 2026-04-03

### Added
- **`c4 init` command** (1.10): One-time project initialization
  - Merges c4 permissions into `~/.claude/settings.json` (non-destructive)
  - Copies `config.example.json` → `config.json` (skips if exists)
  - Creates `~/CLAUDE.md` symlink → repo `CLAUDE.md`

## [0.3.0] - 2026-04-03

### Added
- **Git worktree support** (1.12): Each worker gets an isolated worktree directory
  - `sendTask()` auto-creates `git worktree add ../c4-worktree-<name> -b <branch>`
  - Worker is instructed to `cd` into the worktree before starting work
  - `close()` auto-removes worktree with `git worktree remove --force`
  - `list()` shows worktree path per worker
  - Stale worktree cleanup on re-creation
  - Config: `worktree.enabled` (default: true), `worktree.projectRoot` (auto-detect from git)
  - API: `useWorktree`, `projectRoot` options in `/task` endpoint
  - Fallback to branch-only mode with `useWorktree: false`
- **TODO roadmap expansion** (3.10-3.19): Planner Worker, State Machine, Adaptive Polling, Interface Abstraction, Summary Layer, Hook architecture, Subagent Swarm, Role templates, Auto Mode

### Fixed
- **Git Bash MSYS path fix** (1.4): Cherry-picked `MSYS_NO_PATHCONV=1` + `fixMsysArgs()` to main branch

## [0.2.0] - 2026-04-02

### Added
- **Auto-approve engine** (1.1): Config-based TUI pattern matching for permission prompts
  - Version compatibility system (`compatibility.patterns` in config)
  - Tested on v2.1.85, v2.1.90
  - Bash command extraction from screen, file name extraction
  - Option count detection (2-opt vs 3-opt prompts)
  - `alwaysApproveForSession` toggle for "don't ask again" option
  - Audit trail: auto-approve/deny decisions logged in snapshots
- **Worker auto-setup** (1.3): Trust folder + max effort fully automated
  - 2-phase idle detection: prompt detect → /model → menu detect → Right+Enter
  - Configurable effort level via `workerDefaults.effortLevel`
- **Git branch isolation** (1.5): `c4 task` command with auto branch creation
  - `--branch` flag for custom branch, `--no-branch` to skip
  - Workers instructed to commit per unit of work
  - Branch info shown in `c4 list`
- **`c4 task`** command: send task with branch isolation in one step
- **`c4 config` / `c4 config reload`**: view and hot-reload config
- **Claude Code plugin marketplace**: self-hosted via `.claude-plugin/`
- **TODO.md roadmap**: Phase 1/2/3 with task scope, manager protocol, design-doc workflow

### Changed
- Renamed project from `dispatch-terminal-mcp` to `c4` (Claude {Claude Code} Code)
- CLI command: `dispatch` → `c4`
- `config.json` moved to `.gitignore`, `config.example.json` provided
- Git commands added to autoApprove rules

### Fixed
- SSH argument passing on Windows (cmd.exe `&&` splitting issue → pendingCommands approach)
- Git Bash path conversion for `/model` → `MSYS_NO_PATHCONV=1` workaround

## [0.1.0] - 2026-04-02

### Added
- Core daemon with HTTP API (localhost:3456)
- PTY-based worker management (create, send, read, close)
- ScreenBuffer virtual terminal — clean screen state without spinner noise
- Idle detection and snapshot system
- SSH remote workers (`--target` flag)
- CLI tool with all management commands
- `config.json` for all settings (daemon, pty, targets, autoApprove, logs)
- Support for special keys (Enter, C-c, C-b, arrows, etc.)

### Architecture
- Node.js daemon + `node-pty` for pseudo-terminal management
- Custom ScreenBuffer replaces xterm-headless (no browser deps)
- Snapshot-based reading — only idle/finished states are captured
- SSH workers via `ssh.exe` with `pendingCommands` for initial setup
