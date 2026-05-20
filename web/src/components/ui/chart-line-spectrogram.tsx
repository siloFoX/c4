import {
  forwardRef,
  useCallback,
  useId,
  useMemo,
  useState,
  type CSSProperties,
  type ForwardedRef,
} from 'react';

export const DEFAULT_CHART_LINE_SPECTROGRAM_WIDTH = 640;
export const DEFAULT_CHART_LINE_SPECTROGRAM_HEIGHT = 400;
export const DEFAULT_CHART_LINE_SPECTROGRAM_PADDING = 40;
export const DEFAULT_CHART_LINE_SPECTROGRAM_GAP = 18;
export const DEFAULT_CHART_LINE_SPECTROGRAM_TICK_COUNT = 5;
export const DEFAULT_CHART_LINE_SPECTROGRAM_LINE_PANEL_RATIO = 0.32;
export const DEFAULT_CHART_LINE_SPECTROGRAM_STROKE_WIDTH = 1.5;
export const DEFAULT_CHART_LINE_SPECTROGRAM_DOT_RADIUS = 2.5;
export const DEFAULT_CHART_LINE_SPECTROGRAM_WINDOW_SIZE = 32;
export const DEFAULT_CHART_LINE_SPECTROGRAM_HOP_RATIO = 0.5;
export const DEFAULT_CHART_LINE_SPECTROGRAM_LINE_COLOR = '#0f172a';
export const DEFAULT_CHART_LINE_SPECTROGRAM_DOMINANT_COLOR = '#ef4444';
export const DEFAULT_CHART_LINE_SPECTROGRAM_LOW_COLOR = '#0f172a';
export const DEFAULT_CHART_LINE_SPECTROGRAM_MID_COLOR = '#7c3aed';
export const DEFAULT_CHART_LINE_SPECTROGRAM_HIGH_COLOR = '#facc15';
export const DEFAULT_CHART_LINE_SPECTROGRAM_GRID_COLOR = '#e2e8f0';
export const DEFAULT_CHART_LINE_SPECTROGRAM_AXIS_COLOR = '#cbd5e1';

export type ChartLineSpectrogramWindowMode =
  | 'rectangular'
  | 'hann'
  | 'hamming'
  | 'blackman';

export const LINE_SPECTROGRAM_WINDOW_MODES: ChartLineSpectrogramWindowMode[] = [
  'rectangular',
  'hann',
  'hamming',
  'blackman',
];

const WINDOW_LABEL: Record<ChartLineSpectrogramWindowMode, string> = {
  rectangular: 'Rect',
  hann: 'Hann',
  hamming: 'Hamming',
  blackman: 'Blackman',
};

export interface ChartLineSpectrogramPoint {
  x: number;
  y: number;
}

export interface ChartLineSpectrogramFrame {
  frameIndex: number;
  centerSampleIndex: number;
  centerX: number;
  startX: number;
  endX: number;
  magnitudes: number[];
  dominantBin: number;
  dominantFrequency: number;
  dominantMagnitude: number;
}

export interface ChartLineSpectrogramResult {
  ok: boolean;
  frames: ChartLineSpectrogramFrame[];
  windowSize: number;
  hopSize: number;
  windowMode: ChartLineSpectrogramWindowMode;
  binCount: number;
  maxMagnitude: number;
  frequencies: number[];
  totalSamples: number;
  sampleStep: number;
}

export interface ChartLineSpectrogramLayoutCell {
  frameIndex: number;
  binIndex: number;
  frequency: number;
  magnitude: number;
  normalisedMagnitude: number;
  x: number;
  y: number;
  width: number;
  height: number;
  color: string;
  isDominant: boolean;
}

export interface ChartLineSpectrogramLayoutTimePoint {
  index: number;
  x: number;
  y: number;
  px: number;
  py: number;
}

export interface ChartLineSpectrogramLayout {
  ok: boolean;
  width: number;
  height: number;
  linePanel: { x: number; y: number; width: number; height: number };
  spectrogramPanel: { x: number; y: number; width: number; height: number };
  timePoints: ChartLineSpectrogramLayoutTimePoint[];
  timePath: string;
  cells: ChartLineSpectrogramLayoutCell[];
  cellsByFrame: ChartLineSpectrogramLayoutCell[][];
  dominantTrack: { frameIndex: number; centerX: number; px: number; py: number; frequency: number; magnitude: number }[];
  dominantTrackPath: string;
  xTicks: number[];
  yTicks: number[];
  freqTicks: number[];
  xMin: number;
  xMax: number;
  yMin: number;
  yMax: number;
  freqMin: number;
  freqMax: number;
  magMin: number;
  magMax: number;
  totalPoints: number;
  spectrogram: ChartLineSpectrogramResult;
}

export interface ComputeLineSpectrogramLayoutOptions {
  data: readonly ChartLineSpectrogramPoint[];
  width: number;
  height: number;
  padding: number;
  gap?: number;
  tickCount?: number;
  linePanelRatio?: number;
  windowSize?: number;
  hopSize?: number;
  windowMode?: ChartLineSpectrogramWindowMode;
  detrend?: boolean;
  excludeDc?: boolean;
  lowColor?: string;
  midColor?: string;
  highColor?: string;
  dominantColor?: string;
  xMin?: number;
  xMax?: number;
  yMin?: number;
  yMax?: number;
}

