import { useMemo, useState } from 'react';
import { RefreshCw, ScrollText } from 'lucide-react';
import PageFrame, { EmptyPanel, ErrorPanel, LoadingSkeleton } from './PageFrame';
import Toast from '../components/Toast';
import { PageDescriptionBanner } from '../components/PageDescriptionBanner';
import { openHelpDrawer } from '../components/HelpUIRoot';
import { Badge, Button, Input, Panel, Tooltip } from '../components/ui';
import { fuzzyFilter } from '../lib/fuzzyFilter';
import { t, useLocale } from '../lib/i18n';
import { useToast } from '../lib/use-toast';
import { useTemplates } from '../lib/use-templates';

// 8.20B Templates. Read-only list from GET /api/templates. Add / remove
// endpoints do not exist yet on the daemon, so the UI calls toast
// "Not implemented yet" and tracks the server-side work in TODO.md
// (sub-task 8.20b-templates-write).
// (v1.10.722) Toast slot adopted from lib/use-toast (shared infra).
// (v1.10.746) Fetch + state machine moved to lib/use-templates.

export default function Templates() {
  useLocale();
  const { items, loading, error, refresh } = useTemplates();
  const [filter, setFilter] = useState('');
  const { toast, showToast, dismissToast } = useToast();

  const filtered = useMemo(
    () => fuzzyFilter(items, filter, (t) => `${t.name} ${t.description || ''} ${t.model || ''}`),
    [items, filter],
  );

  const notImplemented = () =>
    showToast(t('templates.toast.notImplemented'), 'info');

  return (
    <PageFrame
      title={t('templatesPage.title')}
      description={t('templatesPage.description')}
      actions={
        <>
          <Tooltip label={t('templates.tooltip.filter')}>
            <Input
              className="h-8 w-full sm:w-48"
              placeholder={t('templatesPage.filter.placeholder')}
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              aria-label={t('templatesPage.filter.label')}
            />
          </Tooltip>
          <Tooltip label={t('templates.tooltip.add')}>
            <Button type="button" variant="outline" size="sm" onClick={notImplemented}>
              <ScrollText className="h-3.5 w-3.5" />
              <span>{t('templatesPage.add')}</span>
            </Button>
          </Tooltip>
          <Tooltip label={t('templates.tooltip.refresh')}>
            <Button type="button" variant="ghost" size="sm" onClick={refresh} disabled={loading}>
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
              <span className="sr-only">{t('common.srOnlyRefresh')}</span>
            </Button>
          </Tooltip>
        </>
      }
    >
      <PageDescriptionBanner
        summaryKey="templates.summary"
        cliKey="templates.cli"
        exampleKey="templates.example"
        useCasesKey="templates.useCases"
        onOpenHelp={openHelpDrawer}
      />
      {error && <ErrorPanel message={error} />}
      {loading && items.length === 0 ? <LoadingSkeleton rows={3} /> : null}
      {!loading && filtered.length === 0 ? (
        <EmptyPanel message={t('templates.empty')} />
      ) : (
        <ul className="flex flex-col gap-2">
          {filtered.map((tpl) => (
            <li key={tpl.name}>
              <Panel className="p-3">
                <div className="mb-1 flex flex-wrap items-center gap-2">
                  <span className="font-mono text-sm text-foreground">{tpl.name}</span>
                  {tpl.source && <Badge variant="outline">{tpl.source}</Badge>}
                  {tpl.model && <Badge variant="outline">{tpl.model}</Badge>}
                  {tpl.effort && <Badge variant="outline">{tpl.effort}</Badge>}
                  {tpl.profile && <Badge variant="outline">{tpl.profile}</Badge>}
                </div>
                {tpl.description && (
                  <div className="text-xs text-muted-foreground">{tpl.description}</div>
                )}
                <div className="mt-2 flex gap-2">
                  <Button type="button" variant="ghost" size="sm" onClick={notImplemented}>
                    {t('common.edit')}
                  </Button>
                  <Button type="button" variant="ghost" size="sm" onClick={notImplemented}>
                    {t('common.remove')}
                  </Button>
                </div>
              </Panel>
            </li>
          ))}
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
