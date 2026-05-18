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
import {
  computeLineDiff,
  findDiffChangeBlocks,
  groupDiffHunks,
} from './snapshot-diff';
import type {
  DiffHunk,
  DiffLineType,
} from './snapshot-diff';

// (v1.11.417, TODO 11.399) DiffEditor primitive.
//
// Monaco-flavoured diff editor:
//   - Inline edit on the after-side (toggle Edit mode -> textarea).
//   - Per-hunk Accept / Reject buttons that emit callbacks.
//   - Hunk navigation (prev / next + keyboard n / p).
//   - Optional syntax highlighting via `renderText` prop.
//   - Reuses the diff engine from `snapshot-diff` (11.396) so the
//     two primitives stay in sync.
//
// The pure helper `applyHunkDecisions(before, after, decisions)`
// projects the accept / reject map onto the after string, so the
// host can batch decisions and apply them with a single
// `onAfterChange` write.
//
// Reference: /root/c4/arps-design-system-v1/.

export type HunkDecision = 'accept' | 'reject';

export interface HunkRange {
  hunkIndex: number;
  startIndex: number;
  endIndex: number;
}

export interface DiffEditorProps {
  before: string;
  after: string;
  onAfterChange?: (after: string) => void;
  language?: string;
  contextLines?: number;
  showLineNumbers?: boolean;
  className?: string;
  ariaLabel?: string;
  renderText?: (text: string, language: string) => ReactNode;

  activeHunkIndex?: number;
  defaultActiveHunkIndex?: number;
  onActiveHunkIndexChange?: (idx: number) => void;

  decisions?: Map<number, HunkDecision>;
  defaultDecisions?: Map<number, HunkDecision>;
  onDecisionsChange?: (decisions: Map<number, HunkDecision>) => void;

  onAcceptHunk?: (range: HunkRange) => void;
  onRejectHunk?: (range: HunkRange) => void;

  readOnly?: boolean;
  defaultEditMode?: boolean;

  acceptLabel?: string;
  rejectLabel?: string;
  editLabel?: string;
  doneLabel?: string;
  defaultExpandedFolds?: boolean;
}

// ---------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------

export function applyHunkDecisions(
  before: string,
  after: string,
  decisions: Map<number, HunkDecision>,
): string {
  const lines = computeLineDiff(before, after);
  const blocks = findDiffChangeBlocks(lines);
  // Pre-compute block id per line index for O(1) lookup.
  const blockForLine: number[] = new Array(lines.length).fill(-1);
  blocks.forEach((block, blockIdx) => {
    for (let i = block.startIndex; i <= block.endIndex; i++) {
      blockForLine[i] = blockIdx;
    }
  });

  const out: string[] = [];
  lines.forEach((line, idx) => {
    const blockIdx = blockForLine[idx]!;
    const decision: HunkDecision =
      blockIdx === -1
        ? 'accept' // outside any block; pass through
        : (decisions.get(blockIdx) ?? 'accept');
    if (line.type === 'equal') {
      out.push(line.text);
      return;
    }
    if (decision === 'reject') {
      // Revert to before: keep removes, drop adds.
      if (line.type === 'remove') out.push(line.text);
      return;
    }
    // accept (default): keep adds, drop removes.
    if (line.type === 'add') out.push(line.text);
  });
  return out.join('\n');
}

export function nextHunkIndex(
  current: number,
  total: number,
): number {
  if (total <= 0) return 0;
  return (current + 1) % total;
}

export function prevHunkIndex(
  current: number,
  total: number,
): number {
  if (total <= 0) return 0;
  return (current - 1 + total) % total;
}

// ---------------------------------------------------------------
// Component
// ---------------------------------------------------------------

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

