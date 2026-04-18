// Lightweight substring-ranking filter used by feature pages that expose
// a text filter box (templates, profiles, validation). Plain JS with
// JSDoc types so tests can load it directly.

/**
 * @param {string} haystack
 * @param {string} needle
 * @returns {number}
 */
export function fuzzyScore(haystack, needle) {
  if (!needle) return 1;
  if (!haystack) return 0;
  const hay = String(haystack).toLowerCase();
  const need = String(needle).toLowerCase().trim();
  if (!need) return 1;
  const idx = hay.indexOf(need);
  if (idx === -1) return 0;
  if (idx === 0) return 2;
  return 1;
}

/**
 * @template T
 * @param {readonly T[]} items
 * @param {string} query
 * @param {(item: T) => string} key
 * @returns {T[]}
 */
export function fuzzyFilter(items, query, key) {
  const q = String(query || '').trim();
  if (!q) return [...items];
  const scored = [];
  for (const item of items) {
    const s = fuzzyScore(key(item), q);
    if (s > 0) scored.push({ item, score: s });
  }
  scored.sort((a, b) => b.score - a.score);
  return scored.map((s) => s.item);
}
