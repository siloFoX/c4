import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { apiDelete, apiGet, apiPost } from '../lib/api';
import { Card, CardContent } from './ui';
import { t, tFormat, useLocale } from '../lib/i18n';
import ConversationView from './ConversationView';
import SessionsTour from './SessionsTour';
import NewChatModal from './NewChatModal';
import AttachModal from './AttachModal';
import SessionsComparisonCard from './SessionsComparisonCard';
import SessionsAttachedSection from './SessionsAttachedSection';
import SessionsListSection from './SessionsListSection';
import SessionsHeader from './SessionsHeader';
import SessionsEmptyPanel from './SessionsEmptyPanel';

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
//
// (TODO 8.38) `role` is sniffed at attach-time from the JSONL prelude
// (manager / planner / executor / reviewer) or path-pattern (c4-mgr-*
// -> manager, c4-worktree-* -> worker). 'generic' covers everything
// else. Pre-8.38 attached.json records may lack role; the daemon
// re-derives it on `attach.list` reads.
export type AttachedRole =
  | 'manager'
  | 'worker'
  | 'planner'
  | 'executor'
  | 'reviewer'
  | 'generic';

export interface AttachedSession {
  name: string;
  jsonlPath: string;
  sessionId: string | null;
  projectPath: string | null;
  createdAt: string | null;
  lastOffset: number;
  role?: AttachedRole;
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

// (8.31, v1.10.475) UX strings migrated to i18n keys. Tests now
// source-grep against the *Key constants instead of literal copy
// (see tests/sessions-view.test.js).
export const EMPTY_ATTACH_BANNER_TITLE_KEY = 'sessions.banner.emptyTitle';
export const EMPTY_ATTACH_BANNER_BODY_KEY = 'sessions.banner.emptyBody';
export const POST_ATTACH_HELP_TITLE_KEY = 'sessions.help.afterAttachTitle';
export const POST_ATTACH_HELP_ITEM_KEYS = [
  'sessions.help.timeline',
  'sessions.help.search',
  'sessions.help.resume',
];
export const COMPARISON_TITLE_KEY = 'sessions.compare.title';
export const COMPARISON_ROW_KEYS: Array<[string, string, string]> = [
  ['sessions.compare.modeLabel', 'sessions.compare.modeAttached', 'sessions.compare.modeLive'],
  ['sessions.compare.sourceLabel', 'sessions.compare.sourceAttached', 'sessions.compare.sourceLive'],
  ['sessions.compare.updatesLabel', 'sessions.compare.updatesAttached', 'sessions.compare.updatesLive'],
  ['sessions.compare.resumeLabel', 'sessions.compare.resumeAttached', 'sessions.compare.resumeLive'],
];
export const TOUR_STORAGE_KEY = 'sessions-tour-v1';
export const TOUR_STEPS: Array<{ titleKey: string; bodyKey: string }> = [
  { titleKey: 'sessions.tour.welcome.title', bodyKey: 'sessions.tour.welcome.body' },
  { titleKey: 'sessions.tour.attach.title',  bodyKey: 'sessions.tour.attach.body' },
  { titleKey: 'sessions.tour.view.title',    bodyKey: 'sessions.tour.view.body' },
];

export function formatRelative(iso: string | null): string {
  if (!iso) return '';
  const ts = new Date(iso).getTime();
  if (!Number.isFinite(ts)) return '';
  const diff = Date.now() - ts;
  if (diff < 60_000) return t('sessions.relative.justNow');
  if (diff < 3_600_000) return tFormat('sessions.relative.minutes', { n: Math.floor(diff / 60_000) });
  if (diff < 86_400_000) return tFormat('sessions.relative.hours', { n: Math.floor(diff / 3_600_000) });
  if (diff < 604_800_000) return tFormat('sessions.relative.days', { n: Math.floor(diff / 86_400_000) });
  return new Date(iso).toLocaleDateString();
}

export function shortId(sessionId: string | null): string {
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

// (v1.10.540) AttachModal extracted to ./AttachModal.tsx — uses
// formatRelative + shortId + POST_ATTACH_HELP_* exports below.

// (v1.10.539) NewChatModal extracted to ./NewChatModal.tsx
// (along with MODEL_CHOICES + AGENT_CHOICES constants).

// (v1.10.549) EmptyAttachBanner extracted to
// ./SessionsEmptyAttachBanner.tsx and ComparisonCard extracted
// to ./SessionsComparisonCard.tsx.

// (v1.10.530) Tour extracted to ./SessionsTour.tsx

// (v1.10.550) AttachedRowActions extracted to
// ./SessionsAttachedRowActions.tsx along with the
// `copyToClipboard` + `attachedRoleStyle` helpers + the
// `AttachProcessState` type it owned.

export default function SessionsView() {
  useLocale();
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
  // (TODO 8.39) New Chat modal state — separate from Attach so the
  // two flows don't fight each other when both are wired.
  const [newChatOpen, setNewChatOpen] = useState(false);
  const [newChatBusy, setNewChatBusy] = useState(false);
  const [newChatError, setNewChatError] = useState<string | null>(null);
  const [showTour, setShowTour] = useState(false);
  const tourChecked = useRef(false);

  useEffect(() => {
    if (tourChecked.current) return;
    tourChecked.current = true;
    try {
      const done = window.localStorage.getItem(TOUR_STORAGE_KEY);
      if (!done) setShowTour(true);
    } catch {
      // localStorage can throw in private modes; skip tour silently.
    }
  }, []);

  const dismissTour = useCallback(() => {
    setShowTour(false);
    try {
      window.localStorage.setItem(TOUR_STORAGE_KEY, 'done');
    } catch {
      // non-fatal
    }
  }, []);

  const refreshSessions = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const resp = await apiGet<SessionsResponse>('/api/sessions');
      setData(resp);
      setSelection((prev) => {
        if (prev) return prev;
        const first = resp.sessions[0];
        if (first) {
          return { kind: 'session', id: first.sessionId };
        }
        return null;
      });
    } catch (err) {
      setError((err as Error).message || t('common.failedToLoadSessions'));
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
      setAttachError((err as Error).message || t('common.failedToLoadAttachments'));
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
      if (nameValue) body['name'] = nameValue;
      try {
        const resp = await apiPost<AttachResponse>('/api/attach', body);
        setModalOpen(false);
        await refreshAttached();
        if (resp && resp.name) {
          setSelection({ kind: 'attached', name: resp.name });
        }
      } catch (err) {
        setModalError((err as Error).message || t('common.attachFailed'));
      } finally {
        setModalBusy(false);
      }
    },
    [refreshAttached],
  );

