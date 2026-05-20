import {
  forwardRef,
  useCallback,
  useId,
  useMemo,
  useState,
  type CSSProperties,
  type ForwardedRef,
} from 'react';

export const DEFAULT_CHART_LINE_FFT_WINDOW_WIDTH = 720;
export const DEFAULT_CHART_LINE_FFT_WINDOW_HEIGHT = 360;
export const DEFAULT_CHART_LINE_FFT_WINDOW_PADDING = 40;
export const DEFAULT_CHART_LINE_FFT_WINDOW_GAP = 20;
export const DEFAULT_CHART_LINE_FFT_WINDOW_TICK_COUNT = 5;
export const DEFAULT_CHART_LINE_FFT_WINDOW_TIME_PANEL_RATIO = 0.6;
export const DEFAULT_CHART_LINE_FFT_WINDOW_STROKE_WIDTH = 1.5;
export const DEFAULT_CHART_LINE_FFT_WINDOW_WINDOW_STROKE_WIDTH = 1;
export const DEFAULT_CHART_LINE_FFT_WINDOW_BAR_WIDTH_RATIO = 0.7;
export const DEFAULT_CHART_LINE_FFT_WINDOW_DOT_RADIUS = 3;
export const DEFAULT_CHART_LINE_FFT_WINDOW_PALETTE = [
  '#2563eb',
  '#dc2626',
  '#16a34a',
  '#f59e0b',
  '#9333ea',
  '#0891b2',
  '#db2777',
  '#65a30d',
  '#7c3aed',
  '#0d9488',
];
export const DEFAULT_CHART_LINE_FFT_WINDOW_SPECTRUM_COLOR = '#475569';
export const DEFAULT_CHART_LINE_FFT_WINDOW_DOMINANT_COLOR = '#dc2626';
export const DEFAULT_CHART_LINE_FFT_WINDOW_WINDOW_COLOR = '#94a3b8';
export const DEFAULT_CHART_LINE_FFT_WINDOW_GRID_COLOR = '#e2e8f0';
export const DEFAULT_CHART_LINE_FFT_WINDOW_AXIS_COLOR = '#cbd5e1';

export type ChartLineFftWindowMode =
  | 'rectangular'
  | 'hann'
  | 'hamming'
  | 'blackman';

export const LINE_FFT_WINDOW_MODES: ChartLineFftWindowMode[] = [
  'rectangular',
  'hann',
  'hamming',
  'blackman',
];

const WINDOW_LABEL: Record<ChartLineFftWindowMode, string> = {
  rectangular: 'Rect',
  hann: 'Hann',
  hamming: 'Hamming',
  blackman: 'Blackman',
};

export interface ChartLineFftWindowPoint {
  x: number;
  y: number;
}

export interface ChartLineFftWindowSeries {
  id: string;
  label: string;
  data: readonly ChartLineFftWindowPoint[];
  color?: string;
  windowMode?: ChartLineFftWindowMode;
  detrend?: boolean;
  excludeDc?: boolean;
}

export interface ChartLineFftWindowBin {
  k: number;
  frequency: number;
  period: number;
  real: number;
  imag: number;
  magnitude: number;
  normalisedMagnitude: number;
}

export interface ChartLineFftWindowSpectrum {
  bins: ChartLineFftWindowBin[];
  dominantBin: ChartLineFftWindowBin | null;
  totalSamples: number;
  detrended: boolean;
  excludedDc: boolean;
  meanValue: number;
  windowMode: ChartLineFftWindowMode;
  windowCoherentGain: number;
  windowProcessingGain: number;
  windowedValues: number[];
  windowCoefficients: number[];
}

export interface ChartLineFftWindowLayoutTimePoint {
  index: number;
  x: number;
  rawY: number;
  windowedY: number;
  windowWeight: number;
  px: number;
  rawPy: number;
  windowedPy: number;
  windowPy: number;
}

export interface ChartLineFftWindowLayoutBin extends ChartLineFftWindowBin {
  px: number;
  py: number;
  barX: number;
  barWidth: number;
  barHeight: number;
  isDominant: boolean;
}

export interface ChartLineFftWindowLayoutSeries {
  id: string;
  label: string;
  color: string;
  windowMode: ChartLineFftWindowMode;
  detrend: boolean;
  excludeDc: boolean;
  timePoints: ChartLineFftWindowLayoutTimePoint[];
  rawTimePath: string;
  windowedTimePath: string;
  windowEnvelopePath: string;
  spectrum: ChartLineFftWindowSpectrum;
  spectrumBins: ChartLineFftWindowLayoutBin[];
  dominantFrequency: number;
  dominantPeriod: number;
  dominantMagnitude: number;
  finiteCount: number;
  totalCount: number;
}

export interface ChartLineFftWindowLayout {
  ok: boolean;
  width: number;
  height: number;
  series: ChartLineFftWindowLayoutSeries[];
  timePanel: { x: number; y: number; width: number; height: number };
  spectrumPanel: { x: number; y: number; width: number; height: number };
  timeXTicks: number[];
  timeYTicks: number[];
  spectrumXTicks: number[];
  spectrumYTicks: number[];
  xMin: number;
  xMax: number;
  yMin: number;
  yMax: number;
  freqMin: number;
  freqMax: number;
  magMin: number;
  magMax: number;
  totalPoints: number;
  visibleSeriesCount: number;
}

export interface ComputeLineFftWindowLayoutOptions {
  series: readonly ChartLineFftWindowSeries[];
  hiddenSeries?: ReadonlySet<string> | readonly string[];
  width: number;
  height: number;
  padding: number;
  gap?: number;
  tickCount?: number;
  timePanelRatio?: number;
  windowMode?: ChartLineFftWindowMode;
  detrend?: boolean;
  excludeDc?: boolean;
  defaultColors?: readonly string[];
  xMin?: number;
  xMax?: number;
  yMin?: number;
  yMax?: number;
}

export interface ChartLineFftWindowProps {
  series: readonly ChartLineFftWindowSeries[];
  hiddenSeries?: ReadonlySet<string> | readonly string[];
  defaultHiddenSeries?: ReadonlySet<string> | readonly string[];
  onHiddenSeriesChange?: (hidden: ReadonlySet<string>) => void;
  windowMode?: ChartLineFftWindowMode;
  defaultWindowMode?: ChartLineFftWindowMode;
  onWindowModeChange?: (mode: ChartLineFftWindowMode) => void;
  detrend?: boolean;
  excludeDc?: boolean;
  width?: number;
  height?: number;
  padding?: number;
  gap?: number;
  tickCount?: number;
  timePanelRatio?: number;
  strokeWidth?: number;
  windowStrokeWidth?: number;
  spectrumBarWidthRatio?: number;
  dotRadius?: number;
  spectrumColor?: string;
  dominantColor?: string;
  windowColor?: string;
  gridColor?: string;
  axisColor?: string;
  xMin?: number;
  xMax?: number;
  yMin?: number;
  yMax?: number;
  showAxis?: boolean;
  showGrid?: boolean;
  showDots?: boolean;
  showLegend?: boolean;
  showTooltip?: boolean;
  showDominantBadge?: boolean;
  showSpectrum?: boolean;
  showDominantMarker?: boolean;
  showWindowEnvelope?: boolean;
  showWindowedTime?: boolean;
  showRawTime?: boolean;
  showWindowToggle?: boolean;
  animate?: boolean;
  className?: string;
  ariaLabel?: string;
  ariaDescription?: string;
  formatValue?: (n: number) => string;
  formatX?: (n: number) => string;
  formatFrequency?: (n: number) => string;
  formatPeriod?: (n: number) => string;
  formatMagnitude?: (n: number) => string;
  formatGain?: (n: number) => string;
  xLabel?: string;
  yLabel?: string;
  spectrumXLabel?: string;
  spectrumYLabel?: string;
  onPointClick?: (payload: {
    series: ChartLineFftWindowLayoutSeries;
    point: ChartLineFftWindowLayoutTimePoint;
  }) => void;
  onBinClick?: (payload: {
    series: ChartLineFftWindowLayoutSeries;
    bin: ChartLineFftWindowLayoutBin;
  }) => void;
  onSeriesToggle?: (payload: {
    series: ChartLineFftWindowSeries;
    hidden: boolean;
  }) => void;
  style?: CSSProperties;
}

