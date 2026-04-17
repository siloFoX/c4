# Changelog

## [Unreleased]

### Added
- **Cost / retry guardrails for unattended operation (9.10):** spawn-time financial safety so overnight runs cannot burn through unbounded tokens on a fix-loop. `src/pty-manager.js` gains `_resolveBudgetUsd` / `_resolveMaxRetries` / `_buildClaudeArgs`: every `claude` spawn now routes through a single arg builder that appends `--max-budget-usd <n>` when the effective budget > 0 (precedence per-task override -> `config.workerDefaults.maxBudgetUsd` -> default 5.0; `<=0` disables the flag so existing zero-configured installs keep identical spawn args). `--resume` still stacks before the budget flag. Both local and SSH branches of `create()` share the builder so remote workers get the same guard. Worker record gains `_budgetUsd`, `_maxRetries`, `_retryCount`, `_stopReason`. New `recordRetry(name, reason)` increments the counter, pushes a `[RETRY]` progress note via `_notifications.pushAll` below the cap and, once the count reaches the configured limit, sets `_stopReason`, fires a `[SAFETY STOP]` Slack push + `_flushAll()`, and invokes `close(name)`; subsequent `recordRetry` calls are no-ops so the safety stop is single-shot. `c4 task` gains `--budget <usd>` / `--max-retries <n>` with validation + forwarding via the `/task` body; the daemon passes both through `sendTask` -> `_createAndSendTask` -> `create()`. `c4 token-usage --per-task` (GET `/token-usage?perTask=1`) adds a `perTask` array from `_getPerTaskUsage` with `{name, sessionId, branch, task, input/output/total, retryCount, maxRetries, budgetUsd, stopReason, alive}` sorted by descending total; `_readSessionTokens` resolves the Claude `projects/<encoded>` subdir from the worktree path first, then falls back to `_getProjectDir()`. Config additions (`config.example.json`): `workerDefaults.maxBudgetUsd: 5.0`, `workerDefaults.maxRetries: 3`. Tests: `tests/cost-guard.test.js` adds 18 assertions across 3 suites - (a) budget flag appended under default/config/per-task paths + non-claude passthrough + --resume ordering, (b) retry counter increments, stops exactly on the boundary with close + [SAFETY STOP] Slack push + flushAll, stays off at `maxRetries=0`, errors on unknown worker, single-shot after stop, (c) per-task override wins, (d) disabled on `<=0`, `0`, negative, and NaN. Helpers are extracted from `src/pty-manager.js` via regex + `new Function` (same pattern as `tests/worktree-gc.test.js` / `tests/worker-language.test.js` / `tests/hook-setup.test.js`) so drift between the real implementation and the tests surfaces immediately without pulling `node-pty`. Full suite 63 / 63 pass. Web UI live-cost dashboard is deferred as a follow-up; spawn-level enforcement + per-task readout is the safety-critical path and ships now.
- **Daemon-internal worktree GC automation (9.11):** new `_runWorktreeGc` on `PtyManager` plus `startWorktreeGc`/`stopWorktreeGc` wired into `src/daemon.js` startup / SIGINT / SIGTERM. The GC lists c4-worktree-* entries via `git worktree list --porcelain` and removes only those that are simultaneously (a) not owned by any alive worker, (b) inactive beyond `daemon.worktreeGc.inactiveHours` (default 24h, measured from `.git/logs/HEAD` mtime with a directory-mtime fallback), (c) clean (no `git -C <wt> status --porcelain` output), and (d) merged into main per `git branch --merged main`. Dirty candidates reuse the existing `_notifyLostDirty` channel and emit a `[GC WARN]` console line rather than being touched. The manual `c4 cleanup` command, `_cleanupLostWorktrees`, and `_cleanupOrphanWorktreesByList` are untouched - GC extends them, not replaces them. Config knobs under `daemon.worktreeGc`: `enabled` (bool, default true), `intervalSec` (default 3600, min clamp 60), `inactiveHours` (default 24), `mainBranch` (default "main"). `tests/worktree-gc.test.js` adds 14 assertions across 5 suites - (a) active-worker skip, (b) clean+merged+inactive removal with branch -D, (c) dirty worktree preservation + `[GC WARN]` + `[LOST DIRTY]` notification, (d) `enabled:false` short-circuit - plus decision-helper edge cases (`branch-not-merged`, `recent-activity`, `inactive-merged-clean`) and start/stop timer semantics. Tests extract the real implementation via regex + `new Function` (same pattern as `tests/worker-language.test.js`/`tests/hook-setup.test.js`) so drift between implementation and tests surfaces immediately. Full suite 62 / 62 pass.
- **Daemon serves built web UI on port 3456 (8.12):** new `src/static-server.js` (pure Node, no express) exports `serveStatic` with SPA fallback, path-traversal containment, MIME map, and 503 + `build:web` hint when `web/dist` is missing. `src/daemon.js` aliases `/api/<x>` -> `/<x>` via a new `resolveApiRoute` helper (vite dev proxy strips the prefix in dev; this aliasing keeps the same semantics in prod) and falls through to `serveStatic` for unmatched non-/api GET/HEAD. `vite.config.ts` unchanged so HMR still works via `npm --prefix web run dev`. `package.json` gains a `build:web` script (`npm --prefix web install && npm --prefix web run build`). `c4 init` auto-runs `npm run build:web` when `web/dist` is absent (300s timeout, non-fatal on failure). `c4 daemon start` warns via `webDistExists` but still boots. Result: one forwarded port (3456) is enough — `curl http://localhost:3456/` returns the React bundle, `curl http://localhost:3456/api/list` mirrors `/list`. README "Web UI Access" section added. `tests/daemon-static-serve.test.js` adds 25 node:test assertions (mimeFor 5 + resolveSafePath 3 + pickFile 6 + webDistExists 3 + resolveApiRoute 4 + serveStatic 7 — stream.PassThrough sink, no live daemon spawn). Full suite 61 / 61 pass.

## [1.6.20] - 2026-04-17

### Fixed
- **`c4 wait --all` no longer hangs on intervention workers** (7.21): before this fix `c4 wait --all` reused the single-completion multi-worker path, so a worker parked in an approval prompt (intervention state) could block the caller indefinitely even when other workers were already idle. `PtyManager.waitAndReadMulti` now accepts a `waitAll` option and resolves only once every target worker has reached a terminal state — idle, exited, or intervention — and returns a `status:'all-settled'` envelope with a per-worker `results` array (`{name, status, intervention, content}`). Intervention is treated as terminal under `waitAll`, so all-intervention and mixed idle+intervention swarms resolve immediately instead of hanging; the existing first-completion semantics for `c4 wait w1 w2 w3` (without `--all`) are preserved. Wire-up: the CLI passes a new `waitAll=1` query parameter to the daemon `/wait-read-multi` endpoint and prints the per-worker report (including any `intervention: <kind>` tag) so the manager can immediately triage which workers need approval. `tests/parallel-wait.test.js` adds four node:test cases covering (a) all-idle returns immediately (<500 ms), (b) mixed idle + intervention returns both with correct state, (c) all-intervention resolves instead of hanging, and (d) timeout reports per-worker `busy`/`idle` without losing the intervention field. Full suite 60 / 60 pass.

## [1.6.19] - 2026-04-17

### Fixed
- **PostToolUse hook recurrence verification + ASCII hardening** (7.23): 7.16 introduced `src/hook-relay.js` to replace the curl/PowerShell hook commands that had been producing "Failed with non-blocking status code" loops on Korean Windows. Re-verified under v1.6.18 runtime: 11 recent worker session logs (~4 MB combined) grep for `Failed with non-blocking` returns 0 occurrences; the live worker's `.claude/settings.json` renders each hook as `node "<abs>/hook-relay.js" http://<host>:<port>/hook-event` with no shell operators, no PowerShell, and no curl; direct `spawnSync` invocation confirms `hook-relay.js` exits 0 under every failure mode (unreachable URL, empty stdin, malformed JSON, missing URL arg, malformed URL) and emits nothing to stderr. No runtime code change required beyond a minor hardening: replaced two U+2014 em-dashes in `src/hook-relay.js` comments with ASCII hyphens so the relay source is pure ASCII, matching the 7.16 intent and eliminating a theoretical decode-regression vector.

