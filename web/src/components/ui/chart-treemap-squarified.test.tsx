import { afterEach, describe, it, expect, vi } from 'vitest';
import { createRef } from 'react';
import { render, fireEvent, cleanup } from '@testing-library/react';
import {
  ChartTreemapSquarified,
  computeTreemapSquarifiedLayout,
  describeTreemapSquarifiedChart,
  getTreemapSquarifiedDefaultColor,
  getTreemapSquarifiedTotal,
  sortTreemapSquarifiedDesc,
  DEFAULT_CHART_TREEMAP_SQUARIFIED_WIDTH,
  DEFAULT_CHART_TREEMAP_SQUARIFIED_HEIGHT,
  DEFAULT_CHART_TREEMAP_SQUARIFIED_PADDING,
  DEFAULT_CHART_TREEMAP_SQUARIFIED_CELL_GAP,
  DEFAULT_CHART_TREEMAP_SQUARIFIED_LABEL_MIN_AREA,
  DEFAULT_CHART_TREEMAP_SQUARIFIED_FILL_OPACITY,
  DEFAULT_CHART_TREEMAP_SQUARIFIED_PALETTE,
  type ChartTreemapSquarifiedItem,
} from './chart-treemap-squarified';

afterEach(() => cleanup());

const SAMPLE: ChartTreemapSquarifiedItem[] = [
  { id: 'a', label: 'Alpha', value: 6 },
  { id: 'b', label: 'Beta', value: 6 },
  { id: 'c', label: 'Gamma', value: 4 },
  { id: 'd', label: 'Delta', value: 3 },
  { id: 'e', label: 'Epsilon', value: 2 },
  { id: 'f', label: 'Zeta', value: 2 },
  { id: 'g', label: 'Eta', value: 1 },
];

describe('chart-treemap-squarified constants', () => {
  it('exports the documented defaults', () => {
    expect(DEFAULT_CHART_TREEMAP_SQUARIFIED_WIDTH).toBe(560);
    expect(DEFAULT_CHART_TREEMAP_SQUARIFIED_HEIGHT).toBe(360);
    expect(DEFAULT_CHART_TREEMAP_SQUARIFIED_PADDING).toBe(24);
    expect(DEFAULT_CHART_TREEMAP_SQUARIFIED_CELL_GAP).toBe(2);
    expect(DEFAULT_CHART_TREEMAP_SQUARIFIED_LABEL_MIN_AREA).toBe(360);
    expect(DEFAULT_CHART_TREEMAP_SQUARIFIED_FILL_OPACITY).toBeCloseTo(0.85);
    expect(DEFAULT_CHART_TREEMAP_SQUARIFIED_PALETTE.length).toBe(10);
  });
});

describe('getTreemapSquarifiedDefaultColor', () => {
  it('returns palette[index] for valid indices', () => {
    expect(getTreemapSquarifiedDefaultColor(0)).toBe(
      DEFAULT_CHART_TREEMAP_SQUARIFIED_PALETTE[0]
    );
    expect(getTreemapSquarifiedDefaultColor(3)).toBe(
      DEFAULT_CHART_TREEMAP_SQUARIFIED_PALETTE[3]
    );
  });
  it('wraps modulo palette length', () => {
    expect(
      getTreemapSquarifiedDefaultColor(DEFAULT_CHART_TREEMAP_SQUARIFIED_PALETTE.length)
    ).toBe(DEFAULT_CHART_TREEMAP_SQUARIFIED_PALETTE[0]);
  });
  it('falls back to color 0 for invalid input', () => {
    expect(getTreemapSquarifiedDefaultColor(Number.NaN)).toBe(
      DEFAULT_CHART_TREEMAP_SQUARIFIED_PALETTE[0]
    );
    expect(getTreemapSquarifiedDefaultColor(-1)).toBe(
      DEFAULT_CHART_TREEMAP_SQUARIFIED_PALETTE[0]
    );
  });
});

