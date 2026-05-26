import { describe, expect, it, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { createRef } from 'react';
import {
  ChartLineBbFisher,
  applyLineBbFisherPopStdDev,
  applyLineBbFisherSma,
  classifyLineBbFisherZone,
  computeLineBbFisher,
  computeLineBbFisherLayout,
  describeLineBbFisherChart,
  detectLineBbFisherCrosses,
  getLineBbFisherFinitePoints,
  normalizeLineBbFisherClampLimit,
  normalizeLineBbFisherLength,
  normalizeLineBbFisherSigma,
  normalizeLineBbFisherThreshold,
  runLineBbFisher,
  DEFAULT_CHART_LINE_BB_FISHER_LENGTH,
} from './chart-line-bb-fisher';
import type { ChartLineBbFisherPoint } from './chart-line-bb-fisher';

const constClose = (
  count: number,
  K: number,
): ChartLineBbFisherPoint[] =>
  Array.from({ length: count }, (_, i) => ({ x: i, close: K }));

const alternating = (count: number): ChartLineBbFisherPoint[] =>
  Array.from({ length: count }, (_, i) => ({
    x: i,
    close: i % 2 === 0 ? 0 : 1,
  }));

describe('getLineBbFisherFinitePoints', () => {
  it('returns an empty array for null', () => {
    expect(getLineBbFisherFinitePoints(null)).toEqual([]);
  });

  it('drops non-finite close', () => {
    const result = getLineBbFisherFinitePoints([
      { x: 0, close: Number.NaN },
      { x: 1, close: 10 },
    ]);
    expect(result.length).toBe(1);
  });

  it('drops null entries', () => {
    const result = getLineBbFisherFinitePoints([
      null as unknown as ChartLineBbFisherPoint,
      { x: 1, close: 10 },
    ]);
    expect(result.length).toBe(1);
  });
});

describe('normalizeLineBbFisherLength', () => {
  it('returns default when undefined', () => {
    expect(normalizeLineBbFisherLength(undefined, 20)).toBe(20);
  });

  it('floors fractional', () => {
    expect(normalizeLineBbFisherLength(7.9, 20)).toBe(7);
  });

  it('rejects below 2', () => {
    expect(normalizeLineBbFisherLength(1, 20)).toBe(20);
  });
});

describe('normalizeLineBbFisherSigma', () => {
  it('returns default when undefined', () => {
    expect(normalizeLineBbFisherSigma(undefined, 2)).toBe(2);
  });

  it('accepts zero', () => {
    expect(normalizeLineBbFisherSigma(0, 2)).toBe(0);
  });

  it('rejects negative', () => {
    expect(normalizeLineBbFisherSigma(-1, 2)).toBe(2);
  });
});

describe('normalizeLineBbFisherClampLimit', () => {
  it('returns default when undefined', () => {
    expect(normalizeLineBbFisherClampLimit(undefined, 0.999)).toBe(0.999);
  });

  it('rejects zero', () => {
    expect(normalizeLineBbFisherClampLimit(0, 0.999)).toBe(0.999);
  });

  it('rejects 1', () => {
    expect(normalizeLineBbFisherClampLimit(1, 0.999)).toBe(0.999);
  });

  it('accepts 0.5', () => {
    expect(normalizeLineBbFisherClampLimit(0.5, 0.999)).toBe(0.5);
  });
});

describe('normalizeLineBbFisherThreshold', () => {
  it('returns default when undefined', () => {
    expect(normalizeLineBbFisherThreshold(undefined, 1.5)).toBe(1.5);
  });

  it('accepts negative', () => {
    expect(normalizeLineBbFisherThreshold(-1.5, 1.5)).toBe(-1.5);
  });

  it('rejects NaN', () => {
    expect(normalizeLineBbFisherThreshold(Number.NaN, 1.5)).toBe(1.5);
  });
});

describe('applyLineBbFisherSma', () => {
  it('CONST K SMA is K bit-exact', () => {
    for (const K of [0, 1, 5, 100, -3]) {
      const out = applyLineBbFisherSma(Array(10).fill(K), 4);
      for (let i = 3; i < 10; i += 1) {
        expect(out[i]).toBe(K);
      }
    }
  });
});

describe('applyLineBbFisherPopStdDev', () => {
  it('CONST K stdDev is 0 bit-exact', () => {
    for (const K of [1, 5, 100]) {
      const values = Array(10).fill(K);
      const means = applyLineBbFisherSma(values, 4);
      const out = applyLineBbFisherPopStdDev(values, means, 4);
      for (let i = 3; i < 10; i += 1) {
        expect(out[i]).toBe(0);
      }
    }
  });

  it('ALTERNATING [0,1] length=4 stdDev = 0.5 bit-exact', () => {
    const values = [0, 1, 0, 1];
    const means = applyLineBbFisherSma(values, 4);
    const out = applyLineBbFisherPopStdDev(values, means, 4);
    expect(out[3]).toBe(0.5);
  });
});

describe('computeLineBbFisher', () => {
  it('returns empty for null', () => {
    const ch = computeLineBbFisher(null);
    expect(ch.fisher).toEqual([]);
  });

  it('returns empty for empty input', () => {
    const ch = computeLineBbFisher([]);
    expect(ch.fisher).toEqual([]);
  });

  it('CONST close yields percentB=null and fisher=null (band has zero width)', () => {
    for (const K of [1, 5, 100, -3]) {
      const closes = Array(15).fill(K);
      const ch = computeLineBbFisher(closes, { length: 4, sigma: 2 });
      for (let i = 3; i < 15; i += 1) {
        expect(ch.upper[i]).toBe(K);
        expect(ch.lower[i]).toBe(K);
        expect(ch.percentB[i]).toBe(null);
        expect(ch.normalized[i]).toBe(null);
        expect(ch.fisher[i]).toBe(null);
      }
    }
  });

  it('ALTERNATING [0,1,0,1] length=4 sigma=2 bit-exact pipeline', () => {
    const closes = alternating(4).map((p) => p.close);
    const ch = computeLineBbFisher(closes, { length: 4, sigma: 2 });
    // bar 3: mean=0.5, stdDev=0.5, upper=1.5, lower=-0.5.
    expect(ch.mean[3]).toBe(0.5);
    expect(ch.stdDev[3]).toBe(0.5);
    expect(ch.upper[3]).toBe(1.5);
    expect(ch.lower[3]).toBe(-0.5);
    // close[3] = 1: percentB = (1 - (-0.5)) / (1.5 - (-0.5)) = 0.75.
    expect(ch.percentB[3]).toBe(0.75);
    // normalized = 2 * 0.75 - 1 = 0.5.
    expect(ch.normalized[3]).toBe(0.5);
    // fisher = atanh(0.5) (deterministic library call).
    expect(ch.fisher[3]).toBe(Math.atanh(0.5));
  });

  it('ALTERNATING bar 4 (close=0) yields fisher = atanh(-0.5)', () => {
    const closes = alternating(5).map((p) => p.close);
    const ch = computeLineBbFisher(closes, { length: 4, sigma: 2 });
    // bar 4: window [1, 4] = [1, 0, 1, 0]. mean = 0.5, stdDev = 0.5.
    // close[4] = 0: percentB = (0 - (-0.5)) / 2 = 0.25.
    // normalized = -0.5. fisher = atanh(-0.5).
    expect(ch.percentB[4]).toBe(0.25);
    expect(ch.normalized[4]).toBe(-0.5);
    expect(ch.fisher[4]).toBe(Math.atanh(-0.5));
  });

  it('clamp limit applied when normalized would exceed it', () => {
    // Construct a window that breaches the band: close at upper.
    // ALTERNATING but with a tail spike.
    const closes = [0, 1, 0, 1, 100];
    const ch = computeLineBbFisher(closes, {
      length: 4,
      sigma: 2,
      clampLimit: 0.5,
    });
    // bar 4: mean=(1+0+1+100)/4=25.5, stdDev=large, close=100.
    // The exact percentB depends on the math, but normalized
    // should be clamped to +/-0.5 here.
    const n = ch.normalized[4];
    expect(n).not.toBe(null);
    if (n !== null) {
      expect(n).toBeGreaterThanOrEqual(-0.5);
      expect(n).toBeLessThanOrEqual(0.5);
    }
  });

  it('warmup region is null', () => {
    const closes = Array(15).fill(5);
    const ch = computeLineBbFisher(closes, { length: 4 });
    expect(ch.mean[0]).toBe(null);
    expect(ch.fisher[0]).toBe(null);
  });

  it('output length matches input length', () => {
    const closes = Array(15).fill(5);
    const ch = computeLineBbFisher(closes, { length: 4 });
    expect(ch.fisher.length).toBe(15);
    expect(ch.percentB.length).toBe(15);
    expect(ch.normalized.length).toBe(15);
  });

  it('does not mutate input', () => {
    const closes = [0, 1, 0, 1, 0, 1];
    const snap = closes.slice();
    computeLineBbFisher(closes, { length: 4 });
    expect(closes).toEqual(snap);
  });
});

describe('classifyLineBbFisherZone', () => {
  it('classifies overbought when value >= overbought threshold', () => {
    expect(classifyLineBbFisherZone(2, 1.5, -1.5)).toBe('overbought');
  });

  it('classifies oversold when value <= oversold threshold', () => {
    expect(classifyLineBbFisherZone(-2, 1.5, -1.5)).toBe('oversold');
  });

  it('classifies neutral in between', () => {
    expect(classifyLineBbFisherZone(0, 1.5, -1.5)).toBe('neutral');
  });

  it('returns none for null', () => {
    expect(classifyLineBbFisherZone(null, 1.5, -1.5)).toBe('none');
  });
});

describe('detectLineBbFisherCrosses', () => {
  it('returns [null, null] for warmup', () => {
    expect(detectLineBbFisherCrosses([null, null], 1.5, -1.5)).toEqual([
      null,
      null,
    ]);
  });

  it('flags up when entering overbought', () => {
    const ev = detectLineBbFisherCrosses([null, 1.0, 2.0], 1.5, -1.5);
    expect(ev[2]).toBe('up');
  });

  it('flags down when entering oversold', () => {
    const ev = detectLineBbFisherCrosses([null, -1.0, -2.0], 1.5, -1.5);
    expect(ev[2]).toBe('down');
  });

  it('no cross when staying overbought', () => {
    const ev = detectLineBbFisherCrosses([null, 2, 2.5], 1.5, -1.5);
    expect(ev[2]).toBe(null);
  });

  it('first defined bar is not a cross', () => {
    const ev = detectLineBbFisherCrosses([null, 2], 1.5, -1.5);
    expect(ev[1]).toBe(null);
  });
});

describe('runLineBbFisher', () => {
  it('marks ok=false for short data', () => {
    const run = runLineBbFisher(constClose(3, 10), { length: 4 });
    expect(run.ok).toBe(false);
  });

  it('marks ok=true with enough data', () => {
    const run = runLineBbFisher(constClose(4, 10), { length: 4 });
    expect(run.ok).toBe(true);
  });

  it('uses default parameters', () => {
    const run = runLineBbFisher(constClose(30, 10));
    expect(run.length).toBe(DEFAULT_CHART_LINE_BB_FISHER_LENGTH);
    expect(run.sigma).toBe(2);
    expect(run.overbought).toBe(1.5);
    expect(run.oversold).toBe(-1.5);
  });

  it('respects explicit options', () => {
    const run = runLineBbFisher(constClose(30, 10), {
      length: 7,
      sigma: 1,
      overbought: 2,
      oversold: -2,
    });
    expect(run.length).toBe(7);
    expect(run.sigma).toBe(1);
    expect(run.overbought).toBe(2);
    expect(run.oversold).toBe(-2);
  });

  it('sorts by x', () => {
    const data: ChartLineBbFisherPoint[] = [
      { x: 2, close: 10 },
      { x: 0, close: 10 },
      { x: 1, close: 10 },
    ];
    const run = runLineBbFisher(data, { length: 2 });
    expect(run.samples.map((s) => s.x)).toEqual([0, 1, 2]);
  });

  it('CONST close classifies post-warmup as none (band collapsed)', () => {
    const run = runLineBbFisher(constClose(20, 10), { length: 4 });
    expect(run.noneCount).toBe(20);
    expect(run.neutralCount).toBe(0);
  });
});

describe('computeLineBbFisherLayout', () => {
  it('returns ok=false for empty data', () => {
    const layout = computeLineBbFisherLayout({ data: [] });
    expect(layout.ok).toBe(false);
  });

  it('returns ok=true for sufficient data', () => {
    const layout = computeLineBbFisherLayout({
      data: constClose(30, 10),
    });
    expect(layout.ok).toBe(true);
  });

  it('panels stack with price above fisher', () => {
    const layout = computeLineBbFisherLayout({
      data: constClose(30, 10),
    });
    expect(layout.priceBottom).toBeLessThan(layout.fisherTop);
  });

  it('panel gap is respected', () => {
    const layout = computeLineBbFisherLayout({
      data: constClose(30, 10),
      panelGap: 24,
    });
    expect(layout.fisherTop - layout.priceBottom).toBeCloseTo(24, 9);
  });

  it('produces a price path and dots', () => {
    const layout = computeLineBbFisherLayout({
      data: constClose(30, 10),
    });
    expect(layout.pricePath.startsWith('M')).toBe(true);
    expect(layout.priceDots.length).toBe(30);
  });

  it('y range always includes overbought and oversold thresholds', () => {
    const layout = computeLineBbFisherLayout({
      data: constClose(30, 10),
      overbought: 1.5,
      oversold: -1.5,
    });
    expect(layout.fisherMin).toBeLessThanOrEqual(-1.5);
    expect(layout.fisherMax).toBeGreaterThanOrEqual(1.5);
  });

  it('zeroLineY is between fisherTop and fisherBottom', () => {
    const layout = computeLineBbFisherLayout({
      data: constClose(30, 10),
    });
    expect(layout.zeroLineY).toBeGreaterThanOrEqual(layout.fisherTop);
    expect(layout.zeroLineY).toBeLessThanOrEqual(layout.fisherBottom);
  });

  it('handles a single point gracefully', () => {
    const layout = computeLineBbFisherLayout({
      data: [{ x: 0, close: 10 }],
    });
    expect(layout.ok).toBe(false);
  });
});

describe('describeLineBbFisherChart', () => {
  it('returns No data for empty input', () => {
    expect(describeLineBbFisherChart([])).toBe('No data');
  });

  it('mentions Fisher Transform', () => {
    const desc = describeLineBbFisherChart(constClose(30, 10));
    expect(desc).toContain('Fisher Transform');
  });

  it('reports parameters', () => {
    const desc = describeLineBbFisherChart(constClose(30, 10), {
      length: 7,
      sigma: 1,
      clampLimit: 0.9,
      overbought: 2,
      oversold: -2,
    });
    expect(desc).toContain('length 7');
    expect(desc).toContain('sigma 1');
    expect(desc).toContain('clampLimit 0.9');
    expect(desc).toContain('overbought 2');
    expect(desc).toContain('oversold -2');
  });
});

describe('<ChartLineBbFisher />', () => {
  it('renders an empty placeholder for no data', () => {
    const { container } = render(<ChartLineBbFisher data={[]} />);
    const placeholder = container.querySelector(
      '[data-section="chart-line-bb-fisher-empty"]',
    );
    expect(placeholder?.textContent).toBe('No data');
  });

  it('renders region role with aria-label', () => {
    const { container } = render(
      <ChartLineBbFisher data={constClose(30, 10)} />,
    );
    const region = container.querySelector('[role="region"]');
    expect(region).toBeTruthy();
    expect(region?.getAttribute('aria-label')).toContain(
      'BB Fisher Transform',
    );
  });

  it('forwards ref', () => {
    const ref = createRef<HTMLDivElement>();
    render(<ChartLineBbFisher data={constClose(30, 10)} ref={ref} />);
    expect(ref.current).not.toBe(null);
  });

  it('exposes data-length and data-sigma', () => {
    const { container } = render(
      <ChartLineBbFisher
        data={constClose(30, 10)}
        length={7}
        sigma={1}
      />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-bb-fisher"]',
    );
    expect(root?.getAttribute('data-length')).toBe('7');
    expect(root?.getAttribute('data-sigma')).toBe('1');
  });

  it('exposes total-points', () => {
    const { container } = render(
      <ChartLineBbFisher data={constClose(30, 10)} />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-bb-fisher"]',
    );
    expect(root?.getAttribute('data-total-points')).toBe('30');
  });

  it('renders the screen-reader description', () => {
    const { container } = render(
      <ChartLineBbFisher data={constClose(30, 10)} />,
    );
    const desc = container.querySelector(
      '[data-section="chart-line-bb-fisher-aria-desc"]',
    );
    expect(desc?.textContent).toContain('Fisher Transform');
  });

  it('renders both legend items', () => {
    const { container } = render(
      <ChartLineBbFisher data={constClose(30, 10)} />,
    );
    expect(container.querySelector('[data-series-id="price"]')).toBeTruthy();
    expect(container.querySelector('[data-series-id="fisher"]')).toBeTruthy();
  });

  it('toggles a series via the legend', () => {
    const onToggle = vi.fn();
    const { container } = render(
      <ChartLineBbFisher
        data={constClose(30, 10)}
        onSeriesToggle={onToggle}
      />,
    );
    const button = container.querySelector(
      '[data-series-id="fisher"]',
    ) as HTMLButtonElement | null;
    if (button) fireEvent.click(button);
    expect(onToggle).toHaveBeenCalledWith({
      seriesId: 'fisher',
      hidden: true,
    });
  });

  it('hides fisher when controlled hidden', () => {
    const { container } = render(
      <ChartLineBbFisher
        data={constClose(30, 10)}
        hiddenSeries={['fisher']}
      />,
    );
    expect(
      container.querySelector('[data-section="chart-line-bb-fisher-line"]'),
    ).toBe(null);
  });

  it('renders the config badge by default', () => {
    const { container } = render(
      <ChartLineBbFisher data={constClose(30, 10)} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-bb-fisher-badge"]',
      ),
    ).toBeTruthy();
  });

  it('renders overbought and oversold thresholds', () => {
    const { container } = render(
      <ChartLineBbFisher data={constClose(30, 10)} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-bb-fisher-overbought-line"]',
      ),
    ).toBeTruthy();
    expect(
      container.querySelector(
        '[data-section="chart-line-bb-fisher-oversold-line"]',
      ),
    ).toBeTruthy();
  });

  it('hides thresholds when showThresholds is false', () => {
    const { container } = render(
      <ChartLineBbFisher
        data={constClose(30, 10)}
        showThresholds={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-bb-fisher-overbought-line"]',
      ),
    ).toBe(null);
  });

  it('renders zero line by default', () => {
    const { container } = render(
      <ChartLineBbFisher data={constClose(30, 10)} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-bb-fisher-zero-line"]',
      ),
    ).toBeTruthy();
  });

  it('hides zero line when showZeroLine is false', () => {
    const { container } = render(
      <ChartLineBbFisher
        data={constClose(30, 10)}
        showZeroLine={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-bb-fisher-zero-line"]',
      ),
    ).toBe(null);
  });

  it('hides axis when showAxis is false', () => {
    const { container } = render(
      <ChartLineBbFisher data={constClose(30, 10)} showAxis={false} />,
    );
    expect(
      container.querySelector('[data-section="chart-line-bb-fisher-axes"]'),
    ).toBe(null);
  });

  it('hides grid when showGrid is false', () => {
    const { container } = render(
      <ChartLineBbFisher data={constClose(30, 10)} showGrid={false} />,
    );
    expect(
      container.querySelector('[data-section="chart-line-bb-fisher-grid"]'),
    ).toBe(null);
  });

  it('hides markers when showMarkers is false', () => {
    const { container } = render(
      <ChartLineBbFisher data={constClose(30, 10)} showMarkers={false} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-bb-fisher-markers"]',
      ),
    ).toBe(null);
  });

  it('hides legend when showLegend is false', () => {
    const { container } = render(
      <ChartLineBbFisher data={constClose(30, 10)} showLegend={false} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-bb-fisher-legend"]',
      ),
    ).toBe(null);
  });

  it('applies className and style', () => {
    const { container } = render(
      <ChartLineBbFisher
        data={constClose(30, 10)}
        className="custom-class"
        style={{ background: 'red' }}
      />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-bb-fisher"]',
    );
    expect(root?.classList.contains('custom-class')).toBe(true);
    expect((root as HTMLElement | null)?.style.background).toBe('red');
  });

  it('animate=false disables fade-in class', () => {
    const { container } = render(
      <ChartLineBbFisher data={constClose(30, 10)} animate={false} />,
    );
    const svg = container.querySelector(
      '[data-section="chart-line-bb-fisher-svg"]',
    );
    expect(svg?.classList.contains('motion-safe:animate-fade-in')).toBe(false);
  });

  it('renders the fisher line by default', () => {
    const { container } = render(
      <ChartLineBbFisher data={constClose(30, 10)} />,
    );
    expect(
      container.querySelector('[data-section="chart-line-bb-fisher-line"]'),
    ).toBeTruthy();
  });

  it('renders the price path', () => {
    const { container } = render(
      <ChartLineBbFisher data={constClose(30, 10)} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-bb-fisher-price-path"]',
      ),
    ).toBeTruthy();
  });

  it('respects defaultHiddenSeries on uncontrolled mount', () => {
    const { container } = render(
      <ChartLineBbFisher
        data={constClose(30, 10)}
        defaultHiddenSeries={['fisher']}
      />,
    );
    expect(
      container.querySelector('[data-section="chart-line-bb-fisher-line"]'),
    ).toBe(null);
  });
});

