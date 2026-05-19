import { afterEach, describe, it, expect, vi } from 'vitest';
import { createRef } from 'react';
import { render, fireEvent, cleanup } from '@testing-library/react';
import {
  ChartPictogram,
  buildPictogramIconPath,
  computePictogramLayout,
  describePictogramChart,
  getPictogramDefaultColor,
  getPictogramIconCount,
  DEFAULT_CHART_PICTOGRAM_WIDTH,
  DEFAULT_CHART_PICTOGRAM_HEIGHT,
  DEFAULT_CHART_PICTOGRAM_PADDING,
  DEFAULT_CHART_PICTOGRAM_ICON_SIZE,
  DEFAULT_CHART_PICTOGRAM_ICON_GAP,
  DEFAULT_CHART_PICTOGRAM_ROW_GAP,
  DEFAULT_CHART_PICTOGRAM_LABEL_WIDTH,
  DEFAULT_CHART_PICTOGRAM_UNIT_VALUE,
  DEFAULT_CHART_PICTOGRAM_ICON_SHAPE,
  DEFAULT_CHART_PICTOGRAM_EMPTY_OPACITY,
  DEFAULT_CHART_PICTOGRAM_PALETTE,
  type ChartPictogramRow,
} from './chart-pictogram';

afterEach(() => cleanup());

const SAMPLE: ChartPictogramRow[] = [
  { id: 'a', label: 'Alpha', value: 5 },
  { id: 'b', label: 'Beta', value: 8 },
  { id: 'c', label: 'Gamma', value: 3.5 },
];

describe('chart-pictogram constants', () => {
  it('exports the documented defaults', () => {
    expect(DEFAULT_CHART_PICTOGRAM_WIDTH).toBe(560);
    expect(DEFAULT_CHART_PICTOGRAM_HEIGHT).toBe(320);
    expect(DEFAULT_CHART_PICTOGRAM_PADDING).toBe(32);
    expect(DEFAULT_CHART_PICTOGRAM_ICON_SIZE).toBe(18);
    expect(DEFAULT_CHART_PICTOGRAM_ICON_GAP).toBe(4);
    expect(DEFAULT_CHART_PICTOGRAM_ROW_GAP).toBe(14);
    expect(DEFAULT_CHART_PICTOGRAM_LABEL_WIDTH).toBe(100);
    expect(DEFAULT_CHART_PICTOGRAM_UNIT_VALUE).toBe(1);
    expect(DEFAULT_CHART_PICTOGRAM_ICON_SHAPE).toBe('circle');
    expect(DEFAULT_CHART_PICTOGRAM_EMPTY_OPACITY).toBeCloseTo(0.18);
    expect(DEFAULT_CHART_PICTOGRAM_PALETTE.length).toBe(10);
  });
});

describe('getPictogramDefaultColor', () => {
  it('returns palette[index] for valid indices', () => {
    expect(getPictogramDefaultColor(0)).toBe(DEFAULT_CHART_PICTOGRAM_PALETTE[0]);
    expect(getPictogramDefaultColor(3)).toBe(DEFAULT_CHART_PICTOGRAM_PALETTE[3]);
  });
  it('wraps modulo palette length', () => {
    expect(
      getPictogramDefaultColor(DEFAULT_CHART_PICTOGRAM_PALETTE.length)
    ).toBe(DEFAULT_CHART_PICTOGRAM_PALETTE[0]);
  });
  it('falls back to color 0 for invalid input', () => {
    expect(getPictogramDefaultColor(Number.NaN)).toBe(
      DEFAULT_CHART_PICTOGRAM_PALETTE[0]
    );
    expect(getPictogramDefaultColor(-1)).toBe(
      DEFAULT_CHART_PICTOGRAM_PALETTE[0]
    );
  });
});

