import {
  forwardRef,
  useCallback,
  useId,
  useRef,
  useState,
} from 'react';
import type { DragEvent, KeyboardEvent, ReactNode } from 'react';
import { FileText, Upload, X } from 'lucide-react';
import { cn } from '../../lib/cn';
import { Label } from './label';
import { ProgressBar, type ProgressBarVariant } from './progress';

// (v1.11.288, TODO 11.270) FileDrop -- drag-and-drop zone that
// extends FileInput's surface with two upload-workflow
// affordances:
//
//   1. Staged-files list -- each file the operator picks (or
//      drops) renders as a row beneath the dropzone with name +
//      size + remove button. Compatible with `multiple`; for
//      single-file mode the list collapses to at most one entry.
//   2. Progress bar slot -- when `progress` is set the dropzone
//      shows a ProgressBar at the bottom with an optional
//      `progressLabel` for the "Uploading <filename>..." copy.
//
// FileDrop is the canonical choice when the host page wants
// to upload the picked files (Snapshots, Templates import,
// Profiles import). FileInput remains the simpler primitive
// for "pick a file, hand it to a callback" flows.

export interface FileDropProps {
  // Passthrough from FileInput.
  label?: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  accept?: string;
  multiple?: boolean;
  maxSize?: number;
  disabled?: boolean;
  id?: string;
  name?: string;
  // FileDrop additions:
  // Controlled list of staged files (rendered below the
  // dropzone). When set, the host owns the array; `onAdd` /
  // `onRemove` callbacks fire on file pick / drop / remove.
  // When omitted, the component manages its own internal list.
  selectedFiles?: File[];
  onAdd?: (files: File[]) => void;
  onRemove?: (index: number, file: File) => void;
  onError?: (msg: string, file?: File) => void;
  // Upload progress (0..1 OR 0..100). When set the bottom
  // ProgressBar renders. Pass `null` (or omit) to hide.
  progress?: number | null;
  progressMax?: number; // defaults to 100
  progressLabel?: ReactNode;
  progressVariant?: ProgressBarVariant;
  // Render the bottom progress bar even when `progress` is
  // null/undefined -- useful when the host owns its own
  // ProgressBar via a child slot. Defaults to false.
  showProgress?: boolean;
  // Override the dropzone body so callers can swap in custom
  // copy / illustration. When omitted the canonical
  // "Drop files here or click to browse" copy renders.
  bodyContent?: ReactNode;
  className?: string;
}

const DROPZONE_CLASSES =
  'flex w-full min-h-[120px] cursor-pointer flex-col items-center justify-center gap-1 rounded-md border-2 border-dashed border-input bg-background px-4 py-6 text-sm text-muted-foreground transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background data-[active=true]:border-primary data-[active=true]:bg-muted/60 data-[disabled=true]:cursor-not-allowed data-[disabled=true]:opacity-50';

function acceptMatches(accept: string | undefined, file: File): boolean {
  if (!accept) return true;
  const parts = accept
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  if (parts.length === 0) return true;
  const fileType = (file.type || '').toLowerCase();
  const fileName = file.name.toLowerCase();
  return parts.some((p) => {
    if (p.startsWith('.')) return fileName.endsWith(p);
    if (p.endsWith('/*')) {
      const prefix = p.slice(0, -1);
      return fileType.startsWith(prefix);
    }
    return fileType === p;
  });
}

