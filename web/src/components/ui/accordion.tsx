import {
  forwardRef,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { HTMLAttributes, KeyboardEvent, ReactNode } from 'react';
import { ChevronRight } from 'lucide-react';
import { cn } from '../../lib/cn';
import { useReducedMotion } from '../../hooks/use-reduced-motion';

// (v1.11.290, TODO 11.272) Accordion -- canonical collapsible
// item group with the full WAI-ARIA accordion keyboard contract.
// Differences from the lower-level <Collapsible> +
// <CollapsibleGroup> pair (v1.11.177):
//   - Renders a single primitive that owns the item array
//     (declarative API: `items={[{ id, title, content, ... }]}`).
//   - Roving tabindex on item triggers; only the focused
//     trigger is `tabindex=0`, the rest are `tabindex=-1`.
//   - Keyboard nav: ArrowDown / ArrowUp move focus between
//     enabled item triggers (with wrap); Home / End jump to
//     the first / last enabled trigger; Enter / Space toggle
//     via the native button behaviour.
//   - Open / close animation respects `useReducedMotion()` -
//     the panel max-height transition + chevron rotation are
//     suppressed when the operator has prefers-reduced-motion
//     set.
//   - `mode: 'single' | 'multi'` -- single keeps at most one
//     item open at a time; multi lets several stay open.
//
// Reach for `<Collapsible>` instead when the surface is one
// stand-alone disclosure (no sibling items, no keyboard nav
// between triggers). For a list of related sections that read
// as an accordion, use this primitive.

export type AccordionMode = 'single' | 'multi';

// (v1.11.387, TODO 11.369) Header heading level for the
// trigger row. The legacy default is `h3`; callers can lower
// the level (h4-h6) for nested accordions inside a page that
// already has h2 sections, or raise it (h2) for a hero
// FAQ-style accordion at the top of a page. The value is
// strictly typed so adopters cannot pass invalid levels at
// the type boundary.
export type AccordionHeaderLevel = 'h2' | 'h3' | 'h4' | 'h5' | 'h6';

// (v1.11.387, TODO 11.369) Panel content render strategy.
//   - `'always'` (default, legacy byte-identical): every
//     panel mounts on first render; closed panels are
//     `hidden` so React/effects inside still fire. Cheap for
//     small surfaces; matches the existing test suite.
//   - `'lazy'`: a panel does not mount its `content` until the
//     first time the item opens. Once mounted it stays
//     mounted (so re-closing does NOT unmount). Useful when
//     a panel hosts an expensive widget (chart, virtualized
//     list, fetch-on-mount form).
export type AccordionRenderMode = 'always' | 'lazy';

export interface AccordionItem {
  id: string;
  title: ReactNode;
  description?: ReactNode;
  content: ReactNode;
  defaultOpen?: boolean;
  disabled?: boolean;
}

export interface AccordionProps
  extends Omit<HTMLAttributes<HTMLDivElement>, 'onChange' | 'children'> {
  items: AccordionItem[];
  mode?: AccordionMode;
  // Controlled open-set override -- when set, the primitive
  // does not manage state internally.
  openIds?: string[];
  // Uncontrolled initial open set. Ignored when `openIds` is
  // set. When omitted, per-item `defaultOpen` flags seed the
  // initial state.
  defaultOpenIds?: string[];
  onOpenIdsChange?: (ids: string[]) => void;
  ariaLabel?: string;
  className?: string;
  // (v1.11.387, TODO 11.369) Heading level for the trigger
  // row. Default `'h3'` matches the legacy markup
  // byte-for-byte.
  headerLevel?: AccordionHeaderLevel;
  // (v1.11.387, TODO 11.369) When `mode='single'` and
  // `collapsible=false`, clicking the active item does not
  // close it -- so at least one panel stays open. Default
  // `true` preserves the legacy "click-to-toggle-closed"
  // behaviour. Ignored in `multi` mode (multi-open
  // accordions can always close every panel).
  collapsible?: boolean;
  // (v1.11.387, TODO 11.369) Panel content render strategy.
  // Default `'always'` keeps legacy byte-identical behaviour.
  renderMode?: AccordionRenderMode;
}

function initialOpenSet(
  items: AccordionItem[],
  defaultOpenIds: string[] | undefined,
  mode: AccordionMode,
): Set<string> {
  if (defaultOpenIds) {
    if (mode === 'single' && defaultOpenIds.length > 1) {
      const first = defaultOpenIds[0];
      return new Set(first ? [first] : []);
    }
    return new Set(defaultOpenIds);
  }
  const seeded = items.filter((it) => it.defaultOpen).map((it) => it.id);
  if (mode === 'single' && seeded.length > 1) {
    const first = seeded[0];
    return new Set(first ? [first] : []);
  }
  return new Set(seeded);
}

export const Accordion = forwardRef<HTMLDivElement, AccordionProps>(
  (
    {
      items,
      mode = 'single',
      openIds,
      defaultOpenIds,
      onOpenIdsChange,
      ariaLabel = 'Accordion',
      className,
      headerLevel = 'h3',
      collapsible = true,
      renderMode = 'always',
      ...rest
    },
    ref,
  ) => {
    const reducedMotion = useReducedMotion();
    const baseId = useId();
    const isControlled = openIds !== undefined;
    const [internalOpen, setInternalOpen] = useState<Set<string>>(() =>
      initialOpenSet(items, defaultOpenIds, mode),
    );
    const openSet: Set<string> = useMemo(
      () => (isControlled ? new Set(openIds) : internalOpen),
      [isControlled, openIds, internalOpen],
    );

    // Roving tabindex tracking. Initialises to the first
    // enabled item; arrow nav moves focus between enabled
    // siblings.
    const enabledIds = useMemo(
      () => items.filter((it) => !it.disabled).map((it) => it.id),
      [items],
    );
    const [focusId, setFocusId] = useState<string | null>(
      enabledIds[0] ?? null,
    );
    useEffect(() => {
      if (focusId && enabledIds.includes(focusId)) return;
      setFocusId(enabledIds[0] ?? null);
    }, [enabledIds, focusId]);

    const triggerRefs = useRef<Record<string, HTMLButtonElement | null>>({});

    const moveFocus = useCallback(
      (delta: 1 | -1) => {
        if (enabledIds.length === 0) return;
        const currentIdx = focusId ? enabledIds.indexOf(focusId) : -1;
        const startIdx = currentIdx === -1 ? 0 : currentIdx;
        const nextIdx =
          (startIdx + delta + enabledIds.length) % enabledIds.length;
        const nextId = enabledIds[nextIdx]!;
        setFocusId(nextId);
        triggerRefs.current[nextId]?.focus();
      },
      [enabledIds, focusId],
    );

    const focusFirst = useCallback(() => {
      const first = enabledIds[0];
      if (!first) return;
      setFocusId(first);
      triggerRefs.current[first]?.focus();
    }, [enabledIds]);

    const focusLast = useCallback(() => {
      const last = enabledIds[enabledIds.length - 1];
      if (!last) return;
      setFocusId(last);
      triggerRefs.current[last]?.focus();
    }, [enabledIds]);

    const commitOpen = useCallback(
      (next: Set<string>) => {
        if (!isControlled) setInternalOpen(next);
        onOpenIdsChange?.([...next]);
      },
      [isControlled, onOpenIdsChange],
    );

    const toggleItem = useCallback(
      (id: string) => {
        const wasOpen = openSet.has(id);
        if (mode === 'single') {
          // (v1.11.387, TODO 11.369) When `collapsible=false`,
          // clicking the active item is a no-op so the
          // accordion always has exactly one panel open.
          if (wasOpen && !collapsible) return;
          const next = wasOpen ? new Set<string>() : new Set<string>([id]);
          commitOpen(next);
          return;
        }
        const next = new Set<string>(openSet);
        if (wasOpen) next.delete(id);
        else next.add(id);
        commitOpen(next);
      },
      [commitOpen, mode, openSet, collapsible],
    );

    // (v1.11.387, TODO 11.369) Lazy render tracking. Once an
    // item has been opened we remember its id so a subsequent
    // close keeps the panel mounted.
    const everOpenedRef = useRef<Set<string>>(
      new Set(openSet),
    );
    useEffect(() => {
      // Sync the "has been open" set whenever the open set
      // grows. We never remove ids -- once mounted, the panel
      // stays in the tree (so internal state inside the
      // content is preserved across collapse/expand).
      let changed = false;
      openSet.forEach((id) => {
        if (!everOpenedRef.current.has(id)) {
          everOpenedRef.current.add(id);
          changed = true;
        }
      });
      // The mutation does not need to trigger a re-render --
      // React will re-render on the next state change that
      // exposes the new content, which is exactly when the
      // open set grew. The `changed` flag is kept as a marker
      // for future diagnostics but is intentionally unused.
      void changed;
    }, [openSet]);

    const handleKeyDown = useCallback(
      (e: KeyboardEvent<HTMLDivElement>) => {
        switch (e.key) {
          case 'ArrowDown':
            e.preventDefault();
            moveFocus(1);
            break;
          case 'ArrowUp':
            e.preventDefault();
            moveFocus(-1);
            break;
          case 'Home':
            e.preventDefault();
            focusFirst();
            break;
          case 'End':
            e.preventDefault();
            focusLast();
            break;
          default:
            break;
        }
      },
      [focusFirst, focusLast, moveFocus],
    );

    return (
      <div
        ref={ref}
        role="region"
        aria-label={ariaLabel}
        data-section="accordion"
        data-mode={mode}
        data-collapsible={collapsible ? 'true' : 'false'}
        data-render-mode={renderMode}
        data-header-level={headerLevel}
        onKeyDown={handleKeyDown}
        className={cn('flex flex-col gap-2', className)}
        {...rest}
      >
        {items.map((item) => {
          const isOpen = openSet.has(item.id);
          const isFocused = item.id === focusId;
          const headerId = `${baseId}-${item.id}-header`;
          const panelId = `${baseId}-${item.id}-panel`;
          // (v1.11.387, TODO 11.369) Lazy render: skip the
          // content children until the item has been opened at
          // least once. We render the panel container either
          // way so ARIA `aria-controls` always resolves; only
          // the inner `content` is gated.
          const hasEverOpened = everOpenedRef.current.has(item.id) || isOpen;
          const shouldRenderContent =
            renderMode === 'always' || hasEverOpened;
          const HeaderTag = headerLevel;
          return (
            <section
              key={item.id}
              data-accordion-item={item.id}
              data-accordion-item-open={isOpen ? 'true' : 'false'}
              data-accordion-item-disabled={
                item.disabled ? 'true' : 'false'
              }
              data-accordion-item-mounted={shouldRenderContent ? 'true' : 'false'}
              className="rounded-md border border-border bg-card/50"
            >
              <HeaderTag className="m-0">
                <button
                  ref={(el) => {
                    triggerRefs.current[item.id] = el;
                  }}
                  type="button"
                  id={headerId}
                  aria-expanded={isOpen}
                  aria-controls={panelId}
                  disabled={item.disabled}
                  tabIndex={isFocused ? 0 : -1}
                  data-accordion-trigger={item.id}
                  onClick={() => {
                    if (item.disabled) return;
                    setFocusId(item.id);
                    toggleItem(item.id);
                  }}
                  onFocus={() => {
                    if (focusId !== item.id) setFocusId(item.id);
                  }}
                  className={cn(
                    'flex w-full items-start gap-2 rounded-md px-3 py-2 text-left transition-colors hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background',
                    item.disabled && 'cursor-not-allowed opacity-50',
                  )}
                >
                  <ChevronRight
                    aria-hidden="true"
                    className={cn(
                      'mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground',
                      !reducedMotion &&
                        'transition-transform duration-200',
                      isOpen && !reducedMotion && 'rotate-90',
                      isOpen && reducedMotion && 'rotate-90',
                    )}
                  />
                  <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="truncate text-sm font-medium text-foreground">
                      {item.title}
                    </span>
                    {item.description != null ? (
                      <span className="truncate text-xs text-muted-foreground">
                        {item.description}
                      </span>
                    ) : null}
                  </span>
                </button>
              </HeaderTag>
              <div
                id={panelId}
                role="region"
                aria-labelledby={headerId}
                aria-hidden={!isOpen}
                hidden={!isOpen}
                data-accordion-panel={item.id}
                className={cn(
                  'overflow-hidden',
                  !reducedMotion &&
                    'transition-all duration-200',
                  isOpen ? 'max-h-[1000px]' : 'max-h-0',
                )}
              >
                <div className="px-3 pb-3 pt-1 text-sm">
                  {shouldRenderContent ? item.content : null}
                </div>
              </div>
            </section>
          );
        })}
      </div>
    );
  },
);
Accordion.displayName = 'Accordion';
