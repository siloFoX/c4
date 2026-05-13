'use strict';

// (1.11.90) Daemon WebSocket attach endpoint tests for TODO 11.72.
// The endpoint lives behind server.on('upgrade', ...) in daemon.js and
// delegates all the protocol mechanics to src/ws-attach.js. Tests come
// in two flavours:
//
//   1. Pure unit tests against ws-attach.js (handshake key derivation,
//      frame encoding, frame decoding, path parsing).
//   2. End-to-end tests that spin up an in-process http.Server with
//      the same upgrade-handler wiring daemon.js uses, point a
//      ws-client at it, and assert that worker output flows out, that
//      inbound frames are written to a stub manager, and that
//      readonly=1 drops inbound frames.
//
// Spawning the full daemon would require a real config.json + state
// + port management, which the CI run cannot tolerate when many tests
// run back to back; mirroring the wiring inline is the same trade
// daemon-api.test.js already makes for /key and /merge.

const assert = require('assert');
const http = require('http');
const { describe, it, before, after } = require('node:test');
const { EventEmitter } = require('events');

const wsAttach = require('../src/ws-attach');
const wsClient = require('../src/ws-client');

describe('ws-attach: handshake helpers (1.11.90)', () => {
  it('acceptKey matches the RFC 6455 example', () => {
    // The RFC's worked example: Sec-WebSocket-Key
    // 'dGhlIHNhbXBsZSBub25jZQ==' should produce
    // 's3pPLMBiTxaQ9kYGzzhZRbK+xOo=' as the accept value.
    const key = 'dGhlIHNhbXBsZSBub25jZQ==';
    const accept = wsAttach.acceptKey(key);
    assert.strictEqual(accept, 's3pPLMBiTxaQ9kYGzzhZRbK+xOo=');
  });

  it('buildHandshakeResponse produces a complete HTTP/1.1 101 reply', () => {
    const reply = wsAttach.buildHandshakeResponse('dGhlIHNhbXBsZSBub25jZQ==');
    assert.ok(reply.startsWith('HTTP/1.1 101 Switching Protocols\r\n'),
      `expected HTTP/1.1 101 line; got: ${reply.split('\r\n')[0]}`);
    assert.ok(reply.includes('Upgrade: websocket\r\n'));
    assert.ok(reply.includes('Connection: Upgrade\r\n'));
    assert.ok(reply.includes('Sec-WebSocket-Accept: s3pPLMBiTxaQ9kYGzzhZRbK+xOo=\r\n'));
    assert.ok(reply.endsWith('\r\n\r\n'));
  });

  it('buildRejectResponse encodes a JSON body with the right Content-Length', () => {
    const body = '{"error":"not found"}';
    const reply = wsAttach.buildRejectResponse(404, 'Not Found', body);
    assert.ok(reply.startsWith('HTTP/1.1 404 Not Found\r\n'));
    assert.ok(reply.includes(`Content-Length: ${Buffer.byteLength(body)}\r\n`));
    assert.ok(reply.endsWith(body));
  });
});

describe('ws-attach: frame encoder (1.11.90)', () => {
  it('encodes a short text frame as FIN + opcode 0x1 + length', () => {
    const frame = wsAttach.encodeTextFrame('hello');
    // 0x81 = FIN | text, 0x05 = length 5 (no mask bit because server)
    assert.strictEqual(frame[0], 0x81);
    assert.strictEqual(frame[1], 0x05);
    assert.strictEqual(frame.subarray(2).toString('utf8'), 'hello');
  });

  it('encodes a 126..0xFFFF length text frame with 16-bit length', () => {
    const payload = 'a'.repeat(200);
    const frame = wsAttach.encodeTextFrame(payload);
    assert.strictEqual(frame[0], 0x81);
    assert.strictEqual(frame[1], 126);
    assert.strictEqual(frame.readUInt16BE(2), 200);
    assert.strictEqual(frame.subarray(4).toString('utf8'), payload);
  });

  it('encodeBinaryFrame uses opcode 0x2', () => {
    const frame = wsAttach.encodeBinaryFrame(Buffer.from([1, 2, 3]));
    assert.strictEqual(frame[0], 0x82);
    assert.strictEqual(frame[1], 3);
  });

  it('encodeCloseFrame embeds the close code in big-endian', () => {
    const frame = wsAttach.encodeCloseFrame(1008, 'worker not found');
    assert.strictEqual(frame[0], 0x88); // FIN | close
    assert.strictEqual(frame[1], 2 + Buffer.byteLength('worker not found'));
    assert.strictEqual(frame.readUInt16BE(2), 1008);
    assert.strictEqual(frame.subarray(4).toString('utf8'), 'worker not found');
  });

  it('encodeCloseFrame with no code is a zero-payload frame', () => {
    const frame = wsAttach.encodeCloseFrame();
    assert.strictEqual(frame[0], 0x88);
    assert.strictEqual(frame[1], 0);
    assert.strictEqual(frame.length, 2);
  });
});

