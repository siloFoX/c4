import { afterEach, describe, expect, it } from 'vitest';
import { createRef } from 'react';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import {
  ChartLineHeatline,
  DEFAULT_CHART_LINE_HEATLINE_HEIGHT,
  DEFAULT_CHART_LINE_HEATLINE_PADDING,
  DEFAULT_CHART_LINE_HEATLINE_SCALE,
  DEFAULT_CHART_LINE_HEATLINE_STROKE_WIDTH,
  DEFAULT_CHART_LINE_HEATLINE_WIDTH,
  computeLineHeatlineLayout,
  describeLineHeatlineChart,
  getLineHeatlineFinitePoints,
  interpolateLineHeatlineColor,
  normalizeLineHeatlineValue,
  parseHexColor,
  runLineHeatline,
  type ChartLineHeatlinePoint,
} from './chart-line-heatline';

afterEach(() => {
  cleanup();
});

// values 0..100 in even steps -> point t lands exactly on 0/.25/.5/.75/1
const HEAT_DATA: ChartLineHeatlinePoint[] = [
  { x: 0, value: 0 },
  { x: 1, value: 25 },
  { x: 2, value: 50 },
  { x: 3, value: 75 },
  { x: 4, value: 100 },
];

describe('chart-line-heatline defaults', () => {
  it('positive size defaults', () => {
    expect(DEFAULT_CHART_LINE_HEATLINE_WIDTH).toBeGreaterThan(0);
    expect(DEFAULT_CHART_LINE_HEATLINE_HEIGHT).toBeGreaterThan(0);
    expect(DEFAULT_CHART_LINE_HEATLINE_PADDING).toBeGreaterThan(0);
    expect(DEFAULT_CHART_LINE_HEATLINE_STROKE_WIDTH).toBeGreaterThan(0);
  });
  it('default colour scale has at least 2 stops', () => {
    expect(DEFAULT_CHART_LINE_HEATLINE_SCALE.length).toBeGreaterThanOrEqual(
      2,
    );
  });
});

describe('parseHexColor', () => {
  it('parses a 6-digit hex into RGB channels', () => {
    expect(parseHexColor('#ff8800')).toEqual({ r: 255, g: 136, b: 0 });
    expect(parseHexColor('#1e40af')).toEqual({ r: 30, g: 64, b: 175 });
  });
  it('rejects malformed input', () => {
    expect(parseHexColor('bad')).toBeNull();
    expect(parseHexColor('#fff')).toBeNull();
  });
  it('rejects non-string input', () => {
    expect(parseHexColor(123)).toBeNull();
    expect(parseHexColor(null)).toBeNull();
  });
});

describe('interpolateLineHeatlineColor', () => {
  it('returns the endpoints at t=0 and t=1', () => {
    expect(
      interpolateLineHeatlineColor(['#000000', '#ffffff'], 0),
    ).toBe('#000000');
    expect(
      interpolateLineHeatlineColor(['#000000', '#ffffff'], 1),
    ).toBe('#ffffff');
  });
  it('linearly interpolates the RGB channels at the midpoint', () => {
    expect(
      interpolateLineHeatlineColor(['#000000', '#ffffff'], 0.5),
    ).toBe('#808080');
  });
  it('selects the exact stop in a 3-stop scale', () => {
    expect(
      interpolateLineHeatlineColor(
        ['#000000', '#ff0000', '#ffffff'],
        0.5,
      ),
    ).toBe('#ff0000');
  });
  it('interpolates between adjacent stops of a 3-stop scale', () => {
    expect(
      interpolateLineHeatlineColor(
        ['#000000', '#ff0000', '#ffffff'],
        0.25,
      ),
    ).toBe('#800000');
  });
  it('clamps t outside [0,1]', () => {
    expect(
      interpolateLineHeatlineColor(['#000000', '#ffffff'], 2),
    ).toBe('#ffffff');
    expect(
      interpolateLineHeatlineColor(['#000000', '#ffffff'], -1),
    ).toBe('#000000');
  });
  it('non-finite t falls back to 0', () => {
    expect(
      interpolateLineHeatlineColor(['#000000', '#ffffff'], NaN),
    ).toBe('#000000');
  });
  it('handles empty and single-stop scales', () => {
    expect(interpolateLineHeatlineColor([], 0.5)).toBe('#000000');
    expect(interpolateLineHeatlineColor(['#abc123'], 0.7)).toBe(
      '#abc123',
    );
  });
});

