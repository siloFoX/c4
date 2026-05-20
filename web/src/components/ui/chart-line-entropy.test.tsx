import { describe, it, expect, afterEach } from 'vitest';
import { createRef } from 'react';
import { render, cleanup } from '@testing-library/react';
import {
  ChartLineEntropy,
  computeLineEntropy,
  computeLineEntropyHistogram,
  computeLineEntropyValue,
  computeLineEntropyLayout,
  getLineEntropyFinitePoints,
  normalizeLineEntropyPeriod,
  normalizeLineEntropyBins,
  runLineEntropy,
  describeLineEntropyChart,
  type ChartLineEntropyPoint,
} from './chart-line-entropy';

afterEach(() => cleanup());

// The Shannon entropy H = -sum(p * log2(p)) is exact when every
// probability is a power of 1/2: log2 of an exact power of two is
// an exact integer. The fixtures are hand-tuned around that --
// a flat series gives entropy 0, a strict ramp spreads every
// window across all bins (entropy log2(bins)), a two-level series
// fills two bins evenly.
const ENTROPY_DATA: ChartLineEntropyPoint[] = [
  { x: 0, value: 20 },
  { x: 1, value: 25 },
  { x: 2, value: 21 },
  { x: 3, value: 28 },
  { x: 4, value: 23 },
  { x: 5, value: 31 },
  { x: 6, value: 26 },
  { x: 7, value: 34 },
  { x: 8, value: 29 },
  { x: 9, value: 37 },
  { x: 10, value: 32 },
  { x: 11, value: 41 },
];

// A strict ramp: with period 4 and 4 bins, every window puts one
// value in each bin, so the normalized entropy is exactly 1.
const RAMP_DATA: ChartLineEntropyPoint[] = [
  { x: 0, value: 1 },
  { x: 1, value: 2 },
  { x: 2, value: 3 },
  { x: 3, value: 4 },
  { x: 4, value: 5 },
  { x: 5, value: 6 },
];

// A two-level series: with period 4 and 4 bins, every window fills
// two bins evenly, so the normalized entropy is exactly 0.5.
const LEVEL_DATA: ChartLineEntropyPoint[] = [
  { x: 0, value: 10 },
  { x: 1, value: 10 },
  { x: 2, value: 20 },
  { x: 3, value: 20 },
  { x: 4, value: 10 },
  { x: 5, value: 10 },
  { x: 6, value: 20 },
  { x: 7, value: 20 },
];

// A flat series: every window collapses into one bin, entropy 0.
const FLAT_DATA: ChartLineEntropyPoint[] = [
  { x: 0, value: 7 },
  { x: 1, value: 7 },
  { x: 2, value: 7 },
  { x: 3, value: 7 },
  { x: 4, value: 7 },
  { x: 5, value: 7 },
];

describe('getLineEntropyFinitePoints', () => {
  it('keeps only points with finite x and value', () => {
    const points = getLineEntropyFinitePoints([
      { x: 0, value: 5 },
      { x: NaN, value: 5 },
      { x: 1, value: Infinity },
      { x: 2, value: 9 },
    ]);
    expect(points).toHaveLength(2);
    expect(points.map((p) => p.x)).toEqual([0, 2]);
  });

  it('returns an empty array for non-array input', () => {
    expect(getLineEntropyFinitePoints(null)).toEqual([]);
    expect(getLineEntropyFinitePoints(undefined)).toEqual([]);
  });
});

describe('normalizeLineEntropyPeriod', () => {
  it('floors a fractional period', () => {
    expect(normalizeLineEntropyPeriod(20.9, 20)).toBe(20);
  });

  it('falls back for a sub-2, NaN or negative period', () => {
    expect(normalizeLineEntropyPeriod(1, 20)).toBe(20);
    expect(normalizeLineEntropyPeriod(NaN, 20)).toBe(20);
    expect(normalizeLineEntropyPeriod(-5, 20)).toBe(20);
  });
});

