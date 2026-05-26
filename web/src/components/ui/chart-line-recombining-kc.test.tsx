import { describe, expect, it, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { createRef } from 'react';
import {
  ChartLineRecombiningKc,
  applyLineRecombiningKcAtr,
  applyLineRecombiningKcEma,
  applyLineRecombiningKcTrueRange,
  classifyLineRecombiningKcZone,
  computeLineRecombiningKc,
  computeLineRecombiningKcLayout,
  describeLineRecombiningKcChart,
  getLineRecombiningKcFinitePoints,
  normalizeLineRecombiningKcAtrLength,
  normalizeLineRecombiningKcLength,
  normalizeLineRecombiningKcMultiplier,
  runLineRecombiningKc,
  DEFAULT_CHART_LINE_RECOMBINING_KC_LENGTH,
  DEFAULT_CHART_LINE_RECOMBINING_KC_ATR_LENGTH,
  DEFAULT_CHART_LINE_RECOMBINING_KC_MULTIPLIER,
} from './chart-line-recombining-kc';
import type { ChartLineRecombiningKcPoint } from './chart-line-recombining-kc';

const constBar = (
  count: number,
  K: number,
): ChartLineRecombiningKcPoint[] =>
  Array.from({ length: count }, (_, i) => ({
    x: i,
    high: K,
    low: K,
    close: K,
  }));

describe('getLineRecombiningKcFinitePoints', () => {
  it('returns an empty array for null', () => {
    expect(getLineRecombiningKcFinitePoints(null)).toEqual([]);
  });

  it('drops non-finite high', () => {
    const result = getLineRecombiningKcFinitePoints([
      { x: 0, high: Number.NaN, low: 5, close: 7 },
      { x: 1, high: 10, low: 5, close: 7 },
    ]);
    expect(result.length).toBe(1);
  });

  it('drops non-finite low', () => {
    const result = getLineRecombiningKcFinitePoints([
      { x: 0, high: 10, low: Number.NaN, close: 7 },
      { x: 1, high: 10, low: 5, close: 7 },
    ]);
    expect(result.length).toBe(1);
  });

  it('drops non-finite close', () => {
    const result = getLineRecombiningKcFinitePoints([
      { x: 0, high: 10, low: 5, close: Number.NaN },
      { x: 1, high: 10, low: 5, close: 7 },
    ]);
    expect(result.length).toBe(1);
  });

  it('drops null entries', () => {
    const result = getLineRecombiningKcFinitePoints([
      null as unknown as ChartLineRecombiningKcPoint,
      { x: 1, high: 10, low: 5, close: 7 },
    ]);
    expect(result.length).toBe(1);
  });
});

describe('normalizeLineRecombiningKcLength', () => {
  it('returns default when undefined', () => {
    expect(normalizeLineRecombiningKcLength(undefined, 20)).toBe(20);
  });

  it('floors fractional', () => {
    expect(normalizeLineRecombiningKcLength(7.9, 20)).toBe(7);
  });

  it('rejects below 2', () => {
    expect(normalizeLineRecombiningKcLength(1, 20)).toBe(20);
  });
});

describe('normalizeLineRecombiningKcAtrLength', () => {
  it('returns default when undefined', () => {
    expect(normalizeLineRecombiningKcAtrLength(undefined, 10)).toBe(10);
  });

  it('accepts 1', () => {
    expect(normalizeLineRecombiningKcAtrLength(1, 10)).toBe(1);
  });

  it('rejects zero', () => {
    expect(normalizeLineRecombiningKcAtrLength(0, 10)).toBe(10);
  });
});

describe('normalizeLineRecombiningKcMultiplier', () => {
  it('returns default when undefined', () => {
    expect(normalizeLineRecombiningKcMultiplier(undefined, 2)).toBe(2);
  });

  it('accepts zero', () => {
    expect(normalizeLineRecombiningKcMultiplier(0, 2)).toBe(0);
  });

  it('rejects negative', () => {
    expect(normalizeLineRecombiningKcMultiplier(-1, 2)).toBe(2);
  });

  it('accepts fractional', () => {
    expect(normalizeLineRecombiningKcMultiplier(1.5, 2)).toBe(1.5);
  });
});

describe('applyLineRecombiningKcEma', () => {
  it('CONST K EMA is K bit-exact', () => {
    for (const K of [0, 1, 5, 100, -3]) {
      const out = applyLineRecombiningKcEma(Array(10).fill(K), 4);
      // EMA defined starting at i = length - 1.
      for (let i = 3; i < 10; i += 1) {
        expect(out[i]).toBe(K);
      }
    }
  });

  it('warmup region is null', () => {
    const out = applyLineRecombiningKcEma([1, 2, 3, 4, 5], 4);
    expect(out[0]).toBe(null);
    expect(out[1]).toBe(null);
    expect(out[2]).toBe(null);
    expect(out[3]).not.toBe(null);
  });

  it('handles null input gracefully', () => {
    const out = applyLineRecombiningKcEma([], 4);
    expect(out).toEqual([]);
  });
});

describe('applyLineRecombiningKcTrueRange', () => {
  it('CONST h=l=c yields TR = 0 bit-exact', () => {
    const series = constBar(5, 10);
    const out = applyLineRecombiningKcTrueRange(series);
    for (let i = 0; i < 5; i += 1) {
      expect(out[i]).toBe(0);
    }
  });

  it('first bar TR uses just high - low', () => {
    const series: ChartLineRecombiningKcPoint[] = [
      { x: 0, high: 12, low: 8, close: 10 },
    ];
    const out = applyLineRecombiningKcTrueRange(series);
    expect(out[0]).toBe(4);
  });

  it('uses max(h-l, |h-prevC|, |l-prevC|) for subsequent bars', () => {
    // bar 0: h=10, l=10, c=10
    // bar 1: h=15, l=12, c=14
    //   r1 = 3, r2 = |15-10|=5, r3 = |12-10|=2 -> max = 5
    const series: ChartLineRecombiningKcPoint[] = [
      { x: 0, high: 10, low: 10, close: 10 },
      { x: 1, high: 15, low: 12, close: 14 },
    ];
    const out = applyLineRecombiningKcTrueRange(series);
    expect(out[1]).toBe(5);
  });
});

describe('applyLineRecombiningKcAtr', () => {
  it('CONST TR yields ATR = 0 bit-exact', () => {
    const out = applyLineRecombiningKcAtr(Array(10).fill(0), 4);
    for (let i = 3; i < 10; i += 1) {
      expect(out[i]).toBe(0);
    }
  });

  it('warmup region is null', () => {
    const out = applyLineRecombiningKcAtr([1, 2, 3, 4, 5], 4);
    expect(out[0]).toBe(null);
    expect(out[2]).toBe(null);
    expect(out[3]).toBe(2.5);
  });
});

describe('computeLineRecombiningKc', () => {
  it('returns empty for null', () => {
    const ch = computeLineRecombiningKc(null);
    expect(ch.upper).toEqual([]);
  });

  it('returns empty for empty input', () => {
    const ch = computeLineRecombiningKc([]);
    expect(ch.upper).toEqual([]);
  });

  it('CONST h=l=c=K: mean=upper=lower=K and recombine=true (bit-exact)', () => {
    for (const K of [0, 1, 5, 100, -3]) {
      const series = constBar(15, K);
      const ch = computeLineRecombiningKc(series, {
        length: 4,
        atrLength: 4,
        multiplier: 2,
      });
      // Both EMA and ATR are defined starting at i >= max(length, atrLength) - 1.
      for (let i = 4; i < 15; i += 1) {
        expect(ch.mean[i]).toBe(K);
        expect(ch.atr[i]).toBe(0);
        // close = K >= fullUpper = K -> recombine.
        expect(ch.recombine[i]).toBe(true);
        expect(ch.upper[i]).toBe(K);
        expect(ch.lower[i]).toBe(K);
      }
    }
  });

  it('multiplier=0 forces recombine on every non-mean close', () => {
    // With CONST close=K, mean=K, multiplier=0: fullUpper=fullLower=K=close.
    // close >= K satisfies the trigger, so recombine fires.
    const series = constBar(15, 10);
    const ch = computeLineRecombiningKc(series, {
      length: 4,
      atrLength: 4,
      multiplier: 0,
    });
    for (let i = 4; i < 15; i += 1) {
      expect(ch.recombine[i]).toBe(true);
    }
  });

  it('warmup region is null', () => {
    const series = constBar(15, 5);
    const ch = computeLineRecombiningKc(series, {
      length: 4,
      atrLength: 4,
    });
    expect(ch.mean[0]).toBe(null);
    expect(ch.upper[0]).toBe(null);
    expect(ch.recombine[0]).toBe(false);
  });

  it('output length matches input length', () => {
    const series = constBar(15, 5);
    const ch = computeLineRecombiningKc(series, { length: 4 });
    expect(ch.mean.length).toBe(15);
    expect(ch.upper.length).toBe(15);
    expect(ch.lower.length).toBe(15);
    expect(ch.recombine.length).toBe(15);
  });

  it('does not mutate input', () => {
    const series = constBar(15, 5);
    const snap = JSON.parse(JSON.stringify(series));
    computeLineRecombiningKc(series, { length: 4 });
    expect(series).toEqual(snap);
  });
});

describe('classifyLineRecombiningKcZone', () => {
  it('classifies recombine first', () => {
    expect(classifyLineRecombiningKcZone(5, 5, true)).toBe('recombine');
  });

  it('classifies above-mid', () => {
    expect(classifyLineRecombiningKcZone(7, 5, false)).toBe('above-mid');
  });

  it('classifies below-mid', () => {
    expect(classifyLineRecombiningKcZone(3, 5, false)).toBe('below-mid');
  });

  it('classifies at-mid', () => {
    expect(classifyLineRecombiningKcZone(5, 5, false)).toBe('at-mid');
  });

  it('returns none for null mean', () => {
    expect(classifyLineRecombiningKcZone(5, null, false)).toBe('none');
  });
});

describe('runLineRecombiningKc', () => {
  it('marks ok=false for short data', () => {
    const run = runLineRecombiningKc(constBar(3, 10), {
      length: 4,
      atrLength: 4,
    });
    expect(run.ok).toBe(false);
  });

  it('marks ok=true with enough data', () => {
    const run = runLineRecombiningKc(constBar(4, 10), {
      length: 4,
      atrLength: 4,
    });
    expect(run.ok).toBe(true);
  });

  it('uses default parameters', () => {
    const run = runLineRecombiningKc(constBar(30, 10));
    expect(run.length).toBe(DEFAULT_CHART_LINE_RECOMBINING_KC_LENGTH);
    expect(run.atrLength).toBe(DEFAULT_CHART_LINE_RECOMBINING_KC_ATR_LENGTH);
    expect(run.multiplier).toBe(DEFAULT_CHART_LINE_RECOMBINING_KC_MULTIPLIER);
  });

  it('respects explicit options', () => {
    const run = runLineRecombiningKc(constBar(30, 10), {
      length: 7,
      atrLength: 5,
      multiplier: 3,
    });
    expect(run.length).toBe(7);
    expect(run.atrLength).toBe(5);
    expect(run.multiplier).toBe(3);
  });

  it('sorts by x', () => {
    const data: ChartLineRecombiningKcPoint[] = [
      { x: 2, high: 10, low: 10, close: 10 },
      { x: 0, high: 10, low: 10, close: 10 },
      { x: 1, high: 10, low: 10, close: 10 },
    ];
    const run = runLineRecombiningKc(data, { length: 2, atrLength: 2 });
    expect(run.samples.map((s) => s.x)).toEqual([0, 1, 2]);
  });

  it('CONST close fires recombine every valid bar', () => {
    const run = runLineRecombiningKc(constBar(10, 10), {
      length: 4,
      atrLength: 4,
    });
    expect(run.recombineCount).toBe(7);
  });
});

describe('computeLineRecombiningKcLayout', () => {
  it('returns ok=false for empty data', () => {
    const layout = computeLineRecombiningKcLayout({ data: [] });
    expect(layout.ok).toBe(false);
  });

  it('returns ok=true for sufficient data', () => {
    const layout = computeLineRecombiningKcLayout({
      data: constBar(30, 10),
    });
    expect(layout.ok).toBe(true);
  });

  it('uses the explicit width and height', () => {
    const layout = computeLineRecombiningKcLayout({
      data: constBar(30, 10),
      width: 600,
      height: 400,
    });
    expect(layout.width).toBe(600);
    expect(layout.height).toBe(400);
  });

  it('produces a price path and dots', () => {
    const layout = computeLineRecombiningKcLayout({
      data: constBar(30, 10),
    });
    expect(layout.pricePath.startsWith('M')).toBe(true);
    expect(layout.priceDots.length).toBe(30);
  });

  it('produces upper, lower, and mean paths', () => {
    const layout = computeLineRecombiningKcLayout({
      data: constBar(30, 10),
      length: 4,
      atrLength: 4,
    });
    expect(layout.upperPath.startsWith('M')).toBe(true);
    expect(layout.lowerPath.startsWith('M')).toBe(true);
    expect(layout.meanPath.startsWith('M')).toBe(true);
  });

  it('CONST yields recombine markers on every valid bar', () => {
    const layout = computeLineRecombiningKcLayout({
      data: constBar(30, 10),
      length: 4,
      atrLength: 4,
    });
    // Valid bars 4..29 = 26 markers (length=atrLength=4, first defined at i=3).
    expect(layout.markers.length).toBeGreaterThan(20);
  });

  it('handles a single point gracefully', () => {
    const layout = computeLineRecombiningKcLayout({
      data: [{ x: 0, high: 10, low: 10, close: 10 }],
      length: 2,
      atrLength: 2,
    });
    expect(layout.ok).toBe(false);
  });
});

describe('describeLineRecombiningKcChart', () => {
  it('returns No data for empty input', () => {
    expect(describeLineRecombiningKcChart([])).toBe('No data');
  });

  it('mentions recombining Keltner Channel', () => {
    const desc = describeLineRecombiningKcChart(constBar(30, 10));
    expect(desc).toContain('recombining Keltner Channel');
  });

  it('reports parameters', () => {
    const desc = describeLineRecombiningKcChart(constBar(30, 10), {
      length: 7,
      atrLength: 5,
      multiplier: 3,
    });
    expect(desc).toContain('length 7');
    expect(desc).toContain('atrLength 5');
    expect(desc).toContain('multiplier 3');
  });
});

describe('<ChartLineRecombiningKc />', () => {
  it('renders an empty placeholder for no data', () => {
    const { container } = render(<ChartLineRecombiningKc data={[]} />);
    const placeholder = container.querySelector(
      '[data-section="chart-line-recombining-kc-empty"]',
    );
    expect(placeholder?.textContent).toBe('No data');
  });

  it('renders region role with aria-label', () => {
    const { container } = render(
      <ChartLineRecombiningKc data={constBar(30, 10)} length={4} />,
    );
    const region = container.querySelector('[role="region"]');
    expect(region).toBeTruthy();
    expect(region?.getAttribute('aria-label')).toContain(
      'Recombining Keltner Channel',
    );
  });

  it('forwards ref', () => {
    const ref = createRef<HTMLDivElement>();
    render(
      <ChartLineRecombiningKc
        data={constBar(30, 10)}
        length={4}
        ref={ref}
      />,
    );
    expect(ref.current).not.toBe(null);
  });

  it('exposes data attrs', () => {
    const { container } = render(
      <ChartLineRecombiningKc
        data={constBar(30, 10)}
        length={7}
        atrLength={5}
        multiplier={3}
      />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-recombining-kc"]',
    );
    expect(root?.getAttribute('data-length')).toBe('7');
    expect(root?.getAttribute('data-atr-length')).toBe('5');
    expect(root?.getAttribute('data-multiplier')).toBe('3');
  });

  it('exposes total-points', () => {
    const { container } = render(
      <ChartLineRecombiningKc data={constBar(30, 10)} length={4} />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-recombining-kc"]',
    );
    expect(root?.getAttribute('data-total-points')).toBe('30');
  });

  it('renders the screen-reader description', () => {
    const { container } = render(
      <ChartLineRecombiningKc data={constBar(30, 10)} length={4} />,
    );
    const desc = container.querySelector(
      '[data-section="chart-line-recombining-kc-aria-desc"]',
    );
    expect(desc?.textContent).toContain('recombining Keltner Channel');
  });

  it('renders both legend items', () => {
    const { container } = render(
      <ChartLineRecombiningKc data={constBar(30, 10)} length={4} />,
    );
    expect(container.querySelector('[data-series-id="price"]')).toBeTruthy();
    expect(container.querySelector('[data-series-id="kc"]')).toBeTruthy();
  });

  it('toggles a series via the legend', () => {
    const onToggle = vi.fn();
    const { container } = render(
      <ChartLineRecombiningKc
        data={constBar(30, 10)}
        length={4}
        onSeriesToggle={onToggle}
      />,
    );
    const button = container.querySelector(
      '[data-series-id="kc"]',
    ) as HTMLButtonElement | null;
    if (button) fireEvent.click(button);
    expect(onToggle).toHaveBeenCalledWith({
      seriesId: 'kc',
      hidden: true,
    });
  });

  it('hides kc when controlled hidden', () => {
    const { container } = render(
      <ChartLineRecombiningKc
        data={constBar(30, 10)}
        length={4}
        hiddenSeries={['kc']}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-recombining-kc-upper-path"]',
      ),
    ).toBe(null);
  });

  it('renders the config badge by default', () => {
    const { container } = render(
      <ChartLineRecombiningKc data={constBar(30, 10)} length={4} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-recombining-kc-badge"]',
      ),
    ).toBeTruthy();
  });

  it('hides the config badge when disabled', () => {
    const { container } = render(
      <ChartLineRecombiningKc
        data={constBar(30, 10)}
        length={4}
        showConfigBadge={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-recombining-kc-badge"]',
      ),
    ).toBe(null);
  });

  it('hides mean line when showMean is false', () => {
    const { container } = render(
      <ChartLineRecombiningKc
        data={constBar(30, 10)}
        length={4}
        showMean={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-recombining-kc-mean-path"]',
      ),
    ).toBe(null);
  });

  it('hides axis when showAxis is false', () => {
    const { container } = render(
      <ChartLineRecombiningKc
        data={constBar(30, 10)}
        length={4}
        showAxis={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-recombining-kc-axes"]',
      ),
    ).toBe(null);
  });

  it('hides grid when showGrid is false', () => {
    const { container } = render(
      <ChartLineRecombiningKc
        data={constBar(30, 10)}
        length={4}
        showGrid={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-recombining-kc-grid"]',
      ),
    ).toBe(null);
  });

  it('hides markers when showMarkers is false', () => {
    const { container } = render(
      <ChartLineRecombiningKc
        data={constBar(30, 10)}
        length={4}
        showMarkers={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-recombining-kc-markers"]',
      ),
    ).toBe(null);
  });

  it('hides legend when showLegend is false', () => {
    const { container } = render(
      <ChartLineRecombiningKc
        data={constBar(30, 10)}
        length={4}
        showLegend={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-recombining-kc-legend"]',
      ),
    ).toBe(null);
  });

  it('applies className and style', () => {
    const { container } = render(
      <ChartLineRecombiningKc
        data={constBar(30, 10)}
        length={4}
        className="custom-class"
        style={{ background: 'red' }}
      />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-recombining-kc"]',
    );
    expect(root?.classList.contains('custom-class')).toBe(true);
    expect((root as HTMLElement | null)?.style.background).toBe('red');
  });

  it('animate=false disables fade-in class', () => {
    const { container } = render(
      <ChartLineRecombiningKc
        data={constBar(30, 10)}
        length={4}
        animate={false}
      />,
    );
    const svg = container.querySelector(
      '[data-section="chart-line-recombining-kc-svg"]',
    );
    expect(svg?.classList.contains('motion-safe:animate-fade-in')).toBe(false);
  });

  it('renders upper and lower band paths by default', () => {
    const { container } = render(
      <ChartLineRecombiningKc data={constBar(30, 10)} length={4} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-recombining-kc-upper-path"]',
      ),
    ).toBeTruthy();
    expect(
      container.querySelector(
        '[data-section="chart-line-recombining-kc-lower-path"]',
      ),
    ).toBeTruthy();
  });

  it('renders the price path', () => {
    const { container } = render(
      <ChartLineRecombiningKc data={constBar(30, 10)} length={4} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-recombining-kc-price-path"]',
      ),
    ).toBeTruthy();
  });

  it('respects defaultHiddenSeries on uncontrolled mount', () => {
    const { container } = render(
      <ChartLineRecombiningKc
        data={constBar(30, 10)}
        length={4}
        defaultHiddenSeries={['kc']}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-recombining-kc-upper-path"]',
      ),
    ).toBe(null);
  });
});

describe('Recombining KC integration', () => {
  it('CONST h=l=c=K fires recombine every valid bar across (K, length, multiplier)', () => {
    for (const K of [0, 1, 5, 100, -3]) {
      for (const L of [3, 5, 7, 10]) {
        for (const M of [0, 1, 2, 3]) {
          const series = constBar(L + 5, K);
          const ch = computeLineRecombiningKc(series, {
            length: L,
            atrLength: L,
            multiplier: M,
          });
          for (let i = L - 1; i < L + 5; i += 1) {
            expect(ch.recombine[i]).toBe(true);
            expect(ch.upper[i]).toBe(K);
            expect(ch.lower[i]).toBe(K);
            expect(ch.mean[i]).toBe(K);
          }
        }
      }
    }
  });
});
