import { useCallback, useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { apiGet } from '../lib/api';
import { cn } from '../lib/cn';
import { t, tFormat, useLocale } from '../lib/i18n';
import { useSpecialistsAudit, type AuditWindow } from '../lib/use-specialists-audit';

// (v1.10.531) Extracted from SpecialistsView. The collapsible
// audit log viewer + chain-verify + CSV export. Polled only while
// open so the closed state adds no load. Drops ~240 lines from
// SpecialistsView's mega-component.

// (v1.10.682) AuditEntry + AuditWindow types + audit fetch
// poll moved to lib/use-specialists-audit.

export default function SpecialistsAuditPanel() {
  // Re-render on locale flip.
  useLocale();

  const [auditOpen, setAuditOpen] = useState(false);
  // (v1.10.682) Audit fetch + window state moved to hook.
  const { auditEntries, auditLoading, auditWindow, setAuditWindow } =
    useSpecialistsAudit({ auditOpen });

  // Audit chain verify — daemon-wide hash chain integrity check.
  const [verifyBusy, setVerifyBusy] = useState(false);
  const [verifyResult, setVerifyResult] = useState<{
    valid: boolean;
    corruptedAt: number | null;
    total: number;
    rotatedTotal: number;
  } | null>(null);

  const handleVerify = useCallback(async (includeRotated: boolean) => {
    setVerifyBusy(true);
    setVerifyResult(null);
    try {
      const qs = includeRotated ? '?includeRotated=1' : '';
      const res = await apiGet<{
        valid: boolean;
        corruptedAt: number | null;
        total: number;
        rotatedTotal: number;
      }>(`/api/audit/verify${qs}`);
      setVerifyResult(res);
    } catch {
      setVerifyResult({ valid: false, corruptedAt: null, total: 0, rotatedTotal: 0 });
    } finally {
      setVerifyBusy(false);
    }
  }, []);

  // CSV export — uses the same window selector. Default UTF-8 BOM
  // + CRLF for Excel-friendliness.
  const [exportAuditBusy, setExportAuditBusy] = useState(false);
  const handleAuditExport = useCallback(async () => {
    setExportAuditBusy(true);
    try {
      const params = new URLSearchParams();
      if (auditWindow !== 'all') {
        const hours = auditWindow === '1h' ? 1 : auditWindow === '24h' ? 24 : 24 * 7;
        params.set('from', new Date(Date.now() - hours * 3600 * 1000).toISOString());
      }
      params.set('lineEnd', 'crlf');
      const url = `/api/audit/export?${params.toString()}`;
      const { apiFetch } = await import('../lib/api');
      const res = await apiFetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();
      const a = document.createElement('a');
      const objUrl = URL.createObjectURL(blob);
      a.href = objUrl;
      a.download = `c4-audit-${auditWindow}-${new Date().toISOString().replace(/[:.]/g, '-')}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(objUrl);
    } catch {
      // best-effort — silent failure
    } finally {
      setExportAuditBusy(false);
    }
  }, [auditWindow]);

  return (
    <div className="rounded-md border border-border/40 bg-muted/5">
      <button
        type="button"
        onClick={() => setAuditOpen((v) => !v)}
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
                      ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400'
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
          <div className="max-h-64 overflow-y-auto">
            {auditEntries.length === 0 ? (
              <div className="p-3 text-[11px] text-muted-foreground">
                {auditLoading
                  ? t('common.loading')
                  : auditWindow === 'all'
                    ? t('specialists.audit.empty.all')
                    : tFormat('specialists.audit.empty.window', { window: auditWindow })}
              </div>
            ) : (
              <ul className="divide-y divide-border/40 text-[11px]">
                {auditEntries.slice().reverse().map((e, i) => {
                  const tone: Record<string, string> = {
                    add: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400',
                    remove: 'border-rose-500/40 bg-rose-500/10 text-rose-700 dark:text-rose-400',
                    import: 'border-blue-500/40 bg-blue-500/10 text-blue-700 dark:text-blue-400',
                    'score-applied': 'border-purple-500/40 bg-purple-500/10 text-purple-700 dark:text-purple-400',
                    'prompt-revised': 'border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-400',
                    'tags-updated': 'border-cyan-500/40 bg-cyan-500/10 text-cyan-700 dark:text-cyan-400',
                    'score-reset': 'border-orange-500/40 bg-orange-500/10 text-orange-700 dark:text-orange-400',
                  };
                  return (
                    <li key={i} className="flex flex-wrap items-baseline gap-2 px-3 py-1.5">
                      <span className="font-mono text-[10px] text-muted-foreground">
                        {new Date(e.ts).toLocaleString()}
                      </span>
                      <span className={cn(
                        'inline-flex items-center rounded-full border px-1.5 py-0 text-[10px] uppercase tracking-wide',
                        tone[e.action] || 'border-border bg-muted/30 text-muted-foreground',
                      )}>
                        {e.action}
                      </span>
                      {e.id ? (
                        <span className="font-mono text-[11px]">{e.id}</span>
                      ) : null}
                      {e.actor ? (
                        <span className="text-muted-foreground">{tFormat('specialists.event.byActor', { actor: e.actor })}</span>
                      ) : null}
                      {e.reason ? (
                        <span className="text-muted-foreground italic">— {e.reason}</span>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
