import { describe, expect, it, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { createRef } from 'react';
import {
  ChartLineMassIndexSignal,
  classifyLineMassIndexSignalZone,
  computeLineMassIndexSignal,
  computeLineMassIndexSignalEma,
  computeLineMassIndexSignalLayout,
  describeLineMassIndexSignalChart,
  getLineMassIndexSignalFinitePoints,
  normalizeLineMassIndexSignalLength,
  normalizeLineMassIndexSignalLookback,
  runLineMassIndexSignal,
  DEFAULT_CHART_LINE_MASS_INDEX_SIGNAL_EMA_LENGTH,
  DEFAULT_CHART_LINE_MASS_INDEX_SIGNAL_LOOKBACK,
  DEFAULT_CHART_LINE_MASS_INDEX_SIGNAL_REVERSAL_THRESHOLD,
} from './chart-line-mass-index-signal';
import type {
  ChartLineMassIndexSignalPoint,
} from './chart-line-mass-index-signal';

const constHL = (length: number, range = 2, mid = 10): ChartLineMassIndexSignalPoint[] =>
  Array.from({ length }, (_, i) => ({
    x: i,
    high: mid + range / 2,
    low: mid - range / 2,
    close: mid,
  }));

const flatHL = (length: number, K: number): ChartLineMassIndexSignalPoint[] =>
  Array.from({ length }, (_, i) => ({
    x: i,
    high: K,
    low: K,
    close: K,
  }));

const variable = (length: number): ChartLineMassIndexSignalPoint[] =>
  Array.from({ length }, (_, i) => ({
    x: i,
    high: 100 + Math.sin(i / 5) * 5 + (i % 3),
    low: 90 + Math.cos(i / 5) * 5,
    close: 95 + Math.sin(i / 5) * 3,
  }));

describe('getLineMassIndexSignalFinitePoints', () => {
  it('returns an empty array for null', () => {
    expect(getLineMassIndexSignalFinitePoints(null)).toEqual([]);
  });

  it('returns an empty array for undefined', () => {
    expect(getLineMassIndexSignalFinitePoints(undefined)).toEqual([]);
  });

  it('returns an empty array for non-array', () => {
    expect(getLineMassIndexSignalFinitePoints({} as never)).toEqual([]);
  });

  it('drops non-finite x', () => {
    const result = getLineMassIndexSignalFinitePoints([
      { x: 1, high: 11, low: 9, close: 10 },
      { x: Number.NaN, high: 11, low: 9, close: 10 },
    ]);
    expect(result.length).toBe(1);
  });

  it('drops non-finite high', () => {
    const result = getLineMassIndexSignalFinitePoints([
      { x: 0, high: Number.NaN, low: 9, close: 10 },
      { x: 1, high: 11, low: 9, close: 10 },
    ]);
    expect(result.length).toBe(1);
  });

  it('drops non-finite low', () => {
    const result = getLineMassIndexSignalFinitePoints([
      { x: 0, high: 11, low: Number.NaN, close: 10 },
      { x: 1, high: 11, low: 9, close: 10 },
    ]);
    expect(result.length).toBe(1);
  });

  it('drops non-finite close', () => {
    const result = getLineMassIndexSignalFinitePoints([
      { x: 0, high: 11, low: 9, close: Number.NaN },
      { x: 1, high: 11, low: 9, close: 10 },
    ]);
    expect(result.length).toBe(1);
  });

  it('drops null entries', () => {
    const result = getLineMassIndexSignalFinitePoints([
      null as unknown as ChartLineMassIndexSignalPoint,
      { x: 1, high: 11, low: 9, close: 10 },
    ]);
    expect(result.length).toBe(1);
  });
});

describe('normalizeLineMassIndexSignalLength', () => {
  it('returns the default when undefined', () => {
    expect(normalizeLineMassIndexSignalLength(undefined, 9)).toBe(9);
  });

  it('returns the default when NaN', () => {
    expect(normalizeLineMassIndexSignalLength(Number.NaN, 9)).toBe(9);
  });

  it('floors fractional lengths', () => {
    expect(normalizeLineMassIndexSignalLength(7.9, 9)).toBe(7);
  });

  it('rejects length below 2', () => {
    expect(normalizeLineMassIndexSignalLength(1, 9)).toBe(9);
    expect(normalizeLineMassIndexSignalLength(0, 9)).toBe(9);
    expect(normalizeLineMassIndexSignalLength(-1, 9)).toBe(9);
  });

  it('accepts the minimum length of 2', () => {
    expect(normalizeLineMassIndexSignalLength(2, 9)).toBe(2);
  });
});

describe('normalizeLineMassIndexSignalLookback', () => {
  it('returns the default when undefined', () => {
    expect(normalizeLineMassIndexSignalLookback(undefined, 25)).toBe(25);
  });

  it('returns the default when NaN', () => {
    expect(normalizeLineMassIndexSignalLookback(Number.NaN, 25)).toBe(25);
  });

  it('floors fractional lookbacks', () => {
    expect(normalizeLineMassIndexSignalLookback(25.9, 25)).toBe(25);
  });

  it('rejects lookback below 2', () => {
    expect(normalizeLineMassIndexSignalLookback(1, 25)).toBe(25);
  });

  it('accepts large lookbacks', () => {
    expect(normalizeLineMassIndexSignalLookback(100, 25)).toBe(100);
  });
});

describe('computeLineMassIndexSignalEma', () => {
  it('returns an empty array for null', () => {
    expect(computeLineMassIndexSignalEma([], 9)).toEqual([]);
  });

  it('EMA of constant K seeds at K and stays at K to numerical tolerance', () => {
    const values = Array(15).fill(7);
    const out = computeLineMassIndexSignalEma(values, 9);
    for (let i = 0; i < out.length; i += 1) {
      const v = out[i];
      expect(v).not.toBe(null);
      if (v !== null) expect(v).toBeCloseTo(7, 12);
    }
  });

  it('EMA of dyadic constant (K=2, length=9) stays at K bit-exact', () => {
    // K = 2 is dyadic and the EMA arithmetic (0.2 * 2 + 0.8 * 2)
    // happens to round back to 2 exactly in IEEE 754.
    const values = Array(15).fill(2);
    const out = computeLineMassIndexSignalEma(values, 9);
    for (let i = 0; i < out.length; i += 1) {
      expect(out[i]).toBe(2);
    }
  });

  it('EMA of zero seeds at zero and stays at zero bit-exact', () => {
    const values = Array(15).fill(0);
    const out = computeLineMassIndexSignalEma(values, 9);
    for (let i = 0; i < out.length; i += 1) {
      expect(out[i]).toBe(0);
    }
  });

  it('EMA seeds with the first value', () => {
    const out = computeLineMassIndexSignalEma([42, 99, 7], 9);
    expect(out[0]).toBe(42);
    // ema[1] = alpha * 99 + (1 - alpha) * 42 with alpha = 2/10 = 0.2
    expect(out[1]).toBeCloseTo(0.2 * 99 + 0.8 * 42, 9);
  });

  it('null breaks the chain and the next finite bar re-seeds', () => {
    const out = computeLineMassIndexSignalEma([1, 2, null, 5, 6], 9);
    expect(out[0]).toBe(1);
    expect(typeof out[1]).toBe('number');
    expect(out[2]).toBe(null);
    expect(out[3]).toBe(5); // re-seed
  });
});

describe('computeLineMassIndexSignal', () => {
  it('returns an empty array for null', () => {
    expect(computeLineMassIndexSignal(null)).toEqual([]);
  });

  it('returns an empty array for empty input', () => {
    expect(computeLineMassIndexSignal([])).toEqual([]);
  });

  it('nulls warmup bars (i < lookback - 1)', () => {
    const bars = constHL(30, 2).map((p) => ({ high: p.high, low: p.low }));
    const out = computeLineMassIndexSignal(bars, { emaLength: 9, lookback: 25 });
    for (let i = 0; i < 24; i += 1) {
      expect(out[i]).toBe(null);
    }
    expect(typeof out[24]).toBe('number');
  });

  it('CONST_HL (range=2) yields MI = 25 bit-exact past warmup (default config)', () => {
    const bars = constHL(40, 2).map((p) => ({ high: p.high, low: p.low }));
    const out = computeLineMassIndexSignal(bars, { emaLength: 9, lookback: 25 });
    for (let i = 24; i < 40; i += 1) {
      expect(out[i]).toBe(25);
    }
  });

  it('CONST_HL (range=10) yields MI = 25 bit-exact at lookback=25', () => {
    const bars = constHL(40, 10).map((p) => ({ high: p.high, low: p.low }));
    const out = computeLineMassIndexSignal(bars, { emaLength: 9, lookback: 25 });
    for (let i = 24; i < 40; i += 1) {
      expect(out[i]).toBe(25);
    }
  });

  it('CONST_HL with shorter lookback yields MI = lookback bit-exact', () => {
    const bars = constHL(40, 2).map((p) => ({ high: p.high, low: p.low }));
    const out = computeLineMassIndexSignal(bars, { emaLength: 9, lookback: 10 });
    for (let i = 9; i < 40; i += 1) {
      expect(out[i]).toBe(10);
    }
  });

  it('CONST_HL with EMA length 5 still yields MI = 25 (ratio=1)', () => {
    const bars = constHL(40, 2).map((p) => ({ high: p.high, low: p.low }));
    const out = computeLineMassIndexSignal(bars, { emaLength: 5, lookback: 25 });
    for (let i = 24; i < 40; i += 1) {
      expect(out[i]).toBe(25);
    }
  });

  it('FLAT_HL (range=0) yields all nulls (singular ratio)', () => {
    const bars = flatHL(40, 5).map((p) => ({ high: p.high, low: p.low }));
    const out = computeLineMassIndexSignal(bars, { emaLength: 9, lookback: 25 });
    for (let i = 0; i < out.length; i += 1) {
      expect(out[i]).toBe(null);
    }
  });

  it('produces finite values on non-flat data', () => {
    const bars = variable(60).map((p) => ({ high: p.high, low: p.low }));
    const out = computeLineMassIndexSignal(bars, { emaLength: 9, lookback: 25 });
    let foundFinite = false;
    for (let i = 25; i < out.length; i += 1) {
      if (typeof out[i] === 'number') {
        foundFinite = true;
        break;
      }
    }
    expect(foundFinite).toBe(true);
  });

  it('output length matches input length', () => {
    const bars = constHL(40, 2).map((p) => ({ high: p.high, low: p.low }));
    const out = computeLineMassIndexSignal(bars, { emaLength: 9, lookback: 25 });
    expect(out.length).toBe(40);
  });

  it('does not mutate input', () => {
    const bars = constHL(40, 2).map((p) => ({ high: p.high, low: p.low }));
    const snap = bars.map((b) => ({ ...b }));
    computeLineMassIndexSignal(bars, { emaLength: 9, lookback: 25 });
    for (let i = 0; i < bars.length; i += 1) {
      expect(bars[i]).toEqual(snap[i]);
    }
  });

  it('translation invariance: shifting H and L by the same C does not change MI', () => {
    const baseBars = variable(60).map((p) => ({ high: p.high, low: p.low }));
    const shiftedBars = baseBars.map((b) => ({
      high: b.high + 100,
      low: b.low + 100,
    }));
    const base = computeLineMassIndexSignal(baseBars, { emaLength: 9, lookback: 25 });
    const sh = computeLineMassIndexSignal(shiftedBars, { emaLength: 9, lookback: 25 });
    for (let i = 0; i < base.length; i += 1) {
      const b = base[i];
      const s = sh[i];
      if (b == null || s == null) {
        expect(b).toBe(s);
        continue;
      }
      expect(s).toBeCloseTo(b, 9);
    }
  });
});

describe('classifyLineMassIndexSignalZone', () => {
  it('classifies reversal above threshold', () => {
    expect(classifyLineMassIndexSignalZone(27.5, 27)).toBe('reversal');
  });

  it('classifies reversal at the threshold', () => {
    expect(classifyLineMassIndexSignalZone(27, 27)).toBe('reversal');
  });

  it('classifies normal below threshold', () => {
    expect(classifyLineMassIndexSignalZone(20, 27)).toBe('normal');
  });

  it('returns none for null', () => {
    expect(classifyLineMassIndexSignalZone(null, 27)).toBe('none');
  });

  it('returns none for NaN', () => {
    expect(classifyLineMassIndexSignalZone(Number.NaN, 27)).toBe('none');
  });
});

describe('runLineMassIndexSignal', () => {
  it('marks ok=false for fewer than lookback points', () => {
    const run = runLineMassIndexSignal(constHL(10, 2), { lookback: 25 });
    expect(run.ok).toBe(false);
  });

  it('marks ok=true with enough points', () => {
    const run = runLineMassIndexSignal(constHL(30, 2), { lookback: 25 });
    expect(run.ok).toBe(true);
  });

  it('uses the default ema length when none is provided', () => {
    const run = runLineMassIndexSignal(constHL(30, 2));
    expect(run.emaLength).toBe(
      DEFAULT_CHART_LINE_MASS_INDEX_SIGNAL_EMA_LENGTH,
    );
  });

  it('uses the default lookback when none is provided', () => {
    const run = runLineMassIndexSignal(constHL(30, 2));
    expect(run.lookback).toBe(DEFAULT_CHART_LINE_MASS_INDEX_SIGNAL_LOOKBACK);
  });

  it('uses the default reversal threshold when none is provided', () => {
    const run = runLineMassIndexSignal(constHL(30, 2));
    expect(run.reversalThreshold).toBe(
      DEFAULT_CHART_LINE_MASS_INDEX_SIGNAL_REVERSAL_THRESHOLD,
    );
  });

  it('respects explicit options', () => {
    const run = runLineMassIndexSignal(constHL(30, 2), {
      emaLength: 5,
      lookback: 15,
      reversalThreshold: 20,
    });
    expect(run.emaLength).toBe(5);
    expect(run.lookback).toBe(15);
    expect(run.reversalThreshold).toBe(20);
  });

  it('sorts by x', () => {
    const data: ChartLineMassIndexSignalPoint[] = [
      { x: 2, high: 11, low: 9, close: 10 },
      { x: 0, high: 11, low: 9, close: 10 },
      { x: 1, high: 11, low: 9, close: 10 },
    ];
    const run = runLineMassIndexSignal(data, { lookback: 2, emaLength: 2 });
    expect(run.samples.map((s) => s.x)).toEqual([0, 1, 2]);
  });

  it('CONST_HL at default reversal threshold (27) classifies all post-warmup as normal', () => {
    // MI = 25 < 27 -> normal
    const run = runLineMassIndexSignal(constHL(40, 2));
    expect(run.normalCount).toBe(40 - 24);
    expect(run.reversalCount).toBe(0);
  });

  it('CONST_HL at lower threshold (20) classifies all post-warmup as reversal', () => {
    // MI = 25 > 20 -> reversal
    const run = runLineMassIndexSignal(constHL(40, 2), {
      reversalThreshold: 20,
    });
    expect(run.reversalCount).toBe(40 - 24);
    expect(run.normalCount).toBe(0);
  });

  it('FLAT_HL (singular ratio) classifies every bar as none', () => {
    const run = runLineMassIndexSignal(flatHL(40, 5));
    expect(run.noneCount).toBe(40);
  });

  it('exposes massFinal as the last finite reading', () => {
    const run = runLineMassIndexSignal(constHL(40, 2));
    expect(run.massFinal).toBe(25);
  });

  it('massFinal is null when there is no data', () => {
    const run = runLineMassIndexSignal([]);
    expect(run.massFinal).toBe(null);
  });
});

describe('computeLineMassIndexSignalLayout', () => {
  it('returns ok=false for empty data', () => {
    const layout = computeLineMassIndexSignalLayout({ data: [] });
    expect(layout.ok).toBe(false);
  });

  it('returns ok=true for sufficient data', () => {
    const layout = computeLineMassIndexSignalLayout({
      data: constHL(40, 2),
    });
    expect(layout.ok).toBe(true);
  });

  it('uses the explicit width and height', () => {
    const layout = computeLineMassIndexSignalLayout({
      data: constHL(40, 2),
      width: 600,
      height: 400,
    });
    expect(layout.width).toBe(600);
    expect(layout.height).toBe(400);
  });

  it('panels stack with price above mass', () => {
    const layout = computeLineMassIndexSignalLayout({ data: constHL(40, 2) });
    expect(layout.priceBottom).toBeLessThan(layout.massTop);
  });

  it('panel gap is respected', () => {
    const layout = computeLineMassIndexSignalLayout({
      data: constHL(40, 2),
      panelGap: 24,
    });
    expect(layout.massTop - layout.priceBottom).toBeCloseTo(24, 9);
  });

  it('produces a price path and dots', () => {
    const layout = computeLineMassIndexSignalLayout({ data: constHL(40, 2) });
    expect(layout.pricePath.startsWith('M')).toBe(true);
    expect(layout.priceDots.length).toBe(40);
  });

  it('produces a mass path and markers (skipping warmup)', () => {
    const layout = computeLineMassIndexSignalLayout({ data: constHL(40, 2) });
    expect(layout.massPath.length).toBeGreaterThan(0);
    // 40 - 24 = 16 finite bars.
    expect(layout.markers.length).toBe(16);
  });

  it('threshold line is inside the mass panel', () => {
    const layout = computeLineMassIndexSignalLayout({ data: constHL(40, 2) });
    expect(layout.thresholdY).toBeGreaterThanOrEqual(layout.massTop);
    expect(layout.thresholdY).toBeLessThanOrEqual(layout.massBottom);
  });

  it('priceMin and priceMax differ for constant data', () => {
    const layout = computeLineMassIndexSignalLayout({ data: constHL(40, 2) });
    expect(layout.priceMin).toBeLessThan(layout.priceMax);
  });

  it('handles a single point gracefully', () => {
    const layout = computeLineMassIndexSignalLayout({
      data: [{ x: 0, high: 11, low: 9, close: 10 }],
    });
    expect(layout.ok).toBe(false);
  });
});

describe('describeLineMassIndexSignalChart', () => {
  it('returns No data for empty input', () => {
    expect(describeLineMassIndexSignalChart([])).toBe('No data');
  });

  it('mentions Mass Index', () => {
    const desc = describeLineMassIndexSignalChart(constHL(40, 2));
    expect(desc).toContain('Mass Index');
  });

  it('mentions reversal bulge', () => {
    const desc = describeLineMassIndexSignalChart(constHL(40, 2));
    expect(desc).toContain('reversal bulge');
  });

  it('reports the EMA length and lookback', () => {
    const desc = describeLineMassIndexSignalChart(constHL(40, 2), {
      emaLength: 9,
      lookback: 25,
    });
    expect(desc).toContain('EMA length 9');
    expect(desc).toContain('lookback 25');
  });

  it('reports the reversal threshold', () => {
    const desc = describeLineMassIndexSignalChart(constHL(40, 2));
    expect(desc).toContain('reversal threshold 27');
  });

  it('reports the final reading', () => {
    const desc = describeLineMassIndexSignalChart(constHL(40, 2));
    expect(desc).toContain('25.0000');
  });
});

describe('<ChartLineMassIndexSignal />', () => {
  it('renders an empty placeholder for no data', () => {
    const { container } = render(<ChartLineMassIndexSignal data={[]} />);
    const placeholder = container.querySelector(
      '[data-section="chart-line-mass-index-signal-empty"]',
    );
    expect(placeholder?.textContent).toBe('No data');
  });

  it('renders region role with aria-label', () => {
    const { container } = render(
      <ChartLineMassIndexSignal data={constHL(40, 2)} />,
    );
    const region = container.querySelector('[role="region"]');
    expect(region).toBeTruthy();
    expect(region?.getAttribute('aria-label')).toContain('Mass Index');
  });

  it('forwards ref', () => {
    const ref = createRef<HTMLDivElement>();
    render(<ChartLineMassIndexSignal data={constHL(40, 2)} ref={ref} />);
    expect(ref.current).not.toBe(null);
  });

  it('exposes data-ema-length and data-lookback', () => {
    const { container } = render(
      <ChartLineMassIndexSignal
        data={constHL(40, 2)}
        emaLength={5}
        lookback={10}
      />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-mass-index-signal"]',
    );
    expect(root?.getAttribute('data-ema-length')).toBe('5');
    expect(root?.getAttribute('data-lookback')).toBe('10');
  });

  it('exposes data-mass-final', () => {
    const { container } = render(
      <ChartLineMassIndexSignal data={constHL(40, 2)} />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-mass-index-signal"]',
    );
    expect(root?.getAttribute('data-mass-final')).toBe('25');
  });

  it('exposes total-points', () => {
    const { container } = render(
      <ChartLineMassIndexSignal data={constHL(30, 2)} />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-mass-index-signal"]',
    );
    expect(root?.getAttribute('data-total-points')).toBe('30');
  });

  it('exposes reversal / normal / none counts', () => {
    const { container } = render(
      <ChartLineMassIndexSignal data={constHL(40, 2)} />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-mass-index-signal"]',
    );
    expect(root?.getAttribute('data-normal-count')).toBe(String(40 - 24));
    expect(root?.getAttribute('data-reversal-count')).toBe('0');
  });

  it('renders the screen-reader description', () => {
    const { container } = render(
      <ChartLineMassIndexSignal data={constHL(40, 2)} />,
    );
    const desc = container.querySelector(
      '[data-section="chart-line-mass-index-signal-aria-desc"]',
    );
    expect(desc?.textContent).toContain('Mass Index');
  });

  it('renders both legend items', () => {
    const { container } = render(
      <ChartLineMassIndexSignal data={constHL(40, 2)} />,
    );
    expect(container.querySelector('[data-series-id="price"]')).toBeTruthy();
    expect(container.querySelector('[data-series-id="mass"]')).toBeTruthy();
  });

  it('toggles a series via the legend', () => {
    const onToggle = vi.fn();
    const { container } = render(
      <ChartLineMassIndexSignal
        data={constHL(40, 2)}
        onSeriesToggle={onToggle}
      />,
    );
    const button = container.querySelector(
      '[data-series-id="mass"]',
    ) as HTMLButtonElement | null;
    if (button) fireEvent.click(button);
    expect(onToggle).toHaveBeenCalledWith({
      seriesId: 'mass',
      hidden: true,
    });
  });

  it('respects controlled hiddenSeries', () => {
    const { container } = render(
      <ChartLineMassIndexSignal
        data={constHL(40, 2)}
        hiddenSeries={['mass']}
      />,
    );
    const button = container.querySelector('[data-series-id="mass"]');
    expect(button?.getAttribute('data-hidden')).toBe('true');
  });

  it('hides Mass Index line when controlled hidden', () => {
    const { container } = render(
      <ChartLineMassIndexSignal
        data={constHL(40, 2)}
        hiddenSeries={['mass']}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-mass-index-signal-line"]',
      ),
    ).toBe(null);
  });

  it('fires onPointClick on marker activation', () => {
    const onPointClick = vi.fn();
    const { container } = render(
      <ChartLineMassIndexSignal
        data={constHL(40, 2)}
        onPointClick={onPointClick}
      />,
    );
    const markers = container.querySelectorAll(
      '[data-section="chart-line-mass-index-signal-marker"]',
    );
    expect(markers.length).toBeGreaterThan(0);
    fireEvent.click(markers[0]!);
    expect(onPointClick).toHaveBeenCalled();
  });

  it('responds to Enter key on markers', () => {
    const onPointClick = vi.fn();
    const { container } = render(
      <ChartLineMassIndexSignal
        data={constHL(40, 2)}
        onPointClick={onPointClick}
      />,
    );
    const marker = container.querySelector(
      '[data-section="chart-line-mass-index-signal-marker"]',
    ) as SVGElement | null;
    if (marker) fireEvent.keyDown(marker, { key: 'Enter' });
    expect(onPointClick).toHaveBeenCalled();
  });

  it('responds to Space key on markers', () => {
    const onPointClick = vi.fn();
    const { container } = render(
      <ChartLineMassIndexSignal
        data={constHL(40, 2)}
        onPointClick={onPointClick}
      />,
    );
    const marker = container.querySelector(
      '[data-section="chart-line-mass-index-signal-marker"]',
    ) as SVGElement | null;
    if (marker) fireEvent.keyDown(marker, { key: ' ' });
    expect(onPointClick).toHaveBeenCalled();
  });

  it('renders the config badge by default', () => {
    const { container } = render(
      <ChartLineMassIndexSignal data={constHL(40, 2)} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-mass-index-signal-badge"]',
      ),
    ).toBeTruthy();
  });

  it('hides the config badge when disabled', () => {
    const { container } = render(
      <ChartLineMassIndexSignal
        data={constHL(40, 2)}
        showConfigBadge={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-mass-index-signal-badge"]',
      ),
    ).toBe(null);
  });

  it('renders dots when showDots is true', () => {
    const { container } = render(
      <ChartLineMassIndexSignal data={constHL(40, 2)} showDots={true} />,
    );
    expect(
      container.querySelectorAll(
        '[data-section="chart-line-mass-index-signal-dot"]',
      ).length,
    ).toBeGreaterThan(0);
  });

  it('does not render dots by default', () => {
    const { container } = render(
      <ChartLineMassIndexSignal data={constHL(40, 2)} />,
    );
    expect(
      container.querySelectorAll(
        '[data-section="chart-line-mass-index-signal-dot"]',
      ).length,
    ).toBe(0);
  });

  it('hides axis when showAxis is false', () => {
    const { container } = render(
      <ChartLineMassIndexSignal data={constHL(40, 2)} showAxis={false} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-mass-index-signal-axes"]',
      ),
    ).toBe(null);
  });

  it('hides grid when showGrid is false', () => {
    const { container } = render(
      <ChartLineMassIndexSignal data={constHL(40, 2)} showGrid={false} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-mass-index-signal-grid"]',
      ),
    ).toBe(null);
  });

  it('hides markers when showMarkers is false', () => {
    const { container } = render(
      <ChartLineMassIndexSignal data={constHL(40, 2)} showMarkers={false} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-mass-index-signal-markers"]',
      ),
    ).toBe(null);
  });

  it('hides legend when showLegend is false', () => {
    const { container } = render(
      <ChartLineMassIndexSignal data={constHL(40, 2)} showLegend={false} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-mass-index-signal-legend"]',
      ),
    ).toBe(null);
  });

  it('hides threshold when showThreshold is false', () => {
    const { container } = render(
      <ChartLineMassIndexSignal
        data={constHL(40, 2)}
        showThreshold={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-mass-index-signal-threshold"]',
      ),
    ).toBe(null);
  });

  it('respects a custom formatMass', () => {
    const fmt = (v: number) => `[MI:${v.toFixed(0)}]`;
    const { container } = render(
      <ChartLineMassIndexSignal data={constHL(40, 2)} formatMass={fmt} />,
    );
    const text = container.textContent ?? '';
    expect(text).toContain('[MI:25]');
  });

  it('applies className and style', () => {
    const { container } = render(
      <ChartLineMassIndexSignal
        data={constHL(40, 2)}
        className="custom-class"
        style={{ background: 'red' }}
      />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-mass-index-signal"]',
    );
    expect(root?.classList.contains('custom-class')).toBe(true);
    expect((root as HTMLElement | null)?.style.background).toBe('red');
  });

  it('exposes data-animate attribute', () => {
    const { container } = render(
      <ChartLineMassIndexSignal data={constHL(40, 2)} animate={true} />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-mass-index-signal"]',
    );
    expect(root?.getAttribute('data-animate')).toBe('true');
  });

  it('animate=false disables fade-in class', () => {
    const { container } = render(
      <ChartLineMassIndexSignal data={constHL(40, 2)} animate={false} />,
    );
    const svg = container.querySelector(
      '[data-section="chart-line-mass-index-signal-svg"]',
    );
    expect(svg?.classList.contains('motion-safe:animate-fade-in')).toBe(false);
  });

  it('renders the mass line by default', () => {
    const { container } = render(
      <ChartLineMassIndexSignal data={constHL(40, 2)} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-mass-index-signal-line"]',
      ),
    ).toBeTruthy();
  });

  it('renders the price path', () => {
    const { container } = render(
      <ChartLineMassIndexSignal data={constHL(40, 2)} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-mass-index-signal-price-path"]',
      ),
    ).toBeTruthy();
  });

  it('respects defaultHiddenSeries on uncontrolled mount', () => {
    const { container } = render(
      <ChartLineMassIndexSignal
        data={constHL(40, 2)}
        defaultHiddenSeries={['mass']}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-mass-index-signal-line"]',
      ),
    ).toBe(null);
  });

  it('hovering a marker shows the tooltip', () => {
    const { container } = render(
      <ChartLineMassIndexSignal data={constHL(40, 2)} />,
    );
    const marker = container.querySelector(
      '[data-section="chart-line-mass-index-signal-marker"]',
    ) as SVGElement | null;
    if (marker) fireEvent.mouseEnter(marker);
    expect(
      container.querySelector(
        '[data-section="chart-line-mass-index-signal-tooltip"]',
      ),
    ).toBeTruthy();
  });

  it('tooltip vanishes on mouseLeave', () => {
    const { container } = render(
      <ChartLineMassIndexSignal data={constHL(40, 2)} />,
    );
    const marker = container.querySelector(
      '[data-section="chart-line-mass-index-signal-marker"]',
    ) as SVGElement | null;
    if (marker) {
      fireEvent.mouseEnter(marker);
      fireEvent.mouseLeave(marker);
    }
    expect(
      container.querySelector(
        '[data-section="chart-line-mass-index-signal-tooltip"]',
      ),
    ).toBe(null);
  });

  it('tooltip respects showTooltip=false', () => {
    const { container } = render(
      <ChartLineMassIndexSignal
        data={constHL(40, 2)}
        showTooltip={false}
      />,
    );
    const marker = container.querySelector(
      '[data-section="chart-line-mass-index-signal-marker"]',
    ) as SVGElement | null;
    if (marker) fireEvent.mouseEnter(marker);
    expect(
      container.querySelector(
        '[data-section="chart-line-mass-index-signal-tooltip"]',
      ),
    ).toBe(null);
  });
});

