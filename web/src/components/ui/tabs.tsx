import {
  createContext,
  useContext,
  useEffect,
  useId,
  useRef,
  type ReactNode,
} from 'react';
import { cn } from '../../lib/cn';
import { useFocusCycle } from '../../hooks/use-focus-cycle';

export interface TabsItem {
  value: string;
  label: ReactNode;
  disabled?: boolean;
  icon?: ReactNode;
  // (v1.11.153) Optional accessibility hooks so adapters (e.g. TopTabs)
  // can supply a short string aria-label/title for screen readers when
  // the visible label is hidden on small screens.
  ariaLabel?: string;
  title?: string;
}

// (v1.11.246, TODO 11.228) Optional prefetch wiring. An adapter
// like TopTabs may pass `onPrefetch={(value) => ...}` so each tab
// fires the callback on hover / focus / touchstart -- typically
// the route-prefetch helper, which warms the corresponding lazy
// chunk before the user clicks.
export type TabsPrefetchHandler = (value: string) => void;

// (v1.11.299, TODO 11.281) Two visual flavours.
//   - 'pill' (default): rounded border around the tablist with
//     filled-background active tab. Matches the existing
//     TopTabs / SegmentedControl rhythm.
//   - 'line': transparent tablist with a thin underline drawn
//     beneath the active tab. Matches the Material / iOS
//     section-tab convention for in-page navigation.
export type TabsVariant = 'pill' | 'line';

// (v1.11.299, TODO 11.281) Overflow handling for long tab
// strips.
//   - 'scroll' (default): the tablist scrolls horizontally and
//     keyboard nav scrolls the active tab into view.
//   - 'wrap': the tablist wraps to a second row instead of
//     scrolling. Useful when the host has vertical space but
//     no horizontal room (e.g., narrow sidebar panels).
export type TabsOverflow = 'scroll' | 'wrap';

export interface TabsProps {
  value: string;
  onChange: (value: string) => void;
  items: TabsItem[];
  className?: string;
  ariaLabel?: string;
  children?: ReactNode;
  /**
   * Fired on `mouseenter` / `focus` / `touchstart` for each tab
   * button. Use this to warm the lazy chunk associated with the
   * tab so the click-time navigation does not stall on the
   * network. See lib/route-prefetch.ts + lib/route-loaders.ts.
   */
  onPrefetch?: TabsPrefetchHandler;
  // (v1.11.299, TODO 11.281)
  variant?: TabsVariant;
  // (v1.11.299, TODO 11.281)
  overflow?: TabsOverflow;
  // (v1.11.299, TODO 11.281) Auto-scroll the active tab into
  // view inside its overflow container when `value` changes.
  // Default true. Set to false to opt out (e.g., when the host
  // already controls scroll position).
  scrollOnFocus?: boolean;
}

interface TabsContextValue {
  value: string;
  idBase: string;
}

const TabsContext = createContext<TabsContextValue | null>(null);

function tabDomId(idBase: string, value: string): string {
  return `${idBase}-tab-${value}`;
}

function panelDomId(idBase: string, value: string): string {
  return `${idBase}-panel-${value}`;
}

// (v1.11.299, TODO 11.281) Per-variant + per-overflow class
// matrices. Keeps the JSX below readable when the four
// permutations branch.

const TABLIST_BASE = 'flex shrink-0 text-xs';
const TABLIST_PILL = 'rounded-md border border-border';
const TABLIST_LINE = 'border-b border-border';
const TABLIST_SCROLL =
  'overflow-x-auto [&::-webkit-scrollbar]:hidden [scrollbar-width:none]';
const TABLIST_WRAP = 'flex-wrap';

const TAB_BASE_CLASSES =
  'relative inline-flex items-center gap-1.5 px-2 py-1.5 transition-colors sm:px-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50';

const TAB_PILL_ACTIVE = 'bg-primary/30 text-foreground';
const TAB_PILL_INACTIVE =
  'text-muted-foreground hover:bg-accent hover:text-accent-foreground';
const TAB_LINE_ACTIVE = 'text-foreground';
const TAB_LINE_INACTIVE =
  'text-muted-foreground hover:text-foreground';

