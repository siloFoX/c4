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
  ariaLabel = 'Pagination',
}: PaginationProps) {
  const safeTotal = Math.max(1, totalPages);
  const safePage = Math.min(Math.max(1, page), safeTotal);
  const items = buildPageItems(safePage, safeTotal, Math.max(0, siblingCount));

  const goTo = (target: number) => {
    if (target < 1 || target > safeTotal || target === safePage) return;
    onPageChange(target);
  };

  return (
    <nav
      role="navigation"
      aria-label={ariaLabel}
      className={cn('flex flex-wrap items-center gap-1', className)}
    >
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={safePage <= 1}
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
        onClick={() => goTo(safePage + 1)}
      >
        {nextLabel}
      </Button>
    </nav>
  );
}
