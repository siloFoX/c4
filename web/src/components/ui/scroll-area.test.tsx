import { createRef } from 'react';
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { ScrollArea } from './scroll-area';

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
});
