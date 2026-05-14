import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { setLocale } from '../lib/i18n';
import WorkerDetailKeysRow from './WorkerDetailKeysRow';
import type { SendableKey } from './WorkerDetailKeysRow';

// (v1.11.110) WorkerDetailKeysRow is the mobile-only special-keys
// row -- Esc, Ctrl-C, Ctrl-D, Tab + four arrow buttons. Hidden at
// md+ via Tailwind utility class. Pure controlled: parent owns
// busy state + sendKey dispatcher. Mirrors v1.11.104-109 pattern.

interface RenderOpts {
  busy?: boolean;
  onSendKey?: (key: SendableKey) => void;
}

function renderRow(over: RenderOpts = {}) {
  const onSendKey = over.onSendKey ?? vi.fn();
  const props = {
    busy: over.busy ?? false,
    onSendKey,
  };
  const utils = render(<WorkerDetailKeysRow {...props} />);
  const user = userEvent.setup();
  return { ...utils, user, onSendKey, props };
}

beforeEach(() => {
  setLocale('en');
});

describe('<WorkerDetailKeysRow>', () => {
  // ---- idle render ----------------------------------------------

  it('renders the localized "Keys" heading caption', () => {
    renderRow();
    expect(screen.getByText('Keys')).toBeInTheDocument();
  });

  it('renders the Esc button with its localized label', () => {
    renderRow();
    expect(screen.getByRole('button', { name: 'Esc' })).toBeInTheDocument();
  });

  it('renders the Ctrl-C button with its localized label', () => {
    renderRow();
    expect(screen.getByRole('button', { name: 'Ctrl-C' })).toBeInTheDocument();
  });

  it('renders the Ctrl-D button with its localized label', () => {
    renderRow();
    expect(screen.getByRole('button', { name: 'Ctrl-D' })).toBeInTheDocument();
  });

  it('renders the Tab button with its localized label', () => {
    renderRow();
    expect(screen.getByRole('button', { name: 'Tab' })).toBeInTheDocument();
  });

  it('renders the Arrow Up button with its localized aria-label', () => {
    renderRow();
    expect(
      screen.getByRole('button', { name: 'Arrow Up' }),
    ).toBeInTheDocument();
  });

  it('renders the Arrow Down button with its localized aria-label', () => {
    renderRow();
    expect(
      screen.getByRole('button', { name: 'Arrow Down' }),
    ).toBeInTheDocument();
  });

  it('renders the Arrow Left button with its localized aria-label', () => {
    renderRow();
    expect(
      screen.getByRole('button', { name: 'Arrow Left' }),
    ).toBeInTheDocument();
  });

  it('renders the Arrow Right button with its localized aria-label', () => {
    renderRow();
    expect(
      screen.getByRole('button', { name: 'Arrow Right' }),
    ).toBeInTheDocument();
  });

  it('renders exactly eight key buttons', () => {
    renderRow();
    expect(screen.getAllByRole('button')).toHaveLength(8);
  });

  // ---- responsive class -----------------------------------------

  it('applies the md:hidden Tailwind class on the container so it hides on desktop', () => {
    const { container } = renderRow();
    const row = container.firstChild as HTMLElement;
    expect(row.className).toMatch(/md:hidden/);
  });

  // ---- onSendKey dispatch ---------------------------------------

  it('fires onSendKey("Escape") when the Esc button is clicked', async () => {
    const { user, onSendKey } = renderRow();
    await user.click(screen.getByRole('button', { name: 'Esc' }));
    expect(onSendKey).toHaveBeenCalledTimes(1);
    expect(onSendKey).toHaveBeenCalledWith('Escape');
  });

  it('fires onSendKey("C-c") when the Ctrl-C button is clicked', async () => {
    const { user, onSendKey } = renderRow();
    await user.click(screen.getByRole('button', { name: 'Ctrl-C' }));
    expect(onSendKey).toHaveBeenCalledTimes(1);
    expect(onSendKey).toHaveBeenCalledWith('C-c');
  });

  it('fires onSendKey("C-d") when the Ctrl-D button is clicked', async () => {
    const { user, onSendKey } = renderRow();
    await user.click(screen.getByRole('button', { name: 'Ctrl-D' }));
    expect(onSendKey).toHaveBeenCalledTimes(1);
    expect(onSendKey).toHaveBeenCalledWith('C-d');
  });

  it('fires onSendKey("Tab") when the Tab button is clicked', async () => {
    const { user, onSendKey } = renderRow();
    await user.click(screen.getByRole('button', { name: 'Tab' }));
    expect(onSendKey).toHaveBeenCalledTimes(1);
    expect(onSendKey).toHaveBeenCalledWith('Tab');
  });

  it('fires onSendKey("Up") when the Arrow Up button is clicked', async () => {
    const { user, onSendKey } = renderRow();
    await user.click(screen.getByRole('button', { name: 'Arrow Up' }));
    expect(onSendKey).toHaveBeenCalledTimes(1);
    expect(onSendKey).toHaveBeenCalledWith('Up');
  });

  it('fires onSendKey("Down") when the Arrow Down button is clicked', async () => {
    const { user, onSendKey } = renderRow();
    await user.click(screen.getByRole('button', { name: 'Arrow Down' }));
    expect(onSendKey).toHaveBeenCalledTimes(1);
    expect(onSendKey).toHaveBeenCalledWith('Down');
  });

  it('fires onSendKey("Left") when the Arrow Left button is clicked', async () => {
    const { user, onSendKey } = renderRow();
    await user.click(screen.getByRole('button', { name: 'Arrow Left' }));
    expect(onSendKey).toHaveBeenCalledTimes(1);
    expect(onSendKey).toHaveBeenCalledWith('Left');
  });

  it('fires onSendKey("Right") when the Arrow Right button is clicked', async () => {
    const { user, onSendKey } = renderRow();
    await user.click(screen.getByRole('button', { name: 'Arrow Right' }));
    expect(onSendKey).toHaveBeenCalledTimes(1);
    expect(onSendKey).toHaveBeenCalledWith('Right');
  });

  // ---- repeated clicks ------------------------------------------

  it('fires onSendKey once per click for repeated arrow-up presses', async () => {
    const { user, onSendKey } = renderRow();
    const up = screen.getByRole('button', { name: 'Arrow Up' });
    await user.click(up);
    await user.click(up);
    await user.click(up);
    expect(onSendKey).toHaveBeenCalledTimes(3);
    expect(onSendKey).toHaveBeenNthCalledWith(1, 'Up');
    expect(onSendKey).toHaveBeenNthCalledWith(2, 'Up');
    expect(onSendKey).toHaveBeenNthCalledWith(3, 'Up');
  });

  // ---- busy=true gates every button -----------------------------

  it('disables the Esc button when busy=true', () => {
    renderRow({ busy: true });
    expect(screen.getByRole('button', { name: 'Esc' })).toBeDisabled();
  });

  it('disables the Ctrl-C button when busy=true', () => {
    renderRow({ busy: true });
    expect(screen.getByRole('button', { name: 'Ctrl-C' })).toBeDisabled();
  });

  it('disables every arrow button when busy=true', () => {
    renderRow({ busy: true });
    expect(screen.getByRole('button', { name: 'Arrow Up' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Arrow Down' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Arrow Left' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Arrow Right' })).toBeDisabled();
  });

  it('disables every key button when busy=true', () => {
    renderRow({ busy: true });
    const buttons = screen.getAllByRole('button');
    expect(buttons).toHaveLength(8);
    for (const btn of buttons) {
      expect(btn).toBeDisabled();
    }
  });

  // ---- type attribute -------------------------------------------

  it('sets type="button" on every key button', () => {
    renderRow();
    const buttons = screen.getAllByRole('button');
    for (const btn of buttons) {
      expect(btn).toHaveAttribute('type', 'button');
    }
  });

  // ---- no callback on idle render -------------------------------

  it('does not fire onSendKey on initial render', () => {
    const onSendKey = vi.fn();
    renderRow({ onSendKey });
    expect(onSendKey).not.toHaveBeenCalled();
  });

  // ---- locale flip ----------------------------------------------

  it('drops the English "Keys" heading when the locale flips to ko', () => {
    renderRow();
    expect(screen.getByText('Keys')).toBeInTheDocument();
    act(() => {
      setLocale('ko');
    });
    expect(screen.queryByText('Keys')).not.toBeInTheDocument();
  });

  it('drops the English Arrow Up aria-label when the locale flips to ko', () => {
    renderRow();
    expect(
      screen.getByRole('button', { name: 'Arrow Up' }),
    ).toBeInTheDocument();
    act(() => {
      setLocale('ko');
    });
    expect(
      screen.queryByRole('button', { name: 'Arrow Up' }),
    ).not.toBeInTheDocument();
  });
});
