import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { createRef } from 'react';
import {
  ChartLineEhlersSupersmoother,
  classifyLineEhlersSupersmootherZone,
  computeLineEhlersSupersmoother,
  computeLineEhlersSupersmootherCoefficients,
  computeLineEhlersSupersmootherLayout,
  describeLineEhlersSupersmootherChart,
  getLineEhlersSupersmootherFinitePoints,
  normalizeLineEhlersSupersmootherPeriod,
  runLineEhlersSupersmoother,
  DEFAULT_CHART_LINE_EHLERS_SUPERSMOOTHER_PERIOD,
} from './chart-line-ehlers-supersmoother';
import type {
  ChartLineEhlersSupersmootherPoint,
} from './chart-line-ehlers-supersmoother';

const flat = (length: number, value: number): ChartLineEhlersSupersmootherPoint[] =>
  Array.from({ length }, (_, i) => ({ x: i, close: value }));

const rising = (length: number, start = 0, step = 1): ChartLineEhlersSupersmootherPoint[] =>
  Array.from({ length }, (_, i) => ({ x: i, close: start + i * step }));

const pivot = (length: number): ChartLineEhlersSupersmootherPoint[] =>
  Array.from({ length }, (_, i) => ({
    x: i,
    close: i < length / 2 ? 100 - i : 80 + (i - Math.floor(length / 2)) * 2,
  }));

describe('getLineEhlersSupersmootherFinitePoints', () => {
  it('returns an empty array for null', () => {
    expect(getLineEhlersSupersmootherFinitePoints(null)).toEqual([]);
  });

  it('returns an empty array for undefined', () => {
    expect(getLineEhlersSupersmootherFinitePoints(undefined)).toEqual([]);
  });

  it('returns an empty array for non-array', () => {
    expect(getLineEhlersSupersmootherFinitePoints({} as never)).toEqual([]);
  });

  it('drops non-finite x', () => {
    const result = getLineEhlersSupersmootherFinitePoints([
      { x: 1, close: 10 },
      { x: Number.NaN, close: 20 },
      { x: 2, close: 30 },
    ]);
    expect(result.map((p) => p.x)).toEqual([1, 2]);
  });

  it('drops non-finite close', () => {
    const result = getLineEhlersSupersmootherFinitePoints([
      { x: 1, close: Number.POSITIVE_INFINITY },
      { x: 2, close: 5 },
    ]);
    expect(result.map((p) => p.x)).toEqual([2]);
  });

  it('drops null entries', () => {
    const result = getLineEhlersSupersmootherFinitePoints([
      null as unknown as ChartLineEhlersSupersmootherPoint,
      { x: 1, close: 2 },
    ]);
    expect(result).toEqual([{ x: 1, close: 2 }]);
  });
});

describe('normalizeLineEhlersSupersmootherPeriod', () => {
  it('returns the default when undefined', () => {
    expect(normalizeLineEhlersSupersmootherPeriod(undefined, 10)).toBe(10);
  });

  it('returns the default when NaN', () => {
    expect(normalizeLineEhlersSupersmootherPeriod(Number.NaN, 10)).toBe(10);
  });

  it('floors fractional periods', () => {
    expect(normalizeLineEhlersSupersmootherPeriod(7.9, 10)).toBe(7);
  });

  it('rejects period below 2', () => {
    expect(normalizeLineEhlersSupersmootherPeriod(1, 10)).toBe(10);
    expect(normalizeLineEhlersSupersmootherPeriod(0, 10)).toBe(10);
    expect(normalizeLineEhlersSupersmootherPeriod(-5, 10)).toBe(10);
  });

  it('accepts the minimum period of 2', () => {
    expect(normalizeLineEhlersSupersmootherPeriod(2, 10)).toBe(2);
  });
});

