import { afterEach, describe, it, expect, vi } from 'vitest';
import { createRef } from 'react';
import { render, fireEvent, cleanup } from '@testing-library/react';
import {
  ChartFunnelArea,
  computeFunnelAreaLayout,
  describeFunnelAreaChart,
  getFunnelAreaConversionRate,
  getFunnelAreaDefaultColor,
  getFunnelAreaTotalValue,
  DEFAULT_CHART_FUNNEL_AREA_WIDTH,
  DEFAULT_CHART_FUNNEL_AREA_HEIGHT,
  DEFAULT_CHART_FUNNEL_AREA_PADDING,
  DEFAULT_CHART_FUNNEL_AREA_NECK_RATIO,
  DEFAULT_CHART_FUNNEL_AREA_STAGE_GAP,
  DEFAULT_CHART_FUNNEL_AREA_LABEL_MIN_HEIGHT,
  DEFAULT_CHART_FUNNEL_AREA_FILL_OPACITY,
  DEFAULT_CHART_FUNNEL_AREA_PALETTE,
  type ChartFunnelAreaStage,
} from './chart-funnel-area';

afterEach(() => cleanup());

const SAMPLE: ChartFunnelAreaStage[] = [
  { id: 'a', label: 'Visit', value: 1000 },
  { id: 'b', label: 'Signup', value: 500 },
  { id: 'c', label: 'Active', value: 250 },
  { id: 'd', label: 'Paid', value: 100 },
];

describe('chart-funnel-area constants', () => {
  it('exports the documented defaults', () => {
    expect(DEFAULT_CHART_FUNNEL_AREA_WIDTH).toBe(480);
    expect(DEFAULT_CHART_FUNNEL_AREA_HEIGHT).toBe(360);
    expect(DEFAULT_CHART_FUNNEL_AREA_PADDING).toBe(32);
    expect(DEFAULT_CHART_FUNNEL_AREA_NECK_RATIO).toBeCloseTo(0.3);
    expect(DEFAULT_CHART_FUNNEL_AREA_STAGE_GAP).toBe(2);
    expect(DEFAULT_CHART_FUNNEL_AREA_LABEL_MIN_HEIGHT).toBe(18);
    expect(DEFAULT_CHART_FUNNEL_AREA_FILL_OPACITY).toBeCloseTo(0.85);
    expect(DEFAULT_CHART_FUNNEL_AREA_PALETTE.length).toBe(10);
  });
});

describe('getFunnelAreaDefaultColor', () => {
  it('returns palette[index] for valid indices', () => {
    expect(getFunnelAreaDefaultColor(0)).toBe(DEFAULT_CHART_FUNNEL_AREA_PALETTE[0]);
    expect(getFunnelAreaDefaultColor(3)).toBe(DEFAULT_CHART_FUNNEL_AREA_PALETTE[3]);
  });
  it('wraps modulo palette length', () => {
    expect(
      getFunnelAreaDefaultColor(DEFAULT_CHART_FUNNEL_AREA_PALETTE.length)
    ).toBe(DEFAULT_CHART_FUNNEL_AREA_PALETTE[0]);
  });
  it('falls back to color 0 for invalid input', () => {
    expect(getFunnelAreaDefaultColor(Number.NaN)).toBe(
      DEFAULT_CHART_FUNNEL_AREA_PALETTE[0]
    );
    expect(getFunnelAreaDefaultColor(-1)).toBe(
      DEFAULT_CHART_FUNNEL_AREA_PALETTE[0]
    );
  });
});

describe('getFunnelAreaTotalValue', () => {
  it('sums positive finite values', () => {
    expect(getFunnelAreaTotalValue(SAMPLE)).toBe(1850);
  });
  it('skips non-finite + non-positive', () => {
    expect(
      getFunnelAreaTotalValue([
        { id: 'a', label: 'A', value: 5 },
        { id: 'b', label: 'B', value: -1 },
        { id: 'c', label: 'C', value: Number.NaN },
      ])
    ).toBe(5);
  });
  it('empty -> 0', () => {
    expect(getFunnelAreaTotalValue([])).toBe(0);
  });
});

