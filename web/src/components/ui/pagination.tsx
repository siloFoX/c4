import { useState, type FormEvent, type KeyboardEvent } from 'react';
import { cn } from '../../lib/cn';
import { Button } from './button';

export interface PaginationProps {
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  siblingCount?: number;
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
}

const ELLIPSIS = '...';

function buildPageItems(
  page: number,
  totalPages: number,
  siblingCount: number,
): Array<number | typeof ELLIPSIS> {
  if (totalPages <= 1) return [1];

  // Window: first, last, current +/- siblingCount, plus an ellipsis on
  // each side when there's a gap of more than one page.
  const first = 1;
  const last = totalPages;
  const start = Math.max(first + 1, page - siblingCount);
  const end = Math.min(last - 1, page + siblingCount);

  const items: Array<number | typeof ELLIPSIS> = [first];
  if (start > first + 1) items.push(ELLIPSIS);
  for (let i = start; i <= end; i++) items.push(i);
  if (end < last - 1) items.push(ELLIPSIS);
  if (last !== first) items.push(last);
  return items;
}

export function Pagination({
  page,
  totalPages,
  onPageChange,
  siblingCount = 1,
  className,
  prevLabel = 'Prev',
  nextLabel = 'Next',
  showFirstLast = false,
  firstLabel = 'First',
  lastLabel = 'Last',
  showJumpToPage = false,
  jumpToPageLabel = 'Jump to page',
  ariaLabel = 'Pagination',
}: PaginationProps) {
  const safeTotal = Math.max(1, totalPages);
  const safePage = Math.min(Math.max(1, page), safeTotal);
  const items = buildPageItems(safePage, safeTotal, Math.max(0, siblingCount));

  const goTo = (target: number) => {
    if (target < 1 || target > safeTotal || target === safePage) return;
    onPageChange(target);
  };

  // (v1.11.282, TODO 11.264) jump-to-page draft state. Stays local
  // because the operator's keystrokes should not bubble into the
  // controlled `page` prop until they commit via Enter / Go.
  const [jumpDraft, setJumpDraft] = useState<string>('');
  const submitJump = () => {
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
      className={cn('flex flex-wrap items-center gap-1', className)}
    >
      {showFirstLast ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={safePage <= 1}
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
        disabled={safePage <= 1}
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
            aria-current={item === safePage ? 'page' : undefined}
            aria-label={`Page ${item}`}
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
        disabled={safePage >= safeTotal}
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
          disabled={safePage >= safeTotal}
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
            onChange={(e) => setJumpDraft(e.target.value)}
            onKeyDown={onJumpKeyDown}
            className="h-8 w-14 rounded-md border border-input bg-background px-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1 focus-visible:ring-offset-background"
          />
          <Button
            type="submit"
            variant="outline"
            size="sm"
            data-pagination-action="jump"
            disabled={jumpDraft.trim() === ''}
          >
            Go
          </Button>
        </form>
      ) : null}
    </nav>
  );
}
