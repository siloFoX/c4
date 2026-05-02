'use strict';

/**
 * Risk Sandbox Runtime (11.5 Stage 2 — v1.10.79)
 *
 * The runtime layer sits underneath `extractIntent()` (Stage 1
 * static parsing). Each runtime knows how to prepare an isolation
 * context for a command — what args to pass to the OS-binary
 * (Docker / chroot / firejail / nothing), what defaults to
 * harden, what guarantees it provides.
 *
 * This first cut ships the interface + a DockerRuntime command
 * BUILDER plus a NullRuntime (no isolation). Actual execution is
 * deliberately deferred to a later cut — shipping the builder
 * pure-and-testable lets operators preview the exact OS command
 * that WOULD run before opting into shadow execution.
 *
 * ## Why pure builder first
 *
 * Shadow execution of risky commands is itself risky:
 *   - Docker container escapes exist and get found
 *   - Resource exhaustion (fork bombs, CPU/IO/memory) can affect
 *     the host even with cgroup limits if config is wrong
 *   - The classifier sometimes flags benign commands; running
 *     them in a sandbox just to "verify" intent burns cycles
 *   - Some risky commands are dangerous BECAUSE of side effects
 *     (`rm -rf /` doesn't damage the sandbox container, but
 *     "shadow-running it" doesn't give us new information either)
 *
 * The builder is the framework piece that's cleanly useful
 * without policy commitments: an operator can `c4 risk "<cmd>"
 * --sandbox-preview docker` to see the exact `docker run ...`
 * line they could copy/paste, or pipe through their own
 * sandbox harness. Execution wiring lands in a follow-up after
 * the runtime interface is settled.
 *
 * ## Runtime interface
 *
 *   class SandboxRuntime {
 *     available(): { ok: boolean, reason?: string }
 *     describeIsolation(): { name, network, filesystem, resources }
 *     prepareArgs(command, opts?): {
 *       binary: string,        // 'docker', 'firejail', null for NullRuntime
 *       args:   string[],      // argv to pass binary
 *       env:    {},             // env to set on the spawn
 *       command: string,        // original command (echoed for the audit)
 *       isolation: {...},       // copy of describeIsolation() for the audit
 *     }
 *   }
 *
 * `prepareArgs` is the pure function. It builds the OS-binary
 * invocation that would isolate `command`. `available()` is the
 * cheap probe — DockerRuntime checks `which docker` is on PATH
 * and that the docker daemon is reachable; NullRuntime always
 * returns ok.
 *
 * ## DockerRuntime defaults
 *
 *   image:         alpine:latest        (small, common)
 *   network:       'none'               (no egress)
 *   read-only:     true                 (root FS read-only)
 *   memory:        128m                 (cgroup-bound)
 *   cpus:          0.5                  (cgroup-bound)
 *   pids-limit:    64                   (cap fork bombs)
 *   tmpfs /tmp:    rw,size=64m         (writable scratch)
 *   --rm:          true                 (cleanup on exit)
 *   user:          'nobody'             (no root in container)
 *   security-opt:  no-new-privileges    (block setuid escalation)
 *   cap-drop:      ALL                  (drop all caps, add nothing)
 *   timeout:       5000ms                (host-side kill)
 *
 * Operators can override via opts: image / network / memory /
 * cpus / timeoutMs / mounts / env.
 *
 * Mounts are off by default (read-only root FS + tmpfs is enough
 * for "shadow what does this do"). Operators who want to mount
 * their own workspace pass opts.mounts: [{src, dst, ro}].
 */

const { execSync } = require('child_process');

class SandboxRuntime {
  /** @returns {{ ok: boolean, reason?: string }} */
  available() {
    return { ok: false, reason: 'abstract SandboxRuntime — use a subclass' };
  }

  /** @returns {{ name: string, network: string, filesystem: string, resources: string }} */
  describeIsolation() {
    return {
      name: 'abstract',
      network: 'unspecified',
      filesystem: 'unspecified',
      resources: 'unspecified',
    };
  }

  /**
   * @param {string} _command
   * @param {object} [_opts]
   * @returns {{ binary: (string|null), args: string[], env: object, command: string, isolation: object }}
   */
  prepareArgs(_command, _opts) {
    throw new Error(`${this.constructor.name}: prepareArgs not implemented`);
  }
}

class NullRuntime extends SandboxRuntime {
  available() {
    return { ok: true };
  }

  describeIsolation() {
    return {
      name: 'none',
      network: 'host',
      filesystem: 'host',
      resources: 'host',
    };
  }

  prepareArgs(command, _opts) {
    return {
      binary: null,
      args: [],
      env: {},
      command: String(command == null ? '' : command),
      isolation: this.describeIsolation(),
    };
  }
}

