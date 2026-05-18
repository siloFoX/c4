import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertOctagon,
  AlertTriangle,
  Bell,
  BellOff,
  CheckCircle2,
  Info,
  Rocket,
  Trash2,
} from 'lucide-react';
import PageFrame from './PageFrame';
import {
  Badge,
  BadgeCounter,
  Button,
  EmptyState,
  Panel,
  RichText,
  ScrollArea,
  Tabs,
  TimeAgo,
  Timeline,
  UndoToast,
} from '../components/ui';
import type { TabsItem, TimelineItem, TimelineTone } from '../components/ui';
import Toast from '../components/Toast';
import { useToast } from '../lib/use-toast';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { useUndoToast } from '../hooks/use-undo-toast';

// Notifications feed page (patch 11.186). Renders the unified lifecycle
// notifications stream backed by GET /api/notifications when available,
// or inline sample data otherwise. Strings are intentionally inline -
// only the sidebar label/description go through i18n.

export type NotificationType =
  | 'dispatch'
  | 'complete'
  | 'halt'
  | 'escalation'
  | 'system';

export interface NotificationItem {
  id: string;
  type: NotificationType;
  title: string;
  description?: string;
  timestamp: string;
  read?: boolean;
}

type FilterKey = 'all' | NotificationType;

const FILTERS: ReadonlyArray<{ key: FilterKey; label: string }> = [
  { key: 'all', label: 'All' },
  { key: 'dispatch', label: 'Dispatch' },
  { key: 'complete', label: 'Complete' },
  { key: 'halt', label: 'Halt' },
  { key: 'escalation', label: 'Escalation' },
  { key: 'system', label: 'System' },
];

const TONE_BY_TYPE: Record<NotificationType, TimelineTone> = {
  dispatch: 'primary',
  complete: 'success',
  halt: 'warning',
  escalation: 'danger',
  system: 'neutral',
};

function IconForType({ type }: { type: NotificationType }) {
  const cls = 'h-3 w-3';
  switch (type) {
    case 'dispatch':
      return <Rocket className={cls} />;
    case 'complete':
      return <CheckCircle2 className={cls} />;
    case 'halt':
      return <AlertTriangle className={cls} />;
    case 'escalation':
      return <AlertOctagon className={cls} />;
    case 'system':
    default:
      return <Info className={cls} />;
  }
}

const PAGE_SIZE = 50;

// (v1.11.260, TODO 11.242) How long the inline undo banner stays
// visible after a Clear all confirm. v1.11.262 (TODO 11.244) keeps
// this export but the implementation now flows through the shared
// useUndoToast hook (DEFAULT_UNDO_DURATION_MS = 5000) rather than
// owning its own timer locally.
export const UNDO_BANNER_MS = 5000;

function buildMockNotifications(): NotificationItem[] {
  const now = Date.now();
  const day = 24 * 60 * 60 * 1000;
  const types: NotificationType[] = [
    'dispatch',
    'complete',
    'halt',
    'escalation',
    'system',
  ];
  const titles: Record<NotificationType, string[]> = {
    dispatch: [
      'Dispatched todo #142 to worker auto-w17',
      'Dispatched todo #143 to worker auto-w18',
      'Dispatched todo #144 to worker auto-w19',
      'Dispatched todo #145 to worker auto-w20',
    ],
    complete: [
      'auto-w12 completed without escalation',
      'auto-w13 completed - merged to main',
      'auto-w14 completed - pending review',
    ],
    halt: [
      'Loop halted - awaiting manager attention',
      'auto-w08 halted on validation failure',
    ],
    escalation: [
      'Escalation: auto-w05 blocked on permission',
      'Escalation: critical command requires approval',
    ],
    system: [
      'Daemon restarted (v1.11.203)',
      'Config reloaded successfully',
      'Checkpoint written for 3 workers',
      'Reconnect succeeded for auto-w22',
    ],
  };

  const out: NotificationItem[] = [];
  for (let i = 0; i < 20; i++) {
    const type = types[i % types.length];
    const pool = titles[type];
    const title = pool[i % pool.length];
    const offsetMs = Math.floor((i * 7 * day) / 20) + (i % 5) * 60 * 60 * 1000;
    out.push({
      id: `mock-${i}`,
      type,
      title,
      description:
        type === 'system'
          ? 'Source: daemon lifecycle event.'
          : `Source: autonomous loop (${type}).`,
      timestamp: new Date(now - offsetMs).toISOString(),
      read: i > 10,
    });
  }
  return out;
}

