import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { setLocale } from '../lib/i18n';

// SpecialistsAddPanel delegates the entire add / propose form
// pipeline to useSpecialistsAddPropose. Tests mock the hook
// with per-test-tunable flags (addBusy / proposeBusy /
// addError / proposeMsg / proposeRejected) plus a real
// useState for json so controlled-textarea typing stays
// observable. The component test focuses on JSX wiring:
// open / closed branch, button label / aria-label / disabled
// gating, handleAdd / handlePropose / handleCancel wiring,
// addError + proposeMsg banner branches, json passing into
// the textarea + setJson on change.

const handleAddMock = vi.fn();
const handleProposeMock = vi.fn();
const onAddedMock = vi.fn();
const setAddErrorMock = vi.fn();

let hookState: {
  addBusy: boolean;
  addError: string | null;
  proposeBusy: boolean;
  proposeMsg: string | null;
  proposeRejected: boolean;
} = {
  addBusy: false,
  addError: null,
  proposeBusy: false,
  proposeMsg: null,
  proposeRejected: false,
};

let lastHookArgs: { onAdded: (id: string) => void } | null = null;

vi.mock('../lib/use-specialists-add-propose', async () => {
  const react = await vi.importActual<typeof import('react')>('react');
  return {
    useSpecialistsAddPropose: (args: { onAdded: (id: string) => void }) => {
      lastHookArgs = args;
      const [json, setJson] = react.useState('');
      return {
        json,
        setJson,
        addBusy: hookState.addBusy,
        addError: hookState.addError,
        setAddError: setAddErrorMock,
        proposeBusy: hookState.proposeBusy,
        proposeMsg: hookState.proposeMsg,
        proposeRejected: hookState.proposeRejected,
        handleAdd: handleAddMock,
        handlePropose: handleProposeMock,
      };
    },
  };
});

import SpecialistsAddPanel from './SpecialistsAddPanel';

beforeEach(() => {
  setLocale('en');
  handleAddMock.mockReset();
  handleProposeMock.mockReset();
  onAddedMock.mockReset();
  setAddErrorMock.mockReset();
  hookState = {
    addBusy: false,
    addError: null,
    proposeBusy: false,
    proposeMsg: null,
    proposeRejected: false,
  };
  lastHookArgs = null;
});

function renderPanel(
  overrides: Partial<Parameters<typeof SpecialistsAddPanel>[0]> = {},
) {
  const onClose = vi.fn();
  const props = {
    open: true,
    onClose,
    onAdded: onAddedMock,
    ...overrides,
  };
  const utils = render(<SpecialistsAddPanel {...props} />);
  const user = userEvent.setup();
  return { ...utils, user, onClose, props };
}

