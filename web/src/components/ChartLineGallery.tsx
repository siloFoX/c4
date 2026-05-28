import {
  lazy,
  Suspense,
  useDeferredValue,
  useMemo,
  useState,
  type ComponentType,
  type LazyExoticComponent,
} from 'react';
import { UIErrorBoundary } from './ui/error-boundary';
import { Skeleton } from './ui/skeleton';

// (v1.11.1099, TODO 11.1081) Chart-line showcase gallery.
//
// 1154 `chart-line-*` primitives live under components/ui but
// App.tsx imported none of them, leaving them as dead code with no
// way for an operator to see them. This gallery surfaces a curated,
// representative slice of those primitives behind the `gallery`
// top-view route.
//
// Design notes:
//   * Each entry is lazy-loaded via `React.lazy(() => import(...))`
//     so the chart chunks stay out of the main bundle and only
//     fetch when the gallery is visited. Named exports are mapped
//     to a `default` so they satisfy the `lazy` contract.
//   * Every chart-line primitive validates and ignores fields it
//     does not use, so a single UNIVERSAL sample point that carries
//     every field (`high`/`low`/`close`/`value`/`volume`) feeds all
//     of them regardless of their individual input shape -- no
//     per-chart shape metadata is needed. The series is a
//     sine + drift wave long enough (96 bars) to clear the longest
//     warmup (Ichimoku senkouB = 52) so crosses / divergences
//     actually fire.
//   * Each tile is wrapped in its own `UIErrorBoundary` so a single
//     misbehaving chart degrades to an inline "failed" card instead
//     of blanking the whole grid.
//   * The grid is a responsive CSS grid (1 / 2 / 3 columns) and a
//     case-insensitive search filter narrows by id or label.

interface GalleryChartProps {
  data: unknown;
  width?: number;
  height?: number;
  showConfigBadge?: boolean;
  showLegend?: boolean;
}

interface GalleryEntry {
  id: string;
  label: string;
  Component: LazyExoticComponent<ComponentType<GalleryChartProps>>;
}

function entry(
  id: string,
  label: string,
  loader: () => Promise<Record<string, unknown>>,
  exportName: string,
): GalleryEntry {
  return {
    id,
    label,
    Component: lazy(() =>
      loader().then((mod) => ({
        default: mod[exportName] as ComponentType<GalleryChartProps>,
      })),
    ),
  };
}