export interface ChartLineSpectrogramProps {
  data: readonly ChartLineSpectrogramPoint[];
  windowSize?: number;
  hopSize?: number;
  windowMode?: ChartLineSpectrogramWindowMode;
  defaultWindowMode?: ChartLineSpectrogramWindowMode;
  onWindowModeChange?: (mode: ChartLineSpectrogramWindowMode) => void;
  detrend?: boolean;
  excludeDc?: boolean;
  width?: number;
  height?: number;
  padding?: number;
  gap?: number;
  tickCount?: number;
  linePanelRatio?: number;
  strokeWidth?: number;
  dotRadius?: number;
  lineColor?: string;
  lowColor?: string;
  midColor?: string;
  highColor?: string;
  dominantColor?: string;
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
  showDominantTrack?: boolean;
  showLine?: boolean;
  showWindowToggle?: boolean;
  showColorScale?: boolean;
  animate?: boolean;
  className?: string;
  ariaLabel?: string;
  ariaDescription?: string;
  formatValue?: (n: number) => string;
  formatX?: (n: number) => string;
  formatFrequency?: (n: number) => string;
  formatMagnitude?: (n: number) => string;
  xLabel?: string;
  yLabel?: string;
  spectrogramYLabel?: string;
  onCellClick?: (payload: { cell: ChartLineSpectrogramLayoutCell }) => void;
  onPointClick?: (payload: { point: ChartLineSpectrogramLayoutTimePoint }) => void;
  style?: CSSProperties;
}

function isFiniteNumber(n: unknown): n is number {
  return typeof n === 'number' && Number.isFinite(n);
}

export function getLineSpectrogramFinitePoints(
  points: readonly ChartLineSpectrogramPoint[] | null | undefined,
): ChartLineSpectrogramPoint[] {
  if (!Array.isArray(points)) return [];
  return points.filter(
    (p): p is ChartLineSpectrogramPoint =>
      !!p && isFiniteNumber(p.x) && isFiniteNumber(p.y),
  );
}

export function normaliseLineSpectrogramWindowSize(value: unknown): number {
  if (!isFiniteNumber(value)) return DEFAULT_CHART_LINE_SPECTROGRAM_WINDOW_SIZE;
  if (value < 2) return 2;
  return Math.floor(value);
}

export function normaliseLineSpectrogramHopSize(
  value: unknown,
  windowSize: number,
): number {
  const w = normaliseLineSpectrogramWindowSize(windowSize);
  if (!isFiniteNumber(value)) {
    return Math.max(1, Math.floor(w * DEFAULT_CHART_LINE_SPECTROGRAM_HOP_RATIO));
  }
  if (value < 1) return 1;
  if (value > w) return w;
  return Math.floor(value);
}

export function normaliseLineSpectrogramWindowMode(
  value: unknown,
): ChartLineSpectrogramWindowMode {
  if (
    typeof value === 'string' &&
    LINE_SPECTROGRAM_WINDOW_MODES.includes(
      value as ChartLineSpectrogramWindowMode,
    )
  ) {
    return value as ChartLineSpectrogramWindowMode;
  }
  return 'hann';
}

export function normaliseLineSpectrogramPanelRatio(value: unknown): number {
  if (!isFiniteNumber(value)) {
    return DEFAULT_CHART_LINE_SPECTROGRAM_LINE_PANEL_RATIO;
  }
  if (value <= 0) return 0.1;
  if (value >= 1) return 0.6;
  return value;
}

export function computeLineSpectrogramWindowCoefficients(
  N: number,
  mode: ChartLineSpectrogramWindowMode = 'hann',
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

function detrendValues(values: readonly number[]): number[] {
  if (values.length === 0) return [];
  let sum = 0;
  let count = 0;
  for (const v of values) {
    if (isFiniteNumber(v)) {
      sum += v;
      count += 1;
    }
  }
  const mean = count > 0 ? sum / count : 0;
  return values.map((v) => (isFiniteNumber(v) ? v - mean : 0));
}

function dftMagnitudes(values: readonly number[]): number[] {
  const N = values.length;
  if (N === 0) return [];
  const halfN = Math.floor(N / 2) + 1;
  const out = new Array(halfN);
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
    out[k] = Math.sqrt(real * real + imag * imag);
  }
  return out;
}

export function computeLineSpectrogram(
  points: readonly ChartLineSpectrogramPoint[] | null | undefined,
  options?: {
    windowSize?: number;
    hopSize?: number;
    windowMode?: ChartLineSpectrogramWindowMode;
    detrend?: boolean;
    excludeDc?: boolean;
  },
): ChartLineSpectrogramResult {
  const W = normaliseLineSpectrogramWindowSize(options?.windowSize);
  const H = normaliseLineSpectrogramHopSize(options?.hopSize, W);
  const mode = normaliseLineSpectrogramWindowMode(options?.windowMode);
  const detrend = options?.detrend !== false; // default true
  const excludeDc = options?.excludeDc !== false; // default true
  const binCount = Math.floor(W / 2) + 1;

  const empty: ChartLineSpectrogramResult = {
    ok: false,
    frames: [],
    windowSize: W,
    hopSize: H,
    windowMode: mode,
    binCount,
    maxMagnitude: 0,
    frequencies: [],
    totalSamples: 0,
    sampleStep: 1,
  };

  const finite = getLineSpectrogramFinitePoints(points);
  if (finite.length < W) return empty;
  const sorted = [...finite].sort((a, b) => a.x - b.x);
  const N = sorted.length;
  const ys = sorted.map((p) => p.y);
  const baseValues = detrend ? detrendValues(ys) : ys.slice();
  const coefficients = computeLineSpectrogramWindowCoefficients(W, mode);
  const sampleStep =
    sorted.length >= 2
      ? (sorted[sorted.length - 1]!.x - sorted[0]!.x) / (N - 1)
      : 1;
  const fundamentalFrequency = sampleStep > 0 ? 1 / (W * sampleStep) : 1 / W;

  const frequencies = new Array(binCount);
  for (let k = 0; k < binCount; k += 1) {
    frequencies[k] = k * fundamentalFrequency;
  }

  const frames: ChartLineSpectrogramFrame[] = [];
  let maxMag = 0;
  let frameIdx = 0;
  for (let start = 0; start + W <= N; start += H) {
    const windowSamples = new Array(W);
    for (let i = 0; i < W; i += 1) {
      const v = baseValues[start + i];
      const w = coefficients[i];
      windowSamples[i] =
        isFiniteNumber(v) && isFiniteNumber(w) ? v * w : 0;
    }
    const magnitudes = dftMagnitudes(windowSamples);
    let dominantBin = 0;
    let dominantMag = -1;
    for (let k = 0; k < magnitudes.length; k += 1) {
      if (excludeDc && k === 0) continue;
      if (magnitudes[k]! > dominantMag) {
        dominantBin = k;
        dominantMag = magnitudes[k]!;
      }
      if (magnitudes[k]! > maxMag) maxMag = magnitudes[k]!;
    }
    const centerSampleIndex = start + Math.floor(W / 2);
    const startX = sorted[start]!.x;
    const endIdx = Math.min(start + W - 1, N - 1);
    const endX = sorted[endIdx]!.x;
    const centerX = sorted[Math.min(centerSampleIndex, N - 1)]!.x;
    frames.push({
      frameIndex: frameIdx,
      centerSampleIndex,
      centerX,
      startX,
      endX,
      magnitudes,
      dominantBin,
      dominantFrequency: dominantBin * fundamentalFrequency,
      dominantMagnitude: dominantMag < 0 ? 0 : dominantMag,
    });
    frameIdx += 1;
  }

  return {
    ok: frames.length > 0,
    frames,
    windowSize: W,
    hopSize: H,
    windowMode: mode,
    binCount,
    maxMagnitude: maxMag,
    frequencies,
    totalSamples: N,
    sampleStep,
  };
}

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const m = hex.replace('#', '').match(/^([0-9a-f]{6})$/i);
  if (!m) return null;
  const v = parseInt(m[1]!, 16);
  return { r: (v >> 16) & 0xff, g: (v >> 8) & 0xff, b: v & 0xff };
}

