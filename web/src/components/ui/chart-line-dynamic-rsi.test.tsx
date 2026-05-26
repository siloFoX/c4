import { describe, expect, it, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { createRef } from 'react';
import {
  ChartLineDynamicRsi,
  applyLineDynamicRsiPopStdDev,
  applyLineDynamicRsiSma,
  classifyLineDynamicRsiZone,
  computeLineDynamicRsi,
  computeLineDynamicRsiLayout,
  computeLineDynamicRsiMoves,
  describeLineDynamicRsiChart,
  detectLineDynamicRsiCrosses,
  getLineDynamicRsiFinitePoints,
  normalizeLineDynamicRsiPeriod,
  normalizeLineDynamicRsiThreshold,
  runLineDynamicRsi,
  DEFAULT_CHART_LINE_DYNAMIC_RSI_BASE_LENGTH,
} from './chart-line-dynamic-rsi';
import type { ChartLineDynamicRsiPoint } from './chart-line-dynamic-rsi';

const constClose = (
  count: number,
  K: number,
): ChartLineDynamicRsiPoint[] =>
  Array.from({ length: count }, (_, i) => ({ x: i, close: K }));

const monoUp = (count: number): ChartLineDynamicRsiPoint[] =>
  Array.from({ length: count }, (_, i) => ({ x: i, close: i + 1 }));

const monoDown = (count: number): ChartLineDynamicRsiPoint[] =>
  Array.from({ length: count }, (_, i) => ({ x: i, close: count - i }));

describe('getLineDynamicRsiFinitePoints', () => {
  it('returns an empty array for null', () => {
    expect(getLineDynamicRsiFinitePoints(null)).toEqual([]);
  });

  it('drops non-finite close', () => {
    const result = getLineDynamicRsiFinitePoints([
      { x: 0, close: Number.NaN },
      { x: 1, close: 10 },
    ]);
    expect(result.length).toBe(1);
  });

  it('drops null entries', () => {
    const result = getLineDynamicRsiFinitePoints([
      null as unknown as ChartLineDynamicRsiPoint,
      { x: 1, close: 10 },
    ]);
    expect(result.length).toBe(1);
  });
});

describe('normalizeLineDynamicRsiPeriod', () => {
  it('returns the default when undefined', () => {
    expect(normalizeLineDynamicRsiPeriod(undefined, 14)).toBe(14);
  });

  it('floors fractional periods', () => {
    expect(normalizeLineDynamicRsiPeriod(7.9, 14)).toBe(7);
  });

  it('rejects zero', () => {
    expect(normalizeLineDynamicRsiPeriod(0, 14)).toBe(14);
  });
});

describe('normalizeLineDynamicRsiThreshold', () => {
  it('returns default for undefined', () => {
    expect(normalizeLineDynamicRsiThreshold(undefined, 70)).toBe(70);
  });

  it('accepts 0 and 100', () => {
    expect(normalizeLineDynamicRsiThreshold(0, 70)).toBe(0);
    expect(normalizeLineDynamicRsiThreshold(100, 70)).toBe(100);
  });

  it('rejects below 0', () => {
    expect(normalizeLineDynamicRsiThreshold(-1, 70)).toBe(70);
  });

  it('rejects above 100', () => {
    expect(normalizeLineDynamicRsiThreshold(101, 70)).toBe(70);
  });
});

describe('applyLineDynamicRsiSma', () => {
  it('CONST K SMA is K bit-exact', () => {
    for (const K of [0, 1, 5, 100, -3]) {
      const out = applyLineDynamicRsiSma(Array(10).fill(K), 4);
      for (let i = 3; i < 10; i += 1) {
        expect(out[i]).toBe(K);
      }
    }
  });

  it('warmup region is null', () => {
    const out = applyLineDynamicRsiSma([1, 2, 3, 4, 5], 3);
    expect(out[0]).toBe(null);
    expect(out[2]).toBe(2);
  });
});

describe('applyLineDynamicRsiPopStdDev', () => {
  it('CONST K stdDev is 0 bit-exact', () => {
    for (const K of [1, 5, 100, -3]) {
      const out = applyLineDynamicRsiPopStdDev(Array(10).fill(K), 4);
      for (let i = 3; i < 10; i += 1) {
        expect(out[i]).toBe(0);
      }
    }
  });
});

describe('computeLineDynamicRsiMoves', () => {
  it('first bar has null up and down', () => {
    const { up, down } = computeLineDynamicRsiMoves([1, 2, 3]);
    expect(up[0]).toBe(null);
    expect(down[0]).toBe(null);
  });

  it('CONST close yields up = down = 0', () => {
    const { up, down } = computeLineDynamicRsiMoves([5, 5, 5, 5]);
    for (let i = 1; i < 4; i += 1) {
      expect(up[i]).toBe(0);
      expect(down[i]).toBe(0);
    }
  });

  it('MONO UP yields up = 1, down = 0', () => {
    const { up, down } = computeLineDynamicRsiMoves([1, 2, 3, 4]);
    expect(up[1]).toBe(1);
    expect(down[1]).toBe(0);
    expect(up[2]).toBe(1);
    expect(down[2]).toBe(0);
  });

  it('MONO DOWN yields up = 0, down = 1', () => {
    const { up, down } = computeLineDynamicRsiMoves([4, 3, 2, 1]);
    expect(up[1]).toBe(0);
    expect(down[1]).toBe(1);
  });

  it('non-finite previous close yields null', () => {
    const { up, down } = computeLineDynamicRsiMoves([Number.NaN, 5, 6]);
    expect(up[1]).toBe(null);
    expect(down[1]).toBe(null);
  });
});

describe('computeLineDynamicRsi', () => {
  it('returns empty for null', () => {
    const ch = computeLineDynamicRsi(null);
    expect(ch.rsi).toEqual([]);
  });

  it('returns empty for empty input', () => {
    const ch = computeLineDynamicRsi([]);
    expect(ch.rsi).toEqual([]);
  });

  it('CONST close yields rsi = 50 bit-exact at every valid bar', () => {
    for (const K of [1, 5, 100, -3]) {
      const closes = Array(40).fill(K);
      const ch = computeLineDynamicRsi(closes);
      for (let i = 20; i < 40; i += 1) {
        expect(ch.rsi[i]).toBe(50);
      }
    }
  });

  it('MONOTONIC UP close yields rsi = 100 (bit-exact)', () => {
    const closes = Array.from({ length: 40 }, (_, i) => i + 1);
    const ch = computeLineDynamicRsi(closes);
    for (let i = 20; i < 40; i += 1) {
      if (ch.rsi[i] !== null) {
        expect(ch.rsi[i]).toBe(100);
      }
    }
  });

  it('MONOTONIC DOWN close yields rsi = 0 (bit-exact)', () => {
    const closes = Array.from({ length: 40 }, (_, i) => 100 - i);
    const ch = computeLineDynamicRsi(closes);
    for (let i = 20; i < 40; i += 1) {
      if (ch.rsi[i] !== null) {
        expect(ch.rsi[i]).toBe(0);
      }
    }
  });

  it('CONST yields dynLength = baseLength (ratio fallback)', () => {
    const closes = Array(40).fill(10);
    const ch = computeLineDynamicRsi(closes, {
      baseLength: 14,
      minLength: 5,
      maxLength: 30,
    });
    for (let i = 20; i < 40; i += 1) {
      expect(ch.dynLength[i]).toBe(14);
    }
  });

  it('dynLength is clamped to [minLength, maxLength]', () => {
    const closes = Array.from({ length: 40 }, (_, i) =>
      i < 20 ? 10 : 10 + (i % 2) * 5,
    );
    const ch = computeLineDynamicRsi(closes, {
      baseLength: 14,
      minLength: 5,
      maxLength: 30,
    });
    for (let i = 0; i < 40; i += 1) {
      const d = ch.dynLength[i];
      if (d !== null) {
        expect(d).toBeGreaterThanOrEqual(5);
        expect(d).toBeLessThanOrEqual(30);
      }
    }
  });

  it('output length matches input length', () => {
    const closes = Array(40).fill(10);
    const ch = computeLineDynamicRsi(closes);
    expect(ch.rsi.length).toBe(40);
    expect(ch.dynLength.length).toBe(40);
    expect(ch.shortStd.length).toBe(40);
    expect(ch.longStd.length).toBe(40);
  });

  it('does not mutate input', () => {
    const closes = Array.from({ length: 40 }, (_, i) => i + 1);
    const snap = closes.slice();
    computeLineDynamicRsi(closes);
    expect(closes).toEqual(snap);
  });
});

describe('classifyLineDynamicRsiZone', () => {
  it('classifies overbought when value >= overbought threshold', () => {
    expect(classifyLineDynamicRsiZone(80, 70, 30)).toBe('overbought');
  });

  it('classifies oversold when value <= oversold threshold', () => {
    expect(classifyLineDynamicRsiZone(20, 70, 30)).toBe('oversold');
  });

  it('classifies neutral in between', () => {
    expect(classifyLineDynamicRsiZone(50, 70, 30)).toBe('neutral');
  });

  it('returns none for null', () => {
    expect(classifyLineDynamicRsiZone(null, 70, 30)).toBe('none');
  });

  it('returns none for NaN', () => {
    expect(classifyLineDynamicRsiZone(Number.NaN, 70, 30)).toBe('none');
  });
});

describe('detectLineDynamicRsiCrosses', () => {
  it('returns [null, null] for warmup-only data', () => {
    expect(detectLineDynamicRsiCrosses([null, null], 70, 30)).toEqual([
      null,
      null,
    ]);
  });

  it('flags up when entering overbought', () => {
    const ev = detectLineDynamicRsiCrosses([null, 60, 80], 70, 30);
    expect(ev[2]).toBe('up');
  });

  it('flags down when entering oversold', () => {
    const ev = detectLineDynamicRsiCrosses([null, 40, 20], 70, 30);
    expect(ev[2]).toBe('down');
  });

  it('no cross when staying overbought', () => {
    const ev = detectLineDynamicRsiCrosses([null, 80, 90], 70, 30);
    expect(ev[2]).toBe(null);
  });

  it('first defined bar is not a cross', () => {
    const ev = detectLineDynamicRsiCrosses([null, 80], 70, 30);
    expect(ev[1]).toBe(null);
  });
});

describe('runLineDynamicRsi', () => {
  it('marks ok=false when data is too short', () => {
    const run = runLineDynamicRsi(constClose(5, 10));
    expect(run.ok).toBe(false);
  });

  it('marks ok=true with enough bars', () => {
    const run = runLineDynamicRsi(constClose(30, 10));
    expect(run.ok).toBe(true);
  });

  it('uses default parameters', () => {
    const run = runLineDynamicRsi(constClose(40, 10));
    expect(run.baseLength).toBe(DEFAULT_CHART_LINE_DYNAMIC_RSI_BASE_LENGTH);
    expect(run.overbought).toBe(70);
    expect(run.oversold).toBe(30);
  });

  it('respects explicit options', () => {
    const run = runLineDynamicRsi(constClose(40, 10), {
      baseLength: 7,
      overbought: 75,
      oversold: 25,
    });
    expect(run.baseLength).toBe(7);
    expect(run.overbought).toBe(75);
    expect(run.oversold).toBe(25);
  });

  it('sorts by x', () => {
    const data: ChartLineDynamicRsiPoint[] = [
      { x: 30, close: 10 },
      { x: 0, close: 10 },
      { x: 15, close: 10 },
    ];
    const run = runLineDynamicRsi(data);
    expect(run.samples.map((s) => s.x)).toEqual([0, 15, 30]);
  });

  it('CONST close classifies post-warmup as neutral', () => {
    const run = runLineDynamicRsi(constClose(40, 10));
    expect(run.neutralCount).toBeGreaterThan(0);
    expect(run.overboughtCount).toBe(0);
    expect(run.oversoldCount).toBe(0);
  });

  it('MONO UP close classifies post-warmup as overbought', () => {
    const run = runLineDynamicRsi(monoUp(40));
    expect(run.overboughtCount).toBeGreaterThan(0);
    expect(run.oversoldCount).toBe(0);
  });

  it('MONO DOWN close classifies post-warmup as oversold', () => {
    const run = runLineDynamicRsi(monoDown(40));
    expect(run.oversoldCount).toBeGreaterThan(0);
    expect(run.overboughtCount).toBe(0);
  });
});

describe('computeLineDynamicRsiLayout', () => {
  it('returns ok=false for empty data', () => {
    const layout = computeLineDynamicRsiLayout({ data: [] });
    expect(layout.ok).toBe(false);
  });

  it('returns ok=true for sufficient data', () => {
    const layout = computeLineDynamicRsiLayout({
      data: constClose(40, 10),
    });
    expect(layout.ok).toBe(true);
  });

  it('panels stack with price above rsi', () => {
    const layout = computeLineDynamicRsiLayout({
      data: constClose(40, 10),
    });
    expect(layout.priceBottom).toBeLessThan(layout.rsiTop);
  });

  it('panel gap is respected', () => {
    const layout = computeLineDynamicRsiLayout({
      data: constClose(40, 10),
      panelGap: 24,
    });
    expect(layout.rsiTop - layout.priceBottom).toBeCloseTo(24, 9);
  });

  it('produces a price path and dots', () => {
    const layout = computeLineDynamicRsiLayout({
      data: constClose(40, 10),
    });
    expect(layout.pricePath.startsWith('M')).toBe(true);
    expect(layout.priceDots.length).toBe(40);
  });

  it('rsi axis is fixed [0, 100]', () => {
    const layout = computeLineDynamicRsiLayout({
      data: constClose(40, 10),
    });
    expect(layout.rsiMin).toBe(0);
    expect(layout.rsiMax).toBe(100);
  });

  it('overbought line y is between rsiTop and rsiBottom', () => {
    const layout = computeLineDynamicRsiLayout({
      data: constClose(40, 10),
    });
    expect(layout.overboughtY).toBeGreaterThanOrEqual(layout.rsiTop);
    expect(layout.overboughtY).toBeLessThanOrEqual(layout.rsiBottom);
  });

  it('oversold line y is between rsiTop and rsiBottom', () => {
    const layout = computeLineDynamicRsiLayout({
      data: constClose(40, 10),
    });
    expect(layout.oversoldY).toBeGreaterThanOrEqual(layout.rsiTop);
    expect(layout.oversoldY).toBeLessThanOrEqual(layout.rsiBottom);
  });

  it('CONST close yields zero markers (no crosses)', () => {
    const layout = computeLineDynamicRsiLayout({
      data: constClose(40, 10),
    });
    expect(layout.markers.length).toBe(0);
  });

  it('handles a single point gracefully', () => {
    const layout = computeLineDynamicRsiLayout({
      data: [{ x: 0, close: 10 }],
    });
    expect(layout.ok).toBe(false);
  });
});

describe('describeLineDynamicRsiChart', () => {
  it('returns No data for empty input', () => {
    expect(describeLineDynamicRsiChart([])).toBe('No data');
  });

  it('mentions Dynamic RSI', () => {
    const desc = describeLineDynamicRsiChart(constClose(40, 10));
    expect(desc).toContain('Dynamic RSI');
  });

  it('reports the parameters', () => {
    const desc = describeLineDynamicRsiChart(constClose(40, 10), {
      baseLength: 7,
      overbought: 75,
      oversold: 25,
    });
    expect(desc).toContain('baseLength 7');
    expect(desc).toContain('overbought 75');
    expect(desc).toContain('oversold 25');
  });
});

describe('<ChartLineDynamicRsi />', () => {
  it('renders an empty placeholder for no data', () => {
    const { container } = render(<ChartLineDynamicRsi data={[]} />);
    const placeholder = container.querySelector(
      '[data-section="chart-line-dynamic-rsi-empty"]',
    );
    expect(placeholder?.textContent).toBe('No data');
  });

  it('renders region role with aria-label', () => {
    const { container } = render(
      <ChartLineDynamicRsi data={constClose(40, 10)} />,
    );
    const region = container.querySelector('[role="region"]');
    expect(region).toBeTruthy();
    expect(region?.getAttribute('aria-label')).toContain('Dynamic RSI');
  });

  it('forwards ref', () => {
    const ref = createRef<HTMLDivElement>();
    render(<ChartLineDynamicRsi data={constClose(40, 10)} ref={ref} />);
    expect(ref.current).not.toBe(null);
  });

  it('exposes data attrs', () => {
    const { container } = render(
      <ChartLineDynamicRsi
        data={constClose(40, 10)}
        baseLength={7}
        overbought={75}
        oversold={25}
      />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-dynamic-rsi"]',
    );
    expect(root?.getAttribute('data-base-length')).toBe('7');
    expect(root?.getAttribute('data-overbought')).toBe('75');
    expect(root?.getAttribute('data-oversold')).toBe('25');
  });

  it('exposes total-points', () => {
    const { container } = render(
      <ChartLineDynamicRsi data={constClose(40, 10)} />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-dynamic-rsi"]',
    );
    expect(root?.getAttribute('data-total-points')).toBe('40');
  });

  it('renders the screen-reader description', () => {
    const { container } = render(
      <ChartLineDynamicRsi data={constClose(40, 10)} />,
    );
    const desc = container.querySelector(
      '[data-section="chart-line-dynamic-rsi-aria-desc"]',
    );
    expect(desc?.textContent).toContain('Dynamic RSI');
  });

  it('renders both legend items', () => {
    const { container } = render(
      <ChartLineDynamicRsi data={constClose(40, 10)} />,
    );
    expect(container.querySelector('[data-series-id="price"]')).toBeTruthy();
    expect(container.querySelector('[data-series-id="rsi"]')).toBeTruthy();
  });

  it('toggles a series via the legend', () => {
    const onToggle = vi.fn();
    const { container } = render(
      <ChartLineDynamicRsi
        data={constClose(40, 10)}
        onSeriesToggle={onToggle}
      />,
    );
    const button = container.querySelector(
      '[data-series-id="rsi"]',
    ) as HTMLButtonElement | null;
    if (button) fireEvent.click(button);
    expect(onToggle).toHaveBeenCalledWith({
      seriesId: 'rsi',
      hidden: true,
    });
  });

  it('hides rsi when controlled hidden', () => {
    const { container } = render(
      <ChartLineDynamicRsi
        data={constClose(40, 10)}
        hiddenSeries={['rsi']}
      />,
    );
    expect(
      container.querySelector('[data-section="chart-line-dynamic-rsi-line"]'),
    ).toBe(null);
  });

  it('renders the config badge by default', () => {
    const { container } = render(
      <ChartLineDynamicRsi data={constClose(40, 10)} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-dynamic-rsi-badge"]',
      ),
    ).toBeTruthy();
  });

  it('renders overbought and oversold threshold lines', () => {
    const { container } = render(
      <ChartLineDynamicRsi data={constClose(40, 10)} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-dynamic-rsi-overbought-line"]',
      ),
    ).toBeTruthy();
    expect(
      container.querySelector(
        '[data-section="chart-line-dynamic-rsi-oversold-line"]',
      ),
    ).toBeTruthy();
  });

  it('hides threshold lines when showThresholds is false', () => {
    const { container } = render(
      <ChartLineDynamicRsi
        data={constClose(40, 10)}
        showThresholds={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-dynamic-rsi-overbought-line"]',
      ),
    ).toBe(null);
  });

  it('renders the midline by default', () => {
    const { container } = render(
      <ChartLineDynamicRsi data={constClose(40, 10)} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-dynamic-rsi-midline"]',
      ),
    ).toBeTruthy();
  });

  it('hides the midline when showMidline is false', () => {
    const { container } = render(
      <ChartLineDynamicRsi
        data={constClose(40, 10)}
        showMidline={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-dynamic-rsi-midline"]',
      ),
    ).toBe(null);
  });

  it('hides axis when showAxis is false', () => {
    const { container } = render(
      <ChartLineDynamicRsi data={constClose(40, 10)} showAxis={false} />,
    );
    expect(
      container.querySelector('[data-section="chart-line-dynamic-rsi-axes"]'),
    ).toBe(null);
  });

  it('hides grid when showGrid is false', () => {
    const { container } = render(
      <ChartLineDynamicRsi data={constClose(40, 10)} showGrid={false} />,
    );
    expect(
      container.querySelector('[data-section="chart-line-dynamic-rsi-grid"]'),
    ).toBe(null);
  });

  it('hides markers when showMarkers is false', () => {
    const { container } = render(
      <ChartLineDynamicRsi
        data={constClose(40, 10)}
        showMarkers={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-dynamic-rsi-markers"]',
      ),
    ).toBe(null);
  });

  it('hides legend when showLegend is false', () => {
    const { container } = render(
      <ChartLineDynamicRsi
        data={constClose(40, 10)}
        showLegend={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-dynamic-rsi-legend"]',
      ),
    ).toBe(null);
  });

  it('applies className and style', () => {
    const { container } = render(
      <ChartLineDynamicRsi
        data={constClose(40, 10)}
        className="custom-class"
        style={{ background: 'red' }}
      />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-dynamic-rsi"]',
    );
    expect(root?.classList.contains('custom-class')).toBe(true);
    expect((root as HTMLElement | null)?.style.background).toBe('red');
  });

  it('animate=false disables fade-in class', () => {
    const { container } = render(
      <ChartLineDynamicRsi data={constClose(40, 10)} animate={false} />,
    );
    const svg = container.querySelector(
      '[data-section="chart-line-dynamic-rsi-svg"]',
    );
    expect(svg?.classList.contains('motion-safe:animate-fade-in')).toBe(false);
  });

  it('renders the rsi line by default', () => {
    const { container } = render(
      <ChartLineDynamicRsi data={constClose(40, 10)} />,
    );
    expect(
      container.querySelector('[data-section="chart-line-dynamic-rsi-line"]'),
    ).toBeTruthy();
  });

  it('renders the price path', () => {
    const { container } = render(
      <ChartLineDynamicRsi data={constClose(40, 10)} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-dynamic-rsi-price-path"]',
      ),
    ).toBeTruthy();
  });
});

describe('Dynamic RSI integration', () => {
  it('CONST close yields rsi = 50 across K', () => {
    for (const K of [1, 5, 100, -3]) {
      const closes = Array(40).fill(K);
      const ch = computeLineDynamicRsi(closes);
      for (let i = 20; i < 40; i += 1) {
        if (ch.rsi[i] !== null) {
          expect(ch.rsi[i]).toBe(50);
        }
      }
    }
  });

  it('MONO UP yields rsi = 100 bit-exact at every valid bar', () => {
    const closes = Array.from({ length: 40 }, (_, i) => i + 1);
    const ch = computeLineDynamicRsi(closes);
    for (let i = 20; i < 40; i += 1) {
      if (ch.rsi[i] !== null) {
        expect(ch.rsi[i]).toBe(100);
      }
    }
  });

  it('MONO DOWN yields rsi = 0 bit-exact at every valid bar', () => {
    const closes = Array.from({ length: 40 }, (_, i) => 100 - i);
    const ch = computeLineDynamicRsi(closes);
    for (let i = 20; i < 40; i += 1) {
      if (ch.rsi[i] !== null) {
        expect(ch.rsi[i]).toBe(0);
      }
    }
  });
});
