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
  DiffEditor,
  applyHunkDecisions,
  nextHunkIndex,
  prevHunkIndex,
} from './diff-editor';
import type { HunkDecision } from './diff-editor';

afterEach(() => {
  cleanup();
});

describe('applyHunkDecisions', () => {
  it('returns after unchanged when no decisions are set', () => {
    expect(applyHunkDecisions('a\nb', 'A\nb', new Map())).toBe('A\nb');
  });

  it('rejecting a hunk restores the before-side lines', () => {
    const decisions: Map<number, HunkDecision> = new Map([[0, 'reject']]);
    expect(applyHunkDecisions('a\nb', 'A\nb', decisions)).toBe('a\nb');
  });

  it('accepting an already-accepted hunk is a no-op', () => {
    const decisions: Map<number, HunkDecision> = new Map([[0, 'accept']]);
    expect(applyHunkDecisions('a\nb', 'A\nb', decisions)).toBe('A\nb');
  });

  it('rejects one of multiple hunks independently', () => {
    const before = 'a\nb\nc\nd\ne';
    const after = 'A\nb\nc\nd\nE';
    // Hunk 0 = a->A, Hunk 1 = e->E
    const decisions: Map<number, HunkDecision> = new Map([[0, 'reject']]);
    expect(applyHunkDecisions(before, after, decisions)).toBe(
      'a\nb\nc\nd\nE',
    );
  });

  it('rejecting all hunks reproduces the before string', () => {
    const before = 'a\nb\nc';
    const after = 'A\nB\nC';
    // One contiguous change block (3 removes + 3 adds)
    const decisions: Map<number, HunkDecision> = new Map([[0, 'reject']]);
    expect(applyHunkDecisions(before, after, decisions)).toBe('a\nb\nc');
  });

  it('handles pure additions (empty before)', () => {
    const decisions: Map<number, HunkDecision> = new Map([[0, 'reject']]);
    // empty before -> rejecting all adds -> empty string
    expect(applyHunkDecisions('', 'a\nb', decisions)).toBe('');
  });

  it('handles pure deletions (empty after)', () => {
    // before='a\nb', after='' -> rejecting -> 'a\nb' restored
    const decisions: Map<number, HunkDecision> = new Map([[0, 'reject']]);
    expect(applyHunkDecisions('a\nb', '', decisions)).toBe('a\nb');
  });

  it('returns after when there are no change blocks', () => {
    expect(
      applyHunkDecisions('a\nb', 'a\nb', new Map()),
    ).toBe('a\nb');
  });
});

describe('nextHunkIndex / prevHunkIndex', () => {
  it('next wraps to 0 when at the last hunk', () => {
    expect(nextHunkIndex(2, 3)).toBe(0);
  });

  it('next advances', () => {
    expect(nextHunkIndex(0, 3)).toBe(1);
  });

  it('prev wraps to last from 0', () => {
    expect(prevHunkIndex(0, 3)).toBe(2);
  });

  it('prev decrements', () => {
    expect(prevHunkIndex(2, 3)).toBe(1);
  });

  it('total<=0 returns 0', () => {
    expect(nextHunkIndex(5, 0)).toBe(0);
    expect(prevHunkIndex(5, 0)).toBe(0);
  });
});