describe('normalizeLineEntropyBins', () => {
  it('floors a fractional bin count', () => {
    expect(normalizeLineEntropyBins(8.9, 8)).toBe(8);
  });

  it('falls back for a sub-2, NaN or negative bin count', () => {
    expect(normalizeLineEntropyBins(1, 8)).toBe(8);
    expect(normalizeLineEntropyBins(NaN, 8)).toBe(8);
    expect(normalizeLineEntropyBins(-3, 8)).toBe(8);
  });
});

describe('computeLineEntropyHistogram', () => {
  it('bins the window values into bucket counts', () => {
    expect(computeLineEntropyHistogram([10, 10, 20, 20], 4).counts).toEqual([
      2, 0, 0, 2,
    ]);
  });

  it('spreads a ramp across every bin', () => {
    expect(computeLineEntropyHistogram([1, 2, 3, 4], 4).counts).toEqual([
      1, 1, 1, 1,
    ]);
  });

  it('collapses a flat window into a single bin', () => {
    expect(computeLineEntropyHistogram([5, 5, 5, 5], 4).counts).toEqual([
      4, 0, 0, 0,
    ]);
  });

  it('normalizes the counts into probabilities', () => {
    expect(
      computeLineEntropyHistogram([10, 10, 20, 20], 4).probabilities,
    ).toEqual([0.5, 0, 0, 0.5]);
  });

  it('returns empty arrays for non-array input', () => {
    expect(computeLineEntropyHistogram(null, 4)).toEqual({
      counts: [],
      probabilities: [],
    });
  });
});

describe('computeLineEntropyValue', () => {
  it('computes one bit for an even two-way split', () => {
    expect(computeLineEntropyValue([0.5, 0.5])).toBe(1);
  });

  it('computes two bits for four equal outcomes', () => {
    expect(computeLineEntropyValue([0.25, 0.25, 0.25, 0.25])).toBe(2);
  });

  it('is zero for a certain outcome', () => {
    expect(computeLineEntropyValue([1, 0, 0])).toBe(0);
  });

  it('ignores zero-probability bins', () => {
    expect(computeLineEntropyValue([0.5, 0, 0, 0.5])).toBe(1);
  });

  it('is zero for an empty or non-array distribution', () => {
    expect(computeLineEntropyValue([])).toBe(0);
    expect(computeLineEntropyValue(null)).toBe(0);
  });
});

