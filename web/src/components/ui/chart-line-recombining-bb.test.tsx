import { describe, expect, it, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { createRef } from 'react';
import {
  ChartLineRecombiningBb,
  applyLineRecombiningBbSma,
  applyLineRecombiningBbStdDev,
  classifyLineRecombiningBbZone,
  computeLineRecombiningBb,
  computeLineRecombiningBbLayout,
  describeLineRecombiningBbChart,
  getLineRecombiningBbFinitePoints,
  normalizeLineRecombiningBbLength,
  normalizeLineRecombiningBbSigma,
  runLineRecombiningBb,
  DEFAULT_CHART_LINE_RECOMBINING_BB_LENGTH,
  DEFAULT_CHART_LINE_RECOMBINING_BB_SIGMA_SCALE,
} from './chart-line-recombining-bb';
import type { ChartLineRecombiningBbPoint } from './chart-line-recombining-bb';

const constClose = (
  count: number,
  K: number,
): ChartLineRecombiningBbPoint[] =>
  Array.from({ length: count }, (_, i) => ({ x: i, close: K }));

const alternating = (count: number): ChartLineRecombiningBbPoint[] =>
  Array.from({ length: count }, (_, i) => ({
    x: i,
    close: i % 2 === 0 ? 0 : 1,
  }));

describe('getLineRecombiningBbFinitePoints', () => {
  it('returns an empty array for null', () => {
    expect(getLineRecombiningBbFinitePoints(null)).toEqual([]);
  });

  it('returns an empty array for undefined', () => {
    expect(getLineRecombiningBbFinitePoints(undefined)).toEqual([]);
  });

  it('drops non-finite x', () => {
    const result = getLineRecombiningBbFinitePoints([
      { x: 1, close: 10 },
      { x: Number.NaN, close: 10 },
    ]);
    expect(result.length).toBe(1);
  });

  it('drops non-finite close', () => {
    const result = getLineRecombiningBbFinitePoints([
      { x: 0, close: Number.NaN },
      { x: 1, close: 10 },
    ]);
    expect(result.length).toBe(1);
  });

  it('drops null entries', () => {
    const result = getLineRecombiningBbFinitePoints([
      null as unknown as ChartLineRecombiningBbPoint,
      { x: 1, close: 10 },
    ]);
    expect(result.length).toBe(1);
  });
});

describe('normalizeLineRecombiningBbLength', () => {
  it('returns the default when undefined', () => {
    expect(normalizeLineRecombiningBbLength(undefined, 20)).toBe(20);
  });

  it('floors fractional lengths', () => {
    expect(normalizeLineRecombiningBbLength(7.9, 20)).toBe(7);
  });

  it('rejects length below 2', () => {
    expect(normalizeLineRecombiningBbLength(1, 20)).toBe(20);
  });
});

describe('normalizeLineRecombiningBbSigma', () => {
  it('returns the default when undefined', () => {
    expect(normalizeLineRecombiningBbSigma(undefined, 2)).toBe(2);
  });

  it('accepts zero', () => {
    expect(normalizeLineRecombiningBbSigma(0, 2)).toBe(0);
  });

  it('accepts positive', () => {
    expect(normalizeLineRecombiningBbSigma(2.5, 2)).toBe(2.5);
  });

  it('rejects negative', () => {
    expect(normalizeLineRecombiningBbSigma(-1, 2)).toBe(2);
  });
});

describe('applyLineRecombiningBbSma', () => {
  it('CONST K SMA is K bit-exact', () => {
    for (const K of [0, 1, 5, 100, -3]) {
      const out = applyLineRecombiningBbSma(Array(10).fill(K), 4);
      for (let i = 3; i < 10; i += 1) {
        expect(out[i]).toBe(K);
      }
    }
  });

  it('warmup region is null', () => {
    const out = applyLineRecombiningBbSma([1, 2, 3, 4, 5], 3);
    expect(out[0]).toBe(null);
    expect(out[1]).toBe(null);
    expect(out[2]).toBe(2);
  });
});

describe('applyLineRecombiningBbStdDev', () => {
  it('CONST K stdDev is 0 bit-exact', () => {
    for (const K of [1, 5, 100, -3]) {
      const values = Array(10).fill(K);
      const means = applyLineRecombiningBbSma(values, 4);
      const out = applyLineRecombiningBbStdDev(values, means, 4);
      for (let i = 3; i < 10; i += 1) {
        expect(out[i]).toBe(0);
      }
    }
  });

  it('ALTERNATING [0,1,0,1] length=4 stdDev = 0.5 bit-exact', () => {
    const values = [0, 1, 0, 1];
    const means = applyLineRecombiningBbSma(values, 4);
    const out = applyLineRecombiningBbStdDev(values, means, 4);
    expect(out[3]).toBe(0.5);
  });
});

describe('computeLineRecombiningBb', () => {
  it('returns empty for null', () => {
    const ch = computeLineRecombiningBb(null);
    expect(ch.upper).toEqual([]);
  });

  it('returns empty for empty input', () => {
    const ch = computeLineRecombiningBb([]);
    expect(ch.upper).toEqual([]);
  });

  it('CONST close=K: mean=upper=lower=K and recombine=true (bit-exact)', () => {
    for (const K of [0, 1, 5, 100, -3]) {
      const closes = Array(10).fill(K);
      const ch = computeLineRecombiningBb(closes, { length: 4 });
      for (let i = 3; i < 10; i += 1) {
        expect(ch.mean[i]).toBe(K);
        // recombine fires because close >= fullUpper (both are K).
        expect(ch.recombine[i]).toBe(true);
        // upper and lower collapse to mean.
        expect(ch.upper[i]).toBe(K);
        expect(ch.lower[i]).toBe(K);
      }
    }
  });

  it('ALTERNATING [0,1,0,1] length=4 sigma=2: upper=1.5, lower=-0.5 (bit-exact)', () => {
    const closes = alternating(4).map((p) => p.close);
    const ch = computeLineRecombiningBb(closes, {
      length: 4,
      sigmaScale: 2,
    });
    // mean = 0.5, stdDev = 0.5, fullUpper = 1.5, fullLower = -0.5.
    // close = 1: 1 >= 1.5? No. 1 <= -0.5? No. recombine = false.
    expect(ch.mean[3]).toBe(0.5);
    expect(ch.stdDev[3]).toBe(0.5);
    expect(ch.fullUpper[3]).toBe(1.5);
    expect(ch.fullLower[3]).toBe(-0.5);
    expect(ch.recombine[3]).toBe(false);
    expect(ch.upper[3]).toBe(1.5);
    expect(ch.lower[3]).toBe(-0.5);
  });

  it('sigma=0 forces recombine on every non-mean close', () => {
    // With sigma=0, fullUpper=fullLower=mean. Any close != mean
    // triggers recombine via >= or <= equality.
    const closes = [1, 2, 3, 4, 5];
    const ch = computeLineRecombiningBb(closes, {
      length: 4,
      sigmaScale: 0,
    });
    for (let i = 3; i < 5; i += 1) {
      expect(ch.recombine[i]).toBe(true);
    }
  });

  it('warmup region is null', () => {
    const closes = Array(10).fill(5);
    const ch = computeLineRecombiningBb(closes, { length: 4 });
    expect(ch.mean[0]).toBe(null);
    expect(ch.upper[0]).toBe(null);
    expect(ch.recombine[0]).toBe(false);
  });

  it('output length matches input length', () => {
    const closes = Array(10).fill(5);
    const ch = computeLineRecombiningBb(closes, { length: 4 });
    expect(ch.mean.length).toBe(10);
    expect(ch.upper.length).toBe(10);
    expect(ch.lower.length).toBe(10);
    expect(ch.recombine.length).toBe(10);
  });

  it('does not mutate input', () => {
    const closes = [1, 2, 3, 4, 5, 6, 7, 8];
    const snap = closes.slice();
    computeLineRecombiningBb(closes, { length: 4 });
    expect(closes).toEqual(snap);
  });
});

describe('classifyLineRecombiningBbZone', () => {
  it('classifies recombine first', () => {
    expect(classifyLineRecombiningBbZone(5, 5, true)).toBe('recombine');
  });

  it('classifies above-mid', () => {
    expect(classifyLineRecombiningBbZone(7, 5, false)).toBe('above-mid');
  });

  it('classifies below-mid', () => {
    expect(classifyLineRecombiningBbZone(3, 5, false)).toBe('below-mid');
  });

  it('classifies at-mid', () => {
    expect(classifyLineRecombiningBbZone(5, 5, false)).toBe('at-mid');
  });

  it('returns none for null mean', () => {
    expect(classifyLineRecombiningBbZone(5, null, false)).toBe('none');
  });
});

describe('runLineRecombiningBb', () => {
  it('marks ok=false for fewer than length points', () => {
    const run = runLineRecombiningBb(constClose(3, 10), { length: 4 });
    expect(run.ok).toBe(false);
  });

  it('marks ok=true with length points', () => {
    const run = runLineRecombiningBb(constClose(4, 10), { length: 4 });
    expect(run.ok).toBe(true);
  });

  it('uses default length and sigma', () => {
    const run = runLineRecombiningBb(constClose(30, 10));
    expect(run.length).toBe(DEFAULT_CHART_LINE_RECOMBINING_BB_LENGTH);
    expect(run.sigmaScale).toBe(DEFAULT_CHART_LINE_RECOMBINING_BB_SIGMA_SCALE);
  });

  it('respects explicit options', () => {
    const run = runLineRecombiningBb(constClose(30, 10), {
      length: 7,
      sigmaScale: 3,
    });
    expect(run.length).toBe(7);
    expect(run.sigmaScale).toBe(3);
  });

  it('sorts by x', () => {
    const data: ChartLineRecombiningBbPoint[] = [
      { x: 2, close: 10 },
      { x: 0, close: 10 },
      { x: 1, close: 10 },
    ];
    const run = runLineRecombiningBb(data, { length: 2 });
    expect(run.samples.map((s) => s.x)).toEqual([0, 1, 2]);
  });

  it('CONST close fires recombine every valid bar', () => {
    const run = runLineRecombiningBb(constClose(10, 10), { length: 4 });
    expect(run.recombineCount).toBe(7);
  });

  it('ALTERNATING with sigma=2 length=4 yields no recombine bars', () => {
    const run = runLineRecombiningBb(alternating(10), {
      length: 4,
      sigmaScale: 2,
    });
    expect(run.recombineCount).toBe(0);
  });
});

describe('computeLineRecombiningBbLayout', () => {
  it('returns ok=false for empty data', () => {
    const layout = computeLineRecombiningBbLayout({ data: [] });
    expect(layout.ok).toBe(false);
  });

  it('returns ok=true for sufficient data', () => {
    const layout = computeLineRecombiningBbLayout({
      data: constClose(30, 10),
    });
    expect(layout.ok).toBe(true);
  });

  it('uses the explicit width and height', () => {
    const layout = computeLineRecombiningBbLayout({
      data: constClose(30, 10),
      width: 600,
      height: 400,
    });
    expect(layout.width).toBe(600);
    expect(layout.height).toBe(400);
  });

  it('produces a price path and dots', () => {
    const layout = computeLineRecombiningBbLayout({
      data: constClose(30, 10),
    });
    expect(layout.pricePath.startsWith('M')).toBe(true);
    expect(layout.priceDots.length).toBe(30);
  });

  it('produces upper, lower, and mean paths', () => {
    const layout = computeLineRecombiningBbLayout({
      data: alternating(30),
      length: 4,
    });
    expect(layout.upperPath.startsWith('M')).toBe(true);
    expect(layout.lowerPath.startsWith('M')).toBe(true);
    expect(layout.meanPath.startsWith('M')).toBe(true);
  });

  it('CONST close yields recombine markers on every valid bar', () => {
    const layout = computeLineRecombiningBbLayout({
      data: constClose(30, 10),
      length: 4,
    });
    expect(layout.markers.length).toBe(27);
  });

  it('ALTERNATING with sigma=2 yields zero markers', () => {
    const layout = computeLineRecombiningBbLayout({
      data: alternating(30),
      length: 4,
      sigmaScale: 2,
    });
    expect(layout.markers.length).toBe(0);
  });

  it('y range covers close, upper, and lower', () => {
    const layout = computeLineRecombiningBbLayout({
      data: alternating(30),
      length: 4,
      sigmaScale: 2,
    });
    expect(layout.yMin).toBeLessThanOrEqual(-0.5);
    expect(layout.yMax).toBeGreaterThanOrEqual(1.5);
  });

  it('handles a single point gracefully', () => {
    const layout = computeLineRecombiningBbLayout({
      data: [{ x: 0, close: 10 }],
      length: 2,
    });
    expect(layout.ok).toBe(false);
  });
});

describe('describeLineRecombiningBbChart', () => {
  it('returns No data for empty input', () => {
    expect(describeLineRecombiningBbChart([])).toBe('No data');
  });

  it('mentions recombining Bollinger Band', () => {
    const desc = describeLineRecombiningBbChart(constClose(30, 10));
    expect(desc).toContain('recombining Bollinger Band');
  });

  it('reports the parameters', () => {
    const desc = describeLineRecombiningBbChart(constClose(30, 10), {
      length: 7,
      sigmaScale: 3,
    });
    expect(desc).toContain('length 7');
    expect(desc).toContain('sigmaScale 3');
  });
});

describe('<ChartLineRecombiningBb />', () => {
  it('renders an empty placeholder for no data', () => {
    const { container } = render(<ChartLineRecombiningBb data={[]} />);
    const placeholder = container.querySelector(
      '[data-section="chart-line-recombining-bb-empty"]',
    );
    expect(placeholder?.textContent).toBe('No data');
  });

  it('renders region role with aria-label', () => {
    const { container } = render(
      <ChartLineRecombiningBb data={constClose(30, 10)} length={5} />,
    );
    const region = container.querySelector('[role="region"]');
    expect(region).toBeTruthy();
    expect(region?.getAttribute('aria-label')).toContain(
      'Recombining Bollinger Band',
    );
  });

  it('forwards ref', () => {
    const ref = createRef<HTMLDivElement>();
    render(
      <ChartLineRecombiningBb
        data={constClose(30, 10)}
        length={5}
        ref={ref}
      />,
    );
    expect(ref.current).not.toBe(null);
  });

  it('exposes data-length and data-sigma-scale', () => {
    const { container } = render(
      <ChartLineRecombiningBb
        data={constClose(30, 10)}
        length={7}
        sigmaScale={3}
      />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-recombining-bb"]',
    );
    expect(root?.getAttribute('data-length')).toBe('7');
    expect(root?.getAttribute('data-sigma-scale')).toBe('3');
  });

  it('exposes total-points', () => {
    const { container } = render(
      <ChartLineRecombiningBb data={constClose(30, 10)} length={5} />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-recombining-bb"]',
    );
    expect(root?.getAttribute('data-total-points')).toBe('30');
  });

  it('renders the screen-reader description', () => {
    const { container } = render(
      <ChartLineRecombiningBb data={constClose(30, 10)} length={5} />,
    );
    const desc = container.querySelector(
      '[data-section="chart-line-recombining-bb-aria-desc"]',
    );
    expect(desc?.textContent).toContain('recombining Bollinger Band');
  });

  it('renders both legend items', () => {
    const { container } = render(
      <ChartLineRecombiningBb data={constClose(30, 10)} length={5} />,
    );
    expect(container.querySelector('[data-series-id="price"]')).toBeTruthy();
    expect(container.querySelector('[data-series-id="bb"]')).toBeTruthy();
  });

  it('toggles a series via the legend', () => {
    const onToggle = vi.fn();
    const { container } = render(
      <ChartLineRecombiningBb
        data={constClose(30, 10)}
        length={5}
        onSeriesToggle={onToggle}
      />,
    );
    const button = container.querySelector(
      '[data-series-id="bb"]',
    ) as HTMLButtonElement | null;
    if (button) fireEvent.click(button);
    expect(onToggle).toHaveBeenCalledWith({
      seriesId: 'bb',
      hidden: true,
    });
  });

  it('hides bb when controlled hidden', () => {
    const { container } = render(
      <ChartLineRecombiningBb
        data={constClose(30, 10)}
        length={5}
        hiddenSeries={['bb']}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-recombining-bb-upper-path"]',
      ),
    ).toBe(null);
  });

  it('renders the config badge by default', () => {
    const { container } = render(
      <ChartLineRecombiningBb data={constClose(30, 10)} length={5} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-recombining-bb-badge"]',
      ),
    ).toBeTruthy();
  });

  it('hides the config badge when disabled', () => {
    const { container } = render(
      <ChartLineRecombiningBb
        data={constClose(30, 10)}
        length={5}
        showConfigBadge={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-recombining-bb-badge"]',
      ),
    ).toBe(null);
  });

  it('renders dots when showDots is true', () => {
    const { container } = render(
      <ChartLineRecombiningBb
        data={constClose(30, 10)}
        length={5}
        showDots={true}
      />,
    );
    expect(
      container.querySelectorAll(
        '[data-section="chart-line-recombining-bb-dot"]',
      ).length,
    ).toBeGreaterThan(0);
  });

  it('hides axis when showAxis is false', () => {
    const { container } = render(
      <ChartLineRecombiningBb
        data={constClose(30, 10)}
        length={5}
        showAxis={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-recombining-bb-axes"]',
      ),
    ).toBe(null);
  });

  it('hides grid when showGrid is false', () => {
    const { container } = render(
      <ChartLineRecombiningBb
        data={constClose(30, 10)}
        length={5}
        showGrid={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-recombining-bb-grid"]',
      ),
    ).toBe(null);
  });

  it('hides mean line when showMean is false', () => {
    const { container } = render(
      <ChartLineRecombiningBb
        data={constClose(30, 10)}
        length={5}
        showMean={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-recombining-bb-mean-path"]',
      ),
    ).toBe(null);
  });

  it('hides markers when showMarkers is false', () => {
    const { container } = render(
      <ChartLineRecombiningBb
        data={constClose(30, 10)}
        length={5}
        showMarkers={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-recombining-bb-markers"]',
      ),
    ).toBe(null);
  });

  it('hides legend when showLegend is false', () => {
    const { container } = render(
      <ChartLineRecombiningBb
        data={constClose(30, 10)}
        length={5}
        showLegend={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-recombining-bb-legend"]',
      ),
    ).toBe(null);
  });

  it('applies className and style', () => {
    const { container } = render(
      <ChartLineRecombiningBb
        data={constClose(30, 10)}
        length={5}
        className="custom-class"
        style={{ background: 'red' }}
      />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-recombining-bb"]',
    );
    expect(root?.classList.contains('custom-class')).toBe(true);
    expect((root as HTMLElement | null)?.style.background).toBe('red');
  });

  it('animate=false disables fade-in class', () => {
    const { container } = render(
      <ChartLineRecombiningBb
        data={constClose(30, 10)}
        length={5}
        animate={false}
      />,
    );
    const svg = container.querySelector(
      '[data-section="chart-line-recombining-bb-svg"]',
    );
    expect(svg?.classList.contains('motion-safe:animate-fade-in')).toBe(false);
  });

  it('renders upper and lower band paths by default', () => {
    const { container } = render(
      <ChartLineRecombiningBb data={constClose(30, 10)} length={5} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-recombining-bb-upper-path"]',
      ),
    ).toBeTruthy();
    expect(
      container.querySelector(
        '[data-section="chart-line-recombining-bb-lower-path"]',
      ),
    ).toBeTruthy();
  });

  it('renders the price path', () => {
    const { container } = render(
      <ChartLineRecombiningBb data={constClose(30, 10)} length={5} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-recombining-bb-price-path"]',
      ),
    ).toBeTruthy();
  });

  it('respects defaultHiddenSeries on uncontrolled mount', () => {
    const { container } = render(
      <ChartLineRecombiningBb
        data={constClose(30, 10)}
        length={5}
        defaultHiddenSeries={['bb']}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-recombining-bb-upper-path"]',
      ),
    ).toBe(null);
  });
});

describe('Recombining BB integration', () => {
  it('CONST close=K fires recombine every valid bar across (K, length)', () => {
    for (const K of [0, 1, 5, 100, -3]) {
      for (const L of [3, 5, 7, 10]) {
        const closes = Array(L + 5).fill(K);
        const ch = computeLineRecombiningBb(closes, { length: L });
        for (let i = L - 1; i < L + 5; i += 1) {
          expect(ch.recombine[i]).toBe(true);
          expect(ch.upper[i]).toBe(K);
          expect(ch.lower[i]).toBe(K);
        }
      }
    }
  });
});
