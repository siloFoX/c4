import { createRef } from 'react';
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import {
  AspectRatio,
  ratioToPaddingBottom,
  supportsAspectRatio,
  __resetAspectRatioSupportCache,
} from './aspect-ratio';

afterEach(() => {
  __resetAspectRatioSupportCache();
});

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

  // -- v1.11.401 intrinsic-sizing fallback (TODO 11.383) ----------

  describe('ratioToPaddingBottom()', () => {
    it('converts 16:9 to 56.25%', () => {
      expect(ratioToPaddingBottom('16:9')).toBe('56.25%');
    });

    it('converts 4:3 to ~75%', () => {
      expect(ratioToPaddingBottom('4:3')).toBe('75%');
    });

    it('converts 1:1 to 100%', () => {
      expect(ratioToPaddingBottom('1:1')).toBe('100%');
    });

    it('converts 21:9 to ~42.857%', () => {
      expect(ratioToPaddingBottom('21:9')).toBe('42.857%');
    });

    it('numeric ratio computes the inverse percent', () => {
      // ratio=2 -> width is 2x height -> padding-bottom 50%
      expect(ratioToPaddingBottom(2)).toBe('50%');
      // ratio=4 -> 25%
      expect(ratioToPaddingBottom(4)).toBe('25%');
    });

    it('falls back to 16:9 (56.25%) for invalid input', () => {
      expect(ratioToPaddingBottom(undefined)).toBe('56.25%');
      expect(ratioToPaddingBottom(0)).toBe('56.25%');
      expect(ratioToPaddingBottom(-1)).toBe('56.25%');
      expect(ratioToPaddingBottom(NaN)).toBe('56.25%');
    });
  });

  describe('supportsAspectRatio()', () => {
    it('returns a boolean', () => {
      expect(typeof supportsAspectRatio()).toBe('boolean');
    });

    it('caches the result across calls', () => {
      const first = supportsAspectRatio();
      const second = supportsAspectRatio();
      expect(first).toBe(second);
    });
  });

  describe('forceFallback prop', () => {
    it('renders the padding-bottom path with no aspect-ratio CSS', () => {
      const { container } = render(
        <AspectRatio ratio="16:9" forceFallback>
          <span>x</span>
        </AspectRatio>,
      );
      const wrapper = container.querySelector(
        '[data-section="aspect-ratio"]',
      ) as HTMLElement;
      expect(wrapper.style.paddingBottom).toBe('56.25%');
      expect(wrapper.style.aspectRatio).toBe('');
      expect(wrapper.getAttribute('data-fallback')).toBe('true');
    });

    it('forceFallback uses the matching percent per preset', () => {
      const { container, rerender } = render(
        <AspectRatio ratio="4:3" forceFallback>
          <span>x</span>
        </AspectRatio>,
      );
      let wrapper = container.querySelector(
        '[data-section="aspect-ratio"]',
      ) as HTMLElement;
      expect(wrapper.style.paddingBottom).toBe('75%');
      rerender(
        <AspectRatio ratio="1:1" forceFallback>
          <span>x</span>
        </AspectRatio>,
      );
      wrapper = container.querySelector(
        '[data-section="aspect-ratio"]',
      ) as HTMLElement;
      expect(wrapper.style.paddingBottom).toBe('100%');
    });

    it('numeric ratio under forceFallback computes the percent', () => {
      const { container } = render(
        <AspectRatio ratio={2} forceFallback>
          <span>x</span>
        </AspectRatio>,
      );
      const wrapper = container.querySelector(
        '[data-section="aspect-ratio"]',
      ) as HTMLElement;
      expect(wrapper.style.paddingBottom).toBe('50%');
    });

    it('forceFallback content slot still positions absolutely', () => {
      const { container } = render(
        <AspectRatio forceFallback>
          <span data-testid="inner">x</span>
        </AspectRatio>,
      );
      const content = container.querySelector(
        '[data-section="aspect-ratio-content"]',
      );
      expect(content!.className).toContain('absolute');
      expect(content!.className).toContain('inset-0');
    });

    it('default (no forceFallback) uses aspect-ratio CSS when supported', () => {
      // jsdom supports `aspectRatio` on the style object, so
      // supportsAspectRatio() should return true and the
      // modern path renders.
      const { container } = render(
        <AspectRatio ratio="16:9">
          <span>x</span>
        </AspectRatio>,
      );
      const wrapper = container.querySelector(
        '[data-section="aspect-ratio"]',
      ) as HTMLElement;
      // Either aspect-ratio is set (modern) or padding-bottom is
      // set (fallback). On jsdom the modern path is expected.
      const usedModern = wrapper.style.aspectRatio !== '';
      const usedFallback = wrapper.style.paddingBottom !== '';
      expect(usedModern || usedFallback).toBe(true);
      // data-fallback mirrors which path rendered.
      const fallbackAttr = wrapper.getAttribute('data-fallback');
      if (usedModern) {
        expect(fallbackAttr).toBe('false');
      } else {
        expect(fallbackAttr).toBe('true');
      }
    });

    it('data-fallback attr mirrors the resolved path', () => {
      const { container } = render(
        <AspectRatio forceFallback>
          <span>x</span>
        </AspectRatio>,
      );
      const wrapper = container.querySelector(
        '[data-section="aspect-ratio"]',
      ) as HTMLElement;
      expect(wrapper.getAttribute('data-fallback')).toBe('true');
    });
  });
});
