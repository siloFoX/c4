import { createRef } from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { NotificationBanner } from './notification-banner';

describe('<NotificationBanner>', () => {
  it('renders title text', () => {
    render(<NotificationBanner title="System paused" />);
    expect(screen.getByText('System paused')).toBeInTheDocument();
  });

  it('renders description', () => {
    render(<NotificationBanner title="t" description="details here" />);
    expect(screen.getByText('details here')).toBeInTheDocument();
  });

  it('default variant info has info classes', () => {
    const { container } = render(<NotificationBanner title="t" />);
    const wrapper = container.firstChild as HTMLElement;
    expect(wrapper.className).toContain('bg-info/10');
    expect(wrapper.className).toContain('border-info');
    expect(wrapper.className).toContain('text-info-foreground');
  });

  it('warn variant has warn classes', () => {
    const { container } = render(<NotificationBanner variant="warn" title="t" />);
    const wrapper = container.firstChild as HTMLElement;
    expect(wrapper.className).toContain('bg-warning/10');
    expect(wrapper.className).toContain('border-warning');
  });

  it('critical variant has destructive classes and role=alert', () => {
    const { container } = render(<NotificationBanner variant="critical" title="t" />);
    const wrapper = container.firstChild as HTMLElement;
    expect(wrapper.className).toContain('bg-destructive/10');
    expect(wrapper.className).toContain('border-destructive');
    expect(wrapper).toHaveAttribute('role', 'alert');
    expect(wrapper).toHaveAttribute('aria-live', 'assertive');
  });

  it('info variant uses role=status', () => {
    const { container } = render(<NotificationBanner title="t" />);
    const wrapper = container.firstChild as HTMLElement;
    expect(wrapper).toHaveAttribute('role', 'status');
    expect(wrapper).toHaveAttribute('aria-live', 'polite');
  });

  it('warn variant uses role=status', () => {
    const { container } = render(<NotificationBanner variant="warn" title="t" />);
    const wrapper = container.firstChild as HTMLElement;
    expect(wrapper).toHaveAttribute('role', 'status');
  });

  it('renders default icon per variant', () => {
    const { container, rerender } = render(<NotificationBanner title="t" />);
    expect(container.querySelector('svg')).toBeTruthy();
    rerender(<NotificationBanner variant="warn" title="t" />);
    expect(container.querySelector('svg')).toBeTruthy();
    rerender(<NotificationBanner variant="critical" title="t" />);
    expect(container.querySelector('svg')).toBeTruthy();
  });

  it('custom icon overrides default', () => {
    render(
      <NotificationBanner
        title="t"
        icon={<svg data-testid="custom-icon" />}
      />,
    );
    expect(screen.getByTestId('custom-icon')).toBeInTheDocument();
  });

  it('renders action slot when provided', () => {
    render(
      <NotificationBanner
        title="t"
        action={<button type="button">Retry</button>}
      />,
    );
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
  });

  it('calls onDismiss when dismiss button clicked', () => {
    const onDismiss = vi.fn();
    render(<NotificationBanner title="t" onDismiss={onDismiss} />);
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('omits dismiss button when onDismiss not provided', () => {
    render(<NotificationBanner title="t" />);
    expect(screen.queryByRole('button', { name: 'Dismiss' })).toBeNull();
  });

  it('honours custom dismissLabel', () => {
    render(
      <NotificationBanner
        title="t"
        onDismiss={() => {}}
        dismissLabel="Close banner"
      />,
    );
    expect(screen.getByRole('button', { name: 'Close banner' })).toBeInTheDocument();
  });

  it('sticky=true applies sticky classes', () => {
    const { container } = render(<NotificationBanner title="t" />);
    const wrapper = container.firstChild as HTMLElement;
    expect(wrapper.className).toContain('sticky');
    expect(wrapper.className).toContain('top-0');
    expect(wrapper.className).toContain('z-40');
  });

  it('sticky=false omits sticky classes', () => {
    const { container } = render(<NotificationBanner title="t" sticky={false} />);
    const wrapper = container.firstChild as HTMLElement;
    expect(wrapper.className).not.toContain('sticky');
    expect(wrapper.className).not.toContain('top-0');
  });

  it('merges caller className', () => {
    const { container } = render(
      <NotificationBanner title="t" className="my-banner" />,
    );
    const wrapper = container.firstChild as HTMLElement;
    expect(wrapper).toHaveClass('my-banner');
  });

  it('forwards ref to wrapper div', () => {
    const ref = createRef<HTMLDivElement>();
    render(<NotificationBanner ref={ref} title="t" />);
    expect(ref.current).toBeInstanceOf(HTMLDivElement);
  });
});
