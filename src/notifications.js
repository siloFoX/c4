// Notification system (4.12): Plugin-based multi-channel notifications
// Channels: Slack, Discord, Telegram, KakaoWork
// Slack/Discord/KakaoWork: webhook POST. Telegram: Bot API POST
// Email: nodemailer (optional soft dependency)
// All webhook channels use Node.js built-in http/https — no external dependency

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
    restarted: '재시작됨',
    restartFailed: '재시작 실패',
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
    restarted: 'restarted',
    restartFailed: 'restart failed',
    elapsed: (m) => `${m}min`,
    edits: (n, files) => `${n} edits: ${files}`,
    workersDown: (n) => `${n} workers down`,
  }
};

// --- Channel base class ---

class Channel {
  constructor(config) {
    this.config = config;
    this._buffer = [];
    this._timer = null;
  }

  /** Buffer a message for periodic flush */
  push(message) {
    this._buffer.push({ text: message, ts: Date.now() });
  }

  /** Flush buffered messages — subclass must implement _send(text) */
  async flush() {
    if (this._buffer.length === 0) return { sent: false };
    const messages = this._buffer.splice(0);
    const text = messages.map(m => m.text).join('\n---\n');
    return this._send(text);
  }

  /** Send a message immediately (unbuffered) */
  async sendImmediate(message) {
    return this._send(message);
  }

  /** Start periodic flush timer */
  start(intervalMs) {
    if (this._timer) return;
    this._timer = setInterval(() => this.flush(), intervalMs || 300000);
  }

  /** Stop periodic flush timer */
  stop() {
    if (this._timer) {
      clearInterval(this._timer);
      this._timer = null;
    }
  }

  /** Subclass must override: send text to the channel endpoint */
  async _send(text) {
    throw new Error('Channel._send() not implemented');
  }
}

// --- Slack Channel ---

class SlackChannel extends Channel {
  async _send(text) {
    return _postWebhook(this.config.webhookUrl, { text });
  }
}

// --- Discord Channel (2000 char limit) ---

class DiscordChannel extends Channel {
  async _send(text) {
    const content = text.length > 2000 ? text.substring(0, 1997) + '...' : text;
    return _postWebhook(this.config.webhookUrl, { content });
  }
}

// --- Telegram Channel (Bot API) ---

class TelegramChannel extends Channel {
  async _send(text) {
    const url = `https://api.telegram.org/bot${this.config.botToken}/sendMessage`;
    return _postWebhook(url, {
      chat_id: this.config.chatId,
      text,
      parse_mode: 'Markdown'
    });
  }
}

// --- KakaoWork Channel (Incoming Webhook) ---

class KakaoWorkChannel extends Channel {
  async _send(text) {
    return _postWebhook(this.config.webhookUrl, { text });
  }
}

// --- Shared webhook utility (module-level) ---

