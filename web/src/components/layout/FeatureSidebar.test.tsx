import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import FeatureSidebar from './FeatureSidebar';
import { setLocale } from '../../lib/i18n';
import { FEATURES } from '../../pages/registry';

beforeEach(() => {
  setLocale('en');
});

function renderSidebar(
  overrides: Partial<Parameters<typeof FeatureSidebar>[0]> = {},
) {
  const props = {
    open: true,
    selectedId: null as string | null,
    onSelect: vi.fn(),
    ...overrides,
  };
  const utils = render(<FeatureSidebar {...props} />);
  return { ...utils, props };
}

describe('<FeatureSidebar>', () => {
  it('returns null and renders nothing when open=false', () => {
    const { container } = renderSidebar({ open: false });
    expect(container.firstChild).toBeNull();
  });

  it('renders an <aside> element when open=true', () => {
    const { container } = renderSidebar();
    expect(container.querySelector('aside')).not.toBeNull();
  });

  it('renders the C4 logo image inside the aside', () => {
    const { container } = renderSidebar();
    const logo = container.querySelector('img[src="/logo.svg"]');
    expect(logo).not.toBeNull();
    expect(logo).toHaveAttribute('alt', 'C4');
  });

  it('renders the "Features" heading text from the i18n bundle', () => {
    renderSidebar();
    expect(screen.getByText('Features')).toBeInTheDocument();
  });

  it('renders the filter input with the i18n placeholder', () => {
    renderSidebar();
    expect(screen.getByPlaceholderText('Filter features')).toBeInTheDocument();
  });

  it('exposes the filter input via the "Filter features" accessible name', () => {
    renderSidebar();
    expect(screen.getByLabelText('Filter features')).toBeInTheDocument();
  });

  it('renders a navigation landmark labelled "Feature pages"', () => {
    renderSidebar();
    expect(
      screen.getByRole('navigation', { name: 'Feature pages' }),
    ).toBeInTheDocument();
  });

  it('renders one button per registered feature when no filter is active', () => {
    renderSidebar();
    const nav = screen.getByRole('navigation', { name: 'Feature pages' });
    expect(within(nav).getAllByRole('button')).toHaveLength(FEATURES.length);
  });

  it('renders every feature button as type="button"', () => {
    renderSidebar();
    const nav = screen.getByRole('navigation', { name: 'Feature pages' });
    for (const btn of within(nav).getAllByRole('button')) {
      expect(btn).toHaveAttribute('type', 'button');
    }
  });

  it('marks the selected feature with aria-current="page"', () => {
    renderSidebar({ selectedId: 'scribe' });
    const scribe = screen.getByRole('button', { name: /Scribe/ });
    expect(scribe).toHaveAttribute('aria-current', 'page');
  });

  it('omits aria-current on non-selected features', () => {
    renderSidebar({ selectedId: 'scribe' });
    const batch = screen.getByRole('button', { name: /Batch/ });
    expect(batch).not.toHaveAttribute('aria-current');
  });

  it('omits aria-current on every feature when selectedId is null', () => {
    renderSidebar({ selectedId: null });
    const nav = screen.getByRole('navigation', { name: 'Feature pages' });
    for (const btn of within(nav).getAllByRole('button')) {
      expect(btn).not.toHaveAttribute('aria-current');
    }
  });

  it('applies the bg-primary/30 active class to the selected feature', () => {
    renderSidebar({ selectedId: 'scribe' });
    expect(screen.getByRole('button', { name: /Scribe/ })).toHaveClass(
      'bg-primary/30',
    );
  });

  it('applies the hover-accent class set to non-selected features', () => {
    renderSidebar({ selectedId: 'scribe' });
    expect(screen.getByRole('button', { name: /Batch/ })).toHaveClass(
      'hover:bg-accent',
    );
  });

  it('fires onSelect with the feature id when a feature button is clicked', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    renderSidebar({ onSelect });
    await user.click(screen.getByRole('button', { name: /Scribe/ }));
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledWith('scribe');
  });

  it('fires onSelect with the id of any clicked feature', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    renderSidebar({ onSelect });
    await user.click(screen.getByRole('button', { name: /Cleanup/ }));
    expect(onSelect).toHaveBeenCalledWith('cleanup');
  });

  it('still fires onSelect when the already-selected feature is re-clicked', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    renderSidebar({ selectedId: 'scribe', onSelect });
    await user.click(screen.getByRole('button', { name: /Scribe/ }));
    expect(onSelect).toHaveBeenCalledWith('scribe');
  });

  it('filters the feature list by the typed query (matches label, id, and description)', async () => {
    const user = userEvent.setup();
    renderSidebar();
    // "scribe" matches the Scribe feature (via label/id) AND the Auto
    // feature (via description: "...autonomous manager + scribe..."), so
    // the filter is OR-of-three across label/description/id.
    await user.type(screen.getByLabelText('Filter features'), 'scribe');
    const nav = screen.getByRole('navigation', { name: 'Feature pages' });
    const buttons = within(nav).getAllByRole('button');
    expect(buttons).toHaveLength(2);
    expect(buttons.some((b) => /Scribe/.test(b.textContent ?? ''))).toBe(true);
    expect(buttons.some((b) => /Auto/.test(b.textContent ?? ''))).toBe(true);
  });

  it('renders the "no match" copy when the filter has no matches', async () => {
    const user = userEvent.setup();
    renderSidebar();
    await user.type(screen.getByLabelText('Filter features'), 'zzzqqqxxx');
    expect(
      screen.getByText('No features match "zzzqqqxxx".'),
    ).toBeInTheDocument();
  });

  it('hides every feature button when the filter has no matches', async () => {
    const user = userEvent.setup();
    renderSidebar();
    await user.type(screen.getByLabelText('Filter features'), 'zzzqqqxxx');
    const nav = screen.getByRole('navigation', { name: 'Feature pages' });
    expect(within(nav).queryAllByRole('button')).toHaveLength(0);
  });

  it('does not render the "no match" copy when at least one feature matches', async () => {
    const user = userEvent.setup();
    renderSidebar();
    await user.type(screen.getByLabelText('Filter features'), 'scribe');
    expect(screen.queryByText(/No features match/)).not.toBeInTheDocument();
  });

  it('does not render the "no match" copy when the filter is empty', () => {
    renderSidebar();
    expect(screen.queryByText(/No features match/)).not.toBeInTheDocument();
  });

  it('renders the Operations category label from the i18n bundle', () => {
    const { container } = renderSidebar();
    const headers = Array.from(
      container.querySelectorAll('nav > div > div > span'),
    ).map((el) => el.textContent?.trim() ?? '');
    expect(headers).toContain('Operations');
  });

  it('renders every category label that has at least one feature', () => {
    // "Config" appears as both a category label AND a feature label, so
    // getByText('Config') would find two nodes. Scope to category header
    // spans (direct child of the per-category header div) to disambiguate.
    const { container } = renderSidebar();
    const headers = Array.from(
      container.querySelectorAll('nav > div > div > span'),
    ).map((el) => el.textContent?.trim() ?? '');
    expect(headers).toContain('Operations');
    expect(headers).toContain('Cost');
    expect(headers).toContain('Automation');
    expect(headers).toContain('Config');
    expect(headers).toContain('Diagnostics');
  });

  it('renders the search icon decoratively (aria-hidden) inside the filter wrapper', () => {
    const { container } = renderSidebar();
    const searchIcon = container.querySelector('.absolute > svg, .absolute');
    // Search icon lives in the absolute-positioned slot of the input wrapper.
    const decorative = container.querySelector('.pointer-events-none');
    expect(decorative).not.toBeNull();
    expect(decorative).toHaveAttribute('aria-hidden');
    void searchIcon;
  });

  it('keeps each feature icon aria-hidden so the label remains the accessible name', () => {
    renderSidebar();
    const scribe = screen.getByRole('button', { name: /Scribe/ });
    const icon = scribe.querySelector('svg');
    expect(icon).toHaveAttribute('aria-hidden', 'true');
  });

  it('matches features by the lowercase id substring (id-based filter)', async () => {
    const user = userEvent.setup();
    renderSidebar();
    await user.type(screen.getByLabelText('Filter features'), 'token-usage');
    const nav = screen.getByRole('navigation', { name: 'Feature pages' });
    const buttons = within(nav).getAllByRole('button');
    expect(buttons).toHaveLength(1);
    expect(buttons[0].textContent).toMatch(/Token usage/);
  });

  it('matches features by description substring', async () => {
    const user = userEvent.setup();
    renderSidebar();
    // "orphan" appears in the Cleanup feature's description copy.
    await user.type(screen.getByLabelText('Filter features'), 'orphan');
    const nav = screen.getByRole('navigation', { name: 'Feature pages' });
    const buttons = within(nav).getAllByRole('button');
    expect(buttons.length).toBeGreaterThanOrEqual(1);
    expect(buttons.some((b) => /Cleanup/.test(b.textContent ?? ''))).toBe(true);
  });

  it('keeps the filter input value in sync with the typed query', async () => {
    const user = userEvent.setup();
    renderSidebar();
    const input = screen.getByLabelText('Filter features') as HTMLInputElement;
    await user.type(input, 'plan');
    expect(input.value).toBe('plan');
  });

  it('applies the md:w-72 desktop width class to the aside', () => {
    const { container } = renderSidebar();
    const aside = container.querySelector('aside');
    expect(aside).toHaveClass('md:w-72');
  });

  it('applies the md:border-r split-pane separator class to the aside', () => {
    const { container } = renderSidebar();
    const aside = container.querySelector('aside');
    expect(aside).toHaveClass('md:border-r');
  });

  it('re-renders translated heading copy when the locale flips to ko', () => {
    renderSidebar();
    expect(screen.getByText('Features')).toBeInTheDocument();
    // useLocale subscribes to the c4:locale-changed event and re-renders
    // via setState; wrap setLocale in act() so the update flushes.
    act(() => {
      setLocale('ko');
    });
    expect(screen.queryByText('Features')).not.toBeInTheDocument();
  });
});
