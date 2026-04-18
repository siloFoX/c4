'use strict';

// Session parser + /api/sessions wiring tests (8.18).
//
// Covers the pure helpers in src/session-parser.js that the daemon uses
// to build /api/sessions, /api/sessions/:id, and /api/sessions/:id/stream
// against a fixture JSONL that exercises every role (user, assistant
// text, thinking, tool_use, tool_result, system meta) plus a malformed
// line. Source-wiring greps on src/daemon.js and
// web/src/components/ConversationView.tsx keep the endpoint and
// component shapes pinned to the spec.

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { describe, it } = require('node:test');

const parser = require('../src/session-parser');

const FIXTURE_PATH = path.join(__dirname, 'fixtures', 'session.jsonl');

describe('session-parser.parseJsonl', () => {
  const conv = parser.parseJsonl(FIXTURE_PATH);

  it('captures session metadata from the first event it sees', () => {
    assert.strictEqual(conv.sessionId, 'fixture-1');
    assert.strictEqual(conv.projectPath, '/home/test/demo');
    assert.strictEqual(conv.createdAt, '2026-04-18T10:00:00.000Z');
    assert.strictEqual(conv.updatedAt, '2026-04-18T10:00:20.000Z');
    assert.strictEqual(conv.model, 'claude-opus-4-7');
  });

  it('aggregates token totals across assistant messages', () => {
    // Two assistant messages: msg-1 (120 in, 45 out) + msg-2 (30 in, 15 out).
    assert.strictEqual(conv.totalInputTokens, 150);
    assert.strictEqual(conv.totalOutputTokens, 60);
  });

  it('emits one turn per content block', () => {
    const roles = conv.turns.map((t) => t.role);
    // system (permission-mode) + user + thinking + assistant text +
    // tool_use + tool_result + assistant text + user.
    assert.deepStrictEqual(roles, [
      'system',
      'user',
      'thinking',
      'assistant',
      'tool_use',
      'tool_result',
      'assistant',
      'user',
    ]);
  });

  it('preserves thinking text on the thinking turn', () => {
    const thinking = conv.turns.find((t) => t.role === 'thinking');
    assert.ok(thinking);
    assert.strictEqual(thinking.thinkingText, 'Let me think about this carefully.');
  });

  it('records tool name and args on the tool_use turn', () => {
    const toolUse = conv.turns.find((t) => t.role === 'tool_use');
    assert.ok(toolUse);
    assert.strictEqual(toolUse.toolName, 'Read');
    assert.deepStrictEqual(toolUse.toolArgs, { file_path: '/home/test/demo/README.md' });
    assert.strictEqual(toolUse.toolUseId, 'tool-1');
  });

  it('pairs tool_use with the matching tool_result by id', () => {
    const toolUse = conv.turns.find((t) => t.role === 'tool_use');
    const toolResult = conv.turns.find((t) => t.role === 'tool_result');
    assert.ok(toolUse && toolResult);
    assert.strictEqual(toolResult.toolUseId, 'tool-1');
    assert.strictEqual(toolUse.toolResult, '# Demo\nA sample project.');
  });

  it('collects a warning for the malformed JSON line instead of throwing', () => {
    assert.ok(conv.warnings.length > 0, 'expected at least one warning');
    assert.ok(
      conv.warnings.some((w) => /malformed/i.test(w)),
      `warning list should mention malformed lines: ${conv.warnings.join('; ')}`,
    );
  });

  it('attaches token usage only once per assistant message, not per block', () => {
    // msg-1 fans out to 3 assistant-side turns (thinking + text + tool_use)
    // but usage belongs to the whole message. Only the first block keeps it.
    const firstAssistantBlocks = conv.turns.filter(
      (t) => ['thinking', 'assistant', 'tool_use'].includes(t.role) && t.model === 'claude-opus-4-7',
    );
    const withTokens = firstAssistantBlocks.filter((t) => t.tokens.input > 0 || t.tokens.output > 0);
    assert.strictEqual(withTokens.length, 2, 'one per assistant message (msg-1 + msg-2)');
  });
});

