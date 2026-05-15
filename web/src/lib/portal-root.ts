// portal-root.ts
//
// Single source of truth for portal target DOM nodes. Components that
// render through `createPortal` (Toast, Dialog, Popover, ...) should ask
// this module for their mount node instead of creating one inline so
// the policy (lazy creation, idempotent reuse, attribute tagging,
// SSR-safe null) stays in one place.

let warnedAboutMissingBody = false;

export type PortalRootId =
  | 'toast-root'
  | 'dialog-root'
  | 'popover-root'
  | 'dropdown-root'
  | (string & {});

export function getPortalRoot(id: PortalRootId): HTMLElement | null {
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
  if (existing instanceof HTMLElement) return existing;

  const node = document.createElement('div');
  node.id = id;
  node.setAttribute('data-portal-root', 'true');
  document.body.appendChild(node);
  return node;
}

export function cleanupPortalRoot(id: PortalRootId): void {
  if (typeof document === 'undefined') return;
  const node = document.getElementById(id);
  if (!node) return;
  if (node.childElementCount > 0) return;
  node.remove();
}
