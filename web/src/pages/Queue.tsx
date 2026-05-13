import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { ChangeEvent, DragEvent, FormEvent, KeyboardEvent } from 'react';
import { GripVertical, Pencil, RefreshCw } from 'lucide-react';
import PageFrame from './PageFrame';
import {
  Badge,
  Button,
  EmptyState,
  ErrorState,
  Skeleton,
  Tooltip,
} from '../components/ui';
import type { BadgeVariant } from '../components/ui';
import { EmptyQueueIllustration } from '../components/illustrations';
import { apiGet, apiPost } from '../lib/api';
import { useLocale } from '../lib/i18n';
import { cn } from '../lib/cn';
import { text } from '../lib/typography';

// (1.11.94) Queue editor for docs/autonomous-queue-v10.md.
//
// The page is a single table view of the autonomous queue. Each row
// shows id, title, status (dropdown), and a truncated detail preview
// with an Edit button that pops a modal containing a textarea. Rows
// can be reordered by drag-and-drop; every mutation (reorder, status,
// detail) fires POST /api/autonomous/queue with the full rows[] so
// the daemon does an atomic rewrite -- no partial-update API.
//
// The component manages three external states (loading / error /
// data) plus two local pieces (the row being edited in the modal and
// the row currently being dragged). The optimistic-update pattern
// lets the UI react immediately and roll back on POST failure.

export type QueueStatus = 'todo' | 'doing' | 'done' | 'partial';

export interface QueueRow {
  id: string;
  title: string;
  status: QueueStatus;
  detail: string;
}

interface QueueResponse {
  rows: QueueRow[];
  raw?: string;
  source?: string;
  notFound?: boolean;
  error?: string;
}

interface QueuePostResponse {
  ok: boolean;
  rows: QueueRow[];
  raw?: string;
  source?: string;
}

const STATUS_VALUES: readonly QueueStatus[] = ['todo', 'doing', 'done', 'partial'];

const STATUS_BADGE: Record<QueueStatus, BadgeVariant> = {
  todo: 'secondary',
  doing: 'warning',
  done: 'success',
  partial: 'info',
};

const DETAIL_PREVIEW_CHARS = 140;

function truncate(value: string, limit: number): string {
  if (!value) return '';
  const first = value.split(/\r?\n/)[0] ?? '';
  if (first.length <= limit) return first;
  return `${first.slice(0, limit - 1).trimEnd()}...`;
}

interface EditModalProps {
  row: QueueRow;
  busy: boolean;
  onCancel: () => void;
  onSave: (detail: string) => void;
}

