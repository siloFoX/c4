import {
  forwardRef,
  useId,
  useMemo,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type ReactNode,
  type SVGProps,
} from 'react';

/**
 * ChartLineVrocCrossSig -- pure-SVG dual-panel chart with the
 * volume series in the top panel and the Volume Rate of Change
 * (VROC) over its smoothed signal in the bottom panel. The
 * crossover events are bullish (VROC crosses above signal) and
 * bearish (VROC crosses below signal). This separates the
 * trigger events from the raw VROC oscillator that was published
 * as a single-line panel in 11.869:
 *
 *   VROC[i]   = volume[i - length] === 0
 *                 ? null
 *                 : (volume[i] - volume[i - length]) /
 *                   volume[i - length] * 100
 *   signal[i] = EMA(VROC, signalLength)
 *   bullish  : signal -> VROC crosses above (prev <= 0, cur > 0)
 *   bearish  : signal -> VROC crosses below (prev >= 0, cur < 0)
 *
 * Defaults: `length = 12`, `signalLength = 9`. Regime classifier:
 * `bullish` (VROC > signal), `bearish` (VROC < signal),
 * `neutral` (VROC === signal), `none` (either side null).
 *
 * Bit-exact anchor:
 *
 * - **CONST volume = V (V > 0)**: VROC = 0 for every bar after
 *   warmup (numerator = V - V = 0). Signal EMA of zeros stays
 *   at 0. So VROC === signal everywhere -> regime `neutral`,
 *   cross count = 0.
 * - **CONST volume = V = 0**: VROC = null (divide-by-zero
 *   guard), signal = null, regime `none`.
 */

export interface ChartLineVrocCrossSigPoint {
  x: number;
  volume: number;
}

export type ChartLineVrocCrossSigRegime =
  | 'bullish'
  | 'bearish'
  | 'neutral'
  | 'none';

export type ChartLineVrocCrossSigSeriesId = 'volume' | 'vroc' | 'signal';

export type ChartLineVrocCrossSigCrossKind = 'bullish' | 'bearish';

export interface ChartLineVrocCrossSigCross {
  index: number;
  x: number;
  kind: ChartLineVrocCrossSigCrossKind;
}

export interface ChartLineVrocCrossSigSample {
  index: number;
  x: number;
  volume: number;
  vroc: number | null;
  signal: number | null;
  regime: ChartLineVrocCrossSigRegime;
}

export interface ChartLineVrocCrossSigRun {
  series: ChartLineVrocCrossSigPoint[];
  length: number;
  signalLength: number;
  vrocValues: Array<number | null>;
  signalValues: Array<number | null>;
  samples: ChartLineVrocCrossSigSample[];
  crosses: ChartLineVrocCrossSigCross[];
  bullishCount: number;
  bearishCount: number;
  neutralCount: number;
  noneCount: number;
  ok: boolean;
}

export interface ChartLineVrocCrossSigDot {
  index: number;
  x: number;
  cx: number;
  cy: number;
  volume: number;
}

export interface ChartLineVrocCrossSigLayout {
  ok: boolean;
  width: number;
  height: number;
  padding: number;
  panelGap: number;
  volumeTop: number;
  volumeBottom: number;
  oscTop: number;
  oscBottom: number;
  innerLeft: number;
  innerRight: number;
  volumePath: string;
  volumeDots: ChartLineVrocCrossSigDot[];
  vrocPath: string;
  signalPath: string;
  volumeMin: number;
  volumeMax: number;
  oscMin: number;
  oscMax: number;
  zeroY: number;
  crossMarkers: Array<{
    index: number;
    x: number;
    cx: number;
    cy: number;
    kind: ChartLineVrocCrossSigCrossKind;
  }>;
  run: ChartLineVrocCrossSigRun;
}

export interface ChartLineVrocCrossSigProps
  extends Omit<SVGProps<SVGSVGElement>, 'ref' | 'children'> {
  data: ChartLineVrocCrossSigPoint[];
  length?: number;
  signalLength?: number;
  width?: number;
  height?: number;
  padding?: number;
  panelGap?: number;
  tickCount?: number;
  strokeWidth?: number;
  dotRadius?: number;
  volumeColor?: string;
  vrocColor?: string;
  signalColor?: string;
  bullishColor?: string;
  bearishColor?: string;
  zeroColor?: string;
  axisColor?: string;
  gridColor?: string;
  showAxis?: boolean;
  showGrid?: boolean;
  showDots?: boolean;
  showVroc?: boolean;
  showSignal?: boolean;
  showCrosses?: boolean;
  showZeroLine?: boolean;
  showTooltip?: boolean;
  showConfigBadge?: boolean;
  showLegend?: boolean;
  animate?: boolean;
  hiddenSeries?: ChartLineVrocCrossSigSeriesId[];
  defaultHiddenSeries?: ChartLineVrocCrossSigSeriesId[];
  onSeriesToggle?: (detail: {
    seriesId: ChartLineVrocCrossSigSeriesId;
    hidden: boolean;
  }) => void;
  formatVolume?: (value: number) => string;
  formatOsc?: (value: number) => string;
  formatX?: (x: number) => string;
  ariaLabel?: string;
  ariaDescription?: string;
  className?: string;
  style?: CSSProperties;
}

