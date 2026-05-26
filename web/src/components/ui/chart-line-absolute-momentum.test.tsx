import { describe, expect, it, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { createRef } from 'react';
import {
  ChartLineAbsoluteMomentum,
  classifyLineAbsoluteMomentumZone,
  computeLineAbsoluteMomentum,
  computeLineAbsoluteMomentumLayout,
  describeLineAbsoluteMomentumChart,
  detectLineAbsoluteMomentumCrosses,
  getLineAbsoluteMomentumFinitePoints,
  normalizeLineAbsoluteMomentumLength,
  normalizeLineAbsoluteMomentumThreshold,
  runLineAbsoluteMomentum,
  DEFAULT_CHART_LINE_ABSOLUTE_MOMENTUM_LENGTH,
} from './chart-line-absolute-momentum';
import type { ChartLineAbsoluteMomentumPoint } from './chart-line-absolute-momentum';

const constClose = (
  count: number,
  K: number,
): ChartLineAbsoluteMomentumPoint[] =>
  Array.from({ length: count }, (_, i) => ({ x: i, close: K }));

const linearUp = (count: number): ChartLineAbsoluteMomentumPoint[] =>
  Array.from({ length: count }, (_, i) => ({ x: i, close: i + 1 }));

describe('getLineAbsoluteMomentumFinitePoints', () => {
  it('returns an empty array for null', () => {
    expect(getLineAbsoluteMomentumFinitePoints(null)).toEqual([]);
  });

  it('drops non-finite close', () => {
    const result = getLineAbsoluteMomentumFinitePoints([
      { x: 0, close: Number.NaN },
      { x: 1, close: 10 },
    ]);
    expect(result.length).toBe(1);
  });

  it('drops null entries', () => {
    const result = getLineAbsoluteMomentumFinitePoints([
      null as unknown as ChartLineAbsoluteMomentumPoint,
      { x: 1, close: 10 },
    ]);
    expect(result.length).toBe(1);
  });
});

describe('normalizeLineAbsoluteMomentumLength', () => {
  it('returns default when undefined', () => {
    expect(normalizeLineAbsoluteMomentumLength(undefined, 14)).toBe(14);
  });

  it('accepts 1', () => {
    expect(normalizeLineAbsoluteMomentumLength(1, 14)).toBe(1);
  });

  it('rejects zero', () => {
    expect(normalizeLineAbsoluteMomentumLength(0, 14)).toBe(14);
  });
});

describe('normalizeLineAbsoluteMomentumThreshold', () => {
  it('returns default when undefined', () => {
    expect(normalizeLineAbsoluteMomentumThreshold(undefined, 5)).toBe(5);
  });

  it('accepts zero', () => {
    expect(normalizeLineAbsoluteMomentumThreshold(0, 5)).toBe(0);
  });

  it('rejects negative', () => {
    expect(normalizeLineAbsoluteMomentumThreshold(-1, 5)).toBe(5);
  });
});

describe('computeLineAbsoluteMomentum', () => {
  it('returns empty for null', () => {
    const ch = computeLineAbsoluteMomentum(null);
    expect(ch.absMom).toEqual([]);
  });

  it('returns empty for empty input', () => {
    const ch = computeLineAbsoluteMomentum([]);
    expect(ch.absMom).toEqual([]);
  });

  it('CONST close yields absMom = 0 at every valid bar (bit-exact)', () => {
    for (const K of [0, 1, 5, 100, -3]) {
      const closes = Array(15).fill(K);
      const ch = computeLineAbsoluteMomentum(closes, { length: 4 });
      for (let i = 4; i < 15; i += 1) {
        expect(ch.absMom[i]).toBe(0);
        expect(ch.raw[i]).toBe(0);
      }
    }
  });

  it('LINEAR UP yields absMom = length (bit-exact)', () => {
    const closes = Array.from({ length: 20 }, (_, i) => i + 1);
    for (const L of [3, 4, 7, 10]) {
      const ch = computeLineAbsoluteMomentum(closes, { length: L });
      for (let i = L; i < 20; i += 1) {
        expect(ch.raw[i]).toBe(L);
        expect(ch.absMom[i]).toBe(L);
      }
    }
  });

  it('LINEAR DOWN yields raw = -length, absMom = length (bit-exact)', () => {
    const closes = Array.from({ length: 20 }, (_, i) => 20 - i);
    for (const L of [3, 4, 7, 10]) {
      const ch = computeLineAbsoluteMomentum(closes, { length: L });
      for (let i = L; i < 20; i += 1) {
        expect(ch.raw[i]).toBe(-L);
        expect(ch.absMom[i]).toBe(L);
      }
    }
  });

  it('ALTERNATING with length=2 yields absMom = 0 (same parity)', () => {
    const closes = Array.from({ length: 10 }, (_, i) => i % 2);
    const ch = computeLineAbsoluteMomentum(closes, { length: 2 });
    for (let i = 2; i < 10; i += 1) {
      expect(ch.absMom[i]).toBe(0);
    }
  });

  it('ALTERNATING with length=1 yields absMom = 1', () => {
    const closes = Array.from({ length: 10 }, (_, i) => i % 2);
    const ch = computeLineAbsoluteMomentum(closes, { length: 1 });
    for (let i = 1; i < 10; i += 1) {
      expect(ch.absMom[i]).toBe(1);
    }
  });

  it('warmup region is null', () => {
    const closes = Array(15).fill(10);
    const ch = computeLineAbsoluteMomentum(closes, { length: 4 });
    expect(ch.absMom[0]).toBe(null);
    expect(ch.absMom[3]).toBe(null);
    expect(ch.absMom[4]).toBe(0);
  });

  it('output length matches input length', () => {
    const closes = Array(15).fill(10);
    const ch = computeLineAbsoluteMomentum(closes, { length: 4 });
    expect(ch.absMom.length).toBe(15);
    expect(ch.raw.length).toBe(15);
  });

  it('does not mutate input', () => {
    const closes = [1, 2, 3, 4, 5, 6, 7, 8];
    const snap = closes.slice();
    computeLineAbsoluteMomentum(closes, { length: 4 });
    expect(closes).toEqual(snap);
  });
});

describe('classifyLineAbsoluteMomentumZone', () => {
  it('classifies strong when value >= threshold', () => {
    expect(classifyLineAbsoluteMomentumZone(10, 5)).toBe('strong');
  });

  it('classifies weak when 0 < value < threshold', () => {
    expect(classifyLineAbsoluteMomentumZone(2, 5)).toBe('weak');
  });

  it('classifies flat at zero', () => {
    expect(classifyLineAbsoluteMomentumZone(0, 5)).toBe('flat');
  });

  it('returns none for null', () => {
    expect(classifyLineAbsoluteMomentumZone(null, 5)).toBe('none');
  });
});

describe('detectLineAbsoluteMomentumCrosses', () => {
  it('returns [null, null] for warmup', () => {
    expect(detectLineAbsoluteMomentumCrosses([null, null], 5)).toEqual([
      null,
      null,
    ]);
  });

  it('flags up when crossing above threshold', () => {
    const ev = detectLineAbsoluteMomentumCrosses([null, 3, 10], 5);
    expect(ev[2]).toBe('up');
  });

  it('flags down when crossing below threshold', () => {
    const ev = detectLineAbsoluteMomentumCrosses([null, 10, 3], 5);
    expect(ev[2]).toBe('down');
  });

  it('first defined bar is not a cross', () => {
    const ev = detectLineAbsoluteMomentumCrosses([null, 10], 5);
    expect(ev[1]).toBe(null);
  });
});

describe('runLineAbsoluteMomentum', () => {
  it('marks ok=false for short data', () => {
    const run = runLineAbsoluteMomentum(constClose(4, 10), { length: 4 });
    expect(run.ok).toBe(false);
  });

  it('marks ok=true with length+1 points', () => {
    const run = runLineAbsoluteMomentum(constClose(5, 10), { length: 4 });
    expect(run.ok).toBe(true);
  });

  it('uses default parameters', () => {
    const run = runLineAbsoluteMomentum(constClose(30, 10));
    expect(run.length).toBe(DEFAULT_CHART_LINE_ABSOLUTE_MOMENTUM_LENGTH);
    expect(run.strongThreshold).toBe(5);
  });

  it('respects explicit options', () => {
    const run = runLineAbsoluteMomentum(constClose(30, 10), {
      length: 7,
      strongThreshold: 10,
    });
    expect(run.length).toBe(7);
    expect(run.strongThreshold).toBe(10);
  });

  it('sorts by x', () => {
    const data: ChartLineAbsoluteMomentumPoint[] = [
      { x: 2, close: 10 },
      { x: 0, close: 10 },
      { x: 1, close: 10 },
    ];
    const run = runLineAbsoluteMomentum(data, { length: 2 });
    expect(run.samples.map((s) => s.x)).toEqual([0, 1, 2]);
  });

  it('CONST classifies post-warmup as flat', () => {
    const run = runLineAbsoluteMomentum(constClose(20, 10), { length: 4 });
    expect(run.flatCount).toBe(16);
    expect(run.strongCount).toBe(0);
  });

  it('LINEAR UP classifies post-warmup as strong (absMom=length>=threshold)', () => {
    const run = runLineAbsoluteMomentum(linearUp(20), {
      length: 14,
      strongThreshold: 5,
    });
    expect(run.strongCount).toBeGreaterThan(0);
  });
});

describe('computeLineAbsoluteMomentumLayout', () => {
  it('returns ok=false for empty data', () => {
    const layout = computeLineAbsoluteMomentumLayout({ data: [] });
    expect(layout.ok).toBe(false);
  });

  it('returns ok=true for sufficient data', () => {
    const layout = computeLineAbsoluteMomentumLayout({
      data: linearUp(20),
    });
    expect(layout.ok).toBe(true);
  });

  it('panels stack with price above absMom', () => {
    const layout = computeLineAbsoluteMomentumLayout({
      data: linearUp(20),
    });
    expect(layout.priceBottom).toBeLessThan(layout.absMomTop);
  });

  it('panel gap is respected', () => {
    const layout = computeLineAbsoluteMomentumLayout({
      data: linearUp(20),
      panelGap: 24,
    });
    expect(layout.absMomTop - layout.priceBottom).toBeCloseTo(24, 9);
  });

  it('produces a price path and dots', () => {
    const layout = computeLineAbsoluteMomentumLayout({
      data: linearUp(20),
    });
    expect(layout.pricePath.startsWith('M')).toBe(true);
    expect(layout.priceDots.length).toBe(20);
  });

  it('absMomMin is 0', () => {
    const layout = computeLineAbsoluteMomentumLayout({
      data: linearUp(20),
    });
    expect(layout.absMomMin).toBe(0);
  });

  it('absMomMax includes the threshold', () => {
    const layout = computeLineAbsoluteMomentumLayout({
      data: constClose(20, 10),
      strongThreshold: 8,
    });
    expect(layout.absMomMax).toBeGreaterThanOrEqual(8);
  });

  it('threshold line y is within bounds', () => {
    const layout = computeLineAbsoluteMomentumLayout({
      data: linearUp(20),
    });
    expect(layout.thresholdY).toBeGreaterThanOrEqual(layout.absMomTop);
    expect(layout.thresholdY).toBeLessThanOrEqual(layout.absMomBottom);
  });

  it('handles a single point gracefully', () => {
    const layout = computeLineAbsoluteMomentumLayout({
      data: [{ x: 0, close: 10 }],
    });
    expect(layout.ok).toBe(false);
  });
});

describe('describeLineAbsoluteMomentumChart', () => {
  it('returns No data for empty input', () => {
    expect(describeLineAbsoluteMomentumChart([])).toBe('No data');
  });

  it('mentions Absolute Momentum', () => {
    const desc = describeLineAbsoluteMomentumChart(linearUp(20));
    expect(desc).toContain('Absolute Momentum');
  });

  it('reports parameters', () => {
    const desc = describeLineAbsoluteMomentumChart(linearUp(20), {
      length: 7,
      strongThreshold: 10,
    });
    expect(desc).toContain('length 7');
    expect(desc).toContain('strongThreshold 10');
  });
});

describe('<ChartLineAbsoluteMomentum />', () => {
  it('renders an empty placeholder for no data', () => {
    const { container } = render(<ChartLineAbsoluteMomentum data={[]} />);
    const placeholder = container.querySelector(
      '[data-section="chart-line-absolute-momentum-empty"]',
    );
    expect(placeholder?.textContent).toBe('No data');
  });

  it('renders region role with aria-label', () => {
    const { container } = render(
      <ChartLineAbsoluteMomentum data={linearUp(20)} />,
    );
    const region = container.querySelector('[role="region"]');
    expect(region).toBeTruthy();
    expect(region?.getAttribute('aria-label')).toContain(
      'Absolute Momentum',
    );
  });

  it('forwards ref', () => {
    const ref = createRef<HTMLDivElement>();
    render(<ChartLineAbsoluteMomentum data={linearUp(20)} ref={ref} />);
    expect(ref.current).not.toBe(null);
  });

  it('exposes data attrs', () => {
    const { container } = render(
      <ChartLineAbsoluteMomentum
        data={linearUp(20)}
        length={7}
        strongThreshold={10}
      />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-absolute-momentum"]',
    );
    expect(root?.getAttribute('data-length')).toBe('7');
    expect(root?.getAttribute('data-strong-threshold')).toBe('10');
  });

  it('exposes total-points', () => {
    const { container } = render(
      <ChartLineAbsoluteMomentum data={linearUp(20)} />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-absolute-momentum"]',
    );
    expect(root?.getAttribute('data-total-points')).toBe('20');
  });

  it('renders the screen-reader description', () => {
    const { container } = render(
      <ChartLineAbsoluteMomentum data={linearUp(20)} />,
    );
    const desc = container.querySelector(
      '[data-section="chart-line-absolute-momentum-aria-desc"]',
    );
    expect(desc?.textContent).toContain('Absolute Momentum');
  });

  it('renders both legend items', () => {
    const { container } = render(
      <ChartLineAbsoluteMomentum data={linearUp(20)} />,
    );
    expect(container.querySelector('[data-series-id="price"]')).toBeTruthy();
    expect(container.querySelector('[data-series-id="absMom"]')).toBeTruthy();
  });

  it('toggles a series via the legend', () => {
    const onToggle = vi.fn();
    const { container } = render(
      <ChartLineAbsoluteMomentum
        data={linearUp(20)}
        onSeriesToggle={onToggle}
      />,
    );
    const button = container.querySelector(
      '[data-series-id="absMom"]',
    ) as HTMLButtonElement | null;
    if (button) fireEvent.click(button);
    expect(onToggle).toHaveBeenCalledWith({
      seriesId: 'absMom',
      hidden: true,
    });
  });

  it('hides absMom when controlled hidden', () => {
    const { container } = render(
      <ChartLineAbsoluteMomentum
        data={linearUp(20)}
        hiddenSeries={['absMom']}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-absolute-momentum-line"]',
      ),
    ).toBe(null);
  });

  it('renders config badge by default', () => {
    const { container } = render(
      <ChartLineAbsoluteMomentum data={linearUp(20)} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-absolute-momentum-badge"]',
      ),
    ).toBeTruthy();
  });

  it('renders threshold by default', () => {
    const { container } = render(
      <ChartLineAbsoluteMomentum data={linearUp(20)} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-absolute-momentum-threshold-line"]',
      ),
    ).toBeTruthy();
  });

  it('hides threshold when showThreshold is false', () => {
    const { container } = render(
      <ChartLineAbsoluteMomentum
        data={linearUp(20)}
        showThreshold={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-absolute-momentum-threshold-line"]',
      ),
    ).toBe(null);
  });

  it('hides axis when showAxis is false', () => {
    const { container } = render(
      <ChartLineAbsoluteMomentum data={linearUp(20)} showAxis={false} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-absolute-momentum-axes"]',
      ),
    ).toBe(null);
  });

  it('hides grid when showGrid is false', () => {
    const { container } = render(
      <ChartLineAbsoluteMomentum data={linearUp(20)} showGrid={false} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-absolute-momentum-grid"]',
      ),
    ).toBe(null);
  });

  it('hides markers when showMarkers is false', () => {
    const { container } = render(
      <ChartLineAbsoluteMomentum
        data={linearUp(20)}
        showMarkers={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-absolute-momentum-markers"]',
      ),
    ).toBe(null);
  });

  it('hides legend when showLegend is false', () => {
    const { container } = render(
      <ChartLineAbsoluteMomentum
        data={linearUp(20)}
        showLegend={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-absolute-momentum-legend"]',
      ),
    ).toBe(null);
  });

  it('applies className and style', () => {
    const { container } = render(
      <ChartLineAbsoluteMomentum
        data={linearUp(20)}
        className="custom-class"
        style={{ background: 'red' }}
      />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-absolute-momentum"]',
    );
    expect(root?.classList.contains('custom-class')).toBe(true);
    expect((root as HTMLElement | null)?.style.background).toBe('red');
  });

  it('animate=false disables fade-in class', () => {
    const { container } = render(
      <ChartLineAbsoluteMomentum data={linearUp(20)} animate={false} />,
    );
    const svg = container.querySelector(
      '[data-section="chart-line-absolute-momentum-svg"]',
    );
    expect(svg?.classList.contains('motion-safe:animate-fade-in')).toBe(false);
  });

  it('renders the absMom line by default', () => {
    const { container } = render(
      <ChartLineAbsoluteMomentum data={linearUp(20)} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-absolute-momentum-line"]',
      ),
    ).toBeTruthy();
  });

  it('renders the price path', () => {
    const { container } = render(
      <ChartLineAbsoluteMomentum data={linearUp(20)} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-absolute-momentum-price-path"]',
      ),
    ).toBeTruthy();
  });

  it('respects defaultHiddenSeries on uncontrolled mount', () => {
    const { container } = render(
      <ChartLineAbsoluteMomentum
        data={linearUp(20)}
        defaultHiddenSeries={['absMom']}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-absolute-momentum-line"]',
      ),
    ).toBe(null);
  });
});

