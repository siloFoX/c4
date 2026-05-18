// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  detectShortcutConflicts,
  formatShortcutConflicts,
  normalizeCombo,
  reportShortcutConflicts,
  type ShortcutSpec,
} from './shortcut-conflicts';
import { SHORTCUT_ROWS } from '../components/KeyboardShortcutsModal';

describe('normalizeCombo', () => {
  it('lower-cases single-key combos', () => {
    expect(normalizeCombo('A')).toBe('a');
    expect(normalizeCombo('Enter')).toBe('enter');
    expect(normalizeCombo('?')).toBe('?');
  });

  it('orders modifiers canonically (ctrl, alt, shift, meta)', () => {
    expect(normalizeCombo('Shift+Ctrl+B')).toBe('ctrl+shift+b');
    expect(normalizeCombo('Alt+Shift+Ctrl+Meta+X')).toBe(
      'ctrl+alt+shift+meta+x',
    );
    expect(normalizeCombo('Ctrl+Shift+B')).toBe('ctrl+shift+b');
  });

  it('collapses synonymous modifier names', () => {
    expect(normalizeCombo('Cmd+B')).toBe('meta+b');
    expect(normalizeCombo('Control+B')).toBe('ctrl+b');
    expect(normalizeCombo('Option+B')).toBe('alt+b');
    expect(normalizeCombo('Command+K')).toBe('meta+k');
    expect(normalizeCombo('Win+K')).toBe('meta+k');
  });

  it('handles chord combos with single-space step separators', () => {
    expect(normalizeCombo('g g')).toBe('g g');
    expect(normalizeCombo('g h')).toBe('g h');
    expect(normalizeCombo('Ctrl+K  P')).toBe('ctrl+k p');
  });

  it('treats empty / whitespace-only input as empty string', () => {
    expect(normalizeCombo('')).toBe('');
    expect(normalizeCombo('   ')).toBe('');
  });

  it('strips redundant whitespace + + symbols', () => {
    expect(normalizeCombo('  Ctrl + B  ')).toBe('ctrl+b');
    expect(normalizeCombo('Ctrl++B')).toBe('ctrl+b');
  });
});

describe('detectShortcutConflicts', () => {
  it('returns an empty array for an empty spec list', () => {
    expect(detectShortcutConflicts([])).toEqual([]);
  });

  it('returns an empty array when no two specs share a combo + scope', () => {
    const specs: ShortcutSpec[] = [
      { keys: 'Ctrl+B', action: 'toggleSidebar' },
      { keys: 'Ctrl+F', action: 'search' },
      { keys: '?', action: 'help' },
    ];
    expect(detectShortcutConflicts(specs)).toEqual([]);
  });

  it('reports a CONFLICT when two specs share combo + scope but DIFFERENT actions', () => {
    const specs: ShortcutSpec[] = [
      { keys: 'Ctrl+B', action: 'toggleSidebar' },
      { keys: 'Ctrl+B', action: 'somethingElse' },
    ];
    const conflicts = detectShortcutConflicts(specs);
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]?.kind).toBe('conflict');
    expect(conflicts[0]?.combo).toBe('ctrl+b');
    expect(conflicts[0]?.scope).toBe('global');
    expect(conflicts[0]?.specs).toHaveLength(2);
  });

  it('reports a DUPLICATE when two specs share combo + scope + action (likely copy-paste)', () => {
    const specs: ShortcutSpec[] = [
      { keys: 'Ctrl+B', action: 'toggleSidebar' },
      { keys: 'Ctrl+B', action: 'toggleSidebar' },
    ];
    const conflicts = detectShortcutConflicts(specs);
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]?.kind).toBe('duplicate');
  });

  it('does NOT report SYNONYMS (different combos -> same action)', () => {
    const specs: ShortcutSpec[] = [
      { keys: '?', action: 'help' },
      { keys: 'Shift+/', action: 'help' },
    ];
    // Different combos, same action -> synonym pattern,
    // no conflict.
    expect(detectShortcutConflicts(specs)).toEqual([]);
  });

  it('respects scope isolation (same combo in different scopes is OK)', () => {
    const specs: ShortcutSpec[] = [
      { keys: 'Ctrl+B', action: 'toggleSidebar', scope: 'global' },
      { keys: 'Ctrl+B', action: 'boldText', scope: 'chat-composer' },
    ];
    expect(detectShortcutConflicts(specs)).toEqual([]);
  });

  it('reports the conflict using the normalized combo string', () => {
    const specs: ShortcutSpec[] = [
      { keys: 'Shift+Ctrl+B', action: 'a' },
      { keys: 'Ctrl+Shift+B', action: 'b' },
    ];
    const conflicts = detectShortcutConflicts(specs);
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]?.combo).toBe('ctrl+shift+b');
  });

  it('treats Cmd+B and Ctrl+B as DIFFERENT combos (different physical keys)', () => {
    // Cmd is canonicalized to `meta`, Ctrl stays as
    // `ctrl`. Two operators on different platforms
    // pressing two different keys; that is not a
    // collision.
    const specs: ShortcutSpec[] = [
      { keys: 'Cmd+B', action: 'a' },
      { keys: 'Ctrl+B', action: 'b' },
    ];
    expect(detectShortcutConflicts(specs)).toEqual([]);
  });

  it('skips specs with empty / whitespace-only keys', () => {
    const specs: ShortcutSpec[] = [
      { keys: 'Ctrl+B', action: 'a' },
      { keys: '', action: 'b' },
      { keys: '   ', action: 'c' },
    ];
    expect(detectShortcutConflicts(specs)).toEqual([]);
  });

  it('groups three-way conflicts into a single report entry', () => {
    const specs: ShortcutSpec[] = [
      { keys: 'Enter', action: 'send' },
      { keys: 'Enter', action: 'submit' },
      { keys: 'Enter', action: 'confirm' },
    ];
    const conflicts = detectShortcutConflicts(specs);
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]?.kind).toBe('conflict');
    expect(conflicts[0]?.specs).toHaveLength(3);
  });
});

