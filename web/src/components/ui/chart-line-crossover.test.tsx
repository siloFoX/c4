import { afterEach, describe, expect, it } from 'vitest';
import { createRef } from 'react';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import {
  ChartLineCrossover,
  DEFAULT_CHART_LINE_CROSSOVER_HEIGHT,
  DEFAULT_CHART_LINE_CROSSOVER_PADDING,
  DEFAULT_CHART_LINE_CROSSOVER_PALETTE,
  DEFAULT_CHART_LINE_CROSSOVER_TICK_COUNT,
  DEFAULT_CHART_LINE_CROSSOVER_WIDTH,
  alignLineCrossoverSamples,
  computeLineCrossoverLayout,
  describeLineCrossoverChart,
  detectLineCrossovers,
  getLineCrossoverDefaultColor,
  getLineCrossoverFinitePoints,
  runLineCrossover,
  type ChartLineCrossoverSeries,
} from './chart-line-crossover';

afterEach(() => {
  cleanup();
});

// diff (primary - reference) = [4, -1, -3, 2, 5]
// crossover between i0/i1: death cross at x 0.8, y 8.4
// crossover between i2/i3: golden cross at x 2.6, y 8.4
const PRIMARY: ChartLineCrossoverSeries = {
  id: 'fast',
  label: 'Fast MA',
  data: [
    { x: 0, y: 10 },
    { x: 1, y: 8 },
    { x: 2, y: 6 },
    { x: 3, y: 10 },
    { x: 4, y: 14 },
  ],
};
const REFERENCE: ChartLineCrossoverSeries = {
  id: 'slow',
  label: 'Slow MA',
  data: [
    { x: 0, y: 6 },
    { x: 1, y: 9 },
    { x: 2, y: 9 },
    { x: 3, y: 8 },
    { x: 4, y: 9 },
  ],
};
// primary always above reference -> no crossover
const PRIMARY_HIGH: ChartLineCrossoverSeries = {
  id: 'fast',
  label: 'Fast MA',
  data: [
    { x: 0, y: 10 },
    { x: 1, y: 11 },
    { x: 2, y: 12 },
  ],
};
const REFERENCE_LOW: ChartLineCrossoverSeries = {
  id: 'slow',
  label: 'Slow MA',
  data: [
    { x: 0, y: 5 },
    { x: 1, y: 6 },
    { x: 2, y: 7 },
  ],
};
// no shared x values
const UNALIGNED: ChartLineCrossoverSeries = {
  id: 'slow',
  label: 'Slow MA',
  data: [
    { x: 10, y: 1 },
    { x: 11, y: 2 },
    { x: 12, y: 3 },
  ],
};

describe('chart-line-crossover defaults', () => {
  it('positive size defaults', () => {
    expect(DEFAULT_CHART_LINE_CROSSOVER_WIDTH).toBeGreaterThan(0);
    expect(DEFAULT_CHART_LINE_CROSSOVER_HEIGHT).toBeGreaterThan(0);
    expect(DEFAULT_CHART_LINE_CROSSOVER_PADDING).toBeGreaterThan(0);
    expect(DEFAULT_CHART_LINE_CROSSOVER_TICK_COUNT).toBeGreaterThan(0);
  });
  it('palette has 10 colours', () => {
    expect(DEFAULT_CHART_LINE_CROSSOVER_PALETTE.length).toBe(10);
  });
});

describe('getLineCrossoverDefaultColor', () => {
  it('cycles through the palette', () => {
    const len = DEFAULT_CHART_LINE_CROSSOVER_PALETTE.length;
    expect(getLineCrossoverDefaultColor(0)).toBe(
      DEFAULT_CHART_LINE_CROSSOVER_PALETTE[0],
    );
    expect(getLineCrossoverDefaultColor(len + 2)).toBe(
      DEFAULT_CHART_LINE_CROSSOVER_PALETTE[2],
    );
  });
  it('handles non-finite and negative', () => {
    expect(getLineCrossoverDefaultColor(NaN)).toBe(
      DEFAULT_CHART_LINE_CROSSOVER_PALETTE[0],
    );
    expect(getLineCrossoverDefaultColor(-3)).toBe(
      DEFAULT_CHART_LINE_CROSSOVER_PALETTE[0],
    );
  });
});

