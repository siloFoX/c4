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

  // -- v1.11.423 (TODO 11.405) extensions ---------------------------

  it('exposes data-size and data-collapse-actions on the root', () => {
    const { container } = render(
      <PageHeader title="Settings" actions={<button>Save</button>} />,
    );
    const root = container.firstChild as HTMLElement;
    expect(root.getAttribute('data-size')).toBe('md');
    expect(root.getAttribute('data-collapse-actions')).toBe('true');
  });

  it('default collapseActionsOnMobile=true adds flex-col md:flex-row to inner row', () => {
    const { container } = render(
      <PageHeader title="X" actions={<button>A</button>} />,
    );
    const inner = container.querySelector(
      '[data-section="page-header"] > div',
    ) as HTMLElement;
    expect(inner.className).toContain('flex-col');
    expect(inner.className).toContain('md:flex-row');
  });

  it('collapseActionsOnMobile=false keeps flex-row at all breakpoints', () => {
    const { container } = render(
      <PageHeader
        title="X"
        actions={<button>A</button>}
        collapseActionsOnMobile={false}
      />,
    );
    const inner = container.querySelector(
      '[data-section="page-header"] > div',
    ) as HTMLElement;
    expect(inner.className).not.toContain('flex-col');
  });

  it('collapseActionsOnMobile only kicks in when actions are present', () => {
    const { container } = render(<PageHeader title="X" />);
    const inner = container.querySelector(
      '[data-section="page-header"] > div',
    ) as HTMLElement;
    expect(inner.className).not.toContain('flex-col');
  });

  it('actions row gets responsive classes when collapse is enabled', () => {
    render(
      <PageHeader title="X" actions={<button>A</button>} />,
    );
    const actions = screen.getByTestId('page-header-actions');
    expect(actions.className).toContain('w-full');
    expect(actions.className).toContain('md:w-auto');
    expect(actions.className).toContain('md:shrink-0');
  });

  it('actions row stays shrink-0 when collapse is disabled', () => {
    render(
      <PageHeader
        title="X"
        actions={<button>A</button>}
        collapseActionsOnMobile={false}
      />,
    );
    const actions = screen.getByTestId('page-header-actions');
    expect(actions.className).toContain('shrink-0');
    expect(actions.className).not.toContain('md:w-auto');
  });

  it('size="sm" applies compact title + subtitle classes', () => {
    render(
      <PageHeader title="X" subtitle="Y" size="sm" />,
    );
    const title = screen.getByRole('heading', { level: 1 });
    expect(title.className).toContain('text-base');
    expect(title.className).toContain('md:text-lg');
    const subtitle = screen.getByText('Y');
    expect(subtitle.className).toContain('text-[11px]');
  });

  it('size="md" applies legacy title + subtitle classes (default)', () => {
    render(
      <PageHeader title="X" subtitle="Y" />,
    );
    const title = screen.getByRole('heading', { level: 1 });
    expect(title.className).toContain('text-lg');
    expect(title.className).toContain('md:text-xl');
    const subtitle = screen.getByText('Y');
    expect(subtitle.className).toContain('text-xs');
  });

  it('size="lg" applies hero title + subtitle classes', () => {
    render(
      <PageHeader title="X" subtitle="Y" size="lg" />,
    );
    const title = screen.getByRole('heading', { level: 1 });
    expect(title.className).toContain('text-xl');
    expect(title.className).toContain('md:text-2xl');
    const subtitle = screen.getByText('Y');
    expect(subtitle.className).toContain('text-sm');
  });

  it('data-size mirrors the size prop', () => {
    const { container, rerender } = render(
      <PageHeader title="X" />,
    );
    expect(
      (container.firstChild as HTMLElement).getAttribute('data-size'),
    ).toBe('md');
    rerender(<PageHeader title="X" size="lg" />);
    expect(
      (container.firstChild as HTMLElement).getAttribute('data-size'),
    ).toBe('lg');
  });

  it('exposes data-section on title + subtitle + lead + text', () => {
    const { container } = render(
      <PageHeader title="X" subtitle="Y" />,
    );
    expect(
      container.querySelector('[data-section="page-header-title"]'),
    ).toBeInTheDocument();
    expect(
      container.querySelector('[data-section="page-header-subtitle"]'),
    ).toBeInTheDocument();
    expect(
      container.querySelector('[data-section="page-header-lead"]'),
    ).toBeInTheDocument();
    expect(
      container.querySelector('[data-section="page-header-text"]'),
    ).toBeInTheDocument();
  });

  it('actions block carries data-section="page-header-actions"', () => {
    const { container } = render(
      <PageHeader title="X" actions={<button>A</button>} />,
    );
    expect(
      container.querySelector('[data-section="page-header-actions"]'),
    ).toBeInTheDocument();
  });
});