### Added
- **`tests/hook-setup.test.js`** (7.23 regression): 16 assertions across 3 node:test suites. Extracts `_buildHookCommands` from `src/pty-manager.js` via regex + `new Function` (same pattern as `tests/worker-language.test.js`) so the test stays coupled to the actual implementation without pulling in `node-pty`. Locks: (1) canonical hook shape — PreToolUse + PostToolUse groups, one command each, `type:'command'`; (2) command invokes `node hook-relay.js` with no PowerShell / no `Invoke-RestMethod` / no curl / no compound operators (`&&`, `||`, `;`, `|`); (3) configured + default daemon URL routing (`http://host:port/hook-event`); (4) quoted path is absolute and references an on-disk `hook-relay.js`; (5) command output is pure ASCII; (6) `hook-relay.js` exits 0 under five failure modes and emits no stderr; (7) source hygiene — after stripping comments, the `_buildHookCommands` body never re-introduces PowerShell / IRM / curl, and always routes through `hook-relay.js`. Full suite 60 / 60 pass.

### Fixed (TODO housekeeping)
- Restored the `c4 wait --all` improvement notes that had been accidentally appended to row 7.23's description back to their proper column in row 7.21.

## [1.6.18] - 2026-04-17

### Fixed
- **pendingTask delivery verification + write-failure recovery** (7.22): 7.17 5-point 방어 이후에도 v1.6.16+ 실사용에서 task 2/3 worker가 수동 `c4 send + c4 key Enter` 필요한 증상 재발. 추가 failure mode 3개 차단 + post-write 검증 도입. (1) 모든 delivery 경로(active polling, timeout fallback, post-setup trigger, idle handler pendingTask, auto-resume)에서 `_pendingTaskSent=true`가 `await _writeTaskAndEnter` 이전에 설정돼 PTY write 중 throw 발생 시 `_pendingTaskSent=true`/`_pendingTask=non-null`로 worker가 영구 stuck — try/catch로 감싸 실패 시 `_pendingTaskSent=false`로 복구 + `[C4 WARN]` 스냅샷. (2) `fireFallback`이 `_setupStableAt` 체크 없이 setupDone=true면 즉시 발사 — stable-gate 갭이 ≤2s면 한 번 defer (>2s면 영구 hang 방지로 force-send), attempt=2는 무조건 force-send. (3) idle handler와 auto-resume의 500ms `setTimeout` 스케줄 콜백이 state 재검증 없이 write — 내부에서 `worker.alive`/`isReady(screen)`/`stableGateOk`/`setupDone` 재확인, 어긋나면 abort + `_pendingTaskSent=false` 복구 + 구체적 어긋난 조건이 담긴 snapshot, auto-resume은 queue head로 되돌려 idle handler retry. 추가로 `_schedulePendingTaskVerify(worker)` 신설: 성공 write 이후 1500ms 뒤 화면이 여전히 idle 프롬프트면 `\r`만 한 번 재전송 (단발). `workerDefaults.pendingTaskVerifyMs`로 delay 조정, `pendingTaskVerifyEnabled=false`로 기능 off. 새 worker 필드 `_pendingTaskAttempts`(진단) / `_pendingTaskVerifyTimer`는 4개 cleanup 지점(existing replace / exit handler / session resume / close) 모두 해제. `tests/pending-task-verify.test.js` 22 assertions (verify 8 + write-failure 4 + fallback stable-gate 5 + idle-path revalidation 5). 전체 59 suites pass.

## [1.6.17] - 2026-04-17

### Fixed
- **package-lock.json env-drift guard** (7.29): 세션 시작부터 `web/package-lock.json`이 `M` 상태로 떠서 `c4 merge` 때마다 stash 대상이 되고 의미 없는 diff를 양산하던 문제 해결. 조사 결과 원인은 npm 버전/플랫폼 드리프트 — 커밋된 lockfile이 8개의 `"peer": true` 메타데이터를 포함했고, 로컬 npm 10.8.2가 `npm install --package-lock-only` 재계산 시 이들을 strip해서 발생. c4 코드 경로 어디에서도 `npm install`을 돌리지 않음 (`grep src/` 0건) — 트리거는 사용자가 `npm --prefix web` 계열 명령을 수동 실행할 때. 신규 `src/pkglock-guard.js` (`analyzeDiff`/`buildAdvice`/`runCli`)가 `"peer": true`-only 시그니처를 감지. `.githooks/pre-commit`이 스테이징된 lockfile에 대해 가드를 호출해 env-드리프트 진단 메시지 출력 (warning only — commit 진행). `tests/pkglock-guard.test.js`(27 assertions) + `tests/fixtures/pkglock-peer-drift.diff`로 실제 8라인 drift payload를 regression fixture로 고정. `docs/known-issues.md`에 근본 원인/재현/권장 워크플로우/gitignore 금지 근거 섹션 추가. `patches/1.6.17-pkglock-env-drift.md`. lockfile을 gitignore하면 `npm ci` 재현성이 깨지므로 명시적으로 채택하지 않음.

## [1.6.16] - 2026-04-17

### Added
- **Web UI external (LAN) access** (8.10): vite dev server와 c4 daemon 모두 기본 `127.0.0.1` 바인딩이라 외부 IP에서 접근 불가하던 문제 해결. `web/vite.config.ts`에 `server.host: '0.0.0.0'` + `port: 5173` 추가. 데몬은 `config.daemon.bindHost`(없으면 legacy `host`, 기본 `127.0.0.1`)로 listen하도록 변경 — backward compat 유지. 새로운 `src/web-external.js` 모듈에 `resolveBindHost`/`detectLanIP`/`enableViteExternal`/`setDaemonBindHost` 순수 함수 분리. `c4 init`이 "Enable Web UI external (LAN) access? (y/N)" 프롬프트 추가, `--yes-external`/`--no-external` 플래그로 scripted 실행 지원. yes 응답 시 vite.config.ts에 host 자동 주입(idempotent), `config.json`의 `daemon.bindHost=0.0.0.0` 저장, `os.networkInterfaces()` 기반 LAN IP 자동 감지·Web UI/Daemon URL 출력, 방화벽/JWT(8.1) 경고, `c4 daemon restart` 안내. `C4_BIND_HOST` 환경변수로 런타임 오버라이드도 지원. README.md에 "External (LAN) Access for the Web UI" 섹션 추가. `tests/daemon-bindhost.test.js`(8 assertions) + `tests/init-web-external.test.js`(16 assertions).

## [1.6.15] - 2026-04-17

### Fixed
- fix: c4 merge guards against uncommitted changes (7.28)
- fix: preserve src/cli.js executable bit across merges (7.27)
- **prevent manager halt from compound/markdown commands** (7.26): `.claude/agents/manager.md`에 '명령 생성 규칙 (halt 방지)' 섹션 추가 — 복합/파이프/루프/cd-chain 절대 금지, git -C / npm --prefix / c4 wait 대안, c4 task/send 메시지 규칙(markdown 헤더 금지, 긴 스펙 파일화), 위반 시 대응 프로토콜. 자동 파일화 안전망(`_maybeWriteTaskFile`, src/pty-manager.js:1185)은 5.35 + 5.49에서 이미 도입돼 1000자 초과 또는 `#` 포함 메시지를 `.c4-task.md`로 변환 (sendTask 및 _buildTaskText 경로 공통). `tests/manager-command-rules.test.js` 6 assertions로 문서 섹션 유지 검증.

