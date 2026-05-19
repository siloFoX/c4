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
  DEFAULT_TEXT_DIFF_CONTEXT_LINES,
  DEFAULT_TEXT_DIFF_MODE,
  TextDiff,
  copyTextToClipboard,
  diffLines,
  diffWords,
  tokenizeWords,
  toUnifiedDiff,
} from './text-diff';

afterEach(() => {
  cleanup();
});

// ---------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------

describe('tokenizeWords', () => {
  it('returns empty for empty', () => {
    expect(tokenizeWords('')).toEqual([]);
  });
  it('splits on whitespace + keeps separators', () => {
    expect(tokenizeWords('hello world')).toEqual([
      'hello',
      ' ',
      'world',
    ]);
  });
  it('keeps consecutive whitespace as a single token', () => {
    expect(tokenizeWords('a   b')).toEqual(['a', '   ', 'b']);
  });
});

describe('diffWords', () => {
  it('identical inputs return all equal ops', () => {
    const ops = diffWords('hello world', 'hello world');
    expect(ops.every((op) => op.type === 'equal')).toBe(true);
  });
  it('detects an insertion', () => {
    const ops = diffWords('hello', 'hello world');
    const inserts = ops.filter((op) => op.type === 'insert');
    expect(inserts.length).toBeGreaterThan(0);
    expect(inserts.some((op) => op.text === 'world')).toBe(true);
  });
  it('detects a deletion', () => {
    const ops = diffWords('hello world', 'hello');
    const deletes = ops.filter((op) => op.type === 'delete');
    expect(deletes.length).toBeGreaterThan(0);
    expect(deletes.some((op) => op.text === 'world')).toBe(true);
  });
  it('detects a substitution', () => {
    const ops = diffWords('the quick fox', 'the slow fox');
    const inserts = ops.filter((op) => op.type === 'insert');
    const deletes = ops.filter((op) => op.type === 'delete');
    expect(inserts.some((op) => op.text === 'slow')).toBe(true);
    expect(deletes.some((op) => op.text === 'quick')).toBe(true);
  });
  it('empty before -> all inserts', () => {
    const ops = diffWords('', 'hello world');
    expect(ops.every((op) => op.type === 'insert')).toBe(true);
  });
  it('empty after -> all deletes', () => {
    const ops = diffWords('hello world', '');
    expect(ops.every((op) => op.type === 'delete')).toBe(true);
  });
});

describe('diffLines', () => {
  it('attaches before/after line numbers', () => {
    const ops = diffLines('a\nb\nc', 'a\nB\nc');
    const equalA = ops.find(
      (op) => op.type === 'equal' && op.text === 'a',
    );
    expect(equalA?.beforeLine).toBe(1);
    expect(equalA?.afterLine).toBe(1);
    const deleteB = ops.find(
      (op) => op.type === 'delete' && op.text === 'b',
    );
    expect(deleteB?.beforeLine).toBe(2);
    expect(deleteB?.afterLine).toBeUndefined();
    const insertB = ops.find(
      (op) => op.type === 'insert' && op.text === 'B',
    );
    expect(insertB?.afterLine).toBe(2);
    expect(insertB?.beforeLine).toBeUndefined();
  });
  it('all-equal case returns equal-only ops', () => {
    const ops = diffLines('a\nb', 'a\nb');
    expect(ops.every((op) => op.type === 'equal')).toBe(true);
  });
});

describe('toUnifiedDiff', () => {
  it('returns just headers for no-op diff', () => {
    expect(toUnifiedDiff('same\ntext', 'same\ntext')).toContain(
      '--- a',
    );
    expect(toUnifiedDiff('same\ntext', 'same\ntext')).toContain(
      '+++ b',
    );
  });
  it('emits a hunk header with line ranges', () => {
    const cmd = toUnifiedDiff(
      'line1\nold\nline3',
      'line1\nnew\nline3',
    );
    expect(cmd).toContain('@@ -');
    expect(cmd).toContain('-old');
    expect(cmd).toContain('+new');
  });
  it('honours custom before/after labels', () => {
    const cmd = toUnifiedDiff('a', 'b', {
      beforeLabel: 'old.txt',
      afterLabel: 'new.txt',
    });
    expect(cmd).toContain('--- old.txt');
    expect(cmd).toContain('+++ new.txt');
  });
  it('respects custom contextLines', () => {
    const before = ['1', '2', '3', '4', '5', '6', '7'].join('\n');
    const after = ['1', '2', '3', '4', '5', '6', '7'].join('\n').replace(
      '4',
      'four',
    );
    const cmd = toUnifiedDiff(before, after, { contextLines: 1 });
    // Only +/- one line of context on each side -> hunk text should
    // be small.
    expect(cmd).toContain('@@');
    expect(cmd).toContain('-4');
    expect(cmd).toContain('+four');
  });
});