describe('computeLineEhlersSupersmootherCoefficients', () => {
  it('produces a stationary fixed point: c1 + c2 + c3 = 1 (numerical)', () => {
    for (const p of [2, 3, 5, 8, 10, 14, 21, 50, 100]) {
      const { c1, c2, c3 } = computeLineEhlersSupersmootherCoefficients(p);
      expect(c1 + c2 + c3).toBeCloseTo(1, 12);
    }
  });

  it('c1 reconstructs exactly from c2 and c3', () => {
    const { c1, c2, c3 } = computeLineEhlersSupersmootherCoefficients(10);
    expect(1 - c2 - c3).toBe(c1);
  });

  it('c3 is non-positive (c3 = -a^2)', () => {
    const { c3 } = computeLineEhlersSupersmootherCoefficients(10);
    expect(c3).toBeLessThanOrEqual(0);
  });

  it('coefficients are finite', () => {
    const { c1, c2, c3 } = computeLineEhlersSupersmootherCoefficients(5);
    expect(Number.isFinite(c1)).toBe(true);
    expect(Number.isFinite(c2)).toBe(true);
    expect(Number.isFinite(c3)).toBe(true);
  });

  it('long period drives c1 toward zero and c2 + c3 toward one', () => {
    const { c1, c2, c3 } = computeLineEhlersSupersmootherCoefficients(200);
    expect(c1).toBeGreaterThan(0);
    expect(c1).toBeLessThan(0.05);
    expect(c2 + c3).toBeGreaterThan(0.95);
  });
});

describe('computeLineEhlersSupersmoother', () => {
  it('returns an empty array for null', () => {
    expect(computeLineEhlersSupersmoother(null, 10)).toEqual([]);
  });

  it('returns an empty array for empty input', () => {
    expect(computeLineEhlersSupersmoother([], 10)).toEqual([]);
  });

  it('seeds with the first two closes for any period', () => {
    const closes = [42, 99, 7, 8, 9];
    const out = computeLineEhlersSupersmoother(closes, 10);
    expect(out[0]).toBe(42);
    expect(out[1]).toBe(99);
  });

  it('CONST_FLAT passes through bit-exact at every bar (period 10)', () => {
    const K = 50;
    const out = computeLineEhlersSupersmoother(
      flat(80, K).map((p) => p.close),
      10,
    );
    for (let i = 0; i < out.length; i += 1) {
      expect(out[i]).toBe(K);
    }
  });

  it('CONST_FLAT passes through bit-exact at period 2', () => {
    const K = 7;
    const out = computeLineEhlersSupersmoother(
      flat(40, K).map((p) => p.close),
      2,
    );
    for (let i = 0; i < out.length; i += 1) {
      expect(out[i]).toBe(K);
    }
  });

  it('CONST_FLAT at period 50 stays at K within numerical tolerance', () => {
    const K = -3.5;
    const out = computeLineEhlersSupersmoother(
      flat(60, K).map((p) => p.close),
      50,
    );
    for (let i = 0; i < out.length; i += 1) {
      const v = out[i];
      expect(v).not.toBe(null);
      if (v !== null) expect(v).toBeCloseTo(K, 12);
    }
  });

  it('CONST_FLAT at zero stays at zero', () => {
    const out = computeLineEhlersSupersmoother(
      flat(40, 0).map((p) => p.close),
      10,
    );
    for (let i = 0; i < out.length; i += 1) {
      expect(out[i]).toBe(0);
    }
  });

  it('CONST_FLAT at fractional value stays at K within numerical tolerance', () => {
    const K = 0.25;
    const out = computeLineEhlersSupersmoother(
      flat(20, K).map((p) => p.close),
      8,
    );
    for (let i = 0; i < out.length; i += 1) {
      const v = out[i];
      expect(v).not.toBe(null);
      if (v !== null) expect(v).toBeCloseTo(K, 12);
    }
  });

  it('resets recurrence on NaN', () => {
    const closes = [10, 10, 10, Number.NaN, 20, 20, 20, 20];
    const out = computeLineEhlersSupersmoother(closes, 10);
    expect(out[0]).toBe(10);
    expect(out[1]).toBe(10);
    expect(out[2]).toBe(10);
    expect(out[3]).toBe(null);
    expect(out[4]).toBe(20);
    expect(out[5]).toBe(20);
  });

  it('rejects non-finite period (uses default 10)', () => {
    const closes = flat(20, 5).map((p) => p.close);
    const out = computeLineEhlersSupersmoother(closes, Number.NaN);
    expect(out[10]).toBe(5);
  });

  it('matches the recurrence on a known fixture', () => {
    const closes = [10, 12, 14, 16, 18];
    const { c1, c2, c3 } = computeLineEhlersSupersmootherCoefficients(10);
    const out = computeLineEhlersSupersmoother(closes, 10);
    expect(out[0]).toBe(10);
    expect(out[1]).toBe(12);
    const expected2 = c1 * ((14 + 12) / 2) + c2 * 12 + c3 * 10;
    expect(out[2]).toBe(expected2);
    const expected3 = c1 * ((16 + 14) / 2) + c2 * expected2 + c3 * 12;
    expect(out[3]).toBe(expected3);
  });

  it('output length matches input length', () => {
    const closes = rising(40).map((p) => p.close);
    const out = computeLineEhlersSupersmoother(closes, 10);
    expect(out.length).toBe(40);
  });

  it('does not mutate input', () => {
    const closes = [1, 2, 3, 4, 5];
    const snap = closes.slice();
    computeLineEhlersSupersmoother(closes, 10);
    expect(closes).toEqual(snap);
  });

  it('translation invariance: shifting close by C shifts SS by C', () => {
    const baseCloses = pivot(40).map((p) => p.close);
    const shiftedCloses = baseCloses.map((c) => c + 100);
    const base = computeLineEhlersSupersmoother(baseCloses, 10);
    const shifted = computeLineEhlersSupersmoother(shiftedCloses, 10);
    for (let i = 0; i < base.length; i += 1) {
      const b = base[i];
      const s = shifted[i];
      if (b == null || s == null) {
        expect(b).toBe(s);
        continue;
      }
      expect(s - b).toBeCloseTo(100, 9);
    }
  });

  it('rising step CONST_FLAT shifted: still bit-exact equal to K', () => {
    const out = computeLineEhlersSupersmoother(
      flat(15, 99).map((p) => p.close),
      6,
    );
    for (let i = 0; i < out.length; i += 1) {
      expect(out[i]).toBe(99);
    }
  });
});

