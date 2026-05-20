import { describe, it, expect, afterEach } from 'vitest';
import { createRef } from 'react';
import { render, cleanup } from '@testing-library/react';
import {
  ChartLineWma,
  computeLineWma,
  computeLineWmaLayout,
  getLineWmaFinitePoints,
  normalizeLineWmaPeriod,
  runLineWma,
  describeLineWmaChart,
  type ChartLineWmaPoint,
} from './chart-line-wma';

afterEach(() => cleanup());

// With period 3 the weight total is 3*(3+1)/2 = 6 and the window
// values divide cleanly, so the WMA stays bit-exact:
//   WMA[i] = (1*oldest + 2*middle + 3*newest) / 6
//   WMA[2] = (1*6 + 2*6  + 3*12) / 6 = 54/6 =  9
//   WMA[3] = (1*6 + 2*12 + 3*12) / 6 = 66/6 = 11
//   WMA[4] = (1*12+ 2*12 + 3*6 ) / 6 = 54/6 =  9
//   WMA[5] = (1*12+ 2*6  + 3*6 ) / 6 = 42/6 =  7
//   WMA = [null, null, 9, 11, 9, 7]
// The price climbs above the WMA on the way up and drops below it
// on the way down.
const WMA_DATA: ChartLineWmaPoint[] = [
  { x: 0, value: 6 },
  { x: 1, value: 6 },
  { x: 2, value: 12 },
  { x: 3, value: 12 },
  { x: 4, value: 6 },
  { x: 5, value: 6 },
];

describe('getLineWmaFinitePoints', () => {
  it('keeps only points with finite x and value', () => {
    const points = getLineWmaFinitePoints([
      { x: 0, value: 5 },
      { x: NaN, value: 5 },
      { x: 1, value: Infinity },
      { x: 2, value: 9 },
    ]);
    expect(points).toHaveLength(2);
    expect(points.map((p) => p.x)).toEqual([0, 2]);
  });

  it('returns an empty array for non-array input', () => {
    expect(getLineWmaFinitePoints(null)).toEqual([]);
    expect(getLineWmaFinitePoints(undefined)).toEqual([]);
  });
});

describe('normalizeLineWmaPeriod', () => {
  it('floors a fractional period', () => {
    expect(normalizeLineWmaPeriod(20.7, 20)).toBe(20);
  });

  it('falls back for a sub-1, NaN or negative period', () => {
    expect(normalizeLineWmaPeriod(0, 20)).toBe(20);
    expect(normalizeLineWmaPeriod(NaN, 20)).toBe(20);
    expect(normalizeLineWmaPeriod(-5, 20)).toBe(20);
  });
});

describe('computeLineWma', () => {
  const values = WMA_DATA.map((p) => p.value);

  it('computes the linearly weighted average across the window', () => {
    expect(computeLineWma(values, 3)).toEqual([null, null, 9, 11, 9, 7]);
  });

  it('leaves the first period-1 bars as a null warm-up', () => {
    const wma = computeLineWma(values, 3);
    expect(wma[0]).toBeNull();
    expect(wma[1]).toBeNull();
    expect(wma[2]).not.toBeNull();
  });

  it('weights the newest value the heaviest', () => {
    // window [1, 1, 4] -> (1*1 + 2*1 + 3*4) / 6 = 15/6 = 2.5,
    // which is pulled above the simple mean of (1+1+4)/3 = 2.
    const wma = computeLineWma([1, 1, 4], 3);
    expect(wma[2]).toBe(2.5);
  });

  it('reads a flat WMA equal to the constant of a flat series', () => {
    expect(computeLineWma([5, 5, 5, 5], 3)).toEqual([null, null, 5, 5]);
  });

  it('reproduces the series for a period of one', () => {
    expect(computeLineWma([3, 7, 9], 1)).toEqual([3, 7, 9]);
  });

  it('returns an empty array for non-array input', () => {
    expect(computeLineWma(null, 3)).toEqual([]);
  });

  it('returns all null when the series is shorter than the period', () => {
    expect(computeLineWma([4, 8], 3)).toEqual([null, null]);
  });
});

