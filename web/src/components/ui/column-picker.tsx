import { forwardRef, useCallback, useEffect, useId, useMemo, useRef } from 'react';
import type { MutableRefObject, ReactNode } from 'react';
import { Columns3 } from 'lucide-react';
import { Button } from './button';
import { Popover } from './popover';
import { Checkbox } from './checkbox';
import { cn } from '../../lib/cn';
import {
  getLocalStorage,
  setLocalStorage,
} from '../../hooks/use-local-storage';

export interface ColumnPickerColumn {
  id: string;
  label: ReactNode;
  alwaysVisible?: boolean;
}

export interface ColumnPickerProps {
  columns: ColumnPickerColumn[];
  value: string[];
  onChange: (visible: string[]) => void;
  storageKey?: string;
  buttonLabel?: ReactNode;
  className?: string;
  ariaLabel?: string;
}

const STORAGE_SENTINEL = Symbol('column-picker:absent');

function readFromStorage(key: string): string[] | null {
  const raw = getLocalStorage<unknown>(
    key,
    STORAGE_SENTINEL as unknown as unknown,
  );
  if (raw === (STORAGE_SENTINEL as unknown)) return null;
  if (!Array.isArray(raw)) return null;
  return raw.filter((v): v is string => typeof v === 'string');
}

function writeToStorage(key: string, value: string[]): void {
  setLocalStorage<string[]>(key, value);
}

export const ColumnPicker = forwardRef<HTMLButtonElement, ColumnPickerProps>(
  (
    {
      columns,
      value,
      onChange,
      storageKey,
      buttonLabel = 'Columns',
      className,
      ariaLabel,
    },
    ref,
  ) => {
    const triggerTag = useId();
    useEffect(() => {
      const el = document.querySelector<HTMLButtonElement>(
        `[data-column-picker-trigger="${CSS.escape(triggerTag)}"]`,
      );
      if (!el) return;
      if (typeof ref === 'function') ref(el);
      else if (ref) (ref as MutableRefObject<HTMLButtonElement | null>).current = el;
      return () => {
        if (typeof ref === 'function') ref(null);
        else if (ref) (ref as MutableRefObject<HTMLButtonElement | null>).current = null;
      };
    }, [ref, triggerTag]);

    const seededRef = useRef(false);
    const onChangeRef = useRef(onChange);
    useEffect(() => {
      onChangeRef.current = onChange;
    }, [onChange]);

    useEffect(() => {
      if (!storageKey || seededRef.current) return;
      seededRef.current = true;
      const stored = readFromStorage(storageKey);
      if (stored) onChangeRef.current(stored);
    }, [storageKey]);

    const visibleSet = useMemo(() => new Set(value), [value]);

    const emit = useCallback(
      (next: string[]) => {
        onChange(next);
        if (storageKey) writeToStorage(storageKey, next);
      },
      [onChange, storageKey],
    );

    const toggle = useCallback(
      (id: string) => {
        const col = columns.find((c) => c.id === id);
        if (col?.alwaysVisible) return;
        const next = visibleSet.has(id)
          ? value.filter((v) => v !== id)
          : [...value, id];
        emit(next);
      },
      [columns, value, visibleSet, emit],
    );

    const reset = useCallback(() => {
      emit(columns.map((c) => c.id));
    }, [columns, emit]);

    const content = (
      <div className="flex w-56 flex-col gap-2">
        <div className="px-1 text-xs font-semibold text-muted-foreground">
          Visible columns
        </div>
        <ul className="flex flex-col gap-1">
          {columns.map((col) => {
            const checked = col.alwaysVisible ? true : visibleSet.has(col.id);
            return (
              <li key={col.id} className="flex items-center gap-2 px-1 py-1">
                <Checkbox
                  id={`column-picker-${col.id}`}
                  checked={checked}
                  disabled={col.alwaysVisible}
                  onChange={() => toggle(col.id)}
                />
                <label
                  htmlFor={`column-picker-${col.id}`}
                  className={cn(
                    'cursor-pointer text-sm',
                    col.alwaysVisible && 'cursor-not-allowed opacity-70',
                  )}
                >
                  {col.label}
                </label>
              </li>
            );
          })}
        </ul>
        <div className="flex justify-end border-t border-border pt-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={reset}
          >
            Reset
          </Button>
        </div>
      </div>
    );

    return (
      <Popover
        trigger={
          <Button
            type="button"
            variant="outline"
            size="sm"
            aria-label={ariaLabel}
            data-column-picker-trigger={triggerTag}
            className={cn('gap-2', className)}
          >
            <Columns3 className="h-4 w-4" aria-hidden="true" />
            <span>{buttonLabel}</span>
          </Button>
        }
        content={content}
        placement="bottom"
        align="end"
      />
    );
  },
);
ColumnPicker.displayName = 'ColumnPicker';
