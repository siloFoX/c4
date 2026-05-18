import { forwardRef, useMemo } from 'react';
import type { HTMLAttributes, ReactNode } from 'react';
import { X, RotateCcw, Trash2, CheckCircle2, AlertCircle } from 'lucide-react';
import { cn } from '../../lib/cn';
import { ProgressBar } from './progress';

// (v1.11.392, TODO 11.374) FileUploadProgress -- a panel that
// renders a per-file progress list (name / size / progress
// bar / status / per-row action) plus an aggregate summary.
// Pairs with `<FileDrop>` (11.270) and the `lib/file-upload`
// XHR helper (11.352). The dropzone collects files +
// emits `onAdd`; the host wires the upload pipeline, tracks
// per-file state, and feeds the resulting `items[]` into
// this primitive.
//
// Design constraints:
//   - The component is purely render-driven. State (which
//     items are pending / uploading / done / failed /
//     cancelled, current progress per row, error message)
//     is owned by the host.
//   - The component fires three optional callbacks:
//     `onCancel(id)` / `onRetry(id)` / `onRemove(id)`.
//     Buttons render conditionally per status so an
//     "uploading" row never shows Retry and a "success" row
//     never shows Cancel.
//   - The summary is a pure derivative of items[]; the host
//     can opt out via `showSummary={false}`.

export type UploadItemStatus =
  | 'pending'
  | 'uploading'
  | 'success'
  | 'error'
  | 'cancelled';

export interface UploadItem {
  // Unique identifier. The host owns the keying scheme
  // (typically `crypto.randomUUID()` or `file.name +
  // file.lastModified`).
  id: string;
  // Visible filename.
  name: string;
  // Optional size in bytes. When set, the row renders
  // "<formatSize(size)>" next to the name and the aggregate
  // summary computes bytes-done. When omitted, the row
  // shows progress as a bare percent.
  size?: number;
  // 0..1 (or 0..max if a custom `max` is supplied to the
  // formatter). Values outside [0, 1] are clamped by the
  // underlying `<ProgressBar>`.
  progress: number;
  status: UploadItemStatus;
  // Surfaced under the row when `status === 'error'`. Pure
  // presentation copy; the host owns the source-of-truth
  // string.
  error?: string;
}

export interface UploadSummary {
  total: number;
  done: number;
  failed: number;
  cancelled: number;
  uploading: number;
  pending: number;
  // Aggregate progress in 0..1. Averages per-row progress
  // across items (treating success=1 and cancelled/error as
  // 0 so the visible aggregate matches what the operator
  // sees row-by-row).
  overallProgress: number;
  // Total bytes across rows that supplied `size`. Rows with
  // no size are skipped (so a partial-size set still
  // produces a useful number).
  bytesTotal: number;
  // Sum of `size * progress` for rows with a known `size`.
  // For success rows the row's `progress` should be 1; for
  // cancelled/error rows the host typically leaves the last
  // progress value in place so the operator sees how far it
  // got before the abort.
  bytesDone: number;
}

// (v1.11.392, TODO 11.374) Pure helper exported for tests +
// alternate hosts that want to render their own summary
// chrome around the data.
export function summarizeUploads(items: UploadItem[]): UploadSummary {
  const total = items.length;
  let done = 0;
  let failed = 0;
  let cancelled = 0;
  let uploading = 0;
  let pending = 0;
  let progressAccum = 0;
  let bytesTotal = 0;
  let bytesDone = 0;
  for (const it of items) {
    if (it.status === 'success') done += 1;
    else if (it.status === 'error') failed += 1;
    else if (it.status === 'cancelled') cancelled += 1;
    else if (it.status === 'uploading') uploading += 1;
    else pending += 1;
    const p = clamp01(
      it.status === 'success' ? 1 : it.status === 'cancelled' || it.status === 'error' ? clamp01(it.progress) : it.progress,
    );
    progressAccum += p;
    if (typeof it.size === 'number' && it.size > 0) {
      bytesTotal += it.size;
      bytesDone += Math.round(it.size * clamp01(p));
    }
  }
  const overallProgress = total === 0 ? 0 : progressAccum / total;
  return {
    total,
    done,
    failed,
    cancelled,
    uploading,
    pending,
    overallProgress,
    bytesTotal,
    bytesDone,
  };
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

// (v1.11.392, TODO 11.374) Default byte formatter (IEC
// kibibyte ladder). Callers can override with `formatSize`.
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  const kib = bytes / 1024;
  if (kib < 1024) return `${kib.toFixed(1)} KiB`;
  const mib = kib / 1024;
  if (mib < 1024) return `${mib.toFixed(1)} MiB`;
  const gib = mib / 1024;
  return `${gib.toFixed(2)} GiB`;
}

