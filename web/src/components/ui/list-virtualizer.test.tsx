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
  ListVirtualizer,
  computeItemOffsets,
  findStickyHeaderIndex,
  findVisibleRange,
} from './list-virtualizer';
import type {
  ListVirtualizerHandle,
  ListVirtualizerItem,
} from './list-virtualizer';

afterEach(() => {
  cleanup();
});

function makeItems(
  n: number,
  opts?: { withHeaders?: boolean },
): ListVirtualizerItem<{ label: string }>[] {
  const out: ListVirtualizerItem<{ label: string }>[] = [];
  for (let i = 0; i < n; i++) {
    if (opts?.withHeaders && i % 5 === 0) {
      out.push({
        id: `h${i}`,
        data: { label: `Header ${i}` },
        type: 'header',
      });
    } else {
      out.push({
        id: i,
        data: { label: `Item ${i}` },
      });
    }
  }
  return out;
}

describe('computeItemOffsets', () => {
  it('returns [0, total] for empty input', () => {
    expect(computeItemOffsets([], new Map(), 48)).toEqual([0]);
  });

  it('uses defaultHeight when no measurements exist', () => {
    const items = makeItems(3);
    const offsets = computeItemOffsets(items, new Map(), 50);
    expect(offsets).toEqual([0, 50, 100, 150]);
  });

  it('uses item.estimatedHeight when supplied', () => {
    const items: ListVirtualizerItem[] = [
      { id: 0, data: null, estimatedHeight: 30 },
      { id: 1, data: null, estimatedHeight: 80 },
    ];
    const offsets = computeItemOffsets(items, new Map(), 48);
    expect(offsets).toEqual([0, 30, 110]);
  });

  it('uses measured height when present', () => {
    const items = makeItems(3);
    const measured = new Map<number, number>([[1, 200]]);
    const offsets = computeItemOffsets(items, measured, 50);
    expect(offsets).toEqual([0, 50, 250, 300]);
  });

  it('ignores non-finite / non-positive measurements', () => {
    const items = makeItems(2);
    const measured = new Map<number, number>([
      [0, Number.NaN],
      [1, -10],
    ]);
    const offsets = computeItemOffsets(items, measured, 50);
    expect(offsets).toEqual([0, 50, 100]);
  });
});

describe('findVisibleRange', () => {
  it('returns {0,0} for empty offsets', () => {
    expect(findVisibleRange([0], 0, 100, 0)).toEqual({
      start: 0,
      end: 0,
    });
  });

  it('returns the visible window at the top', () => {
    const offsets = [0, 50, 100, 150, 200, 250];
    const range = findVisibleRange(offsets, 0, 100, 0);
    expect(range.start).toBe(0);
    expect(range.end).toBe(2);
  });

  it('shifts the window as scrollTop advances', () => {
    const offsets = [0, 50, 100, 150, 200, 250];
    const range = findVisibleRange(offsets, 75, 100, 0);
    expect(range.start).toBe(1);
    expect(range.end).toBeGreaterThanOrEqual(3);
  });

  it('applies overscan to both ends', () => {
    const offsets = [0, 50, 100, 150, 200, 250];
    const range = findVisibleRange(offsets, 100, 50, 1);
    expect(range.start).toBe(1);
    expect(range.end).toBeLessThanOrEqual(5);
  });

  it('clamps overscan at array bounds', () => {
    const offsets = [0, 50, 100];
    const range = findVisibleRange(offsets, 0, 50, 5);
    expect(range.start).toBe(0);
    expect(range.end).toBe(2);
  });

  it('handles scrollTop past the end', () => {
    const offsets = [0, 50, 100];
    const range = findVisibleRange(offsets, 500, 50, 0);
    expect(range.start).toBeGreaterThanOrEqual(0);
    expect(range.end).toBeLessThanOrEqual(2);
  });
});

