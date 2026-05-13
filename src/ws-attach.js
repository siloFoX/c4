'use strict';

// (1.11.90) WebSocket attach helper for the daemon. Implements just
// enough of RFC 6455 to ship `c4 attach`:
//   * accept(): 13-byte SHA-1 handshake reply (no extensions, no
//     subprotocols, no permessage-deflate)
//   * encodeTextFrame() / encodeCloseFrame(): server-to-client frames
//     (unmasked, FIN=1, opcode 0x1 text or 0x8 close)
//   * createFrameDecoder(): client-to-server frame parser (masked,
//     text frames decoded to UTF-8 strings, close frames surfaced via
//     the `onClose` callback, binary / control frames other than close
//     are ignored to match the attach contract)
//
// We deliberately do NOT pull in the `ws` npm package -- adding a
// runtime dependency for one endpoint is heavier than the 80-odd lines
// of framing code we need. The decoder is loop-driven and works on
// fragmented chunks (Node's net socket emits arbitrarily sized
// Buffers); each call to push() processes everything it can and
// leaves the leftover bytes in an internal buffer.

const crypto = require('crypto');

const WS_GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';

function acceptKey(clientKey) {
  return crypto.createHash('sha1').update(String(clientKey) + WS_GUID).digest('base64');
}

// Build the HTTP 101 response body. Caller writes this to the raw
// socket once it has decided to accept the upgrade.
function buildHandshakeResponse(clientKey) {
  const accept = acceptKey(clientKey);
  return [
    'HTTP/1.1 101 Switching Protocols',
    'Upgrade: websocket',
    'Connection: Upgrade',
    `Sec-WebSocket-Accept: ${accept}`,
    '',
    '',
  ].join('\r\n');
}

// Build an HTTP error response when we refuse the upgrade before
// flipping protocols. The browser surfaces the status text in the
// error event for `new WebSocket(...)` calls.
function buildRejectResponse(statusCode, statusText, body) {
  const bodyStr = body == null ? '' : String(body);
  const head = [
    `HTTP/1.1 ${statusCode} ${statusText}`,
    'Connection: close',
    'Content-Type: application/json; charset=utf-8',
    `Content-Length: ${Buffer.byteLength(bodyStr)}`,
    '',
    '',
  ].join('\r\n');
  return head + bodyStr;
}

// Encode an unmasked server text frame. Payload is a Buffer (caller
// is responsible for UTF-8 encoding; `Buffer.from(str)` works).
function encodeTextFrame(payload) {
  const buf = Buffer.isBuffer(payload) ? payload : Buffer.from(String(payload), 'utf8');
  return _encodeFrame(0x1, buf);
}

// Encode an unmasked server binary frame. Used for pty output that
// may contain bytes a text frame would mangle when round-tripped
// through UTF-8.
function encodeBinaryFrame(payload) {
  const buf = Buffer.isBuffer(payload) ? payload : Buffer.from(String(payload), 'utf8');
  return _encodeFrame(0x2, buf);
}

// Encode a close frame with optional code + reason string. RFC 6455
// allows 0-byte close frames and 2+-byte close frames (uint16 code +
// utf-8 reason). We always send the code when given.
function encodeCloseFrame(code, reason) {
  let payload;
  if (code == null) {
    payload = Buffer.alloc(0);
  } else {
    const reasonBuf = reason ? Buffer.from(String(reason), 'utf8') : Buffer.alloc(0);
    payload = Buffer.alloc(2 + reasonBuf.length);
    payload.writeUInt16BE(code & 0xffff, 0);
    if (reasonBuf.length) reasonBuf.copy(payload, 2);
  }
  return _encodeFrame(0x8, payload);
}

function _encodeFrame(opcode, payload) {
  const len = payload.length;
  let header;
  if (len < 126) {
    header = Buffer.alloc(2);
    header[0] = 0x80 | (opcode & 0x0f);
    header[1] = len;
  } else if (len < 0x10000) {
    header = Buffer.alloc(4);
    header[0] = 0x80 | (opcode & 0x0f);
    header[1] = 126;
    header.writeUInt16BE(len, 2);
  } else {
    header = Buffer.alloc(10);
    header[0] = 0x80 | (opcode & 0x0f);
    header[1] = 127;
    header.writeUInt32BE(0, 2);
    header.writeUInt32BE(len, 6);
  }
  return Buffer.concat([header, payload], header.length + len);
}

