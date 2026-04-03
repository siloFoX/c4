# auto-mgr 복합 명령 사용 - PreToolUse Hook이 Worker에 적용 안 되는 문제

## 원인

### 설정 파일 구조

Hook 설정이 존재하는 위치는 3곳이다:

| 위치 | 파일 | 역할 |
|------|------|------|
| 홈 디렉토리 | `~/.claude/settings.json` | 전역 hook 설정 |
| 프로젝트 | `c4/.claude/settings.json` | 프로젝트 hook 설정 |
| 워커 worktree | `c4-worktree-<name>/.claude/settings.json` | C4가 생성한 워커용 설정 |

### 홈 디렉토리 settings.json의 Hook 구성

```
PreToolUse[0]: 전역 매처 - daemon에 hook 이벤트 POST (PowerShell)
PreToolUse[1]: Bash 매처 - 복합 명령(&&, ||, |, ;) 차단 (Node.js)
PostToolUse:   전역 매처 - daemon에 hook 이벤트 POST
PostCompact:   컨텍스트 파일 로더
```

### Worker Settings 생성 로직 (핵심 문제)

`_buildWorkerSettings()` (src/pty-manager.js:1320-1334)가 워커용 settings.json을 생성할 때:

```javascript
// line 1321-1323: daemon 통신 hook 주입
if (hooksCfg.enabled !== false && hooksCfg.injectToWorkers !== false) {
  settings.hooks = this._buildHookCommands(workerName);
}

// line 1328-1334: 복합 명령 차단 hook 주입
if (!settings.hooks) settings.hooks = {};
if (!settings.hooks.PreToolUse) settings.hooks.PreToolUse = [];
settings.hooks.PreToolUse.push({
  matcher: 'Bash',
  hooks: [{
    type: 'command',
    command: this._buildCompoundBlockCommand()
  }]
});
```

**_buildHookCommands()** (line 476): daemon 통신용 hook만 반환. 홈/프로젝트 settings.json의 hook은 포함하지 않음.

**_buildCompoundBlockCommand()** (line 505): Node.js 인라인 스크립트로 복합 명령 차단.

### 설정 병합의 갭

| 항목 | 워커 settings에 포함 여부 |
|------|--------------------------|
| daemon 통신 hook | O (_buildHookCommands) |
| 복합 명령 차단 hook | O (_buildCompoundBlockCommand) |
| PostCompact hook | O (별도 주입) |
| 홈 ~/.claude/settings.json hook | **X (병합 안 됨)** |
| 프로젝트 c4/.claude/settings.json hook | **X (병합 안 됨)** |
| 프로필별 hook | O (line 1357-1368) |

### Claude Code의 Settings 해석 순서

Claude Code 서브프로세스가 worktree에서 시작될 때:

1. worktree/.claude/settings.json 읽음 (C4가 생성한 것)
2. ~/.claude/settings.json 읽음 (홈 디렉토리)
3. 두 설정을 병합

**문제**: C4가 생성한 worktree settings.json에 이미 PreToolUse가 있으므로, Claude Code가 홈 settings.json의 PreToolUse를 어떻게 병합하는지에 따라 결과가 달라진다.

### 복합 명령이 계속 실행되는 구체적 시나리오

1. **Hook 실행 순서 문제**: worktree PreToolUse[0]이 daemon POST hook(PowerShell)인데, PowerShell 실행이 실패하거나 타임아웃되면 후속 hook 평가가 중단될 수 있음

2. **PowerShell hook 실패**: 워커 환경에서 daemon이 아직 시작되지 않았거나 포트가 다르면 PowerShell의 `Invoke-WebRequest`가 실패 -> hook 체인 중단 가능

3. **인라인 Node.js 스크립트 한계**: `_buildCompoundBlockCommand()`가 생성하는 인라인 스크립트의 정규식 `/&&|\\|\\||[|;]/`이 모든 케이스를 커버하지 못할 수 있음 (예: 줄바꿈으로 분리된 복합 명령)

