import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ErrorState } from './error-state';

describe('<ErrorState>', () => {
  it('renders the title text', () => {
    render(<ErrorState title="Something broke" />);
    expect(screen.getByText('Something broke')).toBeInTheDocument();
  });

  it('renders the description when provided', () => {
    render(
      <ErrorState
        title="Failed"
        description="The server returned 500"
      />,
    );
    expect(screen.getByText('The server returned 500')).toBeInTheDocument();
  });

  it('renders an Error.message when error is an Error instance', () => {
    render(
      <ErrorState
        title="Failed"
        error={new Error('boom: deep failure')}
      />,
    );
    expect(screen.getByText('boom: deep failure')).toBeInTheDocument();
  });

  it('renders the raw string when error is a string', () => {
    render(<ErrorState title="Failed" error="raw network error" />);
    expect(screen.getByText('raw network error')).toBeInTheDocument();
  });

  it('renders a retry button + fires onRetry on click', () => {
    const onRetry = vi.fn();
    render(<ErrorState title="Failed" onRetry={onRetry} />);
    const btn = screen.getByRole('button', { name: 'Retry' });
    fireEvent.click(btn);
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('honors a custom retryLabel', () => {
    const onRetry = vi.fn();
    render(
      <ErrorState
        title="Failed"
        onRetry={onRetry}
        retryLabel="Try again"
      />,
    );
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
  });

  it('skips the retry button when onRetry is omitted', () => {
    render(<ErrorState title="Failed" />);
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('uses destructive accent on the title + icon', () => {
    const { container } = render(<ErrorState title="Bad" />);
    const title = screen.getByText('Bad');
    expect(title.className).toContain('text-destructive');
    const svg = container.querySelector('svg');
    expect(svg?.getAttribute('class')).toContain('text-destructive');
  });

  it('uses bg-secondary on the retry button', () => {
    render(<ErrorState title="Failed" onRetry={() => {}} />);
    const btn = screen.getByRole('button', { name: 'Retry' });
    expect(btn.className).toContain('bg-secondary');
    expect(btn.className).toContain('hover:bg-secondary/80');
  });

  it('sets role=alert on the wrapper for assistive tech', () => {
    const { container } = render(<ErrorState title="Bad" />);
    const wrapper = container.firstChild as HTMLElement;
    expect(wrapper).toHaveAttribute('role', 'alert');
  });

  it('merges caller className', () => {
    const { container } = render(<ErrorState title="x" className="my-err" />);
    const wrapper = container.firstChild as HTMLElement;
    expect(wrapper).toHaveClass('my-err');
    expect(wrapper).toHaveClass('bg-card');
  });
});
