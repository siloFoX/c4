// Helper script — exercised by tests/c4-client-runtime.test.js via
// `node --experimental-strip-types`. Uses the generated SDK against
// a mock fetch to exercise C4ApiError / retry / setToken / params /
// body wiring without touching the daemon.
//
// Each test case prints `OK <label>` on success or `FAIL <label> ...`
// on failure; the parent runs the script and parses stdout.

import { C4Client, C4ApiError } from '../../sdk/c4-client.ts';

let passed = 0;
let failed = 0;

function check(label, cond, detail) {
  if (cond) { console.log(`OK ${label}`); passed++; }
  else { console.log(`FAIL ${label}${detail ? ` :: ${detail}` : ''}`); failed++; }
}

// Build a stub fetch that records calls + can be told what to return.
function makeMockFetch(scripted) {
  const calls = [];
  let i = 0;
  const fn = async (url, init) => {
    calls.push({ url, init });
    const next = scripted[i++];
    if (typeof next === 'function') return next();
    return next;
  };
  fn.calls = calls;
  return fn;
}

function jsonResponse(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    statusText: status === 200 ? 'OK' : 'Error',
    headers: { 'Content-Type': 'application/json' },
  });
}

// --- 1. Happy path
{
  const fetch = makeMockFetch([jsonResponse(200, { ok: true, version: '1.10.4', workers: 0 })]);
  const c4 = new C4Client({ baseUrl: 'http://test', fetch });
  const h = await c4.getHealth();
  check('getHealth returns parsed body', h.version === '1.10.4');
  check('getHealth uses GET method', fetch.calls[0].init.method === 'GET');
  check('getHealth hits /api/health', String(fetch.calls[0].url).endsWith('/api/health'));
}

// --- 2. POST with body
{
  const fetch = makeMockFetch([jsonResponse(200, { token: 'abc', user: 'admin', role: 'admin' })]);
  const c4 = new C4Client({ baseUrl: 'http://test', fetch });
  const r = await c4.postAuthLogin({ user: 'admin', password: 'admin123' });
  check('postAuthLogin returns token', r.token === 'abc');
  check('postAuthLogin sends POST', fetch.calls[0].init.method === 'POST');
  check('postAuthLogin JSON-encodes body', JSON.parse(fetch.calls[0].init.body).user === 'admin');
  check('postAuthLogin sets Content-Type', fetch.calls[0].init.headers['Content-Type'] === 'application/json');
}

// --- 3. setToken adds Authorization header
{
  const fetch = makeMockFetch([jsonResponse(200, { ok: true, version: '1', workers: 0 })]);
  const c4 = new C4Client({ baseUrl: 'http://test', fetch });
  c4.setToken('jwt-xyz');
  await c4.getHealth();
  check('setToken adds Authorization header', fetch.calls[0].init.headers.Authorization === 'Bearer jwt-xyz');
}

// --- 4. Query params for GET
{
  const fetch = makeMockFetch([jsonResponse(200, { scrollback: '', lines: 0 })]);
  const c4 = new C4Client({ baseUrl: 'http://test', fetch });
  await c4.getScrollback({ name: 'w1', lines: 50 });
  const u = new URL(String(fetch.calls[0].url));
  check('getScrollback adds name query param', u.searchParams.get('name') === 'w1');
  check('getScrollback adds lines query param', u.searchParams.get('lines') === '50');
}

// --- 5. C4ApiError on 4xx
{
  const fetch = makeMockFetch([jsonResponse(401, { error: 'unauthorized' })]);
  const c4 = new C4Client({ baseUrl: 'http://test', fetch });
  let err;
  try { await c4.getHealth(); } catch (e) { err = e; }
  check('4xx throws C4ApiError', err instanceof C4ApiError);
  check('C4ApiError carries status 401', err && err.status === 401);
  check('C4ApiError carries parsed body', err && err.body && err.body.error === 'unauthorized');
}

// --- 5b. C4ApiError.body.details lands on validation 400
{
  const fetch = makeMockFetch([jsonResponse(400, {
    error: 'Validation failed',
    details: ['body.user: required', 'body.password: required'],
  })]);
  const c4 = new C4Client({ baseUrl: 'http://test', fetch });
  let err;
  try { await c4.postAuthLogin({ user: '', password: '' }); } catch (e) { err = e; }
  check('validation 400 throws C4ApiError', err instanceof C4ApiError);
  check('details array reaches body.details', err && Array.isArray(err.body.details) && err.body.details.length === 2);
  check('details entries are strings', err && err.body.details && typeof err.body.details[0] === 'string');
}

