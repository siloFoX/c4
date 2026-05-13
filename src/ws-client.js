'use strict';

// (1.11.90) Minimal client-side WebSocket for `c4 attach`. Built on
// top of node:http's request('upgrade') event so we do not pull in the
// `ws` npm package for one CLI subcommand. The shape mirrors the
// pieces of `ws.WebSocket` that c4 attach uses (open / message /
// close / error / send / close) — it is NOT a drop-in replacement.
//
// Wire format details:
//   * client text frames are masked (RFC 6455 mandates it)
//   * we send opcode 0x1 (text) for plain string sends and 0x2
//     (binary) for Buffer sends -- the daemon side accepts both
//     and feeds them straight to the pty
//   * we accept opcode 0x1 (text) and 0x2 (binary) from the server
//     and emit them as Buffers on 'message' so the consumer can
//     decide how to render them
//
// Tests inject an alternative `httpRequest` so they don't have to
// spin up a real TCP socket.

const crypto = require('crypto');
const http = require('http');
const https = require('https');
const { URL } = require('url');
const { EventEmitter } = require('events');

const WS_GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';

function _expectedAccept(key) {
  return crypto.createHash('sha1').update(String(key) + WS_GUID).digest('base64');
}

function _maskPayload(payload, mask) {
  const out = Buffer.alloc(payload.length);
  for (let i = 0; i < payload.length; i++) out[i] = payload[i] ^ mask[i & 3];
  return out;
}

function _encodeClientFrame(opcode, payload) {
  const buf = Buffer.isBuffer(payload) ? payload : Buffer.from(String(payload), 'utf8');
  const len = buf.length;
  const mask = crypto.randomBytes(4);
  let header;
  if (len < 126) {
    header = Buffer.alloc(2 + 4);
    header[0] = 0x80 | (opcode & 0x0f);
    header[1] = 0x80 | len;
    mask.copy(header, 2);
  } else if (len < 0x10000) {
    header = Buffer.alloc(4 + 4);
    header[0] = 0x80 | (opcode & 0x0f);
    header[1] = 0x80 | 126;
    header.writeUInt16BE(len, 2);
    mask.copy(header, 4);
  } else {
    header = Buffer.alloc(10 + 4);
    header[0] = 0x80 | (opcode & 0x0f);
    header[1] = 0x80 | 127;
    header.writeUInt32BE(0, 2);
    header.writeUInt32BE(len, 6);
    mask.copy(header, 10);
  }
  return Buffer.concat([header, _maskPayload(buf, mask)]);
}

// Streaming decoder for server-to-client frames. Server frames MUST
// NOT be masked; if a masked frame arrives we treat it as a protocol
// error.
function _createServerFrameDecoder({ onText, onBinary, onClose, onProtocolError } = {}) {
  let buf = Buffer.alloc(0);
  function push(chunk) {
    if (!chunk || chunk.length === 0) return;
    buf = buf.length === 0 ? Buffer.from(chunk) : Buffer.concat([buf, chunk]);
    while (true) {
      if (buf.length < 2) return;
      const b0 = buf[0];
      const b1 = buf[1];
      const fin = (b0 & 0x80) !== 0;
      const opcode = b0 & 0x0f;
      const masked = (b1 & 0x80) !== 0;
      let len = b1 & 0x7f;
      let offset = 2;
      if (len === 126) {
        if (buf.length < offset + 2) return;
        len = buf.readUInt16BE(offset);
        offset += 2;
      } else if (len === 127) {
        if (buf.length < offset + 8) return;
        const hi = buf.readUInt32BE(offset);
        const lo = buf.readUInt32BE(offset + 4);
        if (hi !== 0) { if (onProtocolError) onProtocolError('payload too large'); return; }
        len = lo;
        offset += 8;
      }
      if (masked) {
        if (onProtocolError) onProtocolError('server frame must not be masked');
        return;
      }
      if (buf.length < offset + len) return;
      const payload = buf.subarray(offset, offset + len);
      offset += len;
      const slice = Buffer.from(payload);
      buf = buf.subarray(offset);
      if (!fin) { if (onProtocolError) onProtocolError('fragmented frames unsupported'); return; }
      if (opcode === 0x1) {
        if (onText) onText(slice);
      } else if (opcode === 0x2) {
        if (onBinary) onBinary(slice);
      } else if (opcode === 0x8) {
        let code = null;
        let reason = '';
        if (slice.length >= 2) {
          code = slice.readUInt16BE(0);
          if (slice.length > 2) reason = slice.subarray(2).toString('utf8');
        }
        if (onClose) onClose(code, reason);
        return;
      } else if (opcode === 0x9 || opcode === 0xA) {
        // ping / pong — swallow.
      } else {
        if (onProtocolError) onProtocolError(`unknown opcode 0x${opcode.toString(16)}`);
        return;
      }
    }
  }
  return { push };
}

class WsClient extends EventEmitter {
  constructor({ socket, decoder }) {
    super();
    this._socket = socket;
    this._decoder = decoder;
    this._closed = false;
  }

  send(data) {
    if (this._closed || !this._socket || this._socket.destroyed) return false;
    try {
      const frame = Buffer.isBuffer(data)
        ? _encodeClientFrame(0x2, data)
        : _encodeClientFrame(0x1, Buffer.from(String(data), 'utf8'));
      return this._socket.write(frame);
    } catch (err) {
      this._handleClose(1011, err && err.message ? err.message : String(err));
      return false;
    }
  }

