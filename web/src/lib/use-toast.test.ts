import { describe, it, expect, vi, afterEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useToast } from './use-toast';

// useToast is a single-slot ToastState container. showToast(message, type)
// pushes a new { id, message, type } onto the slot, using Date.now() as a
// monotonic id so React keys force a fresh mount per call. dismissToast
// clears the slot to null. Both setters come back as stable useCallback
// references so consumers can safely depend on them.

describe('useToast', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('starts idle: toast=null and exposes showToast + dismissToast functions', () => {
    const { result } = renderHook(() => useToast());
    expect(result.current.toast).toBeNull();
    expect(typeof result.current.showToast).toBe('function');
    expect(typeof result.current.dismissToast).toBe('function');
  });

  it('showToast sets the slot to { id, message, type }', () => {
    const { result } = renderHook(() => useToast());
    act(() => result.current.showToast('hello', 'success'));
    expect(result.current.toast).not.toBeNull();
    expect(result.current.toast?.message).toBe('hello');
    expect(result.current.toast?.type).toBe('success');
    expect(typeof result.current.toast?.id).toBe('number');
  });

  it('uses Date.now() as id (matches the mocked clock)', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-13T12:00:00Z'));
    const expected = Date.now();
    const { result } = renderHook(() => useToast());
    act(() => result.current.showToast('msg', 'info'));
    expect(result.current.toast?.id).toBe(expected);
  });

  it('dismissToast clears the slot back to null', () => {
    const { result } = renderHook(() => useToast());
    act(() => result.current.showToast('temp', 'info'));
    expect(result.current.toast).not.toBeNull();
    act(() => result.current.dismissToast());
    expect(result.current.toast).toBeNull();
  });

  it('a second showToast replaces the first (single-slot semantics)', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-13T12:00:00Z'));
    const { result } = renderHook(() => useToast());
    act(() => result.current.showToast('first', 'info'));
    const firstId = result.current.toast?.id;
    vi.advanceTimersByTime(10);
    act(() => result.current.showToast('second', 'error'));
    expect(result.current.toast?.message).toBe('second');
    expect(result.current.toast?.type).toBe('error');
    expect(result.current.toast?.id).not.toBe(firstId);
  });

  it('two showToast calls produce different ids when system clock advances', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-13T12:00:00Z'));
    const { result } = renderHook(() => useToast());
    act(() => result.current.showToast('a', 'info'));
    const idA = result.current.toast?.id;
    vi.advanceTimersByTime(50);
    act(() => result.current.showToast('b', 'info'));
    const idB = result.current.toast?.id;
    expect(idA).toBeDefined();
    expect(idB).toBeDefined();
    expect(idB).toBeGreaterThan(idA!);
  });

  it('preserves each of the three ToastType values', () => {
    const { result } = renderHook(() => useToast());
    act(() => result.current.showToast('s', 'success'));
    expect(result.current.toast?.type).toBe('success');
    act(() => result.current.showToast('e', 'error'));
    expect(result.current.toast?.type).toBe('error');
    act(() => result.current.showToast('i', 'info'));
    expect(result.current.toast?.type).toBe('info');
  });

  it('passes an empty message through verbatim (no validation)', () => {
    const { result } = renderHook(() => useToast());
    act(() => result.current.showToast('', 'info'));
    expect(result.current.toast).not.toBeNull();
    expect(result.current.toast?.message).toBe('');
  });

  it('dismissToast is a no-op when the slot is already null', () => {
    const { result } = renderHook(() => useToast());
    act(() => result.current.dismissToast());
    expect(result.current.toast).toBeNull();
    act(() => result.current.dismissToast());
    expect(result.current.toast).toBeNull();
  });

  it('showToast reference is stable across renders (useCallback empty deps)', () => {
    const { result, rerender } = renderHook(() => useToast());
    const firstShow = result.current.showToast;
    rerender();
    expect(result.current.showToast).toBe(firstShow);
  });

  it('dismissToast reference is stable across renders (useCallback empty deps)', () => {
    const { result, rerender } = renderHook(() => useToast());
    const firstDismiss = result.current.dismissToast;
    rerender();
    expect(result.current.dismissToast).toBe(firstDismiss);
  });

  it('show then dismiss then show again returns to a populated slot', () => {
    const { result } = renderHook(() => useToast());
    act(() => result.current.showToast('once', 'success'));
    act(() => result.current.dismissToast());
    expect(result.current.toast).toBeNull();
    act(() => result.current.showToast('twice', 'error'));
    expect(result.current.toast?.message).toBe('twice');
    expect(result.current.toast?.type).toBe('error');
  });
});
