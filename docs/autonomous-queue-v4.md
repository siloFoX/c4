# 자동 실행 큐 v4 (v3 완료 후, Phase 9 중심)

Phase 9 프레임워크 확장. 각 태스크 TODO.md 설명 읽고 구현.

## 태스크 큐

### [1] TODO 9.1 — Agent Framework 전환 (대형, 부분 진행 가능)
- 워커: agent-framework
- 브랜치: c4/agent-framework
- 범위: terminal-interface.js 기반 agent adapter 추상화 시작. 첫 단계로 Claude Code adapter를 명시적 인터페이스로 분리. 전체 완성은 여러 배치 필요, 이번엔 "어댑터 인터페이스 + Claude Code 구현" 까지.

### [2] TODO 9.4 — MCP 서버 고도화 (v3에 중복이면 skip)
- 워커: mcp-upgrade-v2
- 브랜치: c4/mcp-upgrade-v2
- 범위: v3에서 못 끝냈으면 이어서. 공식 MCP 최신 스펙 반영, tool 확장.

### [3] TODO 9.3 — Agent SDK
- 워커: agent-sdk
- 브랜치: c4/agent-sdk
- 범위: programmatic C4 제어 npm 패키지 (c4-sdk). createWorker/sendTask/watchOutput API. TypeScript 타입 포함. example + README.

### [4] TODO 9.5 — Claude Code Extension/Plugin
- 워커: cc-plugin
- 브랜치: c4/cc-plugin
- 범위: Claude Code 네이티브 플러그인. slash command (/c4 new, /c4 task) 또는 tool 등록. PTY spawn 없이 API 호출.

### [5] TODO 9.7 — Dispatcher (자동 작업 분배)
- 워커: dispatcher
- 브랜치: c4/dispatcher
- 범위: Fleet 머신에 작업 자동 분배. 부하/태그/위치 기반 라우팅. 9.6이 먼저 필요하면 기본 config만 준비하고 skip.

### [6] TODO 9.8 — 머신 간 파일 전송
- 워커: file-transfer
- 브랜치: c4/file-transfer
- 범위: rsync/scp 기반 파일 동기화. git repo는 clone/pull, 일반 파일은 rsync. 진행률 표시.

### [7] TODO 9.2 — Local LLM adapter
- 워커: local-llm
- 브랜치: c4/local-llm
- 범위: Ollama/llama.cpp/vLLM 연동. config의 agent type. 단순 작업 local, 복잡 Claude 하이브리드 라우팅.

## 완료 시 v5로 이어짐 (Phase 10 엔터프라이즈)
