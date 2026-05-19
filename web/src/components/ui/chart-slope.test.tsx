import { afterEach, describe, it, expect, vi } from 'vitest';
import { createRef } from 'react';
import { render, fireEvent, cleanup } from '@testing-library/react';
import {
  ChartSlope,
  computeSlopeLayout,
  describeSlopeChart,
  getSlopeBounds,
  getSlopeDirection,
  getSlopeDirectionColor,
  getSlopePctChange,
  getSlopeTicks,
  DEFAULT_CHART_SLOPE_WIDTH,
  DEFAULT_CHART_SLOPE_HEIGHT,
  DEFAULT_CHART_SLOPE_PADDING,
  DEFAULT_CHART_SLOPE_LABEL_GAP,
  DEFAULT_CHART_SLOPE_POINT_RADIUS,
  DEFAULT_CHART_SLOPE_TICK_COUNT,
  DEFAULT_CHART_SLOPE_UP_COLOR,
  DEFAULT_CHART_SLOPE_DOWN_COLOR,
  DEFAULT_CHART_SLOPE_FLAT_COLOR,
  type ChartSlopeItem,
} from './chart-slope';

afterEach(() => cleanup());

const SAMPLE: ChartSlopeItem[] = [
  { id: 'a', label: 'Alpha', before: 10, after: 30 },
  { id: 'b', label: 'Beta', before: 25, after: 15 },
  { id: 'c', label: 'Gamma', before: 18, after: 18 },
];

describe('chart-slope constants', () => {
  it('exports the documented defaults', () => {
    expect(DEFAULT_CHART_SLOPE_WIDTH).toBe(560);
    expect(DEFAULT_CHART_SLOPE_HEIGHT).toBe(320);
    expect(DEFAULT_CHART_SLOPE_PADDING).toBe(40);
    expect(DEFAULT_CHART_SLOPE_LABEL_GAP).toBe(8);
    expect(DEFAULT_CHART_SLOPE_POINT_RADIUS).toBe(4);
    expect(DEFAULT_CHART_SLOPE_TICK_COUNT).toBe(5);
    expect(DEFAULT_CHART_SLOPE_UP_COLOR).toBe('#16a34a');
    expect(DEFAULT_CHART_SLOPE_DOWN_COLOR).toBe('#dc2626');
    expect(DEFAULT_CHART_SLOPE_FLAT_COLOR).toBe('#64748b');
  });
});

describe('getSlopeDirection', () => {
  it('returns up / down / flat for typical values', () => {
    expect(getSlopeDirection(1, 2)).toBe('up');
    expect(getSlopeDirection(2, 1)).toBe('down');
    expect(getSlopeDirection(5, 5)).toBe('flat');
  });
  it('honors epsilon for flat band', () => {
    expect(getSlopeDirection(1, 1.05, 0.1)).toBe('flat');
    expect(getSlopeDirection(1, 1.2, 0.1)).toBe('up');
  });
  it('non-finite -> flat', () => {
    expect(getSlopeDirection(Number.NaN, 1)).toBe('flat');
    expect(getSlopeDirection(1, Number.NaN)).toBe('flat');
  });
});

describe('getSlopePctChange', () => {
  it('returns (after - before) / |before|', () => {
    expect(getSlopePctChange(10, 15)).toBeCloseTo(0.5);
    expect(getSlopePctChange(10, 5)).toBeCloseTo(-0.5);
    expect(getSlopePctChange(-10, -5)).toBeCloseTo(0.5);
  });
  it('zero before -> +Infinity when after > 0, -Infinity when after < 0', () => {
    expect(getSlopePctChange(0, 5)).toBe(Number.POSITIVE_INFINITY);
    expect(getSlopePctChange(0, -5)).toBe(Number.NEGATIVE_INFINITY);
  });
  it('zero before + zero after -> 0', () => {
    expect(getSlopePctChange(0, 0)).toBe(0);
  });
  it('non-finite -> 0', () => {
    expect(getSlopePctChange(Number.NaN, 5)).toBe(0);
  });
});