describe('getLineCrossoverFinitePoints', () => {
  it('drops points with non-finite x or y', () => {
    const r = getLineCrossoverFinitePoints([
      { x: 0, y: 0 },
      { x: NaN, y: 1 },
      { x: 1, y: Infinity },
      { x: 2, y: 4 },
    ]);
    expect(r.length).toBe(2);
  });
  it('null returns []', () => {
    expect(getLineCrossoverFinitePoints(null)).toEqual([]);
    expect(getLineCrossoverFinitePoints(undefined)).toEqual([]);
  });
});

describe('alignLineCrossoverSamples', () => {
  it('aligns on shared x values and computes diff', () => {
    const aligned = alignLineCrossoverSamples(PRIMARY.data, REFERENCE.data);
    expect(aligned.length).toBe(5);
    expect(aligned[0]!.diff).toBe(4); // 10 - 6
    expect(aligned[1]!.diff).toBe(-1); // 8 - 9
    expect(aligned.map((s) => s.diff)).toEqual([4, -1, -3, 2, 5]);
  });
  it('no shared x values -> empty', () => {
    expect(
      alignLineCrossoverSamples(PRIMARY.data, UNALIGNED.data),
    ).toEqual([]);
  });
  it('sorts ascending by x', () => {
    const aligned = alignLineCrossoverSamples(
      [
        { x: 2, y: 1 },
        { x: 0, y: 1 },
        { x: 1, y: 1 },
      ],
      [
        { x: 0, y: 0 },
        { x: 1, y: 0 },
        { x: 2, y: 0 },
      ],
    );
    expect(aligned.map((s) => s.x)).toEqual([0, 1, 2]);
  });
  it('drops non-finite points before aligning', () => {
    const aligned = alignLineCrossoverSamples(
      [
        { x: 0, y: 1 },
        { x: 1, y: NaN },
        { x: 2, y: 3 },
      ],
      [
        { x: 0, y: 0 },
        { x: 1, y: 0 },
        { x: 2, y: 0 },
      ],
    );
    expect(aligned.map((s) => s.x)).toEqual([0, 2]);
  });
  it('null inputs -> empty', () => {
    expect(alignLineCrossoverSamples(null, null)).toEqual([]);
  });
});

describe('detectLineCrossovers', () => {
  it('detects a golden cross when the diff rises through zero', () => {
    const aligned = alignLineCrossoverSamples(
      [
        { x: 0, y: -1 },
        { x: 1, y: 1 },
      ],
      [
        { x: 0, y: 0 },
        { x: 1, y: 0 },
      ],
    );
    const cx = detectLineCrossovers(aligned);
    expect(cx.length).toBe(1);
    expect(cx[0]!.kind).toBe('golden');
    expect(cx[0]!.x).toBeCloseTo(0.5, 10);
    expect(cx[0]!.y).toBeCloseTo(0, 10);
    expect(cx[0]!.t).toBeCloseTo(0.5, 10);
  });
  it('detects a death cross when the diff falls through zero', () => {
    const aligned = alignLineCrossoverSamples(
      [
        { x: 0, y: 1 },
        { x: 1, y: -1 },
      ],
      [
        { x: 0, y: 0 },
        { x: 1, y: 0 },
      ],
    );
    const cx = detectLineCrossovers(aligned);
    expect(cx.length).toBe(1);
    expect(cx[0]!.kind).toBe('death');
    expect(cx[0]!.x).toBeCloseTo(0.5, 10);
  });
  it('interpolates the crossing point of the fixture', () => {
    const cx = detectLineCrossovers(
      alignLineCrossoverSamples(PRIMARY.data, REFERENCE.data),
    );
    expect(cx.length).toBe(2);
    // death cross: t = 4 / (4 - -1) = 0.8 -> x 0.8, y 8.4
    expect(cx[0]!.kind).toBe('death');
    expect(cx[0]!.x).toBeCloseTo(0.8, 10);
    expect(cx[0]!.y).toBeCloseTo(8.4, 10);
    expect(cx[0]!.segmentIndex).toBe(1);
    // golden cross: t = -3 / (-3 - 2) = 0.6 -> x 2.6, y 8.4
    expect(cx[1]!.kind).toBe('golden');
    expect(cx[1]!.x).toBeCloseTo(2.6, 10);
    expect(cx[1]!.y).toBeCloseTo(8.4, 10);
    expect(cx[1]!.segmentIndex).toBe(3);
  });
  it('no crossover when one series stays above the other', () => {
    const cx = detectLineCrossovers(
      alignLineCrossoverSamples(PRIMARY_HIGH.data, REFERENCE_LOW.data),
    );
    expect(cx).toEqual([]);
  });
  it('fewer than 2 samples -> []', () => {
    expect(detectLineCrossovers([])).toEqual([]);
    expect(
      detectLineCrossovers([
        { index: 0, x: 0, primaryY: 1, referenceY: 0, diff: 1 },
      ]),
    ).toEqual([]);
  });
  it('crossovers are indexed sequentially', () => {
    const cx = detectLineCrossovers(
      alignLineCrossoverSamples(PRIMARY.data, REFERENCE.data),
    );
    expect(cx.map((c) => c.index)).toEqual([0, 1]);
  });
});

