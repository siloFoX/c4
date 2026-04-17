# Local Development Environment

## Network
- Local IP: 192.168.10.15
- DGX Server: 192.168.10.222 (SSH: shinc@192.168.10.222, key auth 설정됨)
- ARPS Project: /home/shinc/arps/ (on DGX)

## Chrome Debug Mode

Chrome을 DevTools Protocol로 제어하려면 디버그 모드로 실행해야 한다.

### 주의사항
- 기존 Chrome 프로세스가 하나라도 살아있으면 디버그 포트가 안 열림
- `--user-data-dir`을 별도로 지정해야 기존 프로필과 충돌 안 남
- 디버그 프로필 경로: `C:\Users\silof\chrome-debug-profile`

### 실행 순서 (PowerShell)
```powershell
# 1. Chrome 전부 종료
Get-Process chrome -ErrorAction SilentlyContinue | Stop-Process -Force
Start-Sleep -Seconds 3

# 2. 디버그 모드로 실행 (별도 프로필)
Start-Process 'C:\Program Files\Google\Chrome\Application\chrome.exe' -ArgumentList '--remote-debugging-port=9222','--user-data-dir=C:\Users\silof\chrome-debug-profile'

# 3. 확인
Start-Sleep -Seconds 5
Test-NetConnection -ComputerName localhost -Port 9222
```

### SSH Reverse Tunnel (DGX 서버에서 Chrome 접근)
```bash
ssh -R 9222:localhost:9222 shinc@192.168.10.222
```
이 터널이 열린 상태에서 DGX 서버의 `localhost:9222`로 Chrome DevTools에 접근 가능.

## MCP Servers
- chrome-devtools: `npx @anthropic-ai/chrome-devtools-mcp@latest` (port 9222)
- Google Calendar, Gmail: claude.ai 연동

## Skills
- `/chrome-debug`: Chrome 디버그 모드 실행 + SSH 리버스 터널 설정

## C4 (Claude {Claude Code} Code)
- 프로젝트 경로: `C:\Users\silof\c4`
- GitHub: `siloFoX/c4`
- 데몬 시작: `c4 daemon start` (데몬 중지: `c4 daemon stop`, 상태: `c4 daemon status`)
- CLI: `c4` (npm link 등록됨)

### C4 CLI 명령어 (관리자/워커 모두 사용)
```
c4 daemon start|stop|restart|status  데몬 관리
c4 new <name> [--target local|dgx]   새 워커 생성
c4 task <name> "작업" [--auto-mode] [--branch c4/<name>]  작업 전송
c4 send <name> "텍스트"              워커에 텍스트 전송
c4 key <name> Enter|C-c|Escape       워커에 키 전송
c4 read <name>                       워커 출력 읽기 (idle 상태만)
c4 read-now <name>                   워커 출력 즉시 읽기
c4 wait <name> [--timeout ms]        워커 idle 대기
c4 wait w1 w2 w3 [--timeout ms]     여러 워커 동시 대기 (첫 완료 시 반환)
c4 wait --all [--interrupt-on-intervention]  전체 워커 대기 + intervention 감지
c4 scrollback <name> [--lines N]     워커 스크롤백 읽기
c4 list                              모든 워커 상태 조회
c4 close <name>                      워커 종료
c4 health                            데몬 헬스체크
c4 config [reload]                   설정 조회/리로드
c4 merge <name|branch>               워커 브랜치 main에 머지
c4 auto "작업"                       자율 모드 (관리자 + scribe 자동 생성)
c4 status <name> "message"           Slack에 상태 메시지 전송
c4 scribe start|stop|status|scan     세션 컨텍스트 기록
c4 history [name] [--last N]         작업 히스토리 조회
c4 token-usage                       토큰 사용량 조회
c4 templates                         템플릿 목록 조회
c4 profiles                          권한 프로파일 목록 조회
c4 swarm <name>                      워커 swarm 상태 조회
c4 morning                           모닝 리포트 생성
c4 plan <name> <task> [opts]         설계 작업 전송 (--branch, --output)
c4 plan-read <name>                  설계 결과 읽기
c4 rollback <name>                   워커 브랜치 롤백
c4 cleanup [--dry-run]               고아 worktree/브랜치 일괄 정리
c4 approve <name> [option_number]     critical 명령 수동 승인 (번호로 TUI 옵션 선택)
c4 batch "작업" [--count N] [--file tasks.txt]  배치 작업 실행
```