### Changed
- **manager 세션 launch 명령 플래그 보강** (7.24): CLAUDE.md, README.md, README.ko.md, src/cli.js (c4 init 출력), docs/handoff.md 5곳의 `claude --agent` 안내에 `--model opus --effort max --name c4-manager` 플래그 추가. 관리자 세션을 최고 effort + Opus 모델 + 고정 세션 이름(c4-manager)으로 시작하도록 일관 유도. `--name c4-manager`는 세션 식별자 고정으로 scribe/로그 상관관계 추적 및 관리자 세션 재진입 시 동일성 확보에 기여.

### Fixed
- **c4 init이 git identity 체크/설정, merge가 identity 부재 시 명확 에러** (7.25): 야간 자동 실행이 `git config user.name/user.email` 부재로 `c4 merge` 실패 → 관리자가 `GIT_AUTHOR_NAME=... c4 merge` env prefix workaround 시도 → `Bash(c4:*)` 권한 패턴이 env prefix와 매치 안 되어 permission prompt에서 halt하던 문제 해결. 신규 `src/git-identity.js` 모듈이 `ensureIdentity` / `identityComplete` / `missingIdentityKeys` 제공. `c4 init`은 TTY에서 name/email 프롬프트 후 `git config --global` 저장, non-TTY에서는 경고만 (덮어쓰기 금지). `c4 daemon start|restart`는 미설정 시 경고 출력 후 정상 진행, `c4 merge`는 명확 에러 + exit 1 (env workaround 힌트 없음). `.claude/agents/manager.md`에 env prefix workaround 금지 규칙 추가. `tests/git-identity.test.js` 26 assertions.
- **c4 init PATH 자동 등록** (7.20): 7.13에서 `~/.local/bin/c4` symlink는 만들지만 `~/.local/bin`이 PATH에 없으면 `c4` 명령이 동작하지 않던 문제 해결. init이 PATH 포함 여부를 확인해 누락이면 `~/.bashrc`에 `export PATH="$HOME/.local/bin:$PATH"` 블록 자동 추가 (marker 기반 중복 방지). SHELL이 zsh이면 `~/.zshrc`도 함께 갱신. 로직은 `src/init-path.js`로 분리하여 fs dependency injection으로 테스트. `tests/init-path.test.js` 30 assertion 추가.

## [1.6.14] - 2026-04-17

### Changed
- **worker setup 슬래시 명령 전환** (7.19): `/effort <level>` + `/model <value>` 슬래시 명령 기반으로 전환. `_finishSetup` 헬퍼 분리. `tests/setup-slash.test.js` 16개 테스트

### Fixed
- **pendingTask 5-point 방어** (7.17): setupDone 후 stabilization window, isReady 2연속 확인, timeout fallback 가드, drain 동기화, enterDelayMs 설정화

## [1.6.13] - 2026-04-17

### Added
- **worker 영어 전용 모드** (7.18): `workerDefaults.workerLanguage: "en"` 옵션 추가. 설정 시 `_getRulesSummary()`가 "Respond in English only." 지시문을 자동 삽입

### Fixed
- **PreToolUse hook 인코딩 깨짐** (7.16): PowerShell/curl hook stderr를 suppress하여 인코딩 깨짐 + escalation 오탐 방지

## [1.6.12] - 2026-04-17

### Added
- **c4 init Linux PATH 개선** (7.13): npm link 실패 시 ~/.local/bin/c4 심볼릭 링크 자동 생성 + ~/.bashrc alias 폴백
- **c4 init --agent 안내** (7.14): init 완료 후 관리자 모드 시작 안내 메시지 출력
- **daemon 버전 불일치 경고** (7.15): c4 health/daemon status에서 daemon 버전과 설치 버전 비교, 불일치 시 restart 안내

## [1.6.11] - 2026-04-17

### Fixed
- **pendingTask Enter 누락 완전 해결** (7.1): 5.18에서 send()에만 적용했던 "input/CR 분리 전송" 패턴이 pendingTask delivery 9개 경로에는 전파되지 않아 동일 PTY/Claude Code 타이밍 문제로 Enter 인식 실패. `_writeTaskAndEnter()` 헬퍼 추가하여 모든 경로 교체

## [1.6.10] - 2026-04-16

### Fixed
- **pendingTask 근본 해결** (5.51): idle handler pendingTask 블록에 setupDone 가드 추가. setupPhase='done'~setupDone=true 사이 1000ms 창에서 effort 블록을 관통하여 모델 메뉴 활성 상태에서 task가 전송되던 근본 원인 수정. _executeSetupPhase2 완료 후 post-setup 전달 트리거 추가, active polling _chunkedWrite await 처리

## [1.6.9] - 2026-04-16

### Added
- **c4 watch 실시간 스트리밍** (5.42): `c4 watch <name>`으로 worker PTY 출력을 tail -f처럼 실시간 스트리밍. SSE `/watch` 엔드포인트, base64 인코딩, Ctrl+C 종료. `watchWorker(name, cb)` 메서드로 다중 watcher 지원

## [1.6.8] - 2026-04-16

### Added
- **프로젝트 유형별 권한 프로파일** (5.26): web/ml/infra 3종 프리셋 추가. `c4 task --profile web`으로 프로젝트에 맞는 권한 세트 자동 적용. `c4 profiles` 명령으로 전체 프로파일 목록 조회

### Fixed
- **compound command 승인 prompt 해결** (5.48): worker가 `cd path && git commit` 실행 시 Claude Code의 "bare repository attacks" 보안 경고 해결. defaultPerms에 `Bash(cd * && *)` 패턴 추가

## [1.6.7] - 2026-04-16

### Added
- **c4 approve 편의 명령** (5.36): `c4 approve <name> [option_number]` — TUI 선택 프롬프트에서 번호로 옵션 선택. option_number 지정 시 (N-1) Down + Enter 키 전송. CLI, daemon route, pty-manager approve() 3계층 확장
- **관리자 병렬 wait** (5.43): `c4 wait --all` 또는 `c4 wait w1 w2 w3`으로 여러 worker 동시 대기, 첫 idle/exited 시 즉시 반환. `waitAndReadMulti()` 메서드, `/wait-read-multi` daemon 라우트 추가
- **interrupt-on-intervention** (5.44): `c4 wait --interrupt-on-intervention`으로 intervention 감지 시 wait 즉시 종료. 단일/병렬 wait 모두 지원

## [1.6.6] - 2026-04-16

### Fixed
- **c4 send 자동 Enter 누락 수정** (5.18): send()에서 input과 CR을 분리 전송. _chunkedWrite로 input 전송 후 100ms 대기, 별도 proc.write('\r')로 Enter 전송. send()를 async로 변경, daemon.js 호출부에 await 추가

## [1.6.5] - 2026-04-16

### Fixed
- **긴 task 메시지 잘림 근본 수정** (5.35): 1000자 초과 task는 worktree/.c4-task.md 파일로 저장하고 PTY에는 경로만 전달. `_maybeWriteTaskFile()` 헬퍼로 `_buildTaskText()` + `sendTask()` 인라인 빌드 모두 적용. worktree 없으면 기존 방식 유지

## [1.6.4] - 2026-04-16

### Added
- **worker 자동 네이밍** (5.40): `c4 task --auto-name "task text"` 또는 name 생략 시 task 첫 줄에서 영문 단어 추출하여 kebab-case 이름 자동 생성 (w- 접두사, 최대 30자). 중복 시 -2, -3 자동 부여. `_generateTaskName()` 메서드 추가

## [1.6.3] - 2026-04-16

### Added
- **c4 list 10초 cooldown 캐시** (5.39): c4 list 무한 반복 방지. tmpdir에 응답 캐시 저장, 10초 이내 재호출 시 캐시 반환 + [cached] 표시. CLAUDE.md와 manager agent에 c4 list 폴링 금지 규칙 추가

### Fixed
- **Slack 메시지 길이 제한 + task 요약** (5.38): pushAll()에서 2000자 초과 메시지 truncate. _fmtWorker()에서 activity 있어도 task 첫줄 요약 항상 표시. notifyHealthCheck()에서 dead worker에도 task 요약 포함

## [1.6.2] - 2026-04-05

