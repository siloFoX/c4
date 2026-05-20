import { describe, it, expect, afterEach } from 'vitest';
import { createRef } from 'react';
import { render, cleanup } from '@testing-library/react';
import {
  ChartLineZlema,
  computeLineZlemaEma,
  computeLineZlema,
  computeLineZlemaLayout,
  normalizeLineZlemaPeriod,
  getLineZlemaFinitePoints,
  runLineZlema,
  describeLineZlemaChart,
  DEFAULT_CHART_LINE_ZLEMA_PERIOD,
  type ChartLineZlemaPoint,
} from './chart-line-zlema';

afterEach(() => cleanup());

// A step-3 linear ramp; on a linear trend the ZLEMA has zero lag,
// so the ZLEMA reproduces the value exactly once it is defined.
const ZLEMA_DATA: ChartLineZlemaPoint[] = [
  { x: 0, value: 0 },
  { x: 1, value: 3 },
  { x: 2, value: 6 },
  { x: 3, value: 9 },
  { x: 4, value: 12 },
  { x: 5, value: 15 },
  { x: 6, value: 18 },
];

// Hand-verified for period 3 (lag 1):
//   deLagged = 2*value[i] - value[i-1] = [null,6,9,12,15,18,21]
//   zlema    = EMA(deLagged, 3) = [null,null,null,9,12,15,18]
const RUN_OPTS = { period: 3 };

describe('getLineZlemaFinitePoints', () => {
  it('keeps only points with finite x and value', () => {
    const points = getLineZlemaFinitePoints([
      { x: 0, value: 1 },
      { x: NaN, value: 2 },
      { x: 1, value: Infinity },
      { x: 2, value: 3 },
    ]);
    expect(points).toHaveLength(2);
    expect(points.map((p) => p.x)).toEqual([0, 2]);
  });

  it('returns an empty array for non-array input', () => {
    expect(getLineZlemaFinitePoints(null)).toEqual([]);
    expect(getLineZlemaFinitePoints(undefined)).toEqual([]);
  });
});

describe('normalizeLineZlemaPeriod', () => {
  it('passes through a positive integer', () => {
    expect(normalizeLineZlemaPeriod(14, 14)).toBe(14);
  });

  it('floors a fractional period', () => {
    expect(normalizeLineZlemaPeriod(14.7, 14)).toBe(14);
  });

  it('falls back when the period is below one', () => {
    expect(normalizeLineZlemaPeriod(0, 14)).toBe(14);
    expect(normalizeLineZlemaPeriod(-2, 14)).toBe(14);
  });

  it('falls back when the period is not finite', () => {
    expect(normalizeLineZlemaPeriod(NaN, 14)).toBe(14);
    expect(normalizeLineZlemaPeriod(Infinity, 14)).toBe(14);
  });
});

describe('computeLineZlemaEma', () => {
  it('seeds with the simple mean then folds in later values', () => {
    expect(computeLineZlemaEma([2, 4, 6], 2)).toEqual([null, 3, 5]);
  });

  it('uses the period-length mean as the seed', () => {
    const ema = computeLineZlemaEma([4, 4, 4, 12], 3);
    expect(ema[2]).toBe(4);
    expect(ema[3]).toBe(8);
  });

  it('skips leading null placeholders before seeding', () => {
    expect(computeLineZlemaEma([null, 6, 9, 12], 2)).toEqual([
      null,
      null,
      7.5,
      10.5,
    ]);
  });

  it('returns an empty array for non-array input', () => {
    expect(computeLineZlemaEma(null, 2)).toEqual([]);
  });
});

