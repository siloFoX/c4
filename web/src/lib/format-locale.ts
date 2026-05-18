import { useMemo } from 'react';
import { getLocale, useLocale, type Locale } from './i18n';

// (v1.11.364, TODO 11.346) Locale-aware formatters.
//
// Thin wrappers around `Intl.NumberFormat` and
// `Intl.DateTimeFormat` that respect the c4 Settings
// locale. The c4 locale enum is `'en' | 'ko'`; this
// module maps it to BCP-47 tags (`en-US` / `ko-KR`)
// so Intl picks the right numbering / grouping /
// calendar.
//
// Two flavours:
//
//   - Direct functions (`formatNumberLocale`,
//     `formatIntegerLocale`, `formatDateLocale`,
//     etc.) accept an optional locale argument and
//     fall back to the current Settings locale.
//   - React hook `useLocalizedFormatters()` returns
//     a memoised bundle of formatter functions bound
//     to the current locale; the hook re-renders the
//     caller when Settings flips so all values
//     refresh in one paint.
//
// Both flavours share the same underlying memo cache
// so callers that mix-and-match (e.g. the
// `formatNumberLocale(value)` call in a non-component
// helper + the hook in the component) never construct
// a duplicate `Intl.NumberFormat` instance.

export type LocaleTag = 'en-US' | 'ko-KR';

const TAG_BY_LOCALE: Record<Locale, LocaleTag> = {
  en: 'en-US',
  ko: 'ko-KR',
};

export function localeTag(locale: Locale = getLocale()): LocaleTag {
  return TAG_BY_LOCALE[locale] ?? 'en-US';
}

// (v1.11.364) Memo cache for the Intl formatter
// instances. Constructing an `Intl.NumberFormat` is
// surprisingly expensive (parsing the options + the
// locale tag chain), so we cache by tag + serialised
// options. Cache keys live for the lifetime of the
// module -- there is no eviction because the cardinality
// is small (per-locale numeric+date options).
const NUMBER_CACHE = new Map<string, Intl.NumberFormat>();
const DATETIME_CACHE = new Map<string, Intl.DateTimeFormat>();

function numberFormatter(
  tag: LocaleTag,
  options: Intl.NumberFormatOptions = {},
): Intl.NumberFormat {
  const key = `${tag}|${JSON.stringify(options)}`;
  let nf = NUMBER_CACHE.get(key);
  if (!nf) {
    nf = new Intl.NumberFormat(tag, options);
    NUMBER_CACHE.set(key, nf);
  }
  return nf;
}

function dateTimeFormatter(
  tag: LocaleTag,
  options: Intl.DateTimeFormatOptions = {},
): Intl.DateTimeFormat {
  const key = `${tag}|${JSON.stringify(options)}`;
  let dtf = DATETIME_CACHE.get(key);
  if (!dtf) {
    dtf = new Intl.DateTimeFormat(tag, options);
    DATETIME_CACHE.set(key, dtf);
  }
  return dtf;
}

export function resetFormatLocaleCachesForTests(): void {
  NUMBER_CACHE.clear();
  DATETIME_CACHE.clear();
}

// ----- Number ----------------------------------------------------

export interface NumberFormatLocaleOptions {
  fractionDigits?: number;
  notation?: 'standard' | 'compact';
  signDisplay?: 'auto' | 'always' | 'never';
}

function buildNumberOptions(
  opts: NumberFormatLocaleOptions = {},
): Intl.NumberFormatOptions {
  const fractionDigits =
    typeof opts.fractionDigits === 'number' &&
    Number.isFinite(opts.fractionDigits) &&
    opts.fractionDigits >= 0
      ? opts.fractionDigits
      : 0;
  return {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
    ...(opts.notation !== undefined ? { notation: opts.notation } : {}),
    ...(opts.signDisplay !== undefined ? { signDisplay: opts.signDisplay } : {}),
  };
}

export function formatNumberLocale(
  value: number | null | undefined,
  locale?: Locale,
  options?: NumberFormatLocaleOptions,
): string {
  if (value == null || !Number.isFinite(value)) return '-';
  return numberFormatter(localeTag(locale), buildNumberOptions(options)).format(
    value,
  );
}

export function formatIntegerLocale(
  value: number | null | undefined,
  locale?: Locale,
): string {
  return formatNumberLocale(value, locale, { fractionDigits: 0 });
}

export function formatDecimalLocale(
  value: number | null | undefined,
  digits = 2,
  locale?: Locale,
): string {
  return formatNumberLocale(value, locale, { fractionDigits: digits });
}