### 관리자 vs 작업자 역할 구분
| | 관리자 (Manager) | 작업자 (Worker) |
|---|---|---|
| 코드 직접 수정 | X (금지) | O |
| c4 명령어 사용 | O (워커 생성/관리) | X (원칙적으로 불필요) |
| 사용 도구 | Bash(c4:*), Agent | Read, Write, Edit, Grep, Glob, Bash |
| 에이전트 정의 | `.claude/agents/manager.md` | 기본 Claude Code |
| 모델 | claude-opus-4-6 | config 설정에 따름 |

### 관리자 세션 시작 (권장)
```
claude --agent C:/Users/silof/c4/.claude/agents/manager.md --model opus --effort max
```
agent 모드로 시작하면 compound 금지(git -C 사용), Read/Edit deny 등 관리자 규칙이 강제된다.

### 관리자 워커 운영 패턴
관리자(auto-mgr)는 c4 명령어로 하위 워커를 생성/관리/감시한다:
1. `c4 new worker1` 으로 워커 생성
2. `c4 task worker1 --auto-mode "작업 내용"` 으로 작업 전송
3. `c4 wait worker1` 으로 완료 대기
4. `c4 read worker1` 으로 결과 확인
5. 문제 있으면 `c4 send worker1 "수정 지시"` 또는 `c4 close worker1` 후 재생성
6. 완료 후 `c4 merge worker1` 으로 main에 머지

### 관리자 승인 프로토콜 (맹목적 승인 금지)
관리자가 워커의 권한 요청/질문을 처리할 때 반드시 아래 순서를 따른다:
1. **내용 확인**: `c4 read-now <name>` 또는 `c4 scrollback <name>` 으로 워커가 무엇을 요청하는지 확인
2. **판단**: 요청이 작업 스코프 내인지, 위험하지 않은지, 적절한지 판단
3. **행동**: 적절하면 `c4 key <name> Enter`로 승인, 부적절하면 `c4 send <name> "수정 지시"` 전송

**금지 행위:**
- 내용 확인 없이 `c4 key <name> Enter` 전송 (맹목적 승인)
- cron이나 반복문으로 자동 Enter 전송
- STALL 알림에 무조건 Enter로 대응 (먼저 read-now로 상황 파악)

**판단 기준:**
- 파일 읽기/수정이 작업 범위 내인가
- Bash 명령이 안전한가 (rm, git push --force 등 위험 명령 거부)
- 워커가 원래 작업에서 벗어나지 않았는가
- 워커의 질문이 합리적인가 (설계 모호성 vs 불필요한 확인)

**실패 사례 참조:** 5.28에서 cron 자동 Enter로 위험 명령 무분별 승인 발생. docs/known-issues.md 참조.
### C4 사용 시 주의사항
- 복합 명령(`&&`, `|`, `;`으로 연결) 사용 금지 - 단일 명령으로 분리해서 실행
- `cd X && git Y` 대신 `git -C <path>` 사용
- `tasklist | grep | xargs taskkill` 대신 `c4 daemon stop` 사용
- `sleep N && c4 read-now` 대신 `c4 wait <name>` 사용 (idle 감지 시 즉시 반환)
- `/model` 등 슬래시 명령 보낼 때: `MSYS_NO_PATHCONV=1 c4 send` 사용 (Git Bash 경로 변환 방지)
- 멀티 에이전트 작업 시 반드시 worktree 사용 (같은 디렉토리 공유하면 git 충돌)
- 작업자가 main에 직접 커밋하면 절대 안 됨 - 반드시 worktree/브랜치에서 작업 후 관리자가 머지
- 머지 전 반드시: 기능 확인 - 테스트 - 문서(TODO, CHANGELOG, patches/) - 코드 리뷰
- 작업자 기본 루틴: 구현 - 테스트 - 문서 업데이트 - 커밋
- 불필요한 확인 질문 하지 않기 - 자율적으로 판단해서 진행
- scribe 항상 켜두기 - `c4 scribe start`로 주기적 컨텍스트 기록
- `c4 list` 반복 금지 - `c4 wait <name>` 사용. `c4 list`는 현재 상태 확인용 (10초 cooldown 있음)

### c4 batch 사용 예시
동일 작업을 여러 워커에 병렬 배포하거나, 파일에서 작업 목록을 읽어 일괄 실행한다.
워커 이름은 자동으로 `batch-1`, `batch-2`, ... 순으로 생성된다.
```bash
# 동일 작업 5개 워커에 배포
c4 batch "src/의 lint 에러 수정" --count 5

# 파일에서 작업 목록 읽기 (한 줄에 하나, # 주석 무시)
c4 batch --file tasks.txt --auto-mode

# 브랜치 접두사 지정 (feature-1, feature-2, feature-3 브랜치 생성)
c4 batch "테스트 추가" --count 3 --branch feature

# 프로파일 적용
c4 batch "API 엔드포인트 구현" --count 2 --profile web
```

