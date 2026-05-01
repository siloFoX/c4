# `c4 config validate` CLI subcommand

Branch: `dgx-spark/cli-config-validate`

## What ships

`c4 config validate [path]` reads `config.json` (default
`<repo>/config.json`, override with `[path]`), runs the
`config-validate.js` validator, prints a coloured report
(error / warn / info), and exits with `1` when any errors
were reported. CI-friendly — pipelines can run the CLI as a
pre-deploy step and fail the build on schema regressions.

The validator itself (`src/config-validate.js`) covers:

- `daemon.port` / `daemon.host` types + ranges.
- `targets.*` shape and `type: 'local' | 'ssh' | 'docker'`.
- `projects.*.root` directory existence (info-level only —
  doesn't fail builds when the path is absent on a CI runner).
- `departments.*.workerQuota` / `monthlyBudgetUSD` ranges.
- `fleet.peers.*.host` / `port` / `authToken` shape.

The branch also bundles the same five subsystems as the other
audit-* / sqlite-* PRs (audit-sqlite, config-validate,
failure-patterns, worker-metrics + MetricsBar).

## Tests

`tests/config-validate.test.js` — 22 assertions across 2
suites:

1. Validator behaviour — clean config, daemon.port type
   errors, projects.root info-level path notes, departments
   quota errors, targets.type unknown rejection, fleet.peers
   host/port shape.
2. **Review fix (2026-05-01)**: CLI wireup contract — source
   declares the validate subcommand alongside reload, defaults
   to `<repo>/config.json`, exits 1 on missing file / invalid
   JSON, runs `validate` + `printReport`, exits with the report
   status, uses the top-level `fs` / `path` imports (no
   inline `require()` re-imports), and the help text lists
   `config validate [path]`.

## Review round 1 fixes (2026-05-01)

- **Discoverability**: `config validate` was missing from the
  CLI help block — operators had no way to find it without
  reading the source. Added a help line right under
  `config reload`.
- **Style**: the subcommand block re-imported `fs` and `path`
  inline (`require('fs')`, `require('path')`) even though
  both modules are imported at the top of `cli.js`. Cleaned
  up to use the top-level bindings.
- **Test gap**: the validator had behavioural tests but the
  CLI wireup itself was untested. Added 6 source-grep
  assertions on the `args[0] === 'validate'` block + help
  text so a future refactor can't silently break the
  subcommand contract.

## Test results

`npm test` full suite: 119 / 120 pass — the lone failure is
the pre-existing `file-transfer` test PR #24 fixes (unchanged
baseline). 22 / 22 config-validate tests pass.

## Test plan (manual)

```bash
# 1. Clean config — exit 0
$ c4 config validate
Config OK — no issues found.
$ echo $?
0

# 2. Bad port — exit 1
$ jq '.daemon.port = "string"' config.json > /tmp/bad.json
$ c4 config validate /tmp/bad.json
error   daemon.port: must be a number
1 error(s), 0 warning(s), 0 info
$ echo $?
1

# 3. Missing file — exit 1
$ c4 config validate /no/such/file.json
config not found: /no/such/file.json
$ echo $?
1
```
