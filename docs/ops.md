# C4 운영 가이드 (1.6.16)

데몬 관리, 모니터링, 백업/복원, 장애 처리. 1차 사용자 가이드는 `README.md`,
TODO/CHANGELOG는 같은 디렉토리에서 참조.

## 1. 데몬 라이프사이클

### 시작 / 종료

```bash
c4 daemon start           # 백그라운드 + ~/.c4/c4-daemon.pid
c4 daemon status
c4 daemon restart         # 코드 변경 후 데몬 재기동
c4 daemon stop
c4 health                 # GET /health
```

자동 시작: 운영체제 init 등록 (systemd 사용 예시는 `watchdog.sh` 참고).

### Hot-reload (1.6.16)

- 데몬은 `config.json`을 `fs.watch`로 감시 (300ms debounce).
- 변경 시 `reloadConfig()`가 호출되어 `users / projects / schedules / fleet`이
  즉시 갱신. SSE `config_reload` 이벤트가 emit.
- 끄려면 `config.daemon.watchConfig = false`.
- 강제 트리거: `POST /config/reload` 또는 `c4 config reload`.

## 2. 인증 (RBAC, 기본 비활성)

```jsonc
{
  "auth": {
    "enabled": true,
    "tokenTtlMs": 86400000,
    "secret": "<HMAC 서명용. 미설정 시 매 부팅 랜덤>",
    "users": {
      "alice": { "password": "…", "role": "admin" },
      "bob":   { "password": "…", "role": "manager" },
      "carol": { "password": "…", "role": "viewer" }
    }
  }
}
```

- `viewer`: GET 라우트만.
- `manager`: 일반 워커 mutation (`/create /task /send /key /approve` 등).
- `admin`: 파괴적 / 운영 라우트 (`/close /rollback /restart /cleanup
  /batch-action /merge /backup /restore /audit /scheduler/* /schedule*
  /workflow/template* /fleet/{create,task,close,send,transfer}`).

토큰 받기: `POST /auth/login { username, password }` → `{ token, role, exp }`.
이후 모든 호출에 `Authorization: Bearer <token>` 헤더.

웹 UI는 `/api/list` 401을 트리거로 자동 로그인 폼 노출.

> 주의: `secret`을 명시하지 않으면 매 데몬 부팅마다 랜덤 시크릿이 생성되어
> 기존 토큰이 무효화됨. 재시작 후에도 토큰을 유지하려면 명시적 secret 필수.

## 3. 모니터링

### Audit log (10.2)

- 위치: `logs/audit.jsonl` (append-only).
- 기록: 모든 mutation 라우트 결과 + actor / action / worker / bodyKeys / 타임스탬프.
- 조회: `c4 audit [--worker X] [--actor Y] [--action /create] [--since
  2026-04-01] [--limit 200]`, GET `/audit`.
- 끄려면: `config.audit.enabled = false`.

### SSE 이벤트 스트림

`GET /events`로 다음 종류가 흐름:

| type | 트리거 |
|------|--------|
| `permission` | 워커가 권한 프롬프트 진입 |
| `question`, `error`, `scope_deny` | intervention 감지 |
| `hook` | PreToolUse/PostToolUse 훅 수신 (3.15) |
| `worker_start` | non-PTY 워커 등록 |
| `workflow_start`, `workflow_end` | 11.3 워크플로우 |
| `schedule_fire` | 10.7 cron 발사 |
| `board_event` | 10.8 칸반 변동 |
| `config_reload` | hot-reload 또는 명시적 reload |

웹 UI는 `web/src/lib/useSSE.ts`를 통해 단일 EventSource를 공유.

### Token / Cost (10.5)

- 일별 토큰: `~/.claude/projects/.../session.jsonl`을 주기적으로 스캔
  (`config.tokenMonitor.enabled`).
- 비용 리포트: `c4 cost [--model X] [--since YYYY-MM-DD] [--until ...]`.
- 단가는 `config.tokenMonitor.pricing.<model>.{inputPer1M, outputPer1M}`.
- 월 예산 초과 알림은 한 달에 한 번만 발송 (`_budgetAlertSentMonth` 가드).

### Notifications (1.6.16 다양화)

기본 채널은 `config.notifications` 섹션. 추가된 트리거:

