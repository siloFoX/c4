import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { createRef } from 'react';
import {
  ChartGantt,
  DEFAULT_CHART_GANTT_BAR_COLOR,
  DEFAULT_CHART_GANTT_HEIGHT,
  DEFAULT_CHART_GANTT_LABEL_WIDTH,
  DEFAULT_CHART_GANTT_ROW_GAP,
  DEFAULT_CHART_GANTT_ROW_HEIGHT,
  DEFAULT_CHART_GANTT_TICK_COUNT,
  DEFAULT_CHART_GANTT_TODAY_COLOR,
  DEFAULT_CHART_GANTT_WIDTH,
  buildGanttDependencyPath,
  describeGanttChart,
  formatGanttDate,
  getGanttDateBounds,
  getGanttRangeRatio,
  getGanttTaskColor,
  getGanttTicks,
  parseGanttDate,
} from './chart-gantt';
import type { ChartGanttTask } from './chart-gantt';

const tasks: ChartGanttTask[] = [
  {
    id: 't1',
    label: 'Design',
    start: '2026-05-01',
    end: '2026-05-07',
    progress: 1,
  },
  {
    id: 't2',
    label: 'Build',
    start: '2026-05-05',
    end: '2026-05-15',
    progress: 0.6,
    dependencies: ['t1'],
  },
  {
    id: 't3',
    label: 'Ship',
    start: '2026-05-16',
    end: '2026-05-20',
    progress: 0,
    dependencies: ['t2'],
    color: '#ff00aa',
    group: 'release',
  },
];

