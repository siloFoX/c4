import { useCallback, useEffect, useState } from 'react';
import { apiPost } from './api';
import { t } from './i18n';

// (v1.10.699) Extracted from SpecialistsPromptPanel. Two
// related flows: (1) handleSuggest POSTs to
// /api/specialists/:id/suggest-prompt and surfaces a
// revision + rationale (read-only — operator copies if
// useful); (2) handleApply POSTs to
// /api/specialists/:id/prompt-apply behind a
// window.confirm and replaces the systemPrompt on
// accepted consensus. Both reset on specialist change so
// stale results from specialist A don't leak into B.

export interface ApplyResult {
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

export interface SuggestResponse {
  revision: string | null;
  rationale: string | null;
}

interface PromptRevisionState {
  suggestBusy: boolean;
  suggestion: SuggestResponse | null;
  suggestError: string | null;
  applyBusy: boolean;
  applyResult: ApplyResult | null;
  applyError: string | null;
  handleSuggest: () => Promise<void>;
  handleApply: () => Promise<void>;
}

export function usePromptRevision(args: {
  specialistId: string;
}): PromptRevisionState {
  const { specialistId } = args;
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

  return {
    suggestBusy, suggestion, suggestError,
    applyBusy, applyResult, applyError,
    handleSuggest, handleApply,
  };
}
