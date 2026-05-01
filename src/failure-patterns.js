// Failure-pattern auto-recovery hints (TODO 8.4 / #101).
//
// Match recurring intervention/error text against a curated regex catalog
// and return a short "suggested fix" hint. This is observability + a
// hint surface — *not* automated remediation. The Web UI shows the hint
// next to the worker, so the operator can act on it without reading the
// full scrollback.
//
// Patterns are deliberately conservative: each one needs a clear root
// cause + a short, actionable hint. False positives erode trust in the
// signal more than missing entries.

'use strict';

const PATTERNS = [
  {
    id: 'eslint-fail',
    label: 'ESLint failure',
    regex: /\b(\d+\s+(?:problem|error|warning)s?\s*\([^)]*\))|ESLint\s+found\s+\d+\s+(?:error|problem)/i,
    hint: 'Run `npm run lint -- --fix` or fix highlighted rules; commit may be blocked by pre-commit.',
  },
  {
    id: 'enospc',
    label: 'Disk full',
    regex: /\bENOSPC\b|\bno space left on device\b|디스크\s*공간|공간이\s*부족/i,
    hint: 'Disk full — clean logs/, .git/objects, or move worktrees off the partition before retrying.',
  },
  {
    id: 'eacces',
    label: 'Permission denied',
    regex: /\bEACCES\b|\bpermission denied\b|권한이\s*없|권한\s*거부/i,
    hint: 'Permission issue — check file ownership and run mode. Avoid elevating with sudo unless required.',
  },
  {
    id: 'enoent-file',
    label: 'Missing file',
    regex: /\bENOENT[^,]*\bopen\b|\bno such file or directory\b/i,
    hint: 'A required file is missing — verify the path, the working dir, and that prior steps actually wrote the file.',
  },
  {
    id: 'git-dirty',
    label: 'Dirty worktree',
    regex: /\b(your local changes|local changes to the following files would be overwritten|nothing to commit, working tree clean)?\b.*?(commit your changes or stash them|please commit your changes)/i,
    hint: 'Dirty worktree blocking the operation — commit or stash; do NOT discard unless the user said so.',
  },
  {
    id: 'git-conflict',
    label: 'Merge conflict',
    regex: /\b(CONFLICT \(|merge conflict in|fix conflicts and run|automatic merge failed)\b/i,
    hint: 'Merge conflict — resolve markers manually. Don\'t accept --ours/--theirs blindly.',
  },
  {
    id: 'hook-denied',
    label: 'Hook denied',
    regex: /\[C4\] hook denied|denied by hook|hook returned non-zero/i,
    hint: 'A hook (PreToolUse / git pre-commit) blocked an action. Inspect the hook output before retrying.',
  },
  {
    id: 'rate-limit',
    label: 'Rate limited',
    regex: /\b(rate.?limit|too many requests|429\b|HTTP\s+429)/i,
    hint: 'Provider rate-limited the request. Back off, batch fewer calls, or check quota.',
  },
  {
    id: 'auth',
    label: 'Auth required',
    regex: /\b(401\s+unauthor|403\s+forbid|authentication required|invalid (token|credentials)|please log in)\b/i,
    hint: 'Auth failed — re-issue the bearer / API key, or re-run /auth/login.',
  },
  {
    id: 'oom',
    label: 'Out of memory',
    // Bare \bkilled\b conflicted with subprocess-killed (SIGKILL etc.) so
    // OOM now requires an OOM-specific phrasing or the kernel oom-killer
    // breadcrumb. This keeps OOM precise and lets subprocess-killed catch
    // generic SIGKILL / SIGTERM signals.
    regex: /\b(out of memory|allocation failed|JavaScript heap out of memory|\bOOM[\b -]?(?:killer)?|killed by oom|memory cgroup out of memory|oom_reaper)\b/i,
    hint: 'Process OOM — split the workload, raise --max-old-space-size, or move to a larger box.',
  },
  {
    id: 'port-in-use',
    label: 'Port in use',
    regex: /\b(EADDRINUSE|address already in use|port \d+ is already)/i,
    hint: 'Port collision — kill the previous holder (`lsof -i:<port>`) or pick a different port.',
  },
  {
    id: 'test-fail',
    label: 'Test failures',
    regex: /\b(\d+ passed,\s*\d+ failed|\d+ failures?,\s*\d+ passes?|tests:\s*\d+\s*failed)/i,
    hint: 'Tests failing — read the first failure, fix the root cause, do not skip via .skip / .only.',
  },
  {
    id: 'timeout',
    label: 'Operation timed out',
    regex: /\b(ETIMEDOUT|timed?\s*out\b|operation timed out)/i,
    hint: 'Network or operation timeout. Check connectivity / queue depth before raising the timeout.',
  },
  {
    id: 'connection-refused',
    label: 'Connection refused',
    regex: /\bECONNREFUSED\b|\bconnection refused\b|connection\s*refused\s*by\s*peer/i,
    hint: 'Target service is not listening on that host:port. Verify the service is up and the port is correct.',
  },
  {
    id: 'connection-reset',
    label: 'Connection reset',
    regex: /\b(ECONNRESET|connection reset by peer|broken pipe|EPIPE)\b/i,
    hint: 'Peer dropped the TCP connection mid-stream. Likely a peer crash, idle timeout, or aggressive load balancer.',
  },
  {
    id: 'dns-fail',
    label: 'DNS lookup failed',
    regex: /\b(ENOTFOUND|EAI_AGAIN|getaddrinfo\s+(?:ENOTFOUND|EAI_AGAIN))\b|host name lookup fail/i,
    hint: 'Hostname did not resolve. Check /etc/resolv.conf, the host is spelled right, and the network has DNS access.',
  },
  {
    id: 'tls-cert',
    label: 'TLS certificate problem',
    regex: /\b(UNABLE_TO_VERIFY_LEAF_SIGNATURE|CERT_HAS_EXPIRED|self[- ]signed certificate|SELF_SIGNED_CERT_IN_CHAIN|DEPTH_ZERO_SELF_SIGNED_CERT)\b/i,
    hint: 'TLS handshake failed on cert validation. Check expiry / chain / NODE_EXTRA_CA_CERTS — do not blindly disable verification in production.',
  },
  {
    id: 'subprocess-killed',
    label: 'Subprocess killed',
    regex: /\b(SIGKILL|SIGTERM|signal 9|killed by signal|process killed)\b/i,
    hint: 'A child process was killed externally (oom-killer, supervisor, manual kill). Check dmesg + parent supervisor logs.',
  },
  {
    id: 'node-stack',
    label: 'Node.js crash',
    regex: /\b(Maximum call stack size exceeded|RangeError: Maximum call stack|FATAL ERROR: .*JavaScript|Allocation failed - JavaScript heap)\b/i,
    hint: 'Node runtime crashed (stack overflow or heap exhaustion). Look for unbounded recursion / streaming buffer / leaking listener.',
  },
  {
    id: 'lockfile',
    label: 'Lockfile / mutex contention',
    regex: /\b(another git process|index\.lock|database is locked|SQLITE_BUSY|EAGAIN.*lock|stale\s*lockfile)\b/i,
    hint: 'A required lock is held by another process or stale. Confirm the previous run finished cleanly before forcing the lock.',
  },
  {
    id: 'npm-eintegrity',
    label: 'npm integrity / lockfile drift',
    regex: /\b(EINTEGRITY|lockfile (out of date|version drift)|npm WARN reify|invalid: lock file)\b/i,
    hint: 'package-lock.json out of sync with registry hashes. Re-run `npm install` to refresh, or delete node_modules/+lock and reinstall.',
  },
];

