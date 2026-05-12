import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { setLocale } from '../lib/i18n';

// SpecialistsTagEditor delegates open/value/busy state +
// handleSave + toggleWithTags to useSpecialistTagEditor.
// Tests stub the hook with per-test-tunable flags + real
// useState for value so controlled-input typing keeps working.
// The component test focuses on the JSX wiring: view vs edit
// branch, button label flip, Save button gating, value passing
// into the Input, and the hook args (specialistId, onSaved,
// onError) the parent feeds the hook.

const toggleWithTagsMock = vi.fn();
const handleSaveMock = vi.fn();

let editorState: {
  open: boolean;
  busy: boolean;
} = { open: false, busy: false };

let lastHookArgs: {
  specialistId: string;
  onSaved: () => void;
  onError: (msg: string) => void;
} | null = null;

vi.mock('../lib/use-specialist-tag-editor', async () => {
  const react = await vi.importActual<typeof import('react')>('react');
  return {
    useSpecialistTagEditor: (args: {
      specialistId: string;
      onSaved: () => void;
      onError: (msg: string) => void;
    }) => {
      lastHookArgs = args;
      const [value, setValue] = react.useState('');
      return {
        open: editorState.open,
        setOpen: () => {},
        toggleWithTags: toggleWithTagsMock,
        value,
        setValue,
        busy: editorState.busy,
        handleSave: handleSaveMock,
      };
    },
  };
});

import SpecialistsTagEditor from './SpecialistsTagEditor';

beforeEach(() => {
  setLocale('en');
  toggleWithTagsMock.mockReset();
  handleSaveMock.mockReset();
  editorState = { open: false, busy: false };
  lastHookArgs = null;
});

function renderEditor(
  overrides: Partial<Parameters<typeof SpecialistsTagEditor>[0]> = {},
) {
  const onSaved = vi.fn();
  const onError = vi.fn();
  const props = {
    specialistId: 'arch-1',
    tags: ['core', 'design'] as string[] | undefined,
    onSaved,
    onError,
    ...overrides,
  };
  const utils = render(<SpecialistsTagEditor {...props} />);
  const user = userEvent.setup();
  return { ...utils, user, onSaved, onError, props };
}

