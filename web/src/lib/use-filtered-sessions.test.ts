import { describe, it, expect } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useFilteredSessions } from './use-filtered-sessions';
import type {
  AttachedSession,
  SessionGroup,
  SessionSummary,
} from '../components/SessionsView';

function mkSession(over: Partial<SessionSummary> = {}): SessionSummary {
  return {
    projectDir: null,
    projectPath: null,
    sessionId: 'sess-x',
    path: '/jsonl/x',
    updatedAt: null,
    size: 0,
    turnCount: 0,
    lastAssistantSnippet: '',
    ...over,
  };
}

function mkGroup(over: Partial<SessionGroup> = {}): SessionGroup {
  return {
    projectPath: null,
    projectDir: null,
    sessions: [],
    updatedAt: null,
    ...over,
  };
}

function mkAttached(over: Partial<AttachedSession> = {}): AttachedSession {
  return {
    name: 'att',
    jsonlPath: '/jsonl/att',
    sessionId: null,
    projectPath: null,
    createdAt: null,
    lastOffset: 0,
    ...over,
  };
}

describe('useFilteredSessions: filteredGroups', () => {
  it('returns [] when groups is null', () => {
    const { result } = renderHook(() =>
      useFilteredSessions({ groups: null, attached: [], query: '' }),
    );
    expect(result.current.filteredGroups).toEqual([]);
  });

  it('returns the same groups reference when the trimmed query is empty', () => {
    const groups = [mkGroup({ projectPath: '/a', sessions: [mkSession()] })];
    const { result } = renderHook(() =>
      useFilteredSessions({ groups, attached: [], query: '' }),
    );
    expect(result.current.filteredGroups).toBe(groups);
  });

  it('treats whitespace-only queries as empty', () => {
    const groups = [mkGroup({ projectPath: '/a', sessions: [mkSession()] })];
    const { result } = renderHook(() =>
      useFilteredSessions({ groups, attached: [], query: '   ' }),
    );
    expect(result.current.filteredGroups).toBe(groups);
  });

  it('keeps every session in a group whose projectPath matches the needle', () => {
    const groups = [
      mkGroup({
        projectPath: '/home/user/myapp',
        sessions: [
          mkSession({ sessionId: 'unrelated-1', lastAssistantSnippet: 'foo' }),
          mkSession({ sessionId: 'unrelated-2', lastAssistantSnippet: 'bar' }),
        ],
      }),
    ];
    const { result } = renderHook(() =>
      useFilteredSessions({ groups, attached: [], query: 'myapp' }),
    );
    expect(result.current.filteredGroups).toHaveLength(1);
    expect(result.current.filteredGroups[0].sessions).toHaveLength(2);
  });

  it('keeps every session in a group whose projectDir matches the needle', () => {
    const groups = [
      mkGroup({
        projectDir: 'work-myapp',
        sessions: [
          mkSession({ sessionId: 'a' }),
          mkSession({ sessionId: 'b' }),
        ],
      }),
    ];
    const { result } = renderHook(() =>
      useFilteredSessions({ groups, attached: [], query: 'myapp' }),
    );
    expect(result.current.filteredGroups[0].sessions).toHaveLength(2);
  });

  it('keeps only sessions whose own fields match when the group has no project hit', () => {
    const groups = [
      mkGroup({
        projectPath: '/somewhere',
        projectDir: 'unrelated',
        sessions: [
          mkSession({ sessionId: 'sess-needle-1' }),
          mkSession({ sessionId: 'other-id', lastAssistantSnippet: 'hello needle world' }),
          mkSession({ sessionId: 'skip-me', lastAssistantSnippet: 'irrelevant' }),
        ],
      }),
    ];
    const { result } = renderHook(() =>
      useFilteredSessions({ groups, attached: [], query: 'needle' }),
    );
    expect(result.current.filteredGroups[0].sessions.map((s) => s.sessionId)).toEqual([
      'sess-needle-1',
      'other-id',
    ]);
  });

  it('drops a group entirely when no sessions match', () => {
    const groups = [
      mkGroup({
        projectPath: '/a',
        sessions: [mkSession({ sessionId: 'aaa' })],
      }),
      mkGroup({
        projectPath: '/b',
        sessions: [mkSession({ sessionId: 'bbb' })],
      }),
    ];
    const { result } = renderHook(() =>
      useFilteredSessions({ groups, attached: [], query: 'aaa' }),
    );
    expect(result.current.filteredGroups).toHaveLength(1);
    expect(result.current.filteredGroups[0].projectPath).toBe('/a');
  });

  it('matches case-insensitively across haystack and needle', () => {
    const groups = [
      mkGroup({
        projectPath: '/Repo/MyApp',
        sessions: [mkSession({ sessionId: 's1' })],
      }),
    ];
    const { result } = renderHook(() =>
      useFilteredSessions({ groups, attached: [], query: 'MYAPP' }),
    );
    expect(result.current.filteredGroups).toHaveLength(1);
  });

  it('tolerates null projectPath / projectDir / empty snippet without throwing', () => {
    const groups = [
      mkGroup({
        projectPath: null,
        projectDir: null,
        sessions: [
          mkSession({ sessionId: 'has-needle' }),
          mkSession({ sessionId: 'nope' }),
        ],
      }),
    ];
    const { result } = renderHook(() =>
      useFilteredSessions({ groups, attached: [], query: 'needle' }),
    );
    expect(result.current.filteredGroups[0].sessions.map((s) => s.sessionId)).toEqual([
      'has-needle',
    ]);
  });

  it('returns a new group object (not the same reference) when filtering shrinks the session list', () => {
    const group = mkGroup({
      projectPath: '/unrelated',
      sessions: [
        mkSession({ sessionId: 'needle' }),
        mkSession({ sessionId: 'skip' }),
      ],
    });
    const { result } = renderHook(() =>
      useFilteredSessions({ groups: [group], attached: [], query: 'needle' }),
    );
    expect(result.current.filteredGroups[0]).not.toBe(group);
    expect(result.current.filteredGroups[0].projectPath).toBe('/unrelated');
  });
});

