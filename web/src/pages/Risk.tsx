import { useState } from 'react';
import { RefreshCw, Shield } from 'lucide-react';
import PageFrame, { ErrorPanel } from './PageFrame';
import { Button, Input, Panel } from '../components/ui';
import { t, useLocale } from '../lib/i18n';
import { cn } from '../lib/cn';
import { text } from '../lib/typography';
import RiskRuleCatalogPanel from '../components/RiskRuleCatalogPanel';
import RiskSandboxPreview from '../components/RiskSandboxPreview';
import RiskCheckResult from '../components/RiskCheckResult';
import RiskStatsGrid from '../components/RiskStatsGrid';
import { useRiskStats } from '../lib/use-risk-stats';
import { useRiskCheck } from '../lib/use-risk-check';
import { useRiskSandboxPreview } from '../lib/use-risk-sandbox-preview';

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

// (v1.10.605) Promoted to exports so the RiskCheckResult sibling
// can type its props.
export interface CheckReason {
  code: string;
  label: string;
  snippet?: string;
}
export interface CheckResponse {
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

// (v1.10.606) Promoted to export so the RiskStatsGrid sibling
// can type its `stats` prop.
export interface StatsResponse {
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

// (v1.10.605) LEVEL_TONE / ACTION_TONE promoted to exports —
// consumed by the RiskCheckResult sibling.
export const LEVEL_TONE: Record<CheckResponse['level'], string> = {
  low: 'bg-success/10 text-success border-success/40',
  medium: 'bg-warning/10 text-warning border-warning/40',
  high: 'bg-orange-500/10 text-orange-700 dark:text-orange-400 border-orange-500/40',
  critical: 'bg-destructive/10 text-destructive border-destructive/40',
};

export const ACTION_TONE: Record<CheckResponse['suggestedAction'], string> = {
  allow: 'bg-success/10 text-success border-success/40',
  review: 'bg-warning/10 text-warning border-warning/40',
  deny: 'bg-destructive/10 text-destructive border-destructive/40',
};

export default function Risk() {
  useLocale();
  const [command, setCommand] = useState('');
  const [includeInspected, setIncludeInspected] = useState(false);
  // (v1.10.568) Pattern catalog state moved into the extracted
  // RiskRuleCatalogPanel — self-fetching, owns its own filter +
  // open state.
  // (v1.10.657) check + sandbox-preview moved to hooks.
  const { checkBusy, checkResult, checkError, runCheck: handleCheck } =
    useRiskCheck({ command, includeInspected });
  const { sandboxBusy, sandbox, sandboxError, runPreview: handleSandboxPreview } =
    useRiskSandboxPreview({ command });

  // (v1.10.644) Risk stats poll hook extracted to ../lib/use-risk-stats.
  const {
    windowHours,
    setWindowHours,
    stats,
    statsLoading,
    statsError,
    refreshStats,
  } = useRiskStats();

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
        <h3 className={cn('mb-2 flex items-center gap-2 text-foreground', text.h3)}>
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
        {checkResult ? <RiskCheckResult result={checkResult} /> : null}
      </Panel>

      {/* Stats */}
      <Panel className="mt-4 text-sm">
        <div className="mb-2 flex items-center justify-between">
          <h3 className={cn('text-foreground', text.h3)}>
            {t('riskPage.recentDenials')}
          </h3>
          <Input
            label={t('riskPage.window.label')}
            hint="hours"
            type="number"
            min={1}
            max={720}
            value={windowHours}
            onChange={(e) => setWindowHours(Math.max(1, Math.min(720, Number(e.target.value) || 24)))}
            disabled={statsLoading}
            className="h-7 w-16 text-[11px]"
          />
        </div>
        {statsError ? <ErrorPanel message={statsError} /> : null}
        {stats ? <RiskStatsGrid stats={stats} /> : !statsError ? (
          <div className="text-[12px] text-muted-foreground">{t('common.loading')}</div>
        ) : null}
      </Panel>

      {/* (v1.10.568) Rule catalog viewer extracted to
          ./components/RiskRuleCatalogPanel.tsx — self-fetching. */}
      <RiskRuleCatalogPanel />
    </PageFrame>
  );
}
