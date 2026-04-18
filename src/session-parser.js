'use strict';

// Claude Code session JSONL parser (8.18).
//
// Reads a transcript file produced by the Claude Code CLI at
// ~/.claude/projects/<encoded-cwd>/<session-id>.jsonl where every line is
// one JSON event. The parser normalizes the heterogeneous event schema
// into a flat Turn stream (user, assistant, thinking, tool_use,
// tool_result, system) that the Web UI and future external-import worker
// (8.17) can both consume through one contract.
//
// Design constraints:
//   - Dependency free so `listSessions` is callable from the daemon
//     without loading node-pty or any React bundle.
//   - Gracefully skip malformed lines (collected in Conversation.warnings)
//     instead of throwing - a single corrupt line in a multi-megabyte
//     transcript must not break a whole view.
//   - Pair tool_use with its tool_result by id so the UI can render the
//     call + response as one collapsible block without re-scanning.
//   - Offer `parseJsonlStream` so the SSE tail endpoint can emit turns
//     as they are written instead of re-parsing the whole file.

const fs = require('fs');
const path = require('path');
const readline = require('readline');

const META_TYPES = new Set(['permission-mode', 'file-history-snapshot', 'summary']);

// Decode the `-root-c4` style directory name back to `/root/c4`. The CLI
// writes an encoded copy of the working directory by replacing path
// separators with `-` (leading slash becomes the leading `-`). A faithful
// reverse is impossible when the original path itself contained `-`, so
// we best-effort expand every `-` to `/` and let the UI show the decoded
// form as a hint. `cwd` fields inside the transcript remain the ground
// truth and override this when available.
function decodeProjectDir(dirName) {
  if (!dirName || typeof dirName !== 'string') return null;
  if (dirName.startsWith('-')) return dirName.replace(/-/g, '/');
  return dirName;
}

function pickString(value, fallback) {
  return typeof value === 'string' && value.length > 0 ? value : fallback;
}

function safeNumber(n) {
  const v = Number(n);
  return Number.isFinite(v) ? v : 0;
}

// Extract token usage out of a Claude assistant message. The CLI mirrors
// the Anthropic API shape so `usage.input_tokens` / `output_tokens` are
// authoritative; cache_read + cache_creation are surfaced separately so
// the UI can render them without inflating input totals.
function extractTokens(message) {
  const usage = message && message.usage ? message.usage : null;
  if (!usage || typeof usage !== 'object') {
    return { input: 0, output: 0, cacheRead: 0, cacheCreate: 0 };
  }
  return {
    input: safeNumber(usage.input_tokens),
    output: safeNumber(usage.output_tokens),
    cacheRead: safeNumber(usage.cache_read_input_tokens),
    cacheCreate: safeNumber(usage.cache_creation_input_tokens),
  };
}

function makeTurnId(event, block, index) {
  if (block && typeof block.id === 'string') return block.id;
  if (event && typeof event.uuid === 'string') {
    return index > 0 ? `${event.uuid}:${index}` : event.uuid;
  }
  return `turn-${Date.now()}-${index}`;
}

// Shape every produced Turn uniformly so the UI can skip null-checking.
function emptyTurn(overrides) {
  const base = {
    id: null,
    role: null,
    createdAt: null,
    durationMs: null,
    model: null,
    tokens: { input: 0, output: 0, cacheRead: 0, cacheCreate: 0 },
    content: '',
    toolName: null,
    toolArgs: null,
    toolUseId: null,
    toolResult: null,
    thinkingText: null,
    attachments: [],
    raw: null,
  };
  return Object.assign(base, overrides || {});
}