### Added
- **autoApprove에 개발 도구 추가** (5.34): worker defaultPerms에 nvidia-smi(GPU 모니터링), nohup(백그라운드 실행), lsof(포트/파일 잠금), env(환경변수), which(실행파일 경로), whoami, poetry 추가
- **Manager handoff summary injection** (5.12): manager rotation 전 `_injectDecisionSummary()`로 task, compaction count, intervention 경고, active worker 수를 `docs/session-context.md` 상단에 주입
- **Hook Slack routing on deny** (5.10): `_handlePreToolUse`에서 scope guard deny 시 `[HOOK DENY]` Slack 알림 전송 + 즉시 flush
- **Custom Agent definition** (5.8): `.claude/agents/manager.md` 생성. C4 Manager 에이전트 도구 제한(Bash c4/git만 allow, Read/Write/Edit/Grep/Glob deny)을 Claude Code 네이티브 Custom Agents로 정의

## [1.6.1] - 2026-04-05

### Added
- **Hybrid safety mode** (5.21): L4 critical deny 시 worker를 `critical_deny` 상태로 전환하고 Slack 승인 요청 전송. `c4 approve <name>` 명령으로 관리자가 승인. CLI, daemon route, pty-manager approve() 메서드 추가
- **Auto-approval block** (5.28): `critical_deny` 상태 worker에 Enter 키나 'y' 입력 차단. `c4 send`/`c4 key`로 위험 명령 무분별 승인 방지
- **Resume re-orientation** (5.14): worker resume 후 5초 대기 뒤 scrollback 마지막 20줄 캡처하여 `[RESUMED]` 스냅샷 생성 + Slack 알림

## [1.6.0] - 2026-04-05

### Added
- **CI feedback loop** (5.20): worker가 `git commit` 실행 후 자동으로 `npm test` 실행. 실패 시 에러 출력과 함께 worker에 자동 피드백 전송. `config.ci.enabled`, `testCommand`, `timeoutMs` 설정 지원. SSE `ci` 이벤트 + Slack `[CI PASS]`/`[CI FAIL]` 알림
- **Intervention immediate notification** (5.29): question/escalation/permission prompt 감지 시 즉시 `notifyStall()` 호출하여 Slack 알림 전송. healthCheck 30초 주기 대기 없이 실시간 알림. `_permissionNotified` 플래그로 중복 방지
- **Worker auto-approve 범위 확장** (5.24): worker defaultPerms에 개발 도구(npm, python, cargo, docker, ffmpeg, make 등), 셸 유틸리티(ls, cat, grep, mkdir, cp, mv 등), 파일 도구(Read, Edit, Write, Glob, Grep) 추가. config.example.json에 node/python/rust 프로파일 프리셋 추가

## [1.5.9] - 2026-04-05

### Added
- **Dirty worktree Slack warning** (5.15): healthCheck에서 alive worker의 worktree dirty 상태 감지 시 `[DIRTY]` Slack 알림 전송. 정리되면 플래그 리셋하여 재알림 가능
- **Submodule diff support** (5.30): `c4 merge` 완료 후 `git diff --stat --submodule=diff`로 서브모듈 변경사항 상세 표시
- **c4 cleanup command** (5.33): 수동 정리 명령어. LOST worker의 c4/ 브랜치 삭제, worktree 제거, 고아 c4-worktree-* 디렉토리 정리, git worktree prune 실행. `--dry-run` 지원

## [1.5.8] - 2026-04-05

### Added
- **L4 Critical Deny List** (5.13): `CRITICAL_DENY_PATTERNS`로 `rm -rf /`, `git push --force`, `DROP TABLE`, `sudo rm`, `shutdown`, `reboot`, `mkfs`, `dd if=`, `git reset --hard origin` 등 파괴적 명령을 L4 full autonomy에서도 절대 차단. 차단 시 스냅샷 로그 + Slack 알림
- **close() 브랜치 자동 삭제** (5.25/5.31): worker close 시 c4/ 접두사 브랜치를 자동으로 `git branch -D`로 삭제. worktree remove 후 실행
- **healthCheck worktree prune** (5.32): healthCheck 주기마다 `git worktree prune` 자동 실행하여 stale worktree 참조 정리

## [1.5.7] - 2026-04-05

### Added
- **--repo 옵션** (5.16/5.17): `c4 task worker --repo /path/to/project`로 다른 프로젝트의 worktree 생성 지원. CLI에서 파싱하여 daemon/pty-manager로 전달

### Fixed
- **PreToolUse 복합 명령 차단** (5.19): 워커가 home dir에서 스폰되어 worktree의 `.claude/settings.json` 훅을 로드하지 못하던 문제 수정. worktree + settings 생성 후 워커 스폰하도록 순서 변경. inline node -e 스크립트를 standalone `src/compound-check.js`로 분리하여 shell escaping 문제 해결

### Changed
- **c4 send 자동 Enter** (5.18): 이미 구현 확인 (send()에서 자동 `\r` 추가), TODO에 done 표시

## [1.5.6] - 2026-04-05

### Added
- **Phase 5 추가 항목**: TODO 5.31~5.33 추가 (브랜치 자동 정리, worktree prune, c4 cleanup)
- **Phase 6 추가 항목**: TODO 6.7 추가 (best-practices 문서)

## [1.5.5] - 2026-04-05

### Added
- **Phase 5 추가 항목**: TODO 5.28~5.30 추가 (자동 승인 방지, intervention 알림, 서브모듈 diff)

## [1.5.4] - 2026-04-05

### Added
- **Phase 5 추가 항목**: TODO 5.20~5.27 추가 (CI 피드백, 안전 모드, 권한 프로파일 등)
- **Phase 6 로드맵**: 마케팅/가시성 항목 추가 (6.1~6.6)

## [1.5.3] - 2026-04-05

### Changed
- **auto-mgr 도구 제한** (5.1): `_buildAutoManagerPermissions()`에서 Read/Write/Edit/Grep/Glob deny. Bash는 `c4:*`와 `git -C:*` 패턴만 allow. manager worker가 코드를 직접 수정하지 못하고 c4 명령어로 하위 worker에 위임하도록 강제

## [1.5.2] - 2026-04-05

### Fixed
- **Worker close 시 Slack flush** (5.4): worker exit 시 alertOnly 모드에서 완료 메시지가 버퍼에 남는 문제 수정. notifyTaskComplete 후 즉시 _flushAll() 호출

### Added
- **Phase 5 로드맵**: TODO.md에 실사용 테스트 + 강제 메커니즘 항목 추가 (5.1~5.16)
- **Phase 5 추가 항목**: TODO 5.17 --repo 옵션 구현, 5.18 send 자동 Enter, 5.19 PreToolUse 복합 명령 차단 실효성

## [1.5.1] - 2026-04-05

### Fixed
- **Windows 콘솔 창 숨김** (4.25): `execSyncSafe` 래퍼 도입하여 모든 `execSync` 호출에 `windowsHide: true` 기본 적용. daemon spawn에 `windowsHide: true` 추가. pty.spawn에 `useConpty: false` 추가하여 conpty 관련 이슈 방지

## [1.5.0] - 2026-04-04

### Added
- **트러블슈팅 가이드** (4.21): `docs/troubleshooting.md` 신규 작성
  - 좀비 데몬: PID 파일 잔존 + HTTP 무응답 진단/해결
  - Worktree 잔여물: 비정상 종료 후 stale worktree 정리, dirty worktree 복구
  - STALL 반복: intervention/idle 기반 멈춤 원인별 해결, autoApprove/autoRestart 예방
  - Lost 워커 복구: `c4 resume` 세션 복구, worktree dirty 상태 처리
  - CLI 에러: ECONNREFUSED, timeout, Git Bash 경로 변환 등 일반 에러 해결
  - Quick Reference 테이블로 빠른 참조
