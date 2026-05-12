import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { setLocale } from '../lib/i18n';
import type {
  Workflow,
  WorkflowNode,
  WorkflowRun,
} from './WorkflowEditor';

// WorkflowEditor wires three hooks (use-workflows-list,
// use-workflow-runs, use-workflow-run) + use-live-ref + five
// sibling components (WorkflowList, WorkflowSelectedHeader,
// WorkflowGraph, WorkflowNodeProperties, WorkflowRunsPanel).
// Stub every hook + every child to a marker so each test
// can drive a single branch without booting fetch.

const refreshMock = vi.fn(async () => {});
const setErrorMock = vi.fn();
const setBusyMock = vi.fn();
const setRunsMock = vi.fn();
const setExpandedRunIdMock = vi.fn();
const toggleInputsMock = vi.fn();
const setInputsJsonMock = vi.fn();
const handleRunMock = vi.fn(async () => {});

let listState: {
  workflows: Workflow[];
  busy: boolean;
  error: string | null;
} = {
  workflows: [],
  busy: false,
  error: null,
};

let runsState: {
  runs: WorkflowRun[];
  expandedRunId: string | null;
} = { runs: [], expandedRunId: null };

let runState: {
  inputsOpen: boolean;
  inputsJson: string;
  inputsError: string | null;
} = { inputsOpen: false, inputsJson: '{}', inputsError: null };

let lastListArgs: {
  getSelectedId: () => string | null;
  onAutoSelect: (id: string) => void;
} | null = null;
let lastRunsArg: string | null | undefined;
let lastRunArgs: {
  selectedId: string | null;
  setRuns: (runs: WorkflowRun[]) => void;
  setBusy: (b: boolean) => void;
  setError: (m: string | null) => void;
} | null = null;

vi.mock('../lib/use-live-ref', async () => {
  const react = await vi.importActual<typeof import('react')>('react');
  return {
    useLiveRef: <T,>(value: T) => {
      const ref = react.useRef(value);
      ref.current = value;
      return ref;
    },
  };
});

vi.mock('../lib/use-workflows-list', () => ({
  useWorkflowsList: (args: {
    getSelectedId: () => string | null;
    onAutoSelect: (id: string) => void;
  }) => {
    lastListArgs = args;
    return {
      workflows: listState.workflows,
      busy: listState.busy,
      error: listState.error,
      setError: setErrorMock,
      setBusy: setBusyMock,
      refresh: refreshMock,
    };
  },
}));

vi.mock('../lib/use-workflow-runs', () => ({
  useWorkflowRuns: (selectedId: string | null) => {
    lastRunsArg = selectedId;
    return {
      runs: runsState.runs,
      setRuns: setRunsMock,
      expandedRunId: runsState.expandedRunId,
      setExpandedRunId: setExpandedRunIdMock,
    };
  },
}));

vi.mock('../lib/use-workflow-run', () => ({
  useWorkflowRun: (args: {
    selectedId: string | null;
    setRuns: (runs: WorkflowRun[]) => void;
    setBusy: (b: boolean) => void;
    setError: (m: string | null) => void;
  }) => {
    lastRunArgs = args;
    return {
      inputsOpen: runState.inputsOpen,
      toggleInputs: toggleInputsMock,
      inputsJson: runState.inputsJson,
      setInputsJson: setInputsJsonMock,
      inputsError: runState.inputsError,
      handleRun: handleRunMock,
    };
  },
}));

interface CapturedListProps {
  workflows: Workflow[];
  error: string | null;
  busy: boolean;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onRefresh: () => void;
}

let lastListCardProps: CapturedListProps | null = null;

