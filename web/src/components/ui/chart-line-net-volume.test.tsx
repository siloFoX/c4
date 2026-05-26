import { describe, expect, it, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { createRef } from 'react';
import {
  ChartLineNetVolume,
  classifyLineNetVolumeDirections,
  classifyLineNetVolumeZone,
  computeLineNetVolume,
  computeLineNetVolumeLayout,
  describeLineNetVolumeChart,
  detectLineNetVolumeCrosses,
  getLineNetVolumeFinitePoints,
  normalizeLineNetVolumeLength,
  normalizeLineNetVolumeThreshold,
  runLineNetVolume,
  DEFAULT_CHART_LINE_NET_VOLUME_LENGTH,
} from './chart-line-net-volume';
import type { ChartLineNetVolumePoint } from './chart-line-net-volume';

const constBar = (
  count: number,
  K: number,
  V = 1,
): ChartLineNetVolumePoint[] =>
  Array.from({ length: count }, (_, i) => ({ x: i, close: K, volume: V }));

const linearUp = (count: number, V = 1): ChartLineNetVolumePoint[] =>
  Array.from({ length: count }, (_, i) => ({
    x: i,
    close: i + 1,
    volume: V,
  }));

const linearDown = (count: number, V = 1): ChartLineNetVolumePoint[] =>
  Array.from({ length: count }, (_, i) => ({
    x: i,
    close: count - i,
    volume: V,
  }));

describe('getLineNetVolumeFinitePoints', () => {
  it('returns an empty array for null', () => {
    expect(getLineNetVolumeFinitePoints(null)).toEqual([]);
  });

  it('drops non-finite close', () => {
    const r = getLineNetVolumeFinitePoints([
      { x: 0, close: Number.NaN, volume: 1 },
      { x: 1, close: 10, volume: 1 },
    ]);
    expect(r.length).toBe(1);
  });

  it('drops negative volume', () => {
    const r = getLineNetVolumeFinitePoints([
      { x: 0, close: 10, volume: -1 },
      { x: 1, close: 10, volume: 1 },
    ]);
    expect(r.length).toBe(1);
  });

  it('keeps zero volume', () => {
    const r = getLineNetVolumeFinitePoints([
      { x: 0, close: 10, volume: 0 },
      { x: 1, close: 10, volume: 1 },
    ]);
    expect(r.length).toBe(2);
  });

  it('drops null entries', () => {
    const r = getLineNetVolumeFinitePoints([
      null as unknown as ChartLineNetVolumePoint,
      { x: 1, close: 10, volume: 1 },
    ]);
    expect(r.length).toBe(1);
  });
});

describe('normalizeLineNetVolumeLength', () => {
  it('returns default when undefined', () => {
    expect(normalizeLineNetVolumeLength(undefined, 20)).toBe(20);
  });

  it('rejects below 2', () => {
    expect(normalizeLineNetVolumeLength(1, 20)).toBe(20);
  });

  it('floors fractional', () => {
    expect(normalizeLineNetVolumeLength(7.7, 20)).toBe(7);
  });
});

describe('normalizeLineNetVolumeThreshold', () => {
  it('returns default when undefined', () => {
    expect(normalizeLineNetVolumeThreshold(undefined, 30)).toBe(30);
  });

  it('accepts -100 and 100', () => {
    expect(normalizeLineNetVolumeThreshold(-100, 30)).toBe(-100);
    expect(normalizeLineNetVolumeThreshold(100, 30)).toBe(100);
  });

  it('rejects out of range', () => {
    expect(normalizeLineNetVolumeThreshold(-101, 30)).toBe(30);
    expect(normalizeLineNetVolumeThreshold(101, 30)).toBe(30);
  });
});

describe('classifyLineNetVolumeDirections', () => {
  it('first bar is flat', () => {
    expect(classifyLineNetVolumeDirections([1, 2, 3])[0]).toBe('flat');
  });

  it('up when close ascends', () => {
    expect(classifyLineNetVolumeDirections([1, 2])[1]).toBe('up');
  });

  it('down when close descends', () => {
    expect(classifyLineNetVolumeDirections([2, 1])[1]).toBe('down');
  });

  it('flat when equal', () => {
    expect(classifyLineNetVolumeDirections([5, 5])[1]).toBe('flat');
  });
});

describe('computeLineNetVolume', () => {
  it('returns empty for null', () => {
    const ch = computeLineNetVolume(null);
    expect(ch.net).toEqual([]);
  });

  it('CONST close yields net = 0 bit-exact (positive volume)', () => {
    for (const K of [0, 1, 5, 100, -3]) {
      const series = constBar(20, K, 5);
      const ch = computeLineNetVolume(series, { length: 4 });
      for (let i = 3; i < 20; i += 1) {
        expect(ch.net[i]).toBe(0);
      }
    }
  });

  it('CONST close yields net = null when totalVol = 0', () => {
    const series = constBar(20, 10, 0);
    const ch = computeLineNetVolume(series, { length: 4 });
    for (let i = 3; i < 20; i += 1) {
      expect(ch.net[i]).toBe(null);
    }
  });

  it('LINEAR UP yields net = 100 bit-exact from index L onward', () => {
    const series = linearUp(20, 3);
    const ch = computeLineNetVolume(series, { length: 4 });
    for (let i = 4; i < 20; i += 1) {
      expect(ch.net[i]).toBe(100);
    }
  });

  it('LINEAR DOWN yields net = -100 bit-exact from index L onward', () => {
    const series = linearDown(20, 3);
    const ch = computeLineNetVolume(series, { length: 4 });
    for (let i = 4; i < 20; i += 1) {
      expect(ch.net[i]).toBe(-100);
    }
  });

  it('first window of LINEAR UP at index L-1 is (L-1)/L*100 = 75 for L=4', () => {
    const series = linearUp(10, 1);
    const ch = computeLineNetVolume(series, { length: 4 });
    expect(ch.net[3]).toBe(75);
  });

  it('warmup region is null', () => {
    const series = linearUp(20);
    const ch = computeLineNetVolume(series, { length: 4 });
    expect(ch.net[0]).toBe(null);
    expect(ch.net[2]).toBe(null);
    expect(ch.net[3]).toBeTypeOf('number');
  });

  it('output length matches input length', () => {
    const series = linearUp(20);
    const ch = computeLineNetVolume(series, { length: 4 });
    expect(ch.net.length).toBe(20);
  });

  it('does not mutate input', () => {
    const series = linearUp(20);
    const snap = JSON.parse(JSON.stringify(series));
    computeLineNetVolume(series, { length: 4 });
    expect(series).toEqual(snap);
  });

  it('upVolume and downVolume sum to totalVolume', () => {
    const series = linearUp(20, 7);
    const ch = computeLineNetVolume(series, { length: 4 });
    for (let i = 3; i < 20; i += 1) {
      const tot = ch.totalVolume[i] ?? 0;
      const u = ch.upVolume[i] ?? 0;
      const d = ch.downVolume[i] ?? 0;
      expect(u + d).toBeLessThanOrEqual(tot);
    }
  });
});

describe('classifyLineNetVolumeZone', () => {
  it('classifies overbought', () => {
    expect(classifyLineNetVolumeZone(50, 30, -30)).toBe('overbought');
  });

  it('classifies oversold', () => {
    expect(classifyLineNetVolumeZone(-50, 30, -30)).toBe('oversold');
  });

  it('classifies neutral', () => {
    expect(classifyLineNetVolumeZone(10, 30, -30)).toBe('neutral');
  });

  it('returns none for null', () => {
    expect(classifyLineNetVolumeZone(null, 30, -30)).toBe('none');
  });
});

describe('detectLineNetVolumeCrosses', () => {
  it('returns nulls for warmup', () => {
    expect(detectLineNetVolumeCrosses([null, null], 30, -30)).toEqual([
      null,
      null,
    ]);
  });

  it('flags up when entering overbought', () => {
    const ev = detectLineNetVolumeCrosses([null, 10, 50], 30, -30);
    expect(ev[2]).toBe('up');
  });

  it('flags down when entering oversold', () => {
    const ev = detectLineNetVolumeCrosses([null, -10, -50], 30, -30);
    expect(ev[2]).toBe('down');
  });

  it('first defined sample is not a cross', () => {
    expect(detectLineNetVolumeCrosses([null, 50], 30, -30)[1]).toBe(null);
  });
});

describe('runLineNetVolume', () => {
  it('marks ok=false for short data', () => {
    const run = runLineNetVolume(constBar(3, 10), { length: 4 });
    expect(run.ok).toBe(false);
  });

  it('marks ok=true with enough data', () => {
    const run = runLineNetVolume(constBar(4, 10), { length: 4 });
    expect(run.ok).toBe(true);
  });

  it('uses default parameters', () => {
    const run = runLineNetVolume(constBar(30, 10));
    expect(run.length).toBe(DEFAULT_CHART_LINE_NET_VOLUME_LENGTH);
    expect(run.overbought).toBe(30);
    expect(run.oversold).toBe(-30);
  });

  it('respects explicit options', () => {
    const run = runLineNetVolume(constBar(30, 10), {
      length: 7,
      overbought: 50,
      oversold: -50,
    });
    expect(run.length).toBe(7);
    expect(run.overbought).toBe(50);
    expect(run.oversold).toBe(-50);
  });

  it('sorts by x', () => {
    const data: ChartLineNetVolumePoint[] = [
      { x: 2, close: 30, volume: 1 },
      { x: 0, close: 10, volume: 1 },
      { x: 1, close: 20, volume: 1 },
    ];
    const run = runLineNetVolume(data, { length: 2 });
    expect(run.samples.map((s) => s.x)).toEqual([0, 1, 2]);
  });

  it('LINEAR UP classifies as overbought from index L', () => {
    const run = runLineNetVolume(linearUp(20), { length: 4 });
    expect(run.overboughtCount).toBe(17);
  });

  it('LINEAR DOWN classifies as oversold from index L', () => {
    const run = runLineNetVolume(linearDown(20), { length: 4 });
    expect(run.oversoldCount).toBe(17);
  });

  it('CONST classifies as neutral (net=0) post-warmup', () => {
    const run = runLineNetVolume(constBar(20, 10, 3), { length: 4 });
    expect(run.neutralCount).toBe(17);
  });
});

describe('computeLineNetVolumeLayout', () => {
  it('returns ok=false for empty data', () => {
    const layout = computeLineNetVolumeLayout({ data: [] });
    expect(layout.ok).toBe(false);
  });

  it('returns ok=true for sufficient data', () => {
    const layout = computeLineNetVolumeLayout({ data: linearUp(30) });
    expect(layout.ok).toBe(true);
  });

  it('panels stack with price above net', () => {
    const layout = computeLineNetVolumeLayout({ data: linearUp(30) });
    expect(layout.priceBottom).toBeLessThan(layout.netTop);
  });

  it('net axis is fixed [-100, 100]', () => {
    const layout = computeLineNetVolumeLayout({ data: linearUp(30) });
    expect(layout.netMin).toBe(-100);
    expect(layout.netMax).toBe(100);
  });

  it('produces a price path and dots', () => {
    const layout = computeLineNetVolumeLayout({ data: linearUp(30) });
    expect(layout.pricePath.startsWith('M')).toBe(true);
    expect(layout.priceDots.length).toBe(30);
  });

  it('threshold lines in net panel bounds', () => {
    const layout = computeLineNetVolumeLayout({ data: linearUp(30) });
    expect(layout.overboughtY).toBeGreaterThanOrEqual(layout.netTop);
    expect(layout.overboughtY).toBeLessThanOrEqual(layout.netBottom);
    expect(layout.oversoldY).toBeGreaterThanOrEqual(layout.netTop);
    expect(layout.oversoldY).toBeLessThanOrEqual(layout.netBottom);
  });
});

describe('describeLineNetVolumeChart', () => {
  it('returns No data for empty input', () => {
    expect(describeLineNetVolumeChart([])).toBe('No data');
  });

  it('mentions Net Volume', () => {
    const desc = describeLineNetVolumeChart(linearUp(30));
    expect(desc).toContain('Net Volume');
  });

  it('reports parameters', () => {
    const desc = describeLineNetVolumeChart(linearUp(30), {
      length: 7,
      overbought: 50,
      oversold: -40,
    });
    expect(desc).toContain('length 7');
    expect(desc).toContain('overbought 50');
    expect(desc).toContain('oversold -40');
  });
});

describe('<ChartLineNetVolume />', () => {
  it('renders empty placeholder for no data', () => {
    const { container } = render(<ChartLineNetVolume data={[]} />);
    expect(
      container.querySelector(
        '[data-section="chart-line-net-volume-empty"]',
      )?.textContent,
    ).toBe('No data');
  });

  it('renders region role with aria-label', () => {
    const { container } = render(<ChartLineNetVolume data={linearUp(30)} />);
    const region = container.querySelector('[role="region"]');
    expect(region).toBeTruthy();
    expect(region?.getAttribute('aria-label')).toContain('Net Volume');
  });

  it('forwards ref', () => {
    const ref = createRef<HTMLDivElement>();
    render(<ChartLineNetVolume data={linearUp(30)} ref={ref} />);
    expect(ref.current).not.toBe(null);
  });

  it('exposes data attrs', () => {
    const { container } = render(
      <ChartLineNetVolume
        data={linearUp(30)}
        length={7}
        overbought={50}
        oversold={-50}
      />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-net-volume"]',
    );
    expect(root?.getAttribute('data-length')).toBe('7');
    expect(root?.getAttribute('data-overbought')).toBe('50');
    expect(root?.getAttribute('data-oversold')).toBe('-50');
  });

  it('exposes total-points', () => {
    const { container } = render(<ChartLineNetVolume data={linearUp(30)} />);
    const root = container.querySelector(
      '[data-section="chart-line-net-volume"]',
    );
    expect(root?.getAttribute('data-total-points')).toBe('30');
  });

  it('renders the screen-reader description', () => {
    const { container } = render(<ChartLineNetVolume data={linearUp(30)} />);
    expect(
      container.querySelector(
        '[data-section="chart-line-net-volume-aria-desc"]',
      )?.textContent,
    ).toContain('Net Volume');
  });

  it('renders both legend items', () => {
    const { container } = render(<ChartLineNetVolume data={linearUp(30)} />);
    expect(container.querySelector('[data-series-id="price"]')).toBeTruthy();
    expect(container.querySelector('[data-series-id="net"]')).toBeTruthy();
  });

  it('toggles a series via the legend', () => {
    const onToggle = vi.fn();
    const { container } = render(
      <ChartLineNetVolume
        data={linearUp(30)}
        onSeriesToggle={onToggle}
      />,
    );
    const button = container.querySelector(
      '[data-series-id="net"]',
    ) as HTMLButtonElement | null;
    if (button) fireEvent.click(button);
    expect(onToggle).toHaveBeenCalledWith({
      seriesId: 'net',
      hidden: true,
    });
  });

  it('hides net when controlled hidden', () => {
    const { container } = render(
      <ChartLineNetVolume
        data={linearUp(30)}
        hiddenSeries={['net']}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-net-volume-line"]',
      ),
    ).toBe(null);
  });

  it('renders the config badge by default', () => {
    const { container } = render(<ChartLineNetVolume data={linearUp(30)} />);
    expect(
      container.querySelector(
        '[data-section="chart-line-net-volume-badge"]',
      ),
    ).toBeTruthy();
  });

  it('renders thresholds by default', () => {
    const { container } = render(<ChartLineNetVolume data={linearUp(30)} />);
    expect(
      container.querySelector(
        '[data-section="chart-line-net-volume-overbought-line"]',
      ),
    ).toBeTruthy();
    expect(
      container.querySelector(
        '[data-section="chart-line-net-volume-oversold-line"]',
      ),
    ).toBeTruthy();
  });

  it('hides thresholds when showThresholds is false', () => {
    const { container } = render(
      <ChartLineNetVolume
        data={linearUp(30)}
        showThresholds={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-net-volume-overbought-line"]',
      ),
    ).toBe(null);
  });

  it('renders midline by default', () => {
    const { container } = render(<ChartLineNetVolume data={linearUp(30)} />);
    expect(
      container.querySelector(
        '[data-section="chart-line-net-volume-midline"]',
      ),
    ).toBeTruthy();
  });

  it('hides midline when showMidline is false', () => {
    const { container } = render(
      <ChartLineNetVolume data={linearUp(30)} showMidline={false} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-net-volume-midline"]',
      ),
    ).toBe(null);
  });

  it('hides axis when showAxis is false', () => {
    const { container } = render(
      <ChartLineNetVolume data={linearUp(30)} showAxis={false} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-net-volume-axes"]',
      ),
    ).toBe(null);
  });

  it('hides grid when showGrid is false', () => {
    const { container } = render(
      <ChartLineNetVolume data={linearUp(30)} showGrid={false} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-net-volume-grid"]',
      ),
    ).toBe(null);
  });

  it('hides legend when showLegend is false', () => {
    const { container } = render(
      <ChartLineNetVolume data={linearUp(30)} showLegend={false} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-net-volume-legend"]',
      ),
    ).toBe(null);
  });

  it('applies className and style', () => {
    const { container } = render(
      <ChartLineNetVolume
        data={linearUp(30)}
        className="custom-class"
        style={{ background: 'red' }}
      />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-net-volume"]',
    );
    expect(root?.classList.contains('custom-class')).toBe(true);
    expect((root as HTMLElement | null)?.style.background).toBe('red');
  });

  it('animate=false disables fade-in class', () => {
    const { container } = render(
      <ChartLineNetVolume data={linearUp(30)} animate={false} />,
    );
    const svg = container.querySelector(
      '[data-section="chart-line-net-volume-svg"]',
    );
    expect(svg?.classList.contains('motion-safe:animate-fade-in')).toBe(
      false,
    );
  });

  it('renders the net line by default', () => {
    const { container } = render(<ChartLineNetVolume data={linearUp(30)} />);
    expect(
      container.querySelector(
        '[data-section="chart-line-net-volume-line"]',
      ),
    ).toBeTruthy();
  });

  it('renders the price path', () => {
    const { container } = render(<ChartLineNetVolume data={linearUp(30)} />);
    expect(
      container.querySelector(
        '[data-section="chart-line-net-volume-price-path"]',
      ),
    ).toBeTruthy();
  });

  it('respects defaultHiddenSeries on uncontrolled mount', () => {
    const { container } = render(
      <ChartLineNetVolume
        data={linearUp(30)}
        defaultHiddenSeries={['net']}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-net-volume-line"]',
      ),
    ).toBe(null);
  });
});

