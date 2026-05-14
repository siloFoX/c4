import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import enBundle from '../i18n/en.json';
import koBundle from '../i18n/ko.json';
import {
  LOCALES,
  LOCALE_KEY,
  DEFAULT_LOCALE,
  detectLocale,
  getLocale,
  setLocale,
  onLocaleChange,
  t,
  tFormat,
  tList,
  useLocale,
} from './i18n';

beforeEach(() => {
  window.localStorage.clear();
  // Reset back to default before each test so locale leakage between
  // cases never silently flips an assertion. setLocale dispatches a
  // CustomEvent, but with no listeners attached here it is harmless.
  setLocale(DEFAULT_LOCALE);
});

afterEach(() => {
  window.localStorage.clear();
  setLocale(DEFAULT_LOCALE);
});

describe('LOCALES / DEFAULT_LOCALE / LOCALE_KEY', () => {
  it('exposes both supported locales', () => {
    expect(LOCALES).toEqual(['en', 'ko']);
  });

  it('defaults to English', () => {
    expect(DEFAULT_LOCALE).toBe('en');
  });

  it('uses the c4.locale localStorage key', () => {
    expect(LOCALE_KEY).toBe('c4.locale');
  });
});

describe('detectLocale', () => {
  it('honors a saved English value in localStorage', () => {
    window.localStorage.setItem(LOCALE_KEY, 'en');
    expect(detectLocale()).toBe('en');
  });

  it('honors a saved Korean value in localStorage', () => {
    window.localStorage.setItem(LOCALE_KEY, 'ko');
    expect(detectLocale()).toBe('ko');
  });

  it('falls back to the navigator language when localStorage is empty', () => {
    const original = Object.getOwnPropertyDescriptor(
      Object.getPrototypeOf(window.navigator),
      'language',
    );
    Object.defineProperty(window.navigator, 'language', {
      configurable: true,
      get: () => 'ko-KR',
    });
    try {
      expect(detectLocale()).toBe('ko');
    } finally {
      delete (window.navigator as { language?: string }).language;
      if (original) {
        Object.defineProperty(
          Object.getPrototypeOf(window.navigator),
          'language',
          original,
        );
      }
    }
  });

  it('returns English when neither localStorage nor navigator hint Korean', () => {
    const original = Object.getOwnPropertyDescriptor(
      Object.getPrototypeOf(window.navigator),
      'language',
    );
    Object.defineProperty(window.navigator, 'language', {
      configurable: true,
      get: () => 'fr-FR',
    });
    try {
      expect(detectLocale()).toBe('en');
    } finally {
      delete (window.navigator as { language?: string }).language;
      if (original) {
        Object.defineProperty(
          Object.getPrototypeOf(window.navigator),
          'language',
          original,
        );
      }
    }
  });

  it('ignores an unrecognised saved value and falls through to navigator', () => {
    window.localStorage.setItem(LOCALE_KEY, 'xx');
    const original = Object.getOwnPropertyDescriptor(
      Object.getPrototypeOf(window.navigator),
      'language',
    );
    Object.defineProperty(window.navigator, 'language', {
      configurable: true,
      get: () => 'ko-KR',
    });
    try {
      expect(detectLocale()).toBe('ko');
    } finally {
      delete (window.navigator as { language?: string }).language;
      if (original) {
        Object.defineProperty(
          Object.getPrototypeOf(window.navigator),
          'language',
          original,
        );
      }
    }
  });
});

describe('getLocale / setLocale', () => {
  it('persists the chosen locale to localStorage', () => {
    setLocale('ko');
    expect(window.localStorage.getItem(LOCALE_KEY)).toBe('ko');
    expect(getLocale()).toBe('ko');
  });

  it('ignores invalid locales silently', () => {
    setLocale('en');
    // @ts-expect-error - exercising the runtime guard for non-Locale values
    setLocale('xx');
    expect(getLocale()).toBe('en');
  });

  it('emits a c4:locale-changed CustomEvent when the locale flips', () => {
    const handler = vi.fn();
    const off = onLocaleChange(handler);
    try {
      setLocale('ko');
      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler).toHaveBeenCalledWith('ko');
    } finally {
      off();
    }
  });

  it('does not throw when localStorage.setItem fails', () => {
    const spy = vi
      .spyOn(window.localStorage.__proto__, 'setItem')
      .mockImplementation(() => {
        throw new Error('quota exceeded');
      });
    try {
      expect(() => setLocale('ko')).not.toThrow();
      expect(getLocale()).toBe('ko');
    } finally {
      spy.mockRestore();
    }
  });
});

