import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { setLocale } from '../lib/i18n';

// MeetingsTemplateEditor is a thin controlled wrapper around
// useMeetingTemplateEditor. The hook owns name/task/track/description
// state + save/delete network paths + the failure banner. Each
// hook unit test exercises the network/branching, so this file
// stubs the hook with real useState for the four fields so typing
// drives controlled inputs, plus per-test-tunable busy/msg/failed
// flags and vi.fn() save/delete handlers.

let nameInitial = '';
let taskInitial = '';
let trackInitial = '';
let descriptionInitial = '';
let busyValue = false;
let msgValue: string | null = null;
let failedValue = false;

const setNameMock = vi.fn();
const setTaskMock = vi.fn();
const setTrackMock = vi.fn();
const setDescriptionMock = vi.fn();
const handleSaveMock = vi.fn();
const handleDeleteMock = vi.fn();

let lastHookArgs:
  | { open: boolean; tpl: unknown; onSaved: () => void; onDeleted: (n: string) => void }
  | null = null;

vi.mock('../lib/use-meeting-template-editor', async () => {
  const react = await vi.importActual<typeof import('react')>('react');
  return {
    useMeetingTemplateEditor: (args: {
      open: boolean;
      tpl: unknown;
      onSaved: () => void;
      onDeleted: (n: string) => void;
    }) => {
      lastHookArgs = args;
      const [name, setNameState] = react.useState<string>(nameInitial);
      const [task, setTaskState] = react.useState<string>(taskInitial);
      const [track, setTrackState] = react.useState<string>(trackInitial);
      const [description, setDescriptionState] =
        react.useState<string>(descriptionInitial);
      return {
        name,
        setName: (next: string) => {
          setNameMock(next);
          setNameState(next);
        },
        task,
        setTask: (next: string) => {
          setTaskMock(next);
          setTaskState(next);
        },
        track,
        setTrack: (next: string) => {
          setTrackMock(next);
          setTrackState(next);
        },
        description,
        setDescription: (next: string) => {
          setDescriptionMock(next);
          setDescriptionState(next);
        },
        busy: busyValue,
        msg: msgValue,
        failed: failedValue,
        handleSave: handleSaveMock,
        handleDelete: handleDeleteMock,
      };
    },
  };
});

import MeetingsTemplateEditor from './MeetingsTemplateEditor';

const SAMPLE_TPL = {
  name: 'retro-weekly',
  task: 'Weekly retro template body',
  track: 'standard',
  description: 'every Friday at 4pm',
};

beforeEach(() => {
  setLocale('en');
  nameInitial = '';
  taskInitial = '';
  trackInitial = '';
  descriptionInitial = '';
  busyValue = false;
  msgValue = null;
  failedValue = false;
  setNameMock.mockReset();
  setTaskMock.mockReset();
  setTrackMock.mockReset();
  setDescriptionMock.mockReset();
  handleSaveMock.mockReset();
  handleDeleteMock.mockReset();
  lastHookArgs = null;
});

function renderEditor(
  overrides: Partial<Parameters<typeof MeetingsTemplateEditor>[0]> = {},
) {
  const props = {
    open: true as const,
    tpl: null,
    onClose: vi.fn(),
    onSaved: vi.fn(),
    onDeleted: vi.fn(),
    ...overrides,
  };
  const utils = render(<MeetingsTemplateEditor {...props} />);
  return { ...utils, props };
}

