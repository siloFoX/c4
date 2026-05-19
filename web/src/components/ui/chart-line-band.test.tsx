import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import {
  ChartLineBand,
  DEFAULT_CHART_LINE_BAND_FILL_OPACITY,
  DEFAULT_CHART_LINE_BAND_HEIGHT,
  DEFAULT_CHART_LINE_BAND_KINDS,
  DEFAULT_CHART_LINE_BAND_PADDING,
  DEFAULT_CHART_LINE_BAND_PALETTE,
  DEFAULT_CHART_LINE_BAND_TICK_COUNT,
  DEFAULT_CHART_LINE_BAND_WIDTH,
  computeLineBandLayout,
  describeLineBandChart,
  getLineBandDefaultColor,
  getLineBandFinitePoints,
  getLineBandKindDef,
  getLineBandMembership,
  isPointInLineBand,
  normaliseLineBandSpec,
  type ChartLineBandSeries,
  type ChartLineBandSpec,
} from './chart-line-band';

const seriesA: ChartLineBandSeries = {
  id: 'a',
  label: 'Latency',
  data: [
    { x: 0, y: 50 },
    { x: 1, y: 100 },
    { x: 2, y: 200 },
    { x: 3, y: 150 },
    { x: 4, y: 80 },
  ],
};

const bands: ChartLineBandSpec[] = [
  { id: 'b1', label: 'Safe', yMin: 0, yMax: 100, kind: 'safe' },
  { id: 'b2', label: 'Warning', yMin: 100, yMax: 180, kind: 'warning' },
  { id: 'b3', label: 'Critical', yMin: 180, yMax: 500, kind: 'critical' },
];

