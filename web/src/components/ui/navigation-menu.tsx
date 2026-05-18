import {
  forwardRef,
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import type {
  CSSProperties,
  KeyboardEvent as ReactKeyboardEvent,
  ReactNode,
} from 'react';
import { ChevronDown, ExternalLink } from 'lucide-react';
import { cn } from '../../lib/cn';

// (v1.11.406, TODO 11.388) NavigationMenu -- top-level
// horizontal site nav with optional dropdown / mega-menu
// panels per item. Distinct from `<Menubar>` (11.387) which
// is an application-style menu strip (File / Edit / View).
// NavigationMenu is for product-style site nav (Products /
// Solutions / Pricing) where each top-level item is either a
// direct link OR opens a rich content panel.
//
// Three sub-menu shapes are supported per item:
//   1. `href` only -- the item is a plain top-level link
//      (no dropdown).
//   2. `sections` -- a list (or list-of-lists) of links;
//      renders as a single column for one section or as a
//      multi-column "mega" panel when the count is >= 2.
//   3. `content` -- a fully custom ReactNode panel for the
//      adopter to render whatever they want (banners,
//      featured cards, embedded forms).
//
// Behaviour mirrors `<Menubar>` for the top-level keyboard
// contract (ArrowLeft / ArrowRight between triggers,
// ArrowDown opens, Escape closes, Tab exits, roving
// tabindex, hover-swap). The panel itself uses native
// link Tab order; ArrowDown / ArrowUp scope to the
// currently-focused section.
//
// Viewport-aware positioning: when the sub-menu would
// overflow the right edge of the viewport, the panel's
// `left` shifts left so the trailing edge fits. When the
// panel would push past the left edge, the leading edge
// pins to 0.

export interface NavigationMenuLink {
  id: string;
  label: ReactNode;
  href: string;
  description?: ReactNode;
  icon?: ReactNode;
  // When true, renders a small external glyph next to the
  // link label + sets `target="_blank" rel="noopener
  // noreferrer"`.
  external?: boolean;
}

export interface NavigationMenuSection {
  id: string;
  heading?: ReactNode;
  links: NavigationMenuLink[];
}

export interface NavigationMenuItem {
  id: string;
  label: ReactNode;
  /** Direct top-level link (no sub-menu). */
  href?: string;
  /** Multi-section dropdown / mega-menu. */
  sections?: NavigationMenuSection[];
  /** Custom panel content (full opt-out from `sections`). */
  content?: ReactNode;
  /** Custom panel min-width override (px). Default 12rem. */
  panelMinWidth?: number | string;
  /** When true, the top-level item is disabled. */
  disabled?: boolean;
}

export interface NavigationMenuProps {
  items: NavigationMenuItem[];
  ariaLabel?: string;
  className?: string;
  'data-testid'?: string;
}

interface PanelPosition {
  // left offset relative to the trigger's left edge.
  left: number;
}

function hasSubmenu(item: NavigationMenuItem | undefined): boolean {
  if (!item) return false;
  if (item.content) return true;
  if (item.sections && item.sections.length > 0) return true;
  return false;
}

function findNextEnabledTrigger(
  items: NavigationMenuItem[],
  start: number,
  dir: 1 | -1,
): number {
  const len = items.length;
  if (len === 0) return -1;
  let idx = start;
  for (let step = 0; step < len; step += 1) {
    idx = (idx + dir + len) % len;
    if (!items[idx]?.disabled) return idx;
  }
  return -1;
}

// (v1.11.406, TODO 11.388) Pure helper exported for tests.
// Computes the horizontal offset needed to keep the panel
// inside the viewport. Input is the trigger's left edge,
// panel width, and viewport width; output is the shift to
// apply to the panel's `left` (in CSS px).
export function computeNavPanelOffset(
  triggerLeft: number,
  panelWidth: number,
  viewportWidth: number,
): number {
  if (triggerLeft + panelWidth <= viewportWidth) return 0;
  const overflow = triggerLeft + panelWidth - viewportWidth;
  // Cap at the leading edge so we never pull the panel off-
  // screen to the left.
  return -Math.min(overflow, triggerLeft);
}

export const NavigationMenu = forwardRef<HTMLElement, NavigationMenuProps>(
  function NavigationMenu(
    {
      items,
      ariaLabel = 'Site navigation',
      className,
      'data-testid': testId,
    },
    forwardedRef,
  ) {
    const baseId = useId();
    const rootRef = useRef<HTMLElement | null>(null);
    const triggerRefs = useRef<Array<HTMLElement | null>>([]);
    const panelRef = useRef<HTMLDivElement | null>(null);
    const [openIndex, setOpenIndex] = useState<number | null>(null);
    const [focusIndex, setFocusIndex] = useState<number>(() => {
      for (let i = 0; i < items.length; i += 1) {
        if (!items[i]?.disabled) return i;
      }
      return 0;
    });
    const [panelPos, setPanelPos] = useState<PanelPosition>({ left: 0 });

    const triggerId = useCallback(
      (idx: number) => `${baseId}-trigger-${idx}`,
      [baseId],
    );
    const panelId = useCallback(
      (idx: number) => `${baseId}-panel-${idx}`,
      [baseId],
    );

    const closeAll = useCallback(
      (opts?: { restoreFocus?: boolean }) => {
        setOpenIndex(null);
        if (opts?.restoreFocus) {
          const el = triggerRefs.current[focusIndex];
          if (el && typeof el.focus === 'function') el.focus();
        }
      },
      [focusIndex],
    );

    const openMenu = useCallback(
      (idx: number) => {
        const item = items[idx];
        if (!item || item.disabled) return;
        if (!hasSubmenu(item)) return;
        setOpenIndex(idx);
        setFocusIndex(idx);
      },
      [items],
    );

    // Viewport-aware reposition on open + window resize.
    useLayoutEffect(() => {
      if (openIndex === null) return;
      const t = triggerRefs.current[openIndex];
      const p = panelRef.current;
      if (!t || !p) return;
      const compute = (): void => {
        const tr = t.getBoundingClientRect();
        const pw = p.offsetWidth;
        const vw = window.innerWidth;
        const offset = computeNavPanelOffset(tr.left, pw, vw);
        setPanelPos({ left: offset });
      };
      compute();
      window.addEventListener('resize', compute);
      return () => window.removeEventListener('resize', compute);
    }, [openIndex]);

    const handleTriggerClick = useCallback(
      (idx: number) => {
        const item = items[idx];
        if (!item || item.disabled) return;
        // Direct-link items follow the anchor click. Sub-menu
        // items toggle.
        if (!hasSubmenu(item)) return;
        if (openIndex === idx) closeAll();
        else openMenu(idx);
      },
      [items, openIndex, openMenu, closeAll],
    );

    const handleTriggerMouseEnter = useCallback(
      (idx: number) => {
        if (openIndex !== null && openIndex !== idx && !items[idx]?.disabled) {
          openMenu(idx);
        }
      },
      [openIndex, items, openMenu],
    );

    const moveTrigger = useCallback(
      (dir: 1 | -1) => {
        const next = findNextEnabledTrigger(items, focusIndex, dir);
        if (next < 0) return;
        setFocusIndex(next);
        if (openIndex !== null) {
          openMenu(next);
        } else {
          const el = triggerRefs.current[next];
          if (el && typeof el.focus === 'function') el.focus();
        }
      },
      [items, focusIndex, openIndex, openMenu],
    );

    const handleTriggerKeyDown = useCallback(
      (idx: number, e: ReactKeyboardEvent<HTMLElement>) => {
        if (e.key === 'ArrowRight') {
          e.preventDefault();
          moveTrigger(1);
          return;
        }
        if (e.key === 'ArrowLeft') {
          e.preventDefault();
          moveTrigger(-1);
          return;
        }
        if (e.key === 'Home') {
          e.preventDefault();
          const first = findNextEnabledTrigger(items, -1, 1);
          if (first >= 0) {
            setFocusIndex(first);
            const el = triggerRefs.current[first];
            if (el && typeof el.focus === 'function') el.focus();
            if (openIndex !== null) openMenu(first);
          }
          return;
        }
        if (e.key === 'End') {
          e.preventDefault();
          const last = findNextEnabledTrigger(items, items.length, -1);
          if (last >= 0) {
            setFocusIndex(last);
            const el = triggerRefs.current[last];
            if (el && typeof el.focus === 'function') el.focus();
            if (openIndex !== null) openMenu(last);
          }
          return;
        }
        if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') {
          const item = items[idx];
          if (item && hasSubmenu(item) && !item.disabled) {
            e.preventDefault();
            openMenu(idx);
          }
          return;
        }
        if (e.key === 'Escape' && openIndex !== null) {
          e.preventDefault();
          closeAll({ restoreFocus: true });
        }
      },
      [moveTrigger, items, openIndex, openMenu, closeAll],
    );

    // Click-outside dismiss.
    useEffect(() => {
      if (openIndex === null) return;
      const onDown = (e: globalThis.MouseEvent) => {
        const root = rootRef.current;
        if (!root) return;
        if (e.target instanceof Node && !root.contains(e.target)) {
          closeAll();
        }
      };
      document.addEventListener('mousedown', onDown, true);
      return () => document.removeEventListener('mousedown', onDown, true);
    }, [openIndex, closeAll]);

    // Escape closes from anywhere when open.
    useEffect(() => {
      if (openIndex === null) return;
      const onKey = (e: globalThis.KeyboardEvent) => {
        if (e.key === 'Escape') {
          closeAll({ restoreFocus: true });
        }
      };
      document.addEventListener('keydown', onKey);
      return () => document.removeEventListener('keydown', onKey);
    }, [openIndex, closeAll]);

    const renderSubPanel = (item: NavigationMenuItem): ReactNode => {
      if (item.content) {
        return (
          <div
            data-section="nav-menu-panel-content"
            className="p-3 text-sm"
          >
            {item.content}
          </div>
        );
      }
      const sections = item.sections ?? [];
      const isMega = sections.length >= 2;
      return (
        <div
          data-section={isMega ? 'nav-menu-mega' : 'nav-menu-panel-list'}
          data-is-mega={isMega ? 'true' : 'false'}
          className={cn(
            'p-3',
            isMega ? 'grid grid-cols-2 gap-4 sm:grid-cols-3' : 'flex flex-col',
          )}
        >
          {sections.map((section) => (
            <div
              key={section.id}
              data-section="nav-menu-section"
              data-nav-menu-section={section.id}
              className="flex flex-col gap-1"
            >
              {section.heading ? (
                <div
                  data-section="nav-menu-section-heading"
                  className="px-2 pb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground"
                >
                  {section.heading}
                </div>
              ) : null}
              <ul className="flex flex-col">
                {section.links.map((link) => (
                  <li
                    key={link.id}
                    data-section="nav-menu-link-item"
                  >
                    <a
                      href={link.href}
                      data-section="nav-menu-link"
                      data-nav-menu-link={link.id}
                      {...(link.external
                        ? { target: '_blank', rel: 'noopener noreferrer' }
                        : {})}
                      className="flex items-start gap-2 rounded-md px-2 py-1.5 text-sm text-foreground transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:bg-accent focus-visible:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1 focus-visible:ring-offset-background"
                    >
                      {link.icon ? (
                        <span
                          aria-hidden="true"
                          className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center text-muted-foreground"
                        >
                          {link.icon}
                        </span>
                      ) : null}
                      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                        <span className="flex items-center gap-1 truncate font-medium">
                          {link.label}
                          {link.external ? (
                            <ExternalLink
                              aria-hidden="true"
                              className="h-3 w-3 shrink-0 text-muted-foreground"
                            />
                          ) : null}
                        </span>
                        {link.description ? (
                          <span className="truncate text-xs text-muted-foreground">
                            {link.description}
                          </span>
                        ) : null}
                      </span>
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      );
    };

    return (
      <nav
        ref={(node) => {
          rootRef.current = node;
          if (typeof forwardedRef === 'function') forwardedRef(node);
          else if (forwardedRef && typeof forwardedRef === 'object') {
            (forwardedRef as React.MutableRefObject<HTMLElement | null>).current =
              node;
          }
        }}
        aria-label={ariaLabel}
        data-section="nav-menu"
        {...(testId ? { 'data-testid': testId } : {})}
        className={cn('relative inline-flex items-center gap-1', className)}
      >
        <ul className="flex items-center gap-1">
          {items.map((item, idx) => {
            const isOpen = openIndex === idx;
            const isFocused = focusIndex === idx;
            const hasSub = hasSubmenu(item);
            return (
              <li
                key={item.id}
                className="relative"
                data-section="nav-menu-item"
                data-nav-menu-item={item.id}
                data-nav-menu-open={isOpen ? 'true' : 'false'}
              >
                {hasSub ? (
                  <button
                    ref={(el) => {
                      triggerRefs.current[idx] = el;
                    }}
                    type="button"
                    id={triggerId(idx)}
                    aria-haspopup="menu"
                    aria-expanded={isOpen}
                    aria-controls={panelId(idx)}
                    disabled={item.disabled}
                    tabIndex={isFocused ? 0 : -1}
                    onClick={() => handleTriggerClick(idx)}
                    onMouseEnter={() => handleTriggerMouseEnter(idx)}
                    onFocus={() => setFocusIndex(idx)}
                    onKeyDown={(e) => handleTriggerKeyDown(idx, e)}
                    data-section="nav-menu-trigger"
                    data-nav-menu-trigger={item.id}
                    className={cn(
                      'inline-flex items-center gap-1 rounded-sm px-3 py-1.5 text-sm transition-colors',
                      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1 focus-visible:ring-offset-background',
                      item.disabled
                        ? 'cursor-not-allowed opacity-50'
                        : 'hover:bg-accent hover:text-accent-foreground',
                      isOpen && !item.disabled && 'bg-accent text-accent-foreground',
                    )}
                  >
                    <span>{item.label}</span>
                    <ChevronDown
                      aria-hidden="true"
                      data-section="nav-menu-chevron"
                      className={cn(
                        'h-3 w-3 shrink-0 text-muted-foreground transition-transform',
                        isOpen && 'rotate-180',
                      )}
                    />
                  </button>
                ) : (
                  <a
                    ref={(el) => {
                      triggerRefs.current[idx] = el;
                    }}
                    href={item.href ?? '#'}
                    id={triggerId(idx)}
                    tabIndex={isFocused ? 0 : -1}
                    onFocus={() => setFocusIndex(idx)}
                    onKeyDown={(e) => handleTriggerKeyDown(idx, e)}
                    onMouseEnter={() => handleTriggerMouseEnter(idx)}
                    data-section="nav-menu-trigger"
                    data-nav-menu-trigger={item.id}
                    aria-disabled={item.disabled || undefined}
                    className={cn(
                      'inline-flex items-center gap-1 rounded-sm px-3 py-1.5 text-sm transition-colors',
                      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1 focus-visible:ring-offset-background',
                      item.disabled
                        ? 'pointer-events-none opacity-50'
                        : 'hover:bg-accent hover:text-accent-foreground',
                    )}
                  >
                    {item.label}
                  </a>
                )}
                {isOpen ? (
                  <div
                    ref={panelRef}
                    role="menu"
                    id={panelId(idx)}
                    aria-orientation="vertical"
                    aria-labelledby={triggerId(idx)}
                    data-section="nav-menu-panel"
                    data-nav-menu-panel={item.id}
                    style={
                      {
                        left: `${panelPos.left}px`,
                        minWidth:
                          typeof item.panelMinWidth === 'number'
                            ? `${item.panelMinWidth}px`
                            : item.panelMinWidth ?? '12rem',
                      } as CSSProperties
                    }
                    className="absolute top-full z-50 mt-1 rounded-md border border-border bg-popover text-popover-foreground shadow-md focus:outline-none"
                  >
                    {renderSubPanel(item)}
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      </nav>
    );
  },
);

NavigationMenu.displayName = 'NavigationMenu';
