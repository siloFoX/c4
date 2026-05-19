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
  LOG_LEVELS,
  LogStream,
  filterLogEntries,
  formatLogTimestamp,
  getLogLevelClass,
  getLogLevelRank,
  highlightLogMatches,
  inLogTimeRange,
  parseAnsi,
} from './log-stream';
import type {
  LogEntry,
  LogLevel,
} from './log-stream';

afterEach(() => {
  cleanup();
});

const ENTRIES: LogEntry[] = [
  {
    id: '1',
    timestamp: '2026-05-19T10:00:00Z',
    level: 'info',
    message: 'server started',
    component: 'http',
  },
  {
    id: '2',
    timestamp: '2026-05-19T10:00:01Z',
    level: 'warn',
    message: 'slow response 1234ms',
    component: 'db',
  },
  {
    id: '3',
    timestamp: '2026-05-19T10:00:02Z',
    level: 'error',
    message: 'failed to connect',
    component: 'db',
    source: 'pool.ts:42',
  },
  {
    id: '4',
    timestamp: '2026-05-19T10:00:03Z',
    level: 'debug',
    message: 'cache miss for key=foo',
  },
];

// ---------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------

describe('LOG_LEVELS', () => {
  it('lists six levels in canonical order', () => {
    expect([...LOG_LEVELS]).toEqual([
      'trace',
      'debug',
      'info',
      'warn',
      'error',
      'fatal',
    ]);
  });
});

describe('getLogLevelRank', () => {
  it('returns the index of the level', () => {
    expect(getLogLevelRank('trace')).toBe(0);
    expect(getLogLevelRank('info')).toBe(2);
    expect(getLogLevelRank('fatal')).toBe(5);
  });
});

describe('getLogLevelClass', () => {
  it('returns a non-empty class per level', () => {
    for (const l of LOG_LEVELS) {
      expect(getLogLevelClass(l).length).toBeGreaterThan(0);
    }
  });
});

describe('formatLogTimestamp', () => {
  it('formats as HH:MM:SS.cs', () => {
    const ts = new Date('2026-05-19T10:11:12.345Z');
    // jsdom may run in a different TZ; test only the shape.
    const out = formatLogTimestamp(ts);
    expect(out).toMatch(/^\d{2}:\d{2}:\d{2}\.\d{2}$/);
  });
  it('empty for falsy / unparseable', () => {
    expect(formatLogTimestamp('')).toBe('');
    expect(formatLogTimestamp('not a date')).toBe('');
  });
  it('accepts Date / number / string', () => {
    expect(formatLogTimestamp(0)).toBe('');
    expect(formatLogTimestamp(Date.now())).toMatch(/^\d{2}:\d{2}:\d{2}\.\d{2}$/);
  });
});

describe('inLogTimeRange', () => {
  it('true when range is undefined', () => {
    expect(inLogTimeRange('2026-05-19T10:00:00Z', undefined)).toBe(
      true,
    );
  });
  it('honours start bound', () => {
    expect(
      inLogTimeRange('2026-05-19T09:00:00Z', {
        start: '2026-05-19T10:00:00Z',
      }),
    ).toBe(false);
    expect(
      inLogTimeRange('2026-05-19T11:00:00Z', {
        start: '2026-05-19T10:00:00Z',
      }),
    ).toBe(true);
  });
  it('honours end bound', () => {
    expect(
      inLogTimeRange('2026-05-19T13:00:00Z', {
        end: '2026-05-19T12:00:00Z',
      }),
    ).toBe(false);
    expect(
      inLogTimeRange('2026-05-19T11:30:00Z', {
        end: '2026-05-19T12:00:00Z',
      }),
    ).toBe(true);
  });
  it('honours both bounds together', () => {
    expect(
      inLogTimeRange('2026-05-19T10:30:00Z', {
        start: '2026-05-19T10:00:00Z',
        end: '2026-05-19T11:00:00Z',
      }),
    ).toBe(true);
    expect(
      inLogTimeRange('2026-05-19T11:30:00Z', {
        start: '2026-05-19T10:00:00Z',
        end: '2026-05-19T11:00:00Z',
      }),
    ).toBe(false);
  });
});

