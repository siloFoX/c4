import { afterEach, describe, it, expect, vi } from 'vitest';
import { createRef } from 'react';
import { render, fireEvent, cleanup } from '@testing-library/react';
import {
  ChartHistogram,
  computeHistogramBins,
  computeHistogramLayout,
  computeKernelDensity,
  describeHistogram,
  getHistogramBounds,
  getHistogramFiniteValues,
  getHistogramSturgesBinCount,
  getHistogramTicks,
  silvermanBandwidth,
  DEFAULT_CHART_HISTOGRAM_WIDTH,
  DEFAULT_CHART_HISTOGRAM_HEIGHT,
  DEFAULT_CHART_HISTOGRAM_PADDING,
  DEFAULT_CHART_HISTOGRAM_TICK_COUNT,
  DEFAULT_CHART_HISTOGRAM_BIN_GAP,
  DEFAULT_CHART_HISTOGRAM_DENSITY_SAMPLES,
  DEFAULT_CHART_HISTOGRAM_BAR_COLOR,
  DEFAULT_CHART_HISTOGRAM_DENSITY_COLOR,
} from './chart-histogram';

afterEach(() => cleanup());

const SMALL = [1, 2, 2, 3, 3, 3, 4, 4, 5];
const LARGE = Array.from({ length: 100 }, (_, i) => i + 1);

describe('chart-histogram constants', () => {
  it('exports the documented defaults', () => {
    expect(DEFAULT_CHART_HISTOGRAM_WIDTH).toBe(560);
    expect(DEFAULT_CHART_HISTOGRAM_HEIGHT).toBe(320);
    expect(DEFAULT_CHART_HISTOGRAM_PADDING).toBe(40);
    expect(DEFAULT_CHART_HISTOGRAM_TICK_COUNT).toBe(5);
    expect(DEFAULT_CHART_HISTOGRAM_BIN_GAP).toBe(1);
    expect(DEFAULT_CHART_HISTOGRAM_DENSITY_SAMPLES).toBe(64);
    expect(DEFAULT_CHART_HISTOGRAM_BAR_COLOR).toBe('#2563eb');
    expect(DEFAULT_CHART_HISTOGRAM_DENSITY_COLOR).toBe('#dc2626');
  });
});

describe('getHistogramFiniteValues', () => {
  it('keeps only finite numbers', () => {
    expect(getHistogramFiniteValues([1, Number.NaN, 2, Infinity, -3])).toEqual([1, 2, -3]);
  });
  it('returns [] for empty / all non-finite input', () => {
    expect(getHistogramFiniteValues([])).toEqual([]);
    expect(getHistogramFiniteValues([Number.NaN, Infinity])).toEqual([]);
  });
});

describe('getHistogramSturgesBinCount', () => {
  it('returns ceil(log2(n) + 1)', () => {
    expect(getHistogramSturgesBinCount(8)).toBe(4);
    expect(getHistogramSturgesBinCount(100)).toBe(8);
  });
  it('returns >= 1 for tiny / invalid input', () => {
    expect(getHistogramSturgesBinCount(1)).toBe(1);
    expect(getHistogramSturgesBinCount(0)).toBe(1);
    expect(getHistogramSturgesBinCount(Number.NaN)).toBe(1);
  });
});

describe('getHistogramBounds', () => {
  it('returns (0..1) for empty input', () => {
    expect(getHistogramBounds([])).toEqual({ xMin: 0, xMax: 1, yMax: 1 });
  });
  it('computes min/max for finite values', () => {
    expect(getHistogramBounds([3, 1, 4, 1, 5]).xMin).toBe(1);
    expect(getHistogramBounds([3, 1, 4, 1, 5]).xMax).toBe(5);
  });
  it('expands collapsed range by +/- 0.5', () => {
    const b = getHistogramBounds([7, 7, 7]);
    expect(b.xMin).toBeCloseTo(6.5);
    expect(b.xMax).toBeCloseTo(7.5);
  });
});

