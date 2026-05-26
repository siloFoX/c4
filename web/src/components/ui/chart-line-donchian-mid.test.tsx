import { describe, expect, it, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { createRef } from 'react';
import {
  ChartLineDonchianMid,
  applyLineDonchianMidRollingMax,
  applyLineDonchianMidRollingMin,
  classifyLineDonchianMidZone,
  computeLineDonchianMid,
  computeLineDonchianMidLayout,
  describeLineDonchianMidChart,
  getLineDonchianMidFinitePoints,
  normalizeLineDonchianMidLength,
  runLineDonchianMid,
  DEFAULT_CHART_LINE_DONCHIAN_MID_LENGTH,
} from './chart-line-donchian-mid';
import type { ChartLineDonchianMidPoint } from './chart-line-donchian-mid';

const constBar = (
  count: number,
  H = 12,
  L = 8,
  C = 10,
): ChartLineDonchianMidPoint[] =>
  Array.from({ length: count }, (_, i) => ({
    x: i,
    high: H,
    low: L,
    close: C,
  }));

const constFlat = (count: number, K: number): ChartLineDonchianMidPoint[] =>
  Array.from({ length: count }, (_, i) => ({
    x: i,
    high: K,
    low: K,
    close: K,
  }));

describe('getLineDonchianMidFinitePoints', () => {
  it('returns an empty array for null', () => {
    expect(getLineDonchianMidFinitePoints(null)).toEqual([]);
  });

  it('returns an empty array for undefined', () => {
    expect(getLineDonchianMidFinitePoints(undefined)).toEqual([]);
  });

  it('drops non-finite x', () => {
    const result = getLineDonchianMidFinitePoints([
      { x: 1, high: 11, low: 9, close: 10 },
      { x: Number.NaN, high: 11, low: 9, close: 10 },
    ]);
    expect(result.length).toBe(1);
  });

  it('drops non-finite high / low / close', () => {
    const result = getLineDonchianMidFinitePoints([
      { x: 0, high: Number.NaN, low: 9, close: 10 },
      { x: 1, high: 11, low: Number.NaN, close: 10 },
      { x: 2, high: 11, low: 9, close: Number.NaN },
      { x: 3, high: 11, low: 9, close: 10 },
    ]);
    expect(result.length).toBe(1);
  });

  it('drops null entries', () => {
    const result = getLineDonchianMidFinitePoints([
      null as unknown as ChartLineDonchianMidPoint,
      { x: 1, high: 11, low: 9, close: 10 },
    ]);
    expect(result.length).toBe(1);
  });
});

describe('normalizeLineDonchianMidLength', () => {
  it('returns the default when undefined', () => {
    expect(normalizeLineDonchianMidLength(undefined, 20)).toBe(20);
  });

  it('floors fractional lengths', () => {
    expect(normalizeLineDonchianMidLength(7.9, 20)).toBe(7);
  });

  it('rejects length below 2', () => {
    expect(normalizeLineDonchianMidLength(1, 20)).toBe(20);
  });
});

describe('applyLineDonchianMidRollingMax', () => {
  it('emits null for warmup bars', () => {
    const out = applyLineDonchianMidRollingMax([1, 2, 3, 4, 5], 3);
    expect(out[0]).toBe(null);
    expect(out[1]).toBe(null);
    expect(out[2]).toBe(3);
  });

  it('rolls the max correctly', () => {
    const out = applyLineDonchianMidRollingMax([5, 3, 8, 2, 1, 9], 3);
    expect(out[2]).toBe(8);
    expect(out[3]).toBe(8);
    expect(out[4]).toBe(8);
    expect(out[5]).toBe(9);
  });

  it('propagates null through the window', () => {
    const out = applyLineDonchianMidRollingMax([1, null, 3, 4, 5], 3);
    expect(out[2]).toBe(null);
    expect(out[3]).toBe(null);
    expect(out[4]).toBe(5);
  });
});

describe('applyLineDonchianMidRollingMin', () => {
  it('emits null for warmup bars', () => {
    const out = applyLineDonchianMidRollingMin([1, 2, 3, 4, 5], 3);
    expect(out[0]).toBe(null);
    expect(out[1]).toBe(null);
    expect(out[2]).toBe(1);
  });

  it('rolls the min correctly', () => {
    const out = applyLineDonchianMidRollingMin([5, 3, 8, 2, 1, 9], 3);
    expect(out[2]).toBe(3);
    expect(out[3]).toBe(2);
    expect(out[4]).toBe(1);
    expect(out[5]).toBe(1);
  });

  it('propagates null through the window', () => {
    const out = applyLineDonchianMidRollingMin([1, null, 3, 4, 5], 3);
    expect(out[2]).toBe(null);
    expect(out[3]).toBe(null);
    expect(out[4]).toBe(3);
  });
});

describe('computeLineDonchianMid', () => {
  it('returns empty arrays for null', () => {
    const ch = computeLineDonchianMid(null);
    expect(ch.upper).toEqual([]);
    expect(ch.lower).toEqual([]);
    expect(ch.middle).toEqual([]);
  });

  it('returns empty arrays for empty input', () => {
    const ch = computeLineDonchianMid([]);
    expect(ch.upper).toEqual([]);
    expect(ch.lower).toEqual([]);
    expect(ch.middle).toEqual([]);
  });

  it('nulls warmup bars (i < length - 1)', () => {
    const bars = constBar(30, 12, 8, 10).map((p) => ({
      high: p.high,
      low: p.low,
      close: p.close,
    }));
    const ch = computeLineDonchianMid(bars, { length: 20 });
    for (let i = 0; i < 19; i += 1) {
      expect(ch.middle[i]).toBe(null);
    }
    expect(typeof ch.middle[19]).toBe('number');
  });

  it('CONST_FLAT (h=l=c=K) yields middle = K bit-exact past warmup', () => {
    for (const K of [0, 1, 5, 100, -3]) {
      const bars = constFlat(30, K).map((p) => ({
        high: p.high,
        low: p.low,
        close: p.close,
      }));
      const ch = computeLineDonchianMid(bars, { length: 20 });
      for (let i = 19; i < 30; i += 1) {
        expect(ch.middle[i]).toBe(K);
      }
    }
  });

  it('CONST_BAR yields middle = (H + L) / 2 bit-exact past warmup', () => {
    for (const { H, L } of [
      { H: 12, L: 8 },
      { H: 10, L: 6 },
      { H: 100, L: 50 },
      { H: 4, L: 2 },
    ]) {
      const bars = constBar(30, H, L).map((p) => ({
        high: p.high,
        low: p.low,
        close: p.close,
      }));
      const ch = computeLineDonchianMid(bars, { length: 20 });
      for (let i = 19; i < 30; i += 1) {
        expect(ch.middle[i]).toBe((H + L) / 2);
      }
    }
  });

  it('CONST_BAR yields upper = H, lower = L past warmup', () => {
    const bars = constBar(30, 12, 8).map((p) => ({
      high: p.high,
      low: p.low,
      close: p.close,
    }));
    const ch = computeLineDonchianMid(bars, { length: 20 });
    for (let i = 19; i < 30; i += 1) {
      expect(ch.upper[i]).toBe(12);
      expect(ch.lower[i]).toBe(8);
    }
  });

  it('output length matches input length', () => {
    const bars = constBar(30).map((p) => ({
      high: p.high,
      low: p.low,
      close: p.close,
    }));
    const ch = computeLineDonchianMid(bars, { length: 20 });
    expect(ch.middle.length).toBe(30);
  });

  it('does not mutate input', () => {
    const bars = constBar(30).map((p) => ({
      high: p.high,
      low: p.low,
      close: p.close,
    }));
    const snap = bars.map((b) => ({ ...b }));
    computeLineDonchianMid(bars, { length: 20 });
    for (let i = 0; i < bars.length; i += 1) {
      expect(bars[i]).toEqual(snap[i]);
    }
  });

  it('rejects non-finite length (uses default)', () => {
    const bars = constBar(30, 12, 8).map((p) => ({
      high: p.high,
      low: p.low,
      close: p.close,
    }));
    const ch = computeLineDonchianMid(bars, { length: Number.NaN });
    expect(ch.middle[19]).toBe(10);
  });

  it('ramped highs and lows yield correct midpoint', () => {
    // high[i] = i + 2, low[i] = i - 2; for length 5 ending at i:
    //   upper = max(high[i-4..i]) = i + 2 (latest is highest)
    //   lower = min(low[i-4..i])  = i - 4 - 2 = i - 6
    //   middle = (i + 2 + i - 6) / 2 = i - 2
    const bars: Array<{ high: number; low: number; close: number }> = [];
    for (let i = 0; i < 20; i += 1) {
      bars.push({ high: i + 2, low: i - 2, close: i });
    }
    const ch = computeLineDonchianMid(bars, { length: 5 });
    for (let i = 4; i < 20; i += 1) {
      expect(ch.middle[i]).toBe(i - 2);
    }
  });
});

describe('classifyLineDonchianMidZone', () => {
  it('classifies above when close > middle', () => {
    expect(classifyLineDonchianMidZone(15, 10)).toBe('above');
  });

  it('classifies below when close < middle', () => {
    expect(classifyLineDonchianMidZone(5, 10)).toBe('below');
  });

  it('classifies at when close == middle', () => {
    expect(classifyLineDonchianMidZone(10, 10)).toBe('at');
  });

  it('returns none for null middle', () => {
    expect(classifyLineDonchianMidZone(10, null)).toBe('none');
  });

  it('returns none for non-finite middle', () => {
    expect(classifyLineDonchianMidZone(10, Number.NaN)).toBe('none');
  });

  it('returns none for non-finite close', () => {
    expect(classifyLineDonchianMidZone(Number.NaN, 10)).toBe('none');
  });
});

describe('runLineDonchianMid', () => {
  it('marks ok=false for fewer than length points', () => {
    const run = runLineDonchianMid(constBar(10), { length: 20 });
    expect(run.ok).toBe(false);
  });

  it('marks ok=true with enough points', () => {
    const run = runLineDonchianMid(constBar(25), { length: 20 });
    expect(run.ok).toBe(true);
  });

  it('uses defaults when none is provided', () => {
    const run = runLineDonchianMid(constBar(30));
    expect(run.length).toBe(DEFAULT_CHART_LINE_DONCHIAN_MID_LENGTH);
  });

  it('respects explicit options', () => {
    const run = runLineDonchianMid(constBar(30), { length: 7 });
    expect(run.length).toBe(7);
  });

  it('sorts by x', () => {
    const data: ChartLineDonchianMidPoint[] = [
      { x: 2, high: 11, low: 9, close: 10 },
      { x: 0, high: 11, low: 9, close: 10 },
      { x: 1, high: 11, low: 9, close: 10 },
    ];
    const run = runLineDonchianMid(data, { length: 2 });
    expect(run.samples.map((s) => s.x)).toEqual([0, 1, 2]);
  });

  it('CONST_BAR with close = (H+L)/2 classifies all post-warmup as at', () => {
    const run = runLineDonchianMid(constBar(30, 12, 8, 10));
    expect(run.atCount).toBe(30 - 19);
  });

  it('CONST_BAR with close = H classifies all post-warmup as above', () => {
    const run = runLineDonchianMid(constBar(30, 12, 8, 12));
    expect(run.aboveCount).toBe(30 - 19);
  });

  it('CONST_BAR with close = L classifies all post-warmup as below', () => {
    const run = runLineDonchianMid(constBar(30, 12, 8, 8));
    expect(run.belowCount).toBe(30 - 19);
  });

  it('CONST_FLAT classifies all post-warmup as at (close == middle)', () => {
    const run = runLineDonchianMid(constFlat(30, 5));
    expect(run.atCount).toBe(30 - 19);
  });

  it('exposes middleFinal as the last finite reading', () => {
    const run = runLineDonchianMid(constBar(30, 12, 8, 10));
    expect(run.middleFinal).toBe(10);
  });

  it('middleFinal is null when there is no data', () => {
    const run = runLineDonchianMid([]);
    expect(run.middleFinal).toBe(null);
  });
});

describe('computeLineDonchianMidLayout', () => {
  it('returns ok=false for empty data', () => {
    const layout = computeLineDonchianMidLayout({ data: [] });
    expect(layout.ok).toBe(false);
  });

  it('returns ok=true for sufficient data', () => {
    const layout = computeLineDonchianMidLayout({
      data: constBar(30),
    });
    expect(layout.ok).toBe(true);
  });

  it('uses the explicit width and height', () => {
    const layout = computeLineDonchianMidLayout({
      data: constBar(30),
      width: 600,
      height: 400,
    });
    expect(layout.width).toBe(600);
    expect(layout.height).toBe(400);
  });

  it('produces a price path and dots', () => {
    const layout = computeLineDonchianMidLayout({ data: constBar(30) });
    expect(layout.pricePath.startsWith('M')).toBe(true);
    expect(layout.priceDots.length).toBe(30);
  });

  it('produces a middle path and markers (skipping warmup)', () => {
    const layout = computeLineDonchianMidLayout({ data: constBar(30) });
    expect(layout.markers.length).toBe(30 - 19);
  });

  it('produces upper and lower paths', () => {
    const layout = computeLineDonchianMidLayout({ data: constBar(30) });
    expect(layout.upperPath.startsWith('M')).toBe(true);
    expect(layout.lowerPath.startsWith('M')).toBe(true);
  });

  it('handles a single point gracefully', () => {
    const layout = computeLineDonchianMidLayout({
      data: [{ x: 0, high: 11, low: 9, close: 10 }],
    });
    expect(layout.ok).toBe(false);
  });

  it('yMin and yMax cover the channel range', () => {
    const layout = computeLineDonchianMidLayout({
      data: constBar(30, 12, 8, 10),
    });
    expect(layout.yMin).toBeLessThanOrEqual(8);
    expect(layout.yMax).toBeGreaterThanOrEqual(12);
  });
});

describe('describeLineDonchianMidChart', () => {
  it('returns No data for empty input', () => {
    expect(describeLineDonchianMidChart([])).toBe('No data');
  });

  it('mentions Donchian Channel midline', () => {
    const desc = describeLineDonchianMidChart(constBar(30));
    expect(desc).toContain('Donchian Channel midline');
  });

  it('mentions the midpoint formula', () => {
    const desc = describeLineDonchianMidChart(constBar(30));
    expect(desc).toContain('highest high');
    expect(desc).toContain('lowest low');
  });

  it('reports the length', () => {
    const desc = describeLineDonchianMidChart(constBar(30), { length: 7 });
    expect(desc).toContain('length 7');
  });

  it('reports the final reading', () => {
    const desc = describeLineDonchianMidChart(constBar(30, 12, 8, 10));
    expect(desc).toContain('10.0000');
  });
});

describe('<ChartLineDonchianMid />', () => {
  it('renders an empty placeholder for no data', () => {
    const { container } = render(<ChartLineDonchianMid data={[]} />);
    const placeholder = container.querySelector(
      '[data-section="chart-line-donchian-mid-empty"]',
    );
    expect(placeholder?.textContent).toBe('No data');
  });

  it('renders region role with aria-label', () => {
    const { container } = render(
      <ChartLineDonchianMid data={constBar(30)} />,
    );
    const region = container.querySelector('[role="region"]');
    expect(region).toBeTruthy();
    expect(region?.getAttribute('aria-label')).toContain('Donchian midline');
  });

  it('forwards ref', () => {
    const ref = createRef<HTMLDivElement>();
    render(<ChartLineDonchianMid data={constBar(30)} ref={ref} />);
    expect(ref.current).not.toBe(null);
  });

  it('exposes data-length', () => {
    const { container } = render(
      <ChartLineDonchianMid data={constBar(30)} length={7} />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-donchian-mid"]',
    );
    expect(root?.getAttribute('data-length')).toBe('7');
  });

  it('exposes data-middle-final', () => {
    const { container } = render(
      <ChartLineDonchianMid data={constBar(30, 12, 8, 10)} />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-donchian-mid"]',
    );
    expect(root?.getAttribute('data-middle-final')).toBe('10');
  });

  it('exposes total-points', () => {
    const { container } = render(
      <ChartLineDonchianMid data={constBar(30)} />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-donchian-mid"]',
    );
    expect(root?.getAttribute('data-total-points')).toBe('30');
  });

  it('renders the screen-reader description', () => {
    const { container } = render(
      <ChartLineDonchianMid data={constBar(30)} />,
    );
    const desc = container.querySelector(
      '[data-section="chart-line-donchian-mid-aria-desc"]',
    );
    expect(desc?.textContent).toContain('Donchian Channel midline');
  });

  it('renders four legend items', () => {
    const { container } = render(
      <ChartLineDonchianMid data={constBar(30)} />,
    );
    expect(container.querySelector('[data-series-id="price"]')).toBeTruthy();
    expect(container.querySelector('[data-series-id="middle"]')).toBeTruthy();
    expect(container.querySelector('[data-series-id="upper"]')).toBeTruthy();
    expect(container.querySelector('[data-series-id="lower"]')).toBeTruthy();
  });

  it('toggles a series via the legend', () => {
    const onToggle = vi.fn();
    const { container } = render(
      <ChartLineDonchianMid
        data={constBar(30)}
        onSeriesToggle={onToggle}
      />,
    );
    const button = container.querySelector(
      '[data-series-id="middle"]',
    ) as HTMLButtonElement | null;
    if (button) fireEvent.click(button);
    expect(onToggle).toHaveBeenCalledWith({
      seriesId: 'middle',
      hidden: true,
    });
  });

  it('respects controlled hiddenSeries', () => {
    const { container } = render(
      <ChartLineDonchianMid
        data={constBar(30)}
        hiddenSeries={['middle']}
      />,
    );
    const button = container.querySelector('[data-series-id="middle"]');
    expect(button?.getAttribute('data-hidden')).toBe('true');
  });

  it('hides middle line when controlled hidden', () => {
    const { container } = render(
      <ChartLineDonchianMid
        data={constBar(30)}
        hiddenSeries={['middle']}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-donchian-mid-middle-path"]',
      ),
    ).toBe(null);
  });

  it('fires onPointClick on marker activation', () => {
    const onPointClick = vi.fn();
    const { container } = render(
      <ChartLineDonchianMid
        data={constBar(30)}
        onPointClick={onPointClick}
      />,
    );
    const markers = container.querySelectorAll(
      '[data-section="chart-line-donchian-mid-marker"]',
    );
    expect(markers.length).toBeGreaterThan(0);
    fireEvent.click(markers[0]!);
    expect(onPointClick).toHaveBeenCalled();
  });

  it('responds to Enter key on markers', () => {
    const onPointClick = vi.fn();
    const { container } = render(
      <ChartLineDonchianMid
        data={constBar(30)}
        onPointClick={onPointClick}
      />,
    );
    const marker = container.querySelector(
      '[data-section="chart-line-donchian-mid-marker"]',
    ) as SVGElement | null;
    if (marker) fireEvent.keyDown(marker, { key: 'Enter' });
    expect(onPointClick).toHaveBeenCalled();
  });

  it('responds to Space key on markers', () => {
    const onPointClick = vi.fn();
    const { container } = render(
      <ChartLineDonchianMid
        data={constBar(30)}
        onPointClick={onPointClick}
      />,
    );
    const marker = container.querySelector(
      '[data-section="chart-line-donchian-mid-marker"]',
    ) as SVGElement | null;
    if (marker) fireEvent.keyDown(marker, { key: ' ' });
    expect(onPointClick).toHaveBeenCalled();
  });

  it('renders the config badge by default', () => {
    const { container } = render(
      <ChartLineDonchianMid data={constBar(30)} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-donchian-mid-badge"]',
      ),
    ).toBeTruthy();
  });

  it('hides the config badge when disabled', () => {
    const { container } = render(
      <ChartLineDonchianMid
        data={constBar(30)}
        showConfigBadge={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-donchian-mid-badge"]',
      ),
    ).toBe(null);
  });

  it('renders dots when showDots is true', () => {
    const { container } = render(
      <ChartLineDonchianMid data={constBar(30)} showDots={true} />,
    );
    expect(
      container.querySelectorAll(
        '[data-section="chart-line-donchian-mid-dot"]',
      ).length,
    ).toBeGreaterThan(0);
  });

  it('does not render dots by default', () => {
    const { container } = render(
      <ChartLineDonchianMid data={constBar(30)} />,
    );
    expect(
      container.querySelectorAll(
        '[data-section="chart-line-donchian-mid-dot"]',
      ).length,
    ).toBe(0);
  });

  it('hides axis when showAxis is false', () => {
    const { container } = render(
      <ChartLineDonchianMid
        data={constBar(30)}
        showAxis={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-donchian-mid-axes"]',
      ),
    ).toBe(null);
  });

  it('hides grid when showGrid is false', () => {
    const { container } = render(
      <ChartLineDonchianMid
        data={constBar(30)}
        showGrid={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-donchian-mid-grid"]',
      ),
    ).toBe(null);
  });

  it('hides markers when showMarkers is false', () => {
    const { container } = render(
      <ChartLineDonchianMid
        data={constBar(30)}
        showMarkers={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-donchian-mid-markers"]',
      ),
    ).toBe(null);
  });

  it('hides legend when showLegend is false', () => {
    const { container } = render(
      <ChartLineDonchianMid
        data={constBar(30)}
        showLegend={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-donchian-mid-legend"]',
      ),
    ).toBe(null);
  });

  it('hides upper line when showUpper is false', () => {
    const { container } = render(
      <ChartLineDonchianMid
        data={constBar(30)}
        showUpper={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-donchian-mid-upper-path"]',
      ),
    ).toBe(null);
  });

  it('hides lower line when showLower is false', () => {
    const { container } = render(
      <ChartLineDonchianMid
        data={constBar(30)}
        showLower={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-donchian-mid-lower-path"]',
      ),
    ).toBe(null);
  });

  it('hides channel fill when showChannelFill is false', () => {
    const { container } = render(
      <ChartLineDonchianMid
        data={constBar(30)}
        showChannelFill={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-donchian-mid-channel-fill"]',
      ),
    ).toBe(null);
  });

  it('respects a custom formatMiddle', () => {
    const fmt = (v: number) => `[M:${v.toFixed(2)}]`;
    const { container } = render(
      <ChartLineDonchianMid
        data={constBar(30)}
        formatMiddle={fmt}
      />,
    );
    const marker = container.querySelector(
      '[data-section="chart-line-donchian-mid-marker"]',
    ) as SVGElement | null;
    if (marker) fireEvent.mouseEnter(marker);
    const text = container.textContent ?? '';
    expect(text).toMatch(/\[M:-?\d/);
  });

  it('applies className and style', () => {
    const { container } = render(
      <ChartLineDonchianMid
        data={constBar(30)}
        className="custom-class"
        style={{ background: 'red' }}
      />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-donchian-mid"]',
    );
    expect(root?.classList.contains('custom-class')).toBe(true);
    expect((root as HTMLElement | null)?.style.background).toBe('red');
  });

  it('exposes data-animate attribute', () => {
    const { container } = render(
      <ChartLineDonchianMid data={constBar(30)} animate={true} />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-donchian-mid"]',
    );
    expect(root?.getAttribute('data-animate')).toBe('true');
  });

  it('animate=false disables fade-in class', () => {
    const { container } = render(
      <ChartLineDonchianMid data={constBar(30)} animate={false} />,
    );
    const svg = container.querySelector(
      '[data-section="chart-line-donchian-mid-svg"]',
    );
    expect(svg?.classList.contains('motion-safe:animate-fade-in')).toBe(false);
  });

  it('renders the middle line by default', () => {
    const { container } = render(
      <ChartLineDonchianMid data={constBar(30)} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-donchian-mid-middle-path"]',
      ),
    ).toBeTruthy();
  });

  it('renders the price path', () => {
    const { container } = render(
      <ChartLineDonchianMid data={constBar(30)} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-donchian-mid-price-path"]',
      ),
    ).toBeTruthy();
  });

  it('respects defaultHiddenSeries on uncontrolled mount', () => {
    const { container } = render(
      <ChartLineDonchianMid
        data={constBar(30)}
        defaultHiddenSeries={['middle']}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-donchian-mid-middle-path"]',
      ),
    ).toBe(null);
  });

  it('hovering a marker shows the tooltip', () => {
    const { container } = render(
      <ChartLineDonchianMid data={constBar(30)} />,
    );
    const marker = container.querySelector(
      '[data-section="chart-line-donchian-mid-marker"]',
    ) as SVGElement | null;
    if (marker) fireEvent.mouseEnter(marker);
    expect(
      container.querySelector(
        '[data-section="chart-line-donchian-mid-tooltip"]',
      ),
    ).toBeTruthy();
  });

  it('tooltip vanishes on mouseLeave', () => {
    const { container } = render(
      <ChartLineDonchianMid data={constBar(30)} />,
    );
    const marker = container.querySelector(
      '[data-section="chart-line-donchian-mid-marker"]',
    ) as SVGElement | null;
    if (marker) {
      fireEvent.mouseEnter(marker);
      fireEvent.mouseLeave(marker);
    }
    expect(
      container.querySelector(
        '[data-section="chart-line-donchian-mid-tooltip"]',
      ),
    ).toBe(null);
  });

  it('tooltip respects showTooltip=false', () => {
    const { container } = render(
      <ChartLineDonchianMid
        data={constBar(30)}
        showTooltip={false}
      />,
    );
    const marker = container.querySelector(
      '[data-section="chart-line-donchian-mid-marker"]',
    ) as SVGElement | null;
    if (marker) fireEvent.mouseEnter(marker);
    expect(
      container.querySelector(
        '[data-section="chart-line-donchian-mid-tooltip"]',
      ),
    ).toBe(null);
  });
});

describe('Donchian midline integration', () => {
  it('CONST_BAR yields middle = (H+L)/2 across (H, L, length) combos', () => {
    for (const { H, L } of [
      { H: 12, L: 8 },
      { H: 10, L: 6 },
      { H: 100, L: 50 },
      { H: 4, L: 2 },
    ]) {
      for (const L_ of [3, 5, 7, 14, 20]) {
        const bars = constBar(L_ + 10, H, L, (H + L) / 2).map((p) => ({
          high: p.high,
          low: p.low,
          close: p.close,
        }));
        const ch = computeLineDonchianMid(bars, { length: L_ });
        for (let i = L_ - 1; i < bars.length; i += 1) {
          expect(ch.middle[i]).toBe((H + L) / 2);
        }
      }
    }
  });

  it('CONST_FLAT yields middle = K across many K values', () => {
    for (const K of [0, 1, 5, 100, -3]) {
      const bars = constFlat(30, K).map((p) => ({
        high: p.high,
        low: p.low,
        close: p.close,
      }));
      const ch = computeLineDonchianMid(bars, { length: 20 });
      for (let i = 19; i < 30; i += 1) {
        expect(ch.middle[i]).toBe(K);
      }
    }
  });
});
