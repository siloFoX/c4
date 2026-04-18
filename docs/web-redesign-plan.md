# C4 Web Redesign: Plan

Source of truth for the `c4/web-redesign` effort. Each worker listed below
receives one branch, one scope, and one merge pass. The plan is strictly
sequential — later workers depend on the tokens / primitives introduced by
earlier ones.

Companion document: `web-redesign-analysis.md`.

## Ground rules

- **Branch base**: main (c4 version 1.7.0, `75c1868 Merge branch 'c4/hygiene-v8'`).
- **Pre-merge test count on main**: 99 passing (confirmed via `node tests/run-all.js`).
  Each worker must record `test_count: 99` in `.c4-validation.json` on the
  branch it opens; when a worker introduces new tests, it bumps this value
  for the next worker in the chain.
- **Worker profile**: `--profile web`.
- **No main commits.** Each worker opens its own branch under `c4/<worker-name>`
  off of the latest main and is merged by the manager only after:
  1. `npm --prefix web run build` succeeds,
  2. `node tests/run-all.js` reports the expected test count (>= 99),
  3. the worker commits `TODO.md` / `CHANGELOG.md` / `patches/*.md` deltas.
- **Scope lock**: a worker never touches files outside its declared scope.
  If it needs to, it stops and reports to the manager instead of expanding.
- **Dark-only**: the app root stays `.dark`. No light-mode switch in this pass.

## Target stack after the redesign

- React 18 + Vite 5 (unchanged).
- Tailwind 3 with HSL CSS-variable tokens (from ARPS).
- `lucide-react` icons.
- `clsx` + `tailwind-merge` + `class-variance-authority` for variant utilities.
- No Radix, no full shadcn/ui — only hand-rolled primitives that mirror the
  ARPS vocabulary.

## Worker 1 — web-theme

Branch: `c4/web-theme`.

### Scope
- `web/package.json` (add `lucide-react`, `clsx`, `tailwind-merge`, `class-variance-authority`).
- `web/tailwind.config.js` (extend `colors`, `borderRadius`, `fontFamily`, enable `darkMode: "class"`, register `tailwindcss-animate` only if we add animated components in this pass; otherwise leave out).
- `web/src/index.css` (install `@layer base` with the HSL tokens; pin `.dark` on `html`).
- `web/src/lib/cn.ts` (new): `cn` helper (`clsx` + `tailwind-merge`).
- Root HTML update: `web/index.html` - ensure `<html class="dark">`.

### Acceptance
- `npm --prefix web install` passes.
- `npm --prefix web run build` passes.
- `node tests/run-all.js` still reports 99 passing.
- App renders dark surfaces using tokens (`bg-background`, `text-foreground`),
  even before the component work — this is verified by a visual check of the
  existing `App.tsx` chrome.
- `.c4-validation.json` contains `{"test_count": 99, "build": "pass"}`.
- Docs delta: `TODO.md` leaves 8.1/8.9 open; `CHANGELOG.md` gets an
  "Unreleased" entry under `c4/web-redesign`.

### Explicitly NOT in scope
- Rewriting `App.tsx` or any component's JSX beyond adding the `cn` import if
  strictly needed.
- Changing the SSE / API layer.

## Worker 2 — web-components

Branch: `c4/web-components`. Depends on web-theme being merged to main.

### Scope
- `web/src/components/ui/` (new directory):
  - `button.tsx` — `cva` variants `default|ghost|outline|destructive`, sizes `sm|md|icon`.
  - `card.tsx` — `Card`, `CardHeader`, `CardTitle`, `CardBody`, `CardFooter`.
  - `panel.tsx` — lightweight dark panel with optional icon + title.
  - `input.tsx` — rounded pill input used by Login and forms.
  - `label.tsx` — form label.
  - `badge.tsx` — status pills (`idle|busy|exited|intervention|unread`).
  - `icon-button.tsx` — square hover-ring icon button.
- `web/src/components/ui/index.ts` — barrel re-export.
- Replace Unicode glyphs in existing components only where the replacement is
  trivially 1:1 (e.g. the sidebar close button X / hamburger). Do NOT rewrite
  layouts; that is the next worker's job.

