const pty = require('node-pty');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync: _execSync } = require('child_process');
const { EventEmitter } = require('events');

// Windows console window hiding wrapper (4.25)
function execSyncSafe(cmd, opts = {}) {
  return _execSync(cmd, { windowsHide: true, ...opts });
}
const ScreenBuffer = require('./screen-buffer');
const Scribe = require('./scribe');
const { ScopeGuard, resolveScope } = require('./scope-guard');
const StateMachine = require('./state-machine');
const AdaptivePolling = require('./adaptive-polling');
const TerminalInterface = require('./terminal-interface');
const SummaryLayer = require('./summary-layer');

// L4 Critical Deny List (5.13) — these commands are NEVER auto-approved, even at full autonomy
const CRITICAL_DENY_PATTERNS = [
  /\brm\s+-rf\s+[\/\\]/,
  /\bgit\s+push\s+--force/,
  /\bgit\s+push\s+-f\b/,
  /\bDROP\s+(TABLE|DATABASE)/i,
  /\bsudo\s+rm\b/,
  /\bshutdown\b/,
  /\breboot\b/,
  /\bmkfs\b/,
  /\bdd\s+if=/,
  /\bgit\s+reset\s+--hard\s+origin/,
];

const CONFIG_FILE = path.join(__dirname, '..', 'config.json');
const STATE_FILE = path.join(__dirname, '..', 'state.json');
const HISTORY_FILE = path.join(__dirname, '..', 'history.jsonl');

// --- Platform Utilities (3.20) ---

const PLATFORM = process.platform; // 'win32', 'linux', 'darwin'
const IS_WIN = PLATFORM === 'win32';
const IS_MAC = PLATFORM === 'darwin';
const IS_LINUX = PLATFORM === 'linux';

function platformShell() {
  if (IS_WIN) return 'cmd.exe';
  // macOS and Linux: prefer bash, fallback to sh
  if (fs.existsSync('/bin/bash')) return 'bash';
  if (fs.existsSync('/usr/bin/bash')) return 'bash';
  return 'sh';
}

function platformShellArgs(command, args = []) {
  if (IS_WIN) {
    return ['/c', command, ...args];
  }
  const cmdStr = args.length > 0 ? `${command} ${args.join(' ')}` : command;
  return ['-c', cmdStr];
}

function platformSshPath() {
  if (IS_WIN) return 'C:\\Windows\\System32\\OpenSSH\\ssh.exe';
  return 'ssh';
}

function platformHomedir() {
  return os.homedir();
}

function platformNormalizePath(p) {
  // Normalize to forward slashes for git commands
  return p.replace(/\\/g, '/');
}

function platformClaudeConfigDir() {
  return path.join(platformHomedir(), '.claude');
}

function platformTmpDir() {
  return os.tmpdir();
}

