'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { buildSpec, extractRoutes, ROUTE_SUMMARIES } = require('../src/openapi-gen');

describe('openapi-gen.extractRoutes', () => {
  const fixture = `
    if (req.method === 'GET' && route === '/health') { result = ok; }
    else if (req.method === 'POST' && route === '/foo') { return; }
    else if (req.method === 'GET' && route === '/health') { dup; }
    else if (route.startsWith('/skip')) { skipped; }
    else if (req.method === 'PATCH' && route === '/bar') { result = patch; }
  `;

  it('extracts (method, path) literal-string branches', () => {
    const r = extractRoutes(fixture);
    assert.equal(r.length, 3);
    assert.deepEqual(r.map((x) => `${x.method} ${x.path}`), [
      'GET /health',
      'POST /foo',
      'PATCH /bar',
    ]);
  });

  it('deduplicates repeat (method, path) pairs', () => {
    // The third clause repeats GET /health — should NOT appear twice.
    const r = extractRoutes(fixture);
    const healthCount = r.filter((x) => x.method === 'GET' && x.path === '/health').length;
    assert.equal(healthCount, 1);
  });

  it('skips non-literal route checks (startsWith / regex / etc)', () => {
    const r = extractRoutes(fixture);
    assert.ok(!r.some((x) => x.path === '/skip'));
  });

  it('harvests inline comment as summary when present', () => {
    const f = `
      } else if (req.method === 'GET' && route === '/with-comment') {
        // Single-line description of what this route does.
        result = something;
      }
      } else if (req.method === 'POST' && route === '/multiline') {
        // First comment line.
        // Second comment line.
        const x = 1;
      }
      } else if (req.method === 'GET' && route === '/no-comment') {
        result = bare;
      }
    `;
    const r = extractRoutes(f);
    const wc = r.find((x) => x.path === '/with-comment');
    assert.equal(wc.inlineSummary, 'Single-line description of what this route does.');
    const ml = r.find((x) => x.path === '/multiline');
    assert.equal(ml.inlineSummary, 'First comment line. Second comment line.');
    const nc = r.find((x) => x.path === '/no-comment');
    assert.equal(nc.inlineSummary, '');
  });
});