describe('computeHistogramBins', () => {
  it('returns [] for empty values', () => {
    expect(computeHistogramBins({ values: [] })).toEqual([]);
  });
  it('default count uses Sturges rule', () => {
    const r = computeHistogramBins({ values: SMALL });
    expect(r.length).toBe(getHistogramSturgesBinCount(SMALL.length));
  });
  it('honours explicit binCount', () => {
    const r = computeHistogramBins({ values: LARGE, binCount: 10 });
    expect(r.length).toBe(10);
  });
  it('total bin counts == total finite values', () => {
    const r = computeHistogramBins({ values: SMALL, binCount: 3 });
    const sum = r.reduce((acc, b) => acc + b.count, 0);
    expect(sum).toBe(SMALL.length);
  });
  it('range covers [xMin, xMax]', () => {
    const r = computeHistogramBins({ values: SMALL, binCount: 4 });
    expect(r[0]!.start).toBe(1);
    expect(r[r.length - 1]!.end).toBe(5);
  });
  it('skips non-finite + values outside the bound range when xMin / xMax overridden', () => {
    const r = computeHistogramBins({
      values: [1, 2, 3, 100, Number.NaN],
      binCount: 3,
      xMin: 0,
      xMax: 4,
    });
    const sum = r.reduce((acc, b) => acc + b.count, 0);
    expect(sum).toBe(3);
  });
  it('densities sum * step ~= total / total = 1 (when range covers all values)', () => {
    const r = computeHistogramBins({ values: SMALL, binCount: 4 });
    const step = r[0]!.end - r[0]!.start;
    const totalDensity = r.reduce((acc, b) => acc + b.density, 0) * step;
    expect(totalDensity).toBeCloseTo(1);
  });
  it('clamps explicit binCount to >= 1', () => {
    const r = computeHistogramBins({ values: SMALL, binCount: 0 });
    expect(r.length).toBeGreaterThanOrEqual(1);
  });
  it('handles collapsed range by expanding +/- 0.5', () => {
    const r = computeHistogramBins({ values: [5, 5, 5], binCount: 3 });
    expect(r.length).toBe(3);
    expect(r[0]!.start).toBeCloseTo(4.5);
    expect(r[r.length - 1]!.end).toBeCloseTo(5.5);
  });
});