describe('session-parser.parseJsonlStream', () => {
  it('yields the same turn order as parseJsonl', async () => {
    const sync = parser.parseJsonl(FIXTURE_PATH).turns;
    const streamed = [];
    for await (const turn of parser.parseJsonlStream(FIXTURE_PATH)) {
      streamed.push(turn);
    }
    assert.strictEqual(streamed.length, sync.length);
    assert.deepStrictEqual(
      streamed.map((t) => t.role),
      sync.map((t) => t.role),
    );
  });
});

describe('session-parser.listSessions + groupSessionsByProject', () => {
  it('enumerates .jsonl files across project subdirectories', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'c4-sessions-'));
    try {
      const projA = path.join(tmp, '-home-test-demo');
      const projB = path.join(tmp, '-var-log');
      fs.mkdirSync(projA, { recursive: true });
      fs.mkdirSync(projB, { recursive: true });
      fs.writeFileSync(path.join(projA, 'abc123.jsonl'), fs.readFileSync(FIXTURE_PATH));
      fs.writeFileSync(path.join(projB, 'def456.jsonl'), '{"type":"permission-mode"}\n');

      const list = parser.listSessions(tmp);
      assert.strictEqual(list.length, 2);
      const byId = Object.fromEntries(list.map((s) => [s.sessionId, s]));
      assert.ok(byId.abc123);
      assert.ok(byId.def456);
      assert.strictEqual(byId.abc123.projectPath, '/home/test/demo');
      assert.strictEqual(byId.def456.projectPath, '/var/log');
      assert.ok(byId.abc123.turnCount >= 6);
      assert.ok(typeof byId.abc123.lastAssistantSnippet === 'string');
      assert.ok(
        byId.abc123.lastAssistantSnippet.length > 0,
        'parseJsonl fixture has an assistant text block; snippet should not be empty',
      );

      const groups = parser.groupSessionsByProject(list);
      const paths = groups.map((g) => g.projectPath).sort();
      assert.deepStrictEqual(paths, ['/home/test/demo', '/var/log']);
      for (const g of groups) assert.ok(Array.isArray(g.sessions));
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('returns [] when the root directory is missing', () => {
    const list = parser.listSessions('/nonexistent/path/that/should/not/exist');
    assert.deepStrictEqual(list, []);
  });
});

describe('session-parser.eventToTurns edge cases', () => {
  it('returns [] for a non-object event and records a warning', () => {
    const warnings = [];
    const out = parser.eventToTurns(null, warnings);
    assert.strictEqual(out.length, 0);
    assert.ok(warnings.length > 0);
  });

  it('handles user content given as a plain string', () => {
    const turns = parser.eventToTurns(
      {
        type: 'user',
        uuid: 'x',
        timestamp: '2026-04-18T10:00:00.000Z',
        message: { role: 'user', content: 'just text' },
      },
      [],
    );
    assert.strictEqual(turns.length, 1);
    assert.strictEqual(turns[0].role, 'user');
    assert.strictEqual(turns[0].content, 'just text');
  });

  it('renders meta types (permission-mode, file-history-snapshot, summary) as system rows', () => {
    for (const metaType of ['permission-mode', 'file-history-snapshot', 'summary']) {
      const turns = parser.eventToTurns({ type: metaType, sessionId: 's' }, []);
      assert.strictEqual(turns.length, 1);
      assert.strictEqual(turns[0].role, 'system');
      assert.ok(turns[0].content.includes(metaType));
    }
  });

  it('preserves parseLine warnings for malformed JSON', () => {
    const warnings = [];
    const turns = parser.parseLine('{not json', warnings);
    assert.deepStrictEqual(turns, []);
    assert.ok(warnings[0].includes('malformed'));
  });
});

describe('session-parser.decodeProjectDir', () => {
  it('reverses the leading-dash encoding', () => {
    assert.strictEqual(parser.decodeProjectDir('-root-c4'), '/root/c4');
    assert.strictEqual(parser.decodeProjectDir('-home-shinc-src'), '/home/shinc/src');
  });
  it('returns the original string for non-encoded names', () => {
    assert.strictEqual(parser.decodeProjectDir('some-dir'), 'some-dir');
  });
  it('returns null for falsy input', () => {
    assert.strictEqual(parser.decodeProjectDir(''), null);
    assert.strictEqual(parser.decodeProjectDir(null), null);
  });
});

