import { describe, it, expect } from 'vitest';
import { createRef } from 'react';
import { render, screen } from '@testing-library/react';
import { Breadcrumbs } from './breadcrumbs';
import type { BreadcrumbItem } from './breadcrumbs';

const baseItems: BreadcrumbItem[] = [
  { id: 'home', label: 'Home', href: '/' },
  { id: 'workers', label: 'Workers', href: '/workers' },
  { id: 'current', label: 'auto-w1' },
];

describe('<Breadcrumbs>', () => {
  it('renders a nav with aria-label="breadcrumb"', () => {
    render(<Breadcrumbs items={baseItems} />);
    expect(screen.getByRole('navigation', { name: 'breadcrumb' })).toBeInTheDocument();
  });

  it('renders all items inside an ol > li structure', () => {
    const { container } = render(<Breadcrumbs items={baseItems} />);
    const ol = container.querySelector('ol');
    expect(ol).not.toBeNull();
    const items = ol!.querySelectorAll('li:not([aria-hidden="true"])');
    expect(items).toHaveLength(3);
  });

  it('renders items with href as anchors', () => {
    render(<Breadcrumbs items={baseItems} />);
    const home = screen.getByRole('link', { name: 'Home' });
    expect(home).toHaveAttribute('href', '/');
    const workers = screen.getByRole('link', { name: 'Workers' });
    expect(workers).toHaveAttribute('href', '/workers');
  });

  it('renders the last item as a span with aria-current="page"', () => {
    render(<Breadcrumbs items={baseItems} />);
    const current = screen.getByText('auto-w1');
    expect(current.tagName).toBe('SPAN');
    expect(current).toHaveAttribute('aria-current', 'page');
  });

  it('renders an item with no href as current even when not last', () => {
    const items: BreadcrumbItem[] = [
      { id: 'a', label: 'A', href: '/a' },
      { id: 'b', label: 'B' },
      { id: 'c', label: 'C', href: '/c' },
    ];
    render(<Breadcrumbs items={items} />);
    const b = screen.getByText('B');
    expect(b.tagName).toBe('SPAN');
    expect(b).toHaveAttribute('aria-current', 'page');
  });

  it('renders a separator between items (default ChevronRight)', () => {
    const { container } = render(<Breadcrumbs items={baseItems} />);
    const separators = container.querySelectorAll('li[aria-hidden="true"]');
    expect(separators).toHaveLength(2);
    separators.forEach((sep) => {
      expect(sep.querySelector('svg')).not.toBeNull();
    });
  });

  it('uses a custom separator when provided', () => {
    const { container } = render(<Breadcrumbs items={baseItems} separator="/" />);
    const separators = container.querySelectorAll('li[aria-hidden="true"]');
    expect(separators).toHaveLength(2);
    separators.forEach((sep) => {
      expect(sep.textContent).toBe('/');
    });
  });

  it('renders 1 + ellipsis + 2 when maxItems=4 with 5 items (first + ellipsis + last (maxItems-2))', () => {
    const items: BreadcrumbItem[] = [
      { id: 'a', label: 'A', href: '/a' },
      { id: 'b', label: 'B', href: '/b' },
      { id: 'c', label: 'C', href: '/c' },
      { id: 'd', label: 'D', href: '/d' },
      { id: 'e', label: 'E' },
    ];
    const { container } = render(<Breadcrumbs items={items} maxItems={4} />);
    expect(screen.getByText('A')).toBeInTheDocument();
    expect(screen.queryByText('B')).toBeNull();
    expect(screen.queryByText('C')).toBeNull();
    expect(screen.getByText('D')).toBeInTheDocument();
    expect(screen.getByText('E')).toBeInTheDocument();
    const ellipsisBtn = container.querySelector('button[aria-label]');
    expect(ellipsisBtn).not.toBeNull();
    expect(ellipsisBtn!.textContent).toBe('...');
  });

  it('exposes collapsed labels via the ellipsis aria-label', () => {
    const items: BreadcrumbItem[] = [
      { id: 'a', label: 'A', href: '/a' },
      { id: 'b', label: 'B', href: '/b' },
      { id: 'c', label: 'C', href: '/c' },
      { id: 'd', label: 'D', href: '/d' },
      { id: 'e', label: 'E' },
    ];
    render(<Breadcrumbs items={items} maxItems={4} />);
    const ellipsis = screen.getByRole('button');
    const label = ellipsis.getAttribute('aria-label') || '';
    expect(label).toContain('B');
    expect(label).toContain('C');
  });

  it('merges caller-provided className onto the nav', () => {
    render(<Breadcrumbs items={baseItems} className="extra-class" data-testid="nav" />);
    expect(screen.getByTestId('nav')).toHaveClass('extra-class');
  });

  it('forwards a ref to the underlying <nav>', () => {
    const ref = createRef<HTMLElement>();
    render(<Breadcrumbs ref={ref} items={baseItems} />);
    expect(ref.current).toBeInstanceOf(HTMLElement);
    expect(ref.current?.tagName).toBe('NAV');
  });

  it('exposes a stable displayName', () => {
    expect(Breadcrumbs.displayName).toBe('Breadcrumbs');
  });
});
