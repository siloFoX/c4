import { afterEach, describe, expect, it } from 'vitest';
import { createRef } from 'react';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import {
  ChartLineKeltner,
  DEFAULT_CHART_LINE_KELTNER_HEIGHT,
  DEFAULT_CHART_LINE_KELTNER_PADDING,
  DEFAULT_CHART_LINE_KELTNER_WIDTH,
  computeLineKeltnerATR,
  computeLineKeltnerEMA,
  computeLineKeltnerLayout,
  describeLineKeltnerChart,
  getLineKeltnerFinitePoints,
  normalizeLineKeltnerMultiplier,
  normalizeLineKeltnerPeriod,
  runLineKeltner,
  type ChartLineKeltnerPoint,
} from './chart-line-keltner';

afterEach(() => {
  cleanup();
});

const KELTNER_DATA: ChartLineKeltnerPoint[] = [
  { x: 0, value: 10 },
  { x: 1, value: 20 },
  { x: 2, value: 30 },
  { x: 3, value: 20 },
  { x: 4, value: 40 },
  { x: 5, value: 30 },
];
// small periods so the EMA + ATR band is defined on the 6-point fixture
const SMALL = { emaPeriod: 3, atrPeriod: 2, multiplier: 2 };

describe('chart-line-keltner defaults', () => {
  it('positive size defaults', () => {
    expect(DEFAULT_CHART_LINE_KELTNER_WIDTH).toBeGreaterThan(0);
    expect(DEFAULT_CHART_LINE_KELTNER_HEIGHT).toBeGreaterThan(0);
    expect(DEFAULT_CHART_LINE_KELTNER_PADDING).toBeGreaterThan(0);
  });
});

describe('getLineKeltnerFinitePoints', () => {
  it('drops points with non-finite x or value', () => {
    const r = getLineKeltnerFinitePoints([
      { x: 0, value: 0 },
      { x: NaN, value: 1 },
      { x: 1, value: Infinity },
      { x: 2, value: 4 },
    ]);
    expect(r.length).toBe(2);
  });
  it('null returns []', () => {
    expect(getLineKeltnerFinitePoints(null)).toEqual([]);
  });
});

describe('normalizeLineKeltnerPeriod', () => {
  it('keeps a positive integer', () => {
    expect(normalizeLineKeltnerPeriod(20, 10)).toBe(20);
  });
  it('a sub-1 period falls back', () => {
    expect(normalizeLineKeltnerPeriod(0, 10)).toBe(10);
  });
  it('floors a fractional period; non-finite falls back', () => {
    expect(normalizeLineKeltnerPeriod(3.7, 10)).toBe(3);
    expect(normalizeLineKeltnerPeriod(NaN, 10)).toBe(10);
  });
});

describe('normalizeLineKeltnerMultiplier', () => {
  it('keeps a positive multiplier', () => {
    expect(normalizeLineKeltnerMultiplier(2.5, 2)).toBe(2.5);
  });
  it('a non-positive multiplier falls back', () => {
    expect(normalizeLineKeltnerMultiplier(0, 2)).toBe(2);
    expect(normalizeLineKeltnerMultiplier(-1, 2)).toBe(2);
  });
  it('a non-finite multiplier falls back', () => {
    expect(normalizeLineKeltnerMultiplier(NaN, 2)).toBe(2);
  });
});

describe('computeLineKeltnerEMA', () => {
  it('seeds with the first value', () => {
    expect(computeLineKeltnerEMA([5, 100], 10)[0]).toBe(5);
  });
  it('a constant series stays constant', () => {
    expect(computeLineKeltnerEMA([10, 10, 10], 3)).toEqual([10, 10, 10]);
  });
  it('a period of 1 is the identity', () => {
    expect(computeLineKeltnerEMA([2, 4, 6], 1)).toEqual([2, 4, 6]);
  });
  it('smooths with alpha = 2 / (period + 1)', () => {
    // period 3 -> alpha 0.5
    expect(computeLineKeltnerEMA([10, 20, 30, 20, 40, 30], 3)).toEqual([
      10, 15, 22.5, 21.25, 30.625, 30.3125,
    ]);
  });
  it('empty input -> []', () => {
    expect(computeLineKeltnerEMA([], 3)).toEqual([]);
  });
});