export const DiffEditor = forwardRef(function DiffEditor(
  {
    before,
    after,
    onAfterChange,
    language = 'text',
    contextLines = 3,
    showLineNumbers = true,
    className,
    ariaLabel = 'Diff editor',
    renderText,
    activeHunkIndex,
    defaultActiveHunkIndex = 0,
    onActiveHunkIndexChange,
    decisions,
    defaultDecisions,
    onDecisionsChange,
    onAcceptHunk,
    onRejectHunk,
    readOnly = false,
    defaultEditMode = false,
    acceptLabel = 'Accept',
    rejectLabel = 'Reject',
    editLabel = 'Edit',
    doneLabel = 'Done',
    defaultExpandedFolds = false,
  }: DiffEditorProps,
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

  // Per-line -> block-index lookup so each row knows its hunk.
  const blockForLine = useMemo<number[]>(() => {
    const arr: number[] = new Array(lines.length).fill(-1);
    changeBlocks.forEach((block, blockIdx) => {
      for (let i = block.startIndex; i <= block.endIndex; i++) {
        arr[i] = blockIdx;
      }
    });
    return arr;
  }, [lines, changeBlocks]);

  // --- Active hunk -----------------------------------------------
  const isActiveControlled = activeHunkIndex !== undefined;
  const [internalActive, setInternalActive] = useState<number>(
    defaultActiveHunkIndex,
  );
  const effectiveActive = isActiveControlled
    ? activeHunkIndex
    : internalActive;
  const onActiveChangeRef = useRef(onActiveHunkIndexChange);
  useEffect(() => {
    onActiveChangeRef.current = onActiveHunkIndexChange;
  }, [onActiveHunkIndexChange]);

  const moveActive = useCallback(
    (delta: 1 | -1) => {
      if (changeBlocks.length === 0) return;
      const next =
        delta > 0
          ? nextHunkIndex(effectiveActive, changeBlocks.length)
          : prevHunkIndex(effectiveActive, changeBlocks.length);
      if (!isActiveControlled) setInternalActive(next);
      onActiveChangeRef.current?.(next);
    },
    [changeBlocks.length, effectiveActive, isActiveControlled],
  );

  // --- Decisions -------------------------------------------------
  const isDecisionsControlled = decisions !== undefined;
  const [internalDecisions, setInternalDecisions] = useState<
    Map<number, HunkDecision>
  >(() => new Map(defaultDecisions ?? new Map()));
  const effectiveDecisions = isDecisionsControlled
    ? (decisions ?? new Map())
    : internalDecisions;
  const onDecisionsChangeRef = useRef(onDecisionsChange);
  const onAcceptHunkRef = useRef(onAcceptHunk);
  const onRejectHunkRef = useRef(onRejectHunk);
  const onAfterChangeRef = useRef(onAfterChange);
  useEffect(() => {
    onDecisionsChangeRef.current = onDecisionsChange;
    onAcceptHunkRef.current = onAcceptHunk;
    onRejectHunkRef.current = onRejectHunk;
    onAfterChangeRef.current = onAfterChange;
  }, [onDecisionsChange, onAcceptHunk, onRejectHunk, onAfterChange]);

  const setDecision = useCallback(
    (blockIdx: number, decision: HunkDecision) => {
      const block = changeBlocks[blockIdx];
      if (!block) return;
      const next = new Map(effectiveDecisions);
      next.set(blockIdx, decision);
      if (!isDecisionsControlled) setInternalDecisions(next);
      onDecisionsChangeRef.current?.(next);
      const range: HunkRange = {
        hunkIndex: blockIdx,
        startIndex: block.startIndex,
        endIndex: block.endIndex,
      };
      if (decision === 'accept') {
        onAcceptHunkRef.current?.(range);
      } else {
        onRejectHunkRef.current?.(range);
      }
    },
    [changeBlocks, effectiveDecisions, isDecisionsControlled],
  );

  // --- Edit mode -------------------------------------------------
  const [editMode, setEditMode] = useState<boolean>(defaultEditMode);

  // --- Folds -----------------------------------------------------
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

  // --- Keyboard --------------------------------------------------
  const handleKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLDivElement>) => {
      if (event.key === 'n' || (event.key === 'ArrowDown' && event.altKey)) {
        event.preventDefault();
        moveActive(1);
      } else if (
        event.key === 'p' ||
        (event.key === 'ArrowUp' && event.altKey)
      ) {
        event.preventDefault();
        moveActive(-1);
      }
    },
    [moveActive],
  );

  // --- Render helpers -------------------------------------------
  const renderCell = useCallback(
    (text: string): ReactNode => {
      if (renderText) return renderText(text, language);
      return text;
    },
    [renderText, language],
  );

  const activeBlock =
    changeBlocks.length > 0 && effectiveActive < changeBlocks.length
      ? changeBlocks[effectiveActive]!
      : null;

  const summary = useMemo(() => {
    let adds = 0;
    let removes = 0;
    for (const line of lines) {
      if (line.type === 'add') adds += 1;
      else if (line.type === 'remove') removes += 1;
    }
    return { adds, removes };
  }, [lines]);

  // Group lines by hunk index for action-button placement.
  // We attach an "accept/reject" toolbar to the LAST line of each
  // change block so the buttons sit at the bottom edge.

  return (
    <div
      ref={ref}
      role="region"
      aria-label={ariaLabel}
      tabIndex={0}
      data-section="diff-editor"
      data-language={language}
      data-change-count={changeBlocks.length}
      data-active-hunk-index={effectiveActive}
      data-edit-mode={editMode ? 'true' : 'false'}
      data-read-only={readOnly ? 'true' : 'false'}
      onKeyDown={handleKeyDown}
      className={cn(
        'flex flex-col rounded-md border border-border bg-card font-mono text-xs',
        className,
      )}
    >
      <header
        data-section="diff-editor-header"
        className="flex items-center justify-between gap-2 border-b border-border px-3 py-1"
      >
        <span data-section="diff-editor-summary">
          +{summary.adds} -{summary.removes}
        </span>
        <div
          data-section="diff-editor-nav"
          className="flex items-center gap-1"
        >
          <button
            type="button"
            aria-label="Previous hunk"
            data-section="diff-editor-prev"
            disabled={changeBlocks.length === 0}
            onClick={() => moveActive(-1)}
            className="rounded border border-border px-2 py-0.5 hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            Prev
          </button>
          <span
            data-section="diff-editor-counter"
            className="px-1 tabular-nums text-muted-foreground"
          >
            {changeBlocks.length === 0
              ? '0 / 0'
              : `${Math.min(effectiveActive + 1, changeBlocks.length)} / ${changeBlocks.length}`}
          </span>
          <button
            type="button"
            aria-label="Next hunk"
            data-section="diff-editor-next"
            disabled={changeBlocks.length === 0}
            onClick={() => moveActive(1)}
            className="rounded border border-border px-2 py-0.5 hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            Next
          </button>
          {!readOnly ? (
            <button
              type="button"
              aria-label={editMode ? doneLabel : editLabel}
              data-section="diff-editor-edit-toggle"
              onClick={() => setEditMode((prev) => !prev)}
              className="ml-2 rounded border border-border px-2 py-0.5 hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              {editMode ? doneLabel : editLabel}
            </button>
          ) : null}
        </div>
      </header>

      <div
        data-section="diff-editor-body"
        className="overflow-x-auto"
      >
        {editMode && !readOnly ? (
          <textarea
            data-section="diff-editor-textarea"
            aria-label="After content"
            value={after}
            onChange={(e) =>
              onAfterChangeRef.current?.(e.target.value)
            }
            className="min-h-48 w-full bg-transparent p-2 font-mono text-xs text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          />
        ) : (
          <table
            data-section="diff-editor-unified"
            className="w-full border-collapse"
          >
            <colgroup>
              {showLineNumbers ? <col className="w-10" /> : null}
              {showLineNumbers ? <col className="w-10" /> : null}
              <col className="w-4" />
              <col />
              <col className="w-32" />
            </colgroup>
            <tbody>
              {hunks.map((hunk) => {
                if (
                  hunk.type === 'fold' &&
                  !isExpanded(hunk.id)
                ) {
                  return (
                    <FoldRow
                      key={hunk.id}
                      hunk={hunk}
                      onExpand={() => toggleFold(hunk.id)}
                      colSpan={
                        (showLineNumbers ? 2 : 0) + 3
                      }
                    />
                  );
                }
                return hunk.lines.map((line) => {
                  const lineIndex = lines.indexOf(line);
                  const blockIdx = blockForLine[lineIndex] ?? -1;
                  const isActive =
                    activeBlock !== null &&
                    lineIndex >= activeBlock.startIndex &&
                    lineIndex <= activeBlock.endIndex;
                  const decision =
                    blockIdx !== -1
                      ? effectiveDecisions.get(blockIdx)
                      : undefined;
                  const block =
                    blockIdx !== -1
                      ? changeBlocks[blockIdx]
                      : undefined;
                  const isLastOfBlock =
                    block !== undefined &&
                    lineIndex === block.endIndex;
                  return (
                    <tr
                      key={`${hunk.id}-${lineIndex}`}
                      data-section="diff-editor-row"
                      data-line-type={line.type}
                      data-line-index={lineIndex}
                      data-block-index={
                        blockIdx === -1 ? '' : blockIdx
                      }
                      data-decision={decision ?? ''}
                      data-active={isActive ? 'true' : 'false'}
                      className={cn(
                        LINE_TYPE_CLASS[line.type],
                        isActive &&
                          'outline outline-1 outline-primary/60',
                        decision === 'reject' &&
                          'opacity-60 line-through',
                      )}
                    >
                      {showLineNumbers ? (
                        <td
                          data-section="diff-editor-line-number"
                          data-side="old"
                          className="select-none px-2 text-right text-muted-foreground tabular-nums"
                        >
                          {line.oldLineNumber ?? ''}
                        </td>
                      ) : null}
                      {showLineNumbers ? (
                        <td
                          data-section="diff-editor-line-number"
                          data-side="new"
                          className="select-none px-2 text-right text-muted-foreground tabular-nums"
                        >
                          {line.newLineNumber ?? ''}
                        </td>
                      ) : null}
                      <td
                        data-section="diff-editor-line-prefix"
                        aria-hidden="true"
                        className="select-none px-1 text-center text-muted-foreground"
                      >
                        {LINE_PREFIX[line.type]}
                      </td>
                      <td
                        data-section="diff-editor-line-content"
                        className="whitespace-pre px-2"
                      >
                        {renderCell(line.text)}
                      </td>
                      <td
                        data-section="diff-editor-line-actions"
                        className="select-none px-1 text-right"
                      >
                        {isLastOfBlock && !readOnly ? (
                          <div className="inline-flex items-center gap-1">
                            <button
                              type="button"
                              data-section="diff-editor-accept"
                              data-block-index={blockIdx}
                              aria-label={`${acceptLabel} hunk ${blockIdx + 1}`}
                              onClick={() => setDecision(blockIdx, 'accept')}
                              className={cn(
                                'rounded border border-border px-1.5 py-0.5 text-emerald-300 hover:bg-emerald-500/20',
                                decision === 'accept' &&
                                  'bg-emerald-500/20',
                              )}
                            >
                              {acceptLabel}
                            </button>
                            <button
                              type="button"
                              data-section="diff-editor-reject"
                              data-block-index={blockIdx}
                              aria-label={`${rejectLabel} hunk ${blockIdx + 1}`}
                              onClick={() => setDecision(blockIdx, 'reject')}
                              className={cn(
                                'rounded border border-border px-1.5 py-0.5 text-rose-300 hover:bg-rose-500/20',
                                decision === 'reject' &&
                                  'bg-rose-500/20',
                              )}
                            >
                              {rejectLabel}
                            </button>
                          </div>
                        ) : null}
                      </td>
                    </tr>
                  );
                });
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
});

DiffEditor.displayName = 'DiffEditor';

interface FoldRowProps {
  hunk: DiffHunk;
  onExpand: () => void;
  colSpan: number;
}

function FoldRow({ hunk, onExpand, colSpan }: FoldRowProps) {
  return (
    <tr
      data-section="diff-editor-fold"
      data-fold-id={hunk.id}
      data-fold-count={hunk.foldedLineCount ?? 0}
    >
      <td colSpan={colSpan} className="p-0">
        <button
          type="button"
          onClick={onExpand}
          aria-label={`Expand ${hunk.foldedLineCount ?? 0} unchanged lines`}
          data-section="diff-editor-fold-button"
          className="w-full bg-muted/40 px-3 py-1 text-left text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          ... {hunk.foldedLineCount ?? 0} unchanged lines (click to expand)
        </button>
      </td>
    </tr>
  );
}