export const DEFAULT_CHART_LINE_VROC_CROSS_SIG_WIDTH = 720;
export const DEFAULT_CHART_LINE_VROC_CROSS_SIG_HEIGHT = 460;
export const DEFAULT_CHART_LINE_VROC_CROSS_SIG_PADDING = 44;
export const DEFAULT_CHART_LINE_VROC_CROSS_SIG_PANEL_GAP = 12;
export const DEFAULT_CHART_LINE_VROC_CROSS_SIG_TICK_COUNT = 5;
export const DEFAULT_CHART_LINE_VROC_CROSS_SIG_STROKE_WIDTH = 2;
export const DEFAULT_CHART_LINE_VROC_CROSS_SIG_DOT_RADIUS = 3;
export const DEFAULT_CHART_LINE_VROC_CROSS_SIG_LENGTH = 12;
export const DEFAULT_CHART_LINE_VROC_CROSS_SIG_SIGNAL_LENGTH = 9;
export const DEFAULT_CHART_LINE_VROC_CROSS_SIG_VOLUME_COLOR = '#2563eb';
export const DEFAULT_CHART_LINE_VROC_CROSS_SIG_VROC_COLOR = '#7c3aed';
export const DEFAULT_CHART_LINE_VROC_CROSS_SIG_SIGNAL_COLOR = '#ea580c';
export const DEFAULT_CHART_LINE_VROC_CROSS_SIG_BULLISH_COLOR = '#16a34a';
export const DEFAULT_CHART_LINE_VROC_CROSS_SIG_BEARISH_COLOR = '#dc2626';
export const DEFAULT_CHART_LINE_VROC_CROSS_SIG_ZERO_COLOR = '#475569';
export const DEFAULT_CHART_LINE_VROC_CROSS_SIG_AXIS_COLOR = '#94a3b8';
export const DEFAULT_CHART_LINE_VROC_CROSS_SIG_GRID_COLOR = '#e2e8f0';

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

const posZero = (value: number): number => (value === 0 ? 0 : value);

/** Keep only points with finite x / volume. */
export function getLineVrocCrossSigFinitePoints(
  data: readonly ChartLineVrocCrossSigPoint[] | null | undefined,
): ChartLineVrocCrossSigPoint[] {
  if (!Array.isArray(data)) return [];
  const out: ChartLineVrocCrossSigPoint[] = [];
  for (const point of data) {
    if (!point) continue;
    if (isFiniteNumber(point.x) && isFiniteNumber(point.volume)) {
      out.push({ x: point.x, volume: point.volume });
    }
  }
  return out;
}

/** Coerce a positive integer length (>= 1). */
export function normalizeLineVrocCrossSigLength(
  length: unknown,
  fallback: number,
): number {
  if (isFiniteNumber(length) && length >= 1) return Math.floor(length);
  return fallback;
}

/**
 * SMA-seeded EMA with the `min === max` window-constant
 * precision fix.
 */
export function applyLineVrocCrossSigEma(
  values: readonly (number | null)[],
  length: number,
): Array<number | null> {
  const out: Array<number | null> = new Array(values.length).fill(null);
  if (length < 1 || values.length === 0) return out;
  const alpha = 2 / (length + 1);

  let seedSum = 0;
  let seedCount = 0;
  let winMin = Infinity;
  let winMax = -Infinity;
  for (let i = 0; i < values.length && seedCount < length; i += 1) {
    const v = values[i];
    if (v == null) {
      seedSum = 0;
      seedCount = 0;
      winMin = Infinity;
      winMax = -Infinity;
      continue;
    }
    seedSum += v;
    seedCount += 1;
    if (v < winMin) winMin = v;
    if (v > winMax) winMax = v;
    if (seedCount === length) {
      const seed =
        winMin === winMax && Number.isFinite(winMin)
          ? winMin
          : posZero(seedSum / length);
      out[i] = seed;
      let prev = seed;
      for (let j = i + 1; j < values.length; j += 1) {
        const nv = values[j];
        if (nv == null) {
          break;
        }
        const next = nv === prev ? nv : posZero(alpha * nv + (1 - alpha) * prev);
        out[j] = next;
        prev = next;
      }
      break;
    }
  }
  return out;
}

export interface LineVrocCrossSigChannels {
  vroc: Array<number | null>;
  signal: Array<number | null>;
}

