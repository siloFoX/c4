import { ChevronDown, ChevronRight } from 'lucide-react';
import { cn } from '../lib/cn';
import { t, tFormat, useLocale } from '../lib/i18n';
import { useToggle } from '../lib/use-toggle';
import { useSpecialistsAudit, type AuditWindow } from '../lib/use-specialists-audit';
import { useAuditVerify } from '../lib/use-audit-verify';
import { useAuditExport } from '../lib/use-audit-export';
import { ScrollArea, Timeline } from './ui';
import type { TimelineItem, TimelineTone } from './ui';

// (v1.10.531) Extracted from SpecialistsView. The collapsible
// audit log viewer + chain-verify + CSV export. Polled only while
// open so the closed state adds no load. Drops ~240 lines from
// SpecialistsView's mega-component.

// (v1.10.682) AuditEntry + AuditWindow types + audit fetch
// poll moved to lib/use-specialists-audit.

export default function SpecialistsAuditPanel() {
  // Re-render on locale flip.
  useLocale();

  const [auditOpen, toggleAuditOpen] = useToggle();
  // (v1.10.682) Audit fetch + window state moved to hook.
  const { auditEntries, auditLoading, auditWindow, setAuditWindow } =
    useSpecialistsAudit({ auditOpen });

  // (v1.10.683) Audit chain verify moved to lib/use-audit-verify.
  const { verifyBusy, verifyResult, handleVerify } = useAuditVerify();

  // (v1.10.684) CSV export moved to lib/use-audit-export.
  const { exportAuditBusy, handleAuditExport } = useAuditExport({ auditWindow });

  return (
    <div
      className="rounded-md border border-border/40 bg-muted/5"
      data-print-section="audit-log"
    >
      <button
        type="button"
        onClick={toggleAuditOpen}
        className="flex w-full items-center gap-1 px-3 py-1.5 text-[11px] text-muted-foreground hover:text-foreground"
        aria-expanded={auditOpen}
      >
        {auditOpen ? <ChevronDown className="h-3 w-3" aria-hidden /> : <ChevronRight className="h-3 w-3" aria-hidden />}
        <span className="font-medium">{t('specialists.audit.heading')}</span>
        <span>{t('specialists.audit.last50')}</span>
        {auditLoading ? <span className="ml-2">{t('specialists.audit.loading')}</span> : null}
        {auditOpen && auditEntries.length > 0 ? (
          <span className="ml-auto opacity-70">
            {tFormat('specialists.audit.entryCount', { n: String(auditEntries.length) })}
          </span>
        ) : null}
      </button>
      {auditOpen ? (
        <div className="border-t border-border/40 bg-background">
          <div className="flex flex-wrap items-center gap-1 border-b border-border/40 px-3 py-1.5 text-[10px]">
            <span className="text-muted-foreground">{t('specialists.window.label')}</span>
            {(['all', '1h', '24h', '7d'] as AuditWindow[]).map((w) => (
              <button
                key={w}
                type="button"
                onClick={() => setAuditWindow(w)}
                className={cn(
                  'rounded border px-1.5 py-0 transition-colors',
                  auditWindow === w
                    ? 'border-primary bg-primary/30 text-foreground'
                    : 'border-border bg-muted/30 text-muted-foreground hover:bg-accent/40',
                )}
                aria-pressed={auditWindow === w}
              >
                {w === 'all' ? 'all' : `last ${w}`}
              </button>
            ))}
            <span className="ml-auto inline-flex items-center gap-1">
              <button
                type="button"
                onClick={handleAuditExport}
                disabled={exportAuditBusy}
                className="rounded border border-border bg-muted/30 px-1.5 py-0 text-[10px] text-muted-foreground hover:bg-accent/40"
                title={t('specialists.tooltip.exportCsv')}
              >
                {exportAuditBusy ? '…' : t('specialists.exportCsv')}
              </button>
              <button
                type="button"
                onClick={() => handleVerify(false)}
                disabled={verifyBusy}
                className="rounded border border-border bg-muted/30 px-1.5 py-0 text-[10px] text-muted-foreground hover:bg-accent/40"
                title={t('specialists.tooltip.verifyChain')}
              >
                {verifyBusy ? '…' : t('specialists.verifyChain')}
              </button>
              <button
                type="button"
                onClick={() => handleVerify(true)}
                disabled={verifyBusy}
                className="rounded border border-border bg-muted/30 px-1.5 py-0 text-[10px] text-muted-foreground hover:bg-accent/40"
                title={t('specialists.tooltip.verifyPlusRotated')}
              >
                {t('specialists.verifyPlusRotated')}
              </button>
              {verifyResult ? (
                <span
                  className={cn(
                    'rounded border px-1.5 py-0 font-mono text-[10px]',
                    verifyResult.valid
                      ? 'border-success/40 bg-success/10 text-success'
                      : 'border-destructive/40 bg-destructive/10 text-destructive',
                  )}
                  title={
                    tFormat('specialists.verify.tooltip', {
                      total: verifyResult.total,
                      rotated: verifyResult.rotatedTotal,
                    })
                    + (verifyResult.corruptedAt != null
                      ? tFormat('specialists.verify.corruptedAt', { at: verifyResult.corruptedAt })
                      : '')
                  }
                >
                  {verifyResult.valid
                    ? tFormat('specialists.verify.ok', { count: verifyResult.total + verifyResult.rotatedTotal })
                    : t('specialists.verify.corrupt')}
                </span>
              ) : null}
            </span>
          </div>
          <ScrollArea maxHeight={256}>
            {auditEntries.length === 0 ? (
              <div className="p-3 text-[11px] text-muted-foreground">
                {auditLoading
                  ? t('common.loading')
                  : auditWindow === 'all'
                    ? t('specialists.audit.empty.all')
                    : tFormat('specialists.audit.empty.window', { window: auditWindow })}
              </div>
            ) : (
              (() => {
                // (v1.11.167) patch 11.149 - notifications-log surface adopts
                // the new Timeline primitive. The action -> tone mapping is
                // preserved (success/danger/info/warning/neutral) so visual
                // language stays continuous across this panel and the queue.
                const actionTone: Record<string, TimelineTone> = {
                  add: 'success',
                  remove: 'danger',
                  import: 'primary',
                  'score-applied': 'primary',
                  'prompt-revised': 'warning',
                  'tags-updated': 'primary',
                  'score-reset': 'warning',
                };
                const items: TimelineItem[] = auditEntries
                  .slice()
                  .reverse()
                  .map((e, i) => ({
                    id: `${e.ts}-${e.action}-${e.id ?? i}`,
                    timestamp: e.ts,
                    tone: actionTone[e.action] ?? 'neutral',
                    title: (
                      <span className="flex flex-wrap items-baseline gap-2">
                        <span className="inline-flex items-center rounded-full border border-border bg-muted/30 px-1.5 py-0 text-[10px] uppercase tracking-wide text-muted-foreground">
                          {e.action}
                        </span>
                        {e.id ? (
                          <span className="font-mono text-[11px]">{e.id}</span>
                        ) : null}
                        {e.actor ? (
                          <span className="text-muted-foreground">
                            {tFormat('specialists.event.byActor', { actor: e.actor })}
                          </span>
                        ) : null}
                      </span>
                    ),
                    description: e.reason ? (
                      <span className="italic">{e.reason}</span>
                    ) : undefined,
                  }));
                return <Timeline items={items} className="px-3 py-2" />;
              })()
            )}
          </ScrollArea>
        </div>
      ) : null}
    </div>
  );
}