describe('filterLogEntries', () => {
  it('no options -> identical (filtered shallow copy)', () => {
    expect(
      filterLogEntries(ENTRIES).map((e) => e.id),
    ).toEqual(ENTRIES.map((e) => e.id));
  });
  it('level filter narrows the set', () => {
    const ids = filterLogEntries(ENTRIES, {
      enabledLevels: ['warn', 'error'] as LogLevel[],
    }).map((e) => e.id);
    expect(ids).toEqual(['2', '3']);
  });
  it('query matches against message / component / source', () => {
    expect(
      filterLogEntries(ENTRIES, { query: 'pool' }).map((e) => e.id),
    ).toEqual(['3']);
    expect(
      filterLogEntries(ENTRIES, { query: 'db' }).map((e) => e.id),
    ).toEqual(['2', '3']);
  });
  it('whitespace-only query is treated as empty', () => {
    expect(
      filterLogEntries(ENTRIES, { query: '   ' }).map((e) => e.id),
    ).toEqual(['1', '2', '3', '4']);
  });
  it('time range filter combines with level + query', () => {
    const out = filterLogEntries(ENTRIES, {
      enabledLevels: ['warn', 'error'] as LogLevel[],
      timeRange: {
        start: '2026-05-19T10:00:02Z',
        end: '2026-05-19T10:00:10Z',
      },
    });
    expect(out.map((e) => e.id)).toEqual(['3']);
  });
});

describe('parseAnsi', () => {
  it('returns single segment for plain text', () => {
    expect(parseAnsi('hello')).toEqual([{ text: 'hello' }]);
  });
  it('parses red foreground', () => {
    const segs = parseAnsi('\x1b[31mred\x1b[0mblack');
    expect(segs).toHaveLength(2);
    expect(segs[0]?.text).toBe('red');
    expect(segs[0]?.fgColor).toBeDefined();
    expect(segs[1]?.text).toBe('black');
    expect(segs[1]?.fgColor).toBeUndefined();
  });
  it('parses bold + green', () => {
    const segs = parseAnsi('\x1b[1;32mok\x1b[0m');
    expect(segs[0]?.bold).toBe(true);
    expect(segs[0]?.fgColor).toBeDefined();
  });
  it('parses background colors', () => {
    const segs = parseAnsi('\x1b[41mbg\x1b[0m');
    expect(segs[0]?.bgColor).toBeDefined();
  });
  it('handles italic + underline + dim', () => {
    const segs = parseAnsi('\x1b[2;3;4mfoo\x1b[0m');
    expect(segs[0]?.italic).toBe(true);
    expect(segs[0]?.underline).toBe(true);
    expect(segs[0]?.dim).toBe(true);
  });
  it('parses unknown codes as no-ops', () => {
    const segs = parseAnsi('\x1b[99mhello\x1b[0m');
    expect(segs[0]?.text).toBe('hello');
    expect(segs[0]?.fgColor).toBeUndefined();
  });
  it('bare ESC[m resets state', () => {
    const segs = parseAnsi('\x1b[31mred\x1b[mafter');
    expect(segs[0]?.fgColor).toBeDefined();
    expect(segs[1]?.fgColor).toBeUndefined();
  });
  it('empty input -> empty array', () => {
    expect(parseAnsi('')).toEqual([]);
  });
});

describe('highlightLogMatches', () => {
  it('returns input when query is empty', () => {
    const { container } = render(
      <div>{highlightLogMatches('hello', '')}</div>,
    );
    expect(container.querySelectorAll('mark').length).toBe(0);
  });
  it('wraps matches in mark (case-insensitive)', () => {
    const { container } = render(
      <div>{highlightLogMatches('Hello hello', 'hello')}</div>,
    );
    const marks = container.querySelectorAll('mark');
    expect(marks.length).toBe(2);
    expect(marks[0]?.textContent).toBe('Hello');
  });
  it('escapes regex special chars in the query', () => {
    const { container } = render(
      <div>{highlightLogMatches('cost is $10', '$10')}</div>,
    );
    expect(container.querySelector('mark')?.textContent).toBe('$10');
  });
});

// ---------------------------------------------------------------
// Component
// ---------------------------------------------------------------