/**
 * Inspect a worker's error history (and optional latest screen text) and
 * return the most relevant hint, if any.
 *
 * @param {{ line: string; count: number; firstSeen: number }[]} errorHistory
 * @param {string} [recentText]   most recent snapshot screen text (optional)
 * @returns {{ id, label, hint, sample, count }|null}
 */
function findHint(errorHistory, recentText) {
  // Prefer hints derived from repeated errors — they survived multiple
  // ticks, so they're real. Walk error history first.
  if (Array.isArray(errorHistory) && errorHistory.length > 0) {
    // Highest-count entry wins; ties broken by recency (last in array).
    const sorted = [...errorHistory].sort((a, b) => (b.count || 1) - (a.count || 1));
    for (const entry of sorted) {
      const m = matchOne(entry.line);
      if (m) return { ...m, sample: entry.line, count: entry.count || 1 };
    }
  }
  // Fall back to the latest screen text — helpful when the error hasn't
  // been promoted to history yet (single occurrence on first tick).
  if (typeof recentText === 'string' && recentText) {
    const m = matchOne(recentText);
    if (m) return { ...m, sample: matchSnippet(recentText, m.regex), count: 1 };
  }
  return null;
}

function matchOne(line) {
  for (const p of PATTERNS) {
    if (p.regex.test(line)) return { id: p.id, label: p.label, hint: p.hint, regex: p.regex };
  }
  return null;
}

function matchSnippet(text, regex) {
  const m = text.match(regex);
  if (!m) return null;
  const i = text.indexOf(m[0]);
  const start = Math.max(0, i - 20);
  const end = Math.min(text.length, i + m[0].length + 20);
  return text.slice(start, end).replace(/\s+/g, ' ').trim();
}

module.exports = { findHint, PATTERNS };
