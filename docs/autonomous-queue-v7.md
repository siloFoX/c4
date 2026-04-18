# 자동 실행 큐 v7 (v1-v6 이후, TODO 잔여 장기/후속 항목)

v6 완료 후 TODO.md에 남은 todo 항목 중 구현 스코프가 명확한 것들. 순서는 의존성/리스크 기준.

## 태스크 큐

### [1] TODO 8.16 — dep smoke check
- 워커: dep-smoke
- 브랜치: c4/dep-smoke
- 범위: pre-merge check에 package.json diff 감지 시 npm ci + require() smoke test 추가. bcryptjs 사건 재발 방지.

### [2] TODO 8.5 — daemon API 보강
- 워커: daemon-api
- 브랜치: c4/daemon-api
- 범위: POST /key (특수키 전송), POST /merge (Web UI 머지), Web UI 갱신.

### [3] TODO 8.15 — Slack 자율 이벤트
- 워커: slack-events
- 브랜치: c4/slack-events
- 범위: daemon 이벤트 루프에 Slack emitter. task 시작/완료/머지/push/halt/error 감지 시 발송. dedupe + 레벨 필터.

### [4] TODO 8.3 — 계층별 토큰 quota
- 워커: tier-quota
- 브랜치: c4/tier-quota
- 범위: 관리자/중간/worker 별 일일 quota. 복잡도 기반 Opus/Sonnet/Haiku 자동 선택.

### [5] TODO 10.9 — Scribe v2 구조화 로그
- 워커: scribe-v2
- 브랜치: c4/scribe-v2
- 범위: JSONL 이벤트 (task_start, worker_spawn, tool_call, merge 등). Web UI 타임라인 대시보드. 기존 텍스트 로그 backward compat.

### [6] TODO 9.12 — Planner Back-propagation
- 워커: planner-loop
- 브랜치: c4/planner-loop
- 범위: 워커가 plan 오류 감지 시 `c4 plan-update` → planner 재호출 → 수정된 plan으로 재dispatch. 루프 3회 제한.

## 제외 항목 (v7에 포함하지 않음)
- 8.1, 8.9 — UI 관련, 디자인 입력 필요
- 8.3 비용 최적화는 구현했지만 실사용 튜닝 필요
- 11.5 — Docker/QEMU 의존성 커서 별도 프로젝트급 작업

## v7 완료 시
- 남은 잔여 todo 대부분 소진
- 사용자 지시 대기
- 신규 요구사항 v8 생성