// --- 6. 4xx does NOT retry
{
  const fetch = makeMockFetch([
    jsonResponse(400, { error: 'bad' }),
    jsonResponse(200, { ok: true }),
  ]);
  const c4 = new C4Client({ baseUrl: 'http://test', fetch, retries: 3, backoffMs: 0 });
  try { await c4.getHealth(); } catch {}
  check('4xx does not retry', fetch.calls.length === 1);
}

// --- 7. 5xx retries up to budget then throws
{
  const fetch = makeMockFetch([
    jsonResponse(503, { error: 'busy' }),
    jsonResponse(503, { error: 'busy' }),
    jsonResponse(503, { error: 'busy' }),
  ]);
  const c4 = new C4Client({ baseUrl: 'http://test', fetch, retries: 2, backoffMs: 0 });
  let err;
  try { await c4.getHealth(); } catch (e) { err = e; }
  check('5xx retries to budget', fetch.calls.length === 3, `calls=${fetch.calls.length}`);
  check('5xx final throw is C4ApiError', err instanceof C4ApiError);
  check('5xx final status preserved', err && err.status === 503);
}

// --- 8. 5xx then 200 → success after retry
{
  const fetch = makeMockFetch([
    jsonResponse(500, { error: 'fail' }),
    jsonResponse(200, { ok: true, version: 'r', workers: 0 }),
  ]);
  const c4 = new C4Client({ baseUrl: 'http://test', fetch, retries: 1, backoffMs: 0 });
  const h = await c4.getHealth();
  check('5xx → 200 retry succeeds', h.version === 'r');
  check('5xx → 200 made 2 calls', fetch.calls.length === 2);
}

// --- 9. SSE streaming — yields parsed events
{
  // Build a Response whose body is a ReadableStream emitting two SSE messages.
  function sseResponse(messages) {
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      start(controller) {
        for (const m of messages) controller.enqueue(encoder.encode(m));
        controller.close();
      },
    });
    return new Response(stream, {
      status: 200,
      headers: { 'Content-Type': 'text/event-stream' },
    });
  }
  const fetch = makeMockFetch([
    sseResponse([
      'data: {"type":"connected"}\n\n',
      'event: worker.created\ndata: {"name":"w1"}\n\n',
    ]),
  ]);
  const c4 = new C4Client({ baseUrl: 'http://test', fetch });
  const events = [];
  for await (const ev of c4.getEvents()) events.push(ev);
  check('SSE yields 2 events', events.length === 2, `got ${events.length}`);
  check('SSE first event has type=message + parsed JSON', events[0].type === 'message' && events[0].data.type === 'connected');
  check('SSE second event uses event: header', events[1].type === 'worker.created');
  check('SSE preserves raw payload', events[1].raw === '{"name":"w1"}');
}

// --- 10. SSE with query params
{
  const stream = new ReadableStream({
    start(c) { c.close(); },
  });
  const empty = new Response(stream, { status: 200, headers: { 'Content-Type': 'text/event-stream' } });
  const fetch = makeMockFetch([empty]);
  const c4 = new C4Client({ baseUrl: 'http://test', fetch });
  const it = c4.getWatch({ name: 'worker-1' });
  await it.next(); // exhaust the generator
  const u = new URL(String(fetch.calls[0].url));
  check('SSE getWatch passes name query param', u.searchParams.get('name') === 'worker-1');
  check('SSE sends Accept: text/event-stream', fetch.calls[0].init.headers.Accept === 'text/event-stream');
}

// --- 11. onAuthExpired → token refresh + replay
{
  const fetch = makeMockFetch([
    jsonResponse(401, { error: 'token expired' }),
    jsonResponse(200, { ok: true, version: 'r', workers: 0 }),
  ]);
  let refreshCalls = 0;
  const c4 = new C4Client({
    baseUrl: 'http://test',
    fetch,
    token: 'old-token',
    onAuthExpired: async () => { refreshCalls++; return 'new-token'; },
  });
  const h = await c4.getHealth();
  check('401 → refresh callback fires', refreshCalls === 1);
  check('401 → replay succeeds with new token', h.version === 'r');
  check('401 → replay uses Authorization Bearer new-token', fetch.calls[1].init.headers.Authorization === 'Bearer new-token');
  check('401 → 2 calls total (original + replay)', fetch.calls.length === 2);
}

// --- 12. onAuthExpired returns null → throw without replay
{
  const fetch = makeMockFetch([
    jsonResponse(401, { error: 'token expired' }),
  ]);
  const c4 = new C4Client({
    baseUrl: 'http://test',
    fetch,
    onAuthExpired: async () => null,
  });
  let err;
  try { await c4.getHealth(); } catch (e) { err = e; }
  check('401 + null refresh → throws C4ApiError', err instanceof C4ApiError && err.status === 401);
  check('401 + null refresh → no replay', fetch.calls.length === 1);
}

