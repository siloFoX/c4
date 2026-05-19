import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { createRef } from 'react';
import {
  CHANGELOG_ENTRY_KINDS,
  CHANGELOG_ENTRY_LABELS,
  ChangelogViewer,
  formatVersionTitle,
  groupEntriesByKind,
  sortVersionsDescending,
} from './changelog-viewer';
import type {
  ChangelogEntry,
  ChangelogVersion,
} from './changelog-viewer';

afterEach(() => {
  cleanup();
});

const ENTRIES: ChangelogEntry[] = [
  { kind: 'feat', message: 'Add login button' },
  { kind: 'feat', message: 'Add SSO support' },
  { kind: 'fix', message: 'Crash on empty list' },
  {
    kind: 'breaking',
    message: 'Remove legacy v1 API',
    scope: 'api',
    prNumber: 42,
    prHref: 'https://example/42',
  },
  { kind: 'chore', message: 'Bump deps' },
];

const VERSIONS: ChangelogVersion[] = [
  {
    version: '1.11.444',
    date: '2026-05-19',
    title: 'Feature tour ship',
    entries: ENTRIES,
    body: '# Tour ships\n- multi-step product tour\n',
    diffHref: 'https://example/diff/1.11.444',
  },
  {
    version: '1.11.443',
    date: '2026-05-18',
    entries: [
      { kind: 'fix', message: 'Layout regression' },
    ],
  },
  {
    version: '1.11.442',
    date: '2026-05-17',
    entries: [
      { kind: 'feat', message: 'Notification inbox' },
    ],
  },
];

// ---------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------

describe('groupEntriesByKind', () => {
  it('returns an object with all kinds as keys', () => {
    const groups = groupEntriesByKind([]);
    for (const k of CHANGELOG_ENTRY_KINDS) {
      expect(Array.isArray(groups[k])).toBe(true);
    }
  });
  it('partitions entries by kind', () => {
    const groups = groupEntriesByKind(ENTRIES);
    expect(groups.feat.length).toBe(2);
    expect(groups.fix.length).toBe(1);
    expect(groups.breaking.length).toBe(1);
    expect(groups.chore.length).toBe(1);
  });
  it('falls unknown kinds into chore', () => {
    const groups = groupEntriesByKind([
      { kind: 'mystery' as 'feat', message: 'x' },
    ]);
    expect(groups.feat.length).toBe(0);
    // Unknown kind falls into chore bucket
    expect(groups.chore.length).toBe(1);
  });
});

describe('formatVersionTitle', () => {
  it('prefixes v + version', () => {
    expect(formatVersionTitle('1.11.445')).toBe('v1.11.445');
  });
  it('appends date when supplied', () => {
    expect(formatVersionTitle('1.11.445', '2026-05-19')).toBe(
      'v1.11.445 - 2026-05-19',
    );
  });
});

describe('sortVersionsDescending', () => {
  it('newest first by date', () => {
    const sorted = sortVersionsDescending(VERSIONS);
    expect(sorted.map((v) => v.version)).toEqual([
      '1.11.444',
      '1.11.443',
      '1.11.442',
    ]);
  });
  it('falls back to lexicographic version sort when dates tie', () => {
    const sorted = sortVersionsDescending([
      { version: '1.0.1', date: '2026-01-01', entries: [] },
      { version: '1.0.2', date: '2026-01-01', entries: [] },
    ]);
    expect(sorted.map((v) => v.version)).toEqual([
      '1.0.2',
      '1.0.1',
    ]);
  });
  it('does not mutate the input', () => {
    const input = [...VERSIONS];
    sortVersionsDescending(input);
    expect(input.map((v) => v.version)).toEqual(
      VERSIONS.map((v) => v.version),
    );
  });
});

describe('Constants', () => {
  it('CHANGELOG_ENTRY_KINDS has 8 kinds', () => {
    expect(CHANGELOG_ENTRY_KINDS.length).toBe(8);
  });
  it('CHANGELOG_ENTRY_LABELS maps every kind', () => {
    for (const k of CHANGELOG_ENTRY_KINDS) {
      expect(CHANGELOG_ENTRY_LABELS[k]).toBeDefined();
    }
  });
});

