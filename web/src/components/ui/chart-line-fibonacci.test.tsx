import { afterEach, describe, expect, it } from 'vitest';
import { createRef } from 'react';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import {
  ChartLineFibonacci,
  DEFAULT_CHART_LINE_FIBONACCI_HEIGHT,
  DEFAULT_CHART_LINE_FIBONACCI_PADDING,
  DEFAULT_CHART_LINE_FIBONACCI_RATIOS,
  DEFAULT_CHART_LINE_FIBONACCI_WIDTH,
  computeLineFibonacciLayout,
  describeLineFibonacciChart,
  getLineFibonacciFinitePoints,
  normalizeLineFibonacciRatios,
  runLineFibonacci,
  type ChartLineFibonacciPoint,
} from './chart-line-fibonacci';

afterEach(() => {
  cleanup();
});

// up swing: low 0 at x=1, high 100 at x=4 -> range 100
const FIB_DATA: ChartLineFibonacciPoint[] = [
  { x: 0, value: 20 },
  { x: 1, value: 0 },
  { x: 2, value: 40 },
  { x: 3, value: 60 },
  { x: 4, value: 100 },
  { x: 5, value: 70 },
];
// down swing: high 100 at x=0, low 0 at x=3
const FIB_DOWN: ChartLineFibonacciPoint[] = [
  { x: 0, value: 100 },
  { x: 1, value: 80 },
  { x: 2, value: 40 },
  { x: 3, value: 0 },
  { x: 4, value: 30 },
];
const FIB_FLAT: ChartLineFibonacciPoint[] = [
  { x: 0, value: 5 },
  { x: 1, value: 5 },
  { x: 2, value: 5 },
];

describe('chart-line-fibonacci defaults', () => {
  it('positive size defaults', () => {
    expect(DEFAULT_CHART_LINE_FIBONACCI_WIDTH).toBeGreaterThan(0);
    expect(DEFAULT_CHART_LINE_FIBONACCI_HEIGHT).toBeGreaterThan(0);
    expect(DEFAULT_CHART_LINE_FIBONACCI_PADDING).toBeGreaterThan(0);
  });
  it('the default ratio set spans 0 to 1', () => {
    expect(DEFAULT_CHART_LINE_FIBONACCI_RATIOS[0]).toBe(0);
    expect(
      DEFAULT_CHART_LINE_FIBONACCI_RATIOS[
        DEFAULT_CHART_LINE_FIBONACCI_RATIOS.length - 1
      ],
    ).toBe(1);
  });
});

describe('getLineFibonacciFinitePoints', () => {
  it('drops points with non-finite x or value', () => {
    const r = getLineFibonacciFinitePoints([
      { x: 0, value: 0 },
      { x: NaN, value: 1 },
      { x: 1, value: Infinity },
      { x: 2, value: 4 },
    ]);
    expect(r.length).toBe(2);
  });
  it('null returns []', () => {
    expect(getLineFibonacciFinitePoints(null)).toEqual([]);
  });
});

describe('normalizeLineFibonacciRatios', () => {
  it('keeps a valid ratio set', () => {
    expect(normalizeLineFibonacciRatios([0, 0.5, 1])).toEqual([0, 0.5, 1]);
  });
  it('sorts ascending', () => {
    expect(normalizeLineFibonacciRatios([0.5, 0, 1])).toEqual([0, 0.5, 1]);
  });
  it('de-duplicates', () => {
    expect(normalizeLineFibonacciRatios([0.5, 0.5, 0.5])).toEqual([0.5]);
  });
  it('clamps out-of-range ratios into [0,1]', () => {
    expect(normalizeLineFibonacciRatios([-1, 0.5, 2])).toEqual([0, 0.5, 1]);
  });
  it('drops non-finite entries', () => {
    expect(normalizeLineFibonacciRatios([NaN, 0.3])).toEqual([0.3]);
  });
  it('an empty set falls back to the default', () => {
    expect(normalizeLineFibonacciRatios([]).length).toBe(
      DEFAULT_CHART_LINE_FIBONACCI_RATIOS.length,
    );
  });
  it('null falls back to the default', () => {
    expect(normalizeLineFibonacciRatios(null).length).toBe(
      DEFAULT_CHART_LINE_FIBONACCI_RATIOS.length,
    );
  });
});

