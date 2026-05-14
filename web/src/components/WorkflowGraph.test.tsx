import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { setLocale } from '../lib/i18n';
import WorkflowGraph, { TYPE_FILL } from './WorkflowGraph';
import type { Workflow, WorkflowNode, WorkflowEdge } from './WorkflowEditor';

// WorkflowGraph is a pure-props SVG renderer for a workflow DAG.
// It computes a layered layout from nodes + edges, draws node
// boxes and curved edge lines, exposes the selected node via a
// thicker stroke, and forwards id clicks to onSelectNode. The
// only side input is the locale (consumed for the aria-label).

function makeWorkflow(overrides: Partial<Workflow> = {}): Workflow {
  const nodes: WorkflowNode[] = overrides.nodes ?? [
    { id: 'n1', type: 'task', name: 'first task' },
    { id: 'n2', type: 'condition', name: 'branch' },
    { id: 'n3', type: 'end', name: 'end node' },
  ];
  const edges: WorkflowEdge[] = overrides.edges ?? [
    { from: 'n1', to: 'n2' },
    { from: 'n2', to: 'n3', condition: 'status === 200' },
  ];
  return {
    id: 'wf-a',
    name: 'pipeline',
    description: '',
    nodes,
    edges,
    enabled: true,
    createdAt: '2026-05-01T00:00:00Z',
    updatedAt: '2026-05-01T00:00:00Z',
    ...overrides,
    nodes,
    edges,
  };
}

beforeEach(() => {
  setLocale('en');
});

