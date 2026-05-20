import { describe, it, expect, afterEach } from 'vitest';
import { createRef } from 'react';
import { render, cleanup } from '@testing-library/react';
import {
  ChartLineVwma,
  computeLineVwma,
  computeLineVwmaLayout,
  getLineVwmaFinitePoints,
  normalizeLineVwmaPeriod,
  runLineVwma,
  describeLineVwmaChart,
  type ChartLineVwmaPoint,
} from './chart-line-vwma';

afterEach(() => cleanup());

// The VWMA weights each price by its bar volume:
//   VWMA = sum(price * volume) / sum(volume) over the window.
// The fixture is hand-tuned (period 2) so every window divides
// cleanly: e.g. (10*1 + 20*3) / 4 = 17.5 -- pulled toward 20 by
// its higher volume, NOT the simple average 15.
const VWMA_DATA: ChartLineVwmaPoint[] = [
  { x: 0, value: 10, volume: 1 },
  { x: 1, value: 20, volume: 3 },
  { x: 2, value: 40, volume: 1 },
  { x: 3, value: 10, volume: 2 },
  { x: 4, value: 16, volume: 2 },
  { x: 5, value: 4, volume: 2 },
  { x: 6, value: 34, volume: 1 },
  { x: 7, value: 7, volume: 2 },
];

const EXPECTED_VWMA = [null, 17.5, 25, 20, 13, 10, 14, 16];

describe('getLineVwmaFinitePoints', () => {
  it('keeps only points with finite x, value and non-negative volume', () => {
    const points = getLineVwmaFinitePoints([
      { x: 0, value: 5, volume: 10 },
      { x: NaN, value: 5, volume: 10 },
      { x: 1, value: Infinity, volume: 10 },
      { x: 2, value: 9, volume: NaN },
      { x: 3, value: 9, volume: -5 },
      { x: 4, value: 7, volume: 0 },
    ]);
    expect(points).toHaveLength(2);
    expect(points.map((p) => p.x)).toEqual([0, 4]);
  });

  it('returns an empty array for non-array input', () => {
    expect(getLineVwmaFinitePoints(null)).toEqual([]);
    expect(getLineVwmaFinitePoints(undefined)).toEqual([]);
  });
});

describe('normalizeLineVwmaPeriod', () => {
  it('floors a fractional period', () => {
    expect(normalizeLineVwmaPeriod(20.9, 20)).toBe(20);
  });

  it('falls back for a sub-1, NaN or negative period', () => {
    expect(normalizeLineVwmaPeriod(0, 20)).toBe(20);
    expect(normalizeLineVwmaPeriod(NaN, 20)).toBe(20);
    expect(normalizeLineVwmaPeriod(-5, 20)).toBe(20);
  });
});

describe('computeLineVwma', () => {
  it('computes the volume-weighted average over each window', () => {
    const values = VWMA_DATA.map((p) => p.value);
    const volumes = VWMA_DATA.map((p) => p.volume);
    expect(computeLineVwma(values, volumes, 2)).toEqual(EXPECTED_VWMA);
  });

  it('reduces to a simple average when volumes are equal', () => {
    expect(computeLineVwma([10, 20, 30, 40], [5, 5, 5, 5], 2)).toEqual([
      null,
      15,
      25,
      35,
    ]);
  });

  it('is null when the window has zero total volume', () => {
    expect(computeLineVwma([10, 20], [0, 0], 2)).toEqual([null, null]);
  });

  it('is null before the window is full', () => {
    const vwma = computeLineVwma([10, 20, 40], [1, 1, 1], 3);
    expect(vwma[0]).toBeNull();
    expect(vwma[1]).toBeNull();
    expect(typeof vwma[2]).toBe('number');
  });

  it('returns an all-null array for a series shorter than the period', () => {
    expect(computeLineVwma([10, 20], [1, 1], 5)).toEqual([null, null]);
  });

  it('returns an empty array for non-array input', () => {
    expect(computeLineVwma(null, [1, 1], 2)).toEqual([]);
    expect(computeLineVwma([1, 1], null, 2)).toEqual([]);
  });
});

