import { afterEach, describe, it, expect, vi } from 'vitest';
import { createRef } from 'react';
import { render, fireEvent, cleanup } from '@testing-library/react';
import {
  ChartIcicle,
  computeIcicleLayout,
  describeIcicleChart,
  flattenIcicleHierarchy,
  getIcicleDefaultColor,
  getIcicleMaxDepth,
  getIcicleNodeValue,
  DEFAULT_CHART_ICICLE_WIDTH,
  DEFAULT_CHART_ICICLE_HEIGHT,
  DEFAULT_CHART_ICICLE_PADDING,
  DEFAULT_CHART_ICICLE_CELL_GAP,
  DEFAULT_CHART_ICICLE_LABEL_MIN_WIDTH,
  DEFAULT_CHART_ICICLE_LABEL_MIN_HEIGHT,
  DEFAULT_CHART_ICICLE_FILL_OPACITY,
  DEFAULT_CHART_ICICLE_ORIENTATION,
  DEFAULT_CHART_ICICLE_PALETTE,
  type ChartIcicleNode,
} from './chart-icicle';

afterEach(() => cleanup());

const ROOT: ChartIcicleNode = {
  id: 'root',
  label: 'Root',
  children: [
    {
      id: 'a',
      label: 'A',
      children: [
        { id: 'a1', label: 'A1', value: 10 },
        { id: 'a2', label: 'A2', value: 20 },
      ],
    },
    {
      id: 'b',
      label: 'B',
      children: [{ id: 'b1', label: 'B1', value: 30 }],
    },
    { id: 'c', label: 'C', value: 40 },
  ],
};

describe('chart-icicle constants', () => {
  it('exports the documented defaults', () => {
    expect(DEFAULT_CHART_ICICLE_WIDTH).toBe(560);
    expect(DEFAULT_CHART_ICICLE_HEIGHT).toBe(320);
    expect(DEFAULT_CHART_ICICLE_PADDING).toBe(16);
    expect(DEFAULT_CHART_ICICLE_CELL_GAP).toBe(1);
    expect(DEFAULT_CHART_ICICLE_LABEL_MIN_WIDTH).toBe(36);
    expect(DEFAULT_CHART_ICICLE_LABEL_MIN_HEIGHT).toBe(14);
    expect(DEFAULT_CHART_ICICLE_FILL_OPACITY).toBeCloseTo(0.85);
    expect(DEFAULT_CHART_ICICLE_ORIENTATION).toBe('horizontal');
    expect(DEFAULT_CHART_ICICLE_PALETTE.length).toBe(10);
  });
});

describe('getIcicleDefaultColor', () => {
  it('palette + modulo + invalid fallback', () => {
    expect(getIcicleDefaultColor(0)).toBe(DEFAULT_CHART_ICICLE_PALETTE[0]);
    expect(getIcicleDefaultColor(DEFAULT_CHART_ICICLE_PALETTE.length)).toBe(
      DEFAULT_CHART_ICICLE_PALETTE[0]
    );
    expect(getIcicleDefaultColor(-1)).toBe(DEFAULT_CHART_ICICLE_PALETTE[0]);
  });
});

describe('getIcicleNodeValue', () => {
  it('leaf with explicit value returns the value', () => {
    expect(getIcicleNodeValue({ id: 'l', label: 'L', value: 5 })).toBe(5);
  });
  it('parent sums children when children have positive values', () => {
    expect(getIcicleNodeValue(ROOT)).toBe(100);
  });
  it('parent with no positive children falls back to explicit value', () => {
    expect(
      getIcicleNodeValue({
        id: 'p',
        label: 'P',
        value: 7,
        children: [{ id: 'c', label: 'C', value: 0 }],
      })
    ).toBe(7);
  });
  it('childless without value -> 0', () => {
    expect(getIcicleNodeValue({ id: 'x', label: 'X' })).toBe(0);
  });
});

