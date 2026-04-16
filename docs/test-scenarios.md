# C4 실사용 테스트 시나리오

> 작성일: 2026-04-16
> 대상: C4 v1.5.0
> 환경: Windows 11 + Git Bash, Node.js v24, DGX (Ubuntu 22.04, SSH)

각 시나리오는 실제 운영 상황을 재현하며, 기능 정상 동작과 엣지 케이스를 검증한다.

---

## 목차

| # | 시나리오 | 핵심 검증 |
|---|---------|----------|
| 1 | [기본 워커 흐름](#1-기본-워커-흐름) | 생성 → 작업 → 커밋 → 머지 전체 사이클 |
| 2 | [멀티 워커 병렬](#2-멀티-워커-병렬) | 3+ 워커 동시 실행, worktree 격리, 병렬 wait |
| 3 | [SSH 원격 워커](#3-ssh-원격-워커) | DGX 서버에서 워커 실행, worktree 미생성 확인 |
| 4 | [Worktree 충돌 해소](#4-worktree-충돌-해소) | 같은 파일 수정 시 머지 충돌 감지 및 해결 |
| 5 | [자동 승인 L3/L4](#5-자동-승인-l3l4) | autonomyLevel별 승인/거부 동작, Critical Deny List |
| 6 | [관리자 교체](#6-관리자-교체) | compact → 관리자 자동 교체 → 컨텍스트 복구 |
| 7 | [c4 auto 원커맨드](#7-c4-auto-원커맨드) | 관리자+scribe+워커 자동 생성, 완료까지 무인 |
| 8 | [Batch 처리](#8-batch-처리) | c4 batch로 N개 작업 일괄 실행 |
| 9 | [Scribe 컨텍스트 영속화](#9-scribe-컨텍스트-영속화) | JSONL 스캔 → session-context.md 생성 → PostCompact 주입 |
| 10 | [에러 복구](#10-에러-복구) | 데몬 죽음, 워커 crash, STALL, dirty worktree 복구 |

---

## 1. 기본 워커 흐름

### 목표
단일 워커의 생성 → 작업 전송 → 실행 → 결과 확인 → 머지까지 전체 라이프사이클 검증.

### 사전조건
- `c4 daemon start`로 데몬 실행 중
- 프로젝트 디렉토리에 `config.json` 존재
- main 브랜치에 pre-commit hook 설정 완료 (main 직접 커밋 차단)

### 실행단계
```bash
# 1. 데몬 상태 확인
c4 health

# 2. 워커 생성
c4 new test-basic

# 3. 작업 전송 (auto-mode로 권한 자동 승인)
c4 task test-basic --auto-mode "src/utils.js에 formatDate(date) 함수 추가. ISO 8601 형식 반환. 테스트도 작성."

# 4. 완료 대기
c4 wait test-basic --timeout 300000

# 5. 결과 확인
c4 read test-basic

# 6. 워커 브랜치 diff 확인
git -C <worktree-path> diff main --stat

# 7. 머지
c4 merge test-basic

# 8. 워커 종료
c4 close test-basic
```

### 예상결과
- 워커가 `c4/test-basic` 브랜치의 별도 worktree에서 작업
- `src/utils.js`에 `formatDate` 함수 추가됨
- 테스트 파일 생성 및 통과
- 커밋 메시지 존재
- `c4 merge` 후 main에 변경사항 반영
- `c4 close` 후 worktree 디렉토리 삭제됨

### 검증방법
```bash
# 머지 후 main에 함수 존재 확인
git log --oneline -5
grep -r "formatDate" src/utils.js

# worktree 정리 확인
git worktree list  # test-basic worktree 없어야 함

# 히스토리 기록 확인
c4 history test-basic
```

---

## 2. 멀티 워커 병렬

### 목표
3개 이상 워커가 동시에 서로 다른 파일을 수정하고, 각각 독립적으로 완료되는지 검증. `c4 wait --all` 병렬 대기 동작 확인.

### 사전조건
- 데몬 실행 중
- `config.json`에 `maxWorkers >= 3` 설정
- 테스트용 파일 3개 존재 (각 워커가 수정할 대상)

### 실행단계
```bash
# 1. 워커 3개 생성 + 작업 전송
c4 task feat-a --auto-mode --branch c4/feat-a "src/module-a.js에 함수 추가"
c4 task feat-b --auto-mode --branch c4/feat-b "src/module-b.js에 함수 추가"
c4 task feat-c --auto-mode --branch c4/feat-c "src/module-c.js에 함수 추가"

# 2. 전체 워커 대기 (intervention 감지 포함)
c4 wait --all --interrupt-on-intervention

# 3. 각 워커 결과 확인
c4 read feat-a
c4 read feat-b
c4 read feat-c

# 4. 순차 머지
c4 merge feat-a
c4 merge feat-b
c4 merge feat-c

# 5. 전체 종료
c4 close feat-a
c4 close feat-b
c4 close feat-c
```

### 예상결과
- 3개 워커가 각각 별도 worktree에서 동시 실행
- `c4 list`에서 3개 워커 모두 `alive` 상태 표시
- 각 워커가 서로 다른 파일만 수정 (충돌 없음)
- `c4 wait --all`이 모든 워커 완료 시 반환 (또는 intervention 시 즉시 반환)
- 순차 머지 시 충돌 없이 모두 성공

### 검증방법
```bash
# 워커별 커밋 확인
git log --oneline -10

# worktree 격리 확인 (각각 다른 디렉토리)
git worktree list

# maxWorkers 초과 시 큐잉 동작 확인 (maxWorkers=2로 설정 후 3개 생성)
c4 list  # 2개 alive + 1개 queued
```

---

## 3. SSH 원격 워커

### 목표
DGX 서버(192.168.10.222)에서 원격 워커를 실행하고, 로컬 worktree가 생성되지 않는지 확인.

### 사전조건
- DGX 서버 SSH 접속 가능 (`ssh shinc@192.168.10.222`)
- DGX에 Claude Code 설치됨
- `config.json`의 `targets`에 `dgx` 정의됨:
  ```json
  {
    "dgx": {
      "type": "ssh",
      "host": "shinc@192.168.10.222",
      "defaultCwd": "/home/shinc/arps",
      "commandMap": { "claude": "/home/shinc/.local/bin/claude" }
    }
  }
  ```
- SSH ControlMaster + ServerAlive 설정 완료

### 실행단계
```bash
# 1. SSH 연결 확인
ssh shinc@192.168.10.222 "echo ok"

# 2. 원격 워커 생성
c4 new remote-test --target dgx

# 3. 작업 전송
c4 task remote-test "arps 프로젝트의 README.md에 설치 방법 섹션 추가"

# 4. 대기 + 결과 확인
c4 wait remote-test --timeout 300000
c4 read remote-test

# 5. 종료
c4 close remote-test
```

### 예상결과
- 워커가 DGX 서버에서 실행됨 (SSH PTY)
- **로컬에 worktree 생성 안 됨** (4.22 SSH target worktree 방지)
- DGX의 `/home/shinc/arps` 디렉토리에서 작업 수행
- SSH 끊김 시 자동 재연결 시도 (2.4 SSH 끊김 복구)
- `c4 list`에서 target이 `dgx`로 표시

### 검증방법
```bash
# 로컬 worktree 미생성 확인
git worktree list  # remote-test 관련 항목 없어야 함

# SSH 연결 상태 확인
c4 list  # target: dgx 표시

# DGX에서 작업 결과 확인
ssh shinc@192.168.10.222 "git -C /home/shinc/arps log --oneline -3"
```

---

## 4. Worktree 충돌 해소

### 목표
2개 워커가 같은 파일을 수정했을 때 머지 충돌이 감지되고, 수동 해결이 가능한지 검증.

### 사전조건
- 데몬 실행 중
- 충돌 유발용 공통 파일 존재 (예: `src/shared.js`)

### 실행단계
```bash
# 1. 워커 2개 생성 - 같은 파일 수정
c4 task edit-top --auto-mode "src/shared.js 파일 상단에 export const VERSION = '2.0' 추가"
c4 task edit-bottom --auto-mode "src/shared.js 파일 상단에 export const APP_NAME = 'c4' 추가"

# 2. 대기
c4 wait edit-top
c4 wait edit-bottom

# 3. 첫 번째 머지 (성공)
c4 merge edit-top

# 4. 두 번째 머지 (충돌 예상)
c4 merge edit-bottom
# → 충돌 발생 시 에러 메시지 확인

# 5. 충돌 해결
git -C <project-root> status  # 충돌 파일 확인
# 수동 충돌 해결 후
git -C <project-root> add src/shared.js
git -C <project-root> commit -m "resolve merge conflict"

# 6. 정리
c4 close edit-top
c4 close edit-bottom
```

### 예상결과
- 첫 번째 머지 성공
- 두 번째 머지 시 `CONFLICT` 감지, `c4 merge`가 에러 반환
- 충돌 파일에 `<<<<<<<`, `=======`, `>>>>>>>` 마커 존재
- 수동 해결 후 정상 커밋 가능
- close 후 양쪽 worktree 모두 정리됨

### 검증방법
```bash
# 머지 후 양쪽 변경사항 모두 반영 확인
grep "VERSION" src/shared.js
grep "APP_NAME" src/shared.js

# worktree 잔여물 없는지 확인
git worktree list
ls C:/Users/silof/c4-worktree-*  # 관련 디렉토리 없어야 함
```

---

## 5. 자동 승인 L3/L4

### 목표
`autonomyLevel` 3과 4에서 각각 승인/거부 동작이 정확한지 검증. L4에서도 Critical Deny List 명령은 차단되는지 확인.

### 사전조건
- 데몬 실행 중
- `config.json`에서 `autoApprove.autonomyLevel` 설정 가능

### 실행단계
```bash
# === L3 테스트 ===
# config에 autonomyLevel: 3 설정
c4 config reload

# 1. 워커 생성 + 안전한 작업
c4 task l3-safe --auto-mode "src/temp.js 파일 생성 후 console.log('hello') 작성"
c4 wait l3-safe
c4 read l3-safe
# → 자동 승인으로 완료되어야 함

# 2. 워커 생성 + 위험 명령 포함 작업
c4 task l3-danger --auto-mode "rm -rf /tmp/test-dir 실행"
c4 wait l3-danger --timeout 60000
c4 read l3-danger
# → rm -rf 자동 거부, 워커가 대안 찾거나 중단

# === L4 테스트 ===
# config에 autonomyLevel: 4 설정
c4 config reload

# 3. Critical Deny List 명령 테스트
c4 task l4-critical --auto-mode "git push --force origin main 실행"
c4 wait l4-critical --timeout 60000
c4 read l4-critical
# → L4에서도 절대 차단 (5.13 Critical Deny List)

# 4. 정리
c4 close l3-safe
c4 close l3-danger
c4 close l4-critical
```

### 예상결과
- **L3**: 파일 읽기/수정/생성, ls, grep, git, npm test → 자동 승인
- **L3**: rm, sudo, git push --force → 자동 거부
- **L4**: L3과 동일하되 deny 룰도 approve로 오버라이드
- **L4 예외**: Critical Deny List (`rm -rf /`, `git push --force`, `DROP TABLE`) → L4에서도 절대 차단
- 오버라이드 시 `[AUTONOMY L4]` 스냅샷 기록

### 검증방법
```bash
# 이벤트 로그에서 승인/거부 기록 확인
cat logs/events-l3-safe.jsonl | grep "autoApprove"
cat logs/events-l4-critical.jsonl | grep "AUTONOMY"

# Critical Deny List 차단 로그
cat logs/events-l4-critical.jsonl | grep "critical_deny"

# Slack 알림 확인 (하이브리드 안전 모드 5.21)
# → 위험 명령 시도 시 Slack에 경고 메시지 전송됨
```

---

## 6. 관리자 교체

### 목표
관리자 세션의 컨텍스트 한계(compact) 도달 시 자동 교체가 발생하고, 새 관리자가 이전 컨텍스트를 복구하는지 검증.

### 사전조건
- `c4 auto` 또는 수동으로 관리자 워커 실행 중
- `c4 scribe start`로 scribe 활성화
- `docs/session-context.md` 존재 (scribe가 생성)
- `config.json`에 `managerRotation` 설정

### 실행단계
```bash
# 1. 관리자 생성 + 대량 작업으로 컨텍스트 소진 유도
c4 new mgr-test
c4 task mgr-test "TODO.md를 읽고 남은 작업 5개를 각각 워커로 생성해서 처리"

# 2. 관리자 상태 모니터링
c4 scrollback mgr-test --lines 50
# → PostCompact hook 발동 여부 확인

# 3. compact 발생 시 session-context.md 업데이트 확인
cat docs/session-context.md

# 4. 관리자 교체 발생 확인
c4 list  # 새 관리자 워커 존재 여부

# 5. 새 관리자가 컨텍스트 복구했는지 확인
c4 read-now <new-manager-name>
# → session-context.md 내용 참조하고 있어야 함
```

### 예상결과
- compact 발생 시 PostCompact hook이 `session-context.md` 내용을 모델에 주입
- compact 횟수 추적 → 임계값 초과 시 관리자 자동 교체 (4.7)
- 새 관리자가 `session-context.md`를 읽고 이전 작업 상황 파악
- 진행 중이던 워커들은 영향 없이 계속 실행
- 의사결정 요약이 `session-context.md` 상단에 주입됨 (5.12)

### 검증방법
```bash
# session-context.md에 핵심 결정사항 기록 확인
cat docs/session-context.md | head -20

# 새 관리자가 기존 워커를 인식하는지
c4 read-now <new-manager>
# → "기존 워커 N개 확인" 또는 "이어서 진행" 류 출력

# compact 횟수 추적
c4 scrollback <manager> --lines 100 | grep -i "compact"
```

---

## 7. c4 auto 원커맨드

### 목표
`c4 auto "작업"` 한 줄로 관리자+scribe+워커가 자동 생성되고, 작업 완료까지 무인으로 동작하는지 검증.

### 사전조건
- 데몬 실행 중
- `config.json` 설정 완료 (autonomyLevel, maxWorkers 등)
- Slack webhook 설정 (알림 수신용, 선택사항)

### 실행단계
```bash
# 1. auto 실행
c4 auto "src/calculator.js에 add, subtract, multiply, divide 함수 구현. 각 함수에 대한 유닛 테스트 작성. README에 사용법 추가."

# 2. 진행 상황 모니터링 (별도 터미널)
c4 list                    # 워커 목록
c4 scrollback auto-mgr     # 관리자 출력 확인

# 3. 완료 대기
c4 wait auto-mgr --timeout 600000

# 4. 결과 확인
c4 read auto-mgr
cat docs/morning-report.md  # 아침 보고서 자동 생성 확인
```

### 예상결과
- `auto-mgr` (관리자) 자동 생성
- scribe 자동 시작
- 관리자가 작업을 분석하여 1~N개 워커 자동 생성
- 워커별 worktree 격리
- 각 워커 완료 시 관리자가 자동 머지
- 전체 완료 시 `docs/morning-report.md` 생성
- Slack에 완료 알림 전송 (설정된 경우)

### 검증방법
```bash
# 자동 생성된 워커 확인
c4 history  # 모든 워커 작업 기록

# 결과물 확인
cat src/calculator.js
npm test  # 테스트 통과

# morning report 확인
cat docs/morning-report.md

# scribe 동작 확인
c4 scribe status
cat docs/session-context.md
```

---

## 8. Batch 처리

### 목표
`c4 batch`로 여러 작업을 한번에 제출하고, 자동 네이밍 및 병렬 실행이 정상 동작하는지 검증.

### 사전조건
- 데몬 실행 중
- `maxWorkers >= 3` 설정

### 실행단계
```bash
# === 방법 1: --count로 동일 패턴 작업 ===
c4 batch "src/page-{N}.js에 기본 React 컴포넌트 생성" --count 3

# === 방법 2: --file로 작업 목록 파일 ===
# tasks.txt 작성:
#   src/header.js에 Header 컴포넌트 구현
#   src/footer.js에 Footer 컴포넌트 구현
#   src/sidebar.js에 Sidebar 컴포넌트 구현
c4 batch --file tasks.txt

# 대기
c4 wait --all

# 결과 확인
c4 list
```

### 예상결과
- `batch-1`, `batch-2`, `batch-3` 자동 네이밍
- `maxWorkers` 제한 내에서 병렬 실행, 초과분은 큐 대기
- 각 워커가 독립 worktree에서 작업
- 전체 완료 후 `c4 list`에 모두 `idle` 상태

### 검증방법
```bash
# 워커 자동 네이밍 확인
c4 list  # batch-1, batch-2, batch-3 존재

# 큐잉 동작 (maxWorkers=2로 설정 시)
c4 list  # 2개 alive + 1개 queued 확인

# 각 워커 결과
c4 read batch-1
c4 read batch-2
c4 read batch-3

# 히스토리
c4 history --last 5
```

---

## 9. Scribe 컨텍스트 영속화

### 목표
Scribe가 세션 JSONL을 주기적으로 스캔하여 `session-context.md`를 업데이트하고, PostCompact hook으로 컨텍스트가 복구되는지 검증.

### 사전조건
- 데몬 실행 중
- scribe 활성화 가능 상태
- `.claude/settings.json`에 PostCompact hook 설정

### 실행단계
```bash
# 1. scribe 시작
c4 scribe start
c4 scribe status  # running 확인

# 2. 워커 생성 + 작업 (세션 데이터 생성)
c4 task scribe-test --auto-mode "src/example.js 파일 생성. 'Hello World' 출력하는 함수 작성"
c4 wait scribe-test

# 3. scribe 스캔 강제 실행
c4 scribe scan

# 4. session-context.md 확인
cat docs/session-context.md
# → scribe-test 워커의 작업 내용이 기록되어야 함

# 5. scribe 중지
c4 scribe stop
c4 scribe status  # stopped 확인

# 6. 정리
c4 close scribe-test
```

### 예상결과
- `c4 scribe start` 후 주기적(5분) JSONL 스캔 시작
- `c4 scribe scan`으로 즉시 스캔 가능
- `docs/session-context.md`에 워커 작업 요약 기록:
  - 설계 결정, 작업 상태, 에러/해결, TODO 변경
- PostCompact hook 발동 시 `session-context.md` 내용이 모델 컨텍스트에 주입
- scribe stop 후 스캔 중단

### 검증방법
```bash
# session-context.md 내용 확인
cat docs/session-context.md
# → 작업 내용, 파일 변경, 결정사항 등 포함

# JSONL 오프셋 추적 확인 (이미 읽은 건 재스캔 안 함)
c4 scribe scan  # 새 내용 없으면 업데이트 없음

# PostCompact hook 설정 확인
cat .claude/settings.json | grep -A5 "PostCompact"
```

---

## 10. 에러 복구

### 목표
데몬 죽음, 워커 crash, STALL 감지, dirty worktree 등 장애 상황에서 C4가 정상 복구되는지 검증.

### 사전조건
- 데몬 + 워커 실행 중
- Slack webhook 설정 (STALL 알림 수신용)
- `healthCheck` 설정 활성화

### 실행단계
```bash
# === 10-A: 데몬 죽음 복구 ===
# 1. 워커가 작업 중인 상태에서 데몬 강제 종료
c4 task recovery-test --auto-mode "큰 파일 생성 작업 (시간 소요되는 작업)"
c4 daemon stop

# 2. 데몬 재시작
c4 daemon start

# 3. lost worker 확인
c4 list  # recovery-test가 LOST 상태로 표시
c4 health

# === 10-B: STALL 감지 ===
# 1. 워커가 권한 프롬프트에서 멈춤 (intervention 상태)
c4 new stall-test
c4 task stall-test "sudo apt install something"  # 권한 필요한 명령

# 2. 5분+ 대기 → STALL 감지
c4 wait stall-test --timeout 60000 --interrupt-on-intervention
# → intervention 감지 시 즉시 반환

# 3. Slack에 STALL 알림 전송 확인
# 4. 상황 확인 후 조치
c4 read-now stall-test
c4 send stall-test "sudo 대신 다른 방법 사용해"

# === 10-C: Dirty Worktree 정리 ===
# 1. 워커가 커밋 안 한 상태에서 crash
c4 close stall-test  # dirty worktree 경고 예상

# 2. 잔여 worktree 확인
git worktree list
c4 cleanup --dry-run  # 정리 대상 확인
c4 cleanup            # 실행 (clean만 삭제, dirty 보존)

# === 10-D: 좀비 데몬 정리 ===
# 1. 데몬 프로세스가 응답 없는 상태 시뮬레이션
c4 daemon stop   # SIGKILL까지 시도
c4 daemon status # 종료 확인
c4 daemon start  # 새 데몬 시작
c4 health        # 정상 동작 확인
```

### 예상결과
- **10-A**: 데몬 재시작 후 lost worker 목록 표시. worktree는 보존.
- **10-B**: intervention/STALL 감지 → Slack 즉시 알림 (5.29). `c4 wait --interrupt-on-intervention`이 즉시 반환.
- **10-C**: dirty worktree는 삭제하지 않고 보존+알림. clean worktree만 자동 삭제. `c4 cleanup`으로 수동 정리 가능.
- **10-D**: 좀비 데몬 감지 → SIGKILL → 종료 확인 → 새 데몬 시작.

### 검증방법
```bash
# 데몬 재시작 후 상태
c4 health  # 정상 응답

# lost worker worktree 보존 확인
git worktree list  # dirty worktree 남아있음

# Slack STALL 알림 확인
# → "[STALL] stall-test: 5분+ 무출력" 메시지 수신

# cleanup 결과
c4 cleanup --dry-run  # 정리 대상 목록
git worktree list     # 정리 후 깨끗한 상태

# 좀비 데몬 없는지 확인
c4 daemon status  # running 또는 stopped (좀비 아님)
```

---

## 실행 순서 권장

1. **시나리오 1** (기본 흐름) → 모든 테스트의 기초
2. **시나리오 9** (Scribe) → 이후 테스트에서 컨텍스트 기록 활용
3. **시나리오 5** (L3/L4) → 승인 정책 확인 후 자율 모드 테스트
4. **시나리오 2** (멀티 워커) → 병렬 실행 기본 검증
5. **시나리오 4** (충돌) → 병렬 실행 엣지 케이스
6. **시나리오 3** (SSH) → 원격 실행 검증
7. **시나리오 8** (Batch) → 대량 작업 처리
8. **시나리오 7** (c4 auto) → 완전 자율 모드
9. **시나리오 6** (관리자 교체) → 장시간 운영 안정성
10. **시나리오 10** (에러 복구) → 장애 대응 최종 검증

## 참고 문서

- [config-reference.md](config-reference.md) — 설정 항목 상세
- [troubleshooting.md](troubleshooting.md) — 일반 운영 문제 해결
- [known-issues.md](known-issues.md) — 실사용 실패 사례 기록
- [real-test-results.md](real-test-results.md) — 유닛/통합 테스트 결과
