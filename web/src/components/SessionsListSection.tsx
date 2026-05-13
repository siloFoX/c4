import { ChevronDown, ChevronRight } from 'lucide-react';
import { Badge, EmptyState, Skeleton } from './ui';
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
        icon={
          <WelcomeOnboardingIllustration
            className="text-muted-foreground"
            size={160}
          />
        }
        title={t('sessions.empty')}
        className="m-4"
      />
    );
  }
  return (
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
                  return (
                    <button
                      key={session.sessionId}
                      type="button"
                      onClick={() => onSelect(session.sessionId)}
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
  );
}
