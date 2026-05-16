import {
  forwardRef,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { HTMLAttributes, ReactNode } from 'react';
import { Check, Copy } from 'lucide-react';
import { cn } from '../../lib/cn';
import { Tooltip } from './tooltip';
import { copyTextToClipboard } from '../../hooks/use-copy';
import { useDensity, type Density } from '../../hooks/use-density';

export interface DataListItem {
  id: string;
  label: ReactNode;
  value: ReactNode;
  copyValue?: string;
  truncate?: boolean;
}

export interface DataListGroup {
  id: string;
  title: ReactNode;
  items: DataListItem[];
}

export type DataListOrientation = 'horizontal' | 'vertical';

// (v1.11.277, TODO 11.259) Density modes.
// 'auto' reads the operator's global density preference from
// `useDensity()` (v1.11.263, TODO 11.245). The other three values
// are explicit overrides for surfaces that always want a specific
// rhythm regardless of the global setting -- e.g. the Sessions
// info DetailPanel keeps a comfortable rhythm even when the rest
// of the app is in `compact` mode.
export type DataListDensity = 'auto' | Density;

export interface DataListProps
  extends Omit<HTMLAttributes<HTMLDListElement>, 'children'> {
  items?: DataListItem[];
  // (v1.11.277, TODO 11.259) When `groups` is provided the
  // component renders one `<section>` per group with a header
  // row above each. `items` is treated as an ungrouped "leading"
  // block above the first group when both are passed.
  groups?: DataListGroup[];
  orientation?: DataListOrientation;
  // (v1.11.277, TODO 11.259) Spacing rhythm. Defaults to 'auto'
  // (reads useDensity()).
  density?: DataListDensity;
  // (v1.11.277, TODO 11.259) Sticky group header rows.
  // Defaults to true when `groups` is provided; ignored for the
  // flat-items API. The header row pins to top:0 of the nearest
  // scroll container (e.g. a Drawer / DetailPanel body) so the
  // operator can always see which section their eyes are in.
  stickyHeaders?: boolean;
  // (v1.11.277, TODO 11.259) "Hover scrubber" -- a quick-jump
  // toolbar of group titles that appears at the top-right on
  // hover. Clicking a chip scrolls that section's first row
  // into view. Defaults to true when `groups.length >= 2`.
  scrubber?: boolean;
  className?: string;
}

const ORIENTATION_CLS: Record<DataListOrientation, string> = {
  horizontal: 'flex flex-col',
  vertical: 'flex flex-col',
};

// (v1.11.277, TODO 11.259) Density -> gap-y mapping. The legacy
// (v1.11.263, pre-this-TODO) values were 'gap-1' (horizontal) and
// 'gap-2' (vertical). To preserve byte-identical rendering for
// callers who do NOT opt into density-awareness (default = 'auto'
// resolving to 'comfortable' when no operator override is set),
// 'comfortable' MUST map to those legacy values.
const DENSITY_GAP_HORIZONTAL: Record<Density, string> = {
  compact: 'gap-0.5',
  comfortable: 'gap-1',
  cozy: 'gap-2',
};
const DENSITY_GAP_VERTICAL: Record<Density, string> = {
  compact: 'gap-1',
  comfortable: 'gap-2',
  cozy: 'gap-3',
};
const DENSITY_ROW_PY_HORIZONTAL: Record<Density, string> = {
  compact: 'py-0',
  comfortable: 'py-0.5',
  cozy: 'py-1',
};

function resolveDensity(
  density: DataListDensity,
  operatorDensity: Density,
): Density {
  return density === 'auto' ? operatorDensity : density;
}

export const DataList = forwardRef<HTMLDListElement, DataListProps>(
  (
    {
      items,
      groups,
      orientation = 'horizontal',
      density = 'auto',
      stickyHeaders,
      scrubber,
      className,
      ...rest
    },
    ref,
  ) => {
    const { density: operatorDensity } = useDensity();
    const resolved = resolveDensity(density, operatorDensity);
    const gapCls =
      orientation === 'horizontal'
        ? DENSITY_GAP_HORIZONTAL[resolved]
        : DENSITY_GAP_VERTICAL[resolved];
    const rowPy = DENSITY_ROW_PY_HORIZONTAL[resolved];

    const hasGroups = Array.isArray(groups) && groups.length > 0;
    const stickyOn = hasGroups && (stickyHeaders ?? true);
    const scrubberOn =
      hasGroups && (scrubber ?? (groups?.length ?? 0) >= 2);

    // (v1.11.277, TODO 11.259) "Active group" tracking for the
    // hover scrubber + the `data-active-group` attr. We watch the
    // first row of each group with an IntersectionObserver and
    // pick the topmost row whose bounding box intersects the
    // scroll viewport.
    const rootRef = useRef<HTMLDListElement | null>(null);
    const firstRowRefs = useRef<Record<string, HTMLDivElement | null>>({});
    const [activeGroup, setActiveGroup] = useState<string | null>(
      hasGroups ? groups![0]!.id : null,
    );

    // Keep activeGroup in sync if the groups list changes.
    useEffect(() => {
      if (!hasGroups) {
        setActiveGroup(null);
        return;
      }
      setActiveGroup((prev) => {
        if (prev && groups!.some((g) => g.id === prev)) return prev;
        return groups![0]!.id;
      });
    }, [groups, hasGroups]);

    useEffect(() => {
      if (!hasGroups) return;
      if (typeof IntersectionObserver === 'undefined') return;
      const observer = new IntersectionObserver(
        (entries) => {
          // Pick the topmost intersecting row (smallest top).
          const intersecting = entries.filter((e) => e.isIntersecting);
          if (intersecting.length === 0) return;
          intersecting.sort(
            (a, b) =>
              a.boundingClientRect.top - b.boundingClientRect.top,
          );
          const first = intersecting[0]!;
          const groupId =
            (first.target as HTMLElement).dataset['groupId'] ?? null;
          if (groupId) setActiveGroup(groupId);
        },
        { threshold: [0, 1] },
      );
      const sentinels = Object.values(firstRowRefs.current).filter(
        (el): el is HTMLDivElement => el !== null,
      );
      sentinels.forEach((el) => observer.observe(el));
      return () => observer.disconnect();
    }, [groups, hasGroups]);

    const scrollToGroup = useCallback((groupId: string) => {
      const el = firstRowRefs.current[groupId];
      if (el && typeof el.scrollIntoView === 'function') {
        try {
          el.scrollIntoView({ behavior: 'smooth', block: 'start' });
        } catch {
          // Some jsdom builds throw on scrollIntoView opts; fall
          // back to the no-arg form so tests stay stable.
          el.scrollIntoView();
        }
      }
      setActiveGroup(groupId);
    }, []);

    const setRoot = useCallback(
      (node: HTMLDListElement | null) => {
        rootRef.current = node;
        if (typeof ref === 'function') ref(node);
        else if (ref) {
          (ref as React.MutableRefObject<HTMLDListElement | null>).current =
            node;
        }
      },
      [ref],
    );

    const rootClass = cn(
      'relative',
      ORIENTATION_CLS[orientation],
      gapCls,
      className,
    );

    return (
      <dl
        ref={setRoot}
        data-orientation={orientation}
        data-density={resolved}
        data-active-group={hasGroups ? (activeGroup ?? undefined) : undefined}
        data-section={hasGroups ? 'data-list-grouped' : 'data-list'}
        className={rootClass}
        {...rest}
      >
        {scrubberOn && groups ? (
          <DataListScrubber
            groups={groups}
            activeGroup={activeGroup}
            onJump={scrollToGroup}
          />
        ) : null}
        {/* Ungrouped leading block (rare but supported). */}
        {Array.isArray(items) && items.length > 0
          ? items.map((item) => (
              <DataListRow
                key={item.id}
                item={item}
                orientation={orientation}
                rowPy={rowPy}
              />
            ))
          : null}
        {hasGroups
          ? groups!.map((group) => (
              <DataListGroupSection
                key={group.id}
                group={group}
                orientation={orientation}
                rowPy={rowPy}
                gapCls={gapCls}
                sticky={stickyOn}
                firstRowRefs={firstRowRefs}
              />
            ))
          : null}
      </dl>
    );
  },
);
DataList.displayName = 'DataList';

interface RowProps {
  item: DataListItem;
  orientation: DataListOrientation;
  rowPy: string;
  innerRef?: (el: HTMLDivElement | null) => void;
}

function DataListRow({ item, orientation, rowPy, innerRef }: RowProps) {
  const { label, value, copyValue, truncate } = item;
  const horizontal = orientation === 'horizontal';
  const titleAttr =
    truncate && typeof value === 'string' ? value : undefined;

  const valueNode = (
    <span
      className={cn('min-w-0 flex-1', truncate ? 'block truncate' : '')}
      title={titleAttr}
    >
      {value}
    </span>
  );

  const wrappedValue =
    truncate && typeof value === 'string' ? (
      <Tooltip label={value}>{valueNode}</Tooltip>
    ) : (
      valueNode
    );

  if (horizontal) {
    return (
      <div
        ref={innerRef}
        data-data-list-row={item.id}
        className={cn('flex items-baseline gap-3', rowPy)}
      >
        <dt className="w-32 shrink-0 text-xs uppercase tracking-wide text-muted-foreground">
          {label}
        </dt>
        <dd className="flex min-w-0 flex-1 items-center gap-2 text-sm text-foreground">
          {wrappedValue}
          {copyValue !== undefined ? (
            <CopyChip copyValue={copyValue} label={label} />
          ) : null}
        </dd>
      </div>
    );
  }

  return (
    <div
      ref={innerRef}
      data-data-list-row={item.id}
      className="flex flex-col gap-0.5"
    >
      <dt className="text-[11px] uppercase tracking-wide text-muted-foreground">
        {label}
      </dt>
      <dd className="flex min-w-0 items-center gap-2 text-sm text-foreground">
        {wrappedValue}
        {copyValue !== undefined ? (
          <CopyChip copyValue={copyValue} label={label} />
        ) : null}
      </dd>
    </div>
  );
}

interface GroupSectionProps {
  group: DataListGroup;
  orientation: DataListOrientation;
  rowPy: string;
  gapCls: string;
  sticky: boolean;
  firstRowRefs: React.MutableRefObject<Record<string, HTMLDivElement | null>>;
}

function DataListGroupSection({
  group,
  orientation,
  rowPy,
  gapCls,
  sticky,
  firstRowRefs,
}: GroupSectionProps) {
  const headingId = useId();
  return (
    <section
      data-data-list-group={group.id}
      aria-labelledby={headingId}
      className="flex flex-col"
    >
      <header
        id={headingId}
        data-data-list-group-header={group.id}
        className={cn(
          'mt-2 pb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground',
          sticky &&
            'sticky top-0 z-10 -mt-px bg-card/95 pt-1 backdrop-blur supports-[backdrop-filter]:bg-card/80',
        )}
      >
        {group.title}
      </header>
      <div className={cn('flex flex-col', gapCls)}>
        {group.items.map((item, idx) => {
          const refProp =
            idx === 0
              ? {
                  innerRef: (el: HTMLDivElement | null) => {
                    firstRowRefs.current[group.id] = el;
                    if (el) {
                      el.dataset['groupId'] = group.id;
                    }
                  },
                }
              : {};
          return (
            <DataListRow
              key={item.id}
              item={item}
              orientation={orientation}
              rowPy={rowPy}
              {...refProp}
            />
          );
        })}
      </div>
    </section>
  );
}

interface ScrubberProps {
  groups: DataListGroup[];
  activeGroup: string | null;
  onJump: (groupId: string) => void;
}

function DataListScrubber({ groups, activeGroup, onJump }: ScrubberProps) {
  // (v1.11.277, TODO 11.259) Hover scrubber. The container has
  // opacity-0 by default and fades in when the parent group is
  // hovered, focused, or the scrubber itself is focused. Chips
  // are real <button>s so keyboard nav (Tab + Enter) jumps
  // between groups even when the mouse never touches the list.
  const items = useMemo(
    () =>
      groups.map((g) => ({
        id: g.id,
        // Coerce title to a short string for the chip label;
        // ReactNode is supported for the header itself but the
        // scrubber chip needs flat text.
        label: typeof g.title === 'string' ? g.title : g.id,
      })),
    [groups],
  );
  return (
    <div
      data-data-list-scrubber="true"
      className="pointer-events-none absolute right-1 top-1 z-20 flex flex-wrap items-center gap-1 opacity-0 transition-opacity focus-within:pointer-events-auto focus-within:opacity-100 group-hover/dl:pointer-events-auto group-hover/dl:opacity-100 hover:pointer-events-auto hover:opacity-100"
      role="navigation"
      aria-label="Jump to group"
    >
      {items.map((it) => {
        const isActive = it.id === activeGroup;
        return (
          <button
            key={it.id}
            type="button"
            onClick={() => onJump(it.id)}
            data-data-list-scrubber-chip={it.id}
            data-active={isActive ? 'true' : 'false'}
            className={cn(
              'rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide transition-colors',
              isActive
                ? 'border-primary bg-primary/10 text-foreground'
                : 'border-border bg-card/80 text-muted-foreground hover:border-foreground/40 hover:text-foreground',
            )}
          >
            {it.label}
          </button>
        );
      })}
    </div>
  );
}

interface CopyChipProps {
  copyValue: string;
  label: ReactNode;
}

function CopyChip({ copyValue, label }: CopyChipProps) {
  // (v1.11.251, TODO 11.233) Inline `navigator.clipboard?.
  // writeText(copyValue)` now routes through the shared
  // `copyTextToClipboard()` imperative helper from
  // `hooks/use-copy`. Local `copied` state stays here so the
  // pulse flips synchronously on click (matching the existing
  // "transient Check icon" test contract -- the hook variant
  // would flip after the async write resolves).
  const [copied, setCopied] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  const handleCopy = useCallback(() => {
    void copyTextToClipboard(copyValue);
    setCopied(true);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setCopied(false), 1200);
  }, [copyValue]);

  const ariaLabel =
    typeof label === 'string' ? `Copy ${label}` : 'Copy value';

  return (
    <button
      type="button"
      onClick={handleCopy}
      aria-label={ariaLabel}
      data-copied={copied || undefined}
      className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-md border border-transparent text-muted-foreground hover:border-border hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary"
    >
      {copied ? (
        <Check className="h-3 w-3 text-success" aria-hidden="true" />
      ) : (
        <Copy className="h-3 w-3" aria-hidden="true" />
      )}
    </button>
  );
}
