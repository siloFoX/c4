import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createRef } from 'react';
import { render, screen, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DataList, type DataListItem, type DataListGroup } from './data-list';
import { DEFAULT_DENSITY, DENSITY_EVENT } from '../../hooks/use-density';

const baseItems: DataListItem[] = [
  { id: 'pid', label: 'PID', value: '12345' },
  { id: 'uptime', label: 'Uptime', value: '2h' },
  { id: 'branch', label: 'Branch', value: 'c4/main' },
];

describe('<DataList>', () => {
  beforeEach(() => {
    // (v1.11.277, TODO 11.259) jsdom now treats navigator.clipboard
    // as a getter-only property in newer builds. Use
    // defineProperty so subsequent test files can still stub
    // their own clipboard without inheriting our shape.
    try {
      Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        value: { writeText: vi.fn().mockResolvedValue(undefined) },
      });
    } catch {
      // Older jsdom: fall back to direct assignment.
      // (eslint-disable-next-line @typescript-eslint/no-explicit-any)
      (navigator as unknown as { clipboard: unknown }).clipboard = {
        writeText: vi.fn().mockResolvedValue(undefined),
      };
    }
    // Reset density state between cases so the runtime-change
    // test doesn't bleed into others.
    try {
      window.localStorage.removeItem('c4:density');
    } catch {
      /* ignore */
    }
    // Force a "comfortable" default by dispatching the custom
    // event; jsdom doesn't run useEffect on the previous render
    // for us so this is a no-op when no DataList is mounted.
    try {
      window.dispatchEvent(
        new CustomEvent(DENSITY_EVENT, {
          detail: { density: 'comfortable' },
        }),
      );
    } catch {
      /* ignore */
    }
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('renders all label/value pairs', () => {
    render(<DataList items={baseItems} />);
    expect(screen.getByText('PID')).toBeInTheDocument();
    expect(screen.getByText('12345')).toBeInTheDocument();
    expect(screen.getByText('Uptime')).toBeInTheDocument();
    expect(screen.getByText('2h')).toBeInTheDocument();
    expect(screen.getByText('Branch')).toBeInTheDocument();
    expect(screen.getByText('c4/main')).toBeInTheDocument();
  });

  it('defaults to horizontal orientation', () => {
    const { container } = render(<DataList items={baseItems} />);
    const dl = container.querySelector('dl');
    expect(dl).not.toBeNull();
    expect(dl?.getAttribute('data-orientation')).toBe('horizontal');
  });

  it('applies vertical orientation when requested', () => {
    const { container } = render(
      <DataList items={baseItems} orientation="vertical" />,
    );
    const dl = container.querySelector('dl');
    expect(dl?.getAttribute('data-orientation')).toBe('vertical');
  });

  it('renders a copy button when copyValue is provided', () => {
    render(
      <DataList
        items={[
          { id: 'sid', label: 'Session', value: 'abc-123', copyValue: 'abc-123' },
        ]}
      />,
    );
    expect(screen.getByRole('button', { name: 'Copy Session' })).toBeInTheDocument();
  });

  it('does NOT render a copy button when copyValue is absent', () => {
    render(
      <DataList
        items={[{ id: 'sid', label: 'Session', value: 'abc-123' }]}
      />,
    );
    expect(screen.queryByRole('button', { name: /Copy/ })).toBeNull();
  });

  it('invokes navigator.clipboard.writeText with the copyValue on click', async () => {
    render(
      <DataList
        items={[
          { id: 'sid', label: 'Session', value: 'abc-123', copyValue: 'abc-123' },
        ]}
      />,
    );
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Copy Session' }));
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith('abc-123');
  });

  it('shows a Check icon transiently after copy and reverts after the timer', async () => {
    vi.useFakeTimers();
    render(
      <DataList
        items={[
          { id: 'sid', label: 'Session', value: 'abc-123', copyValue: 'abc-123' },
        ]}
      />,
    );
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const btn = screen.getByRole('button', { name: 'Copy Session' });
    await user.click(btn);
    expect(btn.getAttribute('data-copied')).toBe('true');
    act(() => {
      vi.advanceTimersByTime(1300);
    });
    expect(btn.getAttribute('data-copied')).toBeNull();
  });

  it('adds truncate class and title attribute when truncate=true with string value', () => {
    const { container } = render(
      <DataList
        items={[
          { id: 'path', label: 'Path', value: '/some/very/long/path/to/file', truncate: true },
        ]}
      />,
    );
    const truncated = container.querySelector('.truncate');
    expect(truncated).not.toBeNull();
    expect(truncated?.getAttribute('title')).toBe('/some/very/long/path/to/file');
  });

  it('merges caller-provided className with the dl root', () => {
    const { container } = render(
      <DataList items={baseItems} className="custom-list" />,
    );
    const dl = container.querySelector('dl');
    expect(dl?.className).toContain('custom-list');
    expect(dl?.className).toContain('flex');
  });

  it('forwards refs to the dl element', () => {
    const ref = createRef<HTMLDListElement>();
    render(<DataList items={baseItems} ref={ref} />);
    expect(ref.current).not.toBeNull();
    expect(ref.current).toBeInstanceOf(HTMLDListElement);
  });

  // (v1.11.277, TODO 11.259) Density + grouped sections + scrubber.

  it('reads operator density off the useDensity hook by default', () => {
    const { container } = render(<DataList items={baseItems} />);
    const dl = container.querySelector('dl');
    // Default density is "comfortable" when no operator override
    // is set -- the legacy gap rhythm.
    expect(dl?.getAttribute('data-density')).toBe(DEFAULT_DENSITY);
  });

  it('respects an explicit density override', () => {
    const { container } = render(
      <DataList items={baseItems} density="compact" />,
    );
    const dl = container.querySelector('dl');
    expect(dl?.getAttribute('data-density')).toBe('compact');
    expect(dl?.className).toContain('gap-0.5');
  });

  it('cozy density uses the relaxed gap', () => {
    const { container } = render(
      <DataList items={baseItems} density="cozy" />,
    );
    const dl = container.querySelector('dl');
    expect(dl?.getAttribute('data-density')).toBe('cozy');
    expect(dl?.className).toContain('gap-2');
  });

  it('density="auto" reflects a runtime operator density change', () => {
    const { container } = render(<DataList items={baseItems} />);
    const dl = container.querySelector('dl');
    expect(dl?.getAttribute('data-density')).toBe('comfortable');
    act(() => {
      window.dispatchEvent(
        new CustomEvent(DENSITY_EVENT, {
          detail: { density: 'compact' },
        }),
      );
    });
    expect(dl?.getAttribute('data-density')).toBe('compact');
  });

  it('horizontal comfortable default maps to gap-1 (byte-identical with legacy)', () => {
    const { container } = render(<DataList items={baseItems} />);
    const dl = container.querySelector('dl');
    expect(dl?.className).toContain('gap-1');
  });

  it('vertical comfortable default maps to gap-2 (byte-identical with legacy)', () => {
    const { container } = render(
      <DataList items={baseItems} orientation="vertical" />,
    );
    const dl = container.querySelector('dl');
    expect(dl?.className).toContain('gap-2');
  });

  const grouped: DataListGroup[] = [
    {
      id: 'identity',
      title: 'Identity',
      items: [
        { id: 'name', label: 'Name', value: 'alpha-w1' },
        { id: 'branch', label: 'Branch', value: 'c4/foo' },
      ],
    },
    {
      id: 'runtime',
      title: 'Runtime',
      items: [
        { id: 'pid', label: 'PID', value: '12345' },
        { id: 'uptime', label: 'Uptime', value: '2h' },
      ],
    },
    {
      id: 'misc',
      title: 'Misc',
      items: [{ id: 'extra', label: 'Extra', value: '-' }],
    },
  ];

  it('renders one <section> per group when `groups` is provided', () => {
    const { container } = render(<DataList groups={grouped} />);
    const sections = container.querySelectorAll('section');
    expect(sections).toHaveLength(3);
  });

  it('renders each group header with the group title', () => {
    const { container } = render(<DataList groups={grouped} />);
    // The same title also appears inside the scrubber chip, so
    // address the header by its data-attribute rather than by
    // text alone.
    expect(
      container.querySelector('[data-data-list-group-header="identity"]')
        ?.textContent,
    ).toContain('Identity');
    expect(
      container.querySelector('[data-data-list-group-header="runtime"]')
        ?.textContent,
    ).toContain('Runtime');
    expect(
      container.querySelector('[data-data-list-group-header="misc"]')
        ?.textContent,
    ).toContain('Misc');
  });

  it('exposes `data-section="data-list-grouped"` on the dl root when grouped', () => {
    const { container } = render(<DataList groups={grouped} />);
    const dl = container.querySelector('dl');
    expect(dl?.getAttribute('data-section')).toBe('data-list-grouped');
  });

  it('exposes `data-section="data-list"` on the flat root', () => {
    const { container } = render(<DataList items={baseItems} />);
    const dl = container.querySelector('dl');
    expect(dl?.getAttribute('data-section')).toBe('data-list');
  });

  it('tags each group header with `data-data-list-group-header=<id>`', () => {
    const { container } = render(<DataList groups={grouped} />);
    expect(
      container.querySelector('[data-data-list-group-header="identity"]'),
    ).not.toBeNull();
    expect(
      container.querySelector('[data-data-list-group-header="runtime"]'),
    ).not.toBeNull();
  });

  it('pins group headers with the sticky class when stickyHeaders is on (default for groups)', () => {
    const { container } = render(<DataList groups={grouped} />);
    const header = container.querySelector(
      '[data-data-list-group-header="identity"]',
    );
    expect(header?.className).toContain('sticky');
    expect(header?.className).toContain('top-0');
  });

  it('omits the sticky class when stickyHeaders is explicitly false', () => {
    const { container } = render(
      <DataList groups={grouped} stickyHeaders={false} />,
    );
    const header = container.querySelector(
      '[data-data-list-group-header="identity"]',
    );
    expect(header?.className).not.toContain('sticky');
  });

  it('initial `data-active-group` is the first group id', () => {
    const { container } = render(<DataList groups={grouped} />);
    const dl = container.querySelector('dl');
    expect(dl?.getAttribute('data-active-group')).toBe('identity');
  });

  it('renders the hover scrubber when groups.length >= 2', () => {
    const { container } = render(<DataList groups={grouped} />);
    expect(
      container.querySelector('[data-data-list-scrubber="true"]'),
    ).not.toBeNull();
  });

  it('hides the hover scrubber when groups.length == 1', () => {
    const single: DataListGroup[] = [{
      id: 'only',
      title: 'Only',
      items: [{ id: 'k', label: 'K', value: 'V' }],
    }];
    const { container } = render(<DataList groups={single} />);
    expect(
      container.querySelector('[data-data-list-scrubber="true"]'),
    ).toBeNull();
  });

  it('respects an explicit `scrubber={false}` override even with multiple groups', () => {
    const { container } = render(
      <DataList groups={grouped} scrubber={false} />,
    );
    expect(
      container.querySelector('[data-data-list-scrubber="true"]'),
    ).toBeNull();
  });

  it('renders one scrubber chip per group with `data-data-list-scrubber-chip=<id>`', () => {
    const { container } = render(<DataList groups={grouped} />);
    const chips = container.querySelectorAll('[data-data-list-scrubber-chip]');
    expect(chips).toHaveLength(3);
  });

  it('marks the active group chip with `data-active=true`', () => {
    const { container } = render(<DataList groups={grouped} />);
    const activeChip = container.querySelector(
      '[data-data-list-scrubber-chip="identity"]',
    );
    const otherChip = container.querySelector(
      '[data-data-list-scrubber-chip="runtime"]',
    );
    expect(activeChip?.getAttribute('data-active')).toBe('true');
    expect(otherChip?.getAttribute('data-active')).toBe('false');
  });

  it('clicking a scrubber chip flips `data-active-group` to that chip\'s id', async () => {
    const user = userEvent.setup();
    const { container } = render(<DataList groups={grouped} />);
    const runtimeChip = container.querySelector(
      '[data-data-list-scrubber-chip="runtime"]',
    ) as HTMLButtonElement;
    await user.click(runtimeChip);
    const dl = container.querySelector('dl');
    expect(dl?.getAttribute('data-active-group')).toBe('runtime');
    expect(runtimeChip.getAttribute('data-active')).toBe('true');
  });

  it('renders every item across every group', () => {
    render(<DataList groups={grouped} />);
    expect(screen.getByText('alpha-w1')).toBeInTheDocument();
    expect(screen.getByText('12345')).toBeInTheDocument();
    expect(screen.getByText('Extra')).toBeInTheDocument();
  });

  it('appends ungrouped `items` before the first group when both are passed', () => {
    const { container } = render(
      <DataList items={baseItems} groups={grouped} />,
    );
    // The ungrouped rows render as direct children of the <dl>;
    // they have `data-data-list-row` and are NOT inside any
    // <section>. Pick the first such row and verify it's the
    // pid row from baseItems (not the section that comes
    // after).
    const rows = container.querySelectorAll(
      'dl > [data-data-list-row]',
    );
    expect(rows.length).toBe(baseItems.length);
    expect(rows[0]!.getAttribute('data-data-list-row')).toBe('pid');
  });

  it('jumping via the scrubber calls scrollIntoView on the first row of the target group', async () => {
    const scrollSpy = vi.fn();
    const orig = window.HTMLElement.prototype.scrollIntoView;
    window.HTMLElement.prototype.scrollIntoView = scrollSpy;
    try {
      const user = userEvent.setup();
      const { container } = render(<DataList groups={grouped} />);
      const miscChip = container.querySelector(
        '[data-data-list-scrubber-chip="misc"]',
      ) as HTMLButtonElement;
      await user.click(miscChip);
      expect(scrollSpy).toHaveBeenCalled();
    } finally {
      window.HTMLElement.prototype.scrollIntoView = orig;
    }
  });

  it('tags every row with `data-data-list-row=<id>` so e2e can address them', () => {
    const { container } = render(<DataList items={baseItems} />);
    expect(
      container.querySelector('[data-data-list-row="pid"]'),
    ).not.toBeNull();
    expect(
      container.querySelector('[data-data-list-row="uptime"]'),
    ).not.toBeNull();
  });

  it('the first row of a group exposes `data-group-id=<id>` as a sentinel for IO observation', () => {
    const { container } = render(<DataList groups={grouped} />);
    const firstIdentityRow = container.querySelector(
      'section[data-data-list-group="identity"] [data-data-list-row]',
    ) as HTMLElement;
    expect(firstIdentityRow.dataset['groupId']).toBe('identity');
  });
});
