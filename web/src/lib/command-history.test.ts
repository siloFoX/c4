import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  COMMAND_HISTORY_MAX,
  COMMAND_HISTORY_STORAGE_KEY,
  clearCommandHistory,
  getCommandHistory,
  recordCommandHistory,
} from './command-history';

beforeEach(() => {
  window.localStorage.removeItem(COMMAND_HISTORY_STORAGE_KEY);
});

afterEach(() => {
  window.localStorage.removeItem(COMMAND_HISTORY_STORAGE_KEY);
});

describe('command-history module', () => {
  it('returns an empty list when localStorage is empty', () => {
    expect(getCommandHistory()).toEqual([]);
  });

  it('records a single entry newest-first', () => {
    recordCommandHistory({ id: 'nav:settings', label: 'Settings', section: 'Navigate', at: 1000 });
    const out = getCommandHistory();
    expect(out.length).toBe(1);
    expect(out[0]?.id).toBe('nav:settings');
    expect(out[0]?.section).toBe('Navigate');
    expect(out[0]?.at).toBe(1000);
  });

  it('prepends additional entries (newest first)', () => {
    recordCommandHistory({ id: 'a', label: 'A', section: 'Navigate', at: 100 });
    recordCommandHistory({ id: 'b', label: 'B', section: 'Workers', at: 200 });
    recordCommandHistory({ id: 'c', label: 'C', section: 'Queue', at: 300 });
    const ids = getCommandHistory().map((e) => e.id);
    expect(ids).toEqual(['c', 'b', 'a']);
  });

  it('keeps duplicates so the same command can appear multiple times', () => {
    recordCommandHistory({ id: 'x', label: 'X', section: 'Workers', at: 100 });
    recordCommandHistory({ id: 'x', label: 'X', section: 'Workers', at: 200 });
    recordCommandHistory({ id: 'x', label: 'X', section: 'Workers', at: 300 });
    const out = getCommandHistory();
    expect(out.length).toBe(3);
    expect(out.every((e) => e.id === 'x')).toBe(true);
    expect(out.map((e) => e.at)).toEqual([300, 200, 100]);
  });

  it('caps the log at COMMAND_HISTORY_MAX (FIFO eviction)', () => {
    for (let i = 0; i < COMMAND_HISTORY_MAX + 10; i += 1) {
      recordCommandHistory({ id: `id-${i}`, label: `L${i}`, section: 'Navigate', at: i });
    }
    const out = getCommandHistory();
    expect(out.length).toBe(COMMAND_HISTORY_MAX);
    // Newest entry first.
    expect(out[0]?.id).toBe(`id-${COMMAND_HISTORY_MAX + 9}`);
    // Oldest surviving entry is exactly 10 in.
    expect(out[out.length - 1]?.id).toBe(`id-${10}`);
  });

  it('defaults to Date.now() when the at field is omitted', () => {
    const before = Date.now();
    recordCommandHistory({ id: 'now', label: 'Now', section: 'Workers' });
    const after = Date.now();
    const at = getCommandHistory()[0]?.at ?? -1;
    expect(at).toBeGreaterThanOrEqual(before);
    expect(at).toBeLessThanOrEqual(after);
  });

  it('clearCommandHistory empties the log', () => {
    recordCommandHistory({ id: 'a', label: 'A', section: 'Navigate', at: 100 });
    clearCommandHistory();
    expect(getCommandHistory()).toEqual([]);
  });

  it('ignores malformed JSON in localStorage and returns an empty list', () => {
    window.localStorage.setItem(COMMAND_HISTORY_STORAGE_KEY, 'not-json');
    expect(getCommandHistory()).toEqual([]);
  });

  it('ignores rows with the wrong shape (missing fields / wrong types)', () => {
    window.localStorage.setItem(
      COMMAND_HISTORY_STORAGE_KEY,
      JSON.stringify([
        { id: 'good', label: 'G', section: 'Navigate', at: 100 },
        { id: 'no-label', section: 'Navigate', at: 200 },
        { id: 1234, label: 'wrong-type', section: 'Navigate', at: 300 },
        { id: 'no-at', label: 'L', section: 'Navigate' },
      ]),
    );
    const out = getCommandHistory();
    expect(out.length).toBe(1);
    expect(out[0]?.id).toBe('good');
  });

  it('derives a stable key from id + at when persisted entries omit one', () => {
    recordCommandHistory({ id: 'k', label: 'K', section: 'Navigate', at: 42 });
    const out = getCommandHistory();
    expect(out[0]?.key).toBe('k-42');
  });
});
