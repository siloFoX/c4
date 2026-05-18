// @vitest-environment jsdom
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { createRef } from 'react';
import {
  InfiniteScroll,
  type InfiniteScrollHandle,
} from './infinite-scroll';

// (v1.11.356, TODO 11.338) jsdom does not implement
// IntersectionObserver. We mock it with a registry that
// captures the active callback so tests can simulate
// "sentinel intersects viewport" by invoking the
// callback manually.

interface CapturedObserver {
  callback: IntersectionObserverCallback;
  options: IntersectionObserverInit | undefined;
  observed: Element[];
  disconnected: boolean;
}

const captured: CapturedObserver[] = [];

class IntersectionObserverMock implements IntersectionObserver {
  root: Element | Document | null = null;
  rootMargin: string = '';
  thresholds: ReadonlyArray<number> = [];
  private record: CapturedObserver;

  constructor(
    callback: IntersectionObserverCallback,
    options?: IntersectionObserverInit,
  ) {
    this.record = {
      callback,
      options,
      observed: [],
      disconnected: false,
    };
    captured.push(this.record);
  }

  observe(el: Element): void {
    this.record.observed.push(el);
  }

  unobserve(): void {}

  disconnect(): void {
    this.record.disconnected = true;
  }

  takeRecords(): IntersectionObserverEntry[] {
    return [];
  }
}

function fireIntersection(observerIndex: number, isIntersecting: boolean): void {
  const record = captured[observerIndex];
  if (!record) throw new Error(`no observer at index ${observerIndex}`);
  const entry = {
    isIntersecting,
    target: record.observed[0] ?? document.createElement('div'),
    intersectionRatio: isIntersecting ? 1 : 0,
    boundingClientRect: {} as DOMRectReadOnly,
    intersectionRect: {} as DOMRectReadOnly,
    rootBounds: null,
    time: 0,
  } as IntersectionObserverEntry;
  record.callback(
    [entry],
    {} as IntersectionObserver,
  );
}

beforeEach(() => {
  captured.length = 0;
  // (Re-)install the mock on globalThis for every test
  // so a prior test cannot leak observers across cases.
  (globalThis as { IntersectionObserver: typeof IntersectionObserver }).IntersectionObserver =
    IntersectionObserverMock as unknown as typeof IntersectionObserver;
});

afterEach(() => {
  cleanup();
});