describe('classifyLineEhlersSupersmootherZone', () => {
  it('classifies above', () => {
    expect(classifyLineEhlersSupersmootherZone(10, 5)).toBe('above');
  });

  it('classifies below', () => {
    expect(classifyLineEhlersSupersmootherZone(5, 10)).toBe('below');
  });

  it('classifies at', () => {
    expect(classifyLineEhlersSupersmootherZone(5, 5)).toBe('at');
  });

  it('returns none when close is null', () => {
    expect(classifyLineEhlersSupersmootherZone(null, 5)).toBe('none');
  });

  it('returns none when SS is null', () => {
    expect(classifyLineEhlersSupersmootherZone(5, null)).toBe('none');
  });

  it('returns none for NaN', () => {
    expect(classifyLineEhlersSupersmootherZone(Number.NaN, 5)).toBe('none');
    expect(classifyLineEhlersSupersmootherZone(5, Number.NaN)).toBe('none');
  });
});

describe('runLineEhlersSupersmoother', () => {
  it('marks ok=false for fewer than 2 points', () => {
    const run = runLineEhlersSupersmoother([{ x: 0, close: 10 }]);
    expect(run.ok).toBe(false);
  });

  it('marks ok=true for at least 2 points', () => {
    const run = runLineEhlersSupersmoother(rising(20));
    expect(run.ok).toBe(true);
  });

  it('uses the default period when none is provided', () => {
    const run = runLineEhlersSupersmoother(rising(20));
    expect(run.period).toBe(DEFAULT_CHART_LINE_EHLERS_SUPERSMOOTHER_PERIOD);
  });

  it('respects an explicit period', () => {
    const run = runLineEhlersSupersmoother(rising(20), { period: 14 });
    expect(run.period).toBe(14);
  });

  it('sorts by x', () => {
    const data: ChartLineEhlersSupersmootherPoint[] = [
      { x: 2, close: 30 },
      { x: 0, close: 10 },
      { x: 1, close: 20 },
    ];
    const run = runLineEhlersSupersmoother(data);
    expect(run.samples.map((s) => s.x)).toEqual([0, 1, 2]);
  });

  it('CONST_FLAT classifies all bars as "at"', () => {
    const run = runLineEhlersSupersmoother(flat(40, 7));
    expect(run.aboveCount).toBe(0);
    expect(run.belowCount).toBe(0);
    expect(run.atCount).toBe(40);
  });

  it('exposes ssFinal as the last finite ss', () => {
    const run = runLineEhlersSupersmoother(flat(20, 5));
    expect(run.ssFinal).toBe(5);
  });

  it('rising trend keeps close above SS (filter lags so close > SS)', () => {
    const run = runLineEhlersSupersmoother(rising(40, 100, 1));
    expect(run.aboveCount).toBeGreaterThan(run.belowCount);
  });

  it('counts sum to total bars', () => {
    const data = pivot(30);
    const run = runLineEhlersSupersmoother(data);
    expect(run.aboveCount + run.atCount + run.belowCount).toBe(
      run.series.length,
    );
  });

  it('ssFinal is null when there is no data', () => {
    const run = runLineEhlersSupersmoother([]);
    expect(run.ssFinal).toBe(null);
  });
});

