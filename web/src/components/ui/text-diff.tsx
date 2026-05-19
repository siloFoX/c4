import {
  Fragment,
  forwardRef,
  useCallback,
  useMemo,
  useState,
} from 'react';
import type { ForwardedRef } from 'react';
import { Copy } from 'lucide-react';
import { cn } from '../../lib/cn';

// (v1.11.455, TODO 11.437) TextDiff primitive.
//
// Word-level inline diff with add / remove highlights and an
// opt-in line-by-line side-by-side mode. A "Copy unified
// diff" affordance writes a standard `--- a / +++ b / @@ ...`
// patch to the clipboard so adopters can paste into their
// review tool of choice.
//
// Reference: /root/c4/arps-design-system-v1/.

export type TextDiffMode = 'inline-word' | 'line';

export type TextDiffOpKind = 'equal' | 'insert' | 'delete';

export interface TextDiffOp {
  type: TextDiffOpKind;
  text: string;
}

export interface TextDiffLineOp {
  type: TextDiffOpKind;
  text: string;
  beforeLine?: number;
  afterLine?: number;
}

export interface TextDiffProps {
  before: string;
  after: string;
  mode?: TextDiffMode;
  defaultMode?: TextDiffMode;
  onModeChange?: (mode: TextDiffMode) => void;
  showCopyDiff?: boolean;
  onCopyDiff?: (text: string) => void;
  ariaLabel?: string;
  className?: string;
  beforeLabel?: string;
  afterLabel?: string;
  contextLines?: number;
}

// ---------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------

export const DEFAULT_TEXT_DIFF_MODE: TextDiffMode = 'inline-word';
export const DEFAULT_TEXT_DIFF_CONTEXT_LINES = 3;

// Split text into word tokens (keeping whitespace as its own
// token so the diff renders without losing formatting).
export function tokenizeWords(text: string): string[] {
  if (!text) return [];
  return text.split(/(\s+)/).filter((t) => t.length > 0);
}

// Generic LCS-based diff over arrays. Produces a flat list
// of equal / insert / delete ops.
function lcsDiff<T>(a: T[], b: T[]): Array<{
  type: TextDiffOpKind;
  value: T;
}> {
  const n = a.length;
  const m = b.length;
  // Length-only LCS table -- O(n*m) memory which is fine for
  // word + line tokens at typical UI sizes.
  const table: number[][] = Array.from({ length: n + 1 }, () =>
    new Array<number>(m + 1).fill(0),
  );
  for (let i = n - 1; i >= 0; i -= 1) {
    for (let j = m - 1; j >= 0; j -= 1) {
      if (a[i] === b[j]) {
        table[i]![j] = (table[i + 1]?.[j + 1] ?? 0) + 1;
      } else {
        table[i]![j] = Math.max(
          table[i + 1]?.[j] ?? 0,
          table[i]?.[j + 1] ?? 0,
        );
      }
    }
  }
  const out: Array<{ type: TextDiffOpKind; value: T }> = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      out.push({ type: 'equal', value: a[i]! });
      i += 1;
      j += 1;
    } else if ((table[i + 1]?.[j] ?? 0) >= (table[i]?.[j + 1] ?? 0)) {
      out.push({ type: 'delete', value: a[i]! });
      i += 1;
    } else {
      out.push({ type: 'insert', value: b[j]! });
      j += 1;
    }
  }
  while (i < n) {
    out.push({ type: 'delete', value: a[i]! });
    i += 1;
  }
  while (j < m) {
    out.push({ type: 'insert', value: b[j]! });
    j += 1;
  }
  return out;
}

export function diffWords(before: string, after: string): TextDiffOp[] {
  const a = tokenizeWords(before);
  const b = tokenizeWords(after);
  return lcsDiff(a, b).map((op) => ({
    type: op.type,
    text: op.value,
  }));
}

export function diffLines(
  before: string,
  after: string,
): TextDiffLineOp[] {
  const a = before.split('\n');
  const b = after.split('\n');
  const raw = lcsDiff(a, b);
  let beforeCursor = 1;
  let afterCursor = 1;
  return raw.map((op) => {
    if (op.type === 'equal') {
      const line: TextDiffLineOp = {
        type: 'equal',
        text: op.value,
        beforeLine: beforeCursor,
        afterLine: afterCursor,
      };
      beforeCursor += 1;
      afterCursor += 1;
      return line;
    }
    if (op.type === 'delete') {
      const line: TextDiffLineOp = {
        type: 'delete',
        text: op.value,
        beforeLine: beforeCursor,
      };
      beforeCursor += 1;
      return line;
    }
    const line: TextDiffLineOp = {
      type: 'insert',
      text: op.value,
      afterLine: afterCursor,
    };
    afterCursor += 1;
    return line;
  });
}

export interface UnifiedDiffOptions {
  beforeLabel?: string;
  afterLabel?: string;
  contextLines?: number;
}

