# Web design palette

The c4 web UI (`web/`) is themed through a shadcn-style semantic palette: a
small set of named tokens defined as HSL CSS variables, exposed to Tailwind
as ordinary color classes (`bg-card`, `text-muted-foreground`, etc.).
Components reach for tokens, not raw color names — that keeps light/dark
mode consistent, dodges the `dark:` variant proliferation, and lets a single
edit in `index.css` re-theme the whole app.

This doc explains where the tokens come from, which tokens exist, how to
use them, and how to add a new one.

## Token sources

There are two files that together define the palette:

- `web/src/index.css` — the source of truth. Every token is declared
  twice: once under `:root` (light mode) and once under `.dark` (dark
  mode). Values are HSL triplets (`240 5.9% 10%`) without the `hsl(...)`
  wrapper so the same variable can be re-used with an alpha modifier
  (`hsl(var(--primary) / 0.3)`).
- `web/tailwind.config.js` — exposes each CSS variable as a Tailwind
  color. `bg-primary` resolves to `background-color: hsl(var(--primary))`
  at build time, and modifiers like `/30` work because the variable holds
  a bare triplet.

Light/dark switching is controlled by a `.dark` class on `<html>`, set by
the user preference dropdown. Dark mode values are tuned to ARPS' slate
palette so the c4 + ARPS surfaces blend in the same browser window.

## Semantic palette

| Token | Purpose | Class examples |
| --- | --- | --- |
| `--background` / `--foreground` | App canvas + default text | `bg-background`, `text-foreground` |
| `--card` / `--card-foreground` | Surface for content cards | `bg-card`, `text-card-foreground` |
| `--popover` / `--popover-foreground` | Floating panels, menus, tooltips | `bg-popover`, `text-popover-foreground` |
| `--primary` / `--primary-foreground` | Run / Submit / active tab | `bg-primary`, `text-primary-foreground` |
| `--secondary` / `--secondary-foreground` | Secondary buttons + chips | `bg-secondary` |
| `--muted` / `--muted-foreground` | Subdued background + hint text | `bg-muted`, `text-muted-foreground` |
| `--accent` / `--accent-foreground` | Hover + selection background | `bg-accent`, `hover:bg-accent` |
| `--border` / `--input` | Card / input border | `border-border`, `border-input` |
| `--ring` | Focus ring | `ring-ring`, `focus-visible:ring-ring` |
| `--destructive` / `--destructive-foreground` | Errors, delete, abort | `bg-destructive`, `text-destructive` |
| `--success` / `--success-foreground` | OK / merged / live indicator | `bg-success/15`, `text-success` |
| `--warning` / `--warning-foreground` | Pending / paused / review-needed | `bg-warning/10`, `text-warning` |
| `--info` / `--info-foreground` | Decisions / live stream / accent bars | `bg-info/10`, `text-info` |
| `--chart-1` .. `--chart-5` | Categorical chart series (not statuses) | `bg-chart-1`, `stroke-chart-2` |
| `--radius` | Card / button rounded radius | `rounded-md` (derived) |

`success` / `warning` / `info` were added in `v1.11.77`. Before that, the
same intent was spelled `emerald-500/15 text-emerald-700 dark:text-emerald-400`
at every site — verbose, easy to drift, and never picking up theme-level
calibration. Use the semantic tokens for any new code that needs an
ok/pending/info treatment.

## Usage examples

### Good — semantic + alpha modifiers

```tsx
// Status chip
<span className="rounded-full border border-success/40 bg-success/10 px-2 text-success">
  ok
</span>

// Pulsing dot when the SSE stream is live
<span className="inline-block h-1.5 w-1.5 rounded-full bg-success" />

// Inline warning banner
<div role="alert" className="rounded-md border border-warning/40 bg-warning/10 p-3 text-warning">
  pending review
</div>
```

### Bad — raw colors and the dark: shadow

```tsx
// X — verbose, easy to forget the dark: variant, ignores theme calibration
<span className="border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400">
  ok
</span>

// X — picks a specific Tailwind hue when the semantics are "live"
<span className="bg-emerald-400" />

// X — inline styles for spacing / colors that map to tokens
<div style={{ padding: '10px', color: '#22c55e' }}>ok</div>
```