describe('ws-attach: frame decoder (1.11.90)', () => {
  function mask(buf) {
    const m = Buffer.from([0x12, 0x34, 0x56, 0x78]);
    const out = Buffer.alloc(buf.length);
    for (let i = 0; i < buf.length; i++) out[i] = buf[i] ^ m[i & 3];
    return { mask: m, masked: out };
  }

  function buildClientTextFrame(payload) {
    const buf = Buffer.from(payload, 'utf8');
    const { mask: m, masked } = mask(buf);
    const header = Buffer.alloc(2);
    header[0] = 0x81;
    header[1] = 0x80 | buf.length;
    return Buffer.concat([header, m, masked]);
  }

  it('decodes a masked client text frame', () => {
    const got = [];
    const dec = wsAttach.createFrameDecoder({ onText: (s) => got.push(s) });
    dec.push(buildClientTextFrame('hi'));
    assert.deepStrictEqual(got, ['hi']);
  });

  it('decodes multiple frames in one buffer chunk', () => {
    const got = [];
    const dec = wsAttach.createFrameDecoder({ onText: (s) => got.push(s) });
    dec.push(Buffer.concat([buildClientTextFrame('a'), buildClientTextFrame('b'), buildClientTextFrame('c')]));
    assert.deepStrictEqual(got, ['a', 'b', 'c']);
  });

  it('handles split-across-chunks frames', () => {
    const got = [];
    const dec = wsAttach.createFrameDecoder({ onText: (s) => got.push(s) });
    const full = buildClientTextFrame('hello world');
    // Split the frame into 3-byte chunks.
    for (let i = 0; i < full.length; i += 3) {
      dec.push(full.subarray(i, Math.min(i + 3, full.length)));
    }
    assert.deepStrictEqual(got, ['hello world']);
  });

  it('rejects unmasked client frames with onProtocolError', () => {
    const errors = [];
    const dec = wsAttach.createFrameDecoder({
      onText: () => assert.fail('should not deliver unmasked frame'),
      onProtocolError: (msg) => errors.push(msg),
    });
    // Hand-craft an unmasked text frame (no client should ever send this).
    const payload = Buffer.from('nope', 'utf8');
    const frame = Buffer.concat([Buffer.from([0x81, payload.length]), payload]);
    dec.push(frame);
    assert.strictEqual(errors.length, 1);
    assert.match(errors[0], /must be masked/);
  });

  it('surfaces a masked close frame with code + reason via onClose', () => {
    const closes = [];
    const dec = wsAttach.createFrameDecoder({ onClose: (code, reason) => closes.push({ code, reason }) });
    // Build a masked close frame with code 1000 and reason 'bye'.
    const payload = Buffer.alloc(2 + 3);
    payload.writeUInt16BE(1000, 0);
    Buffer.from('bye', 'utf8').copy(payload, 2);
    const m = Buffer.from([0xAA, 0xBB, 0xCC, 0xDD]);
    const masked = Buffer.alloc(payload.length);
    for (let i = 0; i < payload.length; i++) masked[i] = payload[i] ^ m[i & 3];
    const frame = Buffer.concat([Buffer.from([0x88, 0x80 | payload.length]), m, masked]);
    dec.push(frame);
    assert.deepStrictEqual(closes, [{ code: 1000, reason: 'bye' }]);
  });
});

