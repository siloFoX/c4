import { useEffect, useState } from 'react';
import enBundle from '../i18n/en.json';
import koBundle from '../i18n/ko.json';

// Minimal i18n layer. Two locales, flat string map, fallback to English.
// Lookup is a pure function over the merged bundles, so tests and
// source-greps do not need to reason about intermediate state.

export type Locale = 'en' | 'ko';

export const LOCALES: readonly Locale[] = ['en', 'ko'] as const;

const BUNDLES: Record<Locale, Record<string, string>> = {
  en: enBundle as Record<string, string>,
  ko: koBundle as Record<string, string>,
};

export const LOCALE_KEY = 'c4.locale';
export const DEFAULT_LOCALE: Locale = 'en';

const EVENT_NAME = 'c4:locale-changed';

export function detectLocale(): Locale {
  if (typeof window === 'undefined') return DEFAULT_LOCALE;
  try {
    const saved = window.localStorage.getItem(LOCALE_KEY);
    if (saved === 'en' || saved === 'ko') return saved;
  } catch {
    // private mode
  }
  const nav =
    (typeof navigator !== 'undefined' && navigator.language) || DEFAULT_LOCALE;
  return nav.toLowerCase().startsWith('ko') ? 'ko' : 'en';
}

let current: Locale = detectLocale();

export function getLocale(): Locale {
  return current;
}

export function setLocale(locale: Locale): void {
  if (locale !== 'en' && locale !== 'ko') return;
  current = locale;
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(LOCALE_KEY, locale);
  } catch {
    // ignore
  }
  try {
    window.dispatchEvent(new CustomEvent(EVENT_NAME, { detail: locale }));
  } catch {
    // non-browser test env
  }
}

export function onLocaleChange(cb: (locale: Locale) => void): () => void {
  if (typeof window === 'undefined') return () => {};
  const handler = (e: Event) => {
    const detail = (e as CustomEvent<Locale>).detail;
    if (detail === 'en' || detail === 'ko') cb(detail);
  };
  window.addEventListener(EVENT_NAME, handler as EventListener);
  return () =>
    window.removeEventListener(EVENT_NAME, handler as EventListener);
}

// Lookup with English fallback so a missing ko key never shows a raw id.
export function t(key: string, locale: Locale = current): string {
  const bundle = BUNDLES[locale] || BUNDLES[DEFAULT_LOCALE];
  if (key in bundle) return bundle[key];
  const fb = BUNDLES[DEFAULT_LOCALE];
  if (key in fb) return fb[key];
  return key;
}

// Split a pipe-delimited i18n value into an array. Use for short bullet
// lists where a translator only needs to update one key.
export function tList(key: string, locale: Locale = current): string[] {
  const value = t(key, locale);
  if (!value || value === key) return [];
  return value
    .split('|')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

// React hook: re-renders callers when the locale flips so translated
// copy in mounted components updates without a page reload.
export function useLocale(): Locale {
  const [locale, setLocaleState] = useState<Locale>(getLocale);
  useEffect(() => onLocaleChange(setLocaleState), []);
  return locale;
}