### When categorical colors are still OK

Some surfaces use a per-category color palette where each value has its own
identity (workflow node type, specialist tier, audit event kind). Those
are not statuses and should not be remapped onto success/warning/info — the
goal is to make them distinguishable, not to broadcast ok/not-ok. Leave
them on raw Tailwind colors and document the mapping next to the lookup
table. Examples in the codebase:

- `SpecialistsView.tsx` — `TIER_BADGE`: meeting=blue, design=purple,
  implement=emerald, review=amber, audit=rose, test=cyan, deploy=orange,
  docs=muted.
- `SpecialistsAuditPanel.tsx` — `tone` map: import=blue,
  score-applied=purple, tags-updated=cyan, score-reset=orange.
- `WorkflowGraph.tsx` — `TYPE_FILL`: per-node-type fill on the SVG nodes.

When a categorical entry happens to overlap a semantic token (add=success,
remove=destructive, prompt-revised=warning), prefer the semantic token —
it reads the same and benefits from theme tuning.

## Adding new tokens

1. **Decide whether it should be a token at all.** If only one component
   uses the color, a raw Tailwind class is fine. Tokens earn their slot
   by being reached for from several call sites.
2. **Pick the HSL triplet** for light mode and dark mode separately. Aim
   for 4.5:1 AA contrast against `--background` (light) and slate-900
   (dark). Light mode usually sits in the 36-46% lightness band; dark
   mode sits in the 56-66% band so the foreground reads on slate-900.
3. **Add it to `web/src/index.css`** under both `:root` and `.dark`, with
   a `--foreground` companion if the token will ever be used as a
   background:

   ```css
   --notice: 270 60% 45%;
   --notice-foreground: 0 0% 98%;
   ```

4. **Expose it via `web/tailwind.config.js`** in the same shape as the
   existing tokens:

   ```js
   notice: {
     DEFAULT: 'hsl(var(--notice))',
     foreground: 'hsl(var(--notice-foreground))',
   },
   ```

5. **Use it.** `bg-notice/10`, `text-notice`, `border-notice/40`, etc.,
   are now all valid Tailwind classes.

6. **Document it** in the table above and (if it replaces a common
   pattern) in a short CHANGELOG entry. If you migrated existing call
   sites, point at the version that did the sweep — future readers will
   trace from the doc to the migration commit.

## Verification

- `npm --prefix web run build` — Vite + tsc compile cleanly.
- `npm --prefix web run test` — class-name assertions in tests should
  refer to the semantic token (`bg-success`, `text-warning`), not the
  raw Tailwind class. The full suite caught the regressions when 11.62
  swept the codebase; keep that habit for future palette work.

## State primitives (1.11.78)

Three reusable components in `web/src/components/ui/` cover the three
recurring non-data states a list / card / panel renders: empty,
loading, and error. They are the only place those palette tokens
should appear at call sites — components reach for the primitive
instead of re-inlining the markup.

| Primitive | When to use | Key props |
| --- | --- | --- |
| `<EmptyState>` | "Nothing to show" — empty list, no matches, no items yet. Optional icon + optional CTA. | `icon?`, `title`, `description?`, `action?` (either `{ label, onClick }` or any ReactNode), `className?` |
| `<Skeleton>` | "Loading" — animated `bg-muted` placeholder that mirrors the shape the real data will occupy. | `variant` (`text` / `row` / `card` / `avatar` / `rect`), `width?` / `height?`, `lines?` (for the `text` variant), `className?` |
| `<ErrorState>` | "Something failed" — destructive-tinted icon + headline, optional retry button. | `title`, `description?`, `error?` (`Error` or string — message renders inline), `onRetry?`, `retryLabel?` (default `Retry`), `className?` |

Token usage:

- `EmptyState`: wrapper is `bg-card` + `border-border`; title is
  `text-foreground`, description is `text-muted-foreground`. Icon
  slot inherits `text-muted-foreground` so any lucide icon you pass
  in tones down automatically.
- `Skeleton`: every variant is `animate-pulse bg-muted` — the
  variant only changes the shape (`rounded-full` for avatars,
  `h-32` for a card placeholder, etc.). `lines={N}` on the `text`
  variant renders N stacked rows with the last one shortened to
  `w-4/5` for a more natural paragraph look.
