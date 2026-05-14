import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { DashboardGrid, DashboardGridItem } from './dashboard-grid';

describe('<DashboardGrid>', () => {
  it('renders children', () => {
    render(
      <DashboardGrid data-testid="grid">
        <span>hello</span>
      </DashboardGrid>,
    );
    expect(screen.getByText('hello')).toBeInTheDocument();
    expect(screen.getByTestId('grid')).toHaveClass('grid');
    expect(screen.getByTestId('grid')).toHaveClass('grid-cols-12');
  });

  it('defaults gap to md (gap-4)', () => {
    render(<DashboardGrid data-testid="g" />);
    expect(screen.getByTestId('g')).toHaveClass('gap-4');
  });

  it('gap=sm renders gap-2', () => {
    render(<DashboardGrid data-testid="g" gap="sm" />);
    expect(screen.getByTestId('g')).toHaveClass('gap-2');
  });

  it('gap=lg renders gap-6', () => {
    render(<DashboardGrid data-testid="g" gap="lg" />);
    expect(screen.getByTestId('g')).toHaveClass('gap-6');
  });

  it('Item with span=6 sets col-span-6', () => {
    render(<DashboardGridItem data-testid="it" span={6} />);
    expect(screen.getByTestId('it')).toHaveClass('col-span-6');
  });

  it("Item with span='full' sets col-span-full (also the default)", () => {
    render(<DashboardGridItem data-testid="it" span="full" />);
    expect(screen.getByTestId('it')).toHaveClass('col-span-full');
  });

  it('Item default span is full', () => {
    render(<DashboardGridItem data-testid="it" />);
    expect(screen.getByTestId('it')).toHaveClass('col-span-full');
  });

  it('Item with smSpan=12 includes sm:col-span-12', () => {
    render(<DashboardGridItem data-testid="it" smSpan={12} />);
    expect(screen.getByTestId('it').className).toContain('sm:col-span-12');
  });

  it('Item with mdSpan=6 includes md:col-span-6', () => {
    render(<DashboardGridItem data-testid="it" mdSpan={6} />);
    expect(screen.getByTestId('it').className).toContain('md:col-span-6');
  });

  it('Item with lgSpan=4 includes lg:col-span-4', () => {
    render(<DashboardGridItem data-testid="it" lgSpan={4} />);
    expect(screen.getByTestId('it').className).toContain('lg:col-span-4');
  });

  it('combined breakpoints all present', () => {
    render(
      <DashboardGridItem
        data-testid="it"
        span={12}
        smSpan={6}
        mdSpan={4}
        lgSpan={3}
      />,
    );
    const node = screen.getByTestId('it');
    expect(node.className).toContain('col-span-12');
    expect(node.className).toContain('sm:col-span-6');
    expect(node.className).toContain('md:col-span-4');
    expect(node.className).toContain('lg:col-span-3');
  });

  it('merges className on grid and item', () => {
    render(
      <DashboardGrid data-testid="g" className="custom-grid">
        <DashboardGridItem data-testid="it" className="custom-item" span={6} />
      </DashboardGrid>,
    );
    expect(screen.getByTestId('g')).toHaveClass('custom-grid');
    expect(screen.getByTestId('g')).toHaveClass('grid-cols-12');
    expect(screen.getByTestId('it')).toHaveClass('custom-item');
    expect(screen.getByTestId('it')).toHaveClass('col-span-6');
  });

  it('exposes DashboardGrid.Item as the same component as DashboardGridItem', () => {
    expect(DashboardGrid.Item).toBe(DashboardGridItem);
  });
});
