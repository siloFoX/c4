import { describe, it, expect, vi } from 'vitest';
import { createRef } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Chip } from './chip';

describe('<Chip>', () => {
  it('renders children text', () => {
    render(<Chip>hello</Chip>);
    expect(screen.getByText('hello')).toBeInTheDocument();
  });

  it('applies the default subtle/neutral classes', () => {
    const { container } = render(<Chip>x</Chip>);
    const root = container.firstChild as HTMLElement;
    expect(root.className).toContain('bg-muted');
    expect(root.className).toContain('text-muted-foreground');
  });

  it('applies solid variant + primary tone classes', () => {
    const { container } = render(<Chip variant="solid" tone="primary">x</Chip>);
    const root = container.firstChild as HTMLElement;
    expect(root.className).toContain('bg-primary');
    expect(root.className).toContain('text-primary-foreground');
  });

  it('applies outline variant classes', () => {
    const { container } = render(<Chip variant="outline" tone="neutral">x</Chip>);
    const root = container.firstChild as HTMLElement;
    expect(root.className).toContain('bg-transparent');
    expect(root.className).toContain('border-border');
  });

  it('applies success / warning / danger tone classes', () => {
    const { rerender, container } = render(<Chip tone="success">a</Chip>);
    expect((container.firstChild as HTMLElement).className).toContain('bg-success');
    rerender(<Chip tone="warning">a</Chip>);
    expect((container.firstChild as HTMLElement).className).toContain('bg-warning');
    rerender(<Chip tone="danger">a</Chip>);
    expect((container.firstChild as HTMLElement).className).toContain('bg-destructive');
  });

  it('applies size sm and md classes', () => {
    const { rerender, container } = render(<Chip size="sm">a</Chip>);
    expect((container.firstChild as HTMLElement).className).toContain('text-[11px]');
    rerender(<Chip size="md">a</Chip>);
    expect((container.firstChild as HTMLElement).className).toContain('text-xs');
  });

  it('renders the leading icon when provided', () => {
    render(<Chip icon={<span data-testid="ico">i</span>}>hi</Chip>);
    expect(screen.getByTestId('ico')).toBeInTheDocument();
  });

  it('does not render an icon wrapper when icon is absent', () => {
    const { container } = render(<Chip>hi</Chip>);
    const root = container.firstChild as HTMLElement;
    expect(root.querySelector('[aria-hidden]')).toBeNull();
  });

  it('renders a dismiss button when onDismiss is provided', () => {
    render(<Chip onDismiss={() => undefined}>hi</Chip>);
    expect(screen.getByRole('button', { name: 'Remove' })).toBeInTheDocument();
  });

  it('fires onDismiss when the dismiss button is clicked', async () => {
    const onDismiss = vi.fn();
    render(<Chip onDismiss={onDismiss}>hi</Chip>);
    await userEvent.click(screen.getByRole('button', { name: 'Remove' }));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('omits the dismiss button when onDismiss is absent', () => {
    render(<Chip>hi</Chip>);
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('uses a custom dismissLabel when supplied', () => {
    render(<Chip onDismiss={() => undefined} dismissLabel="Delete tag">hi</Chip>);
    expect(screen.getByRole('button', { name: 'Delete tag' })).toBeInTheDocument();
  });

  it('merges caller-provided className with variant classes', () => {
    const { container } = render(<Chip className="my-chip">x</Chip>);
    const root = container.firstChild as HTMLElement;
    expect(root.className).toContain('my-chip');
    expect(root.className).toContain('rounded-full');
  });

  it('forwards refs to the root span', () => {
    const ref = createRef<HTMLSpanElement>();
    render(<Chip ref={ref}>x</Chip>);
    expect(ref.current).toBeInstanceOf(HTMLSpanElement);
  });
});
