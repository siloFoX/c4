import { describe, it, expect } from 'vitest';
import {
  historySidebarComparator,
  type HistoryWorkerSummary,
} from './HistoryView';

// (v1.11.258, TODO 11.240) Pure-comparator coverage for the
// History sidebar's sort logic. Exercised in isolation so the
// page-level test doesn't have to render the full tree to verify
// ordering.

function row(over: Partial<HistoryWorkerSummary>): HistoryWorkerSummary {
  return {
    name: 'worker',
    taskCount: 0,
    firstTaskAt: null,
    lastTaskAt: null,
    lastTask: null,
    lastStatus: null,
    branches: [],
    alive: false,
    liveStatus: null,
    ...over,
  };
}

describe('historySidebarComparator', () => {
  it('sorts by name alphabetically ascending (case-insensitive)', () => {
    const rows = [
      row({ name: 'Bravo' }),
      row({ name: 'alpha' }),
      row({ name: 'Charlie' }),
    ];
    rows.sort(historySidebarComparator('name', 'asc'));
    expect(rows.map((r) => r.name)).toEqual(['alpha', 'Bravo', 'Charlie']);
  });

  it('sorts by name descending', () => {
    const rows = [
      row({ name: 'alpha' }),
      row({ name: 'Charlie' }),
      row({ name: 'Bravo' }),
    ];
    rows.sort(historySidebarComparator('name', 'desc'));
    expect(rows.map((r) => r.name)).toEqual(['Charlie', 'Bravo', 'alpha']);
  });

  it('sorts by taskCount ascending', () => {
    const rows = [
      row({ name: 'a', taskCount: 5 }),
      row({ name: 'b', taskCount: 1 }),
      row({ name: 'c', taskCount: 10 }),
    ];
    rows.sort(historySidebarComparator('taskCount', 'asc'));
    expect(rows.map((r) => r.name)).toEqual(['b', 'a', 'c']);
  });

  it('sorts by taskCount descending', () => {
    const rows = [
      row({ name: 'a', taskCount: 5 }),
      row({ name: 'b', taskCount: 1 }),
      row({ name: 'c', taskCount: 10 }),
    ];
    rows.sort(historySidebarComparator('taskCount', 'desc'));
    expect(rows.map((r) => r.name)).toEqual(['c', 'a', 'b']);
  });

  it('sorts by lastTaskAt ISO timestamps ascending', () => {
    const rows = [
      row({ name: 'a', lastTaskAt: '2026-05-10T10:00:00Z' }),
      row({ name: 'b', lastTaskAt: '2026-05-12T10:00:00Z' }),
      row({ name: 'c', lastTaskAt: '2026-05-11T10:00:00Z' }),
    ];
    rows.sort(historySidebarComparator('lastTaskAt', 'asc'));
    expect(rows.map((r) => r.name)).toEqual(['a', 'c', 'b']);
  });

  it('sorts by lastTaskAt descending (most recent first)', () => {
    const rows = [
      row({ name: 'a', lastTaskAt: '2026-05-10T10:00:00Z' }),
      row({ name: 'b', lastTaskAt: '2026-05-12T10:00:00Z' }),
      row({ name: 'c', lastTaskAt: '2026-05-11T10:00:00Z' }),
    ];
    rows.sort(historySidebarComparator('lastTaskAt', 'desc'));
    expect(rows.map((r) => r.name)).toEqual(['b', 'c', 'a']);
  });

  it('sorts null lastTaskAt entries to the end regardless of direction', () => {
    const rows = [
      row({ name: 'a', lastTaskAt: null }),
      row({ name: 'b', lastTaskAt: '2026-05-12T10:00:00Z' }),
      row({ name: 'c', lastTaskAt: null }),
      row({ name: 'd', lastTaskAt: '2026-05-10T10:00:00Z' }),
    ];
    rows.sort(historySidebarComparator('lastTaskAt', 'desc'));
    // b first (newest), d second (older), a + c last (nulls).
    expect(rows.map((r) => r.name).slice(0, 2)).toEqual(['b', 'd']);
    expect(rows.map((r) => r.name).slice(2).sort()).toEqual(['a', 'c']);
    rows.sort(historySidebarComparator('lastTaskAt', 'asc'));
    // Ascending: d first (oldest), b second, a + c still last.
    expect(rows.map((r) => r.name).slice(0, 2)).toEqual(['d', 'b']);
    expect(rows.map((r) => r.name).slice(2).sort()).toEqual(['a', 'c']);
  });

  it('is stable for equal keys (insertion order preserved)', () => {
    const rows = [
      row({ name: 'one', taskCount: 5 }),
      row({ name: 'two', taskCount: 5 }),
      row({ name: 'three', taskCount: 5 }),
    ];
    rows.sort(historySidebarComparator('taskCount', 'desc'));
    expect(rows.map((r) => r.name)).toEqual(['one', 'two', 'three']);
  });
});