function isFiniteNumber(n: unknown): n is number {
  return typeof n === 'number' && Number.isFinite(n);
}

export function getLineFftWindowDefaultColor(index: number): string {
  const palette = DEFAULT_CHART_LINE_FFT_WINDOW_PALETTE;
  if (!isFiniteNumber(index) || index < 0) {
    return palette[0]!;
  }
  return palette[Math.floor(index) % palette.length]!;
}

export function getLineFftWindowFinitePoints(
  points: readonly ChartLineFftWindowPoint[] | null | undefined,
): ChartLineFftWindowPoint[] {
  if (!Array.isArray(points)) return [];
  return points.filter(
    (p): p is ChartLineFftWindowPoint =>
      !!p && isFiniteNumber(p.x) && isFiniteNumber(p.y),
  );
}

export function normaliseLineFftWindowPanelRatio(value: unknown): number {
  if (!isFiniteNumber(value)) {
    return DEFAULT_CHART_LINE_FFT_WINDOW_TIME_PANEL_RATIO;
  }
  if (value <= 0) return 0.1;
  if (value >= 1) return 0.9;
  return value;
}

export function normaliseLineFftWindowMode(
  value: unknown,
): ChartLineFftWindowMode {
  if (
    typeof value === 'string' &&
    LINE_FFT_WINDOW_MODES.includes(value as ChartLineFftWindowMode)
  ) {
    return value as ChartLineFftWindowMode;
  }
  return 'hann';
}

export function computeLineFftWindowCoefficients(
  N: number,
  mode: ChartLineFftWindowMode = 'hann',
): number[] {
  if (!isFiniteNumber(N) || N <= 0) return [];
  const out = new Array(Math.floor(N));
  if (mode === 'rectangular') {
    for (let n = 0; n < N; n += 1) out[n] = 1;
    return out;
  }
  if (N === 1) {
    out[0] = 1;
    return out;
  }
  const denom = N - 1;
  for (let n = 0; n < N; n += 1) {
    const arg = (2 * Math.PI * n) / denom;
    let w: number;
    switch (mode) {
      case 'hann':
        w = 0.5 * (1 - Math.cos(arg));
        break;
      case 'hamming':
        w = 0.54 - 0.46 * Math.cos(arg);
        break;
      case 'blackman':
        w = 0.42 - 0.5 * Math.cos(arg) + 0.08 * Math.cos(2 * arg);
        break;
      default:
        w = 1;
    }
    out[n] = w;
  }
  return out;
}

export function applyLineFftWindowToValues(
  values: readonly number[] | null | undefined,
  windowCoefficients: readonly number[] | null | undefined,
): number[] {
  if (!Array.isArray(values) || !Array.isArray(windowCoefficients)) return [];
  const N = Math.min(values.length, windowCoefficients.length);
  const out = new Array(N);
  for (let i = 0; i < N; i += 1) {
    const v = values[i];
    const w = windowCoefficients[i];
    if (!isFiniteNumber(v) || !isFiniteNumber(w)) {
      out[i] = 0;
    } else {
      out[i] = v * w;
    }
  }
  return out;
}

export function computeLineFftWindowDft(
  values: readonly number[] | null | undefined,
): { real: number; imag: number }[] {
  if (!Array.isArray(values) || values.length === 0) return [];
  const N = values.length;
  const halfN = Math.floor(N / 2) + 1;
  const out: { real: number; imag: number }[] = new Array(halfN);
  for (let k = 0; k < halfN; k += 1) {
    let real = 0;
    let imag = 0;
    const baseAngle = (-2 * Math.PI * k) / N;
    for (let n = 0; n < N; n += 1) {
      const v = values[n];
      if (!isFiniteNumber(v)) continue;
      const angle = baseAngle * n;
      real += v * Math.cos(angle);
      imag += v * Math.sin(angle);
    }
    out[k] = { real, imag };
  }
  return out;
}

function detrendValues(values: readonly number[]): { detrended: number[]; mean: number } {
  if (values.length === 0) return { detrended: [], mean: 0 };
  let sum = 0;
  let count = 0;
  for (const v of values) {
    if (isFiniteNumber(v)) {
      sum += v;
      count += 1;
    }
  }
  const mean = count > 0 ? sum / count : 0;
  return {
    detrended: values.map((v) => (isFiniteNumber(v) ? v - mean : 0)),
    mean,
  };
}

export function computeLineFftWindowSpectrum(
  points: readonly ChartLineFftWindowPoint[] | null | undefined,
  options?: {
    windowMode?: ChartLineFftWindowMode;
    detrend?: boolean;
    excludeDc?: boolean;
  },
): ChartLineFftWindowSpectrum {
  const mode = normaliseLineFftWindowMode(options?.windowMode);
  const detrend = options?.detrend !== false; // default true
  const excludeDc = options?.excludeDc !== false; // default true
  const finite = getLineFftWindowFinitePoints(points);
  if (finite.length < 2) {
    return {
      bins: [],
      dominantBin: null,
      totalSamples: finite.length,
      detrended: detrend,
      excludedDc: excludeDc,
      meanValue: finite[0]?.y ?? 0,
      windowMode: mode,
      windowCoherentGain: 0,
      windowProcessingGain: 0,
      windowedValues: [],
      windowCoefficients: [],
    };
  }
  const sorted = [...finite].sort((a, b) => a.x - b.x);
  const ys = sorted.map((p) => p.y);
  const N = ys.length;
  const { detrended, mean } = detrendValues(ys);
  const input = detrend ? detrended : [...ys];
  const coefficients = computeLineFftWindowCoefficients(N, mode);
  const windowed = applyLineFftWindowToValues(input, coefficients);
  const dft = computeLineFftWindowDft(windowed);

  // Window gain factors (canonical signal-processing definitions):
  //   coherent gain  = (sum w[n]) / N      -- amplitude scale for tones
  //   processing gain = (sum w[n]^2) / N   -- power scale for noise
  let sumW = 0;
  let sumW2 = 0;
  for (const w of coefficients) {
    if (isFiniteNumber(w)) {
      sumW += w;
      sumW2 += w * w;
    }
  }
  const coherentGain = N > 0 ? sumW / N : 0;
  const processingGain = N > 0 ? sumW2 / N : 0;

  const sampleStep =
    sorted.length >= 2
      ? (sorted[sorted.length - 1]!.x - sorted[0]!.x) / (N - 1)
      : 1;
  const fundamentalFrequency = sampleStep > 0 ? 1 / (N * sampleStep) : 1 / N;

  const bins: ChartLineFftWindowBin[] = dft.map((c, k) => {
    const magnitude = Math.sqrt(c.real * c.real + c.imag * c.imag);
    const frequency = k * fundamentalFrequency;
    const period = frequency > 0 ? 1 / frequency : Number.POSITIVE_INFINITY;
    return {
      k,
      frequency,
      period,
      real: c.real,
      imag: c.imag,
      magnitude,
      normalisedMagnitude: 0,
    };
  });

  let maxMag = 0;
  for (const b of bins) if (b.magnitude > maxMag) maxMag = b.magnitude;
  for (const b of bins) {
    b.normalisedMagnitude = maxMag > 0 ? b.magnitude / maxMag : 0;
  }

  let dominantBin: ChartLineFftWindowBin | null = null;
  for (const b of bins) {
    if (excludeDc && b.k === 0) continue;
    if (!dominantBin || b.magnitude > dominantBin.magnitude) dominantBin = b;
  }

  return {
    bins,
    dominantBin,
    totalSamples: N,
    detrended: detrend,
    excludedDc: excludeDc,
    meanValue: mean,
    windowMode: mode,
    windowCoherentGain: coherentGain,
    windowProcessingGain: processingGain,
    windowedValues: windowed,
    windowCoefficients: coefficients,
  };
}

