# TODO 8.22 — UX visual regression + terminal auto-fit fix

Branch: `c4/ux-visual` (auto-created by c4 worker spawn).
Base off `main` (which now has 8.17-8.20 shipped).

Two things land in this task. Ship P1 fully before P2.

---

## P1 — Terminal auto-fit regression (MUST LAND)

User report 2026-04-20: `auto-fit` in `web/src/components/WorkerDetail.tsx`
does not produce correct cols / does not call `/api/resize`, so the
terminal still renders wrapped lines from the server's default 160-col
PTY.

### Investigate

1. In `WorkerDetail.tsx`, trace the auto-fit effect:
   - ResizeObserver callback path.
   - Char-width measurement (hidden ruler span + `getBoundingClientRect`).
   - Debounce (120ms) + dedupe ref.
   - The `POST /api/resize` call (via `apiPost` from `lib/api.ts`).
2. Add a `console.debug('[autofit] cols=%d rows=%d → POST /api/resize',
   cols, rows)` line behind a one-line debug toggle (`VITE_AUTOFIT_DEBUG`
   env in `web/.env.local`, default off). Leave the toggle in place so
   future regressions can be diagnosed.
3. Confirm the observer fires on mount, font-size change, and window
   resize (120ms debounce). If ResizeObserver never fires, switch to
   `window.addEventListener('resize')` + `ResizeObserver` both wired;
   some mobile Safari builds don't deliver ResizeObserver on the
   <main> flex child.

### Fix

Whichever of the following are actually broken — fix them:

- **Char-width measurement**: Use an off-DOM ruler whose `visibility:hidden`
  + `position:absolute` matches the terminal `<pre>` font-family /
  font-size / letter-spacing. Re-measure when font-size changes. Return
  `Math.floor(preInnerWidth / ch)`; clamp to the daemon's `_clampResizeDims`
  range (20..400 cols). Never pass 0.
- **POST path**: Confirm the apiPost uses `/api/resize` (not bare `/resize`)
  after 8.19's `withApiPrefix` refactor. Log the exact URL in the debug
  line.
- **Scrollback re-flow**: `src/screen-buffer.js`'s `resize(cols, rows)`
  only trims/pads on the active grid — scrollback lines keep the old
  wrap. If the user shrinks the viewport, the old wide lines still
  render wrapped on the client. Teach `resize` to re-flow scrollback
  so historical lines re-wrap at the new cols (or document that the
  limitation is intentional + add a one-line comment).
- **Client debounce**: 120ms is probably right, but verify there's no
  re-entrancy — ref-based dedupe should skip identical (cols, rows).

### Verify manually

- 2000px-wide viewport → cols ≈ 240 at 13px monospace.
- 600px-wide viewport → cols ≈ 80.
- Toggle font-size +/−; cols recalculates proportionally.
- Network panel shows at most one `POST /api/resize` per debounce window.

---

## P2 — Puppeteer screenshot-based visual validation (MUST LAND)

Extend the existing 8.20-era `tools/ux/explore.mjs`. It already logs in,
visits every page, captures `console.error` + 4xx + role=alert, writes
`patches/ui-audit-<date>/ui-audit-report.json`. It does NOT verify the
pixels.

Add a `visual` section to the report covering:

### 1. Per-viewport screenshot sweeps

Viewports to sweep (for P2; P3 in 8.23 adds mobile devices):

```js
const VIEWPORTS = [
  { name: 'desktop-xl', width: 1920, height: 1080 },
  { name: 'desktop-md', width: 1366, height: 768 },
  { name: 'tablet',     width: 1024, height: 768 },
];
```

For each viewport × each page, write a PNG into
`patches/ui-audit-<date>/screens/<viewport>-<page>.png`. Keep
filenames stable so diffs across runs are easy.

### 2. Overflow detection

After `page.goto` and a layout-settle wait, run (in-page):

