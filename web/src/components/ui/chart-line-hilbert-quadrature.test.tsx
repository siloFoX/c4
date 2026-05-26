import { describe, expect, it, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { createRef } from 'react';
import {
  ChartLineHilbertQuadrature,
  applyLineHilbertQuadratureDetrend,
  applyLineHilbertQuadratureShift,
  applyLineHilbertQuadratureSma,
  classifyLineHilbertQuadratureZone,
  computeLineHilbertQuadrature,
  computeLineHilbertQuadratureLayout,
  describeLineHilbertQuadratureChart,
  detectLineHilbertQuadratureCrosses,
  getLineHilbertQuadratureFinitePoints,
  getLineHilbertQuadratureShift,
  normalizeLineHilbertQuadratureLength,
  normalizeLineHilbertQuadratureThreshold,
  runLineHilbertQuadrature,
  DEFAULT_CHART_LINE_HILBERT_QUADRATURE_LENGTH,
} from './chart-line-hilbert-quadrature';
import type { ChartLineHilbertQuadraturePoint } from './chart-line-hilbert-quadrature';

const constBar = (
  count: number,
  K: number,
): ChartLineHilbertQuadraturePoint[] =>
  Array.from({ length: count }, (_, i) => ({ x: i, close: K }));

const linearUp = (count: number): ChartLineHilbertQuadraturePoint[] =>
  Array.from({ length: count }, (_, i) => ({ x: i, close: i + 1 }));

const linearDown = (count: number): ChartLineHilbertQuadraturePoint[] =>
  Array.from({ length: count }, (_, i) => ({ x: i, close: count - i }));

describe('getLineHilbertQuadratureFinitePoints', () => {
  it('returns an empty array for null', () => {
    expect(getLineHilbertQuadratureFinitePoints(null)).toEqual([]);
  });

  it('drops non-finite close', () => {
    const result = getLineHilbertQuadratureFinitePoints([
      { x: 0, close: Number.NaN },
      { x: 1, close: 10 },
    ]);
    expect(result.length).toBe(1);
  });

  it('drops non-finite x', () => {
    const result = getLineHilbertQuadratureFinitePoints([
      { x: Number.POSITIVE_INFINITY, close: 10 },
      { x: 1, close: 10 },
    ]);
    expect(result.length).toBe(1);
  });

  it('drops null entries', () => {
    const result = getLineHilbertQuadratureFinitePoints([
      null as unknown as ChartLineHilbertQuadraturePoint,
      { x: 1, close: 10 },
    ]);
    expect(result.length).toBe(1);
  });
});

describe('normalizeLineHilbertQuadratureLength', () => {
  it('returns default when undefined', () => {
    expect(normalizeLineHilbertQuadratureLength(undefined, 20)).toBe(20);
  });

  it('rejects below 4', () => {
    expect(normalizeLineHilbertQuadratureLength(3, 20)).toBe(20);
    expect(normalizeLineHilbertQuadratureLength(2, 20)).toBe(20);
  });

  it('accepts 4', () => {
    expect(normalizeLineHilbertQuadratureLength(4, 20)).toBe(4);
  });

  it('floors fractional values', () => {
    expect(normalizeLineHilbertQuadratureLength(7.6, 20)).toBe(7);
  });
});

describe('normalizeLineHilbertQuadratureThreshold', () => {
  it('returns default when undefined', () => {
    expect(normalizeLineHilbertQuadratureThreshold(undefined, 0)).toBe(0);
  });

  it('accepts zero', () => {
    expect(normalizeLineHilbertQuadratureThreshold(0, 0)).toBe(0);
  });

  it('rejects negative', () => {
    expect(normalizeLineHilbertQuadratureThreshold(-1, 0)).toBe(0);
  });

  it('accepts positive', () => {
    expect(normalizeLineHilbertQuadratureThreshold(0.5, 0)).toBe(0.5);
  });
});

describe('getLineHilbertQuadratureShift', () => {
  it('quarter cycle for 20', () => {
    expect(getLineHilbertQuadratureShift(20)).toBe(5);
  });

  it('quarter cycle for 16', () => {
    expect(getLineHilbertQuadratureShift(16)).toBe(4);
  });

  it('quarter cycle for 4 (min)', () => {
    expect(getLineHilbertQuadratureShift(4)).toBe(1);
  });

  it('quarter cycle for 8', () => {
    expect(getLineHilbertQuadratureShift(8)).toBe(2);
  });

  it('minimum of 1 for small length', () => {
    expect(getLineHilbertQuadratureShift(3)).toBe(1);
  });
});

describe('applyLineHilbertQuadratureSma', () => {
  it('CONST K SMA is K bit-exact', () => {
    for (const K of [0, 1, 5, 100, -3]) {
      const out = applyLineHilbertQuadratureSma(Array(10).fill(K), 4);
      for (let i = 3; i < 10; i += 1) {
        expect(out[i]).toBe(K);
      }
    }
  });

  it('warmup region is null', () => {
    const out = applyLineHilbertQuadratureSma([1, 2, 3, 4, 5], 3);
    expect(out[0]).toBe(null);
    expect(out[1]).toBe(null);
    expect(out[2]).toBe(2);
  });

  it('null short-circuit', () => {
    const out = applyLineHilbertQuadratureSma([1, null, 3, 4], 3);
    expect(out[2]).toBe(null);
  });
});

describe('applyLineHilbertQuadratureDetrend', () => {
  it('CONST K detrend = 0 bit-exact post-warmup', () => {
    for (const K of [0, 1, 5, 100, -3]) {
      const closes = Array(10).fill(K);
      const sma = applyLineHilbertQuadratureSma(closes, 4);
      const out = applyLineHilbertQuadratureDetrend(closes, sma);
      for (let i = 3; i < 10; i += 1) {
        expect(out[i]).toBe(0);
      }
    }
  });

  it('LINEAR UP detrend = (L-1)/2 bit-exact, L=4', () => {
    const closes = Array.from({ length: 10 }, (_, i) => i + 1);
    const sma = applyLineHilbertQuadratureSma(closes, 4);
    const out = applyLineHilbertQuadratureDetrend(closes, sma);
    for (let i = 3; i < 10; i += 1) {
      expect(out[i]).toBe(1.5);
    }
  });

  it('LINEAR UP detrend = (L-1)/2 bit-exact, L=8', () => {
    const closes = Array.from({ length: 12 }, (_, i) => i + 1);
    const sma = applyLineHilbertQuadratureSma(closes, 8);
    const out = applyLineHilbertQuadratureDetrend(closes, sma);
    for (let i = 7; i < 12; i += 1) {
      expect(out[i]).toBe(3.5);
    }
  });

  it('LINEAR DOWN detrend = -(L-1)/2', () => {
    const N = 10;
    const closes = Array.from({ length: N }, (_, i) => N - i);
    const sma = applyLineHilbertQuadratureSma(closes, 4);
    const out = applyLineHilbertQuadratureDetrend(closes, sma);
    for (let i = 3; i < N; i += 1) {
      expect(out[i]).toBe(-1.5);
    }
  });

  it('null in SMA propagates to null', () => {
    const out = applyLineHilbertQuadratureDetrend([1, 2, 3], [null, 1.5, 2]);
    expect(out[0]).toBe(null);
    expect(out[1]).toBe(0.5);
  });
});

describe('applyLineHilbertQuadratureShift', () => {
  it('shift=0 returns identity', () => {
    expect(applyLineHilbertQuadratureShift([1, 2, 3, 4], 0)).toEqual([
      1, 2, 3, 4,
    ]);
  });

  it('shift=1 lags by one slot', () => {
    expect(applyLineHilbertQuadratureShift([1, 2, 3, 4], 1)).toEqual([
      null,
      1,
      2,
      3,
    ]);
  });

  it('shift=2', () => {
    expect(applyLineHilbertQuadratureShift([10, 20, 30, 40], 2)).toEqual([
      null,
      null,
      10,
      20,
    ]);
  });

  it('preserves null entries', () => {
    expect(applyLineHilbertQuadratureShift([null, 5, 6], 1)).toEqual([
      null,
      null,
      5,
    ]);
  });
});

describe('computeLineHilbertQuadrature', () => {
  it('returns empty channels for null', () => {
    const ch = computeLineHilbertQuadrature(null);
    expect(ch.quadrature).toEqual([]);
  });

  it('CONST close yields quadrature = 0 bit-exact', () => {
    for (const K of [0, 1, 5, 100, -3]) {
      const series = constBar(20, K);
      const ch = computeLineHilbertQuadrature(series, { length: 8 });
      for (let i = 9; i < 20; i += 1) {
        expect(ch.quadrature[i]).toBe(0);
      }
    }
  });

  it('LINEAR UP yields quadrature = (L-1)/2 bit-exact, L=4', () => {
    const series = linearUp(20);
    const ch = computeLineHilbertQuadrature(series, { length: 4 });
    for (let i = 4; i < 20; i += 1) {
      expect(ch.quadrature[i]).toBe(1.5);
    }
  });

  it('LINEAR UP yields quadrature = (L-1)/2 bit-exact, L=8', () => {
    const series = linearUp(20);
    const ch = computeLineHilbertQuadrature(series, { length: 8 });
    for (let i = 9; i < 20; i += 1) {
      expect(ch.quadrature[i]).toBe(3.5);
    }
  });

  it('LINEAR UP yields quadrature = 9.5 bit-exact for default L=20', () => {
    const series = linearUp(40);
    const ch = computeLineHilbertQuadrature(series, { length: 20 });
    for (let i = 24; i < 40; i += 1) {
      expect(ch.quadrature[i]).toBe(9.5);
    }
  });

  it('LINEAR DOWN yields quadrature = -(L-1)/2', () => {
    const series = linearDown(20);
    const ch = computeLineHilbertQuadrature(series, { length: 4 });
    for (let i = 4; i < 20; i += 1) {
      expect(ch.quadrature[i]).toBe(-1.5);
    }
  });

  it('warmup region is null', () => {
    const series = linearUp(20);
    const ch = computeLineHilbertQuadrature(series, { length: 4 });
    expect(ch.quadrature[0]).toBe(null);
    expect(ch.quadrature[3]).toBe(null);
    expect(ch.quadrature[4]).toBe(1.5);
  });

  it('output length matches input length', () => {
    const series = linearUp(20);
    const ch = computeLineHilbertQuadrature(series, { length: 8 });
    expect(ch.quadrature.length).toBe(20);
  });

  it('does not mutate input', () => {
    const series = linearUp(20);
    const snap = JSON.parse(JSON.stringify(series));
    computeLineHilbertQuadrature(series, { length: 4 });
    expect(series).toEqual(snap);
  });
});

describe('classifyLineHilbertQuadratureZone', () => {
  it('classifies positive when > threshold', () => {
    expect(classifyLineHilbertQuadratureZone(1.5, 0)).toBe('positive');
    expect(classifyLineHilbertQuadratureZone(1.5, 1)).toBe('positive');
  });

  it('classifies negative when < -threshold', () => {
    expect(classifyLineHilbertQuadratureZone(-1.5, 0)).toBe('negative');
    expect(classifyLineHilbertQuadratureZone(-1.5, 1)).toBe('negative');
  });

  it('classifies neutral inside the threshold band', () => {
    expect(classifyLineHilbertQuadratureZone(0, 0)).toBe('neutral');
    expect(classifyLineHilbertQuadratureZone(0.5, 1)).toBe('neutral');
    expect(classifyLineHilbertQuadratureZone(-0.5, 1)).toBe('neutral');
  });

  it('returns none for null', () => {
    expect(classifyLineHilbertQuadratureZone(null, 0)).toBe('none');
  });
});

describe('detectLineHilbertQuadratureCrosses', () => {
  it('returns null for warmup', () => {
    expect(detectLineHilbertQuadratureCrosses([null, null], 0)).toEqual([
      null,
      null,
    ]);
  });

  it('flags up when crossing zero from below', () => {
    const ev = detectLineHilbertQuadratureCrosses([null, -1, 2], 0);
    expect(ev[2]).toBe('up');
  });

  it('flags down when crossing zero from above', () => {
    const ev = detectLineHilbertQuadratureCrosses([null, 1, -2], 0);
    expect(ev[2]).toBe('down');
  });

  it('first defined sample is not a cross', () => {
    expect(detectLineHilbertQuadratureCrosses([null, 2], 0)[1]).toBe(null);
  });

  it('flat positive stays null', () => {
    const ev = detectLineHilbertQuadratureCrosses([null, 2, 3, 4], 0);
    expect(ev).toEqual([null, null, null, null]);
  });
});

describe('runLineHilbertQuadrature', () => {
  it('marks ok=false for short data', () => {
    const run = runLineHilbertQuadrature(constBar(4, 10), { length: 4 });
    expect(run.ok).toBe(false);
  });

  it('marks ok=true with enough data', () => {
    const run = runLineHilbertQuadrature(constBar(10, 10), { length: 4 });
    expect(run.ok).toBe(true);
  });

  it('uses default parameters', () => {
    const run = runLineHilbertQuadrature(constBar(30, 10));
    expect(run.length).toBe(DEFAULT_CHART_LINE_HILBERT_QUADRATURE_LENGTH);
    expect(run.threshold).toBe(0);
    expect(run.shift).toBe(5);
  });

  it('respects explicit options', () => {
    const run = runLineHilbertQuadrature(constBar(30, 10), {
      length: 8,
      threshold: 0.5,
    });
    expect(run.length).toBe(8);
    expect(run.threshold).toBe(0.5);
    expect(run.shift).toBe(2);
  });

  it('sorts by x', () => {
    const data: ChartLineHilbertQuadraturePoint[] = [
      { x: 2, close: 30 },
      { x: 0, close: 10 },
      { x: 1, close: 20 },
    ];
    const run = runLineHilbertQuadrature(data, { length: 4 });
    expect(run.samples.map((s) => s.x)).toEqual([0, 1, 2]);
  });

  it('LINEAR UP yields all positive zone post warmup', () => {
    const run = runLineHilbertQuadrature(linearUp(30), {
      length: 4,
      threshold: 0,
    });
    expect(run.positiveCount).toBe(26);
  });

  it('LINEAR DOWN yields all negative zone post warmup', () => {
    const run = runLineHilbertQuadrature(linearDown(30), {
      length: 4,
      threshold: 0,
    });
    expect(run.negativeCount).toBe(26);
  });

  it('CONST close yields all neutral zone (q=0)', () => {
    const run = runLineHilbertQuadrature(constBar(30, 10), { length: 4 });
    expect(run.neutralCount).toBe(26);
  });
});

describe('computeLineHilbertQuadratureLayout', () => {
  it('returns ok=false for empty data', () => {
    const layout = computeLineHilbertQuadratureLayout({ data: [] });
    expect(layout.ok).toBe(false);
  });

  it('returns ok=true for sufficient data', () => {
    const layout = computeLineHilbertQuadratureLayout({
      data: linearUp(30),
    });
    expect(layout.ok).toBe(true);
  });

  it('panels stack with price above quadrature', () => {
    const layout = computeLineHilbertQuadratureLayout({
      data: linearUp(30),
    });
    expect(layout.priceBottom).toBeLessThan(layout.quadTop);
  });

  it('produces a price path and dots', () => {
    const layout = computeLineHilbertQuadratureLayout({
      data: linearUp(30),
    });
    expect(layout.pricePath.startsWith('M')).toBe(true);
    expect(layout.priceDots.length).toBe(30);
  });

  it('quad axis includes zero', () => {
    const layout = computeLineHilbertQuadratureLayout({
      data: linearUp(30),
    });
    expect(layout.quadMin).toBeLessThanOrEqual(0);
    expect(layout.quadMax).toBeGreaterThanOrEqual(0);
  });
});

describe('describeLineHilbertQuadratureChart', () => {
  it('returns No data for empty input', () => {
    expect(describeLineHilbertQuadratureChart([])).toBe('No data');
  });

  it('mentions Hilbert Quadrature', () => {
    const desc = describeLineHilbertQuadratureChart(linearUp(30));
    expect(desc).toContain('Hilbert Quadrature');
  });

  it('reports length, shift, threshold', () => {
    const desc = describeLineHilbertQuadratureChart(linearUp(30), {
      length: 8,
      threshold: 0.5,
    });
    expect(desc).toContain('length 8');
    expect(desc).toContain('shift 2');
    expect(desc).toContain('threshold 0.5');
  });
});

describe('<ChartLineHilbertQuadrature />', () => {
  it('renders empty placeholder for no data', () => {
    const { container } = render(<ChartLineHilbertQuadrature data={[]} />);
    const placeholder = container.querySelector(
      '[data-section="chart-line-hilbert-quadrature-empty"]',
    );
    expect(placeholder?.textContent).toBe('No data');
  });

  it('renders region role with aria-label', () => {
    const { container } = render(
      <ChartLineHilbertQuadrature data={linearUp(30)} />,
    );
    const region = container.querySelector('[role="region"]');
    expect(region).toBeTruthy();
    expect(region?.getAttribute('aria-label')).toContain('Hilbert');
  });

  it('forwards ref', () => {
    const ref = createRef<HTMLDivElement>();
    render(<ChartLineHilbertQuadrature data={linearUp(30)} ref={ref} />);
    expect(ref.current).not.toBe(null);
  });

  it('exposes data attrs', () => {
    const { container } = render(
      <ChartLineHilbertQuadrature
        data={linearUp(30)}
        length={8}
        threshold={0.5}
      />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-hilbert-quadrature"]',
    );
    expect(root?.getAttribute('data-length')).toBe('8');
    expect(root?.getAttribute('data-threshold')).toBe('0.5');
    expect(root?.getAttribute('data-shift')).toBe('2');
  });

  it('exposes total-points', () => {
    const { container } = render(
      <ChartLineHilbertQuadrature data={linearUp(30)} />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-hilbert-quadrature"]',
    );
    expect(root?.getAttribute('data-total-points')).toBe('30');
  });

  it('renders the screen-reader description', () => {
    const { container } = render(
      <ChartLineHilbertQuadrature data={linearUp(30)} />,
    );
    const desc = container.querySelector(
      '[data-section="chart-line-hilbert-quadrature-aria-desc"]',
    );
    expect(desc?.textContent).toContain('Hilbert Quadrature');
  });

  it('renders both legend items', () => {
    const { container } = render(
      <ChartLineHilbertQuadrature data={linearUp(30)} />,
    );
    expect(container.querySelector('[data-series-id="price"]')).toBeTruthy();
    expect(
      container.querySelector('[data-series-id="quadrature"]'),
    ).toBeTruthy();
  });

  it('toggles a series via the legend', () => {
    const onToggle = vi.fn();
    const { container } = render(
      <ChartLineHilbertQuadrature
        data={linearUp(30)}
        onSeriesToggle={onToggle}
      />,
    );
    const button = container.querySelector(
      '[data-series-id="quadrature"]',
    ) as HTMLButtonElement | null;
    if (button) fireEvent.click(button);
    expect(onToggle).toHaveBeenCalledWith({
      seriesId: 'quadrature',
      hidden: true,
    });
  });

  it('hides quadrature when controlled hidden', () => {
    const { container } = render(
      <ChartLineHilbertQuadrature
        data={linearUp(30)}
        hiddenSeries={['quadrature']}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-hilbert-quadrature-line"]',
      ),
    ).toBe(null);
  });

  it('renders the config badge by default', () => {
    const { container } = render(
      <ChartLineHilbertQuadrature data={linearUp(30)} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-hilbert-quadrature-badge"]',
      ),
    ).toBeTruthy();
  });

  it('renders zero line by default', () => {
    const { container } = render(
      <ChartLineHilbertQuadrature data={linearUp(30)} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-hilbert-quadrature-zero-line"]',
      ),
    ).toBeTruthy();
  });

  it('hides zero line when showZeroLine is false', () => {
    const { container } = render(
      <ChartLineHilbertQuadrature
        data={linearUp(30)}
        showZeroLine={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-hilbert-quadrature-zero-line"]',
      ),
    ).toBe(null);
  });

  it('does not render threshold lines when threshold=0', () => {
    const { container } = render(
      <ChartLineHilbertQuadrature data={linearUp(30)} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-hilbert-quadrature-positive-line"]',
      ),
    ).toBe(null);
  });

  it('renders threshold lines when threshold>0', () => {
    const { container } = render(
      <ChartLineHilbertQuadrature data={linearUp(30)} threshold={1} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-hilbert-quadrature-positive-line"]',
      ),
    ).toBeTruthy();
    expect(
      container.querySelector(
        '[data-section="chart-line-hilbert-quadrature-negative-line"]',
      ),
    ).toBeTruthy();
  });

  it('hides axis when showAxis is false', () => {
    const { container } = render(
      <ChartLineHilbertQuadrature data={linearUp(30)} showAxis={false} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-hilbert-quadrature-axes"]',
      ),
    ).toBe(null);
  });

  it('hides grid when showGrid is false', () => {
    const { container } = render(
      <ChartLineHilbertQuadrature data={linearUp(30)} showGrid={false} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-hilbert-quadrature-grid"]',
      ),
    ).toBe(null);
  });

  it('hides legend when showLegend is false', () => {
    const { container } = render(
      <ChartLineHilbertQuadrature
        data={linearUp(30)}
        showLegend={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-hilbert-quadrature-legend"]',
      ),
    ).toBe(null);
  });

  it('applies className and style', () => {
    const { container } = render(
      <ChartLineHilbertQuadrature
        data={linearUp(30)}
        className="custom-class"
        style={{ background: 'red' }}
      />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-hilbert-quadrature"]',
    );
    expect(root?.classList.contains('custom-class')).toBe(true);
    expect((root as HTMLElement | null)?.style.background).toBe('red');
  });

  it('animate=false disables fade-in class', () => {
    const { container } = render(
      <ChartLineHilbertQuadrature data={linearUp(30)} animate={false} />,
    );
    const svg = container.querySelector(
      '[data-section="chart-line-hilbert-quadrature-svg"]',
    );
    expect(svg?.classList.contains('motion-safe:animate-fade-in')).toBe(
      false,
    );
  });

  it('renders the quadrature line by default', () => {
    const { container } = render(
      <ChartLineHilbertQuadrature data={linearUp(30)} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-hilbert-quadrature-line"]',
      ),
    ).toBeTruthy();
  });

  it('renders the price path', () => {
    const { container } = render(
      <ChartLineHilbertQuadrature data={linearUp(30)} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-hilbert-quadrature-price-path"]',
      ),
    ).toBeTruthy();
  });

  it('respects defaultHiddenSeries on uncontrolled mount', () => {
    const { container } = render(
      <ChartLineHilbertQuadrature
        data={linearUp(30)}
        defaultHiddenSeries={['quadrature']}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-hilbert-quadrature-line"]',
      ),
    ).toBe(null);
  });
});

