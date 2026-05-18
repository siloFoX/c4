import {
  forwardRef,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type {
  ForwardedRef,
  KeyboardEvent as ReactKeyboardEvent,
  ReactNode,
} from 'react';
import { cn } from '../../lib/cn';

// (v1.11.414, TODO 11.396) SnapshotDiff primitive.
//
// Side-by-side / unified text diff renderer that pairs with
// audit log / change preview surfaces. Owns:
//   - Pure line-level diff (LCS-based) -- exported as
//     `computeLineDiff(before, after)`.
//   - Hunk grouping with fold-unchanged behaviour -- exported as
//     `groupDiffHunks(lines, contextLines)`.
//   - Change-block navigation (prev / next).
//   - Plain monospace render by default; callers can plug
//     syntax highlighting via the optional `renderText` prop.
//
// Reference: /root/c4/arps-design-system-v1/. The component
// reads `text-primary` / `border-default` etc. via Tailwind so
// it honours the theme customizer (11.394).

export type DiffLineType = 'equal' | 'add' | 'remove';

export interface DiffLine {
  type: DiffLineType;
  oldLineNumber: number | null;
  newLineNumber: number | null;
  text: string;
}

export interface DiffHunk {
  id: string;
  type: 'lines' | 'fold';
  lines: DiffLine[];
  foldedLineCount?: number;
}

export interface DiffChangeBlock {
  startIndex: number;
  endIndex: number;
}

// ---------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------

function splitLines(text: string): string[] {
  if (text === '') return [];
  return text.split('\n');
}

export function computeLineDiff(
  before: string,
  after: string,
): DiffLine[] {
  const a = splitLines(before);
  const b = splitLines(after);
  const n = a.length;
  const m = b.length;
  if (n === 0 && m === 0) return [];
  // LCS DP table
  const dp: number[][] = Array.from({ length: n + 1 }, () =>
    new Array(m + 1).fill(0),
  );
  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      if (a[i - 1] === b[j - 1]) {
        dp[i]![j] = dp[i - 1]![j - 1]! + 1;
      } else {
        dp[i]![j] = Math.max(dp[i - 1]![j]!, dp[i]![j - 1]!);
      }
    }
  }
  const result: DiffLine[] = [];
  let i = n;
  let j = m;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && a[i - 1] === b[j - 1]) {
      result.unshift({
        type: 'equal',
        oldLineNumber: i,
        newLineNumber: j,
        text: a[i - 1]!,
      });
      i -= 1;
      j -= 1;
    } else if (j > 0 && (i === 0 || dp[i]![j - 1]! >= dp[i - 1]![j]!)) {
      result.unshift({
        type: 'add',
        oldLineNumber: null,
        newLineNumber: j,
        text: b[j - 1]!,
      });
      j -= 1;
    } else if (i > 0) {
      result.unshift({
        type: 'remove',
        oldLineNumber: i,
        newLineNumber: null,
        text: a[i - 1]!,
      });
      i -= 1;
    } else {
      break;
    }
  }
  return result;
}

export function findDiffChangeBlocks(
  lines: DiffLine[],
): DiffChangeBlock[] {
  const blocks: DiffChangeBlock[] = [];
  let i = 0;
  while (i < lines.length) {
    if (lines[i]!.type !== 'equal') {
      const start = i;
      while (i < lines.length && lines[i]!.type !== 'equal') {
        i += 1;
      }
      blocks.push({ startIndex: start, endIndex: i - 1 });
    } else {
      i += 1;
    }
  }
  return blocks;
}

