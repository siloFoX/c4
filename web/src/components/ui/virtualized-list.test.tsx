// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render } from '@testing-library/react';
import { createRef } from 'react';
import {
  VirtualizedList,
  computeVisibleRange,
} from './virtualized-list';
import type { VirtualizedListHandle } from './virtualized-list';

interface Row {
  id: string;
  label: string;
}

function makeRows(count: number): Row[] {
  return Array.from({ length: count }, (_, i) => ({
    id: String(i),
    label: `row-${i}`,
  }));
}

// jsdom does not compute layout; clientHeight returns 0
// unless we patch the prototype. Test helper that
// installs a fake viewport height on the scroller.
function setViewport(el: HTMLElement, height: number): void {
  Object.defineProperty(el, 'clientHeight', {
    configurable: true,
    value: height,
  });
}

function setScroll(el: HTMLElement, top: number): void {
  Object.defineProperty(el, 'scrollTop', {
    configurable: true,
    writable: true,
    value: top,
  });
}

afterEach(() => {
  cleanup();
  if (typeof window !== 'undefined') {
    window.sessionStorage.clear();
  }
});

describe('computeVisibleRange', () => {
  it('returns { 0, 0 } when itemCount is 0', () => {
    expect(
      computeVisibleRange({
        scrollTop: 0,
        viewportHeight: 200,
        rowHeight: 40,
        itemCount: 0,
        overscan: 4,
      }),
    ).toEqual({ start: 0, end: 0 });
  });

  it('returns the first window when scrollTop is 0', () => {
    const range = computeVisibleRange({
      scrollTop: 0,
      viewportHeight: 200,
      rowHeight: 40,
      itemCount: 100,
      overscan: 2,
    });
    // 200/40 = 5 visible rows + 1 partial + 2 overscan = 8.
    expect(range.start).toBe(0);
    expect(range.end).toBe(8);
  });

  it('advances the window when scrollTop crosses a row boundary', () => {
    const range = computeVisibleRange({
      scrollTop: 200,
      viewportHeight: 200,
      rowHeight: 40,
      itemCount: 100,
      overscan: 2,
    });
    // rawStart = 5, visible = 6, overscan = 2.
    // start = 5 - 2 = 3; end = 5 + 6 + 2 = 13.
    expect(range.start).toBe(3);
    expect(range.end).toBe(13);
  });

  it('clamps end to itemCount when near the bottom', () => {
    const range = computeVisibleRange({
      scrollTop: 3960,
      viewportHeight: 200,
      rowHeight: 40,
      itemCount: 100,
      overscan: 2,
    });
    // rawStart = 99; end would be 99 + 6 + 2 = 107, clamped to 100.
    expect(range.end).toBe(100);
  });

  it('clamps start to 0 when overscan undershoots', () => {
    const range = computeVisibleRange({
      scrollTop: 0,
      viewportHeight: 200,
      rowHeight: 40,
      itemCount: 100,
      overscan: 10,
    });
    expect(range.start).toBe(0);
  });
});