// Curated registry of verified primitives (export names confirmed
// against components/ui). The universal sample feeds every shape,
// so adding more is just one line per chart.
const REGISTRY: GalleryEntry[] = [
  entry('chart-line-di-cross-sig', 'DI Cross Signal', () => import('./ui/chart-line-di-cross-sig'), 'ChartLineDiCrossSig'),
  entry('chart-line-sar-cross-sig', 'SAR Cross Signal', () => import('./ui/chart-line-sar-cross-sig'), 'ChartLineSarCrossSig'),
  entry('chart-line-psar-flip-cross', 'Parabolic SAR Flip', () => import('./ui/chart-line-psar-flip-cross'), 'ChartLinePsarFlipCross'),
  entry('chart-line-momentum-divergence-cross', 'Momentum Divergence', () => import('./ui/chart-line-momentum-divergence-cross'), 'ChartLineMomentumDivergenceCross'),
  entry('chart-line-roc-divergence-cross', 'ROC Divergence', () => import('./ui/chart-line-roc-divergence-cross'), 'ChartLineRocDivergenceCross'),
  entry('chart-line-awesome-zero-divergence', 'Awesome Oscillator Divergence', () => import('./ui/chart-line-awesome-zero-divergence'), 'ChartLineAwesomeZeroDivergence'),
  entry('chart-line-cmo-zero-cross-sig', 'CMO Zero Cross Signal', () => import('./ui/chart-line-cmo-zero-cross-sig'), 'ChartLineCmoZeroCrossSig'),
  entry('chart-line-cci-overbought-divergence', 'CCI Overbought Divergence', () => import('./ui/chart-line-cci-overbought-divergence'), 'ChartLineCciOverboughtDivergence'),
  entry('chart-line-cci-oversold-divergence', 'CCI Oversold Divergence', () => import('./ui/chart-line-cci-oversold-divergence'), 'ChartLineCciOversoldDivergence'),
  entry('chart-line-williams-overbought-divergence', 'Williams %R Overbought Divergence', () => import('./ui/chart-line-williams-overbought-divergence'), 'ChartLineWilliamsOverboughtDivergence'),
  entry('chart-line-williams-oversold-divergence', 'Williams %R Oversold Divergence', () => import('./ui/chart-line-williams-oversold-divergence'), 'ChartLineWilliamsOversoldDivergence'),
  entry('chart-line-ichimoku-kijun-cross', 'Ichimoku Kijun Cross', () => import('./ui/chart-line-ichimoku-kijun-cross'), 'ChartLineIchimokuKijunCross'),
  entry('chart-line-ichimoku-tenkan-cross', 'Ichimoku Tenkan Cross', () => import('./ui/chart-line-ichimoku-tenkan-cross'), 'ChartLineIchimokuTenkanCross'),
  entry('chart-line-volume-trend-cross', 'Volume-Weighted Trend Cross', () => import('./ui/chart-line-volume-trend-cross'), 'ChartLineVolumeTrendCross'),
  entry('chart-line-volume-spike-cross', 'Volume Spike Cross', () => import('./ui/chart-line-volume-spike-cross'), 'ChartLineVolumeSpikeCross'),
  entry('chart-line-adx-pos-cross', 'ADX +DI Zero Cross', () => import('./ui/chart-line-adx-pos-cross'), 'ChartLineAdxPosCross'),
  entry('chart-line-adx-neg-cross', 'ADX -DI Zero Cross', () => import('./ui/chart-line-adx-neg-cross'), 'ChartLineAdxNegCross'),
  entry('chart-line-adx-trend-cross', 'ADX Trend Cross', () => import('./ui/chart-line-adx-trend-cross'), 'ChartLineAdxTrendCross'),
  entry('chart-line-rsi', 'RSI', () => import('./ui/chart-line-rsi'), 'ChartLineRsi'),
  entry('chart-line-macd', 'MACD', () => import('./ui/chart-line-macd'), 'ChartLineMacd'),
  entry('chart-line-trix', 'TRIX', () => import('./ui/chart-line-trix'), 'ChartLineTrix'),
  entry('chart-line-cci', 'Commodity Channel Index', () => import('./ui/chart-line-cci'), 'ChartLineCci'),
  entry('chart-line-williams-r', 'Williams %R', () => import('./ui/chart-line-williams-r'), 'ChartLineWilliamsR'),
  entry('chart-line-aroon', 'Aroon', () => import('./ui/chart-line-aroon'), 'ChartLineAroon'),
  entry('chart-line-keltner', 'Keltner Channels', () => import('./ui/chart-line-keltner'), 'ChartLineKeltner'),
  entry('chart-line-supertrend', 'Supertrend', () => import('./ui/chart-line-supertrend'), 'ChartLineSupertrend'),
  entry('chart-line-donchian', 'Donchian Channels', () => import('./ui/chart-line-donchian'), 'ChartLineDonchian'),
  entry('chart-line-mfi', 'Money Flow Index', () => import('./ui/chart-line-mfi'), 'ChartLineMfi'),
  entry('chart-line-vortex', 'Vortex Indicator', () => import('./ui/chart-line-vortex'), 'ChartLineVortex'),
  entry('chart-line-kama', 'Kaufman Adaptive MA', () => import('./ui/chart-line-kama'), 'ChartLineKama'),
  entry('chart-line-tema', 'Triple EMA', () => import('./ui/chart-line-tema'), 'ChartLineTema'),
  entry('chart-line-dema', 'Double EMA', () => import('./ui/chart-line-dema'), 'ChartLineDema'),
  entry('chart-line-hma', 'Hull MA', () => import('./ui/chart-line-hma'), 'ChartLineHma'),
  entry('chart-line-ppo', 'Percentage Price Oscillator', () => import('./ui/chart-line-ppo'), 'ChartLinePpo'),
  entry('chart-line-dpo', 'Detrended Price Oscillator', () => import('./ui/chart-line-dpo'), 'ChartLineDpo'),
  entry('chart-line-cmo', 'Chande Momentum Oscillator', () => import('./ui/chart-line-cmo'), 'ChartLineCmo'),
  entry('chart-line-momentum', 'Momentum', () => import('./ui/chart-line-momentum'), 'ChartLineMomentum'),
  entry('chart-line-parabolic-sar', 'Parabolic SAR', () => import('./ui/chart-line-parabolic-sar'), 'ChartLineParabolicSar'),
  entry('chart-line-stoch-rsi', 'Stochastic RSI', () => import('./ui/chart-line-stoch-rsi'), 'ChartLineStochRsi'),
  entry('chart-line-ema-cross', 'EMA Cross', () => import('./ui/chart-line-ema-cross'), 'ChartLineEmaCross'),
  entry('chart-line-sma-cross', 'SMA Cross', () => import('./ui/chart-line-sma-cross'), 'ChartLineSmaCross'),
];

