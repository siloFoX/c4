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
});
