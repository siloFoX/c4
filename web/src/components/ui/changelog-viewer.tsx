import {
  forwardRef,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import type { ForwardedRef, ReactNode } from 'react';
import { ChevronDown, ChevronRight, GitCompare } from 'lucide-react';
import { cn } from '../../lib/cn';

// (v1.11.446, TODO 11.428) ChangelogViewer primitive.
//
// Renders a version history list with per-version expand /
// collapse, grouped per-entry sections (`feat` / `fix` /
// `chore` / `docs` / `refactor` / `test` / `perf` /
// `breaking`), an optional diff link slot, and a pluggable
// markdown body renderer. Hosts that already ship a markdown
// engine pass it in via the `renderMarkdown` prop; otherwise
// the body renders as preformatted plain text.
//
// Reference: /root/c4/arps-design-system-v1/.

export type ChangelogEntryKind =
  | 'feat'
  | 'fix'
  | 'chore'
  | 'docs'
  | 'refactor'
  | 'test'
  | 'perf'
  | 'breaking';

export interface ChangelogEntry {
  kind: ChangelogEntryKind;
  message: string;
  scope?: string;
  prNumber?: number;
  prHref?: string;
}

export interface ChangelogVersion {
  version: string;
  date?: string;
  title?: string;
  entries: ChangelogEntry[];
  body?: string;
  diffHref?: string;
}

export interface ChangelogViewerProps {
  versions: ChangelogVersion[];
  defaultExpandedVersions?: readonly string[];
  expandedVersions?: readonly string[];
  onExpandedChange?: (versions: string[]) => void;
  ariaLabel?: string;
  className?: string;
  renderMarkdown?: (text: string) => ReactNode;
  showDiffLinks?: boolean;
  emptyState?: ReactNode;
  // First version expanded by default. Independent of
  // `defaultExpandedVersions`; when both are provided the
  // explicit list wins.
  expandFirstByDefault?: boolean;
}

// ---------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------

export const CHANGELOG_ENTRY_KINDS: readonly ChangelogEntryKind[] = [
  'breaking',
  'feat',
  'fix',
  'perf',
  'refactor',
  'docs',
  'test',
  'chore',
];

export const CHANGELOG_ENTRY_LABELS: Record<ChangelogEntryKind, string> =
  {
    breaking: 'Breaking',
    feat: 'Features',
    fix: 'Fixes',
    perf: 'Performance',
    refactor: 'Refactors',
    docs: 'Docs',
    test: 'Tests',
    chore: 'Chores',
  };

export type ChangelogEntryGroups = Record<
  ChangelogEntryKind,
  ChangelogEntry[]
>;

export function groupEntriesByKind(
  entries: readonly ChangelogEntry[],
): ChangelogEntryGroups {
  const out: ChangelogEntryGroups = {
    breaking: [],
    feat: [],
    fix: [],
    perf: [],
    refactor: [],
    docs: [],
    test: [],
    chore: [],
  };
  for (const entry of entries) {
    if (entry.kind in out) {
      out[entry.kind].push(entry);
    } else {
      out.chore.push(entry);
    }
  }
  return out;
}

export function formatVersionTitle(
  version: string,
  date?: string,
): string {
  const label = `v${version}`;
  if (!date) return label;
  return `${label} - ${date}`;
}

export function sortVersionsDescending(
  versions: readonly ChangelogVersion[],
): ChangelogVersion[] {
  return [...versions].sort((a, b) => {
    const aTime = parseVersionDate(a.date);
    const bTime = parseVersionDate(b.date);
    if (aTime !== bTime) return bTime - aTime;
    // Fall back to lexicographic version order (newest first).
    return b.version.localeCompare(a.version);
  });
}

function parseVersionDate(value: string | undefined): number {
  if (!value) return 0;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

// ---------------------------------------------------------------
// Component
// ---------------------------------------------------------------

const KIND_BADGE_CLASS: Record<ChangelogEntryKind, string> = {
  breaking: 'bg-destructive/15 text-destructive border-destructive/40',
  feat: 'bg-primary/15 text-primary border-primary/40',
  fix: 'bg-success/15 text-success border-success/40',
  perf: 'bg-warning/15 text-warning border-warning/40',
  refactor: 'bg-muted text-foreground border-border',
  docs: 'bg-muted text-foreground border-border',
  test: 'bg-muted text-foreground border-border',
  chore: 'bg-muted text-foreground border-border',
};

export const ChangelogViewer = forwardRef(function ChangelogViewer(
  {
    versions,
    defaultExpandedVersions,
    expandedVersions,
    onExpandedChange,
    ariaLabel = 'Changelog',
    className,
    renderMarkdown,
    showDiffLinks = true,
    emptyState = 'No release history',
    expandFirstByDefault = true,
  }: ChangelogViewerProps,
  ref: ForwardedRef<HTMLDivElement>,
) {
  const isControlled = expandedVersions !== undefined;

  const sorted = sortVersionsDescending(versions);
  const firstId = sorted[0]?.version;

  const [internalExpanded, setInternalExpanded] = useState<
    readonly string[]
  >(() => {
    if (defaultExpandedVersions !== undefined) {
      return [...defaultExpandedVersions];
    }
    if (expandFirstByDefault && firstId) return [firstId];
    return [];
  });
  const effective = isControlled
    ? (expandedVersions ?? [])
    : internalExpanded;

  const onExpandedChangeRef = useRef(onExpandedChange);
  useEffect(() => {
    onExpandedChangeRef.current = onExpandedChange;
  }, [onExpandedChange]);

  const emitExpanded = useCallback(
    (next: string[]) => {
      if (!isControlled) setInternalExpanded(next);
      onExpandedChangeRef.current?.(next);
    },
    [isControlled],
  );

  const toggleVersion = useCallback(
    (version: string) => {
      const current = effective;
      const next = current.includes(version)
        ? current.filter((v) => v !== version)
        : [...current, version];
      emitExpanded(next);
    },
    [effective, emitExpanded],
  );

  return (
    <div
      ref={ref}
      role="region"
      aria-label={ariaLabel}
      data-section="changelog-viewer"
      data-version-count={sorted.length}
      className={cn('flex w-full flex-col gap-2', className)}
    >
      {sorted.length === 0 ? (
        <div
          data-section="changelog-viewer-empty"
          className="rounded-md border border-border bg-muted/30 px-3 py-6 text-center text-sm text-muted-foreground"
        >
          {emptyState}
        </div>
      ) : (
        sorted.map((version) => {
          const isExpanded = effective.includes(version.version);
          const groups = groupEntriesByKind(version.entries);
          const headerId = `changelog-version-${version.version}`;
          const bodyId = `changelog-body-${version.version}`;
          return (
            <article
              key={version.version}
              data-section="changelog-viewer-version"
              data-version={version.version}
              data-expanded={isExpanded ? 'true' : 'false'}
              className="overflow-hidden rounded-md border border-border bg-card"
            >
              <header
                data-section="changelog-viewer-header"
                className="flex items-center gap-2 px-3 py-2"
              >
                <button
                  type="button"
                  id={headerId}
                  aria-expanded={isExpanded}
                  aria-controls={bodyId}
                  onClick={() => toggleVersion(version.version)}
                  data-section="changelog-viewer-toggle"
                  className="flex flex-1 items-center gap-2 rounded text-left text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                >
                  <span
                    aria-hidden="true"
                    data-section="changelog-viewer-chevron"
                  >
                    {isExpanded ? (
                      <ChevronDown className="h-4 w-4" />
                    ) : (
                      <ChevronRight className="h-4 w-4" />
                    )}
                  </span>
                  <span
                    data-section="changelog-viewer-version-label"
                    className="font-semibold"
                  >
                    {formatVersionTitle(version.version, version.date)}
                  </span>
                  {version.title !== undefined ? (
                    <span
                      data-section="changelog-viewer-version-title"
                      className="text-muted-foreground"
                    >
                      {version.title}
                    </span>
                  ) : null}
                </button>
                {showDiffLinks && version.diffHref ? (
                  <a
                    href={version.diffHref}
                    data-section="changelog-viewer-diff"
                    aria-label={`Diff for ${version.version}`}
                    className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs text-primary hover:underline focus-visible:outline-none focus-visible:underline"
                  >
                    <GitCompare aria-hidden="true" className="h-3 w-3" />
                    Diff
                  </a>
                ) : null}
              </header>
              {isExpanded ? (
                <div
                  id={bodyId}
                  role="region"
                  aria-labelledby={headerId}
                  data-section="changelog-viewer-body"
                  className="flex flex-col gap-3 border-t border-border bg-background px-3 py-3"
                >
                  {CHANGELOG_ENTRY_KINDS.map((kind) => {
                    const group = groups[kind];
                    if (group.length === 0) return null;
                    return (
                      <section
                        key={kind}
                        data-section="changelog-viewer-group"
                        data-kind={kind}
                        className="flex flex-col gap-1"
                      >
                        <h3
                          data-section="changelog-viewer-group-title"
                          className="text-xs font-semibold uppercase tracking-wide text-muted-foreground"
                        >
                          {CHANGELOG_ENTRY_LABELS[kind]}
                        </h3>
                        <ul
                          data-section="changelog-viewer-group-list"
                          className="flex flex-col gap-1"
                        >
                          {group.map((entry, idx) => (
                            <li
                              key={`${kind}-${idx}`}
                              data-section="changelog-viewer-entry"
                              data-entry-kind={entry.kind}
                              className="flex flex-wrap items-start gap-2 text-sm"
                            >
                              <span
                                aria-hidden="true"
                                data-section="changelog-viewer-entry-badge"
                                className={cn(
                                  'inline-flex items-center rounded border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide',
                                  KIND_BADGE_CLASS[entry.kind],
                                )}
                              >
                                {entry.kind}
                              </span>
                              {entry.scope !== undefined ? (
                                <span
                                  data-section="changelog-viewer-entry-scope"
                                  className="text-xs font-medium text-muted-foreground"
                                >
                                  {entry.scope}
                                </span>
                              ) : null}
                              <span
                                data-section="changelog-viewer-entry-message"
                                className="flex-1 text-foreground"
                              >
                                {entry.message}
                              </span>
                              {entry.prNumber !== undefined ? (
                                entry.prHref ? (
                                  <a
                                    href={entry.prHref}
                                    data-section="changelog-viewer-entry-pr"
                                    className="text-xs text-primary hover:underline"
                                  >
                                    #{entry.prNumber}
                                  </a>
                                ) : (
                                  <span
                                    data-section="changelog-viewer-entry-pr"
                                    className="text-xs text-muted-foreground"
                                  >
                                    #{entry.prNumber}
                                  </span>
                                )
                              ) : null}
                            </li>
                          ))}
                        </ul>
                      </section>
                    );
                  })}
                  {version.body !== undefined ? (
                    <div
                      data-section="changelog-viewer-markdown"
                      className="prose prose-sm max-w-none text-foreground"
                    >
                      {renderMarkdown ? (
                        renderMarkdown(version.body)
                      ) : (
                        <pre
                          data-section="changelog-viewer-markdown-fallback"
                          className="whitespace-pre-wrap rounded bg-muted/40 p-2 text-xs"
                        >
                          {version.body}
                        </pre>
                      )}
                    </div>
                  ) : null}
                </div>
              ) : null}
            </article>
          );
        })
      )}
    </div>
  );
});

ChangelogViewer.displayName = 'ChangelogViewer';