- **claude --resume 세션 이어가기** (4.1): 작업자/관리자 재시작 시 이전 세션 자동 복구
  - `_getWorkerSessionId()`: Claude Code JSONL 세션 파일에서 최신 세션 ID 추출
  - `_updateSessionId()`: healthCheck 주기마다 세션 ID 갱신, state.json에 영속화
  - `create()`: `options.resume` 지원 — `claude --resume <sessionId>`로 세션 이어가기
  - healthCheck autoRestart: resume 우선 시도, 실패 시 새 세션 폴백
  - `c4 resume <name> [sessionId]`: CLI 명령으로 수동 resume
  - `c4 session-id <name>`: 작업자 세션 ID 조회
  - `GET /session-id`, `POST /resume`: daemon API 라우트
  - watchdog.sh: 관리자 사망 시 resume 우선 시도
  - `tests/session-resume.test.js`: 13개 유닛 테스트
- **autonomyLevel 4 완전 자율** (4.5): deny 룰도 approve로 오버라이드하는 완전 자율 모드
  - `_getAutonomyLevel()`: config에서 autonomyLevel 읽기
  - `_classifyPermission()`: Level 4일 때 deny → approve + `[AUTONOMY L4]` 스냅샷 기록
  - config.example.json에 `autoApprove.autonomyLevel` 옵션 추가
  - `tests/autonomy-level.test.js`: 14개 유닛 테스트
- **관리자 자동 교체** (4.7): 컨텍스트 한계 도달 시 관리자 자동 교체
  - `compactEvent()`: PostCompact hook에서 compact 이벤트 수신, 횟수 추적
  - `_replaceManager()`: 새 관리자 생성 + 맥락 전달 (session-context.md, TODO.md, git log)
  - PostCompact hook에 daemon compact-event 보고 curl 명령 추가
  - `config.managerRotation.compactThreshold`: 교체 임계값 설정 (0=비활성)
  - healthCheck에서 임계값 근접 경고 알림
  - `POST /compact-event` daemon API 라우트
  - `tests/manager-rotation.test.js`: 13개 유닛 테스트
- **LOST worker worktree 안전 정리**: healthCheck에서 미아 worktree를 dirty 상태 확인 후 안전하게 정리
  - `_cleanupLostWorktrees()`: 삭제 전 `git status --porcelain`으로 uncommitted changes 확인
  - `_isWorktreeDirty()`: worktree의 dirty 상태 확인 (staged, unstaged, untracked 파일 검사)
  - `_notifyLostDirty()`: dirty worktree 발견 시 `[LOST DIRTY]` 알림을 모든 채널에 즉시 전송
  - dirty worktree: 삭제하지 않고 보존 + Slack/Discord/Telegram 알림으로 사용자에게 판단 위임
  - clean worktree: 기존과 동일하게 안전 삭제
  - orphan 스캔에서 lostWorkers에 속한 worktree 중복 처리 방지
  - 반환값 변경: `number` -> `{ cleaned, preserved }` 객체
  - `tests/worktree-cleanup.test.js`: 18개 유닛 테스트

### Fixed
- **알림 동작 수정** (4.24): `notifyHealthCheck`, `notifyTaskComplete` 불필요한 동작 제거
  - `notifyHealthCheck()`: 워커가 없을 때 "daemon OK" 메시지 전송 삭제 (노이즈 제거)
  - `notifyTaskComplete()`: `alertOnly` 체크 제거 - 완료 메시지는 항상 전송
- **좀비 데몬 정리** (4.21): `daemon stop`이 프로세스를 확실히 죽이도록 수정
  - SIGTERM 후 매 반복마다 프로세스 종료 확인, 죽으면 즉시 반환
  - kill 호출 중 race condition 처리 (에러 발생 시에도 프로세스 사망 여부 재확인)
  - SIGKILL 후 최대 2초간 종료 확인 루프 추가
  - Windows에서 불필요한 SIGKILL 단계 제거 (taskkill /F가 이미 강제 종료)
  - 프로세스가 SIGTERM+SIGKILL 모두 생존하면 `{ ok: true }` 대신 `{ error }` 반환
  - `tests/daemon-stop.test.js`: 9개 유닛 테스트
- **SSH target worktree 생성 방지** (4.22): SSH target(dgx 등) worker에 불필요한 로컬 worktree 생성 방지
  - `sendTask()`, `_createAndSendTask()`: `_resolveTarget()`으로 target type 확인, ssh이면 `useWorktree=false` 강제
  - SSH worker는 remote에서 실행되므로 로컬 worktree가 불필요하고 오류를 유발할 수 있음
  - `tests/pending-task-worktree.test.js`: SSH 관련 3개 유닛 테스트 추가 (총 16개)
- **notifyHealthCheck 상태 누락 수정** (4.20): `restarted`/`restart_failed` 워커가 Slack 알림에서 누락되던 문제 수정
  - `restart_failed` 워커를 dead 목록에 포함, '재시작 실패' 라벨 표시
  - `restarted` 워커를 alive 목록에 포함
  - LANG에 `restarted`/`restartFailed` 라벨 추가 (ko/en)
  - `tests/slack-activity.test.js`: 4개 유닛 테스트 추가 (총 12개)
- **Slack 알림 task 요약 절단 버그** (4.19): 파일명의 `.`에서 잘리던 task 요약 수정
  - `_fmtWorker()`, `notifyTaskComplete()`, `notifyError()`: `split(/[.\n]/)` -> `split('\n')`
  - 예: "Fix bug in daemon.js" 가 "Fix bug in daemon" 으로 잘리던 문제 해결
  - `tests/notifications.test.js`: 5개 테스트 추가 (dot 보존, multi-line 첫줄 추출)
- **merge-homedir config 폴백** (4.18): cli.js merge 핸들러에 config.json projectRoot 폴백 추가
  - `git rev-parse` 실패 시 `config.json`의 `worktree.projectRoot` 확인
  - `pty-manager.js`의 `_detectRepoRoot()`와 동일한 폴백 전략
  - 홈디렉토리에서 `c4 merge` 실행 가능
  - `tests/merge-homedir.test.js`: 11개 유닛 테스���
- **auto-resume idle 큐 확인** (4.17): 워커 idle 시 `_taskQueue`에서 매칭 태스크 자동 전송
  - idle 콜백(line 2246 부근): `_pendingTask` 없고 idle 상태일 때 `_taskQueue`에서 현재 워커명 매칭 태스크 검색 후 `sendTask()` 방식으로 전송
  - `_processQueue()`: idle 워커 감지 로직 추가 — healthCheck에서도 기존 idle 워커에 태스크 자동 할당
  - auto-mgr이 태스크 완료 후 다음 태스크를 자동으로 받을 수 있게 보장
  - `tests/auto-resume.test.js`: 13개 유닛 테스트
- **send() Enter 누락 버그 수정**: 일반 텍스트 전송(isSpecialKey=false) 시 `\r`(Enter)을 append하지 않아 명령이 실행되지 않던 문제 수정
- **pending-task worktree 미생성 버그 수정** (BF-1): `_createAndSendTask()`에서 worktree 생성 로직이 누락되어, 새 워커 생성과 동시에 task 전달 시 worktree 없이 원본 repo에서 작업이 실행되던 문제 수정. `sendTask()`의 worktree 생성 패턴을 `create()` 호출 직후에 복제하여 `_pendingTask` 저장 전에 `w.worktree`가 설정되도록 함
  - `tests/pending-task-worktree.test.js`: 13개 유닛 테스트
- **slack-activity hook 디버깅** (BF-2): hook 이벤트 수신 경로에 디버깅 로그 추가
  - `daemon.js` `/hook-event` 핸들러에 요청 수신/거부 로그 추가
  - `hookEvent()` 진입 시 workerName, hook_type, tool_name 로그 추가
  - `_appendEventLog()` 호출 시 파일 경로, 에러 로그 추가
  - `tests/slack-activity.test.js`: 8개 유닛 테스트
