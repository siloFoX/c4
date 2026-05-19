import { afterEach, describe, expect, it } from 'vitest';
import {
  cleanup,
  render,
  screen,
} from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { createRef } from 'react';
import {
  ChartSparkline,
  DEFAULT_SPARKLINE_COLOR,
  DEFAULT_SPARKLINE_FILL_OPACITY,
  DEFAULT_SPARKLINE_HEIGHT,
  DEFAULT_SPARKLINE_STROKE_WIDTH,
  DEFAULT_SPARKLINE_WIDTH,
  buildSparklineAreaPath,
  buildSparklinePath,
  findSparklineExtremes,
  getSparklineBounds,
  getSparklinePoints,
} from './chart-sparkline';

afterEach(() => {
  cleanup();
});

// ---------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------

describe('getSparklineBounds', () => {
  it('returns min + max for a normal series', () => {
    expect(getSparklineBounds([1, 5, 3])).toEqual({
      min: 1,
      max: 5,
    });
  });
  it('expands constant series so the line is visible', () => {
    expect(getSparklineBounds([5, 5, 5])).toEqual({
      min: 4.5,
      max: 5.5,
    });
  });
  it('empty / non-finite -> (0, 1)', () => {
    expect(getSparklineBounds([])).toEqual({ min: 0, max: 1 });
    expect(
      getSparklineBounds([Number.NaN, Number.NaN]),
    ).toEqual({ min: 0, max: 1 });
  });
  it('ignores non-finite values mixed with valid ones', () => {
    expect(getSparklineBounds([Number.NaN, 3, 7, 1])).toEqual({
      min: 1,
      max: 7,
    });
  });
});

describe('getSparklinePoints', () => {
  it('returns empty for empty input', () => {
    expect(getSparklinePoints([], 100, 50)).toEqual([]);
  });
  it('single point sits at the centre', () => {
    expect(getSparklinePoints([5], 100, 50)).toEqual([
      { x: 50, y: 25 },
    ]);
  });
  it('two-point series spans the full width', () => {
    const pts = getSparklinePoints([0, 10], 100, 100);
    expect(pts[0]?.x).toBe(0);
    expect(pts[1]?.x).toBe(100);
    // Higher values map to lower y (SVG origin top-left)
    expect(pts[0]?.y).toBe(100);
    expect(pts[1]?.y).toBe(0);
  });
  it('x positions evenly spaced', () => {
    const pts = getSparklinePoints([1, 2, 3, 4, 5], 100, 50);
    expect(pts.map((p) => p.x)).toEqual([0, 25, 50, 75, 100]);
  });
});

describe('buildSparklinePath', () => {
  it('returns empty for empty', () => {
    expect(buildSparklinePath([])).toBe('');
  });
  it('straight path emits M + L commands', () => {
    const p = buildSparklinePath(
      [
        { x: 0, y: 0 },
        { x: 10, y: 5 },
      ],
      false,
    );
    expect(p).toBe('M 0.00 0.00 L 10.00 5.00');
  });
  it('smooth with < 3 points degrades to straight', () => {
    const a = buildSparklinePath(
      [
        { x: 0, y: 0 },
        { x: 10, y: 5 },
      ],
      true,
    );
    expect(a).not.toContain('C ');
  });
  it('smooth path emits cubic bezier C for 3+ points', () => {
    const p = buildSparklinePath(
      [
        { x: 0, y: 0 },
        { x: 10, y: 5 },
        { x: 20, y: 0 },
      ],
      true,
    );
    expect(p).toContain('C ');
  });
});

describe('buildSparklineAreaPath', () => {
  it('returns empty for empty', () => {
    expect(buildSparklineAreaPath([], 50)).toBe('');
  });
  it('closes the area to the baseline', () => {
    const p = buildSparklineAreaPath(
      [
        { x: 0, y: 0 },
        { x: 10, y: 5 },
      ],
      50,
    );
    expect(p).toContain('M 0.00 0.00');
    expect(p).toContain('L 10.00 5.00');
    expect(p).toContain('L 10.00 50.00');
    expect(p).toContain('L 0.00 50.00');
    expect(p).toContain('Z');
  });
});

