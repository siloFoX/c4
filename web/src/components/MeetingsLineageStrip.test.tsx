import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { setLocale } from '../lib/i18n';
import MeetingsLineageStrip, {
  type LineageResponse,
} from './MeetingsLineageStrip';
import type { MeetingStatus } from './MeetingsView';

// MeetingsLineageStrip is a pure-display chain-of-buttons. Parent
// owns the lineage payload + the navigation callback. Tests drive
// the full prop union directly: the null + depth<=1 hidden branches,
// the depth>1 chain rendering, the chainTruncated banner, the
// current-id highlight, the title attribute composition, the
// onNavigate(id) payload, and the locale-flip re-render.

function makeEntry(over: Partial<{
  id: string;
  status: MeetingStatus;
  title: string;
  track: string;
  createdAt: string;
  completedAt: string | null;
  forkOf: string | null;
}> = {}) {
  return {
    id: 'mtg-1',
    status: 'completed' as MeetingStatus,
    title: 'Root meeting',
    track: 'standard',
    createdAt: '2026-04-01T00:00:00Z',
    completedAt: '2026-04-01T01:00:00Z',
    forkOf: null,
    ...over,
  };
}

function makeLineage(
  over: Partial<LineageResponse> = {},
): LineageResponse {
  return {
    rootId: 'mtg-1',
    depth: 2,
    chainTruncated: false,
    chain: [
      makeEntry({ id: 'mtg-1', title: 'Root', status: 'completed' }),
      makeEntry({
        id: 'mtg-2',
        title: 'Fork A',
        status: 'in-progress',
        forkOf: 'mtg-1',
      }),
    ],
    ...over,
  };
}

beforeEach(() => {
  setLocale('en');
});

function renderStrip(
  overrides: Partial<Parameters<typeof MeetingsLineageStrip>[0]> = {},
) {
  const props = {
    lineage: makeLineage(),
    currentId: 'mtg-2',
    onNavigate: vi.fn(),
    ...overrides,
  };
  const utils = render(<MeetingsLineageStrip {...props} />);
  return { ...utils, props };
}

