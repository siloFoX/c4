# Risk Classifier & Sandbox — Operator Guide

C4 ships a layered defense for the commands its workers run: a
classifier that flags risky commands at hook time, and a sandbox
runtime that can isolate (or shadow-execute) commands the operator
explicitly opts into.

This doc walks an operator through enabling each layer and the
trade-offs at each step. The features are independent — you can
enable just the classifier (a fast static check) without ever
configuring a sandbox.

## Layer 1 — The classifier

Static rule engine. Runs on every Bash command before the worker's
PreToolUse hook releases. Pure regex; no exec, no network, no
process spawn.

### Enable

```json
// config.json
{
  "riskClassifier": {
    "enabled": true,
    "autoDenyLevel": "critical"
  }
}
```

`autoDenyLevel` can be `low | medium | high | critical`. Default
`critical` means only the worst patterns block; bumping to `high`
also blocks things like `git push --force` and `npm publish`.

### Operator-supplied rules

```json
{
  "riskClassifier": {
    "enabled": true,
    "autoDenyLevel": "high",
    "allowList": ["^git push origin --force-with-lease"],
    "denyList": ["^chmod 777 \\$HOME"],
    "customRules": {
      "high": [
        { "code": "internal-deploy", "label": "Internal deploy script",
          "pattern": "^./deploy\\.sh", "flags": "i" }
      ]
    }
  }
}
```

`allowList` regexes bypass classification entirely (force `low`).
`denyList` regexes force `critical` regardless of catalog match.
`customRules` extend the built-in catalog. All are validated at
config-load time — bad regex sources fail validate with a clear
path.

### Observation mode

```json
{
  "riskClassifier": {
    "enabled": true,
    "dryRun": true,
    "autoDenyLevel": "high"
  }
}
```

`dryRun: true` runs the classifier but never blocks — every match
is logged as `risk.dryRun` instead of `risk.denied`. Use this to
tune `autoDenyLevel` against your real workload before flipping
enforcement on.

### CLI

```sh
# Classify a candidate command without executing it
c4 risk "rm -rf /tmp/test"
# JSON output for scripts
c4 risk "rm -rf /tmp/test" --json
# Show the post-deobfuscation form (catches base64 / ${IFS} / etc.)
c4 risk "echo cm0gLXJmIC8K | base64 -d | sh" --decoded

# Catalog inspector
c4 risk patterns

# Aggregate denies + dry-runs over the last N hours
c4 risk stats --window-hours 168 --json
```

### HTTP

```sh
# Same as `c4 risk` over HTTP
curl -X POST http://localhost:3456/api/risk/check \
  -H 'content-type: application/json' \
  -d '{"command":"rm -rf /tmp/test"}'

# Stats endpoint — includes shadow exec activity (see Layer 2)
curl http://localhost:3456/api/risk/stats?windowHours=24
```

## Layer 2 — The sandbox runtime

Wraps a command in an OS-level isolation layer (Docker today;
chroot / firejail planned). Two modes:

1. **Preview** (pure builder) — `prepareArgs(command)` returns
   the exact `docker run …` argv that WOULD isolate the command.
   No exec; useful for "show the operator what would happen"
   without committing to running it.
2. **Shadow execution** — actually runs the prepared argv,
   captures stdout/stderr/exitCode/duration. Gated by
   `allowExec: true`; refused otherwise.

### Configure the runtime

```json
{
  "riskClassifier": {
    "sandbox": {
      "name": "docker",
      "opts": {
        "image": "alpine:latest",
        "memory": "128m",
        "cpus": "0.5",
        "network": "none"
      }
    }
  }
}
```

DockerRuntime defaults are already conservative: `--read-only`,
`--cap-drop=ALL`, `--security-opt=no-new-privileges`,
`--user=nobody`, `--pids-limit=64`, `--tmpfs=/tmp:rw,size=64m`,
5s host-side timeout. `opts` overrides any of these per-call.

