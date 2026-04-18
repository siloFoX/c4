import { useCallback, useEffect, useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, FolderTree, Search } from 'lucide-react';
import { apiGet } from '../lib/api';
import { Badge, Button, Card, CardContent, CardHeader, CardTitle, Input } from './ui';
import { cn } from '../lib/cn';
import ConversationView from './ConversationView';

export interface SessionSummary {
  projectDir: string | null;
  projectPath: string | null;
  sessionId: string;
  path: string;
  updatedAt: string | null;
  size: number;
  turnCount: number;
  lastAssistantSnippet: string;
}

export interface SessionGroup {
  projectPath: string | null;
  projectDir: string | null;
  sessions: SessionSummary[];
  updatedAt: string | null;
}

interface SessionsResponse {
  rootDir: string;
  sessions: SessionSummary[];
  groups: SessionGroup[];
  total: number;
}

function formatRelative(iso: string | null): string {
  if (!iso) return '';
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return '';
  const diff = Date.now() - t;
  if (diff < 60_000) return 'just now';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  if (diff < 604_800_000) return `${Math.floor(diff / 86_400_000)}d ago`;
  return new Date(iso).toLocaleDateString();
}

function shortId(sessionId: string): string {
  if (sessionId.length <= 12) return sessionId;
  return `${sessionId.slice(0, 8)}...${sessionId.slice(-4)}`;
}

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

export default function SessionsView() {
  const [data, setData] = useState<SessionsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const resp = await apiGet<SessionsResponse>('/api/sessions');
      setData(resp);
      if (!selectedId && resp.sessions.length > 0) {
        setSelectedId(resp.sessions[0].sessionId);
      }
    } catch (err) {
      setError((err as Error).message || 'Failed to load sessions');
    } finally {
      setLoading(false);
    }
  }, [selectedId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const filteredGroups = useMemo<SessionGroup[]>(() => {
    if (!data) return [];
    const q = query.trim();
    if (!q) return data.groups;
    const out: SessionGroup[] = [];
    for (const g of data.groups) {
      const keep = groupMatchesQuery(g, q);
      if (keep) out.push(keep);
    }
    return out;
  }, [data, query]);

  const totalFiltered = useMemo(
    () => filteredGroups.reduce((acc, g) => acc + g.sessions.length, 0),
    [filteredGroups],
  );

  return (
    <div className="flex w-full min-h-0 flex-1 flex-col gap-3 p-3 md:flex-row md:p-6">
      <Card className="flex w-full min-h-0 flex-col md:w-80 lg:w-96">
        <CardHeader className="gap-2 border-b border-border p-4">
          <CardTitle className="flex items-center gap-2 text-base">
            <FolderTree className="h-4 w-4" aria-hidden /> Sessions
          </CardTitle>
          <div className="relative">
            <Search
              className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground"
              aria-hidden
            />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search project / snippet"
              aria-label="Search sessions"
              className="h-8 pl-7 text-sm"
            />
          </div>
          <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
            <span>
              {totalFiltered}/{data?.total ?? 0}
            </span>
            <Button size="sm" variant="outline" onClick={refresh} disabled={loading}>
              {loading ? 'Loading...' : 'Refresh'}
            </Button>
          </div>
        </CardHeader>
        <CardContent className="flex-1 overflow-y-auto p-0">
          {error ? (
            <div className="p-4 text-sm text-destructive">{error}</div>
          ) : filteredGroups.length === 0 ? (
            <div className="p-4 text-sm text-muted-foreground">
              {loading ? 'Loading sessions...' : 'No sessions found.'}
            </div>
          ) : (
            <ul className="divide-y divide-border">
              {filteredGroups.map((group) => {
                const key = group.projectDir || group.projectPath || 'unknown';
                const isCollapsed = Boolean(collapsed[key]);
                return (
                  <li key={key} className="bg-card">
                    <button
                      type="button"
                      className="flex w-full items-center gap-2 px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                      onClick={() =>
                        setCollapsed((prev) => ({ ...prev, [key]: !prev[key] }))
                      }
                      aria-expanded={!isCollapsed}
                    >
                      {isCollapsed ? (
                        <ChevronRight className="h-3.5 w-3.5" aria-hidden />
                      ) : (
                        <ChevronDown className="h-3.5 w-3.5" aria-hidden />
                      )}
                      <span className="truncate normal-case text-foreground">
                        {group.projectPath || group.projectDir || 'unknown'}
                      </span>
                      <span className="ml-auto rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground">
                        {group.sessions.length}
                      </span>
                    </button>
                    {!isCollapsed
                      ? group.sessions.map((session) => {
                          const active = session.sessionId === selectedId;
                          return (
                            <button
                              key={session.sessionId}
                              type="button"
                              onClick={() => setSelectedId(session.sessionId)}
                              aria-current={active ? 'true' : undefined}
                              className={cn(
                                'block w-full px-4 py-3 text-left text-sm transition-colors',
                                active
                                  ? 'bg-accent text-accent-foreground'
                                  : 'hover:bg-accent/60',
                              )}
                            >
                              <div className="flex items-center gap-2">
                                <span className="font-mono text-xs text-muted-foreground">
                                  {shortId(session.sessionId)}
                                </span>
                                <Badge variant="secondary" className="ml-auto">
                                  {session.turnCount}
                                </Badge>
                              </div>
                              {session.lastAssistantSnippet ? (
                                <div className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                                  {session.lastAssistantSnippet}
                                </div>
                              ) : null}
                              <div className="mt-1 text-[11px] text-muted-foreground">
                                {formatRelative(session.updatedAt)}
                              </div>
                            </button>
                          );
                        })
                      : null}
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>

      <div className="flex min-h-0 min-w-0 flex-1">
        {selectedId ? (
          <ConversationView
            key={selectedId}
            sessionId={selectedId}
            live={false}
            className="flex-1"
          />
        ) : (
          <Card className="flex flex-1 items-center justify-center border-dashed">
            <CardContent className="p-6 text-center text-sm text-muted-foreground">
              Select a session to view the conversation.
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
