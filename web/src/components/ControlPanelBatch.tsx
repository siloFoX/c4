import { CircleSlash, X } from 'lucide-react';
import { Badge, Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Panel } from './ui';
import { t, tFormat, useLocale } from '../lib/i18n';
import type { Worker } from '../types';
import type { BatchKind, BatchOutcome } from './ControlPanel';

// (v1.10.591) Extracted from ControlPanel. The batch-control
// Card — header (title + count + Select all / Clear buttons),
// the worker checkbox list (or empty state), the Cancel/Close
// action row, and the optional last-batch outcome panel. Pure
// display: parent owns selection state + dispatch handlers.

interface Props {
  selectableWorkers: Worker[];
  selected: Set<string>;
  selectedCount: number;
  batchBusy: BatchKind | null;
  disableBatch: boolean;
  batchResults: BatchOutcome[] | null;
  onSelectAll: () => void;
  onClearSelection: () => void;
  onToggleSelected: (name: string) => void;
  onRunBatch: (kind: BatchKind) => void;
}

export default function ControlPanelBatch({
  selectableWorkers,
  selected,
  selectedCount,
  batchBusy,
  disableBatch,
  batchResults,
  onSelectAll,
  onClearSelection,
  onToggleSelected,
  onRunBatch,
}: Props) {
  useLocale();
  return (
    <Card aria-label={t('controlPanel.batch.label')}>
      <CardHeader className="flex-row items-start justify-between gap-2 p-4 md:p-5">
        <div>
          <CardTitle>{t('controlPanel.batch.title')}</CardTitle>
          <CardDescription>
            {tFormat('controlPanel.batch.description', { count: selectedCount })}
          </CardDescription>
        </div>
        <div className="flex gap-2 text-xs">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={onSelectAll}
            disabled={selectableWorkers.length === 0}
          >
            {t('controlPanel.batch.selectAll')}
          </Button>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={onClearSelection}
            disabled={selectedCount === 0}
          >
            {t('controlPanel.batch.clear')}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-3 p-4 pt-0 md:p-5 md:pt-0">
        {selectableWorkers.length === 0 ? (
          <div className="text-xs text-muted-foreground">{t('controlPanel.batch.empty')}</div>
        ) : (
          <Panel className="max-h-48 overflow-y-auto p-2">
            <ul className="text-xs text-foreground">
              {selectableWorkers.map((w) => {
                const checked = selected.has(w.name);
                return (
                  <li key={w.name} className="flex items-center gap-2 py-0.5">
                    <label className="flex flex-1 items-center gap-2 truncate">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => onToggleSelected(w.name)}
                        aria-label={tFormat('controlPanel.batch.selectAria', { worker: w.name })}
                      />
                      <span className="truncate font-mono">{w.name}</span>
                    </label>
                    <Badge variant="outline" className="shrink-0 uppercase">
                      {w.status}
                    </Badge>
                  </li>
                );
              })}
            </ul>
          </Panel>
        )}

        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => onRunBatch('cancel')}
            disabled={disableBatch}
          >
            <CircleSlash className="h-3.5 w-3.5" />
            <span>
              {batchBusy === 'cancel'
                ? t('controlPanel.batch.cancelSelectedBusy')
                : t('controlPanel.batch.cancelSelected')}
            </span>
          </Button>
          <Button
            type="button"
            variant="destructive"
            size="sm"
            onClick={() => onRunBatch('close')}
            disabled={disableBatch}
          >
            <X className="h-3.5 w-3.5" />
            <span>
              {batchBusy === 'close'
                ? t('controlPanel.batch.closeSelectedBusy')
                : t('controlPanel.batch.closeSelected')}
            </span>
          </Button>
        </div>

        {batchResults && batchResults.length > 0 && (
          <Panel
            title={t('controlPanel.lastBatch.title')}
            className="p-3 text-xs"
          >
            <ul className="space-y-0.5">
              {batchResults.map((r) => (
                <li
                  key={r.name}
                  className={r.ok ? 'text-success' : 'text-destructive'}
                >
                  <span className="font-mono">{r.name}</span>
                  {': '}
                  {r.ok
                    ? t('controlPanel.batch.statusOk')
                    : r.error || t('controlPanel.batch.statusFailed')}
                </li>
              ))}
            </ul>
          </Panel>
        )}
      </CardContent>
    </Card>
  );
}