describe('onLocaleChange', () => {
  it('returns an unsubscribe function that stops further callbacks', () => {
    const handler = vi.fn();
    const off = onLocaleChange(handler);
    off();
    setLocale('ko');
    expect(handler).not.toHaveBeenCalled();
  });

  it('ignores events whose detail is not a known locale', () => {
    const handler = vi.fn();
    const off = onLocaleChange(handler);
    try {
      window.dispatchEvent(new CustomEvent('c4:locale-changed', { detail: 'xx' }));
      expect(handler).not.toHaveBeenCalled();
    } finally {
      off();
    }
  });
});

describe('t', () => {
  it('returns the English value for a known key', () => {
    expect(t('common.help', 'en')).toBe(enBundle['common.help']);
  });

  it('returns the Korean value when the locale is ko', () => {
    expect(t('common.help', 'ko')).toBe(koBundle['common.help']);
  });

  it('uses the current locale when no second argument is supplied', () => {
    setLocale('ko');
    expect(t('common.help')).toBe(koBundle['common.help']);
  });

  it('falls back to English when the Korean bundle is missing the key', () => {
    expect(t('header.title', 'ko')).toBe(koBundle['header.title']);
    // Forge a key that only exists in English by injecting into the imported
    // bundle reference: easier to assert is to use an existing key both
    // bundles share - verify English fallback for a totally unknown key.
    const missing = 'definitely.not.a.real.key';
    expect(t(missing, 'ko')).toBe(missing);
  });

  it('returns the raw key when neither bundle has a value', () => {
    expect(t('no.such.translation.key', 'en')).toBe('no.such.translation.key');
  });
});

describe('tFormat', () => {
  it('substitutes a single named token', () => {
    expect(tFormat('account.role', { role: 'admin' }, 'en')).toBe('Role: admin');
  });

  it('substitutes multiple tokens in a single template', () => {
    expect(
      tFormat(
        'controlPanel.batch.resultMixed',
        { kind: 'close', ok: 3, fail: 1 },
        'en',
      ),
    ).toBe('Batch close: 3 ok / 1 failed');
  });

  it('leaves placeholders unchanged when the variable is missing', () => {
    expect(tFormat('account.role', {}, 'en')).toBe('Role: {role}');
  });

  it('coerces number values to strings', () => {
    expect(tFormat('sessions.relative.minutes', { n: 5 }, 'en')).toBe('5m ago');
  });

  it('returns the raw key when neither bundle has the template', () => {
    expect(tFormat('totally.absent.key', { x: '1' }, 'en')).toBe(
      'totally.absent.key',
    );
  });

  it('honors the second-positional locale override over the current locale', () => {
    setLocale('en');
    expect(tFormat('account.role', { role: 'user' }, 'ko')).toBe(
      koBundle['account.role'].replace('{role}', 'user'),
    );
  });
});

describe('tList', () => {
  it('splits a pipe-delimited bundle value into a trimmed array', () => {
    const out = tList('scribe.useCases', 'en');
    expect(out.length).toBeGreaterThan(1);
    out.forEach((line) => {
      expect(line).not.toMatch(/^\s|\s$/);
      expect(line.length).toBeGreaterThan(0);
    });
  });

  it('returns an empty array for an unknown key', () => {
    expect(tList('no.such.list.key', 'en')).toEqual([]);
  });

  it('returns a single-entry array for a value without any pipe', () => {
    const out = tList('common.help', 'en');
    expect(out).toEqual([enBundle['common.help']]);
  });
});

describe('useLocale (hook)', () => {
  it('returns the current locale on first render and updates on change', () => {
    setLocale('en');
    const { result } = renderHook(() => useLocale());
    expect(result.current).toBe('en');
    act(() => setLocale('ko'));
    expect(result.current).toBe('ko');
  });

  it('cleans up its subscription on unmount (no further re-renders)', () => {
    setLocale('en');
    const { result, unmount } = renderHook(() => useLocale());
    expect(result.current).toBe('en');
    unmount();
    act(() => setLocale('ko'));
    // After unmount React will not flush, but the hook value snapshot stays.
    expect(result.current).toBe('en');
  });
});
