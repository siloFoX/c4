import { describe, it, expect, beforeEach } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import { setLocale } from '../lib/i18n';
import WorkflowNodeProperties from './WorkflowNodeProperties';
import { TYPE_FILL } from './WorkflowGraph';
import type { WorkflowNode } from './WorkflowEditor';

// WorkflowNodeProperties is a pure-props inspector card. It
// renders a localized empty-state hint when the selected node
// is null and otherwise paints a header (name + type pill), an
// id prefix line, and a <pre> dump of the config payload.

function makeNode(overrides: Partial<WorkflowNode> = {}): WorkflowNode {
  return {
    id: 'n1',
    type: 'task',
    name: 'task one',
    config: { foo: 'bar', count: 3 },
    ...overrides,
  };
}

beforeEach(() => {
  setLocale('en');
});

describe('<WorkflowNodeProperties>', () => {
  it('renders the empty-state hint copy when node is null', () => {
    render(<WorkflowNodeProperties node={null} />);
    expect(
      screen.getByText('Select a node to inspect its config.'),
    ).toBeInTheDocument();
  });

  it('omits the type pill + config dump when node is null', () => {
    render(<WorkflowNodeProperties node={null} />);
    expect(screen.queryByText(/^id:/i)).not.toBeInTheDocument();
    expect(screen.queryByText('config')).not.toBeInTheDocument();
  });

  it('renders the node name as the heading when provided', () => {
    render(<WorkflowNodeProperties node={makeNode({ name: 'fancy task' })} />);
    const heading = screen.getByRole('heading', { level: 4 });
    expect(heading).toHaveTextContent('fancy task');
  });

  it('falls back to the node id as the heading when name is empty', () => {
    render(
      <WorkflowNodeProperties node={makeNode({ name: '', id: 'lone-id' })} />,
    );
    const heading = screen.getByRole('heading', { level: 4 });
    expect(heading).toHaveTextContent('lone-id');
  });

  it('renders the node type as a coloured pill matching TYPE_FILL', () => {
    render(<WorkflowNodeProperties node={makeNode({ type: 'condition' })} />);
    const pill = screen.getByText('condition');
    expect(pill).toHaveStyle({ background: TYPE_FILL.condition });
  });

  it('paints the pill with the fallback colour for an unknown type', () => {
    // Cast through unknown so the test can exercise the runtime
    // fallback branch for `TYPE_FILL[node.type] || '#444'`.
    const bogus = makeNode({ type: 'mystery' as unknown as WorkflowNode['type'] });
    render(<WorkflowNodeProperties node={bogus} />);
    const pill = screen.getByText('mystery');
    expect(pill).toHaveStyle({ background: '#444' });
  });

  it('renders the english id prefix line', () => {
    render(<WorkflowNodeProperties node={makeNode({ id: 'abc-123' })} />);
    expect(screen.getByText('id: abc-123')).toBeInTheDocument();
  });

  it('renders the config object as pretty-printed JSON', () => {
    render(<WorkflowNodeProperties node={makeNode({ config: { hello: 'world' } })} />);
    const pre = screen.getByText((_, el) => el?.tagName === 'PRE');
    expect(pre.textContent).toContain('"hello": "world"');
  });

  it('renders an empty object when config is undefined', () => {
    render(<WorkflowNodeProperties node={makeNode({ config: undefined })} />);
    const pre = screen.getByText((_, el) => el?.tagName === 'PRE');
    expect(pre.textContent?.trim()).toBe('{}');
  });

  it('renders an empty object when config is an empty record', () => {
    render(<WorkflowNodeProperties node={makeNode({ config: {} })} />);
    const pre = screen.getByText((_, el) => el?.tagName === 'PRE');
    expect(pre.textContent?.trim()).toBe('{}');
  });

  it('renders the lowercase config section label', () => {
    render(<WorkflowNodeProperties node={makeNode()} />);
    expect(screen.getByText('config')).toBeInTheDocument();
  });

  it('marks the config <pre> with tabIndex=0 so it is keyboard-scrollable', () => {
    render(<WorkflowNodeProperties node={makeNode()} />);
    const pre = screen.getByText((_, el) => el?.tagName === 'PRE');
    expect(pre).toHaveAttribute('tabindex', '0');
  });

  it('renders every supported node type without crashing', () => {
    const types: WorkflowNode['type'][] = [
      'task', 'condition', 'parallel', 'wait', 'audit', 'notify', 'meeting', 'end',
    ];
    for (const type of types) {
      const { unmount } = render(
        <WorkflowNodeProperties node={makeNode({ type, name: `n-${type}` })} />,
      );
      expect(screen.getByText(type)).toBeInTheDocument();
      unmount();
    }
  });

  it('flips the empty-state hint to korean when locale changes', () => {
    render(<WorkflowNodeProperties node={null} />);
    expect(
      screen.getByText('Select a node to inspect its config.'),
    ).toBeInTheDocument();
    act(() => {
      setLocale('ko');
    });
    expect(
      screen.getByText('노드를 선택하여 설정을 확인하세요.'),
    ).toBeInTheDocument();
  });

  it('flips the id prefix to korean when locale changes', () => {
    render(<WorkflowNodeProperties node={makeNode({ id: 'xyz' })} />);
    expect(screen.getByText('id: xyz')).toBeInTheDocument();
    act(() => {
      setLocale('ko');
    });
    expect(screen.getByText('ID: xyz')).toBeInTheDocument();
  });
});