export function findLineFftWindowDominantBin(
  bins: readonly ChartLineFftWindowBin[] | null | undefined,
  excludeDc = true,
): ChartLineFftWindowBin | null {
  if (!Array.isArray(bins) || bins.length === 0) return null;
  let dominant: ChartLineFftWindowBin | null = null;
  for (const b of bins) {
    if (excludeDc && b.k === 0) continue;
    if (!dominant || b.magnitude > dominant.magnitude) dominant = b;
  }
  return dominant;
}

function buildPath(
  points: readonly { px: number; py: number }[],
): string {
  if (points.length === 0) return '';
  const parts: string[] = [];
  for (let i = 0; i < points.length; i += 1) {
    const p = points[i]!;
    const cmd = i === 0 ? 'M' : 'L';
    parts.push(`${cmd} ${p.px.toFixed(3)} ${p.py.toFixed(3)}`);
  }
  return parts.join(' ');
}

function normaliseHidden(
  hidden: ReadonlySet<string> | readonly string[] | null | undefined,
): Set<string> {
  if (!hidden) return new Set();
  if (hidden instanceof Set) return new Set(hidden);
  if (Array.isArray(hidden)) return new Set(hidden);
  return new Set();
}

function computeTicks(min: number, max: number, count: number): number[] {
  if (!isFiniteNumber(min) || !isFiniteNumber(max) || count < 2) return [];
  if (min === max) return [min];
  const step = (max - min) / (count - 1);
  const ticks: number[] = [];
  for (let i = 0; i < count; i += 1) ticks.push(min + step * i);
  return ticks;
}

export function computeLineFftWindowLayout(
  options: ComputeLineFftWindowLayoutOptions,
): ChartLineFftWindowLayout {
  const {
    series,
    hiddenSeries,
    width,
    height,
    padding,
    gap = DEFAULT_CHART_LINE_FFT_WINDOW_GAP,
    tickCount = DEFAULT_CHART_LINE_FFT_WINDOW_TICK_COUNT,
    timePanelRatio,
    windowMode,
    detrend,
    excludeDc,
    defaultColors = DEFAULT_CHART_LINE_FFT_WINDOW_PALETTE,
    xMin: xMinOverride,
    xMax: xMaxOverride,
    yMin: yMinOverride,
    yMax: yMaxOverride,
  } = options;

  const innerWidth = width - padding * 2;
  const innerHeight = height - padding * 2;
  const ratio = normaliseLineFftWindowPanelRatio(timePanelRatio);
  const usableWidth = Math.max(0, innerWidth - gap);
  const timeWidth = Math.max(0, usableWidth * ratio);
  const spectrumWidth = Math.max(0, usableWidth - timeWidth);
  const chartMode = normaliseLineFftWindowMode(windowMode);

  const emptyResult: ChartLineFftWindowLayout = {
    ok: false,
    width,
    height,
    series: [],
    timePanel: { x: padding, y: padding, width: timeWidth, height: innerHeight },
    spectrumPanel: {
      x: padding + timeWidth + gap,
      y: padding,
      width: spectrumWidth,
      height: innerHeight,
    },
    timeXTicks: [],
    timeYTicks: [],
    spectrumXTicks: [],
    spectrumYTicks: [],
    xMin: 0,
    xMax: 0,
    yMin: 0,
    yMax: 0,
    freqMin: 0,
    freqMax: 0,
    magMin: 0,
    magMax: 0,
    totalPoints: 0,
    visibleSeriesCount: 0,
  };

  if (timeWidth <= 0 || spectrumWidth <= 0 || innerHeight <= 0) {
    return emptyResult;
  }
  if (!Array.isArray(series) || series.length === 0) return emptyResult;

  const hidden = normaliseHidden(hiddenSeries);
  const visible = series.filter((s) => !hidden.has(s.id));
  if (visible.length === 0) return emptyResult;

  let xLo = Number.POSITIVE_INFINITY;
  let xHi = Number.NEGATIVE_INFINITY;
  let yLo = Number.POSITIVE_INFINITY;
  let yHi = Number.NEGATIVE_INFINITY;
  let freqHi = 0;
  let magHi = 0;
  let totalPoints = 0;

  const finiteBySeries = new Map<string, ChartLineFftWindowPoint[]>();
  const spectrumBySeries = new Map<string, ChartLineFftWindowSpectrum>();

  for (const s of visible) {
    const finite = getLineFftWindowFinitePoints(s.data).slice().sort((a, b) => a.x - b.x);
    finiteBySeries.set(s.id, finite);
    totalPoints += finite.length;
    const sMode = normaliseLineFftWindowMode(s.windowMode ?? chartMode);
    const sDetrend = s.detrend !== undefined ? s.detrend : detrend;
    const sExcludeDc = s.excludeDc !== undefined ? s.excludeDc : excludeDc;
    const spectrum = computeLineFftWindowSpectrum(finite, {
      windowMode: sMode,
      detrend: sDetrend,
      excludeDc: sExcludeDc,
    });
    spectrumBySeries.set(s.id, spectrum);
    for (let i = 0; i < finite.length; i += 1) {
      const p = finite[i]!;
      const wY = spectrum.windowedValues[i] ?? 0;
      if (p.x < xLo) xLo = p.x;
      if (p.x > xHi) xHi = p.x;
      if (p.y < yLo) yLo = p.y;
      if (p.y > yHi) yHi = p.y;
      if (wY < yLo) yLo = wY;
      if (wY > yHi) yHi = wY;
    }
    for (const b of spectrum.bins) {
      if (spectrum.excludedDc && b.k === 0) continue;
      if (b.frequency > freqHi) freqHi = b.frequency;
      if (b.magnitude > magHi) magHi = b.magnitude;
    }
  }

  if (totalPoints === 0) return emptyResult;

  if (isFiniteNumber(xMinOverride)) xLo = xMinOverride;
  if (isFiniteNumber(xMaxOverride)) xHi = xMaxOverride;
  if (isFiniteNumber(yMinOverride)) yLo = yMinOverride;
  if (isFiniteNumber(yMaxOverride)) yHi = yMaxOverride;

  if (xLo === xHi) {
    xLo -= 0.5;
    xHi += 0.5;
  }
  if (yLo === yHi) {
    yLo -= 0.5;
    yHi += 0.5;
  }
  if (freqHi <= 0) freqHi = 1;
  if (magHi <= 0) magHi = 1;

  const xRange = xHi - xLo;
  const yRange = yHi - yLo;

  const timeX = padding;
  const timeY = padding;
  const spectrumX = padding + timeWidth + gap;

  const projectTimeX = (x: number): number =>
    timeX + ((x - xLo) / xRange) * timeWidth;
  const projectTimeY = (y: number): number =>
    timeY + innerHeight - ((y - yLo) / yRange) * innerHeight;
  const projectFreqX = (f: number): number =>
    spectrumX + (f / freqHi) * spectrumWidth;
  const projectMagY = (m: number): number =>
    timeY + innerHeight - (m / magHi) * innerHeight;

  const layoutSeries: ChartLineFftWindowLayoutSeries[] = visible.map((s, idx) => {
    const finite = finiteBySeries.get(s.id) ?? [];
    const spectrum =
      spectrumBySeries.get(s.id) ??
      computeLineFftWindowSpectrum([], { windowMode: chartMode });
    const color =
      s.color ?? defaultColors[idx % defaultColors.length] ?? DEFAULT_CHART_LINE_FFT_WINDOW_PALETTE[0]!;

    const timePoints: ChartLineFftWindowLayoutTimePoint[] = finite.map((p, i) => {
      const w = spectrum.windowCoefficients[i] ?? 0;
      const wY = spectrum.windowedValues[i] ?? 0;
      // Project the window coefficient as a 0..1 envelope across the
      // time panel: 0 maps to the panel bottom, 1 maps to the top.
      const windowPy =
        timeY + innerHeight - w * innerHeight;
      return {
        index: i,
        x: p.x,
        rawY: p.y,
        windowedY: wY,
        windowWeight: w,
        px: projectTimeX(p.x),
        rawPy: projectTimeY(p.y),
        windowedPy: projectTimeY(wY),
        windowPy,
      };
    });

    const rawTimePath = buildPath(
      timePoints.map((p) => ({ px: p.px, py: p.rawPy })),
    );
    const windowedTimePath = buildPath(
      timePoints.map((p) => ({ px: p.px, py: p.windowedPy })),
    );
    const windowEnvelopePath = buildPath(
      timePoints.map((p) => ({ px: p.px, py: p.windowPy })),
    );

    const usableBins = spectrum.excludedDc
      ? spectrum.bins.filter((b) => b.k !== 0)
      : spectrum.bins;
    const visibleBinCount = Math.max(1, usableBins.length);
    const slot = spectrumWidth / visibleBinCount;

    const spectrumBins: ChartLineFftWindowLayoutBin[] = usableBins.map((b, i) => {
      const px = spectrumX + slot * (i + 0.5);
      const py = projectMagY(b.magnitude);
      const barWidth = slot * DEFAULT_CHART_LINE_FFT_WINDOW_BAR_WIDTH_RATIO;
      const barX = px - barWidth / 2;
      const barHeight = Math.max(0, timeY + innerHeight - py);
      return {
        ...b,
        px,
        py,
        barX,
        barWidth,
        barHeight,
        isDominant:
          spectrum.dominantBin !== null && b.k === spectrum.dominantBin.k,
      };
    });

    return {
      id: s.id,
      label: s.label,
      color,
      windowMode: spectrum.windowMode,
      detrend: spectrum.detrended,
      excludeDc: spectrum.excludedDc,
      timePoints,
      rawTimePath,
      windowedTimePath,
      windowEnvelopePath,
      spectrum,
      spectrumBins,
      dominantFrequency: spectrum.dominantBin?.frequency ?? 0,
      dominantPeriod: spectrum.dominantBin?.period ?? 0,
      dominantMagnitude: spectrum.dominantBin?.magnitude ?? 0,
      finiteCount: finite.length,
      totalCount: s.data?.length ?? 0,
    };
  });

  return {
    ok: true,
    width,
    height,
    series: layoutSeries,
    timePanel: { x: timeX, y: timeY, width: timeWidth, height: innerHeight },
    spectrumPanel: {
      x: spectrumX,
      y: timeY,
      width: spectrumWidth,
      height: innerHeight,
    },
    timeXTicks: computeTicks(xLo, xHi, tickCount),
    timeYTicks: computeTicks(yLo, yHi, tickCount),
    spectrumXTicks: computeTicks(0, freqHi, tickCount),
    spectrumYTicks: computeTicks(0, magHi, tickCount),
    xMin: xLo,
    xMax: xHi,
    yMin: yLo,
    yMax: yHi,
    freqMin: 0,
    freqMax: freqHi,
    magMin: 0,
    magMax: magHi,
    totalPoints,
    visibleSeriesCount: visible.length,
  };
}

