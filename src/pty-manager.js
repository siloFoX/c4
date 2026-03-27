const pty = require('node-pty');
const fs = require('fs');
const path = require('path');
const ScreenBuffer = require('./screen-buffer');

const LOGS_DIR = path.join(__dirname, '..', 'logs');
const STATE_FILE = path.join(__dirname, '..', 'state.json');

// How many ms of silence = "idle"
const IDLE_THRESHOLD_MS = 3000;

class PtyManager {
  constructor() {
    this.workers = new Map();
    this._loadState();
  }

  _loadState() {
    try {
      const data = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
      this.offsets = data.offsets || {};
    } catch {
      this.offsets = {};
    }
  }

  _saveState() {
    const data = { offsets: {}, workers: [] };
    for (const [name, w] of this.workers) {
      data.offsets[name] = w.snapshotIndex;
      data.workers.push({
        name,
        pid: w.proc ? w.proc.pid : null,
        alive: w.alive
      });
    }
    fs.writeFileSync(STATE_FILE, JSON.stringify(data, null, 2));
  }

  _getScreenText(screen) {
    return screen.getScreen();
  }

  create(name, command = 'claude', args = [], options = {}) {
    if (this.workers.has(name)) {
      return { error: `Worker '${name}' already exists` };
    }

    if (!fs.existsSync(LOGS_DIR)) {
      fs.mkdirSync(LOGS_DIR, { recursive: true });
    }

    const target = options.target || 'local';
    const cwd = options.cwd || '';

    let shell, shellArgs, pendingCommands;

    if (target === 'local') {
      shell = process.platform === 'win32' ? 'cmd.exe' : 'bash';
      shellArgs = process.platform === 'win32'
        ? ['/c', command, ...args]
        : ['-c', `${command} ${args.join(' ')}`];
    } else {
      // Remote target via SSH
      const targets = {
        dgx: {
          host: 'shinc@192.168.10.222',
          defaultCwd: '/home/shinc',
          // Map common commands to full paths on remote
          commandMap: { 'claude': '/home/shinc/.local/bin/claude' }
        }
      };
      const t = targets[target];
      if (!t) return { error: `Unknown target: '${target}'. Available: ${Object.keys(targets).join(', ')}` };

      const remoteCwd = cwd || t.defaultCwd;
      const resolvedCmd = (t.commandMap && t.commandMap[command]) || command;
      const remoteArgs = args.length > 0 ? ' ' + args.join(' ') : '';

      // Spawn SSH shell, then send commands via stdin after connection
      shell = process.platform === 'win32' ? 'C:\\Windows\\System32\\OpenSSH\\ssh.exe' : 'ssh';
      shellArgs = ['-t', '-o', 'StrictHostKeyChecking=no', t.host];

      // Note: remoteCwd and resolvedCmd are sent via proc.write (not through bash)
      // so Git Bash path conversion doesn't apply here. They go through node-pty stdin.
      pendingCommands = [];
      if (remoteCwd) pendingCommands.push(`cd ${remoteCwd}`);
      pendingCommands.push(`${resolvedCmd}${remoteArgs}`);
    }

    const cols = 160;
    const rows = 48;

    const spawnCwd = target === 'local'
      ? (process.env.HOME || process.env.USERPROFILE)
      : undefined;

    const proc = pty.spawn(shell, shellArgs, {
      name: 'xterm-256color',
      cols,
      rows,
      ...(spawnCwd ? { cwd: spawnCwd } : {}),
      env: { ...process.env, LANG: 'en_US.UTF-8' }
    });

    // Virtual screen buffer to process escape sequences
    const screen = new ScreenBuffer(cols, rows);

    const worker = {
      proc,
      screen,
      alive: true,
      command: `${command} ${args.join(' ')}`.trim(),
      target,
      lastDataTime: Date.now(),
      snapshots: [],
      snapshotIndex: 0,
      idleTimer: null,
      rawLogPath: path.join(LOGS_DIR, `${name}.raw.log`),
      rawLogStream: null,
      pendingCommands: pendingCommands || null,
    };

    // Raw log for debugging
    worker.rawLogStream = fs.createWriteStream(worker.rawLogPath, { flags: 'w' });

    proc.onData((data) => {
      worker.lastDataTime = Date.now();
      worker.rawLogStream.write(data);

      // Feed data into virtual screen buffer
      screen.write(data);

      // Send pending commands when SSH shell is ready (detects shell prompt)
      if (worker.pendingCommands && worker.pendingCommands.length > 0) {
        const cmd = worker.pendingCommands.shift();
        setTimeout(() => {
          proc.write(cmd + '\r');
        }, 500);
        if (worker.pendingCommands.length === 0) {
          worker.pendingCommands = null;
        }
      }

      // Reset idle timer
      if (worker.idleTimer) clearTimeout(worker.idleTimer);
      worker.idleTimer = setTimeout(() => {
        // Terminal has been idle -> take a snapshot
        const text = this._getScreenText(screen);
        worker.snapshots.push({
          time: Date.now(),
          screen: text
        });
        this._saveState();
      }, IDLE_THRESHOLD_MS);
    });

    proc.onExit(({ exitCode, signal }) => {
      worker.alive = false;
      if (worker.idleTimer) clearTimeout(worker.idleTimer);
      // Final snapshot
      const text = this._getScreenText(screen);
      worker.snapshots.push({
        time: Date.now(),
        screen: text,
        exited: true,
        exitCode,
        signal
      });
      worker.rawLogStream.end();
      this._saveState();
    });

    this.workers.set(name, worker);
    this._saveState();

    return {
      name,
      pid: proc.pid,
      status: 'running'
    };
  }

