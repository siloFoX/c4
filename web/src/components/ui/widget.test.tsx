import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Widget } from './widget';

describe('<Widget> shell', () => {
  it('renders a section with the data-widget marker', () => {
    const { container } = render(<Widget><span>hi</span></Widget>);
    const section = container.querySelector('section[data-widget]');
    expect(section).not.toBeNull();
  });

  it('renders the flat title prop inside the header', () => {
    render(<Widget title="Daemon" />);
    expect(screen.getByText('Daemon')).toBeInTheDocument();
  });

  it('renders the flat icon prop alongside the title', () => {
    const { container } = render(
      <Widget
        title="Daemon"
        icon={<svg data-testid="leading-icon" />}
      />,
    );
    expect(container.querySelector('[data-testid="leading-icon"]')).not.toBeNull();
  });

  it('skips the header entirely when no header-relevant prop is set', () => {
    const { container } = render(
      <Widget>
        <span>just a body</span>
      </Widget>,
    );
    expect(container.querySelector('[data-widget-header]')).toBeNull();
  });

  it('renders an "updated <relative>" stamp from an ISO updatedAt', () => {
    const iso = new Date(Date.now() - 60_000).toISOString();
    const { container } = render(<Widget title="X" updatedAt={iso} />);
    const stamp = container.querySelector('[data-widget-updated]');
    expect(stamp).not.toBeNull();
    expect(stamp?.textContent ?? '').toMatch(/^updated /);
  });

  it('honors a custom updatedLabel suffix', () => {
    const iso = new Date(Date.now() - 60_000).toISOString();
    const { container } = render(
      <Widget title="X" updatedAt={iso} updatedLabel="last refresh" />,
    );
    const stamp = container.querySelector('[data-widget-updated]');
    expect(stamp?.textContent ?? '').toMatch(/^last refresh /);
  });

  it('renders the refresh button when onRefresh is provided', () => {
    const onRefresh = vi.fn();
    render(<Widget title="X" onRefresh={onRefresh} />);
    expect(
      screen.getByRole('button', { name: 'Refresh widget' }),
    ).toBeInTheDocument();
  });

  it('fires onRefresh when the refresh button is clicked', async () => {
    const onRefresh = vi.fn();
    const user = userEvent.setup();
    render(<Widget title="X" onRefresh={onRefresh} />);
    await user.click(screen.getByRole('button', { name: 'Refresh widget' }));
    expect(onRefresh).toHaveBeenCalledTimes(1);
  });

  it('disables the refresh button while loading', () => {
    const onRefresh = vi.fn();
    render(<Widget title="X" onRefresh={onRefresh} loading />);
    expect(screen.getByRole('button', { name: 'Refresh widget' })).toBeDisabled();
  });

  it('flags data-widget-loading on the section while loading', () => {
    const { container } = render(<Widget title="X" loading />);
    const section = container.querySelector('section[data-widget]');
    expect(section?.hasAttribute('data-widget-loading')).toBe(true);
  });

  it('wraps flat children in a Widget.Body slot', () => {
    const { container } = render(<Widget title="X">payload</Widget>);
    const body = container.querySelector('[data-widget-body]');
    expect(body?.textContent).toBe('payload');
  });

  it('renders the flat footer prop inside the footer slot', () => {
    const { container } = render(
      <Widget title="X" footer={<span data-testid="ftr">hint</span>} />,
    );
    const footer = container.querySelector('[data-widget-footer]');
    expect(footer).not.toBeNull();
    expect(footer?.querySelector('[data-testid="ftr"]')).not.toBeNull();
  });

  it('compound API: composes Header / Body / Footer slots verbatim', () => {
    const { container } = render(
      <Widget>
        <Widget.Header title="Compound" />
        <Widget.Body data-testid="custom-body">body</Widget.Body>
        <Widget.Footer data-testid="custom-footer">footer</Widget.Footer>
      </Widget>,
    );
    expect(container.querySelector('[data-widget-header]')).not.toBeNull();
    expect(container.querySelector('[data-testid="custom-body"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="custom-footer"]')).not.toBeNull();
  });

  it('caller className merges onto the wrapper section', () => {
    const { container } = render(
      <Widget title="X" className="my-widget" />,
    );
    const section = container.querySelector('section[data-widget]');
    expect(section?.className).toContain('my-widget');
    expect(section?.className).toContain('rounded-md');
  });
});
