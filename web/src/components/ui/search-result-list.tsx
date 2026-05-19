import {
  Fragment,
  forwardRef,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import type {
  ForwardedRef,
  KeyboardEvent as ReactKeyboardEvent,
  ReactNode,
} from 'react';
import { FileText } from 'lucide-react';
import { cn } from '../../lib/cn';

// (v1.11.443, TODO 11.425) SearchResultList primitive.
//
// Renders a list of search results with per-row title
// highlighting against the current query, an optional snippet
// preview, a per-row type icon slot, full keyboard navigation
// (ArrowUp/Down/Home/End/Enter), and an infinite-scroll
// loader fed by an IntersectionObserver pinned to a sentinel
// at the bottom of the list.
//
// Reference: /root/c4/arps-design-system-v1/.

export interface SearchResultItem {
  id: string;
  title: string;
  snippet?: string;
  type?: string;
  icon?: ReactNode;
  url?: string;
  metadata?: Record<string, ReactNode>;
}

export interface SearchResultRenderArgs {
  item: SearchResultItem;
  isActive: boolean;
  highlightedTitle: ReactNode;
  highlightedSnippet: ReactNode;
  onSelect: () => void;
}

export interface SearchResultListProps {
  results: SearchResultItem[];
  query?: string;
  activeId?: string | null;
  defaultActiveId?: string | null;
  onActiveChange?: (id: string | null) => void;
  onSelect?: (item: SearchResultItem) => void;
  loading?: boolean;
  hasMore?: boolean;
  onLoadMore?: () => void;
  emptyState?: ReactNode;
  loadingState?: ReactNode;
  loadMoreThreshold?: string;
  ariaLabel?: string;
  className?: string;
  highlightSnippet?: boolean;
  renderItem?: (args: SearchResultRenderArgs) => ReactNode;
}

// ---------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------

export const DEFAULT_SEARCH_LOAD_MORE_THRESHOLD = '200px';

const REGEX_SPECIALS = /[.*+?^${}()|[\]\\]/g;

export function escapeRegexForHighlight(query: string): string {
  return query.replace(REGEX_SPECIALS, '\\$&');
}

export function highlightMatches(
  text: string,
  query: string | undefined | null,
): ReactNode {
  if (!query) return text;
  const trimmed = query.trim();
  if (!trimmed) return text;
  const escaped = escapeRegexForHighlight(trimmed);
  let regex: RegExp;
  try {
    regex = new RegExp(`(${escaped})`, 'gi');
  } catch {
    return text;
  }
  const parts = text.split(regex);
  return (
    <>
      {parts.map((part, index) =>
        index % 2 === 1 ? (
          <mark
            key={`mark-${index}`}
            data-section="search-result-mark"
            className="rounded bg-yellow-200 px-0.5 text-foreground dark:bg-yellow-500/30"
          >
            {part}
          </mark>
        ) : (
          <Fragment key={`text-${index}`}>{part}</Fragment>
        ),
      )}
    </>
  );
}

export function getNextActiveId(
  currentId: string | null,
  items: readonly SearchResultItem[],
  direction: 'next' | 'previous' | 'first' | 'last',
): string | null {
  if (items.length === 0) return null;
  if (direction === 'first') return items[0]!.id;
  if (direction === 'last') return items[items.length - 1]!.id;
  const currentIndex = items.findIndex((it) => it.id === currentId);
  if (direction === 'next') {
    if (currentIndex < 0) return items[0]!.id;
    const nextIndex = Math.min(currentIndex + 1, items.length - 1);
    return items[nextIndex]!.id;
  }
  // previous
  if (currentIndex < 0) return items[0]!.id;
  const prevIndex = Math.max(currentIndex - 1, 0);
  return items[prevIndex]!.id;
}

// ---------------------------------------------------------------
// Component
// ---------------------------------------------------------------

export const SearchResultList = forwardRef(function SearchResultList(
  {
    results,
    query,
    activeId,
    defaultActiveId = null,
    onActiveChange,
    onSelect,
    loading = false,
    hasMore = false,
    onLoadMore,
    emptyState = 'No results',
    loadingState = 'Loading...',
    loadMoreThreshold = DEFAULT_SEARCH_LOAD_MORE_THRESHOLD,
    ariaLabel = 'Search results',
    className,
    highlightSnippet = false,
    renderItem,
  }: SearchResultListProps,
  ref: ForwardedRef<HTMLDivElement>,
) {
  const isControlled = activeId !== undefined;
  const [internalActive, setInternalActive] = useState<string | null>(
    defaultActiveId,
  );
  const effectiveActive = isControlled
    ? (activeId ?? null)
    : internalActive;

  const onActiveChangeRef = useRef(onActiveChange);
  const onLoadMoreRef = useRef(onLoadMore);
  useEffect(() => {
    onActiveChangeRef.current = onActiveChange;
  }, [onActiveChange]);
  useEffect(() => {
    onLoadMoreRef.current = onLoadMore;
  }, [onLoadMore]);

  const emitActive = useCallback(
    (next: string | null) => {
      if (!isControlled) setInternalActive(next);
      onActiveChangeRef.current?.(next);
    },
    [isControlled],
  );

  const handleSelect = useCallback(
    (item: SearchResultItem) => {
      emitActive(item.id);
      onSelect?.(item);
    },
    [emitActive, onSelect],
  );

  // --- Keyboard navigation -------------------------------
  const handleKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLDivElement>) => {
      if (results.length === 0) return;
      switch (event.key) {
        case 'ArrowDown':
          event.preventDefault();
          emitActive(getNextActiveId(effectiveActive, results, 'next'));
          break;
        case 'ArrowUp':
          event.preventDefault();
          emitActive(
            getNextActiveId(effectiveActive, results, 'previous'),
          );
          break;
        case 'Home':
          event.preventDefault();
          emitActive(getNextActiveId(effectiveActive, results, 'first'));
          break;
        case 'End':
          event.preventDefault();
          emitActive(getNextActiveId(effectiveActive, results, 'last'));
          break;
        case 'Enter': {
          event.preventDefault();
          if (effectiveActive == null) return;
          const item = results.find((r) => r.id === effectiveActive);
          if (item) handleSelect(item);
          break;
        }
        default:
          break;
      }
    },
    [effectiveActive, emitActive, handleSelect, results],
  );

  // --- Infinite scroll sentinel --------------------------
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!hasMore) return undefined;
    if (typeof window === 'undefined') return undefined;
    if (typeof window.IntersectionObserver === 'undefined')
      return undefined;
    const sentinel = sentinelRef.current;
    if (!sentinel) return undefined;
    const observer = new window.IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            onLoadMoreRef.current?.();
            break;
          }
        }
      },
      { rootMargin: loadMoreThreshold },
    );
    observer.observe(sentinel);
    return () => {
      observer.disconnect();
    };
  }, [hasMore, loadMoreThreshold, results.length]);

  // Active item scroll-into-view on change (no-op on jsdom).
  const listRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (effectiveActive == null) return;
    const list = listRef.current;
    if (!list) return;
    const item = list.querySelector(
      `[data-item-id="${CSS.escape(effectiveActive)}"]`,
    );
    if (item instanceof HTMLElement) {
      if (typeof item.scrollIntoView === 'function') {
        item.scrollIntoView({ block: 'nearest' });
      }
    }
  }, [effectiveActive]);

  const setRefs = useCallback(
    (el: HTMLDivElement | null) => {
      listRef.current = el;
      if (typeof ref === 'function') ref(el);
      else if (ref) ref.current = el;
    },
    [ref],
  );

  const totalItems = results.length;
  const isEmpty = totalItems === 0 && !loading;

  return (
    <div
      ref={setRefs}
      role="listbox"
      aria-label={ariaLabel}
      aria-activedescendant={
        effectiveActive
          ? `search-result-${effectiveActive}`
          : undefined
      }
      tabIndex={0}
      onKeyDown={handleKeyDown}
      data-section="search-result-list"
      data-active-id={effectiveActive ?? ''}
      data-result-count={totalItems}
      data-loading={loading ? 'true' : 'false'}
      data-has-more={hasMore ? 'true' : 'false'}
      className={cn(
        'flex w-full flex-col overflow-y-auto outline-none focus-visible:ring-2 focus-visible:ring-primary',
        className,
      )}
    >
      {isEmpty ? (
        <div
          data-section="search-result-list-empty"
          className="px-3 py-6 text-center text-sm text-muted-foreground"
        >
          {emptyState}
        </div>
      ) : (
        results.map((item) => {
          const isActive = item.id === effectiveActive;
          const highlightedTitle = highlightMatches(item.title, query);
          const highlightedSnippet =
            highlightSnippet && item.snippet
              ? highlightMatches(item.snippet, query)
              : item.snippet;
          const onItemSelect = () => handleSelect(item);
          if (renderItem) {
            return (
              <Fragment key={item.id}>
                <div
                  id={`search-result-${item.id}`}
                  data-section="search-result-item"
                  data-item-id={item.id}
                  data-active={isActive ? 'true' : 'false'}
                  data-type={item.type ?? ''}
                  role="option"
                  aria-selected={isActive}
                >
                  {renderItem({
                    item,
                    isActive,
                    highlightedTitle,
                    highlightedSnippet,
                    onSelect: onItemSelect,
                  })}
                </div>
              </Fragment>
            );
          }
          return (
            <div
              key={item.id}
              id={`search-result-${item.id}`}
              role="option"
              aria-selected={isActive}
              data-section="search-result-item"
              data-item-id={item.id}
              data-active={isActive ? 'true' : 'false'}
              data-type={item.type ?? ''}
              onClick={onItemSelect}
              onMouseEnter={() => emitActive(item.id)}
              className={cn(
                'flex cursor-pointer items-start gap-3 border-b border-border px-3 py-2 last:border-b-0',
                isActive && 'bg-primary/10',
              )}
            >
              <span
                aria-hidden="true"
                data-section="search-result-icon"
                className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center text-muted-foreground"
              >
                {item.icon ?? <FileText className="h-4 w-4" />}
              </span>
              <div
                data-section="search-result-content"
                className="flex flex-1 flex-col gap-0.5"
              >
                <span
                  data-section="search-result-title"
                  className="text-sm font-medium text-foreground"
                >
                  {highlightedTitle}
                </span>
                {item.snippet !== undefined ? (
                  <span
                    data-section="search-result-snippet"
                    className="line-clamp-2 text-xs text-muted-foreground"
                  >
                    {highlightedSnippet}
                  </span>
                ) : null}
                {item.type !== undefined ? (
                  <span
                    data-section="search-result-type"
                    className="text-[10px] uppercase tracking-wide text-muted-foreground"
                  >
                    {item.type}
                  </span>
                ) : null}
              </div>
            </div>
          );
        })
      )}
      {loading ? (
        <div
          data-section="search-result-list-loading"
          className="px-3 py-3 text-center text-sm text-muted-foreground"
        >
          {loadingState}
        </div>
      ) : null}
      {hasMore ? (
        <div
          ref={sentinelRef}
          data-section="search-result-list-sentinel"
          aria-hidden="true"
          className="h-1 w-full"
        />
      ) : null}
    </div>
  );
});

SearchResultList.displayName = 'SearchResultList';