describe('LogStream component', () => {
  it('renders a region with default aria-label', () => {
    render(<LogStream entries={ENTRIES} />);
    expect(screen.getByRole('region')).toHaveAttribute(
      'aria-label',
      'Log stream',
    );
  });

  it('honors custom ariaLabel', () => {
    render(
      <LogStream entries={ENTRIES} ariaLabel="App logs" />,
    );
    expect(screen.getByRole('region')).toHaveAttribute(
      'aria-label',
      'App logs',
    );
  });

  it('renders one row per filtered entry by default', () => {
    const { container } = render(<LogStream entries={ENTRIES} />);
    expect(
      container.querySelectorAll(
        '[data-section="log-stream-entry"]',
      ).length,
    ).toBe(4);
  });

  it('per-entry data-level mirrors the entry.level', () => {
    const { container } = render(<LogStream entries={ENTRIES} />);
    const rows = container.querySelectorAll(
      '[data-section="log-stream-entry"]',
    );
    expect(rows[0]?.getAttribute('data-level')).toBe('info');
    expect(rows[2]?.getAttribute('data-level')).toBe('error');
  });

  it('level toggle deactivates a level + fires onChange', () => {
    const onEnabledLevelsChange = vi.fn();
    render(
      <LogStream
        entries={ENTRIES}
        onEnabledLevelsChange={onEnabledLevelsChange}
      />,
    );
    fireEvent.click(
      screen.getByRole('switch', { name: 'info' }),
    );
    expect(onEnabledLevelsChange).toHaveBeenCalled();
    const next = onEnabledLevelsChange.mock.calls[0]![0] as LogLevel[];
    expect(next).not.toContain('info');
  });

  it('search input narrows the visible rows', () => {
    const { container } = render(<LogStream entries={ENTRIES} />);
    fireEvent.change(
      screen.getByLabelText('Filter log entries'),
      { target: { value: 'pool' } },
    );
    const rows = container.querySelectorAll(
      '[data-section="log-stream-entry"]',
    );
    expect(rows.length).toBe(1);
  });

  it('search highlights query in the message', () => {
    const { container } = render(<LogStream entries={ENTRIES} />);
    fireEvent.change(
      screen.getByLabelText('Filter log entries'),
      { target: { value: 'connect' } },
    );
    const marks = container.querySelectorAll(
      '[data-section="log-stream-mark"]',
    );
    expect(marks.length).toBeGreaterThan(0);
  });

  it('pause button toggles aria-label + data-paused', () => {
    render(<LogStream entries={ENTRIES} />);
    const region = screen.getByRole('region');
    expect(region).toHaveAttribute('data-paused', 'false');
    fireEvent.click(screen.getByLabelText('Pause stream'));
    expect(region).toHaveAttribute('data-paused', 'true');
    expect(
      screen.getByLabelText('Resume stream'),
    ).toBeInTheDocument();
  });

  it('controlled isPaused pins the state', () => {
    const { rerender } = render(
      <LogStream entries={ENTRIES} isPaused />,
    );
    expect(screen.getByRole('region')).toHaveAttribute(
      'data-paused',
      'true',
    );
    rerender(<LogStream entries={ENTRIES} isPaused={false} />);
    expect(screen.getByRole('region')).toHaveAttribute(
      'data-paused',
      'false',
    );
  });

  it('controlled query pins the search input', () => {
    render(<LogStream entries={ENTRIES} query="db" />);
    expect(
      (screen.getByLabelText('Filter log entries') as HTMLInputElement)
        .value,
    ).toBe('db');
  });

  it('time range start filters out earlier entries', () => {
    const { container } = render(
      <LogStream
        entries={ENTRIES}
        defaultTimeRange={{ start: '2026-05-19T10:00:02Z' }}
      />,
    );
    const rows = container.querySelectorAll(
      '[data-section="log-stream-entry"]',
    );
    // entry 1 + 2 filtered out (before 10:00:02)
    expect(rows.length).toBe(2);
  });

  it('time range end filters out later entries', () => {
    const { container } = render(
      <LogStream
        entries={ENTRIES}
        defaultTimeRange={{ end: '2026-05-19T10:00:01Z' }}
      />,
    );
    const rows = container.querySelectorAll(
      '[data-section="log-stream-entry"]',
    );
    // entries 3 + 4 filtered out
    expect(rows.length).toBe(2);
  });

  it('clearing time range start re-shows earlier entries', () => {
    const onTimeRangeChange = vi.fn();
    render(
      <LogStream
        entries={ENTRIES}
        defaultTimeRange={{ start: '2026-05-19T10:00:02Z' }}
        onTimeRangeChange={onTimeRangeChange}
      />,
    );
    fireEvent.change(
      screen.getByLabelText('Filter logs after'),
      { target: { value: '' } },
    );
    expect(onTimeRangeChange).toHaveBeenCalledWith({});
  });

  it('per-entry component tag renders when supplied', () => {
    render(<LogStream entries={ENTRIES} />);
    expect(screen.getByText('[http]')).toBeInTheDocument();
  });

  it('per-entry source tag renders when supplied', () => {
    render(<LogStream entries={ENTRIES} />);
    expect(screen.getByText('pool.ts:42')).toBeInTheDocument();
  });

  it('empty entries renders the empty state', () => {
    render(<LogStream entries={[]} />);
    expect(screen.getByText('No log entries')).toBeInTheDocument();
  });

  it('custom emptyState slot wins', () => {
    render(
      <LogStream entries={[]} emptyState="Stream is quiet" />,
    );
    expect(
      screen.getByText('Stream is quiet'),
    ).toBeInTheDocument();
  });

  it('ANSI-colored message renders one segment per code', () => {
    const entries: LogEntry[] = [
      {
        id: 'ansi',
        timestamp: '2026-05-19T10:00:00Z',
        level: 'info',
        message: '\x1b[31mred\x1b[0m plain \x1b[1mbold\x1b[0m',
      },
    ];
    const { container } = render(<LogStream entries={entries} />);
    const segs = container.querySelectorAll(
      '[data-section="log-stream-entry-segment"]',
    );
    expect(segs.length).toBeGreaterThanOrEqual(3);
  });

  it('clear button fires onClear when supplied + showClear', () => {
    const onClear = vi.fn();
    render(
      <LogStream
        entries={ENTRIES}
        showClear
        onClear={onClear}
      />,
    );
    fireEvent.click(screen.getByLabelText('Clear log stream'));
    expect(onClear).toHaveBeenCalled();
  });

  it('clear button hidden when showClear=false', () => {
    render(<LogStream entries={ENTRIES} onClear={() => {}} />);
    expect(
      screen.queryByLabelText('Clear log stream'),
    ).toBeNull();
  });

  it('root data attrs mirror state', () => {
    render(
      <LogStream
        entries={ENTRIES}
        defaultEnabledLevels={['error']}
      />,
    );
    const region = screen.getByRole('region');
    expect(region).toHaveAttribute('data-entry-count', '4');
    expect(region).toHaveAttribute('data-filtered-count', '1');
  });

  it('search input opt-out hides the search field', () => {
    const { container } = render(
      <LogStream entries={ENTRIES} showSearch={false} />,
    );
    expect(
      container.querySelector('[data-section="log-stream-search"]'),
    ).toBeNull();
  });

  it('time-range opt-out hides the from/to inputs', () => {
    const { container } = render(
      <LogStream entries={ENTRIES} showTimeRange={false} />,
    );
    expect(
      container.querySelector(
        '[data-section="log-stream-time-range"]',
      ),
    ).toBeNull();
  });

  it('list max-height applies as inline style', () => {
    const { container } = render(
      <LogStream entries={ENTRIES} maxHeight={500} />,
    );
    const list = container.querySelector(
      '[data-section="log-stream-list"]',
    ) as HTMLElement;
    expect(list.style.maxHeight).toBe('500px');
  });

  it('forwards ref to the list scroll container', () => {
    const ref = createRef<HTMLDivElement>();
    render(<LogStream ref={ref} entries={ENTRIES} />);
    expect(ref.current?.getAttribute('data-section')).toBe(
      'log-stream-list',
    );
  });

  it('exposes a stable displayName', () => {
    expect(LogStream.displayName).toBe('LogStream');
  });

  it('auto-scrolls when new entries arrive (unpaused)', () => {
    const { rerender, container } = render(
      <LogStream entries={ENTRIES.slice(0, 2)} maxHeight={50} />,
    );
    const list = container.querySelector(
      '[data-section="log-stream-list"]',
    ) as HTMLDivElement;
    Object.defineProperty(list, 'scrollHeight', {
      configurable: true,
      value: 500,
    });
    // bump scrollTop to a small value first
    list.scrollTop = 0;
    rerender(<LogStream entries={ENTRIES} maxHeight={50} />);
    expect(list.scrollTop).toBe(500);
  });

  it('does NOT auto-scroll when paused', () => {
    const { rerender, container } = render(
      <LogStream
        entries={ENTRIES.slice(0, 2)}
        maxHeight={50}
        isPaused
      />,
    );
    const list = container.querySelector(
      '[data-section="log-stream-list"]',
    ) as HTMLDivElement;
    Object.defineProperty(list, 'scrollHeight', {
      configurable: true,
      value: 500,
    });
    list.scrollTop = 10;
    rerender(
      <LogStream entries={ENTRIES} maxHeight={50} isPaused />,
    );
    expect(list.scrollTop).toBe(10);
  });
});
