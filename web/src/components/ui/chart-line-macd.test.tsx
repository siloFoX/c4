import { afterEach, describe, expect, it } from 'vitest';
import { createRef } from 'react';
import { render, fireEvent, cleanup } from '@testing-library/react';
import {
  ChartLineMacd,
  DEFAULT_CHART_LINE_MACD_HEIGHT,
  DEFAULT_CHART_LINE_MACD_PADDING,
  DEFAULT_CHART_LINE_MACD_WIDTH,
  computeLineMacdEMA,
  computeLineMacdLayout,
  describeLineMacdChart,
  getLineMacdFinitePoints,
  normalizeLineMacdPeriod,
  runLineMacd,
  type ChartLineMacdPoint,
} from './chart-line-macd';

afterEach(() => {
  cleanup();
});

const MACD_DATA: ChartLineMacdPoint[] = [
  { x: 0, value: 10 },
  { x: 1, value: 20 },
  { x: 2, value: 30 },
  { x: 3, value: 20 },
];
// small periods so the three EMAs are exact on the 4-point fixture
const SMALL = { fastPeriod: 1, slowPeriod: 3, signalPeriod: 3 };

describe('chart-line-macd defaults', () => {
  it('positive size defaults', () => {
    expect(DEFAULT_CHART_LINE_MACD_WIDTH).toBeGreaterThan(0);
    expect(DEFAULT_CHART_LINE_MACD_HEIGHT).toBeGreaterThan(0);
    expect(DEFAULT_CHART_LINE_MACD_PADDING).toBeGreaterThan(0);
  });
});

describe('getLineMacdFinitePoints', () => {
  it('drops points with non-finite x or value', () => {
    const r = getLineMacdFinitePoints([
      { x: 0, value: 0 },
      { x: NaN, value: 1 },
      { x: 1, value: Infinity },
      { x: 2, value: 4 },
    ]);
    expect(r.length).toBe(2);
  });
  it('null returns []', () => {
    expect(getLineMacdFinitePoints(null)).toEqual([]);
  });
});

describe('normalizeLineMacdPeriod', () => {
  it('keeps a positive integer', () => {
    expect(normalizeLineMacdPeriod(12, 12)).toBe(12);
  });
  it('a sub-1 period falls back', () => {
    expect(normalizeLineMacdPeriod(0, 12)).toBe(12);
  });
  it('floors a fractional period', () => {
    expect(normalizeLineMacdPeriod(3.7, 12)).toBe(3);
  });
  it('a non-finite period falls back', () => {
    expect(normalizeLineMacdPeriod(NaN, 12)).toBe(12);
  });
});

describe('computeLineMacdEMA', () => {
  it('a period of 1 is the identity', () => {
    expect(computeLineMacdEMA([10, 20, 30, 20], 1)).toEqual([
      10, 20, 30, 20,
    ]);
  });
  it('smooths with alpha = 2 / (period + 1)', () => {
    // period 3 -> alpha 0.5
    expect(computeLineMacdEMA([10, 20, 30, 20], 3)).toEqual([
      10, 15, 22.5, 21.25,
    ]);
  });
  it('a constant series stays constant', () => {
    expect(computeLineMacdEMA([5, 5, 5], 3)).toEqual([5, 5, 5]);
  });
  it('empty input -> []', () => {
    expect(computeLineMacdEMA([], 3)).toEqual([]);
  });
});

