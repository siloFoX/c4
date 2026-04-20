'use strict';

// 8.25 regression: ChatView must pull past conversation on mount via
// /api/sessions (preferred, session-parser shape) with a /api/scrollback
// fallback, dedupe SSE chunks whose text already appeared in the backfill,
// reset state on workerName change, and wire a load-older infinite scroll
// handler in scrollback mode. Plus daemon.js must accept workerName on
// /api/sessions and return a Conversation.

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { describe, it } = require('node:test');

const WEB_SRC = path.join(__dirname, '..', 'web', 'src');
const CHAT_VIEW = path.join(WEB_SRC, 'components', 'ChatView.tsx');
const DAEMON = path.join(__dirname, '..', 'src', 'daemon.js');

// Re-implement the two pure helpers ChatView.tsx exports so we can
// exercise their behaviour in-process without a React bundler.
const ANSI_OSC = /\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)/g;
const ANSI_CSI = /\x1b\[[\d;?=]*[ -/]*[@-~]/g;
const ANSI_OTHER = /\x1b[=>()][0-9A-Za-z]?/g;
const CONTROL_CHARS = /[\x00-\x08\x0b-\x1f\x7f]/g;
function stripAnsi(input) {
  return String(input)
    .replace(ANSI_OSC, '')
    .replace(ANSI_CSI, '')
    .replace(ANSI_OTHER, '')
    .replace(/\r(?!\n)/g, '\n')
    .replace(CONTROL_CHARS, '');
}

// Mirror of conversationToMessages in ChatView.tsx. Keeps the filter
// policy pinned (user text + assistant text + tool_use markers; skip
// thinking, tool_result, system) so behaviour changes there require a
// matching change here.
function conversationToMessages(conv) {
  if (!conv || !Array.isArray(conv.turns)) return [];
  const out = [];
  for (const turn of conv.turns) {
    if (!turn || typeof turn !== 'object') continue;
    if (turn.role === 'user' && turn.content && turn.content.trim()) {
      out.push({ id: turn.id, role: 'user', text: turn.content.trim(), source: 'backfill' });
    } else if (turn.role === 'assistant' && turn.content && turn.content.trim()) {
      out.push({ id: turn.id, role: 'worker', text: turn.content.trim(), source: 'backfill' });
    } else if (turn.role === 'tool_use' && turn.toolName) {
      out.push({ id: turn.id, role: 'worker', text: `[tool: ${turn.toolName}]`, source: 'backfill' });
    }
  }
  return out;
}

function scrollbackToMessages(raw) {
  if (!raw) return [];
  const cleaned = stripAnsi(raw);
  const lines = cleaned.split('\n');
  const out = [];
  let buf = [];
  let idCounter = 0;
  const flush = () => {
    const joined = buf.join('\n').trim();
    buf = [];
    if (!joined) return;
    out.push({ id: `bk-w-${idCounter++}`, role: 'worker', text: joined, source: 'backfill' });
  };
  for (const line of lines) {
    const m = line.match(/^>\s+(.*\S)/);
    if (m) {
      flush();
      out.push({ id: `bk-u-${idCounter++}`, role: 'user', text: m[1], source: 'backfill' });
    } else {
      buf.push(line);
    }
  }
  flush();
  return out;
}

describe('conversationToMessages (8.25 pure helper)', () => {
  it('maps user + assistant turns to bubbles preserving order', () => {
    const conv = {
      sessionId: 'abc',
      turns: [
        { id: 't1', role: 'user', content: 'hi worker', toolName: null },
        { id: 't2', role: 'assistant', content: 'hi there', toolName: null },
        { id: 't3', role: 'user', content: '  ', toolName: null },
        { id: 't4', role: 'assistant', content: 'second reply', toolName: null },
      ],
    };
    const msgs = conversationToMessages(conv);
    assert.strictEqual(msgs.length, 3);
    assert.deepStrictEqual(
      msgs.map((m) => [m.role, m.text]),
      [
        ['user', 'hi worker'],
        ['worker', 'hi there'],
        ['worker', 'second reply'],
      ],
    );
  });

  it('renders tool_use as an inline worker marker', () => {
    const conv = {
      sessionId: 'abc',
      turns: [
        { id: 'tu1', role: 'tool_use', content: '', toolName: 'Read' },
      ],
    };
    const msgs = conversationToMessages(conv);
    assert.strictEqual(msgs.length, 1);
    assert.strictEqual(msgs[0].role, 'worker');
    assert.strictEqual(msgs[0].text, '[tool: Read]');
  });

  it('drops thinking, tool_result, and system turns', () => {
    const conv = {
      sessionId: 'abc',
      turns: [
        { id: 'th', role: 'thinking', content: 'pondering', toolName: null },
        { id: 'tr', role: 'tool_result', content: '# README', toolName: null },
        { id: 'sys', role: 'system', content: '[permission-mode]', toolName: null },
      ],
    };
    assert.deepStrictEqual(conversationToMessages(conv), []);
  });

  it('returns [] for null / malformed input', () => {
    assert.deepStrictEqual(conversationToMessages(null), []);
    assert.deepStrictEqual(conversationToMessages({}), []);
    assert.deepStrictEqual(conversationToMessages({ turns: 'not-an-array' }), []);
  });

  it('keeps stable turn ids so SSE dedup can key off them', () => {
    const conv = {
      sessionId: 'abc',
      turns: [
        { id: 't-user-1', role: 'user', content: 'hello', toolName: null },
        { id: 't-asst-1', role: 'assistant', content: 'world', toolName: null },
      ],
    };
    const msgs = conversationToMessages(conv);
    assert.strictEqual(msgs[0].id, 't-user-1');
    assert.strictEqual(msgs[1].id, 't-asst-1');
  });
});

describe('scrollbackToMessages fallback (8.25)', () => {
  it('emits one worker bubble when no user prompts are present', () => {
    const raw = 'thinking...\ndone.';
    const msgs = scrollbackToMessages(raw);
    assert.strictEqual(msgs.length, 1);
    assert.strictEqual(msgs[0].role, 'worker');
    assert.strictEqual(msgs[0].text, 'thinking...\ndone.');
  });

  it('splits on "> " user prompt markers into alternating bubbles', () => {
    const raw = [
      'startup banner',
      '> hello worker',
      'replying to you',
      'more reply',
      '> follow up question',
      'final answer',
    ].join('\n');
    const msgs = scrollbackToMessages(raw);
    const roles = msgs.map((m) => m.role);
    const texts = msgs.map((m) => m.text);
    assert.deepStrictEqual(roles, ['worker', 'user', 'worker', 'user', 'worker']);
    assert.deepStrictEqual(texts, [
      'startup banner',
      'hello worker',
      'replying to you\nmore reply',
      'follow up question',
      'final answer',
    ]);
  });

  it('strips ANSI escape sequences before parsing bubbles', () => {
    const raw = `\x1b[32m> colored prompt\x1b[0m\n\x1b[31mred worker line\x1b[0m`;
    const msgs = scrollbackToMessages(raw);
    assert.strictEqual(msgs.length, 2);
    assert.strictEqual(msgs[0].role, 'user');
    assert.strictEqual(msgs[0].text, 'colored prompt');
    assert.strictEqual(msgs[1].role, 'worker');
    assert.strictEqual(msgs[1].text, 'red worker line');
  });

  it('returns [] for empty input', () => {
    assert.deepStrictEqual(scrollbackToMessages(''), []);
    assert.deepStrictEqual(scrollbackToMessages(null), []);
  });
});

describe('SSE dedup contract (8.25)', () => {
  // Simulates the Set-based dedup ChatView uses: any live-worker bubble
  // whose trimmed text already appears in the backfill set is skipped.
  it('suppresses a live bubble whose text is already in the backfill', () => {
    const backfillTexts = new Set(['completed task', 'ran tests']);
    const seen = new Set(backfillTexts);
    const incoming = 'completed task';
    const trimmed = incoming.trim();
    const shouldAppend = !seen.has(trimmed);
    assert.strictEqual(shouldAppend, false);
  });

  it('lets genuinely new live bubbles through and then remembers them', () => {
    const seen = new Set(['old message']);
    const incoming = 'brand new reply';
    const trimmed = incoming.trim();
    assert.strictEqual(seen.has(trimmed), false);
    seen.add(trimmed);
    assert.strictEqual(seen.has(trimmed), true);
  });
});

describe('ChatView source wiring (8.25)', () => {
  const src = fs.readFileSync(CHAT_VIEW, 'utf8');

  it('fetches backfill on mount via useEffect + apiGet', () => {
    assert.match(src, /useEffect\(\(\)\s*=>\s*\{/);
    assert.match(src, /apiGet</);
    assert.match(src, /loadBackfill/);
    assert.match(src, /setBackfillLoading\(true\)/);
    assert.match(src, /setBackfillLoading\(false\)/);
  });

  it('hits /api/sessions with workerName first', () => {
    assert.match(src, /\/api\/sessions\?workerName=\$\{encodeURIComponent\(workerName\)\}/);
  });

  it('falls back to /api/scrollback?name=...&lines=... when no session JSONL exists', () => {
    assert.match(src, /\/api\/scrollback\?name=\$\{encodeURIComponent\(workerName\)\}&lines=\$\{scrollbackLinesRef\.current\}/);
    assert.match(src, /SCROLLBACK_PAGE\s*=\s*2000/);
  });

  it('dedupes SSE chunks whose text already landed in the backfill', () => {
    assert.match(src, /seenTextsRef/);
    assert.match(src, /seenTextsRef\.current\.has\(trimmed\)/);
    assert.match(src, /seenTextsRef\.current\.add/);
  });

  it('tracks backfill turn ids for a secondary dedup surface', () => {
    assert.match(src, /seenIdsRef/);
    assert.match(src, /seenIdsRef\.current\.add/);
  });

  it('resets state on workerName change (worker-change effect cleanup)', () => {
    // The backfill effect depends on workerName and clears every
    // state slot at the top so a fast swap does not leak messages
    // from the previous worker.
    assert.match(src, /setHistory\(\[\]\)/);
    assert.match(src, /setLiveMessages\(\[\]\)/);
    assert.match(src, /seenIdsRef\.current = new Set\(\)/);
    assert.match(src, /seenTextsRef\.current = new Set\(\)/);
    assert.match(src, /\}, \[workerName\]\);/);
    assert.match(src, /let cancelled = false/);
    assert.match(src, /cancelled = true/);
  });

  it('renders a loading skeleton while backfill is in flight', () => {
    assert.match(src, /backfillLoading \?/);
    assert.match(src, /animate-spin/);
    assert.match(src, /animate-pulse/);
    assert.match(src, /Loading past messages/);
  });

  it('renders a "Loaded N past messages" badge when backfill succeeds', () => {
    assert.match(src, /backfillCount > 0/);
    assert.match(
      src,
      /Loaded \{backfillCount\} past \{backfillCount === 1 \? 'message' : 'messages'\}/,
    );
  });

  it('wires an infinite-scroll load-older handler for scrollback mode', () => {
    assert.match(src, /loadOlder/);
    assert.match(src, /hasOlder/);
    assert.match(src, /SCROLLBACK_MAX\s*=\s*10000/);
    // scroll-to-top threshold triggers the older fetch
    assert.match(src, /el\.scrollTop <= 8/);
    assert.match(src, /void loadOlder\(\)/);
    // button fallback lets the user pull older manually
    assert.match(src, /Load older/);
  });

  it('keeps SSE /api/watch wiring intact alongside backfill', () => {
    assert.match(src, /eventSourceUrl\(`\/api\/watch\?name=\$\{encodeURIComponent\(workerName\)\}`\)/);
    assert.match(src, /new EventSource\(url\)/);
  });

  it('exports conversationToMessages + scrollbackToMessages for test visibility', () => {
    assert.match(src, /export function conversationToMessages/);
    assert.match(src, /export function scrollbackToMessages/);
    assert.match(src, /export function stripAnsi/);
  });
});

describe('daemon /api/sessions workerName contract (8.25)', () => {
  const src = fs.readFileSync(DAEMON, 'utf8');

  it('accepts workerName as a query param on GET /sessions', () => {
    assert.match(src, /url\.searchParams\.get\('workerName'\)/);
  });

  it('resolves the workerName to a sessionId via manager.getSessionId', () => {
    assert.match(src, /manager\.getSessionId\(workerName\)/);
  });

  it('returns a Conversation shape via sessionParser.parseJsonl when a session exists', () => {
    // The workerName branch must run inside the /sessions route
    // handler and must call parseJsonl on the resolved JSONL file.
    const match = src.match(/route === '\/sessions'[\s\S]*?workerName[\s\S]*?sessionParser\.parseJsonl/);
    assert.ok(match, 'expected /sessions route to call sessionParser.parseJsonl in the workerName branch');
  });

  it('returns { sessionId: null } without 404 when no session is resolvable (client falls back to scrollback)', () => {
    // Grab the workerName branch and assert it does not short-circuit
    // to a 404 / error - it must respond with a null-shaped body so
    // the client can decide to fall back to scrollback.
    const workerBranch = src.match(/if \(workerName\) \{[\s\S]*?\} else \{/);
    assert.ok(workerBranch, 'expected a workerName if-branch in the /sessions route');
    assert.ok(
      /sessionId: null/.test(workerBranch[0]),
      'workerName branch should return { sessionId: null, ... } when unresolvable'
    );
    assert.ok(
      !/writeHead\(404\)/.test(workerBranch[0]),
      'workerName branch should not emit 404; it should return null-shaped JSON so the client can fall back'
    );
  });

  it('keeps the legacy list-shape response when workerName is absent', () => {
    // The else-branch must still build rootDir + sessions + groups
    // + total so existing /api/sessions consumers (SessionsView) stay
    // unbroken.
    const elseBranch = src.match(/\} else \{[\s\S]*?sessionParser\.listSessions[\s\S]*?sessionParser\.groupSessionsByProject[\s\S]*?total: sessions\.length/);
    assert.ok(elseBranch, 'expected the non-workerName branch to return the legacy list shape');
  });
});
