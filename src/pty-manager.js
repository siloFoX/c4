const pty = require('node-pty');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');
const ScreenBuffer = require('./screen-buffer');
const Scribe = require('./scribe');
const { ScopeGuard, resolveScope } = require('./scope-guard');

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
    this._taskQueue = [];
    this._loadState();
    this._healthTimer = null;
    this._lastHealthCheck = null;
    this._scribe = null;
    this._sshReconnects = new Map(); // name → { count, lastAttempt }
    this._tokenUsage = { daily: {}, lastScan: 0, offsets: {} };
    this._loadTokenState();
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
      if (Array.isArray(data.workers)) {
        for (const w of data.workers) {
          if (w.name && w.alive) {
            this.lostWorkers.push({
              name: w.name,
              pid: w.pid,
              branch: w.branch || null,
              worktree: w.worktree || null,
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
    const data = { offsets: {}, workers: [], lostWorkers: this.lostWorkers || [], taskQueue: this._taskQueue || [] };
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
        exitedAt: exitSnapshot ? new Date(exitSnapshot.time).toISOString() : null
      });
    }
    fs.writeFileSync(STATE_FILE, JSON.stringify(data, null, 2));
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

    // ControlMaster for persistent connections (Unix only)
    if (process.platform !== 'win32') {
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
      if (existing.rawLogStream && !existing.rawLogStream.destroyed) existing.rawLogStream.end();
      this.workers.delete(entry.name);
    }

    const createResult = this.create(entry.name, entry.command, entry.args, { target: entry.target });
    if (createResult.error) return createResult;

    // Store pending task — will be sent after worker setup completes
    const w = this.workers.get(entry.name);
    w._pendingTask = {
      task: entry.task,
      options: {
        branch: entry.branch,
        useBranch: entry.useBranch,
        useWorktree: entry.useWorktree,
        projectRoot: entry.projectRoot,
        scope: entry.scope,
        scopePreset: entry.scopePreset
      }
    };

    return { created: true, name: entry.name, pid: createResult.pid };
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

  // --- Git Worktree helpers ---

  _detectRepoRoot(projectRoot) {
    if (projectRoot) return projectRoot;
    const configRoot = this.config.worktree?.projectRoot;
    if (configRoot) return path.resolve(configRoot);
    try {
      return execSync('git rev-parse --show-toplevel', {
        encoding: 'utf8',
        cwd: path.resolve(__dirname, '..'),
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
        execSync(`git worktree remove "${gitPath}" --force`, {
          cwd: repoRoot, encoding: 'utf8', stdio: 'pipe'
        });
      } catch {
        fs.rmSync(worktreePath, { recursive: true, force: true });
        execSync('git worktree prune', {
          cwd: repoRoot, encoding: 'utf8', stdio: 'pipe'
        });
      }
    }

    // Try new branch first, fall back to existing branch
    try {
      execSync(`git worktree add "${gitPath}" -b "${branch}"`, {
        cwd: repoRoot, encoding: 'utf8', stdio: 'pipe'
      });
    } catch {
      execSync(`git worktree add "${gitPath}" "${branch}"`, {
        cwd: repoRoot, encoding: 'utf8', stdio: 'pipe'
      });
    }

    // Apply main-protection hooks to worktree (1.17)
    const hooksPath = repoRoot.replace(/\\/g, '/') + '/.githooks';
    execSync(`git -C "${gitPath}" config core.hooksPath "${hooksPath}"`, {
      encoding: 'utf8', stdio: 'pipe'
    });
  }

  _removeWorktree(repoRoot, worktreePath) {
    const gitPath = worktreePath.replace(/\\/g, '/');
    try {
      execSync(`git worktree remove "${gitPath}" --force`, {
        cwd: repoRoot, encoding: 'utf8', stdio: 'pipe'
      });
    } catch {
      try {
        execSync('git worktree prune', {
          cwd: repoRoot, encoding: 'utf8', stdio: 'pipe'
        });
      } catch {}
    }
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

  _classifyPermission(screenText) {
    const rules = this.config.autoApprove?.rules || [];
    const defaultAction = this.config.autoApprove?.defaultAction || 'ask';
    const promptType = this._getPromptType(screenText);

    if (promptType === 'bash') {
      const command = this._extractBashCommand(screenText);
      if (!command) return defaultAction;

      // Extract first word as the command name
      const cmdName = command.split(/\s+/)[0].replace(/['"]/g, '');

      for (const rule of rules) {
        // Exact match: "Bash(pwd)"
        const exactMatch = rule.pattern.match(/^Bash\((\w+)\)$/);
        if (exactMatch && exactMatch[1] === cmdName) {
          return rule.action;
        }

        // Prefix match: "Bash(grep:*)"
        const prefixMatch = rule.pattern.match(/^Bash\((\w+):\*\)$/);
        if (prefixMatch && prefixMatch[1] === cmdName) {
          return rule.action;
        }
      }

    } else if (promptType === 'create' || promptType === 'edit') {
      for (const rule of rules) {
        if (rule.pattern === 'Write' && promptType === 'create') return rule.action;
        if (rule.pattern === 'Edit' && promptType === 'edit') return rule.action;
      }
    }

    return defaultAction;
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
    // Look for git commit patterns without prior test execution
    const hasCommit = /git commit|git add/.test(screenText);
    if (!hasCommit) return null;

    const routine = worker._routineState || { tested: false, docsUpdated: false };

    // Check if tests were run in recent snapshots
    if (!routine.tested) {
      return { type: 'no_test', message: 'Committing without running tests' };
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

  _getRulesSummary() {
    const rules = this.config.rules;
    if (!rules || !rules.appendToTask) return null;

    // Use custom summary if provided, otherwise use default
    if (rules.summary) return rules.summary;

    return [
      '[C4 규칙 — 반드시 준수]',
      '- 복합 명령(&&, |, ;) 사용 금지 → 단일 명령으로 분리',
      '- cd X && git Y 대신 git -C <path> 사용',
      '- sleep 대신 c4 wait <name> 사용',
      '- /model 등 슬래시 명령: MSYS_NO_PATHCONV=1 c4 send 사용',
      '- main 직접 커밋 금지 → 브랜치에서 작업',
      '- 작업 루틴: 구현 → 테스트 → 문서 업데이트 → 커밋',
    ].join('\n');
  }

  // Send a task to worker with branch isolation via git worktree
  sendTask(name, task, options = {}) {
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

      // Can proceed — auto-create worker and queue task for after setup
      return this._createAndSendTask({
        name, task,
        command: options.command || 'claude',
        args: options.args || [],
        target: options.target || 'local',
        branch: options.branch || `c4/${name}`,
        useBranch: options.useBranch,
        useWorktree: options.useWorktree,
        projectRoot: options.projectRoot,
        scope: options.scope,
        scopePreset: options.scopePreset
      });
    }

    const branch = options.branch || `c4/${name}`;
    const useWorktree = options.useWorktree !== false && this.config.worktree?.enabled !== false;
    const commands = [];

    // Scope guard setup
    const scopeGuard = resolveScope(options.scope, this.config, options.scopePreset);
    if (scopeGuard) {
      w.scopeGuard = scopeGuard;
    }

    if (options.useBranch !== false) {
      if (useWorktree) {
        const repoRoot = this._detectRepoRoot(options.projectRoot);
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

    commands.push(task);

    const fullTask = commands.join('\n\n');
    w.proc.write(fullTask + '\r');
    w.branch = branch;

    return {
      success: true,
      branch,
      worktree: w.worktree || null,
      scope: w.scopeGuard ? { active: true, description: w.scopeGuard.description } : null,
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
      shell = process.platform === 'win32' ? 'cmd.exe' : 'bash';
      shellArgs = process.platform === 'win32'
        ? ['/c', resolvedCmd, ...args]
        : ['-c', `${resolvedCmd} ${args.join(' ')}`];
    } else if (t.type === 'ssh') {
      const remoteCwd = cwd || t.defaultCwd || '';
      const commandMap = t.commandMap || {};
      const resolvedCmd = commandMap[command] || command;
      const remoteArgs = args.length > 0 ? ' ' + args.join(' ') : '';

      shell = process.platform === 'win32' ? 'C:\\Windows\\System32\\OpenSSH\\ssh.exe' : 'ssh';
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
      setupDone: false,       // initial setup (effort level) completed
      setupPhase: null,       // current setup phase: null, 'waitMenu', 'done'
      setupRetries: 0,        // retry count for effort setup
      setupPhaseStart: null,  // timestamp when current phase started
      // Intervention state (1.9)
      _interventionState: null,  // null | 'question' | 'escalation'
      _lastQuestion: null,       // last detected question text
      _errorHistory: [],         // recent error lines for repeat detection
      _routineState: { tested: false, docsUpdated: false },
      // Pending task (2.2/2.8 queue)
      _pendingTask: null,        // { task, options } — sent after setup completes
      _pendingTaskSent: false,
      // SSH state (2.4)
      _isSsh: t.type === 'ssh',
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

        // Auto-trust folder
        if (this.config.workerDefaults?.trustFolder && this._detectTrustPrompt(text)) {
          proc.write('\r'); // Press Enter to trust
          return;
        }

        // Auto effort level setup (2-phase with retry: send /model, then detect menu and press keys)
        const effortLevel = this.config.workerDefaults?.effortLevel;
        if (effortLevel && !worker.setupDone) {
          const setupCfg = this.config.workerDefaults?.effortSetup || {};
          const maxRetries = setupCfg.retries ?? 3;
          const phaseTimeoutMs = setupCfg.phaseTimeoutMs ?? 8000;
          const inputDelayMs = setupCfg.inputDelayMs ?? 500;
          const confirmDelayMs = setupCfg.confirmDelayMs ?? 500;

          const hasPrompt = text.includes('❯') && text.includes('for shortcuts');
          const hasModelMenu = text.includes('to adjust') && text.includes('effort');

          // Timeout: if stuck in waitMenu phase too long, retry
          if (worker.setupPhase === 'waitMenu' && worker.setupPhaseStart) {
            const elapsed = Date.now() - worker.setupPhaseStart;
            if (elapsed > phaseTimeoutMs && !hasModelMenu) {
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
              proc.write('\x1b'); // Escape to clear any partial state
              return;
            }
          }

          if (!worker.setupPhase && hasPrompt) {
            // Phase 1: Claude Code ready, send /model
            worker.setupPhase = 'waitMenu';
            worker.setupPhaseStart = Date.now();
            proc.write('/model\r');
            return;
          }

          if (worker.setupPhase === 'waitMenu' && hasModelMenu) {
            // Phase 2: Menu rendered, send arrow keys + Enter
            worker.setupPhase = 'done';

            const levels = ['low', 'medium', 'high', 'max'];
            const defaultIdx = levels.indexOf('high');
            const targetIdx = levels.indexOf(effortLevel);
            const steps = targetIdx - defaultIdx;

            setTimeout(() => {
              if (steps > 0) {
                for (let i = 0; i < steps; i++) proc.write('\x1b[C'); // Right
              } else if (steps < 0) {
                for (let i = 0; i < Math.abs(steps); i++) proc.write('\x1b[D'); // Left
              }
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
              }, confirmDelayMs);
            }, inputDelayMs);
            return;
          }
        }

        // Send pending task after setup completes (queue auto-create flow)
        const setupComplete = worker.setupDone || !this.config.workerDefaults?.effortLevel;
        if (setupComplete && worker._pendingTask && !worker._pendingTaskSent) {
          worker._pendingTaskSent = true;
          const pt = worker._pendingTask;
          setTimeout(() => {
            this.sendTask(name, pt.task, pt.options);
            worker._pendingTask = null;
          }, 500);
          return;
        }

        // Auto-approve logic
        if (this.config.autoApprove?.enabled && this._detectPermissionPrompt(text)) {
          // Scope guard check — override autoApprove if out of scope
          if (worker.scopeGuard && worker.scopeGuard.hasRestrictions()) {
            const scopeResult = this._checkScope(worker.scopeGuard, text);
            if (scopeResult && !scopeResult.allowed) {
              // Out of scope → force deny
              const numOptions = this._countOptions(text);
              let denyKeys = '';
              for (let i = 1; i < numOptions; i++) denyKeys += '\x1b[B';
              denyKeys += '\r';

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

          const action = this._classifyPermission(text);
          const keys = this._getApproveKeystrokes(text, action);

          if (keys) {
            // Log the decision
            const promptType = this._getPromptType(text);
            const detail = promptType === 'bash'
              ? this._extractBashCommand(text)
              : this._extractFileName(text);
            worker.snapshots.push({
              time: Date.now(),
              screen: `[C4 AUTO-${action.toUpperCase()}] ${promptType}: ${detail}`,
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

        // Routine monitoring
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
        const idleMs = now - w.lastDataTime;
        if (idleMs > timeoutMs) {
          w.snapshots.push({
            time: now,
            screen: `[HEALTH] worker idle for ${Math.round(idleMs / 60000)}min (timeout: ${Math.round(timeoutMs / 60000)}min)`,
            autoAction: true
          });
          results.push({ name, status: 'timeout', idleMs });
        } else {
          results.push({ name, status: 'alive' });
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
        // Restart: re-create with same command
        const command = w.command.split(' ')[0];
        const args = w.command.split(' ').slice(1);
        const target = w.target || 'local';

        // Clean up old worker
        if (w.idleTimer) clearTimeout(w.idleTimer);
        if (w.rawLogStream && !w.rawLogStream.destroyed) w.rawLogStream.end();
        this.workers.delete(name);

        const createResult = this.create(name, command, args, { target });
        if (createResult.error) {
          results.push({ name, status: 'restart_failed', error: createResult.error });
        } else {
          results.push({ name, status: 'restarted', pid: createResult.pid });
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

    // Process task queue — worker exits may unblock queued tasks (2.2, 2.8)
    const dequeued = this._processQueue();

    return { lastCheck: now, workers: results, rotated, cleaned, dequeued, tokenUsage: tokenResult };
  }

  startHealthCheck() {
    if (this._healthTimer) return;
    const enabled = this.config.healthCheck?.enabled !== false;
    if (!enabled) return;

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
        errorCount: (w._errorHistory || []).reduce((sum, e) => sum + e.count, 0)
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

  close(name) {
    const w = this.workers.get(name);
    if (!w) return { error: `Worker '${name}' not found` };

    if (w.idleTimer) clearTimeout(w.idleTimer);
    if (w.alive) w.proc.kill();
    if (w.rawLogStream && !w.rawLogStream.destroyed) w.rawLogStream.end();

    // Cleanup worktree
    if (w.worktree) {
      const repoRoot = w.worktreeRepoRoot || this._detectRepoRoot();
      if (repoRoot) {
        this._removeWorktree(repoRoot, w.worktree);
      }
    }

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
