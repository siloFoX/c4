import { fireEvent, render, screen, within } from '@testing-library/react';
import { createRef } from 'react';
import { describe, expect, it, vi } from 'vitest';

import {
  ChartLineSpectrogram,
  DEFAULT_CHART_LINE_SPECTROGRAM_DOMINANT_COLOR,
  DEFAULT_CHART_LINE_SPECTROGRAM_HEIGHT,
  DEFAULT_CHART_LINE_SPECTROGRAM_HIGH_COLOR,
  DEFAULT_CHART_LINE_SPECTROGRAM_LOW_COLOR,
  DEFAULT_CHART_LINE_SPECTROGRAM_MID_COLOR,
  DEFAULT_CHART_LINE_SPECTROGRAM_WIDTH,
  DEFAULT_CHART_LINE_SPECTROGRAM_WINDOW_SIZE,
  LINE_SPECTROGRAM_WINDOW_MODES,
  computeLineSpectrogram,
  computeLineSpectrogramLayout,
  computeLineSpectrogramWindowCoefficients,
  describeLineSpectrogramChart,
  getLineSpectrogramFinitePoints,
  getLineSpectrogramScaleColor,
  normaliseLineSpectrogramHopSize,
  normaliseLineSpectrogramPanelRatio,
  normaliseLineSpectrogramWindowMode,
  normaliseLineSpectrogramWindowSize,
} from './chart-line-spectrogram';

// 64 samples: first half is period-4 cosine, second half is period-2
// cosine. This way the spectrogram's dominant frequency should SHIFT
// across frames.
const chirpData = Array.from({ length: 64 }, (_, n) => ({
  x: n,
  y:
    n < 32
      ? Math.cos((2 * Math.PI * n) / 4)
      : Math.cos((2 * Math.PI * n) / 2),
}));

const steadyData = Array.from({ length: 64 }, (_, n) => ({
  x: n,
  y: Math.cos((2 * Math.PI * n) / 8),
}));

describe('chart-line-spectrogram: defaults', () => {
  it('positive width / height', () => {
    expect(DEFAULT_CHART_LINE_SPECTROGRAM_WIDTH).toBeGreaterThan(0);
    expect(DEFAULT_CHART_LINE_SPECTROGRAM_HEIGHT).toBeGreaterThan(0);
  });

  it('default window size >= 2', () => {
    expect(DEFAULT_CHART_LINE_SPECTROGRAM_WINDOW_SIZE).toBeGreaterThanOrEqual(2);
  });

  it('dominant + low + mid + high colors all set and distinct', () => {
    const colors = new Set([
      DEFAULT_CHART_LINE_SPECTROGRAM_DOMINANT_COLOR,
      DEFAULT_CHART_LINE_SPECTROGRAM_LOW_COLOR,
      DEFAULT_CHART_LINE_SPECTROGRAM_MID_COLOR,
      DEFAULT_CHART_LINE_SPECTROGRAM_HIGH_COLOR,
    ]);
    expect(colors.size).toBe(4);
  });

  it('exports 4 canonical window modes', () => {
    expect(LINE_SPECTROGRAM_WINDOW_MODES).toEqual([
      'rectangular',
      'hann',
      'hamming',
      'blackman',
    ]);
  });
});

describe('getLineSpectrogramFinitePoints', () => {
  it('drops non-finite', () => {
    const f = getLineSpectrogramFinitePoints([
      { x: 0, y: 0 },
      { x: Number.NaN, y: 1 },
      { x: 2, y: 3 },
    ]);
    expect(f).toHaveLength(2);
  });

  it('returns [] for null', () => {
    expect(getLineSpectrogramFinitePoints(null)).toEqual([]);
  });
});

describe('normaliseLineSpectrogramWindowSize', () => {
  it('default for non-finite', () => {
    expect(normaliseLineSpectrogramWindowSize(Number.NaN)).toBe(
      DEFAULT_CHART_LINE_SPECTROGRAM_WINDOW_SIZE,
    );
  });

  it('clamps to >= 2', () => {
    expect(normaliseLineSpectrogramWindowSize(1)).toBe(2);
    expect(normaliseLineSpectrogramWindowSize(0)).toBe(2);
    expect(normaliseLineSpectrogramWindowSize(-5)).toBe(2);
  });

  it('floors fractional', () => {
    expect(normaliseLineSpectrogramWindowSize(7.9)).toBe(7);
  });
});

