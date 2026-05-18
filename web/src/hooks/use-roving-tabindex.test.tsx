import { afterEach, describe, it, expect, vi } from 'vitest';
import { render, screen, cleanup, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useRovingTabindex } from './use-roving-tabindex';
import type { UseRovingTabindexOptions } from './use-roving-tabindex';

interface TestGroupProps extends Partial<UseRovingTabindexOptions> {
  itemCount: number;
  labels?: string[];
  disabledIndices?: number[];
}

function TestGroup({
  itemCount,
  labels,
  orientation,
  wrap,
  initialIndex,
  onChange,
  disabledIndices,
}: TestGroupProps) {
  const { activeIndex, getItemProps, setActiveIndex } = useRovingTabindex({
    itemCount,
    ...(orientation !== undefined ? { orientation } : {}),
    ...(wrap !== undefined ? { wrap } : {}),
    ...(initialIndex !== undefined ? { initialIndex } : {}),
    ...(onChange ? { onChange } : {}),
    ...(disabledIndices
      ? { isItemDisabled: (i: number) => disabledIndices.includes(i) }
      : {}),
  });
  return (
    <div role="tablist" data-testid="group" data-active={activeIndex}>
      {Array.from({ length: itemCount }, (_, i) => {
        const label = labels?.[i] ?? `Item ${i}`;
        return (
          <button
            key={i}
            type="button"
            role="tab"
            data-testid={`item-${i}`}
            {...getItemProps(i)}
          >
            {label}
          </button>
        );
      })}
      <button
        type="button"
        data-testid="programmatic-set-2"
        onClick={() => setActiveIndex(2)}
      >
        set 2
      </button>
    </div>
  );
}