describe('<MeetingsTemplateEditor>', () => {
  it('renders nothing when open=false', () => {
    const { container } = render(
      <MeetingsTemplateEditor
        open={false}
        tpl={null}
        onClose={vi.fn()}
        onSaved={vi.fn()}
        onDeleted={vi.fn()}
      />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders the "New template" heading when tpl is null (create mode)', () => {
    renderEditor();
    expect(screen.getByText('New template')).toBeInTheDocument();
  });

  it('renders the edit-mode heading with the template name when tpl is non-null', () => {
    renderEditor({ tpl: SAMPLE_TPL });
    expect(
      screen.getByText('Edit template "retro-weekly"'),
    ).toBeInTheDocument();
  });

  it('renders the name input with the i18n aria label', () => {
    renderEditor();
    expect(screen.getByLabelText('Template name')).toBeInTheDocument();
  });

  it('renders the task textarea with the i18n aria label', () => {
    renderEditor();
    expect(screen.getByLabelText('Template task')).toBeInTheDocument();
  });

  it('renders the description input with the i18n aria label', () => {
    renderEditor();
    expect(
      screen.getByLabelText('Template description'),
    ).toBeInTheDocument();
  });

  it('renders the track select with the i18n aria label', () => {
    renderEditor();
    expect(
      screen.getByLabelText('Template default track'),
    ).toBeInTheDocument();
  });

  it('renders the close-editor button with the i18n aria label', () => {
    renderEditor();
    expect(
      screen.getByRole('button', { name: 'Close template editor' }),
    ).toBeInTheDocument();
  });

  it('renders the Create button text in create mode', () => {
    renderEditor();
    expect(
      screen.getByRole('button', { name: 'Create' }),
    ).toBeInTheDocument();
  });

  it('renders the Save changes button text in edit mode', () => {
    renderEditor({ tpl: SAMPLE_TPL });
    expect(
      screen.getByRole('button', { name: 'Save changes' }),
    ).toBeInTheDocument();
  });

  it('renders the Delete button in edit mode', () => {
    renderEditor({ tpl: SAMPLE_TPL });
    expect(
      screen.getByRole('button', { name: 'Delete' }),
    ).toBeInTheDocument();
  });

  it('does NOT render the Delete button in create mode', () => {
    renderEditor();
    expect(
      screen.queryByRole('button', { name: 'Delete' }),
    ).not.toBeInTheDocument();
  });

  it('exposes auto / lightweight / standard / full as track options', () => {
    renderEditor();
    const select = screen.getByLabelText(
      'Template default track',
    ) as HTMLSelectElement;
    const values = Array.from(select.querySelectorAll('option')).map(
      (o) => o.value,
    );
    expect(values).toEqual(['', 'lightweight', 'standard', 'full']);
  });

  it('renders the template-name placeholder text', () => {
    renderEditor();
    expect(
      screen.getByPlaceholderText(/template name/i),
    ).toBeInTheDocument();
  });

  it('renders the task-body placeholder text', () => {
    renderEditor();
    expect(
      screen.getByPlaceholderText(/task body/i),
    ).toBeInTheDocument();
  });

  it('reflects typed text in the controlled name input', async () => {
    const user = userEvent.setup();
    renderEditor();
    const input = screen.getByLabelText('Template name') as HTMLInputElement;
    await user.type(input, 'retro');
    expect(input.value).toBe('retro');
  });

  it('fires setName for every keystroke in the name input', async () => {
    const user = userEvent.setup();
    renderEditor();
    await user.type(screen.getByLabelText('Template name'), 'ab');
    expect(setNameMock).toHaveBeenCalledTimes(2);
    expect(setNameMock).toHaveBeenLastCalledWith('ab');
  });

  it('reflects typed text in the controlled task textarea', async () => {
    const user = userEvent.setup();
    renderEditor();
    const ta = screen.getByLabelText('Template task') as HTMLTextAreaElement;
    await user.type(ta, 'body');
    expect(ta.value).toBe('body');
  });

  it('fires setTask for every keystroke in the task textarea', async () => {
    const user = userEvent.setup();
    renderEditor();
    await user.type(screen.getByLabelText('Template task'), 'xy');
    expect(setTaskMock).toHaveBeenCalledTimes(2);
    expect(setTaskMock).toHaveBeenLastCalledWith('xy');
  });

  it('fires setTrack when the track select is changed', async () => {
    const user = userEvent.setup();
    renderEditor();
    await user.selectOptions(
      screen.getByLabelText('Template default track'),
      'standard',
    );
    expect(setTrackMock).toHaveBeenCalledWith('standard');
  });

  it('reflects the chosen track in the controlled select', async () => {
    const user = userEvent.setup();
    renderEditor();
    const select = screen.getByLabelText(
      'Template default track',
    ) as HTMLSelectElement;
    await user.selectOptions(select, 'full');
    expect(select.value).toBe('full');
  });

  it('reflects typed text in the controlled description input', async () => {
    const user = userEvent.setup();
    renderEditor();
    const input = screen.getByLabelText(
      'Template description',
    ) as HTMLInputElement;
    await user.type(input, 'desc');
    expect(input.value).toBe('desc');
  });

  it('fires setDescription for every keystroke in the description input', async () => {
    const user = userEvent.setup();
    renderEditor();
    await user.type(screen.getByLabelText('Template description'), 'd');
    expect(setDescriptionMock).toHaveBeenCalledTimes(1);
    expect(setDescriptionMock).toHaveBeenLastCalledWith('d');
  });

  it('keeps the save button disabled when both name and task are empty', () => {
    renderEditor();
    expect(
      screen.getByRole('button', { name: 'Create' }),
    ).toBeDisabled();
  });

  it('keeps the save button disabled when only name is typed (no task)', async () => {
    const user = userEvent.setup();
    renderEditor();
    await user.type(screen.getByLabelText('Template name'), 'x');
    expect(
      screen.getByRole('button', { name: 'Create' }),
    ).toBeDisabled();
  });

  it('keeps the save button disabled when only task is typed (no name)', async () => {
    const user = userEvent.setup();
    renderEditor();
    await user.type(screen.getByLabelText('Template task'), 'body');
    expect(
      screen.getByRole('button', { name: 'Create' }),
    ).toBeDisabled();
  });

  it('keeps the save button disabled when both are whitespace-only', async () => {
    const user = userEvent.setup();
    renderEditor();
    await user.type(screen.getByLabelText('Template name'), '   ');
    await user.type(screen.getByLabelText('Template task'), '   ');
    expect(
      screen.getByRole('button', { name: 'Create' }),
    ).toBeDisabled();
  });

  it('enables the save button once name + task are both non-empty', async () => {
    const user = userEvent.setup();
    renderEditor();
    await user.type(screen.getByLabelText('Template name'), 'retro');
    await user.type(screen.getByLabelText('Template task'), 'body');
    expect(
      screen.getByRole('button', { name: 'Create' }),
    ).not.toBeDisabled();
  });

  it('calls handleSave once when the Create button is clicked with valid input', async () => {
    nameInitial = 'retro';
    taskInitial = 'body';
    const user = userEvent.setup();
    renderEditor();
    await user.click(screen.getByRole('button', { name: 'Create' }));
    expect(handleSaveMock).toHaveBeenCalledTimes(1);
  });

  it('does NOT call handleSave when the Create button is clicked while disabled', async () => {
    const user = userEvent.setup();
    renderEditor();
    await user.click(screen.getByRole('button', { name: 'Create' }));
    expect(handleSaveMock).not.toHaveBeenCalled();
  });

  it('calls handleSave when the Save changes button is clicked in edit mode', async () => {
    nameInitial = 'retro';
    taskInitial = 'body';
    const user = userEvent.setup();
    renderEditor({ tpl: SAMPLE_TPL });
    await user.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(handleSaveMock).toHaveBeenCalledTimes(1);
  });

  it('calls handleDelete when the Delete button is clicked in edit mode', async () => {
    const user = userEvent.setup();
    renderEditor({ tpl: SAMPLE_TPL });
    await user.click(screen.getByRole('button', { name: 'Delete' }));
    expect(handleDeleteMock).toHaveBeenCalledTimes(1);
  });

  it('calls onClose when the close button is clicked', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    renderEditor({ onClose });
    await user.click(
      screen.getByRole('button', { name: 'Close template editor' }),
    );
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('disables the name input when busy', () => {
    busyValue = true;
    renderEditor();
    expect(screen.getByLabelText('Template name')).toBeDisabled();
  });

  it('disables the task textarea when busy', () => {
    busyValue = true;
    renderEditor();
    expect(screen.getByLabelText('Template task')).toBeDisabled();
  });

  it('disables the track select when busy', () => {
    busyValue = true;
    renderEditor();
    expect(
      screen.getByLabelText('Template default track'),
    ).toBeDisabled();
  });

  it('disables the description input when busy', () => {
    busyValue = true;
    renderEditor();
    expect(
      screen.getByLabelText('Template description'),
    ).toBeDisabled();
  });

  it('disables the save button when busy regardless of name/task fill', () => {
    busyValue = true;
    nameInitial = 'retro';
    taskInitial = 'body';
    renderEditor();
    expect(
      screen.getByRole('button', { name: String.fromCharCode(0x2026) }),
    ).toBeDisabled();
  });

  it('disables the delete button when busy in edit mode', () => {
    busyValue = true;
    renderEditor({ tpl: SAMPLE_TPL });
    expect(
      screen.getByRole('button', { name: 'Delete' }),
    ).toBeDisabled();
  });

  it('swaps the save button label to ellipsis when busy', () => {
    busyValue = true;
    nameInitial = 'retro';
    taskInitial = 'body';
    renderEditor();
    const btn = screen.getAllByRole('button').find(
      (b) => b.textContent === String.fromCharCode(0x2026),
    );
    expect(btn).toBeDefined();
  });

  it('does NOT render any failure banner when msg is null', () => {
    renderEditor();
    expect(document.querySelector('.text-destructive')).toBeNull();
  });

  it('renders the failure banner with the destructive tone when failed=true', () => {
    msgValue = 'save failed: 500';
    failedValue = true;
    renderEditor();
    expect(screen.getByText('save failed: 500')).toHaveClass(
      'text-destructive',
    );
  });

  it('renders a non-failure banner with the muted tone when failed=false', () => {
    msgValue = 'ok';
    failedValue = false;
    renderEditor();
    expect(screen.getByText('ok')).toHaveClass('text-muted-foreground');
  });

  it('forwards open + tpl + onSaved + onDeleted into useMeetingTemplateEditor', () => {
    const onSaved = vi.fn();
    const onDeleted = vi.fn();
    renderEditor({ open: true, tpl: SAMPLE_TPL, onSaved, onDeleted });
    expect(lastHookArgs?.open).toBe(true);
    expect(lastHookArgs?.tpl).toBe(SAMPLE_TPL);
    expect(lastHookArgs?.onSaved).toBe(onSaved);
    expect(lastHookArgs?.onDeleted).toBe(onDeleted);
  });

  it('rerendering with the same props does not duplicate the name input', () => {
    const { rerender, props } = renderEditor();
    rerender(<MeetingsTemplateEditor {...props} />);
    expect(screen.getAllByLabelText('Template name')).toHaveLength(1);
  });

  it('keeps the typed name stable across rerenders', async () => {
    const user = userEvent.setup();
    const { rerender, props } = renderEditor();
    await user.type(screen.getByLabelText('Template name'), 'x');
    rerender(<MeetingsTemplateEditor {...props} />);
    expect(
      (screen.getByLabelText('Template name') as HTMLInputElement).value,
    ).toBe('x');
  });

  it('re-renders translated copy when the locale flips to ko', () => {
    renderEditor();
    expect(screen.getByText('New template')).toBeInTheDocument();
    act(() => {
      setLocale('ko');
    });
    expect(screen.queryByText('New template')).not.toBeInTheDocument();
  });

  it('switches Create -> Save changes when toggling tpl from null to non-null on rerender', () => {
    const { rerender, props } = renderEditor();
    expect(
      screen.getByRole('button', { name: 'Create' }),
    ).toBeInTheDocument();
    rerender(<MeetingsTemplateEditor {...props} tpl={SAMPLE_TPL} />);
    expect(
      screen.getByRole('button', { name: 'Save changes' }),
    ).toBeInTheDocument();
  });
});