export function groupDiffHunks(
  lines: DiffLine[],
  contextLines = 3,
): DiffHunk[] {
  const N = lines.length;
  if (N === 0) return [];
  const hunks: DiffHunk[] = [];
  let i = 0;
  while (i < N) {
    const current = lines[i]!;
    if (current.type === 'equal') {
      let j = i;
      while (j < N && lines[j]!.type === 'equal') j += 1;
      const run = lines.slice(i, j);
      const isFirst = i === 0;
      const isLast = j === N;
      const head = isFirst ? 0 : Math.min(contextLines, run.length);
      const tail = isLast
        ? 0
        : Math.min(contextLines, run.length - head);
      const foldCount = run.length - head - tail;
      if (foldCount <= 0) {
        hunks.push({
          id: `lines-${i}`,
          type: 'lines',
          lines: run,
        });
      } else {
        if (head > 0) {
          hunks.push({
            id: `lines-${i}`,
            type: 'lines',
            lines: run.slice(0, head),
          });
        }
        hunks.push({
          id: `fold-${i + head}`,
          type: 'fold',
          lines: run.slice(head, head + foldCount),
          foldedLineCount: foldCount,
        });
        if (tail > 0) {
          hunks.push({
            id: `lines-${i + head + foldCount}`,
            type: 'lines',
            lines: run.slice(head + foldCount),
          });
        }
      }
      i = j;
    } else {
      let j = i;
      while (j < N && lines[j]!.type !== 'equal') j += 1;
      hunks.push({
        id: `lines-${i}`,
        type: 'lines',
        lines: lines.slice(i, j),
      });
      i = j;
    }
  }
  return hunks;
}

export interface PairedRow {
  left: DiffLine | null;
  right: DiffLine | null;
}

// Side-by-side rendering pairs consecutive remove + add lines so
// the row count is minimized. Excess removes / adds get their
// own row with the opposite side empty.
export function pairSideBySide(lines: DiffLine[]): PairedRow[] {
  const rows: PairedRow[] = [];
  let i = 0;
  while (i < lines.length) {
    const current = lines[i]!;
    if (current.type === 'equal') {
      rows.push({ left: current, right: current });
      i += 1;
    } else {
      const removes: DiffLine[] = [];
      const adds: DiffLine[] = [];
      while (i < lines.length && lines[i]!.type === 'remove') {
        removes.push(lines[i]!);
        i += 1;
      }
      while (i < lines.length && lines[i]!.type === 'add') {
        adds.push(lines[i]!);
        i += 1;
      }
      const pairCount = Math.min(removes.length, adds.length);
      for (let k = 0; k < pairCount; k += 1) {
        rows.push({ left: removes[k]!, right: adds[k]!});
      }
      for (let k = pairCount; k < removes.length; k += 1) {
        rows.push({ left: removes[k]!, right: null });
      }
      for (let k = pairCount; k < adds.length; k += 1) {
        rows.push({ left: null, right: adds[k]!});
      }
    }
  }
  return rows;
}

// ---------------------------------------------------------------
// Component
// ---------------------------------------------------------------

export type SnapshotDiffMode = 'unified' | 'side-by-side';

export interface SnapshotDiffProps {
  before: string;
  after: string;
  language?: string;
  mode?: SnapshotDiffMode;
  contextLines?: number;
  showLineNumbers?: boolean;
  className?: string;
  ariaLabel?: string;
  renderText?: (text: string, language: string) => ReactNode;
  activeChangeIndex?: number;
  defaultActiveChangeIndex?: number;
  onActiveChangeIndex?: (index: number) => void;
  defaultExpandedFolds?: boolean;
}

const LINE_TYPE_CLASS: Record<DiffLineType, string> = {
  equal: 'bg-transparent text-foreground',
  add: 'bg-emerald-500/10 text-foreground',
  remove: 'bg-rose-500/10 text-foreground',
};

const LINE_PREFIX: Record<DiffLineType, string> = {
  equal: ' ',
  add: '+',
  remove: '-',
};

