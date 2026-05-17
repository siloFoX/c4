import { useEffect, useMemo, useState } from 'react';
import { RefreshCw, ScrollText } from 'lucide-react';
import PageFrame, { ErrorPanel, LoadingSkeleton } from './PageFrame';
import Toast from '../components/Toast';
import { PageDescriptionBanner } from '../components/PageDescriptionBanner';
import { openHelpDrawer } from '../components/HelpUIRoot';
import { Button, Chip, EmptyState, FieldGroup, FileDrop, FormField, ListActionMenu, ListItem, NumberInput, PageHeader, Pagination, Panel, RichText, SearchBar, Skeleton, TagInput, Toolbar, Tooltip } from '../components/ui';
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
        /* (v1.11.284, TODO 11.266) Editor actions row wrapped
           in the Toolbar primitive (children-mode) so the row
           reads as role=toolbar with keyboard arrow nav between
           the Add + Refresh action buttons. The SearchBar stays
           inside the toolbar shell as a sibling control. */
        <Toolbar
          size="sm"
          ariaLabel={t('templatesPage.title')}
          data-testid="templates-page-toolbar"
        >
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
        </Toolbar>
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
                  description={
                    /* (v1.11.283, TODO 11.265) Template descriptions
                       now render through RichText so operator-authored
                       template summaries can use markdown-lite
                       formatting (paragraphs, bullets, **bold**,
                       `code`, [links]) with the safe URL allowlist
                       enforced. */
                    tpl.description ? (
                      <RichText
                        content={tpl.description}
                        data-testid={`templates-row-description-${tpl.name}`}
                      />
                    ) : undefined
                  }
                  trailing={
                    /* (v1.11.280, TODO 11.262) Per-row Edit / Remove
                       buttons consolidated into the canonical
                       ListActionMenu (3-dot ellipsis). Frees the
                       row width for the Chip strip and gives the
                       menu room to grow (Duplicate / Archive land
                       once the daemon endpoints exist). */
                    <ListActionMenu
                      ariaLabel={`Actions for template ${tpl.name}`}
                      triggerTestId={`templates-row-actions-${tpl.name}`}
                      actions={[
                        {
                          id: 'edit',
                          label: t('common.edit'),
                          onSelect: notImplemented,
                        },
                        {
                          id: 'duplicate',
                          label: 'Duplicate',
                          onSelect: notImplemented,
                        },
                        {
                          id: 'archive',
                          label: 'Archive',
                          onSelect: notImplemented,
                        },
                        {
                          id: 'remove',
                          label: t('common.remove'),
                          variant: 'danger',
                          onSelect: notImplemented,
                        },
                      ]}
                    />
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
  // (v1.11.287, TODO 11.269) Operator-local max-tokens ceiling
  // for the imported template. Placeholder field -- the daemon
  // import endpoint doesn't read this yet, but the slot is in
  // place for when it does. Defaults to undefined ("no cap") so
  // the field reads as empty.
  const [maxTokens, setMaxTokens] = useState<number | undefined>(undefined);
  return (
    /* (v1.11.281, TODO 11.263) FieldGroup adoption: the import
       form now lives inside a labeled FieldGroup so the section
       carries a consistent heading + description rhythm. The
       ad-hoc <Label>Tags</Label> wrapper is also migrated to
       FormField so the label, helper text, and aria wiring all
       use the canonical primitive. */
    <FieldGroup
      title="Import template"
      description="Upload a JSON or YAML template file (no daemon endpoint yet)."
      className="mt-4"
      data-testid="templates-import-form"
    >
      {/* (v1.11.288, TODO 11.270) FileInput migrated to the
          richer FileDrop primitive. Same accept + maxSize +
          error wiring; FileDrop adds the staged-file list +
          progress-bar slot for when the daemon import endpoint
          comes online and the operator can see the upload
          progress without a separate Toast / Alert. */}
      <FileDrop
        label="Template file"
        hint="JSON or YAML, max 1 MB."
        accept="application/json,application/yaml,.json,.yaml,.yml"
        maxSize={1024 * 1024}
        error={error ?? undefined}
        onAdd={(files) => {
          setError(null);
          // eslint-disable-next-line no-console
          console.log('[templates] import file', files[0]?.name, files[0]?.size);
        }}
        onError={(msg) => setError(msg)}
      />
      <FormField label="Tags" helperText="Comma-separated; press Enter to commit.">
        <div>
          <TagInput
            value={tags}
            onChange={setTags}
            ariaLabel="Template tags"
            placeholder="Add tag..."
            normalize={(raw) => raw.trim().toLowerCase()}
          />
        </div>
      </FormField>
      {/* (v1.11.287, TODO 11.269) Operator-local max-tokens
          ceiling. NumberInput primitive with +/- steppers, 1..
          200,000 clamping, and a "tokens" suffix label. */}
      <FormField
        label="Max tokens"
        helperText="Upper bound for the imported template's prompt window. Leave empty for no cap."
      >
        <NumberInput
          value={maxTokens}
          onChange={setMaxTokens}
          min={1}
          max={200000}
          step={1000}
          unit="tokens"
          ariaLabel="Max tokens"
          placeholder="No cap"
          size="md"
        />
      </FormField>
    </FieldGroup>
  );
}