const DOCKER_DEFAULTS = Object.freeze({
  image: 'alpine:latest',
  network: 'none',
  readOnly: true,
  memory: '128m',
  cpus: '0.5',
  pidsLimit: 64,
  tmpfsTmp: '64m',
  user: 'nobody',
  timeoutMs: 5000,
});

class DockerRuntime extends SandboxRuntime {
  constructor(opts) {
    super();
    const o = opts && typeof opts === 'object' ? opts : {};
    this.dockerBinary = typeof o.dockerBinary === 'string' && o.dockerBinary
      ? o.dockerBinary
      : 'docker';
    this.defaults = { ...DOCKER_DEFAULTS, ...o };
  }

  available() {
    try {
      execSync(`${this.dockerBinary} version --format '{{.Server.Version}}'`, {
        stdio: 'pipe',
        timeout: 2000,
      });
      return { ok: true };
    } catch (err) {
      return {
        ok: false,
        reason: `docker probe failed: ${(err && err.message) || String(err)}`,
      };
    }
  }

  describeIsolation() {
    return {
      name: 'docker',
      network: this.defaults.network,
      filesystem: this.defaults.readOnly
        ? `read-only root + tmpfs /tmp (${this.defaults.tmpfsTmp})`
        : 'rw root',
      resources:
        `memory=${this.defaults.memory} cpus=${this.defaults.cpus} ` +
        `pids=${this.defaults.pidsLimit} timeout=${this.defaults.timeoutMs}ms`,
    };
  }

  /**
   * Build the `docker run` argv that would isolate `command`. Pure
   * function; no exec.
   */
  prepareArgs(command, opts) {
    const o = opts && typeof opts === 'object' ? opts : {};
    const cfg = { ...this.defaults, ...o };
    const args = ['run', '--rm'];

    // Network isolation
    if (cfg.network) {
      args.push(`--network=${cfg.network}`);
    }

    // Resource limits — every one of these maps to a cgroup
    if (cfg.memory)    args.push(`--memory=${cfg.memory}`);
    if (cfg.cpus)      args.push(`--cpus=${cfg.cpus}`);
    if (cfg.pidsLimit) args.push(`--pids-limit=${cfg.pidsLimit}`);

    // Filesystem isolation
    if (cfg.readOnly)  args.push('--read-only');
    if (cfg.tmpfsTmp)  args.push(`--tmpfs=/tmp:rw,size=${cfg.tmpfsTmp}`);

    // Privilege drops
    if (cfg.user)      args.push(`--user=${cfg.user}`);
    args.push('--security-opt=no-new-privileges');
    args.push('--cap-drop=ALL');

    // Operator-supplied extra mounts (uncommon — defaults are
    // tight enough that most "what does this do" probes don't
    // need a workspace mount)
    const mounts = Array.isArray(cfg.mounts) ? cfg.mounts : [];
    for (const m of mounts) {
      if (!m || typeof m !== 'object') continue;
      if (typeof m.src !== 'string' || typeof m.dst !== 'string') continue;
      const ro = m.ro === true ? ',readonly' : '';
      args.push(`--mount=type=bind,src=${m.src},dst=${m.dst}${ro}`);
    }

    // Operator-supplied env
    const envBag = (cfg.env && typeof cfg.env === 'object') ? cfg.env : {};
    for (const [k, v] of Object.entries(envBag)) {
      if (typeof k !== 'string' || k.length === 0) continue;
      args.push(`--env=${k}=${String(v == null ? '' : v)}`);
    }

    // Image + command. Use `sh -c` so the command-as-string is
    // preserved (no argv splitting issues for `cmd1 && cmd2`).
    args.push(cfg.image);
    args.push('sh', '-c', String(command == null ? '' : command));

    return {
      binary: this.dockerBinary,
      args,
      env: {},
      command: String(command == null ? '' : command),
      isolation: this.describeIsolation(),
    };
  }
}

/**
 * Convenience factory — pick a runtime by name without callers
 * needing to require each class explicitly.
 *
 * @param {string} name  'docker' | 'null' | undefined
 * @param {object} [opts]
 * @returns {SandboxRuntime}
 */
function getRuntime(name, opts) {
  switch (name) {
    case 'docker': return new DockerRuntime(opts);
    case 'null':
    case undefined:
    case null: return new NullRuntime();
    default:
      throw new Error(`Unknown sandbox runtime: ${name}. Known: docker, null`);
  }
}

module.exports = {
  SandboxRuntime,
  NullRuntime,
  DockerRuntime,
  DOCKER_DEFAULTS,
  getRuntime,
};
