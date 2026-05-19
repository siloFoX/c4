import { afterEach, describe, it, expect, vi } from 'vitest';
import { createRef } from 'react';
import { render, fireEvent, cleanup } from '@testing-library/react';
import {
  ChartCalendarHeatmap,
  addDays,
  computeCalendarHeatmap,
  describeCalendarHeatmap,
  getCalendarHeatmapColor,
  getYearRange,
  parseISODate,
  toISODate,
  DEFAULT_CHART_CALENDAR_HEATMAP_CELL_SIZE,
  DEFAULT_CHART_CALENDAR_HEATMAP_CELL_GAP,
  DEFAULT_CHART_CALENDAR_HEATMAP_TOP_PAD,
  DEFAULT_CHART_CALENDAR_HEATMAP_LEFT_PAD,
  DEFAULT_CHART_CALENDAR_HEATMAP_RIGHT_PAD,
  DEFAULT_CHART_CALENDAR_HEATMAP_BOTTOM_PAD,
  DEFAULT_CHART_CALENDAR_HEATMAP_EMPTY_COLOR,
  DEFAULT_CHART_CALENDAR_HEATMAP_PALETTE,
  DEFAULT_CHART_CALENDAR_HEATMAP_MONTH_LABELS,
  DEFAULT_CHART_CALENDAR_HEATMAP_DOW_LABELS,
  type ChartCalendarHeatmapValue,
} from './chart-calendar-heatmap';

afterEach(() => cleanup());

const Y2024_RANGE = { startDate: '2024-01-01', endDate: '2024-12-31' };

const SAMPLE: ChartCalendarHeatmapValue[] = [
  { date: '2024-01-01', value: 1 },
  { date: '2024-01-15', value: 4 },
  { date: '2024-06-01', value: 8 },
  { date: '2024-12-31', value: 10 },
];

describe('chart-calendar-heatmap constants', () => {
  it('exports the documented defaults', () => {
    expect(DEFAULT_CHART_CALENDAR_HEATMAP_CELL_SIZE).toBe(12);
    expect(DEFAULT_CHART_CALENDAR_HEATMAP_CELL_GAP).toBe(3);
    expect(DEFAULT_CHART_CALENDAR_HEATMAP_TOP_PAD).toBe(18);
    expect(DEFAULT_CHART_CALENDAR_HEATMAP_LEFT_PAD).toBe(28);
    expect(DEFAULT_CHART_CALENDAR_HEATMAP_RIGHT_PAD).toBe(8);
    expect(DEFAULT_CHART_CALENDAR_HEATMAP_BOTTOM_PAD).toBe(22);
    expect(DEFAULT_CHART_CALENDAR_HEATMAP_PALETTE.length).toBe(5);
    expect(DEFAULT_CHART_CALENDAR_HEATMAP_MONTH_LABELS).toHaveLength(12);
    expect(DEFAULT_CHART_CALENDAR_HEATMAP_DOW_LABELS).toHaveLength(7);
    expect(DEFAULT_CHART_CALENDAR_HEATMAP_EMPTY_COLOR).toBe('#e5e7eb');
  });
});

describe('toISODate / parseISODate', () => {
  it('formats UTC as YYYY-MM-DD', () => {
    expect(toISODate(new Date(Date.UTC(2024, 5, 7)))).toBe('2024-06-07');
    expect(toISODate(new Date(Date.UTC(2024, 11, 31)))).toBe('2024-12-31');
  });
  it('parses well-formed dates', () => {
    const d = parseISODate('2024-06-07')!;
    expect(d.getUTCFullYear()).toBe(2024);
    expect(d.getUTCMonth()).toBe(5);
    expect(d.getUTCDate()).toBe(7);
  });
  it('returns null for malformed / impossible dates', () => {
    expect(parseISODate('not a date')).toBeNull();
    expect(parseISODate('2024-13-01')).toBeNull();
    expect(parseISODate('2024-02-30')).toBeNull();
  });
});

