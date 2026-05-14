import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Progress } from './progress';

describe('<Progress>', () => {
  it('sets aria-valuenow / valuemin / valuemax when value is provided', () => {
    render(<Progress value={42} max={100} data-testid="p" />);
    const bar = screen.getByRole('progressbar');
    expect(bar).toHaveAttribute('aria-valuenow', '42');
    expect(bar).toHaveAttribute('aria-valuemin', '0');
    expect(bar).toHaveAttribute('aria-valuemax', '100');
  });

  it('defaults aria-valuemax to 100 when max not provided', () => {
    render(<Progress value={10} />);
    const bar = screen.getByRole('progressbar');
    expect(bar).toHaveAttribute('aria-valuemax', '100');
  });

  it('respects a custom max', () => {
    render(<Progress value={5} max={20} />);
    const bar = screen.getByRole('progressbar');
    expect(bar).toHaveAttribute('aria-valuemax', '20');
    expect(bar).toHaveAttribute('aria-valuenow', '5');
  });

  it('omits aria-valuenow when indeterminate', () => {
    render(<Progress indeterminate />);
    const bar = screen.getByRole('progressbar');
    expect(bar).not.toHaveAttribute('aria-valuenow');
    expect(bar).toHaveAttribute('aria-valuemin', '0');
    expect(bar).toHaveAttribute('aria-valuemax', '100');
  });

  it('still renders role=progressbar when indeterminate', () => {
    render(<Progress indeterminate />);
    expect(screen.getByRole('progressbar')).toBeInTheDocument();
  });

  it('applies an animated stripe class in indeterminate mode', () => {
    const { container } = render(<Progress indeterminate />);
    const stripe = container.querySelector('[data-progress-indeterminate="true"]');
    expect(stripe).not.toBeNull();
    expect(stripe?.className).toContain('animate-pulse');
  });

  it('renders the percent label when label + value are set', () => {
    render(<Progress value={37} label />);
    expect(screen.getByText('37%')).toBeInTheDocument();
  });

  it('rounds the percent label to the nearest integer', () => {
    render(<Progress value={33} max={100} label />);
    expect(screen.getByText('33%')).toBeInTheDocument();
  });

  it('renders "Working..." label when indeterminate + label', () => {
    render(<Progress indeterminate label />);
    expect(screen.getByText('Working...')).toBeInTheDocument();
  });

  it('omits the label slot when label is false', () => {
    const { container } = render(<Progress value={50} />);
    expect(container.querySelector('[data-progress-label="true"]')).toBeNull();
  });

  it('applies the default (primary) variant bg class', () => {
    const { container } = render(<Progress value={50} />);
    const fill = container.querySelector('[data-progress-fill="true"]') as HTMLElement;
    expect(fill.className).toContain('bg-primary');
  });

  it('applies the success variant bg class', () => {
    const { container } = render(<Progress value={50} variant="success" />);
    const fill = container.querySelector('[data-progress-fill="true"]') as HTMLElement;
    expect(fill.className).toContain('bg-success');
  });

  it('applies the warning variant bg class', () => {
    const { container } = render(<Progress value={50} variant="warning" />);
    const fill = container.querySelector('[data-progress-fill="true"]') as HTMLElement;
    expect(fill.className).toContain('bg-warning');
  });

  it('applies the destructive variant bg class', () => {
    const { container } = render(<Progress value={50} variant="destructive" />);
    const fill = container.querySelector('[data-progress-fill="true"]') as HTMLElement;
    expect(fill.className).toContain('bg-destructive');
  });

  it('applies variant class to the indeterminate stripe too', () => {
    const { container } = render(<Progress indeterminate variant="warning" />);
    const stripe = container.querySelector('[data-progress-indeterminate="true"]') as HTMLElement;
    expect(stripe.className).toContain('bg-warning');
  });

  it('passes through caller className on the wrapper', () => {
    const { container } = render(<Progress value={10} className="my-progress" />);
    const wrapper = container.firstChild as HTMLElement;
    expect(wrapper).toHaveClass('my-progress');
  });

  it('clamps values above max to 100%', () => {
    const { container } = render(<Progress value={200} max={100} />);
    const fill = container.querySelector('[data-progress-fill="true"]') as HTMLElement;
    expect(fill.style.width).toBe('100%');
  });

  it('clamps negative values to 0%', () => {
    const { container } = render(<Progress value={-5} max={100} />);
    const fill = container.querySelector('[data-progress-fill="true"]') as HTMLElement;
    expect(fill.style.width).toBe('0%');
  });

  it('computes the fill width as a percentage of max', () => {
    const { container } = render(<Progress value={3} max={12} />);
    const fill = container.querySelector('[data-progress-fill="true"]') as HTMLElement;
    expect(fill.style.width).toBe('25%');
  });
});
