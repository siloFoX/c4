import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  cleanup,
  fireEvent,
  render,
  screen,
} from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { createRef } from 'react';
import {
  ChartHeatmap,
  DEFAULT_HEATMAP_CELL_GAP,
  DEFAULT_HEATMAP_CELL_SIZE,
  DEFAULT_HEATMAP_COLOR_SCALE,
  DEFAULT_HEATMAP_EMPTY_COLOR,
  bucketHeatmapData,
  formatIsoDate,
  getHeatmapBucket,
  getHeatmapColor,
  getHeatmapMax,
  getHeatmapWeeks,
} from './chart-heatmap';
import type { ChartHeatmapCell } from './chart-heatmap';

afterEach(() => {
  cleanup();
});

const DATA: ChartHeatmapCell[] = [
  { date: '2026-01-01', value: 1 }, // Thu
  { date: '2026-01-02', value: 4 }, // Fri
  { date: '2026-01-03', value: 8 }, // Sat
  { date: '2026-01-05', value: 12 }, // Mon
  { date: '2026-01-07', value: 0 },
];

// ---------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------

describe('formatIsoDate', () => {
  it('formats Date -> YYYY-MM-DD (UTC)', () => {
    expect(
      formatIsoDate(new Date('2026-05-19T10:00:00Z')),
    ).toBe('2026-05-19');
  });
  it('passes through ISO string', () => {
    expect(formatIsoDate('2026-01-02')).toBe('2026-01-02');
  });
  it('empty for unparseable', () => {
    expect(formatIsoDate('not a date')).toBe('');
  });
});

describe('bucketHeatmapData', () => {
  it('returns a map keyed by ISO date', () => {
    const map = bucketHeatmapData(DATA);
    expect(map.size).toBe(5);
    expect(map.get('2026-01-01')?.value).toBe(1);
  });
  it('skips unparseable dates', () => {
    const map = bucketHeatmapData([
      { date: 'not a date', value: 5 },
      { date: '2026-01-01', value: 1 },
    ]);
    expect(map.size).toBe(1);
    expect(map.has('2026-01-01')).toBe(true);
  });
});

describe('getHeatmapMax', () => {
  it('returns max value', () => {
    expect(getHeatmapMax(DATA)).toBe(12);
  });
  it('non-finite values ignored', () => {
    expect(
      getHeatmapMax([
        { date: 'a', value: Number.NaN },
        { date: 'b', value: 3 },
      ]),
    ).toBe(3);
  });
  it('empty -> 0', () => {
    expect(getHeatmapMax([])).toBe(0);
  });
});

describe('getHeatmapBucket', () => {
  it('value <= 0 -> bucket 0', () => {
    expect(getHeatmapBucket(0, 10)).toBe(0);
    expect(getHeatmapBucket(-1, 10)).toBe(0);
    expect(getHeatmapBucket(5, 0)).toBe(0);
  });
  it('quartile assignment with default 4 buckets', () => {
    expect(getHeatmapBucket(1, 12)).toBe(1);
    expect(getHeatmapBucket(4, 12)).toBe(2);
    expect(getHeatmapBucket(8, 12)).toBe(3);
    expect(getHeatmapBucket(12, 12)).toBe(4);
  });
  it('non-finite -> 0', () => {
    expect(getHeatmapBucket(Number.NaN, 10)).toBe(0);
  });
});

describe('getHeatmapColor', () => {
  it('zero value -> empty colour (palette[0])', () => {
    expect(getHeatmapColor(0, 10)).toBe(
      DEFAULT_HEATMAP_COLOR_SCALE[0],
    );
  });
  it('max value -> highest tier (palette[last])', () => {
    expect(getHeatmapColor(10, 10)).toBe(
      DEFAULT_HEATMAP_COLOR_SCALE[
        DEFAULT_HEATMAP_COLOR_SCALE.length - 1
      ],
    );
  });
  it('custom scale used when supplied', () => {
    const scale = ['#fff', '#aaa', '#000'];
    expect(getHeatmapColor(0, 10, scale)).toBe('#fff');
    expect(getHeatmapColor(10, 10, scale)).toBe('#000');
  });
});

