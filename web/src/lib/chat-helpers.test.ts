import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  stripAnsi,
  b64decode,
  makeId,
  formatTime,
  conversationToMessages,
  scrollbackToMessages,
  type ConversationShape,
} from './chat-helpers';

describe('stripAnsi', () => {
  it('returns an empty string unchanged', () => {
    expect(stripAnsi('')).toBe('');
  });

  it('returns plain text unchanged', () => {
    expect(stripAnsi('hello world')).toBe('hello world');
  });

  it('strips CSI color codes', () => {
    expect(stripAnsi('\x1b[31mred\x1b[0m')).toBe('red');
  });

  it('strips OSC sequences terminated by BEL', () => {
    expect(stripAnsi('\x1b]0;title here\x07after')).toBe('after');
  });

  it('strips OSC sequences terminated by ST (ESC backslash)', () => {
    expect(stripAnsi('\x1b]2;long-title\x1b\\rest')).toBe('rest');
  });

  it('strips charset-switch escape sequences (ESC + ( / ) / = / > with optional trailing letter)', () => {
    // ESC(0 and ESC(B are DEC charset switches: 3 chars each.
    expect(stripAnsi('a\x1b(0b\x1b(Bc')).toBe('abc');
  });

  it('converts a bare CR into a newline', () => {
    expect(stripAnsi('one\rtwo')).toBe('one\ntwo');
  });

  it('preserves CRLF (CR is not rewritten when followed by LF)', () => {
    expect(stripAnsi('one\r\ntwo')).toBe('one\ntwo');
  });

  it('drops control characters in the C0 / DEL ranges', () => {
    expect(stripAnsi('a\x00b\x08c\x7fd')).toBe('abcd');
  });

  it('keeps tab and newline characters intact', () => {
    expect(stripAnsi('a\tb\nc')).toBe('a\tb\nc');
  });
});

describe('b64decode', () => {
  it('decodes plain ASCII', () => {
    expect(b64decode('aGVsbG8=')).toBe('hello');
  });

  it('decodes UTF-8 multi-byte bytes back to original code points', () => {
    const original = 'café';
    const b64 =
      typeof Buffer !== 'undefined'
        ? Buffer.from(original, 'utf-8').toString('base64')
        : '';
    expect(b64decode(b64)).toBe(original);
  });

  it('returns empty string when the input is empty', () => {
    expect(b64decode('')).toBe('');
  });

  it('returns empty string on invalid base64', () => {
    expect(b64decode('not*base*64!!')).toBe('');
  });
});

describe('makeId', () => {
  it('begins with the supplied prefix followed by a dash', () => {
    const id = makeId('bk');
    expect(id.startsWith('bk-')).toBe(true);
  });

  it('produces a different id on each call', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 8; i++) seen.add(makeId('x'));
    expect(seen.size).toBe(8);
  });

  it('uses the deterministic timestamp middle segment from Date.now', () => {
    const spy = vi.spyOn(Date, 'now').mockReturnValue(1234567890);
    try {
      const id = makeId('pre');
      expect(id.startsWith('pre-1234567890-')).toBe(true);
    } finally {
      spy.mockRestore();
    }
  });
});

describe('formatTime', () => {
  it('zero-pads single-digit hour, minute, and second components', () => {
    const d = new Date();
    d.setHours(1, 2, 3, 0);
    expect(formatTime(d.getTime())).toBe('01:02:03');
  });

  it('renders midnight as 00:00:00', () => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    expect(formatTime(d.getTime())).toBe('00:00:00');
  });

  it('renders end-of-day as 23:59:59', () => {
    const d = new Date();
    d.setHours(23, 59, 59, 0);
    expect(formatTime(d.getTime())).toBe('23:59:59');
  });
});

