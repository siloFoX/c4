import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Alert } from './alert';

describe('<Alert>', () => {
  it('renders info variant classes by default', () => {
    const { container } = render(<Alert title="Heads up">message</Alert>);
    const wrapper = container.firstChild as HTMLElement;
    expect(wrapper.className).toContain('bg-primary/10');
    expect(wrapper.className).toContain('text-primary');
    expect(wrapper.className).toContain('border-primary/40');
  });

  it('renders success variant classes', () => {
    const { container } = render(<Alert variant="success">ok</Alert>);
    const wrapper = container.firstChild as HTMLElement;
    expect(wrapper.className).toContain('bg-success/10');
    expect(wrapper.className).toContain('text-success');
    expect(wrapper.className).toContain('border-success/40');
  });

  it('renders warning variant classes', () => {
    const { container } = render(<Alert variant="warning">careful</Alert>);
    const wrapper = container.firstChild as HTMLElement;
    expect(wrapper.className).toContain('bg-warning/10');
    expect(wrapper.className).toContain('text-warning');
    expect(wrapper.className).toContain('border-warning/40');
  });

  it('renders error variant classes', () => {
    const { container } = render(<Alert variant="error">bad</Alert>);
    const wrapper = container.firstChild as HTMLElement;
    expect(wrapper.className).toContain('bg-destructive/10');
    expect(wrapper.className).toContain('text-destructive');
    expect(wrapper.className).toContain('border-destructive/40');
  });

  it('renders neutral variant classes', () => {
    const { container } = render(<Alert variant="neutral">note</Alert>);
    const wrapper = container.firstChild as HTMLElement;
    expect(wrapper.className).toContain('bg-muted');
    expect(wrapper.className).toContain('text-muted-foreground');
    expect(wrapper.className).toContain('border-border');
  });

  it('renders title in a font-semibold element', () => {
    render(<Alert title="A title">body</Alert>);
    const titleEl = screen.getByText('A title');
    expect(titleEl.className).toContain('font-semibold');
    expect(titleEl.tagName).toBe('P');
  });

  it('renders body children', () => {
    render(<Alert title="t">message body</Alert>);
    expect(screen.getByText('message body')).toBeInTheDocument();
  });

  it('renders icon slot when provided', () => {
    render(
      <Alert icon={<svg data-testid="icon" />} title="t">
        body
      </Alert>,
    );
    expect(screen.getByTestId('icon')).toBeInTheDocument();
  });

  it('omits icon slot when not provided', () => {
    const { container } = render(<Alert title="t">body</Alert>);
    expect(container.querySelector('[aria-hidden="true"]')).toBeNull();
  });

  it('renders action slot when provided', () => {
    render(
      <Alert action={<button type="button">Retry</button>} title="t">
        body
      </Alert>,
    );
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
  });

  it('omits dismiss button when dismissible=false', () => {
    render(<Alert title="t">body</Alert>);
    expect(screen.queryByRole('button', { name: 'Dismiss' })).toBeNull();
  });

  it('renders dismiss button when dismissible=true', () => {
    render(
      <Alert dismissible onDismiss={() => {}} title="t">
        body
      </Alert>,
    );
    expect(screen.getByRole('button', { name: 'Dismiss' })).toBeInTheDocument();
  });

  it('fires onDismiss when X is clicked', () => {
    const onDismiss = vi.fn();
    render(
      <Alert dismissible onDismiss={onDismiss} title="t">
        body
      </Alert>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('defaults role to status', () => {
    const { container } = render(<Alert title="t">body</Alert>);
    const wrapper = container.firstChild as HTMLElement;
    expect(wrapper).toHaveAttribute('role', 'status');
    expect(wrapper).toHaveAttribute('aria-live', 'polite');
  });

  it('defaults role to alert for error variant', () => {
    const { container } = render(<Alert variant="error">bad</Alert>);
    const wrapper = container.firstChild as HTMLElement;
    expect(wrapper).toHaveAttribute('role', 'alert');
    expect(wrapper).toHaveAttribute('aria-live', 'assertive');
  });

  it('honors explicit role override', () => {
    const { container } = render(<Alert variant="error" role="status">x</Alert>);
    const wrapper = container.firstChild as HTMLElement;
    expect(wrapper).toHaveAttribute('role', 'status');
    expect(wrapper).toHaveAttribute('aria-live', 'polite');
  });

  it('merges caller className', () => {
    const { container } = render(<Alert className="my-alert">x</Alert>);
    const wrapper = container.firstChild as HTMLElement;
    expect(wrapper).toHaveClass('my-alert');
    expect(wrapper.className).toContain('rounded-md');
  });
});
