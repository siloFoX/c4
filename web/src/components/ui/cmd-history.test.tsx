import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { createRef } from 'react';
import {
  CmdHistory,
  ansiStyleToClassName,
  filterCmdHistory,
  formatCmdHistoryClipboard,
  parseAnsi,
} from './cmd-history';
import type { CmdHistoryEntry } from './cmd-history';

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

const ESC = '\x1b';

function entries(): CmdHistoryEntry[] {
  return [
    {
      id: '1',
      command: 'ls -la',
      output: 'file1\nfile2',
      exitCode: 0,
      timestamp: 1737209400000,
    },
    {
      id: '2',
      command: 'cat secret.txt',
      output: 'permission denied',
      exitCode: 1,
      timestamp: 1737209401000,
      cwd: '/etc',
    },
    {
      id: '3',
      command: 'echo hello',
      output: 'hello',
      exitCode: 0,
      timestamp: 1737209402000,
    },
  ];
}

describe('parseAnsi', () => {
  it('returns [] for empty input', () => {
    expect(parseAnsi('')).toEqual([]);
  });

  it('returns one segment with empty style for plain text', () => {
    const result = parseAnsi('hello world');
    expect(result).toEqual([{ text: 'hello world', style: {} }]);
  });

  it('emits a segment with fg color after CSI Nm', () => {
    const result = parseAnsi(`${ESC}[31mred${ESC}[0m`);
    expect(result).toHaveLength(1);
    expect(result[0]?.text).toBe('red');
    expect(result[0]?.style.fg).toBe('text-red-500');
  });

  it('emits a segment with bg color', () => {
    const result = parseAnsi(`${ESC}[42mgreenbg${ESC}[0m`);
    expect(result[0]?.style.bg).toBe('bg-emerald-500/30');
  });

  it('emits bold via code 1', () => {
    const result = parseAnsi(`${ESC}[1mbold${ESC}[0m`);
    expect(result[0]?.style.bold).toBe(true);
  });

  it('handles combined codes with semicolons', () => {
    const result = parseAnsi(`${ESC}[1;31mboldred${ESC}[0m`);
    expect(result[0]?.style.bold).toBe(true);
    expect(result[0]?.style.fg).toBe('text-red-500');
  });

  it('resets all attributes on 0', () => {
    const result = parseAnsi(`${ESC}[1;31mr${ESC}[0mn`);
    expect(result).toHaveLength(2);
    expect(result[0]?.style.fg).toBe('text-red-500');
    expect(result[1]?.style).toEqual({});
  });

  it('preserves text before any escape', () => {
    const result = parseAnsi(`pre${ESC}[31mred`);
    expect(result).toHaveLength(2);
    expect(result[0]?.text).toBe('pre');
    expect(result[1]?.text).toBe('red');
  });

  it('handles bright colors (90-97)', () => {
    const result = parseAnsi(`${ESC}[92mbrightgreen${ESC}[0m`);
    expect(result[0]?.style.fg).toBe('text-emerald-400');
  });

  it('emits italic + underline', () => {
    const result = parseAnsi(`${ESC}[3;4mboth${ESC}[0m`);
    expect(result[0]?.style.italic).toBe(true);
    expect(result[0]?.style.underline).toBe(true);
  });

  it('ignores unknown SGR codes', () => {
    const result = parseAnsi(`${ESC}[999mtext${ESC}[0m`);
    expect(result[0]?.style).toEqual({});
    expect(result[0]?.text).toBe('text');
  });

  it('clears fg with code 39', () => {
    const result = parseAnsi(`${ESC}[31mred${ESC}[39mreset`);
    expect(result).toHaveLength(2);
    expect(result[0]?.style.fg).toBe('text-red-500');
    expect(result[1]?.style.fg).toBeUndefined();
  });
});

describe('ansiStyleToClassName', () => {
  it('returns empty string for default style', () => {
    expect(ansiStyleToClassName({})).toBe('');
  });

  it('combines fg + bold + underline', () => {
    const cls = ansiStyleToClassName({
      fg: 'text-red-500',
      bold: true,
      underline: true,
    });
    expect(cls).toContain('text-red-500');
    expect(cls).toContain('font-bold');
    expect(cls).toContain('underline');
  });

  it('applies dim via opacity', () => {
    const cls = ansiStyleToClassName({ dim: true });
    expect(cls).toContain('opacity-60');
  });
});