describe('openapi-gen.buildSpec', () => {
  it('produces a valid OpenAPI 3.0 envelope', () => {
    const s = buildSpec({ daemonPath: path.join(__dirname, '..', 'src', 'daemon.js') });
    assert.equal(s.openapi, '3.0.3');
    assert.ok(s.info && typeof s.info.title === 'string');
    assert.ok(s.info.version, 'info.version present');
    assert.ok(Array.isArray(s.servers) && s.servers.length > 0);
    assert.ok(typeof s.paths === 'object' && s.paths !== null);
  });

  it('extracts all daemon routes into paths', () => {
    const s = buildSpec();
    const pathCount = Object.keys(s.paths).length;
    // The daemon has 95+ literal route handlers — guard against a future
    // refactor that accidentally collapses them.
    assert.ok(pathCount > 80, `expected 80+ paths, got ${pathCount}`);
  });

  it('every path is namespaced under /api/', () => {
    const s = buildSpec();
    for (const p of Object.keys(s.paths)) {
      assert.match(p, /^\/api\//, `path ${p} not under /api/`);
    }
  });

  it('every operation has a summary + responses', () => {
    const s = buildSpec();
    for (const [pth, ops] of Object.entries(s.paths)) {
      for (const [method, op] of Object.entries(ops)) {
        assert.ok(typeof op.summary === 'string', `${method} ${pth} missing summary`);
        assert.ok(op.responses && op.responses['200'], `${method} ${pth} missing 200 response`);
      }
    }
  });

  it('curated summaries from ROUTE_SUMMARIES override the default', () => {
    const s = buildSpec();
    // /api/health is in ROUTE_SUMMARIES — should match the curated string.
    const healthSummary = s.paths['/api/health']?.get?.summary || '';
    assert.match(healthSummary, /liveness probe/);
  });

  it('inline comment harvest fills routes the curated map has not caught up with', () => {
    const s = buildSpec();
    // Count operations whose summary is a meaningful sentence (not the
    // `<METHOD> /path` fallback). Should be substantially > the curated
    // ROUTE_SUMMARIES count once harvest is wired in.
    let meaningful = 0;
    for (const ops of Object.values(s.paths)) {
      for (const op of Object.values(ops)) {
        const fb = `${Object.keys({}).length}`; // unused
        const isFallback = /^(GET|POST|PUT|DELETE|PATCH) \//.test(op.summary);
        if (!isFallback) meaningful++;
      }
    }
    // Curated map has ~25 entries; harvest should push the meaningful
    // count well above that.
    assert.ok(meaningful > 50, `expected 50+ meaningful summaries, got ${meaningful}`);
  });

  it('exposes the openapi route itself in the spec', () => {
    const s = buildSpec();
    assert.ok(s.paths['/api/openapi.json'], '/api/openapi.json missing from paths');
    assert.ok(s.paths['/api/openapi.json'].get, 'GET method missing on /api/openapi.json');
  });

  it('honours the version override', () => {
    const s = buildSpec({ version: '9.9.9' });
    assert.equal(s.info.version, '9.9.9');
  });
});

describe('openapi-gen.ROUTE_SCHEMAS', () => {
  const { ROUTE_SCHEMAS } = require('../src/openapi-gen');

  it('every key is `<METHOD> <path>` shape', () => {
    for (const key of Object.keys(ROUTE_SCHEMAS)) {
      assert.match(key, /^(GET|POST|PUT|DELETE|PATCH) \//, `bad key shape: ${key}`);
    }
  });

  it('requestBody schemas are populated into the operation envelope', () => {
    const s = buildSpec();
    const op = s.paths['/api/auth/login']?.post;
    assert.ok(op?.requestBody, 'POST /api/auth/login requestBody missing');
    assert.equal(op.requestBody.required, true);
    const schema = op.requestBody.content['application/json'].schema;
    assert.equal(schema.type, 'object');
    assert.deepEqual(schema.required.sort(), ['password', 'user']);
    assert.ok(schema.properties.user);
  });

  it('parameters schemas are populated for GET routes', () => {
    const s = buildSpec();
    const op = s.paths['/api/read']?.get;
    assert.ok(Array.isArray(op?.parameters));
    const nameParam = op.parameters.find((p) => p.name === 'name');
    assert.ok(nameParam, 'name query param missing');
    assert.equal(nameParam.in, 'query');
    assert.equal(nameParam.required, true);
  });

  it('response schemas land under responses[200].content.application/json', () => {
    const s = buildSpec();
    const op = s.paths['/api/health']?.get;
    const schema = op?.responses?.['200']?.content?.['application/json']?.schema;
    assert.ok(schema, 'GET /api/health 200 response schema missing');
    assert.ok(schema.properties.ok);
  });

  it('routes without ROUTE_SCHEMAS still get the bare envelope', () => {
    const s = buildSpec();
    // Find any route without schemas and assert the bare envelope.
    let bare = null;
    for (const [p, ops] of Object.entries(s.paths)) {
      for (const [m, op] of Object.entries(ops)) {
        if (!op.requestBody && !op.parameters) {
          bare = { p, m, op };
          break;
        }
      }
      if (bare) break;
    }
    assert.ok(bare, 'expected at least one route without schemas');
    assert.ok(bare.op.summary, 'still has summary');
    assert.ok(bare.op.responses['200'], 'still has 200 response');
  });

  it('example values land on the mediaType (Swagger UI Try-it-out renders them)', () => {
    const s = buildSpec();
    const login = s.paths['/api/auth/login']?.post?.requestBody?.content?.['application/json'];
    assert.ok(login.example, 'login example missing');
    assert.equal(login.example.user, 'admin');
    // Schema does NOT carry the example (kept distinct so validators stay clean).
    assert.ok(!login.schema.example, 'example should not duplicate to schema');
  });
});

describe('openapi-gen.ROUTE_SUMMARIES', () => {
  it('every key is `<METHOD> <path>` shape', () => {
    for (const key of Object.keys(ROUTE_SUMMARIES)) {
      assert.match(key, /^(GET|POST|PUT|DELETE|PATCH) \//, `bad key shape: ${key}`);
    }
  });

  it('every value is a non-empty string', () => {
    for (const [key, val] of Object.entries(ROUTE_SUMMARIES)) {
      assert.equal(typeof val, 'string', `${key} value not string`);
      assert.ok(val.length > 0, `${key} empty summary`);
    }
  });
});
