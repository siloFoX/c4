import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useRef, useState } from 'react';
import { setLocale } from '../lib/i18n';
import ChatComposer from './ChatComposer';

// ChatComposer is a pure controlled form: textarea + Send button
// inside an HTML <form>. The parent owns the input string, the
// textareaRef, the sending flag, and the three callbacks
// (onChangeInput / onKeyDown / onSubmit). Tests drive the full
// prop union directly. A small Wrapper preserves the
// controlled-input contract for the keystroke + clear tests so
// React's onChange wiring sees the parent echo each keystroke
// back through `input`.

type ComposerProps = Parameters<typeof ChatComposer>[0];

interface WrapperOverrides {
  initialInput?: string;
  workerName?: string;
  sending?: boolean;
  onChangeInput?: (next: string) => void;
  onKeyDown?: ComposerProps['onKeyDown'];
  onSubmit?: ComposerProps['onSubmit'];
  controlled?: boolean;
}

function Wrapper(props: WrapperOverrides) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const [value, setValue] = useState(props.initialInput ?? '');
  return (
    <ChatComposer
      textareaRef={ref}
      input={props.controlled === false ? (props.initialInput ?? '') : value}
      workerName={props.workerName ?? 'w1'}
      sending={props.sending ?? false}
      onChangeInput={(next) => {
        if (props.controlled !== false) setValue(next);
        props.onChangeInput?.(next);
      }}
      onKeyDown={props.onKeyDown ?? (() => {})}
      onSubmit={props.onSubmit ?? ((e) => e?.preventDefault())}
    />
  );
}

function renderComposer(overrides: WrapperOverrides = {}) {
  const user = userEvent.setup();
  const utils = render(<Wrapper {...overrides} />);
  return { ...utils, user };
}

beforeEach(() => {
  setLocale('en');
});

