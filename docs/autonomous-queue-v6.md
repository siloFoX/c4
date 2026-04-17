# 자동 실행 큐 v6 (v5 완료 후, Phase 11 범용 자동화 플랫폼)

Phase 11 최종 단계. 각 태스크 TODO.md 참조.

## 태스크 큐

### [1] TODO 11.1 — MCP 허브
- 워커: mcp-hub
- 브랜치: c4/mcp-hub
- 범위: worker에 MCP 서버 동적 연결. config MCP 목록. 동적 로드.

### [2] TODO 11.4 — 자연어 인터페이스
- 워커: nl-interface
- 브랜치: c4/nl-interface
- 범위: "어제 작업한 worker 상태 보여줘" 같은 자연어 쿼리. Web UI 챗봇. LLM 기반 의도 파악.

### [3] TODO 11.3 — 워크플로우
- 워커: workflow
- 브랜치: c4/workflow
- 범위: 복수 worker 작업을 워크플로우 그래프로 정의. 노드-엣지 실행 엔진. Web UI 시각 편집기.

### [4] TODO 11.2 — Computer Use agent
- 워커: computer-use
- 브랜치: c4/computer-use
- 범위: 화면 조작 기반 worker. 스크린샷 + 클릭/타이핑. API 없는 앱 자동화.

## v6 완료 시
- TODO.md의 모든 주요 항목 소진됨
- 모니터가 autonomous-log.md에 "all phases 1-11 queue complete" 기록
- 추가 작업은 사용자 지시 대기
- 신규 요구사항 있을 시 v7 생성 (사용자가 직접 또는 내가 미리 준비)
