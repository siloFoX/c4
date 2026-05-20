import { afterEach, describe, expect, it } from 'vitest';
import { createRef } from 'react';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import {
  ChartLineIchimoku,
  DEFAULT_CHART_LINE_ICHIMOKU_HEIGHT,
  DEFAULT_CHART_LINE_ICHIMOKU_PADDING,
  DEFAULT_CHART_LINE_ICHIMOKU_WIDTH,
  computeLineIchimokuLayout,
  computeLineIchimokuMidline,
  describeLineIchimokuChart,
  getLineIchimokuFinitePoints,
  normalizeLineIchimokuPeriod,
  runLineIchimoku,
  type ChartLineIchimokuPoint,
} from './chart-line-ichimoku';

afterEach(() => {
  cleanup();
});

const ICHIMOKU_DATA: ChartLineIchimokuPoint[] = [
  { x: 0, value: 10 },
  { x: 1, value: 50 },
  { x: 2, value: 40 },
  { x: 3, value: 30 },
  { x: 4, value: 20 },
  { x: 5, value: 10 },
  { x: 6, value: 30 },
  { x: 7, value: 50 },
];
// small periods so every Ichimoku line is defined on the 8-point fixture
const SMALL = {
  conversionPeriod: 2,
  basePeriod: 3,
  leadingPeriod: 4,
  displacement: 2,
};

describe('chart-line-ichimoku defaults', () => {
  it('positive size defaults', () => {
    expect(DEFAULT_CHART_LINE_ICHIMOKU_WIDTH).toBeGreaterThan(0);
    expect(DEFAULT_CHART_LINE_ICHIMOKU_HEIGHT).toBeGreaterThan(0);
    expect(DEFAULT_CHART_LINE_ICHIMOKU_PADDING).toBeGreaterThan(0);
  });
});

describe('getLineIchimokuFinitePoints', () => {
  it('drops points with non-finite x or value', () => {
    const r = getLineIchimokuFinitePoints([
      { x: 0, value: 0 },
      { x: NaN, value: 1 },
      { x: 1, value: Infinity },
      { x: 2, value: 4 },
    ]);
    expect(r.length).toBe(2);
  });
  it('null returns []', () => {
    expect(getLineIchimokuFinitePoints(null)).toEqual([]);
  });
});

describe('normalizeLineIchimokuPeriod', () => {
  it('keeps a positive integer', () => {
    expect(normalizeLineIchimokuPeriod(9, 26)).toBe(9);
  });
  it('a sub-1 period falls back', () => {
    expect(normalizeLineIchimokuPeriod(0, 26)).toBe(26);
    expect(normalizeLineIchimokuPeriod(-3, 26)).toBe(26);
  });
  it('floors a fractional period', () => {
    expect(normalizeLineIchimokuPeriod(3.7, 26)).toBe(3);
  });
  it('a non-finite period falls back', () => {
    expect(normalizeLineIchimokuPeriod(NaN, 26)).toBe(26);
  });
});

describe('computeLineIchimokuMidline', () => {
  it('is null until the window is full', () => {
    expect(computeLineIchimokuMidline([10, 20, 30], 2)).toEqual([
      null,
      15,
      25,
    ]);
  });
  it('is (highest + lowest) / 2 over the window', () => {
    expect(computeLineIchimokuMidline([10, 20, 30, 5], 3)).toEqual([
      null,
      null,
      20,
      17.5,
    ]);
  });
  it('a period of 1 returns each value itself', () => {
    expect(computeLineIchimokuMidline([10, 20, 30], 1)).toEqual([
      10, 20, 30,
    ]);
  });
  it('empty input -> []', () => {
    expect(computeLineIchimokuMidline([], 2)).toEqual([]);
  });
  it('a window longer than the data -> all null', () => {
    expect(computeLineIchimokuMidline([5], 2)).toEqual([null]);
  });
});

