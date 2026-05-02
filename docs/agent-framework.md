# Agent Framework — Writing a New Adapter

C4's daemon (PtyManager) talks to a backend agent through a single
abstraction: an **Adapter**. The framework today ships four production
adapters (`claude-code`, `local-ollama`, `local-llama-cpp`,
`local-vllm`) plus one test fixture (`mock`). This document is the
reference for adding a fifth.

The contract lives in [`src/agents/adapter.js`](../src/agents/adapter.js).
The minimal-but-correct implementation lives in
[`src/agents/mock.js`](../src/agents/mock.js) — copy-paste it as your
starting point.

## Why the abstraction exists

The daemon's state machine, screen buffer, scope guard, hook system,
PTY resize, idle detection, intervention recovery, and Slack
notifications all live one layer above the adapter. As long as your
adapter implements the contract, none of those subsystems need to
know whether the agent under your PTY is Claude Code, Codex, a local
LLM, or a fixture.

That's the deal: implement five methods + two getters, register one
key in the factory, and the rest of C4 lights up around your backend
for free.

## The contract

```js
class MyAdapter extends Adapter {
  // Identity — surfaced in audit, snapshots, /openapi.json
  get metadata() { return { name: 'my-backend', version: '0.1.0' }; }

  // True if your backend can pause/resume an in-flight task cleanly.
  // Claude Code today: false (Ctrl-C interrupts, no real pause).
  get supportsPause() { return false; }

  // Attach to a worker context. PtyManager calls this after spawn.
  // workerCtx carries { proc, screen, name, ... } — store what you need.
  init(workerCtx) { this._workerCtx = workerCtx || null; }

  // Send raw text. No automatic trailing newline.
  sendInput(text) { /* ... */ }

  // Send a named key. At minimum map: Enter / Escape / Tab / Backspace
  // / Up / Down / Left / Right / C-c / C-d. Unknown names should pass
  // through unchanged — operators sometimes need to send arbitrary
  // escape sequences.
  sendKey(key) { /* ... */ }

  // Register an output listener; return an unsubscribe fn. Your
  // adapter is responsible for calling each registered cb with every
  // chunk of agent output it receives.
  onOutput(cb) { /* ... */ }

  // Inspect a chunk (or the full screen text — your choice) and
  // return true when the agent is idle at its prompt. The daemon
  // polls this to decide when a task is done.
  detectIdle(chunkOrScreen) { /* ... */ }
}
```

`validateAdapter(instance)` exercises the shape at wire-up time so a
broken adapter fails on construction, not mid-task. Your tests should
call it.

## The four hardest things and how MockAdapter handles them

### 1. Listener-before-output ordering

Real backends sometimes emit output before the daemon attaches its
listener. If your adapter drops those chunks, the daemon loses the
first part of the agent's response.

`MockAdapter` queues chunks until the first `onOutput` listener
attaches, then flushes:

```js
pushOutput(chunk) {
  if (this._outputHandlers.length === 0) {
    this._scriptedChunks.push(chunk);
    return;
  }
  for (const h of this._outputHandlers) {
    try { h(chunk); } catch { /* swallow */ }
  }
}

onOutput(cb) {
  this._outputHandlers.push(cb);
  this._maybeFlush();   // <-- replays anything queued
  return () => { /* unsubscribe */ };
}
```

If your backend doesn't buffer (some PTYs don't), still implement
this: it costs nothing and saves debugging when a future caller
attaches late.

### 2. Listener errors must not kill the PTY loop

A misbehaving consumer can throw from inside its listener. If that
throw escapes, every other consumer stops receiving output and the
daemon's hook chain breaks. Always wrap each handler call:

```js
for (const h of this._outputHandlers) {
  try { h(chunk); } catch { /* swallow per-handler */ }
}
```

### 3. Idle detection has to be cheap and stateless

The daemon may call `detectIdle` thousands of times per task. It
should be a pure function of the chunk (or the latest screen text)
plus any cheap cached state on the adapter. Don't I/O. Don't await.

`MockAdapter` exposes a setter so tests can flip it deterministically:

```js
detectIdle(_chunk) { return this._idle === true; }
setIdle(value) { this._idle = value === true; }   // === true, no truthy coercion
```

For real backends, match against a stable prompt string (Claude Code:
`'❯' + 'for shortcuts'`; local LLM: `'> '`). Be conservative —
the cost of a false positive (declaring idle when the agent is still
working) is much higher than a false negative (one extra polling
tick).

### 4. Init context is mutable

`init(workerCtx)` may be called more than once — for example after a
worker re-init. `init(null)` clears the context. Don't assume
single-use:

```js
init(workerCtx) { this._workerCtx = workerCtx || null; }
```

## Registering with the factory

Add one line to [`src/agents/index.js`](../src/agents/index.js):

