'use strict';

// (11.5 Stage 1) Static command-intent extractor.
//
// Parses a Bash command into a structured report — what files it
// would write/read, which network peers it would talk to, whether
// it claims privilege, where it pulls scripts from — WITHOUT running
// the command. Pure synchronous, zero deps, side-effect-free.
//
// Used by the PreToolUse hook to attach a "what does this actually
// do" summary to every risk_deny event so operators reviewing
// dryRun output don't have to re-grep the catalog. Future
// Docker / firejail / chroot backends can also gate on the report
// (e.g., refuse to run a command that talks to an unknown host).
//
// Best-effort regex-based extraction. We don't ship a shell parser
// because the inputs we care about (LLM-emitted bash one-liners) are
// flat enough that token-level pattern matching beats a full grammar
// for our cost/value ratio. Limitations are documented per helper.
//
// API contract:
//   extractIntent(command: string) → IntentReport
//   IntentReport = {
//     filesWritten: string[],     // paths the command would write to
//     filesRead: string[],        // paths it would read
//     networkPeers: string[],     // hosts/URLs touched
//     privileged: boolean,        // sudo / doas / su / pkexec / SUID set
//     scriptSources: string[],    // sh/bash -c / eval / source targets
//     destructiveVerbs: string[], // rm / dd / mkfs / chmod / chown / mv targets
//     unique: boolean,            // when false, lists may have duplicates
//   }
//
// Empty report (`{filesWritten: [], ...}`) means the analyser found
// nothing — NOT that the command is safe. Always pair with the
// classifier's level for actual gating.

const _SHELL_PIPE_TOKENS = new Set([';', '&&', '||', '|', '&']);

// ---------- helpers --------------------------------------------------

function _dedupe(arr) {
  return Array.from(new Set(arr.filter(Boolean)));
}

// Extract a path-like token sitting AFTER a redirection operator.
// Stops at shell pipe / redirect operators or whitespace.
function _filesWritten(cmd) {
  const out = [];
  // `> path`, `>> path`, `&> path`, `2> path`, etc.
  const redirRe = /(?:^|[\s])(?:&|2|1|3|4|5|6|7|8|9)?>>?\s*([^\s;&|<>]+)/g;
  let m;
  while ((m = redirRe.exec(cmd)) !== null) {
    out.push(m[1]);
  }
  // `tee [-a|--append] path`
  const teeRe = /\btee\s+(?:-[aA]\s+|--append\s+)?([^\s;&|<>]+)/g;
  while ((m = teeRe.exec(cmd)) !== null) {
    out.push(m[1]);
  }
  // `cp src dst` and `mv src dst` — destination is the LAST token in
  // the arg list. We approximate by taking the last whitespace-
  // separated token before a shell operator. This misses cases like
  // `cp -t targetdir src1 src2` (where `-t` re-orders the operands)
  // but those are rare in LLM-emitted commands.
  const cpMvRe = /\b(?:cp|mv|install|rsync|scp)\s+([^\n;&|]+)/g;
  while ((m = cpMvRe.exec(cmd)) !== null) {
    const args = m[1].trim().split(/\s+/).filter((tok) => !tok.startsWith('-'));
    if (args.length >= 2) {
      out.push(args[args.length - 1]);
    }
  }
  return _dedupe(out);
}

// Path-like token sitting AFTER a "read this" verb. Best-effort: we
// list the immediate arg, ignoring flags. Multiple operands on `cat
// a b c` all surface.
function _filesRead(cmd) {
  const out = [];
  const readVerbs = ['cat', 'less', 'more', 'head', 'tail', 'grep', 'awk', 'sed', 'tac', 'zcat', 'gzip', 'xxd', 'hexdump', 'strings', 'file'];
  const re = new RegExp(`\\b(?:${readVerbs.join('|')})\\b\\s+([^\\n;&|]+)`, 'g');
  let m;
  while ((m = re.exec(cmd)) !== null) {
    const tail = m[1].trim();
    // Stop at the first redirection operator inside the arglist
    // (e.g., `cat secret > /tmp/x` — the > is not part of the read).
    const cut = tail.search(/[<>]/);
    const argstr = cut >= 0 ? tail.slice(0, cut) : tail;
    const args = argstr.split(/\s+/).filter((tok) => tok && !tok.startsWith('-') && !_SHELL_PIPE_TOKENS.has(tok));
    out.push(...args);
  }
  return _dedupe(out);
}

