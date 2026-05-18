import { forwardRef, useImperativeHandle, useRef } from 'react';
import type { HTMLAttributes, ReactNode, RefObject } from 'react';
import { useFocusTrap } from '../../hooks/use-focus-trap';
import { cn } from '../../lib/cn';

// (v1.11.319, TODO 11.301) FocusTrap -- canonical primitive
// wrapping the pre-existing `useFocusTrap` hook so any
// overlay surface (Dialog, Drawer, CommandPalette, etc) can
// declare its focus-trap as a component instead of remembering
// to wire the hook + container ref by hand at every call site.
//
// The hook (`web/src/hooks/use-focus-trap.ts`) already
// implements the canonical contract:
//   - First-focus: when the trap activates, focus moves to
//     the explicit `initialFocusRef` if provided, else to the
//     first focusable inside the container, else to the
//     container itself.
//   - Wraparound: Tab from the last focusable returns to
//     the first; Shift+Tab from the first jumps to the last.
//   - Escape handler slot: an optional `onEscape` callback
//     fires when the Escape key is pressed (with
//     `stopPropagation` so outer Escape handlers do not
//     double-fire).
//   - Restore-on-unmount: when the trap deactivates, focus
//     returns to whatever element was focused before the
//     trap mounted.
//
// The primitive layers the following ergonomic guarantees on
// top:
//   - Polymorphic-but-default `<div>`. The trap container is
//     a `<div>` by default with `tabIndex={-1}` so it can
//     receive focus when there are zero focusable children
//     (the hook's fallback path). Callers can swap to any
//     intrinsic via the `as` prop.
//   - Forwarded ref: callers that already track the trap
//     container (e.g. to portal-mount or measure) can pass
//     a ref through to the underlying DOM node.
//   - Data-attribute selectors for theming + e2e:
//     `data-section="focus-trap"` and `data-active="true|false"`.
//   - The HTMLAttributes spread keeps the primitive transparent
//     for callers that need to forward `role`, `aria-*`,
//     `className`, `style`, etc.

export type FocusTrapAs = 'div' | 'section' | 'aside' | 'main';

export interface FocusTrapProps
  extends Omit<HTMLAttributes<HTMLElement>, 'children'> {
  // The subtree the trap should guard. Required because a
  // trap with no children is a no-op the consumer should
  // not bother mounting.
  children: ReactNode;
  // When false, the trap goes inert (no key handler, no
  // first-focus, no restore on next deactivation). Mirrors
  // the `active` flag the hook exposes. Default true.
  active?: boolean;
  // Optional explicit "first focus" target. When provided,
  // the trap focuses this element instead of the first
  // focusable inside the container on activation.
  initialFocusRef?: RefObject<HTMLElement>;
  // When true (default), focus returns to whatever was
  // focused before the trap mounted, on deactivation /
  // unmount. Set to false for surfaces that intentionally
  // redirect focus (e.g. a wizard step that should leave
  // focus on the new step's primary action).
  restoreFocusOnUnmount?: boolean;
  // Optional Escape-key handler. Fires with stopPropagation
  // so outer Escape handlers do not double-fire.
  onEscape?: () => void;
  // Polymorphic tag override (default 'div').
  as?: FocusTrapAs;
}

export const FocusTrap = forwardRef<HTMLElement, FocusTrapProps>(
  function FocusTrap(
    {
      children,
      active = true,
      initialFocusRef,
      restoreFocusOnUnmount = true,
      onEscape,
      as = 'div',
      className,
      tabIndex,
      ...rest
    },
    forwardedRef,
  ) {
    const localRef = useRef<HTMLElement>(null);
    useImperativeHandle(
      forwardedRef,
      () => localRef.current as HTMLElement,
      [],
    );

    useFocusTrap(localRef as RefObject<HTMLElement>, {
      active,
      ...(initialFocusRef ? { initialFocusRef } : {}),
      restoreFocusOnUnmount,
      ...(onEscape ? { onEscape } : {}),
    });

    const dataAttrs = {
      'data-section': 'focus-trap',
      'data-active': active ? 'true' : 'false',
    } as const;

    // tabIndex=-1 so the container can receive focus as the
    // fallback when there are zero focusable children (the
    // hook's documented behaviour). Callers can override.
    const resolvedTabIndex = tabIndex ?? -1;
    const mergedClassName = cn('outline-none', className);

    if (as === 'section') {
      return (
        <section
          ref={localRef as RefObject<HTMLElement> as RefObject<HTMLElement>}
          tabIndex={resolvedTabIndex}
          className={mergedClassName}
          {...dataAttrs}
          {...(rest as HTMLAttributes<HTMLElement>)}
        >
          {children}
        </section>
      );
    }
    if (as === 'aside') {
      return (
        <aside
          ref={localRef as RefObject<HTMLElement>}
          tabIndex={resolvedTabIndex}
          className={mergedClassName}
          {...dataAttrs}
          {...(rest as HTMLAttributes<HTMLElement>)}
        >
          {children}
        </aside>
      );
    }
    if (as === 'main') {
      return (
        <main
          ref={localRef as RefObject<HTMLElement>}
          tabIndex={resolvedTabIndex}
          className={mergedClassName}
          {...dataAttrs}
          {...(rest as HTMLAttributes<HTMLElement>)}
        >
          {children}
        </main>
      );
    }
    return (
      <div
        ref={localRef as RefObject<HTMLElement>}
        tabIndex={resolvedTabIndex}
        className={mergedClassName}
        {...dataAttrs}
        {...(rest as HTMLAttributes<HTMLElement>)}
      >
        {children}
      </div>
    );
  },
);
FocusTrap.displayName = 'FocusTrap';