describe('findSparklineExtremes', () => {
  it('returns -1/-1 for empty', () => {
    expect(findSparklineExtremes([])).toEqual({
      highIndex: -1,
      lowIndex: -1,
    });
  });
  it('finds high + low indexes', () => {
    expect(findSparklineExtremes([3, 1, 5, 2])).toEqual({
      highIndex: 2,
      lowIndex: 1,
    });
  });
  it('skips non-finite when scanning', () => {
    const out = findSparklineExtremes([
      Number.NaN,
      3,
      Number.NaN,
      7,
      1,
    ]);
    expect(out.highIndex).toBe(3);
    expect(out.lowIndex).toBe(4);
  });
});

describe('Constants', () => {
  it('defaults', () => {
    expect(DEFAULT_SPARKLINE_WIDTH).toBe(80);
    expect(DEFAULT_SPARKLINE_HEIGHT).toBe(24);
    expect(DEFAULT_SPARKLINE_STROKE_WIDTH).toBe(1.5);
    expect(DEFAULT_SPARKLINE_FILL_OPACITY).toBeCloseTo(0.2, 2);
    expect(DEFAULT_SPARKLINE_COLOR).toBe('#3b82f6');
  });
});

// ---------------------------------------------------------------
// Component
// ---------------------------------------------------------------

