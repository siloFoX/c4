import { useCallback, useState } from 'react';
import { apiPost } from '../lib/api';
import { Button } from './ui';
import { cn } from '../lib/cn';
import { t, tFormat, useLocale } from '../lib/i18n';
import type { Specialist } from './SpecialistsView';

// (v1.10.546) Extracted from SpecialistsView. The JSON-driven
// add / propose panel — operator pastes a candidate JSON and
// either directly adds (POST /specialists) or proposes via
// meta-meeting consensus (POST /specialists/propose). Owns its
// own form / busy / message state internally; bubbles up
// open / closed toggle via parent (the toggle button lives in
// the parent's card header).

interface ProposeDecision {
  accepted: boolean;
  accepts: string[];
  objects: Array<{ id: string }>;
  reason: string | null;
}

interface ProposeResponse {
  candidateId: string;
  meetingId: string;
  decision: ProposeDecision;
  added: boolean;
}

interface Props {
  open: boolean;
  onClose: () => void;
  onAdded: (newId: string) => void;
}

export default function SpecialistsAddPanel({ open, onClose, onAdded }: Props) {
  useLocale();

  const [json, setJson] = useState('');
  const [addBusy, setAddBusy] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  // (Phase 1.5) Propose specialist via meta-meeting consensus.
  const [proposeBusy, setProposeBusy] = useState(false);
  const [proposeMsg, setProposeMsg] = useState<string | null>(null);
  // (v1.10.485) Tone separated from message text so the
  // accepted/rejected styling survives a locale flip.
  const [proposeRejected, setProposeRejected] = useState(false);

  const handleAdd = useCallback(async () => {
    let parsed: unknown;
    try { parsed = JSON.parse(json); }
    catch (e) {
      setAddError(tFormat('specialists.add.invalidJson', { error: (e as Error).message }));
      return;
    }
    setAddBusy(true);
    setAddError(null);
    try {
      const res = await apiPost<{ ok: boolean; specialist: Specialist }>('/api/specialists', parsed);
      if (res && res.specialist) {
        onAdded(res.specialist.id);
        setJson('');
      }
    } catch (e) {
      setAddError((e as Error).message || t('common.failedToAddSpecialist'));
    } finally {
      setAddBusy(false);
    }
  }, [json, onAdded]);

  const handlePropose = useCallback(async () => {
    let parsed: unknown;
    try { parsed = JSON.parse(json); }
    catch (e) {
      setAddError(tFormat('specialists.add.invalidJson', { error: (e as Error).message }));
      return;
    }
    setProposeBusy(true);
    setAddError(null);
    setProposeMsg(null);
    setProposeRejected(false);
    try {
      const res = await apiPost<ProposeResponse>(
        '/api/specialists/propose',
        { candidate: parsed, brain: 'mock' },
      );
      if (res.added) {
        setProposeMsg(tFormat('specialists.propose.accepted', {
          count: res.decision.accepts.length,
          meetingId: res.meetingId,
        }));
        setJson('');
        onAdded(res.candidateId);
      } else {
        setProposeMsg(tFormat('specialists.propose.rejected', {
          reason: res.decision.reason || t('common.unknown'),
          meetingId: res.meetingId,
        }));
        setProposeRejected(true);
      }
    } catch (e) {
      setAddError(tFormat('specialists.add.proposeFailed', {
        error: (e as Error).message || t('common.failed'),
      }));
    } finally {
      setProposeBusy(false);
    }
  }, [json, onAdded]);

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
          onClick={() => { onClose(); setAddError(null); }}
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
