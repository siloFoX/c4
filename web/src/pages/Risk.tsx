import { useCallback, useEffect, useState } from 'react';
import { RefreshCw, Shield } from 'lucide-react';
import PageFrame, { ErrorPanel } from './PageFrame';
import { Badge, Button, Input, Panel } from '../components/ui';
import { apiGet, apiPost } from '../lib/api';
import { t, tFormat, useLocale } from '../lib/i18n';
import { cn } from '../lib/cn';
import RiskRuleCatalogPanel from '../components/RiskRuleCatalogPanel';
import RiskSandboxPreview from '../components/RiskSandboxPreview';

// (v1.10.356) Risk classifier inspector — preview a command's
// classification before sending it to a worker, plus a stats
// glance for the last N hours.
//
// Mirrors `c4 risk` and the PreToolUse hook, with two halves:
//   - Top: command input + Check button → POST /risk/check
//          renders level / suggested action / reasons / decoded /
//          intent / wouldDeny.
//   - Bottom: GET /risk/stats?windowHours=N — total + enforced /
//          dryRun, breakdown by level, top reasons, top workers,
//          shadow exec counts.

interface CheckReason {
  code: string;
  label: string;
  snippet?: string;
}
interface CheckResponse {
  level: 'low' | 'medium' | 'high' | 'critical';
  suggestedAction: 'allow' | 'review' | 'deny';
  reasons: CheckReason[];
  decoded: string | null;
  inspectedSource?: string;
  denyForced: boolean;
  wouldDeny: boolean;
  autoDenyLevel: 'low' | 'medium' | 'high' | 'critical';
  enforcementEnabled: boolean;
  intent?: {
    filesWritten?: string[];
    filesRead?: string[];
    networkPeers?: string[];
    privileged?: boolean;
    scriptSources?: string[];
    destructiveVerbs?: string[];
    empty?: boolean;
  };
}

// (v1.10.568) PatternEntry / PatternsResponse types moved to
// ./components/RiskRuleCatalogPanel.tsx along with the panel.

// (v1.10.362) Sandbox preview — pure builder. Show what argv
// the configured sandbox runtime (docker / null) would use to
// isolate this command. No exec, no classification.
// (v1.10.585) Lifted to module scope + exported so the
// RiskSandboxPreview sibling can type its props.
export interface SandboxPreview {
  binary: string | null;
  args: string[];
  env: Record<string, string>;
  command: string;
  isolation: {
    name: string;
    network: string;
    filesystem: string;
    resources: string;
  };
  available: { ok: boolean; reason: string | null };
  runtime: 'docker' | 'null';
}

interface StatsResponse {
  windowHours: number;
  from: string;
  to: string;
  total: number;
  enforced: number;
  dryRun: number;
  shadowExec: number;
  shadowExecKilled: number;
  shadowExecNonZero: number;
  fingerprintsObserved: string[];
  ruleSetRotations: number;
  byLevel: Record<'critical' | 'high' | 'medium' | 'low', number>;
  topReasons: Array<{ key: string; count: number }>;
  topWorkers: Array<{ key: string; count: number }>;
}

const LEVEL_TONE: Record<CheckResponse['level'], string> = {
  low: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/40',
  medium: 'bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/40',
  high: 'bg-orange-500/10 text-orange-700 dark:text-orange-400 border-orange-500/40',
  critical: 'bg-destructive/10 text-destructive border-destructive/40',
};

const ACTION_TONE: Record<CheckResponse['suggestedAction'], string> = {
  allow: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/40',
  review: 'bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/40',
  deny: 'bg-destructive/10 text-destructive border-destructive/40',
};

