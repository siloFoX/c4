import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import { createRef } from 'react';
import {
  ChartLineTrin,
  getLineTrinFinitePoints,
  normalizeLineTrinThreshold,
  computeLineTrinValue,
  computeLineTrin,
  runLineTrin,
  computeLineTrinLayout,
  describeLineTrinChart,
  DEFAULT_CHART_LINE_TRIN_THRESHOLD,
  type ChartLineTrinPoint,
} from './chart-line-trin';

afterEach(() => cleanup());

const TRIN_INDEX = [500, 510, 495, 505, 520, 500, 515, 490, 525, 510];
const ADV_I = [100, 100, 200, 100, 100, 300, 100, 100, 200, 400];
const DEC_I = [100, 200, 100, 100, 100, 100, 200, 100, 200, 100];
const ADV_V = [100, 100, 100, 150, 200, 200, 100, 100, 150, 100];
const DEC_V = [100, 100, 100, 150, 100, 100, 100, 200, 150, 100];
const TRIN_DATA: ChartLineTrinPoint[] = TRIN_INDEX.map((value, x) => ({
  x,
  value,
  advIssues: ADV_I[x] as number,
  decIssues: DEC_I[x] as number,
  advVolume: ADV_V[x] as number,
  decVolume: DEC_V[x] as number,
}));
const OPTS = { threshold: 0.2 };

// TRIN = (advIssues * decVolume) / (decIssues * advVolume), a ratio
// of integer products -- exact for these inputs.
const TRIN_EXPECTED = [1, 0.5, 2, 1, 0.5, 1.5, 0.5, 2, 1, 4];
const ZONE_EXPECTED = [
  'neutral',
  'bullish',
  'bearish',
  'neutral',
  'bullish',
  'bearish',
  'bullish',
  'bearish',
  'neutral',
  'bearish',
];

describe('getLineTrinFinitePoints', () => {
  it('keeps points with all finite fields', () => {
    expect(getLineTrinFinitePoints(TRIN_DATA)).toHaveLength(TRIN_DATA.length);
  });

  it('drops a point with a negative breadth value', () => {
    const points = [
      { x: 0, value: 10, advIssues: 5, decIssues: 5, advVolume: 5, decVolume: 5 },
      { x: 1, value: 12, advIssues: -1, decIssues: 5, advVolume: 5, decVolume: 5 },
      { x: 2, value: 14, advIssues: 5, decIssues: 5, advVolume: 5, decVolume: 5 },
    ] as ChartLineTrinPoint[];
    expect(getLineTrinFinitePoints(points).map((p) => p.x)).toEqual([0, 2]);
  });

  it('returns an empty array for a non-array input', () => {
    expect(getLineTrinFinitePoints(null)).toEqual([]);
    expect(getLineTrinFinitePoints(undefined)).toEqual([]);
  });
});

describe('normalizeLineTrinThreshold', () => {
  it('uses a threshold inside the open interval 0 to 1', () => {
    expect(normalizeLineTrinThreshold(0.3, 0.2)).toBe(0.3);
  });

  it('falls back for a threshold outside the range or non-finite', () => {
    expect(normalizeLineTrinThreshold(0, 0.2)).toBe(0.2);
    expect(normalizeLineTrinThreshold(1, 0.2)).toBe(0.2);
    expect(normalizeLineTrinThreshold(Number.NaN, 0.2)).toBe(0.2);
  });
});

describe('computeLineTrinValue', () => {
  it('computes the ratio of ratios', () => {
    expect(computeLineTrinValue(200, 100, 100, 100)).toBe(2);
    expect(computeLineTrinValue(100, 100, 200, 100)).toBe(0.5);
  });

  it('reads 1 for balanced breadth', () => {
    expect(computeLineTrinValue(100, 100, 100, 100)).toBe(1);
  });

  it('returns null when declining issues is zero', () => {
    expect(computeLineTrinValue(100, 0, 100, 100)).toBeNull();
  });

  it('returns null when advancing volume is zero', () => {
    expect(computeLineTrinValue(100, 100, 0, 100)).toBeNull();
  });

  it('returns null for a non-finite input', () => {
    expect(computeLineTrinValue(Number.NaN, 100, 100, 100)).toBeNull();
  });
});

describe('computeLineTrin', () => {
  it('computes the trin for each point', () => {
    expect(computeLineTrin(TRIN_DATA)).toEqual(TRIN_EXPECTED);
  });

  it('returns an empty array for a non-array input', () => {
    expect(computeLineTrin(null)).toEqual([]);
  });
});

