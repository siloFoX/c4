import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Skeleton } from './skeleton';

describe('<Skeleton>', () => {
  it('renders an animate-pulse + bg-muted node by default', () => {
    const { container } = render(<Skeleton />);
    const node = container.firstChild as HTMLElement;
    expect(node).toHaveClass('animate-pulse');
    expect(node).toHaveClass('bg-muted');
  });

  it('applies the rect variant classes by default', () => {
    const { container } = render(<Skeleton />);
    const node = container.firstChild as HTMLElement;
    expect(node).toHaveClass('rounded-md');
  });

  it('applies the avatar variant (rounded-full + 10x10)', () => {
    const { container } = render(<Skeleton variant="avatar" />);
    const node = container.firstChild as HTMLElement;
    expect(node).toHaveClass('rounded-full');
    expect(node).toHaveClass('h-10');
    expect(node).toHaveClass('w-10');
  });

  it('applies the row variant (h-8 + rounded-md)', () => {
    const { container } = render(<Skeleton variant="row" />);
    const node = container.firstChild as HTMLElement;
    expect(node).toHaveClass('h-8');
    expect(node).toHaveClass('rounded-md');
  });

  it('applies the card variant (h-32 + rounded-md)', () => {
    const { container } = render(<Skeleton variant="card" />);
    const node = container.firstChild as HTMLElement;
    expect(node).toHaveClass('h-32');
  });

  it('renders a single text-variant line by default', () => {
    const { container } = render(<Skeleton variant="text" />);
    const node = container.firstChild as HTMLElement;
    expect(node).toHaveClass('h-3');
    expect(node).toHaveClass('w-full');
  });

  it('renders N rows when lines is set on the text variant', () => {
    const { container } = render(<Skeleton variant="text" lines={4} />);
    const rows = container.querySelectorAll('[data-skeleton-line]');
    expect(rows).toHaveLength(4);
  });

  it('shortens the final text line for a more natural paragraph look', () => {
    const { container } = render(<Skeleton variant="text" lines={3} />);
    const rows = container.querySelectorAll('[data-skeleton-line]');
    expect(rows[2].className).toContain('w-4/5');
    expect(rows[0].className).not.toContain('w-4/5');
  });

  it('applies width / height props as inline style', () => {
    const { container } = render(<Skeleton width={120} height={20} />);
    const node = container.firstChild as HTMLElement;
    expect(node.style.width).toBe('120px');
    expect(node.style.height).toBe('20px');
  });

  it('accepts string width / height (passes through as-is)', () => {
    const { container } = render(<Skeleton width="50%" height="2rem" />);
    const node = container.firstChild as HTMLElement;
    expect(node.style.width).toBe('50%');
    expect(node.style.height).toBe('2rem');
  });

  it('merges caller className', () => {
    const { container } = render(<Skeleton className="my-sk" />);
    const node = container.firstChild as HTMLElement;
    expect(node).toHaveClass('my-sk');
    expect(node).toHaveClass('animate-pulse');
  });

  it('sets role=status + aria-hidden on the placeholder', () => {
    render(<Skeleton data-testid="sk" />);
    const node = screen.getByTestId('sk');
    expect(node).toHaveAttribute('role', 'status');
    expect(node).toHaveAttribute('aria-hidden', 'true');
  });
});