describe('getPictogramIconCount', () => {
  it('returns full + fractional counts', () => {
    expect(getPictogramIconCount(5, 1)).toEqual({
      full: 5,
      fractional: 0,
      total: 5,
    });
    const r = getPictogramIconCount(3.5, 1);
    expect(r.full).toBe(3);
    expect(r.fractional).toBeCloseTo(0.5);
    expect(r.total).toBe(4);
  });
  it('handles unitValue > 1', () => {
    const r = getPictogramIconCount(25, 10);
    expect(r.full).toBe(2);
    expect(r.fractional).toBeCloseTo(0.5);
    expect(r.total).toBe(3);
  });
  it('non-positive / non-finite -> zero', () => {
    expect(getPictogramIconCount(0, 1)).toEqual({
      full: 0,
      fractional: 0,
      total: 0,
    });
    expect(getPictogramIconCount(-5, 1)).toEqual({
      full: 0,
      fractional: 0,
      total: 0,
    });
    expect(getPictogramIconCount(Number.NaN, 1)).toEqual({
      full: 0,
      fractional: 0,
      total: 0,
    });
  });
  it('non-positive unitValue -> zero', () => {
    expect(getPictogramIconCount(5, 0)).toEqual({
      full: 0,
      fractional: 0,
      total: 0,
    });
    expect(getPictogramIconCount(5, -1)).toEqual({
      full: 0,
      fractional: 0,
      total: 0,
    });
  });
});

describe('buildPictogramIconPath', () => {
  it('returns empty string for non-positive size', () => {
    expect(buildPictogramIconPath('circle', 0)).toBe('');
    expect(buildPictogramIconPath('square', -5)).toBe('');
  });
  it('circle path starts with M and ends with Z', () => {
    const p = buildPictogramIconPath('circle', 20);
    expect(p.startsWith('M')).toBe(true);
    expect(p.endsWith('Z')).toBe(true);
    expect(p).toContain('A');
  });
  it('square path uses L commands', () => {
    const p = buildPictogramIconPath('square', 20);
    expect(p).toContain('L');
    expect(p).not.toContain('A');
  });
  it('rounded path uses arc corners', () => {
    const p = buildPictogramIconPath('rounded', 20);
    expect(p).toContain('A');
    expect(p).toContain('L');
  });
  it('triangle path has 3 vertices', () => {
    const p = buildPictogramIconPath('triangle', 20);
    expect(p.split('L').length - 1 + p.split('M').length - 1).toBe(3);
  });
  it('hexagon path has 6 vertices', () => {
    const p = buildPictogramIconPath('hexagon', 20);
    const moves = (p.match(/M/g) || []).length;
    const lines = (p.match(/L/g) || []).length;
    expect(moves + lines).toBe(6);
  });
  it('star path emits 10 segments', () => {
    const p = buildPictogramIconPath('star', 20);
    const moves = (p.match(/M/g) || []).length;
    const lines = (p.match(/L/g) || []).length;
    expect(moves + lines).toBe(10);
  });
  it('person path includes head, body, arms, legs', () => {
    const p = buildPictogramIconPath('person', 20);
    expect(p.length).toBeGreaterThan(80);
    expect(p).toContain('A');
  });
  it('custom path string is returned verbatim', () => {
    const custom = 'M 0 0 L 10 10 Z';
    expect(buildPictogramIconPath(custom, 20)).toBe(custom);
  });
});