`name: "null"` selects NullRuntime — no isolation. Useful as a
typed escape hatch in tests; refused at exec time (see below).

### Verify the runtime

```sh
$ c4 doctor
…
✓ sandbox runtime: docker reachable — network=none, memory=128m cpus=0.5 pids=64 timeout=5000ms [shadow exec disabled — set allowExec:true to enable]
```

A failed Docker probe surfaces here:

```sh
✗ sandbox runtime: docker probe failed — Cannot connect to the Docker daemon at unix:///var/run/docker.sock
```

### Preview from CLI

```sh
$ c4 risk "rm -rf /tmp/test" --sandbox-preview docker
Level:    HIGH
…
Sandbox runtime: docker
  available: true
  isolation: network=none, fs=read-only root + tmpfs /tmp (64m)
             memory=128m cpus=0.5 pids=64 timeout=5000ms
  command:
    docker run --rm --network=none --memory=128m --cpus=0.5 \
      --pids-limit=64 --read-only --tmpfs=/tmp:rw,size=64m \
      --user=nobody --security-opt=no-new-privileges --cap-drop=ALL \
      alpine:latest sh -c 'rm -rf /tmp/test'
```

When `riskClassifier.sandbox` is configured, `c4 risk` and
`POST /api/risk/check` both auto-attach a `sandbox` field to the
response — the operator sees classification + would-be-exec in
one call without typing `--sandbox-preview` each time.

### Preview over HTTP

```sh
curl -X POST http://localhost:3456/api/risk/preview \
  -H 'content-type: application/json' \
  -d '{"command":"rm -rf /tmp/test","runtime":"docker"}'
```

## Layer 3 — Shadow execution

> **Default-off.** Shadow exec is a security-sensitive feature.
> Enabling it means `POST /api/risk/exec` will actually run the
> submitted command in your configured sandbox.

### Enable

```json
{
  "riskClassifier": {
    "sandbox": {
      "name": "docker",
      "allowExec": true,
      "opts": { "memory": "256m", "cpus": "1.0" }
    }
  }
}
```

`config-validate` will:

- **error** when `allowExec: true` + Docker probe fails (broken
  runtime + intent to actually run)
- **warn** when `allowExec: true` + `name: "null"` (NullRuntime
  refuses exec anyway — meaningless combo)

`c4 doctor` promotes the sandbox row to **warn** when
`allowExec=true` is set, so the operator is reminded.

### Run from CLI

```sh
# When riskClassifier.sandbox.allowExec=true
$ c4 risk "echo hello" --shadow-exec
Level:    LOW
Action:   allow
…
Shadow execution:
  runtime:    docker
  exitCode:   0
  durationMs: 350
  killed:     false
  stdout:
    hello

# When allowExec is not enabled
$ c4 risk "echo hello" --shadow-exec
Level:    LOW
…
Shadow execution:
  refused: riskClassifier.sandbox.allowExec is not true — set to enable shadow exec
```

### Run over HTTP

```sh
curl -X POST http://localhost:3456/api/risk/exec \
  -H 'content-type: application/json' \
  -d '{
    "command": "echo hello",
    "runtime": "docker",
    "timeoutMs": 5000
  }'
```

Response shape (always returned, every code path):

```json
{
  "exitCode": 0,
  "stdout": "hello\n",
  "stderr": "",
  "stdoutHash": "f3e7d8c2b1a09576",
  "stderrHash": "0e9d8b7f6c5a4321",
  "durationMs": 350,
  "killed": false,
  "command": "echo hello",
  "runtime": { "name": "docker", "isolation": {...} },
  "spawnError": null,
  "refused": null,
  "refusedReason": null
}
```

Three refusal layers, all surfaced in the standard envelope:

1. `allowExec !== true` → `refused: true, refusedReason: "…"`
2. Effective runtime is NullRuntime → `refused: true,
   refusedReason: "executeInSandbox refuses NullRuntime — no
   isolation == no exec"`
3. Runtime probe fails (e.g. docker daemon down) → `spawnError:
   "docker probe failed: …"`

