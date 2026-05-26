import { describe, expect, it, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { createRef } from 'react';
import {
  ChartLineTrendPower,
  MIN_RESIDUAL_VARIANCE,
  classifyLineTrendPowerZone,
  computeLineTrendPower,
  computeLineTrendPowerLayout,
  describeLineTrendPowerChart,
  fitLineTrendPowerWindow,
  getLineTrendPowerFinitePoints,
  normalizeLineTrendPowerLength,
  normalizeLineTrendPowerStrongThreshold,
  runLineTrendPower,
  DEFAULT_CHART_LINE_TREND_POWER_LENGTH,
  DEFAULT_CHART_LINE_TREND_POWER_STRONG_THRESHOLD,
} from './chart-line-trend-power';
import type { ChartLineTrendPowerPoint } from './chart-line-trend-power';

const constClose = (
  count: number,
  K: number,
): ChartLineTrendPowerPoint[] =>
  Array.from({ length: count }, (_, i) => ({ x: i, close: K }));

const linearClose = (
  count: number,
  a: number,
  b = 0,
): ChartLineTrendPowerPoint[] =>
  Array.from({ length: count }, (_, i) => ({ x: i, close: a * i + b }));

describe('MIN_RESIDUAL_VARIANCE', () => {
  it('equals 2^-50 (dyadic for exact IEEE 754 reciprocal)', () => {
    expect(MIN_RESIDUAL_VARIANCE).toBe(Math.pow(2, -50));
  });

  it('reciprocal equals 2^50 exactly', () => {
    expect(1 / MIN_RESIDUAL_VARIANCE).toBe(Math.pow(2, 50));
  });
});

describe('getLineTrendPowerFinitePoints', () => {
  it('returns an empty array for null', () => {
    expect(getLineTrendPowerFinitePoints(null)).toEqual([]);
  });

  it('returns an empty array for undefined', () => {
    expect(getLineTrendPowerFinitePoints(undefined)).toEqual([]);
  });

  it('drops non-finite x', () => {
    const result = getLineTrendPowerFinitePoints([
      { x: 1, close: 10 },
      { x: Number.NaN, close: 10 },
    ]);
    expect(result.length).toBe(1);
  });

  it('drops non-finite close', () => {
    const result = getLineTrendPowerFinitePoints([
      { x: 0, close: Number.NaN },
      { x: 1, close: 10 },
    ]);
    expect(result.length).toBe(1);
  });

  it('drops null entries', () => {
    const result = getLineTrendPowerFinitePoints([
      null as unknown as ChartLineTrendPowerPoint,
      { x: 1, close: 10 },
    ]);
    expect(result.length).toBe(1);
  });
});

describe('normalizeLineTrendPowerLength', () => {
  it('returns the default when undefined', () => {
    expect(normalizeLineTrendPowerLength(undefined, 14)).toBe(14);
  });

  it('floors fractional lengths', () => {
    expect(normalizeLineTrendPowerLength(7.9, 14)).toBe(7);
  });

  it('rejects length below 2', () => {
    expect(normalizeLineTrendPowerLength(1, 14)).toBe(14);
  });
});

describe('normalizeLineTrendPowerStrongThreshold', () => {
  it('returns the default when undefined', () => {
    expect(normalizeLineTrendPowerStrongThreshold(undefined, 1)).toBe(1);
  });

  it('accepts positive', () => {
    expect(normalizeLineTrendPowerStrongThreshold(0.5, 1)).toBe(0.5);
  });

  it('rejects zero (strong threshold must be positive)', () => {
    expect(normalizeLineTrendPowerStrongThreshold(0, 1)).toBe(1);
  });

  it('rejects negative', () => {
    expect(normalizeLineTrendPowerStrongThreshold(-1, 1)).toBe(1);
  });
});

describe('fitLineTrendPowerWindow', () => {
  it('returns null in the warmup region', () => {
    const closes = [1, 2, 3];
    expect(fitLineTrendPowerWindow(closes, 4, 2)).toBe(null);
  });

  it('CONST window: slope = 0, residualVariance = 0 (bit-exact)', () => {
    for (const K of [0, 1, 5, 100, -3]) {
      const closes = Array(4).fill(K);
      const fit = fitLineTrendPowerWindow(closes, 4, 3);
      expect(fit).not.toBe(null);
      expect(fit!.slope).toBe(0);
      expect(fit!.intercept).toBe(K);
      expect(fit!.residualVariance).toBe(0);
    }
  });

  it('LINEAR window close=k with length=4 fits slope=1 exactly', () => {
    const closes = [0, 1, 2, 3];
    const fit = fitLineTrendPowerWindow(closes, 4, 3);
    expect(fit).not.toBe(null);
    expect(fit!.slope).toBe(1);
    expect(fit!.intercept).toBe(0);
    expect(fit!.residualVariance).toBe(0);
  });

  it('LINEAR window close=2*k with length=4 fits slope=2 exactly', () => {
    const closes = [0, 2, 4, 6];
    const fit = fitLineTrendPowerWindow(closes, 4, 3);
    expect(fit).not.toBe(null);
    expect(fit!.slope).toBe(2);
    expect(fit!.intercept).toBe(0);
    expect(fit!.residualVariance).toBe(0);
  });

  it('LINEAR window close=k with length=8 fits slope=1 exactly', () => {
    const closes = [0, 1, 2, 3, 4, 5, 6, 7];
    const fit = fitLineTrendPowerWindow(closes, 8, 7);
    expect(fit).not.toBe(null);
    expect(fit!.slope).toBe(1);
    expect(fit!.intercept).toBe(0);
    expect(fit!.residualVariance).toBe(0);
  });

  it('returns null when a value in the window is null', () => {
    const closes: Array<number | null> = [0, null, 2, 3];
    expect(fitLineTrendPowerWindow(closes, 4, 3)).toBe(null);
  });

  it('returns null when a value in the window is NaN', () => {
    const closes = [0, Number.NaN, 2, 3];
    expect(fitLineTrendPowerWindow(closes, 4, 3)).toBe(null);
  });
});

describe('computeLineTrendPower', () => {
  it('returns empty for null', () => {
    const ch = computeLineTrendPower(null);
    expect(ch.power).toEqual([]);
  });

  it('returns empty for empty input', () => {
    const ch = computeLineTrendPower([]);
    expect(ch.power).toEqual([]);
  });

  it('nulls the warmup region (i < length - 1)', () => {
    const closes = Array(10).fill(5);
    const ch = computeLineTrendPower(closes, { length: 4 });
    expect(ch.power[0]).toBe(null);
    expect(ch.power[1]).toBe(null);
    expect(ch.power[2]).toBe(null);
    expect(ch.power[3]).not.toBe(null);
  });

  it('CONST close yields power = 0 at every valid bar (bit-exact)', () => {
    for (const K of [0, 1, 5, 100, -3]) {
      const closes = Array(10).fill(K);
      const ch = computeLineTrendPower(closes, { length: 4 });
      for (let i = 3; i < 10; i += 1) {
        expect(ch.power[i]).toBe(0);
      }
    }
  });

  it('LINEAR close=k length=4 yields power = 2^50 bit-exact', () => {
    const closes = [0, 1, 2, 3];
    const ch = computeLineTrendPower(closes, { length: 4 });
    expect(ch.power[3]).toBe(Math.pow(2, 50));
  });

  it('LINEAR close=2k length=4 yields power = 4 * 2^50 = 2^52 bit-exact', () => {
    const closes = [0, 2, 4, 6];
    const ch = computeLineTrendPower(closes, { length: 4 });
    expect(ch.power[3]).toBe(Math.pow(2, 52));
  });

  it('LINEAR close=k length=8 yields power = 2^50 bit-exact', () => {
    const closes = [0, 1, 2, 3, 4, 5, 6, 7];
    const ch = computeLineTrendPower(closes, { length: 8 });
    expect(ch.power[7]).toBe(Math.pow(2, 50));
  });

  it('output length matches input length', () => {
    const closes = Array(10).fill(5);
    const ch = computeLineTrendPower(closes, { length: 4 });
    expect(ch.power.length).toBe(10);
    expect(ch.slope.length).toBe(10);
    expect(ch.residualVariance.length).toBe(10);
  });

  it('does not mutate input', () => {
    const closes = [0, 1, 2, 3, 4];
    const snap = closes.slice();
    computeLineTrendPower(closes, { length: 4 });
    expect(closes).toEqual(snap);
  });

  it('rejects non-finite length (uses default)', () => {
    const closes = Array(20).fill(5);
    const ch = computeLineTrendPower(closes, { length: Number.NaN });
    // CONST -> 0 at every valid bar; warmup region is length - 1.
    const L = DEFAULT_CHART_LINE_TREND_POWER_LENGTH;
    expect(ch.power[L - 1]).toBe(0);
  });
});

describe('classifyLineTrendPowerZone', () => {
  it('classifies strong-trend when value >= threshold', () => {
    expect(classifyLineTrendPowerZone(2, 1)).toBe('strong-trend');
  });

  it('classifies weak-trend when 0 < value < threshold', () => {
    expect(classifyLineTrendPowerZone(0.5, 1)).toBe('weak-trend');
  });

  it('classifies flat when value == 0', () => {
    expect(classifyLineTrendPowerZone(0, 1)).toBe('flat');
  });

  it('returns none for null', () => {
    expect(classifyLineTrendPowerZone(null, 1)).toBe('none');
  });

  it('returns none for NaN', () => {
    expect(classifyLineTrendPowerZone(Number.NaN, 1)).toBe('none');
  });
});

describe('runLineTrendPower', () => {
  it('marks ok=false for fewer than length points', () => {
    const run = runLineTrendPower(constClose(3, 10), { length: 4 });
    expect(run.ok).toBe(false);
  });

  it('marks ok=true with length points', () => {
    const run = runLineTrendPower(constClose(4, 10), { length: 4 });
    expect(run.ok).toBe(true);
  });

  it('uses defaults when none is provided', () => {
    const run = runLineTrendPower(constClose(30, 10));
    expect(run.length).toBe(DEFAULT_CHART_LINE_TREND_POWER_LENGTH);
    expect(run.strongThreshold).toBe(
      DEFAULT_CHART_LINE_TREND_POWER_STRONG_THRESHOLD,
    );
  });

  it('respects explicit options', () => {
    const run = runLineTrendPower(constClose(30, 10), {
      length: 7,
      strongThreshold: 2,
    });
    expect(run.length).toBe(7);
    expect(run.strongThreshold).toBe(2);
  });

  it('sorts by x', () => {
    const data: ChartLineTrendPowerPoint[] = [
      { x: 2, close: 10 },
      { x: 0, close: 10 },
      { x: 1, close: 10 },
    ];
    const run = runLineTrendPower(data, { length: 2 });
    expect(run.samples.map((s) => s.x)).toEqual([0, 1, 2]);
  });

  it('CONST close classifies post-warmup as flat', () => {
    const run = runLineTrendPower(constClose(10, 10), { length: 4 });
    // bars 0..2 are warmup (none); bars 3..9 are flat (slope=0, power=0).
    expect(run.flatCount).toBe(7);
    expect(run.noneCount).toBe(3);
  });

  it('LINEAR close yields strong-trend bars', () => {
    const run = runLineTrendPower(linearClose(8, 1), {
      length: 4,
      strongThreshold: 1,
    });
    // bars 3..7 are length-4 LINEAR windows with power = 2^50 > 1.
    expect(run.strongCount).toBe(5);
  });

  it('respects a high strongThreshold to push windows out of strong', () => {
    // 2^50 < 2^60, so threshold 2^60 should classify them as weak.
    const run = runLineTrendPower(linearClose(8, 1), {
      length: 4,
      strongThreshold: Math.pow(2, 60),
    });
    expect(run.strongCount).toBe(0);
    expect(run.weakCount).toBe(5);
  });
});

describe('computeLineTrendPowerLayout', () => {
  it('returns ok=false for empty data', () => {
    const layout = computeLineTrendPowerLayout({ data: [] });
    expect(layout.ok).toBe(false);
  });

  it('returns ok=true for sufficient data', () => {
    const layout = computeLineTrendPowerLayout({
      data: constClose(30, 10),
    });
    expect(layout.ok).toBe(true);
  });

  it('uses the explicit width and height', () => {
    const layout = computeLineTrendPowerLayout({
      data: constClose(30, 10),
      width: 600,
      height: 400,
    });
    expect(layout.width).toBe(600);
    expect(layout.height).toBe(400);
  });

  it('panels stack with price above power', () => {
    const layout = computeLineTrendPowerLayout({
      data: constClose(30, 10),
    });
    expect(layout.priceBottom).toBeLessThan(layout.powerTop);
  });

  it('panel gap is respected', () => {
    const layout = computeLineTrendPowerLayout({
      data: constClose(30, 10),
      panelGap: 24,
    });
    expect(layout.powerTop - layout.priceBottom).toBeCloseTo(24, 9);
  });

  it('produces a price path and dots', () => {
    const layout = computeLineTrendPowerLayout({
      data: constClose(30, 10),
    });
    expect(layout.pricePath.startsWith('M')).toBe(true);
    expect(layout.priceDots.length).toBe(30);
  });

  it('CONST yields zero markers (no strong-trend bars)', () => {
    const layout = computeLineTrendPowerLayout({
      data: constClose(30, 10),
      length: 4,
    });
    expect(layout.markers.length).toBe(0);
  });

  it('LINEAR yields strong-trend markers', () => {
    const layout = computeLineTrendPowerLayout({
      data: linearClose(8, 1),
      length: 4,
      strongThreshold: 1,
    });
    // 5 strong-trend bars (3..7).
    expect(layout.markers.length).toBe(5);
  });

  it('powerMin is 0', () => {
    const layout = computeLineTrendPowerLayout({
      data: constClose(30, 10),
    });
    expect(layout.powerMin).toBe(0);
  });

  it('powerMax includes the threshold even for tiny powers', () => {
    const layout = computeLineTrendPowerLayout({
      data: constClose(30, 10),
      strongThreshold: 5,
    });
    expect(layout.powerMax).toBeGreaterThanOrEqual(5);
  });

  it('threshold line y is between powerTop and powerBottom', () => {
    const layout = computeLineTrendPowerLayout({
      data: constClose(30, 10),
    });
    expect(layout.thresholdY).toBeGreaterThanOrEqual(layout.powerTop);
    expect(layout.thresholdY).toBeLessThanOrEqual(layout.powerBottom);
  });

  it('handles a single point gracefully', () => {
    const layout = computeLineTrendPowerLayout({
      data: [{ x: 0, close: 10 }],
    });
    expect(layout.ok).toBe(false);
  });
});

describe('describeLineTrendPowerChart', () => {
  it('returns No data for empty input', () => {
    expect(describeLineTrendPowerChart([])).toBe('No data');
  });

  it('mentions Trend Power', () => {
    const desc = describeLineTrendPowerChart(constClose(30, 10));
    expect(desc).toContain('Trend Power');
  });

  it('mentions the formula', () => {
    const desc = describeLineTrendPowerChart(constClose(30, 10));
    expect(desc).toContain('slope^2');
    expect(desc).toContain('residualVariance');
  });

  it('reports the length and threshold', () => {
    const desc = describeLineTrendPowerChart(constClose(30, 10), {
      length: 7,
      strongThreshold: 2,
    });
    expect(desc).toContain('length 7');
    expect(desc).toContain('strongThreshold 2');
  });
});

describe('<ChartLineTrendPower />', () => {
  it('renders an empty placeholder for no data', () => {
    const { container } = render(<ChartLineTrendPower data={[]} />);
    const placeholder = container.querySelector(
      '[data-section="chart-line-trend-power-empty"]',
    );
    expect(placeholder?.textContent).toBe('No data');
  });

  it('renders region role with aria-label', () => {
    const { container } = render(
      <ChartLineTrendPower data={constClose(30, 10)} length={5} />,
    );
    const region = container.querySelector('[role="region"]');
    expect(region).toBeTruthy();
    expect(region?.getAttribute('aria-label')).toContain('Trend Power');
  });

  it('forwards ref', () => {
    const ref = createRef<HTMLDivElement>();
    render(
      <ChartLineTrendPower
        data={constClose(30, 10)}
        length={5}
        ref={ref}
      />,
    );
    expect(ref.current).not.toBe(null);
  });

  it('exposes data-length and data-strong-threshold', () => {
    const { container } = render(
      <ChartLineTrendPower
        data={constClose(30, 10)}
        length={7}
        strongThreshold={2}
      />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-trend-power"]',
    );
    expect(root?.getAttribute('data-length')).toBe('7');
    expect(root?.getAttribute('data-strong-threshold')).toBe('2');
  });

  it('exposes total-points', () => {
    const { container } = render(
      <ChartLineTrendPower data={constClose(30, 10)} length={5} />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-trend-power"]',
    );
    expect(root?.getAttribute('data-total-points')).toBe('30');
  });

  it('renders the screen-reader description', () => {
    const { container } = render(
      <ChartLineTrendPower data={constClose(30, 10)} length={5} />,
    );
    const desc = container.querySelector(
      '[data-section="chart-line-trend-power-aria-desc"]',
    );
    expect(desc?.textContent).toContain('Trend Power');
  });

  it('renders both legend items', () => {
    const { container } = render(
      <ChartLineTrendPower data={constClose(30, 10)} length={5} />,
    );
    expect(container.querySelector('[data-series-id="price"]')).toBeTruthy();
    expect(container.querySelector('[data-series-id="power"]')).toBeTruthy();
  });

  it('toggles a series via the legend', () => {
    const onToggle = vi.fn();
    const { container } = render(
      <ChartLineTrendPower
        data={constClose(30, 10)}
        length={5}
        onSeriesToggle={onToggle}
      />,
    );
    const button = container.querySelector(
      '[data-series-id="power"]',
    ) as HTMLButtonElement | null;
    if (button) fireEvent.click(button);
    expect(onToggle).toHaveBeenCalledWith({
      seriesId: 'power',
      hidden: true,
    });
  });

  it('respects controlled hiddenSeries', () => {
    const { container } = render(
      <ChartLineTrendPower
        data={constClose(30, 10)}
        length={5}
        hiddenSeries={['power']}
      />,
    );
    const button = container.querySelector('[data-series-id="power"]');
    expect(button?.getAttribute('data-hidden')).toBe('true');
  });

  it('hides power line when controlled hidden', () => {
    const { container } = render(
      <ChartLineTrendPower
        data={constClose(30, 10)}
        length={5}
        hiddenSeries={['power']}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-trend-power-line"]',
      ),
    ).toBe(null);
  });

  it('fires onPointClick on marker activation', () => {
    const onPointClick = vi.fn();
    const { container } = render(
      <ChartLineTrendPower
        data={linearClose(10, 1)}
        length={4}
        onPointClick={onPointClick}
      />,
    );
    const markers = container.querySelectorAll(
      '[data-section="chart-line-trend-power-marker"]',
    );
    expect(markers.length).toBeGreaterThan(0);
    fireEvent.click(markers[0]!);
    expect(onPointClick).toHaveBeenCalled();
  });

  it('responds to Enter key on markers', () => {
    const onPointClick = vi.fn();
    const { container } = render(
      <ChartLineTrendPower
        data={linearClose(10, 1)}
        length={4}
        onPointClick={onPointClick}
      />,
    );
    const marker = container.querySelector(
      '[data-section="chart-line-trend-power-marker"]',
    ) as SVGElement | null;
    if (marker) fireEvent.keyDown(marker, { key: 'Enter' });
    expect(onPointClick).toHaveBeenCalled();
  });

  it('responds to Space key on markers', () => {
    const onPointClick = vi.fn();
    const { container } = render(
      <ChartLineTrendPower
        data={linearClose(10, 1)}
        length={4}
        onPointClick={onPointClick}
      />,
    );
    const marker = container.querySelector(
      '[data-section="chart-line-trend-power-marker"]',
    ) as SVGElement | null;
    if (marker) fireEvent.keyDown(marker, { key: ' ' });
    expect(onPointClick).toHaveBeenCalled();
  });

  it('renders the config badge by default', () => {
    const { container } = render(
      <ChartLineTrendPower data={constClose(30, 10)} length={5} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-trend-power-badge"]',
      ),
    ).toBeTruthy();
  });

  it('hides the config badge when disabled', () => {
    const { container } = render(
      <ChartLineTrendPower
        data={constClose(30, 10)}
        length={5}
        showConfigBadge={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-trend-power-badge"]',
      ),
    ).toBe(null);
  });

  it('renders dots when showDots is true', () => {
    const { container } = render(
      <ChartLineTrendPower
        data={constClose(30, 10)}
        length={5}
        showDots={true}
      />,
    );
    expect(
      container.querySelectorAll(
        '[data-section="chart-line-trend-power-dot"]',
      ).length,
    ).toBeGreaterThan(0);
  });

  it('does not render dots by default', () => {
    const { container } = render(
      <ChartLineTrendPower data={constClose(30, 10)} length={5} />,
    );
    expect(
      container.querySelectorAll(
        '[data-section="chart-line-trend-power-dot"]',
      ).length,
    ).toBe(0);
  });

  it('hides axis when showAxis is false', () => {
    const { container } = render(
      <ChartLineTrendPower
        data={constClose(30, 10)}
        length={5}
        showAxis={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-trend-power-axes"]',
      ),
    ).toBe(null);
  });

  it('hides grid when showGrid is false', () => {
    const { container } = render(
      <ChartLineTrendPower
        data={constClose(30, 10)}
        length={5}
        showGrid={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-trend-power-grid"]',
      ),
    ).toBe(null);
  });

  it('renders the threshold line by default', () => {
    const { container } = render(
      <ChartLineTrendPower data={constClose(30, 10)} length={5} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-trend-power-threshold-line"]',
      ),
    ).toBeTruthy();
  });

  it('hides threshold line when showThreshold is false', () => {
    const { container } = render(
      <ChartLineTrendPower
        data={constClose(30, 10)}
        length={5}
        showThreshold={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-trend-power-threshold-line"]',
      ),
    ).toBe(null);
  });

  it('hides markers when showMarkers is false', () => {
    const { container } = render(
      <ChartLineTrendPower
        data={linearClose(10, 1)}
        length={4}
        showMarkers={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-trend-power-markers"]',
      ),
    ).toBe(null);
  });

  it('hides legend when showLegend is false', () => {
    const { container } = render(
      <ChartLineTrendPower
        data={constClose(30, 10)}
        length={5}
        showLegend={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-trend-power-legend"]',
      ),
    ).toBe(null);
  });

  it('respects a custom formatPower', () => {
    const fmt = (v: number) => `[P:${v.toFixed(0)}]`;
    const { container } = render(
      <ChartLineTrendPower
        data={linearClose(10, 1)}
        length={4}
        formatPower={fmt}
      />,
    );
    const marker = container.querySelector(
      '[data-section="chart-line-trend-power-marker"]',
    ) as SVGElement | null;
    if (marker) fireEvent.mouseEnter(marker);
    const text = container.textContent ?? '';
    expect(text).toMatch(/\[P:\d/);
  });

  it('applies className and style', () => {
    const { container } = render(
      <ChartLineTrendPower
        data={constClose(30, 10)}
        length={5}
        className="custom-class"
        style={{ background: 'red' }}
      />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-trend-power"]',
    );
    expect(root?.classList.contains('custom-class')).toBe(true);
    expect((root as HTMLElement | null)?.style.background).toBe('red');
  });

  it('exposes data-animate attribute', () => {
    const { container } = render(
      <ChartLineTrendPower
        data={constClose(30, 10)}
        length={5}
        animate={true}
      />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-trend-power"]',
    );
    expect(root?.getAttribute('data-animate')).toBe('true');
  });

  it('animate=false disables fade-in class', () => {
    const { container } = render(
      <ChartLineTrendPower
        data={constClose(30, 10)}
        length={5}
        animate={false}
      />,
    );
    const svg = container.querySelector(
      '[data-section="chart-line-trend-power-svg"]',
    );
    expect(svg?.classList.contains('motion-safe:animate-fade-in')).toBe(false);
  });

  it('renders the power line by default', () => {
    const { container } = render(
      <ChartLineTrendPower data={constClose(30, 10)} length={5} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-trend-power-line"]',
      ),
    ).toBeTruthy();
  });

  it('renders the price path', () => {
    const { container } = render(
      <ChartLineTrendPower data={constClose(30, 10)} length={5} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-trend-power-price-path"]',
      ),
    ).toBeTruthy();
  });

  it('respects defaultHiddenSeries on uncontrolled mount', () => {
    const { container } = render(
      <ChartLineTrendPower
        data={constClose(30, 10)}
        length={5}
        defaultHiddenSeries={['power']}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-trend-power-line"]',
      ),
    ).toBe(null);
  });

  it('hovering a marker shows the tooltip', () => {
    const { container } = render(
      <ChartLineTrendPower data={linearClose(10, 1)} length={4} />,
    );
    const marker = container.querySelector(
      '[data-section="chart-line-trend-power-marker"]',
    ) as SVGElement | null;
    if (marker) fireEvent.mouseEnter(marker);
    expect(
      container.querySelector(
        '[data-section="chart-line-trend-power-tooltip"]',
      ),
    ).toBeTruthy();
  });

  it('tooltip vanishes on mouseLeave', () => {
    const { container } = render(
      <ChartLineTrendPower data={linearClose(10, 1)} length={4} />,
    );
    const marker = container.querySelector(
      '[data-section="chart-line-trend-power-marker"]',
    ) as SVGElement | null;
    if (marker) {
      fireEvent.mouseEnter(marker);
      fireEvent.mouseLeave(marker);
    }
    expect(
      container.querySelector(
        '[data-section="chart-line-trend-power-tooltip"]',
      ),
    ).toBe(null);
  });

  it('tooltip respects showTooltip=false', () => {
    const { container } = render(
      <ChartLineTrendPower
        data={linearClose(10, 1)}
        length={4}
        showTooltip={false}
      />,
    );
    const marker = container.querySelector(
      '[data-section="chart-line-trend-power-marker"]',
    ) as SVGElement | null;
    if (marker) fireEvent.mouseEnter(marker);
    expect(
      container.querySelector(
        '[data-section="chart-line-trend-power-tooltip"]',
      ),
    ).toBe(null);
  });
});

describe('Trend Power integration', () => {
  it('CONST close yields power = 0 across (K, length) bit-exact', () => {
    for (const K of [0, 1, 5, 100, -3]) {
      for (const L of [3, 4, 7, 10]) {
        const closes = Array(L + 5).fill(K);
        const ch = computeLineTrendPower(closes, { length: L });
        for (let i = L - 1; i < closes.length; i += 1) {
          expect(ch.power[i]).toBe(0);
        }
      }
    }
  });

  it('LINEAR close=k yields power = 2^50 at every valid bar', () => {
    const closes = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
    const ch = computeLineTrendPower(closes, { length: 4 });
    for (let i = 3; i < 10; i += 1) {
      expect(ch.power[i]).toBe(Math.pow(2, 50));
    }
  });
});
