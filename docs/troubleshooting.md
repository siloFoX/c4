# Troubleshooting

C4 운영 중 발생하는 주요 문제와 해결 방법.

---

## 1. Zombie Daemon (좀비 데몬)

데몬 프로세스가 PID 파일에는 기록되어 있지만 실제로 응답하지 않는 상태.

### 증상

- `c4 daemon status`가 `Process alive but not responding` 출력
- `c4 health`가 timeout으로 실패
- `c4 list`, `c4 task` 등 모든 명령이 `Daemon not running?` 에러

### 원인

- 데몬 내부 uncaughtException이 HTTP 서버를 멈춘 경우
- node-pty가 메모리 누수로 프로세스를 응답불가 상태로 만든 경우
- Windows에서 SIGTERM이 정상 처리되지 않은 경우

### 해결

```bash
# 1. PID 확인
cat logs/daemon.pid

# 2. 프로세스 강제 종료 (Windows)
taskkill /PID <pid> /T /F

# 3. PID 파일 정리
rm logs/daemon.pid

# 4. 데몬 재시작
c4 daemon start
```

또는 `c4 daemon restart`가 내부적으로 taskkill + PID 정리 + 재시작을 수행한다 (`daemon-manager.js:118-160`).

### 예방

- `watchdog.sh`를 실행하면 60초 간격으로 데몬 상태를 확인하고 자동 재시작한다
- `logs/daemon.log`에서 `uncaughtException`, `unhandledRejection` 로그를 주기적으로 확인

---

## 2. Worktree 잔여물

데몬 재시작이나 워커 비정상 종료 후 git worktree 디렉토리(`c4-worktree-<name>`)가 정리되지 않고 남은 상태.

### 증상

- `git worktree list`에 이미 존재하지 않는 워커의 worktree가 남아있음
- 새 워커 생성 시 `fatal: '<path>' is already a worktree` 에러
- 디스크에 `c4-worktree-<name>` 디렉토리가 잔존

### 원인

- 워커가 비정상 종료되어 `_removeWorktree()`가 호출되지 않음
- 데몬이 강제 종료(SIGKILL, taskkill)되어 cleanup이 실행되지 않음
- lost worker의 worktree에 uncommitted 변경이 있어 자동 정리가 보존한 경우 (`[LOST DIRTY]` 알림 발생)

### 해결

**자동 정리 (권장):**

데몬 시작 시 `startHealthCheck()`가 `_cleanupLostWorktrees()`를 호출하여 자동으로 정리한다. clean worktree는 삭제하고, dirty worktree는 보존 후 알림을 보낸다.

```bash
# 데몬 재시작으로 자동 정리 트리거
c4 daemon restart
```

**수동 정리:**

```bash
# 1. 잔여 worktree 확인
git worktree list

# 2. clean worktree 제거
git worktree remove c4-worktree-<name> --force

# 3. 연결이 끊긴 worktree 정리
git worktree prune

# 4. 디렉토리가 남아있으면 직접 삭제
rm -rf ../c4-worktree-<name>
```

**dirty worktree 복구:**

`[LOST DIRTY]` 알림을 받은 경우 해당 worktree에 커밋되지 않은 작업이 있다.

```bash
# 1. 변경 내용 확인
git -C ../c4-worktree-<name> status
git -C ../c4-worktree-<name> diff

# 2-a. 변경이 필요하면 커밋
git -C ../c4-worktree-<name> add -A
git -C ../c4-worktree-<name> commit -m "recover lost work"

# 2-b. 변경이 불필요하면 worktree 제거
git worktree remove ../c4-worktree-<name> --force
```

### 예방

- `config.json`에서 `worktree.enabled: true` (기본값) 유지
- 워커 종료 시 반드시 `c4 close <name>` 사용
- 데몬 종료 시 `c4 daemon stop` 사용 (SIGTERM 정상 처리로 `closeAll()` 호출)

---

## 3. STALL 반복 (워커 멈춤)

워커가 작업 중 멈추고 출력이 없는 상태가 반복되는 현상.

### 증상

- `[STALL]` 알림이 Slack/Discord/Telegram 등에 반복 수신
- `c4 list`에서 특정 워커가 `busy` 상태로 오래 유지 (intervention 칼럼에 값 표시)
- `c4 read <name>`이 빈 결과 반환

### 원인

**intervention 기반 STALL (`intervention: question` 또는 `escalation`):**

- 워커가 Claude Code 권한 프롬프트(Do you want to proceed?)에서 대기 중
- 워커가 반복적인 에러로 escalation 상태 (기본 3회 연속 실패)
- auto-approve 규칙에 해당하지 않는 도구 사용 시도

**idle 기반 STALL (5분+ 무출력):**

- Claude Code가 응답 생성 중 hang (API timeout)
- PTY 프로세스가 응답 불가 상태
- SSH 워커의 네트워크 연결 끊김

### 해결

```bash
# 1. 현재 상태 확인
c4 read-now <name>

# 2-a. 권한 프롬프트 대기 중이면 승인
c4 key <name> Enter

# 2-b. 질문 대기 중이면 응답
c4 send <name> "응답 내용"

# 2-c. 완전히 멈춘 경우 워커 재시작
c4 close <name>
c4 task <name> "작업 내용" --auto-mode
```

**escalation 해결:**

```bash
# scrollback으로 에러 내용 확인
c4 scrollback <name> --lines 500

# 에러 원인이 코드 문제면 수정 지시
c4 send <name> "에러 원인은 X이다. Y를 수정해라"
```