describe('runLineTrin', () => {
  it('marks ok for a sufficient series', () => {
    expect(runLineTrin(TRIN_DATA, OPTS).ok).toBe(true);
  });

  it('carries the threshold', () => {
    expect(runLineTrin(TRIN_DATA, OPTS).threshold).toBe(0.2);
  });

  it('exposes the trin series', () => {
    expect(runLineTrin(TRIN_DATA, OPTS).trin).toEqual(TRIN_EXPECTED);
  });

  it('emits one sample per point', () => {
    expect(runLineTrin(TRIN_DATA, OPTS).samples).toHaveLength(
      TRIN_DATA.length,
    );
  });

  it('classifies each sample into a zone', () => {
    const run = runLineTrin(TRIN_DATA, OPTS);
    expect(run.samples.map((s) => s.zone)).toEqual(ZONE_EXPECTED);
  });

  it('counts the bullish, bearish and neutral bars', () => {
    const run = runLineTrin(TRIN_DATA, OPTS);
    expect(run.bullishCount).toBe(3);
    expect(run.bearishCount).toBe(4);
    expect(run.neutralCount).toBe(3);
  });

  it('keeps the zone counts consistent with the samples', () => {
    const run = runLineTrin(TRIN_DATA, OPTS);
    expect(run.bullishCount).toBe(
      run.samples.filter((s) => s.zone === 'bullish').length,
    );
    expect(run.bearishCount).toBe(
      run.samples.filter((s) => s.zone === 'bearish').length,
    );
  });

  it('reports the final trin reading', () => {
    expect(runLineTrin(TRIN_DATA, OPTS).trinFinal).toBe(4);
  });

  it('carries the trin and zone fields on each sample', () => {
    const run = runLineTrin(TRIN_DATA, OPTS);
    const s = run.samples[1]!;
    expect(s.trin).toBe(0.5);
    expect(s.zone).toBe('bullish');
    expect(s.advIssues).toBe(100);
  });

  it('is not ok for a single-point series', () => {
    expect(
      runLineTrin(
        [
          {
            x: 0,
            value: 1,
            advIssues: 1,
            decIssues: 1,
            advVolume: 1,
            decVolume: 1,
          },
        ],
        OPTS,
      ).ok,
    ).toBe(false);
  });

  it('is not ok for an empty or null input', () => {
    expect(runLineTrin([], OPTS).ok).toBe(false);
    expect(runLineTrin(null, OPTS).ok).toBe(false);
  });

  it('sorts the points by x before running', () => {
    const shuffled = [
      TRIN_DATA[6]!,
      TRIN_DATA[0]!,
      TRIN_DATA[9]!,
      TRIN_DATA[3]!,
    ];
    const run = runLineTrin(shuffled, OPTS);
    expect(run.series.map((p) => p.x)).toEqual([0, 3, 6, 9]);
  });

  it('defaults to the 0.2 threshold configuration', () => {
    expect(runLineTrin(TRIN_DATA).threshold).toBe(
      DEFAULT_CHART_LINE_TRIN_THRESHOLD,
    );
  });
});

describe('computeLineTrinLayout', () => {
  const layoutOptions = {
    data: TRIN_DATA,
    ...OPTS,
    width: 560,
    height: 360,
    padding: 40,
  };

  it('marks ok for a valid layout', () => {
    expect(computeLineTrinLayout(layoutOptions).ok).toBe(true);
  });

  it('stacks the price panel above the trin panel', () => {
    const layout = computeLineTrinLayout(layoutOptions);
    expect(layout.pricePanel.y).toBeLessThan(layout.trinPanel.y);
    expect(layout.trinPanel.y).toBeGreaterThanOrEqual(
      layout.pricePanel.y + layout.pricePanel.height,
    );
  });

  it('builds a non-empty price path', () => {
    expect(
      computeLineTrinLayout(layoutOptions).pricePath.length,
    ).toBeGreaterThan(0);
  });

  it('builds a non-empty trin path', () => {
    expect(
      computeLineTrinLayout(layoutOptions).trinPath.length,
    ).toBeGreaterThan(0);
  });

  it('emits one price dot per point', () => {
    expect(computeLineTrinLayout(layoutOptions).priceDots).toHaveLength(
      TRIN_DATA.length,
    );
  });

  it('emits one trin marker per defined sample', () => {
    expect(computeLineTrinLayout(layoutOptions).trinMarkers).toHaveLength(
      TRIN_DATA.length,
    );
  });

  it('orders the bearish, balance and bullish lines top to bottom', () => {
    const layout = computeLineTrinLayout(layoutOptions);
    expect(layout.bearishY).toBeLessThan(layout.balanceY);
    expect(layout.balanceY).toBeLessThan(layout.bullishY);
  });

  it('places the level lines inside the trin panel', () => {
    const layout = computeLineTrinLayout(layoutOptions);
    for (const y of [layout.bearishY, layout.balanceY, layout.bullishY]) {
      expect(y).toBeGreaterThanOrEqual(layout.trinPanel.y);
      expect(y).toBeLessThanOrEqual(
        layout.trinPanel.y + layout.trinPanel.height,
      );
    }
  });

  it('carries the run statistics', () => {
    const layout = computeLineTrinLayout(layoutOptions);
    expect(layout.trinFinal).toBe(4);
    expect(layout.bullishCount).toBe(3);
    expect(layout.bearishCount).toBe(4);
    expect(layout.totalPoints).toBe(10);
  });

  it('is not ok for a collapsed canvas', () => {
    expect(computeLineTrinLayout({ ...layoutOptions, width: 60 }).ok).toBe(
      false,
    );
  });

  it('is not ok for too little data', () => {
    expect(
      computeLineTrinLayout({
        ...layoutOptions,
        data: [
          {
            x: 0,
            value: 1,
            advIssues: 1,
            decIssues: 1,
            advVolume: 1,
            decVolume: 1,
          },
        ],
      }).ok,
    ).toBe(false);
  });
});