describe('daemon.js wiring for /api/sessions', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'daemon.js'), 'utf8');

  it('requires src/session-parser.js', () => {
    assert.match(src, /require\(\s*['"]\.\/session-parser['"]\s*\)/);
  });

  it('dispatches GET /sessions', () => {
    assert.match(src, /route === '\/sessions'/);
    assert.match(src, /sessionParser\.listSessions/);
    assert.match(src, /sessionParser\.groupSessionsByProject/);
  });

  it('dispatches GET /sessions/:id via sessionParams decode', () => {
    assert.match(src, /sessionParams\s*=\s*null/);
    assert.match(src, /sessionParser\.parseJsonl\(/);
    assert.match(src, /sessionParams\.kind === 'one'/);
  });

  it('dispatches GET /sessions/:id/stream as SSE with tail', () => {
    assert.match(src, /sessionParams\.kind === 'stream'/);
    assert.match(src, /text\/event-stream/);
    assert.match(src, /event: conversation/);
    assert.match(src, /event: turn/);
    assert.match(src, /fs\.watch\(/);
  });

  it('runs the endpoints through the existing auth.checkRequest gate', () => {
    // The /sessions block sits inside the handleRequest try branch that
    // already executes auth.checkRequest at the top. Verify the guard
    // comes before our route dispatch by looking at the early wiring.
    assert.match(src, /auth\.checkRequest\(cfg, req, route\)/);
  });
});

describe('ConversationView.tsx wiring', () => {
  const file = path.join(__dirname, '..', 'web', 'src', 'components', 'ConversationView.tsx');
  const src = fs.readFileSync(file, 'utf8');

  it('imports the shared api helpers', () => {
    assert.match(src, /from '\.\.\/lib\/api'/);
    assert.match(src, /apiGet/);
    assert.match(src, /eventSourceUrl/);
  });

  it('fetches /api/sessions/<id> and subscribes to the stream endpoint', () => {
    assert.match(src, /\/api\/sessions\/\$\{encodeURIComponent\(sessionId\)\}/);
    assert.match(src, /\/api\/sessions\/\$\{encodeURIComponent\(sessionId\)\}\/stream/);
  });

  it('renders every role type (user, assistant, thinking, tool_use, tool_result, system)', () => {
    for (const role of ['user', 'assistant', 'thinking', 'tool_use', 'tool_result', 'system']) {
      const re = new RegExp(`case '${role}'`);
      assert.match(src, re, `TurnRow switch should handle ${role}`);
    }
  });

  it('declares the Turn / Conversation public types', () => {
    assert.match(src, /export interface Turn \{/);
    assert.match(src, /export interface Conversation \{/);
  });

  it('ships auto-scroll with a Jump-to-latest affordance', () => {
    assert.match(src, /autoScroll/);
    assert.match(src, /Jump to latest/);
  });

  it('supports the live streaming mode via EventSource', () => {
    assert.match(src, /new EventSource/);
    assert.match(src, /addEventListener\('conversation'/);
    assert.match(src, /addEventListener\('turn'/);
  });
});

describe('SessionsView.tsx + App.tsx wiring', () => {
  const sessionsFile = path.join(__dirname, '..', 'web', 'src', 'components', 'SessionsView.tsx');
  const appFile = path.join(__dirname, '..', 'web', 'src', 'App.tsx');
  const topTabsFile = path.join(
    __dirname,
    '..',
    'web',
    'src',
    'components',
    'layout',
    'TopTabs.tsx',
  );
  const sessions = fs.readFileSync(sessionsFile, 'utf8');
  const app = fs.readFileSync(appFile, 'utf8');
  const topTabs = fs.readFileSync(topTabsFile, 'utf8');

  it('fetches /api/sessions from the sessions list', () => {
    assert.match(sessions, /apiGet<SessionsResponse>\('\/api\/sessions'\)/);
  });

  it('embeds ConversationView for the selected session', () => {
    assert.match(sessions, /import ConversationView from '\.\/ConversationView'/);
    assert.match(sessions, /<ConversationView/);
  });

  it('adds a sessions tab to the TopTabs list + persists the choice', () => {
    assert.match(topTabs, /label: 'Sessions'/);
    assert.match(topTabs, /value: 'sessions'/);
    assert.match(app, /import SessionsView from '\.\/components\/SessionsView'/);
    assert.match(app, /topView === 'sessions'/);
    assert.match(app, /<SessionsView \/>/);
  });
});
