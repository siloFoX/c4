import { describe, it, expect, afterEach } from 'vitest';
import { createRef } from 'react';
import { render, cleanup } from '@testing-library/react';
import {
  ChartLineHeikinAshi,
  computeLineHeikinAshi,
  computeLineHeikinAshiLayout,
  getLineHeikinAshiFinitePoints,
  runLineHeikinAshi,
  describeLineHeikinAshiChart,
  type ChartLineHeikinAshiPoint,
} from './chart-line-heikin-ashi';

afterEach(() => cleanup());

// Five OHLC bars chosen so the recursive Heikin-Ashi open lands on
// integers. haClose = (O+H+L+C)/4; haOpen[0] = (O+C)/2; later
// haOpen = (haOpen[prev] + haClose[prev]) / 2:
//   bar 0  haClose (10+20+10+12)/4=13  haOpen (10+12)/2=11   bullish
//   bar 1  haClose (14+22+10+18)/4=16  haOpen (11+13)/2=12   bullish
//   bar 2  haClose (18+26+14+22)/4=20  haOpen (12+16)/2=14   bullish
//   bar 3  haClose (16+18+4+6)/4=11    haOpen (14+20)/2=17   bearish
//   bar 4  haClose (14+16+12+14)/4=14  haOpen (17+11)/2=14   doji
const HA_DATA: ChartLineHeikinAshiPoint[] = [
  { x: 0, open: 10, high: 20, low: 10, close: 12 },
  { x: 1, open: 14, high: 22, low: 10, close: 18 },
  { x: 2, open: 18, high: 26, low: 14, close: 22 },
  { x: 3, open: 16, high: 18, low: 4, close: 6 },
  { x: 4, open: 14, high: 16, low: 12, close: 14 },
];

const HA_BARS = [
  { haOpen: 11, haHigh: 20, haLow: 10, haClose: 13 },
  { haOpen: 12, haHigh: 22, haLow: 10, haClose: 16 },
  { haOpen: 14, haHigh: 26, haLow: 14, haClose: 20 },
  { haOpen: 17, haHigh: 18, haLow: 4, haClose: 11 },
  { haOpen: 14, haHigh: 16, haLow: 12, haClose: 14 },
];

describe('getLineHeikinAshiFinitePoints', () => {
  it('keeps only bars with finite x, open, high, low and close', () => {
    const points = getLineHeikinAshiFinitePoints([
      { x: 0, open: 1, high: 2, low: 1, close: 2 },
      { x: NaN, open: 1, high: 2, low: 1, close: 2 },
      { x: 1, open: 1, high: Infinity, low: 1, close: 2 },
      { x: 2, open: 3, high: 5, low: 2, close: 4 },
    ]);
    expect(points).toHaveLength(2);
    expect(points.map((p) => p.x)).toEqual([0, 2]);
  });

  it('returns an empty array for non-array input', () => {
    expect(getLineHeikinAshiFinitePoints(null)).toEqual([]);
    expect(getLineHeikinAshiFinitePoints(undefined)).toEqual([]);
  });
});

describe('computeLineHeikinAshi', () => {
  it('applies the Heikin-Ashi transform', () => {
    expect(computeLineHeikinAshi(HA_DATA)).toEqual(HA_BARS);
  });

  it('seeds the first Heikin-Ashi open with the raw open-close mean', () => {
    expect(computeLineHeikinAshi(HA_DATA)[0]!.haOpen).toBe((10 + 12) / 2);
  });

  it('takes each Heikin-Ashi close as the open-high-low-close mean', () => {
    expect(computeLineHeikinAshi(HA_DATA)[0]!.haClose).toBe(
      (10 + 20 + 10 + 12) / 4,
    );
  });

  it('carries the Heikin-Ashi open forward recursively', () => {
    const bars = computeLineHeikinAshi(HA_DATA);
    expect(bars[1]!.haOpen).toBe((bars[0]!.haOpen + bars[0]!.haClose) / 2);
  });

  it('takes haHigh and haLow as the max and min of the bar', () => {
    const bar = computeLineHeikinAshi(HA_DATA)[3]!;
    expect(bar.haHigh).toBe(Math.max(18, bar.haOpen, bar.haClose));
    expect(bar.haLow).toBe(Math.min(4, bar.haOpen, bar.haClose));
  });

  it('returns an empty array for non-array input', () => {
    expect(computeLineHeikinAshi(null)).toEqual([]);
  });
});

