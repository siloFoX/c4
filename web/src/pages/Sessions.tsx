import { useMemo, useState } from 'react';
import { Search, Activity, Archive, ListFilter } from 'lucide-react';
import PageFrame from './PageFrame';
import {
  Avatar,
  Badge,
  Card,
  CardContent,
  Drawer,
  EmptyState,
  Panel,
  SearchBar,
  Tabs,
  TabsPanel,
  TimeAgo,
  type TabsItem,
} from '../components/ui';
import { cn } from '../lib/cn';

// (v1.11.334, TODO 11.316) Sessions feature page. The
// daemon does not yet expose a list endpoint at
// `/api/sessions` (only the per-id `/api/sessions/<id>`
// route used by `lib/use-conversation`), so this page
// is mock-data-driven for now -- the real endpoint will
// drop in as a `loadSessions` prop swap when it lands.
// The page exercises the dispatch's UI requirements:
//
//   - Tabs for active / archived / all.
//   - Avatar (with status overlay) for each row.
//   - SearchBar with debounce (200ms via primitive).
//   - Drawer for the detail view (right-anchored).

export type SessionStatus = 'active' | 'archived';

export interface SessionEntry {
  id: string;
  name: string;
  status: SessionStatus;
  worker: string;
  startedAt: string;
  lastActiveAt: string;
  taskPreview: string;
  notes?: string;
}

export interface SessionsProps {
  // Optional override so tests / specialised mounts can
  // inject deterministic data. Production mounts pass
  // nothing and get the demo dataset until the daemon
  // endpoint lands.
  sessions?: SessionEntry[];
}

const DEMO_SESSIONS: SessionEntry[] = [
  {
    id: 'sess-001',
    name: 'auto-mgr',
    status: 'active',
    worker: 'auto-mgr',
    startedAt: new Date(Date.now() - 1000 * 60 * 27).toISOString(),
    lastActiveAt: new Date(Date.now() - 1000 * 45).toISOString(),
    taskPreview: 'Dispatch 11.316 sessions polish',
    notes: 'Manager session driving the autonomous loop.',
  },
  {
    id: 'sess-002',
    name: 'auto-w91',
    status: 'active',
    worker: 'auto-w91',
    startedAt: new Date(Date.now() - 1000 * 60 * 12).toISOString(),
    lastActiveAt: new Date(Date.now() - 1000 * 60 * 2).toISOString(),
    taskPreview: 'Refactor textarea char count',
    notes: 'Worker assigned to UI lib push.',
  },
  {
    id: 'sess-003',
    name: 'plan-w42',
    status: 'archived',
    worker: 'plan-w42',
    startedAt: new Date(Date.now() - 1000 * 60 * 60 * 9).toISOString(),
    lastActiveAt: new Date(Date.now() - 1000 * 60 * 60 * 6).toISOString(),
    taskPreview: 'Design web routing migration',
    notes: 'Plan-only worker; merged outcome to design log.',
  },
  {
    id: 'sess-004',
    name: 'auto-w74',
    status: 'archived',
    worker: 'auto-w74',
    startedAt: new Date(Date.now() - 1000 * 60 * 60 * 22).toISOString(),
    lastActiveAt: new Date(Date.now() - 1000 * 60 * 60 * 20).toISOString(),
    taskPreview: 'CHANGELOG sweep + i18n lockstep',
    notes: 'Closed cleanly after merge.',
  },
];

type TabKey = 'active' | 'archived' | 'all';

function matchesFilter(s: SessionEntry, needle: string): boolean {
  const n = needle.trim().toLowerCase();
  if (!n) return true;
  if (s.name.toLowerCase().includes(n)) return true;
  if (s.worker.toLowerCase().includes(n)) return true;
  if (s.taskPreview.toLowerCase().includes(n)) return true;
  if (s.id.toLowerCase().includes(n)) return true;
  return false;
}

interface SessionRowProps {
  session: SessionEntry;
  onOpen: (id: string) => void;
}

function SessionRow({ session, onOpen }: SessionRowProps) {
  const active = session.status === 'active';
  return (
    <li
      data-session-id={session.id}
      data-session-status={session.status}
      data-section="sessions-row"
    >
      <button
        type="button"
        onClick={() => onOpen(session.id)}
        className={cn(
          'flex w-full items-center gap-3 rounded-md border border-border bg-muted/10 p-3 text-left text-sm hover:bg-muted/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background',
        )}
        data-testid={`sessions-row-${session.id}`}
      >
        <Avatar
          name={session.name}
          size="sm"
          status={active ? 'online' : 'offline'}
        />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-medium truncate" data-section="sessions-row-name">
              {session.name}
            </span>
            <Badge
              variant={active ? 'success' : 'secondary'}
              className="uppercase"
            >
              {session.status}
            </Badge>
          </div>
          <div className="mt-0.5 text-xs text-muted-foreground truncate">
            {session.taskPreview}
          </div>
        </div>
        <div className="hidden md:block text-xs text-muted-foreground shrink-0">
          <TimeAgo value={session.lastActiveAt} variant="short" />
        </div>
      </button>
    </li>
  );
}

