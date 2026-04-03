const TerminalInterface = require('../src/terminal-interface');

describe('TerminalInterface', () => {
  let ti;

  beforeEach(() => {
    ti = new TerminalInterface();
  });

  // --- Trust prompt ---

  test('isTrustPrompt detects trust folder', () => {
    expect(ti.isTrustPrompt('Do you trust this folder?')).toBe(true);
    expect(ti.isTrustPrompt('Hello world')).toBe(false);
  });

  // --- Permission prompt ---

  test('isPermissionPrompt detects permission prompts', () => {
    expect(ti.isPermissionPrompt('Do you want to proceed?')).toBe(true);
    expect(ti.isPermissionPrompt('Do you want to create foo.js?')).toBe(true);
    expect(ti.isPermissionPrompt('Do you want to make this edit to bar.js?')).toBe(true);
    expect(ti.isPermissionPrompt('Hello world')).toBe(false);
  });

  // --- Ready / Model menu ---

  test('isReady detects ready prompt', () => {
    expect(ti.isReady('❯ Type a message... (Esc for shortcuts)')).toBe(true);
    expect(ti.isReady('❯ for shortcuts')).toBe(true);
    expect(ti.isReady('just text')).toBe(false);
  });

  test('isModelMenu detects model menu', () => {
    expect(ti.isModelMenu('Press arrows to adjust effort')).toBe(true);
    expect(ti.isModelMenu('hello world')).toBe(false);
  });

  // --- Prompt type ---

  test('getPromptType identifies create', () => {
    expect(ti.getPromptType('Do you want to create foo.js?')).toBe('create');
  });

  test('getPromptType identifies edit', () => {
    expect(ti.getPromptType('Do you want to make this edit to bar.js?')).toBe('edit');
  });

  test('getPromptType identifies bash', () => {
    expect(ti.getPromptType('Bash command\n  ls -la')).toBe('bash');
  });

  test('getPromptType returns unknown for unrecognized', () => {
    expect(ti.getPromptType('something else')).toBe('unknown');
  });

  // --- Extract bash command ---

  test('extractBashCommand extracts from Bash block', () => {
    const screen = [
      'Bash command',
      '  git status',
      'Do you want to proceed?',
    ].join('\n');
    expect(ti.extractBashCommand(screen)).toBe('git status');
  });

  test('extractBashCommand handles multi-line commands', () => {
    const screen = [
      'Bash command',
      '  git log',
      '  --oneline',
      'Do you want to proceed?',
    ].join('\n');
    expect(ti.extractBashCommand(screen)).toBe('git log --oneline');
  });

  test('extractBashCommand returns empty for no match', () => {
    expect(ti.extractBashCommand('no bash here')).toBe('');
  });

  // --- Extract file name ---

  test('extractFileName from create prompt', () => {
    expect(ti.extractFileName('Do you want to create test.js?')).toBe('test.js');
  });

  test('extractFileName from edit prompt', () => {
    expect(ti.extractFileName('Do you want to make this edit to src/app.js?')).toBe('src/app.js');
  });

  test('extractFileName returns empty for no match', () => {
    expect(ti.extractFileName('hello world')).toBe('');
  });

  // --- Count options ---

  test('countOptions counts numbered items', () => {
    const screen = '1. Yes\n2. No';
    expect(ti.countOptions(screen)).toBe(2);
  });

  test('countOptions for 3 options', () => {
    const screen = '1. Yes\n2. Yes, always\n3. No';
    expect(ti.countOptions(screen)).toBe(3);
  });

  test('countOptions defaults to 2', () => {
    expect(ti.countOptions('no numbers here')).toBe(2);
  });

  // --- Keystroke generation ---

  test('getApproveKeys returns Enter for simple approve', () => {
    expect(ti.getApproveKeys('1. Yes\n2. No')).toBe('\r');
  });

  test('getApproveKeys with alwaysApproveForSession selects option 2', () => {
    const tiSession = new TerminalInterface({}, { alwaysApproveForSession: true });
    expect(tiSession.getApproveKeys('1. Yes\n2. Yes always\n3. No')).toBe('\x1b[B\r');
  });

  test('getDenyKeys navigates to last option', () => {
    const keys = ti.getDenyKeys('1. Yes\n2. No');
    expect(keys).toBe('\x1b[B\r'); // Down + Enter
  });

  test('getDenyKeys for 3 options goes to last', () => {
    const keys = ti.getDenyKeys('1. Yes\n2. Yes always\n3. No');
    expect(keys).toBe('\x1b[B\x1b[B\r'); // Down + Down + Enter
  });

  test('getTrustKeys returns Enter', () => {
    expect(ti.getTrustKeys()).toBe('\r');
  });

  test('getModelMenuKeys returns /model + Enter', () => {
    expect(ti.getModelMenuKeys()).toBe('/model\r');
  });

  test('getEscapeKey returns ESC', () => {
    expect(ti.getEscapeKey()).toBe('\x1b');
  });

  // --- Effort keys ---

  test('getEffortKeys for max (from high)', () => {
    const keys = ti.getEffortKeys('max');
    expect(keys).toBe('\x1b[C\r'); // Right + Enter
  });

  test('getEffortKeys for low (from high)', () => {
    const keys = ti.getEffortKeys('low');
    expect(keys).toBe('\x1b[D\x1b[D\r'); // Left + Left + Enter
  });

  test('getEffortKeys for high (default, no movement)', () => {
    const keys = ti.getEffortKeys('high');
    expect(keys).toBe('\r'); // Just Enter
  });

  test('getEffortKeys for medium (from high)', () => {
    const keys = ti.getEffortKeys('medium');
    expect(keys).toBe('\x1b[D\r'); // Left + Enter
  });

  // --- Custom patterns ---

  test('custom patterns override defaults', () => {
    const custom = new TerminalInterface({ trustPrompt: 'CUSTOM TRUST' });
    expect(custom.isTrustPrompt('CUSTOM TRUST')).toBe(true);
    expect(custom.isTrustPrompt('trust this folder')).toBe(false);
  });
});