describe('computeLineZlema', () => {
  const values = ZLEMA_DATA.map((p) => p.value);

  it('derives the lag as floor of half the period minus one', () => {
    expect(computeLineZlema(values, 3).lag).toBe(1);
    expect(computeLineZlema(values, 14).lag).toBe(6);
  });

  it('takes the de-lagged series as twice the value minus the lagged value', () => {
    const { deLagged } = computeLineZlema(values, 3);
    expect(deLagged).toEqual([null, 6, 9, 12, 15, 18, 21]);
  });

  it('smooths the de-lagged series into the ZLEMA', () => {
    const { zlema } = computeLineZlema(values, 3);
    expect(zlema).toEqual([null, null, null, 9, 12, 15, 18]);
  });

  it('tracks a linear trend with zero lag', () => {
    const { zlema } = computeLineZlema(values, 3);
    for (let i = 0; i < values.length; i += 1) {
      if (zlema[i] !== null) {
        expect(zlema[i]).toBe(values[i]);
      }
    }
  });

  it('reproduces the series for a period of one', () => {
    const { lag, zlema } = computeLineZlema([5, 10, 15], 1);
    expect(lag).toBe(0);
    expect(zlema).toEqual([5, 10, 15]);
  });

  it('returns empty arrays for non-array input', () => {
    expect(computeLineZlema(null, 3)).toEqual({
      lag: 1,
      deLagged: [],
      zlema: [],
    });
  });
});

describe('runLineZlema', () => {
  it('reports ok with the resolved period and lag', () => {
    const run = runLineZlema(ZLEMA_DATA, RUN_OPTS);
    expect(run.ok).toBe(true);
    expect(run.period).toBe(3);
    expect(run.lag).toBe(1);
  });

  it('exposes the ZLEMA series', () => {
    const run = runLineZlema(ZLEMA_DATA, RUN_OPTS);
    expect(run.zlema).toEqual([null, null, null, 9, 12, 15, 18]);
  });

  it('reports the final, min and max ZLEMA readings', () => {
    const run = runLineZlema(ZLEMA_DATA, RUN_OPTS);
    expect(run.zlemaFinal).toBe(18);
    expect(run.zlemaMin).toBe(9);
    expect(run.zlemaMax).toBe(18);
  });

  it('classifies a linear trend as price sitting on the ZLEMA', () => {
    const run = runLineZlema(ZLEMA_DATA, RUN_OPTS);
    expect(run.aboveCount).toBe(0);
    expect(run.belowCount).toBe(0);
    expect(run.samples[5]!.position).toBe('on');
  });

  it('classifies price above the ZLEMA on an upward step', () => {
    const step: ChartLineZlemaPoint[] = [
      { x: 0, value: 0 },
      { x: 1, value: 0 },
      { x: 2, value: 0 },
      { x: 3, value: 30 },
      { x: 4, value: 30 },
      { x: 5, value: 30 },
      { x: 6, value: 30 },
    ];
    const run = runLineZlema(step, RUN_OPTS);
    expect(run.samples[3]!.position).toBe('above');
    expect(run.aboveCount).toBeGreaterThanOrEqual(1);
  });

  it('sorts the series by x before computing', () => {
    const shuffled = [...ZLEMA_DATA].reverse();
    const run = runLineZlema(shuffled, RUN_OPTS);
    expect(run.series.map((p) => p.x)).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect(run.zlema[6]).toBe(18);
  });

  it('reports not-ok for fewer than two points', () => {
    const run = runLineZlema([{ x: 0, value: 1 }]);
    expect(run.ok).toBe(false);
    expect(run.samples).toEqual([]);
  });

  it('reports not-ok for empty input', () => {
    expect(runLineZlema([]).ok).toBe(false);
    expect(runLineZlema(null).ok).toBe(false);
  });

  it('defaults the period when no options are given', () => {
    const run = runLineZlema(ZLEMA_DATA);
    expect(run.period).toBe(DEFAULT_CHART_LINE_ZLEMA_PERIOD);
  });

  it('produces one sample per series point', () => {
    const run = runLineZlema(ZLEMA_DATA, RUN_OPTS);
    expect(run.samples).toHaveLength(ZLEMA_DATA.length);
  });
});

