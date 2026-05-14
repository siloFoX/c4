import { createRef } from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { Image } from './image';

type IOCallback = (entries: Array<{ isIntersecting: boolean }>) => void;

let lastCallback: IOCallback | null = null;
let observeCalls = 0;
let disconnectCalls = 0;

function installIO() {
  lastCallback = null;
  observeCalls = 0;
  disconnectCalls = 0;
  class FakeIO {
    constructor(cb: IOCallback) {
      lastCallback = cb;
    }
    observe() {
      observeCalls += 1;
    }
    disconnect() {
      disconnectCalls += 1;
    }
    unobserve() {}
    takeRecords() {
      return [];
    }
  }
  vi.stubGlobal('IntersectionObserver', FakeIO as unknown as typeof IntersectionObserver);
}

function triggerIntersect() {
  if (!lastCallback) throw new Error('IntersectionObserver callback never registered');
  act(() => {
    lastCallback!([{ isIntersecting: true }]);
  });
}

describe('<Image>', () => {
  beforeEach(() => {
    installIO();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("wrapper has aspect-square class when aspect='square'", () => {
    const { container } = render(<Image src="/a.png" alt="a" aspect="square" lazy={false} />);
    const wrap = container.querySelector('[data-ui="image"]') as HTMLElement;
    expect(wrap.className).toContain('aspect-square');
  });

  it("wrapper has aspect-[4/3] class when aspect='4/3'", () => {
    const { container } = render(<Image src="/a.png" alt="a" aspect="4/3" lazy={false} />);
    const wrap = container.querySelector('[data-ui="image"]') as HTMLElement;
    expect(wrap.className).toContain('aspect-[4/3]');
  });

  it("wrapper has aspect-video class when aspect='16/9'", () => {
    const { container } = render(<Image src="/a.png" alt="a" aspect="16/9" lazy={false} />);
    const wrap = container.querySelector('[data-ui="image"]') as HTMLElement;
    expect(wrap.className).toContain('aspect-video');
  });

  it('non-lazy mode renders <img src> immediately', () => {
    render(<Image src="/eager.png" alt="eager" lazy={false} />);
    const img = screen.getByAltText('eager') as HTMLImageElement;
    expect(img.tagName).toBe('IMG');
    expect(img.getAttribute('src')).toBe('/eager.png');
  });

  it('lazy mode does NOT render img src until observer fires', () => {
    render(<Image src="/lazy.png" alt="lazy" lazy={true} />);
    expect(screen.queryByAltText('lazy')).toBeNull();
    expect(observeCalls).toBe(1);
  });

  it('after intersection callback fires, img receives src', () => {
    render(<Image src="/lazy2.png" alt="lazy2" lazy={true} />);
    expect(screen.queryByAltText('lazy2')).toBeNull();
    triggerIntersect();
    const img = screen.getByAltText('lazy2') as HTMLImageElement;
    expect(img.getAttribute('src')).toBe('/lazy2.png');
    expect(disconnectCalls).toBeGreaterThanOrEqual(1);
  });

  it('onLoad transitions from opacity-0 to opacity-100', () => {
    render(<Image src="/o.png" alt="o" lazy={false} />);
    const img = screen.getByAltText('o') as HTMLImageElement;
    expect(img.className).toContain('opacity-0');
    fireEvent.load(img);
    expect(img.className).toContain('opacity-100');
  });

  it('onError without fallback renders ImageOff icon', () => {
    const { container } = render(<Image src="/bad.png" alt="bad" lazy={false} />);
    const img = screen.getByAltText('bad') as HTMLImageElement;
    fireEvent.error(img);
    const slot = container.querySelector('[data-image-fallback="icon"]');
    expect(slot).not.toBeNull();
    expect(slot!.querySelector('svg')).not.toBeNull();
  });

  it('onError with fallbackInitials renders initials text', () => {
    const { container } = render(
      <Image src="/bad.png" alt="bad" lazy={false} fallbackInitials="AB" />,
    );
    fireEvent.error(screen.getByAltText('bad'));
    const slot = container.querySelector('[data-image-fallback="initials"]') as HTMLElement;
    expect(slot).not.toBeNull();
    expect(slot.textContent).toContain('AB');
  });

  it('onError with custom fallback renders the provided ReactNode', () => {
    const { container } = render(
      <Image
        src="/bad.png"
        alt="bad"
        lazy={false}
        fallback={<span data-testid="custom-fb">FALLBACK</span>}
      />,
    );
    fireEvent.error(screen.getByAltText('bad'));
    expect(container.querySelector('[data-image-fallback="custom"]')).not.toBeNull();
    expect(screen.getByTestId('custom-fb').textContent).toBe('FALLBACK');
  });

  it('forwards alt attribute to the img', () => {
    render(<Image src="/x.png" alt="hello world" lazy={false} />);
    const img = screen.getByAltText('hello world') as HTMLImageElement;
    expect(img.getAttribute('alt')).toBe('hello world');
  });

  it('rounded prop applies class on the wrapper', () => {
    const { container } = render(
      <Image src="/r.png" alt="r" lazy={false} rounded="full" />,
    );
    const wrap = container.querySelector('[data-ui="image"]') as HTMLElement;
    expect(wrap.className).toContain('rounded-full');
  });

  it('forwardRef points to the outer wrapper div', () => {
    const ref = createRef<HTMLDivElement>();
    render(<Image ref={ref} src="/x.png" alt="x" lazy={false} />);
    expect(ref.current).not.toBeNull();
    expect(ref.current!.getAttribute('data-ui')).toBe('image');
  });

  it('className is merged onto the wrapper', () => {
    const { container } = render(
      <Image src="/x.png" alt="x" lazy={false} className="ring-2 ring-primary" />,
    );
    const wrap = container.querySelector('[data-ui="image"]') as HTMLElement;
    expect(wrap.className).toContain('ring-2');
    expect(wrap.className).toContain('ring-primary');
  });

  it('renders pulse animation while loading and removes it after load', () => {
    const { container } = render(<Image src="/p.png" alt="p" lazy={false} />);
    const wrap = container.querySelector('[data-ui="image"]') as HTMLElement;
    expect(wrap.className).toContain('animate-pulse');
    fireEvent.load(screen.getByAltText('p'));
    expect(wrap.className).not.toContain('animate-pulse');
  });
});
