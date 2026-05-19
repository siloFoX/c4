import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  cleanup,
  fireEvent,
  render,
  screen,
} from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { createRef } from 'react';
import {
  ChartPie,
  DEFAULT_CHART_PIE_HEIGHT,
  DEFAULT_CHART_PIE_HOVER_EXPAND,
  DEFAULT_CHART_PIE_WIDTH,
  arcPath,
  computePieSlices,
  formatPiePercent,
  getPieTotal,
  polarToCartesian,
} from './chart-pie';
import type { ChartPieSlice } from './chart-pie';

afterEach(() => {
  cleanup();
});

const DATA: ChartPieSlice[] = [
  { id: 'a', label: 'A', value: 30 },
  { id: 'b', label: 'B', value: 50 },
  { id: 'c', label: 'C', value: 20 },
];

// ---------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------

describe('getPieTotal', () => {
  it('sums positive values', () => {
    expect(getPieTotal(DATA)).toBe(100);
  });
  it('skips non-finite + non-positive values', () => {
    expect(
      getPieTotal([
        { id: 'x', label: 'x', value: Number.NaN },
        { id: 'y', label: 'y', value: -10 },
        { id: 'z', label: 'z', value: 5 },
      ]),
    ).toBe(5);
  });
  it('empty -> 0', () => {
    expect(getPieTotal([])).toBe(0);
  });
});

describe('computePieSlices', () => {
  it('returns no slices for empty input', () => {
    const r = computePieSlices([]);
    expect(r.slices.length).toBe(0);
    expect(r.total).toBe(0);
  });
  it('returns no slices when total <= 0', () => {
    const r = computePieSlices([
      { id: 'x', label: 'x', value: 0 },
    ]);
    expect(r.slices.length).toBe(0);
  });
  it('percent sums to 100 across slices', () => {
    const r = computePieSlices(DATA);
    const sum = r.slices.reduce((acc, s) => acc + s.percent, 0);
    expect(sum).toBeCloseTo(100, 5);
  });
  it('angles cover exactly a full circle', () => {
    const r = computePieSlices(DATA, 0);
    expect(r.slices[0]?.startAngle).toBe(0);
    expect(r.slices[r.slices.length - 1]?.endAngle).toBeCloseTo(
      Math.PI * 2,
      5,
    );
  });
  it('start angle override pushes the sweep forward', () => {
    const r = computePieSlices(DATA, Math.PI);
    expect(r.slices[0]?.startAngle).toBe(Math.PI);
  });
  it('midAngle is the centre of each slice', () => {
    const r = computePieSlices(DATA, 0);
    const first = r.slices[0]!;
    expect(first.midAngle).toBeCloseTo(
      (first.startAngle + first.endAngle) / 2,
      5,
    );
  });
});

describe('polarToCartesian', () => {
  it('angle=0 maps to right of centre', () => {
    expect(polarToCartesian(100, 100, 10, 0)).toEqual({
      x: 110,
      y: 100,
    });
  });
  it('angle=PI/2 maps to below centre', () => {
    const p = polarToCartesian(100, 100, 10, Math.PI / 2);
    expect(p.x).toBeCloseTo(100, 5);
    expect(p.y).toBeCloseTo(110, 5);
  });
});

describe('arcPath', () => {
  it('returns empty for outerRadius <= 0', () => {
    expect(arcPath(0, 0, 0, 0, 0, Math.PI)).toBe('');
  });
  it('emits M / A commands for a partial pie slice', () => {
    const p = arcPath(50, 50, 0, 30, 0, Math.PI / 2);
    expect(p).toContain('M ');
    expect(p).toContain('A 30 30 ');
    expect(p).toContain('Z');
  });
  it('full annulus emits two A commands per ring', () => {
    const p = arcPath(50, 50, 10, 30, 0, Math.PI * 2);
    const matches = p.match(/A /g) ?? [];
    // 2 outer + 2 inner = 4 A commands
    expect(matches.length).toBe(4);
  });
  it('partial donut slice emits inner + outer A commands', () => {
    const p = arcPath(50, 50, 10, 30, 0, Math.PI / 2);
    const matches = p.match(/A /g) ?? [];
    expect(matches.length).toBe(2);
  });
});

describe('formatPiePercent', () => {
  it('default for whole numbers', () => {
    expect(formatPiePercent(50)).toBe('50%');
  });
  it('rounds high percents to 100%', () => {
    expect(formatPiePercent(99.97)).toBe('100%');
  });
  it('one decimal under 10%', () => {
    expect(formatPiePercent(5.5)).toBe('5.5%');
  });
  it('custom formatter wins', () => {
    expect(formatPiePercent(33, (p) => `${p}%-share`)).toBe(
      '33%-share',
    );
  });
  it('NaN -> 0%', () => {
    expect(formatPiePercent(Number.NaN)).toBe('0%');
  });
});

