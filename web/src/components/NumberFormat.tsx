// (v1.11.234, 11.216) NumberFormat -- thin wrapper around
// Intl.NumberFormat that memoizes formatter instances per
// (locale, style, currency, digits, notation) tuple. Renders an
// inline <span> with the formatted string. The exported
// formatNumber() helper covers non-component callsites
// (string-template values, tFormat() args, etc).

import type { JSX } from 'react';
import { useLocale } from '../lib/i18n';

export type NumberStyle = 'decimal' | 'currency' | 'percent';

export interface NumberFormatOptions {
  style?: NumberStyle;
  currency?: string;
  minimumFractionDigits?: number;
  maximumFractionDigits?: number;
  locale?: string;
  compact?: boolean;
}

export interface NumberFormatProps extends NumberFormatOptions {
  value: number;
  className?: string;
}

const EM_DASH = '—';

// Map app locale tokens onto BCP47 tags. Intl accepts the bare
// tokens too, but the regional variants give better defaults
// (currency placement, digit grouping).
function resolveLocale(input: string | undefined): string {
  if (input) return input;
  // useLocale() returns 'en' | 'ko' in this app. Default 'en-US'
  // also covers SSR / non-React callsites that bypass the hook.
  return 'en-US';
}

function localeTag(token: string): string {
  if (token === 'en') return 'en-US';
  if (token === 'ko') return 'ko-KR';
  return token;
}

const cache = new Map<string, Intl.NumberFormat>();

function getFormatter(locale: string, opts: NumberFormatOptions): Intl.NumberFormat {
  const key = [
    locale,
    opts.style ?? 'decimal',
    opts.currency ?? '',
    opts.minimumFractionDigits ?? '',
    opts.maximumFractionDigits ?? '',
    opts.compact ? 'c' : '',
  ].join('|');
  let fmt = cache.get(key);
  if (fmt) return fmt;
  const init: Intl.NumberFormatOptions = {};
  if (opts.style) init.style = opts.style;
  if (opts.style === 'currency') init.currency = opts.currency ?? 'USD';
  if (opts.minimumFractionDigits !== undefined) {
    init.minimumFractionDigits = opts.minimumFractionDigits;
  }
  if (opts.maximumFractionDigits !== undefined) {
    init.maximumFractionDigits = opts.maximumFractionDigits;
  }
  if (opts.compact) init.notation = 'compact';
  fmt = new Intl.NumberFormat(locale, init);
  cache.set(key, fmt);
  return fmt;
}

export function formatNumber(value: number, opts: NumberFormatOptions = {}): string {
  if (!Number.isFinite(value)) return EM_DASH;
  const locale = resolveLocale(opts.locale);
  return getFormatter(locale, opts).format(value);
}

export function NumberFormat({
  value,
  style,
  currency,
  minimumFractionDigits,
  maximumFractionDigits,
  locale,
  compact,
  className,
}: NumberFormatProps): JSX.Element {
  const appLocale = useLocale();
  const resolved = locale ?? localeTag(appLocale);
  const text = formatNumber(value, {
    style,
    currency,
    minimumFractionDigits,
    maximumFractionDigits,
    locale: resolved,
    compact,
  });
  return <span className={className}>{text}</span>;
}

export default NumberFormat;
