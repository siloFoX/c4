'use strict';

// PATH registration helpers for `c4 init` (7.x init-path fix).
//
// When npm link fails on Linux/macOS, `c4 init` falls back to creating a
// symlink at ~/.local/bin/c4. That only works if ~/.local/bin is on PATH —
// on fresh systems it often isn't, so previously the user got a working
// symlink but a non-working `c4` command. These helpers make init append a
// PATH export to the user's shell rc file (duplicate-safe).

const fs = require('fs');
const path = require('path');

const MARKER = '# c4 init: add ~/.local/bin to PATH';
const EXPORT_LINE = 'export PATH="$HOME/.local/bin:$PATH"';

function normalizePath(p) {
  if (!p) return '';
  return path.resolve(p).replace(/\\/g, '/').replace(/\/+$/, '');
}

function isLocalBinInPath(localBin, pathEnv, isWin = process.platform === 'win32') {
  const sep = isWin ? ';' : ':';
  const target = normalizePath(localBin);
  if (!target) return false;
  const dirs = (pathEnv || '').split(sep).filter(Boolean);
  return dirs.some((d) => normalizePath(d) === target);
}

function detectRcFiles(home, shellEnv) {
  const shell = shellEnv || '';
  const bashrc = path.join(home, '.bashrc');
  const zshrc = path.join(home, '.zshrc');
  const files = [bashrc];
  if (/\bzsh\b/.test(shell) || shell.endsWith('/zsh')) {
    files.push(zshrc);
  }
  return files;
}

function rcHasLocalBinPath(content) {
  if (!content) return false;
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine;
    if (/^\s*#/.test(line)) continue;
    if (!/\.local\/bin/.test(line)) continue;
    if (/(?:^|\s)export\s+PATH\s*=/.test(line)) return true;
    if (/^\s*PATH\s*=/.test(line)) return true;
  }
  return false;
}

function appendPathExport(rcPath, fsImpl = fs) {
  let content = '';
  let exists = true;
  try {
    content = fsImpl.readFileSync(rcPath, 'utf8');
  } catch (e) {
    if (e.code === 'ENOENT') {
      exists = false;
    } else {
      return { result: 'error', error: e.message };
    }
  }

  if (exists && rcHasLocalBinPath(content)) {
    return { result: 'already-present' };
  }

  const needsLeadingNewline = exists && content.length > 0 && !content.endsWith('\n');
  const block = `${needsLeadingNewline ? '\n' : ''}\n${MARKER}\n${EXPORT_LINE}\n`;

  try {
    fsImpl.appendFileSync(rcPath, block);
    return { result: 'appended' };
  } catch (e) {
    return { result: 'error', error: e.message };
  }
}

function registerLocalBinInPath({
  home,
  localBin,
  pathEnv = process.env.PATH,
  shellEnv = process.env.SHELL,
  isWin = process.platform === 'win32',
  fsImpl = fs,
} = {}) {
  if (isWin) {
    return { skipped: 'windows', alreadyInPath: false, updated: [], unchanged: [], errors: [] };
  }
  if (isLocalBinInPath(localBin, pathEnv, isWin)) {
    return { alreadyInPath: true, updated: [], unchanged: [], errors: [] };
  }

  const rcFiles = detectRcFiles(home, shellEnv);
  const updated = [];
  const unchanged = [];
  const errors = [];

  for (const rc of rcFiles) {
    const { result, error } = appendPathExport(rc, fsImpl);
    if (result === 'appended') updated.push(rc);
    else if (result === 'already-present') unchanged.push(rc);
    else if (result === 'error') errors.push({ rc, error });
  }

  return { alreadyInPath: false, updated, unchanged, errors };
}

module.exports = {
  MARKER,
  EXPORT_LINE,
  isLocalBinInPath,
  detectRcFiles,
  rcHasLocalBinPath,
  appendPathExport,
  registerLocalBinInPath,
};