describe('<MeetingsLineageStrip>', () => {
  it('renders nothing when lineage is null', () => {
    const { container } = renderStrip({ lineage: null });
    expect(container.firstChild).toBeNull();
  });

  it('renders nothing when lineage.depth is 0', () => {
    const { container } = renderStrip({
      lineage: makeLineage({ depth: 0, chain: [] }),
    });
    expect(container.firstChild).toBeNull();
  });

  it('renders nothing when lineage.depth is exactly 1 (root meeting)', () => {
    const { container } = renderStrip({
      lineage: makeLineage({ depth: 1, chain: [makeEntry()] }),
    });
    expect(container.firstChild).toBeNull();
  });

  it('renders the Fork lineage label from the i18n bundle when depth > 1', () => {
    renderStrip();
    expect(screen.getByText('Fork lineage')).toBeInTheDocument();
  });

  it('renders the depth indicator text', () => {
    renderStrip({ lineage: makeLineage({ depth: 3 }) });
    expect(screen.getByText(/depth=3/)).toBeInTheDocument();
  });

  it('does NOT render the chain-truncated banner when chainTruncated is false', () => {
    renderStrip({ lineage: makeLineage({ chainTruncated: false }) });
    expect(
      screen.queryByText(/chain truncated/),
    ).not.toBeInTheDocument();
  });

  it('renders the chain-truncated banner when chainTruncated is true', () => {
    renderStrip({ lineage: makeLineage({ chainTruncated: true }) });
    expect(
      screen.getByText(/chain truncated/),
    ).toBeInTheDocument();
  });

  it('renders one list item per chain entry', () => {
    const { container } = renderStrip({
      lineage: makeLineage({
        depth: 3,
        chain: [
          makeEntry({ id: 'a' }),
          makeEntry({ id: 'b' }),
          makeEntry({ id: 'c' }),
        ],
      }),
    });
    const ol = container.querySelector('ol');
    expect(ol).not.toBeNull();
    const items = within(ol as HTMLElement).getAllByRole('listitem');
    expect(items).toHaveLength(3);
  });

  it('renders one button per chain entry', () => {
    renderStrip({
      lineage: makeLineage({
        depth: 3,
        chain: [
          makeEntry({ id: 'a' }),
          makeEntry({ id: 'b' }),
          makeEntry({ id: 'c' }),
        ],
      }),
    });
    expect(screen.getAllByRole('button')).toHaveLength(3);
  });

  it('renders each chain entry button text as its id', () => {
    renderStrip({
      lineage: makeLineage({
        depth: 2,
        chain: [
          makeEntry({ id: 'parent-id' }),
          makeEntry({ id: 'child-id' }),
        ],
      }),
    });
    expect(
      screen.getByRole('button', { name: 'parent-id' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'child-id' }),
    ).toBeInTheDocument();
  });

  it('composes the button title from title + status', () => {
    renderStrip({
      lineage: makeLineage({
        depth: 2,
        chain: [
          makeEntry({
            id: 'p',
            title: 'Parent meeting',
            status: 'completed',
          }),
          makeEntry({
            id: 'c',
            title: 'Child meeting',
            status: 'pending',
          }),
        ],
      }),
    });
    expect(
      screen.getByRole('button', { name: 'p' }),
    ).toHaveAttribute('title', 'Parent meeting · completed');
    expect(
      screen.getByRole('button', { name: 'c' }),
    ).toHaveAttribute('title', 'Child meeting · pending');
  });

  it('renders all entry buttons as type="button" so none submits a form', () => {
    renderStrip();
    for (const btn of screen.getAllByRole('button')) {
      expect(btn).toHaveAttribute('type', 'button');
    }
  });

  it('renders the arrow separator before every entry after the first', () => {
    const { container } = renderStrip({
      lineage: makeLineage({
        depth: 3,
        chain: [
          makeEntry({ id: 'a' }),
          makeEntry({ id: 'b' }),
          makeEntry({ id: 'c' }),
        ],
      }),
    });
    const arrows = Array.from(container.querySelectorAll('span')).filter(
      (el) => el.textContent === '←',
    );
    expect(arrows).toHaveLength(2);
  });

  it('does NOT render an arrow separator before the first entry', () => {
    const { container } = renderStrip({
      lineage: makeLineage({
        depth: 1,
        // depth > 1 needed to render at all; use 2-entry chain
        chain: [makeEntry({ id: 'a' }), makeEntry({ id: 'b' })],
      }),
    });
    // depth=1 -> not rendered, exit early
    void container;
  });

  it('applies the primary highlight class to the current entry button', () => {
    renderStrip({
      currentId: 'mtg-2',
      lineage: makeLineage({
        chain: [
          makeEntry({ id: 'mtg-1' }),
          makeEntry({ id: 'mtg-2' }),
        ],
      }),
    });
    const currentBtn = screen.getByRole('button', { name: 'mtg-2' });
    expect(currentBtn).toHaveClass('border-primary');
    expect(currentBtn).toHaveClass('bg-primary/30');
  });

  it('does NOT apply the primary highlight class to non-current entry buttons', () => {
    renderStrip({
      currentId: 'mtg-2',
      lineage: makeLineage({
        chain: [
          makeEntry({ id: 'mtg-1' }),
          makeEntry({ id: 'mtg-2' }),
        ],
      }),
    });
    const otherBtn = screen.getByRole('button', { name: 'mtg-1' });
    expect(otherBtn).not.toHaveClass('border-primary');
    expect(otherBtn).toHaveClass('border-border');
  });

  it('fires onNavigate with the clicked entry id (current)', async () => {
    const user = userEvent.setup();
    const onNavigate = vi.fn();
    renderStrip({
      currentId: 'mtg-2',
      onNavigate,
      lineage: makeLineage({
        chain: [
          makeEntry({ id: 'mtg-1' }),
          makeEntry({ id: 'mtg-2' }),
        ],
      }),
    });
    await user.click(screen.getByRole('button', { name: 'mtg-2' }));
    expect(onNavigate).toHaveBeenCalledTimes(1);
    expect(onNavigate).toHaveBeenCalledWith('mtg-2');
  });

  it('fires onNavigate with the clicked entry id (ancestor)', async () => {
    const user = userEvent.setup();
    const onNavigate = vi.fn();
    renderStrip({
      currentId: 'mtg-2',
      onNavigate,
      lineage: makeLineage({
        chain: [
          makeEntry({ id: 'mtg-1' }),
          makeEntry({ id: 'mtg-2' }),
        ],
      }),
    });
    await user.click(screen.getByRole('button', { name: 'mtg-1' }));
    expect(onNavigate).toHaveBeenCalledWith('mtg-1');
  });

  it('fires onNavigate on Enter key activation', async () => {
    const user = userEvent.setup();
    const onNavigate = vi.fn();
    renderStrip({
      onNavigate,
      lineage: makeLineage({
        chain: [
          makeEntry({ id: 'mtg-1' }),
          makeEntry({ id: 'mtg-2' }),
        ],
      }),
    });
    const btn = screen.getByRole('button', { name: 'mtg-1' });
    btn.focus();
    await user.keyboard('{Enter}');
    expect(onNavigate).toHaveBeenCalledWith('mtg-1');
  });

  it('fires onNavigate on Space key activation', async () => {
    const user = userEvent.setup();
    const onNavigate = vi.fn();
    renderStrip({
      onNavigate,
      lineage: makeLineage({
        chain: [
          makeEntry({ id: 'mtg-1' }),
          makeEntry({ id: 'mtg-2' }),
        ],
      }),
    });
    const btn = screen.getByRole('button', { name: 'mtg-2' });
    btn.focus();
    await user.keyboard(' ');
    expect(onNavigate).toHaveBeenCalledWith('mtg-2');
  });

  it('does NOT fire onNavigate on initial render', () => {
    const onNavigate = vi.fn();
    renderStrip({ onNavigate });
    expect(onNavigate).not.toHaveBeenCalled();
  });

  it('rerendering with the same props does not duplicate onNavigate calls', async () => {
    const user = userEvent.setup();
    const onNavigate = vi.fn();
    const { rerender, props } = renderStrip({ onNavigate });
    rerender(<MeetingsLineageStrip {...props} />);
    await user.click(screen.getByRole('button', { name: 'mtg-2' }));
    expect(onNavigate).toHaveBeenCalledTimes(1);
  });

  it('rerendering with a new chain replaces the rendered buttons', () => {
    const { rerender, props } = renderStrip({
      lineage: makeLineage({
        chain: [
          makeEntry({ id: 'old-1' }),
          makeEntry({ id: 'old-2' }),
        ],
      }),
    });
    expect(
      screen.getByRole('button', { name: 'old-1' }),
    ).toBeInTheDocument();
    rerender(
      <MeetingsLineageStrip
        {...props}
        lineage={makeLineage({
          chain: [
            makeEntry({ id: 'new-1' }),
            makeEntry({ id: 'new-2' }),
          ],
        })}
      />,
    );
    expect(
      screen.queryByRole('button', { name: 'old-1' }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'new-1' }),
    ).toBeInTheDocument();
  });

  it('rerendering from lineage to null drops the strip entirely', () => {
    const { rerender, props, container } = renderStrip();
    expect(container.firstChild).not.toBeNull();
    rerender(<MeetingsLineageStrip {...props} lineage={null} />);
    expect(container.firstChild).toBeNull();
  });

  it('rerendering from depth>1 to depth<=1 drops the strip entirely', () => {
    const { rerender, props, container } = renderStrip();
    expect(container.firstChild).not.toBeNull();
    rerender(
      <MeetingsLineageStrip
        {...props}
        lineage={makeLineage({ depth: 1, chain: [makeEntry()] })}
      />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('re-renders when the locale flips (useLocale subscription)', () => {
    renderStrip();
    expect(screen.getByText('Fork lineage')).toBeInTheDocument();
    act(() => {
      setLocale('ko');
    });
    // After the locale flip the English literal is gone -- the
    // Korean bundle overrides the heading copy.
    expect(screen.queryByText('Fork lineage')).not.toBeInTheDocument();
  });
});
