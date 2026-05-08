// (11.3) Workflow editor.
//
// View-only iteration: renders the workflow catalog plus a static SVG
// visualization of the selected workflow's DAG and a property panel
// for the selected node. Drag-to-edit, palette, and inline graph
// mutation are deferred to a follow-up patch (TODO 11.3 ships the
// engine + viewer; full edit UI is tracked under future work).

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { apiGet, apiPost } from '../lib/api';
import { t, useLocale } from '../lib/i18n';
import WorkflowGraph from './WorkflowGraph';
import WorkflowNodeProperties from './WorkflowNodeProperties';
import WorkflowList from './WorkflowList';
import WorkflowSelectedHeader from './WorkflowSelectedHeader';
import WorkflowRunsPanel from './WorkflowRunsPanel';
import { useWorkflowsList } from '../lib/use-workflows-list';
import { useWorkflowRuns } from '../lib/use-workflow-runs';
import {
  Card,
  CardContent,
} from './ui';

export type WorkflowNodeType = 'task' | 'condition' | 'parallel' | 'wait' | 'audit' | 'notify' | 'meeting' | 'end';

export interface WorkflowNode {
  id: string;
  type: WorkflowNodeType;
  name: string;
  config?: Record<string, unknown>;
}

export interface WorkflowEdge {
  from: string;
  to: string;
  condition?: string;
}

export interface Workflow {
  id: string;
  name: string;
  description: string;
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface WorkflowsResponse {
  workflows: Workflow[];
  count: number;
}

export interface WorkflowRunResult {
  status: 'completed' | 'failed' | 'running' | 'skipped';
  output: unknown;
  error: string | null;
  startedAt: string | null;
  completedAt: string | null;
}

export interface WorkflowRun {
  id: string;
  workflowId: string;
  status: 'completed' | 'failed' | 'running';
  startedAt: string;
  completedAt: string | null;
  inputs: unknown;
  nodeResults: Record<string, WorkflowRunResult>;
}

export interface WorkflowRunsResponse {
  workflowId: string;
  runs: WorkflowRun[];
  count: number;
}

// (v1.10.616) BadgeVariant alias moved to WorkflowRunsPanel
// (sole consumer).

// (v1.10.562) Layout constants + TYPE_FILL palette + the
// SVG graph (NodeBox / EdgeLine / WorkflowGraph) extracted to
// ./WorkflowGraph.tsx. The node-type union remains exported
// from this file (canonical home).

// (v1.10.616) runStatusVariant moved to WorkflowRunsPanel
// (sole consumer).

// (v1.10.562) layoutWorkflow / NodeBox / EdgeLine / WorkflowGraph
// extracted to ./WorkflowGraph.tsx — see import below.

// (v1.10.569) NodeProperties extracted to ./WorkflowNodeProperties.tsx

export default function WorkflowEditor() {
  useLocale();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);

  // (v1.10.632) /api/workflows list + refresh hook extracted to
  // ../lib/use-workflows-list. Selection ref keeps the
  // auto-select-first logic in the hook without giving it
  // write access to selectedId.
  const selectedIdRef = useRef(selectedId);
  selectedIdRef.current = selectedId;
  const { workflows, busy, error, setError, setBusy, refresh } = useWorkflowsList({
    getSelectedId: useCallback(() => selectedIdRef.current, []),
    onAutoSelect: useCallback((id: string) => setSelectedId(id), []),
  });

  // (v1.10.635) Per-selection runs fetch hook extracted to
  // ../lib/use-workflow-runs.
  const { runs, setRuns, expandedRunId, setExpandedRunId } = useWorkflowRuns(selectedId);

  const selected = useMemo(
    () => workflows.find((w) => w.id === selectedId) || null,
    [workflows, selectedId],
  );
  const selectedNode = useMemo(() => {
    if (!selected) return null;
    return selected.nodes.find((n) => n.id === selectedNodeId) || null;
  }, [selected, selectedNodeId]);

  // (v1.10.354) Inputs JSON for the run. Hidden behind a toggle
  // because most workflows are zero-arg; surfacing the input
  // box only when the operator wants it keeps the action row
  // tight. Resets on workflow switch.
  const [inputsOpen, setInputsOpen] = useState(false);
  const [inputsJson, setInputsJson] = useState('{}');
  const [inputsError, setInputsError] = useState<string | null>(null);
  useEffect(() => { setInputsOpen(false); setInputsJson('{}'); setInputsError(null); }, [selectedId]);

  const handleRun = async () => {
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
  };

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col gap-3 overflow-hidden p-3 text-foreground md:flex-row md:p-6">
      <aside className="w-full shrink-0 overflow-y-auto md:w-72">
        {/* (v1.10.587) Left-pane workflow list extracted to
            ./WorkflowList.tsx. */}
        <WorkflowList
          workflows={workflows}
          error={error}
          busy={busy}
          selectedId={selectedId}
          onSelect={(id) => {
            setSelectedId(id);
            setSelectedNodeId(null);
          }}
          onRefresh={refresh}
        />
      </aside>

      <main className="flex min-h-0 min-w-0 flex-1 flex-col gap-3 overflow-hidden">
        {selected ? (
          <>
            {/* (v1.10.603) Selected workflow header extracted to
                ./WorkflowSelectedHeader.tsx. */}
            <WorkflowSelectedHeader
              workflow={selected}
              busy={busy}
              inputsOpen={inputsOpen}
              inputsJson={inputsJson}
              inputsError={inputsError}
              onToggleInputs={() => setInputsOpen((v) => !v)}
              onChangeInputsJson={setInputsJson}
              onRun={handleRun}
            />

            <Card className="min-h-0 flex-1 overflow-auto">
              <CardContent className="min-h-0 p-3 md:p-4">
                <WorkflowGraph
                  workflow={selected}
                  selectedNode={selectedNodeId}
                  onSelectNode={setSelectedNodeId}
                />
              </CardContent>
            </Card>

            <div className="grid gap-3 md:grid-cols-2">
              <WorkflowNodeProperties node={selectedNode} />
              {/* (v1.10.616) Recent runs panel extracted to
                  ./WorkflowRunsPanel.tsx. */}
              <WorkflowRunsPanel
                runs={runs}
                expandedRunId={expandedRunId}
                onToggleExpanded={setExpandedRunId}
              />
            </div>
          </>
        ) : (
          <Card>
            <CardContent className="p-4 text-sm text-muted-foreground md:p-5">
              {t('workflows.empty.selection')}
            </CardContent>
          </Card>
        )}
      </main>
    </div>
  );
}