describe('ChartSparkline component', () => {
  const DATA = [1, 3, 2, 6, 4];

  it('renders an img-role span with default aria-label', () => {
    render(<ChartSparkline data={DATA} />);
    expect(
      screen.getByRole('img', { name: 'Trend' }),
    ).toBeInTheDocument();
  });

  it('honors custom ariaLabel', () => {
    render(
      <ChartSparkline data={DATA} ariaLabel="CPU usage" />,
    );
    expect(
      screen.getByRole('img', { name: 'CPU usage' }),
    ).toBeInTheDocument();
  });

  it('renders a line path with M + L commands by default', () => {
    const { container } = render(<ChartSparkline data={DATA} />);
    const line = container.querySelector(
      '[data-section="chart-sparkline-line"]',
    );
    const d = line?.getAttribute('d') ?? '';
    expect(d).toContain('M ');
    expect(d).toContain('L ');
  });

  it('smooth=true emits cubic bezier path', () => {
    const { container } = render(
      <ChartSparkline data={DATA} smooth />,
    );
    const d =
      container
        .querySelector('[data-section="chart-sparkline-line"]')
        ?.getAttribute('d') ?? '';
    expect(d).toContain('C ');
  });

  it('fill=false hides the area path', () => {
    const { container } = render(<ChartSparkline data={DATA} />);
    expect(
      container.querySelector(
        '[data-section="chart-sparkline-area"]',
      ),
    ).toBeNull();
  });

  it('fill=true renders the area path with fill-opacity', () => {
    const { container } = render(
      <ChartSparkline data={DATA} fill fillOpacity={0.5} />,
    );
    const area = container.querySelector(
      '[data-section="chart-sparkline-area"]',
    );
    expect(area).toBeInTheDocument();
    expect(area).toHaveAttribute('fill-opacity', '0.5');
  });

  it('showLastDot renders the last-point circle', () => {
    const { container } = render(
      <ChartSparkline data={DATA} showLastDot />,
    );
    const last = container.querySelector(
      '[data-section="chart-sparkline-last"]',
    );
    expect(last).toBeInTheDocument();
    expect(last).toHaveAttribute(
      'data-index',
      String(DATA.length - 1),
    );
  });

  it('showHighLow renders separate high + low markers', () => {
    const { container } = render(
      <ChartSparkline data={DATA} showHighLow />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-sparkline-high"]',
      ),
    ).toBeInTheDocument();
    expect(
      container.querySelector(
        '[data-section="chart-sparkline-low"]',
      ),
    ).toBeInTheDocument();
  });

  it('showHighLow with constant series skips the low marker (no extreme split)', () => {
    const { container } = render(
      <ChartSparkline data={[5, 5, 5, 5]} showHighLow />,
    );
    // High + low resolve to the same index -> low is suppressed.
    expect(
      container.querySelector(
        '[data-section="chart-sparkline-low"]',
      ),
    ).toBeNull();
  });

  it('custom color applies to the stroke + fill', () => {
    const { container } = render(
      <ChartSparkline data={DATA} color="#ff00ff" fill />,
    );
    const line = container.querySelector(
      '[data-section="chart-sparkline-line"]',
    );
    const area = container.querySelector(
      '[data-section="chart-sparkline-area"]',
    );
    expect(line).toHaveAttribute('stroke', '#ff00ff');
    expect(area).toHaveAttribute('fill', '#ff00ff');
  });

  it('strokeWidth prop applies to the line', () => {
    const { container } = render(
      <ChartSparkline data={DATA} strokeWidth={3} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-sparkline-line"]',
      ),
    ).toHaveAttribute('stroke-width', '3');
  });

  it('default ARIA description summarises the trend', () => {
    const { container } = render(
      <ChartSparkline data={DATA} />,
    );
    const desc = container.querySelector(
      '[data-section="chart-sparkline-aria-desc"]',
    );
    expect(desc?.textContent).toContain('Trend from 1');
    expect(desc?.textContent).toContain('to 4');
    expect(desc?.textContent).toContain('min 1');
    expect(desc?.textContent).toContain('max 6');
  });

  it('formatValue customises the ARIA description numbers', () => {
    const { container } = render(
      <ChartSparkline
        data={[10, 20]}
        formatValue={(v) => `${v}%`}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-sparkline-aria-desc"]',
      )?.textContent,
    ).toContain('Trend from 10% to 20%');
  });

  it('ariaDescription override replaces the default summary', () => {
    const { container } = render(
      <ChartSparkline
        data={DATA}
        ariaDescription="custom desc"
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-sparkline-aria-desc"]',
      )?.textContent,
    ).toBe('custom desc');
  });

  it('empty data renders an empty svg + "No data" description', () => {
    const { container } = render(
      <ChartSparkline data={[]} />,
    );
    const desc = container.querySelector(
      '[data-section="chart-sparkline-aria-desc"]',
    );
    expect(desc?.textContent).toBe('No data');
    // No line / area paths
    expect(
      container.querySelector(
        '[data-section="chart-sparkline-line"]',
      ),
    ).toBeNull();
  });

  it('width / height apply to the wrapper + viewBox', () => {
    const { container } = render(
      <ChartSparkline data={DATA} width={120} height={40} />,
    );
    const root = container.querySelector(
      '[data-section="chart-sparkline"]',
    ) as HTMLElement;
    expect(root.style.width).toBe('120px');
    expect(root.style.height).toBe('40px');
    expect(
      container.querySelector(
        '[data-section="chart-sparkline-svg"]',
      ),
    ).toHaveAttribute('viewBox', '0 0 120 40');
  });

  it('baseline prop drops the area baseline', () => {
    const { container } = render(
      <ChartSparkline data={[10, 5, 8]} fill baseline={0} />,
    );
    const d =
      container
        .querySelector('[data-section="chart-sparkline-area"]')
        ?.getAttribute('d') ?? '';
    // baseline=0 should produce L commands at the bottom edge
    // (large y values), not at the bottom of the chart.
    expect(d).toContain('Z');
  });

  it('root data attrs mirror state', () => {
    render(
      <ChartSparkline data={DATA} fill smooth />,
    );
    const root = screen.getByRole('img');
    expect(root).toHaveAttribute('data-point-count', '5');
    expect(root).toHaveAttribute('data-fill', 'true');
    expect(root).toHaveAttribute('data-smooth', 'true');
  });

  it('forwards ref to the root span', () => {
    const ref = createRef<HTMLSpanElement>();
    render(<ChartSparkline ref={ref} data={DATA} />);
    expect(ref.current?.getAttribute('role')).toBe('img');
  });

  it('exposes a stable displayName', () => {
    expect(ChartSparkline.displayName).toBe('ChartSparkline');
  });
});