describe('BB Fisher integration', () => {
  it('CONST close yields fisher = null across (K, length)', () => {
    for (const K of [1, 5, 100, -3]) {
      for (const L of [3, 4, 7, 10]) {
        const ch = computeLineBbFisher(Array(L + 5).fill(K), {
          length: L,
        });
        for (let i = L - 1; i < L + 5; i += 1) {
          expect(ch.fisher[i]).toBe(null);
        }
      }
    }
  });

  it('ALTERNATING [0,1,...] length=4 sigma=2: pipeline bit-exact', () => {
    const closes = alternating(8).map((p) => p.close);
    const ch = computeLineBbFisher(closes, { length: 4, sigma: 2 });
    // bar 3: percentB = 0.75, normalized = 0.5, fisher = atanh(0.5).
    expect(ch.percentB[3]).toBe(0.75);
    expect(ch.normalized[3]).toBe(0.5);
    expect(ch.fisher[3]).toBe(Math.atanh(0.5));
    // bar 4: close=0, window=[1,0,1,0]: mean=0.5, percentB=0.25,
    // normalized=-0.5, fisher = atanh(-0.5).
    expect(ch.percentB[4]).toBe(0.25);
    expect(ch.normalized[4]).toBe(-0.5);
    expect(ch.fisher[4]).toBe(Math.atanh(-0.5));
  });
});
