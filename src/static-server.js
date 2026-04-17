'use strict';

// Static file serving for daemon's built web UI (8.12).
// Pure Node (no express) to match the existing http-only daemon stack.

const fs = require('fs');
const path = require('path');

const DEFAULT_WEB_DIST = path.resolve(__dirname, '..', 'web', 'dist');

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.htm': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.eot': 'application/vnd.ms-fontobject',
  '.txt': 'text/plain; charset=utf-8',
  '.wasm': 'application/wasm',
};

function mimeFor(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  return MIME_TYPES[ext] || 'application/octet-stream';
}

function resolveSafePath(webDist, urlPath) {
  const decoded = decodeURIComponent((urlPath || '/').split('?')[0].split('#')[0]);
  const normalized = path.posix.normalize(decoded).replace(/^\/+/, '');
  const resolved = path.resolve(webDist, normalized);
  const distResolved = path.resolve(webDist);
  const within = resolved === distResolved || resolved.startsWith(distResolved + path.sep);
  return within ? resolved : null;
}

function pickFile(webDist, urlPath) {
  const distResolved = path.resolve(webDist);
  const indexFile = path.join(distResolved, 'index.html');

  if (!fs.existsSync(distResolved)) {
    return { kind: 'missing-dist', webDist: distResolved };
  }

  const safe = resolveSafePath(distResolved, urlPath);
  if (!safe) return { kind: 'forbidden' };

  let target = safe;
  let stat;
  try {
    stat = fs.statSync(target);
  } catch {
    stat = null;
  }

  if (stat && stat.isDirectory()) {
    target = path.join(target, 'index.html');
    try { stat = fs.statSync(target); } catch { stat = null; }
  }

  if (stat && stat.isFile()) {
    return { kind: 'file', path: target, size: stat.size };
  }

  // SPA fallback.
  try {
    const idxStat = fs.statSync(indexFile);
    if (idxStat.isFile()) {
      return { kind: 'spa-fallback', path: indexFile, size: idxStat.size };
    }
  } catch {}

  return { kind: 'no-index', webDist: distResolved };
}

function serveStatic(req, res, options = {}) {
  const webDist = options.webDist || DEFAULT_WEB_DIST;
  const urlPath = options.urlPath || req.url || '/';

  if (req.method !== 'GET' && req.method !== 'HEAD') return false;

  const pick = pickFile(webDist, urlPath);

  if (pick.kind === 'missing-dist') {
    res.writeHead(503, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({
      error: 'web/dist not built',
      hint: 'Run: npm run build:web',
      webDist: pick.webDist,
    }));
    return true;
  }

  if (pick.kind === 'forbidden') {
    res.writeHead(403, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ error: 'Forbidden path' }));
    return true;
  }

  if (pick.kind === 'no-index') {
    res.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({
      error: 'index.html not found in web/dist',
      hint: 'Run: npm run build:web',
      webDist: pick.webDist,
    }));
    return true;
  }

  res.writeHead(200, {
    'Content-Type': mimeFor(pick.path),
    'Content-Length': pick.size,
    'Cache-Control': 'no-cache',
  });

  if (req.method === 'HEAD') {
    res.end();
    return true;
  }

  const stream = fs.createReadStream(pick.path);
  stream.on('error', () => {
    if (!res.headersSent) {
      res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ error: 'Read error' }));
    } else {
      res.end();
    }
  });
  stream.pipe(res);
  return true;
}

function webDistExists(webDist = DEFAULT_WEB_DIST) {
  try {
    const stat = fs.statSync(path.join(webDist, 'index.html'));
    return stat.isFile();
  } catch {
    return false;
  }
}

// Alias /api/<x> -> /<x> so the built frontend (which fetches /api/*) hits the
// existing daemon routes. Pure function so daemon.js can call it and tests can
// exercise it without spinning up a server.
function resolveApiRoute(rawPath) {
  const p = rawPath || '/';
  const isApi = p === '/api' || p.startsWith('/api/');
  const route = isApi ? (p.slice(4) || '/') : p;
  return { isApi, route };
}

module.exports = {
  DEFAULT_WEB_DIST,
  MIME_TYPES,
  mimeFor,
  resolveSafePath,
  pickFile,
  serveStatic,
  webDistExists,
  resolveApiRoute,
};
