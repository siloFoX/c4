import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  BookOpen,
  ChevronDown,
  ChevronRight,
  Copy,
  Eye,
  FolderTree,
  Info,
  Link2,
  Plus,
  Search,
  Terminal,
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

// (8.31) UX strings — kept as module constants so tests source-grep
// against stable literals. Changing copy here must flow through
// tests/sessions-view.test.js.
export const EMPTY_ATTACH_BANNER_TITLE = 'What is attach?';
export const EMPTY_ATTACH_BANNER_BODY =
  'Import external Claude Code sessions (~/.claude/projects/*.jsonl) to view conversation history in c4 Web UI.';
export const POST_ATTACH_HELP_TITLE = 'After attach you can:';
export const POST_ATTACH_HELP_ITEMS = [
  'view full conversation timeline',
  'search messages across sessions',
  'resume the session via claude --resume',
];
export const COMPARISON_TITLE = 'Attached session vs Live worker';
export const COMPARISON_ROWS: Array<[string, string, string]> = [
  ['Mode', 'Read-only view', 'Interactive PTY'],
  ['Source', 'JSONL transcript', 'Live pty stream'],
  ['Updates', 'Re-parse on refresh', 'Real-time SSE'],
  ['Resume', 'claude --resume <id>', 'Already running'],
];
export const TOUR_STORAGE_KEY = 'sessions-tour-v1';
export const TOUR_STEPS: Array<{ title: string; body: string }> = [
  {
    title: 'Welcome to Sessions',
    body: 'Browse past Claude Code conversations recorded under ~/.claude/projects.',
  },
  {
    title: 'Attach external sessions',
    body: 'Click "Attach new..." to pin a JSONL transcript so it shows up in this tab.',
  },
  {
    title: 'View or resume',
    body: 'Open an attached row to read the timeline, or copy the claude --resume command to pick it back up.',
  },
];

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

function copyToClipboard(text: string): Promise<void> {
  if (typeof navigator !== 'undefined' && navigator.clipboard) {
    return navigator.clipboard.writeText(text);
  }
  return Promise.resolve();
}

interface AttachModalProps {
  open: boolean;
  busy: boolean;
  error: string | null;
  available: SessionSummary[];
  onClose: () => void;
  onSubmit: (path: string, name: string) => void;
}