// --- 13. Persistent 401 → no infinite loop (_refreshed guard)
{
  const fetch = makeMockFetch([
    jsonResponse(401, { error: 'expired' }),
    jsonResponse(401, { error: 'still expired' }),
  ]);
  const c4 = new C4Client({
    baseUrl: 'http://test',
    fetch,
    onAuthExpired: async () => 'maybe-new',
  });
  let err;
  try { await c4.getHealth(); } catch (e) { err = e; }
  check('persistent 401 → throws after one replay', err instanceof C4ApiError);
  check('persistent 401 → exactly 2 calls (no infinite loop)', fetch.calls.length === 2);
}

// --- 14. onRequest interceptor — mutate headers + URL
{
  const fetch = makeMockFetch([jsonResponse(200, { ok: true, version: '1', workers: 0 })]);
  const seen = [];
  const c4 = new C4Client({
    baseUrl: 'http://test',
    fetch,
    onRequest: (ctx) => {
      seen.push({ method: ctx.method, url: ctx.url, attempt: ctx.attempt });
      ctx.headers['X-Request-Id'] = 'req-42';
      return ctx;
    },
  });
  await c4.getHealth();
  check('onRequest fires once before fetch', seen.length === 1);
  check('onRequest sees method', seen[0].method === 'GET');
  check('onRequest sees URL', seen[0].url.endsWith('/api/health'));
  check('onRequest mutation reaches fetch (X-Request-Id)', fetch.calls[0].init.headers['X-Request-Id'] === 'req-42');
}

// --- 15. onResponse interceptor — sees parsed body + duration
{
  const fetch = makeMockFetch([jsonResponse(200, { ok: true, version: 'X', workers: 0 })]);
  const seen = [];
  const c4 = new C4Client({
    baseUrl: 'http://test',
    fetch,
    onResponse: (ctx) => {
      seen.push({ status: ctx.status, ok: ctx.ok, hasBody: !!ctx.body, hasDuration: typeof ctx.durationMs === 'number' });
      return ctx;
    },
  });
  const r = await c4.getHealth();
  check('onResponse fires once', seen.length === 1);
  check('onResponse sees 200 status', seen[0].status === 200);
  check('onResponse ok=true', seen[0].ok === true);
  check('onResponse has parsed body', seen[0].hasBody);
  check('onResponse has durationMs', seen[0].hasDuration);
  check('onResponse return propagates to caller', r.version === 'X');
}

// --- 16. onResponse can rewrite the body before caller sees it
{
  const fetch = makeMockFetch([jsonResponse(200, { wrapped: { ok: true, version: 'inner', workers: 0 } })]);
  const c4 = new C4Client({
    baseUrl: 'http://test',
    fetch,
    onResponse: (ctx) => {
      // Strip a hypothetical wrapper envelope.
      if (ctx.body && typeof ctx.body === 'object' && 'wrapped' in ctx.body) {
        return { ...ctx, body: (ctx.body).wrapped };
      }
      return ctx;
    },
  });
  const r = await c4.getHealth();
  check('onResponse body rewrite reaches caller', r.version === 'inner');
}

// --- 17. onResponse fires on 4xx before C4ApiError throws
{
  const fetch = makeMockFetch([jsonResponse(403, { error: 'forbidden' })]);
  let seenStatus;
  const c4 = new C4Client({
    baseUrl: 'http://test',
    fetch,
    onResponse: (ctx) => { seenStatus = ctx.status; return ctx; },
  });
  try { await c4.getHealth(); } catch {}
  check('onResponse fires on 403 before throw', seenStatus === 403);
}

// --- 18. attempt counter increments on retry
{
  const fetch = makeMockFetch([
    jsonResponse(503, { error: 'busy' }),
    jsonResponse(200, { ok: true, version: 'r', workers: 0 }),
  ]);
  const reqAttempts = [];
  const c4 = new C4Client({
    baseUrl: 'http://test',
    fetch,
    retries: 1,
    backoffMs: 0,
    onRequest: (ctx) => { reqAttempts.push(ctx.attempt); return ctx; },
  });
  await c4.getHealth();
  check('attempt counter passes 0 on first try', reqAttempts[0] === 0);
  check('attempt counter passes 1 on retry', reqAttempts[1] === 1);
}

// --- summary
console.log(`\n${passed} pass, ${failed} fail`);
if (failed > 0) process.exit(1);
