import { useCallback, useEffect, useState } from 'react';
import { apiGet } from './api';
import type {
  Workflow,
  WorkflowsResponse,
} from '../components/WorkflowEditor';

// (v1.10.632) Extracted from WorkflowEditor. Owns the
// /api/workflows list — initial GET, busy/error state, and the
// auto-select-first-workflow logic on mount. Parent supplies a
// `getSelectedId` getter so the auto-select doesn't race a
// pre-selected id.

interface WorkflowsList {
  workflows: Workflow[];
  busy: boolean;
  error: string | null;
  setError: (next: string | null) => void;
  setBusy: (next: boolean) => void;
  refresh: () => Promise<void>;
}

export function useWorkflowsList(args: {
  getSelectedId: () => string | null;
  onAutoSelect: (id: string) => void;
}): WorkflowsList {
  const { getSelectedId, onAutoSelect } = args;
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [busy, setBusy] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const data = await apiGet<WorkflowsResponse>('/api/workflows');
      setWorkflows(data.workflows || []);
      const first = (data.workflows || [])[0];
      if (first && !getSelectedId()) {
        onAutoSelect(first.id);
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }, [getSelectedId, onAutoSelect]);

  useEffect(() => { refresh(); }, [refresh]);

  return { workflows, busy, error, setError, setBusy, refresh };
}
