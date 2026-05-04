import { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, FolderTree, GitBranch, RefreshCw, XCircle } from 'lucide-react';
import PageFrame, { ErrorPanel } from './PageFrame';
import { Button, Panel } from '../components/ui';
import { apiGet } from '../lib/api';
import { cn } from '../lib/cn';

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

interface Workspace {
  name: string;
  path: string;
  exists: boolean;
  isGitRepo: boolean;
}

interface WorkspacesResponse {
  workspaces: Workspace[];
}

export default function Workspaces() {
  const [data, setData] = useState<Workspace[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiGet<WorkspacesResponse>('/api/workspaces');
      setData(res.workspaces || []);
    } catch (e) {
      setError((e as Error).message || 'Failed to load workspaces');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  return (
    <PageFrame
      title="Workspaces"
      description="Multi-repo workspaces from config.workspaces."
      actions={
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={refresh}
          disabled={loading}
          aria-label="Refresh workspaces"
        >
          <RefreshCw className={cn('h-3.5 w-3.5', loading && 'animate-spin')} />
          <span>Refresh</span>
        </Button>
      }
    >
      <div className="rounded-md border border-border bg-muted/10 p-3 text-[12px] text-muted-foreground">
        Mirrors <code className="font-mono">c4 workspaces</code>.
        Workspaces are configured in <code className="font-mono">config.workspaces</code>;
        edit the daemon's config.json + reload to add or remove
        entries (Config page → Reload from disk).
      </div>

      <Panel className="text-sm">
        <h3 className="mb-2 flex items-center gap-2 text-base font-semibold text-foreground">
          <FolderTree className="h-4 w-4 text-muted-foreground" aria-hidden />
          Configured workspaces
        </h3>
        {error ? <ErrorPanel message={error} /> : null}
        {!data ? (
          <div className="text-[12px] text-muted-foreground">Loading…</div>
        ) : data.length === 0 ? (
          <div className="text-[12px] text-muted-foreground">
            No workspaces configured. Set <code className="font-mono">config.workspaces</code> as an array of <code className="font-mono">{`{name, path}`}</code>.
          </div>
        ) : (
          <ul className="divide-y divide-border/40 text-[12px]">
            {data.map((w) => (
              <li key={w.name} className="flex flex-col gap-0.5 py-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-[12px] font-medium">{w.name}</span>
                  {w.exists ? (
                    <span className="inline-flex items-center gap-1 text-[10px] text-emerald-700 dark:text-emerald-400">
                      <CheckCircle2 className="h-3 w-3" aria-hidden />
                      exists
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-[10px] text-destructive">
                      <XCircle className="h-3 w-3" aria-hidden />
                      missing
                    </span>
                  )}
                  {w.exists && (
                    w.isGitRepo ? (
                      <span className="inline-flex items-center gap-1 text-[10px] text-emerald-700 dark:text-emerald-400">
                        <GitBranch className="h-3 w-3" aria-hidden />
                        git repo
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-[10px] text-amber-700 dark:text-amber-400">
                        <GitBranch className="h-3 w-3" aria-hidden />
                        not a git repo
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
