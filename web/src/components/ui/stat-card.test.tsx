import { describe, it, expect } from 'vitest';
import { createRef } from 'react';
import { render, screen } from '@testing-library/react';
import { StatCard } from './stat-card';

describe('<StatCard>', () => {
  it('renders the label text', () => {
    render(<StatCard label="Active" value={3} noAnimation />);
    expect(screen.getByText('Active')).toBeInTheDocument();
  });

  it('renders a numeric value (with noAnimation to skip the count-up)', () => {
    render(<StatCard label="Workers" value={42} noAnimation />);
    const node = screen.getByText('42');
    expect(node).toBeInTheDocument();
    expect(node).toHaveAttribute('data-stat-value');
  });

  it('exposes the final value via data-stat-final regardless of animation phase', () => {
    render(<StatCard label="Total" value={99} noAnimation />);
    const valueNode = screen.getByText('99');
    expect(valueNode).toHaveAttribute('data-stat-final', '99');
  });

  it('renders string values as-is (no count-up)', () => {
    render(<StatCard label="Last seen" value="5m ago" />);
    expect(screen.getByText('5m ago')).toBeInTheDocument();
  });

  it('renders the hint when provided', () => {
    render(
      <StatCard label="Errors" value={0} hint="last 24h" noAnimation />,
    );
    expect(screen.getByText('last 24h')).toBeInTheDocument();
  });

  it('renders an icon slot when provided', () => {
    render(
      <StatCard
        label="Up"
        value={1}
        noAnimation
        icon={<svg data-testid="stat-icon" />}
      />,
    );
    expect(screen.getByTestId('stat-icon')).toBeInTheDocument();
  });

  it('shows the loading skeleton (role=status) and hides the value', () => {
    render(<StatCard label="Pending" value={5} loading />);
    expect(
      screen.getByRole('status', { name: 'Pending loading' }),
    ).toBeInTheDocument();
    expect(screen.queryByText('5')).not.toBeInTheDocument();
  });

  it('applies the wrapper data-stat-card attribute', () => {
    const { container } = render(
      <StatCard label="x" value={1} noAnimation />,
    );
    const wrapper = container.firstChild as HTMLElement;
    expect(wrapper).toHaveAttribute('data-stat-card');
  });

  it('merges caller className with the built-in wrapper classes', () => {
    const { container } = render(
      <StatCard label="x" value={1} noAnimation className="my-stat" />,
    );
    const wrapper = container.firstChild as HTMLElement;
    expect(wrapper).toHaveClass('my-stat');
    expect(wrapper).toHaveClass('rounded-xl');
    expect(wrapper).toHaveClass('border');
  });

  it('forwards a ref to the underlying <div>', () => {
    const ref = createRef<HTMLDivElement>();
    render(<StatCard ref={ref} label="x" value={1} noAnimation />);
    expect(ref.current).toBeInstanceOf(HTMLDivElement);
  });

  it('forwards arbitrary HTML attributes (data-* / aria-*) to the wrapper', () => {
    render(
      <StatCard
        label="x"
        value={1}
        noAnimation
        data-testid="card-1"
        aria-label="active workers"
      />,
    );
    const node = screen.getByTestId('card-1');
    expect(node).toHaveAttribute('aria-label', 'active workers');
  });

  it('exposes a stable displayName', () => {
    expect(StatCard.displayName).toBe('StatCard');
  });
});
