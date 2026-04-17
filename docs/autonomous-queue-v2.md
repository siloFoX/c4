# 자동 실행 큐 v2 (2026-04-17 오후~야간)

v1 큐 (7.25-7.28 + 8.10) 완료. 이번 배치는 안정성 + autonomy 강화 + UI serve 기반 잡기.

## 엄격한 규칙 (v1과 동일, 7.26 완료로 manager.md에 이미 박혀있음)

- 복합 명령 금지 (`&&`, `||`, `;`, `|`, `for`, `while`, `cd &&`)
- `git -C` / `npm --prefix` 사용
- sleep 대신 `c4 wait`
- 긴 task 메시지는 Write→파일→경로 패턴
- 인라인 메시지는 plain text 한 문단
- 머지 후 push 필수, daemon 관련 변경 시 daemon restart 필수

## 태스크 큐 (우선순위 순)

### [1] TODO 7.29 — package-lock.json 자발적 수정 원인 추적
- 워커: pkglock-investigate
- 브랜치: c4/pkglock-fix
- 내용: TODO 7.29 읽고 조사/수정. 수정 패턴 확인 (lockfileVersion/순서/hash 등), npm install 트리거 분석. 결론에 따라 code/doc fix. 원인 불명이면 `.gitattributes` 또는 gitignore 처리 검토 + 설명만 남기고 close.

### [2] TODO 7.22 — pendingTask Enter 재발 해결
- 워커: pending-task-fix
- 브랜치: c4/pending-task-fix
- 내용: TODO 7.22 읽고 v1.6.16에서도 재발하는 부분 분석 (오늘도 실제 task 2/3에서 c4 send + key Enter 수동 필요 경험). 7.17 5-point 방어 외 추가 failure mode 식별 + 수정. 테스트 추가.

### [3] TODO 7.23 — PostToolUse hook 에러 재발
- 워커: hook-error-fix
- 브랜치: c4/hook-error-fix
- 내용: TODO 7.23 읽고 v1.6.16 daemon에서 worker 생성 시 hook 설정이 여전히 에러 유발하는 부분 재검증. 7.16 ASCII 수정 + hook-relay.js 교체 이후 상태 확인. 필요 시 추가 수정.

### [4] TODO 7.21 — c4 wait --all intervention 무한 대기 해소
- 워커: wait-all-fix
- 브랜치: c4/wait-all-fix
- 내용: TODO 7.21 읽고 `c4 wait --all`이 intervention worker 때문에 blocking하는 문제 수정. idle 완료 worker 즉시 반환, intervention worker 별도 보고. 테스트 추가.

### [5] (신규) daemon static serve web/dist + build pipeline
- 워커: web-serve
- 브랜치: c4/web-serve
- 스펙: /root/c4/docs/tasks/web-serve.md (아래에 작성됨)
- 내용: daemon이 포트 3456에서 API + 빌드된 web UI 동시 서빙. npm run build로 web/dist 생성. 포트포워딩 1개로 웹 접근 가능.

### [6] TODO 9.11 — Worktree GC 자동화
- 워커: worktree-gc
- 브랜치: c4/worktree-gc
- 내용: TODO 9.11 읽고 구현. daemon 내부 주기 GC 루프, inactive worktree 감지 + 자동 cleanup. 기존 c4 cleanup 확장.

### [7] TODO 9.10 — Cost/retry guardrails (긴급)
- 워커: cost-guard
- 브랜치: c4/cost-guard
- 내용: TODO 9.10 읽고 구현. `--max-budget-usd` per task, maxRetries 카운터, safety stop. financial safety. Claude CLI의 기존 옵션 활용.

### [8] TODO 9.9 — Manager-Worker validation object
- 워커: validation-obj
- 브랜치: c4/validation-obj
- 내용: TODO 9.9 읽고 구현. 워커 완료 시 구조화된 validation object 강제 반환. 매니저 교차 검증.

### [9] TODO 8.11 — Fresh install 재현성 검증
- 워커: install-verify
- 브랜치: c4/install-verify
- 내용: TODO 8.11 읽고 구현. 임시 디렉토리에서 clone→install→init→daemon→web UI까지 시뮬레이션. 막히는 부분 코드/문서 수정. README Install 섹션 보강.

## 실행 패턴 (각 태스크 공통)

1. `c4 new <worker-name>`
2. `c4 task <worker-name> --auto-mode --branch <branch> "read TODO.md section X.Y and execute"` (또는 spec 파일 있으면 path 전달)
3. `c4 wait <worker-name> --timeout 1800000` (30분)
4. approval 요청 있으면 `c4 read-now` 후 task scope 판단 → `c4 key ... Enter` 또는 `c4 send ...` corrective
5. 완료 시 `npm --prefix /root/c4-worktree-<name> test` 검증
6. `c4 merge <worker-name>` (pre-merge checks: npm test, TODO.md modified, CHANGELOG.md modified)
7. 머지 충돌 시 Read + Edit으로 수동 resolve, add, commit
8. `git -C /root/c4 push origin main`
9. daemon 관련 변경이면 `c4 daemon restart`
10. `c4 close <worker-name>`

## 승인 정책 (v1과 동일)

- 파일 Edit/Write/Read (task scope 내): 승인
- npm test, git 명령: 승인
- 거부: rm, sudo, chmod (repo 밖), git push --force
- 복합 명령 발견 시 `c4 send <name> "use single commands only per 7.26 rules"` 교정

## Halt 대응

- permission prompt 멈춤: 내용 확인 → 대응. 연속 3회 halt 시 태스크 skip, /root/c4/docs/autonomous-log.md에 기록
- 모든 halt 발생 상황은 반드시 log에 timestamp + command + 결과 기록

## 완료 시

- 모든 태스크 끝나면 `/root/c4/docs/autonomous-log.md`에 배치 요약 append
- 최종 push 확인
- idle 대기

## 참고

- 오늘 완료된 것: 7.25, 7.26, 7.27, 7.28, 8.10 (v1.6.16)
- DGX 키 인증 가능해짐 (40 서버 pubkey → DGX ~/.ssh/authorized_keys 등록됨)
- daemon: v1.6.16, 127.0.0.1:3456 (localhost 유지)
- 장애 시 daemon restart로 복구
