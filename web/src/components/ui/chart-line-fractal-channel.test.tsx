import { describe, expect, it, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { createRef } from 'react';
import {
  ChartLineFractalChannel,
  classifyLineFractalChannelZone,
  computeLineFractalChannel,
  computeLineFractalChannelLayout,
  describeLineFractalChannelChart,
  detectLineFractalChannelCrosses,
  detectLineFractalChannelLowerFractals,
  detectLineFractalChannelUpperFractals,
  getLineFractalChannelFinitePoints,
  normalizeLineFractalChannelFractalLookback,
  normalizeLineFractalChannelLength,
  runLineFractalChannel,
  DEFAULT_CHART_LINE_FRACTAL_CHANNEL_LENGTH,
} from './chart-line-fractal-channel';
import type { ChartLineFractalChannelPoint } from './chart-line-fractal-channel';

const constBar = (count: number, K: number): ChartLineFractalChannelPoint[] =>
  Array.from({ length: count }, (_, i) => ({
    x: i,
    high: K,
    low: K,
    close: K,
  }));

const linearUp = (count: number): ChartLineFractalChannelPoint[] =>
  Array.from({ length: count }, (_, i) => ({
    x: i,
    high: i + 1,
    low: i + 1,
    close: i + 1,
  }));

/**
 * Sawtooth with peaks at indices 2, 6, 10, ... at fixed high `peakK`
 * and troughs at indices 4, 8, 12, ... at fixed low `troughL`.
 * Spacing 4 between peaks keeps every peak/trough strictly extremal
 * inside its 5-bar window.
 */
const sawtooth = (
  count: number,
  peakK: number,
  troughL: number,
): ChartLineFractalChannelPoint[] => {
  return Array.from({ length: count }, (_, i) => {
    let h: number;
    let l: number;
    const mod = i % 4;
    if (mod === 2) {
      h = peakK;
      l = peakK;
    } else if (mod === 0) {
      // trough at i % 4 == 0 (excluding i=0 which won't confirm anyway)
      h = troughL;
      l = troughL;
    } else {
      // intermediate
      h = (peakK + troughL) / 2;
      l = (peakK + troughL) / 2;
    }
    return { x: i, high: h, low: l, close: (h + l) / 2 };
  });
};

describe('getLineFractalChannelFinitePoints', () => {
  it('returns an empty array for null', () => {
    expect(getLineFractalChannelFinitePoints(null)).toEqual([]);
  });

  it('drops non-finite high', () => {
    const r = getLineFractalChannelFinitePoints([
      { x: 0, high: Number.NaN, low: 5, close: 7 },
      { x: 1, high: 10, low: 5, close: 7 },
    ]);
    expect(r.length).toBe(1);
  });

  it('drops null entries', () => {
    const r = getLineFractalChannelFinitePoints([
      null as unknown as ChartLineFractalChannelPoint,
      { x: 1, high: 10, low: 5, close: 7 },
    ]);
    expect(r.length).toBe(1);
  });
});

describe('normalizeLineFractalChannelLength', () => {
  it('returns default when undefined', () => {
    expect(normalizeLineFractalChannelLength(undefined, 50)).toBe(50);
  });

  it('rejects below 2', () => {
    expect(normalizeLineFractalChannelLength(1, 50)).toBe(50);
  });

  it('floors fractional', () => {
    expect(normalizeLineFractalChannelLength(7.7, 50)).toBe(7);
  });
});

describe('normalizeLineFractalChannelFractalLookback', () => {
  it('returns default when undefined', () => {
    expect(normalizeLineFractalChannelFractalLookback(undefined, 2)).toBe(2);
  });

  it('accepts 1', () => {
    expect(normalizeLineFractalChannelFractalLookback(1, 2)).toBe(1);
  });

  it('rejects zero', () => {
    expect(normalizeLineFractalChannelFractalLookback(0, 2)).toBe(2);
  });
});

describe('detectLineFractalChannelUpperFractals', () => {
  it('flags strict 5-bar maxima', () => {
    const out = detectLineFractalChannelUpperFractals(
      [1, 2, 5, 2, 1, 0, 1, 2, 6, 2, 1],
      2,
    );
    expect(out[2]).toBe(true);
    expect(out[8]).toBe(true);
  });

  it('does not flag plateau (non-strict)', () => {
    const out = detectLineFractalChannelUpperFractals([1, 5, 5, 5, 1], 2);
    expect(out[2]).toBe(false);
  });

  it('LINEAR UP yields no fractals', () => {
    const out = detectLineFractalChannelUpperFractals([1, 2, 3, 4, 5], 2);
    for (const v of out) expect(v).toBe(false);
  });
});

describe('detectLineFractalChannelLowerFractals', () => {
  it('flags strict 5-bar minima', () => {
    const out = detectLineFractalChannelLowerFractals(
      [5, 4, 1, 4, 5, 6, 5, 4, 0, 4, 5],
      2,
    );
    expect(out[2]).toBe(true);
    expect(out[8]).toBe(true);
  });

  it('LINEAR DOWN yields no fractals', () => {
    const out = detectLineFractalChannelLowerFractals([5, 4, 3, 2, 1], 2);
    for (const v of out) expect(v).toBe(false);
  });
});

describe('computeLineFractalChannel', () => {
  it('returns empty for null', () => {
    const ch = computeLineFractalChannel(null);
    expect(ch.upper).toEqual([]);
  });

  it('CONST h=l=K yields upper=lower=null (no fractals)', () => {
    const series = constBar(30, 10);
    const ch = computeLineFractalChannel(series, {
      length: 20,
      fractalLookback: 2,
    });
    for (let i = 0; i < 30; i += 1) {
      expect(ch.upper[i]).toBe(null);
      expect(ch.lower[i]).toBe(null);
    }
  });

  it('LINEAR UP yields upper=lower=null (no fractals)', () => {
    const series = linearUp(30);
    const ch = computeLineFractalChannel(series, { length: 20 });
    for (let i = 0; i < 30; i += 1) {
      expect(ch.upper[i]).toBe(null);
      expect(ch.lower[i]).toBe(null);
    }
  });

  it('SAWTOOTH yields upper=peakK and lower=troughL bit-exact', () => {
    const peakK = 5;
    const troughL = 1;
    const series = sawtooth(40, peakK, troughL);
    const ch = computeLineFractalChannel(series, { length: 20 });

    // Find the first index where both an upper and lower fractal have
    // confirmed within the lookback window.
    let firstReady = -1;
    for (let i = 0; i < 40; i += 1) {
      if (ch.upper[i] != null && ch.lower[i] != null) {
        firstReady = i;
        break;
      }
    }
    expect(firstReady).toBeGreaterThan(0);

    for (let i = firstReady; i < 40; i += 1) {
      if (ch.upper[i] != null) expect(ch.upper[i]).toBe(peakK);
      if (ch.lower[i] != null) expect(ch.lower[i]).toBe(troughL);
    }
  });

  it('SAWTOOTH width = peakK - troughL bit-exact', () => {
    const peakK = 10;
    const troughL = 2;
    const series = sawtooth(40, peakK, troughL);
    const ch = computeLineFractalChannel(series, { length: 20 });
    for (let i = 0; i < 40; i += 1) {
      if (ch.upper[i] != null && ch.lower[i] != null) {
        expect(ch.width[i]).toBe(peakK - troughL);
      }
    }
  });

  it('output length matches input length', () => {
    const series = sawtooth(40, 5, 1);
    const ch = computeLineFractalChannel(series, { length: 20 });
    expect(ch.upper.length).toBe(40);
    expect(ch.lower.length).toBe(40);
  });

  it('does not mutate input', () => {
    const series = sawtooth(40, 5, 1);
    const snap = JSON.parse(JSON.stringify(series));
    computeLineFractalChannel(series, { length: 20 });
    expect(series).toEqual(snap);
  });

  it('channel scrolls off when fractal exits window', () => {
    // Build a series with exactly one upper fractal then many flats.
    const series: ChartLineFractalChannelPoint[] = [];
    series.push({ x: 0, high: 1, low: 1, close: 1 });
    series.push({ x: 1, high: 2, low: 2, close: 2 });
    series.push({ x: 2, high: 5, low: 5, close: 5 }); // upper fractal
    series.push({ x: 3, high: 2, low: 2, close: 2 });
    series.push({ x: 4, high: 1, low: 1, close: 1 });
    // confirmation arrives at index 4 (= pivot + 2)
    // window length 3, so fractal-at index for index 4 is upper=5.
    // At index 6 onwards (pivot 4 -> upperFractalAt[index 6] of window
    // [4..6] no longer contains the upper fractal confirmation index).
    for (let i = 5; i < 12; i += 1) {
      series.push({ x: i, high: 1, low: 1, close: 1 });
    }

    const ch = computeLineFractalChannel(series, {
      length: 3,
      fractalLookback: 2,
    });
    expect(ch.upper[4]).toBe(5);
    // After window slides past confirmation index 4, value should be null
    // again (with length=3, confirmation at 4 covers windows ending at
    // 4, 5, 6; at index 7 the window is [5..7] and no confirmation
    // sits there).
    expect(ch.upper[7]).toBe(null);
  });
});

describe('classifyLineFractalChannelZone', () => {
  it('classifies above when close > upper', () => {
    expect(classifyLineFractalChannelZone(11, 10, 5)).toBe('above');
  });

  it('classifies below when close < lower', () => {
    expect(classifyLineFractalChannelZone(4, 10, 5)).toBe('below');
  });

  it('classifies inside when close in [lower, upper]', () => {
    expect(classifyLineFractalChannelZone(7, 10, 5)).toBe('inside');
  });

  it('returns none when bands are null', () => {
    expect(classifyLineFractalChannelZone(7, null, null)).toBe('none');
  });
});

describe('detectLineFractalChannelCrosses', () => {
  it('flags up when going from inside to above', () => {
    const ev = detectLineFractalChannelCrosses(
      [5, 11],
      [10, 10],
      [0, 0],
    );
    expect(ev[1]).toBe('up');
  });

  it('flags down when going from inside to below', () => {
    const ev = detectLineFractalChannelCrosses(
      [5, -1],
      [10, 10],
      [0, 0],
    );
    expect(ev[1]).toBe('down');
  });

  it('warmup is null', () => {
    const ev = detectLineFractalChannelCrosses(
      [5, 11],
      [null, 10],
      [null, 0],
    );
    expect(ev[0]).toBe(null);
    expect(ev[1]).toBe(null);
  });
});

describe('runLineFractalChannel', () => {
  it('marks ok=false for short data', () => {
    const run = runLineFractalChannel(constBar(3, 10), {
      fractalLookback: 2,
    });
    expect(run.ok).toBe(false);
  });

  it('marks ok=true with enough data', () => {
    const run = runLineFractalChannel(constBar(10, 10), {
      fractalLookback: 2,
    });
    expect(run.ok).toBe(true);
  });

  it('uses default parameters', () => {
    const run = runLineFractalChannel(constBar(20, 10));
    expect(run.length).toBe(DEFAULT_CHART_LINE_FRACTAL_CHANNEL_LENGTH);
    expect(run.fractalLookback).toBe(2);
  });

  it('respects explicit options', () => {
    const run = runLineFractalChannel(constBar(20, 10), {
      length: 7,
      fractalLookback: 3,
    });
    expect(run.length).toBe(7);
    expect(run.fractalLookback).toBe(3);
  });

  it('sorts by x', () => {
    const data: ChartLineFractalChannelPoint[] = [
      { x: 2, high: 12, low: 10, close: 11 },
      { x: 0, high: 12, low: 10, close: 11 },
      { x: 1, high: 12, low: 10, close: 11 },
    ];
    const run = runLineFractalChannel(data);
    expect(run.samples.map((s) => s.x)).toEqual([0, 1, 2]);
  });

  it('SAWTOOTH counts fractals', () => {
    const run = runLineFractalChannel(sawtooth(40, 5, 1), {
      length: 20,
    });
    expect(run.upperFractalCount).toBeGreaterThan(0);
    expect(run.lowerFractalCount).toBeGreaterThan(0);
  });
});

describe('computeLineFractalChannelLayout', () => {
  it('returns ok=false for empty data', () => {
    const layout = computeLineFractalChannelLayout({ data: [] });
    expect(layout.ok).toBe(false);
  });

  it('returns ok=true for sufficient data', () => {
    const layout = computeLineFractalChannelLayout({
      data: sawtooth(40, 5, 1),
    });
    expect(layout.ok).toBe(true);
  });

  it('produces a price path and dots', () => {
    const layout = computeLineFractalChannelLayout({
      data: sawtooth(40, 5, 1),
    });
    expect(layout.pricePath.startsWith('M')).toBe(true);
    expect(layout.priceDots.length).toBe(40);
  });

  it('band paths exist when fractals confirm', () => {
    const layout = computeLineFractalChannelLayout({
      data: sawtooth(40, 5, 1),
    });
    expect(layout.upperPath.length).toBeGreaterThan(0);
    expect(layout.lowerPath.length).toBeGreaterThan(0);
  });

  it('CONST has empty band paths (no fractals)', () => {
    const layout = computeLineFractalChannelLayout({
      data: constBar(40, 10),
    });
    expect(layout.upperPath).toBe('');
    expect(layout.lowerPath).toBe('');
  });
});

describe('describeLineFractalChannelChart', () => {
  it('returns No data for empty input', () => {
    expect(describeLineFractalChannelChart([])).toBe('No data');
  });

  it('mentions Fractal Channel', () => {
    const desc = describeLineFractalChannelChart(sawtooth(40, 5, 1));
    expect(desc).toContain('Fractal Channel');
  });

  it('reports parameters', () => {
    const desc = describeLineFractalChannelChart(sawtooth(40, 5, 1), {
      length: 7,
      fractalLookback: 3,
    });
    expect(desc).toContain('length 7');
    expect(desc).toContain('fractalLookback 3');
  });
});

describe('<ChartLineFractalChannel />', () => {
  it('renders empty placeholder for no data', () => {
    const { container } = render(<ChartLineFractalChannel data={[]} />);
    expect(
      container.querySelector(
        '[data-section="chart-line-fractal-channel-empty"]',
      )?.textContent,
    ).toBe('No data');
  });

  it('renders region role with aria-label', () => {
    const { container } = render(
      <ChartLineFractalChannel data={sawtooth(40, 5, 1)} />,
    );
    const region = container.querySelector('[role="region"]');
    expect(region).toBeTruthy();
    expect(region?.getAttribute('aria-label')).toContain('Fractal');
  });

  it('forwards ref', () => {
    const ref = createRef<HTMLDivElement>();
    render(<ChartLineFractalChannel data={sawtooth(40, 5, 1)} ref={ref} />);
    expect(ref.current).not.toBe(null);
  });

  it('exposes data attrs', () => {
    const { container } = render(
      <ChartLineFractalChannel
        data={sawtooth(40, 5, 1)}
        length={20}
        fractalLookback={3}
      />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-fractal-channel"]',
    );
    expect(root?.getAttribute('data-length')).toBe('20');
    expect(root?.getAttribute('data-fractal-lookback')).toBe('3');
  });

  it('exposes total-points', () => {
    const { container } = render(
      <ChartLineFractalChannel data={sawtooth(40, 5, 1)} />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-fractal-channel"]',
    );
    expect(root?.getAttribute('data-total-points')).toBe('40');
  });

  it('renders the screen-reader description', () => {
    const { container } = render(
      <ChartLineFractalChannel data={sawtooth(40, 5, 1)} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-fractal-channel-aria-desc"]',
      )?.textContent,
    ).toContain('Fractal Channel');
  });

  it('renders all three legend items', () => {
    const { container } = render(
      <ChartLineFractalChannel data={sawtooth(40, 5, 1)} />,
    );
    expect(container.querySelector('[data-series-id="price"]')).toBeTruthy();
    expect(container.querySelector('[data-series-id="upper"]')).toBeTruthy();
    expect(container.querySelector('[data-series-id="lower"]')).toBeTruthy();
  });

  it('toggles a series via the legend', () => {
    const onToggle = vi.fn();
    const { container } = render(
      <ChartLineFractalChannel
        data={sawtooth(40, 5, 1)}
        onSeriesToggle={onToggle}
      />,
    );
    const button = container.querySelector(
      '[data-series-id="upper"]',
    ) as HTMLButtonElement | null;
    if (button) fireEvent.click(button);
    expect(onToggle).toHaveBeenCalledWith({
      seriesId: 'upper',
      hidden: true,
    });
  });

  it('hides upper when controlled hidden', () => {
    const { container } = render(
      <ChartLineFractalChannel
        data={sawtooth(40, 5, 1)}
        hiddenSeries={['upper']}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-fractal-channel-upper"]',
      ),
    ).toBe(null);
  });

  it('renders the config badge by default', () => {
    const { container } = render(
      <ChartLineFractalChannel data={sawtooth(40, 5, 1)} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-fractal-channel-badge"]',
      ),
    ).toBeTruthy();
  });

  it('hides axis when showAxis is false', () => {
    const { container } = render(
      <ChartLineFractalChannel
        data={sawtooth(40, 5, 1)}
        showAxis={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-fractal-channel-axes"]',
      ),
    ).toBe(null);
  });

  it('hides grid when showGrid is false', () => {
    const { container } = render(
      <ChartLineFractalChannel
        data={sawtooth(40, 5, 1)}
        showGrid={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-fractal-channel-grid"]',
      ),
    ).toBe(null);
  });

  it('hides legend when showLegend is false', () => {
    const { container } = render(
      <ChartLineFractalChannel
        data={sawtooth(40, 5, 1)}
        showLegend={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-fractal-channel-legend"]',
      ),
    ).toBe(null);
  });

  it('applies className and style', () => {
    const { container } = render(
      <ChartLineFractalChannel
        data={sawtooth(40, 5, 1)}
        className="custom-class"
        style={{ background: 'red' }}
      />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-fractal-channel"]',
    );
    expect(root?.classList.contains('custom-class')).toBe(true);
    expect((root as HTMLElement | null)?.style.background).toBe('red');
  });

  it('animate=false disables fade-in class', () => {
    const { container } = render(
      <ChartLineFractalChannel
        data={sawtooth(40, 5, 1)}
        animate={false}
      />,
    );
    const svg = container.querySelector(
      '[data-section="chart-line-fractal-channel-svg"]',
    );
    expect(svg?.classList.contains('motion-safe:animate-fade-in')).toBe(
      false,
    );
  });

  it('renders upper and lower band paths', () => {
    const { container } = render(
      <ChartLineFractalChannel data={sawtooth(40, 5, 1)} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-fractal-channel-upper"]',
      ),
    ).toBeTruthy();
    expect(
      container.querySelector(
        '[data-section="chart-line-fractal-channel-lower"]',
      ),
    ).toBeTruthy();
  });

  it('renders the price path', () => {
    const { container } = render(
      <ChartLineFractalChannel data={sawtooth(40, 5, 1)} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-fractal-channel-price-path"]',
      ),
    ).toBeTruthy();
  });

  it('respects defaultHiddenSeries on uncontrolled mount', () => {
    const { container } = render(
      <ChartLineFractalChannel
        data={sawtooth(40, 5, 1)}
        defaultHiddenSeries={['upper']}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-fractal-channel-upper"]',
      ),
    ).toBe(null);
  });
});

describe('Fractal Channel integration', () => {
  it('CONST yields upper=lower=null across (K, length)', () => {
    for (const K of [0, 1, 5, 100, -3]) {
      for (const L of [10, 20, 50]) {
        const series = constBar(L + 10, K);
        const ch = computeLineFractalChannel(series, { length: L });
        for (let i = 0; i < L + 10; i += 1) {
          expect(ch.upper[i]).toBe(null);
          expect(ch.lower[i]).toBe(null);
        }
      }
    }
  });

  it('SAWTOOTH yields upper=peakK, lower=troughL bit-exact across (peakK, troughL, length)', () => {
    for (const peakK of [5, 10, 20]) {
      for (const troughL of [1, 2, -3]) {
        for (const L of [20, 30, 50]) {
          const series = sawtooth(L + 10, peakK, troughL);
          const ch = computeLineFractalChannel(series, { length: L });
          for (let i = 0; i < L + 10; i += 1) {
            if (ch.upper[i] != null) expect(ch.upper[i]).toBe(peakK);
            if (ch.lower[i] != null) expect(ch.lower[i]).toBe(troughL);
          }
        }
      }
    }
  });
});