export function toUnifiedDiff(
  before: string,
  after: string,
  options: UnifiedDiffOptions = {},
): string {
  const beforeLabel = options.beforeLabel ?? 'a';
  const afterLabel = options.afterLabel ?? 'b';
  const context = Math.max(
    0,
    options.contextLines ?? DEFAULT_TEXT_DIFF_CONTEXT_LINES,
  );
  const ops = diffLines(before, after);
  if (ops.every((op) => op.type === 'equal')) {
    return `--- ${beforeLabel}\n+++ ${afterLabel}\n`;
  }
  // Walk ops and break into hunks. A hunk groups consecutive
  // change-or-context lines; consecutive equal-only blocks
  // longer than 2*context separate hunks.
  const hunks: Array<{
    beforeStart: number;
    beforeCount: number;
    afterStart: number;
    afterCount: number;
    lines: Array<{ sign: ' ' | '+' | '-'; text: string }>;
  }> = [];
  let cursor = 0;
  while (cursor < ops.length) {
    // Skip leading equal runs
    while (
      cursor < ops.length &&
      ops[cursor]!.type === 'equal'
    ) {
      cursor += 1;
    }
    if (cursor >= ops.length) break;
    const startIdx = Math.max(0, cursor - context);
    let endIdx = cursor;
    let lastChange = cursor;
    while (endIdx < ops.length) {
      const op = ops[endIdx]!;
      if (op.type !== 'equal') {
        lastChange = endIdx;
      } else if (endIdx - lastChange > context * 2) {
        break;
      }
      endIdx += 1;
    }
    endIdx = Math.min(ops.length, lastChange + 1 + context);
    const slice = ops.slice(startIdx, endIdx);
    const firstBefore =
      slice.find((op) => op.beforeLine !== undefined)?.beforeLine ?? 1;
    const firstAfter =
      slice.find((op) => op.afterLine !== undefined)?.afterLine ?? 1;
    const beforeCount = slice.filter(
      (op) => op.type === 'equal' || op.type === 'delete',
    ).length;
    const afterCount = slice.filter(
      (op) => op.type === 'equal' || op.type === 'insert',
    ).length;
    const lines: Array<{ sign: ' ' | '+' | '-'; text: string }> =
      slice.map((op) => {
        const sign =
          op.type === 'insert'
            ? '+'
            : op.type === 'delete'
              ? '-'
              : ' ';
        return { sign, text: op.text };
      });
    hunks.push({
      beforeStart: firstBefore,
      beforeCount,
      afterStart: firstAfter,
      afterCount,
      lines,
    });
    cursor = endIdx;
  }
  const header = `--- ${beforeLabel}\n+++ ${afterLabel}\n`;
  const body = hunks
    .map((h) => {
      const head = `@@ -${h.beforeStart},${h.beforeCount} +${h.afterStart},${h.afterCount} @@`;
      const rows = h.lines.map((l) => `${l.sign}${l.text}`);
      return [head, ...rows].join('\n');
    })
    .join('\n');
  return `${header}${body}\n`;
}

export async function copyTextToClipboard(
  text: string,
): Promise<boolean> {
  if (typeof navigator === 'undefined') return false;
  const clip = (navigator as Navigator & {
    clipboard?: { writeText: (t: string) => Promise<void> };
  }).clipboard;
  if (clip && typeof clip.writeText === 'function') {
    try {
      await clip.writeText(text);
      return true;
    } catch {
      return false;
    }
  }
  return false;
}

// ---------------------------------------------------------------
// Component
// ---------------------------------------------------------------

