import { afterEach, describe, expect, it } from 'vitest';
import { createRef } from 'react';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import {
  ChartLineTsne,
  DEFAULT_CHART_LINE_TSNE_HEIGHT,
  DEFAULT_CHART_LINE_TSNE_PADDING,
  DEFAULT_CHART_LINE_TSNE_PALETTE,
  DEFAULT_CHART_LINE_TSNE_TICK_COUNT,
  DEFAULT_CHART_LINE_TSNE_WIDTH,
  buildLineTsneMatrix,
  computeLineTsneLayout,
  computePcaProjection,
  describeLineTsneChart,
  getLineTsneDefaultColor,
  getLineTsneFinitePoints,
  runLineTsne,
  type ChartLineTsneSeries,
} from './chart-line-tsne';

afterEach(() => {
  cleanup();
});

function ch(
  id: string,
  label: string,
  ys: readonly number[],
): ChartLineTsneSeries {
  return { id, label, data: ys.map((y, i) => ({ x: i, y })) };
}

// Three channels: B = 2*A and C is constant, so all variance lies on a
// single direction in the A-B plane -> PC1 captures 100%.
const THREE: ChartLineTsneSeries[] = [
  ch('a', 'A', [1, 2, 3, 4, 5]),
  ch('b', 'B', [2, 4, 6, 8, 10]),
  ch('c', 'C', [5, 5, 5, 5, 5]),
];

// y = x: a 2-channel matrix whose data lies entirely on the (1,1) line.
const Y_EQUALS_X = [
  [1, 1],
  [2, 2],
  [3, 3],
  [4, 4],
  [5, 5],
];

function vlen(v: readonly number[]): number {
  return Math.sqrt(v.reduce((s, x) => s + x * x, 0));
}

function vdot(a: readonly number[], b: readonly number[]): number {
  return a.reduce((s, x, i) => s + x * b[i]!, 0);
}

describe('chart-line-tsne defaults', () => {
  it('positive size defaults', () => {
    expect(DEFAULT_CHART_LINE_TSNE_WIDTH).toBeGreaterThan(0);
    expect(DEFAULT_CHART_LINE_TSNE_HEIGHT).toBeGreaterThan(0);
    expect(DEFAULT_CHART_LINE_TSNE_PADDING).toBeGreaterThan(0);
    expect(DEFAULT_CHART_LINE_TSNE_TICK_COUNT).toBeGreaterThan(0);
  });
  it('palette has 10 colours', () => {
    expect(DEFAULT_CHART_LINE_TSNE_PALETTE.length).toBe(10);
  });
});

describe('getLineTsneDefaultColor', () => {
  it('cycles through the palette', () => {
    const len = DEFAULT_CHART_LINE_TSNE_PALETTE.length;
    expect(getLineTsneDefaultColor(0)).toBe(DEFAULT_CHART_LINE_TSNE_PALETTE[0]);
    expect(getLineTsneDefaultColor(len)).toBe(
      DEFAULT_CHART_LINE_TSNE_PALETTE[0],
    );
    expect(getLineTsneDefaultColor(len + 2)).toBe(
      DEFAULT_CHART_LINE_TSNE_PALETTE[2],
    );
  });
  it('handles non-finite and negative', () => {
    expect(getLineTsneDefaultColor(NaN)).toBe(
      DEFAULT_CHART_LINE_TSNE_PALETTE[0],
    );
    expect(getLineTsneDefaultColor(-1)).toBe(
      DEFAULT_CHART_LINE_TSNE_PALETTE[0],
    );
  });
});

describe('getLineTsneFinitePoints', () => {
  it('drops non-finite values', () => {
    const r = getLineTsneFinitePoints([
      { x: 0, y: 0 },
      { x: NaN, y: 1 },
      { x: 1, y: Infinity },
      { x: 2, y: 4 },
    ]);
    expect(r.length).toBe(2);
  });
  it('null returns []', () => {
    expect(getLineTsneFinitePoints(null)).toEqual([]);
    expect(getLineTsneFinitePoints(undefined)).toEqual([]);
  });
});

