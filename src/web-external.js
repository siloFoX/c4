'use strict';

// Web UI external-access helpers (8.10).
//
// Pure, testable helpers used by `c4 init` and the daemon to enable LAN
// access to the C4 Web UI and daemon:
//
//   - resolveBindHost(config)  -> host that daemon.js binds to (default 127.0.0.1)
//   - detectLanIP()            -> first non-internal IPv4 on this machine
//   - enableViteExternal(path) -> patches web/vite.config.ts in place, idempotent
//   - setDaemonBindHost(path)  -> updates config.json daemon.bindHost, idempotent

const fs = require('fs');
const os = require('os');

function resolveBindHost(config) {
  const daemon = (config && config.daemon) || {};
  if (typeof daemon.bindHost === 'string' && daemon.bindHost.length > 0) {
    return daemon.bindHost;
  }
  if (typeof daemon.host === 'string' && daemon.host.length > 0) {
    return daemon.host;
  }
  return '127.0.0.1';
}

function detectLanIP(ifaces = os.networkInterfaces()) {
  for (const name of Object.keys(ifaces)) {
    const list = ifaces[name] || [];
    for (const iface of list) {
      if (!iface) continue;
      const family = iface.family;
      const isV4 = family === 'IPv4' || family === 4;
      if (!isV4) continue;
      if (iface.internal) continue;
      if (!iface.address) continue;
      return iface.address;
    }
  }
  return '';
}

function enableViteExternal(viteConfigPath, fsImpl = fs) {
  let content;
  try {
    content = fsImpl.readFileSync(viteConfigPath, 'utf8');
  } catch (e) {
    return { result: 'error', error: e.message };
  }

  // Already configured — either `host: '0.0.0.0'` or `host: true`.
  if (/server\s*:\s*\{[\s\S]*?\bhost\s*:/m.test(content)) {
    return { result: 'already-present' };
  }

  const serverOpen = content.match(/server\s*:\s*\{/);
  if (!serverOpen) {
    return { result: 'error', error: 'server block not found in vite.config.ts' };
  }

  const insertAt = serverOpen.index + serverOpen[0].length;
  const insertion = "\n    host: '0.0.0.0',\n    port: 5173,";
  const patched = content.slice(0, insertAt) + insertion + content.slice(insertAt);

  try {
    fsImpl.writeFileSync(viteConfigPath, patched);
    return { result: 'updated' };
  } catch (e) {
    return { result: 'error', error: e.message };
  }
}

function setDaemonBindHost(configPath, host, fsImpl = fs) {
  let raw;
  try {
    raw = fsImpl.readFileSync(configPath, 'utf8');
  } catch (e) {
    return { result: 'error', error: e.message };
  }

  let config;
  try {
    config = JSON.parse(raw);
  } catch (e) {
    return { result: 'error', error: `invalid JSON: ${e.message}` };
  }

  if (!config.daemon || typeof config.daemon !== 'object') {
    config.daemon = {};
  }
  if (config.daemon.bindHost === host) {
    return { result: 'already-present' };
  }
  config.daemon.bindHost = host;

  try {
    fsImpl.writeFileSync(configPath, JSON.stringify(config, null, 2) + '\n');
    return { result: 'updated' };
  } catch (e) {
    return { result: 'error', error: e.message };
  }
}

module.exports = {
  resolveBindHost,
  detectLanIP,
  enableViteExternal,
  setDaemonBindHost,
};