export const SnapshotDiff = forwardRef(function SnapshotDiff(
  {
    before,
    after,
    language = 'text',
    mode = 'unified',
    contextLines = 3,
    showLineNumbers = true,
    className,
    ariaLabel = 'Snapshot diff',
    renderText,
    activeChangeIndex,
    defaultActiveChangeIndex = 0,
    onActiveChangeIndex,
    defaultExpandedFolds = false,
  }: SnapshotDiffProps,
  ref: ForwardedRef<HTMLDivElement>,
) {
  const lines = useMemo(
    () => computeLineDiff(before, after),
    [before, after],
  );
  const changeBlocks = useMemo(
    () => findDiffChangeBlocks(lines),
    [lines],
  );
  const hunks = useMemo(
    () => groupDiffHunks(lines, contextLines),
    [lines, contextLines],
  );

  const isControlled = activeChangeIndex !== undefined;
  const [internalIndex, setInternalIndex] = useState<number>(
    defaultActiveChangeIndex,
  );
  const effectiveIndex = isControlled ? activeChangeIndex : internalIndex;

  const onActiveChangeRef = useRef(onActiveChangeIndex);
  useEffect(() => {
    onActiveChangeRef.current = onActiveChangeIndex;
  }, [onActiveChangeIndex]);

  const moveIndex = useCallback(
    (delta: 1 | -1) => {
      if (changeBlocks.length === 0) return;
      const current = Math.max(
        0,
        Math.min(changeBlocks.length - 1, effectiveIndex),
      );
      const next =
        (current + delta + changeBlocks.length) %
        changeBlocks.length;
      if (!isControlled) setInternalIndex(next);
      onActiveChangeRef.current?.(next);
    },
    [changeBlocks, effectiveIndex, isControlled],
  );

  const [expandedFolds, setExpandedFolds] = useState<Set<string>>(
    () => new Set(),
  );
  const isExpanded = useCallback(
    (id: string): boolean =>
      defaultExpandedFolds || expandedFolds.has(id),
    [defaultExpandedFolds, expandedFolds],
  );
  const toggleFold = useCallback((id: string) => {
    setExpandedFolds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const renderCell = useCallback(
    (text: string): ReactNode => {
      if (renderText) return renderText(text, language);
      return text;
    },
    [renderText, language],
  );

  const activeBlock =
    changeBlocks.length > 0 && effectiveIndex < changeBlocks.length
      ? changeBlocks[effectiveIndex]!
      : null;

  const handleKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLDivElement>) => {
      if (event.key === 'n' || event.key === 'ArrowDown') {
        if (event.metaKey || event.ctrlKey) return;
        if (event.key === 'ArrowDown' && !event.altKey) return;
        event.preventDefault();
        moveIndex(1);
      } else if (event.key === 'p' || event.key === 'ArrowUp') {
        if (event.metaKey || event.ctrlKey) return;
        if (event.key === 'ArrowUp' && !event.altKey) return;
        event.preventDefault();
        moveIndex(-1);
      }
    },
    [moveIndex],
  );

  return (
    <div
      ref={ref}
      role="region"
      aria-label={ariaLabel}
      tabIndex={0}
      data-section="snapshot-diff"
      data-mode={mode}
      data-language={language}
      data-change-count={changeBlocks.length}
      data-active-change-index={effectiveIndex}
      onKeyDown={handleKeyDown}
      className={cn(
        'flex flex-col rounded-md border border-border bg-card font-mono text-xs',
        className,
      )}
    >
      <header
        data-section="snapshot-diff-header"
        className="flex items-center justify-between gap-2 border-b border-border px-3 py-1"
      >
        <span
          data-section="snapshot-diff-summary"
          className="text-foreground"
        >
          {summarizeChanges(lines)}
        </span>
        <div
          data-section="snapshot-diff-nav"
          className="flex items-center gap-1"
        >
          <button
            type="button"
            aria-label="Previous change"
            data-section="snapshot-diff-prev"
            disabled={changeBlocks.length === 0}
            onClick={() => moveIndex(-1)}
            className="rounded border border-border px-2 py-0.5 hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            Prev
          </button>
          <span
            data-section="snapshot-diff-nav-counter"
            className="px-1 tabular-nums text-muted-foreground"
          >
            {changeBlocks.length === 0
              ? '0 / 0'
              : `${Math.min(effectiveIndex + 1, changeBlocks.length)} / ${changeBlocks.length}`}
          </span>
          <button
            type="button"
            aria-label="Next change"
            data-section="snapshot-diff-next"
            disabled={changeBlocks.length === 0}
            onClick={() => moveIndex(1)}
            className="rounded border border-border px-2 py-0.5 hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            Next
          </button>
        </div>
      </header>

      <div
        data-section="snapshot-diff-body"
        className="overflow-x-auto"
      >
        {mode === 'unified' ? (
          <UnifiedView
            hunks={hunks}
            lines={lines}
            activeBlock={activeBlock}
            isExpanded={isExpanded}
            toggleFold={toggleFold}
            renderCell={renderCell}
            showLineNumbers={showLineNumbers}
          />
        ) : (
          <SideBySideView
            hunks={hunks}
            lines={lines}
            activeBlock={activeBlock}
            isExpanded={isExpanded}
            toggleFold={toggleFold}
            renderCell={renderCell}
            showLineNumbers={showLineNumbers}
          />
        )}
      </div>
    </div>
  );
});

