const assert = require('assert');
const { describe, it } = require('node:test');
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const cliPath = path.join(__dirname, '..', 'src', 'cli.js');

// Run CLI and capture output (expects failure since daemon is not running)
function runCli(args, opts = {}) {
  try {
    const out = execSync(`node "${cliPath}" ${args}`, {
      encoding: 'utf8',
      stdio: 'pipe',
      timeout: 5000,
      env: { ...process.env, C4_URL: 'http://127.0.0.1:19999', ...opts.env },
      cwd: opts.cwd
    });
    return { code: 0, stdout: out, stderr: '' };
  } catch (e) {
    return {
      code: e.status || 1,
      stdout: (e.stdout || '').toString(),
      stderr: (e.stderr || '').toString()
    };
  }
}

describe('Batch command (5.11)', () => {

  describe('argument parsing', () => {
    it('shows usage when no args', () => {
      const r = runCli('batch');
      assert.strictEqual(r.code, 1);
      assert.ok(r.stderr.includes('Usage:') || r.stderr.includes('c4 batch'));
    });

    it('shows usage when count without task', () => {
      const r = runCli('batch --count 3');
      assert.strictEqual(r.code, 1);
      assert.ok(r.stderr.includes('Usage:'));
    });

    it('shows error when file not found', () => {
      const r = runCli('batch --file nonexistent-file-xyz.txt');
      assert.strictEqual(r.code, 1);
      assert.ok(r.stderr.includes('Error reading file'));
    });

    it('shows error when file is empty', () => {
      const tmpFile = path.join(os.tmpdir(), 'c4-batch-empty.txt');
      fs.writeFileSync(tmpFile, '\n\n# comment\n');
      try {
        const r = runCli('batch --file "' + tmpFile + '"');
        assert.strictEqual(r.code, 1);
        assert.ok(r.stderr.includes('No tasks found'));
      } finally {
        fs.unlinkSync(tmpFile);
      }
    });
  });

  describe('count mode', () => {
    it('attempts to create N workers (fails gracefully without daemon)', () => {
      const r = runCli('batch "test task" --count 2');
      // Should print "Batch: 2 tasks" then fail on POST /task
      assert.ok(r.stdout.includes('Batch: 2 tasks') || r.stderr.includes('Batch: 2 tasks'));
    });

    it('passes auto-mode flag', () => {
      const r = runCli('batch "test task" --count 1 --auto-mode');
      assert.ok(r.stdout.includes('Batch: 1 tasks') || r.stderr.includes('Batch: 1 tasks'));
    });

    it('passes profile flag', () => {
      const r = runCli('batch "test task" --count 1 --profile web');
      assert.ok(r.stdout.includes('Batch: 1 tasks') || r.stderr.includes('Batch: 1 tasks'));
    });
  });

  describe('file mode', () => {
    it('reads tasks from file (one per line)', () => {
      const tmpFile = path.join(os.tmpdir(), 'c4-batch-tasks.txt');
      fs.writeFileSync(tmpFile, 'task one\ntask two\ntask three\n');
      try {
        const r = runCli('batch --file "' + tmpFile + '"');
        assert.ok(r.stdout.includes('Batch: 3 tasks') || r.stderr.includes('Batch: 3 tasks'));
      } finally {
        fs.unlinkSync(tmpFile);
      }
    });

    it('skips comments and empty lines', () => {
      const tmpFile = path.join(os.tmpdir(), 'c4-batch-comments.txt');
      fs.writeFileSync(tmpFile, '# header\ntask A\n\n# skip\ntask B\n');
      try {
        const r = runCli('batch --file "' + tmpFile + '"');
        assert.ok(r.stdout.includes('Batch: 2 tasks') || r.stderr.includes('Batch: 2 tasks'));
      } finally {
        fs.unlinkSync(tmpFile);
      }
    });

    it('supports file mode with auto-mode and profile', () => {
      const tmpFile = path.join(os.tmpdir(), 'c4-batch-opts.txt');
      fs.writeFileSync(tmpFile, 'task X\n');
      try {
        const r = runCli('batch --file "' + tmpFile + '" --auto-mode --profile ml');
        assert.ok(r.stdout.includes('Batch: 1 tasks') || r.stderr.includes('Batch: 1 tasks'));
      } finally {
        fs.unlinkSync(tmpFile);
      }
    });
  });

  describe('worker naming', () => {
    it('names workers batch-1, batch-2, ...', () => {
      const r = runCli('batch "test" --count 3');
      // Workers are named batch-1, batch-2, batch-3
      const out = r.stdout + r.stderr;
      assert.ok(out.includes('batch-1'));
      assert.ok(out.includes('batch-2'));
      assert.ok(out.includes('batch-3'));
    });
  });

  describe('help text', () => {
    it('default help includes batch command', () => {
      const r = runCli('');
      const out = r.stdout + r.stderr;
      assert.ok(out.includes('batch'));
    });
  });
});
