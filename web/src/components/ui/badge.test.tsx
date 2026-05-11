import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Badge } from './badge';

describe('<Badge>', () => {
  it('renders a <span> carrying the children as text', () => {
    render(<Badge>idle</Badge>);
    const node = screen.getByText('idle');
    expect(node).toBeInTheDocument();
    expect(node.tagName).toBe('SPAN');
  });

  it('applies the default variant classes when no variant is passed', () => {
    render(<Badge>x</Badge>);
    expect(screen.getByText('x')).toHaveClass('bg-primary');
  });

  it('applies the destructive variant classes', () => {
    render(<Badge variant="destructive">err</Badge>);
    expect(screen.getByText('err')).toHaveClass('bg-destructive');
  });

  it('applies the success variant classes', () => {
    render(<Badge variant="success">ok</Badge>);
    const node = screen.getByText('ok');
    expect(node.className).toContain('emerald-500');
  });

  it('applies the warning variant classes', () => {
    render(<Badge variant="warning">busy</Badge>);
    const node = screen.getByText('busy');
    expect(node.className).toContain('amber-500');
  });

  it('merges caller-provided className with the variant classes', () => {
    render(<Badge className="my-tag">tag</Badge>);
    const node = screen.getByText('tag');
    expect(node).toHaveClass('my-tag');
    expect(node).toHaveClass('rounded-full');
  });

  it('forwards arbitrary HTML attributes (e.g. data-* / aria-*) to the span', () => {
    render(
      <Badge data-testid="badge-1" aria-label="status">
        s
      </Badge>,
    );
    const node = screen.getByTestId('badge-1');
    expect(node).toHaveAttribute('aria-label', 'status');
  });
});
