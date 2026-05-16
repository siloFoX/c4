import { useEffect, useMemo, useState } from 'react';
import { RefreshCw, ScrollText } from 'lucide-react';
import PageFrame, { ErrorPanel, LoadingSkeleton } from './PageFrame';
import Toast from '../components/Toast';
import { PageDescriptionBanner } from '../components/PageDescriptionBanner';
import { openHelpDrawer } from '../components/HelpUIRoot';
import { Button, Chip, EmptyState, FileInput, Label, ListItem, PageHeader, Pagination, Panel, SearchBar, Skeleton, TagInput, Tooltip } from '../components/ui';
import { EmptyQueueIllustration } from '../components/illustrations';
import { cn } from '../lib/cn';
import { fuzzyFilter } from '../lib/fuzzyFilter';
import { t, useLocale } from '../lib/i18n';
import { text } from '../lib/typography';
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
  const [page, setPage] = useState(1);
  const { toast, showToast, dismissToast } = useToast();

  const filtered = useMemo(
    () => fuzzyFilter(items, filter, (t) => `${t.name} ${t.description || ''} ${t.model || ''}`),
    [items, filter],
  );

  const PAGE_SIZE = 20;
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  useEffect(() => {
    if (page > totalPages) setPage(1);
  }, [page, totalPages]);
  const pageItems = useMemo(
    () => filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
    [filtered, page],
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
            <SearchBar
              size="sm"
              className="w-full sm:w-48"
              placeholder={t('templatesPage.filter.placeholder')}
              value={filter}
              onChange={setFilter}
              ariaLabel={t('templatesPage.filter.label')}
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
      <PageHeader
        breadcrumbs={[
          { id: 'home', label: 'Dashboard', href: '#feature=workers' },
        ]}
        backHref="#feature=workers"
        backLabel="Back to Workers"
        sticky={false}
        className="-mx-4 -mt-2 md:-mx-6 md:-mt-2"
        data-testid="templates-page-header"
      />
      <PageDescriptionBanner
        summaryKey="templates.summary"
        cliKey="templates.cli"
        exampleKey="templates.example"
        useCasesKey="templates.useCases"
        onOpenHelp={openHelpDrawer}
      />
      {error && <ErrorPanel message={error} />}
      {loading && items.length === 0 ? (
        // (v1.11.273, TODO 11.255) Replaces the legacy
        // LoadingSkeleton text-stack with Skeleton.List so each
        // placeholder row mirrors the real template-row layout
        // (2 lines per row) and the shimmer respects
        // useReducedMotion.
        <Skeleton.List rows={3} data-testid="templates-loading" />
      ) : null}
      {!loading && filtered.length === 0 ? (
        <EmptyState
          size="md"
          icon={
            <span data-testid="templates-empty-illustration">
              <EmptyQueueIllustration size={160} />
            </span>
          }
          title={t('templates.empty')}
          description="No prompt templates are configured yet. Templates live in config.json and let workers reuse common task scaffolds."
          secondaryAction={{
            label: 'Open Config page',
            href: '#feature=config',
          }}
          data-testid="templates-empty-state"
        />
      ) : (
        <ul className="flex flex-col gap-2">
          {pageItems.map((tpl) => (
            <li key={tpl.name}>
              <Panel className="p-3">
                <ListItem
                  className="p-0"
                  title={
                    <span className="flex flex-wrap items-center gap-2">
                      <span className={cn(text.mono, 'text-foreground')}>{tpl.name}</span>
                      {tpl.source && <Chip variant="outline">{tpl.source}</Chip>}
                      {tpl.model && <Chip variant="outline">{tpl.model}</Chip>}
                      {tpl.effort && <Chip variant="outline">{tpl.effort}</Chip>}
                      {tpl.profile && <Chip variant="outline">{tpl.profile}</Chip>}
                    </span>
                  }
                  description={tpl.description || undefined}
                  trailing={
                    <>
                      <Button type="button" variant="ghost" size="sm" onClick={notImplemented}>
                        {t('common.edit')}
                      </Button>
                      <Button type="button" variant="ghost" size="sm" onClick={notImplemented}>
                        {t('common.remove')}
                      </Button>
                    </>
                  }
                />
              </Panel>
            </li>
          ))}
        </ul>
      )}
      <ImportTemplateForm />
      {!loading && filtered.length > PAGE_SIZE && (
        <div className="mt-3 flex justify-center">
          <Pagination
            page={page}
            totalPages={totalPages}
            onPageChange={setPage}
            ariaLabel="Templates pagination"
          />
        </div>
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

function ImportTemplateForm() {
  const [error, setError] = useState<string | null>(null);
  const [tags, setTags] = useState<string[]>([]);
  return (
    <div className="mt-4 space-y-3">
      <FileInput
        label="Import template"
        hint="Upload a JSON or YAML template file (no daemon endpoint yet)"
        accept="application/json,application/yaml,.json,.yaml,.yml"
        maxSize={1024 * 1024}
        error={error ?? undefined}
        onFiles={(files) => {
          setError(null);
          // eslint-disable-next-line no-console
          console.log('[templates] import file', files[0]?.name, files[0]?.size);
        }}
        onError={(msg) => setError(msg)}
      />
      <div className="space-y-1.5">
        <Label>Tags</Label>
        <TagInput
          value={tags}
          onChange={setTags}
          ariaLabel="Template tags"
          placeholder="Add tag..."
          normalize={(raw) => raw.trim().toLowerCase()}
        />
      </div>
    </div>
  );
}
