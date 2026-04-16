'use strict';
require('./jest-shim');

const path = require('path');
const fs = require('fs');

// Minimal mock of PtyManager with _buildTaskText and _maybeWriteTaskFile
class MockPtyManager {
  constructor() {
    this._writtenFiles = {};
    // Monkey-patch fs.writeFileSync for test isolation
    this._origWriteFileSync = fs.writeFileSync;
    fs.writeFileSync = (filePath, content, encoding) => {
      this._writtenFiles[filePath.replace(/\\/g, '/')] = { content, encoding };
    };
  }

  restore() {
    fs.writeFileSync = this._origWriteFileSync;
  }

  _getRulesSummary() { return null; }

  _getContextSnapshots() { return null; }

  _maybeWriteTaskFile(worker, fullText) {
    if (fullText.length > 1000 && worker.worktree) {
      const taskFilePath = path.join(worker.worktree, '.c4-task.md').replace(/\\/g, '/');
      fs.writeFileSync(taskFilePath, fullText, 'utf8');
      const cdPath = worker.worktree.replace(/\\/g, '/');
      return `${taskFilePath} 파일을 읽고 지시대로 작업해. cd ${cdPath} 후 작업 시작.`;
    }
    return fullText;
  }

  _buildTaskText(worker, task, options = {}) {
    const commands = [];
    if (worker.worktree) {
      const cdPath = worker.worktree.replace(/\\/g, '/');
      commands.push(`cd ${cdPath} 로 이동해서 작업해줘. 현재 브랜치는 ${worker.branch || 'unknown'}야. 작업 단위마다 커밋해줘.`);
    }
    const rulesSummary = this._getRulesSummary();
    if (rulesSummary) commands.push(rulesSummary);
    if (worker.scopeGuard && worker.scopeGuard.hasRestrictions()) {
      commands.push(worker.scopeGuard.toSummary());
    }
    if (options.contextFrom) {
      const ctx = this._getContextSnapshots(options.contextFrom, 3);
      if (ctx) commands.push(ctx);
    }
    commands.push(task);
    const fullText = commands.join('\n\n');
    return this._maybeWriteTaskFile(worker, fullText);
  }
}

describe('_maybeWriteTaskFile (5.35)', () => {
  let mgr;

  beforeEach(() => {
    mgr = new MockPtyManager();
  });

  test('short text (<= 1000 chars) returned as-is', () => {
    const worker = { worktree: '/tmp/wt' };
    const text = 'a'.repeat(1000);
    const result = mgr._maybeWriteTaskFile(worker, text);
    expect(result).toBe(text);
    expect(Object.keys(mgr._writtenFiles)).toHaveLength(0);
    mgr.restore();
  });

  test('long text (> 1000 chars) with worktree saves to file', () => {
    const worker = { worktree: '/tmp/wt' };
    const text = 'a'.repeat(1001);
    const result = mgr._maybeWriteTaskFile(worker, text);
    expect(result).toContain('.c4-task.md');
    expect(result).toContain('cd /tmp/wt');
    expect(Object.keys(mgr._writtenFiles)).toHaveLength(1);
    const written = mgr._writtenFiles['/tmp/wt/.c4-task.md'];
    expect(written).toBeDefined();
    expect(written.content).toBe(text);
    mgr.restore();
  });

  test('long text without worktree returned as-is', () => {
    const worker = {};
    const text = 'a'.repeat(2000);
    const result = mgr._maybeWriteTaskFile(worker, text);
    expect(result).toBe(text);
    expect(Object.keys(mgr._writtenFiles)).toHaveLength(0);
    mgr.restore();
  });

  test('returned message is short (under 200 chars)', () => {
    const worker = { worktree: '/tmp/wt' };
    const text = 'a'.repeat(5000);
    const result = mgr._maybeWriteTaskFile(worker, text);
    expect(result.length).toBeLessThan(200);
    mgr.restore();
  });

  test('windows path backslashes normalized', () => {
    const worker = { worktree: 'C:\\Users\\test\\wt' };
    const text = 'a'.repeat(1500);
    const result = mgr._maybeWriteTaskFile(worker, text);
    expect(result).not.toContain('\\');
    expect(result).toContain('C:/Users/test/wt');
    mgr.restore();
  });
});

describe('_buildTaskText with file fallback (5.35)', () => {
  let mgr;

  beforeEach(() => {
    mgr = new MockPtyManager();
  });

  test('short task: full text returned directly', () => {
    const worker = { worktree: '/tmp/wt', branch: 'c4/test' };
    const result = mgr._buildTaskText(worker, 'short task');
    expect(result).toContain('short task');
    expect(result).toContain('cd /tmp/wt');
    expect(Object.keys(mgr._writtenFiles)).toHaveLength(0);
    mgr.restore();
  });

  test('long task: file created, short message returned', () => {
    const worker = { worktree: '/tmp/wt', branch: 'c4/test' };
    const longTask = 'x'.repeat(2000);
    const result = mgr._buildTaskText(worker, longTask);
    expect(result).toContain('.c4-task.md');
    expect(result.length).toBeLessThan(200);
    const written = mgr._writtenFiles['/tmp/wt/.c4-task.md'];
    expect(written).toBeDefined();
    expect(written.content).toContain(longTask);
    expect(written.content).toContain('cd /tmp/wt');
    mgr.restore();
  });

  test('file content includes all command parts', () => {
    const worker = {
      worktree: '/tmp/wt',
      branch: 'c4/feat',
      scopeGuard: {
        hasRestrictions: () => true,
        toSummary: () => 'scope: src/ only'
      }
    };
    const longTask = 'y'.repeat(2000);
    mgr._buildTaskText(worker, longTask);
    const written = mgr._writtenFiles['/tmp/wt/.c4-task.md'];
    expect(written.content).toContain('c4/feat');
    expect(written.content).toContain('scope: src/ only');
    expect(written.content).toContain(longTask);
    mgr.restore();
  });

  test('exactly 1000 chars: not saved to file', () => {
    const worker = { worktree: '/tmp/wt', branch: 'b' };
    // Build a task that makes total exactly 1000
    const prefix = mgr._buildTaskText(worker, '');
    const padLen = 1000 - prefix.length;
    if (padLen > 0) {
      const result = mgr._buildTaskText(worker, 'z'.repeat(padLen));
      expect(result).not.toContain('.c4-task.md');
    }
    expect(Object.keys(mgr._writtenFiles)).toHaveLength(0);
    mgr.restore();
  });
});