describe('computeLineEhlersSupersmootherLayout', () => {
  it('returns ok=false for empty data', () => {
    const layout = computeLineEhlersSupersmootherLayout({ data: [] });
    expect(layout.ok).toBe(false);
  });

  it('returns ok=true for sufficient data', () => {
    const layout = computeLineEhlersSupersmootherLayout({ data: rising(20) });
    expect(layout.ok).toBe(true);
  });

  it('uses the explicit width and height', () => {
    const layout = computeLineEhlersSupersmootherLayout({
      data: rising(20),
      width: 600,
      height: 300,
    });
    expect(layout.width).toBe(600);
    expect(layout.height).toBe(300);
  });

  it('inner box respects padding', () => {
    const layout = computeLineEhlersSupersmootherLayout({
      data: rising(20),
      padding: 50,
      width: 600,
      height: 300,
    });
    expect(layout.innerLeft).toBe(50);
    expect(layout.innerRight).toBe(550);
    expect(layout.innerTop).toBe(50);
    expect(layout.innerBottom).toBe(250);
  });

  it('produces a price path and dots', () => {
    const layout = computeLineEhlersSupersmootherLayout({ data: rising(20) });
    expect(layout.pricePath.startsWith('M')).toBe(true);
    expect(layout.priceDots.length).toBe(20);
  });

  it('produces an SS path and markers', () => {
    const layout = computeLineEhlersSupersmootherLayout({ data: rising(20) });
    expect(layout.ssPath.length).toBeGreaterThan(0);
    expect(layout.markers.length).toBe(20);
  });

  it('valueMin and valueMax differ even for constant data', () => {
    const layout = computeLineEhlersSupersmootherLayout({ data: flat(20, 5) });
    expect(layout.valueMin).toBeLessThan(layout.valueMax);
  });

  it('handles a single point gracefully', () => {
    const layout = computeLineEhlersSupersmootherLayout({
      data: [{ x: 0, close: 5 }],
    });
    expect(layout.ok).toBe(false);
  });
});

describe('describeLineEhlersSupersmootherChart', () => {
  it('returns No data for empty input', () => {
    expect(describeLineEhlersSupersmootherChart([])).toBe('No data');
  });

  it('mentions the SuperSmoother formula', () => {
    const desc = describeLineEhlersSupersmootherChart(rising(20));
    expect(desc).toContain('SuperSmoother');
    expect(desc).toContain('two-pole');
  });

  it('mentions the coefficient identity', () => {
    const desc = describeLineEhlersSupersmootherChart(rising(20));
    expect(desc).toContain('coefficient sum is exactly one');
  });

  it('reports the period', () => {
    const desc = describeLineEhlersSupersmootherChart(rising(20), { period: 14 });
    expect(desc).toContain('period 14');
  });

  it('reports above / below / at counts', () => {
    const desc = describeLineEhlersSupersmootherChart(flat(15, 5));
    expect(desc).toMatch(/above the SuperSmoother on 0/);
    expect(desc).toMatch(/below on 0/);
    expect(desc).toMatch(/at the SuperSmoother on 15/);
  });

  it('reports the final reading', () => {
    const desc = describeLineEhlersSupersmootherChart(flat(15, 5));
    expect(desc).toContain('final reading is 5.0000');
  });
});