describe('Hilbert Quadrature integration', () => {
  it('CONST yields quadrature = 0 across (K, length)', () => {
    for (const K of [0, 1, 5, 100, -3]) {
      for (const L of [4, 8, 12, 16, 20]) {
        const shift = Math.max(1, Math.floor(L / 4));
        const series = constBar(L + shift + 5, K);
        const ch = computeLineHilbertQuadrature(series, { length: L });
        for (let i = L + shift - 1; i < L + shift + 5; i += 1) {
          expect(ch.quadrature[i]).toBe(0);
        }
      }
    }
  });

  it('LINEAR UP yields quadrature = (L-1)/2 across length sweep', () => {
    for (const L of [4, 8, 16, 20]) {
      const shift = Math.max(1, Math.floor(L / 4));
      const series = linearUp(L + shift + 5);
      const ch = computeLineHilbertQuadrature(series, { length: L });
      const expected = (L - 1) / 2;
      for (let i = L + shift - 1; i < L + shift + 5; i += 1) {
        expect(ch.quadrature[i]).toBe(expected);
      }
    }
  });

  it('LINEAR DOWN yields quadrature = -(L-1)/2 across length sweep', () => {
    for (const L of [4, 8, 16, 20]) {
      const shift = Math.max(1, Math.floor(L / 4));
      const N = L + shift + 5;
      const series = linearDown(N);
      const ch = computeLineHilbertQuadrature(series, { length: L });
      const expected = -(L - 1) / 2;
      for (let i = L + shift - 1; i < L + shift + 5; i += 1) {
        expect(ch.quadrature[i]).toBe(expected);
      }
    }
  });
});
