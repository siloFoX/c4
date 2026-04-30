# Changelog

## [1.6.16] - 2026-04-30

### Fixed
- **Hook 페이로드 매칭** (7.24, TODO 7.23): Claude Code 2.1.123이 hook stdin에 `hook_event_name`/`worker` 없이 실제 페이로드를 보내면서 c4 daemon이 모든 PreToolUse/PostToolUse 이벤트를 `missing worker name`으로 거부 → auto-approve / scope guard / escalation 추적 / CI feedback / subagent swarm 전부 무력화돼 있던 회귀를 복원. `src/hook-relay.js`가 argv[3]로 worker 이름을 받아 stdin JSON에 `worker` 필드 + `hook_event_name`→`hook_type` 별칭을 inject. `_buildHookCommands`가 워커 이름을 인자로 전달하고 `\"`로 escape. daemon에도 같은 fallback 추가해 직접 POST(테스트/외부 relay)도 받음.
- **pendingTask Enter verify-and-retry** (7.25, TODO 7.22): conpty backpressure나 TUI redraw로 CR이 누락되는 long task / 다중 worker 케이스용 안전망. `_writeTaskAndEnter(... { verifyWith: worker })` 옵션이 입력 프롬프트에 task 텍스트가 그대로 남아 있는지 fingerprint 매칭으로 감지하고 300/700/1000ms backoff로 `\r`을 재전송 (최대 3회). pendingTask timeout fallback도 텍스트가 이미 타이핑된 상태면 Enter-only로 복귀해 double-submit 방지. 정규 task delivery 5개 경로 + `_createAndSendTask`/큐 자동 재개에 적용.
- **`c4 wait --all` intervention 블로킹** (TODO 7.21): `waitAndReadMulti`에 `mode: 'first' | 'all'` 옵션 추가. CLI `--all`이 자동으로 mode=all로 전환되며, 모든 워커가 idle/exited/intervention 어느 쪽이든 settled 될 때까지 기다린 뒤 collective 결과를 반환. intervention 워커 한 명 때문에 idle siblings가 blocking 되던 문제 해결.

