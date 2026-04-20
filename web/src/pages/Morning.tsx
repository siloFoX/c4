import { useCallback, useState } from 'react';
import { Clipboard, RefreshCw, Sunrise } from 'lucide-react';
import PageFrame, { EmptyPanel, ErrorPanel } from './PageFrame';
import Toast, { type ToastType } from '../components/Toast';
import { PageDescriptionBanner } from '../components/PageDescriptionBanner';
import { openHelpDrawer } from '../components/HelpUIRoot';
import { Button, Panel, Tooltip } from '../components/ui';
import { apiPost } from '../lib/api';
import { renderMarkdown } from '../lib/markdown';
import { t, useLocale } from '../lib/i18n';

// 8.20B Morning report. POST /api/morning triggers generation; the
// response includes the rendered markdown. A "Copy" button grabs the
// raw markdown for pasting into Slack/docs.

interface MorningResponse {
  content?: string;
  generatedAt?: string;
  sections?: { title: string; body: string }[];
  error?: string;
  [key: string]: unknown;
}

interface ToastState { id: number; message: string; type: ToastType }

export default function Morning() {
  useLocale();
  const [report, setReport] = useState<MorningResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<ToastState | null>(null);

  const showToast = useCallback((message: string, type: ToastType) => {
    setToast({ id: Date.now(), message, type });
  }, []);

  const generate = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = (await apiPost<MorningResponse>('/api/morning', {})) as MorningResponse;
      if (r.error) {
        setError(r.error);
        setReport(null);
      } else {
        setReport(r);
      }
    } catch (e) {
      setError((e as Error).message);
      setReport(null);
    }
    setLoading(false);
  }, []);

  const copy = useCallback(async () => {
    if (!report?.content) return;
    try {
      await navigator.clipboard.writeText(report.content);
      showToast('Copied to clipboard', 'success');
    } catch (e) {
      showToast(`Copy failed: ${(e as Error).message}`, 'error');
    }
  }, [report, showToast]);

  return (
    <PageFrame
      title="Morning report"
      description="Daily overview — yesterday's activity, open TODOs, token spend. Mirrors `c4 morning`."
      actions={
        <>
          <Tooltip label={t('morning.tooltip.generate')}>
            <Button type="button" variant="default" size="sm" onClick={generate} disabled={loading}>
              {loading ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Sunrise className="h-3.5 w-3.5" />}
              <span>Generate</span>
            </Button>
          </Tooltip>
          <Tooltip label={t('morning.tooltip.copy')}>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={copy}
              disabled={!report?.content}
            >
              <Clipboard className="h-3.5 w-3.5" />
              <span>Copy</span>
            </Button>
          </Tooltip>
        </>
      }
    >
      <PageDescriptionBanner
        summaryKey="morning.summary"
        cliKey="morning.cli"
        exampleKey="morning.example"
        useCasesKey="morning.useCases"
        onOpenHelp={openHelpDrawer}
      />
      {error && <ErrorPanel message={error} />}
      {!report ? (
        <EmptyPanel message={t('morning.empty')} />
      ) : (
        <>
          {report.generatedAt && (
            <div className="text-xs text-muted-foreground">
              Generated at {new Date(report.generatedAt).toLocaleString()}
            </div>
          )}
          {Array.isArray(report.sections) && report.sections.length > 0 ? (
            <div className="flex flex-col gap-3">
              {report.sections.map((s, i) => (
                <Panel key={i} title={s.title} className="p-3">
                  <div className="text-sm">{renderMarkdown(s.body)}</div>
                </Panel>
              ))}
            </div>
          ) : report.content ? (
            <Panel className="max-h-[520px] overflow-y-auto p-3 text-sm">
              {renderMarkdown(report.content)}
            </Panel>
          ) : (
            <EmptyPanel message="Report returned no content." />
          )}
        </>
      )}

      <div className="pointer-events-none fixed right-4 top-4 z-50 flex flex-col gap-2">
        {toast && (
          <Toast
            key={toast.id}
            message={toast.message}
            type={toast.type}
            onDismiss={() => setToast(null)}
          />
        )}
      </div>
    </PageFrame>
  );
}