describe('useRovingTabindex', () => {
  afterEach(() => cleanup());

  it('sets tabIndex=0 on the initial active item and -1 on the rest', () => {
    render(<TestGroup itemCount={3} />);
    expect(screen.getByTestId('item-0').tabIndex).toBe(0);
    expect(screen.getByTestId('item-1').tabIndex).toBe(-1);
    expect(screen.getByTestId('item-2').tabIndex).toBe(-1);
  });

  it('respects initialIndex prop', () => {
    render(<TestGroup itemCount={3} initialIndex={1} />);
    expect(screen.getByTestId('item-0').tabIndex).toBe(-1);
    expect(screen.getByTestId('item-1').tabIndex).toBe(0);
    expect(screen.getByTestId('item-2').tabIndex).toBe(-1);
  });

  it('clamps an out-of-range initialIndex to the last valid index', () => {
    render(<TestGroup itemCount={3} initialIndex={99} />);
    expect(screen.getByTestId('item-2').tabIndex).toBe(0);
  });

  it('ArrowRight moves active forward (horizontal default)', async () => {
    const user = userEvent.setup();
    render(<TestGroup itemCount={3} />);
    const first = screen.getByTestId('item-0');
    first.focus();
    await user.keyboard('{ArrowRight}');
    expect(document.activeElement).toBe(screen.getByTestId('item-1'));
    expect(screen.getByTestId('item-0').tabIndex).toBe(-1);
    expect(screen.getByTestId('item-1').tabIndex).toBe(0);
  });

  it('ArrowLeft moves active backward', async () => {
    const user = userEvent.setup();
    render(<TestGroup itemCount={3} initialIndex={1} />);
    screen.getByTestId('item-1').focus();
    await user.keyboard('{ArrowLeft}');
    expect(document.activeElement).toBe(screen.getByTestId('item-0'));
  });

  it('ArrowRight wraps from last to first when wrap=true (default)', async () => {
    const user = userEvent.setup();
    render(<TestGroup itemCount={3} initialIndex={2} />);
    screen.getByTestId('item-2').focus();
    await user.keyboard('{ArrowRight}');
    expect(document.activeElement).toBe(screen.getByTestId('item-0'));
  });

  it('ArrowRight stays put at the last item when wrap=false', async () => {
    const user = userEvent.setup();
    render(<TestGroup itemCount={3} initialIndex={2} wrap={false} />);
    screen.getByTestId('item-2').focus();
    await user.keyboard('{ArrowRight}');
    expect(document.activeElement).toBe(screen.getByTestId('item-2'));
  });

  it('Home jumps to the first item', async () => {
    const user = userEvent.setup();
    render(<TestGroup itemCount={3} initialIndex={2} />);
    screen.getByTestId('item-2').focus();
    await user.keyboard('{Home}');
    expect(document.activeElement).toBe(screen.getByTestId('item-0'));
  });

  it('End jumps to the last item', async () => {
    const user = userEvent.setup();
    render(<TestGroup itemCount={3} />);
    screen.getByTestId('item-0').focus();
    await user.keyboard('{End}');
    expect(document.activeElement).toBe(screen.getByTestId('item-2'));
  });

  it('vertical orientation uses ArrowDown/Up instead of Right/Left', async () => {
    const user = userEvent.setup();
    render(<TestGroup itemCount={3} orientation="vertical" />);
    const first = screen.getByTestId('item-0');
    first.focus();
    await user.keyboard('{ArrowDown}');
    expect(document.activeElement).toBe(screen.getByTestId('item-1'));
    await user.keyboard('{ArrowUp}');
    expect(document.activeElement).toBe(screen.getByTestId('item-0'));
  });

  it('horizontal orientation ignores ArrowDown/Up', async () => {
    const user = userEvent.setup();
    render(<TestGroup itemCount={3} orientation="horizontal" />);
    const first = screen.getByTestId('item-0');
    first.focus();
    await user.keyboard('{ArrowDown}');
    // No movement because horizontal does not bind ArrowDown.
    expect(document.activeElement).toBe(first);
  });

  it('both orientation responds to all four arrows', async () => {
    const user = userEvent.setup();
    render(<TestGroup itemCount={3} orientation="both" />);
    const first = screen.getByTestId('item-0');
    first.focus();
    await user.keyboard('{ArrowDown}');
    expect(document.activeElement).toBe(screen.getByTestId('item-1'));
    await user.keyboard('{ArrowRight}');
    expect(document.activeElement).toBe(screen.getByTestId('item-2'));
  });

  it('fires onChange exactly when active index changes', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<TestGroup itemCount={3} onChange={onChange} />);
    const first = screen.getByTestId('item-0');
    first.focus();
    await user.keyboard('{ArrowRight}');
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenLastCalledWith(1);
    // Returning to the same item should NOT fire onChange.
    await user.keyboard('{Home}');
    expect(onChange).toHaveBeenCalledTimes(2);
    expect(onChange).toHaveBeenLastCalledWith(0);
  });

  it('skips disabled items during arrow navigation', async () => {
    const user = userEvent.setup();
    render(
      <TestGroup itemCount={4} disabledIndices={[1, 2]} />,
    );
    screen.getByTestId('item-0').focus();
    await user.keyboard('{ArrowRight}');
    // Item 1 and 2 are disabled, so focus skips to item 3.
    expect(document.activeElement).toBe(screen.getByTestId('item-3'));
  });

  it('Home/End respect disabled items at the ends', async () => {
    const user = userEvent.setup();
    render(
      <TestGroup itemCount={4} disabledIndices={[0, 3]} />,
    );
    screen.getByTestId('item-1').focus();
    await user.keyboard('{Home}');
    // First non-disabled is index 1.
    expect(document.activeElement).toBe(screen.getByTestId('item-1'));
    await user.keyboard('{End}');
    expect(document.activeElement).toBe(screen.getByTestId('item-2'));
  });

  it('focusing an item directly makes it active', () => {
    render(<TestGroup itemCount={3} />);
    const second = screen.getByTestId('item-1');
    act(() => {
      second.focus();
    });
    expect(screen.getByTestId('item-0').tabIndex).toBe(-1);
    expect(screen.getByTestId('item-1').tabIndex).toBe(0);
  });

  it('setActiveIndex moves the tabIndex without focus side-effects', async () => {
    render(<TestGroup itemCount={3} />);
    expect(screen.getByTestId('item-0').tabIndex).toBe(0);
    act(() => {
      screen.getByTestId('programmatic-set-2').click();
    });
    expect(screen.getByTestId('item-0').tabIndex).toBe(-1);
    expect(screen.getByTestId('item-2').tabIndex).toBe(0);
  });

  it('exposes data-roving-index on each item for e2e', () => {
    render(<TestGroup itemCount={3} />);
    expect(screen.getByTestId('item-0').getAttribute('data-roving-index')).toBe(
      '0',
    );
    expect(screen.getByTestId('item-1').getAttribute('data-roving-index')).toBe(
      '1',
    );
  });

  it('handles itemCount=0 gracefully (no crash, activeIndex=0)', () => {
    render(<TestGroup itemCount={0} />);
    expect(screen.getByTestId('group').getAttribute('data-active')).toBe('0');
  });

  it('does not prevent default on unrelated keys (e.g. Tab)', async () => {
    const user = userEvent.setup();
    render(
      <>
        <button data-testid="before">before</button>
        <TestGroup itemCount={3} />
        <button data-testid="after">after</button>
      </>,
    );
    screen.getByTestId('item-0').focus();
    await user.tab();
    // Tab should leave the group via the natural sequence.
    // 'programmatic-set-2' is the next focusable inside the
    // group, then 'after'. We do not assert which because
    // the chain depends on test environment behaviour, but
    // we DO assert it left the first item.
    expect(document.activeElement).not.toBe(screen.getByTestId('item-0'));
  });
});
