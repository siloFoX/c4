'use strict';

const { describe, test } = require('node:test');
const assert = require('node:assert');

const {
  LocalLLMAdapter,
  LocalOllamaAdapter,
  LocalLlamaCppAdapter,
  LocalVllmAdapter,
  BACKENDS,
  DEFAULT_ENDPOINTS,
  DEFAULT_MODELS,
} = require('../src/agents/local-llm');
const {
  createAdapter,
  listAdapterTypes,
  REGISTRY,
  isComplexTask,
  pickHybridType,
  DEFAULT_HYBRID_THRESHOLD,
  DEFAULT_COMPLEX_KEYWORDS,
} = require('../src/agents');
const ClaudeCodeAdapter = require('../src/agents/claude-code');

// ---------------------------------------------------------------------------
// Helpers: mock fetch + streamed response bodies
// ---------------------------------------------------------------------------

function streamResponse(frames, { ok = true, status = 200 } = {}) {
  const encoder = new TextEncoder();
  const body = new ReadableStream({
    start(controller) {
      for (const f of frames) controller.enqueue(encoder.encode(f));
      controller.close();
    },
  });
  return { ok, status, body };
}

function errorResponse(status = 500) {
  const encoder = new TextEncoder();
  const body = new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode('error\n'));
      controller.close();
    },
  });
  return { ok: false, status, body };
}

function makeMockFetch(handler) {
  const calls = [];
  const fn = async (url, init) => {
    calls.push({ url, init });
    return handler(url, init, calls.length - 1);
  };
  fn.calls = calls;
  return fn;
}

async function collectOutput(adapter, promise) {
  const chunks = [];
  const off = adapter.onOutput((c) => chunks.push(c));
  const val = await promise;
  off();
  return { value: val, chunks, joined: chunks.join('') };
}

function ollamaJsonl(tokens, { model = 'llama3.1' } = {}) {
  const lines = tokens.map((t) => JSON.stringify({ model, response: t, done: false }));
  lines.push(JSON.stringify({ model, response: '', done: true }));
  return lines.join('\n') + '\n';
}

function openaiSse(tokens, { model = 'm' } = {}) {
  const frames = tokens.map((t) =>
    'data: ' + JSON.stringify({ model, choices: [{ delta: { content: t } }] }) + '\n\n'
  );
  frames.push('data: [DONE]\n\n');
  return frames.join('');
}

// ---------------------------------------------------------------------------
// Backend construction + defaults
// ---------------------------------------------------------------------------

describe('LocalLLMAdapter construction', () => {
  test('defaults to ollama backend with sensible defaults', () => {
    const a = new LocalLLMAdapter();
    assert.strictEqual(a.backend, 'ollama');
    assert.strictEqual(a.url, DEFAULT_ENDPOINTS.ollama);
    assert.strictEqual(a.model, DEFAULT_MODELS.ollama);
    assert.strictEqual(a.metadata.name, 'local-llm');
    assert.strictEqual(a.metadata.backend, 'ollama');
    assert.match(a.metadata.version, /^\d+\.\d+\.\d+$/);
    assert.strictEqual(a.supportsPause, true);
  });

  test('backend-specific subclasses pin the backend', () => {
    assert.strictEqual(new LocalOllamaAdapter().backend, 'ollama');
    assert.strictEqual(new LocalLlamaCppAdapter().backend, 'llama-cpp');
    assert.strictEqual(new LocalVllmAdapter().backend, 'vllm');
  });

  test('llama-cpp + vllm defaults match OpenAI-compat shape expectations', () => {
    const cpp = new LocalLlamaCppAdapter();
    assert.strictEqual(cpp.url, 'http://localhost:8080');
    const vllm = new LocalVllmAdapter();
    assert.strictEqual(vllm.url, 'http://localhost:8000');
    assert.strictEqual(vllm.model, 'meta-llama/Llama-3.1-8B');
  });

  test('unknown backend rejected with helpful message', () => {
    assert.throws(
      () => new LocalLLMAdapter({}, { backend: 'mystery' }),
      /Unknown local LLM backend: mystery.*Supported: ollama, llama-cpp, vllm/
    );
  });

  test('custom url + model override defaults and trailing slash stripped', () => {
    const a = new LocalLLMAdapter({}, {
      backend: 'ollama',
      url: 'http://10.0.0.5:12345/',
      model: 'custom:latest',
    });
    assert.strictEqual(a.url, 'http://10.0.0.5:12345');
    assert.strictEqual(a.model, 'custom:latest');
  });

  test('BACKENDS constant lists exactly the three supported keys', () => {
    assert.deepStrictEqual([...BACKENDS].sort(), ['llama-cpp', 'ollama', 'vllm']);
  });
});