describe('sortTreemapSquarifiedDesc', () => {
  it('sorts by value descending', () => {
    const r = sortTreemapSquarifiedDesc(SAMPLE);
    for (let i = 0; i < r.length - 1; i++) {
      expect(r[i]!.item.value).toBeGreaterThanOrEqual(r[i + 1]!.item.value);
    }
  });
  it('drops non-positive / non-finite values', () => {
    const items: ChartTreemapSquarifiedItem[] = [
      { id: 'a', label: 'A', value: 5 },
      { id: 'b', label: 'B', value: 0 },
      { id: 'c', label: 'C', value: -1 },
      { id: 'd', label: 'D', value: Number.NaN },
      { id: 'e', label: 'E', value: 3 },
    ];
    const r = sortTreemapSquarifiedDesc(items);
    expect(r.map((x) => x.item.id)).toEqual(['a', 'e']);
  });
  it('preserves original index', () => {
    const r = sortTreemapSquarifiedDesc(SAMPLE);
    for (const entry of r) {
      expect(SAMPLE[entry.originalIndex]!.id).toBe(entry.item.id);
    }
  });
});

describe('getTreemapSquarifiedTotal', () => {
  it('sums positive finite values', () => {
    expect(getTreemapSquarifiedTotal(SAMPLE)).toBe(6 + 6 + 4 + 3 + 2 + 2 + 1);
  });
  it('skips non-positive / non-finite values', () => {
    expect(
      getTreemapSquarifiedTotal([
        { id: 'a', label: 'A', value: 5 },
        { id: 'b', label: 'B', value: -1 },
        { id: 'c', label: 'C', value: Number.NaN },
      ])
    ).toBe(5);
  });
});

