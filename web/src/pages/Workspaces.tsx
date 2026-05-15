import { useMemo, useRef, useState } from 'react';
import type { DragEvent, FormEvent, KeyboardEvent } from 'react';
import {
  CheckCircle2,
  Edit3,
  FolderTree,
  GitBranch,
  GripVertical,
  RefreshCw,
  RotateCcw,
  Save,
  X,
  XCircle,
} from 'lucide-react';
import PageFrame, { ErrorPanel } from './PageFrame';
import {
  Button,
  EmptyState,
  HeroCard,
  IconButton,
  Input,
  Panel,
  Tooltip,
} from '../components/ui';
import { WelcomeOnboardingIllustration } from '../components/illustrations';
import { cn } from '../lib/cn';
import { t, useLocale } from '../lib/i18n';
import { text } from '../lib/typography';
import { useWorkspaces, type Workspace } from '../lib/use-workspaces';
import {
  applyWorkspaceOrder,
  useWorkspacePrefs,
} from '../lib/use-workspace-prefs';

// (v1.10.379) Workspaces -- multi-repo workspace listing from
// config.workspaces. Read-only for now on the daemon side; the
// daemon doesn't expose mutation endpoints (workspaces are
// config-driven).
//
// (v1.11.255, TODO 11.237) Page polish:
//   - HeroCard intro restated with operator-friendly hint.
//   - Drag-reorder via HTML5 DnD (operator-local, persisted to
//     localStorage via lib/use-workspace-prefs). Reorder is a
//     display-only override -- CLI flags still see the
//     canonical name; the order survives across reloads.
//   - Inline edit name -> persists a display alias for the row
//     (the canonical id stays put so --workspace <name> on the
//     CLI keeps working). The alias is also operator-local.
//
// (v1.10.731) Fetch + state machine moved to lib/use-workspaces.

interface RowProps {
  workspace: Workspace;
  alias: string | undefined;
  busy: boolean;
  onStartDrag: (name: string) => void;
  onDropTarget: (target: string) => void;
  onSetAlias: (name: string, alias: string) => void;
}

function WorkspaceRow({
  workspace,
  alias,
  busy,
  onStartDrag,
  onDropTarget,
  onSetAlias,
}: RowProps) {
  const displayName = alias && alias.length > 0 ? alias : workspace.name;
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(displayName);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const onEdit = () => {
    setDraft(displayName);
    setEditing(true);
    queueMicrotask(() => inputRef.current?.focus());
  };

  const onCancel = () => {
    setEditing(false);
    setDraft(displayName);
  };

  const onCommit = () => {
    const trimmed = draft.trim();
    // Empty input clears the alias and falls back to the
    // canonical workspace.name. Same-as-canonical also clears so
    // we do not persist redundant identity aliases.
    if (trimmed.length === 0 || trimmed === workspace.name) {
      onSetAlias(workspace.name, '');
    } else {
      onSetAlias(workspace.name, trimmed);
    }
    setEditing(false);
  };

  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    onCommit();
  };

  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      onCancel();
    }
  };

  const handleDragStart = (e: DragEvent<HTMLLIElement>) => {
    onStartDrag(workspace.name);
    try {
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', workspace.name);
    } catch {
      /* ignore: jsdom lacks dataTransfer */
    }
  };

  const handleDragOver = (e: DragEvent<HTMLLIElement>) => {
    e.preventDefault();
    try {
      e.dataTransfer.dropEffect = 'move';
    } catch {
      /* ignore */
    }
  };

  const handleDrop = (e: DragEvent<HTMLLIElement>) => {
    e.preventDefault();
    onDropTarget(workspace.name);
  };

  return (
    <li
      draggable={!busy && !editing}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
      data-testid={`workspace-row-${workspace.name}`}
      data-workspace-alias={alias || undefined}
      className="flex flex-col gap-0.5 py-2"
    >
      <div className="flex flex-wrap items-center gap-2">
        <Tooltip label="Drag to reorder">
          <span
            aria-hidden
            className="inline-flex h-5 w-5 cursor-grab items-center justify-center text-muted-foreground"
            data-testid={`workspace-drag-${workspace.name}`}
          >
            <GripVertical className="h-3.5 w-3.5" />
          </span>
        </Tooltip>
        {editing ? (
          <form
            onSubmit={onSubmit}
            className="inline-flex items-center gap-1"
            data-testid={`workspace-edit-${workspace.name}`}
          >
            <Input
              ref={inputRef}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={onKey}
              onBlur={onCommit}
              className="h-7 w-44 font-mono text-[12px]"
              aria-label={`Rename workspace ${workspace.name}`}
            />
            <IconButton
              type="submit"
              size="sm"
              aria-label="Save alias"
              data-testid={`workspace-edit-save-${workspace.name}`}
              icon={<Save className="h-3 w-3" />}
            />
            <IconButton
              type="button"
              size="sm"
              variant="ghost"
              aria-label="Cancel rename"
              onClick={onCancel}
              data-testid={`workspace-edit-cancel-${workspace.name}`}
              icon={<X className="h-3 w-3" />}
            />
          </form>
        ) : (
          <>
            <span className="font-mono text-[12px] font-medium">
              {displayName}
            </span>
            {alias && alias.length > 0 ? (
              <span
                className="font-mono text-[10px] text-muted-foreground"
                data-testid={`workspace-canonical-${workspace.name}`}
              >
                ({workspace.name})
              </span>
            ) : null}
            <Tooltip label="Rename (local alias only)">
              <IconButton
                type="button"
                size="sm"
                variant="ghost"
                onClick={onEdit}
                aria-label={`Rename ${workspace.name}`}
                data-testid={`workspace-edit-trigger-${workspace.name}`}
                icon={<Edit3 className="h-3 w-3" />}
              />
            </Tooltip>
          </>
        )}
        {workspace.exists ? (
          <span className="inline-flex items-center gap-1 text-[10px] text-success">
            <CheckCircle2 className="h-3 w-3" aria-hidden />
            {t('workspaces.exists')}
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 text-[10px] text-destructive">
            <XCircle className="h-3 w-3" aria-hidden />
            {t('workspaces.missing')}
          </span>
        )}
        {workspace.exists &&
          (workspace.isGitRepo ? (
            <span className="inline-flex items-center gap-1 text-[10px] text-success">
              <GitBranch className="h-3 w-3" aria-hidden />
              {t('workspaces.gitRepo')}
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 text-[10px] text-warning">
              <GitBranch className="h-3 w-3" aria-hidden />
              {t('workspaces.notGitRepo')}
            </span>
          ))}
      </div>
      <code className="block break-all font-mono text-[11px] text-muted-foreground">
        {workspace.path}
      </code>
    </li>
  );
}

