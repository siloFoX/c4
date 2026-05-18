import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Timeline } from './timeline';
import type { TimelineItem } from './timeline';

const baseItems: TimelineItem[] = [
  {
    id: 'a',
    timestamp: '2026-05-12T10:00:00Z',
    title: 'Alpha event',
    description: 'first one',
    tone: 'primary',
  },
  {
    id: 'b',
    timestamp: '2026-05-12T14:00:00Z',
    title: 'Bravo event',
    description: 'second one',
    tone: 'success',
  },
  {
    id: 'c',
    timestamp: '2026-05-13T09:00:00Z',
    title: 'Charlie event',
    tone: 'warning',
  },
];

describe('<Timeline>', () => {
  it('renders every item title', () => {
    render(<Timeline items={baseItems} />);
    expect(screen.getByText('Alpha event')).toBeInTheDocument();
    expect(screen.getByText('Bravo event')).toBeInTheDocument();
    expect(screen.getByText('Charlie event')).toBeInTheDocument();
  });

  it('renders a localised timestamp for every item', () => {
    const { container } = render(<Timeline items={baseItems} />);
    const stamps = container.querySelectorAll(
      '[data-timeline-item] > div > div:first-child',
    );
    expect(stamps).toHaveLength(baseItems.length);
    for (const node of Array.from(stamps)) {
      expect((node.textContent ?? '').length).toBeGreaterThan(0);
    }
  });

  it('renders both title and description text when provided', () => {
    render(<Timeline items={baseItems.slice(0, 1)} />);
    expect(screen.getByText('Alpha event')).toBeInTheDocument();
    expect(screen.getByText('first one')).toBeInTheDocument();
  });

  it('renders an icon when provided', () => {
    const items: TimelineItem[] = [
      {
        id: 'x',
        timestamp: '2026-05-12T10:00:00Z',
        title: 'with icon',
        icon: <span data-testid="ti-icon">i</span>,
      },
    ];
    render(<Timeline items={items} />);
    expect(screen.getByTestId('ti-icon')).toBeInTheDocument();
  });

  it('applies the tone via data-tone and dot class', () => {
    const { container } = render(
      <Timeline
        items={[
          {
            id: 'd',
            timestamp: '2026-05-12T10:00:00Z',
            title: 'danger',
            tone: 'danger',
          },
        ]}
      />,
    );
    const item = container.querySelector('[data-timeline-item]');
    expect(item).not.toBeNull();
    expect(item!.getAttribute('data-tone')).toBe('danger');
    const dot = item!.querySelector('[data-timeline-dot]');
    expect(dot).not.toBeNull();
    expect(dot!.className).toContain('bg-destructive');
  });

  it('creates a day header per group when groupByDay is true', () => {
    const { container } = render(
      <Timeline items={baseItems} groupByDay />,
    );
    const headers = container.querySelectorAll('[data-timeline-day-header]');
    expect(headers).toHaveLength(2);
    expect(headers[0].getAttribute('data-timeline-day-header')).toBe(
      '2026-05-12',
    );
    expect(headers[1].getAttribute('data-timeline-day-header')).toBe(
      '2026-05-13',
    );
  });

  it('omits day headers when groupByDay is off', () => {
    const { container } = render(<Timeline items={baseItems} />);
    expect(
      container.querySelectorAll('[data-timeline-day-header]'),
    ).toHaveLength(0);
  });

  it('renders an empty list when items is empty', () => {
    const { container } = render(<Timeline items={[]} />);
    const list = container.querySelector('[data-timeline]');
    expect(list).not.toBeNull();
    expect(list!.querySelectorAll('[data-timeline-item]')).toHaveLength(0);
  });

  it('merges custom className onto the root ol', () => {
    const { container } = render(
      <Timeline items={baseItems} className="custom-x" />,
    );
    const list = container.querySelector('[data-timeline]');
    expect(list).not.toBeNull();
    expect(list!.className).toContain('custom-x');
    expect(list!.className).toContain('flex');
  });

  it('omits the connector below the last item in a group', () => {
    const { container } = render(<Timeline items={baseItems} />);
    const rows = container.querySelectorAll('[data-timeline-item]');
    expect(rows).toHaveLength(3);
    const last = rows[rows.length - 1];
    expect(last!.querySelector('[data-timeline-connector]')).toBeNull();
    const first = rows[0];
    expect(first!.querySelector('[data-timeline-connector]')).not.toBeNull();
  });

  // -- v1.11.395 variants (TODO 11.377) ---------------------------

  it('default variant maps to legacy classes byte-identical', () => {
    const { container } = render(<Timeline items={baseItems} />);
    const root = container.querySelector('[data-timeline]') as HTMLElement;
    expect(root.getAttribute('data-variant')).toBe('default');
    const row = container.querySelector(
      '[data-timeline-item]',
    ) as HTMLElement;
    expect(row.className).toContain('pb-4');
    expect(row.className).toContain('pl-6');
    expect(row.className).toContain('gap-3');
    const title = row.querySelector(
      '[data-timeline-title]',
    ) as HTMLElement;
    expect(title.className).toContain('text-sm');
  });

  it('compact variant uses tighter spacing + smaller dot', () => {
    const { container } = render(
      <Timeline items={baseItems} variant="compact" />,
    );
    const root = container.querySelector('[data-timeline]') as HTMLElement;
    expect(root.getAttribute('data-variant')).toBe('compact');
    const row = container.querySelector(
      '[data-timeline-item]',
    ) as HTMLElement;
    expect(row.className).toContain('pb-2');
    expect(row.className).toContain('pl-5');
    expect(row.className).toContain('gap-2');
    const dot = container.querySelector(
      '[data-timeline-dot]',
    ) as HTMLElement;
    expect(dot.className).toContain('h-3');
    expect(dot.className).toContain('w-3');
    const title = container.querySelector(
      '[data-timeline-title]',
    ) as HTMLElement;
    expect(title.className).toContain('text-xs');
  });

  it('compact variant still renders the description block', () => {
    const items = [
      {
        id: 'a',
        timestamp: '2026-05-18T10:00:00Z',
        title: 'Alpha',
        description: 'first event',
      },
    ];
    const { container } = render(
      <Timeline items={items} variant="compact" />,
    );
    expect(
      container.querySelector('[data-timeline-description]'),
    ).toHaveTextContent('first event');
  });

  it('dense variant collapses to a single line + drops description block', () => {
    const items = [
      {
        id: 'a',
        timestamp: '2026-05-18T10:00:00Z',
        title: 'Alpha',
        description: 'never visible',
      },
    ];
    const { container } = render(
      <Timeline items={items} variant="dense" />,
    );
    const root = container.querySelector('[data-timeline]') as HTMLElement;
    expect(root.getAttribute('data-variant')).toBe('dense');
    const row = container.querySelector(
      '[data-timeline-item]',
    ) as HTMLElement;
    expect(row.className).toContain('pb-1');
    expect(row.className).toContain('items-center');
    // Description block is omitted in dense mode.
    expect(
      container.querySelector('[data-timeline-description]'),
    ).toBeNull();
    // Title + timestamp still render side-by-side as spans.
    expect(
      container.querySelector('[data-timeline-title]'),
    ).toHaveTextContent('Alpha');
    expect(
      container.querySelector('[data-timeline-timestamp]'),
    ).not.toBeNull();
  });

  it('dense variant suppresses the icon inside the dot', () => {
    const items = [
      {
        id: 'a',
        timestamp: '2026-05-18T10:00:00Z',
        title: 'Alpha',
        icon: <span data-testid="my-icon">*</span>,
      },
    ];
    const { container } = render(
      <Timeline items={items} variant="dense" />,
    );
    // Dense drops the icon visually (the 8px dot is too
    // small to host a glyph).
    expect(container.querySelector('[data-testid="my-icon"]')).toBeNull();
  });

  it('variant prop carries through to grouped mode', () => {
    const items = [
      { id: '1', timestamp: '2026-05-18T10:00:00Z', title: 'A' },
      { id: '2', timestamp: '2026-05-19T10:00:00Z', title: 'B' },
    ];
    const { container } = render(
      <Timeline items={items} groupByDay variant="compact" />,
    );
    const root = container.querySelector('[data-timeline]') as HTMLElement;
    expect(root.getAttribute('data-grouped')).toBe('day');
    expect(root.getAttribute('data-variant')).toBe('compact');
    const rows = container.querySelectorAll('[data-timeline-item]');
    rows.forEach((row) => {
      expect((row as HTMLElement).getAttribute('data-variant')).toBe('compact');
    });
  });

  it('per-row data-variant attr mirrors the prop', () => {
    const { container, rerender } = render(<Timeline items={baseItems} />);
    let row = container.querySelector(
      '[data-timeline-item]',
    ) as HTMLElement;
    expect(row.getAttribute('data-variant')).toBe('default');
    rerender(<Timeline items={baseItems} variant="dense" />);
    row = container.querySelector('[data-timeline-item]') as HTMLElement;
    expect(row.getAttribute('data-variant')).toBe('dense');
  });
});