describe('getSlopeDirectionColor', () => {
  it('returns the up color for up direction', () => {
    expect(getSlopeDirectionColor('up', '#a', '#b', '#c')).toBe('#a');
  });
  it('returns the down color for down direction', () => {
    expect(getSlopeDirectionColor('down', '#a', '#b', '#c')).toBe('#b');
  });
  it('returns the flat color for flat direction', () => {
    expect(getSlopeDirectionColor('flat', '#a', '#b', '#c')).toBe('#c');
  });
});

describe('getSlopeBounds', () => {
  it('returns (0..1) for empty input', () => {
    expect(getSlopeBounds([])).toEqual({ yMin: 0, yMax: 1 });
  });
  it('spans across before + after values', () => {
    const b = getSlopeBounds(SAMPLE);
    expect(b.yMin).toBe(10);
    expect(b.yMax).toBe(30);
  });
  it('skips non-finite values', () => {
    const b = getSlopeBounds([
      { id: 'a', label: 'A', before: Number.NaN, after: 5 },
      { id: 'b', label: 'B', before: 1, after: Number.NaN },
    ]);
    expect(b.yMin).toBe(1);
    expect(b.yMax).toBe(5);
  });
  it('collapsed range expands by +/- 0.5', () => {
    const b = getSlopeBounds([
      { id: 'a', label: 'A', before: 5, after: 5 },
    ]);
    expect(b.yMin).toBeCloseTo(4.5);
    expect(b.yMax).toBeCloseTo(5.5);
  });
});

describe('getSlopeTicks', () => {
  it('returns count evenly-spaced inclusive ticks', () => {
    const t = getSlopeTicks(0, 10, 5);
    expect(t).toHaveLength(5);
    expect(t[0]).toBeCloseTo(0);
    expect(t[4]).toBeCloseTo(10);
  });
  it('collapsed -> [min]', () => {
    expect(getSlopeTicks(5, 5, 5)).toEqual([5]);
  });
  it('clamps count to >= 2', () => {
    expect(getSlopeTicks(0, 1, 1).length).toBe(2);
  });
});