describe('<ChartLineEhlersSupersmoother />', () => {
  it('renders an empty placeholder for no data', () => {
    const { container } = render(<ChartLineEhlersSupersmoother data={[]} />);
    const placeholder = container.querySelector(
      '[data-section="chart-line-ehlers-supersmoother-empty"]',
    );
    expect(placeholder?.textContent).toBe('No data');
  });

  it('renders region role with aria-label', () => {
    render(<ChartLineEhlersSupersmoother data={rising(20)} />);
    const region = screen.getByRole('region');
    expect(region).toBeTruthy();
    expect(region.getAttribute('aria-label')).toContain(
      'Ehlers SuperSmoother',
    );
  });

  it('forwards ref', () => {
    const ref = createRef<HTMLDivElement>();
    render(<ChartLineEhlersSupersmoother data={rising(20)} ref={ref} />);
    expect(ref.current).not.toBe(null);
  });

  it('exposes data-period', () => {
    const { container } = render(
      <ChartLineEhlersSupersmoother data={rising(20)} period={14} />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-ehlers-supersmoother"]',
    );
    expect(root?.getAttribute('data-period')).toBe('14');
  });

  it('exposes data-ss-final', () => {
    const { container } = render(
      <ChartLineEhlersSupersmoother data={flat(20, 7)} />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-ehlers-supersmoother"]',
    );
    expect(root?.getAttribute('data-ss-final')).toBe('7');
  });

  it('exposes total-points', () => {
    const { container } = render(
      <ChartLineEhlersSupersmoother data={rising(25)} />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-ehlers-supersmoother"]',
    );
    expect(root?.getAttribute('data-total-points')).toBe('25');
  });

  it('exposes above / at / below counts', () => {
    const { container } = render(
      <ChartLineEhlersSupersmoother data={flat(20, 5)} />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-ehlers-supersmoother"]',
    );
    expect(root?.getAttribute('data-at-count')).toBe('20');
    expect(root?.getAttribute('data-above-count')).toBe('0');
    expect(root?.getAttribute('data-below-count')).toBe('0');
  });

  it('renders the screen-reader description', () => {
    const { container } = render(
      <ChartLineEhlersSupersmoother data={rising(20)} />,
    );
    const desc = container.querySelector(
      '[data-section="chart-line-ehlers-supersmoother-aria-desc"]',
    );
    expect(desc?.textContent).toContain('SuperSmoother');
  });

  it('renders both legend items', () => {
    render(<ChartLineEhlersSupersmoother data={rising(20)} />);
    expect(screen.getByText('Close')).toBeTruthy();
    expect(screen.getByText('SuperSmoother')).toBeTruthy();
  });

  it('toggles a series via the legend', () => {
    const onToggle = vi.fn();
    const { container } = render(
      <ChartLineEhlersSupersmoother
        data={rising(20)}
        onSeriesToggle={onToggle}
      />,
    );
    const ssButton = container.querySelector(
      '[data-series-id="ss"]',
    ) as HTMLButtonElement | null;
    expect(ssButton).not.toBe(null);
    if (ssButton) fireEvent.click(ssButton);
    expect(onToggle).toHaveBeenCalledWith({ seriesId: 'ss', hidden: true });
  });

  it('respects controlled hiddenSeries', () => {
    const { container } = render(
      <ChartLineEhlersSupersmoother
        data={rising(20)}
        hiddenSeries={['ss']}
      />,
    );
    const ssButton = container.querySelector(
      '[data-series-id="ss"]',
    );
    expect(ssButton?.getAttribute('data-hidden')).toBe('true');
  });

  it('hides SuperSmoother line when controlled hidden', () => {
    const { container } = render(
      <ChartLineEhlersSupersmoother
        data={rising(20)}
        hiddenSeries={['ss']}
      />,
    );
    const ssPath = container.querySelector(
      '[data-section="chart-line-ehlers-supersmoother-line"]',
    );
    expect(ssPath).toBe(null);
  });

  it('fires onPointClick on marker activation', () => {
    const onPointClick = vi.fn();
    const { container } = render(
      <ChartLineEhlersSupersmoother
        data={rising(20)}
        onPointClick={onPointClick}
      />,
    );
    const markers = container.querySelectorAll(
      '[data-section="chart-line-ehlers-supersmoother-marker"]',
    );
    expect(markers.length).toBeGreaterThan(0);
    fireEvent.click(markers[0]!);
    expect(onPointClick).toHaveBeenCalled();
  });

  it('responds to Enter key on markers', () => {
    const onPointClick = vi.fn();
    const { container } = render(
      <ChartLineEhlersSupersmoother
        data={rising(20)}
        onPointClick={onPointClick}
      />,
    );
    const marker = container.querySelector(
      '[data-section="chart-line-ehlers-supersmoother-marker"]',
    ) as SVGElement | null;
    expect(marker).not.toBe(null);
    if (marker) fireEvent.keyDown(marker, { key: 'Enter' });
    expect(onPointClick).toHaveBeenCalled();
  });

  it('responds to Space key on markers', () => {
    const onPointClick = vi.fn();
    const { container } = render(
      <ChartLineEhlersSupersmoother
        data={rising(20)}
        onPointClick={onPointClick}
      />,
    );
    const marker = container.querySelector(
      '[data-section="chart-line-ehlers-supersmoother-marker"]',
    ) as SVGElement | null;
    if (marker) fireEvent.keyDown(marker, { key: ' ' });
    expect(onPointClick).toHaveBeenCalled();
  });

  it('renders the config badge by default', () => {
    const { container } = render(
      <ChartLineEhlersSupersmoother data={rising(20)} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-ehlers-supersmoother-badge"]',
      ),
    ).toBeTruthy();
  });

  it('hides the config badge when disabled', () => {
    const { container } = render(
      <ChartLineEhlersSupersmoother
        data={rising(20)}
        showConfigBadge={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-ehlers-supersmoother-badge"]',
      ),
    ).toBe(null);
  });

  it('renders dots when showDots is true', () => {
    const { container } = render(
      <ChartLineEhlersSupersmoother data={rising(20)} showDots={true} />,
    );
    expect(
      container.querySelectorAll(
        '[data-section="chart-line-ehlers-supersmoother-dot"]',
      ).length,
    ).toBeGreaterThan(0);
  });

  it('does not render dots by default', () => {
    const { container } = render(
      <ChartLineEhlersSupersmoother data={rising(20)} />,
    );
    expect(
      container.querySelectorAll(
        '[data-section="chart-line-ehlers-supersmoother-dot"]',
      ).length,
    ).toBe(0);
  });

  it('hides axis when showAxis is false', () => {
    const { container } = render(
      <ChartLineEhlersSupersmoother
        data={rising(20)}
        showAxis={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-ehlers-supersmoother-axes"]',
      ),
    ).toBe(null);
  });

  it('hides grid when showGrid is false', () => {
    const { container } = render(
      <ChartLineEhlersSupersmoother
        data={rising(20)}
        showGrid={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-ehlers-supersmoother-grid"]',
      ),
    ).toBe(null);
  });

  it('hides markers when showMarkers is false', () => {
    const { container } = render(
      <ChartLineEhlersSupersmoother
        data={rising(20)}
        showMarkers={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-ehlers-supersmoother-markers"]',
      ),
    ).toBe(null);
  });

  it('hides legend when showLegend is false', () => {
    const { container } = render(
      <ChartLineEhlersSupersmoother
        data={rising(20)}
        showLegend={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-ehlers-supersmoother-legend"]',
      ),
    ).toBe(null);
  });

  it('respects a custom formatValue', () => {
    const fmt = (v: number) => `<${v.toFixed(1)}>`;
    const { container } = render(
      <ChartLineEhlersSupersmoother
        data={flat(20, 7)}
        formatValue={fmt}
      />,
    );
    const text = container.textContent ?? '';
    expect(text).toContain('<8.0>');
    expect(text).toContain('<6.0>');
  });

  it('applies className and style', () => {
    const { container } = render(
      <ChartLineEhlersSupersmoother
        data={rising(20)}
        className="custom-class"
        style={{ background: 'red' }}
      />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-ehlers-supersmoother"]',
    );
    expect(root?.classList.contains('custom-class')).toBe(true);
    expect((root as HTMLElement | null)?.style.background).toBe('red');
  });

  it('shows animate attribute', () => {
    const { container } = render(
      <ChartLineEhlersSupersmoother data={rising(20)} animate={true} />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-ehlers-supersmoother"]',
    );
    expect(root?.getAttribute('data-animate')).toBe('true');
  });

  it('animate=false disables fade-in class', () => {
    const { container } = render(
      <ChartLineEhlersSupersmoother data={rising(20)} animate={false} />,
    );
    const svg = container.querySelector(
      '[data-section="chart-line-ehlers-supersmoother-svg"]',
    );
    expect(svg?.classList.contains('motion-safe:animate-fade-in')).toBe(false);
  });

  it('renders the SS line by default', () => {
    const { container } = render(
      <ChartLineEhlersSupersmoother data={rising(20)} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-ehlers-supersmoother-line"]',
      ),
    ).toBeTruthy();
  });

  it('renders the price path', () => {
    const { container } = render(
      <ChartLineEhlersSupersmoother data={rising(20)} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-ehlers-supersmoother-price-path"]',
      ),
    ).toBeTruthy();
  });

  it('respects defaultHiddenSeries on uncontrolled mount', () => {
    const { container } = render(
      <ChartLineEhlersSupersmoother
        data={rising(20)}
        defaultHiddenSeries={['ss']}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-ehlers-supersmoother-line"]',
      ),
    ).toBe(null);
  });

  it('hovering a marker exposes tooltip', () => {
    const { container } = render(
      <ChartLineEhlersSupersmoother data={rising(20)} />,
    );
    const marker = container.querySelector(
      '[data-section="chart-line-ehlers-supersmoother-marker"]',
    ) as SVGElement | null;
    if (marker) fireEvent.mouseEnter(marker);
    expect(
      container.querySelector(
        '[data-section="chart-line-ehlers-supersmoother-tooltip"]',
      ),
    ).toBeTruthy();
  });

  it('tooltip vanishes on mouseLeave', () => {
    const { container } = render(
      <ChartLineEhlersSupersmoother data={rising(20)} />,
    );
    const marker = container.querySelector(
      '[data-section="chart-line-ehlers-supersmoother-marker"]',
    ) as SVGElement | null;
    if (marker) {
      fireEvent.mouseEnter(marker);
      fireEvent.mouseLeave(marker);
    }
    expect(
      container.querySelector(
        '[data-section="chart-line-ehlers-supersmoother-tooltip"]',
      ),
    ).toBe(null);
  });

  it('tooltip respects showTooltip=false', () => {
    const { container } = render(
      <ChartLineEhlersSupersmoother
        data={rising(20)}
        showTooltip={false}
      />,
    );
    const marker = container.querySelector(
      '[data-section="chart-line-ehlers-supersmoother-marker"]',
    ) as SVGElement | null;
    if (marker) fireEvent.mouseEnter(marker);
    expect(
      container.querySelector(
        '[data-section="chart-line-ehlers-supersmoother-tooltip"]',
      ),
    ).toBe(null);
  });
});