// Convert one raw JSONL line object into zero-or-more Turn records.
// One assistant event often packs `thinking`, `text`, and `tool_use`
// blocks into a single message - we fan them out so the UI can render
// each as its own row.
function eventToTurns(event, warnings) {
  if (!event || typeof event !== 'object') {
    if (warnings) warnings.push('non-object event skipped');
    return [];
  }

  const createdAt = pickString(event.timestamp, null);
  const raw = event;

  if (typeof event.type === 'string' && META_TYPES.has(event.type)) {
    return [emptyTurn({
      id: makeTurnId(event, null, 0),
      role: 'system',
      createdAt,
      content: `[${event.type}]`,
      raw,
    })];
  }

  if (event.type === 'user') {
    const message = event.message || {};
    const content = message.content;
    if (typeof content === 'string') {
      return [emptyTurn({
        id: makeTurnId(event, null, 0),
        role: 'user',
        createdAt,
        content,
        raw,
      })];
    }
    if (Array.isArray(content)) {
      const turns = [];
      let index = 0;
      for (const block of content) {
        if (!block || typeof block !== 'object') {
          index += 1;
          continue;
        }
        if (block.type === 'tool_result') {
          const resultBody = typeof block.content === 'string'
            ? block.content
            : Array.isArray(block.content)
              ? block.content
                  .map((c) => (c && typeof c === 'object' && typeof c.text === 'string' ? c.text : ''))
                  .filter(Boolean)
                  .join('\n')
              : JSON.stringify(block.content ?? null);
          turns.push(emptyTurn({
            id: makeTurnId(event, block, index),
            role: 'tool_result',
            createdAt,
            content: typeof resultBody === 'string' ? resultBody : '',
            toolUseId: typeof block.tool_use_id === 'string' ? block.tool_use_id : null,
            toolResult: block.content,
            attachments: Array.isArray(event.toolUseResult && event.toolUseResult.file)
              ? [event.toolUseResult.file]
              : (event.toolUseResult && event.toolUseResult.file ? [event.toolUseResult.file] : []),
            raw,
          }));
        } else if (block.type === 'text' && typeof block.text === 'string') {
          turns.push(emptyTurn({
            id: makeTurnId(event, block, index),
            role: 'user',
            createdAt,
            content: block.text,
            raw,
          }));
        }
        index += 1;
      }
      if (turns.length === 0) {
        if (warnings) warnings.push(`user event ${event.uuid || '?'} had no renderable content`);
      }
      return turns;
    }
    if (warnings) warnings.push(`user event ${event.uuid || '?'} had unexpected content shape`);
    return [];
  }

  if (event.type === 'assistant') {
    const message = event.message || {};
    const tokens = extractTokens(message);
    const model = pickString(message.model, null);
    const blocks = Array.isArray(message.content) ? message.content : [];
    const turns = [];
    let usageAttached = false;
    let index = 0;
    for (const block of blocks) {
      if (!block || typeof block !== 'object') {
        index += 1;
        continue;
      }
      // Usage belongs to the whole message, not per block. Attach it to
      // the first emitted block so totals stay correct after fan-out.
      const thisTokens = usageAttached
        ? { input: 0, output: 0, cacheRead: 0, cacheCreate: 0 }
        : tokens;
      if (block.type === 'thinking') {
        turns.push(emptyTurn({
          id: makeTurnId(event, block, index),
          role: 'thinking',
          createdAt,
          model,
          tokens: thisTokens,
          thinkingText: typeof block.thinking === 'string' ? block.thinking : '',
          content: typeof block.thinking === 'string' ? block.thinking : '',
          raw,
        }));
        usageAttached = true;
      } else if (block.type === 'text') {
        turns.push(emptyTurn({
          id: makeTurnId(event, block, index),
          role: 'assistant',
          createdAt,
          model,
          tokens: thisTokens,
          content: typeof block.text === 'string' ? block.text : '',
          raw,
        }));
        usageAttached = true;
      } else if (block.type === 'tool_use') {
        turns.push(emptyTurn({
          id: makeTurnId(event, block, index),
          role: 'tool_use',
          createdAt,
          model,
          tokens: thisTokens,
          toolName: typeof block.name === 'string' ? block.name : null,
          toolArgs: block.input ?? null,
          toolUseId: typeof block.id === 'string' ? block.id : null,
          content: typeof block.name === 'string' ? block.name : '',
          raw,
        }));
        usageAttached = true;
      }
      index += 1;
    }
    if (turns.length === 0 && warnings) {
      warnings.push(`assistant event ${event.uuid || '?'} had no renderable blocks`);
    }
    return turns;
  }

  // Unknown event types get logged but not dropped - they render as
  // system rows so operators notice instead of silently losing data.
  return [emptyTurn({
    id: makeTurnId(event, null, 0),
    role: 'system',
    createdAt,
    content: `[${event.type || 'unknown'}]`,
    raw,
  })];
}

