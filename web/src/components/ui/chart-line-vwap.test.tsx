import { afterEach, describe, expect, it } from 'vitest';
import { createRef } from 'react';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import {
  ChartLineVwap,
  DEFAULT_CHART_LINE_VWAP_HEIGHT,
  DEFAULT_CHART_LINE_VWAP_PADDING,
  DEFAULT_CHART_LINE_VWAP_WIDTH,
  computeLineVwapLayout,
  describeLineVwapChart,
  getLineVwapFinitePoints,
  runLineVwap,
  type ChartLineVwapPoint,
} from './chart-line-vwap';

afterEach(() => {
  cleanup();
});

// cumulative VWAP: [10, 15, 22.5, 22]; total volume 500
const VWAP_DATA: ChartLineVwapPoint[] = [
  { x: 0, price: 10, volume: 100 },
  { x: 1, price: 20, volume: 100 },
  { x: 2, price: 30, volume: 200 },
  { x: 3, price: 20, volume: 100 },
];

describe('chart-line-vwap defaults', () => {
  it('positive size defaults', () => {
    expect(DEFAULT_CHART_LINE_VWAP_WIDTH).toBeGreaterThan(0);
    expect(DEFAULT_CHART_LINE_VWAP_HEIGHT).toBeGreaterThan(0);
    expect(DEFAULT_CHART_LINE_VWAP_PADDING).toBeGreaterThan(0);
  });
});

describe('getLineVwapFinitePoints', () => {
  it('drops points with a non-finite x, price or volume', () => {
    const r = getLineVwapFinitePoints([
      { x: 0, price: 10, volume: 100 },
      { x: NaN, price: 1, volume: 1 },
      { x: 1, price: Infinity, volume: 1 },
      { x: 2, price: 5, volume: NaN },
      { x: 3, price: 5, volume: 5 },
    ]);
    expect(r.length).toBe(2);
  });
  it('null returns []', () => {
    expect(getLineVwapFinitePoints(null)).toEqual([]);
  });
});

describe('runLineVwap', () => {
  it('empty -> ok=false', () => {
    expect(runLineVwap([]).ok).toBe(false);
  });
  it('a single point -> ok=false', () => {
    expect(runLineVwap([{ x: 0, price: 1, volume: 1 }]).ok).toBe(false);
  });
  it('computes the cumulative volume-weighted average price', () => {
    const r = runLineVwap(VWAP_DATA);
    expect(r.samples.map((s) => s.vwap)).toEqual([10, 15, 22.5, 22]);
  });
  it('the deviation is price minus VWAP', () => {
    const r = runLineVwap(VWAP_DATA);
    expect(r.samples.map((s) => s.deviation)).toEqual([0, 5, 7.5, -2]);
  });
  it('reports the total volume', () => {
    expect(runLineVwap(VWAP_DATA).totalVolume).toBe(500);
  });
  it('reports the final VWAP', () => {
    expect(runLineVwap(VWAP_DATA).vwapFinal).toBe(22);
  });
  it('a leading zero-volume period has a null VWAP', () => {
    const r = runLineVwap([
      { x: 0, price: 10, volume: 0 },
      { x: 1, price: 20, volume: 100 },
    ]);
    expect(r.samples[0]!.vwap).toBeNull();
    expect(r.samples[1]!.vwap).toBe(20);
  });
  it('clamps a negative volume to zero', () => {
    const r = runLineVwap([
      { x: 0, price: 10, volume: -50 },
      { x: 1, price: 20, volume: 100 },
    ]);
    expect(r.samples[0]!.volume).toBe(0);
    expect(r.samples[0]!.vwap).toBeNull();
  });
  it('sorts the series by x', () => {
    const r = runLineVwap([
      { x: 2, price: 4, volume: 1 },
      { x: 0, price: 0, volume: 1 },
      { x: 1, price: 8, volume: 1 },
    ]);
    expect(r.series.map((p) => p.x)).toEqual([0, 1, 2]);
  });
  it('a constant price yields a flat VWAP at that price', () => {
    const r = runLineVwap([
      { x: 0, price: 7, volume: 10 },
      { x: 1, price: 7, volume: 50 },
      { x: 2, price: 7, volume: 20 },
    ]);
    expect(r.samples.map((s) => s.vwap)).toEqual([7, 7, 7]);
  });
});

