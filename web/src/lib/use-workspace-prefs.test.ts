import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  WORKSPACE_ALIASES_KEY,
  WORKSPACE_ORDER_KEY,
  applyWorkspaceOrder,
  clearWorkspaceAlias,
  clearWorkspacePrefs,
  getWorkspacePrefs,
  setWorkspaceAlias,
  setWorkspaceOrder,
} from './use-workspace-prefs';

beforeEach(() => {
  window.localStorage.removeItem(WORKSPACE_ORDER_KEY);
  window.localStorage.removeItem(WORKSPACE_ALIASES_KEY);
});

afterEach(() => {
  window.localStorage.removeItem(WORKSPACE_ORDER_KEY);
  window.localStorage.removeItem(WORKSPACE_ALIASES_KEY);
});

describe('use-workspace-prefs storage', () => {
  it('defaults to empty order + aliases', () => {
    const prefs = getWorkspacePrefs();
    expect(prefs.order).toEqual([]);
    expect(prefs.aliases).toEqual({});
  });

  it('persists order via setWorkspaceOrder', () => {
    setWorkspaceOrder(['b', 'a', 'c']);
    expect(getWorkspacePrefs().order).toEqual(['b', 'a', 'c']);
  });

  it('filters non-string values out of the persisted order', () => {
    setWorkspaceOrder(['x', 'y']);
    window.localStorage.setItem(
      WORKSPACE_ORDER_KEY,
      JSON.stringify(['x', 42, null, 'z']),
    );
    expect(getWorkspacePrefs().order).toEqual(['x', 'z']);
  });

  it('returns empty order when JSON is malformed', () => {
    window.localStorage.setItem(WORKSPACE_ORDER_KEY, 'not-json');
    expect(getWorkspacePrefs().order).toEqual([]);
  });

  it('persists aliases via setWorkspaceAlias', () => {
    setWorkspaceAlias('arps', 'Workshop');
    expect(getWorkspacePrefs().aliases).toEqual({ arps: 'Workshop' });
  });

  it('trims the alias before persisting', () => {
    setWorkspaceAlias('arps', '   Padded   ');
    expect(getWorkspacePrefs().aliases.arps).toBe('Padded');
  });

  it('empty alias removes the entry', () => {
    setWorkspaceAlias('arps', 'Workshop');
    setWorkspaceAlias('arps', '');
    expect(getWorkspacePrefs().aliases).toEqual({});
  });

  it('clearWorkspaceAlias also removes the entry', () => {
    setWorkspaceAlias('arps', 'Workshop');
    clearWorkspaceAlias('arps');
    expect(getWorkspacePrefs().aliases).toEqual({});
  });

  it('clearWorkspacePrefs wipes both slots', () => {
    setWorkspaceOrder(['a']);
    setWorkspaceAlias('a', 'A');
    clearWorkspacePrefs();
    expect(getWorkspacePrefs()).toEqual({ order: [], aliases: {} });
  });

  it('ignores malformed alias JSON without throwing', () => {
    window.localStorage.setItem(WORKSPACE_ALIASES_KEY, '[not-an-object]');
    expect(getWorkspacePrefs().aliases).toEqual({});
  });

  it('ignores non-string alias values', () => {
    window.localStorage.setItem(
      WORKSPACE_ALIASES_KEY,
      JSON.stringify({ good: 'Good Name', bad: 42 }),
    );
    expect(getWorkspacePrefs().aliases).toEqual({ good: 'Good Name' });
  });
});

describe('applyWorkspaceOrder', () => {
  type Row = { name: string; payload: number };
  const source: Row[] = [
    { name: 'alpha', payload: 1 },
    { name: 'beta', payload: 2 },
    { name: 'gamma', payload: 3 },
  ];

  it('returns a clone of the source when order is empty', () => {
    const out = applyWorkspaceOrder(source, []);
    expect(out).toEqual(source);
    expect(out).not.toBe(source);
  });

  it('reorders rows by the supplied id list', () => {
    const out = applyWorkspaceOrder(source, ['gamma', 'alpha', 'beta']);
    expect(out.map((r) => r.name)).toEqual(['gamma', 'alpha', 'beta']);
  });

  it('appends source rows that are missing from the order at the end', () => {
    const out = applyWorkspaceOrder(source, ['beta']);
    expect(out.map((r) => r.name)).toEqual(['beta', 'alpha', 'gamma']);
  });

  it('drops order entries that no longer exist in source', () => {
    const out = applyWorkspaceOrder(source, ['phantom', 'beta', 'alpha']);
    expect(out.map((r) => r.name)).toEqual(['beta', 'alpha', 'gamma']);
  });

  it('de-duplicates repeated order ids', () => {
    const out = applyWorkspaceOrder(source, ['beta', 'beta', 'alpha']);
    expect(out.map((r) => r.name)).toEqual(['beta', 'alpha', 'gamma']);
  });
});
