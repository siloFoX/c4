import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ChevronDown,
  ChevronRight,
  FolderTree,
  Link2,
  Plus,
  Search,
  Trash2,
  X,
} from 'lucide-react';
import { apiDelete, apiGet, apiPost } from '../lib/api';
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

// (8.17) Attached session record shape - mirrors the persisted form on
// the daemon side (~/.c4/attached.json). The Web UI is read-only aside
// from the attach/detach affordances below.
export interface AttachedSession {
  name: string;
  jsonlPath: string;
  sessionId: string | null;
  projectPath: string | null;
  createdAt: string | null;
  lastOffset: number;
}

interface AttachedListResponse {
  sessions: AttachedSession[];
  total: number;
}

interface AttachResponse {
  name: string;
  sessionId: string | null;
  projectPath: string | null;
  jsonlPath: string;
  turns: number;
  tokens: { input: number; output: number };
  model?: string | null;
  warnings?: number;
}

// Discriminated union so the detail pane knows which endpoint to
// hit. `kind: 'session'` means the sessionId comes from the 8.18
// sessions list; `kind: 'attached'` means the name is a registered
// attachment and ConversationView should load it from /api/attach.
type Selection =
  | { kind: 'session'; id: string }
  | { kind: 'attached'; name: string };

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

function shortId(sessionId: string | null): string {
  if (!sessionId) return '-';
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

function attachedMatchesQuery(a: AttachedSession, q: string): boolean {
  if (!q) return true;
  const needle = q.toLowerCase();
  const hay = `${a.name} ${a.sessionId || ''} ${a.projectPath || ''} ${a.jsonlPath}`.toLowerCase();
  return hay.includes(needle);
}

interface AttachModalProps {
  open: boolean;
  busy: boolean;
  error: string | null;
  onClose: () => void;
  onSubmit: (path: string, name: string) => void;
}

function AttachModal({ open, busy, error, onClose, onSubmit }: AttachModalProps) {
  const [pathValue, setPathValue] = useState('');
  const [nameValue, setNameValue] = useState('');
  useEffect(() => {
    if (!open) {
      setPathValue('');
      setNameValue('');
    }
  }, [open]);
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      role="dialog"
      aria-modal="true"
    >
      <Card className="w-full max-w-md">
        <CardHeader className="flex flex-row items-center justify-between gap-2 border-b border-border p-4">
          <CardTitle className="flex items-center gap-2 text-base">
            <Link2 className="h-4 w-4" aria-hidden /> Attach session
          </CardTitle>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-accent-foreground"
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 p-4">
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-xs font-medium text-muted-foreground">
              JSONL path or session UUID
            </span>
            <Input
              value={pathValue}
              onChange={(e) => setPathValue(e.target.value)}
              placeholder="/abs/path/session.jsonl or 1234-... uuid"
              autoFocus
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-xs font-medium text-muted-foreground">
              Alias (optional)
            </span>
            <Input
              value={nameValue}
              onChange={(e) => setNameValue(e.target.value)}
              placeholder="leave blank to auto-generate"
            />
          </label>
          {error ? (
            <div className="text-sm text-destructive" role="alert">
              {error}
            </div>
          ) : null}
          <div className="flex justify-end gap-2 pt-2">
            <Button size="sm" variant="outline" onClick={onClose} disabled={busy}>
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={() => onSubmit(pathValue.trim(), nameValue.trim())}
              disabled={busy || !pathValue.trim()}
            >
              {busy ? 'Attaching...' : 'Attach'}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export default function SessionsView() {
  const [data, setData] = useState<SessionsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [selection, setSelection] = useState<Selection | null>(null);
  const [query, setQuery] = useState('');
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  // Attached-session state lives here so the refresh affordances can
  // invalidate both lists at the same time after a successful attach.
  const [attached, setAttached] = useState<AttachedSession[]>([]);
  const [attachError, setAttachError] = useState<string | null>(null);
  const [attachedCollapsed, setAttachedCollapsed] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [modalBusy, setModalBusy] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);

  const refreshSessions = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const resp = await apiGet<SessionsResponse>('/api/sessions');
      setData(resp);
      setSelection((prev) => {
        if (prev) return prev;
        if (resp.sessions.length > 0) {
          return { kind: 'session', id: resp.sessions[0].sessionId };
        }
        return null;
      });
    } catch (err) {
      setError((err as Error).message || 'Failed to load sessions');
    } finally {
      setLoading(false);
    }
  }, []);

  const refreshAttached = useCallback(async () => {
    setAttachError(null);
    try {
      const resp = await apiGet<AttachedListResponse>('/api/attach/list');
      setAttached(Array.isArray(resp.sessions) ? resp.sessions : []);
    } catch (err) {
      setAttachError((err as Error).message || 'Failed to load attachments');
    }
  }, []);

  useEffect(() => {
    refreshSessions();
    refreshAttached();
  }, [refreshSessions, refreshAttached]);

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

  const filteredAttached = useMemo<AttachedSession[]>(() => {
    const q = query.trim();
    if (!q) return attached;
    return attached.filter((a) => attachedMatchesQuery(a, q));
  }, [attached, query]);

  const handleAttachSubmit = useCallback(
    async (pathValue: string, nameValue: string) => {
      setModalBusy(true);
      setModalError(null);
      const looksLikePath =
        pathValue.endsWith('.jsonl') ||
        pathValue.includes('/') ||
        pathValue.includes('\\');
      const body: Record<string, string> = looksLikePath
        ? { path: pathValue }
        : { sessionId: pathValue };
      if (nameValue) body.name = nameValue;
      try {
        const resp = await apiPost<AttachResponse>('/api/attach', body);
        setModalOpen(false);
        await refreshAttached();
        if (resp && resp.name) {
          setSelection({ kind: 'attached', name: resp.name });
        }
      } catch (err) {
        setModalError((err as Error).message || 'Attach failed');
      } finally {
        setModalBusy(false);
      }
    },
    [refreshAttached],
  );

  const handleDetach = useCallback(
    async (name: string) => {
      try {
        await apiDelete(`/api/attach/${encodeURIComponent(name)}`);
        setSelection((prev) =>
          prev && prev.kind === 'attached' && prev.name === name ? null : prev,
        );
        await refreshAttached();
      } catch (err) {
        setAttachError((err as Error).message || 'Detach failed');
      }
    },
    [refreshAttached],
  );

  const selectedSessionId =
    selection && selection.kind === 'session' ? selection.id : null;
  const selectedAttachmentName =
    selection && selection.kind === 'attached' ? selection.name : null;

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
            <div className="flex items-center gap-1">
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  setModalError(null);
                  setModalOpen(true);
                }}
              >
                <Plus className="mr-1 h-3.5 w-3.5" aria-hidden /> Attach new...
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  refreshSessions();
                  refreshAttached();
                }}
                disabled={loading}
              >
                {loading ? 'Loading...' : 'Refresh'}
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="flex-1 overflow-y-auto p-0">
          <div className="border-b border-border">
            <button
              type="button"
              className="flex w-full items-center gap-2 bg-muted/40 px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground hover:bg-accent hover:text-accent-foreground"
              onClick={() => setAttachedCollapsed((v) => !v)}
              aria-expanded={!attachedCollapsed}
            >
              {attachedCollapsed ? (
                <ChevronRight className="h-3.5 w-3.5" aria-hidden />
              ) : (
                <ChevronDown className="h-3.5 w-3.5" aria-hidden />
              )}
              <Link2 className="h-3.5 w-3.5" aria-hidden />
              <span className="normal-case text-foreground">Attached</span>
              <span className="ml-auto rounded-full bg-background px-2 py-0.5 text-[10px] text-muted-foreground">
                {filteredAttached.length}
              </span>
            </button>
            {!attachedCollapsed ? (
              attachError ? (
                <div className="p-4 text-sm text-destructive">{attachError}</div>
              ) : filteredAttached.length === 0 ? (
                <div className="px-4 py-3 text-xs text-muted-foreground">
                  No attached sessions. Use "Attach new..." to import an external
                  JSONL.
                </div>
              ) : (
                <ul className="divide-y divide-border">
                  {filteredAttached.map((a) => {
                    const active = selectedAttachmentName === a.name;
                    return (
                      <li key={a.name} className="bg-card">
                        <div
                          className={cn(
                            'flex items-start gap-2 px-4 py-3 text-left text-sm',
                            active
                              ? 'bg-accent text-accent-foreground'
                              : 'hover:bg-accent/60',
                          )}
                        >
                          <button
                            type="button"
                            onClick={() =>
                              setSelection({ kind: 'attached', name: a.name })
                            }
                            aria-current={active ? 'true' : undefined}
                            className="flex-1 text-left"
                          >
                            <div className="flex items-center gap-2">
                              <span className="font-mono text-xs">
                                {a.name}
                              </span>
                              <Badge variant="secondary" className="ml-auto">
                                attached
                              </Badge>
                            </div>
                            <div className="mt-1 truncate text-xs text-muted-foreground">
                              {a.projectPath || a.jsonlPath}
                            </div>
                            <div className="mt-1 flex items-center gap-2 text-[11px] text-muted-foreground">
                              <span>{shortId(a.sessionId)}</span>
                              {a.createdAt ? (
                                <span>· {formatRelative(a.createdAt)}</span>
                              ) : null}
                            </div>
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDetach(a.name)}
                            aria-label={`Detach ${a.name}`}
                            className="rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                          >
                            <Trash2 className="h-3.5 w-3.5" aria-hidden />
                          </button>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )
            ) : null}
          </div>

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
                          const active =
                            selectedSessionId === session.sessionId;
                          return (
                            <button
                              key={session.sessionId}
                              type="button"
                              onClick={() =>
                                setSelection({
                                  kind: 'session',
                                  id: session.sessionId,
                                })
                              }
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
        {selection && selection.kind === 'session' ? (
          <ConversationView
            key={`session-${selection.id}`}
            sessionId={selection.id}
            live={false}
            className="flex-1"
          />
        ) : selection && selection.kind === 'attached' ? (
          <ConversationView
            key={`attached-${selection.name}`}
            sessionId={selection.name}
            live={false}
            snapshotUrl={`/api/attach/${encodeURIComponent(selection.name)}/conversation`}
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

      <AttachModal
        open={modalOpen}
        busy={modalBusy}
        error={modalError}
        onClose={() => setModalOpen(false)}
        onSubmit={handleAttachSubmit}
      />
    </div>
  );
}