export const TextDiff = forwardRef(function TextDiff(
  {
    before,
    after,
    mode,
    defaultMode = DEFAULT_TEXT_DIFF_MODE,
    onModeChange,
    showCopyDiff = true,
    onCopyDiff,
    ariaLabel = 'Text diff',
    className,
    beforeLabel = 'a',
    afterLabel = 'b',
    contextLines = DEFAULT_TEXT_DIFF_CONTEXT_LINES,
  }: TextDiffProps,
  ref: ForwardedRef<HTMLDivElement>,
) {
  const isModeControlled = mode !== undefined;
  const [internalMode, setInternalMode] = useState<TextDiffMode>(
    defaultMode,
  );
  const effectiveMode = isModeControlled
    ? (mode ?? defaultMode)
    : internalMode;

  const emitMode = useCallback(
    (next: TextDiffMode) => {
      if (!isModeControlled) setInternalMode(next);
      onModeChange?.(next);
    },
    [isModeControlled, onModeChange],
  );

  const wordOps = useMemo(
    () => diffWords(before, after),
    [before, after],
  );

  const lineOps = useMemo(
    () => diffLines(before, after),
    [before, after],
  );

  const unifiedDiff = useMemo(
    () =>
      toUnifiedDiff(before, after, {
        beforeLabel,
        afterLabel,
        contextLines,
      }),
    [before, after, beforeLabel, afterLabel, contextLines],
  );

  const handleCopyDiff = useCallback(async () => {
    onCopyDiff?.(unifiedDiff);
    await copyTextToClipboard(unifiedDiff);
  }, [onCopyDiff, unifiedDiff]);

  const insertCount = wordOps.filter((op) => op.type === 'insert')
    .length;
  const deleteCount = wordOps.filter((op) => op.type === 'delete')
    .length;

  return (
    <div
      ref={ref}
      role="region"
      aria-label={ariaLabel}
      data-section="text-diff"
      data-mode={effectiveMode}
      data-insert-count={insertCount}
      data-delete-count={deleteCount}
      className={cn(
        'flex w-full flex-col gap-2 rounded-md border border-border bg-card p-2',
        className,
      )}
    >
      <div
        data-section="text-diff-toolbar"
        className="flex items-center justify-between gap-2"
      >
        <div
          role="radiogroup"
          aria-label="Diff display mode"
          data-section="text-diff-mode-toggle"
          className="flex items-center gap-1 rounded border border-border bg-muted/30 p-0.5"
        >
          <button
            type="button"
            role="radio"
            aria-checked={effectiveMode === 'inline-word'}
            data-section="text-diff-mode-inline"
            data-active={effectiveMode === 'inline-word' ? 'true' : 'false'}
            onClick={() => emitMode('inline-word')}
            className={cn(
              'rounded px-2 py-0.5 text-xs',
              effectiveMode === 'inline-word'
                ? 'bg-background font-medium text-foreground shadow'
                : 'text-muted-foreground',
            )}
          >
            Inline
          </button>
          <button
            type="button"
            role="radio"
            aria-checked={effectiveMode === 'line'}
            data-section="text-diff-mode-line"
            data-active={effectiveMode === 'line' ? 'true' : 'false'}
            onClick={() => emitMode('line')}
            className={cn(
              'rounded px-2 py-0.5 text-xs',
              effectiveMode === 'line'
                ? 'bg-background font-medium text-foreground shadow'
                : 'text-muted-foreground',
            )}
          >
            Line
          </button>
        </div>
        <div
          data-section="text-diff-summary"
          className="flex items-center gap-2 text-xs"
        >
          <span
            data-section="text-diff-summary-insert"
            className="text-success"
          >
            +{insertCount}
          </span>
          <span
            data-section="text-diff-summary-delete"
            className="text-destructive"
          >
            -{deleteCount}
          </span>
          {showCopyDiff ? (
            <button
              type="button"
              data-section="text-diff-copy"
              aria-label="Copy unified diff"
              onClick={() => void handleCopyDiff()}
              className="inline-flex items-center gap-1 rounded px-2 py-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <Copy aria-hidden="true" className="h-3 w-3" />
              Copy
            </button>
          ) : null}
        </div>
      </div>
      {effectiveMode === 'inline-word' ? (
        <div
          data-section="text-diff-inline"
          className="whitespace-pre-wrap break-words rounded bg-muted/20 p-2 font-mono text-xs"
        >
          {wordOps.map((op, idx) => (
            <Fragment key={idx}>
              {op.type === 'equal' ? (
                <span
                  data-section="text-diff-token"
                  data-token-type="equal"
                >
                  {op.text}
                </span>
              ) : op.type === 'insert' ? (
                <span
                  data-section="text-diff-token"
                  data-token-type="insert"
                  className="rounded bg-success/15 text-success"
                >
                  {op.text}
                </span>
              ) : (
                <span
                  data-section="text-diff-token"
                  data-token-type="delete"
                  className="rounded bg-destructive/15 text-destructive line-through"
                >
                  {op.text}
                </span>
              )}
            </Fragment>
          ))}
        </div>
      ) : (
        <ul
          data-section="text-diff-lines"
          className="flex flex-col rounded bg-muted/20 font-mono text-xs"
        >
          {lineOps.map((op, idx) => (
            <li
              key={idx}
              data-section="text-diff-line"
              data-line-type={op.type}
              data-before-line={op.beforeLine ?? ''}
              data-after-line={op.afterLine ?? ''}
              className={cn(
                'flex items-baseline gap-2 px-2 py-0.5',
                op.type === 'insert' &&
                  'bg-success/10 text-success',
                op.type === 'delete' &&
                  'bg-destructive/10 text-destructive line-through',
              )}
            >
              <span
                aria-hidden="true"
                data-section="text-diff-line-sign"
                className="w-3 shrink-0 text-center text-muted-foreground"
              >
                {op.type === 'insert'
                  ? '+'
                  : op.type === 'delete'
                    ? '-'
                    : ' '}
              </span>
              <span
                data-section="text-diff-line-number"
                className="w-12 shrink-0 text-right text-muted-foreground"
              >
                {op.beforeLine ?? ''}
              </span>
              <span
                data-section="text-diff-line-number-after"
                className="w-12 shrink-0 text-right text-muted-foreground"
              >
                {op.afterLine ?? ''}
              </span>
              <span
                data-section="text-diff-line-text"
                className="flex-1 whitespace-pre-wrap break-words"
              >
                {op.text}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
});

TextDiff.displayName = 'TextDiff';