describe('flattenIcicleHierarchy', () => {
  it('returns one entry per node with depth + path', () => {
    const flat = flattenIcicleHierarchy(ROOT);
    expect(flat).toHaveLength(7);
    expect(flat[0]!.id).toBe('root');
    const a1 = flat.find((n) => n.id === 'a1')!;
    expect(a1.depth).toBe(2);
    expect(a1.path).toEqual(['root', 'a', 'a1']);
    expect(a1.isLeaf).toBe(true);
  });
  it('null root returns []', () => {
    expect(flattenIcicleHierarchy(null)).toEqual([]);
  });
});

describe('getIcicleMaxDepth', () => {
  it('returns the deepest depth value', () => {
    expect(getIcicleMaxDepth(flattenIcicleHierarchy(ROOT))).toBe(2);
  });
  it('empty -> 0', () => {
    expect(getIcicleMaxDepth([])).toBe(0);
  });
});

describe('computeIcicleLayout', () => {
  const W = 300;
  const H = 240;

  it('null root / non-positive dims -> empty', () => {
    const a = computeIcicleLayout({
      root: null,
      focusPath: [],
      orientation: 'horizontal',
      width: W,
      height: H,
      padX: 0,
      padY: 0,
      cellGap: 0,
      fallbackColor: '#999',
    });
    expect(a.cells).toEqual([]);
    const b = computeIcicleLayout({
      root: ROOT,
      focusPath: ['root'],
      orientation: 'horizontal',
      width: 0,
      height: H,
      padX: 0,
      padY: 0,
      cellGap: 0,
      fallbackColor: '#999',
    });
    expect(b.cells).toEqual([]);
  });

  it('produces 7 cells when focused on root', () => {
    const r = computeIcicleLayout({
      root: ROOT,
      focusPath: ['root'],
      orientation: 'horizontal',
      width: W,
      height: H,
      padX: 0,
      padY: 0,
      cellGap: 0,
      fallbackColor: '#999',
    });
    expect(r.cells).toHaveLength(7);
    expect(r.focusNode?.id).toBe('root');
    expect(r.focusValue).toBe(100);
  });

  it('horizontal: focus row spans full width; bands step by height/(maxDepth+1)', () => {
    const r = computeIcicleLayout({
      root: ROOT,
      focusPath: ['root'],
      orientation: 'horizontal',
      width: W,
      height: H,
      padX: 0,
      padY: 0,
      cellGap: 0,
      fallbackColor: '#999',
    });
    const rootCell = r.cells.find((c) => c.id === 'root')!;
    expect(rootCell.width).toBeCloseTo(W);
    expect(r.bandSize).toBeCloseTo(H / 3);
    expect(rootCell.height).toBeCloseTo(H / 3);
  });

  it('vertical: focus column spans full height; bands step by width/(maxDepth+1)', () => {
    const r = computeIcicleLayout({
      root: ROOT,
      focusPath: ['root'],
      orientation: 'vertical',
      width: W,
      height: H,
      padX: 0,
      padY: 0,
      cellGap: 0,
      fallbackColor: '#999',
    });
    const rootCell = r.cells.find((c) => c.id === 'root')!;
    expect(rootCell.height).toBeCloseTo(H);
    expect(r.bandSize).toBeCloseTo(W / 3);
    expect(rootCell.width).toBeCloseTo(W / 3);
  });

  it('top-level horizontal child widths sum to parent width', () => {
    const r = computeIcicleLayout({
      root: ROOT,
      focusPath: ['root'],
      orientation: 'horizontal',
      width: W,
      height: H,
      padX: 0,
      padY: 0,
      cellGap: 0,
      fallbackColor: '#999',
    });
    let sum = 0;
    for (const cell of r.cells) {
      if (cell.depth === 1) sum += cell.width;
    }
    expect(sum).toBeCloseTo(W);
  });

  it('child widths are proportional to value share of parent', () => {
    const r = computeIcicleLayout({
      root: ROOT,
      focusPath: ['root'],
      orientation: 'horizontal',
      width: W,
      height: H,
      padX: 0,
      padY: 0,
      cellGap: 0,
      fallbackColor: '#999',
    });
    const c = r.cells.find((cell) => cell.id === 'c')!;
    expect(c.width).toBeCloseTo(W * 0.4);
  });

  it('share = value / focusValue; globalShare = value / overall total', () => {
    const r = computeIcicleLayout({
      root: ROOT,
      focusPath: ['root'],
      orientation: 'horizontal',
      width: W,
      height: H,
      padX: 0,
      padY: 0,
      cellGap: 0,
      fallbackColor: '#999',
    });
    const a1 = r.cells.find((c) => c.id === 'a1')!;
    expect(a1.share).toBeCloseTo(10 / 100);
    expect(a1.globalShare).toBeCloseTo(10 / 100);
  });

  it('zooming into "a" only renders descendants of a; focus cell spans full width', () => {
    const r = computeIcicleLayout({
      root: ROOT,
      focusPath: ['root', 'a'],
      orientation: 'horizontal',
      width: W,
      height: H,
      padX: 0,
      padY: 0,
      cellGap: 0,
      fallbackColor: '#999',
    });
    expect(r.focusNode?.id).toBe('a');
    expect(r.focusValue).toBe(30);
    const ids = new Set(r.cells.map((c) => c.id));
    expect(ids.has('a')).toBe(true);
    expect(ids.has('a1')).toBe(true);
    expect(ids.has('a2')).toBe(true);
    expect(ids.has('b')).toBe(false);
    const aCell = r.cells.find((c) => c.id === 'a')!;
    expect(aCell.width).toBeCloseTo(W);
  });

  it('unknown focus path falls back to root', () => {
    const r = computeIcicleLayout({
      root: ROOT,
      focusPath: ['nope'],
      orientation: 'horizontal',
      width: W,
      height: H,
      padX: 0,
      padY: 0,
      cellGap: 0,
      fallbackColor: '#999',
    });
    expect(r.focusNode?.id).toBe('root');
  });

  it('per-node color override beats palette', () => {
    const colored: ChartIcicleNode = {
      id: 'r',
      label: 'R',
      children: [{ id: 'x', label: 'X', value: 1, color: '#abcdef' }],
    };
    const r = computeIcicleLayout({
      root: colored,
      focusPath: ['r'],
      orientation: 'horizontal',
      width: W,
      height: H,
      padX: 0,
      padY: 0,
      cellGap: 0,
      fallbackColor: '#999',
    });
    expect(r.cells.find((c) => c.id === 'x')!.color).toBe('#abcdef');
  });

  it('isFocus=true only for the focus node', () => {
    const r = computeIcicleLayout({
      root: ROOT,
      focusPath: ['root', 'a'],
      orientation: 'horizontal',
      width: W,
      height: H,
      padX: 0,
      padY: 0,
      cellGap: 0,
      fallbackColor: '#999',
    });
    const focusCells = r.cells.filter((c) => c.isFocus);
    expect(focusCells).toHaveLength(1);
    expect(focusCells[0]!.id).toBe('a');
  });

  it('top-level horizontal children sit immediately below the focus row', () => {
    const r = computeIcicleLayout({
      root: ROOT,
      focusPath: ['root'],
      orientation: 'horizontal',
      width: W,
      height: H,
      padX: 0,
      padY: 0,
      cellGap: 0,
      fallbackColor: '#999',
    });
    const rootCell = r.cells.find((c) => c.id === 'root')!;
    const aCell = r.cells.find((c) => c.id === 'a')!;
    expect(aCell.y).toBeCloseTo(rootCell.y + rootCell.height);
  });
});

