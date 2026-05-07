import { useCallback, useEffect, useState } from 'react';
import { apiPost } from '../lib/api';
import { Button } from './ui';
import { cn } from '../lib/cn';
import { t, tFormat, useLocale } from '../lib/i18n';

// (v1.10.558) Extracted from SpecialistsView. The system-prompt
// section of the specialist detail card — the prompt block plus
// the Suggest revision (review-only) + Apply via meeting consensus
// buttons and the per-action result/error displays. Owns its own
// suggest / apply state internally; resets on specialistId change.

interface ApplyResult {
  specialistId: string;
  meetingId: string | null;
  decision: {
    accepted: boolean;
    accepts: string[];
    objects: Array<Record<string, unknown>>;
    missing: string[];
    reason: string | null;
  };
  applied: boolean;
  suggestion: {
    revision: string | null;
    rationale: string | null;
  };
  sessionStatus: string | null;
}

interface SuggestResponse {
  revision: string | null;
  rationale: string | null;
}

interface Props {
  specialistId: string;
  systemPrompt: string;
}

export default function SpecialistsPromptPanel({ specialistId, systemPrompt }: Props) {
  useLocale();

  const [suggestBusy, setSuggestBusy] = useState(false);
  const [suggestion, setSuggestion] = useState<SuggestResponse | null>(null);
  const [suggestError, setSuggestError] = useState<string | null>(null);
  const [applyBusy, setApplyBusy] = useState(false);
  const [applyResult, setApplyResult] = useState<ApplyResult | null>(null);
  const [applyError, setApplyError] = useState<string | null>(null);

  // Reset both result panels on specialist change.
  useEffect(() => {
    setSuggestion(null);
    setSuggestError(null);
    setApplyResult(null);
    setApplyError(null);
  }, [specialistId]);

  const handleSuggest = useCallback(async () => {
    setSuggestBusy(true);
    setSuggestError(null);
    setSuggestion(null);
    try {
      const res = await apiPost<SuggestResponse>(
        `/api/specialists/${encodeURIComponent(specialistId)}/suggest-prompt`,
        { brain: 'mock' },
      );
      setSuggestion({ revision: res.revision, rationale: res.rationale });
    } catch (e) {
      setSuggestError((e as Error).message || t('common.suggestFailed'));
    } finally {
      setSuggestBusy(false);
    }
  }, [specialistId]);

  const handleApply = useCallback(async () => {
    if (!window.confirm(t('specialists.applyConfirm'))) return;
    setApplyBusy(true);
    setApplyError(null);
    setApplyResult(null);
    try {
      const res = await apiPost<ApplyResult>(
        `/api/specialists/${encodeURIComponent(specialistId)}/prompt-apply`,
        { brain: 'mock', autoApply: true },
      );
      setApplyResult(res);
    } catch (e) {
      setApplyError((e as Error).message || t('common.applyFailed'));
    } finally {
      setApplyBusy(false);
    }
  }, [specialistId]);

  return (
    <div>
      <div className="flex items-center justify-between gap-2">
        <div className="text-xs text-muted-foreground">{t('specialists.label.systemPrompt')}</div>
        <div className="flex items-center gap-1">
          {/* (Phase 5.1) Suggest revision — read-only;
              operator copies result manually if useful. */}
          <Button
            size="sm"
            variant="outline"
            onClick={handleSuggest}
            disabled={suggestBusy}
            className="h-6 px-2 text-[10px]"
            title={t('specialists.tooltip.suggest')}
          >
            {suggestBusy ? t('specialists.suggestRevisionAsking') : t('specialists.suggestRevision')}
          </Button>
          {/* (Phase 5.2) Apply via meeting consensus.
              Spawns a meta-meeting. On accepted consensus
              the systemPrompt is replaced + audit logged. */}
          <Button
            size="sm"
            variant="outline"
            onClick={handleApply}
            disabled={applyBusy}
            className="h-6 px-2 text-[10px] border-amber-500/60 text-amber-700 dark:text-amber-300"
            title={t('specialists.tooltip.applyMeeting')}
          >
            {applyBusy ? t('specialists.applyViaMeetingApplying') : t('specialists.applyViaMeeting')}
          </Button>
        </div>
      </div>
      <pre className="mt-1 whitespace-pre-wrap rounded-md border border-border bg-muted/20 p-3 text-[12px] font-mono">
        {systemPrompt}
      </pre>
      {suggestError ? (
        <div className="mt-1 text-[11px] text-destructive">{suggestError}</div>
      ) : null}
      {suggestion ? (
        <div className="mt-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-2 text-[11px]">
          <div className="mb-1 font-medium text-amber-700 dark:text-amber-400">
            {t('specialists.suggest.title')}
          </div>
          {suggestion.revision ? (
            <pre className="whitespace-pre-wrap font-mono">{suggestion.revision}</pre>
          ) : (
            <div className="italic text-muted-foreground">
              {t('specialists.suggest.empty')}
            </div>
          )}
          {suggestion.rationale ? (
            <div className="mt-1 text-muted-foreground">
              <span className="font-medium">{t('specialists.suggest.rationale')}</span> {suggestion.rationale}
            </div>
          ) : null}
          <div className="mt-1 text-muted-foreground italic text-[10px]">
            {t('specialists.suggest.applyHint')}
            <code className="ml-1">{tFormat('specialists.suggest.applyHintCli', { id: specialistId })}</code>
            {t('specialists.suggest.applyHintTrailing')}
          </div>
        </div>
      ) : null}
      {applyError ? (
        <div className="mt-1 text-[11px] text-destructive">{applyError}</div>
      ) : null}
      {applyResult ? (
        <div className={cn(
          'mt-2 rounded-md border p-2 text-[11px]',
          applyResult.applied
            ? 'border-emerald-500/40 bg-emerald-500/10'
            : 'border-amber-500/40 bg-amber-500/10',
        )}>
          <div className="mb-1 flex items-center justify-between gap-2">
            <div className={cn(
              'font-medium',
              applyResult.applied
                ? 'text-emerald-700 dark:text-emerald-400'
                : 'text-amber-700 dark:text-amber-400',
            )}>
              {applyResult.applied
                ? t('specialists.applyResult.applied')
                : applyResult.meetingId
                ? t('specialists.applyResult.fired')
                : t('specialists.applyResult.noRevision')}
            </div>
            {applyResult.meetingId ? (
              <a
                href={`#/meetings/${encodeURIComponent(applyResult.meetingId)}`}
                className="rounded border border-border bg-background px-1.5 py-0.5 text-[10px] font-mono hover:bg-muted/30"
                title={t('specialists.tooltip.openMeeting')}
              >
                meeting → {applyResult.meetingId.slice(0, 8)}
              </a>
            ) : null}
          </div>
          <div className="text-muted-foreground">
            decision: {applyResult.decision.accepted ? 'accepted' : 'rejected'}
            {' · '}accepts {applyResult.decision.accepts.length}
            {applyResult.decision.objects.length > 0 ? (
              <> · objects {applyResult.decision.objects.length}</>
            ) : null}
            {applyResult.decision.reason ? (
              <> — <span className="italic">{applyResult.decision.reason}</span></>
            ) : null}
          </div>
          {applyResult.suggestion.revision ? (
            <pre className="mt-1 max-h-40 overflow-auto whitespace-pre-wrap rounded bg-muted/30 p-1 font-mono">
              {applyResult.suggestion.revision}
            </pre>
          ) : null}
          {applyResult.suggestion.rationale ? (
            <div className="mt-1 text-muted-foreground">
              <span className="font-medium">{t('specialists.suggest.rationale')}</span> {applyResult.suggestion.rationale}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
