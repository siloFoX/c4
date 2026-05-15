import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { EmptyState } from './empty-state';

describe('<EmptyState>', () => {
  it('renders the title text', () => {
    render(<EmptyState title="Nothing here" />);
    expect(screen.getByText('Nothing here')).toBeInTheDocument();
  });

  it('renders the description when provided', () => {
    render(<EmptyState title="Empty" description="No items yet" />);
    expect(screen.getByText('No items yet')).toBeInTheDocument();
  });

  it('skips description rendering when omitted', () => {
    const { container } = render(<EmptyState title="Empty" />);
    // Title span is the only span without children inside the inner column;
    // a missing description means only the title span exists.
    const spans = container.querySelectorAll('span');
    expect(spans).toHaveLength(1);
    expect(spans[0]?.textContent).toBe('Empty');
  });

  it('renders an action button when action is a { label, onClick } object', () => {
    const onClick = vi.fn();
    render(
      <EmptyState
        title="Empty"
        action={{ label: 'Create', onClick }}
      />,
    );
    const btn = screen.getByRole('button', { name: 'Create' });
    expect(btn).toBeInTheDocument();
    fireEvent.click(btn);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('renders a ReactNode action as-is', () => {
    render(
      <EmptyState
        title="Empty"
        action={<button type="button">Custom</button>}
      />,
    );
    expect(screen.getByRole('button', { name: 'Custom' })).toBeInTheDocument();
  });

  it('renders the icon when provided', () => {
    render(
      <EmptyState
        title="Empty"
        icon={<svg data-testid="empty-icon" />}
      />,
    );
    expect(screen.getByTestId('empty-icon')).toBeInTheDocument();
  });

  it('uses palette tokens (border, card, text classes) on the wrapper', () => {
    const { container } = render(<EmptyState title="Empty" />);
    const wrapper = container.firstChild as HTMLElement;
    expect(wrapper).toHaveClass('border-border');
    expect(wrapper).toHaveClass('bg-card');
  });

  it('merges caller className with built-in classes', () => {
    const { container } = render(
      <EmptyState title="Empty" className="my-empty" />,
    );
    const wrapper = container.firstChild as HTMLElement;
    expect(wrapper).toHaveClass('my-empty');
    expect(wrapper).toHaveClass('flex');
  });

  // -- v1.11.254 illustration prop (TODO 11.236) --------------------

  it("renders the no-data illustration when illustration='no-data'", () => {
    const { container } = render(
      <EmptyState title="Empty" illustration="no-data" />,
    );
    const svg = container.querySelector('svg');
    expect(svg).not.toBeNull();
    expect(svg?.getAttribute('aria-label')).toBeNull();
    // The decorative wrapper around the icon is aria-hidden.
    expect(svg?.getAttribute('aria-hidden')).toBe('true');
  });

  it("renders the off-schedule illustration when illustration='off-schedule'", () => {
    const { container } = render(
      <EmptyState title="Empty" illustration="off-schedule" />,
    );
    expect(container.querySelector('svg')).not.toBeNull();
  });

  it("renders the access-denied illustration when illustration='access-denied'", () => {
    const { container } = render(
      <EmptyState title="Empty" illustration="access-denied" />,
    );
    expect(container.querySelector('svg')).not.toBeNull();
  });

  it("keeps backward compatibility -- 'icon' wins over 'illustration' when both are set", () => {
    const { container, getByTestId } = render(
      <EmptyState
        title="Empty"
        illustration="no-data"
        icon={<span data-testid="override-icon">override</span>}
      />,
    );
    expect(getByTestId('override-icon')).toBeInTheDocument();
    // The SVG illustration must NOT render in that case.
    expect(container.querySelector('svg')).toBeNull();
  });

  // -- v1.11.266 size + secondaryAction (TODO 11.248) --------------

  it("default size='md' maps to p-6 padding", () => {
    const { container } = render(<EmptyState title="Empty" />);
    const wrapper = container.firstChild as HTMLElement;
    expect(wrapper.getAttribute('data-empty-state-size')).toBe('md');
    expect(wrapper).toHaveClass('p-6');
  });

  it("size='sm' tightens padding to p-3", () => {
    const { container } = render(<EmptyState title="Empty" size="sm" />);
    const wrapper = container.firstChild as HTMLElement;
    expect(wrapper.getAttribute('data-empty-state-size')).toBe('sm');
    expect(wrapper).toHaveClass('p-3');
  });

  it("size='lg' relaxes padding to p-10", () => {
    const { container } = render(<EmptyState title="Empty" size="lg" />);
    const wrapper = container.firstChild as HTMLElement;
    expect(wrapper.getAttribute('data-empty-state-size')).toBe('lg');
    expect(wrapper).toHaveClass('p-10');
  });

  it("size='lg' scales the title to text-base for hierarchy", () => {
    render(<EmptyState title="Big empty" size="lg" />);
    expect(screen.getByText('Big empty').className).toContain('text-base');
  });

  it('renders a secondaryAction button when given { label, onClick }', () => {
    const onClick = vi.fn();
    render(
      <EmptyState
        title="Empty"
        secondaryAction={{ label: 'Learn more', onClick }}
      />,
    );
    const link = screen.getByTestId('empty-state-secondary-link');
    expect(link.tagName).toBe('BUTTON');
    expect(link.textContent).toBe('Learn more');
    fireEvent.click(link);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('renders a secondaryAction anchor when given { label, href }', () => {
    render(
      <EmptyState
        title="Empty"
        secondaryAction={{ label: 'Open docs', href: '/docs/empty' }}
      />,
    );
    const link = screen.getByTestId('empty-state-secondary-link');
    expect(link.tagName).toBe('A');
    expect(link.getAttribute('href')).toBe('/docs/empty');
    // Relative href does not get target=_blank.
    expect(link.getAttribute('target')).toBeNull();
  });

  it('http(s) secondaryAction hrefs open in a new tab with safe rel attrs', () => {
    render(
      <EmptyState
        title="Empty"
        secondaryAction={{
          label: 'External',
          href: 'https://example.com/docs',
        }}
      />,
    );
    const link = screen.getByTestId('empty-state-secondary-link');
    expect(link.getAttribute('target')).toBe('_blank');
    expect(link.getAttribute('rel')).toContain('noreferrer');
    expect(link.getAttribute('rel')).toContain('noopener');
  });

  it('omits the secondaryAction surface entirely when undefined', () => {
    render(<EmptyState title="Empty" />);
    expect(
      screen.queryByTestId('empty-state-secondary-link'),
    ).not.toBeInTheDocument();
  });

  it('renders primary action and secondary link together', () => {
    const primary = vi.fn();
    const secondary = vi.fn();
    render(
      <EmptyState
        title="Empty"
        action={{ label: 'Primary', onClick: primary }}
        secondaryAction={{ label: 'Secondary', onClick: secondary }}
      />,
    );
    expect(
      screen.getByRole('button', { name: 'Primary' }),
    ).toBeInTheDocument();
    expect(screen.getByTestId('empty-state-secondary-link')).toBeInTheDocument();
  });
});