4. **홈 settings.json의 더 정교한 차단 로직이 누락**: 홈 settings.json에는 daemon 통보 + 차단이 결합된 hook이 있지만, C4가 생성한 worktree settings에는 단순 차단만 있어 동작이 다름

## 영향

- **안전장치 우회**: 복합 명령 차단이 의도대로 작동하지 않아 auto worker가 `cd /path && git commit` 같은 복합 명령을 계속 실행
- **디버깅 난이도**: hook이 3개 위치(홈, 프로젝트, worktree)에 분산되어 있어 어떤 hook이 실제로 적용되는지 추적이 어려움
- **일관성 부재**: 메인 프로세스에서는 hook이 작동하지만 워커에서는 작동하지 않아 동작이 불일치
- **반복 발생**: 워커가 새로 생성될 때마다 동일한 문제가 재현됨

## 해결 방안

### 방안 1: 홈/프로젝트 settings.json의 hook을 worktree settings에 병합

`_buildWorkerSettings()`에서 홈/프로젝트 settings.json의 hook을 읽어 worktree settings에 병합한다.

```javascript
// _buildWorkerSettings() 내부
const homeSettings = this._readHomeSettings();  // ~/.claude/settings.json 읽기
const projectSettings = this._readProjectSettings();  // c4/.claude/settings.json 읽기

// 홈/프로젝트 hook을 워커 settings에 병합
if (homeSettings.hooks?.PreToolUse) {
  settings.hooks.PreToolUse.push(...homeSettings.hooks.PreToolUse);
}
```

장점: 홈에서 설정한 hook이 워커에도 일관 적용. 단점: 홈 hook이 워커 환경에서 호환되지 않을 수 있음 (경로, 포트 등).

### 방안 2: Claude Code의 설정 해석에 의존하지 않고 C4가 직접 hook을 완전 생성

현재 C4는 일부 hook만 생성하고 나머지는 Claude Code의 설정 병합에 의존한다. 대신 C4가 필요한 모든 hook을 명시적으로 worktree settings.json에 작성한다.

```javascript
_buildWorkerSettings() {
  const hooks = {
    PreToolUse: [
      this._buildDaemonHook(),          // daemon 통신
      this._buildCompoundBlockHook(),   // 복합 명령 차단
      // 홈 settings에서 가져온 추가 hook들
    ],
    PostToolUse: [...],
    PostCompact: [...]
  };
  // worktree settings.json에 완전한 hook 세트 작성
}
```

장점: worktree settings가 자체적으로 완결, 외부 설정 의존 제거. 단점: 홈 settings 변경 시 워커에 자동 반영 안 됨.

### 방안 3: Hook 실행 체인의 에러 처리 강화

현재 daemon POST hook이 실패하면 후속 hook이 실행되지 않을 수 있다. Hook 체인에서 개별 hook 실패가 다음 hook 실행을 막지 않도록 한다.

구체적으로:
- daemon POST hook의 실패를 무시하고 다음 hook으로 진행
- 복합 명령 차단 hook을 PreToolUse 배열의 첫 번째로 배치 (차단이 우선)
- hook 실행 결과 로깅 추가

장점: 기존 구조 변경 최소. 단점: 근본 원인(설정 미병합)은 해결하지 않음.

## 추천안

**방안 2 (C4가 완전한 hook 세트를 직접 생성)** 추천.

이유:
- Claude Code의 설정 병합 동작에 의존하지 않으므로 예측 가능한 동작 보장
- worktree settings.json만 보면 워커에 적용되는 hook 전체를 파악 가능
- daemon 통신 hook 실패와 무관하게 복합 명령 차단이 독립적으로 작동
- 방안 1은 홈 hook의 환경 호환성 문제가 있고, 방안 3은 설정 미병합이라는 근본 원인을 해결하지 않음

추가 권장사항: 복합 명령 차단 hook을 PreToolUse 배열의 **첫 번째**로 배치하여, daemon 통신 hook 실패와 무관하게 차단이 먼저 실행되도록 한다.
