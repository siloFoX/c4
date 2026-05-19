import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { createRef } from 'react';
import {
  DEFAULT_SCROLL_SPY_OFFSET,
  DEFAULT_SCROLL_SPY_ORIENTATION,
  DEFAULT_SCROLL_SPY_ROOT_MARGIN,
  DEFAULT_SCROLL_SPY_THRESHOLD,
  ScrollSpy,
  getActiveIdFromEntries,
  getMostVisibleEntry,
  scrollIntoViewWithOffset,
} from './scroll-spy';
import type {
  ScrollSpyEntry,
  ScrollSpyItem,
} from './scroll-spy';

// -- IntersectionObserver mock -----------------------------
let lastObserver: MockIntersectionObserver | null = null;
let observers: MockIntersectionObserver[] = [];

class MockIntersectionObserver {
  callback: IntersectionObserverCallback;
  options: IntersectionObserverInit | undefined;
  observed: Element[] = [];
  disconnected = false;
  constructor(
    callback: IntersectionObserverCallback,
    options?: IntersectionObserverInit,
  ) {
    this.callback = callback;
    this.options = options;
    lastObserver = this;
    observers.push(this);
  }
  observe(target: Element) {
    this.observed.push(target);
  }
  unobserve(target: Element) {
    this.observed = this.observed.filter((el) => el !== target);
  }
  disconnect() {
    this.disconnected = true;
    this.observed = [];
  }
  takeRecords(): IntersectionObserverEntry[] {
    return [];
  }
  // Test helper
  emit(entries: Partial<IntersectionObserverEntry>[]) {
    this.callback(
      entries as IntersectionObserverEntry[],
      this as unknown as IntersectionObserver,
    );
  }
  // ROO must be present for type-check
  root: Element | null = null;
  rootMargin = '';
  thresholds: ReadonlyArray<number> = [];
}

beforeEach(() => {
  lastObserver = null;
  observers = [];
  (window as unknown as { IntersectionObserver: typeof MockIntersectionObserver }).IntersectionObserver =
    MockIntersectionObserver;
});

afterEach(() => {
  cleanup();
  document.body.innerHTML = '';
});

const items: ScrollSpyItem[] = [
  { id: 'intro', label: 'Introduction' },
  { id: 'usage', label: 'Usage' },
  { id: 'api', label: 'API' },
];

function mountSections() {
  for (const item of items) {
    const section = document.createElement('section');
    section.id = item.id;
    section.textContent = `${item.label} section`;
    document.body.appendChild(section);
  }
}

// ---------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------

describe('getMostVisibleEntry', () => {
  it('returns null for empty list', () => {
    expect(getMostVisibleEntry([])).toBeNull();
  });
  it('returns null when none intersecting', () => {
    const entries: ScrollSpyEntry[] = [
      {
        isIntersecting: false,
        intersectionRatio: 0,
        target: { id: 'a' },
      },
    ];
    expect(getMostVisibleEntry(entries)).toBeNull();
  });
  it('returns highest ratio among intersecting', () => {
    const entries: ScrollSpyEntry[] = [
      {
        isIntersecting: true,
        intersectionRatio: 0.3,
        target: { id: 'a' },
      },
      {
        isIntersecting: true,
        intersectionRatio: 0.7,
        target: { id: 'b' },
      },
      {
        isIntersecting: false,
        intersectionRatio: 1,
        target: { id: 'c' },
      },
    ];
    expect(getMostVisibleEntry(entries)?.target.id).toBe('b');
  });
});