// ---------------------------------------------------------------------------
// Request payload shape
// ---------------------------------------------------------------------------

describe('buildRequest payload shape', () => {
  test('ollama uses /api/generate with {model, prompt, stream:true}', () => {
    const a = new LocalOllamaAdapter({}, { url: 'http://h:11434', model: 'mx' });
    const { url, body } = a.buildRequest('hello world');
    assert.strictEqual(url, 'http://h:11434/api/generate');
    assert.strictEqual(body.model, 'mx');
    assert.strictEqual(body.prompt, 'hello world');
    assert.strictEqual(body.stream, true);
  });

  test('llama-cpp uses /v1/chat/completions with messages + stream:true', () => {
    const a = new LocalLlamaCppAdapter({}, { url: 'http://h:8080', model: 'gguf' });
    const { url, body } = a.buildRequest('hi');
    assert.strictEqual(url, 'http://h:8080/v1/chat/completions');
    assert.strictEqual(body.model, 'gguf');
    assert.strictEqual(body.stream, true);
    assert.ok(Array.isArray(body.messages));
    assert.deepStrictEqual(body.messages[body.messages.length - 1], { role: 'user', content: 'hi' });
  });

  test('vllm payload mirrors llama-cpp OpenAI-compat shape', () => {
    const a = new LocalVllmAdapter({}, { url: 'http://h:8000', model: 'meta-llama/Llama-3.1-8B' });
    const { url, body } = a.buildRequest('question');
    assert.strictEqual(url, 'http://h:8000/v1/chat/completions');
    assert.strictEqual(body.model, 'meta-llama/Llama-3.1-8B');
    assert.strictEqual(body.stream, true);
  });

  test('systemPrompt is prepended as a system message', () => {
    const a = new LocalVllmAdapter({}, { systemPrompt: 'you are terse' });
    const { body } = a.buildRequest('go');
    assert.deepStrictEqual(body.messages[0], { role: 'system', content: 'you are terse' });
    assert.deepStrictEqual(body.messages[1], { role: 'user', content: 'go' });
  });
});

// ---------------------------------------------------------------------------
// Streaming: ollama JSONL
// ---------------------------------------------------------------------------

describe('streaming (ollama JSONL)', () => {
  test('tokens stream through onOutput and concatenate into final text', async () => {
    const fetchMock = makeMockFetch(() => streamResponse([
      ollamaJsonl(['Hel', 'lo ', 'world']),
    ]));
    const a = new LocalOllamaAdapter({}, { fetch: fetchMock, model: 'm' });
    const { value, joined } = await collectOutput(a, a.runInference('greet'));
    assert.strictEqual(value, 'Hello world');
    assert.ok(joined.includes('Hello world'), 'streamed chunks should include full body');
    assert.strictEqual(fetchMock.calls.length, 1);
    assert.strictEqual(fetchMock.calls[0].init.method, 'POST');
    const body = JSON.parse(fetchMock.calls[0].init.body);
    assert.strictEqual(body.stream, true);
  });

  test('done:true frame ends the stream and no history is kept for ollama', async () => {
    const fetchMock = makeMockFetch(() => streamResponse([
      ollamaJsonl(['a', 'b', 'c']),
    ]));
    const a = new LocalOllamaAdapter({}, { fetch: fetchMock });
    const out = await a.runInference('q');
    assert.strictEqual(out, 'abc');
    assert.strictEqual(a._history.length, 0);
  });

  test('fragmented JSONL across chunks re-assembles correctly', async () => {
    const fetchMock = makeMockFetch(() => streamResponse([
      '{"response":"Hel',
      'lo","done":false}\n',
      '{"response":" wor',
      'ld","done":false}\n{"response":"","done":true}\n',
    ]));
    const a = new LocalOllamaAdapter({}, { fetch: fetchMock });
    const out = await a.runInference('x');
    assert.strictEqual(out, 'Hello world');
  });
});

