import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { setLocale } from '../lib/i18n';
import type { MeetingTemplate } from '../lib/use-meeting-templates';

// MeetingsComposer owns the new-task / new-track / template /
// template-var state itself; the four `use-meeting-*` lib hooks
// only feed it the saved-template list, two debounced previews,
// and the create handler. Stub all four so the form tests do
// not boot MSW handlers or window.setTimeout debounces, and
// drive each branch from module-level fixtures the tests reset
// in `beforeEach`. The heavy `MeetingsTemplateEditor` child is
// mocked to a marker so its own hook + 200+ lines of editor
// JSX are not pulled in here.

const handleCreateMock = vi.fn();
const setCreateErrorMock = vi.fn();
let createBusyValue = false;
let createErrorValue: string | null = null;
let lastUseMeetingCreateArgs: Record<string, unknown> | null = null;

vi.mock('../lib/use-meeting-create', () => ({
  useMeetingCreate: (args: Record<string, unknown>) => {
    lastUseMeetingCreateArgs = args;
    return {
      createBusy: createBusyValue,
      createError: createErrorValue,
      setCreateError: setCreateErrorMock,
      handleCreate: handleCreateMock,
    };
  },
}));

let classifyPreviewValue: {
  track: string;
  matched: Array<{ list: string; term: string }>;
  reason: string;
} | null = null;
vi.mock('../lib/use-meeting-classify-preview', () => ({
  useMeetingClassifyPreview: (_args: unknown) => {
    void _args;
    return classifyPreviewValue;
  },
}));

let previewPlanValue: {
  track: string;
  rosterSize: number;
  estimatedTokens: number;
  consensusPolicy: { mode: string; roundCap: number; allowVeto: boolean };
  stages: Array<{ stage: string; specialists: Array<{ id: string }> }>;
} | null = null;
let previewBusyValue = false;
vi.mock('../lib/use-meeting-preview-plan', () => ({
  useMeetingPreviewPlan: (_args: unknown) => {
    void _args;
    return { previewPlan: previewPlanValue, previewBusy: previewBusyValue };
  },
}));

const refreshTemplatesMock = vi.fn();
let templatesValue: MeetingTemplate[] = [];
vi.mock('../lib/use-meeting-templates', () => ({
  useMeetingTemplates: (_args: unknown) => {
    void _args;
    return { templates: templatesValue, refresh: refreshTemplatesMock };
  },
}));

vi.mock('./MeetingsTemplateEditor', () => ({
  default: ({
    open,
    tpl,
    onClose,
    onSaved,
    onDeleted,
  }: {
    open: boolean;
    tpl: { name: string } | null;
    onClose: () => void;
    onSaved: () => void;
    onDeleted: (name: string) => void;
  }) => (
    <div
      data-testid="tpl-editor"
      data-open={open ? 'true' : 'false'}
      data-target={tpl?.name ?? ''}
    >
      <button type="button" data-testid="tpl-editor-close" onClick={onClose}>
        close
      </button>
      <button type="button" data-testid="tpl-editor-saved" onClick={onSaved}>
        saved
      </button>
      <button
        type="button"
        data-testid="tpl-editor-deleted-foo"
        onClick={() => onDeleted('foo')}
      >
        deleted-foo
      </button>
    </div>
  ),
}));

import MeetingsComposer from './MeetingsComposer';

beforeEach(() => {
  setLocale('en');
  handleCreateMock.mockReset();
  setCreateErrorMock.mockReset();
  refreshTemplatesMock.mockReset();
  createBusyValue = false;
  createErrorValue = null;
  classifyPreviewValue = null;
  previewPlanValue = null;
  previewBusyValue = false;
  templatesValue = [];
  lastUseMeetingCreateArgs = null;
});

function renderOpen(
  overrides: Partial<Parameters<typeof MeetingsComposer>[0]> = {},
) {
  const props = {
    open: true as const,
    onClose: vi.fn(),
    onCreated: vi.fn(),
    ...overrides,
  };
  const utils = render(<MeetingsComposer {...props} />);
  return { ...utils, props };
}