describe('computeSlopeLayout', () => {
  const innerW = 480;
  const innerH = 240;
  const padX = 40;
  const padY = 40;
  const upColor = '#16a34a';
  const downColor = '#dc2626';
  const flatColor = '#64748b';
  const bounds = getSlopeBounds(SAMPLE);

  it('returns one entry per item', () => {
    const out = computeSlopeLayout({
      items: SAMPLE,
      bounds,
      innerW,
      innerH,
      padX,
      padY,
      upColor,
      downColor,
      flatColor,
    });
    expect(out).toHaveLength(3);
  });

  it('left x = padX; right x = padX + innerW', () => {
    const out = computeSlopeLayout({
      items: SAMPLE,
      bounds,
      innerW,
      innerH,
      padX,
      padY,
      upColor,
      downColor,
      flatColor,
    });
    for (const r of out) {
      expect(r.leftX).toBeCloseTo(padX);
      expect(r.rightX).toBeCloseTo(padX + innerW);
    }
  });

  it('higher value paints higher on canvas (smaller y)', () => {
    const out = computeSlopeLayout({
      items: SAMPLE,
      bounds,
      innerW,
      innerH,
      padX,
      padY,
      upColor,
      downColor,
      flatColor,
    });
    const alpha = out[0]!;
    expect(alpha.leftY).toBeGreaterThan(alpha.rightY);
  });

  it('direction is up / down / flat per item', () => {
    const out = computeSlopeLayout({
      items: SAMPLE,
      bounds,
      innerW,
      innerH,
      padX,
      padY,
      upColor,
      downColor,
      flatColor,
    });
    expect(out[0]!.direction).toBe('up');
    expect(out[1]!.direction).toBe('down');
    expect(out[2]!.direction).toBe('flat');
  });

  it('direction-driven color paints when no per-item color override', () => {
    const out = computeSlopeLayout({
      items: SAMPLE,
      bounds,
      innerW,
      innerH,
      padX,
      padY,
      upColor,
      downColor,
      flatColor,
    });
    expect(out[0]!.color).toBe(upColor);
    expect(out[1]!.color).toBe(downColor);
    expect(out[2]!.color).toBe(flatColor);
  });

  it('per-item color override beats direction palette', () => {
    const items: ChartSlopeItem[] = [
      { id: 'a', label: 'A', before: 1, after: 2, color: '#abcdef' },
    ];
    const out = computeSlopeLayout({
      items,
      bounds: getSlopeBounds(items),
      innerW,
      innerH,
      padX,
      padY,
      upColor,
      downColor,
      flatColor,
    });
    expect(out[0]!.color).toBe('#abcdef');
  });

  it('delta = after - before; pctChange divides by |before|', () => {
    const out = computeSlopeLayout({
      items: SAMPLE,
      bounds,
      innerW,
      innerH,
      padX,
      padY,
      upColor,
      downColor,
      flatColor,
    });
    expect(out[0]!.delta).toBe(20);
    expect(out[0]!.pctChange).toBeCloseTo(2);
    expect(out[1]!.delta).toBe(-10);
  });

  it('non-finite before / after sets isValid=false', () => {
    const out = computeSlopeLayout({
      items: [
        { id: 'a', label: 'A', before: Number.NaN, after: 5 },
        { id: 'b', label: 'B', before: 5, after: 10 },
      ],
      bounds: { yMin: 0, yMax: 10 },
      innerW,
      innerH,
      padX,
      padY,
      upColor,
      downColor,
      flatColor,
    });
    expect(out[0]!.isValid).toBe(false);
    expect(out[1]!.isValid).toBe(true);
  });

  it('returns [] for non-positive inner dimensions', () => {
    const out = computeSlopeLayout({
      items: SAMPLE,
      bounds,
      innerW: 0,
      innerH: 100,
      padX,
      padY,
      upColor,
      downColor,
      flatColor,
    });
    expect(out).toEqual([]);
  });

  it('epsilon expands the flat band', () => {
    const out = computeSlopeLayout({
      items: [{ id: 'a', label: 'A', before: 10, after: 10.5 }],
      bounds: { yMin: 0, yMax: 20 },
      innerW,
      innerH,
      padX,
      padY,
      upColor,
      downColor,
      flatColor,
      epsilon: 1,
    });
    expect(out[0]!.direction).toBe('flat');
  });
});

describe('describeSlopeChart', () => {
  it('returns "No data" for empty', () => {
    expect(describeSlopeChart([], 'Before', 'After')).toBe('No data');
  });
  it('returns "No data" when no item has finite before+after', () => {
    expect(
      describeSlopeChart(
        [{ id: 'a', label: 'A', before: Number.NaN, after: 5 }],
        'Before',
        'After'
      )
    ).toBe('No data');
  });
  it('includes counts + range + axis labels', () => {
    const d = describeSlopeChart(SAMPLE, 'Q1', 'Q2');
    expect(d).toContain('Q1');
    expect(d).toContain('Q2');
    expect(d).toContain('3 items');
    expect(d).toContain('1 up');
    expect(d).toContain('1 down');
    expect(d).toContain('1 flat');
    expect(d).toContain('Value range');
  });
  it('honors formatValue', () => {
    const d = describeSlopeChart(
      SAMPLE,
      'Q1',
      'Q2',
      (v) => `$${v}`
    );
    expect(d).toContain('$10');
  });
});