// Walk the turn list in order and fill each tool_use's `toolResult` with
// the matching tool_result turn payload. Both turns keep their original
// role so the UI can still render them as separate rows, but the link
// lets a collapsible block show "call + result" together without a
// secondary scan.
function pairToolTurns(turns) {
  const useById = new Map();
  for (const t of turns) {
    if (t.role === 'tool_use' && t.toolUseId) useById.set(t.toolUseId, t);
  }
  for (const t of turns) {
    if (t.role === 'tool_result' && t.toolUseId && useById.has(t.toolUseId)) {
      const useTurn = useById.get(t.toolUseId);
      if (useTurn.toolResult == null) useTurn.toolResult = t.toolResult;
    }
  }
  return turns;
}

function parseLine(line, warnings) {
  if (!line || !line.trim()) return [];
  let event;
  try {
    event = JSON.parse(line);
  } catch (err) {
    if (warnings) warnings.push(`malformed JSON line: ${err.message}`);
    return [];
  }
  try {
    return eventToTurns(event, warnings);
  } catch (err) {
    if (warnings) warnings.push(`event normalization failed: ${err.message}`);
    return [];
  }
}

// parseJsonl(path) -> Conversation
function parseJsonl(filePath) {
  const warnings = [];
  const turns = [];
  let sessionId = null;
  let projectPath = null;
  let createdAt = null;
  let updatedAt = null;
  let model = null;
  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  let raw;
  try {
    raw = fs.readFileSync(filePath, 'utf8');
  } catch (err) {
    return {
      sessionId: path.basename(filePath, '.jsonl'),
      projectPath: decodeProjectDir(path.basename(path.dirname(filePath))),
      createdAt: null,
      updatedAt: null,
      model: null,
      totalInputTokens: 0,
      totalOutputTokens: 0,
      turns: [],
      warnings: [`failed to read ${filePath}: ${err.message}`],
    };
  }
  const lines = raw.split('\n');
  for (const line of lines) {
    if (!line.trim()) continue;
    let event;
    try {
      event = JSON.parse(line);
    } catch (err) {
      warnings.push(`malformed JSON line: ${err.message}`);
      continue;
    }
    if (!sessionId && typeof event.sessionId === 'string') sessionId = event.sessionId;
    if (!projectPath && typeof event.cwd === 'string') projectPath = event.cwd;
    if (!createdAt && typeof event.timestamp === 'string') createdAt = event.timestamp;
    if (typeof event.timestamp === 'string') updatedAt = event.timestamp;
    if (event.type === 'assistant' && event.message) {
      const t = extractTokens(event.message);
      totalInputTokens += t.input;
      totalOutputTokens += t.output;
      if (typeof event.message.model === 'string') model = event.message.model;
    }
    const eventTurns = eventToTurns(event, warnings);
    for (const turn of eventTurns) turns.push(turn);
  }
  pairToolTurns(turns);
  if (!sessionId) sessionId = path.basename(filePath, '.jsonl');
  if (!projectPath) projectPath = decodeProjectDir(path.basename(path.dirname(filePath)));
  return {
    sessionId,
    projectPath,
    createdAt,
    updatedAt,
    model,
    totalInputTokens,
    totalOutputTokens,
    turns,
    warnings,
  };
}

// parseJsonlStream(path) -> AsyncIterable<Turn>
// Used by the SSE tail endpoint and the scribe importer (8.17). Does NOT
// buffer the whole file so it is safe on multi-megabyte transcripts.
async function* parseJsonlStream(filePath) {
  const stream = fs.createReadStream(filePath, { encoding: 'utf8' });
  const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });
  const warnings = [];
  try {
    for await (const line of rl) {
      const turns = parseLine(line, warnings);
      for (const turn of turns) yield turn;
    }
  } finally {
    rl.close();
    stream.close();
  }
}

// Cheap scan that stops as soon as it finds the last assistant text
// block; used for the sessions list preview column. We slice from the
// end of the file instead of parsing every line so a 50MB transcript
// still answers in constant time.
function tailSnippet(filePath, maxBytes = 32 * 1024) {
  try {
    const stat = fs.statSync(filePath);
    const fd = fs.openSync(filePath, 'r');
    try {
      const size = Math.min(stat.size, maxBytes);
      const buf = Buffer.alloc(size);
      fs.readSync(fd, buf, 0, size, Math.max(0, stat.size - size));
      const text = buf.toString('utf8');
      const lines = text.split('\n').reverse();
      for (const line of lines) {
        if (!line.includes('"role":"assistant"') && !line.includes('"type":"assistant"')) continue;
        try {
          const event = JSON.parse(line);
          if (event.type !== 'assistant' || !event.message || !Array.isArray(event.message.content)) continue;
          for (let i = event.message.content.length - 1; i >= 0; i -= 1) {
            const block = event.message.content[i];
            if (block && block.type === 'text' && typeof block.text === 'string' && block.text.trim()) {
              const snippet = block.text.trim().slice(0, 200);
              return snippet;
            }
          }
        } catch {}
      }
      return '';
    } finally {
      fs.closeSync(fd);
    }
  } catch {
    return '';
  }
}