describe('DiffEditor component', () => {
  const before = 'a\nb\nc\nd\ne\nf\ng';
  const after = 'a\nB\nc\nd\ne\nF\ng';

  it('renders region with default aria-label', () => {
    render(<DiffEditor before="" after="" />);
    expect(screen.getByRole('region')).toHaveAttribute(
      'aria-label',
      'Diff editor',
    );
  });

  it('honors a custom ariaLabel', () => {
    render(
      <DiffEditor before="" after="" ariaLabel="Patch review" />,
    );
    expect(screen.getByRole('region')).toHaveAttribute(
      'aria-label',
      'Patch review',
    );
  });

  it('exposes data attributes (language, change-count, edit-mode)', () => {
    render(
      <DiffEditor
        before={before}
        after={after}
        language="ts"
      />,
    );
    const region = screen.getByRole('region');
    expect(region).toHaveAttribute('data-language', 'ts');
    expect(region).toHaveAttribute('data-change-count', '2');
    expect(region).toHaveAttribute('data-edit-mode', 'false');
    expect(region).toHaveAttribute('data-read-only', 'false');
  });

  it('renders the summary "+N -M"', () => {
    render(<DiffEditor before={before} after={after} />);
    const summary = screen.getByText(/\+.* -.*/);
    expect(summary.textContent).toContain('+');
    expect(summary.textContent).toContain('-');
  });

  it('disables Prev / Next when there are no changes', () => {
    render(<DiffEditor before="a" after="a" />);
    expect(
      screen.getByRole('button', { name: 'Previous hunk' }),
    ).toBeDisabled();
    expect(
      screen.getByRole('button', { name: 'Next hunk' }),
    ).toBeDisabled();
  });

  it('Next advances activeHunkIndex (uncontrolled)', () => {
    const onActiveHunkIndexChange = vi.fn();
    render(
      <DiffEditor
        before={before}
        after={after}
        onActiveHunkIndexChange={onActiveHunkIndexChange}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Next hunk' }));
    expect(onActiveHunkIndexChange).toHaveBeenCalledWith(1);
  });

  it('Prev wraps to the last hunk from the first', () => {
    const onActiveHunkIndexChange = vi.fn();
    render(
      <DiffEditor
        before={before}
        after={after}
        onActiveHunkIndexChange={onActiveHunkIndexChange}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Previous hunk' }));
    expect(onActiveHunkIndexChange).toHaveBeenCalledWith(1);
  });

  it('controlled activeHunkIndex overrides internal state', () => {
    const { rerender } = render(
      <DiffEditor
        before={before}
        after={after}
        activeHunkIndex={0}
      />,
    );
    expect(screen.getByRole('region')).toHaveAttribute(
      'data-active-hunk-index',
      '0',
    );
    rerender(
      <DiffEditor
        before={before}
        after={after}
        activeHunkIndex={1}
      />,
    );
    expect(screen.getByRole('region')).toHaveAttribute(
      'data-active-hunk-index',
      '1',
    );
  });

  it('shows counter "1 / 2"', () => {
    render(<DiffEditor before={before} after={after} />);
    expect(screen.getByText('1 / 2')).toBeInTheDocument();
  });

  it('shows counter "0 / 0" when no changes', () => {
    render(<DiffEditor before="a" after="a" />);
    expect(screen.getByText('0 / 0')).toBeInTheDocument();
  });

  it('renders Edit button by default (not readOnly)', () => {
    render(<DiffEditor before="a" after="b" />);
    expect(
      screen.getByRole('button', { name: 'Edit' }),
    ).toBeInTheDocument();
  });

  it('omits the Edit button when readOnly=true', () => {
    render(<DiffEditor before="a" after="b" readOnly />);
    expect(
      screen.queryByRole('button', { name: 'Edit' }),
    ).toBeNull();
  });

  it('clicking Edit flips into textarea mode', () => {
    render(<DiffEditor before="a" after="b" />);
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    expect(
      screen.getByRole('textbox', { name: 'After content' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('region')).toHaveAttribute(
      'data-edit-mode',
      'true',
    );
  });

  it('textarea value matches after prop', () => {
    render(
      <DiffEditor before="x" after="hello" defaultEditMode />,
    );
    const textarea = screen.getByRole('textbox', {
      name: 'After content',
    }) as HTMLTextAreaElement;
    expect(textarea.value).toBe('hello');
  });

  it('typing in the textarea fires onAfterChange', () => {
    const onAfterChange = vi.fn();
    render(
      <DiffEditor
        before="x"
        after="hello"
        defaultEditMode
        onAfterChange={onAfterChange}
      />,
    );
    fireEvent.change(
      screen.getByRole('textbox', { name: 'After content' }),
      { target: { value: 'world' } },
    );
    expect(onAfterChange).toHaveBeenCalledWith('world');
  });

  it('Done flips back out of edit mode', () => {
    render(
      <DiffEditor before="a" after="b" defaultEditMode />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    expect(
      screen.queryByRole('textbox', { name: 'After content' }),
    ).toBeNull();
  });

  it('renders Accept / Reject buttons on the last line of each hunk', () => {
    const { container } = render(
      <DiffEditor before={before} after={after} />,
    );
    const accepts = container.querySelectorAll(
      '[data-section="diff-editor-accept"]',
    );
    const rejects = container.querySelectorAll(
      '[data-section="diff-editor-reject"]',
    );
    expect(accepts).toHaveLength(2);
    expect(rejects).toHaveLength(2);
  });

  it('Accept button fires onAcceptHunk with the range', () => {
    const onAcceptHunk = vi.fn();
    const { container } = render(
      <DiffEditor
        before={before}
        after={after}
        onAcceptHunk={onAcceptHunk}
      />,
    );
    const accept = container.querySelector(
      '[data-section="diff-editor-accept"][data-block-index="0"]',
    ) as HTMLButtonElement;
    fireEvent.click(accept);
    expect(onAcceptHunk).toHaveBeenCalledTimes(1);
    const call = onAcceptHunk.mock.calls[0]?.[0];
    expect(call?.hunkIndex).toBe(0);
    expect(typeof call?.startIndex).toBe('number');
    expect(typeof call?.endIndex).toBe('number');
  });

  it('Reject button fires onRejectHunk', () => {
    const onRejectHunk = vi.fn();
    const { container } = render(
      <DiffEditor
        before={before}
        after={after}
        onRejectHunk={onRejectHunk}
      />,
    );
    const reject = container.querySelector(
      '[data-section="diff-editor-reject"][data-block-index="0"]',
    ) as HTMLButtonElement;
    fireEvent.click(reject);
    expect(onRejectHunk).toHaveBeenCalledTimes(1);
  });

  it('decisions update flips data-decision on the affected rows', () => {
    const { container } = render(
      <DiffEditor before={before} after={after} />,
    );
    const reject0 = container.querySelector(
      '[data-section="diff-editor-reject"][data-block-index="0"]',
    ) as HTMLButtonElement;
    fireEvent.click(reject0);
    const rejectedRows = container.querySelectorAll(
      '[data-section="diff-editor-row"][data-decision="reject"]',
    );
    expect(rejectedRows.length).toBeGreaterThan(0);
  });

  it('onDecisionsChange fires with the new map', () => {
    const onDecisionsChange = vi.fn();
    const { container } = render(
      <DiffEditor
        before={before}
        after={after}
        onDecisionsChange={onDecisionsChange}
      />,
    );
    const accept0 = container.querySelector(
      '[data-section="diff-editor-accept"][data-block-index="0"]',
    ) as HTMLButtonElement;
    fireEvent.click(accept0);
    const map = onDecisionsChange.mock.calls[0]?.[0] as Map<number, HunkDecision>;
    expect(map.get(0)).toBe('accept');
  });

  it('controlled decisions prop overrides internal state', () => {
    const decisions = new Map<number, HunkDecision>([[0, 'reject']]);
    const { container } = render(
      <DiffEditor
        before={before}
        after={after}
        decisions={decisions}
      />,
    );
    const rejectedRows = container.querySelectorAll(
      '[data-section="diff-editor-row"][data-decision="reject"]',
    );
    expect(rejectedRows.length).toBeGreaterThan(0);
  });

  it('readOnly hides Accept / Reject buttons', () => {
    const { container } = render(
      <DiffEditor before={before} after={after} readOnly />,
    );
    expect(
      container.querySelector(
        '[data-section="diff-editor-accept"]',
      ),
    ).toBeNull();
    expect(
      container.querySelector(
        '[data-section="diff-editor-reject"]',
      ),
    ).toBeNull();
  });

  it('renders line numbers by default', () => {
    const { container } = render(
      <DiffEditor before={before} after={after} />,
    );
    expect(
      container.querySelector(
        '[data-section="diff-editor-line-number"]',
      ),
    ).toBeInTheDocument();
  });

  it('omits line numbers when showLineNumbers=false', () => {
    const { container } = render(
      <DiffEditor
        before={before}
        after={after}
        showLineNumbers={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="diff-editor-line-number"]',
      ),
    ).toBeNull();
  });

  it('renderText override applies the highlighter', () => {
    render(
      <DiffEditor
        before={before}
        after={after}
        renderText={(text) => (
          <span data-testid="rendered">{text}</span>
        )}
      />,
    );
    expect(
      screen.getAllByTestId('rendered').length,
    ).toBeGreaterThan(0);
  });

  it('attaches data-line-type per row', () => {
    const { container } = render(
      <DiffEditor before={before} after={after} />,
    );
    const types = Array.from(
      container.querySelectorAll(
        '[data-section="diff-editor-row"]',
      ),
    )
      .map((r) => r.getAttribute('data-line-type'))
      .filter(Boolean);
    expect(types).toContain('add');
    expect(types).toContain('remove');
  });

  it('highlights the active hunk with data-active="true"', () => {
    const { container } = render(
      <DiffEditor
        before={before}
        after={after}
        activeHunkIndex={0}
      />,
    );
    const activeRows = container.querySelectorAll(
      '[data-section="diff-editor-row"][data-active="true"]',
    );
    expect(activeRows.length).toBeGreaterThan(0);
  });

  it('Alt+ArrowDown advances activeHunkIndex', () => {
    const onActiveHunkIndexChange = vi.fn();
    render(
      <DiffEditor
        before={before}
        after={after}
        onActiveHunkIndexChange={onActiveHunkIndexChange}
      />,
    );
    fireEvent.keyDown(screen.getByRole('region'), {
      key: 'ArrowDown',
      altKey: true,
    });
    expect(onActiveHunkIndexChange).toHaveBeenCalledWith(1);
  });

  it('n key advances activeHunkIndex', () => {
    const onActiveHunkIndexChange = vi.fn();
    render(
      <DiffEditor
        before={before}
        after={after}
        onActiveHunkIndexChange={onActiveHunkIndexChange}
      />,
    );
    fireEvent.keyDown(screen.getByRole('region'), { key: 'n' });
    expect(onActiveHunkIndexChange).toHaveBeenCalledWith(1);
  });

  it('p key decrements activeHunkIndex', () => {
    const onActiveHunkIndexChange = vi.fn();
    render(
      <DiffEditor
        before={before}
        after={after}
        onActiveHunkIndexChange={onActiveHunkIndexChange}
      />,
    );
    fireEvent.keyDown(screen.getByRole('region'), { key: 'p' });
    expect(onActiveHunkIndexChange).toHaveBeenCalledWith(1);
  });

  it('renders a fold row for long unchanged regions', () => {
    const long = Array.from({ length: 20 }, (_, i) => `line${i}`).join('\n');
    const { container } = render(
      <DiffEditor
        before={`a\n${long}\nz`}
        after={`A\n${long}\nZ`}
        contextLines={2}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="diff-editor-fold"]',
      ),
    ).toBeInTheDocument();
  });

  it('expands a fold when clicked', () => {
    const long = Array.from({ length: 20 }, (_, i) => `line${i}`).join('\n');
    const { container } = render(
      <DiffEditor
        before={`a\n${long}\nz`}
        after={`A\n${long}\nZ`}
        contextLines={2}
      />,
    );
    const foldButton = container.querySelector(
      '[data-section="diff-editor-fold-button"]',
    ) as HTMLButtonElement;
    fireEvent.click(foldButton);
    expect(
      container.querySelector(
        '[data-section="diff-editor-fold"]',
      ),
    ).toBeNull();
  });

  it('exposes a stable displayName', () => {
    expect(DiffEditor.displayName).toBe('DiffEditor');
  });

  it('forwards refs to the region root', () => {
    const ref = createRef<HTMLDivElement>();
    render(
      <DiffEditor ref={ref} before="a" after="b" />,
    );
    expect(ref.current?.getAttribute('role')).toBe('region');
  });

  it('uses custom acceptLabel + rejectLabel', () => {
    const { container } = render(
      <DiffEditor
        before={before}
        after={after}
        acceptLabel="Keep"
        rejectLabel="Drop"
      />,
    );
    const accept = container.querySelector(
      '[data-section="diff-editor-accept"]',
    );
    const reject = container.querySelector(
      '[data-section="diff-editor-reject"]',
    );
    expect(accept?.textContent).toContain('Keep');
    expect(reject?.textContent).toContain('Drop');
  });
});
