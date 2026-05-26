import { describe, expect, it, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { createRef } from 'react';
import {
  ChartLineCycleAmplitude,
  applyLineCycleAmplitudeSma,
  classifyLineCycleAmplitudeZone,
  computeLineCycleAmplitude,
  computeLineCycleAmplitudeLayout,
  describeLineCycleAmplitudeChart,
  getLineCycleAmplitudeFinitePoints,
  normalizeLineCycleAmplitudeLength,
  normalizeLineCycleAmplitudeThreshold,
  runLineCycleAmplitude,
  DEFAULT_CHART_LINE_CYCLE_AMPLITUDE_LOOKBACK,
  DEFAULT_CHART_LINE_CYCLE_AMPLITUDE_SMOOTH_LENGTH,
} from './chart-line-cycle-amplitude';
import type {
  ChartLineCycleAmplitudePoint,
} from './chart-line-cycle-amplitude';

const constFlat = (length: number, K: number): ChartLineCycleAmplitudePoint[] =>
  Array.from({ length }, (_, i) => ({ x: i, close: K }));

const risingByS = (length: number, S = 1, c0 = 100): ChartLineCycleAmplitudePoint[] =>
  Array.from({ length }, (_, i) => ({ x: i, close: c0 + S * i }));

const fallingByS = (length: number, S = 1, c0 = 100): ChartLineCycleAmplitudePoint[] =>
  Array.from({ length }, (_, i) => ({ x: i, close: c0 - S * i }));

const sinusoid = (length: number, period: number, amplitude = 10, baseline = 100): ChartLineCycleAmplitudePoint[] =>
  Array.from({ length }, (_, i) => ({
    x: i,
    close: baseline + amplitude * Math.sin((2 * Math.PI * i) / period),
  }));

describe('getLineCycleAmplitudeFinitePoints', () => {
  it('returns an empty array for null', () => {
    expect(getLineCycleAmplitudeFinitePoints(null)).toEqual([]);
  });

  it('returns an empty array for undefined', () => {
    expect(getLineCycleAmplitudeFinitePoints(undefined)).toEqual([]);
  });

  it('drops non-finite x', () => {
    const result = getLineCycleAmplitudeFinitePoints([
      { x: 1, close: 10 },
      { x: Number.NaN, close: 10 },
    ]);
    expect(result.length).toBe(1);
  });

  it('drops non-finite close', () => {
    const result = getLineCycleAmplitudeFinitePoints([
      { x: 0, close: Number.NaN },
      { x: 1, close: 10 },
    ]);
    expect(result.length).toBe(1);
  });

  it('drops null entries', () => {
    const result = getLineCycleAmplitudeFinitePoints([
      null as unknown as ChartLineCycleAmplitudePoint,
      { x: 1, close: 10 },
    ]);
    expect(result.length).toBe(1);
  });
});

describe('normalizeLineCycleAmplitudeLength', () => {
  it('returns the default when undefined', () => {
    expect(normalizeLineCycleAmplitudeLength(undefined, 30)).toBe(30);
  });

  it('returns the default when NaN', () => {
    expect(normalizeLineCycleAmplitudeLength(Number.NaN, 30)).toBe(30);
  });

  it('floors fractional lengths', () => {
    expect(normalizeLineCycleAmplitudeLength(7.9, 30)).toBe(7);
  });

  it('rejects length below 2', () => {
    expect(normalizeLineCycleAmplitudeLength(1, 30)).toBe(30);
  });

  it('accepts the minimum length of 2', () => {
    expect(normalizeLineCycleAmplitudeLength(2, 30)).toBe(2);
  });
});

describe('normalizeLineCycleAmplitudeThreshold', () => {
  it('returns the default when undefined', () => {
    expect(normalizeLineCycleAmplitudeThreshold(undefined, 5)).toBe(5);
  });

  it('rejects negative values', () => {
    expect(normalizeLineCycleAmplitudeThreshold(-3, 5)).toBe(5);
  });

  it('accepts zero', () => {
    expect(normalizeLineCycleAmplitudeThreshold(0, 5)).toBe(0);
  });
});

describe('applyLineCycleAmplitudeSma', () => {
  it('SMA of constant K stays at K bit-exact', () => {
    for (const K of [0, 1, 5, 10, 100]) {
      const out = applyLineCycleAmplitudeSma(Array(10).fill(K), 4);
      for (let i = 3; i < 10; i += 1) {
        expect(out[i]).toBe(K);
      }
    }
  });

  it('warmup bars are null', () => {
    const out = applyLineCycleAmplitudeSma([1, 2, 3, 4, 5], 3);
    expect(out[0]).toBe(null);
    expect(out[1]).toBe(null);
    expect(out[2]).toBe(2);
  });
});

describe('computeLineCycleAmplitude', () => {
  it('returns an empty array for null', () => {
    expect(computeLineCycleAmplitude(null)).toEqual([]);
  });

  it('returns an empty array for empty input', () => {
    expect(computeLineCycleAmplitude([])).toEqual([]);
  });

  it('nulls warmup bars (i < lookback + smoothLength - 1)', () => {
    const closes = constFlat(60, 5).map((p) => p.close);
    const out = computeLineCycleAmplitude(closes, {
      lookback: 30,
      smoothLength: 4,
    });
    for (let i = 0; i < 32; i += 1) {
      expect(out[i]).toBe(null);
    }
    expect(typeof out[33]).toBe('number');
  });

  it('CONST_FLAT yields amplitude = 0 bit-exact past warmup', () => {
    for (const K of [0, 1, 5, 10, 100, -3]) {
      const closes = constFlat(60, K).map((p) => p.close);
      const out = computeLineCycleAmplitude(closes, {
        lookback: 30,
        smoothLength: 4,
      });
      for (let i = 33; i < 60; i += 1) {
        expect(out[i]).toBe(0);
      }
    }
  });

  it('RISING_BY_S yields amplitude = 0 bit-exact past warmup', () => {
    for (const S of [1, 2, 5, 10]) {
      const closes = risingByS(60, S).map((p) => p.close);
      const out = computeLineCycleAmplitude(closes, {
        lookback: 30,
        smoothLength: 4,
      });
      // After SMA stabilization, detrended = constant lag, so
      // max - min = 0 over any window.
      for (let i = 33; i < 60; i += 1) {
        expect(out[i]).toBe(0);
      }
    }
  });

  it('FALLING_BY_S yields amplitude = 0 bit-exact past warmup', () => {
    for (const S of [1, 2, 5]) {
      const closes = fallingByS(60, S).map((p) => p.close);
      const out = computeLineCycleAmplitude(closes, {
        lookback: 30,
        smoothLength: 4,
      });
      for (let i = 33; i < 60; i += 1) {
        expect(out[i]).toBe(0);
      }
    }
  });

  it('sinusoid produces a positive amplitude bounded by 2A', () => {
    const A = 10;
    const closes = sinusoid(120, 20, A).map((p) => p.close);
    const out = computeLineCycleAmplitude(closes, {
      lookback: 30,
      smoothLength: 4,
    });
    // After warmup, amplitude should be positive and at most ~2A.
    let foundPositive = false;
    for (let i = 60; i < 120; i += 1) {
      const v = out[i];
      if (typeof v === 'number' && v > 0) {
        foundPositive = true;
        expect(v).toBeLessThanOrEqual(2 * A + 0.1);
      }
    }
    expect(foundPositive).toBe(true);
  });

  it('amplitude is non-negative for any input', () => {
    const closes: number[] = [];
    for (let i = 0; i < 80; i += 1) {
      closes.push(100 + Math.sin(i / 3) * 5 + (i % 7));
    }
    const out = computeLineCycleAmplitude(closes, {
      lookback: 30,
      smoothLength: 4,
    });
    for (let i = 33; i < 80; i += 1) {
      const v = out[i];
      if (v !== null) expect(v).toBeGreaterThanOrEqual(0);
    }
  });

  it('output length matches input length', () => {
    const closes = constFlat(60, 5).map((p) => p.close);
    const out = computeLineCycleAmplitude(closes);
    expect(out.length).toBe(60);
  });

  it('does not mutate input', () => {
    const closes = constFlat(60, 5).map((p) => p.close);
    const snap = closes.slice();
    computeLineCycleAmplitude(closes);
    expect(closes).toEqual(snap);
  });

  it('rejects non-finite lookback (uses default)', () => {
    const closes = constFlat(60, 5).map((p) => p.close);
    const out = computeLineCycleAmplitude(closes, {
      lookback: Number.NaN,
      smoothLength: 4,
    });
    expect(out[40]).toBe(0);
  });

  it('translation invariance: shifting close by C does not change amplitude', () => {
    const baseCloses = sinusoid(80, 20, 10).map((p) => p.close);
    const shiftedCloses = baseCloses.map((c) => c + 1000);
    const base = computeLineCycleAmplitude(baseCloses, {
      lookback: 30,
      smoothLength: 4,
    });
    const shifted = computeLineCycleAmplitude(shiftedCloses, {
      lookback: 30,
      smoothLength: 4,
    });
    for (let i = 0; i < base.length; i += 1) {
      const b = base[i];
      const s = shifted[i];
      if (b == null || s == null) {
        expect(b).toBe(s);
        continue;
      }
      expect(s).toBeCloseTo(b, 9);
    }
  });
});

describe('classifyLineCycleAmplitudeZone', () => {
  it('classifies high above threshold', () => {
    expect(classifyLineCycleAmplitudeZone(10, 5, 1)).toBe('high');
    expect(classifyLineCycleAmplitudeZone(5, 5, 1)).toBe('high');
  });

  it('classifies low below threshold', () => {
    expect(classifyLineCycleAmplitudeZone(0.5, 5, 1)).toBe('low');
    expect(classifyLineCycleAmplitudeZone(1, 5, 1)).toBe('low');
  });

  it('classifies mid between bands', () => {
    expect(classifyLineCycleAmplitudeZone(3, 5, 1)).toBe('mid');
  });

  it('returns none for null', () => {
    expect(classifyLineCycleAmplitudeZone(null, 5, 1)).toBe('none');
  });

  it('returns none for NaN', () => {
    expect(classifyLineCycleAmplitudeZone(Number.NaN, 5, 1)).toBe('none');
  });
});

describe('runLineCycleAmplitude', () => {
  it('marks ok=false for fewer than lookback + smoothLength points', () => {
    const run = runLineCycleAmplitude(constFlat(20, 5));
    expect(run.ok).toBe(false);
  });

  it('marks ok=true with enough points', () => {
    const run = runLineCycleAmplitude(constFlat(40, 5));
    expect(run.ok).toBe(true);
  });

  it('uses defaults when none is provided', () => {
    const run = runLineCycleAmplitude(constFlat(60, 5));
    expect(run.lookback).toBe(DEFAULT_CHART_LINE_CYCLE_AMPLITUDE_LOOKBACK);
    expect(run.smoothLength).toBe(
      DEFAULT_CHART_LINE_CYCLE_AMPLITUDE_SMOOTH_LENGTH,
    );
  });

  it('respects explicit options', () => {
    const run = runLineCycleAmplitude(constFlat(60, 5), {
      lookback: 20,
      smoothLength: 6,
      highThreshold: 10,
      lowThreshold: 2,
    });
    expect(run.lookback).toBe(20);
    expect(run.smoothLength).toBe(6);
    expect(run.highThreshold).toBe(10);
    expect(run.lowThreshold).toBe(2);
  });

  it('sorts by x', () => {
    const data: ChartLineCycleAmplitudePoint[] = [
      { x: 2, close: 30 },
      { x: 0, close: 10 },
      { x: 1, close: 20 },
    ];
    const run = runLineCycleAmplitude(data);
    expect(run.samples.map((s) => s.x)).toEqual([0, 1, 2]);
  });

  it('CONST_FLAT classifies all post-warmup as low (amp = 0 <= 1)', () => {
    const run = runLineCycleAmplitude(constFlat(60, 5));
    expect(run.lowCount).toBe(60 - 33);
    expect(run.highCount).toBe(0);
    expect(run.midCount).toBe(0);
  });

  it('exposes amplitudeFinal as the last finite reading', () => {
    const run = runLineCycleAmplitude(constFlat(60, 5));
    expect(run.amplitudeFinal).toBe(0);
  });

  it('amplitudeFinal is null when there is no data', () => {
    const run = runLineCycleAmplitude([]);
    expect(run.amplitudeFinal).toBe(null);
  });
});

describe('computeLineCycleAmplitudeLayout', () => {
  it('returns ok=false for empty data', () => {
    const layout = computeLineCycleAmplitudeLayout({ data: [] });
    expect(layout.ok).toBe(false);
  });

  it('returns ok=true for sufficient data', () => {
    const layout = computeLineCycleAmplitudeLayout({
      data: constFlat(60, 5),
    });
    expect(layout.ok).toBe(true);
  });

  it('uses the explicit width and height', () => {
    const layout = computeLineCycleAmplitudeLayout({
      data: constFlat(60, 5),
      width: 600,
      height: 400,
    });
    expect(layout.width).toBe(600);
    expect(layout.height).toBe(400);
  });

  it('panels stack with price above amplitude', () => {
    const layout = computeLineCycleAmplitudeLayout({
      data: constFlat(60, 5),
    });
    expect(layout.priceBottom).toBeLessThan(layout.amplitudeTop);
  });

  it('panel gap is respected', () => {
    const layout = computeLineCycleAmplitudeLayout({
      data: constFlat(60, 5),
      panelGap: 24,
    });
    expect(layout.amplitudeTop - layout.priceBottom).toBeCloseTo(24, 9);
  });

  it('produces a price path and dots', () => {
    const layout = computeLineCycleAmplitudeLayout({
      data: constFlat(60, 5),
    });
    expect(layout.pricePath.startsWith('M')).toBe(true);
    expect(layout.priceDots.length).toBe(60);
  });

  it('produces an amplitude path and markers', () => {
    const layout = computeLineCycleAmplitudeLayout({
      data: constFlat(60, 5),
    });
    expect(layout.markers.length).toBe(60 - 33);
  });

  it('amplitude panel min = 0 (non-negative)', () => {
    const layout = computeLineCycleAmplitudeLayout({
      data: constFlat(60, 5),
    });
    expect(layout.ampPanelMin).toBe(0);
  });

  it('high / low band lines are inside the amplitude panel', () => {
    const layout = computeLineCycleAmplitudeLayout({
      data: constFlat(60, 5),
    });
    expect(layout.highBandY).toBeGreaterThanOrEqual(layout.amplitudeTop);
    expect(layout.highBandY).toBeLessThanOrEqual(layout.amplitudeBottom);
    expect(layout.lowBandY).toBeGreaterThanOrEqual(layout.amplitudeTop);
    expect(layout.lowBandY).toBeLessThanOrEqual(layout.amplitudeBottom);
  });

  it('handles a single point gracefully', () => {
    const layout = computeLineCycleAmplitudeLayout({
      data: [{ x: 0, close: 10 }],
    });
    expect(layout.ok).toBe(false);
  });
});

describe('describeLineCycleAmplitudeChart', () => {
  it('returns No data for empty input', () => {
    expect(describeLineCycleAmplitudeChart([])).toBe('No data');
  });

  it('mentions Cycle Amplitude', () => {
    const desc = describeLineCycleAmplitudeChart(constFlat(60, 5));
    expect(desc).toContain('Cycle Amplitude');
  });

  it('mentions peak-to-trough', () => {
    const desc = describeLineCycleAmplitudeChart(constFlat(60, 5));
    expect(desc).toContain('peak-to-');
  });

  it('reports the lookback', () => {
    const desc = describeLineCycleAmplitudeChart(constFlat(60, 5), {
      lookback: 20,
    });
    expect(desc).toContain('lookback 20');
  });

  it('reports the final reading', () => {
    const desc = describeLineCycleAmplitudeChart(constFlat(60, 5));
    expect(desc).toContain('0.0000');
  });
});

describe('<ChartLineCycleAmplitude />', () => {
  it('renders an empty placeholder for no data', () => {
    const { container } = render(<ChartLineCycleAmplitude data={[]} />);
    const placeholder = container.querySelector(
      '[data-section="chart-line-cycle-amplitude-empty"]',
    );
    expect(placeholder?.textContent).toBe('No data');
  });

  it('renders region role with aria-label', () => {
    const { container } = render(
      <ChartLineCycleAmplitude data={constFlat(60, 5)} />,
    );
    const region = container.querySelector('[role="region"]');
    expect(region).toBeTruthy();
    expect(region?.getAttribute('aria-label')).toContain('Cycle Amplitude');
  });

  it('forwards ref', () => {
    const ref = createRef<HTMLDivElement>();
    render(<ChartLineCycleAmplitude data={constFlat(60, 5)} ref={ref} />);
    expect(ref.current).not.toBe(null);
  });

  it('exposes data-lookback', () => {
    const { container } = render(
      <ChartLineCycleAmplitude data={constFlat(60, 5)} lookback={20} />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-cycle-amplitude"]',
    );
    expect(root?.getAttribute('data-lookback')).toBe('20');
  });

  it('exposes data-amplitude-final', () => {
    const { container } = render(
      <ChartLineCycleAmplitude data={constFlat(60, 5)} />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-cycle-amplitude"]',
    );
    expect(root?.getAttribute('data-amplitude-final')).toBe('0');
  });

  it('exposes total-points', () => {
    const { container } = render(
      <ChartLineCycleAmplitude data={constFlat(60, 5)} />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-cycle-amplitude"]',
    );
    expect(root?.getAttribute('data-total-points')).toBe('60');
  });

  it('renders the screen-reader description', () => {
    const { container } = render(
      <ChartLineCycleAmplitude data={constFlat(60, 5)} />,
    );
    const desc = container.querySelector(
      '[data-section="chart-line-cycle-amplitude-aria-desc"]',
    );
    expect(desc?.textContent).toContain('Cycle Amplitude');
  });

  it('renders both legend items', () => {
    const { container } = render(
      <ChartLineCycleAmplitude data={constFlat(60, 5)} />,
    );
    expect(container.querySelector('[data-series-id="price"]')).toBeTruthy();
    expect(
      container.querySelector('[data-series-id="amplitude"]'),
    ).toBeTruthy();
  });

  it('toggles a series via the legend', () => {
    const onToggle = vi.fn();
    const { container } = render(
      <ChartLineCycleAmplitude
        data={constFlat(60, 5)}
        onSeriesToggle={onToggle}
      />,
    );
    const button = container.querySelector(
      '[data-series-id="amplitude"]',
    ) as HTMLButtonElement | null;
    if (button) fireEvent.click(button);
    expect(onToggle).toHaveBeenCalledWith({
      seriesId: 'amplitude',
      hidden: true,
    });
  });

  it('respects controlled hiddenSeries', () => {
    const { container } = render(
      <ChartLineCycleAmplitude
        data={constFlat(60, 5)}
        hiddenSeries={['amplitude']}
      />,
    );
    const button = container.querySelector('[data-series-id="amplitude"]');
    expect(button?.getAttribute('data-hidden')).toBe('true');
  });

  it('hides amplitude line when controlled hidden', () => {
    const { container } = render(
      <ChartLineCycleAmplitude
        data={constFlat(60, 5)}
        hiddenSeries={['amplitude']}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-cycle-amplitude-line"]',
      ),
    ).toBe(null);
  });

  it('fires onPointClick on marker activation', () => {
    const onPointClick = vi.fn();
    const { container } = render(
      <ChartLineCycleAmplitude
        data={constFlat(60, 5)}
        onPointClick={onPointClick}
      />,
    );
    const markers = container.querySelectorAll(
      '[data-section="chart-line-cycle-amplitude-marker"]',
    );
    expect(markers.length).toBeGreaterThan(0);
    fireEvent.click(markers[0]!);
    expect(onPointClick).toHaveBeenCalled();
  });

  it('responds to Enter key on markers', () => {
    const onPointClick = vi.fn();
    const { container } = render(
      <ChartLineCycleAmplitude
        data={constFlat(60, 5)}
        onPointClick={onPointClick}
      />,
    );
    const marker = container.querySelector(
      '[data-section="chart-line-cycle-amplitude-marker"]',
    ) as SVGElement | null;
    if (marker) fireEvent.keyDown(marker, { key: 'Enter' });
    expect(onPointClick).toHaveBeenCalled();
  });

  it('responds to Space key on markers', () => {
    const onPointClick = vi.fn();
    const { container } = render(
      <ChartLineCycleAmplitude
        data={constFlat(60, 5)}
        onPointClick={onPointClick}
      />,
    );
    const marker = container.querySelector(
      '[data-section="chart-line-cycle-amplitude-marker"]',
    ) as SVGElement | null;
    if (marker) fireEvent.keyDown(marker, { key: ' ' });
    expect(onPointClick).toHaveBeenCalled();
  });

  it('renders the config badge by default', () => {
    const { container } = render(
      <ChartLineCycleAmplitude data={constFlat(60, 5)} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-cycle-amplitude-badge"]',
      ),
    ).toBeTruthy();
  });

  it('hides the config badge when disabled', () => {
    const { container } = render(
      <ChartLineCycleAmplitude
        data={constFlat(60, 5)}
        showConfigBadge={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-cycle-amplitude-badge"]',
      ),
    ).toBe(null);
  });

  it('renders dots when showDots is true', () => {
    const { container } = render(
      <ChartLineCycleAmplitude data={constFlat(60, 5)} showDots={true} />,
    );
    expect(
      container.querySelectorAll(
        '[data-section="chart-line-cycle-amplitude-dot"]',
      ).length,
    ).toBeGreaterThan(0);
  });

  it('does not render dots by default', () => {
    const { container } = render(
      <ChartLineCycleAmplitude data={constFlat(60, 5)} />,
    );
    expect(
      container.querySelectorAll(
        '[data-section="chart-line-cycle-amplitude-dot"]',
      ).length,
    ).toBe(0);
  });

  it('hides axis when showAxis is false', () => {
    const { container } = render(
      <ChartLineCycleAmplitude
        data={constFlat(60, 5)}
        showAxis={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-cycle-amplitude-axes"]',
      ),
    ).toBe(null);
  });

  it('hides grid when showGrid is false', () => {
    const { container } = render(
      <ChartLineCycleAmplitude
        data={constFlat(60, 5)}
        showGrid={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-cycle-amplitude-grid"]',
      ),
    ).toBe(null);
  });

  it('hides markers when showMarkers is false', () => {
    const { container } = render(
      <ChartLineCycleAmplitude
        data={constFlat(60, 5)}
        showMarkers={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-cycle-amplitude-markers"]',
      ),
    ).toBe(null);
  });

  it('hides legend when showLegend is false', () => {
    const { container } = render(
      <ChartLineCycleAmplitude
        data={constFlat(60, 5)}
        showLegend={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-cycle-amplitude-legend"]',
      ),
    ).toBe(null);
  });

  it('hides bands when showBands is false', () => {
    const { container } = render(
      <ChartLineCycleAmplitude
        data={constFlat(60, 5)}
        showBands={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-cycle-amplitude-bands"]',
      ),
    ).toBe(null);
  });

  it('hides zero line when showZeroLine is false', () => {
    const { container } = render(
      <ChartLineCycleAmplitude
        data={constFlat(60, 5)}
        showZeroLine={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-cycle-amplitude-zero-line"]',
      ),
    ).toBe(null);
  });

  it('respects a custom formatAmplitude', () => {
    const fmt = (v: number) => `[A:${v.toFixed(2)}]`;
    const { container } = render(
      <ChartLineCycleAmplitude
        data={constFlat(60, 5)}
        formatAmplitude={fmt}
      />,
    );
    const text = container.textContent ?? '';
    expect(text).toMatch(/\[A:-?\d/);
  });

  it('applies className and style', () => {
    const { container } = render(
      <ChartLineCycleAmplitude
        data={constFlat(60, 5)}
        className="custom-class"
        style={{ background: 'red' }}
      />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-cycle-amplitude"]',
    );
    expect(root?.classList.contains('custom-class')).toBe(true);
    expect((root as HTMLElement | null)?.style.background).toBe('red');
  });

  it('exposes data-animate attribute', () => {
    const { container } = render(
      <ChartLineCycleAmplitude data={constFlat(60, 5)} animate={true} />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-cycle-amplitude"]',
    );
    expect(root?.getAttribute('data-animate')).toBe('true');
  });

  it('animate=false disables fade-in class', () => {
    const { container } = render(
      <ChartLineCycleAmplitude data={constFlat(60, 5)} animate={false} />,
    );
    const svg = container.querySelector(
      '[data-section="chart-line-cycle-amplitude-svg"]',
    );
    expect(svg?.classList.contains('motion-safe:animate-fade-in')).toBe(false);
  });

  it('renders the amplitude line by default', () => {
    const { container } = render(
      <ChartLineCycleAmplitude data={constFlat(60, 5)} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-cycle-amplitude-line"]',
      ),
    ).toBeTruthy();
  });

  it('renders the price path', () => {
    const { container } = render(
      <ChartLineCycleAmplitude data={constFlat(60, 5)} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-cycle-amplitude-price-path"]',
      ),
    ).toBeTruthy();
  });

  it('respects defaultHiddenSeries on uncontrolled mount', () => {
    const { container } = render(
      <ChartLineCycleAmplitude
        data={constFlat(60, 5)}
        defaultHiddenSeries={['amplitude']}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-cycle-amplitude-line"]',
      ),
    ).toBe(null);
  });

  it('hovering a marker shows the tooltip', () => {
    const { container } = render(
      <ChartLineCycleAmplitude data={constFlat(60, 5)} />,
    );
    const marker = container.querySelector(
      '[data-section="chart-line-cycle-amplitude-marker"]',
    ) as SVGElement | null;
    if (marker) fireEvent.mouseEnter(marker);
    expect(
      container.querySelector(
        '[data-section="chart-line-cycle-amplitude-tooltip"]',
      ),
    ).toBeTruthy();
  });

  it('tooltip vanishes on mouseLeave', () => {
    const { container } = render(
      <ChartLineCycleAmplitude data={constFlat(60, 5)} />,
    );
    const marker = container.querySelector(
      '[data-section="chart-line-cycle-amplitude-marker"]',
    ) as SVGElement | null;
    if (marker) {
      fireEvent.mouseEnter(marker);
      fireEvent.mouseLeave(marker);
    }
    expect(
      container.querySelector(
        '[data-section="chart-line-cycle-amplitude-tooltip"]',
      ),
    ).toBe(null);
  });

  it('tooltip respects showTooltip=false', () => {
    const { container } = render(
      <ChartLineCycleAmplitude
        data={constFlat(60, 5)}
        showTooltip={false}
      />,
    );
    const marker = container.querySelector(
      '[data-section="chart-line-cycle-amplitude-marker"]',
    ) as SVGElement | null;
    if (marker) fireEvent.mouseEnter(marker);
    expect(
      container.querySelector(
        '[data-section="chart-line-cycle-amplitude-tooltip"]',
      ),
    ).toBe(null);
  });
});

describe('Cycle Amplitude integration', () => {
  it('CONST_FLAT yields amplitude = 0 across many (K, lookback, smooth) combos', () => {
    for (const K of [0, 1, 5, 10, 100, -3]) {
      for (const lb of [10, 20, 30, 40]) {
        for (const sm of [2, 4, 6]) {
          const closes = constFlat(lb + sm + 10, K).map((p) => p.close);
          const out = computeLineCycleAmplitude(closes, {
            lookback: lb,
            smoothLength: sm,
          });
          expect(out[closes.length - 1]).toBe(0);
        }
      }
    }
  });

  it('RISING_BY_S yields amplitude = 0 across many (S, lookback) combos', () => {
    for (const S of [1, 2, 5, 10, 0.5]) {
      for (const lb of [10, 20, 30, 40]) {
        const closes = risingByS(lb + 10, S).map((p) => p.close);
        const out = computeLineCycleAmplitude(closes, {
          lookback: lb,
          smoothLength: 4,
        });
        expect(out[closes.length - 1]).toBe(0);
      }
    }
  });
});