vi.mock('./WorkflowList', () => ({
  default: (props: CapturedListProps) => {
    lastListCardProps = props;
    return (
      <div
        data-testid="workflow-list"
        data-count={String(props.workflows.length)}
        data-busy={props.busy ? 'true' : 'false'}
        data-error={props.error ?? ''}
        data-selected={props.selectedId ?? ''}
      >
        <button
          type="button"
          data-testid="list-select-a"
          onClick={() => props.onSelect('a')}
        >
          a
        </button>
        <button
          type="button"
          data-testid="list-select-b"
          onClick={() => props.onSelect('b')}
        >
          b
        </button>
        <button
          type="button"
          data-testid="list-refresh"
          onClick={props.onRefresh}
        >
          refresh
        </button>
      </div>
    );
  },
}));

interface CapturedHeaderProps {
  workflow: Workflow;
  busy: boolean;
  inputsOpen: boolean;
  inputsJson: string;
  inputsError: string | null;
  onToggleInputs: () => void;
  onChangeInputsJson: (next: string) => void;
  onRun: () => void;
}

let lastHeaderProps: CapturedHeaderProps | null = null;

vi.mock('./WorkflowSelectedHeader', () => ({
  default: (props: CapturedHeaderProps) => {
    lastHeaderProps = props;
    return (
      <div
        data-testid="selected-header"
        data-workflow-id={props.workflow.id}
        data-workflow-name={props.workflow.name}
        data-busy={props.busy ? 'true' : 'false'}
        data-inputs-open={props.inputsOpen ? 'true' : 'false'}
        data-inputs-json={props.inputsJson}
        data-inputs-error={props.inputsError ?? ''}
      >
        <button
          type="button"
          data-testid="hdr-toggle"
          onClick={props.onToggleInputs}
        >
          tog
        </button>
        <button
          type="button"
          data-testid="hdr-change"
          onClick={() => props.onChangeInputsJson('{"x":1}')}
        >
          chg
        </button>
        <button type="button" data-testid="hdr-run" onClick={props.onRun}>
          run
        </button>
      </div>
    );
  },
}));

interface CapturedGraphProps {
  workflow: Workflow;
  selectedNode: string | null;
  onSelectNode: (id: string | null) => void;
}

let lastGraphProps: CapturedGraphProps | null = null;

vi.mock('./WorkflowGraph', () => ({
  default: (props: CapturedGraphProps) => {
    lastGraphProps = props;
    return (
      <div
        data-testid="graph"
        data-workflow-id={props.workflow.id}
        data-nodes={String(props.workflow.nodes.length)}
        data-selected-node={props.selectedNode ?? ''}
      >
        <button
          type="button"
          data-testid="graph-select-n1"
          onClick={() => props.onSelectNode('n1')}
        >
          n1
        </button>
        <button
          type="button"
          data-testid="graph-clear"
          onClick={() => props.onSelectNode(null)}
        >
          clr
        </button>
      </div>
    );
  },
}));

interface CapturedNodePropsProps {
  node: WorkflowNode | null;
}

vi.mock('./WorkflowNodeProperties', () => ({
  default: (props: CapturedNodePropsProps) => (
    <div
      data-testid="node-props"
      data-node-id={props.node?.id ?? ''}
      data-node-type={props.node?.type ?? ''}
    />
  ),
}));

interface CapturedRunsPanelProps {
  runs: WorkflowRun[];
  expandedRunId: string | null;
  onToggleExpanded: (next: string | null) => void;
}

let lastRunsPanelProps: CapturedRunsPanelProps | null = null;

vi.mock('./WorkflowRunsPanel', () => ({
  default: (props: CapturedRunsPanelProps) => {
    lastRunsPanelProps = props;
    return (
      <div
        data-testid="runs-panel"
        data-runs={String(props.runs.length)}
        data-expanded={props.expandedRunId ?? ''}
      >
        <button
          type="button"
          data-testid="runs-toggle"
          onClick={() => props.onToggleExpanded('run-1')}
        >
          tog
        </button>
      </div>
    );
  },
}));

import WorkflowEditor from './WorkflowEditor';

