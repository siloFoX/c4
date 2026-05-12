import { describe, it, expect } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useExpandedSet } from './use-expanded-set';
import type { Worker } from '../types';

function mkWorker(name: string): Worker {
  return { name } as unknown as Worker;
}

describe('useExpandedSet', () => {
  it('starts with an empty expanded set when there are no workers', () => {
    const { result } = renderHook(() => useExpandedSet({ workers: [] }));
    expect(result.current.expanded.size).toBe(0);
  });

  it('auto-expands every worker name on the first non-empty payload', () => {
    const { result } = renderHook(() =>
      useExpandedSet({ workers: [mkWorker('a'), mkWorker('b')] }),
    );
    expect(result.current.expanded.has('a')).toBe(true);
    expect(result.current.expanded.has('b')).toBe(true);
    expect(result.current.expanded.size).toBe(2);
  });

  it('does NOT re-expand newly added workers after the first auto-expand (sticky)', () => {
    const { result, rerender } = renderHook(
      ({ ws }) => useExpandedSet({ workers: ws }),
      { initialProps: { ws: [mkWorker('a')] } },
    );
    expect(result.current.expanded.has('a')).toBe(true);
    rerender({ ws: [mkWorker('a'), mkWorker('b')] });
    expect(result.current.expanded.has('a')).toBe(true);
    expect(result.current.expanded.has('b')).toBe(false);
  });

  it('keeps the expanded set empty while the workers list stays empty', () => {
    const { result, rerender } = renderHook(
      ({ ws }) => useExpandedSet({ workers: ws }),
      { initialProps: { ws: [] as Worker[] } },
    );
    expect(result.current.expanded.size).toBe(0);
    rerender({ ws: [] as Worker[] });
    expect(result.current.expanded.size).toBe(0);
  });

  it('toggle adds a name when absent', () => {
    const { result } = renderHook(() => useExpandedSet({ workers: [] }));
    act(() => result.current.toggle('only'));
    expect(result.current.expanded.has('only')).toBe(true);
    expect(result.current.expanded.size).toBe(1);
  });

  it('toggle removes a name when present', () => {
    const workers = [mkWorker('a')];
    const { result } = renderHook(() => useExpandedSet({ workers }));
    expect(result.current.expanded.has('a')).toBe(true);
    act(() => result.current.toggle('a'));
    expect(result.current.expanded.has('a')).toBe(false);
  });

  it('expandAll opens every current worker', () => {
    const workers = [mkWorker('a'), mkWorker('b'), mkWorker('c')];
    const { result } = renderHook(() => useExpandedSet({ workers }));
    act(() => result.current.collapseAll());
    expect(result.current.expanded.size).toBe(0);
    act(() => result.current.expandAll());
    expect(result.current.expanded.has('a')).toBe(true);
    expect(result.current.expanded.has('b')).toBe(true);
    expect(result.current.expanded.has('c')).toBe(true);
    expect(result.current.expanded.size).toBe(3);
  });

  it('collapseAll empties the set', () => {
    const workers = [mkWorker('a'), mkWorker('b')];
    const { result } = renderHook(() => useExpandedSet({ workers }));
    expect(result.current.expanded.size).toBe(2);
    act(() => result.current.collapseAll());
    expect(result.current.expanded.size).toBe(0);
  });

  it('expandAll picks up workers that were added after mount', () => {
    const { result, rerender } = renderHook(
      ({ ws }) => useExpandedSet({ workers: ws }),
      { initialProps: { ws: [mkWorker('a')] } },
    );
    rerender({ ws: [mkWorker('a'), mkWorker('b')] });
    act(() => result.current.expandAll());
    expect(result.current.expanded.has('a')).toBe(true);
    expect(result.current.expanded.has('b')).toBe(true);
  });

  it('keeps the toggle and collapseAll callback identities stable across re-renders', () => {
    const { result, rerender } = renderHook(() =>
      useExpandedSet({ workers: [mkWorker('a')] }),
    );
    const firstToggle = result.current.toggle;
    const firstCollapseAll = result.current.collapseAll;
    rerender();
    expect(result.current.toggle).toBe(firstToggle);
    expect(result.current.collapseAll).toBe(firstCollapseAll);
  });
});