describe('Absolute Momentum integration', () => {
  it('CONST close yields absMom = 0 across (K, length)', () => {
    for (const K of [0, 1, 5, 100, -3]) {
      for (const L of [3, 4, 7, 10]) {
        const closes = Array(L + 5).fill(K);
        const ch = computeLineAbsoluteMomentum(closes, { length: L });
        for (let i = L; i < L + 5; i += 1) {
          expect(ch.absMom[i]).toBe(0);
        }
      }
    }
  });

  it('LINEAR UP yields absMom = length across length sweep', () => {
    for (const L of [3, 4, 7, 10]) {
      const closes = Array.from({ length: L + 5 }, (_, i) => i + 1);
      const ch = computeLineAbsoluteMomentum(closes, { length: L });
      for (let i = L; i < L + 5; i += 1) {
        expect(ch.absMom[i]).toBe(L);
      }
    }
  });

  it('LINEAR DOWN yields absMom = length across length sweep', () => {
    for (const L of [3, 4, 7, 10]) {
      const closes = Array.from({ length: L + 5 }, (_, i) => 100 - i);
      const ch = computeLineAbsoluteMomentum(closes, { length: L });
      for (let i = L; i < L + 5; i += 1) {
        expect(ch.absMom[i]).toBe(L);
      }
    }
  });
});
