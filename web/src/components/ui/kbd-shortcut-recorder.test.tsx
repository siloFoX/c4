import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  cleanup,
  fireEvent,
  render,
  screen,
} from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { createRef } from 'react';
import {
  DEFAULT_KBD_RECORDER_RESET,
  KbdShortcutRecorder,
  formatRecordedShortcut,
  hasShortcutCollision,
  normalizeShortcutOrder,
  recordShortcutFromEvent,
} from './kbd-shortcut-recorder';

afterEach(() => {
  cleanup();
});

// ---------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------

describe('normalizeShortcutOrder', () => {
  it('puts mod first, then alt, then shift, then key', () => {
    expect(normalizeShortcutOrder(['shift', 'k', 'mod'])).toEqual([
      'mod',
      'shift',
      'k',
    ]);
  });
  it('collapses cmd / meta to mod', () => {
    expect(normalizeShortcutOrder(['cmd', 'k'])).toEqual([
      'mod',
      'k',
    ]);
  });
  it('collapses option / opt to alt', () => {
    expect(normalizeShortcutOrder(['option', 'k'])).toEqual([
      'alt',
      'k',
    ]);
    expect(normalizeShortcutOrder(['opt', 'k'])).toEqual([
      'alt',
      'k',
    ]);
  });
  it('canonical sort across multiple modifiers', () => {
    expect(
      normalizeShortcutOrder(['shift', 'alt', 'mod', 'k']),
    ).toEqual(['mod', 'alt', 'shift', 'k']);
  });
  it('drops empty tokens + trims whitespace', () => {
    expect(normalizeShortcutOrder(['  mod  ', '', 'k'])).toEqual([
      'mod',
      'k',
    ]);
  });
  it('lowercases modifier tokens; preserves key casing', () => {
    expect(normalizeShortcutOrder(['SHIFT', 'MOD', 'K'])).toEqual([
      'mod',
      'shift',
      'K',
    ]);
  });
});

describe('recordShortcutFromEvent', () => {
  function evt(props: Partial<KeyboardEvent>): KeyboardEvent {
    return {
      metaKey: false,
      ctrlKey: false,
      altKey: false,
      shiftKey: false,
      key: '',
      ...props,
    } as KeyboardEvent;
  }

  it('mac mod+k', () => {
    expect(
      recordShortcutFromEvent(
        evt({ metaKey: true, key: 'k' }),
        'mac',
      ),
    ).toBe('mod+k');
  });
  it('windows mod+k (ctrl)', () => {
    expect(
      recordShortcutFromEvent(
        evt({ ctrlKey: true, key: 'k' }),
        'windows',
      ),
    ).toBe('mod+k');
  });
  it('mod+shift+k canonical order', () => {
    expect(
      recordShortcutFromEvent(
        evt({ metaKey: true, shiftKey: true, key: 'k' }),
        'mac',
      ),
    ).toBe('mod+shift+k');
  });
  it('captures Escape / Enter / Tab as named keys', () => {
    expect(
      recordShortcutFromEvent(
        evt({ key: 'Enter' }),
        'mac',
      ),
    ).toBe('Enter');
  });
  it('space normalises to "space"', () => {
    expect(
      recordShortcutFromEvent(
        evt({ ctrlKey: true, key: ' ' }),
        'windows',
      ),
    ).toBe('mod+space');
  });
  it('arrow keys allowed', () => {
    expect(
      recordShortcutFromEvent(evt({ key: 'ArrowUp' }), 'mac'),
    ).toBe('ArrowUp');
  });
  it('Function keys F1..F12 allowed', () => {
    expect(
      recordShortcutFromEvent(evt({ key: 'F5' }), 'mac'),
    ).toBe('F5');
  });
  it('bare modifier returns empty string', () => {
    expect(
      recordShortcutFromEvent(
        evt({ metaKey: true, key: 'Meta' }),
        'mac',
      ),
    ).toBe('');
  });
  it('non-mapped exotic key returns empty', () => {
    expect(
      recordShortcutFromEvent(
        evt({ key: 'AudioVolumeUp' }),
        'mac',
      ),
    ).toBe('');
  });
});

describe('hasShortcutCollision', () => {
  it('returns null for empty value', () => {
    expect(hasShortcutCollision('', ['mod+k'])).toBeNull();
  });
  it('returns the colliding entry on canonical match', () => {
    expect(
      hasShortcutCollision('mod+shift+k', ['shift+mod+k']),
    ).toBe('shift+mod+k');
  });
  it('canonical alias collapse matches cmd vs mod', () => {
    expect(
      hasShortcutCollision('cmd+k', ['mod+k']),
    ).toBe('mod+k');
  });
  it('returns null when no collision', () => {
    expect(
      hasShortcutCollision('mod+j', ['mod+k', 'shift+l']),
    ).toBeNull();
  });
});

