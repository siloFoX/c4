import { useMemo, useState } from 'react';
import { RotateCcw, Sparkles } from 'lucide-react';
import PageFrame from './PageFrame';
import {
  AlertBanner,
  Badge,
  Button,
  CopyButton,
  FormField,
  Panel,
  SearchBar,
  Switch,
  Tabs,
  TagInput,
  Tooltip,
} from '../components/ui';
import type { TabsItem } from '../components/ui';
import { t, useLocale } from '../lib/i18n';
import {
  CATEGORY_LABELS,
  FLAGS,
  resetFlags,
  setFlag,
  useAllFlags,
} from '../lib/feature-flags';
import type { FeatureFlagCategory, FeatureFlagDef } from '../lib/feature-flags';

// (v1.11.216 / patch 11.198) Admin page for component-scoped UI feature
// flags. Lists every flag declared in lib/feature-flags.ts as a Panel
// row with a Switch on the right; Reset clears the persisted overrides
// and restores defaults. The page is the user-facing surface for the
// `c4:feature-flags` localStorage key + the `feature-flag-changed`
// CustomEvent that consumers subscribe to via useFeatureFlag().
//
// (v1.11.339, TODO 11.321) Redesign:
//   - Tabs strip filters the list by `category` (motion /
//     navigation / developer / all).
//   - Debounced SearchBar narrows the list by key / label /
//     description substring (composes with the tab + chips).
//   - Each row now uses FormField (horizontal) so the Switch
//     gets a proper label + helperText (= description)
//     binding. A Tooltip on the Switch surfaces the
//     description + default value on hover / focus so the
//     operator can predict what flipping the toggle will do
//     without scanning the helper line.
//   - The mono `key=` / `default=` line and CopyButton stay
//     under the FormField for traceability.

// (v1.11.339, TODO 11.321) Tab key type. The "all" tab is
// the default and bypasses category filtering.
export type FeatureFlagsTabKey = 'all' | FeatureFlagCategory;

const CATEGORY_ORDER: readonly FeatureFlagCategory[] = [
  'motion',
  'navigation',
  'developer',
];

