import { useEffect, useState } from 'react';
import { apiGet } from './api';
import type {
  WorkflowRun,
  WorkflowRunsResponse,
} from '../components/WorkflowEditor';

// (v1.10.635) Extracted from WorkflowEditor. Per-selection
// /api/workflows/:id/runs fetch — clears + refetches on
// `selectedId` change, also resets the expanded-run state slot
// so the panel doesn't show a stale row id from the previous
// workflow.

interface WorkflowRuns {
  runs: WorkflowRun[];
  setRuns: (next: WorkflowRun[]) => void;
  expandedRunId: string | null;
  setExpandedRunId: (next: string | null) => void;
}

export function useWorkflowRuns(selectedId: string | null): WorkflowRuns {
  const [runs, setRuns] = useState<WorkflowRun[]>([]);
  const [expandedRunId, setExpandedRunId] = useState<string | null>(null);

  useEffect(() => {
    setExpandedRunId(null);
    if (!selectedId) {
      setRuns([]);
      return;
    }
    apiGet<WorkflowRunsResponse>('/api/workflows/' + encodeURIComponent(selectedId) + '/runs')
      .then((r) => setRuns(r.runs || []))
      .catch(() => setRuns([]));
  }, [selectedId]);

  return { runs, setRuns, expandedRunId, setExpandedRunId };
}
