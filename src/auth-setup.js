'use strict';

// Session auth provisioning helpers for `c4 init` (TODO 8.14).
//
// Responsibilities:
//   - load/save config.json while preserving other keys
//   - read a password from a file (non-interactive) or stdin (interactive)
//   - bcrypt-hash the password and store only the hash in
//     config.auth.users[<name>].passwordHash
//   - never modify the source password file
//   - generate config.auth.secret on first run
//
// Kept separate from src/auth.js so the HTTP middleware stays free of
// filesystem / stdin concerns.

const fs = require('fs');
const path = require('path');
const readline = require('readline');
const auth = require('./auth');

function loadConfig(configPath) {
  try {
    return JSON.parse(fs.readFileSync(configPath, 'utf8'));
  } catch {
    return {};
  }
}

function saveConfig(configPath, cfg) {
  fs.writeFileSync(configPath, JSON.stringify(cfg, null, 2) + '\n');
}

function ensureAuthSection(cfg) {
  if (!cfg.auth || typeof cfg.auth !== 'object') cfg.auth = {};
  if (typeof cfg.auth.enabled !== 'boolean') cfg.auth.enabled = true;
  if (!cfg.auth.secret || typeof cfg.auth.secret !== 'string') {
    cfg.auth.secret = auth.generateSecret();
  }
  if (!cfg.auth.users || typeof cfg.auth.users !== 'object') cfg.auth.users = {};
  return cfg;
}

function readPasswordFile(filePath) {
  if (!filePath) throw new Error('password-file path is empty');
  const resolved = path.resolve(filePath);
  if (!fs.existsSync(resolved)) throw new Error(`password file not found: ${resolved}`);
  const raw = fs.readFileSync(resolved, 'utf8');
  // Strip trailing newlines / CR so editors that add them do not alter the hash.
  const cleaned = raw.replace(/\r?\n+$/, '');
  if (!cleaned) throw new Error(`password file is empty: ${resolved}`);
  return cleaned;
}

function promptLine(question, { silent = false } = {}) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    if (silent) {
      // Minimal silent-input: swallow keystrokes so the password does not echo.
      // Falls back to visible input if the TTY cannot be muted.
      const stdin = process.stdin;
      const onData = (ch) => {
        const s = ch.toString('utf8');
        if (s === '\n' || s === '\r' || s === '\r\n' || s === '\u0004') {
          process.stdout.write('\n');
          stdin.removeListener('data', onData);
        }
      };
      const origWrite = process.stdout.write.bind(process.stdout);
      process.stdout.write = (chunk, encoding, cb) => {
        if (typeof chunk === 'string' && chunk === question) {
          return origWrite(chunk, encoding, cb);
        }
        return origWrite('', encoding, cb);
      };
      stdin.on('data', onData);
      rl.question(question, (answer) => {
        process.stdout.write = origWrite;
        rl.close();
        resolve(answer);
      });
      return;
    }
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer);
    });
  });
}

async function resolveCredentials({ user, passwordFile, interactive }) {
  if (user && passwordFile) {
    return { user, password: readPasswordFile(passwordFile), source: 'flags' };
  }
  if (user || passwordFile) {
    throw new Error('--user and --password-file must be provided together');
  }
  if (!interactive) {
    return null; // caller decides whether to skip
  }
  const promptedUser = (await promptLine('C4 auth user: ')).trim();
  if (!promptedUser) throw new Error('user is required');
  const promptedPw = await promptLine('C4 auth password: ', { silent: true });
  if (!promptedPw) throw new Error('password is required');
  return { user: promptedUser, password: promptedPw, source: 'prompt' };
}

async function provisionAuth(options) {
  const {
    configPath,
    user,
    passwordFile,
    interactive = false,
    overwrite = false,
  } = options || {};

  if (!configPath) return { status: 'error', error: 'configPath is required' };
  if (!fs.existsSync(configPath)) {
    return { status: 'error', error: `config not found: ${configPath}` };
  }

  let creds;
  try {
    creds = await resolveCredentials({ user, passwordFile, interactive });
  } catch (e) {
    return { status: 'error', error: e.message };
  }
  if (!creds) return { status: 'skipped-no-args' };

  const cfg = ensureAuthSection(loadConfig(configPath));

  if (!overwrite && cfg.auth.users[creds.user] && cfg.auth.users[creds.user].passwordHash) {
    // Preserve existing hash unless caller explicitly opts into overwrite.
    return { status: 'skipped-exists', user: creds.user };
  }

  const hash = auth.hashPassword(creds.password);
  cfg.auth.users[creds.user] = { passwordHash: hash };
  saveConfig(configPath, cfg);

  return { status: 'updated', user: creds.user };
}

module.exports = {
  loadConfig,
  saveConfig,
  ensureAuthSection,
  readPasswordFile,
  resolveCredentials,
  provisionAuth,
};
