// (v1.10.563) Extracted from ChatView. Pure data transforms +
// terminal-output cleaners — no React, no JSX. Lifted into a
// shared lib so the helpers can be reused by other surfaces and
// unit-tested in isolation.

export type Role = 'user' | 'worker';
export type Source = 'backfill' | 'live';

export interface ChatMessage {
  id: string;
  role: Role;
  text: string;
  ts: number;
  source: Source;
}

interface ConversationTurn {
  id: string;
  role: 'user' | 'assistant' | 'thinking' | 'tool_use' | 'tool_result' | 'system';
  createdAt: string | null;
  content: string;
  toolName: string | null;
}

export interface ConversationShape {
  sessionId: string;
  turns: ConversationTurn[];
}

const ANSI_OSC = /\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)/g;
const ANSI_CSI = /\x1b\[[\d;?=]*[ -/]*[@-~]/g;
const ANSI_OTHER = /\x1b[=>()][0-9A-Za-z]?/g;
const CONTROL_CHARS = /[\x00-\x08\x0b-\x1f\x7f]/g;

export function stripAnsi(input: string): string {
  return input
    .replace(ANSI_OSC, '')
    .replace(ANSI_CSI, '')
    .replace(ANSI_OTHER, '')
    .replace(/\r(?!\n)/g, '\n')
    .replace(CONTROL_CHARS, '');
}

export function b64decode(b64: string): string {
  try {
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new TextDecoder('utf-8', { fatal: false }).decode(bytes);
  } catch {
    return '';
  }
}

export function makeId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function formatTime(ts: number): string {
  const d = new Date(ts);
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  const ss = String(d.getSeconds()).padStart(2, '0');
  return `${hh}:${mm}:${ss}`;
}

// 8.25: turn the structured conversation returned by /api/sessions into
// the flat user/worker bubble list the chat renderer consumes. Only
// roles that make sense as a conversation (user text, assistant text,
// tool_use as an inline marker) are rendered; thinking, tool_result,
// and system meta are collapsed because they would double the noise
// and are better viewed in the dedicated ConversationView tab.
export function conversationToMessages(
  conv: ConversationShape | null | undefined,
): ChatMessage[] {
  if (!conv || !Array.isArray(conv.turns)) return [];
  const out: ChatMessage[] = [];
  for (const turn of conv.turns) {
    if (!turn || typeof turn !== 'object') continue;
    const ts = turn.createdAt ? Date.parse(turn.createdAt) : NaN;
    const safeTs = Number.isFinite(ts) ? ts : Date.now();
    if (turn.role === 'user' && turn.content && turn.content.trim()) {
      out.push({ id: turn.id, role: 'user', text: turn.content.trim(), ts: safeTs, source: 'backfill' });
    } else if (turn.role === 'assistant' && turn.content && turn.content.trim()) {
      out.push({ id: turn.id, role: 'worker', text: turn.content.trim(), ts: safeTs, source: 'backfill' });
    } else if (turn.role === 'tool_use' && turn.toolName) {
      out.push({
        id: turn.id,
        role: 'worker',
        text: `[tool: ${turn.toolName}]`,
        ts: safeTs,
        source: 'backfill',
      });
    }
  }
  return out;
}

// 8.25: fallback parser for raw PTY scrollback when the session JSONL
// is not yet resolvable (new worker / LOST state / --resume missed). We
// split on the Claude-TUI input prompt marker "> " at the start of a
// line so user lines get their own bubble; everything else collapses
// into worker bubbles between user turns. Best effort only - the
// ConversationView tab is still the source of truth.
export function scrollbackToMessages(raw: string): ChatMessage[] {
  if (!raw) return [];
  const cleaned = stripAnsi(raw);
  const lines = cleaned.split('\n');
  const out: ChatMessage[] = [];
  let workerBuf: string[] = [];
  const flushWorker = () => {
    const joined = workerBuf.join('\n').trim();
    workerBuf = [];
    if (!joined) return;
    out.push({
      id: makeId('bk-w'),
      role: 'worker',
      text: joined,
      ts: Date.now(),
      source: 'backfill',
    });
  };
  for (const line of lines) {
    const m = line.match(/^>\s+(.*\S)/);
    if (m) {
      flushWorker();
      out.push({
        id: makeId('bk-u'),
        role: 'user',
        text: m[1] ?? '',
        ts: Date.now(),
        source: 'backfill',
      });
    } else {
      workerBuf.push(line);
    }
  }
  flushWorker();
  return out;
}
