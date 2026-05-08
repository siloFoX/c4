import { RefreshCw, Workflow as WorkflowIcon } from 'lucide-react';
import { Badge, Button, Card, CardContent, CardHeader, CardTitle } from './ui';
import { cn } from '../lib/cn';
import { t, tFormat, useLocale } from '../lib/i18n';
import type { Workflow } from './WorkflowEditor';

// (v1.10.587) Extracted from WorkflowEditor. Left-pane sidebar
// listing all workflows — header (icon + title + refresh), error
// banner, empty state, or button list. Pure display: parent
// owns selection + refresh callback.

interface Props {
  workflows: Workflow[];
  error: string | null;
  busy: boolean;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onRefresh: () => void;
}

export default function WorkflowList({
  workflows,
  error,
  busy,
  selectedId,
  onSelect,
  onRefresh,
}: Props) {
  useLocale();
  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between p-4 md:p-5">
        <div className="flex items-center gap-2">
          <WorkflowIcon aria-hidden="true" className="h-4 w-4 text-muted-foreground" />
          <CardTitle>{t('workflows.title')}</CardTitle>
        </div>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={onRefresh}
          disabled={busy}
        >
          <RefreshCw className="h-3.5 w-3.5" />
          <span>{t('common.refresh')}</span>
        </Button>
      </CardHeader>
      <CardContent className="p-4 pt-0 md:p-5 md:pt-0">
        {error ? (
          <div
            role="alert"
            className="mb-2 rounded-md border border-destructive/30 bg-destructive/10 p-2 text-xs text-destructive"
          >
            {error}
          </div>
        ) : null}
        {workflows.length === 0 ? (
          <div className="text-xs text-muted-foreground">
            {t('workflows.empty').split('{cli}').map((seg, i, arr) => (
              <span key={i}>
                {seg}
                {i < arr.length - 1 ? (
                  <code className="font-mono text-foreground">
                    {t('workflows.empty.cli')}
                  </code>
                ) : null}
              </span>
            ))}
          </div>
        ) : (
          <ul className="space-y-1">
            {workflows.map((wf) => {
              const isSelected = wf.id === selectedId;
              return (
                <li key={wf.id}>
                  <button
                    type="button"
                    onClick={() => onSelect(wf.id)}
                    className={cn(
                      'w-full rounded-md border border-transparent px-2 py-1.5 text-left text-sm transition-colors',
                      isSelected
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-muted/30 text-foreground hover:bg-muted'
                    )}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate font-medium" data-i18n-skip="user-data">{wf.name}</span>
                      <Badge
                        variant={wf.enabled ? 'success' : 'secondary'}
                        className="shrink-0 uppercase"
                      >
                        {wf.enabled ? t('workflows.status.on') : t('workflows.status.off')}
                      </Badge>
                    </div>
                    <div className="text-xs opacity-80">
                      {tFormat('workflows.nodesEdges.format', {
                        nodes: String(wf.nodes.length),
                        edges: String(wf.edges.length),
                      })}
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
