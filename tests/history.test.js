// Task History tests (3.7)
// Tests history recording, loading, and querying without spawning real PTY processes

const path = require('path');
const fs = require('fs');

const HISTORY_FILE = path.join(__dirname, 'test-history.jsonl');

// Minimal mock of PtyManager history methods
class MockHistoryManager {
  constructor() {
    this.historyFile = HISTORY_FILE;
  }

  _detectRepoRoot() {
    return null; // Skip git operations in tests
  }

  _getCommits(branch) {
    if (!branch) return [];
    // Mock: return empty in tests (no real git)
    return [];
  }

  _recordHistory(name, worker) {
    const record = {
      name,
      task: worker._taskText || null,
      branch: worker.branch || null,
      startedAt: worker._taskStartedAt || null,
      completedAt: new Date().toISOString(),
      commits: this._getCommits(worker.branch),
      status: worker.alive ? 'closed' : 'exited'
    };
    try {
      fs.appendFileSync(this.historyFile, JSON.stringify(record) + '\n');
    } catch (e) {
      // Silently fail
    }
    return record;
  }

  getHistory(options = {}) {
    try {
      const content = fs.readFileSync(this.historyFile, 'utf8').trim();
      if (!content) return { records: [] };
      let records = content.split('\n').map(line => {
        try { return JSON.parse(line); }
        catch { return null; }
      }).filter(Boolean);

      if (options.worker) {
        records = records.filter(r => r.name === options.worker);
      }
      if (options.limit) {
        records = records.slice(-options.limit);
      }
      return { records };
    } catch {
      return { records: [] };
    }
  }
}

// --- Test runner ---
let passed = 0, failed = 0;

function assert(condition, msg) {
  if (condition) {
    passed++;
    console.log(`  ✓ ${msg}`);
  } else {
    failed++;
    console.log(`  ✗ ${msg}`);
  }
}

function cleanup() {
  try { fs.unlinkSync(HISTORY_FILE); } catch {}
}

// --- Tests ---

console.log('\n=== Task History Tests (3.7) ===\n');

// Setup
cleanup();

const mgr = new MockHistoryManager();

// Test 1: Empty history
console.log('1. Empty history');
{
  const result = mgr.getHistory();
  assert(Array.isArray(result.records), 'returns records array');
  assert(result.records.length === 0, 'empty when no history file');
}

// Test 2: Record history on close (alive worker = closed)
console.log('\n2. Record history — alive worker');
{
  const worker = {
    alive: true,
    _taskText: 'Add logging to rag.py',
    _taskStartedAt: '2026-04-03T10:00:00.000Z',
    branch: 'c4/logger',
  };
  const record = mgr._recordHistory('logger', worker);
  assert(record.name === 'logger', 'name recorded');
  assert(record.task === 'Add logging to rag.py', 'task recorded');
  assert(record.branch === 'c4/logger', 'branch recorded');
  assert(record.startedAt === '2026-04-03T10:00:00.000Z', 'startedAt recorded');
  assert(record.completedAt !== null, 'completedAt set');
  assert(record.status === 'closed', 'alive worker → closed');
  assert(Array.isArray(record.commits), 'commits is array');
}

// Test 3: Record history — exited worker
console.log('\n3. Record history — exited worker');
{
  const worker = {
    alive: false,
    _taskText: 'Fix unit tests',
    _taskStartedAt: '2026-04-03T11:00:00.000Z',
    branch: 'c4/test-fix',
  };
  const record = mgr._recordHistory('test-fix', worker);
  assert(record.status === 'exited', 'dead worker → exited');
}

// Test 4: Record history — no task (manually created worker)
console.log('\n4. Record history — no task');
{
  const worker = {
    alive: true,
    _taskText: null,
    _taskStartedAt: null,
    branch: null,
  };
  const record = mgr._recordHistory('manual', worker);
  assert(record.task === null, 'null task ok');
  assert(record.startedAt === null, 'null startedAt ok');
  assert(record.branch === null, 'null branch ok');
}

// Test 5: Query all history
console.log('\n5. Query all history');
{
  const result = mgr.getHistory();
  assert(result.records.length === 3, '3 records total');
  assert(result.records[0].name === 'logger', 'first record is logger');
  assert(result.records[1].name === 'test-fix', 'second record is test-fix');
  assert(result.records[2].name === 'manual', 'third record is manual');
}

// Test 6: Query by worker name
console.log('\n6. Query by worker name');
{
  const result = mgr.getHistory({ worker: 'logger' });
  assert(result.records.length === 1, 'filtered to 1 record');
  assert(result.records[0].name === 'logger', 'correct worker');
}

// Test 7: Query with limit
console.log('\n7. Query with limit');
{
  const result = mgr.getHistory({ limit: 2 });
  assert(result.records.length === 2, 'limited to 2 records');
  assert(result.records[0].name === 'test-fix', 'returns last N records');
  assert(result.records[1].name === 'manual', 'last record correct');
}

// Test 8: Query non-existent worker
console.log('\n8. Query non-existent worker');
{
  const result = mgr.getHistory({ worker: 'nobody' });
  assert(result.records.length === 0, 'no records for unknown worker');
}

// Test 9: JSONL format validation
console.log('\n9. JSONL format validation');
{
  const content = fs.readFileSync(HISTORY_FILE, 'utf8');
  const lines = content.trim().split('\n');
  assert(lines.length === 3, '3 lines in file');
  let allValid = true;
  for (const line of lines) {
    try { JSON.parse(line); }
    catch { allValid = false; }
  }
  assert(allValid, 'all lines are valid JSON');
}

// Cleanup
cleanup();

// Summary
console.log(`\n--- Results: ${passed} passed, ${failed} failed ---\n`);
process.exit(failed > 0 ? 1 : 0);