describe('buildLineTsneMatrix', () => {
  it('empty / null -> empty matrix', () => {
    const r = buildLineTsneMatrix([]);
    expect(r.matrix).toEqual([]);
    expect(r.channelCount).toBe(0);
    expect(r.sampleCount).toBe(0);
  });
  it('pairs channels by exact x match', () => {
    const r = buildLineTsneMatrix(THREE);
    expect(r.channelCount).toBe(3);
    expect(r.sampleCount).toBe(5);
    expect(r.xs).toEqual([0, 1, 2, 3, 4]);
    expect(r.matrix[0]).toEqual([1, 2, 5]);
    expect(r.matrix[4]).toEqual([5, 10, 25 / 5]);
  });
  it('keeps only x values present in every channel', () => {
    const a: ChartLineTsneSeries = {
      id: 'a',
      label: 'A',
      data: [
        { x: 0, y: 1 },
        { x: 1, y: 2 },
        { x: 2, y: 3 },
      ],
    };
    const b: ChartLineTsneSeries = {
      id: 'b',
      label: 'B',
      data: [
        { x: 1, y: 20 },
        { x: 2, y: 30 },
        { x: 3, y: 40 },
      ],
    };
    const r = buildLineTsneMatrix([a, b]);
    expect(r.xs).toEqual([1, 2]);
    expect(r.matrix).toEqual([
      [2, 20],
      [3, 30],
    ]);
  });
  it('drops non-finite samples', () => {
    const a: ChartLineTsneSeries = {
      id: 'a',
      label: 'A',
      data: [
        { x: 0, y: 1 },
        { x: 1, y: NaN },
        { x: 2, y: 3 },
      ],
    };
    const b = ch('b', 'B', [10, 20, 30]);
    const r = buildLineTsneMatrix([a, b]);
    // x=1 dropped from channel A -> not shared
    expect(r.xs).toEqual([0, 2]);
  });
});

describe('computePcaProjection', () => {
  it('fewer than 2 dimensions -> ok=false', () => {
    const r = computePcaProjection([[1], [2], [3]]);
    expect(r.ok).toBe(false);
    expect(r.dimensions).toBe(1);
  });
  it('fewer than 2 samples -> ok=false', () => {
    const r = computePcaProjection([[1, 2]]);
    expect(r.ok).toBe(false);
  });
  it('empty / null -> ok=false', () => {
    expect(computePcaProjection([]).ok).toBe(false);
    expect(computePcaProjection(null).ok).toBe(false);
  });
  it('y=x data: PC1 aligns with the (1,1) direction', () => {
    const r = computePcaProjection(Y_EQUALS_X);
    expect(r.ok).toBe(true);
    expect(r.dimensions).toBe(2);
    expect(r.sampleCount).toBe(5);
    expect(r.components[0]![0]).toBeCloseTo(Math.SQRT1_2, 5);
    expect(r.components[0]![1]).toBeCloseTo(Math.SQRT1_2, 5);
  });
  it('y=x data: PC1 captures all the variance', () => {
    const r = computePcaProjection(Y_EQUALS_X);
    expect(r.eigenvalues[0]).toBeCloseTo(4, 5);
    expect(r.eigenvalues[1]).toBeCloseTo(0, 5);
    expect(r.explainedVariance[0]).toBeCloseTo(1, 5);
    expect(r.explainedVariance[1]).toBeCloseTo(0, 5);
  });
  it('y=x data: the embedding has zero spread on PC2', () => {
    const r = computePcaProjection(Y_EQUALS_X);
    for (const e of r.embedding) {
      expect(e.e2).toBeCloseTo(0, 5);
    }
  });
  it('y=x data: the PC1 embedding spreads the points', () => {
    const r = computePcaProjection(Y_EQUALS_X);
    const e1s = r.embedding.map((e) => e.e1);
    expect(e1s[0]).toBeLessThan(e1s[4]!);
    expect(e1s[0]).toBeCloseTo(-2 * Math.SQRT2, 5);
  });
  it('reports the column means and total variance', () => {
    const r = computePcaProjection(Y_EQUALS_X);
    expect(r.mean).toEqual([3, 3]);
    expect(r.totalVariance).toBeCloseTo(4, 5);
  });
  it('3D data with one dominant direction: PC1 ~ (1,2,0)/sqrt5', () => {
    // B = 2A, C constant -> covariance is rank 1, eigenvalue 10
    const matrix = [
      [1, 2, 5],
      [2, 4, 5],
      [3, 6, 5],
      [4, 8, 5],
      [5, 10, 5],
    ];
    const r = computePcaProjection(matrix);
    expect(r.ok).toBe(true);
    expect(r.dimensions).toBe(3);
    expect(r.eigenvalues[0]).toBeCloseTo(10, 4);
    expect(r.explainedVariance[0]).toBeCloseTo(1, 5);
    expect(r.components[0]![0]).toBeCloseTo(1 / Math.sqrt(5), 4);
    expect(r.components[0]![1]).toBeCloseTo(2 / Math.sqrt(5), 4);
    expect(r.components[0]![2]).toBeCloseTo(0, 4);
  });
  it('the principal components are unit vectors', () => {
    const r = computePcaProjection(Y_EQUALS_X);
    expect(vlen(r.components[0]!)).toBeCloseTo(1, 6);
    expect(vlen(r.components[1]!)).toBeCloseTo(1, 6);
  });
  it('the principal components are orthogonal', () => {
    const matrix = [
      [1, 5, 2],
      [2, 3, 9],
      [3, 8, 1],
      [4, 1, 7],
      [5, 6, 4],
    ];
    const r = computePcaProjection(matrix);
    expect(vdot(r.components[0]!, r.components[1]!)).toBeCloseTo(0, 5);
  });
  it('drops non-finite rows', () => {
    const r = computePcaProjection([
      [1, 1],
      [NaN, 2],
      [3, 3],
      [4, 4],
    ]);
    expect(r.ok).toBe(true);
    expect(r.sampleCount).toBe(3);
  });
  it('anti-correlated channels: PC1 still captures all variance', () => {
    const matrix = [
      [1, 5],
      [2, 4],
      [3, 3],
      [4, 2],
      [5, 1],
    ];
    const r = computePcaProjection(matrix);
    expect(r.explainedVariance[0]).toBeCloseTo(1, 5);
  });
});

