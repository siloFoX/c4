'use strict';

// Tests for src/meeting-templates.js (multi-specialist phase 8.1).

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  listTemplates,
  getTemplate,
  saveTemplate,
  deleteTemplate,
  validateTemplate,
  expandVars,
  extractVarNames,
  isValidName,
  VALID_TRACKS,
  VALID_BRAINS,
} = require('../src/meeting-templates');

let passed = 0;
let failed = 0;
const pending = [];
function t(label, fn) {
  pending.push(async () => {
    try {
      await fn();
      passed += 1;
      console.log(`  PASS  ${label}`);
    } catch (err) {
      failed += 1;
      console.log(`  FAIL  ${label}\n        ${err.message}`);
      if (err.stack) console.log(err.stack.split('\n').slice(1, 4).join('\n'));
    }
  });
}

function makeTmp() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'c4-mtpl-'));
  return path.join(dir, 'templates.json');
}

t('module exports surface', () => {
  assert.strictEqual(typeof listTemplates, 'function');
  assert.strictEqual(typeof getTemplate, 'function');
  assert.strictEqual(typeof saveTemplate, 'function');
  assert.strictEqual(typeof deleteTemplate, 'function');
  assert.strictEqual(typeof validateTemplate, 'function');
  assert.deepStrictEqual([...VALID_TRACKS], ['lightweight', 'standard', 'full']);
  assert.deepStrictEqual([...VALID_BRAINS], ['mock', 'claude']);
});

t('isValidName accepts kebab-case 1..64', () => {
  assert.strictEqual(isValidName('rotate-secret'), true);
  assert.strictEqual(isValidName('a'), true);
  assert.strictEqual(isValidName('Bad-Cap'), false);
  assert.strictEqual(isValidName(''), false);
  assert.strictEqual(isValidName('a'.repeat(70)), false);
  assert.strictEqual(isValidName('-leading-dash'), false);
  assert.strictEqual(isValidName('1bad'), true);
});

t('validateTemplate rejects bad shapes', () => {
  assert.throws(() => validateTemplate(null), /must be an object/);
  assert.throws(() => validateTemplate({}), /name must be/);
  assert.throws(() => validateTemplate({ name: 'ok' }), /task must be/);
  assert.throws(() => validateTemplate({ name: 'ok', task: 'x', track: 'wat' }), /track must be/);
  assert.throws(() => validateTemplate({ name: 'ok', task: 'x', brain: 'wat' }), /brain must be/);
});

t('validateTemplate accepts a complete template', () => {
  assert.strictEqual(validateTemplate({
    name: 'rotate-secret',
    task: 'rotate auth secret in production',
    track: 'full',
    brain: 'claude',
    description: 'Quarterly secret rotation runbook',
    notes: 'Coordinate with SRE oncall',
  }), true);
});

t('listTemplates returns [] when file missing', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'c4-mtpl-empty-'));
  const templatesPath = path.join(dir, 'never.json');
  assert.deepStrictEqual(listTemplates({ templatesPath }), []);
});

t('saveTemplate persists then getTemplate reads back', () => {
  const templatesPath = makeTmp();
  const tpl = { name: 'fix-typo', task: 'fix typo in handler', track: 'lightweight' };
  const stamped = saveTemplate(tpl, { templatesPath });
  assert.strictEqual(stamped.name, 'fix-typo');
  assert.match(stamped.createdAt, /^\d{4}-/);
  assert.match(stamped.updatedAt, /^\d{4}-/);
  const fetched = getTemplate('fix-typo', { templatesPath });
  assert.strictEqual(fetched.task, 'fix typo in handler');
  assert.strictEqual(fetched.track, 'lightweight');
});

t('saveTemplate updates existing by name', () => {
  const templatesPath = makeTmp();
  saveTemplate({ name: 'k', task: 't1' }, { templatesPath });
  saveTemplate({ name: 'k', task: 't2' }, { templatesPath });
  const list = listTemplates({ templatesPath });
  assert.strictEqual(list.length, 1);
  assert.strictEqual(list[0].task, 't2');
});

t('deleteTemplate returns true on hit, false on miss', () => {
  const templatesPath = makeTmp();
  saveTemplate({ name: 'doomed', task: 'gone' }, { templatesPath });
  assert.strictEqual(deleteTemplate('doomed', { templatesPath }), true);
  assert.strictEqual(deleteTemplate('doomed', { templatesPath }), false);
  assert.deepStrictEqual(listTemplates({ templatesPath }), []);
});

t('listTemplates preserves insertion order across saves', () => {
  const templatesPath = makeTmp();
  saveTemplate({ name: 'a', task: 'a-task' }, { templatesPath });
  saveTemplate({ name: 'b', task: 'b-task' }, { templatesPath });
  saveTemplate({ name: 'c', task: 'c-task' }, { templatesPath });
  const list = listTemplates({ templatesPath });
  assert.deepStrictEqual(list.map((t) => t.name), ['a', 'b', 'c']);
});

t('reading a corrupt JSON file returns [] (no throw)', () => {
  const templatesPath = makeTmp();
  fs.writeFileSync(templatesPath, '{ malformed');
  // Capture stderr to keep the test runner output clean.
  const orig = process.stderr.write;
  process.stderr.write = () => true;
  try {
    assert.deepStrictEqual(listTemplates({ templatesPath }), []);
  } finally {
    process.stderr.write = orig;
  }
});

// Phase 8.4 — parameterized templates.

t('extractVarNames returns deduped placeholder names', () => {
  assert.deepStrictEqual(
    extractVarNames('rotate {{service}} secret in {{env}} for {{service}}').sort(),
    ['env', 'service'],
  );
  assert.deepStrictEqual(extractVarNames('no vars here'), []);
  assert.deepStrictEqual(extractVarNames(null), []);
});

t('expandVars substitutes provided values, leaves placeholders for missing', () => {
  const r = expandVars('rotate {{service}} secret in {{env}}', { service: 'auth' });
  assert.strictEqual(r.task, 'rotate auth secret in {{env}}');
  assert.deepStrictEqual(r.missing, ['env']);
  assert.deepStrictEqual(r.replaced, ['service']);
});

t('expandVars handles all-supplied case cleanly', () => {
  const r = expandVars('rotate {{service}} secret in {{env}}', { service: 'auth', env: 'prod' });
  assert.strictEqual(r.task, 'rotate auth secret in prod');
  assert.deepStrictEqual(r.missing, []);
  assert.deepStrictEqual(r.replaced.sort(), ['env', 'service']);
});

t('expandVars tolerates whitespace inside braces', () => {
  const r = expandVars('{{ var_a }} and {{var_b}}', { var_a: 'x', var_b: 'y' });
  assert.strictEqual(r.task, 'x and y');
});

t('expandVars skips bracket-only / double-bracket noise', () => {
  // {{}} (no name), { {x} } (single braces), {{1bad}} (bad ident) — pass through.
  const r = expandVars('{{}} { {x} } {{1bad}} {{ok}}', { ok: 'OK', '1bad': 'no' });
  assert.strictEqual(r.task, '{{}} { {x} } {{1bad}} OK');
  assert.deepStrictEqual(r.replaced, ['ok']);
});

t('expandVars handles non-string input', () => {
  assert.deepStrictEqual(expandVars(null), { task: null, missing: [], replaced: [] });
  assert.deepStrictEqual(expandVars(undefined, {}), { task: undefined, missing: [], replaced: [] });
});

(async () => {
  for (const fn of pending) await fn();
  console.log(`\n  ${passed} passed, ${failed} failed (meeting-templates)`);
  if (failed > 0) process.exit(1);
})();
