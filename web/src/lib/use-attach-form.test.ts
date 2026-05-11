import { describe, it, expect } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useAttachForm } from './use-attach-form';

describe('useAttachForm', () => {
  it('starts idle: both inputs empty', () => {
    const { result } = renderHook(() => useAttachForm({ open: true }));
    expect(result.current.pathValue).toBe('');
    expect(result.current.nameValue).toBe('');
  });

  it('setPathValue updates pathValue and leaves nameValue alone', () => {
    const { result } = renderHook(() => useAttachForm({ open: true }));
    act(() => result.current.setPathValue('/tmp/session.jsonl'));
    expect(result.current.pathValue).toBe('/tmp/session.jsonl');
    expect(result.current.nameValue).toBe('');
  });

  it('setNameValue updates nameValue and leaves pathValue alone', () => {
    const { result } = renderHook(() => useAttachForm({ open: true }));
    act(() => result.current.setNameValue('my-attach'));
    expect(result.current.nameValue).toBe('my-attach');
    expect(result.current.pathValue).toBe('');
  });

  it('wipes both fields when open transitions true to false', () => {
    const { result, rerender } = renderHook(
      ({ open }) => useAttachForm({ open }),
      { initialProps: { open: true } },
    );
    act(() => {
      result.current.setPathValue('/a/b.jsonl');
      result.current.setNameValue('row-1');
    });
    expect(result.current.pathValue).toBe('/a/b.jsonl');
    expect(result.current.nameValue).toBe('row-1');

    rerender({ open: false });
    expect(result.current.pathValue).toBe('');
    expect(result.current.nameValue).toBe('');
  });

  // The source comment is explicit: reset on close, NOT on open, so a
  // failed submit (which keeps the modal open) preserves the typed-in
  // path/name for an immediate retry.
  it('preserves fields when open stays true across a failed submit', () => {
    const { result, rerender } = renderHook(
      ({ open }) => useAttachForm({ open }),
      { initialProps: { open: true } },
    );
    act(() => {
      result.current.setPathValue('/p');
      result.current.setNameValue('n');
    });
    rerender({ open: true });
    expect(result.current.pathValue).toBe('/p');
    expect(result.current.nameValue).toBe('n');
  });

  it('reopens after a close with empty fields (close wiped them; open does not restore)', () => {
    const { result, rerender } = renderHook(
      ({ open }) => useAttachForm({ open }),
      { initialProps: { open: true } },
    );
    act(() => {
      result.current.setPathValue('/p');
      result.current.setNameValue('n');
    });
    rerender({ open: false });
    expect(result.current.pathValue).toBe('');
    expect(result.current.nameValue).toBe('');
    rerender({ open: true });
    expect(result.current.pathValue).toBe('');
    expect(result.current.nameValue).toBe('');
  });

  it('mounts cleanly with open=false (already-empty fields, no observable wipe)', () => {
    const { result } = renderHook(() => useAttachForm({ open: false }));
    expect(result.current.pathValue).toBe('');
    expect(result.current.nameValue).toBe('');
  });
});
