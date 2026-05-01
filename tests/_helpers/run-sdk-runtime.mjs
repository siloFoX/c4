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

// --- summary
console.log(`\n${passed} pass, ${failed} fail`);
if (failed > 0) process.exit(1);