- `[WORKFLOW FAIL] <name>`: workflow 엔진 실패 시.
- `[SCHEDULE FAIL] <id> (<cron>)`: cron 액션 에러.
- `[COST BUDGET] <month>`: 월간 budget 초과 첫 감지.
- `[CRITICAL DENY]`: L4 critical_deny 진입 (5.13).

## 4. 백업 / 복원

```bash
c4 backup  --out /tmp/c4-snapshot.tar.gz
c4 restore /tmp/c4-snapshot.tar.gz --dry-run     # 압축 안 풀고 파일 목록만
c4 restore /tmp/c4-snapshot.tar.gz                # 실제 복원 + reloadConfig
```

스냅샷에 포함되는 파일:

```
config.json
state.json
history.jsonl
scheduler-state.json
token-state.json
scribe-state.json
logs/audit.jsonl
logs/workflow-runs.jsonl
logs/board-*.jsonl
```

> 비밀: `config.json`에는 auth secret/SMTP 패스워드 등이 포함될 수 있으니
> 아카이브 자체를 권한 600으로 보관하세요.

## 5. Fleet 운영 (9.6 / 9.7 / 9.8)

`config.fleet.peers`에 다른 c4 daemon을 등록:

```jsonc
"fleet": {
  "local": { "tags": ["dev"], "maxWorkers": 5 },
  "peers": {
    "dgx": { "host": "192.168.10.222", "port": 3456,
             "tags": ["gpu","linux"], "maxWorkers": 3,
             "sshHost": "shinc@192.168.10.222" },
    "build": { "host": "192.168.10.50", "port": 3456 }
  }
}
```

- `c4 fleet peers` — 헬스/지연.
- `c4 fleet list`  — 모든 peer의 워커 통합.
- `c4 dispatch "..." --strategy least-load` — peer 자동 선택.
- `c4 transfer dgx local /remote/path /local/path` — rsync (peer.sshHost 필수).

## 6. 트러블슈팅

### 데몬 응답 없음 / 좀비

```bash
c4 daemon status        # PID + 헬스 응답 확인
c4 daemon restart       # 좀비면 stop → start
```

### Worker가 Enter를 못 받음 (TODO 7.22)

1. `config.workerDefaults.logEnterTiming = true` 후 재시작.
2. 워커 snapshot에 `[C4 TIMING] write=Xms delay=Yms cr=ok len=N`이 찍힘.
3. `[C4] pendingTask Enter retry #1` 등이 보이면 verify-and-retry가 캐치한 것.
4. 그래도 멈추면 `c4 read-now <name>`으로 입력 프롬프트 상태 확인,
   `c4 key <name> Enter`로 수동 돌파.
5. 상세: `docs/diagnose-pending-task-enter.md`.

### Hook 이벤트가 안 들어온다

- `tail -f logs/daemon.log | grep hook-event` — `worker= hook_type=` 비어있으면
  `_buildHookCommands`가 worker 이름을 stdin에 inject 못한 것. 1.6.16(7.24)
  이전이면 업데이트 필수.

### Auth 후 401만 떨어진다

- `config.auth.secret`이 매 부팅마다 다르면 토큰이 즉시 무효. 명시적 secret 설정.
- 시계 드리프트로 `exp` 검증 실패 가능. 서버 시간 확인.

### Worktree 정리

```bash
c4 cleanup              # 고아 worktree / 브랜치 일괄 정리
c4 cleanup --dry-run    # 실수 방지
```

## 7. OpenAPI / 외부 도구 연동

```bash
curl http://127.0.0.1:3456/openapi.json | jq '.paths | keys'
```

(인증 비활성. 외부 SDK 생성, Postman, Insomnia 컬렉션 임포트 시 사용)

## 8. 운영 체크리스트

- [ ] `config.auth.enabled = true` + `secret` 명시 (운영 환경)
- [ ] `config.tokenMonitor.pricing` 채워서 cost 알림 받기
- [ ] `config.notifications.slack.webhookUrl` 또는 email 설정
- [ ] 매주 `c4 backup`을 cron으로 (10.7로도 가능)
- [ ] `logs/` 디스크 용량 모니터링 (`config.logs.maxLogSizeMb`)
- [ ] Fleet peer 추가 시 `tags` + `maxWorkers` + (필요 시) `sshHost`
- [ ] daemon update 후 `c4 health` + `c4 list`로 회귀 확인

문서가 부족한 영역은 `docs/diagnose-*.md` 또는 GitHub issue로.