describe('chart-gantt pure helpers', () => {
  describe('parseGanttDate', () => {
    it('passes through finite numbers', () => {
      expect(parseGanttDate(1747008000000)).toBe(1747008000000);
    });
    it('parses ISO date strings', () => {
      expect(parseGanttDate('2026-05-12')).toBe(
        Date.parse('2026-05-12'),
      );
    });
    it('returns null for non-finite numbers', () => {
      expect(parseGanttDate(Number.NaN)).toBeNull();
    });
    it('returns null for unparseable strings', () => {
      expect(parseGanttDate('not a date')).toBeNull();
    });
  });

  describe('getGanttDateBounds', () => {
    it('returns min start / max end across tasks', () => {
      const b = getGanttDateBounds(tasks);
      expect(b.min).toBe(Date.parse('2026-05-01'));
      expect(b.max).toBe(Date.parse('2026-05-20'));
    });
    it('honours start / end override', () => {
      const b = getGanttDateBounds(
        tasks,
        '2026-04-01',
        '2026-06-01',
      );
      expect(b.min).toBe(Date.parse('2026-04-01'));
      expect(b.max).toBe(Date.parse('2026-06-01'));
    });
    it('falls back to (0, 1) for empty / unparseable', () => {
      expect(getGanttDateBounds([])).toEqual({ min: 0, max: 1 });
      expect(
        getGanttDateBounds([
          {
            id: 'x',
            label: 'x',
            start: 'bad',
            end: 'bad',
          },
        ]),
      ).toEqual({ min: 0, max: 1 });
    });
    it('expands collapsed (min == max) range', () => {
      const b = getGanttDateBounds([
        {
          id: 'x',
          label: 'x',
          start: '2026-05-01',
          end: '2026-05-01',
        },
      ]);
      expect(b.max).toBe(b.min + 1);
    });
  });

  describe('getGanttRangeRatio', () => {
    it('maps value linearly into [0,1]', () => {
      expect(getGanttRangeRatio(50, 0, 100)).toBe(0.5);
    });
    it('clamps over-max to 1', () => {
      expect(getGanttRangeRatio(200, 0, 100)).toBe(1);
    });
    it('clamps under-min to 0', () => {
      expect(getGanttRangeRatio(-50, 0, 100)).toBe(0);
    });
    it('returns 0 for non-finite / collapsed range', () => {
      expect(getGanttRangeRatio(Number.NaN, 0, 100)).toBe(0);
      expect(getGanttRangeRatio(50, 100, 100)).toBe(0);
      expect(getGanttRangeRatio(50, 100, 50)).toBe(0);
    });
  });

  describe('getGanttTaskColor', () => {
    it('uses per-task color when supplied', () => {
      expect(
        getGanttTaskColor(
          {
            id: 'x',
            label: 'x',
            start: 0,
            end: 1,
            color: '#abc',
          },
          'd',
        ),
      ).toBe('#abc');
    });
    it('falls back to default when missing', () => {
      expect(
        getGanttTaskColor(
          { id: 'x', label: 'x', start: 0, end: 1 },
          'd',
        ),
      ).toBe('d');
    });
  });

  describe('getGanttTicks', () => {
    it('emits evenly-spaced ticks', () => {
      expect(getGanttTicks(0, 100, 5)).toEqual([
        0, 25, 50, 75, 100,
      ]);
    });
    it('defaults to DEFAULT_CHART_GANTT_TICK_COUNT', () => {
      expect(getGanttTicks(0, 100).length).toBe(
        DEFAULT_CHART_GANTT_TICK_COUNT,
      );
    });
    it('returns [min] when range is collapsed', () => {
      expect(getGanttTicks(50, 50)).toEqual([50]);
      expect(getGanttTicks(60, 40)).toEqual([60]);
    });
    it('clamps minimum count to 2', () => {
      expect(getGanttTicks(0, 100, 1)).toEqual([0, 100]);
    });
  });

  describe('formatGanttDate', () => {
    it('uses formatter when supplied', () => {
      const epoch = Date.UTC(2026, 4, 12);
      expect(formatGanttDate(epoch, (d) => `D:${d}`)).toBe(
        `D:${epoch}`,
      );
    });
    it('formats epoch to YYYY-MM-DD by default', () => {
      const epoch = Date.UTC(2026, 4, 12);
      expect(formatGanttDate(epoch)).toBe('2026-05-12');
    });
    it('returns empty string for non-finite epoch', () => {
      expect(formatGanttDate(Number.NaN)).toBe('');
    });
  });

  describe('buildGanttDependencyPath', () => {
    it('emits an elbow path', () => {
      const path = buildGanttDependencyPath(0, 10, 100, 50);
      expect(path).toMatch(/^M /);
      // Should have 3 L commands (elbow shape)
      expect((path.match(/L /g) || []).length).toBe(3);
    });
    it('keeps elbow to the right of source', () => {
      const path = buildGanttDependencyPath(10, 0, 5, 20);
      // elbow at max(10+6, 7.5) = 16
      expect(path).toContain('16');
    });
  });

  describe('describeGanttChart', () => {
    it('returns "No data" for empty input', () => {
      expect(describeGanttChart([])).toBe('No data');
    });
    it('summarises every task', () => {
      const text = describeGanttChart(tasks);
      expect(text).toContain('3 tasks');
      expect(text).toContain('Design');
      expect(text).toContain('Build');
      expect(text).toContain('Ship');
    });
    it('honours formatDate', () => {
      const text = describeGanttChart(tasks, (d) => `~${d}~`);
      expect(text).toContain('~');
    });
  });

  it('exports default constants', () => {
    expect(DEFAULT_CHART_GANTT_WIDTH).toBeGreaterThan(0);
    expect(DEFAULT_CHART_GANTT_HEIGHT).toBeGreaterThan(0);
    expect(DEFAULT_CHART_GANTT_ROW_HEIGHT).toBeGreaterThan(0);
    expect(DEFAULT_CHART_GANTT_ROW_GAP).toBeGreaterThanOrEqual(0);
    expect(DEFAULT_CHART_GANTT_LABEL_WIDTH).toBeGreaterThan(0);
    expect(DEFAULT_CHART_GANTT_TICK_COUNT).toBeGreaterThan(0);
    expect(DEFAULT_CHART_GANTT_BAR_COLOR).toMatch(/^#/);
    expect(DEFAULT_CHART_GANTT_TODAY_COLOR).toMatch(/^#/);
  });
});

describe('<ChartGantt />', () => {
  it('renders a region with role + aria-label', () => {
    render(<ChartGantt tasks={tasks} />);
    const root = screen.getByRole('region', {
      name: 'Gantt chart',
    });
    expect(root).toBeInTheDocument();
    expect(root).toHaveAttribute('data-section', 'chart-gantt');
    expect(root).toHaveAttribute('data-task-count', '3');
  });

  it('renders a custom aria-label', () => {
    render(
      <ChartGantt tasks={tasks} ariaLabel="Release plan" />,
    );
    expect(
      screen.getByRole('region', { name: 'Release plan' }),
    ).toBeInTheDocument();
  });

  it('renders one row group + bar per task', () => {
    const { container } = render(<ChartGantt tasks={tasks} />);
    const rows = container.querySelectorAll(
      '[data-section="chart-gantt-row"]',
    );
    const bars = container.querySelectorAll(
      '[data-section="chart-gantt-bar"]',
    );
    expect(rows.length).toBe(tasks.length);
    expect(bars.length).toBe(tasks.length);
  });

  it('renders labels by default', () => {
    const { container } = render(<ChartGantt tasks={tasks} />);
    const labels = container.querySelectorAll(
      '[data-section="chart-gantt-label"]',
    );
    expect(labels.length).toBe(tasks.length);
    expect(labels[0]?.textContent).toBe('Design');
  });

  it('suppresses labels when showLabels=false', () => {
    const { container } = render(
      <ChartGantt tasks={tasks} showLabels={false} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-gantt-label"]',
      ),
    ).toBeNull();
  });

  it('renders axis ticks by default', () => {
    const { container } = render(<ChartGantt tasks={tasks} />);
    const ticks = container.querySelectorAll(
      '[data-section="chart-gantt-tick"]',
    );
    expect(ticks.length).toBeGreaterThan(0);
  });

  it('suppresses ticks when showAxisTicks=false', () => {
    const { container } = render(
      <ChartGantt tasks={tasks} showAxisTicks={false} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-gantt-tick"]',
      ),
    ).toBeNull();
  });

  it('renders progress fill when task has progress > 0', () => {
    const { container } = render(<ChartGantt tasks={tasks} />);
    const progress = container.querySelectorAll(
      '[data-section="chart-gantt-progress"]',
    );
    // t3 has progress=0 so only t1 + t2 should render fills
    expect(progress.length).toBe(2);
  });

  it('suppresses progress when showProgress=false', () => {
    const { container } = render(
      <ChartGantt tasks={tasks} showProgress={false} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-gantt-progress"]',
      ),
    ).toBeNull();
  });

  it('mirrors task metadata on row group', () => {
    const { container } = render(<ChartGantt tasks={tasks} />);
    const t3 = container.querySelector(
      '[data-section="chart-gantt-row"][data-task-id="t3"]',
    );
    expect(t3?.getAttribute('data-task-color')).toBe(
      '#ff00aa',
    );
    expect(t3?.getAttribute('data-task-group')).toBe(
      'release',
    );
    expect(t3?.getAttribute('data-task-progress')).toBe(
      '0.0000',
    );
  });

  it('uses default bar colour when task has no colour', () => {
    const { container } = render(<ChartGantt tasks={tasks} />);
    const t1 = container.querySelector(
      '[data-section="chart-gantt-row"][data-task-id="t1"]',
    );
    expect(t1?.getAttribute('data-task-color')).toBe(
      DEFAULT_CHART_GANTT_BAR_COLOR,
    );
  });

  it('renders dependency arrows by default', () => {
    const { container } = render(<ChartGantt tasks={tasks} />);
    const deps = container.querySelectorAll(
      '[data-section="chart-gantt-dependency"]',
    );
    expect(deps.length).toBe(2);
  });

  it('suppresses dependency arrows when showDependencies=false', () => {
    const { container } = render(
      <ChartGantt tasks={tasks} showDependencies={false} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-gantt-dependency"]',
      ),
    ).toBeNull();
  });

  it('mirrors from / to task ids on dependency paths', () => {
    const { container } = render(<ChartGantt tasks={tasks} />);
    const dep = container.querySelector(
      '[data-section="chart-gantt-dependency"]',
    );
    expect(dep?.getAttribute('data-from-task-id')).toBe('t1');
    expect(dep?.getAttribute('data-to-task-id')).toBe('t2');
  });

  it('renders today marker when supplied + within range', () => {
    const { container } = render(
      <ChartGantt tasks={tasks} today="2026-05-10" />,
    );
    const today = container.querySelector(
      '[data-section="chart-gantt-today"]',
    );
    expect(today).not.toBeNull();
    const line = container.querySelector(
      '[data-section="chart-gantt-today-line"]',
    );
    expect(line).not.toBeNull();
  });

  it('omits today marker when out of range', () => {
    const { container } = render(
      <ChartGantt tasks={tasks} today="2027-01-01" />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-gantt-today"]',
      ),
    ).toBeNull();
  });

  it('suppresses today marker when showToday=false', () => {
    const { container } = render(
      <ChartGantt
        tasks={tasks}
        today="2026-05-10"
        showToday={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-gantt-today"]',
      ),
    ).toBeNull();
  });

  it('uses custom todayColor', () => {
    const { container } = render(
      <ChartGantt
        tasks={tasks}
        today="2026-05-10"
        todayColor="#00ffff"
      />,
    );
    const line = container.querySelector(
      '[data-section="chart-gantt-today-line"]',
    );
    expect(line?.getAttribute('stroke')).toBe('#00ffff');
  });

  it('shows tooltip on bar hover with start + end rows', () => {
    const { container } = render(<ChartGantt tasks={tasks} />);
    const bar = container.querySelector(
      '[data-section="chart-gantt-bar"][data-task-id="t1"]',
    );
    fireEvent.mouseEnter(bar!);
    const tip = container.querySelector(
      '[data-section="chart-gantt-tooltip"]',
    );
    expect(tip).not.toBeNull();
    expect(
      container.querySelector(
        '[data-section="chart-gantt-tooltip-label"]',
      )?.textContent,
    ).toBe('Design');
    expect(
      container.querySelector(
        '[data-section="chart-gantt-tooltip-start"]',
      )?.textContent,
    ).toContain('2026-05-01');
    expect(
      container.querySelector(
        '[data-section="chart-gantt-tooltip-end"]',
      )?.textContent,
    ).toContain('2026-05-07');
  });

  it('shows progress row in tooltip when present', () => {
    const { container } = render(<ChartGantt tasks={tasks} />);
    const bar = container.querySelector(
      '[data-section="chart-gantt-bar"][data-task-id="t2"]',
    );
    fireEvent.mouseEnter(bar!);
    const progress = container.querySelector(
      '[data-section="chart-gantt-tooltip-progress"]',
    );
    expect(progress?.textContent).toContain('60%');
  });

  it('omits progress row when task has no progress', () => {
    const noProgress: ChartGanttTask[] = [
      {
        id: 'x',
        label: 'X',
        start: '2026-05-01',
        end: '2026-05-05',
      },
    ];
    const { container } = render(
      <ChartGantt tasks={noProgress} />,
    );
    const bar = container.querySelector(
      '[data-section="chart-gantt-bar"]',
    );
    fireEvent.mouseEnter(bar!);
    expect(
      container.querySelector(
        '[data-section="chart-gantt-tooltip-progress"]',
      ),
    ).toBeNull();
  });

  it('hides tooltip on mouse-leave', () => {
    const { container } = render(<ChartGantt tasks={tasks} />);
    const bar = container.querySelector(
      '[data-section="chart-gantt-bar"]',
    );
    fireEvent.mouseEnter(bar!);
    fireEvent.mouseLeave(bar!);
    expect(
      container.querySelector(
        '[data-section="chart-gantt-tooltip"]',
      ),
    ).toBeNull();
  });

  it('suppresses tooltip when showTooltip=false', () => {
    const { container } = render(
      <ChartGantt tasks={tasks} showTooltip={false} />,
    );
    const bar = container.querySelector(
      '[data-section="chart-gantt-bar"]',
    );
    fireEvent.mouseEnter(bar!);
    expect(
      container.querySelector(
        '[data-section="chart-gantt-tooltip"]',
      ),
    ).toBeNull();
  });

  it('uses formatDate for ticks + tooltip', () => {
    const { container } = render(
      <ChartGantt
        tasks={tasks}
        formatDate={(d) => `T:${d}`}
      />,
    );
    const tick = container.querySelector(
      '[data-section="chart-gantt-tick-label"]',
    );
    expect(tick?.textContent?.startsWith('T:')).toBe(true);
    const bar = container.querySelector(
      '[data-section="chart-gantt-bar"]',
    );
    fireEvent.mouseEnter(bar!);
    expect(
      container.querySelector(
        '[data-section="chart-gantt-tooltip-start"]',
      )?.textContent?.startsWith('start: T:'),
    ).toBe(true);
  });

  it('invokes onTaskClick with task + index', () => {
    const onClick = vi.fn();
    const { container } = render(
      <ChartGantt tasks={tasks} onTaskClick={onClick} />,
    );
    const bar = container.querySelector(
      '[data-section="chart-gantt-bar"][data-task-id="t2"]',
    );
    fireEvent.click(bar!);
    expect(onClick).toHaveBeenCalledTimes(1);
    const arg = onClick.mock.calls[0]?.[0];
    expect(arg?.task?.id).toBe('t2');
    expect(arg?.index).toBe(1);
  });

  it('exposes role=graphics-symbol + aria-label per bar', () => {
    const { container } = render(<ChartGantt tasks={tasks} />);
    const bar = container.querySelector(
      '[data-section="chart-gantt-bar"]',
    );
    expect(bar?.getAttribute('role')).toBe('graphics-symbol');
    expect(bar?.getAttribute('aria-label')).toContain('Design');
  });

  it('mirrors animate flag on the root', () => {
    const { container, rerender } = render(
      <ChartGantt tasks={tasks} />,
    );
    expect(
      container
        .querySelector('[data-section="chart-gantt"]')
        ?.getAttribute('data-animate'),
    ).toBe('true');
    rerender(<ChartGantt tasks={tasks} animate={false} />);
    expect(
      container
        .querySelector('[data-section="chart-gantt"]')
        ?.getAttribute('data-animate'),
    ).toBe('false');
  });

  it('mirrors width on the svg', () => {
    const { container } = render(
      <ChartGantt tasks={tasks} width={800} />,
    );
    const svg = container.querySelector(
      '[data-section="chart-gantt-svg"]',
    );
    expect(svg?.getAttribute('width')).toBe('800');
  });

  it('renders auto-generated ARIA description by default', () => {
    const { container } = render(<ChartGantt tasks={tasks} />);
    const desc = container.querySelector(
      '[data-section="chart-gantt-aria-desc"]',
    );
    expect(desc?.textContent).toContain('Gantt chart with 3 tasks');
  });

  it('honours ariaDescription override', () => {
    const { container } = render(
      <ChartGantt tasks={tasks} ariaDescription="custom" />,
    );
    const desc = container.querySelector(
      '[data-section="chart-gantt-aria-desc"]',
    );
    expect(desc?.textContent).toBe('custom');
  });

  it('handles empty tasks without crashing', () => {
    const { container } = render(<ChartGantt tasks={[]} />);
    expect(
      container.querySelector(
        '[data-section="chart-gantt"]',
      ),
    ).not.toBeNull();
    expect(
      container.querySelectorAll(
        '[data-section="chart-gantt-bar"]',
      ).length,
    ).toBe(0);
  });

  it('skips tasks with unparseable dates without crashing', () => {
    const bad: ChartGanttTask[] = [
      {
        id: 'x',
        label: 'X',
        start: 'bad',
        end: 'bad',
      },
      {
        id: 'y',
        label: 'Y',
        start: '2026-05-01',
        end: '2026-05-05',
      },
    ];
    const { container } = render(<ChartGantt tasks={bad} />);
    const bars = container.querySelectorAll(
      '[data-section="chart-gantt-bar"]',
    );
    expect(bars.length).toBe(1);
    expect(bars[0]?.getAttribute('data-task-id')).toBe('y');
  });

  it('forwards ref to the root region', () => {
    const ref = createRef<HTMLDivElement>();
    render(<ChartGantt ref={ref} tasks={tasks} />);
    expect(ref.current).not.toBeNull();
    expect(ref.current?.getAttribute('data-section')).toBe(
      'chart-gantt',
    );
  });

  it('has a stable displayName', () => {
    expect(ChartGantt.displayName).toBe('ChartGantt');
  });
});