describe('normalizeLineHeatlineValue', () => {
  it('maps the value into [0,1]', () => {
    expect(normalizeLineHeatlineValue(50, 0, 100)).toBe(0.5);
    expect(normalizeLineHeatlineValue(0, 0, 100)).toBe(0);
    expect(normalizeLineHeatlineValue(100, 0, 100)).toBe(1);
  });
  it('clamps values outside the domain', () => {
    expect(normalizeLineHeatlineValue(150, 0, 100)).toBe(1);
    expect(normalizeLineHeatlineValue(-10, 0, 100)).toBe(0);
  });
  it('a zero-width domain collapses to the midpoint', () => {
    expect(normalizeLineHeatlineValue(5, 10, 10)).toBe(0.5);
  });
});

describe('getLineHeatlineFinitePoints', () => {
  it('drops points with non-finite x or value', () => {
    const r = getLineHeatlineFinitePoints([
      { x: 0, value: 0 },
      { x: NaN, value: 1 },
      { x: 1, value: Infinity },
      { x: 2, value: 4 },
    ]);
    expect(r.length).toBe(2);
  });
  it('null returns []', () => {
    expect(getLineHeatlineFinitePoints(null)).toEqual([]);
  });
});

describe('runLineHeatline', () => {
  it('empty -> ok=false', () => {
    const r = runLineHeatline([]);
    expect(r.ok).toBe(false);
    expect(r.totalSamples).toBe(0);
  });
  it('grades every point by its normalized value', () => {
    const r = runLineHeatline(HEAT_DATA);
    expect(r.points.map((p) => p.t)).toEqual([0, 0.25, 0.5, 0.75, 1]);
  });
  it('produces one segment per consecutive pair', () => {
    const r = runLineHeatline(HEAT_DATA);
    expect(r.segments.length).toBe(4);
  });
  it('a segment is graded by its midpoint value', () => {
    const r = runLineHeatline(HEAT_DATA);
    // midpoint of values 0 and 25 is 12.5 -> t 0.125
    expect(r.segments[0]!.value).toBe(12.5);
    expect(r.segments[0]!.t).toBeCloseTo(0.125, 10);
  });
  it('reports the value range and the colour domain', () => {
    const r = runLineHeatline(HEAT_DATA);
    expect(r.valueMin).toBe(0);
    expect(r.valueMax).toBe(100);
    expect(r.domainMin).toBe(0);
    expect(r.domainMax).toBe(100);
  });
  it('a domain override rescales the colour mapping', () => {
    const r = runLineHeatline(HEAT_DATA, {
      domainMin: 0,
      domainMax: 200,
    });
    expect(r.domainMax).toBe(200);
    // value 100 is now mid-domain
    expect(r.points[4]!.t).toBeCloseTo(0.5, 10);
  });
  it('swaps an inverted domain', () => {
    const r = runLineHeatline(HEAT_DATA, {
      domainMin: 200,
      domainMax: 0,
    });
    expect(r.domainMin).toBe(0);
    expect(r.domainMax).toBe(200);
  });
  it('sorts the points ascending by x', () => {
    const r = runLineHeatline([
      { x: 2, value: 1 },
      { x: 0, value: 1 },
      { x: 1, value: 1 },
    ]);
    expect(r.points.map((p) => p.x)).toEqual([0, 1, 2]);
  });
  it('a single point yields no segments', () => {
    const r = runLineHeatline([{ x: 0, value: 5 }]);
    expect(r.points.length).toBe(1);
    expect(r.segments.length).toBe(0);
  });
  it('point colours come from the scale', () => {
    const r = runLineHeatline(HEAT_DATA);
    expect(r.points[0]!.color).toBe(
      interpolateLineHeatlineColor(DEFAULT_CHART_LINE_HEATLINE_SCALE, 0),
    );
    expect(r.points[4]!.color).toBe(
      interpolateLineHeatlineColor(DEFAULT_CHART_LINE_HEATLINE_SCALE, 1),
    );
  });
});