export default function FeatureFlags() {
  useLocale();
  const values = useAllFlags();
  const customized = FLAGS.some((f) => values[f.key] !== f.defaultValue);

  // (v1.11.339, TODO 11.321) Category Tabs filter. Composes
  // with the debounced search + chip filters below.
  const [activeTab, setActiveTab] = useState<FeatureFlagsTabKey>('all');

  // (v1.11.339, TODO 11.321) Debounced search across key,
  // label, and description. Matches are case-insensitive
  // substrings; empty string disables the filter.
  const [search, setSearch] = useState('');

  // (v1.11.291, TODO 11.273) Operator-local "key filter chips" --
  // free-form substrings to filter the visible flag list. Multiple
  // chips read as OR (any chip-substring match keeps the flag in
  // the list). Empty list = no filter. Stored only in component
  // state since this is a transient sieve.
  const [filterTags, setFilterTags] = useState<string[]>([]);

  // (v1.11.339, TODO 11.321) Per-category counts, used by the
  // Tabs strip label chips and the "all" total.
  const categoryCounts = useMemo(() => {
    const base: Record<FeatureFlagCategory, number> = {
      motion: 0,
      navigation: 0,
      developer: 0,
    };
    for (const flag of FLAGS) {
      base[flag.category] += 1;
    }
    return { ...base, all: FLAGS.length };
  }, []);

  const tabItems = useMemo<TabsItem[]>(
    () => [
      {
        value: 'all',
        label: (
          <span className="inline-flex items-center gap-1.5">
            All
            <span
              data-testid="feature-flags-tab-count-all"
              className="inline-flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-muted px-1 text-[10px] text-muted-foreground"
            >
              {categoryCounts.all}
            </span>
          </span>
        ),
      },
      ...CATEGORY_ORDER.map<TabsItem>((cat) => ({
        value: cat,
        label: (
          <span className="inline-flex items-center gap-1.5">
            {CATEGORY_LABELS[cat]}
            <span
              data-testid={`feature-flags-tab-count-${cat}`}
              className="inline-flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-muted px-1 text-[10px] text-muted-foreground"
            >
              {categoryCounts[cat]}
            </span>
          </span>
        ),
      })),
    ],
    [categoryCounts],
  );

  // (v1.11.339, TODO 11.321) Composed filter. Active tab,
  // debounced search, and TagInput chips all apply together
  // (AND). An empty filter / "all" tab + zero chips + empty
  // search collapses to the prior full-list behaviour.
  const visibleFlags = useMemo<readonly FeatureFlagDef[]>(() => {
    const needle = search.trim().toLowerCase();
    return FLAGS.filter((flag) => {
      if (activeTab !== 'all' && flag.category !== activeTab) return false;
      if (needle) {
        const hay = `${flag.key}\n${flag.label}\n${flag.description}`.toLowerCase();
        if (!hay.includes(needle)) return false;
      }
      if (filterTags.length > 0) {
        const matched = filterTags.some(
          (tag) =>
            flag.key.toLowerCase().includes(tag.toLowerCase()) ||
            flag.label.toLowerCase().includes(tag.toLowerCase()),
        );
        if (!matched) return false;
      }
      return true;
    });
  }, [activeTab, search, filterTags]);

  return (
    <PageFrame
      title={t('feature.featureFlags.label')}
      description={t('feature.featureFlags.description')}
      actions={
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => resetFlags()}
          disabled={!customized}
        >
          <RotateCcw className="h-3.5 w-3.5" />
          <span>Reset</span>
        </Button>
      }
    >
      {/* (v1.11.275, TODO 11.257) AlertBanner replaces the
          inline Alert. The "experimental badge" framing -- these
          flags ship UI experiments that the operator opts into
          per browser -- is exactly the AlertBanner role=alert +
          aria-live polite contract. Sparkles icon stays as the
          experimental visual cue. */}
      <AlertBanner
        severity="info"
        icon={<Sparkles className="h-4 w-4" aria-hidden="true" />}
        title="Component-scoped flags"
        data-testid="feature-flags-experimental-banner"
      >
        These switches toggle browser-local UI behavior only. They persist
        in <code className="font-mono">localStorage</code> under{' '}
        <code className="font-mono">c4:feature-flags</code> and never round-trip
        to the daemon.
      </AlertBanner>

      {/* (v1.11.339, TODO 11.321) Toolbar block: category Tabs
          row, debounced SearchBar + filter chips below. All
          three filters compose (AND) so the operator can
          narrow to (motion category) + (search "transition")
          + (chip "page") in one move. */}
      <div className="flex flex-col gap-3" data-section="feature-flags-toolbar">
        <div data-testid="feature-flags-category-tabs">
          <Tabs
            value={activeTab}
            onChange={(value) => setActiveTab(value as FeatureFlagsTabKey)}
            items={tabItems}
            ariaLabel="Filter feature flags by category"
          />
        </div>

        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:gap-3">
          <SearchBar
            size="sm"
            placeholder="Search by key, label, or description"
            ariaLabel="Search feature flags"
            defaultValue={search}
            onDebouncedChange={setSearch}
            debounceMs={200}
            data-testid="feature-flags-search"
            className="w-full sm:max-w-xs"
          />

          {/* (v1.11.291, TODO 11.273) TagInput as filter chips
              above the flag list. Each chip is an OR-substring
              against the flag's key + label. Backspace removes
              the last chip; Enter / comma adds a new one. */}
          <div
            className="flex w-full flex-col gap-1"
            data-testid="feature-flags-filter-chips"
          >
            <span className="text-xs font-medium text-muted-foreground">
              Filter chips (substring match against key + label)
            </span>
            <TagInput
              value={filterTags}
              onChange={setFilterTags}
              maxTags={6}
              ariaLabel="Feature-flag filter chips"
              placeholder="Add chip..."
              normalize={(raw) => raw.trim().toLowerCase()}
            />
          </div>
        </div>
      </div>

      {visibleFlags.length === 0 ? (
        <p
          data-testid="feature-flags-empty-filter"
          className="rounded-md border border-dashed border-border bg-muted/30 px-4 py-6 text-center text-sm text-muted-foreground"
        >
          No flags match the current filter.
        </p>
      ) : (
        <ul className="flex flex-col gap-2" data-section="feature-flags-list">
          {visibleFlags.map((flag) => {
            const checked = values[flag.key];
            const overridden = checked !== flag.defaultValue;
            return (
              <li
                key={flag.key}
                data-testid={`feature-flag-row-${flag.key}`}
                data-flag-category={flag.category}
              >
                <Panel className="p-3">
                  {/* (v1.11.339, TODO 11.321) FormField wraps
                      the Switch so the description doubles as
                      the field's helperText -- aria-describedby
                      links the switch to the description for
                      screen readers automatically. */}
                  <FormField
                    label={flag.label}
                    helperText={flag.description}
                    layout="horizontal"
                  >
                    {/* (v1.11.339, TODO 11.321) Tooltip on the
                        Switch surfaces the description + default
                        value on hover / focus. The Switch itself
                        is already motion-aware (transition-transform
                        gated by useReducedMotion). */}
                    <Tooltip
                      label={`${flag.description} Default ${String(flag.defaultValue)}.`}
                    >
                      <span
                        className="inline-flex items-center gap-2"
                        data-testid={`feature-flag-control-${flag.key}`}
                      >
                        {overridden ? (
                          <Badge
                            variant="warning"
                            data-testid={`feature-flag-override-${flag.key}`}
                          >
                            override
                          </Badge>
                        ) : null}
                        <Switch
                          checked={checked}
                          onChange={(next) => setFlag(flag.key, next)}
                          aria-label={`Toggle ${flag.label}`}
                        />
                      </span>
                    </Tooltip>
                  </FormField>

                  {/* (v1.11.285, TODO 11.267) The flag key IS
                      the localStorage / config rule id; copy
                      button lets operators paste it into a
                      `setFlag('<key>', ...)` console line or a
                      config patch without retyping. */}
                  <p
                    className="mt-2 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground"
                    data-testid={`feature-flag-meta-${flag.key}`}
                  >
                    <span className="font-mono">
                      key=<span className="text-foreground">{flag.key}</span>
                    </span>
                    <CopyButton
                      value={flag.key}
                      label={`feature-flag key ${flag.key}`}
                      size="sm"
                      data-testid={`feature-flag-key-copy-${flag.key}`}
                    />
                    <span aria-hidden="true" className="text-muted-foreground/60">
                      &middot;
                    </span>
                    <span className="font-mono">
                      default={String(flag.defaultValue)}
                    </span>
                    <span aria-hidden="true" className="text-muted-foreground/60">
                      &middot;
                    </span>
                    <span className="font-mono">
                      category={flag.category}
                    </span>
                  </p>
                </Panel>
              </li>
            );
          })}
        </ul>
      )}
    </PageFrame>
  );
}