describe('<ChartSlope> component', () => {
  it('renders region + custom aria-label', () => {
    const { getByRole } = render(
      <ChartSlope items={SAMPLE} ariaLabel="Test slope" />
    );
    expect(getByRole('region', { name: 'Test slope' })).toBeTruthy();
  });

  it('renders one item per input', () => {
    const { container } = render(<ChartSlope items={SAMPLE} />);
    const ms = container.querySelectorAll(
      '[data-section="chart-slope-item"]'
    );
    expect(ms.length).toBe(3);
  });

  it('item data attrs mirror before / after / delta / direction', () => {
    const { container } = render(<ChartSlope items={SAMPLE} />);
    const first = container.querySelector(
      '[data-item-id="a"]'
    ) as HTMLElement;
    expect(first.getAttribute('data-item-index')).toBe('0');
    expect(first.getAttribute('data-item-direction')).toBe('up');
    expect(first.getAttribute('data-item-before')).toBe('10');
    expect(first.getAttribute('data-item-after')).toBe('30');
    expect(first.getAttribute('data-item-delta')).toBe('20');
    expect(first.getAttribute('data-item-pct-change')).toBeTruthy();
    expect(first.getAttribute('data-item-color')).toBeTruthy();
  });

  it('line is role=graphics-symbol + tabIndex=0 + aria-label', () => {
    const { container } = render(<ChartSlope items={SAMPLE} />);
    const line = container.querySelector(
      '[data-section="chart-slope-line"]'
    ) as SVGLineElement;
    expect(line.getAttribute('role')).toBe('graphics-symbol');
    expect(line.getAttribute('tabindex')).toBe('0');
    expect(line.getAttribute('aria-label')).toContain('Alpha');
    expect(line.getAttribute('aria-label')).toContain('10');
    expect(line.getAttribute('aria-label')).toContain('30');
    expect(line.getAttribute('aria-label')).toContain('up');
  });

  it('renders left + right endpoints per item', () => {
    const { container } = render(<ChartSlope items={SAMPLE} />);
    expect(
      container.querySelectorAll(
        '[data-section="chart-slope-point"][data-side="left"]'
      ).length
    ).toBe(3);
    expect(
      container.querySelectorAll(
        '[data-section="chart-slope-point"][data-side="right"]'
      ).length
    ).toBe(3);
  });

  it('root mirrors item counts + direction counts + animate', () => {
    const { container } = render(<ChartSlope items={SAMPLE} />);
    const root = container.querySelector('[data-section="chart-slope"]');
    expect(root?.getAttribute('data-item-count')).toBe('3');
    expect(root?.getAttribute('data-visible-count')).toBe('3');
    expect(root?.getAttribute('data-up-count')).toBe('1');
    expect(root?.getAttribute('data-down-count')).toBe('1');
    expect(root?.getAttribute('data-flat-count')).toBe('1');
    expect(root?.getAttribute('data-animate')).toBe('true');
  });

  it('column headers render with default beforeLabel / afterLabel', () => {
    const { container } = render(<ChartSlope items={SAMPLE} />);
    const headers = container.querySelectorAll(
      '[data-section="chart-slope-header"]'
    );
    expect(headers.length).toBe(2);
    expect(headers[0]!.textContent).toBe('Before');
    expect(headers[1]!.textContent).toBe('After');
  });

  it('beforeLabel / afterLabel props rewrite the headers', () => {
    const { container } = render(
      <ChartSlope items={SAMPLE} beforeLabel="Q1" afterLabel="Q2" />
    );
    const headers = container.querySelectorAll(
      '[data-section="chart-slope-header"]'
    );
    expect(headers[0]!.textContent).toBe('Q1');
    expect(headers[1]!.textContent).toBe('Q2');
  });

  it('showColumnHeaders=false suppresses headers', () => {
    const { container } = render(
      <ChartSlope items={SAMPLE} showColumnHeaders={false} />
    );
    expect(
      container.querySelector('[data-section="chart-slope-headers"]')
    ).toBeNull();
  });

  it('axes render by default; suppression via showAxes=false', () => {
    const a = render(<ChartSlope items={SAMPLE} />);
    expect(
      a.container.querySelectorAll(
        '[data-section="chart-slope-axis"]'
      ).length
    ).toBe(2);
    cleanup();
    const b = render(<ChartSlope items={SAMPLE} showAxes={false} />);
    expect(
      b.container.querySelector('[data-section="chart-slope-axes"]')
    ).toBeNull();
  });

  it('axis ticks + grid hidden by default and can be enabled', () => {
    const a = render(<ChartSlope items={SAMPLE} />);
    expect(
      a.container.querySelector('[data-section="chart-slope-ticks"]')
    ).toBeNull();
    expect(
      a.container.querySelector('[data-section="chart-slope-grid"]')
    ).toBeNull();
    cleanup();
    const b = render(<ChartSlope items={SAMPLE} showAxisTicks showGrid />);
    expect(
      b.container.querySelectorAll(
        '[data-section="chart-slope-tick"]'
      ).length
    ).toBeGreaterThan(0);
    expect(
      b.container.querySelector('[data-section="chart-slope-grid"]')
    ).not.toBeNull();
  });

  it('left + right labels render by default + suppression', () => {
    const a = render(<ChartSlope items={SAMPLE} />);
    expect(
      a.container.querySelectorAll(
        '[data-section="chart-slope-label"][data-side="left"]'
      ).length
    ).toBe(3);
    expect(
      a.container.querySelectorAll(
        '[data-section="chart-slope-label"][data-side="right"]'
      ).length
    ).toBe(3);
    cleanup();
    const b = render(
      <ChartSlope
        items={SAMPLE}
        showLeftLabels={false}
        showRightLabels={false}
      />
    );
    expect(
      b.container.querySelector('[data-section="chart-slope-label"]')
    ).toBeNull();
  });

  it('left + right values render by default + suppression', () => {
    const a = render(<ChartSlope items={SAMPLE} />);
    expect(
      a.container.querySelectorAll(
        '[data-section="chart-slope-value"][data-side="left"]'
      ).length
    ).toBe(3);
    expect(
      a.container.querySelectorAll(
        '[data-section="chart-slope-value"][data-side="right"]'
      ).length
    ).toBe(3);
    cleanup();
    const b = render(
      <ChartSlope
        items={SAMPLE}
        showLeftValues={false}
        showRightValues={false}
      />
    );
    expect(
      b.container.querySelector('[data-section="chart-slope-value"]')
    ).toBeNull();
  });

  it('formatLabel rewrites the row labels', () => {
    const { container } = render(
      <ChartSlope
        items={SAMPLE}
        formatLabel={(lbl, item) => `${item.direction}:${lbl}`}
      />
    );
    const labels = container.querySelectorAll(
      '[data-section="chart-slope-label"][data-side="left"]'
    );
    expect(labels[0]!.textContent).toBe('up:Alpha');
  });

  it('tooltip opens on item hover with label + before + after + delta', () => {
    const { container } = render(
      <ChartSlope items={SAMPLE} beforeLabel="Q1" afterLabel="Q2" />
    );
    const item = container.querySelector('[data-item-id="a"]') as HTMLElement;
    fireEvent.mouseEnter(item);
    expect(
      container.querySelector('[data-section="chart-slope-tooltip"]')
    ).not.toBeNull();
    expect(
      container.querySelector(
        '[data-section="chart-slope-tooltip-label"]'
      )?.textContent
    ).toBe('Alpha');
    expect(
      container.querySelector(
        '[data-section="chart-slope-tooltip-before"]'
      )?.textContent
    ).toContain('Q1');
    expect(
      container.querySelector(
        '[data-section="chart-slope-tooltip-after"]'
      )?.textContent
    ).toContain('Q2');
    expect(
      container.querySelector(
        '[data-section="chart-slope-tooltip-delta"]'
      )?.textContent
    ).toContain('up');
  });

  it('tooltip hides on mouseleave', () => {
    const { container } = render(<ChartSlope items={SAMPLE} />);
    const item = container.querySelector('[data-item-id="a"]') as HTMLElement;
    fireEvent.mouseEnter(item);
    expect(
      container.querySelector('[data-section="chart-slope-tooltip"]')
    ).not.toBeNull();
    fireEvent.mouseLeave(item);
    expect(
      container.querySelector('[data-section="chart-slope-tooltip"]')
    ).toBeNull();
  });

  it('showTooltip=false suppresses tooltip', () => {
    const { container } = render(
      <ChartSlope items={SAMPLE} showTooltip={false} />
    );
    fireEvent.mouseEnter(
      container.querySelector('[data-item-id="a"]')! as HTMLElement
    );
    expect(
      container.querySelector('[data-section="chart-slope-tooltip"]')
    ).toBeNull();
  });

  it('formatValue reaches tooltip + aria-label', () => {
    const { container } = render(
      <ChartSlope items={SAMPLE} formatValue={(v) => `${v}u`} />
    );
    const line = container.querySelector(
      '[data-section="chart-slope-line"]'
    ) as SVGLineElement;
    expect(line.getAttribute('aria-label')).toContain('u');
    fireEvent.mouseEnter(
      container.querySelector('[data-item-id="a"]')! as HTMLElement
    );
    expect(
      container.querySelector(
        '[data-section="chart-slope-tooltip-before"]'
      )?.textContent
    ).toContain('u');
  });

  it('onItemClick fires with item + layout payload', () => {
    const onItemClick = vi.fn();
    const { container } = render(
      <ChartSlope items={SAMPLE} onItemClick={onItemClick} />
    );
    fireEvent.click(
      container.querySelector('[data-item-id="b"]')! as HTMLElement
    );
    expect(onItemClick).toHaveBeenCalledTimes(1);
    const payload = onItemClick.mock.calls[0]![0];
    expect(payload.item.id).toBe('b');
    expect(payload.layout.direction).toBe('down');
  });

  it('data-hovered mirrors hover state', () => {
    const { container } = render(<ChartSlope items={SAMPLE} />);
    const item = container.querySelector('[data-item-id="a"]') as HTMLElement;
    expect(item.getAttribute('data-hovered')).toBe('false');
    fireEvent.mouseEnter(item);
    expect(item.getAttribute('data-hovered')).toBe('true');
    fireEvent.mouseLeave(item);
    expect(item.getAttribute('data-hovered')).toBe('false');
  });

  it('auto ARIA description renders by default', () => {
    const { container } = render(<ChartSlope items={SAMPLE} />);
    expect(
      container.querySelector('[data-section="chart-slope-aria-desc"]')
        ?.textContent
    ).toContain('3 items');
  });

  it('ariaDescription override beats auto', () => {
    const { container } = render(
      <ChartSlope items={SAMPLE} ariaDescription="Override" />
    );
    expect(
      container.querySelector('[data-section="chart-slope-aria-desc"]')
        ?.textContent
    ).toBe('Override');
  });

  it('SVG mirrors width / height / viewBox', () => {
    const { container } = render(
      <ChartSlope items={SAMPLE} width={400} height={200} />
    );
    const svg = container.querySelector(
      '[data-section="chart-slope-svg"]'
    ) as SVGElement;
    expect(svg.getAttribute('width')).toBe('400');
    expect(svg.getAttribute('height')).toBe('200');
    expect(svg.getAttribute('viewBox')).toBe('0 0 400 200');
  });

  it('empty input renders without crashing', () => {
    const { container } = render(<ChartSlope items={[]} />);
    expect(
      container.querySelectorAll('[data-section="chart-slope-item"]').length
    ).toBe(0);
    expect(
      container.querySelector('[data-section="chart-slope-aria-desc"]')
        ?.textContent
    ).toBe('No data');
  });

  it('forwards ref to root', () => {
    const ref = createRef<HTMLDivElement>();
    render(<ChartSlope items={SAMPLE} ref={ref} />);
    expect(ref.current?.dataset.section).toBe('chart-slope');
  });

  it('has stable displayName', () => {
    expect(ChartSlope.displayName).toBe('ChartSlope');
  });

  it('data-animate mirrors prop', () => {
    const { container } = render(
      <ChartSlope items={SAMPLE} animate={false} />
    );
    expect(
      container.querySelector('[data-section="chart-slope"]')!
        .getAttribute('data-animate')
    ).toBe('false');
  });

  it('controlled yMin / yMax override auto bounds', () => {
    const { container } = render(
      <ChartSlope items={SAMPLE} yMin={0} yMax={100} showAxisTicks />
    );
    const ticks = container.querySelectorAll(
      '[data-section="chart-slope-tick-label"]'
    );
    const texts = Array.from(ticks).map((n) => n.textContent);
    expect(texts).toContain('0');
    expect(texts).toContain('100');
  });
});
