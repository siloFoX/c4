import { describe, expect, it, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { createRef } from 'react';
import {
  ChartLineTrendStrength,
  classifyLineTrendStrengthZone,
  computeLineTrendStrength,
  computeLineTrendStrengthLayout,
  computeLineTrendStrengthRegression,
  describeLineTrendStrengthChart,
  getLineTrendStrengthFinitePoints,
  normalizeLineTrendStrengthLength,
  runLineTrendStrength,
  DEFAULT_CHART_LINE_TREND_STRENGTH_LENGTH,
} from './chart-line-trend-strength';
import type { ChartLineTrendStrengthPoint } from './chart-line-trend-strength';

const constClose = (
  count: number,
  K: number,
): ChartLineTrendStrengthPoint[] =>
  Array.from({ length: count }, (_, i) => ({ x: i, close: K }));

const perfectLine = (
  count: number,
  a: number,
  b = 0,
): ChartLineTrendStrengthPoint[] =>
  Array.from({ length: count }, (_, i) => ({ x: i, close: a * i + b }));

describe('getLineTrendStrengthFinitePoints', () => {
  it('returns an empty array for null', () => {
    expect(getLineTrendStrengthFinitePoints(null)).toEqual([]);
  });

  it('returns an empty array for undefined', () => {
    expect(getLineTrendStrengthFinitePoints(undefined)).toEqual([]);
  });

  it('drops non-finite x', () => {
    const result = getLineTrendStrengthFinitePoints([
      { x: 1, close: 10 },
      { x: Number.NaN, close: 10 },
    ]);
    expect(result.length).toBe(1);
  });

  it('drops non-finite close', () => {
    const result = getLineTrendStrengthFinitePoints([
      { x: 0, close: Number.NaN },
      { x: 1, close: 10 },
    ]);
    expect(result.length).toBe(1);
  });

  it('drops null entries', () => {
    const result = getLineTrendStrengthFinitePoints([
      null as unknown as ChartLineTrendStrengthPoint,
      { x: 1, close: 10 },
    ]);
    expect(result.length).toBe(1);
  });
});

describe('normalizeLineTrendStrengthLength', () => {
  it('returns the default when undefined', () => {
    expect(normalizeLineTrendStrengthLength(undefined, 14)).toBe(14);
  });

  it('floors fractional lengths', () => {
    expect(normalizeLineTrendStrengthLength(7.9, 14)).toBe(7);
  });

  it('rejects length below 3', () => {
    expect(normalizeLineTrendStrengthLength(2, 14)).toBe(14);
  });
});

describe('computeLineTrendStrengthRegression', () => {
  it('returns nulls before the window is filled', () => {
    const reg = computeLineTrendStrengthRegression([1, 2, 3], 1, 5);
    expect(reg.slope).toBe(null);
    expect(reg.stdErr).toBe(null);
  });

  it('CONST closes yield slope = 0 and stdErr = 0', () => {
    const reg = computeLineTrendStrengthRegression([5, 5, 5, 5, 5], 4, 5);
    expect(reg.slope).toBe(0);
    expect(reg.stdErr).toBe(0);
  });

  it('PERFECT LINE yields slope = a and stdErr = 0', () => {
    // close[i] = 2*i: 0, 2, 4, 6, 8 in window of length 5
    const reg = computeLineTrendStrengthRegression(
      [0, 2, 4, 6, 8],
      4,
      5,
    );
    expect(reg.slope).toBe(2);
    expect(reg.stdErr).toBe(0);
  });

  it('returns nulls when a value in the window is non-finite', () => {
    const reg = computeLineTrendStrengthRegression(
      [0, 2, Number.NaN, 6, 8],
      4,
      5,
    );
    expect(reg.slope).toBe(null);
    expect(reg.stdErr).toBe(null);
  });
});

describe('computeLineTrendStrength', () => {
  it('returns empty for null', () => {
    const ch = computeLineTrendStrength(null);
    expect(ch.slope).toEqual([]);
    expect(ch.stdErr).toEqual([]);
    expect(ch.strength).toEqual([]);
  });

  it('returns empty for empty input', () => {
    const ch = computeLineTrendStrength([]);
    expect(ch.strength).toEqual([]);
  });

  it('nulls warmup bars (i < length - 1)', () => {
    const closes = perfectLine(30, 1).map((p) => p.close);
    const ch = computeLineTrendStrength(closes, { length: 5 });
    for (let i = 0; i < 4; i += 1) {
      expect(ch.strength[i]).toBe(null);
    }
    expect(typeof ch.strength[4]).toBe('number');
  });

  it('PERFECT LINE (a != 0) yields strength = 1 bit-exact past warmup', () => {
    for (const a of [1, 2, 3, -1, -5]) {
      const closes = perfectLine(30, a).map((p) => p.close);
      const ch = computeLineTrendStrength(closes, { length: 5 });
      for (let i = 4; i < 30; i += 1) {
        expect(ch.strength[i]).toBe(1);
      }
    }
  });

  it('CONST close yields strength = null (singular)', () => {
    for (const K of [0, 1, 5, 100, -3]) {
      const closes = Array(30).fill(K);
      const ch = computeLineTrendStrength(closes, { length: 5 });
      for (let i = 0; i < 30; i += 1) {
        expect(ch.strength[i]).toBe(null);
      }
    }
  });

  it('PERFECT LINE has slope = a bit-exact', () => {
    const closes = perfectLine(30, 3).map((p) => p.close);
    const ch = computeLineTrendStrength(closes, { length: 5 });
    for (let i = 4; i < 30; i += 1) {
      expect(ch.slope[i]).toBe(3);
    }
  });

  it('PERFECT LINE has stdErr = 0 bit-exact', () => {
    const closes = perfectLine(30, 2).map((p) => p.close);
    const ch = computeLineTrendStrength(closes, { length: 5 });
    for (let i = 4; i < 30; i += 1) {
      expect(ch.stdErr[i]).toBe(0);
    }
  });

  it('output length matches input length', () => {
    const closes = perfectLine(30, 1).map((p) => p.close);
    const ch = computeLineTrendStrength(closes, { length: 5 });
    expect(ch.strength.length).toBe(30);
  });

  it('does not mutate input', () => {
    const closes = perfectLine(30, 1).map((p) => p.close);
    const snap = closes.slice();
    computeLineTrendStrength(closes, { length: 5 });
    expect(closes).toEqual(snap);
  });

  it('rejects non-finite length (uses default)', () => {
    const closes = perfectLine(30, 1).map((p) => p.close);
    const ch = computeLineTrendStrength(closes, { length: Number.NaN });
    expect(ch.strength[13]).toBe(1);
  });

  it('noise on top of a line yields strength in (0, 1)', () => {
    // small perturbation around y = i
    const closes: number[] = [];
    for (let i = 0; i < 30; i += 1) {
      closes.push(i + (i % 2 === 0 ? 0.1 : -0.1));
    }
    const ch = computeLineTrendStrength(closes, { length: 7 });
    for (let i = 6; i < 30; i += 1) {
      const s = ch.strength[i];
      expect(s != null && s > 0 && s < 1).toBe(true);
    }
  });
});

describe('classifyLineTrendStrengthZone', () => {
  it('classifies strong at >= 0.75', () => {
    expect(classifyLineTrendStrengthZone(0.75)).toBe('strong');
    expect(classifyLineTrendStrengthZone(1)).toBe('strong');
  });

  it('classifies firm between 0.5 and 0.75', () => {
    expect(classifyLineTrendStrengthZone(0.6)).toBe('firm');
    expect(classifyLineTrendStrengthZone(0.5)).toBe('firm');
  });

  it('classifies soft between 0.25 and 0.5', () => {
    expect(classifyLineTrendStrengthZone(0.4)).toBe('soft');
    expect(classifyLineTrendStrengthZone(0.25)).toBe('soft');
  });

  it('classifies choppy below 0.25', () => {
    expect(classifyLineTrendStrengthZone(0.1)).toBe('choppy');
    expect(classifyLineTrendStrengthZone(0)).toBe('choppy');
  });

  it('returns none for null', () => {
    expect(classifyLineTrendStrengthZone(null)).toBe('none');
  });

  it('returns none for NaN', () => {
    expect(classifyLineTrendStrengthZone(Number.NaN)).toBe('none');
  });
});

describe('runLineTrendStrength', () => {
  it('marks ok=false for fewer than length points', () => {
    const run = runLineTrendStrength(constClose(4, 5), { length: 5 });
    expect(run.ok).toBe(false);
  });

  it('marks ok=true with enough points', () => {
    const run = runLineTrendStrength(constClose(5, 5), { length: 5 });
    expect(run.ok).toBe(true);
  });

  it('uses defaults when none is provided', () => {
    const run = runLineTrendStrength(perfectLine(30, 1));
    expect(run.length).toBe(DEFAULT_CHART_LINE_TREND_STRENGTH_LENGTH);
  });

  it('respects explicit options', () => {
    const run = runLineTrendStrength(perfectLine(30, 1), { length: 7 });
    expect(run.length).toBe(7);
  });

  it('sorts by x', () => {
    const data: ChartLineTrendStrengthPoint[] = [
      { x: 2, close: 10 },
      { x: 0, close: 10 },
      { x: 1, close: 10 },
    ];
    const run = runLineTrendStrength(data, { length: 3 });
    expect(run.samples.map((s) => s.x)).toEqual([0, 1, 2]);
  });

  it('PERFECT LINE classifies post-warmup as strong', () => {
    const run = runLineTrendStrength(perfectLine(30, 1), { length: 5 });
    expect(run.strongCount).toBe(30 - 4);
  });

  it('CONST close classifies all as none (singular)', () => {
    const run = runLineTrendStrength(constClose(30, 5), { length: 5 });
    expect(run.noneCount).toBe(30);
  });

  it('exposes strengthFinal as the last finite reading', () => {
    const run = runLineTrendStrength(perfectLine(30, 1), { length: 5 });
    expect(run.strengthFinal).toBe(1);
  });

  it('strengthFinal is null when there is no data', () => {
    const run = runLineTrendStrength([]);
    expect(run.strengthFinal).toBe(null);
  });
});

describe('computeLineTrendStrengthLayout', () => {
  it('returns ok=false for empty data', () => {
    const layout = computeLineTrendStrengthLayout({ data: [] });
    expect(layout.ok).toBe(false);
  });

  it('returns ok=true for sufficient data', () => {
    const layout = computeLineTrendStrengthLayout({
      data: perfectLine(30, 1),
      length: 5,
    });
    expect(layout.ok).toBe(true);
  });

  it('uses the explicit width and height', () => {
    const layout = computeLineTrendStrengthLayout({
      data: perfectLine(30, 1),
      length: 5,
      width: 600,
      height: 400,
    });
    expect(layout.width).toBe(600);
    expect(layout.height).toBe(400);
  });

  it('panels stack with price above strength', () => {
    const layout = computeLineTrendStrengthLayout({
      data: perfectLine(30, 1),
      length: 5,
    });
    expect(layout.priceBottom).toBeLessThan(layout.strengthTop);
  });

  it('panel gap is respected', () => {
    const layout = computeLineTrendStrengthLayout({
      data: perfectLine(30, 1),
      length: 5,
      panelGap: 24,
    });
    expect(layout.strengthTop - layout.priceBottom).toBeCloseTo(24, 9);
  });

  it('produces a price path and dots', () => {
    const layout = computeLineTrendStrengthLayout({
      data: perfectLine(30, 1),
      length: 5,
    });
    expect(layout.pricePath.startsWith('M')).toBe(true);
    expect(layout.priceDots.length).toBe(30);
  });

  it('produces a strength path and markers (skipping warmup)', () => {
    const layout = computeLineTrendStrengthLayout({
      data: perfectLine(30, 1),
      length: 5,
    });
    expect(layout.markers.length).toBe(30 - 4);
  });

  it('mid baseline is inside the strength panel', () => {
    const layout = computeLineTrendStrengthLayout({
      data: perfectLine(30, 1),
      length: 5,
    });
    expect(layout.midBaselineY).toBeGreaterThanOrEqual(layout.strengthTop);
    expect(layout.midBaselineY).toBeLessThanOrEqual(layout.strengthBottom);
  });

  it('strengthMin / strengthMax are 0 and 1', () => {
    const layout = computeLineTrendStrengthLayout({
      data: perfectLine(30, 1),
      length: 5,
    });
    expect(layout.strengthMin).toBe(0);
    expect(layout.strengthMax).toBe(1);
  });

  it('handles a single point gracefully', () => {
    const layout = computeLineTrendStrengthLayout({
      data: [{ x: 0, close: 10 }],
    });
    expect(layout.ok).toBe(false);
  });
});

describe('describeLineTrendStrengthChart', () => {
  it('returns No data for empty input', () => {
    expect(describeLineTrendStrengthChart([])).toBe('No data');
  });

  it('mentions Trend Strength', () => {
    const desc = describeLineTrendStrengthChart(perfectLine(30, 1));
    expect(desc).toContain('Trend Strength');
  });

  it('mentions the formula', () => {
    const desc = describeLineTrendStrengthChart(perfectLine(30, 1));
    expect(desc).toContain('|slope|');
    expect(desc).toContain('standardError');
  });

  it('reports the length', () => {
    const desc = describeLineTrendStrengthChart(perfectLine(30, 1), {
      length: 7,
    });
    expect(desc).toContain('length 7');
  });

  it('reports the final reading', () => {
    const desc = describeLineTrendStrengthChart(perfectLine(30, 1), {
      length: 5,
    });
    expect(desc).toContain('1.0000');
  });
});

describe('<ChartLineTrendStrength />', () => {
  it('renders an empty placeholder for no data', () => {
    const { container } = render(<ChartLineTrendStrength data={[]} />);
    const placeholder = container.querySelector(
      '[data-section="chart-line-trend-strength-empty"]',
    );
    expect(placeholder?.textContent).toBe('No data');
  });

  it('renders region role with aria-label', () => {
    const { container } = render(
      <ChartLineTrendStrength data={perfectLine(30, 1)} length={5} />,
    );
    const region = container.querySelector('[role="region"]');
    expect(region).toBeTruthy();
    expect(region?.getAttribute('aria-label')).toContain('Trend Strength');
  });

  it('forwards ref', () => {
    const ref = createRef<HTMLDivElement>();
    render(
      <ChartLineTrendStrength
        data={perfectLine(30, 1)}
        length={5}
        ref={ref}
      />,
    );
    expect(ref.current).not.toBe(null);
  });

  it('exposes data-length', () => {
    const { container } = render(
      <ChartLineTrendStrength data={perfectLine(30, 1)} length={7} />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-trend-strength"]',
    );
    expect(root?.getAttribute('data-length')).toBe('7');
  });

  it('exposes data-strength-final', () => {
    const { container } = render(
      <ChartLineTrendStrength data={perfectLine(30, 1)} length={5} />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-trend-strength"]',
    );
    expect(root?.getAttribute('data-strength-final')).toBe('1');
  });

  it('exposes total-points', () => {
    const { container } = render(
      <ChartLineTrendStrength data={perfectLine(30, 1)} length={5} />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-trend-strength"]',
    );
    expect(root?.getAttribute('data-total-points')).toBe('30');
  });

  it('renders the screen-reader description', () => {
    const { container } = render(
      <ChartLineTrendStrength data={perfectLine(30, 1)} length={5} />,
    );
    const desc = container.querySelector(
      '[data-section="chart-line-trend-strength-aria-desc"]',
    );
    expect(desc?.textContent).toContain('Trend Strength');
  });

  it('renders both legend items', () => {
    const { container } = render(
      <ChartLineTrendStrength data={perfectLine(30, 1)} length={5} />,
    );
    expect(container.querySelector('[data-series-id="price"]')).toBeTruthy();
    expect(container.querySelector('[data-series-id="strength"]')).toBeTruthy();
  });

  it('toggles a series via the legend', () => {
    const onToggle = vi.fn();
    const { container } = render(
      <ChartLineTrendStrength
        data={perfectLine(30, 1)}
        length={5}
        onSeriesToggle={onToggle}
      />,
    );
    const button = container.querySelector(
      '[data-series-id="strength"]',
    ) as HTMLButtonElement | null;
    if (button) fireEvent.click(button);
    expect(onToggle).toHaveBeenCalledWith({
      seriesId: 'strength',
      hidden: true,
    });
  });

  it('respects controlled hiddenSeries', () => {
    const { container } = render(
      <ChartLineTrendStrength
        data={perfectLine(30, 1)}
        length={5}
        hiddenSeries={['strength']}
      />,
    );
    const button = container.querySelector('[data-series-id="strength"]');
    expect(button?.getAttribute('data-hidden')).toBe('true');
  });

  it('hides strength line when controlled hidden', () => {
    const { container } = render(
      <ChartLineTrendStrength
        data={perfectLine(30, 1)}
        length={5}
        hiddenSeries={['strength']}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-trend-strength-line"]',
      ),
    ).toBe(null);
  });

  it('fires onPointClick on marker activation', () => {
    const onPointClick = vi.fn();
    const { container } = render(
      <ChartLineTrendStrength
        data={perfectLine(30, 1)}
        length={5}
        onPointClick={onPointClick}
      />,
    );
    const markers = container.querySelectorAll(
      '[data-section="chart-line-trend-strength-marker"]',
    );
    expect(markers.length).toBeGreaterThan(0);
    fireEvent.click(markers[0]!);
    expect(onPointClick).toHaveBeenCalled();
  });

  it('responds to Enter key on markers', () => {
    const onPointClick = vi.fn();
    const { container } = render(
      <ChartLineTrendStrength
        data={perfectLine(30, 1)}
        length={5}
        onPointClick={onPointClick}
      />,
    );
    const marker = container.querySelector(
      '[data-section="chart-line-trend-strength-marker"]',
    ) as SVGElement | null;
    if (marker) fireEvent.keyDown(marker, { key: 'Enter' });
    expect(onPointClick).toHaveBeenCalled();
  });

  it('responds to Space key on markers', () => {
    const onPointClick = vi.fn();
    const { container } = render(
      <ChartLineTrendStrength
        data={perfectLine(30, 1)}
        length={5}
        onPointClick={onPointClick}
      />,
    );
    const marker = container.querySelector(
      '[data-section="chart-line-trend-strength-marker"]',
    ) as SVGElement | null;
    if (marker) fireEvent.keyDown(marker, { key: ' ' });
    expect(onPointClick).toHaveBeenCalled();
  });

  it('renders the config badge by default', () => {
    const { container } = render(
      <ChartLineTrendStrength data={perfectLine(30, 1)} length={5} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-trend-strength-badge"]',
      ),
    ).toBeTruthy();
  });

  it('hides the config badge when disabled', () => {
    const { container } = render(
      <ChartLineTrendStrength
        data={perfectLine(30, 1)}
        length={5}
        showConfigBadge={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-trend-strength-badge"]',
      ),
    ).toBe(null);
  });

  it('renders dots when showDots is true', () => {
    const { container } = render(
      <ChartLineTrendStrength
        data={perfectLine(30, 1)}
        length={5}
        showDots={true}
      />,
    );
    expect(
      container.querySelectorAll(
        '[data-section="chart-line-trend-strength-dot"]',
      ).length,
    ).toBeGreaterThan(0);
  });

  it('does not render dots by default', () => {
    const { container } = render(
      <ChartLineTrendStrength data={perfectLine(30, 1)} length={5} />,
    );
    expect(
      container.querySelectorAll(
        '[data-section="chart-line-trend-strength-dot"]',
      ).length,
    ).toBe(0);
  });

  it('hides axis when showAxis is false', () => {
    const { container } = render(
      <ChartLineTrendStrength
        data={perfectLine(30, 1)}
        length={5}
        showAxis={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-trend-strength-axes"]',
      ),
    ).toBe(null);
  });

  it('hides grid when showGrid is false', () => {
    const { container } = render(
      <ChartLineTrendStrength
        data={perfectLine(30, 1)}
        length={5}
        showGrid={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-trend-strength-grid"]',
      ),
    ).toBe(null);
  });

  it('hides markers when showMarkers is false', () => {
    const { container } = render(
      <ChartLineTrendStrength
        data={perfectLine(30, 1)}
        length={5}
        showMarkers={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-trend-strength-markers"]',
      ),
    ).toBe(null);
  });

  it('hides legend when showLegend is false', () => {
    const { container } = render(
      <ChartLineTrendStrength
        data={perfectLine(30, 1)}
        length={5}
        showLegend={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-trend-strength-legend"]',
      ),
    ).toBe(null);
  });

  it('hides baseline when showBaseline is false', () => {
    const { container } = render(
      <ChartLineTrendStrength
        data={perfectLine(30, 1)}
        length={5}
        showBaseline={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-trend-strength-baseline"]',
      ),
    ).toBe(null);
  });

  it('respects a custom formatStrength', () => {
    const fmt = (v: number) => `[TS:${v.toFixed(2)}]`;
    const { container } = render(
      <ChartLineTrendStrength
        data={perfectLine(30, 1)}
        length={5}
        formatStrength={fmt}
      />,
    );
    const marker = container.querySelector(
      '[data-section="chart-line-trend-strength-marker"]',
    ) as SVGElement | null;
    if (marker) fireEvent.mouseEnter(marker);
    const text = container.textContent ?? '';
    expect(text).toMatch(/\[TS:-?\d/);
  });

  it('applies className and style', () => {
    const { container } = render(
      <ChartLineTrendStrength
        data={perfectLine(30, 1)}
        length={5}
        className="custom-class"
        style={{ background: 'red' }}
      />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-trend-strength"]',
    );
    expect(root?.classList.contains('custom-class')).toBe(true);
    expect((root as HTMLElement | null)?.style.background).toBe('red');
  });

  it('exposes data-animate attribute', () => {
    const { container } = render(
      <ChartLineTrendStrength
        data={perfectLine(30, 1)}
        length={5}
        animate={true}
      />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-trend-strength"]',
    );
    expect(root?.getAttribute('data-animate')).toBe('true');
  });

  it('animate=false disables fade-in class', () => {
    const { container } = render(
      <ChartLineTrendStrength
        data={perfectLine(30, 1)}
        length={5}
        animate={false}
      />,
    );
    const svg = container.querySelector(
      '[data-section="chart-line-trend-strength-svg"]',
    );
    expect(svg?.classList.contains('motion-safe:animate-fade-in')).toBe(false);
  });

  it('renders the strength line by default', () => {
    const { container } = render(
      <ChartLineTrendStrength data={perfectLine(30, 1)} length={5} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-trend-strength-line"]',
      ),
    ).toBeTruthy();
  });

  it('renders the price path', () => {
    const { container } = render(
      <ChartLineTrendStrength data={perfectLine(30, 1)} length={5} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-trend-strength-price-path"]',
      ),
    ).toBeTruthy();
  });

  it('respects defaultHiddenSeries on uncontrolled mount', () => {
    const { container } = render(
      <ChartLineTrendStrength
        data={perfectLine(30, 1)}
        length={5}
        defaultHiddenSeries={['strength']}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-trend-strength-line"]',
      ),
    ).toBe(null);
  });

  it('hovering a marker shows the tooltip', () => {
    const { container } = render(
      <ChartLineTrendStrength data={perfectLine(30, 1)} length={5} />,
    );
    const marker = container.querySelector(
      '[data-section="chart-line-trend-strength-marker"]',
    ) as SVGElement | null;
    if (marker) fireEvent.mouseEnter(marker);
    expect(
      container.querySelector(
        '[data-section="chart-line-trend-strength-tooltip"]',
      ),
    ).toBeTruthy();
  });

  it('tooltip vanishes on mouseLeave', () => {
    const { container } = render(
      <ChartLineTrendStrength data={perfectLine(30, 1)} length={5} />,
    );
    const marker = container.querySelector(
      '[data-section="chart-line-trend-strength-marker"]',
    ) as SVGElement | null;
    if (marker) {
      fireEvent.mouseEnter(marker);
      fireEvent.mouseLeave(marker);
    }
    expect(
      container.querySelector(
        '[data-section="chart-line-trend-strength-tooltip"]',
      ),
    ).toBe(null);
  });

  it('tooltip respects showTooltip=false', () => {
    const { container } = render(
      <ChartLineTrendStrength
        data={perfectLine(30, 1)}
        length={5}
        showTooltip={false}
      />,
    );
    const marker = container.querySelector(
      '[data-section="chart-line-trend-strength-marker"]',
    ) as SVGElement | null;
    if (marker) fireEvent.mouseEnter(marker);
    expect(
      container.querySelector(
        '[data-section="chart-line-trend-strength-tooltip"]',
      ),
    ).toBe(null);
  });
});

describe('Trend Strength integration', () => {
  it('PERFECT LINE yields strength = 1 bit-exact across (a, length)', () => {
    for (const a of [1, 2, 3, -1, -5]) {
      for (const L of [3, 5, 7, 14]) {
        const closes = perfectLine(L + 10, a).map((p) => p.close);
        const ch = computeLineTrendStrength(closes, { length: L });
        for (let i = L - 1; i < closes.length; i += 1) {
          expect(ch.strength[i]).toBe(1);
        }
      }
    }
  });

  it('CONST close yields all-null strength (singular)', () => {
    for (const K of [0, 1, 5, 100, -3]) {
      const closes = Array(30).fill(K);
      const ch = computeLineTrendStrength(closes, { length: 5 });
      for (let i = 0; i < 30; i += 1) {
        expect(ch.strength[i]).toBe(null);
      }
    }
  });
});
