import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PageHeader } from './page-header';

describe('<PageHeader>', () => {
  it('renders a header element with data-section="page-header"', () => {
    const { container } = render(<PageHeader title="Settings" />);
    const root = container.firstChild as HTMLElement;
    expect(root.tagName).toBe('HEADER');
    expect(root.getAttribute('data-section')).toBe('page-header');
  });

  it('renders the title as an <h1>', () => {
    render(<PageHeader title="Settings" />);
    expect(
      screen.getByRole('heading', { level: 1, name: 'Settings' }),
    ).toBeInTheDocument();
  });

  it('omits the title element when no title is passed', () => {
    render(<PageHeader subtitle="just subtitle" />);
    expect(screen.queryByRole('heading')).not.toBeInTheDocument();
  });

  it('renders the subtitle below the title', () => {
    render(<PageHeader title="Settings" subtitle="Operator preferences" />);
    expect(screen.getByText('Operator preferences')).toBeInTheDocument();
  });

  it('renders the breadcrumb trail when items are provided', () => {
    render(
      <PageHeader
        title="Settings"
        breadcrumbs={[
          { id: 'home', label: 'Home', href: '#feature=dashboard' },
          { id: 'settings', label: 'Settings' },
        ]}
      />,
    );
    const trail = screen.getByTestId('page-header-breadcrumbs');
    expect(trail).toBeInTheDocument();
    expect(trail.textContent).toContain('Home');
    expect(trail.textContent).toContain('Settings');
  });

  it('omits the breadcrumb trail when no items are provided', () => {
    render(<PageHeader title="Settings" />);
    expect(
      screen.queryByTestId('page-header-breadcrumbs'),
    ).not.toBeInTheDocument();
  });

  it('omits the breadcrumb trail when an empty array is passed', () => {
    render(<PageHeader title="Settings" breadcrumbs={[]} />);
    expect(
      screen.queryByTestId('page-header-breadcrumbs'),
    ).not.toBeInTheDocument();
  });

  it('renders the right-aligned actions slot when provided', () => {
    render(
      <PageHeader
        title="Settings"
        actions={<button data-testid="action-btn">Save</button>}
      />,
    );
    expect(screen.getByTestId('action-btn')).toBeInTheDocument();
    const actionsRoot = screen.getByTestId('page-header-actions');
    expect(actionsRoot.className).toContain('shrink-0');
  });

  it('omits the actions wrapper when no actions are provided', () => {
    render(<PageHeader title="Settings" />);
    expect(
      screen.queryByTestId('page-header-actions'),
    ).not.toBeInTheDocument();
  });

  it('renders a Back anchor when backHref is provided', () => {
    render(<PageHeader title="Settings" backHref="#feature=dashboard" />);
    const back = screen.getByTestId('page-header-back');
    expect(back.tagName).toBe('A');
    expect(back.getAttribute('href')).toBe('#feature=dashboard');
  });

  it('renders a Back button when onBack is provided', async () => {
    const onBack = vi.fn();
    const user = userEvent.setup();
    render(<PageHeader title="Settings" onBack={onBack} />);
    const back = screen.getByTestId('page-header-back');
    expect(back.tagName).toBe('BUTTON');
    await user.click(back);
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it('prefers onBack over backHref when both are passed (button wins)', () => {
    render(
      <PageHeader
        title="Settings"
        backHref="#feature=dashboard"
        onBack={vi.fn()}
      />,
    );
    expect(screen.getByTestId('page-header-back').tagName).toBe('BUTTON');
  });

  it('forwards a custom backLabel as aria-label', () => {
    render(
      <PageHeader
        title="Settings"
        backHref="#feature=dashboard"
        backLabel="Return to dashboard"
      />,
    );
    expect(
      screen.getByTestId('page-header-back').getAttribute('aria-label'),
    ).toBe('Return to dashboard');
  });

  it('omits the Back button entirely when neither backHref nor onBack is passed', () => {
    render(<PageHeader title="Settings" />);
    expect(
      screen.queryByTestId('page-header-back'),
    ).not.toBeInTheDocument();
  });

  it('is sticky by default with top: 0 and z-index 5', () => {
    const { container } = render(<PageHeader title="Settings" />);
    const root = container.firstChild as HTMLElement;
    expect(root.className).toContain('sticky');
    expect(root.style.top).toBe('0px');
    expect(root.style.zIndex).toBe('5');
  });

  it('drops the sticky class + inline style when sticky={false}', () => {
    const { container } = render(
      <PageHeader title="Settings" sticky={false} />,
    );
    const root = container.firstChild as HTMLElement;
    expect(root.className).not.toContain('sticky');
    expect(root.style.top).toBe('');
    expect(root.style.zIndex).toBe('');
  });

  it('honours a number topOffset (px) when sticky', () => {
    const { container } = render(
      <PageHeader title="Settings" topOffset={48} />,
    );
    const root = container.firstChild as HTMLElement;
    expect(root.style.top).toBe('48px');
  });

  it('honours a string topOffset (CSS length / var) when sticky', () => {
    const { container } = render(
      <PageHeader title="Settings" topOffset="var(--app-header-h)" />,
    );
    const root = container.firstChild as HTMLElement;
    expect(root.style.top).toBe('var(--app-header-h)');
  });

  it('forwards arbitrary HTML attributes (data-testid, className)', () => {
    render(
      <PageHeader
        title="Settings"
        className="custom-header"
        data-testid="my-page-header"
      />,
    );
    const root = screen.getByTestId('my-page-header');
    expect(root.className).toContain('custom-header');
    // Built-in border class still applied alongside the override.
    expect(root.className).toContain('border-b');
  });

  it('renders the title, subtitle, breadcrumbs, back, and actions in one go (kitchen sink)', () => {
    render(
      <PageHeader
        title="Settings"
        subtitle="Operator preferences"
        breadcrumbs={[
          { id: 'home', label: 'Home', href: '#feature=dashboard' },
          { id: 'settings', label: 'Settings' },
        ]}
        backHref="#feature=dashboard"
        actions={<button>Save</button>}
      />,
    );
    expect(screen.getByRole('heading', { level: 1, name: 'Settings' })).toBeInTheDocument();
    expect(screen.getByText('Operator preferences')).toBeInTheDocument();
    expect(screen.getByTestId('page-header-breadcrumbs')).toBeInTheDocument();
    expect(screen.getByTestId('page-header-back')).toBeInTheDocument();
    expect(screen.getByTestId('page-header-actions')).toBeInTheDocument();
  });
});
