import { describe, expect, it, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { createRef } from 'react';
import {
  ChartLineBbWidth,
  applyLineBbWidthPopulationStdDev,
  applyLineBbWidthSma,
  classifyLineBbWidthZone,
  computeLineBbWidth,
  computeLineBbWidthLayout,
  describeLineBbWidthChart,
  getLineBbWidthFinitePoints,
  normalizeLineBbWidthLength,
  normalizeLineBbWidthNumStdDev,
  runLineBbWidth,
  DEFAULT_CHART_LINE_BB_WIDTH_LENGTH,
  DEFAULT_CHART_LINE_BB_WIDTH_NUM_STDDEV,
} from './chart-line-bb-width';
import type { ChartLineBbWidthPoint } from './chart-line-bb-width';

const constClose = (
  count: number,
  K: number,
): ChartLineBbWidthPoint[] =>
  Array.from({ length: count }, (_, i) => ({ x: i, close: K }));

const ramp = (count: number, slope = 1): ChartLineBbWidthPoint[] =>
  Array.from({ length: count }, (_, i) => ({ x: i, close: i * slope }));

describe('getLineBbWidthFinitePoints', () => {
  it('returns an empty array for null', () => {
    expect(getLineBbWidthFinitePoints(null)).toEqual([]);
  });

  it('returns an empty array for undefined', () => {
    expect(getLineBbWidthFinitePoints(undefined)).toEqual([]);
  });

  it('drops non-finite x', () => {
    const result = getLineBbWidthFinitePoints([
      { x: 1, close: 10 },
      { x: Number.NaN, close: 10 },
    ]);
    expect(result.length).toBe(1);
  });

  it('drops non-finite close', () => {
    const result = getLineBbWidthFinitePoints([
      { x: 0, close: Number.NaN },
      { x: 1, close: 10 },
    ]);
    expect(result.length).toBe(1);
  });

  it('drops null entries', () => {
    const result = getLineBbWidthFinitePoints([
      null as unknown as ChartLineBbWidthPoint,
      { x: 1, close: 10 },
    ]);
    expect(result.length).toBe(1);
  });
});

describe('normalizeLineBbWidthLength', () => {
  it('returns the default when undefined', () => {
    expect(normalizeLineBbWidthLength(undefined, 20)).toBe(20);
  });

  it('floors fractional lengths', () => {
    expect(normalizeLineBbWidthLength(7.9, 20)).toBe(7);
  });

  it('rejects length below 2', () => {
    expect(normalizeLineBbWidthLength(1, 20)).toBe(20);
  });
});

describe('normalizeLineBbWidthNumStdDev', () => {
  it('returns the default when undefined', () => {
    expect(normalizeLineBbWidthNumStdDev(undefined, 2)).toBe(2);
  });

  it('rejects zero', () => {
    expect(normalizeLineBbWidthNumStdDev(0, 2)).toBe(2);
  });

  it('rejects negative', () => {
    expect(normalizeLineBbWidthNumStdDev(-1, 2)).toBe(2);
  });

  it('accepts fractional values', () => {
    expect(normalizeLineBbWidthNumStdDev(1.5, 2)).toBe(1.5);
  });
});

describe('applyLineBbWidthSma', () => {
  it('emits null for warmup bars', () => {
    const out = applyLineBbWidthSma([1, 2, 3, 4, 5], 3);
    expect(out[0]).toBe(null);
    expect(out[1]).toBe(null);
    expect(out[2]).toBe(2);
  });

  it('SMA of constant K is K bit-exact', () => {
    for (const K of [0, 1, 5, 100, -3]) {
      const out = applyLineBbWidthSma(Array(10).fill(K), 4);
      for (let i = 3; i < 10; i += 1) {
        expect(out[i]).toBe(K);
      }
    }
  });
});

describe('applyLineBbWidthPopulationStdDev', () => {
  it('emits null for warmup bars', () => {
    const values = [1, 2, 3, 4, 5];
    const means = [null, null, 2, 3, 4];
    const out = applyLineBbWidthPopulationStdDev(values, means, 3);
    expect(out[0]).toBe(null);
    expect(out[1]).toBe(null);
    expect(typeof out[2]).toBe('number');
  });

  it('stdDev of constant K is 0 bit-exact', () => {
    for (const K of [1, 5, 100, -3]) {
      const values = Array(10).fill(K);
      const means = applyLineBbWidthSma(values, 4);
      const out = applyLineBbWidthPopulationStdDev(values, means, 4);
      for (let i = 3; i < 10; i += 1) {
        expect(out[i]).toBe(0);
      }
    }
  });
});

describe('computeLineBbWidth', () => {
  it('returns empty for null', () => {
    const ch = computeLineBbWidth(null);
    expect(ch.middle).toEqual([]);
    expect(ch.upper).toEqual([]);
    expect(ch.lower).toEqual([]);
    expect(ch.width).toEqual([]);
  });

  it('returns empty for empty input', () => {
    const ch = computeLineBbWidth([]);
    expect(ch.width).toEqual([]);
  });

  it('nulls warmup bars', () => {
    const closes = Array(30).fill(10);
    const ch = computeLineBbWidth(closes, { length: 20, numStdDev: 2 });
    for (let i = 0; i < 19; i += 1) {
      expect(ch.width[i]).toBe(null);
    }
    expect(typeof ch.width[19]).toBe('number');
  });

  it('CONST close (K != 0) yields width = 0 bit-exact past warmup', () => {
    for (const K of [1, 5, 100, -3, 7, -50]) {
      const closes = Array(30).fill(K);
      const ch = computeLineBbWidth(closes, { length: 20, numStdDev: 2 });
      for (let i = 19; i < 30; i += 1) {
        expect(ch.width[i]).toBe(0);
      }
    }
  });

  it('CONST close = 0 yields width = null (divide by zero guard)', () => {
    const closes = Array(30).fill(0);
    const ch = computeLineBbWidth(closes, { length: 20, numStdDev: 2 });
    for (let i = 0; i < 30; i += 1) {
      expect(ch.width[i]).toBe(null);
    }
  });

  it('CONST close yields upper = lower = middle = K past warmup', () => {
    const K = 5;
    const closes = Array(30).fill(K);
    const ch = computeLineBbWidth(closes, { length: 20, numStdDev: 2 });
    for (let i = 19; i < 30; i += 1) {
      expect(ch.middle[i]).toBe(K);
      expect(ch.upper[i]).toBe(K);
      expect(ch.lower[i]).toBe(K);
    }
  });

  it('width is non-negative for any valid input', () => {
    const closes: number[] = [];
    for (let i = 0; i < 30; i += 1) {
      closes.push(100 + Math.sin(i / 3) * 5);
    }
    const ch = computeLineBbWidth(closes, { length: 10, numStdDev: 2 });
    for (let i = 9; i < 30; i += 1) {
      const w = ch.width[i];
      expect(w != null && w >= 0).toBe(true);
    }
  });

  it('output length matches input length', () => {
    const closes = Array(30).fill(10);
    const ch = computeLineBbWidth(closes, { length: 20, numStdDev: 2 });
    expect(ch.width.length).toBe(30);
  });

  it('does not mutate input', () => {
    const closes = Array(30).fill(10);
    const snap = closes.slice();
    computeLineBbWidth(closes, { length: 20, numStdDev: 2 });
    expect(closes).toEqual(snap);
  });

  it('rejects non-finite length (uses default)', () => {
    const closes = Array(30).fill(5);
    const ch = computeLineBbWidth(closes, {
      length: Number.NaN,
      numStdDev: 2,
    });
    expect(ch.width[19]).toBe(0);
  });

  it('different numStdDev still produces width = 0 for CONST data', () => {
    for (const sd of [1, 1.5, 2, 3]) {
      const closes = Array(30).fill(10);
      const ch = computeLineBbWidth(closes, {
        length: 20,
        numStdDev: sd,
      });
      for (let i = 19; i < 30; i += 1) {
        expect(ch.width[i]).toBe(0);
      }
    }
  });

  it('ramped close produces width > 0 past warmup', () => {
    const closes = ramp(30, 1).map((p) => p.close);
    const ch = computeLineBbWidth(closes, { length: 5, numStdDev: 2 });
    for (let i = 4; i < 30; i += 1) {
      const w = ch.width[i];
      expect(w != null && w > 0).toBe(true);
    }
  });
});

describe('classifyLineBbWidthZone', () => {
  it('classifies wide at >= 75% of max', () => {
    expect(classifyLineBbWidthZone(80, 100)).toBe('wide');
  });

  it('classifies normal between 25% and 75%', () => {
    expect(classifyLineBbWidthZone(50, 100)).toBe('normal');
  });

  it('classifies narrow below 25%', () => {
    expect(classifyLineBbWidthZone(10, 100)).toBe('narrow');
  });

  it('classifies flat when width == 0', () => {
    expect(classifyLineBbWidthZone(0, 100)).toBe('flat');
  });

  it('returns none for null', () => {
    expect(classifyLineBbWidthZone(null, 100)).toBe('none');
  });

  it('returns none for NaN', () => {
    expect(classifyLineBbWidthZone(Number.NaN, 100)).toBe('none');
  });

  it('falls back to normal when widthMaxSeen is zero', () => {
    expect(classifyLineBbWidthZone(5, 0)).toBe('normal');
  });
});

describe('runLineBbWidth', () => {
  it('marks ok=false for fewer than length points', () => {
    const run = runLineBbWidth(constClose(10, 5), { length: 20 });
    expect(run.ok).toBe(false);
  });

  it('marks ok=true with enough points', () => {
    const run = runLineBbWidth(constClose(25, 5), { length: 20 });
    expect(run.ok).toBe(true);
  });

  it('uses defaults when none is provided', () => {
    const run = runLineBbWidth(constClose(30, 5));
    expect(run.length).toBe(DEFAULT_CHART_LINE_BB_WIDTH_LENGTH);
    expect(run.numStdDev).toBe(DEFAULT_CHART_LINE_BB_WIDTH_NUM_STDDEV);
  });

  it('respects explicit options', () => {
    const run = runLineBbWidth(constClose(30, 5), {
      length: 14,
      numStdDev: 1.5,
    });
    expect(run.length).toBe(14);
    expect(run.numStdDev).toBe(1.5);
  });

  it('sorts by x', () => {
    const data: ChartLineBbWidthPoint[] = [
      { x: 2, close: 10 },
      { x: 0, close: 10 },
      { x: 1, close: 10 },
    ];
    const run = runLineBbWidth(data, { length: 2 });
    expect(run.samples.map((s) => s.x)).toEqual([0, 1, 2]);
  });

  it('CONST close (K != 0) classifies post-warmup as flat', () => {
    const run = runLineBbWidth(constClose(30, 5));
    expect(run.flatCount).toBe(30 - 19);
  });

  it('CONST close = 0 classifies all as none (singular)', () => {
    const run = runLineBbWidth(constClose(30, 0));
    expect(run.noneCount).toBe(30);
  });

  it('exposes widthFinal as the last finite reading', () => {
    const run = runLineBbWidth(constClose(30, 5));
    expect(run.widthFinal).toBe(0);
  });

  it('widthFinal is null when there is no data', () => {
    const run = runLineBbWidth([]);
    expect(run.widthFinal).toBe(null);
  });
});

describe('computeLineBbWidthLayout', () => {
  it('returns ok=false for empty data', () => {
    const layout = computeLineBbWidthLayout({ data: [] });
    expect(layout.ok).toBe(false);
  });

  it('returns ok=true for sufficient data', () => {
    const layout = computeLineBbWidthLayout({
      data: constClose(30, 5),
    });
    expect(layout.ok).toBe(true);
  });

  it('uses the explicit width and height', () => {
    const layout = computeLineBbWidthLayout({
      data: constClose(30, 5),
      width: 600,
      height: 400,
    });
    expect(layout.width).toBe(600);
    expect(layout.height).toBe(400);
  });

  it('panels stack with price above width', () => {
    const layout = computeLineBbWidthLayout({ data: constClose(30, 5) });
    expect(layout.priceBottom).toBeLessThan(layout.widthTop);
  });

  it('panel gap is respected', () => {
    const layout = computeLineBbWidthLayout({
      data: constClose(30, 5),
      panelGap: 24,
    });
    expect(layout.widthTop - layout.priceBottom).toBeCloseTo(24, 9);
  });

  it('produces a price path and dots', () => {
    const layout = computeLineBbWidthLayout({ data: constClose(30, 5) });
    expect(layout.pricePath.startsWith('M')).toBe(true);
    expect(layout.priceDots.length).toBe(30);
  });

  it('produces a width path and markers (skipping warmup)', () => {
    const layout = computeLineBbWidthLayout({ data: constClose(30, 5) });
    expect(layout.markers.length).toBe(30 - 19);
  });

  it('zero baseline is inside the width panel', () => {
    const layout = computeLineBbWidthLayout({ data: constClose(30, 5) });
    expect(layout.zeroBaselineY).toBeGreaterThanOrEqual(layout.widthTop);
    expect(layout.zeroBaselineY).toBeLessThanOrEqual(layout.widthBottom);
  });

  it('handles a single point gracefully', () => {
    const layout = computeLineBbWidthLayout({
      data: [{ x: 0, close: 10 }],
    });
    expect(layout.ok).toBe(false);
  });

  it('widthMin is zero', () => {
    const layout = computeLineBbWidthLayout({ data: constClose(30, 5) });
    expect(layout.widthMin).toBe(0);
  });
});

describe('describeLineBbWidthChart', () => {
  it('returns No data for empty input', () => {
    expect(describeLineBbWidthChart([])).toBe('No data');
  });

  it('mentions Bollinger Band Width', () => {
    const desc = describeLineBbWidthChart(constClose(30, 5));
    expect(desc).toContain('Bollinger Band Width');
  });

  it('mentions the formula', () => {
    const desc = describeLineBbWidthChart(constClose(30, 5));
    expect(desc).toContain('upperBand');
    expect(desc).toContain('lowerBand');
    expect(desc).toContain('middleBand');
  });

  it('reports the length and numStdDev', () => {
    const desc = describeLineBbWidthChart(constClose(30, 5), {
      length: 14,
      numStdDev: 1.5,
    });
    expect(desc).toContain('length 14');
    expect(desc).toContain('numStdDev 1.5');
  });

  it('reports the final reading', () => {
    const desc = describeLineBbWidthChart(constClose(30, 5));
    expect(desc).toContain('0.0000');
  });
});

describe('<ChartLineBbWidth />', () => {
  it('renders an empty placeholder for no data', () => {
    const { container } = render(<ChartLineBbWidth data={[]} />);
    const placeholder = container.querySelector(
      '[data-section="chart-line-bb-width-empty"]',
    );
    expect(placeholder?.textContent).toBe('No data');
  });

  it('renders region role with aria-label', () => {
    const { container } = render(
      <ChartLineBbWidth data={constClose(30, 5)} />,
    );
    const region = container.querySelector('[role="region"]');
    expect(region).toBeTruthy();
    expect(region?.getAttribute('aria-label')).toContain('Bollinger Band Width');
  });

  it('forwards ref', () => {
    const ref = createRef<HTMLDivElement>();
    render(<ChartLineBbWidth data={constClose(30, 5)} ref={ref} />);
    expect(ref.current).not.toBe(null);
  });

  it('exposes data-length and data-num-stddev', () => {
    const { container } = render(
      <ChartLineBbWidth
        data={constClose(30, 5)}
        length={14}
        numStdDev={1.5}
      />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-bb-width"]',
    );
    expect(root?.getAttribute('data-length')).toBe('14');
    expect(root?.getAttribute('data-num-stddev')).toBe('1.5');
  });

  it('exposes data-width-final', () => {
    const { container } = render(
      <ChartLineBbWidth data={constClose(30, 5)} />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-bb-width"]',
    );
    expect(root?.getAttribute('data-width-final')).toBe('0');
  });

  it('exposes total-points', () => {
    const { container } = render(
      <ChartLineBbWidth data={constClose(30, 5)} />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-bb-width"]',
    );
    expect(root?.getAttribute('data-total-points')).toBe('30');
  });

  it('renders the screen-reader description', () => {
    const { container } = render(
      <ChartLineBbWidth data={constClose(30, 5)} />,
    );
    const desc = container.querySelector(
      '[data-section="chart-line-bb-width-aria-desc"]',
    );
    expect(desc?.textContent).toContain('Bollinger Band Width');
  });

  it('renders both legend items', () => {
    const { container } = render(
      <ChartLineBbWidth data={constClose(30, 5)} />,
    );
    expect(container.querySelector('[data-series-id="price"]')).toBeTruthy();
    expect(container.querySelector('[data-series-id="width"]')).toBeTruthy();
  });

  it('toggles a series via the legend', () => {
    const onToggle = vi.fn();
    const { container } = render(
      <ChartLineBbWidth
        data={constClose(30, 5)}
        onSeriesToggle={onToggle}
      />,
    );
    const button = container.querySelector(
      '[data-series-id="width"]',
    ) as HTMLButtonElement | null;
    if (button) fireEvent.click(button);
    expect(onToggle).toHaveBeenCalledWith({
      seriesId: 'width',
      hidden: true,
    });
  });

  it('respects controlled hiddenSeries', () => {
    const { container } = render(
      <ChartLineBbWidth
        data={constClose(30, 5)}
        hiddenSeries={['width']}
      />,
    );
    const button = container.querySelector('[data-series-id="width"]');
    expect(button?.getAttribute('data-hidden')).toBe('true');
  });

  it('hides width line when controlled hidden', () => {
    const { container } = render(
      <ChartLineBbWidth
        data={constClose(30, 5)}
        hiddenSeries={['width']}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-bb-width-line"]',
      ),
    ).toBe(null);
  });

  it('fires onPointClick on marker activation', () => {
    const onPointClick = vi.fn();
    const { container } = render(
      <ChartLineBbWidth
        data={constClose(30, 5)}
        onPointClick={onPointClick}
      />,
    );
    const markers = container.querySelectorAll(
      '[data-section="chart-line-bb-width-marker"]',
    );
    expect(markers.length).toBeGreaterThan(0);
    fireEvent.click(markers[0]!);
    expect(onPointClick).toHaveBeenCalled();
  });

  it('responds to Enter key on markers', () => {
    const onPointClick = vi.fn();
    const { container } = render(
      <ChartLineBbWidth
        data={constClose(30, 5)}
        onPointClick={onPointClick}
      />,
    );
    const marker = container.querySelector(
      '[data-section="chart-line-bb-width-marker"]',
    ) as SVGElement | null;
    if (marker) fireEvent.keyDown(marker, { key: 'Enter' });
    expect(onPointClick).toHaveBeenCalled();
  });

  it('responds to Space key on markers', () => {
    const onPointClick = vi.fn();
    const { container } = render(
      <ChartLineBbWidth
        data={constClose(30, 5)}
        onPointClick={onPointClick}
      />,
    );
    const marker = container.querySelector(
      '[data-section="chart-line-bb-width-marker"]',
    ) as SVGElement | null;
    if (marker) fireEvent.keyDown(marker, { key: ' ' });
    expect(onPointClick).toHaveBeenCalled();
  });

  it('renders the config badge by default', () => {
    const { container } = render(
      <ChartLineBbWidth data={constClose(30, 5)} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-bb-width-badge"]',
      ),
    ).toBeTruthy();
  });

  it('hides the config badge when disabled', () => {
    const { container } = render(
      <ChartLineBbWidth
        data={constClose(30, 5)}
        showConfigBadge={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-bb-width-badge"]',
      ),
    ).toBe(null);
  });

  it('renders dots when showDots is true', () => {
    const { container } = render(
      <ChartLineBbWidth data={constClose(30, 5)} showDots={true} />,
    );
    expect(
      container.querySelectorAll(
        '[data-section="chart-line-bb-width-dot"]',
      ).length,
    ).toBeGreaterThan(0);
  });

  it('does not render dots by default', () => {
    const { container } = render(
      <ChartLineBbWidth data={constClose(30, 5)} />,
    );
    expect(
      container.querySelectorAll(
        '[data-section="chart-line-bb-width-dot"]',
      ).length,
    ).toBe(0);
  });

  it('hides axis when showAxis is false', () => {
    const { container } = render(
      <ChartLineBbWidth
        data={constClose(30, 5)}
        showAxis={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-bb-width-axes"]',
      ),
    ).toBe(null);
  });

  it('hides grid when showGrid is false', () => {
    const { container } = render(
      <ChartLineBbWidth
        data={constClose(30, 5)}
        showGrid={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-bb-width-grid"]',
      ),
    ).toBe(null);
  });

  it('hides markers when showMarkers is false', () => {
    const { container } = render(
      <ChartLineBbWidth
        data={constClose(30, 5)}
        showMarkers={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-bb-width-markers"]',
      ),
    ).toBe(null);
  });

  it('hides legend when showLegend is false', () => {
    const { container } = render(
      <ChartLineBbWidth
        data={constClose(30, 5)}
        showLegend={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-bb-width-legend"]',
      ),
    ).toBe(null);
  });

  it('hides baseline when showBaseline is false', () => {
    const { container } = render(
      <ChartLineBbWidth
        data={constClose(30, 5)}
        showBaseline={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-bb-width-baseline"]',
      ),
    ).toBe(null);
  });

  it('respects a custom formatWidth', () => {
    const fmt = (v: number) => `[W:${v.toFixed(2)}]`;
    const { container } = render(
      <ChartLineBbWidth
        data={constClose(30, 5)}
        formatWidth={fmt}
      />,
    );
    const marker = container.querySelector(
      '[data-section="chart-line-bb-width-marker"]',
    ) as SVGElement | null;
    if (marker) fireEvent.mouseEnter(marker);
    const text = container.textContent ?? '';
    expect(text).toMatch(/\[W:-?\d/);
  });

  it('applies className and style', () => {
    const { container } = render(
      <ChartLineBbWidth
        data={constClose(30, 5)}
        className="custom-class"
        style={{ background: 'red' }}
      />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-bb-width"]',
    );
    expect(root?.classList.contains('custom-class')).toBe(true);
    expect((root as HTMLElement | null)?.style.background).toBe('red');
  });

  it('exposes data-animate attribute', () => {
    const { container } = render(
      <ChartLineBbWidth data={constClose(30, 5)} animate={true} />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-bb-width"]',
    );
    expect(root?.getAttribute('data-animate')).toBe('true');
  });

  it('animate=false disables fade-in class', () => {
    const { container } = render(
      <ChartLineBbWidth data={constClose(30, 5)} animate={false} />,
    );
    const svg = container.querySelector(
      '[data-section="chart-line-bb-width-svg"]',
    );
    expect(svg?.classList.contains('motion-safe:animate-fade-in')).toBe(false);
  });

  it('renders the width line by default', () => {
    const { container } = render(
      <ChartLineBbWidth data={constClose(30, 5)} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-bb-width-line"]',
      ),
    ).toBeTruthy();
  });

  it('renders the price path', () => {
    const { container } = render(
      <ChartLineBbWidth data={constClose(30, 5)} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-bb-width-price-path"]',
      ),
    ).toBeTruthy();
  });

  it('respects defaultHiddenSeries on uncontrolled mount', () => {
    const { container } = render(
      <ChartLineBbWidth
        data={constClose(30, 5)}
        defaultHiddenSeries={['width']}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-bb-width-line"]',
      ),
    ).toBe(null);
  });

  it('hovering a marker shows the tooltip', () => {
    const { container } = render(
      <ChartLineBbWidth data={constClose(30, 5)} />,
    );
    const marker = container.querySelector(
      '[data-section="chart-line-bb-width-marker"]',
    ) as SVGElement | null;
    if (marker) fireEvent.mouseEnter(marker);
    expect(
      container.querySelector(
        '[data-section="chart-line-bb-width-tooltip"]',
      ),
    ).toBeTruthy();
  });

  it('tooltip vanishes on mouseLeave', () => {
    const { container } = render(
      <ChartLineBbWidth data={constClose(30, 5)} />,
    );
    const marker = container.querySelector(
      '[data-section="chart-line-bb-width-marker"]',
    ) as SVGElement | null;
    if (marker) {
      fireEvent.mouseEnter(marker);
      fireEvent.mouseLeave(marker);
    }
    expect(
      container.querySelector(
        '[data-section="chart-line-bb-width-tooltip"]',
      ),
    ).toBe(null);
  });

  it('tooltip respects showTooltip=false', () => {
    const { container } = render(
      <ChartLineBbWidth
        data={constClose(30, 5)}
        showTooltip={false}
      />,
    );
    const marker = container.querySelector(
      '[data-section="chart-line-bb-width-marker"]',
    ) as SVGElement | null;
    if (marker) fireEvent.mouseEnter(marker);
    expect(
      container.querySelector(
        '[data-section="chart-line-bb-width-tooltip"]',
      ),
    ).toBe(null);
  });
});

describe('BB Width integration', () => {
  it('CONST close (K != 0) yields width = 0 across (K, length, numStdDev)', () => {
    for (const K of [1, 5, 100, -3, 7, -50]) {
      for (const L of [3, 5, 7, 14, 20]) {
        for (const sd of [1, 2, 3]) {
          const closes = Array(L + 10).fill(K);
          const ch = computeLineBbWidth(closes, {
            length: L,
            numStdDev: sd,
          });
          for (let i = L - 1; i < closes.length; i += 1) {
            expect(ch.width[i]).toBe(0);
          }
        }
      }
    }
  });

  it('CONST close = 0 yields all-null width (singular)', () => {
    const closes = Array(30).fill(0);
    const ch = computeLineBbWidth(closes, { length: 20, numStdDev: 2 });
    for (let i = 0; i < 30; i += 1) {
      expect(ch.width[i]).toBe(null);
    }
  });
});