describe('computeLineVwapLayout', () => {
  const base = { width: 500, height: 280, padding: 30 };

  it('empty data -> ok=false', () => {
    expect(computeLineVwapLayout({ data: [], ...base }).ok).toBe(false);
  });

  it('degenerate canvas -> ok=false', () => {
    expect(
      computeLineVwapLayout({
        data: VWAP_DATA,
        width: 20,
        height: 20,
        padding: 30,
      }).ok,
    ).toBe(false);
  });

  it('builds the price line path', () => {
    const layout = computeLineVwapLayout({ data: VWAP_DATA, ...base });
    expect(layout.ok).toBe(true);
    expect(layout.pricePath).toContain('M ');
  });

  it('builds the VWAP overlay path', () => {
    const layout = computeLineVwapLayout({ data: VWAP_DATA, ...base });
    expect(layout.vwapPath).toContain('M ');
    expect(layout.vwapPath).toContain(' L ');
  });

  it('projects a volume bar per period', () => {
    const layout = computeLineVwapLayout({ data: VWAP_DATA, ...base });
    expect(layout.volumeBars.length).toBe(4);
  });

  it('dots carry the price, volume, VWAP and deviation', () => {
    const layout = computeLineVwapLayout({ data: VWAP_DATA, ...base });
    expect(layout.dots[2]!.price).toBe(30);
    expect(layout.dots[2]!.volume).toBe(200);
    expect(layout.dots[2]!.vwap).toBe(22.5);
    expect(layout.dots[2]!.deviation).toBe(7.5);
  });

  it('the y range covers price and VWAP', () => {
    const layout = computeLineVwapLayout({ data: VWAP_DATA, ...base });
    expect(layout.yMin).toBe(10);
    expect(layout.yMax).toBe(30);
  });

  it('exposes the total volume, final VWAP and max volume', () => {
    const layout = computeLineVwapLayout({ data: VWAP_DATA, ...base });
    expect(layout.totalVolume).toBe(500);
    expect(layout.vwapFinal).toBe(22);
    expect(layout.maxVolume).toBe(200);
  });

  it('bounds overrides honoured', () => {
    const layout = computeLineVwapLayout({
      data: VWAP_DATA,
      ...base,
      yMin: 0,
      yMax: 100,
    });
    expect(layout.yMin).toBe(0);
    expect(layout.yMax).toBe(100);
  });
});

describe('describeLineVwapChart', () => {
  it('no data -> No data', () => {
    expect(describeLineVwapChart([])).toBe('No data');
    expect(describeLineVwapChart(null)).toBe('No data');
  });
  it('summary mentions VWAP + volume-weighted', () => {
    const s = describeLineVwapChart(VWAP_DATA);
    expect(s).toContain('VWAP');
    expect(s).toContain('volume-weighted');
  });
});