describe('computeLineHeatlineLayout', () => {
  it('empty data -> ok=false', () => {
    const layout = computeLineHeatlineLayout({
      data: [],
      width: 400,
      height: 200,
      padding: 30,
    });
    expect(layout.ok).toBe(false);
  });

  it('degenerate canvas -> ok=false', () => {
    const layout = computeLineHeatlineLayout({
      data: HEAT_DATA,
      width: 20,
      height: 20,
      padding: 30,
    });
    expect(layout.ok).toBe(false);
  });

  it('projects points and builds segment paths', () => {
    const layout = computeLineHeatlineLayout({
      data: HEAT_DATA,
      width: 400,
      height: 200,
      padding: 30,
    });
    expect(layout.ok).toBe(true);
    expect(layout.points.length).toBe(5);
    expect(layout.segments.length).toBe(4);
    expect(layout.segments[0]!.path).toContain('M ');
    expect(layout.segments[0]!.path).toContain(' L ');
  });

  it('every projected coordinate is finite', () => {
    const layout = computeLineHeatlineLayout({
      data: HEAT_DATA,
      width: 400,
      height: 200,
      padding: 30,
    });
    for (const p of layout.points) {
      expect(Number.isFinite(p.px)).toBe(true);
      expect(Number.isFinite(p.py)).toBe(true);
    }
    for (const s of layout.segments) {
      expect(Number.isFinite(s.px0)).toBe(true);
      expect(Number.isFinite(s.py1)).toBe(true);
    }
  });

  it('the x and y ranges come from the data', () => {
    const layout = computeLineHeatlineLayout({
      data: HEAT_DATA,
      width: 400,
      height: 200,
      padding: 30,
    });
    expect(layout.xMin).toBe(0);
    expect(layout.xMax).toBe(4);
    expect(layout.yMin).toBe(0);
    expect(layout.yMax).toBe(100);
  });

  it('exposes the value range and the colour domain', () => {
    const layout = computeLineHeatlineLayout({
      data: HEAT_DATA,
      width: 400,
      height: 200,
      padding: 30,
    });
    expect(layout.valueMin).toBe(0);
    expect(layout.valueMax).toBe(100);
    expect(layout.domainMin).toBe(0);
    expect(layout.domainMax).toBe(100);
  });

  it('bounds overrides honoured', () => {
    const layout = computeLineHeatlineLayout({
      data: HEAT_DATA,
      width: 400,
      height: 200,
      padding: 30,
      xMin: -5,
      xMax: 50,
      yMin: -10,
      yMax: 200,
    });
    expect(layout.xMin).toBe(-5);
    expect(layout.xMax).toBe(50);
    expect(layout.yMin).toBe(-10);
    expect(layout.yMax).toBe(200);
  });

  it('totalSamples reflects the point count', () => {
    const layout = computeLineHeatlineLayout({
      data: HEAT_DATA,
      width: 400,
      height: 200,
      padding: 30,
    });
    expect(layout.totalSamples).toBe(5);
  });
});

describe('describeLineHeatlineChart', () => {
  it('no data -> No data', () => {
    expect(describeLineHeatlineChart([])).toBe('No data');
    expect(describeLineHeatlineChart(null)).toBe('No data');
  });
  it('summary mentions heatline + colour domain', () => {
    const s = describeLineHeatlineChart(HEAT_DATA);
    expect(s).toContain('heatline');
    expect(s).toContain('domain');
  });
  it('reports the resolved domain values', () => {
    const s = describeLineHeatlineChart(HEAT_DATA);
    expect(s).toContain('[0, 100]');
  });
});