describe('runLineCrossover', () => {
  it('null series -> empty result', () => {
    const r = runLineCrossover(null, null);
    expect(r.samples).toEqual([]);
    expect(r.crossovers).toEqual([]);
    expect(r.crossoverCount).toBe(0);
    expect(r.alignedCount).toBe(0);
  });
  it('fixture -> 2 crossovers, 1 golden + 1 death', () => {
    const r = runLineCrossover(PRIMARY, REFERENCE);
    expect(r.crossoverCount).toBe(2);
    expect(r.goldenCount).toBe(1);
    expect(r.deathCount).toBe(1);
  });
  it('reports the aligned-sample count', () => {
    expect(runLineCrossover(PRIMARY, REFERENCE).alignedCount).toBe(5);
  });
  it('no-cross fixture -> 0 crossovers but still aligned', () => {
    const r = runLineCrossover(PRIMARY_HIGH, REFERENCE_LOW);
    expect(r.crossoverCount).toBe(0);
    expect(r.alignedCount).toBe(3);
  });
});

describe('computeLineCrossoverLayout', () => {
  it('empty data -> ok=false', () => {
    const layout = computeLineCrossoverLayout({
      primary: { id: 'fast', label: 'Fast', data: [] },
      reference: { id: 'slow', label: 'Slow', data: [] },
      width: 400,
      height: 200,
      padding: 30,
    });
    expect(layout.ok).toBe(false);
  });

  it('degenerate canvas -> ok=false', () => {
    const layout = computeLineCrossoverLayout({
      primary: PRIMARY,
      reference: REFERENCE,
      width: 20,
      height: 20,
      padding: 30,
    });
    expect(layout.ok).toBe(false);
  });

  it('both series hidden -> ok=false', () => {
    const layout = computeLineCrossoverLayout({
      primary: PRIMARY,
      reference: REFERENCE,
      hiddenSeries: ['fast', 'slow'],
      width: 400,
      height: 200,
      padding: 30,
    });
    expect(layout.ok).toBe(false);
  });

  it('builds both line paths', () => {
    const layout = computeLineCrossoverLayout({
      primary: PRIMARY,
      reference: REFERENCE,
      width: 400,
      height: 200,
      padding: 30,
    });
    expect(layout.ok).toBe(true);
    expect(layout.primary.linePath).toContain('M ');
    expect(layout.reference.linePath).toContain('M ');
    expect(layout.primary.points.length).toBe(5);
  });

  it('projects the crossover markers with px / py / baselinePy', () => {
    const layout = computeLineCrossoverLayout({
      primary: PRIMARY,
      reference: REFERENCE,
      width: 400,
      height: 200,
      padding: 30,
    });
    expect(layout.crossovers.length).toBe(2);
    for (const c of layout.crossovers) {
      expect(Number.isFinite(c.px)).toBe(true);
      expect(Number.isFinite(c.py)).toBe(true);
      expect(c.baselinePy).toBe(layout.panel.y + layout.panel.height);
    }
  });

  it('one series hidden -> still ok, but no crossovers', () => {
    const layout = computeLineCrossoverLayout({
      primary: PRIMARY,
      reference: REFERENCE,
      hiddenSeries: ['slow'],
      width: 400,
      height: 200,
      padding: 30,
    });
    expect(layout.ok).toBe(true);
    expect(layout.visibleSeriesCount).toBe(1);
    expect(layout.crossovers).toEqual([]);
    expect(layout.crossoverCount).toBe(0);
    expect(layout.alignedCount).toBe(0);
    expect(layout.reference.visible).toBe(false);
  });

  it('exposes golden / death counts', () => {
    const layout = computeLineCrossoverLayout({
      primary: PRIMARY,
      reference: REFERENCE,
      width: 400,
      height: 200,
      padding: 30,
    });
    expect(layout.goldenCount).toBe(1);
    expect(layout.deathCount).toBe(1);
    expect(layout.crossoverCount).toBe(2);
    expect(layout.alignedCount).toBe(5);
  });

  it('bounds overrides honoured', () => {
    const layout = computeLineCrossoverLayout({
      primary: PRIMARY,
      reference: REFERENCE,
      width: 400,
      height: 200,
      padding: 30,
      xMin: -5,
      xMax: 50,
      yMin: -10,
      yMax: 99,
    });
    expect(layout.xMin).toBe(-5);
    expect(layout.xMax).toBe(50);
    expect(layout.yMin).toBe(-10);
    expect(layout.yMax).toBe(99);
  });

  it('totalPoints sums finite points of visible series', () => {
    const layout = computeLineCrossoverLayout({
      primary: PRIMARY,
      reference: REFERENCE,
      width: 400,
      height: 200,
      padding: 30,
    });
    expect(layout.totalPoints).toBe(10);
    expect(layout.visibleSeriesCount).toBe(2);
  });
});

