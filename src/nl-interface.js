'use strict';

// (11.4) Natural Language Interface.
//
// Turns free-form English queries ("show me the workers", "tell w1 to run
// the tests") into structured c4 actions so the Web UI chatbox and the
// `c4 chat` CLI can drive the daemon without memorising the command
// surface. The rule-based parseIntent() covers roughly the top 80% of
// everyday queries; an LLM-backed classifier is listed as future work in
// the release notes (patches/1.10.2-nl-interface.md).
//
// Three concerns live here:
//   1. parseIntent(text)        -> {intent, params, confidence}
//      Regex-first classifier. Returns 'unknown' with the raw text under
//      params.text when nothing matches so formatResponse can show a
//      helpful fallback instead of silently discarding the message.
//   2. executeIntent(intent, params, ctx) -> result
//      Thin dispatch layer. Takes an adapter object (ctx.adapter) that
//      exposes listWorkers / createWorker / sendTask / getStatus /
//      getHistory / readOutput / closeWorker. Tests inject a mock adapter
//      so the suite never touches a real daemon; the daemon builds an
//      adapter from its own in-process manager + dashboard and the CLI
//      builds an HTTP adapter that reuses the existing request() helper.
//   3. SessionStore (ChatSession CRUD)
//      Persists sessions to ~/.c4/nl-sessions.json. Each session records
//      its id, created/updated timestamps, the full message history, and
//      a lastWorker hint so follow-up queries ("close it") can resolve
//      pronouns without another trip through the parser. Tests construct
//      a store pointed at tmpdir and never touch the operator's real
//      file.

const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');

const INTENTS = Object.freeze({
  LIST_WORKERS: 'list_workers',
  CREATE_WORKER: 'create_worker',
  SEND_TASK: 'send_task',
  GET_STATUS: 'get_status',
  GET_HISTORY: 'get_history',
  READ_OUTPUT: 'read_output',
  CLOSE_WORKER: 'close_worker',
  UNKNOWN: 'unknown',
});

const INTENT_LIST = Object.freeze(Object.values(INTENTS));

function defaultSessionsPath() {
  return path.join(os.homedir(), '.c4', 'nl-sessions.json');
}

function randomId() {
  return crypto.randomBytes(8).toString('hex');
}

function nowIso() {
  return new Date().toISOString();
}

// Extract the first bareword that looks like a worker name. Worker names
// are token-like (alphanum, dash, underscore); we avoid matching common
// English nouns by requiring the caller to have already narrowed the
// region of interest (e.g. after "worker" or between quotes).
const NAME_CHARS = /[A-Za-z0-9_\-]+/;

function pickName(from) {
  if (!from || typeof from !== 'string') return null;
  const m = from.match(NAME_CHARS);
  return m ? m[0] : null;
}