describe('runLineIchimoku', () => {
  it('empty -> ok=false', () => {
    expect(runLineIchimoku([]).ok).toBe(false);
  });
  it('resolves the default periods', () => {
    const r = runLineIchimoku(ICHIMOKU_DATA);
    expect(r.conversionPeriod).toBe(9);
    expect(r.basePeriod).toBe(26);
    expect(r.leadingPeriod).toBe(52);
    expect(r.displacement).toBe(26);
  });
  it('computes the tenkan (conversion) line', () => {
    const r = runLineIchimoku(ICHIMOKU_DATA, SMALL);
    expect(r.tenkan[0]).toBeNull();
    expect(r.tenkan[1]).toBe(30); // (10,50) midpoint
    expect(r.tenkan[2]).toBe(45); // (50,40) midpoint
  });
  it('computes the kijun (base) line', () => {
    const r = runLineIchimoku(ICHIMOKU_DATA, SMALL);
    expect(r.kijun[1]).toBeNull();
    expect(r.kijun[2]).toBe(30); // (10..40) midpoint
    expect(r.kijun[3]).toBe(40); // (50,40,30) midpoint
  });
  it('shifts the leading spans forward by the displacement', () => {
    const r = runLineIchimoku(ICHIMOKU_DATA, SMALL);
    // span A is defined from index 2; displaced +2 -> x 4
    expect(r.spanA[0]!.index).toBe(2);
    expect(r.spanA[0]!.x).toBe(4);
  });
  it('shifts the chikou span back by the displacement', () => {
    const r = runLineIchimoku(ICHIMOKU_DATA, SMALL);
    expect(r.chikou[0]!.x).toBe(-2);
    expect(r.chikou[0]!.value).toBe(10);
  });
  it('builds the kumo cloud where both spans are defined', () => {
    const r = runLineIchimoku(ICHIMOKU_DATA, SMALL);
    expect(r.cloud.length).toBe(5); // indices 3..7
    expect(r.cloud[0]!.spanA).toBe(37.5);
    expect(r.cloud[0]!.spanB).toBe(30);
  });
  it('flags each cloud sample bullish or bearish', () => {
    const r = runLineIchimoku(ICHIMOKU_DATA, SMALL);
    expect(r.cloud.map((c) => c.bullish)).toEqual([
      true,
      false,
      false,
      true,
      true,
    ]);
  });
  it('counts the bullish and bearish cloud samples', () => {
    const r = runLineIchimoku(ICHIMOKU_DATA, SMALL);
    expect(r.bullishCount).toBe(3);
    expect(r.bearishCount).toBe(2);
  });
  it('sorts the series by x', () => {
    const r = runLineIchimoku(
      [
        { x: 2, value: 4 },
        { x: 0, value: 0 },
        { x: 1, value: 8 },
      ],
      SMALL,
    );
    expect(r.series.map((p) => p.x)).toEqual([0, 1, 2]);
  });
  it('honours custom periods', () => {
    const r = runLineIchimoku(ICHIMOKU_DATA, SMALL);
    expect(r.conversionPeriod).toBe(2);
    expect(r.leadingPeriod).toBe(4);
  });
});

describe('computeLineIchimokuLayout', () => {
  const base = { width: 600, height: 280, padding: 30, ...SMALL };

  it('empty data -> ok=false', () => {
    expect(computeLineIchimokuLayout({ data: [], ...base }).ok).toBe(
      false,
    );
  });

  it('degenerate canvas -> ok=false', () => {
    expect(
      computeLineIchimokuLayout({
        data: ICHIMOKU_DATA,
        width: 20,
        height: 20,
        padding: 30,
        ...SMALL,
      }).ok,
    ).toBe(false);
  });

  it('builds the price line path', () => {
    const layout = computeLineIchimokuLayout({
      data: ICHIMOKU_DATA,
      ...base,
    });
    expect(layout.ok).toBe(true);
    expect(layout.pricePath).toContain('M ');
    expect(layout.priceDots.length).toBe(8);
  });

  it('builds the tenkan, kijun and chikou paths', () => {
    const layout = computeLineIchimokuLayout({
      data: ICHIMOKU_DATA,
      ...base,
    });
    expect(layout.tenkanPath).toContain('M ');
    expect(layout.kijunPath).toContain('M ');
    expect(layout.chikouPath).toContain('M ');
  });

  it('builds the leading-span paths', () => {
    const layout = computeLineIchimokuLayout({
      data: ICHIMOKU_DATA,
      ...base,
    });
    expect(layout.spanAPath).toContain('M ');
    expect(layout.spanBPath).toContain('M ');
  });

  it('builds one cloud segment per consecutive cloud pair', () => {
    const layout = computeLineIchimokuLayout({
      data: ICHIMOKU_DATA,
      ...base,
    });
    expect(layout.cloudSegments.length).toBe(4); // 5 cloud samples
  });

  it('cloud segments carry the bullish flag', () => {
    const layout = computeLineIchimokuLayout({
      data: ICHIMOKU_DATA,
      ...base,
    });
    expect(layout.cloudSegments.map((s) => s.bullish)).toEqual([
      true,
      false,
      false,
      true,
    ]);
  });

  it('price dots carry the tenkan and kijun values', () => {
    const layout = computeLineIchimokuLayout({
      data: ICHIMOKU_DATA,
      ...base,
    });
    expect(layout.priceDots[0]!.tenkan).toBeNull();
    expect(layout.priceDots[1]!.tenkan).toBe(30);
    expect(layout.priceDots[3]!.kijun).toBe(40);
  });

  it('exposes the cloud counts', () => {
    const layout = computeLineIchimokuLayout({
      data: ICHIMOKU_DATA,
      ...base,
    });
    expect(layout.bullishCount).toBe(3);
    expect(layout.bearishCount).toBe(2);
  });

  it('the x range extends to the displaced spans', () => {
    const layout = computeLineIchimokuLayout({
      data: ICHIMOKU_DATA,
      ...base,
    });
    // chikou reaches x -2, the cloud reaches x 9
    expect(layout.xMin).toBeLessThanOrEqual(-2);
    expect(layout.xMax).toBeGreaterThanOrEqual(9);
  });
});

