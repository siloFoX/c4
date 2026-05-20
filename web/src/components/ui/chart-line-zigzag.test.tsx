import { afterEach, describe, expect, it } from 'vitest';
import { createRef } from 'react';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import {
  ChartLineZigzag,
  DEFAULT_CHART_LINE_ZIGZAG_HEIGHT,
  DEFAULT_CHART_LINE_ZIGZAG_PADDING,
  DEFAULT_CHART_LINE_ZIGZAG_PEAK_COLOR,
  DEFAULT_CHART_LINE_ZIGZAG_TROUGH_COLOR,
  DEFAULT_CHART_LINE_ZIGZAG_WIDTH,
  computeLineZigzagLayout,
  describeLineZigzagChart,
  getLineZigzagFinitePoints,
  normalizeLineZigzagThreshold,
  runLineZigzag,
  type ChartLineZigzagPoint,
} from './chart-line-zigzag';

afterEach(() => {
  cleanup();
});

// at 5% the swings 100->110->95->120->90 each clear the threshold;
// at 20% the 110 peak (13.6% retrace) is filtered out
const ZIGZAG_DATA: ChartLineZigzagPoint[] = [
  { x: 0, value: 100 },
  { x: 1, value: 102 },
  { x: 2, value: 110 },
  { x: 3, value: 105 },
  { x: 4, value: 95 },
  { x: 5, value: 98 },
  { x: 6, value: 120 },
  { x: 7, value: 115 },
  { x: 8, value: 90 },
];

describe('chart-line-zigzag defaults', () => {
  it('positive size defaults', () => {
    expect(DEFAULT_CHART_LINE_ZIGZAG_WIDTH).toBeGreaterThan(0);
    expect(DEFAULT_CHART_LINE_ZIGZAG_HEIGHT).toBeGreaterThan(0);
    expect(DEFAULT_CHART_LINE_ZIGZAG_PADDING).toBeGreaterThan(0);
  });
});

describe('getLineZigzagFinitePoints', () => {
  it('drops points with non-finite x or value', () => {
    const r = getLineZigzagFinitePoints([
      { x: 0, value: 0 },
      { x: NaN, value: 1 },
      { x: 1, value: Infinity },
      { x: 2, value: 4 },
    ]);
    expect(r.length).toBe(2);
  });
  it('null returns []', () => {
    expect(getLineZigzagFinitePoints(null)).toEqual([]);
  });
});

describe('normalizeLineZigzagThreshold', () => {
  it('keeps a non-negative percent', () => {
    expect(normalizeLineZigzagThreshold(5)).toBe(5);
    expect(normalizeLineZigzagThreshold(12)).toBe(12);
    expect(normalizeLineZigzagThreshold(0)).toBe(0);
  });
  it('a negative percent falls back to the default', () => {
    expect(normalizeLineZigzagThreshold(-3)).toBe(5);
  });
  it('a non-finite percent falls back to the default', () => {
    expect(normalizeLineZigzagThreshold(NaN)).toBe(5);
  });
});