describe('filterCmdHistory', () => {
  it('returns full array for empty query', () => {
    expect(filterCmdHistory(entries(), '')).toHaveLength(3);
  });

  it('matches command text case-insensitively', () => {
    expect(filterCmdHistory(entries(), 'LS')).toHaveLength(1);
  });

  it('matches output text', () => {
    expect(filterCmdHistory(entries(), 'denied')).toHaveLength(1);
  });

  it('matches cwd', () => {
    expect(filterCmdHistory(entries(), '/etc')).toHaveLength(1);
  });

  it('trims whitespace before matching', () => {
    expect(filterCmdHistory(entries(), '   echo  ')).toHaveLength(1);
  });

  it('returns [] when nothing matches', () => {
    expect(filterCmdHistory(entries(), 'zzz')).toHaveLength(0);
  });
});

describe('formatCmdHistoryClipboard', () => {
  const e: CmdHistoryEntry = {
    id: '1',
    command: 'ls',
    output: 'file1\nfile2',
    exitCode: 0,
  };

  it('returns just the command for target=command', () => {
    expect(formatCmdHistoryClipboard(e, 'command')).toBe('ls');
  });

  it('returns just the output for target=output', () => {
    expect(formatCmdHistoryClipboard(e, 'output')).toBe('file1\nfile2');
  });

  it('joins command + output with separator for target=both', () => {
    expect(formatCmdHistoryClipboard(e, 'both')).toBe(
      'ls\n---\nfile1\nfile2',
    );
  });

  it('returns empty string for missing output on target=output', () => {
    expect(
      formatCmdHistoryClipboard({ id: 'x', command: 'ls' }, 'output'),
    ).toBe('');
  });
});