describe('Net Volume integration', () => {
  it('CONST yields net = 0 across (K, length, V) when V > 0', () => {
    for (const K of [0, 1, 5, 100, -3]) {
      for (const L of [2, 4, 7, 10]) {
        for (const V of [1, 5, 100]) {
          const total = L + 5;
          const series = constBar(total, K, V);
          const ch = computeLineNetVolume(series, { length: L });
          for (let i = L - 1; i < total; i += 1) {
            expect(ch.net[i]).toBe(0);
          }
        }
      }
    }
  });

  it('LINEAR UP yields net = 100 across (length, V) from index L', () => {
    for (const L of [2, 4, 7, 10]) {
      for (const V of [1, 5, 100]) {
        const total = L + 5;
        const series = linearUp(total, V);
        const ch = computeLineNetVolume(series, { length: L });
        for (let i = L; i < total; i += 1) {
          expect(ch.net[i]).toBe(100);
        }
      }
    }
  });

  it('LINEAR DOWN yields net = -100 across (length, V) from index L', () => {
    for (const L of [2, 4, 7, 10]) {
      for (const V of [1, 5, 100]) {
        const total = L + 5;
        const series = linearDown(total, V);
        const ch = computeLineNetVolume(series, { length: L });
        for (let i = L; i < total; i += 1) {
          expect(ch.net[i]).toBe(-100);
        }
      }
    }
  });
});
