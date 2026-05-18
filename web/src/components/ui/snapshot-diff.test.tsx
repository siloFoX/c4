import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  cleanup,
  fireEvent,
  render,
  screen,
} from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { createRef } from 'react';
import {
  SnapshotDiff,
  computeLineDiff,
  findDiffChangeBlocks,
  groupDiffHunks,
  pairSideBySide,
} from './snapshot-diff';
import type { DiffLine } from './snapshot-diff';

afterEach(() => {
  cleanup();
});

describe('computeLineDiff', () => {
  it('returns [] for two empty inputs', () => {
    expect(computeLineDiff('', '')).toEqual([]);
  });

  it('returns all-add for empty before', () => {
    const result = computeLineDiff('', 'a\nb');
    expect(result).toEqual([
      { type: 'add', oldLineNumber: null, newLineNumber: 1, text: 'a' },
      { type: 'add', oldLineNumber: null, newLineNumber: 2, text: 'b' },
    ]);
  });

  it('returns all-remove for empty after', () => {
    const result = computeLineDiff('a\nb', '');
    expect(result).toEqual([
      { type: 'remove', oldLineNumber: 1, newLineNumber: null, text: 'a' },
      { type: 'remove', oldLineNumber: 2, newLineNumber: null, text: 'b' },
    ]);
  });

  it('returns all-equal for identical inputs', () => {
    const result = computeLineDiff('a\nb\nc', 'a\nb\nc');
    expect(result.every((l) => l.type === 'equal')).toBe(true);
    expect(result).toHaveLength(3);
  });

  it('handles a one-line change', () => {
    const result = computeLineDiff('a\nb\nc', 'a\nB\nc');
    const types = result.map((l) => l.type);
    expect(types).toContain('remove');
    expect(types).toContain('add');
    expect(types.filter((t) => t === 'equal')).toHaveLength(2);
  });

  it('emits correct line numbers for mixed changes', () => {
    const result = computeLineDiff('a\nb\nc', 'a\nx\nc');
    const equal0 = result.find((l) => l.text === 'a');
    const equal2 = result.find((l) => l.text === 'c');
    const remove = result.find((l) => l.text === 'b');
    const add = result.find((l) => l.text === 'x');
    expect(equal0?.oldLineNumber).toBe(1);
    expect(equal0?.newLineNumber).toBe(1);
    expect(remove?.oldLineNumber).toBe(2);
    expect(remove?.newLineNumber).toBeNull();
    expect(add?.oldLineNumber).toBeNull();
    expect(add?.newLineNumber).toBe(2);
    expect(equal2?.oldLineNumber).toBe(3);
    expect(equal2?.newLineNumber).toBe(3);
  });

  it('preserves order across multiple edits', () => {
    const result = computeLineDiff(
      'a\nb\nc\nd',
      'a\nB\nc\nD',
    );
    expect(result.map((l) => l.text)).toEqual([
      'a',
      'b',
      'B',
      'c',
      'd',
      'D',
    ]);
  });
});

describe('findDiffChangeBlocks', () => {
  it('returns [] when there are no changes', () => {
    const lines = computeLineDiff('a\nb', 'a\nb');
    expect(findDiffChangeBlocks(lines)).toEqual([]);
  });

  it('returns one block for a single change', () => {
    const lines = computeLineDiff('a\nb\nc', 'a\nB\nc');
    const blocks = findDiffChangeBlocks(lines);
    expect(blocks).toHaveLength(1);
  });

  it('returns multiple blocks for separated changes', () => {
    const lines = computeLineDiff(
      'a\nb\nc\nd\ne\nf\ng',
      'a\nB\nc\nd\ne\nF\ng',
    );
    const blocks = findDiffChangeBlocks(lines);
    expect(blocks).toHaveLength(2);
  });

  it('groups consecutive non-equal lines into one block', () => {
    const lines: DiffLine[] = [
      { type: 'equal', oldLineNumber: 1, newLineNumber: 1, text: 'a' },
      { type: 'remove', oldLineNumber: 2, newLineNumber: null, text: 'x' },
      { type: 'add', oldLineNumber: null, newLineNumber: 2, text: 'y' },
      { type: 'remove', oldLineNumber: 3, newLineNumber: null, text: 'z' },
      { type: 'equal', oldLineNumber: 4, newLineNumber: 3, text: 'b' },
    ];
    const blocks = findDiffChangeBlocks(lines);
    expect(blocks).toEqual([{ startIndex: 1, endIndex: 3 }]);
  });
});

