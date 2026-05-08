import { Play } from 'lucide-react';
import { Button, Card, CardDescription, CardHeader, CardTitle } from './ui';
import { t, useLocale } from '../lib/i18n';
import type { Workflow } from './WorkflowEditor';

// (v1.10.603) Extracted from WorkflowEditor. The selected
// workflow header card — title + description, Inputs toggle,
// Run button, and the conditionally-rendered inputs JSON
// textarea + error span. Pure controlled inputs: parent owns
// inputsOpen / inputsJson / inputsError state + handlers.

interface Props {
  workflow: Workflow;
  busy: boolean;
  inputsOpen: boolean;
  inputsJson: string;
  inputsError: string | null;
  onToggleInputs: () => void;
  onChangeInputsJson: (next: string) => void;
  onRun: () => void;
}

export default function WorkflowSelectedHeader({
  workflow,
  busy,
  inputsOpen,
  inputsJson,
  inputsError,
  onToggleInputs,
  onChangeInputsJson,
  onRun,
}: Props) {
  useLocale();
  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between gap-2 p-4 md:p-5">
        <div className="min-w-0">
          <CardTitle className="truncate">{workflow.name}</CardTitle>
          <CardDescription className="truncate">
            {workflow.description || t('workflows.noDescription')}
          </CardDescription>
        </div>
        <div className="flex flex-col items-end gap-1">
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onToggleInputs}
              disabled={busy}
              className="h-7 px-2 text-[11px]"
              title={t('workflows.inputs.title')}
              aria-expanded={inputsOpen}
            >
              {inputsOpen ? t('workflows.inputs.toggle.hide') : t('workflows.inputs.toggle.show')}
            </Button>
            <Button
              type="button"
              variant="default"
              size="sm"
              onClick={onRun}
              disabled={busy || !workflow.enabled}
            >
              <Play className="h-4 w-4" />
              <span>{t('workflows.run.button')}</span>
            </Button>
          </div>
          {inputsOpen ? (
            <div className="flex w-72 flex-col gap-1 text-[11px]">
              <textarea
                value={inputsJson}
                onChange={(e) => onChangeInputsJson(e.target.value)}
                placeholder='{"foo": "bar"}'
                aria-label={t('workflows.inputs.label')}
                disabled={busy}
                className="min-h-[64px] rounded border border-border bg-background p-2 font-mono text-[11px]"
              />
              {inputsError ? (
                <span className="text-destructive">{inputsError}</span>
              ) : null}
            </div>
          ) : null}
        </div>
      </CardHeader>
    </Card>
  );
}