- `ErrorState`: wrapper is `bg-card` + `border-border` (the same
  surface as `EmptyState`, so the two read as siblings); the title
  + AlertTriangle icon are `text-destructive`; the retry button is
  `bg-secondary` with `hover:bg-secondary/80`. The component sets
  `role="alert"` on the wrapper for assistive tech.

Picking the variant:

```
list of cards or chips    -> <Skeleton variant="row" /> repeated
detail card body          -> <Skeleton variant="card" />
avatar + name row         -> <Skeleton variant="avatar" /> + <Skeleton variant="text" />
multi-line paragraph      -> <Skeleton variant="text" lines={3} />
arbitrary size            -> <Skeleton variant="rect" width={...} height={...} />
```

Adoption rule of thumb: if a component renders an inline
`text-destructive` banner, an `animate-pulse rounded-md bg-muted`
strip, or a `text-muted-foreground` "empty" copy line, that is a
candidate for the primitive. The 1.11.78 sweep moved five such
sites — `WorkerList` (error + empty), `MeetingsList` (loading),
`ChatMessageLog` (backfill skeletons), `WikiSearchResults`
(loading + empty), and `SessionsListSection` (loading + empty) —
onto the primitives. Use those as patterns when migrating more.

Tests should not pin to the wrapper's raw classes (the primitives
own them and may swap palette tokens later). Prefer:

- For `EmptyState`: assert on the title / description text + the
  presence of an action button by accessible name.
- For `Skeleton`: assert the `[role="status"][aria-hidden="true"]`
  selector + the count of placeholders (use a wrapper `data-` attr
  + `aria-label` when you need the localized hint, since the
  visible text is gone in skeleton mode).
- For `ErrorState`: assert `role="alert"` is present and the
  `title` / `error` strings are in the DOM.

## Motion (1.11.80)

The c4 web UI uses Tailwind utilities plus the `tailwindcss-animate`
plugin for tasteful, accessibility-respecting motion. Three rules:

1. **Wrap every motion utility in `motion-safe:`.** Tailwind's
   `motion-safe:` variant only applies its rule inside `@media
   (prefers-reduced-motion: no-preference)`, so an operator who
   sets `prefers-reduced-motion: reduce` (vestibular disorders,
   accessibility settings) gets a still UI. Bare `animate-in` or
   `transition-*` without the prefix is a bug.
2. **Keep durations short (75-300 ms) and easings calm.** No
   bouncing / overshoot, no spring physics. The recipe used today:

   | Surface | Utility set | Duration |
   | --- | --- | --- |
   | Card / Panel mount | `motion-safe:animate-in motion-safe:fade-in motion-safe:duration-200` | 200 ms |
   | Button :active | `motion-safe:transition-transform motion-safe:duration-75 motion-safe:active:scale-95` | 75 ms |
   | Toast slide-in | `motion-safe:animate-in motion-safe:slide-in-from-right motion-safe:duration-300` | 300 ms |
   | Tab cross-fade | `motion-safe:animate-in motion-safe:fade-in motion-safe:duration-150` keyed on the active tab | 150 ms |

3. **Re-fire `animate-in` by changing a `key`, not by toggling a
   class.** `tailwindcss-animate`'s `animate-in` utility is a
   one-shot keyframe -- it fires on mount and never again. Wrap
   the content body in `<div key={activeTab}
   motion-safe:animate-in ...>` so React unmounts and remounts the
   wrapper on tab switch and the keyframe runs again. The
   top-level `App.tsx` cross-fade does this; the detail-mode
   switch inside Workers does the same with `key={detailMode}`.

The plugin is registered in `web/tailwind.config.js` via an ESM
import (`import animatePlugin from 'tailwindcss-animate'`). The
package itself is a small (~3 KB) shadcn-standard dep that ships
the `animate-in / animate-out / fade-in / fade-out /
slide-in-from-* / zoom-in / zoom-out` utilities; no JS-side
animation library is involved.

Focus rings (1.11.80):

- Interactive primitives in `web/src/components/ui/*.tsx`
  (`button`, `icon-button`, `input`, the retry button in
  `error-state`) standardise on
  `focus-visible:outline-none focus-visible:ring-2
  focus-visible:ring-primary focus-visible:ring-offset-2
  focus-visible:ring-offset-background`. Use `focus-visible`
  (keyboard focus) rather than `focus` (mouse focus) so a mouse
  click does not paint the ring.
