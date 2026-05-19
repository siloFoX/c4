import {
  forwardRef,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import type {
  ForwardedRef,
  HTMLAttributes,
  ReactNode,
} from 'react';
import { Copy, Check } from 'lucide-react';
import { cn } from '../../lib/cn';

// (v1.11.425, TODO 11.407) DetailList primitive.
//
// Key-value pair list rendered as a native `<dl>` / `<dt>` /
// `<dd>` so the definition-list semantics flow into assistive
// tech without an ARIA shim. Two orientations:
//
//   - horizontal: `<dt>` left, `<dd>` right (compact metadata
//     panel pattern). Mobile collapses to vertical via a
//     responsive class so labels never crowd values on narrow
//     viewports.
//   - vertical (default): `<dt>` above `<dd>` (form-flavoured;
//     used by "Details" cards in the side rail).
//
// Each row exposes a copy-on-hover affordance: when the value is
// string-coercible (or the caller passes `copyValue`) a small
// copy button slides in. Click writes the resolved text to the
// system clipboard and fires `onCopy(item, text)` so hosts can
// record analytics. Copy success flips the icon to a checkmark
// for `copyFeedbackMs` (default 1500).
//
// Reference: /root/c4/arps-design-system-v1/.

export interface DetailListItem {
  id: string | number;
  label: ReactNode;
  value: ReactNode;
  copyValue?: string;
  copyable?: boolean;
  // Optional per-item `<dt>` aria-label override (defaults to
  // the textual label when it is a string).
  ariaLabel?: string;
}

export type DetailListOrientation = 'horizontal' | 'vertical';
export type DetailListSize = 'sm' | 'md' | 'lg';

export interface DetailListProps
  extends Omit<HTMLAttributes<HTMLElement>, 'onCopy'> {
  items: DetailListItem[];
  orientation?: DetailListOrientation;
  size?: DetailListSize;
  className?: string;
  ariaLabel?: string;
  showCopyOnHover?: boolean;
  copyLabel?: (item: DetailListItem) => string;
  onCopy?: (item: DetailListItem, text: string) => void;
  copyFeedbackMs?: number;
  emptyLabel?: ReactNode;
}

// ---------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------

export function getDetailListCopyText(
  item: DetailListItem,
): string | null {
  if (typeof item.copyValue === 'string') return item.copyValue;
  if (typeof item.value === 'string') return item.value;
  if (typeof item.value === 'number') return String(item.value);
  if (typeof item.value === 'bigint') return String(item.value);
  return null;
}

export function isDetailListItemCopyable(
  item: DetailListItem,
): boolean {
  if (item.copyable === false) return false;
  if (item.copyable === true) return true;
  return getDetailListCopyText(item) !== null;
}

// ---------------------------------------------------------------
// Component
// ---------------------------------------------------------------

const SIZE_CLASS: Record<DetailListSize, {
  row: string;
  label: string;
  value: string;
}> = {
  sm: {
    row: 'py-1 gap-2',
    label: 'text-[11px]',
    value: 'text-xs',
  },
  md: {
    row: 'py-1.5 gap-3',
    label: 'text-xs',
    value: 'text-sm',
  },
  lg: {
    row: 'py-2 gap-4',
    label: 'text-sm',
    value: 'text-base',
  },
};

export const DetailList = forwardRef(function DetailList(
  {
    items,
    orientation = 'vertical',
    size = 'md',
    className,
    ariaLabel = 'Details',
    showCopyOnHover = true,
    copyLabel,
    onCopy,
    copyFeedbackMs = 1500,
    emptyLabel = '(no details)',
    ...rest
  }: DetailListProps,
  ref: ForwardedRef<HTMLDListElement>,
) {
  const onCopyRef = useRef(onCopy);
  useEffect(() => {
    onCopyRef.current = onCopy;
  }, [onCopy]);

  const [copiedId, setCopiedId] = useState<string | number | null>(
    null,
  );
  const copyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  useEffect(() => {
    return () => {
      if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
    };
  }, []);

  const handleCopy = useCallback(
    async (item: DetailListItem) => {
      const text = getDetailListCopyText(item);
      if (text === null) return;
      onCopyRef.current?.(item, text);
      if (
        typeof navigator !== 'undefined' &&
        navigator.clipboard &&
        typeof navigator.clipboard.writeText === 'function'
      ) {
        try {
          await navigator.clipboard.writeText(text);
        } catch {
          // ignore -- onCopy is the reliable side-channel
        }
      }
      setCopiedId(item.id);
      if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
      copyTimerRef.current = setTimeout(() => {
        setCopiedId((current) =>
          current === item.id ? null : current,
        );
        copyTimerRef.current = null;
      }, copyFeedbackMs);
    },
    [copyFeedbackMs],
  );

  const sizeClass = SIZE_CLASS[size];

  if (items.length === 0) {
    return (
      <dl
        ref={ref}
        role="list"
        aria-label={ariaLabel}
        data-section="detail-list"
        data-orientation={orientation}
        data-size={size}
        data-empty="true"
        className={cn(
          'flex flex-col items-start text-muted-foreground',
          className,
        )}
        {...rest}
      >
        <span data-section="detail-list-empty" className="text-xs">
          {emptyLabel}
        </span>
      </dl>
    );
  }

  return (
    <dl
      ref={ref}
      role="list"
      aria-label={ariaLabel}
      data-section="detail-list"
      data-orientation={orientation}
      data-size={size}
      data-empty="false"
      data-item-count={items.length}
      className={cn(
        orientation === 'horizontal'
          ? 'flex flex-col divide-y divide-border/40'
          : 'flex flex-col divide-y divide-border/40',
        className,
      )}
      {...rest}
    >
      {items.map((item) => {
        const copyable =
          showCopyOnHover && isDetailListItemCopyable(item);
        const copyText = getDetailListCopyText(item);
        const labelString =
          item.ariaLabel ??
          (typeof item.label === 'string' ? item.label : String(item.id));
        const isCopied = copiedId === item.id;
        return (
          <div
            key={item.id}
            role="listitem"
            data-section="detail-list-row"
            data-detail-id={String(item.id)}
            data-orientation={orientation}
            data-copyable={copyable ? 'true' : 'false'}
            data-copied={isCopied ? 'true' : 'false'}
            className={cn(
              'group flex',
              orientation === 'horizontal'
                ? 'flex-col items-start gap-1 md:flex-row md:items-baseline md:justify-between'
                : 'flex-col items-start',
              sizeClass.row,
            )}
          >
            <dt
              data-section="detail-list-label"
              className={cn(
                'shrink-0 font-medium uppercase tracking-wide text-muted-foreground',
                sizeClass.label,
                orientation === 'horizontal' ? 'md:w-1/3' : 'mb-0.5',
              )}
            >
              {item.label}
            </dt>
            <dd
              data-section="detail-list-value"
              className={cn(
                'flex min-w-0 flex-1 items-center gap-2 text-foreground',
                sizeClass.value,
                orientation === 'horizontal' ? 'md:justify-end' : '',
              )}
            >
              <span
                data-section="detail-list-value-text"
                className="min-w-0 break-words"
              >
                {item.value}
              </span>
              {copyable && copyText !== null ? (
                <button
                  type="button"
                  aria-label={
                    copyLabel ? copyLabel(item) : `Copy ${labelString}`
                  }
                  data-section="detail-list-copy"
                  data-detail-id={String(item.id)}
                  onClick={(e) => {
                    e.stopPropagation();
                    void handleCopy(item);
                  }}
                  className={cn(
                    'shrink-0 rounded p-1 text-muted-foreground transition-opacity hover:bg-muted hover:text-foreground focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
                    'opacity-0 group-hover:opacity-100',
                    isCopied && 'opacity-100 text-success',
                  )}
                >
                  {isCopied ? (
                    <Check
                      className="h-3.5 w-3.5"
                      data-section="detail-list-copy-check"
                      aria-hidden="true"
                    />
                  ) : (
                    <Copy
                      className="h-3.5 w-3.5"
                      data-section="detail-list-copy-icon"
                      aria-hidden="true"
                    />
                  )}
                </button>
              ) : null}
            </dd>
          </div>
        );
      })}
    </dl>
  );
});

DetailList.displayName = 'DetailList';
