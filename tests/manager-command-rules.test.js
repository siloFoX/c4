'use strict';
require('./jest-shim');

// 7.26: verifies the halt-prevention rules exist in .claude/agents/manager.md.
// Runtime enforcement of the rules happens inside Claude Code (manager agent)
// and cannot be asserted here, so this suite only validates that the
// documentation the agent reads remains present and well-structured.

const fs = require('fs');
const path = require('path');

const managerPath = path.join(__dirname, '..', '.claude', 'agents', 'manager.md');
const managerContent = fs.readFileSync(managerPath, 'utf8');

describe('manager.md halt-prevention rules (7.26)', () => {
  test('top-level "명령 생성 규칙 (halt 방지)" section exists', () => {
    expect(managerContent).toContain('## 명령 생성 규칙 (halt 방지)');
  });

  test('"절대 금지 패턴" subsection lists compound/pipe/redir/loop/cd-chain', () => {
    expect(managerContent).toContain('### 절대 금지 패턴');
    expect(managerContent).toContain('cmd1 && cmd2');
    expect(managerContent).toContain('cmd1; cmd2');
    expect(managerContent).toContain('cmd | filter');
    expect(managerContent).toContain('2>&1');
    expect(managerContent).toContain('for x in');
    expect(managerContent).toContain('while');
    expect(managerContent).toContain('cd /path');
  });

  test('"올바른 대안" subsection points to git -C / npm --prefix / c4 wait', () => {
    expect(managerContent).toContain('### 올바른 대안');
    expect(managerContent).toContain('git -C');
    expect(managerContent).toContain('npm --prefix');
    expect(managerContent).toContain('c4 wait');
    expect(managerContent).toContain('Bash tool call');
  });

  test('"c4 task/send 메시지 규칙" forbids markdown headers and prescribes file delivery', () => {
    expect(managerContent).toContain('### c4 task/send 메시지 규칙');
    expect(managerContent).toContain('markdown 헤더');
    expect(managerContent).toContain('##');
    expect(managerContent).toContain('###');
    expect(managerContent).toMatch(/Write.*\/tmp\/task-.*\.md/);
    expect(managerContent).toMatch(/read .*\/tmp\/task-.*\.md/);
  });

  test('"위반 시 대응" section describes the recovery protocol', () => {
    expect(managerContent).toContain('### 위반 시 대응');
    expect(managerContent).toContain('halt');
    expect(managerContent).toContain('사용자');
  });

  test('rules are placed after the "No compound commands" section', () => {
    const idxCompound = managerContent.indexOf('## CRITICAL: No compound commands');
    const idxHalt = managerContent.indexOf('## 명령 생성 규칙 (halt 방지)');
    expect(idxCompound).toBeGreaterThan(-1);
    expect(idxHalt).toBeGreaterThan(idxCompound);
  });
});
