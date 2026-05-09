import { RefreshCw, ShieldCheck, Users } from 'lucide-react';
import PageFrame, { ErrorPanel } from './PageFrame';
import { Badge, Button, Panel } from '../components/ui';
import { cn } from '../lib/cn';
import { t, tFormat, useLocale } from '../lib/i18n';
import { useRbac } from '../lib/use-rbac';

// (v1.10.383) RBAC viewer — read-only listing of roles + per-user
// grants from the daemon's auth subsystem. Mutation endpoints
// (assign / grant / revoke / check) exist but are admin-only and
// each carries enough validation that a single page can't safely
// expose them yet. This slice gives operators a way to *see* the
// current state without dropping to CLI.
// (v1.10.729) Roles + users dual-fetch moved to lib/use-rbac.

const ROLE_TONE: Record<string, string> = {
  admin: 'bg-destructive/10 text-destructive border-destructive/40',
  manager: 'bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/40',
  viewer: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/40',
};

export default function Rbac() {
  useLocale();
  const { roles, users, error, loading, refresh } = useRbac();

  return (
    <PageFrame
      title={t('rbac.title')}
      description={t('rbac.description')}
      actions={
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={refresh}
          disabled={loading}
          aria-label={t('rbac.refresh.label')}
        >
          <RefreshCw className={cn('h-3.5 w-3.5', loading && 'animate-spin')} />
          <span>{t('common.refresh')}</span>
        </Button>
      }
    >
      <div className="rounded-md border border-border bg-muted/10 p-3 text-[12px] text-muted-foreground">
        {t('rbac.intro')}
      </div>

      {error ? <ErrorPanel message={error} /> : null}

      <Panel className="text-sm">
        <h3 className="mb-2 flex items-center gap-2 text-base font-semibold text-foreground">
          <ShieldCheck className="h-4 w-4 text-muted-foreground" aria-hidden />
          {t('rbac.roles.heading')}
        </h3>
        {!roles ? (
          <div className="text-[12px] text-muted-foreground">{t('common.loading')}</div>
        ) : roles.length === 0 ? (
          <div className="text-[12px] text-muted-foreground">{t('rbac.roles.empty')}</div>
        ) : (
          <ul className="space-y-2 text-[12px]">
            {roles.map((r) => (
              <li key={r.name}>
                <div className="flex items-center gap-2">
                  <Badge className={cn('uppercase', ROLE_TONE[r.name] || '')}>
                    {r.name}
                  </Badge>
                  <span className="text-muted-foreground">
                    {tFormat('rbac.roles.actionCount', { n: String(r.actions.length) })}
                  </span>
                </div>
                <div className="mt-1 flex flex-wrap gap-1 pl-3 text-[11px]">
                  {r.actions.map((a) => (
                    <code
                      key={a}
                      className="rounded border border-border bg-muted/30 px-1 font-mono text-[10px]"
                    >
                      {a}
                    </code>
                  ))}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <Panel className="mt-4 text-sm">
        <h3 className="mb-2 flex items-center gap-2 text-base font-semibold text-foreground">
          <Users className="h-4 w-4 text-muted-foreground" aria-hidden />
          {tFormat('rbac.users.heading', { n: String(users?.length ?? 0) })}
        </h3>
        {!users ? (
          <div className="text-[12px] text-muted-foreground">{t('common.loading')}</div>
        ) : users.length === 0 ? (
          <div className="text-[12px] text-muted-foreground">{t('rbac.users.empty')}</div>
        ) : (
          <ul className="divide-y divide-border/40 text-[12px]">
            {users.map((u) => {
              const grantKeys = Object.keys(u.grants || {});
              return (
                <li key={u.user} className="flex flex-col gap-1 py-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-[12px] font-medium">{u.user}</span>
                    <Badge className={cn('uppercase', ROLE_TONE[u.role] || '')}>
                      {u.role}
                    </Badge>
                    {grantKeys.length > 0 ? (
                      <span className="text-[10px] text-muted-foreground">
                        {tFormat('rbac.users.grantCount', { n: String(grantKeys.length) })}
                      </span>
                    ) : null}
                  </div>
                  {grantKeys.length > 0 ? (
                    <details>
                      <summary className="cursor-pointer text-[10px] text-muted-foreground">
                        {t('rbac.users.viewGrants')}
                      </summary>
                      <pre className="mt-1 overflow-auto rounded bg-muted/30 p-2 font-mono text-[10px]">
                        {JSON.stringify(u.grants, null, 2)}
                      </pre>
                    </details>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </Panel>
    </PageFrame>
  );
}
