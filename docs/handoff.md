# C4 인수인계 문서 (2026-04-17)

## 현재 버전
- v1.6.15, 52/52 테스트 통과
- GitHub: siloFoX/c4, main 브랜치 최신

## Phase 상태
- **Phase 1-7**: 139 done, 2 partial (7.5 approve, 7.7 intervention — 실환경 트리거 어려움)
- **Phase 8**: Web UI + 운영 고도화 (진행 중)
  - 8.1 Web UI React SPA — 스캐폴딩 완료, WorkerList/TaskForm/WorkerDetail/WorkerActions 구현됨
  - 8.5 daemon API 보강 — POST /key, POST /merge 추가됨
  - 8.6-8.10 채팅/이력/제어/디자인/세션관리 — todo
- **Phase 9**: Framework + 생태계 (계획)
  - 9.1-9.8: Agent Framework, Local LLM, SDK, MCP, Plugin, Fleet, Dispatcher, 파일전송
- **Phase 10**: 엔터프라이즈 (계획)
  - 10.1-10.8: RBAC, 감사로그, 프로젝트대시보드, CI/CD, 비용, 부서, 일정, PM
- **Phase 11**: 범용 자동화 플랫폼 (계획)
  - 11.1-11.4: MCP허브, Computer Use, 워크플로우, 자연어인터페이스

## 긴급 수정 필요 (7.21-7.29, 자동 시스템 halt 관련 다수)
- **7.21**: c4 wait --all 이 intervention worker 때문에 무한 대기
- **7.22**: pendingTask Enter 재발 — v1.6.15에서도 긴 task에서 2/2 수동 Enter 필요
- **7.23**: PostToolUse hook 에러 — hook-relay.js로 교체 완료 (이전 세션). 검증 필요
- **7.24** (done): manager launch 명령에 `--model opus --effort max --name c4-manager` 플래그 추가 (CLAUDE.md, README, handoff, src/cli.js 5곳)
- **7.25** (halt): c4 merge가 git identity 부재로 실패 → 매니저가 env 변수 workaround → permission prompt halt. c4 init에서 git identity 체크/설정 필요
- **7.26** (halt): 매니저가 복합/파이프/루프 명령 생성 → prefix 권한 매처 불매치 → halt. .claude/agents/manager.md 규칙 강화 + PostToolUse hook 검출
- **7.27**: src/cli.js 실행 bit 반복 상실 (머지/stash-pop 후 100755→100644) → `/usr/bin/c4 Permission denied`. 원인 추적 + permanent fix
- **7.28**: c4 merge가 uncommitted 로컬 변경 있을 때 guard 없음 → stash/pop dance + conflict 수동 resolve 반복. pre-check 또는 auto-stash 지원
- **7.29**: package-lock.json 자발적 수정 원인 추적 (세션 시작부터 M 상태, 머지마다 방해)

## 머신 상태
| 머신 | IP | c4 버전 | daemon | 비고 |
|------|-----|---------|--------|------|
| Windows (Dev-PC) | 192.168.10.15 | 1.6.15 | PID 5276 | Web UI dev server 가능 |
| DGX | 192.168.10.222 | 1.6.15 | PID 323203 | c4 PATH 미등록 (node src/cli.js 사용) |
| 40 서버 | 192.168.10.40 | 1.6.15 | PID 2529438 | npm link 성공, c4 PATH 등록됨 |

## DGX ARPS 진행 상황
- Patch 9 완료 (#43-#45 머지됨)
- #48 datalake cleanup 완료 (10.40 배포됨, 90서버 미배포)
- #49 audio hover overlay — UI 검증 완료, 머지/push 대기중
  - worktree: /home/shinc/c4-worktree-w-audio-hover
  - 브랜치: c4/w-audio-hover
- RIVA Fix A+C — todo (qwen_api_server.py 수정 예정)
  - todos/riva-case-investigation.md, todos/riva-rag-quality.md 참조

## Web UI 상태
- web/ 디렉토리에 React+TS+Vite+Tailwind 세팅 완료
- 구현된 컴포넌트: WorkerList, TaskForm, WorkerDetail, WorkerActions, Toast
- 로고: web/public/logo.svg (C4 폭발물 SVG)
- API 프록시: Vite dev server -> localhost:3456 daemon (dev, HMR)
- Prod: daemon serves built web/dist on port 3456 as well (8.12). Run
  `npm run build:web` once (or let `c4 init` do it), then browse
  `http://<host>:3456/` — `/api/*` routes are aliased to the existing
  daemon handlers so dev and prod use the same frontend code.
- 미구현: 채팅(8.6), 이력(8.7), 제어패널(8.8), 디자인(8.9), 세션관리(8.10)

## 관리자 세션 사용법
```bash
claude --agent /root/c4/.claude/agents/manager.md --model opus --effort max --name c4-manager
```
관리자가 worker 생성 → task 전송 → wait → read → merge 흐름.

## 이 세션에서 한 것 (요약)
1. Phase 7 잔여 항목 전부 완료 (7.16-7.20 구현, 7.2/7.8/7.11 검증)
2. 7.17 pendingTask 5-point 방어 구현 + 검증 (3/3 자동 전달 성공)
3. 7.19 /effort + /model 슬래시 명령 대응
4. 7.23 hook-relay.js로 PowerShell/curl 교체
5. Web UI 스캐폴딩 + WorkerList + TaskForm + WorkerDetail + WorkerActions
6. daemon API 보강 (POST /key, POST /merge)
7. DGX 업데이트 + 40 서버 c4 설치
8. Phase 8-11 로드맵 수립
9. 로고 SVG 제작

## 다음 우선순위

### 최우선: 자동 시스템 halt 해소 (7.25-7.28)
야간 자동 실행의 모든 진행을 차단하는 근본 문제들. 하나라도 남아있으면 아침에 "0 progress" 상태로 발견됨.
1. **7.25** c4 init에서 git identity 체크/설정 — 가장 root cause, 여기 해결되면 7.26 workaround 유인 감소
2. **7.26** manager 에이전트 복합 명령 금지 규칙 강화 + hook 검출
3. **7.27** src/cli.js 실행 bit 상실 permanent fix
4. **7.28** c4 merge uncommitted 로컬 변경 guard

### 기존 긴급
5. 7.22/7.23 검증 — hook-relay.js 적용 후 hook 에러/pendingTask Enter 재발 확인
6. 7.21 c4 wait --all intervention worker 무한 대기 해소
7. 7.29 package-lock.json 자발적 수정 원인 추적

### 기능 작업
8. ARPS RIVA Fix A+C 구현 (DGX)
9. #49 머지 (DGX ARPS)
10. Web UI 기능 추가 (8.6 채팅, 8.7 이력)
11. Web UI 디자인 리디자인 (8.9)