```js
const MyAdapter = require('./my-backend');

const REGISTRY = {
  'claude-code': ClaudeCodeAdapter,
  'local-ollama': LocalOllamaAdapter,
  // ...
  'my-backend': MyAdapter,   // <-- here
};
```

Operators select your adapter via `agent.type` in `config.json`:

```json
{
  "agent": {
    "type": "my-backend",
    "options": { "url": "...", "model": "..." }
  }
}
```

`createAdapter()` resolves a per-type sub-bag (`options['my-backend']`)
when present, falling back to the flat options bag for legacy callers.
Take advantage of this when your adapter needs settings that would
collide with another backend's options.

## Hybrid routing

If your backend handles "simple" tasks well and you want C4 to fall
back to a more capable backend for complex prompts, use the existing
hybrid mode instead of building your own routing:

```json
{
  "agent": {
    "type": "hybrid",
    "local": "my-backend",
    "complex": "claude-code",
    "hybridThreshold": 2000,
    "complexKeywords": ["refactor", "architect", "design"]
  }
}
```

The factory inspects `legacyOpts.task` / `legacyOpts.prompt` and
picks `local` or `complex` per `isComplexTask()` heuristic. You don't
need to do anything beyond registering both keys.

## Testing your adapter

The framework runs an automatic shape check against every entry in
`REGISTRY` via
[`tests/agent-adapter-contract.test.js`](../tests/agent-adapter-contract.test.js).
Adding your adapter to `REGISTRY` automatically picks up the
suite. If your constructor needs special opts (e.g. `fetch: null` to
avoid binding `globalThis.fetch`), add one line to the
`ADAPTER_OPTS` table at the top of that file. The contract test
covers eight uniform checks per adapter:

```
1. validateAdapter() returns true on a fresh instance
2. metadata.name is a non-empty string
3. metadata.version is a non-empty string
4. supportsPause is a boolean
5. onOutput(fn) returns an unsubscribe function
6. unsubscribe is idempotent (calling twice does not throw)
7. init(null) does not throw
8. init({}) does not throw
```

That's the **shallow** layer — uniform across all adapters.

For the **deep** layer (what your adapter actually does), mirror
[`tests/agent-mock.test.js`](../tests/agent-mock.test.js) which
covers, in order, the contract checks every adapter should pass:

1. `validateAdapter()` returns `true` on a freshly-constructed
   instance.
2. `metadata.name` / `metadata.version` are non-empty strings.
3. `supportsPause` is a boolean.
4. `sendInput(text)` records / forwards the text.
5. `sendKey(name)` maps the named keys you support and passes
   through unknowns.
6. `onOutput(cb)` returns an unsubscribe fn that actually unsubscribes.
7. Listener errors don't break other listeners.
8. `pushOutput` (or your equivalent) before `onOutput` queues + flushes
   on attach.
9. `detectIdle` returns the expected booleans for representative
   chunks.
10. Factory registration: `listAdapterTypes()` includes your key,
    `createAdapter({type:'my-backend'})` returns an instance of your
    class.
11. Options forwarding from `agent.options` reach your adapter's
    constructor.

The full agent-mock suite is 20 cases across 6 describe blocks. If
yours is shorter, you've probably skipped the queueing or
error-isolation tests — add them.

## Common mistakes

| Mistake | Symptom | Fix |
|---------|---------|-----|
| Throwing from `onOutput` listener loop | other listeners stop firing, daemon hooks break | wrap each handler call in try/catch |
| Dropping output before listener attaches | first chunk of every task missing | queue + flush on first attach |
| Returning truthy non-true from `detectIdle` | flaky idle transitions | strict `=== true` check |
| Hard-coding metadata.name | adapter can't be re-purposed for fixtures | accept `opts.name` override |
| Awaiting in `detectIdle` | daemon polling stalls | keep it pure-sync |
| Forgetting `init(null)` clear | stale worker context lingers across re-spawn | `this._workerCtx = workerCtx \|\| null;` |

## Further reading

- [`src/agents/adapter.js`](../src/agents/adapter.js) — base class +
  `validateAdapter()`
- [`src/agents/mock.js`](../src/agents/mock.js) — minimal reference
  implementation
- [`src/agents/claude-code.js`](../src/agents/claude-code.js) —
  production PTY-driven adapter (pattern matching, keystroke
  generators)
- [`src/agents/local-llm.js`](../src/agents/local-llm.js) —
  HTTP-streaming adapter (no PTY, ScreenBuffer simulated internally)
- [`src/agents/index.js`](../src/agents/index.js) — factory + hybrid
  routing
- [`tests/agent-mock.test.js`](../tests/agent-mock.test.js) — deep
  contract test template (per-adapter behaviour)
- [`tests/agent-adapter-contract.test.js`](../tests/agent-adapter-contract.test.js)
  — shallow contract test that runs uniformly across every entry in
  `REGISTRY`
