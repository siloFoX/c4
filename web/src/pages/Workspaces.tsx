import { CheckCircle2, FolderTree, GitBranch, RefreshCw, XCircle } from 'lucide-react';
import PageFrame, { ErrorPanel } from './PageFrame';
import { Button, EmptyState, HeroCard, Panel } from '../components/ui';
import { WelcomeOnboardingIllustration } from '../components/illustrations';
import { cn } from '../lib/cn';
import { t, useLocale } from '../lib/i18n';
import { text } from '../lib/typography';
import { useWorkspaces } from '../lib/use-workspaces';

// (v1.10.379) Workspaces — multi-repo workspace listing from
// config.workspaces. Read-only for now; the daemon doesn't
// expose mutation endpoints (workspaces are config-driven).
//
// Each row shows:
//   name        — friendly id used by --workspace flag
//   path        — absolute path to the repo root
//   exists      — `path` resolves on disk
//   isGitRepo   — `.git` directory present (or worktree pointer)
//
// Failure modes:
//   - exists=false: config drifted from disk
//   - exists=true && isGitRepo=false: directory exists but
//     daemon can't operate on it (worktree paths need git)
// Both render with a destructive-tone status icon.
// (v1.10.731) Fetch + state machine moved to lib/use-workspaces.

export default function Workspaces() {
  useLocale();
  const { data, error, loading, refresh } = useWorkspaces();

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
      />

      <Panel className="text-sm">
        <h3 className={cn('mb-2 flex items-center gap-2 text-foreground', text.h3)}>
          <FolderTree className="h-4 w-4 text-muted-foreground" aria-hidden />
          {t('workspaces.heading')}
        </h3>
        {error ? <ErrorPanel message={error} /> : null}
        {!data ? (
          <div className="text-[12px] text-muted-foreground">{t('common.loading')}</div>
        ) : data.length === 0 ? (
          <EmptyState
            icon={
              <span data-testid="workspaces-empty-illustration">
                <WelcomeOnboardingIllustration size={160} />
              </span>
            }
            title={t('workspaces.empty')}
          />
        ) : (
          <ul className="divide-y divide-border/40 text-[12px]">
            {data.map((w) => (
              <li key={w.name} className="flex flex-col gap-0.5 py-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-[12px] font-medium">{w.name}</span>
                  {w.exists ? (
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
                  {w.exists && (
                    w.isGitRepo ? (
                      <span className="inline-flex items-center gap-1 text-[10px] text-success">
                        <GitBranch className="h-3 w-3" aria-hidden />
                        {t('workspaces.gitRepo')}
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-[10px] text-warning">
                        <GitBranch className="h-3 w-3" aria-hidden />
                        {t('workspaces.notGitRepo')}
                      </span>
                    )
                  )}
                </div>
                <code className="block break-all font-mono text-[11px] text-muted-foreground">
                  {w.path}
                </code>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </PageFrame>
  );
}
