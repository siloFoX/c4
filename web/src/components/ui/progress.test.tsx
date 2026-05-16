import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Progress, ProgressBar } from './progress';

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

  // -- v1.11.274 size + labelText + showPercent (TODO 11.256) -----

  it('default size="md" maps to h-2 bar + data-size="md" attribute', () => {
    render(<Progress value={50} />);
    const bar = screen.getByRole('progressbar');
    expect(bar.className).toContain('h-2');
    const root = bar.parentElement!;
    expect(root.getAttribute('data-size')).toBe('md');
  });

  it('size="sm" thins the bar to h-1', () => {
    render(<Progress value={50} size="sm" />);
    const bar = screen.getByRole('progressbar');
    expect(bar.className).toContain('h-1');
    expect(bar.parentElement!.getAttribute('data-size')).toBe('sm');
  });

  it('size="lg" thickens the bar to h-3', () => {
    render(<Progress value={50} size="lg" />);
    const bar = screen.getByRole('progressbar');
    expect(bar.className).toContain('h-3');
    expect(bar.parentElement!.getAttribute('data-size')).toBe('lg');
  });

  it('labelText prop auto-enables the label row (no need to set label)', () => {
    render(<Progress value={20} labelText="Uploading..." />);
    const labelRow = document.querySelector('[data-progress-label]');
    expect(labelRow).not.toBeNull();
    const text = document.querySelector('[data-progress-label-text]');
    expect(text!.textContent).toBe('Uploading...');
  });

  it('labelText + percent render side by side on the same row', () => {
    render(<Progress value={42} labelText="Snapshot" />);
    expect(
      document.querySelector('[data-progress-label-text]')!.textContent,
    ).toBe('Snapshot');
    expect(
      document.querySelector('[data-progress-percent]')!.textContent,
    ).toBe('42%');
  });

  it('showPercent={false} hides the percent text but keeps the label row when labelText is set', () => {
    render(
      <Progress value={70} labelText="Almost there" showPercent={false} />,
    );
    expect(
      document.querySelector('[data-progress-label-text]')!.textContent,
    ).toBe('Almost there');
    expect(
      document.querySelector('[data-progress-percent]'),
    ).toBeNull();
  });

  it('label={true} with no labelText still shows the percent on the right', () => {
    render(<Progress value={88} label />);
    expect(
      document.querySelector('[data-progress-label-text]'),
    ).toBeNull();
    expect(
      document.querySelector('[data-progress-percent]')!.textContent,
    ).toBe('88%');
  });

  it('indeterminate + label="true" still shows "Working..." on the right', () => {
    render(<Progress indeterminate label />);
    expect(
      document.querySelector('[data-progress-percent]')!.textContent,
    ).toBe('Working...');
  });

  it('omits the label row entirely when neither label nor labelText is set', () => {
    render(<Progress value={50} />);
    expect(
      document.querySelector('[data-progress-label]'),
    ).toBeNull();
  });

  it('exposes data-section="progress" on the root', () => {
    render(<Progress value={1} />);
    expect(
      document.querySelector('[data-section="progress"]'),
    ).not.toBeNull();
  });

  // -- v1.11.274 ProgressBar alias (TODO 11.256) -------------------

  it('ProgressBar is an alias of Progress (renders the same DOM)', () => {
    const a = render(<Progress value={30} max={100} />);
    const b = render(<ProgressBar value={30} max={100} />);
    const aBar = a.container.querySelector('[role="progressbar"]');
    const bBar = b.container.querySelector('[role="progressbar"]');
    expect(aBar!.outerHTML).toBe(bBar!.outerHTML);
  });
});
