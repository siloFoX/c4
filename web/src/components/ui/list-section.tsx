import {
  forwardRef,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type {
  ForwardedRef,
  KeyboardEvent as ReactKeyboardEvent,
  ReactNode,
} from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { cn } from '../../lib/cn';

// (v1.11.431, TODO 11.413) ListSection primitive.
//
// Grouped list rows with section header (label + count badge),
// collapsible groups, and optional sticky headers on scroll.
//
// Reference: /root/c4/arps-design-system-v1/.

export interface ListSectionItem {
  id: string | number;
  content: ReactNode;
  ariaLabel?: string;
}

export interface ListSectionGroup {
  id: string;
  label: ReactNode;
  items: ListSectionItem[];
  defaultCollapsed?: boolean;
  count?: number;
  description?: ReactNode;
  badge?: ReactNode;
}

export interface ListSectionProps {
  groups: ListSectionGroup[];
  collapsedGroups?: string[];
  defaultCollapsedGroups?: string[];
  onCollapsedGroupsChange?: (ids: string[]) => void;
  collapsible?: boolean;
  showBadges?: boolean;
  stickyHeaders?: boolean;
  ariaLabel?: string;
  className?: string;
  renderItem?: (
    item: ListSectionItem,
    group: ListSectionGroup,
  ) => ReactNode;
  emptyLabel?: ReactNode;
}

// ---------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------

export function isGroupCollapsed(
  groupId: string,
  collapsedSet: Set<string>,
): boolean {
  return collapsedSet.has(groupId);
}

export function getGroupCount(group: ListSectionGroup): number {
  if (typeof group.count === 'number' && Number.isFinite(group.count)) {
    return Math.max(0, Math.floor(group.count));
  }
  return group.items.length;
}

export function totalItemCount(groups: ListSectionGroup[]): number {
  let total = 0;
  for (const g of groups) total += getGroupCount(g);
  return total;
}

export function visibleItemCount(
  groups: ListSectionGroup[],
  collapsedSet: Set<string>,
): number {
  let total = 0;
  for (const g of groups) {
    if (!collapsedSet.has(g.id)) {
      total += getGroupCount(g);
    }
  }
  return total;
}

// ---------------------------------------------------------------
// Component
// ---------------------------------------------------------------

export const ListSection = forwardRef(function ListSection(
  {
    groups,
    collapsedGroups,
    defaultCollapsedGroups,
    onCollapsedGroupsChange,
    collapsible = true,
    showBadges = true,
    stickyHeaders = true,
    ariaLabel = 'List',
    className,
    renderItem,
    emptyLabel = '(no items)',
  }: ListSectionProps,
  ref: ForwardedRef<HTMLDivElement>,
) {
  const isControlled = collapsedGroups !== undefined;

  // Seed: explicit defaultCollapsedGroups + groups with
  // defaultCollapsed=true.
  const initialCollapsed = useMemo<Set<string>>(() => {
    const set = new Set<string>(defaultCollapsedGroups ?? []);
    for (const g of groups) {
      if (g.defaultCollapsed) set.add(g.id);
    }
    return set;
    // Intentional one-time mount seed; subsequent prop changes
    // do not bash the user's interactive state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [internalCollapsed, setInternalCollapsed] =
    useState<Set<string>>(initialCollapsed);

  const effectiveCollapsed = useMemo<Set<string>>(() => {
    if (isControlled) return new Set(collapsedGroups ?? []);
    return internalCollapsed;
  }, [isControlled, collapsedGroups, internalCollapsed]);

  const onCollapsedChangeRef = useRef(onCollapsedGroupsChange);
  useEffect(() => {
    onCollapsedChangeRef.current = onCollapsedGroupsChange;
  }, [onCollapsedGroupsChange]);

  const setCollapsed = useCallback(
    (next: Set<string>) => {
      if (!isControlled) setInternalCollapsed(next);
      onCollapsedChangeRef.current?.(Array.from(next));
    },
    [isControlled],
  );

  const toggleGroup = useCallback(
    (groupId: string) => {
      if (!collapsible) return;
      const next = new Set(effectiveCollapsed);
      if (next.has(groupId)) next.delete(groupId);
      else next.add(groupId);
      setCollapsed(next);
    },
    [collapsible, effectiveCollapsed, setCollapsed],
  );

  const handleHeaderKeyDown = useCallback(
    (groupId: string, event: ReactKeyboardEvent<HTMLButtonElement>) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        toggleGroup(groupId);
      }
    },
    [toggleGroup],
  );

  if (groups.length === 0) {
    return (
      <div
        ref={ref}
        role="list"
        aria-label={ariaLabel}
        data-section="list-section"
        data-empty="true"
        data-group-count="0"
        className={cn(
          'flex flex-col items-start text-xs text-muted-foreground',
          className,
        )}
      >
        <span data-section="list-section-empty">{emptyLabel}</span>
      </div>
    );
  }

  return (
    <div
      ref={ref}
      role="list"
      aria-label={ariaLabel}
      data-section="list-section"
      data-empty="false"
      data-group-count={groups.length}
      data-total-items={totalItemCount(groups)}
      data-sticky-headers={stickyHeaders ? 'true' : 'false'}
      data-collapsible={collapsible ? 'true' : 'false'}
      className={cn(
        'flex flex-col divide-y divide-border/30',
        className,
      )}
    >
      {groups.map((group) => {
        const collapsed = effectiveCollapsed.has(group.id);
        const count = getGroupCount(group);
        const headerId = `list-section-header-${group.id}`;
        const bodyId = `list-section-body-${group.id}`;
        return (
          <section
            key={group.id}
            role="region"
            aria-labelledby={headerId}
            data-section="list-section-group"
            data-group-id={group.id}
            data-collapsed={collapsed ? 'true' : 'false'}
            data-count={count}
            className="flex flex-col"
          >
            <button
              type="button"
              id={headerId}
              data-section="list-section-header"
              data-group-id={group.id}
              aria-expanded={collapsible ? !collapsed : undefined}
              aria-controls={bodyId}
              disabled={!collapsible}
              onClick={() => toggleGroup(group.id)}
              onKeyDown={(e) => handleHeaderKeyDown(group.id, e)}
              className={cn(
                'flex w-full items-center justify-between gap-2 border-b border-border/20 bg-card px-3 py-1.5 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
                stickyHeaders && 'sticky top-0 z-10',
                collapsible && 'hover:bg-muted/40',
                !collapsible && 'cursor-default',
              )}
            >
              <span className="flex items-center gap-2">
                {collapsible ? (
                  <span
                    aria-hidden="true"
                    data-section="list-section-chevron"
                    className="text-muted-foreground"
                  >
                    {collapsed ? (
                      <ChevronRight className="h-3.5 w-3.5" />
                    ) : (
                      <ChevronDown className="h-3.5 w-3.5" />
                    )}
                  </span>
                ) : null}
                <span data-section="list-section-label">
                  {group.label}
                </span>
                {showBadges ? (
                  group.badge !== undefined ? (
                    <span
                      data-section="list-section-badge-slot"
                      className="ml-1"
                    >
                      {group.badge}
                    </span>
                  ) : (
                    <span
                      data-section="list-section-count"
                      data-group-id={group.id}
                      aria-label={`${count} items`}
                      className="ml-1 rounded-full border border-border bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground"
                    >
                      {count}
                    </span>
                  )
                ) : null}
              </span>
              {group.description ? (
                <span
                  data-section="list-section-description"
                  className="truncate text-[10px] font-normal normal-case text-muted-foreground"
                >
                  {group.description}
                </span>
              ) : null}
            </button>
            {!collapsed ? (
              <ul
                id={bodyId}
                role="list"
                aria-label={`${
                  typeof group.label === 'string'
                    ? group.label
                    : group.id
                } items`}
                data-section="list-section-body"
                data-group-id={group.id}
                className="flex flex-col"
              >
                {group.items.length === 0 ? (
                  <li
                    data-section="list-section-empty-group"
                    data-group-id={group.id}
                    className="px-3 py-1 text-xs text-muted-foreground"
                  >
                    {emptyLabel}
                  </li>
                ) : (
                  group.items.map((item) => (
                    <li
                      key={item.id}
                      role="listitem"
                      aria-label={item.ariaLabel}
                      data-section="list-section-item"
                      data-item-id={String(item.id)}
                      data-group-id={group.id}
                      className="px-3 py-1.5"
                    >
                      {renderItem
                        ? renderItem(item, group)
                        : item.content}
                    </li>
                  ))
                )}
              </ul>
            ) : null}
          </section>
        );
      })}
    </div>
  );
});

ListSection.displayName = 'ListSection';
