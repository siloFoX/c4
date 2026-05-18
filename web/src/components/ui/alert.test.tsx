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

  it('renders the auto-icon for the default (info) variant when icon is omitted', () => {
    // v1.11.398 (TODO 11.380): signal-bearing variants get an
    // auto-icon by default. Use icon={false} to opt out.
    const { container } = render(<Alert title="t">body</Alert>);
    expect(
      container.querySelector('[data-section="alert-icon"]'),
    ).not.toBeNull();
  });

  it('omits the icon slot for the neutral variant by default', () => {
    const { container } = render(
      <Alert variant="neutral" title="t">body</Alert>,
    );
    expect(
      container.querySelector('[data-section="alert-icon"]'),
    ).toBeNull();
  });

  it('icon={false} opts out of the auto-icon entirely', () => {
    const { container } = render(
      <Alert icon={false} title="t">body</Alert>,
    );
    expect(
      container.querySelector('[data-section="alert-icon"]'),
    ).toBeNull();
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

  // -- v1.11.398 auto-icons + size scale (TODO 11.380) -----------

  it('auto-icon renders for each signal-bearing variant', () => {
    const variants = ['info', 'success', 'warning', 'error'] as const;
    for (const v of variants) {
      const { container, unmount } = render(<Alert variant={v}>x</Alert>);
      expect(
        container.querySelector('[data-section="alert-icon"]'),
        `auto-icon missing for variant=${v}`,
      ).not.toBeNull();
      unmount();
    }
  });

  it('caller-supplied icon wins over the auto-icon', () => {
    const { container } = render(
      <Alert variant="success" icon={<span data-testid="custom" />}>
        x
      </Alert>,
    );
    const icon = container.querySelector('[data-section="alert-icon"]');
    expect(icon).not.toBeNull();
    expect(icon!.querySelector('[data-testid="custom"]')).not.toBeNull();
    // Default success icon is a lucide svg; with custom passed,
    // no lucide-circle-check svg should render.
    expect(icon!.querySelector('svg.lucide-circle-check')).toBeNull();
  });

  it('default size="md" applies the legacy p-3 text-sm gap-3 classes', () => {
    const { container } = render(<Alert>x</Alert>);
    const wrapper = container.firstChild as HTMLElement;
    expect(wrapper.className).toContain('p-3');
    expect(wrapper.className).toContain('text-sm');
    expect(wrapper.className).toContain('gap-3');
    expect(wrapper.getAttribute('data-size')).toBe('md');
  });

  it('size="sm" applies dense padding + smaller text', () => {
    const { container } = render(<Alert size="sm">x</Alert>);
    const wrapper = container.firstChild as HTMLElement;
    expect(wrapper.className).toContain('p-2');
    expect(wrapper.className).toContain('text-xs');
    expect(wrapper.className).toContain('gap-2');
    expect(wrapper.getAttribute('data-size')).toBe('sm');
  });

  it('size="lg" applies hero padding + larger text', () => {
    const { container } = render(<Alert size="lg">x</Alert>);
    const wrapper = container.firstChild as HTMLElement;
    expect(wrapper.className).toContain('p-4');
    expect(wrapper.className).toContain('text-base');
    expect(wrapper.className).toContain('gap-4');
    expect(wrapper.getAttribute('data-size')).toBe('lg');
  });

  it('dismiss button scales with size', () => {
    const { container, rerender } = render(
      <Alert size="sm" dismissible>x</Alert>,
    );
    let btn = container.querySelector(
      '[data-section="alert-dismiss"]',
    ) as HTMLElement;
    expect(btn.className).toContain('h-5');
    expect(btn.className).toContain('w-5');
    rerender(<Alert size="lg" dismissible>x</Alert>);
    btn = container.querySelector(
      '[data-section="alert-dismiss"]',
    ) as HTMLElement;
    expect(btn.className).toContain('h-7');
    expect(btn.className).toContain('w-7');
  });

  it('data-section attrs on the root + inner blocks for tests', () => {
    const { container } = render(
      <Alert variant="warning" title="Heads up" action={<button type="button">go</button>} dismissible>
        body text
      </Alert>,
    );
    expect(
      container.querySelector('[data-section="alert"]'),
    ).not.toBeNull();
    expect(
      container.querySelector('[data-section="alert-title"]'),
    ).toHaveTextContent('Heads up');
    expect(
      container.querySelector('[data-section="alert-description"]'),
    ).toHaveTextContent('body text');
    expect(
      container.querySelector('[data-section="alert-action"]'),
    ).not.toBeNull();
    expect(
      container.querySelector('[data-section="alert-dismiss"]'),
    ).not.toBeNull();
  });

  it('data-variant attr mirrors the variant', () => {
    const { container, rerender } = render(<Alert variant="error">x</Alert>);
    expect(
      (container.firstChild as HTMLElement).getAttribute('data-variant'),
    ).toBe('error');
    rerender(<Alert variant="success">x</Alert>);
    expect(
      (container.firstChild as HTMLElement).getAttribute('data-variant'),
    ).toBe('success');
  });
});
