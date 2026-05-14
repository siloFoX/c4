import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { setLocale } from '../lib/i18n';
import WorkflowRunsPanel from './WorkflowRunsPanel';
import type { WorkflowRun, WorkflowRunResult } from './WorkflowEditor';

// WorkflowRunsPanel renders a controlled "Recent runs" Panel:
// header (title + count), empty-state hint, and a scrollable
// list of the last 10 runs. Each row toggles an expansion that
// shows per-node statuses, errors, outputs, and an inputs
// <details> dump. Parent owns expandedRunId + toggle handler.

function makeResult(overrides: Partial<WorkflowRunResult> = {}): WorkflowRunResult {
  return {
    status: 'completed',
    output: null,
    error: null,
    startedAt: '2026-05-01T00:00:00Z',
    completedAt: '2026-05-01T00:00:05Z',
    ...overrides,
  };
}

function makeRun(overrides: Partial<WorkflowRun> = {}): WorkflowRun {
  return {
    id: 'run-1',
    workflowId: 'wf-a',
    status: 'completed',
    startedAt: '2026-05-01T00:00:00Z',
    completedAt: '2026-05-01T00:00:05Z',
    inputs: {},
    nodeResults: {},
    ...overrides,
  };
}

beforeEach(() => {
  setLocale('en');
});