describe('ws-attach: parseAttachPath (1.11.90)', () => {
  it('parses /api/workers/<name>/attach', () => {
    const r = wsAttach.parseAttachPath('/api/workers/worker1/attach');
    assert.strictEqual(r && r.name, 'worker1');
  });

  it('parses the api-prefix-stripped /workers/<name>/attach', () => {
    const r = wsAttach.parseAttachPath('/workers/worker1/attach');
    assert.strictEqual(r && r.name, 'worker1');
  });

  it('returns null for non-attach paths', () => {
    assert.strictEqual(wsAttach.parseAttachPath('/api/health'), null);
    assert.strictEqual(wsAttach.parseAttachPath('/api/workers/foo'), null);
    assert.strictEqual(wsAttach.parseAttachPath('/api/workers/foo/attach/extra'), null);
  });

  it('parses ?readonly=1 query parameter', () => {
    const r = wsAttach.parseAttachPath('/api/workers/w/attach?readonly=1');
    assert.strictEqual(r.params.get('readonly'), '1');
  });

  it('URI-decodes worker names with special chars', () => {
    const r = wsAttach.parseAttachPath('/api/workers/auto%2Dw63/attach');
    assert.strictEqual(r.name, 'auto-w63');
  });
});

// ---------------------------------------------------------------------------
// End-to-end attach tests against a real loopback HTTP server. We wire up
// the same upgrade-handler shape daemon.js uses so the protocol path stays
// honest, but stub the manager to keep the test isolated.
// ---------------------------------------------------------------------------

function createStubManager() {
  const workers = new Map();
  const inputs = []; // { name, data, type }
  function add(name) {
    const w = {
      name,
      alive: true,
      _watchers: new Set(),
      // simulate proc.onData dispatch — the daemon uses
      // worker._watchers via PtyManager.watchWorker.
      send(data) {
        for (const cb of w._watchers) {
          try { cb(typeof data === 'string' ? Buffer.from(data, 'utf8') : data); }
          catch { /* */ }
        }
      },
    };
    workers.set(name, w);
    return w;
  }
  return {
    workers,
    inputs,
    addWorker: add,
    watchWorker(name, cb) {
      const w = workers.get(name);
      if (!w) return null;
      w._watchers.add(cb);
      return () => w._watchers.delete(cb);
    },
    writeRawInput(name, data) {
      const w = workers.get(name);
      if (!w) return { error: `Worker '${name}' not found` };
      const payload = Buffer.isBuffer(data) ? Buffer.from(data) : Buffer.from(String(data), 'utf8');
      inputs.push({ name, data: payload });
      return { success: true };
    },
    getConfig() { return {}; },
  };
}

// Inline the same upgrade-handler wiring daemon.js does — keeps the
// e2e test honest while staying self-contained. Mirrors the logic in
// _handleAttachUpgrade in src/daemon.js. Returns the http.Server.
function buildAttachServer(stubManager) {
  const server = http.createServer((_req, res) => {
    res.writeHead(404);
    res.end();
  });
  server.on('upgrade', (req, socket) => {
    try {
      if ((req.headers.upgrade || '').toLowerCase() !== 'websocket') {
        socket.end(wsAttach.buildRejectResponse(400, 'Bad Request', '{}'));
        return;
      }
      const parsed = wsAttach.parseAttachPath(req.url || '');
      if (!parsed) {
        socket.end(wsAttach.buildRejectResponse(404, 'Not Found', '{}'));
        return;
      }
      const wsKey = req.headers['sec-websocket-key'];
      if (!wsKey) {
        socket.end(wsAttach.buildRejectResponse(400, 'Bad Request', '{}'));
        return;
      }
      const outbound = (data) => {
        if (socket.destroyed || !socket.writable) return;
        try { socket.write(wsAttach.encodeBinaryFrame(data)); } catch { /* */ }
      };
      const unwatch = stubManager.watchWorker(parsed.name, outbound);
      if (!unwatch) {
        socket.write(wsAttach.buildHandshakeResponse(wsKey));
        try { socket.write(wsAttach.encodeCloseFrame(1008, 'worker not found')); } catch { /* */ }
        try { socket.end(); } catch { /* */ }
        return;
      }
      socket.write(wsAttach.buildHandshakeResponse(wsKey));
      const readonly = parsed.params.get('readonly') === '1';
      const decoder = wsAttach.createFrameDecoder({
        onText: (text) => { if (!readonly) stubManager.writeRawInput(parsed.name, text); },
        onBinary: (chunk) => { if (!readonly) stubManager.writeRawInput(parsed.name, chunk); },
        onClose: (code, reason) => {
          try { socket.write(wsAttach.encodeCloseFrame(code || 1000, reason || '')); } catch { /* */ }
          cleanup();
        },
        onProtocolError: () => cleanup(),
      });
      let cleaned = false;
      function cleanup() {
        if (cleaned) return;
        cleaned = true;
        try { unwatch(); } catch { /* */ }
        try { socket.end(); } catch { /* */ }
      }
      socket.on('data', (chunk) => decoder.push(chunk));
      socket.on('close', cleanup);
      socket.on('error', cleanup);
    } catch (err) {
      try { socket.end(wsAttach.buildRejectResponse(500, 'Internal Server Error', '{}')); } catch { /* */ }
    }
  });
  return server;
}

