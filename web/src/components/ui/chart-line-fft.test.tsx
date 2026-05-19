import { fireEvent, render, screen, within } from '@testing-library/react';
import { createRef } from 'react';
import { describe, expect, it, vi } from 'vitest';

import {
  ChartLineFft,
  DEFAULT_CHART_LINE_FFT_DOMINANT_COLOR,
  DEFAULT_CHART_LINE_FFT_HEIGHT,
  DEFAULT_CHART_LINE_FFT_PALETTE,
  DEFAULT_CHART_LINE_FFT_WIDTH,
  computeLineFftDft,
  computeLineFftLayout,
  computeLineFftSpectrum,
  describeLineFftChart,
  detrendLineFftValues,
  findLineFftDominantBin,
  getLineFftDefaultColor,
  getLineFftFinitePoints,
  normaliseLineFftPanelRatio,
  type ChartLineFftSeries,
} from './chart-line-fft';

// Synthetic series: pure cosine with period 4 over 16 samples
// y[n] = cos(2*pi*n/4); n=0..15 -> period 4 ↔ frequency 0.25 cycles per
// sample
const cosineData = Array.from({ length: 16 }, (_, n) => ({
  x: n,
  y: Math.cos((2 * Math.PI * n) / 4),
}));

const cosineSeries: ChartLineFftSeries = {
  id: 'cos',
  label: 'Cosine',
  data: cosineData,
};

// Two-tone: cos(2*pi*n/8) + 0.5*cos(2*pi*n/4); periods 8 and 4
const twoTone: ChartLineFftSeries = {
  id: 'two',
  label: 'TwoTone',
  data: Array.from({ length: 16 }, (_, n) => ({
    x: n,
    y:
      Math.cos((2 * Math.PI * n) / 8) +
      0.5 * Math.cos((2 * Math.PI * n) / 4),
  })),
};

