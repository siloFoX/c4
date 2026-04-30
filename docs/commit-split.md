# 1.6.16 — 권장 커밋 분할

이번 라운드에서 한꺼번에 들어간 변경(74개 파일)을 논리적 단위로 끊어서
PR이나 review를 쉽게 만들기 위한 가이드. 각 묶음은 독립적으로 빌드/테스트
통과하므로 이대로 cherry-pick / squash 해도 무방.

## 1. fix(7.24): hook payload field rename
- `src/hook-relay.js` (worker name argv + hook_event_name → hook_type alias)
- `src/pty-manager.js` (`_buildHookCommands` workerName 인자, hookEvent fallback)
- `src/daemon.js` (`/hook-event` fallback)
- `tests/hook-ascii.test.js` (node-relay 기준 갱신)

## 2. feat(7.21): wait --all collect-all mode
- `src/pty-manager.js` (`waitAndReadMulti` mode 'first' | 'all')
- `src/daemon.js` (`/wait-read-multi?mode=`)
- `src/cli.js` (`c4 wait --all` 자동 mode=all)
- `tests/parallel-wait.test.js` (+3)

## 3. feat(7.22 / 7.25): pendingTask Enter verify-and-retry
- `src/pty-manager.js` (`_writeTaskAndEnter` verifyWith 옵션 + helpers + 5개 호출 사이트)
- `tests/pending-task-verify.test.js` (신규 9 테스트)
- `docs/diagnose-pending-task-enter.md` (재현/진단 가이드)

## 4. feat(7.26): question/critical-deny 패턴 보강
- `src/pty-manager.js` (CRITICAL_DENY +6, _getQuestionPatterns +13)
- `tests/critical-deny.test.js` (+8), `tests/approve-key.test.js` (신규 7)

## 5. feat(8.5–8.9): Worker UX & control panel
- daemon: `/key /merge /suspend /resume /restart /cancel /batch-action /scribe/context /rollback`
- `src/pty-manager.js` (suspend/resume/restart/cancelTask/batch + scribeContext + _compactReadText 등)
- `src/cli.js` (suspend/resume/restart/cancel/batch-action)
- Web UI: WorkerActions, BatchControls, WorkerChat, WorkerHistory, ScribeContext, App nav, mobile responsive
- 디자인 시스템: `web/src/lib/cn.ts`, `web/src/index.css` 토큰, tailwind.config.js
- tests: `suspend-resume.test.js`, `parallel-wait` 갱신

## 6. feat(9.x): SDK + MCP + Fleet (read+write) + Plugin
- `src/sdk.js` + `src/sdk.d.ts` (50+ API + types)
- `src/mcp-handler.js` (15 tools, protocolVersion 협상, ping)
- `src/pty-manager.js` (fleetPeers / fleetList / fleetCreate / fleetTask / fleetClose / fleetSend / dispatch / fileTransfer + 9.1 adapter 통합)
- `src/adapters/{agent-adapter,claude-code-adapter,local-llm-adapter,computer-use-adapter,index}.js` (per-worker adapter)
- `plugin/manifest.json` + `plugin/commands/c4-*.js` + `plugin/README.md`
- daemon routes: `/fleet/*`, `/dispatch`, plugin commands
- CLI: `c4 dispatch`, `c4 fleet`, `c4 transfer`
- tests: sdk(11), mcp(20), fleet(7), dispatcher(6), transfer(10), adapters(12), plugin(5), non-pty(1)

## 7. feat(10.x): Enterprise (RBAC / Audit / Projects / Cost / Departments / Scheduler / PM)
- `src/auth.js` + `src/scheduler.js` + `src/pm-board.js` + `src/webhooks.js`
- `src/pty-manager.js` (audit/getAudit, listProjects, getCostReport, listDepartments, scheduler 메서드, _ensurePmBoard)
- daemon routes: `/auth/*`, `/audit`, `/projects`, `/cost-report`, `/departments`, `/schedules`, `/schedule*`, `/board*`, `/webhook/*`
- CLI: `c4 audit/projects/departments/cost/schedules/schedule/board`
- Web UI: ProjectsView, CostReportView, DepartmentsView, BoardView, SchedulerView, AuditView, FleetView, LoginForm + auth fetch wrapper
- tests: auth(12), audit(6), projects(4), cost-report(5), departments(6), pm-board(6), scheduler(10), webhooks(7)

## 8. feat(11.x): MCP hub + Workflow + NL + Computer Use
- `src/workflow.js` + `src/nl-interface.js` + `src/adapters/computer-use-adapter.js`
- `src/pty-manager.js` (mcp-hub resolveMcpServersForWorker, _ensureWorkflow, _ensureNL, getWorkflowRuns)
- daemon routes: `/workflow/run`, `/workflow/runs`, `/nl/parse`, `/nl/run`
- Web UI: WorkflowView, NLCommandBar
- tests: mcp-hub(7), workflow(6), nl(13), adapters(+4 computer-use)

## 9. feat(infra): backup / restore / hot-reload / notifications / SSE 확장
- `src/pty-manager.js` (backup, restore, watchConfig, _emitSSE on schedule_fire/board_event/worker_start/workflow_*; cost budget alert)
- `src/scheduler.js` + `src/workflow.js` + `src/pm-board.js` (SSE + 알림 통합)
- daemon routes: `/backup`, `/restore`
- CLI: `c4 backup`, `c4 restore`

## 10. docs: README/CHANGELOG/TODO + diagnose 문서
- `README.md` (Phase 9-11 surface + CLI cheat sheet + auth example + SDK section)
- `CHANGELOG.md` (1.6.16 1·2·3차 항목)
- `TODO.md` (전 Phase 상태 갱신)
- `docs/diagnose-pending-task-enter.md`, `docs/commit-split.md`

## 자동화

```bash
git -C /home/shinc/c4 add -p   # 파일별로 검토
# 또는 위 단위로 묶어서 git add ... && git commit -m "..."
```

각 묶음 후 `npm test`로 회귀 가능. Phase 1-7 회귀 테스트가 같이 돌아서
이번 라운드 변경이 기존 동작을 깨지 않는지 확인됨 (74 passed throughout).