describe('<InfiniteScroll>', () => {
  it('renders the children verbatim', () => {
    render(
      <InfiniteScroll
        hasMore={true}
        loading={false}
        error={null}
        onLoadMore={() => undefined}
      >
        <div data-testid="row-a">A</div>
        <div data-testid="row-b">B</div>
      </InfiniteScroll>,
    );
    expect(screen.getByTestId('row-a')).toBeInTheDocument();
    expect(screen.getByTestId('row-b')).toBeInTheDocument();
  });

  it('renders the sentinel at the bottom', () => {
    render(
      <InfiniteScroll
        hasMore={true}
        loading={false}
        error={null}
        onLoadMore={() => undefined}
      >
        <div>row</div>
      </InfiniteScroll>,
    );
    expect(
      screen.getByTestId('infinite-scroll-sentinel'),
    ).toBeInTheDocument();
  });

  it('attaches an IntersectionObserver to the sentinel', () => {
    render(
      <InfiniteScroll
        hasMore={true}
        loading={false}
        error={null}
        onLoadMore={() => undefined}
      >
        <div>row</div>
      </InfiniteScroll>,
    );
    expect(captured).toHaveLength(1);
    const sentinel = screen.getByTestId('infinite-scroll-sentinel');
    expect(captured[0]?.observed).toContain(sentinel);
  });

  it('calls onLoadMore when the sentinel becomes visible', () => {
    const onLoadMore = vi.fn();
    render(
      <InfiniteScroll
        hasMore={true}
        loading={false}
        error={null}
        onLoadMore={onLoadMore}
      >
        <div>row</div>
      </InfiniteScroll>,
    );
    fireIntersection(0, true);
    expect(onLoadMore).toHaveBeenCalledTimes(1);
  });

  it('does NOT call onLoadMore when the sentinel is not intersecting', () => {
    const onLoadMore = vi.fn();
    render(
      <InfiniteScroll
        hasMore={true}
        loading={false}
        error={null}
        onLoadMore={onLoadMore}
      >
        <div>row</div>
      </InfiniteScroll>,
    );
    fireIntersection(0, false);
    expect(onLoadMore).not.toHaveBeenCalled();
  });

  it('does NOT call onLoadMore while loading=true', () => {
    const onLoadMore = vi.fn();
    render(
      <InfiniteScroll
        hasMore={true}
        loading={true}
        error={null}
        onLoadMore={onLoadMore}
      >
        <div>row</div>
      </InfiniteScroll>,
    );
    fireIntersection(0, true);
    expect(onLoadMore).not.toHaveBeenCalled();
  });

  it('does NOT call onLoadMore when error is set', () => {
    const onLoadMore = vi.fn();
    render(
      <InfiniteScroll
        hasMore={true}
        loading={false}
        error={new Error('boom')}
        onLoadMore={onLoadMore}
      >
        <div>row</div>
      </InfiniteScroll>,
    );
    fireIntersection(0, true);
    expect(onLoadMore).not.toHaveBeenCalled();
  });

  it('does NOT call onLoadMore when hasMore=false', () => {
    const onLoadMore = vi.fn();
    render(
      <InfiniteScroll
        hasMore={false}
        loading={false}
        error={null}
        onLoadMore={onLoadMore}
      >
        <div>row</div>
      </InfiniteScroll>,
    );
    fireIntersection(0, true);
    expect(onLoadMore).not.toHaveBeenCalled();
  });

  it('renders the default loading content while loading=true', () => {
    render(
      <InfiniteScroll
        hasMore={true}
        loading={true}
        error={null}
        onLoadMore={() => undefined}
      >
        <div>row</div>
      </InfiniteScroll>,
    );
    expect(screen.getByText(/Loading more/)).toBeInTheDocument();
    expect(
      screen.getByText(/Loading more/).closest(
        '[data-section="infinite-scroll-loading"]',
      ),
    ).not.toBeNull();
  });

  it('renders the default end-of-list marker when hasMore=false', () => {
    render(
      <InfiniteScroll
        hasMore={false}
        loading={false}
        error={null}
        onLoadMore={() => undefined}
      >
        <div>row</div>
      </InfiniteScroll>,
    );
    expect(screen.getByText('End of list')).toBeInTheDocument();
    expect(
      screen.getByText('End of list').closest(
        '[data-section="infinite-scroll-end"]',
      ),
    ).not.toBeNull();
  });

  it('renders the default error card with the error message + retry button', () => {
    const onRetry = vi.fn();
    render(
      <InfiniteScroll
        hasMore={true}
        loading={false}
        error={new Error('network down')}
        onLoadMore={() => undefined}
        onRetry={onRetry}
      >
        <div>row</div>
      </InfiniteScroll>,
    );
    expect(screen.getByText('network down')).toBeInTheDocument();
    const retry = screen.getByTestId('infinite-scroll-retry');
    expect(retry).toBeInTheDocument();
    fireEvent.click(retry);
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('falls back to a default error message when error.message is empty', () => {
    render(
      <InfiniteScroll
        hasMore={true}
        loading={false}
        error={new Error('')}
        onLoadMore={() => undefined}
      >
        <div>row</div>
      </InfiniteScroll>,
    );
    expect(screen.getByText(/Failed to load more/)).toBeInTheDocument();
  });

  it('omits the retry button when onRetry is not provided', () => {
    render(
      <InfiniteScroll
        hasMore={true}
        loading={false}
        error={new Error('err')}
        onLoadMore={() => undefined}
      >
        <div>row</div>
      </InfiniteScroll>,
    );
    expect(
      screen.queryByTestId('infinite-scroll-retry'),
    ).not.toBeInTheDocument();
  });

  it('honours a custom loadingContent override', () => {
    render(
      <InfiniteScroll
        hasMore={true}
        loading={true}
        error={null}
        onLoadMore={() => undefined}
        loadingContent={<div data-testid="custom-loading">spinner</div>}
      >
        <div>row</div>
      </InfiniteScroll>,
    );
    expect(screen.getByTestId('custom-loading')).toBeInTheDocument();
  });

  it('honours a custom endContent override', () => {
    render(
      <InfiniteScroll
        hasMore={false}
        loading={false}
        error={null}
        onLoadMore={() => undefined}
        endContent={<div data-testid="custom-end">all done</div>}
      >
        <div>row</div>
      </InfiniteScroll>,
    );
    expect(screen.getByTestId('custom-end')).toBeInTheDocument();
  });

  it('honours a ReactNode errorContent override', () => {
    render(
      <InfiniteScroll
        hasMore={true}
        loading={false}
        error={new Error('x')}
        onLoadMore={() => undefined}
        errorContent={<div data-testid="custom-error">x error</div>}
      >
        <div>row</div>
      </InfiniteScroll>,
    );
    expect(screen.getByTestId('custom-error')).toBeInTheDocument();
  });

  it('honours a factory errorContent override', () => {
    const onRetry = vi.fn();
    render(
      <InfiniteScroll
        hasMore={true}
        loading={false}
        error={new Error('x')}
        onLoadMore={() => undefined}
        onRetry={onRetry}
        errorContent={(retry) => (
          <button
            type="button"
            data-testid="factory-retry"
            onClick={retry}
          >
            try again
          </button>
        )}
      >
        <div>row</div>
      </InfiniteScroll>,
    );
    fireEvent.click(screen.getByTestId('factory-retry'));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('surfaces data-state for the four terminal states', () => {
    const { rerender } = render(
      <InfiniteScroll
        hasMore={true}
        loading={false}
        error={null}
        onLoadMore={() => undefined}
      >
        <div>r</div>
      </InfiniteScroll>,
    );
    expect(
      document.querySelector('[data-section="infinite-scroll"]')
        ?.getAttribute('data-state'),
    ).toBe('idle');

    rerender(
      <InfiniteScroll
        hasMore={true}
        loading={true}
        error={null}
        onLoadMore={() => undefined}
      >
        <div>r</div>
      </InfiniteScroll>,
    );
    expect(
      document.querySelector('[data-section="infinite-scroll"]')
        ?.getAttribute('data-state'),
    ).toBe('loading');

    rerender(
      <InfiniteScroll
        hasMore={true}
        loading={false}
        error={new Error('e')}
        onLoadMore={() => undefined}
      >
        <div>r</div>
      </InfiniteScroll>,
    );
    expect(
      document.querySelector('[data-section="infinite-scroll"]')
        ?.getAttribute('data-state'),
    ).toBe('error');

    rerender(
      <InfiniteScroll
        hasMore={false}
        loading={false}
        error={null}
        onLoadMore={() => undefined}
      >
        <div>r</div>
      </InfiniteScroll>,
    );
    expect(
      document.querySelector('[data-section="infinite-scroll"]')
        ?.getAttribute('data-state'),
    ).toBe('end');
  });

  it('forwards the rootMargin to IntersectionObserver', () => {
    render(
      <InfiniteScroll
        hasMore={true}
        loading={false}
        error={null}
        onLoadMore={() => undefined}
        rootMargin="500px 0px"
      >
        <div>r</div>
      </InfiniteScroll>,
    );
    expect(captured[0]?.options?.rootMargin).toBe('500px 0px');
  });

  // (v1.11.356, TODO 11.338) Imperative handle.
  it('exposes triggerLoadMore + getSentinel via the scrollRef handle', () => {
    const ref = createRef<InfiniteScrollHandle>();
    const onLoadMore = vi.fn();
    render(
      <InfiniteScroll
        hasMore={true}
        loading={false}
        error={null}
        onLoadMore={onLoadMore}
        scrollRef={ref}
      >
        <div>r</div>
      </InfiniteScroll>,
    );
    expect(ref.current?.getSentinel()).toBe(
      screen.getByTestId('infinite-scroll-sentinel'),
    );
    ref.current?.triggerLoadMore();
    expect(onLoadMore).toHaveBeenCalledTimes(1);
  });

  it('triggerLoadMore is a no-op while loading=true', () => {
    const ref = createRef<InfiniteScrollHandle>();
    const onLoadMore = vi.fn();
    render(
      <InfiniteScroll
        hasMore={true}
        loading={true}
        error={null}
        onLoadMore={onLoadMore}
        scrollRef={ref}
      >
        <div>r</div>
      </InfiniteScroll>,
    );
    ref.current?.triggerLoadMore();
    expect(onLoadMore).not.toHaveBeenCalled();
  });

  it('disconnects the observer on unmount', () => {
    const { unmount } = render(
      <InfiniteScroll
        hasMore={true}
        loading={false}
        error={null}
        onLoadMore={() => undefined}
      >
        <div>r</div>
      </InfiniteScroll>,
    );
    expect(captured[0]?.disconnected).toBe(false);
    unmount();
    expect(captured[0]?.disconnected).toBe(true);
  });
});
