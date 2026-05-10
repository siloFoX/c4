import { Badge, Panel, type BadgeVariant } from './ui';
import { t, tFormat, useLocale } from '../lib/i18n';
import type { WorkflowRun } from './WorkflowEditor';

// (v1.10.616) Extracted from WorkflowEditor. The "Recent runs"
// Panel — header (title + count), empty state, list of last 10
// runs each expandable to show per-node results + inputs.
// Pure controlled inputs: parent owns runs[] + expandedRunId
// + onToggleExpanded.
//
// (v1.10.779) BadgeVariant alias hoisted to ui/badge so the
// inline `NonNullable<BadgeProps['variant']>` repeat is gone.

function runStatusVariant(status: WorkflowRun['status']): BadgeVariant {
  if (status === 'completed') return 'success';
  if (status === 'failed') return 'destructive';
  return 'outline';
}

interface Props {
  runs: WorkflowRun[];
  expandedRunId: string | null;
  onToggleExpanded: (next: string | null) => void;
}

export default function WorkflowRunsPanel({
  runs,
  expandedRunId,
  onToggleExpanded,
}: Props) {
  useLocale();
  return (
    <Panel className="text-sm text-foreground">
      <div className="mb-2 flex items-center justify-between">
        <h4 className="text-base font-semibold text-foreground">
          {t('workflows.recentRuns')}
        </h4>
        <span className="text-xs text-muted-foreground">{runs.length}</span>
      </div>
      {runs.length === 0 ? (
        <div className="text-xs text-muted-foreground">{t('workflows.runs.empty')}</div>
      ) : (
        <ul className="max-h-72 overflow-y-auto text-xs">
          {runs.slice(-10).reverse().map((r) => {
            const isExpanded = expandedRunId === r.id;
            const nodeIds = Object.keys(r.nodeResults || {});
            return (
              <li
                key={r.id}
                className="border-b border-border py-1 last:border-b-0"
              >
                <button
                  type="button"
                  onClick={() => onToggleExpanded(isExpanded ? null : r.id)}
                  className="flex w-full items-center justify-between gap-2 text-left hover:bg-muted/30"
                  aria-expanded={isExpanded}
                >
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-mono text-[11px] text-foreground">
                      {isExpanded ? '▼' : '▶'} {r.id}
                    </div>
                    <div className="text-[10px] text-muted-foreground">
                      {r.startedAt}
                      {r.completedAt ? ` → ${r.completedAt}` : ` ${t('workflows.runs.running')}`}
                      {nodeIds.length > 0 ? ` · ${tFormat('workflows.runs.nodeCount', { n: String(nodeIds.length) })}` : ''}
                    </div>
                  </div>
                  <Badge
                    variant={runStatusVariant(r.status)}
                    className="shrink-0 uppercase"
                  >
                    {r.status}
                  </Badge>
                </button>
                {isExpanded ? (
                  <div className="mt-2 ml-3 flex flex-col gap-1 border-l border-border/40 pl-2">
                    {nodeIds.length === 0 ? (
                      <div className="text-[11px] text-muted-foreground">
                        {t('workflows.runs.noNodeResults')}
                      </div>
                    ) : (
                      nodeIds.map((nid) => {
                        const nr = r.nodeResults[nid];
                        if (!nr) return null;
                        return (
                          <div key={nid} className="flex flex-col gap-0.5">
                            <div className="flex items-center gap-1">
                              <span className="rounded border border-border bg-muted/30 px-1 font-mono text-[10px]">
                                {nid}
                              </span>
                              <Badge
                                variant={
                                  nr.status === 'completed' ? 'default'
                                  : nr.status === 'failed' ? 'destructive'
                                  : nr.status === 'running' ? 'secondary'
                                  : 'outline'
                                }
                                className="text-[9px] uppercase"
                              >
                                {nr.status}
                              </Badge>
                            </div>
                            {nr.error ? (
                              <div className="font-mono text-[10px] text-destructive">
                                {nr.error}
                              </div>
                            ) : null}
                            {nr.output !== null && nr.output !== undefined ? (
                              <pre tabIndex={0} className="max-h-32 overflow-auto rounded bg-muted/30 p-1 font-mono text-[10px]">
                                {typeof nr.output === 'string'
                                  ? nr.output
                                  : JSON.stringify(nr.output, null, 2)}
                              </pre>
                            ) : null}
                          </div>
                        );
                      })
                    )}
                    {(r.inputs && typeof r.inputs === 'object' && Object.keys(r.inputs).length > 0) ? (
                      <details className="mt-1">
                        <summary className="cursor-pointer text-[10px] text-muted-foreground">
                          inputs
                        </summary>
                        <pre tabIndex={0} className="mt-1 max-h-32 overflow-auto rounded bg-muted/30 p-1 font-mono text-[10px]">
                          {JSON.stringify(r.inputs, null, 2)}
                        </pre>
                      </details>
                    ) : null}
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </Panel>
  );
}
