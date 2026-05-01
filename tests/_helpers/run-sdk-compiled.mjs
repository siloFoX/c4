// Smoke test for the compiled SDK in sdk/dist/.
// Verifies the tsc → dist pipeline produces a runnable ESM that
// behaves the same as the source TS (which run-sdk-runtime.mjs
// already exercises in detail).

import { C4Client, C4ApiError } from '../../sdk/dist/c4-client.js';

let passed = 0, failed = 0;
function check(label, cond) {
  if (cond) { console.log(`OK ${label}`); passed++; }
  else { console.log(`FAIL ${label}`); failed++; }
}

function jsonResponse(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

// --- 1. Basic GET happy path
{
  const fetch = async () => jsonResponse(200, { ok: true, version: '1.10.8', workers: 0 });
  const c4 = new C4Client({ baseUrl: 'http://test', fetch });
  const h = await c4.getHealth();
  check('compiled SDK getHealth returns parsed body', h.version === '1.10.8');
}

// --- 2. C4ApiError class is the same class
{
  const fetch = async () => jsonResponse(403, { error: 'forbidden' });
  const c4 = new C4Client({ baseUrl: 'http://test', fetch });
  let err;
  try { await c4.getHealth(); } catch (e) { err = e; }
  check('compiled SDK throws C4ApiError', err instanceof C4ApiError);
  check('compiled SDK preserves status', err && err.status === 403);
}

// --- 3. Method count matches source (regression guard against tsc dropping things)
{
  const fetch = async () => jsonResponse(200, {});
  const c4 = new C4Client({ baseUrl: 'http://test', fetch });
  const proto = Object.getPrototypeOf(c4);
  const methods = Object.getOwnPropertyNames(proto).filter((n) => typeof proto[n] === 'function' && n !== 'constructor');
  check('compiled SDK has 100+ methods', methods.length >= 100, `count=${methods.length}`);
}

console.log(`\n${passed} pass, ${failed} fail`);
if (failed > 0) process.exit(1);