describe('<ChartLineVwap> render', () => {
  it('renders empty state with no data', () => {
    render(<ChartLineVwap data={[]} />);
    expect(
      document
        .querySelector('[data-section="chart-line-vwap"]')!
        .getAttribute('data-empty'),
    ).toBe('true');
  });

  it('renders the price line path', () => {
    render(<ChartLineVwap data={VWAP_DATA} />);
    expect(
      document.querySelector('[data-section="chart-line-vwap-price-path"]'),
    ).not.toBeNull();
  });

  it('renders the VWAP overlay and hides it via prop', () => {
    const { rerender } = render(<ChartLineVwap data={VWAP_DATA} />);
    expect(
      document.querySelector('[data-section="chart-line-vwap-vwap-path"]'),
    ).not.toBeNull();
    rerender(<ChartLineVwap data={VWAP_DATA} showVwap={false} />);
    expect(
      document.querySelector('[data-section="chart-line-vwap-vwap-path"]'),
    ).toBeNull();
  });

  it('renders one volume bar per period and hides them via prop', () => {
    const { rerender } = render(<ChartLineVwap data={VWAP_DATA} />);
    expect(
      document.querySelectorAll(
        '[data-section="chart-line-vwap-volume-bar"]',
      ).length,
    ).toBe(4);
    rerender(<ChartLineVwap data={VWAP_DATA} showVolume={false} />);
    expect(
      document.querySelector(
        '[data-section="chart-line-vwap-volume-bar"]',
      ),
    ).toBeNull();
  });

  it('volume bars carry the volume value', () => {
    render(<ChartLineVwap data={VWAP_DATA} />);
    const bars = document.querySelectorAll(
      '[data-section="chart-line-vwap-volume-bar"]',
    );
    expect(Number(bars[2]!.getAttribute('data-volume'))).toBe(200);
  });

  it('price dots are off by default and shown via prop', () => {
    const { rerender } = render(<ChartLineVwap data={VWAP_DATA} />);
    expect(
      document.querySelector('[data-section="chart-line-vwap-dot"]'),
    ).toBeNull();
    rerender(<ChartLineVwap data={VWAP_DATA} showDots />);
    expect(
      document.querySelectorAll('[data-section="chart-line-vwap-dot"]')
        .length,
    ).toBe(4);
  });

  it('config badge shows the final VWAP and total volume', () => {
    render(<ChartLineVwap data={VWAP_DATA} />);
    expect(
      document.querySelector(
        '[data-section="chart-line-vwap-badge-final"]',
      )?.textContent,
    ).toBe('final=22');
    expect(
      document.querySelector(
        '[data-section="chart-line-vwap-badge-volume"]',
      )?.textContent,
    ).toBe('vol=500');
  });

  it('hides the config badge via showConfigBadge=false', () => {
    render(<ChartLineVwap data={VWAP_DATA} showConfigBadge={false} />);
    expect(
      document.querySelector('[data-section="chart-line-vwap-badge"]'),
    ).toBeNull();
  });

  it('ARIA: region + img + sr-only desc', () => {
    render(<ChartLineVwap data={VWAP_DATA} />);
    expect(
      document
        .querySelector('[data-section="chart-line-vwap"]')!
        .getAttribute('role'),
    ).toBe('region');
    expect(
      document
        .querySelector('[data-section="chart-line-vwap-svg"]')!
        .getAttribute('role'),
    ).toBe('img');
    expect(
      document.querySelector('[data-section="chart-line-vwap-aria-desc"]')!
        .textContent,
    ).toContain('VWAP');
  });

  it('root carries data-* attributes', () => {
    render(<ChartLineVwap data={VWAP_DATA} />);
    const root = document.querySelector('[data-section="chart-line-vwap"]');
    expect(Number(root!.getAttribute('data-total-volume'))).toBe(500);
    expect(Number(root!.getAttribute('data-vwap-final'))).toBe(22);
    expect(root!.getAttribute('data-total-points')).toBe('4');
  });

  it('price dot exposes price / volume / vwap / deviation attributes', () => {
    render(<ChartLineVwap data={VWAP_DATA} showDots />);
    const dots = document.querySelectorAll(
      '[data-section="chart-line-vwap-dot"]',
    );
    expect(Number(dots[2]!.getAttribute('data-price'))).toBe(30);
    expect(Number(dots[2]!.getAttribute('data-volume'))).toBe(200);
    expect(Number(dots[2]!.getAttribute('data-vwap'))).toBe(22.5);
    expect(Number(dots[2]!.getAttribute('data-deviation'))).toBe(7.5);
  });

  it('tooltip on a price dot shows price + volume + vwap + deviation', () => {
    render(<ChartLineVwap data={VWAP_DATA} showDots />);
    const dots = document.querySelectorAll(
      '[data-section="chart-line-vwap-dot"]',
    );
    fireEvent.mouseEnter(dots[2]!);
    expect(
      document.querySelector(
        '[data-section="chart-line-vwap-tooltip-price"]',
      )?.textContent,
    ).toBe('price: 30');
    expect(
      document.querySelector(
        '[data-section="chart-line-vwap-tooltip-volume"]',
      )?.textContent,
    ).toBe('volume: 200');
    expect(
      document.querySelector(
        '[data-section="chart-line-vwap-tooltip-vwap"]',
      )?.textContent,
    ).toBe('vwap: 22.50');
    expect(
      document.querySelector(
        '[data-section="chart-line-vwap-tooltip-deviation"]',
      )?.textContent,
    ).toContain('+7.50');
    fireEvent.mouseLeave(dots[2]!);
    expect(
      document.querySelector('[data-section="chart-line-vwap-tooltip"]'),
    ).toBeNull();
  });

  it('omits the tooltip when showTooltip=false', () => {
    render(<ChartLineVwap data={VWAP_DATA} showDots showTooltip={false} />);
    const dot = document.querySelector(
      '[data-section="chart-line-vwap-dot"]',
    );
    fireEvent.mouseEnter(dot!);
    expect(
      document.querySelector('[data-section="chart-line-vwap-tooltip"]'),
    ).toBeNull();
  });

  it('onPointClick fires with the price-dot payload', () => {
    let captured: number | null = null;
    render(
      <ChartLineVwap
        data={VWAP_DATA}
        showDots
        onPointClick={({ point }) => {
          captured = point.index;
        }}
      />,
    );
    const dots = document.querySelectorAll(
      '[data-section="chart-line-vwap-dot"]',
    );
    fireEvent.click(dots[1]!);
    expect(captured).toBe(1);
  });

  it('legend has three toggle items and toggles a series', () => {
    let lastHidden: ReadonlySet<string> | null = null;
    render(
      <ChartLineVwap
        data={VWAP_DATA}
        onHiddenSeriesChange={(h) => {
          lastHidden = h;
        }}
      />,
    );
    const items = document.querySelectorAll(
      '[data-section="chart-line-vwap-legend-item"]',
    );
    expect(items.length).toBe(3);
    fireEvent.click(items[1]!); // vwap
    expect(lastHidden).not.toBeNull();
    expect(lastHidden!.has('vwap')).toBe(true);
  });

  it('the legend toggle hides the VWAP overlay', () => {
    render(<ChartLineVwap data={VWAP_DATA} hiddenSeries={['vwap']} />);
    expect(
      document.querySelector('[data-section="chart-line-vwap-vwap-path"]'),
    ).toBeNull();
  });

  it('omits the legend when showLegend=false', () => {
    render(<ChartLineVwap data={VWAP_DATA} showLegend={false} />);
    expect(
      document.querySelector('[data-section="chart-line-vwap-legend"]'),
    ).toBeNull();
  });

  it('animate flag toggles data-animate + class', () => {
    const { rerender } = render(
      <ChartLineVwap data={VWAP_DATA} animate={true} />,
    );
    const root = document.querySelector('[data-section="chart-line-vwap"]');
    expect(root!.getAttribute('data-animate')).toBe('true');
    expect(root!.className).toContain('motion-safe:animate-fade-in');
    rerender(<ChartLineVwap data={VWAP_DATA} animate={false} />);
    expect(
      document
        .querySelector('[data-section="chart-line-vwap"]')!
        .getAttribute('data-animate'),
    ).toBe('false');
  });

  it('ref forwarding', () => {
    const ref = createRef<HTMLDivElement>();
    render(<ChartLineVwap ref={ref} data={VWAP_DATA} />);
    expect(ref.current!.getAttribute('data-section')).toBe(
      'chart-line-vwap',
    );
  });

  it('has displayName', () => {
    expect(ChartLineVwap.displayName).toBe('ChartLineVwap');
  });

  it('custom ariaLabel applied to root and svg', () => {
    render(<ChartLineVwap data={VWAP_DATA} ariaLabel="Trading VWAP" />);
    expect(
      document
        .querySelector('[data-section="chart-line-vwap"]')!
        .getAttribute('aria-label'),
    ).toBe('Trading VWAP');
    expect(
      document
        .querySelector('[data-section="chart-line-vwap-svg"]')!
        .getAttribute('aria-label'),
    ).toBe('Trading VWAP');
  });

  it('xLabel and yLabel render axis text', () => {
    render(<ChartLineVwap data={VWAP_DATA} xLabel="bar" yLabel="price" />);
    expect(screen.getByText('bar').getAttribute('data-section')).toBe(
      'chart-line-vwap-x-label',
    );
    expect(screen.getByText('price').getAttribute('data-section')).toBe(
      'chart-line-vwap-y-label',
    );
  });
});