function formatBytes(size: number): string {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  if (size < 1024 * 1024 * 1024)
    return `${(size / 1024 / 1024).toFixed(1)} MB`;
  return `${(size / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

export const FileDrop = forwardRef<HTMLDivElement, FileDropProps>(
  (
    {
      label,
      hint,
      error,
      accept,
      multiple = false,
      maxSize,
      disabled,
      id,
      name,
      selectedFiles,
      onAdd,
      onRemove,
      onError,
      progress,
      progressMax = 100,
      progressLabel,
      progressVariant = 'default',
      showProgress = false,
      bodyContent,
      className,
    },
    ref,
  ) => {
    const generatedId = useId();
    const inputId = id ?? generatedId;
    const labelId = label != null ? `${inputId}-label` : undefined;
    const hintId = hint != null ? `${inputId}-hint` : undefined;
    const errorId = error != null ? `${inputId}-error` : undefined;
    const describedBy =
      [hintId, errorId].filter(Boolean).join(' ') || undefined;

    const inputRef = useRef<HTMLInputElement>(null);
    const [active, setActive] = useState(false);
    const dragDepth = useRef(0);
    const [internalFiles, setInternalFiles] = useState<File[]>([]);

    const isControlled = selectedFiles !== undefined;
    const stagedFiles: File[] = isControlled
      ? selectedFiles
      : internalFiles;

    const openPicker = useCallback(() => {
      if (disabled) return;
      inputRef.current?.click();
    }, [disabled]);

    const validate = useCallback(
      (incoming: File[]): { ok: File[]; reason?: string; offender?: File } => {
        if (!multiple && incoming.length > 1) {
          const offender = incoming[0];
          return offender
            ? { ok: [], reason: 'Only one file is allowed', offender }
            : { ok: [], reason: 'Only one file is allowed' };
        }
        for (const f of incoming) {
          if (!acceptMatches(accept, f)) {
            return {
              ok: [],
              reason: `File type not accepted: ${f.name}`,
              offender: f,
            };
          }
          if (typeof maxSize === 'number' && f.size > maxSize) {
            return {
              ok: [],
              reason: `File too large: ${f.name}`,
              offender: f,
            };
          }
        }
        return { ok: incoming };
      },
      [accept, maxSize, multiple],
    );

    const commitAdd = useCallback(
      (newOnes: File[]) => {
        if (!isControlled) {
          setInternalFiles((prev) =>
            multiple ? [...prev, ...newOnes] : newOnes.slice(0, 1),
          );
        }
        onAdd?.(newOnes);
      },
      [isControlled, multiple, onAdd],
    );

    const handleFiles = useCallback(
      (list: FileList | null) => {
        if (disabled || !list || list.length === 0) return;
        const incoming = Array.from(list);
        const result = validate(incoming);
        if (result.reason) {
          onError?.(result.reason, result.offender);
          return;
        }
        commitAdd(result.ok);
      },
      [disabled, validate, onError, commitAdd],
    );

    const handleRemove = useCallback(
      (idx: number) => {
        if (disabled) return;
        const file = stagedFiles[idx];
        if (!isControlled) {
          setInternalFiles((prev) => prev.filter((_, i) => i !== idx));
        }
        if (file) onRemove?.(idx, file);
      },
      [disabled, isControlled, onRemove, stagedFiles],
    );

    const onDragEnter = (e: DragEvent<HTMLDivElement>) => {
      if (disabled) return;
      e.preventDefault();
      dragDepth.current += 1;
      setActive(true);
    };
    const onDragOver = (e: DragEvent<HTMLDivElement>) => {
      if (disabled) return;
      e.preventDefault();
    };
    const onDragLeave = (e: DragEvent<HTMLDivElement>) => {
      if (disabled) return;
      e.preventDefault();
      dragDepth.current = Math.max(0, dragDepth.current - 1);
      if (dragDepth.current === 0) setActive(false);
    };
    const onDrop = (e: DragEvent<HTMLDivElement>) => {
      if (disabled) return;
      e.preventDefault();
      dragDepth.current = 0;
      setActive(false);
      handleFiles(e.dataTransfer?.files ?? null);
    };

    const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
      if (disabled) return;
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        openPicker();
      }
    };

    const hasProgress = progress != null || showProgress;

    return (
      <div
        className={cn('space-y-1.5', className)}
        data-section="file-drop"
        data-active={active ? 'true' : 'false'}
        data-disabled={disabled ? 'true' : 'false'}
      >
        {label != null ? (
          <Label id={labelId} htmlFor={inputId}>
            {label}
          </Label>
        ) : null}
        <div
          ref={ref}
          role="button"
          tabIndex={disabled ? -1 : 0}
          aria-disabled={disabled || undefined}
          aria-labelledby={labelId}
          aria-describedby={describedBy}
          data-section="file-drop-zone"
          data-active={active ? 'true' : 'false'}
          data-disabled={disabled ? 'true' : 'false'}
          onClick={openPicker}
          onKeyDown={onKeyDown}
          onDragEnter={onDragEnter}
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
          onDrop={onDrop}
          className={cn(
            DROPZONE_CLASSES,
            error != null && 'border-destructive',
          )}
        >
          {bodyContent ?? (
            <>
              <Upload
                aria-hidden="true"
                className="h-5 w-5 text-muted-foreground"
              />
              <span className="font-medium text-foreground">
                Drop files here or click to browse
              </span>
              <button
                type="button"
                tabIndex={-1}
                onClick={(e) => {
                  e.stopPropagation();
                  openPicker();
                }}
                disabled={disabled}
                className="text-xs text-primary underline-offset-2 hover:underline disabled:opacity-50"
              >
                Browse
              </button>
            </>
          )}
          <input
            ref={inputRef}
            id={inputId}
            name={name}
            type="file"
            accept={accept}
            multiple={multiple}
            disabled={disabled}
            className="sr-only"
            onChange={(e) => handleFiles(e.target.files)}
          />
        </div>
        {hint != null ? (
          <p id={hintId} className="text-xs text-muted-foreground">
            {hint}
          </p>
        ) : null}
        {error != null ? (
          <p id={errorId} role="alert" className="text-xs text-destructive">
            {error}
          </p>
        ) : null}
        {stagedFiles.length > 0 ? (
          <ul
            data-section="file-drop-staged"
            className="flex flex-col gap-1 rounded-md border border-border bg-card/40 p-2"
          >
            {stagedFiles.map((f, i) => (
              <li
                key={`${f.name}-${f.size}-${i}`}
                data-section="file-drop-staged-row"
                data-file-name={f.name}
                className="flex items-center gap-2 text-xs text-foreground"
              >
                <FileText
                  aria-hidden="true"
                  className="h-3.5 w-3.5 shrink-0 text-muted-foreground"
                />
                <span className="min-w-0 flex-1 truncate font-mono">
                  {f.name}
                </span>
                <span className="shrink-0 text-[11px] text-muted-foreground">
                  {formatBytes(f.size)}
                </span>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleRemove(i);
                  }}
                  disabled={disabled}
                  aria-label={`Remove ${f.name}`}
                  data-file-drop-remove={i}
                  className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-sm text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <X className="h-3 w-3" aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
        ) : null}
        {hasProgress ? (
          <div
            className="space-y-1"
            data-section="file-drop-progress"
          >
            <ProgressBar
              value={progress ?? 0}
              max={progressMax}
              variant={progressVariant}
              size="md"
              {...(progressLabel !== undefined
                ? { labelText: progressLabel }
                : {})}
            />
          </div>
        ) : null}
      </div>
    );
  },
);
FileDrop.displayName = 'FileDrop';