describe('runLineVwma', () => {
  it('reports ok for a sufficient series', () => {
    expect(runLineVwma(VWMA_DATA, { period: 2 }).ok).toBe(true);
  });

  it('carries the period onto the run', () => {
    expect(runLineVwma(VWMA_DATA, { period: 2 }).period).toBe(2);
  });

  it('exposes the vwma series', () => {
    expect(runLineVwma(VWMA_DATA, { period: 2 }).vwma).toHaveLength(8);
  });

  it('computes the exact volume-weighted moving average', () => {
    expect(runLineVwma(VWMA_DATA, { period: 2 }).vwma).toEqual(EXPECTED_VWMA);
  });

  it('leaves the vwma null until the window is full', () => {
    const run = runLineVwma(VWMA_DATA, { period: 2 });
    expect(run.samples[0]!.vwma).toBeNull();
    expect(typeof run.samples[1]!.vwma).toBe('number');
  });

  it('exposes the bar volume on each sample', () => {
    const run = runLineVwma(VWMA_DATA, { period: 2 });
    expect(run.samples.map((s) => s.volume)).toEqual([
      1, 3, 1, 2, 2, 2, 1, 2,
    ]);
  });

  it('classifies each sample by the price position vs the vwma', () => {
    const run = runLineVwma(VWMA_DATA, { period: 2 });
    expect(run.samples.map((s) => s.position)).toEqual([
      'on',
      'above',
      'above',
      'below',
      'above',
      'below',
      'above',
      'below',
    ]);
  });

  it('counts the above and below bars consistently', () => {
    const run = runLineVwma(VWMA_DATA, { period: 2 });
    expect(run.aboveCount).toBe(4);
    expect(run.belowCount).toBe(3);
    expect(run.aboveCount).toBe(
      run.samples.filter((s) => s.position === 'above').length,
    );
    expect(run.belowCount).toBe(
      run.samples.filter((s) => s.position === 'below').length,
    );
  });

  it('reports the final vwma reading', () => {
    expect(runLineVwma(VWMA_DATA, { period: 2 }).vwmaFinal).toBe(16);
  });

  it('reports the min and max vwma readings', () => {
    const run = runLineVwma(VWMA_DATA, { period: 2 });
    expect(run.vwmaMin).toBe(10);
    expect(run.vwmaMax).toBe(25);
  });

  it('reports not-ok for fewer than two points', () => {
    const run = runLineVwma([{ x: 0, value: 5, volume: 1 }], { period: 2 });
    expect(run.ok).toBe(false);
    expect(run.samples).toEqual([]);
  });

  it('reports not-ok for empty or null input', () => {
    expect(runLineVwma([], { period: 2 }).ok).toBe(false);
    expect(runLineVwma(null, { period: 2 }).ok).toBe(false);
  });

  it('sorts the series by x before computing', () => {
    const shuffled = [...VWMA_DATA].reverse();
    const run = runLineVwma(shuffled, { period: 2 });
    expect(run.series.map((p) => p.x)).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
  });

  it('produces one sample per series point', () => {
    expect(runLineVwma(VWMA_DATA, { period: 2 }).samples).toHaveLength(8);
  });

  it('defaults to a period of 20', () => {
    expect(runLineVwma(VWMA_DATA).period).toBe(20);
  });
});