describe('copyTextToClipboard', () => {
  it('writes via clipboard.writeText when available', async () => {
    const writeText = vi.fn(() => Promise.resolve());
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    });
    const ok = await copyTextToClipboard('hi');
    expect(ok).toBe(true);
    expect(writeText).toHaveBeenCalledWith('hi');
  });
  it('returns false on rejection', async () => {
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText: () => Promise.reject(new Error('denied')),
      },
    });
    expect(await copyTextToClipboard('hi')).toBe(false);
  });
});

describe('Constants', () => {
  it('default mode is inline-word', () => {
    expect(DEFAULT_TEXT_DIFF_MODE).toBe('inline-word');
  });
  it('default context lines is 3', () => {
    expect(DEFAULT_TEXT_DIFF_CONTEXT_LINES).toBe(3);
  });
});

// ---------------------------------------------------------------
// Component
// ---------------------------------------------------------------

describe('TextDiff component', () => {
  it('renders a region with default aria-label', () => {
    render(<TextDiff before="hi" after="hi" />);
    expect(screen.getByRole('region')).toHaveAttribute(
      'aria-label',
      'Text diff',
    );
  });

  it('honors custom ariaLabel', () => {
    render(
      <TextDiff
        before="a"
        after="b"
        ariaLabel="Review changes"
      />,
    );
    expect(screen.getByRole('region')).toHaveAttribute(
      'aria-label',
      'Review changes',
    );
  });

  it('starts in inline-word mode', () => {
    render(<TextDiff before="hi" after="hi" />);
    expect(screen.getByRole('region')).toHaveAttribute(
      'data-mode',
      'inline-word',
    );
  });

  it('renders insert + delete tokens in inline mode', () => {
    const { container } = render(
      <TextDiff before="the quick fox" after="the slow fox" />,
    );
    const inserts = container.querySelectorAll(
      '[data-section="text-diff-token"][data-token-type="insert"]',
    );
    const deletes = container.querySelectorAll(
      '[data-section="text-diff-token"][data-token-type="delete"]',
    );
    expect(inserts.length).toBeGreaterThan(0);
    expect(deletes.length).toBeGreaterThan(0);
  });

  it('summary counts mirror the operation counts', () => {
    const { container } = render(
      <TextDiff
        before="the quick brown fox"
        after="the slow black fox"
      />,
    );
    const region = container.querySelector(
      '[data-section="text-diff"]',
    );
    const inserts = Number(
      region?.getAttribute('data-insert-count') ?? '0',
    );
    const deletes = Number(
      region?.getAttribute('data-delete-count') ?? '0',
    );
    expect(inserts).toBeGreaterThan(0);
    expect(deletes).toBeGreaterThan(0);
  });

  it('mode toggle switches to line mode', () => {
    render(<TextDiff before="a\nb" after="a\nB" />);
    const lineRadio = screen.getByRole('radio', { name: 'Line' });
    fireEvent.click(lineRadio);
    expect(screen.getByRole('region')).toHaveAttribute(
      'data-mode',
      'line',
    );
  });

  it('mode toggle fires onModeChange', () => {
    const onModeChange = vi.fn();
    render(
      <TextDiff
        before="a"
        after="b"
        onModeChange={onModeChange}
      />,
    );
    fireEvent.click(screen.getByRole('radio', { name: 'Line' }));
    expect(onModeChange).toHaveBeenCalledWith('line');
  });

  it('controlled mode pins the rendered mode', () => {
    const { rerender } = render(
      <TextDiff before="a" after="b" mode="inline-word" />,
    );
    expect(screen.getByRole('region')).toHaveAttribute(
      'data-mode',
      'inline-word',
    );
    rerender(<TextDiff before="a" after="b" mode="line" />);
    expect(screen.getByRole('region')).toHaveAttribute(
      'data-mode',
      'line',
    );
  });

  it('line mode renders one li per op', () => {
    const { container } = render(
      <TextDiff before={'a\nb'} after={'a\nB'} mode="line" />,
    );
    expect(
      container.querySelectorAll(
        '[data-section="text-diff-line"]',
      ).length,
    ).toBe(3); // a (equal) + b (delete) + B (insert)
  });

  it('per-line data-line-type reflects op kind', () => {
    const { container } = render(
      <TextDiff before={'a\nb'} after={'a\nB'} mode="line" />,
    );
    const lines = container.querySelectorAll(
      '[data-section="text-diff-line"]',
    );
    expect(lines[0]?.getAttribute('data-line-type')).toBe('equal');
    expect(
      Array.from(lines).some(
        (l) => l.getAttribute('data-line-type') === 'delete',
      ),
    ).toBe(true);
    expect(
      Array.from(lines).some(
        (l) => l.getAttribute('data-line-type') === 'insert',
      ),
    ).toBe(true);
  });

  it('per-line before/after numbers attached', () => {
    const { container } = render(
      <TextDiff before={'a\nb\nc'} after={'a\nB\nc'} mode="line" />,
    );
    const lines = container.querySelectorAll(
      '[data-section="text-diff-line"]',
    );
    // first line is equal -> beforeLine=1 afterLine=1
    expect(lines[0]?.getAttribute('data-before-line')).toBe('1');
    expect(lines[0]?.getAttribute('data-after-line')).toBe('1');
  });

  it('summary +N/-N chips render in the toolbar', () => {
    render(<TextDiff before="hello world" after="hello there" />);
    const inserts = screen.getByText(/^\+\d+$/);
    const deletes = screen.getByText(/^-\d+$/);
    expect(inserts).toBeInTheDocument();
    expect(deletes).toBeInTheDocument();
  });

  it('copy button fires onCopyDiff with the unified diff', () => {
    const onCopyDiff = vi.fn();
    render(
      <TextDiff
        before={'line1\nold\nline3'}
        after={'line1\nnew\nline3'}
        onCopyDiff={onCopyDiff}
      />,
    );
    fireEvent.click(screen.getByLabelText('Copy unified diff'));
    const text = onCopyDiff.mock.calls[0]![0] as string;
    expect(text).toContain('--- a');
    expect(text).toContain('+++ b');
    expect(text).toContain('-old');
    expect(text).toContain('+new');
  });

  it('showCopyDiff=false hides the copy button', () => {
    render(
      <TextDiff before="a" after="b" showCopyDiff={false} />,
    );
    expect(
      screen.queryByLabelText('Copy unified diff'),
    ).toBeNull();
  });

  it('beforeLabel + afterLabel reflect in the copied diff', () => {
    const onCopyDiff = vi.fn();
    render(
      <TextDiff
        before="a"
        after="b"
        beforeLabel="old.txt"
        afterLabel="new.txt"
        onCopyDiff={onCopyDiff}
      />,
    );
    fireEvent.click(screen.getByLabelText('Copy unified diff'));
    const text = onCopyDiff.mock.calls[0]![0] as string;
    expect(text).toContain('--- old.txt');
    expect(text).toContain('+++ new.txt');
  });

  it('mode toggle has aria-checked + role=radio', () => {
    render(<TextDiff before="a" after="b" />);
    const inline = screen.getByRole('radio', { name: 'Inline' });
    const line = screen.getByRole('radio', { name: 'Line' });
    expect(inline).toHaveAttribute('aria-checked', 'true');
    expect(line).toHaveAttribute('aria-checked', 'false');
  });

  it('identical inputs report 0/0 in the toolbar', () => {
    render(<TextDiff before="hi" after="hi" />);
    expect(screen.getByText('+0')).toBeInTheDocument();
    expect(screen.getByText('-0')).toBeInTheDocument();
  });

  it('exposes a stable displayName', () => {
    expect(TextDiff.displayName).toBe('TextDiff');
  });

  it('forwards ref to the root region', () => {
    const ref = createRef<HTMLDivElement>();
    render(<TextDiff ref={ref} before="a" after="b" />);
    expect(ref.current?.getAttribute('role')).toBe('region');
  });

  it('data-section markers present on root + toolbar', () => {
    const { container } = render(
      <TextDiff before="a" after="b" />,
    );
    expect(
      container.querySelector('[data-section="text-diff"]'),
    ).toBeInTheDocument();
    expect(
      container.querySelector(
        '[data-section="text-diff-toolbar"]',
      ),
    ).toBeInTheDocument();
    expect(
      container.querySelector(
        '[data-section="text-diff-mode-toggle"]',
      ),
    ).toBeInTheDocument();
  });
});
