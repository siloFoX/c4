import { fireEvent, render, screen, within } from '@testing-library/react';
import { createRef } from 'react';
import { describe, expect, it, vi } from 'vitest';

import {
  ChartLineFftWindow,
  DEFAULT_CHART_LINE_FFT_WINDOW_DOMINANT_COLOR,
  DEFAULT_CHART_LINE_FFT_WINDOW_HEIGHT,
  DEFAULT_CHART_LINE_FFT_WINDOW_PALETTE,
  DEFAULT_CHART_LINE_FFT_WINDOW_WIDTH,
  LINE_FFT_WINDOW_MODES,
  applyLineFftWindowToValues,
  computeLineFftWindowCoefficients,
  computeLineFftWindowDft,
  computeLineFftWindowLayout,
  computeLineFftWindowSpectrum,
  describeLineFftWindowChart,
  findLineFftWindowDominantBin,
  getLineFftWindowDefaultColor,
  getLineFftWindowFinitePoints,
  normaliseLineFftWindowMode,
  normaliseLineFftWindowPanelRatio,
  type ChartLineFftWindowSeries,
} from './chart-line-fft-window';

// Pure cosine with period 4 over 16 samples
const cosineData = Array.from({ length: 16 }, (_, n) => ({
  x: n,
  y: Math.cos((2 * Math.PI * n) / 4),
}));

const cosineSeries: ChartLineFftWindowSeries = {
  id: 'cos',
  label: 'Cosine',
  data: cosineData,
};

const twoTone: ChartLineFftWindowSeries = {
  id: 'two',
  label: 'TwoTone',
  data: Array.from({ length: 16 }, (_, n) => ({
    x: n,
    y:
      Math.cos((2 * Math.PI * n) / 8) +
      0.5 * Math.cos((2 * Math.PI * n) / 4),
  })),
};