describe('computeLineEntropy', () => {
  it('computes zero entropy for a flat series', () => {
    expect(computeLineEntropy([5, 5, 5, 5, 5, 5], 4, 4)).toEqual({
      entropy: [null, null, null, 0, 0, 0],
      normalized: [null, null, null, 0, 0, 0],
    });
  });

  it('computes full normalized entropy for a ramp', () => {
    expect(computeLineEntropy([1, 2, 3, 4, 5, 6], 4, 4).normalized).toEqual([
      null,
      null,
      null,
      1,
      1,
      1,
    ]);
  });

  it('exposes the raw entropy in bits', () => {
    expect(computeLineEntropy([1, 2, 3, 4, 5, 6], 4, 4).entropy).toEqual([
      null,
      null,
      null,
      2,
      2,
      2,
    ]);
  });

  it('computes a mid entropy for a two-level series', () => {
    expect(
      computeLineEntropy([10, 10, 20, 20, 10, 10, 20, 20], 4, 4).normalized,
    ).toEqual([null, null, null, 0.5, 0.5, 0.5, 0.5, 0.5]);
  });

  it('is null through the warm-up window', () => {
    const values = ENTROPY_DATA.map((p) => p.value);
    expect(computeLineEntropy(values, 4, 4).normalized.slice(0, 3)).toEqual([
      null,
      null,
      null,
    ]);
  });

  it('keeps the normalized entropy in the unit interval', () => {
    const values = ENTROPY_DATA.map((p) => p.value);
    for (const v of computeLineEntropy(values, 4, 4).normalized) {
      if (v === null) continue;
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
  });

  it('returns empty series for non-array input', () => {
    expect(computeLineEntropy(null, 4, 4)).toEqual({
      entropy: [],
      normalized: [],
    });
  });
});

describe('runLineEntropy', () => {
  it('reports ok for a sufficient series', () => {
    expect(runLineEntropy(ENTROPY_DATA, { period: 4, bins: 4 }).ok).toBe(true);
  });

  it('carries the period and bins onto the run', () => {
    const run = runLineEntropy(ENTROPY_DATA, { period: 4, bins: 4 });
    expect(run.period).toBe(4);
    expect(run.bins).toBe(4);
  });

  it('exposes the entropy and normalized series', () => {
    const run = runLineEntropy(ENTROPY_DATA, { period: 4, bins: 4 });
    expect(run.entropy).toHaveLength(12);
    expect(run.normalized).toHaveLength(12);
  });

  it('leaves the entropy null until the window is full', () => {
    const run = runLineEntropy(ENTROPY_DATA, { period: 4, bins: 4 });
    expect(
      run.samples.slice(0, 3).every((s) => s.normalized === null),
    ).toBe(true);
    expect(typeof run.samples[3]!.normalized).toBe('number');
  });

  it('classifies each sample against the 0.5 disorder level', () => {
    const run = runLineEntropy(ENTROPY_DATA, { period: 4, bins: 4 });
    for (const s of run.samples) {
      if (s.normalized === null || s.normalized === 0.5) {
        expect(s.classification).toBe('neutral');
      } else {
        expect(s.classification).toBe(
          s.normalized > 0.5 ? 'disordered' : 'ordered',
        );
      }
    }
  });

  it('counts the disordered and ordered bars consistently', () => {
    const run = runLineEntropy(ENTROPY_DATA, { period: 4, bins: 4 });
    expect(run.disorderedCount).toBe(
      run.normalized.filter((v) => v !== null && v > 0.5).length,
    );
    expect(run.orderedCount).toBe(
      run.normalized.filter((v) => v !== null && v < 0.5).length,
    );
  });

  it('classifies a ramp window as disordered', () => {
    const run = runLineEntropy(RAMP_DATA, { period: 4, bins: 4 });
    expect(run.disorderedCount).toBe(3);
    expect(
      run.samples.slice(3).every((s) => s.classification === 'disordered'),
    ).toBe(true);
  });

  it('classifies a two-level window as neutral', () => {
    const run = runLineEntropy(LEVEL_DATA, { period: 4, bins: 4 });
    expect(
      run.samples.slice(3).every((s) => s.classification === 'neutral'),
    ).toBe(true);
  });

  it('classifies a flat window as ordered', () => {
    const run = runLineEntropy(FLAT_DATA, { period: 4, bins: 4 });
    expect(run.orderedCount).toBe(3);
    expect(
      run.samples.slice(3).every((s) => s.classification === 'ordered'),
    ).toBe(true);
  });

  it('reports the final normalized reading', () => {
    const run = runLineEntropy(ENTROPY_DATA, { period: 4, bins: 4 });
    expect(run.normalizedFinal).toBe(run.normalized[11]);
    expect(Number.isFinite(run.normalizedFinal)).toBe(true);
  });

  it('reports the min and max normalized readings', () => {
    const run = runLineEntropy(ENTROPY_DATA, { period: 4, bins: 4 });
    const defined = run.normalized.filter((v): v is number => v !== null);
    expect(run.normalizedMin).toBe(Math.min(...defined));
    expect(run.normalizedMax).toBe(Math.max(...defined));
  });

  it('reports not-ok for fewer than two points', () => {
    const run = runLineEntropy([{ x: 0, value: 5 }], { period: 4, bins: 4 });
    expect(run.ok).toBe(false);
    expect(run.samples).toEqual([]);
  });

  it('reports not-ok for empty or null input', () => {
    expect(runLineEntropy([], { period: 4, bins: 4 }).ok).toBe(false);
    expect(runLineEntropy(null, { period: 4, bins: 4 }).ok).toBe(false);
  });

  it('sorts the series by x before computing', () => {
    const shuffled = [...ENTROPY_DATA].reverse();
    const run = runLineEntropy(shuffled, { period: 4, bins: 4 });
    expect(run.series.map((p) => p.x)).toEqual([
      0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11,
    ]);
  });

  it('produces one sample per series point', () => {
    expect(
      runLineEntropy(ENTROPY_DATA, { period: 4, bins: 4 }).samples,
    ).toHaveLength(12);
  });

  it('defaults to a period of 20 and 8 bins', () => {
    const run = runLineEntropy(ENTROPY_DATA);
    expect(run.period).toBe(20);
    expect(run.bins).toBe(8);
  });
});

describe('computeLineEntropyLayout', () => {
  const base = {
    data: ENTROPY_DATA,
    period: 4,
    bins: 4,
    width: 560,
    height: 360,
    padding: 40,
  };

  it('produces an ok layout for a valid series', () => {
    const layout = computeLineEntropyLayout(base);
    expect(layout.ok).toBe(true);
    expect(layout.totalPoints).toBe(12);
  });

  it('stacks the price panel above the entropy panel', () => {
    const layout = computeLineEntropyLayout(base);
    expect(layout.pricePanel.height).toBeGreaterThan(0);
    expect(layout.entropyPanel.height).toBeGreaterThan(0);
    expect(layout.entropyPanel.y).toBeGreaterThan(layout.pricePanel.y);
  });

  it('builds non-empty price and entropy paths', () => {
    const layout = computeLineEntropyLayout(base);
    expect(layout.pricePath.startsWith('M')).toBe(true);
    expect(layout.entropyPath.startsWith('M')).toBe(true);
  });

  it('emits one price dot per bar and one marker per defined entropy', () => {
    const layout = computeLineEntropyLayout(base);
    expect(layout.priceDots).toHaveLength(12);
    expect(layout.entropyMarkers).toHaveLength(9);
  });

  it('fixes the entropy panel y-domain to the unit interval', () => {
    const layout = computeLineEntropyLayout(base);
    expect(layout.entropyYMin).toBe(0);
    expect(layout.entropyYMax).toBe(1);
  });

  it('places the 0.5 reference line inside the entropy panel', () => {
    const layout = computeLineEntropyLayout(base);
    expect(layout.refY).toBeGreaterThanOrEqual(layout.entropyPanel.y);
    expect(layout.refY).toBeLessThanOrEqual(
      layout.entropyPanel.y + layout.entropyPanel.height,
    );
  });

  it('carries the run statistics onto the layout', () => {
    const layout = computeLineEntropyLayout(base);
    expect(layout.period).toBe(4);
    expect(layout.bins).toBe(4);
    expect(layout.totalPoints).toBe(12);
  });

  it('returns a not-ok layout for collapsed dimensions', () => {
    const layout = computeLineEntropyLayout({ ...base, width: 10 });
    expect(layout.ok).toBe(false);
    expect(layout.entropyPath).toBe('');
  });

  it('returns a not-ok layout when there is too little data', () => {
    const layout = computeLineEntropyLayout({
      ...base,
      data: [{ x: 0, value: 5 }],
    });
    expect(layout.ok).toBe(false);
  });
});

describe('describeLineEntropyChart', () => {
  it('summarises the chart with the indicator vocabulary', () => {
    const text = describeLineEntropyChart(ENTROPY_DATA, {
      period: 4,
      bins: 4,
    });
    expect(text).toContain('Shannon entropy');
    expect(text).toContain('histogram');
    expect(text).toContain('disorder');
    expect(text).toContain('normalized');
  });

  it('reports the disordered and ordered counts', () => {
    const run = runLineEntropy(ENTROPY_DATA, { period: 4, bins: 4 });
    const text = describeLineEntropyChart(ENTROPY_DATA, {
      period: 4,
      bins: 4,
    });
    expect(text).toContain(`disordered on ${run.disorderedCount}`);
    expect(text).toContain(`and ordered on ${run.orderedCount}`);
  });

  it('returns a no-data message for an insufficient series', () => {
    expect(describeLineEntropyChart([])).toBe('No data');
    expect(describeLineEntropyChart(null)).toBe('No data');
  });
});

describe('<ChartLineEntropy />', () => {
  it('renders a labelled region', () => {
    const { container } = render(
      <ChartLineEntropy data={ENTROPY_DATA} period={4} bins={4} />,
    );
    const region = container.querySelector('[role="region"]');
    expect(region).not.toBeNull();
    expect(region!.getAttribute('aria-label')).toBeTruthy();
  });

  it('exposes an accessible description', () => {
    const { container } = render(
      <ChartLineEntropy data={ENTROPY_DATA} period={4} bins={4} />,
    );
    const desc = container.querySelector(
      '[data-section="chart-line-entropy-aria-desc"]',
    );
    expect(desc).not.toBeNull();
    expect(desc!.textContent).toContain('Shannon entropy');
  });

  it('publishes the run statistics as data attributes', () => {
    const { container } = render(
      <ChartLineEntropy data={ENTROPY_DATA} period={4} bins={4} />,
    );
    const root = container.querySelector('[data-section="chart-line-entropy"]');
    expect(root!.getAttribute('data-period')).toBe('4');
    expect(root!.getAttribute('data-bins')).toBe('4');
    expect(root!.getAttribute('data-total-points')).toBe('12');
    expect(root!.getAttribute('data-empty')).toBe('false');
  });

  it('renders an svg with the price and entropy lines', () => {
    const { container } = render(
      <ChartLineEntropy data={ENTROPY_DATA} period={4} bins={4} />,
    );
    expect(
      container.querySelector('[data-section="chart-line-entropy-svg"]'),
    ).not.toBeNull();
    expect(
      container.querySelector('[data-section="chart-line-entropy-price-path"]'),
    ).not.toBeNull();
    expect(
      container.querySelector(
        '[data-section="chart-line-entropy-entropy-line"]',
      ),
    ).not.toBeNull();
  });

  it('renders both panel labels', () => {
    const { container } = render(
      <ChartLineEntropy data={ENTROPY_DATA} period={4} bins={4} />,
    );
    expect(
      container.querySelectorAll(
        '[data-section="chart-line-entropy-panel-label"]',
      ),
    ).toHaveLength(2);
  });

  it('renders one entropy marker per defined value', () => {
    const { container } = render(
      <ChartLineEntropy data={ENTROPY_DATA} period={4} bins={4} />,
    );
    expect(
      container.querySelectorAll('[data-section="chart-line-entropy-marker"]'),
    ).toHaveLength(9);
  });

  it('classifies each marker with a class attribute', () => {
    const { container } = render(
      <ChartLineEntropy data={ENTROPY_DATA} period={4} bins={4} />,
    );
    const markers = container.querySelectorAll(
      '[data-section="chart-line-entropy-marker"]',
    );
    for (const m of markers) {
      expect(['disordered', 'ordered', 'neutral']).toContain(
        m.getAttribute('data-class'),
      );
    }
  });

  it('renders the 0.5 reference line', () => {
    const { container } = render(
      <ChartLineEntropy data={ENTROPY_DATA} period={4} bins={4} />,
    );
    expect(
      container.querySelector('[data-section="chart-line-entropy-ref-line"]'),
    ).not.toBeNull();
  });

  it('renders a two-item legend', () => {
    const { container } = render(
      <ChartLineEntropy data={ENTROPY_DATA} period={4} bins={4} />,
    );
    expect(
      container.querySelectorAll(
        '[data-section="chart-line-entropy-legend-item"]',
      ),
    ).toHaveLength(2);
  });

  it('renders the config badge with the period and bins', () => {
    const { container } = render(
      <ChartLineEntropy data={ENTROPY_DATA} period={4} bins={8} />,
    );
    const badge = container.querySelector(
      '[data-section="chart-line-entropy-badge-config"]',
    );
    expect(badge!.textContent).toContain('4');
    expect(badge!.textContent).toContain('8');
  });

  it('hides the price path when price is in the hidden set', () => {
    const { container } = render(
      <ChartLineEntropy
        data={ENTROPY_DATA}
        period={4}
        bins={4}
        hiddenSeries={['price']}
      />,
    );
    expect(
      container.querySelector('[data-section="chart-line-entropy-price-path"]'),
    ).toBeNull();
  });

  it('hides the entropy line and markers when showEntropy is false', () => {
    const { container } = render(
      <ChartLineEntropy
        data={ENTROPY_DATA}
        period={4}
        bins={4}
        showEntropy={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-entropy-entropy-line"]',
      ),
    ).toBeNull();
    expect(
      container.querySelectorAll('[data-section="chart-line-entropy-marker"]'),
    ).toHaveLength(0);
  });

  it('hides the entropy line via the hidden set', () => {
    const { container } = render(
      <ChartLineEntropy
        data={ENTROPY_DATA}
        period={4}
        bins={4}
        hiddenSeries={['entropy']}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-entropy-entropy-line"]',
      ),
    ).toBeNull();
  });

  it('hides the reference line when showRefLine is false', () => {
    const { container } = render(
      <ChartLineEntropy
        data={ENTROPY_DATA}
        period={4}
        bins={4}
        showRefLine={false}
      />,
    );
    expect(
      container.querySelector('[data-section="chart-line-entropy-ref-line"]'),
    ).toBeNull();
  });

  it('reports series toggles through onSeriesToggle', () => {
    const seen: { seriesId: string; hidden: boolean }[] = [];
    const { container } = render(
      <ChartLineEntropy
        data={ENTROPY_DATA}
        period={4}
        bins={4}
        onSeriesToggle={(p) => seen.push(p)}
      />,
    );
    const button = container.querySelector(
      '[data-section="chart-line-entropy-legend-item"][data-series-id="entropy"]',
    ) as HTMLButtonElement;
    button.click();
    expect(seen).toEqual([{ seriesId: 'entropy', hidden: true }]);
  });

  it('renders price dots when showDots is true', () => {
    const { container } = render(
      <ChartLineEntropy data={ENTROPY_DATA} period={4} bins={4} showDots />,
    );
    expect(
      container.querySelectorAll('[data-section="chart-line-entropy-dot"]'),
    ).toHaveLength(12);
  });

  it('renders the empty state for an insufficient series', () => {
    const { container } = render(
      <ChartLineEntropy data={[{ x: 0, value: 5 }]} />,
    );
    const root = container.querySelector('[data-section="chart-line-entropy"]');
    expect(root!.getAttribute('data-empty')).toBe('true');
    expect(
      container.querySelector('[data-section="chart-line-entropy-svg"]'),
    ).toBeNull();
  });

  it('omits the config badge when showConfigBadge is false', () => {
    const { container } = render(
      <ChartLineEntropy
        data={ENTROPY_DATA}
        period={4}
        bins={4}
        showConfigBadge={false}
      />,
    );
    expect(
      container.querySelector('[data-section="chart-line-entropy-badge"]'),
    ).toBeNull();
  });

  it('forwards a ref to the root element', () => {
    const ref = createRef<HTMLDivElement>();
    render(<ChartLineEntropy ref={ref} data={ENTROPY_DATA} />);
    expect(ref.current).not.toBeNull();
    expect(ref.current!.getAttribute('data-section')).toBe(
      'chart-line-entropy',
    );
  });

  it('has a stable displayName', () => {
    expect(ChartLineEntropy.displayName).toBe('ChartLineEntropy');
  });

  it('toggles the animate attribute', () => {
    const { container } = render(
      <ChartLineEntropy data={ENTROPY_DATA} animate={false} />,
    );
    const root = container.querySelector('[data-section="chart-line-entropy"]');
    expect(root!.getAttribute('data-animate')).toBe('false');
  });
});
