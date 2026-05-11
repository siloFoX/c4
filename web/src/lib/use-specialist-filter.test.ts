import { describe, it, expect } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useSpecialistFilter } from './use-specialist-filter';
import type { Specialist } from '../components/SpecialistsView';

function makeSpec(overrides: Partial<Specialist> = {}): Specialist {
  return {
    id: 'spec-1',
    displayName: 'Spec One',
    tier: 'review',
    domain: ['general'],
    brain: { adapter: 'anthropic', model: 'opus', effort: 'high' },
    systemPrompt: '',
    triggers: { keywords: [], stages: [] },
    deliverables: [],
    vetoPower: false,
    probation: 'stable',
    score: { byDomain: {}, byStage: {}, samples: {}, lastUpdated: null },
    ...overrides,
  };
}

describe('useSpecialistFilter', () => {
  it('exposes the documented idle state (empty query / tier=any / vetoOnly=false)', () => {
    const list = [makeSpec({ id: 'a' }), makeSpec({ id: 'b' })];
    const { result } = renderHook(() =>
      useSpecialistFilter({ specialists: list }),
    );
    expect(result.current.filter).toBe('');
    expect(result.current.tierFilter).toBe('any');
    expect(result.current.vetoOnly).toBe(false);
    // No filter active — everything passes through in source order.
    expect(result.current.filtered.map((s) => s.id)).toEqual(['a', 'b']);
  });

  it('setFilter / setTierFilter / setVetoOnly each update their own slot', () => {
    const { result } = renderHook(() =>
      useSpecialistFilter({ specialists: [] }),
    );
    act(() => result.current.setFilter('query'));
    expect(result.current.filter).toBe('query');
    act(() => result.current.setTierFilter('review'));
    expect(result.current.tierFilter).toBe('review');
    act(() => result.current.setVetoOnly(true));
    expect(result.current.vetoOnly).toBe(true);
  });

  it('vetoOnly=true drops specialists without veto power', () => {
    const list = [
      makeSpec({ id: 'veto-yes', vetoPower: true }),
      makeSpec({ id: 'veto-no', vetoPower: false }),
    ];
    const { result } = renderHook(() =>
      useSpecialistFilter({ specialists: list }),
    );
    act(() => result.current.setVetoOnly(true));
    expect(result.current.filtered.map((s) => s.id)).toEqual(['veto-yes']);
  });

  it('tierFilter !== "any" filters to exact-match tier', () => {
    const list = [
      makeSpec({ id: 'r1', tier: 'review' }),
      makeSpec({ id: 'a1', tier: 'audit' }),
      makeSpec({ id: 'r2', tier: 'review' }),
    ];
    const { result } = renderHook(() =>
      useSpecialistFilter({ specialists: list }),
    );
    act(() => result.current.setTierFilter('review'));
    expect(result.current.filtered.map((s) => s.id)).toEqual(['r1', 'r2']);
  });

  it('tierFilter "any" leaves every tier through (the default no-op branch)', () => {
    const list = [
      makeSpec({ id: 'r1', tier: 'review' }),
      makeSpec({ id: 'a1', tier: 'audit' }),
    ];
    const { result } = renderHook(() =>
      useSpecialistFilter({ specialists: list }),
    );
    expect(result.current.filtered).toHaveLength(2);
  });

  it('whitespace-only filter is treated as no query (after trim+split filter Boolean)', () => {
    const list = [makeSpec({ id: 'a' }), makeSpec({ id: 'b' })];
    const { result } = renderHook(() =>
      useSpecialistFilter({ specialists: list }),
    );
    act(() => result.current.setFilter('   \t  '));
    expect(result.current.filtered.map((s) => s.id)).toEqual(['a', 'b']);
  });

  it('matches a single token case-insensitively against id / displayName / systemPrompt', () => {
    const list = [
      makeSpec({ id: 'AUTH-bot', displayName: 'Misc One' }),
      makeSpec({ id: 'other', displayName: 'Auth Reviewer' }),
      makeSpec({ id: 'silent', displayName: 'Quiet', systemPrompt: 'handles AUTHENTICATION flow' }),
      makeSpec({ id: 'nope', displayName: 'No Match' }),
    ];
    const { result } = renderHook(() =>
      useSpecialistFilter({ specialists: list }),
    );
    act(() => result.current.setFilter('auth'));
    expect(result.current.filtered.map((s) => s.id)).toEqual([
      'AUTH-bot',
      'other',
      'silent',
    ]);
  });

  it('searches across domain[] entries', () => {
    const list = [
      makeSpec({ id: 'a', domain: ['security', 'crypto'] }),
      makeSpec({ id: 'b', domain: ['frontend'] }),
    ];
    const { result } = renderHook(() =>
      useSpecialistFilter({ specialists: list }),
    );
    act(() => result.current.setFilter('crypto'));
    expect(result.current.filtered.map((s) => s.id)).toEqual(['a']);
  });

  it('searches across triggers.keywords[]', () => {
    const list = [
      makeSpec({
        id: 'a',
        triggers: { keywords: ['migration', 'schema'], stages: [] },
      }),
      makeSpec({
        id: 'b',
        triggers: { keywords: ['ui'], stages: [] },
      }),
    ];
    const { result } = renderHook(() =>
      useSpecialistFilter({ specialists: list }),
    );
    act(() => result.current.setFilter('schema'));
    expect(result.current.filtered.map((s) => s.id)).toEqual(['a']);
  });

  it('AND-composes whitespace-separated tokens — every token must match the haystack', () => {
    const list = [
      makeSpec({
        id: 'both',
        displayName: 'Auth Reviewer',
        domain: ['security'],
      }),
      makeSpec({
        id: 'only-auth',
        displayName: 'Auth Drafter',
        domain: ['frontend'],
      }),
      makeSpec({
        id: 'only-sec',
        displayName: 'Crypto Reviewer',
        domain: ['security'],
      }),
    ];
    const { result } = renderHook(() =>
      useSpecialistFilter({ specialists: list }),
    );
    act(() => result.current.setFilter('auth security'));
    expect(result.current.filtered.map((s) => s.id)).toEqual(['both']);
  });

  it('survives a non-array domain (defensive fallback — skips the spread)', () => {
    const list = [
      // Pretend the daemon shipped a malformed payload — the hook should
      // still filter without throwing on the spread.
      makeSpec({ id: 'a', domain: null as unknown as string[] }),
      makeSpec({ id: 'b', domain: ['x'] }),
    ];
    const { result } = renderHook(() =>
      useSpecialistFilter({ specialists: list }),
    );
    expect(() => result.current.filtered).not.toThrow();
    // With tokens=[] every row passes (tier=any, veto=false).
    expect(result.current.filtered.map((s) => s.id)).toEqual(['a', 'b']);
  });

  it('survives an undefined triggers.keywords (defensive fallback — skips the spread)', () => {
    const list = [
      makeSpec({
        id: 'a',
        triggers: { stages: [] } as Specialist['triggers'],
      }),
      makeSpec({
        id: 'b',
        triggers: { keywords: ['hit'], stages: [] },
      }),
    ];
    const { result } = renderHook(() =>
      useSpecialistFilter({ specialists: list }),
    );
    act(() => result.current.setFilter('hit'));
    expect(result.current.filtered.map((s) => s.id)).toEqual(['b']);
  });

  it('falsy systemPrompt substitutes an empty haystack slot (no NPE on undefined)', () => {
    const list = [
      makeSpec({
        id: 'a',
        systemPrompt: undefined as unknown as string,
        displayName: 'Match Me',
      }),
    ];
    const { result } = renderHook(() =>
      useSpecialistFilter({ specialists: list }),
    );
    act(() => result.current.setFilter('match'));
    expect(result.current.filtered.map((s) => s.id)).toEqual(['a']);
  });

  it('composes vetoOnly + tierFilter + token in the same pass', () => {
    const list = [
      makeSpec({
        id: 'win',
        tier: 'review',
        vetoPower: true,
        displayName: 'Match Me',
      }),
      makeSpec({
        id: 'wrong-tier',
        tier: 'audit',
        vetoPower: true,
        displayName: 'Match Me',
      }),
      makeSpec({
        id: 'no-veto',
        tier: 'review',
        vetoPower: false,
        displayName: 'Match Me',
      }),
      makeSpec({
        id: 'no-text',
        tier: 'review',
        vetoPower: true,
        displayName: 'Silent',
      }),
    ];
    const { result } = renderHook(() =>
      useSpecialistFilter({ specialists: list }),
    );
    act(() => {
      result.current.setVetoOnly(true);
      result.current.setTierFilter('review');
      result.current.setFilter('match');
    });
    expect(result.current.filtered.map((s) => s.id)).toEqual(['win']);
  });

  it('re-derives filtered when the specialists prop changes (memo dep)', () => {
    const a = [makeSpec({ id: 'a' })];
    const b = [makeSpec({ id: 'a' }), makeSpec({ id: 'b' })];
    const { result, rerender } = renderHook(
      ({ list }: { list: Specialist[] }) =>
        useSpecialistFilter({ specialists: list }),
      { initialProps: { list: a } },
    );
    expect(result.current.filtered).toHaveLength(1);
    rerender({ list: b });
    expect(result.current.filtered.map((s) => s.id)).toEqual(['a', 'b']);
  });
});