// macOS-specific: homebrew paths for claude
function platformClaudePaths() {
  const paths = [];
  if (IS_MAC) {
    // Homebrew (Apple Silicon)
    paths.push('/opt/homebrew/bin/claude');
    // Homebrew (Intel)
    paths.push('/usr/local/bin/claude');
    // npm global (nvm)
    const nvmDir = process.env.NVM_DIR || path.join(platformHomedir(), '.nvm');
    if (fs.existsSync(nvmDir)) {
      try {
        const nodeVersion = execSyncSafe('node -v', { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
        paths.push(path.join(nvmDir, 'versions', 'node', nodeVersion, 'bin', 'claude'));
      } catch {}
    }
  }
  if (IS_LINUX) {
    paths.push('/usr/local/bin/claude');
    paths.push(path.join(platformHomedir(), '.local', 'bin', 'claude'));
    // npm global
    paths.push(path.join(platformHomedir(), '.npm-global', 'bin', 'claude'));
  }
  return paths;
}

function loadConfig() {
  try {
    return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
  } catch {
    return {};
  }
}

class PtyManager extends EventEmitter {
  constructor() {
    super();
    this.workers = new Map();
    this.config = loadConfig();
    this._taskQueue = [];
    try {
      this._daemonVersion = require('../package.json').version;
    } catch {
      this._daemonVersion = null;
    }
    this._loadState();
    this._healthTimer = null;
    this._lastHealthCheck = null;
    this._scribe = null;
    this._sshReconnects = new Map(); // name → { count, lastAttempt }
    this._sessionIds = {};  // name → sessionId for --resume (4.1)
    this._tokenUsage = { daily: {}, lastScan: 0, offsets: {} };
    this._loadTokenState();
    this._sseClients = new Set(); // SSE client connections (3.5)
    this._stateMachine = new StateMachine({
      maxTestFails: this.config.stateMachine?.maxTestFails || 3
    });
    const slCfg = this.config.summaryLayer || {};
    this._summaryLayer = new SummaryLayer({
      threshold: slCfg.threshold,
      tailLines: slCfg.tailLines,
      maxSummary: slCfg.maxSummary,
    });
    this._termInterface = new TerminalInterface(
      this.config.compatibility?.patterns || {},
      { alwaysApproveForSession: this.config.autoApprove?.alwaysApproveForSession || false }
    );
    const apCfg = this.config.adaptivePolling || {};
    this._adaptivePolling = new AdaptivePolling({
      minIntervalMs: apCfg.minIntervalMs,
      maxIntervalMs: apCfg.maxIntervalMs,
      baseIntervalMs: this.config.daemon?.idleThresholdMs || 3000,
      windowMs: apCfg.windowMs,
      busyThreshold: apCfg.busyThreshold,
    });
    this._hookEvents = new Map(); // name → [events] — hook event buffer per worker (3.15)
    this._notifications = null; // set by daemon via setNotifications()
  }

  setNotifications(notifications) {
    this._notifications = notifications;
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
      // Recover lost workers from previous daemon session
      this.lostWorkers = [];
      // Session ID map for --resume support (4.1)
      this._sessionIds = {};
      if (Array.isArray(data.workers)) {
        for (const w of data.workers) {
          if (w.sessionId) {
            this._sessionIds[w.name] = w.sessionId;
          }
          if (w.name && w.alive) {
            this.lostWorkers.push({
              name: w.name,
              pid: w.pid,
              branch: w.branch || null,
              worktree: w.worktree || null,
              sessionId: w.sessionId || null,
              lostAt: new Date().toISOString()
            });
          }
        }
      }
      // Restore task queue
      if (Array.isArray(data.taskQueue)) {
        this._taskQueue = data.taskQueue;
      }
    } catch {
      this.offsets = {};
      this.lostWorkers = [];
    }
  }

  _saveState() {
    const data = {
      daemonVersion: this._daemonVersion || null,
      offsets: {},
      workers: [],
      lostWorkers: this.lostWorkers || [],
      taskQueue: this._taskQueue || [],
    };
    for (const [name, w] of this.workers) {
      data.offsets[name] = w.snapshotIndex;
      const exitSnapshot = !w.alive
        ? [...w.snapshots].reverse().find(s => s.exited)
        : null;
      data.workers.push({
        name,
        pid: w.proc ? w.proc.pid : null,
        alive: w.alive,
        branch: w.branch || null,
        worktree: w.worktree || null,
        sessionId: w._sessionId || null,
        exitedAt: exitSnapshot ? new Date(exitSnapshot.time).toISOString() : null
      });
    }
    fs.writeFileSync(STATE_FILE, JSON.stringify(data, null, 2));
  }

  // --- Session Resume (4.1) ---

  _getWorkerSessionId(workerName, workerDir) {
    // Find the most recent Claude Code JSONL session for this worker's project dir
    const home = platformHomedir();
    const claudeProjects = path.join(home, '.claude', 'projects');
    if (!fs.existsSync(claudeProjects)) return null;

    const projectPath = (workerDir || '').replace(/\\/g, '/');
    if (!projectPath) return null;

    // Find matching project directory (Claude encodes paths: C:\Users\silof\c4 → C--Users-silof-c4)
    let projectDir = null;
    try {
      const entries = fs.readdirSync(claudeProjects);
      for (const entry of entries) {
        const decoded = entry.replace(/^([A-Z])--/, '$1:/').replace(/-/g, '/');
        if (decoded === projectPath || projectPath.startsWith(decoded + '/') || projectPath === decoded) {
          projectDir = path.join(claudeProjects, entry);
          break;
        }
      }
    } catch { return null; }

    if (!projectDir || !fs.existsSync(projectDir)) return null;

    // Find the most recently modified .jsonl file
    let latestFile = null;
    let latestMtime = 0;
    try {
      for (const entry of fs.readdirSync(projectDir)) {
        if (!entry.endsWith('.jsonl')) continue;
        const fullPath = path.join(projectDir, entry);
        const stat = fs.statSync(fullPath);
        if (stat.mtimeMs > latestMtime) {
          latestMtime = stat.mtimeMs;
          latestFile = entry;
        }
      }
    } catch { return null; }

    if (!latestFile) return null;
    return latestFile.replace('.jsonl', '');
  }

  _updateSessionId(name) {
    const w = this.workers.get(name);
    if (!w) return;
    const dir = w.worktree || this._detectRepoRoot();
    if (!dir) return;
    const sid = this._getWorkerSessionId(name, dir);
    if (sid) {
      w._sessionId = sid;
      this._sessionIds[name] = sid;
    }
  }

  getSessionId(name) {
    // Try live worker first, then stored state
    this._updateSessionId(name);
    const w = this.workers.get(name);
    if (w && w._sessionId) return w._sessionId;
    return this._sessionIds[name] || null;
  }

  // --- SSE Event Streaming (3.5) ---

  _emitSSE(type, data) {
    const event = { type, ...data, timestamp: Date.now() };
    this.emit('sse', event);
  }

  addSSEClient(res) {
    this._sseClients.add(res);
    res.on('close', () => this._sseClients.delete(res));
  }

  // --- Hook Architecture (3.15) ---
  // Receives structured JSON events from Claude Code hooks (PreToolUse/PostToolUse)
  // instead of relying on ScreenBuffer parsing for permission/action detection.

  hookEvent(workerName, event) {
    console.error(`[C4] hookEvent: worker=${workerName} hook_type=${event.hook_type || ''} tool=${event.tool_name || ''}`);
    const w = this.workers.get(workerName);
    if (!w) return { error: `Worker '${workerName}' not found` };

    // Store event in buffer
    if (!this._hookEvents.has(workerName)) {
      this._hookEvents.set(workerName, []);
    }
    const events = this._hookEvents.get(workerName);
    const hookEntry = {
      ...event,
      receivedAt: Date.now()
    };
    events.push(hookEntry);

    // Keep buffer bounded
    if (events.length > 500) {
      events.splice(0, events.length - 500);
    }

    // Emit SSE for real-time monitoring
    this._emitSSE('hook', { worker: workerName, event: hookEntry });

    // Persist to JSONL file (4.2)
    this._appendEventLog(workerName, hookEntry);

    const hookType = event.hook_type; // 'PreToolUse' or 'PostToolUse'
    const toolName = event.tool_name || '';
    const toolInput = event.tool_input || {};

    // --- PreToolUse: scope check + auto-approve decision ---
    if (hookType === 'PreToolUse') {
      return this._handlePreToolUse(workerName, w, toolName, toolInput, event);
    }

    // --- PostToolUse: track progress, detect errors, update routine state ---
    if (hookType === 'PostToolUse') {
      return this._handlePostToolUse(workerName, w, toolName, toolInput, event);
    }

    return { received: true, worker: workerName };
  }

  _handlePreToolUse(workerName, worker, toolName, toolInput, event) {
    const result = { received: true, worker: workerName, hook_type: 'PreToolUse' };

    // Scope guard check via structured data (more accurate than screen parsing)
    if (worker.scopeGuard && worker.scopeGuard.hasRestrictions()) {
      if (toolName === 'Bash' || toolName === 'bash') {
        const command = toolInput.command || '';
        const scopeResult = worker.scopeGuard.checkBash(command);
        if (scopeResult && !scopeResult.allowed) {
          worker.snapshots.push({
            time: Date.now(),
            screen: `[HOOK SCOPE DENY] Bash: ${command}\n  reason: ${scopeResult.reason}`,
            autoAction: true,
            scopeViolation: true,
            hookEvent: true
          });
          this._emitSSE('scope_deny', { worker: workerName, tool: toolName, command, reason: scopeResult.reason });
          result.action = 'deny';
          result.reason = scopeResult.reason;
          return result;
        }
      } else if (toolName === 'Write' || toolName === 'Edit') {
        const filePath = toolInput.file_path || toolInput.path || '';
        if (filePath) {
          const scopeResult = worker.scopeGuard.checkFile(filePath);
          if (scopeResult && !scopeResult.allowed) {
            worker.snapshots.push({
              time: Date.now(),
              screen: `[HOOK SCOPE DENY] ${toolName}: ${filePath}\n  reason: ${scopeResult.reason}`,
              autoAction: true,
              scopeViolation: true,
              hookEvent: true
            });
            this._emitSSE('scope_deny', { worker: workerName, tool: toolName, file: filePath, reason: scopeResult.reason });
            result.action = 'deny';
            result.reason = scopeResult.reason;
            return result;
          }
        }
      }
    }

    // Emit permission event for monitoring
    if (['Bash', 'bash', 'Write', 'Edit', 'NotebookEdit'].includes(toolName)) {
      const detail = toolName === 'Bash' || toolName === 'bash'
        ? (toolInput.command || '').slice(0, 200)
        : (toolInput.file_path || toolInput.path || '');
      this._emitSSE('permission', { worker: workerName, promptType: toolName.toLowerCase(), detail, source: 'hook' });
    }

    // Hook permission Slack routing (5.10)
    // When a tool use is denied by scope/compound block, notify via Slack
    if (result.decision === 'block' || result.action === 'deny') {
      const toolDesc = `${toolName}: ${JSON.stringify(toolInput).substring(0, 100)}`;
      if (this._notifications) {
        this._notifications.pushAll(`[HOOK DENY] ${workerName}: ${toolDesc}`);
        this._notifications._flushSlack();
      }
    }

    return result;
  }

  _handlePostToolUse(workerName, worker, toolName, toolInput, event) {
    const result = { received: true, worker: workerName, hook_type: 'PostToolUse' };
    const toolOutput = event.tool_output || '';
    const toolError = event.tool_error || '';

    // Track routine state from structured events
    if (toolName === 'Bash' || toolName === 'bash') {
      const command = toolInput.command || '';
      // Test execution detection
      if (/npm test|pytest|jest|mocha/.test(command)) {
        if (!worker._routineState) worker._routineState = { tested: false, docsUpdated: false };
        worker._routineState.tested = true;
      }
      // Commit detection — reset routine + CI feedback loop (5.20)
      if (/git commit/.test(command) && !toolError) {
        worker._routineState = { tested: false, docsUpdated: false };
        // CI feedback loop: auto-run npm test after commit
        const ciDir = (worker.worktree || this._detectRepoRoot() || '').replace(/\\/g, '/');
        if (ciDir && worker.alive && worker.proc) {
          const ciConfig = this.config.ci || {};
          if (ciConfig.enabled !== false) {
            const testCmd = ciConfig.testCommand || 'npm test';
            setTimeout(() => {
              try {
                execSyncSafe(`${testCmd}`, {
                  cwd: ciDir, encoding: 'utf8', stdio: 'pipe',
                  timeout: ciConfig.timeoutMs || 120000
                });
                // Test passed
                worker._lastCiResult = { passed: true, time: Date.now() };
                this._emitSSE('ci', { worker: workerName, result: 'pass', command: testCmd });
                if (this._notifications) {
                  this._notifications.pushAll(`[CI PASS] ${workerName}: ${testCmd}`);
                }
              } catch (ciErr) {
                // Test failed — send feedback to worker
                const output = (ciErr.stderr || ciErr.stdout || ciErr.message || '').slice(-1000);
                worker._lastCiResult = { passed: false, time: Date.now(), output };
                worker.snapshots.push({
                  time: Date.now(),
                  screen: `[CI FAIL] ${testCmd}\n${output.slice(-300)}`,
                  autoAction: true, ci: true
                });
                this._emitSSE('ci', { worker: workerName, result: 'fail', command: testCmd, output: output.slice(0, 500) });
                if (this._notifications) {
                  this._notifications.pushAll(`[CI FAIL] ${workerName}: ${testCmd}`);
                }
                // Auto-feedback to worker
                const feedback = `CI 실패: ${testCmd} 실행 결과 테스트가 실패했어. 아래 에러를 확인하고 수정해줘:\n${output.slice(-500)}`;
                if (worker.alive && worker.proc) {
                  this._writeTaskAndEnter(worker.proc, feedback);
                }
              }
            }, 2000); // wait for commit to fully complete
          }
        }
      }
    }

    // Docs update detection
    if ((toolName === 'Write' || toolName === 'Edit') &&
        /TODO\.md|CHANGELOG\.md|README\.md/.test(toolInput.file_path || toolInput.path || '')) {
      if (!worker._routineState) worker._routineState = { tested: false, docsUpdated: false };
      worker._routineState.docsUpdated = true;
    }

    // Error tracking from tool output
    if (toolError) {
      const maxRetries = (this._getInterventionConfig().escalation?.maxRetries) ?? 3;
      if (!worker._errorHistory) worker._errorHistory = [];
      const errLine = toolError.slice(0, 200);
      const existing = worker._errorHistory.find(e => e.line === errLine);
      if (existing) {
        existing.count++;
        if (existing.count >= maxRetries) {
          worker._interventionState = 'escalation';
          worker.snapshots.push({
            time: Date.now(),
            screen: `[HOOK ESCALATION] repeated error (${existing.count}x): ${errLine}`,
            autoAction: true,
            intervention: 'escalation',
            hookEvent: true
          });
          this._emitSSE('error', { worker: workerName, line: errLine, count: existing.count, escalation: true, source: 'hook' });
          // Immediate intervention notification (5.29)
          if (this._notifications) {
            this._notifications.notifyStall(workerName, `intervention: escalation — ${errLine.slice(0, 100)}`);
          }
          existing.count = 0;
        }
      } else {
        worker._errorHistory.push({ line: errLine, count: 1, firstSeen: Date.now() });
      }
    }

    // Subagent tracking (3.17)
    if (toolName === 'Agent') {
      if (!worker._subagentCount) worker._subagentCount = 0;
      worker._subagentCount++;
      worker.snapshots.push({
        time: Date.now(),
        screen: `[HOOK SUBAGENT] Agent spawned (#${worker._subagentCount}): ${(toolInput.prompt || '').slice(0, 100)}`,
        autoAction: true,
        hookEvent: true
      });
      this._emitSSE('subagent', { worker: workerName, count: worker._subagentCount, prompt: (toolInput.prompt || '').slice(0, 200) });
      this._trackSubagent(workerName, worker, toolInput, event);
    }

    return result;
  }

  getHookEvents(workerName, limit = 50) {
    const events = this._hookEvents.get(workerName) || [];
    return { worker: workerName, events: events.slice(-limit), total: events.length };
  }

  // --- Hook Event JSONL Persistence (4.2) ---
  // Appends hook events to logs/events-<workerName>.jsonl for replay/debugging
  _appendEventLog(workerName, hookEntry) {
    if (!workerName || typeof workerName !== 'string') return;
    if (!hookEntry || typeof hookEntry !== 'object') return;

    try {
      const dir = this.logsDir;
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      const logFile = path.join(dir, `events-${workerName}.jsonl`);
      console.error(`[C4] _appendEventLog: ${logFile} tool=${hookEntry.tool_name || ''}`);
      const line = JSON.stringify(hookEntry) + '\n';
      fs.appendFileSync(logFile, line, 'utf8');
    } catch (err) {
      console.error(`[C4] _appendEventLog error: ${err.message}`);
    }
  }

  // Build hook commands for worker's .claude/settings.json (3.15)
  // These hooks POST structured JSON data to the C4 daemon
  _buildHookCommands(workerName) {
    const port = this.config.daemon?.port || 3456;
    const host = this.config.daemon?.host || '127.0.0.1';
    const baseUrl = `http://${host}:${port}`;

    // Use curl to POST hook event data to daemon
    // Claude Code passes hook data as JSON to stdin
    const curlCmd = IS_WIN
      ? `powershell -NoProfile -Command "$input = [Console]::In.ReadToEnd(); Invoke-RestMethod -Uri '${baseUrl}/hook-event' -Method Post -ContentType 'application/json' -Body $input"`
      : `curl -s -X POST -H 'Content-Type: application/json' -d @- '${baseUrl}/hook-event'`;

    return {
      PreToolUse: [{
        hooks: [{
          type: 'command',
          command: curlCmd
        }]
      }],
      PostToolUse: [{
        hooks: [{
          type: 'command',
          command: curlCmd
        }]
      }]
    };
  }

  // Compound command blocking (4.6): returns a shell command that reads tool_input
  // from stdin and exits 2 (block) if &&, ||, |, or ; are found in the command.
  // Uses standalone script to avoid shell escaping issues (5.19).
  _buildCompoundBlockCommand() {
    const scriptPath = path.join(__dirname, 'compound-check.js').replace(/\\/g, '/');
    return `node "${scriptPath}"`;
  }

  // --- Token Usage State (2.5) ---

  _loadTokenState() {
    const stateFile = path.join(__dirname, '..', 'token-state.json');
    try {
      const data = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
      this._tokenUsage = {
        daily: data.daily || {},
        lastScan: data.lastScan || 0,
        offsets: data.offsets || {}
      };
    } catch {
      this._tokenUsage = { daily: {}, lastScan: 0, offsets: {} };
    }
  }

  _saveTokenState() {
    const stateFile = path.join(__dirname, '..', 'token-state.json');
    fs.writeFileSync(stateFile, JSON.stringify(this._tokenUsage, null, 2));
  }

  // --- SSH Helpers (2.4) ---

  _buildSshArgs(target) {
    const sshArgs = ['-t', '-o', 'StrictHostKeyChecking=no'];

    // ControlMaster for persistent connections (Unix only — Linux and macOS)
    if (!IS_WIN) {
      const sshCfg = this.config.ssh || {};
      if (sshCfg.controlMaster !== false) {
        const controlDir = path.join(os.tmpdir(), 'c4-ssh');
        if (!fs.existsSync(controlDir)) {
          fs.mkdirSync(controlDir, { recursive: true, mode: 0o700 });
        }
        const controlPath = sshCfg.controlPath || path.join(controlDir, '%r@%h:%p');
        const controlPersist = sshCfg.controlPersist || 60;
        sshArgs.push(
          '-o', `ControlMaster=auto`,
          '-o', `ControlPath=${controlPath}`,
          '-o', `ControlPersist=${controlPersist}`
        );
      }
    }

    // ServerAlive for disconnect detection (all platforms)
    const sshCfg = this.config.ssh || {};
    const serverAliveInterval = sshCfg.serverAliveInterval || 15;
    const serverAliveCountMax = sshCfg.serverAliveCountMax || 3;
    sshArgs.push(
      '-o', `ServerAliveInterval=${serverAliveInterval}`,
      '-o', `ServerAliveCountMax=${serverAliveCountMax}`
    );

    if (target.port) sshArgs.push('-p', String(target.port));
    if (target.identityFile) sshArgs.push('-i', target.identityFile);
    sshArgs.push(target.host);

    return sshArgs;
  }

  _handleSshReconnect(name, worker) {
    const sshCfg = this.config.ssh || {};
    if (!sshCfg.reconnect) return null;

    const maxReconnects = sshCfg.maxReconnects || 3;
    const reconnectDelayMs = sshCfg.reconnectDelayMs || 5000;

    let state = this._sshReconnects.get(name);
    if (!state) {
      state = { count: 0, lastAttempt: 0 };
      this._sshReconnects.set(name, state);
    }

    if (state.count >= maxReconnects) {
      worker.snapshots.push({
        time: Date.now(),
        screen: `[SSH WARN] reconnect limit reached (${maxReconnects}x) for '${name}'`,
        autoAction: true,
        sshWarn: true
      });
      this._sshReconnects.delete(name);
      return null;
    }

    const elapsed = Date.now() - state.lastAttempt;
    if (elapsed < reconnectDelayMs) return null;

    state.count++;
    state.lastAttempt = Date.now();

    worker.snapshots.push({
      time: Date.now(),
      screen: `[SSH WARN] connection lost, reconnecting (${state.count}/${maxReconnects})...`,
      autoAction: true,
      sshWarn: true
    });

    // Re-create with same params
    const command = worker.command.split(' ')[0];
    const args = worker.command.split(' ').slice(1);
    const target = worker.target;
    const branch = worker.branch;
    const worktree = worker.worktree;

    // Clean up
    if (worker.idleTimer) clearTimeout(worker.idleTimer);
    if (worker.rawLogStream && !worker.rawLogStream.destroyed) worker.rawLogStream.end();
    this.workers.delete(name);

    const result = this.create(name, command, args, { target });
    if (result.error) {
      return { status: 'reconnect_failed', error: result.error };
    }

    // Restore branch/worktree info
    const newWorker = this.workers.get(name);
    if (newWorker) {
      newWorker.branch = branch;
      newWorker.worktree = worktree;
    }

    return { status: 'reconnected', attempt: state.count, pid: result.pid };
  }

  // --- Token Usage Monitoring (2.5) ---

  _getProjectDir() {
    const home = os.homedir();
    const claudeProjects = path.join(home, '.claude', 'projects');
    const projectId = this.config.tokenMonitor?.projectId || this.config.scribe?.projectId || '';

    if (projectId) {
      const dir = path.join(claudeProjects, projectId);
      return fs.existsSync(dir) ? dir : null;
    }

    if (!fs.existsSync(claudeProjects)) return null;

    const projectRoot = this._detectRepoRoot() || path.join(__dirname, '..');
    const cwd = projectRoot.replace(/\\/g, '/');
    const entries = fs.readdirSync(claudeProjects);

    for (const entry of entries) {
      const decoded = entry
        .replace(/^([A-Z])--/, '$1:/')
        .replace(/-/g, '/');
      if (decoded === cwd || cwd.startsWith(decoded + '/')) {
        return path.join(claudeProjects, entry);
      }
    }

    return null;
  }

  _parseTokensFromJsonl(filePath) {
    const offset = this._tokenUsage.offsets[filePath] || 0;
    let content;
    try {
      content = fs.readFileSync(filePath, 'utf8');
    } catch {
      return { input: 0, output: 0 };
    }

    const lines = content.split('\n');
    if (offset >= lines.length) return { input: 0, output: 0 };

    let inputTokens = 0;
    let outputTokens = 0;

    for (let i = offset; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;
      try {
        const obj = JSON.parse(line);
        // Claude JSONL: assistant messages have usage data
        const usage = obj.message?.usage || obj.usage;
        if (usage) {
          if (usage.input_tokens) inputTokens += usage.input_tokens;
          if (usage.output_tokens) outputTokens += usage.output_tokens;
        }
        // Also check costUSD if available
        if (obj.costUSD && !usage) {
          // Estimate tokens from cost (~$3/M input, ~$15/M output for Opus)
          // Just track cost directly as a fallback
        }
      } catch {}
    }

    this._tokenUsage.offsets[filePath] = lines.length;
    return { input: inputTokens, output: outputTokens };
  }

  _getLastActivity(w) {
    if (w._taskText) {
      const firstLine = w._taskText.split('\n')[0].trim();
      if (firstLine) return firstLine.substring(0, 80);
    }
    return 'idle';
  }

  _checkTokenUsage() {
    const cfg = this.config.tokenMonitor || {};
    if (cfg.enabled === false) return null;

    const projectDir = this._getProjectDir();
    if (!projectDir) return null;

    // Scan JSONL files (same pattern as scribe)
    const sessionFiles = [];
    try {
      for (const entry of fs.readdirSync(projectDir)) {
        if (entry.endsWith('.jsonl')) {
          sessionFiles.push(path.join(projectDir, entry));
        }
      }
    } catch {}

    const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
    if (!this._tokenUsage.daily[today]) {
      this._tokenUsage.daily[today] = { input: 0, output: 0 };
    }

    let newInput = 0;
    let newOutput = 0;

    for (const filePath of sessionFiles) {
      const tokens = this._parseTokensFromJsonl(filePath);
      newInput += tokens.input;
      newOutput += tokens.output;
    }

    this._tokenUsage.daily[today].input += newInput;
    this._tokenUsage.daily[today].output += newOutput;
    this._tokenUsage.lastScan = Date.now();

    // Clean up old days (keep 7 days)
    const keys = Object.keys(this._tokenUsage.daily).sort();
    while (keys.length > 7) {
      delete this._tokenUsage.daily[keys.shift()];
    }

    this._saveTokenState();

    const dailyTotal = this._tokenUsage.daily[today];
    const totalTokens = dailyTotal.input + dailyTotal.output;
    const dailyLimit = cfg.dailyLimit || 0;
    const warnThreshold = cfg.warnThreshold || 0.8;

    let warning = null;
    if (dailyLimit > 0) {
      const ratio = totalTokens / dailyLimit;
      if (ratio >= 1.0) {
        warning = `[TOKEN WARN] daily limit exceeded: ${totalTokens.toLocaleString()} / ${dailyLimit.toLocaleString()} tokens (${Math.round(ratio * 100)}%)`;
      } else if (ratio >= warnThreshold) {
        warning = `[TOKEN WARN] approaching daily limit: ${totalTokens.toLocaleString()} / ${dailyLimit.toLocaleString()} tokens (${Math.round(ratio * 100)}%)`;
      }
    }

    return {
      today,
      input: dailyTotal.input,
      output: dailyTotal.output,
      total: totalTokens,
      dailyLimit,
      warning
    };
  }

  getTokenUsage() {
    const today = new Date().toISOString().split('T')[0];
    const dailyTotal = this._tokenUsage.daily[today] || { input: 0, output: 0 };
    return {
      today,
      input: dailyTotal.input,
      output: dailyTotal.output,
      total: dailyTotal.input + dailyTotal.output,
      dailyLimit: this.config.tokenMonitor?.dailyLimit || 0,
      history: this._tokenUsage.daily
    };
  }

  // --- Task Queue helpers (2.2, 2.3, 2.8) ---

  _activeWorkerCount() {
    let count = 0;
    for (const [, w] of this.workers) {
      if (w.alive) count++;
    }
    return count;
  }

  _enqueueTask(name, task, options = {}) {
    const entry = {
      name,
      task,
      command: options.command || 'claude',
      args: options.args || [],
      target: options.target || 'local',
      branch: options.branch || `c4/${name}`,
      useBranch: options.useBranch !== false,
      useWorktree: options.useWorktree,
      projectRoot: options.projectRoot || null,
      scope: options.scope || null,
      scopePreset: options.scopePreset || '',
      after: options.after || null,
      contextFrom: options.contextFrom || null,
      queuedAt: Date.now()
    };
    this._taskQueue.push(entry);
    this._saveState();
    return {
      queued: true,
      name,
      after: entry.after,
      position: this._taskQueue.length,
      reason: entry.after ? `waiting for ${entry.after}` : 'maxWorkers reached'
    };
  }

  _canStartQueuedTask(entry) {
    // Check dependency
    if (entry.after) {
      const dep = this.workers.get(entry.after);
      if (dep && dep.alive) return false;
    }
    // Check maxWorkers
    const maxW = this.config.maxWorkers || 0;
    if (maxW > 0 && this._activeWorkerCount() >= maxW) return false;
    return true;
  }

  _processQueue() {
    if (this._taskQueue.length === 0) return [];

    const started = [];
    const remaining = [];

    for (const entry of this._taskQueue) {
      // Auto-resume: send task to existing idle worker (4.17)
      const existingWorker = this.workers.get(entry.name);
      if (existingWorker && existingWorker.alive && !existingWorker._pendingTask && !existingWorker._taskText) {
        const fullTask = this._buildTaskText(existingWorker, entry.task, entry);
        this._writeTaskAndEnter(existingWorker.proc, fullTask);
        existingWorker._taskText = entry.task;
        existingWorker._taskStartedAt = new Date().toISOString();
        started.push({ name: entry.name, result: { sent: true } });
        continue;
      }
      if (this._canStartQueuedTask(entry)) {
        const result = this._createAndSendTask(entry);
        started.push({ name: entry.name, result });
      } else {
        remaining.push(entry);
      }
    }

    this._taskQueue = remaining;
    if (started.length > 0) this._saveState();
    return started;
  }

  _createAndSendTask(entry) {
    // Clean up exited worker with same name if exists
    const existing = this.workers.get(entry.name);
    if (existing) {
      if (existing.alive) {
        return { error: `Worker '${entry.name}' is already alive` };
      }
      if (existing.idleTimer) clearTimeout(existing.idleTimer);
      if (existing._pendingTaskTimer) { clearInterval(existing._pendingTaskTimer); existing._pendingTaskTimer = null; }
      if (existing._pendingTaskTimeoutTimer) { clearTimeout(existing._pendingTaskTimeoutTimer); existing._pendingTaskTimeoutTimer = null; }
      if (existing.rawLogStream && !existing.rawLogStream.destroyed) existing.rawLogStream.end();
      this.workers.delete(entry.name);
    }

    // Worktree setup BEFORE spawning worker (5.19): create worktree + settings first
    // so Claude Code loads .claude/settings.json (with PreToolUse hooks) from the worktree
    const targetResolved = this._resolveTarget(entry.target || 'local');
    const isSshTarget = targetResolved && targetResolved.type === 'ssh';
    // (5.37) --no-branch disables worktree as well
    const useWorktree = !isSshTarget && entry.useWorktree !== false && entry.useBranch !== false && this.config.worktree?.enabled !== false;
    let worktreePath = null;
    let worktreeRepoRoot = null;
    let worktreeBranch = null;
    const worktreeWarnings = [];

    if (entry.useBranch !== false && useWorktree) {
      const repoRoot = this._detectRepoRoot(entry.projectRoot, entry.cwd);
      if (repoRoot) {
        worktreeBranch = entry.branch || `c4/${entry.name}`;
        worktreePath = this._worktreePath(repoRoot, entry.name);
        worktreeRepoRoot = repoRoot;
        try {
          this._createWorktree(repoRoot, worktreePath, worktreeBranch);

          // Auto-generate .claude/settings.json for this worktree
          try {
            this._writeWorkerSettings(worktreePath, entry.name, {
              branch: worktreeBranch,
              useWorktree: true,
              _autoWorker: entry._autoWorker
            });
          } catch (e) {
            worktreeWarnings.push(`[C4 WARN] Failed to write worker settings: ${e.message}`);
          }
        } catch (e) {
          worktreeWarnings.push(`[C4 WARN] Failed to create worktree: ${e.message}`);
          worktreePath = null;
          worktreeRepoRoot = null;
          worktreeBranch = null;
        }
      }
    }

    // Spawn worker with cwd set to worktree so Claude Code loads project settings
    const createOpts = { target: entry.target };
    if (worktreePath) createOpts.cwd = worktreePath;
    const createResult = this.create(entry.name, entry.command, entry.args, createOpts);
    if (createResult.error) return createResult;

    const w = this.workers.get(entry.name);

    if (worktreePath) {
      w.worktree = worktreePath;
      w.worktreeRepoRoot = worktreeRepoRoot;
      w.branch = worktreeBranch;
    }

    // Record any worktree warnings
    for (const msg of worktreeWarnings) {
      w.snapshots = w.snapshots || [];
      w.snapshots.push({ time: Date.now(), screen: msg, autoAction: true });
    }

    // Dynamic effort level (3.3) — template effort overrides (3.18)
    if (entry._templateEffort) {
      w._dynamicEffort = entry._templateEffort;
    } else {
      w._dynamicEffort = this._determineEffort(entry.task);
    }

    // Auto worker flag (4.8): mark for morning report on exit
    if (entry._autoWorker) {
      w._autoWorker = true;
      // Write settings with PreToolUse hooks to project root so they're active from start
      const projectRoot = this._detectRepoRoot(entry.projectRoot, entry.cwd);
      if (projectRoot) {
        try {
          this._writeWorkerSettings(projectRoot, entry.name, { _autoWorker: true });
        } catch {}
      }
    }

    // Store pending task — will be sent after worker setup completes
    w._pendingTask = {
      task: entry.task,
      options: {
        branch: entry.branch,
        useBranch: entry.useBranch,
        useWorktree: entry.useWorktree,
        cwd: entry.cwd,
        projectRoot: entry.projectRoot,
        scope: entry.scope,
        scopePreset: entry.scopePreset,
        contextFrom: entry.contextFrom,
        autoMode: entry.autoMode,
        _autoWorker: entry._autoWorker
      }
    };
    w._pendingTaskTime = Date.now();

    // Active polling: check screen readiness every 500ms instead of relying only on idle handler
    w._pendingTaskTimer = setInterval(async () => {
      const worker = this.workers.get(entry.name);
      if (!worker || !worker.alive || !worker._pendingTask || worker._pendingTaskSent) {
        clearInterval(w._pendingTaskTimer);
        w._pendingTaskTimer = null;
        return;
      }

      const text = this._getScreenText(worker.screen);
      const isReady = this._termInterface.isReady(text);
      const effortLevel = worker._dynamicEffort || this.config.workerDefaults?.effortLevel;
      const needsSetup = effortLevel && !worker.setupDone;

      // Send immediately when prompt is ready and effort setup is complete (or not needed)
      if (isReady && !needsSetup) {
        clearInterval(w._pendingTaskTimer);
        w._pendingTaskTimer = null;
        worker._pendingTaskSent = true;
        const pt = worker._pendingTask;
        const fullTask = this._buildTaskText(worker, pt.task, pt.options);
        await this._writeTaskAndEnter(worker.proc, fullTask);
        worker._taskText = pt.task;
        worker._taskStartedAt = new Date().toISOString();
        worker._pendingTask = null;
      }
    }, 500);

    // Timeout fallback: force-send if polling hasn't detected idle in time
    const pendingTimeoutMs = this.config.workerDefaults?.pendingTaskTimeout ?? 30000;
    w._pendingTaskTimeoutTimer = setTimeout(async () => {
      if (w._pendingTaskTimer) {
        clearInterval(w._pendingTaskTimer);
        w._pendingTaskTimer = null;
      }
      const worker = this.workers.get(entry.name);
      if (worker && worker.alive && worker._pendingTask && !worker._pendingTaskSent) {
        worker._pendingTaskSent = true;
        const pt = worker._pendingTask;
        const fullTask = this._buildTaskText(worker, pt.task, pt.options);
        await this._writeTaskAndEnter(worker.proc, fullTask);
        worker._taskText = pt.task;
        worker._taskStartedAt = new Date().toISOString();
        worker._pendingTask = null;
        worker.snapshots = worker.snapshots || [];
        worker.snapshots.push({
          time: Date.now(),
          screen: `[C4 WARN] pendingTask sent via timeout fallback (${pendingTimeoutMs}ms)`,
          autoAction: true
        });
      }
    }, pendingTimeoutMs);

    return { created: true, name: entry.name, pid: createResult.pid };
  }

  _buildTaskText(worker, task, options = {}) {
    const commands = [];
    if (worker.worktree) {
      const cdPath = worker.worktree.replace(/\\/g, '/');
      commands.push(`cd ${cdPath} 로 이동해서 작업해줘. 현재 브랜치는 ${worker.branch || 'unknown'}야. 작업 단위마다 커밋해줘.`);
    }
    const rulesSummary = this._getRulesSummary();
    if (rulesSummary) commands.push(rulesSummary);
    if (worker.scopeGuard && worker.scopeGuard.hasRestrictions()) {
      commands.push(worker.scopeGuard.toSummary());
    }
    if (options.contextFrom) {
      const ctx = this._getContextSnapshots(options.contextFrom, 3);
      if (ctx) commands.push(ctx);
    }
    commands.push(task);
    const fullText = commands.join('\n\n');

    return this._maybeWriteTaskFile(worker, fullText);
  }

  // 5.35: long task -> file to prevent PTY truncation
  // 5.49: # character triggers Claude Code "Newline followed by # can hide arguments" warning
  _maybeWriteTaskFile(worker, fullText) {
    const hasHash = fullText.includes('#');
    if ((fullText.length > 1000 || hasHash) && worker.worktree) {
      const taskFilePath = path.join(worker.worktree, '.c4-task.md').replace(/\\/g, '/');
      fs.writeFileSync(taskFilePath, fullText, 'utf8');
      const cdPath = worker.worktree.replace(/\\/g, '/');
      return `${taskFilePath} 파일을 읽고 지시대로 작업해. cd ${cdPath} 후 작업 시작.`;
    }
    return fullText;
  }

  _getScreenText(screen) {
    return screen.getScreen();
  }

  /**
   * Execute effort setup Phase 2: send arrow keys + Enter to set effort level.
   * Extracted to avoid duplication between idle timer and polling timer.
   */
  _executeSetupPhase2(worker, proc) {
    if (worker.setupPhase !== 'waitMenu') return; // guard against double execution

    const effortLevel = worker._dynamicEffort || this.config.workerDefaults?.effortLevel;
    const setupCfg = this.config.workerDefaults?.effortSetup || {};
    const inputDelayMs = setupCfg.inputDelayMs ?? 500;
    const confirmDelayMs = setupCfg.confirmDelayMs ?? 500;

    worker.setupPhase = 'done';

    setTimeout(() => {
      const effortKeys = this._termInterface.getEffortKeys(effortLevel);
      // Send arrow keys (all but the trailing Enter)
      const arrowKeys = effortKeys.slice(0, -1);
      if (arrowKeys) proc.write(arrowKeys);
      setTimeout(() => {
        proc.write('\r'); // Enter to confirm
        worker.setupDone = true;
        worker.setupPhase = null;
        worker.setupPhaseStart = null;
        worker.snapshots.push({
          time: Date.now(),
          screen: `[C4 SETUP] effort level → ${effortLevel}` +
            (worker.setupRetries ? ` (after ${worker.setupRetries} retries)` : ''),
          autoAction: true
        });
        // (5.51) Trigger pending task delivery after setup completes
        if (worker._pendingTask && !worker._pendingTaskSent) {
          const postSetupMs = 2000;
          setTimeout(async () => {
            if (!worker._pendingTask || worker._pendingTaskSent || !worker.alive) return;
            const text = this._getScreenText(worker.screen);
            if (this._termInterface.isReady(text)) {
              worker._pendingTaskSent = true;
              const pt = worker._pendingTask;
              const fullTask = this._buildTaskText(worker, pt.task, pt.options);
              await this._writeTaskAndEnter(proc, fullTask);
              worker._taskText = pt.task;
              worker._taskStartedAt = new Date().toISOString();
              worker._pendingTask = null;
            }
          }, postSetupMs);
        }
      }, confirmDelayMs);
    }, inputDelayMs);
  }

  /**
   * Start periodic polling for model menu detection during waitMenu phase.
   * Independent of the idle timer, so detection doesn't depend on data events.
   */
  _startSetupPolling(worker, screen, proc) {
    if (worker._setupPollTimer) clearInterval(worker._setupPollTimer);

    worker._setupPollTimer = setInterval(() => {
      if (worker.setupPhase !== 'waitMenu' || worker.setupDone) {
        clearInterval(worker._setupPollTimer);
        worker._setupPollTimer = null;
        return;
      }
      const text = this._getScreenText(screen);
      if (this._termInterface.isModelMenu(text)) {
        clearInterval(worker._setupPollTimer);
        worker._setupPollTimer = null;
        this._executeSetupPhase2(worker, proc);
      }
    }, 500);
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

  _getPatterns() {
    return this.config.compatibility?.patterns || {
      trustPrompt: 'trust this folder',
      permissionPrompt: 'Do you want to proceed?',
      fileCreatePrompt: 'Do you want to create',
      fileEditPrompt: 'Do you want to make this edit',
      bashHeader: 'Bash command',
      editHeader: 'Edit file',
      createHeader: 'Create file',
      yesOption: '1. Yes',
      yesAlwaysEditOption: 'Yes, allow all edits during this session',
      yesAlwaysBashOption: 'Yes, and don\'t ask again for:',
      noOption: 'No',
      promptFooter: 'Esc to cancel'
    };
  }

  // --- Auto Mode (3.19) ---

  _isAutoModeEnabled(options = {}) {
    // Explicit --auto-mode flag takes priority
    if (options.autoMode === true) return true;
    if (options.autoMode === false) return false;

    // Global auto mode (set by c4 auto) — all workers inherit
    if (this._globalAutoMode) return true;

    // Check config default
    return this.config.autoMode?.enabled === true;
  }

  _applyAutoMode(settings, enabled) {
    if (!enabled) return settings;

    if (!settings.permissions) settings.permissions = {};
    settings.permissions.defaultMode = 'auto';

    return settings;
  }

  _getAutoModeConfig() {
    return this.config.autoMode || { enabled: false, allowOverride: true };
  }

  // --- Role Templates (3.18) ---

  _getTemplate(templateName) {
    const templates = this.config.templates || {};
    return templates[templateName] || null;
  }

  _getBuiltinTemplates() {
    return {
      planner: {
        description: 'Planner — 설계 전담, Opus 모델 사용',
        model: 'opus',
        effort: 'max',
        profile: 'planner',
        promptPrefix: '[역할: Planner] 설계와 분석에 집중해줘. 코드 직접 수정보다는 계획과 구조 설계를 해줘. plan.md나 설계 문서를 작성해줘.',
        command: 'claude',
        args: []
      },
      executor: {
        description: 'Executor — 구현 전담, Sonnet 모델 사용',
        model: 'sonnet',
        effort: 'high',
        profile: 'executor',
        promptPrefix: '[역할: Executor] 구현에 집중해줘. 설계 문서나 지시에 따라 코드를 작성하고 테스트해줘.',
        command: 'claude',
        args: []
      },
      reviewer: {
        description: 'Reviewer — 리뷰 전담, Haiku 모델 사용',
        model: 'haiku',
        effort: 'high',
        profile: 'reviewer',
        promptPrefix: '[역할: Reviewer] 코드 리뷰에 집중해줘. 버그, 보안 이슈, 코드 품질 문제를 찾아줘. 코드를 직접 수정하지 말고 리뷰 코멘트만 남겨줘.',
        command: 'claude',
        args: []
      }
    };
  }

  resolveTemplate(templateName) {
    // Check user-defined templates first, then builtins
    const userTemplate = this._getTemplate(templateName);
    if (userTemplate) return userTemplate;
    const builtins = this._getBuiltinTemplates();
    return builtins[templateName] || null;
  }

  listTemplates() {
    const builtins = this._getBuiltinTemplates();
    const userTemplates = this.config.templates || {};
    const result = {};
    // Builtins first
    for (const [name, tmpl] of Object.entries(builtins)) {
      result[name] = { ...tmpl, source: 'builtin' };
    }
    // User overrides
    for (const [name, tmpl] of Object.entries(userTemplates)) {
      result[name] = { ...tmpl, source: 'config' };
    }
    return result;
  }

  // Apply template to task/worker options
  _applyTemplate(templateName, options = {}) {
    const template = this.resolveTemplate(templateName);
    if (!template) return options;

    const result = { ...options };

    // Profile from template (if not explicitly set)
    if (template.profile && !result.profile) {
      result.profile = template.profile;
    }

    // Model override — will be applied via /model command after worker creation
    if (template.model) {
      result._templateModel = template.model;
    }

    // Effort level override
    if (template.effort) {
      result._templateEffort = template.effort;
    }

    // Prompt prefix
    if (template.promptPrefix) {
      result._templatePromptPrefix = template.promptPrefix;
    }

    // Command override
    if (template.command) {
      result.command = template.command;
    }

    return result;
  }

  // --- Subagent Swarm (3.17) ---

  _getSwarmConfig() {
    return this.config.swarm || { enabled: false, maxSubagents: 10, trackUsage: true };
  }

  getSwarmStatus(workerName) {
    const w = this.workers.get(workerName);
    if (!w) return { error: `Worker '${workerName}' not found` };

    const swarmCfg = this._getSwarmConfig();
    return {
      worker: workerName,
      enabled: swarmCfg.enabled !== false,
      maxSubagents: swarmCfg.maxSubagents || 10,
      subagentCount: w._subagentCount || 0,
      subagentLog: (w._subagentLog || []).slice(-20)
    };
  }

  // Called by _handlePostToolUse when Agent tool is detected (3.15 integration)
  _trackSubagent(workerName, worker, toolInput, event) {
    const swarmCfg = this._getSwarmConfig();
    if (!swarmCfg.enabled) return;

    if (!worker._subagentLog) worker._subagentLog = [];

    const entry = {
      index: (worker._subagentCount || 0),
      prompt: (toolInput.prompt || '').slice(0, 300),
      subagentType: toolInput.subagent_type || 'general-purpose',
      timestamp: Date.now(),
      status: 'spawned'
    };

    worker._subagentLog.push(entry);

    // Keep log bounded
    if (worker._subagentLog.length > 100) {
      worker._subagentLog.splice(0, worker._subagentLog.length - 100);
    }

    // Check limit
    const maxSubagents = swarmCfg.maxSubagents || 10;
    if ((worker._subagentCount || 0) > maxSubagents) {
      worker.snapshots.push({
        time: Date.now(),
        screen: `[SWARM WARN] subagent limit reached (${worker._subagentCount}/${maxSubagents})`,
        autoAction: true,
        swarmWarn: true
      });
      this._emitSSE('swarm_limit', {
        worker: workerName,
        count: worker._subagentCount,
        max: maxSubagents
      });
    }
  }

  // --- Worker Settings Profile (3.16 / 5.26) ---

  _getProfile(profileName) {
    const profiles = this.config.profiles || {};
    return profiles[profileName] || null;
  }

  listProfiles() {
    const profiles = this.config.profiles || {};
    const result = {};
    for (const [name, prof] of Object.entries(profiles)) {
      result[name] = {
        description: prof.description || '',
        allow: (prof.permissions && prof.permissions.allow) || [],
        deny: (prof.permissions && prof.permissions.deny) || []
      };
    }
    return result;
  }

  _buildWorkerSettings(workerName, options = {}) {
    const profileName = options.profile || options.template || '';
    const profile = profileName ? this._getProfile(profileName) : null;
    const hooksCfg = this.config.hooks || {};
    const settings = {};

    // Auto-manager (4.8): full permissions for autonomous operation
    if (options._autoWorker) {
      settings.permissions = this._buildAutoManagerPermissions();
    } else {
      // Permissions
      const permissions = { allow: [], deny: [] };

      if (profile && profile.permissions) {
        if (Array.isArray(profile.permissions.allow)) {
          permissions.allow.push(...profile.permissions.allow);
        }
        if (Array.isArray(profile.permissions.deny)) {
          permissions.deny.push(...profile.permissions.deny);
        }
        if (profile.permissions.defaultMode) {
          permissions.defaultMode = profile.permissions.defaultMode;
        }
      }

      // Default c4 permissions for all workers
      const defaultPerms = [
        'Bash(c4:*)',
        'Bash(MSYS_NO_PATHCONV=1 c4:*)',
        'Bash(git:*)',
        // Compound command patterns (5.48): prevent Claude Code's "bare repository attacks" prompt
        'Bash(cd * && *)',
        'Bash(cd * ; *)',
        'Bash(cd * || *)',
        'Bash(npm:*)', 'Bash(npx:*)', 'Bash(node:*)',
        'Bash(python:*)', 'Bash(python3:*)', 'Bash(pip:*)', 'Bash(pip3:*)',
        'Bash(poetry:*)',
        'Bash(cargo:*)', 'Bash(go:*)', 'Bash(rustc:*)',
        'Bash(make:*)', 'Bash(cmake:*)',
        'Bash(ffmpeg:*)', 'Bash(ffprobe:*)',
        'Bash(docker:*)', 'Bash(docker-compose:*)',
        'Bash(ls:*)', 'Bash(cat:*)', 'Bash(head:*)', 'Bash(tail:*)',
        'Bash(grep:*)', 'Bash(find:*)', 'Bash(wc:*)',
        'Bash(mkdir:*)', 'Bash(cp:*)', 'Bash(mv:*)', 'Bash(touch:*)',
        'Bash(pwd)', 'Bash(echo:*)', 'Bash(test:*)',
        'Bash(nvidia-smi:*)', 'Bash(nohup:*)', 'Bash(lsof:*)',
        'Bash(env:*)', 'Bash(which:*)', 'Bash(whoami)',
        'Bash(curl:*)', 'Bash(wget:*)',
        'Read', 'Edit', 'Write', 'Glob', 'Grep',
      ];
      for (const perm of defaultPerms) {
        if (!permissions.allow.includes(perm)) {
          permissions.allow.push(perm);
        }
      }

      settings.permissions = permissions;
    }

    // Complete hook set (4.6/4.9 fix): build all hooks explicitly
    // Don't rely on Claude Code's settings merge — generate a self-contained hook set
    const projectRoot = (this.projectRoot || path.join(__dirname, '..')).replace(/\\/g, '/');
    const claudeMdPath = `${projectRoot}/CLAUDE.md`;
    const sessionContextPath = `${projectRoot}/docs/session-context.md`;
    const daemonPort = this.config.daemon?.port || 3456;
    const daemonHost = this.config.daemon?.host || '127.0.0.1';

    settings.hooks = {};

    // PreToolUse: compound blocking FIRST (independent of daemon hook success)
    settings.hooks.PreToolUse = [
      {
        matcher: 'Bash',
        hooks: [{
          type: 'command',
          command: this._buildCompoundBlockCommand()
        }]
      }
    ];

    // Daemon communication hooks (PreToolUse + PostToolUse)
    settings.hooks.PostToolUse = [];
    if (hooksCfg.enabled !== false && hooksCfg.injectToWorkers !== false) {
      const daemonHooks = this._buildHookCommands(workerName);
      if (daemonHooks.PreToolUse) {
        settings.hooks.PreToolUse.push(...daemonHooks.PreToolUse);
      }
      if (daemonHooks.PostToolUse) {
        settings.hooks.PostToolUse.push(...daemonHooks.PostToolUse);
      }
    }

    // PostCompact: context reload + compact event reporting
    settings.hooks.PostCompact = [
      {
        hooks: [
          {
            type: 'command',
            command: `echo "=== CLAUDE.md ===" && cat "${claudeMdPath}" 2>/dev/null && echo "=== Session Context ===" && cat "${sessionContextPath}" 2>/dev/null || echo "No context files"`,
            statusMessage: 'Reloading project context...'
          },
          {
            type: 'command',
            command: `curl -s -X POST http://${daemonHost}:${daemonPort}/compact-event -H "Content-Type: application/json" -d "{\\"worker\\":\\"${workerName}\\"}" 2>/dev/null || true`
          }
        ]
      }
    ];

    // Profile-specific hooks (merge with injected hooks)
    if (profile && profile.hooks) {
      if (!settings.hooks) settings.hooks = {};
      for (const [hookName, hookDefs] of Object.entries(profile.hooks)) {
        if (!settings.hooks[hookName]) {
          settings.hooks[hookName] = hookDefs;
        } else {
          // Append profile hooks after injected hooks
          settings.hooks[hookName] = [...settings.hooks[hookName], ...hookDefs];
        }
      }
    }

    // Auto Mode (3.19): set permissions.defaultMode to "auto"
    if (this._isAutoModeEnabled(options)) {
      this._applyAutoMode(settings, true);
    }

    return settings;
  }

  _writeWorkerSettings(worktreePath, workerName, options = {}) {
    const settings = this._buildWorkerSettings(workerName, options);
    const claudeDir = path.join(worktreePath, '.claude');
    const settingsPath = path.join(claudeDir, 'settings.json');

    if (!fs.existsSync(claudeDir)) {
      fs.mkdirSync(claudeDir, { recursive: true });
    }

    fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + '\n');
    return settingsPath;
  }

  // --- Git Worktree helpers ---

  // (5.37) cwd param: when --cwd is specified, detect repo root from that directory
  _detectRepoRoot(projectRoot, cwd) {
    if (projectRoot) return projectRoot;
    const configRoot = this.config.worktree?.projectRoot;
    if (configRoot) return path.resolve(configRoot);
    try {
      return execSyncSafe('git rev-parse --show-toplevel', {
        encoding: 'utf8',
        cwd: cwd || path.resolve(__dirname, '..'),
        stdio: 'pipe'
      }).trim();
    } catch {
      return null;
    }
  }

  _worktreePath(repoRoot, name) {
    return path.resolve(repoRoot, '..', `c4-worktree-${name}`);
  }

  _createWorktree(repoRoot, worktreePath, branch) {
    const gitPath = worktreePath.replace(/\\/g, '/');

    // Clean up stale worktree at the same path
    if (fs.existsSync(worktreePath)) {
      try {
        execSyncSafe(`git worktree remove "${gitPath}" --force`, {
          cwd: repoRoot, encoding: 'utf8', stdio: 'pipe'
        });
      } catch {
        fs.rmSync(worktreePath, { recursive: true, force: true });
        execSyncSafe('git worktree prune', {
          cwd: repoRoot, encoding: 'utf8', stdio: 'pipe'
        });
      }
    }

    // Try new branch first, fall back to existing branch
    try {
      execSyncSafe(`git worktree add "${gitPath}" -b "${branch}"`, {
        cwd: repoRoot, encoding: 'utf8', stdio: 'pipe'
      });
    } catch {
      execSyncSafe(`git worktree add "${gitPath}" "${branch}"`, {
        cwd: repoRoot, encoding: 'utf8', stdio: 'pipe'
      });
    }

    // Apply main-protection hooks to worktree (1.17)
    const hooksPath = repoRoot.replace(/\\/g, '/') + '/.githooks';
    execSyncSafe(`git -C "${gitPath}" config core.hooksPath "${hooksPath}"`, {
      encoding: 'utf8', stdio: 'pipe'
    });
  }

  _removeWorktree(repoRoot, worktreePath) {
    const gitPath = worktreePath.replace(/\\/g, '/');
    try {
      execSyncSafe(`git worktree remove "${gitPath}" --force`, {
        cwd: repoRoot, encoding: 'utf8', stdio: 'pipe'
      });
    } catch {
      try {
        execSyncSafe('git worktree prune', {
          cwd: repoRoot, encoding: 'utf8', stdio: 'pipe'
        });
      } catch {}
    }
    // (5.41) Verify directory actually removed; fs.rmSync fallback + prune
    if (fs.existsSync(gitPath)) {
      try {
        fs.rmSync(gitPath, { recursive: true, force: true });
      } catch {}
      try {
        execSyncSafe('git worktree prune', {
          cwd: repoRoot, encoding: 'utf8', stdio: 'pipe', timeout: 5000
        });
      } catch {}
    }
  }

  /**
   * Check if a worktree directory has uncommitted changes (dirty state).
   * Returns true if there are staged, unstaged, or untracked changes.
   * Returns false if clean or if the check fails (e.g. not a git dir).
   */
  _isWorktreeDirty(worktreePath) {
    try {
      const wtPath = worktreePath.replace(/\\/g, '/');
      if (!fs.existsSync(wtPath)) return false;
      const output = execSyncSafe(`git -C "${wtPath}" status --porcelain`, {
        encoding: 'utf8', stdio: 'pipe', timeout: 10000
      });
      return output.trim().length > 0;
    } catch {
      return false;
    }
  }

  /**
   * Send notification about a dirty lost worktree that was preserved.
   * Creates a [LOST DIRTY] snapshot and sends immediate notification
   * via all configured notification channels.
   */
  _notifyLostDirty(workerName, worktreePath) {
    const msg = `[LOST DIRTY] ${workerName}: worktree preserved at ${worktreePath} (has uncommitted changes)`;
    if (this._notifications) {
      this._notifications.pushAll(msg);
      // Also send immediately so the user sees it right away
      for (const ch of Object.values(this._notifications.channels)) {
        ch.sendImmediate(msg).catch(() => {});
      }
    }
  }

  _cleanupLostWorktrees() {
    let cleaned = 0;
    let preserved = 0;
    try {
      const repoRoot = this._detectRepoRoot();
      if (!repoRoot) return { cleaned: 0, preserved: 0 };

      // 1. Clean up worktrees from lostWorkers (check dirty state first)
      if (Array.isArray(this.lostWorkers)) {
        for (const lw of this.lostWorkers) {
          if (!lw.worktree) continue;
          try {
            if (this._isWorktreeDirty(lw.worktree)) {
              // Dirty worktree: preserve and notify
              this._notifyLostDirty(lw.name || 'unknown', lw.worktree);
              preserved++;
              continue;
            }
            this._removeWorktree(repoRoot, lw.worktree);
            const wtPath = lw.worktree.replace(/\\/g, '/');
            try {
              if (fs.existsSync(wtPath)) {
                fs.rmSync(wtPath, { recursive: true, force: true });
              }
            } catch {}
            cleaned++;
            lw.worktree = null;
          } catch {}
        }
      }

      // 2. git worktree prune
      try {
        execSyncSafe('git worktree prune', {
          cwd: repoRoot, encoding: 'utf8', stdio: 'pipe'
        });
      } catch {}

      // 3. Scan for orphan c4-worktree-* directories (check dirty state first)
      try {
        const parentDir = path.resolve(repoRoot, '..');
        const entries = fs.readdirSync(parentDir);
        const knownWorktrees = new Set();
        for (const [, w] of this.workers) {
          if (w.worktree) knownWorktrees.add(w.worktree.replace(/\\/g, '/'));
        }
        // Also skip worktrees still tracked in lostWorkers (dirty ones preserved in step 1)
        if (Array.isArray(this.lostWorkers)) {
          for (const lw of this.lostWorkers) {
            if (lw.worktree) knownWorktrees.add(lw.worktree.replace(/\\/g, '/'));
          }
        }
        for (const entry of entries) {
          if (!entry.startsWith('c4-worktree-')) continue;
          const fullPath = path.resolve(parentDir, entry).replace(/\\/g, '/');
          if (knownWorktrees.has(fullPath)) continue;
          try {
            const stat = fs.statSync(fullPath);
            if (stat.isDirectory()) {
              if (this._isWorktreeDirty(fullPath)) {
                // Dirty orphan: preserve and notify
                const orphanName = entry.replace('c4-worktree-', '');
                this._notifyLostDirty(orphanName, fullPath);
                preserved++;
                continue;
              }
              this._removeWorktree(repoRoot, fullPath);
              try {
                if (fs.existsSync(fullPath)) {
                  fs.rmSync(fullPath, { recursive: true, force: true });
                }
              } catch {}
              cleaned++;
            }
          } catch {}
        }
      } catch {}
    } catch {}
    return { cleaned, preserved };
  }

  /**
   * (5.41) Compare `git worktree list` output against active workers to find
   * orphan c4-worktree-* entries that git still tracks but no worker owns.
   * Removes clean orphans; preserves dirty ones with notification.
   */
  _cleanupOrphanWorktreesByList() {
    let cleaned = 0;
    let preserved = 0;
    try {
      const repoRoot = this._detectRepoRoot();
      if (!repoRoot) return { cleaned: 0, preserved: 0 };

      const listOutput = execSyncSafe('git worktree list --porcelain', {
        cwd: repoRoot, encoding: 'utf8', stdio: 'pipe', timeout: 5000
      });

      // Parse worktree paths from porcelain output
      const gitWorktrees = [];
      for (const line of listOutput.split('\n')) {
        if (line.startsWith('worktree ')) {
          gitWorktrees.push(line.slice('worktree '.length).trim().replace(/\\/g, '/'));
        }
      }

      // Build set of known worktree paths from active workers
      const knownWorktrees = new Set();
      for (const [, w] of this.workers) {
        if (w.worktree) knownWorktrees.add(w.worktree.replace(/\\/g, '/'));
      }
      // Also include lostWorkers (dirty ones being preserved)
      if (Array.isArray(this.lostWorkers)) {
        for (const lw of this.lostWorkers) {
          if (lw.worktree) knownWorktrees.add(lw.worktree.replace(/\\/g, '/'));
        }
      }

      // Find orphan c4-worktree-* entries
      for (const wtPath of gitWorktrees) {
        const basename = path.basename(wtPath);
        if (!basename.startsWith('c4-worktree-')) continue;
        if (knownWorktrees.has(wtPath)) continue;

        // Orphan detected — check dirty state
        if (fs.existsSync(wtPath) && this._isWorktreeDirty(wtPath)) {
          const orphanName = basename.replace('c4-worktree-', '');
          this._notifyLostDirty(orphanName, wtPath);
          preserved++;
          continue;
        }

        // Clean orphan — remove
        this._removeWorktree(repoRoot, wtPath);
        cleaned++;
      }
    } catch {}
    return { cleaned, preserved };
  }

  _detectPermissionPrompt(screenText) {
    const p = this._getPatterns();
    return screenText.includes(p.permissionPrompt) ||
           screenText.includes(p.fileCreatePrompt) ||
           screenText.includes(p.fileEditPrompt);
  }

  _detectTrustPrompt(screenText) {
    const p = this._getPatterns();
    return screenText.includes(p.trustPrompt);
  }

  _getPromptType(screenText) {
    const p = this._getPatterns();
    if (screenText.includes(p.fileCreatePrompt)) return 'create';
    if (screenText.includes(p.fileEditPrompt)) return 'edit';
    if (screenText.includes(p.bashHeader)) return 'bash';
    if (screenText.includes(p.editHeader)) return 'edit';
    if (screenText.includes(p.createHeader)) return 'create';
    return 'unknown';
  }

  _extractBashCommand(screenText) {
    // Extract the actual command from the Bash permission prompt
    // The command is indented with 3 spaces, between the header and the prompt
    const lines = screenText.split('\n');
    const p = this._getPatterns();

    let inBashBlock = false;
    let command = '';

    for (const line of lines) {
      if (line.includes(p.bashHeader)) {
        inBashBlock = true;
        continue;
      }
      if (inBashBlock) {
        const trimmed = line.trim();
        // Stop at prompt lines
        if (trimmed.includes('Do you want') ||
            trimmed.includes('Esc to cancel') ||
            trimmed.startsWith('❯') ||
            trimmed.match(/^\d+\.\s/)) {
          break;
        }
        // Command lines are indented with spaces
        if (line.match(/^\s{2,}/) && trimmed.length > 0 &&
            !trimmed.includes('Run shell command') &&
            !trimmed.includes('This command requires')) {
          command += (command ? ' ' : '') + trimmed;
        }
      }
    }

    return command;
  }

  _extractFileName(screenText) {
    const p = this._getPatterns();

    // "Do you want to create test-pattern.txt?"
    let match = screenText.match(/Do you want to create ([^\s?]+)\??/);
    if (match) return match[1];

    // "Do you want to make this edit to foo.js?"
    match = screenText.match(/Do you want to make this edit to ([^\s?]+)\??/);
    if (match) return match[1];

    return '';
  }

  _countOptions(screenText) {
    // Count how many numbered options exist (1. Yes, 2. ..., 3. No)
    const matches = screenText.match(/^\s*\d+\.\s/gm);
    return matches ? matches.length : 2;
  }

  _getAutonomyLevel() {
    return this.config.autoApprove?.autonomyLevel ?? 0;
  }

  _classifyPermission(screenText, worker) {
    const rules = this.config.autoApprove?.rules || [];
    const autonomyLevel = this._getAutonomyLevel();
    // Global auto mode (c4 auto): approve everything not explicitly denied
    const defaultAction = (this._globalAutoMode || worker?._autoWorker)
      ? 'approve'
      : (this.config.autoApprove?.defaultAction || 'ask');
    const promptType = this._getPromptType(screenText);

    let action = defaultAction;

    if (promptType === 'bash') {
      const command = this._extractBashCommand(screenText);
      if (!command) return defaultAction;

      // Extract first word as the command name
      const cmdName = command.split(/\s+/)[0].replace(/['"]/g, '');

      for (const rule of rules) {
        // Exact match: "Bash(pwd)"
        const exactMatch = rule.pattern.match(/^Bash\((\w+)\)$/);
        if (exactMatch && exactMatch[1] === cmdName) {
          action = rule.action;
          break;
        }

        // Prefix match: "Bash(grep:*)"
        const prefixMatch = rule.pattern.match(/^Bash\((\w+):\*\)$/);
        if (prefixMatch && prefixMatch[1] === cmdName) {
          action = rule.action;
          break;
        }
      }

    } else if (promptType === 'create' || promptType === 'edit') {
      for (const rule of rules) {
        if (rule.pattern === 'Write' && promptType === 'create') { action = rule.action; break; }
        if (rule.pattern === 'Edit' && promptType === 'edit') { action = rule.action; break; }
      }
    }

    // Level 4 (4.5): full autonomy — override deny to approve with logging
    if (autonomyLevel >= 4 && action === 'deny') {
      const command = this._extractBashCommand(screenText) || '';
      // Critical commands are NEVER auto-approved, even at L4 (5.13)
      const isCritical = CRITICAL_DENY_PATTERNS.some(p => p.test(command));
      if (isCritical) {
        if (worker) {
          worker._interventionState = 'critical_deny';
          worker._criticalCommand = command;
          worker.snapshots = worker.snapshots || [];
          worker.snapshots.push({
            time: Date.now(),
            screen: `[CRITICAL DENY] awaiting approval: ${command.substring(0, 100)}`,
            autoAction: true
          });
        }
        if (this._notifications) {
          this._notifications.pushAll(`[CRITICAL DENY] worker needs approval for: ${command.substring(0, 80)}`);
          this._notifications._flushSlack();
        }
        return 'deny';
      }
      const workerName = worker?._taskText ? 'worker' : 'unknown';
      if (worker) {
        worker.snapshots = worker.snapshots || [];
        worker.snapshots.push({
          time: Date.now(),
          screen: `[AUTONOMY L4] deny overridden to approve: ${command.substring(0, 100)}`,
          autoAction: true,
          autonomyOverride: true
        });
      }
      return 'approve';
    }

    return action;
  }

  _checkScope(scopeGuard, screenText) {
    const promptType = this._getPromptType(screenText);

    if (promptType === 'bash') {
      const command = this._extractBashCommand(screenText);
      if (command) return scopeGuard.checkBash(command);
    } else if (promptType === 'create' || promptType === 'edit') {
      const fileName = this._extractFileName(screenText);
      if (fileName) return scopeGuard.checkFile(fileName);
    }

    return null; // Can't determine — let autoApprove decide
  }

  _getApproveKeystrokes(screenText, action) {
    const numOptions = this._countOptions(screenText);
    const alwaysForSession = this.config.autoApprove?.alwaysApproveForSession || false;

    if (action === 'approve') {
      if (alwaysForSession && numOptions >= 2) {
        // Select option 2 ("Yes, and don't ask again" / "Yes, allow all edits")
        return '\x1b[B\r'; // Down, Enter
      }
      return '\r'; // Just Enter (option 1 is already selected)

    } else if (action === 'deny') {
      // Select the last option (No)
      let keys = '';
      for (let i = 1; i < numOptions; i++) {
        keys += '\x1b[B'; // Down
      }
      keys += '\r'; // Enter
      return keys;
    }

    return null; // 'ask' — don't send anything
  }

  // --- Intervention Detection (1.9) ---

  _getInterventionConfig() {
    return this.config.intervention || {};
  }

  _getQuestionPatterns() {
    const cfg = this._getInterventionConfig();
    const custom = cfg.questionPatterns || [];
    // Default patterns: Korean + English question indicators
    const defaults = [
      // Korean question patterns
      '할까요\\?', '해도 될까요\\?', '어떻게', '선택지',
      '어느 걸로', '방식.*vs.*방식', '확장.*요청',
      '명확하지 않', '어떤 방향', '결정해.*주',
      // English question patterns
      'should I', 'which approach', 'A or B',
      'not sure whether', 'could you clarify',
      'what do you think', 'how should',
    ];
    return [...defaults, ...custom];
  }

  _detectQuestion(screenText) {
    const patterns = this._getQuestionPatterns();
    // Avoid false positives: only match in assistant output areas,
    // skip lines that look like code (indented 4+ spaces or contain common code tokens)
    const lines = screenText.split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      // Skip empty lines, code-like lines, and system/C4 markers
      if (!trimmed) continue;
      if (line.match(/^\s{4,}/)) continue;  // indented code
      if (trimmed.startsWith('```') || trimmed.startsWith('//') || trimmed.startsWith('#!')) continue;
      if (trimmed.startsWith('[C4') || trimmed.startsWith('[HEALTH]')) continue;

      for (const pattern of patterns) {
        try {
          if (new RegExp(pattern, 'i').test(trimmed)) {
            return { detected: true, line: trimmed, pattern };
          }
        } catch {
          // Invalid regex in custom pattern — skip
          if (trimmed.includes(pattern)) {
            return { detected: true, line: trimmed, pattern };
          }
        }
      }
    }
    return { detected: false };
  }

  _getErrorPatterns() {
    return ['error', 'failed', 'FAIL', 'Error:', 'Exception', '에러', '실패'];
  }

  _detectErrors(screenText) {
    const patterns = this._getErrorPatterns();
    const found = [];
    const lines = screenText.split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      if (trimmed.startsWith('[C4') || trimmed.startsWith('[HEALTH]')) continue;
      for (const pattern of patterns) {
        if (trimmed.includes(pattern)) {
          found.push(trimmed);
          break;
        }
      }
    }
    return found;
  }

  _detectRoutineSkip(screenText, worker) {
    // Detect if worker is committing without following the routine:
    // implement → test → docs → commit
    const hasCommit = /git commit/.test(screenText);
    if (!hasCommit) return null;

    const routine = worker._routineState || { tested: false, docsUpdated: false };
    const skips = [];

    if (!routine.tested) {
      skips.push('npm test');
    }
    if (!routine.docsUpdated) {
      skips.push('docs (TODO/CHANGELOG/patches)');
    }

    if (skips.length > 0) {
      return {
        type: skips.length === 2 ? 'no_test_no_docs' : (!routine.tested ? 'no_test' : 'no_docs'),
        message: `Committing without: ${skips.join(', ')}`,
        feedback: `커밋 전에 ${skips.join(', ')} 먼저 해. 루틴: 구현 -> 테스트 -> 문서 -> 커밋.`
      };
    }

    return null;
  }

  _updateRoutineState(screenText, worker) {
    if (!worker._routineState) {
      worker._routineState = { tested: false, docsUpdated: false };
    }

    // Detect test execution
    if (/npm test|pytest|jest|mocha|test.*pass|tests.*pass|테스트.*통과/.test(screenText)) {
      worker._routineState.tested = true;
    }

    // Detect docs update
    if (/TODO\.md|CHANGELOG\.md|README\.md|patches\//.test(screenText)) {
      worker._routineState.docsUpdated = true;
    }

    // Reset after commit (new cycle)
    if (/git commit/.test(screenText)) {
      worker._routineState = { tested: false, docsUpdated: false };
    }
  }

  // --- Effort Dynamic Adjustment (3.3) ---

  _determineEffort(taskText) {
    const effortCfg = this.config.effort || {};
    if (!effortCfg.dynamic) return this.config.workerDefaults?.effortLevel || 'max';

    const thresholds = effortCfg.thresholds || { high: 100, max: 500 };
    const defaultLevel = effortCfg.default || this.config.workerDefaults?.effortLevel || 'high';
    const len = (taskText || '').length;

    // Sort threshold entries by value ascending
    const entries = Object.entries(thresholds).sort((a, b) => a[1] - b[1]);

    // Under the lowest threshold → use that level
    if (entries.length > 0 && len < entries[0][1]) {
      return entries[0][0]; // e.g., 'high' when < 100
    }

    // At or above the highest threshold → use that level
    if (entries.length > 0 && len >= entries[entries.length - 1][1]) {
      return entries[entries.length - 1][0]; // e.g., 'max' when >= 500
    }

    return defaultLevel;
  }

  _getRulesSummary() {
    const rules = this.config.rules;
    if (!rules || !rules.appendToTask) return null;

    // Use custom summary if provided, otherwise use default
    if (rules.summary) return rules.summary;

    return [
      '[C4 규칙 — 반드시 준수]',
      '- 복합 명령(&&, |, ;) 사용 금지 → 단일 명령으로 분리',
      '- IMPORTANT: git -C <path> 형태만 허용. cd 후 git 절대 금지 (cd X && git Y, cd X; git Y 모두 불가)',
      '- sleep 대신 c4 wait <name> 사용',
      '- /model 등 슬래시 명령: MSYS_NO_PATHCONV=1 c4 send 사용',
      '- main 직접 커밋 금지 → 브랜치에서 작업',
      '- 작업 루틴: 구현 → 테스트 → 문서 업데이트 → 커밋',
    ].join('\n');
  }

  // --- Worker Pooling (3.4) ---

  _findPoolWorker() {
    const poolCfg = this.config.pool || {};
    if (!poolCfg.enabled) return null;

    const maxIdleMs = poolCfg.maxIdleMs || 300000;
    const now = Date.now();

    for (const [name, w] of this.workers) {
      if (!w.alive) continue;
      const idleMs = now - w.lastDataTime;
      // Must be idle (past threshold) but not too old (within maxIdleMs)
      if (idleMs >= this.idleThresholdMs && idleMs <= maxIdleMs) {
        // Must not have an active task or pending task
        if (!w._pendingTask && !w._pendingTaskSent) {
          return name;
        }
      }
    }
    return null;
  }

  _reuseWorker(poolName, newName, task, options = {}) {
    const w = this.workers.get(poolName);
    if (!w || !w.alive) return { error: `Pool worker '${poolName}' not available` };

    // Rename the worker
    this.workers.delete(poolName);
    this.workers.set(newName, w);

    // Reset worker state for new task
    w._interventionState = null;
    w._lastQuestion = null;
    w._errorHistory = [];
    w._routineState = { tested: false, docsUpdated: false };
    w._taskText = null;
    w._taskStartedAt = null;
    w.snapshotIndex = w.snapshots.length; // mark all old snapshots as read

    // Now send the task directly
    return this.sendTask(newName, task, options);
  }

  // --- Context Transfer (3.1) ---

  _getContextSnapshots(workerName, count = 3) {
    const w = this.workers.get(workerName);
    if (!w) return null;

    // Get the most recent non-autoAction snapshots
    const relevant = w.snapshots
      .filter(s => !s.autoAction && s.screen && s.screen.trim())
      .slice(-count);

    if (relevant.length === 0) return null;

    const lines = [`[컨텍스트 전달: ${workerName}의 최근 작업 결과]`];
    for (const snap of relevant) {
      const time = new Date(snap.time).toLocaleTimeString();
      lines.push(`--- ${time} ---`);
      // Apply summary layer (3.14) for long context snapshots
      const processed = this._summaryLayer.process(snap);
      lines.push((processed.screen || snap.screen).trim());
    }
    lines.push(`[/${workerName} 컨텍스트 끝]`);
    return lines.join('\n');
  }

  // Auto-generate worker name from task text (5.40)
  _generateTaskName(task) {
    const firstLine = (task || '').split('\n')[0].trim();

    // Extract words that are pure ASCII alphanumeric (English words)
    const words = firstLine.split(/\s+/)
      .map(w => w.replace(/[^a-zA-Z0-9]/g, ''))
      .filter(w => w.length > 0 && /[a-zA-Z]/.test(w))
      .map(w => w.toLowerCase());

    let base;
    if (words.length > 0) {
      // Build name word by word, respecting 30 char limit
      base = 'w';
      for (const word of words) {
        const candidate = base + '-' + word;
        if (candidate.length > 30) break;
        base = candidate;
      }
    } else {
      base = 'w-task';
    }

    // Dedup: check existing workers and task queue
    const nameExists = (n) => this.workers.has(n) || this._taskQueue.some(q => q.name === n);

    if (!nameExists(base)) return base;

    for (let i = 2; i <= 99; i++) {
      const suffix = `-${i}`;
      let candidate;
      if (base.length + suffix.length > 30) {
        candidate = base.slice(0, 30 - suffix.length) + suffix;
      } else {
        candidate = base + suffix;
      }
      if (!nameExists(candidate)) return candidate;
    }

    return `w-${Date.now() % 100000}`;
  }

  // Send a task to worker with branch isolation via git worktree
  sendTask(name, task, options = {}) {
    // Auto-generate name if not provided (5.40)
    if (!name) {
      name = this._generateTaskName(task);
    }

    // Apply template (3.18)
    const templateName = options.template || options.profile || '';
    if (templateName) {
      options = this._applyTemplate(templateName, options);
    }

    // Duplicate check (2.3): reject if same name already queued
    if (this._taskQueue.some(q => q.name === name)) {
      return { error: `Task '${name}' is already queued` };
    }

    const w = this.workers.get(name);

    // Worker doesn't exist or has exited — check queue conditions
    if (!w || !w.alive) {
      // Dependency check (2.2)
      const afterWorker = options.after || null;
      if (afterWorker) {
        const dep = this.workers.get(afterWorker);
        if (dep && dep.alive) {
          return this._enqueueTask(name, task, options);
        }
      }

      // maxWorkers check (2.8)
      const maxW = this.config.maxWorkers || 0;
      if (maxW > 0 && this._activeWorkerCount() >= maxW) {
        return this._enqueueTask(name, task, options);
      }

      // Pool reuse (3.4): try to recycle an idle worker instead of creating new
      if (options.reuse !== false) {
        const poolName = this._findPoolWorker();
        if (poolName) {
          return this._reuseWorker(poolName, name, task, options);
        }
      }

      // Can proceed — auto-create worker and queue task for after setup
      return this._createAndSendTask({
        name, task,
        command: options.command || 'claude',
        args: options.args || [],
        target: options.target || 'local',
        branch: options.branch || `c4/${name}`,
        useBranch: options.useBranch,
        useWorktree: options.useWorktree,
        cwd: options.cwd,
        projectRoot: options.projectRoot,
        scope: options.scope,
        scopePreset: options.scopePreset,
        contextFrom: options.contextFrom,
        autoMode: options.autoMode,
        _autoWorker: options._autoWorker
      });
    }

    const branch = options.branch || `c4/${name}`;
    // SSH targets run on remote machines — local worktree creation is unnecessary
    const targetResolved = this._resolveTarget(options.target || 'local');
    const isSshTarget = targetResolved && targetResolved.type === 'ssh';
    // (5.37) --no-branch disables worktree as well
    const useWorktree = !isSshTarget && options.useWorktree !== false && options.useBranch !== false && this.config.worktree?.enabled !== false;
    const commands = [];

    // Scope guard setup
    const scopeGuard = resolveScope(options.scope, this.config, options.scopePreset);
    if (scopeGuard) {
      w.scopeGuard = scopeGuard;
    }

    if (options.useBranch !== false) {
      if (useWorktree) {
        const repoRoot = this._detectRepoRoot(options.projectRoot, options.cwd);
        if (!repoRoot) {
          return { error: 'Cannot create worktree: projectRoot not configured and auto-detection failed' };
        }

        const worktreePath = this._worktreePath(repoRoot, name);
        try {
          this._createWorktree(repoRoot, worktreePath, branch);
        } catch (e) {
          return { error: `Failed to create worktree: ${e.message}` };
        }

        w.worktree = worktreePath;
        w.worktreeRepoRoot = repoRoot;
        w.branch = branch;

        // Auto-generate .claude/settings.json for this worktree (3.16)
        try {
          this._writeWorkerSettings(worktreePath, name, options);
        } catch (e) {
          // Non-fatal: settings generation failure shouldn't block task
          w.snapshots = w.snapshots || [];
          w.snapshots.push({
            time: Date.now(),
            screen: `[C4 WARN] Failed to write worker settings: ${e.message}`,
            autoAction: true
          });
        }

        const cdPath = worktreePath.replace(/\\/g, '/');
        commands.push(`cd ${cdPath} 로 이동해서 작업해줘. 현재 브랜치는 ${branch}야. 작업 단위마다 커밋해줘.`);
      } else {
        // Fallback: branch-only (no worktree)
        commands.push(`git checkout -b ${branch} 또는 이미 있으면 git checkout ${branch} 해줘. 그리고 작업 단위마다 커밋해줘.`);
      }
    }

    // Prepend rules summary to task if enabled
    const rulesSummary = this._getRulesSummary();
    if (rulesSummary) {
      commands.push(rulesSummary);
    }

    // Prepend scope summary if scope is defined
    if (w.scopeGuard && w.scopeGuard.hasRestrictions()) {
      commands.push(w.scopeGuard.toSummary());
    }

    // Template prompt prefix (3.18)
    if (options._templatePromptPrefix) {
      commands.push(options._templatePromptPrefix);
    }

    // Context transfer (3.1): inject snapshots from another worker
    if (options.contextFrom) {
      const contextText = this._getContextSnapshots(options.contextFrom, 3);
      if (contextText) {
        commands.push(contextText);
      }
    }

    commands.push(task);

    const fullTask = this._maybeWriteTaskFile(w, commands.join('\n\n'));
    this._writeTaskAndEnter(w.proc, fullTask);
    w.branch = branch;

    // Save start commit for rollback (3.6)
    if (w.worktree || w.branch) {
      try {
        const gitDir = (w.worktree || this._detectRepoRoot() || '').replace(/\\/g, '/');
        if (gitDir) {
          w._startCommit = execSyncSafe(`git -C "${gitDir}" rev-parse HEAD`, {
            encoding: 'utf8', timeout: 5000, stdio: ['pipe', 'pipe', 'pipe']
          }).trim();
        }
      } catch {
        w._startCommit = null;
      }
    }

    // History tracking (3.7)
    w._taskText = task;
    w._taskStartedAt = new Date().toISOString();

    return {
      success: true,
      branch,
      worktree: w.worktree || null,
      scope: w.scopeGuard ? { active: true, description: w.scopeGuard.description } : null,
      contextFrom: options.contextFrom || null,
      startCommit: w._startCommit || null,
      task: fullTask
    };
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
      const commandMap = t.commandMap || {};
      const resolvedCmd = commandMap[command] || command;
      // Resume support (4.1): append --resume <sessionId> to claude command
      const finalArgs = [...args];
      if (options.resume && command === 'claude') {
        finalArgs.push('--resume', options.resume);
      }
      shell = platformShell();
      shellArgs = platformShellArgs(resolvedCmd, finalArgs);
    } else if (t.type === 'ssh') {
      const remoteCwd = cwd || t.defaultCwd || '';
      const commandMap = t.commandMap || {};
      const resolvedCmd = commandMap[command] || command;
      const remoteArgs = args.length > 0 ? ' ' + args.join(' ') : '';

      shell = platformSshPath();
      shellArgs = this._buildSshArgs(t);

      pendingCommands = [];
      if (remoteCwd) pendingCommands.push(`cd ${remoteCwd}`);
      pendingCommands.push(`${resolvedCmd}${remoteArgs}`);
    } else {
      return { error: `Unknown target type: '${t.type}'` };
    }

    const cols = this.config.pty?.cols || 160;
    const rows = this.config.pty?.rows || 48;

    const spawnCwd = (t.type === 'local' || targetName === 'local')
      ? (cwd || platformHomedir())
      : undefined;

    const proc = pty.spawn(shell, shellArgs, {
      name: 'xterm-256color',
      cols,
      rows,
      useConpty: false, // Avoid conpty issues on Windows (4.25)
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
      setupDone: false,       // initial setup (effort level) completed
      setupPhase: null,       // current setup phase: null, 'waitMenu', 'done'
      setupRetries: 0,        // retry count for effort setup
      setupPhaseStart: null,  // timestamp when current phase started
      _setupPollTimer: null,  // periodic menu detection timer during waitMenu
      // Intervention state (1.9)
      _interventionState: null,  // null | 'question' | 'escalation'
      _lastQuestion: null,       // last detected question text
      _errorHistory: [],         // recent error lines for repeat detection
      _permissionNotified: false, // (5.29) prevent duplicate permission notifications
      _lastCiResult: null,        // (5.20) last CI test result
      _routineState: { tested: false, docsUpdated: false },
      // Pending task (2.2/2.8 queue)
      _pendingTask: null,        // { task, options } — sent after setup completes
      _pendingTaskSent: false,
      _pendingTaskTimer: null,   // active polling interval for pending task
      _pendingTaskTimeoutTimer: null, // timeout fallback timer
      // SSH state (2.4)
      _isSsh: t.type === 'ssh',
      // History tracking (3.7)
      _taskText: null,           // original task text
      _taskStartedAt: null,      // ISO timestamp when task was sent
      // Rollback (3.6)
      _startCommit: null,        // HEAD commit hash before task started
      // State machine (3.11)
      _smState: this._stateMachine.createState(),
      // Adaptive polling (3.12)
      _pollState: this._adaptivePolling.createState(),
      // Session resume (4.1)
      _sessionId: options.resume || null,
      _resumed: !!options.resume,
    };

    // Raw log
    if (worker.rawLogPath) {
      worker.rawLogStream = fs.createWriteStream(worker.rawLogPath, { flags: 'w' });
    }

    proc.onData((data) => {
      worker.lastDataTime = Date.now();
      if (worker.rawLogStream) worker.rawLogStream.write(data);
      // Record activity for adaptive polling (3.12)
      this._adaptivePolling.recordActivity(worker._pollState);

      screen.write(data);

      // Notify watch stream listeners (5.42)
      if (worker._watchers && worker._watchers.size > 0) {
        for (const cb of worker._watchers) {
          try { cb(data); } catch (e) { /* watcher error, ignore */ }
        }
      }

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

      // Reset idle timer with adaptive interval (3.12)
      if (worker.idleTimer) clearTimeout(worker.idleTimer);
      let idleMs = this._adaptivePolling.getInterval(worker._pollState);
      // Cap interval during effort setup for faster menu detection
      if (worker.setupPhase === 'waitMenu') idleMs = Math.min(idleMs, 500);
      worker.idleTimer = setTimeout(() => {
        const text = this._getScreenText(screen);

        // Auto-trust folder (via terminal interface 3.13)
        if (this.config.workerDefaults?.trustFolder && this._termInterface.isTrustPrompt(text)) {
          proc.write(this._termInterface.getTrustKeys());
          return;
        }

        // Auto effort level setup (2-phase with retry: send /model, then detect menu and press keys)
        const effortLevel = worker._dynamicEffort || this.config.workerDefaults?.effortLevel;
        if (effortLevel && !worker.setupDone) {
          const setupCfg = this.config.workerDefaults?.effortSetup || {};
          const maxRetries = setupCfg.retries ?? 3;
          const phaseTimeoutMs = setupCfg.phaseTimeoutMs ?? 8000;
          const inputDelayMs = setupCfg.inputDelayMs ?? 500;
          const confirmDelayMs = setupCfg.confirmDelayMs ?? 500;

          const hasPrompt = this._termInterface.isReady(text);
          const hasModelMenu = this._termInterface.isModelMenu(text);

          // Timeout: if stuck in waitMenu phase too long, retry
          if (worker.setupPhase === 'waitMenu' && worker.setupPhaseStart) {
            const elapsed = Date.now() - worker.setupPhaseStart;
            if (elapsed > phaseTimeoutMs && !hasModelMenu) {
              if (worker._setupPollTimer) { clearInterval(worker._setupPollTimer); worker._setupPollTimer = null; }
              worker.setupRetries++;
              if (worker.setupRetries > maxRetries) {
                worker.setupDone = true;
                worker.setupPhase = null;
                worker.snapshots.push({
                  time: Date.now(),
                  screen: `[C4 SETUP] effort level setup FAILED after ${maxRetries} retries`,
                  autoAction: true
                });
                return;
              }
              worker.setupPhase = null;
              worker.setupPhaseStart = null;
              worker.snapshots.push({
                time: Date.now(),
                screen: `[C4 SETUP] effort setup retry ${worker.setupRetries}/${maxRetries} (phase timeout)`,
                autoAction: true
              });
              proc.write(this._termInterface.getEscapeKey()); // Escape to clear any partial state
              return;
            }
          }

          if (!worker.setupPhase && hasPrompt) {
            // Phase 1: Claude Code ready, send /model
            worker.setupPhase = 'waitMenu';
            worker.setupPhaseStart = Date.now();
            proc.write(this._termInterface.getModelMenuKeys());
            // Start periodic menu detection (independent of idle timer)
            this._startSetupPolling(worker, screen, proc);
            return;
          }

          if (worker.setupPhase === 'waitMenu' && hasModelMenu) {
            // Phase 2: Menu rendered — use extracted method
            if (worker._setupPollTimer) { clearInterval(worker._setupPollTimer); worker._setupPollTimer = null; }
            this._executeSetupPhase2(worker, proc);
            return;
          }
        }

        // Send pending task — only after effort setup is fully complete (5.51)
        const setupNeeded = (worker._dynamicEffort || this.config.workerDefaults?.effortLevel) && !worker.setupDone;
        if (worker._pendingTask && !worker._pendingTaskSent && !setupNeeded) {
          worker._pendingTaskSent = true;
          const pt = worker._pendingTask;
          const fullTask = this._buildTaskText(worker, pt.task, pt.options);
          setTimeout(async () => {
            await this._writeTaskAndEnter(proc, fullTask);
            worker._taskText = pt.task;
            worker._taskStartedAt = new Date().toISOString();
            worker._pendingTask = null;
          }, 500);
          return;
        }

        // Auto-resume: check task queue for this worker when idle (4.17)
        if (!worker._pendingTask && !worker._taskText) {
          const queueIdx = this._taskQueue.findIndex(e => e.name === name);
          if (queueIdx !== -1) {
            const entry = this._taskQueue.splice(queueIdx, 1)[0];
            const fullTask = this._buildTaskText(worker, entry.task, entry);
            setTimeout(() => {
              this._writeTaskAndEnter(proc, fullTask);
              worker._taskText = entry.task;
              worker._taskStartedAt = new Date().toISOString();
            }, 500);
            this._saveState();
            return;
          }
        }

        // Auto-approve logic + SSE permission event (3.5)
        if (this._termInterface.isPermissionPrompt(text)) {
          const promptType = this._termInterface.getPromptType(text);
          const detail = promptType === 'bash'
            ? this._termInterface.extractBashCommand(text)
            : this._termInterface.extractFileName(text);
          this._emitSSE('permission', { worker: name, promptType, detail });
          // Immediate intervention notification for permission prompts (5.29)
          if (this._notifications && !worker._permissionNotified) {
            worker._permissionNotified = true;
            this._notifications.notifyStall(name, `awaiting approval: ${promptType} — ${(detail || '').slice(0, 100)}`);
          }
        }
        // Block git reset --hard on main (unconditional, regardless of autoApprove)
        if (this._termInterface.isPermissionPrompt(text)) {
          const _pt = this._termInterface.getPromptType(text);
          if (_pt === 'bash') {
            const _cmd = this._termInterface.extractBashCommand(text);
            if (_cmd && /\bgit\b.*\breset\b.*--hard/.test(_cmd)) {
              const gitDir = (worker.worktree || this._detectRepoRoot() || '').replace(/\\/g, '/');
              let branch = null;
              if (gitDir) {
                try {
                  branch = execSyncSafe(`git -C "${gitDir}" rev-parse --abbrev-ref HEAD`, {
                    encoding: 'utf8', stdio: 'pipe'
                  }).trim();
                } catch {}
              }
              if (branch === 'main') {
                const denyKeys = this._termInterface.getDenyKeys(text);
                worker.snapshots.push({
                  time: Date.now(),
                  screen: `[C4 BLOCK] git reset --hard denied on main branch`,
                  autoAction: true
                });
                proc.write(denyKeys);
                return;
              }
            }
          }
        }

        if (this.config.autoApprove?.enabled && this._termInterface.isPermissionPrompt(text)) {
          // Scope guard check — override autoApprove if out of scope
          if (worker.scopeGuard && worker.scopeGuard.hasRestrictions()) {
            const scopeResult = this._checkScope(worker.scopeGuard, text);
            if (scopeResult && !scopeResult.allowed) {
              // Out of scope → force deny
              const denyKeys = this._termInterface.getDenyKeys(text);

              worker.snapshots.push({
                time: Date.now(),
                screen: `[SCOPE DENY] ${scopeResult.reason}`,
                autoAction: true,
                scopeViolation: true
              });

              proc.write(denyKeys);
              return;
            }
          }

          const action = this._classifyPermission(text, worker);
          const keys = this._getApproveKeystrokes(text, action);

          if (keys) {
            // Log the decision
            const approvePromptType = this._termInterface.getPromptType(text);
            const approveDetail = approvePromptType === 'bash'
              ? this._termInterface.extractBashCommand(text)
              : this._termInterface.extractFileName(text);
            worker.snapshots.push({
              time: Date.now(),
              screen: `[C4 AUTO-${action.toUpperCase()}] ${approvePromptType}: ${approveDetail}`,
              autoAction: true
            });

            proc.write(keys);
            return;
          }
          // 'ask' falls through to snapshot — manager will see the prompt
        }

        // Scope drift keyword detection
        if (worker.scopeGuard) {
          const driftKeywords = worker.scopeGuard.detectDrift(text);
          if (driftKeywords) {
            worker.snapshots.push({
              time: Date.now(),
              screen: `[SCOPE DRIFT] 방향 전환 감지: ${driftKeywords.join(', ')}\n---\n${text}`,
              autoAction: true,
              scopeDrift: true
            });
            this._saveState();
            return; // Still capture the snapshot but flag it
          }
        }

        // --- State machine update (3.11) ---
        if (worker._smState) {
          const smResult = this._stateMachine.update(worker._smState, text);
          if (smResult) {
            if (smResult.transition) {
              worker.snapshots.push({
                time: Date.now(),
                screen: `[STATE] ${smResult.transition.from} → ${smResult.transition.to}`,
                autoAction: true,
                stateTransition: true
              });
            }
            if (smResult.escalation) {
              worker._interventionState = 'escalation';
              worker.snapshots.push({
                time: Date.now(),
                screen: `[ESCALATION] ${smResult.escalation.reason}`,
                autoAction: true,
                intervention: 'escalation'
              });
              this._emitSSE('error', {
                worker: name,
                line: smResult.escalation.reason,
                count: smResult.escalation.failCount,
                escalation: true
              });
            }
          }
        }

        // --- Intervention detection (1.9) ---
        const interventionCfg = this._getInterventionConfig();

        // Question detection
        if (interventionCfg.enabled !== false) {
          const questionResult = this._detectQuestion(text);
          if (questionResult.detected) {
            worker._interventionState = 'question';
            worker._lastQuestion = questionResult.line;
            worker.snapshots.push({
              time: Date.now(),
              screen: `[QUESTION] ${questionResult.line}`,
              autoAction: true,
              intervention: 'question'
            });
            this._emitSSE('question', { worker: name, line: questionResult.line, pattern: questionResult.pattern });
            // Immediate intervention notification (5.29)
            if (this._notifications) {
              this._notifications.notifyStall(name, `intervention: question — ${questionResult.line.slice(0, 100)}`);
            }
          }
        }

        // Escalation detection (error keywords + repeat count)
        if (interventionCfg.enabled !== false) {
          const errors = this._detectErrors(text);
          if (errors.length > 0) {
            const maxRetries = interventionCfg.escalation?.maxRetries ?? 3;

            for (const errLine of errors) {
              const existing = worker._errorHistory.find(e => e.line === errLine);
              if (existing) {
                existing.count++;
                if (existing.count >= maxRetries) {
                  worker._interventionState = 'escalation';
                  worker.snapshots.push({
                    time: Date.now(),
                    screen: `[ESCALATION] repeated error (${existing.count}x): ${errLine}`,
                    autoAction: true,
                    intervention: 'escalation'
                  });
                  this._emitSSE('error', { worker: name, line: errLine, count: existing.count, escalation: true });
                  // Immediate intervention notification (5.29)
                  if (this._notifications) {
                    this._notifications.notifyStall(name, `intervention: escalation — ${errLine.slice(0, 100)}`);
                  }
                  existing.count = 0;
                }
              } else {
                worker._errorHistory.push({ line: errLine, count: 1, firstSeen: Date.now() });
              }
            }

            if (worker._errorHistory.length > 50) {
              worker._errorHistory = worker._errorHistory.slice(-50);
            }
          }
        }

        // Routine monitoring — auto-feedback on skip
        if (interventionCfg.routineCheck !== false) {
          this._updateRoutineState(text, worker);
          const routineSkip = this._detectRoutineSkip(text, worker);
          if (routineSkip) {
            worker.snapshots.push({
              time: Date.now(),
              screen: `[ROUTINE SKIP] ${routineSkip.message}`,
              autoAction: true,
              intervention: 'routine'
            });
            // Send feedback to worker — tell it to follow the routine
            if (routineSkip.feedback && worker.alive) {
              setTimeout(async () => {
                await this._writeTaskAndEnter(proc, routineSkip.feedback);
              }, 1000);
            }
          }
        }

        // Clear intervention state when worker resumes normal output
        if (worker._interventionState === 'question') {
          const stillQuestion = this._detectQuestion(text);
          if (!stillQuestion.detected) {
            worker._interventionState = null;
            worker._lastQuestion = null;
          }
        }
        // Reset permission notification flag when prompt is no longer visible (5.29)
        if (worker._permissionNotified && !this._termInterface.isPermissionPrompt(text)) {
          worker._permissionNotified = false;
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
      if (worker._setupPollTimer) { clearInterval(worker._setupPollTimer); worker._setupPollTimer = null; }
      if (worker._pendingTaskTimer) { clearInterval(worker._pendingTaskTimer); worker._pendingTaskTimer = null; }
      if (worker._pendingTaskTimeoutTimer) { clearTimeout(worker._pendingTaskTimeoutTimer); worker._pendingTaskTimeoutTimer = null; }
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
      this._emitSSE('complete', { worker: name, exitCode, signal });

      // Notification on task complete (4.10)
      if (this._notifications) {
        let lastCommit = '';
        const gitDir = (worker.worktree || this._detectRepoRoot() || '').replace(/\\/g, '/');
        if (gitDir) {
          try {
            lastCommit = execSyncSafe(`git -C "${gitDir}" log -1 --oneline`, {
              encoding: 'utf8', timeout: 5000, stdio: ['pipe', 'pipe', 'pipe']
            }).trim();
          } catch {}
        }
        this._notifications.notifyTaskComplete(name, {
          exitCode, signal, branch: worker.branch || null,
          task: worker._taskText, lastCommit
        });
        // Force flush Slack buffer on worker close (5.4)
        this._notifications._flushAll().catch(() => {});
      }

      // Auto worker (4.8): generate morning report on exit
      if (worker._autoWorker) {
        try {
          const report = this.generateMorningReport();
          this._emitSSE('morning-report', { worker: name, path: report.path });
        } catch {}
      }

      // Process queue — worker exit may unblock queued tasks (2.2, 2.8)
      if (this._taskQueue.length > 0) {
        setTimeout(() => this._processQueue(), 1000);
      }
    });

    this.workers.set(name, worker);
    this._saveState();

    // Auto trust folder + effort level setup
    if (this.config.workerDefaults?.trustFolder) {
      // Will be handled by pending commands or first idle snapshot
    }

    // Resume re-orientation (5.14): read scrollback after resume
    if (options.resume) {
      const w = this.workers.get(name);
      if (w) {
        w._resumed = true;
        // Schedule a delayed scrollback read to capture resume state
        setTimeout(() => {
          if (!w.alive) return;
          const scr = w.screen;
          if (scr) {
            const lastLines = scr.getVisibleText().split('\n').slice(-20).join('\n');
            w.snapshots.push({
              time: Date.now(),
              screen: `[RESUMED] Last visible state:\n${lastLines}`,
              autoAction: true
            });
            if (this._notifications) {
              this._notifications.pushAll(`[RESUMED] ${name}: worker resumed. Last state captured.`);
            }
          }
        }, 5000); // Wait 5s for Claude to load
      }
    }

    return {
      name,
      pid: proc.pid,
      target: targetName,
      status: 'running'
    };
  }

  async send(name, input, isSpecialKey = false) {
    const w = this.workers.get(name);
    if (!w) return { error: `Worker '${name}' not found` };
    if (!w.alive) return { error: `Worker '${name}' has exited` };

    // Block auto-approval of critical commands (5.28)
    if (w._interventionState === 'critical_deny') {
      if (isSpecialKey && input === 'Enter') {
        return { error: `Worker '${name}' has a critical command pending. Use 'c4 approve ${name}' instead.` };
      }
      // Also block 'y' followed by enter
      if (!isSpecialKey && /^y$/i.test(input.trim())) {
        return { error: `Worker '${name}' has a critical command pending. Use 'c4 approve ${name}' instead.` };
      }
    }

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
      await this._chunkedWrite(w.proc, input);
      await new Promise(r => setTimeout(r, 100));
      w.proc.write('\r');
    }

    return { success: true };
  }

  // Approve a critical_deny command (5.21 hybrid safety)
  // optionNumber: select a specific TUI option (1-based). Down arrows + Enter.
  approve(name, optionNumber) {
    const w = this.workers.get(name);
    if (!w) return { error: `Worker '${name}' not found` };
    if (w._interventionState !== 'critical_deny') {
      return { error: `Worker '${name}' is not awaiting critical approval` };
    }
    w._interventionState = null;
    if (optionNumber) {
      // TUI selection: (N-1) Down arrows + Enter
      let keys = '';
      for (let i = 1; i < optionNumber; i++) {
        keys += '\x1b[B'; // Down arrow
      }
      keys += '\r'; // Enter
      w.proc.write(keys);
      return { success: true, approved: w._criticalCommand, option: optionNumber };
    }
    // Default: send 'y' + Enter to approve
    w.proc.write('y\r');
    return { success: true, approved: w._criticalCommand };
  }

  /**
   * PTY에 텍스트를 청크 단위로 분할 전송 (버퍼 오버플로우 방지)
   * Promise 기반 순차 전송: drain 이벤트로 백프레셔 처리
   */
  async _chunkedWrite(proc, text, chunkSize = 500, delayMs = 50) {
    if (text.length <= chunkSize) {
      proc.write(text);
      return;
    }
    for (let i = 0; i < text.length; i += chunkSize) {
      if (i > 0) {
        await new Promise(resolve => setTimeout(resolve, delayMs));
      }
      const chunk = text.slice(i, i + chunkSize);
      const ok = proc.write(chunk);
      if (!ok) {
        await new Promise(resolve => proc.once('drain', resolve));
      }
    }
  }

  // (7.1) Write task text followed by a separate CR after 100ms.
  // Combined `text + '\r'` writes can lose the CR due to PTY/Claude Code
  // timing (same root cause as 5.18's send() fix). Splitting guarantees
  // the Enter lands after the input field has received the text.
  async _writeTaskAndEnter(proc, text, enterDelayMs = 100) {
    await this._chunkedWrite(proc, text);
    await new Promise(resolve => setTimeout(resolve, enterDelayMs));
    try { proc.write('\r'); } catch { /* proc closed */ }
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
    // Apply summary layer (3.14) for long snapshots
    const processed = this._summaryLayer.process(latest);
    return {
      content: processed.screen,
      status: w.alive ? 'idle' : 'exited',
      snapshotsRead: newSnapshots.length,
      exitCode: latest.exitCode,
      summarized: processed._summarized || false
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

  getScrollback(name, lastN = 200) {
    const w = this.workers.get(name);
    if (!w) return { error: `Worker '${name}' not found` };
    return {
      content: w.screen.getScrollback(lastN),
      lines: Math.min(lastN, w.screen.scrollback.length),
      totalScrollback: w.screen.scrollback.length
    };
  }

  // Watch worker output stream (5.42)
  // Registers a callback that receives raw PTY data. Returns unwatch function, or null if worker not found.
  watchWorker(name, cb) {
    const w = this.workers.get(name);
    if (!w) return null;
    if (!w._watchers) w._watchers = new Set();
    w._watchers.add(cb);
    return () => {
      if (w._watchers) w._watchers.delete(cb);
    };
  }

  async waitAndRead(name, timeoutMs = 120000, options = {}) {
    const { interruptOnIntervention = false } = options;
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
        if (interruptOnIntervention && w._interventionState) {
          resolve({
            content: this._getScreenText(w.screen),
            status: 'intervention',
            intervention: w._interventionState
          });
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

  async waitAndReadMulti(names, timeoutMs = 120000, options = {}) {
    const { interruptOnIntervention = false } = options;

    // Resolve names: '*' means all active workers
    let resolvedNames = names;
    if (names.length === 1 && names[0] === '*') {
      resolvedNames = [];
      for (const [n, w] of this.workers) {
        if (w.alive) resolvedNames.push(n);
      }
      if (resolvedNames.length === 0) {
        return { error: 'No active workers' };
      }
    }

    // Validate all workers exist
    const entries = [];
    for (const name of resolvedNames) {
      const w = this.workers.get(name);
      if (!w) return { error: `Worker '${name}' not found` };
      entries.push({ name, worker: w });
    }

    const startTime = Date.now();

    return new Promise((resolve) => {
      const check = () => {
        if (Date.now() - startTime > timeoutMs) {
          resolve({
            status: 'timeout',
            results: entries.map(({ name, worker }) => {
              const idleMs = Date.now() - worker.lastDataTime;
              return {
                name,
                status: !worker.alive ? 'exited' :
                  (idleMs >= this.idleThresholdMs ? 'idle' : 'busy'),
                intervention: worker._interventionState || null
              };
            })
          });
          return;
        }

        for (const { name, worker } of entries) {
          if (!worker.alive) {
            resolve({
              name,
              status: 'exited',
              content: this._getScreenText(worker.screen)
            });
            return;
          }

          const idleMs = Date.now() - worker.lastDataTime;
          if (idleMs >= this.idleThresholdMs) {
            resolve({
              name,
              status: 'idle',
              content: this._getScreenText(worker.screen)
            });
            return;
          }

          if (interruptOnIntervention && worker._interventionState) {
            resolve({
              name,
              status: 'intervention',
              intervention: worker._interventionState,
              content: this._getScreenText(worker.screen)
            });
            return;
          }
        }

        setTimeout(check, 500);
      };
      check();
    });
  }

  // --- Log Management ---

  _checkLogRotation() {
    const maxSizeMb = this.config.logs?.maxLogSizeMb || 50;
    const maxSizeBytes = maxSizeMb * 1024 * 1024;
    const rotated = [];

    for (const [name, w] of this.workers) {
      if (!w.rawLogPath) continue;

      try {
        const stat = fs.statSync(w.rawLogPath);
        if (stat.size >= maxSizeBytes) {
          // Close current stream
          if (w.rawLogStream && !w.rawLogStream.destroyed) {
            w.rawLogStream.end();
          }

          // Delete old .log.1 if exists, then rotate
          const rotatedPath = w.rawLogPath + '.1';
          try { fs.unlinkSync(rotatedPath); } catch {}
          fs.renameSync(w.rawLogPath, rotatedPath);

          // Re-open stream for active workers
          if (w.alive) {
            w.rawLogStream = fs.createWriteStream(w.rawLogPath, { flags: 'w' });
          }

          rotated.push({ name, sizeMb: Math.round(stat.size / 1024 / 1024) });
        }
      } catch {}
    }

    return rotated;
  }

  _cleanupExitedLogs() {
    const cleanupMinutes = this.config.logs?.cleanupAfterMinutes || 60;
    const cleanupMs = cleanupMinutes * 60 * 1000;
    const now = Date.now();
    const cleaned = [];

    for (const [name, w] of this.workers) {
      if (w.alive) continue;

      // Find exit time from last snapshot with exited flag
      const exitSnapshot = [...w.snapshots].reverse().find(s => s.exited);
      if (!exitSnapshot) continue;

      const age = now - exitSnapshot.time;
      if (age >= cleanupMs) {
        // Delete log files
        if (w.rawLogPath) {
          try { fs.unlinkSync(w.rawLogPath); } catch {}
          try { fs.unlinkSync(w.rawLogPath + '.1'); } catch {}
        }

        // Remove worker from map
        if (w.rawLogStream && !w.rawLogStream.destroyed) w.rawLogStream.end();
        this.workers.delete(name);
        cleaned.push({ name, ageMinutes: Math.round(age / 60000) });
      }
    }

    if (cleaned.length > 0) {
      this._saveState();
    }

    return cleaned;
  }

  // --- Health Check ---

  healthCheck() {
    const now = Date.now();
    this._lastHealthCheck = now;
    const results = [];

    const timeoutMs = this.config.healthCheck?.timeoutMs || 600000; // 10 min default

    for (const [name, w] of this.workers) {
      if (w.alive) {
        // Periodically update session ID for resume support (4.1)
        this._updateSessionId(name);

        const idleMs = now - w.lastDataTime;
        if (idleMs > timeoutMs) {
          w.snapshots.push({
            time: now,
            screen: `[HEALTH] worker idle for ${Math.round(idleMs / 60000)}min (timeout: ${Math.round(timeoutMs / 60000)}min)`,
            autoAction: true
          });
          results.push({ name, status: 'timeout', idleMs, task: w._taskText, taskStarted: w._taskStartedAt, lastActivity: this._getLastActivity(w) });
        } else {
          results.push({ name, status: 'alive', idleMs, task: w._taskText, taskStarted: w._taskStartedAt, lastActivity: this._getLastActivity(w) });
        }
        continue;
      }

      // Dead worker detected
      w.snapshots.push({
        time: now,
        screen: `[HEALTH] worker exited (detected at ${new Date(now).toISOString()})`,
        autoAction: true
      });
      this._saveState();

      // SSH reconnect attempt (2.4)
      if (w._isSsh) {
        const reconnectResult = this._handleSshReconnect(name, w);
        if (reconnectResult) {
          results.push({ name, ...reconnectResult });
          continue;
        }
      }

      if (this.config.healthCheck?.autoRestart) {
        // Save session ID before cleanup for resume (4.1)
        this._updateSessionId(name);
        const sessionId = w._sessionId || this._sessionIds[name] || null;

        // Restart: re-create with same command
        const command = w.command.split(' ')[0];
        const args = w.command.split(' ').slice(1);
        const target = w.target || 'local';

        // Clean up old worker
        if (w.idleTimer) clearTimeout(w.idleTimer);
        if (w._pendingTaskTimer) { clearInterval(w._pendingTaskTimer); w._pendingTaskTimer = null; }
        if (w._pendingTaskTimeoutTimer) { clearTimeout(w._pendingTaskTimeoutTimer); w._pendingTaskTimeoutTimer = null; }
        if (w.rawLogStream && !w.rawLogStream.destroyed) w.rawLogStream.end();
        this.workers.delete(name);

        // Try resume first, fall back to fresh start (4.1)
        let createResult;
        if (sessionId && command === 'claude') {
          createResult = this.create(name, command, args, { target, resume: sessionId });
          if (createResult.error) {
            // Resume failed — try fresh start
            this.workers.delete(name);
            createResult = this.create(name, command, args, { target });
          }
        } else {
          createResult = this.create(name, command, args, { target });
        }

        if (createResult.error) {
          results.push({ name, status: 'restart_failed', error: createResult.error });
        } else {
          results.push({ name, status: 'restarted', pid: createResult.pid, resumed: !!sessionId });
        }
      } else {
        results.push({ name, status: 'exited' });
      }
    }

    // Log rotation and cleanup
    const rotated = this._checkLogRotation();
    const cleaned = this._cleanupExitedLogs();

    // Token usage monitoring (2.5)
    const tokenResult = this._checkTokenUsage();
    if (tokenResult?.warning) {
      // Push warning to all alive workers
      for (const [wName, w] of this.workers) {
        if (w.alive) {
          w.snapshots.push({
            time: now,
            screen: tokenResult.warning,
            autoAction: true,
            tokenWarn: true
          });
        }
      }
    }

    // Manager rotation check (4.7): warn if compact count approaching threshold
    const rotationThreshold = this.config.managerRotation?.compactThreshold ?? 0;
    if (rotationThreshold > 0) {
      for (const [name, w] of this.workers) {
        if (!w.alive || !w._autoWorker) continue;
        const count = w._compactCount || 0;
        if (count > 0 && count >= rotationThreshold - 1 && count < rotationThreshold) {
          if (this._notifications) {
            this._notifications.pushAll(`[MANAGER WARN] ${name} approaching compact limit (${count}/${rotationThreshold})`);
          }
        }
      }
    }

    // Process task queue — worker exits may unblock queued tasks (2.2, 2.8)
    const dequeued = this._processQueue();

    // Dirty worktree Slack warning (5.15)
    if (this._notifications) {
      for (const [name, w] of this.workers) {
        if (!w.alive || !w.worktree) continue;
        if (this._isWorktreeDirty(w.worktree)) {
          if (!w._dirtyNotified) {
            w._dirtyNotified = true;
            this._notifications.pushAll(`[DIRTY] ${name}: worktree has uncommitted changes`);
          }
        } else {
          w._dirtyNotified = false;
        }
      }
    }

    // Stall detection: intervention state or 5min+ no output (4.14)
    const stallThresholdMs = 300000; // 5 minutes
    if (this._notifications) {
      for (const r of results) {
        const w = this.workers.get(r.name);
        if (!w || !w.alive) continue;
        if (w._interventionState) {
          this._notifications.notifyStall(r.name, `intervention: ${w._interventionState}`);
        } else if (w._taskText && r.idleMs >= stallThresholdMs) {
          this._notifications.notifyStall(r.name, `no output for ${Math.round(r.idleMs / 60000)}min`);
        }
      }
    }

    // Notifications: flush Slack buffer + report health issues (4.10)
    if (this._notifications) {
      this._notifications.notifyHealthCheck({ workers: results });
      this._notifications.tick();
    }

    // Lost worker worktree cleanup
    const cleanedWorktrees = this._cleanupLostWorktrees();

    // (5.41) Orphan worktree detection via git worktree list vs active workers
    const orphanWorktrees = this._cleanupOrphanWorktreesByList();

    // Worktree prune (5.32): periodically clean up stale worktrees
    try {
      const repoRoot = this._detectRepoRoot();
      if (repoRoot) {
        execSyncSafe('git worktree prune', {
          cwd: repoRoot, encoding: 'utf8', stdio: 'pipe', timeout: 5000
        });
      }
    } catch {}

    return { lastCheck: now, workers: results, rotated, cleaned, dequeued, tokenUsage: tokenResult, cleanedWorktrees, orphanWorktrees };
  }

  startHealthCheck() {
    if (this._healthTimer) return;
    const enabled = this.config.healthCheck?.enabled !== false;
    if (!enabled) return;

    // Clean up leftover worktrees from previous sessions
    this._cleanupLostWorktrees();

    const intervalMs = this.config.healthCheck?.intervalMs || 30000;
    this._healthTimer = setInterval(() => this.healthCheck(), intervalMs);
    // Run immediately on start
    this.healthCheck();
  }

  stopHealthCheck() {
    if (this._healthTimer) {
      clearInterval(this._healthTimer);
      this._healthTimer = null;
    }
  }

  // --- Scribe ---

  _ensureScribe() {
    if (!this._scribe) {
      const scribeCfg = this.config.scribe || {};
      this._scribe = new Scribe({
        intervalMs: scribeCfg.intervalMs,
        outputPath: scribeCfg.outputPath,
        projectId: scribeCfg.projectId,
        maxEntries: scribeCfg.maxEntries,
        projectRoot: this._detectRepoRoot() || path.join(__dirname, '..')
      });
    }
    // Connect notifications to scribe
    if (this._notifications) {
      this._scribe._notifications = this._notifications;
    }
    return this._scribe;
  }

  scribeStart() {
    const scribe = this._ensureScribe();
    return scribe.start();
  }

  scribeStop() {
    if (!this._scribe) return { error: 'Scribe not initialized' };
    return this._scribe.stop();
  }

  scribeStatus() {
    if (!this._scribe) {
      return { enabled: false, running: false };
    }
    return this._scribe.status();
  }

  scribeScan() {
    const scribe = this._ensureScribe();
    return scribe.scan();
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
        branch: w.branch || null,
        worktree: w.worktree || null,
        scope: w.scopeGuard ? w.scopeGuard.hasRestrictions() : false,
        pid: w.proc ? w.proc.pid : null,
        status: w.alive ? (idleMs > this.idleThresholdMs ? 'idle' : 'busy') : 'exited',
        unreadSnapshots,
        totalSnapshots: w.snapshots.length,
        intervention: w._interventionState || null,
        lastQuestion: w._lastQuestion || null,
        errorCount: (w._errorHistory || []).reduce((sum, e) => sum + e.count, 0),
        phase: w._smState ? w._smState.phase : null,
        testFailCount: w._smState ? w._smState.testFailCount : 0
      });
    }
    // Include queued tasks (2.8)
    const queuedTasks = (this._taskQueue || []).map(q => ({
      name: q.name,
      task: q.task,
      branch: q.branch || null,
      after: q.after || null,
      queuedAt: q.queuedAt,
      status: 'queued'
    }));

    return {
      workers: result,
      queuedTasks,
      lostWorkers: this.lostWorkers || [],
      lastHealthCheck: this._lastHealthCheck
    };
  }

  // --- Task History (3.7) ---

  _getCommits(branch) {
    if (!branch) return [];
    try {
      const repoRoot = this._detectRepoRoot();
      if (!repoRoot) return [];
      const log = execSyncSafe(
        `git -C "${repoRoot.replace(/\\/g, '/')}" log main..${branch} --oneline --no-decorate 2>/dev/null`,
        { encoding: 'utf8', timeout: 5000, stdio: ['pipe', 'pipe', 'pipe'] }
      ).trim();
      if (!log) return [];
      return log.split('\n').map(line => {
        const [hash, ...rest] = line.split(' ');
        return { hash, message: rest.join(' ') };
      });
    } catch {
      return [];
    }
  }

  _recordHistory(name, worker) {
    const record = {
      name,
      task: worker._taskText || null,
      branch: worker.branch || null,
      startedAt: worker._taskStartedAt || null,
      completedAt: new Date().toISOString(),
      commits: this._getCommits(worker.branch),
      status: worker.alive ? 'closed' : 'exited'
    };
    try {
      fs.appendFileSync(HISTORY_FILE, JSON.stringify(record) + '\n');
    } catch (e) {
      // Silently fail — don't break close()
    }
    return record;
  }

  getHistory(options = {}) {
    try {
      const content = fs.readFileSync(HISTORY_FILE, 'utf8').trim();
      if (!content) return { records: [] };
      let records = content.split('\n').map(line => {
        try { return JSON.parse(line); }
        catch { return null; }
      }).filter(Boolean);

      if (options.worker) {
        records = records.filter(r => r.name === options.worker);
      }
      if (options.limit) {
        records = records.slice(-options.limit);
      }
      return { records };
    } catch {
      return { records: [] };
    }
  }

  // --- Rollback (3.6) ---

  rollback(name) {
    const w = this.workers.get(name);
    if (!w) return { error: `Worker '${name}' not found` };
    if (!w._startCommit) return { error: `No start commit recorded for '${name}'` };

    const gitDir = (w.worktree || this._detectRepoRoot() || '').replace(/\\/g, '/');
    if (!gitDir) return { error: 'Cannot determine git directory for rollback' };

    try {
      // Get current HEAD for reference
      const currentHead = execSyncSafe(`git -C "${gitDir}" rev-parse --short HEAD`, {
        encoding: 'utf8', timeout: 5000, stdio: ['pipe', 'pipe', 'pipe']
      }).trim();

      const startShort = w._startCommit.slice(0, 7);

      if (currentHead === startShort) {
        return { success: true, name, message: 'Already at start commit, nothing to rollback', commit: w._startCommit };
      }

      // git reset --soft preserves changes in staging area
      execSyncSafe(`git -C "${gitDir}" reset --soft ${w._startCommit}`, {
        encoding: 'utf8', timeout: 10000, stdio: ['pipe', 'pipe', 'pipe']
      });

      // Log the rollback
      w.snapshots.push({
        time: Date.now(),
        screen: `[ROLLBACK] reset to ${startShort} (was ${currentHead})`,
        autoAction: true
      });

      return {
        success: true,
        name,
        from: currentHead,
        to: startShort,
        startCommit: w._startCommit,
        branch: w.branch || null,
        worktree: w.worktree || null
      };
    } catch (e) {
      return { error: `Rollback failed: ${e.message}` };
    }
  }

  cleanup(dryRun = false) {
    const repoRoot = this._detectRepoRoot();
    const results = { branches: [], worktrees: [], directories: [] };

    // 1. Find all LOST/exited workers with worktrees
    for (const [name, w] of this.workers) {
      if (w.alive) continue;

      // Branch cleanup
      if (w.branch && w.branch.startsWith('c4/')) {
        results.branches.push(w.branch);
        if (!dryRun && repoRoot) {
          try {
            execSyncSafe(`git -C "${repoRoot.replace(/\\/g, '/')}" branch -D "${w.branch}"`, {
              encoding: 'utf8', stdio: 'pipe', timeout: 5000
            });
          } catch {}
        }
      }

      // Worktree cleanup
      if (w.worktree && fs.existsSync(w.worktree)) {
        results.worktrees.push(w.worktree);
        if (!dryRun && repoRoot) {
          this._removeWorktree(repoRoot, w.worktree);
        }
      }

      // Remove from workers map
      if (!dryRun) {
        if (w.rawLogStream && !w.rawLogStream.destroyed) w.rawLogStream.end();
        this.workers.delete(name);
      }
    }

    // 2. Find orphan c4-worktree-* directories
    if (repoRoot) {
      const parentDir = path.dirname(repoRoot);
      try {
        const entries = fs.readdirSync(parentDir);
        for (const entry of entries) {
          if (!entry.startsWith('c4-worktree-')) continue;
          const fullPath = path.join(parentDir, entry);
          // Skip if an active worker uses this worktree
          let inUse = false;
          for (const [, w] of this.workers) {
            if (w.worktree && path.resolve(w.worktree) === path.resolve(fullPath) && w.alive) {
              inUse = true; break;
            }
          }
          if (!inUse) {
            results.directories.push(fullPath);
            if (!dryRun) {
              try { fs.rmSync(fullPath, { recursive: true, force: true }); } catch {}
            }
          }
        }
      } catch {}
    }

    // 3. git worktree prune
    if (!dryRun && repoRoot) {
      try {
        execSyncSafe('git worktree prune', {
          cwd: repoRoot, encoding: 'utf8', stdio: 'pipe', timeout: 5000
        });
      } catch {}
    }

    if (!dryRun) this._saveState();
    return { dryRun, ...results };
  }

  close(name) {
    const w = this.workers.get(name);
    if (!w) return { error: `Worker '${name}' not found` };

    // Save session ID for potential resume (4.1)
    this._updateSessionId(name);

    // Record history before cleanup (3.7)
    const history = this._recordHistory(name, w);

    if (w.idleTimer) clearTimeout(w.idleTimer);
    if (w._pendingTaskTimer) { clearInterval(w._pendingTaskTimer); w._pendingTaskTimer = null; }
    if (w._pendingTaskTimeoutTimer) { clearTimeout(w._pendingTaskTimeoutTimer); w._pendingTaskTimeoutTimer = null; }
    if (w.alive) w.proc.kill();
    if (w.rawLogStream && !w.rawLogStream.destroyed) w.rawLogStream.end();

    // Cleanup worktree
    if (w.worktree) {
      const repoRoot = w.worktreeRepoRoot || this._detectRepoRoot();
      if (repoRoot) {
        this._removeWorktree(repoRoot, w.worktree);
      }
    }

    // Branch cleanup (5.25/5.31): delete worker's c4/ branch after worktree removal
    if (w.branch && w.branch.startsWith('c4/')) {
      const cleanupRoot = w.worktreeRepoRoot || this._detectRepoRoot();
      if (cleanupRoot) {
        try {
          execSyncSafe(`git -C "${cleanupRoot.replace(/\\/g, '/')}" branch -D "${w.branch}"`, {
            encoding: 'utf8', stdio: 'pipe', timeout: 5000
          });
        } catch {} // Branch may already be deleted or not exist
      }
    }

    this.workers.delete(name);
    this._saveState();
    return { success: true, name, history };
  }

  closeAll() {
    for (const name of [...this.workers.keys()]) {
      this.close(name);
    }
  }

  // --- Manager Auto-Replacement (4.7) ---

  compactEvent(workerName) {
    const w = this.workers.get(workerName);
    if (!w) return { error: `Worker '${workerName}' not found` };

    if (!w._compactCount) w._compactCount = 0;
    w._compactCount++;
    w._lastCompactAt = Date.now();

    w.snapshots.push({
      time: Date.now(),
      screen: `[COMPACT] context compaction #${w._compactCount} detected`,
      autoAction: true
    });

    this._emitSSE('compact', { worker: workerName, count: w._compactCount });

    // Check if auto-replacement threshold reached
    const threshold = this.config.managerRotation?.compactThreshold ?? 0;
    if (threshold > 0 && w._compactCount >= threshold && w._autoWorker) {
      // Decision summary injection (5.12)
      this._injectDecisionSummary(workerName, w);
      // Trigger manager replacement
      const replaceResult = this._replaceManager(workerName);
      return { compactCount: w._compactCount, replaced: true, ...replaceResult };
    }

    return { received: true, worker: workerName, compactCount: w._compactCount };
  }

  // Decision summary injection before manager handoff (5.12)
  _injectDecisionSummary(workerName, worker) {
    try {
      const sessionContextPath = path.join(this.projectRoot || path.join(__dirname, '..'), 'docs', 'session-context.md');

      // Gather key info from snapshots
      const recentSnapshots = (worker.snapshots || []).slice(-20);
      const summaryLines = [];

      // Task info
      if (worker._taskText) {
        summaryLines.push(`Task: ${worker._taskText.substring(0, 100)}`);
      }

      // Compact count + branch
      summaryLines.push(`Progress: ${worker._compactCount || 0} compactions, branch: ${worker.branch || 'unknown'}`);

      // Recent interventions/errors
      const interventions = recentSnapshots.filter(s => s.intervention);
      if (interventions.length > 0) {
        summaryLines.push(`Warnings: ${interventions.length} interventions detected`);
      }

      // Active workers
      const activeCount = [...this.workers.values()].filter(w => w.alive).length;
      summaryLines.push(`Active workers: ${activeCount}`);

      const header = `<!-- Manager Handoff Summary (${new Date().toISOString()}) -->\n` +
        `## Manager Handoff\n` +
        summaryLines.map(l => `- ${l}`).join('\n') +
        `\n---\n\n`;

      // Prepend to session-context.md
      let existing = '';
      if (fs.existsSync(sessionContextPath)) {
        existing = fs.readFileSync(sessionContextPath, 'utf8');
      }
      fs.writeFileSync(sessionContextPath, header + existing, 'utf8');
    } catch {} // Non-fatal
  }

  _replaceManager(oldName) {
    const old = this.workers.get(oldName);
    if (!old || !old.alive) return { error: `Worker '${oldName}' not alive` };

    // Force scribe scan to capture latest context
    try { this.scribeScan(); } catch {}

    // Save session ID before closing
    this._updateSessionId(oldName);

    const newName = `${oldName}-${Date.now().toString(36)}`;
    const task = old._taskText || '';
    const branch = old.branch || `c4/${newName}`;

    // Build replacement mission with context recovery instructions
    const repoRoot = (old.worktreeRepoRoot || this._detectRepoRoot() || '').replace(/\\/g, '/');
    const contextInstructions = [
      `docs/session-context.md 파일을 읽어서 이전 관리자의 작업 맥락을 파악해.`,
      `TODO.md를 읽고 남은 작업을 이어서 진행해.`,
      `git log --oneline -20 으로 최근 진행 상황을 확인해.`,
      `이전 관리자(${oldName})의 작업을 이어받는 중이야.`
    ].join('\n');

    const fullMission = task
      ? `${contextInstructions}\n\n이전 작업 지시:\n${task}`
      : contextInstructions;

    // Close old manager
    old.snapshots.push({
      time: Date.now(),
      screen: `[MANAGER ROTATION] replacing with ${newName} after ${old._compactCount} compactions`,
      autoAction: true
    });

    // Notify
    if (this._notifications) {
      this._notifications.pushAll(`[MANAGER ROTATION] ${oldName} -> ${newName} (compactions: ${old._compactCount})`);
    }

    // Create new manager with same permissions
    const sendResult = this.sendTask(newName, fullMission, {
      branch,
      useBranch: true,
      autoMode: true,
      _autoWorker: true
    });

    // Close old after new is created
    this.close(oldName);

    return {
      oldManager: oldName,
      newManager: newName,
      compactCount: old._compactCount || 0,
      sendResult
    };
  }

  // --- Auto Mode (4.8) ---

  autoStart(task, options = {}) {
    const name = options.name || 'auto-mgr';

    // Enable global auto mode — all workers created during this session inherit autoMode
    this._globalAutoMode = true;

    // Start scribe
    try { this.scribeStart(); } catch {}

    // Build full-permission manager worker via sendTask with autoMode
    const result = this.sendTask(name, task, {
      branch: options.branch || `c4/${name}`,
      useBranch: true,
      autoMode: true,
      profile: '',  // no profile restriction — full permissions built below
      _autoWorker: true
    });

    return { ...result, name, scribe: true };
  }

  _buildAutoManagerPermissions() {
    // 5.1: Manager worker must NOT directly modify code.
    // Only c4 commands (to delegate to sub-workers) and git -C (to inspect repos) are allowed.
    return {
      allow: [
        'Bash(c4:*)', 'Bash(MSYS_NO_PATHCONV=1 c4:*)',
        'Bash(git -C:*)',
        'Agent'
      ],
      deny: [
        'Read', 'Write', 'Edit', 'Grep', 'Glob',
        'Bash(rm -rf:*)', 'Bash(sudo:*)', 'Bash(shutdown:*)', 'Bash(reboot:*)'
      ],
      defaultMode: 'auto'
    };
  }

  // --- Morning Report (4.4) ---

  generateMorningReport() {
    const repoRoot = this._detectRepoRoot();
    const reportPath = repoRoot
      ? path.join(repoRoot, 'docs', 'morning-report.md')
      : path.join(__dirname, '..', 'docs', 'morning-report.md');

    const now = new Date();
    const dateStr = now.toISOString().slice(0, 10);
    const timeStr = now.toLocaleTimeString();
    const sections = [];

    sections.push(`# Morning Report — ${dateStr}`);
    sections.push(`> Generated at ${timeStr}\n`);

    // 1. Git log (last 24h)
    sections.push('## Recent Commits');
    try {
      const gitDir = (repoRoot || path.join(__dirname, '..')).replace(/\\/g, '/');
      const log = execSyncSafe(
        `git -C "${gitDir}" log --since="24 hours ago" --oneline --no-decorate`,
        { encoding: 'utf8', timeout: 10000, stdio: ['pipe', 'pipe', 'pipe'] }
      ).trim();
      if (log) {
        sections.push('```');
        sections.push(log);
        sections.push('```');
      } else {
        sections.push('_No commits in the last 24 hours._');
      }
    } catch {
      sections.push('_Could not read git log._');
    }
    sections.push('');

    // 2. Worker history
    sections.push('## Worker History');
    const { records } = this.getHistory({ limit: 20 });
    if (records.length > 0) {
      // Separate completed/failed
      const completed = [];
      const failed = [];
      const other = [];
      for (const r of records) {
        const taskPreview = r.task ? (r.task.length > 80 ? r.task.slice(0, 80) + '...' : r.task) : '(no task)';
        const entry = `- **${r.name}** [${r.status}] branch=\`${r.branch || '-'}\` commits=${(r.commits || []).length}\n  ${taskPreview}`;
        if (r.status === 'closed' || r.status === 'exited') {
          const hasCommits = (r.commits || []).length > 0;
          if (hasCommits) completed.push(entry);
          else failed.push(entry);
        } else {
          other.push(entry);
        }
      }

      if (completed.length > 0) {
        sections.push('### Completed');
        sections.push(completed.join('\n'));
      }
      if (failed.length > 0) {
        sections.push('### Needs Review (no commits)');
        sections.push(failed.join('\n'));
      }
      if (other.length > 0) {
        sections.push('### Other');
        sections.push(other.join('\n'));
      }
    } else {
      sections.push('_No worker history records._');
    }
    sections.push('');

    // 3. TODO.md status
    sections.push('## TODO Status');
    try {
      const todoPath = repoRoot
        ? path.join(repoRoot, 'TODO.md')
        : path.join(__dirname, '..', 'TODO.md');
      const todoContent = fs.readFileSync(todoPath, 'utf8');
      // Count done/todo items
      const doneCount = (todoContent.match(/\*\*done\*\*/gi) || []).length;
      const todoCount = (todoContent.match(/\|\s*todo\s*\|/gi) || []).length;
      sections.push(`- Done: **${doneCount}** items`);
      sections.push(`- Todo: **${todoCount}** items`);
      sections.push(`- Progress: ${doneCount}/${doneCount + todoCount} (${Math.round(doneCount / (doneCount + todoCount) * 100)}%)`);
    } catch {
      sections.push('_Could not read TODO.md._');
    }
    sections.push('');

    // 4. Token usage
    sections.push('## Token Usage');
    try {
      const usage = this.getTokenUsage();
      if (usage && !usage.error) {
        sections.push(`- Input: ${(usage.input || 0).toLocaleString()} tokens`);
        sections.push(`- Output: ${(usage.output || 0).toLocaleString()} tokens`);
        sections.push(`- Total: ${(usage.total || 0).toLocaleString()} tokens`);
      } else {
        sections.push('_No token usage data._');
      }
    } catch {
      sections.push('_Could not read token usage._');
    }

    // Write report
    const reportDir = path.dirname(reportPath);
    if (!fs.existsSync(reportDir)) {
      fs.mkdirSync(reportDir, { recursive: true });
    }
    const content = sections.join('\n') + '\n';
    fs.writeFileSync(reportPath, content);

    return { success: true, path: reportPath, date: dateStr };
  }
}

module.exports = PtyManager;
