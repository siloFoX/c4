import { describe, it, expect } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useSessionsCollapse } from './use-sessions-collapse';

describe('useSessionsCollapse', () => {
  it('starts idle: empty collapse map, attached pane expanded', () => {
    const { result } = renderHook(() => useSessionsCollapse());
    expect(result.current.collapsed).toEqual({});
    expect(result.current.attachedCollapsed).toBe(false);
  });

  it('toggleGroup flips an unset key to true', () => {
    const { result } = renderHook(() => useSessionsCollapse());
    act(() => result.current.toggleGroup('proj-a'));
    expect(result.current.collapsed).toEqual({ 'proj-a': true });
  });

  it('toggleGroup flips a true key back to false (round-trip)', () => {
    const { result } = renderHook(() => useSessionsCollapse());
    act(() => result.current.toggleGroup('proj-a'));
    act(() => result.current.toggleGroup('proj-a'));
    expect(result.current.collapsed['proj-a']).toBe(false);
  });

  it('toggleGroup tracks multiple keys independently', () => {
    const { result } = renderHook(() => useSessionsCollapse());
    act(() => result.current.toggleGroup('proj-a'));
    act(() => result.current.toggleGroup('proj-b'));
    expect(result.current.collapsed).toEqual({ 'proj-a': true, 'proj-b': true });
    act(() => result.current.toggleGroup('proj-a'));
    expect(result.current.collapsed).toEqual({ 'proj-a': false, 'proj-b': true });
  });

  it('toggleGroup produces a new collapsed object each call (immutable update)', () => {
    const { result } = renderHook(() => useSessionsCollapse());
    const before = result.current.collapsed;
    act(() => result.current.toggleGroup('proj-a'));
    expect(result.current.collapsed).not.toBe(before);
  });

  it('toggleAttachedCollapsed flips attachedCollapsed', () => {
    const { result } = renderHook(() => useSessionsCollapse());
    act(() => result.current.toggleAttachedCollapsed());
    expect(result.current.attachedCollapsed).toBe(true);
    act(() => result.current.toggleAttachedCollapsed());
    expect(result.current.attachedCollapsed).toBe(false);
  });

  it('attached toggle does not touch the group collapse map', () => {
    const { result } = renderHook(() => useSessionsCollapse());
    act(() => result.current.toggleGroup('proj-a'));
    const groupSnap = result.current.collapsed;
    act(() => result.current.toggleAttachedCollapsed());
    expect(result.current.collapsed).toBe(groupSnap);
    expect(result.current.attachedCollapsed).toBe(true);
  });

  it('keeps callback references stable across re-renders', () => {
    const { result, rerender } = renderHook(() => useSessionsCollapse());
    const toggleGroup = result.current.toggleGroup;
    const toggleAttachedCollapsed = result.current.toggleAttachedCollapsed;
    rerender();
    expect(result.current.toggleGroup).toBe(toggleGroup);
    expect(result.current.toggleAttachedCollapsed).toBe(toggleAttachedCollapsed);
  });
});
