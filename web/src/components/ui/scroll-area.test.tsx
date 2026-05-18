import { createRef } from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { ScrollArea, type ScrollAreaPosition } from './scroll-area';

describe('<ScrollArea>', () => {
  it('renders children', () => {
    const { getByText } = render(
      <ScrollArea>
        <span>hello</span>
      </ScrollArea>,
    );
    expect(getByText('hello')).toBeInTheDocument();
  });

  it('applies maxHeight numeric prop as pixel style', () => {
    const { container } = render(<ScrollArea maxHeight={200}>x</ScrollArea>);
    const wrapper = container.firstChild as HTMLElement;
    expect(wrapper.style.maxHeight).toBe('200px');
  });

  it('applies maxHeight string prop verbatim', () => {
    const { container } = render(<ScrollArea maxHeight="50vh">x</ScrollArea>);
    const wrapper = container.firstChild as HTMLElement;
    expect(wrapper.style.maxHeight).toBe('50vh');
  });

  it('applies height numeric prop as pixel style', () => {
    const { container } = render(<ScrollArea height={120}>x</ScrollArea>);
    const wrapper = container.firstChild as HTMLElement;
    expect(wrapper.style.height).toBe('120px');
  });

  it('defaults to axis=y with overflow-y-auto + overflow-x-hidden', () => {
    const { container } = render(<ScrollArea>x</ScrollArea>);
    const wrapper = container.firstChild as HTMLElement;
    expect(wrapper.className).toContain('overflow-y-auto');
    expect(wrapper.className).toContain('overflow-x-hidden');
  });

  it("axis='x' sets overflow-x-auto + overflow-y-hidden", () => {
    const { container } = render(<ScrollArea axis="x">x</ScrollArea>);
    const wrapper = container.firstChild as HTMLElement;
    expect(wrapper.className).toContain('overflow-x-auto');
    expect(wrapper.className).toContain('overflow-y-hidden');
  });

  it("axis='both' sets overflow-auto", () => {
    const { container } = render(<ScrollArea axis="both">x</ScrollArea>);
    const wrapper = container.firstChild as HTMLElement;
    expect(wrapper.className).toContain('overflow-auto');
    expect(wrapper.className).not.toContain('overflow-y-auto');
    expect(wrapper.className).not.toContain('overflow-x-auto');
  });

  it('forwards ref to the scroll container', () => {
    const ref = createRef<HTMLDivElement>();
    render(<ScrollArea ref={ref}>x</ScrollArea>);
    expect(ref.current).toBeInstanceOf(HTMLDivElement);
  });

  it('merges caller className', () => {
    const { container } = render(<ScrollArea className="my-scroll">x</ScrollArea>);
    const wrapper = container.firstChild as HTMLElement;
    expect(wrapper).toHaveClass('my-scroll');
    expect(wrapper.className).toContain('c4-scroll');
  });

  it('includes the c4-scroll default class', () => {
    const { container } = render(<ScrollArea>x</ScrollArea>);
    const wrapper = container.firstChild as HTMLElement;
    expect(wrapper.className).toContain('c4-scroll');
  });

  it('merges caller inline style with size props', () => {
    const { container } = render(
      <ScrollArea maxHeight={100} style={{ background: 'red' }}>
        x
      </ScrollArea>,
    );
    const wrapper = container.firstChild as HTMLElement;
    expect(wrapper.style.maxHeight).toBe('100px');
    expect(wrapper.style.background).toBe('red');
  });

  it('passes through arbitrary HTML attributes (role, aria-label)', () => {
    const { container } = render(
      <ScrollArea role="log" aria-label="messages">
        x
      </ScrollArea>,
    );
    const wrapper = container.firstChild as HTMLElement;
    expect(wrapper).toHaveAttribute('role', 'log');
    expect(wrapper).toHaveAttribute('aria-label', 'messages');
  });

  it('omits maxHeight / height styles when neither prop is set', () => {
    const { container } = render(<ScrollArea>x</ScrollArea>);
    const wrapper = container.firstChild as HTMLElement;
    expect(wrapper.style.maxHeight).toBe('');
    expect(wrapper.style.height).toBe('');
  });

  // -- v1.11.245 responsive scrollbar (TODO 11.227) -----------------

  it("size='auto' (default) emits no explicit size modifier class", () => {
    const { container } = render(<ScrollArea>x</ScrollArea>);
    const wrapper = container.firstChild as HTMLElement;
    expect(wrapper).toHaveAttribute('data-scrollarea-size', 'auto');
    expect(wrapper.className).not.toContain('c4-scroll-thin');
    expect(wrapper.className).not.toContain('c4-scroll-default');
    expect(wrapper.className).not.toContain('c4-scroll-wide');
  });

  it("size='thin' applies the c4-scroll-thin modifier", () => {
    const { container } = render(<ScrollArea size="thin">x</ScrollArea>);
    const wrapper = container.firstChild as HTMLElement;
    expect(wrapper.className).toContain('c4-scroll');
    expect(wrapper.className).toContain('c4-scroll-thin');
    expect(wrapper).toHaveAttribute('data-scrollarea-size', 'thin');
  });

  it("size='default' applies the c4-scroll-default modifier", () => {
    const { container } = render(<ScrollArea size="default">x</ScrollArea>);
    const wrapper = container.firstChild as HTMLElement;
    expect(wrapper.className).toContain('c4-scroll-default');
    expect(wrapper).toHaveAttribute('data-scrollarea-size', 'default');
  });

  it("size='wide' applies the c4-scroll-wide modifier", () => {
    const { container } = render(<ScrollArea size="wide">x</ScrollArea>);
    const wrapper = container.firstChild as HTMLElement;
    expect(wrapper.className).toContain('c4-scroll-wide');
    expect(wrapper).toHaveAttribute('data-scrollarea-size', 'wide');
  });

  it('safeArea=true adds the c4-scroll-safe-area class + data attribute', () => {
    const { container } = render(<ScrollArea safeArea>x</ScrollArea>);
    const wrapper = container.firstChild as HTMLElement;
    expect(wrapper.className).toContain('c4-scroll-safe-area');
    expect(wrapper.getAttribute('data-scrollarea-safe-area')).toBe('');
  });

  it('safeArea=false (default) omits the safe-area class + attribute', () => {
    const { container } = render(<ScrollArea>x</ScrollArea>);
    const wrapper = container.firstChild as HTMLElement;
    expect(wrapper.className).not.toContain('c4-scroll-safe-area');
    expect(wrapper.hasAttribute('data-scrollarea-safe-area')).toBe(false);
  });

  it('size + safeArea compose with existing axis + className', () => {
    const { container } = render(
      <ScrollArea axis="x" size="wide" safeArea className="my-scroll">
        x
      </ScrollArea>,
    );
    const wrapper = container.firstChild as HTMLElement;
    expect(wrapper.className).toContain('overflow-x-auto');
    expect(wrapper.className).toContain('c4-scroll-wide');
    expect(wrapper.className).toContain('c4-scroll-safe-area');
    expect(wrapper.className).toContain('my-scroll');
  });

  // (v1.11.315, TODO 11.297) New shadow indicator prop +
  // data-section selectors.

  describe('shadows', () => {
    it('shadows=false (default) renders the same single div', () => {
      const { container } = render(<ScrollArea>body</ScrollArea>);
      const wrapper = container.firstChild as HTMLElement;
      expect(wrapper.classList.contains('c4-scroll')).toBe(true);
      expect(wrapper.getAttribute('data-shadows')).toBe('false');
      expect(
        container.querySelector('[data-section="scroll-area-shadow-root"]'),
      ).toBeNull();
    });

    it('shadows=true wraps the scrollable surface in a shadow-root container', () => {
      const { container } = render(
        <ScrollArea shadows>body</ScrollArea>,
      );
      expect(
        container.querySelector('[data-section="scroll-area-shadow-root"]'),
      ).not.toBeNull();
      const scroller = container.querySelector(
        '[data-section="scroll-area"]',
      ) as HTMLElement;
      expect(scroller.getAttribute('data-shadows')).toBe('true');
    });

    it('shadows=true mounts the top + bottom shadow overlays', () => {
      const { container } = render(
        <ScrollArea shadows>body</ScrollArea>,
      );
      expect(
        container.querySelector('[data-section="scroll-area-shadow-top"]'),
      ).not.toBeNull();
      expect(
        container.querySelector('[data-section="scroll-area-shadow-bottom"]'),
      ).not.toBeNull();
    });

    it('non-overflowing content keeps data-at-top + data-at-bottom both true', () => {
      const { container } = render(
        <ScrollArea shadows>body</ScrollArea>,
      );
      const root = container.querySelector(
        '[data-section="scroll-area-shadow-root"]',
      ) as HTMLElement;
      // jsdom has scrollHeight == clientHeight by default for
      // empty content; the surface is treated as non-overflowing
      // so both flags read as true.
      expect(root.getAttribute('data-at-top')).toBe('true');
      expect(root.getAttribute('data-at-bottom')).toBe('true');
    });

    it('top shadow overlay is hidden via opacity-0 when at top', () => {
      const { container } = render(
        <ScrollArea shadows>body</ScrollArea>,
      );
      const topShadow = container.querySelector(
        '[data-section="scroll-area-shadow-top"]',
      ) as HTMLElement;
      expect(topShadow.className).toContain('opacity-0');
    });

    it('bottom shadow overlay is hidden via opacity-0 when at bottom', () => {
      const { container } = render(
        <ScrollArea shadows>body</ScrollArea>,
      );
      const bottomShadow = container.querySelector(
        '[data-section="scroll-area-shadow-bottom"]',
      ) as HTMLElement;
      expect(bottomShadow.className).toContain('opacity-0');
    });

    it('overlay shadows have pointer-events-none + aria-hidden', () => {
      const { container } = render(
        <ScrollArea shadows>body</ScrollArea>,
      );
      const topShadow = container.querySelector(
        '[data-section="scroll-area-shadow-top"]',
      ) as HTMLElement;
      expect(topShadow.className).toContain('pointer-events-none');
      expect(topShadow.getAttribute('aria-hidden')).toBe('true');
    });
  });

  describe('data-section selector', () => {
    it('exposes data-section="scroll-area" on the scrollable surface', () => {
      const { container } = render(<ScrollArea>body</ScrollArea>);
      expect(
        container.querySelector('[data-section="scroll-area"]'),
      ).not.toBeNull();
    });
  });

  // -- v1.11.400 max-height presets + position tracking (TODO 11.382) --

  describe('snapshotScrollPosition()', () => {
    it('returns full snapshot for non-overflowing element (all "at" flags true)', async () => {
      const mod = await import('./scroll-area');
      const el = document.createElement('div');
      Object.defineProperty(el, 'scrollHeight', { configurable: true, value: 100 });
      Object.defineProperty(el, 'clientHeight', { configurable: true, value: 100 });
      Object.defineProperty(el, 'scrollWidth', { configurable: true, value: 200 });
      Object.defineProperty(el, 'clientWidth', { configurable: true, value: 200 });
      Object.defineProperty(el, 'scrollTop', { configurable: true, value: 0 });
      Object.defineProperty(el, 'scrollLeft', { configurable: true, value: 0 });
      const pos = mod.snapshotScrollPosition(el);
      expect(pos.atTop).toBe(true);
      expect(pos.atBottom).toBe(true);
      expect(pos.atLeft).toBe(true);
      expect(pos.atRight).toBe(true);
      expect(pos.scrollTop).toBe(0);
    });

    it('flips atTop / atBottom when scrolled mid-content', async () => {
      const mod = await import('./scroll-area');
      const el = document.createElement('div');
      Object.defineProperty(el, 'scrollHeight', { configurable: true, value: 1000 });
      Object.defineProperty(el, 'clientHeight', { configurable: true, value: 200 });
      Object.defineProperty(el, 'scrollWidth', { configurable: true, value: 200 });
      Object.defineProperty(el, 'clientWidth', { configurable: true, value: 200 });
      Object.defineProperty(el, 'scrollTop', { configurable: true, value: 50 });
      Object.defineProperty(el, 'scrollLeft', { configurable: true, value: 0 });
      const pos = mod.snapshotScrollPosition(el);
      expect(pos.atTop).toBe(false);
      expect(pos.atBottom).toBe(false);
      expect(pos.scrollTop).toBe(50);
    });

    it('flips atBottom=true when scrolled to the bottom edge', async () => {
      const mod = await import('./scroll-area');
      const el = document.createElement('div');
      Object.defineProperty(el, 'scrollHeight', { configurable: true, value: 1000 });
      Object.defineProperty(el, 'clientHeight', { configurable: true, value: 200 });
      Object.defineProperty(el, 'scrollWidth', { configurable: true, value: 200 });
      Object.defineProperty(el, 'clientWidth', { configurable: true, value: 200 });
      Object.defineProperty(el, 'scrollTop', { configurable: true, value: 800 });
      Object.defineProperty(el, 'scrollLeft', { configurable: true, value: 0 });
      const pos = mod.snapshotScrollPosition(el);
      expect(pos.atBottom).toBe(true);
      expect(pos.atTop).toBe(false);
    });
  });

  describe('maxHeightPreset', () => {
    it('exposes SCROLL_AREA_MAX_HEIGHT_PRESET map for sm/md/lg/xl/screen', async () => {
      const mod = await import('./scroll-area');
      expect(mod.SCROLL_AREA_MAX_HEIGHT_PRESET.sm).toBe('16rem');
      expect(mod.SCROLL_AREA_MAX_HEIGHT_PRESET.md).toBe('24rem');
      expect(mod.SCROLL_AREA_MAX_HEIGHT_PRESET.lg).toBe('32rem');
      expect(mod.SCROLL_AREA_MAX_HEIGHT_PRESET.xl).toBe('48rem');
      expect(mod.SCROLL_AREA_MAX_HEIGHT_PRESET.screen).toBe('100vh');
    });

    it('resolves to the matching CSS value on style.maxHeight', () => {
      const { container } = render(
        <ScrollArea maxHeightPreset="md">body</ScrollArea>,
      );
      const surface = container.querySelector(
        '[data-section="scroll-area"]',
      ) as HTMLElement;
      expect(surface.style.maxHeight).toBe('24rem');
    });

    it('exposes data-max-height-preset attr for the surface', () => {
      const { container } = render(
        <ScrollArea maxHeightPreset="lg">body</ScrollArea>,
      );
      const surface = container.querySelector(
        '[data-section="scroll-area"]',
      ) as HTMLElement;
      expect(surface.getAttribute('data-max-height-preset')).toBe('lg');
    });

    it('freeform maxHeight wins over the preset', () => {
      const { container } = render(
        <ScrollArea maxHeight={500} maxHeightPreset="lg">body</ScrollArea>,
      );
      const surface = container.querySelector(
        '[data-section="scroll-area"]',
      ) as HTMLElement;
      expect(surface.style.maxHeight).toBe('500px');
    });

    it('omits data-max-height-preset when no preset is supplied', () => {
      const { container } = render(<ScrollArea>body</ScrollArea>);
      const surface = container.querySelector(
        '[data-section="scroll-area"]',
      ) as HTMLElement;
      expect(surface.getAttribute('data-max-height-preset')).toBeNull();
    });
  });

  describe('onScrollPositionChange callback', () => {
    it('fires once on mount with the initial snapshot', () => {
      const onChange = vi.fn();
      render(
        <ScrollArea onScrollPositionChange={onChange}>body</ScrollArea>,
      );
      expect(onChange).toHaveBeenCalled();
      const pos = onChange.mock.calls[0]![0] as ScrollAreaPosition;
      expect(typeof pos.scrollTop).toBe('number');
      expect(typeof pos.scrollHeight).toBe('number');
      expect(typeof pos.atTop).toBe('boolean');
    });

    it('fires again when the surface dispatches a scroll event', () => {
      const onChange = vi.fn();
      const { container } = render(
        <ScrollArea onScrollPositionChange={onChange}>body</ScrollArea>,
      );
      onChange.mockClear();
      const surface = container.querySelector(
        '[data-section="scroll-area"]',
      ) as HTMLElement;
      surface.dispatchEvent(new Event('scroll'));
      expect(onChange).toHaveBeenCalled();
    });

    it('cleans up the scroll listener on unmount', () => {
      const onChange = vi.fn();
      const { container, unmount } = render(
        <ScrollArea onScrollPositionChange={onChange}>body</ScrollArea>,
      );
      const surface = container.querySelector(
        '[data-section="scroll-area"]',
      ) as HTMLElement;
      onChange.mockClear();
      unmount();
      surface.dispatchEvent(new Event('scroll'));
      expect(onChange).not.toHaveBeenCalled();
    });

    it('snapshot carries pre-computed at-edge flags', () => {
      const onChange = vi.fn();
      render(
        <ScrollArea onScrollPositionChange={onChange}>body</ScrollArea>,
      );
      const pos = onChange.mock.calls[0]![0] as ScrollAreaPosition;
      // jsdom returns zero dimensions -> non-overflowing -> all flags true.
      expect(pos.atTop).toBe(true);
      expect(pos.atBottom).toBe(true);
      expect(pos.atLeft).toBe(true);
      expect(pos.atRight).toBe(true);
    });
  });

  describe('data-axis attr', () => {
    it('mirrors the axis prop', () => {
      const { container, rerender } = render(<ScrollArea>body</ScrollArea>);
      let surface = container.querySelector(
        '[data-section="scroll-area"]',
      ) as HTMLElement;
      expect(surface.getAttribute('data-axis')).toBe('y');
      rerender(<ScrollArea axis="x">body</ScrollArea>);
      surface = container.querySelector(
        '[data-section="scroll-area"]',
      ) as HTMLElement;
      expect(surface.getAttribute('data-axis')).toBe('x');
      rerender(<ScrollArea axis="both">body</ScrollArea>);
      surface = container.querySelector(
        '[data-section="scroll-area"]',
      ) as HTMLElement;
      expect(surface.getAttribute('data-axis')).toBe('both');
    });
  });
});
