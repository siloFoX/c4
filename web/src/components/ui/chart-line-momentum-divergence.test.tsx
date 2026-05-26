import { describe, expect, it, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { createRef } from 'react';
import {
  ChartLineMomentumDivergence,
  applyLineMomentumDivergenceMomentum,
  applyLineMomentumDivergenceROC,
  classifyLineMomentumDivergenceZone,
  computeLineMomentumDivergence,
  computeLineMomentumDivergenceLayout,
  describeLineMomentumDivergenceChart,
  detectLineMomentumDivergenceCrosses,
  getLineMomentumDivergenceFinitePoints,
  normalizeLineMomentumDivergenceLength,
  runLineMomentumDivergence,
  DEFAULT_CHART_LINE_MOMENTUM_DIVERGENCE_LENGTH,
} from './chart-line-momentum-divergence';
import type { ChartLineMomentumDivergencePoint } from './chart-line-momentum-divergence';

const constClose = (
  count: number,
  K: number,
): ChartLineMomentumDivergencePoint[] =>
  Array.from({ length: count }, (_, i) => ({ x: i, close: K }));

const geometric = (count: number): ChartLineMomentumDivergencePoint[] =>
  Array.from({ length: count }, (_, i) => ({ x: i, close: Math.pow(2, i) }));

describe('getLineMomentumDivergenceFinitePoints', () => {
  it('returns an empty array for null', () => {
    expect(getLineMomentumDivergenceFinitePoints(null)).toEqual([]);
  });

  it('returns an empty array for undefined', () => {
    expect(getLineMomentumDivergenceFinitePoints(undefined)).toEqual([]);
  });

  it('drops non-finite x', () => {
    const result = getLineMomentumDivergenceFinitePoints([
      { x: 1, close: 10 },
      { x: Number.NaN, close: 10 },
    ]);
    expect(result.length).toBe(1);
  });

  it('drops non-finite close', () => {
    const result = getLineMomentumDivergenceFinitePoints([
      { x: 0, close: Number.NaN },
      { x: 1, close: 10 },
    ]);
    expect(result.length).toBe(1);
  });

  it('drops null entries', () => {
    const result = getLineMomentumDivergenceFinitePoints([
      null as unknown as ChartLineMomentumDivergencePoint,
      { x: 1, close: 10 },
    ]);
    expect(result.length).toBe(1);
  });
});

describe('normalizeLineMomentumDivergenceLength', () => {
  it('returns the default when undefined', () => {
    expect(normalizeLineMomentumDivergenceLength(undefined, 14)).toBe(14);
  });

  it('floors fractional lengths', () => {
    expect(normalizeLineMomentumDivergenceLength(7.9, 14)).toBe(7);
  });

  it('accepts 1', () => {
    expect(normalizeLineMomentumDivergenceLength(1, 14)).toBe(1);
  });

  it('rejects zero', () => {
    expect(normalizeLineMomentumDivergenceLength(0, 14)).toBe(14);
  });

  it('rejects negative', () => {
    expect(normalizeLineMomentumDivergenceLength(-1, 14)).toBe(14);
  });
});

describe('applyLineMomentumDivergenceROC', () => {
  it('warmup region is null', () => {
    const out = applyLineMomentumDivergenceROC([1, 2, 3, 4, 5], 3);
    expect(out[0]).toBe(null);
    expect(out[1]).toBe(null);
    expect(out[2]).toBe(null);
    expect(out[3]).not.toBe(null);
  });

  it('CONST close yields ROC = 0 bit-exact', () => {
    for (const K of [1, 5, 100, -3]) {
      const closes = Array(10).fill(K);
      const out = applyLineMomentumDivergenceROC(closes, 4);
      for (let i = 4; i < 10; i += 1) {
        expect(out[i]).toBe(0);
      }
    }
  });

  it('ZERO close yields null everywhere', () => {
    const closes = Array(10).fill(0);
    const out = applyLineMomentumDivergenceROC(closes, 4);
    for (let i = 0; i < 10; i += 1) {
      expect(out[i]).toBe(null);
    }
  });

  it('GEOMETRIC close=2^k yields ROC = (2^L - 1) * 100 bit-exact', () => {
    const N = 20;
    const closes = Array.from({ length: N }, (_, i) => Math.pow(2, i));
    for (const L of [2, 4, 8, 14]) {
      const out = applyLineMomentumDivergenceROC(closes, L);
      const expected = (Math.pow(2, L) - 1) * 100;
      for (let i = L; i < N; i += 1) {
        expect(out[i]).toBe(expected);
      }
    }
  });
});

describe('applyLineMomentumDivergenceMomentum', () => {
  it('warmup region is null', () => {
    const out = applyLineMomentumDivergenceMomentum([1, 2, 3, 4, 5], 3);
    expect(out[0]).toBe(null);
    expect(out[1]).toBe(null);
    expect(out[2]).toBe(null);
    expect(out[3]).toBe(3);
  });

  it('CONST close yields momentum = 0 bit-exact', () => {
    for (const K of [1, 5, 100, -3]) {
      const closes = Array(10).fill(K);
      const out = applyLineMomentumDivergenceMomentum(closes, 4);
      for (let i = 4; i < 10; i += 1) {
        expect(out[i]).toBe(0);
      }
    }
  });

  it('LINEAR close=k yields momentum = L', () => {
    const closes = Array.from({ length: 10 }, (_, i) => i);
    const out = applyLineMomentumDivergenceMomentum(closes, 4);
    for (let i = 4; i < 10; i += 1) {
      expect(out[i]).toBe(4);
    }
  });

  it('returns null for non-finite past close', () => {
    const closes: Array<number | null> = [Number.NaN, 2, 3, 4, 5];
    const out = applyLineMomentumDivergenceMomentum(closes, 4);
    expect(out[4]).toBe(null);
  });
});

describe('computeLineMomentumDivergence', () => {
  it('returns empty for null', () => {
    const ch = computeLineMomentumDivergence(null);
    expect(ch.divergence).toEqual([]);
  });

  it('returns empty for empty input', () => {
    const ch = computeLineMomentumDivergence([]);
    expect(ch.divergence).toEqual([]);
  });

  it('CONST close yields divergence = 0 at every valid bar (bit-exact)', () => {
    for (const K of [1, 5, 100, -3]) {
      const closes = Array(15).fill(K);
      const ch = computeLineMomentumDivergence(closes, { length: 4 });
      for (let i = 4; i < 15; i += 1) {
        expect(ch.divergence[i]).toBe(0);
      }
    }
  });

  it('ZERO close yields divergence = null everywhere', () => {
    const closes = Array(15).fill(0);
    const ch = computeLineMomentumDivergence(closes, { length: 4 });
    for (let i = 0; i < 15; i += 1) {
      expect(ch.divergence[i]).toBe(null);
    }
  });

  it('GEOMETRIC close=2^k length=4: divergence at i=4 is 1500 - 15 = 1485', () => {
    const closes = Array.from({ length: 10 }, (_, i) => Math.pow(2, i));
    const ch = computeLineMomentumDivergence(closes, { length: 4 });
    // ROC(L=4) = (2^4 - 1) * 100 = 1500
    // momentum at i=4: close[4] - close[0] = 16 - 1 = 15
    // divergence = 1500 - 15 = 1485
    expect(ch.divergence[4]).toBe(1485);
  });

  it('GEOMETRIC close=2^k length=4: divergence at i=5 is 1500 - 30 = 1470', () => {
    const closes = Array.from({ length: 10 }, (_, i) => Math.pow(2, i));
    const ch = computeLineMomentumDivergence(closes, { length: 4 });
    // momentum at i=5: close[5] - close[1] = 32 - 2 = 30
    // divergence = 1500 - 30 = 1470
    expect(ch.divergence[5]).toBe(1470);
  });

  it('output length matches input length', () => {
    const closes = Array(15).fill(10);
    const ch = computeLineMomentumDivergence(closes, { length: 4 });
    expect(ch.divergence.length).toBe(15);
    expect(ch.roc.length).toBe(15);
    expect(ch.momentum.length).toBe(15);
  });

  it('does not mutate input', () => {
    const closes = Array.from({ length: 15 }, (_, i) => i + 1);
    const snap = closes.slice();
    computeLineMomentumDivergence(closes, { length: 4 });
    expect(closes).toEqual(snap);
  });
});

describe('classifyLineMomentumDivergenceZone', () => {
  it('classifies positive', () => {
    expect(classifyLineMomentumDivergenceZone(2)).toBe('positive');
  });

  it('classifies negative', () => {
    expect(classifyLineMomentumDivergenceZone(-2)).toBe('negative');
  });

  it('classifies zero', () => {
    expect(classifyLineMomentumDivergenceZone(0)).toBe('zero');
  });

  it('returns none for null', () => {
    expect(classifyLineMomentumDivergenceZone(null)).toBe('none');
  });

  it('returns none for NaN', () => {
    expect(classifyLineMomentumDivergenceZone(Number.NaN)).toBe('none');
  });
});

describe('detectLineMomentumDivergenceCrosses', () => {
  it('returns [null, null] for warmup-only data', () => {
    expect(detectLineMomentumDivergenceCrosses([null, null])).toEqual([
      null,
      null,
    ]);
  });

  it('flags up when prev <= 0 and current > 0', () => {
    const crosses = detectLineMomentumDivergenceCrosses([null, -1, 1]);
    expect(crosses[2]).toBe('up');
  });

  it('flags down when prev >= 0 and current < 0', () => {
    const crosses = detectLineMomentumDivergenceCrosses([null, 1, -1]);
    expect(crosses[2]).toBe('down');
  });

  it('flags up from zero', () => {
    const crosses = detectLineMomentumDivergenceCrosses([null, 0, 1]);
    expect(crosses[2]).toBe('up');
  });

  it('flags down from zero', () => {
    const crosses = detectLineMomentumDivergenceCrosses([null, 0, -1]);
    expect(crosses[2]).toBe('down');
  });

  it('no cross when both positive', () => {
    const crosses = detectLineMomentumDivergenceCrosses([null, 1, 2]);
    expect(crosses[2]).toBe(null);
  });

  it('no cross when both negative', () => {
    const crosses = detectLineMomentumDivergenceCrosses([null, -1, -2]);
    expect(crosses[2]).toBe(null);
  });

  it('detects multiple crosses', () => {
    const crosses = detectLineMomentumDivergenceCrosses([null, 1, -1, 1]);
    expect(crosses[2]).toBe('down');
    expect(crosses[3]).toBe('up');
  });

  it('first defined bar is not a cross', () => {
    const crosses = detectLineMomentumDivergenceCrosses([null, 1]);
    expect(crosses[1]).toBe(null);
  });
});

describe('runLineMomentumDivergence', () => {
  it('marks ok=false when data is too short', () => {
    const run = runLineMomentumDivergence(constClose(4, 10), { length: 4 });
    expect(run.ok).toBe(false);
  });

  it('marks ok=true with length + 1 points', () => {
    const run = runLineMomentumDivergence(constClose(5, 10), { length: 4 });
    expect(run.ok).toBe(true);
  });

  it('uses the default length', () => {
    const run = runLineMomentumDivergence(constClose(30, 10));
    expect(run.length).toBe(DEFAULT_CHART_LINE_MOMENTUM_DIVERGENCE_LENGTH);
  });

  it('respects explicit length', () => {
    const run = runLineMomentumDivergence(constClose(30, 10), { length: 7 });
    expect(run.length).toBe(7);
  });

  it('sorts by x', () => {
    const data: ChartLineMomentumDivergencePoint[] = [
      { x: 2, close: 10 },
      { x: 0, close: 10 },
      { x: 1, close: 10 },
    ];
    const run = runLineMomentumDivergence(data, { length: 2 });
    expect(run.samples.map((s) => s.x)).toEqual([0, 1, 2]);
  });

  it('CONST close classifies post-warmup as zero zone', () => {
    const run = runLineMomentumDivergence(constClose(10, 10), { length: 4 });
    expect(run.zeroCount).toBeGreaterThan(0);
    expect(run.positiveCount).toBe(0);
    expect(run.negativeCount).toBe(0);
  });

  it('GEOMETRIC close gives positive divergence near warmup boundary', () => {
    const run = runLineMomentumDivergence(geometric(10), { length: 4 });
    expect(run.positiveCount).toBeGreaterThan(0);
  });
});

describe('computeLineMomentumDivergenceLayout', () => {
  it('returns ok=false for empty data', () => {
    const layout = computeLineMomentumDivergenceLayout({ data: [] });
    expect(layout.ok).toBe(false);
  });

  it('returns ok=true for sufficient data', () => {
    const layout = computeLineMomentumDivergenceLayout({
      data: constClose(30, 10),
    });
    expect(layout.ok).toBe(true);
  });

  it('uses the explicit width and height', () => {
    const layout = computeLineMomentumDivergenceLayout({
      data: constClose(30, 10),
      width: 600,
      height: 400,
    });
    expect(layout.width).toBe(600);
    expect(layout.height).toBe(400);
  });

  it('panels stack with price above divergence', () => {
    const layout = computeLineMomentumDivergenceLayout({
      data: constClose(30, 10),
    });
    expect(layout.priceBottom).toBeLessThan(layout.divergenceTop);
  });

  it('panel gap is respected', () => {
    const layout = computeLineMomentumDivergenceLayout({
      data: constClose(30, 10),
      panelGap: 24,
    });
    expect(layout.divergenceTop - layout.priceBottom).toBeCloseTo(24, 9);
  });

  it('produces a price path and dots', () => {
    const layout = computeLineMomentumDivergenceLayout({
      data: constClose(30, 10),
    });
    expect(layout.pricePath.startsWith('M')).toBe(true);
    expect(layout.priceDots.length).toBe(30);
  });

  it('CONST yields zero markers (no crosses)', () => {
    const layout = computeLineMomentumDivergenceLayout({
      data: constClose(30, 10),
    });
    expect(layout.markers.length).toBe(0);
  });

  it('y range always includes zero', () => {
    const layout = computeLineMomentumDivergenceLayout({
      data: geometric(10),
      length: 4,
    });
    expect(layout.divergenceMin).toBeLessThanOrEqual(0);
    expect(layout.divergenceMax).toBeGreaterThanOrEqual(0);
  });

  it('zero line y is between divergenceTop and divergenceBottom', () => {
    const layout = computeLineMomentumDivergenceLayout({
      data: constClose(30, 10),
    });
    expect(layout.zeroLineY).toBeGreaterThanOrEqual(layout.divergenceTop);
    expect(layout.zeroLineY).toBeLessThanOrEqual(layout.divergenceBottom);
  });

  it('handles a single point gracefully', () => {
    const layout = computeLineMomentumDivergenceLayout({
      data: [{ x: 0, close: 10 }],
    });
    expect(layout.ok).toBe(false);
  });
});

describe('describeLineMomentumDivergenceChart', () => {
  it('returns No data for empty input', () => {
    expect(describeLineMomentumDivergenceChart([])).toBe('No data');
  });

  it('mentions Momentum Divergence', () => {
    const desc = describeLineMomentumDivergenceChart(constClose(30, 10));
    expect(desc).toContain('Momentum Divergence');
  });

  it('mentions ROC and momentum', () => {
    const desc = describeLineMomentumDivergenceChart(constClose(30, 10));
    expect(desc).toContain('ROC');
    expect(desc).toContain('momentum');
  });

  it('reports the length', () => {
    const desc = describeLineMomentumDivergenceChart(constClose(30, 10), {
      length: 7,
    });
    expect(desc).toContain('length 7');
  });
});

describe('<ChartLineMomentumDivergence />', () => {
  it('renders an empty placeholder for no data', () => {
    const { container } = render(<ChartLineMomentumDivergence data={[]} />);
    const placeholder = container.querySelector(
      '[data-section="chart-line-momentum-divergence-empty"]',
    );
    expect(placeholder?.textContent).toBe('No data');
  });

  it('renders region role with aria-label', () => {
    const { container } = render(
      <ChartLineMomentumDivergence data={constClose(30, 10)} />,
    );
    const region = container.querySelector('[role="region"]');
    expect(region).toBeTruthy();
    expect(region?.getAttribute('aria-label')).toContain(
      'Momentum Divergence',
    );
  });

  it('forwards ref', () => {
    const ref = createRef<HTMLDivElement>();
    render(
      <ChartLineMomentumDivergence data={constClose(30, 10)} ref={ref} />,
    );
    expect(ref.current).not.toBe(null);
  });

  it('exposes data-length', () => {
    const { container } = render(
      <ChartLineMomentumDivergence data={constClose(30, 10)} length={7} />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-momentum-divergence"]',
    );
    expect(root?.getAttribute('data-length')).toBe('7');
  });

  it('exposes total-points', () => {
    const { container } = render(
      <ChartLineMomentumDivergence data={constClose(30, 10)} />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-momentum-divergence"]',
    );
    expect(root?.getAttribute('data-total-points')).toBe('30');
  });

  it('renders the screen-reader description', () => {
    const { container } = render(
      <ChartLineMomentumDivergence data={constClose(30, 10)} />,
    );
    const desc = container.querySelector(
      '[data-section="chart-line-momentum-divergence-aria-desc"]',
    );
    expect(desc?.textContent).toContain('Momentum Divergence');
  });

  it('renders both legend items', () => {
    const { container } = render(
      <ChartLineMomentumDivergence data={constClose(30, 10)} />,
    );
    expect(container.querySelector('[data-series-id="price"]')).toBeTruthy();
    expect(
      container.querySelector('[data-series-id="divergence"]'),
    ).toBeTruthy();
  });

  it('toggles a series via the legend', () => {
    const onToggle = vi.fn();
    const { container } = render(
      <ChartLineMomentumDivergence
        data={constClose(30, 10)}
        onSeriesToggle={onToggle}
      />,
    );
    const button = container.querySelector(
      '[data-series-id="divergence"]',
    ) as HTMLButtonElement | null;
    if (button) fireEvent.click(button);
    expect(onToggle).toHaveBeenCalledWith({
      seriesId: 'divergence',
      hidden: true,
    });
  });

  it('respects controlled hiddenSeries', () => {
    const { container } = render(
      <ChartLineMomentumDivergence
        data={constClose(30, 10)}
        hiddenSeries={['divergence']}
      />,
    );
    const button = container.querySelector('[data-series-id="divergence"]');
    expect(button?.getAttribute('data-hidden')).toBe('true');
  });

  it('hides divergence line when controlled hidden', () => {
    const { container } = render(
      <ChartLineMomentumDivergence
        data={constClose(30, 10)}
        hiddenSeries={['divergence']}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-momentum-divergence-line"]',
      ),
    ).toBe(null);
  });

  it('renders the config badge by default', () => {
    const { container } = render(
      <ChartLineMomentumDivergence data={constClose(30, 10)} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-momentum-divergence-badge"]',
      ),
    ).toBeTruthy();
  });

  it('hides the config badge when disabled', () => {
    const { container } = render(
      <ChartLineMomentumDivergence
        data={constClose(30, 10)}
        showConfigBadge={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-momentum-divergence-badge"]',
      ),
    ).toBe(null);
  });

  it('renders dots when showDots is true', () => {
    const { container } = render(
      <ChartLineMomentumDivergence
        data={constClose(30, 10)}
        showDots={true}
      />,
    );
    expect(
      container.querySelectorAll(
        '[data-section="chart-line-momentum-divergence-dot"]',
      ).length,
    ).toBeGreaterThan(0);
  });

  it('does not render dots by default', () => {
    const { container } = render(
      <ChartLineMomentumDivergence data={constClose(30, 10)} />,
    );
    expect(
      container.querySelectorAll(
        '[data-section="chart-line-momentum-divergence-dot"]',
      ).length,
    ).toBe(0);
  });

  it('hides axis when showAxis is false', () => {
    const { container } = render(
      <ChartLineMomentumDivergence
        data={constClose(30, 10)}
        showAxis={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-momentum-divergence-axes"]',
      ),
    ).toBe(null);
  });

  it('hides grid when showGrid is false', () => {
    const { container } = render(
      <ChartLineMomentumDivergence
        data={constClose(30, 10)}
        showGrid={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-momentum-divergence-grid"]',
      ),
    ).toBe(null);
  });

  it('renders the zero line by default', () => {
    const { container } = render(
      <ChartLineMomentumDivergence data={constClose(30, 10)} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-momentum-divergence-zero-line"]',
      ),
    ).toBeTruthy();
  });

  it('hides the zero line when showZeroLine is false', () => {
    const { container } = render(
      <ChartLineMomentumDivergence
        data={constClose(30, 10)}
        showZeroLine={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-momentum-divergence-zero-line"]',
      ),
    ).toBe(null);
  });

  it('hides markers when showMarkers is false', () => {
    const { container } = render(
      <ChartLineMomentumDivergence
        data={constClose(30, 10)}
        showMarkers={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-momentum-divergence-markers"]',
      ),
    ).toBe(null);
  });

  it('hides legend when showLegend is false', () => {
    const { container } = render(
      <ChartLineMomentumDivergence
        data={constClose(30, 10)}
        showLegend={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-momentum-divergence-legend"]',
      ),
    ).toBe(null);
  });

  it('applies className and style', () => {
    const { container } = render(
      <ChartLineMomentumDivergence
        data={constClose(30, 10)}
        className="custom-class"
        style={{ background: 'red' }}
      />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-momentum-divergence"]',
    );
    expect(root?.classList.contains('custom-class')).toBe(true);
    expect((root as HTMLElement | null)?.style.background).toBe('red');
  });

  it('animate=false disables fade-in class', () => {
    const { container } = render(
      <ChartLineMomentumDivergence
        data={constClose(30, 10)}
        animate={false}
      />,
    );
    const svg = container.querySelector(
      '[data-section="chart-line-momentum-divergence-svg"]',
    );
    expect(svg?.classList.contains('motion-safe:animate-fade-in')).toBe(false);
  });

  it('renders the divergence line by default', () => {
    const { container } = render(
      <ChartLineMomentumDivergence data={constClose(30, 10)} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-momentum-divergence-line"]',
      ),
    ).toBeTruthy();
  });

  it('renders the price path', () => {
    const { container } = render(
      <ChartLineMomentumDivergence data={constClose(30, 10)} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-momentum-divergence-price-path"]',
      ),
    ).toBeTruthy();
  });

  it('respects defaultHiddenSeries on uncontrolled mount', () => {
    const { container } = render(
      <ChartLineMomentumDivergence
        data={constClose(30, 10)}
        defaultHiddenSeries={['divergence']}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-momentum-divergence-line"]',
      ),
    ).toBe(null);
  });
});

describe('Momentum Divergence integration', () => {
  it('CONST close yields divergence = 0 across (K, length)', () => {
    for (const K of [1, 5, 100, -3]) {
      for (const L of [3, 4, 7, 10]) {
        const closes = Array(L + 5).fill(K);
        const ch = computeLineMomentumDivergence(closes, { length: L });
        for (let i = L; i < closes.length; i += 1) {
          expect(ch.divergence[i]).toBe(0);
        }
      }
    }
  });

  it('ZERO close yields divergence = null across the lookback', () => {
    const closes = Array(20).fill(0);
    const ch = computeLineMomentumDivergence(closes, { length: 4 });
    for (let i = 0; i < 20; i += 1) {
      expect(ch.divergence[i]).toBe(null);
    }
  });
});