describe('runLineTsne', () => {
  it('builds the matrix and the PCA together', () => {
    const r = runLineTsne(THREE);
    expect(r.matrix.sampleCount).toBe(5);
    expect(r.matrix.channelCount).toBe(3);
    expect(r.pca.ok).toBe(true);
    expect(r.pca.explainedVariance[0]).toBeCloseTo(1, 5);
  });
  it('single channel -> PCA not ok', () => {
    const r = runLineTsne([ch('a', 'A', [1, 2, 3])]);
    expect(r.pca.ok).toBe(false);
  });
  it('null -> empty matrix, PCA not ok', () => {
    const r = runLineTsne(null);
    expect(r.matrix.sampleCount).toBe(0);
    expect(r.pca.ok).toBe(false);
  });
});

describe('computeLineTsneLayout', () => {
  it('empty series -> ok=false', () => {
    const layout = computeLineTsneLayout({
      series: [],
      width: 600,
      height: 300,
      padding: 30,
    });
    expect(layout.ok).toBe(false);
  });

  it('degenerate canvas -> ok=false', () => {
    const layout = computeLineTsneLayout({
      series: THREE,
      width: 20,
      height: 20,
      padding: 30,
    });
    expect(layout.ok).toBe(false);
  });

  it('builds a main panel and an embedding panel side by side', () => {
    const layout = computeLineTsneLayout({
      series: THREE,
      width: 600,
      height: 300,
      padding: 30,
    });
    expect(layout.ok).toBe(true);
    expect(layout.mainPanel.width).toBeGreaterThan(0);
    expect(layout.embeddingPanel.width).toBeGreaterThan(0);
    expect(layout.embeddingPanel.x).toBeGreaterThan(layout.mainPanel.x);
  });

  it('builds a line path for each channel', () => {
    const layout = computeLineTsneLayout({
      series: THREE,
      width: 600,
      height: 300,
      padding: 30,
    });
    expect(layout.channels.length).toBe(3);
    for (const c of layout.channels) {
      expect(c.path).toContain('M ');
    }
  });

  it('builds one embedding point per shared time sample', () => {
    const layout = computeLineTsneLayout({
      series: THREE,
      width: 600,
      height: 300,
      padding: 30,
    });
    expect(layout.embeddingPoints.length).toBe(5);
    expect(layout.trajectoryPath).toContain('M ');
  });

  it('embedding point opacity ramps from first to last', () => {
    const layout = computeLineTsneLayout({
      series: THREE,
      width: 600,
      height: 300,
      padding: 30,
    });
    const pts = layout.embeddingPoints;
    expect(pts[0]!.opacity).toBeLessThan(pts[pts.length - 1]!.opacity);
    expect(pts[pts.length - 1]!.opacity).toBeCloseTo(1, 5);
  });

  it('exposes the PCA result', () => {
    const layout = computeLineTsneLayout({
      series: THREE,
      width: 600,
      height: 300,
      padding: 30,
    });
    expect(layout.pca.ok).toBe(true);
    expect(layout.pca.dimensions).toBe(3);
    expect(layout.pca.explainedVariance[0]).toBeCloseTo(1, 5);
  });

  it('renders the main panel even when the embedding is unavailable', () => {
    const layout = computeLineTsneLayout({
      series: [ch('a', 'A', [1, 2, 3])],
      width: 600,
      height: 300,
      padding: 30,
    });
    expect(layout.ok).toBe(true);
    expect(layout.channels.length).toBe(1);
    expect(layout.pca.ok).toBe(false);
    expect(layout.embeddingPoints.length).toBe(0);
  });

  it('bounds overrides honoured for the main panel', () => {
    const layout = computeLineTsneLayout({
      series: THREE,
      width: 600,
      height: 300,
      padding: 30,
      xMin: -10,
      xMax: 50,
      yMin: -5,
      yMax: 99,
    });
    expect(layout.xMin).toBe(-10);
    expect(layout.xMax).toBe(50);
    expect(layout.mainYMin).toBe(-5);
    expect(layout.mainYMax).toBe(99);
  });

  it('totalPoints sums finite samples across all channels', () => {
    const layout = computeLineTsneLayout({
      series: THREE,
      width: 600,
      height: 300,
      padding: 30,
    });
    expect(layout.totalPoints).toBe(15);
  });
});

