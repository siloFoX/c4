import {
  forwardRef,
  useCallback,
  useId,
  useMemo,
  useState,
  type CSSProperties,
  type ForwardedRef,
} from 'react';

export const DEFAULT_CHART_LINE_FFT_WIDTH = 720;
export const DEFAULT_CHART_LINE_FFT_HEIGHT = 320;
export const DEFAULT_CHART_LINE_FFT_PADDING = 40;
export const DEFAULT_CHART_LINE_FFT_GAP = 20;
export const DEFAULT_CHART_LINE_FFT_TICK_COUNT = 5;
export const DEFAULT_CHART_LINE_FFT_TIME_PANEL_RATIO = 0.6;
export const DEFAULT_CHART_LINE_FFT_STROKE_WIDTH = 1.75;
export const DEFAULT_CHART_LINE_FFT_SPECTRUM_BAR_WIDTH_RATIO = 0.7;
export const DEFAULT_CHART_LINE_FFT_DOT_RADIUS = 3;
export const DEFAULT_CHART_LINE_FFT_PALETTE = [
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
export const DEFAULT_CHART_LINE_FFT_SPECTRUM_COLOR = '#475569';
export const DEFAULT_CHART_LINE_FFT_DOMINANT_COLOR = '#dc2626';
export const DEFAULT_CHART_LINE_FFT_GRID_COLOR = '#e2e8f0';
export const DEFAULT_CHART_LINE_FFT_AXIS_COLOR = '#cbd5e1';

export interface ChartLineFftPoint {
  x: number;
  y: number;
}

export interface ChartLineFftSeries {
  id: string;
  label: string;
  data: readonly ChartLineFftPoint[];
  color?: string;
  detrend?: boolean;
  excludeDc?: boolean;
}

export interface ChartLineFftBin {
  k: number;
  frequency: number;
  period: number;
  real: number;
  imag: number;
  magnitude: number;
  normalisedMagnitude: number;
}

export interface ChartLineFftSpectrum {
  bins: ChartLineFftBin[];
  dominantBin: ChartLineFftBin | null;
  totalSamples: number;
  detrended: boolean;
  excludedDc: boolean;
  meanValue: number;
}

export interface ChartLineFftLayoutTimePoint {
  index: number;
  x: number;
  y: number;
  px: number;
  py: number;
}

export interface ChartLineFftLayoutBin extends ChartLineFftBin {
  px: number;
  py: number;
  barX: number;
  barWidth: number;
  barHeight: number;
  isDominant: boolean;
}

export interface ChartLineFftLayoutSeries {
  id: string;
  label: string;
  color: string;
  detrend: boolean;
  excludeDc: boolean;
  timePoints: ChartLineFftLayoutTimePoint[];
  timePath: string;
  spectrum: ChartLineFftSpectrum;
  spectrumBins: ChartLineFftLayoutBin[];
  spectrumPath: string;
  dominantFrequency: number;
  dominantPeriod: number;
  dominantMagnitude: number;
  finiteCount: number;
  totalCount: number;
}

export interface ComputeLineFftLayoutResult {
  series: ChartLineFftLayoutSeries[];
  timePanel: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  spectrumPanel: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
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

export interface ComputeLineFftLayoutOptions {
  series: readonly ChartLineFftSeries[];
  hiddenSeries?: ReadonlySet<string> | readonly string[];
  width: number;
  height: number;
  padding: number;
  gap?: number;
  tickCount?: number;
  timePanelRatio?: number;
  detrend?: boolean;
  excludeDc?: boolean;
  defaultColors?: readonly string[];
  xMin?: number;
  xMax?: number;
  yMin?: number;
  yMax?: number;
}

export interface ChartLineFftProps {
  series: readonly ChartLineFftSeries[];
  hiddenSeries?: ReadonlySet<string> | readonly string[];
  defaultHiddenSeries?: ReadonlySet<string> | readonly string[];
  onHiddenSeriesChange?: (hidden: ReadonlySet<string>) => void;
  width?: number;
  height?: number;
  padding?: number;
  gap?: number;
  tickCount?: number;
  timePanelRatio?: number;
  detrend?: boolean;
  excludeDc?: boolean;
  strokeWidth?: number;
  spectrumBarWidthRatio?: number;
  dotRadius?: number;
  spectrumColor?: string;
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
  showSpectrum?: boolean;
  showDominantMarker?: boolean;
  spectrumAsBars?: boolean;
  animate?: boolean;
  className?: string;
  ariaLabel?: string;
  ariaDescription?: string;
  formatValue?: (n: number) => string;
  formatX?: (n: number) => string;
  formatFrequency?: (n: number) => string;
  formatPeriod?: (n: number) => string;
  formatMagnitude?: (n: number) => string;
  xLabel?: string;
  yLabel?: string;
  spectrumXLabel?: string;
  spectrumYLabel?: string;
  onPointClick?: (payload: {
    series: ChartLineFftLayoutSeries;
    point: ChartLineFftLayoutTimePoint;
  }) => void;
  onBinClick?: (payload: {
    series: ChartLineFftLayoutSeries;
    bin: ChartLineFftLayoutBin;
  }) => void;
  onSeriesToggle?: (payload: {
    series: ChartLineFftSeries;
    hidden: boolean;
  }) => void;
  style?: CSSProperties;
}

function isFiniteNumber(n: unknown): n is number {
  return typeof n === 'number' && Number.isFinite(n);
}

export function getLineFftDefaultColor(index: number): string {
  const palette = DEFAULT_CHART_LINE_FFT_PALETTE;
  if (!isFiniteNumber(index) || index < 0) {
    return palette[0]!;
  }
  return palette[Math.floor(index) % palette.length]!;
}

export function getLineFftFinitePoints(
  points: readonly ChartLineFftPoint[] | null | undefined,
): ChartLineFftPoint[] {
  if (!Array.isArray(points)) return [];
  return points.filter(
    (p): p is ChartLineFftPoint =>
      !!p && isFiniteNumber(p.x) && isFiniteNumber(p.y),
  );
}

export function normaliseLineFftPanelRatio(value: unknown): number {
  if (!isFiniteNumber(value)) return DEFAULT_CHART_LINE_FFT_TIME_PANEL_RATIO;
  if (value <= 0) return 0.1;
  if (value >= 1) return 0.9;
  return value;
}

export function detrendLineFftValues(
  values: readonly number[] | null | undefined,
): { detrended: number[]; mean: number } {
  if (!Array.isArray(values) || values.length === 0) {
    return { detrended: [], mean: 0 };
  }
  let sum = 0;
  let count = 0;
  for (const v of values) {
    if (isFiniteNumber(v)) {
      sum += v;
      count += 1;
    }
  }
  const mean = count > 0 ? sum / count : 0;
  return { detrended: values.map((v) => (isFiniteNumber(v) ? v - mean : 0)), mean };
}

export function computeLineFftDft(
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

export function computeLineFftSpectrum(
  points: readonly ChartLineFftPoint[] | null | undefined,
  options?: { detrend?: boolean; excludeDc?: boolean },
): ChartLineFftSpectrum {
  const finite = getLineFftFinitePoints(points);
  if (finite.length < 2) {
    return {
      bins: [],
      dominantBin: null,
      totalSamples: finite.length,
      detrended: !!options?.detrend,
      excludedDc: !!options?.excludeDc,
      meanValue: finite[0]?.y ?? 0,
    };
  }
  const sorted = [...finite].sort((a, b) => a.x - b.x);
  const ys = sorted.map((p) => p.y);
  const detrend = options?.detrend !== false; // default true
  const excludeDc = options?.excludeDc !== false; // default true

  const { detrended, mean } = detrendLineFftValues(ys);
  const input = detrend ? detrended : [...ys];
  const dft = computeLineFftDft(input);
  const N = ys.length;
  const sampleStep =
    sorted.length >= 2
      ? (sorted[sorted.length - 1]!.x - sorted[0]!.x) / (N - 1)
      : 1;
  const fundamentalFrequency = sampleStep > 0 ? 1 / (N * sampleStep) : 1 / N;

  const bins: ChartLineFftBin[] = dft.map((c, k) => {
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
  for (const b of bins) {
    if (b.magnitude > maxMag) maxMag = b.magnitude;
  }
  for (const b of bins) {
    b.normalisedMagnitude = maxMag > 0 ? b.magnitude / maxMag : 0;
  }

  // Pick dominant -- exclude DC (k=0) when excludeDc is true
  let dominantBin: ChartLineFftBin | null = null;
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
  };
}

export function findLineFftDominantBin(
  bins: readonly ChartLineFftBin[] | null | undefined,
  excludeDc = true,
): ChartLineFftBin | null {
  if (!Array.isArray(bins) || bins.length === 0) return null;
  let dominant: ChartLineFftBin | null = null;
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

export function computeLineFftLayout(
  options: ComputeLineFftLayoutOptions,
): ComputeLineFftLayoutResult {
  const {
    series = [],
    hiddenSeries,
    width,
    height,
    padding,
    gap = DEFAULT_CHART_LINE_FFT_GAP,
    tickCount = DEFAULT_CHART_LINE_FFT_TICK_COUNT,
    timePanelRatio,
    detrend,
    excludeDc,
    defaultColors = DEFAULT_CHART_LINE_FFT_PALETTE,
    xMin: xMinOverride,
    xMax: xMaxOverride,
    yMin: yMinOverride,
    yMax: yMaxOverride,
  } = options;

  const innerWidth = width - padding * 2;
  const innerHeight = height - padding * 2;
  const ratio = normaliseLineFftPanelRatio(timePanelRatio);
  const usableWidth = Math.max(0, innerWidth - gap);
  const timeWidth = Math.max(0, usableWidth * ratio);
  const spectrumWidth = Math.max(0, usableWidth - timeWidth);

  const emptyResult: ComputeLineFftLayoutResult = {
    series: [],
    timePanel: {
      x: padding,
      y: padding,
      width: timeWidth,
      height: innerHeight,
    },
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

  const finiteBySeries = new Map<string, ChartLineFftPoint[]>();
  const spectrumBySeries = new Map<string, ChartLineFftSpectrum>();

  for (const s of visible) {
    const finite = getLineFftFinitePoints(s.data).slice().sort((a, b) => a.x - b.x);
    finiteBySeries.set(s.id, finite);
    totalPoints += finite.length;
    const sDetrend = s.detrend !== undefined ? s.detrend : detrend;
    const sExcludeDc = s.excludeDc !== undefined ? s.excludeDc : excludeDc;
    const spectrum = computeLineFftSpectrum(finite, {
      detrend: sDetrend,
      excludeDc: sExcludeDc,
    });
    spectrumBySeries.set(s.id, spectrum);
    for (const p of finite) {
      if (p.x < xLo) xLo = p.x;
      if (p.x > xHi) xHi = p.x;
      if (p.y < yLo) yLo = p.y;
      if (p.y > yHi) yHi = p.y;
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

  const layoutSeries: ChartLineFftLayoutSeries[] = visible.map((s, idx) => {
    const finite = finiteBySeries.get(s.id) ?? [];
    const spectrum =
      spectrumBySeries.get(s.id) ??
      computeLineFftSpectrum([], { detrend, excludeDc });
    const color =
      s.color ?? defaultColors[idx % defaultColors.length] ?? DEFAULT_CHART_LINE_FFT_PALETTE[0]!;

    const timePoints: ChartLineFftLayoutTimePoint[] = finite.map((p, i) => ({
      index: i,
      x: p.x,
      y: p.y,
      px: projectTimeX(p.x),
      py: projectTimeY(p.y),
    }));

    const timePath = buildPath(timePoints);

    const usableBins = spectrum.excludedDc
      ? spectrum.bins.filter((b) => b.k !== 0)
      : spectrum.bins;

    const visibleBinCount = Math.max(1, usableBins.length);
    const slot = spectrumWidth / visibleBinCount;

    const spectrumBins: ChartLineFftLayoutBin[] = usableBins.map((b, i) => {
      const px = spectrumX + slot * (i + 0.5);
      const py = projectMagY(b.magnitude);
      const barWidth = slot * DEFAULT_CHART_LINE_FFT_SPECTRUM_BAR_WIDTH_RATIO;
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

    const spectrumPath = buildPath(
      spectrumBins.map((b) => ({ px: b.px, py: b.py })),
    );

    return {
      id: s.id,
      label: s.label,
      color,
      detrend: spectrum.detrended,
      excludeDc: spectrum.excludedDc,
      timePoints,
      timePath,
      spectrum,
      spectrumBins,
      spectrumPath,
      dominantFrequency: spectrum.dominantBin?.frequency ?? 0,
      dominantPeriod: spectrum.dominantBin?.period ?? 0,
      dominantMagnitude: spectrum.dominantBin?.magnitude ?? 0,
      finiteCount: finite.length,
      totalCount: s.data?.length ?? 0,
    };
  });

  return {
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

function defaultFormatMagnitude(n: number): string {
  if (!isFiniteNumber(n)) return '';
  if (Number.isInteger(n)) return String(n);
  return n.toFixed(2);
}

export function describeLineFftChart(
  series: readonly ChartLineFftSeries[] | null | undefined,
  options?: {
    hidden?: ReadonlySet<string> | readonly string[];
    detrend?: boolean;
    excludeDc?: boolean;
    formatValue?: (n: number) => string;
    formatFrequency?: (n: number) => string;
    formatPeriod?: (n: number) => string;
  },
): string {
  if (!Array.isArray(series) || series.length === 0) return 'No data';
  const hiddenSet = normaliseHidden(options?.hidden);
  const visible = series.filter((s) => !hiddenSet.has(s.id));
  if (visible.length === 0) return 'No data';
  const fmtF = options?.formatFrequency ?? defaultFormatFrequency;
  const fmtP = options?.formatPeriod ?? defaultFormatPeriod;

  let totalPoints = 0;
  const summaries: string[] = [];
  for (const s of visible) {
    const sDetrend = s.detrend !== undefined ? s.detrend : options?.detrend;
    const sExcludeDc =
      s.excludeDc !== undefined ? s.excludeDc : options?.excludeDc;
    const spectrum = computeLineFftSpectrum(s.data, {
      detrend: sDetrend,
      excludeDc: sExcludeDc,
    });
    totalPoints += spectrum.totalSamples;
    const dom = spectrum.dominantBin;
    summaries.push(
      `${s.label}: dominant frequency ${dom ? fmtF(dom.frequency) : 'n/a'}; period ${dom ? fmtP(dom.period) : 'n/a'}`,
    );
  }
  if (totalPoints === 0) return 'No data';

  return `Line chart with FFT frequency-spectrum side panel across ${visible.length} series (${totalPoints} points). ${summaries.join('; ')}.`;
}

export const ChartLineFft = forwardRef<HTMLDivElement, ChartLineFftProps>(
  function ChartLineFft(
    props: ChartLineFftProps,
    ref: ForwardedRef<HTMLDivElement>,
  ) {
    const {
      series,
      hiddenSeries: controlledHidden,
      defaultHiddenSeries,
      onHiddenSeriesChange,
      width = DEFAULT_CHART_LINE_FFT_WIDTH,
      height = DEFAULT_CHART_LINE_FFT_HEIGHT,
      padding = DEFAULT_CHART_LINE_FFT_PADDING,
      gap = DEFAULT_CHART_LINE_FFT_GAP,
      tickCount = DEFAULT_CHART_LINE_FFT_TICK_COUNT,
      timePanelRatio = DEFAULT_CHART_LINE_FFT_TIME_PANEL_RATIO,
      detrend = true,
      excludeDc = true,
      strokeWidth = DEFAULT_CHART_LINE_FFT_STROKE_WIDTH,
      spectrumBarWidthRatio = DEFAULT_CHART_LINE_FFT_SPECTRUM_BAR_WIDTH_RATIO,
      dotRadius = DEFAULT_CHART_LINE_FFT_DOT_RADIUS,
      spectrumColor = DEFAULT_CHART_LINE_FFT_SPECTRUM_COLOR,
      dominantColor = DEFAULT_CHART_LINE_FFT_DOMINANT_COLOR,
      gridColor = DEFAULT_CHART_LINE_FFT_GRID_COLOR,
      axisColor = DEFAULT_CHART_LINE_FFT_AXIS_COLOR,
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
      spectrumAsBars = true,
      animate = true,
      className,
      ariaLabel = 'Line chart with FFT frequency spectrum side panel',
      ariaDescription,
      formatValue = defaultFormatValue,
      formatX = defaultFormatValue,
      formatFrequency = defaultFormatFrequency,
      formatPeriod = defaultFormatPeriod,
      formatMagnitude = defaultFormatMagnitude,
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

    const isControlled = controlledHidden !== undefined;
    const [uncontrolled, setUncontrolled] = useState<Set<string>>(() =>
      normaliseHidden(defaultHiddenSeries),
    );
    const hiddenSet = isControlled
      ? normaliseHidden(controlledHidden)
      : uncontrolled;

    const layout = useMemo(
      () =>
        computeLineFftLayout({
          series,
          hiddenSeries: hiddenSet,
          width,
          height,
          padding,
          gap,
          tickCount,
          timePanelRatio,
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
        describeLineFftChart(series, {
          hidden: hiddenSet,
          detrend,
          excludeDc,
          formatValue,
          formatFrequency,
          formatPeriod,
        }),
      [
        ariaDescription,
        series,
        hiddenSet,
        detrend,
        excludeDc,
        formatValue,
        formatFrequency,
        formatPeriod,
      ],
    );

    const [hoverPayload, setHoverPayload] = useState<
      | {
          kind: 'time';
          seriesId: string;
          pointIndex: number;
        }
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
      (s: ChartLineFftSeries) => {
        const next = new Set(hiddenSet);
        const willHide = !next.has(s.id);
        if (willHide) next.add(s.id);
        else next.delete(s.id);
        if (!isControlled) setUncontrolled(next);
        onHiddenSeriesChange?.(next);
        onSeriesToggle?.({ series: s, hidden: willHide });
      },
      [hiddenSet, isControlled, onHiddenSeriesChange, onSeriesToggle],
    );

    const allTotalPoints = useMemo(
      () =>
        series.reduce(
          (acc, s) => acc + getLineFftFinitePoints(s.data).length,
          0,
        ),
      [series],
    );

    const dominantOverall = useMemo<{
      seriesId: string;
      frequency: number;
      period: number;
      magnitude: number;
    }>(() => {
      let best: {
        seriesId: string;
        frequency: number;
        period: number;
        magnitude: number;
      } = { seriesId: '', frequency: 0, period: 0, magnitude: 0 };
      for (const s of layout.series) {
        if (s.dominantMagnitude > best.magnitude) {
          best = {
            seriesId: s.id,
            frequency: s.dominantFrequency,
            period: s.dominantPeriod,
            magnitude: s.dominantMagnitude,
          };
        }
      }
      return best;
    }, [layout.series]);

    const badgeColor = dominantColor;

    const containerStyle: CSSProperties = {
      width,
      height,
      position: 'relative',
      ...(style ?? {}),
    };

    if (layout.series.length === 0) {
      return (
        <div
          ref={ref}
          role="region"
          aria-label={ariaLabel}
          aria-describedby={descId}
          className={className}
          style={containerStyle}
          data-section="chart-line-fft"
          data-empty="true"
          data-series-count={series.length}
          data-visible-series-count={0}
          data-total-points={0}
          data-detrend={detrend ? 'true' : 'false'}
          data-exclude-dc={excludeDc ? 'true' : 'false'}
          data-animate={animate ? 'true' : 'false'}
        >
          <span
            id={descId}
            data-section="chart-line-fft-aria-desc"
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
        data-section="chart-line-fft"
        data-empty="false"
        data-series-count={series.length}
        data-visible-series-count={layout.visibleSeriesCount}
        data-total-points={layout.totalPoints}
        data-detrend={detrend ? 'true' : 'false'}
        data-exclude-dc={excludeDc ? 'true' : 'false'}
        data-dominant-frequency={dominantOverall.frequency}
        data-dominant-period={dominantOverall.period}
        data-animate={animate ? 'true' : 'false'}
      >
        <span
          id={descId}
          data-section="chart-line-fft-aria-desc"
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
          data-section="chart-line-fft-canvas"
          style={{ position: 'relative', width, height }}
        >
          {showDominantBadge && dominantOverall.magnitude > 0 ? (
            <div
              data-section="chart-line-fft-badge"
              data-series-id={dominantOverall.seriesId}
              data-frequency={dominantOverall.frequency}
              data-period={dominantOverall.period}
              data-magnitude={dominantOverall.magnitude}
              style={{
                position: 'absolute',
                top: 4,
                left: 4,
                padding: '2px 6px',
                borderRadius: 4,
                background: '#ffffffd9',
                color: badgeColor,
                fontSize: 11,
                fontWeight: 600,
                display: 'flex',
                gap: 4,
                alignItems: 'center',
                pointerEvents: 'none',
              }}
            >
              <span
                data-section="chart-line-fft-badge-icon"
                aria-hidden="true"
              >
                f
              </span>
              <span data-section="chart-line-fft-badge-frequency">
                {formatFrequency(dominantOverall.frequency)}
              </span>
              <span data-section="chart-line-fft-badge-period">
                T={formatPeriod(dominantOverall.period)}
              </span>
            </div>
          ) : null}

          <svg
            role="img"
            aria-label={ariaLabel}
            width={width}
            height={height}
            data-section="chart-line-fft-svg"
            style={{ display: 'block', overflow: 'visible' }}
          >
            {showGrid ? (
              <g
                data-section="chart-line-fft-grid"
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
                      data-section="chart-line-fft-grid-line"
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
                      data-section="chart-line-fft-grid-line"
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
                data-section="chart-line-fft-axes"
                stroke={axisColor}
                strokeWidth={1}
              >
                <line
                  data-section="chart-line-fft-axis"
                  data-panel="time"
                  data-axis="x"
                  x1={layout.timePanel.x}
                  y1={layout.timePanel.y + layout.timePanel.height}
                  x2={layout.timePanel.x + layout.timePanel.width}
                  y2={layout.timePanel.y + layout.timePanel.height}
                />
                <line
                  data-section="chart-line-fft-axis"
                  data-panel="time"
                  data-axis="y"
                  x1={layout.timePanel.x}
                  y1={layout.timePanel.y}
                  x2={layout.timePanel.x}
                  y2={layout.timePanel.y + layout.timePanel.height}
                />
                <line
                  data-section="chart-line-fft-axis"
                  data-panel="spectrum"
                  data-axis="x"
                  x1={layout.spectrumPanel.x}
                  y1={layout.spectrumPanel.y + layout.spectrumPanel.height}
                  x2={layout.spectrumPanel.x + layout.spectrumPanel.width}
                  y2={layout.spectrumPanel.y + layout.spectrumPanel.height}
                />
                <line
                  data-section="chart-line-fft-axis"
                  data-panel="spectrum"
                  data-axis="y"
                  x1={layout.spectrumPanel.x}
                  y1={layout.spectrumPanel.y}
                  x2={layout.spectrumPanel.x}
                  y2={layout.spectrumPanel.y + layout.spectrumPanel.height}
                />
                <g
                  data-section="chart-line-fft-ticks"
                  data-panel="time"
                  data-axis="x"
                >
                  {layout.timeXTicks.map((t, i) => {
                    const px =
                      layout.timePanel.x +
                      ((t - layout.xMin) / (layout.xMax - layout.xMin)) *
                        layout.timePanel.width;
                    return (
                      <g
                        key={`tx-${i}`}
                        data-section="chart-line-fft-tick"
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
                          data-section="chart-line-fft-tick-label"
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
                  data-section="chart-line-fft-ticks"
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
                        data-section="chart-line-fft-tick"
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
                          data-section="chart-line-fft-tick-label"
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
                  data-section="chart-line-fft-ticks"
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
                        data-section="chart-line-fft-tick"
                        data-panel="spectrum"
                        data-axis="x"
                      >
                        <line
                          x1={px}
                          x2={px}
                          y1={
                            layout.spectrumPanel.y +
                            layout.spectrumPanel.height
                          }
                          y2={
                            layout.spectrumPanel.y +
                            layout.spectrumPanel.height +
                            4
                          }
                        />
                        <text
                          data-section="chart-line-fft-tick-label"
                          data-panel="spectrum"
                          data-axis="x"
                          x={px}
                          y={
                            layout.spectrumPanel.y +
                            layout.spectrumPanel.height +
                            14
                          }
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
                    data-section="chart-line-fft-x-label"
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
                    data-section="chart-line-fft-y-label"
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
                  data-section="chart-line-fft-spectrum-x-label"
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
                  data-section="chart-line-fft-spectrum-y-label"
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

            <g data-section="chart-line-fft-series">
              {layout.series.map((s) => (
                <g
                  key={s.id}
                  data-section="chart-line-fft-series-group"
                  data-series-id={s.id}
                  data-series-color={s.color}
                  data-series-detrend={s.detrend ? 'true' : 'false'}
                  data-series-exclude-dc={s.excludeDc ? 'true' : 'false'}
                  data-series-dominant-frequency={s.dominantFrequency}
                  data-series-dominant-period={s.dominantPeriod}
                  data-series-dominant-magnitude={s.dominantMagnitude}
                  data-series-bin-count={s.spectrumBins.length}
                  data-series-finite-count={s.finiteCount}
                >
                  {s.timePath ? (
                    <path
                      role="graphics-symbol"
                      tabIndex={0}
                      aria-label={`${s.label} time series`}
                      data-section="chart-line-fft-time-path"
                      data-series-id={s.id}
                      data-kind="time"
                      d={s.timePath}
                      fill="none"
                      stroke={s.color}
                      strokeWidth={strokeWidth}
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
                            aria-label={`${s.label} time-domain point ${p.index + 1} at x ${formatX(p.x)} y ${formatValue(p.y)}`}
                            data-section="chart-line-fft-time-dot"
                            data-series-id={s.id}
                            data-point-index={p.index}
                            data-x={p.x}
                            data-y={p.y}
                            data-hovered={isHover ? 'true' : 'false'}
                            cx={p.px}
                            cy={p.py}
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
                              setTooltipPos({ px: p.px, py: p.py });
                            }}
                            onMouseLeave={clearHover}
                            onFocus={() => {
                              setHoverPayload({
                                kind: 'time',
                                seriesId: s.id,
                                pointIndex: p.index,
                              });
                              setTooltipPos({ px: p.px, py: p.py });
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
                        const color = b.isDominant && showDominantMarker
                          ? dominantColor
                          : spectrumColor;
                        if (spectrumAsBars) {
                          return (
                            <rect
                              key={`sb-${b.k}`}
                              role="graphics-symbol"
                              tabIndex={0}
                              aria-label={`${s.label} bin ${b.k}: frequency ${formatFrequency(b.frequency)}, period ${formatPeriod(b.period)}, magnitude ${formatMagnitude(b.magnitude)}${b.isDominant ? '; dominant' : ''}`}
                              data-section="chart-line-fft-bin-bar"
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
                              onClick={() =>
                                onBinClick?.({ series: s, bin: b })
                              }
                            />
                          );
                        }
                        return (
                          <circle
                            key={`sd-${b.k}`}
                            role="graphics-symbol"
                            tabIndex={0}
                            aria-label={`${s.label} bin ${b.k}: frequency ${formatFrequency(b.frequency)}, period ${formatPeriod(b.period)}, magnitude ${formatMagnitude(b.magnitude)}${b.isDominant ? '; dominant' : ''}`}
                            data-section="chart-line-fft-bin-dot"
                            data-series-id={s.id}
                            data-bin-k={b.k}
                            data-frequency={b.frequency}
                            data-period={b.period}
                            data-magnitude={b.magnitude}
                            data-dominant={b.isDominant ? 'true' : 'false'}
                            data-hovered={isHover ? 'true' : 'false'}
                            cx={b.px}
                            cy={b.py}
                            r={b.isDominant ? dotRadius + 1 : dotRadius}
                            fill={color}
                            stroke="#ffffff"
                            strokeWidth={1}
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
                            onClick={() =>
                              onBinClick?.({ series: s, bin: b })
                            }
                          />
                        );
                      })
                    : null}
                  {showSpectrum && !spectrumAsBars && s.spectrumPath ? (
                    <path
                      role="graphics-symbol"
                      tabIndex={0}
                      aria-label={`${s.label} spectrum line`}
                      data-section="chart-line-fft-spectrum-path"
                      data-series-id={s.id}
                      d={s.spectrumPath}
                      fill="none"
                      stroke={spectrumColor}
                      strokeWidth={strokeWidth}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  ) : null}
                </g>
              ))}
            </g>
          </svg>

          {showTooltip && hoverPayload && tooltipPos
            ? (() => {
                const s = layout.series.find(
                  (x) => x.id === hoverPayload.seriesId,
                );
                if (!s) return null;
                if (hoverPayload.kind === 'time') {
                  const p = s.timePoints[hoverPayload.pointIndex];
                  if (!p) return null;
                  return (
                    <div
                      data-section="chart-line-fft-tooltip"
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
                        minWidth: 140,
                        boxShadow: '0 1px 3px rgba(0,0,0,0.18)',
                      }}
                    >
                      <div
                        data-section="chart-line-fft-tooltip-label"
                        style={{ color: s.color, fontWeight: 600 }}
                      >
                        {s.label}
                      </div>
                      <div data-section="chart-line-fft-tooltip-x">
                        x: {formatX(p.x)}
                      </div>
                      <div
                        data-section="chart-line-fft-tooltip-y"
                        style={{ fontWeight: 600 }}
                      >
                        y: {formatValue(p.y)}
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
                    data-section="chart-line-fft-tooltip"
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
                      minWidth: 160,
                      boxShadow: '0 1px 3px rgba(0,0,0,0.18)',
                    }}
                  >
                    <div
                      data-section="chart-line-fft-tooltip-label"
                      style={{ color: tipColor, fontWeight: 600 }}
                    >
                      {s.label} bin {b.k}
                    </div>
                    <div data-section="chart-line-fft-tooltip-frequency">
                      f: {formatFrequency(b.frequency)}
                    </div>
                    <div data-section="chart-line-fft-tooltip-period">
                      T: {formatPeriod(b.period)}
                    </div>
                    <div
                      data-section="chart-line-fft-tooltip-magnitude"
                      style={{ fontWeight: 600 }}
                    >
                      |X|: {formatMagnitude(b.magnitude)}
                    </div>
                    {b.isDominant ? (
                      <div
                        data-section="chart-line-fft-tooltip-dominant"
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

        {showLegend ? (
          <div
            data-section="chart-line-fft-legend"
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: 12,
              marginTop: 8,
              alignItems: 'center',
            }}
          >
            {series.map((s) => {
              const isHidden = hiddenSet.has(s.id);
              const layoutMatch = layout.series.find((x) => x.id === s.id);
              const swatchColor =
                s.color ??
                layoutMatch?.color ??
                DEFAULT_CHART_LINE_FFT_PALETTE[0]!;
              return (
                <button
                  key={s.id}
                  type="button"
                  data-section="chart-line-fft-legend-item"
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
                    data-section="chart-line-fft-legend-swatch"
                    style={{
                      display: 'inline-block',
                      width: 10,
                      height: 10,
                      borderRadius: 2,
                      background: swatchColor,
                    }}
                  />
                  <span data-section="chart-line-fft-legend-label">
                    {s.label}
                  </span>
                  {layoutMatch ? (
                    <span
                      data-section="chart-line-fft-legend-stats"
                      style={{ fontSize: 10, color: '#64748b' }}
                    >
                      (f={formatFrequency(layoutMatch.dominantFrequency)};
                      T={formatPeriod(layoutMatch.dominantPeriod)})
                    </span>
                  ) : null}
                </button>
              );
            })}
            <span
              data-section="chart-line-fft-legend-total-points"
              style={{ fontSize: 10, color: '#64748b' }}
            >
              {allTotalPoints} total points
            </span>
          </div>
        ) : null}
      </div>
    );
  },
);

ChartLineFft.displayName = 'ChartLineFft';
