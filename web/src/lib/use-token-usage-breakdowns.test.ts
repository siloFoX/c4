import { describe, it, expect } from 'vitest';
import { renderHook } from '@testing-library/react';
import {
  coerceTotal,
  useTokenUsageBreakdowns,
} from './use-token-usage-breakdowns';
import type { TokenUsagePayload } from './use-token-usage';

// useTokenUsageBreakdowns is a pure memoizing reducer over the
// TokenUsagePayload. Contract:
//   - data === null => perWorker=[], perDay=[], maxes=0
//   - perWorker: Object.entries(data.perWorker), coerceTotal each value,
//                sort desc by total
//   - perDay: Object.entries(data.perDay), filter [rangeStart, rangeEnd]
//             inclusive, Number-coerce each total, sort asc by date
//   - workerMax/dayMax: max(0, total) over their respective entries so
//     an empty list yields 0 (not -Infinity)
//   - coerceTotal: number passthrough; object with .total wins; object
//     without .total sums input+output; anything else => 0

describe('coerceTotal', () => {
  it('returns a number as-is', () => {
    expect(coerceTotal(42)).toBe(42);
  });

  it('returns 0 for null/undefined/string/boolean primitives', () => {
    expect(coerceTotal(null)).toBe(0);
    expect(coerceTotal(undefined)).toBe(0);
    expect(coerceTotal('123')).toBe(0);
    expect(coerceTotal(true)).toBe(0);
  });

  it('treats arrays as object-like with no input/output/total fields -> 0', () => {
    expect(coerceTotal([] as unknown)).toBe(0);
    expect(coerceTotal([1, 2, 3] as unknown)).toBe(0);
  });

  it('object with total wins over input+output', () => {
    expect(coerceTotal({ input: 5, output: 7, total: 999 })).toBe(999);
  });

  it('object without total sums input+output', () => {
    expect(coerceTotal({ input: 5, output: 7 })).toBe(12);
  });

  it('treats missing input/output as 0 in the sum branch', () => {
    expect(coerceTotal({ output: 7 })).toBe(7);
    expect(coerceTotal({ input: 5 })).toBe(5);
    expect(coerceTotal({})).toBe(0);
  });
});

function payload(over: Partial<TokenUsagePayload> = {}): TokenUsagePayload {
  return { perWorker: {}, perDay: {}, ...over };
}

