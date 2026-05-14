import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { setLocale } from '../lib/i18n';
import WorkerDetailComposer from './WorkerDetailComposer';

// (v1.11.110) WorkerDetailComposer is a pure controlled composer
// row -- text input + Send icon + Enter button + Merge button +
// Close button. Parent (WorkerDetail) owns the inputText and busy
// state plus the four action handlers. No hooks of its own except
// useLocale, which re-renders on locale flips. Mirrors the
// v1.11.104-109 pattern: setLocale at top, render with vi.fn()
// callbacks, assert DOM + callback wiring.

interface RenderOpts {
  inputText?: string;
  busy?: boolean;
  onChangeInputText?: (next: string) => void;
  onSend?: () => void;
  onEnter?: () => void;
  onMerge?: () => void;
  onClose?: () => void;
}

function renderComposer(over: RenderOpts = {}) {
  const onChangeInputText = over.onChangeInputText ?? vi.fn();
  const onSend = over.onSend ?? vi.fn();
  const onEnter = over.onEnter ?? vi.fn();
  const onMerge = over.onMerge ?? vi.fn();
  const onClose = over.onClose ?? vi.fn();
  const props = {
    inputText: over.inputText ?? '',
    busy: over.busy ?? false,
    onChangeInputText,
    onSend,
    onEnter,
    onMerge,
    onClose,
  };
  const utils = render(<WorkerDetailComposer {...props} />);
  const user = userEvent.setup();
  return { ...utils, user, onChangeInputText, onSend, onEnter, onMerge, onClose, props };
}

beforeEach(() => {
  setLocale('en');
});

