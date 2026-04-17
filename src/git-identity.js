'use strict';

// Git identity helpers for `c4 init` (7.25).
//
// c4 merge invokes git merge which requires user.name and user.email. On fresh
// systems neither is set, so automated runs halted when permission prompts
// appeared for GIT_AUTHOR_NAME=... workarounds. `c4 init` now checks and
// (interactively) sets these globally; daemon and merge commands surface
// clear errors instead of silently failing mid-merge.

const { spawnSync } = require('child_process');

function runGit(args, { spawn = spawnSync } = {}) {
  return spawn('git', args, { encoding: 'utf8', timeout: 5000 });
}

function getIdentity({ spawn = spawnSync } = {}) {
  const nameRes = runGit(['config', '--get', 'user.name'], { spawn });
  const emailRes = runGit(['config', '--get', 'user.email'], { spawn });
  const name =
    nameRes && nameRes.status === 0 ? String(nameRes.stdout || '').trim() : '';
  const email =
    emailRes && emailRes.status === 0
      ? String(emailRes.stdout || '').trim()
      : '';
  return { name, email };
}

function identityComplete(opts = {}) {
  const { name, email } = getIdentity(opts);
  return Boolean(name) && Boolean(email);
}

function missingIdentityKeys(opts = {}) {
  const { name, email } = getIdentity(opts);
  const missing = [];
  if (!name) missing.push('user.name');
  if (!email) missing.push('user.email');
  return missing;
}

function setGlobalIdentity({ name, email, spawn = spawnSync } = {}) {
  const applied = {};
  if (name) {
    const res = runGit(['config', '--global', 'user.name', name], { spawn });
    if (!res || res.status !== 0) {
      throw new Error(
        `git config user.name failed: ${
          (res && res.stderr ? String(res.stderr).trim() : '') || 'unknown error'
        }`
      );
    }
    applied.name = name;
  }
  if (email) {
    const res = runGit(['config', '--global', 'user.email', email], { spawn });
    if (!res || res.status !== 0) {
      throw new Error(
        `git config user.email failed: ${
          (res && res.stderr ? String(res.stderr).trim() : '') || 'unknown error'
        }`
      );
    }
    applied.email = email;
  }
  return applied;
}

function promptIdentity({
  readlineImpl = require('readline'),
  input = process.stdin,
  output = process.stdout,
  missing = ['user.name', 'user.email'],
} = {}) {
  return new Promise((resolve, reject) => {
    let rl;
    try {
      rl = readlineImpl.createInterface({ input, output });
    } catch (e) {
      reject(e);
      return;
    }
    const ask = (q) =>
      new Promise((r) => rl.question(q, (ans) => r(String(ans || '').trim())));
    (async () => {
      try {
        const answers = { name: '', email: '' };
        if (missing.includes('user.name')) answers.name = await ask('git user.name: ');
        if (missing.includes('user.email')) answers.email = await ask('git user.email: ');
        rl.close();
        resolve(answers);
      } catch (e) {
        try { rl.close(); } catch {}
        reject(e);
      }
    })();
  });
}

async function ensureIdentity({
  spawn = spawnSync,
  isTTY = Boolean(process.stdin && process.stdin.isTTY),
  logger = console,
  readlineImpl,
  input,
  output,
} = {}) {
  const current = getIdentity({ spawn });
  if (current.name && current.email) {
    logger.log(
      `[ok] git identity: user.name="${current.name}" user.email="${current.email}" (already set)`
    );
    return { status: 'already-set', name: current.name, email: current.email };
  }

  const missing = [];
  if (!current.name) missing.push('user.name');
  if (!current.email) missing.push('user.email');

  if (!isTTY) {
    logger.log(
      `[warn] git identity missing: ${missing.join(', ')} (non-TTY, skipped).`
    );
    if (!current.name) {
      logger.log('  git config --global user.name "Your Name"');
    }
    if (!current.email) {
      logger.log('  git config --global user.email "you@example.com"');
    }
    return { status: 'non-tty-skip', missing };
  }

  logger.log('[info] git identity not fully set. Enter values to save globally:');
  let entered;
  try {
    entered = await promptIdentity({ readlineImpl, input, output, missing });
  } catch (e) {
    logger.log(`[warn] git identity prompt failed: ${e.message}`);
    return { status: 'prompt-error', error: e.message, missing };
  }

  const toSet = {};
  if (!current.name && entered.name) toSet.name = entered.name;
  if (!current.email && entered.email) toSet.email = entered.email;

  if (Object.keys(toSet).length === 0) {
    logger.log('[warn] git identity setup skipped (empty input)');
    return { status: 'empty-input', missing };
  }

  try {
    setGlobalIdentity({ ...toSet, spawn });
    const finalName = current.name || toSet.name || '';
    const finalEmail = current.email || toSet.email || '';
    logger.log(
      `[ok] git identity set: user.name="${finalName}" user.email="${finalEmail}"`
    );
    return { status: 'set', name: finalName, email: finalEmail };
  } catch (e) {
    logger.log(`[warn] git config set failed: ${e.message}`);
    return { status: 'error', error: e.message };
  }
}

module.exports = {
  getIdentity,
  identityComplete,
  missingIdentityKeys,
  setGlobalIdentity,
  promptIdentity,
  ensureIdentity,
};