export default function Sessions({
  sessions = DEMO_SESSIONS,
}: SessionsProps = {}) {
  const [activeTab, setActiveTab] = useState<TabKey>('active');
  const [filter, setFilter] = useState('');
  const [drawerId, setDrawerId] = useState<string | null>(null);

  const tabItems: TabsItem[] = useMemo(
    () => [
      {
        value: 'active',
        label: 'Active',
        icon: <Activity className="h-3.5 w-3.5" aria-hidden="true" />,
      },
      {
        value: 'archived',
        label: 'Archived',
        icon: <Archive className="h-3.5 w-3.5" aria-hidden="true" />,
      },
      {
        value: 'all',
        label: 'All',
        icon: <ListFilter className="h-3.5 w-3.5" aria-hidden="true" />,
      },
    ],
    [],
  );

  const filtered = useMemo(() => {
    return sessions.filter((s) => {
      if (activeTab === 'active' && s.status !== 'active') return false;
      if (activeTab === 'archived' && s.status !== 'archived') return false;
      return matchesFilter(s, filter);
    });
  }, [sessions, activeTab, filter]);

  const drawerSession = useMemo(
    () => sessions.find((s) => s.id === drawerId) ?? null,
    [sessions, drawerId],
  );

  return (
    <PageFrame
      title="Sessions"
      description="Operator session log. Tabs split active / archived; click a row to inspect."
    >
      <div data-section="sessions-page" className="flex flex-col gap-4">
        <Card>
          <CardContent className="flex flex-col gap-4 p-4 md:p-6">
            <div className="flex items-center gap-2">
              <SearchBar
                size="sm"
                value={filter}
                onChange={setFilter}
                onDebouncedChange={setFilter}
                placeholder="Filter sessions..."
                ariaLabel="Filter sessions"
                data-testid="sessions-search"
              />
            </div>
            <Tabs
              value={activeTab}
              onChange={(v) => setActiveTab(v as TabKey)}
              items={tabItems}
              ariaLabel="Sessions sections"
            >
              <TabsPanel value="active" className="mt-3">
                <SessionList sessions={filtered} onOpen={setDrawerId} />
              </TabsPanel>
              <TabsPanel value="archived" className="mt-3">
                <SessionList sessions={filtered} onOpen={setDrawerId} />
              </TabsPanel>
              <TabsPanel value="all" className="mt-3">
                <SessionList sessions={filtered} onOpen={setDrawerId} />
              </TabsPanel>
            </Tabs>
          </CardContent>
        </Card>
        <Drawer
          open={drawerId !== null}
          onOpenChange={(open) => {
            if (!open) setDrawerId(null);
          }}
          side="right"
          width={360}
          title={drawerSession?.name ?? 'Session detail'}
          description={
            drawerSession ? `Session ${drawerSession.id}` : undefined
          }
          data-testid="sessions-drawer"
        >
          {drawerSession ? (
            <SessionDetail session={drawerSession} />
          ) : (
            <EmptyState
              title="No session selected"
              description="Pick a session from the list to inspect it."
            />
          )}
        </Drawer>
      </div>
    </PageFrame>
  );
}

interface SessionListProps {
  sessions: SessionEntry[];
  onOpen: (id: string) => void;
}

function SessionList({ sessions, onOpen }: SessionListProps) {
  if (sessions.length === 0) {
    return (
      <EmptyState
        title="No sessions match"
        description="Adjust the search filter or switch tabs."
        icon={<Search className="h-5 w-5" aria-hidden="true" />}
      />
    );
  }
  return (
    <ul
      className="flex flex-col gap-2"
      data-section="sessions-list"
      data-count={sessions.length}
    >
      {sessions.map((s) => (
        <SessionRow key={s.id} session={s} onOpen={onOpen} />
      ))}
    </ul>
  );
}

interface SessionDetailProps {
  session: SessionEntry;
}

function SessionDetail({ session }: SessionDetailProps) {
  const active = session.status === 'active';
  return (
    <div
      data-section="sessions-detail"
      data-session-id={session.id}
      className="flex flex-col gap-3"
    >
      <div className="flex items-center gap-3">
        <Avatar
          name={session.name}
          size="md"
          status={active ? 'online' : 'offline'}
        />
        <div className="flex flex-col">
          <span className="font-medium">{session.name}</span>
          <Badge
            variant={active ? 'success' : 'secondary'}
            className="mt-1 w-fit uppercase"
          >
            {session.status}
          </Badge>
        </div>
      </div>
      <Panel className="text-sm">
        <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Task
        </h3>
        <p>{session.taskPreview}</p>
      </Panel>
      <Panel className="text-sm">
        <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Timing
        </h3>
        <ul className="space-y-1 text-xs text-muted-foreground">
          <li>
            Started: <TimeAgo value={session.startedAt} variant="long" />
          </li>
          <li>
            Last active:{' '}
            <TimeAgo value={session.lastActiveAt} variant="long" />
          </li>
        </ul>
      </Panel>
      {session.notes ? (
        <Panel className="text-sm">
          <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Notes
          </h3>
          <p>{session.notes}</p>
        </Panel>
      ) : null}
    </div>
  );
}