function countLines(filePath) {
  try {
    const text = fs.readFileSync(filePath, 'utf8');
    let count = 0;
    for (let i = 0; i < text.length; i += 1) {
      if (text.charCodeAt(i) === 10) count += 1;
    }
    if (text.length > 0 && text.charCodeAt(text.length - 1) !== 10) count += 1;
    return count;
  } catch {
    return 0;
  }
}

// listSessions(rootDir) -> [{projectPath, sessionId, path, updatedAt,
//                            turnCount, lastAssistantSnippet}]
// Walks ~/.claude/projects/<project-dir>/ for *.jsonl files. Sorted by
// updatedAt desc so the UI can render newest first without a second
// pass. Swallows filesystem errors per entry so one unreadable project
// does not hide the rest of the list.
function listSessions(rootDir) {
  const out = [];
  let projectDirs;
  try {
    projectDirs = fs.readdirSync(rootDir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of projectDirs) {
    if (!entry.isDirectory()) continue;
    const projectDirPath = path.join(rootDir, entry.name);
    let files;
    try {
      files = fs.readdirSync(projectDirPath);
    } catch {
      continue;
    }
    for (const file of files) {
      if (!file.endsWith('.jsonl')) continue;
      const filePath = path.join(projectDirPath, file);
      let stat;
      try {
        stat = fs.statSync(filePath);
      } catch {
        continue;
      }
      if (!stat.isFile()) continue;
      out.push({
        projectDir: entry.name,
        projectPath: decodeProjectDir(entry.name),
        sessionId: path.basename(file, '.jsonl'),
        path: filePath,
        updatedAt: new Date(stat.mtimeMs).toISOString(),
        size: stat.size,
        turnCount: countLines(filePath),
        lastAssistantSnippet: tailSnippet(filePath),
      });
    }
  }
  out.sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : a.updatedAt > b.updatedAt ? -1 : 0));
  return out;
}

// groupSessionsByProject(sessions) -> [{projectPath, projectDir, sessions:[]}]
// Pure helper the daemon exposes on GET /api/sessions so the Web UI can
// render grouped lists without duplicating the grouping logic on the
// client side.
function groupSessionsByProject(sessions) {
  const byKey = new Map();
  for (const s of sessions || []) {
    const key = s.projectDir || s.projectPath || '';
    if (!byKey.has(key)) {
      byKey.set(key, {
        projectPath: s.projectPath || null,
        projectDir: s.projectDir || null,
        sessions: [],
        updatedAt: s.updatedAt || null,
      });
    }
    const group = byKey.get(key);
    group.sessions.push(s);
    if (!group.updatedAt || (s.updatedAt && s.updatedAt > group.updatedAt)) {
      group.updatedAt = s.updatedAt;
    }
  }
  const out = Array.from(byKey.values());
  out.sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : a.updatedAt > b.updatedAt ? -1 : 0));
  return out;
}

// Resolve the root directory where Claude Code writes transcripts. The
// default mirrors the CLI convention and honors $CLAUDE_PROJECTS_DIR
// so the caller can point the daemon at an alternate location for
// tests or import flows.
function defaultProjectsRoot() {
  if (process.env.CLAUDE_PROJECTS_DIR) return process.env.CLAUDE_PROJECTS_DIR;
  const home = process.env.HOME || process.env.USERPROFILE || '';
  return path.join(home, '.claude', 'projects');
}

module.exports = {
  META_TYPES,
  decodeProjectDir,
  extractTokens,
  eventToTurns,
  pairToolTurns,
  parseLine,
  parseJsonl,
  parseJsonlStream,
  listSessions,
  groupSessionsByProject,
  tailSnippet,
  countLines,
  defaultProjectsRoot,
};