export interface NotificationsApiResponse {
  notifications: NotificationItem[];
}

export default function Notifications() {
  const [items, setItems] = useState<NotificationItem[] | null>(null);
  const [usingMocks, setUsingMocks] = useState(false);
  const [activeFilter, setActiveFilter] = useState<FilterKey>('all');
  const [readAt, setReadAt] = useState<number | null>(null);
  const [visibleLimit, setVisibleLimit] = useState(PAGE_SIZE);
  // (v1.11.260, TODO 11.242 -> v1.11.262, TODO 11.244) Clear-all
  // flow. confirmOpen drives the ConfirmDialog. The undo window is
  // now driven by the shared useUndoToast hook: showUndo() runs
  // after Confirm and the hook owns the timer + commit + undo
  // state. The snapshot ref keeps the cleared list so the hook's
  // onUndo callback can restore it.
  const [confirmOpen, setConfirmOpen] = useState(false);
  const undoSnapshotRef = useRef<NotificationItem[] | null>(null);
  const { active: undoActive, showUndo } = useUndoToast({
    durationMs: UNDO_BANNER_MS,
  });
  // (v1.11.342, TODO 11.324) Success toast for the
  // Mark-all-read action. Errors do not occur on this
  // local-state flip; the toast simply confirms the count
  // that was just marked.
  const { toast, showToast, dismissToast } = useToast();

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch('/api/notifications');
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = (await res.json()) as NotificationsApiResponse;
        if (cancelled) return;
        if (!data || !Array.isArray(data.notifications)) {
          throw new Error('malformed response');
        }
        setItems(data.notifications);
        setUsingMocks(false);
      } catch {
        if (cancelled) return;
        setItems(buildMockNotifications());
        setUsingMocks(true);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const filtered = useMemo<NotificationItem[]>(() => {
    if (!items) return [];
    if (activeFilter === 'all') return items;
    return items.filter((n) => n.type === activeFilter);
  }, [items, activeFilter]);

  const visible = useMemo<NotificationItem[]>(
    () => filtered.slice(0, visibleLimit),
    [filtered, visibleLimit],
  );

  const timelineItems = useMemo<TimelineItem[]>(
    () =>
      visible.map((n) => ({
        id: n.id,
        timestamp: n.timestamp,
        title: (
          <span className="flex items-center gap-2">
            <span>{n.title}</span>
            {!n.read && readAt == null ? (
              <Badge variant="outline" className="text-[10px]">
                New
              </Badge>
            ) : null}
          </span>
        ),
        /* (v1.11.283, TODO 11.265) Notification body now flows
           through the RichText primitive so operator-authored
           descriptions can carry markdown-lite formatting
           (paragraphs, bullets, **bold**, `code`, [links]) -- with
           the safe URL allowlist enforced and no HTML
           pass-through.
           (v1.11.289, TODO 11.271) Compact TimeAgo chip leads the
           body so the operator sees lifecycle cadence ("2m ago",
           "3h ago") next to the message even when the Timeline's
           absolute timestamp row is scrolled off the top. */
        description: (
          <div className="flex flex-col gap-1">
            <TimeAgo
              value={n.timestamp}
              variant="short"
              className="text-[10px] uppercase tracking-wide text-muted-foreground"
              data-testid={`notification-time-ago-${n.id}`}
            />
            <RichText
              content={n.description}
              data-testid={`notification-body-${n.id}`}
            />
          </div>
        ),
        icon: <IconForType type={n.type} />,
        tone: TONE_BY_TYPE[n.type],
      })),
    [visible, readAt],
  );

  const totalUnread = useMemo(
    () =>
      items
        ? items.filter((n) => !n.read && readAt == null).length
        : 0,
    [items, readAt],
  );

  // (v1.11.342, TODO 11.324) Per-kind counts for the Tabs
  // strip. Computed from `items` so the chips refresh
  // immediately on a Clear-all / Undo without needing an
  // extra trigger.
  const kindCounts = useMemo(() => {
    const base: Record<NotificationType, number> = {
      dispatch: 0,
      complete: 0,
      halt: 0,
      escalation: 0,
      system: 0,
    };
    if (!items) return { ...base, all: 0 };
    for (const n of items) {
      base[n.type] += 1;
    }
    return { ...base, all: items.length };
  }, [items]);

  // (v1.11.342, TODO 11.324) Tabs strip items. Each label
  // pairs the human-readable kind with a count chip so the
  // operator can scan workload before clicking through.
  const tabItems = useMemo<TabsItem[]>(
    () =>
      FILTERS.map((f) => ({
        value: f.key,
        label: (
          <span
            className="inline-flex items-center gap-1.5"
            data-filter={f.key}
          >
            {f.label}
            <span
              data-testid={`notifications-tab-count-${f.key}`}
              className="inline-flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-muted px-1 text-[10px] text-muted-foreground"
            >
              {kindCounts[f.key]}
            </span>
          </span>
        ),
      })),
    [kindCounts],
  );

  const handleMarkAllRead = () => {
    // (v1.11.342, TODO 11.324) Surface a success Toast with
    // the marked count so the operator sees explicit
    // confirmation of the local-state flip. Skip the toast
    // when there were already zero unread items (the button
    // is disabled in that state but defensive).
    const unreadBefore = totalUnread;
    setReadAt(Date.now());
    if (unreadBefore > 0) {
      showToast(
        `Marked ${unreadBefore} notification${unreadBefore === 1 ? '' : 's'} as read.`,
        'success',
      );
    }
  };

  const handleLoadMore = () => {
    setVisibleLimit((n) => n + PAGE_SIZE);
  };

  const canLoadMore = filtered.length > visible.length;

  // (v1.11.262, TODO 11.244) Clear-all flow now flows through
  // useUndoToast. confirmClearAll() snapshots the current items,
  // wipes the local state, and tells the hook to surface a 5s
  // undo window. onUndo restores from the snapshot; onCommit is a
  // no-op here because the destruction is already operator-local
  // (no server call to defer).
  const openClearConfirm = () => setConfirmOpen(true);
  const cancelClearConfirm = () => setConfirmOpen(false);
  const confirmClearAll = () => {
    setConfirmOpen(false);
    if (!items || items.length === 0) return;
    const snap = items;
    undoSnapshotRef.current = snap;
    setItems([]);
    setVisibleLimit(PAGE_SIZE);
    showUndo({
      message: `Cleared ${snap.length} notification${snap.length === 1 ? '' : 's'}.`,
      onCommit: () => {
        undoSnapshotRef.current = null;
      },
      onUndo: () => {
        const cached = undoSnapshotRef.current;
        undoSnapshotRef.current = null;
        if (cached) setItems(cached);
      },
    });
  };

  const totalCount = items ? items.length : 0;

  return (
    <PageFrame
      title="Notifications"
      description="Unified feed of lifecycle events from the autonomous loop and daemon."
      actions={
        <div className="flex items-center gap-2">
          {/* (v1.11.342, TODO 11.324) BadgeCounter chip
              surfaces the unread count next to the
              Mark-all-read button so the operator sees the
              workload before clicking. tone="accent" matches
              the rest-of-app warning palette for "needs
              attention" affordances. Hidden when there is
              nothing to mark. */}
          {totalUnread > 0 ? (
            <BadgeCounter
              count={totalUnread}
              tone="accent"
              size="sm"
              srLabel={`${totalUnread} unread notification${totalUnread === 1 ? '' : 's'}`}
              data-testid="notifications-unread-counter"
            />
          ) : null}
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={handleMarkAllRead}
            disabled={totalUnread === 0}
            aria-label="Mark all notifications as read"
          >
            Mark all read
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={openClearConfirm}
            disabled={totalCount === 0}
            aria-label="Clear all notifications"
            data-testid="notifications-clear-all"
          >
            <Trash2 className="mr-1 h-3.5 w-3.5" />
            Clear all
          </Button>
        </div>
      }
    >
      {usingMocks && (
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="uppercase">
            sample data
          </Badge>
          <span className="text-xs text-muted-foreground">
            Showing inline placeholder events - /api/notifications is not
            available yet.
          </span>
        </div>
      )}

      {/* (v1.11.342, TODO 11.324) Tabs primitive replaces
          the prior hand-rolled <button><Chip> filter strip.
          Each tab label embeds the per-kind count chip. The
          role="group" wrapper is preserved so the existing
          accessibility hook ("Filter notifications by type")
          and the per-key data-filter attribute (used by
          tests + e2e) survive the swap. */}
      <div
        role="group"
        aria-label="Filter notifications by type"
        className="flex flex-wrap items-center gap-2"
        data-testid="notifications-filter-tabs"
      >
        <Tabs
          value={activeFilter}
          onChange={(value) => {
            setActiveFilter(value as FilterKey);
            setVisibleLimit(PAGE_SIZE);
          }}
          items={tabItems}
          ariaLabel="Filter notifications by type"
        />
      </div>

      <Panel className="p-4">
        {filtered.length === 0 ? (
          <EmptyState
            size={activeFilter === 'all' ? 'lg' : 'md'}
            icon={<BellOff className="h-6 w-6" />}
            title="No notifications match"
            description={
              activeFilter === 'all'
                ? 'You are all caught up - no notifications to show.'
                : `No ${activeFilter} notifications in the current window.`
            }
            secondaryAction={
              activeFilter === 'all'
                ? { label: 'Configure webhooks', href: '#feature=settings' }
                : {
                    label: 'Show all types',
                    onClick: () => setActiveFilter('all'),
                  }
            }
            data-testid="notifications-empty-state"
          />
        ) : (
          /* (v1.11.342, TODO 11.324) ScrollArea caps the
             feed height so a 50+ item Timeline does not
             push the page below the fold. Below the cap
             the Timeline scrolls inside its own scroll
             shell, leaving the toolbar + filter strip
             fixed in the viewport. */
          <ScrollArea
            axis="y"
            data-testid="notifications-scrollarea"
            className="max-h-[60vh]"
          >
            <Timeline items={timelineItems} groupByDay />
          </ScrollArea>
        )}
      </Panel>

      {canLoadMore && (
        <div className="flex justify-center">
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={handleLoadMore}
            aria-label="Load more notifications"
          >
            <Bell className="mr-1 h-3.5 w-3.5" />
            Load more
          </Button>
        </div>
      )}

      {undoActive ? (
        <UndoToast
          active={undoActive}
          data-testid="notifications-undo-banner"
        />
      ) : null}

      <ConfirmDialog
        open={confirmOpen}
        title="Clear all notifications?"
        description={
          totalCount > 0
            ? `This will remove all ${totalCount} notifications from the feed. You will have 5 seconds to undo.`
            : 'There are no notifications to clear.'
        }
        confirmLabel="Clear all"
        cancelLabel="Cancel"
        destructive
        initialFocus="cancel"
        onConfirm={confirmClearAll}
        onCancel={cancelClearConfirm}
      />

      {/* (v1.11.342, TODO 11.324) Success-path Toast slot
          for the Mark-all-read action. Clear-all still uses
          its own UndoToast banner above; this slot covers
          the lighter "I just flipped my unread chip"
          confirmation. */}
      <div className="pointer-events-none fixed right-4 top-4 z-50 flex flex-col gap-2">
        {toast && (
          <Toast
            key={toast.id}
            message={toast.message}
            type={toast.type}
            onDismiss={dismissToast}
          />
        )}
      </div>
    </PageFrame>
  );
}