function interpolateRgb(
  a: { r: number; g: number; b: number },
  b: { r: number; g: number; b: number },
  t: number,
): { r: number; g: number; b: number } {
  return {
    r: Math.round(a.r + (b.r - a.r) * t),
    g: Math.round(a.g + (b.g - a.g) * t),
    b: Math.round(a.b + (b.b - a.b) * t),
  };
}

function rgbToString(c: { r: number; g: number; b: number }): string {
  return `rgb(${c.r}, ${c.g}, ${c.b})`;
}

export function getLineSpectrogramScaleColor(
  t: number,
  lowColor: string = DEFAULT_CHART_LINE_SPECTROGRAM_LOW_COLOR,
  midColor: string = DEFAULT_CHART_LINE_SPECTROGRAM_MID_COLOR,
  highColor: string = DEFAULT_CHART_LINE_SPECTROGRAM_HIGH_COLOR,
): string {
  if (!isFiniteNumber(t)) return lowColor;
  const clamped = Math.max(0, Math.min(1, t));
  const lo = hexToRgb(lowColor);
  const mid = hexToRgb(midColor);
  const hi = hexToRgb(highColor);
  if (!lo || !mid || !hi) return lowColor;
  if (clamped <= 0.5) {
    return rgbToString(interpolateRgb(lo, mid, clamped * 2));
  }
  return rgbToString(interpolateRgb(mid, hi, (clamped - 0.5) * 2));
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

function computeTicks(min: number, max: number, count: number): number[] {
  if (!isFiniteNumber(min) || !isFiniteNumber(max) || count < 2) return [];
  if (min === max) return [min];
  const step = (max - min) / (count - 1);
  const ticks: number[] = [];
  for (let i = 0; i < count; i += 1) ticks.push(min + step * i);
  return ticks;
}

export function computeLineSpectrogramLayout(
  options: ComputeLineSpectrogramLayoutOptions,
): ChartLineSpectrogramLayout {
  const {
    data,
    width,
    height,
    padding,
    gap = DEFAULT_CHART_LINE_SPECTROGRAM_GAP,
    tickCount = DEFAULT_CHART_LINE_SPECTROGRAM_TICK_COUNT,
    linePanelRatio,
    windowSize,
    hopSize,
    windowMode,
    detrend,
    excludeDc,
    lowColor = DEFAULT_CHART_LINE_SPECTROGRAM_LOW_COLOR,
    midColor = DEFAULT_CHART_LINE_SPECTROGRAM_MID_COLOR,
    highColor = DEFAULT_CHART_LINE_SPECTROGRAM_HIGH_COLOR,
    dominantColor = DEFAULT_CHART_LINE_SPECTROGRAM_DOMINANT_COLOR,
    xMin: xMinOverride,
    xMax: xMaxOverride,
    yMin: yMinOverride,
    yMax: yMaxOverride,
  } = options;

  const innerWidth = width - padding * 2;
  const innerHeight = height - padding * 2;
  const ratio = normaliseLineSpectrogramPanelRatio(linePanelRatio);
  const usableHeight = Math.max(0, innerHeight - gap);
  const lineHeight = Math.max(0, usableHeight * ratio);
  const specHeight = Math.max(0, usableHeight - lineHeight);

  const finite = getLineSpectrogramFinitePoints(data);
  const spectrogram = computeLineSpectrogram(finite, {
    windowSize,
    hopSize,
    windowMode,
    detrend,
    excludeDc,
  });

  const empty: ChartLineSpectrogramLayout = {
    ok: false,
    width,
    height,
    linePanel: {
      x: padding,
      y: padding,
      width: innerWidth,
      height: lineHeight,
    },
    spectrogramPanel: {
      x: padding,
      y: padding + lineHeight + gap,
      width: innerWidth,
      height: specHeight,
    },
    timePoints: [],
    timePath: '',
    cells: [],
    cellsByFrame: [],
    dominantTrack: [],
    dominantTrackPath: '',
    xTicks: [],
    yTicks: [],
    freqTicks: [],
    xMin: 0,
    xMax: 0,
    yMin: 0,
    yMax: 0,
    freqMin: 0,
    freqMax: 0,
    magMin: 0,
    magMax: 0,
    totalPoints: 0,
    spectrogram,
  };

  if (
    innerWidth <= 0 ||
    lineHeight <= 0 ||
    specHeight <= 0 ||
    finite.length === 0 ||
    !spectrogram.ok
  ) {
    return empty;
  }

  const sorted = [...finite].sort((a, b) => a.x - b.x);
  let xLo = sorted[0]!.x;
  let xHi = sorted[sorted.length - 1]!.x;
  let yLo = Number.POSITIVE_INFINITY;
  let yHi = Number.NEGATIVE_INFINITY;
  for (const p of sorted) {
    if (p.y < yLo) yLo = p.y;
    if (p.y > yHi) yHi = p.y;
  }
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
  const xRange = xHi - xLo;
  const yRange = yHi - yLo;

  const linePanel = {
    x: padding,
    y: padding,
    width: innerWidth,
    height: lineHeight,
  };
  const spectrogramPanel = {
    x: padding,
    y: padding + lineHeight + gap,
    width: innerWidth,
    height: specHeight,
  };

  const projectX = (x: number): number =>
    linePanel.x + ((x - xLo) / xRange) * linePanel.width;
  const projectLineY = (y: number): number =>
    linePanel.y + linePanel.height - ((y - yLo) / yRange) * linePanel.height;

  const timePoints: ChartLineSpectrogramLayoutTimePoint[] = sorted.map(
    (p, i) => ({
      index: i,
      x: p.x,
      y: p.y,
      px: projectX(p.x),
      py: projectLineY(p.y),
    }),
  );
  const timePath = buildPath(timePoints);

  // Spectrogram cells: each frame is a column, each bin is a row.
  // Optionally drop the DC bin (k=0) from the visualisation when
  // excludeDc=true (default).
  const includeDc = !spectrogram.frames.some(() => false) && (excludeDc === false);
  const startBin = excludeDc === false ? 0 : 1;
  const visibleBins = Math.max(0, spectrogram.binCount - startBin);
  const numFrames = spectrogram.frames.length;
  const cellWidth = numFrames > 0 ? spectrogramPanel.width / numFrames : 0;
  const cellHeight = visibleBins > 0 ? spectrogramPanel.height / visibleBins : 0;
  const freqLo = spectrogram.frequencies[startBin] ?? 0;
  const freqHi = spectrogram.frequencies[spectrogram.frequencies.length - 1] ?? 0;
  const maxMag = spectrogram.maxMagnitude > 0 ? spectrogram.maxMagnitude : 1;

  const cells: ChartLineSpectrogramLayoutCell[] = [];
  const cellsByFrame: ChartLineSpectrogramLayoutCell[][] = [];

  for (let f = 0; f < numFrames; f += 1) {
    const frame = spectrogram.frames[f]!;
    const frameCells: ChartLineSpectrogramLayoutCell[] = [];
    for (let k = startBin; k < spectrogram.binCount; k += 1) {
      const visibleIdx = k - startBin;
      const x = spectrogramPanel.x + f * cellWidth;
      // Higher frequency at the top of the panel (lower py)
      const y =
        spectrogramPanel.y +
        spectrogramPanel.height -
        (visibleIdx + 1) * cellHeight;
      const magnitude = frame.magnitudes[k] ?? 0;
      const normalised = magnitude / maxMag;
      const color = getLineSpectrogramScaleColor(
        normalised,
        lowColor,
        midColor,
        highColor,
      );
      const cell: ChartLineSpectrogramLayoutCell = {
        frameIndex: f,
        binIndex: k,
        frequency: spectrogram.frequencies[k] ?? 0,
        magnitude,
        normalisedMagnitude: normalised,
        x,
        y,
        width: cellWidth,
        height: cellHeight,
        color,
        isDominant: k === frame.dominantBin,
      };
      cells.push(cell);
      frameCells.push(cell);
    }
    cellsByFrame.push(frameCells);
  }

  const dominantTrack = spectrogram.frames.map((frame, i) => {
    const px = spectrogramPanel.x + (i + 0.5) * cellWidth;
    const visibleIdx = frame.dominantBin - startBin;
    const py =
      spectrogramPanel.y +
      spectrogramPanel.height -
      (visibleIdx + 0.5) * cellHeight;
    return {
      frameIndex: i,
      centerX: frame.centerX,
      px,
      py,
      frequency: frame.dominantFrequency,
      magnitude: frame.dominantMagnitude,
    };
  });

  const dominantTrackPath = buildPath(dominantTrack);

  return {
    ok: true,
    width,
    height,
    linePanel,
    spectrogramPanel,
    timePoints,
    timePath,
    cells,
    cellsByFrame,
    dominantTrack,
    dominantTrackPath,
    xTicks: computeTicks(xLo, xHi, tickCount),
    yTicks: computeTicks(yLo, yHi, tickCount),
    freqTicks: computeTicks(freqLo, freqHi, tickCount),
    xMin: xLo,
    xMax: xHi,
    yMin: yLo,
    yMax: yHi,
    freqMin: freqLo,
    freqMax: freqHi,
    magMin: 0,
    magMax: maxMag,
    totalPoints: finite.length,
    spectrogram,
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

function defaultFormatMagnitude(n: number): string {
  if (!isFiniteNumber(n)) return '';
  return n.toFixed(2);
}

export function describeLineSpectrogramChart(
  data: readonly ChartLineSpectrogramPoint[] | null | undefined,
  options?: {
    windowSize?: number;
    hopSize?: number;
    windowMode?: ChartLineSpectrogramWindowMode;
    detrend?: boolean;
    excludeDc?: boolean;
    formatFrequency?: (n: number) => string;
  },
): string {
  const spectrogram = computeLineSpectrogram(data, options);
  if (!spectrogram.ok || spectrogram.frames.length === 0) return 'No data';
  const fmtF = options?.formatFrequency ?? defaultFormatFrequency;
  return `Spectrogram across ${spectrogram.frames.length} STFT frames (window ${spectrogram.windowSize}, hop ${spectrogram.hopSize}, ${WINDOW_LABEL[spectrogram.windowMode]} window). ${spectrogram.binCount} frequency bins from ${fmtF(spectrogram.frequencies[0] ?? 0)} to ${fmtF(spectrogram.frequencies[spectrogram.frequencies.length - 1] ?? 0)}.`;
}

export const ChartLineSpectrogram = forwardRef<
  HTMLDivElement,
  ChartLineSpectrogramProps
>(function ChartLineSpectrogram(
  props: ChartLineSpectrogramProps,
  ref: ForwardedRef<HTMLDivElement>,
) {
  const {
    data,
    windowSize = DEFAULT_CHART_LINE_SPECTROGRAM_WINDOW_SIZE,
    hopSize,
    windowMode: controlledMode,
    defaultWindowMode = 'hann',
    onWindowModeChange,
    detrend = true,
    excludeDc = true,
    width = DEFAULT_CHART_LINE_SPECTROGRAM_WIDTH,
    height = DEFAULT_CHART_LINE_SPECTROGRAM_HEIGHT,
    padding = DEFAULT_CHART_LINE_SPECTROGRAM_PADDING,
    gap = DEFAULT_CHART_LINE_SPECTROGRAM_GAP,
    tickCount = DEFAULT_CHART_LINE_SPECTROGRAM_TICK_COUNT,
    linePanelRatio = DEFAULT_CHART_LINE_SPECTROGRAM_LINE_PANEL_RATIO,
    strokeWidth = DEFAULT_CHART_LINE_SPECTROGRAM_STROKE_WIDTH,
    dotRadius = DEFAULT_CHART_LINE_SPECTROGRAM_DOT_RADIUS,
    lineColor = DEFAULT_CHART_LINE_SPECTROGRAM_LINE_COLOR,
    lowColor = DEFAULT_CHART_LINE_SPECTROGRAM_LOW_COLOR,
    midColor = DEFAULT_CHART_LINE_SPECTROGRAM_MID_COLOR,
    highColor = DEFAULT_CHART_LINE_SPECTROGRAM_HIGH_COLOR,
    dominantColor = DEFAULT_CHART_LINE_SPECTROGRAM_DOMINANT_COLOR,
    gridColor = DEFAULT_CHART_LINE_SPECTROGRAM_GRID_COLOR,
    axisColor = DEFAULT_CHART_LINE_SPECTROGRAM_AXIS_COLOR,
    xMin,
    xMax,
    yMin,
    yMax,
    showAxis = true,
    showGrid = true,
    showDots = false,
    showLegend = true,
    showTooltip = true,
    showDominantBadge = true,
    showDominantTrack = true,
    showLine = true,
    showWindowToggle = true,
    showColorScale = true,
    animate = true,
    className,
    ariaLabel = 'Line chart with spectrogram heatmap',
    ariaDescription,
    formatValue = defaultFormatValue,
    formatX = defaultFormatValue,
    formatFrequency = defaultFormatFrequency,
    formatMagnitude = defaultFormatMagnitude,
    xLabel,
    yLabel,
    spectrogramYLabel = 'Frequency',
    onCellClick,
    onPointClick,
    style,
  } = props;

  const reactId = useId();
  const descId = `${reactId}-desc`;

  const isControlledMode = controlledMode !== undefined;
  const [uncontrolledMode, setUncontrolledMode] = useState<
    ChartLineSpectrogramWindowMode
  >(() => normaliseLineSpectrogramWindowMode(defaultWindowMode));
  const effectiveMode = isControlledMode
    ? normaliseLineSpectrogramWindowMode(controlledMode)
    : uncontrolledMode;

  const layout = useMemo(
    () =>
      computeLineSpectrogramLayout({
        data,
        width,
        height,
        padding,
        gap,
        tickCount,
        linePanelRatio,
        windowSize,
        ...(isFiniteNumber(hopSize) ? { hopSize } : {}),
        windowMode: effectiveMode,
        detrend,
        excludeDc,
        lowColor,
        midColor,
        highColor,
        dominantColor,
        ...(isFiniteNumber(xMin) ? { xMin } : {}),
        ...(isFiniteNumber(xMax) ? { xMax } : {}),
        ...(isFiniteNumber(yMin) ? { yMin } : {}),
        ...(isFiniteNumber(yMax) ? { yMax } : {}),
      }),
    [
      data,
      width,
      height,
      padding,
      gap,
      tickCount,
      linePanelRatio,
      windowSize,
      hopSize,
      effectiveMode,
      detrend,
      excludeDc,
      lowColor,
      midColor,
      highColor,
      dominantColor,
      xMin,
      xMax,
      yMin,
      yMax,
    ],
  );

  const summary = useMemo(
    () =>
      ariaDescription ??
      describeLineSpectrogramChart(data, {
        windowSize,
        ...(isFiniteNumber(hopSize) ? { hopSize } : {}),
        windowMode: effectiveMode,
        detrend,
        excludeDc,
        formatFrequency,
      }),
    [
      ariaDescription,
      data,
      windowSize,
      hopSize,
      effectiveMode,
      detrend,
      excludeDc,
      formatFrequency,
    ],
  );

  const handleModeChange = useCallback(
    (next: ChartLineSpectrogramWindowMode) => {
      if (!isControlledMode) setUncontrolledMode(next);
      onWindowModeChange?.(next);
    },
    [isControlledMode, onWindowModeChange],
  );

  const [hoverPayload, setHoverPayload] = useState<
    | { kind: 'time'; pointIndex: number }
    | { kind: 'cell'; frameIndex: number; binIndex: number }
    | null
  >(null);
  const [tooltipPos, setTooltipPos] = useState<{ px: number; py: number } | null>(
    null,
  );

  const clearHover = useCallback(() => {
    setHoverPayload(null);
    setTooltipPos(null);
  }, []);

  const peakFrame = useMemo<ChartLineSpectrogramFrame | null>(() => {
    if (!layout.ok) return null;
    let best: ChartLineSpectrogramFrame | null = null;
    for (const f of layout.spectrogram.frames) {
      if (!best || f.dominantMagnitude > best.dominantMagnitude) best = f;
    }
    return best;
  }, [layout]);

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
        data-section="chart-line-spectrogram"
        data-empty="true"
        data-window-size={normaliseLineSpectrogramWindowSize(windowSize)}
        data-window-mode={effectiveMode}
        data-frame-count={0}
        data-bin-count={layout.spectrogram.binCount}
        data-animate={animate ? 'true' : 'false'}
      >
        <span
          id={descId}
          data-section="chart-line-spectrogram-aria-desc"
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
      data-section="chart-line-spectrogram"
      data-empty="false"
      data-window-size={layout.spectrogram.windowSize}
      data-hop-size={layout.spectrogram.hopSize}
      data-window-mode={layout.spectrogram.windowMode}
      data-frame-count={layout.spectrogram.frames.length}
      data-bin-count={layout.spectrogram.binCount}
      data-total-points={layout.totalPoints}
      data-max-magnitude={layout.magMax}
      data-peak-frame-index={peakFrame?.frameIndex ?? -1}
      data-peak-frequency={peakFrame?.dominantFrequency ?? 0}
      data-detrend={detrend ? 'true' : 'false'}
      data-exclude-dc={excludeDc ? 'true' : 'false'}
      data-animate={animate ? 'true' : 'false'}
    >
      <span
        id={descId}
        data-section="chart-line-spectrogram-aria-desc"
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
        data-section="chart-line-spectrogram-canvas"
        style={{ position: 'relative', width, height }}
      >
        {showDominantBadge && peakFrame ? (
          <div
            data-section="chart-line-spectrogram-badge"
            data-window-mode={effectiveMode}
            data-window-size={layout.spectrogram.windowSize}
            data-peak-frequency={peakFrame.dominantFrequency}
            data-peak-magnitude={peakFrame.dominantMagnitude}
            data-peak-frame-index={peakFrame.frameIndex}
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
              data-section="chart-line-spectrogram-badge-icon"
              aria-hidden="true"
            >
              ▦
            </span>
            <span data-section="chart-line-spectrogram-badge-frames">
              {layout.spectrogram.frames.length} frames
            </span>
            <span data-section="chart-line-spectrogram-badge-window">
              [{WINDOW_LABEL[effectiveMode]} {layout.spectrogram.windowSize}]
            </span>
            <span data-section="chart-line-spectrogram-badge-peak">
              peak f={formatFrequency(peakFrame.dominantFrequency)}
            </span>
          </div>
        ) : null}

        <svg
          role="img"
          aria-label={ariaLabel}
          width={width}
          height={height}
          data-section="chart-line-spectrogram-svg"
          style={{ display: 'block', overflow: 'visible' }}
        >
          {showGrid ? (
            <g
              data-section="chart-line-spectrogram-grid"
              stroke={gridColor}
              strokeWidth={1}
            >
              {layout.yTicks.map((t, i) => {
                const py =
                  layout.linePanel.y +
                  layout.linePanel.height -
                  ((t - layout.yMin) / (layout.yMax - layout.yMin)) *
                    layout.linePanel.height;
                return (
                  <line
                    key={`gy-${i}`}
                    data-section="chart-line-spectrogram-grid-line"
                    data-panel="line"
                    data-axis="y"
                    x1={layout.linePanel.x}
                    x2={layout.linePanel.x + layout.linePanel.width}
                    y1={py}
                    y2={py}
                  />
                );
              })}
              {layout.xTicks.map((t, i) => {
                const px =
                  layout.linePanel.x +
                  ((t - layout.xMin) / (layout.xMax - layout.xMin)) *
                    layout.linePanel.width;
                return (
                  <line
                    key={`gx-${i}`}
                    data-section="chart-line-spectrogram-grid-line"
                    data-panel="line"
                    data-axis="x"
                    x1={px}
                    x2={px}
                    y1={layout.linePanel.y}
                    y2={layout.linePanel.y + layout.linePanel.height}
                  />
                );
              })}
            </g>
          ) : null}

          {showAxis ? (
            <g
              data-section="chart-line-spectrogram-axes"
              stroke={axisColor}
              strokeWidth={1}
            >
              <line
                data-section="chart-line-spectrogram-axis"
                data-panel="line"
                data-axis="x"
                x1={layout.linePanel.x}
                y1={layout.linePanel.y + layout.linePanel.height}
                x2={layout.linePanel.x + layout.linePanel.width}
                y2={layout.linePanel.y + layout.linePanel.height}
              />
              <line
                data-section="chart-line-spectrogram-axis"
                data-panel="line"
                data-axis="y"
                x1={layout.linePanel.x}
                y1={layout.linePanel.y}
                x2={layout.linePanel.x}
                y2={layout.linePanel.y + layout.linePanel.height}
              />
              <line
                data-section="chart-line-spectrogram-axis"
                data-panel="spectrogram"
                data-axis="x"
                x1={layout.spectrogramPanel.x}
                y1={layout.spectrogramPanel.y + layout.spectrogramPanel.height}
                x2={layout.spectrogramPanel.x + layout.spectrogramPanel.width}
                y2={layout.spectrogramPanel.y + layout.spectrogramPanel.height}
              />
              <line
                data-section="chart-line-spectrogram-axis"
                data-panel="spectrogram"
                data-axis="y"
                x1={layout.spectrogramPanel.x}
                y1={layout.spectrogramPanel.y}
                x2={layout.spectrogramPanel.x}
                y2={layout.spectrogramPanel.y + layout.spectrogramPanel.height}
              />
              <g
                data-section="chart-line-spectrogram-ticks"
                data-panel="line"
                data-axis="y"
              >
                {layout.yTicks.map((t, i) => {
                  const py =
                    layout.linePanel.y +
                    layout.linePanel.height -
                    ((t - layout.yMin) / (layout.yMax - layout.yMin)) *
                      layout.linePanel.height;
                  return (
                    <g
                      key={`tyl-${i}`}
                      data-section="chart-line-spectrogram-tick"
                      data-panel="line"
                      data-axis="y"
                    >
                      <line
                        x1={layout.linePanel.x - 4}
                        x2={layout.linePanel.x}
                        y1={py}
                        y2={py}
                      />
                      <text
                        data-section="chart-line-spectrogram-tick-label"
                        data-panel="line"
                        data-axis="y"
                        x={layout.linePanel.x - 6}
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
                data-section="chart-line-spectrogram-ticks"
                data-panel="spectrogram"
                data-axis="y"
              >
                {layout.freqTicks.map((t, i) => {
                  const py =
                    layout.spectrogramPanel.y +
                    layout.spectrogramPanel.height -
                    ((t - layout.freqMin) / (layout.freqMax - layout.freqMin)) *
                      layout.spectrogramPanel.height;
                  return (
                    <g
                      key={`tyf-${i}`}
                      data-section="chart-line-spectrogram-tick"
                      data-panel="spectrogram"
                      data-axis="y"
                    >
                      <line
                        x1={layout.spectrogramPanel.x - 4}
                        x2={layout.spectrogramPanel.x}
                        y1={py}
                        y2={py}
                      />
                      <text
                        data-section="chart-line-spectrogram-tick-label"
                        data-panel="spectrogram"
                        data-axis="y"
                        x={layout.spectrogramPanel.x - 6}
                        y={py + 3}
                        textAnchor="end"
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
              <g
                data-section="chart-line-spectrogram-ticks"
                data-axis="x"
              >
                {layout.xTicks.map((t, i) => {
                  const px =
                    layout.linePanel.x +
                    ((t - layout.xMin) / (layout.xMax - layout.xMin)) *
                      layout.linePanel.width;
                  return (
                    <g
                      key={`tx-${i}`}
                      data-section="chart-line-spectrogram-tick"
                      data-axis="x"
                    >
                      <line
                        x1={px}
                        x2={px}
                        y1={layout.spectrogramPanel.y + layout.spectrogramPanel.height}
                        y2={layout.spectrogramPanel.y + layout.spectrogramPanel.height + 4}
                      />
                      <text
                        data-section="chart-line-spectrogram-tick-label"
                        data-axis="x"
                        x={px}
                        y={layout.spectrogramPanel.y + layout.spectrogramPanel.height + 14}
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
              {xLabel ? (
                <text
                  data-section="chart-line-spectrogram-x-label"
                  x={layout.linePanel.x + layout.linePanel.width / 2}
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
                  data-section="chart-line-spectrogram-y-label"
                  data-panel="line"
                  transform={`rotate(-90 12 ${layout.linePanel.y + layout.linePanel.height / 2})`}
                  x={12}
                  y={layout.linePanel.y + layout.linePanel.height / 2}
                  textAnchor="middle"
                  fontSize={11}
                  fill={axisColor}
                  stroke="none"
                >
                  {yLabel}
                </text>
              ) : null}
              <text
                data-section="chart-line-spectrogram-spectrogram-y-label"
                data-panel="spectrogram"
                transform={`rotate(-90 12 ${layout.spectrogramPanel.y + layout.spectrogramPanel.height / 2})`}
                x={12}
                y={layout.spectrogramPanel.y + layout.spectrogramPanel.height / 2}
                textAnchor="middle"
                fontSize={11}
                fill={axisColor}
                stroke="none"
              >
                {spectrogramYLabel}
              </text>
            </g>
          ) : null}

          {showLine && layout.timePath ? (
            <path
              role="graphics-symbol"
              tabIndex={0}
              aria-label="Time-domain signal"
              data-section="chart-line-spectrogram-time-path"
              data-kind="time"
              d={layout.timePath}
              fill="none"
              stroke={lineColor}
              strokeWidth={strokeWidth}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          ) : null}
          {showDots && showLine
            ? layout.timePoints.map((p) => {
                const isHover =
                  hoverPayload?.kind === 'time' &&
                  hoverPayload.pointIndex === p.index;
                return (
                  <circle
                    key={`td-${p.index}`}
                    role="graphics-symbol"
                    tabIndex={0}
                    aria-label={`Sample ${p.index + 1} at x ${formatX(p.x)} y ${formatValue(p.y)}`}
                    data-section="chart-line-spectrogram-time-dot"
                    data-point-index={p.index}
                    data-x={p.x}
                    data-y={p.y}
                    data-hovered={isHover ? 'true' : 'false'}
                    cx={p.px}
                    cy={p.py}
                    r={isHover ? dotRadius + 1 : dotRadius}
                    fill={lineColor}
                    stroke="#ffffff"
                    strokeWidth={1}
                    onMouseEnter={() => {
                      setHoverPayload({
                        kind: 'time',
                        pointIndex: p.index,
                      });
                      setTooltipPos({ px: p.px, py: p.py });
                    }}
                    onMouseLeave={clearHover}
                    onFocus={() => {
                      setHoverPayload({
                        kind: 'time',
                        pointIndex: p.index,
                      });
                      setTooltipPos({ px: p.px, py: p.py });
                    }}
                    onBlur={clearHover}
                    onClick={() => onPointClick?.({ point: p })}
                  />
                );
              })
            : null}

          <g data-section="chart-line-spectrogram-cells">
            {layout.cells.map((c) => {
              const isHover =
                hoverPayload?.kind === 'cell' &&
                hoverPayload.frameIndex === c.frameIndex &&
                hoverPayload.binIndex === c.binIndex;
              return (
                <rect
                  key={`c-${c.frameIndex}-${c.binIndex}`}
                  role="graphics-symbol"
                  tabIndex={0}
                  aria-label={`Spectrogram cell frame ${c.frameIndex + 1} bin ${c.binIndex} frequency ${formatFrequency(c.frequency)} magnitude ${formatMagnitude(c.magnitude)}${c.isDominant ? '; dominant' : ''}`}
                  data-section="chart-line-spectrogram-cell"
                  data-frame-index={c.frameIndex}
                  data-bin-index={c.binIndex}
                  data-frequency={c.frequency}
                  data-magnitude={c.magnitude}
                  data-normalised-magnitude={c.normalisedMagnitude}
                  data-dominant={c.isDominant ? 'true' : 'false'}
                  data-hovered={isHover ? 'true' : 'false'}
                  x={c.x}
                  y={c.y}
                  width={c.width}
                  height={c.height}
                  fill={c.color}
                  stroke="none"
                  onMouseEnter={() => {
                    setHoverPayload({
                      kind: 'cell',
                      frameIndex: c.frameIndex,
                      binIndex: c.binIndex,
                    });
                    setTooltipPos({
                      px: c.x + c.width / 2,
                      py: c.y + c.height / 2,
                    });
                  }}
                  onMouseLeave={clearHover}
                  onFocus={() => {
                    setHoverPayload({
                      kind: 'cell',
                      frameIndex: c.frameIndex,
                      binIndex: c.binIndex,
                    });
                    setTooltipPos({
                      px: c.x + c.width / 2,
                      py: c.y + c.height / 2,
                    });
                  }}
                  onBlur={clearHover}
                  onClick={() => onCellClick?.({ cell: c })}
                />
              );
            })}
          </g>

          {showDominantTrack && layout.dominantTrackPath ? (
            <path
              role="graphics-symbol"
              aria-label="Dominant frequency track across frames"
              data-section="chart-line-spectrogram-dominant-track"
              data-kind="dominant"
              d={layout.dominantTrackPath}
              fill="none"
              stroke={dominantColor}
              strokeWidth={1.5}
              strokeDasharray="4 3"
              strokeOpacity={0.9}
              pointerEvents="none"
            />
          ) : null}
        </svg>

        {showTooltip && hoverPayload && tooltipPos
          ? (() => {
              if (hoverPayload.kind === 'time') {
                const p = layout.timePoints[hoverPayload.pointIndex];
                if (!p) return null;
                return (
                  <div
                    data-section="chart-line-spectrogram-tooltip"
                    data-kind="time"
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
                      minWidth: 140,
                      boxShadow: '0 1px 3px rgba(0,0,0,0.18)',
                    }}
                  >
                    <div data-section="chart-line-spectrogram-tooltip-x">
                      x: {formatX(p.x)}
                    </div>
                    <div
                      data-section="chart-line-spectrogram-tooltip-y"
                      style={{ fontWeight: 600 }}
                    >
                      y: {formatValue(p.y)}
                    </div>
                  </div>
                );
              }
              const cell = layout.cellsByFrame[hoverPayload.frameIndex]?.find(
                (c) => c.binIndex === hoverPayload.binIndex,
              );
              if (!cell) return null;
              return (
                <div
                  data-section="chart-line-spectrogram-tooltip"
                  data-kind="cell"
                  data-frame-index={cell.frameIndex}
                  data-bin-index={cell.binIndex}
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
                    data-section="chart-line-spectrogram-tooltip-frame"
                    style={{ fontWeight: 600 }}
                  >
                    frame {cell.frameIndex + 1} / {layout.spectrogram.frames.length}
                  </div>
                  <div data-section="chart-line-spectrogram-tooltip-bin">
                    bin {cell.binIndex}
                  </div>
                  <div data-section="chart-line-spectrogram-tooltip-frequency">
                    f: {formatFrequency(cell.frequency)}
                  </div>
                  <div
                    data-section="chart-line-spectrogram-tooltip-magnitude"
                    style={{ fontWeight: 600 }}
                  >
                    |X|: {formatMagnitude(cell.magnitude)}
                  </div>
                  {cell.isDominant ? (
                    <div
                      data-section="chart-line-spectrogram-tooltip-dominant"
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
        data-section="chart-line-spectrogram-controls"
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
            data-section="chart-line-spectrogram-window-toggle"
            role="radiogroup"
            aria-label="Window mode"
            style={{
              display: 'inline-flex',
              gap: 4,
              alignItems: 'center',
              fontSize: 11,
            }}
          >
            {LINE_SPECTROGRAM_WINDOW_MODES.map((m) => {
              const active = m === effectiveMode;
              return (
                <button
                  key={m}
                  type="button"
                  role="radio"
                  aria-checked={active ? 'true' : 'false'}
                  data-section="chart-line-spectrogram-window-button"
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

        {showColorScale ? (
          <div
            data-section="chart-line-spectrogram-color-scale"
            data-max-magnitude={layout.magMax}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              fontSize: 10,
              color: '#64748b',
            }}
          >
            <span data-section="chart-line-spectrogram-color-scale-low">
              {formatMagnitude(0)}
            </span>
            <span
              data-section="chart-line-spectrogram-color-scale-gradient"
              style={{
                display: 'inline-block',
                width: 64,
                height: 8,
                borderRadius: 2,
                background: `linear-gradient(to right, ${lowColor}, ${midColor}, ${highColor})`,
              }}
            />
            <span data-section="chart-line-spectrogram-color-scale-high">
              {formatMagnitude(layout.magMax)}
            </span>
          </div>
        ) : null}

        {showLegend ? (
          <div
            data-section="chart-line-spectrogram-legend"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 12,
              fontSize: 11,
              color: '#475569',
            }}
          >
            <span data-section="chart-line-spectrogram-legend-stats">
              {layout.spectrogram.frames.length} frames -- {layout.spectrogram.binCount}{' '}
              bins -- window {layout.spectrogram.windowSize} hop{' '}
              {layout.spectrogram.hopSize}
            </span>
          </div>
        ) : null}
      </div>
    </div>
  );
});

ChartLineSpectrogram.displayName = 'ChartLineSpectrogram';