- **_chunkedWrite() 레이스 컨디션 수정** (1.19): setTimeout 기반 청크 전송을 async/await + drain 이벤트 기반 순차 전송으로 교체. 500자 초과 텍스트에서 `\r`이 유실되어 명령이 실행되지 않던 문제 해결. 호출처 5곳 모두 async 대응
- **worktree 완전 hook 세트** (4.17): `_buildWorkerSettings()`가 PreToolUse/PostToolUse/PostCompact 완전한 hook 세트를 직접 생성. 복합 명령 차단 hook을 PreToolUse 첫 번째로 배치하여 daemon 통신 hook 실패와 무관하게 차단 보장. Claude Code 설정 병합 의존 제거

### Changed
- **_getLastActivity 단순화**: events.jsonl 파싱 로직 전부 제거, `w._taskText` 첫 줄 반환 또는 `'idle'` 반환으로 단순화. `workerName` 파라미터 제거. 테스트 2파일 JSONL 관련 케이스 제거 후 새 로직에 맞게 재작성
- **README 배지 업데이트**: Platform 배지에서 macOS 제거, Win11 22H2+/Ubuntu 22.04+ 버전 명시. Node.js 배지에 tested v24.11.1 추가. Claude Code 지원 버전 v2.1.92로 갱신

## [1.4.0] - 2026-04-04

### Added
- **메시지 채널 확장** (4.12): notifications.js를 플러그인 구조로 리팩토링
  - Channel 베이스 클래스: push/flush/sendImmediate/start/stop 인터페이스
  - SlackChannel: 기존 Slack webhook 로직 (하위 호환 유지)
  - DiscordChannel: webhook POST `{ content }`, 2000자 초과 시 자동 truncate
  - TelegramChannel: Bot API `sendMessage`, Markdown parse_mode
  - KakaoWorkChannel: Incoming Webhook POST `{ text }`
  - `pushSlack()` -> `pushAll()` (모든 활성 채널에 push, pushSlack은 호환 alias)
  - `startPeriodicSlack()` -> `startAll()` / `stopPeriodicSlack()` -> `stopAll()`
  - `notifyStall()`: 모든 채널에 즉시(unbuffered) 전송
  - `tick()`: 모든 채널 flush
  - config.example.json에 discord/telegram/kakaowork 설정 추가
  - 새 외부 패키지 없이 Node.js 표준 http/https만 사용

## [1.3.2] - 2026-04-04

### Changed
- **_getLastActivity JSONL 기반 전환** (4.14): raw screen 패턴 매칭 제거, logs/events-<worker>.jsonl에서 최근 tool_use 이벤트 읽어 "Edit: foo.js, Write: bar.js" 형태 반환. 폴백으로 taskText 첫줄 요약

### Added
- **alertOnly 모드** (4.16): `notifications.slack.alertOnly` 옵션 추가. true이면 STALL/ERROR 알림만 Slack 전송, 일반 알림(statusUpdate, notifyEdits, notifyTaskComplete, notifyHealthCheck) 억제. 8개 유닛 테스트 추가
- **notifyStall 긴급 알림** (4.15): `notifyStall(workerName, reason)` 메서드. Slack webhook 즉시 전송 (버퍼 미사용)
  - healthCheck에서 intervention 상태 워커 자동 감지
  - busy 워커 5분+ 무출력 시 자동 감지
  - `tests/stall-detection.test.js`: 10개 유닛 테스트

---

## [1.3.1] - 2026-04-04

### Added
- **Hook 이벤트 JSONL 영속화** (4.2): `_appendEventLog()` 메서드 추가
  - 모든 PreToolUse/PostToolUse hook 이벤트를 `logs/events-<worker>.jsonl`에 JSONL 형식으로 저장
  - 워커별 개별 파일로 분리 저장 (리플레이/디버깅 용도)
  - 잘못된 입력(null, undefined, 비문자열 workerName, 비객체 hookEntry) 안전 처리
  - 파일/디렉토리 자동 생성, 기존 파일에 추가(append) 동작
  - 쓰기 실패 시 hook 처리 중단 없이 무시 (에러 격리)
  - `tests/hook-event-log.test.js`: 16개 유닛 테스트
- **Dashboard Web UI** (4.3): `GET /dashboard` route in daemon
  - Worker list with status, target, branch, phase, intervention, snapshots, PID
  - Stats bar: total workers, busy, idle, exited, queued counts
  - Queued tasks section (shown when queue is non-empty)
  - Lost workers section (shown when lost workers exist)
  - Dark theme, responsive layout (mobile-friendly)
  - XSS protection via HTML escaping
  - 30-second auto-refresh
  - No external dependencies — pure HTML string rendering
  - `tests/dashboard.test.js`: 17 unit tests

---

## [1.3.0] - 2026-04-03

### Added
- **Global auto mode**: `c4 auto` sets `_globalAutoMode=true` on daemon. All workers created during auto session inherit `defaultMode: 'auto'` and auto-approve all non-denied commands. No more overnight permission prompt stalls.
- **PostCompact hook auto-injection**: All worker `.claude/settings.json` now include PostCompact hook that re-injects CLAUDE.md + session-context.md after context compaction.
- **CLAUDE.md full CLI reference**: Added complete c4 command list and manager worker operation pattern to CLAUDE.md for worker self-guidance.

### Changed
- **Slack notifications improved**: `notifyHealthCheck()` now shows per-worker task description + elapsed time instead of generic "OK: N workers running".
- **`c4 init` permissions expanded**: 4 allow rules -> 30+ allow + 7 deny rules. Covers all common development commands out of the box.
- **`_classifyPermission` auto worker support**: Accepts worker context, auto workers default to 'approve' for unmatched commands instead of 'ask'.
- **User `~/.claude/settings.json` PostCompact**: Now injects both CLAUDE.md and session-context.md.

---

## [1.2.1] - 2026-04-04

### Updated
- **config.example.json**: `intervention` 섹션 추가, `notifications.language` 필드 추가
- **CLAUDE.md**: CLI 전체 명령어 레퍼런스 추가 (token-usage, scrollback, templates, swarm, morning, plan, plan-read, rollback, config, health)

---

## [1.2.0] - 2026-04-03

### Added
- **`c4 auto` command** (4.8): One-command autonomous execution
  - `c4 auto "작업 내용"` → manager worker + scribe auto-start + task send
  - Manager worker gets full permissions (Read, Write, Edit, Bash, etc.) + `defaultMode: auto`
  - Morning report auto-generated on worker exit
  - daemon route: `POST /auto`
- **`c4 morning` command** (4.4): Morning report generation
  - `c4 morning` → generates `docs/morning-report.md`
  - Sections: recent commits (24h), worker history (completed/needs-review), TODO status, token usage
  - Auto-called when `c4 auto` worker exits
  - daemon route: `POST /morning`

---

## [1.1.0] - 2026-04-03

### Added
- **Notifications module** (4.10): `src/notifications.js` — Slack webhook (periodic) + Email (event-based)
  - Slack: built-in `https` module, buffer + periodic flush (`notifications.slack.intervalMs`)
  - Email: optional `nodemailer` soft dependency, sends immediately on task completion
  - Config: `notifications.slack` / `notifications.email` sections in `config.json`
  - daemon.js: `startPeriodicSlack()` on boot, `tick()` in healthCheck timer
  - pty-manager.js: `notifyTaskComplete()` on worker exit, `notifyHealthCheck()` on issues
- **PreToolUse compound command blocking** (4.6/4.9): Auto-inserted into worker `.claude/settings.json`
  - `_buildCompoundBlockCommand()`: cross-platform `node -e` script
  - Matcher: `Bash` tool only, detects `&&`, `||`, `|`, `;` → exit code 2 (block)
  - Injected via `_buildWorkerSettings()` into every worktree worker

---

## [1.0.2] - 2026-04-03

### Fixed
- **ScopeGuard glob `**` zero-depth match**: `_matchGlob`에서 `**`가 0개 디렉토리도 매칭하도록 수정 (`src/**/*.js` → `src/foo.js` 정상 매칭)
- **sendTask/send PTY 잘림 버그**: `_chunkedWrite()` 도입 — 500자 청크 + 50ms 간격 전송으로 PTY 버퍼 오버플로우 방지 (1.18)

