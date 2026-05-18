import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { CSSProperties, ReactElement } from 'react';
import { cn } from '../../lib/cn';

// (v1.11.412, TODO 11.394) ThemeCustomizer primitive.
//
// Runtime CSS-variable editor with three canonical knobs:
//
//   - radius  -- numeric base for the --radius-{sm,md,lg,xl,2xl}
//                ladder. Slider 0..24 px.
//   - hue     -- HSL hue used by the --brand family. Slider 0..360.
//   - contrast-- 0..100 lightness shift for --text-* + --border-*
//                series. Higher = brighter text on dark surfaces.
//
// Reference: /root/c4/arps-design-system-v1/tokens.css. The output
// CSS variables match the tokens' HSL-triplet shape ("H S% L%"),
// so callers consume them via `hsl(var(--brand))` etc. without any
// adapter layer.
//
// Two host modes:
//   - target='scope' (default) -- inline style attribute on the
//     wrapper div. Scoped to descendants. Safe to mount multiple
//     side-by-side without bleeding into the surrounding page.
//   - target='root' -- writes via
//     document.documentElement.style.setProperty so the entire
//     document picks up the new values. Used for the live "skin
//     the whole app" mode. Cleared by `clearThemeCustomizerRoot()`
//     for tests.
//
// Persistence is opt-in via `storageKey`. The latest config
// serializes as JSON.

export interface ThemeConfig {
  radius: number;
  hue: number;
  contrast: number;
}

export const DEFAULT_THEME_CONFIG: ThemeConfig = {
  radius: 8,
  hue: 264,
  contrast: 50,
};

export const THEME_CONFIG_BOUNDS = {
  radius: { min: 0, max: 24 },
  hue: { min: 0, max: 360 },
  contrast: { min: 0, max: 100 },
} as const;

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, value));
}

export function normalizeThemeConfig(
  input: Partial<ThemeConfig> | null | undefined,
): ThemeConfig {
  const i = input ?? {};
  const radiusIn =
    typeof i.radius === 'number'
      ? i.radius
      : DEFAULT_THEME_CONFIG.radius;
  const hueIn =
    typeof i.hue === 'number' ? i.hue : DEFAULT_THEME_CONFIG.hue;
  const contrastIn =
    typeof i.contrast === 'number'
      ? i.contrast
      : DEFAULT_THEME_CONFIG.contrast;
  return {
    radius: clamp(
      radiusIn,
      THEME_CONFIG_BOUNDS.radius.min,
      THEME_CONFIG_BOUNDS.radius.max,
    ),
    hue: clamp(
      hueIn,
      THEME_CONFIG_BOUNDS.hue.min,
      THEME_CONFIG_BOUNDS.hue.max,
    ),
    contrast: clamp(
      contrastIn,
      THEME_CONFIG_BOUNDS.contrast.min,
      THEME_CONFIG_BOUNDS.contrast.max,
    ),
  };
}

function fmt(n: number): string {
  // 2-decimal trim so 8 -> "8", 6.5 -> "6.5", 4.123 -> "4.12"
  const rounded = Math.round(n * 100) / 100;
  if (Number.isInteger(rounded)) return String(rounded);
  return rounded.toFixed(2).replace(/0+$/, '').replace(/\.$/, '');
}

export function themeConfigToCssVars(
  config: ThemeConfig,
): Record<string, string> {
  const c = normalizeThemeConfig(config);
  const r = c.radius;
  const h = c.hue;
  // Interpolate lightness from the config slider into the
  // canonical text + border ramps. The midpoint (contrast=50) is
  // close to the original tokens.css defaults.
  const t = c.contrast / 100;
  const lTextPrimary = 75 + t * 25; // 75..100
  const lTextSecondary = 55 + t * 30; // 55..85
  const lTextTertiary = 40 + t * 25; // 40..65
  const lBorderDefault = 18 + t * 20; // 18..38
  return {
    '--radius-sm': `${fmt(r * 0.25)}px`,
    '--radius-md': `${fmt(r * 0.5)}px`,
    '--radius-lg': `${fmt(r * 0.75)}px`,
    '--radius-xl': `${fmt(r)}px`,
    '--radius-2xl': `${fmt(r * 1.5)}px`,
    '--brand': `${fmt(h)} 80% 65%`,
    '--brand-hover': `${fmt(h)} 80% 72%`,
    '--brand-pressed': `${fmt(h)} 75% 58%`,
    '--brand-subtle': `${fmt(h)} 50% 22%`,
    '--text-primary': `220 15% ${fmt(lTextPrimary)}%`,
    '--text-secondary': `220 10% ${fmt(lTextSecondary)}%`,
    '--text-tertiary': `220 8% ${fmt(lTextTertiary)}%`,
    '--border-default': `220 10% ${fmt(lBorderDefault)}%`,
  };
}

