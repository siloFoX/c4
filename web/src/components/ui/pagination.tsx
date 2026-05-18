import { useState, type FormEvent, type KeyboardEvent } from 'react';
import { cn } from '../../lib/cn';
import { Button } from './button';

export interface PaginationProps {
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  siblingCount?: number;
  // (v1.11.407, TODO 11.389) Number of pages shown at each
  // boundary (always-visible first + last cluster). Default 1
  // -- matches the legacy 11.281 layout. Increase to 2 for
  // very long lists where the operator wants to see "1, 2 ...
  // <current> ... N-1, N" as anchor points.
  boundaryCount?: number;
  className?: string;
  prevLabel?: string;
  nextLabel?: string;
  // (v1.11.282, TODO 11.264) Optional First / Last buttons.
  // Default: false (back-compat with v1.11.281 callers). When
  // true, two extra buttons bracket the prev / next pair.
  showFirstLast?: boolean;
  firstLabel?: string;
  lastLabel?: string;
  // (v1.11.282, TODO 11.264) Optional jump-to-page input. Default
  // false. When true, a numeric input + "Go" button render at the
  // tail of the nav so the operator can punch in a page number
  // directly on long lists.
  showJumpToPage?: boolean;
  jumpToPageLabel?: string;
  ariaLabel?: string;
  // (v1.11.407, TODO 11.389) Formatter for the per-page
  // `aria-label`. Default returns `"Page <n>"`. Callers can
  // localise (e.g. `(p) => t('pagination.page', { p })`) or
  // augment ("Page 3 of 10"). When the formatter throws or
  // returns an empty string, the legacy default is used.
  pageLabelFormatter?: (page: number) => string;
  // (v1.11.407, TODO 11.389) Disable every interactive
  // control. Useful when the table data is loading + the
  // operator should not change page mid-fetch. Default
  // `false` keeps every control live.
  disabled?: boolean;
}

const ELLIPSIS = '...';

// (v1.11.407, TODO 11.389) Exported for tests + adopters that
// want to render their own page-list chrome with the same
// ellipsis math.
export function buildPaginationItems(
  page: number,
  totalPages: number,
  siblingCount: number,
  boundaryCount: number = 1,
): Array<number | typeof ELLIPSIS> {
  if (totalPages <= 1) return [1];
  const safeBoundary = Math.max(1, boundaryCount);
  const safeSibling = Math.max(0, siblingCount);
  // Leading boundary pages: 1..safeBoundary (capped at total).
  const leadingEnd = Math.min(safeBoundary, totalPages);
  // Trailing boundary pages: (total - safeBoundary + 1)..total (>= leadingEnd+1).
  const trailingStart = Math.max(totalPages - safeBoundary + 1, leadingEnd + 1);
  // Window around the current page.
  const winStart = Math.max(leadingEnd + 1, page - safeSibling);
  const winEnd = Math.min(trailingStart - 1, page + safeSibling);

  const items: Array<number | typeof ELLIPSIS> = [];
  for (let i = 1; i <= leadingEnd; i += 1) items.push(i);
  if (winStart > leadingEnd + 1) items.push(ELLIPSIS);
  for (let i = winStart; i <= winEnd; i += 1) items.push(i);
  if (winEnd < trailingStart - 1) items.push(ELLIPSIS);
  for (let i = trailingStart; i <= totalPages; i += 1) items.push(i);
  return items;
}

// Legacy alias retained for any internal callers; the new
// helper above is the canonical export.
function buildPageItems(
  page: number,
  totalPages: number,
  siblingCount: number,
  boundaryCount: number = 1,
): Array<number | typeof ELLIPSIS> {
  return buildPaginationItems(page, totalPages, siblingCount, boundaryCount);
}