// (v1.11.392, TODO 11.374) Per-status badge styling. Plain
// inline span instead of pulling in `<Badge>` so the row
// stays lightweight (no signal-icon padding).
const STATUS_BADGE: Record<UploadItemStatus, { className: string; label: string }> = {
  pending: { className: 'bg-muted text-muted-foreground', label: 'Queued' },
  uploading: { className: 'bg-info/15 text-info', label: 'Uploading' },
  success: { className: 'bg-success/15 text-success', label: 'Done' },
  error: { className: 'bg-destructive/15 text-destructive', label: 'Failed' },
  cancelled: { className: 'bg-muted text-muted-foreground', label: 'Cancelled' },
};

// (v1.11.392, TODO 11.374) Per-status progress-bar variant.
const PROGRESS_VARIANT: Record<UploadItemStatus, 'default' | 'success' | 'warning' | 'destructive' | 'info'> = {
  pending: 'default',
  uploading: 'info',
  success: 'success',
  error: 'destructive',
  cancelled: 'warning',
};

export interface FileUploadProgressProps
  extends Omit<HTMLAttributes<HTMLDivElement>, 'children'> {
  items: UploadItem[];
  // Fires when the operator clicks the cancel button on a
  // pending / uploading row.
  onCancel?: (id: string) => void;
  // Fires when the operator clicks the retry button on an
  // error row.
  onRetry?: (id: string) => void;
  // Fires when the operator clicks the trash button on a
  // success or cancelled row.
  onRemove?: (id: string) => void;
  // Override the byte formatter (defaults to IEC kib ladder).
  formatSize?: (bytes: number) => string;
  // Render the aggregate summary row above the per-file
  // list. Default true.
  showSummary?: boolean;
  // Override the empty-state copy. Default "No uploads."
  emptyContent?: ReactNode;
  ariaLabel?: string;
}

export const FileUploadProgress = forwardRef<
  HTMLDivElement,
  FileUploadProgressProps