export function serializeThemeConfigCss(config: ThemeConfig): string {
  const vars = themeConfigToCssVars(config);
  const lines = Object.entries(vars).map(
    ([key, value]) => `  ${key}: ${value};`,
  );
  return `:root {\n${lines.join('\n')}\n}`;
}

export function serializeThemeConfigJson(config: ThemeConfig): string {
  return JSON.stringify(normalizeThemeConfig(config), null, 2);
}

const ROOT_VAR_KEYS = [
  '--radius-sm',
  '--radius-md',
  '--radius-lg',
  '--radius-xl',
  '--radius-2xl',
  '--brand',
  '--brand-hover',
  '--brand-pressed',
  '--brand-subtle',
  '--text-primary',
  '--text-secondary',
  '--text-tertiary',
  '--border-default',
] as const;

export function clearThemeCustomizerRoot(): void {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  for (const key of ROOT_VAR_KEYS) {
    root.style.removeProperty(key);
  }
}

export interface ThemeCustomizerProps {
  initialConfig?: Partial<ThemeConfig>;
  storageKey?: string;
  target?: 'root' | 'scope';
  onChange?: (config: ThemeConfig) => void;
  onExport?: (text: string, format: 'css' | 'json') => void;
  className?: string;
  ariaLabel?: string;
  exportFormat?: 'css' | 'json';
  copyFeedbackMs?: number;
}

const DEFAULT_STORAGE_KEY = 'c4:theme-customizer';

function readStored(
  storageKey: string | undefined,
): ThemeConfig | null {
  if (!storageKey) return null;
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    return normalizeThemeConfig(parsed as Partial<ThemeConfig>);
  } catch {
    return null;
  }
}

