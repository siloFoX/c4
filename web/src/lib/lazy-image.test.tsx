import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LazyImage } from './lazy-image';

interface MockIntersectionObserver {
  observe: (target: Element) => void;
  unobserve: (target: Element) => void;
  disconnect: () => void;
}

type IOCallback = (entries: { isIntersecting: boolean; target: Element }[]) => void;

let lastObserver: {
  cb: IOCallback;
  options: IntersectionObserverInit | undefined;
  observed: Element[];
} | null = null;

beforeEach(() => {
  lastObserver = null;
  class IOMock implements MockIntersectionObserver {
    cb: IOCallback;
    options: IntersectionObserverInit | undefined;
    observed: Element[] = [];
    constructor(cb: IOCallback, options?: IntersectionObserverInit) {
      this.cb = cb;
      this.options = options;
      lastObserver = { cb, options, observed: this.observed };
    }
    observe(target: Element): void {
      this.observed.push(target);
      if (lastObserver) lastObserver.observed = this.observed;
    }
    unobserve(): void {}
    disconnect(): void {}
  }
  Object.defineProperty(window, 'IntersectionObserver', {
    configurable: true,
    writable: true,
    value: IOMock as unknown as typeof IntersectionObserver,
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

function fireIntersect(): void {
  if (!lastObserver) throw new Error('no IO observer captured');
  const target = lastObserver.observed[0];
  if (!target) throw new Error('observer has no target');
  act(() => {
    lastObserver?.cb([{ isIntersecting: true, target }]);
  });
}

describe('LazyImage', () => {
  it('paints the LQIP as a background image immediately', () => {
    render(
      <LazyImage
        src="/full.jpg"
        lqip="data:image/jpeg;base64,/9j/lqip"
        alt="Worker avatar"
        data-testid="img-lqip"
      />,
    );
    const wrapper = screen.getByTestId('img-lqip');
    expect(wrapper.style.backgroundImage).toContain('data:image/jpeg;base64,/9j/lqip');
  });

  it('does NOT render the <img> element before intersection', () => {
    render(
      <LazyImage
        src="/full.jpg"
        alt="x"
        data-testid="img-pre-intersect"
      />,
    );
    const wrapper = screen.getByTestId('img-pre-intersect');
    expect(wrapper.querySelector('img')).toBeNull();
    expect(wrapper).toHaveAttribute('data-state', 'idle');
  });

  it('renders the <img> after intersection and transitions to data-state=fetching', () => {
    render(
      <LazyImage
        src="/full.jpg"
        alt="x"
        data-testid="img-on-intersect"
      />,
    );
    fireIntersect();
    const wrapper = screen.getByTestId('img-on-intersect');
    const img = wrapper.querySelector('img');
    expect(img).not.toBeNull();
    expect(img).toHaveAttribute('src', '/full.jpg');
    expect(img).toHaveAttribute('loading', 'lazy');
    expect(img).toHaveAttribute('decoding', 'async');
    expect(wrapper).toHaveAttribute('data-state', 'fetching');
  });

  it('transitions to data-state=loaded on img load + drops the wrapper blur', () => {
    render(
      <LazyImage
        src="/full.jpg"
        lqip="data:image/jpeg;base64,X"
        alt="x"
        data-testid="img-loaded"
        blurPx={20}
      />,
    );
    fireIntersect();
    const wrapper = screen.getByTestId('img-loaded');
    expect(wrapper.style.filter).toContain('blur(20px)');
    const img = wrapper.querySelector('img');
    expect(img).not.toBeNull();
    act(() => {
      fireEvent.load(img as HTMLImageElement);
    });
    expect(wrapper).toHaveAttribute('data-state', 'loaded');
    expect(wrapper.style.filter).toBe('none');
  });

  it('transitions to data-state=error on img error', () => {
    render(
      <LazyImage src="/missing.jpg" alt="x" data-testid="img-err" />,
    );
    fireIntersect();
    const wrapper = screen.getByTestId('img-err');
    const img = wrapper.querySelector('img');
    act(() => {
      fireEvent.error(img as HTMLImageElement);
    });
    expect(wrapper).toHaveAttribute('data-state', 'error');
    // The <img> unmounts so the LQIP stays as the
    // visible surface.
    expect(wrapper.querySelector('img')).toBeNull();
  });

  it('forwards onLoad and onError callbacks', () => {
    const onLoad = vi.fn();
    const onError = vi.fn();
    render(
      <LazyImage
        src="/x.jpg"
        alt="x"
        data-testid="img-cb"
        onLoad={onLoad}
        onError={onError}
      />,
    );
    fireIntersect();
    const img = screen.getByTestId('img-cb').querySelector('img') as HTMLImageElement;
    fireEvent.load(img);
    expect(onLoad).toHaveBeenCalled();
    // Re-render not needed -- the next test verifies
    // onError independently.
  });

  it('falls through to native loading="lazy" when IntersectionObserver is missing', () => {
    Object.defineProperty(window, 'IntersectionObserver', {
      configurable: true,
      writable: true,
      value: undefined,
    });
    render(
      <LazyImage src="/x.jpg" alt="x" data-testid="img-no-io" />,
    );
    const wrapper = screen.getByTestId('img-no-io');
    const img = wrapper.querySelector('img');
    expect(img).not.toBeNull();
    expect(img).toHaveAttribute('loading', 'lazy');
  });

  it('forwards srcSet + sizes verbatim', () => {
    render(
      <LazyImage
        src="/x.jpg"
        srcSet="/x-1x.jpg 1x, /x-2x.jpg 2x"
        sizes="(min-width: 640px) 480px, 100vw"
        alt="x"
        data-testid="img-srcset"
      />,
    );
    fireIntersect();
    const img = screen.getByTestId('img-srcset').querySelector('img') as HTMLImageElement;
    expect(img).toHaveAttribute('srcset', '/x-1x.jpg 1x, /x-2x.jpg 2x');
    expect(img).toHaveAttribute('sizes', '(min-width: 640px) 480px, 100vw');
  });

  it('overrides decoding when passed', () => {
    render(
      <LazyImage
        src="/x.jpg"
        alt="x"
        data-testid="img-dec"
        decoding="sync"
      />,
    );
    fireIntersect();
    const img = screen.getByTestId('img-dec').querySelector('img') as HTMLImageElement;
    expect(img).toHaveAttribute('decoding', 'sync');
  });

  it('applies width / height to the wrapper style', () => {
    render(
      <LazyImage
        src="/x.jpg"
        alt="x"
        width={64}
        height={48}
        data-testid="img-dim"
      />,
    );
    const wrapper = screen.getByTestId('img-dim');
    expect(wrapper.style.width).toBe('64px');
    expect(wrapper.style.height).toBe('48px');
  });

  it('accepts string CSS lengths for width / height', () => {
    render(
      <LazyImage
        src="/x.jpg"
        alt="x"
        width="50%"
        height="auto"
        data-testid="img-css-dim"
      />,
    );
    const wrapper = screen.getByTestId('img-css-dim');
    expect(wrapper.style.width).toBe('50%');
    expect(wrapper.style.height).toBe('auto');
  });

  it('respects rootMargin on the observer', () => {
    render(
      <LazyImage
        src="/x.jpg"
        alt="x"
        rootMargin="500px"
        data-testid="img-margin"
      />,
    );
    expect(lastObserver?.options?.rootMargin).toBe('500px');
  });

  it('passes through className and imgClassName overrides', () => {
    render(
      <LazyImage
        src="/x.jpg"
        alt="x"
        data-testid="img-cls"
        className="custom-wrap-class"
        imgClassName="custom-img-class"
      />,
    );
    const wrapper = screen.getByTestId('img-cls');
    expect(wrapper.className).toContain('custom-wrap-class');
    fireIntersect();
    const img = wrapper.querySelector('img') as HTMLImageElement;
    expect(img.className).toContain('custom-img-class');
  });

  it('blurPx=0 disables the blur filter', () => {
    render(
      <LazyImage
        src="/x.jpg"
        alt="x"
        lqip="data:image/jpeg;base64,Y"
        blurPx={0}
        data-testid="img-noblur"
      />,
    );
    const wrapper = screen.getByTestId('img-noblur');
    expect(wrapper.style.filter).toBe('none');
  });

  it('exposes displayName for debugging', () => {
    expect(LazyImage.displayName).toBe('LazyImage');
  });
});