describe('describeLineIchimokuChart', () => {
  it('no data -> No data', () => {
    expect(describeLineIchimokuChart([])).toBe('No data');
    expect(describeLineIchimokuChart(null)).toBe('No data');
  });
  it('summary mentions Ichimoku + cloud + kumo + conversion', () => {
    const s = describeLineIchimokuChart(ICHIMOKU_DATA, SMALL);
    expect(s).toContain('Ichimoku');
    expect(s).toContain('cloud');
    expect(s).toContain('kumo');
    expect(s).toContain('conversion');
  });
});

describe('<ChartLineIchimoku> render', () => {
  it('renders empty state with no data', () => {
    render(<ChartLineIchimoku data={[]} />);
    expect(
      document
        .querySelector('[data-section="chart-line-ichimoku"]')!
        .getAttribute('data-empty'),
    ).toBe('true');
  });

  it('renders the price line path', () => {
    render(<ChartLineIchimoku data={ICHIMOKU_DATA} {...SMALL} />);
    expect(
      document.querySelector(
        '[data-section="chart-line-ichimoku-price-path"]',
      ),
    ).not.toBeNull();
  });

  it('renders the tenkan and kijun lines, hidden via props', () => {
    const { rerender } = render(
      <ChartLineIchimoku data={ICHIMOKU_DATA} {...SMALL} />,
    );
    expect(
      document.querySelector('[data-section="chart-line-ichimoku-tenkan"]'),
    ).not.toBeNull();
    expect(
      document.querySelector('[data-section="chart-line-ichimoku-kijun"]'),
    ).not.toBeNull();
    rerender(
      <ChartLineIchimoku
        data={ICHIMOKU_DATA}
        {...SMALL}
        showTenkan={false}
        showKijun={false}
      />,
    );
    expect(
      document.querySelector('[data-section="chart-line-ichimoku-tenkan"]'),
    ).toBeNull();
    expect(
      document.querySelector('[data-section="chart-line-ichimoku-kijun"]'),
    ).toBeNull();
  });

  it('renders the chikou span and hides it via prop', () => {
    const { rerender } = render(
      <ChartLineIchimoku data={ICHIMOKU_DATA} {...SMALL} />,
    );
    expect(
      document.querySelector('[data-section="chart-line-ichimoku-chikou"]'),
    ).not.toBeNull();
    rerender(
      <ChartLineIchimoku
        data={ICHIMOKU_DATA}
        {...SMALL}
        showChikou={false}
      />,
    );
    expect(
      document.querySelector('[data-section="chart-line-ichimoku-chikou"]'),
    ).toBeNull();
  });

  it('renders the kumo cloud segments and the span lines', () => {
    render(<ChartLineIchimoku data={ICHIMOKU_DATA} {...SMALL} />);
    expect(
      document.querySelectorAll(
        '[data-section="chart-line-ichimoku-cloud-segment"]',
      ).length,
    ).toBe(4);
    expect(
      document.querySelector('[data-section="chart-line-ichimoku-span-a"]'),
    ).not.toBeNull();
    expect(
      document.querySelector('[data-section="chart-line-ichimoku-span-b"]'),
    ).not.toBeNull();
  });

  it('hides the cloud via showCloud=false', () => {
    render(
      <ChartLineIchimoku data={ICHIMOKU_DATA} {...SMALL} showCloud={false} />,
    );
    expect(
      document.querySelector(
        '[data-section="chart-line-ichimoku-cloud-segment"]',
      ),
    ).toBeNull();
    expect(
      document.querySelector('[data-section="chart-line-ichimoku-span-a"]'),
    ).toBeNull();
  });

  it('cloud segments carry a bullish flag', () => {
    render(<ChartLineIchimoku data={ICHIMOKU_DATA} {...SMALL} />);
    const segs = document.querySelectorAll(
      '[data-section="chart-line-ichimoku-cloud-segment"]',
    );
    expect(segs[0]!.getAttribute('data-bullish')).toBe('true');
    expect(segs[1]!.getAttribute('data-bullish')).toBe('false');
  });

  it('price dots are off by default and shown via prop', () => {
    const { rerender } = render(
      <ChartLineIchimoku data={ICHIMOKU_DATA} {...SMALL} />,
    );
    expect(
      document.querySelector('[data-section="chart-line-ichimoku-dot"]'),
    ).toBeNull();
    rerender(
      <ChartLineIchimoku data={ICHIMOKU_DATA} {...SMALL} showDots />,
    );
    expect(
      document.querySelectorAll('[data-section="chart-line-ichimoku-dot"]')
        .length,
    ).toBe(8);
  });

  it('config badge shows the periods and the cloud tilt', () => {
    render(<ChartLineIchimoku data={ICHIMOKU_DATA} {...SMALL} />);
    expect(
      document.querySelector(
        '[data-section="chart-line-ichimoku-badge-periods"]',
      )?.textContent,
    ).toBe('2-3-4');
    expect(
      document.querySelector(
        '[data-section="chart-line-ichimoku-badge-cloud"]',
      )?.textContent,
    ).toBe('cloud=bull');
  });

  it('hides the config badge via showConfigBadge=false', () => {
    render(
      <ChartLineIchimoku
        data={ICHIMOKU_DATA}
        {...SMALL}
        showConfigBadge={false}
      />,
    );
    expect(
      document.querySelector('[data-section="chart-line-ichimoku-badge"]'),
    ).toBeNull();
  });

  it('ARIA: region + img + sr-only desc', () => {
    render(<ChartLineIchimoku data={ICHIMOKU_DATA} {...SMALL} />);
    expect(
      document
        .querySelector('[data-section="chart-line-ichimoku"]')!
        .getAttribute('role'),
    ).toBe('region');
    expect(
      document
        .querySelector('[data-section="chart-line-ichimoku-svg"]')!
        .getAttribute('role'),
    ).toBe('img');
    expect(
      document.querySelector(
        '[data-section="chart-line-ichimoku-aria-desc"]',
      )!.textContent,
    ).toContain('Ichimoku');
  });

  it('root carries data-* attributes', () => {
    render(<ChartLineIchimoku data={ICHIMOKU_DATA} {...SMALL} />);
    const root = document.querySelector(
      '[data-section="chart-line-ichimoku"]',
    );
    expect(root!.getAttribute('data-bullish-count')).toBe('3');
    expect(root!.getAttribute('data-bearish-count')).toBe('2');
    expect(root!.getAttribute('data-conversion-period')).toBe('2');
    expect(root!.getAttribute('data-total-points')).toBe('8');
  });

  it('tooltip on a price dot shows price + tenkan + kijun', () => {
    render(<ChartLineIchimoku data={ICHIMOKU_DATA} {...SMALL} showDots />);
    const dots = document.querySelectorAll(
      '[data-section="chart-line-ichimoku-dot"]',
    );
    fireEvent.mouseEnter(dots[3]!);
    expect(
      document.querySelector(
        '[data-section="chart-line-ichimoku-tooltip-price"]',
      )?.textContent,
    ).toBe('price: 30');
    expect(
      document.querySelector(
        '[data-section="chart-line-ichimoku-tooltip-tenkan"]',
      )?.textContent,
    ).toBe('tenkan: 35');
    expect(
      document.querySelector(
        '[data-section="chart-line-ichimoku-tooltip-kijun"]',
      )?.textContent,
    ).toBe('kijun: 40');
    fireEvent.mouseLeave(dots[3]!);
    expect(
      document.querySelector('[data-section="chart-line-ichimoku-tooltip"]'),
    ).toBeNull();
  });

  it('omits the tooltip when showTooltip=false', () => {
    render(
      <ChartLineIchimoku
        data={ICHIMOKU_DATA}
        {...SMALL}
        showDots
        showTooltip={false}
      />,
    );
    const dot = document.querySelector(
      '[data-section="chart-line-ichimoku-dot"]',
    );
    fireEvent.mouseEnter(dot!);
    expect(
      document.querySelector('[data-section="chart-line-ichimoku-tooltip"]'),
    ).toBeNull();
  });

  it('onPointClick fires with the price-dot payload', () => {
    let captured: number | null = null;
    render(
      <ChartLineIchimoku
        data={ICHIMOKU_DATA}
        {...SMALL}
        showDots
        onPointClick={({ point }) => {
          captured = point.index;
        }}
      />,
    );
    const dots = document.querySelectorAll(
      '[data-section="chart-line-ichimoku-dot"]',
    );
    fireEvent.click(dots[2]!);
    expect(captured).toBe(2);
  });

  it('legend has five toggle items and toggles a series', () => {
    let lastHidden: ReadonlySet<string> | null = null;
    render(
      <ChartLineIchimoku
        data={ICHIMOKU_DATA}
        {...SMALL}
        onHiddenSeriesChange={(h) => {
          lastHidden = h;
        }}
      />,
    );
    const items = document.querySelectorAll(
      '[data-section="chart-line-ichimoku-legend-item"]',
    );
    expect(items.length).toBe(5);
    fireEvent.click(items[1]!); // tenkan
    expect(lastHidden).not.toBeNull();
    expect(lastHidden!.has('tenkan')).toBe(true);
  });

  it('the legend toggle hides a line', () => {
    render(
      <ChartLineIchimoku
        data={ICHIMOKU_DATA}
        {...SMALL}
        hiddenSeries={['tenkan']}
      />,
    );
    expect(
      document.querySelector('[data-section="chart-line-ichimoku-tenkan"]'),
    ).toBeNull();
  });

  it('omits the legend when showLegend=false', () => {
    render(
      <ChartLineIchimoku
        data={ICHIMOKU_DATA}
        {...SMALL}
        showLegend={false}
      />,
    );
    expect(
      document.querySelector('[data-section="chart-line-ichimoku-legend"]'),
    ).toBeNull();
  });

  it('animate flag toggles data-animate + class', () => {
    const { rerender } = render(
      <ChartLineIchimoku data={ICHIMOKU_DATA} {...SMALL} animate={true} />,
    );
    const root = document.querySelector(
      '[data-section="chart-line-ichimoku"]',
    );
    expect(root!.getAttribute('data-animate')).toBe('true');
    expect(root!.className).toContain('motion-safe:animate-fade-in');
    rerender(
      <ChartLineIchimoku data={ICHIMOKU_DATA} {...SMALL} animate={false} />,
    );
    expect(
      document
        .querySelector('[data-section="chart-line-ichimoku"]')!
        .getAttribute('data-animate'),
    ).toBe('false');
  });

  it('ref forwarding', () => {
    const ref = createRef<HTMLDivElement>();
    render(<ChartLineIchimoku ref={ref} data={ICHIMOKU_DATA} {...SMALL} />);
    expect(ref.current!.getAttribute('data-section')).toBe(
      'chart-line-ichimoku',
    );
  });

  it('has displayName', () => {
    expect(ChartLineIchimoku.displayName).toBe('ChartLineIchimoku');
  });

  it('custom ariaLabel applied to root and svg', () => {
    render(
      <ChartLineIchimoku
        data={ICHIMOKU_DATA}
        {...SMALL}
        ariaLabel="Kumo view"
      />,
    );
    expect(
      document
        .querySelector('[data-section="chart-line-ichimoku"]')!
        .getAttribute('aria-label'),
    ).toBe('Kumo view');
    expect(
      document
        .querySelector('[data-section="chart-line-ichimoku-svg"]')!
        .getAttribute('aria-label'),
    ).toBe('Kumo view');
  });

  it('xLabel and yLabel render axis text', () => {
    render(
      <ChartLineIchimoku
        data={ICHIMOKU_DATA}
        {...SMALL}
        xLabel="bar"
        yLabel="price"
      />,
    );
    expect(screen.getByText('bar').getAttribute('data-section')).toBe(
      'chart-line-ichimoku-x-label',
    );
    expect(screen.getByText('price').getAttribute('data-section')).toBe(
      'chart-line-ichimoku-y-label',
    );
  });
});