describe('addDays', () => {
  it('rolls forward across month boundary', () => {
    const d = addDays(new Date(Date.UTC(2024, 0, 31)), 1);
    expect(toISODate(d)).toBe('2024-02-01');
  });
  it('rolls backward across year boundary', () => {
    const d = addDays(new Date(Date.UTC(2024, 0, 1)), -1);
    expect(toISODate(d)).toBe('2023-12-31');
  });
});

describe('getYearRange', () => {
  it('returns Jan 1 to Dec 31 (UTC) for a given year', () => {
    const r = getYearRange(2024);
    expect(toISODate(r.start)).toBe('2024-01-01');
    expect(toISODate(r.end)).toBe('2024-12-31');
  });
});

describe('getCalendarHeatmapColor', () => {
  it('returns empty color + level 0 for non-positive / non-finite value', () => {
    const r1 = getCalendarHeatmapColor(0, 10);
    expect(r1.level).toBe(0);
    expect(r1.color).toBe(DEFAULT_CHART_CALENDAR_HEATMAP_EMPTY_COLOR);
    const r2 = getCalendarHeatmapColor(Number.NaN, 10);
    expect(r2.level).toBe(0);
  });
  it('returns max-level palette entry when max is non-positive', () => {
    const r = getCalendarHeatmapColor(5, 0);
    const palette = DEFAULT_CHART_CALENDAR_HEATMAP_PALETTE;
    expect(r.color).toBe(palette[palette.length - 1]);
    expect(r.level).toBe(palette.length);
  });
  it('returns palette[0] for the smallest non-zero ratio', () => {
    const r = getCalendarHeatmapColor(1, 100);
    expect(r.color).toBe(DEFAULT_CHART_CALENDAR_HEATMAP_PALETTE[0]);
    expect(r.level).toBe(1);
  });
  it('returns the top palette step at the upper bound', () => {
    const palette = DEFAULT_CHART_CALENDAR_HEATMAP_PALETTE;
    const r = getCalendarHeatmapColor(100, 100, palette);
    expect(r.color).toBe(palette[palette.length - 1]);
    expect(r.level).toBe(palette.length);
  });
  it('clamps ratio over 1 to the top step', () => {
    const palette = DEFAULT_CHART_CALENDAR_HEATMAP_PALETTE;
    const r = getCalendarHeatmapColor(1000, 100, palette);
    expect(r.color).toBe(palette[palette.length - 1]);
  });
});