export default function Workspaces() {
  useLocale();
  const { data, error, loading, refresh } = useWorkspaces();
  const { order, aliases, setOrder, setAlias, clearAll } =
    useWorkspacePrefs();
  const dragName = useRef<string | null>(null);

  const ordered = useMemo<Workspace[]>(() => {
    if (!data) return [];
    return applyWorkspaceOrder(data, order);
  }, [data, order]);

  const handleStartDrag = (name: string) => {
    dragName.current = name;
  };

  const handleDropTarget = (target: string) => {
    const src = dragName.current;
    dragName.current = null;
    if (!src || src === target) return;
    const names = ordered.map((w) => w.name);
    const from = names.indexOf(src);
    const to = names.indexOf(target);
    if (from < 0 || to < 0) return;
    const next = [...names];
    next.splice(from, 1);
    next.splice(to, 0, src);
    setOrder(next);
  };

  const hasOverride =
    order.length > 0 || Object.keys(aliases).length > 0;

  return (
    <PageFrame
      title={t('workspaces.title')}
      description={t('workspaces.description')}
      actions={
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={refresh}
          disabled={loading}
          aria-label={t('workspaces.refresh.label')}
        >
          <RefreshCw className={cn('h-3.5 w-3.5', loading && 'animate-spin')} />
          <span>{t('common.refresh')}</span>
        </Button>
      }
    >
      <HeroCard
        size="sm"
        tone="info"
        icon={<FolderTree className="h-5 w-5" aria-hidden />}
        title="Workspace overview"
        description={t('workspaces.intro')}
        cta={
          hasOverride ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={clearAll}
              data-testid="workspaces-reset-prefs"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              <span>Reset order + aliases</span>
            </Button>
          ) : undefined
        }
      />

      <Panel className="text-sm">
        <h3
          className={cn(
            'mb-2 flex items-center gap-2 text-foreground',
            text.h3,
          )}
        >
          <FolderTree className="h-4 w-4 text-muted-foreground" aria-hidden />
          {t('workspaces.heading')}
        </h3>
        {error ? <ErrorPanel message={error} /> : null}
        {!data ? (
          <div className="text-[12px] text-muted-foreground">
            {t('common.loading')}
          </div>
        ) : ordered.length === 0 ? (
          <EmptyState
            icon={
              <span data-testid="workspaces-empty-illustration">
                <WelcomeOnboardingIllustration size={160} />
              </span>
            }
            title={t('workspaces.empty')}
          />
        ) : (
          <ul
            className="divide-y divide-border/40 text-[12px]"
            data-testid="workspaces-list"
          >
            {ordered.map((w) => (
              <WorkspaceRow
                key={w.name}
                workspace={w}
                alias={aliases[w.name]}
                busy={loading}
                onStartDrag={handleStartDrag}
                onDropTarget={handleDropTarget}
                onSetAlias={setAlias}
              />
            ))}
          </ul>
        )}
      </Panel>
    </PageFrame>
  );
}