describe('<WorkerDetailComposer>', () => {
  // ---- idle render ----------------------------------------------

  it('renders the text input with the localized placeholder', () => {
    renderComposer();
    expect(
      screen.getByPlaceholderText('Send text to worker…'),
    ).toBeInTheDocument();
  });

  it('renders the Send icon-button with the localized aria-label', () => {
    renderComposer();
    expect(
      screen.getByRole('button', { name: 'Send text' }),
    ).toBeInTheDocument();
  });

  it('renders the Enter button with the localized label', () => {
    renderComposer();
    expect(screen.getByRole('button', { name: 'Enter' })).toBeInTheDocument();
  });

  it('renders the Merge button with the localized label and Tooltip surface', () => {
    renderComposer();
    const merge = screen.getByRole('button', { name: /Merge/ });
    expect(merge).toBeInTheDocument();
    expect(screen.getByRole('tooltip')).toHaveTextContent(
      "Run pre-merge checks and merge this worker's branch into main",
    );
  });

  it('renders the Close button with the localized label', () => {
    renderComposer();
    expect(screen.getByRole('button', { name: /Close/ })).toBeInTheDocument();
  });

  it('renders exactly one text input', () => {
    renderComposer();
    expect(screen.getAllByRole('textbox')).toHaveLength(1);
  });

  it('renders exactly four action buttons', () => {
    renderComposer();
    expect(screen.getAllByRole('button')).toHaveLength(4);
  });

  // ---- inputText prop -------------------------------------------

  it('reflects the inputText prop as the input value', () => {
    renderComposer({ inputText: 'hello world' });
    const input = screen.getByRole('textbox') as HTMLInputElement;
    expect(input.value).toBe('hello world');
  });

  it('reflects an empty inputText prop as an empty input value', () => {
    renderComposer({ inputText: '' });
    const input = screen.getByRole('textbox') as HTMLInputElement;
    expect(input.value).toBe('');
  });

  it('updates the input value when inputText re-renders to a new value', () => {
    const { rerender } = renderComposer({ inputText: 'foo' });
    expect((screen.getByRole('textbox') as HTMLInputElement).value).toBe('foo');
    rerender(
      <WorkerDetailComposer
        inputText="bar"
        busy={false}
        onChangeInputText={vi.fn()}
        onSend={vi.fn()}
        onEnter={vi.fn()}
        onMerge={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    expect((screen.getByRole('textbox') as HTMLInputElement).value).toBe('bar');
  });

  // ---- onChangeInputText dispatch -------------------------------

  it('fires onChangeInputText on every character typed', async () => {
    const { user, onChangeInputText } = renderComposer();
    await user.type(screen.getByRole('textbox'), 'ab');
    expect(onChangeInputText).toHaveBeenCalledTimes(2);
    expect(onChangeInputText).toHaveBeenNthCalledWith(1, 'a');
    expect(onChangeInputText).toHaveBeenNthCalledWith(2, 'b');
  });

  // ---- Enter key on input fires onSend --------------------------

  it('fires onSend when Enter is pressed inside the input', async () => {
    const { user, onSend } = renderComposer({ inputText: 'msg' });
    await user.click(screen.getByRole('textbox'));
    await user.keyboard('{Enter}');
    expect(onSend).toHaveBeenCalledTimes(1);
  });

  it('does not fire onSend when Shift+Enter is pressed', async () => {
    const { user, onSend } = renderComposer({ inputText: 'msg' });
    await user.click(screen.getByRole('textbox'));
    await user.keyboard('{Shift>}{Enter}{/Shift}');
    expect(onSend).not.toHaveBeenCalled();
  });

  it('does not fire onSend on non-Enter keys', async () => {
    const { user, onSend } = renderComposer();
    await user.click(screen.getByRole('textbox'));
    await user.keyboard('{Escape}');
    expect(onSend).not.toHaveBeenCalled();
  });

  it('does not submit a parent form when Enter is pressed in the input', async () => {
    const user = userEvent.setup();
    const handleSubmit = vi.fn();
    render(
      <form onSubmit={handleSubmit}>
        <WorkerDetailComposer
          inputText="msg"
          busy={false}
          onChangeInputText={vi.fn()}
          onSend={vi.fn()}
          onEnter={vi.fn()}
          onMerge={vi.fn()}
          onClose={vi.fn()}
        />
      </form>,
    );
    await user.click(screen.getByRole('textbox'));
    await user.keyboard('{Enter}');
    expect(handleSubmit).not.toHaveBeenCalled();
  });

  // ---- button click dispatchers ---------------------------------

  it('fires onSend when the Send icon-button is clicked', async () => {
    const { user, onSend } = renderComposer({ inputText: 'msg' });
    await user.click(screen.getByRole('button', { name: 'Send text' }));
    expect(onSend).toHaveBeenCalledTimes(1);
  });

  it('fires onEnter when the Enter button is clicked', async () => {
    const { user, onEnter } = renderComposer();
    await user.click(screen.getByRole('button', { name: 'Enter' }));
    expect(onEnter).toHaveBeenCalledTimes(1);
  });

  it('fires onMerge when the Merge button is clicked', async () => {
    const { user, onMerge } = renderComposer();
    await user.click(screen.getByRole('button', { name: /Merge/ }));
    expect(onMerge).toHaveBeenCalledTimes(1);
  });

  it('fires onClose when the Close button is clicked', async () => {
    const { user, onClose } = renderComposer();
    await user.click(screen.getByRole('button', { name: /Close/ }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  // ---- Send button enablement -----------------------------------

  it('disables the Send icon-button when inputText is empty', () => {
    renderComposer({ inputText: '' });
    expect(screen.getByRole('button', { name: 'Send text' })).toBeDisabled();
  });

  it('disables the Send icon-button when inputText is whitespace-only', () => {
    renderComposer({ inputText: '   ' });
    expect(screen.getByRole('button', { name: 'Send text' })).toBeDisabled();
  });

  it('enables the Send icon-button when inputText has non-whitespace content', () => {
    renderComposer({ inputText: 'hi' });
    expect(screen.getByRole('button', { name: 'Send text' })).not.toBeDisabled();
  });

  // ---- busy=true gates everything -------------------------------

  it('disables the input when busy=true', () => {
    renderComposer({ busy: true });
    expect(screen.getByRole('textbox')).toBeDisabled();
  });

  it('disables the Send icon-button when busy=true even if inputText is set', () => {
    renderComposer({ busy: true, inputText: 'msg' });
    expect(screen.getByRole('button', { name: 'Send text' })).toBeDisabled();
  });

  it('disables the Enter button when busy=true', () => {
    renderComposer({ busy: true });
    expect(screen.getByRole('button', { name: 'Enter' })).toBeDisabled();
  });

  it('disables the Merge button when busy=true', () => {
    renderComposer({ busy: true });
    expect(screen.getByRole('button', { name: /Merge/ })).toBeDisabled();
  });

  it('disables the Close button when busy=true', () => {
    renderComposer({ busy: true });
    expect(screen.getByRole('button', { name: /Close/ })).toBeDisabled();
  });

  // ---- structural attributes ------------------------------------

  it('sets type="button" on all four action buttons', () => {
    renderComposer();
    expect(screen.getByRole('button', { name: 'Send text' })).toHaveAttribute('type', 'button');
    expect(screen.getByRole('button', { name: 'Enter' })).toHaveAttribute('type', 'button');
    expect(screen.getByRole('button', { name: /Merge/ })).toHaveAttribute('type', 'button');
    expect(screen.getByRole('button', { name: /Close/ })).toHaveAttribute('type', 'button');
  });

  // ---- no callback fired on idle render -------------------------

  it('does not fire any callback on initial render', () => {
    const onChangeInputText = vi.fn();
    const onSend = vi.fn();
    const onEnter = vi.fn();
    const onMerge = vi.fn();
    const onClose = vi.fn();
    renderComposer({ onChangeInputText, onSend, onEnter, onMerge, onClose });
    expect(onChangeInputText).not.toHaveBeenCalled();
    expect(onSend).not.toHaveBeenCalled();
    expect(onEnter).not.toHaveBeenCalled();
    expect(onMerge).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  // ---- locale flip ----------------------------------------------

  it('drops the English placeholder when the locale flips to ko', () => {
    renderComposer();
    expect(
      screen.getByPlaceholderText('Send text to worker…'),
    ).toBeInTheDocument();
    act(() => {
      setLocale('ko');
    });
    expect(
      screen.queryByPlaceholderText('Send text to worker…'),
    ).not.toBeInTheDocument();
  });

  it('drops the English "Merge" button label when the locale flips to ko', () => {
    renderComposer();
    expect(screen.getByRole('button', { name: /Merge/ })).toBeInTheDocument();
    act(() => {
      setLocale('ko');
    });
    expect(
      screen.queryByRole('button', { name: /Merge/ }),
    ).not.toBeInTheDocument();
  });

  it('drops the English "Close" button label when the locale flips to ko', () => {
    renderComposer();
    expect(screen.getByRole('button', { name: /Close/ })).toBeInTheDocument();
    act(() => {
      setLocale('ko');
    });
    expect(
      screen.queryByRole('button', { name: /Close/ }),
    ).not.toBeInTheDocument();
  });

  it('drops the English Merge Tooltip label when the locale flips to ko', () => {
    renderComposer();
    expect(screen.getByRole('tooltip')).toHaveTextContent(
      "Run pre-merge checks and merge this worker's branch into main",
    );
    act(() => {
      setLocale('ko');
    });
    expect(screen.getByRole('tooltip')).not.toHaveTextContent(
      "Run pre-merge checks and merge this worker's branch into main",
    );
  });
});
