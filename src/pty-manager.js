const pty = require('node-pty');
const fs = require('fs');
const path = require('path');
const ScreenBuffer = require('./screen-buffer');

const CONFIG_FILE = path.join(__dirname, '..', 'config.json');
const STATE_FILE = path.join(__dirname, '..', 'state.json');

function loadConfig() {
  try {
    return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
  } catch {
    return {};
  }
}

class PtyManager {
  constructor() {
    this.workers = new Map();
    this.config = loadConfig();
    this._loadState();
  }

  get logsDir() {
    return path.join(__dirname, '..', 'logs');
  }

  get idleThresholdMs() {
    return this.config.daemon?.idleThresholdMs || 3000;
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

  _resolveTarget(targetName) {
    // Config-based targets
    const configTargets = this.config.targets || {};
    if (configTargets[targetName]) {
      return configTargets[targetName];
    }
    // Fallback: local
    if (targetName === 'local') {
      return { type: 'local', defaultCwd: '' };
    }
    return null;
  }

  _detectPermissionPrompt(screenText) {
    // Detect Claude Code permission prompts
    const lines = screenText.split('\n');
    for (const line of lines) {
      if (line.includes('Do you want to proceed?') ||
          line.includes('Do you want to create') ||
          line.includes('Do you want to make this edit')) {
        return true;
      }
    }
    return false;
  }

  _classifyPermission(screenText) {
    const rules = this.config.autoApprove?.rules || [];
    const defaultAction = this.config.autoApprove?.defaultAction || 'ask';

    // Try to extract the tool/command from screen
    const lines = screenText.split('\n');
    let toolInfo = '';

    for (const line of lines) {
      // Match patterns like "Bash command", "Edit file", "Read(...)"
      if (line.match(/^\s*(Bash command|Edit file|Read\(|Write\(|Glob\(|Grep\()/)) {
        toolInfo = line.trim();
        break;
      }
      // Match the actual command line
      if (line.match(/^\s{3}\S/) && !line.includes('Do you want') && !line.includes('❯')) {
        toolInfo = line.trim();
      }
    }

    for (const rule of rules) {
      const pattern = rule.pattern;
      if (pattern === 'Read' && (toolInfo.includes('Read(') || toolInfo.includes('Reading'))) return rule.action;
      if (pattern === 'Glob' && toolInfo.includes('Glob(')) return rule.action;
      if (pattern === 'Grep' && toolInfo.includes('Grep(')) return rule.action;
      if (pattern === 'Write' && (toolInfo.includes('Write(') || toolInfo.includes('create'))) return rule.action;
      if (pattern === 'Edit' && (toolInfo.includes('Edit ') || toolInfo.includes('edit to'))) return rule.action;

      // Bash pattern matching: "Bash(cmd:*)"
      const bashMatch = pattern.match(/^Bash\((\w+):\*\)$/);
      if (bashMatch && toolInfo) {
        const cmd = bashMatch[1];
        if (toolInfo.startsWith(cmd) || toolInfo.includes(`${cmd} `)) {
          return rule.action;
        }
      }
    }

    return defaultAction;
  }

  create(name, command, args = [], options = {}) {
    if (this.workers.has(name)) {
      return { error: `Worker '${name}' already exists` };
    }

    command = command || this.config.pty?.defaultCommand || 'claude';

    if (!fs.existsSync(this.logsDir)) {
      fs.mkdirSync(this.logsDir, { recursive: true });
    }

    const targetName = options.target || 'local';
    const cwd = options.cwd || '';
    const t = this._resolveTarget(targetName);
    if (!t) return { error: `Unknown target: '${targetName}'` };

    let shell, shellArgs, pendingCommands;

    if (t.type === 'local' || targetName === 'local') {
      shell = process.platform === 'win32' ? 'cmd.exe' : 'bash';
      shellArgs = process.platform === 'win32'
        ? ['/c', command, ...args]
        : ['-c', `${command} ${args.join(' ')}`];
    } else if (t.type === 'ssh') {
      const remoteCwd = cwd || t.defaultCwd || '';
      const commandMap = t.commandMap || {};
      const resolvedCmd = commandMap[command] || command;
      const remoteArgs = args.length > 0 ? ' ' + args.join(' ') : '';

      shell = process.platform === 'win32' ? 'C:\\Windows\\System32\\OpenSSH\\ssh.exe' : 'ssh';
      const sshArgs = ['-t', '-o', 'StrictHostKeyChecking=no'];
      if (t.port) sshArgs.push('-p', String(t.port));
      if (t.identityFile) sshArgs.push('-i', t.identityFile);
      sshArgs.push(t.host);
      shellArgs = sshArgs;

      pendingCommands = [];
      if (remoteCwd) pendingCommands.push(`cd ${remoteCwd}`);
      pendingCommands.push(`${resolvedCmd}${remoteArgs}`);
    } else {
      return { error: `Unknown target type: '${t.type}'` };
    }

    const cols = this.config.pty?.cols || 160;
    const rows = this.config.pty?.rows || 48;

    const spawnCwd = (t.type === 'local' || targetName === 'local')
      ? (process.env.HOME || process.env.USERPROFILE)
      : undefined;

    const proc = pty.spawn(shell, shellArgs, {
      name: 'xterm-256color',
      cols,
      rows,
      ...(spawnCwd ? { cwd: spawnCwd } : {}),
      env: { ...process.env, LANG: 'en_US.UTF-8' }
    });

    const screen = new ScreenBuffer(cols, rows);
    const scrollback = this.config.pty?.scrollback || 2000;
    screen.maxScrollback = scrollback;

    const worker = {
      proc,
      screen,
      alive: true,
      command: `${command} ${args.join(' ')}`.trim(),
      target: targetName,
      lastDataTime: Date.now(),
      snapshots: [],
      snapshotIndex: 0,
      idleTimer: null,
      rawLogPath: this.config.logs?.rawLog !== false
        ? path.join(this.logsDir, `${name}.raw.log`)
        : null,
      rawLogStream: null,
      pendingCommands: pendingCommands || null,
    };

    // Raw log
    if (worker.rawLogPath) {
      worker.rawLogStream = fs.createWriteStream(worker.rawLogPath, { flags: 'w' });
    }

    const idleMs = this.idleThresholdMs;

    proc.onData((data) => {
      worker.lastDataTime = Date.now();
      if (worker.rawLogStream) worker.rawLogStream.write(data);

      screen.write(data);

      // Send pending commands when SSH shell is ready
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
        const text = this._getScreenText(screen);

        // Auto-approve logic
        if (this.config.autoApprove?.enabled && this._detectPermissionPrompt(text)) {
          const action = this._classifyPermission(text);
          if (action === 'approve') {
            proc.write('\r'); // Press Enter to approve
            return; // Don't snapshot, will get a new idle after approval
          } else if (action === 'deny') {
            // Select "No" (option 3 or navigate down)
            proc.write('\x1b[B\x1b[B\r'); // Down, Down, Enter
            return;
          }
          // 'ask' falls through to snapshot — manager will see the prompt
        }

        worker.snapshots.push({
          time: Date.now(),
          screen: text
        });
        this._saveState();
      }, idleMs);
    });

    proc.onExit(({ exitCode, signal }) => {
      worker.alive = false;
      if (worker.idleTimer) clearTimeout(worker.idleTimer);
      const text = this._getScreenText(screen);
      worker.snapshots.push({
        time: Date.now(),
        screen: text,
        exited: true,
        exitCode,
        signal
      });
      if (worker.rawLogStream) worker.rawLogStream.end();
      this._saveState();
    });

    this.workers.set(name, worker);
    this._saveState();

    // Auto trust folder + effort level setup
    if (this.config.workerDefaults?.trustFolder) {
      // Will be handled by pending commands or first idle snapshot
    }

    return {
      name,
      pid: proc.pid,
      target: targetName,
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
        status: w.alive ? (idleMs > this.idleThresholdMs ? 'idle' : 'busy') : 'exited',
        pendingSnapshots: 0
      };
    }

    const latest = newSnapshots[newSnapshots.length - 1];
    return {
      content: latest.screen,
      status: w.alive ? 'idle' : 'exited',
      snapshotsRead: newSnapshots.length,
      exitCode: latest.exitCode
    };
  }

  readNow(name) {
    const w = this.workers.get(name);
    if (!w) return { error: `Worker '${name}' not found` };

    const screenText = this._getScreenText(w.screen);
    const idleMs = Date.now() - w.lastDataTime;

    return {
      content: screenText,
      status: w.alive ? (idleMs > this.idleThresholdMs ? 'idle' : 'busy') : 'exited'
    };
  }

  async waitAndRead(name, timeoutMs = 120000) {
    const w = this.workers.get(name);
    if (!w) return { error: `Worker '${name}' not found` };

    const startTime = Date.now();

    return new Promise((resolve) => {
      const check = () => {
        if (Date.now() - startTime > timeoutMs) {
          resolve({ content: this._getScreenText(w.screen), status: 'timeout' });
          return;
        }
        if (!w.alive) {
          resolve({ content: this._getScreenText(w.screen), status: 'exited' });
          return;
        }
        const idleMs = Date.now() - w.lastDataTime;
        if (idleMs >= this.idleThresholdMs) {
          resolve({ content: this._getScreenText(w.screen), status: 'idle' });
          return;
        }
        setTimeout(check, 500);
      };
      check();
    });
  }

  reloadConfig() {
    this.config = loadConfig();
    return { success: true, config: this.config };
  }

  getConfig() {
    return this.config;
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
        status: w.alive ? (idleMs > this.idleThresholdMs ? 'idle' : 'busy') : 'exited',
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
