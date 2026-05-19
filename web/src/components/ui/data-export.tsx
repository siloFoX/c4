import {
  forwardRef,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import type {
  ChangeEvent,
  ForwardedRef,
  ReactNode,
} from 'react';
import { AlertCircle, Download, FileText, Loader2 } from 'lucide-react';
import { cn } from '../../lib/cn';

// (v1.11.448, TODO 11.430) DataExport primitive.
//
// Format selector (CSV / JSON / XLSX), filename input, and a
// view-vs-all scope toggle. The Export button fires
// `onExport({ format, filename, scope, onProgress })`; hosts
// stream progress back via the supplied `onProgress(0..1)`
// callback or pin a `progress` prop for fully-controlled
// behaviour. The primitive renders a progress bar + a
// disabled button while the export is in flight.
//
// Reference: /root/c4/arps-design-system-v1/.

export type ExportFormat = 'csv' | 'json' | 'xlsx';
export type ExportScope = 'view' | 'all';

export interface ExportInvocation {
  format: ExportFormat;
  filename: string;
  scope: ExportScope;
  onProgress?: (progress: number) => void;
}

export interface DataExportProps {
  formats?: readonly ExportFormat[];
  format?: ExportFormat;
  defaultFormat?: ExportFormat;
  filename?: string;
  defaultFilename?: string;
  baseFilename?: string;
  scope?: ExportScope;
  defaultScope?: ExportScope;
  onFormatChange?: (format: ExportFormat) => void;
  onFilenameChange?: (filename: string) => void;
  onScopeChange?: (scope: ExportScope) => void;
  onExport: (
    invocation: ExportInvocation,
  ) => Promise<void> | void;
  progress?: number;
  isExporting?: boolean;
  errorMessage?: ReactNode;
  className?: string;
  ariaLabel?: string;
  scopeLabels?: { view?: ReactNode; all?: ReactNode };
  formatLabels?: Partial<Record<ExportFormat, string>>;
  disabled?: boolean;
  showScopeToggle?: boolean;
}

// ---------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------

export const DEFAULT_EXPORT_FORMATS: readonly ExportFormat[] = [
  'csv',
  'json',
  'xlsx',
];
export const DEFAULT_EXPORT_FORMAT: ExportFormat = 'csv';
export const DEFAULT_EXPORT_SCOPE: ExportScope = 'view';
export const DEFAULT_EXPORT_BASE_FILENAME = 'data';

export const EXPORT_FORMAT_LABELS: Record<ExportFormat, string> = {
  csv: 'CSV',
  json: 'JSON',
  xlsx: 'XLSX',
};

const EXTENSION_BY_FORMAT: Record<ExportFormat, string> = {
  csv: 'csv',
  json: 'json',
  xlsx: 'xlsx',
};

export function getFileExtensionForFormat(format: ExportFormat): string {
  return EXTENSION_BY_FORMAT[format];
}

const UNSAFE_FILENAME_RE = /[\\/:*?"<>|\x00-\x1F]/g;

export function sanitizeFilename(filename: string): string {
  if (!filename) return '';
  return filename
    .replace(UNSAFE_FILENAME_RE, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function ensureFilenameHasExtension(
  filename: string,
  format: ExportFormat,
): string {
  const ext = getFileExtensionForFormat(format);
  if (!filename) return `${DEFAULT_EXPORT_BASE_FILENAME}.${ext}`;
  const lower = filename.toLowerCase();
  if (lower.endsWith(`.${ext}`)) return filename;
  // Strip an existing known extension first so flipping the
  // format does not stack `.csv.json` etc.
  for (const k of Object.keys(EXTENSION_BY_FORMAT) as ExportFormat[]) {
    if (lower.endsWith(`.${EXTENSION_BY_FORMAT[k]}`)) {
      return `${filename.slice(0, -1 - EXTENSION_BY_FORMAT[k].length)}.${ext}`;
    }
  }
  return `${filename}.${ext}`;
}

export function getDefaultExportFilename(
  format: ExportFormat,
  scope: ExportScope,
  base: string = DEFAULT_EXPORT_BASE_FILENAME,
): string {
  const ext = getFileExtensionForFormat(format);
  const safeBase = sanitizeFilename(base) || DEFAULT_EXPORT_BASE_FILENAME;
  const suffix = scope === 'all' ? '-all' : '';
  return `${safeBase}${suffix}.${ext}`;
}

export function formatProgressPercent(progress: number): string {
  if (!Number.isFinite(progress) || progress <= 0) return '0%';
  if (progress >= 1) return '100%';
  return `${Math.round(progress * 100)}%`;
}

// ---------------------------------------------------------------
// Component
// ---------------------------------------------------------------

export const DataExport = forwardRef(function DataExport(
  {
    formats = DEFAULT_EXPORT_FORMATS,
    format,
    defaultFormat = DEFAULT_EXPORT_FORMAT,
    filename,
    defaultFilename,
    baseFilename = DEFAULT_EXPORT_BASE_FILENAME,
    scope,
    defaultScope = DEFAULT_EXPORT_SCOPE,
    onFormatChange,
    onFilenameChange,
    onScopeChange,
    onExport,
    progress,
    isExporting: isExportingProp,
    errorMessage,
    className,
    ariaLabel = 'Data export',
    scopeLabels,
    formatLabels,
    disabled = false,
    showScopeToggle = true,
  }: DataExportProps,
  ref: ForwardedRef<HTMLFormElement>,
) {
  const isFormatControlled = format !== undefined;
  const isFilenameControlled = filename !== undefined;
  const isScopeControlled = scope !== undefined;

  const [internalFormat, setInternalFormat] = useState<ExportFormat>(
    () => defaultFormat,
  );
  const [internalScope, setInternalScope] = useState<ExportScope>(
    () => defaultScope,
  );
  const [internalFilename, setInternalFilename] = useState<string>(
    () =>
      defaultFilename ??
      getDefaultExportFilename(
        defaultFormat,
        defaultScope,
        baseFilename,
      ),
  );
  const [internalProgress, setInternalProgress] = useState<number>(0);
  const [internalExporting, setInternalExporting] = useState<boolean>(
    false,
  );

  const effectiveFormat = isFormatControlled
    ? (format ?? defaultFormat)
    : internalFormat;
  const effectiveScope = isScopeControlled
    ? (scope ?? defaultScope)
    : internalScope;
  const effectiveFilename = isFilenameControlled
    ? (filename ?? '')
    : internalFilename;
  const effectiveProgress =
    progress !== undefined ? progress : internalProgress;
  const effectiveExporting =
    isExportingProp !== undefined ? !!isExportingProp : internalExporting;

  const onFormatChangeRef = useRef(onFormatChange);
  const onFilenameChangeRef = useRef(onFilenameChange);
  const onScopeChangeRef = useRef(onScopeChange);
  useEffect(() => {
    onFormatChangeRef.current = onFormatChange;
  }, [onFormatChange]);
  useEffect(() => {
    onFilenameChangeRef.current = onFilenameChange;
  }, [onFilenameChange]);
  useEffect(() => {
    onScopeChangeRef.current = onScopeChange;
  }, [onScopeChange]);

  const handleFormatChange = useCallback(
    (event: ChangeEvent<HTMLSelectElement>) => {
      const next = event.target.value as ExportFormat;
      if (!isFormatControlled) setInternalFormat(next);
      onFormatChangeRef.current?.(next);
      // When the format changes, rewrite the filename
      // extension to keep them in sync. Only adjust the
      // uncontrolled internal filename -- if the host is
      // driving filename, they own the rename.
      if (!isFilenameControlled) {
        setInternalFilename((prev) =>
          ensureFilenameHasExtension(prev, next),
        );
      }
    },
    [isFilenameControlled, isFormatControlled],
  );

  const handleScopeChange = useCallback(
    (next: ExportScope) => {
      if (!isScopeControlled) setInternalScope(next);
      onScopeChangeRef.current?.(next);
    },
    [isScopeControlled],
  );

  const handleFilenameChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      const next = sanitizeFilename(event.target.value);
      if (!isFilenameControlled) setInternalFilename(next);
      onFilenameChangeRef.current?.(next);
    },
    [isFilenameControlled],
  );

  const handleProgress = useCallback(
    (next: number) => {
      // Always update the internal mirror so the rendered
      // progress reflects what the host reports, even when
      // `progress` is uncontrolled.
      setInternalProgress(next);
    },
    [],
  );

  const handleExport = useCallback(
    async (event?: { preventDefault?: () => void }) => {
      event?.preventDefault?.();
      if (disabled || effectiveExporting) return;
      const filenameWithExt = ensureFilenameHasExtension(
        effectiveFilename ||
          getDefaultExportFilename(
            effectiveFormat,
            effectiveScope,
            baseFilename,
          ),
        effectiveFormat,
      );
      const invocation: ExportInvocation = {
        format: effectiveFormat,
        filename: filenameWithExt,
        scope: effectiveScope,
        onProgress: handleProgress,
      };
      if (isExportingProp === undefined) {
        setInternalExporting(true);
        setInternalProgress(0);
      }
      try {
        await onExport(invocation);
      } finally {
        if (isExportingProp === undefined) {
          setInternalExporting(false);
        }
      }
    },
    [
      baseFilename,
      disabled,
      effectiveExporting,
      effectiveFilename,
      effectiveFormat,
      effectiveScope,
      handleProgress,
      isExportingProp,
      onExport,
    ],
  );

  const formatLabelFor = useCallback(
    (f: ExportFormat) => formatLabels?.[f] ?? EXPORT_FORMAT_LABELS[f],
    [formatLabels],
  );
  const viewLabel = scopeLabels?.view ?? 'Current view';
  const allLabel = scopeLabels?.all ?? 'All data';

  const exportDisabled =
    disabled || effectiveExporting || !effectiveFilename;
  const percent = formatProgressPercent(effectiveProgress);
  const percentValue = Math.max(0, Math.min(1, effectiveProgress)) * 100;

  return (
    <form
      ref={ref}
      role="form"
      aria-label={ariaLabel}
      data-section="data-export"
      data-format={effectiveFormat}
      data-scope={effectiveScope}
      data-exporting={effectiveExporting ? 'true' : 'false'}
      data-disabled={disabled ? 'true' : 'false'}
      onSubmit={handleExport}
      className={cn(
        'flex w-full flex-col gap-3 rounded-md border border-border bg-card p-4',
        className,
      )}
    >
      <div
        data-section="data-export-row"
        className="flex flex-col gap-3 md:flex-row md:items-end md:gap-4"
      >
        <label
          data-section="data-export-format-label"
          className="flex flex-1 flex-col gap-1 text-xs font-medium uppercase tracking-wide text-muted-foreground"
        >
          Format
          <select
            value={effectiveFormat}
            onChange={handleFormatChange}
            disabled={disabled || effectiveExporting}
            aria-label="Export format"
            data-section="data-export-format"
            className="h-9 rounded border border-border bg-background px-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            {formats.map((f) => (
              <option key={f} value={f}>
                {formatLabelFor(f)}
              </option>
            ))}
          </select>
        </label>
        <label
          data-section="data-export-filename-label"
          className="flex flex-1 flex-col gap-1 text-xs font-medium uppercase tracking-wide text-muted-foreground"
        >
          Filename
          <input
            type="text"
            value={effectiveFilename}
            onChange={handleFilenameChange}
            disabled={disabled || effectiveExporting}
            aria-label="Export filename"
            data-section="data-export-filename"
            className="h-9 rounded border border-border bg-background px-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          />
        </label>
        {showScopeToggle ? (
          <div
            data-section="data-export-scope"
            role="radiogroup"
            aria-label="Export scope"
            className="flex items-center gap-1 rounded-md border border-border bg-muted/30 p-0.5"
          >
            <button
              type="button"
              role="radio"
              aria-checked={effectiveScope === 'view'}
              data-section="data-export-scope-view"
              data-active={effectiveScope === 'view' ? 'true' : 'false'}
              disabled={disabled || effectiveExporting}
              onClick={() => handleScopeChange('view')}
              className={cn(
                'rounded px-3 py-1 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
                effectiveScope === 'view'
                  ? 'bg-background font-medium text-foreground shadow'
                  : 'text-muted-foreground',
              )}
            >
              {viewLabel}
            </button>
            <button
              type="button"
              role="radio"
              aria-checked={effectiveScope === 'all'}
              data-section="data-export-scope-all"
              data-active={effectiveScope === 'all' ? 'true' : 'false'}
              disabled={disabled || effectiveExporting}
              onClick={() => handleScopeChange('all')}
              className={cn(
                'rounded px-3 py-1 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
                effectiveScope === 'all'
                  ? 'bg-background font-medium text-foreground shadow'
                  : 'text-muted-foreground',
              )}
            >
              {allLabel}
            </button>
          </div>
        ) : null}
      </div>
      {effectiveExporting ? (
        <div
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(percentValue)}
          aria-valuetext={percent}
          data-section="data-export-progress"
          data-progress={effectiveProgress}
          className="flex items-center gap-2"
        >
          <Loader2
            aria-hidden="true"
            className="h-4 w-4 motion-safe:animate-spin"
          />
          <div
            data-section="data-export-progress-track"
            className="relative h-1.5 flex-1 overflow-hidden rounded bg-muted"
          >
            <div
              aria-hidden="true"
              data-section="data-export-progress-fill"
              style={{ width: `${percentValue}%` }}
              className="absolute inset-y-0 left-0 bg-primary transition-[width] duration-200"
            />
          </div>
          <span
            data-section="data-export-progress-label"
            className="font-mono text-xs tabular-nums text-muted-foreground"
          >
            {percent}
          </span>
        </div>
      ) : null}
      {errorMessage !== undefined ? (
        <div
          role="alert"
          data-section="data-export-error"
          className="flex items-start gap-2 rounded border border-destructive/40 bg-destructive/10 px-2 py-1 text-xs text-destructive"
        >
          <AlertCircle aria-hidden="true" className="mt-0.5 h-3 w-3" />
          <span>{errorMessage}</span>
        </div>
      ) : null}
      <div
        data-section="data-export-actions"
        className="flex justify-end"
      >
        <button
          type="submit"
          data-section="data-export-submit"
          aria-label="Export data"
          disabled={exportDisabled}
          className="inline-flex h-9 items-center gap-2 rounded bg-primary px-3 text-sm font-medium text-primary-foreground hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50"
        >
          {effectiveExporting ? (
            <Loader2
              aria-hidden="true"
              className="h-4 w-4 motion-safe:animate-spin"
            />
          ) : (
            <Download aria-hidden="true" className="h-4 w-4" />
          )}
          {effectiveExporting ? 'Exporting...' : 'Export'}
        </button>
      </div>
      <span
        aria-hidden="true"
        data-section="data-export-format-icon"
        className="hidden"
      >
        <FileText className="h-4 w-4" />
      </span>
    </form>
  );
});

DataExport.displayName = 'DataExport';