function defaultFormatValue(n: number): string {
  if (!isFiniteNumber(n)) return '';
  if (Number.isInteger(n)) return String(n);
  return n.toFixed(2);
}

function defaultFormatFrequency(n: number): string {
  if (!isFiniteNumber(n)) return '';
  if (n === 0) return '0';
  return n.toFixed(3);
}

function defaultFormatPeriod(n: number): string {
  if (!isFiniteNumber(n)) return 'inf';
  if (Number.isInteger(n)) return String(n);
  return n.toFixed(2);
}

function defaultFormatGain(n: number): string {
  if (!isFiniteNumber(n)) return '';
  return n.toFixed(3);
}

export function describeLineFftWindowChart(
  series: readonly ChartLineFftWindowSeries[] | null | undefined,
  options?: {
    hidden?: ReadonlySet<string> | readonly string[];
    windowMode?: ChartLineFftWindowMode;
    detrend?: boolean;
    excludeDc?: boolean;
    formatFrequency?: (n: number) => string;
    formatPeriod?: (n: number) => string;
    formatGain?: (n: number) => string;
  },
): string {
  if (!Array.isArray(series) || series.length === 0) return 'No data';
  const hiddenSet = normaliseHidden(options?.hidden);
  const visible = series.filter((s) => !hiddenSet.has(s.id));
  if (visible.length === 0) return 'No data';
  const chartMode = normaliseLineFftWindowMode(options?.windowMode);
  const fmtF = options?.formatFrequency ?? defaultFormatFrequency;
  const fmtP = options?.formatPeriod ?? defaultFormatPeriod;
  const fmtG = options?.formatGain ?? defaultFormatGain;

  let totalPoints = 0;
  const summaries: string[] = [];
  for (const s of visible) {
    const sMode = normaliseLineFftWindowMode(s.windowMode ?? chartMode);
    const sDetrend = s.detrend !== undefined ? s.detrend : options?.detrend;
    const sExcludeDc =
      s.excludeDc !== undefined ? s.excludeDc : options?.excludeDc;
    const spectrum = computeLineFftWindowSpectrum(s.data, {
      windowMode: sMode,
      detrend: sDetrend,
      excludeDc: sExcludeDc,
    });
    totalPoints += spectrum.totalSamples;
    const dom = spectrum.dominantBin;
    summaries.push(
      `${s.label}: ${WINDOW_LABEL[sMode]} window (coherent gain ${fmtG(spectrum.windowCoherentGain)}); dominant frequency ${dom ? fmtF(dom.frequency) : 'n/a'}; period ${dom ? fmtP(dom.period) : 'n/a'}`,
    );
  }
  if (totalPoints === 0) return 'No data';

  return `Windowed-FFT chart across ${visible.length} series (${totalPoints} points). ${summaries.join('; ')}.`;
}

export const ChartLineFftWindow = forwardRef<
  HTMLDivElement,
  ChartLineFftWindowProps
