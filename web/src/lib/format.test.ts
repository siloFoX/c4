import { describe, it, expect } from 'vitest';
import {
  formatNumber,
  formatBytes,
  formatDuration,
  formatRelativeTime,
  formatTimestamp,
  dateRange,
  dateRangeLabel,
} from './format';

describe('formatNumber', () => {
  it('returns "-" for null/undefined/NaN', () => {
    expect(formatNumber(null)).toBe('-');
    expect(formatNumber(undefined)).toBe('-');
    expect(formatNumber(NaN)).toBe('-');
  });
  it('uses default 0 fractional digits', () => {
    expect(formatNumber(1234)).toBe('1,234');
  });
  it('honors digits override', () => {
    expect(formatNumber(1.5, 2)).toBe('1.50');
  });
});

describe('formatBytes', () => {
  it('returns "-" for invalid input', () => {
    expect(formatBytes(null)).toBe('-');
    expect(formatBytes(-1)).toBe('-');
    expect(formatBytes(NaN)).toBe('-');
  });
  it('formats bytes under 1KB without decimals', () => {
    expect(formatBytes(0)).toBe('0 B');
    expect(formatBytes(1023)).toBe('1023 B');
  });
  it('promotes to KB/MB/GB and keeps one decimal under 100', () => {
    expect(formatBytes(1024)).toBe('1.0 KB');
    expect(formatBytes(1024 * 1024)).toBe('1.0 MB');
  });
  it('drops the fractional digit at >=100', () => {
    expect(formatBytes(150 * 1024)).toBe('150 KB');
  });
});

describe('formatDuration', () => {
  it('returns "-" for invalid input', () => {
    expect(formatDuration(null)).toBe('-');
    expect(formatDuration(-1)).toBe('-');
    expect(formatDuration(NaN)).toBe('-');
  });
  it('formats sub-minute as Ns', () => {
    expect(formatDuration(5_000)).toBe('5s');
  });
  it('formats sub-hour as MmSs', () => {
    expect(formatDuration(125_000)).toBe('2m 5s');
  });
  it('formats sub-day as HhMm', () => {
    expect(formatDuration(3_600_000 + 120_000)).toBe('1h 2m');
  });
  it('formats >=day as DdHh', () => {
    expect(formatDuration(86_400_000 * 2 + 3_600_000 * 3)).toBe('2d 3h');
  });
});

describe('formatRelativeTime', () => {
  it('returns "-" for invalid input', () => {
    expect(formatRelativeTime(null)).toBe('-');
    expect(formatRelativeTime('not-a-date')).toBe('-');
  });
  it('uses provided "now" anchor', () => {
    expect(formatRelativeTime(0, 60_000)).toBe('1m 0s ago');
  });
  it('clamps negative deltas (future timestamps) to "0s ago"', () => {
    expect(formatRelativeTime(2_000, 1_000)).toBe('0s ago');
  });
});

describe('formatTimestamp', () => {
  it('returns "-" for null/undefined/invalid', () => {
    expect(formatTimestamp(null)).toBe('-');
    expect(formatTimestamp(undefined)).toBe('-');
    expect(formatTimestamp('not-a-date')).toBe('-');
  });
  it('produces a non-empty string for a valid ms timestamp', () => {
    const out = formatTimestamp(0);
    expect(typeof out).toBe('string');
    expect(out).not.toBe('-');
    expect(out.length).toBeGreaterThan(0);
  });
});

describe('dateRange', () => {
  it('returns the same start and end for days=1', () => {
    const now = new Date('2026-05-11T12:00:00Z');
    const r = dateRange(1, now);
    expect(r.start).toBe(r.end);
    expect(r.end).toBe('2026-05-11');
  });
  it('rolls back days-1 calendar days for the start anchor', () => {
    const now = new Date('2026-05-11T12:00:00Z');
    const r = dateRange(7, now);
    expect(r.end).toBe('2026-05-11');
    expect(r.start).toBe('2026-05-05');
  });
  it('coerces non-positive days back to 1', () => {
    const now = new Date('2026-05-11T12:00:00Z');
    const r = dateRange(0, now);
    expect(r.start).toBe(r.end);
  });
});

describe('dateRangeLabel', () => {
  it('humanizes special values', () => {
    expect(dateRangeLabel(1)).toBe('Today');
    expect(dateRangeLabel(7)).toBe('Last 7 days');
    expect(dateRangeLabel(30)).toBe('Last 30 days');
    expect(dateRangeLabel(90)).toBe('Last 90 days');
  });
  it('falls back to a generic label for other values', () => {
    expect(dateRangeLabel(45)).toBe('Last 45 days');
  });
});
