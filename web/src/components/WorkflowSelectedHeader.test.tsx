import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { setLocale } from '../lib/i18n';
import WorkflowSelectedHeader from './WorkflowSelectedHeader';
import type { Workflow } from './WorkflowEditor';

// WorkflowSelectedHeader is the selected-workflow header Card:
// title + description on the left, an Inputs toggle + Run
// button on the right, and a conditionally-rendered JSON
// textarea + error span when inputsOpen is true. Pure
// controlled inputs.

function makeWorkflow(overrides: Partial<Workflow> = {}): Workflow {
  return {
    id: 'wf-a',
    name: 'pipeline',
    description: 'pipes things',
    nodes: [],
    edges: [],
    enabled: true,
    createdAt: '2026-05-01T00:00:00Z',
    updatedAt: '2026-05-01T00:00:00Z',
    ...overrides,
  };
}

beforeEach(() => {
  setLocale('en');
});

describe('<WorkflowSelectedHeader>', () => {
  it('renders the workflow name as the card title', () => {
    render(
      <WorkflowSelectedHeader
        workflow={makeWorkflow({ name: 'my-flow' })}
        busy={false}
        inputsOpen={false}
        inputsJson=""
        inputsError={null}
        onToggleInputs={() => {}}
        onChangeInputsJson={() => {}}
        onRun={() => {}}
      />,
    );
    expect(screen.getByText('my-flow')).toBeInTheDocument();
  });

  it('renders the workflow description when provided', () => {
    render(
      <WorkflowSelectedHeader
        workflow={makeWorkflow({ description: 'fancy flow' })}
        busy={false}
        inputsOpen={false}
        inputsJson=""
        inputsError={null}
        onToggleInputs={() => {}}
        onChangeInputsJson={() => {}}
        onRun={() => {}}
      />,
    );
    expect(screen.getByText('fancy flow')).toBeInTheDocument();
  });

  it('falls back to the no-description copy when description is empty', () => {
    render(
      <WorkflowSelectedHeader
        workflow={makeWorkflow({ description: '' })}
        busy={false}
        inputsOpen={false}
        inputsJson=""
        inputsError={null}
        onToggleInputs={() => {}}
        onChangeInputsJson={() => {}}
        onRun={() => {}}
      />,
    );
    expect(screen.getByText('No description.')).toBeInTheDocument();
  });

  it('renders the show-inputs button label when inputs are closed', () => {
    render(
      <WorkflowSelectedHeader
        workflow={makeWorkflow()}
        busy={false}
        inputsOpen={false}
        inputsJson=""
        inputsError={null}
        onToggleInputs={() => {}}
        onChangeInputsJson={() => {}}
        onRun={() => {}}
      />,
    );
    expect(
      screen.getByRole('button', { name: /with inputs/i }),
    ).toBeInTheDocument();
  });

  it('renders the hide-inputs button label when inputs are open', () => {
    render(
      <WorkflowSelectedHeader
        workflow={makeWorkflow()}
        busy={false}
        inputsOpen={true}
        inputsJson=""
        inputsError={null}
        onToggleInputs={() => {}}
        onChangeInputsJson={() => {}}
        onRun={() => {}}
      />,
    );
    expect(
      screen.getByRole('button', { name: /hide inputs/i }),
    ).toBeInTheDocument();
  });

  it('hides the textarea when inputsOpen is false', () => {
    render(
      <WorkflowSelectedHeader
        workflow={makeWorkflow()}
        busy={false}
        inputsOpen={false}
        inputsJson=""
        inputsError={null}
        onToggleInputs={() => {}}
        onChangeInputsJson={() => {}}
        onRun={() => {}}
      />,
    );
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  });

  it('renders the textarea seeded with inputsJson when inputsOpen is true', () => {
    render(
      <WorkflowSelectedHeader
        workflow={makeWorkflow()}
        busy={false}
        inputsOpen={true}
        inputsJson='{"foo":1}'
        inputsError={null}
        onToggleInputs={() => {}}
        onChangeInputsJson={() => {}}
        onRun={() => {}}
      />,
    );
    expect(screen.getByRole('textbox')).toHaveValue('{"foo":1}');
  });

  it('renders the english textarea aria-label', () => {
    render(
      <WorkflowSelectedHeader
        workflow={makeWorkflow()}
        busy={false}
        inputsOpen={true}
        inputsJson=""
        inputsError={null}
        onToggleInputs={() => {}}
        onChangeInputsJson={() => {}}
        onRun={() => {}}
      />,
    );
    expect(
      screen.getByLabelText('Workflow run inputs (JSON)'),
    ).toBeInTheDocument();
  });

  it('fires onChangeInputsJson with the new textarea value', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(
      <WorkflowSelectedHeader
        workflow={makeWorkflow()}
        busy={false}
        inputsOpen={true}
        inputsJson=""
        inputsError={null}
        onToggleInputs={() => {}}
        onChangeInputsJson={onChange}
        onRun={() => {}}
      />,
    );
    await user.type(screen.getByRole('textbox'), 'x');
    expect(onChange).toHaveBeenCalled();
    expect(onChange).toHaveBeenLastCalledWith('x');
  });

  it('renders the inputs error span when inputsError is set', () => {
    render(
      <WorkflowSelectedHeader
        workflow={makeWorkflow()}
        busy={false}
        inputsOpen={true}
        inputsJson=""
        inputsError="bad json"
        onToggleInputs={() => {}}
        onChangeInputsJson={() => {}}
        onRun={() => {}}
      />,
    );
    expect(screen.getByText('bad json')).toBeInTheDocument();
  });

  it('omits the inputs error span when inputsError is null', () => {
    render(
      <WorkflowSelectedHeader
        workflow={makeWorkflow()}
        busy={false}
        inputsOpen={true}
        inputsJson=""
        inputsError={null}
        onToggleInputs={() => {}}
        onChangeInputsJson={() => {}}
        onRun={() => {}}
      />,
    );
    // No span with destructive class on the only text content.
    const errs = screen
      .queryAllByText((c) => c === '')
      .filter((el) => el.tagName === 'SPAN');
    expect(errs.length).toBe(0);
  });

  it('fires onToggleInputs when the toggle button is clicked', async () => {
    const onToggle = vi.fn();
    const user = userEvent.setup();
    render(
      <WorkflowSelectedHeader
        workflow={makeWorkflow()}
        busy={false}
        inputsOpen={false}
        inputsJson=""
        inputsError={null}
        onToggleInputs={onToggle}
        onChangeInputsJson={() => {}}
        onRun={() => {}}
      />,
    );
    await user.click(screen.getByRole('button', { name: /with inputs/i }));
    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  it('fires onRun when the Run button is clicked', async () => {
    const onRun = vi.fn();
    const user = userEvent.setup();
    render(
      <WorkflowSelectedHeader
        workflow={makeWorkflow()}
        busy={false}
        inputsOpen={false}
        inputsJson=""
        inputsError={null}
        onToggleInputs={() => {}}
        onChangeInputsJson={() => {}}
        onRun={onRun}
      />,
    );
    await user.click(screen.getByRole('button', { name: /^run$/i }));
    expect(onRun).toHaveBeenCalledTimes(1);
  });

  it('disables both buttons + the textarea when busy is true', () => {
    render(
      <WorkflowSelectedHeader
        workflow={makeWorkflow()}
        busy={true}
        inputsOpen={true}
        inputsJson=""
        inputsError={null}
        onToggleInputs={() => {}}
        onChangeInputsJson={() => {}}
        onRun={() => {}}
      />,
    );
    expect(screen.getByRole('button', { name: /hide inputs/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /^run$/i })).toBeDisabled();
    expect(screen.getByRole('textbox')).toBeDisabled();
  });

  it('disables the Run button when the workflow is disabled', () => {
    render(
      <WorkflowSelectedHeader
        workflow={makeWorkflow({ enabled: false })}
        busy={false}
        inputsOpen={false}
        inputsJson=""
        inputsError={null}
        onToggleInputs={() => {}}
        onChangeInputsJson={() => {}}
        onRun={() => {}}
      />,
    );
    expect(screen.getByRole('button', { name: /^run$/i })).toBeDisabled();
  });

  it('sets aria-expanded on the toggle button to match inputsOpen', () => {
    const { rerender } = render(
      <WorkflowSelectedHeader
        workflow={makeWorkflow()}
        busy={false}
        inputsOpen={false}
        inputsJson=""
        inputsError={null}
        onToggleInputs={() => {}}
        onChangeInputsJson={() => {}}
        onRun={() => {}}
      />,
    );
    expect(
      screen.getByRole('button', { name: /with inputs/i }),
    ).toHaveAttribute('aria-expanded', 'false');
    rerender(
      <WorkflowSelectedHeader
        workflow={makeWorkflow()}
        busy={false}
        inputsOpen={true}
        inputsJson=""
        inputsError={null}
        onToggleInputs={() => {}}
        onChangeInputsJson={() => {}}
        onRun={() => {}}
      />,
    );
    expect(
      screen.getByRole('button', { name: /hide inputs/i }),
    ).toHaveAttribute('aria-expanded', 'true');
  });

  it('flips the Run button label and the toggle to korean when locale changes', () => {
    render(
      <WorkflowSelectedHeader
        workflow={makeWorkflow()}
        busy={false}
        inputsOpen={false}
        inputsJson=""
        inputsError={null}
        onToggleInputs={() => {}}
        onChangeInputsJson={() => {}}
        onRun={() => {}}
      />,
    );
    expect(screen.getByRole('button', { name: /^run$/i })).toBeInTheDocument();
    act(() => {
      setLocale('ko');
    });
    expect(screen.getByRole('button', { name: /실행/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /입력 사용/ })).toBeInTheDocument();
  });
});
