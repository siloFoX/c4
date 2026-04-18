# C4 Web Redesign: ARPS Frontend Analysis

Reference: `/home/shinc/arps/frontend` on DGX server (192.168.10.222).

This document captures the visual and technical vocabulary that the C4 Web UI
redesign on branch `c4/web-redesign` should adopt. It is a read-only analysis —
no code has been modified.

## 1. Stack comparison

| Area | Current c4/web | ARPS frontend |
| --- | --- | --- |
| React | 18.3.1 | 19.1.0 |
| Vite | 5.3.1 | 6.3.5 |
| Tailwind | 3.4.4 (no custom theme) | 3.4.3 (shadcn/ui tokens) |
| Icons | inline Unicode glyphs | `lucide-react` |
| Primitives | hand-rolled | `@radix-ui/react-slot` + `class-variance-authority` + `clsx` + `tailwind-merge` |
| Animations | none | `tailwindcss-animate` |
| Charts | none | `recharts` |
| Dark-mode | always dark, no toggle | `darkMode: "class"` with CSS var flip |

The redesign does not need to match ARPS version-for-version. We keep React 18
plus Vite 5 to avoid an ecosystem jump inside this task, but we adopt ARPS's
token/component vocabulary.

## 2. Color & token system

ARPS uses HSL CSS variables declared in `src/index.css` and exposed through
`tailwind.config.js` via `hsl(var(--...))`. The palette is
shadcn/ui `new-york` style with `zinc` base colour.

Core tokens observed in `src/index.css`:

- Surfaces: `--background`, `--foreground`, `--card`, `--popover`
- Intents: `--primary`, `--secondary`, `--muted`, `--accent`, `--destructive`
- Chrome: `--border`, `--input`, `--ring`
- Charts: `--chart-1`..`--chart-5`
- Radius: `--radius: 0.5rem`
- Dark theme overrides under `.dark { ... }`

Working-class colours (used directly in markup, not via tokens):

- App shell: `bg-slate-900`, headers/panels `bg-slate-800`, borders `border-slate-700`
- Copy: `text-white` for headings, `text-slate-400` for secondary, `text-slate-500/50` for captions
- Status greens/reds/ambers: `text-green-400`, `text-red-400`, `text-yellow-400`, `text-amber-400`, `text-blue-400`, `text-violet-400`
- Accent orange used in the ARPS wordmark: `#fc9d4a`
- Auth gradient: `bg-gradient-to-r from-violet-600 to-purple-600`

Planning note for c4: we replicate the CSS-variable token layer, but for the
first pass the C4 app stays in dark-only (class `.dark` pinned on `html`),
matching the existing UX contract.

## 3. Component vocabulary

### `src/components/ui/` (shadcn-style primitives)

Currently used in ARPS: `ActionButtons`, `Logo`, `StatusIndicator`. These are
thin, purpose-built wrappers rather than the full shadcn kit, but they share
the same patterns: `lucide-react` icon + rounded surface + hover transition.

For C4 we will introduce a small ui folder:

- `Button` with variants (`default`, `ghost`, `destructive`, `outline`) using `cva`
- `Card` (rounded-xl, `bg-card`, `border border-border`, padded header/body/footer)
- `Panel` (lightweight dark card with optional title + icon row)
- `Input` and `Label` matching the LoginPage style (pill-shaped, `rounded-xl`, focus ring)
- `Badge` for status chips (used today by `WorkerList` as inline spans)
- `IconButton` wrapper (`p-2 rounded-lg transition-colors hover:bg-slate-700`)

### Iconography

ARPS uses `lucide-react` universally. Examples seen: `User`, `Lock`, `Unlock`,
`Loader2`, `ChevronDown`, `X`, `Zap`, `Clock`, `LogOut`, `Settings`,
`ClipboardList`, `Maximize2`, `Minimize2`, `Wifi`, `WifiOff`.

C4 currently uses Unicode glyphs (e.g. `\u2715`, `\u2630`) and plain text
labels. Switching to `lucide-react` yields a consistent 16/20/24 px icon grid
and crisp vector rendering.

### Layout shell

ARPS's `DashboardLayout` wraps:

```
<Header />            // logo + StatusIndicator + ActionButtons + user block
<StatusBar />         // clock/scheduler + controller pill + battery + robot
<Main>                // grid of cards OR children pane
<RIVAPanel />         // right-side drawer
```

C4 has a comparable skeleton in `App.tsx` (header + top-tabs, sidebar,
main-pane, detail-tabs) but without the token system or icon library. The
redesign preserves C4's information architecture (Workers / History / Chat /
Workflows) and simply re-skins it using the ARPS vocabulary.

### Motion / interaction

- Hover transitions: `transition-colors`, 150-200 ms default
- Layout animations on the auth form: `transition-all duration-300`
  (max-height reveal for error / submit-button)
- `animate-spin` on `Loader2`
- Glassy auth card: `bg-slate-800/60 backdrop-blur-xl`

### Login page reference

`src/pages/LoginPage.tsx` uses:

- `min-h-screen bg-gradient-to-br from-gray-900 via-slate-900 to-gray-900`
- dotted radial background pattern via inline `backgroundImage`
- square white logo tile + wordmark with orange initial
- glass card (`backdrop-blur-xl`, `rounded-2xl`)
- rounded pill inputs with icon prefix
- gradient submit button shown only when both fields are filled
- footer with `SHI&C` byline

The C4 login will adopt the same composition without the branding copy.

## 4. Target adoption scope for C4

1. **Token layer**: introduce `--background`, `--foreground`, `--card`,
   `--primary`, `--border`, `--radius`, etc. in `src/index.css`; extend
   `tailwind.config.js` to expose them. Keep `.dark` as the only enabled theme
   class for now.
2. **Dependencies (minimal)**: add `lucide-react`, `clsx`, `tailwind-merge`,
   `class-variance-authority`. Do NOT add Radix packages we will not use.
3. **Primitives**: add `src/components/ui/{button,card,panel,input,label,badge,icon-button}.tsx` using cva + tw-merge.
4. **Layout shell**: rebuild `App.tsx`'s header, tab bar, sidebar, and main in
   the ARPS vocabulary (slate-900 shell + slate-800 panels + lucide icons +
   hover rings).
5. **Pages**: re-skin `WorkerList`, `WorkerDetail`, `ChatView`,
   `ControlPanel`, `HierarchyTree`, `HistoryView`, `Chat`, `Login`,
   `WorkflowEditor`. Keep behavior / props / API unchanged — only swap
   presentation.

## 5. Out of scope for this branch

- React 19 upgrade, Vite 6 upgrade.
- Full shadcn/ui (Dialog, Popover, Select, Tabs) — only add if a concrete page
  needs one.
- Light-mode theme. The `.dark` variables are defined but the root stays in
  dark permanently.
- Replacing the current data layer or SSE logic.

## 6. Key source files read

ARPS (remote):
- `frontend/package.json`
- `frontend/tailwind.config.js`
- `frontend/src/index.css`
- `frontend/components.json`
- `frontend/src/components/layout/{DashboardLayout,Header}.tsx`
- `frontend/src/components/ui/{ActionButtons,Logo,StatusIndicator}.tsx`
- `frontend/src/components/dashboard/MapSection.tsx`
- `frontend/src/pages/{Dashboard,LoginPage}.tsx`

C4 (local):
- `web/package.json`, `web/tailwind.config.js`, `web/src/index.css`
- `web/src/App.tsx`, `web/src/types.ts`
- `web/src/components/{WorkerList,Login}.tsx`

This analysis informs `web-redesign-plan.md` in the same directory.
