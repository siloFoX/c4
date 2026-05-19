import {
  forwardRef,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import type {
  ForwardedRef,
  KeyboardEvent as ReactKeyboardEvent,
  ReactNode,
} from 'react';
import { AlertCircle, Keyboard, RotateCcw } from 'lucide-react';
import { cn } from '../../lib/cn';
import {
  formatShortcut,
  parseShortcutString,
  resolvePlatform,
} from './keyboard-shortcuts-overlay';
import type { KeyboardPlatform } from './keyboard-shortcuts-overlay';

// (v1.11.454, TODO 11.436) KbdShortcutRecorder primitive.
//
// Input-like surface that records the next key combo the user
// types while focused. The recorded combo is rendered as a
// row of `<kbd>` pills using the platform-aware formatter
// from `<KeyboardShortcutsOverlay>` (11.429). A reset button
// clears the current binding back to the configured
// `resetValue` (default `''`). Optional `collisions` array +
// `onCollision` callback let hosts surface conflicts with
// existing bindings before the value is committed.
//
// Reference: /root/c4/arps-design-system-v1/.

export interface KbdShortcutRecorderProps {
  value?: string;
  defaultValue?: string;
  onChange?: (value: string) => void;
  onRecord?: (value: string) => void;
  collisions?: readonly string[];
  onCollision?: (value: string, collidesWith: string) => void;
  platform?: KeyboardPlatform;
  placeholder?: ReactNode;
  disabled?: boolean;
  showReset?: boolean;
  resetValue?: string;
  className?: string;
  ariaLabel?: string;
  recordOnFocus?: boolean;
  helperText?: ReactNode;
  errorText?: ReactNode;
  showIcon?: boolean;
}

// ---------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------

export const DEFAULT_KBD_RECORDER_RESET = '';

// Canonical order: mod > ctrl > alt > shift > key
// Hosts that ship their own bindings should compare against
// the canonical form so 'shift+mod+k' and 'mod+shift+k'
// register as the same shortcut.
export function normalizeShortcutOrder(tokens: readonly string[]): string[] {
  const order: Record<string, number> = {
    mod: 0,
    cmd: 0,
    meta: 0,
    ctrl: 1,
    control: 1,
    alt: 2,
    option: 2,
    opt: 2,
    shift: 3,
  };
  // Modifier tokens are case-insensitive and reordered into
  // canonical position. Non-modifier keys preserve their
  // incoming casing so adopters that compare against
  // `'F5'` / `'Enter'` / `'ArrowUp'` see the original form.
  const trimmed = tokens
    .map((t) => t.trim())
    .filter((t) => t.length > 0);
  const mods: string[] = [];
  const keys: string[] = [];
  for (const t of trimmed) {
    if (order[t.toLowerCase()] !== undefined) {
      mods.push(t.toLowerCase());
    } else {
      keys.push(t);
    }
  }
  mods.sort((a, b) => order[a]! - order[b]!);
  // Collapse meta / cmd / option spellings to canonical
  // forms so callers can use either alias interchangeably.
  const aliasMap: Record<string, string> = {
    cmd: 'mod',
    meta: 'mod',
    control: 'ctrl',
    option: 'alt',
    opt: 'alt',
  };
  const canonicalMods = mods.map((t) => aliasMap[t] ?? t);
  return [...canonicalMods, ...keys];
}

export function recordShortcutFromEvent(
  event: KeyboardEvent | ReactKeyboardEvent<unknown>,
  platform: KeyboardPlatform = 'auto',
): string {
  const tokens: string[] = [];
  const resolved = resolvePlatform(platform);
  const modPressed = resolved === 'mac' ? event.metaKey : event.ctrlKey;
  if (modPressed) tokens.push('mod');
  if (resolved !== 'mac' && event.metaKey) {
    // metaKey on non-Mac (e.g. Windows key) - rare but keep
    // semantically distinct from ctrl-as-mod
    tokens.push('meta');
  }
  if (event.altKey) tokens.push('alt');
  if (event.shiftKey) tokens.push('shift');
  const key = event.key;
  if (
    key.length === 1 ||
    /^Arrow|^Home$|^End$|^PageUp$|^PageDown$|^Tab$|^Enter$|^Escape$|^Space$|^Backspace$|^Delete$|^F\d+$/.test(
      key,
    )
  ) {
    tokens.push(key === ' ' ? 'space' : key);
  }
  // Drop bare modifier presses -- a shortcut needs a non-
  // modifier key.
  if (
    tokens.length === 0 ||
    tokens.every((t) =>
      ['mod', 'ctrl', 'alt', 'shift', 'meta'].includes(t),
    )
  ) {
    return '';
  }
  return normalizeShortcutOrder(tokens).join('+');
}

export function hasShortcutCollision(
  value: string,
  collisions: readonly string[],
): string | null {
  if (!value) return null;
  const canonical = normalizeShortcutOrder(
    parseShortcutString(value),
  ).join('+');
  for (const c of collisions) {
    const cn = normalizeShortcutOrder(parseShortcutString(c)).join(
      '+',
    );
    if (cn === canonical) return c;
  }
  return null;
}

export function formatRecordedShortcut(
  value: string,
  platform: KeyboardPlatform = 'auto',
): string[] {
  return formatShortcut(value, platform);
}

// ---------------------------------------------------------------
// Component
// ---------------------------------------------------------------

export const KbdShortcutRecorder = forwardRef(function KbdShortcutRecorder(
  {
    value,
    defaultValue = '',
    onChange,
    onRecord,
    collisions = [],
    onCollision,
    platform = 'auto',
    placeholder = 'Press a key combo',
    disabled = false,
    showReset = true,
    resetValue = DEFAULT_KBD_RECORDER_RESET,
    className,
    ariaLabel = 'Keyboard shortcut',
    recordOnFocus = true,
    helperText,
    errorText,
    showIcon = true,
  }: KbdShortcutRecorderProps,
  ref: ForwardedRef<HTMLButtonElement>,
) {
  const isControlled = value !== undefined;
  const [internalValue, setInternalValue] = useState<string>(
    defaultValue,
  );
  const effectiveValue = isControlled ? (value ?? '') : internalValue;

  const onChangeRef = useRef(onChange);
  const onRecordRef = useRef(onRecord);
  const onCollisionRef = useRef(onCollision);
  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);
  useEffect(() => {
    onRecordRef.current = onRecord;
  }, [onRecord]);
  useEffect(() => {
    onCollisionRef.current = onCollision;
  }, [onCollision]);

  const [recording, setRecording] = useState<boolean>(false);

  const emit = useCallback(
    (next: string) => {
      if (!isControlled) setInternalValue(next);
      onChangeRef.current?.(next);
    },
    [isControlled],
  );

  const handleKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLButtonElement>) => {
      if (!recording || disabled) return;
      // Escape cancels without committing
      if (event.key === 'Escape') {
        event.preventDefault();
        setRecording(false);
        return;
      }
      const recorded = recordShortcutFromEvent(event, platform);
      if (!recorded) {
        // Bare modifier or non-mappable key -- swallow.
        event.preventDefault();
        return;
      }
      event.preventDefault();
      const collision = hasShortcutCollision(recorded, collisions);
      if (collision) {
        onCollisionRef.current?.(recorded, collision);
        return;
      }
      onRecordRef.current?.(recorded);
      emit(recorded);
      setRecording(false);
    },
    [collisions, disabled, emit, platform, recording],
  );

  const handleFocus = useCallback(() => {
    if (disabled) return;
    if (recordOnFocus) setRecording(true);
  }, [disabled, recordOnFocus]);

  const handleBlur = useCallback(() => {
    setRecording(false);
  }, []);

  const handleClick = useCallback(() => {
    if (disabled) return;
    setRecording((p) => !p);
  }, [disabled]);

  const handleReset = useCallback(() => {
    if (disabled) return;
    emit(resetValue);
  }, [disabled, emit, resetValue]);

  const keyLabels = effectiveValue
    ? formatRecordedShortcut(effectiveValue, platform)
    : [];
  const hasCollision = Boolean(
    effectiveValue && hasShortcutCollision(effectiveValue, collisions),
  );

  return (
    <div
      role="group"
      aria-label={ariaLabel}
      data-section="kbd-shortcut-recorder"
      data-recording={recording ? 'true' : 'false'}
      data-disabled={disabled ? 'true' : 'false'}
      data-empty={effectiveValue ? 'false' : 'true'}
      data-has-collision={hasCollision ? 'true' : 'false'}
      className={cn(
        'flex w-full flex-col gap-1',
        className,
      )}
    >
      <div
        data-section="kbd-shortcut-recorder-row"
        className="flex items-center gap-1"
      >
        <button
          ref={ref}
          type="button"
          role="textbox"
          aria-label={ariaLabel}
          aria-readonly="true"
          aria-disabled={disabled || undefined}
          data-section="kbd-shortcut-recorder-input"
          disabled={disabled}
          onClick={handleClick}
          onFocus={handleFocus}
          onBlur={handleBlur}
          onKeyDown={handleKeyDown}
          className={cn(
            'flex flex-1 items-center gap-1 rounded border bg-background px-2 py-1 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
            recording
              ? 'border-primary text-foreground'
              : 'border-border text-foreground',
            disabled && 'cursor-not-allowed opacity-50',
            hasCollision && 'border-destructive',
          )}
        >
          {showIcon ? (
            <Keyboard
              aria-hidden="true"
              data-section="kbd-shortcut-recorder-icon"
              className="h-3 w-3 text-muted-foreground"
            />
          ) : null}
          {keyLabels.length > 0 ? (
            <span
              data-section="kbd-shortcut-recorder-keys"
              className="flex items-center gap-1"
            >
              {keyLabels.map((label, idx) => (
                <kbd
                  key={`${label}-${idx}`}
                  data-section="kbd-shortcut-recorder-key"
                  className="rounded border border-border bg-muted px-1 py-0.5 font-mono text-[10px]"
                >
                  {label}
                </kbd>
              ))}
            </span>
          ) : (
            <span
              data-section="kbd-shortcut-recorder-placeholder"
              className="text-xs text-muted-foreground"
            >
              {recording ? 'Recording...' : placeholder}
            </span>
          )}
        </button>
        {showReset && effectiveValue ? (
          <button
            type="button"
            data-section="kbd-shortcut-recorder-reset"
            aria-label="Reset shortcut"
            onClick={handleReset}
            disabled={disabled}
            className="inline-flex h-7 w-7 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
          >
            <RotateCcw
              aria-hidden="true"
              className="h-3 w-3"
            />
          </button>
        ) : null}
      </div>
      {hasCollision ? (
        <div
          role="alert"
          data-section="kbd-shortcut-recorder-error"
          className="flex items-start gap-1 text-xs text-destructive"
        >
          <AlertCircle
            aria-hidden="true"
            className="mt-0.5 h-3 w-3"
          />
          <span>
            {errorText ?? 'Shortcut conflicts with an existing binding'}
          </span>
        </div>
      ) : helperText ? (
        <p
          data-section="kbd-shortcut-recorder-helper"
          className="text-xs text-muted-foreground"
        >
          {helperText}
        </p>
      ) : null}
    </div>
  );
});

KbdShortcutRecorder.displayName = 'KbdShortcutRecorder';