describe('CmdHistory component', () => {
  it('renders region with default aria-label', () => {
    render(<CmdHistory entries={entries()} />);
    expect(screen.getByRole('region')).toHaveAttribute(
      'aria-label',
      'Command history',
    );
  });

  it('honors a custom ariaLabel', () => {
    render(
      <CmdHistory entries={entries()} ariaLabel="Bash sessions" />,
    );
    expect(screen.getByRole('region')).toHaveAttribute(
      'aria-label',
      'Bash sessions',
    );
  });

  it('renders one row per entry', () => {
    render(<CmdHistory entries={entries()} />);
    expect(screen.getAllByRole('listitem')).toHaveLength(3);
  });

  it('shows the counter "<filtered> / <total>"', () => {
    render(<CmdHistory entries={entries()} />);
    // 3 entries, none filtered -> "3 / 3"
    expect(screen.getByText('3 / 3')).toBeInTheDocument();
  });

  it('filters by command text via the search input', () => {
    render(<CmdHistory entries={entries()} />);
    fireEvent.change(
      screen.getByPlaceholderText('Search history...'),
      { target: { value: 'echo' } },
    );
    expect(screen.getAllByRole('listitem')).toHaveLength(1);
    expect(screen.getByText('1 / 3')).toBeInTheDocument();
  });

  it('uses a custom searchPlaceholder', () => {
    render(
      <CmdHistory entries={entries()} searchPlaceholder="Find..." />,
    );
    expect(screen.getByPlaceholderText('Find...')).toBeInTheDocument();
  });

  it('shows the emptyLabel when nothing matches', () => {
    render(<CmdHistory entries={entries()} />);
    fireEvent.change(
      screen.getByPlaceholderText('Search history...'),
      { target: { value: 'zzz-impossible' } },
    );
    expect(screen.getByText('No commands match')).toBeInTheDocument();
  });

  it('honors a custom emptyLabel', () => {
    render(
      <CmdHistory
        entries={entries()}
        emptyLabel={<span data-testid="empty">nada</span>}
      />,
    );
    fireEvent.change(
      screen.getByPlaceholderText('Search history...'),
      { target: { value: 'zzz' } },
    );
    expect(screen.getByTestId('empty')).toBeInTheDocument();
  });

  it('respects controlled query prop', () => {
    render(<CmdHistory entries={entries()} query="echo" />);
    expect(screen.getAllByRole('listitem')).toHaveLength(1);
  });

  it('controlled query: onQueryChange fires but value does not change', () => {
    const onQueryChange = vi.fn();
    render(
      <CmdHistory
        entries={entries()}
        query="echo"
        onQueryChange={onQueryChange}
      />,
    );
    fireEvent.change(
      screen.getByPlaceholderText('Search history...'),
      { target: { value: 'ls' } },
    );
    expect(onQueryChange).toHaveBeenCalledWith('ls');
    // controlled: still filters by 'echo' from the prop
    expect(screen.getAllByRole('listitem')).toHaveLength(1);
  });

  it('click on a row selects it', () => {
    const onSelectedIdChange = vi.fn();
    render(
      <CmdHistory
        entries={entries()}
        onSelectedIdChange={onSelectedIdChange}
      />,
    );
    fireEvent.click(screen.getAllByRole('listitem')[1]!);
    expect(onSelectedIdChange).toHaveBeenCalledWith('2');
  });

  it('selected row carries data-selected="true"', () => {
    render(
      <CmdHistory
        entries={entries()}
        defaultSelectedId="2"
      />,
    );
    expect(
      screen.getAllByRole('listitem')[1],
    ).toHaveAttribute('data-selected', 'true');
  });

  it('ArrowDown advances selection', () => {
    const onSelectedIdChange = vi.fn();
    render(
      <CmdHistory
        entries={entries()}
        defaultSelectedId="1"
        onSelectedIdChange={onSelectedIdChange}
      />,
    );
    fireEvent.keyDown(screen.getByRole('region'), { key: 'ArrowDown' });
    expect(onSelectedIdChange).toHaveBeenCalledWith('2');
  });

  it('ArrowUp moves selection back', () => {
    const onSelectedIdChange = vi.fn();
    render(
      <CmdHistory
        entries={entries()}
        defaultSelectedId="2"
        onSelectedIdChange={onSelectedIdChange}
      />,
    );
    fireEvent.keyDown(screen.getByRole('region'), { key: 'ArrowUp' });
    expect(onSelectedIdChange).toHaveBeenCalledWith('1');
  });

  it('Home jumps to first visible entry', () => {
    const onSelectedIdChange = vi.fn();
    render(
      <CmdHistory
        entries={entries()}
        defaultSelectedId="3"
        onSelectedIdChange={onSelectedIdChange}
      />,
    );
    fireEvent.keyDown(screen.getByRole('region'), { key: 'Home' });
    expect(onSelectedIdChange).toHaveBeenCalledWith('1');
  });

  it('End jumps to last visible entry', () => {
    const onSelectedIdChange = vi.fn();
    render(
      <CmdHistory
        entries={entries()}
        defaultSelectedId="1"
        onSelectedIdChange={onSelectedIdChange}
      />,
    );
    fireEvent.keyDown(screen.getByRole('region'), { key: 'End' });
    expect(onSelectedIdChange).toHaveBeenCalledWith('3');
  });

  it('renders an exit-code badge with data-status', () => {
    const { container } = render(<CmdHistory entries={entries()} />);
    const ok = container.querySelectorAll(
      '[data-section="cmd-history-exit-code"][data-status="ok"]',
    );
    const fail = container.querySelectorAll(
      '[data-section="cmd-history-exit-code"][data-status="fail"]',
    );
    expect(ok.length).toBe(2);
    expect(fail.length).toBe(1);
  });

  it('omits exit codes when showExitCodes=false', () => {
    const { container } = render(
      <CmdHistory entries={entries()} showExitCodes={false} />,
    );
    expect(
      container.querySelector('[data-section="cmd-history-exit-code"]'),
    ).toBeNull();
  });

  it('omits timestamps when showTimestamps=false', () => {
    const { container } = render(
      <CmdHistory entries={entries()} showTimestamps={false} />,
    );
    expect(
      container.querySelector('[data-section="cmd-history-timestamp"]'),
    ).toBeNull();
  });

  it('renderCommand override replaces the default command text', () => {
    render(
      <CmdHistory
        entries={entries()}
        renderCommand={(e) => (
          <span data-testid={`custom-${e.id}`}>{e.id}</span>
        )}
      />,
    );
    expect(screen.getByTestId('custom-1')).toBeInTheDocument();
  });

  it('Copy command button writes formatted text', async () => {
    const writeText = vi.fn((_text: string) => Promise.resolve());
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText },
      configurable: true,
      writable: true,
    });
    const onCopy = vi.fn();
    render(<CmdHistory entries={entries()} onCopy={onCopy} />);
    await act(async () => {
      fireEvent.click(
        screen.getAllByRole('button', { name: 'Copy command' })[0]!,
      );
    });
    expect(writeText).toHaveBeenCalledWith('ls -la');
    expect(onCopy).toHaveBeenCalledTimes(1);
    expect(onCopy.mock.calls[0]?.[1]).toBe('command');
  });

  it('Copy output button writes the output', async () => {
    const writeText = vi.fn((_text: string) => Promise.resolve());
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText },
      configurable: true,
      writable: true,
    });
    render(<CmdHistory entries={entries()} />);
    await act(async () => {
      fireEvent.click(
        screen.getAllByRole('button', { name: 'Copy output' })[0]!,
      );
    });
    expect(writeText).toHaveBeenCalledWith('file1\nfile2');
  });

  it('Copy both button writes command + separator + output', async () => {
    const writeText = vi.fn((_text: string) => Promise.resolve());
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText },
      configurable: true,
      writable: true,
    });
    render(<CmdHistory entries={entries()} />);
    await act(async () => {
      fireEvent.click(
        screen.getAllByRole('button', { name: 'Copy both' })[0]!,
      );
    });
    expect(writeText).toHaveBeenCalledWith('ls -la\n---\nfile1\nfile2');
  });

  it('omits the output + both copy buttons when no output exists', () => {
    render(
      <CmdHistory
        entries={[{ id: 'a', command: 'noop', exitCode: 0 }]}
      />,
    );
    expect(
      screen.getByRole('button', { name: 'Copy command' }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Copy output' }),
    ).toBeNull();
    expect(
      screen.queryByRole('button', { name: 'Copy both' }),
    ).toBeNull();
  });

  it('renders ANSI segments inside the output block', () => {
    const { container } = render(
      <CmdHistory
        entries={[
          {
            id: 'x',
            command: 'ls',
            output: `${ESC}[31mfail${ESC}[0m`,
          },
        ]}
      />,
    );
    const segments = container.querySelectorAll(
      '[data-section="cmd-history-output-segment"]',
    );
    expect(segments).toHaveLength(1);
    expect(segments[0]?.textContent).toBe('fail');
    expect(segments[0]?.className).toContain('text-red-500');
  });

  it('writes scroll position to localStorage when storageKey supplied', () => {
    const { container } = render(
      <CmdHistory entries={entries()} storageKey="myhist" />,
    );
    const scroll = container.querySelector(
      '[data-section="cmd-history-scroll"]',
    ) as HTMLDivElement;
    Object.defineProperty(scroll, 'scrollTop', {
      configurable: true,
      writable: true,
      value: 42,
    });
    fireEvent.scroll(scroll);
    expect(
      window.localStorage.getItem('cmd-history-scroll:myhist'),
    ).toBe('42');
  });

  it('restores scroll position from localStorage on mount', () => {
    window.localStorage.setItem('cmd-history-scroll:myhist', '120');
    const { container } = render(
      <CmdHistory entries={entries()} storageKey="myhist" />,
    );
    const scroll = container.querySelector(
      '[data-section="cmd-history-scroll"]',
    ) as HTMLDivElement;
    expect(scroll.scrollTop).toBe(120);
  });

  it('exposes data-section + data-entry-count + data-filtered-count on root', () => {
    const { container } = render(<CmdHistory entries={entries()} />);
    const root = container.querySelector(
      '[data-section="cmd-history"]',
    );
    expect(root).toHaveAttribute('data-entry-count', '3');
    expect(root).toHaveAttribute('data-filtered-count', '3');
  });

  it('shows cwd line when supplied', () => {
    const { container } = render(<CmdHistory entries={entries()} />);
    expect(
      container.querySelector('[data-section="cmd-history-cwd"]')
        ?.textContent,
    ).toContain('/etc');
  });

  it('exposes a stable displayName', () => {
    expect(CmdHistory.displayName).toBe('CmdHistory');
  });

  it('forwards refs to the root region', () => {
    const ref = createRef<HTMLDivElement>();
    render(<CmdHistory ref={ref} entries={entries()} />);
    expect(ref.current?.getAttribute('role')).toBe('region');
  });
});
