import { describe, it, expect, beforeEach } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import EmptyState from './EmptyState';
import { setLocale } from '../../lib/i18n';

beforeEach(() => {
  setLocale('en');
});

describe('<EmptyState>', () => {
  it('renders the worker detail title from the i18n bundle', () => {
    render(<EmptyState />);
    expect(screen.getByText('Worker detail')).toBeInTheDocument();
  });

  it('renders the worker detail description from the i18n bundle', () => {
    render(<EmptyState />);
    expect(
      screen.getByText('Select a worker from the sidebar to view details.'),
    ).toBeInTheDocument();
  });

  it('wraps the title + description in a Card with the rounded outer border', () => {
    const { container } = render(<EmptyState />);
    const card = container.querySelector('.rounded-xl.border');
    expect(card).not.toBeNull();
  });

  it('applies the bg-card surface class to the outer Card wrapper', () => {
    const { container } = render(<EmptyState />);
    const card = container.querySelector('.rounded-xl.border');
    expect(card).toHaveClass('bg-card');
  });

  it('renders the title and description inside the same CardHeader stack', () => {
    const { container } = render(<EmptyState />);
    const title = screen.getByText('Worker detail');
    const description = screen.getByText(
      'Select a worker from the sidebar to view details.',
    );
    const header = container.querySelector('.flex.flex-col.gap-1\\.5');
    expect(header).not.toBeNull();
    expect(header!.contains(title)).toBe(true);
    expect(header!.contains(description)).toBe(true);
  });

  it('renders the title with the leading font-semibold CardTitle class', () => {
    render(<EmptyState />);
    expect(screen.getByText('Worker detail')).toHaveClass('font-semibold');
  });

  it('renders the description with the muted-foreground CardDescription class', () => {
    render(<EmptyState />);
    expect(
      screen.getByText('Select a worker from the sidebar to view details.'),
    ).toHaveClass('text-muted-foreground');
  });

  it('does not render any action buttons (this empty state is read-only)', () => {
    render(<EmptyState />);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('does not render a CardContent body (header-only layout)', () => {
    const { container } = render(<EmptyState />);
    // CardContent uses the `p-6 pt-0` pair; CardHeader is `p-6` (no pt-0).
    const cardContent = container.querySelector('.p-6.pt-0');
    expect(cardContent).toBeNull();
  });

  it('re-renders translated copy when the locale flips to ko', () => {
    render(<EmptyState />);
    expect(screen.getByText('Worker detail')).toBeInTheDocument();
    // useLocale subscribes to the c4:locale-changed event and forces a
    // re-render via setState. Outside a React event handler that
    // update is not auto-flushed, so wrap setLocale in act().
    act(() => {
      setLocale('ko');
    });
    expect(screen.queryByText('Worker detail')).not.toBeInTheDocument();
  });

  it('uses the ko bundle when locale is preset to ko before mount', () => {
    setLocale('ko');
    render(<EmptyState />);
    // ko bundle defines a localized title; the English copy should not
    // appear in the rendered tree.
    expect(screen.queryByText('Worker detail')).not.toBeInTheDocument();
    expect(
      screen.queryByText('Select a worker from the sidebar to view details.'),
    ).not.toBeInTheDocument();
  });

  it('keeps the rendered tree at a single Card root', () => {
    const { container } = render(<EmptyState />);
    expect(container.children).toHaveLength(1);
  });
});
