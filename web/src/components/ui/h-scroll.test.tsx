import { createRef } from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { HScroll, type HScrollHandle } from './h-scroll';

function getScrollRow(container: HTMLElement): HTMLElement {
  return container.querySelector('.flex.overflow-x-auto') as HTMLElement;
}

describe('<HScroll>', () => {
  it('renders children', () => {
    const { getByText } = render(
      <HScroll>
        <span>alpha</span>
        <span>beta</span>
      </HScroll>,
    );
    expect(getByText('alpha')).toBeInTheDocument();
    expect(getByText('beta')).toBeInTheDocument();
  });

  it('default snap classes are present', () => {
    const { container } = render(
      <HScroll>
        <span>x</span>
      </HScroll>,
    );
    const row = getScrollRow(container);
    expect(row.className).toContain('snap-x');
    expect(row.className).toContain('snap-mandatory');
  });

  it('snap=false omits snap-x', () => {
    const { container } = render(
      <HScroll snap={false}>
        <span>x</span>
      </HScroll>,
    );
    const row = getScrollRow(container);
    expect(row.className).not.toContain('snap-x');
    expect(row.className).not.toContain('snap-mandatory');
  });

  it('gap sm applies gap-2', () => {
    const { container } = render(
      <HScroll gap="sm">
        <span>x</span>
      </HScroll>,
    );
    expect(getScrollRow(container).className).toContain('gap-2');
  });

  it('gap md applies gap-3 (default)', () => {
    const { container } = render(
      <HScroll>
        <span>x</span>
      </HScroll>,
    );
    expect(getScrollRow(container).className).toContain('gap-3');
  });

  it('gap lg applies gap-4', () => {
    const { container } = render(
      <HScroll gap="lg">
        <span>x</span>
      </HScroll>,
    );
    expect(getScrollRow(container).className).toContain('gap-4');
  });

  it('arrows=true renders both arrow buttons with aria-labels', () => {
    const { getByLabelText } = render(
      <HScroll arrows>
        <span>x</span>
      </HScroll>,
    );
    expect(getByLabelText('Scroll left')).toBeInTheDocument();
    expect(getByLabelText('Scroll right')).toBeInTheDocument();
  });

  it('arrows=false renders no arrow buttons', () => {
    const { queryByLabelText } = render(
      <HScroll>
        <span>x</span>
      </HScroll>,
    );
    expect(queryByLabelText('Scroll left')).toBeNull();
    expect(queryByLabelText('Scroll right')).toBeNull();
  });

  it('scrollToIndex calls scrollIntoView on the i-th data-h-scroll-item child', () => {
    const spy = vi.fn();
    const original = Element.prototype.scrollIntoView;
    Element.prototype.scrollIntoView = spy as unknown as typeof Element.prototype.scrollIntoView;
    try {
      const ref = createRef<HScrollHandle>();
      render(
        <HScroll ref={ref}>
          <span data-h-scroll-item>a</span>
          <span data-h-scroll-item id="target">b</span>
          <span data-h-scroll-item>c</span>
        </HScroll>,
      );
      ref.current?.scrollToIndex(1);
      expect(spy).toHaveBeenCalledTimes(1);
      const callCtx = spy.mock.instances[0] as Element;
      expect((callCtx as HTMLElement).id).toBe('target');
    } finally {
      Element.prototype.scrollIntoView = original;
    }
  });

  it('scrollToEl invokes scrollIntoView on the provided element', () => {
    const spy = vi.fn();
    const original = Element.prototype.scrollIntoView;
    Element.prototype.scrollIntoView = spy as unknown as typeof Element.prototype.scrollIntoView;
    try {
      const ref = createRef<HScrollHandle>();
      const { container } = render(
        <HScroll ref={ref}>
          <span data-h-scroll-item>a</span>
          <span data-h-scroll-item>b</span>
        </HScroll>,
      );
      const target = container.querySelectorAll('[data-h-scroll-item]')[0] as HTMLElement;
      ref.current?.scrollToEl(target);
      expect(spy).toHaveBeenCalledTimes(1);
    } finally {
      Element.prototype.scrollIntoView = original;
    }
  });

  it('merges caller className onto outer wrapper', () => {
    const { container } = render(
      <HScroll className="my-row">
        <span>x</span>
      </HScroll>,
    );
    const root = container.firstChild as HTMLElement;
    expect(root).toHaveClass('my-row');
    expect(root.className).toContain('group');
    expect(root.className).toContain('relative');
  });

  it('forwardRef exposes a non-null handle after mount', () => {
    const ref = createRef<HScrollHandle>();
    render(
      <HScroll ref={ref}>
        <span>x</span>
      </HScroll>,
    );
    expect(ref.current).not.toBeNull();
    expect(typeof ref.current?.scrollToIndex).toBe('function');
    expect(typeof ref.current?.scrollToEl).toBe('function');
  });
});