export default function Risk() {
  useLocale();
  const [command, setCommand] = useState('');
  const [includeInspected, setIncludeInspected] = useState(false);
  const [checkBusy, setCheckBusy] = useState(false);
  const [checkResult, setCheckResult] = useState<CheckResponse | null>(null);
  const [checkError, setCheckError] = useState<string | null>(null);

  const [windowHours, setWindowHours] = useState(24);
  const [stats, setStats] = useState<StatsResponse | null>(null);
  const [statsLoading, setStatsLoading] = useState(false);
  const [statsError, setStatsError] = useState<string | null>(null);

  // (v1.10.568) Pattern catalog state moved into the extracted
  // RiskRuleCatalogPanel — self-fetching, owns its own filter +
  // open state.

  const [sandboxBusy, setSandboxBusy] = useState(false);
  const [sandbox, setSandbox] = useState<SandboxPreview | null>(null);
  const [sandboxError, setSandboxError] = useState<string | null>(null);
  const handleSandboxPreview = useCallback(async () => {
    if (!command.trim()) return;
    setSandboxBusy(true);
    setSandboxError(null);
    setSandbox(null);
    try {
      const res = await apiPost<SandboxPreview>('/api/risk/preview', {
        command: command.trim(),
      });
      setSandbox(res);
    } catch (e) {
      setSandboxError((e as Error).message || t('common.previewFailed'));
    } finally {
      setSandboxBusy(false);
    }
  }, [command]);

  const handleCheck = useCallback(async () => {
    if (!command.trim()) return;
    setCheckBusy(true);
    setCheckError(null);
    setCheckResult(null);
    try {
      const res = await apiPost<CheckResponse>('/api/risk/check', {
        command: command.trim(),
        includeInspected,
      });
      setCheckResult(res);
    } catch (e) {
      setCheckError((e as Error).message || t('common.checkFailed'));
    } finally {
      setCheckBusy(false);
    }
  }, [command, includeInspected]);

  const refreshStats = useCallback(async () => {
    setStatsLoading(true);
    setStatsError(null);
    try {
      const res = await apiGet<StatsResponse>(
        `/api/risk/stats?windowHours=${windowHours}`,
      );
      setStats(res);
    } catch (e) {
      setStatsError((e as Error).message || t('common.statsFailed'));
    } finally {
      setStatsLoading(false);
    }
  }, [windowHours]);

  useEffect(() => { refreshStats(); }, [refreshStats]);

  // (v1.10.568) Lazy-fetch effect moved into the extracted panel.

  return (
    <PageFrame
      title={t('riskPage.title.tooltip')}
      description={t('riskPage.title.description')}
      actions={
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={refreshStats}
          disabled={statsLoading}
        >
          <RefreshCw className={cn('h-3.5 w-3.5', statsLoading && 'animate-spin')} />
          <span>{t('common.refresh')}</span>
        </Button>
      }
    >
      <div className="rounded-md border border-border bg-muted/10 p-3 text-[12px] text-muted-foreground">
        {t('riskPage.intro.prefix')}
        <code className="font-mono">{t('riskPage.intro.cli')}</code>
        {t('riskPage.intro.suffix')}
      </div>

      {/* Command input */}
      <Panel className="text-sm">
        <h3 className="mb-2 flex items-center gap-2 text-base font-semibold text-foreground">
          <Shield className="h-4 w-4 text-muted-foreground" aria-hidden />
          {t('riskPage.classify.heading')}
        </h3>
        <div className="flex flex-col gap-2">
          <textarea
            value={command}
            onChange={(e) => setCommand(e.target.value)}
            placeholder={t('riskPage.command.placeholder')}
            disabled={checkBusy}
            className="min-h-[80px] rounded border border-border bg-background p-2 font-mono text-[12px]"
            aria-label={t('riskPage.command.label')}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                handleCheck();
              }
            }}
          />
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              size="sm"
              onClick={handleCheck}
              disabled={checkBusy || !command.trim()}
            >
              {checkBusy ? t('riskPage.checking') : t('riskPage.check')}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={handleSandboxPreview}
              disabled={sandboxBusy || !command.trim()}
              title={t('riskPage.sandboxPreview.tooltip')}
            >
              {sandboxBusy ? t('riskPage.building') : t('riskPage.sandboxPreview')}
            </Button>
            <label className="flex items-center gap-1 text-[11px] text-muted-foreground">
              <input
                type="checkbox"
                checked={includeInspected}
                onChange={(e) => setIncludeInspected(e.target.checked)}
                disabled={checkBusy}
                className="h-3 w-3"
              />
              {t('risk.label.showPostDenoise')}
            </label>
            <span className="text-[11px] text-muted-foreground">{t('risk.label.cmdEnterSubmit')}</span>
          </div>
          {checkError ? <ErrorPanel message={checkError} /> : null}
          {sandboxError ? <ErrorPanel message={sandboxError} /> : null}
          {sandbox ? <RiskSandboxPreview sandbox={sandbox} /> : null}
        </div>
        {checkResult ? (
          <div className="mt-3 flex flex-col gap-2 rounded-md border border-border bg-muted/10 p-3 text-[12px]">
            <div className="flex flex-wrap items-center gap-2">
              <Badge className={cn('uppercase', LEVEL_TONE[checkResult.level])}>
                {checkResult.level}
              </Badge>
              <Badge className={cn('uppercase', ACTION_TONE[checkResult.suggestedAction])}>
                {checkResult.suggestedAction}
              </Badge>
              {checkResult.wouldDeny ? (
                <Badge variant="destructive" className="uppercase">{t('risk.badge.wouldDeny')}</Badge>
              ) : null}
              {checkResult.denyForced ? (
                <Badge variant="outline" className="uppercase">{t('risk.badge.denyList')}</Badge>
              ) : null}
              <span className="text-[11px] text-muted-foreground">
                {tFormat('risk.threshold', { level: checkResult.autoDenyLevel })}
                {!checkResult.enforcementEnabled ? t('risk.enforcementOff') : ''}
              </span>
            </div>
            {checkResult.reasons.length > 0 ? (
              <div>
                <div className="text-[11px] font-medium text-foreground">
                  {tFormat('riskPage.reasons', { count: checkResult.reasons.length })}
                </div>
                <ul className="mt-1 space-y-0.5">
                  {checkResult.reasons.map((r, i) => (
                    <li key={i} className="text-[11px]">
                      <code className="rounded border border-border bg-background px-1 py-0.5 font-mono text-[10px]">
                        {r.code}
                      </code>
                      <span className="ml-1 text-muted-foreground">— {r.label}</span>
                      {r.snippet ? (
                        <span className="ml-1 italic text-muted-foreground">
                          “{r.snippet}”
                        </span>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            {checkResult.decoded ? (
              <div>
                <div className="text-[11px] font-medium text-foreground">
                  {t('riskPage.decoded')}
                </div>
                <pre tabIndex={0} className="mt-1 overflow-auto rounded bg-muted/30 p-2 font-mono text-[11px]">
                  {checkResult.decoded}
                </pre>
              </div>
            ) : null}
            {checkResult.inspectedSource ? (
              <div>
                <div className="text-[11px] font-medium text-foreground">
                  {t('riskPage.inspectedSource')}
                </div>
                <pre tabIndex={0} className="mt-1 overflow-auto rounded bg-muted/30 p-2 font-mono text-[11px]">
                  {checkResult.inspectedSource}
                </pre>
              </div>
            ) : null}
            {checkResult.intent && !checkResult.intent.empty ? (
              <div>
                <div className="text-[11px] font-medium text-foreground">
                  {t('riskPage.staticIntent')}
                </div>
                <ul className="mt-1 space-y-0.5 text-[11px]">
                  {checkResult.intent.privileged ? (
                    <li><Badge variant="destructive" className="text-[10px]">{t('risk.badge.privileged')}</Badge></li>
                  ) : null}
                  {(checkResult.intent.filesWritten || []).length > 0 ? (
                    <li>
                      <span className="text-muted-foreground">{t('risk.intent.writes')}</span>
                      {checkResult.intent.filesWritten!.map((f) => (
                        <code key={f} className="ml-1 rounded border border-border bg-background px-1 font-mono text-[10px]">
                          {f}
                        </code>
                      ))}
                    </li>
                  ) : null}
                  {(checkResult.intent.filesRead || []).length > 0 ? (
                    <li>
                      <span className="text-muted-foreground">{t('risk.intent.reads')}</span>
                      {checkResult.intent.filesRead!.map((f) => (
                        <code key={f} className="ml-1 rounded border border-border bg-background px-1 font-mono text-[10px]">
                          {f}
                        </code>
                      ))}
                    </li>
                  ) : null}
                  {(checkResult.intent.networkPeers || []).length > 0 ? (
                    <li>
                      <span className="text-muted-foreground">{t('risk.intent.network')}</span>
                      {checkResult.intent.networkPeers!.map((p) => (
                        <code key={p} className="ml-1 rounded border border-border bg-background px-1 font-mono text-[10px]">
                          {p}
                        </code>
                      ))}
                    </li>
                  ) : null}
                  {(checkResult.intent.destructiveVerbs || []).length > 0 ? (
                    <li>
                      <span className="text-muted-foreground">{t('risk.intent.destructive')}</span>
                      {checkResult.intent.destructiveVerbs!.map((v) => (
                        <code key={v} className="ml-1 rounded border border-amber-500/40 bg-amber-500/10 px-1 font-mono text-[10px] text-amber-700 dark:text-amber-400">
                          {v}
                        </code>
                      ))}
                    </li>
                  ) : null}
                </ul>
              </div>
            ) : null}
          </div>
        ) : null}
      </Panel>

      {/* Stats */}
      <Panel className="mt-4 text-sm">
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-base font-semibold text-foreground">
            {t('riskPage.recentDenials')}
          </h3>
          <label className="flex items-center gap-1 text-[11px] text-muted-foreground">
            {t('riskPage.window.label')}
            <Input
              type="number"
              min={1}
              max={720}
              value={windowHours}
              onChange={(e) => setWindowHours(Math.max(1, Math.min(720, Number(e.target.value) || 24)))}
              disabled={statsLoading}
              className="h-7 w-16 text-[11px]"
            />
            hours
          </label>
        </div>
        {statsError ? <ErrorPanel message={statsError} /> : null}
        {stats ? (
          <div className="grid grid-cols-2 gap-x-6 gap-y-2 md:grid-cols-4">
            <div>
              <div className="text-[10px] uppercase text-muted-foreground">{t('risk.stats.totalEvents')}</div>
              <div className="font-mono text-[14px]">{stats.total}</div>
            </div>
            <div>
              <div className="text-[10px] uppercase text-muted-foreground">{t('risk.stats.enforced')}</div>
              <div className={cn('font-mono text-[14px]', stats.enforced > 0 && 'text-destructive')}>
                {stats.enforced}
              </div>
            </div>
            <div>
              <div className="text-[10px] uppercase text-muted-foreground">{t('risk.stats.dryRun')}</div>
              <div className="font-mono text-[14px]">{stats.dryRun}</div>
            </div>
            <div>
              <div className="text-[10px] uppercase text-muted-foreground">{t('risk.stats.shadowExec')}</div>
              <div className="font-mono text-[14px]">{stats.shadowExec}</div>
              {stats.shadowExecKilled > 0 || stats.shadowExecNonZero > 0 ? (
                <div className="text-[10px] text-amber-700 dark:text-amber-400">
                  {stats.shadowExecKilled > 0 ? `${stats.shadowExecKilled} killed` : ''}
                  {stats.shadowExecKilled > 0 && stats.shadowExecNonZero > 0 ? ' · ' : ''}
                  {stats.shadowExecNonZero > 0 ? `${stats.shadowExecNonZero} non-zero` : ''}
                </div>
              ) : null}
            </div>
            {(['critical', 'high', 'medium', 'low'] as const).map((lv) => (
              <div key={lv}>
                <div className="text-[10px] uppercase text-muted-foreground">{lv}</div>
                <div className={cn('font-mono text-[14px]', LEVEL_TONE[lv].split(' ')[1])}>
                  {stats.byLevel[lv] || 0}
                </div>
              </div>
            ))}
            {stats.topReasons.length > 0 ? (
              <div className="col-span-2 md:col-span-4">
                <div className="text-[10px] uppercase text-muted-foreground">{t('risk.stats.topReasons')}</div>
                <ul className="text-[11px]">
                  {stats.topReasons.map((r) => (
                    <li key={r.key}>
                      <code className="rounded border border-border bg-background px-1 font-mono text-[10px]">
                        {r.key}
                      </code>
                      <span className="ml-1 text-muted-foreground">× {r.count}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            {stats.topWorkers.length > 0 ? (
              <div className="col-span-2 md:col-span-4">
                <div className="text-[10px] uppercase text-muted-foreground">{t('risk.stats.topWorkers')}</div>
                <ul className="text-[11px]">
                  {stats.topWorkers.map((w) => (
                    <li key={w.key}>
                      <code className="rounded border border-border bg-background px-1 font-mono text-[10px]">
                        {w.key}
                      </code>
                      <span className="ml-1 text-muted-foreground">× {w.count}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            {stats.ruleSetRotations > 1 ? (
              <div className="col-span-2 md:col-span-4 rounded border border-amber-500/40 bg-amber-500/10 p-2 text-[11px] text-amber-700 dark:text-amber-400">
                <span className="font-medium">{stats.ruleSetRotations} rule-set rotations</span>
                {' '}detected in this window — operator changed classifier config mid-window.
              </div>
            ) : null}
            <div className="col-span-2 md:col-span-4 text-[10px] text-muted-foreground">
              {stats.from} → {stats.to}
            </div>
          </div>
        ) : !statsError ? (
          <div className="text-[12px] text-muted-foreground">{t('common.loading')}</div>
        ) : null}
      </Panel>

      {/* (v1.10.568) Rule catalog viewer extracted to
          ./components/RiskRuleCatalogPanel.tsx — self-fetching. */}
      <RiskRuleCatalogPanel />
    </PageFrame>
  );
}
