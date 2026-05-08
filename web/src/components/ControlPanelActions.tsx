import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui';
import { cn } from '../lib/cn';
import { t, tFormat, useLocale } from '../lib/i18n';
import { TONE_VARIANT, type ActionKind, type SingleAction } from './ControlPanel';

// (v1.10.590) Extracted from ControlPanel. The single-action grid
// — Card with title, description (mentions worker name), and a
// 2-column grid of buttons (one per SingleAction). Pure display:
// parent owns busy state + click handler.

interface Props {
  workerName: string;
  actions: SingleAction[];
  busyKind: ActionKind | null;
  onRunSingle: (action: SingleAction) => void;
}

export default function ControlPanelActions({
  workerName,
  actions,
  busyKind,
  onRunSingle,
}: Props) {
  useLocale();
  const disabled = busyKind !== null;
  return (
    <Card aria-label={t('controlPanel.worker.label')}>
      <CardHeader className="p-4 md:p-5">
        <CardTitle>{t('controlPanel.worker.title')}</CardTitle>
        <CardDescription>
          {tFormat('controlPanel.worker.description', { worker: workerName })}
        </CardDescription>
      </CardHeader>
      <CardContent className="p-4 pt-0 md:p-5 md:pt-0">
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {actions.map((action) => {
            const isBusy = busyKind === action.kind;
            return (
              <Button
                key={action.kind}
                type="button"
                variant={TONE_VARIANT[action.tone]}
                size="md"
                onClick={() => onRunSingle(action)}
                disabled={disabled}
                title={action.description}
                className={cn(
                  'h-auto min-h-[4rem] flex-col items-start gap-1 py-2 text-left'
                )}
              >
                <span className="flex items-center gap-2 text-sm font-semibold">
                  {action.icon}
                  <span>
                    {isBusy
                      ? tFormat('controlPanel.action.busy', { label: action.label })
                      : action.label}
                  </span>
                </span>
                <span className="w-full whitespace-normal text-xs font-normal opacity-80">
                  {action.description}
                </span>
              </Button>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