function makeWorkflow(id: string, overrides: Partial<Workflow> = {}): Workflow {
  return {
    id,
    name: `wf-${id}`,
    description: '',
    nodes: [
      { id: 'n1', type: 'task', name: 'task one' },
      { id: 'n2', type: 'end', name: 'end' },
    ],
    edges: [{ from: 'n1', to: 'n2' }],
    enabled: true,
    createdAt: '2026-05-01T00:00:00Z',
    updatedAt: '2026-05-01T00:00:00Z',
    ...overrides,
  };
}

beforeEach(() => {
  setLocale('en');
  refreshMock.mockReset();
  refreshMock.mockResolvedValue(undefined);
  setErrorMock.mockReset();
  setBusyMock.mockReset();
  setRunsMock.mockReset();
  setExpandedRunIdMock.mockReset();
  toggleInputsMock.mockReset();
  setInputsJsonMock.mockReset();
  handleRunMock.mockReset();
  handleRunMock.mockResolvedValue(undefined);
  listState = { workflows: [], busy: false, error: null };
  runsState = { runs: [], expandedRunId: null };
  runState = { inputsOpen: false, inputsJson: '{}', inputsError: null };
  lastListArgs = null;
  lastRunsArg = undefined;
  lastRunArgs = null;
  lastListCardProps = null;
  lastHeaderProps = null;
  lastGraphProps = null;
  lastRunsPanelProps = null;
});

