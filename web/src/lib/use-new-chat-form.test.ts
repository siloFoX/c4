import { describe, it, expect } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useNewChatForm } from './use-new-chat-form';

describe('useNewChatForm', () => {
  it('starts with empty prompt and the documented defaults for model + agent', () => {
    const { result } = renderHook(() => useNewChatForm({ open: false }));
    expect(result.current.prompt).toBe('');
    expect(result.current.model).toBe('default');
    expect(result.current.agent).toBe('generic');
  });

  it('setPrompt / setModel / setAgent update the corresponding slots', () => {
    const { result } = renderHook(() => useNewChatForm({ open: false }));
    act(() => result.current.setPrompt('hello'));
    act(() => result.current.setModel('opus'));
    act(() => result.current.setAgent('manager'));
    expect(result.current.prompt).toBe('hello');
    expect(result.current.model).toBe('opus');
    expect(result.current.agent).toBe('manager');
  });

  it('resets the three fields whenever open transitions to true', () => {
    const { result, rerender } = renderHook(
      ({ open }: { open: boolean }) => useNewChatForm({ open }),
      { initialProps: { open: false } },
    );
    act(() => result.current.setPrompt('typed text'));
    act(() => result.current.setModel('opus'));
    act(() => result.current.setAgent('manager'));
    rerender({ open: true });
    expect(result.current.prompt).toBe('');
    expect(result.current.model).toBe('default');
    expect(result.current.agent).toBe('generic');
  });

  it('does NOT reset the form when open transitions to false (close path preserves typed values)', () => {
    const { result, rerender } = renderHook(
      ({ open }: { open: boolean }) => useNewChatForm({ open }),
      { initialProps: { open: true } },
    );
    act(() => result.current.setPrompt('typed text'));
    act(() => result.current.setModel('opus'));
    act(() => result.current.setAgent('manager'));
    rerender({ open: false });
    expect(result.current.prompt).toBe('typed text');
    expect(result.current.model).toBe('opus');
    expect(result.current.agent).toBe('manager');
  });

  it('re-opening after a close wipes any leftover values from the previous session', () => {
    const { result, rerender } = renderHook(
      ({ open }: { open: boolean }) => useNewChatForm({ open }),
      { initialProps: { open: true } },
    );
    rerender({ open: false });
    act(() => result.current.setPrompt('stale'));
    rerender({ open: true });
    expect(result.current.prompt).toBe('');
    expect(result.current.model).toBe('default');
    expect(result.current.agent).toBe('generic');
  });

  it('initial render with open=true resets fields to defaults (mount-time effect)', () => {
    const { result } = renderHook(() => useNewChatForm({ open: true }));
    expect(result.current.prompt).toBe('');
    expect(result.current.model).toBe('default');
    expect(result.current.agent).toBe('generic');
  });

  it('does not reset when open stays true across re-renders (no spurious wipe)', () => {
    const { result, rerender } = renderHook(
      ({ open }: { open: boolean }) => useNewChatForm({ open }),
      { initialProps: { open: true } },
    );
    act(() => result.current.setPrompt('keep me'));
    rerender({ open: true });
    expect(result.current.prompt).toBe('keep me');
  });
});