export function Pagination({
  page,
  totalPages,
  onPageChange,
  siblingCount = 1,
  boundaryCount = 1,
  className,
  prevLabel = 'Prev',
  nextLabel = 'Next',
  showFirstLast = false,
  firstLabel = 'First',
  lastLabel = 'Last',
  showJumpToPage = false,
  jumpToPageLabel = 'Jump to page',
  ariaLabel = 'Pagination',
  pageLabelFormatter,
  disabled = false,
}: PaginationProps) {
  const safeTotal = Math.max(1, totalPages);
  const safePage = Math.min(Math.max(1, page), safeTotal);
  const items = buildPageItems(
    safePage,
    safeTotal,
    Math.max(0, siblingCount),
    Math.max(1, boundaryCount),
  );

  const goTo = (target: number) => {
    if (disabled) return;
    if (target < 1 || target > safeTotal || target === safePage) return;
    onPageChange(target);
  };

  // (v1.11.407, TODO 11.389) Per-page aria-label resolver.
  // Wraps the user-supplied formatter in a try/catch so a
  // throw or empty return falls back to the legacy "Page N"
  // string -- assistive tech always gets a label.
  const pageLabel = (n: number): string => {
    if (!pageLabelFormatter) return `Page ${n}`;
    try {
      const out = pageLabelFormatter(n);
      if (typeof out === 'string' && out.length > 0) return out;
    } catch {
      /* fall through to default */
    }
    return `Page ${n}`;
  };

  // (v1.11.282, TODO 11.264) jump-to-page draft state. Stays local
  // because the operator's keystrokes should not bubble into the
  // controlled `page` prop until they commit via Enter / Go.
  const [jumpDraft, setJumpDraft] = useState<string>('');
  const submitJump = () => {
    if (disabled) return;
    const parsed = Number.parseInt(jumpDraft.trim(), 10);
    if (Number.isNaN(parsed)) return;
    const clamped = Math.min(Math.max(1, parsed), safeTotal);
    setJumpDraft('');
    if (clamped !== safePage) onPageChange(clamped);
  };
  const onJumpKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      submitJump();
    }
  };
  const onJumpFormSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    submitJump();
  };

  return (
    <nav
      role="navigation"
      aria-label={ariaLabel}
      data-section="pagination"
      data-current-page={safePage}
      data-total-pages={safeTotal}
      data-disabled={disabled ? 'true' : 'false'}
      className={cn('flex flex-wrap items-center gap-1', className)}
    >
      {showFirstLast ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={disabled || safePage <= 1}
          aria-label={firstLabel}
          data-pagination-action="first"
          onClick={() => goTo(1)}
        >
          {firstLabel}
        </Button>
      ) : null}
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={disabled || safePage <= 1}
        data-pagination-action="prev"
        onClick={() => goTo(safePage - 1)}
      >
        {prevLabel}
      </Button>
      {items.map((item, idx) =>
        item === ELLIPSIS ? (
          <span
            key={`ellipsis-${idx}`}
            aria-hidden="true"
            data-testid="pagination-ellipsis"
            data-section="pagination-ellipsis"
            className="px-2 text-sm text-muted-foreground"
          >
            {ELLIPSIS}
          </span>
        ) : (
          <Button
            key={item}
            type="button"
            variant={item === safePage ? 'default' : 'outline'}
            size="sm"
            disabled={disabled}
            aria-current={item === safePage ? 'page' : undefined}
            aria-label={pageLabel(item)}
            data-pagination-page={item}
            onClick={() => goTo(item)}
          >
            {item}
          </Button>
        ),
      )}
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={disabled || safePage >= safeTotal}
        data-pagination-action="next"
        onClick={() => goTo(safePage + 1)}
      >
        {nextLabel}
      </Button>
      {showFirstLast ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={disabled || safePage >= safeTotal}
          aria-label={lastLabel}
          data-pagination-action="last"
          onClick={() => goTo(safeTotal)}
        >
          {lastLabel}
        </Button>
      ) : null}
      {showJumpToPage ? (
        <form
          onSubmit={onJumpFormSubmit}
          data-pagination-jump-form="true"
          className="ml-1 inline-flex items-center gap-1"
        >
          <input
            type="number"
            inputMode="numeric"
            min={1}
            max={safeTotal}
            value={jumpDraft}
            placeholder={String(safePage)}
            aria-label={jumpToPageLabel}
            data-pagination-jump-input="true"
            disabled={disabled}
            onChange={(e) => setJumpDraft(e.target.value)}
            onKeyDown={onJumpKeyDown}
            className="h-8 w-14 rounded-md border border-input bg-background px-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50"
          />
          <Button
            type="submit"
            variant="outline"
            size="sm"
            data-pagination-action="jump"
            disabled={disabled || jumpDraft.trim() === ''}
          >
            Go
          </Button>
        </form>
      ) : null}
    </nav>
  );
}
