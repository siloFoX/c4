import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useAutoClearMessage } from './use-auto-clear-message';

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

describe('useAutoClearMessage', () => {
  it('starts blank with failed=false', () => {
    const { result } = renderHook(() => useAutoClearMessage());
    expect(result.current.msg).toBeNull();
    expect(result.current.failed).toBe(false);
  });

  it('setSuccess shows the message and auto-clears after the default 4000ms', () => {
    const { result } = renderHook(() => useAutoClearMessage());
    act(() => result.current.setSuccess('saved'));
    expect(result.current.msg).toBe('saved');
    expect(result.current.failed).toBe(false);
    act(() => vi.advanceTimersByTime(3999));
    expect(result.current.msg).toBe('saved');
    act(() => vi.advanceTimersByTime(1));
    expect(result.current.msg).toBeNull();
  });

  it('honors a per-call duration override', () => {
    const { result } = renderHook(() => useAutoClearMessage());
    act(() => result.current.setSuccess('quick', 500));
    expect(result.current.msg).toBe('quick');
    act(() => vi.advanceTimersByTime(500));
    expect(result.current.msg).toBeNull();
  });

  it('honors the constructor default duration', () => {
    const { result } = renderHook(() => useAutoClearMessage(1000));
    act(() => result.current.setSuccess('hi'));
    act(() => vi.advanceTimersByTime(999));
    expect(result.current.msg).toBe('hi');
    act(() => vi.advanceTimersByTime(1));
    expect(result.current.msg).toBeNull();
  });

  it('setFailure shows the message with failed=true and does NOT auto-clear', () => {
    const { result } = renderHook(() => useAutoClearMessage());
    act(() => result.current.setFailure('boom'));
    expect(result.current.msg).toBe('boom');
    expect(result.current.failed).toBe(true);
    act(() => vi.advanceTimersByTime(60_000));
    expect(result.current.msg).toBe('boom');
  });

  it('setFailure cancels a pending success timer', () => {
    const { result } = renderHook(() => useAutoClearMessage());
    act(() => result.current.setSuccess('ok'));
    act(() => result.current.setFailure('boom'));
    expect(result.current.msg).toBe('boom');
    expect(result.current.failed).toBe(true);
    act(() => vi.advanceTimersByTime(10_000));
    expect(result.current.msg).toBe('boom');
  });

  it('consecutive successes restart the timer (no race)', () => {
    const { result } = renderHook(() => useAutoClearMessage());
    act(() => result.current.setSuccess('first', 1000));
    act(() => vi.advanceTimersByTime(500));
    act(() => result.current.setSuccess('second', 1000));
    // Second call resets the clock; we are 500ms into the new 1000ms window.
    act(() => vi.advanceTimersByTime(500));
    expect(result.current.msg).toBe('second');
    act(() => vi.advanceTimersByTime(500));
    expect(result.current.msg).toBeNull();
  });

  it('reset clears msg, failed, and the pending timer', () => {
    const { result } = renderHook(() => useAutoClearMessage());
    act(() => result.current.setSuccess('temp'));
    act(() => result.current.reset());
    expect(result.current.msg).toBeNull();
    expect(result.current.failed).toBe(false);
    act(() => vi.advanceTimersByTime(10_000));
    expect(result.current.msg).toBeNull();
  });

  it('cleans up the timer on unmount without throwing', () => {
    const { result, unmount } = renderHook(() => useAutoClearMessage());
    act(() => result.current.setSuccess('x'));
    unmount();
    expect(() => vi.advanceTimersByTime(10_000)).not.toThrow();
  });
});
