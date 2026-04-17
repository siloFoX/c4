# c4-sdk

Programmatic control of the C4 daemon from Node.js. Every c4 CLI
command has a matching method on `C4Client`, so callers can spin up
workers, send tasks, stream output, and merge branches without
shelling out.

## Install

```bash
npm install c4-sdk
```

Requires Node.js >= 18. The package has zero runtime dependencies and
uses the platform `fetch` to talk to the daemon.

## Quick start

```js
const { C4Client } = require('c4-sdk');

const c4 = new C4Client({
  base: 'http://localhost:3456',
  token: process.env.C4_TOKEN, // required if the daemon has auth enabled
});

await c4.createWorker('w1', { target: 'local' });
await c4.sendTask('w1', 'analyze src/ and write a summary to NOTES.md', {
  autoMode: true,
});

for await (const ev of c4.watch('w1')) {
  if (ev.type === 'output') process.stdout.write(ev.dataText);
  if (ev.type === 'complete') break;
}

const result = await c4.readOutput('w1', { wait: true });
console.log(result.output);
```

See [`examples/basic.js`](./examples/basic.js) for an end-to-end
spawn -> task -> watch -> read -> close walkthrough.

## Auth (JWT)

When the daemon is started with `auth.enabled: true` in `config.json`,
every API call (except `/health` and `/auth/login`) requires a bearer
token. The SDK sends the token on the `Authorization: Bearer <jwt>`
header for JSON endpoints and appends `?token=<jwt>` on the SSE watch
URL, since `EventSource` style clients cannot set custom headers.

Obtain a token once with the daemon's login endpoint (or the
`c4 login` CLI) and pass it into the client:

```js
const loginRes = await fetch('http://localhost:3456/auth/login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ user: 'admin', password: '...' }),
});
const { token } = await loginRes.json();

const c4 = new C4Client({ base: 'http://localhost:3456', token });
```

Tokens are signed with HS256 and expire after 24h by default. When a
token has expired, requests throw `C4Error` with `status === 401`;
catch that and call the login endpoint again.

## API summary

| Method | HTTP route | Description |
| --- | --- | --- |
| `health()` | `GET /health` | Daemon health + worker count. |
| `listWorkers()` | `GET /list` | All workers, queued tasks, lost workers. |
| `getWorker(name)` | `GET /list` | Convenience filter over `listWorkers()`. |
| `createWorker(name, opts)` | `POST /create` | Spawn a new PTY worker. |
| `sendTask(name, task, opts)` | `POST /task` | Queue or send a task. `opts.autoMode`, `opts.branch`, etc. |
| `sendInput(name, text)` | `POST /send` | Raw stdin to the worker PTY. |
| `sendKey(name, key)` | `POST /key` | Send a named key (e.g. `Enter`, `C-c`). |
| `readOutput(name, opts)` | `GET /read` \| `/read-now` \| `/wait-read` | Read screen buffer. `opts.now`, `opts.wait`, `opts.timeoutMs`. |
| `watch(name)` | `GET /watch` (SSE) | `AsyncIterable<WatchEvent>` of decoded PTY events. |
| `merge(name, opts)` | `POST /merge` | Merge the worker branch into main. |
| `close(name)` | `POST /close` | Terminate the worker. |
| `fleetOverview(opts)` | `GET /fleet/overview` | Aggregate state across peers. |

All methods return the parsed JSON body from the daemon. Errors are
thrown as `C4Error` with `.status` (HTTP code) and `.body` (parsed
error payload) set. Network failures preserve the original error via
`.cause`.

### Watch events

`c4.watch(name)` returns an async iterable. Each yielded value is the
parsed SSE payload; for `type === 'output'` the SDK decodes the
base64 `data` field into `dataText` for convenience:

```js
for await (const ev of c4.watch('w1', { signal: ac.signal })) {
  switch (ev.type) {
    case 'connected': console.log('attached'); break;
    case 'output':    process.stdout.write(ev.dataText); break;
    case 'complete':  console.log('worker done', ev); return;
    case 'error':     console.error('worker error', ev); break;
  }
}
```

Pass an `AbortSignal` via `{ signal }` to cancel the stream, or call
`break` inside the `for await` to clean up the underlying fetch.

## TypeScript

Types are shipped as `lib/index.d.ts` (hand-written, no build step).
Import just like the JavaScript entry:

```ts
import { C4Client, C4Error, WatchEvent } from 'c4-sdk';
```

## License

MIT. See the top-level `LICENSE`.
