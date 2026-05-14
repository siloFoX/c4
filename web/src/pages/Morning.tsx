import { Clipboard, RefreshCw, Sunrise } from 'lucide-react';
import PageFrame, { EmptyPanel, ErrorPanel } from './PageFrame';
import Toast from '../components/Toast';
import { PageDescriptionBanner } from '../components/PageDescriptionBanner';
import { openHelpDrawer } from '../components/HelpUIRoot';
import { Button, Panel, Tooltip } from '../components/ui';
import { renderMarkdown } from '../lib/markdown';
import { t, tFormat, useLocale } from '../lib/i18n';
import { text } from '../lib/typography';
import { useToast } from '../lib/use-toast';
import { useMorning } from '../lib/use-morning';

// 8.20B Morning report. POST /api/morning triggers generation; the
// response includes the rendered markdown. A "Copy" button grabs the
// raw markdown for pasting into Slack/docs.
// (v1.10.722) Toast slot adopted from lib/use-toast (shared infra).
// (v1.10.748) Generate + copy flows moved to lib/use-morning.

export default function Morning() {
  useLocale();
  const { toast, showToast, dismissToast } = useToast();
  const { report, loading, error, generate, copy } = useMorning({ showToast });

  return (
    <PageFrame
      title={t('morningPage.title')}
      description={t('morningPage.description')}
      actions={
        <>
          <Tooltip label={t('morning.tooltip.generate')}>
            <Button type="button" variant="default" size="sm" onClick={generate} disabled={loading}>
              {loading ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Sunrise className="h-3.5 w-3.5" />}
              <span>{t('morningPage.generate')}</span>
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
              <span>{t('morningPage.copy')}</span>
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
            <div className={text.caption}>
              {tFormat('morningPage.generatedAt', { ts: new Date(report.generatedAt).toLocaleString() })}
            </div>
          )}
          {Array.isArray(report.sections) && report.sections.length > 0 ? (
            <div className="flex flex-col gap-3">
              {report.sections.map((s, i) => (
                <Panel
                  key={i}
                  title={s.title}
                  description={`Section ${i + 1} of ${report.sections!.length} in this morning report.`}
                  className="p-3"
                >
                  <div className="text-sm">{renderMarkdown(s.body)}</div>
                </Panel>
              ))}
            </div>
          ) : report.content ? (
            <Panel className="max-h-[520px] overflow-y-auto p-3 text-sm">
              {renderMarkdown(report.content)}
            </Panel>
          ) : (
            <EmptyPanel message={t('morning.empty.noContent')} />
          )}
        </>
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