// Hostnames / URLs the command would talk to. We pick out args that
// follow common networking verbs and look like a URL or `user@host`
// form. Pure-IP and bare hostnames are also caught when they sit in
// argv positions where a peer is expected.
function _networkPeers(cmd) {
  const out = [];
  // URL forms: http(s)://... and git@github.com:owner/repo
  const urlRe = /\b((?:https?|ftp|ssh|sftp|rsync|git):\/\/[^\s;&|]+)/g;
  let m;
  while ((m = urlRe.exec(cmd)) !== null) out.push(m[1]);
  // user@host or git@host:repo
  const userHostRe = /\b([\w.-]+@[\w.-]+(?::[\w./-]+)?)/g;
  while ((m = userHostRe.exec(cmd)) !== null) {
    const tok = m[1];
    // Filter out obvious non-network forms (e.g., email in a comment).
    // We accept anything that has a `:` (user@host:port or user@host:path)
    // OR sits adjacent to a network verb (curl/ssh/scp/rsync/wget/...).
    if (tok.includes(':')) { out.push(tok); continue; }
    const before = cmd.slice(0, m.index);
    if (/\b(?:curl|wget|ssh|scp|rsync|sftp|nc|ncat|http|fetch|git\s+(?:clone|pull|push|fetch))\b[^\n;]*$/.test(before)) {
      out.push(tok);
    }
  }
  return _dedupe(out);
}

function _privileged(cmd) {
  // Privilege primitives:
  //   - sudo / doas / pkexec / `su -`
  //   - chmod with setuid (leading 4) / setgid (leading 2) / sticky+
  //     setuid (leading 5/6/7) — i.e., a four-digit mode where the
  //     leading digit is in [4-7]. Three-digit modes like `chmod 755`
  //     are benign (no setuid bit).
  //   - chmod symbolic +s / u+s / g+s
  return /\b(?:sudo\b|doas\b|pkexec\b|su\s+-|chmod\s+(?:[4567][0-7]{3}\b|[uga]?\+s\b|u\+s\b|g\+s\b))/.test(cmd);
}