### Hard limits

- **Timeout**: 5000ms default, clamped to `[100ms, 5min]`. SIGKILL
  on expiration. Override per-call via `timeoutMs`.
- **Buffer cap**: 16KB per stream default, clamped to `[1KB, 1MB]`.
  Truncated output gets `\n[...truncated]\n` appended. Override
  per-call via `bufferLimit`.
- **Concurrency**: not enforced. The endpoint is stateless; if you
  POST 100 calls simultaneously you get 100 docker invocations.
  Operators wanting rate limiting should put a proxy in front.

### Content fingerprints

Every result envelope carries `stdoutHash` + `stderrHash` —
SHA-256 hex truncated to 16 chars. Two runs of the same
deterministic command produce identical hashes. The audit chain
event (`risk.shadow_exec`) carries the hashes (not the full
content) so chain rows stay lean while preserving cross-check
capability.

Full content stays in scribe-v2 (`c4 events --type
risk_shadow_exec`).

## Audit + observability

| Event type           | Fires on                                  |
|----------------------|-------------------------------------------|
| `risk.denied`        | classifier blocked a command (enforced)   |
| `risk.dryRun`        | classifier matched but enforcement was off |
| `risk.shadow_exec`   | `/risk/exec` ran a command in the sandbox |
| `risk.ai_feedback`   | external LLM POSTed a verdict on a command |

All four go through:

- **Audit chain** (`audit.jsonl`) — hash-chained, tamper-detectable
  via `GET /api/audit/verify`.
- **scribe-v2 timeline** (`events-YYYY-MM-DD.jsonl`) — queried via
  `c4 events --type risk_deny` / `--type risk_shadow_exec`.
- **Slack notification** (when a webhook is configured + the event
  passes the level threshold).

Stats:

```sh
# Aggregate denies (and dry-runs) AND shadow exec activity over a window
c4 risk stats --window-hours 168
```

## Choosing a setup

| Scenario                                        | Layer 1 | Layer 2 (preview) | Layer 3 (exec) |
|-------------------------------------------------|:-------:|:-----------------:|:--------------:|
| L4 autonomous worker on prod data                | ✓       | ✓                 |                |
| Dev env, want visibility but not enforcement     | ✓ dryRun |                   |                |
| Untrusted user input → c4 worker                 | ✓       | ✓                 | ✓              |
| Pure unit test environment                       |         |                   |                |
| Auditing what risky commands have been run       | ✓       | ✓                 | ✓              |

The classifier is cheap (microseconds per command); enabling it is
the right default. The sandbox preview adds value when operators
want to see "what would this do isolated"; it costs nothing
(pure builder). Shadow exec is the heavyweight option — useful for
"run this in jail and tell me what it did" workflows but should
NOT be the default.

## Pending follow-ups

- Web UI surface for shadow exec (Phase 11.5 cosmetic — endpoint
  is HTTP-ready)
- chroot / firejail runtimes (env-specific OS binaries; design
  same as DockerRuntime)
- Per-row stdout/stderr capture in the audit chain (currently lean
  fingerprint-only — fingerprints are the right default for
  hash-chained logs)

## Further reading

- [`src/risk-classifier.js`](../src/risk-classifier.js) — pattern
  catalog (121 patterns + 13 obfuscation defeats as of v1.10.188;
  `c4 risk patterns` lists the current effective rule set,
  `c4 risk patterns --tier <critical|high|medium>` filters to
  one tier)
- [`src/risk-sandbox-runtime.js`](../src/risk-sandbox-runtime.js)
  — SandboxRuntime interface + DockerRuntime
- [`src/risk-sandbox-exec.js`](../src/risk-sandbox-exec.js) —
  `executeInSandbox()` (refuses NullRuntime, hard timeout, buffer
  caps, in-band error envelope)
- [`tests/risk-shadow-exec-docker.test.js`](../tests/risk-shadow-exec-docker.test.js)
  — real Docker integration tests (gated on `which docker`)