export function computeLineVrocCrossSig(
  series: readonly ChartLineVrocCrossSigPoint[] | null | undefined,
  options: { length?: number; signalLength?: number } = {},
): LineVrocCrossSigChannels {
  const cleaned = getLineVrocCrossSigFinitePoints(series);
  if (cleaned.length === 0) {
    return { vroc: [], signal: [] };
  }
  const length = normalizeLineVrocCrossSigLength(
    options.length,
    DEFAULT_CHART_LINE_VROC_CROSS_SIG_LENGTH,
  );
  const signalLength = normalizeLineVrocCrossSigLength(
    options.signalLength,
    DEFAULT_CHART_LINE_VROC_CROSS_SIG_SIGNAL_LENGTH,
  );

  const volumes = cleaned.map((p) => p.volume);
  const vroc: Array<number | null> = new Array(volumes.length).fill(null);
  for (let i = length; i < volumes.length; i += 1) {
    const past = volumes[i - length]!;
    if (past === 0) continue;
    vroc[i] = posZero(((volumes[i]! - past) / past) * 100);
  }

  const signal = applyLineVrocCrossSigEma(vroc, signalLength);

  return { vroc, signal };
}

export function classifyLineVrocCrossSigRegime(
  vroc: number | null,
  signal: number | null,
): ChartLineVrocCrossSigRegime {
  if (vroc == null || signal == null) return 'none';
  if (vroc > signal) return 'bullish';
  if (vroc < signal) return 'bearish';
  return 'neutral';
}

export function detectLineVrocCrossSigCrosses(
  series: readonly ChartLineVrocCrossSigPoint[],
  vroc: readonly (number | null)[],
  signal: readonly (number | null)[],
): ChartLineVrocCrossSigCross[] {
  const out: ChartLineVrocCrossSigCross[] = [];
  for (let i = 1; i < series.length; i += 1) {
    const prevVroc = vroc[i - 1];
    const prevSig = signal[i - 1];
    const curVroc = vroc[i];
    const curSig = signal[i];
    if (
      prevVroc == null ||
      prevSig == null ||
      curVroc == null ||
      curSig == null
    ) {
      continue;
    }
    const prevDiff = prevVroc - prevSig;
    const curDiff = curVroc - curSig;
    if (prevDiff <= 0 && curDiff > 0) {
      out.push({ index: i, x: series[i]!.x, kind: 'bullish' });
    } else if (prevDiff >= 0 && curDiff < 0) {
      out.push({ index: i, x: series[i]!.x, kind: 'bearish' });
    }
  }
  return out;
}

export function runLineVrocCrossSig(
  data: ChartLineVrocCrossSigPoint[],
  options: { length?: number; signalLength?: number } = {},
): ChartLineVrocCrossSigRun {
  const cleaned = getLineVrocCrossSigFinitePoints(data);
  const series = [...cleaned].sort((a, b) => a.x - b.x);
  const length = normalizeLineVrocCrossSigLength(
    options.length,
    DEFAULT_CHART_LINE_VROC_CROSS_SIG_LENGTH,
  );
  const signalLength = normalizeLineVrocCrossSigLength(
    options.signalLength,
    DEFAULT_CHART_LINE_VROC_CROSS_SIG_SIGNAL_LENGTH,
  );

  const channels = computeLineVrocCrossSig(series, { length, signalLength });

  const samples: ChartLineVrocCrossSigSample[] = series.map((p, i) => {
    const vroc = channels.vroc[i] ?? null;
    const signal = channels.signal[i] ?? null;
    const regime = classifyLineVrocCrossSigRegime(vroc, signal);
    return {
      index: i,
      x: p.x,
      volume: p.volume,
      vroc,
      signal,
      regime,
    };
  });

  const crosses = detectLineVrocCrossSigCrosses(
    series,
    channels.vroc,
    channels.signal,
  );

  let bullishCount = 0;
  let bearishCount = 0;
  let neutralCount = 0;
  let noneCount = 0;
  for (const s of samples) {
    if (s.regime === 'bullish') bullishCount += 1;
    else if (s.regime === 'bearish') bearishCount += 1;
    else if (s.regime === 'neutral') neutralCount += 1;
    else noneCount += 1;
  }

  const ok = series.length > length + signalLength;

  return {
    series,
    length,
    signalLength,
    vrocValues: channels.vroc,
    signalValues: channels.signal,
    samples,
    crosses,
    bullishCount,
    bearishCount,
    neutralCount,
    noneCount,
    ok,
  };
}

export interface ComputeLineVrocCrossSigLayoutOptions {
  data: ChartLineVrocCrossSigPoint[];
  length?: number;
  signalLength?: number;
  width?: number;
  height?: number;
  padding?: number;
  panelGap?: number;
}

