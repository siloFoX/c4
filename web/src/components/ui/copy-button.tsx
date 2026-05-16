import {
  forwardRef,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import type { ReactNode } from 'react';
import { Check, Copy } from 'lucide-react';
import { cn } from '../../lib/cn';
import { Button } from './button';
import { IconButton } from './icon-button';
import { Tooltip } from './tooltip';
import { copyTextToClipboardWithError } from '../../lib/clipboard';

// (v1.11.285, TODO 11.267) CopyButton -- canonical
// copy-to-clipboard affordance. Wraps the existing
// `lib/clipboard.ts::copyTextToClipboardWithError()` helper with
// the consistent "Copy <thing>" / "Copied!" tooltip rhythm so
// every adoption site reads the same way and so the operator's
// muscle memory ports between pages.
//
// Two render shapes:
//   - icon-only (default): an IconButton with the lucide Copy
//     glyph. On success the glyph swaps to Check for the
//     transient pulse window (default 1200ms). Tooltip flips
//     from "Copy <label>" to "Copied!" for the same window.
//   - icon+label: a Button with an inline icon + the caller-
//     provided child text (e.g. "Copy ID"). Same Check pulse +
//     tooltip flip.
//
// Optional `showToast` callback drives the toast pipeline if
// the host page wants a non-tooltip surface for the success /
// failure signal. The tooltip flip always runs; the toast is
// additive.

export type CopyButtonSize = 'sm' | 'md';

export type CopyButtonVariant = 'icon-only' | 'icon+label';

export interface CopyButtonProps {
  // The text the operator wants on their clipboard.
  value: string;
  // Optional accessible name suffix for the trigger button and
  // tooltip ("Copy <label>"). Defaults to "value".
  label?: string;
  // Icon-only vs icon + label render. When 'icon+label' the
  // caller must pass `children` (the visible button text). When
  // 'icon-only' children are ignored and the accessible name
  // comes from `label`.
  variant?: CopyButtonVariant;
  children?: ReactNode;
  size?: CopyButtonSize;
  // How long the "Copied!" pulse stays visible before the
  // glyph + tooltip flip back. Default 1200ms.
  pulseMs?: number;
  // Fires after a successful clipboard write.
  onCopy?: (value: string) => void;
  // Fires when the clipboard write rejects.
  onError?: (err: Error) => void;
  // Optional toast pipeline -- when set, fires on every copy
  // attempt with the matching tone.
  showToast?: (
    message: string,
    tone: 'success' | 'error' | 'info',
  ) => void;
  disabled?: boolean;
  className?: string;
  // Forward to the underlying button so callers can address a
  // specific instance in e2e.
  'data-testid'?: string;
  // Tooltip placement -- forwarded to the Tooltip wrapper.
  // Defaults to 'top'.
  tooltipPlacement?: 'top' | 'bottom' | 'left' | 'right';
}

const SIZE_GLYPH: Record<CopyButtonSize, string> = {
  sm: 'h-3 w-3',
  md: 'h-3.5 w-3.5',
};

const SIZE_BUTTON_CLS: Record<CopyButtonSize, string> = {
  sm: 'h-6 w-6',
  md: 'h-7 w-7',
};

const DEFAULT_PULSE_MS = 1200;

export const CopyButton = forwardRef<HTMLButtonElement, CopyButtonProps>(
  (
    {
      value,
      label,
      variant = 'icon-only',
      children,
      size = 'md',
      pulseMs = DEFAULT_PULSE_MS,
      onCopy,
      onError,
      showToast,
      disabled = false,
      className,
      tooltipPlacement = 'top',
      ...rest
    },
    ref,
  ) => {
    const [copied, setCopied] = useState(false);
    const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    useEffect(() => {
      return () => {
        if (timerRef.current) clearTimeout(timerRef.current);
      };
    }, []);

    const resolvedLabel = label ?? 'value';
    const tooltipText = copied ? 'Copied!' : `Copy ${resolvedLabel}`;
    const ariaLabel = copied
      ? `Copied ${resolvedLabel}`
      : `Copy ${resolvedLabel}`;

    const handleClick = useCallback(async () => {
      const result = await copyTextToClipboardWithError(value);
      if (result.ok) {
        setCopied(true);
        if (timerRef.current) clearTimeout(timerRef.current);
        timerRef.current = setTimeout(() => setCopied(false), pulseMs);
        onCopy?.(value);
        showToast?.(`Copied ${resolvedLabel}`, 'success');
      } else {
        onError?.(result.error ?? new Error('Clipboard unavailable'));
        showToast?.(`Failed to copy ${resolvedLabel}`, 'error');
      }
    }, [onCopy, onError, pulseMs, resolvedLabel, showToast, value]);

    const glyphCls = SIZE_GLYPH[size];
    const glyph = copied ? (
      <Check
        aria-hidden="true"
        className={cn(glyphCls, 'text-success')}
        data-copy-button-glyph="check"
      />
    ) : (
      <Copy
        aria-hidden="true"
        className={glyphCls}
        data-copy-button-glyph="copy"
      />
    );

    const testId = rest['data-testid'];
    const sharedDataAttrs = {
      'data-section': 'copy-button',
      'data-variant': variant,
      'data-size': size,
      'data-copied': copied ? 'true' : 'false',
      ...(testId ? { 'data-testid': testId } : {}),
    };

    if (variant === 'icon-only') {
      return (
        <Tooltip label={tooltipText} placement={tooltipPlacement}>
          <IconButton
            ref={ref}
            type="button"
            aria-label={ariaLabel}
            disabled={disabled}
            onClick={() => {
              void handleClick();
            }}
            className={cn(SIZE_BUTTON_CLS[size], 'rounded-md', className)}
            icon={glyph}
            {...sharedDataAttrs}
          />
        </Tooltip>
      );
    }

    return (
      <Tooltip label={tooltipText} placement={tooltipPlacement}>
        <Button
          ref={ref}
          type="button"
          variant="ghost"
          size="sm"
          aria-label={ariaLabel}
          disabled={disabled}
          onClick={() => {
            void handleClick();
          }}
          className={cn(className)}
          {...sharedDataAttrs}
        >
          {glyph}
          {children ?? (
            <span>{copied ? 'Copied!' : `Copy ${resolvedLabel}`}</span>
          )}
        </Button>
      </Tooltip>
    );
  },
);
CopyButton.displayName = 'CopyButton';