### 예방

- `config.json`의 `autoApprove` 규칙을 충분히 설정하여 권한 프롬프트 최소화
- `--auto-mode` 플래그로 작업 전송하여 워커 자율성 확보
- `intervention.escalation.maxRetries` 값 조정 (기본 3)
- `healthCheck.timeoutMs` 값 조정 (기본 600000ms = 10분)
- `healthCheck.autoRestart: true` 설정으로 timeout 워커 자동 재시작

---

## 4. Lost Worker 복구

데몬 재시작 후 이전 세션의 워커가 `lost` 상태로 표시되는 경우.

### 증상

- `c4 list`에 `LOST (daemon restart)` 섹션에 워커 표시
- lost 워커의 PTY 프로세스는 이미 종료됨
- 워커의 작업 진행 상태와 브랜치 정보만 남아있음

### 원인

- 데몬이 재시작되면 이전 PTY 프로세스와의 연결이 끊어짐
- `_loadState()`가 `state.json`에서 이전 워커 정보를 복구하되, alive 상태였던 워커를 `lostWorkers` 배열에 기록

### 복구 방법

**방법 1: --resume으로 세션 복구 (권장)**

```bash
# 1. lost 워커의 session ID 확인
c4 list

# 2. session ID로 워커 재개
c4 resume <name>
```

`resume`은 이전 세션의 컨텍스트를 유지하며 워커를 재시작한다. `daemon.js:319-339`에서 `claude --resume <sessionId>`로 구현.

**방법 2: 새 워커로 작업 이어받기**

```bash
# 1. lost 워커의 브랜치 확인
c4 list

# 2. 같은 브랜치에서 새 워커로 작업 계속
c4 task <name> "이전 작업 이어서 진행" --branch c4/<name>
```

**방법 3: 수동 정리**

```bash
# lost 워커 정보만 정리 (작업을 이어받지 않을 때)
c4 close <name>
```

### worktree 복구 주의

lost 워커가 worktree를 사용했다면 해당 worktree에 커밋되지 않은 변경이 있을 수 있다. 데몬 시작 시 `_cleanupLostWorktrees()`가 dirty 여부를 확인하고:
- clean worktree: 자동 삭제
- dirty worktree: 보존 후 `[LOST DIRTY]` 알림 발송

dirty worktree 처리는 [2. Worktree 잔여물](#2-worktree-잔여물) 참조.

### 예방

- `watchdog.sh`를 사용하면 데몬 재시작 시 manager 워커를 자동으로 resume 또는 재생성한다
- `healthCheck.autoRestart: true` 설정으로 timeout 워커를 자동 재시작 (resume 우선 시도)

---

## 5. CLI 에러

`c4` 명령 실행 시 발생하는 일반적인 에러와 해결법.

### `Daemon not running? connect ECONNREFUSED`

데몬이 실행 중이지 않음.

```bash
c4 daemon start
```

데몬이 실행 중인데 에러가 발생하면 포트 충돌 가능성 확인:

```bash
# config.json의 daemon.port와 실제 리스닝 포트 비교
c4 config
```

### `Request timeout`

데몬이 응답하지 않음. [1. Zombie Daemon](#1-zombie-daemon-좀비-데몬) 참조.

```bash
c4 daemon restart
```

### `Worker '<name>' not found`

존재하지 않는 워커 이름 지정.

```bash
# 현재 워커 목록 확인
c4 list
```

### `Worker '<name>' already exists`

같은 이름의 워커가 이미 존재.

```bash
# 기존 워커 종료 후 재생성
c4 close <name>
c4 new <name>
```

### `fatal: '<path>' is already a worktree`

worktree 잔여물. [2. Worktree 잔여물](#2-worktree-잔여물) 참조.

### Git Bash 경로 변환 문제

Git Bash(MSYS2)에서 `/model` 같은 슬래시 명령을 보내면 `C:/Program Files/Git/model`로 변환되는 문제.

```bash
# MSYS_NO_PATHCONV 접두사 사용
MSYS_NO_PATHCONV=1 c4 send <name> "/model"
```

`cli.js`가 자동으로 `MSYS_NO_PATHCONV=1`을 설정하지만, 이미 변환된 인자는 `fixMsysArgs()`로 복원을 시도한다 (`cli.js:9-33`).

### `npm ERR! Test failed` (테스트 실행 관련)

```bash
# 테스트 직접 실행
npm test

# 특정 테스트만 실행
node tests/run-all.js
```

### 데몬 로그 확인

대부분의 문제는 데몬 로그에서 원인을 찾을 수 있다:

```bash
# 최근 로그 확인
tail -100 logs/daemon.log

# 에러만 필터
grep -i "error\|exception\|fail" logs/daemon.log
```

---

## Quick Reference

| 문제 | 진단 명령 | 해결 명령 |
|------|-----------|-----------|
| 좀비 데몬 | `c4 daemon status` | `c4 daemon restart` |
| worktree 잔여 | `git worktree list` | `git worktree remove <path> --force` |
| STALL 반복 | `c4 read-now <name>` | `c4 key <name> Enter` 또는 `c4 close <name>` |
| lost 워커 | `c4 list` | `c4 resume <name>` |
| 데몬 미응답 | `c4 health` | `c4 daemon start` |
| 경로 변환 | - | `MSYS_NO_PATHCONV=1 c4 send ...` |