describe('useFilteredSessions: totalFiltered', () => {
  it('sums sessions across all filtered groups', () => {
    const groups = [
      mkGroup({
        projectPath: '/match',
        sessions: [mkSession({ sessionId: 'a' }), mkSession({ sessionId: 'b' })],
      }),
      mkGroup({
        projectPath: '/match-2',
        sessions: [mkSession({ sessionId: 'c' })],
      }),
    ];
    const { result } = renderHook(() =>
      useFilteredSessions({ groups, attached: [], query: 'match' }),
    );
    expect(result.current.totalFiltered).toBe(3);
  });

  it('is 0 when no groups match', () => {
    const groups = [
      mkGroup({ projectPath: '/a', sessions: [mkSession({ sessionId: 'x' })] }),
    ];
    const { result } = renderHook(() =>
      useFilteredSessions({ groups, attached: [], query: 'noooo' }),
    );
    expect(result.current.totalFiltered).toBe(0);
  });

  it('counts all sessions when the query is empty', () => {
    const groups = [
      mkGroup({ sessions: [mkSession(), mkSession()] }),
      mkGroup({ sessions: [mkSession()] }),
    ];
    const { result } = renderHook(() =>
      useFilteredSessions({ groups, attached: [], query: '' }),
    );
    expect(result.current.totalFiltered).toBe(3);
  });
});

describe('useFilteredSessions: filteredAttached', () => {
  it('returns the same attached reference when the query is empty', () => {
    const attached = [mkAttached({ name: 'a1' })];
    const { result } = renderHook(() =>
      useFilteredSessions({ groups: null, attached, query: '' }),
    );
    expect(result.current.filteredAttached).toBe(attached);
  });

  it('returns the same attached reference when the query is whitespace-only', () => {
    const attached = [mkAttached({ name: 'a1' })];
    const { result } = renderHook(() =>
      useFilteredSessions({ groups: null, attached, query: '  \t  ' }),
    );
    expect(result.current.filteredAttached).toBe(attached);
  });

  it('matches on name', () => {
    const attached = [
      mkAttached({ name: 'c4-mgr-alpha' }),
      mkAttached({ name: 'c4-mgr-beta' }),
      mkAttached({ name: 'unrelated' }),
    ];
    const { result } = renderHook(() =>
      useFilteredSessions({ groups: null, attached, query: 'alpha' }),
    );
    expect(result.current.filteredAttached.map((a) => a.name)).toEqual(['c4-mgr-alpha']);
  });

  it('matches on sessionId', () => {
    const attached = [
      mkAttached({ name: 'a', sessionId: 'sess-foo' }),
      mkAttached({ name: 'b', sessionId: 'sess-bar' }),
    ];
    const { result } = renderHook(() =>
      useFilteredSessions({ groups: null, attached, query: 'foo' }),
    );
    expect(result.current.filteredAttached.map((a) => a.name)).toEqual(['a']);
  });

  it('matches on projectPath', () => {
    const attached = [
      mkAttached({ name: 'a', projectPath: '/home/user/myapp' }),
      mkAttached({ name: 'b', projectPath: '/etc' }),
    ];
    const { result } = renderHook(() =>
      useFilteredSessions({ groups: null, attached, query: 'myapp' }),
    );
    expect(result.current.filteredAttached.map((a) => a.name)).toEqual(['a']);
  });

  it('matches on jsonlPath', () => {
    const attached = [
      mkAttached({ name: 'a', jsonlPath: '/var/log/needle.jsonl' }),
      mkAttached({ name: 'b', jsonlPath: '/var/log/other.jsonl' }),
    ];
    const { result } = renderHook(() =>
      useFilteredSessions({ groups: null, attached, query: 'needle' }),
    );
    expect(result.current.filteredAttached.map((a) => a.name)).toEqual(['a']);
  });

  it('is case-insensitive', () => {
    const attached = [mkAttached({ name: 'AlphaBETA' })];
    const { result } = renderHook(() =>
      useFilteredSessions({ groups: null, attached, query: 'BETA' }),
    );
    expect(result.current.filteredAttached).toHaveLength(1);
  });

  it('tolerates null sessionId / projectPath when filtering', () => {
    const attached = [
      mkAttached({ name: 'keeper', sessionId: null, projectPath: null }),
      mkAttached({ name: 'other', sessionId: null, projectPath: null }),
    ];
    const { result } = renderHook(() =>
      useFilteredSessions({ groups: null, attached, query: 'keep' }),
    );
    expect(result.current.filteredAttached.map((a) => a.name)).toEqual(['keeper']);
  });
});

describe('useFilteredSessions: memo stability', () => {
  it('returns the same filteredGroups across re-renders when inputs are unchanged', () => {
    const groups = [mkGroup({ projectPath: '/a', sessions: [mkSession()] })];
    const { result, rerender } = renderHook(
      ({ q }: { q: string }) =>
        useFilteredSessions({ groups, attached: [], query: q }),
      { initialProps: { q: 'a' } },
    );
    const first = result.current.filteredGroups;
    rerender({ q: 'a' });
    expect(result.current.filteredGroups).toBe(first);
  });
});