describe('computeLineVwmaLayout', () => {
  const base = {
    data: VWMA_DATA,
    period: 2,
    width: 560,
    height: 320,
    padding: 40,
  };

  it('produces an ok layout for a valid series', () => {
    const layout = computeLineVwmaLayout(base);
    expect(layout.ok).toBe(true);
    expect(layout.totalPoints).toBe(8);
  });

  it('fills the inner area with a single panel', () => {
    const layout = computeLineVwmaLayout(base);
    expect(layout.panel.width).toBeGreaterThan(0);
    expect(layout.panel.height).toBeGreaterThan(0);
  });

  it('builds non-empty price and vwma paths', () => {
    const layout = computeLineVwmaLayout(base);
    expect(layout.pricePath.startsWith('M')).toBe(true);
    expect(layout.vwmaPath.startsWith('M')).toBe(true);
  });

  it('emits one price dot per bar and one marker per defined vwma', () => {
    const layout = computeLineVwmaLayout(base);
    expect(layout.priceDots).toHaveLength(8);
    expect(layout.vwmaMarkers).toHaveLength(7);
  });

  it('builds a y-domain covering the price and the vwma', () => {
    const layout = computeLineVwmaLayout(base);
    expect(layout.yMin).toBe(4);
    expect(layout.yMax).toBe(40);
  });

  it('keeps the vwma markers inside the panel', () => {
    const layout = computeLineVwmaLayout(base);
    for (const m of layout.vwmaMarkers) {
      expect(m.py).toBeGreaterThanOrEqual(layout.panel.y);
      expect(m.py).toBeLessThanOrEqual(layout.panel.y + layout.panel.height);
    }
  });

  it('carries the run statistics onto the layout', () => {
    const layout = computeLineVwmaLayout(base);
    expect(layout.period).toBe(2);
    expect(layout.vwmaFinal).toBe(16);
    expect(layout.totalPoints).toBe(8);
  });

  it('returns a not-ok layout for collapsed dimensions', () => {
    const layout = computeLineVwmaLayout({ ...base, width: 10 });
    expect(layout.ok).toBe(false);
    expect(layout.vwmaPath).toBe('');
  });

  it('returns a not-ok layout when there is too little data', () => {
    const layout = computeLineVwmaLayout({
      ...base,
      data: [{ x: 0, value: 5, volume: 1 }],
    });
    expect(layout.ok).toBe(false);
  });
});

describe('describeLineVwmaChart', () => {
  it('summarises the chart with the indicator vocabulary', () => {
    const text = describeLineVwmaChart(VWMA_DATA, { period: 2 });
    expect(text).toContain('Volume Weighted Moving Average');
    expect(text).toContain('volume');
    expect(text).toContain('weighted');
  });

  it('reports the above and below counts', () => {
    const run = runLineVwma(VWMA_DATA, { period: 2 });
    const text = describeLineVwmaChart(VWMA_DATA, { period: 2 });
    expect(text).toContain(`above the VWMA on ${run.aboveCount}`);
    expect(text).toContain(`below on ${run.belowCount}`);
  });

  it('returns a no-data message for an insufficient series', () => {
    expect(describeLineVwmaChart([])).toBe('No data');
    expect(describeLineVwmaChart(null)).toBe('No data');
  });
});