describe('<SpecialistsAddPanel>', () => {
  it('returns null when open=false (renders nothing)', () => {
    const { container } = renderPanel({ open: false });
    expect(container.firstChild).toBeNull();
  });

  it('renders the JSON textarea when open=true', () => {
    renderPanel();
    expect(
      screen.getByRole('textbox', { name: 'Specialist JSON' }),
    ).toBeInTheDocument();
  });

  it('renders the Add specialist button with the confirm-add aria-label', () => {
    renderPanel();
    expect(
      screen.getByRole('button', { name: 'Confirm add' }),
    ).toBeInTheDocument();
  });

  it('renders the Propose via meeting button with its aria-label', () => {
    renderPanel();
    const buttons = screen.getAllByRole('button', {
      name: 'Propose via meeting',
    });
    expect(buttons.length).toBeGreaterThanOrEqual(1);
  });

  it('uses the propose tooltip text on the Propose button title attribute', () => {
    renderPanel();
    const propose = screen.getAllByRole('button', {
      name: 'Propose via meeting',
    })[0];
    expect(propose).toHaveAttribute(
      'title',
      'POST to /specialists/propose — drives a meta-meeting and adds only on consensus',
    );
  });

  it('renders the Cancel button', () => {
    renderPanel();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
  });

  it('forwards onAdded into the hook args', () => {
    renderPanel();
    expect(lastHookArgs?.onAdded).toBe(onAddedMock);
  });

  it('disables Add specialist when json is empty', () => {
    renderPanel();
    expect(screen.getByRole('button', { name: 'Confirm add' })).toBeDisabled();
  });

  it('disables Propose when json is empty', () => {
    renderPanel();
    const propose = screen.getAllByRole('button', {
      name: 'Propose via meeting',
    })[0];
    expect(propose).toBeDisabled();
  });

  it('enables Add specialist after typing into the JSON textarea', async () => {
    const { user } = renderPanel();
    const textarea = screen.getByRole('textbox', { name: 'Specialist JSON' });
    await user.type(textarea, 'json-text');
    expect(
      screen.getByRole('button', { name: 'Confirm add' }),
    ).not.toBeDisabled();
  });

  it('enables Propose after typing into the JSON textarea', async () => {
    const { user } = renderPanel();
    const textarea = screen.getByRole('textbox', { name: 'Specialist JSON' });
    await user.type(textarea, 'json-text');
    const propose = screen.getAllByRole('button', {
      name: 'Propose via meeting',
    })[0];
    expect(propose).not.toBeDisabled();
  });

  it('keeps Add specialist disabled when the textarea has only whitespace', async () => {
    const { user } = renderPanel();
    const textarea = screen.getByRole('textbox', { name: 'Specialist JSON' });
    await user.type(textarea, '   ');
    expect(screen.getByRole('button', { name: 'Confirm add' })).toBeDisabled();
  });

  it('disables Add specialist when addBusy is true', async () => {
    hookState.addBusy = true;
    const { user } = renderPanel();
    const textarea = screen.getByRole('textbox', { name: 'Specialist JSON' });
    await user.type(textarea, 'json-text');
    expect(screen.getByRole('button', { name: 'Confirm add' })).toBeDisabled();
  });

  it('disables Add specialist when proposeBusy is true', async () => {
    hookState.proposeBusy = true;
    const { user } = renderPanel();
    const textarea = screen.getByRole('textbox', { name: 'Specialist JSON' });
    await user.type(textarea, 'json-text');
    expect(screen.getByRole('button', { name: 'Confirm add' })).toBeDisabled();
  });

  it('disables Propose when addBusy is true', async () => {
    hookState.addBusy = true;
    const { user } = renderPanel();
    const textarea = screen.getByRole('textbox', { name: 'Specialist JSON' });
    await user.type(textarea, 'json-text');
    const propose = screen.getAllByRole('button', {
      name: 'Propose via meeting',
    })[0];
    expect(propose).toBeDisabled();
  });

  it('disables Propose when proposeBusy is true', async () => {
    hookState.proposeBusy = true;
    const { user } = renderPanel();
    const textarea = screen.getByRole('textbox', { name: 'Specialist JSON' });
    await user.type(textarea, 'json-text');
    const propose = screen.getAllByRole('button', {
      name: 'Propose via meeting',
    })[0];
    expect(propose).toBeDisabled();
  });

  it('disables Cancel when addBusy is true', () => {
    hookState.addBusy = true;
    renderPanel();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();
  });

  it('disables Cancel when proposeBusy is true', () => {
    hookState.proposeBusy = true;
    renderPanel();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();
  });

  it('disables the textarea when addBusy is true', () => {
    hookState.addBusy = true;
    renderPanel();
    expect(
      screen.getByRole('textbox', { name: 'Specialist JSON' }),
    ).toBeDisabled();
  });

  it('does not disable the textarea when only proposeBusy is true', () => {
    hookState.proposeBusy = true;
    renderPanel();
    expect(
      screen.getByRole('textbox', { name: 'Specialist JSON' }),
    ).not.toBeDisabled();
  });

  it('fires handleAdd when the Add specialist button is clicked', async () => {
    const { user } = renderPanel();
    const textarea = screen.getByRole('textbox', { name: 'Specialist JSON' });
    await user.type(textarea, 'json-text');
    await user.click(screen.getByRole('button', { name: 'Confirm add' }));
    expect(handleAddMock).toHaveBeenCalledTimes(1);
  });

  it('fires handlePropose when the Propose button is clicked', async () => {
    const { user } = renderPanel();
    const textarea = screen.getByRole('textbox', { name: 'Specialist JSON' });
    await user.type(textarea, 'json-text');
    const propose = screen.getAllByRole('button', {
      name: 'Propose via meeting',
    })[0];
    await user.click(propose);
    expect(handleProposeMock).toHaveBeenCalledTimes(1);
  });

  it('fires onClose + setAddError(null) when Cancel is clicked', async () => {
    const { user, onClose } = renderPanel();
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(setAddErrorMock).toHaveBeenCalledTimes(1);
    expect(setAddErrorMock).toHaveBeenCalledWith(null);
  });

  it('does not fire handleAdd / handlePropose on initial render', () => {
    renderPanel();
    expect(handleAddMock).not.toHaveBeenCalled();
    expect(handleProposeMock).not.toHaveBeenCalled();
  });

  it('does NOT render the addError span when addError is null', () => {
    const { container } = renderPanel();
    expect(container.querySelector('.text-destructive')).toBeNull();
  });

  it('renders the addError span with destructive tone when addError is a string', () => {
    hookState.addError = 'invalid JSON: bad token';
    renderPanel();
    const banner = screen.getByText('invalid JSON: bad token');
    expect(banner).toBeInTheDocument();
    expect(banner).toHaveClass('text-destructive');
  });

  it('does NOT render the proposeMsg span when proposeMsg is null', () => {
    const { container } = renderPanel();
    expect(container.querySelector('.text-success')).toBeNull();
    expect(container.querySelector('.text-warning')).toBeNull();
  });

  it('renders the proposeMsg with emerald tone when proposeRejected is false', () => {
    hookState.proposeMsg = 'accepted by 3 specialist(s)';
    hookState.proposeRejected = false;
    renderPanel();
    const banner = screen.getByText('accepted by 3 specialist(s)');
    expect(banner).toHaveClass('text-success');
    expect(banner).not.toHaveClass('text-warning');
  });

  it('renders the proposeMsg with amber tone when proposeRejected is true', () => {
    hookState.proposeMsg = 'rejected: missing systemPrompt';
    hookState.proposeRejected = true;
    renderPanel();
    const banner = screen.getByText('rejected: missing systemPrompt');
    expect(banner).toHaveClass('text-warning');
    expect(banner).not.toHaveClass('text-success');
  });

  it('renders both addError and proposeMsg banners side by side when both set', () => {
    hookState.addError = 'invalid JSON: x';
    hookState.proposeMsg = 'accepted by 2';
    renderPanel();
    expect(screen.getByText('invalid JSON: x')).toBeInTheDocument();
    expect(screen.getByText('accepted by 2')).toBeInTheDocument();
  });

  it('reflects typed value into the controlled textarea (real useState)', async () => {
    const { user } = renderPanel();
    const textarea = screen.getByRole('textbox', {
      name: 'Specialist JSON',
    }) as HTMLTextAreaElement;
    await user.type(textarea, 'abcdef');
    expect(textarea.value).toBe('abcdef');
  });

  it('renders the placeholder hint on the textarea', () => {
    renderPanel();
    const textarea = screen.getByRole('textbox', { name: 'Specialist JSON' });
    expect(textarea.getAttribute('placeholder')).toContain('data-engineer');
  });

  it('toggles from null (open=false) into rendered tree when open flips true', () => {
    const { rerender, props } = renderPanel({ open: false });
    expect(
      screen.queryByRole('textbox', { name: 'Specialist JSON' }),
    ).not.toBeInTheDocument();
    rerender(<SpecialistsAddPanel {...props} open={true} />);
    expect(
      screen.getByRole('textbox', { name: 'Specialist JSON' }),
    ).toBeInTheDocument();
  });

  it('toggles from rendered tree back to null when open flips false', () => {
    const { rerender, props } = renderPanel();
    expect(
      screen.getByRole('textbox', { name: 'Specialist JSON' }),
    ).toBeInTheDocument();
    rerender(<SpecialistsAddPanel {...props} open={false} />);
    expect(
      screen.queryByRole('textbox', { name: 'Specialist JSON' }),
    ).not.toBeInTheDocument();
  });

  it('re-renders translated labels when the locale flips to ko', () => {
    renderPanel();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
    act(() => {
      setLocale('ko');
    });
    expect(
      screen.queryByRole('button', { name: 'Cancel' }),
    ).not.toBeInTheDocument();
  });
});