describe('DEFAULT_CHART_LINE_BAND_* defaults', () => {
  it('has positive width, height, padding, tick count', () => {
    expect(DEFAULT_CHART_LINE_BAND_WIDTH).toBeGreaterThan(0);
    expect(DEFAULT_CHART_LINE_BAND_HEIGHT).toBeGreaterThan(0);
    expect(DEFAULT_CHART_LINE_BAND_PADDING).toBeGreaterThanOrEqual(0);
    expect(DEFAULT_CHART_LINE_BAND_TICK_COUNT).toBeGreaterThanOrEqual(2);
  });

  it('has fill opacity strictly between 0 and 1', () => {
    expect(DEFAULT_CHART_LINE_BAND_FILL_OPACITY).toBeGreaterThan(0);
    expect(DEFAULT_CHART_LINE_BAND_FILL_OPACITY).toBeLessThan(1);
  });

  it('has six canonical kinds with valid hex colors', () => {
    for (const k of [
      'safe',
      'warning',
      'critical',
      'info',
      'neutral',
      'custom',
    ] as const) {
      const def = DEFAULT_CHART_LINE_BAND_KINDS[k];
      expect(def.color).toMatch(/^#[0-9a-f]{6}$/i);
      expect(typeof def.label).toBe('string');
    }
  });

  it('exposes a 10-color palette', () => {
    expect(DEFAULT_CHART_LINE_BAND_PALETTE).toHaveLength(10);
  });
});

describe('getLineBandDefaultColor', () => {
  it('cycles through the palette by index', () => {
    expect(getLineBandDefaultColor(0)).toBe(
      DEFAULT_CHART_LINE_BAND_PALETTE[0],
    );
    expect(getLineBandDefaultColor(11)).toBe(
      DEFAULT_CHART_LINE_BAND_PALETTE[1],
    );
  });

  it('falls back to first color on invalid index', () => {
    expect(getLineBandDefaultColor(-1)).toBe(
      DEFAULT_CHART_LINE_BAND_PALETTE[0],
    );
    expect(getLineBandDefaultColor(Number.NaN)).toBe(
      DEFAULT_CHART_LINE_BAND_PALETTE[0],
    );
  });
});

describe('getLineBandKindDef', () => {
  it('returns the canonical definition for known kinds', () => {
    expect(getLineBandKindDef('safe').color).toBe('#16a34a');
    expect(getLineBandKindDef('critical').color).toBe('#dc2626');
  });

  it('falls back to custom for unknown / missing', () => {
    expect(getLineBandKindDef(undefined).color).toBe(
      DEFAULT_CHART_LINE_BAND_KINDS.custom.color,
    );
    expect(
      getLineBandKindDef('bogus' as never).color,
    ).toBe(DEFAULT_CHART_LINE_BAND_KINDS.custom.color);
  });
});

describe('getLineBandFinitePoints', () => {
  it('drops non-finite samples', () => {
    expect(
      getLineBandFinitePoints([
        { x: 0, y: 1 },
        { x: Number.NaN, y: 2 },
        { x: 3, y: Number.POSITIVE_INFINITY },
        { x: 5, y: 8 },
      ]),
    ).toEqual([
      { x: 0, y: 1 },
      { x: 5, y: 8 },
    ]);
  });

  it('returns [] for non-array', () => {
    expect(
      getLineBandFinitePoints(
        null as unknown as ReadonlyArray<{ x: number; y: number }>,
      ),
    ).toEqual([]);
  });
});

describe('normaliseLineBandSpec', () => {
  it('returns null for missing spec', () => {
    expect(normaliseLineBandSpec(null)).toBeNull();
  });

  it('returns null for missing id / label / non-finite yMin or yMax', () => {
    expect(
      normaliseLineBandSpec({
        id: '',
        label: 'L',
        yMin: 0,
        yMax: 1,
      }),
    ).toBeNull();
    expect(
      normaliseLineBandSpec({
        id: 'a',
        label: 'L',
        yMin: Number.NaN,
        yMax: 1,
      }),
    ).toBeNull();
    expect(
      normaliseLineBandSpec({
        id: 'a',
        label: 'L',
        yMin: 0,
        yMax: Number.POSITIVE_INFINITY,
      }),
    ).toBeNull();
  });

  it('swaps yMin/yMax when inverted', () => {
    const n = normaliseLineBandSpec({
      id: 'a',
      label: 'L',
      yMin: 100,
      yMax: 50,
    });
    expect(n?.yMin).toBe(50);
    expect(n?.yMax).toBe(100);
  });

  it('defaults kind to custom and color to kind color', () => {
    const n = normaliseLineBandSpec({
      id: 'a',
      label: 'L',
      yMin: 0,
      yMax: 5,
    });
    expect(n?.kind).toBe('custom');
    expect(n?.color).toBe(DEFAULT_CHART_LINE_BAND_KINDS.custom.color);
  });

  it('honours explicit color and kind overrides', () => {
    const n = normaliseLineBandSpec({
      id: 'a',
      label: 'L',
      yMin: 0,
      yMax: 5,
      color: '#abcdef',
      kind: 'warning',
    });
    expect(n?.color).toBe('#abcdef');
    expect(n?.kind).toBe('warning');
  });

  it('clamps opacity to [0,1] and falls back to default for non-finite', () => {
    const a = normaliseLineBandSpec({
      id: 'a',
      label: 'L',
      yMin: 0,
      yMax: 5,
      opacity: 2,
    });
    expect(a?.opacity).toBe(1);
    const b = normaliseLineBandSpec({
      id: 'a',
      label: 'L',
      yMin: 0,
      yMax: 5,
      opacity: -1,
    });
    expect(b?.opacity).toBe(0);
    const c = normaliseLineBandSpec({
      id: 'a',
      label: 'L',
      yMin: 0,
      yMax: 5,
      opacity: Number.NaN,
    });
    expect(c?.opacity).toBe(DEFAULT_CHART_LINE_BAND_FILL_OPACITY);
  });

  it('defaults showBorder to true and labelPosition to inside-top-left', () => {
    const n = normaliseLineBandSpec({
      id: 'a',
      label: 'L',
      yMin: 0,
      yMax: 5,
    });
    expect(n?.showBorder).toBe(true);
    expect(n?.labelPosition).toBe('inside-top-left');
  });
});

describe('isPointInLineBand', () => {
  it('returns true when y is in [yMin, yMax] (inclusive)', () => {
    expect(isPointInLineBand(0, { yMin: 0, yMax: 1 })).toBe(true);
    expect(isPointInLineBand(0.5, { yMin: 0, yMax: 1 })).toBe(true);
    expect(isPointInLineBand(1, { yMin: 0, yMax: 1 })).toBe(true);
  });

  it('returns false when y is outside the band', () => {
    expect(isPointInLineBand(-0.1, { yMin: 0, yMax: 1 })).toBe(false);
    expect(isPointInLineBand(1.1, { yMin: 0, yMax: 1 })).toBe(false);
  });

  it('returns false when y is non-finite', () => {
    expect(isPointInLineBand(Number.NaN, { yMin: 0, yMax: 1 })).toBe(false);
  });
});

describe('getLineBandMembership', () => {
  it('returns ids of bands containing y', () => {
    const list = [
      { id: 'a', yMin: 0, yMax: 10 },
      { id: 'b', yMin: 5, yMax: 15 },
      { id: 'c', yMin: 100, yMax: 200 },
    ];
    expect(getLineBandMembership(7, list)).toEqual(['a', 'b']);
  });

  it('returns [] for non-finite y', () => {
    expect(
      getLineBandMembership(Number.NaN, [{ id: 'a', yMin: 0, yMax: 10 }]),
    ).toEqual([]);
  });

  it('returns [] for non-array bands', () => {
    expect(
      getLineBandMembership(
        5,
        null as unknown as ReadonlyArray<{
          id: string;
          yMin: number;
          yMax: number;
        }>,
      ),
    ).toEqual([]);
  });
});

describe('computeLineBandLayout', () => {
  it('returns empty when no series and no bands', () => {
    const layout = computeLineBandLayout({
      series: [],
      bands: [],
      width: 400,
      height: 300,
      padding: 30,
    });
    expect(layout.series).toEqual([]);
    expect(layout.bands).toEqual([]);
  });

  it('returns empty when canvas degenerate', () => {
    const layout = computeLineBandLayout({
      series: [seriesA],
      bands,
      width: 20,
      height: 20,
      padding: 30,
    });
    expect(layout.series).toEqual([]);
    expect(layout.bands).toEqual([]);
  });

  it('builds layout series with per-point inBands', () => {
    const layout = computeLineBandLayout({
      series: [seriesA],
      bands,
      width: 400,
      height: 300,
      padding: 30,
    });
    expect(layout.series).toHaveLength(1);
    const pts = layout.series[0]!.points;
    // y=50 -> safe
    expect(pts[0]?.inBands).toEqual(['b1']);
    // y=100 -> safe + warning (boundary inclusive on both)
    expect(pts[1]?.inBands).toEqual(['b1', 'b2']);
    // y=200 -> critical
    expect(pts[2]?.inBands).toEqual(['b3']);
    // y=150 -> warning
    expect(pts[3]?.inBands).toEqual(['b2']);
    // y=80 -> safe
    expect(pts[4]?.inBands).toEqual(['b1']);
  });

  it('builds layout bands with pyTop, pyBottom, labels', () => {
    const layout = computeLineBandLayout({
      series: [seriesA],
      bands,
      width: 400,
      height: 300,
      padding: 30,
    });
    expect(layout.bands).toHaveLength(3);
    expect(layout.bands[0]?.spec.id).toBe('b1');
    expect(layout.bands[0]?.pyTop).toBeLessThan(layout.bands[0]!.pyBottom);
    expect(layout.bands[0]?.labelAnchor).toBe('start');
  });

  it('expands y bounds to include bands', () => {
    const layout = computeLineBandLayout({
      series: [seriesA],
      bands,
      width: 400,
      height: 300,
      padding: 30,
    });
    expect(layout.yMax).toBeGreaterThanOrEqual(500);
    expect(layout.yMin).toBeLessThanOrEqual(0);
  });

  it('honors hiddenBands filter', () => {
    const layout = computeLineBandLayout({
      series: [seriesA],
      bands,
      hiddenBands: new Set(['b2']),
      width: 400,
      height: 300,
      padding: 30,
    });
    expect(layout.bands).toHaveLength(2);
    expect(layout.bands.map((b) => b.spec.id)).not.toContain('b2');
    expect(
      layout.series[0]?.points[1]?.inBands.includes('b2'),
    ).toBe(false);
  });

  it('honors hiddenSeries filter', () => {
    const layout = computeLineBandLayout({
      series: [
        seriesA,
        { id: 'b', label: 'B', data: [{ x: 0, y: 5 }] },
      ],
      bands,
      hiddenSeries: new Set(['a']),
      width: 400,
      height: 300,
      padding: 30,
    });
    expect(layout.series).toHaveLength(1);
    expect(layout.series[0]?.id).toBe('b');
  });

  it('drops malformed bands silently', () => {
    const layout = computeLineBandLayout({
      series: [seriesA],
      bands: [
        ...bands,
        {
          id: '',
          label: 'invalid',
          yMin: 0,
          yMax: 10,
        } as ChartLineBandSpec,
        {
          id: 'nan',
          label: 'nan',
          yMin: Number.NaN,
          yMax: 10,
        } as ChartLineBandSpec,
      ],
      width: 400,
      height: 300,
      padding: 30,
    });
    expect(layout.bands).toHaveLength(3);
  });

  it('preserves per-band labelPosition labelAnchor mapping', () => {
    const layout = computeLineBandLayout({
      series: [seriesA],
      bands: [
        {
          id: 'tl',
          label: 'TL',
          yMin: 0,
          yMax: 5,
          labelPosition: 'inside-top-left',
        },
        {
          id: 'tr',
          label: 'TR',
          yMin: 10,
          yMax: 15,
          labelPosition: 'inside-top-right',
        },
        {
          id: 'or',
          label: 'OR',
          yMin: 20,
          yMax: 25,
          labelPosition: 'outside-right',
        },
        {
          id: 'ol',
          label: 'OL',
          yMin: 30,
          yMax: 35,
          labelPosition: 'outside-left',
        },
      ],
      width: 400,
      height: 400,
      padding: 30,
    });
    const map = new Map(
      layout.bands.map((b) => [b.spec.id, b.labelAnchor]),
    );
    expect(map.get('tl')).toBe('start');
    expect(map.get('tr')).toBe('end');
    expect(map.get('or')).toBe('start');
    expect(map.get('ol')).toBe('end');
  });

  it('respects user-supplied bounds overrides', () => {
    const layout = computeLineBandLayout({
      series: [seriesA],
      bands,
      width: 400,
      height: 300,
      padding: 30,
      yMin: 0,
      yMax: 200,
    });
    expect(layout.yMin).toBe(0);
    expect(layout.yMax).toBe(200);
  });

  it('produces axis ticks at the requested step count', () => {
    const layout = computeLineBandLayout({
      series: [seriesA],
      bands,
      width: 400,
      height: 300,
      padding: 30,
      tickCount: 6,
    });
    expect(layout.xTicks).toHaveLength(6);
    expect(layout.yTicks).toHaveLength(6);
  });
});

describe('describeLineBandChart', () => {
  it('returns "No data" when no series or bands', () => {
    expect(describeLineBandChart([], [])).toBe('No data');
    expect(describeLineBandChart(null, null)).toBe('No data');
  });

  it('summarises series + bands', () => {
    const text = describeLineBandChart([seriesA], bands);
    expect(text).toContain('1 series');
    expect(text).toContain('5 points');
    expect(text).toContain('3 reference bands');
    expect(text).toContain('Safe (safe)');
  });

  it('falls back to "No reference bands" when bands empty', () => {
    expect(describeLineBandChart([seriesA], [])).toContain(
      'No reference bands',
    );
  });

  it('honors hiddenBands in description', () => {
    expect(
      describeLineBandChart(
        [seriesA],
        bands,
        undefined,
        new Set(['b2']),
      ),
    ).toContain('2 reference bands');
  });
});

describe('<ChartLineBand /> rendering', () => {
  it('renders nothing meaningful when empty series and bands', () => {
    const { container } = render(<ChartLineBand series={[]} />);
    const root = container.querySelector('[data-section="chart-line-band"]');
    expect(root).not.toBeNull();
    expect(root?.getAttribute('data-band-count')).toBe('0');
    expect(
      container.querySelectorAll('[data-section="chart-line-band-rect"]'),
    ).toHaveLength(0);
  });

  it('renders one band rect per band', () => {
    const { container } = render(
      <ChartLineBand series={[seriesA]} bands={bands} />,
    );
    expect(
      container.querySelectorAll('[data-section="chart-line-band-rect"]'),
    ).toHaveLength(3);
  });

  it('renders line path + dots for each series', () => {
    const { container } = render(
      <ChartLineBand series={[seriesA]} bands={bands} />,
    );
    expect(
      container.querySelectorAll('[data-section="chart-line-band-path"]'),
    ).toHaveLength(1);
    expect(
      container.querySelectorAll('[data-section="chart-line-band-dot"]'),
    ).toHaveLength(5);
  });

  it('exposes per-dot in-band membership via data attrs', () => {
    const { container } = render(
      <ChartLineBand series={[seriesA]} bands={bands} />,
    );
    const dot0 = container.querySelector(
      '[data-section="chart-line-band-dot"][data-point-index="0"]',
    );
    expect(dot0?.getAttribute('data-in-bands')).toBe('b1');
    const dot1 = container.querySelector(
      '[data-section="chart-line-band-dot"][data-point-index="1"]',
    );
    expect(dot1?.getAttribute('data-in-bands')).toBe('b1,b2');
    expect(dot1?.getAttribute('data-band-count')).toBe('2');
  });

  it('renders band labels by default', () => {
    const { container } = render(
      <ChartLineBand series={[seriesA]} bands={bands} />,
    );
    expect(
      container.querySelectorAll('[data-section="chart-line-band-label"]'),
    ).toHaveLength(3);
  });

  it('omits band labels when showBandLabels=false', () => {
    const { container } = render(
      <ChartLineBand
        series={[seriesA]}
        bands={bands}
        showBandLabels={false}
      />,
    );
    expect(
      container.querySelectorAll('[data-section="chart-line-band-label"]'),
    ).toHaveLength(0);
  });

  it('omits labels for bands with labelPosition=none', () => {
    const noneBands: ChartLineBandSpec[] = [
      {
        id: 'b1',
        label: 'Safe',
        yMin: 0,
        yMax: 100,
        labelPosition: 'none',
      },
    ];
    const { container } = render(
      <ChartLineBand series={[seriesA]} bands={noneBands} />,
    );
    expect(
      container.querySelectorAll('[data-section="chart-line-band-label"]'),
    ).toHaveLength(0);
  });

  it('renders aria description and labels region', () => {
    render(<ChartLineBand series={[seriesA]} bands={bands} />);
    expect(
      screen.getByRole('region', {
        name: /line chart with reference band/i,
      }),
    ).toBeTruthy();
  });

  it('shows top and bottom borders per band by default', () => {
    const { container } = render(
      <ChartLineBand series={[seriesA]} bands={bands} />,
    );
    const top = container.querySelectorAll(
      '[data-section="chart-line-band-border"][data-edge="top"]',
    );
    const bottom = container.querySelectorAll(
      '[data-section="chart-line-band-border"][data-edge="bottom"]',
    );
    expect(top).toHaveLength(3);
    expect(bottom).toHaveLength(3);
  });

  it('omits borders when spec.showBorder=false', () => {
    const noBorder: ChartLineBandSpec[] = [
      {
        id: 'b1',
        label: 'Safe',
        yMin: 0,
        yMax: 100,
        showBorder: false,
      },
    ];
    const { container } = render(
      <ChartLineBand series={[seriesA]} bands={noBorder} />,
    );
    expect(
      container.querySelectorAll('[data-section="chart-line-band-border"]'),
    ).toHaveLength(0);
  });

  it('shows tooltip on dot hover with bands membership row', () => {
    const { container } = render(
      <ChartLineBand series={[seriesA]} bands={bands} />,
    );
    const dot = container.querySelector(
      '[data-section="chart-line-band-dot"][data-point-index="1"]',
    ) as SVGCircleElement;
    fireEvent.mouseEnter(dot);
    const tip = container.querySelector(
      '[data-section="chart-line-band-tooltip"]',
    );
    expect(tip).not.toBeNull();
    expect(
      tip?.querySelector(
        '[data-section="chart-line-band-tooltip-bands"]',
      )?.textContent,
    ).toMatch(/Safe.*Warning/);
  });

  it('shows "none" when point is outside all bands', () => {
    const { container } = render(
      <ChartLineBand
        series={[
          { id: 's', label: 'S', data: [{ x: 0, y: 1000 }] },
        ]}
        bands={bands}
      />,
    );
    const dot = container.querySelector(
      '[data-section="chart-line-band-dot"][data-point-index="0"]',
    ) as SVGCircleElement;
    fireEvent.mouseEnter(dot);
    expect(
      container.querySelector(
        '[data-section="chart-line-band-tooltip-bands"]',
      )?.textContent,
    ).toMatch(/none/);
  });

  it('hides tooltip on mouseLeave', () => {
    const { container } = render(
      <ChartLineBand series={[seriesA]} bands={bands} />,
    );
    const dot = container.querySelector(
      '[data-section="chart-line-band-dot"][data-point-index="0"]',
    ) as SVGCircleElement;
    fireEvent.mouseEnter(dot);
    expect(
      container.querySelector('[data-section="chart-line-band-tooltip"]'),
    ).not.toBeNull();
    fireEvent.mouseLeave(dot);
    expect(
      container.querySelector('[data-section="chart-line-band-tooltip"]'),
    ).toBeNull();
  });

  it('omits tooltip when showTooltip=false', () => {
    const { container } = render(
      <ChartLineBand
        series={[seriesA]}
        bands={bands}
        showTooltip={false}
      />,
    );
    const dot = container.querySelector(
      '[data-section="chart-line-band-dot"][data-point-index="0"]',
    ) as SVGCircleElement;
    fireEvent.mouseEnter(dot);
    expect(
      container.querySelector('[data-section="chart-line-band-tooltip"]'),
    ).toBeNull();
  });

  it('invokes onPointClick with series + point', () => {
    const onClick = vi.fn();
    const { container } = render(
      <ChartLineBand
        series={[seriesA]}
        bands={bands}
        onPointClick={onClick}
      />,
    );
    const dot = container.querySelector(
      '[data-section="chart-line-band-dot"][data-point-index="2"]',
    ) as SVGCircleElement;
    fireEvent.click(dot);
    expect(onClick).toHaveBeenCalledTimes(1);
    expect(onClick.mock.calls[0]?.[0].point.index).toBe(2);
  });

  it('invokes onBandClick when a band rect is clicked', () => {
    const onClick = vi.fn();
    const { container } = render(
      <ChartLineBand
        series={[seriesA]}
        bands={bands}
        onBandClick={onClick}
      />,
    );
    const rect = container.querySelector(
      '[data-section="chart-line-band-rect"][data-band-id="b2"]',
    ) as SVGRectElement;
    fireEvent.click(rect);
    expect(onClick).toHaveBeenCalledTimes(1);
    expect(onClick.mock.calls[0]?.[0].band.spec.id).toBe('b2');
  });

  it('renders the band legend with all bands', () => {
    const { container } = render(
      <ChartLineBand series={[seriesA]} bands={bands} />,
    );
    const items = container.querySelectorAll(
      '[data-section="chart-line-band-band-legend-item"]',
    );
    expect(items).toHaveLength(3);
  });

  it('toggles a band via the band legend (uncontrolled)', () => {
    const { container } = render(
      <ChartLineBand series={[seriesA]} bands={bands} />,
    );
    const btn = container.querySelector(
      '[data-section="chart-line-band-band-legend-button"][data-band-id="b2"]',
    ) as HTMLButtonElement;
    fireEvent.click(btn);
    expect(
      container.querySelector(
        '[data-section="chart-line-band-rect"][data-band-id="b2"]',
      ),
    ).toBeNull();
  });

  it('respects controlled hiddenBands prop', () => {
    const { container } = render(
      <ChartLineBand
        series={[seriesA]}
        bands={bands}
        hiddenBands={new Set(['b3'])}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-band-rect"][data-band-id="b3"]',
      ),
    ).toBeNull();
  });

  it('emits onBandToggle and onHiddenBandsChange', () => {
    const onToggle = vi.fn();
    const onHidden = vi.fn();
    const { container } = render(
      <ChartLineBand
        series={[seriesA]}
        bands={bands}
        onBandToggle={onToggle}
        onHiddenBandsChange={onHidden}
      />,
    );
    const btn = container.querySelector(
      '[data-section="chart-line-band-band-legend-button"][data-band-id="b1"]',
    ) as HTMLButtonElement;
    fireEvent.click(btn);
    expect(onToggle).toHaveBeenCalledTimes(1);
    expect(onToggle.mock.calls[0]?.[0].band.id).toBe('b1');
    expect(onToggle.mock.calls[0]?.[0].hidden).toBe(true);
    expect(onHidden).toHaveBeenCalledTimes(1);
  });

  it('omits band legend when no bands', () => {
    const { container } = render(<ChartLineBand series={[seriesA]} />);
    expect(
      container.querySelector(
        '[data-section="chart-line-band-band-legend"]',
      ),
    ).toBeNull();
  });

  it('omits band legend when showBandLegend=false', () => {
    const { container } = render(
      <ChartLineBand
        series={[seriesA]}
        bands={bands}
        showBandLegend={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-band-band-legend"]',
      ),
    ).toBeNull();
  });

  it('toggles series via the series legend', () => {
    const { container } = render(
      <ChartLineBand
        series={[
          seriesA,
          { id: 'b', label: 'B', data: [{ x: 0, y: 5 }] },
        ]}
        bands={bands}
      />,
    );
    const btn = container.querySelector(
      '[data-section="chart-line-band-legend-button"][data-series-id="a"]',
    ) as HTMLButtonElement;
    fireEvent.click(btn);
    expect(
      container.querySelectorAll('[data-section="chart-line-band-path"]'),
    ).toHaveLength(1);
  });

  it('hides series legend when showLegend=false', () => {
    const { container } = render(
      <ChartLineBand
        series={[seriesA]}
        bands={bands}
        showLegend={false}
      />,
    );
    expect(
      container.querySelector('[data-section="chart-line-band-legend"]'),
    ).toBeNull();
  });

  it('animate flag toggles data-animate and fade-in class', () => {
    const { container } = render(
      <ChartLineBand series={[seriesA]} bands={bands} />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-band"]',
    ) as HTMLDivElement;
    expect(root.getAttribute('data-animate')).toBe('true');
    expect(root.className).toContain('motion-safe:animate-fade-in');
    const { container: c2 } = render(
      <ChartLineBand
        series={[seriesA]}
        bands={bands}
        animate={false}
      />,
    );
    const r2 = c2.querySelector(
      '[data-section="chart-line-band"]',
    ) as HTMLDivElement;
    expect(r2.getAttribute('data-animate')).toBe('false');
    expect(r2.className).not.toContain('motion-safe:animate-fade-in');
  });

  it('forwards ref to root div', () => {
    const ref = { current: null as HTMLDivElement | null };
    render(
      <ChartLineBand ref={ref} series={[seriesA]} bands={bands} />,
    );
    expect(ref.current).toBeInstanceOf(HTMLDivElement);
    expect(ref.current?.getAttribute('data-section')).toBe(
      'chart-line-band',
    );
  });

  it('renders a stable displayName for devtools', () => {
    expect(ChartLineBand.displayName).toBe('ChartLineBand');
  });

  it('exposes data-visible-band-count on root', () => {
    const { container } = render(
      <ChartLineBand
        series={[seriesA]}
        bands={bands}
        hiddenBands={new Set(['b2'])}
      />,
    );
    expect(
      container
        .querySelector('[data-section="chart-line-band"]')
        ?.getAttribute('data-visible-band-count'),
    ).toBe('2');
  });
});
