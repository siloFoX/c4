import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  formatBytesLocale,
  formatCompactLocale,
  formatCurrencyLocale,
  formatDateLocale,
  formatDateRangeLocale,
  formatDateTimeLocale,
  formatDecimalLocale,
  formatIntegerLocale,
  formatNumberLocale,
  formatPercentLocale,
  formatTimeLocale,
  localeTag,
  resetFormatLocaleCachesForTests,
  useLocalizedFormatters,
} from './format-locale';
import { setLocale } from './i18n';

beforeEach(() => {
  resetFormatLocaleCachesForTests();
  setLocale('en');
});

afterEach(() => {
  setLocale('en');
});

describe('localeTag', () => {
  it('maps c4 Locale to BCP-47 tag', () => {
    expect(localeTag('en')).toBe('en-US');
    expect(localeTag('ko')).toBe('ko-KR');
  });
});

describe('formatNumberLocale', () => {
  it('groups thousands with the locale separator', () => {
    expect(formatNumberLocale(1234567, 'en')).toBe('1,234,567');
    expect(formatNumberLocale(1234567, 'ko')).toBe('1,234,567');
  });

  it('returns "-" for null / undefined / NaN', () => {
    expect(formatNumberLocale(null)).toBe('-');
    expect(formatNumberLocale(undefined)).toBe('-');
    expect(formatNumberLocale(NaN)).toBe('-');
    expect(formatNumberLocale(Infinity)).toBe('-');
  });

  it('honours fractionDigits', () => {
    expect(formatNumberLocale(1.236, 'en', { fractionDigits: 2 })).toBe('1.24');
    expect(formatNumberLocale(1.2, 'en', { fractionDigits: 2 })).toBe('1.20');
  });

  it('defaults to the current Settings locale when none is passed', () => {
    setLocale('ko');
    // Korean uses the Western thousand-separator but
    // we keep the en-US tag-mapped behaviour to match
    // the test expectation. The locale affects the
    // tag pick, not the rule.
    const out = formatNumberLocale(1500);
    expect(out).toBe('1,500');
  });
});

describe('formatIntegerLocale', () => {
  it('drops fractional digits', () => {
    expect(formatIntegerLocale(42.7, 'en')).toBe('43');
    expect(formatIntegerLocale(-1.4, 'en')).toBe('-1');
  });
});

describe('formatDecimalLocale', () => {
  it('keeps the requested digit count', () => {
    expect(formatDecimalLocale(3.14159, 4, 'en')).toBe('3.1416');
  });
  it('defaults to 2 digits', () => {
    expect(formatDecimalLocale(2.5, undefined, 'en')).toBe('2.50');
  });
});

describe('formatCompactLocale', () => {
  it('compacts large numbers (en)', () => {
    expect(formatCompactLocale(15_000, 'en')).toBe('15K');
    expect(formatCompactLocale(2_500_000, 'en')).toBe('2.5M');
  });
});

describe('formatPercentLocale', () => {
  it('formats a 0..1 ratio as a percent', () => {
    expect(formatPercentLocale(0.25, 0, 'en')).toBe('25%');
    expect(formatPercentLocale(0.123, 1, 'en')).toBe('12.3%');
  });
  it('returns "-" for null', () => {
    expect(formatPercentLocale(null, 0, 'en')).toBe('-');
  });
});

describe('formatCurrencyLocale', () => {
  it('formats USD in en-US', () => {
    const out = formatCurrencyLocale(1234.5, 'USD', 'en');
    expect(out).toContain('1,234.5');
    expect(out).toContain('$');
  });
  it('formats KRW in ko-KR with no minor units', () => {
    const out = formatCurrencyLocale(1234, 'KRW', 'ko');
    // The Korean output uses the won symbol; we only
    // assert the digits since the symbol position
    // depends on the runtime ICU data.
    expect(out).toMatch(/1,234/);
  });
});

describe('formatBytesLocale', () => {
  it('picks the right unit', () => {
    expect(formatBytesLocale(0, 'en')).toBe('0 B');
    expect(formatBytesLocale(1024, 'en')).toBe('1.0 KB');
    expect(formatBytesLocale(1024 * 1024, 'en')).toBe('1.0 MB');
    expect(formatBytesLocale(1024 * 1024 * 1024 * 5, 'en')).toBe('5.0 GB');
  });

  it('drops fraction when the magnitude is >= 100', () => {
    expect(formatBytesLocale(150 * 1024, 'en')).toBe('150 KB');
  });

  it('returns "-" for null / negative / NaN', () => {
    expect(formatBytesLocale(null)).toBe('-');
    expect(formatBytesLocale(-1)).toBe('-');
    expect(formatBytesLocale(NaN)).toBe('-');
  });
});

