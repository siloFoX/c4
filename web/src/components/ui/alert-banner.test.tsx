import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AlertBanner } from './alert-banner';

describe('<AlertBanner>', () => {
  it('tags the root with data-section="alert-banner"', () => {
    render(<AlertBanner>body</AlertBanner>);
    expect(
      document.querySelector('[data-section="alert-banner"]'),
    ).not.toBeNull();
  });

  it('renders body children verbatim', () => {
    render(
      <AlertBanner>
        <span data-testid="body-payload">override warning</span>
      </AlertBanner>,
    );
    expect(screen.getByTestId('body-payload')).toBeInTheDocument();
  });

  it('renders the title above the body', () => {
    render(<AlertBanner title="Heads up">details below</AlertBanner>);
    expect(screen.getByText('Heads up')).toBeInTheDocument();
    expect(screen.getByText('details below')).toBeInTheDocument();
  });

  it('defaults to severity="info" + aria-live="polite" on the root', () => {
    render(<AlertBanner>body</AlertBanner>);
    const root = document.querySelector('[data-section="alert-banner"]')!;
    expect(root.getAttribute('data-severity')).toBe('info');
    expect(root.getAttribute('aria-live')).toBe('polite');
  });

  it('always uses role="alert" regardless of severity', () => {
    render(<AlertBanner severity="info">body</AlertBanner>);
    expect(
      document.querySelector('[role="alert"]'),
    ).not.toBeNull();
  });

  it('severity="success" maps to the success variant classes', () => {
    render(<AlertBanner severity="success">good</AlertBanner>);
    const root = document.querySelector('[data-section="alert-banner"]')!;
    expect(root.getAttribute('data-severity')).toBe('success');
    expect(root.className).toContain('bg-success/10');
  });

  it('severity="warning" maps to the warning variant classes', () => {
    render(<AlertBanner severity="warning">be careful</AlertBanner>);
    const root = document.querySelector('[data-section="alert-banner"]')!;
    expect(root.getAttribute('data-severity')).toBe('warning');
    expect(root.className).toContain('bg-warning/10');
  });

  it('severity="danger" maps to the underlying error variant', () => {
    render(<AlertBanner severity="danger">broken</AlertBanner>);
    const root = document.querySelector('[data-section="alert-banner"]')!;
    expect(root.getAttribute('data-severity')).toBe('danger');
    expect(root.className).toContain('bg-destructive/10');
  });

  it('legacyVariant passthrough lets callers opt into "neutral"', () => {
    render(<AlertBanner legacyVariant="neutral">muted</AlertBanner>);
    const root = document.querySelector('[data-section="alert-banner"]')!;
    expect(root.className).toContain('bg-muted');
    expect(root.getAttribute('data-severity')).toBe('neutral');
  });

  it('severity wins over legacyVariant when both are passed', () => {
    render(
      <AlertBanner severity="success" legacyVariant="error">
        ambiguous
      </AlertBanner>,
    );
    const root = document.querySelector('[data-section="alert-banner"]')!;
    expect(root.className).toContain('bg-success/10');
    expect(root.getAttribute('data-severity')).toBe('success');
  });

  it('renders an icon when provided', () => {
    render(
      <AlertBanner icon={<svg data-testid="banner-icon" />}>body</AlertBanner>,
    );
    expect(screen.getByTestId('banner-icon')).toBeInTheDocument();
  });

  it('renders a CTA action slot when provided', () => {
    render(
      <AlertBanner
        action={<button data-testid="cta">Open settings</button>}
      >
        body
      </AlertBanner>,
    );
    expect(screen.getByTestId('cta')).toBeInTheDocument();
  });

  it('renders the dismiss button when dismissible=true', () => {
    render(<AlertBanner dismissible>body</AlertBanner>);
    expect(
      screen.getByRole('button', { name: 'Dismiss' }),
    ).toBeInTheDocument();
  });

  it('fires onDismiss when the dismiss button is clicked', async () => {
    const onDismiss = vi.fn();
    const user = userEvent.setup();
    render(
      <AlertBanner dismissible onDismiss={onDismiss}>
        body
      </AlertBanner>,
    );
    await user.click(screen.getByRole('button', { name: 'Dismiss' }));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('omits the dismiss button when dismissible is not set', () => {
    render(<AlertBanner>body</AlertBanner>);
    expect(
      screen.queryByRole('button', { name: 'Dismiss' }),
    ).not.toBeInTheDocument();
  });

  it('forwards arbitrary HTML attributes (data-testid)', () => {
    render(<AlertBanner data-testid="my-banner">body</AlertBanner>);
    expect(screen.getByTestId('my-banner')).toBeInTheDocument();
  });

  it('merges caller className with built-in variant classes', () => {
    render(
      <AlertBanner severity="info" className="custom-banner">
        body
      </AlertBanner>,
    );
    const root = document.querySelector('[data-section="alert-banner"]')!;
    expect(root.className).toContain('custom-banner');
    expect(root.className).toContain('bg-primary/10');
  });
});
