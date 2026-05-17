import { forwardRef, useRef, useState, useCallback } from 'react';
import type {
  ChangeEvent,
  ClipboardEvent,
  KeyboardEvent,
  HTMLAttributes,
} from 'react';
import { Chip } from './chip';
import { cn } from '../../lib/cn';

// (11.174) TagInput primitive. Multi-tag input field.
// Renders existing tags as dismissible Chips alongside a native input.
// Enter or comma commits the input as a new tag; Backspace on an empty
// input removes the last tag; clicking a chip enters inline edit mode;
// pasting CSV / newline-separated text splits into multiple tags.

export interface TagInputProps
  extends Omit<HTMLAttributes<HTMLDivElement>, 'onChange'> {
  value: string[];
  onChange: (tags: string[]) => void;
  placeholder?: string;
  maxTags?: number;
  normalize?: (raw: string) => string;
  dedupe?: boolean;
  className?: string;
  inputClassName?: string;
  disabled?: boolean;
  ariaLabel?: string;
}

const SPLIT_RE = /[,\n]/;

function defaultNormalize(raw: string): string {
  return raw.trim();
}

export const TagInput = forwardRef<HTMLDivElement, TagInputProps>(
  (
    {
      value,
      onChange,
      placeholder = 'Add tag...',
      maxTags,
      normalize,
      dedupe = true,
      className,
      inputClassName,
      disabled,
      ariaLabel,
      ...rest
    },
    ref,
  ) => {
    const [draft, setDraft] = useState('');
    const [editingIndex, setEditingIndex] = useState<number | null>(null);
    const [editValue, setEditValue] = useState('');
    const editInputRef = useRef<HTMLInputElement | null>(null);

    const norm = useCallback(
      (raw: string): string => (normalize ? normalize(raw) : defaultNormalize(raw)),
      [normalize],
    );

    const canAdd = useCallback(
      (next: string, list: string[]): boolean => {
        if (!next) return false;
        if (maxTags != null && list.length >= maxTags) return false;
        if (dedupe && list.some((t) => norm(t) === next)) return false;
        return true;
      },
      [maxTags, dedupe, norm],
    );

    const addTags = useCallback(
      (raws: string[]) => {
        const out = [...value];
        for (const raw of raws) {
          const n = norm(raw);
          if (canAdd(n, out)) out.push(n);
        }
        if (out.length !== value.length) onChange(out);
      },
      [value, onChange, norm, canAdd],
    );

    const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter' || e.key === ',') {
        e.preventDefault();
        const n = norm(draft);
        if (n && canAdd(n, value)) {
          onChange([...value, n]);
          setDraft('');
        } else if (!n) {
          setDraft('');
        }
        return;
      }
      if (e.key === 'Backspace' && draft === '' && value.length > 0) {
        e.preventDefault();
        onChange(value.slice(0, -1));
      }
    };

    const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
      const next = e.target.value;
      if (SPLIT_RE.test(next)) {
        const parts = next.split(SPLIT_RE);
        const tail = parts.pop() ?? '';
        addTags(parts);
        setDraft(tail);
        return;
      }
      setDraft(next);
    };

    const handlePaste = (e: ClipboardEvent<HTMLInputElement>) => {
      const text = e.clipboardData.getData('text');
      if (!text || !SPLIT_RE.test(text)) return;
      e.preventDefault();
      addTags(text.split(SPLIT_RE));
    };

    const removeAt = (idx: number) => {
      const next = value.filter((_, i) => i !== idx);
      onChange(next);
    };

    const startEdit = (idx: number) => {
      if (disabled) return;
      setEditingIndex(idx);
      setEditValue(value[idx] ?? '');
      // Focus on next tick after the input mounts.
      queueMicrotask(() => editInputRef.current?.focus());
    };

    const commitEdit = () => {
      if (editingIndex == null) return;
      const n = norm(editValue);
      if (!n) {
        removeAt(editingIndex);
      } else {
        const others = value.filter((_, i) => i !== editingIndex);
        if (dedupe && others.some((t) => norm(t) === n)) {
          // Duplicate after normalize -> drop the edited slot.
          removeAt(editingIndex);
        } else {
          const next = [...value];
          next[editingIndex] = n;
          onChange(next);
        }
      }
      setEditingIndex(null);
      setEditValue('');
    };

    const cancelEdit = () => {
      setEditingIndex(null);
      setEditValue('');
    };

    const handleEditKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        commitEdit();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        cancelEdit();
      }
    };

    const atCap = maxTags != null && value.length >= maxTags;

    return (
      <div
        ref={ref}
        role="group"
        aria-label={ariaLabel}
        aria-disabled={disabled || undefined}
        data-section="tag-input"
        data-tag-input-count={value.length}
        data-tag-input-at-cap={atCap ? 'true' : 'false'}
        className={cn(
          'flex w-full flex-wrap items-center gap-1 rounded-md border border-input bg-background px-2 py-1.5 text-sm focus-within:ring-2 focus-within:ring-primary focus-within:ring-offset-2 focus-within:ring-offset-background',
          disabled && 'cursor-not-allowed opacity-50',
          className,
        )}
        {...rest}
      >
        {value.map((tag, idx) =>
          editingIndex === idx ? (
            <input
              key={`edit-${idx}`}
              ref={editInputRef}
              type="text"
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              onBlur={commitEdit}
              onKeyDown={handleEditKeyDown}
              aria-label="Edit tag"
              className={cn(
                'h-6 min-w-[40px] rounded border border-input bg-background px-1 text-xs focus:outline-none focus:ring-1 focus:ring-primary',
                inputClassName,
              )}
            />
          ) : (
            <Chip
              key={`${tag}-${idx}`}
              tone="primary"
              {...(disabled ? {} : { onDismiss: () => removeAt(idx) })}
              dismissLabel={`Remove ${tag}`}
              onClick={(e) => {
                if ((e.target as HTMLElement).closest('button')) return;
                startEdit(idx);
              }}
              className={cn(!disabled && 'cursor-text')}
              role="button"
              tabIndex={disabled ? -1 : 0}
              data-tag-input-chip={idx}
              data-tag-input-tag={tag}
            >
              {tag}
            </Chip>
          ),
        )}
        {!disabled && !atCap ? (
          <input
            type="text"
            value={draft}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            onPaste={handlePaste}
            placeholder={placeholder}
            aria-label="Add tag"
            data-tag-input-add="true"
            className={cn(
              'flex-1 min-w-[80px] bg-transparent text-sm outline-none placeholder:text-muted-foreground',
              inputClassName,
            )}
          />
        ) : null}
      </div>
    );
  },
);
TagInput.displayName = 'TagInput';