describe('runLineMacd', () => {
  it('empty -> ok=false', () => {
    expect(runLineMacd([]).ok).toBe(false);
  });
  it('a single point -> ok=false', () => {
    expect(runLineMacd([{ x: 0, value: 1 }]).ok).toBe(false);
  });
  it('resolves the default periods', () => {
    const r = runLineMacd(MACD_DATA);
    expect(r.fastPeriod).toBe(12);
    expect(r.slowPeriod).toBe(26);
    expect(r.signalPeriod).toBe(9);
  });
  it('the MACD line is the fast EMA minus the slow EMA', () => {
    const r = runLineMacd(MACD_DATA, SMALL);
    expect(r.macd).toEqual([0, 5, 7.5, -1.25]);
  });
  it('the signal line is an EMA of the MACD line', () => {
    const r = runLineMacd(MACD_DATA, SMALL);
    expect(r.signal).toEqual([0, 2.5, 5, 1.875]);
  });
  it('the histogram is the MACD minus the signal', () => {
    const r = runLineMacd(MACD_DATA, SMALL);
    expect(r.histogram).toEqual([0, 2.5, 2.5, -3.125]);
  });
  it('the samples carry every per-period value', () => {
    const r = runLineMacd(MACD_DATA, SMALL);
    expect(r.samples.length).toBe(4);
    expect(r.samples[2]!.macd).toBe(7.5);
    expect(r.samples[2]!.histogram).toBe(2.5);
  });
  it('sorts the series by x', () => {
    const r = runLineMacd(
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
    const r = runLineMacd(MACD_DATA, SMALL);
    expect(r.fastPeriod).toBe(1);
    expect(r.slowPeriod).toBe(3);
  });
});

describe('computeLineMacdLayout', () => {
  const base = { width: 500, height: 320, padding: 30, ...SMALL };

  it('empty data -> ok=false', () => {
    expect(computeLineMacdLayout({ data: [], ...base }).ok).toBe(false);
  });

  it('degenerate canvas -> ok=false', () => {
    expect(
      computeLineMacdLayout({
        data: MACD_DATA,
        width: 20,
        height: 20,
        padding: 30,
        ...SMALL,
      }).ok,
    ).toBe(false);
  });

  it('stacks a price panel above a MACD panel', () => {
    const layout = computeLineMacdLayout({ data: MACD_DATA, ...base });
    expect(layout.ok).toBe(true);
    expect(layout.pricePanel.height).toBeGreaterThan(0);
    expect(layout.macdPanel.height).toBeGreaterThan(0);
    expect(layout.macdPanel.y).toBeGreaterThan(layout.pricePanel.y);
  });

  it('builds the price, MACD and signal paths', () => {
    const layout = computeLineMacdLayout({ data: MACD_DATA, ...base });
    expect(layout.pricePath).toContain('M ');
    expect(layout.macdPath).toContain('M ');
    expect(layout.signalPath).toContain('M ');
  });

  it('builds one histogram bar per period', () => {
    const layout = computeLineMacdLayout({ data: MACD_DATA, ...base });
    expect(layout.histogramBars.length).toBe(4);
  });

  it('histogram bars carry the value and a positive flag', () => {
    const layout = computeLineMacdLayout({ data: MACD_DATA, ...base });
    expect(layout.histogramBars[1]!.histogram).toBe(2.5);
    expect(layout.histogramBars[1]!.positive).toBe(true);
    expect(layout.histogramBars[3]!.positive).toBe(false);
  });

  it('the MACD panel y range is symmetric about zero', () => {
    const layout = computeLineMacdLayout({ data: MACD_DATA, ...base });
    expect(layout.macdYMin).toBe(-layout.macdYMax);
    expect(layout.macdYMax).toBeGreaterThan(0);
  });

  it('price dots carry the macd / signal / histogram values', () => {
    const layout = computeLineMacdLayout({ data: MACD_DATA, ...base });
    expect(layout.priceDots[2]!.macd).toBe(7.5);
    expect(layout.priceDots[2]!.signal).toBe(5);
  });

  it('exposes the periods and the point count', () => {
    const layout = computeLineMacdLayout({ data: MACD_DATA, ...base });
    expect(layout.fastPeriod).toBe(1);
    expect(layout.slowPeriod).toBe(3);
    expect(layout.totalPoints).toBe(4);
  });
});

describe('describeLineMacdChart', () => {
  it('no data -> No data', () => {
    expect(describeLineMacdChart([])).toBe('No data');
    expect(describeLineMacdChart(null)).toBe('No data');
  });
  it('summary mentions MACD + signal + histogram', () => {
    const s = describeLineMacdChart(MACD_DATA, SMALL);
    expect(s).toContain('MACD');
    expect(s).toContain('signal');
    expect(s).toContain('histogram');
  });
});

describe('<ChartLineMacd> render', () => {
  it('renders empty state with no data', () => {
    render(<ChartLineMacd data={[]} />);
    expect(
      document
        .querySelector('[data-section="chart-line-macd"]')!
        .getAttribute('data-empty'),
    ).toBe('true');
  });

  it('renders the price line path', () => {
    render(<ChartLineMacd data={MACD_DATA} {...SMALL} />);
    expect(
      document.querySelector('[data-section="chart-line-macd-price-path"]'),
    ).not.toBeNull();
  });

  it('renders the MACD and signal lines, hidden via props', () => {
    const { rerender } = render(
      <ChartLineMacd data={MACD_DATA} {...SMALL} />,
    );
    expect(
      document.querySelector('[data-section="chart-line-macd-macd-line"]'),
    ).not.toBeNull();
    expect(
      document.querySelector('[data-section="chart-line-macd-signal-line"]'),
    ).not.toBeNull();
    rerender(
      <ChartLineMacd
        data={MACD_DATA}
        {...SMALL}
        showMacd={false}
        showSignal={false}
      />,
    );
    expect(
      document.querySelector('[data-section="chart-line-macd-macd-line"]'),
    ).toBeNull();
    expect(
      document.querySelector('[data-section="chart-line-macd-signal-line"]'),
    ).toBeNull();
  });

  it('renders one histogram bar per period and hides them via prop', () => {
    const { rerender } = render(
      <ChartLineMacd data={MACD_DATA} {...SMALL} />,
    );
    expect(
      document.querySelectorAll(
        '[data-section="chart-line-macd-histogram-bar"]',
      ).length,
    ).toBe(4);
    rerender(
      <ChartLineMacd data={MACD_DATA} {...SMALL} showHistogram={false} />,
    );
    expect(
      document.querySelector(
        '[data-section="chart-line-macd-histogram-bar"]',
      ),
    ).toBeNull();
  });

  it('histogram bars carry the value and positive flag', () => {
    render(<ChartLineMacd data={MACD_DATA} {...SMALL} />);
    const bars = document.querySelectorAll(
      '[data-section="chart-line-macd-histogram-bar"]',
    );
    expect(bars[1]!.getAttribute('data-positive')).toBe('true');
    expect(bars[3]!.getAttribute('data-positive')).toBe('false');
  });

  it('renders the MACD zero line', () => {
    render(<ChartLineMacd data={MACD_DATA} {...SMALL} />);
    expect(
      document.querySelector('[data-section="chart-line-macd-zero-line"]'),
    ).not.toBeNull();
  });

  it('renders a label for each panel', () => {
    render(<ChartLineMacd data={MACD_DATA} {...SMALL} />);
    expect(
      document.querySelector(
        '[data-section="chart-line-macd-panel-label"][data-panel="price"]',
      )?.textContent,
    ).toBe('Price');
    expect(
      document.querySelector(
        '[data-section="chart-line-macd-panel-label"][data-panel="macd"]',
      )?.textContent,
    ).toBe('MACD');
  });

  it('price dots are off by default and shown via prop', () => {
    const { rerender } = render(
      <ChartLineMacd data={MACD_DATA} {...SMALL} />,
    );
    expect(
      document.querySelector('[data-section="chart-line-macd-dot"]'),
    ).toBeNull();
    rerender(<ChartLineMacd data={MACD_DATA} {...SMALL} showDots />);
    expect(
      document.querySelectorAll('[data-section="chart-line-macd-dot"]')
        .length,
    ).toBe(4);
  });

  it('config badge shows the periods', () => {
    render(<ChartLineMacd data={MACD_DATA} {...SMALL} />);
    expect(
      document.querySelector(
        '[data-section="chart-line-macd-badge-periods"]',
      )?.textContent,
    ).toBe('1/3/3');
  });

  it('hides the config badge via showConfigBadge=false', () => {
    render(
      <ChartLineMacd data={MACD_DATA} {...SMALL} showConfigBadge={false} />,
    );
    expect(
      document.querySelector('[data-section="chart-line-macd-badge"]'),
    ).toBeNull();
  });

  it('ARIA: region + img + sr-only desc', () => {
    render(<ChartLineMacd data={MACD_DATA} {...SMALL} />);
    expect(
      document
        .querySelector('[data-section="chart-line-macd"]')!
        .getAttribute('role'),
    ).toBe('region');
    expect(
      document
        .querySelector('[data-section="chart-line-macd-svg"]')!
        .getAttribute('role'),
    ).toBe('img');
    expect(
      document.querySelector('[data-section="chart-line-macd-aria-desc"]')!
        .textContent,
    ).toContain('MACD');
  });

  it('root carries data-* attributes', () => {
    render(<ChartLineMacd data={MACD_DATA} {...SMALL} />);
    const root = document.querySelector('[data-section="chart-line-macd"]');
    expect(root!.getAttribute('data-fast-period')).toBe('1');
    expect(root!.getAttribute('data-slow-period')).toBe('3');
    expect(root!.getAttribute('data-signal-period')).toBe('3');
    expect(root!.getAttribute('data-total-points')).toBe('4');
  });

  it('tooltip on a price dot shows price + macd + signal + histogram', () => {
    render(<ChartLineMacd data={MACD_DATA} {...SMALL} showDots />);
    const dots = document.querySelectorAll(
      '[data-section="chart-line-macd-dot"]',
    );
    fireEvent.mouseEnter(dots[2]!);
    expect(
      document.querySelector(
        '[data-section="chart-line-macd-tooltip-price"]',
      )?.textContent,
    ).toBe('price: 30');
    expect(
      document.querySelector(
        '[data-section="chart-line-macd-tooltip-macd"]',
      )?.textContent,
    ).toBe('macd: 7.50');
    expect(
      document.querySelector(
        '[data-section="chart-line-macd-tooltip-histogram"]',
      )?.textContent,
    ).toBe('histogram: 2.50');
    fireEvent.mouseLeave(dots[2]!);
    expect(
      document.querySelector('[data-section="chart-line-macd-tooltip"]'),
    ).toBeNull();
  });

  it('omits the tooltip when showTooltip=false', () => {
    render(
      <ChartLineMacd
        data={MACD_DATA}
        {...SMALL}
        showDots
        showTooltip={false}
      />,
    );
    const dot = document.querySelector(
      '[data-section="chart-line-macd-dot"]',
    );
    fireEvent.mouseEnter(dot!);
    expect(
      document.querySelector('[data-section="chart-line-macd-tooltip"]'),
    ).toBeNull();
  });

  it('onPointClick fires with the price-dot payload', () => {
    let captured: number | null = null;
    render(
      <ChartLineMacd
        data={MACD_DATA}
        {...SMALL}
        showDots
        onPointClick={({ point }) => {
          captured = point.index;
        }}
      />,
    );
    const dots = document.querySelectorAll(
      '[data-section="chart-line-macd-dot"]',
    );
    fireEvent.click(dots[1]!);
    expect(captured).toBe(1);
  });

  it('legend has four toggle items and toggles a series', () => {
    let lastHidden: ReadonlySet<string> | null = null;
    render(
      <ChartLineMacd
        data={MACD_DATA}
        {...SMALL}
        onHiddenSeriesChange={(h) => {
          lastHidden = h;
        }}
      />,
    );
    const items = document.querySelectorAll(
      '[data-section="chart-line-macd-legend-item"]',
    );
    expect(items.length).toBe(4);
    fireEvent.click(items[2]!); // signal
    expect(lastHidden).not.toBeNull();
    expect(lastHidden!.has('signal')).toBe(true);
  });

  it('the legend toggle hides a line', () => {
    render(
      <ChartLineMacd
        data={MACD_DATA}
        {...SMALL}
        hiddenSeries={['macd']}
      />,
    );
    expect(
      document.querySelector('[data-section="chart-line-macd-macd-line"]'),
    ).toBeNull();
  });

  it('omits the legend when showLegend=false', () => {
    render(
      <ChartLineMacd data={MACD_DATA} {...SMALL} showLegend={false} />,
    );
    expect(
      document.querySelector('[data-section="chart-line-macd-legend"]'),
    ).toBeNull();
  });

  it('animate flag toggles data-animate + class', () => {
    const { rerender } = render(
      <ChartLineMacd data={MACD_DATA} {...SMALL} animate={true} />,
    );
    const root = document.querySelector('[data-section="chart-line-macd"]');
    expect(root!.getAttribute('data-animate')).toBe('true');
    expect(root!.className).toContain('motion-safe:animate-fade-in');
    rerender(
      <ChartLineMacd data={MACD_DATA} {...SMALL} animate={false} />,
    );
    expect(
      document
        .querySelector('[data-section="chart-line-macd"]')!
        .getAttribute('data-animate'),
    ).toBe('false');
  });

  it('ref forwarding', () => {
    const ref = createRef<HTMLDivElement>();
    render(<ChartLineMacd ref={ref} data={MACD_DATA} {...SMALL} />);
    expect(ref.current!.getAttribute('data-section')).toBe(
      'chart-line-macd',
    );
  });

  it('has displayName', () => {
    expect(ChartLineMacd.displayName).toBe('ChartLineMacd');
  });

  it('custom ariaLabel applied to root and svg', () => {
    render(
      <ChartLineMacd data={MACD_DATA} {...SMALL} ariaLabel="Momentum" />,
    );
    expect(
      document
        .querySelector('[data-section="chart-line-macd"]')!
        .getAttribute('aria-label'),
    ).toBe('Momentum');
    expect(
      document
        .querySelector('[data-section="chart-line-macd-svg"]')!
        .getAttribute('aria-label'),
    ).toBe('Momentum');
  });
});