describe('runLineWma', () => {
  it('reports ok for a sufficient series', () => {
    expect(runLineWma(WMA_DATA, { period: 3 }).ok).toBe(true);
  });

  it('carries the period onto the run', () => {
    expect(runLineWma(WMA_DATA, { period: 3 }).period).toBe(3);
  });

  it('exposes the WMA series', () => {
    const run = runLineWma(WMA_DATA, { period: 3 });
    expect(run.wma).toEqual([null, null, 9, 11, 9, 7]);
  });

  it('reports the final, min and max WMA readings', () => {
    const run = runLineWma(WMA_DATA, { period: 3 });
    expect(run.wmaFinal).toBe(7);
    expect(run.wmaMin).toBe(7);
    expect(run.wmaMax).toBe(11);
  });

  it('classifies each sample by price position versus the WMA', () => {
    const run = runLineWma(WMA_DATA, { period: 3 });
    expect(run.samples[1]!.position).toBe('on');
    expect(run.samples[2]!.position).toBe('above');
    expect(run.samples[3]!.position).toBe('above');
    expect(run.samples[4]!.position).toBe('below');
    expect(run.samples[5]!.position).toBe('below');
  });

  it('counts bars above and below the WMA', () => {
    const run = runLineWma(WMA_DATA, { period: 3 });
    expect(run.aboveCount).toBe(2);
    expect(run.belowCount).toBe(2);
  });

  it('leaves warm-up samples with a null WMA', () => {
    const run = runLineWma(WMA_DATA, { period: 3 });
    expect(run.samples[0]!.wma).toBeNull();
    expect(run.samples[2]!.wma).toBe(9);
  });

  it('sorts the series by x before computing', () => {
    const shuffled = [...WMA_DATA].reverse();
    const run = runLineWma(shuffled, { period: 3 });
    expect(run.series.map((p) => p.x)).toEqual([0, 1, 2, 3, 4, 5]);
    expect(run.wma).toEqual([null, null, 9, 11, 9, 7]);
  });

  it('reports not-ok for fewer than two points', () => {
    const run = runLineWma([{ x: 0, value: 5 }]);
    expect(run.ok).toBe(false);
    expect(run.samples).toEqual([]);
  });

  it('reports not-ok for empty or null input', () => {
    expect(runLineWma([]).ok).toBe(false);
    expect(runLineWma(null).ok).toBe(false);
  });

  it('produces one sample per series point', () => {
    expect(runLineWma(WMA_DATA, { period: 3 }).samples).toHaveLength(6);
  });

  it('defaults to period 20 and reads no WMA for a short series', () => {
    const run = runLineWma(WMA_DATA);
    expect(run.period).toBe(20);
    expect(run.wma.every((v) => v === null)).toBe(true);
    expect(Number.isNaN(run.wmaFinal)).toBe(true);
  });
});

describe('computeLineWmaLayout', () => {
  const base = {
    data: WMA_DATA,
    period: 3,
    width: 560,
    height: 320,
    padding: 40,
  };

  it('produces an ok layout for a valid series', () => {
    const layout = computeLineWmaLayout(base);
    expect(layout.ok).toBe(true);
    expect(layout.totalPoints).toBe(6);
  });

  it('builds non-empty price and WMA paths', () => {
    const layout = computeLineWmaLayout(base);
    expect(layout.pricePath.startsWith('M')).toBe(true);
    expect(layout.wmaPath.startsWith('M')).toBe(true);
  });

  it('emits a marker only where the WMA is defined', () => {
    const layout = computeLineWmaLayout(base);
    expect(layout.wmaMarkers).toHaveLength(4);
    expect(layout.priceDots).toHaveLength(6);
  });

  it('spans a y domain covering both the price and the WMA', () => {
    const layout = computeLineWmaLayout(base);
    expect(layout.yMin).toBeLessThanOrEqual(6);
    expect(layout.yMax).toBeGreaterThanOrEqual(12);
  });

  it('carries the run statistics onto the layout', () => {
    const layout = computeLineWmaLayout(base);
    expect(layout.wmaFinal).toBe(7);
    expect(layout.aboveCount).toBe(2);
    expect(layout.belowCount).toBe(2);
    expect(layout.period).toBe(3);
  });

  it('keeps the WMA markers inside the panel', () => {
    const layout = computeLineWmaLayout(base);
    for (const m of layout.wmaMarkers) {
      expect(m.py).toBeGreaterThanOrEqual(layout.panel.y);
      expect(m.py).toBeLessThanOrEqual(layout.panel.y + layout.panel.height);
    }
  });

  it('returns a not-ok layout for collapsed dimensions', () => {
    const layout = computeLineWmaLayout({ ...base, width: 10 });
    expect(layout.ok).toBe(false);
    expect(layout.wmaPath).toBe('');
  });

  it('returns a not-ok layout when there is too little data', () => {
    const layout = computeLineWmaLayout({
      ...base,
      data: [{ x: 0, value: 5 }],
    });
    expect(layout.ok).toBe(false);
  });
});

