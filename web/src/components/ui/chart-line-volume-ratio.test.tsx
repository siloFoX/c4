import { describe, expect, it, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { createRef } from 'react';
import {
  ChartLineVolumeRatio,
  applyLineVolumeRatioSma,
  classifyLineVolumeRatioZone,
  computeLineVolumeRatio,
  computeLineVolumeRatioLayout,
  describeLineVolumeRatioChart,
  detectLineVolumeRatioCrosses,
  getLineVolumeRatioFinitePoints,
  normalizeLineVolumeRatioLength,
  normalizeLineVolumeRatioThreshold,
  runLineVolumeRatio,
  DEFAULT_CHART_LINE_VOLUME_RATIO_LENGTH,
} from './chart-line-volume-ratio';
import type { ChartLineVolumeRatioPoint } from './chart-line-volume-ratio';

const constBar = (
  count: number,
  K: number,
  V = 1,
): ChartLineVolumeRatioPoint[] =>
  Array.from({ length: count }, (_, i) => ({
    x: i,
    close: K,
    volume: V,
  }));

const linearUpVol = (count: number): ChartLineVolumeRatioPoint[] =>
  Array.from({ length: count }, (_, i) => ({
    x: i,
    close: i + 1,
    volume: i + 1,
  }));

describe('getLineVolumeRatioFinitePoints', () => {
  it('returns an empty array for null', () => {
    expect(getLineVolumeRatioFinitePoints(null)).toEqual([]);
  });

  it('drops non-finite close', () => {
    const r = getLineVolumeRatioFinitePoints([
      { x: 0, close: Number.NaN, volume: 1 },
      { x: 1, close: 10, volume: 1 },
    ]);
    expect(r.length).toBe(1);
  });

  it('drops negative volume', () => {
    const r = getLineVolumeRatioFinitePoints([
      { x: 0, close: 10, volume: -1 },
      { x: 1, close: 10, volume: 1 },
    ]);
    expect(r.length).toBe(1);
  });

  it('keeps zero volume', () => {
    const r = getLineVolumeRatioFinitePoints([
      { x: 0, close: 10, volume: 0 },
      { x: 1, close: 10, volume: 1 },
    ]);
    expect(r.length).toBe(2);
  });

  it('drops null entries', () => {
    const r = getLineVolumeRatioFinitePoints([
      null as unknown as ChartLineVolumeRatioPoint,
      { x: 1, close: 10, volume: 1 },
    ]);
    expect(r.length).toBe(1);
  });
});

describe('normalizeLineVolumeRatioLength', () => {
  it('returns default when undefined', () => {
    expect(normalizeLineVolumeRatioLength(undefined, 14)).toBe(14);
  });

  it('rejects below 2', () => {
    expect(normalizeLineVolumeRatioLength(1, 14)).toBe(14);
  });

  it('floors fractional', () => {
    expect(normalizeLineVolumeRatioLength(7.7, 14)).toBe(7);
  });
});

describe('normalizeLineVolumeRatioThreshold', () => {
  it('returns default when undefined', () => {
    expect(normalizeLineVolumeRatioThreshold(undefined, 1.5)).toBe(1.5);
  });

  it('accepts zero', () => {
    expect(normalizeLineVolumeRatioThreshold(0, 1.5)).toBe(0);
  });

  it('rejects negative', () => {
    expect(normalizeLineVolumeRatioThreshold(-1, 1.5)).toBe(1.5);
  });
});

describe('applyLineVolumeRatioSma', () => {
  it('CONST V SMA is V bit-exact', () => {
    for (const V of [1, 5, 100]) {
      const out = applyLineVolumeRatioSma(Array(10).fill(V), 3);
      for (let i = 2; i < 10; i += 1) {
        expect(out[i]).toBe(V);
      }
    }
  });

  it('warmup is null', () => {
    const out = applyLineVolumeRatioSma([1, 2, 3, 4, 5], 3);
    expect(out[0]).toBe(null);
    expect(out[1]).toBe(null);
    expect(out[2]).toBe(2);
  });
});

describe('computeLineVolumeRatio', () => {
  it('returns empty for null', () => {
    const ch = computeLineVolumeRatio(null);
    expect(ch.ratio).toEqual([]);
  });

  it('CONST volume = V > 0 yields ratio = 1 bit-exact', () => {
    for (const V of [1, 5, 100]) {
      const series = constBar(20, 10, V);
      const ch = computeLineVolumeRatio(series, { length: 4 });
      for (let i = 3; i < 20; i += 1) {
        expect(ch.ratio[i]).toBe(1);
      }
    }
  });

  it('CONST volume = 0 yields ratio = null', () => {
    const series = constBar(20, 10, 0);
    const ch = computeLineVolumeRatio(series, { length: 4 });
    for (let i = 3; i < 20; i += 1) {
      expect(ch.ratio[i]).toBe(null);
    }
  });

  it('LINEAR UP volume yields ratio = 2L/(L+1) dyadic at i=L-1, L=3 -> 1.5', () => {
    const series = linearUpVol(10);
    const ch = computeLineVolumeRatio(series, { length: 3 });
    expect(ch.ratio[2]).toBe(1.5);
  });

  it('LINEAR UP volume yields ratio = 2L/(L+1) dyadic at i=L-1, L=7 -> 1.75', () => {
    const series = linearUpVol(20);
    const ch = computeLineVolumeRatio(series, { length: 7 });
    expect(ch.ratio[6]).toBe(1.75);
  });

  it('LINEAR UP volume yields ratio = 2L/(L+1) dyadic at i=L-1, L=15 -> 1.875', () => {
    const series = linearUpVol(30);
    const ch = computeLineVolumeRatio(series, { length: 15 });
    expect(ch.ratio[14]).toBe(1.875);
  });

  it('warmup region is null', () => {
    const series = linearUpVol(20);
    const ch = computeLineVolumeRatio(series, { length: 4 });
    expect(ch.ratio[0]).toBe(null);
    expect(ch.ratio[2]).toBe(null);
    expect(ch.ratio[3]).toBeTypeOf('number');
  });

  it('output length matches input length', () => {
    const series = linearUpVol(20);
    const ch = computeLineVolumeRatio(series, { length: 4 });
    expect(ch.ratio.length).toBe(20);
  });

  it('does not mutate input', () => {
    const series = linearUpVol(20);
    const snap = JSON.parse(JSON.stringify(series));
    computeLineVolumeRatio(series, { length: 4 });
    expect(series).toEqual(snap);
  });

  it('avgVolume is correct SMA bit-exact for CONST', () => {
    const series = constBar(10, 10, 7);
    const ch = computeLineVolumeRatio(series, { length: 3 });
    for (let i = 2; i < 10; i += 1) {
      expect(ch.avgVolume[i]).toBe(7);
    }
  });
});

describe('classifyLineVolumeRatioZone', () => {
  it('classifies high', () => {
    expect(classifyLineVolumeRatioZone(2, 1.5, 0.5)).toBe('high');
  });

  it('classifies low', () => {
    expect(classifyLineVolumeRatioZone(0.3, 1.5, 0.5)).toBe('low');
  });

  it('classifies neutral', () => {
    expect(classifyLineVolumeRatioZone(1, 1.5, 0.5)).toBe('neutral');
  });

  it('returns none for null', () => {
    expect(classifyLineVolumeRatioZone(null, 1.5, 0.5)).toBe('none');
  });
});

describe('detectLineVolumeRatioCrosses', () => {
  it('returns nulls for warmup', () => {
    expect(detectLineVolumeRatioCrosses([null, null], 1.5, 0.5)).toEqual([
      null,
      null,
    ]);
  });

  it('flags up when entering high', () => {
    const ev = detectLineVolumeRatioCrosses([null, 1, 2], 1.5, 0.5);
    expect(ev[2]).toBe('up');
  });

  it('flags down when entering low', () => {
    const ev = detectLineVolumeRatioCrosses([null, 1, 0.3], 1.5, 0.5);
    expect(ev[2]).toBe('down');
  });

  it('first defined sample is not a cross', () => {
    expect(detectLineVolumeRatioCrosses([null, 2], 1.5, 0.5)[1]).toBe(null);
  });
});

describe('runLineVolumeRatio', () => {
  it('marks ok=false for short data', () => {
    const run = runLineVolumeRatio(constBar(3, 10), { length: 4 });
    expect(run.ok).toBe(false);
  });

  it('marks ok=true with enough data', () => {
    const run = runLineVolumeRatio(constBar(4, 10), { length: 4 });
    expect(run.ok).toBe(true);
  });

  it('uses default parameters', () => {
    const run = runLineVolumeRatio(constBar(30, 10));
    expect(run.length).toBe(DEFAULT_CHART_LINE_VOLUME_RATIO_LENGTH);
    expect(run.highThreshold).toBe(1.5);
    expect(run.lowThreshold).toBe(0.5);
  });

  it('respects explicit options', () => {
    const run = runLineVolumeRatio(constBar(30, 10), {
      length: 7,
      highThreshold: 2,
      lowThreshold: 0.25,
    });
    expect(run.length).toBe(7);
    expect(run.highThreshold).toBe(2);
    expect(run.lowThreshold).toBe(0.25);
  });

  it('sorts by x', () => {
    const data: ChartLineVolumeRatioPoint[] = [
      { x: 2, close: 30, volume: 1 },
      { x: 0, close: 10, volume: 1 },
      { x: 1, close: 20, volume: 1 },
    ];
    const run = runLineVolumeRatio(data, { length: 2 });
    expect(run.samples.map((s) => s.x)).toEqual([0, 1, 2]);
  });

  it('CONST volume classifies all post-warmup as neutral (ratio=1)', () => {
    const run = runLineVolumeRatio(constBar(20, 10, 3), { length: 4 });
    expect(run.neutralCount).toBe(17);
  });
});

describe('computeLineVolumeRatioLayout', () => {
  it('returns ok=false for empty data', () => {
    const layout = computeLineVolumeRatioLayout({ data: [] });
    expect(layout.ok).toBe(false);
  });

  it('returns ok=true for sufficient data', () => {
    const layout = computeLineVolumeRatioLayout({
      data: linearUpVol(30),
    });
    expect(layout.ok).toBe(true);
  });

  it('panels stack with price above ratio', () => {
    const layout = computeLineVolumeRatioLayout({
      data: linearUpVol(30),
    });
    expect(layout.priceBottom).toBeLessThan(layout.ratioTop);
  });

  it('produces a price path and dots', () => {
    const layout = computeLineVolumeRatioLayout({
      data: linearUpVol(30),
    });
    expect(layout.pricePath.startsWith('M')).toBe(true);
    expect(layout.priceDots.length).toBe(30);
  });

  it('ratio axis starts at 0', () => {
    const layout = computeLineVolumeRatioLayout({
      data: linearUpVol(30),
    });
    expect(layout.ratioMin).toBe(0);
  });

  it('threshold lines in ratio panel bounds', () => {
    const layout = computeLineVolumeRatioLayout({
      data: linearUpVol(30),
    });
    expect(layout.highY).toBeGreaterThanOrEqual(layout.ratioTop);
    expect(layout.highY).toBeLessThanOrEqual(layout.ratioBottom);
    expect(layout.lowY).toBeGreaterThanOrEqual(layout.ratioTop);
    expect(layout.lowY).toBeLessThanOrEqual(layout.ratioBottom);
  });
});

describe('describeLineVolumeRatioChart', () => {
  it('returns No data for empty input', () => {
    expect(describeLineVolumeRatioChart([])).toBe('No data');
  });

  it('mentions Volume Ratio', () => {
    const desc = describeLineVolumeRatioChart(linearUpVol(30));
    expect(desc).toContain('Volume Ratio');
  });

  it('reports parameters', () => {
    const desc = describeLineVolumeRatioChart(linearUpVol(30), {
      length: 7,
      highThreshold: 2,
      lowThreshold: 0.25,
    });
    expect(desc).toContain('length 7');
    expect(desc).toContain('highThreshold 2');
    expect(desc).toContain('lowThreshold 0.25');
  });
});

describe('<ChartLineVolumeRatio />', () => {
  it('renders empty placeholder for no data', () => {
    const { container } = render(<ChartLineVolumeRatio data={[]} />);
    expect(
      container.querySelector(
        '[data-section="chart-line-volume-ratio-empty"]',
      )?.textContent,
    ).toBe('No data');
  });

  it('renders region role with aria-label', () => {
    const { container } = render(
      <ChartLineVolumeRatio data={linearUpVol(30)} />,
    );
    const region = container.querySelector('[role="region"]');
    expect(region).toBeTruthy();
    expect(region?.getAttribute('aria-label')).toContain('Volume Ratio');
  });

  it('forwards ref', () => {
    const ref = createRef<HTMLDivElement>();
    render(<ChartLineVolumeRatio data={linearUpVol(30)} ref={ref} />);
    expect(ref.current).not.toBe(null);
  });

  it('exposes data attrs', () => {
    const { container } = render(
      <ChartLineVolumeRatio
        data={linearUpVol(30)}
        length={7}
        highThreshold={2}
        lowThreshold={0.25}
      />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-volume-ratio"]',
    );
    expect(root?.getAttribute('data-length')).toBe('7');
    expect(root?.getAttribute('data-high-threshold')).toBe('2');
    expect(root?.getAttribute('data-low-threshold')).toBe('0.25');
  });

  it('exposes total-points', () => {
    const { container } = render(
      <ChartLineVolumeRatio data={linearUpVol(30)} />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-volume-ratio"]',
    );
    expect(root?.getAttribute('data-total-points')).toBe('30');
  });

  it('renders the screen-reader description', () => {
    const { container } = render(
      <ChartLineVolumeRatio data={linearUpVol(30)} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-volume-ratio-aria-desc"]',
      )?.textContent,
    ).toContain('Volume Ratio');
  });

  it('renders both legend items', () => {
    const { container } = render(
      <ChartLineVolumeRatio data={linearUpVol(30)} />,
    );
    expect(container.querySelector('[data-series-id="price"]')).toBeTruthy();
    expect(container.querySelector('[data-series-id="ratio"]')).toBeTruthy();
  });

  it('toggles a series via the legend', () => {
    const onToggle = vi.fn();
    const { container } = render(
      <ChartLineVolumeRatio
        data={linearUpVol(30)}
        onSeriesToggle={onToggle}
      />,
    );
    const button = container.querySelector(
      '[data-series-id="ratio"]',
    ) as HTMLButtonElement | null;
    if (button) fireEvent.click(button);
    expect(onToggle).toHaveBeenCalledWith({
      seriesId: 'ratio',
      hidden: true,
    });
  });

  it('hides ratio when controlled hidden', () => {
    const { container } = render(
      <ChartLineVolumeRatio
        data={linearUpVol(30)}
        hiddenSeries={['ratio']}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-volume-ratio-line"]',
      ),
    ).toBe(null);
  });

  it('renders the config badge by default', () => {
    const { container } = render(
      <ChartLineVolumeRatio data={linearUpVol(30)} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-volume-ratio-badge"]',
      ),
    ).toBeTruthy();
  });

  it('renders thresholds by default', () => {
    const { container } = render(
      <ChartLineVolumeRatio data={linearUpVol(30)} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-volume-ratio-high-line"]',
      ),
    ).toBeTruthy();
    expect(
      container.querySelector(
        '[data-section="chart-line-volume-ratio-low-line"]',
      ),
    ).toBeTruthy();
  });

  it('hides thresholds when showThresholds is false', () => {
    const { container } = render(
      <ChartLineVolumeRatio
        data={linearUpVol(30)}
        showThresholds={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-volume-ratio-high-line"]',
      ),
    ).toBe(null);
  });

  it('renders midline by default', () => {
    const { container } = render(
      <ChartLineVolumeRatio data={linearUpVol(30)} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-volume-ratio-midline"]',
      ),
    ).toBeTruthy();
  });

  it('hides midline when showMidline is false', () => {
    const { container } = render(
      <ChartLineVolumeRatio data={linearUpVol(30)} showMidline={false} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-volume-ratio-midline"]',
      ),
    ).toBe(null);
  });

  it('hides axis when showAxis is false', () => {
    const { container } = render(
      <ChartLineVolumeRatio data={linearUpVol(30)} showAxis={false} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-volume-ratio-axes"]',
      ),
    ).toBe(null);
  });

  it('hides grid when showGrid is false', () => {
    const { container } = render(
      <ChartLineVolumeRatio data={linearUpVol(30)} showGrid={false} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-volume-ratio-grid"]',
      ),
    ).toBe(null);
  });

  it('hides legend when showLegend is false', () => {
    const { container } = render(
      <ChartLineVolumeRatio data={linearUpVol(30)} showLegend={false} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-volume-ratio-legend"]',
      ),
    ).toBe(null);
  });

  it('applies className and style', () => {
    const { container } = render(
      <ChartLineVolumeRatio
        data={linearUpVol(30)}
        className="custom-class"
        style={{ background: 'red' }}
      />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-volume-ratio"]',
    );
    expect(root?.classList.contains('custom-class')).toBe(true);
    expect((root as HTMLElement | null)?.style.background).toBe('red');
  });

  it('animate=false disables fade-in class', () => {
    const { container } = render(
      <ChartLineVolumeRatio
        data={linearUpVol(30)}
        animate={false}
      />,
    );
    const svg = container.querySelector(
      '[data-section="chart-line-volume-ratio-svg"]',
    );
    expect(svg?.classList.contains('motion-safe:animate-fade-in')).toBe(
      false,
    );
  });

  it('renders the ratio line by default', () => {
    const { container } = render(
      <ChartLineVolumeRatio data={linearUpVol(30)} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-volume-ratio-line"]',
      ),
    ).toBeTruthy();
  });

  it('renders the price path', () => {
    const { container } = render(
      <ChartLineVolumeRatio data={linearUpVol(30)} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-volume-ratio-price-path"]',
      ),
    ).toBeTruthy();
  });

  it('respects defaultHiddenSeries on uncontrolled mount', () => {
    const { container } = render(
      <ChartLineVolumeRatio
        data={linearUpVol(30)}
        defaultHiddenSeries={['ratio']}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-volume-ratio-line"]',
      ),
    ).toBe(null);
  });
});

