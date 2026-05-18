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

  // -- v1.11.399 spacing scale + data attrs (TODO 11.381) --------

  it('default spacing="none" adds no margin classes', () => {
    const { container } = render(<Separator />);
    const node = container.firstChild as HTMLElement;
    expect(node.className).not.toContain('my-1');
    expect(node.className).not.toContain('my-2');
    expect(node.className).not.toContain('my-4');
    expect(node.getAttribute('data-spacing')).toBe('none');
  });

  it('spacing="sm" horizontal applies my-1', () => {
    const { container } = render(<Separator spacing="sm" />);
    const node = container.firstChild as HTMLElement;
    expect(node.className).toContain('my-1');
    expect(node.getAttribute('data-spacing')).toBe('sm');
  });

  it('spacing="md" horizontal applies my-2', () => {
    const { container } = render(<Separator spacing="md" />);
    const node = container.firstChild as HTMLElement;
    expect(node.className).toContain('my-2');
  });

  it('spacing="lg" horizontal applies my-4', () => {
    const { container } = render(<Separator spacing="lg" />);
    const node = container.firstChild as HTMLElement;
    expect(node.className).toContain('my-4');
  });

  it('spacing on vertical orientation applies mx-N', () => {
    const { container, rerender } = render(
      <Separator orientation="vertical" spacing="sm" />,
    );
    let node = container.firstChild as HTMLElement;
    expect(node.className).toContain('mx-1');
    expect(node.className).not.toContain('my-1');
    rerender(<Separator orientation="vertical" spacing="lg" />);
    node = container.firstChild as HTMLElement;
    expect(node.className).toContain('mx-4');
  });

  it('spacing applies to the label variant container as my-N', () => {
    const { container } = render(
      <Separator label="OR" spacing="md" />,
    );
    const node = container.firstChild as HTMLElement;
    expect(node.className).toContain('my-2');
  });

  it('data-section="separator" + data-orientation + data-weight on the root', () => {
    const { container } = render(
      <Separator orientation="vertical" weight="thick" />,
    );
    const node = container.firstChild as HTMLElement;
    expect(node.getAttribute('data-section')).toBe('separator');
    expect(node.getAttribute('data-orientation')).toBe('vertical');
    expect(node.getAttribute('data-weight')).toBe('thick');
  });

  it('label variant exposes data-section="separator-label" on the label span', () => {
    const { container } = render(<Separator label="OR" />);
    const label = container.querySelector(
      '[data-section="separator-label"]',
    );
    expect(label).toHaveTextContent('OR');
  });

  it('data-spacing attr mirrors the spacing prop', () => {
    const { container, rerender } = render(<Separator />);
    expect(
      (container.firstChild as HTMLElement).getAttribute('data-spacing'),
    ).toBe('none');
    rerender(<Separator spacing="lg" />);
    expect(
      (container.firstChild as HTMLElement).getAttribute('data-spacing'),
    ).toBe('lg');
  });
});
