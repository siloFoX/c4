import { ChevronDown, ChevronRight, Link2 } from 'lucide-react';
import { Avatar, AvatarGroup, Badge } from './ui';
import { cn } from '../lib/cn';
import { t, useLocale } from '../lib/i18n';
import {
  shortId,
  type AttachedSession,
} from './SessionsView';
import RelativeTime from './RelativeTime';
import SessionsEmptyAttachBanner from './SessionsEmptyAttachBanner';
import SessionsAttachedRowActions from './SessionsAttachedRowActions';

// (v1.10.578) Extracted from SessionsView. The attached-sessions
// section of the master pane — collapsible header, error / empty
// states (with the attach-banner CTA), and the row map (each row
// hosts the per-session SessionsAttachedRowActions panel).

interface Props {
  collapsed: boolean;
  onToggle: () => void;
  filtered: AttachedSession[];
  error: string | null;
  selectedName: string | null;
  onSelect: (name: string) => void;
  onAttachClick: () => void;
  onDetach: (name: string) => void;
}

export default function SessionsAttachedSection({
  collapsed,
  onToggle,
  filtered,
  error,
  selectedName,
  onSelect,
  onAttachClick,
  onDetach,
}: Props) {
  useLocale();
  return (
    <div className="border-b border-border">
      <button
        type="button"
        className="flex w-full items-center gap-2 bg-muted/40 px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground hover:bg-accent hover:text-accent-foreground"
        onClick={onToggle}
        aria-expanded={!collapsed}
      >
        {collapsed ? (
          <ChevronRight className="h-3.5 w-3.5" aria-hidden />
        ) : (
          <ChevronDown className="h-3.5 w-3.5" aria-hidden />
        )}
        <Link2 className="h-3.5 w-3.5" aria-hidden />
        <span className="normal-case text-foreground">{t('sessions.section.attached')}</span>
        {/* (v1.11.272, TODO 11.254) AvatarGroup roster preview.
            When collapsed the operator still sees who is attached;
            when expanded the per-row Avatars stay (the group is
            just a header summary). max=4 caps the visible stack
            so wide rosters collapse to "+N". */}
        {filtered.length > 0 ? (
          <AvatarGroup
            items={filtered.map((a) => ({ name: a.name }))}
            max={4}
            size="sm"
            className="ml-auto"
            data-testid="sessions-attached-roster"
          />
        ) : (
          <span className="ml-auto rounded-full bg-background px-2 py-0.5 text-[10px] text-muted-foreground">
            {filtered.length}
          </span>
        )}
      </button>
      {!collapsed ? (
        error ? (
          <div className="p-4 text-sm text-destructive">{error}</div>
        ) : filtered.length === 0 ? (
          <div className="p-3">
            <SessionsEmptyAttachBanner onAttachClick={onAttachClick} />
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {filtered.map((a) => {
              const active = selectedName === a.name;
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
                      onClick={() => onSelect(a.name)}
                      aria-current={active ? 'true' : undefined}
                      className="flex-1 text-left"
                    >
                      <div className="flex items-center gap-2">
                        <Avatar name={a.name} size="sm" />
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
                          <span>
                            - <RelativeTime value={a.createdAt} />
                          </span>
                        ) : null}
                      </div>
                    </button>
                  </div>
                  <SessionsAttachedRowActions
                    session={a}
                    isSelected={active}
                    onView={() => onSelect(a.name)}
                    onDetach={() => onDetach(a.name)}
                  />
                </li>
              );
            })}
          </ul>
        )
      ) : null}
    </div>
  );
}