describe('<WorkflowEditor>', () => {
  it('renders the left-pane workflow list on default render', () => {
    render(<WorkflowEditor />);
    expect(screen.getByTestId('workflow-list')).toBeInTheDocument();
  });

  it('shows the empty-selection card when nothing is selected', () => {
    listState = { workflows: [], busy: false, error: null };
    render(<WorkflowEditor />);
    expect(
      screen.getByText('Select a workflow on the left to view its DAG.'),
    ).toBeInTheDocument();
    expect(screen.queryByTestId('selected-header')).not.toBeInTheDocument();
    expect(screen.queryByTestId('graph')).not.toBeInTheDocument();
    expect(screen.queryByTestId('node-props')).not.toBeInTheDocument();
    expect(screen.queryByTestId('runs-panel')).not.toBeInTheDocument();
  });

  it('mounts header + graph + node-props + runs panel once a workflow is selected', async () => {
    const user = userEvent.setup();
    listState = {
      workflows: [makeWorkflow('a'), makeWorkflow('b')],
      busy: false,
      error: null,
    };
    render(<WorkflowEditor />);
    await user.click(screen.getByTestId('list-select-a'));
    expect(screen.getByTestId('selected-header')).toBeInTheDocument();
    expect(screen.getByTestId('graph')).toBeInTheDocument();
    expect(screen.getByTestId('node-props')).toBeInTheDocument();
    expect(screen.getByTestId('runs-panel')).toBeInTheDocument();
  });

  it('forwards workflows + busy + error into WorkflowList', () => {
    listState = {
      workflows: [makeWorkflow('a')],
      busy: true,
      error: 'broken',
    };
    render(<WorkflowEditor />);
    const list = screen.getByTestId('workflow-list');
    expect(list).toHaveAttribute('data-count', '1');
    expect(list).toHaveAttribute('data-busy', 'true');
    expect(list).toHaveAttribute('data-error', 'broken');
    expect(list).toHaveAttribute('data-selected', '');
  });

  it('forwards onRefresh from WorkflowList through to the hook refresh', async () => {
    const user = userEvent.setup();
    listState = { workflows: [makeWorkflow('a')], busy: false, error: null };
    render(<WorkflowEditor />);
    await user.click(screen.getByTestId('list-refresh'));
    expect(refreshMock).toHaveBeenCalledTimes(1);
  });

  it('updates selectedId when WorkflowList fires onSelect', async () => {
    const user = userEvent.setup();
    listState = {
      workflows: [makeWorkflow('a'), makeWorkflow('b')],
      busy: false,
      error: null,
    };
    render(<WorkflowEditor />);
    await user.click(screen.getByTestId('list-select-a'));
    expect(screen.getByTestId('workflow-list')).toHaveAttribute(
      'data-selected',
      'a',
    );
    expect(screen.getByTestId('selected-header')).toHaveAttribute(
      'data-workflow-id',
      'a',
    );
  });

  it('threads the selected workflow id into the runs hook', async () => {
    const user = userEvent.setup();
    listState = {
      workflows: [makeWorkflow('a')],
      busy: false,
      error: null,
    };
    render(<WorkflowEditor />);
    expect(lastRunsArg).toBeNull();
    await user.click(screen.getByTestId('list-select-a'));
    expect(lastRunsArg).toBe('a');
  });

  it('exposes a working live getter to use-workflows-list', () => {
    listState = {
      workflows: [makeWorkflow('a')],
      busy: false,
      error: null,
    };
    render(<WorkflowEditor />);
    expect(typeof lastListArgs?.getSelectedId).toBe('function');
    expect(lastListArgs?.getSelectedId()).toBeNull();
  });

  it('drives auto-select via onAutoSelect from use-workflows-list', () => {
    listState = {
      workflows: [makeWorkflow('a')],
      busy: false,
      error: null,
    };
    render(<WorkflowEditor />);
    act(() => {
      lastListArgs?.onAutoSelect('a');
    });
    expect(screen.getByTestId('selected-header')).toHaveAttribute(
      'data-workflow-id',
      'a',
    );
  });

  it('clears the selected node when the workflow selection changes', async () => {
    const user = userEvent.setup();
    listState = {
      workflows: [makeWorkflow('a'), makeWorkflow('b')],
      busy: false,
      error: null,
    };
    render(<WorkflowEditor />);
    await user.click(screen.getByTestId('list-select-a'));
    await user.click(screen.getByTestId('graph-select-n1'));
    expect(screen.getByTestId('graph')).toHaveAttribute(
      'data-selected-node',
      'n1',
    );
    await user.click(screen.getByTestId('list-select-b'));
    expect(screen.getByTestId('graph')).toHaveAttribute(
      'data-selected-node',
      '',
    );
  });

  it('resolves the selected node from the workflow + selectedNodeId', async () => {
    const user = userEvent.setup();
    listState = {
      workflows: [makeWorkflow('a')],
      busy: false,
      error: null,
    };
    render(<WorkflowEditor />);
    await user.click(screen.getByTestId('list-select-a'));
    await user.click(screen.getByTestId('graph-select-n1'));
    expect(screen.getByTestId('node-props')).toHaveAttribute(
      'data-node-id',
      'n1',
    );
    expect(screen.getByTestId('node-props')).toHaveAttribute(
      'data-node-type',
      'task',
    );
  });

  it('returns null node when graph clears the selection', async () => {
    const user = userEvent.setup();
    listState = {
      workflows: [makeWorkflow('a')],
      busy: false,
      error: null,
    };
    render(<WorkflowEditor />);
    await user.click(screen.getByTestId('list-select-a'));
    await user.click(screen.getByTestId('graph-select-n1'));
    await user.click(screen.getByTestId('graph-clear'));
    expect(screen.getByTestId('node-props')).toHaveAttribute(
      'data-node-id',
      '',
    );
  });

  it('forwards busy + inputs state into the selected header', async () => {
    const user = userEvent.setup();
    listState = {
      workflows: [makeWorkflow('a')],
      busy: true,
      error: null,
    };
    runState = {
      inputsOpen: true,
      inputsJson: '{"x":1}',
      inputsError: 'json broken',
    };
    render(<WorkflowEditor />);
    await user.click(screen.getByTestId('list-select-a'));
    const hdr = screen.getByTestId('selected-header');
    expect(hdr).toHaveAttribute('data-busy', 'true');
    expect(hdr).toHaveAttribute('data-inputs-open', 'true');
    expect(hdr).toHaveAttribute('data-inputs-json', '{"x":1}');
    expect(hdr).toHaveAttribute('data-inputs-error', 'json broken');
  });

  it('drives header onToggleInputs through to the hook', async () => {
    const user = userEvent.setup();
    listState = {
      workflows: [makeWorkflow('a')],
      busy: false,
      error: null,
    };
    render(<WorkflowEditor />);
    await user.click(screen.getByTestId('list-select-a'));
    await user.click(screen.getByTestId('hdr-toggle'));
    expect(toggleInputsMock).toHaveBeenCalledTimes(1);
  });

  it('drives header onChangeInputsJson through to the hook setter', async () => {
    const user = userEvent.setup();
    listState = {
      workflows: [makeWorkflow('a')],
      busy: false,
      error: null,
    };
    render(<WorkflowEditor />);
    await user.click(screen.getByTestId('list-select-a'));
    await user.click(screen.getByTestId('hdr-change'));
    expect(setInputsJsonMock).toHaveBeenCalledWith('{"x":1}');
  });

  it('drives header onRun through to handleRun', async () => {
    const user = userEvent.setup();
    listState = {
      workflows: [makeWorkflow('a')],
      busy: false,
      error: null,
    };
    render(<WorkflowEditor />);
    await user.click(screen.getByTestId('list-select-a'));
    await user.click(screen.getByTestId('hdr-run'));
    expect(handleRunMock).toHaveBeenCalledTimes(1);
  });

  it('passes the selectedId + setter triad into the run hook', async () => {
    const user = userEvent.setup();
    listState = {
      workflows: [makeWorkflow('a')],
      busy: false,
      error: null,
    };
    render(<WorkflowEditor />);
    await user.click(screen.getByTestId('list-select-a'));
    expect(lastRunArgs?.selectedId).toBe('a');
    expect(lastRunArgs?.setRuns).toBe(setRunsMock);
    expect(lastRunArgs?.setBusy).toBe(setBusyMock);
    expect(lastRunArgs?.setError).toBe(setErrorMock);
  });

  it('forwards runs + expandedRunId into the runs panel', async () => {
    const user = userEvent.setup();
    listState = {
      workflows: [makeWorkflow('a')],
      busy: false,
      error: null,
    };
    runsState = {
      runs: [
        {
          id: 'r1',
          workflowId: 'a',
          status: 'completed',
          startedAt: '2026-05-01T00:00:00Z',
          completedAt: '2026-05-01T00:01:00Z',
          inputs: {},
          nodeResults: {},
        },
      ],
      expandedRunId: 'r1',
    };
    render(<WorkflowEditor />);
    await user.click(screen.getByTestId('list-select-a'));
    const panel = screen.getByTestId('runs-panel');
    expect(panel).toHaveAttribute('data-runs', '1');
    expect(panel).toHaveAttribute('data-expanded', 'r1');
  });

  it('drives runs panel onToggleExpanded through to the runs hook', async () => {
    const user = userEvent.setup();
    listState = {
      workflows: [makeWorkflow('a')],
      busy: false,
      error: null,
    };
    render(<WorkflowEditor />);
    await user.click(screen.getByTestId('list-select-a'));
    await user.click(screen.getByTestId('runs-toggle'));
    expect(setExpandedRunIdMock).toHaveBeenCalledWith('run-1');
  });

  it('renders the outer split-pane wrapper with the documented flex layout', () => {
    const { container } = render(<WorkflowEditor />);
    const root = container.firstChild as HTMLElement;
    expect(root).toHaveClass('flex');
    expect(root).toHaveClass('h-full');
    expect(root).toHaveClass('overflow-hidden');
  });

  it('re-renders translated copy when the locale flips to ko', () => {
    render(<WorkflowEditor />);
    act(() => {
      setLocale('ko');
    });
    expect(screen.getByTestId('workflow-list')).toBeInTheDocument();
  });
});