function EditModal({ row, busy, onCancel, onSave }: EditModalProps) {
  const [draft, setDraft] = useState(row.detail);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    setDraft(row.detail);
  }, [row.detail, row.id]);

  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  const handleKey = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      onCancel();
    }
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    onSave(draft);
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Edit detail for ${row.id}`}
      className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 p-4 backdrop-blur-sm motion-safe:animate-in motion-safe:fade-in motion-safe:duration-150"
      onClick={(event) => {
        if (event.target === event.currentTarget) onCancel();
      }}
      onKeyDown={handleKey}
    >
      <form
        className="flex w-full max-w-2xl flex-col gap-3 rounded-lg border border-border bg-card p-4 shadow-lg motion-safe:animate-in motion-safe:slide-in-from-top-2 motion-safe:duration-150"
        onSubmit={handleSubmit}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className={cn(text.h3, 'truncate text-foreground')}>{row.title || row.id}</h2>
            <p className={cn(text.caption, 'truncate')}>id {row.id}</p>
          </div>
          <Badge variant={STATUS_BADGE[row.status]}>{row.status}</Badge>
        </div>
        <label className="flex flex-col gap-2">
          <span className={cn(text.caption, 'text-foreground')}>Detail</span>
          <textarea
            ref={textareaRef}
            className="min-h-[12rem] w-full rounded-md border border-input bg-background p-3 font-mono text-sm leading-5 text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            value={draft}
            onChange={(event: ChangeEvent<HTMLTextAreaElement>) => setDraft(event.target.value)}
            disabled={busy}
            aria-label="Row detail"
          />
        </label>
        <div className="flex flex-wrap items-center justify-end gap-2 pt-1">
          <Button type="button" variant="ghost" size="sm" onClick={onCancel} disabled={busy}>
            Cancel
          </Button>
          <Button type="submit" size="sm" disabled={busy}>
            {busy ? 'Saving...' : 'Save'}
          </Button>
        </div>
      </form>
    </div>
  );
}

export default function Queue() {
  useLocale();
  const [rows, setRows] = useState<QueueRow[] | null>(null);
  const [raw, setRaw] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiGet<QueueResponse>('/api/autonomous/queue');
      if (data.error) {
        setError(data.error);
        setRows(null);
      } else {
        setRows(data.rows ?? []);
        setRaw(data.raw ?? '');
      }
    } catch (e) {
      setError((e as Error).message);
      setRows(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // commit(nextRows) -- optimistically apply the new rows[], post to
  // the daemon, and roll back on failure. Centralising the POST here
  // keeps every mutation (reorder / status / detail) on the same
  // contract and the same error path.
  const commit = useCallback(
    async (nextRows: QueueRow[]) => {
      const previous = rows;
      setRows(nextRows);
      setBusy(true);
      setSaveError(null);
      try {
        const data = await apiPost<QueuePostResponse>('/api/autonomous/queue', {
          rows: nextRows,
        });
        if (data && Array.isArray(data.rows)) {
          setRows(data.rows);
          if (typeof data.raw === 'string') setRaw(data.raw);
        }
      } catch (e) {
        setSaveError((e as Error).message);
        setRows(previous);
      } finally {
        setBusy(false);
      }
    },
    [rows],
  );

  const handleStatusChange = useCallback(
    (id: string, status: QueueStatus) => {
      if (!rows) return;
      const next = rows.map((row) => (row.id === id ? { ...row, status } : row));
      void commit(next);
    },
    [rows, commit],
  );

  const handleSaveDetail = useCallback(
    (detail: string) => {
      if (!rows || !editingId) return;
      const next = rows.map((row) =>
        row.id === editingId ? { ...row, detail } : row,
      );
      setEditingId(null);
      void commit(next);
    },
    [rows, editingId, commit],
  );

  const handleDragStart = (event: DragEvent<HTMLTableRowElement>, id: string) => {
    setDragId(id);
    // jsdom's DragEvent shim leaves dataTransfer undefined, so we guard
    // before reading it. The data also rides in component state via
    // dragId, so the transfer payload is mostly for native interop.
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = 'move';
      try { event.dataTransfer.setData('text/plain', id); } catch { /* ignore */ }
    }
  };

  const handleDragOver = (event: DragEvent<HTMLTableRowElement>) => {
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
  };

  const handleDrop = (event: DragEvent<HTMLTableRowElement>, targetId: string) => {
    event.preventDefault();
    const transferId = event.dataTransfer ? event.dataTransfer.getData('text/plain') : '';
    const sourceId = dragId || transferId;
    setDragId(null);
    if (!rows || !sourceId || sourceId === targetId) return;
    const fromIdx = rows.findIndex((r) => r.id === sourceId);
    const toIdx = rows.findIndex((r) => r.id === targetId);
    if (fromIdx === -1 || toIdx === -1) return;
    const next = rows.slice();
    const [moved] = next.splice(fromIdx, 1);
    if (!moved) return;
    next.splice(toIdx, 0, moved);
    void commit(next);
  };

  const handleDragEnd = () => {
    setDragId(null);
  };

  const editingRow = useMemo(() => {
    if (!editingId || !rows) return null;
    return rows.find((r) => r.id === editingId) ?? null;
  }, [editingId, rows]);

  return (
    <PageFrame
      title="Queue editor"
      description="View and edit docs/autonomous-queue-v10.md. Drag rows to reorder, flip the status dropdown, or click Edit to update a row's detail."
      actions={
        <Tooltip label="Reload queue from disk">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => {
              void refresh();
            }}
            disabled={loading || busy}
          >
            <RefreshCw className={cn('h-3.5 w-3.5', (loading || busy) && 'animate-spin')} />
            <span className="sr-only">Refresh</span>
          </Button>
        </Tooltip>
      }
    >
      {saveError ? (
        <div
          role="alert"
          className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive"
        >
          Save failed: {saveError}
        </div>
      ) : null}

      {loading && !rows ? (
        <div
          role="status"
          aria-live="polite"
          data-testid="queue-loading"
          className="flex flex-col gap-2"
        >
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} variant="row" />
          ))}
        </div>
      ) : null}

      {!loading && error ? (
        <ErrorState
          title="Could not load queue"
          description="The daemon returned an error. Reload to retry."
          error={error}
          onRetry={() => {
            void refresh();
          }}
        />
      ) : null}

      {!loading && !error && rows && rows.length === 0 ? (
        <EmptyState
          icon={<EmptyQueueIllustration size={160} />}
          title="Queue is empty"
          description={`No rows in ${raw ? 'the autonomous queue' : 'docs/autonomous-queue-v10.md'} yet.`}
        />
      ) : null}

      {!loading && !error && rows && rows.length > 0 ? (
        <div className="overflow-x-auto rounded-md border border-border">
          <table
            data-testid="queue-table"
            className="w-full text-left text-sm"
          >
            <thead className="bg-muted/40">
              <tr>
                <th scope="col" className="w-10 px-3 py-2"><span className="sr-only">Drag handle</span></th>
                <th scope="col" className="w-24 px-3 py-2 font-medium">ID</th>
                <th scope="col" className="px-3 py-2 font-medium">Title</th>
                <th scope="col" className="w-32 px-3 py-2 font-medium">Status</th>
                <th scope="col" className="px-3 py-2 font-medium">Detail</th>
                <th scope="col" className="w-20 px-3 py-2 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((row) => {
                const dragging = row.id === dragId;
                return (
                  <tr
                    key={row.id}
                    data-row-id={row.id}
                    data-testid={`queue-row-${row.id}`}
                    draggable
                    onDragStart={(event) => handleDragStart(event, row.id)}
                    onDragOver={handleDragOver}
                    onDrop={(event) => handleDrop(event, row.id)}
                    onDragEnd={handleDragEnd}
                    className={cn(
                      'bg-card transition-colors',
                      dragging ? 'opacity-50' : 'hover:bg-muted/30',
                    )}
                  >
                    <td className="px-3 py-2 align-top">
                      <span
                        aria-hidden="true"
                        data-testid={`queue-handle-${row.id}`}
                        className="inline-flex h-6 w-6 cursor-grab items-center justify-center rounded-sm text-muted-foreground hover:text-foreground"
                      >
                        <GripVertical className="h-4 w-4" />
                      </span>
                    </td>
                    <td className={cn('px-3 py-2 align-top', text.mono, 'text-foreground')}>
                      {row.id}
                    </td>
                    <td className="px-3 py-2 align-top">
                      <span className="text-foreground">{row.title}</span>
                    </td>
                    <td className="px-3 py-2 align-top">
                      <label className="sr-only" htmlFor={`status-${row.id}`}>
                        Status for {row.id}
                      </label>
                      <select
                        id={`status-${row.id}`}
                        data-testid={`queue-status-${row.id}`}
                        value={row.status}
                        onChange={(event) =>
                          handleStatusChange(row.id, event.target.value as QueueStatus)
                        }
                        disabled={busy}
                        className="h-8 w-full rounded-md border border-input bg-background px-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                      >
                        {STATUS_VALUES.map((s) => (
                          <option key={s} value={s}>{s}</option>
                        ))}
                      </select>
                    </td>
                    <td className={cn('px-3 py-2 align-top', text.caption, 'text-muted-foreground')}>
                      <span data-testid={`queue-detail-${row.id}`}>
                        {truncate(row.detail || '', DETAIL_PREVIEW_CHARS) || (
                          <span className="italic">(empty)</span>
                        )}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right align-top">
                      <Tooltip label="Edit detail">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          data-testid={`queue-edit-${row.id}`}
                          onClick={() => setEditingId(row.id)}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                          <span className="sr-only">Edit {row.id}</span>
                        </Button>
                      </Tooltip>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : null}

      {editingRow ? (
        <EditModal
          row={editingRow}
          busy={busy}
          onCancel={() => setEditingId(null)}
          onSave={handleSaveDetail}
        />
      ) : null}
    </PageFrame>
  );
}
