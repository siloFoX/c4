// portal-root.ts -- canonical portal mount-point helper.
//
// (v1.11.322, TODO 11.304) This module is the single source
// of truth for portal target DOM nodes. Every component that
// renders through `createPortal` (Toast, Dialog, Drawer,
// CommandPalette, Tooltip, Popover, ContextMenu) -- or, more
// commonly now, through the v1.11.318 `<Portal>` primitive
// in `components/ui/portal.tsx` -- ultimately asks this
// module for its mount node so the policy (lazy creation,
// idempotent reuse, attribute tagging, SSR-safe null,
// per-root decoration) stays in one place.
//
// ## Canonical pattern
//
// Three call shapes are supported, listed in increasing
// order of customisation:
//
//   1. The `<Portal>` primitive (preferred for new code):
//      ```tsx
//      <Portal containerId="toast-root">{content}</Portal>
//      ```
//      The primitive handles SSR-safe lazy mount, idempotent
//      reuse, and `data-portal-root="true"` tagging.
//
//   2. `getPortalRoot(id)` for callers that need the raw
//      element (legacy `react-dom` `createPortal` call
//      sites or imperative DOM operations):
//      ```ts
//      const root = getPortalRoot('toast-root');
//      if (root) createPortal(content, root);
//      ```
//      Returns `null` in SSR or when `document.body` is
//      missing.
//
//   3. `definePortalRoot(id, descriptor)` when the named
//      root needs persistent decoration (positioning class,
//      `data-*` markers, ARIA role, etc) applied
//      idempotently on first creation:
//      ```ts
//      const getToastRoot = definePortalRoot('toast-root', {
//        className: 'pointer-events-none fixed right-4 top-4 z-50 ...',
//        attributes: { 'data-toast-root': 'true' },
//      });
//      ```
//      The returned getter wraps `getPortalRoot(id)` and
//      applies the decoration exactly once per page. The
//      sentinel attribute (default `data-decorated-${id}`)
//      makes the decoration step idempotent so repeated
//      `getRoot()` calls do not re-stamp the className on
//      every render.
//
// All three forms produce the same DOM shape so e2e
// selectors (`#toast-root`, `[data-portal-root="true"]`,
// `[data-toast-root="true"]`) stay stable regardless of
// which call shape the call site uses.

let warnedAboutMissingBody = false;

// Well-known portal root ids. Extending this union (via
// `string & {}`) lets call sites pass arbitrary id strings
// while still getting IntelliSense for the canonical ones.
export type PortalRootId =
  | 'toast-root'
  | 'dialog-root'
  | 'popover-root'
  | 'dropdown-root'
  | 'app-portal-root'
  | (string & {});

// Optional decoration applied to a portal root on first
// creation. Used by `definePortalRoot` and the optional
// 2nd-arg overload of `getPortalRoot`.
export interface PortalRootDescriptor {
  // Tailwind / utility class string applied to the root
  // element on first creation. The decoration is idempotent
  // -- repeat calls do not re-stamp the className.
  className?: string;
  // Arbitrary attributes (data-*, aria-*, role, etc) applied
  // on first creation. The same idempotency contract holds.
  attributes?: Record<string, string>;
  // Sentinel attribute used to detect "already decorated".
  // Defaults to `data-decorated-<id>`. Override only when
  // multiple decorators target the same root (rare).
  decorationMarker?: string;
}

function applyDecoration(
  root: HTMLElement,
  id: string,
  descriptor: PortalRootDescriptor,
): void {
  const marker = descriptor.decorationMarker ?? `data-decorated-${id}`;
  if (root.hasAttribute(marker)) return;
  root.setAttribute(marker, 'true');
  if (descriptor.className) {
    root.className = descriptor.className;
  }
  if (descriptor.attributes) {
    for (const [key, value] of Object.entries(descriptor.attributes)) {
      root.setAttribute(key, value);
    }
  }
}

// Lazy-creates (or reuses) the portal target DOM node with
// the given id under `document.body`. Returns `null` when
// `document` is unavailable (SSR) or `document.body` is
// missing.
//
// The optional `descriptor` parameter applies idempotent
// decoration on first creation -- useful for callers that
// want to add a className / data-* attribute / ARIA role
// without wrapping in `definePortalRoot`.
export function getPortalRoot(
  id: PortalRootId,
  descriptor?: PortalRootDescriptor,
): HTMLElement | null {
  if (typeof document === 'undefined') return null;

  if (!document.body) {
    if (!warnedAboutMissingBody) {
      warnedAboutMissingBody = true;
      // eslint-disable-next-line no-console
      console.warn(
        `[portal-root] document.body is missing; cannot mount portal "${id}".`,
      );
    }
    return null;
  }

  const existing = document.getElementById(id);
  let root: HTMLElement;
  if (existing instanceof HTMLElement) {
    root = existing;
  } else {
    root = document.createElement('div');
    root.id = id;
    root.setAttribute('data-portal-root', 'true');
    document.body.appendChild(root);
  }

  if (descriptor) applyDecoration(root, id, descriptor);
  return root;
}

// Factory that bundles a named portal root id with its
// idempotent decoration. Returns a typed getter so call
// sites can declare their portal layer once and import the
// getter everywhere it is needed.
//
// Example:
// ```ts
// export const getToastRoot = definePortalRoot('toast-root', {
//   className: 'pointer-events-none fixed right-4 top-4 z-50 ...',
//   attributes: { 'data-toast-root': 'true' },
// });
// ```
//
// The returned getter retains the same `null`-on-SSR
// contract as `getPortalRoot`.
export function definePortalRoot(
  id: PortalRootId,
  descriptor: PortalRootDescriptor,
): () => HTMLElement | null {
  return () => getPortalRoot(id, descriptor);
}

// Removes the portal root element when it has no remaining
// children. Used by tests and by component teardown that
// wants to clean up the empty layer rather than leaving an
// orphan div in `document.body`. No-op when the element
// has children (other portals are still mounted) or does
// not exist.
export function cleanupPortalRoot(id: PortalRootId): void {
  if (typeof document === 'undefined') return;
  const node = document.getElementById(id);
  if (!node) return;
  if (node.childElementCount > 0) return;
  node.remove();
}