describe('computePictogramLayout', () => {
  const innerW = 480;
  const padX = 32;
  const padY = 32;

  it('returns one row entry per input row', () => {
    const out = computePictogramLayout({
      rows: SAMPLE,
      unitValue: 1,
      iconSize: 18,
      iconGap: 4,
      rowGap: 14,
      labelWidth: 100,
      innerW,
      padX,
      padY,
      defaultIcon: 'circle',
    });
    expect(out).toHaveLength(3);
  });

  it('icons per row counts full icons + 1 fractional', () => {
    const out = computePictogramLayout({
      rows: SAMPLE,
      unitValue: 1,
      iconSize: 18,
      iconGap: 4,
      rowGap: 14,
      labelWidth: 100,
      innerW,
      padX,
      padY,
      defaultIcon: 'circle',
    });
    const alpha = out.find((r) => r.id === 'a')!;
    expect(alpha.fullIcons).toBe(5);
    expect(alpha.fractionalIcon).toBe(0);
    expect(alpha.totalIcons).toBe(5);
    const gamma = out.find((r) => r.id === 'c')!;
    expect(gamma.fullIcons).toBe(3);
    expect(gamma.fractionalIcon).toBeCloseTo(0.5);
    expect(gamma.totalIcons).toBe(4);
    expect(gamma.icons[3]!.fill).toBeCloseTo(0.5);
  });

  it('full icons all have fill=1', () => {
    const out = computePictogramLayout({
      rows: SAMPLE,
      unitValue: 1,
      iconSize: 18,
      iconGap: 4,
      rowGap: 14,
      labelWidth: 100,
      innerW,
      padX,
      padY,
      defaultIcon: 'circle',
    });
    const beta = out.find((r) => r.id === 'b')!;
    for (let i = 0; i < beta.fullIcons; i++) {
      expect(beta.icons[i]!.fill).toBe(1);
    }
  });

  it('icons wrap across visual rows when too many for one row', () => {
    const out = computePictogramLayout({
      rows: [{ id: 'a', label: 'A', value: 30 }],
      unitValue: 1,
      iconSize: 30,
      iconGap: 4,
      rowGap: 10,
      labelWidth: 100,
      innerW: 240,
      padX,
      padY,
      defaultIcon: 'circle',
    });
    // usableW = 240 - 100 = 140; iconsPerRow = floor((140 + 4) / 34) = 4
    expect(out[0]!.iconsPerRow).toBe(4);
    expect(out[0]!.visualRows).toBeGreaterThan(1);
  });

  it('icons stay aligned in grid order', () => {
    const out = computePictogramLayout({
      rows: SAMPLE,
      unitValue: 1,
      iconSize: 18,
      iconGap: 4,
      rowGap: 14,
      labelWidth: 100,
      innerW,
      padX,
      padY,
      defaultIcon: 'circle',
    });
    for (const row of out) {
      for (let i = 1; i < row.icons.length; i++) {
        const prev = row.icons[i - 1]!;
        const cur = row.icons[i]!;
        // either same row (x increases) or new row (y > prev.y)
        if (cur.y === prev.y) {
          expect(cur.x).toBeGreaterThan(prev.x);
        } else {
          expect(cur.y).toBeGreaterThan(prev.y);
        }
      }
    }
  });

  it('row Y increases for subsequent rows', () => {
    const out = computePictogramLayout({
      rows: SAMPLE,
      unitValue: 1,
      iconSize: 18,
      iconGap: 4,
      rowGap: 14,
      labelWidth: 100,
      innerW,
      padX,
      padY,
      defaultIcon: 'circle',
    });
    for (let i = 1; i < out.length; i++) {
      expect(out[i]!.rowY).toBeGreaterThan(out[i - 1]!.rowY);
    }
  });

  it('per-row color override beats palette', () => {
    const out = computePictogramLayout({
      rows: [{ id: 'a', label: 'A', value: 5, color: '#abcdef' }],
      unitValue: 1,
      iconSize: 18,
      iconGap: 4,
      rowGap: 14,
      labelWidth: 100,
      innerW,
      padX,
      padY,
      defaultIcon: 'circle',
    });
    expect(out[0]!.color).toBe('#abcdef');
  });

  it('per-row icon override beats default', () => {
    const out = computePictogramLayout({
      rows: [{ id: 'a', label: 'A', value: 5, icon: 'star' }],
      unitValue: 1,
      iconSize: 18,
      iconGap: 4,
      rowGap: 14,
      labelWidth: 100,
      innerW,
      padX,
      padY,
      defaultIcon: 'circle',
    });
    expect(out[0]!.icon).toBe('star');
  });

  it('non-positive value -> 0 icons but still records the row', () => {
    const out = computePictogramLayout({
      rows: [{ id: 'a', label: 'A', value: 0 }],
      unitValue: 1,
      iconSize: 18,
      iconGap: 4,
      rowGap: 14,
      labelWidth: 100,
      innerW,
      padX,
      padY,
      defaultIcon: 'circle',
    });
    expect(out[0]!.totalIcons).toBe(0);
    expect(out[0]!.icons).toHaveLength(0);
  });

  it('returns [] for non-positive innerW or empty rows', () => {
    expect(
      computePictogramLayout({
        rows: SAMPLE,
        unitValue: 1,
        iconSize: 18,
        iconGap: 4,
        rowGap: 14,
        labelWidth: 100,
        innerW: 0,
        padX,
        padY,
        defaultIcon: 'circle',
      })
    ).toEqual([]);
    expect(
      computePictogramLayout({
        rows: [],
        unitValue: 1,
        iconSize: 18,
        iconGap: 4,
        rowGap: 14,
        labelWidth: 100,
        innerW,
        padX,
        padY,
        defaultIcon: 'circle',
      })
    ).toEqual([]);
  });
});

