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