```js
() => {
  const bad = [];
  document.querySelectorAll('*').forEach((el) => {
    const r = el.getBoundingClientRect();
    if (r.right > window.innerWidth + 1) bad.push({
      tag: el.tagName, class: el.className, right: r.right, vw: window.innerWidth
    });
  });
  return bad.slice(0, 20);
}
```

Record the count + first 20 offenders per (viewport, page) in the
report.

### 3. Text-clipping detection

Same pattern, looking for `scrollWidth > clientWidth` on elements with
`overflow: hidden` OR `text-overflow: ellipsis`. Capture element text
(truncated to 80 chars) so operators can eyeball which labels are cut.

### 4. Baseline diff (SSIM)

Install `pixelmatch` + `pngjs` in `tools/ux/package.json` (zero
runtime impact on the main app; this is a dev tool). When a prior
baseline exists at `patches/ui-audit-baseline/<viewport>-<page>.png`,
compare the new PNG and flag any page with > 0.5% pixel diff. First
run writes baselines into `patches/ui-audit-baseline/` and reports
`baseline: 'captured'`.

### 5. Terminal-view specific checks

While auditing the workers page, programmatically select a worker that
exists (the daemon's worker list / create a throwaway one if empty),
toggle `auto-fit` on, resize the viewport to 2000px then 600px, and
capture the `cols` value reported by the auto-fit UI. Write both samples
to the report so 8.22 P1 has a regression-test anchor.

### 6. Report shape

Append a `visual` key to `ui-audit-report.json`:

```json
{
  "visual": {
    "viewports": ["desktop-xl", "desktop-md", "tablet"],
    "pages": ["/", "/features", "/sessions", ...],
    "overflow":   [{ viewport, page, count, sample: [...] }],
    "clipping":   [{ viewport, page, count, sample: [...] }],
    "diff":       [{ viewport, page, percent, flagged: bool }],
    "autofit":    { before2000: { cols, rows }, after600: { cols, rows } }
  }
}
```

---

## P3 — Out of scope

Mobile device emulation (iPhone 13 / iPhone SE / Galaxy S20 / iPad mini
portrait + landscape) is TODO 8.23, a separate worker. Do NOT implement
it here — 8.23 will extend the same report structure.

---

## Tests

`tests/ux-visual.test.js`:

- Source-grep `tools/ux/explore.mjs` for viewport constant, overflow
  detector string, `text-overflow: ellipsis` detector, pixelmatch
  import, baseline path, autofit anchor. No live browser in tests —
  everything stays source-level, same pattern as 8.20B.
- Source-grep `tools/ux/package.json` for pixelmatch + pngjs deps.
- `web/src/components/WorkerDetail.tsx` source-grep for VITE_AUTOFIT_DEBUG
  + /api/resize path + clamp bounds.
- If you re-flow scrollback in `src/screen-buffer.js`, add one real
  unit test in `tests/screen-buffer-resize.test.js` covering the new
  re-flow behaviour.

Full suite must stay 105 / 105 + new tests.

---

## Docs

- `docs/patches/8.22-ux-visual.md` — what changed, how to run
  `node tools/ux/explore.mjs`, where screenshots land, how to
  regenerate baselines.
- TODO.md: flip 8.22 to **done** with a compact summary row (match
  the existing Phase 8 format).
- CHANGELOG.md: `[Unreleased]` section — Fixed + Added entries.

---

## Rules

- Branch: `c4/ux-visual` (will be auto-created). Base off `main`.
- Never merge yourself — the manager merges.
- No compound bash (`&&`, `|`, `;`) — `git -C`, separate commands.
- Worker routine: implement → `npm test` → docs → commit → push.
- If spec has ambiguity, make the call, record it in the patch note.
- Do NOT touch 8.21 or 8.23 scope.

Start with P1 (auto-fit debug + fix), then P2 (puppeteer visual), then
tests + docs + commit.