describe('<ChartLineVwma />', () => {
  it('renders a labelled region', () => {
    const { container } = render(
      <ChartLineVwma data={VWMA_DATA} period={2} />,
    );
    const region = container.querySelector('[role="region"]');
    expect(region).not.toBeNull();
    expect(region!.getAttribute('aria-label')).toBeTruthy();
  });

  it('exposes an accessible description', () => {
    const { container } = render(
      <ChartLineVwma data={VWMA_DATA} period={2} />,
    );
    const desc = container.querySelector(
      '[data-section="chart-line-vwma-aria-desc"]',
    );
    expect(desc).not.toBeNull();
    expect(desc!.textContent).toContain('Volume Weighted Moving Average');
  });

  it('publishes the run statistics as data attributes', () => {
    const { container } = render(
      <ChartLineVwma data={VWMA_DATA} period={2} />,
    );
    const root = container.querySelector('[data-section="chart-line-vwma"]');
    expect(root!.getAttribute('data-period')).toBe('2');
    expect(root!.getAttribute('data-above-count')).toBe('4');
    expect(root!.getAttribute('data-below-count')).toBe('3');
    expect(root!.getAttribute('data-total-points')).toBe('8');
    expect(root!.getAttribute('data-empty')).toBe('false');
  });

  it('renders an svg with the price and vwma lines', () => {
    const { container } = render(
      <ChartLineVwma data={VWMA_DATA} period={2} />,
    );
    expect(
      container.querySelector('[data-section="chart-line-vwma-svg"]'),
    ).not.toBeNull();
    expect(
      container.querySelector('[data-section="chart-line-vwma-price-path"]'),
    ).not.toBeNull();
    expect(
      container.querySelector('[data-section="chart-line-vwma-vwma-line"]'),
    ).not.toBeNull();
  });

  it('renders one vwma marker per defined value', () => {
    const { container } = render(
      <ChartLineVwma data={VWMA_DATA} period={2} />,
    );
    expect(
      container.querySelectorAll('[data-section="chart-line-vwma-marker"]'),
    ).toHaveLength(7);
  });

  it('renders the config badge with the period', () => {
    const { container } = render(
      <ChartLineVwma data={VWMA_DATA} period={2} />,
    );
    const badge = container.querySelector(
      '[data-section="chart-line-vwma-badge-config"]',
    );
    expect(badge!.textContent).toContain('2');
  });

  it('renders a two-item legend', () => {
    const { container } = render(
      <ChartLineVwma data={VWMA_DATA} period={2} />,
    );
    expect(
      container.querySelectorAll('[data-section="chart-line-vwma-legend-item"]'),
    ).toHaveLength(2);
  });

  it('hides the price path when price is in the hidden set', () => {
    const { container } = render(
      <ChartLineVwma data={VWMA_DATA} period={2} hiddenSeries={['price']} />,
    );
    expect(
      container.querySelector('[data-section="chart-line-vwma-price-path"]'),
    ).toBeNull();
  });

  it('hides the vwma line and markers when showVwma is false', () => {
    const { container } = render(
      <ChartLineVwma data={VWMA_DATA} period={2} showVwma={false} />,
    );
    expect(
      container.querySelector('[data-section="chart-line-vwma-vwma-line"]'),
    ).toBeNull();
    expect(
      container.querySelectorAll('[data-section="chart-line-vwma-marker"]'),
    ).toHaveLength(0);
  });

  it('hides the vwma line via the hidden set', () => {
    const { container } = render(
      <ChartLineVwma data={VWMA_DATA} period={2} hiddenSeries={['vwma']} />,
    );
    expect(
      container.querySelector('[data-section="chart-line-vwma-vwma-line"]'),
    ).toBeNull();
  });

  it('reports series toggles through onSeriesToggle', () => {
    const seen: { seriesId: string; hidden: boolean }[] = [];
    const { container } = render(
      <ChartLineVwma
        data={VWMA_DATA}
        period={2}
        onSeriesToggle={(p) => seen.push(p)}
      />,
    );
    const button = container.querySelector(
      '[data-section="chart-line-vwma-legend-item"][data-series-id="vwma"]',
    ) as HTMLButtonElement;
    button.click();
    expect(seen).toEqual([{ seriesId: 'vwma', hidden: true }]);
  });

  it('renders price dots when showDots is true', () => {
    const { container } = render(
      <ChartLineVwma data={VWMA_DATA} period={2} showDots />,
    );
    expect(
      container.querySelectorAll('[data-section="chart-line-vwma-dot"]'),
    ).toHaveLength(8);
  });

  it('renders the empty state for an insufficient series', () => {
    const { container } = render(
      <ChartLineVwma data={[{ x: 0, value: 5, volume: 1 }]} />,
    );
    const root = container.querySelector('[data-section="chart-line-vwma"]');
    expect(root!.getAttribute('data-empty')).toBe('true');
    expect(
      container.querySelector('[data-section="chart-line-vwma-svg"]'),
    ).toBeNull();
  });

  it('omits the config badge when showConfigBadge is false', () => {
    const { container } = render(
      <ChartLineVwma data={VWMA_DATA} period={2} showConfigBadge={false} />,
    );
    expect(
      container.querySelector('[data-section="chart-line-vwma-badge"]'),
    ).toBeNull();
  });

  it('forwards a ref to the root element', () => {
    const ref = createRef<HTMLDivElement>();
    render(<ChartLineVwma ref={ref} data={VWMA_DATA} />);
    expect(ref.current).not.toBeNull();
    expect(ref.current!.getAttribute('data-section')).toBe('chart-line-vwma');
  });

  it('has a stable displayName', () => {
    expect(ChartLineVwma.displayName).toBe('ChartLineVwma');
  });

  it('toggles the animate attribute', () => {
    const { container } = render(
      <ChartLineVwma data={VWMA_DATA} animate={false} />,
    );
    const root = container.querySelector('[data-section="chart-line-vwma"]');
    expect(root!.getAttribute('data-animate')).toBe('false');
  });
});