export function computeLineVrocCrossSigLayout(
  opts: ComputeLineVrocCrossSigLayoutOptions,
): ChartLineVrocCrossSigLayout {
  const width = opts.width ?? DEFAULT_CHART_LINE_VROC_CROSS_SIG_WIDTH;
  const height = opts.height ?? DEFAULT_CHART_LINE_VROC_CROSS_SIG_HEIGHT;
  const padding =
    opts.padding ?? DEFAULT_CHART_LINE_VROC_CROSS_SIG_PADDING;
  const panelGap =
    opts.panelGap ?? DEFAULT_CHART_LINE_VROC_CROSS_SIG_PANEL_GAP;

  const run = runLineVrocCrossSig(opts.data, {
    length: opts.length ?? undefined,
    signalLength: opts.signalLength ?? undefined,
  });

  const innerLeft = padding;
  const innerRight = width - padding;
  const usable = height - padding * 2 - panelGap;
  const volumeTop = padding;
  const volumeBottom = padding + usable * 0.55;
  const oscTop = volumeBottom + panelGap;
  const oscBottom = volumeBottom + panelGap + usable * 0.45;

  if (run.series.length === 0) {
    return {
      ok: false,
      width,
      height,
      padding,
      panelGap,
      volumeTop,
      volumeBottom,
      oscTop,
      oscBottom,
      innerLeft,
      innerRight,
      volumePath: '',
      volumeDots: [],
      vrocPath: '',
      signalPath: '',
      volumeMin: 0,
      volumeMax: 0,
      oscMin: -1,
      oscMax: 1,
      zeroY: (oscTop + oscBottom) / 2,
      crossMarkers: [],
      run,
    };
  }

  let volumeMin = Infinity;
  let volumeMax = -Infinity;
  for (const s of run.samples) {
    if (s.volume < volumeMin) volumeMin = s.volume;
    if (s.volume > volumeMax) volumeMax = s.volume;
  }
  if (!Number.isFinite(volumeMin) || !Number.isFinite(volumeMax)) {
    volumeMin = 0;
    volumeMax = 1;
  }
  if (volumeMin === volumeMax) {
    volumeMin -= 1;
    volumeMax += 1;
  }

  let oscMin = Infinity;
  let oscMax = -Infinity;
  for (const s of run.samples) {
    if (s.vroc != null) {
      if (s.vroc < oscMin) oscMin = s.vroc;
      if (s.vroc > oscMax) oscMax = s.vroc;
    }
    if (s.signal != null) {
      if (s.signal < oscMin) oscMin = s.signal;
      if (s.signal > oscMax) oscMax = s.signal;
    }
  }
  if (!Number.isFinite(oscMin) || !Number.isFinite(oscMax)) {
    oscMin = -1;
    oscMax = 1;
  }
  if (oscMin === oscMax) {
    oscMin -= 1;
    oscMax += 1;
  }
  if (oscMin > 0) oscMin = 0;
  if (oscMax < 0) oscMax = 0;

  const xMin = run.series[0]?.x ?? 0;
  const xMax = run.series[run.series.length - 1]?.x ?? xMin + 1;
  const xRange = xMax === xMin ? 1 : xMax - xMin;

  const sx = (x: number): number =>
    innerLeft + ((x - xMin) / xRange) * (innerRight - innerLeft);
  const syVolume = (y: number): number =>
    volumeBottom -
    ((y - volumeMin) / (volumeMax - volumeMin)) *
      (volumeBottom - volumeTop);
  const syOsc = (y: number): number =>
    oscBottom - ((y - oscMin) / (oscMax - oscMin)) * (oscBottom - oscTop);

  let volumePath = '';
  const volumeDots: ChartLineVrocCrossSigDot[] = [];
  for (let i = 0; i < run.samples.length; i += 1) {
    const s = run.samples[i];
    if (!s) continue;
    const cx = sx(s.x);
    const cy = syVolume(s.volume);
    volumePath += `${i === 0 ? 'M' : 'L'} ${cx.toFixed(2)} ${cy.toFixed(2)} `;
    volumeDots.push({
      index: s.index,
      x: s.x,
      cx,
      cy,
      volume: s.volume,
    });
  }

  let vrocPath = '';
  let vrocFirst = true;
  for (const s of run.samples) {
    if (s.vroc == null) {
      vrocFirst = true;
      continue;
    }
    const cx = sx(s.x);
    const cy = syOsc(s.vroc);
    vrocPath += `${vrocFirst ? 'M' : 'L'} ${cx.toFixed(2)} ${cy.toFixed(2)} `;
    vrocFirst = false;
  }
  vrocPath = vrocPath.trim();

  let signalPath = '';
  let signalFirst = true;
  for (const s of run.samples) {
    if (s.signal == null) {
      signalFirst = true;
      continue;
    }
    const cx = sx(s.x);
    const cy = syOsc(s.signal);
    signalPath += `${signalFirst ? 'M' : 'L'} ${cx.toFixed(2)} ${cy.toFixed(2)} `;
    signalFirst = false;
  }
  signalPath = signalPath.trim();

  const crossMarkers = run.crosses.map((c) => ({
    index: c.index,
    x: c.x,
    cx: sx(c.x),
    cy: syOsc(run.vrocValues[c.index] ?? 0),
    kind: c.kind,
  }));

  return {
    ok: true,
    width,
    height,
    padding,
    panelGap,
    volumeTop,
    volumeBottom,
    oscTop,
    oscBottom,
    innerLeft,
    innerRight,
    volumePath: volumePath.trim(),
    volumeDots,
    vrocPath,
    signalPath,
    volumeMin,
    volumeMax,
    oscMin,
    oscMax,
    zeroY: syOsc(0),
    crossMarkers,
    run,
  };
}

