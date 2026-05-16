import { useCallback, useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, X } from 'lucide-react';
import {
  Badge,
  BulkActionToolbar,
  ContextMenu,
  EmptyState,
  ListActionMenu,
  ListItem,
  Skeleton,
  StatusDot,
  StatusPill,
  Timeline,
} from './ui';
import type {
  ContextMenuItem,
  StatusDotVariant,
  StatusPillStatus,
} from './ui';
import type { TimelineItem } from './ui';
import { WelcomeOnboardingIllustration } from './illustrations';
import { cn } from '../lib/cn';
import { t, useLocale } from '../lib/i18n';
import {
  formatRelative,
  shortId,
  type SessionGroup,
} from './SessionsView';

// (v1.10.579) Extracted from SessionsView. The /api/sessions
// project-grouped list (left pane second section). Each group
// folds; each session is a click target. Pure display: parent
// owns collapsed map + selection.

interface Props {
  filteredGroups: SessionGroup[];
  error: string | null;
  loading: boolean;
  collapsed: Record<string, boolean>;
  onToggleGroup: (key: string) => void;
  selectedSessionId: string | null;
  onSelect: (sessionId: string) => void;
}

export default function SessionsListSection({
  filteredGroups,
  error,
  loading,
  collapsed,
  onToggleGroup,
  selectedSessionId,
  onSelect,
}: Props) {
  useLocale();

  // (11.191) Bulk selection state - context-menu toggle.
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const toggleSelected = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);
  const clearSelection = useCallback(() => setSelectedIds(new Set()), []);
  const closeSelected = useCallback(() => {
    // Placeholder: no backend wired yet.
    clearSelection();
  }, [clearSelection]);

  // (v1.11.167) patch 11.149 - recent activity timeline subset.
  // Read-only preview alongside the interactive group list below;
  // the existing buttons remain authoritative for selection.
  const recentTimeline = useMemo<TimelineItem[]>(() => {
    const flat = filteredGroups.flatMap((g) => g.sessions);
    flat.sort((a, b) => {
      const at = a.updatedAt ? Date.parse(a.updatedAt) : 0;
      const bt = b.updatedAt ? Date.parse(b.updatedAt) : 0;
      return bt - at;
    });
    return flat.slice(0, 5).map((s) => ({
      id: s.sessionId,
      timestamp: s.updatedAt ?? new Date().toISOString(),
      title: shortId(s.sessionId),
      description: s.lastAssistantSnippet || s.projectPath || s.projectDir || '',
      tone: 'primary' as const,
    }));
  }, [filteredGroups]);

  if (error) {
    return <div className="p-4 text-sm text-destructive">{error}</div>;
  }
  if (filteredGroups.length === 0) {
    if (loading) {
      return (
        <div
          className="flex flex-col gap-2 p-4"
          aria-label={t('sessions.loadingSessions')}
          data-sessions-loading="1"
        >
          <Skeleton variant="row" />
          <Skeleton variant="row" />
          <Skeleton variant="row" />
        </div>
      );
    }
    return (
      <EmptyState
        size="lg"
        icon={
          <WelcomeOnboardingIllustration
            className="text-muted-foreground"
            size={160}
          />
        }
        title={t('sessions.empty')}
        description="No sessions are attached or saved on disk yet. Start a new chat or attach an existing worker session to populate this list."
        secondaryAction={{
          label: 'Read the Sessions guide',
          href: '#feature=help',
        }}
        className="m-4"
        data-testid="sessions-list-empty-state"
      />
    );
  }
  return (
    <>
      {recentTimeline.length > 0 ? (
        <div className="border-b border-border bg-muted/20 px-4 py-3">
          <div className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Recent activity
          </div>
          <Timeline items={recentTimeline} />
        </div>
      ) : null}
      <ul className="divide-y divide-border">
      {filteredGroups.map((group) => {
        const key = group.projectDir || group.projectPath || 'unknown';
        const isCollapsed = Boolean(collapsed[key]);
        return (
          <li key={key} className="bg-card">
            <button
              type="button"
              className="flex w-full items-center gap-2 px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground hover:bg-accent hover:text-accent-foreground"
              onClick={() => onToggleGroup(key)}
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
                  const active = selectedSessionId === session.sessionId;
                  const updatedMs = session.updatedAt
                    ? Date.parse(session.updatedAt)
                    : 0;
                  const ageMs = updatedMs ? Date.now() - updatedMs : Infinity;
                  let dotVariant: StatusDotVariant = 'unknown';
                  // (v1.11.278, TODO 11.260) Status freshness now
                  // drives both the legacy inline StatusDot (kept
                  // for the title row) AND a StatusPill in the
                  // trailing slot. Mapping:
                  //   <5min   -> online (alive + ready)
                  //   <60min  -> idle   (alive but quiet)
                  //   >=60min -> offline (likely stale)
                  let pillStatus: StatusPillStatus = 'offline';
                  if (updatedMs) {
                    if (ageMs < 5 * 60_000) {
                      dotVariant = 'online';
                      pillStatus = 'online';
                    } else if (ageMs < 60 * 60_000) {
                      dotVariant = 'away';
                      pillStatus = 'idle';
                    } else {
                      dotVariant = 'offline';
                      pillStatus = 'offline';
                    }
                  }
                  const isBulkSelected = selectedIds.has(session.sessionId);
                  const sessionMenuItems: ContextMenuItem[] = [
                    {
                      id: 'open',
                      label: 'Open',
                      onSelect: () => onSelect(session.sessionId),
                    },
                    { id: 'rename', label: 'Rename', onSelect: () => {} },
                    {
                      id: 'select',
                      label: isBulkSelected ? 'Deselect' : 'Select',
                      onSelect: () => toggleSelected(session.sessionId),
                    },
                    { id: 'sep', label: '', separator: true },
                    {
                      id: 'delete',
                      label: 'Delete',
                      danger: true,
                      onSelect: () => {},
                    },
                  ];
                  const listItem = (
                    <ListItem
                      onClick={() => onSelect(session.sessionId)}
                      active={active}
                      className={cn(
                        'rounded-none px-4 py-3',
                        active && 'bg-accent text-accent-foreground',
                        isBulkSelected && 'ring-2 ring-primary ring-inset',
                      )}
                      title={
                        <span className="inline-flex items-center gap-1.5 font-mono text-xs text-muted-foreground">
                          <StatusDot variant={dotVariant} size="sm" />
                          {shortId(session.sessionId)}
                        </span>
                      }
                      description={
                        <>
                          {session.lastAssistantSnippet ? (
                            <span className="block">{session.lastAssistantSnippet}</span>
                          ) : null}
                          <span className="block text-[11px]">
                            {formatRelative(session.updatedAt)}
                          </span>
                        </>
                      }
                      trailing={
                        /* (v1.11.278, TODO 11.260) Trailing
                           "status column" combines the StatusPill
                           freshness chip with the turn-count
                           Badge.
                           (v1.11.280, TODO 11.262) Now augmented
                           with a ListActionMenu (3-dot ellipsis)
                           that surfaces the same Open / Select /
                           Rename / Delete actions as the existing
                           right-click ContextMenu, so mouse-only
                           and touch operators do not have to
                           discover the right-click affordance. */
                        <span
                          className="inline-flex items-center gap-1"
                          data-testid={`sessions-row-status-${session.sessionId}`}
                        >
                          <StatusPill
                            status={pillStatus}
                            size="sm"
                            label={null}
                            pulse={pillStatus === 'online'}
                            aria-label={`Session status: ${pillStatus}`}
                          />
                          <Badge variant="secondary">{session.turnCount}</Badge>
                          <ListActionMenu
                            size="sm"
                            ariaLabel={`Actions for session ${shortId(session.sessionId)}`}
                            triggerTestId={`sessions-row-actions-${session.sessionId}`}
                            actions={[
                              {
                                id: 'open',
                                label: 'Open',
                                onSelect: () => onSelect(session.sessionId),
                              },
                              {
                                id: 'select',
                                label: isBulkSelected ? 'Deselect' : 'Select',
                                onSelect: () => toggleSelected(session.sessionId),
                              },
                              {
                                id: 'rename',
                                label: 'Rename',
                                onSelect: () => {},
                              },
                              {
                                id: 'delete',
                                label: 'Delete',
                                variant: 'danger',
                                onSelect: () => {},
                              },
                            ]}
                          />
                        </span>
                      }
                    />
                  );
                  return (
                    <ContextMenu
                      key={session.sessionId}
                      trigger={listItem}
                      items={sessionMenuItems}
                      ariaLabel={`Session ${shortId(session.sessionId)} actions`}
                    />
                  );
                })
              : null}
          </li>
        );
      })}
    </ul>
    <BulkActionToolbar
      selectedCount={selectedIds.size}
      onClearSelection={clearSelection}
      ariaLabel="Session bulk actions"
      actions={[
        {
          id: 'close',
          label: 'Close selected',
          icon: <X className="h-3.5 w-3.5" />,
          tone: 'danger',
          onClick: closeSelected,
        },
      ]}
    />
    </>
  );
}
