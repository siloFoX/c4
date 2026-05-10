import { useCallback } from 'react';
import { Button } from './ui';
import { cn } from '../lib/cn';
import { t, useLocale } from '../lib/i18n';
import { useSpecialistsAddPropose } from '../lib/use-specialists-add-propose';

// (v1.10.546) Extracted from SpecialistsView. The JSON-driven
// add / propose panel — operator pastes a candidate JSON and
// either directly adds (POST /specialists) or proposes via
// meta-meeting consensus (POST /specialists/propose). Owns its
// own form / busy / message state internally; bubbles up
// open / closed toggle via parent (the toggle button lives in
// the parent's card header).

// (v1.10.698) ProposeDecision/ProposeResponse types +
// handleAdd + handlePropose flows moved to
// lib/use-specialists-add-propose.

interface Props {
  open: boolean;
  onClose: () => void;
  onAdded: (newId: string) => void;
}

export default function SpecialistsAddPanel({ open, onClose, onAdded }: Props) {
  useLocale();

  // (v1.10.698) Add + propose flows moved to hook.
  const {
    json, setJson,
    addBusy, addError, setAddError,
    proposeBusy, proposeMsg, proposeRejected,
    handleAdd, handlePropose,
  } = useSpecialistsAddPropose({ onAdded });

  // (v1.10.762) Stable cancel callback — drops the
  // `() => { onClose(); setAddError(null); }` inline arrow.
  const handleCancel = useCallback(() => {
    onClose();
    setAddError(null);
  }, [onClose, setAddError]);

  if (!open) return null;

  return (
    <div className="flex flex-col gap-2 rounded-md border border-dashed border-border bg-muted/20 p-3">
      <textarea
        value={json}
        onChange={(e) => setJson(e.target.value)}
        placeholder='{"id":"data-engineer","displayName":"Data Engineer","tier":"implement","domain":["data","etl"],"brain":{"adapter":"claude-code","model":"sonnet"},"systemPrompt":"[Role: Data Engineer] ...","triggers":{"keywords":["etl"],"stages":["design","implement"]}}'
        className="min-h-32 rounded-md border border-border bg-background p-2 font-mono text-[11px]"
        aria-label={t('specialists.json.label')}
        disabled={addBusy}
      />
      <div className="flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          onClick={handleAdd}
          disabled={addBusy || proposeBusy || !json.trim()}
          aria-label={t('specialists.action.confirmAdd')}
        >
          {t('specialists.action.addLabel')}
        </Button>
        {/* (Phase 1.5) Propose via meta-meeting consensus —
            safer governance path than direct add. */}
        <Button
          size="sm"
          variant="outline"
          onClick={handlePropose}
          disabled={proposeBusy || addBusy || !json.trim()}
          aria-label={t('specialists.action.propose')}
          title={t('specialists.tooltip.propose')}
        >
          {t('specialists.action.proposeLabel')}
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={handleCancel}
          disabled={addBusy || proposeBusy}
        >
          {t('common.cancel')}
        </Button>
        {addError ? (
          <span className="text-[11px] text-destructive">{addError}</span>
        ) : null}
        {proposeMsg ? (
          <span className={cn(
            'text-[11px]',
            proposeRejected ? 'text-amber-700 dark:text-amber-400' : 'text-emerald-700 dark:text-emerald-400',
          )}>
            {proposeMsg}
          </span>
        ) : null}
      </div>
    </div>
  );
}
