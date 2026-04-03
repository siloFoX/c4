# c4 merge 홈디렉토리 실행 불가

## 원인

### 핵심 원인: cli.js merge 명령이 cwd 기반 git rev-parse만 사용

`cli.js:559`에서 `git rev-parse --show-toplevel`을 cwd 지정 없이 실행한다. 홈디렉토리는 git 저장소가 아니므로 이 명령이 실패하고, catch 블록에서 즉시 `process.exit(1)`한다.

**실패하는 코드** (`cli.js:558-563`):

```javascript
try {
  repoRoot = execSync('git rev-parse --show-toplevel', { encoding: 'utf8' }).trim();
} catch {
  console.error('Error: not inside a git repository');
  process.exit(1);  // 폴백 없이 즉시 종료
}
```

### 대조: pty-manager.js의 정상 동작하는 폴백 체인

`pty-manager.js:1393-1406`의 `_detectRepoRoot()`는 3단계 폴백을 구현한다:

| 단계 | 방법 | cli.js merge |
|------|------|-------------|
| 1 | 명시적 `projectRoot` 파라미터 사용 | 없음 |
| 2 | `config.worktree.projectRoot` 설정 사용 | 없음 |
| 3 | c4 디렉토리 기준 git 탐색 (`cwd: __dirname + '/...'`) | cwd 미지정 |

cli.js의 merge 명령은 이 3단계 중 어떤 것도 사용하지 않고, cwd(현재 디렉토리) 기반 탐색만 시도한다.

### merge 명령에서 repoRoot가 사용되는 모든 위치

| 라인 | git 명령 | 용도 |
|------|---------|------|
| 559 | `git rev-parse --show-toplevel` | repo root 탐지 (여기서 실패) |
| 572 | `git -C "${worktreePath}" rev-parse --abbrev-ref HEAD` | worktree 브랜치 확인 |
| 582 | `git rev-parse --verify "${branch}"` | 브랜치 존재 확인 (`cwd: repoRoot`) |
| 589 | `git rev-parse --abbrev-ref HEAD` | 현재 브랜치 확인 (`cwd: repoRoot`) |
| 627 | `git diff main..."${branch}" --name-only` | TODO.md 변경 확인 (`cwd: repoRoot`) |
| 643 | `git diff main..."${branch}" --name-only` | CHANGELOG.md 변경 확인 (`cwd: repoRoot`) |
| 664 | `git merge "${branch}" --no-ff -m "..."` | 실제 merge 수행 (`cwd: repoRoot`) |

line 572 이후의 모든 git 명령은 `cwd: repoRoot`를 명시하므로, repoRoot만 정상 취득하면 홈디렉토리에서도 동작한다.

### config.json의 projectRoot 설정 현황

`config.example.json:89-92`:
```json
"worktree": {
  "enabled": true,
  "projectRoot": ""
}
```

이 설정은 이미 존재하고 `pty-manager.js`에서 활용 중이지만, `cli.js`의 merge 명령은 config를 로드하지 않는다.

## 영향

- 홈디렉토리에서 `c4 merge` 실행 시 무조건 실패
- 사용자가 매번 프로젝트 디렉토리로 이동 후 실행해야 함
- `c4 task`, `c4 auto` 등 다른 명령은 daemon 경유로 정상 동작하므로 일관성 결여
- 홈디렉토리를 작업 기본 위치로 사용하는 워크플로우에서 merge만 예외 처리 필요

## 해결 방안

### 방안 1: config.json의 projectRoot 폴백 추가

cli.js의 merge 핸들러에서 config.json을 로드하고, `git rev-parse` 실패 시 `config.worktree.projectRoot`를 폴백으로 사용.

```
git rev-parse 시도 -> 실패 -> config.worktree.projectRoot 확인 -> 있으면 사용
```

- 장점: 기존 config 인프라 활용, pty-manager.js와 일관된 동작
- 단점: cli.js에 config 로딩 의존성 추가

### 방안 2: c4 디렉토리 기준 git 탐색

`pty-manager.js`의 `_detectRepoRoot()`와 동일하게, c4 설치 디렉토리(`__dirname + '/...'`) 기준으로 `git rev-parse`를 실행.

```javascript
repoRoot = execSync('git rev-parse --show-toplevel', {
  encoding: 'utf8',
  cwd: path.resolve(__dirname, '..')
}).trim();
```

- 장점: config 의존 없음, c4가 프로젝트 내에 있으면 자동 동작
- 단점: c4가 대상 repo 외부에 설치된 경우 실패

### 방안 3: `_detectRepoRoot()` 공통 유틸로 추출

`pty-manager.js:1393-1406`의 `_detectRepoRoot()`를 별도 모듈로 추출하여 cli.js와 pty-manager.js 모두에서 사용. 3단계 폴백 체인(파라미터 -> config -> git)을 공유.

- 장점: 코드 중복 제거, 모든 명령에서 일관된 repo 탐색
- 단점: 모듈 분리 리팩토링 필요

## 추천안

**방안 1 (config.json의 projectRoot 폴백 추가)** 추천.

이유:
1. 변경 범위가 `cli.js`의 merge 핸들러 한 곳으로 한정
2. `config.worktree.projectRoot`는 이미 존재하는 설정이며 사용자가 값을 지정하면 즉시 동작
3. `pty-manager.js`와 동일한 폴백 전략으로 코드베이스 일관성 확보
4. 방안 3(공통 유틸 추출)은 이상적이지만 현재 문제 해결에는 과도한 리팩토링

구체적으로:
- `cli.js:558` 앞에서 config.json 로드 (`path.resolve(__dirname, '..', 'config.json')`)
- `git rev-parse` 실패 시 `config.worktree.projectRoot` 확인
- projectRoot가 있으면 해당 경로를 repoRoot로 사용
- 둘 다 실패 시 기존과 동일하게 에러 출력 후 종료