function AttachModal({
  open,
  busy,
  error,
  available,
  onClose,
  onSubmit,
}: AttachModalProps) {
  const [pathValue, setPathValue] = useState('');
  const [nameValue, setNameValue] = useState('');
  useEffect(() => {
    if (!open) {
      setPathValue('');
      setNameValue('');
    }
  }, [open]);
  if (!open) return null;
  const preview = available.slice(0, 10);
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      role="dialog"
      aria-modal="true"
    >
      <Card className="w-full max-w-2xl">
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
        <CardContent className="flex flex-col gap-4 p-4">
          <p className="text-xs text-muted-foreground">
            Paste an absolute JSONL path or a session UUID. Attach is pointer-only —
            the original transcript is never copied or modified.
          </p>

          {preview.length > 0 ? (
            <section
              className="rounded-md border border-border bg-muted/40"
              aria-label="Available sessions preview"
            >
              <header className="flex items-center justify-between border-b border-border px-3 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                <span>Available sessions</span>
                <span>{available.length} found</span>
              </header>
              <ul className="max-h-48 divide-y divide-border overflow-y-auto">
                {preview.map((s) => (
                  <li key={s.sessionId} className="px-3 py-2 text-xs">
                    <div className="flex items-center gap-2">
                      <span className="truncate font-medium text-foreground">
                        {s.projectPath || s.projectDir || 'unknown project'}
                      </span>
                      <span className="ml-auto text-muted-foreground">
                        {formatRelative(s.updatedAt)}
                      </span>
                      <Badge variant="secondary">{s.turnCount} msgs</Badge>
                    </div>
                    <div className="mt-1 flex items-center gap-2 text-[11px] text-muted-foreground">
                      <span className="font-mono">{shortId(s.sessionId)}</span>
                      {s.lastAssistantSnippet ? (
                        <span className="truncate">- {s.lastAssistantSnippet}</span>
                      ) : null}
                    </div>
                    <div className="mt-1 flex justify-end">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setPathValue(s.sessionId)}
                      >
                        Use this id
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

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

          <aside
            className="rounded-md border border-dashed border-border bg-background/60 p-3 text-xs text-muted-foreground"
            aria-label="Post-attach help"
          >
            <div className="mb-1 font-semibold text-foreground">
              {POST_ATTACH_HELP_TITLE}
            </div>
            <ul className="list-disc pl-5">
              {POST_ATTACH_HELP_ITEMS.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </aside>

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

interface EmptyAttachBannerProps {
  onAttachClick: () => void;
}

function EmptyAttachBanner({ onAttachClick }: EmptyAttachBannerProps) {
  return (
    <div
      className="flex items-start gap-2 rounded-md border border-dashed border-border bg-muted/30 p-3 text-xs"
      role="note"
      aria-label="Attach introduction"
    >
      <Info
        className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground"
        aria-hidden
      />
      <div className="flex-1">
        <div className="font-semibold text-foreground">
          {EMPTY_ATTACH_BANNER_TITLE}
        </div>
        <p className="mt-1 text-muted-foreground">{EMPTY_ATTACH_BANNER_BODY}</p>
        <Button
          size="sm"
          variant="outline"
          className="mt-2"
          onClick={onAttachClick}
        >
          <Plus className="mr-1 h-3.5 w-3.5" aria-hidden />
          Attach your first session
        </Button>
      </div>
    </div>
  );
}

interface ComparisonCardProps {
  className?: string;
}

function ComparisonCard({ className }: ComparisonCardProps) {
  return (
    <Card className={cn('max-w-md', className)}>
      <CardHeader className="gap-1 border-b border-border p-4">
        <CardTitle className="flex items-center gap-2 text-sm">
          <BookOpen className="h-4 w-4" aria-hidden /> {COMPARISON_TITLE}
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <table
          className="w-full text-left text-xs"
          aria-label="Attached vs Live comparison"
        >
          <thead>
            <tr className="border-b border-border text-[11px] uppercase tracking-wide text-muted-foreground">
              <th className="px-4 py-2 font-medium"></th>
              <th className="px-4 py-2 font-medium">Attached</th>
              <th className="px-4 py-2 font-medium">Live worker</th>
            </tr>
          </thead>
          <tbody>
            {COMPARISON_ROWS.map(([label, attached, live]) => (
              <tr key={label} className="border-b border-border last:border-b-0">
                <td className="px-4 py-2 font-medium text-muted-foreground">
                  {label}
                </td>
                <td className="px-4 py-2 text-foreground">{attached}</td>
                <td className="px-4 py-2 text-foreground">{live}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}

interface TourProps {
  onDismiss: () => void;
}

function Tour({ onDismiss }: TourProps) {
  const [step, setStep] = useState(0);
  const current = TOUR_STEPS[step];
  const last = step === TOUR_STEPS.length - 1;
  return (
    <div
      className="fixed inset-0 z-40 flex items-end justify-end bg-black/30 p-4 md:items-start md:p-6"
      role="dialog"
      aria-modal="true"
      aria-label="Sessions onboarding"
    >
      <Card className="w-full max-w-sm">
        <CardHeader className="gap-1 border-b border-border p-4">
          <CardTitle className="flex items-center justify-between text-sm">
            <span>
              {current.title}
              <span className="ml-2 text-xs font-normal text-muted-foreground">
                {step + 1}/{TOUR_STEPS.length}
              </span>
            </span>
            <button
              type="button"
              onClick={onDismiss}
              aria-label="Dismiss tour"
              className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-accent-foreground"
            >
              <X className="h-4 w-4" aria-hidden />
            </button>
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 p-4 text-sm">
          <p className="text-muted-foreground">{current.body}</p>
          <div className="flex items-center justify-between">
            <Button
              size="sm"
              variant="outline"
              onClick={onDismiss}
            >
              Skip tour
            </Button>
            {last ? (
              <Button size="sm" onClick={onDismiss}>
                Done
              </Button>
            ) : (
              <Button size="sm" onClick={() => setStep((s) => s + 1)}>
                Next
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// (TODO 8.38) Map an attached role to badge copy + token-backed
// styling. Manager gets the primary accent (matches WorkerList in
// 8.37); Worker / Planner / Executor / Reviewer share a neutral
// secondary; Generic falls back to muted. Kept as a helper so source-
// grep tests pin the role -> class mapping.
function attachedRoleStyle(role: AttachedRole | undefined): string {
  switch (role) {
    case 'manager':
      return 'border-primary/30 bg-primary/10 text-primary';
    case 'planner':
    case 'executor':
    case 'reviewer':
      return 'border-secondary-foreground/20 bg-secondary text-secondary-foreground';
    case 'worker':
      return 'border-border bg-muted/60 text-foreground';
    default:
      return 'border-border bg-muted text-muted-foreground';
  }
}

interface AttachedRowActionsProps {
  session: AttachedSession;
  isSelected: boolean;
  onView: () => void;
  onDetach: () => void;
}

function AttachedRowActions({
  session,
  isSelected,
  onView,
  onDetach,
}: AttachedRowActionsProps) {
  const [showResume, setShowResume] = useState(false);
  const [showDetachConfirm, setShowDetachConfirm] = useState(false);
  const [copied, setCopied] = useState(false);
  const resumeCmd = session.sessionId
    ? `claude --resume ${session.sessionId}`
    : `claude --resume <unknown-session-id>`;
  const handleCopy = useCallback(async () => {
    await copyToClipboard(resumeCmd);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  }, [resumeCmd]);
  const role: AttachedRole = session.role || 'generic';
  return (
    <div className="flex flex-col gap-2 border-t border-border/60 bg-muted/30 px-4 py-2">
      {/* (TODO 8.38) Role badge + an explicit "the original terminal
          keeps running" hint. Operators were uncertain whether
          detaching killed the underlying claude process — making the
          read-only nature explicit at the row level was the cheapest
          way to remove that doubt. */}
      <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
        <span
          className={cn(
            'inline-flex items-center rounded-full border px-1.5 py-0 uppercase tracking-wide',
            attachedRoleStyle(role),
          )}
          aria-label={`Agent role: ${role}`}
          title={`Detected agent role: ${role}`}
        >
          {role}
        </span>
        <span className="text-muted-foreground">read-only mirror</span>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          variant={isSelected ? 'default' : 'outline'}
          onClick={onView}
          aria-label={`View conversation for ${session.name}`}
        >
          <Eye className="mr-1 h-3.5 w-3.5" aria-hidden />
          View conversation
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => setShowResume((v) => !v)}
          aria-label={`Resume ${session.name} in terminal`}
          aria-expanded={showResume}
        >
          <Terminal className="mr-1 h-3.5 w-3.5" aria-hidden />
          Resume in terminal
        </Button>
        {/* (TODO 8.38) Two-step detach. The first click expands an
            inline confirmation strip with the explicit "your terminal
            keeps running" sentence so the operator never wonders
            whether detach is destructive. */}
        <Button
          size="sm"
          variant="outline"
          onClick={() => setShowDetachConfirm((v) => !v)}
          aria-label={`Detach ${session.name}`}
          aria-expanded={showDetachConfirm}
          className="text-destructive hover:bg-destructive/10"
        >
          <Trash2 className="mr-1 h-3.5 w-3.5" aria-hidden />
          Detach
        </Button>
      </div>
      {showDetachConfirm ? (
        <div
          role="alert"
          className="flex flex-wrap items-center gap-2 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs"
        >
          <span className="text-destructive">
            Remove this session from the c4 list. Your terminal session
            keeps running — only the read-only mirror is dropped.
          </span>
          <Button
            size="sm"
            variant="outline"
            onClick={() => setShowDetachConfirm(false)}
            aria-label="Cancel detach"
          >
            Cancel
          </Button>
          <Button
            size="sm"
            variant="default"
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            onClick={() => {
              setShowDetachConfirm(false);
              onDetach();
            }}
            aria-label={`Confirm detach for ${session.name}`}
          >
            Detach session
          </Button>
        </div>
      ) : null}
      {showResume ? (
        <div
          className="flex items-center gap-2 rounded border border-border bg-background px-2 py-1 text-[11px]"
          role="region"
          aria-label="Resume command"
        >
          <code className="flex-1 truncate font-mono">{resumeCmd}</code>
          <button
            type="button"
            onClick={handleCopy}
            aria-label="Copy resume command"
            className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-accent-foreground"
          >
            <Copy className="h-3.5 w-3.5" aria-hidden />
          </button>
          {copied ? <span className="text-muted-foreground">copied</span> : null}
        </div>
      ) : null}
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

  const availableSessions = data?.sessions ?? [];

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
                <div className="p-3">
                  <EmptyAttachBanner
                    onAttachClick={() => {
                      setModalError(null);
                      setModalOpen(true);
                    }}
                  />
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
                                <span>- {formatRelative(a.createdAt)}</span>
                              ) : null}
                            </div>
                          </button>
                        </div>
                        <AttachedRowActions
                          session={a}
                          isSelected={active}
                          onView={() =>
                            setSelection({ kind: 'attached', name: a.name })
                          }
                          onDetach={() => handleDetach(a.name)}
                        />
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
              live={false}
              snapshotUrl={`/api/attach/${encodeURIComponent(selection.name)}/conversation`}
              className="flex-1"
            />
            <ComparisonCard className="self-end" />
          </>
        ) : (
          <Card className="flex flex-1 items-center justify-center border-dashed">
            <CardContent className="flex flex-col items-center gap-4 p-6 text-center text-sm text-muted-foreground">
              <span>Select a session to view the conversation.</span>
              <ComparisonCard />
            </CardContent>
          </Card>
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

      {showTour ? <Tour onDismiss={dismissTour} /> : null}
    </div>
  );
}