describe('getFunnelAreaConversionRate', () => {
  it('returns current / previous', () => {
    expect(getFunnelAreaConversionRate(50, 100)).toBeCloseTo(0.5);
    expect(getFunnelAreaConversionRate(100, 100)).toBeCloseTo(1);
  });
  it('returns 0 when previous is 0', () => {
    expect(getFunnelAreaConversionRate(50, 0)).toBe(0);
  });
  it('returns 0 for non-finite input', () => {
    expect(getFunnelAreaConversionRate(Number.NaN, 100)).toBe(0);
    expect(getFunnelAreaConversionRate(50, Number.NaN)).toBe(0);
  });
});

describe('computeFunnelAreaLayout', () => {
  const innerW = 400;
  const innerH = 300;

  it('returns one stage per input', () => {
    const out = computeFunnelAreaLayout({
      stages: SAMPLE,
      innerW,
      innerH,
      padX: 0,
      padY: 0,
      neckRatio: 0.3,
      stageGap: 0,
    });
    expect(out).toHaveLength(4);
  });

  it('stage heights are proportional to value share', () => {
    const out = computeFunnelAreaLayout({
      stages: SAMPLE,
      innerW,
      innerH,
      padX: 0,
      padY: 0,
      neckRatio: 0.3,
      stageGap: 0,
    });
    const total = 1850;
    for (const s of out) {
      const expectedHeight = (s.value / total) * innerH;
      expect(s.height).toBeCloseTo(expectedHeight, 1);
    }
  });

  it('stage heights sum to innerH when stageGap=0', () => {
    const out = computeFunnelAreaLayout({
      stages: SAMPLE,
      innerW,
      innerH,
      padX: 0,
      padY: 0,
      neckRatio: 0.3,
      stageGap: 0,
    });
    let sum = 0;
    for (const s of out) sum += s.height;
    expect(sum).toBeCloseTo(innerH);
  });

  it('top width = innerW; bottom width = innerW * neckRatio', () => {
    const out = computeFunnelAreaLayout({
      stages: SAMPLE,
      innerW,
      innerH,
      padX: 0,
      padY: 0,
      neckRatio: 0.3,
      stageGap: 0,
    });
    expect(out[0]!.topWidth).toBeCloseTo(innerW);
    expect(out[out.length - 1]!.bottomWidth).toBeCloseTo(innerW * 0.3);
  });

  it('stage widths taper monotonically (top >= bottom at every stage)', () => {
    const out = computeFunnelAreaLayout({
      stages: SAMPLE,
      innerW,
      innerH,
      padX: 0,
      padY: 0,
      neckRatio: 0.3,
      stageGap: 0,
    });
    for (const s of out) {
      expect(s.topWidth).toBeGreaterThanOrEqual(s.bottomWidth - 1e-6);
    }
  });

  it('previous bottom width equals next top width (no gap)', () => {
    const out = computeFunnelAreaLayout({
      stages: SAMPLE,
      innerW,
      innerH,
      padX: 0,
      padY: 0,
      neckRatio: 0.3,
      stageGap: 0,
    });
    for (let i = 0; i < out.length - 1; i++) {
      expect(out[i]!.bottomWidth).toBeCloseTo(out[i + 1]!.topWidth);
    }
  });

  it('conversion rate is value(i) / value(i-1) for i > 0', () => {
    const out = computeFunnelAreaLayout({
      stages: SAMPLE,
      innerW,
      innerH,
      padX: 0,
      padY: 0,
      neckRatio: 0.3,
      stageGap: 0,
    });
    expect(out[0]!.conversionRate).toBeCloseTo(1);
    expect(out[1]!.conversionRate).toBeCloseTo(0.5);
    expect(out[2]!.conversionRate).toBeCloseTo(0.5);
    expect(out[3]!.conversionRate).toBeCloseTo(0.4);
  });

  it('drop rate is 1 - conversion for i > 0; 0 for first', () => {
    const out = computeFunnelAreaLayout({
      stages: SAMPLE,
      innerW,
      innerH,
      padX: 0,
      padY: 0,
      neckRatio: 0.3,
      stageGap: 0,
    });
    expect(out[0]!.dropRate).toBe(0);
    expect(out[1]!.dropRate).toBeCloseTo(0.5);
    expect(out[2]!.dropRate).toBeCloseTo(0.5);
    expect(out[3]!.dropRate).toBeCloseTo(0.6);
  });

  it('path string starts with M and closes with Z', () => {
    const out = computeFunnelAreaLayout({
      stages: SAMPLE,
      innerW,
      innerH,
      padX: 0,
      padY: 0,
      neckRatio: 0.3,
      stageGap: 0,
    });
    for (const s of out) {
      expect(s.path.startsWith('M')).toBe(true);
      expect(s.path.endsWith('Z')).toBe(true);
    }
  });

  it('cumulativeShare ends at 1', () => {
    const out = computeFunnelAreaLayout({
      stages: SAMPLE,
      innerW,
      innerH,
      padX: 0,
      padY: 0,
      neckRatio: 0.3,
      stageGap: 0,
    });
    expect(out[out.length - 1]!.cumulativeShare).toBeCloseTo(1);
  });

  it('clamps neckRatio outside [0, 1]', () => {
    const wide = computeFunnelAreaLayout({
      stages: SAMPLE,
      innerW,
      innerH,
      padX: 0,
      padY: 0,
      neckRatio: 2,
      stageGap: 0,
    });
    expect(wide[wide.length - 1]!.bottomWidth).toBeCloseTo(innerW);
    const flat = computeFunnelAreaLayout({
      stages: SAMPLE,
      innerW,
      innerH,
      padX: 0,
      padY: 0,
      neckRatio: -1,
      stageGap: 0,
    });
    expect(flat[flat.length - 1]!.bottomWidth).toBeCloseTo(0);
  });

  it('stageGap reduces total visible height', () => {
    const out = computeFunnelAreaLayout({
      stages: SAMPLE,
      innerW,
      innerH,
      padX: 0,
      padY: 0,
      neckRatio: 0.3,
      stageGap: 6,
    });
    let sum = 0;
    for (const s of out) sum += s.height;
    expect(sum).toBeCloseTo(innerH - 6 * 3);
  });

  it('drops non-positive / non-finite values cleanly without crashing', () => {
    const out = computeFunnelAreaLayout({
      stages: [
        { id: 'a', label: 'A', value: 100 },
        { id: 'b', label: 'B', value: 0 },
        { id: 'c', label: 'C', value: 50 },
      ],
      innerW,
      innerH,
      padX: 0,
      padY: 0,
      neckRatio: 0.3,
      stageGap: 0,
    });
    expect(out).toHaveLength(3);
    expect(out[1]!.height).toBe(0);
  });

  it('returns [] for non-positive inner dims', () => {
    const out = computeFunnelAreaLayout({
      stages: SAMPLE,
      innerW: 0,
      innerH,
      padX: 0,
      padY: 0,
      neckRatio: 0.3,
      stageGap: 0,
    });
    expect(out).toEqual([]);
  });

  it('returns [] for empty stages', () => {
    const out = computeFunnelAreaLayout({
      stages: [],
      innerW,
      innerH,
      padX: 0,
      padY: 0,
      neckRatio: 0.3,
      stageGap: 0,
    });
    expect(out).toEqual([]);
  });

  it('returns [] when total value is 0', () => {
    const out = computeFunnelAreaLayout({
      stages: [{ id: 'a', label: 'A', value: 0 }],
      innerW,
      innerH,
      padX: 0,
      padY: 0,
      neckRatio: 0.3,
      stageGap: 0,
    });
    expect(out).toEqual([]);
  });

  it('per-stage color override beats palette', () => {
    const out = computeFunnelAreaLayout({
      stages: [{ id: 'a', label: 'A', value: 1, color: '#abcdef' }],
      innerW,
      innerH,
      padX: 0,
      padY: 0,
      neckRatio: 0.3,
      stageGap: 0,
    });
    expect(out[0]!.color).toBe('#abcdef');
  });
});

