# TODO 8.23 — Mobile UI audit (puppeteer device emulation)

Branch: `c4/mobile-audit` (auto-created by c4 worker spawn).
Base off `main` (which now has 8.22 ux-visual shipped).

Extend the 8.22 `tools/ux/explore.mjs` visual pass with mobile-device
emulation. **Do NOT rewrite 8.22 scope** — read the existing
`VIEWPORTS_VISUAL` / `VISUAL_PAGES` / `detectOverflow` / `detectClipping`
/ baseline-diff logic first, then slot mobile beside it.

---

## P1 — Mobile viewport sweep (MUST LAND)

Add a second viewport array, emulated via puppeteer's `KnownDevices`
(`puppeteer.KnownDevices['iPhone 13']` etc) so device pixel ratio +
user agent + touch-enabled flags match real devices, not just the
resize.

```js
import puppeteer, { KnownDevices } from 'puppeteer';

const MOBILE_DEVICES = [
  { id: 'iphone-13',      device: KnownDevices['iPhone 13'] },
  { id: 'iphone-se',      device: KnownDevices['iPhone SE'] },
  { id: 'galaxy-s20',     device: KnownDevices['Galaxy S20'] },
  { id: 'ipad-mini',      device: KnownDevices['iPad Mini'] },
];

const ORIENTATIONS = ['portrait', 'landscape'];
```

For each (device × orientation × page in `VISUAL_PAGES`), write a PNG
into `patches/ui-audit-<date>/mobile/<device>-<orientation>-<page>.png`.

Landscape: swap width / height on the emulated viewport after
`page.emulate(device)`:
```js
await page.setViewport({
  width: device.viewport.height,
  height: device.viewport.width,
  deviceScaleFactor: device.viewport.deviceScaleFactor,
  isMobile: true,
  hasTouch: true,
  isLandscape: true,
});
```

Keep filenames stable so future diffs are easy. Re-use the P2 baseline
diff mechanism under `patches/ui-audit-baseline/mobile/` with the same
0.5% threshold.

---

## P2 — Mobile-specific checks (MUST LAND)

In-page on each mobile run, capture the following and record under
`mobile.checks[<device>-<orientation>-<page>]`:

### 1. Horizontal overflow

Same `detectOverflow` pattern as 8.22 P2 — any element whose
`getBoundingClientRect().right > window.innerWidth + 1`. Critical on
mobile because horizontal scroll is a P0 layout bug. Capture first 20.

### 2. Touch target size

Mark any interactive element whose bounding box is smaller than the
iOS/Android guideline (44x44 CSS pixels). Interactive =
`button, a[href], [role="button"], input, [role="link"],
[tabindex]:not([tabindex="-1"])`. Skip hidden (`offsetParent === null`)
elements.

```js
() => {
  const SELECTOR = 'button, a[href], [role="button"], input, [role="link"], [tabindex]:not([tabindex="-1"])';
  const bad = [];
  document.querySelectorAll(SELECTOR).forEach((el) => {
    if (el.offsetParent === null) return;
    const r = el.getBoundingClientRect();
    if (r.width < 44 || r.height < 44) {
      bad.push({
        tag: el.tagName,
        class: (el.className || '').toString().slice(0, 80),
        w: Math.round(r.width),
        h: Math.round(r.height),
        text: (el.textContent || '').trim().slice(0, 40),
      });
    }
  });
  return bad.slice(0, 30);
}
```

### 3. Minimum font size

Flag any visible text node whose computed `font-size` is under 14px.
Walk the DOM (`TreeWalker.SHOW_TEXT`), skip empty/whitespace-only nodes,
capture up to 20 samples with element tag + class + text (80-char cap)
+ resolved size.

### 4. Hover-only affordances

Grep the `getMatchedCSSRules` equivalent (serialize stylesheet rules at
page load — puppeteer has no direct API; use `document.styleSheets`
walk, catch CORS with `try/catch`) for selectors with `:hover` that
change visibility / display / opacity. Cross-reference with elements
that have no non-hover affordance (e.g. tooltip-only labels). This is
best-effort — record matches, don't block on it.

### 5. Soft-keyboard probe