describe('<SpecialistsTagEditor>', () => {
  it('forwards specialistId / onSaved / onError into the hook', () => {
    const { onSaved, onError } = renderEditor({
      specialistId: 'sec-7',
    });
    expect(lastHookArgs?.specialistId).toBe('sec-7');
    expect(lastHookArgs?.onSaved).toBe(onSaved);
    expect(lastHookArgs?.onError).toBe(onError);
  });

  it('renders the tags label always', () => {
    renderEditor();
    expect(screen.getByText('tags')).toBeInTheDocument();
  });

  it('renders the Edit button in the view (closed) branch', () => {
    renderEditor();
    expect(screen.getByRole('button', { name: 'Edit' })).toBeInTheDocument();
  });

  it('renders the Cancel button in the edit (open) branch', () => {
    editorState = { open: true, busy: false };
    renderEditor();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
  });

  it('renders all provided tags as chips in the view branch', () => {
    renderEditor();
    expect(screen.getByText('#core')).toBeInTheDocument();
    expect(screen.getByText('#design')).toBeInTheDocument();
  });

  it('renders the empty-tags placeholder when tags is undefined', () => {
    renderEditor({ tags: undefined });
    expect(screen.getByText('no tags')).toBeInTheDocument();
  });

  it('renders the empty-tags placeholder when tags is an empty array', () => {
    renderEditor({ tags: [] });
    expect(screen.getByText('no tags')).toBeInTheDocument();
  });

  it('does NOT render any tag chips when tags is empty', () => {
    renderEditor({ tags: [] });
    expect(screen.queryByText(/^#/)).not.toBeInTheDocument();
  });

  it('does NOT render the edit Input + Apply button in the view branch', () => {
    renderEditor();
    expect(
      screen.queryByRole('textbox', { name: 'Edit tags' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Apply' }),
    ).not.toBeInTheDocument();
  });

  it('renders the edit Input + Apply button in the open branch', () => {
    editorState = { open: true, busy: false };
    renderEditor();
    expect(
      screen.getByRole('textbox', { name: 'Edit tags' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Apply' }),
    ).toBeInTheDocument();
  });

  it('does NOT render the tag chip list when in the edit branch', () => {
    editorState = { open: true, busy: false };
    renderEditor();
    expect(screen.queryByText('#core')).not.toBeInTheDocument();
  });

  it('fires toggleWithTags with the current tags array when Edit is clicked', async () => {
    const { user, props } = renderEditor();
    await user.click(screen.getByRole('button', { name: 'Edit' }));
    expect(toggleWithTagsMock).toHaveBeenCalledTimes(1);
    expect(toggleWithTagsMock).toHaveBeenCalledWith(props.tags);
  });

  it('fires toggleWithTags with undefined when tags prop is undefined', async () => {
    const { user } = renderEditor({ tags: undefined });
    await user.click(screen.getByRole('button', { name: 'Edit' }));
    expect(toggleWithTagsMock).toHaveBeenCalledWith(undefined);
  });

  it('fires toggleWithTags when Cancel is clicked in the edit branch', async () => {
    editorState = { open: true, busy: false };
    const { user, props } = renderEditor();
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(toggleWithTagsMock).toHaveBeenCalledTimes(1);
    expect(toggleWithTagsMock).toHaveBeenCalledWith(props.tags);
  });

  it('updates the typed value into the controlled Input', async () => {
    editorState = { open: true, busy: false };
    const { user } = renderEditor();
    const input = screen.getByRole('textbox', {
      name: 'Edit tags',
    }) as HTMLInputElement;
    await user.type(input, '+new');
    expect(input.value).toBe('+new');
  });

  it('renders the placeholder copy on the Input', () => {
    editorState = { open: true, busy: false };
    renderEditor();
    const input = screen.getByRole('textbox', { name: 'Edit tags' });
    expect(input).toHaveAttribute(
      'placeholder',
      'comma-separated; prefix with + to add, - to remove',
    );
  });

  it('exposes Edit tags as the accessible name on the Input', () => {
    editorState = { open: true, busy: false };
    renderEditor();
    expect(
      screen.getByRole('textbox', { name: 'Edit tags' }),
    ).toBeInTheDocument();
  });

  it('disables the Input when busy is true', () => {
    editorState = { open: true, busy: true };
    renderEditor();
    expect(screen.getByRole('textbox', { name: 'Edit tags' })).toBeDisabled();
  });

  it('disables the Apply button when busy is true', () => {
    editorState = { open: true, busy: true };
    renderEditor();
    expect(screen.getByRole('button', { name: 'Apply' })).toBeDisabled();
  });

  it('does not disable the Apply button when busy is false', () => {
    editorState = { open: true, busy: false };
    renderEditor();
    expect(screen.getByRole('button', { name: 'Apply' })).not.toBeDisabled();
  });

  it('fires handleSave when the Apply button is clicked', async () => {
    editorState = { open: true, busy: false };
    const { user } = renderEditor();
    await user.click(screen.getByRole('button', { name: 'Apply' }));
    expect(handleSaveMock).toHaveBeenCalledTimes(1);
  });

  it('does not fire handleSave on initial render', () => {
    editorState = { open: true, busy: false };
    renderEditor();
    expect(handleSaveMock).not.toHaveBeenCalled();
  });

  it('does not fire toggleWithTags on initial render', () => {
    renderEditor();
    expect(toggleWithTagsMock).not.toHaveBeenCalled();
  });

  it('keeps the typed value across rerenders with the same props', async () => {
    editorState = { open: true, busy: false };
    const { user, rerender, props } = renderEditor();
    const input = screen.getByRole('textbox', {
      name: 'Edit tags',
    }) as HTMLInputElement;
    await user.type(input, 'foo');
    rerender(<SpecialistsTagEditor {...props} />);
    expect(
      (screen.getByRole('textbox', { name: 'Edit tags' }) as HTMLInputElement)
        .value,
    ).toBe('foo');
  });

  it('renders translated copy when the locale flips to ko', () => {
    renderEditor();
    expect(screen.getByText('tags')).toBeInTheDocument();
    act(() => {
      setLocale('ko');
    });
    expect(screen.queryByText('tags')).not.toBeInTheDocument();
  });

  it('flips the toggle button label when open transitions false -> true', () => {
    const { rerender, props } = renderEditor();
    expect(screen.getByRole('button', { name: 'Edit' })).toBeInTheDocument();
    editorState = { open: true, busy: false };
    rerender(<SpecialistsTagEditor {...props} />);
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
  });
});