### Added
- **워커 suspend/resume** (TODO 8.8): `suspend(name)` / `resumeWorker(name)`이 PTY child에 SIGSTOP/SIGCONT를 보내 일시정지/재개. `list()`에 `status='suspended'` + `suspended: bool` 필드. POST `/suspend` `/resume`, CLI `c4 suspend|resume <name>`, Web UI WorkerActions에 Pause/Play 아이콘 버튼.
- **read 토큰 절감** (TODO 별건, c4 read/wait/scrollback 등): `_compactReadText` 헬퍼가 box-drawing(U+2500-259F) + 공백만으로 채워진 노이즈 라인을 단일 `───`로 압축, 연속 빈 줄도 한 줄로 정리. `read`/`readNow`/`waitAndRead`/`waitAndReadMulti`/`getScrollback` 5개 read API 모두에 적용. `config.compactRead.enabled = false`로 끌 수 있음. 패턴 매칭 흐름은 raw text 그대로 사용.
- **L4 critical deny 추가 패턴** (TODO 7.5): `git filter-branch`, `chmod -R 777`, `chmod 777 /`, `find /<path> -delete`, `> /dev/sd[a-z]`, fork bomb 6종 추가. `tests/critical-deny.test.js`에 8개 테스트 추가.
- **question 패턴 보강** (TODO 7.7): 한글 6종 + 영어 7종 추가 (진행할까요/확인해 주세요/맞나요/계속 진행/동의하시 / do you want me to / please confirm / can you confirm / shall I proceed / would you like me to ...).
- **POST `/scribe/context`** (TODO 8.7): docs/session-context.md를 Web UI에서 조회. `scribeContext()` 메서드가 path/exists/content/size/mtime 반환.
- **Web UI 채팅 인터페이스** (TODO 8.6): `WorkerChat.tsx` — scrollback 폴링 → ❯ user / ● tool / ✻ spinner / [C4 system / 일반 assistant 5종 분류 말풍선. textarea 입력(Enter=send, Shift+Enter=newline) + Send/Enter/Ctrl+C 버튼. 자동 스크롤 + fade-in 애니메이션. WorkerDetail 디폴트 탭.
- **Web UI 이력 뷰** (TODO 8.7): `WorkerHistory.tsx`에서 history.jsonl을 free-text 검색 + 상태 필터로 조회, 행 expand로 task/branch/commits/시간 상세. `ScribeContext.tsx`로 session-context.md 별도 뷰어. App에 Workers/History/Context 톱 nav 추가, WorkerDetail에도 per-worker History 탭.
- **Web UI 디자인 시스템** (TODO 8.9): HSL 토큰 (`--background`/`--surface[1-3]`/`--border`/`--foreground`/`--muted`/`--primary`/`--success`/`--warning`/`--danger`/`--intervention`/`--suspended`)을 tailwind theme에 매핑. lucide-react 아이콘, `cn` 헬퍼 (clsx + tailwind-merge), shadow-soft/shadow-glow, ease-snappy 트랜지션, c4-fade-in 키프레임. WorkerList를 카드화하고 상태 dot + busy pulse + SSE/polling indicator 추가. WorkerActions를 tone(neutral/warning/danger)으로 분류하고 아이콘으로 통일.

### Tests
- 신규 테스트 4개 파일 + 27개 케이스 추가 (`pending-task-verify.test.js` 9, `approve-key.test.js` 7, `suspend-resume.test.js` 7, `parallel-wait` mode='all' 3, `critical-deny` 8개 보강, `hook-ascii` 갱신). 총 55개 테스트 통과.

### Phase 7-8 follow-ups (잔여 보강)
- **8.6 SSE 채팅** — 폴링을 `/api/watch` SSE 트리거 기반으로 교체. PTY chunk 도착마다 200ms debounce 후 scrollback fetch. 3초 safety poll 유지.
- **8.8 재시작 / 배치 / 취소** — `restart(name, {resume})` (close+respawn + --resume sessionId 옵션), `cancelTask(name)` (Ctrl+C × 2), `batch(names, action, args)`. POST `/restart` `/cancel` `/batch-action` 라우트, CLI `c4 restart|cancel|batch-action`. Web UI: WorkerActions에 Restart/Cancel 버튼 + `BatchControls` 컴포넌트(다중 선택 후 6종 액션 일괄 실행).
- **8.9 모바일 반응형** — hamburger toggle + slide-in sidebar + backdrop, 헤더/탭 라벨 xs 미만 숨김, chat 입력 모바일 stack 레이아웃, History table min-width로 가로 스크롤. `xs:480px` 브레이크포인트 + `100dvh` 사용.
- **7.22 instrumentation + 진단 가이드** — `workerDefaults.logEnterTiming=true`로 `[C4 TIMING]` snapshot. `docs/diagnose-pending-task-enter.md`로 재현/조사 절차 문서화. 3-worker 2KB task 라이브 repro 검증 — 통과.

### Phase 9 follow-ups
- **9.3 SDK publish 준비** — `src/sdk.d.ts` 타입 선언, package.json `types`/`publishConfig.access`/`prepublishOnly`/`files` 정리, README에 SDK 섹션.
- **9.4 MCP 프로토콜 최신화** — protocolVersion 협상(`2025-03-26` ↔ `2024-11-05`), `ping` 응답, `notifications/initialized` 외 `initialized` 별칭, `capabilities.tools.listChanged=true` + `capabilities.logging`.
- **9.6 Fleet write-through** — `/fleet/create` `/fleet/task` `/fleet/close` `/fleet/send`. SDK `fleetCreate`/`fleetTask`/`fleetClose`/`fleetSend`/`fleetKey`. 4개 단위 테스트 추가 (총 7개).

### 1.6.16 누적 (9차 — Daemon static serving / Worker process metrics)
- **Daemon static serving** (TODO #94) — `c4 daemon start`만으로 Web UI(`web/dist`)가 같이 서빙된다. `_serveStatic(route, res)` 헬퍼가 `index.html`/asset/SPA fallback을 처리하고, `/assets/*`는 `Cache-Control: public, max-age=31536000, immutable`로, 그 외 HTML은 `no-cache`로 보낸다. `/api/*`나 누락된 `/assets/*`는 `false`를 반환해 daemon이 JSON 404로 떨어지게 했다. STATIC_ROOT(`web/dist`)가 없으면 helper가 즉시 `false`를 반환해 `vite preview` 환경과 충돌하지 않는다. Path traversal 하드닝(`path.resolve` + `startsWith(STATIC_ROOT)`)도 포함. `tests/static-serving.test.js` 8개 케이스 추가.
- **Worker process metrics** (TODO #95) — `src/worker-metrics.js`에서 Linux `/proc/<pid>/{stat,status}` 파싱으로 CPU%/RSS/threads 측정. CPU%는 직전 sample과의 utime+stime 델타 ÷ 경과 ms로 계산하고 worker._lastCpuSample에 캐시. `list()` 응답에 cpuPct/rssKb/threads 필드 추가, manager.metrics() + GET `/metrics` 라우트로 daemon RSS/heap/loadavg + worker 합계 노출. Web UI 상단에 `MetricsBar.tsx`로 live worker / CPU / RSS 요약 표시. 비-Linux 또는 죽은 pid는 graceful null. `tests/worker-metrics.test.js` 6개 케이스 + 라이브 daemon 검증 (200 OK, 정상 JSON).
- **Pool reuse 라이브 트리거 검증** (TODO #96) — `_reuseWorker` 통합 테스트 4개 추가: rename + state reset + `pool_reuse` SSE + `actor:'pool'` audit + sendTask 위임이 한 사이클에서 모두 성립함을 검증. dead/missing pool name → graceful error, missing _emitSSE/audit hooks → no crash. WorkerList SSE 핸들러는 connected 외 모든 이벤트 수신 시 자동 refetch하므로 reuse 이후 새 이름으로 즉시 갱신.

### 1.6.16 누적 (8차 — Computer Use 단위 테스트 / TODO 정리 / audit export / pool 가시성 / project RBAC / Slack Block Kit)
- **Computer Use runner 단위 테스트** — `tests/computer-use-runner.test.js`. Module._load 후킹으로 `@anthropic-ai/sdk` 모킹 후 `_buildAnthropicRunner`의 액션 매핑 검증 (left_click → click, type → type, key → key, scroll → scroll, wait → wait*1000, no tool_use → done). SDK 미설치 케이스도 helpful 에러 검증. 8개 케이스.
- **TODO.md 정리** — Phase 8.1을 done(완료)으로, 8.2/8.3/8.4를 todo(deferred)로 명시 + 보류 사유 기록.
- **Audit export** — `manager.exportAudit({ format: 'json'|'jsonl'|'csv', ...filters })`. CSV는 헤더 row + comma/newline 안전 quoting. GET `/audit/export` (admin-only) + Content-Disposition으로 다운로드. SDK `auditExport`. 5개 신규 테스트.
- **Worker pool 가시성** — `_reuseWorker`가 snapshot에 `[C4 POOL] reused worker '<from>' as '<to>'` 마커 + `pool_reuse` SSE + audit 항목(`actor:'pool'`) 추가. dashboard / 감사 로그에서 reuse가 눈에 띄게.
- **Project-scoped RBAC** — `Auth.enforceProjectScope(payload, manager, body)`. 사용자 레코드에 `projects: [...]` 있으면 다른 프로젝트의 워커 mutation 거부. admin은 면제. daemon이 mutation 후 post-handler에서 검증 + 거부 시 audit. 4개 신규 케이스.
- **Slack Block Kit 알림** — `buildSlackPayload(text)` 추가. 알림 첫 줄 prefix(`[CRITICAL DENY]`/`[WORKFLOW FAIL]`/`[SCHEDULE FAIL]`/`[COST BUDGET]`/`[STALL]`/`[ESCALATION]`/`[CI PASS|FAIL]`)에 따라 색깔 + header + code-block section + context block. 일반 텍스트는 `{ text }` 그대로. 8개 케이스.

### 1.6.16 누적 (7차 — Plugin MCP / e2e 라이브 / 토큰화 sweep / Computer Use API / 메타데이터 마감)
- **Plugin MCP shim** — `plugin/.mcp.json` + `plugin/scripts/mcp-stdio.js`. Claude Code가 워커 부팅 시 c4 plugin을 로드하면 stdio MCP로 c4 daemon의 HTTP `/mcp`를 자동 브리지. `C4_DAEMON_TOKEN` env로 RBAC 토큰 forwarding. 라이브 검증: `tools/list` JSON-RPC 응답 정상 (15 tools 반환).
- **라이브 e2e chain** — daemon restart 후 workflow.run(3 step) → board.card → board.move → nl.run(schedule-daily, cron `30 8 * * *` 정확 파싱) → audit이 모든 mutation 기록 + workflow 내부 audit('actor: workflow') 분리 캡처. 완전 통과.
- **CLI completion 라이브 활성화** — `compgen -F _c4_complete`로 52개 후보 + `c4 schedule <tab>` → add/remove/enable/run 4개 서브커맨드 검증.
- **Web UI 토큰 sweep** — ScribeContext / WorkerHistory / WorkerChat의 잔여 hard-coded `gray-X / red-X / blue-X / amber-X` 클래스를 `surface*/foreground/muted/primary/danger/warning` 토큰으로 교체. 라이트 테마에서 깨지지 않게.
- **Computer Use Anthropic API 옵션** — `ComputerUseAdapter`가 `opts.apiKey` 또는 `ANTHROPIC_API_KEY`로 실제 `client.beta.messages.create` 호출 (computer-use-2024-10-22 beta + tool `computer_20241022`). API key 없으면 runner=null로 mock 주입 가능. left_click/type/key/scroll/wait/screenshot/done 매핑.
- **버전 metadata** — README/README.ko 배지를 1.6.16 + Claude Code v2.1.85-2.1.123 + 77 tests로 갱신.

### 1.6.16 누적 (6차 — auth bootstrap / OpenAPI 자동추출 / shell completion / scheduler nextRunAt / 라이트 테마 / marketplace)
- **Auth bootstrap 체크** — `Auth.applyConfig()`로 분리. enabled+secret 누락 시 stderr 경고 (재시작이 토큰 무효화). 빈 users 경고. 핫 리로드 시에도 secret 일관성 유지. `manager._auth = auth`로 hot-reload 경로에 노출.
- **OpenAPI 자동 추출** — `_extractRoutes()`가 `daemon.js` 정규식으로 모든 `req.method === ... && route === ...` 매치 + 직전 주석 라인을 summary로 끌어옴. `OVERRIDES`로 핵심 라우트는 hand-tuned 설명. 86 routes 자동 발견. 캐시 + reset hook.
- **CLI auto-completion** — `scripts/c4-completion.{bash,zsh}` + `c4 completion bash|zsh`로 출력. `source <(c4 completion bash)`로 바로 활성화. 워커 이름은 `c4 list`로 동적 보완.
- **Scheduler nextRunAt** — `Scheduler._nextRunAfter(cron, base)`가 minute-by-minute 스캔 (31일 cap)으로 다음 실행 시각 계산. `list()`가 enabled 항목에 nextRunAt 포함. Web UI에 "Next run" 컬럼.
- **Web UI 라이트 테마** — `index.css`에 `html[data-theme="light"]` + `prefers-color-scheme` 토큰 세트 추가. `web/src/lib/theme.ts`로 dark/light/auto 사이클. App 헤더에 토글 버튼 (Sun/Moon/Monitor 아이콘).
- **Marketplace 정리** — root `.claude-plugin/marketplace.json`이 `plugin/` subdir의 c4 plugin을 git-subdir source로 가리킴. stale root `plugin.json` 제거. `claude plugin validate /home/shinc/c4` ✔ 통과 (marketplace) + `claude plugin validate /home/shinc/c4/plugin` ✔ 통과 (plugin).

### 1.6.16 누적 (5차 — README.ko / ops 가이드 / Worker timeline / scribe 확장 / workflow graph / plugin 정합)
- **README.ko.md 동기화** — Phase 9-11 surface / CLI cheat sheet / auth / SDK 섹션을 한국어로 추가.
- **`docs/ops.md`** — daemon 라이프사이클(start/restart/hot-reload), 인증(RBAC), 모니터링(audit/SSE/cost/notifications), 백업/복원, fleet 운영, 트러블슈팅, OpenAPI, 운영 체크리스트.
- **Worker timeline 탭** — `WorkerTimeline.tsx` (`/api/hook-events?name=` 폴링 + SSE `hook` 라이브 갱신). PreToolUse/PostToolUse 별 색깔 dot + Bash/Edit/Write 등 툴 아이콘.
- **scribe 메시지 폭 확장** — Bash 커밋/push/test 명령은 `milestone`/`progress`로 기록. `TaskCreate/TaskUpdate/Agent` 도구 사용도 entry. `system` / `error` 메시지 타입도 entry로 적재.
- **Workflow graph 뷰** — `WorkflowGraph.tsx`: 토폴로지 layering으로 step 노드 + dependsOn 시각화. JSON 편집기 옆 `Code/Graph` 토글. 그래프에서 step 삭제/promote가 JSON으로 양방향.
- **Plugin spec 정합** — Claude Code 실제 플러그인 형식 점검: `.claude-plugin/plugin.json` + `skills/<name>/SKILL.md`. 기존 `plugin/manifest.json` + `plugin/commands/*.js` 제거 후 `c4-orchestrator` 단일 Skill로 통합 (모든 c4 명령 사용법 + 의사결정 트리 + 워크플로우 schema). `claude plugin validate /home/shinc/c4/plugin` ✔ 통과. tests/plugin.test.js 4 케이스로 재작성.

### 1.6.16 누적 (4차 — SSE 훅 / 풀 재사용 / 워크플로우 템플릿 / OpenAPI / .gitignore)
- **Web UI SSE 훅** — `web/src/lib/useSSE.ts`로 EventSource 단일 공유 + `useSSE(['type'], cb)` 훅. BoardView / SchedulerView / WorkflowView가 board_event / schedule_fire / workflow_end 도착 시 즉시 refetch.
- **Worker pool 보강** — `_findPoolWorker(options.adapter)`가 suspended/intervention/branch/worktree 워커 제외 + adapter 매칭 검증. claude pool은 local-llm task에 재사용 안 됨. 8개 단위 테스트.
- **Workflow templates store** — `manager.{save,load,list,delete}WorkflowTemplate(name)`. logs/workflows/&lt;name&gt;.json 영속, name sanitization (`[A-Za-z0-9._-]`)으로 path traversal 방지. GET/POST `/workflow/templates`, `/workflow/template`, POST `/workflow/template/delete` (admin). SDK 4개 메서드. 5개 단위 테스트.
- **OpenAPI 3.1 스펙** — `src/openapi.js`가 모든 daemon 라우트 메타데이터를 빌드. GET `/openapi.json` (auth bypass — public discovery). SDK `openapi()`. 3개 단위 테스트로 매핑 검증.
- **.gitignore 보강** — `scheduler-state.json` 추가.

### 1.6.16 누적 (3차 — CLI / 백업 / hot-reload / 알림 / workflow UI)
- **CLI 신규 명령** — `c4 audit / projects / departments / cost / nl / workflow run / schedules / schedule add|remove|enable|run / board (view|add|move|delete) / transfer / backup / restore`. 새 daemon 라우트들을 모두 CLI로 노출.
- **Workflow runs reader + Web UI** — `manager.getWorkflowRuns({ limit, name })` + GET `/workflow/runs`. Web UI에 `WorkflowView` (JSON 편집기 + 템플릿 + 실행 결과 + 최근 run 히스토리 details).
- **Notifications 다양화** — workflow 실패 / scheduler 실패 / cost budget 월간 초과 시 `_notifications.pushAll()` 자동 호출 (월별 once-per-month 가드).
- **Daemon hot-reload** — `manager.watchConfig()` (fs.watch + 300ms debounce)로 config.json 변경 자동 reload. SSE `config_reload` emit. `config.daemon.watchConfig=false`로 비활성.
- **Backup/restore** — `manager.backup({ outPath })`로 config + state + history + audit + workflow runs + board JSONL 모두 tar.gz 묶음. `manager.restore({ archive, dryRun })`. POST `/backup` `/restore` (admin 전용), CLI `c4 backup` `c4 restore`.
- **/create 라우트 adapter forward** — `/create`가 body의 `adapter`/`adapterOpts`/`resume`을 manager.create에 전달. local-llm 등 alternative runtime 라이브 검증 가능.
- **라이브 검증** — local-llm adapter spawn override를 echo 런타임으로 실증 (raw log 2바이트 newline). 다른 daemon 변경 없이 adapter만 끼워서 alternative process 띄움.

### Phase 9-11 (2차 — depth + UI + integration)
- **Per-worker adapter** — 워커별 `_adapter` 인스턴스로 모든 detection 라우팅. PTY 핫패스의 `this._termInterface.*` 호출을 전부 `worker._adapter.*`로 마이그레이션해서 local-llm / computer-use 워커가 ClaudeCode TUI 패턴을 끼지 않도록 분리.
- **Auth login Web UI** — `web/src/lib/auth.ts`가 `installAuthFetch()`로 글로벌 fetch 래핑 + 401 자동 로그아웃. `LoginForm.tsx` + 헤더 사용자 배지 + 로그아웃 버튼. App boot가 `/api/list`로 auth 활성 여부 probe.
- **SSE 이벤트 확장** — workflow `workflow_start/workflow_end`, scheduler `schedule_fire`, board `board_event`, non-pty 워커 `worker_start` emit. Web UI 자동 갱신 트리거.
- **Non-PTY worker 흐름** — `_createNonPty()`가 PTY 없이 worker 등록 (computer-use 등). close 시 SIGTERM 대신 alive=false flip.
- **HTTP integration tests** — http.createServer + SDK로 round-trip 검증 (health/projects/board/workflow/nl).
- **README 보강** — Phase 9-11 새 surface 표 + CLI 치트시트 + auth 설정 예제.

### Phase 9-11 (1차 일괄 마무리)
- **9.1 Agent adapter 패턴** — `src/adapters/{agent-adapter,claude-code-adapter,index}.js`. PtyManager `_termInterface`를 adapter alias로 재배선 (호출 경로 무변경). `getAdapter(name, opts)` / `register(name, ctor)` / `listAdapters()`.
- **9.2 Local LLM adapter** — `local-llm-adapter.js`. Ollama / llama-run / 임의 CLI runtime + model 인자로 spawn 명령. 권한 프롬프트 detection 무력화.
- **9.5 Plugin scaffolding** — `plugin/manifest.json` + 6개 슬래시 명령 (`/c4-new` `/c4-task` `/c4-list` `/c4-read` `/c4-close` `/c4-dispatch`). 각각 SDK 통해 daemon 호출.
- **9.7 Dispatcher** — `manager.dispatch({ task, tags?, strategy? })` (least-load / round-robin / tag-match) + maxWorkers 캡 + dryRun. CLI `c4 dispatch ...`.
- **9.8 Fleet 파일 전송** — rsync/scp wrapper, `_transfers` 영속화, sshHost 기반 peer→peer 전송. POST `/fleet/transfer` + cancel.
- **10.1 RBAC** — HMAC compact token + viewer/manager/admin tier + route 요구 매트릭스. POST `/auth/login` GET `/auth/whoami`. 기본 disabled.
- **10.2 Audit log** — append-only `logs/audit.jsonl` 자동 기록 + GET `/audit` 검색. parseBody가 `req._auditBody`에 stash.
- **10.3 Project view** — worktree 경로 → config.projects[*].root/rootMatch 매핑 + per-project worker/queued/recentTasks 그룹.
- **10.4 CI/CD webhooks** — GitHub HMAC + GitLab token, PR/MR 자동 review dispatch + push deploy task. POST `/webhook/github` `/webhook/gitlab` (raw body).
- **10.5 Cost report** — daily 집계 + per-model pricing (`tokenMonitor.pricing`) → USD + 월간 합계 + monthlyBudget 초과 플래그.
- **10.6 Departments** — `config.departments[*]`에 members/machines/projects/workerQuota → activeWorkers 집계 + `quotaCheck(dept)`.
- **10.7 Scheduler** — 5-field cron parser/matcher + tick + add/remove/enable/runNow + `scheduler-state.json` 영속 + config.schedules 머지. POST `/scheduler/start|stop`, `/schedule[+remove/enable/run]`.
- **10.8 PM kanban** — append-only board JSONL + create/update/move/delete + TODO.md import 헬퍼. 4-status 칸반 뷰.
- **11.1 MCP hub** — `config.mcp.servers` + workerDefaults/profile/options 우선순위로 워커별 `.claude/settings.json`의 mcpServers inject.
- **11.2 Computer Use adapter** — `runStep/runGoal({ goal, executor, screenshot })` 루프 + injectable runner. PTY surface short-circuit.
- **11.3 Workflow engine** — JSON workflow {steps:[{id, action, args, dependsOn?, on_failure?}]} + 빌트인 핸들러 11종 (task/dispatch/wait/shell whitelist/notify/sleep/list/create/close/schedule). abort 캐스케이드 + `logs/workflow-runs.jsonl` 영속. POST `/workflow/run`.
- **11.4 NL interface** — heuristic intent parser (list/create/close/schedule-daily/review-pr/dispatch/fleet-task '에서') → 11.3 workflow로 변환 → `runNL(text, { execute, minConfidence })`. POST `/nl/parse` `/nl/run`.

신규 파일: `src/adapters/{agent-adapter,claude-code-adapter,local-llm-adapter,computer-use-adapter,index}.js`, `src/sdk.js` + `src/sdk.d.ts`, `src/auth.js`, `src/scheduler.js`, `src/pm-board.js`, `src/webhooks.js`, `src/workflow.js`, `src/nl-interface.js`, `plugin/manifest.json`, `plugin/commands/c4-*.js`, `plugin/README.md`. 신규 테스트 13개 파일 (총 72 file passing).

### Phase 9 (1차)
- **Agent SDK** (TODO 9.3): `src/sdk.js` + `package.json` exports. `require('c4-cli/sdk').create({host,port})`로 createWorker / sendTask / wait / waitMulti / approve / suspend / resume / merge / rollback / readNow / scrollback / list / history / scribe / fleet / SSE events / untilIdle 헬퍼까지 데몬 HTTP API 풀 매핑. 11개 단위 테스트 (`tests/sdk.test.js`).
- **MCP server 확장** (TODO 9.4): `src/mcp-handler.js` tool 목록 5→15개. send_input/send_key/approve_critical/suspend_worker/resume_worker/rollback_worker/merge_worker/task_history/token_usage/scribe_context 추가. serverInfo.version을 package.json에서 동적 로드. 기존 18개 단위 테스트 갱신.
- **Fleet scaffold** (TODO 9.6): `config.fleet.peers` 등록. `fleetPeers()`/`fleetList()` 메서드가 SDK로 peer 데몬 health/list 병렬 조회 (offline은 unreachable). `/fleet/peers` `/fleet/list` 라우트, SDK `fleetPeers/fleetList`, CLI `c4 fleet peers|list`. 3개 단위 테스트 (`tests/fleet.test.js`). 9.7 dispatcher / 9.8 파일전송 토대.

## [1.6.15] - 2026-04-17

### Fixed
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
