# C4 Manager Skill

이 스킬은 C4 (Claude {Claude Code} Code) 시스템을 사용하여 여러 Claude Code 작업자를 관리하는 방법을 알려줍니다.

## 개요

C4는 하나의 Claude Code(관리자)가 여러 Claude Code(작업자)를 PTY 가상 터미널로 제어하는 agent-on-agent 오케스트레이터입니다.

## 아키텍처

```
사용자 ↔ 관리자 (Claude Code)
              ↕ c4 CLI (HTTP localhost:3456)
         C4 Daemon (Node.js)
              ↕ node-pty
         ┌────┼────┐
      Worker Worker Worker
      (local) (SSH)  (SSH)
```

## 사용 가능한 명령어

```bash
c4 new <name> [command] [--target dgx|local]  # 작업자 생성
c4 send <name> <text>                          # 텍스트 전송
c4 key <name> <key>                            # 특수키 (Enter, C-c 등)
c4 read <name>                                 # 새 출력 읽기 (idle 스냅샷)
c4 read-now <name>                             # 현재 화면 즉시 읽기
c4 wait <name> [timeout]                       # idle까지 대기 후 읽기
c4 list                                        # 작업자 목록
c4 close <name>                                # 작업자 종료
c4 health                                      # 데몬 상태 확인
c4 config                                      # 설정 보기
c4 config reload                               # 설정 핫리로드
```

## 관리자 역할 가이드

### 1. 작업 배정
- 작업 범위를 명확하게 지시
- 한 작업자에게 하나의 명확한 작업
- 복잡한 작업은 여러 작업자에게 분할

### 2. 권한 승인
- `c4 wait`으로 화면을 읽으면 권한 요청이 보임
- 안전한 명령 (ls, grep, find, cat): 승인 → `c4 key <name> Enter`
- 위험한 명령 (rm, sudo): 거부 → `c4 key <name> Down` + `c4 key <name> Enter`
- 판단 어려우면 사용자에게 보고

### 3. 진행 모니터링
- `c4 list`로 상태 확인 (busy/idle/exited)
- `c4 read-now <name>`으로 진행 중 화면 확인
- `c4 wait <name>`으로 완료까지 대기

### 4. 결과 보고
- 작업자 출력을 읽고 사용자에게 요약 보고
- 에러 발생 시 원인 분석 후 재지시 또는 보고

## 특수키 목록

Enter, C-c, C-b, C-d, C-z, C-l, C-a, C-e, Escape, Tab, Backspace, Up, Down, Left, Right

## Git Bash 주의사항

`/`로 시작하는 텍스트(예: `/model`)를 보낼 때는 경로 변환을 방지해야 합니다:
```bash
MSYS_NO_PATHCONV=1 c4 send <name> "/model"
```

## 설정 (config.json)

- `autoApprove.enabled: true` — 안전한 명령 자동 승인
- `targets` — SSH 원격 서버 설정
- `workerDefaults.effortLevel` — 기본 effort level
- `daemon.idleThresholdMs` — idle 감지 기준 (ms)
