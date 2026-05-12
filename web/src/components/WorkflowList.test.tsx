import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { setLocale } from '../lib/i18n';
import WorkflowList from './WorkflowList';
import type { Workflow } from './WorkflowEditor';

// WorkflowList is a pure-props component: header (icon +
// title + refresh button), optional error banner, and either
// an empty-state explainer or the workflow row list. The
// parent owns selection + the refresh callback.

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
});

describe('<WorkflowList>', () => {
  it('renders the localized title + refresh button on default render', () => {
    render(
      <WorkflowList
        workflows={[]}
        error={null}
        busy={false}
        selectedId={null}
        onSelect={() => {}}
        onRefresh={() => {}}
      />,
    );
    expect(screen.getByText('Workflows')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /refresh/i })).toBeInTheDocument();
  });

  it('shows the empty-state copy + the {cli} <code> token when no workflows', () => {
    render(
      <WorkflowList
        workflows={[]}
        error={null}
        busy={false}
        selectedId={null}
        onSelect={() => {}}
        onRefresh={() => {}}
      />,
    );
    expect(
      screen.getByText(/No workflows yet\./i),
    ).toBeInTheDocument();
    const code = screen.getByText('c4 workflow create --file');
    expect(code.tagName).toBe('CODE');
  });

  it('renders one button per workflow when the list is non-empty', () => {
    render(
      <WorkflowList
        workflows={[makeWorkflow('a'), makeWorkflow('b'), makeWorkflow('c')]}
        error={null}
        busy={false}
        selectedId={null}
        onSelect={() => {}}
        onRefresh={() => {}}
      />,
    );
    expect(screen.getAllByRole('button')).toHaveLength(1 + 3);
    expect(screen.getByText('wf-a')).toBeInTheDocument();
    expect(screen.getByText('wf-b')).toBeInTheDocument();
    expect(screen.getByText('wf-c')).toBeInTheDocument();
  });

  it('fires onSelect with the workflow id when a row is clicked', async () => {
    const onSelect = vi.fn();
    const user = userEvent.setup();
    render(
      <WorkflowList
        workflows={[makeWorkflow('a'), makeWorkflow('b')]}
        error={null}
        busy={false}
        selectedId={null}
        onSelect={onSelect}
        onRefresh={() => {}}
      />,
    );
    await user.click(screen.getByText('wf-b'));
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledWith('b');
  });

  it('marks the selected row with the primary-bg className', () => {
    render(
      <WorkflowList
        workflows={[makeWorkflow('a'), makeWorkflow('b')]}
        error={null}
        busy={false}
        selectedId="b"
        onSelect={() => {}}
        onRefresh={() => {}}
      />,
    );
    const selectedBtn = screen.getByText('wf-b').closest('button');
    expect(selectedBtn).toHaveClass('bg-primary');
    const otherBtn = screen.getByText('wf-a').closest('button');
    expect(otherBtn).not.toHaveClass('bg-primary');
    expect(otherBtn).toHaveClass('bg-muted/30');
  });

  it('renders the on badge for enabled workflows', () => {
    render(
      <WorkflowList
        workflows={[makeWorkflow('a', { enabled: true })]}
        error={null}
        busy={false}
        selectedId={null}
        onSelect={() => {}}
        onRefresh={() => {}}
      />,
    );
    expect(screen.getByText('on')).toBeInTheDocument();
  });

  it('renders the off badge for disabled workflows', () => {
    render(
      <WorkflowList
        workflows={[makeWorkflow('a', { enabled: false })]}
        error={null}
        busy={false}
        selectedId={null}
        onSelect={() => {}}
        onRefresh={() => {}}
      />,
    );
    expect(screen.getByText('off')).toBeInTheDocument();
  });

  it('renders the formatted nodes/edges count line', () => {
    render(
      <WorkflowList
        workflows={[makeWorkflow('a')]}
        error={null}
        busy={false}
        selectedId={null}
        onSelect={() => {}}
        onRefresh={() => {}}
      />,
    );
    expect(screen.getByText('2 nodes / 1 edges')).toBeInTheDocument();
  });

  it('shows the error banner with role=alert when error is set', () => {
    render(
      <WorkflowList
        workflows={[]}
        error="boom"
        busy={false}
        selectedId={null}
        onSelect={() => {}}
        onRefresh={() => {}}
      />,
    );
    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('boom');
  });

  it('omits the error banner when error is null', () => {
    render(
      <WorkflowList
        workflows={[]}
        error={null}
        busy={false}
        selectedId={null}
        onSelect={() => {}}
        onRefresh={() => {}}
      />,
    );
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('disables the refresh button when busy', () => {
    render(
      <WorkflowList
        workflows={[]}
        error={null}
        busy={true}
        selectedId={null}
        onSelect={() => {}}
        onRefresh={() => {}}
      />,
    );
    expect(screen.getByRole('button', { name: /refresh/i })).toBeDisabled();
  });

  it('enables the refresh button when not busy', () => {
    render(
      <WorkflowList
        workflows={[]}
        error={null}
        busy={false}
        selectedId={null}
        onSelect={() => {}}
        onRefresh={() => {}}
      />,
    );
    expect(screen.getByRole('button', { name: /refresh/i })).not.toBeDisabled();
  });

  it('fires onRefresh when the refresh button is clicked', async () => {
    const onRefresh = vi.fn();
    const user = userEvent.setup();
    render(
      <WorkflowList
        workflows={[]}
        error={null}
        busy={false}
        selectedId={null}
        onSelect={() => {}}
        onRefresh={onRefresh}
      />,
    );
    await user.click(screen.getByRole('button', { name: /refresh/i }));
    expect(onRefresh).toHaveBeenCalledTimes(1);
  });

  it('hides the empty-state copy when at least one workflow is provided', () => {
    render(
      <WorkflowList
        workflows={[makeWorkflow('a')]}
        error={null}
        busy={false}
        selectedId={null}
        onSelect={() => {}}
        onRefresh={() => {}}
      />,
    );
    expect(screen.queryByText(/No workflows yet\./i)).not.toBeInTheDocument();
  });

  it('renders the workflow icon as aria-hidden so the heading copy stays the accessible name', () => {
    const { container } = render(
      <WorkflowList
        workflows={[]}
        error={null}
        busy={false}
        selectedId={null}
        onSelect={() => {}}
        onRefresh={() => {}}
      />,
    );
    const hidden = container.querySelector('[aria-hidden="true"]');
    expect(hidden).not.toBeNull();
  });

  it('renders rows as <li> children of a <ul>', () => {
    const { container } = render(
      <WorkflowList
        workflows={[makeWorkflow('a'), makeWorkflow('b')]}
        error={null}
        busy={false}
        selectedId={null}
        onSelect={() => {}}
        onRefresh={() => {}}
      />,
    );
    const ul = container.querySelector('ul');
    expect(ul).not.toBeNull();
    expect(ul!.children).toHaveLength(2);
    expect(within(ul as HTMLElement).getAllByRole('button')).toHaveLength(2);
  });

  it('skips i18n on the workflow.name span (data-i18n-skip="user-data")', () => {
    render(
      <WorkflowList
        workflows={[makeWorkflow('a', { name: 'my-flow' })]}
        error={null}
        busy={false}
        selectedId={null}
        onSelect={() => {}}
        onRefresh={() => {}}
      />,
    );
    const span = screen.getByText('my-flow');
    expect(span).toHaveAttribute('data-i18n-skip', 'user-data');
  });

  it('re-renders translated copy when the locale flips to ko', () => {
    render(
      <WorkflowList
        workflows={[]}
        error={null}
        busy={false}
        selectedId={null}
        onSelect={() => {}}
        onRefresh={() => {}}
      />,
    );
    expect(screen.getByText('Workflows')).toBeInTheDocument();
    act(() => {
      setLocale('ko');
    });
    expect(screen.queryByText('Workflows')).not.toBeInTheDocument();
  });
});
