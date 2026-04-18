export interface FuzzyScored<T> {
  item: T;
  score: number;
}

export function fuzzyScore(haystack: string, needle: string): number;
export function fuzzyFilter<T>(
  items: readonly T[],
  query: string,
  key: (item: T) => string,
): T[];
