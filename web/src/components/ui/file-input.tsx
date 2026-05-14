import { forwardRef, useId, useRef, useState, useCallback } from 'react';
import type { DragEvent, KeyboardEvent, ReactNode } from 'react';
import { Label } from './label';
import { cn } from '../../lib/cn';

export interface FileInputProps {
  label?: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  accept?: string;
  multiple?: boolean;
  maxSize?: number;
  onFiles?: (files: File[]) => void;
  onError?: (msg: string, file?: File) => void;
  className?: string;
  disabled?: boolean;
  id?: string;
  name?: string;
}

const DROPZONE_CLASSES =
  'flex w-full min-h-[112px] cursor-pointer flex-col items-center justify-center gap-1 rounded-md border-2 border-dashed border-input bg-background px-4 py-6 text-sm text-muted-foreground transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background data-[active=true]:border-primary data-[active=true]:bg-muted/60 data-[disabled=true]:cursor-not-allowed data-[disabled=true]:opacity-50';

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

export const FileInput = forwardRef<HTMLDivElement, FileInputProps>(
  (
    {
      label,
      hint,
      error,
      accept,
      multiple = false,
      maxSize,
      onFiles,
      onError,
      className,
      disabled,
      id,
      name,
    },
    ref,
  ) => {
    const generatedId = useId();
    const inputId = id ?? generatedId;
    const labelId = label != null ? `${inputId}-label` : undefined;
    const hintId = hint != null ? `${inputId}-hint` : undefined;
    const errorId = error != null ? `${inputId}-error` : undefined;
    const describedBy = [hintId, errorId].filter(Boolean).join(' ') || undefined;

    const inputRef = useRef<HTMLInputElement>(null);
    const [active, setActive] = useState(false);
    const dragDepth = useRef(0);

    const openPicker = useCallback(() => {
      if (disabled) return;
      inputRef.current?.click();
    }, [disabled]);

    const validate = useCallback(
      (incoming: File[]): { ok: File[]; reason?: string; offender?: File } => {
        if (!multiple && incoming.length > 1) {
          return {
            ok: [],
            reason: 'Only one file is allowed',
            offender: incoming[0],
          };
        }
        for (const f of incoming) {
          if (!acceptMatches(accept, f)) {
            return { ok: [], reason: `File type not accepted: ${f.name}`, offender: f };
          }
          if (typeof maxSize === 'number' && f.size > maxSize) {
            return { ok: [], reason: `File too large: ${f.name}`, offender: f };
          }
        }
        return { ok: incoming };
      },
      [accept, maxSize, multiple],
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
        onFiles?.(result.ok);
      },
      [disabled, validate, onError, onFiles],
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

    return (
      <div className="space-y-1.5">
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
            className,
          )}
        >
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
      </div>
    );
  },
);
FileInput.displayName = 'FileInput';
