import { describe, it, expect, afterEach } from 'vitest';
import { createRef } from 'react';
import { render, cleanup } from '@testing-library/react';
import {
  ChartLineJma,
  computeLineJma,
  computeLineJmaLayout,
  getLineJmaFinitePoints,
  normalizeLineJmaLength,
  normalizeLineJmaPhase,
  runLineJma,
  describeLineJmaChart,
  type ChartLineJmaPoint,
} from './chart-line-jma';

afterEach(() => cleanup());

// A steady linear ramp. The JMA is seeded at the first bar with the
// price and then lags slightly below the rising ramp, so the price
// runs above the JMA on every bar after the first.
const RAMP = [10, 12, 14, 16, 18, 20, 22, 24];
const JMA_DATA: ChartLineJmaPoint[] = RAMP.map((value, i) => ({
  x: i,
  value,
}));

describe('getLineJmaFinitePoints', () => {
  it('keeps only points with finite x and value', () => {
    const points = getLineJmaFinitePoints([
      { x: 0, value: 5 },
      { x: NaN, value: 5 },
      { x: 1, value: Infinity },
      { x: 2, value: 9 },
    ]);
    expect(points).toHaveLength(2);
    expect(points.map((p) => p.x)).toEqual([0, 2]);
  });

  it('returns an empty array for non-array input', () => {
    expect(getLineJmaFinitePoints(null)).toEqual([]);
    expect(getLineJmaFinitePoints(undefined)).toEqual([]);
  });
});

describe('normalizeLineJmaLength', () => {
  it('floors a fractional length', () => {
    expect(normalizeLineJmaLength(7.8, 7)).toBe(7);
  });

  it('falls back for a sub-1, NaN or negative length', () => {
    expect(normalizeLineJmaLength(0, 7)).toBe(7);
    expect(normalizeLineJmaLength(NaN, 7)).toBe(7);
    expect(normalizeLineJmaLength(-3, 7)).toBe(7);
  });
});

describe('normalizeLineJmaPhase', () => {
  it('keeps an in-range phase unchanged', () => {
    expect(normalizeLineJmaPhase(40, 0)).toBe(40);
  });

  it('clamps a phase outside -100 to 100', () => {
    expect(normalizeLineJmaPhase(-250, 0)).toBe(-100);
    expect(normalizeLineJmaPhase(250, 0)).toBe(100);
  });

  it('falls back for a non-finite phase', () => {
    expect(normalizeLineJmaPhase(NaN, 0)).toBe(0);
  });
});

describe('computeLineJma', () => {
  const values = JMA_DATA.map((p) => p.value);

  it('seeds the first bar with that bar value', () => {
    expect(computeLineJma([42, 50, 60], 2, 0)[0]).toBe(42);
  });

  it('holds a flat series exactly at its constant', () => {
    expect(computeLineJma([7, 7, 7, 7], 2, 0)).toEqual([7, 7, 7, 7]);
  });

  it('reproduces the series for a length of one', () => {
    expect(computeLineJma([3, 9, 5, 8], 1, 0)).toEqual([3, 9, 5, 8]);
  });

  it('matches the hand-verified filter on a step input', () => {
    // length 2, phase 0: beta = 9/49, alpha = beta^2; the recursion
    // gives jma[1] = 638029696000 / 678223072849.
    const jma = computeLineJma([0, 1], 2, 0);
    expect(jma[0]).toBe(0);
    expect(jma[1]).toBeCloseTo(0.94074, 4);
  });

  it('produces a value for every bar with no warm-up', () => {
    const jma = computeLineJma(values, 2, 0);
    expect(jma).toHaveLength(8);
    expect(jma.every((v) => Number.isFinite(v))).toBe(true);
  });

  it('lags just below a rising ramp', () => {
    const jma = computeLineJma(values, 2, 0);
    expect(jma[0]).toBe(10);
    for (let i = 1; i < values.length; i += 1) {
      expect(jma[i]!).toBeLessThan(values[i]!);
    }
  });

  it('responds differently to a different phase', () => {
    const a = computeLineJma([0, 10, 4, 9], 4, 0);
    const b = computeLineJma([0, 10, 4, 9], 4, 100);
    expect(a[1]).not.toBe(b[1]);
  });

  it('returns an empty array for non-array or empty input', () => {
    expect(computeLineJma(null, 2, 0)).toEqual([]);
    expect(computeLineJma([], 2, 0)).toEqual([]);
  });
});

