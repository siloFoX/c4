import { useCallback, useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { Archive, Copy, RotateCcw, Save, Trash2 } from 'lucide-react';
import PageFrame from './PageFrame';
import {
  AlertBanner,
  Button,
  Dialog,
  EmptyState,
  ErrorState,
  FileDrop,
  Input,
  Pagination,
  Skeleton,
  Toolbar,
  Tooltip,
  UndoToast,
  VisuallyHidden,
} from '../components/ui';
import { apiDelete, apiGet, apiPost } from '../lib/api';
import { useLocale } from '../lib/i18n';
import RelativeTime from '../components/RelativeTime';
import { cn } from '../lib/cn';
import { text } from '../lib/typography';
import { copyTextToClipboard } from '../hooks/use-copy';
import { useUndoToast } from '../hooks/use-undo-toast';

// (11.189) Snapshots page. Lists saved snapshots from
// GET /api/snapshots; supports taking a new snapshot (POST), restoring
// a saved snapshot (POST :id/restore), and deleting one (DELETE :id).
// All destructive actions go through a confirm dialog because they
// overwrite /root/c4/config.json + docs/autonomous-queue-v10.md.

export interface SnapshotMeta {
  id: string;
  label: string;
  createdAt: string;
  configBytes: number;
  queueBytes: number;
}

interface SnapshotsResponse {
  snapshots?: SnapshotMeta[];
  error?: string;
}

function formatBytes(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return '0 B';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

export default function Snapshots() {
  useLocale();
  const [items, setItems] = useState<SnapshotMeta[] | null>(null);
  // (v1.11.282, TODO 11.264) Pagination state for the grid. The
  // snapshots list can grow into the hundreds once an operator
  // takes daily snapshots; 10 rows per page keeps the table
  // readable.
  const [page, setPage] = useState<number>(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const [takeOpen, setTakeOpen] = useState(false);
  const [takeLabel, setTakeLabel] = useState('');

  const [restoreTarget, setRestoreTarget] = useState<SnapshotMeta | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<SnapshotMeta | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiGet<SnapshotsResponse>('/api/snapshots');
      if (data.error) {
        setError(data.error);
        setItems(null);
      } else {
        setItems(data.snapshots ?? []);
      }
    } catch (e) {
      setError((e as Error).message);
      setItems(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const handleTakeSubmit = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      setBusy(true);
      setActionError(null);
      try {
        await apiPost('/api/snapshots', { label: takeLabel });
        setTakeOpen(false);
        setTakeLabel('');
        await refresh();
      } catch (e) {
        setActionError((e as Error).message);
      } finally {
        setBusy(false);
      }
    },
    [takeLabel, refresh],
  );

  const handleRestoreConfirm = useCallback(async () => {
    if (!restoreTarget) return;
    setBusy(true);
    setActionError(null);
    try {
      await apiPost(`/api/snapshots/${encodeURIComponent(restoreTarget.id)}/restore`, {});
      setRestoreTarget(null);
      await refresh();
    } catch (e) {
      setActionError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }, [restoreTarget, refresh]);

  // (v1.11.262, TODO 11.244) Snapshot delete is deferred behind a
  // 5-second undo window. The UI immediately drops the row, but
  // the actual apiDelete fires only after the undo timer elapses
  // (or when the operator dismisses the toast). Clicking Undo
  // restores the snapshot back into the visible list and the
  // server call never happens.
  const { active: deleteUndoActive, showUndo: showDeleteUndo } = useUndoToast();
  const handleDeleteConfirm = useCallback(() => {
    if (!deleteTarget) return;
    const target = deleteTarget;
    setDeleteTarget(null);
    setActionError(null);
    // Optimistic remove from the list. The server call is held
    // until commit -- undo restores by re-inserting at the same
    // position.
    let prevItems: SnapshotMeta[] | null = null;
    let prevIndex = -1;
    setItems((cur) => {
      if (!cur) return cur;
      prevItems = cur;
      prevIndex = cur.findIndex((s) => s.id === target.id);
      return cur.filter((s) => s.id !== target.id);
    });
    showDeleteUndo({
      message: `Deleting snapshot ${target.label || target.id}...`,
      onCommit: () => {
        // Fire the actual destructive call now. Errors surface
        // through actionError; the optimistic remove already
        // happened so the UI does not need to mutate again.
        void (async () => {
          try {
            await apiDelete(`/api/snapshots/${encodeURIComponent(target.id)}`);
            await refresh();
          } catch (e) {
            setActionError((e as Error).message);
            // Best-effort restore: if the call failed and we have
            // the prior list cached, put the row back.
            if (prevItems) {
              const restored = [...prevItems];
              setItems(restored);
            }
          }
        })();
      },
      onUndo: () => {
        if (prevItems) {
          const restored = [...prevItems];
          if (prevIndex >= 0) {
            // No-op if the snapshot is somehow already back (e.g.
            // a concurrent refresh). Otherwise restore the row at
            // its prior index.
            const existing = restored.findIndex((s) => s.id === target.id);
            if (existing === -1) {
              restored.splice(prevIndex, 0, target);
            }
          }
          setItems(restored);
        }
      },
    });
  }, [deleteTarget, showDeleteUndo, refresh]);

  return (
    <PageFrame
      title="Snapshots"
      description="Save and restore the full config.json plus autonomous queue markdown. Restoring overwrites the live files atomically."
      actions={
        <Tooltip label="Take a new snapshot of the current config and queue">
          <Button
            type="button"
            size="sm"
            data-testid="snapshots-take-button"
            onClick={() => setTakeOpen(true)}
            disabled={loading || busy}
          >
            <Save className="h-3.5 w-3.5" />
            <span>Take snapshot</span>
          </Button>
        </Tooltip>
      }
    >
      {actionError ? (
        // (v1.11.275, TODO 11.257) The action-error Alert is now
        // an AlertBanner with severity="danger". The dispatch's
        // "Snapshots failed upload" slot maps to this error
        // surface since Snapshots has no separate upload flow
        // (take / restore / delete are immediate ops and surface
        // their failures here).
        <AlertBanner
          severity="danger"
          dismissible
          onDismiss={() => setActionError(null)}
          data-testid="snapshots-action-error"
        >
          Action failed: {actionError}
        </AlertBanner>
      ) : null}

      {loading && !items ? (
        // (v1.11.273, TODO 11.255) Replaces the inline
        // Array.from({length:4}).map(<Skeleton variant="row" />)
        // with the new Skeleton.List primitive. Rows mirror the
        // snapshot table layout (avatar-less, 2 lines per row).
        <Skeleton.List
          rows={4}
          aria-live="polite"
          data-testid="snapshots-loading"
        />
      ) : null}

      {!loading && error ? (
        <ErrorState
          title="Could not load snapshots"
          description="The daemon returned an error. Reload to retry."
          error={error}
          onRetry={() => {
            void refresh();
          }}
        />
      ) : null}

      {!loading && !error && items && items.length === 0 ? (
        <EmptyState
          icon={<Archive className="h-8 w-8" aria-hidden="true" />}
          title="No snapshots yet"
          description="Take a snapshot to save the current config and queue. You can restore it later from this page."
        />
      ) : null}

      {!loading && !error && items && items.length > 0 ? (
        <div className="overflow-x-auto rounded-md border border-border">
          <table
            data-testid="snapshots-table"
            className="w-full text-left text-sm"
          >
            <thead className="bg-muted/40">
              <tr>
                <th scope="col" className="px-3 py-2 font-medium">Label</th>
                <th scope="col" className="px-3 py-2 font-medium">ID</th>
                <th scope="col" className="px-3 py-2 font-medium">Created</th>
                <th scope="col" className="px-3 py-2 font-medium">Size</th>
                <th scope="col" className="px-3 py-2 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {(() => {
                const PAGE_SIZE = 10;
                const totalPages = Math.max(1, Math.ceil(items.length / PAGE_SIZE));
                // Clamp the current page so a delete that drops
                // below the current slot does not strand the
                // table on an empty page.
                const safePage = Math.min(Math.max(1, page), totalPages);
                const slice = items.slice(
                  (safePage - 1) * PAGE_SIZE,
                  safePage * PAGE_SIZE,
                );
                return slice;
              })().map((s) => {
                const totalBytes = (s.configBytes || 0) + (s.queueBytes || 0);
                return (
                  <tr
                    key={s.id}
                    data-testid={`snapshots-row-${s.id}`}
                    className="bg-card hover:bg-muted/30"
                  >
                    <td className="px-3 py-2 align-top text-foreground">
                      {s.label || <span className="italic text-muted-foreground">(no label)</span>}
                    </td>
                    <td className={cn('px-3 py-2 align-top', text.mono, 'text-muted-foreground')}>
                      {s.id}
                    </td>
                    <td className={cn('px-3 py-2 align-top', text.caption, 'text-muted-foreground')}>
                      {s.createdAt ? <RelativeTime value={s.createdAt} /> : '-'}
                    </td>
                    <td className={cn('px-3 py-2 align-top', text.caption, 'text-muted-foreground')}>
                      {formatBytes(totalBytes)}
                    </td>
                    <td className="px-3 py-2 text-right align-top">
                      {/* (v1.11.284, TODO 11.266) Per-row actions
                          wrapped in the Toolbar primitive
                          (children-mode escape hatch) so the row
                          carries role=toolbar + keyboard arrow nav
                          + the canonical height/border tokens.
                          Tooltips + per-button data-testid attrs
                          stay verbatim. */}
                      <Toolbar
                        size="sm"
                        ariaLabel={`Actions for snapshot ${s.id}`}
                        data-testid={`snapshots-row-toolbar-${s.id}`}
                      >
                        <Tooltip label="Copy snapshot id">
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            data-testid={`snapshots-copy-id-${s.id}`}
                            onClick={() => {
                              void copyTextToClipboard(s.id);
                            }}
                          >
                            <Copy className="h-3.5 w-3.5" />
                            <VisuallyHidden>Copy id {s.id}</VisuallyHidden>
                          </Button>
                        </Tooltip>
                        {s.label ? (
                          <Tooltip label="Copy snapshot label">
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              data-testid={`snapshots-copy-label-${s.id}`}
                              onClick={() => {
                                void copyTextToClipboard(s.label as string);
                              }}
                            >
                              <Copy className="h-3.5 w-3.5" />
                              <VisuallyHidden>Copy label {s.label}</VisuallyHidden>
                            </Button>
                          </Tooltip>
                        ) : null}
                        <Tooltip label="Restore this snapshot (overwrites current files)">
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            data-testid={`snapshots-restore-${s.id}`}
                            disabled={busy}
                            onClick={() => setRestoreTarget(s)}
                          >
                            <RotateCcw className="h-3.5 w-3.5" />
                            <span className="sr-only">Restore {s.id}</span>
                          </Button>
                        </Tooltip>
                        <Tooltip label="Delete this snapshot">
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            data-testid={`snapshots-delete-${s.id}`}
                            disabled={busy}
                            onClick={() => setDeleteTarget(s)}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                            <span className="sr-only">Delete {s.id}</span>
                          </Button>
                        </Tooltip>
                      </Toolbar>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {/* (v1.11.282, TODO 11.264) Pagination footer below
              the snapshots table. Hidden when the list fits in
              one page. Shows First / Last + Jump-to-page for
              long lists. */}
          {items.length > 10 ? (
            <div
              className="flex justify-center border-t border-border bg-card/40 px-3 py-2"
              data-testid="snapshots-pagination"
            >
              <Pagination
                page={Math.min(Math.max(1, page), Math.max(1, Math.ceil(items.length / 10)))}
                totalPages={Math.max(1, Math.ceil(items.length / 10))}
                onPageChange={setPage}
                ariaLabel="Snapshots pagination"
                showFirstLast
                showJumpToPage
              />
            </div>
          ) : null}
        </div>
      ) : null}

      {/* (v1.11.288, TODO 11.270) FileDrop adoption: an
          import-from-JSON slot lets the operator restore from a
          local snapshot file without going through the daemon's
          POST /api/snapshots/<id>/restore round trip. Today
          the drop is a placeholder (the file is logged but not
          posted); the slot is in place for when an
          /api/snapshots/import endpoint lands. */}
      {!loading ? (
        <FileDrop
          label="Import from JSON"
          hint="Drop a snapshot JSON file to stage it for import. Max 5 MB."
          accept="application/json,.json"
          maxSize={5 * 1024 * 1024}
          className="mt-2"
          data-testid="snapshots-import-filedrop"
          onAdd={(files) => {
            // eslint-disable-next-line no-console
            console.log('[snapshots] import staged', files[0]?.name);
          }}
        />
      ) : null}

      <Dialog
        open={takeOpen}
        onClose={() => {
          if (!busy) setTakeOpen(false);
        }}
        title="Take snapshot"
      >
        <form onSubmit={handleTakeSubmit} className="flex flex-col gap-3">
          <label className="flex flex-col gap-2">
            <span className={cn(text.caption, 'text-foreground')}>Label (optional)</span>
            <Input
              autoFocus
              data-testid="snapshots-label-input"
              value={takeLabel}
              onChange={(e) => setTakeLabel(e.target.value)}
              placeholder="e.g. before-merge"
              disabled={busy}
              maxLength={200}
            />
          </label>
          <div className="flex justify-end gap-2 pt-1">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setTakeOpen(false)}
              disabled={busy}
            >
              Cancel
            </Button>
            <Button type="submit" size="sm" disabled={busy} data-testid="snapshots-take-confirm">
              <Save className="h-3.5 w-3.5" />
              <span>{busy ? 'Saving...' : 'Save'}</span>
            </Button>
          </div>
        </form>
      </Dialog>

      <Dialog
        open={Boolean(restoreTarget)}
        onClose={() => {
          if (!busy) setRestoreTarget(null);
        }}
        title={restoreTarget ? `Restore ${restoreTarget.label || restoreTarget.id}?` : ''}
      >
        <div className="flex flex-col gap-3">
          <p className={cn(text.body, 'text-foreground')}>
            This will overwrite the live config.json and docs/autonomous-queue-v10.md
            with the contents of this snapshot. Take a fresh snapshot first if you want
            to keep the current state.
          </p>
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setRestoreTarget(null)}
              disabled={busy}
            >
              Cancel
            </Button>
            <Button
              type="button"
              size="sm"
              disabled={busy}
              data-testid="snapshots-restore-confirm"
              onClick={() => {
                void handleRestoreConfirm();
              }}
            >
              <RotateCcw className="h-3.5 w-3.5" />
              <span>{busy ? 'Restoring...' : 'Restore'}</span>
            </Button>
          </div>
        </div>
      </Dialog>

      <Dialog
        open={Boolean(deleteTarget)}
        onClose={() => {
          if (!busy) setDeleteTarget(null);
        }}
        title={deleteTarget ? `Delete ${deleteTarget.label || deleteTarget.id}?` : ''}
      >
        <div className="flex flex-col gap-3">
          <p className={cn(text.body, 'text-foreground')}>
            This permanently removes the snapshot file. The current config and queue
            on disk are untouched.
          </p>
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setDeleteTarget(null)}
              disabled={busy}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              size="sm"
              disabled={busy}
              data-testid="snapshots-delete-confirm"
              onClick={() => handleDeleteConfirm()}
            >
              <Trash2 className="h-3.5 w-3.5" />
              <span>Delete</span>
            </Button>
          </div>
        </div>
      </Dialog>

      {deleteUndoActive ? (
        <UndoToast
          active={deleteUndoActive}
          data-testid="snapshots-delete-undo"
          undoLabel="Undo delete"
        />
      ) : null}
    </PageFrame>
  );
}