// Universal sample: a sine + drift wave carrying every field a
// chart-line primitive might read. 96 bars clears the longest
// warmup (Ichimoku senkouB = 52).
export const GALLERY_SAMPLE = Array.from({ length: 96 }, (_, i) => {
  const base = 100 + 24 * Math.sin(i / 7) + i * 0.4 + 6 * Math.sin(i / 2.3);
  return {
    x: i,
    open: base - 1,
    high: base + 4,
    low: base - 4,
    close: base,
    value: base,
    volume: 800 + 600 * Math.abs(Math.sin(i / 3)),
  };
});

const TILE_WIDTH = 420;
const TILE_HEIGHT = 260;

function GalleryTile({ item }: { item: GalleryEntry }) {
  const { Component, label, id } = item;
  return (
    <div
      data-section="chart-gallery-tile"
      data-chart-id={id}
      className="flex flex-col overflow-hidden rounded-lg border border-border bg-card"
    >
      <div className="flex items-baseline justify-between gap-2 border-b border-border px-3 py-2">
        <span className="truncate text-sm font-medium text-foreground">
          {label}
        </span>
        <span className="shrink-0 font-mono text-[10px] text-muted-foreground">
          {id.replace(/^chart-line-/, '')}
        </span>
      </div>
      <div className="min-h-[200px] overflow-hidden p-2">
        <UIErrorBoundary
          title="Chart failed"
          description="This primitive did not render with the sample data."
        >
          <Suspense
            fallback={
              // (v1.11.1105, TODO 11.1087) Animated skeleton placeholder
              // while the lazy chart chunk mounts. Previously a static
              // "Loading chart..." line, which read as 41 frozen labels
              // on first visit; an animated Skeleton signals progress so
              // the grid does not look stuck while the chunks fetch.
              <div
                data-section="chart-gallery-tile-skeleton"
                className="flex h-[200px] flex-col gap-2 p-1"
                aria-hidden="true"
              >
                <Skeleton variant="rect" className="h-full w-full rounded-md" />
              </div>
            }
          >
            <Component
              data={GALLERY_SAMPLE}
              width={TILE_WIDTH}
              height={TILE_HEIGHT}
              showConfigBadge={false}
              showLegend={false}
            />
          </Suspense>
        </UIErrorBoundary>
      </div>
    </div>
  );
}

export default function ChartLineGallery() {
  const [query, setQuery] = useState('');
  const deferredQuery = useDeferredValue(query);

  const filtered = useMemo(() => {
    const q = deferredQuery.trim().toLowerCase();
    if (!q) return REGISTRY;
    return REGISTRY.filter(
      (e) =>
        e.id.toLowerCase().includes(q) ||
        e.label.toLowerCase().includes(q),
    );
  }, [deferredQuery]);

  return (
    <div
      data-section="chart-line-gallery"
      role="region"
      aria-label="Chart-line primitive gallery"
      className="flex min-h-0 min-w-0 flex-1 flex-col overflow-auto p-4 md:p-6"
    >
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-col gap-1">
          <h1 className="text-lg font-semibold text-foreground">
            Chart-line gallery
          </h1>
          <p className="text-sm text-muted-foreground">
            {filtered.length} of {REGISTRY.length} pure-SVG chart-line
            primitives, lazy-loaded with a shared sample series.
          </p>
        </div>
        <label className="flex items-center gap-2">
          <span className="sr-only">Filter charts</span>
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filter charts..."
            data-section="chart-gallery-search"
            className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background sm:w-64"
          />
        </label>
      </div>

      {filtered.length === 0 ? (
        <div
          data-section="chart-gallery-empty"
          className="flex flex-1 items-center justify-center text-sm text-muted-foreground"
        >
          No charts match "{deferredQuery}".
        </div>
      ) : (
        <div
          data-section="chart-gallery-grid"
          className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3"
        >
          {filtered.map((item) => (
            <GalleryTile key={item.id} item={item} />
          ))}
        </div>
      )}
    </div>
  );
}

ChartLineGallery.displayName = 'ChartLineGallery';
