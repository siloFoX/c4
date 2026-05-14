import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createRef } from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { VirtualList } from './virtual-list';

// jsdom does not lay out content, so clientHeight always reports 0
// unless we patch it. Mock clientHeight on the prototype for the
// duration of these tests so the windowing math has something to
// chew on; itemHeight is the only fixed dimension we rely on.

const ITEM_HEIGHT = 40;
const CLIENT_HEIGHT = 200;

let clientHeightDescriptor: PropertyDescriptor | undefined;
let scrollTopDescriptor: PropertyDescriptor | undefined;

beforeEach(() => {
  clientHeightDescriptor = Object.getOwnPropertyDescriptor(
    HTMLElement.prototype,
    'clientHeight',
  );
  scrollTopDescriptor = Object.getOwnPropertyDescriptor(
    HTMLElement.prototype,
    'scrollTop',
  );
  Object.defineProperty(HTMLElement.prototype, 'clientHeight', {
    configurable: true,
    get(this: HTMLElement) {
      const v = (this as unknown as { __ch?: number }).__ch;
      return typeof v === 'number' ? v : CLIENT_HEIGHT;
    },
  });
  Object.defineProperty(HTMLElement.prototype, 'scrollTop', {
    configurable: true,
    get(this: HTMLElement) {
      const v = (this as unknown as { __st?: number }).__st;
      return typeof v === 'number' ? v : 0;
    },
    set(this: HTMLElement, v: number) {
      (this as unknown as { __st?: number }).__st = v;
    },
  });
});

afterEach(() => {
  if (clientHeightDescriptor) {
    Object.defineProperty(
      HTMLElement.prototype,
      'clientHeight',
      clientHeightDescriptor,
    );
  }
  if (scrollTopDescriptor) {
    Object.defineProperty(
      HTMLElement.prototype,
      'scrollTop',
      scrollTopDescriptor,
    );
  }
});

function makeItems(n: number): Array<{ id: string; label: string }> {
  return Array.from({ length: n }, (_, i) => ({
    id: `id-${i}`,
    label: `Row ${i}`,
  }));
}

