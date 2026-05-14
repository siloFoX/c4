import { useEffect, useMemo, useState } from 'react';
import {
  AlertOctagon,
  AlertTriangle,
  Bell,
  BellOff,
  CheckCircle2,
  Info,
  Rocket,
} from 'lucide-react';
import PageFrame from './PageFrame';
import {
  Badge,
  Button,
  Chip,
  EmptyState,
  Panel,
  Timeline,
} from '../components/ui';
import type { TimelineItem, TimelineTone } from '../components/ui';
import { cn } from '../lib/cn';

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
        description: n.description,
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

  const handleMarkAllRead = () => {
    setReadAt(Date.now());
  };

  const handleLoadMore = () => {
    setVisibleLimit((n) => n + PAGE_SIZE);
  };

  const canLoadMore = filtered.length > visible.length;

  return (
    <PageFrame
      title="Notifications"
      description="Unified feed of lifecycle events from the autonomous loop and daemon."
      actions={
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

      <div
        role="group"
        aria-label="Filter notifications by type"
        className="flex flex-wrap items-center gap-2"
      >
        {FILTERS.map((f) => {
          const selected = activeFilter === f.key;
          return (
            <button
              key={f.key}
              type="button"
              onClick={() => {
                setActiveFilter(f.key);
                setVisibleLimit(PAGE_SIZE);
              }}
              aria-pressed={selected}
              data-filter={f.key}
              className={cn(
                'rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              )}
            >
              <Chip
                tone={selected ? 'primary' : 'neutral'}
                variant={selected ? 'solid' : 'subtle'}
                size="md"
              >
                {f.label}
              </Chip>
            </button>
          );
        })}
      </div>

      <Panel className="p-4">
        {filtered.length === 0 ? (
          <EmptyState
            icon={<BellOff className="h-6 w-6" />}
            title="No notifications match"
            description={
              activeFilter === 'all'
                ? 'You are all caught up - no notifications to show.'
                : `No ${activeFilter} notifications in the current window.`
            }
          />
        ) : (
          <Timeline items={timelineItems} groupByDay />
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
    </PageFrame>
  );
}
