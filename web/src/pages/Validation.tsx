import { useMemo, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import PageFrame, { EmptyPanel, ErrorPanel, LoadingSkeleton } from './PageFrame';
import { PageDescriptionBanner } from '../components/PageDescriptionBanner';
import { openHelpDrawer } from '../components/HelpUIRoot';
import { Badge, Button, Panel, SearchBar, Tooltip } from '../components/ui';
import { fuzzyFilter } from '../lib/fuzzyFilter';
import type { Worker } from '../types';
import { t, tFormat, useLocale } from '../lib/i18n';
import { useValidations, type ValidationResponse } from '../lib/use-validations';

// 8.20B Validation. Fetches /api/list for workers and calls
// /api/validation?name=<worker> per worker. Renders pass/fail badges
// for tests / typecheck / lint, and shows raw validation JSON for
// inspection.
// (v1.10.724) Fetch + per-worker fan-out moved to lib/use-validations.

export default function Validation() {
  useLocale();
  // (v1.10.724) State machine moved to use-validations hook.
  const { workers, validations, loading, error, refresh } = useValidations();
  const [filter, setFilter] = useState('');

  const filtered = useMemo(
    () => fuzzyFilter(workers, filter, (w) => w.name),
    [workers, filter],
  );

  return (
    <PageFrame
      title={t('validationPage.title')}
      description={t('validationPage.description')}
      actions={
        <>
          <Tooltip label={t('validation.tooltip.filter')}>
            <SearchBar
              size="sm"
              className="w-full sm:w-48"
              placeholder={t('validationPage.filter.placeholder')}
              value={filter}
              onChange={setFilter}
              ariaLabel={t('validationPage.filter.label')}
            />
          </Tooltip>
          <Tooltip label={t('validation.tooltip.refresh')}>
            <Button type="button" variant="ghost" size="sm" onClick={refresh} disabled={loading}>
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
              <span className="sr-only">{t('common.srOnlyRefresh')}</span>
            </Button>
          </Tooltip>
        </>
      }
    >
      <PageDescriptionBanner
        summaryKey="validation.summary"
        cliKey="validation.cli"
        exampleKey="validation.example"
        useCasesKey="validation.useCases"
        onOpenHelp={openHelpDrawer}
      />
      {loading && workers.length === 0 ? <LoadingSkeleton rows={4} /> : null}
      {error && <ErrorPanel message={error} />}
      {!loading && filtered.length === 0 ? (
        <EmptyPanel message={t('validation.empty')} />
      ) : (
        <ul className="flex flex-col gap-2">
          {filtered.map((w) => (
            <ValidationCard key={w.name} worker={w} report={validations[w.name]} />
          ))}
        </ul>
      )}
    </PageFrame>
  );
}

function ValidationCard({ worker, report }: { worker: Worker; report?: ValidationResponse | undefined }) {
  useLocale();
  if (!report) {
    return (
      <Panel title={worker.name} className="p-3 text-sm">
        <span className="text-muted-foreground">{t('common.loadingDots')}</span>
      </Panel>
    );
  }
  if (report.error) {
    return (
      <Panel title={worker.name} className="p-3 text-sm">
        <span className="text-destructive">{report.error}</span>
      </Panel>
    );
  }
  const testsOk = report.tests ? report.tests.ok !== false && (report.tests.failed || 0) === 0 : null;
  const typeOk = report.typecheck ? report.typecheck.ok !== false : null;
  const lintOk = report.lint ? report.lint.ok !== false : null;
  const breadcrumbs = worker.branch
    ? [{ label: 'Workers' }, { label: worker.branch }]
    : [{ label: 'Workers' }];
  return (
    <Panel
      title={worker.name}
      description="Tests, typecheck, and lint results for this worker's branch."
      breadcrumbs={breadcrumbs}
      className="p-3"
    >
      <div className="mb-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        {report.dirty && <Badge variant="outline">{t('validation.dirty')}</Badge>}
      </div>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        <CheckRow
          label={t('validation.row.tests')}
          ok={testsOk}
          detail={
            report.tests
              ? tFormat('validation.detail.testsPass', {
                  passed: report.tests.passed || 0,
                  total: (report.tests.passed || 0) + (report.tests.failed || 0),
                })
              : undefined
          }
        />
        <CheckRow
          label={t('validation.row.typecheck')}
          ok={typeOk}
          detail={
            report.typecheck
              ? tFormat('validation.detail.typeErrors', {
                  errors: report.typecheck.errors || 0,
                })
              : undefined
          }
        />
        <CheckRow
          label={t('validation.row.lint')}
          ok={lintOk}
          detail={
            report.lint
              ? tFormat('validation.detail.lintCounts', {
                  errors: report.lint.errors || 0,
                  warnings: report.lint.warnings || 0,
                })
              : undefined
          }
        />
      </div>
    </Panel>
  );
}

function CheckRow({ label, ok, detail }: { label: string; ok: boolean | null; detail?: string | undefined }) {
  const badge =
    ok == null
      ? <Badge variant="outline">{t('validation.badge.na')}</Badge>
      : ok
        ? <Badge>{t('validation.badge.pass')}</Badge>
        : <Badge variant="outline" className="border-destructive text-destructive">{t('validation.badge.fail')}</Badge>;
  return (
    <div className="flex items-center justify-between gap-2 rounded-md border border-border bg-muted/30 px-3 py-2 text-xs">
      <span className="uppercase tracking-wide text-muted-foreground">{label}</span>
      <div className="flex items-center gap-2">
        {detail && <span className="font-mono text-muted-foreground">{detail}</span>}
        {badge}
      </div>
    </div>
  );
}