export function formatCompactLocale(
  value: number | null | undefined,
  locale?: Locale,
): string {
  if (value == null || !Number.isFinite(value)) return '-';
  return numberFormatter(localeTag(locale), {
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(value);
}

export function formatPercentLocale(
  value: number | null | undefined,
  digits = 0,
  locale?: Locale,
): string {
  if (value == null || !Number.isFinite(value)) return '-';
  return numberFormatter(localeTag(locale), {
    style: 'percent',
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value);
}

export function formatCurrencyLocale(
  value: number | null | undefined,
  currency: string,
  locale?: Locale,
): string {
  if (value == null || !Number.isFinite(value)) return '-';
  return numberFormatter(localeTag(locale), {
    style: 'currency',
    currency,
  }).format(value);
}

// Bytes -> human readable. Picks a unit (B / KB / MB
// / GB / TB) by magnitude and runs the value through
// the locale number formatter so the decimal
// separator is correct.
export function formatBytesLocale(
  bytes: number | null | undefined,
  locale?: Locale,
): string {
  if (bytes == null || !Number.isFinite(bytes) || bytes < 0) return '-';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let i = 0;
  let n = bytes;
  while (n >= 1024 && i < units.length - 1) {
    n /= 1024;
    i++;
  }
  const digits = n >= 100 || i === 0 ? 0 : 1;
  return `${formatNumberLocale(n, locale, { fractionDigits: digits })} ${units[i]}`;
}

// ----- Date / time ----------------------------------------------

export type DatePreset =
  | 'short'         // 5/18/26 / 26. 05. 18.
  | 'medium'        // May 18, 2026 / 2026. 5. 18.
  | 'long'          // May 18, 2026 / 2026 5 18.
  | 'iso-date'      // 2026-05-18
  | 'date-time'     // May 18, 2026, 10:30 AM
  | 'time';         // 10:30 AM

function presetOptions(preset: DatePreset): Intl.DateTimeFormatOptions {
  switch (preset) {
    case 'short':
      return { dateStyle: 'short' };
    case 'medium':
      return { dateStyle: 'medium' };
    case 'long':
      return { dateStyle: 'long' };
    case 'iso-date':
      // ISO is locale-independent on purpose -- the
      // wrapper handles it without Intl.
      return {};
    case 'date-time':
      return { dateStyle: 'medium', timeStyle: 'short' };
    case 'time':
      return { timeStyle: 'short' };
  }
}

function coerceDate(input: Date | string | number | null | undefined): Date | null {
  if (input == null) return null;
  if (input instanceof Date) {
    return Number.isNaN(input.getTime()) ? null : input;
  }
  const d = new Date(input);
  return Number.isNaN(d.getTime()) ? null : d;
}

function isoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function formatDateLocale(
  input: Date | string | number | null | undefined,
  preset: DatePreset = 'medium',
  locale?: Locale,
): string {
  const d = coerceDate(input);
  if (!d) return '-';
  if (preset === 'iso-date') return isoDate(d);
  return dateTimeFormatter(localeTag(locale), presetOptions(preset)).format(d);
}

export function formatDateTimeLocale(
  input: Date | string | number | null | undefined,
  locale?: Locale,
): string {
  return formatDateLocale(input, 'date-time', locale);
}

export function formatTimeLocale(
  input: Date | string | number | null | undefined,
  locale?: Locale,
): string {
  return formatDateLocale(input, 'time', locale);
}

export function formatDateRangeLocale(
  start: Date | string | number | null | undefined,
  end: Date | string | number | null | undefined,
  preset: DatePreset = 'medium',
  locale?: Locale,
): string {
  const a = coerceDate(start);
  const b = coerceDate(end);
  if (!a || !b) return '-';
  if (preset === 'iso-date') {
    return `${isoDate(a)} - ${isoDate(b)}`;
  }
  const fmt = dateTimeFormatter(localeTag(locale), presetOptions(preset));
  // `formatRange` is in Node 18+ / modern browsers;
  // fall back to "a - b" if absent so unit tests under
  // older environments still pass.
  const maybe = (fmt as unknown as {
    formatRange?: (a: Date, b: Date) => string;
  }).formatRange;
  if (typeof maybe === 'function') {
    return maybe.call(fmt, a, b);
  }
  return `${fmt.format(a)} - ${fmt.format(b)}`;
}

// ----- React hook ----------------------------------------------

export interface LocalizedFormatters {
  locale: Locale;
  tag: LocaleTag;
  number: (
    value: number | null | undefined,
    options?: NumberFormatLocaleOptions,
  ) => string;
  integer: (value: number | null | undefined) => string;
  decimal: (value: number | null | undefined, digits?: number) => string;
  compact: (value: number | null | undefined) => string;
  percent: (
    value: number | null | undefined,
    digits?: number,
  ) => string;
  currency: (value: number | null | undefined, code: string) => string;
  bytes: (bytes: number | null | undefined) => string;
  date: (
    input: Date | string | number | null | undefined,
    preset?: DatePreset,
  ) => string;
  dateTime: (input: Date | string | number | null | undefined) => string;
  time: (input: Date | string | number | null | undefined) => string;
  dateRange: (
    start: Date | string | number | null | undefined,
    end: Date | string | number | null | undefined,
    preset?: DatePreset,
  ) => string;
}

export function useLocalizedFormatters(): LocalizedFormatters {
  const locale = useLocale();
  return useMemo<LocalizedFormatters>(
    () => ({
      locale,
      tag: localeTag(locale),
      number: (value, options) => formatNumberLocale(value, locale, options),
      integer: (value) => formatIntegerLocale(value, locale),
      decimal: (value, digits = 2) => formatDecimalLocale(value, digits, locale),
      compact: (value) => formatCompactLocale(value, locale),
      percent: (value, digits = 0) => formatPercentLocale(value, digits, locale),
      currency: (value, code) => formatCurrencyLocale(value, code, locale),
      bytes: (bytes) => formatBytesLocale(bytes, locale),
      date: (input, preset = 'medium') => formatDateLocale(input, preset, locale),
      dateTime: (input) => formatDateTimeLocale(input, locale),
      time: (input) => formatTimeLocale(input, locale),
      dateRange: (start, end, preset = 'medium') =>
        formatDateRangeLocale(start, end, preset, locale),
    }),
    [locale],
  );
}