// ---------------------------------------------------------------------------
// Streaming: OpenAI-compat SSE
// ---------------------------------------------------------------------------

describe('streaming (OpenAI-compat SSE)', () => {
  test('llama-cpp SSE tokens stream + [DONE] halts + history grows', async () => {
    const fetchMock = makeMockFetch(() => streamResponse([openaiSse(['Hi ', 'there'])]));
    const a = new LocalLlamaCppAdapter({}, { fetch: fetchMock });
    const out = await a.runInference('hey');
    assert.strictEqual(out, 'Hi there');
    assert.strictEqual(a._history.length, 2);
    assert.strictEqual(a._history[0].role, 'user');
    assert.strictEqual(a._history[0].content, 'hey');
    assert.strictEqual(a._history[1].role, 'assistant');
    assert.strictEqual(a._history[1].content, 'Hi there');
  });

  test('vllm SSE payload is targeted at /v1/chat/completions', async () => {
    const fetchMock = makeMockFetch(() => streamResponse([openaiSse(['ok'])]));
    const a = new LocalVllmAdapter({}, { fetch: fetchMock, url: 'http://h:9001' });
    await a.runInference('ping');
    assert.strictEqual(fetchMock.calls[0].url, 'http://h:9001/v1/chat/completions');
    const body = JSON.parse(fetchMock.calls[0].init.body);
    assert.strictEqual(body.stream, true);
    assert.strictEqual(body.messages[0].role, 'user');
  });

  test('fragmented SSE across chunks re-assembles correctly', async () => {
    const raw = openaiSse(['A', 'B', 'C']);
    const mid = Math.floor(raw.length / 2);
    const fetchMock = makeMockFetch(() => streamResponse([raw.slice(0, mid), raw.slice(mid)]));
    const a = new LocalLlamaCppAdapter({}, { fetch: fetchMock });
    const out = await a.runInference('x');
    assert.strictEqual(out, 'ABC');
  });
});

// ---------------------------------------------------------------------------
// Error handling
// ---------------------------------------------------------------------------

describe('error handling', () => {
  test('connection refused surfaces as an in-band error message, no throw', async () => {
    const fetchMock = makeMockFetch(() => { const e = new Error('ECONNREFUSED'); throw e; });
    const a = new LocalOllamaAdapter({}, { fetch: fetchMock });
    const { joined, value } = await collectOutput(a, a.runInference('hi'));
    assert.strictEqual(value, '');
    assert.match(joined, /\[local-llm:ollama\] error: ECONNREFUSED/);
    assert.strictEqual(a._busy, false, 'busy flag released after failure');
  });

  test('HTTP 500 is surfaced via screen output without throwing', async () => {
    const fetchMock = makeMockFetch(() => errorResponse(500));
    const a = new LocalLlamaCppAdapter({}, { fetch: fetchMock });
    const { joined } = await collectOutput(a, a.runInference('x'));
    assert.match(joined, /HTTP 500/);
  });

  test('missing fetch implementation is reported gracefully', async () => {
    const a = new LocalOllamaAdapter({}, { fetch: null });
    const { joined } = await collectOutput(a, a.runInference('x'));
    assert.match(joined, /fetch implementation unavailable/);
  });
});

// ---------------------------------------------------------------------------
// Adapter interface + PTY-like lifecycle
// ---------------------------------------------------------------------------

