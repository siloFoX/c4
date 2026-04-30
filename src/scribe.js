/**
 * Scribe — Session context persistence system for C4.
 *
 * Scans Claude Code JSONL session files, extracts key messages,
 * and writes a structured summary to docs/session-context.md.
 * Survives context compaction via PostCompact hook.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

const STATE_FILENAME = 'scribe-state.json';

class Scribe {
  constructor(config = {}) {
    this.enabled = false;
    this.intervalMs = config.intervalMs || 300000; // 5 min default
    this.outputPath = config.outputPath || 'docs/session-context.md';
    this.projectId = config.projectId || '';
    this.maxEntries = config.maxEntries || 200;
    this.projectRoot = config.projectRoot || path.join(__dirname, '..');
    this._timer = null;
    this._state = { offsets: {}, entries: [] };
    this._stateFile = path.join(this.projectRoot, STATE_FILENAME);
    this._loadState();
  }

  // --- State persistence ---

  _loadState() {
    try {
      this._state = JSON.parse(fs.readFileSync(this._stateFile, 'utf8'));
      if (!this._state.offsets) this._state.offsets = {};
      if (!Array.isArray(this._state.entries)) this._state.entries = [];
    } catch {
      this._state = { offsets: {}, entries: [] };
    }
  }

  _saveState() {
    fs.writeFileSync(this._stateFile, JSON.stringify(this._state, null, 2));
  }

  // --- JSONL discovery ---

  _getProjectDir() {
    const home = os.homedir();
    const claudeProjects = path.join(home, '.claude', 'projects');

    if (this.projectId) {
      const dir = path.join(claudeProjects, this.projectId);
      return fs.existsSync(dir) ? dir : null;
    }

    // Auto-detect: find project dir matching cwd
    // Claude Code encodes paths as C--Users-silof-c4 for C:\Users\silof\c4
    if (!fs.existsSync(claudeProjects)) return null;

    const cwd = this.projectRoot.replace(/\\/g, '/');
    const entries = fs.readdirSync(claudeProjects);

    for (const entry of entries) {
      // Decode: C--Users-silof-c4 → C:/Users/silof/c4
      const decoded = entry
        .replace(/^([A-Z])--/, '$1:/')
        .replace(/-/g, '/');
      if (decoded === cwd || cwd.startsWith(decoded + '/')) {
        return path.join(claudeProjects, entry);
      }
    }

    return null;
  }

  _listSessionFiles(projectDir) {
    const files = [];
    try {
      for (const entry of fs.readdirSync(projectDir)) {
        if (entry.endsWith('.jsonl')) {
          files.push(path.join(projectDir, entry));
        }
      }
      // Also scan subagent directories
      for (const entry of fs.readdirSync(projectDir)) {
        const sub = path.join(projectDir, entry, 'subagents');
        if (fs.existsSync(sub) && fs.statSync(sub).isDirectory()) {
          for (const subFile of fs.readdirSync(sub)) {
            if (subFile.endsWith('.jsonl')) {
              files.push(path.join(sub, subFile));
            }
          }
        }
      }
    } catch {}
    return files;
  }

  // --- JSONL parsing ---

  _parseNewMessages(filePath) {
    const offset = this._state.offsets[filePath] || 0;
    let content;
    try {
      content = fs.readFileSync(filePath, 'utf8');
    } catch {
      return [];
    }

    const lines = content.split('\n');
    if (offset >= lines.length) return [];

    const messages = [];
    for (let i = offset; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;
      try {
        const obj = JSON.parse(line);
        messages.push(obj);
      } catch {}
    }

    this._state.offsets[filePath] = lines.length;
    return messages;
  }

  // --- Content extraction ---

  _extractUserText(msg) {
    const content = msg.message?.content;
    if (!content) return null;

    if (typeof content === 'string') {
      // Skip meta/command messages
      if (msg.isMeta) return null;
      if (content.includes('<local-command-caveat>')) return null;
      if (content.includes('<command-name>')) return null;
      if (content.includes('<local-command-stdout>')) return null;
      return content.length > 10 ? content : null;
    }

    if (Array.isArray(content)) {
      // Tool results — skip (too noisy)
      const hasToolResult = content.some(b => b.type === 'tool_result');
      if (hasToolResult) return null;

      // Text blocks
      const texts = content
        .filter(b => b.type === 'text' && b.text)
        .map(b => b.text);
      const combined = texts.join('\n').trim();
      return combined.length > 10 ? combined : null;
    }

    return null;
  }

  _extractAssistantText(msg) {
    const content = msg.message?.content;
    if (!Array.isArray(content)) return null;

    const parts = [];

    for (const block of content) {
      if (block.type === 'text' && block.text) {
        parts.push(block.text);
      }
    }

    const combined = parts.join('\n').trim();
    return combined.length > 20 ? combined : null;
  }

  _extractToolUses(msg) {
    const content = msg.message?.content;
    if (!Array.isArray(content)) return [];

    return content
      .filter(b => b.type === 'tool_use')
      .map(b => ({
        tool: b.name,
        input: b.input || {}
      }));
  }

  // --- Classification ---

  _classifyContent(text) {
    if (!text) return null;
    const lower = text.toLowerCase();

    // Korean + English keyword detection
    const patterns = {
      decision: [
        /로\s*하기로/, /방향으로/, /으로\s*결정/, /으로\s*가자/,
        /decided\s+to/, /let's\s+go\s+with/, /approach:/i,
        /설계/, /아키텍처/, /architecture/i
      ],
      error: [
        /에러/, /실패/, /error/i, /fail/i, /exception/i,
        /bug/i, /broken/i, /crash/i, /깨[지짐]/
      ],
      fix: [
        /해결/, /수정/, /고[쳤침]/, /fix/i, /resolve/i, /patch/i,
        /workaround/i
      ],
      todo: [
        /TODO/i, /todo\s*변경/, /추가.*항목/, /새로.*작업/,
        /phase\s*\d/i, /backlog/i
      ],
      intent: [
        /해줘/, /해주세요/, /하고\s*싶/, /원하는/,
        /please/i, /want\s+to/i, /need\s+to/i, /should/i
      ],
      progress: [
        /완료/, /done/i, /완성/, /finish/i, /implement/i,
        /구현/, /작업\s*중/, /진행/
      ]
    };

    for (const [category, regexes] of Object.entries(patterns)) {
      for (const re of regexes) {
        if (re.test(text)) return category;
      }
    }

    return null;
  }

  // --- Core scan ---

  scan() {
    const projectDir = this._getProjectDir();
    if (!projectDir) {
      return { error: 'Project directory not found', scanned: 0, newEntries: 0 };
    }

    const sessionFiles = this._listSessionFiles(projectDir);
    let newEntries = 0;

    for (const filePath of sessionFiles) {
      const messages = this._parseNewMessages(filePath);
      const sessionId = path.basename(filePath, '.jsonl');

      for (const msg of messages) {
        if (msg.type === 'user') {
          const text = this._extractUserText(msg);
          if (text) {
            const category = this._classifyContent(text);
            if (category || text.length > 50) {
              this._state.entries.push({
                time: msg.timestamp || new Date().toISOString(),
                session: sessionId.substring(0, 8),
                role: 'user',
                category: category || 'context',
                text: this._truncate(text, 500)
              });
              newEntries++;
            }
          }
        }

        if (msg.type === 'assistant') {
          const text = this._extractAssistantText(msg);
          if (text) {
            const category = this._classifyContent(text);
            if (category) {
              this._state.entries.push({
                time: msg.timestamp || new Date().toISOString(),
                session: sessionId.substring(0, 8),
                role: 'assistant',
                category,
                text: this._truncate(text, 500)
              });
              newEntries++;
            }
          }

          // Track significant tool uses (file writes, edits, commits, tests)
          const tools = this._extractToolUses(msg);
          for (const t of tools) {
            if (['Write', 'Edit'].includes(t.tool)) {
              const filePath = t.input.file_path || t.input.path || '';
              this._state.entries.push({
                time: msg.timestamp || new Date().toISOString(),
                session: sessionId.substring(0, 8),
                role: 'tool',
                category: 'progress',
                text: `${t.tool}: ${this._shortenPath(filePath)}`
              });
              newEntries++;
            } else if (t.tool === 'Bash') {
              // Capture commits, push, test runs, build commands.
              const cmd = String(t.input.command || '');
              if (/(?:^|\s)(git\s+(commit|push|merge|reset|tag)|npm\s+(test|run|publish)|cargo\s+(test|build)|pytest|poetry\s+run|make\b)/i.test(cmd)) {
                this._state.entries.push({
                  time: msg.timestamp || new Date().toISOString(),
                  session: sessionId.substring(0, 8),
                  role: 'tool',
                  category: /commit|push|merge|tag/i.test(cmd) ? 'milestone' : 'progress',
                  text: `Bash: ${cmd.slice(0, 200)}`,
                });
                newEntries++;
              }
            } else if (t.tool === 'TaskCreate' || t.tool === 'TaskUpdate') {
              this._state.entries.push({
                time: msg.timestamp || new Date().toISOString(),
                session: sessionId.substring(0, 8),
                role: 'tool',
                category: 'progress',
                text: `${t.tool}: ${(t.input.subject || t.input.description || '').slice(0, 150)}`,
              });
              newEntries++;
            } else if (t.tool === 'Agent') {
              this._state.entries.push({
                time: msg.timestamp || new Date().toISOString(),
                session: sessionId.substring(0, 8),
                role: 'tool',
                category: 'progress',
                text: `Subagent (${t.input.subagent_type || 'general'}): ${(t.input.description || '').slice(0, 150)}`,
              });
              newEntries++;
            }
          }
        }

        // (TODO scribe 확장) Track system / error / compact-event messages.
        if (msg.type === 'system') {
          const text = (msg.content || '').toString().slice(0, 300);
          if (text) {
            this._state.entries.push({
              time: msg.timestamp || new Date().toISOString(),
              session: sessionId.substring(0, 8),
              role: 'system',
              category: /compact|summariz/i.test(text) ? 'milestone' : 'context',
              text,
            });
            newEntries++;
          }
        } else if (msg.type === 'error') {
          this._state.entries.push({
            time: msg.timestamp || new Date().toISOString(),
            session: sessionId.substring(0, 8),
            role: 'system',
            category: 'error',
            text: (msg.error || msg.message || JSON.stringify(msg).slice(0, 300)).toString().slice(0, 300),
          });
          newEntries++;
        }
      }
    }

    // Trim old entries
    if (this._state.entries.length > this.maxEntries) {
      this._state.entries = this._state.entries.slice(-this.maxEntries);
    }

    this._saveState();

    if (newEntries > 0) {
      this._writeOutput();

      // Send file edit summary to Slack
      if (this._notifications) {
        const recent = this._state.entries.slice(-newEntries);
        const toolActions = recent.filter(e => e.role === 'tool');
        if (toolActions.length > 0) {
          this._notifications.notifyEdits(newEntries, toolActions);
        }
      }
    }

    return { scanned: sessionFiles.length, newEntries, totalEntries: this._state.entries.length };
  }

  // --- Output generation ---

  _writeOutput() {
    const outputFile = path.isAbsolute(this.outputPath)
      ? this.outputPath
      : path.join(this.projectRoot, this.outputPath);

    const dir = path.dirname(outputFile);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    const grouped = {};
    for (const entry of this._state.entries) {
      if (!grouped[entry.category]) grouped[entry.category] = [];
      grouped[entry.category].push(entry);
    }

    const categoryLabels = {
      decision: '설계 결정 (Design Decisions)',
      error: '에러 (Errors)',
      fix: '수정 (Fixes)',
      todo: 'TODO 변경',
      intent: '사용자 의도 (User Intent)',
      progress: '작업 진행 (Progress)',
      context: '기타 맥락 (Context)'
    };

    const categoryOrder = ['intent', 'decision', 'progress', 'error', 'fix', 'todo', 'context'];

    let md = '# Session Context\n\n';
    md += `> Auto-generated by C4 Scribe at ${new Date().toISOString()}\n`;
    md += `> ${this._state.entries.length} entries from ${Object.keys(this._state.offsets).length} session files\n\n`;

    for (const cat of categoryOrder) {
      const entries = grouped[cat];
      if (!entries || entries.length === 0) continue;

      md += `## ${categoryLabels[cat] || cat}\n\n`;

      // Show most recent entries first, limit per category
      const recent = entries.slice(-20).reverse();
      for (const e of recent) {
        const timeStr = this._formatTime(e.time);
        const roleIcon = e.role === 'user' ? '👤' : e.role === 'tool' ? '🔧' : '🤖';
        const text = e.text.replace(/\n/g, ' ').substring(0, 200);
        md += `- ${roleIcon} \`${timeStr}\` [${e.session}] ${text}\n`;
      }
      md += '\n';
    }

    fs.writeFileSync(outputFile, md, 'utf8');
  }

  // --- Timer control ---

  start() {
    if (this._timer) return { error: 'Scribe already running' };
    this.enabled = true;

    // Run initial scan
    const result = this.scan();

    // Start periodic scanning
    this._timer = setInterval(() => {
      try { this.scan(); } catch (e) {
        console.error('[SCRIBE] scan error:', e.message);
      }
    }, this.intervalMs);

    return { success: true, ...result };
  }

  stop() {
    if (!this._timer) return { error: 'Scribe not running' };
    clearInterval(this._timer);
    this._timer = null;
    this.enabled = false;
    return { success: true };
  }

  status() {
    return {
      enabled: this.enabled,
      running: !!this._timer,
      intervalMs: this.intervalMs,
      outputPath: this.outputPath,
      projectId: this.projectId,
      totalEntries: this._state.entries.length,
      trackedFiles: Object.keys(this._state.offsets).length
    };
  }

  // --- Utilities ---

  _truncate(text, maxLen) {
    if (text.length <= maxLen) return text;
    return text.substring(0, maxLen) + '…';
  }

  _shortenPath(filePath) {
    if (!filePath) return '(unknown)';
    // Show last 2 segments
    const parts = filePath.replace(/\\/g, '/').split('/');
    return parts.length > 2 ? '…/' + parts.slice(-2).join('/') : filePath;
  }

  _formatTime(timestamp) {
    if (!timestamp) return '??:??';
    try {
      const d = new Date(timestamp);
      const mm = String(d.getMonth() + 1).padStart(2, '0');
      const dd = String(d.getDate()).padStart(2, '0');
      const hh = String(d.getHours()).padStart(2, '0');
      const min = String(d.getMinutes()).padStart(2, '0');
      return `${mm}-${dd} ${hh}:${min}`;
    } catch {
      return '??:??';
    }
  }
}

module.exports = Scribe;