describe('<VirtualList>', () => {
  it('renders only items in the visible window plus overscan', () => {
    const items = makeItems(200);
    const { container } = render(
      <VirtualList
        items={items}
        itemHeight={ITEM_HEIGHT}
        overscan={0}
        renderItem={(it) => <span>{it.label}</span>}
      />,
    );
    // viewport=200, itemHeight=40 -> 5 visible (0..4) + 0 overscan
    const rendered = container.querySelectorAll('[data-virtual-index]');
    expect(rendered.length).toBe(5);
    expect(screen.getByText('Row 0')).toBeInTheDocument();
    expect(screen.getByText('Row 4')).toBeInTheDocument();
    expect(screen.queryByText('Row 5')).toBeNull();
  });

  it('updates rendered window on scroll', () => {
    const items = makeItems(200);
    const { container } = render(
      <VirtualList
        items={items}
        itemHeight={ITEM_HEIGHT}
        overscan={0}
        renderItem={(it) => <span>{it.label}</span>}
      />,
    );
    const scroller = container.firstElementChild as HTMLElement;
    expect(scroller).toBeTruthy();
    act(() => {
      (scroller as unknown as { __st?: number }).__st = 400;
      fireEvent.scroll(scroller);
    });
    // Now visible window starts at floor(400/40)=10 .. 10+5=15
    expect(screen.getByText('Row 10')).toBeInTheDocument();
    expect(screen.getByText('Row 14')).toBeInTheDocument();
    expect(screen.queryByText('Row 0')).toBeNull();
  });

  it('adds extra rows for the overscan prop', () => {
    const items = makeItems(200);
    const { container } = render(
      <VirtualList
        items={items}
        itemHeight={ITEM_HEIGHT}
        overscan={3}
        renderItem={(it) => <span>{it.label}</span>}
      />,
    );
    const rendered = container.querySelectorAll('[data-virtual-index]');
    // 5 visible + 3 overscan on each side (top capped by 0) -> 5 + 3 = 8
    expect(rendered.length).toBe(8);
  });

  it('renders no items and spacer height 0 for empty items', () => {
    const { container } = render(
      <VirtualList
        items={[]}
        itemHeight={ITEM_HEIGHT}
        renderItem={() => <span>nope</span>}
      />,
    );
    const rendered = container.querySelectorAll('[data-virtual-index]');
    expect(rendered.length).toBe(0);
    const spacer = container.querySelector(
      'div[role="list"] > div',
    ) as HTMLElement | null;
    expect(spacer).toBeTruthy();
    expect(spacer!.style.height).toBe('0px');
  });

  it('fires onEndReached when the sentinel intersects', () => {
    const items = makeItems(50);
    const onEndReached = vi.fn();
    const observers: Array<(entries: IntersectionObserverEntry[]) => void> = [];
    const OriginalIO = (
      globalThis as unknown as { IntersectionObserver?: typeof IntersectionObserver }
    ).IntersectionObserver;
    class FakeIO {
      cb: (entries: IntersectionObserverEntry[]) => void;
      constructor(cb: (entries: IntersectionObserverEntry[]) => void) {
        this.cb = cb;
        observers.push(cb);
      }
      observe() {}
      unobserve() {}
      disconnect() {}
      takeRecords() {
        return [];
      }
    }
    (globalThis as unknown as { IntersectionObserver: unknown }).IntersectionObserver =
      FakeIO as unknown as typeof IntersectionObserver;
    try {
      render(
        <VirtualList
          items={items}
          itemHeight={ITEM_HEIGHT}
          renderItem={(it) => <span>{it.label}</span>}
          onEndReached={onEndReached}
        />,
      );
      expect(observers.length).toBe(1);
      act(() => {
        observers[0]!([
          { isIntersecting: true } as unknown as IntersectionObserverEntry,
        ]);
      });
      expect(onEndReached).toHaveBeenCalledTimes(1);
    } finally {
      if (OriginalIO) {
        (globalThis as unknown as { IntersectionObserver: typeof IntersectionObserver }).IntersectionObserver =
          OriginalIO;
      } else {
        delete (globalThis as unknown as { IntersectionObserver?: unknown }).IntersectionObserver;
      }
    }
  });

  it('uses getKey for item keys', () => {
    const items = makeItems(5);
    const getKey = vi.fn((it: { id: string }) => it.id);
    render(
      <VirtualList
        items={items}
        itemHeight={ITEM_HEIGHT}
        renderItem={(it) => <span>{it.label}</span>}
        getKey={getKey}
      />,
    );
    expect(getKey).toHaveBeenCalled();
    expect(getKey.mock.calls[0]![0]).toEqual(items[0]);
  });

  it('forwards ref to the scroll container', () => {
    const ref = createRef<HTMLDivElement>();
    render(
      <VirtualList
        ref={ref}
        items={makeItems(10)}
        itemHeight={ITEM_HEIGHT}
        renderItem={(it) => <span>{it.label}</span>}
      />,
    );
    expect(ref.current).toBeInstanceOf(HTMLElement);
    expect(ref.current?.getAttribute('role')).toBe('list');
  });

  it('applies role=list on the outer and role=listitem on each visible row', () => {
    const items = makeItems(10);
    const { container } = render(
      <VirtualList
        items={items}
        itemHeight={ITEM_HEIGHT}
        renderItem={(it) => <span>{it.label}</span>}
      />,
    );
    expect(container.querySelector('[role="list"]')).toBeTruthy();
    const rows = container.querySelectorAll('[role="listitem"]');
    expect(rows.length).toBeGreaterThan(0);
  });

  it('applies the ariaLabel prop', () => {
    render(
      <VirtualList
        items={makeItems(3)}
        itemHeight={ITEM_HEIGHT}
        renderItem={(it) => <span>{it.label}</span>}
        ariaLabel="Test list"
      />,
    );
    expect(screen.getByLabelText('Test list')).toBeInTheDocument();
  });

  it('merges className onto the scroll container', () => {
    const { container } = render(
      <VirtualList
        items={makeItems(3)}
        itemHeight={ITEM_HEIGHT}
        renderItem={(it) => <span>{it.label}</span>}
        className="custom-cls"
      />,
    );
    const root = container.querySelector('[role="list"]') as HTMLElement;
    expect(root.className).toContain('custom-cls');
    expect(root.className).toContain('overflow-auto');
  });
});