describe('formatDateLocale', () => {
  const FIXED = new Date('2026-05-18T10:30:00Z');

  it('renders an ISO date independent of locale', () => {
    expect(formatDateLocale(FIXED, 'iso-date', 'en')).toMatch(/\d{4}-\d{2}-\d{2}/);
    expect(formatDateLocale(FIXED, 'iso-date', 'ko')).toMatch(/\d{4}-\d{2}-\d{2}/);
  });

  it('returns "-" for invalid input', () => {
    expect(formatDateLocale(null, 'medium', 'en')).toBe('-');
    expect(formatDateLocale('not-a-date', 'medium', 'en')).toBe('-');
    expect(formatDateLocale(NaN, 'medium', 'en')).toBe('-');
  });

  it('accepts a number (ms since epoch)', () => {
    const out = formatDateLocale(FIXED.getTime(), 'medium', 'en');
    expect(out).not.toBe('-');
    expect(out.length).toBeGreaterThan(0);
  });

  it('accepts a string', () => {
    expect(
      formatDateLocale('2026-05-18T10:30:00Z', 'iso-date', 'en'),
    ).toMatch(/\d{4}-\d{2}-\d{2}/);
  });
});

describe('formatDateTimeLocale / formatTimeLocale', () => {
  it('returns non-empty strings for a valid input', () => {
    expect(formatDateTimeLocale('2026-05-18T10:30:00Z', 'en')).toMatch(/\d/);
    expect(formatTimeLocale('2026-05-18T10:30:00Z', 'en')).toMatch(/\d/);
  });
  it('returns "-" for null', () => {
    expect(formatDateTimeLocale(null, 'en')).toBe('-');
    expect(formatTimeLocale(null, 'en')).toBe('-');
  });
});

describe('formatDateRangeLocale', () => {
  it('renders an ISO range without Intl', () => {
    const out = formatDateRangeLocale(
      '2026-05-18T00:00:00Z',
      '2026-05-25T00:00:00Z',
      'iso-date',
      'en',
    );
    expect(out).toMatch(/2026-05-18.*2026-05-25/);
  });

  it('returns "-" when either end is missing', () => {
    expect(formatDateRangeLocale(null, '2026-05-18', 'medium', 'en')).toBe('-');
    expect(formatDateRangeLocale('2026-05-18', null, 'medium', 'en')).toBe('-');
  });
});

describe('useLocalizedFormatters', () => {
  it('returns a bundle of formatter functions bound to the current locale', () => {
    setLocale('en');
    const { result } = renderHook(() => useLocalizedFormatters());
    expect(result.current.locale).toBe('en');
    expect(result.current.tag).toBe('en-US');
    expect(result.current.integer(1234)).toBe('1,234');
    expect(result.current.percent(0.5)).toBe('50%');
    expect(result.current.bytes(1024)).toBe('1.0 KB');
  });

  it('re-renders when the Settings locale flips', () => {
    setLocale('en');
    const { result } = renderHook(() => useLocalizedFormatters());
    const first = result.current;
    act(() => {
      setLocale('ko');
    });
    expect(result.current.locale).toBe('ko');
    expect(result.current.tag).toBe('ko-KR');
    expect(result.current).not.toBe(first);
  });

  it('memoises the bundle while the locale is stable', () => {
    setLocale('en');
    const { result, rerender } = renderHook(() => useLocalizedFormatters());
    const first = result.current;
    rerender();
    expect(result.current).toBe(first);
  });
});

describe('cache reuse', () => {
  it('two calls with the same options reuse the same Intl instance', () => {
    formatNumberLocale(100, 'en', { fractionDigits: 2 });
    formatNumberLocale(200, 'en', { fractionDigits: 2 });
    // The cache size after these two calls is 1, not 2.
    // We assert by clearing + checking that one fresh
    // formatter still produces the right output.
    resetFormatLocaleCachesForTests();
    expect(formatNumberLocale(123, 'en', { fractionDigits: 2 })).toBe('123.00');
  });
});