describe('computeCalendarHeatmap', () => {
  it('returns the right number of cells for a full year', () => {
    const r = computeCalendarHeatmap({
      values: [],
      ...Y2024_RANGE,
    });
    // 2024 has 366 days
    expect(r.cells.length).toBe(366);
  });

  it('maps cell coordinates inside the canvas', () => {
    const r = computeCalendarHeatmap({
      values: SAMPLE,
      ...Y2024_RANGE,
    });
    for (const c of r.cells) {
      expect(c.x).toBeGreaterThanOrEqual(
        DEFAULT_CHART_CALENDAR_HEATMAP_LEFT_PAD
      );
      expect(c.y).toBeGreaterThanOrEqual(
        DEFAULT_CHART_CALENDAR_HEATMAP_TOP_PAD
      );
    }
  });

  it('the first day of the year is in the first week column', () => {
    const r = computeCalendarHeatmap({
      values: [],
      ...Y2024_RANGE,
    });
    const jan1 = r.cells.find((c) => c.date === '2024-01-01');
    expect(jan1).toBeTruthy();
    expect(jan1!.col).toBe(0);
  });

  it('the last day of the year sits in the last column', () => {
    const r = computeCalendarHeatmap({
      values: [],
      ...Y2024_RANGE,
    });
    const dec31 = r.cells.find((c) => c.date === '2024-12-31');
    expect(dec31).toBeTruthy();
    const maxCol = Math.max(...r.cells.map((c) => c.col));
    expect(dec31!.col).toBe(maxCol);
  });

  it('returns empty result for invalid / inverted date range', () => {
    const inverted = computeCalendarHeatmap({
      values: [],
      startDate: '2024-12-31',
      endDate: '2024-01-01',
    });
    expect(inverted.cells).toEqual([]);
    const bad = computeCalendarHeatmap({
      values: [],
      startDate: 'not-a-date',
      endDate: '2024-01-01',
    });
    expect(bad.cells).toEqual([]);
  });

  it('values lookup populates per-day cell value + level', () => {
    const r = computeCalendarHeatmap({
      values: SAMPLE,
      ...Y2024_RANGE,
    });
    const jan1 = r.cells.find((c) => c.date === '2024-01-01')!;
    expect(jan1.value).toBe(1);
    expect(jan1.level).toBeGreaterThan(0);
    const dec31 = r.cells.find((c) => c.date === '2024-12-31')!;
    expect(dec31.value).toBe(10);
    expect(dec31.level).toBe(
      DEFAULT_CHART_CALENDAR_HEATMAP_PALETTE.length
    );
  });

  it('honors maxValue override', () => {
    const r = computeCalendarHeatmap({
      values: SAMPLE,
      ...Y2024_RANGE,
      maxValue: 1000,
    });
    const dec31 = r.cells.find((c) => c.date === '2024-12-31')!;
    expect(dec31.level).toBeLessThan(
      DEFAULT_CHART_CALENDAR_HEATMAP_PALETTE.length
    );
  });

  it('month labels are emitted at the first week each month appears', () => {
    const r = computeCalendarHeatmap({
      values: [],
      ...Y2024_RANGE,
    });
    expect(r.monthLabels.length).toBe(12);
    expect(r.monthLabels[0]!.index).toBe(0);
    expect(r.monthLabels[r.monthLabels.length - 1]!.index).toBe(11);
  });

  it('weekStart 0 puts Sunday on row 0; weekStart 1 puts Monday on row 0', () => {
    const sun = computeCalendarHeatmap({
      values: [],
      ...Y2024_RANGE,
      weekStart: 0,
    });
    const mon = computeCalendarHeatmap({
      values: [],
      ...Y2024_RANGE,
      weekStart: 1,
    });
    const jan7Sun = sun.cells.find((c) => c.date === '2024-01-07')!;
    const jan7Mon = mon.cells.find((c) => c.date === '2024-01-07')!;
    // 2024-01-07 is a Sunday.
    expect(jan7Sun.row).toBe(0);
    expect(jan7Mon.row).toBe(6);
  });

  it('weeks have at least one cell each', () => {
    const r = computeCalendarHeatmap({
      values: [],
      ...Y2024_RANGE,
    });
    for (const w of r.weeks) {
      expect(w.cells.length).toBeGreaterThan(0);
    }
  });

  it('derived max equals the largest value', () => {
    const r = computeCalendarHeatmap({
      values: SAMPLE,
      ...Y2024_RANGE,
    });
    expect(r.max).toBe(10);
  });
});

describe('describeCalendarHeatmap', () => {
  it('returns "No data" for invalid dates', () => {
    expect(
      describeCalendarHeatmap(SAMPLE, 'not-a-date', '2024-12-31')
    ).toBe('No data');
  });
  it('includes range + active days + total + peak', () => {
    const d = describeCalendarHeatmap(SAMPLE, '2024-01-01', '2024-12-31');
    expect(d).toContain('2024-01-01');
    expect(d).toContain('2024-12-31');
    expect(d).toContain('4 active days');
    expect(d).toContain('total 23');
    expect(d).toContain('peak 10');
  });
  it('honors formatValue override', () => {
    const d = describeCalendarHeatmap(
      SAMPLE,
      '2024-01-01',
      '2024-12-31',
      (v) => `${v}h`
    );
    expect(d).toContain('total 23h');
    expect(d).toContain('peak 10h');
  });
});