For the `/`, `/workflows`, `/settings` pages, focus the first
`<input>` or `<textarea>` via `page.focus(selector)`, then measure
`window.visualViewport.height` before + after focus. If the focused
element's bounding box intersects the obscured region (height drop),
record it. Skip if the page has no input. Only run on the largest
portrait device per family (iPhone 13, Galaxy S20) to cut runtime.

### 6. Long-text truncation

Already covered by 8.22's `detectClipping` (scrollWidth > clientWidth
on `text-overflow: ellipsis` / `overflow: hidden`). Re-use verbatim —
store results under `mobile.clipping` separate from the desktop
clipping array.

---

## P3 — Report shape

Append a `mobile` key to `patches/ui-audit-<date>/ui-audit-report.json`
alongside 8.22's existing `visual` key:

```json
{
  "visual": { ... 8.22 desktop/tablet ... },
  "mobile": {
    "devices": ["iphone-13", "iphone-se", "galaxy-s20", "ipad-mini"],
    "orientations": ["portrait", "landscape"],
    "pages": ["/", "/workers", "/chat", "/history", "/workflows", "/features", "/sessions", "/settings"],
    "overflow":      [{ device, orientation, page, count, sample: [...] }],
    "touchTargets":  [{ device, orientation, page, count, sample: [...] }],
    "smallFonts":    [{ device, orientation, page, count, sample: [...] }],
    "hoverOnly":     [{ device, orientation, page, count, sample: [...] }],
    "softKeyboard":  [{ device, page, viewportBefore, viewportAfter, obscured: bool }],
    "clipping":      [{ device, orientation, page, count, sample: [...] }],
    "diff":          [{ device, orientation, page, percent, flagged: bool }]
  }
}
```

---

## P4 — Performance / runtime guard

4 devices × 2 orientations × 8 pages = 64 screenshots + checks, on top
of 8.22's 24. The mobile pass MUST run after the existing
desktop/tablet pass so a mobile failure cannot swallow the functional
report. Share the same browser instance across devices — call
`page.emulate(device)` + `setViewport` between iterations; don't spin a
fresh `puppeteer.launch` per device.

Add a `--skip-mobile` CLI flag on `tools/ux/explore.mjs` so the
existing 8.22 desktop pass can still run stand-alone during dev. Flag
parsing stays minimal (check `process.argv.includes('--skip-mobile')`).

---

## Tests

`tests/mobile-audit.test.js` — source-grep only, same pattern as
ux-visual (105/105 + 1 was the 8.22 delta, stay the course here):

- `tools/ux/explore.mjs`: `MOBILE_DEVICES` array, `KnownDevices` import,
  `ORIENTATIONS` array, touch-target detector string (44 constant),
  small-font detector (14 constant), `isMobile: true`, `hasTouch: true`,
  `--skip-mobile` flag, `mobile` key in report.
- `patches/ui-audit-baseline/mobile/` path referenced from baseline
  logic.
- `tools/ux/package.json`: no new deps expected (puppeteer already
  depended on for 8.22) — if you do add one, source-grep it.

Full suite must stay **106 / 106 + 1 new file = 107 / 107**.

---

## Docs

- `docs/patches/8.23-mobile-audit.md` — what changed, device list,
  how to run (`node tools/ux/explore.mjs` vs `--skip-mobile`),
  report additions, screenshot output paths.
- `TODO.md`: flip 8.23 to **done** with a compact summary row
  matching the Phase 8 format.
- `CHANGELOG.md`: `[Unreleased]` section — Added entry for mobile
  device emulation + mobile-specific checks.

---

## Rules

- Branch: `c4/mobile-audit` (will be auto-created). Base off `main`.
- Never merge yourself — the manager merges.
- No compound bash (`&&`, `|`, `;`) — `git -C`, separate commands.
- Worker routine: implement → `npm test` → docs → commit → push.
- If spec has ambiguity, make the call, record it in the patch note.
- Do NOT touch 8.21 or 8.22 scope (both already shipped on main).
- Use `/root/c4-worktree-mobile-audit` worktree.

Start with P1 (mobile viewports + screenshots), then P2 (mobile checks),
then P3 (report shape), then P4 (flag + perf), then tests + docs +
commit.
