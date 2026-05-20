import { afterEach, describe, expect, it } from 'vitest';
import { createRef } from 'react';
import { render, fireEvent, cleanup } from '@testing-library/react';
import {
  ChartLineRsi,
  DEFAULT_CHART_LINE_RSI_HEIGHT,
  DEFAULT_CHART_LINE_RSI_OVERBOUGHT_COLOR,
  DEFAULT_CHART_LINE_RSI_OVERSOLD_COLOR,
  DEFAULT_CHART_LINE_RSI_PADDING,
  DEFAULT_CHART_LINE_RSI_WIDTH,
  computeLineRsi,
  computeLineRsiLayout,
  describeLineRsiChart,
  getLineRsiFinitePoints,
  normalizeLineRsiPeriod,
  runLineRsi,
  type ChartLineRsiPoint,
} from './chart-line-rsi';

afterEach(() => {
  cleanup();
});

// rises then falls hard -> RSI 100, then neutral, then oversold
const RSI_DATA: ChartLineRsiPoint[] = [
  { x: 0, value: 10 },
  { x: 1, value: 20 },
  { x: 2, value: 30 },
  { x: 3, value: 10 },
  { x: 4, value: 5 },
];

describe('chart-line-rsi defaults', () => {
  it('positive size defaults', () => {
    expect(DEFAULT_CHART_LINE_RSI_WIDTH).toBeGreaterThan(0);
    expect(DEFAULT_CHART_LINE_RSI_HEIGHT).toBeGreaterThan(0);
    expect(DEFAULT_CHART_LINE_RSI_PADDING).toBeGreaterThan(0);
  });
});

describe('getLineRsiFinitePoints', () => {
  it('drops points with non-finite x or value', () => {
    const r = getLineRsiFinitePoints([
      { x: 0, value: 0 },
      { x: NaN, value: 1 },
      { x: 1, value: Infinity },
      { x: 2, value: 4 },
    ]);
    expect(r.length).toBe(2);
  });
  it('null returns []', () => {
    expect(getLineRsiFinitePoints(null)).toEqual([]);
  });
});

describe('normalizeLineRsiPeriod', () => {
  it('keeps a positive integer', () => {
    expect(normalizeLineRsiPeriod(14, 14)).toBe(14);
  });
  it('a sub-1 period falls back', () => {
    expect(normalizeLineRsiPeriod(0, 14)).toBe(14);
  });
  it('floors a fractional period', () => {
    expect(normalizeLineRsiPeriod(3.7, 14)).toBe(3);
  });
  it('a non-finite period falls back', () => {
    expect(normalizeLineRsiPeriod(NaN, 14)).toBe(14);
  });
});

describe('computeLineRsi', () => {
  it('is null until the window of changes is full', () => {
    expect(computeLineRsi([10, 20], 2)).toEqual([null, null]);
  });
  it('empty input -> []', () => {
    expect(computeLineRsi([], 2)).toEqual([]);
  });
  it('an all-gain window reads 100', () => {
    expect(computeLineRsi([10, 20, 30, 40], 2)).toEqual([
      null,
      null,
      100,
      100,
    ]);
  });
  it('an all-loss window reads 0', () => {
    expect(computeLineRsi([40, 30, 20, 10], 2)).toEqual([
      null,
      null,
      0,
      0,
    ]);
  });
  it('a flat window reads 50', () => {
    expect(computeLineRsi([5, 5, 5, 5], 2)).toEqual([null, null, 50, 50]);
  });
  it('Wilder-smooths the gains and losses', () => {
    const r = computeLineRsi([10, 20, 30, 10, 5], 2);
    expect(r[2]).toBe(100);
    expect(r[3]).toBeCloseTo(33.333, 2);
    expect(r[4]).toBeCloseTo(25, 6);
  });
});

describe('runLineRsi', () => {
  it('empty -> ok=false', () => {
    expect(runLineRsi([]).ok).toBe(false);
  });
  it('a single point -> ok=false', () => {
    expect(runLineRsi([{ x: 0, value: 1 }]).ok).toBe(false);
  });
  it('resolves the default period and thresholds', () => {
    const r = runLineRsi(RSI_DATA);
    expect(r.period).toBe(14);
    expect(r.overbought).toBe(70);
    expect(r.oversold).toBe(30);
  });
  it('computes the RSI series', () => {
    const r = runLineRsi(RSI_DATA, { period: 2 });
    expect(r.rsi[2]).toBe(100);
    expect(r.rsi[4]).toBeCloseTo(25, 6);
  });
  it('classifies each sample into a zone', () => {
    const r = runLineRsi(RSI_DATA, { period: 2 });
    expect(r.samples.map((s) => s.zone)).toEqual([
      null,
      null,
      'overbought',
      'neutral',
      'oversold',
    ]);
  });
  it('counts the overbought and oversold readings', () => {
    const r = runLineRsi(RSI_DATA, { period: 2 });
    expect(r.overboughtCount).toBe(1);
    expect(r.oversoldCount).toBe(1);
  });
  it('honours custom thresholds', () => {
    const r = runLineRsi(RSI_DATA, {
      period: 2,
      overbought: 90,
      oversold: 40,
    });
    expect(r.overbought).toBe(90);
    expect(r.oversold).toBe(40);
  });
  it('sorts the series by x', () => {
    const r = runLineRsi(
      [
        { x: 2, value: 4 },
        { x: 0, value: 0 },
        { x: 1, value: 8 },
      ],
      { period: 2 },
    );
    expect(r.series.map((p) => p.x)).toEqual([0, 1, 2]);
  });
});