describe('runLineJma', () => {
  it('reports ok for a sufficient series', () => {
    expect(runLineJma(JMA_DATA, { length: 2, phase: 0 }).ok).toBe(true);
  });

  it('carries the length and phase onto the run', () => {
    const run = runLineJma(JMA_DATA, { length: 2, phase: 0 });
    expect(run.length).toBe(2);
    expect(run.phase).toBe(0);
  });

  it('exposes the JMA series', () => {
    const run = runLineJma(JMA_DATA, { length: 2, phase: 0 });
    expect(run.jma).toHaveLength(8);
    expect(run.jma[0]).toBe(10);
  });

  it('reports the final, min and max JMA readings', () => {
    const run = runLineJma(JMA_DATA, { length: 2, phase: 0 });
    expect(run.jmaFinal).toBe(run.jma[7]);
    expect(run.jmaMin).toBe(10);
    expect(run.jmaMax).toBe(run.jma[7]);
  });

  it('classifies each sample by price position versus the JMA', () => {
    const run = runLineJma(JMA_DATA, { length: 2, phase: 0 });
    expect(run.samples[0]!.position).toBe('on');
    expect(run.samples[1]!.position).toBe('above');
  });

  it('counts bars above and below the JMA', () => {
    const run = runLineJma(JMA_DATA, { length: 2, phase: 0 });
    expect(run.aboveCount).toBe(7);
    expect(run.belowCount).toBe(0);
  });

  it('produces one sample per series point', () => {
    expect(runLineJma(JMA_DATA, { length: 2, phase: 0 }).samples).toHaveLength(
      8,
    );
  });

  it('sorts the series by x before computing', () => {
    const shuffled = [...JMA_DATA].reverse();
    const run = runLineJma(shuffled, { length: 2, phase: 0 });
    expect(run.series.map((p) => p.x)).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
    expect(run.jma[0]).toBe(10);
  });

  it('reports not-ok for fewer than two points', () => {
    const run = runLineJma([{ x: 0, value: 5 }]);
    expect(run.ok).toBe(false);
    expect(run.samples).toEqual([]);
  });

  it('reports not-ok for empty or null input', () => {
    expect(runLineJma([]).ok).toBe(false);
    expect(runLineJma(null).ok).toBe(false);
  });

  it('defaults to length 7 and phase 0', () => {
    const run = runLineJma(JMA_DATA);
    expect(run.length).toBe(7);
    expect(run.phase).toBe(0);
  });

  it('holds a flat series on the JMA with every sample on', () => {
    const flat: ChartLineJmaPoint[] = [5, 5, 5, 5].map((value, i) => ({
      x: i,
      value,
    }));
    const run = runLineJma(flat, { length: 2, phase: 0 });
    expect(run.aboveCount).toBe(0);
    expect(run.belowCount).toBe(0);
  });
});

describe('computeLineJmaLayout', () => {
  const base = {
    data: JMA_DATA,
    length: 2,
    phase: 0,
    width: 560,
    height: 320,
    padding: 40,
  };

  it('produces an ok layout for a valid series', () => {
    const layout = computeLineJmaLayout(base);
    expect(layout.ok).toBe(true);
    expect(layout.totalPoints).toBe(8);
  });

  it('builds non-empty price and JMA paths', () => {
    const layout = computeLineJmaLayout(base);
    expect(layout.pricePath.startsWith('M')).toBe(true);
    expect(layout.jmaPath.startsWith('M')).toBe(true);
  });

  it('emits a JMA marker for every bar since there is no warm-up', () => {
    const layout = computeLineJmaLayout(base);
    expect(layout.jmaMarkers).toHaveLength(8);
    expect(layout.priceDots).toHaveLength(8);
  });

  it('spans a y domain covering both the price and the JMA', () => {
    const layout = computeLineJmaLayout(base);
    expect(layout.yMin).toBeLessThanOrEqual(10);
    expect(layout.yMax).toBeGreaterThanOrEqual(24);
  });

  it('carries the run statistics onto the layout', () => {
    const layout = computeLineJmaLayout(base);
    expect(layout.length).toBe(2);
    expect(layout.phase).toBe(0);
    expect(layout.aboveCount).toBe(7);
  });

  it('keeps the JMA markers inside the panel', () => {
    const layout = computeLineJmaLayout(base);
    for (const m of layout.jmaMarkers) {
      expect(m.py).toBeGreaterThanOrEqual(layout.panel.y);
      expect(m.py).toBeLessThanOrEqual(layout.panel.y + layout.panel.height);
    }
  });

  it('returns a not-ok layout for collapsed dimensions', () => {
    const layout = computeLineJmaLayout({ ...base, width: 10 });
    expect(layout.ok).toBe(false);
    expect(layout.jmaPath).toBe('');
  });

  it('returns a not-ok layout when there is too little data', () => {
    const layout = computeLineJmaLayout({
      ...base,
      data: [{ x: 0, value: 5 }],
    });
    expect(layout.ok).toBe(false);
  });
});

