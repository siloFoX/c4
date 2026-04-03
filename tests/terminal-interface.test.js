const { describe, test, beforeEach } = require('node:test');
const assert = require('node:assert');
const TerminalInterface = require('../src/terminal-interface');

describe('TerminalInterface', () => {
  let ti;

  beforeEach(() => {
    ti = new TerminalInterface();
  });

  // --- Trust prompt ---

  test('isTrustPrompt detects trust folder', () => {
    assert.strictEqual(ti.isTrustPrompt('Do you trust this folder?'), true);
    assert.strictEqual(ti.isTrustPrompt('Hello world'), false);
  });

  // --- Permission prompt ---

  test('isPermissionPrompt detects permission prompts', () => {
    assert.strictEqual(ti.isPermissionPrompt('Do you want to proceed?'), true);
    assert.strictEqual(ti.isPermissionPrompt('Do you want to create foo.js?'), true);
    assert.strictEqual(ti.isPermissionPrompt('Do you want to make this edit to bar.js?'), true);
    assert.strictEqual(ti.isPermissionPrompt('Hello world'), false);
  });

  // --- Ready / Model menu ---

  test('isReady detects ready prompt', () => {
    assert.strictEqual(ti.isReady('\u276f Type a message... (Esc for shortcuts)'), true);
    assert.strictEqual(ti.isReady('\u276f for shortcuts'), true);
    assert.strictEqual(ti.isReady('just text'), false);
  });

  test('isModelMenu detects model menu', () => {
    assert.strictEqual(ti.isModelMenu('Press arrows to adjust effort'), true);
    assert.strictEqual(ti.isModelMenu('hello world'), false);
  });

  // --- Prompt type ---

  test('getPromptType identifies create', () => {
    assert.strictEqual(ti.getPromptType('Do you want to create foo.js?'), 'create');
  });

  test('getPromptType identifies edit', () => {
    assert.strictEqual(ti.getPromptType('Do you want to make this edit to bar.js?'), 'edit');
  });

  test('getPromptType identifies bash', () => {
    assert.strictEqual(ti.getPromptType('Bash command\n  ls -la'), 'bash');
  });

  test('getPromptType returns unknown for unrecognized', () => {
    assert.strictEqual(ti.getPromptType('something else'), 'unknown');
  });

  // --- Extract bash command ---

  test('extractBashCommand extracts from Bash block', () => {
    const screen = [
      'Bash command',
      '  git status',
      'Do you want to proceed?',
    ].join('\n');
    assert.strictEqual(ti.extractBashCommand(screen), 'git status');
  });

  test('extractBashCommand handles multi-line commands', () => {
    const screen = [
      'Bash command',
      '  git log',
      '  --oneline',
      'Do you want to proceed?',
    ].join('\n');
    assert.strictEqual(ti.extractBashCommand(screen), 'git log --oneline');
  });

  test('extractBashCommand returns empty for no match', () => {
    assert.strictEqual(ti.extractBashCommand('no bash here'), '');
  });

  // --- Extract file name ---

  test('extractFileName from create prompt', () => {
    assert.strictEqual(ti.extractFileName('Do you want to create test.js?'), 'test.js');
  });

  test('extractFileName from edit prompt', () => {
    assert.strictEqual(ti.extractFileName('Do you want to make this edit to src/app.js?'), 'src/app.js');
  });

  test('extractFileName returns empty for no match', () => {
    assert.strictEqual(ti.extractFileName('hello world'), '');
  });

  // --- Count options ---

  test('countOptions counts numbered items', () => {
    const screen = '1. Yes\n2. No';
    assert.strictEqual(ti.countOptions(screen), 2);
  });

  test('countOptions for 3 options', () => {
    const screen = '1. Yes\n2. Yes, always\n3. No';
    assert.strictEqual(ti.countOptions(screen), 3);
  });

  test('countOptions defaults to 2', () => {
    assert.strictEqual(ti.countOptions('no numbers here'), 2);
  });

  // --- Keystroke generation ---

  test('getApproveKeys returns Enter for simple approve', () => {
    assert.strictEqual(ti.getApproveKeys('1. Yes\n2. No'), '\r');
  });

  test('getApproveKeys with alwaysApproveForSession selects option 2', () => {
    const tiSession = new TerminalInterface({}, { alwaysApproveForSession: true });
    assert.strictEqual(tiSession.getApproveKeys('1. Yes\n2. Yes always\n3. No'), '\x1b[B\r');
  });

  test('getDenyKeys navigates to last option', () => {
    const keys = ti.getDenyKeys('1. Yes\n2. No');
    assert.strictEqual(keys, '\x1b[B\r'); // Down + Enter
  });

  test('getDenyKeys for 3 options goes to last', () => {
    const keys = ti.getDenyKeys('1. Yes\n2. Yes always\n3. No');
    assert.strictEqual(keys, '\x1b[B\x1b[B\r'); // Down + Down + Enter
  });

  test('getTrustKeys returns Enter', () => {
    assert.strictEqual(ti.getTrustKeys(), '\r');
  });

  test('getModelMenuKeys returns /model + Enter', () => {
    assert.strictEqual(ti.getModelMenuKeys(), '/model\r');
  });

  test('getEscapeKey returns ESC', () => {
    assert.strictEqual(ti.getEscapeKey(), '\x1b');
  });

  // --- Effort keys ---

  test('getEffortKeys for max (from high)', () => {
    const keys = ti.getEffortKeys('max');
    assert.strictEqual(keys, '\x1b[C\r'); // Right + Enter
  });

  test('getEffortKeys for low (from high)', () => {
    const keys = ti.getEffortKeys('low');
    assert.strictEqual(keys, '\x1b[D\x1b[D\r'); // Left + Left + Enter
  });

  test('getEffortKeys for high (default, no movement)', () => {
    const keys = ti.getEffortKeys('high');
    assert.strictEqual(keys, '\r'); // Just Enter
  });

  test('getEffortKeys for medium (from high)', () => {
    const keys = ti.getEffortKeys('medium');
    assert.strictEqual(keys, '\x1b[D\r'); // Left + Enter
  });

  // --- Custom patterns ---

  test('custom patterns override defaults', () => {
    const custom = new TerminalInterface({ trustPrompt: 'CUSTOM TRUST' });
    assert.strictEqual(custom.isTrustPrompt('CUSTOM TRUST'), true);
    assert.strictEqual(custom.isTrustPrompt('trust this folder'), false);
  });
});