describe('describeLineCrossoverChart', () => {
  it('missing series -> No data', () => {
    expect(describeLineCrossoverChart(null, null)).toBe('No data');
    expect(describeLineCrossoverChart(PRIMARY, null)).toBe('No data');
  });
  it('summary mentions golden + death + aligned counts', () => {
    const s = describeLineCrossoverChart(PRIMARY, REFERENCE);
    expect(s).toContain('golden');
    expect(s).toContain('death');
    expect(s).toContain('aligned');
    expect(s).toContain('Fast MA');
    expect(s).toContain('Slow MA');
  });
  it('unaligned series -> no shared x values', () => {
    expect(describeLineCrossoverChart(PRIMARY, UNALIGNED)).toContain(
      'no shared x values',
    );
  });
  it('a hidden series -> No data', () => {
    expect(
      describeLineCrossoverChart(PRIMARY, REFERENCE, { hidden: ['fast'] }),
    ).toBe('No data');
  });
});

describe('<ChartLineCrossover> render', () => {
  it('renders empty state when both series are empty', () => {
    render(
      <ChartLineCrossover
        primary={{ id: 'fast', label: 'Fast', data: [] }}
        reference={{ id: 'slow', label: 'Slow', data: [] }}
      />,
    );
    const root = document.querySelector(
      '[data-section="chart-line-crossover"]',
    );
    expect(root!.getAttribute('data-empty')).toBe('true');
  });

  it('renders both line paths', () => {
    render(<ChartLineCrossover primary={PRIMARY} reference={REFERENCE} />);
    const paths = document.querySelectorAll(
      '[data-section="chart-line-crossover-line-path"]',
    );
    expect(paths.length).toBe(2);
  });

  it('hides a series line via hiddenSeries', () => {
    render(
      <ChartLineCrossover
        primary={PRIMARY}
        reference={REFERENCE}
        hiddenSeries={['fast']}
      />,
    );
    expect(
      document.querySelector(
        '[data-section="chart-line-crossover-line-path"][data-series-kind="primary"]',
      ),
    ).toBeNull();
    expect(
      document.querySelector(
        '[data-section="chart-line-crossover-line-path"][data-series-kind="reference"]',
      ),
    ).not.toBeNull();
    // a hidden series suppresses every crossover marker
    expect(
      document.querySelectorAll(
        '[data-section="chart-line-crossover-marker"]',
      ).length,
    ).toBe(0);
  });

  it('renders one marker per detected crossover', () => {
    render(<ChartLineCrossover primary={PRIMARY} reference={REFERENCE} />);
    expect(
      document.querySelectorAll(
        '[data-section="chart-line-crossover-marker"]',
      ).length,
    ).toBe(2);
  });

  it('renders a golden marker and a death marker', () => {
    render(<ChartLineCrossover primary={PRIMARY} reference={REFERENCE} />);
    expect(
      document.querySelector(
        '[data-section="chart-line-crossover-marker"][data-kind="golden"]',
      ),
    ).not.toBeNull();
    expect(
      document.querySelector(
        '[data-section="chart-line-crossover-marker"][data-kind="death"]',
      ),
    ).not.toBeNull();
  });

  it('each marker has a triangle shape path', () => {
    render(<ChartLineCrossover primary={PRIMARY} reference={REFERENCE} />);
    const shapes = document.querySelectorAll(
      '[data-section="chart-line-crossover-marker-shape"]',
    );
    expect(shapes.length).toBe(2);
    expect(shapes[0]!.getAttribute('d')?.startsWith('M ')).toBe(true);
  });

  it('renders marker guides and hides them via showMarkerGuides', () => {
    const { rerender } = render(
      <ChartLineCrossover primary={PRIMARY} reference={REFERENCE} />,
    );
    expect(
      document.querySelectorAll(
        '[data-section="chart-line-crossover-marker-guide"]',
      ).length,
    ).toBe(2);
    rerender(
      <ChartLineCrossover
        primary={PRIMARY}
        reference={REFERENCE}
        showMarkerGuides={false}
      />,
    );
    expect(
      document.querySelector(
        '[data-section="chart-line-crossover-marker-guide"]',
      ),
    ).toBeNull();
  });

  it('hides all markers via showMarkers=false', () => {
    render(
      <ChartLineCrossover
        primary={PRIMARY}
        reference={REFERENCE}
        showMarkers={false}
      />,
    );
    expect(
      document.querySelector('[data-section="chart-line-crossover-marker"]'),
    ).toBeNull();
  });

  it('dots are off by default and shown via showDots', () => {
    const { rerender } = render(
      <ChartLineCrossover primary={PRIMARY} reference={REFERENCE} />,
    );
    expect(
      document.querySelectorAll('[data-section="chart-line-crossover-dot"]')
        .length,
    ).toBe(0);
    rerender(
      <ChartLineCrossover
        primary={PRIMARY}
        reference={REFERENCE}
        showDots
      />,
    );
    expect(
      document.querySelectorAll('[data-section="chart-line-crossover-dot"]')
        .length,
    ).toBe(10);
  });

  it('config badge shows golden / death / aligned counts', () => {
    render(<ChartLineCrossover primary={PRIMARY} reference={REFERENCE} />);
    expect(
      document.querySelector(
        '[data-section="chart-line-crossover-badge-golden"]',
      )?.textContent,
    ).toBe('gold=1');
    expect(
      document.querySelector(
        '[data-section="chart-line-crossover-badge-death"]',
      )?.textContent,
    ).toBe('death=1');
    expect(
      document.querySelector(
        '[data-section="chart-line-crossover-badge-aligned"]',
      )?.textContent,
    ).toBe('aligned=5');
  });

  it('hides the config badge via showConfigBadge=false', () => {
    render(
      <ChartLineCrossover
        primary={PRIMARY}
        reference={REFERENCE}
        showConfigBadge={false}
      />,
    );
    expect(
      document.querySelector('[data-section="chart-line-crossover-badge"]'),
    ).toBeNull();
  });

  it('ARIA: region + img + sr-only desc', () => {
    render(<ChartLineCrossover primary={PRIMARY} reference={REFERENCE} />);
    const root = document.querySelector(
      '[data-section="chart-line-crossover"]',
    );
    expect(root!.getAttribute('role')).toBe('region');
    const svg = document.querySelector(
      '[data-section="chart-line-crossover-svg"]',
    );
    expect(svg!.getAttribute('role')).toBe('img');
    const desc = document.querySelector(
      '[data-section="chart-line-crossover-aria-desc"]',
    );
    expect(desc!.textContent).toContain('golden');
  });

  it('root carries data-* attributes', () => {
    render(<ChartLineCrossover primary={PRIMARY} reference={REFERENCE} />);
    const root = document.querySelector(
      '[data-section="chart-line-crossover"]',
    );
    expect(root!.getAttribute('data-golden-count')).toBe('1');
    expect(root!.getAttribute('data-death-count')).toBe('1');
    expect(root!.getAttribute('data-crossover-count')).toBe('2');
    expect(root!.getAttribute('data-aligned-count')).toBe('5');
    expect(root!.getAttribute('data-total-points')).toBe('10');
    expect(root!.getAttribute('data-visible-series-count')).toBe('2');
  });

  it('series group exposes data-* attributes', () => {
    render(<ChartLineCrossover primary={PRIMARY} reference={REFERENCE} />);
    const grp = document.querySelector(
      '[data-section="chart-line-crossover-series-group"][data-series-kind="primary"]',
    );
    expect(grp!.getAttribute('data-series-id')).toBe('fast');
    expect(Number(grp!.getAttribute('data-series-finite-count'))).toBe(5);
  });

  it('marker exposes kind / index / segment / coordinate attributes', () => {
    render(<ChartLineCrossover primary={PRIMARY} reference={REFERENCE} />);
    const golden = document.querySelector(
      '[data-section="chart-line-crossover-marker"][data-kind="golden"]',
    );
    expect(golden!.getAttribute('data-segment-index')).toBe('3');
    expect(Number(golden!.getAttribute('data-x'))).toBeCloseTo(2.6, 5);
    expect(Number(golden!.getAttribute('data-y'))).toBeCloseTo(8.4, 5);
  });

  it('tooltip on a crossover marker shows kind + x + y + diff', () => {
    render(<ChartLineCrossover primary={PRIMARY} reference={REFERENCE} />);
    const golden = document.querySelector(
      '[data-section="chart-line-crossover-marker"][data-kind="golden"]',
    );
    fireEvent.mouseEnter(golden!);
    expect(
      document.querySelector(
        '[data-section="chart-line-crossover-tooltip-kind"]',
      )?.textContent,
    ).toBe('Golden cross');
    expect(
      document.querySelector(
        '[data-section="chart-line-crossover-tooltip-x"]',
      ),
    ).not.toBeNull();
    const diff = document.querySelector(
      '[data-section="chart-line-crossover-tooltip-diff"]',
    );
    expect(diff!.textContent).toContain('-3');
    expect(diff!.textContent).toContain('2');
    fireEvent.mouseLeave(golden!);
    expect(
      document.querySelector(
        '[data-section="chart-line-crossover-tooltip"]',
      ),
    ).toBeNull();
  });

  it('tooltip on a dot shows the series label + x + y', () => {
    render(
      <ChartLineCrossover primary={PRIMARY} reference={REFERENCE} showDots />,
    );
    const dot = document.querySelector(
      '[data-section="chart-line-crossover-dot"]',
    );
    fireEvent.mouseEnter(dot!);
    expect(
      document.querySelector(
        '[data-section="chart-line-crossover-tooltip-label"]',
      )?.textContent,
    ).toBe('Fast MA');
  });

  it('omits the tooltip when showTooltip=false', () => {
    render(
      <ChartLineCrossover
        primary={PRIMARY}
        reference={REFERENCE}
        showTooltip={false}
      />,
    );
    const marker = document.querySelector(
      '[data-section="chart-line-crossover-marker"]',
    );
    fireEvent.mouseEnter(marker!);
    expect(
      document.querySelector(
        '[data-section="chart-line-crossover-tooltip"]',
      ),
    ).toBeNull();
  });

  it('onCrossoverClick fires with the crossover payload', () => {
    let captured: number | null = null;
    render(
      <ChartLineCrossover
        primary={PRIMARY}
        reference={REFERENCE}
        onCrossoverClick={({ crossover }) => {
          captured = crossover.index;
        }}
      />,
    );
    const marker = document.querySelector(
      '[data-section="chart-line-crossover-marker"]',
    );
    fireEvent.click(marker!);
    expect(captured).not.toBeNull();
  });

  it('onPointClick fires with the series + point payload', () => {
    let captured: { seriesId: string; pointIndex: number } | null = null;
    render(
      <ChartLineCrossover
        primary={PRIMARY}
        reference={REFERENCE}
        showDots
        onPointClick={({ series, point }) => {
          captured = { seriesId: series.id, pointIndex: point.index };
        }}
      />,
    );
    const dot = document.querySelector(
      '[data-section="chart-line-crossover-dot"]',
    );
    fireEvent.click(dot!);
    expect(captured).not.toBeNull();
    expect(captured!.seriesId).toBe('fast');
  });

  it('legend has two toggle items and toggles a series', () => {
    let lastHidden: ReadonlySet<string> | null = null;
    render(
      <ChartLineCrossover
        primary={PRIMARY}
        reference={REFERENCE}
        onHiddenSeriesChange={(h) => {
          lastHidden = h;
        }}
      />,
    );
    const items = document.querySelectorAll(
      '[data-section="chart-line-crossover-legend-item"]',
    );
    expect(items.length).toBe(2);
    fireEvent.click(items[0]!);
    expect(lastHidden).not.toBeNull();
    expect(lastHidden!.has('fast')).toBe(true);
  });

  it('legend stats show the golden / death tally', () => {
    render(<ChartLineCrossover primary={PRIMARY} reference={REFERENCE} />);
    expect(
      document.querySelector(
        '[data-section="chart-line-crossover-legend-stats"]',
      )?.textContent,
    ).toBe('1 golden / 1 death');
  });

  it('omits the legend when showLegend=false', () => {
    render(
      <ChartLineCrossover
        primary={PRIMARY}
        reference={REFERENCE}
        showLegend={false}
      />,
    );
    expect(
      document.querySelector('[data-section="chart-line-crossover-legend"]'),
    ).toBeNull();
  });

  it('animate flag toggles data-animate + class', () => {
    const { rerender } = render(
      <ChartLineCrossover
        primary={PRIMARY}
        reference={REFERENCE}
        animate={true}
      />,
    );
    const root = document.querySelector(
      '[data-section="chart-line-crossover"]',
    );
    expect(root!.getAttribute('data-animate')).toBe('true');
    expect(root!.className).toContain('motion-safe:animate-fade-in');
    rerender(
      <ChartLineCrossover
        primary={PRIMARY}
        reference={REFERENCE}
        animate={false}
      />,
    );
    expect(
      document
        .querySelector('[data-section="chart-line-crossover"]')!
        .getAttribute('data-animate'),
    ).toBe('false');
  });

  it('ref forwarding', () => {
    const ref = createRef<HTMLDivElement>();
    render(
      <ChartLineCrossover
        ref={ref}
        primary={PRIMARY}
        reference={REFERENCE}
      />,
    );
    expect(ref.current!.getAttribute('data-section')).toBe(
      'chart-line-crossover',
    );
  });

  it('has displayName', () => {
    expect(ChartLineCrossover.displayName).toBe('ChartLineCrossover');
  });

  it('custom ariaLabel applied to root and svg', () => {
    render(
      <ChartLineCrossover
        primary={PRIMARY}
        reference={REFERENCE}
        ariaLabel="MA crossover"
      />,
    );
    expect(
      document
        .querySelector('[data-section="chart-line-crossover"]')!
        .getAttribute('aria-label'),
    ).toBe('MA crossover');
    expect(
      document
        .querySelector('[data-section="chart-line-crossover-svg"]')!
        .getAttribute('aria-label'),
    ).toBe('MA crossover');
  });

  it('xLabel and yLabel render axis text', () => {
    render(
      <ChartLineCrossover
        primary={PRIMARY}
        reference={REFERENCE}
        xLabel="day"
        yLabel="price"
      />,
    );
    expect(screen.getByText('day').getAttribute('data-section')).toBe(
      'chart-line-crossover-x-label',
    );
    expect(screen.getByText('price').getAttribute('data-section')).toBe(
      'chart-line-crossover-y-label',
    );
  });
});