export function describeLineVrocCrossSigChart(
  data: ChartLineVrocCrossSigPoint[],
  options: { length?: number; signalLength?: number } = {},
): string {
  const cleaned = getLineVrocCrossSigFinitePoints(data);
  if (cleaned.length === 0) return 'No data';
  const length = normalizeLineVrocCrossSigLength(
    options.length,
    DEFAULT_CHART_LINE_VROC_CROSS_SIG_LENGTH,
  );
  const signalLength = normalizeLineVrocCrossSigLength(
    options.signalLength,
    DEFAULT_CHART_LINE_VROC_CROSS_SIG_SIGNAL_LENGTH,
  );
  return (
    `VROC Cross Signal chart over ${cleaned.length} bars (length ` +
    `${length}, signalLength ${signalLength}). Top panel renders ` +
    `the volume series; bottom panel overlays the Volume Rate of ` +
    `Change with its EMA signal and marks bullish / bearish ` +
    `crossover events separating triggers from the raw VROC line.`
  );
}

const formatNumber = (value: number, digits = 2): string => {
  if (!Number.isFinite(value)) return '--';
  return value.toFixed(digits);
};

const defaultVolumeFormatter = (value: number): string =>
  formatNumber(value, 0);
const defaultOscFormatter = (value: number): string => formatNumber(value, 4);
const defaultXFormatter = (x: number): string => formatNumber(x, 0);

export const ChartLineVrocCrossSig = forwardRef<
  HTMLDivElement,
  ChartLineVrocCrossSigProps
