import { useCallback, useId, useMemo, useRef } from 'react';
import type { KeyboardEvent, ReactNode } from 'react';
import { cn } from '../../lib/cn';
import { useFocusCycle } from '../../hooks/use-focus-cycle';

// (v1.11.306, TODO 11.288) RadioGroup -- keyboard-navigable
// single-select radio set. Built on the ARIA roving-tabindex
// radiogroup pattern (one focusable radio at a time;
// ArrowLeft/Right cycle within a horizontal group,
// ArrowUp/Down cycle within a vertical group, Home / End jump
// to the ends).
//
// Use this when the operator is choosing exactly one value
// from a small set (3-7 items) AND the choice is the primary
// affordance on the surface (page section, modal field). For
// inline pickers consider <Tabs variant="pill"> or
// <SegmentedControl>; for large option lists use <Select> or
// <Combobox>.
//
// Each item carries a `value`, `label`, optional `description`,
// optional leading `icon`, optional `disabled`. The description
// renders below the label and is wired through
// aria-describedby so a screen reader hears the secondary
// context after the primary label.

export type RadioGroupOrientation = 'horizontal' | 'vertical';

export interface RadioGroupItem<V extends string = string> {
  value: V;
  label: ReactNode;
  description?: ReactNode;
  icon?: ReactNode;
  disabled?: boolean;
}

export interface RadioGroupProps<V extends string = string> {
  value: V;
  onChange: (next: V) => void;
  items: RadioGroupItem<V>[];
  ariaLabel?: string;
  orientation?: RadioGroupOrientation;
  // Show the description (renders below the label) -- defaults
  // to true. Set to false to keep the description content
  // available for aria-describedby without rendering it
  // visually (useful in dense rows).
  showDescription?: boolean;
  className?: string;
  // Forwarded to the radiogroup container so e2e + analytics
  // can target the surface.
  'data-testid'?: string;
}

const CONTAINER_CLASS: Record<RadioGroupOrientation, string> = {
  horizontal: 'flex flex-wrap items-stretch gap-2',
  vertical: 'flex flex-col gap-2',
};

const ITEM_BASE =
  'group inline-flex w-full flex-col gap-1 rounded-md border px-3 py-2 text-left text-sm transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50';

const ITEM_ACTIVE =
  'border-primary bg-primary/15 text-foreground';
const ITEM_INACTIVE =
  'border-border bg-background text-muted-foreground hover:bg-accent hover:text-accent-foreground';

export function RadioGroup<V extends string = string>({
  value,
  onChange,
  items,
  ariaLabel,
  orientation = 'vertical',
  showDescription = true,
  className,
  'data-testid': testId,
}: RadioGroupProps<V>) {
  const groupRef = useRef<HTMLDivElement>(null);
  const groupId = useId();

  const { handleKeyDown } = useFocusCycle({
    containerRef: groupRef,
    itemSelector: '[role=radio]:not([disabled])',
    orientation,
    wrap: true,
    onSelect: (el) => {
      const v = el.getAttribute('data-radio-value');
      if (v) onChange(v as V);
    },
  });

  // Wrap the focus-cycle keydown so Space / Enter also commit
  // the focused item (matches the ARIA radiogroup contract --
  // the operator can land on a row via arrow nav and then press
  // Space without it being a no-op).
  const onItemKeyDown = useCallback(
    (e: KeyboardEvent<HTMLButtonElement>) => {
      if (e.key === ' ' || e.key === 'Enter') {
        e.preventDefault();
        const v = e.currentTarget.getAttribute('data-radio-value');
        if (v) onChange(v as V);
        return;
      }
      handleKeyDown(e);
    },
    [handleKeyDown, onChange],
  );

  const descriptionIdFor = useCallback(
    (v: V) => `${groupId}-${v}-desc`,
    [groupId],
  );

  // Find the active item once so the tabIndex logic is stable.
  const activeIndex = useMemo(
    () => items.findIndex((i) => i.value === value),
    [items, value],
  );

  return (
    <div
      ref={groupRef}
      role="radiogroup"
      aria-label={ariaLabel}
      aria-orientation={orientation}
      data-section="radio-group"
      data-orientation={orientation}
      data-testid={testId}
      className={cn(CONTAINER_CLASS[orientation], className)}
    >
      {items.map((item, idx) => {
        const isActive = item.value === value;
        // Roving tabindex: only the active radio is in the tab
        // order. If no item is active yet (e.g., uncontrolled
        // start state), the first non-disabled item takes the
        // tab stop so keyboard users can enter the group.
        const tabIndex = (() => {
          if (isActive) return 0;
          if (activeIndex !== -1) return -1;
          if (item.disabled) return -1;
          const firstEnabled = items.findIndex((it) => !it.disabled);
          return firstEnabled === idx ? 0 : -1;
        })();
        const descId = item.description ? descriptionIdFor(item.value) : undefined;
        return (
          <button
            key={item.value}
            type="button"
            role="radio"
            aria-checked={isActive}
            aria-describedby={descId}
            tabIndex={tabIndex}
            disabled={item.disabled}
            data-section="radio-group-item"
            data-radio-value={item.value}
            data-active={isActive ? 'true' : 'false'}
            onClick={() => {
              if (item.disabled) return;
              if (!isActive) onChange(item.value);
            }}
            onKeyDown={onItemKeyDown}
            className={cn(
              ITEM_BASE,
              isActive ? ITEM_ACTIVE : ITEM_INACTIVE,
            )}
          >
            <span className="inline-flex items-center gap-2">
              {item.icon ? (
                <span
                  aria-hidden="true"
                  className="flex h-4 w-4 items-center justify-center"
                >
                  {item.icon}
                </span>
              ) : null}
              <span className="font-medium">{item.label}</span>
            </span>
            {item.description && showDescription ? (
              <span
                id={descId}
                data-section="radio-group-description"
                className="text-xs text-muted-foreground"
              >
                {item.description}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

RadioGroup.displayName = 'RadioGroup';