describe('describeLineWmaChart', () => {
  it('summarises the chart with the indicator vocabulary', () => {
    const text = describeLineWmaChart(WMA_DATA, { period: 3 });
    expect(text).toContain('Weighted Moving Average');
    expect(text).toContain('WMA');
    expect(text).toContain('weight');
    expect(text).toContain('recency');
    expect(text).toContain('simple equal-weight moving average');
  });

  it('reports the above and below counts', () => {
    const text = describeLineWmaChart(WMA_DATA, { period: 3 });
    expect(text).toContain('above the WMA on 2');
    expect(text).toContain('below on 2');
  });

  it('returns a no-data message for an insufficient series', () => {
    expect(describeLineWmaChart([])).toBe('No data');
    expect(describeLineWmaChart(null)).toBe('No data');
  });
});

describe('<ChartLineWma />', () => {
  it('renders a labelled region', () => {
    const { container } = render(<ChartLineWma data={WMA_DATA} period={3} />);
    const region = container.querySelector('[role="region"]');
    expect(region).not.toBeNull();
    expect(region!.getAttribute('aria-label')).toBeTruthy();
  });

  it('exposes an accessible description', () => {
    const { container } = render(<ChartLineWma data={WMA_DATA} period={3} />);
    const desc = container.querySelector(
      '[data-section="chart-line-wma-aria-desc"]',
    );
    expect(desc).not.toBeNull();
    expect(desc!.textContent).toContain('Weighted Moving Average');
  });

  it('publishes the run statistics as data attributes', () => {
    const { container } = render(<ChartLineWma data={WMA_DATA} period={3} />);
    const root = container.querySelector('[data-section="chart-line-wma"]');
    expect(root!.getAttribute('data-period')).toBe('3');
    expect(root!.getAttribute('data-wma-final')).toBe('7');
    expect(root!.getAttribute('data-above-count')).toBe('2');
    expect(root!.getAttribute('data-below-count')).toBe('2');
    expect(root!.getAttribute('data-total-points')).toBe('6');
    expect(root!.getAttribute('data-empty')).toBe('false');
  });

  it('renders an svg with the price and WMA lines', () => {
    const { container } = render(<ChartLineWma data={WMA_DATA} period={3} />);
    expect(
      container.querySelector('[data-section="chart-line-wma-svg"]'),
    ).not.toBeNull();
    expect(
      container.querySelector('[data-section="chart-line-wma-price-path"]'),
    ).not.toBeNull();
    expect(
      container.querySelector('[data-section="chart-line-wma-wma-line"]'),
    ).not.toBeNull();
  });

  it('renders one marker per defined WMA value', () => {
    const { container } = render(<ChartLineWma data={WMA_DATA} period={3} />);
    const markers = container.querySelectorAll(
      '[data-section="chart-line-wma-marker"]',
    );
    expect(markers).toHaveLength(4);
  });

  it('renders a two-item legend', () => {
    const { container } = render(<ChartLineWma data={WMA_DATA} period={3} />);
    const items = container.querySelectorAll(
      '[data-section="chart-line-wma-legend-item"]',
    );
    expect(items).toHaveLength(2);
  });

  it('renders the config badge with the period', () => {
    const { container } = render(<ChartLineWma data={WMA_DATA} period={3} />);
    const badge = container.querySelector(
      '[data-section="chart-line-wma-badge-period"]',
    );
    expect(badge!.textContent).toContain('3');
  });

  it('hides the price path when price is in the hidden set', () => {
    const { container } = render(
      <ChartLineWma data={WMA_DATA} period={3} hiddenSeries={['price']} />,
    );
    expect(
      container.querySelector('[data-section="chart-line-wma-price-path"]'),
    ).toBeNull();
  });

  it('hides the WMA line and markers when showWma is false', () => {
    const { container } = render(
      <ChartLineWma data={WMA_DATA} period={3} showWma={false} />,
    );
    expect(
      container.querySelector('[data-section="chart-line-wma-wma-line"]'),
    ).toBeNull();
    expect(
      container.querySelectorAll('[data-section="chart-line-wma-marker"]'),
    ).toHaveLength(0);
  });

  it('hides the WMA line via the hidden set', () => {
    const { container } = render(
      <ChartLineWma data={WMA_DATA} period={3} hiddenSeries={['wma']} />,
    );
    expect(
      container.querySelector('[data-section="chart-line-wma-wma-line"]'),
    ).toBeNull();
  });

  it('reports series toggles through onSeriesToggle', () => {
    const seen: { seriesId: string; hidden: boolean }[] = [];
    const { container } = render(
      <ChartLineWma
        data={WMA_DATA}
        period={3}
        onSeriesToggle={(p) => seen.push(p)}
      />,
    );
    const button = container.querySelector(
      '[data-section="chart-line-wma-legend-item"][data-series-id="wma"]',
    ) as HTMLButtonElement;
    button.click();
    expect(seen).toEqual([{ seriesId: 'wma', hidden: true }]);
  });

  it('renders price dots when showDots is true', () => {
    const { container } = render(
      <ChartLineWma data={WMA_DATA} period={3} showDots />,
    );
    expect(
      container.querySelectorAll('[data-section="chart-line-wma-dot"]'),
    ).toHaveLength(6);
  });

  it('renders the empty state for an insufficient series', () => {
    const { container } = render(<ChartLineWma data={[{ x: 0, value: 5 }]} />);
    const root = container.querySelector('[data-section="chart-line-wma"]');
    expect(root!.getAttribute('data-empty')).toBe('true');
    expect(
      container.querySelector('[data-section="chart-line-wma-svg"]'),
    ).toBeNull();
  });

  it('omits the config badge when showConfigBadge is false', () => {
    const { container } = render(
      <ChartLineWma data={WMA_DATA} period={3} showConfigBadge={false} />,
    );
    expect(
      container.querySelector('[data-section="chart-line-wma-badge"]'),
    ).toBeNull();
  });

  it('forwards a ref to the root element', () => {
    const ref = createRef<HTMLDivElement>();
    render(<ChartLineWma ref={ref} data={WMA_DATA} period={3} />);
    expect(ref.current).not.toBeNull();
    expect(ref.current!.getAttribute('data-section')).toBe('chart-line-wma');
  });

  it('has a stable displayName', () => {
    expect(ChartLineWma.displayName).toBe('ChartLineWma');
  });

  it('toggles the animate attribute', () => {
    const { container } = render(
      <ChartLineWma data={WMA_DATA} period={3} animate={false} />,
    );
    const root = container.querySelector('[data-section="chart-line-wma"]');
    expect(root!.getAttribute('data-animate')).toBe('false');
  });

  it('renders both panel legend swatches with distinct series ids', () => {
    const { container } = render(<ChartLineWma data={WMA_DATA} period={3} />);
    const ids = Array.from(
      container.querySelectorAll('[data-section="chart-line-wma-legend-item"]'),
    ).map((el) => el.getAttribute('data-series-id'));
    expect(ids).toEqual(['price', 'wma']);
  });
});
