// (v1.11.375, TODO 11.357) Settings page redesign --
// section grouping + search-filter helpers.
//
// The existing pages/Settings.tsx surfaces seven
// tabs (general / theme / density / scribe /
// notifications / locale / feature-flags) that
// the dispatch wants regrouped into four canonical
// segments: Account, Appearance, Shortcuts,
// Advanced. This module ships the pure helpers
// that drive both the new grouping and a search
// filter; pages/Settings.tsx adopts them in a
// follow-up patch (the page has a 47-case test
// suite that would expand the diff well past the
// scope of this primitive).

export type SettingsGroup =
  | 'account'
  | 'appearance'
  | 'shortcuts'
  | 'advanced';

export const SETTINGS_GROUP_VALUES: readonly SettingsGroup[] = [
  'account',
  'appearance',
  'shortcuts',
  'advanced',
] as const;

export interface SettingsSection {
  // Stable id used as the slug + the test selector
  // hook. Snake-case ids match the existing
  // pages/Settings.tsx tab keys
  // (`general`, `theme`, etc).
  id: string;
  // Human-readable label rendered as the section
  // header.
  title: string;
  // Optional short description rendered under the
  // title (search also matches against this).
  description?: string;
  // Canonical group the section belongs to. The
  // four canonical groups follow the dispatch:
  // account / appearance / shortcuts / advanced.
  group: SettingsGroup;
  // Keywords that should match the search filter
  // in addition to the title + description. Use
  // for synonyms ('logout' -> 'sign out',
  // 'palette' -> 'theme color').
  keywords?: readonly string[];
  // Optional priority within the group; lower
  // sorts first. Defaults to insertion order (no
  // sort key applied).
  priority?: number;
  // Optional badge text rendered next to the
  // title (e.g. 'New', 'Beta').
  badge?: string;
}

// Canonical group labels rendered as the section
// headers. Adopters i18n-flip if needed via the
// existing `t()` helper.
export const SETTINGS_GROUP_LABEL: Record<SettingsGroup, string> = {
  account: 'Account',
  appearance: 'Appearance',
  shortcuts: 'Shortcuts',
  advanced: 'Advanced',
};

export interface GroupedSettings {
  group: SettingsGroup;
  label: string;
  sections: SettingsSection[];
}

// Splits the section list into the four canonical
// groups. Empty groups are dropped from the output.
// Within a group the order follows: sections with
// a `priority` first (ascending), then sections
// without a `priority` in the source order.
export function groupSections(
  sections: readonly SettingsSection[],
): GroupedSettings[] {
  const buckets = new Map<SettingsGroup, SettingsSection[]>();
  for (const group of SETTINGS_GROUP_VALUES) {
    buckets.set(group, []);
  }
  for (const section of sections) {
    const bucket = buckets.get(section.group);
    if (!bucket) continue;
    bucket.push(section);
  }
  const out: GroupedSettings[] = [];
  for (const group of SETTINGS_GROUP_VALUES) {
    const list = buckets.get(group) ?? [];
    if (list.length === 0) continue;
    list.sort((a, b) => {
      const pa = a.priority;
      const pb = b.priority;
      if (pa == null && pb == null) return 0;
      if (pa == null) return 1;
      if (pb == null) return -1;
      return pa - pb;
    });
    out.push({
      group,
      label: SETTINGS_GROUP_LABEL[group],
      sections: list,
    });
  }
  return out;
}

// Normalises a search query into the search
// tokens. Trims, lower-cases, and splits on
// whitespace. Adopters call this on the input
// they type into the filter box.
export function normalizeSearchQuery(query: string): string[] {
  return query
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter((token) => token.length > 0);
}

function buildHaystack(section: SettingsSection): string {
  const parts: string[] = [section.id, section.title];
  if (section.description) parts.push(section.description);
  if (section.keywords) parts.push(...section.keywords);
  parts.push(section.group);
  return parts.join(' ').toLowerCase();
}

// Filters the section list against the query.
// Every token in the query must appear somewhere
// in the section's haystack (id / title /
// description / keywords / group). Empty query
// returns the full list unchanged.
export function filterSections(
  sections: readonly SettingsSection[],
  query: string,
): SettingsSection[] {
  const tokens = normalizeSearchQuery(query);
  if (tokens.length === 0) return [...sections];
  return sections.filter((section) => {
    const haystack = buildHaystack(section);
    return tokens.every((token) => haystack.includes(token));
  });
}

// Convenience helper that combines filter + group
// into one pass: returns the canonical grouped
// shape with sections that match the query.
// Empty groups are dropped.
export function filterAndGroupSections(
  sections: readonly SettingsSection[],
  query: string,
): GroupedSettings[] {
  const filtered = filterSections(sections, query);
  return groupSections(filtered);
}

// Returns the canonical sections that the existing
// pages/Settings.tsx tab list maps to. Used by
// adopters that want the new grouping without
// re-declaring every entry.
export const CANONICAL_SETTINGS_SECTIONS: readonly SettingsSection[] = [
  {
    id: 'general',
    title: 'General',
    description:
      'Live daemon config sans secrets. Links to the Config page editor + reload trigger.',
    group: 'advanced',
    keywords: ['config', 'reload', 'daemon'],
    priority: 0,
  },
  {
    id: 'theme',
    title: 'Theme',
    description:
      'Light / dark / system color scheme. Selection persists to localStorage c4:theme.',
    group: 'appearance',
    keywords: ['colour', 'palette', 'dark mode', 'light mode'],
    priority: 0,
  },
  {
    id: 'density',
    title: 'Density',
    description:
      'Compact / comfortable / cozy spacing scale. Persists to localStorage c4:density.',
    group: 'appearance',
    keywords: ['spacing', 'rows', 'padding'],
    priority: 1,
  },
  {
    id: 'scribe',
    title: 'Scribe',
    description: 'Session context recorder; start / stop / scan controls.',
    group: 'advanced',
    keywords: ['session', 'recorder', 'capture'],
    priority: 1,
  },
  {
    id: 'notifications',
    title: 'Notifications',
    description: 'Lifecycle feed and per-event filters for dispatch / complete / halt / escalation.',
    group: 'account',
    keywords: ['alert', 'webhook', 'slack', 'discord'],
    priority: 0,
  },
  {
    id: 'locale',
    title: 'Locale',
    description: 'Display language for the dashboard. Persists in this browser.',
    group: 'account',
    keywords: ['language', 'i18n', 'translation'],
    priority: 1,
  },
  {
    id: 'feature-flags',
    title: 'Feature Flags',
    description: 'Per-flag rollout state + percentage controls.',
    group: 'advanced',
    keywords: ['flag', 'rollout', 'percentage'],
    priority: 2,
  },
  {
    id: 'shortcuts',
    title: 'Keyboard shortcuts',
    description: 'Canonical SHORTCUT_ROWS reference + conflict banner.',
    group: 'shortcuts',
    keywords: ['key', 'kbd', 'binding'],
    priority: 0,
  },
];