SnapshotDiff.displayName = 'SnapshotDiff';

function summarizeChanges(lines: DiffLine[]): string {
  let adds = 0;
  let removes = 0;
  for (const line of lines) {
    if (line.type === 'add') adds += 1;
    else if (line.type === 'remove') removes += 1;
  }
  return `+${adds} -${removes}`;
}

interface ViewProps {
  hunks: DiffHunk[];
  lines: DiffLine[];
  activeBlock: DiffChangeBlock | null;
  isExpanded: (id: string) => boolean;
  toggleFold: (id: string) => void;
  renderCell: (text: string) => ReactNode;
  showLineNumbers: boolean;
}

function UnifiedView({
  hunks,
  lines,
  activeBlock,
  isExpanded,
  toggleFold,
  renderCell,
  showLineNumbers,
}: ViewProps) {
  return (
    <table
      data-section="snapshot-diff-unified"
      className="w-full border-collapse"
    >
      <colgroup>
        {showLineNumbers ? <col className="w-10" /> : null}
        {showLineNumbers ? <col className="w-10" /> : null}
        <col className="w-4" />
        <col />
      </colgroup>
      <tbody>
        {hunks.map((hunk) => {
          if (hunk.type === 'fold' && !isExpanded(hunk.id)) {
            return (
              <FoldRow
                key={hunk.id}
                hunk={hunk}
                onExpand={() => toggleFold(hunk.id)}
                colSpan={(showLineNumbers ? 2 : 0) + 2}
              />
            );
          }
          return hunk.lines.map((line) => {
            const lineIndex = lines.indexOf(line);
            const isActive =
              activeBlock !== null &&
              lineIndex >= activeBlock.startIndex &&
              lineIndex <= activeBlock.endIndex;
            return (
              <tr
                key={`${hunk.id}-${lineIndex}`}
                data-section="snapshot-diff-row"
                data-line-type={line.type}
                data-line-index={lineIndex}
                data-active={isActive ? 'true' : 'false'}
                className={cn(
                  LINE_TYPE_CLASS[line.type],
                  isActive && 'outline outline-1 outline-primary/60',
                )}
              >
                {showLineNumbers ? (
                  <td
                    data-section="snapshot-diff-line-number"
                    data-side="old"
                    className="select-none px-2 text-right text-muted-foreground tabular-nums"
                  >
                    {line.oldLineNumber ?? ''}
                  </td>
                ) : null}
                {showLineNumbers ? (
                  <td
                    data-section="snapshot-diff-line-number"
                    data-side="new"
                    className="select-none px-2 text-right text-muted-foreground tabular-nums"
                  >
                    {line.newLineNumber ?? ''}
                  </td>
                ) : null}
                <td
                  data-section="snapshot-diff-line-prefix"
                  aria-hidden="true"
                  className="select-none px-1 text-center text-muted-foreground"
                >
                  {LINE_PREFIX[line.type]}
                </td>
                <td
                  data-section="snapshot-diff-line-content"
                  className="whitespace-pre px-2"
                >
                  {renderCell(line.text)}
                </td>
              </tr>
            );
          });
        })}
      </tbody>
    </table>
  );
}