### Added
- Integration tests: SSE, MCP, Worktree, Linux cross-platform (17 tests)
- Test results: 177/177 PASS (100%)

---

## [1.0.1] - 2026-04-03

### Fixed
- **npm link Windows fallback**: `c4 init` now creates wrapper scripts (shell + .cmd) in npm global bin directory when `npm link` fails, instead of relying on symlinks that require elevated permissions on Windows

### Changed
- README Install section simplified — `npm link` removed from manual steps, `c4 init` handles command registration automatically

---

## [1.0.0] - 2026-04-03

All Phase 1/2/3 features complete. 45 roadmap items implemented.

### Highlights
- **Scope Guard** (1.8): File/command scope enforcement + drift detection
- **Intervention Protocol** (1.9): Question/escalation/routine monitoring
- **Task Queue** (2.2-2.3, 2.8): Dependencies, deduplication, rate limiting
- **SSH Recovery** (2.4): ControlMaster + auto-reconnect
- **Token Monitoring** (2.5): JSONL parsing, daily limits, warnings
- **Autonomous Ops** (2.9): watchdog.sh for unattended operation
- **Context Transfer** (3.1): Worker-to-worker snapshot injection
- **Auto Verification** (3.2): Post-commit test runner
- **Effort Dynamic** (3.3): Task length-based effort auto-adjustment
- **Worker Pooling** (3.4): Idle worker recycling
- **SSE Events** (3.5): Real-time event streaming
- **Rollback** (3.6): Pre-task commit restore
- **Task History** (3.7): JSONL persistence, `c4 history`
- **ScreenBuffer** (3.8): Enhanced CSI parser + scrollback API
- **MCP Server** (3.9): HTTP MCP protocol at `/mcp`
- **Planner Worker** (3.10): Plan-only mode, `c4 plan`
- **State Machine** (3.11): Worker phase tracking (plan/edit/test/fix)
- **Adaptive Polling** (3.12): Activity-based idle interval
- **Interface Abstraction** (3.13): Terminal-Agent decoupling
- **Summary Layer** (3.14): Long snapshot auto-summarization
- **Hook Architecture** (3.15): PreToolUse/PostToolUse JSON events
- **Worker Settings** (3.16): Per-worktree `.claude/settings.json` profiles
- **Subagent Swarm** (3.17): Agent tool usage tracking + limits
- **Role Templates** (3.18): Planner/Executor/Reviewer presets
- **Auto Mode** (3.19): Claude classifier safety delegation
- **Cross-Platform** (3.20): Windows/Linux/macOS support

### Stats
- 13 source modules, 18 test files, 200+ unit tests
- Tested on Claude Code v2.1.85-2.1.110

---

<details>
<summary>Previous versions (0.1.0 - 0.14.0)</summary>

## [0.14.0] - 2026-04-03
- Cross-platform support (3.20): Platform utility functions, macOS homebrew/nvm paths

## [0.13.0] - 2026-04-03
- Hook architecture (3.15), Worker settings profiles (3.16), Subagent Swarm (3.17), Role templates (3.18), Auto Mode (3.19)

## [0.12.0] - 2026-04-03
- Context transfer (3.1), Worker pooling (3.4), Rollback (3.6), Effort dynamic (3.3), SSE (3.5), ScreenBuffer improvements (3.8)

## [0.11.0] - 2026-04-03
- Task history persistence (3.7), Autonomous ops (2.9), Auto-verification (3.2)

## [0.10.0] - 2026-04-03

### Added
- **Task queue with rate limiting** (2.8): `maxWorkers` config limits concurrent workers
  - Excess tasks queued automatically, dequeued when workers exit or in healthCheck
  - Queue persisted in `state.json`, `c4 list` shows QUEUED section
- **Task dependencies** (2.2): `c4 task worker-b "..." --after worker-a`
  - Queued task waits until dependency worker exits before starting
- **Duplicate task prevention** (2.3): Reject `c4 task` if same name already queued or running
- **Auto-create workers**: `c4 task` on non-existent worker auto-creates it
  - `tests/task-queue.test.js`: Unit tests
- **SSH disconnect recovery** (2.4): Automatic SSH connection resilience
  - ControlMaster (Unix) + ServerAlive + auto-reconnect on SSH worker exit
  - `[SSH WARN]` snapshots, health check integration
  - Config: `ssh.controlMaster`, `ssh.reconnect`, `ssh.maxReconnects`, etc.
- **Token usage monitoring** (2.5): Track daily token consumption from JSONL session files
  - `_parseTokensFromJsonl()`, `_checkTokenUsage()`: daily aggregation + 7-day history
  - `[TOKEN WARN]` snapshots, `c4 token-usage` CLI command
  - Config: `tokenMonitor.enabled`, `tokenMonitor.dailyLimit`, `tokenMonitor.warnThreshold`

### Changed
- `config.json`: Added `maxWorkers`, `ssh`, `tokenMonitor` sections
- `state.json`: Added `taskQueue` array (backward compatible)

## [0.9.0] - 2026-04-03

### Added
- **Scope Guard** (1.8): Task scope definition + drift detection
  - `src/scope-guard.js`: `ScopeGuard` class with file/bash scope checking and drift keyword detection
  - `checkFile()`: Validates file paths against `allowFiles`/`denyFiles` glob patterns
  - `checkBash()`: Validates bash commands against `allowBash`/`denyBash` prefix lists
  - `detectDrift()`: Detects scope drift keywords in worker output (Korean + English)
  - `resolveScope()`: Resolves scope from explicit → preset → default (priority order)
  - Out-of-scope access → auto-deny + `[SCOPE DENY]` snapshot
  - Drift keywords → `[SCOPE DRIFT]` snapshot
  - `c4 task --scope '...'` / `--scope-preset` CLI flags
  - `config.json`: `scope.presets`, `scope.defaultScope`
  - `tests/scope-guard.test.js`: Unit tests
- **Manager intervention protocol** (1.9): Automated detection of worker states requiring manager attention
  - **Question detection**: Korean + English question patterns, `[QUESTION]` snapshots
  - **Escalation detection**: Repeated error tracking → `[ESCALATION]` snapshot
  - **Routine monitoring**: implement → test → docs → commit compliance, `[ROUTINE SKIP]` snapshot
  - Worker intervention state: `c4 list` shows INTERVENTION column
  - Config: `intervention.enabled`, `intervention.questionPatterns`, `intervention.escalation.maxRetries`, `intervention.routineCheck`

## [0.8.1] - 2026-04-03

### Added
- **`c4 merge --skip-checks`** (1.16): Skip pre-merge checks for doc-only commits

### Fixed
- **Worktree main-protection hooks** (1.17): `_createWorktree()` sets `core.hooksPath` to enforce pre-commit hook in worktrees

## [0.8.0] - 2026-04-03

### Added
- **Log rotation** (2.7): Auto-rotate `logs/*.raw.log` when exceeding size limit
  - `_checkLogRotation()`: checks file size against `config.logs.maxLogSizeMb` (default 50MB)
  - Rotates `.raw.log` → `.raw.log.1` (deletes previous `.log.1`)
  - Re-opens log stream for active workers after rotation
  - Runs automatically in `healthCheck()` timer
- **Exited worker log cleanup** (2.7): Auto-delete logs of long-exited workers
  - `_cleanupExitedLogs()`: removes workers exited longer than `config.logs.cleanupAfterMinutes` (default 60min)
  - Deletes both `.raw.log` and `.raw.log.1` files
  - Removes cleaned-up workers from internal map
  - Runs automatically in `healthCheck()` timer
- **Lost worker recovery display** (2.7): Daemon restart awareness
  - `_loadState()` detects previously-alive workers from `state.json` on startup
  - Marks them as `lost` (daemon restarted, PTY sessions gone)
  - `_saveState()` includes `exitedAt` timestamp for exited workers
  - `c4 list` shows LOST section with name, pid, branch, and lost timestamp