describe('formatShortcutConflicts', () => {
  it('returns an empty string when there are no conflicts', () => {
    expect(formatShortcutConflicts([])).toBe('');
  });

  it('includes kind, scope, combo, and each spec line', () => {
    const out = formatShortcutConflicts([
      {
        kind: 'conflict',
        scope: 'global',
        combo: 'ctrl+b',
        specs: [
          { keys: 'Ctrl+B', action: 'a' },
          { keys: 'Ctrl+B', action: 'b' },
        ],
      },
    ]);
    expect(out).toContain('[conflict]');
    expect(out).toContain('global::ctrl+b');
    expect(out).toContain('keys=Ctrl+B action=a');
    expect(out).toContain('keys=Ctrl+B action=b');
  });

  it('renders duplicate kind label distinctly', () => {
    const out = formatShortcutConflicts([
      {
        kind: 'duplicate',
        scope: 'global',
        combo: 'ctrl+b',
        specs: [
          { keys: 'Ctrl+B', action: 'a' },
          { keys: 'Ctrl+B', action: 'a' },
        ],
      },
    ]);
    expect(out).toContain('[duplicate]');
  });
});

describe('reportShortcutConflicts', () => {
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    warnSpy.mockRestore();
  });

  it('returns 0 + does not log when conflicts is empty', () => {
    expect(reportShortcutConflicts([])).toBe(0);
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('logs once + returns the conflict count when conflicts is non-empty', () => {
    const count = reportShortcutConflicts([
      {
        kind: 'conflict',
        scope: 'global',
        combo: 'ctrl+b',
        specs: [
          { keys: 'Ctrl+B', action: 'a' },
          { keys: 'Ctrl+B', action: 'b' },
        ],
      },
    ]);
    expect(count).toBe(1);
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy.mock.calls[0]?.[0]).toContain('[shortcut-conflicts]');
  });

  it('singular vs plural in the log header', () => {
    reportShortcutConflicts([
      {
        kind: 'conflict',
        scope: 'global',
        combo: 'a',
        specs: [
          { keys: 'A', action: 'x' },
          { keys: 'A', action: 'y' },
        ],
      },
    ]);
    expect(warnSpy.mock.calls[0]?.[0]).toContain('1 issue ');
    warnSpy.mockReset();
    reportShortcutConflicts([
      {
        kind: 'conflict',
        scope: 'global',
        combo: 'a',
        specs: [
          { keys: 'A', action: 'x' },
          { keys: 'A', action: 'y' },
        ],
      },
      {
        kind: 'duplicate',
        scope: 'global',
        combo: 'b',
        specs: [
          { keys: 'B', action: 'z' },
          { keys: 'B', action: 'z' },
        ],
      },
    ]);
    expect(warnSpy.mock.calls[0]?.[0]).toContain('2 issues ');
  });
});

// (v1.11.357, TODO 11.339) Integration audit against
// the canonical SHORTCUT_ROWS. A REAL conflict in the
// shipped list should fail CI immediately. Synonyms
// like `?` + `Shift+/` -> `shortcuts.openHelp` are
// allowed.
describe('shortcut-conflicts (integration: SHORTCUT_ROWS)', () => {
  it('the canonical SHORTCUT_ROWS list has no conflicting bindings', () => {
    const specs: ShortcutSpec[] = SHORTCUT_ROWS.map((r) => ({
      keys: r.keys,
      action: r.descriptionKey,
      scope: r.category,
    }));
    const conflicts = detectShortcutConflicts(specs);
    if (conflicts.length > 0) {
      throw new Error(
        `SHORTCUT_ROWS has ${conflicts.length} unresolved conflicts:\n${formatShortcutConflicts(conflicts)}`,
      );
    }
    expect(conflicts).toEqual([]);
  });
});
