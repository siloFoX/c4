import { describe, expect, it, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { createRef } from 'react';
import {
  ChartLineAtrMultiplier,
  applyLineAtrMultiplierAtr,
  applyLineAtrMultiplierCloseRange,
  applyLineAtrMultiplierTrueRange,
  classifyLineAtrMultiplierZone,
  computeLineAtrMultiplier,
  computeLineAtrMultiplierLayout,
  describeLineAtrMultiplierChart,
  detectLineAtrMultiplierCrosses,
  getLineAtrMultiplierFinitePoints,
  normalizeLineAtrMultiplierAtrLength,
  normalizeLineAtrMultiplierLength,
  normalizeLineAtrMultiplierThreshold,
  runLineAtrMultiplier,
  DEFAULT_CHART_LINE_ATR_MULTIPLIER_LENGTH,
} from './chart-line-atr-multiplier';
import type { ChartLineAtrMultiplierPoint } from './chart-line-atr-multiplier';

const constBar = (
  count: number,
  K: number,
): ChartLineAtrMultiplierPoint[] =>
  Array.from({ length: count }, (_, i) => ({
    x: i,
    high: K,
    low: K,
    close: K,
  }));

// LINEAR close=k+1 with high=low=close so TR[i>=1]=1, TR[0]=0.
const linearBar = (count: number): ChartLineAtrMultiplierPoint[] =>
  Array.from({ length: count }, (_, i) => ({
    x: i,
    high: i + 1,
    low: i + 1,
    close: i + 1,
  }));

describe('getLineAtrMultiplierFinitePoints', () => {
  it('returns an empty array for null', () => {
    expect(getLineAtrMultiplierFinitePoints(null)).toEqual([]);
  });

  it('drops non-finite high', () => {
    const result = getLineAtrMultiplierFinitePoints([
      { x: 0, high: Number.NaN, low: 5, close: 7 },
      { x: 1, high: 10, low: 5, close: 7 },
    ]);
    expect(result.length).toBe(1);
  });

  it('drops null entries', () => {
    const result = getLineAtrMultiplierFinitePoints([
      null as unknown as ChartLineAtrMultiplierPoint,
      { x: 1, high: 10, low: 5, close: 7 },
    ]);
    expect(result.length).toBe(1);
  });
});

describe('normalizeLineAtrMultiplierLength', () => {
  it('returns default when undefined', () => {
    expect(normalizeLineAtrMultiplierLength(undefined, 14)).toBe(14);
  });

  it('rejects below 2', () => {
    expect(normalizeLineAtrMultiplierLength(1, 14)).toBe(14);
  });
});

describe('normalizeLineAtrMultiplierAtrLength', () => {
  it('returns default when undefined', () => {
    expect(normalizeLineAtrMultiplierAtrLength(undefined, 14)).toBe(14);
  });

  it('accepts 1', () => {
    expect(normalizeLineAtrMultiplierAtrLength(1, 14)).toBe(1);
  });

  it('rejects zero', () => {
    expect(normalizeLineAtrMultiplierAtrLength(0, 14)).toBe(14);
  });
});

describe('normalizeLineAtrMultiplierThreshold', () => {
  it('returns default when undefined', () => {
    expect(normalizeLineAtrMultiplierThreshold(undefined, 1.5)).toBe(1.5);
  });

  it('accepts zero', () => {
    expect(normalizeLineAtrMultiplierThreshold(0, 1.5)).toBe(0);
  });

  it('rejects negative', () => {
    expect(normalizeLineAtrMultiplierThreshold(-1, 1.5)).toBe(1.5);
  });
});

describe('applyLineAtrMultiplierCloseRange', () => {
  it('CONST K closeRange is 0 bit-exact', () => {
    for (const K of [0, 1, 5, 100, -3]) {
      const out = applyLineAtrMultiplierCloseRange(Array(10).fill(K), 4);
      for (let i = 3; i < 10; i += 1) {
        expect(out[i]).toBe(0);
      }
    }
  });

  it('LINEAR k+1 closeRange is length-1 bit-exact', () => {
    const closes = Array.from({ length: 10 }, (_, i) => i + 1);
    const out = applyLineAtrMultiplierCloseRange(closes, 5);
    for (let i = 4; i < 10; i += 1) {
      expect(out[i]).toBe(4);
    }
  });

  it('warmup region is null', () => {
    const out = applyLineAtrMultiplierCloseRange([1, 2, 3, 4, 5], 4);
    expect(out[0]).toBe(null);
    expect(out[2]).toBe(null);
    expect(out[3]).toBe(3);
  });
});

describe('applyLineAtrMultiplierTrueRange', () => {
  it('CONST h=l=c yields TR = 0 bit-exact', () => {
    const series = constBar(5, 10);
    const out = applyLineAtrMultiplierTrueRange(series);
    for (let i = 0; i < 5; i += 1) {
      expect(out[i]).toBe(0);
    }
  });

  it('LINEAR k+1 h=l=close yields TR[0]=0, TR[i>=1]=1', () => {
    const series = linearBar(5);
    const out = applyLineAtrMultiplierTrueRange(series);
    expect(out[0]).toBe(0);
    for (let i = 1; i < 5; i += 1) {
      expect(out[i]).toBe(1);
    }
  });

  it('first bar uses h-l (no prev close)', () => {
    const series: ChartLineAtrMultiplierPoint[] = [
      { x: 0, high: 12, low: 8, close: 10 },
    ];
    const out = applyLineAtrMultiplierTrueRange(series);
    expect(out[0]).toBe(4);
  });
});

describe('applyLineAtrMultiplierAtr', () => {
  it('CONST TR yields ATR = 0', () => {
    const out = applyLineAtrMultiplierAtr(Array(10).fill(0), 4);
    for (let i = 3; i < 10; i += 1) {
      expect(out[i]).toBe(0);
    }
  });

  it('CONST TR=1 yields ATR = 1', () => {
    const out = applyLineAtrMultiplierAtr(Array(10).fill(1), 4);
    for (let i = 3; i < 10; i += 1) {
      expect(out[i]).toBe(1);
    }
  });
});

describe('computeLineAtrMultiplier', () => {
  it('returns empty for null', () => {
    const ch = computeLineAtrMultiplier(null);
    expect(ch.ratio).toEqual([]);
  });

  it('returns empty for empty input', () => {
    const ch = computeLineAtrMultiplier([]);
    expect(ch.ratio).toEqual([]);
  });

  it('CONST h=l=c=K yields ratio = null (band has zero width)', () => {
    for (const K of [0, 1, 5, 100, -3]) {
      const series = constBar(15, K);
      const ch = computeLineAtrMultiplier(series, {
        length: 4,
        atrLength: 4,
      });
      for (let i = 3; i < 15; i += 1) {
        expect(ch.closeRange[i]).toBe(0);
        expect(ch.atr[i]).toBe(0);
        expect(ch.ratio[i]).toBe(null);
      }
    }
  });

  it('LINEAR k+1 yields ratio = length-1 bit-exact post-warmup', () => {
    for (const L of [4, 5, 7, 10]) {
      const series = linearBar(L + 5);
      const ch = computeLineAtrMultiplier(series, {
        length: L,
        atrLength: L,
      });
      // closeRange[i] for i >= L-1 = L-1.
      // ATR[i] for i >= L starts as 1 (TR[0]=0 fell out of window).
      // So ratio at i=L equals (L-1)/1 = L-1.
      expect(ch.ratio[L]).toBe(L - 1);
    }
  });

  it('LINEAR k+1 atrLength=4 length=5: ratio = 4 at bar 5', () => {
    const series = linearBar(10);
    const ch = computeLineAtrMultiplier(series, {
      length: 5,
      atrLength: 4,
    });
    // At bar 5: closeRange = 4 (closes [2..6]: max-min = 4),
    // ATR = mean(TR[2..5]) = mean(1,1,1,1) = 1 -> ratio = 4.
    expect(ch.ratio[5]).toBe(4);
  });

  it('warmup region is null', () => {
    const series = constBar(15, 10);
    const ch = computeLineAtrMultiplier(series, { length: 4 });
    expect(ch.closeRange[0]).toBe(null);
    expect(ch.atr[0]).toBe(null);
    expect(ch.ratio[0]).toBe(null);
  });

  it('output length matches input length', () => {
    const series = constBar(15, 10);
    const ch = computeLineAtrMultiplier(series, { length: 4 });
    expect(ch.closeRange.length).toBe(15);
    expect(ch.atr.length).toBe(15);
    expect(ch.ratio.length).toBe(15);
  });

  it('does not mutate input', () => {
    const series = linearBar(15);
    const snap = JSON.parse(JSON.stringify(series));
    computeLineAtrMultiplier(series, { length: 5 });
    expect(series).toEqual(snap);
  });
});

describe('classifyLineAtrMultiplierZone', () => {
  it('classifies high', () => {
    expect(classifyLineAtrMultiplierZone(2, 1.5, 0.5)).toBe('high');
  });

  it('classifies normal', () => {
    expect(classifyLineAtrMultiplierZone(1, 1.5, 0.5)).toBe('normal');
  });

  it('classifies low', () => {
    expect(classifyLineAtrMultiplierZone(0.3, 1.5, 0.5)).toBe('low');
  });

  it('classifies flat at zero', () => {
    expect(classifyLineAtrMultiplierZone(0, 1.5, 0.5)).toBe('flat');
  });

  it('returns none for null', () => {
    expect(classifyLineAtrMultiplierZone(null, 1.5, 0.5)).toBe('none');
  });
});

describe('detectLineAtrMultiplierCrosses', () => {
  it('returns [null, null] for warmup', () => {
    expect(detectLineAtrMultiplierCrosses([null, null], 1.5, 0.5)).toEqual([
      null,
      null,
    ]);
  });

  it('flags up when entering high zone', () => {
    const ev = detectLineAtrMultiplierCrosses([null, 1.0, 2.0], 1.5, 0.5);
    expect(ev[2]).toBe('up');
  });

  it('flags down when entering low zone', () => {
    const ev = detectLineAtrMultiplierCrosses([null, 1.0, 0.3], 1.5, 0.5);
    expect(ev[2]).toBe('down');
  });

  it('first defined bar is not a cross', () => {
    const ev = detectLineAtrMultiplierCrosses([null, 2.0], 1.5, 0.5);
    expect(ev[1]).toBe(null);
  });
});

describe('runLineAtrMultiplier', () => {
  it('marks ok=false for short data', () => {
    const run = runLineAtrMultiplier(constBar(3, 10), {
      length: 4,
      atrLength: 4,
    });
    expect(run.ok).toBe(false);
  });

  it('marks ok=true with enough data', () => {
    const run = runLineAtrMultiplier(constBar(4, 10), {
      length: 4,
      atrLength: 4,
    });
    expect(run.ok).toBe(true);
  });

  it('uses default parameters', () => {
    const run = runLineAtrMultiplier(constBar(30, 10));
    expect(run.length).toBe(DEFAULT_CHART_LINE_ATR_MULTIPLIER_LENGTH);
    expect(run.atrLength).toBe(14);
    expect(run.highThreshold).toBe(1.5);
    expect(run.lowThreshold).toBe(0.5);
  });

  it('respects explicit options', () => {
    const run = runLineAtrMultiplier(constBar(30, 10), {
      length: 7,
      atrLength: 5,
      highThreshold: 2,
      lowThreshold: 0.3,
    });
    expect(run.length).toBe(7);
    expect(run.atrLength).toBe(5);
    expect(run.highThreshold).toBe(2);
    expect(run.lowThreshold).toBe(0.3);
  });

  it('sorts by x', () => {
    const data: ChartLineAtrMultiplierPoint[] = [
      { x: 2, high: 10, low: 10, close: 10 },
      { x: 0, high: 10, low: 10, close: 10 },
      { x: 1, high: 10, low: 10, close: 10 },
    ];
    const run = runLineAtrMultiplier(data, { length: 2, atrLength: 2 });
    expect(run.samples.map((s) => s.x)).toEqual([0, 1, 2]);
  });

  it('CONST close classifies post-warmup as none (ATR=0)', () => {
    const run = runLineAtrMultiplier(constBar(20, 10), {
      length: 4,
      atrLength: 4,
    });
    expect(run.noneCount).toBe(20);
    expect(run.flatCount).toBe(0);
  });

  it('LINEAR k+1 length=5 atrLength=4 classifies post-warmup as high (ratio=4)', () => {
    const run = runLineAtrMultiplier(linearBar(15), {
      length: 5,
      atrLength: 4,
    });
    // Ratio = 4 >= highThreshold (1.5) -> high zone for valid bars.
    expect(run.highCount).toBeGreaterThan(0);
  });
});

describe('computeLineAtrMultiplierLayout', () => {
  it('returns ok=false for empty data', () => {
    const layout = computeLineAtrMultiplierLayout({ data: [] });
    expect(layout.ok).toBe(false);
  });

  it('returns ok=true for sufficient data', () => {
    const layout = computeLineAtrMultiplierLayout({
      data: constBar(30, 10),
    });
    expect(layout.ok).toBe(true);
  });

  it('panels stack with price above ratio', () => {
    const layout = computeLineAtrMultiplierLayout({
      data: constBar(30, 10),
    });
    expect(layout.priceBottom).toBeLessThan(layout.ratioTop);
  });

  it('panel gap is respected', () => {
    const layout = computeLineAtrMultiplierLayout({
      data: constBar(30, 10),
      panelGap: 24,
    });
    expect(layout.ratioTop - layout.priceBottom).toBeCloseTo(24, 9);
  });

  it('produces a price path and dots', () => {
    const layout = computeLineAtrMultiplierLayout({
      data: constBar(30, 10),
    });
    expect(layout.pricePath.startsWith('M')).toBe(true);
    expect(layout.priceDots.length).toBe(30);
  });

  it('y range includes both thresholds', () => {
    const layout = computeLineAtrMultiplierLayout({
      data: constBar(30, 10),
      highThreshold: 2,
      lowThreshold: 0.5,
    });
    expect(layout.ratioMax).toBeGreaterThanOrEqual(2);
    expect(layout.ratioMin).toBe(0);
  });

  it('threshold lines are within ratio panel bounds', () => {
    const layout = computeLineAtrMultiplierLayout({
      data: constBar(30, 10),
    });
    expect(layout.highThresholdY).toBeGreaterThanOrEqual(layout.ratioTop);
    expect(layout.highThresholdY).toBeLessThanOrEqual(layout.ratioBottom);
    expect(layout.lowThresholdY).toBeGreaterThanOrEqual(layout.ratioTop);
    expect(layout.lowThresholdY).toBeLessThanOrEqual(layout.ratioBottom);
  });

  it('handles a single point gracefully', () => {
    const layout = computeLineAtrMultiplierLayout({
      data: [{ x: 0, high: 10, low: 10, close: 10 }],
    });
    expect(layout.ok).toBe(false);
  });
});

describe('describeLineAtrMultiplierChart', () => {
  it('returns No data for empty input', () => {
    expect(describeLineAtrMultiplierChart([])).toBe('No data');
  });

  it('mentions volatility ratio', () => {
    const desc = describeLineAtrMultiplierChart(constBar(30, 10));
    expect(desc).toContain('volatility ratio');
  });

  it('reports parameters', () => {
    const desc = describeLineAtrMultiplierChart(constBar(30, 10), {
      length: 7,
      atrLength: 5,
      highThreshold: 2,
      lowThreshold: 0.3,
    });
    expect(desc).toContain('length 7');
    expect(desc).toContain('atrLength 5');
    expect(desc).toContain('highThreshold 2');
    expect(desc).toContain('lowThreshold 0.3');
  });
});

describe('<ChartLineAtrMultiplier />', () => {
  it('renders an empty placeholder for no data', () => {
    const { container } = render(<ChartLineAtrMultiplier data={[]} />);
    const placeholder = container.querySelector(
      '[data-section="chart-line-atr-multiplier-empty"]',
    );
    expect(placeholder?.textContent).toBe('No data');
  });

  it('renders region role with aria-label', () => {
    const { container } = render(
      <ChartLineAtrMultiplier data={constBar(30, 10)} />,
    );
    const region = container.querySelector('[role="region"]');
    expect(region).toBeTruthy();
    expect(region?.getAttribute('aria-label')).toContain('ATR Multiplier');
  });

  it('forwards ref', () => {
    const ref = createRef<HTMLDivElement>();
    render(<ChartLineAtrMultiplier data={constBar(30, 10)} ref={ref} />);
    expect(ref.current).not.toBe(null);
  });

  it('exposes data attrs', () => {
    const { container } = render(
      <ChartLineAtrMultiplier
        data={constBar(30, 10)}
        length={7}
        atrLength={5}
        highThreshold={2}
        lowThreshold={0.3}
      />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-atr-multiplier"]',
    );
    expect(root?.getAttribute('data-length')).toBe('7');
    expect(root?.getAttribute('data-atr-length')).toBe('5');
    expect(root?.getAttribute('data-high-threshold')).toBe('2');
    expect(root?.getAttribute('data-low-threshold')).toBe('0.3');
  });

  it('exposes total-points', () => {
    const { container } = render(
      <ChartLineAtrMultiplier data={constBar(30, 10)} />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-atr-multiplier"]',
    );
    expect(root?.getAttribute('data-total-points')).toBe('30');
  });

  it('renders the screen-reader description', () => {
    const { container } = render(
      <ChartLineAtrMultiplier data={constBar(30, 10)} />,
    );
    const desc = container.querySelector(
      '[data-section="chart-line-atr-multiplier-aria-desc"]',
    );
    expect(desc?.textContent).toContain('volatility ratio');
  });

  it('renders both legend items', () => {
    const { container } = render(
      <ChartLineAtrMultiplier data={constBar(30, 10)} />,
    );
    expect(container.querySelector('[data-series-id="price"]')).toBeTruthy();
    expect(container.querySelector('[data-series-id="ratio"]')).toBeTruthy();
  });

  it('toggles a series via the legend', () => {
    const onToggle = vi.fn();
    const { container } = render(
      <ChartLineAtrMultiplier
        data={constBar(30, 10)}
        onSeriesToggle={onToggle}
      />,
    );
    const button = container.querySelector(
      '[data-series-id="ratio"]',
    ) as HTMLButtonElement | null;
    if (button) fireEvent.click(button);
    expect(onToggle).toHaveBeenCalledWith({
      seriesId: 'ratio',
      hidden: true,
    });
  });

  it('hides ratio when controlled hidden', () => {
    const { container } = render(
      <ChartLineAtrMultiplier
        data={constBar(30, 10)}
        hiddenSeries={['ratio']}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-atr-multiplier-line"]',
      ),
    ).toBe(null);
  });

  it('renders the config badge by default', () => {
    const { container } = render(
      <ChartLineAtrMultiplier data={constBar(30, 10)} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-atr-multiplier-badge"]',
      ),
    ).toBeTruthy();
  });

  it('renders both threshold lines by default', () => {
    const { container } = render(
      <ChartLineAtrMultiplier data={constBar(30, 10)} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-atr-multiplier-high-threshold-line"]',
      ),
    ).toBeTruthy();
    expect(
      container.querySelector(
        '[data-section="chart-line-atr-multiplier-low-threshold-line"]',
      ),
    ).toBeTruthy();
  });

  it('hides thresholds when showThresholds is false', () => {
    const { container } = render(
      <ChartLineAtrMultiplier
        data={constBar(30, 10)}
        showThresholds={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-atr-multiplier-high-threshold-line"]',
      ),
    ).toBe(null);
  });

  it('hides axis when showAxis is false', () => {
    const { container } = render(
      <ChartLineAtrMultiplier
        data={constBar(30, 10)}
        showAxis={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-atr-multiplier-axes"]',
      ),
    ).toBe(null);
  });

  it('hides grid when showGrid is false', () => {
    const { container } = render(
      <ChartLineAtrMultiplier
        data={constBar(30, 10)}
        showGrid={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-atr-multiplier-grid"]',
      ),
    ).toBe(null);
  });

  it('hides markers when showMarkers is false', () => {
    const { container } = render(
      <ChartLineAtrMultiplier
        data={constBar(30, 10)}
        showMarkers={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-atr-multiplier-markers"]',
      ),
    ).toBe(null);
  });

  it('hides legend when showLegend is false', () => {
    const { container } = render(
      <ChartLineAtrMultiplier
        data={constBar(30, 10)}
        showLegend={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-atr-multiplier-legend"]',
      ),
    ).toBe(null);
  });

  it('applies className and style', () => {
    const { container } = render(
      <ChartLineAtrMultiplier
        data={constBar(30, 10)}
        className="custom-class"
        style={{ background: 'red' }}
      />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-atr-multiplier"]',
    );
    expect(root?.classList.contains('custom-class')).toBe(true);
    expect((root as HTMLElement | null)?.style.background).toBe('red');
  });

  it('animate=false disables fade-in class', () => {
    const { container } = render(
      <ChartLineAtrMultiplier data={constBar(30, 10)} animate={false} />,
    );
    const svg = container.querySelector(
      '[data-section="chart-line-atr-multiplier-svg"]',
    );
    expect(svg?.classList.contains('motion-safe:animate-fade-in')).toBe(false);
  });

  it('renders the ratio line by default', () => {
    const { container } = render(
      <ChartLineAtrMultiplier data={constBar(30, 10)} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-atr-multiplier-line"]',
      ),
    ).toBeTruthy();
  });

  it('renders the price path', () => {
    const { container } = render(
      <ChartLineAtrMultiplier data={constBar(30, 10)} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-atr-multiplier-price-path"]',
      ),
    ).toBeTruthy();
  });

  it('respects defaultHiddenSeries on uncontrolled mount', () => {
    const { container } = render(
      <ChartLineAtrMultiplier
        data={constBar(30, 10)}
        defaultHiddenSeries={['ratio']}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-atr-multiplier-line"]',
      ),
    ).toBe(null);
  });
});

describe('ATR Multiplier integration', () => {
  it('CONST h=l=c=K yields ratio = null across (K, length)', () => {
    for (const K of [0, 1, 5, 100, -3]) {
      for (const L of [3, 4, 7, 10]) {
        const series = constBar(L + 5, K);
        const ch = computeLineAtrMultiplier(series, {
          length: L,
          atrLength: L,
        });
        for (let i = L - 1; i < L + 5; i += 1) {
          expect(ch.ratio[i]).toBe(null);
        }
      }
    }
  });

  it('LINEAR k+1 yields ratio = length-1 across length sweep', () => {
    for (const L of [4, 5, 7, 10]) {
      const series = linearBar(L + 5);
      const ch = computeLineAtrMultiplier(series, {
        length: L,
        atrLength: L,
      });
      expect(ch.ratio[L]).toBe(L - 1);
    }
  });
});