describe('<WorkflowRunsPanel>', () => {
  it('renders the localized header and zero count when runs is empty', () => {
    render(
      <WorkflowRunsPanel
        runs={[]}
        expandedRunId={null}
        onToggleExpanded={() => {}}
      />,
    );
    expect(screen.getByText('Recent runs')).toBeInTheDocument();
    expect(screen.getByText('0')).toBeInTheDocument();
  });

  it('renders the empty-state hint when runs is empty', () => {
    render(
      <WorkflowRunsPanel
        runs={[]}
        expandedRunId={null}
        onToggleExpanded={() => {}}
      />,
    );
    expect(screen.getByText('No runs yet.')).toBeInTheDocument();
  });

  it('renders one row per run with the run id visible', () => {
    render(
      <WorkflowRunsPanel
        runs={[makeRun({ id: 'run-1' }), makeRun({ id: 'run-2' })]}
        expandedRunId={null}
        onToggleExpanded={() => {}}
      />,
    );
    expect(screen.getAllByRole('button')).toHaveLength(2);
    expect(screen.getByText(/run-1/)).toBeInTheDocument();
    expect(screen.getByText(/run-2/)).toBeInTheDocument();
  });

  it('shows total run count in the header', () => {
    render(
      <WorkflowRunsPanel
        runs={[makeRun({ id: 'a' }), makeRun({ id: 'b' }), makeRun({ id: 'c' })]}
        expandedRunId={null}
        onToggleExpanded={() => {}}
      />,
    );
    expect(screen.getByText('3')).toBeInTheDocument();
  });

  it('caps the visible rows at 10 and shows the most-recent in reverse order', () => {
    const runs = Array.from({ length: 12 }, (_, i) =>
      makeRun({ id: `run-${i + 1}` }),
    );
    render(
      <WorkflowRunsPanel
        runs={runs}
        expandedRunId={null}
        onToggleExpanded={() => {}}
      />,
    );
    expect(screen.getAllByRole('button')).toHaveLength(10);
    expect(screen.queryByText(/run-1$/)).not.toBeInTheDocument();
    expect(screen.getByText(/run-12/)).toBeInTheDocument();
  });

  it('renders the (running) suffix when completedAt is null', () => {
    render(
      <WorkflowRunsPanel
        runs={[makeRun({ status: 'running', completedAt: null })]}
        expandedRunId={null}
        onToggleExpanded={() => {}}
      />,
    );
    expect(screen.getByText(/\(running\)/)).toBeInTheDocument();
  });

  it('renders the node count line when nodeResults is non-empty', () => {
    render(
      <WorkflowRunsPanel
        runs={[
          makeRun({
            nodeResults: { a: makeResult(), b: makeResult() },
          }),
        ]}
        expandedRunId={null}
        onToggleExpanded={() => {}}
      />,
    );
    expect(screen.getByText(/2 node\(s\)/)).toBeInTheDocument();
  });

  it('fires onToggleExpanded with the run id when a collapsed row is clicked', async () => {
    const onToggle = vi.fn();
    const user = userEvent.setup();
    render(
      <WorkflowRunsPanel
        runs={[makeRun({ id: 'run-1' })]}
        expandedRunId={null}
        onToggleExpanded={onToggle}
      />,
    );
    await user.click(screen.getByRole('button'));
    expect(onToggle).toHaveBeenCalledTimes(1);
    expect(onToggle).toHaveBeenCalledWith('run-1');
  });

  it('fires onToggleExpanded with null when the open row is clicked again', async () => {
    const onToggle = vi.fn();
    const user = userEvent.setup();
    render(
      <WorkflowRunsPanel
        runs={[makeRun({ id: 'run-1' })]}
        expandedRunId="run-1"
        onToggleExpanded={onToggle}
      />,
    );
    await user.click(screen.getByRole('button'));
    expect(onToggle).toHaveBeenCalledWith(null);
  });

  it('sets aria-expanded=true on the open row and false otherwise', () => {
    render(
      <WorkflowRunsPanel
        runs={[makeRun({ id: 'a' }), makeRun({ id: 'b' })]}
        expandedRunId="a"
        onToggleExpanded={() => {}}
      />,
    );
    const buttons = screen.getAllByRole('button');
    // runs are rendered last-first so id 'b' comes first.
    const aBtn = buttons.find((b) => b.textContent?.includes('a'));
    const bBtn = buttons.find((b) => b.textContent?.includes('b'));
    expect(aBtn).toHaveAttribute('aria-expanded', 'true');
    expect(bBtn).toHaveAttribute('aria-expanded', 'false');
  });

  it('renders the no-per-node-results hint when expanded run has none', () => {
    render(
      <WorkflowRunsPanel
        runs={[makeRun({ id: 'run-1', nodeResults: {} })]}
        expandedRunId="run-1"
        onToggleExpanded={() => {}}
      />,
    );
    expect(screen.getByText('No per-node results.')).toBeInTheDocument();
  });

  it('renders the per-node id chip + status badge when expanded', () => {
    render(
      <WorkflowRunsPanel
        runs={[
          makeRun({
            id: 'run-1',
            nodeResults: {
              alpha: makeResult({ status: 'completed' }),
              beta: makeResult({ status: 'failed', error: 'boom' }),
            },
          }),
        ]}
        expandedRunId="run-1"
        onToggleExpanded={() => {}}
      />,
    );
    expect(screen.getByText('alpha')).toBeInTheDocument();
    expect(screen.getByText('beta')).toBeInTheDocument();
    expect(screen.getByText('boom')).toBeInTheDocument();
  });

  it('renders string outputs verbatim inside a <pre>', () => {
    render(
      <WorkflowRunsPanel
        runs={[
          makeRun({
            id: 'run-1',
            nodeResults: { x: makeResult({ output: 'plain text output' }) },
          }),
        ]}
        expandedRunId="run-1"
        onToggleExpanded={() => {}}
      />,
    );
    expect(screen.getByText('plain text output')).toBeInTheDocument();
  });

  it('renders object outputs as pretty-printed JSON', () => {
    render(
      <WorkflowRunsPanel
        runs={[
          makeRun({
            id: 'run-1',
            nodeResults: { x: makeResult({ output: { ok: true } }) },
          }),
        ]}
        expandedRunId="run-1"
        onToggleExpanded={() => {}}
      />,
    );
    const pre = screen.getByText((c) => c.includes('"ok": true'));
    expect(pre.tagName).toBe('PRE');
  });

  it('renders an inputs <details> section when inputs is a non-empty object', () => {
    const { container } = render(
      <WorkflowRunsPanel
        runs={[
          makeRun({
            id: 'run-1',
            inputs: { foo: 'bar' },
            nodeResults: { x: makeResult() },
          }),
        ]}
        expandedRunId="run-1"
        onToggleExpanded={() => {}}
      />,
    );
    const details = container.querySelector('details');
    expect(details).not.toBeNull();
    expect(within(details as HTMLElement).getByText('inputs')).toBeInTheDocument();
  });

  it('omits the inputs <details> when inputs is empty', () => {
    const { container } = render(
      <WorkflowRunsPanel
        runs={[makeRun({ id: 'run-1', inputs: {}, nodeResults: { x: makeResult() } })]}
        expandedRunId="run-1"
        onToggleExpanded={() => {}}
      />,
    );
    expect(container.querySelector('details')).toBeNull();
  });

  it('flips the empty-state copy to korean when locale changes', () => {
    render(
      <WorkflowRunsPanel
        runs={[]}
        expandedRunId={null}
        onToggleExpanded={() => {}}
      />,
    );
    expect(screen.getByText('No runs yet.')).toBeInTheDocument();
    act(() => {
      setLocale('ko');
    });
    expect(screen.getByText('실행 기록이 없습니다.')).toBeInTheDocument();
  });
});