describe('runLineZigzag', () => {
  it('empty -> ok=false', () => {
    expect(runLineZigzag([]).ok).toBe(false);
  });
  it('a single point -> ok=false', () => {
    expect(runLineZigzag([{ x: 0, value: 1 }]).ok).toBe(false);
  });
  it('confirms the significant pivots at a 5% threshold', () => {
    const r = runLineZigzag(ZIGZAG_DATA, 5);
    expect(r.pivotCount).toBe(5);
    expect(r.pivots.map((p) => p.index)).toEqual([0, 2, 4, 6, 8]);
  });
  it('classifies each pivot kind', () => {
    const r = runLineZigzag(ZIGZAG_DATA, 5);
    expect(r.pivots.map((p) => p.kind)).toEqual([
      'start',
      'peak',
      'trough',
      'peak',
      'end',
    ]);
  });
  it('the pivots take the extreme values of each swing', () => {
    const r = runLineZigzag(ZIGZAG_DATA, 5);
    expect(r.pivots.map((p) => p.value)).toEqual([100, 110, 95, 120, 90]);
  });
  it('reports the percent move from the previous pivot', () => {
    const r = runLineZigzag(ZIGZAG_DATA, 5);
    expect(r.pivots[0]!.moveFromPrev).toBe(0);
    expect(r.pivots[1]!.moveFromPrev).toBeCloseTo(10, 6); // 100 -> 110
    expect(r.pivots[3]!.moveFromPrev).toBeCloseTo(26.3158, 3); // 95 -> 120
  });
  it('a higher threshold filters out smaller swings', () => {
    const low = runLineZigzag(ZIGZAG_DATA, 5).pivotCount;
    const high = runLineZigzag(ZIGZAG_DATA, 20).pivotCount;
    expect(high).toBeLessThan(low);
    expect(high).toBe(4);
  });
  it('a threshold no swing can clear leaves just start + end', () => {
    const r = runLineZigzag(ZIGZAG_DATA, 100);
    expect(r.pivotCount).toBe(2);
    expect(r.pivots.map((p) => p.kind)).toEqual(['start', 'end']);
  });
  it('normalizes the threshold in the result', () => {
    expect(runLineZigzag(ZIGZAG_DATA, -3).thresholdPercent).toBe(5);
  });
  it('sorts the series by x before scanning', () => {
    const r = runLineZigzag(
      [
        { x: 2, value: 4 },
        { x: 0, value: 0 },
        { x: 1, value: 2 },
      ],
      5,
    );
    expect(r.series.map((p) => p.x)).toEqual([0, 1, 2]);
  });
  it('a two-point series yields a start and an end pivot', () => {
    const r = runLineZigzag(
      [
        { x: 0, value: 1 },
        { x: 1, value: 2 },
      ],
      5,
    );
    expect(r.pivots.map((p) => p.kind)).toEqual(['start', 'end']);
  });
});

describe('computeLineZigzagLayout', () => {
  const base = { width: 500, height: 240, padding: 30 };

  it('empty data -> ok=false', () => {
    expect(computeLineZigzagLayout({ data: [], ...base }).ok).toBe(false);
  });

  it('degenerate canvas -> ok=false', () => {
    expect(
      computeLineZigzagLayout({
        data: ZIGZAG_DATA,
        width: 20,
        height: 20,
        padding: 30,
      }).ok,
    ).toBe(false);
  });

  it('builds the raw line path and the zigzag path', () => {
    const layout = computeLineZigzagLayout({ data: ZIGZAG_DATA, ...base });
    expect(layout.ok).toBe(true);
    expect(layout.rawPath).toContain('M ');
    expect(layout.zigzagPath).toContain('M ');
    expect(layout.zigzagPath).toContain(' L ');
  });

  it('projects a raw dot per point and a pivot per significant pivot', () => {
    const layout = computeLineZigzagLayout({ data: ZIGZAG_DATA, ...base });
    expect(layout.rawDots.length).toBe(9);
    expect(layout.pivots.length).toBe(5);
  });

  it('every projected coordinate is finite', () => {
    const layout = computeLineZigzagLayout({ data: ZIGZAG_DATA, ...base });
    for (const p of layout.pivots) {
      expect(Number.isFinite(p.px)).toBe(true);
      expect(Number.isFinite(p.py)).toBe(true);
    }
  });

  it('the x and y ranges come from the data', () => {
    const layout = computeLineZigzagLayout({ data: ZIGZAG_DATA, ...base });
    expect(layout.xMin).toBe(0);
    expect(layout.xMax).toBe(8);
    expect(layout.yMin).toBe(90);
    expect(layout.yMax).toBe(120);
  });

  it('exposes the pivot count and threshold', () => {
    const layout = computeLineZigzagLayout({ data: ZIGZAG_DATA, ...base });
    expect(layout.pivotCount).toBe(5);
    expect(layout.thresholdPercent).toBe(5);
    expect(layout.totalPoints).toBe(9);
  });

  it('bounds overrides honoured', () => {
    const layout = computeLineZigzagLayout({
      data: ZIGZAG_DATA,
      ...base,
      yMin: 0,
      yMax: 200,
    });
    expect(layout.yMin).toBe(0);
    expect(layout.yMax).toBe(200);
  });
});

