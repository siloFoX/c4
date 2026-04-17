# Fresh Install Verification Runbook (8.11)

Goal: confirm that a new user on a fresh machine can walk `git clone` ->
`npm install` -> `c4 init` -> `c4 daemon start` -> browse the Web UI
without getting stuck on a missing dependency, hardcoded path, wrong
Node.js version, or a broken `build:web` pipeline.

Two complementary layers:

1. `tests/install-verify.test.js` -- offline smoke test. Copies the repo
   via `fs.cpSync` into `os.tmpdir()/c4-install-<rand>` (excluding
   `node_modules`, `.git`, `web/node_modules`, `web/dist`, `c4-worktree-*`,
   and `.c4-*` markers), then asserts the install surface (scripts, bin,
   engines, deps, config defaults). Runs as part of `npm test`.
2. This runbook -- the steps a human walks when validating a real fresh
   clone on a new host (DGX, laptop, CI runner). The `tests/` layer is
   necessary but not sufficient: it cannot prove the network path, the
   NPM registry, or native-module build (node-pty) actually work on the
   target host.

---

## 1. Automated layer (fast, offline)

```bash
npm test
```

The `install-verify` file asserts:

- **Copy surface**: `package.json`, `README.md`, `src/cli.js`,
  `src/daemon.js`, `src/static-server.js`, `web/package.json`,
  `web/vite.config.ts`, `web/src`, `config.example.json`, `CLAUDE.md`
  are all present after `fs.cpSync`.
- **Copy exclusions**: `node_modules`, `.git`, `web/node_modules`,
  `web/dist`, `.c4-task.md`, `.c4-last-test.txt` are absent.
- **Root `package.json`**: `scripts` has `start` / `daemon` /
  `build:web` / `test`; `build:web` invokes `npm --prefix web install`
  and `npm --prefix web run build` as a single string; `bin.c4` points
  to `src/cli.js` (and the file actually exists); `engines.node`
  requires `>= 18`; runtime deps include `node-pty` and `nodemailer`.
- **Web `package.json`**: `scripts.dev` and `scripts.build` exist;
  `vite`, `react`, `react-dom` are pinned.
- **Init prerequisites**: `config.example.json` parses and
  `daemon.port === 3456`; `src/cli.js` declares `init` + `daemon`
  subcommands literally.

Expected: `tests/install-verify.test.js` finishes in well under 1s.
Full suite: 65 / 65 pass.

### Full mode (actual npm install + vite build)

```bash
C4_INSTALL_VERIFY_FULL=1 node --test tests/install-verify.test.js
```

Adds three heavy assertions:

- `npm install` at the copy root produces `node_modules/`.
- `npm --prefix web install` produces `web/node_modules/`.
- `npm --prefix web run build` emits `web/dist/index.html` whose body
  contains an `<html>` tag.

Each step has a 300s timeout. With a warm npm cache the whole suite
runs in about 5s; cold cache adds the download time. Kept out of
`npm test` so the default run stays offline and fits the 30s
per-file cap in `tests/run-all.js`.

---

## 2. Manual layer (real fresh clone)

Use this when validating a new host (DGX, build box, teammate laptop)
or after a dependency bump.

### 2.1 Prerequisites

- Node.js >= 18 (verify: `node --version`)
- `git` (any modern version)
- The `claude` CLI on `PATH` (`which claude`) -- required for real
  workers but not for the install-flow check itself

### 2.2 Steps

Run each command on its own line. Do not chain with `&&` / `|` / `;`
(keeps the runbook copy-pasteable from both bash and PowerShell, and
matches the C4 compound-command policy).

```bash
git clone https://github.com/siloFoX/c4.git /tmp/c4-fresh
cd /tmp/c4-fresh
npm install
npm run build:web
```

If all four commands exit 0 you should see:

```
/tmp/c4-fresh/node_modules/            # populated
/tmp/c4-fresh/web/node_modules/        # populated
/tmp/c4-fresh/web/dist/index.html      # built React bundle
```

Continue:

```bash
npx c4 init
npx c4 daemon start
curl -s http://localhost:3456/health
curl -s http://localhost:3456/ | head -c 200
```

Expected:

- `c4 init` creates `config.json`, wires `~/.claude/settings.json`,
  registers the `c4` command (npm link or `~/.local/bin/c4` fallback),
  and installs the git hooks.
- `c4 daemon start` prints the PID and listens on `127.0.0.1:3456`
  (or `0.0.0.0:3456` if `--yes-external` was chosen).
- `/health` returns JSON with `status: "ok"`.
- `/` returns the built React index.html (starts with `<!DOCTYPE html>`).

Browse `http://localhost:3456/` from the same host (or over SSH
port-forward) and confirm the Web UI loads.

### 2.3 Cleanup

```bash
npx c4 daemon stop
rm -rf /tmp/c4-fresh
```

---

## 3. Common failures and fixes

| Symptom | Likely cause | Fix |
|---|---|---|
| `npm install` fails in `node-pty` | No C/C++ toolchain (Linux: `build-essential`; Windows: VS Build Tools) | Install the toolchain, `rm -rf node_modules`, retry |
| `npm run build:web` errors with `tsc` not found | `web/node_modules` not installed | `npm --prefix web install` (the `build:web` script runs it first, but an interrupted run can leave a partial tree -- delete `web/node_modules` and rerun) |
| `c4 daemon start` prints `bind EADDRINUSE` on 3456 | Port taken by another process / a stale daemon | `c4 daemon stop`, then `c4 daemon start`. If still stuck, check `logs/daemon.pid` and the troubleshooting runbook |
| `c4` command not found after `npm link` | `~/.local/bin` not on `PATH` | Re-run `c4 init` -- it auto-patches `~/.bashrc` / `~/.zshrc` with the PATH export |
| `web/dist/index.html` missing after `npm install` | The `build:web` script was not run | `npm run build:web` (or let `c4 init` handle it the first time) |
| Daemon starts but Web UI returns 503 | `web/dist` absent | `npm run build:web`, then `c4 daemon restart` |

---

## 4. When to re-run

- Before a release: run the manual flow on at least one Linux host and
  one Windows host (matches the README platform badge).
- After editing `package.json` / `web/package.json` / `config.example.json`
  / `src/cli.js` init path: run `npm test` (automated layer catches
  drift in scripts, bin, engines, deps).
- After bumping a runtime dep (`node-pty`, `nodemailer`, `vite`,
  `react`): run the full-mode automated layer
  (`C4_INSTALL_VERIFY_FULL=1`) to exercise the actual build.

---

Related:
- Test file: `tests/install-verify.test.js`
- TODO row: 8.11
- Install section in the top-level `README.md`