describe('computeLineZlemaLayout', () => {
  const base = {
    data: ZLEMA_DATA,
    ...RUN_OPTS,
    width: 560,
    height: 320,
    padding: 40,
  };

  it('produces an ok layout for a valid series', () => {
    const layout = computeLineZlemaLayout(base);
    expect(layout.ok).toBe(true);
    expect(layout.totalPoints).toBe(7);
  });

  it('builds non-empty price and ZLEMA paths', () => {
    const layout = computeLineZlemaLayout(base);
    expect(layout.pricePath.startsWith('M')).toBe(true);
    expect(layout.zlemaPath.startsWith('M')).toBe(true);
  });

  it('emits one marker per defined ZLEMA reading', () => {
    const layout = computeLineZlemaLayout(base);
    expect(layout.zlemaMarkers).toHaveLength(4);
    expect(layout.priceDots).toHaveLength(7);
  });

  it('spans the y domain over both the price and the ZLEMA', () => {
    const layout = computeLineZlemaLayout(base);
    expect(layout.yMin).toBe(0);
    expect(layout.yMax).toBe(18);
  });

  it('carries the period, lag and statistics onto the layout', () => {
    const layout = computeLineZlemaLayout(base);
    expect(layout.period).toBe(3);
    expect(layout.lag).toBe(1);
    expect(layout.zlemaFinal).toBe(18);
  });

  it('returns a not-ok layout for collapsed dimensions', () => {
    const layout = computeLineZlemaLayout({ ...base, width: 10 });
    expect(layout.ok).toBe(false);
    expect(layout.zlemaPath).toBe('');
  });

  it('returns a not-ok layout when there is too little data', () => {
    const layout = computeLineZlemaLayout({
      ...base,
      data: [{ x: 0, value: 1 }],
    });
    expect(layout.ok).toBe(false);
  });
});

describe('describeLineZlemaChart', () => {
  it('summarises the chart with the indicator vocabulary', () => {
    const text = describeLineZlemaChart(ZLEMA_DATA, RUN_OPTS);
    expect(text).toContain('Zero-Lag Exponential Moving Average');
    expect(text).toContain('ZLEMA');
    expect(text).toContain('overlay');
    expect(text).toContain('lag');
    expect(text).toContain('exponential moving average');
    expect(text).toContain('momentum');
  });

  it('reports the price-versus-ZLEMA counts', () => {
    const text = describeLineZlemaChart(ZLEMA_DATA, RUN_OPTS);
    expect(text).toContain('above the ZLEMA on 0 bars');
    expect(text).toContain('below on 0');
  });

  it('returns a no-data message for an insufficient series', () => {
    expect(describeLineZlemaChart([])).toBe('No data');
    expect(describeLineZlemaChart(null)).toBe('No data');
  });
});

