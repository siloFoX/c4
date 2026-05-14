import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import Spinner from './Spinner';

describe('<Spinner>', () => {
  it('renders a status role with the default Loading aria-label', () => {
    render(<Spinner />);
    const node = screen.getByRole('status');
    expect(node).toHaveAttribute('aria-label', 'Loading');
    expect(node).toHaveAttribute('aria-live', 'polite');
  });

  it('exposes the same label as sr-only text inside the wrapper', () => {
    render(<Spinner />);
    const node = screen.getByRole('status');
    const srOnly = node.querySelector('.sr-only');
    expect(srOnly?.textContent).toBe('Loading');
  });

  it('renders an aria-hidden SVG ring with animate-spin', () => {
    const { container } = render(<Spinner />);
    const ring = container.querySelector('svg.animate-spin');
    expect(ring).not.toBeNull();
    expect(ring).toHaveAttribute('aria-hidden', 'true');
    expect(ring).toHaveAttribute('data-spinner-ring', '');
  });

  it('applies the sm size classes when size="sm"', () => {
    const { container } = render(<Spinner size="sm" />);
    const ring = container.querySelector('[data-spinner-ring]') as Element;
    expect(ring.classList.contains('h-3')).toBe(true);
    expect(ring.classList.contains('w-3')).toBe(true);
  });

  it('applies the md size classes when size="md" (default)', () => {
    const { container } = render(<Spinner />);
    const ring = container.querySelector('[data-spinner-ring]') as Element;
    expect(ring.classList.contains('h-4')).toBe(true);
    expect(ring.classList.contains('w-4')).toBe(true);
  });

  it('applies the lg size classes when size="lg"', () => {
    const { container } = render(<Spinner size="lg" />);
    const ring = container.querySelector('[data-spinner-ring]') as Element;
    expect(ring.classList.contains('h-6')).toBe(true);
    expect(ring.classList.contains('w-6')).toBe(true);
  });

  it('overrides the aria-label and sr-only text when label is set', () => {
    render(<Spinner label="Fetching data" />);
    const node = screen.getByRole('status');
    expect(node).toHaveAttribute('aria-label', 'Fetching data');
    expect(node.querySelector('.sr-only')?.textContent).toBe('Fetching data');
  });

  it('merges caller className onto the wrapper without dropping defaults', () => {
    render(<Spinner className="text-blue-500 my-custom" />);
    const node = screen.getByRole('status');
    expect(node).toHaveClass('text-blue-500');
    expect(node).toHaveClass('my-custom');
    expect(node).toHaveClass('inline-flex');
  });

  it('forwards arbitrary HTML attributes to the wrapper span (data-*, id)', () => {
    render(<Spinner data-testid="spin-1" id="sp1" />);
    const node = screen.getByTestId('spin-1');
    expect(node).toHaveAttribute('id', 'sp1');
    expect(node).toHaveAttribute('role', 'status');
  });

  it('uses currentColor on the SVG stroke so it inherits text color', () => {
    const { container } = render(<Spinner />);
    const ring = container.querySelector('[data-spinner-ring]') as SVGElement;
    expect(ring.getAttribute('stroke')).toBe('currentColor');
    expect(ring.getAttribute('fill')).toBe('none');
  });
});
