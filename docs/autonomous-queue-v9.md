# 자동 실행 큐 v9 (v8 완료 후, UX 개선)

Web UI 대화/세션 UX 개선 배치. JSONL 파싱 기반 구조화 뷰 + 외부 세션 import. 순서 중요 — 8.17 먼저 (공통 기반), 8.18 후속.

## 태스크 큐

### [1] TODO 8.17 — 외부 Claude Code 세션을 c4 web UI에서 import / 이어가기
- 워커: external-session
- 브랜치: c4/external-session
- 스펙: TODO.md 8.17 섹션 읽고 구현
- 핵심: `src/session-parser.js` (JSONL 파서), `c4 attach` CLI, Web UI Sessions 섹션, `--resume` 기반 이어가기, SSE 양방향 동기화, RBAC 연계
- 8.18과 공통 기반이므로 여기서 파서 모듈 확정 후 8.18로 이어감

### [2] TODO 8.18 — Web UI claude.ai 스타일 대화 뷰
- 워커: claude-ai-view
- 브랜치: c4/claude-ai-view
- 스펙: TODO.md 8.18 섹션 읽고 구현
- 핵심: ConversationView 컴포넌트 (user/assistant/tool/thinking 분리), react-markdown + syntax highlight (Prism or Shiki), 검색/점프, 복사/export, Terminal 탭은 xterm.js로 분리, 모바일 반응형
- 8.17의 session-parser 재사용

## 실행 규칙
v2~v8과 동일 (manager.md 7.26 rules). 단일 명령, git -C, npm --prefix, 파일 기반 긴 프롬프트.

## 완료 시
각 태스크 머지 + push + TODO/CHANGELOG 업데이트 + patches/ 노트 + daemon reload (config 변경 시) + vite 재기동 (프론트 변경 시).

## 다음 버전
v10은 필요 시 사용자가 지정. 현재 주요 UX 이슈는 여기서 대부분 해소됨.