describe('normaliseLineSpectrogramHopSize', () => {
  it('default is half window when not specified', () => {
    expect(normaliseLineSpectrogramHopSize(undefined, 32)).toBe(16);
  });

  it('clamps to >= 1', () => {
    expect(normaliseLineSpectrogramHopSize(0, 32)).toBe(1);
    expect(normaliseLineSpectrogramHopSize(-5, 32)).toBe(1);
  });

  it('clamps to <= windowSize', () => {
    expect(normaliseLineSpectrogramHopSize(100, 32)).toBe(32);
  });

  it('floors fractional', () => {
    expect(normaliseLineSpectrogramHopSize(8.9, 32)).toBe(8);
  });
});

describe('normaliseLineSpectrogramWindowMode', () => {
  it('default hann for invalid', () => {
    expect(normaliseLineSpectrogramWindowMode('invalid')).toBe('hann');
    expect(normaliseLineSpectrogramWindowMode(null)).toBe('hann');
  });

  it('identity for valid', () => {
    for (const m of LINE_SPECTROGRAM_WINDOW_MODES) {
      expect(normaliseLineSpectrogramWindowMode(m)).toBe(m);
    }
  });
});

describe('normaliseLineSpectrogramPanelRatio', () => {
  it('clamps to [0.1, 0.6]', () => {
    expect(normaliseLineSpectrogramPanelRatio(0)).toBe(0.1);
    expect(normaliseLineSpectrogramPanelRatio(1)).toBe(0.6);
  });

  it('identity for in-range', () => {
    expect(normaliseLineSpectrogramPanelRatio(0.25)).toBe(0.25);
  });

  it('default for non-finite', () => {
    expect(normaliseLineSpectrogramPanelRatio(Number.NaN)).toBeGreaterThan(0);
  });
});

describe('computeLineSpectrogramWindowCoefficients', () => {
  it('rectangular is all 1s', () => {
    const w = computeLineSpectrogramWindowCoefficients(8, 'rectangular');
    expect(w.every((v) => v === 1)).toBe(true);
  });

  it('Hann endpoints 0, center 1', () => {
    const w = computeLineSpectrogramWindowCoefficients(15, 'hann');
    expect(w[0]).toBeCloseTo(0, 5);
    expect(w[14]).toBeCloseTo(0, 5);
    expect(w[7]).toBeCloseTo(1, 5);
  });

  it('Hamming endpoints 0.08', () => {
    const w = computeLineSpectrogramWindowCoefficients(16, 'hamming');
    expect(w[0]).toBeCloseTo(0.08, 5);
    expect(w[15]).toBeCloseTo(0.08, 5);
  });

  it('Blackman endpoints 0, center 1', () => {
    const w = computeLineSpectrogramWindowCoefficients(15, 'blackman');
    expect(w[0]).toBeCloseTo(0, 5);
    expect(w[14]).toBeCloseTo(0, 5);
    expect(w[7]).toBeCloseTo(1, 5);
  });

  it('returns [] for non-positive N', () => {
    expect(computeLineSpectrogramWindowCoefficients(0)).toEqual([]);
  });
});

describe('getLineSpectrogramScaleColor', () => {
  it('t=0 returns low color', () => {
    expect(
      getLineSpectrogramScaleColor(0, '#000000', '#888888', '#ffffff'),
    ).toBe('rgb(0, 0, 0)');
  });

  it('t=1 returns high color', () => {
    expect(
      getLineSpectrogramScaleColor(1, '#000000', '#888888', '#ffffff'),
    ).toBe('rgb(255, 255, 255)');
  });

  it('t=0.5 returns mid color', () => {
    expect(
      getLineSpectrogramScaleColor(0.5, '#000000', '#888888', '#ffffff'),
    ).toBe('rgb(136, 136, 136)');
  });

  it('clamps below to low color', () => {
    expect(
      getLineSpectrogramScaleColor(-1, '#000000', '#888888', '#ffffff'),
    ).toBe('rgb(0, 0, 0)');
  });

  it('clamps above to high color', () => {
    expect(
      getLineSpectrogramScaleColor(2, '#000000', '#888888', '#ffffff'),
    ).toBe('rgb(255, 255, 255)');
  });

  it('returns low color for non-finite t', () => {
    expect(
      getLineSpectrogramScaleColor(
        Number.NaN,
        '#abcdef',
        '#111111',
        '#222222',
      ),
    ).toBe('#abcdef');
  });
});