### Acceptance
- Build passes; tests pass (>= 99, may add component smoke tests).
- Primitives exported and used by at least one existing component to prove
  they compile (start with the header's menu toggle in `App.tsx`).
- `.c4-validation.json` reflects the new count.
- Visual regression: header looks unchanged or clearly improved; no broken
  layout.

### Explicitly NOT in scope
- Changes to `WorkerList`, `WorkerDetail`, `ChatView`, `ControlPanel`,
  `HierarchyTree`, `HistoryView`, `Chat`, `Login`, `WorkflowEditor` beyond the
  icon swap.
- Tab bars, sidebars, page layouts.

## Worker 3 — web-layout

Branch: `c4/web-layout`. Depends on web-components being merged.

### Scope
- `web/src/App.tsx` — recompose using the new primitives + lucide-react icons:
  - App shell: `flex h-screen bg-background text-foreground`.
  - Header: `Logo` + top-tab bar (`Workers / History / Chat / Workflows`) + sign-out `IconButton`.
  - Sidebar: collapsible on mobile, `List / Tree` toggle preserved.
  - Main pane: empty-state card when no worker selected; detail-mode tabs
    (`Terminal / Chat / Control`) preserved.
- `web/src/components/layout/` (new):
  - `AppHeader.tsx` encapsulating the header.
  - `Sidebar.tsx` encapsulating the worker-sidebar.
  - `TopTabs.tsx` for the primary view switcher.
- Responsive behaviour: preserve the existing `md:` breakpoints; replace
  ad-hoc Tailwind utility stacks with the new primitives.

### Acceptance
- Build + tests pass.
- `App.tsx` becomes a thin router-like composition (< 180 LOC vs ~350 today).
- Keyboard / ARIA attributes preserved (`role="tablist"`, `aria-selected`,
  `aria-label`).
- `localStorage` keys (`c4.sidebar.mode`, `c4.detail.mode`, `c4.topView`)
  unchanged.
- `.c4-validation.json` updated.

### Explicitly NOT in scope
- `WorkerList`, `WorkerDetail`, `ChatView`, `ControlPanel`, `HierarchyTree`,
  `HistoryView`, `Chat`, `Login`, `WorkflowEditor` internals beyond removing
  duplicated chrome that the new layout now owns.

## Worker 4 — web-pages

Branch: `c4/web-pages`. Depends on web-layout.

### Scope
- Re-skin, in order:
  1. `Login.tsx` — match ARPS LoginPage composition (glass card, gradient
     button, icon-prefix inputs) but with C4 copy.
  2. `WorkerList.tsx` — replace inline status chip markup with `<Badge>`;
     use `Card` for each row; `lucide-react` icons for status.
  3. `WorkerDetail.tsx` — frame in a `Card` with `CardHeader` + `CardBody`;
     use `IconButton` for toolbar actions.
  4. `ChatView.tsx`, `ControlPanel.tsx`, `Chat.tsx` — apply the same panel /
     card vocabulary. Preserve all behaviour (message loop, PTY stream).
  5. `HierarchyTree.tsx`, `HistoryView.tsx`, `WorkflowEditor.tsx` — cosmetic
     pass only.
  6. `Toast.tsx`, `WorkerActions.tsx` — make them use the new primitives.

### Acceptance
- Build + tests pass.
- Every page component renders without layout regressions.
- Visual spot-check list (documented in the PR):
  - Login card renders centered with rounded glass panel.
  - Worker list shows colour-coded status badges.
  - Worker detail panel framed by `Card`.
  - Tabs (top-level + detail) preserved visually.
- `TODO.md` 8.1 and 8.9 flipped to done; `CHANGELOG.md` entry under released
  version (pick `1.11.8-web-redesign`); patch note file
  `patches/1.11.8-web-redesign.md` written.

### Explicitly NOT in scope
- Introducing new product features (new tabs, new actions, new endpoints).
- API / SSE code changes.

## Phase 5 — manager-led integration

Performed by the web-mgr after web-pages merges:

1. `npm --prefix web run build` in main worktree.
2. `npm --prefix web run dev` (log only; user verifies the UI in browser).
3. Confirm `node tests/run-all.js` reports the expected count.
4. Final docs pass — ensure `TODO.md`, `CHANGELOG.md`, and `patches/` entries
   exist and cross-reference each other.

## Risks & notes

- `tailwind-merge`/`clsx` pulled in for the first time. These are small; no
  license concerns.
- `class-variance-authority` is ~6 KB. Acceptable.
- If any worker's build fails on `lucide-react` import cost, fall back to
  tree-shake verified imports (already the default with Vite).
- If the token CSS introduces regressions (e.g. components using
  `bg-gray-900` that now look off), the component worker will correct those
  during the icon-swap pass.

## Validation file format

Every worker branch contains `.c4-validation.json` at the branch root:

```json
{
  "test_count": 99,
  "build": "pass",
  "branch": "c4/<worker-name>",
  "notes": "optional free text"
}
```

If a worker adds tests, it bumps `test_count` and documents the delta in the
PR / commit body. The manager reads this file before invoking `c4 merge`.