describe('computeLineRsiLayout', () => {
  const base = { width: 500, height: 320, padding: 30, period: 2 };

  it('empty data -> ok=false', () => {
    expect(computeLineRsiLayout({ data: [], ...base }).ok).toBe(false);
  });

  it('degenerate canvas -> ok=false', () => {
    expect(
      computeLineRsiLayout({
        data: RSI_DATA,
        width: 20,
        height: 20,
        padding: 30,
        period: 2,
      }).ok,
    ).toBe(false);
  });

  it('stacks a price panel above an RSI panel', () => {
    const layout = computeLineRsiLayout({ data: RSI_DATA, ...base });
    expect(layout.ok).toBe(true);
    expect(layout.pricePanel.height).toBeGreaterThan(0);
    expect(layout.rsiPanel.height).toBeGreaterThan(0);
    expect(layout.rsiPanel.y).toBeGreaterThan(layout.pricePanel.y);
  });

  it('builds the price and RSI paths', () => {
    const layout = computeLineRsiLayout({ data: RSI_DATA, ...base });
    expect(layout.pricePath).toContain('M ');
    expect(layout.rsiPath).toContain('M ');
  });

  it('projects an RSI marker per defined RSI reading', () => {
    const layout = computeLineRsiLayout({ data: RSI_DATA, ...base });
    // RSI is defined from index 2 onward -> 3 markers
    expect(layout.rsiMarkers.length).toBe(3);
  });

  it('the RSI y axis spans 0 to 100', () => {
    const layout = computeLineRsiLayout({ data: RSI_DATA, ...base });
    expect(layout.rsiYTicks[0]!.value).toBe(0);
    expect(
      layout.rsiYTicks[layout.rsiYTicks.length - 1]!.value,
    ).toBe(100);
  });

  it('builds the overbought and oversold zone rects', () => {
    const layout = computeLineRsiLayout({ data: RSI_DATA, ...base });
    expect(layout.overboughtRect.height).toBeGreaterThan(0);
    expect(layout.oversoldRect.height).toBeGreaterThan(0);
  });

  it('exposes the zone counts and period', () => {
    const layout = computeLineRsiLayout({ data: RSI_DATA, ...base });
    expect(layout.overboughtCount).toBe(1);
    expect(layout.oversoldCount).toBe(1);
    expect(layout.period).toBe(2);
    expect(layout.totalPoints).toBe(5);
  });
});

describe('describeLineRsiChart', () => {
  it('no data -> No data', () => {
    expect(describeLineRsiChart([])).toBe('No data');
    expect(describeLineRsiChart(null)).toBe('No data');
  });
  it('summary mentions RSI + overbought + oversold', () => {
    const s = describeLineRsiChart(RSI_DATA, { period: 2 });
    expect(s).toContain('RSI');
    expect(s).toContain('overbought');
    expect(s).toContain('oversold');
  });
});

