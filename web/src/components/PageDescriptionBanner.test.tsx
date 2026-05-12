import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { setLocale } from '../lib/i18n';
import { PageDescriptionBanner } from './PageDescriptionBanner';

// PageDescriptionBanner is a pure-display section that opens every
// CLI-coverage page. State machine: required summaryKey + optional
// cliKey / exampleKey / useCasesKey are looked up against the
// bundled i18n table via t() / tList(). The component subscribes to
// useLocale() so the copy re-renders on locale flips. Optional
// onOpenHelp + action slots compose into the right-hand control
// cluster. Tests drive the full prop union directly, including the
// missing-key fallback (lookup returns the key string verbatim) and
// the pipe-delimited useCases expansion (tList splits on '|').

beforeEach(() => {
  setLocale('en');
});

function renderBanner(
  overrides: Partial<Parameters<typeof PageDescriptionBanner>[0]> = {},
) {
  const props = {
    summaryKey: 'scribe.summary',
    ...overrides,
  };
  const utils = render(<PageDescriptionBanner {...props} />);
  const user = userEvent.setup();
  return { ...utils, user, props };
}

describe('<PageDescriptionBanner>', () => {
  // ---- scaffolding -----------------------------------------------

  it('renders a section element when given only the required summaryKey', () => {
    const { container } = renderBanner();
    expect(container.querySelector('section')).not.toBeNull();
  });

  it('exposes the localized "Help center" string as the section aria-label', () => {
    renderBanner();
    expect(
      screen.getByRole('region', { name: 'Help center' }),
    ).toBeInTheDocument();
  });

  it('tags the section with data-testid="page-description-banner" by default', () => {
    renderBanner();
    expect(screen.getByTestId('page-description-banner')).toBeInTheDocument();
  });

  it('honours an override testId prop on the section', () => {
    renderBanner({ testId: 'scribe-banner' });
    expect(screen.getByTestId('scribe-banner')).toBeInTheDocument();
    expect(
      screen.queryByTestId('page-description-banner'),
    ).not.toBeInTheDocument();
  });

  it('applies the consumer-supplied className alongside the built-in classes', () => {
    renderBanner({ className: 'custom-extra-class' });
    const section = screen.getByTestId('page-description-banner');
    expect(section.className).toMatch(/custom-extra-class/);
    expect(section.className).toMatch(/rounded-lg/);
  });

  // ---- summary slot ----------------------------------------------

  it('renders the resolved summary text from the bundle', () => {
    renderBanner({ summaryKey: 'scribe.summary' });
    expect(
      screen.getByText(/Session context recorder/),
    ).toBeInTheDocument();
  });

  it('marks the leading Sparkles icon as aria-hidden so it does not steal the accessible name', () => {
    const { container } = renderBanner();
    const sparkles = container.querySelector('svg[aria-hidden="true"]');
    expect(sparkles).not.toBeNull();
  });

  it('renders the summary as a paragraph element', () => {
    renderBanner({ summaryKey: 'scribe.summary' });
    const p = screen.getByText(/Session context recorder/);
    expect(p.tagName).toBe('P');
  });

  it('falls back to the raw summaryKey string when the bundle has no match', () => {
    renderBanner({ summaryKey: 'totally.unknown.summary.key' });
    expect(
      screen.getByText('totally.unknown.summary.key'),
    ).toBeInTheDocument();
  });

  // ---- CLI equivalent slot ---------------------------------------

  it('does NOT render the CLI line when cliKey is omitted', () => {
    renderBanner();
    expect(screen.queryByText('CLI equivalent')).not.toBeInTheDocument();
  });

  it('renders the CLI label + resolved CLI text when cliKey is provided', () => {
    renderBanner({ cliKey: 'scribe.cli' });
    expect(screen.getByText('CLI equivalent')).toBeInTheDocument();
    expect(
      screen.getByText('c4 scribe start|stop|scan|status'),
    ).toBeInTheDocument();
  });

  it('renders the CLI body inside a <code> element so monospace styling applies', () => {
    renderBanner({ cliKey: 'scribe.cli' });
    const code = screen.getByText('c4 scribe start|stop|scan|status');
    expect(code.tagName).toBe('CODE');
  });

  it('does NOT render the CLI label when cliKey resolves to an unknown key (falls back to the key string)', () => {
    // tList-style fallback applies to t() too: t() returns the key
    // verbatim. The render still happens, but the rendered text is
    // the key itself, not a missing-data branch. Verify both halves.
    renderBanner({ cliKey: 'unknown.cli.key' });
    expect(screen.getByText('CLI equivalent')).toBeInTheDocument();
    expect(screen.getByText('unknown.cli.key')).toBeInTheDocument();
  });

  // ---- use cases slot --------------------------------------------

  it('does NOT render the use cases details when useCasesKey is omitted', () => {
    renderBanner();
    expect(screen.queryByText('When to use')).not.toBeInTheDocument();
  });

  it('renders the use cases details + every parsed bullet when useCasesKey is provided', () => {
    renderBanner({ useCasesKey: 'scribe.useCases' });
    expect(screen.getByText('When to use')).toBeInTheDocument();
    expect(
      screen.getByText('Keep context across /compact boundaries.'),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        'Share a live snapshot with reviewers without pasting terminal output.',
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText('Debug why a manager lost earlier decisions.'),
    ).toBeInTheDocument();
  });

  it('parses the pipe-delimited useCases value into exactly three <li> bullets', () => {
    const { container } = renderBanner({ useCasesKey: 'scribe.useCases' });
    expect(container.querySelectorAll('li')).toHaveLength(3);
  });

  it('renders use cases inside a collapsible <details> element', () => {
    const { container } = renderBanner({ useCasesKey: 'scribe.useCases' });
    const details = container.querySelector('details');
    expect(details).not.toBeNull();
  });

  it('does NOT render the use cases details when useCasesKey resolves to no items (unknown key)', () => {
    // tList returns [] when the lookup falls back to the key itself,
    // so the bullet list is suppressed entirely.
    renderBanner({ useCasesKey: 'unknown.useCases.key' });
    expect(screen.queryByText('When to use')).not.toBeInTheDocument();
  });

  // ---- example slot ----------------------------------------------

  it('does NOT render the example details when exampleKey is omitted', () => {
    renderBanner();
    expect(screen.queryByText('Example')).not.toBeInTheDocument();
  });

  it('renders the example details + resolved body when exampleKey is provided', () => {
    renderBanner({ exampleKey: 'scribe.example' });
    expect(screen.getByText('Example')).toBeInTheDocument();
    expect(
      screen.getByText(/Click Start, then Scan/),
    ).toBeInTheDocument();
  });

  it('renders the example body with whitespace-pre-line so newlines survive', () => {
    renderBanner({ exampleKey: 'scribe.example' });
    const body = screen.getByText(/Click Start, then Scan/);
    expect(body.className).toMatch(/whitespace-pre-line/);
  });

  // ---- onOpenHelp button ----------------------------------------

  it('does NOT render the Learn more button when onOpenHelp is omitted', () => {
    renderBanner();
    expect(
      screen.queryByRole('button', { name: 'Learn more' }),
    ).not.toBeInTheDocument();
  });

  it('renders the Learn more button when onOpenHelp is provided', () => {
    renderBanner({ onOpenHelp: vi.fn() });
    expect(
      screen.getByRole('button', { name: 'Learn more' }),
    ).toBeInTheDocument();
  });

  it('fires onOpenHelp exactly once when Learn more is clicked', async () => {
    const onOpenHelp = vi.fn();
    const { user } = renderBanner({ onOpenHelp });
    await user.click(screen.getByRole('button', { name: 'Learn more' }));
    expect(onOpenHelp).toHaveBeenCalledTimes(1);
  });

  it('fires onOpenHelp on Enter key activation', async () => {
    const onOpenHelp = vi.fn();
    const { user } = renderBanner({ onOpenHelp });
    const btn = screen.getByRole('button', { name: 'Learn more' });
    btn.focus();
    await user.keyboard('{Enter}');
    expect(onOpenHelp).toHaveBeenCalledTimes(1);
  });

  it('does NOT fire onOpenHelp on initial render', () => {
    const onOpenHelp = vi.fn();
    renderBanner({ onOpenHelp });
    expect(onOpenHelp).not.toHaveBeenCalled();
  });

  it('renders the Learn more button as type="button" so it does not submit a parent form', () => {
    renderBanner({ onOpenHelp: vi.fn() });
    expect(
      screen.getByRole('button', { name: 'Learn more' }),
    ).toHaveAttribute('type', 'button');
  });

  // ---- action slot ----------------------------------------------

  it('does NOT render an action node by default', () => {
    renderBanner();
    expect(screen.queryByTestId('action-slot')).not.toBeInTheDocument();
  });

  it('renders an action ReactNode verbatim in the right-hand control cluster', () => {
    renderBanner({
      action: (
        <button type="button" data-testid="action-slot">
          Try example
        </button>
      ),
    });
    expect(screen.getByTestId('action-slot')).toHaveTextContent('Try example');
  });

  it('renders the action node before the Learn more button when both are present', () => {
    renderBanner({
      onOpenHelp: vi.fn(),
      action: (
        <button type="button" data-testid="action-slot">
          Try example
        </button>
      ),
    });
    const banner = screen.getByTestId('page-description-banner');
    const buttons = within(banner).getAllByRole('button');
    // First button is the action, second is Learn more (DOM order).
    expect(buttons[0]).toHaveAttribute('data-testid', 'action-slot');
    expect(buttons[1]).toHaveAccessibleName('Learn more');
  });

  // ---- rerender stability ---------------------------------------

  it('rerendering with the same props does not duplicate the banner', () => {
    const { rerender, props } = renderBanner();
    rerender(<PageDescriptionBanner {...props} />);
    expect(
      screen.getAllByTestId('page-description-banner'),
    ).toHaveLength(1);
  });

  it('rerendering with a new summaryKey swaps the summary text', () => {
    const { rerender, props } = renderBanner({ summaryKey: 'scribe.summary' });
    expect(
      screen.getByText(/Session context recorder/),
    ).toBeInTheDocument();
    rerender(
      <PageDescriptionBanner {...props} summaryKey="batch.summary" />,
    );
    expect(
      screen.queryByText(/Session context recorder/),
    ).not.toBeInTheDocument();
  });

  it('rerendering from omitted cliKey to present cliKey reveals the CLI line', () => {
    const { rerender, props } = renderBanner();
    expect(screen.queryByText('CLI equivalent')).not.toBeInTheDocument();
    rerender(<PageDescriptionBanner {...props} cliKey="scribe.cli" />);
    expect(screen.getByText('CLI equivalent')).toBeInTheDocument();
  });

  // ---- locale flip ----------------------------------------------

  it('re-renders the CLI label in Korean when the locale flips to ko', () => {
    renderBanner({ cliKey: 'scribe.cli' });
    expect(screen.getByText('CLI equivalent')).toBeInTheDocument();
    act(() => {
      setLocale('ko');
    });
    expect(screen.queryByText('CLI equivalent')).not.toBeInTheDocument();
  });

  it('re-renders the Learn more label in Korean when the locale flips to ko', () => {
    renderBanner({ onOpenHelp: vi.fn() });
    expect(
      screen.getByRole('button', { name: 'Learn more' }),
    ).toBeInTheDocument();
    act(() => {
      setLocale('ko');
    });
    expect(
      screen.queryByRole('button', { name: 'Learn more' }),
    ).not.toBeInTheDocument();
  });

  it('re-renders the section aria-label in Korean when the locale flips to ko', () => {
    renderBanner();
    expect(
      screen.getByRole('region', { name: 'Help center' }),
    ).toBeInTheDocument();
    act(() => {
      setLocale('ko');
    });
    expect(
      screen.queryByRole('region', { name: 'Help center' }),
    ).not.toBeInTheDocument();
  });
});