describe('describeLineTrinChart', () => {
  it('describes the indicator vocabulary', () => {
    const text = describeLineTrinChart(TRIN_DATA, OPTS);
    expect(text).toContain('Arms Index');
    expect(text).toContain('TRIN');
    expect(text).toContain('advancing issues');
    expect(text).toContain('advancing volume');
  });

  it('reports the zone counts', () => {
    const text = describeLineTrinChart(TRIN_DATA, OPTS);
    expect(text).toContain('bullish on 3');
    expect(text).toContain('bearish on 4');
  });

  it('returns No data for an empty input', () => {
    expect(describeLineTrinChart([])).toBe('No data');
  });
});

describe('<ChartLineTrin />', () => {
  it('renders a labelled region', () => {
    const { container } = render(<ChartLineTrin data={TRIN_DATA} {...OPTS} />);
    const region = container.querySelector('[role="region"]');
    expect(region).not.toBeNull();
    expect(region?.getAttribute('aria-label')).toBeTruthy();
  });

  it('renders an accessible description', () => {
    const { container } = render(<ChartLineTrin data={TRIN_DATA} {...OPTS} />);
    const desc = container.querySelector(
      '[data-section="chart-line-trin-aria-desc"]',
    );
    expect(desc?.textContent).toContain('Arms Index');
  });

  it('exposes the run summary on the root data attributes', () => {
    const { container } = render(<ChartLineTrin data={TRIN_DATA} {...OPTS} />);
    const root = container.querySelector('[data-section="chart-line-trin"]');
    expect(root?.getAttribute('data-threshold')).toBe('0.2');
    expect(root?.getAttribute('data-bullish-count')).toBe('3');
    expect(root?.getAttribute('data-bearish-count')).toBe('4');
    expect(root?.getAttribute('data-neutral-count')).toBe('3');
    expect(root?.getAttribute('data-total-points')).toBe('10');
  });

  it('renders the svg and the price line', () => {
    const { container } = render(<ChartLineTrin data={TRIN_DATA} {...OPTS} />);
    expect(
      container.querySelector('[data-section="chart-line-trin-svg"]'),
    ).not.toBeNull();
    expect(
      container.querySelector('[data-section="chart-line-trin-price-path"]'),
    ).not.toBeNull();
  });

  it('renders both panel labels', () => {
    const { container } = render(<ChartLineTrin data={TRIN_DATA} {...OPTS} />);
    const labels = Array.from(
      container.querySelectorAll(
        '[data-section="chart-line-trin-panel-label"]',
      ),
    ).map((n) => n.textContent);
    expect(labels).toContain('Price');
    expect(labels).toContain('TRIN');
  });

  it('renders the trin line', () => {
    const { container } = render(<ChartLineTrin data={TRIN_DATA} {...OPTS} />);
    expect(
      container.querySelector('[data-section="chart-line-trin-trin-line"]'),
    ).not.toBeNull();
  });

  it('renders one trin marker per defined sample', () => {
    const { container } = render(<ChartLineTrin data={TRIN_DATA} {...OPTS} />);
    expect(
      container.querySelectorAll('[data-section="chart-line-trin-marker"]'),
    ).toHaveLength(TRIN_DATA.length);
  });

  it('renders the bearish, balance and bullish level lines', () => {
    const { container } = render(<ChartLineTrin data={TRIN_DATA} {...OPTS} />);
    expect(
      container.querySelectorAll('[data-section="chart-line-trin-level-line"]'),
    ).toHaveLength(3);
  });

  it('exposes the zone on each trin marker', () => {
    const { container } = render(<ChartLineTrin data={TRIN_DATA} {...OPTS} />);
    const marker = container.querySelector(
      '[data-section="chart-line-trin-marker"][data-point-index="1"]',
    );
    expect(marker?.getAttribute('data-zone')).toBe('bullish');
  });

  it('renders the three-item legend', () => {
    const { container } = render(<ChartLineTrin data={TRIN_DATA} {...OPTS} />);
    expect(
      container.querySelectorAll('[data-section="chart-line-trin-legend-item"]'),
    ).toHaveLength(3);
  });

  it('renders the config badge with the threshold', () => {
    const { container } = render(<ChartLineTrin data={TRIN_DATA} {...OPTS} />);
    const badge = container.querySelector(
      '[data-section="chart-line-trin-badge-config"]',
    );
    expect(badge?.textContent).toBe('0.2');
  });

  it('hides the price line via the price hidden set', () => {
    const { container } = render(
      <ChartLineTrin data={TRIN_DATA} {...OPTS} hiddenSeries={['price']} />,
    );
    expect(
      container.querySelector('[data-section="chart-line-trin-price-path"]'),
    ).toBeNull();
  });

  it('hides the trin line and markers when showTrin is false', () => {
    const { container } = render(
      <ChartLineTrin data={TRIN_DATA} {...OPTS} showTrin={false} />,
    );
    expect(
      container.querySelector('[data-section="chart-line-trin-trin-line"]'),
    ).toBeNull();
    expect(
      container.querySelectorAll('[data-section="chart-line-trin-marker"]'),
    ).toHaveLength(0);
  });

  it('hides the level lines when showLevels is false', () => {
    const { container } = render(
      <ChartLineTrin data={TRIN_DATA} {...OPTS} showLevels={false} />,
    );
    expect(
      container.querySelector('[data-section="chart-line-trin-level-line"]'),
    ).toBeNull();
  });

  it('hides the trin via the hidden set', () => {
    const { container } = render(
      <ChartLineTrin data={TRIN_DATA} {...OPTS} hiddenSeries={['trin']} />,
    );
    expect(
      container.querySelector('[data-section="chart-line-trin-trin-line"]'),
    ).toBeNull();
  });

  it('hides the level lines via the hidden set', () => {
    const { container } = render(
      <ChartLineTrin data={TRIN_DATA} {...OPTS} hiddenSeries={['levels']} />,
    );
    expect(
      container.querySelector('[data-section="chart-line-trin-level-line"]'),
    ).toBeNull();
  });

  it('reports a series toggle through the callback', () => {
    let payload: { seriesId: string; hidden: boolean } | null = null;
    const { container } = render(
      <ChartLineTrin
        data={TRIN_DATA}
        {...OPTS}
        onSeriesToggle={(p) => {
          payload = p;
        }}
      />,
    );
    const item = container.querySelector(
      '[data-section="chart-line-trin-legend-item"][data-series-id="trin"]',
    ) as HTMLButtonElement | null;
    item?.click();
    expect(payload).toEqual({ seriesId: 'trin', hidden: true });
  });

  it('renders price dots when showDots is set', () => {
    const { container } = render(
      <ChartLineTrin data={TRIN_DATA} {...OPTS} showDots />,
    );
    expect(
      container.querySelectorAll('[data-section="chart-line-trin-dot"]'),
    ).toHaveLength(TRIN_DATA.length);
  });

  it('renders the empty state for too little data', () => {
    const { container } = render(
      <ChartLineTrin
        data={[
          {
            x: 0,
            value: 1,
            advIssues: 1,
            decIssues: 1,
            advVolume: 1,
            decVolume: 1,
          },
        ]}
        {...OPTS}
      />,
    );
    const root = container.querySelector('[data-section="chart-line-trin"]');
    expect(root?.getAttribute('data-empty')).toBe('true');
  });

  it('omits the config badge when showConfigBadge is false', () => {
    const { container } = render(
      <ChartLineTrin data={TRIN_DATA} {...OPTS} showConfigBadge={false} />,
    );
    expect(
      container.querySelector('[data-section="chart-line-trin-badge"]'),
    ).toBeNull();
  });

  it('forwards a ref to the root element', () => {
    const ref = createRef<HTMLDivElement>();
    render(<ChartLineTrin ref={ref} data={TRIN_DATA} {...OPTS} />);
    expect(ref.current).not.toBeNull();
    expect(ref.current?.getAttribute('data-section')).toBe('chart-line-trin');
  });

  it('exposes a stable displayName', () => {
    expect(ChartLineTrin.displayName).toBe('ChartLineTrin');
  });

  it('honours the animate flag', () => {
    const { container } = render(
      <ChartLineTrin data={TRIN_DATA} {...OPTS} animate={false} />,
    );
    const root = container.querySelector('[data-section="chart-line-trin"]');
    expect(root?.getAttribute('data-animate')).toBe('false');
  });
});
