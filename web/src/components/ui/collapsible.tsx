import {
  createContext,
  forwardRef,
  useCallback,
  useContext,
  useEffect,
  useId,
  useMemo,
  useState,
} from 'react';
import type { ReactNode, Ref } from 'react';
import { ChevronRight } from 'lucide-react';
import { cn } from '../../lib/cn';

// (v1.11.177) Collapsible disclosure primitive. A single section by
// default; multiple sections inside a <CollapsibleGroup> form an
// accordion. exclusive=true (default) keeps at most one section open;
// exclusive=false lets several stay open simultaneously. The header
// is a real <button> so Enter/Space toggle natively, and the closed
// panel sets `hidden` to drop out of tab order.

interface CollapsibleGroupContextValue {
  isOpen: (id: string) => boolean;
  setOpen: (id: string, next: boolean) => void;
}

const CollapsibleGroupContext =
  createContext<CollapsibleGroupContextValue | null>(null);

export interface CollapsibleProps {
  title: ReactNode;
  defaultOpen?: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  description?: ReactNode;
  className?: string;
  children: ReactNode;
  // (v1.11.402, TODO 11.384) Custom trigger slot. When set,
  // replaces the legacy title + description content inside
  // the trigger button. The chevron stays as part of the
  // button (the open/closed visual cue is structural).
  // Title + description are still rendered when `trigger`
  // is omitted, so the legacy contract is byte-identical.
  // Useful for surfaces that want a richer trigger (icons,
  // badges, multi-line copy) without writing their own
  // disclosure shell.
  trigger?: ReactNode;
  // (v1.11.402, TODO 11.384) Hide the leading chevron
  // glyph. Default false (chevron renders). Set true for
  // trigger compositions that supply their own
  // open/closed visual.
  hideChevron?: boolean;
}

export const Collapsible = forwardRef<HTMLElement, CollapsibleProps>(
  (
    {
      title,
      defaultOpen = false,
      open,
      onOpenChange,
      description,
      className,
      children,
      trigger,
      hideChevron = false,
    },
    ref,
  ) => {
    const reactId = useId();
    const headerId = `${reactId}-header`;
    const panelId = `${reactId}-panel`;

    const group = useContext(CollapsibleGroupContext);

    const isControlled = open !== undefined;
    const [uncontrolledOpen, setUncontrolledOpen] =
      useState<boolean>(defaultOpen);

    // Resolve the effective open state:
    // 1. controlled `open` wins,
    // 2. group state (when wrapped),
    // 3. local uncontrolled state.
    let isOpen: boolean;
    if (isControlled) {
      isOpen = open!;
    } else if (group) {
      isOpen = group.isOpen(reactId);
    } else {
      isOpen = uncontrolledOpen;
    }

    // Honor defaultOpen for children inside a group: register on
    // mount so a <Collapsible defaultOpen> seeds group state.
    useEffect(() => {
      if (group && !isControlled && defaultOpen) {
        group.setOpen(reactId, true);
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const toggle = useCallback(() => {
      const next = !isOpen;
      if (group) {
        group.setOpen(reactId, next);
      } else if (!isControlled) {
        setUncontrolledOpen(next);
      }
      onOpenChange?.(next);
    }, [isOpen, group, isControlled, onOpenChange, reactId]);

    return (
      <section
        ref={ref as Ref<HTMLElement>}
        className={cn(
          'rounded-md border border-border bg-card/50',
          className,
        )}
        data-section="collapsible"
        data-collapsible-open={isOpen ? 'true' : 'false'}
        data-open={isOpen ? 'true' : 'false'}
      >
        <button
          type="button"
          id={headerId}
          aria-expanded={isOpen}
          aria-controls={panelId}
          onClick={toggle}
          data-section="collapsible-trigger"
          className="flex w-full items-start gap-2 rounded-md px-3 py-2 text-left transition-colors hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        >
          {hideChevron ? null : (
            <ChevronRight
              aria-hidden="true"
              data-section="collapsible-chevron"
              className={cn(
                'mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform duration-200 motion-reduce:transition-none motion-reduce:transform-none',
                isOpen && 'rotate-90 motion-reduce:rotate-0',
              )}
            />
          )}
          <span
            className="flex min-w-0 flex-1 flex-col gap-0.5"
            data-section="collapsible-trigger-body"
          >
            {trigger !== undefined ? (
              trigger
            ) : (
              <>
                <span
                  data-section="collapsible-title"
                  className="truncate text-sm font-medium text-foreground"
                >
                  {title}
                </span>
                {description != null ? (
                  <span
                    data-section="collapsible-description"
                    className="truncate text-xs text-muted-foreground"
                  >
                    {description}
                  </span>
                ) : null}
              </>
            )}
          </span>
        </button>
        <div
          id={panelId}
          role="region"
          aria-labelledby={headerId}
          aria-hidden={!isOpen}
          hidden={!isOpen}
          data-section="collapsible-panel"
          className={cn(
            'overflow-hidden transition-all duration-200 motion-reduce:transition-none',
            isOpen ? 'max-h-[1000px]' : 'max-h-0',
          )}
        >
          <div className="px-3 pb-3 pt-1 text-sm">{children}</div>
        </div>
      </section>
    );
  },
);
Collapsible.displayName = 'Collapsible';

export interface CollapsibleGroupProps {
  exclusive?: boolean;
  defaultOpenId?: string;
  className?: string;
  children: ReactNode;
}

export function CollapsibleGroup({
  exclusive = true,
  defaultOpenId,
  className,
  children,
}: CollapsibleGroupProps) {
  const [openIds, setOpenIds] = useState<Set<string>>(
    () => new Set(defaultOpenId ? [defaultOpenId] : []),
  );

  const setOpen = useCallback(
    (id: string, next: boolean) => {
      setOpenIds((prev) => {
        if (exclusive) {
          if (next) return new Set([id]);
          if (prev.has(id)) {
            const copy = new Set(prev);
            copy.delete(id);
            return copy;
          }
          return prev;
        }
        const copy = new Set(prev);
        if (next) copy.add(id);
        else copy.delete(id);
        return copy;
      });
    },
    [exclusive],
  );

  const ctxValue = useMemo<CollapsibleGroupContextValue>(
    () => ({
      isOpen: (id: string) => openIds.has(id),
      setOpen,
    }),
    [openIds, setOpen],
  );

  return (
    <CollapsibleGroupContext.Provider value={ctxValue}>
      <div className={cn('flex flex-col gap-2', className)}>{children}</div>
    </CollapsibleGroupContext.Provider>
  );
}
CollapsibleGroup.displayName = 'CollapsibleGroup';