describe('adapter + PTY lifecycle', () => {
  test('spawn emits an initial prompt', () => {
    const a = new LocalOllamaAdapter();
    const seen = [];
    a.onOutput((c) => seen.push(c));
    a.spawn({});
    assert.strictEqual(seen.join('').includes('> '), true);
    assert.ok(a.pid >= 1);
  });

  test('resize updates cols/rows and forwards to the ScreenBuffer', () => {
    const a = new LocalOllamaAdapter({}, { cols: 80, rows: 24 });
    a.resize(100, 30);
    assert.strictEqual(a.cols, 100);
    assert.strictEqual(a.rows, 30);
    assert.strictEqual(a.screen.cols, 100);
    assert.strictEqual(a.screen.rows, 30);
  });

  test('sendKey maps named keys and passes through unknown ones', () => {
    const fetchMock = makeMockFetch(() => streamResponse([ollamaJsonl(['x'])]));
    const a = new LocalOllamaAdapter({}, { fetch: fetchMock });
    const seen = [];
    a.onOutput((c) => seen.push(c));
    a.sendKey('Escape');
    a.sendKey('literal');
    assert.ok(seen.join('').includes('\x1b'));
    assert.ok(seen.join('').includes('literal'));
  });

  test('detectIdle false while busy, true when prompt present and idle', () => {
    const a = new LocalOllamaAdapter();
    assert.strictEqual(a.detectIdle('\r\n> '), true);
    a._busy = true;
    assert.strictEqual(a.detectIdle('\r\n> '), false);
    a._busy = false;
    assert.strictEqual(a.detectIdle('nothing interesting'), false);
    assert.strictEqual(a.detectIdle(null), false);
  });

  test('write triggers inference on newline and returns the promise', async () => {
    const fetchMock = makeMockFetch(() => streamResponse([ollamaJsonl(['ok'])]));
    const a = new LocalOllamaAdapter({}, { fetch: fetchMock });
    const p = a.write('hi there\r');
    assert.ok(p && typeof p.then === 'function', 'write returns a Promise when inference triggers');
    const out = await p;
    assert.strictEqual(out, 'ok');
    assert.strictEqual(fetchMock.calls.length, 1);
    const body = JSON.parse(fetchMock.calls[0].init.body);
    assert.strictEqual(body.prompt, 'hi there');
  });

  test('dispose kills in-flight + clears listeners and stays inert after', async () => {
    let aborted = false;
    const fetchMock = makeMockFetch(async (_url, init) => {
      return await new Promise((resolve, reject) => {
        if (init && init.signal) {
          init.signal.addEventListener('abort', () => {
            aborted = true;
            reject(new Error('aborted'));
          });
        }
        setTimeout(() => resolve(streamResponse([ollamaJsonl(['late'])])), 50);
      });
    });
    const a = new LocalOllamaAdapter({}, { fetch: fetchMock });
    const p = a.runInference('slow');
    a.dispose();
    // Await inflight; error-path should resolve to ''
    const out = await p;
    assert.strictEqual(out, '');
    assert.strictEqual(aborted, true);
    assert.strictEqual(a._disposed, true);
    assert.strictEqual(a._outputHandlers.length, 0);
    // write() after dispose is inert
    const seen = [];
    a.onOutput((c) => seen.push(c));
    const follow = a.write('ignored\r');
    assert.strictEqual(follow, null);
    assert.strictEqual(seen.length, 0);
  });
});

// ---------------------------------------------------------------------------
// Hybrid routing heuristic
// ---------------------------------------------------------------------------

