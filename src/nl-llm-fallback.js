'use strict';

// (11.4 follow-up) Optional Anthropic-API-backed NL fallback.
//
// parseIntent (in nl-interface.js) covers the regex-recognisable
// majority of operator phrasings, but returns 'unknown' for anything
// outside that vocabulary. When the operator opts in via
// config.nl.llm.enabled, this module sends the unrecognised query to a
// Claude model and asks for a JSON envelope describing the intent +
// params, then surfaces it back in the same shape parseIntent returns
// so the caller treats both paths identically.
//
// Off by default. Requires:
//   - opts.enabled === true (or config.nl.llm.enabled at the call site)
//   - process.env.ANTHROPIC_API_KEY OR opts.apiKey
//   - the @anthropic-ai/sdk package installed (dynamic require — when
//     missing we return an 'llm-unavailable' diagnostic so the operator
//     sees what's wrong instead of a silent skip)
//
// The module never throws upward — all error paths return a structured
// payload so the caller can choose to log or pass to formatResponse.

const SYSTEM_PROMPT = (
  "You convert short user instructions into a c4 NL intent envelope. " +
  "Available intents: list_workers, create_worker, send_task, get_status, " +
  "get_history, read_output, close_worker, unknown. " +
  "Respond ONLY with a JSON object: " +
  "{ \"intent\": \"<one of the above>\", \"params\": { ... }, " +
  "\"confidence\": 0.0-1.0 }. " +
  "Use 'unknown' (confidence < 0.3) when the request is ambiguous."
);

function _loadSdk() {
  try {
    return require('@anthropic-ai/sdk');
  } catch {
    return null;
  }
}

function _tryParseJson(text) {
  if (typeof text !== 'string') return null;
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) return null;
  try { return JSON.parse(m[0]); } catch { return null; }
}

/**
 * Resolve a free-form text query into a {intent, params, confidence}
 * envelope using a Claude model. Always async.
 *
 * @param {string} text
 * @param {object} opts
 *   - enabled (default false): hard kill switch
 *   - apiKey: falls back to env.ANTHROPIC_API_KEY
 *   - model:  default 'claude-sonnet-4-6'
 *   - systemPrompt: override the default
 *   - maxTokens: default 800
 * @returns {Promise<{intent,params,confidence,_source?,_error?,_reason?}|null>}
 */
async function parseLLM(text, opts) {
  const o = (opts && typeof opts === 'object') ? opts : {};
  if (!o.enabled) return null;
  const apiKey = o.apiKey || process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;
  const sdkExports = _loadSdk();
  if (!sdkExports) {
    return {
      intent: 'llm-unavailable',
      params: { text },
      confidence: 0,
      _source: 'llm',
      _reason: '@anthropic-ai/sdk not installed',
    };
  }
  const Anthropic = sdkExports.default || sdkExports;
  const model = o.model || 'claude-sonnet-4-6';
  const systemPrompt = o.systemPrompt || SYSTEM_PROMPT;
  const maxTokens = Number.isFinite(o.maxTokens) ? Math.max(64, o.maxTokens) : 800;
  let client;
  try {
    client = new Anthropic({ apiKey });
  } catch (e) {
    return { intent: 'llm-error', params: { text }, confidence: 0, _source: 'llm', _error: e.message };
  }
  let resp;
  try {
    resp = await client.messages.create({
      model,
      max_tokens: maxTokens,
      system: systemPrompt,
      messages: [{ role: 'user', content: text }],
    });
  } catch (e) {
    return { intent: 'llm-error', params: { text }, confidence: 0, _source: 'llm', _error: e.message };
  }
  const piece = resp && resp.content && resp.content[0];
  const raw = piece && typeof piece.text === 'string' ? piece.text : '';
  const parsed = _tryParseJson(raw);
  if (!parsed) {
    return { intent: 'llm-unparsed', params: { text, raw }, confidence: 0.1, _source: 'llm' };
  }
  const intent = typeof parsed.intent === 'string' ? parsed.intent : 'unknown';
  const params = (parsed.params && typeof parsed.params === 'object') ? parsed.params : {};
  const confidence = typeof parsed.confidence === 'number' ? parsed.confidence : 0.6;
  return { intent, params, confidence, _source: 'llm', _model: model };
}

module.exports = { parseLLM, SYSTEM_PROMPT };
