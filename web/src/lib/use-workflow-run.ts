import { useCallback, useEffect, useState } from 'react';
import type * as React from 'react';
import { apiGet, apiPost } from './api';
import { t } from './i18n';
import type { WorkflowRun, WorkflowRunsResponse } from '../components/WorkflowEditor';

// (v1.10.677) Extracted from WorkflowEditor. Owns the
// inputs JSON drawer state + the run-now POST handler.
// The inputs drawer auto-resets on `selectedId` change
// so a half-typed JSON from workflow A doesn't leak to
// workflow B. handleRun parses + validates JSON, POSTs
// the run, and refetches the runs list so the panel
// updates immediately.

interface WorkflowRunState {
  inputsOpen: boolean;
  toggleInputs: () => void;
  inputsJson: string;
  setInputsJson: React.Dispatch<React.SetStateAction<string>>;
  inputsError: string | null;
  handleRun: () => Promise<void>;
}

export function useWorkflowRun(args: {
  selectedId: string | null;
  setRuns: (runs: WorkflowRun[]) => void;
  setBusy: (busy: boolean) => void;
  setError: (message: string | null) => void;
}): WorkflowRunState {
  const { selectedId, setRuns, setBusy, setError } = args;
  const [inputsOpen, setInputsOpen] = useState(false);
  const [inputsJson, setInputsJson] = useState('{}');
  const [inputsError, setInputsError] = useState<string | null>(null);

  // Reset inputs on workflow switch.
  useEffect(() => {
    setInputsOpen(false);
    setInputsJson('{}');
    setInputsError(null);
  }, [selectedId]);

  const handleRun = useCallback(async () => {
    if (!selectedId) return;
    let inputs: unknown = {};
    if (inputsOpen) {
      try {
        const parsed = JSON.parse(inputsJson);
        if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
          throw new Error(t('workflowEditor.inputsMustBeObject'));
        }
        inputs = parsed;
      } catch (e) {
        setInputsError((e as Error).message || t('common.invalidJson'));
        return;
      }
    }
    setInputsError(null);
    setBusy(true);
    try {
      await apiPost('/api/workflows/' + encodeURIComponent(selectedId) + '/run', { inputs });
      const r = await apiGet<WorkflowRunsResponse>('/api/workflows/' + encodeURIComponent(selectedId) + '/runs');
      setRuns(r.runs || []);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }, [selectedId, inputsOpen, inputsJson, setRuns, setBusy, setError]);

  const toggleInputs = useCallback(() => setInputsOpen((v) => !v), []);
  return { inputsOpen, toggleInputs, inputsJson, setInputsJson, inputsError, handleRun };
}