describe('runLineFibonacci', () => {
  it('empty -> ok=false', () => {
    expect(runLineFibonacci([]).ok).toBe(false);
  });
  it('a single point -> ok=false', () => {
    expect(runLineFibonacci([{ x: 0, value: 1 }]).ok).toBe(false);
  });
  it('a flat series has no range -> ok=false, trend flat', () => {
    const r = runLineFibonacci(FIB_FLAT);
    expect(r.ok).toBe(false);
    expect(r.trend).toBe('flat');
  });
  it('detects the swing high and swing low', () => {
    const r = runLineFibonacci(FIB_DATA);
    expect(r.swingHigh!.value).toBe(100);
    expect(r.swingHigh!.index).toBe(4);
    expect(r.swingLow!.value).toBe(0);
    expect(r.swingLow!.index).toBe(1);
  });
  it('classifies the trend from the swing order', () => {
    expect(runLineFibonacci(FIB_DATA).trend).toBe('up');
    expect(runLineFibonacci(FIB_DOWN).trend).toBe('down');
  });
  it('reports the swing range', () => {
    expect(runLineFibonacci(FIB_DATA).range).toBe(100);
  });
  it('computes one level per ratio', () => {
    expect(runLineFibonacci(FIB_DATA).levels.length).toBe(
      DEFAULT_CHART_LINE_FIBONACCI_RATIOS.length,
    );
  });
  it('an up swing puts 0% at the high and 100% at the low', () => {
    const r = runLineFibonacci(FIB_DATA);
    expect(r.levels[0]!.value).toBe(100);
    expect(r.levels[3]!.value).toBe(50); // 0.5 ratio
    expect(r.levels[6]!.value).toBe(0);
  });
  it('a down swing mirrors 0% to the low and 100% to the high', () => {
    const r = runLineFibonacci(FIB_DOWN);
    expect(r.levels[0]!.value).toBe(0);
    expect(r.levels[3]!.value).toBe(50);
    expect(r.levels[6]!.value).toBe(100);
  });
  it('reports the value range', () => {
    const r = runLineFibonacci(FIB_DATA);
    expect(r.valueMin).toBe(0);
    expect(r.valueMax).toBe(100);
  });
  it('sorts the series by x', () => {
    const r = runLineFibonacci([
      { x: 2, value: 4 },
      { x: 0, value: 0 },
      { x: 1, value: 8 },
    ]);
    expect(r.series.map((p) => p.x)).toEqual([0, 1, 2]);
  });
  it('honours a custom ratio set', () => {
    const r = runLineFibonacci(FIB_DATA, [0, 0.5, 1]);
    expect(r.levels.length).toBe(3);
  });
});

describe('computeLineFibonacciLayout', () => {
  const base = { width: 500, height: 240, padding: 30 };

  it('empty data -> ok=false', () => {
    expect(computeLineFibonacciLayout({ data: [], ...base }).ok).toBe(
      false,
    );
  });

  it('degenerate canvas -> ok=false', () => {
    expect(
      computeLineFibonacciLayout({
        data: FIB_DATA,
        width: 20,
        height: 20,
        padding: 30,
      }).ok,
    ).toBe(false);
  });

  it('a flat series -> ok=false', () => {
    expect(
      computeLineFibonacciLayout({ data: FIB_FLAT, ...base }).ok,
    ).toBe(false);
  });

  it('builds the series line path', () => {
    const layout = computeLineFibonacciLayout({ data: FIB_DATA, ...base });
    expect(layout.ok).toBe(true);
    expect(layout.linePath).toContain('M ');
    expect(layout.linePath).toContain(' L ');
  });

  it('projects one level per ratio with a finite y', () => {
    const layout = computeLineFibonacciLayout({ data: FIB_DATA, ...base });
    expect(layout.levels.length).toBe(
      DEFAULT_CHART_LINE_FIBONACCI_RATIOS.length,
    );
    for (const lvl of layout.levels) {
      expect(Number.isFinite(lvl.py)).toBe(true);
    }
  });

  it('projects the swing markers and the anchor path', () => {
    const layout = computeLineFibonacciLayout({ data: FIB_DATA, ...base });
    expect(Number.isFinite(layout.swingHigh!.px)).toBe(true);
    expect(Number.isFinite(layout.swingLow!.py)).toBe(true);
    expect(layout.anchorPath).toContain('M ');
    expect(layout.anchorPath).toContain(' L ');
  });

  it('the y range covers the swing low and high', () => {
    const layout = computeLineFibonacciLayout({ data: FIB_DATA, ...base });
    expect(layout.yMin).toBe(0);
    expect(layout.yMax).toBe(100);
  });

  it('exposes the trend, range and dot count', () => {
    const layout = computeLineFibonacciLayout({ data: FIB_DATA, ...base });
    expect(layout.trend).toBe('up');
    expect(layout.range).toBe(100);
    expect(layout.dots.length).toBe(6);
  });

  it('bounds overrides honoured', () => {
    const layout = computeLineFibonacciLayout({
      data: FIB_DATA,
      ...base,
      yMin: -10,
      yMax: 200,
    });
    expect(layout.yMin).toBe(-10);
    expect(layout.yMax).toBe(200);
  });
});

