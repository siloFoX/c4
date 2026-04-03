// Notification system (4.10): Slack webhook (periodic) + Email (event-based)
// Slack: Node.js built-in https — no external dependency
// Email: nodemailer (optional soft dependency — npm install nodemailer to enable)

const https = require('https');
const http = require('http');

class Notifications {
  constructor(config = {}) {
    this.config = config;
    this.slack = config.slack || {};
    this.email = config.email || {};
    this._slackBuffer = [];
    this._slackTimer = null;
    this._transporter = null;

    this._initEmail();
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

  // --- Event handlers ---

  async notifyTaskComplete(workerName, details = {}) {
    const time = new Date().toISOString();
    const summary = `[C4] Worker '${workerName}' completed (${time})`;

    // Slack: buffer for periodic flush
    this.pushSlack(summary);

    // Email: send immediately
    const emailResult = await this.sendEmail(
      `[C4] Task Complete: ${workerName}`,
      [
        `Worker: ${workerName}`,
        `Time: ${time}`,
        details.branch ? `Branch: ${details.branch}` : null,
        details.exitCode !== undefined ? `Exit code: ${details.exitCode}` : null,
      ].filter(Boolean).join('\n')
    );

    return { slack: 'buffered', email: emailResult };
  }

  async notifyError(workerName, error) {
    const time = new Date().toISOString();
    this.pushSlack(`[C4 ERROR] Worker '${workerName}': ${error} (${time})`);
  }

  async notifyHealthCheck(results) {
    const dead = results.workers?.filter(w => w.status === 'exited' || w.status === 'timeout') || [];
    if (dead.length === 0) return;
    const lines = dead.map(w => `  - ${w.name}: ${w.status}`);
    this.pushSlack(`[C4 HEALTH] Issues detected:\n${lines.join('\n')}`);
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
    this._slackBuffer = [];
    this._initEmail();
  }
}

module.exports = Notifications;