// Streaming decoder for client-to-server frames. Returns an object
// with .push(chunk) and .reset(). The callbacks fire synchronously
// from inside push():
//   onText(string)
//   onBinary(Buffer)
//   onClose(code|null, reason|'')
//   onProtocolError(reason)  -- caller should close with 1002
function createFrameDecoder({ onText, onBinary, onClose, onProtocolError, maxPayloadBytes } = {}) {
  let buf = Buffer.alloc(0);
  const cap = Number.isFinite(maxPayloadBytes) && maxPayloadBytes > 0
    ? maxPayloadBytes
    : 1024 * 1024; // 1 MiB per-frame cap; PTY input is keystrokes so this is generous.

  function fail(reason) {
    if (typeof onProtocolError === 'function') onProtocolError(reason);
  }

  function push(chunk) {
    if (!chunk || chunk.length === 0) return;
    buf = buf.length === 0 ? Buffer.from(chunk) : Buffer.concat([buf, chunk]);
    // Parse as many frames as we have bytes for. Each iteration peels
    // exactly one frame off the front; we stop when there are not
    // enough bytes for the header or payload.
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
        // The high 32 bits must be zero for any payload we will ever
        // accept (cap is 1 MiB). Reading the low 32 bits is enough.
        const hi = buf.readUInt32BE(offset);
        const lo = buf.readUInt32BE(offset + 4);
        if (hi !== 0) return fail('payload too large');
        len = lo;
        offset += 8;
      }
      if (len > cap) return fail('payload exceeds cap');
      if (!masked) {
        // RFC 6455: client frames MUST be masked. A connecting CLI
        // that violates this is buggy or hostile; close with 1002.
        return fail('client frame must be masked');
      }
      if (buf.length < offset + 4 + len) return;
      const mask = buf.subarray(offset, offset + 4);
      offset += 4;
      const masked_payload = buf.subarray(offset, offset + len);
      const unmasked = Buffer.alloc(len);
      for (let i = 0; i < len; i++) unmasked[i] = masked_payload[i] ^ mask[i & 3];
      offset += len;
      buf = buf.subarray(offset);

      if (!fin) {
        // We do not support fragmented frames for attach (PTY input
        // is keystroke-sized). Treat as a protocol error so the
        // client gets immediate feedback rather than a silent drop.
        return fail('fragmented frames unsupported');
      }
      if (opcode === 0x1) {
        if (typeof onText === 'function') {
          try { onText(unmasked.toString('utf8')); } catch { /* never let a handler kill the parser */ }
        }
      } else if (opcode === 0x2) {
        if (typeof onBinary === 'function') {
          try { onBinary(unmasked); } catch { /* same */ }
        }
      } else if (opcode === 0x8) {
        let code = null;
        let reason = '';
        if (unmasked.length >= 2) {
          code = unmasked.readUInt16BE(0);
          if (unmasked.length > 2) reason = unmasked.subarray(2).toString('utf8');
        }
        if (typeof onClose === 'function') {
          try { onClose(code, reason); } catch { /* same */ }
        }
        return; // After close, ignore any further bytes.
      } else if (opcode === 0x9 || opcode === 0xA) {
        // ping / pong — silently swallow. We do not implement
        // keepalive: PTY traffic supplies its own heartbeat.
      } else {
        return fail(`unknown opcode 0x${opcode.toString(16)}`);
      }
    }
  }

  function reset() { buf = Buffer.alloc(0); }

  return { push, reset };
}

// Pure helper: parse the path + querystring from a raw HTTP request
// line. Used by the daemon's upgrade handler to route /api/workers/
// :name/attach without pulling node:url for every connection.
function parseAttachPath(rawUrl) {
  if (typeof rawUrl !== 'string' || rawUrl.length === 0) return null;
  // Strip optional querystring.
  const qIdx = rawUrl.indexOf('?');
  const path = qIdx === -1 ? rawUrl : rawUrl.slice(0, qIdx);
  const query = qIdx === -1 ? '' : rawUrl.slice(qIdx + 1);
  // Accept both /api/workers/:name/attach and (api-prefix-stripped)
  // /workers/:name/attach so both daemon.js and tests can call us
  // with either form.
  const m = path.match(/^(?:\/api)?\/workers\/([^/]+)\/attach$/);
  if (!m) return null;
  const name = decodeURIComponent(m[1]);
  const params = new Map();
  if (query) {
    for (const pair of query.split('&')) {
      if (!pair) continue;
      const eq = pair.indexOf('=');
      const k = eq === -1 ? pair : pair.slice(0, eq);
      const v = eq === -1 ? '' : pair.slice(eq + 1);
      try { params.set(decodeURIComponent(k), decodeURIComponent(v)); }
      catch { params.set(k, v); }
    }
  }
  return { name, params };
}

module.exports = {
  WS_GUID,
  acceptKey,
  buildHandshakeResponse,
  buildRejectResponse,
  encodeTextFrame,
  encodeBinaryFrame,
  encodeCloseFrame,
  createFrameDecoder,
  parseAttachPath,
};