describe('silvermanBandwidth', () => {
  it('returns 1 for tiny / non-finite input', () => {
    expect(silvermanBandwidth([])).toBe(1);
    expect(silvermanBandwidth([5])).toBe(1);
    expect(silvermanBandwidth([5, 5, 5])).toBe(1);
  });
  it('returns a positive number for varied input', () => {
    const bw = silvermanBandwidth([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(bw).toBeGreaterThan(0);
  });
});

describe('computeKernelDensity', () => {
  it('returns [] for fewer than 2 finite values', () => {
    expect(
      computeKernelDensity({ values: [5], xMin: 0, xMax: 10 })
    ).toEqual([]);
  });
  it('returns [] when xMin == xMax', () => {
    expect(
      computeKernelDensity({ values: [1, 2, 3], xMin: 5, xMax: 5 })
    ).toEqual([]);
  });
  it('returns `samples` points across [xMin, xMax]', () => {
    const r = computeKernelDensity({
      values: LARGE,
      xMin: 1,
      xMax: 100,
      samples: 32,
    });
    expect(r.length).toBe(32);
    expect(r[0]!.x).toBeCloseTo(1);
    expect(r[r.length - 1]!.x).toBeCloseTo(100);
  });
  it('every density value is non-negative', () => {
    const r = computeKernelDensity({
      values: SMALL,
      xMin: 0,
      xMax: 6,
      samples: 20,
    });
    for (const p of r) expect(p.density).toBeGreaterThanOrEqual(0);
  });
  it('honors explicit bandwidth', () => {
    // tight bandwidth should produce a sharper / lower-amplitude curve at the
    // midpoint than a wide bandwidth on a uniformly-spread sample of LARGE
    const tight = computeKernelDensity({
      values: LARGE,
      xMin: 1,
      xMax: 100,
      samples: 21,
      bandwidth: 0.5,
    });
    const wide = computeKernelDensity({
      values: LARGE,
      xMin: 1,
      xMax: 100,
      samples: 21,
      bandwidth: 200,
    });
    const tightMid = tight[Math.floor(tight.length / 2)]!.density;
    const wideMid = wide[Math.floor(wide.length / 2)]!.density;
    // very different bandwidths yield very different mid-densities
    expect(Math.abs(tightMid - wideMid)).toBeGreaterThan(1e-3);
  });
});

describe('getHistogramTicks', () => {
  it('returns count evenly-spaced inclusive ticks', () => {
    const t = getHistogramTicks(0, 10, 5);
    expect(t).toHaveLength(5);
    expect(t[0]).toBeCloseTo(0);
    expect(t[4]).toBeCloseTo(10);
  });
  it('collapsed range -> [min]', () => {
    expect(getHistogramTicks(5, 5, 5)).toEqual([5]);
  });
  it('clamps count to >= 2', () => {
    expect(getHistogramTicks(0, 1, 1).length).toBe(2);
  });
});

describe('computeHistogramLayout', () => {
  it('returns one entry per bin', () => {
    const bins = computeHistogramBins({ values: SMALL, binCount: 4 });
    const out = computeHistogramLayout({
      bins,
      innerW: 400,
      innerH: 200,
      padX: 20,
      padY: 20,
      xMin: 1,
      xMax: 5,
      yMax: 4,
      binGap: 1,
      yMode: 'count',
    });
    expect(out).toHaveLength(4);
  });
  it('bars do not exceed inner canvas dimensions', () => {
    const bins = computeHistogramBins({ values: SMALL, binCount: 4 });
    const out = computeHistogramLayout({
      bins,
      innerW: 400,
      innerH: 200,
      padX: 20,
      padY: 20,
      xMin: 1,
      xMax: 5,
      yMax: 4,
      binGap: 1,
      yMode: 'count',
    });
    for (const bar of out) {
      expect(bar.x).toBeGreaterThanOrEqual(20);
      expect(bar.x + bar.width).toBeLessThanOrEqual(420 + 1e-6);
      expect(bar.height).toBeGreaterThanOrEqual(0);
      expect(bar.height).toBeLessThanOrEqual(200);
    }
  });
  it('bar height scales with count', () => {
    const bins = computeHistogramBins({ values: SMALL, binCount: 4 });
    const out = computeHistogramLayout({
      bins,
      innerW: 400,
      innerH: 200,
      padX: 20,
      padY: 20,
      xMin: 1,
      xMax: 5,
      yMax: 4,
      binGap: 1,
      yMode: 'count',
    });
    const peak = out.reduce((acc, b) => (b.count > acc.count ? b : acc), out[0]!);
    expect(peak.height).toBeGreaterThan(0);
  });
  it('density yMode uses density', () => {
    const bins = computeHistogramBins({ values: SMALL, binCount: 4 });
    const yMax = bins.reduce(
      (acc, b) => (b.density > acc ? b.density : acc),
      0
    );
    const out = computeHistogramLayout({
      bins,
      innerW: 400,
      innerH: 200,
      padX: 20,
      padY: 20,
      xMin: 1,
      xMax: 5,
      yMax,
      binGap: 1,
      yMode: 'density',
    });
    expect(out.some((b) => b.height > 0)).toBe(true);
  });
  it('returns [] when inner dimensions are non-positive', () => {
    const bins = computeHistogramBins({ values: SMALL, binCount: 4 });
    expect(
      computeHistogramLayout({
        bins,
        innerW: 0,
        innerH: 200,
        padX: 0,
        padY: 0,
        xMin: 1,
        xMax: 5,
        yMax: 4,
        binGap: 1,
        yMode: 'count',
      })
    ).toEqual([]);
  });
});

describe('describeHistogram', () => {
  it('returns "No data" for empty', () => {
    expect(describeHistogram([], [])).toBe('No data');
  });
  it('includes count + bin count + range + peak', () => {
    const bins = computeHistogramBins({ values: SMALL, binCount: 4 });
    const d = describeHistogram(SMALL, bins);
    expect(d).toContain('9 values');
    expect(d).toContain('4 bins');
    expect(d).toContain('Peak bin');
  });
  it('honors formatValue', () => {
    const bins = computeHistogramBins({ values: SMALL, binCount: 4 });
    const d = describeHistogram(SMALL, bins, (v) => `$${v}`);
    expect(d).toContain('$');
  });
});

describe('<ChartHistogram> component', () => {
  it('renders region + aria-label', () => {
    const { getByRole } = render(
      <ChartHistogram values={SMALL} ariaLabel="Test histogram" />
    );
    expect(getByRole('region', { name: 'Test histogram' })).toBeTruthy();
  });

  it('renders one bar per bin', () => {
    const { container } = render(<ChartHistogram values={SMALL} binCount={4} />);
    const bars = container.querySelectorAll(
      '[data-section="chart-histogram-bar"]'
    );
    expect(bars.length).toBe(4);
  });

  it('default bin count uses Sturges rule', () => {
    const { container } = render(<ChartHistogram values={SMALL} />);
    const bars = container.querySelectorAll(
      '[data-section="chart-histogram-bar"]'
    );
    expect(bars.length).toBe(getHistogramSturgesBinCount(SMALL.length));
  });

  it('root mirrors counts + mode + animate', () => {
    const { container } = render(
      <ChartHistogram values={SMALL} binCount={4} yMode="density" animate={false} />
    );
    const root = container.querySelector('[data-section="chart-histogram"]');
    expect(root?.getAttribute('data-value-count')).toBe('9');
    expect(root?.getAttribute('data-bin-count')).toBe('4');
    expect(root?.getAttribute('data-y-mode')).toBe('density');
    expect(root?.getAttribute('data-animate')).toBe('false');
  });

  it('each bar carries data-bin-start/end/count/density', () => {
    const { container } = render(<ChartHistogram values={SMALL} binCount={4} />);
    const bars = container.querySelectorAll(
      '[data-section="chart-histogram-bar"]'
    );
    const first = bars[0]!;
    expect(first.getAttribute('data-bin-index')).toBe('0');
    expect(first.getAttribute('data-bin-start')).toBe('1');
    expect(first.getAttribute('data-bin-end')).toBeTruthy();
    expect(first.getAttribute('data-bin-count')).toBeTruthy();
    expect(first.getAttribute('data-bin-density')).toBeTruthy();
  });

  it('bar rect is role=graphics-symbol + tabIndex=0 + aria-label', () => {
    const { container } = render(<ChartHistogram values={SMALL} binCount={4} />);
    const rect = container.querySelector(
      '[data-section="chart-histogram-rect"]'
    ) as SVGRectElement;
    expect(rect.getAttribute('role')).toBe('graphics-symbol');
    expect(rect.getAttribute('tabindex')).toBe('0');
    expect(rect.getAttribute('aria-label')).toContain('Bin');
    expect(rect.getAttribute('aria-label')).toContain('values');
  });

  it('aria-label switches to "density" in density yMode', () => {
    const { container } = render(
      <ChartHistogram values={SMALL} binCount={4} yMode="density" />
    );
    const rect = container.querySelector(
      '[data-section="chart-histogram-rect"]'
    ) as SVGRectElement;
    expect(rect.getAttribute('aria-label')).toContain('density');
  });

  it('density curve absent by default', () => {
    const { container } = render(<ChartHistogram values={SMALL} />);
    expect(
      container.querySelector('[data-section="chart-histogram-density"]')
    ).toBeNull();
    const root = container.querySelector('[data-section="chart-histogram"]');
    expect(root?.getAttribute('data-density-overlay')).toBe('false');
  });

  it('density curve renders when showDensityCurve=true', () => {
    const { container } = render(
      <ChartHistogram values={LARGE} binCount={10} showDensityCurve />
    );
    const path = container.querySelector(
      '[data-section="chart-histogram-density"]'
    );
    expect(path).not.toBeNull();
    expect(path?.getAttribute('d')).toBeTruthy();
    const root = container.querySelector('[data-section="chart-histogram"]');
    expect(root?.getAttribute('data-density-overlay')).toBe('true');
  });

  it('density curve in density yMode still renders without crash', () => {
    const { container } = render(
      <ChartHistogram
        values={LARGE}
        binCount={10}
        yMode="density"
        showDensityCurve
      />
    );
    const path = container.querySelector(
      '[data-section="chart-histogram-density"]'
    );
    expect(path?.getAttribute('d')).toBeTruthy();
  });

  it('tooltip opens on bar hover with range + count + density', () => {
    const { container } = render(<ChartHistogram values={SMALL} binCount={4} />);
    const bar = container.querySelector(
      '[data-section="chart-histogram-bar"]'
    ) as HTMLElement;
    fireEvent.mouseEnter(bar);
    expect(
      container.querySelector('[data-section="chart-histogram-tooltip"]')
    ).not.toBeNull();
    expect(
      container.querySelector(
        '[data-section="chart-histogram-tooltip-range"]'
      )?.textContent
    ).toContain('[');
    expect(
      container.querySelector(
        '[data-section="chart-histogram-tooltip-count"]'
      )?.textContent
    ).toContain('count:');
    expect(
      container.querySelector(
        '[data-section="chart-histogram-tooltip-density"]'
      )?.textContent
    ).toContain('density:');
  });

  it('tooltip hides on mouseleave', () => {
    const { container } = render(<ChartHistogram values={SMALL} binCount={4} />);
    const bar = container.querySelector(
      '[data-section="chart-histogram-bar"]'
    ) as HTMLElement;
    fireEvent.mouseEnter(bar);
    expect(
      container.querySelector('[data-section="chart-histogram-tooltip"]')
    ).not.toBeNull();
    fireEvent.mouseLeave(bar);
    expect(
      container.querySelector('[data-section="chart-histogram-tooltip"]')
    ).toBeNull();
  });

  it('showTooltip=false suppresses tooltip', () => {
    const { container } = render(
      <ChartHistogram values={SMALL} binCount={4} showTooltip={false} />
    );
    fireEvent.mouseEnter(
      container.querySelector(
        '[data-section="chart-histogram-bar"]'
      )! as HTMLElement
    );
    expect(
      container.querySelector('[data-section="chart-histogram-tooltip"]')
    ).toBeNull();
  });

  it('formatValue reaches tooltip and aria-label', () => {
    const { container } = render(
      <ChartHistogram
        values={SMALL}
        binCount={4}
        formatValue={(v) => `${v}u`}
      />
    );
    fireEvent.mouseEnter(
      container.querySelector(
        '[data-section="chart-histogram-bar"]'
      )! as HTMLElement
    );
    expect(
      container.querySelector(
        '[data-section="chart-histogram-tooltip-range"]'
      )?.textContent
    ).toContain('u');
    const rect = container.querySelector(
      '[data-section="chart-histogram-rect"]'
    ) as SVGRectElement;
    expect(rect.getAttribute('aria-label')).toContain('u');
  });

  it('formatRange rewrites the tooltip + aria range text', () => {
    const { container } = render(
      <ChartHistogram
        values={SMALL}
        binCount={4}
        formatRange={(s, e) => `${s}~${e}`}
      />
    );
    const rect = container.querySelector(
      '[data-section="chart-histogram-rect"]'
    ) as SVGRectElement;
    expect(rect.getAttribute('aria-label')).toContain('~');
    fireEvent.mouseEnter(
      container.querySelector(
        '[data-section="chart-histogram-bar"]'
      )! as HTMLElement
    );
    expect(
      container.querySelector(
        '[data-section="chart-histogram-tooltip-range"]'
      )?.textContent
    ).toContain('~');
  });

  it('onBinClick fires with bin + layout payload', () => {
    const onBinClick = vi.fn();
    const { container } = render(
      <ChartHistogram values={SMALL} binCount={4} onBinClick={onBinClick} />
    );
    const bars = container.querySelectorAll(
      '[data-section="chart-histogram-bar"]'
    );
    fireEvent.click(bars[1]! as HTMLElement);
    expect(onBinClick).toHaveBeenCalledTimes(1);
    const payload = onBinClick.mock.calls[0]![0];
    expect(payload.bin.index).toBe(1);
    expect(payload.layout.index).toBe(1);
  });

  it('data-hovered mirrors hover state', () => {
    const { container } = render(<ChartHistogram values={SMALL} binCount={4} />);
    const bar = container.querySelector(
      '[data-section="chart-histogram-bar"]'
    ) as HTMLElement;
    expect(bar.getAttribute('data-hovered')).toBe('false');
    fireEvent.mouseEnter(bar);
    expect(bar.getAttribute('data-hovered')).toBe('true');
    fireEvent.mouseLeave(bar);
    expect(bar.getAttribute('data-hovered')).toBe('false');
  });

  it('axis ticks + grid render by default and can be suppressed', () => {
    const a = render(<ChartHistogram values={SMALL} binCount={4} />);
    expect(
      a.container.querySelectorAll(
        '[data-section="chart-histogram-tick"]'
      ).length
    ).toBeGreaterThan(0);
    expect(
      a.container.querySelector('[data-section="chart-histogram-grid"]')
    ).not.toBeNull();
    cleanup();
    const b = render(
      <ChartHistogram
        values={SMALL}
        binCount={4}
        showAxisTicks={false}
        showGrid={false}
      />
    );
    expect(
      b.container.querySelector('[data-section="chart-histogram-ticks"]')
    ).toBeNull();
    expect(
      b.container.querySelector('[data-section="chart-histogram-grid"]')
    ).toBeNull();
  });

  it('x / y labels render when provided', () => {
    const { container } = render(
      <ChartHistogram
        values={SMALL}
        binCount={4}
        xLabel="X axis"
        yLabel="Y axis"
      />
    );
    expect(
      container.querySelector('[data-section="chart-histogram-x-label"]')!
        .textContent
    ).toBe('X axis');
    expect(
      container.querySelector('[data-section="chart-histogram-y-label"]')!
        .textContent
    ).toBe('Y axis');
  });

  it('auto ARIA description renders by default', () => {
    const { container } = render(<ChartHistogram values={SMALL} binCount={4} />);
    expect(
      container.querySelector('[data-section="chart-histogram-aria-desc"]')
        ?.textContent
    ).toContain('9 values');
  });

  it('ariaDescription override beats auto', () => {
    const { container } = render(
      <ChartHistogram
        values={SMALL}
        binCount={4}
        ariaDescription="Override"
      />
    );
    expect(
      container.querySelector('[data-section="chart-histogram-aria-desc"]')
        ?.textContent
    ).toBe('Override');
  });

  it('SVG mirrors width / height / viewBox', () => {
    const { container } = render(
      <ChartHistogram values={SMALL} binCount={4} width={400} height={200} />
    );
    const svg = container.querySelector(
      '[data-section="chart-histogram-svg"]'
    ) as SVGElement;
    expect(svg.getAttribute('width')).toBe('400');
    expect(svg.getAttribute('height')).toBe('200');
    expect(svg.getAttribute('viewBox')).toBe('0 0 400 200');
  });

  it('empty values list renders without crashing', () => {
    const { container } = render(<ChartHistogram values={[]} />);
    expect(
      container.querySelectorAll('[data-section="chart-histogram-bar"]').length
    ).toBe(0);
    expect(
      container.querySelector(
        '[data-section="chart-histogram-aria-desc"]'
      )?.textContent
    ).toBe('No data');
  });

  it('forwards ref to root', () => {
    const ref = createRef<HTMLDivElement>();
    render(<ChartHistogram values={SMALL} ref={ref} />);
    expect(ref.current?.dataset.section).toBe('chart-histogram');
  });

  it('has stable displayName', () => {
    expect(ChartHistogram.displayName).toBe('ChartHistogram');
  });

  it('xMin / xMax props clamp the visible range', () => {
    const { container } = render(
      <ChartHistogram values={SMALL} binCount={4} xMin={0} xMax={10} />
    );
    const bars = container.querySelectorAll(
      '[data-section="chart-histogram-bar"]'
    );
    expect(bars[0]!.getAttribute('data-bin-start')).toBe('0');
    expect(bars[bars.length - 1]!.getAttribute('data-bin-end')).toBe('10');
  });
});