describe('<ChartLineZlema />', () => {
  it('renders a labelled region', () => {
    const { container } = render(
      <ChartLineZlema data={ZLEMA_DATA} {...RUN_OPTS} />,
    );
    const region = container.querySelector('[role="region"]');
    expect(region).not.toBeNull();
    expect(region!.getAttribute('aria-label')).toBeTruthy();
  });

  it('exposes an accessible description', () => {
    const { container } = render(
      <ChartLineZlema data={ZLEMA_DATA} {...RUN_OPTS} />,
    );
    const desc = container.querySelector(
      '[data-section="chart-line-zlema-aria-desc"]',
    );
    expect(desc).not.toBeNull();
    expect(desc!.textContent).toContain('Zero-Lag Exponential Moving Average');
  });

  it('publishes the run statistics as data attributes', () => {
    const { container } = render(
      <ChartLineZlema data={ZLEMA_DATA} {...RUN_OPTS} />,
    );
    const root = container.querySelector('[data-section="chart-line-zlema"]');
    expect(root!.getAttribute('data-period')).toBe('3');
    expect(root!.getAttribute('data-lag')).toBe('1');
    expect(root!.getAttribute('data-above-count')).toBe('0');
    expect(root!.getAttribute('data-below-count')).toBe('0');
    expect(root!.getAttribute('data-total-points')).toBe('7');
    expect(root!.getAttribute('data-empty')).toBe('false');
  });

  it('renders an svg with the price and ZLEMA lines', () => {
    const { container } = render(
      <ChartLineZlema data={ZLEMA_DATA} {...RUN_OPTS} />,
    );
    expect(
      container.querySelector('[data-section="chart-line-zlema-svg"]'),
    ).not.toBeNull();
    expect(
      container.querySelector('[data-section="chart-line-zlema-price-path"]'),
    ).not.toBeNull();
    expect(
      container.querySelector('[data-section="chart-line-zlema-zlema-line"]'),
    ).not.toBeNull();
  });

  it('renders one marker per defined ZLEMA reading', () => {
    const { container } = render(
      <ChartLineZlema data={ZLEMA_DATA} {...RUN_OPTS} />,
    );
    const markers = container.querySelectorAll(
      '[data-section="chart-line-zlema-marker"]',
    );
    expect(markers).toHaveLength(4);
  });

  it('renders the config badge with the period and lag', () => {
    const { container } = render(
      <ChartLineZlema data={ZLEMA_DATA} {...RUN_OPTS} />,
    );
    const period = container.querySelector(
      '[data-section="chart-line-zlema-badge-period"]',
    );
    const lag = container.querySelector(
      '[data-section="chart-line-zlema-badge-lag"]',
    );
    expect(period!.textContent).toContain('3');
    expect(lag!.textContent).toContain('1');
  });

  it('renders a two-item legend', () => {
    const { container } = render(
      <ChartLineZlema data={ZLEMA_DATA} {...RUN_OPTS} />,
    );
    const items = container.querySelectorAll(
      '[data-section="chart-line-zlema-legend-item"]',
    );
    expect(items).toHaveLength(2);
  });

  it('hides the price path when price is in the hidden set', () => {
    const { container } = render(
      <ChartLineZlema
        data={ZLEMA_DATA}
        {...RUN_OPTS}
        hiddenSeries={['price']}
      />,
    );
    expect(
      container.querySelector('[data-section="chart-line-zlema-price-path"]'),
    ).toBeNull();
  });

  it('hides the ZLEMA line and markers when showZlema is false', () => {
    const { container } = render(
      <ChartLineZlema data={ZLEMA_DATA} {...RUN_OPTS} showZlema={false} />,
    );
    expect(
      container.querySelector('[data-section="chart-line-zlema-zlema-line"]'),
    ).toBeNull();
    expect(
      container.querySelectorAll('[data-section="chart-line-zlema-marker"]'),
    ).toHaveLength(0);
  });

  it('renders price dots when showDots is true', () => {
    const { container } = render(
      <ChartLineZlema data={ZLEMA_DATA} {...RUN_OPTS} showDots />,
    );
    expect(
      container.querySelectorAll('[data-section="chart-line-zlema-dot"]'),
    ).toHaveLength(7);
  });

  it('omits price dots by default', () => {
    const { container } = render(
      <ChartLineZlema data={ZLEMA_DATA} {...RUN_OPTS} />,
    );
    expect(
      container.querySelectorAll('[data-section="chart-line-zlema-dot"]'),
    ).toHaveLength(0);
  });

  it('renders the empty state for an insufficient series', () => {
    const { container } = render(
      <ChartLineZlema data={[{ x: 0, value: 1 }]} />,
    );
    const root = container.querySelector('[data-section="chart-line-zlema"]');
    expect(root!.getAttribute('data-empty')).toBe('true');
    expect(
      container.querySelector('[data-section="chart-line-zlema-svg"]'),
    ).toBeNull();
  });

  it('omits the config badge when showConfigBadge is false', () => {
    const { container } = render(
      <ChartLineZlema data={ZLEMA_DATA} {...RUN_OPTS} showConfigBadge={false} />,
    );
    expect(
      container.querySelector('[data-section="chart-line-zlema-badge"]'),
    ).toBeNull();
  });

  it('omits the legend when showLegend is false', () => {
    const { container } = render(
      <ChartLineZlema data={ZLEMA_DATA} {...RUN_OPTS} showLegend={false} />,
    );
    expect(
      container.querySelector('[data-section="chart-line-zlema-legend"]'),
    ).toBeNull();
  });

  it('forwards a ref to the root element', () => {
    const ref = createRef<HTMLDivElement>();
    render(<ChartLineZlema ref={ref} data={ZLEMA_DATA} {...RUN_OPTS} />);
    expect(ref.current).not.toBeNull();
    expect(ref.current!.getAttribute('data-section')).toBe(
      'chart-line-zlema',
    );
  });

  it('has a stable displayName', () => {
    expect(ChartLineZlema.displayName).toBe('ChartLineZlema');
  });

  it('toggles the animate attribute', () => {
    const { container } = render(
      <ChartLineZlema data={ZLEMA_DATA} {...RUN_OPTS} animate={false} />,
    );
    const root = container.querySelector('[data-section="chart-line-zlema"]');
    expect(root!.getAttribute('data-animate')).toBe('false');
  });
});