describe('groupDiffHunks', () => {
  it('folds an all-equal diff entirely (no anchor blocks)', () => {
    const lines = computeLineDiff('a\nb', 'a\nb');
    const hunks = groupDiffHunks(lines, 3);
    expect(hunks).toHaveLength(1);
    expect(hunks[0]?.type).toBe('fold');
    expect(hunks[0]?.foldedLineCount).toBe(2);
  });

  it('folds the middle of a long equal run', () => {
    const long = Array.from({ length: 20 }, (_, i) => `line${i}`).join('\n');
    const lines = computeLineDiff(long, long);
    const hunks = groupDiffHunks(lines, 2);
    // Since the entire diff is equal + isFirst + isLast, head=0 tail=0
    // -> one fold or one lines block. With both isFirst and isLast true,
    // head = 0 and tail = 0, so foldCount = 20 entirely.
    expect(hunks.some((h) => h.type === 'fold')).toBe(true);
  });

  it('keeps short equal runs unfolded', () => {
    const lines = computeLineDiff('a\nb\nc', 'a\nB\nc');
    const hunks = groupDiffHunks(lines, 3);
    expect(hunks.every((h) => h.type === 'lines')).toBe(true);
  });

  it('folds the gap between two changes when the gap is large', () => {
    const before = 'a\n' + Array.from({ length: 15 }, (_, i) => `mid${i}`).join('\n') + '\nz';
    const after = 'A\n' + Array.from({ length: 15 }, (_, i) => `mid${i}`).join('\n') + '\nZ';
    const lines = computeLineDiff(before, after);
    const hunks = groupDiffHunks(lines, 2);
    expect(hunks.some((h) => h.type === 'fold')).toBe(true);
  });

  it('produces empty array for empty diff', () => {
    expect(groupDiffHunks([], 3)).toEqual([]);
  });
});

describe('pairSideBySide', () => {
  it('pairs equal lines on both sides', () => {
    const lines: DiffLine[] = [
      { type: 'equal', oldLineNumber: 1, newLineNumber: 1, text: 'a' },
    ];
    const rows = pairSideBySide(lines);
    expect(rows).toEqual([{ left: lines[0], right: lines[0] }]);
  });

  it('pairs consecutive remove + add', () => {
    const lines: DiffLine[] = [
      { type: 'remove', oldLineNumber: 1, newLineNumber: null, text: 'old' },
      { type: 'add', oldLineNumber: null, newLineNumber: 1, text: 'new' },
    ];
    const rows = pairSideBySide(lines);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.left?.text).toBe('old');
    expect(rows[0]?.right?.text).toBe('new');
  });

  it('emits unpaired removes with empty right', () => {
    const lines: DiffLine[] = [
      { type: 'remove', oldLineNumber: 1, newLineNumber: null, text: 'r1' },
      { type: 'remove', oldLineNumber: 2, newLineNumber: null, text: 'r2' },
      { type: 'add', oldLineNumber: null, newLineNumber: 1, text: 'a1' },
    ];
    const rows = pairSideBySide(lines);
    expect(rows).toHaveLength(2);
    expect(rows[0]?.left?.text).toBe('r1');
    expect(rows[0]?.right?.text).toBe('a1');
    expect(rows[1]?.left?.text).toBe('r2');
    expect(rows[1]?.right).toBeNull();
  });

  it('emits unpaired adds with empty left', () => {
    const lines: DiffLine[] = [
      { type: 'add', oldLineNumber: null, newLineNumber: 1, text: 'a1' },
      { type: 'add', oldLineNumber: null, newLineNumber: 2, text: 'a2' },
    ];
    const rows = pairSideBySide(lines);
    expect(rows).toHaveLength(2);
    expect(rows[0]?.left).toBeNull();
    expect(rows[0]?.right?.text).toBe('a1');
    expect(rows[1]?.left).toBeNull();
    expect(rows[1]?.right?.text).toBe('a2');
  });

  it('returns an empty array for empty input', () => {
    expect(pairSideBySide([])).toEqual([]);
  });
});

