import { useCallback, useEffect, useMemo, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import PageFrame, { EmptyPanel, ErrorPanel, LoadingSkeleton } from './PageFrame';
import { PageDescriptionBanner } from '../components/PageDescriptionBanner';
import { openHelpDrawer } from '../components/HelpUIRoot';
import { Badge, Button, Input, Panel, Tooltip } from '../components/ui';
import { apiFetch, apiGet } from '../lib/api';
import { fuzzyFilter } from '../lib/fuzzyFilter';
import type { ListResponse, Worker } from '../types';
import { t, useLocale } from '../lib/i18n';

// 8.20B Validation. Fetches /api/list for workers and calls
// /api/validation?name=<worker> per worker. Renders pass/fail badges
// for tests / typecheck / lint, and shows raw validation JSON for
// inspection.

interface ValidationResponse {
  name?: string;
  tests?: { passed?: number; failed?: number; skipped?: number; ok?: boolean };
  typecheck?: { ok?: boolean; errors?: number };
  lint?: { ok?: boolean; errors?: number; warnings?: number };
  coverage?: { lines?: number; branches?: number };
  generatedAt?: string;
  dirty?: boolean;
  branch?: string;
  error?: string;
  [key: string]: unknown;
}

export default function Validation() {
  useLocale();
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [filter, setFilter] = useState('');
  const [validations, setValidations] = useState<Record<string, ValidationResponse>>({});
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const list = await apiGet<ListResponse>('/api/list');
      const ws = Array.isArray(list.workers) ? list.workers : [];
      setWorkers(ws);
      const next: Record<string, ValidationResponse> = {};
      await Promise.all(
        ws.map(async (w) => {
          try {
            const res = await apiFetch(`/api/validation?name=${encodeURIComponent(w.name)}`);
            if (res.ok) {
              next[w.name] = (await res.json()) as ValidationResponse;
            } else {
              next[w.name] = { error: `HTTP ${res.status}` };
            }
          } catch (e) {
            next[w.name] = { error: (e as Error).message };
          }
        }),
      );
      setValidations(next);
    } catch (e) {
      setError((e as Error).message);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const filtered = useMemo(
    () => fuzzyFilter(workers, filter, (w) => w.name),
    [workers, filter],
  );

  return (
    <PageFrame
      title="Validation"
      description="Per-worker validation object — tests / typecheck / lint status from .c4-validation.json in each worktree."
      actions={
        <>
          <Tooltip label={t('validation.tooltip.filter')}>
            <Input
              className="h-8 w-48"
              placeholder="Filter workers"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              aria-label="Filter workers"
            />
          </Tooltip>
          <Tooltip label={t('validation.tooltip.refresh')}>
            <Button type="button" variant="ghost" size="sm" onClick={refresh} disabled={loading}>
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
              <span className="sr-only">Refresh</span>
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

function ValidationCard({ worker, report }: { worker: Worker; report?: ValidationResponse }) {
  if (!report) {
    return (
      <Panel title={worker.name} className="p-3 text-sm">
        <span className="text-muted-foreground">Loading...</span>
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
  return (
    <Panel title={worker.name} className="p-3">
      <div className="mb-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        {worker.branch && <span className="font-mono">{worker.branch}</span>}
        {report.dirty && <Badge variant="outline">dirty</Badge>}
      </div>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        <CheckRow
          label="Tests"
          ok={testsOk}
          detail={
            report.tests
              ? `${report.tests.passed || 0}/${(report.tests.passed || 0) + (report.tests.failed || 0)} pass`
              : undefined
          }
        />
        <CheckRow
          label="Typecheck"
          ok={typeOk}
          detail={
            report.typecheck
              ? `${report.typecheck.errors || 0} errors`
              : undefined
          }
        />
        <CheckRow
          label="Lint"
          ok={lintOk}
          detail={
            report.lint
              ? `${report.lint.errors || 0}e / ${report.lint.warnings || 0}w`
              : undefined
          }
        />
      </div>
    </Panel>
  );
}

function CheckRow({ label, ok, detail }: { label: string; ok: boolean | null; detail?: string }) {
  const badge =
    ok == null
      ? <Badge variant="outline">n/a</Badge>
      : ok
        ? <Badge>pass</Badge>
        : <Badge variant="outline" className="border-destructive text-destructive">fail</Badge>;
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
