// Shared formatting helpers used across feature pages. Kept in plain
// JavaScript (with JSDoc types) so tests/run-all.js can load it via
// dynamic import without a TypeScript transpile step.

/**
 * @param {number | null | undefined} n
 * @param {number} [digits]
 * @returns {string}
 */
export function formatNumber(n, digits = 0) {
  if (n == null || Number.isNaN(n)) return '-';
  return n.toLocaleString(undefined, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

/**
 * @param {number | null | undefined} bytes
 * @returns {string}
 */
export function formatBytes(bytes) {
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

/**
 * @param {number | null | undefined} ms
 * @returns {string}
 */
export function formatDuration(ms) {
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

/**
 * @param {number | string | null | undefined} input
 * @returns {string}
 */
export function formatTimestamp(input) {
  if (input == null) return '-';
  const d = typeof input === 'string' ? new Date(input) : new Date(input);
  if (Number.isNaN(d.getTime())) return '-';
  return d.toLocaleString();
}

/**
 * @param {number | string | null | undefined} input
 * @param {number} [now]
 * @returns {string}
 */
export function formatRelativeTime(input, now = Date.now()) {
  if (input == null) return '-';
  const ts = typeof input === 'string' ? Date.parse(input) : Number(input);
  if (!Number.isFinite(ts)) return '-';
  const delta = Math.max(0, now - ts);
  return formatDuration(delta) + ' ago';
}

/**
 * @param {number} days
 * @param {Date} [now]
 * @returns {{ start: string; end: string }}
 */
export function dateRange(days, now = new Date()) {
  let d = days;
  if (!Number.isFinite(d) || d < 1) d = 1;
  const end = new Date(now);
  const start = new Date(now);
  start.setDate(start.getDate() - (d - 1));
  const fmt = (x) => x.toISOString().slice(0, 10);
  return { start: fmt(start), end: fmt(end) };
}

/**
 * @param {number} days
 * @returns {string}
 */
export function dateRangeLabel(days) {
  if (days === 1) return 'Today';
  if (days === 7) return 'Last 7 days';
  if (days === 30) return 'Last 30 days';
  if (days === 90) return 'Last 90 days';
  return `Last ${days} days`;
}