describe('describeLineTsneChart', () => {
  it('no data -> No data', () => {
    expect(describeLineTsneChart(null)).toBe('No data');
    expect(describeLineTsneChart([])).toBe('No data');
  });
  it('summary mentions the PCA embedding and variance captured', () => {
    const s = describeLineTsneChart(THREE);
    expect(s).toContain('2D PCA embedding');
    expect(s).toContain('principal components');
    expect(s).toContain('variance');
  });
  it('reports when the embedding is unavailable', () => {
    const s = describeLineTsneChart([ch('a', 'A', [1, 2, 3])]);
    expect(s).toContain('Embedding unavailable');
  });
});

describe('<ChartLineTsne> render', () => {
  it('renders empty state when no series', () => {
    render(<ChartLineTsne series={[]} />);
    const root = document.querySelector('[data-section="chart-line-tsne"]');
    expect(root).not.toBeNull();
    expect(root!.getAttribute('data-empty')).toBe('true');
  });

  it('renders a path for each channel', () => {
    render(<ChartLineTsne series={THREE} />);
    const paths = document.querySelectorAll(
      '[data-section="chart-line-tsne-path"]',
    );
    expect(paths.length).toBe(3);
  });

  it('renders the embedding trajectory and one point per sample', () => {
    render(<ChartLineTsne series={THREE} />);
    expect(
      document.querySelector(
        '[data-section="chart-line-tsne-embedding-trajectory"]',
      ),
    ).not.toBeNull();
    expect(
      document.querySelectorAll(
        '[data-section="chart-line-tsne-embedding-point"]',
      ).length,
    ).toBe(5);
  });

  it('renders the embedding origin crosshair', () => {
    render(<ChartLineTsne series={THREE} />);
    expect(
      document.querySelectorAll(
        '[data-section="chart-line-tsne-embedding-origin"]',
      ).length,
    ).toBe(2);
  });

  it('hides the trajectory when showTrajectory=false', () => {
    render(<ChartLineTsne series={THREE} showTrajectory={false} />);
    expect(
      document.querySelector(
        '[data-section="chart-line-tsne-embedding-trajectory"]',
      ),
    ).toBeNull();
  });

  it('hides embedding dots when showEmbeddingDots=false', () => {
    render(<ChartLineTsne series={THREE} showEmbeddingDots={false} />);
    expect(
      document.querySelector(
        '[data-section="chart-line-tsne-embedding-point"]',
      ),
    ).toBeNull();
  });

  it('config badge shows dimensions, samples and explained variance', () => {
    render(<ChartLineTsne series={THREE} />);
    const badge = document.querySelector(
      '[data-section="chart-line-tsne-badge"]',
    );
    expect(badge).not.toBeNull();
    expect(
      document
        .querySelector('[data-section="chart-line-tsne-badge-dims"]')
        ?.textContent,
    ).toBe('d=3');
    expect(
      document
        .querySelector('[data-section="chart-line-tsne-badge-samples"]')
        ?.textContent,
    ).toBe('n=5');
    expect(
      document
        .querySelector('[data-section="chart-line-tsne-badge-variance"]')
        ?.textContent,
    ).toBe('var=100%');
  });

  it('hides config badge when showBadge=false', () => {
    render(<ChartLineTsne series={THREE} showBadge={false} />);
    expect(
      document.querySelector('[data-section="chart-line-tsne-badge"]'),
    ).toBeNull();
  });

  it('omits main-panel dots by default and shows via showDots', () => {
    const { rerender } = render(<ChartLineTsne series={THREE} />);
    expect(
      document.querySelectorAll('[data-section="chart-line-tsne-dot"]')
        .length,
    ).toBe(0);
    rerender(<ChartLineTsne series={THREE} showDots={true} />);
    expect(
      document.querySelectorAll('[data-section="chart-line-tsne-dot"]')
        .length,
    ).toBe(15);
  });

  it('ARIA: region + img + sr-only desc', () => {
    render(<ChartLineTsne series={THREE} />);
    const root = document.querySelector('[data-section="chart-line-tsne"]');
    expect(root!.getAttribute('role')).toBe('region');
    const svg = document.querySelector(
      '[data-section="chart-line-tsne-svg"]',
    );
    expect(svg!.getAttribute('role')).toBe('img');
    const desc = document.querySelector(
      '[data-section="chart-line-tsne-aria-desc"]',
    );
    expect(desc).not.toBeNull();
    expect(desc!.textContent).toContain('PCA embedding');
  });

  it('root carries data-* attributes', () => {
    render(<ChartLineTsne series={THREE} />);
    const root = document.querySelector('[data-section="chart-line-tsne"]');
    expect(root!.getAttribute('data-channel-count')).toBe('3');
    expect(root!.getAttribute('data-sample-count')).toBe('5');
    expect(root!.getAttribute('data-pca-ok')).toBe('true');
    expect(root!.getAttribute('data-explained-variance')).toBe('100');
    expect(Number(root!.getAttribute('data-total-points'))).toBe(15);
  });

  it('embedding point carries e1 / e2 data attributes', () => {
    render(<ChartLineTsne series={THREE} />);
    const point = document.querySelector(
      '[data-section="chart-line-tsne-embedding-point"]',
    );
    expect(point).not.toBeNull();
    expect(point!.getAttribute('data-e1')).not.toBeNull();
    expect(point!.getAttribute('data-e2')).not.toBeNull();
  });

  it('tooltip appears on a main-panel dot with x + y rows', () => {
    render(<ChartLineTsne series={THREE} showDots={true} />);
    const dot = document.querySelector(
      '[data-section="chart-line-tsne-dot"]',
    );
    fireEvent.mouseEnter(dot!);
    const tip = document.querySelector(
      '[data-section="chart-line-tsne-tooltip"]',
    );
    expect(tip).not.toBeNull();
    expect(tip!.getAttribute('data-tooltip-kind')).toBe('series');
    expect(
      document.querySelector('[data-section="chart-line-tsne-tooltip-x"]'),
    ).not.toBeNull();
    expect(
      document.querySelector('[data-section="chart-line-tsne-tooltip-y"]'),
    ).not.toBeNull();
    fireEvent.mouseLeave(dot!);
    expect(
      document.querySelector('[data-section="chart-line-tsne-tooltip"]'),
    ).toBeNull();
  });

  it('tooltip appears on an embedding point with PC1 + PC2 rows', () => {
    render(<ChartLineTsne series={THREE} />);
    const point = document.querySelector(
      '[data-section="chart-line-tsne-embedding-point"]',
    );
    fireEvent.mouseEnter(point!);
    const tip = document.querySelector(
      '[data-section="chart-line-tsne-tooltip"]',
    );
    expect(tip).not.toBeNull();
    expect(tip!.getAttribute('data-tooltip-kind')).toBe('embedding');
    expect(
      document.querySelector('[data-section="chart-line-tsne-tooltip-pc1"]'),
    ).not.toBeNull();
    expect(
      document.querySelector('[data-section="chart-line-tsne-tooltip-pc2"]'),
    ).not.toBeNull();
  });

  it('omits tooltip when showTooltip=false', () => {
    render(
      <ChartLineTsne series={THREE} showDots={true} showTooltip={false} />,
    );
    const dot = document.querySelector(
      '[data-section="chart-line-tsne-dot"]',
    );
    fireEvent.mouseEnter(dot!);
    expect(
      document.querySelector('[data-section="chart-line-tsne-tooltip"]'),
    ).toBeNull();
  });

  it('onPointClick fires for a main-panel dot', () => {
    let captured: { channelId: string; pointIndex: number } | null = null;
    render(
      <ChartLineTsne
        series={THREE}
        showDots={true}
        onPointClick={({ channel, point }) => {
          captured = { channelId: channel.id, pointIndex: point.index };
        }}
      />,
    );
    const dot = document.querySelector(
      '[data-section="chart-line-tsne-dot"]',
    );
    fireEvent.click(dot!);
    expect(captured).not.toBeNull();
    expect(captured!.channelId).toBe('a');
  });

  it('onEmbeddingPointClick fires for an embedding point', () => {
    let capturedIndex: number | null = null;
    render(
      <ChartLineTsne
        series={THREE}
        onEmbeddingPointClick={({ point }) => {
          capturedIndex = point.index;
        }}
      />,
    );
    const point = document.querySelector(
      '[data-section="chart-line-tsne-embedding-point"]',
    );
    fireEvent.click(point!);
    expect(capturedIndex).not.toBeNull();
    expect(capturedIndex).toBe(0);
  });

  it('legend lists each channel and embedding stats', () => {
    render(<ChartLineTsne series={THREE} />);
    const items = document.querySelectorAll(
      '[data-section="chart-line-tsne-legend-item"]',
    );
    expect(items.length).toBe(3);
    const stats = document.querySelector(
      '[data-section="chart-line-tsne-legend-stats"]',
    );
    expect(stats!.textContent).toContain('2D PCA embedding');
  });

  it('omits legend when showLegend=false', () => {
    render(<ChartLineTsne series={THREE} showLegend={false} />);
    expect(
      document.querySelector('[data-section="chart-line-tsne-legend"]'),
    ).toBeNull();
  });

  it('single-channel series renders the main panel with no embedding', () => {
    render(<ChartLineTsne series={[ch('a', 'A', [1, 2, 3])]} />);
    const root = document.querySelector('[data-section="chart-line-tsne"]');
    expect(root!.getAttribute('data-empty')).toBe('false');
    expect(root!.getAttribute('data-pca-ok')).toBe('false');
    expect(
      document.querySelectorAll('[data-section="chart-line-tsne-path"]')
        .length,
    ).toBe(1);
    expect(
      document.querySelector(
        '[data-section="chart-line-tsne-embedding-point"]',
      ),
    ).toBeNull();
  });

  it('animate flag toggles data-animate + class', () => {
    const { rerender } = render(
      <ChartLineTsne series={THREE} animate={true} />,
    );
    const root = document.querySelector('[data-section="chart-line-tsne"]');
    expect(root!.getAttribute('data-animate')).toBe('true');
    expect(root!.className).toContain('motion-safe:animate-fade-in');
    rerender(<ChartLineTsne series={THREE} animate={false} />);
    const root2 = document.querySelector('[data-section="chart-line-tsne"]');
    expect(root2!.getAttribute('data-animate')).toBe('false');
    expect(root2!.className).not.toContain('motion-safe:animate-fade-in');
  });

  it('ref forwarding', () => {
    const ref = createRef<HTMLDivElement>();
    render(<ChartLineTsne ref={ref} series={THREE} />);
    expect(ref.current).not.toBeNull();
    expect(ref.current!.getAttribute('data-section')).toBe(
      'chart-line-tsne',
    );
  });

  it('has displayName', () => {
    expect(ChartLineTsne.displayName).toBe('ChartLineTsne');
  });

  it('custom ariaLabel applied to root and svg', () => {
    render(<ChartLineTsne series={THREE} ariaLabel="Custom embedding" />);
    const root = document.querySelector('[data-section="chart-line-tsne"]');
    expect(root!.getAttribute('aria-label')).toBe('Custom embedding');
    const svg = document.querySelector(
      '[data-section="chart-line-tsne-svg"]',
    );
    expect(svg!.getAttribute('aria-label')).toBe('Custom embedding');
  });

  it('xLabel and yLabel render axis text', () => {
    render(<ChartLineTsne series={THREE} xLabel="time" yLabel="value" />);
    expect(screen.getByText('time').getAttribute('data-section')).toBe(
      'chart-line-tsne-x-label',
    );
    expect(screen.getByText('value').getAttribute('data-section')).toBe(
      'chart-line-tsne-y-label',
    );
  });
});
