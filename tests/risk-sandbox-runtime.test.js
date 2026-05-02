'use strict';

// (v1.10.79) SandboxRuntime + DockerRuntime command builder
// tests. All tests are pure (no docker exec). DockerRuntime's
// `available()` IS exercised via the real `docker version` probe
// and is gated on docker being on PATH so CI without docker
// degrades gracefully.

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  SandboxRuntime,
  NullRuntime,
  DockerRuntime,
  DOCKER_DEFAULTS,
  getRuntime,
} = require('../src/risk-sandbox-runtime');

const dockerOnPath = (() => {
  try {
    require('child_process').execSync('which docker', {
      stdio: 'pipe',
      timeout: 1000,
    });
    return true;
  } catch {
    return false;
  }
})();

describe('SandboxRuntime — abstract base', () => {
  it('available() defaults to {ok:false}', () => {
    const r = new SandboxRuntime();
    const a = r.available();
    assert.equal(a.ok, false);
    assert.match(a.reason, /abstract|subclass/i);
  });

  it('describeIsolation() returns abstract placeholder', () => {
    const r = new SandboxRuntime();
    const d = r.describeIsolation();
    assert.equal(d.name, 'abstract');
  });

  it('prepareArgs() throws since abstract', () => {
    const r = new SandboxRuntime();
    assert.throws(() => r.prepareArgs('echo hi'), /not implemented/);
  });
});

describe('NullRuntime — no isolation', () => {
  it('available() always ok', () => {
    const r = new NullRuntime();
    assert.deepEqual(r.available(), { ok: true });
  });

  it('describeIsolation() reports host-everything', () => {
    const r = new NullRuntime();
    const d = r.describeIsolation();
    assert.equal(d.name, 'none');
    assert.equal(d.network, 'host');
    assert.equal(d.filesystem, 'host');
    assert.equal(d.resources, 'host');
  });

  it('prepareArgs returns binary:null + empty args + echoed command', () => {
    const r = new NullRuntime();
    const out = r.prepareArgs('echo hi');
    assert.equal(out.binary, null);
    assert.deepEqual(out.args, []);
    assert.deepEqual(out.env, {});
    assert.equal(out.command, 'echo hi');
    assert.equal(out.isolation.name, 'none');
  });

  it('null/undefined command is coerced to empty string', () => {
    const r = new NullRuntime();
    assert.equal(r.prepareArgs(null).command, '');
    assert.equal(r.prepareArgs(undefined).command, '');
  });
});

describe('DockerRuntime — defaults exposed', () => {
  it('DOCKER_DEFAULTS is frozen', () => {
    assert.ok(Object.isFrozen(DOCKER_DEFAULTS));
  });

  it('DOCKER_DEFAULTS lists the expected hardening keys', () => {
    const required = ['image', 'network', 'readOnly', 'memory', 'cpus',
      'pidsLimit', 'tmpfsTmp', 'user', 'timeoutMs'];
    for (const k of required) {
      assert.ok(DOCKER_DEFAULTS[k] !== undefined,
        `DOCKER_DEFAULTS missing ${k}`);
    }
  });

  it('image defaults to alpine:latest, network to none', () => {
    assert.equal(DOCKER_DEFAULTS.image, 'alpine:latest');
    assert.equal(DOCKER_DEFAULTS.network, 'none');
  });
});

describe('DockerRuntime — describeIsolation()', () => {
  it('reports default isolation', () => {
    const r = new DockerRuntime();
    const d = r.describeIsolation();
    assert.equal(d.name, 'docker');
    assert.equal(d.network, 'none');
    assert.match(d.filesystem, /read-only/);
    assert.match(d.resources, /memory=128m/);
    assert.match(d.resources, /cpus=0\.5/);
    assert.match(d.resources, /pids=64/);
    assert.match(d.resources, /timeout=5000ms/);
  });

  it('reflects opts overrides', () => {
    const r = new DockerRuntime({ memory: '512m', network: 'bridge' });
    const d = r.describeIsolation();
    assert.match(d.resources, /memory=512m/);
    assert.equal(d.network, 'bridge');
  });

  it('readOnly:false flips filesystem description', () => {
    const r = new DockerRuntime({ readOnly: false });
    const d = r.describeIsolation();
    assert.equal(d.filesystem, 'rw root');
  });
});