describe('formatRecordedShortcut', () => {
  it('formats with platform labels', () => {
    expect(formatRecordedShortcut('mod+shift+k', 'mac')).toEqual([
      'Cmd',
      'Shift',
      'K',
    ]);
    expect(
      formatRecordedShortcut('mod+shift+k', 'windows'),
    ).toEqual(['Ctrl', 'Shift', 'K']);
  });
  it('empty value -> []', () => {
    expect(formatRecordedShortcut('', 'mac')).toEqual([]);
  });
});

describe('Constants', () => {
  it('DEFAULT_KBD_RECORDER_RESET = empty string', () => {
    expect(DEFAULT_KBD_RECORDER_RESET).toBe('');
  });
});

// ---------------------------------------------------------------
// Component
// ---------------------------------------------------------------

describe('KbdShortcutRecorder component', () => {
  it('renders a group with default aria-label', () => {
    render(<KbdShortcutRecorder />);
    expect(screen.getByRole('group')).toHaveAttribute(
      'aria-label',
      'Keyboard shortcut',
    );
  });

  it('honors custom ariaLabel', () => {
    render(<KbdShortcutRecorder ariaLabel="Bind action" />);
    expect(screen.getByRole('group')).toHaveAttribute(
      'aria-label',
      'Bind action',
    );
  });

  it('input is a readonly textbox', () => {
    render(<KbdShortcutRecorder />);
    expect(screen.getByRole('textbox')).toHaveAttribute(
      'aria-readonly',
      'true',
    );
  });

  it('default value renders the placeholder', () => {
    render(<KbdShortcutRecorder placeholder="Press combo" />);
    expect(screen.getByText('Press combo')).toBeInTheDocument();
  });

  it('controlled value renders as kbd chips', () => {
    render(
      <KbdShortcutRecorder
        value="mod+shift+k"
        platform="mac"
      />,
    );
    expect(screen.getByText('Cmd')).toBeInTheDocument();
    expect(screen.getByText('Shift')).toBeInTheDocument();
    expect(screen.getByText('K')).toBeInTheDocument();
  });

  it('focus puts the input into recording mode (default)', () => {
    render(<KbdShortcutRecorder />);
    fireEvent.focus(screen.getByRole('textbox'));
    expect(screen.getByRole('group')).toHaveAttribute(
      'data-recording',
      'true',
    );
  });

  it('click toggles recording mode on and off', () => {
    render(<KbdShortcutRecorder recordOnFocus={false} />);
    const input = screen.getByRole('textbox');
    fireEvent.click(input);
    expect(screen.getByRole('group')).toHaveAttribute(
      'data-recording',
      'true',
    );
    fireEvent.click(input);
    expect(screen.getByRole('group')).toHaveAttribute(
      'data-recording',
      'false',
    );
  });

  it('blur stops recording', () => {
    render(<KbdShortcutRecorder />);
    const input = screen.getByRole('textbox');
    fireEvent.focus(input);
    fireEvent.blur(input);
    expect(screen.getByRole('group')).toHaveAttribute(
      'data-recording',
      'false',
    );
  });

  it('Escape cancels recording without committing', () => {
    const onChange = vi.fn();
    render(
      <KbdShortcutRecorder
        platform="mac"
        onChange={onChange}
      />,
    );
    const input = screen.getByRole('textbox');
    fireEvent.focus(input);
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByRole('group')).toHaveAttribute(
      'data-recording',
      'false',
    );
  });

  it('records a real combo + fires onChange + onRecord + stops', () => {
    const onChange = vi.fn();
    const onRecord = vi.fn();
    render(
      <KbdShortcutRecorder
        platform="mac"
        onChange={onChange}
        onRecord={onRecord}
      />,
    );
    const input = screen.getByRole('textbox');
    fireEvent.focus(input);
    fireEvent.keyDown(input, {
      key: 'k',
      metaKey: true,
    });
    expect(onChange).toHaveBeenCalledWith('mod+k');
    expect(onRecord).toHaveBeenCalledWith('mod+k');
    expect(screen.getByRole('group')).toHaveAttribute(
      'data-recording',
      'false',
    );
  });

  it('bare modifier press does NOT commit', () => {
    const onChange = vi.fn();
    render(
      <KbdShortcutRecorder
        platform="mac"
        onChange={onChange}
      />,
    );
    fireEvent.focus(screen.getByRole('textbox'));
    fireEvent.keyDown(screen.getByRole('textbox'), {
      key: 'Meta',
      metaKey: true,
    });
    expect(onChange).not.toHaveBeenCalled();
  });

  it('collision blocks the commit + fires onCollision', () => {
    const onChange = vi.fn();
    const onCollision = vi.fn();
    render(
      <KbdShortcutRecorder
        platform="mac"
        collisions={['mod+k']}
        onChange={onChange}
        onCollision={onCollision}
      />,
    );
    fireEvent.focus(screen.getByRole('textbox'));
    fireEvent.keyDown(screen.getByRole('textbox'), {
      key: 'k',
      metaKey: true,
    });
    expect(onChange).not.toHaveBeenCalled();
    expect(onCollision).toHaveBeenCalledWith('mod+k', 'mod+k');
  });

  it('collision banner renders when controlled value collides', () => {
    render(
      <KbdShortcutRecorder
        platform="mac"
        value="mod+k"
        collisions={['mod+k']}
      />,
    );
    expect(screen.getByRole('alert')).toHaveTextContent(
      /conflicts/i,
    );
    expect(screen.getByRole('group')).toHaveAttribute(
      'data-has-collision',
      'true',
    );
  });

  it('errorText override replaces the default error copy', () => {
    render(
      <KbdShortcutRecorder
        platform="mac"
        value="mod+k"
        collisions={['mod+k']}
        errorText="Already in use"
      />,
    );
    expect(screen.getByText('Already in use')).toBeInTheDocument();
  });

  it('helperText renders only when no error is present', () => {
    const { rerender } = render(
      <KbdShortcutRecorder
        platform="mac"
        helperText="Press a combo"
      />,
    );
    expect(screen.getByText('Press a combo')).toBeInTheDocument();
    rerender(
      <KbdShortcutRecorder
        platform="mac"
        helperText="Press a combo"
        value="mod+k"
        collisions={['mod+k']}
      />,
    );
    expect(screen.queryByText('Press a combo')).toBeNull();
  });

  it('reset button hidden when value is empty', () => {
    render(<KbdShortcutRecorder />);
    expect(
      screen.queryByLabelText('Reset shortcut'),
    ).toBeNull();
  });

  it('reset button visible with a value + clears on click', () => {
    const onChange = vi.fn();
    render(
      <KbdShortcutRecorder
        platform="mac"
        value="mod+k"
        onChange={onChange}
      />,
    );
    fireEvent.click(screen.getByLabelText('Reset shortcut'));
    expect(onChange).toHaveBeenCalledWith('');
  });

  it('resetValue override controls the reset target', () => {
    const onChange = vi.fn();
    render(
      <KbdShortcutRecorder
        platform="mac"
        value="mod+k"
        onChange={onChange}
        resetValue="mod+/"
      />,
    );
    fireEvent.click(screen.getByLabelText('Reset shortcut'));
    expect(onChange).toHaveBeenCalledWith('mod+/');
  });

  it('showReset=false hides the reset button', () => {
    render(
      <KbdShortcutRecorder
        platform="mac"
        value="mod+k"
        showReset={false}
      />,
    );
    expect(
      screen.queryByLabelText('Reset shortcut'),
    ).toBeNull();
  });

  it('disabled blocks focus / click / key handling', () => {
    const onChange = vi.fn();
    render(
      <KbdShortcutRecorder
        platform="mac"
        onChange={onChange}
        disabled
      />,
    );
    const input = screen.getByRole('textbox');
    expect(input).toBeDisabled();
    fireEvent.click(input);
    expect(screen.getByRole('group')).toHaveAttribute(
      'data-recording',
      'false',
    );
  });

  it('data-empty mirrors the value', () => {
    const { rerender } = render(<KbdShortcutRecorder />);
    expect(screen.getByRole('group')).toHaveAttribute(
      'data-empty',
      'true',
    );
    rerender(
      <KbdShortcutRecorder platform="mac" value="mod+k" />,
    );
    expect(screen.getByRole('group')).toHaveAttribute(
      'data-empty',
      'false',
    );
  });

  it('showIcon=false hides the leading keyboard icon', () => {
    const { container } = render(
      <KbdShortcutRecorder showIcon={false} />,
    );
    expect(
      container.querySelector(
        '[data-section="kbd-shortcut-recorder-icon"]',
      ),
    ).toBeNull();
  });

  it('exposes a stable displayName', () => {
    expect(KbdShortcutRecorder.displayName).toBe(
      'KbdShortcutRecorder',
    );
  });

  it('forwards ref to the input button', () => {
    const ref = createRef<HTMLButtonElement>();
    render(<KbdShortcutRecorder ref={ref} />);
    expect(ref.current?.getAttribute('role')).toBe('textbox');
  });

  it('non-mapped key during recording is swallowed (no commit)', () => {
    const onChange = vi.fn();
    render(
      <KbdShortcutRecorder
        platform="mac"
        onChange={onChange}
      />,
    );
    fireEvent.focus(screen.getByRole('textbox'));
    fireEvent.keyDown(screen.getByRole('textbox'), {
      key: 'AudioVolumeUp',
    });
    expect(onChange).not.toHaveBeenCalled();
  });
});