// ---------------------------------------------------------------
// Component
// ---------------------------------------------------------------

describe('ChangelogViewer component', () => {
  it('renders a region with default aria-label', () => {
    render(<ChangelogViewer versions={VERSIONS} />);
    expect(screen.getByRole('region', { name: 'Changelog' })).toBeInTheDocument();
  });

  it('honors a custom ariaLabel', () => {
    render(
      <ChangelogViewer
        versions={VERSIONS}
        ariaLabel="Release history"
      />,
    );
    expect(
      screen.getByRole('region', { name: 'Release history' }),
    ).toBeInTheDocument();
  });

  it('renders one article per version', () => {
    const { container } = render(
      <ChangelogViewer versions={VERSIONS} />,
    );
    expect(
      container.querySelectorAll(
        '[data-section="changelog-viewer-version"]',
      ).length,
    ).toBe(3);
  });

  it('renders versions newest-first', () => {
    const { container } = render(
      <ChangelogViewer versions={VERSIONS} />,
    );
    const articles = container.querySelectorAll(
      '[data-section="changelog-viewer-version"]',
    );
    expect(articles[0]?.getAttribute('data-version')).toBe(
      '1.11.444',
    );
    expect(articles[2]?.getAttribute('data-version')).toBe(
      '1.11.442',
    );
  });

  it('version label includes v prefix + date', () => {
    render(<ChangelogViewer versions={VERSIONS} />);
    expect(
      screen.getByText('v1.11.444 - 2026-05-19'),
    ).toBeInTheDocument();
  });

  it('version title slot renders when supplied', () => {
    render(<ChangelogViewer versions={VERSIONS} />);
    expect(screen.getByText('Feature tour ship')).toBeInTheDocument();
  });

  it('expandFirstByDefault=true expands the newest version on mount', () => {
    const { container } = render(
      <ChangelogViewer versions={VERSIONS} />,
    );
    const first = container.querySelector(
      '[data-section="changelog-viewer-version"]',
    );
    expect(first?.getAttribute('data-expanded')).toBe('true');
  });

  it('expandFirstByDefault=false collapses everything on mount', () => {
    const { container } = render(
      <ChangelogViewer
        versions={VERSIONS}
        expandFirstByDefault={false}
      />,
    );
    const articles = container.querySelectorAll(
      '[data-section="changelog-viewer-version"]',
    );
    for (const art of Array.from(articles)) {
      expect(art.getAttribute('data-expanded')).toBe('false');
    }
  });

  it('defaultExpandedVersions seeds the open set (override)', () => {
    const { container } = render(
      <ChangelogViewer
        versions={VERSIONS}
        defaultExpandedVersions={['1.11.443']}
      />,
    );
    const v443 = container.querySelector(
      '[data-version="1.11.443"]',
    );
    const v444 = container.querySelector(
      '[data-version="1.11.444"]',
    );
    expect(v443?.getAttribute('data-expanded')).toBe('true');
    expect(v444?.getAttribute('data-expanded')).toBe('false');
  });

  it('toggle button flips expand state', () => {
    const { container } = render(
      <ChangelogViewer
        versions={VERSIONS}
        expandFirstByDefault={false}
      />,
    );
    const articles = container.querySelectorAll(
      '[data-section="changelog-viewer-version"]',
    );
    const toggle = articles[0]?.querySelector(
      '[data-section="changelog-viewer-toggle"]',
    ) as HTMLElement;
    fireEvent.click(toggle);
    expect(articles[0]?.getAttribute('data-expanded')).toBe('true');
  });

  it('toggle button aria-expanded mirrors state', () => {
    render(<ChangelogViewer versions={VERSIONS} />);
    const toggles = screen.getAllByRole('button');
    expect(toggles[0]).toHaveAttribute('aria-expanded', 'true');
    expect(toggles[1]).toHaveAttribute('aria-expanded', 'false');
  });

  it('onExpandedChange fires with the new list', () => {
    const onExpandedChange = vi.fn();
    render(
      <ChangelogViewer
        versions={VERSIONS}
        onExpandedChange={onExpandedChange}
      />,
    );
    const buttons = screen.getAllByRole('button');
    fireEvent.click(buttons[1]!); // expand second
    expect(onExpandedChange).toHaveBeenCalledWith(
      expect.arrayContaining(['1.11.443']),
    );
  });

  it('controlled expandedVersions pins the rendered state', () => {
    const { rerender, container } = render(
      <ChangelogViewer
        versions={VERSIONS}
        expandedVersions={['1.11.444']}
      />,
    );
    expect(
      container
        .querySelector('[data-version="1.11.444"]')
        ?.getAttribute('data-expanded'),
    ).toBe('true');
    rerender(
      <ChangelogViewer
        versions={VERSIONS}
        expandedVersions={['1.11.443']}
      />,
    );
    expect(
      container
        .querySelector('[data-version="1.11.444"]')
        ?.getAttribute('data-expanded'),
    ).toBe('false');
    expect(
      container
        .querySelector('[data-version="1.11.443"]')
        ?.getAttribute('data-expanded'),
    ).toBe('true');
  });

  it('expanded body renders one group per non-empty kind', () => {
    render(<ChangelogViewer versions={VERSIONS} />);
    expect(screen.getByText('Features')).toBeInTheDocument();
    expect(screen.getByText('Fixes')).toBeInTheDocument();
    expect(screen.getByText('Breaking')).toBeInTheDocument();
    expect(screen.getByText('Chores')).toBeInTheDocument();
  });

  it('group ordering is breaking -> feat -> fix -> perf -> refactor -> docs -> test -> chore', () => {
    const { container } = render(
      <ChangelogViewer versions={VERSIONS} />,
    );
    const groups = container.querySelectorAll(
      '[data-section="changelog-viewer-group"]',
    );
    const kinds = Array.from(groups).map((g) =>
      g.getAttribute('data-kind'),
    );
    expect(kinds[0]).toBe('breaking');
    expect(kinds[1]).toBe('feat');
    expect(kinds[2]).toBe('fix');
    // chore is last in the kinds list
    expect(kinds[kinds.length - 1]).toBe('chore');
  });

  it('empty group kinds do not render a section', () => {
    const minimal: ChangelogVersion = {
      version: '0.0.1',
      date: '2026-01-01',
      entries: [{ kind: 'feat', message: 'first ship' }],
    };
    const { container } = render(
      <ChangelogViewer versions={[minimal]} />,
    );
    const groups = container.querySelectorAll(
      '[data-section="changelog-viewer-group"]',
    );
    expect(groups.length).toBe(1);
    expect(groups[0]?.getAttribute('data-kind')).toBe('feat');
  });

  it('per-entry kind badge renders with data-entry-kind', () => {
    const { container } = render(
      <ChangelogViewer versions={VERSIONS} />,
    );
    const entries = container.querySelectorAll(
      '[data-section="changelog-viewer-entry"]',
    );
    expect(entries.length).toBeGreaterThan(0);
    expect(entries[0]?.getAttribute('data-entry-kind')).toBeDefined();
  });

  it('scope renders when provided on an entry', () => {
    render(<ChangelogViewer versions={VERSIONS} />);
    expect(screen.getByText('api')).toBeInTheDocument();
  });

  it('PR number renders as a link when prHref supplied', () => {
    render(<ChangelogViewer versions={VERSIONS} />);
    const pr = screen.getByText('#42').closest('a');
    expect(pr).toHaveAttribute('href', 'https://example/42');
  });

  it('PR number renders as plain text when no prHref', () => {
    const v: ChangelogVersion = {
      version: '0.0.1',
      date: '2026-01-01',
      entries: [
        { kind: 'feat', message: 'thing', prNumber: 99 },
      ],
    };
    render(<ChangelogViewer versions={[v]} />);
    const pr = screen.getByText('#99');
    expect(pr.tagName.toLowerCase()).toBe('span');
  });

  it('diff link renders when diffHref + showDiffLinks (default)', () => {
    render(<ChangelogViewer versions={VERSIONS} />);
    expect(
      screen.getByLabelText('Diff for 1.11.444'),
    ).toBeInTheDocument();
  });

  it('showDiffLinks=false hides the diff link', () => {
    const { container } = render(
      <ChangelogViewer
        versions={VERSIONS}
        showDiffLinks={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="changelog-viewer-diff"]',
      ),
    ).toBeNull();
  });

  it('diff link omitted when diffHref is missing', () => {
    const v: ChangelogVersion = {
      version: '0.0.1',
      date: '2026-01-01',
      entries: [],
    };
    const { container } = render(
      <ChangelogViewer
        versions={[v]}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="changelog-viewer-diff"]',
      ),
    ).toBeNull();
  });

  it('markdown body falls back to <pre> when no renderMarkdown supplied', () => {
    const { container } = render(
      <ChangelogViewer versions={VERSIONS} />,
    );
    expect(
      container.querySelector(
        '[data-section="changelog-viewer-markdown-fallback"]',
      ),
    ).toBeInTheDocument();
  });

  it('renderMarkdown prop receives the body string', () => {
    const renderMarkdown = vi.fn((text: string) => (
      <span data-testid="md">MD:{text.length}</span>
    ));
    render(
      <ChangelogViewer
        versions={VERSIONS}
        renderMarkdown={renderMarkdown}
      />,
    );
    expect(renderMarkdown).toHaveBeenCalled();
    expect(screen.getByTestId('md')).toBeInTheDocument();
  });

  it('renderMarkdown skipped when version has no body', () => {
    const renderMarkdown = vi.fn(() => <span />);
    render(
      <ChangelogViewer
        versions={[
          { version: '0.0.1', date: '2026-01-01', entries: [] },
        ]}
        renderMarkdown={renderMarkdown}
      />,
    );
    expect(renderMarkdown).not.toHaveBeenCalled();
  });

  it('empty versions list renders the empty state', () => {
    render(
      <ChangelogViewer
        versions={[]}
        emptyState="No history yet"
      />,
    );
    expect(screen.getByText('No history yet')).toBeInTheDocument();
  });

  it('default empty state copy', () => {
    render(<ChangelogViewer versions={[]} />);
    expect(
      screen.getByText('No release history'),
    ).toBeInTheDocument();
  });

  it('root data-version-count reflects versions.length', () => {
    render(<ChangelogViewer versions={VERSIONS} />);
    expect(
      screen.getByRole('region', { name: 'Changelog' }),
    ).toHaveAttribute('data-version-count', '3');
  });

  it('expanded body region has aria-labelledby pointing at the header', () => {
    const { container } = render(
      <ChangelogViewer versions={VERSIONS} />,
    );
    const body = container.querySelector(
      '[data-section="changelog-viewer-body"]',
    );
    expect(body).toHaveAttribute(
      'aria-labelledby',
      'changelog-version-1.11.444',
    );
  });

  it('toggle button aria-controls matches body id', () => {
    const { container } = render(
      <ChangelogViewer versions={VERSIONS} />,
    );
    const toggle = container.querySelector(
      '[data-section="changelog-viewer-toggle"]',
    );
    expect(toggle).toHaveAttribute(
      'aria-controls',
      'changelog-body-1.11.444',
    );
  });

  it('exposes a stable displayName', () => {
    expect(ChangelogViewer.displayName).toBe('ChangelogViewer');
  });

  it('forwards ref to the root region', () => {
    const ref = createRef<HTMLDivElement>();
    render(<ChangelogViewer ref={ref} versions={VERSIONS} />);
    expect(ref.current?.getAttribute('role')).toBe('region');
  });

  it('per-entry message text is visible inside the expanded body', () => {
    const { container } = render(
      <ChangelogViewer versions={VERSIONS} />,
    );
    const body = container.querySelector(
      '[data-section="changelog-viewer-body"]',
    ) as HTMLElement;
    expect(within(body).getByText('Add login button')).toBeInTheDocument();
    expect(within(body).getByText('Crash on empty list')).toBeInTheDocument();
  });
});
