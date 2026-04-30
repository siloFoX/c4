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
    // and `rm -rf $HOME` (env-var pointing at /).
    re: /\brm\s+(?:-[rRf]+\s*|--recursive\s+|--force\s+|--no-preserve-root\s+)+(?:["']?\/+["']?(?:\s|$|;|&|\|))/,
  },
  {
    code: 'rm-rf-tilde',
    label: 'rm -rf $HOME',
    re: /\brm\s+(?:-[rRf]+\s+)+(?:~|\$HOME|"\$HOME"|'\$HOME')(?:\s|$|;|&|\|)/,
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
];

// High: dangerous but legitimately useful. Escalate to operator.
const HIGH_PATTERNS = [
  {
    code: 'rm-rf-dir',
    label: 'rm -rf <directory>',
    // rm -rf foo/, rm -rf $TMPDIR, but NOT already matched by the
    // critical /-or-$HOME variants above.
    re: /\brm\s+(?:-[rRf]+\s+)+(?!["']?\/+["']?\b)(?!~|\$HOME)(?:\S+)/,
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
];

// --- Obfuscation detection -------------------------------------------

// Try to expand simple obfuscation so the patterns above can hit. We
// don't do real shell parsing — just enough to defeat the most common
// LLM-prompt-injection tricks like base64 wrappers and IFS games.
function _denoiseCommand(cmd) {
  let out = cmd;

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
  // We run several passes so multi-piece obfuscation collapses fully:
  //   p"k"ill -> pk + ill = pkill
  out = out.replace(/(?<=[A-Za-z])"([A-Za-z]+)"|"([A-Za-z]+)"(?=[A-Za-z])/g, (_m, a, b) => a || b);
  out = out.replace(/(?<=[A-Za-z])'([A-Za-z]+)'|'([A-Za-z]+)'(?=[A-Za-z])/g, (_m, a, b) => a || b);
  // Second pass for chains like p"k"i"l"l where the first pass leaves
  // `pki"l"l` (the middle quote loses its left alphabetic context).
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

  const critical = _matches(CRITICAL_PATTERNS, sourceForMatch);
  const high = _matches(HIGH_PATTERNS, sourceForMatch);
  // Filter medium hits that are already covered by the high tier so
  // `git push --force` doesn't double-emit as both `git-force-push`
  // and `git-push`.
  const mediumRaw = _matches(MEDIUM_PATTERNS, sourceForMatch);
  const highCodes = new Set(high.map((h) => h.code));
  const medium = mediumRaw.filter((m) => {
    if (m.code === 'git-push' && highCodes.has('git-force-push')) return false;
    return true;
  });

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