describe('<ChatComposer>', () => {
  // ---- default render --------------------------------------------

  it('renders a single <form> wrapper around the controls', () => {
    const { container } = renderComposer();
    const forms = container.querySelectorAll('form');
    expect(forms).toHaveLength(1);
  });

  it('renders a single <textarea> input slot inside the form', () => {
    renderComposer();
    expect(screen.getAllByRole('textbox')).toHaveLength(1);
  });

  it('renders the Send button with the idle label when sending=false', () => {
    renderComposer({ sending: false });
    expect(screen.getByRole('button', { name: /Send/ })).toBeInTheDocument();
  });

  it('renders the Send button with the Sending label when sending=true', () => {
    renderComposer({ sending: true });
    expect(
      screen.getByRole('button', { name: /Sending\.\.\./ }),
    ).toBeInTheDocument();
  });

  it('renders the Send button as type="submit" so it submits the form', () => {
    renderComposer({ initialInput: 'x' });
    const btn = screen.getByRole('button', { name: /Send/ });
    expect(btn).toHaveAttribute('type', 'submit');
  });

  // ---- placeholder + worker name --------------------------------

  it('renders the i18n placeholder with the workerName interpolated', () => {
    renderComposer({ workerName: 'alpha' });
    expect(
      screen.getByPlaceholderText(
        /Message alpha\.\.\. \(Enter to send, Shift\+Enter for newline\)/,
      ),
    ).toBeInTheDocument();
  });

  it('updates the placeholder when the workerName prop changes', () => {
    const { rerender } = renderComposer({ workerName: 'one' });
    expect(
      screen.getByPlaceholderText(/Message one\.\.\./),
    ).toBeInTheDocument();
    rerender(<Wrapper workerName="two" />);
    expect(
      screen.getByPlaceholderText(/Message two\.\.\./),
    ).toBeInTheDocument();
  });

  // ---- controlled value ------------------------------------------

  it('reflects the controlled input value on the textarea element', () => {
    renderComposer({ initialInput: 'hello world', controlled: false });
    const textarea = screen.getByRole('textbox') as HTMLTextAreaElement;
    expect(textarea.value).toBe('hello world');
  });

  it('reflects an empty controlled input value on the textarea element', () => {
    renderComposer({ initialInput: '', controlled: false });
    const textarea = screen.getByRole('textbox') as HTMLTextAreaElement;
    expect(textarea.value).toBe('');
  });

  // ---- onChangeInput wiring --------------------------------------

  it('fires onChangeInput with the new value when the textarea receives a keystroke', async () => {
    const onChangeInput = vi.fn();
    const { user } = renderComposer({ onChangeInput });
    const textarea = screen.getByRole('textbox');
    await user.type(textarea, 'h');
    expect(onChangeInput).toHaveBeenCalledTimes(1);
    expect(onChangeInput).toHaveBeenCalledWith('h');
  });

  it('fires onChangeInput once per character typed (no internal buffering)', async () => {
    const onChangeInput = vi.fn();
    const { user } = renderComposer({ onChangeInput });
    const textarea = screen.getByRole('textbox');
    await user.type(textarea, 'abc');
    expect(onChangeInput).toHaveBeenCalledTimes(3);
  });

  it('threads typed characters through the parent state echo (controlled)', async () => {
    const { user } = renderComposer();
    const textarea = screen.getByRole('textbox') as HTMLTextAreaElement;
    await user.type(textarea, 'echo me');
    expect(textarea.value).toBe('echo me');
  });

  // ---- send-button enable / disable logic ------------------------

  it('disables the Send button when input is empty', () => {
    renderComposer({ initialInput: '' });
    expect(screen.getByRole('button', { name: /Send/ })).toBeDisabled();
  });

  it('enables the Send button when input is non-empty', () => {
    renderComposer({ initialInput: 'hi', controlled: false });
    expect(screen.getByRole('button', { name: /Send/ })).not.toBeDisabled();
  });

  it('disables the Send button when input is only whitespace', () => {
    renderComposer({ initialInput: '   ', controlled: false });
    expect(screen.getByRole('button', { name: /Send/ })).toBeDisabled();
  });

  it('disables the Send button when sending=true even if input is non-empty', () => {
    renderComposer({ initialInput: 'hi', controlled: false, sending: true });
    expect(
      screen.getByRole('button', { name: /Sending\.\.\./ }),
    ).toBeDisabled();
  });

  it('disables the textarea when sending=true', () => {
    renderComposer({ sending: true });
    expect(screen.getByRole('textbox')).toBeDisabled();
  });

  it('does NOT disable the textarea when sending=false', () => {
    renderComposer({ sending: false });
    expect(screen.getByRole('textbox')).not.toBeDisabled();
  });

  // ---- onSubmit wiring -------------------------------------------

  it('fires onSubmit when the Send button is clicked with non-empty input', async () => {
    const onSubmit = vi.fn((e) => e?.preventDefault());
    const { user } = renderComposer({
      initialInput: 'hi',
      controlled: false,
      onSubmit,
    });
    await user.click(screen.getByRole('button', { name: /Send/ }));
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it('does NOT fire onSubmit when the disabled Send button is clicked (empty input)', async () => {
    const onSubmit = vi.fn();
    const { user } = renderComposer({ initialInput: '', onSubmit });
    await user.click(screen.getByRole('button', { name: /Send/ }));
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('does NOT fire onSubmit when the disabled Send button is clicked (whitespace input)', async () => {
    const onSubmit = vi.fn();
    const { user } = renderComposer({
      initialInput: '   ',
      controlled: false,
      onSubmit,
    });
    await user.click(screen.getByRole('button', { name: /Send/ }));
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('does NOT fire onSubmit when the disabled Send button is clicked (sending=true)', async () => {
    const onSubmit = vi.fn();
    const { user } = renderComposer({
      initialInput: 'hi',
      controlled: false,
      sending: true,
      onSubmit,
    });
    await user.click(
      screen.getByRole('button', { name: /Sending\.\.\./ }),
    );
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('fires onSubmit when the form is submitted directly (not via the button)', () => {
    const onSubmit = vi.fn((e) => e?.preventDefault());
    const { container } = render(<Wrapper initialInput="hi" onSubmit={onSubmit} controlled={false} />);
    const form = container.querySelector('form') as HTMLFormElement;
    act(() => {
      form.requestSubmit();
    });
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  // ---- onKeyDown wiring ------------------------------------------

  it('fires onKeyDown for each keystroke in the textarea', async () => {
    const onKeyDown = vi.fn();
    const { user } = renderComposer({ onKeyDown });
    const textarea = screen.getByRole('textbox');
    textarea.focus();
    await user.keyboard('h');
    expect(onKeyDown).toHaveBeenCalled();
  });

  it('forwards the Enter key event into onKeyDown so the parent can handle send-on-Enter', async () => {
    const onKeyDown = vi.fn();
    const { user } = renderComposer({ onKeyDown });
    const textarea = screen.getByRole('textbox');
    textarea.focus();
    await user.keyboard('{Enter}');
    expect(onKeyDown).toHaveBeenCalled();
    const lastCall = onKeyDown.mock.calls[onKeyDown.mock.calls.length - 1][0];
    expect(lastCall.key).toBe('Enter');
    expect(lastCall.shiftKey).toBe(false);
  });

  it('forwards Shift+Enter into onKeyDown with shiftKey=true so the parent can insert a newline', async () => {
    const onKeyDown = vi.fn();
    const { user } = renderComposer({ onKeyDown });
    const textarea = screen.getByRole('textbox');
    textarea.focus();
    await user.keyboard('{Shift>}{Enter}{/Shift}');
    expect(onKeyDown).toHaveBeenCalled();
    const lastCall = onKeyDown.mock.calls[onKeyDown.mock.calls.length - 1][0];
    expect(lastCall.key).toBe('Enter');
    expect(lastCall.shiftKey).toBe(true);
  });

  // ---- rerender stability ----------------------------------------

  it('rerendering with the same props does not duplicate the textarea', () => {
    const { rerender } = renderComposer();
    rerender(<Wrapper />);
    expect(screen.getAllByRole('textbox')).toHaveLength(1);
  });

  it('rerendering with a new sending value flips the button label', () => {
    const { rerender } = renderComposer({ sending: false });
    expect(screen.getByRole('button', { name: /^Send/ })).toBeInTheDocument();
    rerender(<Wrapper sending={true} />);
    expect(
      screen.getByRole('button', { name: /Sending\.\.\./ }),
    ).toBeInTheDocument();
  });

  it('rerendering with sending=true disables both the textarea and the button', () => {
    const { rerender } = renderComposer({
      initialInput: 'hi',
      controlled: false,
      sending: false,
    });
    expect(screen.getByRole('textbox')).not.toBeDisabled();
    rerender(<Wrapper initialInput="hi" controlled={false} sending={true} />);
    expect(screen.getByRole('textbox')).toBeDisabled();
    expect(
      screen.getByRole('button', { name: /Sending\.\.\./ }),
    ).toBeDisabled();
  });

  // ---- locale flip ------------------------------------------------

  it('re-renders the Send label in Korean when the locale flips', () => {
    renderComposer();
    expect(screen.getByRole('button', { name: /^Send/ })).toBeInTheDocument();
    act(() => {
      setLocale('ko');
    });
    expect(
      screen.queryByRole('button', { name: /^Send/ }),
    ).not.toBeInTheDocument();
  });

  it('re-renders the placeholder in Korean when the locale flips', () => {
    renderComposer({ workerName: 'w1' });
    expect(
      screen.getByPlaceholderText(/Message w1\.\.\./),
    ).toBeInTheDocument();
    act(() => {
      setLocale('ko');
    });
    expect(
      screen.queryByPlaceholderText(/Message w1\.\.\./),
    ).not.toBeInTheDocument();
  });
});
