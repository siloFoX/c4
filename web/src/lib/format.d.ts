export function formatNumber(n: number | null | undefined, digits?: number): string;
export function formatBytes(bytes: number | null | undefined): string;
export function formatDuration(ms: number | null | undefined): string;
export function formatTimestamp(input: number | string | null | undefined): string;
export function formatRelativeTime(
  input: number | string | null | undefined,
  now?: number,
): string;
export function dateRange(days: number, now?: Date): { start: string; end: string };
export function dateRangeLabel(days: number): string;
