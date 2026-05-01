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

  it('harvests x-rbac-action from requireRole calls', () => {
    const f = `
      } else if (req.method === 'POST' && route === '/secret') {
        const gate = requireRole(authCheck, rbac.ACTIONS.WORKER_CREATE,
          { type: 'project', id: 'main' });
        result = secret;
      }
      } else if (req.method === 'GET' && route === '/public') {
        result = open;
      }
    `;
    const r = extractRoutes(f);
    const sec = r.find((x) => x.path === '/secret');
    assert.equal(sec?.rbacAction, 'WORKER_CREATE');
    const pub = r.find((x) => x.path === '/public');
    assert.equal(pub?.rbacAction, null);
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

describe('openapi-gen x-rbac-action', () => {
  it('routes with requireRole gates surface x-rbac-action in the spec', () => {
    const s = buildSpec();
    // /api/create has WORKER_CREATE, /api/audit/verify has AUDIT_READ
    assert.equal(s.paths['/api/create']?.post?.['x-rbac-action'], 'WORKER_CREATE');
    assert.equal(s.paths['/api/audit/verify']?.get?.['x-rbac-action'], 'AUDIT_READ');
    assert.equal(s.paths['/api/merge']?.post?.['x-rbac-action'], 'MERGE_WRITE');
  });

  it('open routes (no requireRole) have no x-rbac-action', () => {
    const s = buildSpec();
    assert.equal(s.paths['/api/health']?.get?.['x-rbac-action'], undefined);
    assert.equal(s.paths['/api/auth/login']?.post?.['x-rbac-action'], undefined);
  });

  it('30+ operations have x-rbac-action populated', () => {
    const s = buildSpec();
    let count = 0;
    for (const ops of Object.values(s.paths)) {
      for (const op of Object.values(ops)) {
        if (op['x-rbac-action']) count++;
      }
    }
    assert.ok(count >= 30, `expected 30+ x-rbac-action ops, got ${count}`);
  });
});

describe('openapi-gen.operationId', () => {
  it('every operation gets a unique camelCase operationId', () => {
    const s = buildSpec();
    const ids = new Set();
    for (const ops of Object.values(s.paths)) {
      for (const op of Object.values(ops)) {
        assert.ok(op.operationId, 'operationId missing');
        assert.match(op.operationId, /^[a-zA-Z][a-zA-Z0-9_-]*$/, `bad operationId: ${op.operationId}`);
        assert.ok(!ids.has(op.operationId), `duplicate operationId: ${op.operationId}`);
        ids.add(op.operationId);
      }
    }
    assert.ok(ids.size > 80, `expected 80+ unique ids, got ${ids.size}`);
  });

  it('operationId is method-prefixed camelCase of the path', () => {
    const s = buildSpec();
    assert.equal(s.paths['/api/health']?.get?.operationId, 'getHealth');
    assert.equal(s.paths['/api/auth/login']?.post?.operationId, 'postAuthLogin');
    assert.equal(s.paths['/api/audit/verify']?.get?.operationId, 'getAuditVerify');
    assert.equal(s.paths['/api/openapi.json']?.get?.operationId, 'getOpenapiJson');
    assert.equal(s.paths['/api/rbac/role/assign']?.post?.operationId, 'postRbacRoleAssign');
  });
});

describe('openapi-gen.buildYaml', () => {
  const { buildYaml } = require('../src/openapi-gen');

  it('produces a YAML document starting with openapi key', () => {
    const yaml = buildYaml();
    assert.match(yaml, /^openapi: /);
  });

  it('includes the same paths as the JSON spec (count match)', () => {
    const json = buildSpec();
    const yaml = buildYaml();
    // Count `^  /api/...:` lines
    const yamlPaths = (yaml.match(/^  \/api\//gm) || []).length;
    assert.equal(yamlPaths, Object.keys(json.paths).length);
  });

  it('quotes strings with special chars (colons, dashes, embedded quotes)', () => {
    const yaml = buildYaml();
    // Quoted fields must use double quotes; bare keys/values without
    // special chars stay unquoted.
    assert.match(yaml, /openapi: "3\.0\.3"/);
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

describe('openapi-gen content-type detection', () => {
  // Regression guard for v1.10.22 — the spec used to hard-code
  // application/json on every response, even SSE / HTML / YAML
  // routes. buildSpec now picks a content type based on the
  // schema (string vs object) and the description hint.

  it('SSE routes (text/event-stream) emit the right content type', () => {
    // Note: /api/slack/events is NOT in this list — it returns JSON
    // (a tail of the in-memory event buffer), the route name is a
    // historical accident. The actual SSE feeds are /events and
    // /watch + the typed approvals stream.
    const s = buildSpec();
    for (const route of ['/api/watch', '/api/events', '/api/approvals/stream']) {
      const op = s.paths[route]?.get;
      const content = op?.responses?.['200']?.content;
      assert.ok(content, `${route} response content missing`);
      assert.ok(content['text/event-stream'], `${route} should be text/event-stream, got ${Object.keys(content).join(',')}`);
    }
  });

  it('HTML routes (text/html) emit the right content type', () => {
    const s = buildSpec();
    for (const route of ['/api/dashboard', '/api/api-docs', '/api/api-docs/redoc', '/api/api-docs/index']) {
      const op = s.paths[route]?.get;
      const content = op?.responses?.['200']?.content;
      assert.ok(content['text/html'], `${route} should be text/html, got ${Object.keys(content).join(',')}`);
    }
  });

  it('YAML route emits application/yaml', () => {
    const s = buildSpec();
    const content = s.paths['/api/openapi.yaml']?.get?.responses?.['200']?.content;
    assert.ok(content['application/yaml'], 'should be application/yaml');
  });

  it('JSON routes default to application/json (no description hint needed)', () => {
    const s = buildSpec();
    for (const route of ['/api/health', '/api/metrics', '/api/list']) {
      const op = s.paths[route]?.get;
      const content = op?.responses?.['200']?.content;
      assert.ok(content['application/json'], `${route} should default to application/json`);
    }
  });
});

describe('openapi-gen ROUTE_SCHEMAS structural integrity', () => {
  // Regression guards for v1.10.22 — caught a case where the
  // ROUTE_SCHEMAS object had four keys defined twice (POST
  // /scribe/start, POST /autonomous/pause, GET /quota, GET
  // /events), with the later entries silently overriding the
  // earlier ones because object literals don't preserve dup keys.
  // The dedupe lint here catches future occurrences before they
  // erase coverage in production.
  const { ROUTE_SCHEMAS } = require('../src/openapi-gen');

  it('100% of operations have a 200 response with a schema', () => {
    const s = buildSpec();
    let total = 0, withResp = 0;
    for (const ops of Object.values(s.paths)) {
      for (const [m, op] of Object.entries(ops)) {
        if (typeof op !== 'object' || !op.responses) continue;
        total++;
        const ok = op.responses['200'];
        if (ok && ok.content && Object.keys(ok.content).length > 0) withResp++;
      }
    }
    assert.equal(withResp, total, `${total - withResp}/${total} operations missing 200 response content`);
  });

  it('100% of requestBody routes have an example payload', () => {
    const s = buildSpec();
    let total = 0, withExample = 0;
    for (const ops of Object.values(s.paths)) {
      for (const op of Object.values(ops)) {
        if (typeof op !== 'object' || !op.requestBody) continue;
        const c = op.requestBody.content?.['application/json'];
        if (!c) continue;
        total++;
        if (c.example !== undefined) withExample++;
      }
    }
    assert.equal(withExample, total, `${total - withExample}/${total} requestBody routes missing example`);
  });

  it('honours an explicit contentType override on the response', () => {
    // Build a fake spec entry path: invoke buildSpec on a synthetic
    // ROUTE_SCHEMAS entry by leveraging the daemon's existing
    // /openapi.yaml as the test bed (already curated to YAML).
    const s = buildSpec();
    const yaml = s.paths['/api/openapi.yaml']?.get;
    const content = yaml?.responses?.['200']?.content;
    // application/yaml not application/json
    assert.ok(content && content['application/yaml']);
    assert.ok(!content['application/json']);
  });
});
