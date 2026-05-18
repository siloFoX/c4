import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { getPortalRoot } from '../../lib/portal-root';
import type { PortalRootId } from '../../lib/portal-root';

// (v1.11.318, TODO 11.300) Portal -- canonical wrapper around
// react-dom `createPortal` that funnels every overlay surface
// (Toast, Dialog, Drawer, CommandPalette, Tooltip, Popover, etc)
// through a single SSR-safe lazy-mount path.
//
// The pre-existing `getPortalRoot` helper in
// `web/src/lib/portal-root.ts` already centralises the
// "create-or-reuse the named #toast-root / #dialog-root /
// #popover-root div under document.body" policy. The Portal
// primitive layers two more guarantees on top:
//
//   1. SSR-safe lazy mount: the first render returns null
//      (the portal target is not derived during the SSR pass
//      or the first client render -- only inside a
//      `useEffect`). This avoids the canonical
//      `document is not defined` crash and the hydration
//      mismatch when the server output (no portal child) is
//      compared against the client output (portal mounted).
//   2. `disabled` opt-out: when callers need their children
//      to render inline for testing or progressive
//      enhancement, `disabled={true}` short-circuits the
//      portal and renders the children where the Portal
//      element sits in the tree.
//
// Custom containers are supported via either:
//   - `containerId` -- the well-known portal root id
//     ('toast-root' / 'dialog-root' / 'popover-root' /
//      'dropdown-root' / 'app-portal-root' / etc). The
//     id is created lazily on first call and reused on
//     subsequent calls (the helper is idempotent).
//   - `container` -- an explicit HTMLElement reference
//     (escape hatch for tests, Shadow DOM, or callers that
//     have computed their own target).
//
// Both forms are mutually exclusive at the call site; if both
// are provided, the explicit `container` wins.

export interface PortalProps {
  // Children to portal. Required because a Portal with no
  // children is a no-op the consumer should not bother
  // mounting.
  children: ReactNode;
  // Named portal target. Defaults to 'app-portal-root', which
  // is the canonical mount point for "any overlay" that does
  // not need its own dedicated root.
  containerId?: PortalRootId;
  // Explicit DOM target. When provided, takes precedence over
  // `containerId`. Use this for tests that supply a custom
  // div, or for Shadow DOM mounts. Passing `null` (e.g.
  // before a ref attaches) is treated the same as
  // "not ready yet" and the portal will not mount until the
  // value becomes a live HTMLElement.
  container?: HTMLElement | null;
  // When true, the children render inline at the Portal's
  // location in the tree (no createPortal call). Useful for
  // tests that want to assert on the children inside a
  // specific container, and for progressive enhancement when
  // the portal target is intentionally unavailable.
  disabled?: boolean;
}

export function Portal({
  children,
  containerId = 'app-portal-root',
  container,
  disabled = false,
}: PortalProps) {
  // The portal target is resolved inside `useEffect` so:
  //   - The SSR pass returns `null` (no document available).
  //   - The first client render also returns `null`, which
  //     matches the SSR output and avoids the hydration
  //     mismatch warning.
  //   - Only the second client render (after the effect
  //     runs) materialises the portal.
  const [target, setTarget] = useState<HTMLElement | null>(null);

  useEffect(() => {
    if (disabled) {
      setTarget(null);
      return undefined;
    }
    if (container !== undefined) {
      // Caller-supplied explicit target wins. `null` is a
      // legitimate "not yet" state and we honour it.
      setTarget(container);
      return undefined;
    }
    setTarget(getPortalRoot(containerId));
    return undefined;
  }, [container, containerId, disabled]);

  if (disabled) {
    // Render inline. Wrapping in a Fragment keeps the
    // primitive transparent (no extra DOM element).
    return <>{children}</>;
  }

  if (!target) {
    // Lazy mount: nothing to render until the effect resolves
    // the target. Returning null preserves the SSR contract.
    return null;
  }

  return createPortal(children, target);
}

Portal.displayName = 'Portal';