describe('computeLineSpectrogram', () => {
  it('returns ok=false when input shorter than window', () => {
    const s = computeLineSpectrogram(
      [
        { x: 0, y: 1 },
        { x: 1, y: 2 },
      ],
      { windowSize: 8 },
    );
    expect(s.ok).toBe(false);
  });

  it('produces multiple frames at 50% hop default', () => {
    const s = computeLineSpectrogram(chirpData, {
      windowSize: 16,
    });
    // hop default = 8, frames = floor((64 - 16) / 8) + 1 = 7
    expect(s.frames.length).toBe(7);
  });

  it('windowSize and hopSize reflected in result', () => {
    const s = computeLineSpectrogram(chirpData, {
      windowSize: 16,
      hopSize: 4,
    });
    expect(s.windowSize).toBe(16);
    expect(s.hopSize).toBe(4);
  });

  it('binCount = windowSize/2 + 1', () => {
    const s = computeLineSpectrogram(chirpData, { windowSize: 16 });
    expect(s.binCount).toBe(9);
  });

  it('frequencies length matches binCount', () => {
    const s = computeLineSpectrogram(chirpData, { windowSize: 16 });
    expect(s.frequencies.length).toBe(s.binCount);
  });

  it('dominantBin shifts across chirp (early frames at period-4, late at period-2)', () => {
    const s = computeLineSpectrogram(chirpData, {
      windowSize: 16,
      hopSize: 8,
      windowMode: 'hann',
    });
    // first frame covers samples 0..15 (period-4 cosine) -> bin 4 of 16
    // last frame covers samples 48..63 (period-2 cosine) -> bin 8 of 16
    expect(s.frames[0]?.dominantBin).toBe(4);
    expect(s.frames[s.frames.length - 1]?.dominantBin).toBe(8);
  });

  it('steady cosine has identical dominantBin in every frame', () => {
    const s = computeLineSpectrogram(steadyData, {
      windowSize: 16,
      hopSize: 8,
    });
    const bins = s.frames.map((f) => f.dominantBin);
    const unique = new Set(bins);
    expect(unique.size).toBe(1);
  });

  it('drops non-finite from sorted input', () => {
    const dataWithNan = [...chirpData];
    dataWithNan.splice(5, 1, { x: 5, y: Number.NaN });
    const s = computeLineSpectrogram(dataWithNan, { windowSize: 16 });
    expect(s.totalSamples).toBe(63);
  });

  it('sorts ascending before windowing', () => {
    const shuffled = [...chirpData].sort(() => -1);
    const s = computeLineSpectrogram(shuffled, {
      windowSize: 16,
      hopSize: 8,
    });
    expect(s.frames[0]?.startX).toBe(0);
  });

  it('maxMagnitude > 0 for non-trivial signal', () => {
    const s = computeLineSpectrogram(chirpData, { windowSize: 16 });
    expect(s.maxMagnitude).toBeGreaterThan(0);
  });

  it('rectangular window mode reflected in result', () => {
    const s = computeLineSpectrogram(chirpData, {
      windowSize: 16,
      windowMode: 'rectangular',
    });
    expect(s.windowMode).toBe('rectangular');
  });

  it('frames carry centerX between startX and endX', () => {
    const s = computeLineSpectrogram(chirpData, { windowSize: 16 });
    for (const f of s.frames) {
      expect(f.centerX).toBeGreaterThanOrEqual(f.startX);
      expect(f.centerX).toBeLessThanOrEqual(f.endX);
    }
  });
});