describe('chart-line-fft: defaults', () => {
  it('positive width / height', () => {
    expect(DEFAULT_CHART_LINE_FFT_WIDTH).toBeGreaterThan(0);
    expect(DEFAULT_CHART_LINE_FFT_HEIGHT).toBeGreaterThan(0);
  });

  it('dominant color is set', () => {
    expect(DEFAULT_CHART_LINE_FFT_DOMINANT_COLOR).toMatch(/#/);
  });

  it('10-color palette', () => {
    expect(DEFAULT_CHART_LINE_FFT_PALETTE.length).toBe(10);
  });
});

describe('getLineFftDefaultColor', () => {
  it('cycles', () => {
    expect(getLineFftDefaultColor(0)).toBe(DEFAULT_CHART_LINE_FFT_PALETTE[0]);
    expect(getLineFftDefaultColor(10)).toBe(DEFAULT_CHART_LINE_FFT_PALETTE[0]);
  });

  it('falls back for NaN / negative', () => {
    expect(getLineFftDefaultColor(Number.NaN)).toBe(
      DEFAULT_CHART_LINE_FFT_PALETTE[0],
    );
    expect(getLineFftDefaultColor(-3)).toBe(
      DEFAULT_CHART_LINE_FFT_PALETTE[0],
    );
  });
});

describe('getLineFftFinitePoints', () => {
  it('drops non-finite', () => {
    const f = getLineFftFinitePoints([
      { x: 0, y: 0 },
      { x: Number.NaN, y: 1 },
      { x: 2, y: 3 },
    ]);
    expect(f).toHaveLength(2);
  });

  it('returns [] for null', () => {
    expect(getLineFftFinitePoints(null)).toEqual([]);
  });
});

describe('normaliseLineFftPanelRatio', () => {
  it('clamps below to 0.1', () => {
    expect(normaliseLineFftPanelRatio(0)).toBe(0.1);
    expect(normaliseLineFftPanelRatio(-1)).toBe(0.1);
  });

  it('clamps above to 0.9', () => {
    expect(normaliseLineFftPanelRatio(1)).toBe(0.9);
    expect(normaliseLineFftPanelRatio(2)).toBe(0.9);
  });

  it('identity for in-range', () => {
    expect(normaliseLineFftPanelRatio(0.4)).toBe(0.4);
  });

  it('default for non-finite', () => {
    expect(normaliseLineFftPanelRatio(Number.NaN)).toBeGreaterThan(0);
  });
});

describe('detrendLineFftValues', () => {
  it('returns empty for null', () => {
    expect(detrendLineFftValues(null).detrended).toEqual([]);
  });

  it('subtracts mean from values', () => {
    const { detrended, mean } = detrendLineFftValues([1, 2, 3, 4, 5]);
    expect(mean).toBe(3);
    expect(detrended).toEqual([-2, -1, 0, 1, 2]);
  });

  it('skips non-finite when computing mean', () => {
    const { mean } = detrendLineFftValues([1, Number.NaN, 3]);
    expect(mean).toBe(2);
  });
});

describe('computeLineFftDft', () => {
  it('returns [] for empty / null', () => {
    expect(computeLineFftDft(null)).toEqual([]);
    expect(computeLineFftDft([])).toEqual([]);
  });

  it('DC bin equals sum of values', () => {
    const dft = computeLineFftDft([1, 2, 3, 4]);
    expect(dft[0]?.real).toBe(10);
    expect(dft[0]?.imag).toBe(0);
  });

  it('cosine signal concentrates magnitude at expected bin', () => {
    // y[n] = cos(2*pi*n/4) for n=0..15
    // Period 4 -> frequency 0.25 cycles/sample -> bin k where k/N = 0.25
    // with N=16, k = 4
    const ys = cosineData.map((p) => p.y);
    const dft = computeLineFftDft(ys);
    const mags = dft.map((c) => Math.sqrt(c.real ** 2 + c.imag ** 2));
    // strongest bin (after DC if present) is at k=4
    let maxK = 0;
    let maxMag = -Infinity;
    for (let k = 1; k < mags.length; k += 1) {
      if (mags[k]! > maxMag) {
        maxK = k;
        maxMag = mags[k]!;
      }
    }
    expect(maxK).toBe(4);
  });

  it('returns N/2+1 bins for input of length N', () => {
    const dft = computeLineFftDft(cosineData.map((p) => p.y));
    expect(dft.length).toBe(16 / 2 + 1);
  });
});

describe('computeLineFftSpectrum', () => {
  it('returns empty for less than 2 points', () => {
    const spectrum = computeLineFftSpectrum([]);
    expect(spectrum.bins).toEqual([]);
    expect(spectrum.dominantBin).toBeNull();
  });

  it('detects period-4 cosine with frequency 0.25', () => {
    const spectrum = computeLineFftSpectrum(cosineData, {
      detrend: true,
      excludeDc: true,
    });
    expect(spectrum.dominantBin?.frequency).toBeCloseTo(0.25, 5);
    expect(spectrum.dominantBin?.period).toBeCloseTo(4, 5);
  });

  it('detrend default is true', () => {
    const spectrum = computeLineFftSpectrum(cosineData);
    expect(spectrum.detrended).toBe(true);
  });

  it('excludeDc default is true and skips bin 0', () => {
    const spectrum = computeLineFftSpectrum(cosineData);
    expect(spectrum.excludedDc).toBe(true);
    expect(spectrum.dominantBin?.k).not.toBe(0);
  });

  it('two-tone signal picks the larger amplitude (period 8)', () => {
    // y = 1.0 * cos(2*pi*n/8) + 0.5 * cos(2*pi*n/4)
    // expect dominant period = 8 (frequency 0.125)
    const spectrum = computeLineFftSpectrum(twoTone.data);
    expect(spectrum.dominantBin?.period).toBeCloseTo(8, 5);
  });

  it('normalisedMagnitude maxes at 1.0', () => {
    const spectrum = computeLineFftSpectrum(cosineData);
    const maxNorm = Math.max(
      ...spectrum.bins.map((b) => b.normalisedMagnitude),
    );
    expect(maxNorm).toBeCloseTo(1, 5);
  });

  it('sorts ascending by x before processing', () => {
    const shuffled = [...cosineData].sort(() => -1);
    const spectrum = computeLineFftSpectrum(shuffled);
    expect(spectrum.dominantBin?.period).toBeCloseTo(4, 5);
  });

  it('drops non-finite', () => {
    const withNan = [...cosineData];
    withNan.splice(3, 1, { x: 3, y: Number.NaN });
    const spectrum = computeLineFftSpectrum(withNan);
    expect(spectrum.totalSamples).toBe(15);
  });

  it('records meanValue', () => {
    const spectrum = computeLineFftSpectrum(
      [
        { x: 0, y: 1 },
        { x: 1, y: 3 },
      ],
      { detrend: false },
    );
    expect(spectrum.meanValue).toBe(2);
  });
});

describe('findLineFftDominantBin', () => {
  it('returns null for empty', () => {
    expect(findLineFftDominantBin([])).toBeNull();
    expect(findLineFftDominantBin(null)).toBeNull();
  });

  it('excludes DC by default', () => {
    const bins = [
      { k: 0, frequency: 0, period: Infinity, real: 100, imag: 0, magnitude: 100, normalisedMagnitude: 1 },
      { k: 1, frequency: 0.1, period: 10, real: 5, imag: 0, magnitude: 5, normalisedMagnitude: 0.05 },
    ];
    const dom = findLineFftDominantBin(bins);
    expect(dom?.k).toBe(1);
  });

  it('includes DC when excludeDc=false', () => {
    const bins = [
      { k: 0, frequency: 0, period: Infinity, real: 100, imag: 0, magnitude: 100, normalisedMagnitude: 1 },
      { k: 1, frequency: 0.1, period: 10, real: 5, imag: 0, magnitude: 5, normalisedMagnitude: 0.05 },
    ];
    const dom = findLineFftDominantBin(bins, false);
    expect(dom?.k).toBe(0);
  });
});

describe('computeLineFftLayout', () => {
  it('returns empty for empty series', () => {
    const layout = computeLineFftLayout({
      series: [],
      width: 720,
      height: 320,
      padding: 40,
    });
    expect(layout.series).toEqual([]);
  });

  it('returns empty for degenerate canvas', () => {
    const layout = computeLineFftLayout({
      series: [cosineSeries],
      width: 80,
      height: 80,
      padding: 40,
    });
    expect(layout.series).toEqual([]);
  });

  it('splits canvas into time and spectrum panels', () => {
    const layout = computeLineFftLayout({
      series: [cosineSeries],
      width: 720,
      height: 320,
      padding: 40,
    });
    expect(layout.timePanel.width).toBeGreaterThan(0);
    expect(layout.spectrumPanel.width).toBeGreaterThan(0);
    expect(layout.spectrumPanel.x).toBeGreaterThan(
      layout.timePanel.x + layout.timePanel.width,
    );
  });

  it('builds time path and spectrum bins per series', () => {
    const layout = computeLineFftLayout({
      series: [cosineSeries],
      width: 720,
      height: 320,
      padding: 40,
    });
    expect(layout.series).toHaveLength(1);
    const s = layout.series[0]!;
    expect(s.timePath.length).toBeGreaterThan(0);
    expect(s.spectrumBins.length).toBeGreaterThan(0);
    expect(s.timePoints).toHaveLength(16);
  });

  it('marks dominant bin', () => {
    const layout = computeLineFftLayout({
      series: [cosineSeries],
      width: 720,
      height: 320,
      padding: 40,
    });
    const dominant = layout.series[0]!.spectrumBins.find((b) => b.isDominant);
    expect(dominant?.k).toBe(4);
  });

  it('records dominantFrequency / Period / Magnitude per series', () => {
    const layout = computeLineFftLayout({
      series: [cosineSeries],
      width: 720,
      height: 320,
      padding: 40,
    });
    expect(layout.series[0]?.dominantFrequency).toBeCloseTo(0.25, 5);
    expect(layout.series[0]?.dominantPeriod).toBeCloseTo(4, 5);
    expect(layout.series[0]?.dominantMagnitude).toBeGreaterThan(0);
  });

  it('drops hidden series', () => {
    const layout = computeLineFftLayout({
      series: [cosineSeries, twoTone],
      hiddenSeries: ['two'],
      width: 720,
      height: 320,
      padding: 40,
    });
    expect(layout.series).toHaveLength(1);
    expect(layout.series[0]?.id).toBe('cos');
  });

  it('honors bounds overrides for time panel', () => {
    const layout = computeLineFftLayout({
      series: [cosineSeries],
      width: 720,
      height: 320,
      padding: 40,
      yMin: -5,
      yMax: 5,
    });
    expect(layout.yMin).toBe(-5);
    expect(layout.yMax).toBe(5);
  });

  it('per-series detrend override beats chart-level', () => {
    const layout = computeLineFftLayout({
      series: [{ ...cosineSeries, detrend: false }],
      width: 720,
      height: 320,
      padding: 40,
      detrend: true,
    });
    expect(layout.series[0]?.detrend).toBe(false);
  });

  it('per-series excludeDc override beats chart-level', () => {
    const layout = computeLineFftLayout({
      series: [{ ...cosineSeries, excludeDc: false }],
      width: 720,
      height: 320,
      padding: 40,
      excludeDc: true,
    });
    expect(layout.series[0]?.excludeDc).toBe(false);
  });

  it('totalPoints + visibleSeriesCount', () => {
    const layout = computeLineFftLayout({
      series: [cosineSeries, twoTone],
      width: 720,
      height: 320,
      padding: 40,
    });
    expect(layout.visibleSeriesCount).toBe(2);
    expect(layout.totalPoints).toBe(16 + 16);
  });

  it('spectrum bins carry projected px + py + bar geometry', () => {
    const layout = computeLineFftLayout({
      series: [cosineSeries],
      width: 720,
      height: 320,
      padding: 40,
    });
    const b = layout.series[0]!.spectrumBins[0]!;
    expect(b.px).toBeGreaterThan(layout.spectrumPanel.x);
    expect(b.barX).toBeLessThan(b.px);
    expect(b.barWidth).toBeGreaterThan(0);
    expect(b.barHeight).toBeGreaterThanOrEqual(0);
  });
});

describe('describeLineFftChart', () => {
  it('returns No data for empty', () => {
    expect(describeLineFftChart([])).toBe('No data');
    expect(describeLineFftChart(null)).toBe('No data');
  });

  it('describes dominant frequency and period', () => {
    const desc = describeLineFftChart([cosineSeries]);
    expect(desc).toMatch(/dominant frequency/);
    expect(desc).toMatch(/period/);
  });
});

describe('<ChartLineFft> render', () => {
  it('renders empty when no series', () => {
    const { container } = render(<ChartLineFft series={[]} />);
    const root = container.querySelector(
      '[data-section="chart-line-fft"]',
    );
    expect(root?.getAttribute('data-empty')).toBe('true');
  });

  it('renders time path with kind=time', () => {
    render(<ChartLineFft series={[cosineSeries]} />);
    const path = document.querySelector(
      '[data-section="chart-line-fft-time-path"]',
    );
    expect(path?.getAttribute('data-kind')).toBe('time');
  });

  it('renders spectrum bin bars by default (spectrumAsBars=true)', () => {
    render(<ChartLineFft series={[cosineSeries]} />);
    const bars = document.querySelectorAll(
      '[data-section="chart-line-fft-bin-bar"]',
    );
    expect(bars.length).toBeGreaterThan(0);
  });

  it('renders spectrum bin dots when spectrumAsBars=false', () => {
    render(<ChartLineFft series={[cosineSeries]} spectrumAsBars={false} />);
    const dots = document.querySelectorAll(
      '[data-section="chart-line-fft-bin-dot"]',
    );
    expect(dots.length).toBeGreaterThan(0);
    const path = document.querySelector(
      '[data-section="chart-line-fft-spectrum-path"]',
    );
    expect(path).not.toBeNull();
  });

  it('hides spectrum via showSpectrum=false', () => {
    render(<ChartLineFft series={[cosineSeries]} showSpectrum={false} />);
    expect(
      document.querySelectorAll(
        '[data-section="chart-line-fft-bin-bar"]',
      ).length,
    ).toBe(0);
  });

  it('dominant bin carries data-dominant=true', () => {
    render(<ChartLineFft series={[cosineSeries]} />);
    const dominantBars = document.querySelectorAll(
      '[data-section="chart-line-fft-bin-bar"][data-dominant="true"]',
    );
    expect(dominantBars.length).toBe(1);
  });

  it('time-domain dots present by default', () => {
    render(<ChartLineFft series={[cosineSeries]} />);
    const dots = document.querySelectorAll(
      '[data-section="chart-line-fft-time-dot"]',
    );
    expect(dots.length).toBe(16);
  });

  it('hides time dots via showDots=false', () => {
    render(<ChartLineFft series={[cosineSeries]} showDots={false} />);
    expect(
      document.querySelectorAll('[data-section="chart-line-fft-time-dot"]')
        .length,
    ).toBe(0);
  });

  it('renders dominant badge with frequency + period', () => {
    render(<ChartLineFft series={[cosineSeries]} />);
    const badge = document.querySelector(
      '[data-section="chart-line-fft-badge"]',
    );
    expect(Number(badge?.getAttribute('data-frequency'))).toBeCloseTo(0.25, 5);
    expect(Number(badge?.getAttribute('data-period'))).toBeCloseTo(4, 5);
  });

  it('hides badge via showDominantBadge=false', () => {
    render(<ChartLineFft series={[cosineSeries]} showDominantBadge={false} />);
    expect(
      document.querySelector('[data-section="chart-line-fft-badge"]'),
    ).toBeNull();
  });

  it('region+img ARIA', () => {
    render(<ChartLineFft series={[cosineSeries]} ariaLabel="fft" />);
    const region = screen.getByRole('region', { name: 'fft' });
    const img = within(region).getByRole('img', { name: 'fft' });
    expect(img.tagName.toLowerCase()).toBe('svg');
  });

  it('mirrors root data-*', () => {
    render(<ChartLineFft series={[cosineSeries]} />);
    const root = document.querySelector('[data-section="chart-line-fft"]');
    expect(root?.getAttribute('data-series-count')).toBe('1');
    expect(root?.getAttribute('data-total-points')).toBe('16');
    expect(root?.getAttribute('data-detrend')).toBe('true');
    expect(root?.getAttribute('data-exclude-dc')).toBe('true');
    expect(
      Number(root?.getAttribute('data-dominant-frequency')),
    ).toBeCloseTo(0.25, 5);
  });

  it('mirrors per-series dominant stats on group', () => {
    render(<ChartLineFft series={[cosineSeries]} />);
    const group = document.querySelector(
      '[data-section="chart-line-fft-series-group"]',
    );
    expect(
      Number(group?.getAttribute('data-series-dominant-frequency')),
    ).toBeCloseTo(0.25, 5);
    expect(
      Number(group?.getAttribute('data-series-dominant-period')),
    ).toBeCloseTo(4, 5);
  });

  it('tooltip on time dot shows x + y', () => {
    render(<ChartLineFft series={[cosineSeries]} />);
    const dot = document.querySelector(
      '[data-section="chart-line-fft-time-dot"][data-point-index="3"]',
    ) as HTMLElement;
    fireEvent.mouseEnter(dot);
    const x = document.querySelector(
      '[data-section="chart-line-fft-tooltip-x"]',
    );
    const y = document.querySelector(
      '[data-section="chart-line-fft-tooltip-y"]',
    );
    expect(x?.textContent).toMatch(/x:/);
    expect(y?.textContent).toMatch(/y:/);
  });

  it('tooltip on bin bar shows frequency + period + magnitude', () => {
    render(<ChartLineFft series={[cosineSeries]} />);
    const bar = document.querySelector(
      '[data-section="chart-line-fft-bin-bar"][data-dominant="true"]',
    ) as HTMLElement;
    fireEvent.mouseEnter(bar);
    const f = document.querySelector(
      '[data-section="chart-line-fft-tooltip-frequency"]',
    );
    const t = document.querySelector(
      '[data-section="chart-line-fft-tooltip-period"]',
    );
    const m = document.querySelector(
      '[data-section="chart-line-fft-tooltip-magnitude"]',
    );
    const dom = document.querySelector(
      '[data-section="chart-line-fft-tooltip-dominant"]',
    );
    expect(f?.textContent).toMatch(/f:/);
    expect(t?.textContent).toMatch(/T:/);
    expect(m?.textContent).toMatch(/\|X\|:/);
    expect(dom).not.toBeNull();
  });

  it('hides tooltip on leave', () => {
    render(<ChartLineFft series={[cosineSeries]} />);
    const bar = document.querySelector(
      '[data-section="chart-line-fft-bin-bar"][data-dominant="true"]',
    ) as HTMLElement;
    fireEvent.mouseEnter(bar);
    fireEvent.mouseLeave(bar);
    expect(
      document.querySelector('[data-section="chart-line-fft-tooltip"]'),
    ).toBeNull();
  });

  it('omits tooltip via showTooltip=false', () => {
    render(<ChartLineFft series={[cosineSeries]} showTooltip={false} />);
    const bar = document.querySelector(
      '[data-section="chart-line-fft-bin-bar"][data-dominant="true"]',
    ) as HTMLElement;
    fireEvent.mouseEnter(bar);
    expect(
      document.querySelector('[data-section="chart-line-fft-tooltip"]'),
    ).toBeNull();
  });

  it('fires onPointClick for time dots', () => {
    const onPointClick = vi.fn();
    render(<ChartLineFft series={[cosineSeries]} onPointClick={onPointClick} />);
    const dot = document.querySelector(
      '[data-section="chart-line-fft-time-dot"][data-point-index="2"]',
    ) as HTMLElement;
    fireEvent.click(dot);
    expect(onPointClick).toHaveBeenCalledTimes(1);
  });

  it('fires onBinClick for spectrum bars', () => {
    const onBinClick = vi.fn();
    render(<ChartLineFft series={[cosineSeries]} onBinClick={onBinClick} />);
    const bar = document.querySelector(
      '[data-section="chart-line-fft-bin-bar"][data-dominant="true"]',
    ) as HTMLElement;
    fireEvent.click(bar);
    expect(onBinClick).toHaveBeenCalledTimes(1);
  });

  it('legend shows dominant frequency + period', () => {
    render(<ChartLineFft series={[cosineSeries]} />);
    const stats = document.querySelector(
      '[data-section="chart-line-fft-legend-stats"]',
    );
    expect(stats?.textContent).toMatch(/f=/);
    expect(stats?.textContent).toMatch(/T=/);
  });

  it('toggles visibility via legend', () => {
    const onToggle = vi.fn();
    render(<ChartLineFft series={[cosineSeries]} onSeriesToggle={onToggle} />);
    const item = document.querySelector(
      '[data-section="chart-line-fft-legend-item"]',
    ) as HTMLElement;
    fireEvent.click(item);
    expect(onToggle).toHaveBeenCalledWith({
      series: cosineSeries,
      hidden: true,
    });
  });

  it('omits legend via showLegend=false', () => {
    render(<ChartLineFft series={[cosineSeries]} showLegend={false} />);
    expect(
      document.querySelector('[data-section="chart-line-fft-legend"]'),
    ).toBeNull();
  });

  it('applies animate class', () => {
    const { container } = render(<ChartLineFft series={[cosineSeries]} animate />);
    const root = container.querySelector('[data-section="chart-line-fft"]');
    expect(root?.className).toMatch(/animate-fade-in/);
  });

  it('omits animate class when animate=false', () => {
    const { container } = render(
      <ChartLineFft series={[cosineSeries]} animate={false} />,
    );
    const root = container.querySelector('[data-section="chart-line-fft"]');
    expect(root?.className ?? '').not.toMatch(/animate-fade-in/);
  });

  it('forwards ref', () => {
    const ref = createRef<HTMLDivElement>();
    render(<ChartLineFft ref={ref} series={[cosineSeries]} />);
    expect(ref.current).not.toBeNull();
  });

  it('has stable displayName', () => {
    expect(ChartLineFft.displayName).toBe('ChartLineFft');
  });
});