- Non-primitive call sites (page-level `<input>`s in
  `pages/Batch.tsx`, `pages/Plan.tsx`, `pages/Swarm.tsx`,
  `components/HistoryView.tsx`, `components/StatusMessageCard.tsx`)
  still use `ring-ring`. Sweeping those onto `ring-primary` is a
  follow-up; not part of 1.11.80.

Verification:

- `vite build` (or `npm --prefix web run build` -- the tsc step
  surfaces unrelated pre-existing test-file warnings that were
  already noted in v1.11.79).
- `vitest run` -- expects 5047/5047 passing. Class-name
  assertions in primitive tests are additive (`toHaveClass(...)`)
  so adding motion-safe / focus-visible / active classes is
  non-breaking.
- Reduced-motion: Chrome DevTools -> Rendering -> "Emulate CSS
  media feature prefers-reduced-motion" -> "reduce" -> reload.
  Card mount, button press, toast appearance, and tab switch
  should all be motionless.

## Illustrations (1.11.84)

Hero illustrations live under
`web/src/components/illustrations/index.tsx` as named React
exports. The set today is four: `EmptyQueueIllustration`,
`NoWorkersIllustration`, `WelcomeOnboardingIllustration`,
`AllDoneIllustration`. They drop into `EmptyState`'s `icon` slot
and replace small lucide icons in three high-traffic sites
(Sessions empty, Workers empty, Auto queue empty).

Line-art recipe -- follow these so future illustrations feel like
one family rather than four loose icons:

- `viewBox="0 0 240 180"` -- 4:3 landscape, plenty of horizontal
  room for inbox / desk / door silhouettes.
- `stroke="currentColor"` -- the consumer paints the hue via a
  semantic palette class (typically `text-muted-foreground` from
  `EmptyState`'s built-in icon wrapper). Never set a hard stroke
  color.
- `strokeWidth={1.75}` plus `strokeLinecap="round"` and
  `strokeLinejoin="round"` on the root `<svg>`. The 1.5 to 2 range
  is enforced by the illustrations test so you cannot drift the
  weight per-illustration.
- `fill="none"` on the root so unintended fills do not leak in
  from defaults. Add fills only where you mean to.
- At most one accent fill per illustration, expressed as
  `hsl(var(--primary) / 0.15)`. The accent picks up the active
  brand colour and adapts cleanly to light vs dark themes -- never
  hard-code a hex.
- 8 to 25 shapes (path / line / circle / rect / polygon) per
  illustration. The shape-budget test in
  `illustrations.test.tsx` will fail if you blow past 25 -- that
  is on purpose; hero illustrations are read-at-a-glance, not
  technical diagrams.

Accessibility convention:

- Default to decorative: every illustration ships with
  `aria-hidden="true"` on the root `<svg>` because it is paired
  with a textual `EmptyState.title` that the screen reader will
  already announce.
- When the illustration stands alone (no neighbouring text), pass
  `aria-hidden={false}` and the component flips to `role="img"`
  with a descriptive `aria-label` baked into the component.

Adopting a new illustration in an empty state:

1. Import the named export from `../components/illustrations`.
2. Pass it to `EmptyState`'s `icon` prop with `size={160}` (or
   `size={180}` if the surrounding card has more room).
3. Add `className="text-muted-foreground"` for parity with the
   muted-icon convention -- it is redundant inside `EmptyState`
   (the wrapper already paints `text-muted-foreground`) but kept
   so the illustration tones down when used outside `EmptyState`.

## Command palette (1.11.86)

The command palette lives at `web/src/components/CommandPalette.tsx`
and is mounted globally by `HelpUIRoot`. Operators trigger it from
anywhere in the app via a single keystroke; the dialog overlays the
current page, filters as they type, and dismisses itself on
activation.

Keybinding contract:

- `Cmd+K` on macOS (`metaKey`) or `Ctrl+K` on Linux/Windows
  (`ctrlKey`) toggles the palette open. The listener fires on
  `window.keydown` so it works inside text inputs too -- operators
  expect Cmd+K to open the palette mid-typing.
