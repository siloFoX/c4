import { useCallback, useState } from 'react';
import { AlertTriangle, Download, Trash2, Wand2 } from 'lucide-react';
import PageFrame from './PageFrame';
import {
  Badge,
  Button,
  Chip,
  EmptyState,
  Panel,
} from '../components/ui';
import {
  clear as clearReports,
  downloadJson,
  report as reportError,
  useErrorRecords,
  type ErrorRecord,
  type ErrorSource,
} from '../lib/error-reporter';

// (v1.11.213) Operator-facing inspector for the local in-memory error
// sink. List the last 50 captured errors (window / unhandledrejection
// / react / manual sources), with one-click expand for the full
// message + stack, plus Clear / Download / Test-error actions.

const MESSAGE_PREVIEW = 100;

const SOURCE_LABEL: Record<ErrorSource, string> = {
  window: 'window',
  unhandledrejection: 'rejection',
  react: 'react',
  manual: 'manual',
};

type ChipTone = 'success' | 'primary' | 'warning' | 'danger' | 'neutral';

const SOURCE_TONE: Record<ErrorSource, ChipTone> = {
  window: 'danger',
  unhandledrejection: 'warning',
  react: 'primary',
  manual: 'neutral',
};

function formatTimestamp(iso: string): string {
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleString();
  } catch {
    return iso;
  }
}

function truncate(value: string, max: number): string {
  if (value.length <= max) return value;
  return `${value.slice(0, max)}...`;
}

function Row({ rec }: { rec: ErrorRecord }) {
  const [expanded, setExpanded] = useState(false);
  const isLong = rec.message.length > MESSAGE_PREVIEW;
  const detailVisible = expanded;
  return (
    <li className="rounded-md border border-border bg-background/50 p-3">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <Chip tone={SOURCE_TONE[rec.source]} className="px-2 py-0.5">
          {SOURCE_LABEL[rec.source]}
        </Chip>
        <span className="text-muted-foreground">
          {formatTimestamp(rec.timestamp)}
        </span>
        <span className="ml-auto font-mono text-[10px] text-muted-foreground">
          {rec.id}
        </span>
      </div>
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="mt-2 block w-full text-left text-sm hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        aria-expanded={expanded}
        aria-label={expanded ? 'Collapse message' : 'Expand message'}
      >
        {detailVisible ? rec.message : truncate(rec.message, MESSAGE_PREVIEW)}
        {isLong && !detailVisible ? (
          <span className="ml-1 text-xs text-muted-foreground">(click to expand)</span>
        ) : null}
      </button>
      {detailVisible ? (
        <div className="mt-2 space-y-2">
          {rec.stack ? (
            <pre className="max-h-48 overflow-auto rounded bg-muted p-2 font-mono text-[11px] text-muted-foreground">
              {rec.stack}
            </pre>
          ) : null}
          {rec.componentStack ? (
            <pre className="max-h-32 overflow-auto rounded bg-muted p-2 font-mono text-[11px] text-muted-foreground">
              {rec.componentStack}
            </pre>
          ) : null}
          {rec.url ? (
            <div className="text-[11px] text-muted-foreground">
              <span className="font-medium">url:</span> {rec.url}
            </div>
          ) : null}
        </div>
      ) : null}
    </li>
  );
}

export default function ErrorReports() {
  const records = useErrorRecords();

  const handleTest = useCallback(() => {
    reportError({
      source: 'manual',
      message: `Synthetic test error generated at ${new Date().toISOString()}`,
      stack: 'at ErrorReports.handleTest (synthetic)',
    });
  }, []);

  const handleClear = useCallback(() => {
    clearReports();
  }, []);

  const handleDownload = useCallback(() => {
    downloadJson();
  }, []);

  const totalLabel = records.length === 1 ? '1 record' : `${records.length} records`;

  return (
    <PageFrame
      title="Error Reports"
      description="Local in-memory feed of captured client-side errors (window / unhandledrejection / react / manual). Keeps the last 50 entries."
    >
      <Panel className="p-4">
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <Badge variant="outline" className="px-2 py-0.5 text-[11px]">
            {totalLabel}
          </Badge>
          <div className="ml-auto flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={handleTest}
            >
              <Wand2 className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
              Test error
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={handleDownload}
              disabled={records.length === 0}
            >
              <Download className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
              Download JSON
            </Button>
            <Button
              type="button"
              size="sm"
              variant="destructive"
              onClick={handleClear}
              disabled={records.length === 0}
            >
              <Trash2 className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
              Clear all
            </Button>
          </div>
        </div>

        {records.length === 0 ? (
          <EmptyState
            icon={<AlertTriangle className="h-5 w-5" aria-hidden="true" />}
            title="No errors captured"
            description="Errors caught by the window / unhandledrejection handlers or reported manually will show up here."
          />
        ) : (
          <ul className="space-y-2">
            {records.map((rec) => (
              <Row key={rec.id} rec={rec} />
            ))}
          </ul>
        )}
      </Panel>
    </PageFrame>
  );
}