describe('computeLineKeltnerATR', () => {
  it('is null until the window of true ranges is full', () => {
    expect(computeLineKeltnerATR([10, 20, 30], 2)).toEqual([
      null,
      null,
      10,
    ]);
  });
  it('Wilder-smooths the true ranges', () => {
    expect(
      computeLineKeltnerATR([10, 20, 30, 20, 40, 30], 2),
    ).toEqual([null, null, 10, 10, 15, 12.5]);
  });
  it('a series too short for the window -> all null', () => {
    expect(computeLineKeltnerATR([10, 20], 2)).toEqual([null, null]);
  });
  it('empty input -> []', () => {
    expect(computeLineKeltnerATR([], 2)).toEqual([]);
  });
});

describe('runLineKeltner', () => {
  it('empty -> ok=false', () => {
    expect(runLineKeltner([]).ok).toBe(false);
  });
  it('resolves the default periods', () => {
    const r = runLineKeltner(KELTNER_DATA);
    expect(r.emaPeriod).toBe(20);
    expect(r.atrPeriod).toBe(10);
    expect(r.multiplier).toBe(2);
  });
  it('the middle line is the EMA of the price', () => {
    const r = runLineKeltner(KELTNER_DATA, SMALL);
    expect(r.middle[0]).toBe(10);
    expect(r.middle[2]).toBe(22.5);
  });
  it('computes the ATR', () => {
    const r = runLineKeltner(KELTNER_DATA, SMALL);
    expect(r.atr[0]).toBeNull();
    expect(r.atr[2]).toBe(10);
  });
  it('the bands are middle +/- multiplier * ATR', () => {
    const r = runLineKeltner(KELTNER_DATA, SMALL);
    expect(r.upper[2]).toBe(42.5); // 22.5 + 2*10
    expect(r.lower[2]).toBe(2.5); // 22.5 - 2*10
  });
  it('counts the banded points', () => {
    expect(runLineKeltner(KELTNER_DATA, SMALL).bandPointCount).toBe(4);
  });
  it('the multiplier scales the band width', () => {
    const r = runLineKeltner(KELTNER_DATA, {
      ...SMALL,
      multiplier: 1,
    });
    expect(r.upper[2]).toBe(32.5); // 22.5 + 1*10
  });
  it('sorts the series by x', () => {
    const r = runLineKeltner(
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
    const r = runLineKeltner(KELTNER_DATA, SMALL);
    expect(r.emaPeriod).toBe(3);
    expect(r.atrPeriod).toBe(2);
  });
});

describe('computeLineKeltnerLayout', () => {
  const base = { width: 500, height: 240, padding: 30, ...SMALL };

  it('empty data -> ok=false', () => {
    expect(computeLineKeltnerLayout({ data: [], ...base }).ok).toBe(false);
  });

  it('degenerate canvas -> ok=false', () => {
    expect(
      computeLineKeltnerLayout({
        data: KELTNER_DATA,
        width: 20,
        height: 20,
        padding: 30,
        ...SMALL,
      }).ok,
    ).toBe(false);
  });

  it('builds the price, middle, upper and lower paths', () => {
    const layout = computeLineKeltnerLayout({
      data: KELTNER_DATA,
      ...base,
    });
    expect(layout.ok).toBe(true);
    expect(layout.pricePath).toContain('M ');
    expect(layout.middlePath).toContain('M ');
    expect(layout.upperPath).toContain('M ');
    expect(layout.lowerPath).toContain('M ');
  });

  it('builds a closed channel fill path', () => {
    const layout = computeLineKeltnerLayout({
      data: KELTNER_DATA,
      ...base,
    });
    expect(layout.channelPath).toContain('M ');
    expect(layout.channelPath.trim().endsWith('Z')).toBe(true);
  });

  it('price dots carry the middle, band and atr values', () => {
    const layout = computeLineKeltnerLayout({
      data: KELTNER_DATA,
      ...base,
    });
    expect(layout.priceDots[2]!.middle).toBe(22.5);
    expect(layout.priceDots[2]!.upper).toBe(42.5);
    expect(layout.priceDots[2]!.lower).toBe(2.5);
    expect(layout.priceDots[2]!.atr).toBe(10);
    expect(layout.priceDots[0]!.upper).toBeNull();
  });

  it('the y range covers the band extremes', () => {
    const layout = computeLineKeltnerLayout({
      data: KELTNER_DATA,
      ...base,
    });
    expect(layout.yMin).toBeLessThanOrEqual(1);
    expect(layout.yMax).toBeGreaterThanOrEqual(60);
  });

  it('exposes the band point count and the periods', () => {
    const layout = computeLineKeltnerLayout({
      data: KELTNER_DATA,
      ...base,
    });
    expect(layout.bandPointCount).toBe(4);
    expect(layout.emaPeriod).toBe(3);
    expect(layout.totalPoints).toBe(6);
  });

  it('bounds overrides honoured', () => {
    const layout = computeLineKeltnerLayout({
      data: KELTNER_DATA,
      ...base,
      yMin: -10,
      yMax: 200,
    });
    expect(layout.yMin).toBe(-10);
    expect(layout.yMax).toBe(200);
  });
});

describe('describeLineKeltnerChart', () => {
  it('no data -> No data', () => {
    expect(describeLineKeltnerChart([])).toBe('No data');
    expect(describeLineKeltnerChart(null)).toBe('No data');
  });
  it('summary mentions Keltner + EMA + ATR', () => {
    const s = describeLineKeltnerChart(KELTNER_DATA, SMALL);
    expect(s).toContain('Keltner');
    expect(s).toContain('EMA');
    expect(s).toContain('ATR');
  });
});

describe('<ChartLineKeltner> render', () => {
  it('renders empty state with no data', () => {
    render(<ChartLineKeltner data={[]} />);
    expect(
      document
        .querySelector('[data-section="chart-line-keltner"]')!
        .getAttribute('data-empty'),
    ).toBe('true');
  });

  it('renders the price line path', () => {
    render(<ChartLineKeltner data={KELTNER_DATA} {...SMALL} />);
    expect(
      document.querySelector(
        '[data-section="chart-line-keltner-price-path"]',
      ),
    ).not.toBeNull();
  });

  it('renders the middle EMA line and hides it via prop', () => {
    const { rerender } = render(
      <ChartLineKeltner data={KELTNER_DATA} {...SMALL} />,
    );
    expect(
      document.querySelector('[data-section="chart-line-keltner-middle"]'),
    ).not.toBeNull();
    rerender(
      <ChartLineKeltner data={KELTNER_DATA} {...SMALL} showMiddle={false} />,
    );
    expect(
      document.querySelector('[data-section="chart-line-keltner-middle"]'),
    ).toBeNull();
  });

  it('renders the channel fill and the upper / lower bands', () => {
    render(<ChartLineKeltner data={KELTNER_DATA} {...SMALL} />);
    expect(
      document.querySelector('[data-section="chart-line-keltner-channel"]'),
    ).not.toBeNull();
    expect(
      document.querySelector('[data-section="chart-line-keltner-upper"]'),
    ).not.toBeNull();
    expect(
      document.querySelector('[data-section="chart-line-keltner-lower"]'),
    ).not.toBeNull();
  });

  it('hides the channel via showChannel=false', () => {
    render(
      <ChartLineKeltner data={KELTNER_DATA} {...SMALL} showChannel={false} />,
    );
    expect(
      document.querySelector('[data-section="chart-line-keltner-channel"]'),
    ).toBeNull();
    expect(
      document.querySelector('[data-section="chart-line-keltner-upper"]'),
    ).toBeNull();
  });

  it('price dots are off by default and shown via prop', () => {
    const { rerender } = render(
      <ChartLineKeltner data={KELTNER_DATA} {...SMALL} />,
    );
    expect(
      document.querySelector('[data-section="chart-line-keltner-dot"]'),
    ).toBeNull();
    rerender(<ChartLineKeltner data={KELTNER_DATA} {...SMALL} showDots />);
    expect(
      document.querySelectorAll('[data-section="chart-line-keltner-dot"]')
        .length,
    ).toBe(6);
  });

  it('config badge shows the EMA period, ATR period and multiplier', () => {
    render(<ChartLineKeltner data={KELTNER_DATA} {...SMALL} />);
    expect(
      document.querySelector(
        '[data-section="chart-line-keltner-badge-ema"]',
      )?.textContent,
    ).toBe('ema=3');
    expect(
      document.querySelector(
        '[data-section="chart-line-keltner-badge-atr"]',
      )?.textContent,
    ).toBe('atr=2');
    expect(
      document.querySelector(
        '[data-section="chart-line-keltner-badge-mult"]',
      )?.textContent,
    ).toBe('x2');
  });

  it('hides the config badge via showConfigBadge=false', () => {
    render(
      <ChartLineKeltner
        data={KELTNER_DATA}
        {...SMALL}
        showConfigBadge={false}
      />,
    );
    expect(
      document.querySelector('[data-section="chart-line-keltner-badge"]'),
    ).toBeNull();
  });

  it('ARIA: region + img + sr-only desc', () => {
    render(<ChartLineKeltner data={KELTNER_DATA} {...SMALL} />);
    expect(
      document
        .querySelector('[data-section="chart-line-keltner"]')!
        .getAttribute('role'),
    ).toBe('region');
    expect(
      document
        .querySelector('[data-section="chart-line-keltner-svg"]')!
        .getAttribute('role'),
    ).toBe('img');
    expect(
      document.querySelector(
        '[data-section="chart-line-keltner-aria-desc"]',
      )!.textContent,
    ).toContain('Keltner');
  });

  it('root carries data-* attributes', () => {
    render(<ChartLineKeltner data={KELTNER_DATA} {...SMALL} />);
    const root = document.querySelector(
      '[data-section="chart-line-keltner"]',
    );
    expect(root!.getAttribute('data-band-point-count')).toBe('4');
    expect(root!.getAttribute('data-ema-period')).toBe('3');
    expect(root!.getAttribute('data-atr-period')).toBe('2');
    expect(root!.getAttribute('data-total-points')).toBe('6');
  });

  it('tooltip on a price dot shows price + ema + band + atr', () => {
    render(<ChartLineKeltner data={KELTNER_DATA} {...SMALL} showDots />);
    const dots = document.querySelectorAll(
      '[data-section="chart-line-keltner-dot"]',
    );
    fireEvent.mouseEnter(dots[2]!);
    expect(
      document.querySelector(
        '[data-section="chart-line-keltner-tooltip-price"]',
      )?.textContent,
    ).toBe('price: 30');
    expect(
      document.querySelector(
        '[data-section="chart-line-keltner-tooltip-middle"]',
      )?.textContent,
    ).toBe('ema: 22.50');
    expect(
      document.querySelector(
        '[data-section="chart-line-keltner-tooltip-band"]',
      )?.textContent,
    ).toBe('band: 2.50 to 42.50');
    expect(
      document.querySelector(
        '[data-section="chart-line-keltner-tooltip-atr"]',
      )?.textContent,
    ).toBe('atr: 10');
    fireEvent.mouseLeave(dots[2]!);
    expect(
      document.querySelector('[data-section="chart-line-keltner-tooltip"]'),
    ).toBeNull();
  });

  it('omits the tooltip when showTooltip=false', () => {
    render(
      <ChartLineKeltner
        data={KELTNER_DATA}
        {...SMALL}
        showDots
        showTooltip={false}
      />,
    );
    const dot = document.querySelector(
      '[data-section="chart-line-keltner-dot"]',
    );
    fireEvent.mouseEnter(dot!);
    expect(
      document.querySelector('[data-section="chart-line-keltner-tooltip"]'),
    ).toBeNull();
  });

  it('onPointClick fires with the price-dot payload', () => {
    let captured: number | null = null;
    render(
      <ChartLineKeltner
        data={KELTNER_DATA}
        {...SMALL}
        showDots
        onPointClick={({ point }) => {
          captured = point.index;
        }}
      />,
    );
    const dots = document.querySelectorAll(
      '[data-section="chart-line-keltner-dot"]',
    );
    fireEvent.click(dots[1]!);
    expect(captured).toBe(1);
  });

  it('legend has three toggle items and toggles a series', () => {
    let lastHidden: ReadonlySet<string> | null = null;
    render(
      <ChartLineKeltner
        data={KELTNER_DATA}
        {...SMALL}
        onHiddenSeriesChange={(h) => {
          lastHidden = h;
        }}
      />,
    );
    const items = document.querySelectorAll(
      '[data-section="chart-line-keltner-legend-item"]',
    );
    expect(items.length).toBe(3);
    fireEvent.click(items[1]!); // middle
    expect(lastHidden).not.toBeNull();
    expect(lastHidden!.has('middle')).toBe(true);
  });

  it('the legend toggle hides the channel', () => {
    render(
      <ChartLineKeltner
        data={KELTNER_DATA}
        {...SMALL}
        hiddenSeries={['channel']}
      />,
    );
    expect(
      document.querySelector('[data-section="chart-line-keltner-channel"]'),
    ).toBeNull();
  });

  it('omits the legend when showLegend=false', () => {
    render(
      <ChartLineKeltner data={KELTNER_DATA} {...SMALL} showLegend={false} />,
    );
    expect(
      document.querySelector('[data-section="chart-line-keltner-legend"]'),
    ).toBeNull();
  });

  it('animate flag toggles data-animate + class', () => {
    const { rerender } = render(
      <ChartLineKeltner data={KELTNER_DATA} {...SMALL} animate={true} />,
    );
    const root = document.querySelector(
      '[data-section="chart-line-keltner"]',
    );
    expect(root!.getAttribute('data-animate')).toBe('true');
    expect(root!.className).toContain('motion-safe:animate-fade-in');
    rerender(
      <ChartLineKeltner data={KELTNER_DATA} {...SMALL} animate={false} />,
    );
    expect(
      document
        .querySelector('[data-section="chart-line-keltner"]')!
        .getAttribute('data-animate'),
    ).toBe('false');
  });

  it('ref forwarding', () => {
    const ref = createRef<HTMLDivElement>();
    render(<ChartLineKeltner ref={ref} data={KELTNER_DATA} {...SMALL} />);
    expect(ref.current!.getAttribute('data-section')).toBe(
      'chart-line-keltner',
    );
  });

  it('has displayName', () => {
    expect(ChartLineKeltner.displayName).toBe('ChartLineKeltner');
  });

  it('custom ariaLabel applied to root and svg', () => {
    render(
      <ChartLineKeltner
        data={KELTNER_DATA}
        {...SMALL}
        ariaLabel="ATR channel"
      />,
    );
    expect(
      document
        .querySelector('[data-section="chart-line-keltner"]')!
        .getAttribute('aria-label'),
    ).toBe('ATR channel');
    expect(
      document
        .querySelector('[data-section="chart-line-keltner-svg"]')!
        .getAttribute('aria-label'),
    ).toBe('ATR channel');
  });

  it('xLabel and yLabel render axis text', () => {
    render(
      <ChartLineKeltner
        data={KELTNER_DATA}
        {...SMALL}
        xLabel="bar"
        yLabel="price"
      />,
    );
    expect(screen.getByText('bar').getAttribute('data-section')).toBe(
      'chart-line-keltner-x-label',
    );
    expect(screen.getByText('price').getAttribute('data-section')).toBe(
      'chart-line-keltner-y-label',
    );
  });
});