describe('getActiveIdFromEntries', () => {
  it('returns the most-visible id when something intersects', () => {
    const entries: ScrollSpyEntry[] = [
      {
        isIntersecting: true,
        intersectionRatio: 0.5,
        target: { id: 'x' },
      },
    ];
    expect(getActiveIdFromEntries(entries, null)).toBe('x');
  });
  it('keeps previous when previous is not in this batch + nothing intersects', () => {
    const entries: ScrollSpyEntry[] = [
      {
        isIntersecting: false,
        intersectionRatio: 0,
        target: { id: 'b' },
      },
    ];
    expect(getActiveIdFromEntries(entries, 'a')).toBe('a');
  });
  it('returns null when previous IS in the batch but nothing intersects', () => {
    const entries: ScrollSpyEntry[] = [
      {
        isIntersecting: false,
        intersectionRatio: 0,
        target: { id: 'a' },
      },
    ];
    expect(getActiveIdFromEntries(entries, 'a')).toBeNull();
  });
});

describe('scrollIntoViewWithOffset', () => {
  it('no-ops on null', () => {
    expect(() =>
      scrollIntoViewWithOffset(null),
    ).not.toThrow();
  });
  it('calls element.scrollIntoView when offset=0', () => {
    const el = document.createElement('div');
    el.scrollIntoView = vi.fn();
    scrollIntoViewWithOffset(el, 0, 'smooth');
    expect(el.scrollIntoView).toHaveBeenCalledWith({
      behavior: 'smooth',
      block: 'start',
    });
  });
  it('uses window.scrollTo when offset > 0', () => {
    const el = document.createElement('div');
    el.getBoundingClientRect = () =>
      ({ top: 200, left: 0, bottom: 300, right: 100, width: 100, height: 100, x: 0, y: 0, toJSON: () => ({}) }) as DOMRect;
    Object.defineProperty(window, 'scrollY', {
      configurable: true,
      value: 50,
    });
    const scrollTo = vi.fn();
    window.scrollTo = scrollTo as unknown as typeof window.scrollTo;
    scrollIntoViewWithOffset(el, 80, 'smooth');
    expect(scrollTo).toHaveBeenCalledWith({
      top: 200 + 50 - 80,
      behavior: 'smooth',
    });
  });
});

describe('Constants', () => {
  it('rootMargin default', () => {
    expect(DEFAULT_SCROLL_SPY_ROOT_MARGIN).toBe('0px 0px -50% 0px');
  });
  it('threshold default', () => {
    expect(DEFAULT_SCROLL_SPY_THRESHOLD).toBe(0);
  });
  it('orientation default', () => {
    expect(DEFAULT_SCROLL_SPY_ORIENTATION).toBe('vertical');
  });
  it('offset default', () => {
    expect(DEFAULT_SCROLL_SPY_OFFSET).toBe(0);
  });
});

// ---------------------------------------------------------------
// Component
// ---------------------------------------------------------------

