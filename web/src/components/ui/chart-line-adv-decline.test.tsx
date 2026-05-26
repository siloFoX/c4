import { describe, expect, it, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { createRef } from 'react';
import {
  ChartLineAdvDecline,
  applyLineAdvDeclineRollingSum,
  classifyLineAdvDeclineZone,
  computeLineAdvDecline,
  computeLineAdvDeclineLayout,
  computeLineAdvDeclineNetSeries,
  describeLineAdvDeclineChart,
  detectLineAdvDeclineCrosses,
  getLineAdvDeclineFinitePoints,
  normalizeLineAdvDeclineLength,
  runLineAdvDecline,
  DEFAULT_CHART_LINE_ADV_DECLINE_LENGTH,
} from './chart-line-adv-decline';
import type { ChartLineAdvDeclinePoint } from './chart-line-adv-decline';

const constBars = (
  count: number,
  advances: number,
  declines: number,
  close = 100,
): ChartLineAdvDeclinePoint[] =>
  Array.from({ length: count }, (_, i) => ({
    x: i,
    close,
    advances,
    declines,
  }));

describe('getLineAdvDeclineFinitePoints', () => {
  it('returns an empty array for null', () => {
    expect(getLineAdvDeclineFinitePoints(null)).toEqual([]);
  });

  it('returns an empty array for undefined', () => {
    expect(getLineAdvDeclineFinitePoints(undefined)).toEqual([]);
  });

  it('drops non-finite advances', () => {
    const result = getLineAdvDeclineFinitePoints([
      { x: 0, close: 100, advances: Number.NaN, declines: 5 },
      { x: 1, close: 100, advances: 10, declines: 5 },
    ]);
    expect(result.length).toBe(1);
  });

  it('drops non-finite declines', () => {
    const result = getLineAdvDeclineFinitePoints([
      { x: 0, close: 100, advances: 10, declines: Number.NaN },
      { x: 1, close: 100, advances: 10, declines: 5 },
    ]);
    expect(result.length).toBe(1);
  });

  it('drops non-finite close', () => {
    const result = getLineAdvDeclineFinitePoints([
      { x: 0, close: Number.NaN, advances: 10, declines: 5 },
      { x: 1, close: 100, advances: 10, declines: 5 },
    ]);
    expect(result.length).toBe(1);
  });

  it('drops null entries', () => {
    const result = getLineAdvDeclineFinitePoints([
      null as unknown as ChartLineAdvDeclinePoint,
      { x: 1, close: 100, advances: 10, declines: 5 },
    ]);
    expect(result.length).toBe(1);
  });
});

describe('normalizeLineAdvDeclineLength', () => {
  it('returns the default when undefined', () => {
    expect(normalizeLineAdvDeclineLength(undefined, 14)).toBe(14);
  });

  it('floors fractional lengths', () => {
    expect(normalizeLineAdvDeclineLength(7.9, 14)).toBe(7);
  });

  it('accepts 1', () => {
    expect(normalizeLineAdvDeclineLength(1, 14)).toBe(1);
  });

  it('rejects zero', () => {
    expect(normalizeLineAdvDeclineLength(0, 14)).toBe(14);
  });

  it('rejects negative', () => {
    expect(normalizeLineAdvDeclineLength(-1, 14)).toBe(14);
  });
});

describe('computeLineAdvDeclineNetSeries', () => {
  it('returns advances - declines per bar', () => {
    const series: ChartLineAdvDeclinePoint[] = [
      { x: 0, close: 100, advances: 10, declines: 5 },
      { x: 1, close: 100, advances: 3, declines: 8 },
    ];
    expect(computeLineAdvDeclineNetSeries(series)).toEqual([5, -5]);
  });

  it('CONST a=b yields net = 0 bit-exact', () => {
    const series = constBars(5, 7, 7);
    const net = computeLineAdvDeclineNetSeries(series);
    for (const v of net) {
      expect(v).toBe(0);
    }
  });

  it('normalizes -0 to +0', () => {
    // No subtraction yields -0 with integer inputs, but assert the
    // identity for completeness.
    const series: ChartLineAdvDeclinePoint[] = [
      { x: 0, close: 100, advances: 0, declines: 0 },
    ];
    expect(Object.is(computeLineAdvDeclineNetSeries(series)[0], 0)).toBe(true);
  });
});

describe('applyLineAdvDeclineRollingSum', () => {
  it('warmup region is null', () => {
    const out = applyLineAdvDeclineRollingSum([1, 2, 3, 4, 5], 3);
    expect(out[0]).toBe(null);
    expect(out[1]).toBe(null);
    expect(out[2]).not.toBe(null);
  });

  it('CONST values yield sum = K * length bit-exact', () => {
    for (const K of [0, 1, 5, 100, -3]) {
      const values = Array(10).fill(K);
      const out = applyLineAdvDeclineRollingSum(values, 4);
      for (let i = 3; i < 10; i += 1) {
        expect(out[i]).toBe(K * 4);
      }
    }
  });

  it('sum of [1, 2, 3, 4] with length 4 is 10', () => {
    const out = applyLineAdvDeclineRollingSum([1, 2, 3, 4], 4);
    expect(out[3]).toBe(10);
  });
});

describe('computeLineAdvDecline', () => {
  it('returns empty for null', () => {
    const ch = computeLineAdvDecline(null);
    expect(ch.adLine).toEqual([]);
  });

  it('returns empty for empty input', () => {
    const ch = computeLineAdvDecline([]);
    expect(ch.adLine).toEqual([]);
  });

  it('CONST a=b yields adLine = 0 bit-exact at every valid bar', () => {
    for (const breadth of [1, 5, 100]) {
      const ch = computeLineAdvDecline(constBars(20, breadth, breadth), {
        length: 4,
      });
      for (let i = 3; i < 20; i += 1) {
        expect(ch.adLine[i]).toBe(0);
      }
    }
  });

  it('CONST a > b yields adLine = (a - b) * length bit-exact', () => {
    const ch = computeLineAdvDecline(constBars(20, 10, 3), { length: 4 });
    // (10 - 3) * 4 = 28
    for (let i = 3; i < 20; i += 1) {
      expect(ch.adLine[i]).toBe(28);
    }
  });

  it('CONST a < b yields adLine = (a - b) * length (negative)', () => {
    const ch = computeLineAdvDecline(constBars(20, 3, 10), { length: 4 });
    // (3 - 10) * 4 = -28
    for (let i = 3; i < 20; i += 1) {
      expect(ch.adLine[i]).toBe(-28);
    }
  });

  it('warmup region is null', () => {
    const ch = computeLineAdvDecline(constBars(20, 5, 3), { length: 5 });
    expect(ch.adLine[0]).toBe(null);
    expect(ch.adLine[3]).toBe(null);
    expect(ch.adLine[4]).not.toBe(null);
  });

  it('output length matches input length', () => {
    const ch = computeLineAdvDecline(constBars(15, 5, 3), { length: 4 });
    expect(ch.adLine.length).toBe(15);
    expect(ch.net.length).toBe(15);
  });

  it('does not mutate input', () => {
    const series = constBars(15, 5, 3);
    const snap = JSON.parse(JSON.stringify(series));
    computeLineAdvDecline(series, { length: 4 });
    expect(series).toEqual(snap);
  });
});

describe('classifyLineAdvDeclineZone', () => {
  it('classifies positive', () => {
    expect(classifyLineAdvDeclineZone(2)).toBe('positive');
  });

  it('classifies negative', () => {
    expect(classifyLineAdvDeclineZone(-2)).toBe('negative');
  });

  it('classifies zero', () => {
    expect(classifyLineAdvDeclineZone(0)).toBe('zero');
  });

  it('returns none for null', () => {
    expect(classifyLineAdvDeclineZone(null)).toBe('none');
  });

  it('returns none for NaN', () => {
    expect(classifyLineAdvDeclineZone(Number.NaN)).toBe('none');
  });
});

describe('detectLineAdvDeclineCrosses', () => {
  it('returns [null, null] for warmup-only data', () => {
    expect(detectLineAdvDeclineCrosses([null, null])).toEqual([null, null]);
  });

  it('flags up when prev <= 0 and current > 0', () => {
    const crosses = detectLineAdvDeclineCrosses([null, -1, 1]);
    expect(crosses[2]).toBe('up');
  });

  it('flags down when prev >= 0 and current < 0', () => {
    const crosses = detectLineAdvDeclineCrosses([null, 1, -1]);
    expect(crosses[2]).toBe('down');
  });

  it('no cross when both positive', () => {
    const crosses = detectLineAdvDeclineCrosses([null, 1, 2]);
    expect(crosses[2]).toBe(null);
  });

  it('detects multiple crosses', () => {
    const crosses = detectLineAdvDeclineCrosses([null, 1, -1, 1]);
    expect(crosses[2]).toBe('down');
    expect(crosses[3]).toBe('up');
  });

  it('first defined bar is not a cross', () => {
    const crosses = detectLineAdvDeclineCrosses([null, 1]);
    expect(crosses[1]).toBe(null);
  });
});

describe('runLineAdvDecline', () => {
  it('marks ok=false for fewer than length points', () => {
    const run = runLineAdvDecline(constBars(3, 5, 3), { length: 4 });
    expect(run.ok).toBe(false);
  });

  it('marks ok=true with length points', () => {
    const run = runLineAdvDecline(constBars(4, 5, 3), { length: 4 });
    expect(run.ok).toBe(true);
  });

  it('uses default length', () => {
    const run = runLineAdvDecline(constBars(30, 5, 3));
    expect(run.length).toBe(DEFAULT_CHART_LINE_ADV_DECLINE_LENGTH);
  });

  it('respects explicit length', () => {
    const run = runLineAdvDecline(constBars(30, 5, 3), { length: 7 });
    expect(run.length).toBe(7);
  });

  it('sorts by x', () => {
    const data: ChartLineAdvDeclinePoint[] = [
      { x: 2, close: 100, advances: 5, declines: 3 },
      { x: 0, close: 100, advances: 5, declines: 3 },
      { x: 1, close: 100, advances: 5, declines: 3 },
    ];
    const run = runLineAdvDecline(data, { length: 2 });
    expect(run.samples.map((s) => s.x)).toEqual([0, 1, 2]);
  });

  it('CONST a > b classifies post-warmup as positive', () => {
    const run = runLineAdvDecline(constBars(20, 10, 3), { length: 4 });
    expect(run.positiveCount).toBe(17);
    expect(run.negativeCount).toBe(0);
    expect(run.zeroCount).toBe(0);
  });

  it('CONST a = b classifies post-warmup as zero', () => {
    const run = runLineAdvDecline(constBars(20, 5, 5), { length: 4 });
    expect(run.zeroCount).toBe(17);
    expect(run.positiveCount).toBe(0);
    expect(run.negativeCount).toBe(0);
  });

  it('CONST a < b classifies post-warmup as negative', () => {
    const run = runLineAdvDecline(constBars(20, 3, 10), { length: 4 });
    expect(run.negativeCount).toBe(17);
  });

  it('no crosses when zone is stable', () => {
    const run = runLineAdvDecline(constBars(20, 10, 3), { length: 4 });
    expect(run.bullishCrossCount).toBe(0);
    expect(run.bearishCrossCount).toBe(0);
  });
});

describe('computeLineAdvDeclineLayout', () => {
  it('returns ok=false for empty data', () => {
    const layout = computeLineAdvDeclineLayout({ data: [] });
    expect(layout.ok).toBe(false);
  });

  it('returns ok=true for sufficient data', () => {
    const layout = computeLineAdvDeclineLayout({
      data: constBars(30, 5, 3),
    });
    expect(layout.ok).toBe(true);
  });

  it('uses the explicit width and height', () => {
    const layout = computeLineAdvDeclineLayout({
      data: constBars(30, 5, 3),
      width: 600,
      height: 400,
    });
    expect(layout.width).toBe(600);
    expect(layout.height).toBe(400);
  });

  it('panels stack with price above adLine', () => {
    const layout = computeLineAdvDeclineLayout({
      data: constBars(30, 5, 3),
    });
    expect(layout.priceBottom).toBeLessThan(layout.adTop);
  });

  it('panel gap is respected', () => {
    const layout = computeLineAdvDeclineLayout({
      data: constBars(30, 5, 3),
      panelGap: 24,
    });
    expect(layout.adTop - layout.priceBottom).toBeCloseTo(24, 9);
  });

  it('produces a price path and dots', () => {
    const layout = computeLineAdvDeclineLayout({
      data: constBars(30, 5, 3),
    });
    expect(layout.pricePath.startsWith('M')).toBe(true);
    expect(layout.priceDots.length).toBe(30);
  });

  it('CONST yields zero markers (no crosses)', () => {
    const layout = computeLineAdvDeclineLayout({
      data: constBars(30, 10, 3),
    });
    expect(layout.markers.length).toBe(0);
  });

  it('y range always includes zero', () => {
    const layout = computeLineAdvDeclineLayout({
      data: constBars(30, 10, 3),
    });
    expect(layout.adMin).toBeLessThanOrEqual(0);
    expect(layout.adMax).toBeGreaterThanOrEqual(0);
  });

  it('zero line y is between adTop and adBottom', () => {
    const layout = computeLineAdvDeclineLayout({
      data: constBars(30, 5, 3),
    });
    expect(layout.zeroLineY).toBeGreaterThanOrEqual(layout.adTop);
    expect(layout.zeroLineY).toBeLessThanOrEqual(layout.adBottom);
  });

  it('handles a single point gracefully', () => {
    const layout = computeLineAdvDeclineLayout({
      data: [{ x: 0, close: 100, advances: 5, declines: 3 }],
    });
    expect(layout.ok).toBe(false);
  });
});

describe('describeLineAdvDeclineChart', () => {
  it('returns No data for empty input', () => {
    expect(describeLineAdvDeclineChart([])).toBe('No data');
  });

  it('mentions Advance Decline', () => {
    const desc = describeLineAdvDeclineChart(constBars(30, 5, 3));
    expect(desc).toContain('Advance Decline');
  });

  it('mentions the formula', () => {
    const desc = describeLineAdvDeclineChart(constBars(30, 5, 3));
    expect(desc).toContain('advances - declines');
  });

  it('reports the length', () => {
    const desc = describeLineAdvDeclineChart(constBars(30, 5, 3), {
      length: 7,
    });
    expect(desc).toContain('length 7');
  });
});

describe('<ChartLineAdvDecline />', () => {
  it('renders an empty placeholder for no data', () => {
    const { container } = render(<ChartLineAdvDecline data={[]} />);
    const placeholder = container.querySelector(
      '[data-section="chart-line-adv-decline-empty"]',
    );
    expect(placeholder?.textContent).toBe('No data');
  });

  it('renders region role with aria-label', () => {
    const { container } = render(
      <ChartLineAdvDecline data={constBars(30, 5, 3)} />,
    );
    const region = container.querySelector('[role="region"]');
    expect(region).toBeTruthy();
    expect(region?.getAttribute('aria-label')).toContain('Advance Decline');
  });

  it('forwards ref', () => {
    const ref = createRef<HTMLDivElement>();
    render(<ChartLineAdvDecline data={constBars(30, 5, 3)} ref={ref} />);
    expect(ref.current).not.toBe(null);
  });

  it('exposes data-length', () => {
    const { container } = render(
      <ChartLineAdvDecline data={constBars(30, 5, 3)} length={7} />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-adv-decline"]',
    );
    expect(root?.getAttribute('data-length')).toBe('7');
  });

  it('exposes total-points', () => {
    const { container } = render(
      <ChartLineAdvDecline data={constBars(30, 5, 3)} />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-adv-decline"]',
    );
    expect(root?.getAttribute('data-total-points')).toBe('30');
  });

  it('renders the screen-reader description', () => {
    const { container } = render(
      <ChartLineAdvDecline data={constBars(30, 5, 3)} />,
    );
    const desc = container.querySelector(
      '[data-section="chart-line-adv-decline-aria-desc"]',
    );
    expect(desc?.textContent).toContain('Advance Decline');
  });

  it('renders both legend items', () => {
    const { container } = render(
      <ChartLineAdvDecline data={constBars(30, 5, 3)} />,
    );
    expect(container.querySelector('[data-series-id="price"]')).toBeTruthy();
    expect(container.querySelector('[data-series-id="adLine"]')).toBeTruthy();
  });

  it('toggles a series via the legend', () => {
    const onToggle = vi.fn();
    const { container } = render(
      <ChartLineAdvDecline
        data={constBars(30, 5, 3)}
        onSeriesToggle={onToggle}
      />,
    );
    const button = container.querySelector(
      '[data-series-id="adLine"]',
    ) as HTMLButtonElement | null;
    if (button) fireEvent.click(button);
    expect(onToggle).toHaveBeenCalledWith({
      seriesId: 'adLine',
      hidden: true,
    });
  });

  it('respects controlled hiddenSeries', () => {
    const { container } = render(
      <ChartLineAdvDecline
        data={constBars(30, 5, 3)}
        hiddenSeries={['adLine']}
      />,
    );
    const button = container.querySelector('[data-series-id="adLine"]');
    expect(button?.getAttribute('data-hidden')).toBe('true');
  });

  it('hides ad line when controlled hidden', () => {
    const { container } = render(
      <ChartLineAdvDecline
        data={constBars(30, 5, 3)}
        hiddenSeries={['adLine']}
      />,
    );
    expect(
      container.querySelector('[data-section="chart-line-adv-decline-line"]'),
    ).toBe(null);
  });

  it('renders the config badge by default', () => {
    const { container } = render(
      <ChartLineAdvDecline data={constBars(30, 5, 3)} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-adv-decline-badge"]',
      ),
    ).toBeTruthy();
  });

  it('hides the config badge when disabled', () => {
    const { container } = render(
      <ChartLineAdvDecline
        data={constBars(30, 5, 3)}
        showConfigBadge={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-adv-decline-badge"]',
      ),
    ).toBe(null);
  });

  it('renders dots when showDots is true', () => {
    const { container } = render(
      <ChartLineAdvDecline
        data={constBars(30, 5, 3)}
        showDots={true}
      />,
    );
    expect(
      container.querySelectorAll(
        '[data-section="chart-line-adv-decline-dot"]',
      ).length,
    ).toBeGreaterThan(0);
  });

  it('renders the zero line by default', () => {
    const { container } = render(
      <ChartLineAdvDecline data={constBars(30, 5, 3)} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-adv-decline-zero-line"]',
      ),
    ).toBeTruthy();
  });

  it('hides the zero line when showZeroLine is false', () => {
    const { container } = render(
      <ChartLineAdvDecline
        data={constBars(30, 5, 3)}
        showZeroLine={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-adv-decline-zero-line"]',
      ),
    ).toBe(null);
  });

  it('hides axis when showAxis is false', () => {
    const { container } = render(
      <ChartLineAdvDecline
        data={constBars(30, 5, 3)}
        showAxis={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-adv-decline-axes"]',
      ),
    ).toBe(null);
  });

  it('hides grid when showGrid is false', () => {
    const { container } = render(
      <ChartLineAdvDecline
        data={constBars(30, 5, 3)}
        showGrid={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-adv-decline-grid"]',
      ),
    ).toBe(null);
  });

  it('hides markers when showMarkers is false', () => {
    const { container } = render(
      <ChartLineAdvDecline
        data={constBars(30, 5, 3)}
        showMarkers={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-adv-decline-markers"]',
      ),
    ).toBe(null);
  });

  it('hides legend when showLegend is false', () => {
    const { container } = render(
      <ChartLineAdvDecline
        data={constBars(30, 5, 3)}
        showLegend={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-adv-decline-legend"]',
      ),
    ).toBe(null);
  });

  it('applies className and style', () => {
    const { container } = render(
      <ChartLineAdvDecline
        data={constBars(30, 5, 3)}
        className="custom-class"
        style={{ background: 'red' }}
      />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-adv-decline"]',
    );
    expect(root?.classList.contains('custom-class')).toBe(true);
    expect((root as HTMLElement | null)?.style.background).toBe('red');
  });

  it('animate=false disables fade-in class', () => {
    const { container } = render(
      <ChartLineAdvDecline
        data={constBars(30, 5, 3)}
        animate={false}
      />,
    );
    const svg = container.querySelector(
      '[data-section="chart-line-adv-decline-svg"]',
    );
    expect(svg?.classList.contains('motion-safe:animate-fade-in')).toBe(false);
  });

  it('renders the adLine path by default', () => {
    const { container } = render(
      <ChartLineAdvDecline data={constBars(30, 5, 3)} />,
    );
    expect(
      container.querySelector('[data-section="chart-line-adv-decline-line"]'),
    ).toBeTruthy();
  });

  it('renders the price path', () => {
    const { container } = render(
      <ChartLineAdvDecline data={constBars(30, 5, 3)} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-adv-decline-price-path"]',
      ),
    ).toBeTruthy();
  });

  it('respects defaultHiddenSeries on uncontrolled mount', () => {
    const { container } = render(
      <ChartLineAdvDecline
        data={constBars(30, 5, 3)}
        defaultHiddenSeries={['adLine']}
      />,
    );
    expect(
      container.querySelector('[data-section="chart-line-adv-decline-line"]'),
    ).toBe(null);
  });
});

describe('Advance Decline integration', () => {
  it('CONST a, b yields adLine = (a - b) * length across (a, b, length)', () => {
    for (const a of [0, 5, 100]) {
      for (const b of [0, 3, 50]) {
        for (const L of [3, 4, 7, 10]) {
          const series = constBars(L + 5, a, b);
          const ch = computeLineAdvDecline(series, { length: L });
          const expected = (a - b) * L === 0 ? 0 : (a - b) * L;
          for (let i = L - 1; i < L + 5; i += 1) {
            expect(ch.adLine[i]).toBe(expected);
          }
        }
      }
    }
  });
});