function _scriptSources(cmd) {
  const out = [];
  // `sh -c "..."`, `bash -c "..."`, etc. — capture the inner string.
  const shCRe = /\b(?:bash|sh|zsh|fish)\s+-c\s+(["'])([^"'\n]*)\1/g;
  let m;
  while ((m = shCRe.exec(cmd)) !== null) out.push(m[2]);
  // `eval "..."`, `source path`, `. path`.
  const evalRe = /\beval\s+(["'])([^"'\n]*)\1/g;
  while ((m = evalRe.exec(cmd)) !== null) out.push(m[2]);
  const srcRe = /(?:^|[\s;&|])(?:source|\.)\s+([^\s;&|]+)/g;
  while ((m = srcRe.exec(cmd)) !== null) out.push(m[1]);
  // bash <(curl ...) — process substitution
  const procsubRe = /\b(?:bash|sh|zsh|fish)\s+<\(\s*([^)]+)\)/g;
  while ((m = procsubRe.exec(cmd)) !== null) out.push(m[1].trim());
  return _dedupe(out);
}

function _destructiveVerbs(cmd) {
  const out = [];
  // rm / dd / mkfs / shred — high-impact deletion / overwrite verbs.
  // mkfs has dotted variants (mkfs.ext4 / mkfs.xfs / etc) — match
  // either the bare form or `mkfs.<fs>`.
  const verbs = ['rm', 'shred', 'dd', 'mkswap', 'fdisk', 'parted', 'wipefs'];
  const re = new RegExp(`\\b(${verbs.join('|')}|mkfs(?:\\.\\w+)?)\\b\\s+([^\\n;&|]*)`, 'g');
  let m;
  while ((m = re.exec(cmd)) !== null) {
    const verb = m[1];
    const args = (m[2] || '').trim().split(/\s+/).filter((tok) => tok && !tok.startsWith('-')).slice(0, 5);
    if (args.length === 0) {
      out.push(verb);
    } else {
      // Strip trailing quote / paren noise so `bash -c "rm -rf /"`
      // doesn't emit `rm /"` — the quote at end of arg is just the
      // shell-c closing delimiter, not part of the path.
      const cleaned = args.map((a) => a.replace(/["')\]}]+$/, '')).filter(Boolean);
      out.push(`${verb} ${cleaned.join(' ')}`);
    }
  }
  // chmod — dangerous modes only:
  //   666 / 777 (world-writable, world-rwx)
  //   4xxx / 5xxx / 6xxx / 7xxx (any setuid/setgid/sticky form)
  //   symbolic u+s / +s / a+rwx
  // chmod 644 / 755 / 700 etc are benign and stay out.
  const chmodRe = /\b(?:chmod)\s+(?:0?(?:666|777)|0?[4567]\d{3}|u\+s|g\+s|\+s|a\+rwx)\s+(\S+)/g;
  while ((m = chmodRe.exec(cmd)) !== null) {
    out.push(`chmod ${m[1]}`);
  }
  // chown — only the recursive form is treated as destructive
  // (chown -R / --recursive). Single-file chown is routine.
  const chownRe = /\b(?:chown)\s+(?:-R\s+|--recursive\s+)\S+\s+(\S+)/g;
  while ((m = chownRe.exec(cmd)) !== null) {
    out.push(`chown ${m[1]}`);
  }
  return _dedupe(out);
}

// ---------- public API ----------------------------------------------

function extractIntent(command) {
  if (!command || typeof command !== 'string') {
    return {
      filesWritten: [], filesRead: [], networkPeers: [],
      privileged: false, scriptSources: [], destructiveVerbs: [],
      empty: true,
    };
  }
  const filesWritten = _filesWritten(command);
  const filesRead = _filesRead(command);
  const networkPeers = _networkPeers(command);
  const privileged = _privileged(command);
  const scriptSources = _scriptSources(command);
  const destructiveVerbs = _destructiveVerbs(command);
  const empty = !privileged
    && filesWritten.length === 0
    && filesRead.length === 0
    && networkPeers.length === 0
    && scriptSources.length === 0
    && destructiveVerbs.length === 0;
  return {
    filesWritten, filesRead, networkPeers,
    privileged, scriptSources, destructiveVerbs,
    empty,
  };
}

// Compact one-line summary suitable for log output / Slack / SSE
// payload trimming. Returns null when the report is empty.
//
//   "writes=/tmp/x reads=/etc/shadow net=evil.com priv=true"
//
function summariseIntent(intent) {
  if (!intent || intent.empty) return null;
  const parts = [];
  if (intent.filesWritten.length) parts.push(`writes=${intent.filesWritten.slice(0, 3).join(',')}`);
  if (intent.filesRead.length) parts.push(`reads=${intent.filesRead.slice(0, 3).join(',')}`);
  if (intent.networkPeers.length) parts.push(`net=${intent.networkPeers.slice(0, 3).join(',')}`);
  if (intent.privileged) parts.push('priv=true');
  if (intent.scriptSources.length) parts.push(`src=${intent.scriptSources.length}`);
  if (intent.destructiveVerbs.length) parts.push(`dest=${intent.destructiveVerbs.slice(0, 3).join('|')}`);
  return parts.join(' ');
}

module.exports = { extractIntent, summariseIntent };