describe('describeLineJmaChart', () => {
  it('summarises the chart with the indicator vocabulary', () => {
    const text = describeLineJmaChart(JMA_DATA, { length: 2, phase: 0 });
    expect(text).toContain('Jurik-style Moving Average');
    expect(text).toContain('JMA');
    expect(text).toContain('low-lag');
    expect(text).toContain('low-noise');
    expect(text).toContain('phase');
  });

  it('reports the above and below counts', () => {
    const text = describeLineJmaChart(JMA_DATA, { length: 2, phase: 0 });
    expect(text).toContain('above the JMA on 7');
    expect(text).toContain('below on 0');
  });

  it('returns a no-data message for an insufficient series', () => {
    expect(describeLineJmaChart([])).toBe('No data');
    expect(describeLineJmaChart(null)).toBe('No data');
  });
});

describe('<ChartLineJma />', () => {
  it('renders a labelled region', () => {
    const { container } = render(
      <ChartLineJma data={JMA_DATA} length={2} phase={0} />,
    );
    const region = container.querySelector('[role="region"]');
    expect(region).not.toBeNull();
    expect(region!.getAttribute('aria-label')).toBeTruthy();
  });

  it('exposes an accessible description', () => {
    const { container } = render(
      <ChartLineJma data={JMA_DATA} length={2} phase={0} />,
    );
    const desc = container.querySelector(
      '[data-section="chart-line-jma-aria-desc"]',
    );
    expect(desc).not.toBeNull();
    expect(desc!.textContent).toContain('Jurik-style Moving Average');
  });

  it('publishes the run statistics as data attributes', () => {
    const { container } = render(
      <ChartLineJma data={JMA_DATA} length={2} phase={0} />,
    );
    const root = container.querySelector('[data-section="chart-line-jma"]');
    expect(root!.getAttribute('data-length')).toBe('2');
    expect(root!.getAttribute('data-phase')).toBe('0');
    expect(root!.getAttribute('data-above-count')).toBe('7');
    expect(root!.getAttribute('data-below-count')).toBe('0');
    expect(root!.getAttribute('data-total-points')).toBe('8');
    expect(root!.getAttribute('data-empty')).toBe('false');
    expect(Number.isFinite(Number(root!.getAttribute('data-jma-final')))).toBe(
      true,
    );
  });

  it('renders an svg with the price and JMA lines', () => {
    const { container } = render(
      <ChartLineJma data={JMA_DATA} length={2} phase={0} />,
    );
    expect(
      container.querySelector('[data-section="chart-line-jma-svg"]'),
    ).not.toBeNull();
    expect(
      container.querySelector('[data-section="chart-line-jma-price-path"]'),
    ).not.toBeNull();
    expect(
      container.querySelector('[data-section="chart-line-jma-jma-line"]'),
    ).not.toBeNull();
  });

  it('renders a JMA marker for every bar', () => {
    const { container } = render(
      <ChartLineJma data={JMA_DATA} length={2} phase={0} />,
    );
    const markers = container.querySelectorAll(
      '[data-section="chart-line-jma-marker"]',
    );
    expect(markers).toHaveLength(8);
  });

  it('renders a two-item legend', () => {
    const { container } = render(
      <ChartLineJma data={JMA_DATA} length={2} phase={0} />,
    );
    const items = container.querySelectorAll(
      '[data-section="chart-line-jma-legend-item"]',
    );
    expect(items).toHaveLength(2);
  });

  it('renders the config badge with the length and phase', () => {
    const { container } = render(
      <ChartLineJma data={JMA_DATA} length={2} phase={0} />,
    );
    const len = container.querySelector(
      '[data-section="chart-line-jma-badge-length"]',
    );
    const ph = container.querySelector(
      '[data-section="chart-line-jma-badge-phase"]',
    );
    expect(len!.textContent).toContain('2');
    expect(ph!.textContent).toContain('0');
  });

  it('hides the price path when price is in the hidden set', () => {
    const { container } = render(
      <ChartLineJma
        data={JMA_DATA}
        length={2}
        phase={0}
        hiddenSeries={['price']}
      />,
    );
    expect(
      container.querySelector('[data-section="chart-line-jma-price-path"]'),
    ).toBeNull();
  });

  it('hides the JMA line and markers when showJma is false', () => {
    const { container } = render(
      <ChartLineJma data={JMA_DATA} length={2} phase={0} showJma={false} />,
    );
    expect(
      container.querySelector('[data-section="chart-line-jma-jma-line"]'),
    ).toBeNull();
    expect(
      container.querySelectorAll('[data-section="chart-line-jma-marker"]'),
    ).toHaveLength(0);
  });

  it('hides the JMA line via the hidden set', () => {
    const { container } = render(
      <ChartLineJma
        data={JMA_DATA}
        length={2}
        phase={0}
        hiddenSeries={['jma']}
      />,
    );
    expect(
      container.querySelector('[data-section="chart-line-jma-jma-line"]'),
    ).toBeNull();
  });

  it('reports series toggles through onSeriesToggle', () => {
    const seen: { seriesId: string; hidden: boolean }[] = [];
    const { container } = render(
      <ChartLineJma
        data={JMA_DATA}
        length={2}
        phase={0}
        onSeriesToggle={(p) => seen.push(p)}
      />,
    );
    const button = container.querySelector(
      '[data-section="chart-line-jma-legend-item"][data-series-id="jma"]',
    ) as HTMLButtonElement;
    button.click();
    expect(seen).toEqual([{ seriesId: 'jma', hidden: true }]);
  });

  it('renders price dots when showDots is true', () => {
    const { container } = render(
      <ChartLineJma data={JMA_DATA} length={2} phase={0} showDots />,
    );
    expect(
      container.querySelectorAll('[data-section="chart-line-jma-dot"]'),
    ).toHaveLength(8);
  });

  it('renders the empty state for an insufficient series', () => {
    const { container } = render(<ChartLineJma data={[{ x: 0, value: 5 }]} />);
    const root = container.querySelector('[data-section="chart-line-jma"]');
    expect(root!.getAttribute('data-empty')).toBe('true');
    expect(
      container.querySelector('[data-section="chart-line-jma-svg"]'),
    ).toBeNull();
  });

  it('omits the config badge when showConfigBadge is false', () => {
    const { container } = render(
      <ChartLineJma
        data={JMA_DATA}
        length={2}
        phase={0}
        showConfigBadge={false}
      />,
    );
    expect(
      container.querySelector('[data-section="chart-line-jma-badge"]'),
    ).toBeNull();
  });

  it('forwards a ref to the root element', () => {
    const ref = createRef<HTMLDivElement>();
    render(<ChartLineJma ref={ref} data={JMA_DATA} length={2} phase={0} />);
    expect(ref.current).not.toBeNull();
    expect(ref.current!.getAttribute('data-section')).toBe('chart-line-jma');
  });

  it('has a stable displayName', () => {
    expect(ChartLineJma.displayName).toBe('ChartLineJma');
  });

  it('toggles the animate attribute', () => {
    const { container } = render(
      <ChartLineJma data={JMA_DATA} length={2} phase={0} animate={false} />,
    );
    const root = container.querySelector('[data-section="chart-line-jma"]');
    expect(root!.getAttribute('data-animate')).toBe('false');
  });
});
