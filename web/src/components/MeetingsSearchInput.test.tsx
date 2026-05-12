import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import MeetingsSearchInput from './MeetingsSearchInput';
import { setLocale } from '../lib/i18n';

// MeetingsSearchInput is a pure controlled text input: parent owns
// the query value and the searching boolean. The X-clear button is
// only rendered when value is non-empty; the "searching..." indicator
// is only rendered when the searching prop is true. Tests drive the
// full prop union directly: empty vs populated value, idle vs
// searching, the per-keystroke onChange contract, the clear payload,
// the accessible labels, and the locale flip.

beforeEach(() => {
  setLocale('en');
});

function renderInput(
  overrides: Partial<Parameters<typeof MeetingsSearchInput>[0]> = {},
) {
  const props = {
    value: '',
    onChange: vi.fn(),
    searching: false,
    ...overrides,
  };
  const utils = render(<MeetingsSearchInput {...props} />);
  return { ...utils, props };
}

describe('<MeetingsSearchInput>', () => {
  it('renders the text input labelled by the i18n accessible name', () => {
    renderInput();
    expect(
      screen.getByRole('textbox', { name: 'Search meetings' }),
    ).toBeInTheDocument();
  });

  it('renders the text input with the i18n placeholder', () => {
    renderInput();
    expect(
      screen.getByPlaceholderText(/^Search transcripts/),
    ).toBeInTheDocument();
  });

  it('renders the input with type="text"', () => {
    renderInput();
    const input = screen.getByRole('textbox', {
      name: 'Search meetings',
    }) as HTMLInputElement;
    expect(input.type).toBe('text');
  });

  it('reflects the current value prop on the input', () => {
    renderInput({ value: 'auth' });
    const input = screen.getByRole('textbox', {
      name: 'Search meetings',
    }) as HTMLInputElement;
    expect(input.value).toBe('auth');
  });

  it('reflects an empty value prop as an empty input', () => {
    renderInput({ value: '' });
    const input = screen.getByRole('textbox', {
      name: 'Search meetings',
    }) as HTMLInputElement;
    expect(input.value).toBe('');
  });

  it('fires onChange on every character typed into the input', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    renderInput({ onChange });
    await user.type(
      screen.getByRole('textbox', { name: 'Search meetings' }),
      'ab',
    );
    expect(onChange).toHaveBeenCalledTimes(2);
    expect(onChange).toHaveBeenNthCalledWith(1, 'a');
    expect(onChange).toHaveBeenNthCalledWith(2, 'b');
  });

  it('passes the full typed value when starting from a populated controlled value', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    renderInput({ value: 'foo', onChange });
    await user.type(
      screen.getByRole('textbox', { name: 'Search meetings' }),
      'x',
    );
    expect(onChange).toHaveBeenLastCalledWith('foox');
  });

  it('does not render the clear button when value is empty', () => {
    renderInput({ value: '' });
    expect(
      screen.queryByRole('button', { name: 'Clear search' }),
    ).not.toBeInTheDocument();
  });

  it('renders the clear button when value is non-empty', () => {
    renderInput({ value: 'auth' });
    expect(
      screen.getByRole('button', { name: 'Clear search' }),
    ).toBeInTheDocument();
  });

  it('renders the clear button as type="button" so it never submits a form', () => {
    renderInput({ value: 'auth' });
    expect(
      screen.getByRole('button', { name: 'Clear search' }),
    ).toHaveAttribute('type', 'button');
  });

  it('fires onChange with empty string when the clear button is clicked', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    renderInput({ value: 'auth', onChange });
    await user.click(screen.getByRole('button', { name: 'Clear search' }));
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith('');
  });

  it('does not render the searching indicator when searching=false', () => {
    renderInput({ searching: false });
    expect(screen.queryByText(/^searching/)).not.toBeInTheDocument();
  });

  it('renders the searching indicator when searching=true', () => {
    renderInput({ searching: true });
    expect(screen.getByText(/^searching/)).toBeInTheDocument();
  });

  it('renders the searching indicator independently of value', () => {
    renderInput({ value: '', searching: true });
    expect(screen.getByText(/^searching/)).toBeInTheDocument();
  });

  it('renders the searching indicator alongside a populated value', () => {
    renderInput({ value: 'auth', searching: true });
    expect(screen.getByText(/^searching/)).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Clear search' }),
    ).toBeInTheDocument();
  });

  it('renders a Search icon decoratively (aria-hidden)', () => {
    const { container } = renderInput();
    const icons = container.querySelectorAll('svg[aria-hidden="true"]');
    expect(icons.length).toBeGreaterThanOrEqual(1);
  });

  it('does not fire onChange on initial render', () => {
    const onChange = vi.fn();
    renderInput({ onChange });
    expect(onChange).not.toHaveBeenCalled();
  });

  it('does not fire onChange when only the searching prop flips', () => {
    const onChange = vi.fn();
    const { rerender, props } = renderInput({ onChange, searching: false });
    rerender(<MeetingsSearchInput {...props} searching={true} />);
    expect(onChange).not.toHaveBeenCalled();
  });

  it('rerendering with the same props does not duplicate the clear callback', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const { rerender, props } = renderInput({ value: 'auth', onChange });
    rerender(<MeetingsSearchInput {...props} />);
    await user.click(screen.getByRole('button', { name: 'Clear search' }));
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it('rerendering from empty to populated value surfaces the clear button', () => {
    const { rerender, props } = renderInput({ value: '' });
    expect(
      screen.queryByRole('button', { name: 'Clear search' }),
    ).not.toBeInTheDocument();
    rerender(<MeetingsSearchInput {...props} value="auth" />);
    expect(
      screen.getByRole('button', { name: 'Clear search' }),
    ).toBeInTheDocument();
  });

  it('rerendering from populated to empty value removes the clear button', () => {
    const { rerender, props } = renderInput({ value: 'auth' });
    expect(
      screen.getByRole('button', { name: 'Clear search' }),
    ).toBeInTheDocument();
    rerender(<MeetingsSearchInput {...props} value="" />);
    expect(
      screen.queryByRole('button', { name: 'Clear search' }),
    ).not.toBeInTheDocument();
  });

  it('rerendering from idle to searching surfaces the indicator', () => {
    const { rerender, props } = renderInput({ searching: false });
    expect(screen.queryByText(/^searching/)).not.toBeInTheDocument();
    rerender(<MeetingsSearchInput {...props} searching={true} />);
    expect(screen.getByText(/^searching/)).toBeInTheDocument();
  });

  it('rerendering from searching back to idle removes the indicator', () => {
    const { rerender, props } = renderInput({ searching: true });
    expect(screen.getByText(/^searching/)).toBeInTheDocument();
    rerender(<MeetingsSearchInput {...props} searching={false} />);
    expect(screen.queryByText(/^searching/)).not.toBeInTheDocument();
  });

  it('re-renders translated copy when the locale flips to ko', () => {
    renderInput();
    expect(
      screen.getByRole('textbox', { name: 'Search meetings' }),
    ).toBeInTheDocument();
    act(() => {
      setLocale('ko');
    });
    expect(
      screen.queryByRole('textbox', { name: 'Search meetings' }),
    ).not.toBeInTheDocument();
  });
});
