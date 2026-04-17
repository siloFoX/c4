const { spawn, execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const http = require('http');

const ROOT = path.resolve(__dirname, '..');
const PID_FILE = path.join(ROOT, 'logs', 'daemon.pid');
const LOG_FILE = path.join(ROOT, 'logs', 'daemon.log');
const DAEMON_SCRIPT = path.join(__dirname, 'daemon.js');

function loadConfig() {
  try {
    return JSON.parse(fs.readFileSync(path.join(ROOT, 'config.json'), 'utf8'));
  } catch {
    return {};
  }
}

function getEndpoint() {
  const cfg = loadConfig();
  return {
    host: cfg.daemon?.host || '127.0.0.1',
    port: cfg.daemon?.port || 3456
  };
}

function readPid() {
  try {
    const pid = parseInt(fs.readFileSync(PID_FILE, 'utf8').trim());
    return isNaN(pid) ? null : pid;
  } catch {
    return null;
  }
}

function writePid(pid) {
  fs.mkdirSync(path.dirname(PID_FILE), { recursive: true });
  fs.writeFileSync(PID_FILE, String(pid));
}

function removePid() {
  try { fs.unlinkSync(PID_FILE); } catch {}
}

function isProcessAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function healthCheck() {
  const { host, port } = getEndpoint();
  return new Promise((resolve) => {
    const req = http.get(`http://${host}:${port}/health`, { timeout: 3000 }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          resolve(json.ok ? json : null);
        } catch { resolve(null); }
      });
    });
    req.on('error', () => resolve(null));
    req.on('timeout', () => { req.destroy(); resolve(null); });
  });
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function start() {
  const pid = readPid();
  if (pid && isProcessAlive(pid)) {
    const health = await healthCheck();
    if (health) {
      return { error: `Daemon already running (PID ${pid}, ${health.workers} workers)` };
    }
    // Stale PID — process alive but not responding
    removePid();
  }

  // web/dist readiness warning (8.12). Daemon still starts so API works;
  // browser visits to / will show a 503 with a build hint until fixed.
  try {
    const { webDistExists, DEFAULT_WEB_DIST } = require('./static-server');
    if (!webDistExists(DEFAULT_WEB_DIST)) {
      console.warn('[warn] web/dist not built — Web UI will return 503 until built.');
      console.warn('       Run: npm run build:web');
    }
  } catch {}

  fs.mkdirSync(path.join(ROOT, 'logs'), { recursive: true });

  const logFd = fs.openSync(LOG_FILE, 'a');
  const child = spawn(process.execPath, [DAEMON_SCRIPT], {
    cwd: ROOT,
    detached: true,
    stdio: ['ignore', logFd, logFd],
    windowsHide: true, // Hide console window on Windows (4.25)
    env: { ...process.env, FORCE_COLOR: '0' }
  });

  writePid(child.pid);
  child.unref();
  fs.closeSync(logFd);

  // Wait for startup
  await sleep(1500);
  const health = await healthCheck();
  if (health) {
    return { ok: true, pid: child.pid, workers: health.workers };
  }

  // Retry once more
  await sleep(1000);
  const retry = await healthCheck();
  if (retry) {
    return { ok: true, pid: child.pid, workers: retry.workers };
  }

  return { ok: true, pid: child.pid, note: 'Started (health check pending)' };
}

async function stop() {
  let pid = readPid();

  if (!pid) {
    const health = await healthCheck();
    if (!health) {
      return { error: 'Daemon is not running' };
    }
    return { error: 'Daemon responding but no PID file — kill manually' };
  }

  if (!isProcessAlive(pid)) {
    removePid();
    return { ok: true, note: 'Already dead, cleaned PID file' };
  }

  try {
    if (process.platform === 'win32') {
      execSync(`taskkill /PID ${pid} /T /F`, { stdio: 'ignore', windowsHide: true });
    } else {
      process.kill(pid, 'SIGTERM');
    }
  } catch (err) {
    // On kill failure, check if process died anyway (race condition)
    if (!isProcessAlive(pid)) {
      removePid();
      return { ok: true, pid, note: 'Process exited during kill' };
    }
    return { error: `Failed to kill PID ${pid}: ${err.message}` };
  }

  // Wait for graceful exit (up to 3s)
  for (let i = 0; i < 10; i++) {
    await sleep(300);
    if (!isProcessAlive(pid)) {
      removePid();
      return { ok: true, pid };
    }
  }

  // SIGKILL escalation (skip on Windows — taskkill /F is already forceful)
  if (process.platform !== 'win32') {
    try {
      process.kill(pid, 'SIGKILL');
    } catch {
      // Process may have died between check and kill
      if (!isProcessAlive(pid)) {
        removePid();
        return { ok: true, pid, note: 'Process exited during SIGKILL' };
      }
    }

    // Verify SIGKILL worked (up to 2s)
    for (let i = 0; i < 10; i++) {
      await sleep(200);
      if (!isProcessAlive(pid)) {
        removePid();
        return { ok: true, pid, note: 'Killed with SIGKILL' };
      }
    }
  }

  // Final check — process survived everything
  if (isProcessAlive(pid)) {
    return { error: `Failed to kill PID ${pid}: process survived SIGTERM and SIGKILL` };
  }

  removePid();
  return { ok: true, pid };
}

async function restart() {
  const stopResult = await stop();
  await sleep(500);
  const startResult = await start();
  return { stop: stopResult, start: startResult };
}

async function status() {
  const pid = readPid();
  const alive = pid ? isProcessAlive(pid) : false;
  const health = await healthCheck();
  const { host, port } = getEndpoint();

  if (health) {
    return {
      running: true,
      pid: pid || 'unknown',
      workers: health.workers,
      endpoint: `http://${host}:${port}`,
      daemonVersion: health.version || null,
    };
  }

  if (pid && alive) {
    return { running: true, pid, note: 'Process alive but not responding' };
  }

  if (pid && !alive) {
    removePid();
  }

  return { running: false };
}

module.exports = { start, stop, restart, status };
