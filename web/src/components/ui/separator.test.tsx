import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Separator } from './separator';

describe('<Separator>', () => {
  it('renders horizontal by default with the thin top-border class', () => {
    render(<Separator data-testid="s" />);
    const node = screen.getByTestId('s');
    expect(node).toBeInTheDocument();
    expect(node.className).toContain('border-t');
    expect(node.className).not.toContain('border-t-2');
    expect(node.className).toContain('border-border');
  });

  it('vertical orientation uses a left border and self-stretch (no top border)', () => {
    render(<Separator data-testid="s" orientation="vertical" />);
    const node = screen.getByTestId('s');
    expect(node.className).toContain('border-l');
    expect(node.className).toContain('self-stretch');
    expect(node.className).not.toContain('border-t');
  });

  it('thick weight upgrades the border to 2px', () => {
    render(<Separator data-testid="s" weight="thick" />);
    expect(screen.getByTestId('s').className).toContain('border-t-2');
  });

  it('thick vertical weight uses border-l-2', () => {
    render(<Separator data-testid="s" orientation="vertical" weight="thick" />);
    expect(screen.getByTestId('s').className).toContain('border-l-2');
  });

  it('renders the label text when a label is passed (horizontal)', () => {
    render(<Separator label="OR" />);
    expect(screen.getByText('OR')).toBeInTheDocument();
  });

  it('omits any label slot when no label is passed', () => {
    const { container } = render(<Separator />);
    expect(container.querySelector('[data-slot="label"]')).toBeNull();
  });

  it('decorative=true (default) sets role=none and omits aria-orientation', () => {
    render(<Separator data-testid="s" />);
    const node = screen.getByTestId('s');
    expect(node).toHaveAttribute('role', 'none');
    expect(node).not.toHaveAttribute('aria-orientation');
  });

  it('decorative=false sets role=separator + aria-orientation', () => {
    render(<Separator data-testid="s" decorative={false} orientation="vertical" />);
    const node = screen.getByTestId('s');
    expect(node).toHaveAttribute('role', 'separator');
    expect(node).toHaveAttribute('aria-orientation', 'vertical');
  });

  it('merges caller-provided className with the variant classes', () => {
    render(<Separator data-testid="s" className="my-4 custom-x" />);
    const node = screen.getByTestId('s');
    expect(node.className).toContain('custom-x');
    expect(node.className).toContain('my-4');
    expect(node.className).toContain('border-t');
  });

  it('label variant renders two aria-hidden line segments around the label', () => {
    const { container } = render(<Separator label="OR" />);
    const hiddenLines = container.querySelectorAll('[aria-hidden="true"]');
    expect(hiddenLines.length).toBe(2);
    hiddenLines.forEach((el) => {
      expect(el.className).toContain('border-t');
      expect(el.className).toContain('flex-1');
    });
  });
});