export function Tabs({
  value,
  onChange,
  items,
  className,
  ariaLabel,
  children,
  onPrefetch,
  variant = 'pill',
  overflow = 'scroll',
  scrollOnFocus = true,
}: TabsProps) {
  const idBase = useId();
  const tablistRef = useRef<HTMLDivElement | null>(null);

  const { handleKeyDown } = useFocusCycle({
    containerRef: tablistRef,
    itemSelector: '[role=tab]:not([disabled])',
    orientation: 'horizontal',
    wrap: true,
    onSelect: (el) => {
      const value = el.getAttribute('data-tab-value');
      if (value) onChange(value);
    },
  });

  // (v1.11.299, TODO 11.281) Scroll the active tab into view
  // whenever `value` changes so a long horizontally-overflowing
  // tablist keeps the current selection visible. Skips the
  // initial mount when the value comes from the parent's
  // default (the active tab may already be at scrollLeft=0,
  // and jsdom does not implement scrollIntoView).
  useEffect(() => {
    if (!scrollOnFocus) return;
    const root = tablistRef.current;
    if (!root) return;
    const active = root.querySelector<HTMLElement>(
      `[data-tab-value="${CSS && typeof CSS.escape === 'function' ? CSS.escape(value) : value}"]`,
    );
    if (active && typeof active.scrollIntoView === 'function') {
      active.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    }
  }, [value, scrollOnFocus]);

  const tablistClass = cn(
    TABLIST_BASE,
    variant === 'pill' ? TABLIST_PILL : TABLIST_LINE,
    overflow === 'scroll' ? TABLIST_SCROLL : TABLIST_WRAP,
    className,
  );

  return (
    <TabsContext.Provider value={{ value, idBase }}>
      <div
        role="tablist"
        aria-label={ariaLabel ?? 'Tabs'}
        ref={tablistRef}
        data-section="tabs"
        data-variant={variant}
        data-overflow={overflow}
        className={tablistClass}
      >
        {items.map((item) => {
          const active = item.value === value;
          const firePrefetch = () => {
            if (item.disabled || active) return;
            onPrefetch?.(item.value);
          };
          return (
            <button
              key={item.value}
              type="button"
              role="tab"
              id={tabDomId(idBase, item.value)}
              data-tab-value={item.value}
              data-tab-active={active ? 'true' : 'false'}
              aria-selected={active}
              aria-controls={panelDomId(idBase, item.value)}
              aria-label={item.ariaLabel}
              title={item.title}
              tabIndex={active ? 0 : -1}
              disabled={item.disabled}
              onClick={() => {
                if (item.disabled) return;
                onChange(item.value);
              }}
              // (v1.11.246, TODO 11.228) Prefetch on user-intent
              // signals. The active tab does not refire because
              // its chunk is already mounted, and disabled tabs
              // are skipped entirely.
              onMouseEnter={firePrefetch}
              onFocus={firePrefetch}
              onTouchStart={firePrefetch}
              onKeyDown={handleKeyDown}
              className={cn(
                TAB_BASE_CLASSES,
                variant === 'pill'
                  ? active
                    ? TAB_PILL_ACTIVE
                    : TAB_PILL_INACTIVE
                  : active
                    ? TAB_LINE_ACTIVE
                    : TAB_LINE_INACTIVE,
              )}
            >
              {item.icon}
              {item.label}
              {/* (v1.11.299, TODO 11.281) Underline indicator
                  for the 'line' variant. Sits flush with the
                  bottom of the button so it doubles as the
                  tablist's border-b alignment. */}
              {variant === 'line' && active ? (
                <span
                  aria-hidden="true"
                  data-section="tab-underline"
                  className="absolute inset-x-0 -bottom-px h-0.5 bg-primary"
                />
              ) : null}
            </button>
          );
        })}
      </div>
      {children}
    </TabsContext.Provider>
  );
}

export interface TabsPanelProps {
  value: string;
  children: ReactNode;
  className?: string;
}

export function TabsPanel({ value, children, className }: TabsPanelProps) {
  const ctx = useContext(TabsContext);
  if (!ctx) {
    throw new Error('<TabsPanel> must be rendered inside <Tabs>');
  }
  const active = ctx.value === value;
  return (
    <div
      role="tabpanel"
      id={panelDomId(ctx.idBase, value)}
      aria-labelledby={tabDomId(ctx.idBase, value)}
      hidden={!active}
      className={className}
    >
      {active ? children : null}
    </div>
  );
}