describe('Constants', () => {
  it('default width / height / hover expand', () => {
    expect(DEFAULT_CHART_PIE_WIDTH).toBe(320);
    expect(DEFAULT_CHART_PIE_HEIGHT).toBe(240);
    expect(DEFAULT_CHART_PIE_HOVER_EXPAND).toBe(6);
  });
});

// ---------------------------------------------------------------
// Component
// ---------------------------------------------------------------

describe('ChartPie component', () => {
  it('renders a region with default aria-label', () => {
    render(<ChartPie data={DATA} />);
    expect(
      screen.getByRole('region', { name: 'Pie chart' }),
    ).toBeInTheDocument();
  });

  it('honors custom ariaLabel', () => {
    render(<ChartPie data={DATA} ariaLabel="Revenue split" />);
    expect(
      screen.getByRole('region', { name: 'Revenue split' }),
    ).toBeInTheDocument();
  });

  it('renders one slice per series', () => {
    const { container } = render(<ChartPie data={DATA} />);
    expect(
      container.querySelectorAll(
        '[data-section="chart-pie-slice"]',
      ).length,
    ).toBe(3);
  });

  it('aria-describedby points at a hidden description region', () => {
    const { container } = render(<ChartPie data={DATA} />);
    const region = container.querySelector(
      '[data-section="chart-pie"]',
    );
    const describedBy = region?.getAttribute('aria-describedby');
    expect(describedBy).toBeTruthy();
    expect(
      container.querySelector(`#${describedBy}`),
    ).toBeInTheDocument();
  });

  it('default ARIA description lists every slice + percent', () => {
    const { container } = render(<ChartPie data={DATA} />);
    const desc = container.querySelector(
      '[data-section="chart-pie-aria-desc"]',
    );
    expect(desc?.textContent).toContain('A:');
    expect(desc?.textContent).toContain('B:');
    expect(desc?.textContent).toContain('C:');
  });

  it('ariaDescription override replaces default copy', () => {
    const { container } = render(
      <ChartPie data={DATA} ariaDescription="custom desc" />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-pie-aria-desc"]',
      )?.textContent,
    ).toBe('custom desc');
  });

  it('per-slice role=graphics-symbol + aria-label with percent', () => {
    const { container } = render(<ChartPie data={DATA} />);
    const slice = container.querySelector(
      '[data-section="chart-pie-slice"][data-slice-id="b"]',
    );
    expect(slice).toHaveAttribute('role', 'graphics-symbol');
    expect(slice?.getAttribute('aria-label')).toContain('B:');
    expect(slice?.getAttribute('aria-label')).toContain('50%');
  });

  it('default mode is pie (innerR=0)', () => {
    render(<ChartPie data={DATA} />);
    expect(screen.getByRole('region')).toHaveAttribute(
      'data-donut',
      'false',
    );
  });

  it('innerRadius > 0 flips to donut', () => {
    render(<ChartPie data={DATA} innerRadius={40} />);
    expect(screen.getByRole('region')).toHaveAttribute(
      'data-donut',
      'true',
    );
  });

  it('donut renders the total readout in the centre', () => {
    const { container } = render(
      <ChartPie data={DATA} innerRadius={40} />,
    );
    const total = container.querySelector(
      '[data-section="chart-pie-center-total"]',
    );
    expect(total?.textContent).toBe('100');
  });

  it('pie (innerR=0) hides the centre total', () => {
    const { container } = render(<ChartPie data={DATA} />);
    expect(
      container.querySelector(
        '[data-section="chart-pie-center-total"]',
      ),
    ).toBeNull();
  });

  it('showTotal=false hides the donut centre total', () => {
    const { container } = render(
      <ChartPie
        data={DATA}
        innerRadius={40}
        showTotal={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-pie-center-total"]',
      ),
    ).toBeNull();
  });

  it('totalLabel string renders below the total readout', () => {
    render(
      <ChartPie
        data={DATA}
        innerRadius={40}
        totalLabel="Total"
      />,
    );
    expect(screen.getByText('Total')).toBeInTheDocument();
  });

  it('formatValue formats the donut total', () => {
    render(
      <ChartPie
        data={DATA}
        innerRadius={40}
        formatValue={(n) => `$${n.toFixed(0)}k`}
      />,
    );
    expect(screen.getByText('$100k')).toBeInTheDocument();
  });

  it('showLegend=true (default) renders one row per slice', () => {
    const { container } = render(<ChartPie data={DATA} />);
    expect(
      container.querySelectorAll(
        '[data-section="chart-pie-legend-item"]',
      ).length,
    ).toBe(3);
  });

  it('showLegend=false hides the legend', () => {
    const { container } = render(
      <ChartPie data={DATA} showLegend={false} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-pie-legend"]',
      ),
    ).toBeNull();
  });

  it('legend percent text uses formatPercent override', () => {
    render(
      <ChartPie
        data={DATA}
        formatPercent={(p) => `${Math.round(p)}pt`}
      />,
    );
    expect(screen.getByText('50pt')).toBeInTheDocument();
  });

  it('legendFormat override replaces the default label+percent', () => {
    render(
      <ChartPie
        data={DATA}
        legendFormat={(s, p) => `${s.label} @ ${p.toFixed(0)}`}
      />,
    );
    expect(screen.getByText('A @ 30')).toBeInTheDocument();
  });

  it('legendPlacement=bottom reflects on data-placement', () => {
    const { container } = render(
      <ChartPie data={DATA} legendPlacement="bottom" />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-pie-legend"]',
      ),
    ).toHaveAttribute('data-placement', 'bottom');
  });

  it('percent labels render on slices >= 5%', () => {
    const { container } = render(
      <ChartPie data={DATA} showPercentLabels />,
    );
    expect(
      container.querySelectorAll(
        '[data-section="chart-pie-label"]',
      ).length,
    ).toBe(3);
  });

  it('percent labels omitted for slices < 5%', () => {
    const { container } = render(
      <ChartPie
        data={[
          { id: 'big', label: 'B', value: 99 },
          { id: 'tiny', label: 't', value: 1 },
        ]}
        showPercentLabels
      />,
    );
    expect(
      container.querySelectorAll(
        '[data-section="chart-pie-label"]',
      ).length,
    ).toBe(1);
  });

  it('hovering a slice flips data-hovered', () => {
    const { container } = render(<ChartPie data={DATA} />);
    const slice = container.querySelector(
      '[data-section="chart-pie-slice"][data-slice-id="b"]',
    ) as HTMLElement;
    fireEvent.mouseEnter(slice);
    expect(slice).toHaveAttribute('data-hovered', 'true');
    fireEvent.mouseLeave(slice);
    expect(slice).toHaveAttribute('data-hovered', 'false');
  });

  it('hovering expands the slice (path d uses larger radius)', () => {
    const { container } = render(<ChartPie data={DATA} />);
    const slice = container.querySelector(
      '[data-section="chart-pie-slice"][data-slice-id="b"]',
    ) as HTMLElement;
    const arc = slice.querySelector(
      '[data-section="chart-pie-arc"]',
    );
    const before = arc?.getAttribute('d') ?? '';
    fireEvent.mouseEnter(slice);
    const after = arc?.getAttribute('d') ?? '';
    expect(before).not.toBe(after);
  });

  it('onSliceClick fires with the slice', () => {
    const onSliceClick = vi.fn();
    const { container } = render(
      <ChartPie data={DATA} onSliceClick={onSliceClick} />,
    );
    const slice = container.querySelector(
      '[data-section="chart-pie-slice"][data-slice-id="c"]',
    ) as HTMLElement;
    fireEvent.click(slice);
    expect(onSliceClick).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'c' }),
    );
  });

  it('per-slice color override applies', () => {
    const { container } = render(
      <ChartPie
        data={[{ id: 'a', label: 'A', value: 1, color: '#abc' }]}
      />,
    );
    const arc = container.querySelector(
      '[data-section="chart-pie-arc"]',
    );
    expect(arc).toHaveAttribute('fill', '#abc');
  });

  it('empty data renders the empty state', () => {
    render(<ChartPie data={[]} emptyState="Nothing here" />);
    expect(screen.getByText('Nothing here')).toBeInTheDocument();
  });

  it('default empty state', () => {
    const { container } = render(<ChartPie data={[]} />);
    const empty = container.querySelector(
      '[data-section="chart-pie-empty"]',
    );
    expect(empty?.textContent).toBe('No data');
  });

  it('animate=false flips data-animate', () => {
    render(<ChartPie data={DATA} animate={false} />);
    expect(screen.getByRole('region')).toHaveAttribute(
      'data-animate',
      'false',
    );
  });

  it('data-slice-count mirrors data.length', () => {
    render(<ChartPie data={DATA} />);
    expect(screen.getByRole('region')).toHaveAttribute(
      'data-slice-count',
      '3',
    );
  });

  it('forwards ref to the root region', () => {
    const ref = createRef<HTMLDivElement>();
    render(<ChartPie ref={ref} data={DATA} />);
    expect(ref.current?.getAttribute('role')).toBe('region');
  });

  it('exposes a stable displayName', () => {
    expect(ChartPie.displayName).toBe('ChartPie');
  });

  it('svg viewBox respects width + height', () => {
    const { container } = render(
      <ChartPie data={DATA} width={300} height={200} />,
    );
    const svg = container.querySelector(
      '[data-section="chart-pie-svg"]',
    );
    expect(svg).toHaveAttribute('viewBox', '0 0 300 200');
  });
});