describe('describeLineFibonacciChart', () => {
  it('no data -> No data', () => {
    expect(describeLineFibonacciChart([])).toBe('No data');
    expect(describeLineFibonacciChart(FIB_FLAT)).toBe('No data');
  });
  it('summary mentions Fibonacci + retracement + swing', () => {
    const s = describeLineFibonacciChart(FIB_DATA);
    expect(s).toContain('Fibonacci');
    expect(s).toContain('retracement');
    expect(s).toContain('swing');
  });
});

describe('<ChartLineFibonacci> render', () => {
  it('renders empty state with no data', () => {
    render(<ChartLineFibonacci data={[]} />);
    expect(
      document
        .querySelector('[data-section="chart-line-fibonacci"]')!
        .getAttribute('data-empty'),
    ).toBe('true');
  });

  it('renders the series line path', () => {
    render(<ChartLineFibonacci data={FIB_DATA} />);
    expect(
      document.querySelector(
        '[data-section="chart-line-fibonacci-line-path"]',
      ),
    ).not.toBeNull();
  });

  it('dots are off by default and shown via prop', () => {
    const { rerender } = render(<ChartLineFibonacci data={FIB_DATA} />);
    expect(
      document.querySelector('[data-section="chart-line-fibonacci-dot"]'),
    ).toBeNull();
    rerender(<ChartLineFibonacci data={FIB_DATA} showDots />);
    expect(
      document.querySelectorAll('[data-section="chart-line-fibonacci-dot"]')
        .length,
    ).toBe(6);
  });

  it('renders one line per Fibonacci level and hides them via prop', () => {
    const { rerender } = render(<ChartLineFibonacci data={FIB_DATA} />);
    expect(
      document.querySelectorAll(
        '[data-section="chart-line-fibonacci-level"]',
      ).length,
    ).toBe(DEFAULT_CHART_LINE_FIBONACCI_RATIOS.length);
    rerender(<ChartLineFibonacci data={FIB_DATA} showLevels={false} />);
    expect(
      document.querySelector('[data-section="chart-line-fibonacci-level"]'),
    ).toBeNull();
  });

  it('renders level labels and hides them via prop', () => {
    const { rerender } = render(<ChartLineFibonacci data={FIB_DATA} />);
    expect(
      document.querySelectorAll(
        '[data-section="chart-line-fibonacci-level-label"]',
      ).length,
    ).toBe(DEFAULT_CHART_LINE_FIBONACCI_RATIOS.length);
    rerender(
      <ChartLineFibonacci data={FIB_DATA} showLevelLabels={false} />,
    );
    expect(
      document.querySelector(
        '[data-section="chart-line-fibonacci-level-label"]',
      ),
    ).toBeNull();
  });

  it('renders a swing high and a swing low marker, hidden via prop', () => {
    const { rerender } = render(<ChartLineFibonacci data={FIB_DATA} />);
    expect(
      document.querySelector(
        '[data-section="chart-line-fibonacci-swing"][data-kind="high"]',
      ),
    ).not.toBeNull();
    expect(
      document.querySelector(
        '[data-section="chart-line-fibonacci-swing"][data-kind="low"]',
      ),
    ).not.toBeNull();
    rerender(<ChartLineFibonacci data={FIB_DATA} showSwings={false} />);
    expect(
      document.querySelector('[data-section="chart-line-fibonacci-swing"]'),
    ).toBeNull();
  });

  it('renders the swing anchor and hides it via prop', () => {
    const { rerender } = render(<ChartLineFibonacci data={FIB_DATA} />);
    expect(
      document.querySelector(
        '[data-section="chart-line-fibonacci-anchor"]',
      ),
    ).not.toBeNull();
    rerender(<ChartLineFibonacci data={FIB_DATA} showAnchor={false} />);
    expect(
      document.querySelector(
        '[data-section="chart-line-fibonacci-anchor"]',
      ),
    ).toBeNull();
  });

  it('config badge shows the trend and the swing extremes', () => {
    render(<ChartLineFibonacci data={FIB_DATA} />);
    expect(
      document.querySelector(
        '[data-section="chart-line-fibonacci-badge-trend"]',
      )?.textContent,
    ).toBe('up');
    expect(
      document.querySelector(
        '[data-section="chart-line-fibonacci-badge-high"]',
      )?.textContent,
    ).toBe('H=100');
    expect(
      document.querySelector(
        '[data-section="chart-line-fibonacci-badge-low"]',
      )?.textContent,
    ).toBe('L=0');
  });

  it('hides the config badge via showConfigBadge=false', () => {
    render(
      <ChartLineFibonacci data={FIB_DATA} showConfigBadge={false} />,
    );
    expect(
      document.querySelector('[data-section="chart-line-fibonacci-badge"]'),
    ).toBeNull();
  });

  it('ARIA: region + img + sr-only desc', () => {
    render(<ChartLineFibonacci data={FIB_DATA} />);
    expect(
      document
        .querySelector('[data-section="chart-line-fibonacci"]')!
        .getAttribute('role'),
    ).toBe('region');
    expect(
      document
        .querySelector('[data-section="chart-line-fibonacci-svg"]')!
        .getAttribute('role'),
    ).toBe('img');
    expect(
      document.querySelector(
        '[data-section="chart-line-fibonacci-aria-desc"]',
      )!.textContent,
    ).toContain('Fibonacci');
  });

  it('root carries data-* attributes', () => {
    render(<ChartLineFibonacci data={FIB_DATA} />);
    const root = document.querySelector(
      '[data-section="chart-line-fibonacci"]',
    );
    expect(root!.getAttribute('data-trend')).toBe('up');
    expect(root!.getAttribute('data-level-count')).toBe(
      String(DEFAULT_CHART_LINE_FIBONACCI_RATIOS.length),
    );
    expect(Number(root!.getAttribute('data-range'))).toBe(100);
    expect(root!.getAttribute('data-total-points')).toBe('6');
  });

  it('level exposes ratio and value attributes', () => {
    render(<ChartLineFibonacci data={FIB_DATA} />);
    const levels = document.querySelectorAll(
      '[data-section="chart-line-fibonacci-level"]',
    );
    // level index 3 is the 0.5 ratio at value 50
    expect(Number(levels[3]!.getAttribute('data-ratio'))).toBe(0.5);
    expect(Number(levels[3]!.getAttribute('data-value'))).toBe(50);
  });

  it('swing markers expose kind and value attributes', () => {
    render(<ChartLineFibonacci data={FIB_DATA} />);
    const high = document.querySelector(
      '[data-section="chart-line-fibonacci-swing"][data-kind="high"]',
    );
    expect(Number(high!.getAttribute('data-value'))).toBe(100);
  });

  it('tooltip on a level shows the ratio and value', () => {
    render(<ChartLineFibonacci data={FIB_DATA} />);
    const levels = document.querySelectorAll(
      '[data-section="chart-line-fibonacci-level"]',
    );
    fireEvent.mouseEnter(levels[3]!);
    expect(
      document.querySelector(
        '[data-section="chart-line-fibonacci-tooltip-ratio"]',
      )?.textContent,
    ).toBe('50% retracement');
    expect(
      document.querySelector(
        '[data-section="chart-line-fibonacci-tooltip-value"]',
      )?.textContent,
    ).toBe('value: 50');
    fireEvent.mouseLeave(levels[3]!);
    expect(
      document.querySelector(
        '[data-section="chart-line-fibonacci-tooltip"]',
      ),
    ).toBeNull();
  });

  it('tooltip on a dot shows x + value', () => {
    render(<ChartLineFibonacci data={FIB_DATA} showDots />);
    const dot = document.querySelector(
      '[data-section="chart-line-fibonacci-dot"]',
    );
    fireEvent.mouseEnter(dot!);
    const tip = document.querySelector(
      '[data-section="chart-line-fibonacci-tooltip"]',
    );
    expect(tip!.getAttribute('data-tooltip-kind')).toBe('point');
  });

  it('omits the tooltip when showTooltip=false', () => {
    render(<ChartLineFibonacci data={FIB_DATA} showTooltip={false} />);
    const level = document.querySelector(
      '[data-section="chart-line-fibonacci-level"]',
    );
    fireEvent.mouseEnter(level!);
    expect(
      document.querySelector(
        '[data-section="chart-line-fibonacci-tooltip"]',
      ),
    ).toBeNull();
  });

  it('onLevelClick fires with the level payload', () => {
    let captured: number | null = null;
    render(
      <ChartLineFibonacci
        data={FIB_DATA}
        onLevelClick={({ level }) => {
          captured = level.index;
        }}
      />,
    );
    const levels = document.querySelectorAll(
      '[data-section="chart-line-fibonacci-level"]',
    );
    fireEvent.click(levels[3]!);
    expect(captured).toBe(3);
  });

  it('onSampleClick fires with the dot payload', () => {
    let captured: number | null = null;
    render(
      <ChartLineFibonacci
        data={FIB_DATA}
        showDots
        onSampleClick={({ point }) => {
          captured = point.index;
        }}
      />,
    );
    const dots = document.querySelectorAll(
      '[data-section="chart-line-fibonacci-dot"]',
    );
    fireEvent.click(dots[2]!);
    expect(captured).toBe(2);
  });

  it('a custom ratio set changes the level count', () => {
    render(<ChartLineFibonacci data={FIB_DATA} ratios={[0, 0.5, 1]} />);
    expect(
      document.querySelectorAll(
        '[data-section="chart-line-fibonacci-level"]',
      ).length,
    ).toBe(3);
  });

  it('footer reports the trend and range, and hides via prop', () => {
    const { rerender } = render(<ChartLineFibonacci data={FIB_DATA} />);
    expect(
      document.querySelector(
        '[data-section="chart-line-fibonacci-footer-stats"]',
      )?.textContent,
    ).toContain('up swing');
    rerender(<ChartLineFibonacci data={FIB_DATA} showFooter={false} />);
    expect(
      document.querySelector(
        '[data-section="chart-line-fibonacci-footer"]',
      ),
    ).toBeNull();
  });

  it('animate flag toggles data-animate + class', () => {
    const { rerender } = render(
      <ChartLineFibonacci data={FIB_DATA} animate={true} />,
    );
    const root = document.querySelector(
      '[data-section="chart-line-fibonacci"]',
    );
    expect(root!.getAttribute('data-animate')).toBe('true');
    expect(root!.className).toContain('motion-safe:animate-fade-in');
    rerender(<ChartLineFibonacci data={FIB_DATA} animate={false} />);
    expect(
      document
        .querySelector('[data-section="chart-line-fibonacci"]')!
        .getAttribute('data-animate'),
    ).toBe('false');
  });

  it('ref forwarding', () => {
    const ref = createRef<HTMLDivElement>();
    render(<ChartLineFibonacci ref={ref} data={FIB_DATA} />);
    expect(ref.current!.getAttribute('data-section')).toBe(
      'chart-line-fibonacci',
    );
  });

  it('has displayName', () => {
    expect(ChartLineFibonacci.displayName).toBe('ChartLineFibonacci');
  });

  it('custom ariaLabel applied to root and svg', () => {
    render(
      <ChartLineFibonacci data={FIB_DATA} ariaLabel="Retracement grid" />,
    );
    expect(
      document
        .querySelector('[data-section="chart-line-fibonacci"]')!
        .getAttribute('aria-label'),
    ).toBe('Retracement grid');
    expect(
      document
        .querySelector('[data-section="chart-line-fibonacci-svg"]')!
        .getAttribute('aria-label'),
    ).toBe('Retracement grid');
  });

  it('xLabel and yLabel render axis text', () => {
    render(
      <ChartLineFibonacci data={FIB_DATA} xLabel="bar" yLabel="price" />,
    );
    expect(screen.getByText('bar').getAttribute('data-section')).toBe(
      'chart-line-fibonacci-x-label',
    );
    expect(screen.getByText('price').getAttribute('data-section')).toBe(
      'chart-line-fibonacci-y-label',
    );
  });
});
