import { useMemo } from 'react';
import type { AttachedSession, SessionGroup } from '../components/SessionsView';

// (v1.10.681) Extracted from SessionsView. Bundles the
// three filter memos that compose the search query
// against the session groups + the attached-session
// list. The two helpers (groupMatchesQuery /
// attachedMatchesQuery) stay private to this module
// since they have no consumer outside the filter
// pipeline.

function groupMatchesQuery(group: SessionGroup, q: string): SessionGroup | null {
  if (!q) return group;
  const needle = q.toLowerCase();
  const projectHit =
    (group.projectPath || '').toLowerCase().includes(needle) ||
    (group.projectDir || '').toLowerCase().includes(needle);
  const filteredSessions = group.sessions.filter((s) => {
    const hay = `${s.sessionId} ${s.lastAssistantSnippet || ''} ${s.projectPath || ''}`.toLowerCase();
    return projectHit || hay.includes(needle);
  });
  if (filteredSessions.length === 0) return null;
  return { ...group, sessions: filteredSessions };
}

function attachedMatchesQuery(a: AttachedSession, q: string): boolean {
  if (!q) return true;
  const needle = q.toLowerCase();
  const hay = `${a.name} ${a.sessionId || ''} ${a.projectPath || ''} ${a.jsonlPath}`.toLowerCase();
  return hay.includes(needle);
}

interface FilteredSessionsState {
  filteredGroups: SessionGroup[];
  totalFiltered: number;
  filteredAttached: AttachedSession[];
}

export function useFilteredSessions(args: {
  groups: SessionGroup[] | null;
  attached: AttachedSession[];
  query: string;
}): FilteredSessionsState {
  const { groups, attached, query } = args;

  const filteredGroups = useMemo<SessionGroup[]>(() => {
    if (!groups) return [];
    const q = query.trim();
    if (!q) return groups;
    const out: SessionGroup[] = [];
    for (const g of groups) {
      const keep = groupMatchesQuery(g, q);
      if (keep) out.push(keep);
    }
    return out;
  }, [groups, query]);

  const totalFiltered = useMemo(
    () => filteredGroups.reduce((acc, g) => acc + g.sessions.length, 0),
    [filteredGroups],
  );

  const filteredAttached = useMemo<AttachedSession[]>(() => {
    const q = query.trim();
    if (!q) return attached;
    return attached.filter((a) => attachedMatchesQuery(a, q));
  }, [attached, query]);

  return { filteredGroups, totalFiltered, filteredAttached };
}