describe('describeLineZigzagChart', () => {
  it('no data -> No data', () => {
    expect(describeLineZigzagChart([])).toBe('No data');
    expect(describeLineZigzagChart(null)).toBe('No data');
  });
  it('summary mentions ZigZag + pivots + threshold', () => {
    const s = describeLineZigzagChart(ZIGZAG_DATA);
    expect(s).toContain('ZigZag');
    expect(s).toContain('pivot');
    expect(s).toContain('threshold');
  });
});

describe('<ChartLineZigzag> render', () => {
  it('renders empty state with no data', () => {
    render(<ChartLineZigzag data={[]} />);
    expect(
      document
        .querySelector('[data-section="chart-line-zigzag"]')!
        .getAttribute('data-empty'),
    ).toBe('true');
  });

  it('renders the raw line and hides it via prop', () => {
    const { rerender } = render(<ChartLineZigzag data={ZIGZAG_DATA} />);
    expect(
      document.querySelector('[data-section="chart-line-zigzag-raw-path"]'),
    ).not.toBeNull();
    rerender(<ChartLineZigzag data={ZIGZAG_DATA} showRawLine={false} />);
    expect(
      document.querySelector('[data-section="chart-line-zigzag-raw-path"]'),
    ).toBeNull();
  });

  it('renders the zigzag overlay path and hides it via prop', () => {
    const { rerender } = render(<ChartLineZigzag data={ZIGZAG_DATA} />);
    expect(
      document.querySelector(
        '[data-section="chart-line-zigzag-zigzag-path"]',
      ),
    ).not.toBeNull();
    rerender(<ChartLineZigzag data={ZIGZAG_DATA} showZigzag={false} />);
    expect(
      document.querySelector(
        '[data-section="chart-line-zigzag-zigzag-path"]',
      ),
    ).toBeNull();
  });

  it('renders one marker per pivot and hides them via prop', () => {
    const { rerender } = render(<ChartLineZigzag data={ZIGZAG_DATA} />);
    expect(
      document.querySelectorAll(
        '[data-section="chart-line-zigzag-pivot"]',
      ).length,
    ).toBe(5);
    rerender(<ChartLineZigzag data={ZIGZAG_DATA} showPivots={false} />);
    expect(
      document.querySelector('[data-section="chart-line-zigzag-pivot"]'),
    ).toBeNull();
  });

  it('colours pivots by kind', () => {
    render(<ChartLineZigzag data={ZIGZAG_DATA} />);
    expect(
      document
        .querySelector(
          '[data-section="chart-line-zigzag-pivot"][data-kind="peak"]',
        )!
        .getAttribute('fill'),
    ).toBe(DEFAULT_CHART_LINE_ZIGZAG_PEAK_COLOR);
    expect(
      document
        .querySelector(
          '[data-section="chart-line-zigzag-pivot"][data-kind="trough"]',
        )!
        .getAttribute('fill'),
    ).toBe(DEFAULT_CHART_LINE_ZIGZAG_TROUGH_COLOR);
  });

  it('raw dots are off by default and shown via prop', () => {
    const { rerender } = render(<ChartLineZigzag data={ZIGZAG_DATA} />);
    expect(
      document.querySelector('[data-section="chart-line-zigzag-raw-dot"]'),
    ).toBeNull();
    rerender(<ChartLineZigzag data={ZIGZAG_DATA} showRawDots />);
    expect(
      document.querySelectorAll(
        '[data-section="chart-line-zigzag-raw-dot"]',
      ).length,
    ).toBe(9);
  });

  it('config badge shows the threshold and pivot count', () => {
    render(<ChartLineZigzag data={ZIGZAG_DATA} />);
    expect(
      document.querySelector(
        '[data-section="chart-line-zigzag-badge-threshold"]',
      )?.textContent,
    ).toBe('thr=5%');
    expect(
      document.querySelector(
        '[data-section="chart-line-zigzag-badge-pivots"]',
      )?.textContent,
    ).toBe('pivots=5');
  });

  it('hides the config badge via showConfigBadge=false', () => {
    render(<ChartLineZigzag data={ZIGZAG_DATA} showConfigBadge={false} />);
    expect(
      document.querySelector('[data-section="chart-line-zigzag-badge"]'),
    ).toBeNull();
  });

  it('ARIA: region + img + sr-only desc', () => {
    render(<ChartLineZigzag data={ZIGZAG_DATA} />);
    expect(
      document
        .querySelector('[data-section="chart-line-zigzag"]')!
        .getAttribute('role'),
    ).toBe('region');
    expect(
      document
        .querySelector('[data-section="chart-line-zigzag-svg"]')!
        .getAttribute('role'),
    ).toBe('img');
    expect(
      document.querySelector(
        '[data-section="chart-line-zigzag-aria-desc"]',
      )!.textContent,
    ).toContain('ZigZag');
  });

  it('root carries data-* attributes', () => {
    render(<ChartLineZigzag data={ZIGZAG_DATA} />);
    const root = document.querySelector('[data-section="chart-line-zigzag"]');
    expect(root!.getAttribute('data-pivot-count')).toBe('5');
    expect(root!.getAttribute('data-threshold-percent')).toBe('5');
    expect(root!.getAttribute('data-total-points')).toBe('9');
  });

  it('pivot exposes kind / x / value / move attributes', () => {
    render(<ChartLineZigzag data={ZIGZAG_DATA} />);
    const pivots = document.querySelectorAll(
      '[data-section="chart-line-zigzag-pivot"]',
    );
    // pivot index 1 is the peak at x=2, value 110, +10% from 100
    expect(pivots[1]!.getAttribute('data-kind')).toBe('peak');
    expect(Number(pivots[1]!.getAttribute('data-x'))).toBe(2);
    expect(Number(pivots[1]!.getAttribute('data-value'))).toBe(110);
    expect(Number(pivots[1]!.getAttribute('data-move'))).toBeCloseTo(10, 6);
  });

  it('tooltip on a pivot shows kind + x + value + move', () => {
    render(<ChartLineZigzag data={ZIGZAG_DATA} />);
    const pivots = document.querySelectorAll(
      '[data-section="chart-line-zigzag-pivot"]',
    );
    fireEvent.mouseEnter(pivots[1]!);
    expect(
      document.querySelector(
        '[data-section="chart-line-zigzag-tooltip-kind"]',
      )?.textContent,
    ).toBe('peak pivot');
    expect(
      document.querySelector(
        '[data-section="chart-line-zigzag-tooltip-move"]',
      )?.textContent,
    ).toBe('move: +10.0%');
    fireEvent.mouseLeave(pivots[1]!);
    expect(
      document.querySelector('[data-section="chart-line-zigzag-tooltip"]'),
    ).toBeNull();
  });

  it('omits the tooltip when showTooltip=false', () => {
    render(<ChartLineZigzag data={ZIGZAG_DATA} showTooltip={false} />);
    const pivot = document.querySelector(
      '[data-section="chart-line-zigzag-pivot"]',
    );
    fireEvent.mouseEnter(pivot!);
    expect(
      document.querySelector('[data-section="chart-line-zigzag-tooltip"]'),
    ).toBeNull();
  });

  it('onPivotClick fires with the pivot payload', () => {
    let captured: { index: number; kind: string } | null = null;
    render(
      <ChartLineZigzag
        data={ZIGZAG_DATA}
        onPivotClick={({ pivot }) => {
          captured = { index: pivot.index, kind: pivot.kind };
        }}
      />,
    );
    const pivots = document.querySelectorAll(
      '[data-section="chart-line-zigzag-pivot"]',
    );
    fireEvent.click(pivots[1]!);
    expect(captured).not.toBeNull();
    expect(captured!.kind).toBe('peak');
    expect(captured!.index).toBe(2);
  });

  it('a higher threshold prop reduces the pivot count', () => {
    render(<ChartLineZigzag data={ZIGZAG_DATA} thresholdPercent={20} />);
    expect(
      document.querySelectorAll(
        '[data-section="chart-line-zigzag-pivot"]',
      ).length,
    ).toBe(4);
    expect(
      document
        .querySelector('[data-section="chart-line-zigzag"]')!
        .getAttribute('data-pivot-count'),
    ).toBe('4');
  });

  it('footer reports the threshold and pivot count, and hides via prop', () => {
    const { rerender } = render(<ChartLineZigzag data={ZIGZAG_DATA} />);
    expect(
      document.querySelector(
        '[data-section="chart-line-zigzag-footer-stats"]',
      )?.textContent,
    ).toContain('threshold=5%');
    rerender(<ChartLineZigzag data={ZIGZAG_DATA} showFooter={false} />);
    expect(
      document.querySelector('[data-section="chart-line-zigzag-footer"]'),
    ).toBeNull();
  });

  it('renders x and y axis ticks', () => {
    render(<ChartLineZigzag data={ZIGZAG_DATA} />);
    expect(
      document.querySelectorAll(
        '[data-section="chart-line-zigzag-tick"][data-axis="x"]',
      ).length,
    ).toBeGreaterThan(0);
    expect(
      document.querySelectorAll(
        '[data-section="chart-line-zigzag-tick"][data-axis="y"]',
      ).length,
    ).toBeGreaterThan(0);
  });

  it('animate flag toggles data-animate + class', () => {
    const { rerender } = render(
      <ChartLineZigzag data={ZIGZAG_DATA} animate={true} />,
    );
    const root = document.querySelector('[data-section="chart-line-zigzag"]');
    expect(root!.getAttribute('data-animate')).toBe('true');
    expect(root!.className).toContain('motion-safe:animate-fade-in');
    rerender(<ChartLineZigzag data={ZIGZAG_DATA} animate={false} />);
    expect(
      document
        .querySelector('[data-section="chart-line-zigzag"]')!
        .getAttribute('data-animate'),
    ).toBe('false');
  });

  it('ref forwarding', () => {
    const ref = createRef<HTMLDivElement>();
    render(<ChartLineZigzag ref={ref} data={ZIGZAG_DATA} />);
    expect(ref.current!.getAttribute('data-section')).toBe(
      'chart-line-zigzag',
    );
  });

  it('has displayName', () => {
    expect(ChartLineZigzag.displayName).toBe('ChartLineZigzag');
  });

  it('custom ariaLabel applied to root and svg', () => {
    render(<ChartLineZigzag data={ZIGZAG_DATA} ariaLabel="Swing pivots" />);
    expect(
      document
        .querySelector('[data-section="chart-line-zigzag"]')!
        .getAttribute('aria-label'),
    ).toBe('Swing pivots');
    expect(
      document
        .querySelector('[data-section="chart-line-zigzag-svg"]')!
        .getAttribute('aria-label'),
    ).toBe('Swing pivots');
  });

  it('xLabel and yLabel render axis text', () => {
    render(
      <ChartLineZigzag data={ZIGZAG_DATA} xLabel="bar" yLabel="price" />,
    );
    expect(screen.getByText('bar').getAttribute('data-section')).toBe(
      'chart-line-zigzag-x-label',
    );
    expect(screen.getByText('price').getAttribute('data-section')).toBe(
      'chart-line-zigzag-y-label',
    );
  });
});