function _postWebhook(url, payload) {
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

// --- Channel registry ---

const CHANNEL_TYPES = {
  slack: SlackChannel,
  discord: DiscordChannel,
  telegram: TelegramChannel,
  kakaowork: KakaoWorkChannel,
};

// --- Notifications class ---

class Notifications {
  constructor(config = {}) {
    this.config = config;
    this.slack = config.slack || {};
    this.email = config.email || {};
    this.lang = LANG[config.language || 'ko'] || LANG.ko;
    this.channels = {};

    // Backward compat: expose slack buffer reference
    this._slackBuffer = [];
    this._slackTimer = null;
    this._transporter = null;

    this._initChannels();
    this._initEmail();
  }

  _initChannels() {
    this.channels = {};

    // Slack channel (from legacy config.slack)
    if (this.slack.enabled && this.slack.webhookUrl) {
      const ch = new SlackChannel(this.slack);
      this.channels.slack = ch;
      // Backward compat: share buffer reference
      this._slackBuffer = ch._buffer;
    }

    // New channels from config
    for (const [name, ChannelClass] of Object.entries(CHANNEL_TYPES)) {
      if (name === 'slack') continue; // already handled above
      const chConfig = this.config[name];
      if (chConfig && chConfig.enabled) {
        this.channels[name] = new ChannelClass(chConfig);
      }
    }
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

  // --- Push to all channels (buffered) ---

  pushAll(message) {
    const msg = message.length > 2000 ? message.substring(0, 1997) + '...' : message;
    for (const ch of Object.values(this.channels)) {
      ch.push(msg);
    }
  }

  /** @deprecated Use pushAll(). Kept for backward compatibility. */
  pushSlack(message) {
    this.pushAll(message);
  }

  // --- Flush all channels ---

  async _flushAll() {
    const results = {};
    for (const [name, ch] of Object.entries(this.channels)) {
      results[name] = await ch.flush();
    }
    return results;
  }

  /** @deprecated Use _flushAll(). Kept for backward compatibility. */
  async _flushSlack() {
    return this._flushAll();
  }

  // --- Webhook utility (instance method for backward compat) ---

  _postWebhook(url, payload) {
    return _postWebhook(url, payload);
  }

  // --- Periodic flush ---

  startAll() {
    const intervalMs = this.slack.intervalMs || 300000;
    for (const ch of Object.values(this.channels)) {
      ch.start(intervalMs);
    }
    // Backward compat timer reference
    if (this.channels.slack) {
      this._slackTimer = this.channels.slack._timer;
    }
  }

  stopAll() {
    for (const ch of Object.values(this.channels)) {
      ch.stop();
    }
    this._slackTimer = null;
  }

  /** @deprecated Use startAll(). Kept for backward compatibility. */
  startPeriodicSlack() {
    this.startAll();
  }

  /** @deprecated Use stopAll(). Kept for backward compatibility. */
  stopPeriodicSlack() {
    this.stopAll();
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
    const t = this._time();
    const branch = details.branch ? `${details.branch}` : '';
    const lines = [`${t} ${workerName} ${this.lang.done}`];
    if (branch) lines.push(`  branch: ${branch}`);
    if (details.lastCommit) lines.push(`  commit: ${details.lastCommit}`);
    if (details.task) {
      const shortTask = details.task.split('\n')[0].substring(0, 100);
      lines.push(`  task: ${shortTask}`);
    }
    this.pushAll(lines.join('\n'));

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
      lines.push(`  task: ${details.task.split('\n')[0].substring(0, 80)}`);
    }
    this.pushAll(lines.join('\n'));
  }

  async notifyHealthCheck(results) {
    if (this.slack.alertOnly) return;
    const workers = results.workers || [];
    const alive = workers.filter(w => w.status === 'alive' || w.status === 'restarted');
    const dead = workers.filter(w => w.status === 'exited' || w.status === 'timeout' || w.status === 'restart_failed');
    const t = this._time();

    if (dead.length > 0) {
      const lines = [
        ...dead.map(w => {
          const label = w.status === 'restart_failed' ? this.lang.restartFailed : this.lang.down;
          const taskInfo = w.task ? ` (${w.task.split('\n')[0].substring(0, 80)})` : '';
          return `  ${w.name} - ${label}${taskInfo}`;
        }),
        ...alive.map(w => this._fmtWorker(w))
      ];
      this.pushAll(`${t} ${this.lang.workersDown(dead.length)}\n${lines.join('\n')}`);
    } else if (workers.length > 0) {
      const lines = alive.map(w => this._fmtWorker(w));
      this.pushAll(`${t}\n${lines.join('\n')}`);
    }
  }

  // Stall alert: immediate send to ALL channels (not buffered)
  async notifyStall(workerName, reason) {
    const channelNames = Object.keys(this.channels);
    if (channelNames.length === 0) {
      return { sent: false, reason: 'no channels configured' };
    }
    const t = this._time();
    const text = `[STALL] ${t} ${workerName}: ${reason}`;
    const results = {};
    for (const [name, ch] of Object.entries(this.channels)) {
      results[name] = await ch.sendImmediate(text);
    }
    return results;
  }

  statusUpdate(workerName, message) {
    if (this.slack.alertOnly) return;
    const t = this._time();
    this.pushAll(`${t} ${workerName}: ${message}`);
  }

  notifyEdits(totalNew, toolActions) {
    if (this.slack.alertOnly) return;
    if (toolActions.length === 0) return;
    const t = this._time();
    const files = toolActions.map(e => e.text).join(', ');
    const short = files.length > 120 ? files.substring(0, 120) + '...' : files;
    this.pushAll(`${t} ${this.lang.edits(toolActions.length, short)}`);
  }

  _fmtWorker(w) {
    if (!w.task) {
      return `  ${w.name} - ${this.lang.idle}`;
    }
    const elapsed = w.taskStarted
      ? Math.round((Date.now() - new Date(w.taskStarted).getTime()) / 60000)
      : 0;
    const elStr = elapsed > 0 ? ` ${this.lang.elapsed(elapsed)}` : '';

    const shortTask = w.task.split('\n')[0].substring(0, 80);
    const activity = w.lastActivity || '';
    if (activity) {
      return `  ${w.name}${elStr} - ${shortTask} | ${activity}`;
    }

    return `  ${w.name}${elStr} - ${shortTask}`;
  }

  // Called from daemon healthCheck timer — flushes all channel buffers
  async tick() {
    const results = {};
    const channelResults = await this._flushAll();
    for (const [name, res] of Object.entries(channelResults)) {
      results[name] = res;
    }
    return results;
  }

  reload(config = {}) {
    this.stopAll();
    this.config = config;
    this.slack = config.slack || {};
    this.email = config.email || {};
    this.lang = LANG[config.language || 'ko'] || LANG.ko;
    this._slackBuffer = [];
    this._initChannels();
    this._initEmail();
  }
}

// Export channel classes for testing
Notifications.Channel = Channel;
Notifications.SlackChannel = SlackChannel;
Notifications.DiscordChannel = DiscordChannel;
Notifications.TelegramChannel = TelegramChannel;
Notifications.KakaoWorkChannel = KakaoWorkChannel;
Notifications.CHANNEL_TYPES = CHANNEL_TYPES;

module.exports = Notifications;