describe('<ChartLineRsi> render', () => {
  it('renders empty state with no data', () => {
    render(<ChartLineRsi data={[]} />);
    expect(
      document
        .querySelector('[data-section="chart-line-rsi"]')!
        .getAttribute('data-empty'),
    ).toBe('true');
  });

  it('renders the price line path', () => {
    render(<ChartLineRsi data={RSI_DATA} period={2} />);
    expect(
      document.querySelector('[data-section="chart-line-rsi-price-path"]'),
    ).not.toBeNull();
  });

  it('renders the RSI line and hides it via prop', () => {
    const { rerender } = render(
      <ChartLineRsi data={RSI_DATA} period={2} />,
    );
    expect(
      document.querySelector('[data-section="chart-line-rsi-rsi-line"]'),
    ).not.toBeNull();
    rerender(<ChartLineRsi data={RSI_DATA} period={2} showRsi={false} />);
    expect(
      document.querySelector('[data-section="chart-line-rsi-rsi-line"]'),
    ).toBeNull();
  });

  it('renders an RSI marker per defined reading', () => {
    render(<ChartLineRsi data={RSI_DATA} period={2} />);
    expect(
      document.querySelectorAll('[data-section="chart-line-rsi-marker"]')
        .length,
    ).toBe(3);
  });

  it('colours RSI markers by zone', () => {
    render(<ChartLineRsi data={RSI_DATA} period={2} />);
    expect(
      document
        .querySelector(
          '[data-section="chart-line-rsi-marker"][data-zone="overbought"]',
        )!
        .getAttribute('fill'),
    ).toBe(DEFAULT_CHART_LINE_RSI_OVERBOUGHT_COLOR);
    expect(
      document
        .querySelector(
          '[data-section="chart-line-rsi-marker"][data-zone="oversold"]',
        )!
        .getAttribute('fill'),
    ).toBe(DEFAULT_CHART_LINE_RSI_OVERSOLD_COLOR);
  });

  it('renders the overbought and oversold zones, hidden via prop', () => {
    const { rerender } = render(
      <ChartLineRsi data={RSI_DATA} period={2} />,
    );
    expect(
      document.querySelector(
        '[data-section="chart-line-rsi-overbought-zone"]',
      ),
    ).not.toBeNull();
    expect(
      document.querySelector(
        '[data-section="chart-line-rsi-oversold-zone"]',
      ),
    ).not.toBeNull();
    rerender(
      <ChartLineRsi data={RSI_DATA} period={2} showZones={false} />,
    );
    expect(
      document.querySelector(
        '[data-section="chart-line-rsi-overbought-zone"]',
      ),
    ).toBeNull();
  });

  it('renders the overbought and oversold threshold lines', () => {
    render(<ChartLineRsi data={RSI_DATA} period={2} />);
    expect(
      document.querySelector(
        '[data-section="chart-line-rsi-threshold-line"][data-kind="overbought"]',
      ),
    ).not.toBeNull();
    expect(
      document.querySelector(
        '[data-section="chart-line-rsi-threshold-line"][data-kind="oversold"]',
      ),
    ).not.toBeNull();
  });

  it('renders a label for each panel', () => {
    render(<ChartLineRsi data={RSI_DATA} period={2} />);
    expect(
      document.querySelector(
        '[data-section="chart-line-rsi-panel-label"][data-panel="price"]',
      )?.textContent,
    ).toBe('Price');
    expect(
      document.querySelector(
        '[data-section="chart-line-rsi-panel-label"][data-panel="rsi"]',
      )?.textContent,
    ).toBe('RSI');
  });

  it('price dots are off by default and shown via prop', () => {
    const { rerender } = render(
      <ChartLineRsi data={RSI_DATA} period={2} />,
    );
    expect(
      document.querySelector('[data-section="chart-line-rsi-dot"]'),
    ).toBeNull();
    rerender(<ChartLineRsi data={RSI_DATA} period={2} showDots />);
    expect(
      document.querySelectorAll('[data-section="chart-line-rsi-dot"]')
        .length,
    ).toBe(5);
  });

  it('config badge shows the period and zone thresholds', () => {
    render(<ChartLineRsi data={RSI_DATA} period={2} />);
    expect(
      document.querySelector(
        '[data-section="chart-line-rsi-badge-period"]',
      )?.textContent,
    ).toBe('p=2');
    expect(
      document.querySelector(
        '[data-section="chart-line-rsi-badge-zones"]',
      )?.textContent,
    ).toBe('ob=70 os=30');
  });

  it('hides the config badge via showConfigBadge=false', () => {
    render(
      <ChartLineRsi data={RSI_DATA} period={2} showConfigBadge={false} />,
    );
    expect(
      document.querySelector('[data-section="chart-line-rsi-badge"]'),
    ).toBeNull();
  });

  it('ARIA: region + img + sr-only desc', () => {
    render(<ChartLineRsi data={RSI_DATA} period={2} />);
    expect(
      document
        .querySelector('[data-section="chart-line-rsi"]')!
        .getAttribute('role'),
    ).toBe('region');
    expect(
      document
        .querySelector('[data-section="chart-line-rsi-svg"]')!
        .getAttribute('role'),
    ).toBe('img');
    expect(
      document.querySelector('[data-section="chart-line-rsi-aria-desc"]')!
        .textContent,
    ).toContain('RSI');
  });

  it('root carries data-* attributes', () => {
    render(<ChartLineRsi data={RSI_DATA} period={2} />);
    const root = document.querySelector('[data-section="chart-line-rsi"]');
    expect(root!.getAttribute('data-period')).toBe('2');
    expect(root!.getAttribute('data-overbought-count')).toBe('1');
    expect(root!.getAttribute('data-oversold-count')).toBe('1');
    expect(root!.getAttribute('data-total-points')).toBe('5');
  });

  it('RSI marker exposes the rsi and zone attributes', () => {
    render(<ChartLineRsi data={RSI_DATA} period={2} />);
    const markers = document.querySelectorAll(
      '[data-section="chart-line-rsi-marker"]',
    );
    expect(markers[0]!.getAttribute('data-zone')).toBe('overbought');
    expect(Number(markers[0]!.getAttribute('data-rsi'))).toBe(100);
  });

  it('tooltip on an RSI marker shows price + rsi + zone', () => {
    render(<ChartLineRsi data={RSI_DATA} period={2} />);
    const markers = document.querySelectorAll(
      '[data-section="chart-line-rsi-marker"]',
    );
    fireEvent.mouseEnter(markers[0]!);
    expect(
      document.querySelector(
        '[data-section="chart-line-rsi-tooltip-rsi"]',
      )?.textContent,
    ).toBe('rsi: 100');
    expect(
      document.querySelector(
        '[data-section="chart-line-rsi-tooltip-zone"]',
      )?.textContent,
    ).toBe('overbought');
    fireEvent.mouseLeave(markers[0]!);
    expect(
      document.querySelector('[data-section="chart-line-rsi-tooltip"]'),
    ).toBeNull();
  });

  it('omits the tooltip when showTooltip=false', () => {
    render(
      <ChartLineRsi data={RSI_DATA} period={2} showTooltip={false} />,
    );
    const marker = document.querySelector(
      '[data-section="chart-line-rsi-marker"]',
    );
    fireEvent.mouseEnter(marker!);
    expect(
      document.querySelector('[data-section="chart-line-rsi-tooltip"]'),
    ).toBeNull();
  });

  it('onPointClick fires from an RSI marker', () => {
    let captured: number | null = null;
    render(
      <ChartLineRsi
        data={RSI_DATA}
        period={2}
        onPointClick={({ point }) => {
          captured = point.index;
        }}
      />,
    );
    const markers = document.querySelectorAll(
      '[data-section="chart-line-rsi-marker"]',
    );
    fireEvent.click(markers[0]!);
    expect(captured).toBe(2);
  });

  it('legend has three toggle items and toggles a series', () => {
    let lastHidden: ReadonlySet<string> | null = null;
    render(
      <ChartLineRsi
        data={RSI_DATA}
        period={2}
        onHiddenSeriesChange={(h) => {
          lastHidden = h;
        }}
      />,
    );
    const items = document.querySelectorAll(
      '[data-section="chart-line-rsi-legend-item"]',
    );
    expect(items.length).toBe(3);
    fireEvent.click(items[1]!); // rsi
    expect(lastHidden).not.toBeNull();
    expect(lastHidden!.has('rsi')).toBe(true);
  });

  it('the legend toggle hides the zones', () => {
    render(
      <ChartLineRsi data={RSI_DATA} period={2} hiddenSeries={['zones']} />,
    );
    expect(
      document.querySelector(
        '[data-section="chart-line-rsi-overbought-zone"]',
      ),
    ).toBeNull();
  });

  it('omits the legend when showLegend=false', () => {
    render(<ChartLineRsi data={RSI_DATA} period={2} showLegend={false} />);
    expect(
      document.querySelector('[data-section="chart-line-rsi-legend"]'),
    ).toBeNull();
  });

  it('animate flag toggles data-animate + class', () => {
    const { rerender } = render(
      <ChartLineRsi data={RSI_DATA} period={2} animate={true} />,
    );
    const root = document.querySelector('[data-section="chart-line-rsi"]');
    expect(root!.getAttribute('data-animate')).toBe('true');
    expect(root!.className).toContain('motion-safe:animate-fade-in');
    rerender(<ChartLineRsi data={RSI_DATA} period={2} animate={false} />);
    expect(
      document
        .querySelector('[data-section="chart-line-rsi"]')!
        .getAttribute('data-animate'),
    ).toBe('false');
  });

  it('ref forwarding', () => {
    const ref = createRef<HTMLDivElement>();
    render(<ChartLineRsi ref={ref} data={RSI_DATA} period={2} />);
    expect(ref.current!.getAttribute('data-section')).toBe(
      'chart-line-rsi',
    );
  });

  it('has displayName', () => {
    expect(ChartLineRsi.displayName).toBe('ChartLineRsi');
  });

  it('custom ariaLabel applied to root and svg', () => {
    render(
      <ChartLineRsi data={RSI_DATA} period={2} ariaLabel="Momentum" />,
    );
    expect(
      document
        .querySelector('[data-section="chart-line-rsi"]')!
        .getAttribute('aria-label'),
    ).toBe('Momentum');
    expect(
      document
        .querySelector('[data-section="chart-line-rsi-svg"]')!
        .getAttribute('aria-label'),
    ).toBe('Momentum');
  });
});