function SideBySideView({
  hunks,
  lines,
  activeBlock,
  isExpanded,
  toggleFold,
  renderCell,
  showLineNumbers,
}: ViewProps) {
  return (
    <table
      data-section="snapshot-diff-side-by-side"
      className="w-full border-collapse"
    >
      <colgroup>
        {showLineNumbers ? <col className="w-10" /> : null}
        <col />
        {showLineNumbers ? <col className="w-10" /> : null}
        <col />
      </colgroup>
      <tbody>
        {hunks.map((hunk) => {
          if (hunk.type === 'fold' && !isExpanded(hunk.id)) {
            return (
              <FoldRow
                key={hunk.id}
                hunk={hunk}
                onExpand={() => toggleFold(hunk.id)}
                colSpan={(showLineNumbers ? 2 : 0) + 2}
              />
            );
          }
          const paired = pairSideBySide(hunk.lines);
          return paired.map((row, pairIdx) => {
            const leftIndex =
              row.left !== null ? lines.indexOf(row.left) : -1;
            const rightIndex =
              row.right !== null ? lines.indexOf(row.right) : -1;
            const isActive =
              activeBlock !== null &&
              ((leftIndex >= activeBlock.startIndex &&
                leftIndex <= activeBlock.endIndex) ||
                (rightIndex >= activeBlock.startIndex &&
                  rightIndex <= activeBlock.endIndex));
            return (
              <tr
                key={`${hunk.id}-row-${pairIdx}`}
                data-section="snapshot-diff-row"
                data-active={isActive ? 'true' : 'false'}
                className={cn(
                  isActive && 'outline outline-1 outline-primary/60',
                )}
              >
                {showLineNumbers ? (
                  <td
                    data-section="snapshot-diff-line-number"
                    data-side="old"
                    className="select-none border-r border-border px-2 text-right text-muted-foreground tabular-nums"
                  >
                    {row.left?.oldLineNumber ?? ''}
                  </td>
                ) : null}
                <td
                  data-section="snapshot-diff-cell"
                  data-side="old"
                  data-line-type={row.left?.type ?? 'empty'}
                  className={cn(
                    'whitespace-pre border-r border-border px-2',
                    row.left
                      ? LINE_TYPE_CLASS[row.left.type]
                      : 'bg-muted/30',
                  )}
                >
                  {row.left ? renderCell(row.left.text) : ''}
                </td>
                {showLineNumbers ? (
                  <td
                    data-section="snapshot-diff-line-number"
                    data-side="new"
                    className="select-none px-2 text-right text-muted-foreground tabular-nums"
                  >
                    {row.right?.newLineNumber ?? ''}
                  </td>
                ) : null}
                <td
                  data-section="snapshot-diff-cell"
                  data-side="new"
                  data-line-type={row.right?.type ?? 'empty'}
                  className={cn(
                    'whitespace-pre px-2',
                    row.right
                      ? LINE_TYPE_CLASS[row.right.type]
                      : 'bg-muted/30',
                  )}
                >
                  {row.right ? renderCell(row.right.text) : ''}
                </td>
              </tr>
            );
          });
        })}
      </tbody>
    </table>
  );
}

interface FoldRowProps {
  hunk: DiffHunk;
  onExpand: () => void;
  colSpan: number;
}

function FoldRow({ hunk, onExpand, colSpan }: FoldRowProps) {
  return (
    <tr
      data-section="snapshot-diff-fold"
      data-fold-id={hunk.id}
      data-fold-count={hunk.foldedLineCount ?? 0}
    >
      <td colSpan={colSpan} className="p-0">
        <button
          type="button"
          onClick={onExpand}
          aria-label={`Expand ${hunk.foldedLineCount ?? 0} unchanged lines`}
          data-section="snapshot-diff-fold-button"
          className="w-full bg-muted/40 px-3 py-1 text-left text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          ... {hunk.foldedLineCount ?? 0} unchanged lines (click to expand)
        </button>
      </td>
    </tr>
  );
}
