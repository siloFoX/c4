import { describe, expect, it, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { createRef } from 'react';
import {
  ChartLineMomentumRoc,
  classifyLineMomentumRocZone,
  computeLineMomentumRoc,
  computeLineMomentumRocLayout,
  describeLineMomentumRocChart,
  getLineMomentumRocFinitePoints,
  normalizeLineMomentumRocLength,
  runLineMomentumRoc,
  DEFAULT_CHART_LINE_MOMENTUM_ROC_LENGTH,
} from './chart-line-momentum-roc';
import type { ChartLineMomentumRocPoint } from './chart-line-momentum-roc';

const constClose = (
  count: number,
  K: number,
): ChartLineMomentumRocPoint[] =>
  Array.from({ length: count }, (_, i) => ({ x: i, close: K }));

const geometric = (
  count: number,
  base = 2,
): ChartLineMomentumRocPoint[] =>
  Array.from({ length: count }, (_, i) => ({
    x: i,
    close: Math.pow(base, i),
  }));

describe('getLineMomentumRocFinitePoints', () => {
  it('returns an empty array for null', () => {
    expect(getLineMomentumRocFinitePoints(null)).toEqual([]);
  });

  it('returns an empty array for undefined', () => {
    expect(getLineMomentumRocFinitePoints(undefined)).toEqual([]);
  });

  it('drops non-finite x', () => {
    const result = getLineMomentumRocFinitePoints([
      { x: 1, close: 10 },
      { x: Number.NaN, close: 10 },
    ]);
    expect(result.length).toBe(1);
  });

  it('drops non-finite close', () => {
    const result = getLineMomentumRocFinitePoints([
      { x: 0, close: Number.NaN },
      { x: 1, close: 10 },
    ]);
    expect(result.length).toBe(1);
  });

  it('drops null entries', () => {
    const result = getLineMomentumRocFinitePoints([
      null as unknown as ChartLineMomentumRocPoint,
      { x: 1, close: 10 },
    ]);
    expect(result.length).toBe(1);
  });
});

describe('normalizeLineMomentumRocLength', () => {
  it('returns the default when undefined', () => {
    expect(normalizeLineMomentumRocLength(undefined, 10)).toBe(10);
  });

  it('floors fractional lengths', () => {
    expect(normalizeLineMomentumRocLength(7.9, 10)).toBe(7);
  });

  it('rejects length below 1', () => {
    expect(normalizeLineMomentumRocLength(0, 10)).toBe(10);
  });

  it('accepts length 1', () => {
    expect(normalizeLineMomentumRocLength(1, 10)).toBe(1);
  });
});

describe('computeLineMomentumRoc', () => {
  it('returns empty for null', () => {
    expect(computeLineMomentumRoc(null)).toEqual([]);
  });

  it('returns empty for empty input', () => {
    expect(computeLineMomentumRoc([])).toEqual([]);
  });

  it('nulls warmup bars (i < length)', () => {
    const closes = Array(20).fill(10);
    const out = computeLineMomentumRoc(closes, { length: 10 });
    for (let i = 0; i < 10; i += 1) {
      expect(out[i]).toBe(null);
    }
    expect(typeof out[10]).toBe('number');
  });

  it('CONST close (K != 0) yields ROC = 0 bit-exact past warmup', () => {
    for (const K of [1, 5, 100, -3, 7, -50, 2]) {
      const closes = Array(20).fill(K);
      const out = computeLineMomentumRoc(closes, { length: 10 });
      for (let i = 10; i < 20; i += 1) {
        expect(out[i]).toBe(0);
      }
    }
  });

  it('CONST close = 0 yields ROC = null (singular divide-by-zero)', () => {
    const closes = Array(20).fill(0);
    const out = computeLineMomentumRoc(closes, { length: 10 });
    for (let i = 0; i < 20; i += 1) {
      expect(out[i]).toBe(null);
    }
  });

  it('GEOMETRIC close = 2^i yields ROC = (2^L - 1) * 100 bit-exact', () => {
    for (const L of [2, 3, 4, 5]) {
      const closes = Array.from({ length: 15 }, (_, i) => Math.pow(2, i));
      const out = computeLineMomentumRoc(closes, { length: L });
      const expected = (Math.pow(2, L) - 1) * 100;
      for (let i = L; i < 15; i += 1) {
        expect(out[i]).toBe(expected);
      }
    }
  });

  it('output length matches input length', () => {
    const closes = Array(20).fill(10);
    const out = computeLineMomentumRoc(closes, { length: 10 });
    expect(out.length).toBe(20);
  });

  it('does not mutate input', () => {
    const closes = Array(20).fill(10);
    const snap = closes.slice();
    computeLineMomentumRoc(closes, { length: 10 });
    expect(closes).toEqual(snap);
  });

  it('rejects non-finite length (uses default)', () => {
    const closes = Array(30).fill(5);
    const out = computeLineMomentumRoc(closes, { length: Number.NaN });
    expect(out[10]).toBe(0);
  });

  it('explicit length 1 works (1-bar lookback)', () => {
    const closes = [1, 2, 4, 8, 16];
    const out = computeLineMomentumRoc(closes, { length: 1 });
    // ROC at i=1: (2-1)/1*100 = 100
    expect(out[0]).toBe(null);
    expect(out[1]).toBe(100);
    expect(out[2]).toBe(100);
    expect(out[3]).toBe(100);
    expect(out[4]).toBe(100);
  });

  it('null close yields null ROC at that bar and downstream lookbacks', () => {
    const closes = [1, 2, 3, null, 5, 6, 7];
    const out = computeLineMomentumRoc(closes, { length: 2 });
    // i=2: curr=3, past=1 -> 200
    expect(out[2]).toBe(200);
    // i=3: curr=null -> null
    expect(out[3]).toBe(null);
    // i=4: curr=5, past=3 -> 200/3 ~ 66.66
    expect(out[4]).toBeCloseTo(66.66666666666667, 9);
    // i=5: curr=6, past=null -> null
    expect(out[5]).toBe(null);
  });
});

describe('classifyLineMomentumRocZone', () => {
  it('classifies strong-up at >= 10', () => {
    expect(classifyLineMomentumRocZone(10)).toBe('strong-up');
    expect(classifyLineMomentumRocZone(100)).toBe('strong-up');
  });

  it('classifies above between 0 and 10', () => {
    expect(classifyLineMomentumRocZone(5)).toBe('above');
    expect(classifyLineMomentumRocZone(0.1)).toBe('above');
  });

  it('classifies at when value == 0', () => {
    expect(classifyLineMomentumRocZone(0)).toBe('at');
  });

  it('classifies below between -10 and 0', () => {
    expect(classifyLineMomentumRocZone(-5)).toBe('below');
    expect(classifyLineMomentumRocZone(-9.9)).toBe('below');
  });

  it('classifies strong-down at <= -10', () => {
    expect(classifyLineMomentumRocZone(-10)).toBe('strong-down');
    expect(classifyLineMomentumRocZone(-100)).toBe('strong-down');
  });

  it('returns none for null', () => {
    expect(classifyLineMomentumRocZone(null)).toBe('none');
  });

  it('returns none for NaN', () => {
    expect(classifyLineMomentumRocZone(Number.NaN)).toBe('none');
  });
});

describe('runLineMomentumRoc', () => {
  it('marks ok=false for fewer than length+1 points', () => {
    const run = runLineMomentumRoc(constClose(10, 5), { length: 10 });
    expect(run.ok).toBe(false);
  });

  it('marks ok=true with enough points', () => {
    const run = runLineMomentumRoc(constClose(20, 5), { length: 10 });
    expect(run.ok).toBe(true);
  });

  it('uses defaults when none is provided', () => {
    const run = runLineMomentumRoc(constClose(30, 5));
    expect(run.length).toBe(DEFAULT_CHART_LINE_MOMENTUM_ROC_LENGTH);
  });

  it('respects explicit options', () => {
    const run = runLineMomentumRoc(constClose(30, 5), { length: 7 });
    expect(run.length).toBe(7);
  });

  it('sorts by x', () => {
    const data: ChartLineMomentumRocPoint[] = [
      { x: 2, close: 10 },
      { x: 0, close: 10 },
      { x: 1, close: 10 },
    ];
    const run = runLineMomentumRoc(data, { length: 1 });
    expect(run.samples.map((s) => s.x)).toEqual([0, 1, 2]);
  });

  it('CONST close (K != 0) classifies post-warmup as at (ROC=0)', () => {
    const run = runLineMomentumRoc(constClose(20, 5));
    expect(run.atCount).toBe(20 - 10);
  });

  it('CONST close = 0 classifies all as none (singular)', () => {
    const run = runLineMomentumRoc(constClose(20, 0));
    expect(run.noneCount).toBe(20);
  });

  it('GEOMETRIC close = 2^i classifies post-warmup as strong-up', () => {
    const run = runLineMomentumRoc(geometric(15, 2), { length: 2 });
    // ROC = (2^2 - 1)*100 = 300 -> strong-up
    expect(run.strongUpCount).toBe(15 - 2);
  });

  it('exposes rocFinal as the last finite reading', () => {
    const run = runLineMomentumRoc(constClose(20, 5));
    expect(run.rocFinal).toBe(0);
  });

  it('rocFinal is null when there is no data', () => {
    const run = runLineMomentumRoc([]);
    expect(run.rocFinal).toBe(null);
  });
});

describe('computeLineMomentumRocLayout', () => {
  it('returns ok=false for empty data', () => {
    const layout = computeLineMomentumRocLayout({ data: [] });
    expect(layout.ok).toBe(false);
  });

  it('returns ok=true for sufficient data', () => {
    const layout = computeLineMomentumRocLayout({
      data: constClose(20, 5),
    });
    expect(layout.ok).toBe(true);
  });

  it('uses the explicit width and height', () => {
    const layout = computeLineMomentumRocLayout({
      data: constClose(20, 5),
      width: 600,
      height: 400,
    });
    expect(layout.width).toBe(600);
    expect(layout.height).toBe(400);
  });

  it('panels stack with price above roc', () => {
    const layout = computeLineMomentumRocLayout({ data: constClose(20, 5) });
    expect(layout.priceBottom).toBeLessThan(layout.rocTop);
  });

  it('panel gap is respected', () => {
    const layout = computeLineMomentumRocLayout({
      data: constClose(20, 5),
      panelGap: 24,
    });
    expect(layout.rocTop - layout.priceBottom).toBeCloseTo(24, 9);
  });

  it('produces a price path and dots', () => {
    const layout = computeLineMomentumRocLayout({ data: constClose(20, 5) });
    expect(layout.pricePath.startsWith('M')).toBe(true);
    expect(layout.priceDots.length).toBe(20);
  });

  it('produces a roc path and markers (skipping warmup)', () => {
    const layout = computeLineMomentumRocLayout({ data: constClose(20, 5) });
    expect(layout.markers.length).toBe(20 - 10);
  });

  it('zero baseline is inside the roc panel', () => {
    const layout = computeLineMomentumRocLayout({ data: constClose(20, 5) });
    expect(layout.zeroBaselineY).toBeGreaterThanOrEqual(layout.rocTop);
    expect(layout.zeroBaselineY).toBeLessThanOrEqual(layout.rocBottom);
  });

  it('handles a single point gracefully', () => {
    const layout = computeLineMomentumRocLayout({
      data: [{ x: 0, close: 10 }],
    });
    expect(layout.ok).toBe(false);
  });
});

describe('describeLineMomentumRocChart', () => {
  it('returns No data for empty input', () => {
    expect(describeLineMomentumRocChart([])).toBe('No data');
  });

  it('mentions Rate-of-Change', () => {
    const desc = describeLineMomentumRocChart(constClose(20, 5));
    expect(desc).toContain('Rate-of-Change');
  });

  it('mentions the formula', () => {
    const desc = describeLineMomentumRocChart(constClose(20, 5));
    expect(desc).toContain('close[i - length]');
  });

  it('reports the length', () => {
    const desc = describeLineMomentumRocChart(constClose(20, 5), { length: 7 });
    expect(desc).toContain('length 7');
  });

  it('reports the final reading', () => {
    const desc = describeLineMomentumRocChart(constClose(20, 5));
    expect(desc).toContain('0.0000');
  });
});

describe('<ChartLineMomentumRoc />', () => {
  it('renders an empty placeholder for no data', () => {
    const { container } = render(<ChartLineMomentumRoc data={[]} />);
    const placeholder = container.querySelector(
      '[data-section="chart-line-momentum-roc-empty"]',
    );
    expect(placeholder?.textContent).toBe('No data');
  });

  it('renders region role with aria-label', () => {
    const { container } = render(
      <ChartLineMomentumRoc data={constClose(20, 5)} />,
    );
    const region = container.querySelector('[role="region"]');
    expect(region).toBeTruthy();
    expect(region?.getAttribute('aria-label')).toContain('Momentum ROC');
  });

  it('forwards ref', () => {
    const ref = createRef<HTMLDivElement>();
    render(<ChartLineMomentumRoc data={constClose(20, 5)} ref={ref} />);
    expect(ref.current).not.toBe(null);
  });

  it('exposes data-length', () => {
    const { container } = render(
      <ChartLineMomentumRoc data={constClose(20, 5)} length={7} />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-momentum-roc"]',
    );
    expect(root?.getAttribute('data-length')).toBe('7');
  });

  it('exposes data-roc-final', () => {
    const { container } = render(
      <ChartLineMomentumRoc data={constClose(20, 5)} />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-momentum-roc"]',
    );
    expect(root?.getAttribute('data-roc-final')).toBe('0');
  });

  it('exposes total-points', () => {
    const { container } = render(
      <ChartLineMomentumRoc data={constClose(20, 5)} />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-momentum-roc"]',
    );
    expect(root?.getAttribute('data-total-points')).toBe('20');
  });

  it('renders the screen-reader description', () => {
    const { container } = render(
      <ChartLineMomentumRoc data={constClose(20, 5)} />,
    );
    const desc = container.querySelector(
      '[data-section="chart-line-momentum-roc-aria-desc"]',
    );
    expect(desc?.textContent).toContain('Rate-of-Change');
  });

  it('renders both legend items', () => {
    const { container } = render(
      <ChartLineMomentumRoc data={constClose(20, 5)} />,
    );
    expect(container.querySelector('[data-series-id="price"]')).toBeTruthy();
    expect(container.querySelector('[data-series-id="roc"]')).toBeTruthy();
  });

  it('toggles a series via the legend', () => {
    const onToggle = vi.fn();
    const { container } = render(
      <ChartLineMomentumRoc
        data={constClose(20, 5)}
        onSeriesToggle={onToggle}
      />,
    );
    const button = container.querySelector(
      '[data-series-id="roc"]',
    ) as HTMLButtonElement | null;
    if (button) fireEvent.click(button);
    expect(onToggle).toHaveBeenCalledWith({
      seriesId: 'roc',
      hidden: true,
    });
  });

  it('respects controlled hiddenSeries', () => {
    const { container } = render(
      <ChartLineMomentumRoc
        data={constClose(20, 5)}
        hiddenSeries={['roc']}
      />,
    );
    const button = container.querySelector('[data-series-id="roc"]');
    expect(button?.getAttribute('data-hidden')).toBe('true');
  });

  it('hides roc line when controlled hidden', () => {
    const { container } = render(
      <ChartLineMomentumRoc
        data={constClose(20, 5)}
        hiddenSeries={['roc']}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-momentum-roc-line"]',
      ),
    ).toBe(null);
  });

  it('fires onPointClick on marker activation', () => {
    const onPointClick = vi.fn();
    const { container } = render(
      <ChartLineMomentumRoc
        data={constClose(20, 5)}
        onPointClick={onPointClick}
      />,
    );
    const markers = container.querySelectorAll(
      '[data-section="chart-line-momentum-roc-marker"]',
    );
    expect(markers.length).toBeGreaterThan(0);
    fireEvent.click(markers[0]!);
    expect(onPointClick).toHaveBeenCalled();
  });

  it('responds to Enter key on markers', () => {
    const onPointClick = vi.fn();
    const { container } = render(
      <ChartLineMomentumRoc
        data={constClose(20, 5)}
        onPointClick={onPointClick}
      />,
    );
    const marker = container.querySelector(
      '[data-section="chart-line-momentum-roc-marker"]',
    ) as SVGElement | null;
    if (marker) fireEvent.keyDown(marker, { key: 'Enter' });
    expect(onPointClick).toHaveBeenCalled();
  });

  it('responds to Space key on markers', () => {
    const onPointClick = vi.fn();
    const { container } = render(
      <ChartLineMomentumRoc
        data={constClose(20, 5)}
        onPointClick={onPointClick}
      />,
    );
    const marker = container.querySelector(
      '[data-section="chart-line-momentum-roc-marker"]',
    ) as SVGElement | null;
    if (marker) fireEvent.keyDown(marker, { key: ' ' });
    expect(onPointClick).toHaveBeenCalled();
  });

  it('renders the config badge by default', () => {
    const { container } = render(
      <ChartLineMomentumRoc data={constClose(20, 5)} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-momentum-roc-badge"]',
      ),
    ).toBeTruthy();
  });

  it('hides the config badge when disabled', () => {
    const { container } = render(
      <ChartLineMomentumRoc
        data={constClose(20, 5)}
        showConfigBadge={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-momentum-roc-badge"]',
      ),
    ).toBe(null);
  });

  it('renders dots when showDots is true', () => {
    const { container } = render(
      <ChartLineMomentumRoc data={constClose(20, 5)} showDots={true} />,
    );
    expect(
      container.querySelectorAll(
        '[data-section="chart-line-momentum-roc-dot"]',
      ).length,
    ).toBeGreaterThan(0);
  });

  it('does not render dots by default', () => {
    const { container } = render(
      <ChartLineMomentumRoc data={constClose(20, 5)} />,
    );
    expect(
      container.querySelectorAll(
        '[data-section="chart-line-momentum-roc-dot"]',
      ).length,
    ).toBe(0);
  });

  it('hides axis when showAxis is false', () => {
    const { container } = render(
      <ChartLineMomentumRoc
        data={constClose(20, 5)}
        showAxis={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-momentum-roc-axes"]',
      ),
    ).toBe(null);
  });

  it('hides grid when showGrid is false', () => {
    const { container } = render(
      <ChartLineMomentumRoc
        data={constClose(20, 5)}
        showGrid={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-momentum-roc-grid"]',
      ),
    ).toBe(null);
  });

  it('hides markers when showMarkers is false', () => {
    const { container } = render(
      <ChartLineMomentumRoc
        data={constClose(20, 5)}
        showMarkers={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-momentum-roc-markers"]',
      ),
    ).toBe(null);
  });

  it('hides legend when showLegend is false', () => {
    const { container } = render(
      <ChartLineMomentumRoc
        data={constClose(20, 5)}
        showLegend={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-momentum-roc-legend"]',
      ),
    ).toBe(null);
  });

  it('hides baseline when showBaseline is false', () => {
    const { container } = render(
      <ChartLineMomentumRoc
        data={constClose(20, 5)}
        showBaseline={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-momentum-roc-baseline"]',
      ),
    ).toBe(null);
  });

  it('respects a custom formatRoc', () => {
    const fmt = (v: number) => `[R:${v.toFixed(2)}]`;
    const { container } = render(
      <ChartLineMomentumRoc
        data={constClose(20, 5)}
        formatRoc={fmt}
      />,
    );
    const marker = container.querySelector(
      '[data-section="chart-line-momentum-roc-marker"]',
    ) as SVGElement | null;
    if (marker) fireEvent.mouseEnter(marker);
    const text = container.textContent ?? '';
    expect(text).toMatch(/\[R:-?\d/);
  });

  it('applies className and style', () => {
    const { container } = render(
      <ChartLineMomentumRoc
        data={constClose(20, 5)}
        className="custom-class"
        style={{ background: 'red' }}
      />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-momentum-roc"]',
    );
    expect(root?.classList.contains('custom-class')).toBe(true);
    expect((root as HTMLElement | null)?.style.background).toBe('red');
  });

  it('exposes data-animate attribute', () => {
    const { container } = render(
      <ChartLineMomentumRoc data={constClose(20, 5)} animate={true} />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-momentum-roc"]',
    );
    expect(root?.getAttribute('data-animate')).toBe('true');
  });

  it('animate=false disables fade-in class', () => {
    const { container } = render(
      <ChartLineMomentumRoc data={constClose(20, 5)} animate={false} />,
    );
    const svg = container.querySelector(
      '[data-section="chart-line-momentum-roc-svg"]',
    );
    expect(svg?.classList.contains('motion-safe:animate-fade-in')).toBe(false);
  });

  it('renders the roc line by default', () => {
    const { container } = render(
      <ChartLineMomentumRoc data={constClose(20, 5)} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-momentum-roc-line"]',
      ),
    ).toBeTruthy();
  });

  it('renders the price path', () => {
    const { container } = render(
      <ChartLineMomentumRoc data={constClose(20, 5)} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-momentum-roc-price-path"]',
      ),
    ).toBeTruthy();
  });

  it('respects defaultHiddenSeries on uncontrolled mount', () => {
    const { container } = render(
      <ChartLineMomentumRoc
        data={constClose(20, 5)}
        defaultHiddenSeries={['roc']}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-momentum-roc-line"]',
      ),
    ).toBe(null);
  });

  it('hovering a marker shows the tooltip', () => {
    const { container } = render(
      <ChartLineMomentumRoc data={constClose(20, 5)} />,
    );
    const marker = container.querySelector(
      '[data-section="chart-line-momentum-roc-marker"]',
    ) as SVGElement | null;
    if (marker) fireEvent.mouseEnter(marker);
    expect(
      container.querySelector(
        '[data-section="chart-line-momentum-roc-tooltip"]',
      ),
    ).toBeTruthy();
  });

  it('tooltip vanishes on mouseLeave', () => {
    const { container } = render(
      <ChartLineMomentumRoc data={constClose(20, 5)} />,
    );
    const marker = container.querySelector(
      '[data-section="chart-line-momentum-roc-marker"]',
    ) as SVGElement | null;
    if (marker) {
      fireEvent.mouseEnter(marker);
      fireEvent.mouseLeave(marker);
    }
    expect(
      container.querySelector(
        '[data-section="chart-line-momentum-roc-tooltip"]',
      ),
    ).toBe(null);
  });

  it('tooltip respects showTooltip=false', () => {
    const { container } = render(
      <ChartLineMomentumRoc
        data={constClose(20, 5)}
        showTooltip={false}
      />,
    );
    const marker = container.querySelector(
      '[data-section="chart-line-momentum-roc-marker"]',
    ) as SVGElement | null;
    if (marker) fireEvent.mouseEnter(marker);
    expect(
      container.querySelector(
        '[data-section="chart-line-momentum-roc-tooltip"]',
      ),
    ).toBe(null);
  });
});

describe('ROC integration', () => {
  it('CONST close (K != 0) yields ROC = 0 across (K, length)', () => {
    for (const K of [1, 5, 100, -3, 7, -50, 2]) {
      for (const L of [1, 3, 5, 7, 10]) {
        const closes = Array(L + 10).fill(K);
        const out = computeLineMomentumRoc(closes, { length: L });
        for (let i = L; i < closes.length; i += 1) {
          expect(out[i]).toBe(0);
        }
      }
    }
  });

  it('GEOMETRIC close = 2^i yields ROC = (2^L - 1)*100 across L', () => {
    for (const L of [2, 3, 4, 5]) {
      const closes = Array.from({ length: 15 }, (_, i) => Math.pow(2, i));
      const out = computeLineMomentumRoc(closes, { length: L });
      const expected = (Math.pow(2, L) - 1) * 100;
      for (let i = L; i < 15; i += 1) {
        expect(out[i]).toBe(expected);
      }
    }
  });

  it('CONST close = 0 yields all-null ROC', () => {
    const closes = Array(30).fill(0);
    const out = computeLineMomentumRoc(closes, { length: 10 });
    for (let i = 0; i < 30; i += 1) {
      expect(out[i]).toBe(null);
    }
  });
});