describe('<ChartLineHeatline> render', () => {
  it('renders empty state with no data', () => {
    render(<ChartLineHeatline data={[]} />);
    expect(
      document
        .querySelector('[data-section="chart-line-heatline"]')!
        .getAttribute('data-empty'),
    ).toBe('true');
  });

  it('renders one segment per consecutive pair', () => {
    render(<ChartLineHeatline data={HEAT_DATA} />);
    expect(
      document.querySelectorAll(
        '[data-section="chart-line-heatline-segment"]',
      ).length,
    ).toBe(4);
  });

  it('each segment carries its own hex stroke colour', () => {
    render(<ChartLineHeatline data={HEAT_DATA} />);
    const seg = document.querySelector(
      '[data-section="chart-line-heatline-segment"]',
    );
    expect(seg!.getAttribute('stroke')).toMatch(/^#[0-9a-f]{6}$/);
  });

  it('renders dots coloured by point value and hides them via prop', () => {
    const { rerender } = render(<ChartLineHeatline data={HEAT_DATA} />);
    const dots = document.querySelectorAll(
      '[data-section="chart-line-heatline-dot"]',
    );
    expect(dots.length).toBe(5);
    // point 0 is at t=0 -> the first scale stop
    expect(dots[0]!.getAttribute('fill')).toBe(
      interpolateLineHeatlineColor(DEFAULT_CHART_LINE_HEATLINE_SCALE, 0),
    );
    rerender(<ChartLineHeatline data={HEAT_DATA} showDots={false} />);
    expect(
      document.querySelector('[data-section="chart-line-heatline-dot"]'),
    ).toBeNull();
  });

  it('renders a colour scale legend and hides it via showScale=false', () => {
    const { rerender } = render(<ChartLineHeatline data={HEAT_DATA} />);
    expect(
      document.querySelectorAll(
        '[data-section="chart-line-heatline-scale-swatch"]',
      ).length,
    ).toBe(DEFAULT_CHART_LINE_HEATLINE_SCALE.length);
    rerender(<ChartLineHeatline data={HEAT_DATA} showScale={false} />);
    expect(
      document.querySelector('[data-section="chart-line-heatline-scale"]'),
    ).toBeNull();
  });

  it('the scale legend shows the domain min and max', () => {
    render(<ChartLineHeatline data={HEAT_DATA} />);
    expect(
      document.querySelector(
        '[data-section="chart-line-heatline-scale-min"]',
      )?.textContent,
    ).toBe('0');
    expect(
      document.querySelector(
        '[data-section="chart-line-heatline-scale-max"]',
      )?.textContent,
    ).toBe('100');
  });

  it('a custom colour scale changes the swatch count', () => {
    render(
      <ChartLineHeatline
        data={HEAT_DATA}
        colorScale={['#000000', '#ffffff']}
      />,
    );
    expect(
      document.querySelectorAll(
        '[data-section="chart-line-heatline-scale-swatch"]',
      ).length,
    ).toBe(2);
  });

  it('config badge shows the colour domain', () => {
    render(<ChartLineHeatline data={HEAT_DATA} />);
    expect(
      document.querySelector(
        '[data-section="chart-line-heatline-badge-lo"]',
      )?.textContent,
    ).toBe('lo=0');
    expect(
      document.querySelector(
        '[data-section="chart-line-heatline-badge-hi"]',
      )?.textContent,
    ).toBe('hi=100');
  });

  it('hides the config badge via showConfigBadge=false', () => {
    render(
      <ChartLineHeatline data={HEAT_DATA} showConfigBadge={false} />,
    );
    expect(
      document.querySelector('[data-section="chart-line-heatline-badge"]'),
    ).toBeNull();
  });

  it('a domain override is reflected on the root', () => {
    render(
      <ChartLineHeatline
        data={HEAT_DATA}
        domainMin={0}
        domainMax={200}
      />,
    );
    expect(
      document
        .querySelector('[data-section="chart-line-heatline"]')!
        .getAttribute('data-domain-max'),
    ).toBe('200');
  });

  it('ARIA: region + img + sr-only desc', () => {
    render(<ChartLineHeatline data={HEAT_DATA} />);
    expect(
      document
        .querySelector('[data-section="chart-line-heatline"]')!
        .getAttribute('role'),
    ).toBe('region');
    expect(
      document
        .querySelector('[data-section="chart-line-heatline-svg"]')!
        .getAttribute('role'),
    ).toBe('img');
    expect(
      document.querySelector(
        '[data-section="chart-line-heatline-aria-desc"]',
      )!.textContent,
    ).toContain('heatline');
  });

  it('root carries data-* attributes', () => {
    render(<ChartLineHeatline data={HEAT_DATA} />);
    const root = document.querySelector(
      '[data-section="chart-line-heatline"]',
    );
    expect(root!.getAttribute('data-total-samples')).toBe('5');
    expect(root!.getAttribute('data-segment-count')).toBe('4');
    expect(Number(root!.getAttribute('data-value-min'))).toBe(0);
    expect(Number(root!.getAttribute('data-value-max'))).toBe(100);
  });

  it('segment exposes index / value / t attributes', () => {
    render(<ChartLineHeatline data={HEAT_DATA} />);
    const seg = document.querySelector(
      '[data-section="chart-line-heatline-segment"][data-segment-index="0"]',
    );
    expect(Number(seg!.getAttribute('data-value'))).toBe(12.5);
    expect(Number(seg!.getAttribute('data-t'))).toBeCloseTo(0.125, 5);
  });

  it('dot exposes index / x / value / t attributes', () => {
    render(<ChartLineHeatline data={HEAT_DATA} />);
    const dots = document.querySelectorAll(
      '[data-section="chart-line-heatline-dot"]',
    );
    expect(dots[2]!.getAttribute('data-x')).toBe('2');
    expect(dots[2]!.getAttribute('data-value')).toBe('50');
    expect(Number(dots[2]!.getAttribute('data-t'))).toBeCloseTo(0.5, 5);
  });

  it('tooltip on a dot shows x + value + level', () => {
    render(<ChartLineHeatline data={HEAT_DATA} />);
    const dots = document.querySelectorAll(
      '[data-section="chart-line-heatline-dot"]',
    );
    fireEvent.mouseEnter(dots[2]!);
    expect(
      document.querySelector(
        '[data-section="chart-line-heatline-tooltip-value"]',
      )?.textContent,
    ).toBe('value: 50');
    expect(
      document.querySelector(
        '[data-section="chart-line-heatline-tooltip-level"]',
      )?.textContent,
    ).toBe('level: 50%');
    fireEvent.mouseLeave(dots[2]!);
    expect(
      document.querySelector(
        '[data-section="chart-line-heatline-tooltip"]',
      ),
    ).toBeNull();
  });

  it('omits the tooltip when showTooltip=false', () => {
    render(<ChartLineHeatline data={HEAT_DATA} showTooltip={false} />);
    const dot = document.querySelector(
      '[data-section="chart-line-heatline-dot"]',
    );
    fireEvent.mouseEnter(dot!);
    expect(
      document.querySelector(
        '[data-section="chart-line-heatline-tooltip"]',
      ),
    ).toBeNull();
  });

  it('onPointClick fires with the point payload', () => {
    let captured: number | null = null;
    render(
      <ChartLineHeatline
        data={HEAT_DATA}
        onPointClick={({ point }) => {
          captured = point.index;
        }}
      />,
    );
    const dots = document.querySelectorAll(
      '[data-section="chart-line-heatline-dot"]',
    );
    fireEvent.click(dots[3]!);
    expect(captured).toBe(3);
  });

  it('renders x and y axis ticks', () => {
    render(<ChartLineHeatline data={HEAT_DATA} />);
    expect(
      document.querySelectorAll(
        '[data-section="chart-line-heatline-tick"][data-axis="x"]',
      ).length,
    ).toBeGreaterThan(0);
    expect(
      document.querySelectorAll(
        '[data-section="chart-line-heatline-tick"][data-axis="y"]',
      ).length,
    ).toBeGreaterThan(0);
  });

  it('animate flag toggles data-animate + class', () => {
    const { rerender } = render(
      <ChartLineHeatline data={HEAT_DATA} animate={true} />,
    );
    const root = document.querySelector(
      '[data-section="chart-line-heatline"]',
    );
    expect(root!.getAttribute('data-animate')).toBe('true');
    expect(root!.className).toContain('motion-safe:animate-fade-in');
    rerender(<ChartLineHeatline data={HEAT_DATA} animate={false} />);
    expect(
      document
        .querySelector('[data-section="chart-line-heatline"]')!
        .getAttribute('data-animate'),
    ).toBe('false');
  });

  it('ref forwarding', () => {
    const ref = createRef<HTMLDivElement>();
    render(<ChartLineHeatline ref={ref} data={HEAT_DATA} />);
    expect(ref.current!.getAttribute('data-section')).toBe(
      'chart-line-heatline',
    );
  });

  it('has displayName', () => {
    expect(ChartLineHeatline.displayName).toBe('ChartLineHeatline');
  });

  it('custom ariaLabel applied to root and svg', () => {
    render(<ChartLineHeatline data={HEAT_DATA} ariaLabel="Heat trace" />);
    expect(
      document
        .querySelector('[data-section="chart-line-heatline"]')!
        .getAttribute('aria-label'),
    ).toBe('Heat trace');
    expect(
      document
        .querySelector('[data-section="chart-line-heatline-svg"]')!
        .getAttribute('aria-label'),
    ).toBe('Heat trace');
  });

  it('xLabel and yLabel render axis text', () => {
    render(
      <ChartLineHeatline data={HEAT_DATA} xLabel="t" yLabel="reading" />,
    );
    expect(screen.getByText('t').getAttribute('data-section')).toBe(
      'chart-line-heatline-x-label',
    );
    expect(screen.getByText('reading').getAttribute('data-section')).toBe(
      'chart-line-heatline-y-label',
    );
  });
});
