import { useCallback, useState } from 'react';
import type * as React from 'react';
import { apiPost } from './api';
import { t, tFormat } from './i18n';
import type { Specialist } from '../components/SpecialistsView';

// (v1.10.698) Extracted from SpecialistsAddPanel. The
// twin add-or-propose flow: handleAdd POSTs the parsed
// JSON straight to /api/specialists; handlePropose
// routes the same payload through a meta-meeting
// consensus on /api/specialists/propose. Both consume
// the same `json` text + share the `addError` slot, so
// bundling them keeps the parent's JSX bound to a
// single state cluster instead of threading half a
// dozen setters.

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

interface SpecialistsAddProposeState {
  json: string;
  setJson: React.Dispatch<React.SetStateAction<string>>;
  addBusy: boolean;
  addError: string | null;
  setAddError: React.Dispatch<React.SetStateAction<string | null>>;
  proposeBusy: boolean;
  proposeMsg: string | null;
  proposeRejected: boolean;
  handleAdd: () => Promise<void>;
  handlePropose: () => Promise<void>;
}

export function useSpecialistsAddPropose(args: {
  onAdded: (newId: string) => void;
}): SpecialistsAddProposeState {
  const { onAdded } = args;
  const [json, setJson] = useState('');
  const [addBusy, setAddBusy] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  const [proposeBusy, setProposeBusy] = useState(false);
  const [proposeMsg, setProposeMsg] = useState<string | null>(null);
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

  return {
    json, setJson,
    addBusy, addError, setAddError,
    proposeBusy, proposeMsg, proposeRejected,
    handleAdd, handlePropose,
  };
}