  // (TODO 8.39) New Chat — POST /api/task with no name. The daemon
  // auto-generates a worker name from the prompt's first words, spawns
  // a worker (default command 'claude'), and queues the task. The
  // worker's JSONL session takes a moment to appear in /api/sessions
  // (Claude Code writes it on first response), so we refresh after a
  // short delay and rely on the user re-pulling if needed.
  const handleNewChatSubmit = useCallback(
    async (req: { prompt: string; model: string; agent: string }) => {
      setNewChatBusy(true);
      setNewChatError(null);
      const body: Record<string, unknown> = {
        task: req.prompt,
        autoMode: false,
      };
      if (req.model && req.model !== 'default') body['model'] = req.model;
      // 'agent' currently maps to a profile name; 'generic' = no profile.
      // Manager-style auto orchestration goes through POST /api/auto in a
      // follow-up — for now the modal stays focused on plain chat spawns.
      if (req.agent && req.agent !== 'generic') body['profile'] = req.agent;
      try {
        const resp = await apiPost<{ name?: string; error?: string }>(
          '/api/task',
          body,
        );
        if (resp && resp.error) {
          setNewChatError(resp.error);
          return;
        }
        setNewChatOpen(false);
        // Refresh both lists; the new session JSONL may take a beat to
        // appear, so a follow-up manual refresh is fine if it doesn't
        // show up on the first poll.
        await Promise.all([refreshSessions(), refreshAttached()]);
      } catch (err) {
        setNewChatError((err as Error).message || t('common.failedToStartNewChat'));
      } finally {
        setNewChatBusy(false);
      }
    },
    [refreshSessions, refreshAttached],
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
        setAttachError((err as Error).message || t('common.detachFailed'));
      }
    },
    [refreshAttached],
  );

  const selectedSessionId =
    selection && selection.kind === 'session' ? selection.id : null;
  const selectedAttachmentName =
    selection && selection.kind === 'attached' ? selection.name : null;

  const availableSessions = data?.sessions ?? [];

  return (
    <div className="flex w-full min-h-0 flex-1 flex-col gap-3 p-3 md:flex-row md:p-6">
      <Card className="flex w-full min-h-0 flex-col md:w-80 lg:w-96">
        {/* (v1.10.584) Card header extracted to ./SessionsHeader.tsx. */}
        <SessionsHeader
          query={query}
          onQuery={setQuery}
          totalFiltered={totalFiltered}
          total={data?.total ?? 0}
          loading={loading}
          onNewChat={() => {
            setNewChatError(null);
            setNewChatOpen(true);
          }}
          onAttachNew={() => {
            setModalError(null);
            setModalOpen(true);
          }}
          onRefresh={() => {
            refreshSessions();
            refreshAttached();
          }}
        />
        <CardContent className="flex-1 overflow-y-auto p-0">
          {/* (v1.10.578) Attached section extracted to ./SessionsAttachedSection.tsx */}
          <SessionsAttachedSection
            collapsed={attachedCollapsed}
            onToggle={() => setAttachedCollapsed((v) => !v)}
            filtered={filteredAttached}
            error={attachError}
            selectedName={selectedAttachmentName}
            onSelect={(name) => setSelection({ kind: 'attached', name })}
            onAttachClick={() => {
              setModalError(null);
              setModalOpen(true);
            }}
            onDetach={handleDetach}
          />

          {/* (v1.10.579) Sessions list section extracted to ./SessionsListSection.tsx */}
          <SessionsListSection
            filteredGroups={filteredGroups}
            error={error}
            loading={loading}
            collapsed={collapsed}
            onToggleGroup={(key) => setCollapsed((prev) => ({ ...prev, [key]: !prev[key] }))}
            selectedSessionId={selectedSessionId}
            onSelect={(id) => setSelection({ kind: 'session', id })}
          />
        </CardContent>
      </Card>

      <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-3">
        {selection && selection.kind === 'session' ? (
          <ConversationView
            key={`session-${selection.id}`}
            sessionId={selection.id}
            live={false}
            className="flex-1"
          />
        ) : selection && selection.kind === 'attached' ? (
          <>
            <ConversationView
              key={`attached-${selection.name}`}
              sessionId={selection.name}
              live
              snapshotUrl={`/api/attach/${encodeURIComponent(selection.name)}/conversation`}
              streamUrl={`/api/attach/${encodeURIComponent(selection.name)}/tail?live=1`}
              className="flex-1"
            />
            <SessionsComparisonCard className="self-end" />
          </>
        ) : (
          // (v1.10.601) Right-pane empty state extracted to
          // ./SessionsEmptyPanel.tsx.
          <SessionsEmptyPanel
            showStartFirst={filteredGroups.length === 0 && filteredAttached.length === 0 && !loading}
            onNewChat={() => {
              setNewChatError(null);
              setNewChatOpen(true);
            }}
            onAttachNew={() => {
              setModalError(null);
              setModalOpen(true);
            }}
          />
        )}
      </div>

      <AttachModal
        open={modalOpen}
        busy={modalBusy}
        error={modalError}
        available={availableSessions}
        onClose={() => setModalOpen(false)}
        onSubmit={handleAttachSubmit}
      />

      <NewChatModal
        open={newChatOpen}
        busy={newChatBusy}
        error={newChatError}
        onClose={() => setNewChatOpen(false)}
        onSubmit={handleNewChatSubmit}
      />

      {showTour ? <SessionsTour onDismiss={dismissTour} /> : null}
    </div>
  );
}
