# Daemon Static Serve web/dist + Build Pipeline

## 배경
현재 웹 UI는 vite dev server를 수동 실행해야 접근 가능. daemon은 API만 서빙. 포트포워딩 시 vite + daemon 각각 관리 필요.

## 목표
daemon이 포트 3456 하나에서 API (/api/*) + built web UI (/) 동시 서빙. 개발자는 `c4 daemon start` 한 번으로 모두 기동. 포트포워딩도 3456 하나면 충분.

## 수정 범위

### 1. daemon 정적 파일 서빙
- `src/daemon/server.js` (또는 해당 http 서버 파일) 에 express.static middleware 추가
- `app.use(express.static('/root/c4/web/dist'))` (경로는 `path.join(__dirname, ...)` 로 상대 계산)
- SPA 라우팅 지원: 모든 non-api 경로 → index.html fallback (`app.get('*', (req, res, next) => { if (req.path.startsWith('/api')) return next(); res.sendFile(webDistIndex); })`)
- `/api/*` 라우트는 먼저 등록해서 정적 서빙보다 우선

### 2. 빌드 파이프라인
- `package.json` 최상위에 `postinstall` 스크립트 추가 (또는 별도 `build:web` 스크립트):
  ```
  "build:web": "npm --prefix web install && npm --prefix web run build"
  ```
- `c4 init` 실행 시점에 `build:web` 자동 실행 (web/dist 없거나 오래됐으면)
- `c4 daemon start` 전에 web/dist 존재 확인, 없으면 경고 출력 + build 제안

### 3. dev mode 대비 (선택)
- `c4 daemon start --dev` 모드: vite dev server를 subprocess로 spawn (HMR 유지)
- prod mode (default): built dist 서빙
- dev/prod 플래그는 config.json `daemon.mode` 필드로도 지정 가능

### 4. 문서
- README에 "Web UI 접근" 섹션:
  - 포트포워딩: `ssh -L 3456:localhost:3456 user@host` → 브라우저 `http://localhost:3456/`
  - dev mode: `c4 daemon start --dev` (vite HMR)
- docs/handoff.md에도 반영

## 검증
- `npm --prefix web run build` → web/dist 생성 확인
- `c4 daemon restart` → 3456 리스닝 확인 (이미 OK)
- `curl http://localhost:3456/` → index.html 반환 확인
- `curl http://localhost:3456/api/workers` → 기존 API 정상 동작 확인
- 브라우저에서 http://localhost:3456/ 접근 → Web UI 렌더링 확인 (포트포워딩 환경)
- `npm test` pass

## 테스트
- tests/daemon-static-serve.test.js 신규
  - GET / → 200 + HTML 컨텐츠
  - GET /api/health → 기존 API 동작
  - GET /nonexistent/route → index.html fallback (SPA)
  - web/dist 없을 때 명확 에러

## 문서
- TODO.md에 이 태스크 추가 (새 번호, 예: 8.12) + **done** 상태로 마크 + 구현 요약
- CHANGELOG.md 항목
- 커밋 메시지: `feat: daemon serves web UI via static + build pipeline (8.12)`

## 주의
- 복합 명령 금지 (7.26).
- 머지 후 `c4 daemon restart` 필수 (static middleware 로딩).
- vite.config.ts는 건드리지 말 것 (dev mode용으로 남김).
- 완료 후 "완료" 한 마디만.
