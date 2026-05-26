import { describe, expect, it, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { createRef } from 'react';
import {
  ChartLineKvo,
  classifyLineKvoZone,
  computeLineKvo,
  computeLineKvoEma,
  computeLineKvoLayout,
  computeLineKvoVolumeForce,
  describeLineKvoChart,
  getLineKvoFinitePoints,
  normalizeLineKvoLength,
  runLineKvo,
  DEFAULT_CHART_LINE_KVO_FAST,
  DEFAULT_CHART_LINE_KVO_SLOW,
} from './chart-line-kvo';
import type {
  ChartLineKvoPoint,
} from './chart-line-kvo';

const zeroVolume = (length: number, basePrice = 100): ChartLineKvoPoint[] =>
  Array.from({ length }, (_, i) => ({
    x: i,
    high: basePrice + i + 1,
    low: basePrice + i - 1,
    close: basePrice + i,
    volume: 0,
  }));

const constOhlc = (length: number, K: number, volume = 100): ChartLineKvoPoint[] =>
  Array.from({ length }, (_, i) => ({
    x: i,
    high: K,
    low: K,
    close: K,
    volume,
  }));

const rising = (length: number, basePrice = 100, volume = 100): ChartLineKvoPoint[] =>
  Array.from({ length }, (_, i) => ({
    x: i,
    high: basePrice + i + 1,
    low: basePrice + i - 1,
    close: basePrice + i,
    volume,
  }));

const falling = (length: number, basePrice = 100, volume = 100): ChartLineKvoPoint[] =>
  Array.from({ length }, (_, i) => ({
    x: i,
    high: basePrice - i + 1,
    low: basePrice - i - 1,
    close: basePrice - i,
    volume,
  }));

describe('getLineKvoFinitePoints', () => {
  it('returns an empty array for null', () => {
    expect(getLineKvoFinitePoints(null)).toEqual([]);
  });

  it('returns an empty array for undefined', () => {
    expect(getLineKvoFinitePoints(undefined)).toEqual([]);
  });

  it('returns an empty array for non-array', () => {
    expect(getLineKvoFinitePoints({} as never)).toEqual([]);
  });

  it('drops non-finite x', () => {
    const result = getLineKvoFinitePoints([
      { x: 1, high: 11, low: 9, close: 10, volume: 100 },
      { x: Number.NaN, high: 11, low: 9, close: 10, volume: 100 },
    ]);
    expect(result.length).toBe(1);
  });

  it('drops non-finite volume', () => {
    const result = getLineKvoFinitePoints([
      { x: 0, high: 11, low: 9, close: 10, volume: Number.NaN },
      { x: 1, high: 11, low: 9, close: 10, volume: 100 },
    ]);
    expect(result.length).toBe(1);
  });

  it('drops null entries', () => {
    const result = getLineKvoFinitePoints([
      null as unknown as ChartLineKvoPoint,
      { x: 1, high: 11, low: 9, close: 10, volume: 100 },
    ]);
    expect(result.length).toBe(1);
  });
});

describe('normalizeLineKvoLength', () => {
  it('returns the default when undefined', () => {
    expect(normalizeLineKvoLength(undefined, 34)).toBe(34);
  });

  it('returns the default when NaN', () => {
    expect(normalizeLineKvoLength(Number.NaN, 34)).toBe(34);
  });

  it('floors fractional lengths', () => {
    expect(normalizeLineKvoLength(7.9, 34)).toBe(7);
  });

  it('rejects length below 2', () => {
    expect(normalizeLineKvoLength(1, 34)).toBe(34);
  });

  it('accepts the minimum length of 2', () => {
    expect(normalizeLineKvoLength(2, 34)).toBe(2);
  });
});

describe('computeLineKvoVolumeForce', () => {
  it('returns an empty array for null', () => {
    expect(computeLineKvoVolumeForce(null)).toEqual([]);
  });

  it('returns an empty array for empty input', () => {
    expect(computeLineKvoVolumeForce([])).toEqual([]);
  });

  it('seed bar (i=0) yields vf = 0', () => {
    const vf = computeLineKvoVolumeForce([
      { high: 11, low: 9, close: 10, volume: 100 },
    ]);
    expect(vf[0]).toBe(0);
  });

  it('ZERO_VOLUME yields vf = 0 at every bar bit-exact', () => {
    const bars = zeroVolume(20).map((p) => ({
      high: p.high,
      low: p.low,
      close: p.close,
      volume: p.volume,
    }));
    const vf = computeLineKvoVolumeForce(bars);
    for (let i = 0; i < vf.length; i += 1) {
      expect(vf[i]).toBe(0);
    }
  });

  it('CONST_OHLC yields vf = 0 at every bar bit-exact', () => {
    const bars = constOhlc(20, 5).map((p) => ({
      high: p.high,
      low: p.low,
      close: p.close,
      volume: p.volume,
    }));
    const vf = computeLineKvoVolumeForce(bars);
    for (let i = 0; i < vf.length; i += 1) {
      expect(vf[i]).toBe(0);
    }
  });

  it('nulls bars with non-finite inputs', () => {
    const bars: Array<{ high: number; low: number; close: number; volume: number }> = [
      { high: 11, low: 9, close: 10, volume: 100 },
      { high: Number.NaN, low: 9, close: 10, volume: 100 },
      { high: 12, low: 10, close: 11, volume: 100 },
    ];
    const vf = computeLineKvoVolumeForce(bars);
    expect(vf[0]).toBe(0);
    expect(vf[1]).toBe(null);
  });

  it('output length matches input length', () => {
    const bars = rising(20).map((p) => ({
      high: p.high,
      low: p.low,
      close: p.close,
      volume: p.volume,
    }));
    const vf = computeLineKvoVolumeForce(bars);
    expect(vf.length).toBe(20);
  });

  it('does not mutate input', () => {
    const bars = rising(20).map((p) => ({
      high: p.high,
      low: p.low,
      close: p.close,
      volume: p.volume,
    }));
    const snap = bars.map((b) => ({ ...b }));
    computeLineKvoVolumeForce(bars);
    for (let i = 0; i < bars.length; i += 1) {
      expect(bars[i]).toEqual(snap[i]);
    }
  });
});

describe('computeLineKvoEma', () => {
  it('EMA of zeros stays at zero bit-exact', () => {
    const out = computeLineKvoEma([0, 0, 0, 0, 0], 9);
    for (let i = 0; i < out.length; i += 1) {
      expect(out[i]).toBe(0);
    }
  });

  it('EMA of constant 2 stays at 2 bit-exact (dyadic-friendly)', () => {
    const out = computeLineKvoEma([2, 2, 2, 2, 2], 9);
    for (let i = 0; i < out.length; i += 1) {
      expect(out[i]).toBe(2);
    }
  });

  it('EMA seeds with the first value', () => {
    const out = computeLineKvoEma([42, 99, 7], 9);
    expect(out[0]).toBe(42);
  });

  it('null breaks the chain and the next finite bar re-seeds', () => {
    const out = computeLineKvoEma([1, 2, null, 5, 6], 9);
    expect(out[0]).toBe(1);
    expect(out[2]).toBe(null);
    expect(out[3]).toBe(5);
  });
});

describe('computeLineKvo', () => {
  it('returns empty arrays for null', () => {
    const out = computeLineKvo(null);
    expect(out.vf).toEqual([]);
    expect(out.kvo).toEqual([]);
  });

  it('returns empty arrays for empty input', () => {
    const out = computeLineKvo([]);
    expect(out.vf).toEqual([]);
    expect(out.kvo).toEqual([]);
  });

  it('ZERO_VOLUME yields KVO = 0 bit-exact at every bar', () => {
    const bars = zeroVolume(60).map((p) => ({
      high: p.high,
      low: p.low,
      close: p.close,
      volume: p.volume,
    }));
    const out = computeLineKvo(bars);
    for (let i = 0; i < out.kvo.length; i += 1) {
      expect(out.kvo[i]).toBe(0);
    }
  });

  it('CONST_OHLC yields KVO = 0 bit-exact at every bar', () => {
    const bars = constOhlc(60, 5).map((p) => ({
      high: p.high,
      low: p.low,
      close: p.close,
      volume: p.volume,
    }));
    const out = computeLineKvo(bars);
    for (let i = 0; i < out.kvo.length; i += 1) {
      expect(out.kvo[i]).toBe(0);
    }
  });

  it('ZERO_VOLUME with non-default fast/slow still yields KVO = 0 bit-exact', () => {
    const bars = zeroVolume(40).map((p) => ({
      high: p.high,
      low: p.low,
      close: p.close,
      volume: p.volume,
    }));
    const out = computeLineKvo(bars, { fast: 5, slow: 15 });
    for (let i = 0; i < out.kvo.length; i += 1) {
      expect(out.kvo[i]).toBe(0);
    }
  });

  it('produces finite values on non-flat data with non-zero volume', () => {
    const bars = rising(60).map((p) => ({
      high: p.high,
      low: p.low,
      close: p.close,
      volume: p.volume,
    }));
    const out = computeLineKvo(bars);
    let foundFinite = false;
    for (let i = 0; i < out.kvo.length; i += 1) {
      const v = out.kvo[i];
      if (typeof v === 'number' && v !== 0) {
        foundFinite = true;
        break;
      }
    }
    expect(foundFinite).toBe(true);
  });

  it('output length matches input length', () => {
    const bars = rising(40).map((p) => ({
      high: p.high,
      low: p.low,
      close: p.close,
      volume: p.volume,
    }));
    const out = computeLineKvo(bars);
    expect(out.vf.length).toBe(40);
    expect(out.kvo.length).toBe(40);
  });
});

describe('classifyLineKvoZone', () => {
  it('classifies positive', () => {
    expect(classifyLineKvoZone(5)).toBe('positive');
  });

  it('classifies negative', () => {
    expect(classifyLineKvoZone(-5)).toBe('negative');
  });

  it('classifies flat at zero', () => {
    expect(classifyLineKvoZone(0)).toBe('flat');
  });

  it('returns none for null', () => {
    expect(classifyLineKvoZone(null)).toBe('none');
  });

  it('returns none for NaN', () => {
    expect(classifyLineKvoZone(Number.NaN)).toBe('none');
  });
});

describe('runLineKvo', () => {
  it('marks ok=false for fewer than 2 points', () => {
    const run = runLineKvo([
      { x: 0, high: 11, low: 9, close: 10, volume: 100 },
    ]);
    expect(run.ok).toBe(false);
  });

  it('marks ok=true for at least 2 points', () => {
    const run = runLineKvo(rising(20));
    expect(run.ok).toBe(true);
  });

  it('uses the default fast/slow when none is provided', () => {
    const run = runLineKvo(rising(20));
    expect(run.fast).toBe(DEFAULT_CHART_LINE_KVO_FAST);
    expect(run.slow).toBe(DEFAULT_CHART_LINE_KVO_SLOW);
  });

  it('respects explicit fast/slow', () => {
    const run = runLineKvo(rising(20), { fast: 5, slow: 13 });
    expect(run.fast).toBe(5);
    expect(run.slow).toBe(13);
  });

  it('sorts by x', () => {
    const data: ChartLineKvoPoint[] = [
      { x: 2, high: 11, low: 9, close: 10, volume: 100 },
      { x: 0, high: 11, low: 9, close: 10, volume: 100 },
      { x: 1, high: 11, low: 9, close: 10, volume: 100 },
    ];
    const run = runLineKvo(data);
    expect(run.samples.map((s) => s.x)).toEqual([0, 1, 2]);
  });

  it('ZERO_VOLUME classifies all bars as flat (KVO = 0)', () => {
    const run = runLineKvo(zeroVolume(30));
    expect(run.flatCount).toBe(30);
    expect(run.positiveCount).toBe(0);
    expect(run.negativeCount).toBe(0);
  });

  it('exposes kvoFinal as the last finite KVO', () => {
    const run = runLineKvo(zeroVolume(30));
    expect(run.kvoFinal).toBe(0);
  });

  it('kvoFinal is null when there is no data', () => {
    const run = runLineKvo([]);
    expect(run.kvoFinal).toBe(null);
  });

  it('counts sum to total samples (CONST_OHLC -> all flat)', () => {
    const run = runLineKvo(constOhlc(30, 5));
    expect(
      run.positiveCount + run.flatCount + run.negativeCount,
    ).toBe(run.series.length);
  });
});

describe('computeLineKvoLayout', () => {
  it('returns ok=false for empty data', () => {
    const layout = computeLineKvoLayout({ data: [] });
    expect(layout.ok).toBe(false);
  });

  it('returns ok=true for sufficient data', () => {
    const layout = computeLineKvoLayout({ data: rising(20) });
    expect(layout.ok).toBe(true);
  });

  it('uses the explicit width and height', () => {
    const layout = computeLineKvoLayout({
      data: rising(20),
      width: 600,
      height: 400,
    });
    expect(layout.width).toBe(600);
    expect(layout.height).toBe(400);
  });

  it('panels stack with price above KVO', () => {
    const layout = computeLineKvoLayout({ data: rising(20) });
    expect(layout.priceBottom).toBeLessThan(layout.kvoTop);
  });

  it('panel gap is respected', () => {
    const layout = computeLineKvoLayout({
      data: rising(20),
      panelGap: 24,
    });
    expect(layout.kvoTop - layout.priceBottom).toBeCloseTo(24, 9);
  });

  it('produces a price path and dots', () => {
    const layout = computeLineKvoLayout({ data: rising(20) });
    expect(layout.pricePath.startsWith('M')).toBe(true);
    expect(layout.priceDots.length).toBe(20);
  });

  it('produces a KVO path and markers', () => {
    const layout = computeLineKvoLayout({ data: rising(20) });
    expect(layout.kvoPath.length).toBeGreaterThan(0);
    expect(layout.markers.length).toBe(20);
  });

  it('zero line is inside the KVO panel', () => {
    const layout = computeLineKvoLayout({ data: rising(20) });
    expect(layout.zeroLineY).toBeGreaterThanOrEqual(layout.kvoTop);
    expect(layout.zeroLineY).toBeLessThanOrEqual(layout.kvoBottom);
  });

  it('priceMin and priceMax differ for constant data', () => {
    const layout = computeLineKvoLayout({ data: constOhlc(20, 5) });
    expect(layout.priceMin).toBeLessThan(layout.priceMax);
  });

  it('kvoMin and kvoMax differ for zero-volume data', () => {
    const layout = computeLineKvoLayout({ data: zeroVolume(30) });
    expect(layout.kvoMin).toBeLessThan(layout.kvoMax);
  });

  it('handles a single point gracefully', () => {
    const layout = computeLineKvoLayout({
      data: [{ x: 0, high: 11, low: 9, close: 10, volume: 100 }],
    });
    expect(layout.ok).toBe(false);
  });
});

describe('describeLineKvoChart', () => {
  it('returns No data for empty input', () => {
    expect(describeLineKvoChart([])).toBe('No data');
  });

  it('mentions Klinger Volume Oscillator', () => {
    const desc = describeLineKvoChart(rising(20));
    expect(desc).toContain('Klinger Volume Oscillator');
  });

  it('mentions signed volume force', () => {
    const desc = describeLineKvoChart(rising(20));
    expect(desc).toContain('signed volume force');
  });

  it('reports the fast and slow periods', () => {
    const desc = describeLineKvoChart(rising(20), { fast: 5, slow: 13 });
    expect(desc).toContain('fast 5');
    expect(desc).toContain('slow 13');
  });

  it('reports positive / flat / negative counts', () => {
    const desc = describeLineKvoChart(zeroVolume(15));
    expect(desc).toMatch(/flat on 15/);
    expect(desc).toMatch(/positive on 0/);
    expect(desc).toMatch(/negative on 0/);
  });

  it('reports the final reading', () => {
    const desc = describeLineKvoChart(zeroVolume(15));
    expect(desc).toContain('0.0000');
  });
});

describe('<ChartLineKvo />', () => {
  it('renders an empty placeholder for no data', () => {
    const { container } = render(<ChartLineKvo data={[]} />);
    const placeholder = container.querySelector(
      '[data-section="chart-line-kvo-empty"]',
    );
    expect(placeholder?.textContent).toBe('No data');
  });

  it('renders region role with aria-label', () => {
    const { container } = render(<ChartLineKvo data={rising(20)} />);
    const region = container.querySelector('[role="region"]');
    expect(region).toBeTruthy();
    expect(region?.getAttribute('aria-label')).toContain(
      'Klinger Volume Oscillator',
    );
  });

  it('forwards ref', () => {
    const ref = createRef<HTMLDivElement>();
    render(<ChartLineKvo data={rising(20)} ref={ref} />);
    expect(ref.current).not.toBe(null);
  });

  it('exposes data-fast and data-slow', () => {
    const { container } = render(
      <ChartLineKvo data={rising(20)} fast={5} slow={13} />,
    );
    const root = container.querySelector('[data-section="chart-line-kvo"]');
    expect(root?.getAttribute('data-fast')).toBe('5');
    expect(root?.getAttribute('data-slow')).toBe('13');
  });

  it('exposes data-kvo-final', () => {
    const { container } = render(<ChartLineKvo data={zeroVolume(20)} />);
    const root = container.querySelector('[data-section="chart-line-kvo"]');
    expect(root?.getAttribute('data-kvo-final')).toBe('0');
  });

  it('exposes total-points', () => {
    const { container } = render(<ChartLineKvo data={rising(25)} />);
    const root = container.querySelector('[data-section="chart-line-kvo"]');
    expect(root?.getAttribute('data-total-points')).toBe('25');
  });

  it('renders the screen-reader description', () => {
    const { container } = render(<ChartLineKvo data={rising(20)} />);
    const desc = container.querySelector(
      '[data-section="chart-line-kvo-aria-desc"]',
    );
    expect(desc?.textContent).toContain('Klinger Volume Oscillator');
  });

  it('renders both legend items', () => {
    const { container } = render(<ChartLineKvo data={rising(20)} />);
    expect(container.querySelector('[data-series-id="price"]')).toBeTruthy();
    expect(container.querySelector('[data-series-id="kvo"]')).toBeTruthy();
  });

  it('toggles a series via the legend', () => {
    const onToggle = vi.fn();
    const { container } = render(
      <ChartLineKvo data={rising(20)} onSeriesToggle={onToggle} />,
    );
    const button = container.querySelector(
      '[data-series-id="kvo"]',
    ) as HTMLButtonElement | null;
    if (button) fireEvent.click(button);
    expect(onToggle).toHaveBeenCalledWith({ seriesId: 'kvo', hidden: true });
  });

  it('respects controlled hiddenSeries', () => {
    const { container } = render(
      <ChartLineKvo data={rising(20)} hiddenSeries={['kvo']} />,
    );
    const button = container.querySelector('[data-series-id="kvo"]');
    expect(button?.getAttribute('data-hidden')).toBe('true');
  });

  it('hides KVO line when controlled hidden', () => {
    const { container } = render(
      <ChartLineKvo data={rising(20)} hiddenSeries={['kvo']} />,
    );
    expect(
      container.querySelector('[data-section="chart-line-kvo-line"]'),
    ).toBe(null);
  });

  it('fires onPointClick on marker activation', () => {
    const onPointClick = vi.fn();
    const { container } = render(
      <ChartLineKvo data={rising(20)} onPointClick={onPointClick} />,
    );
    const markers = container.querySelectorAll(
      '[data-section="chart-line-kvo-marker"]',
    );
    expect(markers.length).toBeGreaterThan(0);
    fireEvent.click(markers[0]!);
    expect(onPointClick).toHaveBeenCalled();
  });

  it('responds to Enter key on markers', () => {
    const onPointClick = vi.fn();
    const { container } = render(
      <ChartLineKvo data={rising(20)} onPointClick={onPointClick} />,
    );
    const marker = container.querySelector(
      '[data-section="chart-line-kvo-marker"]',
    ) as SVGElement | null;
    if (marker) fireEvent.keyDown(marker, { key: 'Enter' });
    expect(onPointClick).toHaveBeenCalled();
  });

  it('responds to Space key on markers', () => {
    const onPointClick = vi.fn();
    const { container } = render(
      <ChartLineKvo data={rising(20)} onPointClick={onPointClick} />,
    );
    const marker = container.querySelector(
      '[data-section="chart-line-kvo-marker"]',
    ) as SVGElement | null;
    if (marker) fireEvent.keyDown(marker, { key: ' ' });
    expect(onPointClick).toHaveBeenCalled();
  });

  it('renders the config badge by default', () => {
    const { container } = render(<ChartLineKvo data={rising(20)} />);
    expect(
      container.querySelector('[data-section="chart-line-kvo-badge"]'),
    ).toBeTruthy();
  });

  it('hides the config badge when disabled', () => {
    const { container } = render(
      <ChartLineKvo data={rising(20)} showConfigBadge={false} />,
    );
    expect(
      container.querySelector('[data-section="chart-line-kvo-badge"]'),
    ).toBe(null);
  });

  it('renders dots when showDots is true', () => {
    const { container } = render(
      <ChartLineKvo data={rising(20)} showDots={true} />,
    );
    expect(
      container.querySelectorAll('[data-section="chart-line-kvo-dot"]').length,
    ).toBeGreaterThan(0);
  });

  it('does not render dots by default', () => {
    const { container } = render(<ChartLineKvo data={rising(20)} />);
    expect(
      container.querySelectorAll('[data-section="chart-line-kvo-dot"]').length,
    ).toBe(0);
  });

  it('hides axis when showAxis is false', () => {
    const { container } = render(
      <ChartLineKvo data={rising(20)} showAxis={false} />,
    );
    expect(
      container.querySelector('[data-section="chart-line-kvo-axes"]'),
    ).toBe(null);
  });

  it('hides grid when showGrid is false', () => {
    const { container } = render(
      <ChartLineKvo data={rising(20)} showGrid={false} />,
    );
    expect(
      container.querySelector('[data-section="chart-line-kvo-grid"]'),
    ).toBe(null);
  });

  it('hides markers when showMarkers is false', () => {
    const { container } = render(
      <ChartLineKvo data={rising(20)} showMarkers={false} />,
    );
    expect(
      container.querySelector('[data-section="chart-line-kvo-markers"]'),
    ).toBe(null);
  });

  it('hides legend when showLegend is false', () => {
    const { container } = render(
      <ChartLineKvo data={rising(20)} showLegend={false} />,
    );
    expect(
      container.querySelector('[data-section="chart-line-kvo-legend"]'),
    ).toBe(null);
  });

  it('hides zero line when showZeroLine is false', () => {
    const { container } = render(
      <ChartLineKvo data={rising(20)} showZeroLine={false} />,
    );
    expect(
      container.querySelector('[data-section="chart-line-kvo-zero-line"]'),
    ).toBe(null);
  });

  it('respects a custom formatKvo', () => {
    const fmt = (v: number) => `[K:${v.toFixed(0)}]`;
    const { container } = render(
      <ChartLineKvo data={zeroVolume(20)} formatKvo={fmt} />,
    );
    const text = container.textContent ?? '';
    expect(text).toMatch(/\[K:-?\d/);
  });

  it('applies className and style', () => {
    const { container } = render(
      <ChartLineKvo
        data={rising(20)}
        className="custom-class"
        style={{ background: 'red' }}
      />,
    );
    const root = container.querySelector('[data-section="chart-line-kvo"]');
    expect(root?.classList.contains('custom-class')).toBe(true);
    expect((root as HTMLElement | null)?.style.background).toBe('red');
  });

  it('exposes data-animate attribute', () => {
    const { container } = render(
      <ChartLineKvo data={rising(20)} animate={true} />,
    );
    const root = container.querySelector('[data-section="chart-line-kvo"]');
    expect(root?.getAttribute('data-animate')).toBe('true');
  });

  it('animate=false disables fade-in class', () => {
    const { container } = render(
      <ChartLineKvo data={rising(20)} animate={false} />,
    );
    const svg = container.querySelector('[data-section="chart-line-kvo-svg"]');
    expect(svg?.classList.contains('motion-safe:animate-fade-in')).toBe(false);
  });

  it('renders the KVO line by default', () => {
    const { container } = render(<ChartLineKvo data={rising(20)} />);
    expect(
      container.querySelector('[data-section="chart-line-kvo-line"]'),
    ).toBeTruthy();
  });

  it('renders the price path', () => {
    const { container } = render(<ChartLineKvo data={rising(20)} />);
    expect(
      container.querySelector('[data-section="chart-line-kvo-price-path"]'),
    ).toBeTruthy();
  });

  it('respects defaultHiddenSeries on uncontrolled mount', () => {
    const { container } = render(
      <ChartLineKvo data={rising(20)} defaultHiddenSeries={['kvo']} />,
    );
    expect(
      container.querySelector('[data-section="chart-line-kvo-line"]'),
    ).toBe(null);
  });

  it('hovering a marker shows the tooltip', () => {
    const { container } = render(<ChartLineKvo data={rising(20)} />);
    const marker = container.querySelector(
      '[data-section="chart-line-kvo-marker"]',
    ) as SVGElement | null;
    if (marker) fireEvent.mouseEnter(marker);
    expect(
      container.querySelector('[data-section="chart-line-kvo-tooltip"]'),
    ).toBeTruthy();
  });

  it('tooltip vanishes on mouseLeave', () => {
    const { container } = render(<ChartLineKvo data={rising(20)} />);
    const marker = container.querySelector(
      '[data-section="chart-line-kvo-marker"]',
    ) as SVGElement | null;
    if (marker) {
      fireEvent.mouseEnter(marker);
      fireEvent.mouseLeave(marker);
    }
    expect(
      container.querySelector('[data-section="chart-line-kvo-tooltip"]'),
    ).toBe(null);
  });

  it('tooltip respects showTooltip=false', () => {
    const { container } = render(
      <ChartLineKvo data={rising(20)} showTooltip={false} />,
    );
    const marker = container.querySelector(
      '[data-section="chart-line-kvo-marker"]',
    ) as SVGElement | null;
    if (marker) fireEvent.mouseEnter(marker);
    expect(
      container.querySelector('[data-section="chart-line-kvo-tooltip"]'),
    ).toBe(null);
  });
});

describe('KVO integration', () => {
  it('ZERO_VOLUME yields KVO = 0 bit-exact across multiple (fast, slow) combos', () => {
    for (const fast of [3, 5, 13, 34]) {
      for (const slow of [10, 20, 55]) {
        if (fast >= slow) continue;
        const bars = zeroVolume(40).map((p) => ({
          high: p.high,
          low: p.low,
          close: p.close,
          volume: p.volume,
        }));
        const out = computeLineKvo(bars, { fast, slow });
        for (const v of out.kvo) {
          expect(v).toBe(0);
        }
      }
    }
  });

  it('CONST_OHLC yields KVO = 0 bit-exact across multiple (fast, slow) combos', () => {
    for (const fast of [3, 5, 13]) {
      for (const slow of [10, 20]) {
        if (fast >= slow) continue;
        const bars = constOhlc(40, 7).map((p) => ({
          high: p.high,
          low: p.low,
          close: p.close,
          volume: p.volume,
        }));
        const out = computeLineKvo(bars, { fast, slow });
        for (const v of out.kvo) {
          expect(v).toBe(0);
        }
      }
    }
  });

  it('non-trivial data produces non-zero KVO at some bar', () => {
    const bars = [
      ...rising(20).map((p) => ({
        high: p.high,
        low: p.low,
        close: p.close,
        volume: p.volume,
      })),
      ...falling(20).map((p) => ({
        high: p.high,
        low: p.low,
        close: p.close,
        volume: p.volume,
      })),
    ];
    const out = computeLineKvo(bars);
    let found = false;
    for (const v of out.kvo) {
      if (typeof v === 'number' && v !== 0) {
        found = true;
        break;
      }
    }
    expect(found).toBe(true);
  });
});