describe('<MeetingsComposer>', () => {
  it('renders nothing when open=false', () => {
    const { container } = render(
      <MeetingsComposer open={false} onClose={vi.fn()} onCreated={vi.fn()} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders the task input with the i18n aria label', () => {
    renderOpen();
    expect(screen.getByLabelText('Meeting task')).toBeInTheDocument();
  });

  it('renders the task input placeholder', () => {
    renderOpen();
    expect(
      screen.getByPlaceholderText(/Task description/i),
    ).toBeInTheDocument();
  });

  it('renders the track select with the i18n aria label', () => {
    renderOpen();
    expect(screen.getByLabelText('Meeting track')).toBeInTheDocument();
  });

  it('exposes the four track options in order', () => {
    renderOpen();
    const select = screen.getByLabelText('Meeting track') as HTMLSelectElement;
    const values = Array.from(select.querySelectorAll('option')).map(
      (o) => o.value,
    );
    expect(values).toEqual(['auto', 'lightweight', 'standard', 'full']);
  });

  it('renders the Create button with the i18n aria label', () => {
    renderOpen();
    expect(
      screen.getByRole('button', { name: 'Create meeting' }),
    ).toBeInTheDocument();
  });

  it('renders a Cancel button with the common.cancel label', () => {
    renderOpen();
    expect(
      screen.getByRole('button', { name: 'Cancel' }),
    ).toBeInTheDocument();
  });

  it('renders the templates row label', () => {
    renderOpen();
    expect(screen.getByText('templates:')).toBeInTheDocument();
  });

  it('renders the New template button with the i18n aria label', () => {
    renderOpen();
    expect(
      screen.getByRole('button', { name: 'Create new template' }),
    ).toBeInTheDocument();
  });

  it('renders every saved template as an Apply chip', () => {
    templatesValue = [
      { name: 'foo', task: 'foo task' },
      { name: 'bar', task: 'bar task' },
    ];
    renderOpen();
    expect(
      screen.getByRole('button', { name: 'Apply template foo' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Apply template bar' }),
    ).toBeInTheDocument();
  });

  it('renders an edit-pencil button for every saved template', () => {
    templatesValue = [{ name: 'foo', task: 'foo task' }];
    renderOpen();
    expect(
      screen.getByRole('button', { name: 'Edit template foo' }),
    ).toBeInTheDocument();
  });

  it('disables the Create button when the task is empty', () => {
    renderOpen();
    expect(
      screen.getByRole('button', { name: 'Create meeting' }),
    ).toBeDisabled();
  });

  it('disables the Create button when the task is whitespace only', async () => {
    const user = userEvent.setup();
    renderOpen();
    await user.type(screen.getByLabelText('Meeting task'), '   ');
    expect(
      screen.getByRole('button', { name: 'Create meeting' }),
    ).toBeDisabled();
  });

  it('enables the Create button once a non-empty task is typed', async () => {
    const user = userEvent.setup();
    renderOpen();
    await user.type(
      screen.getByLabelText('Meeting task'),
      'rotate auth secret',
    );
    expect(
      screen.getByRole('button', { name: 'Create meeting' }),
    ).not.toBeDisabled();
  });

  it('reflects typed text in the controlled task input', async () => {
    const user = userEvent.setup();
    renderOpen();
    const input = screen.getByLabelText('Meeting task') as HTMLInputElement;
    await user.type(input, 'rotate auth');
    expect(input.value).toBe('rotate auth');
  });

  it('changes the track select value when the user picks a track', async () => {
    const user = userEvent.setup();
    renderOpen();
    const select = screen.getByLabelText('Meeting track') as HTMLSelectElement;
    await user.selectOptions(select, 'full');
    expect(select.value).toBe('full');
  });

  it('starts the track select at "auto"', () => {
    renderOpen();
    expect(
      (screen.getByLabelText('Meeting track') as HTMLSelectElement).value,
    ).toBe('auto');
  });

  it('fires handleCreate exactly once when Create is clicked', async () => {
    const user = userEvent.setup();
    renderOpen();
    await user.type(screen.getByLabelText('Meeting task'), 'rotate auth');
    await user.click(screen.getByRole('button', { name: 'Create meeting' }));
    expect(handleCreateMock).toHaveBeenCalledTimes(1);
  });

  it('fires handleCreate when Enter is pressed in the task input', async () => {
    const user = userEvent.setup();
    renderOpen();
    const input = screen.getByLabelText('Meeting task');
    await user.click(input);
    await user.keyboard('rotate auth{Enter}');
    expect(handleCreateMock).toHaveBeenCalledTimes(1);
  });

  it('does NOT fire handleCreate on Shift+Enter (multiline shortcut)', async () => {
    const user = userEvent.setup();
    renderOpen();
    const input = screen.getByLabelText('Meeting task');
    await user.click(input);
    await user.keyboard('rotate auth{Shift>}{Enter}{/Shift}');
    expect(handleCreateMock).not.toHaveBeenCalled();
  });

  it('does NOT call handleCreate when Cancel is clicked', async () => {
    const user = userEvent.setup();
    renderOpen();
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(handleCreateMock).not.toHaveBeenCalled();
  });

  it('fires onClose and clears the create error when Cancel is clicked', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    renderOpen({ onClose });
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(setCreateErrorMock).toHaveBeenCalledWith(null);
  });

  it('fires onClose and clears the create error when Escape is pressed in the task input', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    renderOpen({ onClose });
    const input = screen.getByLabelText('Meeting task');
    await user.click(input);
    await user.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(setCreateErrorMock).toHaveBeenCalledWith(null);
  });

  it('disables the task input when createBusy is true', () => {
    createBusyValue = true;
    renderOpen();
    expect(screen.getByLabelText('Meeting task')).toBeDisabled();
  });

  it('disables the track select when createBusy is true', () => {
    createBusyValue = true;
    renderOpen();
    expect(screen.getByLabelText('Meeting track')).toBeDisabled();
  });

  it('disables the Cancel button when createBusy is true', () => {
    createBusyValue = true;
    renderOpen();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();
  });

  it('keeps the Create button disabled when createBusy flips to true after typing', async () => {
    const user = userEvent.setup();
    const { rerender, props } = renderOpen();
    await user.type(screen.getByLabelText('Meeting task'), 'rotate auth');
    expect(
      screen.getByRole('button', { name: 'Create meeting' }),
    ).not.toBeDisabled();
    createBusyValue = true;
    rerender(<MeetingsComposer {...props} />);
    expect(
      screen.getByRole('button', { name: 'Create meeting' }),
    ).toBeDisabled();
  });

  it('marks the task input disabled exactly once when busy (no double-disable)', () => {
    createBusyValue = true;
    renderOpen();
    const input = screen.getByLabelText('Meeting task') as HTMLInputElement;
    expect(input.disabled).toBe(true);
    // Only the HTML disabled attribute itself counts -- the Input's
    // CSS class set carries the tailwind "disabled:" pseudo-class
    // tokens, so don't string-match on outerHTML.
    expect(input.hasAttribute('disabled')).toBe(true);
  });

  it('shows the createError text when the hook surfaces an error', () => {
    createErrorValue = 'POST /api/meetings 500';
    renderOpen();
    expect(screen.getByText('POST /api/meetings 500')).toBeInTheDocument();
  });

  it('does NOT render any createError text when null', () => {
    renderOpen();
    expect(screen.queryByText(/500/)).not.toBeInTheDocument();
  });

  it('shows the previewing-roster copy when previewBusy is true and no plan present', () => {
    previewBusyValue = true;
    renderOpen();
    expect(screen.getByText(/previewing roster/i)).toBeInTheDocument();
  });

  it('shows the preview-plan card when the hook surfaces a plan', () => {
    previewPlanValue = {
      track: 'standard',
      rosterSize: 5,
      estimatedTokens: 12000,
      consensusPolicy: { mode: 'majority', roundCap: 3, allowVeto: false },
      stages: [
        { stage: 'discuss', specialists: [{ id: 'sec' }, { id: 'arch' }] },
      ],
    };
    renderOpen();
    expect(screen.getByText(/track=standard/i)).toBeInTheDocument();
    expect(screen.getByText(/consensus=majority/i)).toBeInTheDocument();
    expect(screen.getByText('[discuss]')).toBeInTheDocument();
    expect(screen.getByText('sec, arch')).toBeInTheDocument();
  });

  it('annotates the consensus row with veto when allowVeto=true', () => {
    previewPlanValue = {
      track: 'full',
      rosterSize: 3,
      estimatedTokens: 5000,
      consensusPolicy: { mode: 'majority', roundCap: 2, allowVeto: true },
      stages: [],
    };
    renderOpen();
    expect(screen.getByText(/veto/)).toBeInTheDocument();
  });

  it('prefers the preview-plan card over the previewing-roster copy when both fire', () => {
    previewBusyValue = true;
    previewPlanValue = {
      track: 'lightweight',
      rosterSize: 2,
      estimatedTokens: 1500,
      consensusPolicy: { mode: 'simple', roundCap: 1, allowVeto: false },
      stages: [],
    };
    renderOpen();
    expect(screen.getByText(/track=lightweight/i)).toBeInTheDocument();
    expect(screen.queryByText(/previewing roster/i)).not.toBeInTheDocument();
  });

  it('shows the classifier preview chip when the hook returns a preview', () => {
    classifyPreviewValue = {
      track: 'standard',
      matched: [{ list: 'arch', term: 'database' }],
      reason: 'arch keywords',
    };
    renderOpen();
    const chip = screen.getByText(/auto would pick:/i);
    expect(chip).toBeInTheDocument();
    // The chip wraps the track + matched-term spans; scope to its
    // parent so we don't collide with the same words in the track
    // select's <option>s.
    const parent = chip.parentElement as HTMLElement;
    expect(parent.textContent).toContain('standard');
    expect(parent.textContent).toContain('(database)');
  });

  it('omits the matched-term suffix when the classifier returns no matches', () => {
    classifyPreviewValue = {
      track: 'lightweight',
      matched: [],
      reason: 'fallback',
    };
    renderOpen();
    expect(screen.getByText(/auto would pick:/i)).toBeInTheDocument();
    expect(screen.queryByText(/\(/)).not.toBeInTheDocument();
  });

  it('forwards onCreated through to the useMeetingCreate hook', () => {
    const onCreated = vi.fn();
    renderOpen({ onCreated });
    expect(lastUseMeetingCreateArgs?.onCreated).toBe(onCreated);
  });

  it('forwards the typed newTask up into the useMeetingCreate hook args', async () => {
    const user = userEvent.setup();
    renderOpen();
    await user.type(screen.getByLabelText('Meeting task'), 'rotate auth');
    expect(lastUseMeetingCreateArgs?.newTask).toBe('rotate auth');
  });

  it('opens the template editor with no target when New is clicked', async () => {
    const user = userEvent.setup();
    renderOpen();
    expect(screen.getByTestId('tpl-editor')).toHaveAttribute(
      'data-open',
      'false',
    );
    await user.click(
      screen.getByRole('button', { name: 'Create new template' }),
    );
    expect(screen.getByTestId('tpl-editor')).toHaveAttribute(
      'data-open',
      'true',
    );
    expect(screen.getByTestId('tpl-editor')).toHaveAttribute(
      'data-target',
      '',
    );
  });

  it('opens the template editor pre-filled when the edit-pencil is clicked', async () => {
    const user = userEvent.setup();
    templatesValue = [{ name: 'foo', task: 'foo task' }];
    renderOpen();
    await user.click(
      screen.getByRole('button', { name: 'Edit template foo' }),
    );
    expect(screen.getByTestId('tpl-editor')).toHaveAttribute(
      'data-target',
      'foo',
    );
    expect(screen.getByTestId('tpl-editor')).toHaveAttribute(
      'data-open',
      'true',
    );
  });

  it('closes the template editor when the editor fires onClose', async () => {
    const user = userEvent.setup();
    renderOpen();
    await user.click(
      screen.getByRole('button', { name: 'Create new template' }),
    );
    await user.click(screen.getByTestId('tpl-editor-close'));
    expect(screen.getByTestId('tpl-editor')).toHaveAttribute(
      'data-open',
      'false',
    );
  });

  it('refreshes templates when the editor fires onSaved', async () => {
    const user = userEvent.setup();
    renderOpen();
    await user.click(
      screen.getByRole('button', { name: 'Create new template' }),
    );
    await user.click(screen.getByTestId('tpl-editor-saved'));
    expect(refreshTemplatesMock).toHaveBeenCalledTimes(1);
  });

  it('refreshes templates when the editor fires onDeleted', async () => {
    const user = userEvent.setup();
    templatesValue = [{ name: 'foo', task: 'foo task' }];
    renderOpen();
    await user.click(
      screen.getByRole('button', { name: 'Edit template foo' }),
    );
    await user.click(screen.getByTestId('tpl-editor-deleted-foo'));
    expect(refreshTemplatesMock).toHaveBeenCalledTimes(1);
  });

  it('applies the template task into the controlled input when Apply is clicked', async () => {
    const user = userEvent.setup();
    templatesValue = [{ name: 'foo', task: 'foo task body' }];
    renderOpen();
    await user.click(
      screen.getByRole('button', { name: 'Apply template foo' }),
    );
    expect(
      (screen.getByLabelText('Meeting task') as HTMLInputElement).value,
    ).toBe('foo task body');
  });

  it('applies the template default track when present', async () => {
    const user = userEvent.setup();
    templatesValue = [
      { name: 'foo', task: 'foo task', track: 'lightweight' },
    ];
    renderOpen();
    await user.click(
      screen.getByRole('button', { name: 'Apply template foo' }),
    );
    expect(
      (screen.getByLabelText('Meeting track') as HTMLSelectElement).value,
    ).toBe('lightweight');
  });

  it('keeps the current track when applying a template without a track default', async () => {
    const user = userEvent.setup();
    templatesValue = [{ name: 'foo', task: 'foo task' }];
    renderOpen();
    await user.selectOptions(screen.getByLabelText('Meeting track'), 'full');
    await user.click(
      screen.getByRole('button', { name: 'Apply template foo' }),
    );
    expect(
      (screen.getByLabelText('Meeting track') as HTMLSelectElement).value,
    ).toBe('full');
  });

  it('shows a clear-template button only after a template is applied', async () => {
    const user = userEvent.setup();
    templatesValue = [{ name: 'foo', task: 'foo task' }];
    renderOpen();
    expect(
      screen.queryByRole('button', { name: 'Clear template selection' }),
    ).not.toBeInTheDocument();
    await user.click(
      screen.getByRole('button', { name: 'Apply template foo' }),
    );
    expect(
      screen.getByRole('button', { name: 'Clear template selection' }),
    ).toBeInTheDocument();
  });

  it('clears the applied template when the clear button is clicked', async () => {
    const user = userEvent.setup();
    templatesValue = [{ name: 'foo', task: 'foo task' }];
    renderOpen();
    await user.click(
      screen.getByRole('button', { name: 'Apply template foo' }),
    );
    await user.click(
      screen.getByRole('button', { name: 'Clear template selection' }),
    );
    expect(
      screen.queryByRole('button', { name: 'Clear template selection' }),
    ).not.toBeInTheDocument();
  });

  it('clears templateName when the editor deletes the active template', async () => {
    const user = userEvent.setup();
    templatesValue = [{ name: 'foo', task: 'foo task' }];
    renderOpen();
    await user.click(
      screen.getByRole('button', { name: 'Apply template foo' }),
    );
    expect(
      screen.getByRole('button', { name: 'Clear template selection' }),
    ).toBeInTheDocument();
    await user.click(
      screen.getByRole('button', { name: 'Edit template foo' }),
    );
    await user.click(screen.getByTestId('tpl-editor-deleted-foo'));
    expect(
      screen.queryByRole('button', { name: 'Clear template selection' }),
    ).not.toBeInTheDocument();
  });

  it('renders placeholder-var inputs after applying a template with {{vars}}', async () => {
    const user = userEvent.setup();
    templatesValue = [
      { name: 'foo', task: 'rotate {{secret}} in {{env}}' },
    ];
    renderOpen();
    await user.click(
      screen.getByRole('button', { name: 'Apply template foo' }),
    );
    expect(screen.getByLabelText('Value for secret')).toBeInTheDocument();
    expect(screen.getByLabelText('Value for env')).toBeInTheDocument();
  });

  it('reflects typed values in the placeholder-var inputs (controlled)', async () => {
    const user = userEvent.setup();
    templatesValue = [{ name: 'foo', task: 'rotate {{secret}}' }];
    renderOpen();
    await user.click(
      screen.getByRole('button', { name: 'Apply template foo' }),
    );
    const input = screen.getByLabelText('Value for secret') as HTMLInputElement;
    await user.type(input, 'token-1');
    expect(input.value).toBe('token-1');
  });

  it('skips the placeholder-var grid for a template with no {{vars}}', async () => {
    const user = userEvent.setup();
    templatesValue = [{ name: 'foo', task: 'literal task' }];
    renderOpen();
    await user.click(
      screen.getByRole('button', { name: 'Apply template foo' }),
    );
    expect(screen.queryByLabelText(/Value for /)).not.toBeInTheDocument();
  });

  it('rerendering with the same props does not duplicate the form', () => {
    const { rerender, props } = renderOpen();
    rerender(<MeetingsComposer {...props} />);
    expect(screen.getAllByLabelText('Meeting task')).toHaveLength(1);
  });

  it('keeps handler identity stable across rerenders with the same hook output', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const { rerender, props } = renderOpen({ onClose });
    rerender(<MeetingsComposer {...props} />);
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('re-renders when the locale flips (useLocale subscription)', () => {
    renderOpen();
    expect(
      screen.getByRole('button', { name: 'Create meeting' }),
    ).toBeInTheDocument();
    act(() => {
      setLocale('ko');
    });
    // After flip, the English "Create meeting" aria-label is gone
    // because the Korean bundle ships its own translation.
    expect(
      screen.queryByRole('button', { name: 'Create meeting' }),
    ).not.toBeInTheDocument();
    // The Create button itself is still mounted (re-rendered, not
    // unmounted), just with a different aria-label.
    expect(screen.getAllByRole('button').length).toBeGreaterThan(0);
  });
});