export function ThemeCustomizer({
  initialConfig,
  storageKey,
  target = 'scope',
  onChange,
  onExport,
  className,
  ariaLabel = 'Theme customizer',
  exportFormat = 'css',
  copyFeedbackMs = 1500,
}: ThemeCustomizerProps): ReactElement {
  const [config, setConfig] = useState<ThemeConfig>(() => {
    const stored = readStored(storageKey);
    if (stored) return stored;
    return normalizeThemeConfig(initialConfig);
  });

  const [copied, setCopied] = useState<boolean>(false);
  const onChangeRef = useRef(onChange);
  const onExportRef = useRef(onExport);
  const initialMount = useRef<boolean>(true);

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    onExportRef.current = onExport;
  }, [onExport]);

  useEffect(() => {
    if (!storageKey) return;
    if (typeof window === 'undefined') return;
    try {
      window.localStorage.setItem(
        storageKey,
        JSON.stringify(config),
      );
    } catch {
      // ignore quota / privacy mode write failures
    }
  }, [storageKey, config]);

  useEffect(() => {
    if (target !== 'root') return;
    if (typeof document === 'undefined') return;
    const root = document.documentElement;
    const vars = themeConfigToCssVars(config);
    for (const [key, value] of Object.entries(vars)) {
      root.style.setProperty(key, value);
    }
  }, [target, config]);

  useEffect(() => {
    // skip the first effect so onChange is not double-fired on
    // mount with the initial config -- the caller already knows
    // its own initialConfig.
    if (initialMount.current) {
      initialMount.current = false;
      return;
    }
    onChangeRef.current?.(config);
  }, [config]);

  const handleRadius = useCallback((next: number) => {
    setConfig((prev) => ({
      ...prev,
      radius: clamp(
        next,
        THEME_CONFIG_BOUNDS.radius.min,
        THEME_CONFIG_BOUNDS.radius.max,
      ),
    }));
  }, []);

  const handleHue = useCallback((next: number) => {
    setConfig((prev) => ({
      ...prev,
      hue: clamp(
        next,
        THEME_CONFIG_BOUNDS.hue.min,
        THEME_CONFIG_BOUNDS.hue.max,
      ),
    }));
  }, []);

  const handleContrast = useCallback((next: number) => {
    setConfig((prev) => ({
      ...prev,
      contrast: clamp(
        next,
        THEME_CONFIG_BOUNDS.contrast.min,
        THEME_CONFIG_BOUNDS.contrast.max,
      ),
    }));
  }, []);

  const handleReset = useCallback(() => {
    setConfig(DEFAULT_THEME_CONFIG);
  }, []);

  const copyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );

  const handleExport = useCallback(async () => {
    const text =
      exportFormat === 'json'
        ? serializeThemeConfigJson(config)
        : serializeThemeConfigCss(config);
    onExportRef.current?.(text, exportFormat);
    if (
      typeof navigator !== 'undefined' &&
      navigator.clipboard &&
      typeof navigator.clipboard.writeText === 'function'
    ) {
      try {
        await navigator.clipboard.writeText(text);
        setCopied(true);
        if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
        copyTimerRef.current = setTimeout(
          () => setCopied(false),
          copyFeedbackMs,
        );
      } catch {
        // clipboard rejected -- keep onExport for tests
      }
    }
  }, [exportFormat, config, copyFeedbackMs]);

  useEffect(() => {
    return () => {
      if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
    };
  }, []);

  const scopeStyle = useMemo<CSSProperties | undefined>(() => {
    if (target !== 'scope') return undefined;
    return themeConfigToCssVars(config) as unknown as CSSProperties;
  }, [target, config]);

  return (
    <div
      role="region"
      aria-label={ariaLabel}
      data-section="theme-customizer"
      data-target={target}
      data-radius={config.radius}
      data-hue={config.hue}
      data-contrast={config.contrast}
      className={cn(
        'flex flex-col gap-4 rounded-lg border border-border bg-card p-4',
        className,
      )}
      style={scopeStyle}
    >
      <div
        data-section="theme-customizer-controls"
        className="flex flex-col gap-3"
      >
        <ControlRow
          label="Radius"
          unit="px"
          min={THEME_CONFIG_BOUNDS.radius.min}
          max={THEME_CONFIG_BOUNDS.radius.max}
          step={1}
          value={config.radius}
          onChange={handleRadius}
          dataKey="radius"
        />
        <ControlRow
          label="Hue"
          unit=""
          min={THEME_CONFIG_BOUNDS.hue.min}
          max={THEME_CONFIG_BOUNDS.hue.max}
          step={1}
          value={config.hue}
          onChange={handleHue}
          dataKey="hue"
        />
        <ControlRow
          label="Contrast"
          unit=""
          min={THEME_CONFIG_BOUNDS.contrast.min}
          max={THEME_CONFIG_BOUNDS.contrast.max}
          step={1}
          value={config.contrast}
          onChange={handleContrast}
          dataKey="contrast"
        />
      </div>

      <div
        data-section="theme-customizer-preview"
        className="flex flex-col gap-3 rounded-md border border-border p-3"
        style={{ borderRadius: 'var(--radius-md)' }}
      >
        <div
          data-section="theme-customizer-preview-swatch"
          className="flex items-center gap-2"
        >
          <span
            aria-hidden="true"
            data-section="theme-customizer-preview-brand"
            className="inline-block h-6 w-6"
            style={{
              background: 'hsl(var(--brand))',
              borderRadius: 'var(--radius-md)',
            }}
          />
          <span
            data-section="theme-customizer-preview-label"
            style={{ color: 'hsl(var(--text-primary))' }}
          >
            Brand
          </span>
          <span
            data-section="theme-customizer-preview-label-secondary"
            className="text-sm"
            style={{ color: 'hsl(var(--text-secondary))' }}
          >
            Secondary
          </span>
        </div>
        <button
          type="button"
          data-section="theme-customizer-preview-button"
          className="self-start px-3 py-1 text-sm font-medium"
          style={{
            background: 'hsl(var(--brand))',
            color: 'hsl(var(--text-on-brand, 0 0% 100%))',
            borderRadius: 'var(--radius-md)',
          }}
        >
          Sample
        </button>
      </div>

      <div
        data-section="theme-customizer-actions"
        className="flex gap-2"
      >
        <button
          type="button"
          onClick={handleExport}
          data-section="theme-customizer-export"
          data-copied={copied ? 'true' : 'false'}
          aria-label={`Copy ${exportFormat.toUpperCase()} to clipboard`}
          className="rounded border border-border bg-background px-3 py-1 text-sm hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          {copied ? 'Copied!' : `Copy ${exportFormat.toUpperCase()}`}
        </button>
        <button
          type="button"
          onClick={handleReset}
          data-section="theme-customizer-reset"
          aria-label="Reset to defaults"
          className="rounded border border-border bg-background px-3 py-1 text-sm hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          Reset
        </button>
      </div>
    </div>
  );
}

ThemeCustomizer.displayName = 'ThemeCustomizer';

interface ControlRowProps {
  label: string;
  unit: string;
  min: number;
  max: number;
  step: number;
  value: number;
  onChange: (next: number) => void;
  dataKey: string;
}

function ControlRow({
  label,
  unit,
  min,
  max,
  step,
  value,
  onChange,
  dataKey,
}: ControlRowProps): ReactElement {
  return (
    <label
      data-section="theme-customizer-control"
      data-control-key={dataKey}
      className="flex items-center gap-3"
    >
      <span className="w-20 shrink-0 text-sm font-medium">
        {label}
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        aria-label={label}
        data-control-input={dataKey}
        className="flex-1"
      />
      <span
        data-control-value={dataKey}
        className="w-12 shrink-0 text-right text-sm tabular-nums"
      >
        {value}
        {unit}
      </span>
    </label>
  );
}

// Re-exported for tests that want to stub localStorage by key
// without spelling the constant out everywhere.
export const THEME_CUSTOMIZER_DEFAULT_STORAGE_KEY =
  DEFAULT_STORAGE_KEY;