describe('useTokenUsageBreakdowns', () => {
  it('null data: returns empty perWorker/perDay and zero maxes', () => {
    const { result } = renderHook(() =>
      useTokenUsageBreakdowns({
        data: null,
        rangeStart: '2026-01-01',
        rangeEnd: '2026-12-31',
      }),
    );
    expect(result.current.perWorker).toEqual([]);
    expect(result.current.perDay).toEqual([]);
    expect(result.current.workerMax).toBe(0);
    expect(result.current.dayMax).toBe(0);
  });

  it('perWorker: numeric values are coerced and sorted desc by total', () => {
    const { result } = renderHook(() =>
      useTokenUsageBreakdowns({
        data: payload({ perWorker: { a: 10, b: 50, c: 30 } }),
        rangeStart: '2026-01-01',
        rangeEnd: '2026-12-31',
      }),
    );
    expect(result.current.perWorker).toEqual([
      { name: 'b', total: 50 },
      { name: 'c', total: 30 },
      { name: 'a', total: 10 },
    ]);
    expect(result.current.workerMax).toBe(50);
  });

  it('perWorker: object values with explicit total are coerced via coerceTotal', () => {
    const { result } = renderHook(() =>
      useTokenUsageBreakdowns({
        data: payload({
          perWorker: {
            a: { input: 1, output: 2, total: 99 } as unknown as number,
            b: { input: 5, output: 5 } as unknown as number,
          },
        }),
        rangeStart: '2026-01-01',
        rangeEnd: '2026-12-31',
      }),
    );
    expect(result.current.perWorker).toEqual([
      { name: 'a', total: 99 },
      { name: 'b', total: 10 },
    ]);
  });

  it('perDay: filters entries to [rangeStart, rangeEnd] inclusive', () => {
    const { result } = renderHook(() =>
      useTokenUsageBreakdowns({
        data: payload({
          perDay: {
            '2026-04-30': 5,
            '2026-05-01': 10,
            '2026-05-15': 20,
            '2026-05-31': 30,
            '2026-06-01': 40,
          },
        }),
        rangeStart: '2026-05-01',
        rangeEnd: '2026-05-31',
      }),
    );
    expect(result.current.perDay.map((e) => e.date)).toEqual([
      '2026-05-01',
      '2026-05-15',
      '2026-05-31',
    ]);
    expect(result.current.dayMax).toBe(30);
  });

  it('perDay: includes the exact range boundaries (inclusive on both ends)', () => {
    const { result } = renderHook(() =>
      useTokenUsageBreakdowns({
        data: payload({
          perDay: { '2026-05-01': 1, '2026-05-31': 2 },
        }),
        rangeStart: '2026-05-01',
        rangeEnd: '2026-05-31',
      }),
    );
    expect(result.current.perDay).toHaveLength(2);
  });

  it('perDay: sorted ascending by date', () => {
    const { result } = renderHook(() =>
      useTokenUsageBreakdowns({
        data: payload({
          perDay: {
            '2026-05-03': 30,
            '2026-05-01': 10,
            '2026-05-02': 20,
          },
        }),
        rangeStart: '2026-05-01',
        rangeEnd: '2026-05-31',
      }),
    );
    expect(result.current.perDay.map((e) => e.date)).toEqual([
      '2026-05-01',
      '2026-05-02',
      '2026-05-03',
    ]);
  });

  it('perDay: Number-coerces non-numeric totals and falls back to 0', () => {
    const { result } = renderHook(() =>
      useTokenUsageBreakdowns({
        data: payload({
          perDay: {
            '2026-05-01': '42' as unknown as number,
            '2026-05-02': 'not-a-number' as unknown as number,
          },
        }),
        rangeStart: '2026-05-01',
        rangeEnd: '2026-05-31',
      }),
    );
    const map = Object.fromEntries(
      result.current.perDay.map((e) => [e.date, e.total]),
    );
    expect(map['2026-05-01']).toBe(42);
    expect(map['2026-05-02']).toBe(0);
  });

  it('empty perWorker yields workerMax=0 (not -Infinity from reduce)', () => {
    const { result } = renderHook(() =>
      useTokenUsageBreakdowns({
        data: payload({ perWorker: {} }),
        rangeStart: '2026-01-01',
        rangeEnd: '2026-12-31',
      }),
    );
    expect(result.current.workerMax).toBe(0);
  });

  it('empty perDay (after filter) yields dayMax=0', () => {
    const { result } = renderHook(() =>
      useTokenUsageBreakdowns({
        data: payload({ perDay: { '2026-01-01': 100 } }),
        rangeStart: '2026-05-01',
        rangeEnd: '2026-05-31',
      }),
    );
    expect(result.current.perDay).toEqual([]);
    expect(result.current.dayMax).toBe(0);
  });

  it('memoizes perWorker so identity is preserved across re-renders with same data', () => {
    const data = payload({ perWorker: { a: 1, b: 2 } });
    const { result, rerender } = renderHook(
      ({ rs, re }: { rs: string; re: string }) =>
        useTokenUsageBreakdowns({ data, rangeStart: rs, rangeEnd: re }),
      { initialProps: { rs: '2026-01-01', re: '2026-12-31' } },
    );
    const first = result.current.perWorker;
    rerender({ rs: '2026-01-01', re: '2026-12-31' });
    expect(result.current.perWorker).toBe(first);
  });

  it('memoizes perDay so it changes only when data or range change', () => {
    const data = payload({ perDay: { '2026-05-01': 1, '2026-05-02': 2 } });
    const { result, rerender } = renderHook(
      ({ re }: { re: string }) =>
        useTokenUsageBreakdowns({
          data,
          rangeStart: '2026-05-01',
          rangeEnd: re,
        }),
      { initialProps: { re: '2026-05-31' } },
    );
    const first = result.current.perDay;
    rerender({ re: '2026-05-31' });
    expect(result.current.perDay).toBe(first);
    rerender({ re: '2026-05-01' });
    expect(result.current.perDay).not.toBe(first);
    expect(result.current.perDay).toHaveLength(1);
  });

  it('missing perWorker/perDay fields default to [] and zero maxes', () => {
    const { result } = renderHook(() =>
      useTokenUsageBreakdowns({
        data: {} as TokenUsagePayload,
        rangeStart: '2026-01-01',
        rangeEnd: '2026-12-31',
      }),
    );
    expect(result.current.perWorker).toEqual([]);
    expect(result.current.perDay).toEqual([]);
    expect(result.current.workerMax).toBe(0);
    expect(result.current.dayMax).toBe(0);
  });

  it('perWorker preserves the original object key as name (no rename)', () => {
    const { result } = renderHook(() =>
      useTokenUsageBreakdowns({
        data: payload({ perWorker: { 'auto-w42': 7, 'auto-mgr': 1 } }),
        rangeStart: '2026-01-01',
        rangeEnd: '2026-12-31',
      }),
    );
    expect(result.current.perWorker.map((e) => e.name)).toEqual([
      'auto-w42',
      'auto-mgr',
    ]);
  });
});
