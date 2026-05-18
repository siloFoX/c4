import { describe, expect, it } from 'vitest';
import {
  CANONICAL_SETTINGS_SECTIONS,
  filterAndGroupSections,
  filterSections,
  groupSections,
  normalizeSearchQuery,
  SETTINGS_GROUP_LABEL,
  SETTINGS_GROUP_VALUES,
  type SettingsSection,
} from './settings-sections';

const SAMPLE: SettingsSection[] = [
  { id: 'theme', title: 'Theme', group: 'appearance', priority: 0 },
  { id: 'density', title: 'Density', group: 'appearance', priority: 1 },
  { id: 'locale', title: 'Locale', group: 'account' },
  { id: 'shortcuts', title: 'Keyboard shortcuts', group: 'shortcuts' },
  { id: 'general', title: 'General', group: 'advanced', priority: 0 },
];

describe('groupSections', () => {
  it('returns one entry per group with at least one section', () => {
    const grouped = groupSections(SAMPLE);
    const groups = grouped.map((g) => g.group);
    expect(groups).toEqual(['account', 'appearance', 'shortcuts', 'advanced']);
  });

  it('omits empty groups', () => {
    const only = SAMPLE.filter((s) => s.group === 'appearance');
    const grouped = groupSections(only);
    expect(grouped).toHaveLength(1);
    expect(grouped[0]?.group).toBe('appearance');
  });

  it('sorts within a group by priority ascending', () => {
    const grouped = groupSections([
      { id: 'b', title: 'B', group: 'appearance', priority: 2 },
      { id: 'a', title: 'A', group: 'appearance', priority: 1 },
    ]);
    expect(grouped[0]?.sections.map((s) => s.id)).toEqual(['a', 'b']);
  });

  it('keeps non-priority sections in source order after priority entries', () => {
    const grouped = groupSections([
      { id: 'no-prio', title: 'No prio', group: 'appearance' },
      { id: 'prio-0', title: 'Prio', group: 'appearance', priority: 0 },
    ]);
    expect(grouped[0]?.sections.map((s) => s.id)).toEqual([
      'prio-0',
      'no-prio',
    ]);
  });

  it('returns an empty list for no sections', () => {
    expect(groupSections([])).toEqual([]);
  });

  it('uses the canonical label per group', () => {
    const grouped = groupSections(SAMPLE);
    for (const entry of grouped) {
      expect(entry.label).toBe(SETTINGS_GROUP_LABEL[entry.group]);
    }
  });
});

describe('normalizeSearchQuery', () => {
  it('returns an empty list for empty input', () => {
    expect(normalizeSearchQuery('')).toEqual([]);
    expect(normalizeSearchQuery('   ')).toEqual([]);
  });

  it('lower-cases and splits on whitespace', () => {
    expect(normalizeSearchQuery('Theme Dark')).toEqual(['theme', 'dark']);
  });

  it('collapses multiple whitespace runs', () => {
    expect(normalizeSearchQuery('  foo   bar baz ')).toEqual([
      'foo',
      'bar',
      'baz',
    ]);
  });
});

describe('filterSections', () => {
  it('returns every section for an empty query', () => {
    expect(filterSections(SAMPLE, '')).toHaveLength(SAMPLE.length);
    expect(filterSections(SAMPLE, '   ')).toHaveLength(SAMPLE.length);
  });

  it('matches against id / title / group', () => {
    expect(filterSections(SAMPLE, 'theme').map((s) => s.id)).toEqual(['theme']);
    expect(filterSections(SAMPLE, 'account').map((s) => s.id)).toEqual([
      'locale',
    ]);
    expect(filterSections(SAMPLE, 'keyboard').map((s) => s.id)).toEqual([
      'shortcuts',
    ]);
  });

  it('matches against description + keywords', () => {
    const sections: SettingsSection[] = [
      {
        id: 'theme',
        title: 'Theme',
        description: 'Switch the color scheme.',
        group: 'appearance',
        keywords: ['dark mode', 'palette'],
      },
    ];
    expect(filterSections(sections, 'palette')).toHaveLength(1);
    expect(filterSections(sections, 'color')).toHaveLength(1);
  });

  it('requires every token to match (AND semantics)', () => {
    const sections: SettingsSection[] = [
      {
        id: 'theme',
        title: 'Theme',
        description: 'palette',
        group: 'appearance',
      },
      {
        id: 'density',
        title: 'Density',
        description: 'spacing',
        group: 'appearance',
      },
    ];
    expect(filterSections(sections, 'theme palette').map((s) => s.id)).toEqual([
      'theme',
    ]);
    expect(filterSections(sections, 'theme spacing')).toEqual([]);
  });

  it('is case-insensitive', () => {
    expect(filterSections(SAMPLE, 'GENERAL')).toHaveLength(1);
  });
});

describe('filterAndGroupSections', () => {
  it('returns the canonical grouped shape with matching sections', () => {
    const grouped = filterAndGroupSections(SAMPLE, 'theme');
    expect(grouped).toHaveLength(1);
    expect(grouped[0]?.group).toBe('appearance');
    expect(grouped[0]?.sections.map((s) => s.id)).toEqual(['theme']);
  });

  it('drops empty groups after filtering', () => {
    const grouped = filterAndGroupSections(SAMPLE, 'nothing-matches');
    expect(grouped).toEqual([]);
  });
});

describe('CANONICAL_SETTINGS_SECTIONS', () => {
  it('declares one section per existing Settings tab + the shortcuts surface', () => {
    const ids = CANONICAL_SETTINGS_SECTIONS.map((s) => s.id).sort();
    expect(ids).toEqual([
      'density',
      'feature-flags',
      'general',
      'locale',
      'notifications',
      'scribe',
      'shortcuts',
      'theme',
    ]);
  });

  it('covers all four canonical groups', () => {
    const groups = new Set(CANONICAL_SETTINGS_SECTIONS.map((s) => s.group));
    for (const g of SETTINGS_GROUP_VALUES) {
      expect(groups.has(g)).toBe(true);
    }
  });

  it('is searchable by its declared keywords', () => {
    const palette = filterSections(CANONICAL_SETTINGS_SECTIONS, 'palette');
    expect(palette.map((s) => s.id)).toContain('theme');
    const flag = filterSections(CANONICAL_SETTINGS_SECTIONS, 'flag');
    expect(flag.map((s) => s.id)).toContain('feature-flags');
  });
});