describe('describeIcicleChart', () => {
  it('null / zero -> "No data"', () => {
    expect(describeIcicleChart(null, [], 'horizontal')).toBe('No data');
    expect(
      describeIcicleChart({ id: 'r', label: 'R' }, ['r'], 'horizontal')
    ).toBe('No data');
  });
  it('includes orientation + count + levels + total + focus', () => {
    const d = describeIcicleChart(ROOT, ['root'], 'vertical');
    expect(d).toContain('Icicle chart (vertical)');
    expect(d).toContain('7 nodes');
    expect(d).toContain('3 levels');
    expect(d).toContain('Root');
  });
});

describe('<ChartIcicle> component', () => {
  it('renders region + custom aria-label', () => {
    const { getByRole } = render(
      <ChartIcicle root={ROOT} ariaLabel="Test icicle" />
    );
    expect(getByRole('region', { name: 'Test icicle' })).toBeTruthy();
  });

  it('renders one cell per visible node when focused on root', () => {
    const { container } = render(<ChartIcicle root={ROOT} />);
    expect(
      container.querySelectorAll('[data-section="chart-icicle-cell"]').length
    ).toBe(7);
  });

  it('cell data attrs carry id / depth / parent / value / share / color / focus', () => {
    const { container } = render(<ChartIcicle root={ROOT} />);
    const a = container.querySelector('[data-cell-id="a"]') as HTMLElement;
    expect(a.getAttribute('data-cell-depth')).toBe('1');
    expect(a.getAttribute('data-cell-parent')).toBe('root');
    expect(a.getAttribute('data-cell-value')).toBe('30');
    expect(a.getAttribute('data-cell-share')).toBeTruthy();
    expect(a.getAttribute('data-cell-global-share')).toBeTruthy();
    expect(a.getAttribute('data-cell-color')).toBeTruthy();
    expect(a.getAttribute('data-cell-is-focus')).toBe('false');
    const rootCell = container.querySelector(
      '[data-cell-id="root"]'
    ) as HTMLElement;
    expect(rootCell.getAttribute('data-cell-is-focus')).toBe('true');
  });

  it('cell rect is role=graphics-symbol + tabIndex=0 + aria-label', () => {
    const { container } = render(<ChartIcicle root={ROOT} />);
    const rect = container.querySelector(
      '[data-section="chart-icicle-rect"]'
    ) as SVGRectElement;
    expect(rect.getAttribute('role')).toBe('graphics-symbol');
    expect(rect.getAttribute('tabindex')).toBe('0');
    expect(rect.getAttribute('aria-label')).toContain('Root');
  });

  it('root mirrors counts + focus + max-depth + orientation + animate', () => {
    const { container } = render(<ChartIcicle root={ROOT} />);
    const root = container.querySelector('[data-section="chart-icicle"]');
    expect(root?.getAttribute('data-node-count')).toBe('7');
    expect(root?.getAttribute('data-cell-count')).toBe('7');
    expect(root?.getAttribute('data-focus-id')).toBe('root');
    expect(root?.getAttribute('data-focus-depth')).toBe('0');
    expect(root?.getAttribute('data-max-depth')).toBe('2');
    expect(root?.getAttribute('data-orientation')).toBe('horizontal');
    expect(root?.getAttribute('data-animate')).toBe('true');
  });

  it('orientation prop switches between horizontal + vertical', () => {
    const a = render(<ChartIcicle root={ROOT} orientation="vertical" />);
    expect(
      a.container.querySelector('[data-section="chart-icicle"]')!
        .getAttribute('data-orientation')
    ).toBe('vertical');
  });

  it('click on a cell zooms in (uncontrolled)', () => {
    const { container } = render(<ChartIcicle root={ROOT} />);
    fireEvent.click(
      container.querySelector('[data-cell-id="a"]')! as HTMLElement
    );
    const root = container.querySelector('[data-section="chart-icicle"]');
    expect(root?.getAttribute('data-focus-id')).toBe('a');
    expect(
      container.querySelectorAll('[data-section="chart-icicle-cell"]').length
    ).toBe(3);
  });

  it('onFocusPathChange fires with the new focus path', () => {
    const onFocusPathChange = vi.fn();
    const { container } = render(
      <ChartIcicle root={ROOT} onFocusPathChange={onFocusPathChange} />
    );
    fireEvent.click(
      container.querySelector('[data-cell-id="b"]')! as HTMLElement
    );
    expect(onFocusPathChange).toHaveBeenCalledTimes(1);
    expect(onFocusPathChange.mock.calls[0]![0]).toEqual(['root', 'b']);
  });

  it('onCellClick payload with becameFocus flag', () => {
    const onCellClick = vi.fn();
    const { container } = render(
      <ChartIcicle root={ROOT} onCellClick={onCellClick} />
    );
    fireEvent.click(
      container.querySelector('[data-cell-id="a"]')! as HTMLElement
    );
    expect(onCellClick).toHaveBeenCalledTimes(1);
    expect(onCellClick.mock.calls[0]![0].becameFocus).toBe(true);
    expect(onCellClick.mock.calls[0]![0].cell.id).toBe('a');
  });

  it('controlled focusPath wins over internal state', () => {
    const { container } = render(
      <ChartIcicle root={ROOT} focusPath={['root', 'b']} />
    );
    const root = container.querySelector('[data-section="chart-icicle"]');
    expect(root?.getAttribute('data-focus-id')).toBe('b');
  });

  it('breadcrumb renders one entry per focus level by default', () => {
    const { container } = render(
      <ChartIcicle root={ROOT} defaultFocusPath={['root', 'a']} />
    );
    const items = container.querySelectorAll(
      '[data-section="chart-icicle-breadcrumb-item"]'
    );
    expect(items.length).toBe(2);
    expect(items[0]!.getAttribute('data-breadcrumb-id')).toBe('root');
    expect(items[1]!.getAttribute('data-breadcrumb-id')).toBe('a');
  });

  it('breadcrumb click zooms to that level', () => {
    const { container } = render(
      <ChartIcicle root={ROOT} defaultFocusPath={['root', 'a']} />
    );
    const buttons = container.querySelectorAll(
      '[data-section="chart-icicle-breadcrumb-button"]'
    );
    fireEvent.click(buttons[0]! as HTMLElement);
    expect(
      container.querySelector('[data-section="chart-icicle"]')!
        .getAttribute('data-focus-id')
    ).toBe('root');
  });

  it('showBreadcrumb=false suppresses the breadcrumb', () => {
    const { container } = render(
      <ChartIcicle root={ROOT} showBreadcrumb={false} />
    );
    expect(
      container.querySelector('[data-section="chart-icicle-breadcrumb"]')
    ).toBeNull();
  });

  it('cell labels render for cells big enough', () => {
    const { container } = render(
      <ChartIcicle root={ROOT} labelMinWidth={0} labelMinHeight={0} />
    );
    const labels = container.querySelectorAll(
      '[data-section="chart-icicle-cell-label"]'
    );
    expect(labels.length).toBeGreaterThan(0);
  });

  it('showLabels=false suppresses labels', () => {
    const { container } = render(
      <ChartIcicle root={ROOT} showLabels={false} labelMinWidth={0} labelMinHeight={0} />
    );
    expect(
      container.querySelector('[data-section="chart-icicle-cell-label"]')
    ).toBeNull();
  });

  it('labelMinWidth above max cell width hides labels', () => {
    const { container } = render(
      <ChartIcicle root={ROOT} labelMinWidth={5000} />
    );
    expect(
      container.querySelector('[data-section="chart-icicle-cell-label"]')
    ).toBeNull();
  });

  it('tooltip opens on cell hover with path + value + share + global', () => {
    const { container } = render(<ChartIcicle root={ROOT} />);
    fireEvent.mouseEnter(
      container.querySelector('[data-cell-id="a1"]')! as HTMLElement
    );
    expect(
      container.querySelector('[data-section="chart-icicle-tooltip"]')
    ).not.toBeNull();
    expect(
      container.querySelector(
        '[data-section="chart-icicle-tooltip-label"]'
      )?.textContent
    ).toContain('root / a / a1');
    expect(
      container.querySelector(
        '[data-section="chart-icicle-tooltip-value"]'
      )?.textContent
    ).toBe('10');
    expect(
      container.querySelector(
        '[data-section="chart-icicle-tooltip-share"]'
      )?.textContent
    ).toContain('10%');
    expect(
      container.querySelector(
        '[data-section="chart-icicle-tooltip-global"]'
      )?.textContent
    ).toContain('10%');
  });

  it('tooltip hides on mouseleave', () => {
    const { container } = render(<ChartIcicle root={ROOT} />);
    const a = container.querySelector('[data-cell-id="a"]') as HTMLElement;
    fireEvent.mouseEnter(a);
    expect(
      container.querySelector('[data-section="chart-icicle-tooltip"]')
    ).not.toBeNull();
    fireEvent.mouseLeave(a);
    expect(
      container.querySelector('[data-section="chart-icicle-tooltip"]')
    ).toBeNull();
  });

  it('showTooltip=false suppresses the tooltip', () => {
    const { container } = render(
      <ChartIcicle root={ROOT} showTooltip={false} />
    );
    fireEvent.mouseEnter(
      container.querySelector('[data-cell-id="a"]')! as HTMLElement
    );
    expect(
      container.querySelector('[data-section="chart-icicle-tooltip"]')
    ).toBeNull();
  });

  it('formatValue + formatPercent reach tooltip + aria-label', () => {
    const { container } = render(
      <ChartIcicle
        root={ROOT}
        formatValue={(v) => `${v}u`}
        formatPercent={(p) => `${(p * 100).toFixed(1)}pct`}
      />
    );
    const rect = container.querySelector(
      '[data-section="chart-icicle-rect"]'
    ) as SVGRectElement;
    expect(rect.getAttribute('aria-label')).toContain('u');
    expect(rect.getAttribute('aria-label')).toContain('pct');
  });

  it('data-hovered mirrors hover state', () => {
    const { container } = render(<ChartIcicle root={ROOT} />);
    const a = container.querySelector('[data-cell-id="a"]') as HTMLElement;
    expect(a.getAttribute('data-hovered')).toBe('false');
    fireEvent.mouseEnter(a);
    expect(a.getAttribute('data-hovered')).toBe('true');
    fireEvent.mouseLeave(a);
    expect(a.getAttribute('data-hovered')).toBe('false');
  });

  it('auto ARIA description renders by default', () => {
    const { container } = render(<ChartIcicle root={ROOT} />);
    expect(
      container.querySelector('[data-section="chart-icicle-aria-desc"]')
        ?.textContent
    ).toContain('7 nodes');
  });

  it('ariaDescription override beats auto', () => {
    const { container } = render(
      <ChartIcicle root={ROOT} ariaDescription="Override" />
    );
    expect(
      container.querySelector('[data-section="chart-icicle-aria-desc"]')
        ?.textContent
    ).toBe('Override');
  });

  it('SVG mirrors width / height / viewBox', () => {
    const { container } = render(
      <ChartIcicle root={ROOT} width={500} height={300} />
    );
    const svg = container.querySelector(
      '[data-section="chart-icicle-svg"]'
    ) as SVGElement;
    expect(svg.getAttribute('width')).toBe('500');
    expect(svg.getAttribute('height')).toBe('300');
    expect(svg.getAttribute('viewBox')).toBe('0 0 500 300');
  });

  it('null root renders without crashing', () => {
    const { container } = render(<ChartIcicle root={null} />);
    expect(
      container.querySelectorAll('[data-section="chart-icicle-cell"]').length
    ).toBe(0);
    expect(
      container.querySelector('[data-section="chart-icicle-aria-desc"]')
        ?.textContent
    ).toBe('No data');
  });

  it('forwards ref to root', () => {
    const ref = createRef<HTMLDivElement>();
    render(<ChartIcicle root={ROOT} ref={ref} />);
    expect(ref.current?.dataset.section).toBe('chart-icicle');
  });

  it('has stable displayName', () => {
    expect(ChartIcicle.displayName).toBe('ChartIcicle');
  });

  it('data-animate mirrors prop', () => {
    const { container } = render(<ChartIcicle root={ROOT} animate={false} />);
    expect(
      container.querySelector('[data-section="chart-icicle"]')!
        .getAttribute('data-animate')
    ).toBe('false');
  });
});