describe('computeTreemapSquarifiedLayout', () => {
  const innerW = 400;
  const innerH = 300;

  it('returns one cell per positive item', () => {
    const cells = computeTreemapSquarifiedLayout({
      items: SAMPLE,
      innerW,
      innerH,
      padX: 0,
      padY: 0,
      cellGap: 0,
    });
    expect(cells).toHaveLength(SAMPLE.length);
  });

  it('cells preserve original index for callbacks', () => {
    const cells = computeTreemapSquarifiedLayout({
      items: SAMPLE,
      innerW,
      innerH,
      padX: 0,
      padY: 0,
      cellGap: 0,
    });
    for (const cell of cells) {
      expect(SAMPLE[cell.index]!.id).toBe(cell.id);
    }
  });

  it('drops non-positive items', () => {
    const items: ChartTreemapSquarifiedItem[] = [
      { id: 'a', label: 'A', value: 5 },
      { id: 'b', label: 'B', value: 0 },
      { id: 'c', label: 'C', value: 3 },
    ];
    const cells = computeTreemapSquarifiedLayout({
      items,
      innerW,
      innerH,
      padX: 0,
      padY: 0,
      cellGap: 0,
    });
    expect(cells).toHaveLength(2);
    expect(cells.map((c) => c.id).sort()).toEqual(['a', 'c']);
  });

  it('total cell area equals innerW * innerH (when cellGap=0)', () => {
    const cells = computeTreemapSquarifiedLayout({
      items: SAMPLE,
      innerW,
      innerH,
      padX: 0,
      padY: 0,
      cellGap: 0,
    });
    let area = 0;
    for (const cell of cells) area += cell.width * cell.height;
    expect(area).toBeCloseTo(innerW * innerH, 0);
  });

  it('cells stay inside the canvas bounds', () => {
    const cells = computeTreemapSquarifiedLayout({
      items: SAMPLE,
      innerW,
      innerH,
      padX: 30,
      padY: 30,
      cellGap: 0,
    });
    for (const cell of cells) {
      expect(cell.x).toBeGreaterThanOrEqual(30 - 1e-6);
      expect(cell.y).toBeGreaterThanOrEqual(30 - 1e-6);
      expect(cell.x + cell.width).toBeLessThanOrEqual(30 + innerW + 1e-6);
      expect(cell.y + cell.height).toBeLessThanOrEqual(30 + innerH + 1e-6);
    }
  });

  it('larger cells render before smaller cells when iterating in placement order', () => {
    const cells = computeTreemapSquarifiedLayout({
      items: SAMPLE,
      innerW,
      innerH,
      padX: 0,
      padY: 0,
      cellGap: 0,
    });
    // Squarified algorithm places largest first. Find largest cell area.
    const a = cells.find((c) => c.id === 'a')!;
    const g = cells.find((c) => c.id === 'g')!;
    expect(a.width * a.height).toBeGreaterThan(g.width * g.height);
  });

  it('cell area is roughly proportional to value', () => {
    const cells = computeTreemapSquarifiedLayout({
      items: SAMPLE,
      innerW,
      innerH,
      padX: 0,
      padY: 0,
      cellGap: 0,
    });
    const totalValue = getTreemapSquarifiedTotal(SAMPLE);
    const totalArea = innerW * innerH;
    for (const cell of cells) {
      const expectedArea = (cell.value / totalValue) * totalArea;
      const cellArea = cell.width * cell.height;
      expect(cellArea).toBeCloseTo(expectedArea, 0);
    }
  });

  it('cellGap reduces total visible area but keeps cells inside bounds', () => {
    const cells = computeTreemapSquarifiedLayout({
      items: SAMPLE,
      innerW,
      innerH,
      padX: 0,
      padY: 0,
      cellGap: 4,
    });
    let area = 0;
    for (const cell of cells) area += cell.width * cell.height;
    expect(area).toBeLessThan(innerW * innerH);
    expect(area).toBeGreaterThan(innerW * innerH * 0.85);
  });

  it('squarified layout keeps worst aspect ratio reasonable', () => {
    const cells = computeTreemapSquarifiedLayout({
      items: SAMPLE,
      innerW,
      innerH,
      padX: 0,
      padY: 0,
      cellGap: 0,
    });
    let worst = 0;
    for (const cell of cells) {
      if (cell.aspectRatio > worst) worst = cell.aspectRatio;
    }
    // squarified should outperform naive slice (which gives huge ARs)
    expect(worst).toBeLessThan(8);
  });

  it('returns [] when innerW / innerH <= 0', () => {
    expect(
      computeTreemapSquarifiedLayout({
        items: SAMPLE,
        innerW: 0,
        innerH: 200,
        padX: 0,
        padY: 0,
        cellGap: 0,
      })
    ).toEqual([]);
    expect(
      computeTreemapSquarifiedLayout({
        items: SAMPLE,
        innerW: 200,
        innerH: 0,
        padX: 0,
        padY: 0,
        cellGap: 0,
      })
    ).toEqual([]);
  });

  it('returns [] for empty items', () => {
    expect(
      computeTreemapSquarifiedLayout({
        items: [],
        innerW,
        innerH,
        padX: 0,
        padY: 0,
        cellGap: 0,
      })
    ).toEqual([]);
  });

  it('returns [] when total value is 0', () => {
    const items: ChartTreemapSquarifiedItem[] = [
      { id: 'a', label: 'A', value: 0 },
      { id: 'b', label: 'B', value: -1 },
    ];
    expect(
      computeTreemapSquarifiedLayout({
        items,
        innerW,
        innerH,
        padX: 0,
        padY: 0,
        cellGap: 0,
      })
    ).toEqual([]);
  });

  it('per-item color override beats palette', () => {
    const items: ChartTreemapSquarifiedItem[] = [
      { id: 'a', label: 'A', value: 5, color: '#abcdef' },
    ];
    const cells = computeTreemapSquarifiedLayout({
      items,
      innerW,
      innerH,
      padX: 0,
      padY: 0,
      cellGap: 0,
    });
    expect(cells[0]!.color).toBe('#abcdef');
  });
});