- `Escape` and a backdrop click close the palette. A click on the
  inner panel does not bubble (the panel `stopPropagation`s so the
  click only closes when the backdrop is the target).
- `ArrowDown` and `ArrowUp` move the highlighted command.
- `Enter` activates the highlighted command and closes the palette.
- A mouse click on a result fires the same `run()` and closes.

Programmatic open: `import { openCommandPalette } from
'../components/HelpUIRoot'`. The helper dispatches the
`c4:command-palette-open` custom event, mirroring the
`openHelpDrawer` / `openShortcutsModal` pattern.

Dialog scaffolding (semantic palette tokens only, no raw colours):

- Backdrop: `fixed inset-0 z-50 bg-background/80 backdrop-blur`,
  plus `motion-safe:animate-in motion-safe:fade-in
  motion-safe:duration-150`.
- Panel: `bg-card border-border rounded-lg shadow-lg w-full
  max-w-lg`, plus `motion-safe:slide-in-from-top-2`.
- Active row: `bg-accent text-accent-foreground`. Idle rows hover
  to `bg-accent/40`.
- Empty state: rendered through the shared `ui/empty-state`
  primitive so the no-match branch looks like every other empty
  state in the app.

Adding a new command:

1. Open `web/src/components/command-palette/commands.ts`.
2. Append the entry into the matching section array
   (`workers` or `queue`) or extend `FEATURES` directly if it is a
   new page. The shape is `{ id, label, hint?, section, Icon, run
   }`. `Icon` is a lucide-react component. `run` is fire-and-
   forget; closing the palette is the consumer's job, so a `run`
   that posts to an API should not await.
3. Update `commands.test.ts` to lock the new ID into the catalog
   assertions if the entry is canonical.

Adding a new section:

1. Extend the `CommandSection` union and the `SECTION_ORDER`
   array so the section renders in the documented order.
2. Update the section header ordering test in
   `CommandPalette.test.tsx` so a future drift on the order shows
   up immediately.

The fuzzy matcher (`match` + `filterCommands` in the same file) is
intentionally tiny -- no new dependency. Substring beats acronym,
prefix substring beats non-prefix substring, ties break by label
ascending. Case insensitive on both sides.

## Dark mode audit (1.11.87)

The semantic palette pays for itself only when every chrome surface
reaches for it. Before merging a PR that adds a status-style surface,
run the same audit the v1.11.87 sweep used to scrub the few
remaining raw-hue holdouts:

### Grep recipe

```bash
# 1. Pure black / pure white on chrome (almost always wrong).
grep -rnE '\b(bg|text|border)-(white|black)\b' web/src --include='*.tsx'

# 2. Tailwind neutral families on chrome (gray / slate / neutral /
#    zinc / stone, NNN = 50/100/200/300/400/500/600/700/800/900).
grep -rnE '\b(bg|text|border)-(gray|slate|neutral|zinc|stone)-(50|100|200|300|400|500|600|700|800|900)' \
  web/src --include='*.tsx'

# 3. Status hues paired with a `dark:` variant -- the canonical
#    "this should be a semantic token" smell. The pair was the
#    pre-1.11.77 way to spell ok/warning/info/error.
grep -rnE '\b(emerald|amber|rose|orange|blue|sky|red|green)-(400|500|600|700)\b' \
  web/src --include='*.tsx' | grep -v test.tsx
```

A clean run produces only the intentional sites listed below.

### Decide: semantic or categorical

| Question | If yes -> | If no -> |
| --- | --- | --- |
| Is this an ok / warning / info / error tone? | semantic token (`success`/`warning`/`info`/`destructive`) | continue |
| Is this a fixed-overlay dim layer (modal backdrop, tour scrim)? | leave as `bg-black/{30,50}` -- intentional regardless of theme | continue |
| Is this color identifying *which* item it is (kind / tier / role / tag)? | categorical -- raw Tailwind hue is fine, document the mapping next to the lookup table | continue |
| Is this a gradient slot the semantic palette does not cover (e.g. risk "high" between `warning` and `destructive`)? | raw hue OK, note it in the audit prose so future PRs do not "fix" it | rare -- file a token RFC before merging |

### Intentional raw-hue sites (post-1.11.87)

