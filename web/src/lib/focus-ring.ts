// focus-ring.ts -- canonical focus-visible ring class
// strings.
//
// (v1.11.360, TODO 11.342) The c4 web app has a
// consistent visual contract for keyboard focus:
// every focusable surface renders the design-system
// `--ring-primary` color as a 2px outline that sits
// 2px outside the surface (offset) so the ring does
// not overlap the surface's own border.
//
// Most UI primitives inline the class string
// (`focus-visible:outline-none focus-visible:ring-2
//  focus-visible:ring-primary
//  focus-visible:ring-offset-2
//  focus-visible:ring-offset-background`). Re-typing
// the literal in every primitive (1) bloats source
// files, (2) makes it harder to update the global
// contract when the design system evolves, and (3)
// gives no central place to assert "every focusable
// element has SOME focus-visible ring".
//
// This module exposes the canonical class strings as
// exported constants. Adopters can either import the
// constant directly or keep using the inline form --
// both forms satisfy the v1.11.342 focus-ring audit.

// (v1.11.343, TODO 11.325) Originally introduced as
// `APP_SHELL_FOCUS_RING` exported from
// `components/layout/AppShell.tsx`. The constant lives
// here now so non-shell adopters do not need to depend
// on a layout primitive. The AppShell re-export still
// works.
//
// Canonical form:
//   - 2px ring outside the surface (`ring-2 +
//     ring-offset-2`).
//   - `ring-primary` color (the design system's
//     accent).
//   - `ring-offset-background` so the offset
//     gap matches the page background and does not
//     leak surface color through.
//   - `outline-none` so the browser's default outline
//     does not stack with our ring.
export const FOCUS_RING_DEFAULT =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background';

// (v1.11.360, TODO 11.342) Inset variant. Useful for
// elements where the outset ring overflows a parent
// (compact list rows, sticky table headers, dense
// toolbar buttons). Same color + thickness, no
// `ring-offset-*` -- the ring sits exactly on the
// surface edge.
export const FOCUS_RING_INSET =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-inset';

// (v1.11.360, TODO 11.342) Subtle variant for
// surfaces that already have heavy chrome (Dialog
// inner buttons, popover content) where the
// full-thickness primary ring would compete with the
// surface. Half-opacity primary, 1px instead of 2px.
export const FOCUS_RING_SUBTLE =
  'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary/50 focus-visible:ring-offset-1 focus-visible:ring-offset-background';

// (v1.11.360, TODO 11.342) Compatibility alias for
// the v1.11.343 AppShell export. New code should
// import `FOCUS_RING_DEFAULT`; the alias preserves
// the old import path during the rollout.
export const APP_SHELL_FOCUS_RING = FOCUS_RING_DEFAULT;
