import { describe, expect, it, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { createRef } from 'react';
import {
  ChartLineElderForce,
  applyLineElderForceEma,
  classifyLineElderForceZone,
  computeLineElderForce,
  computeLineElderForceLayout,
  computeLineElderForceRaw,
  describeLineElderForceChart,
  getLineElderForceFinitePoints,
  normalizeLineElderForceLength,
  runLineElderForce,
  DEFAULT_CHART_LINE_ELDER_FORCE_LENGTH,
} from './chart-line-elder-force';
import type { ChartLineElderForcePoint } from './chart-line-elder-force';

const constSeries = (
  count: number,
  K: number,
  V = 100,
): ChartLineElderForcePoint[] =>
  Array.from({ length: count }, (_, i) => ({ x: i, close: K, volume: V }));

const rampSeries = (
  count: number,
  slope = 1,
  V = 100,
): ChartLineElderForcePoint[] =>
  Array.from({ length: count }, (_, i) => ({
    x: i,
    close: i * slope,
    volume: V,
  }));

describe('getLineElderForceFinitePoints', () => {
  it('returns an empty array for null', () => {
    expect(getLineElderForceFinitePoints(null)).toEqual([]);
  });

  it('returns an empty array for undefined', () => {
    expect(getLineElderForceFinitePoints(undefined)).toEqual([]);
  });

  it('drops non-finite x', () => {
    const result = getLineElderForceFinitePoints([
      { x: 1, close: 10, volume: 100 },
      { x: Number.NaN, close: 10, volume: 100 },
    ]);
    expect(result.length).toBe(1);
  });

  it('drops non-finite close', () => {
    const result = getLineElderForceFinitePoints([
      { x: 0, close: Number.NaN, volume: 100 },
      { x: 1, close: 10, volume: 100 },
    ]);
    expect(result.length).toBe(1);
  });

  it('drops non-finite volume', () => {
    const result = getLineElderForceFinitePoints([
      { x: 0, close: 10, volume: Number.NaN },
      { x: 1, close: 10, volume: 100 },
    ]);
    expect(result.length).toBe(1);
  });

  it('drops null entries', () => {
    const result = getLineElderForceFinitePoints([
      null as unknown as ChartLineElderForcePoint,
      { x: 1, close: 10, volume: 100 },
    ]);
    expect(result.length).toBe(1);
  });
});

describe('normalizeLineElderForceLength', () => {
  it('returns the default when undefined', () => {
    expect(normalizeLineElderForceLength(undefined, 13)).toBe(13);
  });

  it('floors fractional lengths', () => {
    expect(normalizeLineElderForceLength(7.9, 13)).toBe(7);
  });

  it('rejects length below 2', () => {
    expect(normalizeLineElderForceLength(1, 13)).toBe(13);
  });
});

describe('applyLineElderForceEma', () => {
  it('EMA of constant 0 stays at 0', () => {
    const out = applyLineElderForceEma(Array(10).fill(0), 13);
    for (const v of out) expect(v).toBe(0);
  });

  it('null breaks chain and re-seeds', () => {
    const out = applyLineElderForceEma([1, 2, null, 5, 6], 9);
    expect(out[0]).toBe(1);
    expect(out[2]).toBe(null);
    expect(out[3]).toBe(5);
  });
});

describe('computeLineElderForceRaw', () => {
  it('emits null at bar 0', () => {
    const raw = computeLineElderForceRaw([
      { close: 10, volume: 100 },
      { close: 12, volume: 100 },
    ]);
    expect(raw[0]).toBe(null);
  });

  it('computes (close - prevClose) * volume at i >= 1', () => {
    const raw = computeLineElderForceRaw([
      { close: 10, volume: 100 },
      { close: 12, volume: 50 },
    ]);
    // (12 - 10) * 50 = 100
    expect(raw[1]).toBe(100);
  });

  it('CONST close yields raw = 0 at every i >= 1 (any volume)', () => {
    const raw = computeLineElderForceRaw(
      constSeries(10, 5, 100).map((p) => ({
        close: p.close,
        volume: p.volume,
      })),
    );
    expect(raw[0]).toBe(null);
    for (let i = 1; i < 10; i += 1) {
      expect(raw[i]).toBe(0);
    }
  });

  it('CONST close with zero volume yields raw = 0', () => {
    const raw = computeLineElderForceRaw(
      constSeries(10, 5, 0).map((p) => ({
        close: p.close,
        volume: p.volume,
      })),
    );
    expect(raw[0]).toBe(null);
    for (let i = 1; i < 10; i += 1) {
      expect(raw[i]).toBe(0);
    }
  });

  it('CONST close with negative volume yields raw = 0 (not -0)', () => {
    const raw = computeLineElderForceRaw(
      constSeries(10, 5, -100).map((p) => ({
        close: p.close,
        volume: p.volume,
      })),
    );
    for (let i = 1; i < 10; i += 1) {
      expect(raw[i]).toBe(0);
    }
  });

  it('returns an empty array for empty input', () => {
    expect(computeLineElderForceRaw([])).toEqual([]);
  });

  it('returns an empty array for null', () => {
    expect(computeLineElderForceRaw(null)).toEqual([]);
  });
});

describe('computeLineElderForce', () => {
  it('returns empty for null', () => {
    const ch = computeLineElderForce(null);
    expect(ch.raw).toEqual([]);
    expect(ch.efi).toEqual([]);
  });

  it('returns empty for empty input', () => {
    const ch = computeLineElderForce([]);
    expect(ch.efi).toEqual([]);
  });

  it('CONST close yields EFI = 0 at every bar >= 1 (any volume)', () => {
    for (const K of [1, 5, 100, -3, 0]) {
      for (const V of [100, 0, 1, -50, 1000]) {
        const series = constSeries(20, K, V).map((p) => ({
          close: p.close,
          volume: p.volume,
        }));
        const ch = computeLineElderForce(series, { length: 13 });
        // bar 0 is null (no prevClose)
        expect(ch.efi[0]).toBe(null);
        for (let i = 1; i < 20; i += 1) {
          expect(ch.efi[i]).toBe(0);
        }
      }
    }
  });

  it('output length matches input length', () => {
    const series = constSeries(20, 10).map((p) => ({
      close: p.close,
      volume: p.volume,
    }));
    const ch = computeLineElderForce(series, { length: 13 });
    expect(ch.efi.length).toBe(20);
  });

  it('does not mutate input', () => {
    const series = constSeries(20, 10).map((p) => ({
      close: p.close,
      volume: p.volume,
    }));
    const snap = series.map((b) => ({ ...b }));
    computeLineElderForce(series, { length: 13 });
    for (let i = 0; i < series.length; i += 1) {
      expect(series[i]).toEqual(snap[i]);
    }
  });

  it('rejects non-finite length (uses default)', () => {
    const series = constSeries(20, 10).map((p) => ({
      close: p.close,
      volume: p.volume,
    }));
    const ch = computeLineElderForce(series, { length: Number.NaN });
    expect(ch.efi[1]).toBe(0);
  });

  it('ramped close produces non-zero EFI past bar 0', () => {
    const series = rampSeries(20, 1, 100).map((p) => ({
      close: p.close,
      volume: p.volume,
    }));
    const ch = computeLineElderForce(series, { length: 13 });
    for (let i = 1; i < 20; i += 1) {
      const e = ch.efi[i];
      expect(e != null && e > 0).toBe(true);
    }
  });

  it('symmetric pattern: rising then falling close cancels EFI ratio', () => {
    // close = 0,1,2,3,4 then 3,2,1,0; raw[1..4] = +V each, raw[5..8] = -V each.
    // EMA of +V then -V wouldn't symmetric-cancel, but final reading
    // moves through both signs.
    const series: Array<{ close: number; volume: number }> = [];
    for (let i = 0; i < 5; i += 1) series.push({ close: i, volume: 10 });
    for (let i = 3; i >= 0; i -= 1) series.push({ close: i, volume: 10 });
    const ch = computeLineElderForce(series, { length: 2 });
    // First non-null raw is at bar 1: (1-0)*10 = +10.
    expect(ch.raw[1]).toBe(10);
    // bar 5: (3-4)*10 = -10.
    expect(ch.raw[5]).toBe(-10);
  });
});

describe('classifyLineElderForceZone', () => {
  it('classifies at when value == 0', () => {
    expect(classifyLineElderForceZone(0, 100)).toBe('at');
  });

  it('classifies strong-up at >= 50% of abs max', () => {
    expect(classifyLineElderForceZone(50, 100)).toBe('strong-up');
    expect(classifyLineElderForceZone(100, 100)).toBe('strong-up');
  });

  it('classifies above between 0 and 50% of abs max', () => {
    expect(classifyLineElderForceZone(25, 100)).toBe('above');
  });

  it('classifies below between -50% and 0', () => {
    expect(classifyLineElderForceZone(-25, 100)).toBe('below');
  });

  it('classifies strong-down at <= -50% of abs max', () => {
    expect(classifyLineElderForceZone(-50, 100)).toBe('strong-down');
    expect(classifyLineElderForceZone(-100, 100)).toBe('strong-down');
  });

  it('returns none for null', () => {
    expect(classifyLineElderForceZone(null, 100)).toBe('none');
  });

  it('returns none for NaN', () => {
    expect(classifyLineElderForceZone(Number.NaN, 100)).toBe('none');
  });

  it('falls back to above/below when efiAbsMaxSeen is zero', () => {
    expect(classifyLineElderForceZone(5, 0)).toBe('above');
    expect(classifyLineElderForceZone(-5, 0)).toBe('below');
  });
});

describe('runLineElderForce', () => {
  it('marks ok=false for a single point', () => {
    const run = runLineElderForce([{ x: 0, close: 10, volume: 100 }]);
    expect(run.ok).toBe(false);
  });

  it('marks ok=true with two or more points', () => {
    const run = runLineElderForce(constSeries(2, 5));
    expect(run.ok).toBe(true);
  });

  it('uses defaults when none is provided', () => {
    const run = runLineElderForce(constSeries(20, 5));
    expect(run.length).toBe(DEFAULT_CHART_LINE_ELDER_FORCE_LENGTH);
  });

  it('respects explicit options', () => {
    const run = runLineElderForce(constSeries(20, 5), { length: 7 });
    expect(run.length).toBe(7);
  });

  it('sorts by x', () => {
    const data: ChartLineElderForcePoint[] = [
      { x: 2, close: 10, volume: 100 },
      { x: 0, close: 10, volume: 100 },
      { x: 1, close: 10, volume: 100 },
    ];
    const run = runLineElderForce(data, { length: 2 });
    expect(run.samples.map((s) => s.x)).toEqual([0, 1, 2]);
  });

  it('CONST close classifies post-bar-0 as at (EFI=0)', () => {
    const run = runLineElderForce(constSeries(20, 5));
    // bar 0 is none (no prevClose), bars 1..19 are at (EFI = 0)
    expect(run.noneCount).toBe(1);
    expect(run.atCount).toBe(19);
  });

  it('exposes efiFinal as the last finite reading', () => {
    const run = runLineElderForce(constSeries(20, 5));
    expect(run.efiFinal).toBe(0);
  });

  it('efiFinal is null when there is no data', () => {
    const run = runLineElderForce([]);
    expect(run.efiFinal).toBe(null);
  });

  it('exposes efiAbsMaxSeen (zero for CONST close)', () => {
    const run = runLineElderForce(constSeries(20, 5));
    expect(run.efiAbsMaxSeen).toBe(0);
  });
});

describe('computeLineElderForceLayout', () => {
  it('returns ok=false for empty data', () => {
    const layout = computeLineElderForceLayout({ data: [] });
    expect(layout.ok).toBe(false);
  });

  it('returns ok=true for sufficient data', () => {
    const layout = computeLineElderForceLayout({ data: constSeries(20, 5) });
    expect(layout.ok).toBe(true);
  });

  it('uses the explicit width and height', () => {
    const layout = computeLineElderForceLayout({
      data: constSeries(20, 5),
      width: 600,
      height: 400,
    });
    expect(layout.width).toBe(600);
    expect(layout.height).toBe(400);
  });

  it('panels stack with price above efi', () => {
    const layout = computeLineElderForceLayout({ data: constSeries(20, 5) });
    expect(layout.priceBottom).toBeLessThan(layout.efiTop);
  });

  it('panel gap is respected', () => {
    const layout = computeLineElderForceLayout({
      data: constSeries(20, 5),
      panelGap: 24,
    });
    expect(layout.efiTop - layout.priceBottom).toBeCloseTo(24, 9);
  });

  it('produces a price path and dots', () => {
    const layout = computeLineElderForceLayout({ data: constSeries(20, 5) });
    expect(layout.pricePath.startsWith('M')).toBe(true);
    expect(layout.priceDots.length).toBe(20);
  });

  it('produces an efi path and markers (skipping bar 0)', () => {
    const layout = computeLineElderForceLayout({ data: constSeries(20, 5) });
    expect(layout.markers.length).toBe(19);
  });

  it('zero baseline is inside the efi panel', () => {
    const layout = computeLineElderForceLayout({ data: constSeries(20, 5) });
    expect(layout.zeroBaselineY).toBeGreaterThanOrEqual(layout.efiTop);
    expect(layout.zeroBaselineY).toBeLessThanOrEqual(layout.efiBottom);
  });

  it('handles a single point gracefully', () => {
    const layout = computeLineElderForceLayout({
      data: [{ x: 0, close: 10, volume: 100 }],
    });
    expect(layout.ok).toBe(false);
  });
});

describe('describeLineElderForceChart', () => {
  it('returns No data for empty input', () => {
    expect(describeLineElderForceChart([])).toBe('No data');
  });

  it('mentions Elder Force Index', () => {
    const desc = describeLineElderForceChart(constSeries(20, 5));
    expect(desc).toContain('Elder Force Index');
  });

  it('mentions the formula', () => {
    const desc = describeLineElderForceChart(constSeries(20, 5));
    expect(desc).toContain('(close - prevClose) * volume');
  });

  it('reports the length', () => {
    const desc = describeLineElderForceChart(constSeries(20, 5), { length: 7 });
    expect(desc).toContain('length 7');
  });

  it('reports the final reading', () => {
    const desc = describeLineElderForceChart(constSeries(20, 5));
    expect(desc).toContain('0.0000');
  });
});

describe('<ChartLineElderForce />', () => {
  it('renders an empty placeholder for no data', () => {
    const { container } = render(<ChartLineElderForce data={[]} />);
    const placeholder = container.querySelector(
      '[data-section="chart-line-elder-force-empty"]',
    );
    expect(placeholder?.textContent).toBe('No data');
  });

  it('renders region role with aria-label', () => {
    const { container } = render(
      <ChartLineElderForce data={constSeries(20, 5)} />,
    );
    const region = container.querySelector('[role="region"]');
    expect(region).toBeTruthy();
    expect(region?.getAttribute('aria-label')).toContain('Elder Force Index');
  });

  it('forwards ref', () => {
    const ref = createRef<HTMLDivElement>();
    render(<ChartLineElderForce data={constSeries(20, 5)} ref={ref} />);
    expect(ref.current).not.toBe(null);
  });

  it('exposes data-length', () => {
    const { container } = render(
      <ChartLineElderForce data={constSeries(20, 5)} length={7} />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-elder-force"]',
    );
    expect(root?.getAttribute('data-length')).toBe('7');
  });

  it('exposes data-efi-final', () => {
    const { container } = render(
      <ChartLineElderForce data={constSeries(20, 5)} />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-elder-force"]',
    );
    expect(root?.getAttribute('data-efi-final')).toBe('0');
  });

  it('exposes total-points', () => {
    const { container } = render(
      <ChartLineElderForce data={constSeries(20, 5)} />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-elder-force"]',
    );
    expect(root?.getAttribute('data-total-points')).toBe('20');
  });

  it('renders the screen-reader description', () => {
    const { container } = render(
      <ChartLineElderForce data={constSeries(20, 5)} />,
    );
    const desc = container.querySelector(
      '[data-section="chart-line-elder-force-aria-desc"]',
    );
    expect(desc?.textContent).toContain('Elder Force Index');
  });

  it('renders both legend items', () => {
    const { container } = render(
      <ChartLineElderForce data={constSeries(20, 5)} />,
    );
    expect(container.querySelector('[data-series-id="price"]')).toBeTruthy();
    expect(container.querySelector('[data-series-id="efi"]')).toBeTruthy();
  });

  it('toggles a series via the legend', () => {
    const onToggle = vi.fn();
    const { container } = render(
      <ChartLineElderForce
        data={constSeries(20, 5)}
        onSeriesToggle={onToggle}
      />,
    );
    const button = container.querySelector(
      '[data-series-id="efi"]',
    ) as HTMLButtonElement | null;
    if (button) fireEvent.click(button);
    expect(onToggle).toHaveBeenCalledWith({
      seriesId: 'efi',
      hidden: true,
    });
  });

  it('respects controlled hiddenSeries', () => {
    const { container } = render(
      <ChartLineElderForce
        data={constSeries(20, 5)}
        hiddenSeries={['efi']}
      />,
    );
    const button = container.querySelector('[data-series-id="efi"]');
    expect(button?.getAttribute('data-hidden')).toBe('true');
  });

  it('hides efi line when controlled hidden', () => {
    const { container } = render(
      <ChartLineElderForce
        data={constSeries(20, 5)}
        hiddenSeries={['efi']}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-elder-force-line"]',
      ),
    ).toBe(null);
  });

  it('fires onPointClick on marker activation', () => {
    const onPointClick = vi.fn();
    const { container } = render(
      <ChartLineElderForce
        data={constSeries(20, 5)}
        onPointClick={onPointClick}
      />,
    );
    const markers = container.querySelectorAll(
      '[data-section="chart-line-elder-force-marker"]',
    );
    expect(markers.length).toBeGreaterThan(0);
    fireEvent.click(markers[0]!);
    expect(onPointClick).toHaveBeenCalled();
  });

  it('responds to Enter key on markers', () => {
    const onPointClick = vi.fn();
    const { container } = render(
      <ChartLineElderForce
        data={constSeries(20, 5)}
        onPointClick={onPointClick}
      />,
    );
    const marker = container.querySelector(
      '[data-section="chart-line-elder-force-marker"]',
    ) as SVGElement | null;
    if (marker) fireEvent.keyDown(marker, { key: 'Enter' });
    expect(onPointClick).toHaveBeenCalled();
  });

  it('responds to Space key on markers', () => {
    const onPointClick = vi.fn();
    const { container } = render(
      <ChartLineElderForce
        data={constSeries(20, 5)}
        onPointClick={onPointClick}
      />,
    );
    const marker = container.querySelector(
      '[data-section="chart-line-elder-force-marker"]',
    ) as SVGElement | null;
    if (marker) fireEvent.keyDown(marker, { key: ' ' });
    expect(onPointClick).toHaveBeenCalled();
  });

  it('renders the config badge by default', () => {
    const { container } = render(
      <ChartLineElderForce data={constSeries(20, 5)} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-elder-force-badge"]',
      ),
    ).toBeTruthy();
  });

  it('hides the config badge when disabled', () => {
    const { container } = render(
      <ChartLineElderForce
        data={constSeries(20, 5)}
        showConfigBadge={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-elder-force-badge"]',
      ),
    ).toBe(null);
  });

  it('renders dots when showDots is true', () => {
    const { container } = render(
      <ChartLineElderForce data={constSeries(20, 5)} showDots={true} />,
    );
    expect(
      container.querySelectorAll(
        '[data-section="chart-line-elder-force-dot"]',
      ).length,
    ).toBeGreaterThan(0);
  });

  it('does not render dots by default', () => {
    const { container } = render(
      <ChartLineElderForce data={constSeries(20, 5)} />,
    );
    expect(
      container.querySelectorAll(
        '[data-section="chart-line-elder-force-dot"]',
      ).length,
    ).toBe(0);
  });

  it('hides axis when showAxis is false', () => {
    const { container } = render(
      <ChartLineElderForce
        data={constSeries(20, 5)}
        showAxis={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-elder-force-axes"]',
      ),
    ).toBe(null);
  });

  it('hides grid when showGrid is false', () => {
    const { container } = render(
      <ChartLineElderForce
        data={constSeries(20, 5)}
        showGrid={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-elder-force-grid"]',
      ),
    ).toBe(null);
  });

  it('hides markers when showMarkers is false', () => {
    const { container } = render(
      <ChartLineElderForce
        data={constSeries(20, 5)}
        showMarkers={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-elder-force-markers"]',
      ),
    ).toBe(null);
  });

  it('hides legend when showLegend is false', () => {
    const { container } = render(
      <ChartLineElderForce
        data={constSeries(20, 5)}
        showLegend={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-elder-force-legend"]',
      ),
    ).toBe(null);
  });

  it('hides baseline when showBaseline is false', () => {
    const { container } = render(
      <ChartLineElderForce
        data={constSeries(20, 5)}
        showBaseline={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-elder-force-baseline"]',
      ),
    ).toBe(null);
  });

  it('respects a custom formatEfi', () => {
    const fmt = (v: number) => `[F:${v.toFixed(2)}]`;
    const { container } = render(
      <ChartLineElderForce
        data={constSeries(20, 5)}
        formatEfi={fmt}
      />,
    );
    const marker = container.querySelector(
      '[data-section="chart-line-elder-force-marker"]',
    ) as SVGElement | null;
    if (marker) fireEvent.mouseEnter(marker);
    const text = container.textContent ?? '';
    expect(text).toMatch(/\[F:-?\d/);
  });

  it('applies className and style', () => {
    const { container } = render(
      <ChartLineElderForce
        data={constSeries(20, 5)}
        className="custom-class"
        style={{ background: 'red' }}
      />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-elder-force"]',
    );
    expect(root?.classList.contains('custom-class')).toBe(true);
    expect((root as HTMLElement | null)?.style.background).toBe('red');
  });

  it('exposes data-animate attribute', () => {
    const { container } = render(
      <ChartLineElderForce data={constSeries(20, 5)} animate={true} />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-elder-force"]',
    );
    expect(root?.getAttribute('data-animate')).toBe('true');
  });

  it('animate=false disables fade-in class', () => {
    const { container } = render(
      <ChartLineElderForce data={constSeries(20, 5)} animate={false} />,
    );
    const svg = container.querySelector(
      '[data-section="chart-line-elder-force-svg"]',
    );
    expect(svg?.classList.contains('motion-safe:animate-fade-in')).toBe(false);
  });

  it('renders the efi line by default', () => {
    const { container } = render(
      <ChartLineElderForce data={constSeries(20, 5)} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-elder-force-line"]',
      ),
    ).toBeTruthy();
  });

  it('renders the price path', () => {
    const { container } = render(
      <ChartLineElderForce data={constSeries(20, 5)} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-elder-force-price-path"]',
      ),
    ).toBeTruthy();
  });

  it('respects defaultHiddenSeries on uncontrolled mount', () => {
    const { container } = render(
      <ChartLineElderForce
        data={constSeries(20, 5)}
        defaultHiddenSeries={['efi']}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-elder-force-line"]',
      ),
    ).toBe(null);
  });

  it('hovering a marker shows the tooltip', () => {
    const { container } = render(
      <ChartLineElderForce data={constSeries(20, 5)} />,
    );
    const marker = container.querySelector(
      '[data-section="chart-line-elder-force-marker"]',
    ) as SVGElement | null;
    if (marker) fireEvent.mouseEnter(marker);
    expect(
      container.querySelector(
        '[data-section="chart-line-elder-force-tooltip"]',
      ),
    ).toBeTruthy();
  });

  it('tooltip vanishes on mouseLeave', () => {
    const { container } = render(
      <ChartLineElderForce data={constSeries(20, 5)} />,
    );
    const marker = container.querySelector(
      '[data-section="chart-line-elder-force-marker"]',
    ) as SVGElement | null;
    if (marker) {
      fireEvent.mouseEnter(marker);
      fireEvent.mouseLeave(marker);
    }
    expect(
      container.querySelector(
        '[data-section="chart-line-elder-force-tooltip"]',
      ),
    ).toBe(null);
  });

  it('tooltip respects showTooltip=false', () => {
    const { container } = render(
      <ChartLineElderForce
        data={constSeries(20, 5)}
        showTooltip={false}
      />,
    );
    const marker = container.querySelector(
      '[data-section="chart-line-elder-force-marker"]',
    ) as SVGElement | null;
    if (marker) fireEvent.mouseEnter(marker);
    expect(
      container.querySelector(
        '[data-section="chart-line-elder-force-tooltip"]',
      ),
    ).toBe(null);
  });
});

describe('Elder Force integration', () => {
  it('CONST close yields EFI = 0 across (K, V, length)', () => {
    for (const K of [1, 5, 100, -3, 0]) {
      for (const V of [100, 0, 1, -50, 1000]) {
        for (const L of [3, 5, 7, 13, 20]) {
          const series = constSeries(L + 10, K, V).map((p) => ({
            close: p.close,
            volume: p.volume,
          }));
          const ch = computeLineElderForce(series, { length: L });
          for (let i = 1; i < series.length; i += 1) {
            expect(ch.efi[i]).toBe(0);
          }
        }
      }
    }
  });
});