describe('SuperSmoother integration', () => {
  it('coefficient identity drives stationary state to K (numerical)', () => {
    const { c1, c2, c3 } = computeLineEhlersSupersmootherCoefficients(7);
    const K = 13.5;
    // ss[i] = c1 * ((K + K)/2) + c2 * K + c3 * K = K * (c1 + c2 + c3) ~ K
    const computed = c1 * ((K + K) / 2) + c2 * K + c3 * K;
    expect(computed).toBeCloseTo(K, 12);
  });

  it('coefficient identity drives stationary state to K at K=0 bit-exact', () => {
    const { c1, c2, c3 } = computeLineEhlersSupersmootherCoefficients(7);
    const computed = c1 * 0 + c2 * 0 + c3 * 0;
    expect(computed).toBe(0);
  });

  it('full run reproduces the recurrence on a short fixture', () => {
    const closes = [1, 2, 4, 7, 11, 16];
    const { c1, c2, c3 } = computeLineEhlersSupersmootherCoefficients(10);
    const expected: number[] = [];
    expected.push(1); // seed
    expected.push(2); // seed
    expected.push(c1 * ((4 + 2) / 2) + c2 * expected[1]! + c3 * expected[0]!);
    expected.push(c1 * ((7 + 4) / 2) + c2 * expected[2]! + c3 * expected[1]!);
    expected.push(c1 * ((11 + 7) / 2) + c2 * expected[3]! + c3 * expected[2]!);
    expected.push(c1 * ((16 + 11) / 2) + c2 * expected[4]! + c3 * expected[3]!);
    const out = computeLineEhlersSupersmoother(closes, 10);
    for (let i = 0; i < closes.length; i += 1) {
      expect(out[i]).toBe(expected[i]);
    }
  });

  it('different periods produce different SS on non-flat data', () => {
    const data = pivot(40).map((p) => p.close);
    const ssA = computeLineEhlersSupersmoother(data, 5);
    const ssB = computeLineEhlersSupersmoother(data, 14);
    let differed = false;
    for (let i = 0; i < ssA.length; i += 1) {
      if (ssA[i] !== ssB[i]) {
        differed = true;
        break;
      }
    }
    expect(differed).toBe(true);
  });
});
