import { describe, expect, it, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { createRef } from 'react';
import {
  ChartLineTsiSignal,
  applyLineTsiSignalEma,
  classifyLineTsiSignalZone,
  computeLineTsiSignal,
  computeLineTsiSignalLayout,
  describeLineTsiSignalChart,
  getLineTsiSignalFinitePoints,
  normalizeLineTsiSignalLength,
  runLineTsiSignal,
  DEFAULT_CHART_LINE_TSI_SIGNAL_LONG_LENGTH,
  DEFAULT_CHART_LINE_TSI_SIGNAL_SHORT_LENGTH,
  DEFAULT_CHART_LINE_TSI_SIGNAL_SIGNAL_LENGTH,
} from './chart-line-tsi-signal';
import type {
  ChartLineTsiSignalPoint,
} from './chart-line-tsi-signal';

const constFlat = (length: number, K: number): ChartLineTsiSignalPoint[] =>
  Array.from({ length }, (_, i) => ({ x: i, close: K }));

const risingByS = (length: number, S = 1, c0 = 100): ChartLineTsiSignalPoint[] =>
  Array.from({ length }, (_, i) => ({ x: i, close: c0 + S * i }));

const fallingByS = (length: number, S = 1, c0 = 100): ChartLineTsiSignalPoint[] =>
  Array.from({ length }, (_, i) => ({ x: i, close: c0 - S * i }));

describe('getLineTsiSignalFinitePoints', () => {
  it('returns an empty array for null', () => {
    expect(getLineTsiSignalFinitePoints(null)).toEqual([]);
  });

  it('returns an empty array for undefined', () => {
    expect(getLineTsiSignalFinitePoints(undefined)).toEqual([]);
  });

  it('drops non-finite x', () => {
    const result = getLineTsiSignalFinitePoints([
      { x: 1, close: 10 },
      { x: Number.NaN, close: 10 },
    ]);
    expect(result.length).toBe(1);
  });

  it('drops non-finite close', () => {
    const result = getLineTsiSignalFinitePoints([
      { x: 0, close: Number.NaN },
      { x: 1, close: 10 },
    ]);
    expect(result.length).toBe(1);
  });

  it('drops null entries', () => {
    const result = getLineTsiSignalFinitePoints([
      null as unknown as ChartLineTsiSignalPoint,
      { x: 1, close: 10 },
    ]);
    expect(result.length).toBe(1);
  });
});

describe('normalizeLineTsiSignalLength', () => {
  it('returns the default when undefined', () => {
    expect(normalizeLineTsiSignalLength(undefined, 13)).toBe(13);
  });

  it('returns the default when NaN', () => {
    expect(normalizeLineTsiSignalLength(Number.NaN, 13)).toBe(13);
  });

  it('floors fractional lengths', () => {
    expect(normalizeLineTsiSignalLength(7.9, 13)).toBe(7);
  });

  it('rejects length below 1', () => {
    expect(normalizeLineTsiSignalLength(0, 13)).toBe(13);
  });

  it('accepts the minimum length of 1', () => {
    expect(normalizeLineTsiSignalLength(1, 13)).toBe(1);
  });
});

describe('applyLineTsiSignalEma', () => {
  it('returns an empty array for empty input', () => {
    expect(applyLineTsiSignalEma([], 9)).toEqual([]);
  });

  it('EMA of zeros stays at zero bit-exact', () => {
    const out = applyLineTsiSignalEma([0, 0, 0, 0, 0], 9);
    for (let i = 0; i < out.length; i += 1) {
      expect(out[i]).toBe(0);
    }
  });

  it('EMA of constant 2 stays at 2 bit-exact (dyadic-friendly)', () => {
    const out = applyLineTsiSignalEma([2, 2, 2, 2, 2], 9);
    for (let i = 0; i < out.length; i += 1) {
      expect(out[i]).toBe(2);
    }
  });

  it('EMA seeds with the first value', () => {
    const out = applyLineTsiSignalEma([42, 99, 7], 9);
    expect(out[0]).toBe(42);
  });

  it('null breaks the chain and the next finite bar re-seeds', () => {
    const out = applyLineTsiSignalEma([1, 2, null, 5, 6], 9);
    expect(out[0]).toBe(1);
    expect(out[2]).toBe(null);
    expect(out[3]).toBe(5);
  });
});

describe('computeLineTsiSignal', () => {
  it('returns empty arrays for null', () => {
    const out = computeLineTsiSignal(null);
    expect(out.tsi).toEqual([]);
    expect(out.signal).toEqual([]);
  });

  it('returns empty arrays for empty input', () => {
    const out = computeLineTsiSignal([]);
    expect(out.tsi).toEqual([]);
    expect(out.signal).toEqual([]);
  });

  it('seed bar (i=0) yields null TSI (no momentum)', () => {
    const out = computeLineTsiSignal([5, 5, 5, 5]);
    expect(out.tsi[0]).toBe(null);
  });

  it('RISING_BY_S yields TSI = +100 bit-exact past seed', () => {
    for (const S of [1, 2, 5, 10, 0.5]) {
      const closes = risingByS(30, S).map((p) => p.close);
      const out = computeLineTsiSignal(closes);
      // Bar 1 is the seed of the EMA (mom=+S, ema1=+S, ema2=+S);
      // bars after seed have ema2Mom = ema2Abs (both follow the
      // same recursion on constant +S), so TSI = 100 exactly.
      for (let i = 1; i < 30; i += 1) {
        expect(out.tsi[i]).toBe(100);
      }
    }
  });

  it('FALLING_BY_S yields TSI = -100 bit-exact past seed', () => {
    for (const S of [1, 2, 5, 10, 0.5]) {
      const closes = fallingByS(30, S).map((p) => p.close);
      const out = computeLineTsiSignal(closes);
      for (let i = 1; i < 30; i += 1) {
        expect(out.tsi[i]).toBe(-100);
      }
    }
  });

  it('CONST_FLAT yields all nulls (singular)', () => {
    for (const K of [0, 1, 5, 10, 100]) {
      const closes = constFlat(30, K).map((p) => p.close);
      const out = computeLineTsiSignal(closes);
      for (let i = 0; i < 30; i += 1) {
        expect(out.tsi[i]).toBe(null);
      }
    }
  });

  it('Signal of constant TSI=100 (RISING_BY_S) settles to 100 bit-exact', () => {
    const closes = risingByS(40, 1).map((p) => p.close);
    const out = computeLineTsiSignal(closes);
    // Signal seeds at TSI[1] = 100. Subsequent EMA of constant
    // 100 produces 100 bit-exact (dyadic-friendly 100 stays at
    // 100 under the standard EMA recurrence in IEEE 754).
    for (let i = 1; i < 40; i += 1) {
      expect(out.signal[i]).toBe(100);
    }
  });

  it('Signal of TSI=-100 settles to -100 bit-exact', () => {
    const closes = fallingByS(40, 1).map((p) => p.close);
    const out = computeLineTsiSignal(closes);
    for (let i = 1; i < 40; i += 1) {
      expect(out.signal[i]).toBe(-100);
    }
  });

  it('TSI is bounded in [-100, +100] for any finite input', () => {
    const closes: number[] = [];
    for (let i = 0; i < 60; i += 1) {
      closes.push(100 + Math.sin(i / 3) * 5 + (i % 7));
    }
    const out = computeLineTsiSignal(closes);
    for (let i = 1; i < 60; i += 1) {
      const v = out.tsi[i];
      if (v !== null) {
        expect(v).toBeGreaterThanOrEqual(-100);
        expect(v).toBeLessThanOrEqual(100);
      }
    }
  });

  it('output length matches input length', () => {
    const closes = risingByS(40).map((p) => p.close);
    const out = computeLineTsiSignal(closes);
    expect(out.tsi.length).toBe(40);
    expect(out.signal.length).toBe(40);
  });

  it('does not mutate input', () => {
    const closes = risingByS(40).map((p) => p.close);
    const snap = closes.slice();
    computeLineTsiSignal(closes);
    expect(closes).toEqual(snap);
  });
});

describe('classifyLineTsiSignalZone', () => {
  it('classifies overbought above threshold', () => {
    expect(classifyLineTsiSignalZone(30, 25, -25)).toBe('overbought');
  });

  it('classifies overbought at threshold', () => {
    expect(classifyLineTsiSignalZone(25, 25, -25)).toBe('overbought');
  });

  it('classifies oversold below threshold', () => {
    expect(classifyLineTsiSignalZone(-30, 25, -25)).toBe('oversold');
  });

  it('classifies oversold at threshold', () => {
    expect(classifyLineTsiSignalZone(-25, 25, -25)).toBe('oversold');
  });

  it('classifies neutral between bands', () => {
    expect(classifyLineTsiSignalZone(0, 25, -25)).toBe('neutral');
    expect(classifyLineTsiSignalZone(10, 25, -25)).toBe('neutral');
  });

  it('returns none for null', () => {
    expect(classifyLineTsiSignalZone(null, 25, -25)).toBe('none');
  });

  it('returns none for NaN', () => {
    expect(classifyLineTsiSignalZone(Number.NaN, 25, -25)).toBe('none');
  });
});

describe('runLineTsiSignal', () => {
  it('marks ok=false for fewer than 2 points', () => {
    const run = runLineTsiSignal([{ x: 0, close: 10 }]);
    expect(run.ok).toBe(false);
  });

  it('marks ok=true for at least 2 points', () => {
    const run = runLineTsiSignal(risingByS(20, 1));
    expect(run.ok).toBe(true);
  });

  it('uses defaults when none is provided', () => {
    const run = runLineTsiSignal(risingByS(40));
    expect(run.longLength).toBe(
      DEFAULT_CHART_LINE_TSI_SIGNAL_LONG_LENGTH,
    );
    expect(run.shortLength).toBe(
      DEFAULT_CHART_LINE_TSI_SIGNAL_SHORT_LENGTH,
    );
    expect(run.signalLength).toBe(
      DEFAULT_CHART_LINE_TSI_SIGNAL_SIGNAL_LENGTH,
    );
  });

  it('respects explicit options', () => {
    const run = runLineTsiSignal(risingByS(40), {
      longLength: 14,
      shortLength: 7,
      signalLength: 5,
      overboughtThreshold: 30,
      oversoldThreshold: -30,
    });
    expect(run.longLength).toBe(14);
    expect(run.shortLength).toBe(7);
    expect(run.signalLength).toBe(5);
    expect(run.overboughtThreshold).toBe(30);
    expect(run.oversoldThreshold).toBe(-30);
  });

  it('sorts by x', () => {
    const data: ChartLineTsiSignalPoint[] = [
      { x: 2, close: 30 },
      { x: 0, close: 10 },
      { x: 1, close: 20 },
    ];
    const run = runLineTsiSignal(data);
    expect(run.samples.map((s) => s.x)).toEqual([0, 1, 2]);
  });

  it('RISING_BY_S classifies all post-seed bars as overbought', () => {
    const run = runLineTsiSignal(risingByS(30, 1));
    // TSI = 100 >= 25 -> overbought; bar 0 is null
    expect(run.overboughtCount).toBe(29);
    expect(run.noneCount).toBe(1);
  });

  it('FALLING_BY_S classifies all post-seed bars as oversold', () => {
    const run = runLineTsiSignal(fallingByS(30, 1));
    expect(run.oversoldCount).toBe(29);
    expect(run.noneCount).toBe(1);
  });

  it('CONST_FLAT classifies all bars as none', () => {
    const run = runLineTsiSignal(constFlat(30, 5));
    expect(run.noneCount).toBe(30);
  });

  it('exposes tsiFinal as the last finite TSI', () => {
    const run = runLineTsiSignal(risingByS(30, 1));
    expect(run.tsiFinal).toBe(100);
  });

  it('exposes signalFinal as the last finite signal', () => {
    const run = runLineTsiSignal(risingByS(30, 1));
    expect(run.signalFinal).toBe(100);
  });

  it('tsiFinal is null when there is no data', () => {
    const run = runLineTsiSignal([]);
    expect(run.tsiFinal).toBe(null);
  });
});

describe('computeLineTsiSignalLayout', () => {
  it('returns ok=false for empty data', () => {
    const layout = computeLineTsiSignalLayout({ data: [] });
    expect(layout.ok).toBe(false);
  });

  it('returns ok=true for sufficient data', () => {
    const layout = computeLineTsiSignalLayout({
      data: risingByS(30, 1),
    });
    expect(layout.ok).toBe(true);
  });

  it('uses the explicit width and height', () => {
    const layout = computeLineTsiSignalLayout({
      data: risingByS(30, 1),
      width: 600,
      height: 400,
    });
    expect(layout.width).toBe(600);
    expect(layout.height).toBe(400);
  });

  it('panels stack with price above TSI', () => {
    const layout = computeLineTsiSignalLayout({
      data: risingByS(30, 1),
    });
    expect(layout.priceBottom).toBeLessThan(layout.tsiTop);
  });

  it('panel gap is respected', () => {
    const layout = computeLineTsiSignalLayout({
      data: risingByS(30, 1),
      panelGap: 24,
    });
    expect(layout.tsiTop - layout.priceBottom).toBeCloseTo(24, 9);
  });

  it('produces a price path and dots', () => {
    const layout = computeLineTsiSignalLayout({
      data: risingByS(30, 1),
    });
    expect(layout.pricePath.startsWith('M')).toBe(true);
    expect(layout.priceDots.length).toBe(30);
  });

  it('produces TSI and signal paths', () => {
    const layout = computeLineTsiSignalLayout({
      data: risingByS(30, 1),
    });
    expect(layout.tsiPath.length).toBeGreaterThan(0);
    expect(layout.signalPath.length).toBeGreaterThan(0);
  });

  it('zero line is inside the TSI panel', () => {
    const layout = computeLineTsiSignalLayout({
      data: risingByS(30, 1),
    });
    expect(layout.zeroLineY).toBeGreaterThanOrEqual(layout.tsiTop);
    expect(layout.zeroLineY).toBeLessThanOrEqual(layout.tsiBottom);
  });

  it('overbought / oversold band lines are inside the TSI panel', () => {
    const layout = computeLineTsiSignalLayout({
      data: risingByS(30, 1),
    });
    expect(layout.overboughtY).toBeGreaterThanOrEqual(layout.tsiTop);
    expect(layout.overboughtY).toBeLessThanOrEqual(layout.tsiBottom);
    expect(layout.oversoldY).toBeGreaterThanOrEqual(layout.tsiTop);
    expect(layout.oversoldY).toBeLessThanOrEqual(layout.tsiBottom);
  });

  it('handles a single point gracefully', () => {
    const layout = computeLineTsiSignalLayout({
      data: [{ x: 0, close: 10 }],
    });
    expect(layout.ok).toBe(false);
  });
});

describe('describeLineTsiSignalChart', () => {
  it('returns No data for empty input', () => {
    expect(describeLineTsiSignalChart([])).toBe('No data');
  });

  it('mentions True Strength Index', () => {
    const desc = describeLineTsiSignalChart(risingByS(30, 1));
    expect(desc).toContain('True Strength Index');
  });

  it('mentions the doubly smoothed momentum', () => {
    const desc = describeLineTsiSignalChart(risingByS(30, 1));
    expect(desc).toContain('doubly smooths');
  });

  it('reports the lengths', () => {
    const desc = describeLineTsiSignalChart(risingByS(30, 1), {
      longLength: 14,
      shortLength: 7,
      signalLength: 5,
    });
    expect(desc).toContain('long 14');
    expect(desc).toContain('short 7');
    expect(desc).toContain('signal 5');
  });

  it('reports the final readings', () => {
    const desc = describeLineTsiSignalChart(risingByS(30, 1));
    expect(desc).toContain('100.0000');
  });
});

describe('<ChartLineTsiSignal />', () => {
  it('renders an empty placeholder for no data', () => {
    const { container } = render(<ChartLineTsiSignal data={[]} />);
    const placeholder = container.querySelector(
      '[data-section="chart-line-tsi-signal-empty"]',
    );
    expect(placeholder?.textContent).toBe('No data');
  });

  it('renders region role with aria-label', () => {
    const { container } = render(
      <ChartLineTsiSignal data={risingByS(30, 1)} />,
    );
    const region = container.querySelector('[role="region"]');
    expect(region).toBeTruthy();
    expect(region?.getAttribute('aria-label')).toContain('True Strength Index');
  });

  it('forwards ref', () => {
    const ref = createRef<HTMLDivElement>();
    render(<ChartLineTsiSignal data={risingByS(30, 1)} ref={ref} />);
    expect(ref.current).not.toBe(null);
  });

  it('exposes data-long-length / data-short-length / data-signal-length', () => {
    const { container } = render(
      <ChartLineTsiSignal
        data={risingByS(30, 1)}
        longLength={14}
        shortLength={7}
        signalLength={5}
      />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-tsi-signal"]',
    );
    expect(root?.getAttribute('data-long-length')).toBe('14');
    expect(root?.getAttribute('data-short-length')).toBe('7');
    expect(root?.getAttribute('data-signal-length')).toBe('5');
  });

  it('exposes data-tsi-final', () => {
    const { container } = render(
      <ChartLineTsiSignal data={risingByS(30, 1)} />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-tsi-signal"]',
    );
    expect(root?.getAttribute('data-tsi-final')).toBe('100');
  });

  it('exposes data-signal-final', () => {
    const { container } = render(
      <ChartLineTsiSignal data={risingByS(30, 1)} />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-tsi-signal"]',
    );
    expect(root?.getAttribute('data-signal-final')).toBe('100');
  });

  it('exposes total-points', () => {
    const { container } = render(
      <ChartLineTsiSignal data={risingByS(30, 1)} />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-tsi-signal"]',
    );
    expect(root?.getAttribute('data-total-points')).toBe('30');
  });

  it('renders the screen-reader description', () => {
    const { container } = render(
      <ChartLineTsiSignal data={risingByS(30, 1)} />,
    );
    const desc = container.querySelector(
      '[data-section="chart-line-tsi-signal-aria-desc"]',
    );
    expect(desc?.textContent).toContain('True Strength Index');
  });

  it('renders all three legend items', () => {
    const { container } = render(
      <ChartLineTsiSignal data={risingByS(30, 1)} />,
    );
    expect(container.querySelector('[data-series-id="price"]')).toBeTruthy();
    expect(container.querySelector('[data-series-id="tsi"]')).toBeTruthy();
    expect(container.querySelector('[data-series-id="signal"]')).toBeTruthy();
  });

  it('toggles a series via the legend', () => {
    const onToggle = vi.fn();
    const { container } = render(
      <ChartLineTsiSignal
        data={risingByS(30, 1)}
        onSeriesToggle={onToggle}
      />,
    );
    const button = container.querySelector(
      '[data-series-id="tsi"]',
    ) as HTMLButtonElement | null;
    if (button) fireEvent.click(button);
    expect(onToggle).toHaveBeenCalledWith({ seriesId: 'tsi', hidden: true });
  });

  it('respects controlled hiddenSeries', () => {
    const { container } = render(
      <ChartLineTsiSignal
        data={risingByS(30, 1)}
        hiddenSeries={['tsi']}
      />,
    );
    const button = container.querySelector('[data-series-id="tsi"]');
    expect(button?.getAttribute('data-hidden')).toBe('true');
  });

  it('hides TSI line when controlled hidden', () => {
    const { container } = render(
      <ChartLineTsiSignal
        data={risingByS(30, 1)}
        hiddenSeries={['tsi']}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-tsi-signal-line"]',
      ),
    ).toBe(null);
  });

  it('hides signal line when controlled hidden', () => {
    const { container } = render(
      <ChartLineTsiSignal
        data={risingByS(30, 1)}
        hiddenSeries={['signal']}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-tsi-signal-signal"]',
      ),
    ).toBe(null);
  });

  it('fires onPointClick on marker activation', () => {
    const onPointClick = vi.fn();
    const { container } = render(
      <ChartLineTsiSignal
        data={risingByS(30, 1)}
        onPointClick={onPointClick}
      />,
    );
    const markers = container.querySelectorAll(
      '[data-section="chart-line-tsi-signal-marker"]',
    );
    expect(markers.length).toBeGreaterThan(0);
    fireEvent.click(markers[0]!);
    expect(onPointClick).toHaveBeenCalled();
  });

  it('responds to Enter key on markers', () => {
    const onPointClick = vi.fn();
    const { container } = render(
      <ChartLineTsiSignal
        data={risingByS(30, 1)}
        onPointClick={onPointClick}
      />,
    );
    const marker = container.querySelector(
      '[data-section="chart-line-tsi-signal-marker"]',
    ) as SVGElement | null;
    if (marker) fireEvent.keyDown(marker, { key: 'Enter' });
    expect(onPointClick).toHaveBeenCalled();
  });

  it('responds to Space key on markers', () => {
    const onPointClick = vi.fn();
    const { container } = render(
      <ChartLineTsiSignal
        data={risingByS(30, 1)}
        onPointClick={onPointClick}
      />,
    );
    const marker = container.querySelector(
      '[data-section="chart-line-tsi-signal-marker"]',
    ) as SVGElement | null;
    if (marker) fireEvent.keyDown(marker, { key: ' ' });
    expect(onPointClick).toHaveBeenCalled();
  });

  it('renders the config badge by default', () => {
    const { container } = render(
      <ChartLineTsiSignal data={risingByS(30, 1)} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-tsi-signal-badge"]',
      ),
    ).toBeTruthy();
  });

  it('hides the config badge when disabled', () => {
    const { container } = render(
      <ChartLineTsiSignal
        data={risingByS(30, 1)}
        showConfigBadge={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-tsi-signal-badge"]',
      ),
    ).toBe(null);
  });

  it('renders dots when showDots is true', () => {
    const { container } = render(
      <ChartLineTsiSignal data={risingByS(30, 1)} showDots={true} />,
    );
    expect(
      container.querySelectorAll(
        '[data-section="chart-line-tsi-signal-dot"]',
      ).length,
    ).toBeGreaterThan(0);
  });

  it('does not render dots by default', () => {
    const { container } = render(
      <ChartLineTsiSignal data={risingByS(30, 1)} />,
    );
    expect(
      container.querySelectorAll(
        '[data-section="chart-line-tsi-signal-dot"]',
      ).length,
    ).toBe(0);
  });

  it('hides axis when showAxis is false', () => {
    const { container } = render(
      <ChartLineTsiSignal data={risingByS(30, 1)} showAxis={false} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-tsi-signal-axes"]',
      ),
    ).toBe(null);
  });

  it('hides grid when showGrid is false', () => {
    const { container } = render(
      <ChartLineTsiSignal data={risingByS(30, 1)} showGrid={false} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-tsi-signal-grid"]',
      ),
    ).toBe(null);
  });

  it('hides markers when showMarkers is false', () => {
    const { container } = render(
      <ChartLineTsiSignal data={risingByS(30, 1)} showMarkers={false} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-tsi-signal-markers"]',
      ),
    ).toBe(null);
  });

  it('hides legend when showLegend is false', () => {
    const { container } = render(
      <ChartLineTsiSignal data={risingByS(30, 1)} showLegend={false} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-tsi-signal-legend"]',
      ),
    ).toBe(null);
  });

  it('hides zero line when showZeroLine is false', () => {
    const { container } = render(
      <ChartLineTsiSignal data={risingByS(30, 1)} showZeroLine={false} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-tsi-signal-zero-line"]',
      ),
    ).toBe(null);
  });

  it('hides bands when showBands is false', () => {
    const { container } = render(
      <ChartLineTsiSignal data={risingByS(30, 1)} showBands={false} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-tsi-signal-bands"]',
      ),
    ).toBe(null);
  });

  it('respects a custom formatTsi', () => {
    const fmt = (v: number) => `[T:${v.toFixed(0)}]`;
    const { container } = render(
      <ChartLineTsiSignal data={risingByS(30, 1)} formatTsi={fmt} />,
    );
    const text = container.textContent ?? '';
    expect(text).toMatch(/\[T:-?\d+\]/);
  });

  it('applies className and style', () => {
    const { container } = render(
      <ChartLineTsiSignal
        data={risingByS(30, 1)}
        className="custom-class"
        style={{ background: 'red' }}
      />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-tsi-signal"]',
    );
    expect(root?.classList.contains('custom-class')).toBe(true);
    expect((root as HTMLElement | null)?.style.background).toBe('red');
  });

  it('exposes data-animate attribute', () => {
    const { container } = render(
      <ChartLineTsiSignal data={risingByS(30, 1)} animate={true} />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-tsi-signal"]',
    );
    expect(root?.getAttribute('data-animate')).toBe('true');
  });

  it('animate=false disables fade-in class', () => {
    const { container } = render(
      <ChartLineTsiSignal data={risingByS(30, 1)} animate={false} />,
    );
    const svg = container.querySelector(
      '[data-section="chart-line-tsi-signal-svg"]',
    );
    expect(svg?.classList.contains('motion-safe:animate-fade-in')).toBe(false);
  });

  it('renders the TSI line by default', () => {
    const { container } = render(
      <ChartLineTsiSignal data={risingByS(30, 1)} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-tsi-signal-line"]',
      ),
    ).toBeTruthy();
  });

  it('renders the signal line by default', () => {
    const { container } = render(
      <ChartLineTsiSignal data={risingByS(30, 1)} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-tsi-signal-signal"]',
      ),
    ).toBeTruthy();
  });

  it('renders the price path', () => {
    const { container } = render(
      <ChartLineTsiSignal data={risingByS(30, 1)} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-tsi-signal-price-path"]',
      ),
    ).toBeTruthy();
  });

  it('respects defaultHiddenSeries on uncontrolled mount', () => {
    const { container } = render(
      <ChartLineTsiSignal
        data={risingByS(30, 1)}
        defaultHiddenSeries={['tsi']}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-tsi-signal-line"]',
      ),
    ).toBe(null);
  });

  it('hovering a marker shows the tooltip', () => {
    const { container } = render(
      <ChartLineTsiSignal data={risingByS(30, 1)} />,
    );
    const marker = container.querySelector(
      '[data-section="chart-line-tsi-signal-marker"]',
    ) as SVGElement | null;
    if (marker) fireEvent.mouseEnter(marker);
    expect(
      container.querySelector(
        '[data-section="chart-line-tsi-signal-tooltip"]',
      ),
    ).toBeTruthy();
  });

  it('tooltip vanishes on mouseLeave', () => {
    const { container } = render(
      <ChartLineTsiSignal data={risingByS(30, 1)} />,
    );
    const marker = container.querySelector(
      '[data-section="chart-line-tsi-signal-marker"]',
    ) as SVGElement | null;
    if (marker) {
      fireEvent.mouseEnter(marker);
      fireEvent.mouseLeave(marker);
    }
    expect(
      container.querySelector(
        '[data-section="chart-line-tsi-signal-tooltip"]',
      ),
    ).toBe(null);
  });

  it('tooltip respects showTooltip=false', () => {
    const { container } = render(
      <ChartLineTsiSignal
        data={risingByS(30, 1)}
        showTooltip={false}
      />,
    );
    const marker = container.querySelector(
      '[data-section="chart-line-tsi-signal-marker"]',
    ) as SVGElement | null;
    if (marker) fireEvent.mouseEnter(marker);
    expect(
      container.querySelector(
        '[data-section="chart-line-tsi-signal-tooltip"]',
      ),
    ).toBe(null);
  });
});

describe('TSI integration', () => {
  it('RISING_BY_S yields TSI = +100 bit-exact across many S values', () => {
    for (const S of [0.25, 0.5, 1, 2, 5, 10, 100]) {
      const closes = risingByS(40, S).map((p) => p.close);
      const out = computeLineTsiSignal(closes);
      for (let i = 1; i < 40; i += 1) {
        expect(out.tsi[i]).toBe(100);
      }
    }
  });

  it('FALLING_BY_S yields TSI = -100 bit-exact across many S values', () => {
    for (const S of [0.25, 0.5, 1, 2, 5, 10, 100]) {
      const closes = fallingByS(40, S).map((p) => p.close);
      const out = computeLineTsiSignal(closes);
      for (let i = 1; i < 40; i += 1) {
        expect(out.tsi[i]).toBe(-100);
      }
    }
  });

  it('CONST_FLAT yields all-null TSI across many K values', () => {
    for (const K of [0, 1, 5, 10, 100, -3, 0.5]) {
      const closes = constFlat(40, K).map((p) => p.close);
      const out = computeLineTsiSignal(closes);
      for (let i = 0; i < 40; i += 1) {
        expect(out.tsi[i]).toBe(null);
      }
    }
  });
});