describe('runLineHeikinAshi', () => {
  it('reports ok for a sufficient series', () => {
    expect(runLineHeikinAshi(HA_DATA).ok).toBe(true);
  });

  it('exposes the Heikin-Ashi bars', () => {
    expect(runLineHeikinAshi(HA_DATA).bars).toEqual(HA_BARS);
  });

  it('exposes the Heikin-Ashi close series', () => {
    expect(runLineHeikinAshi(HA_DATA).haCloseSeries).toEqual([
      13, 16, 20, 11, 14,
    ]);
  });

  it('classifies each sample bullish, bearish or doji', () => {
    const run = runLineHeikinAshi(HA_DATA);
    expect(run.samples[0]!.trend).toBe('bullish');
    expect(run.samples[3]!.trend).toBe('bearish');
    expect(run.samples[4]!.trend).toBe('doji');
  });

  it('counts the bullish, bearish and doji bars', () => {
    const run = runLineHeikinAshi(HA_DATA);
    expect(run.bullishCount).toBe(3);
    expect(run.bearishCount).toBe(1);
    expect(run.dojiCount).toBe(1);
  });

  it('reports the final Heikin-Ashi close', () => {
    expect(runLineHeikinAshi(HA_DATA).haCloseFinal).toBe(14);
  });

  it('reports not-ok for fewer than two bars', () => {
    const run = runLineHeikinAshi([
      { x: 0, open: 1, high: 2, low: 1, close: 2 },
    ]);
    expect(run.ok).toBe(false);
    expect(run.samples).toEqual([]);
  });

  it('reports not-ok for empty or null input', () => {
    expect(runLineHeikinAshi([]).ok).toBe(false);
    expect(runLineHeikinAshi(null).ok).toBe(false);
  });

  it('sorts the series by x before computing', () => {
    const shuffled = [...HA_DATA].reverse();
    const run = runLineHeikinAshi(shuffled);
    expect(run.series.map((p) => p.x)).toEqual([0, 1, 2, 3, 4]);
    expect(run.haCloseSeries).toEqual([13, 16, 20, 11, 14]);
  });

  it('produces one sample per series bar', () => {
    expect(runLineHeikinAshi(HA_DATA).samples).toHaveLength(5);
  });
});

describe('computeLineHeikinAshiLayout', () => {
  const base = {
    data: HA_DATA,
    width: 560,
    height: 320,
    padding: 40,
  };

  it('produces an ok layout for a valid series', () => {
    const layout = computeLineHeikinAshiLayout(base);
    expect(layout.ok).toBe(true);
    expect(layout.totalPoints).toBe(5);
  });

  it('builds non-empty price and Heikin-Ashi paths', () => {
    const layout = computeLineHeikinAshiLayout(base);
    expect(layout.pricePath.startsWith('M')).toBe(true);
    expect(layout.haPath.startsWith('M')).toBe(true);
  });

  it('emits one price dot and one marker per bar', () => {
    const layout = computeLineHeikinAshiLayout(base);
    expect(layout.priceDots).toHaveLength(5);
    expect(layout.haMarkers).toHaveLength(5);
  });

  it('spans a y domain covering the raw close and the HA close', () => {
    const layout = computeLineHeikinAshiLayout(base);
    expect(layout.yMin).toBeLessThanOrEqual(6);
    expect(layout.yMax).toBeGreaterThanOrEqual(22);
  });

  it('carries the run statistics onto the layout', () => {
    const layout = computeLineHeikinAshiLayout(base);
    expect(layout.bullishCount).toBe(3);
    expect(layout.bearishCount).toBe(1);
    expect(layout.haCloseFinal).toBe(14);
  });

  it('tags the markers with their trend', () => {
    const layout = computeLineHeikinAshiLayout(base);
    expect(layout.haMarkers.map((m) => m.trend)).toEqual([
      'bullish',
      'bullish',
      'bullish',
      'bearish',
      'doji',
    ]);
  });

  it('keeps the markers inside the panel', () => {
    const layout = computeLineHeikinAshiLayout(base);
    for (const m of layout.haMarkers) {
      expect(m.py).toBeGreaterThanOrEqual(layout.panel.y);
      expect(m.py).toBeLessThanOrEqual(layout.panel.y + layout.panel.height);
    }
  });

  it('returns a not-ok layout for collapsed dimensions', () => {
    const layout = computeLineHeikinAshiLayout({ ...base, width: 10 });
    expect(layout.ok).toBe(false);
    expect(layout.haPath).toBe('');
  });

  it('returns a not-ok layout when there is too little data', () => {
    const layout = computeLineHeikinAshiLayout({
      ...base,
      data: [{ x: 0, open: 1, high: 2, low: 1, close: 2 }],
    });
    expect(layout.ok).toBe(false);
  });
});

