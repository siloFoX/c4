// (v1.10.744) Generic CustomEvent dispatcher. Used by
// the help / shortcuts open helpers + AppHeader's
// locale-toggle trigger to avoid re-implementing the
// SSR guard + try/catch every call site.
//
// SSR-safe (`typeof window === 'undefined'` short-
// circuit) and silently swallows any synthetic-event
// throw — most browsers don't, but the JSDOM-based
// test env historically has, so the catch stays.

export function dispatchEvent(name: string): void {
  if (typeof window === 'undefined') return;
  try {
    window.dispatchEvent(new CustomEvent(name));
  } catch {
    // non-browser test env or restricted CSP
  }
}
