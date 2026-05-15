import { useState } from 'react';
import { RefreshCw, Shield } from 'lucide-react';
import PageFrame, { ErrorPanel } from './PageFrame';
import { Alert, Button, Input, NumberInput, Panel, Switch, Textarea } from '../components/ui';
import HelpTip from '../components/HelpTip';
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
import { useForm } from '../hooks/use-form';
import { required } from '../lib/form-validation';

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

// (v1.10.605) LEVEL_VARIANT / ACTION_VARIANT (formerly
// LEVEL_TONE / ACTION_TONE) promoted to exports — consumed by
// the RiskCheckResult sibling.
// (v1.11.144) Migrated from ad-hoc class strings to Badge
// semantic variants. The 4-step level scale folds onto the
// 5-variant Badge vocabulary as critical/high -> error (both
// communicate "do not proceed"), medium -> warning, low ->
// success. The richer orange-vs-red distinction goes away but
// readers still get the correct "bad / caution / ok" signal.
import type { BadgeVariant } from '../components/ui/badge';

export const LEVEL_VARIANT: Record<CheckResponse['level'], BadgeVariant> = {
  low: 'success',
  medium: 'warning',
  high: 'error',
  critical: 'error',
};

export const ACTION_VARIANT: Record<CheckResponse['suggestedAction'], BadgeVariant> = {
  allow: 'success',
  review: 'warning',
  deny: 'error',
};

export default function Risk() {
  useLocale();
  // (v1.11.186) command field migrated to useForm. The required validator
  // surfaces an inline error via Textarea's error slot once the field is
  // touched or after a Check / Sandbox-preview click.
  const commandForm = useForm<{ command: string }>({
    initialValues: { command: '' },
    validators: { command: required() },
  });
  const command = commandForm.values.command;
  const setCommand = (value: string) => commandForm.setValue('command', value);
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
      <Alert variant="neutral" className="text-[12px]">
        {t('riskPage.intro.prefix')}
        <code className="font-mono">{t('riskPage.intro.cli')}</code>
        {t('riskPage.intro.suffix')}
      </Alert>

      {/* Command input */}
      <Panel className="text-sm">
        <h3 className={cn('mb-2 flex items-center gap-2 text-foreground', text.h3)}>
          <Shield className="h-4 w-4 text-muted-foreground" aria-hidden />
          {t('riskPage.classify.heading')}
          <HelpTip
            ariaLabel="Help for Risk classifier"
            data-testid="risk-help-classifier"
            content="The **risk classifier** inspects a shell command before a worker runs it, returning a level (`low` / `medium` / `high` / `critical`) plus reasons, decoded shell tokens, and inferred intent (files written, network peers, destructive verbs). The same classifier runs in the `PreToolUse` daemon hook, so the preview here mirrors production behaviour. `wouldDeny` reflects whether the configured auto-deny level would block this command if it were dispatched right now."
          />
        </h3>
        <div className="flex flex-col gap-2">
          <Textarea
            value={command}
            onChange={(e) => setCommand(e.target.value)}
            onBlur={() => commandForm.setTouched('command', true)}
            error={commandForm.errors.command}
            placeholder={t('riskPage.command.placeholder')}
            disabled={checkBusy}
            className="min-h-[80px] rounded border border-border bg-background p-2 font-mono text-[12px]"
            aria-label={t('riskPage.command.label')}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                commandForm.handleSubmit();
                handleCheck();
              }
            }}
          />
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              size="sm"
              onClick={() => {
                commandForm.handleSubmit();
                handleCheck();
              }}
              disabled={checkBusy || !command.trim()}
            >
              {checkBusy ? t('riskPage.checking') : t('riskPage.check')}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => {
                commandForm.handleSubmit();
                handleSandboxPreview();
              }}
              disabled={sandboxBusy || !command.trim()}
              title={t('riskPage.sandboxPreview.tooltip')}
            >
              {sandboxBusy ? t('riskPage.building') : t('riskPage.sandboxPreview')}
            </Button>
            <Switch
              checked={includeInspected}
              onChange={setIncludeInspected}
              disabled={checkBusy}
              label={t('risk.label.showPostDenoise')}
            />
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
          {/* (11.175) Migrated to NumberInput primitive. */}
          <NumberInput
            value={windowHours}
            onChange={(next) => setWindowHours(Math.max(1, Math.min(720, next ?? 24)))}
            min={1}
            max={720}
            unit="h"
            disabled={statsLoading}
            ariaLabel={t('riskPage.window.label')}
            size="sm"
            className="w-32"
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
