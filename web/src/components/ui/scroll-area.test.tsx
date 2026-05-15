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
});