describe('<ChartCalendarHeatmap> component', () => {
  it('renders a region with role + custom aria-label', () => {
    const { getByRole } = render(
      <ChartCalendarHeatmap
        values={SAMPLE}
        startDate="2024-01-01"
        endDate="2024-12-31"
        ariaLabel="Test heatmap"
      />
    );
    expect(getByRole('region', { name: 'Test heatmap' })).toBeTruthy();
  });

  it('renders 366 cells for 2024', () => {
    const { container } = render(
      <ChartCalendarHeatmap
        values={SAMPLE}
        startDate="2024-01-01"
        endDate="2024-12-31"
      />
    );
    const cells = container.querySelectorAll(
      '[data-section="chart-calendar-heatmap-cell"]'
    );
    expect(cells.length).toBe(366);
  });

  it('cell carries data-cell-date / -value / -level / -color / -col / -row', () => {
    const { container } = render(
      <ChartCalendarHeatmap
        values={SAMPLE}
        startDate="2024-01-01"
        endDate="2024-12-31"
      />
    );
    const jan1 = container.querySelector(
      '[data-cell-date="2024-01-01"]'
    ) as HTMLElement;
    expect(jan1).not.toBeNull();
    expect(jan1.getAttribute('data-cell-value')).toBe('1');
    expect(jan1.getAttribute('data-cell-level')).toBe('1');
    expect(jan1.getAttribute('data-cell-color')).toBeTruthy();
    expect(jan1.getAttribute('data-cell-col')).toBe('0');
    expect(jan1.getAttribute('data-cell-row')).toBeTruthy();
  });

  it('cell rect is role=graphics-symbol + tabIndex=0 with aria-label', () => {
    const { container } = render(
      <ChartCalendarHeatmap
        values={SAMPLE}
        startDate="2024-01-01"
        endDate="2024-12-31"
      />
    );
    const jan1 = container.querySelector(
      '[data-cell-date="2024-01-01"]'
    ) as SVGRectElement;
    expect(jan1.getAttribute('role')).toBe('graphics-symbol');
    expect(jan1.getAttribute('tabindex')).toBe('0');
    expect(jan1.getAttribute('aria-label')).toContain('2024-01-01');
    expect(jan1.getAttribute('aria-label')).toContain('1');
  });

  it('root mirrors cell + week counts + dates + max + week-start + animate', () => {
    const { container } = render(
      <ChartCalendarHeatmap
        values={SAMPLE}
        startDate="2024-01-01"
        endDate="2024-12-31"
        weekStart={1}
      />
    );
    const root = container.querySelector(
      '[data-section="chart-calendar-heatmap"]'
    );
    expect(root?.getAttribute('data-cell-count')).toBe('366');
    expect(Number(root?.getAttribute('data-week-count'))).toBeGreaterThan(50);
    expect(root?.getAttribute('data-week-start')).toBe('1');
    expect(root?.getAttribute('data-start-date')).toBe('2024-01-01');
    expect(root?.getAttribute('data-end-date')).toBe('2024-12-31');
    expect(root?.getAttribute('data-max')).toBe('10');
    expect(root?.getAttribute('data-animate')).toBe('true');
  });

  it('year prop synthesizes Jan 1 -> Dec 31 of that year', () => {
    const { container } = render(
      <ChartCalendarHeatmap values={SAMPLE} year={2024} />
    );
    const root = container.querySelector(
      '[data-section="chart-calendar-heatmap"]'
    );
    expect(root?.getAttribute('data-start-date')).toBe('2024-01-01');
    expect(root?.getAttribute('data-end-date')).toBe('2024-12-31');
  });

  it('month labels render by default; one per visible month', () => {
    const { container } = render(
      <ChartCalendarHeatmap values={SAMPLE} year={2024} />
    );
    const labels = container.querySelectorAll(
      '[data-section="chart-calendar-heatmap-month-label"]'
    );
    expect(labels.length).toBe(12);
    expect(labels[0]!.textContent).toBe('Jan');
  });

  it('showMonthLabels=false suppresses month labels', () => {
    const { container } = render(
      <ChartCalendarHeatmap values={SAMPLE} year={2024} showMonthLabels={false} />
    );
    expect(
      container.querySelector('[data-section="chart-calendar-heatmap-months"]')
    ).toBeNull();
  });

  it('day-of-week labels render by default (3 per axis)', () => {
    const { container } = render(
      <ChartCalendarHeatmap values={SAMPLE} year={2024} />
    );
    const dow = container.querySelectorAll(
      '[data-section="chart-calendar-heatmap-dow-label"]'
    );
    expect(dow.length).toBe(3);
  });

  it('showDowLabels=false suppresses dow labels', () => {
    const { container } = render(
      <ChartCalendarHeatmap values={SAMPLE} year={2024} showDowLabels={false} />
    );
    expect(
      container.querySelector('[data-section="chart-calendar-heatmap-dow"]')
    ).toBeNull();
  });

  it('legend renders palette + empty + endpoints by default', () => {
    const { container } = render(
      <ChartCalendarHeatmap values={SAMPLE} year={2024} />
    );
    const swatches = container.querySelectorAll(
      '[data-section="chart-calendar-heatmap-legend-swatch"]'
    );
    expect(swatches.length).toBe(
      DEFAULT_CHART_CALENDAR_HEATMAP_PALETTE.length + 1
    );
    expect(
      container.querySelector(
        '[data-section="chart-calendar-heatmap-legend-low"]'
      )?.textContent
    ).toBe('Less');
    expect(
      container.querySelector(
        '[data-section="chart-calendar-heatmap-legend-high"]'
      )?.textContent
    ).toBe('More');
  });

  it('showLegend=false suppresses the legend', () => {
    const { container } = render(
      <ChartCalendarHeatmap values={SAMPLE} year={2024} showLegend={false} />
    );
    expect(
      container.querySelector('[data-section="chart-calendar-heatmap-legend"]')
    ).toBeNull();
  });

  it('tooltip opens on cell hover with formatted date + value', () => {
    const { container } = render(
      <ChartCalendarHeatmap values={SAMPLE} year={2024} />
    );
    const jan1 = container.querySelector(
      '[data-cell-date="2024-01-01"]'
    ) as SVGRectElement;
    fireEvent.mouseEnter(jan1);
    expect(
      container.querySelector(
        '[data-section="chart-calendar-heatmap-tooltip"]'
      )
    ).not.toBeNull();
    expect(
      container.querySelector(
        '[data-section="chart-calendar-heatmap-tooltip-date"]'
      )?.textContent
    ).toBe('2024-01-01');
    expect(
      container.querySelector(
        '[data-section="chart-calendar-heatmap-tooltip-value"]'
      )?.textContent
    ).toBe('1');
  });

  it('tooltip hides on mouseleave', () => {
    const { container } = render(
      <ChartCalendarHeatmap values={SAMPLE} year={2024} />
    );
    const jan1 = container.querySelector(
      '[data-cell-date="2024-01-01"]'
    ) as SVGRectElement;
    fireEvent.mouseEnter(jan1);
    expect(
      container.querySelector(
        '[data-section="chart-calendar-heatmap-tooltip"]'
      )
    ).not.toBeNull();
    fireEvent.mouseLeave(jan1);
    expect(
      container.querySelector(
        '[data-section="chart-calendar-heatmap-tooltip"]'
      )
    ).toBeNull();
  });

  it('showTooltip=false suppresses the tooltip', () => {
    const { container } = render(
      <ChartCalendarHeatmap values={SAMPLE} year={2024} showTooltip={false} />
    );
    fireEvent.mouseEnter(
      container.querySelector(
        '[data-cell-date="2024-01-01"]'
      ) as SVGRectElement
    );
    expect(
      container.querySelector(
        '[data-section="chart-calendar-heatmap-tooltip"]'
      )
    ).toBeNull();
  });

  it('formatValue + formatDate reach the tooltip + aria-label', () => {
    const { container } = render(
      <ChartCalendarHeatmap
        values={SAMPLE}
        year={2024}
        formatValue={(v) => `${v}h`}
        formatDate={(d) => `D:${d}`}
      />
    );
    const jan1 = container.querySelector(
      '[data-cell-date="2024-01-01"]'
    ) as SVGRectElement;
    fireEvent.mouseEnter(jan1);
    expect(
      container.querySelector(
        '[data-section="chart-calendar-heatmap-tooltip-value"]'
      )?.textContent
    ).toBe('1h');
    expect(
      container.querySelector(
        '[data-section="chart-calendar-heatmap-tooltip-date"]'
      )?.textContent
    ).toBe('D:2024-01-01');
    expect(jan1.getAttribute('aria-label')).toContain('D:2024-01-01');
    expect(jan1.getAttribute('aria-label')).toContain('1h');
  });

  it('onCellClick fires with the clicked cell', () => {
    const onCellClick = vi.fn();
    const { container } = render(
      <ChartCalendarHeatmap
        values={SAMPLE}
        year={2024}
        onCellClick={onCellClick}
      />
    );
    const jan15 = container.querySelector(
      '[data-cell-date="2024-01-15"]'
    ) as SVGRectElement;
    fireEvent.click(jan15);
    expect(onCellClick).toHaveBeenCalledTimes(1);
    expect(onCellClick.mock.calls[0]![0].date).toBe('2024-01-15');
    expect(onCellClick.mock.calls[0]![0].value).toBe(4);
  });

  it('data-hovered mirrors the hovered state', () => {
    const { container } = render(
      <ChartCalendarHeatmap values={SAMPLE} year={2024} />
    );
    const jan1 = container.querySelector(
      '[data-cell-date="2024-01-01"]'
    ) as SVGRectElement;
    expect(jan1.getAttribute('data-hovered')).toBe('false');
    fireEvent.mouseEnter(jan1);
    expect(jan1.getAttribute('data-hovered')).toBe('true');
    fireEvent.mouseLeave(jan1);
    expect(jan1.getAttribute('data-hovered')).toBe('false');
  });

  it('auto aria description renders by default', () => {
    const { container } = render(
      <ChartCalendarHeatmap values={SAMPLE} year={2024} />
    );
    const desc = container.querySelector(
      '[data-section="chart-calendar-heatmap-aria-desc"]'
    );
    expect(desc?.textContent).toContain('2024-01-01');
    expect(desc?.textContent).toContain('peak 10');
  });

  it('ariaDescription override beats auto', () => {
    const { container } = render(
      <ChartCalendarHeatmap
        values={SAMPLE}
        year={2024}
        ariaDescription="Override"
      />
    );
    expect(
      container.querySelector(
        '[data-section="chart-calendar-heatmap-aria-desc"]'
      )?.textContent
    ).toBe('Override');
  });

  it('data-animate mirrors prop', () => {
    const { container } = render(
      <ChartCalendarHeatmap values={SAMPLE} year={2024} animate={false} />
    );
    expect(
      container.querySelector('[data-section="chart-calendar-heatmap"]')!
        .getAttribute('data-animate')
    ).toBe('false');
  });

  it('SVG sized to fit canvas (width >= leftPad + 52*(size+gap))', () => {
    const { container } = render(
      <ChartCalendarHeatmap values={SAMPLE} year={2024} />
    );
    const svg = container.querySelector(
      '[data-section="chart-calendar-heatmap-svg"]'
    ) as SVGElement;
    const width = Number(svg.getAttribute('width'));
    expect(width).toBeGreaterThan(
      DEFAULT_CHART_CALENDAR_HEATMAP_LEFT_PAD +
        52 *
          (DEFAULT_CHART_CALENDAR_HEATMAP_CELL_SIZE +
            DEFAULT_CHART_CALENDAR_HEATMAP_CELL_GAP)
    );
  });

  it('empty value list still renders all year cells with level 0', () => {
    const { container } = render(
      <ChartCalendarHeatmap values={[]} year={2024} />
    );
    const cells = container.querySelectorAll(
      '[data-section="chart-calendar-heatmap-cell"]'
    );
    expect(cells.length).toBe(366);
    expect(cells[0]!.getAttribute('data-cell-level')).toBe('0');
  });

  it('forwards ref to root', () => {
    const ref = createRef<HTMLDivElement>();
    render(<ChartCalendarHeatmap values={SAMPLE} year={2024} ref={ref} />);
    expect(ref.current?.dataset.section).toBe('chart-calendar-heatmap');
  });

  it('has stable displayName', () => {
    expect(ChartCalendarHeatmap.displayName).toBe('ChartCalendarHeatmap');
  });

  it('custom palette of length 3 is mirrored in the legend', () => {
    const { container } = render(
      <ChartCalendarHeatmap
        values={SAMPLE}
        year={2024}
        palette={['#aaa', '#bbb', '#ccc']}
      />
    );
    const swatches = container.querySelectorAll(
      '[data-section="chart-calendar-heatmap-legend-swatch"]'
    );
    expect(swatches.length).toBe(4);
  });
});
