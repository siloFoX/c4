import { describe, it, expect } from 'vitest';
import { createRef } from 'react';
import { render, screen } from '@testing-library/react';
import { Navbar } from './navbar';

describe('<Navbar>', () => {
  it('renders the brand slot content', () => {
    render(<Navbar brand={<span>brand-mark</span>} />);
    expect(screen.getByText('brand-mark')).toBeInTheDocument();
  });

  it('renders the center slot content', () => {
    render(<Navbar center={<span>center-slot</span>} />);
    expect(screen.getByText('center-slot')).toBeInTheDocument();
  });

  it('renders the actions slot content', () => {
    render(<Navbar actions={<button type="button">action-btn</button>} />);
    expect(
      screen.getByRole('button', { name: 'action-btn' }),
    ).toBeInTheDocument();
  });

  it('exposes the outer header as role=banner', () => {
    render(<Navbar brand={<span>b</span>} />);
    expect(screen.getByRole('banner')).toBeInTheDocument();
  });

  it('exposes the inner nav as role=navigation', () => {
    render(<Navbar brand={<span>b</span>} />);
    expect(screen.getByRole('navigation')).toBeInTheDocument();
  });

  it('applies the sticky positioning classes when sticky=true', () => {
    const { container } = render(<Navbar sticky brand={<span>b</span>} />);
    const header = container.querySelector('header');
    expect(header).not.toBeNull();
    expect(header).toHaveClass('sticky');
    expect(header).toHaveClass('top-0');
    expect(header).toHaveClass('z-30');
    expect(header).toHaveClass('backdrop-blur');
  });

  it('omits sticky classes when sticky is false (default)', () => {
    const { container } = render(<Navbar brand={<span>b</span>} />);
    const header = container.querySelector('header');
    expect(header).not.toHaveClass('sticky');
    expect(header).not.toHaveClass('z-30');
    expect(header).not.toHaveClass('backdrop-blur');
  });

  it("applies border-b for variant='bordered'", () => {
    const { container } = render(
      <Navbar variant="bordered" brand={<span>b</span>} />,
    );
    const header = container.querySelector('header');
    expect(header).toHaveClass('border-b');
    expect(header).toHaveClass('border-border');
  });

  it("applies shadow-sm for variant='elevated'", () => {
    const { container } = render(
      <Navbar variant="elevated" brand={<span>b</span>} />,
    );
    const header = container.querySelector('header');
    expect(header).toHaveClass('shadow-sm');
    expect(header).not.toHaveClass('border-b');
  });

  it("plain variant adds neither border nor shadow", () => {
    const { container } = render(
      <Navbar variant="plain" brand={<span>b</span>} />,
    );
    const header = container.querySelector('header');
    expect(header).not.toHaveClass('border-b');
    expect(header).not.toHaveClass('shadow-sm');
  });

  it('merges className onto the outer header element', () => {
    const { container } = render(
      <Navbar className="custom-outer" brand={<span>b</span>} />,
    );
    const header = container.querySelector('header');
    expect(header).toHaveClass('custom-outer');
  });

  it('merges innerClassName onto the inner nav container', () => {
    render(<Navbar innerClassName="custom-inner" brand={<span>b</span>} />);
    const nav = screen.getByRole('navigation');
    expect(nav).toHaveClass('custom-inner');
  });

  it('forwards the ref to the outer header element', () => {
    const ref = createRef<HTMLElement>();
    render(<Navbar ref={ref} brand={<span>b</span>} />);
    expect(ref.current).not.toBeNull();
    expect(ref.current?.tagName).toBe('HEADER');
  });

  it('exposes a stable displayName', () => {
    expect(Navbar.displayName).toBe('Navbar');
  });

  it('renders all three slots together in a single Navbar', () => {
    render(
      <Navbar
        brand={<span>B</span>}
        center={<span>C</span>}
        actions={<span>A</span>}
      />,
    );
    expect(screen.getByText('B')).toBeInTheDocument();
    expect(screen.getByText('C')).toBeInTheDocument();
    expect(screen.getByText('A')).toBeInTheDocument();
  });
});
