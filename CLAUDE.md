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
c4 swarm <name>                      워커 swarm 상태 조회
c4 morning                           모닝 리포트 생성
c4 plan <name> <task> [opts]         설계 작업 전송 (--branch, --output)
c4 plan-read <name>                  설계 결과 읽기
c4 rollback <name>                   워커 브랜치 롤백
c4 cleanup [--dry-run]               고아 worktree/브랜치 일괄 정리
c4 approve <name>                    critical 명령 수동 승인
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

### 관리자 워커 운영 패턴
관리자(auto-mgr)는 c4 명령어로 하위 워커를 생성/관리/감시한다:
1. `c4 new worker1` 으로 워커 생성
2. `c4 task worker1 --auto-mode "작업 내용"` 으로 작업 전송
3. `c4 wait worker1` 으로 완료 대기
4. `c4 read worker1` 으로 결과 확인
5. 문제 있으면 `c4 send worker1 "수정 지시"` 또는 `c4 close worker1` 후 재생성
6. 완료 후 `c4 merge worker1` 으로 main에 머지
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
