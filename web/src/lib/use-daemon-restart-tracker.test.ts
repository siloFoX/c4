import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import {
  useDaemonRestartTracker,
  _resetDaemonRestartTracker,
} from './use-daemon-restart-tracker';

beforeEach(() => {
  _resetDaemonRestartTracker();
});

afterEach(() => {
  _resetDaemonRestartTracker();
});

describe('useDaemonRestartTracker', () => {
  it('starts at restartCount=0 with no daemon contact', () => {
    const { result } = renderHook(() =>
      useDaemonRestartTracker({ pid: undefined, startedAt: undefined }),
    );
    expect(result.current.restartCount).toBe(0);
    expect(result.current.sinceFirstSeen).toBeNull();
  });

  it('first daemon contact records firstSeen but does NOT count a restart', () => {
    const { result } = renderHook(() =>
      useDaemonRestartTracker({ pid: 1234, startedAt: '2026-05-15T10:00:00Z' }),
    );
    expect(result.current.restartCount).toBe(0);
    expect(typeof result.current.sinceFirstSeen).toBe('string');
  });

  it('bumps restartCount when pid changes between renders', () => {
    const { result, rerender } = renderHook(
      ({ pid, startedAt }: { pid: number; startedAt: string }) =>
        useDaemonRestartTracker({ pid, startedAt }),
      { initialProps: { pid: 1234, startedAt: '2026-05-15T10:00:00Z' } },
    );
    expect(result.current.restartCount).toBe(0);
    rerender({ pid: 5678, startedAt: '2026-05-15T10:05:00Z' });
    expect(result.current.restartCount).toBe(1);
  });

  it('bumps restartCount when startedAt changes but pid stays the same', () => {
    const { result, rerender } = renderHook(
      ({ pid, startedAt }: { pid: number; startedAt: string }) =>
        useDaemonRestartTracker({ pid, startedAt }),
      { initialProps: { pid: 9999, startedAt: '2026-05-15T10:00:00Z' } },
    );
    expect(result.current.restartCount).toBe(0);
    rerender({ pid: 9999, startedAt: '2026-05-15T10:10:00Z' });
    expect(result.current.restartCount).toBe(1);
  });

  it('does NOT bump when pid + startedAt stay identical across polls', () => {
    const { result, rerender } = renderHook(
      ({ pid, startedAt }: { pid: number; startedAt: string }) =>
        useDaemonRestartTracker({ pid, startedAt }),
      { initialProps: { pid: 1234, startedAt: '2026-05-15T10:00:00Z' } },
    );
    rerender({ pid: 1234, startedAt: '2026-05-15T10:00:00Z' });
    rerender({ pid: 1234, startedAt: '2026-05-15T10:00:00Z' });
    expect(result.current.restartCount).toBe(0);
  });

  it('counts multiple restarts in sequence', () => {
    const { result, rerender } = renderHook(
      ({ pid, startedAt }: { pid: number; startedAt: string }) =>
        useDaemonRestartTracker({ pid, startedAt }),
      { initialProps: { pid: 1, startedAt: 'a' } },
    );
    rerender({ pid: 2, startedAt: 'b' });
    rerender({ pid: 3, startedAt: 'c' });
    rerender({ pid: 4, startedAt: 'd' });
    expect(result.current.restartCount).toBe(3);
  });

  it('persists state across re-mounts via localStorage', () => {
    const first = renderHook(() =>
      useDaemonRestartTracker({ pid: 1, startedAt: 'a' }),
    );
    first.rerender();
    first.unmount();
    const second = renderHook(() =>
      useDaemonRestartTracker({ pid: 1, startedAt: 'a' }),
    );
    // Re-mount sees the persisted firstSeen / restartCount.
    expect(second.result.current.restartCount).toBe(0);
    expect(typeof second.result.current.sinceFirstSeen).toBe('string');
  });

  it('persisted count survives a remount with a new daemon pid (counts the restart)', () => {
    const first = renderHook(() =>
      useDaemonRestartTracker({ pid: 1, startedAt: 'a' }),
    );
    first.unmount();
    const second = renderHook(() =>
      useDaemonRestartTracker({ pid: 2, startedAt: 'b' }),
    );
    expect(second.result.current.restartCount).toBe(1);
  });

  // (v1.11.279, TODO 11.261) restartHistory rolling buffer.

  it('starts with an empty restartHistory before any contact', () => {
    const { result } = renderHook(() =>
      useDaemonRestartTracker({ pid: undefined, startedAt: undefined }),
    );
    expect(result.current.restartHistory).toEqual([]);
  });

  it('first daemon contact does NOT push to restartHistory', () => {
    const { result } = renderHook(() =>
      useDaemonRestartTracker({ pid: 1, startedAt: 'a' }),
    );
    expect(result.current.restartHistory).toEqual([]);
  });

  it('pushes the bumped count into restartHistory on each restart event', () => {
    const { result, rerender } = renderHook(
      ({ pid, startedAt }: { pid: number; startedAt: string }) =>
        useDaemonRestartTracker({ pid, startedAt }),
      { initialProps: { pid: 1, startedAt: 'a' } },
    );
    rerender({ pid: 2, startedAt: 'b' });
    rerender({ pid: 3, startedAt: 'c' });
    rerender({ pid: 4, startedAt: 'd' });
    expect(result.current.restartHistory).toEqual([1, 2, 3]);
  });

  it('caps restartHistory to the most recent 24 samples', () => {
    const { result, rerender } = renderHook(
      ({ pid, startedAt }: { pid: number; startedAt: string }) =>
        useDaemonRestartTracker({ pid, startedAt }),
      { initialProps: { pid: 0, startedAt: 's0' } },
    );
    for (let i = 1; i <= 30; i += 1) {
      rerender({ pid: i, startedAt: `s${i}` });
    }
    expect(result.current.restartHistory).toHaveLength(24);
    expect(result.current.restartHistory[0]).toBe(7);
    expect(
      result.current.restartHistory[result.current.restartHistory.length - 1],
    ).toBe(30);
  });

  it('restartHistory persists across re-mounts', () => {
    const first = renderHook(
      ({ pid, startedAt }: { pid: number; startedAt: string }) =>
        useDaemonRestartTracker({ pid, startedAt }),
      { initialProps: { pid: 1, startedAt: 'a' } },
    );
    first.rerender({ pid: 2, startedAt: 'b' });
    first.rerender({ pid: 3, startedAt: 'c' });
    first.unmount();
    const second = renderHook(() =>
      useDaemonRestartTracker({ pid: 3, startedAt: 'c' }),
    );
    expect(second.result.current.restartHistory).toEqual([1, 2]);
  });
});