describe('chart-line-fft-window: defaults', () => {
  it('positive width / height', () => {
    expect(DEFAULT_CHART_LINE_FFT_WINDOW_WIDTH).toBeGreaterThan(0);
    expect(DEFAULT_CHART_LINE_FFT_WINDOW_HEIGHT).toBeGreaterThan(0);
  });

  it('dominant color set', () => {
    expect(DEFAULT_CHART_LINE_FFT_WINDOW_DOMINANT_COLOR).toMatch(/#/);
  });

  it('10-color palette', () => {
    expect(DEFAULT_CHART_LINE_FFT_WINDOW_PALETTE.length).toBe(10);
  });

  it('exports 4 canonical window modes', () => {
    expect(LINE_FFT_WINDOW_MODES).toEqual([
      'rectangular',
      'hann',
      'hamming',
      'blackman',
    ]);
  });
});

describe('getLineFftWindowDefaultColor', () => {
  it('cycles', () => {
    expect(getLineFftWindowDefaultColor(0)).toBe(
      DEFAULT_CHART_LINE_FFT_WINDOW_PALETTE[0],
    );
    expect(getLineFftWindowDefaultColor(10)).toBe(
      DEFAULT_CHART_LINE_FFT_WINDOW_PALETTE[0],
    );
  });

  it('falls back for NaN / negative', () => {
    expect(getLineFftWindowDefaultColor(Number.NaN)).toBe(
      DEFAULT_CHART_LINE_FFT_WINDOW_PALETTE[0],
    );
    expect(getLineFftWindowDefaultColor(-3)).toBe(
      DEFAULT_CHART_LINE_FFT_WINDOW_PALETTE[0],
    );
  });
});

describe('getLineFftWindowFinitePoints', () => {
  it('drops non-finite', () => {
    const f = getLineFftWindowFinitePoints([
      { x: 0, y: 0 },
      { x: Number.NaN, y: 1 },
      { x: 2, y: 3 },
    ]);
    expect(f).toHaveLength(2);
  });

  it('returns [] for null', () => {
    expect(getLineFftWindowFinitePoints(null)).toEqual([]);
  });
});

describe('normaliseLineFftWindowPanelRatio', () => {
  it('clamps to [0.1, 0.9]', () => {
    expect(normaliseLineFftWindowPanelRatio(0)).toBe(0.1);
    expect(normaliseLineFftWindowPanelRatio(2)).toBe(0.9);
  });

  it('identity for in-range', () => {
    expect(normaliseLineFftWindowPanelRatio(0.5)).toBe(0.5);
  });

  it('default for non-finite', () => {
    expect(normaliseLineFftWindowPanelRatio(Number.NaN)).toBeGreaterThan(0);
  });
});

describe('normaliseLineFftWindowMode', () => {
  it('default is hann', () => {
    expect(normaliseLineFftWindowMode('invalid')).toBe('hann');
    expect(normaliseLineFftWindowMode(null)).toBe('hann');
  });

  it('identity for valid mode', () => {
    for (const m of LINE_FFT_WINDOW_MODES) {
      expect(normaliseLineFftWindowMode(m)).toBe(m);
    }
  });
});

describe('computeLineFftWindowCoefficients', () => {
  it('returns [] for non-positive N', () => {
    expect(computeLineFftWindowCoefficients(0)).toEqual([]);
    expect(computeLineFftWindowCoefficients(Number.NaN)).toEqual([]);
  });

  it('rectangular window is all 1s', () => {
    const w = computeLineFftWindowCoefficients(8, 'rectangular');
    expect(w.every((v) => v === 1)).toBe(true);
  });

  it('Hann window: endpoints are exactly 0', () => {
    const w = computeLineFftWindowCoefficients(16, 'hann');
    expect(w[0]).toBeCloseTo(0, 5);
    expect(w[w.length - 1]).toBeCloseTo(0, 5);
  });

  it('Hann window: middle is exactly 1', () => {
    // For even N=16 the centre between index 7 and 8 is exactly 1.
    // For odd N the exact-1 point lands on the middle index.
    const w = computeLineFftWindowCoefficients(15, 'hann');
    expect(w[7]).toBeCloseTo(1, 5);
  });

  it('Hann window symmetry', () => {
    const w = computeLineFftWindowCoefficients(17, 'hann');
    for (let i = 0; i < w.length; i += 1) {
      expect(w[i]).toBeCloseTo(w[w.length - 1 - i], 5);
    }
  });

  it('Hamming window: endpoints are 0.08 (1 - 0.46 - 0.54 + 1 = 0.08 -> 0.54 - 0.46*1 = 0.08)', () => {
    const w = computeLineFftWindowCoefficients(16, 'hamming');
    expect(w[0]).toBeCloseTo(0.08, 5);
    expect(w[w.length - 1]).toBeCloseTo(0.08, 5);
  });

  it('Blackman window: endpoints are 0', () => {
    // 0.42 - 0.5*cos(0) + 0.08*cos(0) = 0.42 - 0.5 + 0.08 = 0
    const w = computeLineFftWindowCoefficients(16, 'blackman');
    expect(w[0]).toBeCloseTo(0, 5);
    expect(w[w.length - 1]).toBeCloseTo(0, 5);
  });

  it('Blackman window: centre is 1', () => {
    // 0.42 - 0.5*cos(pi) + 0.08*cos(2*pi) = 0.42 + 0.5 + 0.08 = 1.0
    const w = computeLineFftWindowCoefficients(15, 'blackman');
    expect(w[7]).toBeCloseTo(1, 5);
  });

  it('N=1 returns [1]', () => {
    const w = computeLineFftWindowCoefficients(1, 'hann');
    expect(w).toEqual([1]);
  });
});

describe('applyLineFftWindowToValues', () => {
  it('returns [] for null inputs', () => {
    expect(applyLineFftWindowToValues(null, [1, 2])).toEqual([]);
    expect(applyLineFftWindowToValues([1, 2], null)).toEqual([]);
  });

  it('multiplies values by coefficients element-wise', () => {
    const out = applyLineFftWindowToValues([10, 20, 30], [1, 0.5, 0]);
    expect(out).toEqual([10, 10, 0]);
  });

  it('uses min length of the two arrays', () => {
    const out = applyLineFftWindowToValues([1, 2, 3], [1, 1]);
    expect(out).toHaveLength(2);
  });

  it('emits 0 for non-finite slots', () => {
    const out = applyLineFftWindowToValues([1, Number.NaN, 3], [1, 1, 1]);
    expect(out[1]).toBe(0);
  });
});

describe('computeLineFftWindowDft', () => {
  it('returns [] for empty', () => {
    expect(computeLineFftWindowDft([])).toEqual([]);
  });

  it('DC bin equals sum of windowed values', () => {
    const dft = computeLineFftWindowDft([1, 2, 3, 4]);
    expect(dft[0]?.real).toBe(10);
    expect(dft[0]?.imag).toBe(0);
  });

  it('returns N/2+1 bins', () => {
    const dft = computeLineFftWindowDft([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(dft.length).toBe(5);
  });
});

describe('computeLineFftWindowSpectrum', () => {
  it('returns empty for < 2 points', () => {
    const s = computeLineFftWindowSpectrum([]);
    expect(s.bins).toEqual([]);
    expect(s.dominantBin).toBeNull();
  });

  it('Hann window detects period-4 cosine', () => {
    const spectrum = computeLineFftWindowSpectrum(cosineData, {
      windowMode: 'hann',
    });
    expect(spectrum.dominantBin?.frequency).toBeCloseTo(0.25, 5);
    expect(spectrum.dominantBin?.period).toBeCloseTo(4, 5);
  });

  it('Rectangular window detects period-4 cosine (matches base FFT)', () => {
    const spectrum = computeLineFftWindowSpectrum(cosineData, {
      windowMode: 'rectangular',
    });
    expect(spectrum.dominantBin?.frequency).toBeCloseTo(0.25, 5);
  });

  it('default detrend is true and excludeDc is true', () => {
    const s = computeLineFftWindowSpectrum(cosineData);
    expect(s.detrended).toBe(true);
    expect(s.excludedDc).toBe(true);
  });

  it('reports window coherent gain (Hann ~ 0.5)', () => {
    const s = computeLineFftWindowSpectrum(cosineData, { windowMode: 'hann' });
    // For Hann sum_w/N approaches 0.5 as N grows
    expect(s.windowCoherentGain).toBeGreaterThan(0.4);
    expect(s.windowCoherentGain).toBeLessThan(0.6);
  });

  it('reports window processing gain (Hann ~ 0.375)', () => {
    const s = computeLineFftWindowSpectrum(cosineData, { windowMode: 'hann' });
    expect(s.windowProcessingGain).toBeGreaterThan(0.3);
    expect(s.windowProcessingGain).toBeLessThan(0.45);
  });

  it('rectangular coherent gain is 1', () => {
    const s = computeLineFftWindowSpectrum(cosineData, {
      windowMode: 'rectangular',
    });
    expect(s.windowCoherentGain).toBeCloseTo(1, 5);
    expect(s.windowProcessingGain).toBeCloseTo(1, 5);
  });

  it('two-tone signal picks larger amplitude (period 8) under Hann', () => {
    const s = computeLineFftWindowSpectrum(twoTone.data, {
      windowMode: 'hann',
    });
    expect(s.dominantBin?.period).toBeCloseTo(8, 5);
  });

  it('windowedValues length matches input length', () => {
    const s = computeLineFftWindowSpectrum(cosineData, { windowMode: 'hann' });
    expect(s.windowedValues).toHaveLength(16);
    expect(s.windowCoefficients).toHaveLength(16);
  });

  it('windowedValues = input * window coefficients (verified at sample 0)', () => {
    const s = computeLineFftWindowSpectrum(cosineData, {
      windowMode: 'hann',
      detrend: false,
    });
    // First Hann coefficient is 0 -> windowed[0] = 0
    expect(s.windowedValues[0]).toBeCloseTo(0, 5);
  });

  it('normalisedMagnitude maxes at 1.0', () => {
    const s = computeLineFftWindowSpectrum(cosineData);
    const maxN = Math.max(...s.bins.map((b) => b.normalisedMagnitude));
    expect(maxN).toBeCloseTo(1, 5);
  });

  it('sorts ascending before processing', () => {
    const shuffled = [...cosineData].sort(() => -1);
    const s = computeLineFftWindowSpectrum(shuffled);
    expect(s.dominantBin?.period).toBeCloseTo(4, 5);
  });

  it('drops non-finite', () => {
    const withNan = [...cosineData];
    withNan.splice(3, 1, { x: 3, y: Number.NaN });
    const s = computeLineFftWindowSpectrum(withNan);
    expect(s.totalSamples).toBe(15);
  });
});

describe('findLineFftWindowDominantBin', () => {
  it('returns null for empty', () => {
    expect(findLineFftWindowDominantBin([])).toBeNull();
    expect(findLineFftWindowDominantBin(null)).toBeNull();
  });

  it('excludes DC by default', () => {
    const bins = [
      { k: 0, frequency: 0, period: Infinity, real: 100, imag: 0, magnitude: 100, normalisedMagnitude: 1 },
      { k: 1, frequency: 0.1, period: 10, real: 5, imag: 0, magnitude: 5, normalisedMagnitude: 0.05 },
    ];
    expect(findLineFftWindowDominantBin(bins)?.k).toBe(1);
  });

  it('includes DC when excludeDc=false', () => {
    const bins = [
      { k: 0, frequency: 0, period: Infinity, real: 100, imag: 0, magnitude: 100, normalisedMagnitude: 1 },
      { k: 1, frequency: 0.1, period: 10, real: 5, imag: 0, magnitude: 5, normalisedMagnitude: 0.05 },
    ];
    expect(findLineFftWindowDominantBin(bins, false)?.k).toBe(0);
  });
});

describe('computeLineFftWindowLayout', () => {
  it('returns empty for empty series', () => {
    const layout = computeLineFftWindowLayout({
      series: [],
      width: 720,
      height: 360,
      padding: 40,
    });
    expect(layout.series).toEqual([]);
  });

  it('returns empty for degenerate canvas', () => {
    const layout = computeLineFftWindowLayout({
      series: [cosineSeries],
      width: 80,
      height: 80,
      padding: 40,
    });
    expect(layout.series).toEqual([]);
  });

  it('splits canvas into time + spectrum panels', () => {
    const layout = computeLineFftWindowLayout({
      series: [cosineSeries],
      width: 720,
      height: 360,
      padding: 40,
    });
    expect(layout.timePanel.width).toBeGreaterThan(0);
    expect(layout.spectrumPanel.width).toBeGreaterThan(0);
    expect(layout.spectrumPanel.x).toBeGreaterThan(
      layout.timePanel.x + layout.timePanel.width,
    );
  });

  it('per-series raw + windowed + envelope paths populated', () => {
    const layout = computeLineFftWindowLayout({
      series: [cosineSeries],
      width: 720,
      height: 360,
      padding: 40,
      windowMode: 'hann',
    });
    const s = layout.series[0]!;
    expect(s.rawTimePath.length).toBeGreaterThan(0);
    expect(s.windowedTimePath.length).toBeGreaterThan(0);
    expect(s.windowEnvelopePath.length).toBeGreaterThan(0);
  });

  it('marks dominant bin', () => {
    const layout = computeLineFftWindowLayout({
      series: [cosineSeries],
      width: 720,
      height: 360,
      padding: 40,
    });
    const dom = layout.series[0]!.spectrumBins.find((b) => b.isDominant);
    expect(dom?.k).toBe(4);
  });

  it('records dominant frequency / period / magnitude', () => {
    const layout = computeLineFftWindowLayout({
      series: [cosineSeries],
      width: 720,
      height: 360,
      padding: 40,
    });
    expect(layout.series[0]?.dominantFrequency).toBeCloseTo(0.25, 5);
    expect(layout.series[0]?.dominantPeriod).toBeCloseTo(4, 5);
  });

  it('drops hidden series', () => {
    const layout = computeLineFftWindowLayout({
      series: [cosineSeries, twoTone],
      hiddenSeries: ['two'],
      width: 720,
      height: 360,
      padding: 40,
    });
    expect(layout.series).toHaveLength(1);
    expect(layout.series[0]?.id).toBe('cos');
  });

  it('per-series window override beats chart-level', () => {
    const layout = computeLineFftWindowLayout({
      series: [{ ...cosineSeries, windowMode: 'blackman' }],
      width: 720,
      height: 360,
      padding: 40,
      windowMode: 'hann',
    });
    expect(layout.series[0]?.windowMode).toBe('blackman');
  });

  it('totalPoints + visibleSeriesCount', () => {
    const layout = computeLineFftWindowLayout({
      series: [cosineSeries, twoTone],
      width: 720,
      height: 360,
      padding: 40,
    });
    expect(layout.visibleSeriesCount).toBe(2);
    expect(layout.totalPoints).toBe(16 + 16);
  });

  it('per-point window weight projected to envelope py', () => {
    const layout = computeLineFftWindowLayout({
      series: [cosineSeries],
      width: 720,
      height: 360,
      padding: 40,
      windowMode: 'hann',
    });
    const p = layout.series[0]!.timePoints[0]!;
    // First Hann coefficient is 0 -> envelope at bottom of panel
    expect(p.windowWeight).toBeCloseTo(0, 5);
    expect(p.windowPy).toBeCloseTo(
      layout.timePanel.y + layout.timePanel.height,
      3,
    );
  });
});

describe('describeLineFftWindowChart', () => {
  it('returns No data for empty', () => {
    expect(describeLineFftWindowChart([])).toBe('No data');
    expect(describeLineFftWindowChart(null)).toBe('No data');
  });

  it('describes window mode + coherent gain + dominant', () => {
    const desc = describeLineFftWindowChart([cosineSeries], {
      windowMode: 'hann',
    });
    expect(desc).toMatch(/Hann window/);
    expect(desc).toMatch(/coherent gain/);
    expect(desc).toMatch(/dominant frequency/);
  });
});

describe('<ChartLineFftWindow> render', () => {
  it('renders empty when no series', () => {
    const { container } = render(<ChartLineFftWindow series={[]} />);
    const root = container.querySelector(
      '[data-section="chart-line-fft-window"]',
    );
    expect(root?.getAttribute('data-empty')).toBe('true');
  });

  it('renders raw time path with kind=raw', () => {
    render(<ChartLineFftWindow series={[cosineSeries]} />);
    const p = document.querySelector(
      '[data-section="chart-line-fft-window-raw-path"]',
    );
    expect(p?.getAttribute('data-kind')).toBe('raw');
  });

  it('renders windowed time path with kind=windowed', () => {
    render(<ChartLineFftWindow series={[cosineSeries]} />);
    const p = document.querySelector(
      '[data-section="chart-line-fft-window-windowed-path"]',
    );
    expect(p?.getAttribute('data-kind')).toBe('windowed');
  });

  it('renders window envelope path with kind=envelope', () => {
    render(<ChartLineFftWindow series={[cosineSeries]} />);
    const p = document.querySelector(
      '[data-section="chart-line-fft-window-envelope-path"]',
    );
    expect(p?.getAttribute('data-kind')).toBe('envelope');
  });

  it('hides raw via showRawTime=false', () => {
    render(
      <ChartLineFftWindow series={[cosineSeries]} showRawTime={false} />,
    );
    expect(
      document.querySelector(
        '[data-section="chart-line-fft-window-raw-path"]',
      ),
    ).toBeNull();
  });

  it('hides envelope via showWindowEnvelope=false', () => {
    render(
      <ChartLineFftWindow
        series={[cosineSeries]}
        showWindowEnvelope={false}
      />,
    );
    expect(
      document.querySelector(
        '[data-section="chart-line-fft-window-envelope-path"]',
      ),
    ).toBeNull();
  });

  it('renders spectrum bin bars', () => {
    render(<ChartLineFftWindow series={[cosineSeries]} />);
    const bars = document.querySelectorAll(
      '[data-section="chart-line-fft-window-bin-bar"]',
    );
    expect(bars.length).toBeGreaterThan(0);
  });

  it('dominant bin carries data-dominant=true', () => {
    render(<ChartLineFftWindow series={[cosineSeries]} />);
    const dominant = document.querySelectorAll(
      '[data-section="chart-line-fft-window-bin-bar"][data-dominant="true"]',
    );
    expect(dominant.length).toBe(1);
  });

  it('time-domain dots count = sample count', () => {
    render(<ChartLineFftWindow series={[cosineSeries]} />);
    const dots = document.querySelectorAll(
      '[data-section="chart-line-fft-window-time-dot"]',
    );
    expect(dots.length).toBe(16);
  });

  it('hides time dots via showDots=false', () => {
    render(
      <ChartLineFftWindow series={[cosineSeries]} showDots={false} />,
    );
    expect(
      document.querySelectorAll(
        '[data-section="chart-line-fft-window-time-dot"]',
      ).length,
    ).toBe(0);
  });

  it('window-mode toggle has 4 buttons matching LINE_FFT_WINDOW_MODES', () => {
    render(<ChartLineFftWindow series={[cosineSeries]} />);
    const buttons = document.querySelectorAll(
      '[data-section="chart-line-fft-window-mode-button"]',
    );
    expect(buttons.length).toBe(4);
  });

  it('active mode button has aria-checked=true', () => {
    render(
      <ChartLineFftWindow
        series={[cosineSeries]}
        defaultWindowMode="hamming"
      />,
    );
    const active = document.querySelector(
      '[data-section="chart-line-fft-window-mode-button"][data-mode="hamming"]',
    );
    expect(active?.getAttribute('aria-checked')).toBe('true');
  });

  it('clicking mode button switches (uncontrolled)', () => {
    const onChange = vi.fn();
    render(
      <ChartLineFftWindow
        series={[cosineSeries]}
        onWindowModeChange={onChange}
      />,
    );
    const blackman = document.querySelector(
      '[data-section="chart-line-fft-window-mode-button"][data-mode="blackman"]',
    ) as HTMLElement;
    fireEvent.click(blackman);
    expect(onChange).toHaveBeenCalledWith('blackman');
  });

  it('controlled mode stays controlled', () => {
    const onChange = vi.fn();
    render(
      <ChartLineFftWindow
        series={[cosineSeries]}
        windowMode="hann"
        onWindowModeChange={onChange}
      />,
    );
    const blackman = document.querySelector(
      '[data-section="chart-line-fft-window-mode-button"][data-mode="blackman"]',
    ) as HTMLElement;
    fireEvent.click(blackman);
    expect(onChange).toHaveBeenCalledWith('blackman');
    const active = document.querySelector(
      '[data-section="chart-line-fft-window-mode-button"][data-active="true"]',
    );
    expect(active?.getAttribute('data-mode')).toBe('hann');
  });

  it('hides window toggle via showWindowToggle=false', () => {
    render(
      <ChartLineFftWindow
        series={[cosineSeries]}
        showWindowToggle={false}
      />,
    );
    expect(
      document.querySelector(
        '[data-section="chart-line-fft-window-mode-toggle"]',
      ),
    ).toBeNull();
  });

  it('renders dominant badge with frequency + period + window', () => {
    render(<ChartLineFftWindow series={[cosineSeries]} windowMode="hann" />);
    const badge = document.querySelector(
      '[data-section="chart-line-fft-window-badge"]',
    );
    expect(Number(badge?.getAttribute('data-frequency'))).toBeCloseTo(0.25, 5);
    expect(badge?.getAttribute('data-window-mode')).toBe('hann');
  });

  it('hides badge via showDominantBadge=false', () => {
    render(
      <ChartLineFftWindow
        series={[cosineSeries]}
        showDominantBadge={false}
      />,
    );
    expect(
      document.querySelector('[data-section="chart-line-fft-window-badge"]'),
    ).toBeNull();
  });

  it('region+img ARIA', () => {
    render(<ChartLineFftWindow series={[cosineSeries]} ariaLabel="fftw" />);
    const region = screen.getByRole('region', { name: 'fftw' });
    const img = within(region).getByRole('img', { name: 'fftw' });
    expect(img.tagName.toLowerCase()).toBe('svg');
  });

  it('mirrors root data-*', () => {
    render(<ChartLineFftWindow series={[cosineSeries]} windowMode="hann" />);
    const root = document.querySelector(
      '[data-section="chart-line-fft-window"]',
    );
    expect(root?.getAttribute('data-window-mode')).toBe('hann');
    expect(root?.getAttribute('data-total-points')).toBe('16');
    expect(root?.getAttribute('data-detrend')).toBe('true');
    expect(root?.getAttribute('data-exclude-dc')).toBe('true');
  });

  it('mirrors per-series stats on group', () => {
    render(<ChartLineFftWindow series={[cosineSeries]} windowMode="hann" />);
    const group = document.querySelector(
      '[data-section="chart-line-fft-window-series-group"]',
    );
    expect(group?.getAttribute('data-series-window-mode')).toBe('hann');
    expect(
      Number(group?.getAttribute('data-series-coherent-gain')),
    ).toBeGreaterThan(0);
  });

  it('tooltip on time dot shows raw + windowed + weight', () => {
    render(<ChartLineFftWindow series={[cosineSeries]} />);
    const dot = document.querySelector(
      '[data-section="chart-line-fft-window-time-dot"][data-point-index="3"]',
    ) as HTMLElement;
    fireEvent.mouseEnter(dot);
    const raw = document.querySelector(
      '[data-section="chart-line-fft-window-tooltip-raw"]',
    );
    const win = document.querySelector(
      '[data-section="chart-line-fft-window-tooltip-windowed"]',
    );
    const weight = document.querySelector(
      '[data-section="chart-line-fft-window-tooltip-weight"]',
    );
    expect(raw?.textContent).toMatch(/raw:/);
    expect(win?.textContent).toMatch(/windowed:/);
    expect(weight?.textContent).toMatch(/window w:/);
  });

  it('tooltip on bin bar shows frequency + magnitude + window gain', () => {
    render(<ChartLineFftWindow series={[cosineSeries]} />);
    const bar = document.querySelector(
      '[data-section="chart-line-fft-window-bin-bar"][data-dominant="true"]',
    ) as HTMLElement;
    fireEvent.mouseEnter(bar);
    const f = document.querySelector(
      '[data-section="chart-line-fft-window-tooltip-frequency"]',
    );
    const gain = document.querySelector(
      '[data-section="chart-line-fft-window-tooltip-gain"]',
    );
    const dom = document.querySelector(
      '[data-section="chart-line-fft-window-tooltip-dominant"]',
    );
    expect(f?.textContent).toMatch(/f:/);
    expect(gain?.textContent).toMatch(/window:/);
    expect(dom).not.toBeNull();
  });

  it('hides tooltip on leave', () => {
    render(<ChartLineFftWindow series={[cosineSeries]} />);
    const dot = document.querySelector(
      '[data-section="chart-line-fft-window-time-dot"]',
    ) as HTMLElement;
    fireEvent.mouseEnter(dot);
    fireEvent.mouseLeave(dot);
    expect(
      document.querySelector('[data-section="chart-line-fft-window-tooltip"]'),
    ).toBeNull();
  });

  it('omits tooltip via showTooltip=false', () => {
    render(
      <ChartLineFftWindow series={[cosineSeries]} showTooltip={false} />,
    );
    const dot = document.querySelector(
      '[data-section="chart-line-fft-window-time-dot"]',
    ) as HTMLElement;
    fireEvent.mouseEnter(dot);
    expect(
      document.querySelector('[data-section="chart-line-fft-window-tooltip"]'),
    ).toBeNull();
  });

  it('fires onPointClick for time dots', () => {
    const onPointClick = vi.fn();
    render(
      <ChartLineFftWindow
        series={[cosineSeries]}
        onPointClick={onPointClick}
      />,
    );
    const dot = document.querySelector(
      '[data-section="chart-line-fft-window-time-dot"][data-point-index="2"]',
    ) as HTMLElement;
    fireEvent.click(dot);
    expect(onPointClick).toHaveBeenCalledTimes(1);
  });

  it('fires onBinClick for spectrum bars', () => {
    const onBinClick = vi.fn();
    render(
      <ChartLineFftWindow
        series={[cosineSeries]}
        onBinClick={onBinClick}
      />,
    );
    const bar = document.querySelector(
      '[data-section="chart-line-fft-window-bin-bar"][data-dominant="true"]',
    ) as HTMLElement;
    fireEvent.click(bar);
    expect(onBinClick).toHaveBeenCalledTimes(1);
  });

  it('legend shows window mode + CG per series', () => {
    render(<ChartLineFftWindow series={[cosineSeries]} windowMode="hann" />);
    const stats = document.querySelector(
      '[data-section="chart-line-fft-window-legend-stats"]',
    );
    expect(stats?.textContent).toMatch(/Hann CG/);
  });

  it('toggles visibility via legend', () => {
    const onToggle = vi.fn();
    render(
      <ChartLineFftWindow
        series={[cosineSeries]}
        onSeriesToggle={onToggle}
      />,
    );
    const item = document.querySelector(
      '[data-section="chart-line-fft-window-legend-item"]',
    ) as HTMLElement;
    fireEvent.click(item);
    expect(onToggle).toHaveBeenCalledWith({
      series: cosineSeries,
      hidden: true,
    });
  });

  it('omits legend via showLegend=false', () => {
    render(
      <ChartLineFftWindow series={[cosineSeries]} showLegend={false} />,
    );
    expect(
      document.querySelector('[data-section="chart-line-fft-window-legend"]'),
    ).toBeNull();
  });

  it('applies animate class', () => {
    const { container } = render(
      <ChartLineFftWindow series={[cosineSeries]} animate />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-fft-window"]',
    );
    expect(root?.className).toMatch(/animate-fade-in/);
  });

  it('omits animate class when animate=false', () => {
    const { container } = render(
      <ChartLineFftWindow series={[cosineSeries]} animate={false} />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-fft-window"]',
    );
    expect(root?.className ?? '').not.toMatch(/animate-fade-in/);
  });

  it('forwards ref', () => {
    const ref = createRef<HTMLDivElement>();
    render(<ChartLineFftWindow ref={ref} series={[cosineSeries]} />);
    expect(ref.current).not.toBeNull();
  });

  it('has stable displayName', () => {
    expect(ChartLineFftWindow.displayName).toBe('ChartLineFftWindow');
  });
});
