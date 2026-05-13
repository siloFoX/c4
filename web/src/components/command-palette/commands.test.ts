import { describe, it, expect, beforeEach } from 'vitest';
import { setLocale } from '../../lib/i18n';
import {
  SECTION_ORDER,
  buildPaletteCommands,
  filterCommands,
  match,
  type PaletteCommand,
} from './commands';

// Pure unit tests for the command catalog + the fuzzy matcher that
// powers the palette filter. CommandPalette.tsx has its own UI tests;
// this file isolates the data-layer contract so a regression in
// scoring/sort-order shows up here instead of as a flaky DOM diff.

beforeEach(() => {
  setLocale('en');
});

describe('match (fuzzy scorer)', () => {
  it('returns null when the query has no substring or acronym match', () => {
    expect(match('zzz', 'Auto')).toBeNull();
  });

  it('returns a high score for a prefix substring match', () => {
    const score = match('au', 'Auto');
    expect(score).toBeTypeOf('number');
    expect(score).toBeGreaterThan(700);
  });

  it('scores a prefix match higher than a non-prefix substring match', () => {
    const prefix = match('au', 'Auto') ?? -1;
    const mid = match('au', 'Plan auto') ?? -1;
    expect(prefix).toBeGreaterThan(mid);
    expect(mid).toBeGreaterThan(0);
  });

  it('matches an acronym built from token first letters', () => {
    expect(match('tu', 'Token usage')).not.toBeNull();
  });

  it('scores an acronym match lower than a substring match', () => {
    const sub = match('tok', 'Token usage') ?? -1;
    const acro = match('tu', 'Token usage') ?? -1;
    expect(sub).toBeGreaterThan(acro);
  });

  it('is case-insensitive on both the query and the label', () => {
    expect(match('AUTO', 'auto')).not.toBeNull();
    expect(match('auto', 'AUTO')).not.toBeNull();
  });

  it('matches a camelCase acronym', () => {
    expect(match('tu', 'TokenUsage')).not.toBeNull();
  });

  it('returns a positive number for an empty query (passthrough match)', () => {
    expect(match('', 'Anything')).toBeGreaterThan(0);
  });
});

describe('filterCommands (sort + filter)', () => {
  function fakeCommand(label: string): PaletteCommand {
    return {
      id: `fake:${label}`,
      label,
      section: 'Navigate',
      Icon: () => null,
      run: () => {},
    };
  }

  it('returns every command verbatim when the query is empty', () => {
    const cmds = [fakeCommand('Alpha'), fakeCommand('Beta')];
    expect(filterCommands(cmds, '')).toHaveLength(2);
  });

  it('drops commands that do not match the query', () => {
    const cmds = [fakeCommand('Alpha'), fakeCommand('Beta')];
    expect(filterCommands(cmds, 'zzz')).toEqual([]);
  });

  it('sorts by score descending so prefix matches come first', () => {
    const cmds = [fakeCommand('Plan auto'), fakeCommand('Auto')];
    const out = filterCommands(cmds, 'au');
    expect(out[0]?.label).toBe('Auto');
    expect(out[1]?.label).toBe('Plan auto');
  });

  it('breaks score ties by label ascending', () => {
    // Both labels prefix-match the query 'a' so the scores tie at the
    // top of the substring band — the tie-breaker is label ascending.
    const cmds = [fakeCommand('Anchor'), fakeCommand('Alpha')];
    const out = filterCommands(cmds, 'a');
    expect(out[0]?.label).toBe('Alpha');
    expect(out[1]?.label).toBe('Anchor');
  });
});

describe('buildPaletteCommands (catalog)', () => {
  it('exposes the documented section order Navigate, Workers, Queue', () => {
    expect([...SECTION_ORDER]).toEqual(['Navigate', 'Workers', 'Queue']);
  });

  it('emits at least 14 navigation entries (one per registered page)', () => {
    const all = buildPaletteCommands();
    const nav = all.filter((c) => c.section === 'Navigate');
    expect(nav.length).toBeGreaterThanOrEqual(14);
  });

  it('every navigation entry carries a label, an Icon, and a run() callable', () => {
    const all = buildPaletteCommands();
    for (const c of all.filter((c) => c.section === 'Navigate')) {
      expect(c.label).toBeTruthy();
      expect(c.Icon).toBeDefined();
      expect(c.run).toBeTypeOf('function');
    }
  });

  it('includes the canonical worker actions (new / close / list)', () => {
    const all = buildPaletteCommands();
    const ids = new Set(all.filter((c) => c.section === 'Workers').map((c) => c.id));
    expect(ids.has('workers:new')).toBe(true);
    expect(ids.has('workers:close')).toBe(true);
    expect(ids.has('workers:list')).toBe(true);
  });

  it('includes the canonical queue actions (tick / pause / resume)', () => {
    const all = buildPaletteCommands();
    const ids = new Set(all.filter((c) => c.section === 'Queue').map((c) => c.id));
    expect(ids.has('queue:tick')).toBe(true);
    expect(ids.has('queue:pause')).toBe(true);
    expect(ids.has('queue:resume')).toBe(true);
  });

  it('invokes navigateTopView when a navigation entry runs', () => {
    const calls: string[] = [];
    const all = buildPaletteCommands({
      navigateTopView: (v) => calls.push(v),
    });
    const auto = all.find((c) => c.id === 'nav:auto');
    expect(auto).toBeDefined();
    auto?.run();
    expect(calls).toContain('features');
  });

  it('routes "List workers" to the workers tab via navigateTopView', () => {
    const calls: string[] = [];
    const all = buildPaletteCommands({
      navigateTopView: (v) => calls.push(v),
    });
    const list = all.find((c) => c.id === 'workers:list');
    list?.run();
    expect(calls).toContain('workers');
  });
});
