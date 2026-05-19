import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { createRef } from 'react';
import {
  ChartFunnel,
  DEFAULT_CHART_FUNNEL_GRADIENT_FROM,
  DEFAULT_CHART_FUNNEL_GRADIENT_TO,
  DEFAULT_CHART_FUNNEL_HEIGHT,
  DEFAULT_CHART_FUNNEL_STAGE_GAP,
  DEFAULT_CHART_FUNNEL_WIDTH,
  buildFunnelPath,
  describeFunnelChart,
  getFunnelMax,
  getFunnelRatio,
  getStageConversion,
  getStageDropoff,
  getStageOfTop,
  interpolateColor,
} from './chart-funnel';
import type { ChartFunnelStage } from './chart-funnel';

const stages: ChartFunnelStage[] = [
  { id: 'visit', label: 'Visit', value: 1000 },
  { id: 'signup', label: 'Sign up', value: 600 },
  { id: 'trial', label: 'Trial', value: 250 },
  { id: 'paid', label: 'Paid', value: 80 },
];

describe('chart-funnel pure helpers', () => {
  describe('getFunnelMax', () => {
    it('returns the largest stage value', () => {
      expect(getFunnelMax(stages)).toBe(1000);
    });
    it('falls back to 1 when empty or non-finite', () => {
      expect(getFunnelMax([])).toBe(1);
      expect(
        getFunnelMax([
          { id: 'x', label: 'x', value: Number.NaN },
        ]),
      ).toBe(1);
    });
  });

  describe('getFunnelRatio', () => {
    it('maps value linearly into [0,1]', () => {
      expect(getFunnelRatio(500, 1000)).toBe(0.5);
    });
    it('clamps over-max to 1', () => {
      expect(getFunnelRatio(2000, 1000)).toBe(1);
    });
    it('returns 0 for non-finite / non-positive', () => {
      expect(getFunnelRatio(Number.NaN, 1000)).toBe(0);
      expect(getFunnelRatio(-10, 1000)).toBe(0);
      expect(getFunnelRatio(500, 0)).toBe(0);
      expect(getFunnelRatio(500, Number.NaN)).toBe(0);
    });
  });

  describe('getStageDropoff', () => {
    it('returns prev - curr when positive', () => {
      expect(getStageDropoff(1000, 600)).toBe(400);
    });
    it('returns 0 when prev is undefined (first stage)', () => {
      expect(getStageDropoff(undefined, 1000)).toBe(0);
    });
    it('returns 0 when curr exceeds prev', () => {
      expect(getStageDropoff(100, 200)).toBe(0);
    });
    it('returns 0 for non-finite / non-positive prev', () => {
      expect(getStageDropoff(0, 500)).toBe(0);
      expect(getStageDropoff(Number.NaN, 500)).toBe(0);
    });
    it('returns 0 for non-finite curr', () => {
      expect(getStageDropoff(1000, Number.NaN)).toBe(0);
    });
  });

  describe('getStageConversion', () => {
    it('returns 1 for the first stage', () => {
      expect(getStageConversion(undefined, 500)).toBe(1);
    });
    it('returns curr / prev for normal flow', () => {
      expect(getStageConversion(1000, 250)).toBe(0.25);
    });
    it('clamps over-1 to 1', () => {
      expect(getStageConversion(100, 200)).toBe(1);
    });
    it('returns 0 when either value is non-positive', () => {
      expect(getStageConversion(0, 100)).toBe(0);
      expect(getStageConversion(100, 0)).toBe(0);
      expect(getStageConversion(100, -5)).toBe(0);
    });
  });

  describe('getStageOfTop', () => {
    it('returns value / top in [0,1]', () => {
      expect(getStageOfTop(1000, 250)).toBe(0.25);
      expect(getStageOfTop(1000, 1000)).toBe(1);
    });
    it('returns 0 when top is non-positive or non-finite', () => {
      expect(getStageOfTop(0, 100)).toBe(0);
      expect(getStageOfTop(Number.NaN, 100)).toBe(0);
    });
    it('returns 0 when value is non-positive or non-finite', () => {
      expect(getStageOfTop(1000, 0)).toBe(0);
      expect(getStageOfTop(1000, Number.NaN)).toBe(0);
    });
    it('clamps over-top to 1', () => {
      expect(getStageOfTop(100, 200)).toBe(1);
    });
  });

  describe('interpolateColor', () => {
    it('returns the from colour at t=0', () => {
      expect(interpolateColor('#000000', '#ffffff', 0)).toBe(
        '#000000',
      );
    });
    it('returns the to colour at t=1', () => {
      expect(interpolateColor('#000000', '#ffffff', 1)).toBe(
        '#ffffff',
      );
    });
    it('interpolates mid-grey at t=0.5', () => {
      expect(
        interpolateColor('#000000', '#ffffff', 0.5),
      ).toBe('#808080');
    });
    it('expands #rgb shorthand', () => {
      expect(interpolateColor('#000', '#fff', 0)).toBe(
        '#000000',
      );
    });
    it('falls back to from on parse failure', () => {
      expect(interpolateColor('not-a-color', '#fff', 0.5)).toBe(
        'not-a-color',
      );
    });
    it('clamps t outside [0,1]', () => {
      expect(interpolateColor('#000', '#fff', -10)).toBe(
        '#000000',
      );
      expect(interpolateColor('#000', '#fff', 10)).toBe(
        '#ffffff',
      );
    });
  });

  describe('buildFunnelPath', () => {
    it('emits a closed quadrilateral path', () => {
      const path = buildFunnelPath(100, 60, 10, 30, 50);
      expect(path).toMatch(/^M /);
      expect(path).toMatch(/Z$/);
      expect((path.match(/L/g) || []).length).toBe(3);
    });
    it('clamps negative widths to zero', () => {
      const path = buildFunnelPath(-50, -50, 0, 10, 0);
      // both widths zero, so x-coords are all 0
      expect(path).toContain('0.00');
    });
  });

  describe('describeFunnelChart', () => {
    it('returns "No data" for empty stages', () => {
      expect(describeFunnelChart([])).toBe('No data');
    });
    it('summarises stage labels and values', () => {
      const text = describeFunnelChart(stages);
      expect(text).toContain('Funnel with 4 stages');
      expect(text).toContain('Visit');
      expect(text).toContain('1000');
    });
    it('uses formatValue + formatPercent when supplied', () => {
      const text = describeFunnelChart(
        stages,
        (v) => `${v}u`,
        (v) => `${(v * 100).toFixed(0)} pct`,
      );
      expect(text).toContain('1000u');
      expect(text).toContain('100 pct of top');
    });
  });

  it('exports default constants', () => {
    expect(DEFAULT_CHART_FUNNEL_WIDTH).toBeGreaterThan(0);
    expect(DEFAULT_CHART_FUNNEL_HEIGHT).toBeGreaterThan(0);
    expect(DEFAULT_CHART_FUNNEL_STAGE_GAP).toBeGreaterThanOrEqual(
      0,
    );
    expect(DEFAULT_CHART_FUNNEL_GRADIENT_FROM).toMatch(/^#/);
    expect(DEFAULT_CHART_FUNNEL_GRADIENT_TO).toMatch(/^#/);
  });
});

describe('<ChartFunnel />', () => {
  it('renders a region with role + aria-label', () => {
    render(<ChartFunnel stages={stages} />);
    const root = screen.getByRole('region', {
      name: 'Funnel chart',
    });
    expect(root).toBeInTheDocument();
    expect(root).toHaveAttribute(
      'data-section',
      'chart-funnel',
    );
    expect(root).toHaveAttribute('data-stage-count', '4');
  });

  it('renders a custom aria-label', () => {
    render(
      <ChartFunnel
        stages={stages}
        ariaLabel="Signup conversion"
      />,
    );
    expect(
      screen.getByRole('region', { name: 'Signup conversion' }),
    ).toBeInTheDocument();
  });

  it('renders one slice per stage', () => {
    const { container } = render(<ChartFunnel stages={stages} />);
    const slices = container.querySelectorAll(
      '[data-section="chart-funnel-slice"]',
    );
    expect(slices.length).toBe(stages.length);
  });

  it('renders labels by default', () => {
    const { container } = render(<ChartFunnel stages={stages} />);
    const labels = container.querySelectorAll(
      '[data-section="chart-funnel-label"]',
    );
    expect(labels.length).toBe(stages.length);
    expect(labels[0]?.textContent).toBe('Visit');
  });

  it('suppresses labels when showLabels=false', () => {
    const { container } = render(
      <ChartFunnel stages={stages} showLabels={false} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-funnel-label"]',
      ),
    ).toBeNull();
  });

  it('renders values by default', () => {
    const { container } = render(<ChartFunnel stages={stages} />);
    const values = container.querySelectorAll(
      '[data-section="chart-funnel-value"]',
    );
    expect(values.length).toBe(stages.length);
    expect(values[0]?.textContent).toBe('1000');
  });

  it('suppresses values when showValues=false', () => {
    const { container } = render(
      <ChartFunnel stages={stages} showValues={false} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-funnel-value"]',
      ),
    ).toBeNull();
  });

  it('renders drop-off labels for stages after the first', () => {
    const { container } = render(<ChartFunnel stages={stages} />);
    const drops = container.querySelectorAll(
      '[data-section="chart-funnel-dropoff"]',
    );
    expect(drops.length).toBe(3);
    expect(drops[0]?.getAttribute('data-dropoff')).toBe('400');
  });

  it('suppresses drop-off when showDropoff=false', () => {
    const { container } = render(
      <ChartFunnel stages={stages} showDropoff={false} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-funnel-dropoff"]',
      ),
    ).toBeNull();
  });

  it('honours custom stage colour', () => {
    const colored: ChartFunnelStage[] = [
      ...stages.map((s, i) =>
        i === 1
          ? { ...s, color: '#ff00aa' }
          : s,
      ),
    ];
    const { container } = render(
      <ChartFunnel stages={colored} />,
    );
    const groups = container.querySelectorAll(
      '[data-section="chart-funnel-stage"]',
    );
    expect(groups[1]?.getAttribute('data-stage-color')).toBe(
      '#ff00aa',
    );
  });

  it('uses the gradient palette for stages without colour', () => {
    const { container } = render(<ChartFunnel stages={stages} />);
    const groups = container.querySelectorAll(
      '[data-section="chart-funnel-stage"]',
    );
    expect(groups[0]?.getAttribute('data-stage-color')).toBe(
      DEFAULT_CHART_FUNNEL_GRADIENT_FROM,
    );
    expect(
      groups[groups.length - 1]?.getAttribute(
        'data-stage-color',
      ),
    ).toBe(DEFAULT_CHART_FUNNEL_GRADIENT_TO);
  });

  it('honours custom gradient endpoints', () => {
    const { container } = render(
      <ChartFunnel
        stages={stages}
        gradient={{ from: '#000000', to: '#ffffff' }}
      />,
    );
    const groups = container.querySelectorAll(
      '[data-section="chart-funnel-stage"]',
    );
    expect(groups[0]?.getAttribute('data-stage-color')).toBe(
      '#000000',
    );
    expect(
      groups[groups.length - 1]?.getAttribute(
        'data-stage-color',
      ),
    ).toBe('#ffffff');
  });

  it('shows tooltip on slice hover', () => {
    const { container } = render(<ChartFunnel stages={stages} />);
    const slice = container.querySelector(
      '[data-section="chart-funnel-slice"]',
    );
    fireEvent.mouseEnter(slice!);
    const tip = container.querySelector(
      '[data-section="chart-funnel-tooltip"]',
    );
    expect(tip).not.toBeNull();
    const label = container.querySelector(
      '[data-section="chart-funnel-tooltip-label"]',
    );
    expect(label?.textContent).toBe('Visit');
  });

  it('hides tooltip on mouse-leave', () => {
    const { container } = render(<ChartFunnel stages={stages} />);
    const slice = container.querySelector(
      '[data-section="chart-funnel-slice"]',
    );
    fireEvent.mouseEnter(slice!);
    fireEvent.mouseLeave(slice!);
    expect(
      container.querySelector(
        '[data-section="chart-funnel-tooltip"]',
      ),
    ).toBeNull();
  });

  it('renders conversion row in tooltip for stages > 0', () => {
    const { container } = render(<ChartFunnel stages={stages} />);
    const slices = container.querySelectorAll(
      '[data-section="chart-funnel-slice"]',
    );
    fireEvent.mouseEnter(slices[1]!);
    const conv = container.querySelector(
      '[data-section="chart-funnel-tooltip-conversion"]',
    );
    expect(conv).not.toBeNull();
    expect(conv?.textContent).toContain('60.0%');
  });

  it('omits conversion row for the first stage', () => {
    const { container } = render(<ChartFunnel stages={stages} />);
    const slice = container.querySelector(
      '[data-section="chart-funnel-slice"]',
    );
    fireEvent.mouseEnter(slice!);
    expect(
      container.querySelector(
        '[data-section="chart-funnel-tooltip-conversion"]',
      ),
    ).toBeNull();
  });

  it('uses formatValue + formatPercent in the tooltip', () => {
    const { container } = render(
      <ChartFunnel
        stages={stages}
        formatValue={(v) => `${v}u`}
        formatPercent={(v) => `${(v * 100).toFixed(0)}p`}
      />,
    );
    const slice = container.querySelector(
      '[data-section="chart-funnel-slice"]',
    );
    fireEvent.mouseEnter(slice!);
    const val = container.querySelector(
      '[data-section="chart-funnel-tooltip-value"]',
    );
    const ofTop = container.querySelector(
      '[data-section="chart-funnel-tooltip-of-top"]',
    );
    expect(val?.textContent).toBe('1000u');
    expect(ofTop?.textContent).toContain('100p of top');
  });

  it('suppresses tooltip when showTooltip=false', () => {
    const { container } = render(
      <ChartFunnel stages={stages} showTooltip={false} />,
    );
    const slice = container.querySelector(
      '[data-section="chart-funnel-slice"]',
    );
    fireEvent.mouseEnter(slice!);
    expect(
      container.querySelector(
        '[data-section="chart-funnel-tooltip"]',
      ),
    ).toBeNull();
  });

  it('invokes onStageClick with stage + index + dropoff + conversion + ofTop', () => {
    const onClick = vi.fn();
    const { container } = render(
      <ChartFunnel
        stages={stages}
        onStageClick={onClick}
      />,
    );
    const slices = container.querySelectorAll(
      '[data-section="chart-funnel-slice"]',
    );
    fireEvent.click(slices[2]!);
    expect(onClick).toHaveBeenCalledTimes(1);
    expect(onClick.mock.calls[0]?.[0]).toMatchObject({
      stage: stages[2],
      index: 2,
      dropoff: 350,
    });
    expect(
      onClick.mock.calls[0]?.[0]?.conversion,
    ).toBeCloseTo(250 / 600);
    expect(onClick.mock.calls[0]?.[0]?.ofTop).toBeCloseTo(
      0.25,
    );
  });

  it('does not bind onClick when onStageClick is missing', () => {
    const { container } = render(<ChartFunnel stages={stages} />);
    const slice = container.querySelector(
      '[data-section="chart-funnel-slice"]',
    ) as SVGElement & { style: CSSStyleDeclaration };
    expect(slice.style.cursor).toBe('default');
  });

  it('mirrors data-hovered on the hovered stage', () => {
    const { container } = render(<ChartFunnel stages={stages} />);
    const slices = container.querySelectorAll(
      '[data-section="chart-funnel-slice"]',
    );
    const groups = container.querySelectorAll(
      '[data-section="chart-funnel-stage"]',
    );
    fireEvent.mouseEnter(slices[2]!);
    expect(groups[2]?.getAttribute('data-hovered')).toBe('true');
    expect(groups[0]?.getAttribute('data-hovered')).toBe('false');
  });

  it('exposes role=graphics-symbol + aria-label per slice', () => {
    const { container } = render(<ChartFunnel stages={stages} />);
    const slice = container.querySelector(
      '[data-section="chart-funnel-slice"]',
    );
    expect(slice?.getAttribute('role')).toBe('graphics-symbol');
    expect(slice?.getAttribute('aria-label')).toContain(
      'Visit',
    );
  });

  it('renders the auto-generated ARIA description by default', () => {
    const { container } = render(<ChartFunnel stages={stages} />);
    const desc = container.querySelector(
      '[data-section="chart-funnel-aria-desc"]',
    );
    expect(desc?.textContent).toContain('Funnel with 4 stages');
  });

  it('honours ariaDescription override', () => {
    const { container } = render(
      <ChartFunnel
        stages={stages}
        ariaDescription="custom desc"
      />,
    );
    const desc = container.querySelector(
      '[data-section="chart-funnel-aria-desc"]',
    );
    expect(desc?.textContent).toBe('custom desc');
  });

  it('renders "No data" description when stages is empty', () => {
    const { container } = render(<ChartFunnel stages={[]} />);
    const desc = container.querySelector(
      '[data-section="chart-funnel-aria-desc"]',
    );
    expect(desc?.textContent).toBe('No data');
  });

  it('mirrors animate flag on the root', () => {
    const { container, rerender } = render(
      <ChartFunnel stages={stages} />,
    );
    expect(
      container
        .querySelector('[data-section="chart-funnel"]')
        ?.getAttribute('data-animate'),
    ).toBe('true');
    rerender(<ChartFunnel stages={stages} animate={false} />);
    expect(
      container
        .querySelector('[data-section="chart-funnel"]')
        ?.getAttribute('data-animate'),
    ).toBe('false');
  });

  it('mirrors size on the svg', () => {
    const { container } = render(
      <ChartFunnel
        stages={stages}
        width={600}
        height={400}
      />,
    );
    const svg = container.querySelector(
      '[data-section="chart-funnel-svg"]',
    );
    expect(svg?.getAttribute('width')).toBe('600');
    expect(svg?.getAttribute('height')).toBe('400');
    expect(svg?.getAttribute('viewBox')).toBe('0 0 600 400');
  });

  it('handles empty stages without crashing', () => {
    const { container } = render(<ChartFunnel stages={[]} />);
    expect(
      container.querySelector('[data-section="chart-funnel"]'),
    ).not.toBeNull();
    expect(
      container.querySelectorAll(
        '[data-section="chart-funnel-slice"]',
      ).length,
    ).toBe(0);
  });

  it('forwards ref to the root region', () => {
    const ref = createRef<HTMLDivElement>();
    render(<ChartFunnel ref={ref} stages={stages} />);
    expect(ref.current).not.toBeNull();
    expect(ref.current?.getAttribute('data-section')).toBe(
      'chart-funnel',
    );
  });

  it('has a stable displayName', () => {
    expect(ChartFunnel.displayName).toBe('ChartFunnel');
  });
});