describe('<WorkflowGraph>', () => {
  it('renders an svg with role=img and the english aria-label', () => {
    render(
      <WorkflowGraph
        workflow={makeWorkflow({ name: 'my-flow' })}
        selectedNode={null}
        onSelectNode={() => {}}
      />,
    );
    const svg = screen.getByRole('img');
    expect(svg.tagName.toLowerCase()).toBe('svg');
    expect(svg).toHaveAttribute('aria-label', 'Graph of my-flow');
  });

  it('renders one text label per node containing the node name', () => {
    render(
      <WorkflowGraph
        workflow={makeWorkflow()}
        selectedNode={null}
        onSelectNode={() => {}}
      />,
    );
    expect(screen.getByText('first task')).toBeInTheDocument();
    expect(screen.getByText('branch')).toBeInTheDocument();
    expect(screen.getByText('end node')).toBeInTheDocument();
  });

  it('falls back to the node id when name is empty', () => {
    render(
      <WorkflowGraph
        workflow={makeWorkflow({
          nodes: [{ id: 'only', type: 'task', name: '' }],
          edges: [],
        })}
        selectedNode={null}
        onSelectNode={() => {}}
      />,
    );
    expect(screen.getByText('only')).toBeInTheDocument();
  });

  it('renders the node type label under the name', () => {
    render(
      <WorkflowGraph
        workflow={makeWorkflow()}
        selectedNode={null}
        onSelectNode={() => {}}
      />,
    );
    expect(screen.getByText('task')).toBeInTheDocument();
    expect(screen.getByText('condition')).toBeInTheDocument();
    expect(screen.getByText('end')).toBeInTheDocument();
  });

  it('fills each node rect with the TYPE_FILL palette colour', () => {
    const { container } = render(
      <WorkflowGraph
        workflow={makeWorkflow({
          nodes: [{ id: 'n1', type: 'audit', name: 'a' }],
          edges: [],
        })}
        selectedNode={null}
        onSelectNode={() => {}}
      />,
    );
    const rect = container.querySelector('rect');
    expect(rect).not.toBeNull();
    expect(rect).toHaveAttribute('fill', TYPE_FILL.audit);
  });

  it('paints the selected node with the highlight stroke + width', () => {
    const { container } = render(
      <WorkflowGraph
        workflow={makeWorkflow()}
        selectedNode="n2"
        onSelectNode={() => {}}
      />,
    );
    const rects = container.querySelectorAll('rect');
    expect(rects.length).toBe(3);
    const selectedRect = rects[1];
    expect(selectedRect).toHaveAttribute('stroke', '#f9d949');
    expect(selectedRect).toHaveAttribute('stroke-width', '3');
  });

  it('paints unselected nodes with the default stroke + width', () => {
    const { container } = render(
      <WorkflowGraph
        workflow={makeWorkflow()}
        selectedNode="n2"
        onSelectNode={() => {}}
      />,
    );
    const rects = container.querySelectorAll('rect');
    const other = rects[0];
    expect(other).toHaveAttribute('stroke', '#1f2937');
    expect(other).toHaveAttribute('stroke-width', '1.5');
  });

  it('fires onSelectNode with the clicked node id', async () => {
    const onSelectNode = vi.fn();
    const user = userEvent.setup();
    render(
      <WorkflowGraph
        workflow={makeWorkflow()}
        selectedNode={null}
        onSelectNode={onSelectNode}
      />,
    );
    await user.click(screen.getByText('branch'));
    expect(onSelectNode).toHaveBeenCalledTimes(1);
    expect(onSelectNode).toHaveBeenCalledWith('n2');
  });

  it('renders one <path> per edge plus the arrow marker shape', () => {
    const { container } = render(
      <WorkflowGraph
        workflow={makeWorkflow()}
        selectedNode={null}
        onSelectNode={() => {}}
      />,
    );
    const paths = container.querySelectorAll('path');
    // 2 edges + 1 arrow marker path
    expect(paths.length).toBe(3);
  });

  it('renders the edge condition label when set', () => {
    render(
      <WorkflowGraph
        workflow={makeWorkflow()}
        selectedNode={null}
        onSelectNode={() => {}}
      />,
    );
    expect(screen.getByText('status === 200')).toBeInTheDocument();
  });

  it('truncates long edge condition labels to 18 chars + ellipsis', () => {
    render(
      <WorkflowGraph
        workflow={makeWorkflow({
          nodes: [
            { id: 'a', type: 'task', name: 'a' },
            { id: 'b', type: 'task', name: 'b' },
          ],
          edges: [
            { from: 'a', to: 'b', condition: 'this is a very long condition expression' },
          ],
        })}
        selectedNode={null}
        onSelectNode={() => {}}
      />,
    );
    expect(screen.getByText('this is a very lon...')).toBeInTheDocument();
  });

  it('omits the condition label when the edge has no condition', () => {
    render(
      <WorkflowGraph
        workflow={makeWorkflow({
          nodes: [
            { id: 'a', type: 'task', name: 'a' },
            { id: 'b', type: 'task', name: 'b' },
          ],
          edges: [{ from: 'a', to: 'b' }],
        })}
        selectedNode={null}
        onSelectNode={() => {}}
      />,
    );
    expect(screen.queryByText(/===/)).not.toBeInTheDocument();
  });

  it('renders the arrow <marker> in <defs> so edges have an arrowhead', () => {
    const { container } = render(
      <WorkflowGraph
        workflow={makeWorkflow()}
        selectedNode={null}
        onSelectNode={() => {}}
      />,
    );
    const marker = container.querySelector('marker#wf-arrow');
    expect(marker).not.toBeNull();
  });

  it('handles a workflow with zero nodes and zero edges without crashing', () => {
    const { container } = render(
      <WorkflowGraph
        workflow={makeWorkflow({ nodes: [], edges: [] })}
        selectedNode={null}
        onSelectNode={() => {}}
      />,
    );
    expect(container.querySelectorAll('rect').length).toBe(0);
    expect(container.querySelectorAll('path').length).toBe(1); // arrow marker only
  });

  it('skips edges whose endpoints do not resolve to known nodes', () => {
    const { container } = render(
      <WorkflowGraph
        workflow={makeWorkflow({
          nodes: [{ id: 'only', type: 'task', name: 'only' }],
          edges: [
            { from: 'only', to: 'ghost' },
            { from: 'phantom', to: 'only' },
          ],
        })}
        selectedNode={null}
        onSelectNode={() => {}}
      />,
    );
    // Only the arrow marker path remains; edge <path>s are skipped.
    expect(container.querySelectorAll('path').length).toBe(1);
  });

  it('re-renders the aria-label in korean when the locale flips', () => {
    render(
      <WorkflowGraph
        workflow={makeWorkflow({ name: 'flow-x' })}
        selectedNode={null}
        onSelectNode={() => {}}
      />,
    );
    expect(screen.getByRole('img')).toHaveAttribute('aria-label', 'Graph of flow-x');
    act(() => {
      setLocale('ko');
    });
    expect(screen.getByRole('img')).toHaveAttribute('aria-label', 'flow-x 그래프');
  });
});