describe('findStickyHeaderIndex', () => {
  it('returns null when no header is visible', () => {
    const items: ListVirtualizerItem[] = [
      { id: 0, data: null, type: 'row' },
    ];
    const offsets = [0, 50];
    expect(findStickyHeaderIndex(items, offsets, 0)).toBeNull();
  });

  it('returns the only header above scrollTop', () => {
    const items: ListVirtualizerItem[] = [
      { id: 0, data: null, type: 'header' },
      { id: 1, data: null, type: 'row' },
    ];
    const offsets = [0, 50, 100];
    expect(findStickyHeaderIndex(items, offsets, 25)).toBe(0);
  });

  it('returns the LAST header at or above scrollTop', () => {
    const items: ListVirtualizerItem[] = [
      { id: 0, data: null, type: 'header' },
      { id: 1, data: null, type: 'row' },
      { id: 2, data: null, type: 'header' },
      { id: 3, data: null, type: 'row' },
    ];
    const offsets = [0, 50, 100, 150, 200];
    expect(findStickyHeaderIndex(items, offsets, 150)).toBe(2);
  });

  it('returns null when scrollTop is before the first header', () => {
    const items: ListVirtualizerItem[] = [
      { id: 0, data: null, type: 'row' },
      { id: 1, data: null, type: 'header' },
    ];
    const offsets = [0, 50, 100];
    expect(findStickyHeaderIndex(items, offsets, 25)).toBeNull();
  });
});