describe('SnapshotDiff component', () => {
  it('renders a region with the default aria-label', () => {
    render(<SnapshotDiff before="" after="" />);
    expect(screen.getByRole('region')).toHaveAttribute(
      'aria-label',
      'Snapshot diff',
    );
  });

  it('honors a custom ariaLabel', () => {
    render(
      <SnapshotDiff before="" after="" ariaLabel="Audit diff" />,
    );
    expect(screen.getByRole('region')).toHaveAttribute(
      'aria-label',
      'Audit diff',
    );
  });

  it('exposes data-mode + data-language + data-change-count on root', () => {
    render(
      <SnapshotDiff
        before="a"
        after="b"
        mode="side-by-side"
        language="ts"
      />,
    );
    const region = screen.getByRole('region');
    expect(region).toHaveAttribute('data-mode', 'side-by-side');
    expect(region).toHaveAttribute('data-language', 'ts');
    expect(region).toHaveAttribute('data-change-count', '1');
  });

  it('renders the unified view by default', () => {
    const { container } = render(
      <SnapshotDiff before="a" after="b" />,
    );
    expect(
      container.querySelector('[data-section="snapshot-diff-unified"]'),
    ).toBeInTheDocument();
  });

  it('renders side-by-side view when mode="side-by-side"', () => {
    const { container } = render(
      <SnapshotDiff before="a" after="b" mode="side-by-side" />,
    );
    expect(
      container.querySelector(
        '[data-section="snapshot-diff-side-by-side"]',
      ),
    ).toBeInTheDocument();
  });

  it('renders the summary "+N -M"', () => {
    render(<SnapshotDiff before="a\nb" after="a\nB\nC" />);
    const summary = screen.getByText(/\+.* -.*/);
    expect(summary).toBeInTheDocument();
  });

  it('disables the Prev / Next buttons when no changes exist', () => {
    render(<SnapshotDiff before="a\nb" after="a\nb" />);
    expect(
      screen.getByRole('button', { name: 'Previous change' }),
    ).toBeDisabled();
    expect(
      screen.getByRole('button', { name: 'Next change' }),
    ).toBeDisabled();
  });

  it('enables Prev / Next when changes exist', () => {
    render(<SnapshotDiff before="a" after="b" />);
    expect(
      screen.getByRole('button', { name: 'Previous change' }),
    ).not.toBeDisabled();
    expect(
      screen.getByRole('button', { name: 'Next change' }),
    ).not.toBeDisabled();
  });

  it('Next button advances activeChangeIndex (uncontrolled)', () => {
    const onActiveChangeIndex = vi.fn();
    render(
      <SnapshotDiff
        before={'a\nb\nc\nd\ne\nf\ng'}
        after={'a\nB\nc\nd\ne\nF\ng'}
        onActiveChangeIndex={onActiveChangeIndex}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Next change' }));
    expect(onActiveChangeIndex).toHaveBeenCalledWith(1);
  });

  it('Next wraps around the last block back to first', () => {
    const onActiveChangeIndex = vi.fn();
    render(
      <SnapshotDiff
        before="a\nb"
        after="A\nB"
        onActiveChangeIndex={onActiveChangeIndex}
      />,
    );
    // Only 1 change block; Next should wrap to 0
    fireEvent.click(screen.getByRole('button', { name: 'Next change' }));
    expect(onActiveChangeIndex).toHaveBeenCalledWith(0);
  });

  it('Prev wraps to the last block from the first', () => {
    const onActiveChangeIndex = vi.fn();
    render(
      <SnapshotDiff
        before={'a\nb\nc\nd\ne\nf\ng'}
        after={'a\nB\nc\nd\ne\nF\ng'}
        onActiveChangeIndex={onActiveChangeIndex}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Previous change' }));
    expect(onActiveChangeIndex).toHaveBeenCalledWith(1);
  });

  it('controlled activeChangeIndex prop overrides internal state', () => {
    const { rerender } = render(
      <SnapshotDiff
        before={'a\nb\nc\nd\ne\nf\ng'}
        after={'a\nB\nc\nd\ne\nF\ng'}
        activeChangeIndex={0}
      />,
    );
    expect(screen.getByRole('region')).toHaveAttribute(
      'data-active-change-index',
      '0',
    );
    rerender(
      <SnapshotDiff
        before={'a\nb\nc\nd\ne\nf\ng'}
        after={'a\nB\nc\nd\ne\nF\ng'}
        activeChangeIndex={1}
      />,
    );
    expect(screen.getByRole('region')).toHaveAttribute(
      'data-active-change-index',
      '1',
    );
  });

  it('renders line numbers by default', () => {
    const { container } = render(
      <SnapshotDiff before="a" after="b" />,
    );
    expect(
      container.querySelector(
        '[data-section="snapshot-diff-line-number"]',
      ),
    ).toBeInTheDocument();
  });

  it('omits line numbers when showLineNumbers=false', () => {
    const { container } = render(
      <SnapshotDiff
        before="a"
        after="b"
        showLineNumbers={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="snapshot-diff-line-number"]',
      ),
    ).toBeNull();
  });

  it('uses the renderText prop when supplied', () => {
    render(
      <SnapshotDiff
        before="a"
        after="b"
        language="js"
        renderText={(text, lang) => (
          <span data-testid="rendered">{lang}:{text}</span>
        )}
      />,
    );
    const rendered = screen.getAllByTestId('rendered');
    expect(rendered.length).toBeGreaterThan(0);
    expect(rendered[0]?.textContent).toContain('js:');
  });

  it('attaches data-line-type per row in unified mode', () => {
    const { container } = render(
      <SnapshotDiff before="a" after="b" />,
    );
    const rows = container.querySelectorAll(
      '[data-section="snapshot-diff-row"]',
    );
    const types = Array.from(rows).map((r) =>
      r.getAttribute('data-line-type'),
    );
    expect(types).toContain('remove');
    expect(types).toContain('add');
  });

  it('highlights the active block with data-active="true"', () => {
    const { container } = render(
      <SnapshotDiff
        before={'a\nb\nc\nd\ne\nf\ng'}
        after={'a\nB\nc\nd\ne\nF\ng'}
        activeChangeIndex={0}
      />,
    );
    const activeRows = container.querySelectorAll(
      '[data-section="snapshot-diff-row"][data-active="true"]',
    );
    expect(activeRows.length).toBeGreaterThan(0);
  });

  it('shows the change counter in the nav', () => {
    render(
      <SnapshotDiff
        before={'a\nb\nc\nd\ne\nf\ng'}
        after={'a\nB\nc\nd\ne\nF\ng'}
      />,
    );
    expect(screen.getByText('1 / 2')).toBeInTheDocument();
  });

  it('shows "0 / 0" when there are no changes', () => {
    render(<SnapshotDiff before="a\nb" after="a\nb" />);
    expect(screen.getByText('0 / 0')).toBeInTheDocument();
  });

  it('renders a fold row for long unchanged regions', () => {
    const long = Array.from({ length: 20 }, (_, i) => `line${i}`).join('\n');
    const { container } = render(
      <SnapshotDiff
        before={`a\n${long}\nz`}
        after={`A\n${long}\nZ`}
        contextLines={2}
      />,
    );
    expect(
      container.querySelector('[data-section="snapshot-diff-fold"]'),
    ).toBeInTheDocument();
  });

  it('expands a fold when its button is clicked', () => {
    const long = Array.from({ length: 20 }, (_, i) => `line${i}`).join('\n');
    const { container } = render(
      <SnapshotDiff
        before={`a\n${long}\nz`}
        after={`A\n${long}\nZ`}
        contextLines={2}
      />,
    );
    const foldButton = container.querySelector(
      '[data-section="snapshot-diff-fold-button"]',
    ) as HTMLButtonElement;
    expect(foldButton).toBeInTheDocument();
    fireEvent.click(foldButton);
    // After expansion, the fold row no longer reports as a fold
    expect(
      container.querySelector(
        '[data-section="snapshot-diff-fold"]',
      ),
    ).toBeNull();
  });

  it('side-by-side renders both sides for an equal line', () => {
    const { container } = render(
      <SnapshotDiff
        before="a\nb"
        after="a\nB"
        mode="side-by-side"
      />,
    );
    const cells = container.querySelectorAll(
      '[data-section="snapshot-diff-cell"][data-side="old"]',
    );
    expect(cells.length).toBeGreaterThan(0);
  });

  it('side-by-side pairs remove + add into one row', () => {
    const { container } = render(
      <SnapshotDiff before="a" after="b" mode="side-by-side" />,
    );
    const rows = container.querySelectorAll(
      '[data-section="snapshot-diff-row"]',
    );
    // 1 paired row
    expect(rows.length).toBe(1);
  });

  it('exposes a stable displayName', () => {
    expect(SnapshotDiff.displayName).toBe('SnapshotDiff');
  });

  it('forwards refs to the root region', () => {
    const ref = createRef<HTMLDivElement>();
    render(<SnapshotDiff ref={ref} before="a" after="b" />);
    expect(ref.current?.getAttribute('role')).toBe('region');
  });

  it('alt+ArrowDown navigates to the next change', () => {
    const onActiveChangeIndex = vi.fn();
    render(
      <SnapshotDiff
        before={'a\nb\nc\nd\ne\nf\ng'}
        after={'a\nB\nc\nd\ne\nF\ng'}
        onActiveChangeIndex={onActiveChangeIndex}
      />,
    );
    fireEvent.keyDown(screen.getByRole('region'), {
      key: 'ArrowDown',
      altKey: true,
    });
    expect(onActiveChangeIndex).toHaveBeenCalledWith(1);
  });

  it('n key navigates to the next change', () => {
    const onActiveChangeIndex = vi.fn();
    render(
      <SnapshotDiff
        before={'a\nb\nc\nd\ne\nf\ng'}
        after={'a\nB\nc\nd\ne\nF\ng'}
        onActiveChangeIndex={onActiveChangeIndex}
      />,
    );
    fireEvent.keyDown(screen.getByRole('region'), { key: 'n' });
    expect(onActiveChangeIndex).toHaveBeenCalledWith(1);
  });

  it('p key navigates to the previous change', () => {
    const onActiveChangeIndex = vi.fn();
    render(
      <SnapshotDiff
        before={'a\nb\nc\nd\ne\nf\ng'}
        after={'a\nB\nc\nd\ne\nF\ng'}
        onActiveChangeIndex={onActiveChangeIndex}
      />,
    );
    fireEvent.keyDown(screen.getByRole('region'), { key: 'p' });
    expect(onActiveChangeIndex).toHaveBeenCalledWith(1);
  });

  it('defaultExpandedFolds=true skips the fold collapse on mount', () => {
    const long = Array.from({ length: 20 }, (_, i) => `line${i}`).join('\n');
    const { container } = render(
      <SnapshotDiff
        before={`a\n${long}\nz`}
        after={`A\n${long}\nZ`}
        contextLines={2}
        defaultExpandedFolds={true}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="snapshot-diff-fold"]',
      ),
    ).toBeNull();
  });

  it('attaches data-fold-count on the fold row', () => {
    const long = Array.from({ length: 20 }, (_, i) => `line${i}`).join('\n');
    const { container } = render(
      <SnapshotDiff
        before={`a\n${long}\nz`}
        after={`A\n${long}\nZ`}
        contextLines={2}
      />,
    );
    const fold = container.querySelector(
      '[data-section="snapshot-diff-fold"]',
    );
    const count = Number(fold?.getAttribute('data-fold-count'));
    expect(count).toBeGreaterThan(0);
  });

  it('handles empty before and after by rendering nothing in the body', () => {
    const { container } = render(
      <SnapshotDiff before="" after="" />,
    );
    expect(
      container.querySelector('[data-section="snapshot-diff-row"]'),
    ).toBeNull();
  });
});