describe('hybrid routing heuristic', () => {
  test('short, simple prompt routes to local', () => {
    assert.strictEqual(isComplexTask('fix typo in README'), false);
    assert.strictEqual(pickHybridType('fix typo in README'), 'local-ollama');
  });

  test('prompt over default threshold routes to claude-code', () => {
    const big = 'x'.repeat(DEFAULT_HYBRID_THRESHOLD + 1);
    assert.strictEqual(isComplexTask(big), true);
    assert.strictEqual(pickHybridType(big), 'claude-code');
  });

  test('complex keywords trigger claude-code (case-insensitive)', () => {
    for (const kw of DEFAULT_COMPLEX_KEYWORDS) {
      assert.strictEqual(isComplexTask(`please ${kw.toUpperCase()} the module`), true);
    }
    assert.strictEqual(pickHybridType('we should REFACTOR storage layer'), 'claude-code');
    assert.strictEqual(pickHybridType('Architect a new caching tier'), 'claude-code');
    assert.strictEqual(pickHybridType('Design the schema'), 'claude-code');
  });

  test('custom hybridThreshold override wins', () => {
    const task = '1234567890A'; // 11 chars
    assert.strictEqual(isComplexTask(task, { threshold: 10 }), true);
    assert.strictEqual(pickHybridType(task, { hybridThreshold: 10 }), 'claude-code');
    assert.strictEqual(pickHybridType(task, { hybridThreshold: 100 }), 'local-ollama');
  });

  test('custom complexKeywords list replaces defaults', () => {
    assert.strictEqual(
      pickHybridType('refactor everything', { complexKeywords: ['migrate'] }),
      'local-ollama',
      'refactor should no longer match when keywords are overridden'
    );
    assert.strictEqual(
      pickHybridType('please migrate the DB', { complexKeywords: ['migrate'] }),
      'claude-code'
    );
  });

  test('custom local/complex targets are honored', () => {
    assert.strictEqual(
      pickHybridType('short task', { local: 'local-vllm' }),
      'local-vllm'
    );
    assert.strictEqual(
      pickHybridType('refactor everything', { complex: 'local-llama-cpp' }),
      'local-llama-cpp'
    );
  });
});

// ---------------------------------------------------------------------------
// Factory integration
// ---------------------------------------------------------------------------

describe('createAdapter factory - local + hybrid wiring', () => {
  test('REGISTRY exposes the 3 new local keys alongside claude-code', () => {
    const keys = listAdapterTypes().sort();
    assert.deepStrictEqual(keys, ['claude-code', 'local-llama-cpp', 'local-ollama', 'local-vllm']);
    assert.strictEqual(REGISTRY['local-ollama'], LocalOllamaAdapter);
    assert.strictEqual(REGISTRY['local-llama-cpp'], LocalLlamaCppAdapter);
    assert.strictEqual(REGISTRY['local-vllm'], LocalVllmAdapter);
  });

  test('explicit local-ollama selection returns LocalOllamaAdapter', () => {
    const a = createAdapter({ type: 'local-ollama' });
    assert.ok(a instanceof LocalOllamaAdapter);
    assert.strictEqual(a.metadata.backend, 'ollama');
  });

  test('options under agent.options[type] reach the adapter', () => {
    const a = createAdapter({
      type: 'local-vllm',
      options: {
        'local-vllm': { url: 'http://10.0.0.1:9000', model: 'big-model' },
      },
    });
    assert.strictEqual(a.url, 'http://10.0.0.1:9000');
    assert.strictEqual(a.model, 'big-model');
  });

  test('hybrid type + short task routes to local', () => {
    const a = createAdapter({ type: 'hybrid' }, { task: 'list tests in tests/' });
    assert.ok(a instanceof LocalOllamaAdapter);
  });

  test('hybrid type + long task routes to claude-code', () => {
    const a = createAdapter({ type: 'hybrid' }, { task: 'y'.repeat(DEFAULT_HYBRID_THRESHOLD + 10) });
    assert.ok(a instanceof ClaudeCodeAdapter);
  });

  test('hybrid type + keyword task routes to claude-code', () => {
    const a = createAdapter({ type: 'hybrid' }, { task: 'refactor the dispatcher' });
    assert.ok(a instanceof ClaudeCodeAdapter);
  });

  test('legacyOpts.hybrid=true flips any explicit type into routing mode', () => {
    const a = createAdapter(
      { type: 'claude-code' },
      { hybrid: true, task: 'fix lint' }
    );
    assert.ok(a instanceof LocalOllamaAdapter);
  });

  test('agentConfig.hybridThreshold override respected by factory', () => {
    const a = createAdapter(
      { type: 'hybrid', hybridThreshold: 5 },
      { task: '123456' }
    );
    assert.ok(a instanceof ClaudeCodeAdapter);
  });

  test('backwards compat: claude-code still the default', () => {
    const a = createAdapter();
    assert.strictEqual(a.metadata.name, 'claude-code');
  });
});