## [0.7.0] - 2026-04-03

### Added
- **Scribe system** (1.6): Session context persistence via JSONL parsing
  - `src/scribe.js`: Core module — scans `~/.claude/projects/<project>/*.jsonl` files
  - JSONL parser with offset tracking (reads only new messages per scan)
  - Content extraction: user text, assistant text, tool uses (Write/Edit)
  - Auto-classification into categories: decision, error, fix, todo, intent, progress
  - Korean + English keyword pattern matching for classification
  - Structured output to `docs/session-context.md` (grouped by category, newest first)
  - Subagent session files included in scan
  - `c4 scribe start` — activate periodic scanning (default 5min interval)
  - `c4 scribe stop` — deactivate scribe
  - `c4 scribe status` — show scribe state (entries, tracked files, interval)
  - `c4 scribe scan` — run one-time scan immediately
  - Daemon integration: `/scribe/start`, `/scribe/stop`, `/scribe/status`, `/scribe/scan` API routes
  - Config: `scribe.enabled`, `scribe.intervalMs`, `scribe.outputPath`, `scribe.projectId`, `scribe.maxEntries`
  - PostCompact hook compatible: `cat docs/session-context.md` restores context after compaction

## [0.6.0] - 2026-04-03

### Added
- **CLAUDE.md rule enforcement** (1.13): Automated rule compliance for workers
  - Pre-commit hook warns on compound commands (`&&`, `|`, `;`) in staged diffs
  - `sendTask()` auto-prepends CLAUDE.md key rules to task text
  - Default rules summary: no compound commands, use `git -C`, use `c4 wait`, no main commits, work routine
  - Config: `rules.appendToTask` (default: true) enables/disables rule injection
  - Config: `rules.summary` for custom rules text (empty = built-in default)

## [0.5.0] - 2026-04-03

### Added
- **Worker health check** (1.7): Periodic alive check with auto-restart support
  - `healthCheck()` method: scans all workers, detects dead ones, logs `[HEALTH] worker exited` to snapshots
  - `startHealthCheck()` / `stopHealthCheck()`: timer-based periodic execution (default 30s)
  - Config: `healthCheck.enabled` (default: true), `healthCheck.intervalMs` (default: 30000), `healthCheck.autoRestart` (default: false)
  - Auto-restart: when enabled, dead workers are re-created with same command/target
  - `c4 list` shows last health check time (seconds ago + timestamp)
  - Daemon starts health check on boot, stops on shutdown

## [0.4.0] - 2026-04-03

### Added
- **`c4 merge` command** (1.11): Merge branch to main with pre-merge checks
  - Accepts worker name (`c4 merge worker-a`) or branch name (`c4 merge c4/feature`)
  - Pre-merge checks: npm test, TODO.md modified, CHANGELOG.md modified
  - Rejects merge if any check fails with clear error messages
  - Executes `git merge --no-ff` on success
- **Main branch protection** (1.11): Pre-commit hook blocks direct commits to main
  - `.githooks/pre-commit` prevents commits on main branch
  - `c4 init` sets `git config core.hooksPath .githooks` automatically

### Fixed
- **Effort auto-setup stabilized** (1.15): `/model` menu setup intermittent failure fix
  - Retry logic with configurable `retries` (default: 3) and `phaseTimeoutMs` (default: 8000ms)
  - Escape key sent on timeout to clear partial TUI state before retry
  - Configurable `inputDelayMs` and `confirmDelayMs` (previously hardcoded 500ms)
  - Config: `workerDefaults.effortSetup` object in `config.json`
  - Failure snapshot logged after max retries exhausted
  - Success snapshot shows retry count if retries were needed

### Improved
- **`c4 init` enhanced** (1.10): Full initialization with auto-detection and fallbacks
  - Auto-detect `claude` binary path (`where`/`which`) → saves to `config.json`
  - Register `c4` command: `npm link` → `~/.local/bin/c4` symlink → `.bashrc` alias (3-step fallback)
  - EPERM handling: graceful error on Windows symlink permission issues

## [0.3.1] - 2026-04-03

### Added
- **`c4 init` command** (1.10): One-time project initialization
  - Merges c4 permissions into `~/.claude/settings.json` (non-destructive)
  - Copies `config.example.json` → `config.json` (skips if exists)
  - Creates `~/CLAUDE.md` symlink → repo `CLAUDE.md`

## [0.3.0] - 2026-04-03

### Added
- **Git worktree support** (1.12): Each worker gets an isolated worktree directory
  - `sendTask()` auto-creates `git worktree add ../c4-worktree-<name> -b <branch>`
  - Worker is instructed to `cd` into the worktree before starting work
  - `close()` auto-removes worktree with `git worktree remove --force`
  - `list()` shows worktree path per worker
  - Stale worktree cleanup on re-creation
  - Config: `worktree.enabled` (default: true), `worktree.projectRoot` (auto-detect from git)
  - API: `useWorktree`, `projectRoot` options in `/task` endpoint
  - Fallback to branch-only mode with `useWorktree: false`
- **TODO roadmap expansion** (3.10-3.19): Planner Worker, State Machine, Adaptive Polling, Interface Abstraction, Summary Layer, Hook architecture, Subagent Swarm, Role templates, Auto Mode

### Fixed
- **Git Bash MSYS path fix** (1.4): Cherry-picked `MSYS_NO_PATHCONV=1` + `fixMsysArgs()` to main branch

## [0.2.0] - 2026-04-02

### Added
- **Auto-approve engine** (1.1): Config-based TUI pattern matching for permission prompts
  - Version compatibility system (`compatibility.patterns` in config)
  - Tested on v2.1.85, v2.1.90
  - Bash command extraction from screen, file name extraction
  - Option count detection (2-opt vs 3-opt prompts)
  - `alwaysApproveForSession` toggle for "don't ask again" option
  - Audit trail: auto-approve/deny decisions logged in snapshots
- **Worker auto-setup** (1.3): Trust folder + max effort fully automated
  - 2-phase idle detection: prompt detect → /model → menu detect → Right+Enter
  - Configurable effort level via `workerDefaults.effortLevel`
- **Git branch isolation** (1.5): `c4 task` command with auto branch creation
  - `--branch` flag for custom branch, `--no-branch` to skip
  - Workers instructed to commit per unit of work
  - Branch info shown in `c4 list`
- **`c4 task`** command: send task with branch isolation in one step
- **`c4 config` / `c4 config reload`**: view and hot-reload config
- **Claude Code plugin marketplace**: self-hosted via `.claude-plugin/`
- **TODO.md roadmap**: Phase 1/2/3 with task scope, manager protocol, design-doc workflow

### Changed
- Renamed project from `dispatch-terminal-mcp` to `c4` (Claude {Claude Code} Code)
- CLI command: `dispatch` → `c4`
- `config.json` moved to `.gitignore`, `config.example.json` provided
- Git commands added to autoApprove rules

### Fixed
- SSH argument passing on Windows (cmd.exe `&&` splitting issue → pendingCommands approach)
- Git Bash path conversion for `/model` → `MSYS_NO_PATHCONV=1` workaround

## [0.1.0] - 2026-04-02

### Added
- Core daemon with HTTP API (localhost:3456)
- PTY-based worker management (create, send, read, close)
- ScreenBuffer virtual terminal — clean screen state without spinner noise
- Idle detection and snapshot system
- SSH remote workers (`--target` flag)
- CLI tool with all management commands
- `config.json` for all settings (daemon, pty, targets, autoApprove, logs)
- Support for special keys (Enter, C-c, C-b, arrows, etc.)

### Architecture
- Node.js daemon + `node-pty` for pseudo-terminal management
- Custom ScreenBuffer replaces xterm-headless (no browser deps)
- Snapshot-based reading — only idle/finished states are captured
- SSH workers via `ssh.exe` with `pendingCommands` for initial setup
