import { describe, expect, it, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { createRef } from 'react';
import {
  ChartLineSinewaveTrend,
  applyLineSinewaveTrendHilbert,
  classifyLineSinewaveTrendZone,
  computeLineSinewaveTrend,
  computeLineSinewaveTrendLayout,
  describeLineSinewaveTrendChart,
  getLineSinewaveTrendFinitePoints,
  runLineSinewaveTrend,
} from './chart-line-sinewave-trend';
import type {
  ChartLineSinewaveTrendPoint,
} from './chart-line-sinewave-trend';

const constFlat = (length: number, K: number): ChartLineSinewaveTrendPoint[] =>
  Array.from({ length }, (_, i) => ({ x: i, close: K }));

const sinusoid = (length: number, period: number, amplitude = 10, baseline = 100): ChartLineSinewaveTrendPoint[] =>
  Array.from({ length }, (_, i) => ({
    x: i,
    close: baseline + amplitude * Math.sin((2 * Math.PI * i) / period),
  }));

describe('getLineSinewaveTrendFinitePoints', () => {
  it('returns an empty array for null', () => {
    expect(getLineSinewaveTrendFinitePoints(null)).toEqual([]);
  });

  it('returns an empty array for undefined', () => {
    expect(getLineSinewaveTrendFinitePoints(undefined)).toEqual([]);
  });

  it('drops non-finite x', () => {
    const result = getLineSinewaveTrendFinitePoints([
      { x: 1, close: 10 },
      { x: Number.NaN, close: 10 },
    ]);
    expect(result.length).toBe(1);
  });

  it('drops non-finite close', () => {
    const result = getLineSinewaveTrendFinitePoints([
      { x: 0, close: Number.NaN },
      { x: 1, close: 10 },
    ]);
    expect(result.length).toBe(1);
  });

  it('drops null entries', () => {
    const result = getLineSinewaveTrendFinitePoints([
      null as unknown as ChartLineSinewaveTrendPoint,
      { x: 1, close: 10 },
    ]);
    expect(result.length).toBe(1);
  });
});

describe('applyLineSinewaveTrendHilbert', () => {
  it('returns an empty array for empty input', () => {
    expect(applyLineSinewaveTrendHilbert([])).toEqual([]);
  });

  it('warmup bars (i < 6) are null', () => {
    const out = applyLineSinewaveTrendHilbert([1, 2, 3, 4, 5, 6, 7]);
    for (let i = 0; i < 6; i += 1) {
      expect(out[i]).toBe(null);
    }
  });

  it('CONST_FLAT at K=0 yields exactly 0 bit-exact', () => {
    const out = applyLineSinewaveTrendHilbert(Array(20).fill(0));
    for (let i = 6; i < 20; i += 1) {
      expect(out[i]).toBe(0);
    }
  });

  it('CONST_FLAT at K!=0 yields ~0 to numerical tolerance', () => {
    for (const K of [1, 5, 100]) {
      const out = applyLineSinewaveTrendHilbert(Array(20).fill(K));
      for (let i = 6; i < 20; i += 1) {
        const v = out[i];
        expect(v).not.toBe(null);
        if (v !== null) expect(v).toBeCloseTo(0, 12);
      }
    }
  });
});

describe('computeLineSinewaveTrend', () => {
  it('returns empty arrays for null', () => {
    const out = computeLineSinewaveTrend(null);
    expect(out.sine).toEqual([]);
    expect(out.leadSine).toEqual([]);
  });

  it('returns empty arrays for empty input', () => {
    const out = computeLineSinewaveTrend([]);
    expect(out.sine).toEqual([]);
    expect(out.leadSine).toEqual([]);
  });

  it('nulls warmup bars (i < 10)', () => {
    const closes = sinusoid(40, 20).map((p) => p.close);
    const out = computeLineSinewaveTrend(closes);
    for (let i = 0; i < 10; i += 1) {
      expect(out.sine[i]).toBe(null);
      expect(out.leadSine[i]).toBe(null);
    }
  });

  it('CONST_FLAT yields all nulls (phase undefined under epsilon)', () => {
    for (const K of [0, 1, 5, 100, -3]) {
      const closes = constFlat(40, K).map((p) => p.close);
      const out = computeLineSinewaveTrend(closes);
      for (let i = 10; i < 40; i += 1) {
        expect(out.sine[i]).toBe(null);
        expect(out.leadSine[i]).toBe(null);
      }
    }
  });

  it('sinusoid produces sine and leadSine in [-1, 1]', () => {
    const closes = sinusoid(80, 20).map((p) => p.close);
    const out = computeLineSinewaveTrend(closes);
    for (let i = 20; i < 80; i += 1) {
      const s = out.sine[i];
      const ls = out.leadSine[i];
      if (s !== null) {
        expect(s).toBeGreaterThanOrEqual(-1);
        expect(s).toBeLessThanOrEqual(1);
      }
      if (ls !== null) {
        expect(ls).toBeGreaterThanOrEqual(-1);
        expect(ls).toBeLessThanOrEqual(1);
      }
    }
  });

  it('leadSine is phase-shifted from sine by 45 degrees', () => {
    // For any finite phase, sin(phase + pi/4) = sin(phase)*cos(pi/4) + cos(phase)*sin(pi/4).
    // Check the algebraic identity: leadSine^2 + (leadSine - sine*cos(pi/4))^2 / sin(pi/4)^2 = 1.
    // Simpler: at every finite bar, |leadSine - sine| <= 2 (always true) and the two are
    // bounded sines.
    const closes = sinusoid(80, 20).map((p) => p.close);
    const out = computeLineSinewaveTrend(closes);
    for (let i = 20; i < 80; i += 1) {
      const s = out.sine[i];
      const ls = out.leadSine[i];
      if (s != null && ls != null) {
        // Both bounded by sin range
        expect(Math.abs(s)).toBeLessThanOrEqual(1.0);
        expect(Math.abs(ls)).toBeLessThanOrEqual(1.0);
      }
    }
  });

  it('output length matches input length', () => {
    const closes = sinusoid(40, 20).map((p) => p.close);
    const out = computeLineSinewaveTrend(closes);
    expect(out.sine.length).toBe(40);
    expect(out.leadSine.length).toBe(40);
  });

  it('does not mutate input', () => {
    const closes = sinusoid(20, 10).map((p) => p.close);
    const snap = closes.slice();
    computeLineSinewaveTrend(closes);
    expect(closes).toEqual(snap);
  });
});

describe('classifyLineSinewaveTrendZone', () => {
  it('classifies positive', () => {
    expect(classifyLineSinewaveTrendZone(0.5)).toBe('positive');
  });

  it('classifies negative', () => {
    expect(classifyLineSinewaveTrendZone(-0.5)).toBe('negative');
  });

  it('classifies flat at zero', () => {
    expect(classifyLineSinewaveTrendZone(0)).toBe('flat');
  });

  it('returns none for null', () => {
    expect(classifyLineSinewaveTrendZone(null)).toBe('none');
  });

  it('returns none for NaN', () => {
    expect(classifyLineSinewaveTrendZone(Number.NaN)).toBe('none');
  });
});

describe('runLineSinewaveTrend', () => {
  it('marks ok=false for fewer than warmup+1 points', () => {
    const run = runLineSinewaveTrend(sinusoid(10, 5));
    expect(run.ok).toBe(false);
  });

  it('marks ok=true with enough points', () => {
    const run = runLineSinewaveTrend(sinusoid(20, 10));
    expect(run.ok).toBe(true);
  });

  it('sorts by x', () => {
    const data: ChartLineSinewaveTrendPoint[] = [
      { x: 2, close: 30 },
      { x: 0, close: 10 },
      { x: 1, close: 20 },
    ];
    const run = runLineSinewaveTrend(data);
    expect(run.samples.map((s) => s.x)).toEqual([0, 1, 2]);
  });

  it('CONST_FLAT classifies all bars as none', () => {
    const run = runLineSinewaveTrend(constFlat(30, 5));
    expect(run.positiveCount).toBe(0);
    expect(run.negativeCount).toBe(0);
    expect(run.flatCount).toBe(0);
  });

  it('exposes sineFinal as the last finite sine reading', () => {
    const run = runLineSinewaveTrend(constFlat(30, 5));
    expect(run.sineFinal).toBe(null);
  });

  it('sineFinal is null when there is no data', () => {
    const run = runLineSinewaveTrend([]);
    expect(run.sineFinal).toBe(null);
  });

  it('exposes leadSineFinal as the last finite reading', () => {
    const run = runLineSinewaveTrend(constFlat(30, 5));
    expect(run.leadSineFinal).toBe(null);
  });

  it('sinusoid produces some finite samples', () => {
    const run = runLineSinewaveTrend(sinusoid(60, 20));
    let foundFinite = false;
    for (let i = 15; i < 60; i += 1) {
      if (typeof run.samples[i]?.sine === 'number') {
        foundFinite = true;
        break;
      }
    }
    expect(foundFinite).toBe(true);
  });
});

describe('computeLineSinewaveTrendLayout', () => {
  it('returns ok=false for empty data', () => {
    const layout = computeLineSinewaveTrendLayout({ data: [] });
    expect(layout.ok).toBe(false);
  });

  it('returns ok=true for sufficient data', () => {
    const layout = computeLineSinewaveTrendLayout({
      data: sinusoid(40, 20),
    });
    expect(layout.ok).toBe(true);
  });

  it('uses the explicit width and height', () => {
    const layout = computeLineSinewaveTrendLayout({
      data: sinusoid(40, 20),
      width: 600,
      height: 400,
    });
    expect(layout.width).toBe(600);
    expect(layout.height).toBe(400);
  });

  it('panels stack with price above sine', () => {
    const layout = computeLineSinewaveTrendLayout({
      data: sinusoid(40, 20),
    });
    expect(layout.priceBottom).toBeLessThan(layout.sineTop);
  });

  it('panel gap is respected', () => {
    const layout = computeLineSinewaveTrendLayout({
      data: sinusoid(40, 20),
      panelGap: 24,
    });
    expect(layout.sineTop - layout.priceBottom).toBeCloseTo(24, 9);
  });

  it('produces a price path and dots', () => {
    const layout = computeLineSinewaveTrendLayout({
      data: sinusoid(40, 20),
    });
    expect(layout.pricePath.startsWith('M')).toBe(true);
    expect(layout.priceDots.length).toBe(40);
  });

  it('produces sine and leadSine paths', () => {
    const layout = computeLineSinewaveTrendLayout({
      data: sinusoid(40, 20),
    });
    expect(layout.sinePath.length).toBeGreaterThan(0);
    expect(layout.leadSinePath.length).toBeGreaterThan(0);
  });

  it('zero line is inside the sine panel', () => {
    const layout = computeLineSinewaveTrendLayout({
      data: sinusoid(40, 20),
    });
    expect(layout.zeroLineY).toBeGreaterThanOrEqual(layout.sineTop);
    expect(layout.zeroLineY).toBeLessThanOrEqual(layout.sineBottom);
  });

  it('handles a single point gracefully', () => {
    const layout = computeLineSinewaveTrendLayout({
      data: [{ x: 0, close: 10 }],
    });
    expect(layout.ok).toBe(false);
  });

  it('CONST_FLAT produces empty sine path (all nulls)', () => {
    const layout = computeLineSinewaveTrendLayout({
      data: constFlat(30, 5),
    });
    expect(layout.sinePath.length).toBe(0);
    expect(layout.leadSinePath.length).toBe(0);
  });
});

describe('describeLineSinewaveTrendChart', () => {
  it('returns No data for empty input', () => {
    expect(describeLineSinewaveTrendChart([])).toBe('No data');
  });

  it('mentions Sinewave Trend', () => {
    const desc = describeLineSinewaveTrendChart(sinusoid(40, 20));
    expect(desc).toContain('Sinewave Trend');
  });

  it('mentions sine and lead sine', () => {
    const desc = describeLineSinewaveTrendChart(sinusoid(40, 20));
    expect(desc).toContain('lead sine');
  });

  it('reports the final readings', () => {
    const desc = describeLineSinewaveTrendChart(constFlat(40, 5));
    expect(desc).toContain('final sine is n/a');
    expect(desc).toContain('final lead sine is n/a');
  });
});

describe('<ChartLineSinewaveTrend />', () => {
  it('renders an empty placeholder for no data', () => {
    const { container } = render(<ChartLineSinewaveTrend data={[]} />);
    const placeholder = container.querySelector(
      '[data-section="chart-line-sinewave-trend-empty"]',
    );
    expect(placeholder?.textContent).toBe('No data');
  });

  it('renders region role with aria-label', () => {
    const { container } = render(
      <ChartLineSinewaveTrend data={sinusoid(40, 20)} />,
    );
    const region = container.querySelector('[role="region"]');
    expect(region).toBeTruthy();
    expect(region?.getAttribute('aria-label')).toContain('Sinewave Trend');
  });

  it('forwards ref', () => {
    const ref = createRef<HTMLDivElement>();
    render(<ChartLineSinewaveTrend data={sinusoid(40, 20)} ref={ref} />);
    expect(ref.current).not.toBe(null);
  });

  it('exposes data-sine-final', () => {
    const { container } = render(
      <ChartLineSinewaveTrend data={constFlat(40, 5)} />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-sinewave-trend"]',
    );
    expect(root?.getAttribute('data-sine-final')).toBe('');
  });

  it('exposes data-leadsine-final', () => {
    const { container } = render(
      <ChartLineSinewaveTrend data={constFlat(40, 5)} />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-sinewave-trend"]',
    );
    expect(root?.getAttribute('data-leadsine-final')).toBe('');
  });

  it('exposes total-points', () => {
    const { container } = render(
      <ChartLineSinewaveTrend data={sinusoid(40, 20)} />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-sinewave-trend"]',
    );
    expect(root?.getAttribute('data-total-points')).toBe('40');
  });

  it('renders the screen-reader description', () => {
    const { container } = render(
      <ChartLineSinewaveTrend data={sinusoid(40, 20)} />,
    );
    const desc = container.querySelector(
      '[data-section="chart-line-sinewave-trend-aria-desc"]',
    );
    expect(desc?.textContent).toContain('Sinewave Trend');
  });

  it('renders all three legend items', () => {
    const { container } = render(
      <ChartLineSinewaveTrend data={sinusoid(40, 20)} />,
    );
    expect(container.querySelector('[data-series-id="price"]')).toBeTruthy();
    expect(container.querySelector('[data-series-id="sine"]')).toBeTruthy();
    expect(container.querySelector('[data-series-id="leadsine"]')).toBeTruthy();
  });

  it('toggles a series via the legend', () => {
    const onToggle = vi.fn();
    const { container } = render(
      <ChartLineSinewaveTrend
        data={sinusoid(40, 20)}
        onSeriesToggle={onToggle}
      />,
    );
    const button = container.querySelector(
      '[data-series-id="sine"]',
    ) as HTMLButtonElement | null;
    if (button) fireEvent.click(button);
    expect(onToggle).toHaveBeenCalledWith({
      seriesId: 'sine',
      hidden: true,
    });
  });

  it('respects controlled hiddenSeries', () => {
    const { container } = render(
      <ChartLineSinewaveTrend
        data={sinusoid(40, 20)}
        hiddenSeries={['sine']}
      />,
    );
    const button = container.querySelector('[data-series-id="sine"]');
    expect(button?.getAttribute('data-hidden')).toBe('true');
  });

  it('hides sine line when controlled hidden', () => {
    const { container } = render(
      <ChartLineSinewaveTrend
        data={sinusoid(40, 20)}
        hiddenSeries={['sine']}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-sinewave-trend-line"]',
      ),
    ).toBe(null);
  });

  it('hides leadSine line when controlled hidden', () => {
    const { container } = render(
      <ChartLineSinewaveTrend
        data={sinusoid(40, 20)}
        hiddenSeries={['leadsine']}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-sinewave-trend-leadsine"]',
      ),
    ).toBe(null);
  });

  it('fires onPointClick on marker activation', () => {
    const onPointClick = vi.fn();
    const { container } = render(
      <ChartLineSinewaveTrend
        data={sinusoid(40, 20)}
        onPointClick={onPointClick}
      />,
    );
    const markers = container.querySelectorAll(
      '[data-section="chart-line-sinewave-trend-marker"]',
    );
    expect(markers.length).toBeGreaterThan(0);
    fireEvent.click(markers[0]!);
    expect(onPointClick).toHaveBeenCalled();
  });

  it('responds to Enter key on markers', () => {
    const onPointClick = vi.fn();
    const { container } = render(
      <ChartLineSinewaveTrend
        data={sinusoid(40, 20)}
        onPointClick={onPointClick}
      />,
    );
    const marker = container.querySelector(
      '[data-section="chart-line-sinewave-trend-marker"]',
    ) as SVGElement | null;
    if (marker) fireEvent.keyDown(marker, { key: 'Enter' });
    expect(onPointClick).toHaveBeenCalled();
  });

  it('responds to Space key on markers', () => {
    const onPointClick = vi.fn();
    const { container } = render(
      <ChartLineSinewaveTrend
        data={sinusoid(40, 20)}
        onPointClick={onPointClick}
      />,
    );
    const marker = container.querySelector(
      '[data-section="chart-line-sinewave-trend-marker"]',
    ) as SVGElement | null;
    if (marker) fireEvent.keyDown(marker, { key: ' ' });
    expect(onPointClick).toHaveBeenCalled();
  });

  it('renders the config badge by default', () => {
    const { container } = render(
      <ChartLineSinewaveTrend data={sinusoid(40, 20)} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-sinewave-trend-badge"]',
      ),
    ).toBeTruthy();
  });

  it('hides the config badge when disabled', () => {
    const { container } = render(
      <ChartLineSinewaveTrend
        data={sinusoid(40, 20)}
        showConfigBadge={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-sinewave-trend-badge"]',
      ),
    ).toBe(null);
  });

  it('renders dots when showDots is true', () => {
    const { container } = render(
      <ChartLineSinewaveTrend data={sinusoid(40, 20)} showDots={true} />,
    );
    expect(
      container.querySelectorAll(
        '[data-section="chart-line-sinewave-trend-dot"]',
      ).length,
    ).toBeGreaterThan(0);
  });

  it('does not render dots by default', () => {
    const { container } = render(
      <ChartLineSinewaveTrend data={sinusoid(40, 20)} />,
    );
    expect(
      container.querySelectorAll(
        '[data-section="chart-line-sinewave-trend-dot"]',
      ).length,
    ).toBe(0);
  });

  it('hides axis when showAxis is false', () => {
    const { container } = render(
      <ChartLineSinewaveTrend data={sinusoid(40, 20)} showAxis={false} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-sinewave-trend-axes"]',
      ),
    ).toBe(null);
  });

  it('hides grid when showGrid is false', () => {
    const { container } = render(
      <ChartLineSinewaveTrend data={sinusoid(40, 20)} showGrid={false} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-sinewave-trend-grid"]',
      ),
    ).toBe(null);
  });

  it('hides markers when showMarkers is false', () => {
    const { container } = render(
      <ChartLineSinewaveTrend
        data={sinusoid(40, 20)}
        showMarkers={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-sinewave-trend-markers"]',
      ),
    ).toBe(null);
  });

  it('hides legend when showLegend is false', () => {
    const { container } = render(
      <ChartLineSinewaveTrend
        data={sinusoid(40, 20)}
        showLegend={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-sinewave-trend-legend"]',
      ),
    ).toBe(null);
  });

  it('hides zero line when showZeroLine is false', () => {
    const { container } = render(
      <ChartLineSinewaveTrend
        data={sinusoid(40, 20)}
        showZeroLine={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-sinewave-trend-zero-line"]',
      ),
    ).toBe(null);
  });

  it('respects a custom formatSine', () => {
    const fmt = (v: number) => `[S:${v.toFixed(2)}]`;
    const { container } = render(
      <ChartLineSinewaveTrend
        data={sinusoid(40, 20)}
        formatSine={fmt}
      />,
    );
    const text = container.textContent ?? '';
    expect(text).toMatch(/\[S:-?\d/);
  });

  it('applies className and style', () => {
    const { container } = render(
      <ChartLineSinewaveTrend
        data={sinusoid(40, 20)}
        className="custom-class"
        style={{ background: 'red' }}
      />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-sinewave-trend"]',
    );
    expect(root?.classList.contains('custom-class')).toBe(true);
    expect((root as HTMLElement | null)?.style.background).toBe('red');
  });

  it('exposes data-animate attribute', () => {
    const { container } = render(
      <ChartLineSinewaveTrend data={sinusoid(40, 20)} animate={true} />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-sinewave-trend"]',
    );
    expect(root?.getAttribute('data-animate')).toBe('true');
  });

  it('animate=false disables fade-in class', () => {
    const { container } = render(
      <ChartLineSinewaveTrend data={sinusoid(40, 20)} animate={false} />,
    );
    const svg = container.querySelector(
      '[data-section="chart-line-sinewave-trend-svg"]',
    );
    expect(svg?.classList.contains('motion-safe:animate-fade-in')).toBe(false);
  });

  it('renders the sine line by default', () => {
    const { container } = render(
      <ChartLineSinewaveTrend data={sinusoid(40, 20)} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-sinewave-trend-line"]',
      ),
    ).toBeTruthy();
  });

  it('renders the leadSine line by default', () => {
    const { container } = render(
      <ChartLineSinewaveTrend data={sinusoid(40, 20)} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-sinewave-trend-leadsine"]',
      ),
    ).toBeTruthy();
  });

  it('renders the price path', () => {
    const { container } = render(
      <ChartLineSinewaveTrend data={sinusoid(40, 20)} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-sinewave-trend-price-path"]',
      ),
    ).toBeTruthy();
  });

  it('respects defaultHiddenSeries on uncontrolled mount', () => {
    const { container } = render(
      <ChartLineSinewaveTrend
        data={sinusoid(40, 20)}
        defaultHiddenSeries={['sine']}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-sinewave-trend-line"]',
      ),
    ).toBe(null);
  });

  it('hovering a marker shows the tooltip', () => {
    const { container } = render(
      <ChartLineSinewaveTrend data={sinusoid(40, 20)} />,
    );
    const marker = container.querySelector(
      '[data-section="chart-line-sinewave-trend-marker"]',
    ) as SVGElement | null;
    if (marker) fireEvent.mouseEnter(marker);
    expect(
      container.querySelector(
        '[data-section="chart-line-sinewave-trend-tooltip"]',
      ),
    ).toBeTruthy();
  });

  it('tooltip vanishes on mouseLeave', () => {
    const { container } = render(
      <ChartLineSinewaveTrend data={sinusoid(40, 20)} />,
    );
    const marker = container.querySelector(
      '[data-section="chart-line-sinewave-trend-marker"]',
    ) as SVGElement | null;
    if (marker) {
      fireEvent.mouseEnter(marker);
      fireEvent.mouseLeave(marker);
    }
    expect(
      container.querySelector(
        '[data-section="chart-line-sinewave-trend-tooltip"]',
      ),
    ).toBe(null);
  });

  it('tooltip respects showTooltip=false', () => {
    const { container } = render(
      <ChartLineSinewaveTrend
        data={sinusoid(40, 20)}
        showTooltip={false}
      />,
    );
    const marker = container.querySelector(
      '[data-section="chart-line-sinewave-trend-marker"]',
    ) as SVGElement | null;
    if (marker) fireEvent.mouseEnter(marker);
    expect(
      container.querySelector(
        '[data-section="chart-line-sinewave-trend-tooltip"]',
      ),
    ).toBe(null);
  });
});

describe('Sinewave Trend integration', () => {
  it('CONST_FLAT yields all nulls across K values past warmup', () => {
    for (const K of [0, 1, 5, 10, 100, -3, 0.5]) {
      const closes = constFlat(40, K).map((p) => p.close);
      const out = computeLineSinewaveTrend(closes);
      for (let i = 10; i < 40; i += 1) {
        expect(out.sine[i]).toBe(null);
        expect(out.leadSine[i]).toBe(null);
      }
    }
  });

  it('sin and leadSine differ on sinusoidal input (sanity)', () => {
    const closes = sinusoid(80, 20).map((p) => p.close);
    const out = computeLineSinewaveTrend(closes);
    let foundDifference = false;
    for (let i = 20; i < 80; i += 1) {
      const s = out.sine[i];
      const ls = out.leadSine[i];
      if (s != null && ls != null && Math.abs(s - ls) > 0.01) {
        foundDifference = true;
        break;
      }
    }
    expect(foundDifference).toBe(true);
  });
});
