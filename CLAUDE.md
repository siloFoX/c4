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

### C4 사용 시 주의사항
- 복합 명령(`&&`, `|`, `;`으로 연결) 사용 금지 → 단일 명령으로 분리해서 실행 (승인 필요 없게)
- `cd X && git Y` 대신 `git -C <path>` 사용
- `tasklist | grep | xargs taskkill` 대신 `c4 daemon stop` 사용
- `sleep N && c4 read-now` 대신 `c4 wait <name>` 사용 (idle 감지 시 즉시 반환, 불필요한 대기 없음)
- `/model` 등 슬래시 명령 보낼 때: `MSYS_NO_PATHCONV=1 c4 send` 사용 (Git Bash 경로 변환 방지)
- 멀티 에이전트 작업 시 반드시 worktree 사용 (같은 디렉토리 공유하면 git 충돌)
- 머지 전 반드시: 기능 확인 → 테스트 → 문서(TODO, CHANGELOG, patches/) → 코드 리뷰
- 작업자 기본 루틴: 구현 → 테스트 → 문서 업데이트 → 커밋
