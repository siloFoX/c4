# 자동 실행 큐 v5 (v4 완료 후, Phase 10 엔터프라이즈)

Phase 10 팀/조직 기능. 각 태스크 TODO.md 설명 참조.

## 태스크 큐

### [1] TODO 10.2 — 감사 로그 (Audit Log)
- 워커: audit-log
- 브랜치: c4/audit-log
- 범위: append-only 로그 파일 또는 SQLite. worker/task/승인/머지 등 이벤트 전수 기록. 필터/검색 API.

### [2] TODO 10.5 — 비용 리포트 + 청구 (9.10 기반)
- 워커: cost-report
- 브랜치: c4/cost-report
- 범위: 9.10 guardrails 기반. 프로젝트/팀/머신별 토큰/비용 집계. 월간 리포트. 예산 한도 경고.

### [3] TODO 10.8 — 프로젝트 관리 (PM)
- 워커: project-mgmt
- 브랜치: c4/project-mgmt
- 범위: 프로젝트별 task 보드. 마일스톤/스프린트/백로그. TODO.md 양방향 동기화.

### [4] TODO 10.1 — RBAC (팀 권한 관리)
- 워커: rbac
- 브랜치: c4/rbac
- 범위: 역할(admin/manager/viewer) + 머신/프로젝트 권한. Web UI 로그인 + 세션. JWT 인증.

### [5] TODO 10.3 — 프로젝트별 대시보드
- 워커: project-dashboard
- 브랜치: c4/project-dashboard
- 범위: 프로젝트 단위 worker/task/머지 현황. 팀원별 기여도. 토큰 사용량.

### [6] TODO 10.4 — CI/CD 파이프라인 통합
- 워커: cicd-integration
- 브랜치: c4/cicd-integration
- 범위: GitHub Actions 연동. PR 리뷰 worker 자동 배정. 머지 후 배포 worker.

### [7] TODO 10.6 — 부서/팀 관리
- 워커: org-mgmt
- 브랜치: c4/org-mgmt
- 범위: 부서 단위 조직 구조. 부서별 머신/프로젝트/quota.

### [8] TODO 10.7 — 일정 관리 + 스케줄링
- 워커: schedule-mgmt
- 브랜치: c4/schedule-mgmt
- 범위: cron/캘린더 기반 예약 작업. Google Calendar 연동. 간트 차트.

## 완료 시 v6로 이어짐 (Phase 11 플랫폼)