describe('ListVirtualizer component', () => {
  beforeEach();
  function beforeEach() {
    // Make sure JSDOM gives us a measurable viewport height.
    Object.defineProperty(HTMLElement.prototype, 'clientHeight', {
      configurable: true,
      get() {
        return 400;
      },
    });
  }

  it('renders region with default aria-label', () => {
    render(
      <ListVirtualizer
        items={makeItems(5)}
        renderItem={(item) => (
          <div>{(item.data as { label: string }).label}</div>
        )}
      />,
    );
    expect(screen.getByRole('region')).toHaveAttribute(
      'aria-label',
      'List',
    );
  });

  it('honors a custom ariaLabel', () => {
    render(
      <ListVirtualizer
        items={makeItems(5)}
        ariaLabel="Inbox"
        renderItem={(item) => (
          <div>{(item.data as { label: string }).label}</div>
        )}
      />,
    );
    expect(screen.getByRole('region')).toHaveAttribute(
      'aria-label',
      'Inbox',
    );
  });

  it('exposes data-item-count and data-active-index on root', () => {
    render(
      <ListVirtualizer
        items={makeItems(7)}
        defaultActiveIndex={3}
        renderItem={(item) => (
          <div>{(item.data as { label: string }).label}</div>
        )}
      />,
    );
    const region = screen.getByRole('region');
    expect(region).toHaveAttribute('data-item-count', '7');
    expect(region).toHaveAttribute('data-active-index', '3');
  });

  it('renders some items (first few are inside the visible window)', () => {
    render(
      <ListVirtualizer
        items={makeItems(50)}
        renderItem={(item) => (
          <div data-testid={`row-${item.id}`}>
            {(item.data as { label: string }).label}
          </div>
        )}
        height={300}
        estimatedRowHeight={50}
      />,
    );
    // Items 0..n should render at the top
    expect(screen.getByTestId('row-0')).toBeInTheDocument();
  });

  it('does NOT render every row for a large list (windowing)', () => {
    const renderSpy = vi.fn((item: ListVirtualizerItem) => (
      <div data-testid={`row-${item.id}`}>{String(item.id)}</div>
    ));
    render(
      <ListVirtualizer
        items={makeItems(500)}
        renderItem={renderSpy}
        height={300}
        estimatedRowHeight={50}
      />,
    );
    // 500 items would call renderItem 500 times if not windowed.
    expect(renderSpy.mock.calls.length).toBeLessThan(50);
  });

  it('renders the spacer at total height', () => {
    const { container } = render(
      <ListVirtualizer
        items={makeItems(10)}
        renderItem={(item) => (
          <div>{(item.data as { label: string }).label}</div>
        )}
        estimatedRowHeight={40}
      />,
    );
    const spacer = container.querySelector(
      '[data-section="list-virtualizer-spacer"]',
    ) as HTMLElement;
    // 10 items * 40px = 400px
    expect(spacer.style.height).toBe('400px');
  });

  it('ArrowDown advances activeIndex', () => {
    const onActive = vi.fn();
    render(
      <ListVirtualizer
        items={makeItems(10)}
        defaultActiveIndex={0}
        onActiveIndexChange={onActive}
        renderItem={(item) => (
          <div>{(item.data as { label: string }).label}</div>
        )}
      />,
    );
    fireEvent.keyDown(screen.getByRole('region'), {
      key: 'ArrowDown',
    });
    expect(onActive).toHaveBeenCalledWith(1);
  });

  it('ArrowUp decrements activeIndex (clamped at 0)', () => {
    const onActive = vi.fn();
    render(
      <ListVirtualizer
        items={makeItems(10)}
        defaultActiveIndex={3}
        onActiveIndexChange={onActive}
        renderItem={(item) => (
          <div>{(item.data as { label: string }).label}</div>
        )}
      />,
    );
    fireEvent.keyDown(screen.getByRole('region'), { key: 'ArrowUp' });
    expect(onActive).toHaveBeenCalledWith(2);
  });

  it('Home jumps to 0', () => {
    const onActive = vi.fn();
    render(
      <ListVirtualizer
        items={makeItems(10)}
        defaultActiveIndex={7}
        onActiveIndexChange={onActive}
        renderItem={(item) => (
          <div>{(item.data as { label: string }).label}</div>
        )}
      />,
    );
    fireEvent.keyDown(screen.getByRole('region'), { key: 'Home' });
    expect(onActive).toHaveBeenCalledWith(0);
  });

  it('End jumps to last index', () => {
    const onActive = vi.fn();
    render(
      <ListVirtualizer
        items={makeItems(10)}
        defaultActiveIndex={0}
        onActiveIndexChange={onActive}
        renderItem={(item) => (
          <div>{(item.data as { label: string }).label}</div>
        )}
      />,
    );
    fireEvent.keyDown(screen.getByRole('region'), { key: 'End' });
    expect(onActive).toHaveBeenCalledWith(9);
  });

  it('PageDown advances by a viewport of items', () => {
    const onActive = vi.fn();
    render(
      <ListVirtualizer
        items={makeItems(100)}
        defaultActiveIndex={0}
        onActiveIndexChange={onActive}
        height={400}
        estimatedRowHeight={50}
        renderItem={(item) => (
          <div>{(item.data as { label: string }).label}</div>
        )}
      />,
    );
    fireEvent.keyDown(screen.getByRole('region'), {
      key: 'PageDown',
    });
    const arg = onActive.mock.calls[0]?.[0] as number;
    expect(arg).toBeGreaterThanOrEqual(1);
  });

  it('PageUp moves backwards by a viewport of items', () => {
    const onActive = vi.fn();
    render(
      <ListVirtualizer
        items={makeItems(100)}
        defaultActiveIndex={50}
        onActiveIndexChange={onActive}
        height={400}
        estimatedRowHeight={50}
        renderItem={(item) => (
          <div>{(item.data as { label: string }).label}</div>
        )}
      />,
    );
    fireEvent.keyDown(screen.getByRole('region'), {
      key: 'PageUp',
    });
    const arg = onActive.mock.calls[0]?.[0] as number;
    expect(arg).toBeLessThan(50);
  });

  it('keyboard nav disabled when enableKeyboardNav=false', () => {
    const onActive = vi.fn();
    render(
      <ListVirtualizer
        items={makeItems(10)}
        defaultActiveIndex={0}
        enableKeyboardNav={false}
        onActiveIndexChange={onActive}
        renderItem={(item) => (
          <div>{(item.data as { label: string }).label}</div>
        )}
      />,
    );
    fireEvent.keyDown(screen.getByRole('region'), {
      key: 'ArrowDown',
    });
    expect(onActive).not.toHaveBeenCalled();
  });

  it('controlled activeIndex overrides internal state', () => {
    const { rerender } = render(
      <ListVirtualizer
        items={makeItems(10)}
        activeIndex={2}
        renderItem={(item) => (
          <div>{(item.data as { label: string }).label}</div>
        )}
      />,
    );
    expect(screen.getByRole('region')).toHaveAttribute(
      'data-active-index',
      '2',
    );
    rerender(
      <ListVirtualizer
        items={makeItems(10)}
        activeIndex={5}
        renderItem={(item) => (
          <div>{(item.data as { label: string }).label}</div>
        )}
      />,
    );
    expect(screen.getByRole('region')).toHaveAttribute(
      'data-active-index',
      '5',
    );
  });

  it('marks the active row with data-active="true"', () => {
    const { container } = render(
      <ListVirtualizer
        items={makeItems(10)}
        defaultActiveIndex={1}
        renderItem={(item) => (
          <div>{(item.data as { label: string }).label}</div>
        )}
      />,
    );
    const activeRows = container.querySelectorAll(
      '[data-section="list-virtualizer-item"][data-active="true"]',
    );
    expect(activeRows.length).toBeGreaterThan(0);
  });

  it('each rendered row has data-item-id + data-item-index', () => {
    const { container } = render(
      <ListVirtualizer
        items={makeItems(5)}
        renderItem={(item) => (
          <div>{(item.data as { label: string }).label}</div>
        )}
      />,
    );
    const rows = container.querySelectorAll(
      '[data-section="list-virtualizer-item"]',
    );
    expect(rows.length).toBeGreaterThan(0);
    expect(rows[0]).toHaveAttribute('data-item-id');
    expect(rows[0]).toHaveAttribute('data-item-index');
  });

  it('headers render with data-item-type="header"', () => {
    const { container } = render(
      <ListVirtualizer
        items={makeItems(10, { withHeaders: true })}
        renderItem={(item) => (
          <div>{(item.data as { label: string }).label}</div>
        )}
      />,
    );
    const headers = container.querySelectorAll(
      '[data-section="list-virtualizer-item"][data-item-type="header"]',
    );
    expect(headers.length).toBeGreaterThan(0);
  });

  it('sticky header renders separately when stickyHeaders=true', () => {
    const { container } = render(
      <ListVirtualizer
        items={makeItems(20, { withHeaders: true })}
        stickyHeaders={true}
        renderItem={(item) => (
          <div>{(item.data as { label: string }).label}</div>
        )}
      />,
    );
    // At scrollTop=0 the first header is sticky.
    const sticky = container.querySelector(
      '[data-section="list-virtualizer-sticky"]',
    );
    expect(sticky).toBeInTheDocument();
  });

  it('stickyHeaders=false omits the sticky block', () => {
    const { container } = render(
      <ListVirtualizer
        items={makeItems(20, { withHeaders: true })}
        stickyHeaders={false}
        renderItem={(item) => (
          <div>{(item.data as { label: string }).label}</div>
        )}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="list-virtualizer-sticky"]',
      ),
    ).toBeNull();
  });

  it('data-sticky-headers root attribute mirrors prop', () => {
    const { rerender } = render(
      <ListVirtualizer
        items={makeItems(5)}
        renderItem={(item) => (
          <div>{(item.data as { label: string }).label}</div>
        )}
      />,
    );
    expect(screen.getByRole('region')).toHaveAttribute(
      'data-sticky-headers',
      'false',
    );
    rerender(
      <ListVirtualizer
        items={makeItems(5)}
        stickyHeaders
        renderItem={(item) => (
          <div>{(item.data as { label: string }).label}</div>
        )}
      />,
    );
    expect(screen.getByRole('region')).toHaveAttribute(
      'data-sticky-headers',
      'true',
    );
  });

  it('imperative scrollToIndex calls scrollTo on the container', () => {
    const ref = createRef<ListVirtualizerHandle>();
    render(
      <ListVirtualizer
        ref={ref}
        items={makeItems(50)}
        estimatedRowHeight={40}
        renderItem={(item) => (
          <div>{(item.data as { label: string }).label}</div>
        )}
      />,
    );
    const region = screen.getByRole('region');
    const scrollTo = vi.fn();
    (region as HTMLElement).scrollTo = scrollTo as unknown as typeof region.scrollTo;
    ref.current?.scrollToIndex(10, 'smooth');
    expect(scrollTo).toHaveBeenCalledWith({
      top: 400,
      behavior: 'smooth',
    });
  });

  it('imperative scrollToTop targets scrollTop=0', () => {
    const ref = createRef<ListVirtualizerHandle>();
    render(
      <ListVirtualizer
        ref={ref}
        items={makeItems(20)}
        renderItem={(item) => (
          <div>{(item.data as { label: string }).label}</div>
        )}
      />,
    );
    const region = screen.getByRole('region');
    const scrollTo = vi.fn();
    (region as HTMLElement).scrollTo = scrollTo as unknown as typeof region.scrollTo;
    ref.current?.scrollToTop('auto');
    expect(scrollTo).toHaveBeenCalledWith({
      top: 0,
      behavior: 'auto',
    });
  });

  it('imperative getScrollTop returns current scrollTop', () => {
    const ref = createRef<ListVirtualizerHandle>();
    render(
      <ListVirtualizer
        ref={ref}
        items={makeItems(20)}
        renderItem={(item) => (
          <div>{(item.data as { label: string }).label}</div>
        )}
      />,
    );
    const region = screen.getByRole('region') as HTMLElement;
    Object.defineProperty(region, 'scrollTop', {
      configurable: true,
      get() {
        return 123;
      },
    });
    expect(ref.current?.getScrollTop()).toBe(123);
  });

  it('onEndReached fires when scrolled near the bottom', () => {
    const onEndReached = vi.fn();
    render(
      <ListVirtualizer
        items={makeItems(50)}
        estimatedRowHeight={40}
        height={400}
        endReachedThreshold={50}
        onEndReached={onEndReached}
        renderItem={(item) => (
          <div>{(item.data as { label: string }).label}</div>
        )}
      />,
    );
    const region = screen.getByRole('region') as HTMLElement;
    Object.defineProperty(region, 'scrollHeight', {
      configurable: true,
      get() {
        return 2000;
      },
    });
    Object.defineProperty(region, 'clientHeight', {
      configurable: true,
      get() {
        return 400;
      },
    });
    Object.defineProperty(region, 'scrollTop', {
      configurable: true,
      get() {
        return 1580; // distance from bottom = 2000 - 1580 - 400 = 20
      },
    });
    fireEvent.scroll(region);
    expect(onEndReached).toHaveBeenCalled();
  });

  it('exposes a stable displayName', () => {
    expect(
      (ListVirtualizer as unknown as { displayName: string }).displayName,
    ).toBe('ListVirtualizer');
  });

  it('forwards ref imperative handle (ref.current is not null)', () => {
    const ref = createRef<ListVirtualizerHandle>();
    render(
      <ListVirtualizer
        ref={ref}
        items={makeItems(5)}
        renderItem={(item) => (
          <div>{(item.data as { label: string }).label}</div>
        )}
      />,
    );
    expect(ref.current).not.toBeNull();
    expect(typeof ref.current?.scrollToIndex).toBe('function');
    expect(typeof ref.current?.scrollToTop).toBe('function');
    expect(typeof ref.current?.getScrollTop).toBe('function');
  });

  it('renders nothing in body when items is empty', () => {
    const { container } = render(
      <ListVirtualizer
        items={[]}
        renderItem={() => null}
      />,
    );
    const rows = container.querySelectorAll(
      '[data-section="list-virtualizer-item"]',
    );
    expect(rows).toHaveLength(0);
  });
});
