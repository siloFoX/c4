'use strict';

// (1.11.159) Per-subcommand --help / -h output for the 8 most-used c4
// subcommands. The CLI exposes HELP_SPECS + formatSubcommandHelp so
// tests can validate the formatted text without spawning a child
// process. We additionally spawn `node src/cli.js <sub> --help` once
// per polished subcommand to confirm the intercept fires before the
// command dispatch and never touches the daemon.

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const CLI = path.resolve(__dirname, '..', 'src', 'cli.js');
const { HELP_SPECS, formatSubcommandHelp, maybePrintSubcommandHelp } = require(CLI);

const POLISHED = ['new', 'task', 'send', 'key', 'wait', 'list', 'merge', 'batch'];

describe('cli help: HELP_SPECS', () => {
  it('covers exactly the 8 polished subcommands', () => {
    assert.deepEqual(Object.keys(HELP_SPECS).sort(), POLISHED.slice().sort());
  });

  for (const name of POLISHED) {
    it(`${name}: spec has usage, description, examples`, () => {
      const spec = HELP_SPECS[name];
      assert.equal(typeof spec.usage, 'string');
      assert.ok(spec.usage.startsWith('c4 ' + name), `usage starts with 'c4 ${name}'`);
      assert.ok(spec.description.length > 20, 'description is non-trivial');
      assert.ok(Array.isArray(spec.examples) && spec.examples.length >= 2, 'at least 2 examples');
      for (const ex of spec.examples) {
        assert.ok(ex.includes('c4 ' + name), `example uses 'c4 ${name}'`);
      }
      assert.ok(Array.isArray(spec.options), 'options array present');
    });
  }
});

describe('cli help: formatSubcommandHelp', () => {
  for (const name of POLISHED) {
    it(`${name}: plain output contains Usage:, Examples:, and an example`, () => {
      const out = formatSubcommandHelp(HELP_SPECS[name], { color: false });
      assert.match(out, /Usage:/);
      assert.match(out, /Examples:/);
      assert.match(out, /Description:/);
      assert.ok(out.includes('  $ c4 ' + name), 'an example line is present');
      assert.ok(!out.includes('\x1b['), 'no ANSI escapes when color=false');
    });

    it(`${name}: color=true wraps section headers in ANSI bold`, () => {
      const out = formatSubcommandHelp(HELP_SPECS[name], { color: true });
      assert.match(out, /\x1b\[1mUsage:\x1b\[0m/);
      assert.match(out, /\x1b\[1mExamples:\x1b\[0m/);
    });
  }

  it('options rows are equal width up through the default column', () => {
    // After padEnd, every row should have identical character positions
    // for the start of the description column.
    const out = formatSubcommandHelp(HELP_SPECS.task, { color: false });
    const lines = out.split('\n').filter(l => l.startsWith('  --'));
    assert.ok(lines.length >= 2, 'multiple options to compare');
    const descStarts = lines.map(l => {
      // description starts after the def column; pick a stable marker
      // that exists on every row: the trailing description text begins
      // after the last run of 2+ spaces.
      const m = l.match(/^(.*?  )(\S.*?  \S.*?  \S.*?  )(\S.*)$/);
      return m ? m[1].length + m[2].length : -1;
    });
    assert.ok(descStarts.every(o => o > 0 && o === descStarts[0]),
      'description column starts at the same offset on every row');
  });
});

describe('cli help: maybePrintSubcommandHelp intercept', () => {
  it('returns true and writes when --help is present', () => {
    let buf = '';
    const stdout = { isTTY: false, write: (s) => { buf += s; } };
    const handled = maybePrintSubcommandHelp('task', ['--help'], { stdout });
    assert.equal(handled, true);
    assert.match(buf, /Usage: c4 task/);
  });

  it('returns true for -h short flag', () => {
    let buf = '';
    const stdout = { isTTY: false, write: (s) => { buf += s; } };
    const handled = maybePrintSubcommandHelp('list', ['-h'], { stdout });
    assert.equal(handled, true);
    assert.match(buf, /Usage: c4 list/);
  });

  it('returns false when no help flag is present', () => {
    let buf = '';
    const stdout = { isTTY: false, write: (s) => { buf += s; } };
    const handled = maybePrintSubcommandHelp('task', ['worker1', 'do stuff'], { stdout });
    assert.equal(handled, false);
    assert.equal(buf, '');
  });

  it('returns false for unpolished subcommands even with --help', () => {
    let buf = '';
    const stdout = { isTTY: false, write: (s) => { buf += s; } };
    const handled = maybePrintSubcommandHelp('rollback', ['--help'], { stdout });
    assert.equal(handled, false);
    assert.equal(buf, '');
  });
});

describe('cli help: spawned `node src/cli.js <sub> --help`', () => {
  for (const name of POLISHED) {
    it(`${name} --help exits 0 with the polished block`, () => {
      const r = spawnSync(process.execPath, [CLI, name, '--help'], {
        encoding: 'utf8',
        env: { ...process.env, FORCE_COLOR: '0', NO_COLOR: '1' },
      });
      assert.equal(r.status, 0, `exit code ok (stderr=${r.stderr})`);
      assert.match(r.stdout, /Usage:/);
      assert.match(r.stdout, /Examples:/);
      assert.ok(r.stdout.includes('  $ c4 ' + name), 'example line present');
    });
  }
});
