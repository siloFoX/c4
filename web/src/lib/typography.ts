/**
 * Named typography scale for the c4 web UI.
 *
 * Every entry is a Tailwind class string combining font-size, line-height,
 * tracking, and weight so call sites stop spelling out the same trio of
 * utility classes at every heading and body block. Reach for `text.h1`
 * etc. instead of `text-3xl leading-10 font-semibold` -- the named scale
 * stays calibrated even if the underlying utility values shift later.
 *
 * The line-heights are tuned to snap onto an 8 px baseline grid wherever
 * the type size makes that feasible (display 36/48, h1 30/40, h2 24/32,
 * body 16/24, caption 12/16). The grid keeps adjacent surfaces -- a card
 * header above a stat row, a section heading above a list -- aligned
 * vertically without per-component padding fudges.
 *
 * Trade-offs called out:
 * - `h3` -> 20/28. 28 px is 3.5 * 8 -- on the half-step rather than a
 *   full step. We accept it because the 20 px size needs at least
 *   1.4x line-height to read comfortably and the next full step
 *   (32 px) makes h3 look like h2.
 * - `bodySm` / `mono` -> 14/20. 20 px is *not* on the 8 px grid. We
 *   accept it because 14 px text below 1.4x line-height (e.g. 16 px)
 *   crowds descenders, and pushing to 24 px makes dense tables and
 *   inline code blocks feel airy. Pages that stack `bodySm` next to
 *   `body` should add `space-y-*` padding to recover the grid.
 *
 * The companion 8 px baseline plugin in `web/tailwind.config.js` adds a
 * `.baseline` utility class and exposes the step as `--baseline-step`
 * so future utilities can reach for the same constant.
 */
export const text = {
  display: 'text-4xl leading-[3rem] tracking-tight font-semibold',
  h1:      'text-3xl leading-[2.5rem] tracking-tight font-semibold',
  h2:      'text-2xl leading-8 font-semibold',
  h3:      'text-xl leading-7 font-medium',
  body:    'text-base leading-6',
  bodySm:  'text-sm leading-5',
  caption: 'text-xs leading-4 text-muted-foreground',
  mono:    'font-mono text-sm leading-5',
} as const;

export type TextScaleKey = keyof typeof text;