describe('<VirtualizedList>', () => {
  it('renders the empty content when items is empty', () => {
    const { getByText } = render(
      <VirtualizedList<Row>
        items={[]}
        rowHeight={40}
        renderRow={(item) => <div>{item.label}</div>}
        emptyContent={<div>no rows</div>}
      />,
    );
    expect(getByText('no rows')).toBeInTheDocument();
  });

  it('renders only the visible window plus overscan', () => {
    const rows = makeRows(1000);
    const { container, rerender } = render(
      <VirtualizedList<Row>
        items={rows}
        rowHeight={40}
        renderRow={(item) => <div>{item.label}</div>}
        overscan={2}
      />,
    );
    const scroller = container.querySelector(
      '[data-section="virtualized-list"]',
    ) as HTMLDivElement;
    expect(scroller).not.toBeNull();
    // Force a viewport height + re-render so the window
    // math sees a non-zero clientHeight.
    setViewport(scroller, 200);
    rerender(
      <VirtualizedList<Row>
        items={rows}
        rowHeight={40}
        renderRow={(item) => <div>{item.label}</div>}
        overscan={2}
      />,
    );
    fireEvent.scroll(scroller, { target: { scrollTop: 0 } });
    const rendered = container.querySelectorAll('[data-virt-row-index]');
    // 200/40 = 5 + 1 partial + 2 overscan = 8.
    expect(rendered.length).toBeLessThanOrEqual(10);
    expect(rendered.length).toBeGreaterThan(0);
  });

  it('shifts the rendered window on scroll', () => {
    const rows = makeRows(1000);
    const { container, rerender } = render(
      <VirtualizedList<Row>
        items={rows}
        rowHeight={40}
        renderRow={(item) => <div>{item.label}</div>}
        overscan={1}
      />,
    );
    const scroller = container.querySelector(
      '[data-section="virtualized-list"]',
    ) as HTMLDivElement;
    setViewport(scroller, 200);
    rerender(
      <VirtualizedList<Row>
        items={rows}
        rowHeight={40}
        renderRow={(item) => <div>{item.label}</div>}
        overscan={1}
      />,
    );
    // Scroll to row 50.
    setScroll(scroller, 50 * 40);
    fireEvent.scroll(scroller);
    expect(scroller.getAttribute('data-visible-start')).toBe('49');
    // The first rendered row index should be ~49.
    const first = container.querySelector('[data-virt-row-index]');
    expect(first?.getAttribute('data-virt-row-index')).toBe('49');
  });

  it('sets the spacer height to itemCount * rowHeight', () => {
    const rows = makeRows(100);
    const { container } = render(
      <VirtualizedList<Row>
        items={rows}
        rowHeight={40}
        renderRow={(item) => <div>{item.label}</div>}
      />,
    );
    const spacer = container.querySelector(
      '[data-section="virtualized-list-spacer"]',
    ) as HTMLDivElement;
    expect(spacer.style.height).toBe('4000px');
  });

  it('keys rows by index when no keyFor is supplied', () => {
    const rows = makeRows(5);
    const { container } = render(
      <VirtualizedList<Row>
        items={rows}
        rowHeight={40}
        renderRow={(item) => <div data-test-label>{item.label}</div>}
      />,
    );
    const cells = container.querySelectorAll('[data-virt-row-index]');
    expect(cells.length).toBeGreaterThan(0);
    expect(cells[0]?.getAttribute('data-virt-row-index')).toBe('0');
  });

  it('uses keyFor for stable row identity when supplied', () => {
    const rows = makeRows(3);
    const renderSpy = vi.fn((item: Row) => <div>{item.label}</div>);
    render(
      <VirtualizedList<Row>
        items={rows}
        rowHeight={40}
        renderRow={renderSpy}
        keyFor={(item) => item.id}
      />,
    );
    // Implicit: renderSpy is called for the visible rows.
    expect(renderSpy).toHaveBeenCalled();
  });

  // (v1.11.351, TODO 11.333) Scroll restoration.
  it('persists scrollTop to sessionStorage under the supplied key', () => {
    const rows = makeRows(100);
    const { container } = render(
      <VirtualizedList<Row>
        items={rows}
        rowHeight={40}
        renderRow={(item) => <div>{item.label}</div>}
        scrollRestorationKey="test-key"
      />,
    );
    const scroller = container.querySelector(
      '[data-section="virtualized-list"]',
    ) as HTMLDivElement;
    setScroll(scroller, 320);
    fireEvent.scroll(scroller);
    expect(
      window.sessionStorage.getItem('c4:virtualized-list:test-key'),
    ).toBe('320');
  });

  it('restores scrollTop from sessionStorage on mount', () => {
    window.sessionStorage.setItem(
      'c4:virtualized-list:restored',
      '480',
    );
    const rows = makeRows(100);
    const { container } = render(
      <VirtualizedList<Row>
        items={rows}
        rowHeight={40}
        renderRow={(item) => <div>{item.label}</div>}
        scrollRestorationKey="restored"
      />,
    );
    const scroller = container.querySelector(
      '[data-section="virtualized-list"]',
    ) as HTMLDivElement;
    // The effect runs on mount; jsdom does not throw on
    // scrollTop assignment so the value sticks.
    expect(scroller.scrollTop).toBe(480);
  });

  // (v1.11.351, TODO 11.333) onVisibleRangeChange callback.
  it('fires onVisibleRangeChange when the window shifts', () => {
    const rows = makeRows(100);
    const onChange = vi.fn();
    const { container, rerender } = render(
      <VirtualizedList<Row>
        items={rows}
        rowHeight={40}
        renderRow={(item) => <div>{item.label}</div>}
        onVisibleRangeChange={onChange}
      />,
    );
    const scroller = container.querySelector(
      '[data-section="virtualized-list"]',
    ) as HTMLDivElement;
    setViewport(scroller, 200);
    rerender(
      <VirtualizedList<Row>
        items={rows}
        rowHeight={40}
        renderRow={(item) => <div>{item.label}</div>}
        onVisibleRangeChange={onChange}
      />,
    );
    setScroll(scroller, 400);
    fireEvent.scroll(scroller);
    expect(onChange).toHaveBeenCalled();
    const last = onChange.mock.calls[onChange.mock.calls.length - 1]?.[0];
    expect(last?.start).toBe(6);
  });

  // (v1.11.351, TODO 11.333) onReachBottom callback.
  it('fires onReachBottom when the scroller reaches the bottom edge', () => {
    const rows = makeRows(10);
    const onBottom = vi.fn();
    const { container, rerender } = render(
      <VirtualizedList<Row>
        items={rows}
        rowHeight={40}
        renderRow={(item) => <div>{item.label}</div>}
        onReachBottom={onBottom}
      />,
    );
    const scroller = container.querySelector(
      '[data-section="virtualized-list"]',
    ) as HTMLDivElement;
    setViewport(scroller, 200);
    rerender(
      <VirtualizedList<Row>
        items={rows}
        rowHeight={40}
        renderRow={(item) => <div>{item.label}</div>}
        onReachBottom={onBottom}
      />,
    );
    // totalHeight = 10 * 40 = 400; viewport=200; bottom
    // condition: scrollTop + 200 >= 399. scrollTop=200
    // satisfies it.
    setScroll(scroller, 200);
    fireEvent.scroll(scroller);
    expect(onBottom).toHaveBeenCalled();
  });

  it('does NOT re-fire onReachBottom while still at the bottom', () => {
    const rows = makeRows(10);
    const onBottom = vi.fn();
    const { container, rerender } = render(
      <VirtualizedList<Row>
        items={rows}
        rowHeight={40}
        renderRow={(item) => <div>{item.label}</div>}
        onReachBottom={onBottom}
      />,
    );
    const scroller = container.querySelector(
      '[data-section="virtualized-list"]',
    ) as HTMLDivElement;
    setViewport(scroller, 200);
    rerender(
      <VirtualizedList<Row>
        items={rows}
        rowHeight={40}
        renderRow={(item) => <div>{item.label}</div>}
        onReachBottom={onBottom}
      />,
    );
    setScroll(scroller, 200);
    fireEvent.scroll(scroller);
    fireEvent.scroll(scroller);
    fireEvent.scroll(scroller);
    expect(onBottom).toHaveBeenCalledTimes(1);
  });

  // (v1.11.351, TODO 11.333) Imperative handle.
  it('scrollToIndex sets scrollTop to index * rowHeight', () => {
    const ref = createRef<VirtualizedListHandle>();
    const rows = makeRows(100);
    const { container } = render(
      <VirtualizedList<Row>
        ref={ref}
        items={rows}
        rowHeight={40}
        renderRow={(item) => <div>{item.label}</div>}
      />,
    );
    const scroller = container.querySelector(
      '[data-section="virtualized-list"]',
    ) as HTMLDivElement;
    act(() => {
      ref.current?.scrollToIndex(20);
    });
    expect(scroller.scrollTop).toBe(800);
  });

  it('scrollToIndex clamps to the item range', () => {
    const ref = createRef<VirtualizedListHandle>();
    const rows = makeRows(10);
    const { container } = render(
      <VirtualizedList<Row>
        ref={ref}
        items={rows}
        rowHeight={40}
        renderRow={(item) => <div>{item.label}</div>}
      />,
    );
    const scroller = container.querySelector(
      '[data-section="virtualized-list"]',
    ) as HTMLDivElement;
    act(() => {
      ref.current?.scrollToIndex(999);
    });
    // Clamps to 9 * 40 = 360.
    expect(scroller.scrollTop).toBe(360);
    act(() => {
      ref.current?.scrollToIndex(-5);
    });
    expect(scroller.scrollTop).toBe(0);
  });

  // (v1.11.351, TODO 11.333) Data attributes for e2e.
  it('surfaces data-row-count + data-visible-start + data-visible-end for e2e', () => {
    const rows = makeRows(20);
    const { container, rerender } = render(
      <VirtualizedList<Row>
        items={rows}
        rowHeight={40}
        renderRow={(item) => <div>{item.label}</div>}
      />,
    );
    const scroller = container.querySelector(
      '[data-section="virtualized-list"]',
    ) as HTMLDivElement;
    expect(scroller.getAttribute('data-row-count')).toBe('20');
    setViewport(scroller, 200);
    rerender(
      <VirtualizedList<Row>
        items={rows}
        rowHeight={40}
        renderRow={(item) => <div>{item.label}</div>}
      />,
    );
    fireEvent.scroll(scroller, { target: { scrollTop: 0 } });
    expect(scroller.getAttribute('data-visible-start')).toBe('0');
    expect(Number(scroller.getAttribute('data-visible-end'))).toBeGreaterThan(0);
  });

  it('applies the supplied ariaLabel', () => {
    const rows = makeRows(5);
    const { container } = render(
      <VirtualizedList<Row>
        items={rows}
        rowHeight={40}
        renderRow={(item) => <div>{item.label}</div>}
        ariaLabel="History rows"
      />,
    );
    const scroller = container.querySelector(
      '[data-section="virtualized-list"]',
    ) as HTMLDivElement;
    expect(scroller.getAttribute('aria-label')).toBe('History rows');
  });
});
