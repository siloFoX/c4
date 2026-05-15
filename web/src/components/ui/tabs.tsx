import {
  createContext,
  useContext,
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

export interface TabsProps {
  value: string;
  onChange: (value: string) => void;
  items: TabsItem[];
  className?: string;
  ariaLabel?: string;
  children?: ReactNode;
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

const TABLIST_CLASSES =
  'flex shrink-0 overflow-x-auto rounded-md border border-border text-xs [&::-webkit-scrollbar]:hidden [scrollbar-width:none]';

const TAB_BASE_CLASSES =
  'relative inline-flex items-center gap-1.5 px-2 py-1.5 transition-colors sm:px-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50';

const TAB_ACTIVE_CLASSES = 'bg-primary/30 text-foreground';
const TAB_INACTIVE_CLASSES =
  'text-muted-foreground hover:bg-accent hover:text-accent-foreground';

export function Tabs({
  value,
  onChange,
  items,
  className,
  ariaLabel,
  children,
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

  return (
    <TabsContext.Provider value={{ value, idBase }}>
      <div
        role="tablist"
        aria-label={ariaLabel ?? 'Tabs'}
        ref={tablistRef}
        className={cn(TABLIST_CLASSES, className)}
      >
        {items.map((item) => {
          const active = item.value === value;
          return (
            <button
              key={item.value}
              type="button"
              role="tab"
              id={tabDomId(idBase, item.value)}
              data-tab-value={item.value}
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
              onKeyDown={handleKeyDown}
              className={cn(
                TAB_BASE_CLASSES,
                active ? TAB_ACTIVE_CLASSES : TAB_INACTIVE_CLASSES,
              )}
            >
              {item.icon}
              {item.label}
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