- `web/src/components/AttachModal.tsx` + `SessionsTour.tsx` --
  `bg-black/{30,50}` modal backdrops. Dim overlay is theme-neutral.
- `web/src/components/WorkflowNodeProperties.tsx` -- `text-white`
  on an inline-styled colored badge. Contrast is on the fill, not
  the theme background.
- `web/src/components/SpecialistsView.tsx` `TIER_BADGE`,
  `SpecialistsAuditPanel.tsx` `tone` map, `MeetingsList.tsx`
  fork-of marker, `SpecialistsList.tsx` veto + tag chips --
  categorical (per-item identity).
- `web/src/pages/Risk.tsx` + `RiskRuleCatalogPanel.tsx`
  `LEVEL_TONE.high` -- orange-500 is an intermediate severity
  between `warning` and `destructive`; semantic palette has no
  matching slot.
- `web/src/lib/snippet.ts` -- search-hit highlight (amber-500/20).
  Highlight is a visual cue, not a status.

### AccountMenu theme switcher recipe

The 1.11.87 `AccountMenu` ships with a Toggle theme row that
demonstrates the motion-safe re-mount pattern for future icon
animations:

```tsx
import { Sun, Moon, Monitor } from 'lucide-react';

export const THEME_ICON_ANIM_CLASS =
  'inline-flex motion-safe:animate-in motion-safe:spin-in-180 ' +
  'motion-safe:zoom-in-95 motion-safe:duration-300';

function themeIconFor(theme: ThemeMode) {
  if (theme === 'light') return Sun;
  if (theme === 'dark') return Moon;
  return Monitor;
}

// In the menu item:
<span key={theme} data-theme={theme} className={THEME_ICON_ANIM_CLASS}>
  {(() => { const Icon = themeIconFor(theme); return <Icon className="h-4 w-4" />; })()}
</span>
```

`key={theme}` is doing all the work -- React unmounts the previous
span and mounts a fresh one on every toggle, which re-runs the
`motion-safe:animate-in` enter animation. `motion-safe:` keeps the
animation off the `(prefers-reduced-motion: reduce)` cohort. No
state slot, no `setTimeout` cleanup, no animation library beyond
`tailwindcss-animate`.

To wire the row at a new call site, thread `theme` + `onThemeChange`
from `useTheme()` (already centralized in `web/src/lib/use-theme.ts`)
through the host. `AccountMenu` keeps both props optional -- when
either is missing the Theme row hides, which is how the existing
unit tests that pre-date 1.11.87 keep their menu-order assertions
green.

## Typography (1.11.88)

The c4 web UI exposes a named type scale at
`web/src/lib/typography.ts`. Every entry is a Tailwind class string
combining font-size, line-height, tracking, and weight, so call
sites stop spelling out the same trio of utility classes at every
heading and body block. Reach for `text.h1` / `text.body` / etc.
instead of `text-3xl leading-10 font-semibold` -- the named scale
stays calibrated even if the underlying utility values shift later.

### Named scale

| Key | Tailwind classes | Pixels (size / line-height) | Intent |
| --- | --- | --- | --- |
| `display` | `text-4xl leading-[3rem] tracking-tight font-semibold` | 36 / 48 | Hero / marketing surface (not used yet in chrome). |
| `h1` | `text-3xl leading-[2.5rem] tracking-tight font-semibold` | 30 / 40 | Top-level page heading when a page wants more weight than `CardTitle`. |
| `h2` | `text-2xl leading-8 font-semibold` | 24 / 32 | Major in-card section heading. |
| `h3` | `text-xl leading-7 font-medium` | 20 / 28 | In-card subsection heading (the most-adopted entry today). |
| `body` | `text-base leading-6` | 16 / 24 | Default body copy. |
| `bodySm` | `text-sm leading-5` | 14 / 20 | Dense body copy (tables, descriptions, inline forms). |
| `caption` | `text-xs leading-4 text-muted-foreground` | 12 / 16 | Hint / metadata / muted timestamp. `text-muted-foreground` baked in. |
| `mono` | `font-mono text-sm leading-5` | 14 / 20 | Code spans, branch names, identifiers. |