describe('conversationToMessages', () => {
  it('returns an empty array for null', () => {
    expect(conversationToMessages(null)).toEqual([]);
  });

  it('returns an empty array for undefined', () => {
    expect(conversationToMessages(undefined)).toEqual([]);
  });

  it('returns an empty array when turns is missing', () => {
    expect(
      conversationToMessages({ sessionId: 's', turns: undefined as unknown as [] }),
    ).toEqual([]);
  });

  it('maps a user turn to a user message and trims surrounding whitespace', () => {
    const conv: ConversationShape = {
      sessionId: 's',
      turns: [
        {
          id: 't1',
          role: 'user',
          createdAt: '2026-01-02T03:04:05Z',
          content: '  hi there  ',
          toolName: null,
        },
      ],
    };
    const out = conversationToMessages(conv);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({
      id: 't1',
      role: 'user',
      text: 'hi there',
      source: 'backfill',
    });
  });

  it('maps an assistant turn to a worker message', () => {
    const conv: ConversationShape = {
      sessionId: 's',
      turns: [
        {
          id: 't2',
          role: 'assistant',
          createdAt: '2026-01-02T03:04:05Z',
          content: 'reply text',
          toolName: null,
        },
      ],
    };
    expect(conversationToMessages(conv)[0]?.role).toBe('worker');
  });

  it('renders a tool_use turn as a bracketed tool marker', () => {
    const conv: ConversationShape = {
      sessionId: 's',
      turns: [
        {
          id: 't3',
          role: 'tool_use',
          createdAt: null,
          content: '',
          toolName: 'Bash',
        },
      ],
    };
    expect(conversationToMessages(conv)[0]?.text).toBe('[tool: Bash]');
  });

  it('skips tool_use turns without a tool name', () => {
    const conv: ConversationShape = {
      sessionId: 's',
      turns: [
        { id: 't4', role: 'tool_use', createdAt: null, content: '', toolName: null },
      ],
    };
    expect(conversationToMessages(conv)).toEqual([]);
  });

  it('skips thinking / tool_result / system turns entirely', () => {
    const conv: ConversationShape = {
      sessionId: 's',
      turns: [
        { id: 't5', role: 'thinking', createdAt: null, content: 'inner', toolName: null },
        { id: 't6', role: 'tool_result', createdAt: null, content: 'out', toolName: null },
        { id: 't7', role: 'system', createdAt: null, content: 'meta', toolName: null },
      ],
    };
    expect(conversationToMessages(conv)).toEqual([]);
  });

  it('skips user / assistant turns whose content is empty or whitespace-only', () => {
    const conv: ConversationShape = {
      sessionId: 's',
      turns: [
        { id: 'u', role: 'user', createdAt: null, content: '   ', toolName: null },
        { id: 'a', role: 'assistant', createdAt: null, content: '', toolName: null },
      ],
    };
    expect(conversationToMessages(conv)).toEqual([]);
  });

  it('falls back to Date.now when createdAt is unparseable', () => {
    const spy = vi.spyOn(Date, 'now').mockReturnValue(999);
    try {
      const conv: ConversationShape = {
        sessionId: 's',
        turns: [
          {
            id: 'u',
            role: 'user',
            createdAt: 'not-a-date',
            content: 'hi',
            toolName: null,
          },
        ],
      };
      expect(conversationToMessages(conv)[0]?.ts).toBe(999);
    } finally {
      spy.mockRestore();
    }
  });

  it('parses a valid ISO createdAt into a millisecond timestamp', () => {
    const conv: ConversationShape = {
      sessionId: 's',
      turns: [
        {
          id: 'u',
          role: 'user',
          createdAt: '2026-01-02T03:04:05Z',
          content: 'hi',
          toolName: null,
        },
      ],
    };
    expect(conversationToMessages(conv)[0]?.ts).toBe(Date.parse('2026-01-02T03:04:05Z'));
  });
});

describe('scrollbackToMessages', () => {
  it('returns an empty array for empty input', () => {
    expect(scrollbackToMessages('')).toEqual([]);
  });

  it('collapses plain lines into a single worker message', () => {
    const out = scrollbackToMessages('line one\nline two\n');
    expect(out).toHaveLength(1);
    expect(out[0]?.role).toBe('worker');
    expect(out[0]?.text).toBe('line one\nline two');
  });

  it('splits on the "> " user-input prompt and emits a user bubble', () => {
    const out = scrollbackToMessages('hello\n> ask something\nresponse\n');
    expect(out).toHaveLength(3);
    expect(out[0]?.role).toBe('worker');
    expect(out[0]?.text).toBe('hello');
    expect(out[1]?.role).toBe('user');
    expect(out[1]?.text).toBe('ask something');
    expect(out[2]?.role).toBe('worker');
    expect(out[2]?.text).toBe('response');
  });

  it('emits multiple user bubbles when the prompt marker appears more than once', () => {
    const out = scrollbackToMessages('> q1\nreply 1\n> q2\nreply 2');
    const roles = out.map((m) => m.role);
    expect(roles).toEqual(['user', 'worker', 'user', 'worker']);
  });

  it('strips ANSI escape codes before splitting', () => {
    const raw = '\x1b[32m> question\x1b[0m\nbody';
    const out = scrollbackToMessages(raw);
    expect(out[0]?.role).toBe('user');
    expect(out[0]?.text).toBe('question');
    expect(out[1]?.text).toBe('body');
  });

  it('drops the trailing worker buffer when it is whitespace-only', () => {
    const out = scrollbackToMessages('> only ask\n   \n  ');
    expect(out).toHaveLength(1);
    expect(out[0]?.role).toBe('user');
  });

  it('uses a fresh id per bubble', () => {
    const out = scrollbackToMessages('one\n> q\ntwo');
    const ids = out.map((m) => m.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('makeId timestamp restore', () => {
  // Sanity: makeId behaviour is restored after the spy in formatTime tests
  // unmocked Date.now. Real-clock id should not start with the stubbed value.
  beforeEach(() => vi.useRealTimers());
  afterEach(() => vi.useRealTimers());

  it('produces a real-clock id after timer restoration', () => {
    const id = makeId('z');
    expect(id).not.toMatch(/^z-1234567890-/);
  });
});