describe('Volume Ratio integration', () => {
  it('CONST positive volume yields ratio = 1 across (K, length, V)', () => {
    for (const K of [0, 1, 5, 100, -3]) {
      for (const L of [2, 4, 7, 10]) {
        for (const V of [1, 5, 100]) {
          const total = L + 5;
          const series = constBar(total, K, V);
          const ch = computeLineVolumeRatio(series, { length: L });
          for (let i = L - 1; i < total; i += 1) {
            expect(ch.ratio[i]).toBe(1);
          }
        }
      }
    }
  });

  it('CONST zero volume yields ratio = null across (K, length)', () => {
    for (const K of [0, 1, 5]) {
      for (const L of [2, 4, 10]) {
        const total = L + 5;
        const series = constBar(total, K, 0);
        const ch = computeLineVolumeRatio(series, { length: L });
        for (let i = L - 1; i < total; i += 1) {
          expect(ch.ratio[i]).toBe(null);
        }
      }
    }
  });

  it('LINEAR UP volume at i=L-1 yields 2L/(L+1) for dyadic L', () => {
    const expected: Record<number, number> = {
      3: 1.5,
      7: 1.75,
      15: 1.875,
    };
    for (const [L, exp] of Object.entries(expected)) {
      const LL = Number(L);
      const series = linearUpVol(LL * 3);
      const ch = computeLineVolumeRatio(series, { length: LL });
      expect(ch.ratio[LL - 1]).toBe(exp);
    }
  });
});