describe('ScrollSpy component', () => {
  it('renders <nav> with default aria-label', () => {
    render(<ScrollSpy items={items} />);
    expect(screen.getByRole('navigation')).toHaveAttribute(
      'aria-label',
      'Section navigation',
    );
  });

  it('honors custom ariaLabel', () => {
    render(<ScrollSpy items={items} ariaLabel="Doc sections" />);
    expect(screen.getByRole('navigation')).toHaveAttribute(
      'aria-label',
      'Doc sections',
    );
  });

  it('renders one link per item', () => {
    render(<ScrollSpy items={items} />);
    expect(screen.getAllByRole('link').length).toBe(3);
  });

  it('default link text matches labels', () => {
    render(<ScrollSpy items={items} />);
    expect(screen.getByText('Introduction')).toBeInTheDocument();
    expect(screen.getByText('Usage')).toBeInTheDocument();
    expect(screen.getByText('API')).toBeInTheDocument();
  });

  it('default link href is #id', () => {
    render(<ScrollSpy items={items} />);
    expect(screen.getByText('Introduction').closest('a')).toHaveAttribute(
      'href',
      '#intro',
    );
  });

  it('controlled activeId marks the matching item active', () => {
    render(<ScrollSpy items={items} activeId="usage" />);
    const usage = screen.getByText('Usage').closest('a');
    expect(usage).toHaveAttribute('aria-current', 'location');
  });

  it('aria-current is omitted from non-active links', () => {
    render(<ScrollSpy items={items} activeId="usage" />);
    const intro = screen.getByText('Introduction').closest('a');
    expect(intro).not.toHaveAttribute('aria-current');
  });

  it('orientation defaults to vertical', () => {
    render(<ScrollSpy items={items} />);
    expect(screen.getByRole('navigation')).toHaveAttribute(
      'data-orientation',
      'vertical',
    );
  });

  it('horizontal orientation reflects on root', () => {
    render(<ScrollSpy items={items} orientation="horizontal" />);
    expect(screen.getByRole('navigation')).toHaveAttribute(
      'data-orientation',
      'horizontal',
    );
  });

  it('root data attrs mirror props', () => {
    render(<ScrollSpy items={items} activeId="api" />);
    const root = screen.getByRole('navigation');
    expect(root).toHaveAttribute('data-active-id', 'api');
    expect(root).toHaveAttribute('data-item-count', '3');
  });

  it('per-item data attrs reflect state', () => {
    const { container } = render(
      <ScrollSpy items={items} activeId="api" />,
    );
    const apiItem = container.querySelector(
      '[data-item-id="api"]',
    );
    expect(apiItem).toHaveAttribute('data-active', 'true');
    expect(
      container.querySelector('[data-item-id="intro"]'),
    ).toHaveAttribute('data-active', 'false');
  });

  it('disabled items render with aria-disabled + data-disabled', () => {
    const withDisabled: ScrollSpyItem[] = [
      { id: 'a', label: 'A' },
      { id: 'b', label: 'B', disabled: true },
    ];
    const { container } = render(
      <ScrollSpy items={withDisabled} />,
    );
    expect(container.querySelector('[data-item-id="b"]')).toHaveAttribute(
      'data-disabled',
      'true',
    );
    expect(
      screen.getByText('B').closest('a'),
    ).toHaveAttribute('aria-disabled', 'true');
  });

  it('clicking an item calls scrollIntoView on the target', () => {
    mountSections();
    const sec = document.getElementById('usage')!;
    sec.scrollIntoView = vi.fn();
    render(<ScrollSpy items={items} />);
    fireEvent.click(screen.getByText('Usage'));
    expect(sec.scrollIntoView).toHaveBeenCalled();
  });

  it('clicking an item fires onActiveChange', () => {
    const onActiveChange = vi.fn();
    render(
      <ScrollSpy
        items={items}
        onActiveChange={onActiveChange}
      />,
    );
    fireEvent.click(screen.getByText('Usage'));
    expect(onActiveChange).toHaveBeenCalledWith('usage');
  });

  it('clicking a disabled item is a no-op', () => {
    const onActiveChange = vi.fn();
    const withDisabled: ScrollSpyItem[] = [
      { id: 'a', label: 'A' },
      { id: 'b', label: 'B', disabled: true },
    ];
    render(
      <ScrollSpy
        items={withDisabled}
        onActiveChange={onActiveChange}
      />,
    );
    fireEvent.click(screen.getByText('B'));
    expect(onActiveChange).not.toHaveBeenCalled();
  });

  it('clicking preventDefaults the link (no hash nav)', () => {
    render(<ScrollSpy items={items} />);
    const evt = new MouseEvent('click', {
      bubbles: true,
      cancelable: true,
    });
    screen.getByText('Usage').dispatchEvent(evt);
    expect(evt.defaultPrevented).toBe(true);
  });

  it('IntersectionObserver is constructed with the configured options', () => {
    mountSections();
    render(
      <ScrollSpy
        items={items}
        rootMargin="10px"
        threshold={[0.25, 0.5]}
      />,
    );
    expect(lastObserver).not.toBeNull();
    expect(lastObserver?.options?.rootMargin).toBe('10px');
    expect(lastObserver?.options?.threshold).toEqual([0.25, 0.5]);
  });

  it('IntersectionObserver observes one element per non-disabled item that exists in the DOM', () => {
    mountSections();
    render(<ScrollSpy items={items} />);
    expect(lastObserver?.observed.length).toBe(3);
  });

  it('IO emit updates the uncontrolled active id', () => {
    mountSections();
    const onActiveChange = vi.fn();
    render(
      <ScrollSpy
        items={items}
        onActiveChange={onActiveChange}
      />,
    );
    act(() => {
      lastObserver?.emit([
        {
          isIntersecting: true,
          intersectionRatio: 0.7,
          target: document.getElementById('api')!,
        },
      ]);
    });
    expect(onActiveChange).toHaveBeenCalledWith('api');
    const apiLink = screen.getByText('API').closest('a');
    expect(apiLink).toHaveAttribute('aria-current', 'location');
  });

  it('IO emit does NOT override controlled activeId', () => {
    mountSections();
    const onActiveChange = vi.fn();
    render(
      <ScrollSpy
        items={items}
        activeId="intro"
        onActiveChange={onActiveChange}
      />,
    );
    act(() => {
      lastObserver?.emit([
        {
          isIntersecting: true,
          intersectionRatio: 0.7,
          target: document.getElementById('api')!,
        },
      ]);
    });
    expect(onActiveChange).toHaveBeenCalledWith('api');
    // The visible aria-current still tracks the controlled prop
    expect(
      screen.getByText('Introduction').closest('a'),
    ).toHaveAttribute('aria-current', 'location');
  });

  it('observer disconnects on unmount', () => {
    mountSections();
    const { unmount } = render(<ScrollSpy items={items} />);
    expect(lastObserver?.disconnected).toBe(false);
    unmount();
    expect(lastObserver?.disconnected).toBe(true);
  });

  it('items with no matching DOM element are skipped from observation', () => {
    document.body.innerHTML = '<section id="api"></section>';
    render(<ScrollSpy items={items} />);
    expect(lastObserver?.observed.length).toBe(1);
  });

  it('renderItem renderprop is used in place of the default link', () => {
    render(
      <ScrollSpy
        items={items}
        renderItem={({ item, isActive, onClick }) => (
          <button
            type="button"
            onClick={onClick}
            data-custom="true"
            data-custom-active={isActive ? 'yes' : 'no'}
          >
            CUSTOM-{item.id}
          </button>
        )}
      />,
    );
    expect(screen.getByText('CUSTOM-intro')).toBeInTheDocument();
    expect(screen.queryAllByRole('link').length).toBe(0);
    expect(screen.getAllByRole('button').length).toBe(3);
  });

  it('defaultActiveId seeds the uncontrolled state', () => {
    render(
      <ScrollSpy items={items} defaultActiveId="usage" />,
    );
    expect(
      screen.getByText('Usage').closest('a'),
    ).toHaveAttribute('aria-current', 'location');
  });

  it('exposes a stable displayName', () => {
    expect(ScrollSpy.displayName).toBe('ScrollSpy');
  });

  it('forwards ref to the nav element', () => {
    const ref = createRef<HTMLElement>();
    render(<ScrollSpy ref={ref} items={items} />);
    expect(ref.current?.tagName.toLowerCase()).toBe('nav');
  });

  it('data-section markers present on root, list, and items', () => {
    const { container } = render(<ScrollSpy items={items} />);
    expect(
      container.querySelector('[data-section="scroll-spy"]'),
    ).toBeInTheDocument();
    expect(
      container.querySelector('[data-section="scroll-spy-list"]'),
    ).toBeInTheDocument();
    expect(
      container.querySelectorAll(
        '[data-section="scroll-spy-item"]',
      ).length,
    ).toBe(3);
  });

  it('skips IO setup when no IntersectionObserver is available', () => {
    delete (window as unknown as { IntersectionObserver?: unknown })
      .IntersectionObserver;
    render(<ScrollSpy items={items} />);
    expect(lastObserver).toBeNull();
  });
});
