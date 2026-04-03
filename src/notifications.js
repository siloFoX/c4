// Notification system (4.10): Slack webhook (periodic) + Email (event-based)
// Slack: Node.js built-in https — no external dependency
// Email: nodemailer (optional soft dependency — npm install nodemailer to enable)

const https = require('https');
const http = require('http');

// --- i18n templates ---

const LANG = {
  ko: {
    done: '완료',
    error: '오류',
    down: '중단',
    idle: '대기',
    running: '진행중',
    elapsed: (m) => `${m}분`,
    edits: (n, files) => `${n}개 파일 수정: ${files}`,
    workersDown: (n) => `${n}개 워커 중단`,
  },
  en: {
    done: 'done',
    error: 'ERROR',
    down: 'down',
    idle: 'idle',
    running: 'running',
    elapsed: (m) => `${m}min`,
    edits: (n, files) => `${n} edits: ${files}`,
    workersDown: (n) => `${n} workers down`,
  }
};

class Notifications {
  constructor(config = {}) {
    this.config = config;
    this.slack = config.slack || {};
    this.email = config.email || {};
    this.lang = LANG[config.language || 'ko'] || LANG.ko;
    this._slackBuffer = [];
    this._slackTimer = null;
    this._transporter = null;

    this._initEmail();
  }

  _time() {
    return new Date().toLocaleTimeString(
      this.config.language === 'en' ? 'en-US' : 'ko-KR',
      { hour: '2-digit', minute: '2-digit' }
    );
  }

  _initEmail() {
    this._transporter = null;
    if (!this.email.enabled) return;
    try {
      const nodemailer = require('nodemailer');
      this._transporter = nodemailer.createTransport(this.email.smtp || {});
    } catch {
      // nodemailer not installed — email notifications disabled
    }
  }

  // --- Slack (periodic) ---

  pushSlack(message) {
    if (!this.slack.enabled || !this.slack.webhookUrl) return;
    this._slackBuffer.push({ text: message, ts: Date.now() });
  }

  async _flushSlack() {
    if (this._slackBuffer.length === 0) return { sent: false };
    const messages = this._slackBuffer.splice(0);
    const text = messages.map(m => m.text).join('\n---\n');
    return this._postWebhook(this.slack.webhookUrl, { text });
  }

