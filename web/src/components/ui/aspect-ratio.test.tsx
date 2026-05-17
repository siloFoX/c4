import { createRef } from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AspectRatio } from './aspect-ratio';

describe('<AspectRatio>', () => {
  it('renders a wrapper div + a relative-position content slot', () => {
    const { container } = render(
      <AspectRatio>
        <span data-testid="inner">x</span>
      </AspectRatio>,
    );
    const root = container.firstChild as HTMLElement;
    expect(root.tagName).toBe('DIV');
    expect(root.className).toContain('relative');
    expect(
      root.querySelector('[data-section="aspect-ratio-content"]'),
    ).not.toBeNull();
    expect(screen.getByTestId('inner')).toBeInTheDocument();
  });

  it('default ratio (no prop) renders 16:9', () => {
    const { container } = render(
      <AspectRatio>
        <span>x</span>
      </AspectRatio>,
    );
    const root = container.firstChild as HTMLElement;
    expect(root.getAttribute('data-ratio')).toBe('16:9');
    expect(root.style.aspectRatio).toBe('16 / 9');
  });

  it('preset "4:3" renders the 4/3 CSS value', () => {
    const { container } = render(
      <AspectRatio ratio="4:3">
        <span>x</span>
      </AspectRatio>,
    );
    const root = container.firstChild as HTMLElement;
    expect(root.getAttribute('data-ratio')).toBe('4:3');
    expect(root.style.aspectRatio).toBe('4 / 3');
  });

  it('preset "1:1" renders the 1/1 CSS value', () => {
    const { container } = render(
      <AspectRatio ratio="1:1">
        <span>x</span>
      </AspectRatio>,
    );
    const root = container.firstChild as HTMLElement;
    expect(root.style.aspectRatio).toBe('1 / 1');
  });

  it('preset "9:16" renders the vertical 9/16 CSS value', () => {
    const { container } = render(
      <AspectRatio ratio="9:16">
        <span>x</span>
      </AspectRatio>,
    );
    const root = container.firstChild as HTMLElement;
    expect(root.style.aspectRatio).toBe('9 / 16');
  });

  it('preset "21:9" renders the ultrawide 21/9 CSS value', () => {
    const { container } = render(
      <AspectRatio ratio="21:9">
        <span>x</span>
      </AspectRatio>,
    );
    const root = container.firstChild as HTMLElement;
    expect(root.style.aspectRatio).toBe('21 / 9');
  });

  it('numeric ratio passes through (3 -> normalized "3 / 1")', () => {
    const { container } = render(
      <AspectRatio ratio={3}>
        <span>x</span>
      </AspectRatio>,
    );
    const root = container.firstChild as HTMLElement;
    expect(root.getAttribute('data-ratio')).toBe('3');
    // jsdom normalizes a bare numeric aspect-ratio value to
    // "<value> / 1" when serialising the inline style. The
    // data-ratio attribute keeps the bare number so e2e tests
    // can still match on the raw input.
    expect(root.style.aspectRatio).toBe('3 / 1');
  });

  it('invalid numeric ratio (NaN) falls back to 16:9', () => {
    const { container } = render(
      <AspectRatio ratio={Number.NaN}>
        <span>x</span>
      </AspectRatio>,
    );
    const root = container.firstChild as HTMLElement;
    expect(root.getAttribute('data-ratio')).toBe('16:9');
    expect(root.style.aspectRatio).toBe('16 / 9');
  });

  it('non-positive numeric ratio (0) falls back to 16:9', () => {
    const { container } = render(
      <AspectRatio ratio={0}>
        <span>x</span>
      </AspectRatio>,
    );
    const root = container.firstChild as HTMLElement;
    expect(root.style.aspectRatio).toBe('16 / 9');
  });

  it('exposes data-section="aspect-ratio" on the wrapper', () => {
    const { container } = render(
      <AspectRatio>
        <span>x</span>
      </AspectRatio>,
    );
    expect(
      container.querySelector('[data-section="aspect-ratio"]'),
    ).not.toBeNull();
  });

  it('exposes data-section="aspect-ratio-content" on the inner slot', () => {
    const { container } = render(
      <AspectRatio>
        <span>x</span>
      </AspectRatio>,
    );
    const slot = container.querySelector(
      '[data-section="aspect-ratio-content"]',
    ) as HTMLElement;
    expect(slot).not.toBeNull();
    expect(slot.className).toContain('absolute');
    expect(slot.className).toContain('inset-0');
  });

  it('merges caller className onto the wrapper', () => {
    const { container } = render(
      <AspectRatio className="custom-frame">
        <span>x</span>
      </AspectRatio>,
    );
    const root = container.firstChild as HTMLElement;
    expect(root.className).toContain('custom-frame');
    expect(root.className).toContain('relative');
  });

  it('caller style merges with the aspect-ratio style', () => {
    const { container } = render(
      <AspectRatio style={{ backgroundColor: 'red' }}>
        <span>x</span>
      </AspectRatio>,
    );
    const root = container.firstChild as HTMLElement;
    expect(root.style.aspectRatio).toBe('16 / 9');
    expect(root.style.backgroundColor).toBe('red');
  });

  it('forwards extra HTML attributes onto the wrapper', () => {
    const { container } = render(
      <AspectRatio id="thumb" data-testid="ar">
        <span>x</span>
      </AspectRatio>,
    );
    const root = container.firstChild as HTMLElement;
    expect(root.getAttribute('id')).toBe('thumb');
    expect(root.getAttribute('data-testid')).toBe('ar');
  });

  it('forwardRef exposes the wrapper HTMLDivElement', () => {
    const ref = createRef<HTMLDivElement>();
    render(
      <AspectRatio ref={ref}>
        <span>x</span>
      </AspectRatio>,
    );
    expect(ref.current).toBeInstanceOf(HTMLDivElement);
    expect(ref.current?.getAttribute('data-section')).toBe('aspect-ratio');
  });

  it('exposes a stable displayName for devtools', () => {
    expect(AspectRatio.displayName).toBe('AspectRatio');
  });
});
