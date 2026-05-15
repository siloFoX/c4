import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { setLocale } from '../lib/i18n';

// SessionsEmptyAttachBanner is a pure-display empty-state note
// rendered above the attached-sessions list. The parent owns the
// AttachModal opener; the banner forwards a single onAttachClick
// callback. Tests drive the prop directly: assert the note role +
// aria-label, the i18n title/body copy, the Plus CTA button label,
// the click / Enter / Space activations on the CTA, the aria-hidden
// decorative icons, the rerender stability contract, and the
// locale-flip re-render.

import SessionsEmptyAttachBanner from './SessionsEmptyAttachBanner';

beforeEach(() => {
  setLocale('en');
});

function renderBanner(
  overrides: Partial<Parameters<typeof SessionsEmptyAttachBanner>[0]> = {},
) {
  const onAttachClick = vi.fn();
  const props = {
    onAttachClick,
    ...overrides,
  };
  const utils = render(<SessionsEmptyAttachBanner {...props} />);
  const user = userEvent.setup();
  return { ...utils, user, onAttachClick, props };
}

describe('<SessionsEmptyAttachBanner>', () => {
  // ---- structure --------------------------------------------------

  it('renders the note wrapper with role="note"', () => {
    renderBanner();
    expect(screen.getByRole('note')).toBeInTheDocument();
  });

  it('exposes the i18n attach-intro aria-label on the note wrapper', () => {
    renderBanner();
    expect(screen.getByRole('note')).toHaveAttribute(
      'aria-label',
      'Attach introduction',
    );
  });

  it('renders the i18n title text inside the banner', () => {
    renderBanner();
    expect(screen.getByText('What is attach?')).toBeInTheDocument();
  });

  it('renders the i18n body copy inside the banner', () => {
    renderBanner();
    expect(
      screen.getByText(
        'Import external Claude Code sessions (~/.claude/projects/*.jsonl) to view conversation history in c4 Web UI.',
      ),
    ).toBeInTheDocument();
  });

  // ---- icons ------------------------------------------------------

  it('renders the Info, SessionsEmpty illustration, and Plus decorative svgs as aria-hidden', () => {
    // (v1.11.233, patch 11.215) Empty-state SessionsEmpty
    // illustration adopted alongside the existing Info + Plus
    // icons. All three remain decorative -- the note role + body
    // text carry the semantic meaning.
    const { container } = renderBanner();
    const svgs = container.querySelectorAll('svg');
    expect(svgs.length).toBe(3);
    for (const svg of svgs) {
      expect(svg).toHaveAttribute('aria-hidden', 'true');
    }
  });

  // ---- CTA button -------------------------------------------------

  it('renders the CTA button with the "Attach your first session" label', () => {
    renderBanner();
    expect(
      screen.getByRole('button', { name: /Attach your first session/ }),
    ).toBeInTheDocument();
  });

  it('renders exactly one button in the banner', () => {
    renderBanner();
    expect(screen.getAllByRole('button')).toHaveLength(1);
  });

  // ---- callback wiring -------------------------------------------

  it('fires onAttachClick exactly once when the CTA button is clicked', async () => {
    const { user, onAttachClick } = renderBanner();
    await user.click(
      screen.getByRole('button', { name: /Attach your first session/ }),
    );
    expect(onAttachClick).toHaveBeenCalledTimes(1);
  });

  it('fires onAttachClick on every CTA click (no internal latch / debounce)', async () => {
    const { user, onAttachClick } = renderBanner();
    const btn = screen.getByRole('button', {
      name: /Attach your first session/,
    });
    await user.click(btn);
    await user.click(btn);
    await user.click(btn);
    expect(onAttachClick).toHaveBeenCalledTimes(3);
  });

  it('fires onAttachClick on Enter key activation when the CTA is focused', async () => {
    const { user, onAttachClick } = renderBanner();
    const btn = screen.getByRole('button', {
      name: /Attach your first session/,
    });
    btn.focus();
    await user.keyboard('{Enter}');
    expect(onAttachClick).toHaveBeenCalledTimes(1);
  });

  it('fires onAttachClick on Space key activation when the CTA is focused', async () => {
    const { user, onAttachClick } = renderBanner();
    const btn = screen.getByRole('button', {
      name: /Attach your first session/,
    });
    btn.focus();
    await user.keyboard(' ');
    expect(onAttachClick).toHaveBeenCalledTimes(1);
  });

  it('fires onAttachClick a second time on a repeat click (no internal latch)', async () => {
    const { user, onAttachClick } = renderBanner();
    const btn = screen.getByRole('button', {
      name: /Attach your first session/,
    });
    await user.click(btn);
    await user.click(btn);
    expect(onAttachClick).toHaveBeenCalledTimes(2);
  });

  it('does NOT fire onAttachClick on initial render', () => {
    const { onAttachClick } = renderBanner();
    expect(onAttachClick).not.toHaveBeenCalled();
  });

  // ---- rerender stability ----------------------------------------

  it('rerendering with the same props does not duplicate the title', () => {
    const { rerender, props } = renderBanner();
    rerender(<SessionsEmptyAttachBanner {...props} />);
    expect(screen.getAllByText('What is attach?')).toHaveLength(1);
  });

  it('rerendering with a new onAttachClick swaps the click target', async () => {
    const first = vi.fn();
    const second = vi.fn();
    const { rerender, user } = renderBanner({ onAttachClick: first });
    rerender(<SessionsEmptyAttachBanner onAttachClick={second} />);
    await user.click(
      screen.getByRole('button', { name: /Attach your first session/ }),
    );
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
  });

  // ---- locale flip ------------------------------------------------

  it('re-renders the title in Korean when the locale flips to ko', () => {
    renderBanner();
    expect(screen.getByText('What is attach?')).toBeInTheDocument();
    act(() => {
      setLocale('ko');
    });
    expect(screen.queryByText('What is attach?')).not.toBeInTheDocument();
  });

  it('re-renders the CTA label in Korean when the locale flips to ko', () => {
    renderBanner();
    expect(
      screen.getByRole('button', { name: /Attach your first session/ }),
    ).toBeInTheDocument();
    act(() => {
      setLocale('ko');
    });
    expect(
      screen.queryByRole('button', { name: /Attach your first session/ }),
    ).not.toBeInTheDocument();
  });

  it('re-renders the aria-label in Korean when the locale flips to ko', () => {
    renderBanner();
    expect(screen.getByRole('note')).toHaveAttribute(
      'aria-label',
      'Attach introduction',
    );
    act(() => {
      setLocale('ko');
    });
    expect(screen.getByRole('note')).not.toHaveAttribute(
      'aria-label',
      'Attach introduction',
    );
  });
});