describe('describeLineHeikinAshiChart', () => {
  it('summarises the chart with the indicator vocabulary', () => {
    const text = describeLineHeikinAshiChart(HA_DATA);
    expect(text).toContain('Heikin-Ashi');
    expect(text).toContain('smoothed');
    expect(text).toContain('noise');
    expect(text).toContain('bullish');
    expect(text).toContain('bearish');
  });

  it('reports the bullish, bearish and doji counts', () => {
    const text = describeLineHeikinAshiChart(HA_DATA);
    expect(text).toContain('3 bullish');
    expect(text).toContain('1 bearish');
    expect(text).toContain('1 doji');
  });

  it('returns a no-data message for an insufficient series', () => {
    expect(describeLineHeikinAshiChart([])).toBe('No data');
    expect(describeLineHeikinAshiChart(null)).toBe('No data');
  });
});

describe('<ChartLineHeikinAshi />', () => {
  it('renders a labelled region', () => {
    const { container } = render(<ChartLineHeikinAshi data={HA_DATA} />);
    const region = container.querySelector('[role="region"]');
    expect(region).not.toBeNull();
    expect(region!.getAttribute('aria-label')).toBeTruthy();
  });

  it('exposes an accessible description', () => {
    const { container } = render(<ChartLineHeikinAshi data={HA_DATA} />);
    const desc = container.querySelector(
      '[data-section="chart-line-heikin-ashi-aria-desc"]',
    );
    expect(desc).not.toBeNull();
    expect(desc!.textContent).toContain('Heikin-Ashi');
  });

  it('publishes the run statistics as data attributes', () => {
    const { container } = render(<ChartLineHeikinAshi data={HA_DATA} />);
    const root = container.querySelector(
      '[data-section="chart-line-heikin-ashi"]',
    );
    expect(root!.getAttribute('data-bullish-count')).toBe('3');
    expect(root!.getAttribute('data-bearish-count')).toBe('1');
    expect(root!.getAttribute('data-doji-count')).toBe('1');
    expect(root!.getAttribute('data-ha-close-final')).toBe('14');
    expect(root!.getAttribute('data-total-points')).toBe('5');
    expect(root!.getAttribute('data-empty')).toBe('false');
  });

  it('renders an svg with the raw close and Heikin-Ashi lines', () => {
    const { container } = render(<ChartLineHeikinAshi data={HA_DATA} />);
    expect(
      container.querySelector('[data-section="chart-line-heikin-ashi-svg"]'),
    ).not.toBeNull();
    expect(
      container.querySelector(
        '[data-section="chart-line-heikin-ashi-price-path"]',
      ),
    ).not.toBeNull();
    expect(
      container.querySelector('[data-section="chart-line-heikin-ashi-ha-line"]'),
    ).not.toBeNull();
  });

  it('renders one marker per bar', () => {
    const { container } = render(<ChartLineHeikinAshi data={HA_DATA} />);
    expect(
      container.querySelectorAll(
        '[data-section="chart-line-heikin-ashi-marker"]',
      ),
    ).toHaveLength(5);
  });

  it('tags the markers with their trend', () => {
    const { container } = render(<ChartLineHeikinAshi data={HA_DATA} />);
    expect(
      container.querySelectorAll(
        '[data-section="chart-line-heikin-ashi-marker"][data-trend="bullish"]',
      ),
    ).toHaveLength(3);
    expect(
      container.querySelectorAll(
        '[data-section="chart-line-heikin-ashi-marker"][data-trend="bearish"]',
      ),
    ).toHaveLength(1);
    expect(
      container.querySelectorAll(
        '[data-section="chart-line-heikin-ashi-marker"][data-trend="doji"]',
      ),
    ).toHaveLength(1);
  });

  it('renders a two-item legend', () => {
    const { container } = render(<ChartLineHeikinAshi data={HA_DATA} />);
    expect(
      container.querySelectorAll(
        '[data-section="chart-line-heikin-ashi-legend-item"]',
      ),
    ).toHaveLength(2);
  });

  it('renders the config badge with the latest trend', () => {
    const { container } = render(<ChartLineHeikinAshi data={HA_DATA} />);
    const badge = container.querySelector(
      '[data-section="chart-line-heikin-ashi-badge-trend"]',
    );
    expect(badge!.textContent).toContain('doji');
  });

  it('hides the raw close path when close is in the hidden set', () => {
    const { container } = render(
      <ChartLineHeikinAshi data={HA_DATA} hiddenSeries={['close']} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-heikin-ashi-price-path"]',
      ),
    ).toBeNull();
  });

  it('hides the Heikin-Ashi line and markers when showHa is false', () => {
    const { container } = render(
      <ChartLineHeikinAshi data={HA_DATA} showHa={false} />,
    );
    expect(
      container.querySelector('[data-section="chart-line-heikin-ashi-ha-line"]'),
    ).toBeNull();
    expect(
      container.querySelectorAll(
        '[data-section="chart-line-heikin-ashi-marker"]',
      ),
    ).toHaveLength(0);
  });

  it('hides the Heikin-Ashi line via the hidden set', () => {
    const { container } = render(
      <ChartLineHeikinAshi data={HA_DATA} hiddenSeries={['ha']} />,
    );
    expect(
      container.querySelector('[data-section="chart-line-heikin-ashi-ha-line"]'),
    ).toBeNull();
  });

  it('reports series toggles through onSeriesToggle', () => {
    const seen: { seriesId: string; hidden: boolean }[] = [];
    const { container } = render(
      <ChartLineHeikinAshi
        data={HA_DATA}
        onSeriesToggle={(p) => seen.push(p)}
      />,
    );
    const button = container.querySelector(
      '[data-section="chart-line-heikin-ashi-legend-item"][data-series-id="ha"]',
    ) as HTMLButtonElement;
    button.click();
    expect(seen).toEqual([{ seriesId: 'ha', hidden: true }]);
  });

  it('renders price dots when showDots is true', () => {
    const { container } = render(
      <ChartLineHeikinAshi data={HA_DATA} showDots />,
    );
    expect(
      container.querySelectorAll('[data-section="chart-line-heikin-ashi-dot"]'),
    ).toHaveLength(5);
  });

  it('renders the empty state for an insufficient series', () => {
    const { container } = render(
      <ChartLineHeikinAshi data={[{ x: 0, open: 1, high: 2, low: 1, close: 2 }]} />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-heikin-ashi"]',
    );
    expect(root!.getAttribute('data-empty')).toBe('true');
    expect(
      container.querySelector('[data-section="chart-line-heikin-ashi-svg"]'),
    ).toBeNull();
  });

  it('omits the config badge when showConfigBadge is false', () => {
    const { container } = render(
      <ChartLineHeikinAshi data={HA_DATA} showConfigBadge={false} />,
    );
    expect(
      container.querySelector('[data-section="chart-line-heikin-ashi-badge"]'),
    ).toBeNull();
  });

  it('forwards a ref to the root element', () => {
    const ref = createRef<HTMLDivElement>();
    render(<ChartLineHeikinAshi ref={ref} data={HA_DATA} />);
    expect(ref.current).not.toBeNull();
    expect(ref.current!.getAttribute('data-section')).toBe(
      'chart-line-heikin-ashi',
    );
  });

  it('has a stable displayName', () => {
    expect(ChartLineHeikinAshi.displayName).toBe('ChartLineHeikinAshi');
  });

  it('toggles the animate attribute', () => {
    const { container } = render(
      <ChartLineHeikinAshi data={HA_DATA} animate={false} />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-heikin-ashi"]',
    );
    expect(root!.getAttribute('data-animate')).toBe('false');
  });
});