describe('computeLineSpectrogramLayout', () => {
  it('returns ok=false for empty', () => {
    const layout = computeLineSpectrogramLayout({
      data: [],
      width: 600,
      height: 400,
      padding: 40,
    });
    expect(layout.ok).toBe(false);
  });

  it('returns ok=false for degenerate canvas', () => {
    const layout = computeLineSpectrogramLayout({
      data: chirpData,
      width: 30,
      height: 30,
      padding: 40,
    });
    expect(layout.ok).toBe(false);
  });

  it('splits canvas into line + spectrogram panels', () => {
    const layout = computeLineSpectrogramLayout({
      data: chirpData,
      width: 640,
      height: 400,
      padding: 40,
      windowSize: 16,
    });
    expect(layout.linePanel.height).toBeGreaterThan(0);
    expect(layout.spectrogramPanel.height).toBeGreaterThan(0);
    expect(layout.spectrogramPanel.y).toBeGreaterThan(
      layout.linePanel.y + layout.linePanel.height,
    );
  });

  it('builds time path and per-cell rectangles', () => {
    const layout = computeLineSpectrogramLayout({
      data: chirpData,
      width: 640,
      height: 400,
      padding: 40,
      windowSize: 16,
    });
    expect(layout.timePath.length).toBeGreaterThan(0);
    expect(layout.cells.length).toBeGreaterThan(0);
  });

  it('cells.length = frames * (binCount - excludeDc?)', () => {
    const layout = computeLineSpectrogramLayout({
      data: chirpData,
      width: 640,
      height: 400,
      padding: 40,
      windowSize: 16,
    });
    // default excludeDc=true -> binCount-1 = 8 bins visible
    expect(layout.cells.length).toBe(layout.spectrogram.frames.length * 8);
  });

  it('cellsByFrame[i].length matches frames-1 if excludeDc default', () => {
    const layout = computeLineSpectrogramLayout({
      data: chirpData,
      width: 640,
      height: 400,
      padding: 40,
      windowSize: 16,
    });
    expect(layout.cellsByFrame[0]?.length).toBe(8);
  });

  it('marks dominant cells per frame', () => {
    const layout = computeLineSpectrogramLayout({
      data: chirpData,
      width: 640,
      height: 400,
      padding: 40,
      windowSize: 16,
    });
    const dominant = layout.cells.filter((c) => c.isDominant);
    // one dominant cell per frame
    expect(dominant.length).toBe(layout.spectrogram.frames.length);
  });

  it('dominant track has one point per frame', () => {
    const layout = computeLineSpectrogramLayout({
      data: chirpData,
      width: 640,
      height: 400,
      padding: 40,
      windowSize: 16,
    });
    expect(layout.dominantTrack.length).toBe(layout.spectrogram.frames.length);
    expect(layout.dominantTrackPath.length).toBeGreaterThan(0);
  });

  it('cells have colors interpolated from low->mid->high', () => {
    const layout = computeLineSpectrogramLayout({
      data: chirpData,
      width: 640,
      height: 400,
      padding: 40,
      windowSize: 16,
      lowColor: '#000000',
      midColor: '#555555',
      highColor: '#ffffff',
    });
    for (const c of layout.cells) {
      expect(c.color).toMatch(/^rgb\(/);
    }
  });

  it('per-cell normalisedMagnitude is in [0, 1]', () => {
    const layout = computeLineSpectrogramLayout({
      data: chirpData,
      width: 640,
      height: 400,
      padding: 40,
      windowSize: 16,
    });
    for (const c of layout.cells) {
      expect(c.normalisedMagnitude).toBeGreaterThanOrEqual(0);
      expect(c.normalisedMagnitude).toBeLessThanOrEqual(1);
    }
  });

  it('higher frequency cells appear higher on screen (smaller py)', () => {
    const layout = computeLineSpectrogramLayout({
      data: chirpData,
      width: 640,
      height: 400,
      padding: 40,
      windowSize: 16,
    });
    const frame0 = layout.cellsByFrame[0]!;
    const sorted = [...frame0].sort((a, b) => a.frequency - b.frequency);
    // Lowest frequency at bottom of panel (largest y)
    expect(sorted[0]!.y).toBeGreaterThan(sorted[sorted.length - 1]!.y);
  });
});

describe('describeLineSpectrogramChart', () => {
  it('returns No data for empty', () => {
    expect(describeLineSpectrogramChart([])).toBe('No data');
    expect(describeLineSpectrogramChart(null)).toBe('No data');
  });

  it('summarises STFT frames + window + bins', () => {
    const desc = describeLineSpectrogramChart(chirpData, {
      windowSize: 16,
      windowMode: 'hann',
    });
    expect(desc).toMatch(/STFT frames/);
    expect(desc).toMatch(/window 16/);
    expect(desc).toMatch(/Hann window/);
  });
});

describe('<ChartLineSpectrogram> render', () => {
  it('renders empty when no data', () => {
    const { container } = render(<ChartLineSpectrogram data={[]} />);
    const root = container.querySelector(
      '[data-section="chart-line-spectrogram"]',
    );
    expect(root?.getAttribute('data-empty')).toBe('true');
  });

  it('renders time path with kind=time', () => {
    render(<ChartLineSpectrogram data={chirpData} windowSize={16} />);
    const path = document.querySelector(
      '[data-section="chart-line-spectrogram-time-path"]',
    );
    expect(path?.getAttribute('data-kind')).toBe('time');
  });

  it('hides time path via showLine=false', () => {
    render(
      <ChartLineSpectrogram data={chirpData} windowSize={16} showLine={false} />,
    );
    expect(
      document.querySelector(
        '[data-section="chart-line-spectrogram-time-path"]',
      ),
    ).toBeNull();
  });

  it('renders spectrogram cells', () => {
    render(<ChartLineSpectrogram data={chirpData} windowSize={16} />);
    const cells = document.querySelectorAll(
      '[data-section="chart-line-spectrogram-cell"]',
    );
    expect(cells.length).toBeGreaterThan(0);
  });

  it('dominant cell has data-dominant=true', () => {
    render(<ChartLineSpectrogram data={chirpData} windowSize={16} />);
    const dominant = document.querySelectorAll(
      '[data-section="chart-line-spectrogram-cell"][data-dominant="true"]',
    );
    expect(dominant.length).toBeGreaterThan(0);
  });

  it('renders dominant track path', () => {
    render(<ChartLineSpectrogram data={chirpData} windowSize={16} />);
    const track = document.querySelector(
      '[data-section="chart-line-spectrogram-dominant-track"]',
    );
    expect(track?.getAttribute('data-kind')).toBe('dominant');
  });

  it('hides dominant track via showDominantTrack=false', () => {
    render(
      <ChartLineSpectrogram
        data={chirpData}
        windowSize={16}
        showDominantTrack={false}
      />,
    );
    expect(
      document.querySelector(
        '[data-section="chart-line-spectrogram-dominant-track"]',
      ),
    ).toBeNull();
  });

  it('renders dominant badge with frame count + peak frequency', () => {
    render(<ChartLineSpectrogram data={chirpData} windowSize={16} />);
    const badge = document.querySelector(
      '[data-section="chart-line-spectrogram-badge"]',
    );
    expect(badge).not.toBeNull();
    expect(
      Number(badge?.getAttribute('data-peak-frequency')),
    ).toBeGreaterThan(0);
  });

  it('hides badge via showDominantBadge=false', () => {
    render(
      <ChartLineSpectrogram
        data={chirpData}
        windowSize={16}
        showDominantBadge={false}
      />,
    );
    expect(
      document.querySelector('[data-section="chart-line-spectrogram-badge"]'),
    ).toBeNull();
  });

  it('window-mode toggle has 4 buttons matching modes', () => {
    render(<ChartLineSpectrogram data={chirpData} />);
    const buttons = document.querySelectorAll(
      '[data-section="chart-line-spectrogram-window-button"]',
    );
    expect(buttons.length).toBe(4);
  });

  it('active mode button has aria-checked=true', () => {
    render(
      <ChartLineSpectrogram
        data={chirpData}
        defaultWindowMode="blackman"
      />,
    );
    const active = document.querySelector(
      '[data-section="chart-line-spectrogram-window-button"][data-mode="blackman"]',
    );
    expect(active?.getAttribute('aria-checked')).toBe('true');
  });

  it('clicking window mode toggle dispatches onWindowModeChange', () => {
    const onChange = vi.fn();
    render(
      <ChartLineSpectrogram
        data={chirpData}
        onWindowModeChange={onChange}
      />,
    );
    const hamming = document.querySelector(
      '[data-section="chart-line-spectrogram-window-button"][data-mode="hamming"]',
    ) as HTMLElement;
    fireEvent.click(hamming);
    expect(onChange).toHaveBeenCalledWith('hamming');
  });

  it('controlled mode stays controlled', () => {
    render(
      <ChartLineSpectrogram
        data={chirpData}
        windowMode="hann"
        onWindowModeChange={() => undefined}
      />,
    );
    const blackman = document.querySelector(
      '[data-section="chart-line-spectrogram-window-button"][data-mode="blackman"]',
    ) as HTMLElement;
    fireEvent.click(blackman);
    const active = document.querySelector(
      '[data-section="chart-line-spectrogram-window-button"][data-active="true"]',
    );
    expect(active?.getAttribute('data-mode')).toBe('hann');
  });

  it('hides window toggle via showWindowToggle=false', () => {
    render(
      <ChartLineSpectrogram
        data={chirpData}
        showWindowToggle={false}
      />,
    );
    expect(
      document.querySelector(
        '[data-section="chart-line-spectrogram-window-toggle"]',
      ),
    ).toBeNull();
  });

  it('renders color scale gradient', () => {
    render(<ChartLineSpectrogram data={chirpData} />);
    const scale = document.querySelector(
      '[data-section="chart-line-spectrogram-color-scale"]',
    );
    expect(scale).not.toBeNull();
  });

  it('hides color scale via showColorScale=false', () => {
    render(
      <ChartLineSpectrogram data={chirpData} showColorScale={false} />,
    );
    expect(
      document.querySelector(
        '[data-section="chart-line-spectrogram-color-scale"]',
      ),
    ).toBeNull();
  });

  it('region+img ARIA', () => {
    render(
      <ChartLineSpectrogram data={chirpData} ariaLabel="spec" />,
    );
    const region = screen.getByRole('region', { name: 'spec' });
    const img = within(region).getByRole('img', { name: 'spec' });
    expect(img.tagName.toLowerCase()).toBe('svg');
  });

  it('mirrors root data-*', () => {
    render(
      <ChartLineSpectrogram
        data={chirpData}
        windowSize={16}
        windowMode="hann"
      />,
    );
    const root = document.querySelector(
      '[data-section="chart-line-spectrogram"]',
    );
    expect(root?.getAttribute('data-window-size')).toBe('16');
    expect(root?.getAttribute('data-window-mode')).toBe('hann');
    expect(Number(root?.getAttribute('data-frame-count'))).toBeGreaterThan(0);
    expect(Number(root?.getAttribute('data-bin-count'))).toBe(9);
    expect(Number(root?.getAttribute('data-total-points'))).toBe(64);
  });

  it('tooltip on cell hover shows frame + bin + freq + magnitude', () => {
    render(<ChartLineSpectrogram data={chirpData} windowSize={16} />);
    const dominantCell = document.querySelector(
      '[data-section="chart-line-spectrogram-cell"][data-dominant="true"]',
    ) as HTMLElement;
    fireEvent.mouseEnter(dominantCell);
    const f = document.querySelector(
      '[data-section="chart-line-spectrogram-tooltip-frequency"]',
    );
    const m = document.querySelector(
      '[data-section="chart-line-spectrogram-tooltip-magnitude"]',
    );
    const frame = document.querySelector(
      '[data-section="chart-line-spectrogram-tooltip-frame"]',
    );
    expect(f?.textContent).toMatch(/f:/);
    expect(m?.textContent).toMatch(/\|X\|:/);
    expect(frame?.textContent).toMatch(/frame/);
  });

  it('tooltip on cell shows dominant row when dominant', () => {
    render(<ChartLineSpectrogram data={chirpData} windowSize={16} />);
    const dominantCell = document.querySelector(
      '[data-section="chart-line-spectrogram-cell"][data-dominant="true"]',
    ) as HTMLElement;
    fireEvent.mouseEnter(dominantCell);
    const dom = document.querySelector(
      '[data-section="chart-line-spectrogram-tooltip-dominant"]',
    );
    expect(dom).not.toBeNull();
  });

  it('hides tooltip on leave', () => {
    render(<ChartLineSpectrogram data={chirpData} windowSize={16} />);
    const cell = document.querySelector(
      '[data-section="chart-line-spectrogram-cell"]',
    ) as HTMLElement;
    fireEvent.mouseEnter(cell);
    fireEvent.mouseLeave(cell);
    expect(
      document.querySelector(
        '[data-section="chart-line-spectrogram-tooltip"]',
      ),
    ).toBeNull();
  });

  it('omits tooltip via showTooltip=false', () => {
    render(
      <ChartLineSpectrogram
        data={chirpData}
        windowSize={16}
        showTooltip={false}
      />,
    );
    const cell = document.querySelector(
      '[data-section="chart-line-spectrogram-cell"]',
    ) as HTMLElement;
    fireEvent.mouseEnter(cell);
    expect(
      document.querySelector(
        '[data-section="chart-line-spectrogram-tooltip"]',
      ),
    ).toBeNull();
  });

  it('fires onCellClick with cell payload', () => {
    const onCellClick = vi.fn();
    render(
      <ChartLineSpectrogram
        data={chirpData}
        windowSize={16}
        onCellClick={onCellClick}
      />,
    );
    const cell = document.querySelector(
      '[data-section="chart-line-spectrogram-cell"][data-dominant="true"]',
    ) as HTMLElement;
    fireEvent.click(cell);
    expect(onCellClick).toHaveBeenCalledTimes(1);
    expect(onCellClick.mock.calls[0]?.[0]?.cell?.isDominant).toBe(true);
  });

  it('fires onPointClick for time dots when showDots=true', () => {
    const onPointClick = vi.fn();
    render(
      <ChartLineSpectrogram
        data={chirpData}
        windowSize={16}
        showDots
        onPointClick={onPointClick}
      />,
    );
    const dot = document.querySelector(
      '[data-section="chart-line-spectrogram-time-dot"]',
    ) as HTMLElement;
    fireEvent.click(dot);
    expect(onPointClick).toHaveBeenCalledTimes(1);
  });

  it('legend shows frame + bin + window + hop counts', () => {
    render(<ChartLineSpectrogram data={chirpData} windowSize={16} />);
    const stats = document.querySelector(
      '[data-section="chart-line-spectrogram-legend-stats"]',
    );
    expect(stats?.textContent).toMatch(/frames/);
    expect(stats?.textContent).toMatch(/bins/);
    expect(stats?.textContent).toMatch(/window/);
  });

  it('omits legend via showLegend=false', () => {
    render(
      <ChartLineSpectrogram
        data={chirpData}
        windowSize={16}
        showLegend={false}
      />,
    );
    expect(
      document.querySelector(
        '[data-section="chart-line-spectrogram-legend"]',
      ),
    ).toBeNull();
  });

  it('applies animate class', () => {
    const { container } = render(
      <ChartLineSpectrogram data={chirpData} windowSize={16} animate />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-spectrogram"]',
    );
    expect(root?.className).toMatch(/animate-fade-in/);
  });

  it('omits animate class when animate=false', () => {
    const { container } = render(
      <ChartLineSpectrogram
        data={chirpData}
        windowSize={16}
        animate={false}
      />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-spectrogram"]',
    );
    expect(root?.className ?? '').not.toMatch(/animate-fade-in/);
  });

  it('forwards ref', () => {
    const ref = createRef<HTMLDivElement>();
    render(
      <ChartLineSpectrogram ref={ref} data={chirpData} windowSize={16} />,
    );
    expect(ref.current).not.toBeNull();
  });

  it('has stable displayName', () => {
    expect(ChartLineSpectrogram.displayName).toBe('ChartLineSpectrogram');
  });
});
