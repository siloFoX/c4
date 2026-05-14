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
    expect(last.querySelector('[data-timeline-connector]')).toBeNull();
    const first = rows[0];
    expect(first.querySelector('[data-timeline-connector]')).not.toBeNull();
  });
});