The 9-case vitest suite at `web/src/lib/typography.test.ts` pins
the contract: every entry has a `text-*` and a `leading-*` class,
`text.h1` / `h2` / `h3` / `display` each carry a font-weight,
`text.caption` includes `text-muted-foreground`, `text.mono`
includes `font-mono`, and an inline snapshot locks the full object
so a rename or value drift surfaces immediately.

### 8 px baseline grid + plugin

Line-heights snap to multiples of 8 wherever the type size allows
(display 48, h1 40, h2 32, body 24, caption 16) so adjacent surfaces
-- a card header above a stat row, a section heading above a list --
align vertically without per-component padding fudges. Two
intentional exceptions live in the JSDoc:

- `text.h3` -> 20 / 28. 28 px is `3.5 * 8` (half-step, not full).
  A 32 px line-height would make h3 indistinguishable from h2; a
  24 px line-height under-spaces 20 px ascenders.
- `text.bodySm` / `text.mono` -> 14 / 20. 20 px is *not* on the
  8 px grid. 14 px text below 1.4x crowds descenders; pushing to
  24 px makes dense tables and inline code blocks feel airy.
  Pages that stack `bodySm` next to `body` should add `space-y-*`
  padding to recover the grid.

`web/tailwind.config.js` registers a tiny `baselinePlugin` (~10 lines
including JSDoc) that defines `--baseline-step` (default 8 px) on
`:root` and exposes a `.baseline` utility class:

```css
.baseline { line-height: var(--baseline-step); }
```

Use `.baseline` on prose-heavy blocks where the named scale does not
fit (long-form markdown, dynamic content) so adjacent surfaces still
snap to the same vertical grid. The named scale is the default; the
plugin is the escape hatch.

### Usage

```tsx
import { cn } from '../lib/cn';
import { text } from '../lib/typography';

// Section heading inside a panel
<h3 className={cn('mb-2 flex items-center gap-2 text-foreground', text.h3)}>
  Configuration
</h3>

// Muted hint (text-muted-foreground baked in)
<div className={text.caption}>
  Last refreshed 12s ago
</div>

// Code span with the named mono rhythm
<span className={cn(text.mono, 'text-foreground')}>{worker.branch}</span>

// Composing with extra utilities -- twMerge picks the last one for
// conflicting groups (font-weight, font-family, etc.), so put the
// override AFTER the named class.
<span className={cn(text.caption, 'font-mono')}>{configPath}</span>
```

### Adoption rule of thumb

- **Page-level section heading** (`<h3>` inside a panel) -> `text.h3`.
- **Page title** -- leave to `PageFrame`'s `CardTitle` for now; the
  shared header surface is a future calibration target, not a per-page
  adoption.
- **Body paragraph / markdown wrapper** -> `text.body` (16 px) or
  `text.bodySm` (14 px) depending on density.
- **Muted hint / metadata / timestamp** -> `text.caption` (already
  carries `text-muted-foreground`).
- **Branch name / identifier / code span** -> `text.mono`.
- **Dense chrome** -- queue rows, table cells, badge / chip text,
  stat-card label rows (`text-xs uppercase tracking-wide
  text-muted-foreground`), Panel `text-[10px]` / `text-[11px]` /
  `text-[12px]` surfaces: **skip**. The named scale is for
  page-level rhythm; these are intentionally non-scale (see the
  v1.11.88 CHANGELOG for the per-page skip list).

### Adding a new size

1. Decide whether the new size earns a slot. The scale is small on
   purpose -- one entry per visual role. Reach for an existing
   entry first; a slightly off-spec heading is fine if it stays in
   the family.
2. If the size is new, add it to the `text` object in
   `web/src/lib/typography.ts` with the same shape
   (`'text-? leading-? ... font-?'`) and document the line-height
   choice in the JSDoc above the export. If the line-height is not
   on the 8 px grid, write down why.
3. Extend the inline snapshot in
   `web/src/lib/typography.test.ts` so vitest pins the new entry.
   Add a per-entry assertion only if the new entry violates the
   shared invariants (text-* utility, leading-* utility, etc.).
4. Adopt the new size in at least one call site before merging --
   the value of a named entry is that consumers stop spelling it
   out at the call site.
5. Update the table above (and the JSDoc on the relevant Tailwind
   classes if you also extend the tailwind theme).