describe('getHeatmapWeeks', () => {
  it('returns at least one week per data span', () => {
    const weeks = getHeatmapWeeks(DATA);
    expect(weeks.length).toBeGreaterThan(0);
  });
  it('every week has exactly 7 cells', () => {
    const weeks = getHeatmapWeeks(DATA);
    for (const w of weeks) {
      expect(w.cells.length).toBe(7);
    }
  });
  it('cells outside the requested range are null', () => {
    const weeks = getHeatmapWeeks(DATA, {
      startDate: '2026-01-05',
      endDate: '2026-01-10',
    });
    // 2026-01-05 is a Monday -> for weekStartsOn=0 (Sun),
    // index 1 = Mon. Cells at indexes 0 (Sun 2026-01-04)
    // should be null because they are before the start.
    const firstWeek = weeks[0]!;
    expect(firstWeek.cells[0]).toBeNull();
    expect(firstWeek.cells[1]?.iso).toBe('2026-01-05');
  });
  it('weekStartsOn=1 shifts the cell index ordering', () => {
    const weeksSun = getHeatmapWeeks(DATA, {
      startDate: '2026-01-05',
      endDate: '2026-01-05',
      weekStartsOn: 0,
    });
    const weeksMon = getHeatmapWeeks(DATA, {
      startDate: '2026-01-05',
      endDate: '2026-01-05',
      weekStartsOn: 1,
    });
    // weekStartsOn=0 (Sun): Mon is index 1
    expect(weeksSun[0]?.cells[1]?.iso).toBe('2026-01-05');
    // weekStartsOn=1 (Mon): Mon is index 0
    expect(weeksMon[0]?.cells[0]?.iso).toBe('2026-01-05');
  });
  it('per-cell bucket reflects the value', () => {
    const weeks = getHeatmapWeeks(DATA, {
      startDate: '2026-01-01',
      endDate: '2026-01-07',
    });
    const found = weeks
      .flatMap((w) => w.cells)
      .find((c) => c?.iso === '2026-01-05');
    expect(found?.value).toBe(12);
    expect(found?.bucket).toBe(4);
  });
  it('weeks are columns; cells are rows', () => {
    const weeks = getHeatmapWeeks(DATA, {
      startDate: '2026-01-01',
      endDate: '2026-01-21',
    });
    expect(weeks.length).toBeGreaterThan(1);
    // First column starts at 2025-12-28 (Sunday). Cells 0..3
    // (Sun..Wed) are null (before the requested start). Cell
    // index 4 = Thursday = 2026-01-01.
    expect(weeks[0]?.cells[0]).toBeNull();
    expect(weeks[0]?.cells[4]?.iso).toBe('2026-01-01');
  });
});

describe('Constants', () => {
  it('default cell size + gap', () => {
    expect(DEFAULT_HEATMAP_CELL_SIZE).toBe(12);
    expect(DEFAULT_HEATMAP_CELL_GAP).toBe(2);
  });
  it('default colour scale has 5 tiers', () => {
    expect(DEFAULT_HEATMAP_COLOR_SCALE.length).toBe(5);
  });
  it('default empty colour is a translucent grey', () => {
    expect(DEFAULT_HEATMAP_EMPTY_COLOR).toContain('rgba(');
  });
});

// ---------------------------------------------------------------
// Component
// ---------------------------------------------------------------