  send(name, input, isSpecialKey = false) {
    const w = this.workers.get(name);
    if (!w) return { error: `Worker '${name}' not found` };
    if (!w.alive) return { error: `Worker '${name}' has exited` };

    if (isSpecialKey) {
      const keyMap = {
        'Enter': '\r',
        'C-c': '\x03',
        'C-b': '\x02',
        'C-d': '\x04',
        'C-z': '\x1a',
        'C-l': '\x0c',
        'C-a': '\x01',
        'C-e': '\x05',
        'C-r': '\x12',
        'C-p': '\x10',
        'C-n': '\x0e',
        'Escape': '\x1b',
        'Tab': '\t',
        'Backspace': '\x7f',
        'Up': '\x1b[A',
        'Down': '\x1b[B',
        'Right': '\x1b[C',
        'Left': '\x1b[D',
      };
      const code = keyMap[input];
      if (!code) return { error: `Unknown key: '${input}'` };
      w.proc.write(code);
    } else {
      w.proc.write(input);
    }

    return { success: true };
  }

  // Read new snapshots since last read (only idle/finished states)
  read(name) {
    const w = this.workers.get(name);
    if (!w) return { error: `Worker '${name}' not found` };

    const newSnapshots = w.snapshots.slice(w.snapshotIndex);
    w.snapshotIndex = w.snapshots.length;
    this._saveState();

    if (newSnapshots.length === 0) {
      const idleMs = Date.now() - w.lastDataTime;
      return {
        content: '',
        status: w.alive ? (idleMs > IDLE_THRESHOLD_MS ? 'idle' : 'busy') : 'exited',
        pendingSnapshots: 0
      };
    }

    // Return the latest snapshot (most current screen state)
    const latest = newSnapshots[newSnapshots.length - 1];
    return {
      content: latest.screen,
      status: w.alive ? 'idle' : 'exited',
      snapshotsRead: newSnapshots.length,
      exitCode: latest.exitCode
    };
  }

  // Get current screen NOW (even if busy)
  readNow(name) {
    const w = this.workers.get(name);
    if (!w) return { error: `Worker '${name}' not found` };

    const screenText = this._getScreenText(w.screen);
    const idleMs = Date.now() - w.lastDataTime;

    return {
      content: screenText,
      status: w.alive ? (idleMs > IDLE_THRESHOLD_MS ? 'idle' : 'busy') : 'exited'
    };
  }

  // Wait until idle, then return screen
  async waitAndRead(name, timeoutMs = 120000) {
    const w = this.workers.get(name);
    if (!w) return { error: `Worker '${name}' not found` };

    const startTime = Date.now();

    return new Promise((resolve) => {
      const check = () => {
        if (Date.now() - startTime > timeoutMs) {
          resolve({
            content: this._getScreenText(w.screen),
            status: 'timeout'
          });
          return;
        }

        if (!w.alive) {
          resolve({
            content: this._getScreenText(w.screen),
            status: 'exited'
          });
          return;
        }

        const idleMs = Date.now() - w.lastDataTime;
        if (idleMs >= IDLE_THRESHOLD_MS) {
          resolve({
            content: this._getScreenText(w.screen),
            status: 'idle'
          });
          return;
        }

        setTimeout(check, 500);
      };
      check();
    });
  }

  list() {
    const result = [];
    for (const [name, w] of this.workers) {
      const idleMs = Date.now() - w.lastDataTime;
      const unreadSnapshots = w.snapshots.length - w.snapshotIndex;
      result.push({
        name,
        command: w.command,
        target: w.target || 'local',
        pid: w.proc ? w.proc.pid : null,
        status: w.alive ? (idleMs > IDLE_THRESHOLD_MS ? 'idle' : 'busy') : 'exited',
        unreadSnapshots,
        totalSnapshots: w.snapshots.length
      });
    }
    return { workers: result };
  }

  close(name) {
    const w = this.workers.get(name);
    if (!w) return { error: `Worker '${name}' not found` };

    if (w.idleTimer) clearTimeout(w.idleTimer);
    if (w.alive) w.proc.kill();
    if (w.rawLogStream && !w.rawLogStream.destroyed) w.rawLogStream.end();
    // screen buffer doesn't need dispose

    this.workers.delete(name);
    this._saveState();
    return { success: true, name };
  }

  closeAll() {
    for (const name of [...this.workers.keys()]) {
      this.close(name);
    }
  }
}

module.exports = PtyManager;