describe('describeTreemapSquarifiedChart', () => {
  it('returns "No data" for empty / all-zero', () => {
    expect(describeTreemapSquarifiedChart([])).toBe('No data');
    expect(
      describeTreemapSquarifiedChart([
        { id: 'a', label: 'A', value: 0 },
      ])
    ).toBe('No data');
  });
  it('includes count + total + largest cell', () => {
    const d = describeTreemapSquarifiedChart(SAMPLE);
    expect(d).toContain('Squarified treemap with');
    expect(d).toContain('7 cells');
    expect(d).toContain('total 24');
    expect(d).toContain('Largest cell');
  });
});

describe('<ChartTreemapSquarified> component', () => {
  it('renders region + custom aria-label', () => {
    const { getByRole } = render(
      <ChartTreemapSquarified items={SAMPLE} ariaLabel="Test treemap" />
    );
    expect(getByRole('region', { name: 'Test treemap' })).toBeTruthy();
  });

  it('renders one cell per positive item', () => {
    const { container } = render(<ChartTreemapSquarified items={SAMPLE} />);
    expect(
      container.querySelectorAll(
        '[data-section="chart-treemap-squarified-cell"]'
      ).length
    ).toBe(SAMPLE.length);
  });

  it('cell data attrs mirror id / value / share / aspect-ratio / color', () => {
    const { container } = render(<ChartTreemapSquarified items={SAMPLE} />);
    const cell = container.querySelector(
      '[data-cell-id="a"]'
    ) as HTMLElement;
    expect(cell.getAttribute('data-cell-index')).toBe('0');
    expect(cell.getAttribute('data-cell-value')).toBe('6');
    expect(cell.getAttribute('data-cell-share')).toBeTruthy();
    expect(cell.getAttribute('data-cell-aspect-ratio')).toBeTruthy();
    expect(cell.getAttribute('data-cell-color')).toBeTruthy();
  });

  it('cell rect is role=graphics-symbol + tabIndex=0 + aria-label', () => {
    const { container } = render(<ChartTreemapSquarified items={SAMPLE} />);
    const rect = container.querySelector(
      '[data-section="chart-treemap-squarified-rect"]'
    ) as SVGRectElement;
    expect(rect.getAttribute('role')).toBe('graphics-symbol');
    expect(rect.getAttribute('tabindex')).toBe('0');
    expect(rect.getAttribute('aria-label')).toContain('Alpha');
    expect(rect.getAttribute('aria-label')).toContain('6');
  });

  it('root mirrors counts + total + worst-aspect-ratio + animate', () => {
    const { container } = render(<ChartTreemapSquarified items={SAMPLE} />);
    const root = container.querySelector(
      '[data-section="chart-treemap-squarified"]'
    );
    expect(root?.getAttribute('data-item-count')).toBe('7');
    expect(root?.getAttribute('data-cell-count')).toBe('7');
    expect(root?.getAttribute('data-total')).toBe('24');
    expect(root?.getAttribute('data-animate')).toBe('true');
    expect(root?.getAttribute('data-worst-aspect-ratio')).toBeTruthy();
  });

  it('labels + values render by default for large cells', () => {
    const { container } = render(
      <ChartTreemapSquarified items={SAMPLE} labelMinArea={0} />
    );
    expect(
      container.querySelectorAll(
        '[data-section="chart-treemap-squarified-label"]'
      ).length
    ).toBeGreaterThan(0);
    expect(
      container.querySelectorAll(
        '[data-section="chart-treemap-squarified-value"]'
      ).length
    ).toBeGreaterThan(0);
  });

  it('showLabels=false suppresses labels', () => {
    const { container } = render(
      <ChartTreemapSquarified
        items={SAMPLE}
        showLabels={false}
        labelMinArea={0}
      />
    );
    expect(
      container.querySelector('[data-section="chart-treemap-squarified-label"]')
    ).toBeNull();
  });

  it('showValues=false suppresses value text', () => {
    const { container } = render(
      <ChartTreemapSquarified
        items={SAMPLE}
        showValues={false}
        labelMinArea={0}
      />
    );
    expect(
      container.querySelector('[data-section="chart-treemap-squarified-value"]')
    ).toBeNull();
  });

  it('labelMinArea above all cell areas hides labels', () => {
    const { container } = render(
      <ChartTreemapSquarified items={SAMPLE} labelMinArea={1_000_000} />
    );
    expect(
      container.querySelector('[data-section="chart-treemap-squarified-label"]')
    ).toBeNull();
    expect(
      container.querySelector('[data-section="chart-treemap-squarified-value"]')
    ).toBeNull();
  });

  it('tooltip opens on cell hover with label + value + share + aspect', () => {
    const { container } = render(<ChartTreemapSquarified items={SAMPLE} />);
    const cell = container.querySelector(
      '[data-cell-id="a"]'
    ) as HTMLElement;
    fireEvent.mouseEnter(cell);
    expect(
      container.querySelector(
        '[data-section="chart-treemap-squarified-tooltip"]'
      )
    ).not.toBeNull();
    expect(
      container.querySelector(
        '[data-section="chart-treemap-squarified-tooltip-label"]'
      )?.textContent
    ).toBe('Alpha');
    expect(
      container.querySelector(
        '[data-section="chart-treemap-squarified-tooltip-value"]'
      )?.textContent
    ).toBe('6');
    expect(
      container.querySelector(
        '[data-section="chart-treemap-squarified-tooltip-share"]'
      )?.textContent
    ).toContain('25%');
    expect(
      container.querySelector(
        '[data-section="chart-treemap-squarified-tooltip-aspect"]'
      )?.textContent
    ).toContain('aspect');
  });

  it('tooltip hides on mouseleave', () => {
    const { container } = render(<ChartTreemapSquarified items={SAMPLE} />);
    const cell = container.querySelector(
      '[data-cell-id="a"]'
    ) as HTMLElement;
    fireEvent.mouseEnter(cell);
    expect(
      container.querySelector(
        '[data-section="chart-treemap-squarified-tooltip"]'
      )
    ).not.toBeNull();
    fireEvent.mouseLeave(cell);
    expect(
      container.querySelector(
        '[data-section="chart-treemap-squarified-tooltip"]'
      )
    ).toBeNull();
  });

  it('showTooltip=false suppresses tooltip', () => {
    const { container } = render(
      <ChartTreemapSquarified items={SAMPLE} showTooltip={false} />
    );
    fireEvent.mouseEnter(
      container.querySelector('[data-cell-id="a"]')! as HTMLElement
    );
    expect(
      container.querySelector(
        '[data-section="chart-treemap-squarified-tooltip"]'
      )
    ).toBeNull();
  });

  it('formatValue reaches tooltip + aria-label', () => {
    const { container } = render(
      <ChartTreemapSquarified
        items={SAMPLE}
        formatValue={(v) => `${v}u`}
      />
    );
    const rect = container.querySelector(
      '[data-section="chart-treemap-squarified-rect"]'
    ) as SVGRectElement;
    expect(rect.getAttribute('aria-label')).toContain('u');
    fireEvent.mouseEnter(
      container.querySelector('[data-cell-id="a"]')! as HTMLElement
    );
    expect(
      container.querySelector(
        '[data-section="chart-treemap-squarified-tooltip-value"]'
      )?.textContent
    ).toBe('6u');
  });

  it('formatPercent reaches tooltip share', () => {
    const { container } = render(
      <ChartTreemapSquarified
        items={SAMPLE}
        formatPercent={(p) => `${(p * 100).toFixed(1)}pct`}
      />
    );
    fireEvent.mouseEnter(
      container.querySelector('[data-cell-id="a"]')! as HTMLElement
    );
    expect(
      container.querySelector(
        '[data-section="chart-treemap-squarified-tooltip-share"]'
      )?.textContent
    ).toContain('pct');
  });

  it('onCellClick fires with item + layout payload', () => {
    const onCellClick = vi.fn();
    const { container } = render(
      <ChartTreemapSquarified items={SAMPLE} onCellClick={onCellClick} />
    );
    fireEvent.click(
      container.querySelector('[data-cell-id="b"]')! as HTMLElement
    );
    expect(onCellClick).toHaveBeenCalledTimes(1);
    expect(onCellClick.mock.calls[0]![0].item.id).toBe('b');
    expect(onCellClick.mock.calls[0]![0].layout.id).toBe('b');
  });

  it('data-hovered mirrors hover state', () => {
    const { container } = render(<ChartTreemapSquarified items={SAMPLE} />);
    const cell = container.querySelector(
      '[data-cell-id="a"]'
    ) as HTMLElement;
    expect(cell.getAttribute('data-hovered')).toBe('false');
    fireEvent.mouseEnter(cell);
    expect(cell.getAttribute('data-hovered')).toBe('true');
    fireEvent.mouseLeave(cell);
    expect(cell.getAttribute('data-hovered')).toBe('false');
  });

  it('legend renders when showLegend=true', () => {
    const { container } = render(
      <ChartTreemapSquarified items={SAMPLE} showLegend />
    );
    expect(
      container.querySelectorAll(
        '[data-section="chart-treemap-squarified-legend-item"]'
      ).length
    ).toBe(SAMPLE.length);
  });

  it('legend hidden by default', () => {
    const { container } = render(<ChartTreemapSquarified items={SAMPLE} />);
    expect(
      container.querySelector(
        '[data-section="chart-treemap-squarified-legend"]'
      )
    ).toBeNull();
  });

  it('auto ARIA description renders by default', () => {
    const { container } = render(<ChartTreemapSquarified items={SAMPLE} />);
    expect(
      container.querySelector(
        '[data-section="chart-treemap-squarified-aria-desc"]'
      )?.textContent
    ).toContain('7 cells');
  });

  it('ariaDescription override beats auto', () => {
    const { container } = render(
      <ChartTreemapSquarified items={SAMPLE} ariaDescription="Override" />
    );
    expect(
      container.querySelector(
        '[data-section="chart-treemap-squarified-aria-desc"]'
      )?.textContent
    ).toBe('Override');
  });

  it('SVG mirrors width / height / viewBox', () => {
    const { container } = render(
      <ChartTreemapSquarified items={SAMPLE} width={400} height={200} />
    );
    const svg = container.querySelector(
      '[data-section="chart-treemap-squarified-svg"]'
    ) as SVGElement;
    expect(svg.getAttribute('width')).toBe('400');
    expect(svg.getAttribute('height')).toBe('200');
    expect(svg.getAttribute('viewBox')).toBe('0 0 400 200');
  });

  it('empty items renders without crashing', () => {
    const { container } = render(<ChartTreemapSquarified items={[]} />);
    expect(
      container.querySelectorAll(
        '[data-section="chart-treemap-squarified-cell"]'
      ).length
    ).toBe(0);
    expect(
      container.querySelector(
        '[data-section="chart-treemap-squarified-aria-desc"]'
      )?.textContent
    ).toBe('No data');
  });

  it('forwards ref to root', () => {
    const ref = createRef<HTMLDivElement>();
    render(<ChartTreemapSquarified items={SAMPLE} ref={ref} />);
    expect(ref.current?.dataset.section).toBe('chart-treemap-squarified');
  });

  it('has stable displayName', () => {
    expect(ChartTreemapSquarified.displayName).toBe('ChartTreemapSquarified');
  });

  it('data-animate mirrors prop', () => {
    const { container } = render(
      <ChartTreemapSquarified items={SAMPLE} animate={false} />
    );
    expect(
      container.querySelector('[data-section="chart-treemap-squarified"]')!
        .getAttribute('data-animate')
    ).toBe('false');
  });
});