describe('ChartHeatmap component', () => {
  it('renders a region with default aria-label', () => {
    render(<ChartHeatmap data={DATA} />);
    expect(
      screen.getByRole('region', { name: 'Activity heatmap' }),
    ).toBeInTheDocument();
  });

  it('honors custom ariaLabel', () => {
    render(
      <ChartHeatmap
        data={DATA}
        ariaLabel="Contributions 2026"
      />,
    );
    expect(
      screen.getByRole('region', { name: 'Contributions 2026' }),
    ).toBeInTheDocument();
  });

  it('renders one cell per non-null grid square', () => {
    const { container } = render(
      <ChartHeatmap
        data={DATA}
        startDate="2026-01-01"
        endDate="2026-01-07"
      />,
    );
    const cells = container.querySelectorAll(
      '[data-section="chart-heatmap-cell"]',
    );
    expect(cells.length).toBe(7);
  });

  it('per-cell aria-label includes date + value', () => {
    const { container } = render(
      <ChartHeatmap
        data={DATA}
        startDate="2026-01-05"
        endDate="2026-01-05"
      />,
    );
    const cell = container.querySelector(
      '[data-section="chart-heatmap-cell"]',
    );
    expect(cell?.getAttribute('aria-label')).toContain('2026-01-05');
    expect(cell?.getAttribute('aria-label')).toContain('12');
  });

  it('per-cell data-iso + data-bucket + data-value mirror state', () => {
    const { container } = render(
      <ChartHeatmap
        data={DATA}
        startDate="2026-01-05"
        endDate="2026-01-05"
      />,
    );
    const cell = container.querySelector(
      '[data-section="chart-heatmap-cell"]',
    );
    expect(cell).toHaveAttribute('data-iso', '2026-01-05');
    expect(cell).toHaveAttribute('data-bucket', '4');
    expect(cell).toHaveAttribute('data-value', '12');
  });

  it('hovering a cell flips data-hovered + opens the tooltip', () => {
    const { container } = render(
      <ChartHeatmap
        data={DATA}
        startDate="2026-01-05"
        endDate="2026-01-05"
      />,
    );
    const cell = container.querySelector(
      '[data-section="chart-heatmap-cell"]',
    ) as HTMLElement;
    fireEvent.mouseEnter(cell);
    expect(cell).toHaveAttribute('data-hovered', 'true');
    expect(screen.getByRole('tooltip')).toBeInTheDocument();
    expect(screen.getByText('2026-01-05')).toBeInTheDocument();
    expect(screen.getByText('12')).toBeInTheDocument();
  });

  it('mouse leave hides the tooltip', () => {
    const { container } = render(
      <ChartHeatmap
        data={DATA}
        startDate="2026-01-05"
        endDate="2026-01-05"
      />,
    );
    const cell = container.querySelector(
      '[data-section="chart-heatmap-cell"]',
    ) as HTMLElement;
    fireEvent.mouseEnter(cell);
    fireEvent.mouseLeave(cell);
    expect(screen.queryByRole('tooltip')).toBeNull();
  });

  it('focus opens the tooltip (keyboard accessibility)', () => {
    const { container } = render(
      <ChartHeatmap
        data={DATA}
        startDate="2026-01-05"
        endDate="2026-01-05"
      />,
    );
    const cell = container.querySelector(
      '[data-section="chart-heatmap-cell"]',
    ) as HTMLElement;
    fireEvent.focus(cell);
    expect(screen.getByRole('tooltip')).toBeInTheDocument();
  });

  it('cell.label overrides the tooltip value', () => {
    const { container } = render(
      <ChartHeatmap
        data={[
          {
            date: '2026-01-05',
            value: 12,
            label: '12 commits',
          },
        ]}
        startDate="2026-01-05"
        endDate="2026-01-05"
      />,
    );
    fireEvent.mouseEnter(
      container.querySelector(
        '[data-section="chart-heatmap-cell"]',
      ) as HTMLElement,
    );
    expect(screen.getByText('12 commits')).toBeInTheDocument();
  });

  it('formatValue formats the tooltip value when no label', () => {
    const { container } = render(
      <ChartHeatmap
        data={[{ date: '2026-01-05', value: 12 }]}
        startDate="2026-01-05"
        endDate="2026-01-05"
        formatValue={(v) => `${v} commits`}
      />,
    );
    fireEvent.mouseEnter(
      container.querySelector(
        '[data-section="chart-heatmap-cell"]',
      ) as HTMLElement,
    );
    expect(screen.getByText('12 commits')).toBeInTheDocument();
  });

  it('formatDate formats the tooltip date', () => {
    const { container } = render(
      <ChartHeatmap
        data={[{ date: '2026-01-05', value: 1 }]}
        startDate="2026-01-05"
        endDate="2026-01-05"
        formatDate={(d) =>
          `Day ${d.getUTCDate()}/${d.getUTCMonth() + 1}`
        }
      />,
    );
    fireEvent.mouseEnter(
      container.querySelector(
        '[data-section="chart-heatmap-cell"]',
      ) as HTMLElement,
    );
    expect(screen.getByText('Day 5/1')).toBeInTheDocument();
  });

  it('click invokes onCellClick with the resolved cell', () => {
    const onCellClick = vi.fn();
    const { container } = render(
      <ChartHeatmap
        data={DATA}
        onCellClick={onCellClick}
        startDate="2026-01-05"
        endDate="2026-01-05"
      />,
    );
    fireEvent.click(
      container.querySelector(
        '[data-section="chart-heatmap-cell"]',
      ) as HTMLElement,
    );
    expect(onCellClick).toHaveBeenCalledWith(
      expect.objectContaining({
        iso: '2026-01-05',
        value: 12,
      }),
    );
  });

  it('legend renders the colour scale with low / high labels', () => {
    render(<ChartHeatmap data={DATA} />);
    expect(screen.getByText('Less')).toBeInTheDocument();
    expect(screen.getByText('More')).toBeInTheDocument();
  });

  it('legend swatch count matches the colour scale', () => {
    const { container } = render(<ChartHeatmap data={DATA} />);
    const swatches = container.querySelectorAll(
      '[data-section="chart-heatmap-legend-swatch"]',
    );
    expect(swatches.length).toBe(
      DEFAULT_HEATMAP_COLOR_SCALE.length,
    );
  });

  it('showLegend=false hides the legend', () => {
    const { container } = render(
      <ChartHeatmap data={DATA} showLegend={false} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-heatmap-legend"]',
      ),
    ).toBeNull();
  });

  it('legendLowLabel / legendHighLabel override defaults', () => {
    render(
      <ChartHeatmap
        data={DATA}
        legendLowLabel="cold"
        legendHighLabel="hot"
      />,
    );
    expect(screen.getByText('cold')).toBeInTheDocument();
    expect(screen.getByText('hot')).toBeInTheDocument();
  });

  it('month labels render by default', () => {
    const { container } = render(
      <ChartHeatmap
        data={DATA}
        startDate="2026-01-01"
        endDate="2026-02-15"
      />,
    );
    const months = container.querySelectorAll(
      '[data-section="chart-heatmap-month"]',
    );
    expect(months.length).toBeGreaterThanOrEqual(1);
  });

  it('showMonthLabels=false hides month text', () => {
    const { container } = render(
      <ChartHeatmap
        data={DATA}
        showMonthLabels={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-heatmap-month"]',
      ),
    ).toBeNull();
  });

  it('weekday labels render by default', () => {
    const { container } = render(<ChartHeatmap data={DATA} />);
    expect(
      container.querySelectorAll(
        '[data-section="chart-heatmap-weekday"]',
      ).length,
    ).toBe(7);
  });

  it('showWeekdayLabels=false hides weekday labels', () => {
    const { container } = render(
      <ChartHeatmap data={DATA} showWeekdayLabels={false} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-heatmap-weekday"]',
      ),
    ).toBeNull();
  });

  it('cellSize prop applies to the rect width + height', () => {
    const { container } = render(
      <ChartHeatmap
        data={DATA}
        cellSize={20}
        startDate="2026-01-05"
        endDate="2026-01-05"
      />,
    );
    const cell = container.querySelector(
      '[data-section="chart-heatmap-cell"]',
    );
    expect(cell).toHaveAttribute('width', '20');
    expect(cell).toHaveAttribute('height', '20');
  });

  it('zero-value cells render in the empty colour', () => {
    const { container } = render(
      <ChartHeatmap
        data={[{ date: '2026-01-07', value: 0 }]}
        startDate="2026-01-07"
        endDate="2026-01-07"
      />,
    );
    const cell = container.querySelector(
      '[data-section="chart-heatmap-cell"]',
    );
    expect(cell?.getAttribute('fill')).toBe(
      DEFAULT_HEATMAP_EMPTY_COLOR,
    );
  });

  it('custom colour scale paints high-value cells', () => {
    const scale = [
      DEFAULT_HEATMAP_EMPTY_COLOR,
      '#aaa',
      '#777',
      '#444',
      '#111',
    ];
    const { container } = render(
      <ChartHeatmap
        data={[{ date: '2026-01-05', value: 100 }]}
        colorScale={scale}
        startDate="2026-01-05"
        endDate="2026-01-05"
      />,
    );
    const cell = container.querySelector(
      '[data-section="chart-heatmap-cell"]',
    );
    expect(cell?.getAttribute('fill')).toBe('#111');
  });

  it('root data attrs mirror state', () => {
    render(
      <ChartHeatmap
        data={DATA}
        startDate="2026-01-01"
        endDate="2026-01-14"
        weekStartsOn={1}
      />,
    );
    const region = screen.getByRole('region');
    expect(region).toHaveAttribute('data-cell-count', '5');
    expect(region.getAttribute('data-week-count')).not.toBe(
      '0',
    );
    expect(region).toHaveAttribute('data-week-starts-on', '1');
  });

  it('forwards ref to the root region', () => {
    const ref = createRef<HTMLDivElement>();
    render(<ChartHeatmap ref={ref} data={DATA} />);
    expect(ref.current?.getAttribute('role')).toBe('region');
  });

  it('exposes a stable displayName', () => {
    expect(ChartHeatmap.displayName).toBe('ChartHeatmap');
  });

  it('empty data renders without crashing', () => {
    const { container } = render(<ChartHeatmap data={[]} />);
    expect(
      container.querySelector('[data-section="chart-heatmap"]'),
    ).toBeInTheDocument();
  });
});