  close(code, reason) {
    if (this._closed || !this._socket || this._socket.destroyed) return;
    try {
      let payload = Buffer.alloc(0);
      if (code != null) {
        const reasonBuf = reason ? Buffer.from(String(reason), 'utf8') : Buffer.alloc(0);
        payload = Buffer.alloc(2 + reasonBuf.length);
        payload.writeUInt16BE(code & 0xffff, 0);
        if (reasonBuf.length) reasonBuf.copy(payload, 2);
      }
      this._socket.write(_encodeClientFrame(0x8, payload));
    } catch { /* socket gone */ }
    try { this._socket.end(); } catch { /* */ }
  }

  _handleClose(code, reason) {
    if (this._closed) return;
    this._closed = true;
    this.emit('close', code == null ? 1006 : code, reason || '');
    try { this._socket.destroy(); } catch { /* */ }
  }
}

// Connect to a ws:// or wss:// URL. Returns a Promise that resolves
// with a WsClient on a successful handshake, or rejects with an
// error whose .code is set on common failure modes (ECONNREFUSED,
// ETIMEDOUT, etc).
//
// Headers: caller can pass extra headers (Authorization, etc.).
// Tests inject a `httpRequest` factory (or pass `transport: 'http'`
// to skip the https import); production code uses node:http /
// node:https keyed off the URL protocol.
function connect(targetUrl, { headers = {}, httpRequest } = {}) {
  return new Promise((resolve, reject) => {
    let parsed;
    try { parsed = new URL(targetUrl); }
    catch (err) { reject(err); return; }

    if (parsed.protocol !== 'ws:' && parsed.protocol !== 'wss:') {
      reject(new Error(`Unsupported URL protocol: ${parsed.protocol}`));
      return;
    }

    const isSecure = parsed.protocol === 'wss:';
    const reqFactory = httpRequest || (isSecure ? https.request : http.request);
    const wsKey = crypto.randomBytes(16).toString('base64');
    const reqHeaders = Object.assign(
      {
        'Host': parsed.host,
        'Upgrade': 'websocket',
        'Connection': 'Upgrade',
        'Sec-WebSocket-Key': wsKey,
        'Sec-WebSocket-Version': '13',
      },
      headers
    );

    const reqOptions = {
      method: 'GET',
      hostname: parsed.hostname,
      port: parsed.port || (isSecure ? 443 : 80),
      path: parsed.pathname + (parsed.search || ''),
      headers: reqHeaders,
    };

    let settled = false;
    const req = reqFactory(reqOptions);

    req.on('error', (err) => {
      if (settled) return;
      settled = true;
      reject(err);
    });

    req.on('response', (res) => {
      // Non-101 response means the server refused the upgrade.
      // Read the body so the reject reason has the daemon's error
      // message and the caller can map "worker not found" to exit 2
      // even before the 1008 close frame arrives. We bound the read
      // at 4 KB so a misbehaving server cannot stall us.
      if (settled) return;
      settled = true;
      let body = '';
      let total = 0;
      res.on('data', (chunk) => {
        total += chunk.length;
        if (total <= 4096) body += chunk.toString('utf8');
      });
      res.on('end', () => {
        const err = new Error(`upgrade refused: HTTP ${res.statusCode}`);
        err.code = 'EUPGRADE';
        err.statusCode = res.statusCode;
        err.body = body;
        reject(err);
      });
    });

    req.on('upgrade', (resHead, socket, head) => {
      if (settled) return;
      const accept = resHead.headers['sec-websocket-accept'];
      if (!accept || accept !== _expectedAccept(wsKey)) {
        settled = true;
        try { socket.destroy(); } catch { /* */ }
        const err = new Error('invalid Sec-WebSocket-Accept');
        err.code = 'EBADACCEPT';
        reject(err);
        return;
      }
      settled = true;
      // We construct the client first so the decoder callbacks can
      // capture it in their closures. The decoder factory captures
      // handlers at construction time, so we cannot swap them out
      // later — wire everything up here in one shot.
      let client;
      const decoder = _createServerFrameDecoder({
        onText: (b) => client.emit('message', b, false),
        onBinary: (b) => client.emit('message', b, true),
        onClose: (code, reason) => client._handleClose(code, reason),
        onProtocolError: (msg) => {
          client.emit('error', new Error(`ws protocol: ${msg}`));
          client._handleClose(1002, msg);
        },
      });
      client = new WsClient({ socket, decoder });
      socket.on('data', (chunk) => decoder.push(chunk));
      socket.on('close', () => client._handleClose(1006, 'socket closed'));
      socket.on('error', (err) => {
        client.emit('error', err);
        client._handleClose(1006, err && err.message ? err.message : 'socket error');
      });
      resolve(client);
      // node:http's upgrade event hands us any bytes that arrived in
      // the same TCP segment as the response headers ('head'). Feed
      // them in AFTER resolve() runs so the awaiter has a chance to
      // attach 'message' / 'close' listeners before the decoder
      // synchronously fires onClose for an immediate-close server
      // (e.g. "worker not found"). setImmediate (a macrotask) is the
      // right tool here -- process.nextTick fires BEFORE Promise
      // microtasks in Node, which means the awaiter would not have
      // attached listeners yet when the close frame is dispatched.
      if (head && head.length > 0) {
        setImmediate(() => {
          try { decoder.push(head); } catch { /* */ }
        });
      }
    });

    req.end();
  });
}

module.exports = {
  WS_GUID,
  WsClient,
  connect,
  _internals: { _expectedAccept, _encodeClientFrame, _createServerFrameDecoder },
};