>(function FileUploadProgress(
  {
    items,
    onCancel,
    onRetry,
    onRemove,
    formatSize = formatBytes,
    showSummary = true,
    emptyContent = 'No uploads.',
    ariaLabel = 'Uploads',
    className,
    ...rest
  },
  ref,
) {
  const summary = useMemo(() => summarizeUploads(items), [items]);

  return (
    <div
      ref={ref}
      role="region"
      aria-label={ariaLabel}
      data-section="file-upload-progress"
      data-count={items.length}
      data-done={summary.done}
      data-failed={summary.failed}
      data-uploading={summary.uploading}
      className={cn('flex flex-col gap-2 rounded-md border border-border bg-card p-3', className)}
      {...rest}
    >
      {showSummary && items.length > 0 ? (
        <div
          data-section="file-upload-progress-summary"
          className="flex items-center justify-between text-xs text-muted-foreground"
        >
          <span data-section="file-upload-progress-summary-text">
            {summary.done} of {summary.total} done
            {summary.failed > 0 ? `, ${summary.failed} failed` : null}
            {summary.cancelled > 0 ? `, ${summary.cancelled} cancelled` : null}
          </span>
          {summary.bytesTotal > 0 ? (
            <span data-section="file-upload-progress-summary-bytes">
              {formatSize(summary.bytesDone)} / {formatSize(summary.bytesTotal)}
            </span>
          ) : null}
        </div>
      ) : null}
      {items.length === 0 ? (
        <p
          data-section="file-upload-progress-empty"
          className="py-4 text-center text-sm text-muted-foreground"
        >
          {emptyContent}
        </p>
      ) : null}
      <ul
        data-section="file-upload-progress-list"
        className="flex flex-col gap-2"
      >
        {items.map((item) => {
          const badge = STATUS_BADGE[item.status];
          const canCancel =
            item.status === 'pending' || item.status === 'uploading';
          const canRetry = item.status === 'error';
          const canRemove =
            item.status === 'success' || item.status === 'cancelled';
          const safeProgress = clamp01(item.progress);
          return (
            <li
              key={item.id}
              data-section="file-upload-progress-item"
              data-status={item.status}
              data-id={item.id}
              className="flex flex-col gap-1 rounded-md border border-border bg-background px-3 py-2"
            >
              <div className="flex items-center gap-2">
                {item.status === 'success' ? (
                  <CheckCircle2
                    aria-hidden="true"
                    data-section="file-upload-progress-icon-success"
                    className="h-3.5 w-3.5 shrink-0 text-success"
                  />
                ) : item.status === 'error' ? (
                  <AlertCircle
                    aria-hidden="true"
                    data-section="file-upload-progress-icon-error"
                    className="h-3.5 w-3.5 shrink-0 text-destructive"
                  />
                ) : null}
                <span
                  data-section="file-upload-progress-name"
                  className="min-w-0 flex-1 truncate text-sm font-medium text-foreground"
                >
                  {item.name}
                </span>
                {typeof item.size === 'number' ? (
                  <span
                    data-section="file-upload-progress-size"
                    className="shrink-0 text-xs text-muted-foreground"
                  >
                    {formatSize(item.size)}
                  </span>
                ) : null}
                <span
                  data-section="file-upload-progress-status"
                  className={cn(
                    'shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold',
                    badge.className,
                  )}
                >
                  {badge.label}
                </span>
                <div
                  data-section="file-upload-progress-actions"
                  className="flex shrink-0 items-center gap-1"
                >
                  {canCancel && onCancel ? (
                    <button
                      type="button"
                      aria-label={`Cancel ${item.name}`}
                      data-section="file-upload-progress-cancel"
                      onClick={() => onCancel(item.id)}
                      className="inline-flex h-6 w-6 items-center justify-center rounded-sm text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                    >
                      <X aria-hidden="true" className="h-3.5 w-3.5" />
                    </button>
                  ) : null}
                  {canRetry && onRetry ? (
                    <button
                      type="button"
                      aria-label={`Retry ${item.name}`}
                      data-section="file-upload-progress-retry"
                      onClick={() => onRetry(item.id)}
                      className="inline-flex h-6 w-6 items-center justify-center rounded-sm text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                    >
                      <RotateCcw aria-hidden="true" className="h-3.5 w-3.5" />
                    </button>
                  ) : null}
                  {canRemove && onRemove ? (
                    <button
                      type="button"
                      aria-label={`Remove ${item.name}`}
                      data-section="file-upload-progress-remove"
                      onClick={() => onRemove(item.id)}
                      className="inline-flex h-6 w-6 items-center justify-center rounded-sm text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                    >
                      <Trash2 aria-hidden="true" className="h-3.5 w-3.5" />
                    </button>
                  ) : null}
                </div>
              </div>
              <ProgressBar
                value={safeProgress * 100}
                max={100}
                size="sm"
                variant={PROGRESS_VARIANT[item.status]}
                ariaLabel={`${item.name} ${badge.label}`}
                data-section="file-upload-progress-bar"
              />
              {item.status === 'error' && item.error ? (
                <p
                  data-section="file-upload-progress-error"
                  className="text-xs text-destructive"
                >
                  {item.error}
                </p>
              ) : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
});
FileUploadProgress.displayName = 'FileUploadProgress';