describe('DockerRuntime — prepareArgs (pure builder)', () => {
  it('builds the canonical hardened argv', () => {
    const r = new DockerRuntime();
    const out = r.prepareArgs('echo hi');
    assert.equal(out.binary, 'docker');
    assert.deepEqual(out.args, [
      'run', '--rm',
      '--network=none',
      '--memory=128m',
      '--cpus=0.5',
      '--pids-limit=64',
      '--read-only',
      '--tmpfs=/tmp:rw,size=64m',
      '--user=nobody',
      '--security-opt=no-new-privileges',
      '--cap-drop=ALL',
      'alpine:latest',
      'sh', '-c', 'echo hi',
    ]);
    assert.deepEqual(out.env, {});
    assert.equal(out.command, 'echo hi');
    assert.equal(out.isolation.name, 'docker');
  });

  it('passes the command verbatim to sh -c (no argv splitting)', () => {
    const r = new DockerRuntime();
    const out = r.prepareArgs('cmd1 && cmd2 || cmd3');
    const tail = out.args.slice(-3);
    assert.deepEqual(tail, ['sh', '-c', 'cmd1 && cmd2 || cmd3']);
  });

  it('opts override defaults per call', () => {
    const r = new DockerRuntime();
    const out = r.prepareArgs('echo hi', {
      image: 'ubuntu:22.04',
      memory: '256m',
      cpus: '1.0',
      network: 'bridge',
    });
    assert.ok(out.args.includes('--memory=256m'));
    assert.ok(out.args.includes('--cpus=1.0'));
    assert.ok(out.args.includes('--network=bridge'));
    assert.ok(out.args.includes('ubuntu:22.04'));
    assert.ok(!out.args.includes('--memory=128m'));
  });

  it('readOnly:false drops --read-only but keeps tmpfs', () => {
    const r = new DockerRuntime();
    const out = r.prepareArgs('hi', { readOnly: false });
    assert.ok(!out.args.includes('--read-only'));
    assert.ok(out.args.some((a) => a.startsWith('--tmpfs=/tmp:')));
  });

  it('mounts: bind mounts get appended', () => {
    const r = new DockerRuntime();
    const out = r.prepareArgs('hi', {
      mounts: [
        { src: '/host/work', dst: '/work' },
        { src: '/host/ro',   dst: '/ro', ro: true },
      ],
    });
    assert.ok(out.args.includes('--mount=type=bind,src=/host/work,dst=/work'));
    assert.ok(out.args.includes('--mount=type=bind,src=/host/ro,dst=/ro,readonly'));
  });

  it('mounts: malformed entries are skipped', () => {
    const r = new DockerRuntime();
    const out = r.prepareArgs('hi', {
      mounts: [
        null,
        { src: '/ok', dst: '/ok' },
        { src: 42, dst: '/no' },         // bad src type
        { src: '/halfway' },             // missing dst
      ],
    });
    const mountArgs = out.args.filter((a) => a.startsWith('--mount='));
    assert.equal(mountArgs.length, 1);
    assert.equal(mountArgs[0], '--mount=type=bind,src=/ok,dst=/ok');
  });

  it('env: keys flow through as --env=K=V', () => {
    const r = new DockerRuntime();
    const out = r.prepareArgs('hi', { env: { FOO: 'bar', NUM: 1 } });
    assert.ok(out.args.includes('--env=FOO=bar'));
    assert.ok(out.args.includes('--env=NUM=1'));
  });

  it('env: empty / non-string keys are skipped', () => {
    const r = new DockerRuntime();
    const out = r.prepareArgs('hi', { env: { '': 'skip', 'OK': 'yes' } });
    const envArgs = out.args.filter((a) => a.startsWith('--env='));
    assert.equal(envArgs.length, 1);
    assert.equal(envArgs[0], '--env=OK=yes');
  });

  it('null command coerces to empty', () => {
    const r = new DockerRuntime();
    const out = r.prepareArgs(null);
    assert.equal(out.command, '');
    const tail = out.args.slice(-3);
    assert.deepEqual(tail, ['sh', '-c', '']);
  });

  it('custom dockerBinary opts is honored', () => {
    const r = new DockerRuntime({ dockerBinary: '/usr/local/bin/docker' });
    const out = r.prepareArgs('hi');
    assert.equal(out.binary, '/usr/local/bin/docker');
  });
});

describe('DockerRuntime — available() probe', () => {
  if (!dockerOnPath) {
    it('skipped: docker not on PATH', () => {
      // No-op so the suite still reports a passing case.
      assert.ok(true);
    });
    return;
  }
  it('reports ok when docker is reachable', () => {
    const r = new DockerRuntime();
    const a = r.available();
    assert.equal(a.ok, true);
  });

  it('reports not-ok when dockerBinary is bogus', () => {
    const r = new DockerRuntime({ dockerBinary: '/no/such/docker' });
    const a = r.available();
    assert.equal(a.ok, false);
    assert.match(a.reason, /docker probe failed/);
  });
});

describe('getRuntime() factory', () => {
  it('returns NullRuntime for "null" / undefined / null', () => {
    assert.ok(getRuntime('null') instanceof NullRuntime);
    assert.ok(getRuntime(undefined) instanceof NullRuntime);
    assert.ok(getRuntime(null) instanceof NullRuntime);
  });

  it('returns DockerRuntime for "docker"', () => {
    assert.ok(getRuntime('docker') instanceof DockerRuntime);
  });

  it('forwards opts to DockerRuntime', () => {
    const r = getRuntime('docker', { memory: '256m' });
    const d = r.describeIsolation();
    assert.match(d.resources, /memory=256m/);
  });

  it('throws on unknown runtime name', () => {
    assert.throws(() => getRuntime('firejail'), /Unknown sandbox runtime/);
  });
});