>(function ChartLineFftWindow(
  props: ChartLineFftWindowProps,
  ref: ForwardedRef<HTMLDivElement>,
) {
  const {
    series,
    hiddenSeries: controlledHidden,
    defaultHiddenSeries,
    onHiddenSeriesChange,
    windowMode: controlledMode,
    defaultWindowMode = 'hann',
    onWindowModeChange,
    detrend = true,
    excludeDc = true,
    width = DEFAULT_CHART_LINE_FFT_WINDOW_WIDTH,
    height = DEFAULT_CHART_LINE_FFT_WINDOW_HEIGHT,
    padding = DEFAULT_CHART_LINE_FFT_WINDOW_PADDING,
    gap = DEFAULT_CHART_LINE_FFT_WINDOW_GAP,
    tickCount = DEFAULT_CHART_LINE_FFT_WINDOW_TICK_COUNT,
    timePanelRatio = DEFAULT_CHART_LINE_FFT_WINDOW_TIME_PANEL_RATIO,
    strokeWidth = DEFAULT_CHART_LINE_FFT_WINDOW_STROKE_WIDTH,
    windowStrokeWidth = DEFAULT_CHART_LINE_FFT_WINDOW_WINDOW_STROKE_WIDTH,
    spectrumBarWidthRatio = DEFAULT_CHART_LINE_FFT_WINDOW_BAR_WIDTH_RATIO,
    dotRadius = DEFAULT_CHART_LINE_FFT_WINDOW_DOT_RADIUS,
    spectrumColor = DEFAULT_CHART_LINE_FFT_WINDOW_SPECTRUM_COLOR,
    dominantColor = DEFAULT_CHART_LINE_FFT_WINDOW_DOMINANT_COLOR,
    windowColor = DEFAULT_CHART_LINE_FFT_WINDOW_WINDOW_COLOR,
    gridColor = DEFAULT_CHART_LINE_FFT_WINDOW_GRID_COLOR,
    axisColor = DEFAULT_CHART_LINE_FFT_WINDOW_AXIS_COLOR,
    xMin,
    xMax,
    yMin,
    yMax,
    showAxis = true,
    showGrid = true,
    showDots = true,
    showLegend = true,
    showTooltip = true,
    showDominantBadge = true,
    showSpectrum = true,
    showDominantMarker = true,
    showWindowEnvelope = true,
    showWindowedTime = true,
    showRawTime = true,
    showWindowToggle = true,
    animate = true,
    className,
    ariaLabel = 'Line chart with windowed FFT spectrum',
    ariaDescription,
    formatValue = defaultFormatValue,
    formatX = defaultFormatValue,
    formatFrequency = defaultFormatFrequency,
    formatPeriod = defaultFormatPeriod,
    formatMagnitude = defaultFormatValue,
    formatGain = defaultFormatGain,
    xLabel,
    yLabel,
    spectrumXLabel = 'Frequency',
    spectrumYLabel = 'Magnitude',
    onPointClick,
    onBinClick,
    onSeriesToggle,
    style,
  } = props;

  const reactId = useId();
  const descId = `${reactId}-desc`;

  const isControlledHidden = controlledHidden !== undefined;
  const [uncontrolledHidden, setUncontrolledHidden] = useState<Set<string>>(
    () => normaliseHidden(defaultHiddenSeries),
  );
  const hiddenSet = isControlledHidden
    ? normaliseHidden(controlledHidden)
    : uncontrolledHidden;

  const isControlledMode = controlledMode !== undefined;
  const [uncontrolledMode, setUncontrolledMode] = useState<ChartLineFftWindowMode>(
    () => normaliseLineFftWindowMode(defaultWindowMode),
  );
  const effectiveMode = isControlledMode
    ? normaliseLineFftWindowMode(controlledMode)
    : uncontrolledMode;

  const layout = useMemo(
    () =>
      computeLineFftWindowLayout({
        series,
        hiddenSeries: hiddenSet,
        width,
        height,
        padding,
        gap,
        tickCount,
        timePanelRatio,
        windowMode: effectiveMode,
        detrend,
        excludeDc,
        ...(isFiniteNumber(xMin) ? { xMin } : {}),
        ...(isFiniteNumber(xMax) ? { xMax } : {}),
        ...(isFiniteNumber(yMin) ? { yMin } : {}),
        ...(isFiniteNumber(yMax) ? { yMax } : {}),
      }),
    [
      series,
      hiddenSet,
      width,
      height,
      padding,
      gap,
      tickCount,
      timePanelRatio,
      effectiveMode,
      detrend,
      excludeDc,
      xMin,
      xMax,
      yMin,
      yMax,
    ],
  );

  const summary = useMemo(
    () =>
      ariaDescription ??
      describeLineFftWindowChart(series, {
        hidden: hiddenSet,
        windowMode: effectiveMode,
        detrend,
        excludeDc,
        formatFrequency,
        formatPeriod,
        formatGain,
      }),
    [
      ariaDescription,
      series,
      hiddenSet,
      effectiveMode,
      detrend,
      excludeDc,
      formatFrequency,
      formatPeriod,
      formatGain,
    ],
  );

  const [hoverPayload, setHoverPayload] = useState<
    | { kind: 'time'; seriesId: string; pointIndex: number }
    | { kind: 'bin'; seriesId: string; binK: number }
    | null
  >(null);
  const [tooltipPos, setTooltipPos] = useState<{
    px: number;
    py: number;
  } | null>(null);

  const clearHover = useCallback(() => {
    setHoverPayload(null);
    setTooltipPos(null);
  }, []);

  const handleToggle = useCallback(
    (s: ChartLineFftWindowSeries) => {
      const next = new Set(hiddenSet);
      const willHide = !next.has(s.id);
      if (willHide) next.add(s.id);
      else next.delete(s.id);
      if (!isControlledHidden) setUncontrolledHidden(next);
      onHiddenSeriesChange?.(next);
      onSeriesToggle?.({ series: s, hidden: willHide });
    },
    [hiddenSet, isControlledHidden, onHiddenSeriesChange, onSeriesToggle],
  );

  const handleModeChange = useCallback(
    (next: ChartLineFftWindowMode) => {
      if (!isControlledMode) setUncontrolledMode(next);
      onWindowModeChange?.(next);
    },
    [isControlledMode, onWindowModeChange],
  );

  const allTotalPoints = useMemo(
    () =>
      series.reduce(
        (acc, s) => acc + getLineFftWindowFinitePoints(s.data).length,
        0,
      ),
    [series],
  );

  const dominantOverall = useMemo<{
    seriesId: string;
    frequency: number;
    period: number;
    magnitude: number;
    coherentGain: number;
  }>(() => {
    let best: {
      seriesId: string;
      frequency: number;
      period: number;
      magnitude: number;
      coherentGain: number;
    } = { seriesId: '', frequency: 0, period: 0, magnitude: 0, coherentGain: 0 };
    for (const s of layout.series) {
      if (s.dominantMagnitude > best.magnitude) {
        best = {
          seriesId: s.id,
          frequency: s.dominantFrequency,
          period: s.dominantPeriod,
          magnitude: s.dominantMagnitude,
          coherentGain: s.spectrum.windowCoherentGain,
        };
      }
    }
    return best;
  }, [layout.series]);

  const containerStyle: CSSProperties = {
    width,
    height,
    position: 'relative',
    ...(style ?? {}),
  };

  if (!layout.ok) {
    return (
      <div
        ref={ref}
        role="region"
        aria-label={ariaLabel}
        aria-describedby={descId}
        className={className}
        style={containerStyle}
        data-section="chart-line-fft-window"
        data-empty="true"
        data-series-count={series.length}
        data-visible-series-count={0}
        data-total-points={0}
        data-window-mode={effectiveMode}
        data-detrend={detrend ? 'true' : 'false'}
        data-exclude-dc={excludeDc ? 'true' : 'false'}
        data-animate={animate ? 'true' : 'false'}
      >
        <span
          id={descId}
          data-section="chart-line-fft-window-aria-desc"
          style={{
            position: 'absolute',
            width: 1,
            height: 1,
            overflow: 'hidden',
            clip: 'rect(0 0 0 0)',
            clipPath: 'inset(50%)',
            whiteSpace: 'nowrap',
          }}
        >
          {summary}
        </span>
      </div>
    );
  }

  const animateClass = animate ? 'motion-safe:animate-fade-in' : '';

  return (
    <div
      ref={ref}
      role="region"
      aria-label={ariaLabel}
      aria-describedby={descId}
      className={[className, animateClass].filter(Boolean).join(' ') || undefined}
      style={containerStyle}
      data-section="chart-line-fft-window"
      data-empty="false"
      data-series-count={series.length}
      data-visible-series-count={layout.visibleSeriesCount}
      data-total-points={layout.totalPoints}
      data-window-mode={effectiveMode}
      data-detrend={detrend ? 'true' : 'false'}
      data-exclude-dc={excludeDc ? 'true' : 'false'}
      data-dominant-frequency={dominantOverall.frequency}
      data-dominant-period={dominantOverall.period}
      data-dominant-coherent-gain={dominantOverall.coherentGain}
      data-animate={animate ? 'true' : 'false'}
    >
      <span
        id={descId}
        data-section="chart-line-fft-window-aria-desc"
        style={{
          position: 'absolute',
          width: 1,
          height: 1,
          overflow: 'hidden',
          clip: 'rect(0 0 0 0)',
          clipPath: 'inset(50%)',
          whiteSpace: 'nowrap',
        }}
      >
        {summary}
      </span>

      <div
        data-section="chart-line-fft-window-canvas"
        style={{ position: 'relative', width, height }}
      >
        {showDominantBadge && dominantOverall.magnitude > 0 ? (
          <div
            data-section="chart-line-fft-window-badge"
            data-series-id={dominantOverall.seriesId}
            data-frequency={dominantOverall.frequency}
            data-period={dominantOverall.period}
            data-magnitude={dominantOverall.magnitude}
            data-window-mode={effectiveMode}
            data-coherent-gain={dominantOverall.coherentGain}
            style={{
              position: 'absolute',
              top: 4,
              left: 4,
              padding: '2px 6px',
              borderRadius: 4,
              background: '#ffffffd9',
              color: dominantColor,
              fontSize: 11,
              fontWeight: 600,
              display: 'flex',
              gap: 4,
              alignItems: 'center',
              pointerEvents: 'none',
            }}
          >
            <span
              data-section="chart-line-fft-window-badge-icon"
              aria-hidden="true"
            >
              f
            </span>
            <span data-section="chart-line-fft-window-badge-frequency">
              {formatFrequency(dominantOverall.frequency)}
            </span>
            <span data-section="chart-line-fft-window-badge-period">
              T={formatPeriod(dominantOverall.period)}
            </span>
            <span data-section="chart-line-fft-window-badge-window">
              [{WINDOW_LABEL[effectiveMode]}]
            </span>
          </div>
        ) : null}

        <svg
          role="img"
          aria-label={ariaLabel}
          width={width}
          height={height}
          data-section="chart-line-fft-window-svg"
          style={{ display: 'block', overflow: 'visible' }}
        >
          {showGrid ? (
            <g
              data-section="chart-line-fft-window-grid"
              stroke={gridColor}
              strokeWidth={1}
            >
              {layout.timeYTicks.map((t, i) => {
                const py =
                  layout.timePanel.y +
                  layout.timePanel.height -
                  ((t - layout.yMin) / (layout.yMax - layout.yMin)) *
                    layout.timePanel.height;
                return (
                  <line
                    key={`gy-${i}`}
                    data-section="chart-line-fft-window-grid-line"
                    data-panel="time"
                    data-axis="y"
                    x1={layout.timePanel.x}
                    x2={layout.timePanel.x + layout.timePanel.width}
                    y1={py}
                    y2={py}
                  />
                );
              })}
              {layout.timeXTicks.map((t, i) => {
                const px =
                  layout.timePanel.x +
                  ((t - layout.xMin) / (layout.xMax - layout.xMin)) *
                    layout.timePanel.width;
                return (
                  <line
                    key={`gx-${i}`}
                    data-section="chart-line-fft-window-grid-line"
                    data-panel="time"
                    data-axis="x"
                    x1={px}
                    x2={px}
                    y1={layout.timePanel.y}
                    y2={layout.timePanel.y + layout.timePanel.height}
                  />
                );
              })}
            </g>
          ) : null}

          {showAxis ? (
            <g
              data-section="chart-line-fft-window-axes"
              stroke={axisColor}
              strokeWidth={1}
            >
              <line
                data-section="chart-line-fft-window-axis"
                data-panel="time"
                data-axis="x"
                x1={layout.timePanel.x}
                y1={layout.timePanel.y + layout.timePanel.height}
                x2={layout.timePanel.x + layout.timePanel.width}
                y2={layout.timePanel.y + layout.timePanel.height}
              />
              <line
                data-section="chart-line-fft-window-axis"
                data-panel="time"
                data-axis="y"
                x1={layout.timePanel.x}
                y1={layout.timePanel.y}
                x2={layout.timePanel.x}
                y2={layout.timePanel.y + layout.timePanel.height}
              />
              <line
                data-section="chart-line-fft-window-axis"
                data-panel="spectrum"
                data-axis="x"
                x1={layout.spectrumPanel.x}
                y1={layout.spectrumPanel.y + layout.spectrumPanel.height}
                x2={layout.spectrumPanel.x + layout.spectrumPanel.width}
                y2={layout.spectrumPanel.y + layout.spectrumPanel.height}
              />
              <line
                data-section="chart-line-fft-window-axis"
                data-panel="spectrum"
                data-axis="y"
                x1={layout.spectrumPanel.x}
                y1={layout.spectrumPanel.y}
                x2={layout.spectrumPanel.x}
                y2={layout.spectrumPanel.y + layout.spectrumPanel.height}
              />
              <g data-section="chart-line-fft-window-ticks" data-panel="time" data-axis="x">
                {layout.timeXTicks.map((t, i) => {
                  const px =
                    layout.timePanel.x +
                    ((t - layout.xMin) / (layout.xMax - layout.xMin)) *
                      layout.timePanel.width;
                  return (
                    <g
                      key={`tx-${i}`}
                      data-section="chart-line-fft-window-tick"
                      data-panel="time"
                      data-axis="x"
                    >
                      <line
                        x1={px}
                        x2={px}
                        y1={layout.timePanel.y + layout.timePanel.height}
                        y2={layout.timePanel.y + layout.timePanel.height + 4}
                      />
                      <text
                        data-section="chart-line-fft-window-tick-label"
                        data-panel="time"
                        data-axis="x"
                        x={px}
                        y={layout.timePanel.y + layout.timePanel.height + 14}
                        textAnchor="middle"
                        fontSize={10}
                        fill={axisColor}
                        stroke="none"
                      >
                        {formatX(t)}
                      </text>
                    </g>
                  );
                })}
              </g>
              <g
                data-section="chart-line-fft-window-ticks"
                data-panel="time"
                data-axis="y"
              >
                {layout.timeYTicks.map((t, i) => {
                  const py =
                    layout.timePanel.y +
                    layout.timePanel.height -
                    ((t - layout.yMin) / (layout.yMax - layout.yMin)) *
                      layout.timePanel.height;
                  return (
                    <g
                      key={`ty-${i}`}
                      data-section="chart-line-fft-window-tick"
                      data-panel="time"
                      data-axis="y"
                    >
                      <line
                        x1={layout.timePanel.x - 4}
                        x2={layout.timePanel.x}
                        y1={py}
                        y2={py}
                      />
                      <text
                        data-section="chart-line-fft-window-tick-label"
                        data-panel="time"
                        data-axis="y"
                        x={layout.timePanel.x - 6}
                        y={py + 3}
                        textAnchor="end"
                        fontSize={10}
                        fill={axisColor}
                        stroke="none"
                      >
                        {formatValue(t)}
                      </text>
                    </g>
                  );
                })}
              </g>
              <g
                data-section="chart-line-fft-window-ticks"
                data-panel="spectrum"
                data-axis="x"
              >
                {layout.spectrumXTicks.map((t, i) => {
                  const px =
                    layout.spectrumPanel.x +
                    (t / layout.freqMax) * layout.spectrumPanel.width;
                  return (
                    <g
                      key={`sx-${i}`}
                      data-section="chart-line-fft-window-tick"
                      data-panel="spectrum"
                      data-axis="x"
                    >
                      <line
                        x1={px}
                        x2={px}
                        y1={layout.spectrumPanel.y + layout.spectrumPanel.height}
                        y2={layout.spectrumPanel.y + layout.spectrumPanel.height + 4}
                      />
                      <text
                        data-section="chart-line-fft-window-tick-label"
                        data-panel="spectrum"
                        data-axis="x"
                        x={px}
                        y={layout.spectrumPanel.y + layout.spectrumPanel.height + 14}
                        textAnchor="middle"
                        fontSize={10}
                        fill={axisColor}
                        stroke="none"
                      >
                        {formatFrequency(t)}
                      </text>
                    </g>
                  );
                })}
              </g>
              {xLabel ? (
                <text
                  data-section="chart-line-fft-window-x-label"
                  data-panel="time"
                  x={layout.timePanel.x + layout.timePanel.width / 2}
                  y={height - 4}
                  textAnchor="middle"
                  fontSize={11}
                  fill={axisColor}
                  stroke="none"
                >
                  {xLabel}
                </text>
              ) : null}
              {yLabel ? (
                <text
                  data-section="chart-line-fft-window-y-label"
                  data-panel="time"
                  transform={`rotate(-90 12 ${layout.timePanel.y + layout.timePanel.height / 2})`}
                  x={12}
                  y={layout.timePanel.y + layout.timePanel.height / 2}
                  textAnchor="middle"
                  fontSize={11}
                  fill={axisColor}
                  stroke="none"
                >
                  {yLabel}
                </text>
              ) : null}
              <text
                data-section="chart-line-fft-window-spectrum-x-label"
                data-panel="spectrum"
                x={layout.spectrumPanel.x + layout.spectrumPanel.width / 2}
                y={height - 4}
                textAnchor="middle"
                fontSize={11}
                fill={axisColor}
                stroke="none"
              >
                {spectrumXLabel}
              </text>
              <text
                data-section="chart-line-fft-window-spectrum-y-label"
                data-panel="spectrum"
                x={layout.spectrumPanel.x + layout.spectrumPanel.width + 24}
                y={layout.spectrumPanel.y + layout.spectrumPanel.height / 2}
                textAnchor="middle"
                fontSize={11}
                fill={axisColor}
                stroke="none"
              >
                {spectrumYLabel}
              </text>
            </g>
          ) : null}

          <g data-section="chart-line-fft-window-series">
            {layout.series.map((s) => (
              <g
                key={s.id}
                data-section="chart-line-fft-window-series-group"
                data-series-id={s.id}
                data-series-color={s.color}
                data-series-window-mode={s.windowMode}
                data-series-detrend={s.detrend ? 'true' : 'false'}
                data-series-exclude-dc={s.excludeDc ? 'true' : 'false'}
                data-series-coherent-gain={s.spectrum.windowCoherentGain}
                data-series-processing-gain={s.spectrum.windowProcessingGain}
                data-series-dominant-frequency={s.dominantFrequency}
                data-series-dominant-period={s.dominantPeriod}
                data-series-dominant-magnitude={s.dominantMagnitude}
                data-series-bin-count={s.spectrumBins.length}
                data-series-finite-count={s.finiteCount}
              >
                {showWindowEnvelope && s.windowEnvelopePath ? (
                  <path
                    role="graphics-symbol"
                    aria-label={`${s.label} ${WINDOW_LABEL[s.windowMode]} window envelope`}
                    data-section="chart-line-fft-window-envelope-path"
                    data-series-id={s.id}
                    data-kind="envelope"
                    d={s.windowEnvelopePath}
                    fill="none"
                    stroke={windowColor}
                    strokeWidth={windowStrokeWidth}
                    strokeDasharray="3 3"
                    strokeOpacity={0.85}
                  />
                ) : null}
                {showRawTime && s.rawTimePath ? (
                  <path
                    role="graphics-symbol"
                    tabIndex={0}
                    aria-label={`${s.label} raw time series`}
                    data-section="chart-line-fft-window-raw-path"
                    data-series-id={s.id}
                    data-kind="raw"
                    d={s.rawTimePath}
                    fill="none"
                    stroke={s.color}
                    strokeWidth={strokeWidth}
                    strokeOpacity={0.4}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                ) : null}
                {showWindowedTime && s.windowedTimePath ? (
                  <path
                    role="graphics-symbol"
                    tabIndex={0}
                    aria-label={`${s.label} windowed (${WINDOW_LABEL[s.windowMode]}) time series`}
                    data-section="chart-line-fft-window-windowed-path"
                    data-series-id={s.id}
                    data-kind="windowed"
                    d={s.windowedTimePath}
                    fill="none"
                    stroke={s.color}
                    strokeWidth={strokeWidth + 0.25}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                ) : null}
                {showDots
                  ? s.timePoints.map((p) => {
                      const isHover =
                        hoverPayload?.kind === 'time' &&
                        hoverPayload.seriesId === s.id &&
                        hoverPayload.pointIndex === p.index;
                      return (
                        <circle
                          key={`tp-${p.index}`}
                          role="graphics-symbol"
                          tabIndex={0}
                          aria-label={`${s.label} point ${p.index + 1} at x ${formatX(p.x)} raw ${formatValue(p.rawY)} windowed ${formatValue(p.windowedY)} weight ${formatGain(p.windowWeight)}`}
                          data-section="chart-line-fft-window-time-dot"
                          data-series-id={s.id}
                          data-point-index={p.index}
                          data-x={p.x}
                          data-raw-y={p.rawY}
                          data-windowed-y={p.windowedY}
                          data-window-weight={p.windowWeight}
                          data-hovered={isHover ? 'true' : 'false'}
                          cx={p.px}
                          cy={p.windowedPy}
                          r={isHover ? dotRadius + 1 : dotRadius}
                          fill={s.color}
                          stroke="#ffffff"
                          strokeWidth={1}
                          onMouseEnter={() => {
                            setHoverPayload({
                              kind: 'time',
                              seriesId: s.id,
                              pointIndex: p.index,
                            });
                            setTooltipPos({ px: p.px, py: p.windowedPy });
                          }}
                          onMouseLeave={clearHover}
                          onFocus={() => {
                            setHoverPayload({
                              kind: 'time',
                              seriesId: s.id,
                              pointIndex: p.index,
                            });
                            setTooltipPos({ px: p.px, py: p.windowedPy });
                          }}
                          onBlur={clearHover}
                          onClick={() =>
                            onPointClick?.({ series: s, point: p })
                          }
                        />
                      );
                    })
                  : null}
                {showSpectrum
                  ? s.spectrumBins.map((b) => {
                      const isHover =
                        hoverPayload?.kind === 'bin' &&
                        hoverPayload.seriesId === s.id &&
                        hoverPayload.binK === b.k;
                      const color =
                        b.isDominant && showDominantMarker
                          ? dominantColor
                          : spectrumColor;
                      return (
                        <rect
                          key={`sb-${b.k}`}
                          role="graphics-symbol"
                          tabIndex={0}
                          aria-label={`${s.label} bin ${b.k}: frequency ${formatFrequency(b.frequency)}, period ${formatPeriod(b.period)}, magnitude ${formatMagnitude(b.magnitude)}${b.isDominant ? '; dominant' : ''}`}
                          data-section="chart-line-fft-window-bin-bar"
                          data-series-id={s.id}
                          data-bin-k={b.k}
                          data-frequency={b.frequency}
                          data-period={b.period}
                          data-magnitude={b.magnitude}
                          data-normalised-magnitude={b.normalisedMagnitude}
                          data-dominant={b.isDominant ? 'true' : 'false'}
                          data-hovered={isHover ? 'true' : 'false'}
                          x={b.barX}
                          y={b.py}
                          width={b.barWidth}
                          height={b.barHeight}
                          fill={color}
                          fillOpacity={
                            b.isDominant
                              ? 0.95
                              : 0.3 + b.normalisedMagnitude * 0.6
                          }
                          stroke="none"
                          onMouseEnter={() => {
                            setHoverPayload({
                              kind: 'bin',
                              seriesId: s.id,
                              binK: b.k,
                            });
                            setTooltipPos({ px: b.px, py: b.py });
                          }}
                          onMouseLeave={clearHover}
                          onFocus={() => {
                            setHoverPayload({
                              kind: 'bin',
                              seriesId: s.id,
                              binK: b.k,
                            });
                            setTooltipPos({ px: b.px, py: b.py });
                          }}
                          onBlur={clearHover}
                          onClick={() => onBinClick?.({ series: s, bin: b })}
                        />
                      );
                    })
                  : null}
              </g>
            ))}
          </g>
        </svg>

        {showTooltip && hoverPayload && tooltipPos
          ? (() => {
              const s = layout.series.find((x) => x.id === hoverPayload.seriesId);
              if (!s) return null;
              if (hoverPayload.kind === 'time') {
                const p = s.timePoints[hoverPayload.pointIndex];
                if (!p) return null;
                return (
                  <div
                    data-section="chart-line-fft-window-tooltip"
                    data-kind="time"
                    data-series-id={s.id}
                    data-point-index={p.index}
                    style={{
                      position: 'absolute',
                      left: tooltipPos.px + 8,
                      top: tooltipPos.py + 8,
                      background: '#0f172a',
                      color: '#f8fafc',
                      padding: '6px 8px',
                      fontSize: 11,
                      borderRadius: 4,
                      pointerEvents: 'none',
                      minWidth: 160,
                      boxShadow: '0 1px 3px rgba(0,0,0,0.18)',
                    }}
                  >
                    <div
                      data-section="chart-line-fft-window-tooltip-label"
                      style={{ color: s.color, fontWeight: 600 }}
                    >
                      {s.label}
                    </div>
                    <div data-section="chart-line-fft-window-tooltip-x">
                      x: {formatX(p.x)}
                    </div>
                    <div data-section="chart-line-fft-window-tooltip-raw">
                      raw: {formatValue(p.rawY)}
                    </div>
                    <div
                      data-section="chart-line-fft-window-tooltip-windowed"
                      style={{ fontWeight: 600 }}
                    >
                      windowed: {formatValue(p.windowedY)}
                    </div>
                    <div data-section="chart-line-fft-window-tooltip-weight">
                      window w: {formatGain(p.windowWeight)}
                    </div>
                  </div>
                );
              }
              const b = s.spectrumBins.find((x) => x.k === hoverPayload.binK);
              if (!b) return null;
              const tipColor =
                b.isDominant && showDominantMarker
                  ? dominantColor
                  : spectrumColor;
              return (
                <div
                  data-section="chart-line-fft-window-tooltip"
                  data-kind="bin"
                  data-series-id={s.id}
                  data-bin-k={b.k}
                  style={{
                    position: 'absolute',
                    left: tooltipPos.px + 8,
                    top: tooltipPos.py + 8,
                    background: '#0f172a',
                    color: '#f8fafc',
                    padding: '6px 8px',
                    fontSize: 11,
                    borderRadius: 4,
                    pointerEvents: 'none',
                    minWidth: 170,
                    boxShadow: '0 1px 3px rgba(0,0,0,0.18)',
                  }}
                >
                  <div
                    data-section="chart-line-fft-window-tooltip-label"
                    style={{ color: tipColor, fontWeight: 600 }}
                  >
                    {s.label} bin {b.k}
                  </div>
                  <div data-section="chart-line-fft-window-tooltip-frequency">
                    f: {formatFrequency(b.frequency)}
                  </div>
                  <div data-section="chart-line-fft-window-tooltip-period">
                    T: {formatPeriod(b.period)}
                  </div>
                  <div
                    data-section="chart-line-fft-window-tooltip-magnitude"
                    style={{ fontWeight: 600 }}
                  >
                    |X|: {formatMagnitude(b.magnitude)}
                  </div>
                  <div data-section="chart-line-fft-window-tooltip-gain">
                    window: {WINDOW_LABEL[s.windowMode]} (CG{' '}
                    {formatGain(s.spectrum.windowCoherentGain)})
                  </div>
                  {b.isDominant ? (
                    <div
                      data-section="chart-line-fft-window-tooltip-dominant"
                      style={{ color: dominantColor }}
                    >
                      dominant
                    </div>
                  ) : null}
                </div>
              );
            })()
          : null}
      </div>

      <div
        data-section="chart-line-fft-window-controls"
        style={{
          display: 'flex',
          gap: 12,
          alignItems: 'center',
          flexWrap: 'wrap',
          marginTop: 8,
        }}
      >
        {showWindowToggle ? (
          <div
            data-section="chart-line-fft-window-mode-toggle"
            role="radiogroup"
            aria-label="Window mode"
            style={{
              display: 'inline-flex',
              gap: 4,
              alignItems: 'center',
              fontSize: 11,
            }}
          >
            {LINE_FFT_WINDOW_MODES.map((m) => {
              const active = m === effectiveMode;
              return (
                <button
                  key={m}
                  type="button"
                  role="radio"
                  aria-checked={active ? 'true' : 'false'}
                  data-section="chart-line-fft-window-mode-button"
                  data-mode={m}
                  data-active={active ? 'true' : 'false'}
                  onClick={() => handleModeChange(m)}
                  style={{
                    padding: '2px 8px',
                    borderRadius: 4,
                    border: '1px solid',
                    borderColor: active ? '#0f172a' : '#cbd5e1',
                    background: active ? '#0f172a' : 'transparent',
                    color: active ? '#f8fafc' : '#334155',
                    cursor: 'pointer',
                  }}
                >
                  {WINDOW_LABEL[m]}
                </button>
              );
            })}
          </div>
        ) : null}
        {showLegend ? (
          <div
            data-section="chart-line-fft-window-legend"
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: 12,
              alignItems: 'center',
              fontSize: 11,
            }}
          >
            {series.map((s) => {
              const isHidden = hiddenSet.has(s.id);
              const layoutMatch = layout.series.find((x) => x.id === s.id);
              const swatchColor =
                s.color ??
                layoutMatch?.color ??
                DEFAULT_CHART_LINE_FFT_WINDOW_PALETTE[0]!;
              return (
                <button
                  key={s.id}
                  type="button"
                  data-section="chart-line-fft-window-legend-item"
                  data-series-id={s.id}
                  data-hidden={isHidden ? 'true' : 'false'}
                  onClick={() => handleToggle(s)}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                    border: 'none',
                    background: 'transparent',
                    padding: 0,
                    cursor: 'pointer',
                    opacity: isHidden ? 0.5 : 1,
                  }}
                >
                  <span
                    data-section="chart-line-fft-window-legend-swatch"
                    style={{
                      display: 'inline-block',
                      width: 10,
                      height: 10,
                      borderRadius: 2,
                      background: swatchColor,
                    }}
                  />
                  <span data-section="chart-line-fft-window-legend-label">
                    {s.label}
                  </span>
                  {layoutMatch ? (
                    <span
                      data-section="chart-line-fft-window-legend-stats"
                      style={{ fontSize: 10, color: '#64748b' }}
                    >
                      (f={formatFrequency(layoutMatch.dominantFrequency)};
                      T={formatPeriod(layoutMatch.dominantPeriod)};
                      {WINDOW_LABEL[layoutMatch.windowMode]} CG{' '}
                      {formatGain(layoutMatch.spectrum.windowCoherentGain)})
                    </span>
                  ) : null}
                </button>
              );
            })}
            <span
              data-section="chart-line-fft-window-legend-total-points"
              style={{ fontSize: 10, color: '#64748b' }}
            >
              {allTotalPoints} total points
            </span>
          </div>
        ) : null}
      </div>
    </div>
  );
});

ChartLineFftWindow.displayName = 'ChartLineFftWindow';