describe('daemon attach endpoint: end-to-end (1.11.90)', () => {
  let stub;
  let server;
  let baseUrl;

  before(async () => {
    stub = createStubManager();
    server = buildAttachServer(stub);
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const addr = server.address();
    baseUrl = `ws://127.0.0.1:${addr.port}`;
  });

  after(async () => {
    await new Promise((resolve) => server.close(resolve));
  });

  it('connecting to a non-existent worker closes with code 1008 + worker not found', async () => {
    const url = `${baseUrl}/api/workers/missing/attach`;
    const closes = [];
    const client = await wsClient.connect(url, {});
    await new Promise((resolve) => {
      client.on('close', (code, reason) => {
        closes.push({ code, reason });
        resolve();
      });
    });
    assert.strictEqual(closes.length, 1);
    assert.strictEqual(closes[0].code, 1008);
    assert.strictEqual(closes[0].reason, 'worker not found');
  });

  it('connecting to an existing worker forwards output frames', async () => {
    stub.addWorker('e2e-out');
    const url = `${baseUrl}/api/workers/e2e-out/attach`;
    const client = await wsClient.connect(url, {});
    const got = [];
    client.on('message', (data) => got.push(data.toString('utf8')));
    // Wait a tick so the watcher is wired on the server side.
    await new Promise((r) => setImmediate(r));
    stub.workers.get('e2e-out').send('first');
    stub.workers.get('e2e-out').send('second');
    // Give the data a moment to make the round trip.
    await new Promise((r) => setTimeout(r, 50));
    client.close(1000, 'done');
    await new Promise((r) => client.on('close', r));
    assert.deepStrictEqual(got, ['first', 'second']);
  });

  it('inbound frames are written to the worker stdin', async () => {
    stub.addWorker('e2e-in');
    const url = `${baseUrl}/api/workers/e2e-in/attach`;
    const client = await wsClient.connect(url, {});
    client.send('hello');
    client.send(Buffer.from([0x03])); // Ctrl-C
    await new Promise((r) => setTimeout(r, 50));
    client.close(1000, 'done');
    await new Promise((r) => client.on('close', r));
    const captured = stub.inputs.filter((row) => row.name === 'e2e-in');
    assert.strictEqual(captured.length, 2);
    assert.strictEqual(captured[0].data.toString('utf8'), 'hello');
    assert.deepStrictEqual(Array.from(captured[1].data), [0x03]);
  });

  it('?readonly=1 drops inbound frames', async () => {
    stub.addWorker('e2e-ro');
    const url = `${baseUrl}/api/workers/e2e-ro/attach?readonly=1`;
    const client = await wsClient.connect(url, {});
    client.send('this should be dropped');
    client.send(Buffer.from([0x05]));
    await new Promise((r) => setTimeout(r, 50));
    client.close(1000, 'done');
    await new Promise((r) => client.on('close', r));
    const captured = stub.inputs.filter((row) => row.name === 'e2e-ro');
    assert.strictEqual(captured.length, 0, `expected no inbound writes, got ${JSON.stringify(captured)}`);
  });

  it('socket close cleans up the subscription (no further frames after close)', async () => {
    stub.addWorker('e2e-cleanup');
    const url = `${baseUrl}/api/workers/e2e-cleanup/attach`;
    const client = await wsClient.connect(url, {});
    const got = [];
    client.on('message', (data) => got.push(data.toString('utf8')));
    await new Promise((r) => setImmediate(r));
    stub.workers.get('e2e-cleanup').send('before-close');
    await new Promise((r) => setTimeout(r, 20));
    client.close(1000, 'detach');
    await new Promise((r) => client.on('close', r));
    // Worker emits more data after the close — the watcher should be
    // gone, so the worker's _watchers set is empty (subscription was
    // cleaned up on the daemon side).
    stub.workers.get('e2e-cleanup').send('after-close');
    assert.deepStrictEqual(got, ['before-close']);
    assert.strictEqual(stub.workers.get('e2e-cleanup')._watchers.size, 0);
  });
});