describe('Mass Index integration', () => {
  it('CONST_HL yields MI = lookback bit-exact across (range, emaLength, lookback)', () => {
    for (const range of [1, 2, 5, 10, 100]) {
      for (const L of [5, 9, 20]) {
        for (const W of [10, 15, 25]) {
          const bars = constHL(W + 20, range).map((p) => ({
            high: p.high,
            low: p.low,
          }));
          const out = computeLineMassIndexSignal(bars, {
            emaLength: L,
            lookback: W,
          });
          expect(out[bars.length - 1]).toBe(W);
        }
      }
    }
  });

  it('different lookbacks scale MI linearly under CONST_HL', () => {
    const bars = constHL(60, 2).map((p) => ({ high: p.high, low: p.low }));
    const out10 = computeLineMassIndexSignal(bars, { emaLength: 9, lookback: 10 });
    const out20 = computeLineMassIndexSignal(bars, { emaLength: 9, lookback: 20 });
    expect(out10[59]).toBe(10);
    expect(out20[59]).toBe(20);
  });

  it('FLAT_HL (range=0) yields null at every bar', () => {
    const bars = flatHL(40, 7).map((p) => ({ high: p.high, low: p.low }));
    const out = computeLineMassIndexSignal(bars, { emaLength: 9, lookback: 25 });
    for (const v of out) {
      expect(v).toBe(null);
    }
  });
});