  _postWebhook(url, payload) {
    return new Promise((resolve) => {
      try {
        const parsed = new URL(url);
        const lib = parsed.protocol === 'https:' ? https : http;
        const data = JSON.stringify(payload);
        const req = lib.request({
          hostname: parsed.hostname,
          port: parsed.port,
          path: parsed.pathname + parsed.search,
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(data)
          }
        }, (res) => {
          res.resume();
          resolve({ ok: res.statusCode < 300, status: res.statusCode });
        });
        req.on('error', (e) => resolve({ ok: false, error: e.message }));
        req.write(data);
        req.end();
      } catch (e) {
        resolve({ ok: false, error: e.message });
      }
    });
  }

  startPeriodicSlack() {
    if (this._slackTimer) return;
    if (!this.slack.enabled || !this.slack.webhookUrl) return;
    const intervalMs = this.slack.intervalMs || 300000;
    this._slackTimer = setInterval(() => this._flushSlack(), intervalMs);
  }

  stopPeriodicSlack() {
    if (this._slackTimer) {
      clearInterval(this._slackTimer);
      this._slackTimer = null;
    }
  }

  // --- Email (event-based) ---

  async sendEmail(subject, body) {
    if (!this.email.enabled || !this._transporter) {
      return { sent: false, reason: 'email not configured' };
    }
    try {
      await this._transporter.sendMail({
        from: this.email.from,
        to: this.email.to,
        subject,
        text: body
      });
      return { sent: true };
    } catch (e) {
      return { sent: false, error: e.message };
    }
  }

  // --- Event handlers (unified format) ---

  async notifyTaskComplete(workerName, details = {}) {
    if (this.slack.alertOnly) return { slack: 'skipped(alertOnly)', email: { sent: false } };
    const t = this._time();
    const branch = details.branch ? `${details.branch}` : '';
    const lines = [`${t} ${workerName} ${this.lang.done}`];
    if (branch) lines.push(`  branch: ${branch}`);
    if (details.lastCommit) lines.push(`  commit: ${details.lastCommit}`);
    if (details.task) {
      const shortTask = details.task.split(/[.\n]/)[0].substring(0, 100);
      lines.push(`  task: ${shortTask}`);
    }
    this.pushSlack(lines.join('\n'));

    const emailResult = await this.sendEmail(
      `C4: ${workerName} ${this.lang.done}`,
      lines.join('\n')
    );
    return { slack: 'buffered', email: emailResult };
  }

  async notifyError(workerName, error, details = {}) {
    const t = this._time();
    const msg = typeof error === 'string' ? error.substring(0, 200) : String(error);
    const lines = [`${t} ${workerName} ${this.lang.error}`];
    lines.push(`  ${msg}`);
    if (details.task) {
      lines.push(`  task: ${details.task.split(/[.\n]/)[0].substring(0, 80)}`);
    }
    this.pushSlack(lines.join('\n'));
  }

  async notifyHealthCheck(results) {
    if (this.slack.alertOnly) return;
    const workers = results.workers || [];
    const alive = workers.filter(w => w.status === 'alive');
    const dead = workers.filter(w => w.status === 'exited' || w.status === 'timeout');
    const t = this._time();

    if (dead.length > 0) {
      const lines = [
        ...dead.map(w => `  ${w.name} - ${this.lang.down}`),
        ...alive.map(w => this._fmtWorker(w))
      ];
      this.pushSlack(`${t} ${this.lang.workersDown(dead.length)}\n${lines.join('\n')}`);
    } else if (workers.length > 0) {
      const lines = alive.map(w => this._fmtWorker(w));
      this.pushSlack(`${t}\n${lines.join('\n')}`);
    } else {
      // Heartbeat — 워커 없어도 데몬 살아있다는 신호
      this.pushSlack(`${t} daemon OK`);
    }
  }

  // Stall alert: immediate Slack webhook (not buffered)
  async notifyStall(workerName, reason) {
    if (!this.slack.enabled || !this.slack.webhookUrl) {
      return { sent: false, reason: 'slack not configured' };
    }
    const t = this._time();
    const text = `[STALL] ${t} ${workerName}: ${reason}`;
    return this._postWebhook(this.slack.webhookUrl, { text });
  }

  // Worker가 직접 보내는 상태 메시지
  statusUpdate(workerName, message) {
    if (this.slack.alertOnly) return;
    const t = this._time();
    this.pushSlack(`${t} ${workerName}: ${message}`);
  }

  // Scribe가 보내는 파일 수정 요약
  notifyEdits(totalNew, toolActions) {
    if (this.slack.alertOnly) return;
    if (toolActions.length === 0) return;
    const t = this._time();
    const files = toolActions.map(e => e.text).join(', ');
    const short = files.length > 120 ? files.substring(0, 120) + '...' : files;
    this.pushSlack(`${t} ${this.lang.edits(toolActions.length, short)}`);
  }

  _fmtWorker(w) {
    if (!w.task) {
      return `  ${w.name} - ${this.lang.idle}`;
    }
    const elapsed = w.taskStarted
      ? Math.round((Date.now() - new Date(w.taskStarted).getTime()) / 60000)
      : 0;
    const elStr = elapsed > 0 ? ` ${this.lang.elapsed(elapsed)}` : '';

    // Show what the worker is actually doing, not the original task text
    const activity = w.lastActivity || '';
    if (activity) {
      return `  ${w.name}${elStr} - ${activity}`;
    }

    // Fallback to task description
    const shortTask = w.task.split(/[.\n]/)[0].substring(0, 80);
    return `  ${w.name}${elStr} - ${shortTask}`;
  }

  // Called from daemon healthCheck timer — flushes Slack buffer
  async tick() {
    const results = {};
    if (this.slack.enabled) {
      results.slack = await this._flushSlack();
    }
    return results;
  }

  reload(config = {}) {
    this.stopPeriodicSlack();
    this.config = config;
    this.slack = config.slack || {};
    this.email = config.email || {};
    this.lang = LANG[config.language || 'ko'] || LANG.ko;
    this._slackBuffer = [];
    this._initEmail();
  }
}

module.exports = Notifications;
