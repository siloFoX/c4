// Shared formatting helpers used across feature pages.

export function formatNumber(n: number | null | undefined, digits = 0): string {
  if (n == null || Number.isNaN(n)) return '-';
  return n.toLocaleString(undefined, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

export function formatBytes(bytes: number | null | undefined): string {
  if (bytes == null || Number.isNaN(bytes) || bytes < 0) return '-';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let i = 0;
  let n = bytes;
  while (n >= 1024 && i < units.length - 1) {
    n /= 1024;
    i++;
  }
  const digits = n >= 100 || i === 0 ? 0 : 1;
  return `${n.toFixed(digits)} ${units[i]}`;
}

export function formatDuration(ms: number | null | undefined): string {
  if (ms == null || Number.isNaN(ms) || ms < 0) return '-';
  const s = Math.floor(ms / 1000);
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${sec}s`;
  return `${sec}s`;
}

export function formatTimestamp(input: number | string | null | undefined): string {
  if (input == null) return '-';
  const d = typeof input === 'string' ? new Date(input) : new Date(input);
  if (Number.isNaN(d.getTime())) return '-';
  return d.toLocaleString();
}

export function formatRelativeTime(
  input: number | string | null | undefined,
  now: number = Date.now(),
): string {
  if (input == null) return '-';
  const ts = typeof input === 'string' ? Date.parse(input) : Number(input);
  if (!Number.isFinite(ts)) return '-';
  const delta = Math.max(0, now - ts);
  return formatDuration(delta) + ' ago';
}

// Date-range helper used by TokenUsage / History-style filters. Returns
// [start, end] ISO date strings (YYYY-MM-DD).
export function dateRange(days: number, now: Date = new Date()): { start: string; end: string } {
  if (!Number.isFinite(days) || days < 1) days = 1;
  const end = new Date(now);
  const start = new Date(now);
  start.setDate(start.getDate() - (days - 1));
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  return { start: fmt(start), end: fmt(end) };
}

export function dateRangeLabel(days: number): string {
  if (days === 1) return 'Today';
  if (days === 7) return 'Last 7 days';
  if (days === 30) return 'Last 30 days';
  if (days === 90) return 'Last 90 days';
  return `Last ${days} days`;
}