tasks.txt 예시:
```
# 각 줄이 하나의 작업
src/auth.js에 JWT 검증 추가
src/api.js에 rate limiter 적용
tests/auth.test.js 작성
```

### c4 watch 사용 예시
워커 출력을 `tail -f`처럼 실시간 스트리밍한다. SSE 기반. Ctrl+C로 종료.
```bash
# 워커 출력 실시간 관찰
c4 watch myworker

# 일반적인 운영 흐름: task 전송 후 바로 watch
c4 task worker1 --auto-mode "npm test 실패 원인 분석"
c4 watch worker1
```
`c4 watch`는 관찰만 하며 워커 동작에 영향을 주지 않는다. 개입이 필요하면 별도 터미널에서 `c4 send`나 `c4 key`를 사용한다.

### --cwd / --repo / --no-branch 차이
| 옵션 | 용도 | worktree 생성 | 브랜치 생성 | repo root 감지 |
|------|------|:---:|:---:|------|
| (기본) | c4 프로젝트 자체에서 작업 | O | O | config.json |
| `--repo <path>` | 다른 프로젝트 repo root 직접 지정 | O | O | 지정한 경로 그대로 사용 |
| `--cwd <path>` | repo 내부 하위 디렉토리 지정 | O | O | git rev-parse로 자동 탐지 |
| `--no-branch` | 브랜치/worktree 없이 현재 상태에서 작업 | X | X | 현재 디렉토리 |

```bash
# 다른 프로젝트에서 작업 (repo root 직접 지정)
c4 task worker1 "README 수정" --repo /home/shinc/arps

# repo 내부 하위 디렉토리 기준으로 repo root 자동 탐지
c4 task worker1 "src 분석" --cwd /home/shinc/arps/src

# 브랜치/worktree 없이 읽기 전용 탐색
c4 task worker1 "코드 구조 파악해" --no-branch

# --cwd + --no-branch 조합: 특정 디렉토리에서 격리 없이 작업
c4 task worker1 "로그 확인" --cwd /home/shinc/arps --no-branch
```

### git -C 사용 예시 (cd 대신)
관리자 세션에서 워커의 worktree/repo를 조작할 때 반드시 `git -C`를 사용한다. `cd`로 디렉토리 이동 후 git 실행 금지.
```bash
# 워커 worktree 상태 확인
git -C /c/Users/silof/c4-worktree-worker1 status

# 워커 브랜치 로그 확인
git -C /c/Users/silof/c4-worktree-worker1 log --oneline -5

# 워커 브랜치의 변경 diff
git -C /c/Users/silof/c4-worktree-worker1 diff main..HEAD --stat

# 다른 프로젝트 repo 상태 확인
git -C /home/shinc/arps status --porcelain

# 브랜치 삭제
git -C /c/Users/silof/c4 branch -D c4/old-branch
```

**금지 패턴 vs 올바른 패턴:**
```bash
# X 금지: cd 후 git
cd /c/Users/silof/c4-worktree-worker1 && git status

# O 올바름: git -C 사용
git -C /c/Users/silof/c4-worktree-worker1 status
```

### 트러블슈팅 빠른 참조
| 증상 | 확인 | 해결 |
|------|------|------|
| 데몬 응답 없음 | `c4 health` | `c4 daemon restart` |
| 좀비 데몬 (프로세스 살아있지만 무응답) | `c4 daemon status` | `c4 daemon stop` 후 `c4 daemon start` |
| 워커 STALL (멈춤) | `c4 read-now <name>` | 상황 파악 후 `c4 key <name> Enter` 또는 `c4 send <name> "지시"` |
| LOST 워커 (데몬 재시작 후) | `c4 list` | 새 워커 생성 후 같은 브랜치에서 이어가기 |
| 고아 worktree 잔여 | `git worktree list` | `c4 cleanup` 또는 `git worktree remove <path> --force` |
| Git Bash 경로 변환 | `/model`이 `/c/model`로 변환됨 | `MSYS_NO_PATHCONV=1 c4 send <name> "/model"` |
| 긴 작업 메시지 잘림 | 1000자+ 메시지 | 자동으로 `.c4-task.md` 파일 전달됨 (수동 조치 불필요) |
| 복합 명령 경고 | `&&`, `\|`, `;` 사용 시 | 단일 명령으로 분리, `git -C` 사용 |

상세 트러블슈팅: `docs/troubleshooting.md` 참조. 실패 사례: `docs/known-issues.md` 참조.
