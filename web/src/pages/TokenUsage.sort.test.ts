import { describe, it, expect } from 'vitest';
import { perTaskComparator } from './TokenUsage';
import type { PerTaskRow } from './TokenUsage';

// (v1.11.258, TODO 11.240) Pure comparator coverage for the
// per-task table's sort logic. Exercised through the exported
// `perTaskComparator` so the page-level test file doesn't need
// to render the full TokenUsage tree to verify ordering.

function row(over: Partial<PerTaskRow>): PerTaskRow {
  return { worker: 'w', task: 't', total: 0, input: 0, output: 0, ...over };
}

describe('perTaskComparator', () => {
  it('sorts by total descending', () => {
    const rows = [
      row({ worker: 'a', total: 10 }),
      row({ worker: 'b', total: 30 }),
      row({ worker: 'c', total: 20 }),
    ];
    rows.sort(perTaskComparator('total', 'desc'));
    expect(rows.map((r) => r.worker)).toEqual(['b', 'c', 'a']);
  });

  it('sorts by total ascending', () => {
    const rows = [
      row({ worker: 'a', total: 10 }),
      row({ worker: 'b', total: 30 }),
      row({ worker: 'c', total: 20 }),
    ];
    rows.sort(perTaskComparator('total', 'asc'));
    expect(rows.map((r) => r.worker)).toEqual(['a', 'c', 'b']);
  });

  it('sorts by input ascending / descending', () => {
    const rows = [
      row({ worker: 'a', input: 5 }),
      row({ worker: 'b', input: 100 }),
      row({ worker: 'c', input: 50 }),
    ];
    rows.sort(perTaskComparator('input', 'asc'));
    expect(rows.map((r) => r.worker)).toEqual(['a', 'c', 'b']);
    rows.sort(perTaskComparator('input', 'desc'));
    expect(rows.map((r) => r.worker)).toEqual(['b', 'c', 'a']);
  });

  it('sorts by output ascending / descending', () => {
    const rows = [
      row({ worker: 'a', output: 200 }),
      row({ worker: 'b', output: 50 }),
      row({ worker: 'c', output: 100 }),
    ];
    rows.sort(perTaskComparator('output', 'asc'));
    expect(rows.map((r) => r.worker)).toEqual(['b', 'c', 'a']);
    rows.sort(perTaskComparator('output', 'desc'));
    expect(rows.map((r) => r.worker)).toEqual(['a', 'c', 'b']);
  });

  it('sorts by worker alphabetically (case-insensitive)', () => {
    const rows = [
      row({ worker: 'Bravo' }),
      row({ worker: 'alpha' }),
      row({ worker: 'Charlie' }),
    ];
    rows.sort(perTaskComparator('worker', 'asc'));
    expect(rows.map((r) => r.worker)).toEqual(['alpha', 'Bravo', 'Charlie']);
    rows.sort(perTaskComparator('worker', 'desc'));
    expect(rows.map((r) => r.worker)).toEqual(['Charlie', 'Bravo', 'alpha']);
  });

  it('falls back to name when worker is missing in the worker sort', () => {
    const rows = [
      row({ worker: undefined, name: 'zeta' }),
      row({ worker: undefined, name: 'alpha' }),
    ];
    rows.sort(perTaskComparator('worker', 'asc'));
    expect(rows.map((r) => r.name)).toEqual(['alpha', 'zeta']);
  });

  it('treats missing input/output as 0 (sortable without nulls)', () => {
    const rows = [
      row({ worker: 'a', input: undefined }),
      row({ worker: 'b', input: 10 }),
      row({ worker: 'c', input: 5 }),
    ];
    rows.sort(perTaskComparator('input', 'asc'));
    expect(rows.map((r) => r.worker)).toEqual(['a', 'c', 'b']);
  });

  it('coerces total via the sum when total is missing', () => {
    // total prop undefined -> coerceTotal sums input+output. The
    // comparator must respect that fallback so a row that only
    // carries input/output still sorts in the right slot.
    const rows = [
      row({ worker: 'a', total: undefined, input: 100, output: 200 }),
      row({ worker: 'b', total: undefined, input: 1, output: 2 }),
      row({ worker: 'c', total: 50 }),
    ];
    rows.sort(perTaskComparator('total', 'desc'));
    expect(rows.map((r) => r.worker)).toEqual(['a', 'c', 'b']);
  });

  it('is stable for equal keys (insertion order preserved by Array#sort spec)', () => {
    // Modern Node Array#sort is required to be stable. Verify the
    // comparator does not introduce its own instability.
    const rows = [
      row({ worker: 'first', total: 10 }),
      row({ worker: 'second', total: 10 }),
      row({ worker: 'third', total: 10 }),
    ];
    rows.sort(perTaskComparator('total', 'desc'));
    expect(rows.map((r) => r.worker)).toEqual(['first', 'second', 'third']);
  });
});
