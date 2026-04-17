'use strict';

// package-lock.json environment-drift guard (TODO 7.29).
//
// Detects the signature of npm version or platform drift: a diff that
// consists exclusively of `"peer": true` metadata removals or additions.
// That pattern is produced when npm on one machine emits the `peer` flag
// and npm on another (older or differently configured) machine strips it
// on its next install. Real dependency updates always touch other fields
// (version, integrity, resolved), so "peer:true-only" is a reliable
// fingerprint of environment drift rather than an intentional change.
//
// The module exposes the detector as a pure function so it is unit-testable,
// and a CLI entry point so `.githooks/pre-commit` can invoke it against a
// staged path. Nothing is blocked — the hook surfaces the cause and exits
// successfully. Gitignoring the lockfile is explicitly out of scope because
// it breaks dependency reproducibility.

const PEER_LINE = /^[+-]\s*"peer":\s*true,?\s*$/;

function analyzeDiff(diff) {
  if (typeof diff !== 'string' || diff.length === 0) {
    return { isPeerDriftOnly: false, peerLines: 0, otherLines: 0 };
  }
  let peerLines = 0;
  let otherLines = 0;
  const lines = diff.split(/\r?\n/);
  for (const line of lines) {
    if (line.length === 0) continue;
    if (line.startsWith('diff --git ')) continue;
    if (line.startsWith('index ')) continue;
    if (line.startsWith('--- ')) continue;
    if (line.startsWith('+++ ')) continue;
    if (line.startsWith('@@')) continue;
    if (line.startsWith('\\')) continue;
    if (!line.startsWith('+') && !line.startsWith('-')) continue;
    if (PEER_LINE.test(line)) {
      peerLines += 1;
    } else {
      otherLines += 1;
    }
  }
  return {
    isPeerDriftOnly: peerLines > 0 && otherLines === 0,
    peerLines,
    otherLines,
  };
}

function buildAdvice(pathname, peerLines) {
  const lines = [];
  lines.push('');
  lines.push(`  [c4] ${pathname}: ${peerLines} "peer": true line change(s) and no other content changes.`);
  lines.push('  This is the signature of npm version/platform drift (TODO 7.29), not an intentional');
  lines.push('  dependency update. Recommended:');
  lines.push(`    1. Compare npm --version between machines that touch this lockfile.`);
  lines.push(`    2. If unintentional: git checkout -- ${pathname}`);
  lines.push('    3. If intentional (deliberate regeneration): commit with a message that says so.');
  lines.push('  (Warning only — the commit proceeds.)');
  lines.push('');
  return lines.join('\n');
}

function runCli(argv, opts) {
  const {
    spawn = require('child_process').spawnSync,
    stderr = process.stderr,
  } = opts || {};
  const paths = argv.slice(2);
  if (paths.length === 0) return 0;
  for (const p of paths) {
    const res = spawn('git', ['diff', '--cached', '--', p], { encoding: 'utf8' });
    if (!res || res.status !== 0) continue;
    if (!res.stdout) continue;
    const analysis = analyzeDiff(res.stdout);
    if (analysis.isPeerDriftOnly) {
      stderr.write(buildAdvice(p, analysis.peerLines));
    }
  }
  return 0;
}

module.exports = { analyzeDiff, buildAdvice, runCli, PEER_LINE };

if (require.main === module) {
  process.exit(runCli(process.argv));
}