>(function ChartLineVrocCrossSig(props, ref): ReactNode {
  const {
    data,
    length = DEFAULT_CHART_LINE_VROC_CROSS_SIG_LENGTH,
    signalLength = DEFAULT_CHART_LINE_VROC_CROSS_SIG_SIGNAL_LENGTH,
    width = DEFAULT_CHART_LINE_VROC_CROSS_SIG_WIDTH,
    height = DEFAULT_CHART_LINE_VROC_CROSS_SIG_HEIGHT,
    padding = DEFAULT_CHART_LINE_VROC_CROSS_SIG_PADDING,
    panelGap = DEFAULT_CHART_LINE_VROC_CROSS_SIG_PANEL_GAP,
    tickCount = DEFAULT_CHART_LINE_VROC_CROSS_SIG_TICK_COUNT,
    strokeWidth = DEFAULT_CHART_LINE_VROC_CROSS_SIG_STROKE_WIDTH,
    dotRadius = DEFAULT_CHART_LINE_VROC_CROSS_SIG_DOT_RADIUS,
    volumeColor = DEFAULT_CHART_LINE_VROC_CROSS_SIG_VOLUME_COLOR,
    vrocColor = DEFAULT_CHART_LINE_VROC_CROSS_SIG_VROC_COLOR,
    signalColor = DEFAULT_CHART_LINE_VROC_CROSS_SIG_SIGNAL_COLOR,
    bullishColor = DEFAULT_CHART_LINE_VROC_CROSS_SIG_BULLISH_COLOR,
    bearishColor = DEFAULT_CHART_LINE_VROC_CROSS_SIG_BEARISH_COLOR,
    zeroColor = DEFAULT_CHART_LINE_VROC_CROSS_SIG_ZERO_COLOR,
    axisColor = DEFAULT_CHART_LINE_VROC_CROSS_SIG_AXIS_COLOR,
    gridColor = DEFAULT_CHART_LINE_VROC_CROSS_SIG_GRID_COLOR,
    showAxis = true,
    showGrid = true,
    showDots = false,
    showVroc = true,
    showSignal = true,
    showCrosses = true,
    showZeroLine = true,
    showTooltip = true,
    showConfigBadge = true,
    showLegend = true,
    animate = true,
    hiddenSeries,
    defaultHiddenSeries,
    onSeriesToggle,
    formatVolume = defaultVolumeFormatter,
    formatOsc = defaultOscFormatter,
    formatX = defaultXFormatter,
    ariaLabel,
    ariaDescription,
    className,
    style,
    ...rest
  } = props;

  const reactId = useId();
  const titleId = `${reactId}-title`;
  const descId = `${reactId}-desc`;

  const cleaned = useMemo(
    () => getLineVrocCrossSigFinitePoints(data),
    [data],
  );

  const layout = useMemo(
    () =>
      computeLineVrocCrossSigLayout({
        data: cleaned,
        length,
        signalLength,
        width,
        height,
        padding,
        panelGap,
      }),
    [cleaned, length, signalLength, width, height, padding, panelGap],
  );

  const isControlled = Array.isArray(hiddenSeries);
  const [uncontrolledHidden, setUncontrolledHidden] = useState<
    ChartLineVrocCrossSigSeriesId[]
  >(defaultHiddenSeries ?? []);
  const hiddenList = isControlled
    ? (hiddenSeries ?? [])
    : uncontrolledHidden;
  const hidden = new Set(hiddenList);

  const handleLegendClick = (seriesId: ChartLineVrocCrossSigSeriesId) => {
    const isHidden = hidden.has(seriesId);
    const next = isHidden
      ? hiddenList.filter((s) => s !== seriesId)
      : [...hiddenList, seriesId];
    if (!isControlled) setUncontrolledHidden(next);
    onSeriesToggle?.({ seriesId, hidden: !isHidden });
  };

  const handleLegendKey = (
    e: KeyboardEvent<HTMLButtonElement>,
    seriesId: ChartLineVrocCrossSigSeriesId,
  ): void => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      handleLegendClick(seriesId);
    }
  };

  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  if (cleaned.length === 0) {
    return (
      <div
        ref={ref}
        className={className}
        style={style}
        data-section="chart-line-vroc-cross-sig-empty"
      >
        No data
      </div>
    );
  }

  const desc =
    ariaDescription ??
    describeLineVrocCrossSigChart(cleaned, { length, signalLength });

  const showVolume = !hidden.has('volume');
  const showVrocLine = !hidden.has('vroc') && showVroc;
  const showSignalLine = !hidden.has('signal') && showSignal;

  const tickVolumeValues: number[] = [];
  for (let i = 0; i <= tickCount; i += 1) {
    tickVolumeValues.push(
      layout.volumeMin +
        ((layout.volumeMax - layout.volumeMin) * i) / tickCount,
    );
  }
  const tickOscValues: number[] = [];
  for (let i = 0; i <= tickCount; i += 1) {
    tickOscValues.push(
      layout.oscMin + ((layout.oscMax - layout.oscMin) * i) / tickCount,
    );
  }

  const tooltipSample =
    hoverIndex == null ? null : layout.run.samples[hoverIndex];

  return (
    <div
      ref={ref}
      className={className}
      style={style}
      role="region"
      aria-label={ariaLabel ?? 'VROC Cross Signal chart'}
      aria-describedby={descId}
      data-section="chart-line-vroc-cross-sig"
      data-length={length}
      data-signal-length={signalLength}
      data-total-points={cleaned.length}
      data-bullish-count={layout.run.bullishCount}
      data-bearish-count={layout.run.bearishCount}
      data-neutral-count={layout.run.neutralCount}
      data-cross-count={layout.run.crosses.length}
    >
      <span
        id={titleId}
        className="sr-only"
        data-section="chart-line-vroc-cross-sig-title"
      >
        {ariaLabel ?? 'VROC Cross Signal chart'}
      </span>
      <span
        id={descId}
        className="sr-only"
        data-section="chart-line-vroc-cross-sig-aria-desc"
      >
        {desc}
      </span>
      <svg
        role="img"
        aria-labelledby={titleId}
        aria-describedby={descId}
        tabIndex={0}
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        className={animate ? 'motion-safe:animate-fade-in' : undefined}
        data-section="chart-line-vroc-cross-sig-svg"
        {...rest}
      >
        {showGrid ? (
          <g data-section="chart-line-vroc-cross-sig-grid">
            {tickVolumeValues.map((v, i) => {
              const y =
                layout.volumeBottom -
                ((v - layout.volumeMin) /
                  (layout.volumeMax - layout.volumeMin)) *
                  (layout.volumeBottom - layout.volumeTop);
              return (
                <line
                  key={`grid-vol-${i}`}
                  x1={layout.innerLeft}
                  y1={y}
                  x2={layout.innerRight}
                  y2={y}
                  stroke={gridColor}
                  strokeDasharray="3 3"
                  data-section="chart-line-vroc-cross-sig-grid-line-volume"
                />
              );
            })}
            {tickOscValues.map((v, i) => {
              const y =
                layout.oscBottom -
                ((v - layout.oscMin) /
                  (layout.oscMax - layout.oscMin)) *
                  (layout.oscBottom - layout.oscTop);
              return (
                <line
                  key={`grid-osc-${i}`}
                  x1={layout.innerLeft}
                  y1={y}
                  x2={layout.innerRight}
                  y2={y}
                  stroke={gridColor}
                  strokeDasharray="3 3"
                  data-section="chart-line-vroc-cross-sig-grid-line-osc"
                />
              );
            })}
          </g>
        ) : null}

        {showAxis ? (
          <g data-section="chart-line-vroc-cross-sig-axes">
            <line
              x1={layout.innerLeft}
              y1={layout.volumeTop}
              x2={layout.innerLeft}
              y2={layout.volumeBottom}
              stroke={axisColor}
            />
            <line
              x1={layout.innerLeft}
              y1={layout.volumeBottom}
              x2={layout.innerRight}
              y2={layout.volumeBottom}
              stroke={axisColor}
            />
            <line
              x1={layout.innerLeft}
              y1={layout.oscTop}
              x2={layout.innerLeft}
              y2={layout.oscBottom}
              stroke={axisColor}
            />
            <line
              x1={layout.innerLeft}
              y1={layout.oscBottom}
              x2={layout.innerRight}
              y2={layout.oscBottom}
              stroke={axisColor}
            />
            {tickVolumeValues.map((v, i) => {
              const y =
                layout.volumeBottom -
                ((v - layout.volumeMin) /
                  (layout.volumeMax - layout.volumeMin)) *
                  (layout.volumeBottom - layout.volumeTop);
              return (
                <text
                  key={`tick-vol-${i}`}
                  x={layout.innerLeft - 6}
                  y={y + 3}
                  fontSize={10}
                  fill={axisColor}
                  textAnchor="end"
                  data-section="chart-line-vroc-cross-sig-tick-volume"
                >
                  {formatVolume(v)}
                </text>
              );
            })}
            {tickOscValues.map((v, i) => {
              const y =
                layout.oscBottom -
                ((v - layout.oscMin) /
                  (layout.oscMax - layout.oscMin)) *
                  (layout.oscBottom - layout.oscTop);
              return (
                <text
                  key={`tick-osc-${i}`}
                  x={layout.innerLeft - 6}
                  y={y + 3}
                  fontSize={10}
                  fill={axisColor}
                  textAnchor="end"
                  data-section="chart-line-vroc-cross-sig-tick-osc"
                >
                  {formatOsc(v)}
                </text>
              );
            })}
          </g>
        ) : null}

        {showZeroLine ? (
          <line
            x1={layout.innerLeft}
            y1={layout.zeroY}
            x2={layout.innerRight}
            y2={layout.zeroY}
            stroke={zeroColor}
            strokeDasharray="2 4"
            data-section="chart-line-vroc-cross-sig-zeroline"
          />
        ) : null}

        {showVolume ? (
          <path
            d={layout.volumePath}
            stroke={volumeColor}
            strokeWidth={strokeWidth}
            fill="none"
            data-section="chart-line-vroc-cross-sig-volume-path"
          />
        ) : null}

        {showDots && showVolume ? (
          <g data-section="chart-line-vroc-cross-sig-volume-dots">
            {layout.volumeDots.map((d) => (
              <circle
                key={`vol-dot-${d.index}`}
                cx={d.cx}
                cy={d.cy}
                r={dotRadius}
                fill={volumeColor}
                data-section="chart-line-vroc-cross-sig-volume-dot"
              />
            ))}
          </g>
        ) : null}

        {showVrocLine ? (
          <path
            d={layout.vrocPath}
            stroke={vrocColor}
            strokeWidth={strokeWidth}
            fill="none"
            data-section="chart-line-vroc-cross-sig-vroc-path"
          />
        ) : null}

        {showSignalLine ? (
          <path
            d={layout.signalPath}
            stroke={signalColor}
            strokeWidth={strokeWidth}
            fill="none"
            data-section="chart-line-vroc-cross-sig-signal-path"
          />
        ) : null}

        {showCrosses ? (
          <g
            data-section="chart-line-vroc-cross-sig-crosses"
            role="group"
            aria-label="cross markers"
          >
            {layout.crossMarkers.map((m) => (
              <circle
                key={`cross-${m.index}`}
                cx={m.cx}
                cy={m.cy}
                r={4}
                fill={m.kind === 'bullish' ? bullishColor : bearishColor}
                role="graphics-symbol"
                tabIndex={0}
                aria-label={`${m.kind} cross at ${formatX(m.x)}`}
                data-section={`chart-line-vroc-cross-sig-cross-${m.kind}`}
              />
            ))}
          </g>
        ) : null}

        {showTooltip ? (
          <g data-section="chart-line-vroc-cross-sig-hover-targets">
            {layout.volumeDots.map((d, idx) => (
              <rect
                key={`hover-${d.index}`}
                x={d.cx - 5}
                y={layout.volumeTop}
                width={10}
                height={layout.oscBottom - layout.volumeTop}
                fill="transparent"
                onMouseEnter={() => setHoverIndex(idx)}
                onMouseLeave={() => setHoverIndex(null)}
                onFocus={() => setHoverIndex(idx)}
                onBlur={() => setHoverIndex(null)}
                tabIndex={0}
                data-section="chart-line-vroc-cross-sig-hover"
              />
            ))}
            {tooltipSample ? (
              <g
                transform={`translate(${layout.volumeDots[hoverIndex ?? 0]?.cx ?? 0}, ${layout.volumeTop + 8})`}
                data-section="chart-line-vroc-cross-sig-tooltip"
              >
                <rect
                  x={4}
                  y={0}
                  width={206}
                  height={132}
                  rx={4}
                  fill="rgba(15, 23, 42, 0.92)"
                />
                <text
                  x={12}
                  y={16}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-vroc-cross-sig-tooltip-x"
                >
                  x {formatX(tooltipSample.x)}
                </text>
                <text
                  x={12}
                  y={30}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-vroc-cross-sig-tooltip-volume"
                >
                  volume {formatVolume(tooltipSample.volume)}
                </text>
                <text
                  x={12}
                  y={44}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-vroc-cross-sig-tooltip-vroc"
                >
                  vroc{' '}
                  {tooltipSample.vroc == null
                    ? '--'
                    : formatOsc(tooltipSample.vroc)}
                </text>
                <text
                  x={12}
                  y={58}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-vroc-cross-sig-tooltip-signal"
                >
                  signal{' '}
                  {tooltipSample.signal == null
                    ? '--'
                    : formatOsc(tooltipSample.signal)}
                </text>
                <text
                  x={12}
                  y={72}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-vroc-cross-sig-tooltip-regime"
                >
                  regime {tooltipSample.regime}
                </text>
                <text
                  x={12}
                  y={86}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-vroc-cross-sig-tooltip-counts"
                >
                  bullish {layout.run.bullishCount} | bearish{' '}
                  {layout.run.bearishCount}
                </text>
                <text
                  x={12}
                  y={100}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-vroc-cross-sig-tooltip-counts2"
                >
                  neutral {layout.run.neutralCount} | none{' '}
                  {layout.run.noneCount}
                </text>
                <text
                  x={12}
                  y={114}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-vroc-cross-sig-tooltip-crosses"
                >
                  crosses {layout.run.crosses.length}
                </text>
              </g>
            ) : null}
          </g>
        ) : null}
      </svg>

      {showConfigBadge ? (
        <div
          data-section="chart-line-vroc-cross-sig-badge"
          style={{
            display: 'inline-block',
            padding: '2px 6px',
            fontSize: 10,
            border: `1px solid ${axisColor}`,
            borderRadius: 4,
            marginTop: 4,
          }}
        >
          length {length} | signal {signalLength} | crosses{' '}
          {layout.run.crosses.length}
        </div>
      ) : null}

      {showLegend ? (
        <div
          role="group"
          aria-label="Series legend"
          data-section="chart-line-vroc-cross-sig-legend"
          style={{
            display: 'flex',
            gap: 12,
            marginTop: 4,
            flexWrap: 'wrap',
          }}
        >
          {(
            [
              {
                id: 'volume' as const,
                color: volumeColor,
                label: 'volume',
              },
              { id: 'vroc' as const, color: vrocColor, label: 'vroc' },
              {
                id: 'signal' as const,
                color: signalColor,
                label: 'signal',
              },
            ] satisfies Array<{
              id: ChartLineVrocCrossSigSeriesId;
              color: string;
              label: string;
            }>
          ).map(({ id, color, label }) => (
            <button
              key={id}
              type="button"
              data-series-id={id}
              aria-pressed={!hidden.has(id)}
              onClick={() => handleLegendClick(id)}
              onKeyDown={(e) => handleLegendKey(e, id)}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
                padding: '2px 6px',
                fontSize: 11,
                opacity: hidden.has(id) ? 0.4 : 1,
                border: 'none',
                background: 'transparent',
                cursor: 'pointer',
              }}
            >
              <span
                style={{
                  display: 'inline-block',
                  width: 10,
                  height: 10,
                  background: color,
                  borderRadius: 2,
                }}
              />
              {label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
});

ChartLineVrocCrossSig.displayName = 'ChartLineVrocCrossSig';
