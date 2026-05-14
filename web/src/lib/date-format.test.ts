import { describe, it, expect } from 'vitest';
import {
  toISODate,
  parseISODate,
  isSameDay,
  addDays,
  addMonths,
  addYears,
  startOfMonth,
  endOfMonth,
} from './date-format';

describe('date-format', () => {
  it('toISODate formats Y-M-D with zero padding', () => {
    expect(toISODate(new Date(2026, 0, 5))).toBe('2026-01-05');
    expect(toISODate(new Date(2026, 11, 31))).toBe('2026-12-31');
  });

  it('toISODate returns empty for null/invalid', () => {
    expect(toISODate(null)).toBe('');
    expect(toISODate(new Date('not-a-date'))).toBe('');
  });

  it('parseISODate parses YYYY-MM-DD', () => {
    const d = parseISODate('2026-05-14');
    expect(d).not.toBeNull();
    expect(d!.getFullYear()).toBe(2026);
    expect(d!.getMonth()).toBe(4);
    expect(d!.getDate()).toBe(14);
  });

  it('parseISODate rejects malformed', () => {
    expect(parseISODate('')).toBeNull();
    expect(parseISODate('2026/05/14')).toBeNull();
    expect(parseISODate('2026-13-01')).toBeNull();
    expect(parseISODate('2026-02-30')).toBeNull();
  });

  it('isSameDay compares ymd only', () => {
    const a = new Date(2026, 4, 14, 10);
    const b = new Date(2026, 4, 14, 23);
    expect(isSameDay(a, b)).toBe(true);
    expect(isSameDay(a, new Date(2026, 4, 15))).toBe(false);
    expect(isSameDay(null, b)).toBe(false);
  });

  it('addDays / addMonths / addYears', () => {
    expect(toISODate(addDays(new Date(2026, 4, 14), 7))).toBe('2026-05-21');
    expect(toISODate(addMonths(new Date(2026, 4, 14), 1))).toBe('2026-06-14');
    expect(toISODate(addYears(new Date(2026, 4, 14), -1))).toBe('2025-05-14');
  });

  it('startOfMonth / endOfMonth', () => {
    const d = new Date(2026, 4, 14);
    expect(toISODate(startOfMonth(d))).toBe('2026-05-01');
    expect(toISODate(endOfMonth(d))).toBe('2026-05-31');
  });
});