describe('describePictogramChart', () => {
  it('returns "No data" for empty / all-zero', () => {
    expect(describePictogramChart([], 1)).toBe('No data');
    expect(
      describePictogramChart([{ id: 'a', label: 'A', value: 0 }], 1)
    ).toBe('No data');
  });
  it('includes row count + total + icon count + unit', () => {
    const d = describePictogramChart(SAMPLE, 1);
    expect(d).toContain('3 rows');
    expect(d).toContain('total 16.5');
    expect(d).toContain('icons');
    expect(d).toContain('each icon = 1');
  });
  it('honors formatValue', () => {
    const d = describePictogramChart(SAMPLE, 1, (v) => `$${v}`);
    expect(d).toContain('$1');
  });
});

describe('<ChartPictogram> component', () => {
  it('renders region + custom aria-label', () => {
    const { getByRole } = render(
      <ChartPictogram rows={SAMPLE} ariaLabel="Test pictogram" />
    );
    expect(getByRole('region', { name: 'Test pictogram' })).toBeTruthy();
  });

  it('renders one row per input', () => {
    const { container } = render(<ChartPictogram rows={SAMPLE} />);
    expect(
      container.querySelectorAll(
        '[data-section="chart-pictogram-row"]'
      ).length
    ).toBe(3);
  });

  it('row data attrs mirror value / icon count / fractional / color', () => {
    const { container } = render(<ChartPictogram rows={SAMPLE} />);
    const gamma = container.querySelector(
      '[data-row-id="c"]'
    ) as HTMLElement;
    expect(gamma.getAttribute('data-row-index')).toBe('2');
    expect(gamma.getAttribute('data-row-value')).toBe('3.5');
    expect(gamma.getAttribute('data-row-icon-count')).toBe('4');
    expect(gamma.getAttribute('data-row-full-icons')).toBe('3');
    expect(Number(gamma.getAttribute('data-row-fractional-icon'))).toBeCloseTo(0.5);
    expect(gamma.getAttribute('data-row-color')).toBeTruthy();
    expect(gamma.getAttribute('data-row-visual-rows')).toBeTruthy();
  });

  it('per-row icon group is role=graphics-symbol + tabIndex=0 + aria-label', () => {
    const { container } = render(<ChartPictogram rows={SAMPLE} />);
    const group = container.querySelector(
      '[data-section="chart-pictogram-icons"]'
    ) as SVGGElement;
    expect(group.getAttribute('role')).toBe('graphics-symbol');
    expect(group.getAttribute('tabindex')).toBe('0');
    expect(group.getAttribute('aria-label')).toContain('Alpha');
    expect(group.getAttribute('aria-label')).toContain('5');
    expect(group.getAttribute('aria-label')).toContain('icons');
  });

  it('root mirrors row + icon + unit + total counts + animate', () => {
    const { container } = render(<ChartPictogram rows={SAMPLE} unitValue={2} />);
    const root = container.querySelector('[data-section="chart-pictogram"]');
    expect(root?.getAttribute('data-row-count')).toBe('3');
    expect(root?.getAttribute('data-visible-row-count')).toBe('3');
    expect(root?.getAttribute('data-unit-value')).toBe('2');
    expect(root?.getAttribute('data-total-value')).toBe('16.5');
    expect(root?.getAttribute('data-animate')).toBe('true');
    expect(root?.getAttribute('data-default-icon')).toBe('circle');
  });

  it('unitValue scales the icon count', () => {
    const { container } = render(
      <ChartPictogram rows={[{ id: 'a', label: 'A', value: 100 }]} unitValue={10} />
    );
    const row = container.querySelector(
      '[data-row-id="a"]'
    ) as HTMLElement;
    expect(row.getAttribute('data-row-icon-count')).toBe('10');
  });

  it('full + fractional icon counts in DOM match layout', () => {
    const { container } = render(<ChartPictogram rows={SAMPLE} />);
    const gammaIcons = container.querySelectorAll(
      '[data-row-id="c"] [data-section="chart-pictogram-icon"]'
    );
    expect(gammaIcons.length).toBe(4);
    const lastFill = Number(gammaIcons[3]!.getAttribute('data-icon-fill'));
    expect(lastFill).toBeCloseTo(0.5);
  });

  it('fractional icons render with a clipPath', () => {
    const { container } = render(<ChartPictogram rows={SAMPLE} />);
    const clipPaths = container.querySelectorAll('clipPath');
    expect(clipPaths.length).toBeGreaterThan(0);
  });

  it('row labels render by default + suppression', () => {
    const a = render(<ChartPictogram rows={SAMPLE} />);
    expect(
      a.container.querySelectorAll(
        '[data-section="chart-pictogram-row-label"]'
      ).length
    ).toBe(3);
    cleanup();
    const b = render(<ChartPictogram rows={SAMPLE} showLabels={false} />);
    expect(
      b.container.querySelector(
        '[data-section="chart-pictogram-row-label"]'
      )
    ).toBeNull();
  });

  it('per-row count badge renders by default', () => {
    const { container } = render(<ChartPictogram rows={SAMPLE} />);
    expect(
      container.querySelectorAll(
        '[data-section="chart-pictogram-count"]'
      ).length
    ).toBe(3);
  });

  it('showCounts=false suppresses count badge', () => {
    const { container } = render(
      <ChartPictogram rows={SAMPLE} showCounts={false} />
    );
    expect(
      container.querySelector('[data-section="chart-pictogram-count"]')
    ).toBeNull();
  });

  it('formatCount rewrites count badge', () => {
    const { container } = render(
      <ChartPictogram
        rows={SAMPLE}
        formatCount={(count, value) => `${count}#${value}`}
      />
    );
    const first = container.querySelector(
      '[data-section="chart-pictogram-count"]'
    );
    expect(first?.textContent).toBe('5#5');
  });

  it('tooltip opens on row hover with label + value + icons', () => {
    const { container } = render(<ChartPictogram rows={SAMPLE} />);
    const row = container.querySelector('[data-row-id="b"]') as HTMLElement;
    fireEvent.mouseEnter(row);
    expect(
      container.querySelector('[data-section="chart-pictogram-tooltip"]')
    ).not.toBeNull();
    expect(
      container.querySelector(
        '[data-section="chart-pictogram-tooltip-label"]'
      )?.textContent
    ).toBe('Beta');
    expect(
      container.querySelector(
        '[data-section="chart-pictogram-tooltip-value"]'
      )?.textContent
    ).toBe('8');
    expect(
      container.querySelector(
        '[data-section="chart-pictogram-tooltip-icons"]'
      )?.textContent
    ).toContain('icons:');
  });

  it('tooltip hides on mouseleave', () => {
    const { container } = render(<ChartPictogram rows={SAMPLE} />);
    const row = container.querySelector('[data-row-id="a"]') as HTMLElement;
    fireEvent.mouseEnter(row);
    expect(
      container.querySelector('[data-section="chart-pictogram-tooltip"]')
    ).not.toBeNull();
    fireEvent.mouseLeave(row);
    expect(
      container.querySelector('[data-section="chart-pictogram-tooltip"]')
    ).toBeNull();
  });

  it('showTooltip=false suppresses tooltip', () => {
    const { container } = render(
      <ChartPictogram rows={SAMPLE} showTooltip={false} />
    );
    fireEvent.mouseEnter(
      container.querySelector('[data-row-id="a"]')! as HTMLElement
    );
    expect(
      container.querySelector('[data-section="chart-pictogram-tooltip"]')
    ).toBeNull();
  });

  it('formatValue reaches tooltip + aria-label', () => {
    const { container } = render(
      <ChartPictogram rows={SAMPLE} formatValue={(v) => `${v}u`} />
    );
    const group = container.querySelector(
      '[data-section="chart-pictogram-icons"]'
    ) as SVGGElement;
    expect(group.getAttribute('aria-label')).toContain('u');
    fireEvent.mouseEnter(
      container.querySelector('[data-row-id="a"]')! as HTMLElement
    );
    expect(
      container.querySelector(
        '[data-section="chart-pictogram-tooltip-value"]'
      )?.textContent
    ).toBe('5u');
  });

  it('onRowClick fires with row + layout payload', () => {
    const onRowClick = vi.fn();
    const { container } = render(
      <ChartPictogram rows={SAMPLE} onRowClick={onRowClick} />
    );
    fireEvent.click(
      container.querySelector('[data-row-id="b"]')! as HTMLElement
    );
    expect(onRowClick).toHaveBeenCalledTimes(1);
    expect(onRowClick.mock.calls[0]![0].row.id).toBe('b');
    expect(onRowClick.mock.calls[0]![0].layout.id).toBe('b');
  });

  it('data-hovered mirrors hover state', () => {
    const { container } = render(<ChartPictogram rows={SAMPLE} />);
    const row = container.querySelector('[data-row-id="a"]') as HTMLElement;
    expect(row.getAttribute('data-hovered')).toBe('false');
    fireEvent.mouseEnter(row);
    expect(row.getAttribute('data-hovered')).toBe('true');
    fireEvent.mouseLeave(row);
    expect(row.getAttribute('data-hovered')).toBe('false');
  });

  it('defaultIcon prop changes the rendered icon shape (visible via data attr)', () => {
    const { container } = render(
      <ChartPictogram rows={SAMPLE} defaultIcon="star" />
    );
    const root = container.querySelector('[data-section="chart-pictogram"]');
    expect(root?.getAttribute('data-default-icon')).toBe('star');
  });

  it('per-row icon override leaves other rows on default', () => {
    const rows: ChartPictogramRow[] = [
      { id: 'a', label: 'A', value: 2, icon: 'square' },
      { id: 'b', label: 'B', value: 2 },
    ];
    const { container } = render(<ChartPictogram rows={rows} />);
    expect(
      container.querySelectorAll(
        '[data-row-id="a"] [data-section="chart-pictogram-icon"]'
      ).length
    ).toBe(2);
    expect(
      container.querySelectorAll(
        '[data-row-id="b"] [data-section="chart-pictogram-icon"]'
      ).length
    ).toBe(2);
  });

  it('legend renders when showLegend=true', () => {
    const { container } = render(<ChartPictogram rows={SAMPLE} showLegend />);
    expect(
      container.querySelectorAll(
        '[data-section="chart-pictogram-legend-item"]'
      ).length
    ).toBe(3);
  });

  it('legend hidden by default', () => {
    const { container } = render(<ChartPictogram rows={SAMPLE} />);
    expect(
      container.querySelector('[data-section="chart-pictogram-legend"]')
    ).toBeNull();
  });

  it('auto ARIA description renders by default', () => {
    const { container } = render(<ChartPictogram rows={SAMPLE} />);
    expect(
      container.querySelector(
        '[data-section="chart-pictogram-aria-desc"]'
      )?.textContent
    ).toContain('3 rows');
  });

  it('ariaDescription override beats auto', () => {
    const { container } = render(
      <ChartPictogram rows={SAMPLE} ariaDescription="Override" />
    );
    expect(
      container.querySelector(
        '[data-section="chart-pictogram-aria-desc"]'
      )?.textContent
    ).toBe('Override');
  });

  it('SVG mirrors width / height / viewBox', () => {
    const { container } = render(
      <ChartPictogram rows={SAMPLE} width={400} height={200} />
    );
    const svg = container.querySelector(
      '[data-section="chart-pictogram-svg"]'
    ) as SVGElement;
    expect(svg.getAttribute('width')).toBe('400');
    expect(svg.getAttribute('height')).toBe('200');
    expect(svg.getAttribute('viewBox')).toBe('0 0 400 200');
  });

  it('empty input renders without crashing', () => {
    const { container } = render(<ChartPictogram rows={[]} />);
    expect(
      container.querySelectorAll(
        '[data-section="chart-pictogram-row"]'
      ).length
    ).toBe(0);
    expect(
      container.querySelector(
        '[data-section="chart-pictogram-aria-desc"]'
      )?.textContent
    ).toBe('No data');
  });

  it('forwards ref to root', () => {
    const ref = createRef<HTMLDivElement>();
    render(<ChartPictogram rows={SAMPLE} ref={ref} />);
    expect(ref.current?.dataset.section).toBe('chart-pictogram');
  });

  it('has stable displayName', () => {
    expect(ChartPictogram.displayName).toBe('ChartPictogram');
  });

  it('data-animate mirrors prop', () => {
    const { container } = render(
      <ChartPictogram rows={SAMPLE} animate={false} />
    );
    expect(
      container.querySelector('[data-section="chart-pictogram"]')!
        .getAttribute('data-animate')
    ).toBe('false');
  });
});