function extractQuoted(text) {
  if (typeof text !== 'string') return null;
  const single = text.match(/'([^']+)'/);
  if (single) return single[1];
  const dbl = text.match(/"([^"]+)"/);
  if (dbl) return dbl[1];
  const back = text.match(/`([^`]+)`/);
  if (back) return back[1];
  return null;
}

// parseIntent(text) -> {intent, params, confidence}
// Rule-based classifier. The order of checks matters: more specific
// verbs (create/close) are inspected before broader ones ("worker"
// appears in almost every query). Confidence is a rough 0-1 score that
// formatResponse uses to decide whether to ask for confirmation.
function parseIntent(text) {
  const raw = typeof text === 'string' ? text.trim() : '';
  if (!raw) return { intent: INTENTS.UNKNOWN, params: { text: raw }, confidence: 0 };
  const lower = raw.toLowerCase();

  // close_worker — "close X", "stop worker X", "kill X", "shutdown X"
  {
    const m = lower.match(/\b(?:close|stop|kill|shutdown|terminate)\s+(?:the\s+)?(?:worker\s+)?([A-Za-z0-9_\-]+)\b/);
    if (m) {
      return { intent: INTENTS.CLOSE_WORKER, params: { name: m[1] }, confidence: 0.9 };
    }
  }

  // create_worker — "create worker X", "make a new worker X", "spawn worker X"
  {
    const m1 = lower.match(/\b(?:create|new|make|spawn|start)\s+(?:a\s+)?(?:new\s+)?worker\s+(?:called\s+|named\s+)?([A-Za-z0-9_\-]+)\b/);
    if (m1) {
      return {
        intent: INTENTS.CREATE_WORKER,
        params: { name: m1[1] },
        confidence: 0.9,
      };
    }
    const m2 = lower.match(/\bnew\s+worker\s+([A-Za-z0-9_\-]+)\b/);
    if (m2) {
      return {
        intent: INTENTS.CREATE_WORKER,
        params: { name: m2[1] },
        confidence: 0.85,
      };
    }
  }

  // send_task — "tell worker X to Y", "task X 'work'", "ask X to Y",
  // "worker X should Y". Pull the quoted portion when present so the
  // task text survives punctuation like commas.
  {
    const quoted = extractQuoted(raw);
    const taskM = lower.match(/\btask\s+([A-Za-z0-9_\-]+)\b(.*)$/);
    if (taskM) {
      const name = taskM[1];
      const rest = raw.slice(raw.toLowerCase().indexOf(taskM[0]) + taskM[1].length + 5).trim();
      const task = quoted || rest.replace(/^[:\-,\s]+/, '').trim();
      if (task) {
        return { intent: INTENTS.SEND_TASK, params: { name, task }, confidence: 0.9 };
      }
    }
    const tellM = lower.match(/\b(?:tell|ask|send)\s+(?:worker\s+)?([A-Za-z0-9_\-]+)\s+to\s+(.+)$/);
    if (tellM) {
      const task = quoted || tellM[2].trim();
      return { intent: INTENTS.SEND_TASK, params: { name: tellM[1], task }, confidence: 0.85 };
    }
    const shouldM = lower.match(/\bworker\s+([A-Za-z0-9_\-]+)\s+should\s+(.+)$/);
    if (shouldM) {
      const task = quoted || shouldM[2].trim();
      return { intent: INTENTS.SEND_TASK, params: { name: shouldM[1], task }, confidence: 0.8 };
    }
  }

  // read_output — "show me X output", "what is X saying", "read X"
  {
    const m1 = lower.match(/\bshow\s+(?:me\s+)?(?:the\s+)?(?:output\s+of\s+|output\s+from\s+)?(?:worker\s+)?([A-Za-z0-9_\-]+)(?:'s)?\s+output\b/);
    if (m1) return { intent: INTENTS.READ_OUTPUT, params: { name: m1[1] }, confidence: 0.85 };
    const m2 = lower.match(/\bread\s+(?:worker\s+)?([A-Za-z0-9_\-]+)\b/);
    if (m2) return { intent: INTENTS.READ_OUTPUT, params: { name: m2[1] }, confidence: 0.8 };
    const m3 = lower.match(/\bwhat\s+is\s+(?:worker\s+)?([A-Za-z0-9_\-]+)\s+(?:saying|doing|up to|showing)\b/);
    if (m3) return { intent: INTENTS.READ_OUTPUT, params: { name: m3[1] }, confidence: 0.8 };
    const m4 = lower.match(/\boutput\s+(?:of|from)\s+(?:worker\s+)?([A-Za-z0-9_\-]+)\b/);
    if (m4) return { intent: INTENTS.READ_OUTPUT, params: { name: m4[1] }, confidence: 0.75 };
  }

  // get_history — "what did X do", "recent activity", "history of X"
  {
    const m1 = lower.match(/\bwhat\s+did\s+(?:worker\s+)?([A-Za-z0-9_\-]+)\s+(?:do|work on)\b/);
    if (m1) return { intent: INTENTS.GET_HISTORY, params: { name: m1[1] }, confidence: 0.85 };
    const m2 = lower.match(/\bhistory\s+(?:of|for)\s+(?:worker\s+)?([A-Za-z0-9_\-]+)\b/);
    if (m2) return { intent: INTENTS.GET_HISTORY, params: { name: m2[1] }, confidence: 0.8 };
    if (/\b(?:recent\s+activity|recent\s+tasks|what\s+happened|show\s+history|task\s+history)\b/.test(lower)) {
      return { intent: INTENTS.GET_HISTORY, params: {}, confidence: 0.75 };
    }
  }

  // list_workers — "list workers", "show workers", "what workers",
  // "workers status", "running workers"
  if (
    /\b(?:list|show|display)\s+(?:me\s+)?(?:all\s+|the\s+|running\s+|active\s+)?workers?\b/.test(lower)
    || /\bwhat\s+workers?\s+(?:are\s+)?(?:running|active|up|alive)\b/.test(lower)
    || /\b(?:running|active|alive)\s+workers?\b/.test(lower)
    || /\bworkers?\s+(?:list|status)\b/.test(lower)
    || /^workers\??$/.test(lower)
  ) {
    return { intent: INTENTS.LIST_WORKERS, params: {}, confidence: 0.85 };
  }

  // get_status — "status", "health", "how is the daemon", "is the daemon ok"
  if (
    /^(?:status|health)\??$/.test(lower)
    || /\b(?:daemon|system)\s+(?:status|health|ok|running)\b/.test(lower)
    || /\bhow\s+(?:is|are)\s+(?:the\s+)?(?:daemon|system|things)\b/.test(lower)
    || /\bhealth\s*check\b/.test(lower)
  ) {
    return { intent: INTENTS.GET_STATUS, params: {}, confidence: 0.8 };
  }

  return { intent: INTENTS.UNKNOWN, params: { text: raw }, confidence: 0 };
}

// executeIntent(intent, params, ctx) -> Promise<result>
// ctx.adapter is an object with the seven methods below. Any adapter
// method is allowed to throw; executeIntent wraps those in a uniform
// { ok:false, error } shape so callers never have to distinguish parser
// errors from adapter errors.
async function executeIntent(intent, params, ctx) {
  const adapter = ctx && ctx.adapter;
  if (!adapter) {
    return { ok: false, error: 'No adapter configured', intent };
  }
  try {
    switch (intent) {
      case INTENTS.LIST_WORKERS: {
        const data = await adapter.listWorkers();
        return { ok: true, intent, data };
      }
      case INTENTS.CREATE_WORKER: {
        if (!params || !params.name) return { ok: false, error: 'Missing worker name', intent };
        const data = await adapter.createWorker(params.name);
        return { ok: true, intent, data, worker: params.name };
      }
      case INTENTS.SEND_TASK: {
        if (!params || !params.name) return { ok: false, error: 'Missing worker name', intent };
        if (!params.task) return { ok: false, error: 'Missing task text', intent };
        const data = await adapter.sendTask(params.name, params.task);
        return { ok: true, intent, data, worker: params.name, task: params.task };
      }
      case INTENTS.GET_STATUS: {
        const data = await adapter.getStatus();
        return { ok: true, intent, data };
      }
      case INTENTS.GET_HISTORY: {
        const data = await adapter.getHistory(params ? params.name : undefined);
        return { ok: true, intent, data, worker: params ? params.name : null };
      }
      case INTENTS.READ_OUTPUT: {
        if (!params || !params.name) return { ok: false, error: 'Missing worker name', intent };
        const data = await adapter.readOutput(params.name);
        return { ok: true, intent, data, worker: params.name };
      }
      case INTENTS.CLOSE_WORKER: {
        if (!params || !params.name) return { ok: false, error: 'Missing worker name', intent };
        const data = await adapter.closeWorker(params.name);
        return { ok: true, intent, data, worker: params.name };
      }
      case INTENTS.UNKNOWN:
      default:
        return { ok: false, error: 'Unrecognised intent', intent: INTENTS.UNKNOWN, text: params ? params.text : '' };
    }
  } catch (err) {
    return { ok: false, error: (err && err.message) ? err.message : String(err), intent };
  }
}

// formatResponse(result, intent) -> string
// Renders the structured adapter result into a chat-style reply. Kept
// deliberately terse so the Web UI and CLI can reuse the same output
// without extra wrapping.
function formatResponse(result, intent) {
  if (!result) return 'No response.';
  if (result.ok === false) {
    if (result.intent === INTENTS.UNKNOWN) {
      return (
        "Sorry, I did not understand that. Try: 'list workers', "
        + "'create worker w1', 'tell w1 to run tests', 'status', "
        + "'history of w1', 'show w1 output', or 'close w1'."
      );
    }
    return 'Error: ' + (result.error || 'unknown error');
  }
  const it = intent || result.intent;
  switch (it) {
    case INTENTS.LIST_WORKERS: {
      const workers = (result.data && Array.isArray(result.data.workers)) ? result.data.workers : [];
      if (workers.length === 0) return 'No workers are running.';
      const rows = workers.map((w) => `- ${w.name} (${w.status || 'unknown'})`).join('\n');
      return `Active workers (${workers.length}):\n${rows}`;
    }
    case INTENTS.CREATE_WORKER: {
      return `Created worker '${result.worker}'.`;
    }
    case INTENTS.SEND_TASK: {
      return `Sent task to '${result.worker}': ${result.task}`;
    }
    case INTENTS.GET_STATUS: {
      const d = result.data || {};
      const ok = d.ok === undefined ? true : d.ok;
      const workers = typeof d.workers === 'number' ? d.workers : 0;
      const version = d.version || 'unknown';
      return `Daemon: ${ok ? 'ok' : 'degraded'} (${workers} workers, version ${version}).`;
    }
    case INTENTS.GET_HISTORY: {
      const entries = (result.data && Array.isArray(result.data.entries)) ? result.data.entries : [];
      if (entries.length === 0) {
        return result.worker ? `No history for '${result.worker}'.` : 'No history available.';
      }
      const who = result.worker ? ` for '${result.worker}'` : '';
      const rows = entries.slice(0, 10).map((e) => {
        const t = e.task || e.title || '(no task)';
        const at = e.at || e.timestamp || '';
        return `- ${at ? at + ' ' : ''}${t}`;
      }).join('\n');
      return `Recent activity${who}:\n${rows}`;
    }
    case INTENTS.READ_OUTPUT: {
      const out = result.data && typeof result.data.output === 'string' ? result.data.output : '';
      if (!out) return `'${result.worker}' has no new output.`;
      const trimmed = out.length > 800 ? out.slice(-800) + ' ...(truncated)' : out;
      return `Output from '${result.worker}':\n${trimmed}`;
    }
    case INTENTS.CLOSE_WORKER: {
      return `Closed worker '${result.worker}'.`;
    }
    default:
      return JSON.stringify(result);
  }
}

// ---- ChatSession storage -------------------------------------------------

class SessionStore {
  constructor(opts = {}) {
    this.storePath = (opts && opts.storePath) || defaultSessionsPath();
    this._state = null;
  }

  _load() {
    if (this._state) return this._state;
    if (!fs.existsSync(this.storePath)) {
      this._state = { sessions: {} };
      return this._state;
    }
    try {
      const raw = fs.readFileSync(this.storePath, 'utf8');
      const parsed = raw && raw.length > 0 ? JSON.parse(raw) : {};
      this._state = {
        sessions: (parsed && typeof parsed.sessions === 'object' && parsed.sessions) ? parsed.sessions : {},
      };
    } catch {
      this._state = { sessions: {} };
    }
    return this._state;
  }

  _persist() {
    const dir = path.dirname(this.storePath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(this.storePath, JSON.stringify(this._state, null, 2) + '\n');
  }

  reload() {
    this._state = null;
    return this._load();
  }

  createSession() {
    const state = this._load();
    const id = randomId();
    const now = nowIso();
    state.sessions[id] = {
      id,
      createdAt: now,
      updatedAt: now,
      history: [],
      lastWorker: null,
    };
    this._persist();
    return state.sessions[id];
  }

  getSession(id) {
    if (!id || typeof id !== 'string') return null;
    const state = this._load();
    return state.sessions[id] || null;
  }

  listSessions() {
    const state = this._load();
    return Object.keys(state.sessions).map((id) => {
      const s = state.sessions[id];
      return {
        id,
        createdAt: s.createdAt,
        updatedAt: s.updatedAt,
        messageCount: Array.isArray(s.history) ? s.history.length : 0,
        lastWorker: s.lastWorker || null,
      };
    });
  }

  appendMessage(sessionId, role, text) {
    if (!role || (role !== 'user' && role !== 'assistant' && role !== 'system')) {
      throw new Error('Invalid role: ' + role);
    }
    if (typeof text !== 'string') throw new Error('Invalid text');
    const state = this._load();
    let session = state.sessions[sessionId];
    if (!session) {
      // Treat a missing sessionId as "start a new session" so callers
      // don't need a separate createSession() round-trip.
      session = this.createSession();
      sessionId = session.id;
    }
    session.history.push({ role, text, timestamp: nowIso() });
    session.updatedAt = nowIso();
    this._persist();
    return session;
  }

  setLastWorker(sessionId, workerName) {
    const state = this._load();
    const session = state.sessions[sessionId];
    if (!session) return null;
    session.lastWorker = workerName || null;
    session.updatedAt = nowIso();
    this._persist();
    return session;
  }

  deleteSession(sessionId) {
    if (!sessionId || typeof sessionId !== 'string') return false;
    const state = this._load();
    if (!state.sessions[sessionId]) return false;
    delete state.sessions[sessionId];
    this._persist();
    return true;
  }
}

// ---- Front-end orchestration --------------------------------------------

// NlInterface ties parseIntent / executeIntent / formatResponse together
// and folds in the session store. The daemon and CLI each build an
// instance with their own adapter.
class NlInterface {
  constructor(opts = {}) {
    this.adapter = opts.adapter || null;
    this.sessions = opts.sessionStore || new SessionStore({ storePath: opts.sessionsPath });
  }

  parseIntent(text) {
    return parseIntent(text);
  }

  // handle(sessionIdOrNull, text) -> { sessionId, response, intent,
  //                                    params, result, actions }
  // The main entry point used by the /nl/chat endpoint and `c4 chat`.
  // Creates a session if one was not supplied, appends the user message,
  // dispatches the parsed intent through the adapter, appends the reply,
  // and records lastWorker so follow-up turns can resolve "it".
  async handle(sessionId, text) {
    let session = sessionId ? this.sessions.getSession(sessionId) : null;
    if (!session) session = this.sessions.createSession();
    this.sessions.appendMessage(session.id, 'user', text);

    let parsed = this.parseIntent(text);
    // Pronoun resolution: if the parser pulled a pronoun ("it", "that",
    // "this") out as the worker name, or the slot is empty, rewrite it
    // to the most recently referenced worker from the session. Keeps
    // "close it" / "read that" natural across conversation turns.
    const PRONOUNS = new Set(['it', 'that', 'this', 'him', 'her', 'them']);
    if (parsed.intent !== INTENTS.UNKNOWN && parsed.params && session.lastWorker) {
      const slotIsPronoun = parsed.params.name && PRONOUNS.has(String(parsed.params.name).toLowerCase());
      const slotMissing = !parsed.params.name;
      const resolvable = parsed.intent === INTENTS.CLOSE_WORKER
        || parsed.intent === INTENTS.READ_OUTPUT
        || parsed.intent === INTENTS.GET_HISTORY;
      if (resolvable && (slotMissing || slotIsPronoun)) {
        parsed = {
          ...parsed,
          params: { ...parsed.params, name: session.lastWorker },
        };
      }
    }

    let result;
    if (!this.adapter) {
      result = {
        ok: false,
        error: 'NL interface is not wired to a daemon adapter',
        intent: parsed.intent,
      };
    } else {
      result = await executeIntent(parsed.intent, parsed.params, { adapter: this.adapter });
    }

    const reply = formatResponse(result, parsed.intent);
    this.sessions.appendMessage(session.id, 'assistant', reply);

    if (result && result.ok && result.worker) {
      this.sessions.setLastWorker(session.id, result.worker);
    }

    return {
      sessionId: session.id,
      response: reply,
      intent: parsed.intent,
      params: parsed.params || {},
      confidence: parsed.confidence || 0,
      result,
      actions: buildActions(parsed, result),
    };
  }
}

// buildActions(parsed, result) -> array of {type, ...} hints
// The Web UI renders these as quick-action chips so the user can click
// a follow-up without re-typing.
function buildActions(parsed, result) {
  const out = [];
  const worker = (result && result.worker) || (parsed && parsed.params && parsed.params.name) || null;
  if (!result || !result.ok) return out;
  switch (parsed.intent) {
    case INTENTS.CREATE_WORKER:
      if (worker) {
        out.push({ type: 'send_task', worker, label: `Task ${worker}` });
        out.push({ type: 'read_output', worker, label: `Read ${worker}` });
      }
      break;
    case INTENTS.SEND_TASK:
      if (worker) {
        out.push({ type: 'read_output', worker, label: `Read ${worker}` });
      }
      break;
    case INTENTS.LIST_WORKERS:
      out.push({ type: 'get_status', label: 'Daemon status' });
      break;
    case INTENTS.READ_OUTPUT:
      if (worker) {
        out.push({ type: 'close_worker', worker, label: `Close ${worker}` });
      }
      break;
    default:
      break;
  }
  return out;
}

// Async wrapper that runs parseIntent first, then routes 'unknown'
// (or low-confidence) results through the optional Anthropic API
// fallback in nl-llm-fallback. Off unless config.nl.llm.enabled is
// true (or opts.llm.enabled). Returns the same envelope shape as
// parseIntent so callers treat both paths identically.
async function parseIntentWithLLM(text, opts = {}) {
  const fast = parseIntent(text);
  const minConfidence = Number.isFinite(opts.minConfidence) ? opts.minConfidence : 0.5;
  if (fast.intent !== INTENTS.UNKNOWN && fast.confidence >= minConfidence) {
    return Object.assign({}, fast, { _source: 'regex' });
  }
  const llmCfg = (opts && opts.llm) || (opts.config && opts.config.nl && opts.config.nl.llm) || {};
  if (!llmCfg.enabled) return fast;
  // Lazy require so the module load cost is paid only when fallback is on.
  let parseLLM;
  try { ({ parseLLM } = require('./nl-llm-fallback')); }
  catch { return fast; }
  const llm = await parseLLM(text, {
    enabled: true,
    apiKey: llmCfg.apiKey,
    model: llmCfg.model,
    systemPrompt: llmCfg.systemPrompt,
    maxTokens: llmCfg.maxTokens,
  });
  if (!llm) return fast;
  // Diagnostic fall-throughs (llm-unavailable / llm-error / llm-unparsed)
  // are returned as-is so the caller can surface a helpful message
  // instead of silently masquerading as a real intent.
  if (llm.intent && llm.intent.startsWith('llm-')) return llm;
  // Real LLM intent — preserve the LLM's params/confidence shape but
  // tag it so executeIntent / formatResponse can show provenance.
  return {
    intent: llm.intent || fast.intent,
    params: llm.params || {},
    confidence: typeof llm.confidence === 'number' ? llm.confidence : 0.6,
    _source: 'llm',
    _model: llm._model,
  };
}

module.exports = {
  INTENTS,
  INTENT_LIST,
  NlInterface,
  SessionStore,
  parseIntent,
  parseIntentWithLLM,
  executeIntent,
  formatResponse,
  defaultSessionsPath,
  buildActions,
};