describe('describeFunnelAreaChart', () => {
  it('returns "No data" for empty / zero total', () => {
    expect(describeFunnelAreaChart([])).toBe('No data');
    expect(
      describeFunnelAreaChart([{ id: 'a', label: 'A', value: 0 }])
    ).toBe('No data');
  });
  it('includes stage count + total + top/end + conversion', () => {
    const d = describeFunnelAreaChart(SAMPLE);
    expect(d).toContain('4 stages');
    expect(d).toContain('total 1850');
    expect(d).toContain('Top stage Visit');
    expect(d).toContain('end stage Paid');
    expect(d).toContain('10% conversion');
  });
  it('honors formatValue', () => {
    const d = describeFunnelAreaChart(SAMPLE, (v) => `$${v}`);
    expect(d).toContain('$100');
    expect(d).toContain('$1000');
  });
});

describe('<ChartFunnelArea> component', () => {
  it('renders region + custom aria-label', () => {
    const { getByRole } = render(
      <ChartFunnelArea stages={SAMPLE} ariaLabel="Test funnel" />
    );
    expect(getByRole('region', { name: 'Test funnel' })).toBeTruthy();
  });

  it('renders one stage per input', () => {
    const { container } = render(<ChartFunnelArea stages={SAMPLE} />);
    expect(
      container.querySelectorAll(
        '[data-section="chart-funnel-area-stage"]'
      ).length
    ).toBe(4);
  });

  it('stage data attrs mirror value / share / color / conversion / drop', () => {
    const { container } = render(<ChartFunnelArea stages={SAMPLE} />);
    const second = container.querySelector(
      '[data-stage-id="b"]'
    ) as HTMLElement;
    expect(second.getAttribute('data-stage-index')).toBe('1');
    expect(second.getAttribute('data-stage-value')).toBe('500');
    expect(second.getAttribute('data-stage-share')).toBeTruthy();
    expect(second.getAttribute('data-stage-color')).toBeTruthy();
    expect(second.getAttribute('data-stage-conversion')).toBe('0.5');
    expect(second.getAttribute('data-stage-drop')).toBe('0.5');
  });

  it('path is role=graphics-symbol + tabIndex=0 + aria-label', () => {
    const { container } = render(<ChartFunnelArea stages={SAMPLE} />);
    const path = container.querySelector(
      '[data-section="chart-funnel-area-path"]'
    ) as SVGPathElement;
    expect(path.getAttribute('role')).toBe('graphics-symbol');
    expect(path.getAttribute('tabindex')).toBe('0');
    expect(path.getAttribute('aria-label')).toContain('Visit');
    expect(path.getAttribute('aria-label')).toContain('of total');
  });

  it('root mirrors counts + total + neck-ratio + animate', () => {
    const { container } = render(<ChartFunnelArea stages={SAMPLE} />);
    const root = container.querySelector('[data-section="chart-funnel-area"]');
    expect(root?.getAttribute('data-stage-count')).toBe('4');
    expect(root?.getAttribute('data-visible-count')).toBe('4');
    expect(root?.getAttribute('data-total')).toBe('1850');
    expect(root?.getAttribute('data-neck-ratio')).toBe('0.3');
    expect(root?.getAttribute('data-animate')).toBe('true');
  });

  it('labels + values render by default for stages tall enough', () => {
    const { container } = render(
      <ChartFunnelArea stages={SAMPLE} labelMinHeight={0} />
    );
    const labels = container.querySelectorAll(
      '[data-section="chart-funnel-area-label"]'
    );
    const values = container.querySelectorAll(
      '[data-section="chart-funnel-area-value"]'
    );
    expect(labels.length).toBeGreaterThan(0);
    expect(values.length).toBeGreaterThan(0);
  });

  it('showLabels=false suppresses labels', () => {
    const { container } = render(
      <ChartFunnelArea
        stages={SAMPLE}
        showLabels={false}
        labelMinHeight={0}
      />
    );
    expect(
      container.querySelector('[data-section="chart-funnel-area-label"]')
    ).toBeNull();
  });

  it('showValues=false suppresses value text', () => {
    const { container } = render(
      <ChartFunnelArea
        stages={SAMPLE}
        showValues={false}
        labelMinHeight={0}
      />
    );
    expect(
      container.querySelector('[data-section="chart-funnel-area-value"]')
    ).toBeNull();
  });

  it('labelMinHeight above all heights hides labels + values', () => {
    const { container } = render(
      <ChartFunnelArea stages={SAMPLE} labelMinHeight={1_000_000} />
    );
    expect(
      container.querySelector('[data-section="chart-funnel-area-label"]')
    ).toBeNull();
    expect(
      container.querySelector('[data-section="chart-funnel-area-value"]')
    ).toBeNull();
  });

  it('showConversionRates renders a conversion label per stage i > 0', () => {
    const { container } = render(
      <ChartFunnelArea stages={SAMPLE} showConversionRates />
    );
    const labels = container.querySelectorAll(
      '[data-section="chart-funnel-area-conversion"]'
    );
    expect(labels.length).toBe(3);
    expect(labels[0]!.textContent).toBe('50%');
  });

  it('tooltip opens on stage hover with label + value + share + conversion', () => {
    const { container } = render(<ChartFunnelArea stages={SAMPLE} />);
    const second = container.querySelector(
      '[data-stage-id="b"]'
    ) as HTMLElement;
    fireEvent.mouseEnter(second);
    expect(
      container.querySelector('[data-section="chart-funnel-area-tooltip"]')
    ).not.toBeNull();
    expect(
      container.querySelector(
        '[data-section="chart-funnel-area-tooltip-label"]'
      )?.textContent
    ).toBe('Signup');
    expect(
      container.querySelector(
        '[data-section="chart-funnel-area-tooltip-value"]'
      )?.textContent
    ).toBe('500');
    expect(
      container.querySelector(
        '[data-section="chart-funnel-area-tooltip-share"]'
      )?.textContent
    ).toContain('27%');
    expect(
      container.querySelector(
        '[data-section="chart-funnel-area-tooltip-conversion"]'
      )?.textContent
    ).toContain('50%');
  });

  it('tooltip for first stage omits the conversion row', () => {
    const { container } = render(<ChartFunnelArea stages={SAMPLE} />);
    fireEvent.mouseEnter(
      container.querySelector('[data-stage-id="a"]')! as HTMLElement
    );
    expect(
      container.querySelector(
        '[data-section="chart-funnel-area-tooltip-conversion"]'
      )
    ).toBeNull();
  });

  it('tooltip hides on mouseleave', () => {
    const { container } = render(<ChartFunnelArea stages={SAMPLE} />);
    const second = container.querySelector(
      '[data-stage-id="b"]'
    ) as HTMLElement;
    fireEvent.mouseEnter(second);
    expect(
      container.querySelector('[data-section="chart-funnel-area-tooltip"]')
    ).not.toBeNull();
    fireEvent.mouseLeave(second);
    expect(
      container.querySelector('[data-section="chart-funnel-area-tooltip"]')
    ).toBeNull();
  });

  it('showTooltip=false suppresses tooltip', () => {
    const { container } = render(
      <ChartFunnelArea stages={SAMPLE} showTooltip={false} />
    );
    fireEvent.mouseEnter(
      container.querySelector('[data-stage-id="a"]')! as HTMLElement
    );
    expect(
      container.querySelector('[data-section="chart-funnel-area-tooltip"]')
    ).toBeNull();
  });

  it('formatValue reaches tooltip + aria-label', () => {
    const { container } = render(
      <ChartFunnelArea
        stages={SAMPLE}
        formatValue={(v) => `${v}u`}
      />
    );
    const path = container.querySelector(
      '[data-section="chart-funnel-area-path"]'
    ) as SVGPathElement;
    expect(path.getAttribute('aria-label')).toContain('u');
    fireEvent.mouseEnter(
      container.querySelector('[data-stage-id="a"]')! as HTMLElement
    );
    expect(
      container.querySelector(
        '[data-section="chart-funnel-area-tooltip-value"]'
      )?.textContent
    ).toBe('1000u');
  });

  it('formatPercent reaches tooltip share', () => {
    const { container } = render(
      <ChartFunnelArea
        stages={SAMPLE}
        formatPercent={(p) => `${(p * 100).toFixed(1)}pct`}
      />
    );
    fireEvent.mouseEnter(
      container.querySelector('[data-stage-id="a"]')! as HTMLElement
    );
    expect(
      container.querySelector(
        '[data-section="chart-funnel-area-tooltip-share"]'
      )?.textContent
    ).toContain('pct');
  });

  it('onStageClick fires with stage + layout payload', () => {
    const onStageClick = vi.fn();
    const { container } = render(
      <ChartFunnelArea stages={SAMPLE} onStageClick={onStageClick} />
    );
    fireEvent.click(
      container.querySelector('[data-stage-id="c"]')! as HTMLElement
    );
    expect(onStageClick).toHaveBeenCalledTimes(1);
    expect(onStageClick.mock.calls[0]![0].stage.id).toBe('c');
    expect(onStageClick.mock.calls[0]![0].layout.id).toBe('c');
  });

  it('data-hovered mirrors hover state', () => {
    const { container } = render(<ChartFunnelArea stages={SAMPLE} />);
    const stage = container.querySelector('[data-stage-id="a"]') as HTMLElement;
    expect(stage.getAttribute('data-hovered')).toBe('false');
    fireEvent.mouseEnter(stage);
    expect(stage.getAttribute('data-hovered')).toBe('true');
    fireEvent.mouseLeave(stage);
    expect(stage.getAttribute('data-hovered')).toBe('false');
  });

  it('legend renders when showLegend=true', () => {
    const { container } = render(<ChartFunnelArea stages={SAMPLE} showLegend />);
    expect(
      container.querySelectorAll(
        '[data-section="chart-funnel-area-legend-item"]'
      ).length
    ).toBe(SAMPLE.length);
  });

  it('legend hidden by default', () => {
    const { container } = render(<ChartFunnelArea stages={SAMPLE} />);
    expect(
      container.querySelector('[data-section="chart-funnel-area-legend"]')
    ).toBeNull();
  });

  it('auto ARIA description renders by default', () => {
    const { container } = render(<ChartFunnelArea stages={SAMPLE} />);
    expect(
      container.querySelector(
        '[data-section="chart-funnel-area-aria-desc"]'
      )?.textContent
    ).toContain('4 stages');
  });

  it('ariaDescription override beats auto', () => {
    const { container } = render(
      <ChartFunnelArea stages={SAMPLE} ariaDescription="Override" />
    );
    expect(
      container.querySelector(
        '[data-section="chart-funnel-area-aria-desc"]'
      )?.textContent
    ).toBe('Override');
  });

  it('SVG mirrors width / height / viewBox', () => {
    const { container } = render(
      <ChartFunnelArea stages={SAMPLE} width={400} height={200} />
    );
    const svg = container.querySelector(
      '[data-section="chart-funnel-area-svg"]'
    ) as SVGElement;
    expect(svg.getAttribute('width')).toBe('400');
    expect(svg.getAttribute('height')).toBe('200');
    expect(svg.getAttribute('viewBox')).toBe('0 0 400 200');
  });

  it('empty input renders without crashing', () => {
    const { container } = render(<ChartFunnelArea stages={[]} />);
    expect(
      container.querySelectorAll(
        '[data-section="chart-funnel-area-stage"]'
      ).length
    ).toBe(0);
    expect(
      container.querySelector(
        '[data-section="chart-funnel-area-aria-desc"]'
      )?.textContent
    ).toBe('No data');
  });

  it('forwards ref to root', () => {
    const ref = createRef<HTMLDivElement>();
    render(<ChartFunnelArea stages={SAMPLE} ref={ref} />);
    expect(ref.current?.dataset.section).toBe('chart-funnel-area');
  });

  it('has stable displayName', () => {
    expect(ChartFunnelArea.displayName).toBe('ChartFunnelArea');
  });

  it('data-animate mirrors prop', () => {
    const { container } = render(
      <ChartFunnelArea stages={SAMPLE} animate={false} />
    );
    expect(
      container.querySelector('[data-section="chart-funnel-area"]')!
        .getAttribute('data-animate')
    ).toBe('false');
  });
});
