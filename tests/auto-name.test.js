// Auto worker name generation tests (5.40)
require('./jest-shim');

// Minimal mock of PtyManager for _generateTaskName testing
class MockPtyManager {
  constructor() {
    this.workers = new Map();
    this._taskQueue = [];
  }
}

// Extract _generateTaskName from pty-manager source
const fs = require('fs');
const path = require('path');
const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'pty-manager.js'), 'utf8');
const match = src.match(/_generateTaskName\(task\)\s*\{[\s\S]*?\n  \}/);
if (!match) throw new Error('Could not extract _generateTaskName from pty-manager.js');
// Attach to MockPtyManager prototype via Function constructor
MockPtyManager.prototype._generateTaskName = new Function('task', match[0]
  .replace(/^_generateTaskName\(task\)\s*\{/, '')
  .replace(/\}$/, '')
);

describe('_generateTaskName', () => {
  let mgr;

  beforeEach(() => {
    mgr = new MockPtyManager();
  });

  test('extracts English words and creates kebab-case name', () => {
    const name = mgr._generateTaskName('Add logging to server');
    expect(name).toBe('w-add-logging-to-server');
  });

  test('extracts only English words from mixed Korean/English text', () => {
    const name = mgr._generateTaskName('Slack API 연동');
    expect(name).toBe('w-slack-api');
  });

  test('strips special characters from words', () => {
    const name = mgr._generateTaskName('fix bug #123 in parser');
    // #123 becomes 123 (no letters) so filtered out
    expect(name).toBe('w-fix-bug-in-parser');
  });

  test('uses first line only', () => {
    const name = mgr._generateTaskName('implement auth\nsecond line details\nthird');
    expect(name).toBe('w-implement-auth');
  });

  test('respects 30 char max', () => {
    const name = mgr._generateTaskName('implement very long feature name that exceeds the maximum allowed length');
    expect(name.length).toBeLessThanOrEqual(30);
    expect(name).toMatch(/^w-/);
  });

  test('falls back to w-task when no English words', () => {
    const name = mgr._generateTaskName('로깅 추가');
    expect(name).toBe('w-task');
  });

  test('falls back to w-task for empty task', () => {
    const name = mgr._generateTaskName('');
    expect(name).toBe('w-task');
  });

  test('deduplicates with existing workers', () => {
    mgr.workers.set('w-fix-bug', { alive: true });
    const name = mgr._generateTaskName('fix bug');
    expect(name).toBe('w-fix-bug-2');
  });

  test('deduplicates with task queue', () => {
    mgr._taskQueue.push({ name: 'w-add-tests' });
    const name = mgr._generateTaskName('add tests');
    expect(name).toBe('w-add-tests-2');
  });

  test('increments suffix for multiple duplicates', () => {
    mgr.workers.set('w-deploy', { alive: true });
    mgr.workers.set('w-deploy-2', { alive: true });
    mgr.workers.set('w-deploy-3', { alive: true });
    const name = mgr._generateTaskName('deploy');
    expect(name).toBe('w-deploy-4');
  });

  test('converts to lowercase', () => {
    const name = mgr._generateTaskName('Fix README Parser');
    expect(name).toBe('w-fix-readme-parser');
  });

  test('handles words with numbers', () => {
    const name = mgr._generateTaskName('upgrade v2 to v3');
    expect(name).toBe('w-upgrade-v2-to-v3');
  });
});
