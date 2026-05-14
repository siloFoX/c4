import { useCallback, useMemo, useState } from 'react';
import { ListChecks, RefreshCw } from 'lucide-react';
import PageFrame, { ErrorPanel, LoadingSkeleton } from './PageFrame';
import Toast from '../components/Toast';
import { PageDescriptionBanner } from '../components/PageDescriptionBanner';
import { openHelpDrawer } from '../components/HelpUIRoot';
import { Badge, Button, EmptyState, Input, Panel, Tooltip } from '../components/ui';
import { EmptyQueueIllustration } from '../components/illustrations';
import { cn } from '../lib/cn';
import { fuzzyFilter } from '../lib/fuzzyFilter';
import { t, useLocale } from '../lib/i18n';
import { text } from '../lib/typography';
import { useToast } from '../lib/use-toast';
import { useProfiles } from '../lib/use-profiles';

// 8.20B Profiles. Read-only list from GET /api/profiles. Add/edit/remove
// endpoints are tracked as a follow-up TODO; the UI toasts "Not
// implemented yet" for those actions so the permission matrix is still
// browsable today.
// (v1.10.722) Toast slot adopted from lib/use-toast (shared infra).
// (v1.10.746) Fetch + state machine moved to lib/use-profiles.

export default function Profiles() {
  useLocale();
  const { items, loading, error, refresh } = useProfiles();
  const [filter, setFilter] = useState('');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const { toast, showToast, dismissToast } = useToast();

  const toggle = useCallback((name: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  }, []);

  const filtered = useMemo(
    () => fuzzyFilter(items, filter, (p) => `${p.name} ${p.description || ''}`),
    [items, filter],
  );

  const notImplemented = () =>
    showToast(t('profiles.toast.notImplemented'), 'info');

  return (
    <PageFrame
      title={t('profilesPage.title')}
      description={t('profilesPage.description')}
      actions={
        <>
          <Tooltip label={t('profiles.tooltip.filter')}>
            <Input
              className="h-8 w-full sm:w-48"
              placeholder={t('profilesPage.filter.placeholder')}
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              aria-label={t('profilesPage.filter.label')}
            />
          </Tooltip>
          <Tooltip label={t('profiles.tooltip.add')}>
            <Button type="button" variant="outline" size="sm" onClick={notImplemented}>
              <ListChecks className="h-3.5 w-3.5" />
              <span>{t('profilesPage.add')}</span>
            </Button>
          </Tooltip>
          <Tooltip label={t('profiles.tooltip.refresh')}>
            <Button type="button" variant="ghost" size="sm" onClick={refresh} disabled={loading}>
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
              <span className="sr-only">{t('common.srOnlyRefresh')}</span>
            </Button>
          </Tooltip>
        </>
      }
    >
      <PageDescriptionBanner
        summaryKey="profiles.summary"
        cliKey="profiles.cli"
        exampleKey="profiles.example"
        useCasesKey="profiles.useCases"
        onOpenHelp={openHelpDrawer}
      />
      {error && <ErrorPanel message={error} />}
      {loading && items.length === 0 ? <LoadingSkeleton rows={3} /> : null}
      {!loading && filtered.length === 0 ? (
        <EmptyState
          icon={
            <span data-testid="profiles-empty-illustration">
              <EmptyQueueIllustration size={160} />
            </span>
          }
          title={t('profiles.empty')}
        />
      ) : (
        <ul className="flex flex-col gap-2">
          {filtered.map((p) => {
            const isOpen = expanded.has(p.name);
            const allow = Array.isArray(p.allow) ? p.allow : [];
            const deny = Array.isArray(p.deny) ? p.deny : [];
            return (
              <li key={p.name}>
                <Panel className="p-3">
                  <button
                    type="button"
                    onClick={() => toggle(p.name)}
                    className="flex w-full items-start justify-between gap-2 text-left"
                    aria-expanded={isOpen}
                  >
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={cn(text.mono, 'text-foreground')}>{p.name}</span>
                        {p.source && <Badge variant="outline">{p.source}</Badge>}
                        <Badge variant="outline">{allow.length} allow</Badge>
                        <Badge variant="outline">{deny.length} deny</Badge>
                      </div>
                      {p.description && (
                        <div className={cn('mt-1', text.caption)}>{p.description}</div>
                      )}
                    </div>
                    <span className={text.caption}>{isOpen ? t('profiles.toggle.hide') : t('profiles.toggle.show')}</span>
                  </button>
                  {isOpen && (
                    <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
                      <PatternList label={t('profiles.list.allow')} items={allow} tone="ok" />
                      <PatternList label={t('profiles.list.deny')} items={deny} tone="danger" />
                    </div>
                  )}
                  {isOpen && (
                    <div className="mt-3 flex gap-2">
                      <Button type="button" variant="ghost" size="sm" onClick={notImplemented}>
                        {t('profiles.action.edit')}
                      </Button>
                      <Button type="button" variant="ghost" size="sm" onClick={notImplemented}>
                        {t('profiles.action.remove')}
                      </Button>
                    </div>
                  )}
                </Panel>
              </li>
            );
          })}
        </ul>
      )}

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

function PatternList({ label, items, tone }: { label: string; items: string[]; tone: 'ok' | 'danger' }) {
  const color = tone === 'ok' ? 'text-success' : 'text-destructive';
  return (
    <div className="rounded-md border border-border bg-muted/30 p-2 text-xs">
      <div className="mb-1 text-muted-foreground">{label}</div>
      {items.length === 0 ? (
        <div className="text-muted-foreground">—</div>
      ) : (
        <ul className="space-y-0.5 font-mono">
          {items.map((pat, i) => (
            <li key={`${pat}-${i}`} className={color}>{pat}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
