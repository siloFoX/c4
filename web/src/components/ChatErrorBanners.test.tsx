import { describe, it, expect, beforeEach } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import { setLocale } from '../lib/i18n';
import ChatErrorBanners from './ChatErrorBanners';

// ChatErrorBanners is a pure-display two-tier banner. Parent owns
// the error + backfillError strings; everything else is derived.
// The component subscribes to useLocale (for re-render parity with
// siblings) but renders no locale-dependent copy. Tests drive the
// full prop union directly: the no-banner default, the destructive
// branch (error set), the amber branch (backfill failed but live
// is still up), and the precedence rule (a hard error suppresses
// the secondary amber banner).

beforeEach(() => {
  setLocale('en');
});

function renderBanners(
  overrides: Partial<Parameters<typeof ChatErrorBanners>[0]> = {},
) {
  const props = {
    error: null,
    backfillError: null,
    ...overrides,
  };
  return render(<ChatErrorBanners {...props} />);
}

describe('<ChatErrorBanners>', () => {
  // ---- no-banner default ------------------------------------------

  it('renders nothing visible when both error and backfillError are null', () => {
    renderBanners();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('does not render a destructive banner when error is null', () => {
    renderBanners({ error: null, backfillError: null });
    expect(screen.queryByText(/.+/)).not.toBeInTheDocument();
  });

  // ---- destructive (primary) branch -------------------------------

  it('renders a role=alert banner when error is set', () => {
    renderBanners({ error: 'Something hard failed' });
    expect(screen.getByRole('alert')).toBeInTheDocument();
  });

  it('renders the error text verbatim inside the destructive banner', () => {
    renderBanners({ error: 'Something hard failed' });
    expect(screen.getByRole('alert')).toHaveTextContent('Something hard failed');
  });

  it('applies the destructive style classes when error is set', () => {
    renderBanners({ error: 'oops' });
    const alert = screen.getByRole('alert');
    expect(alert.className).toMatch(/text-destructive/);
    expect(alert.className).toMatch(/border-destructive/);
    expect(alert.className).toMatch(/bg-destructive/);
  });

  it('renders the destructive banner even when the error string is short', () => {
    renderBanners({ error: 'x' });
    expect(screen.getByRole('alert')).toHaveTextContent('x');
  });

  // ---- amber (backfill) branch -----------------------------------

  it('renders the amber backfill banner when only backfillError is set', () => {
    renderBanners({ backfillError: 'past went boom' });
    const alert = screen.getByRole('alert');
    expect(alert).toBeInTheDocument();
    expect(alert).toHaveTextContent(
      'Past-message backfill failed: past went boom. Live stream is still connected.',
    );
  });

  it('applies the amber style classes when only backfillError is set', () => {
    renderBanners({ backfillError: 'past went boom' });
    const alert = screen.getByRole('alert');
    expect(alert.className).toMatch(/warning/);
  });

  it('does NOT apply destructive classes when only backfillError is set', () => {
    renderBanners({ backfillError: 'past went boom' });
    const alert = screen.getByRole('alert');
    expect(alert.className).not.toMatch(/text-destructive/);
  });

  it('formats the backfill copy as "Past-message backfill failed: <msg>. Live stream is still connected."', () => {
    renderBanners({ backfillError: 'HTTP 500' });
    expect(
      screen.getByText(
        /Past-message backfill failed: HTTP 500\. Live stream is still connected\./,
      ),
    ).toBeInTheDocument();
  });

  // ---- precedence (error suppresses backfill) --------------------

  it('renders only the destructive banner when BOTH error and backfillError are set', () => {
    renderBanners({
      error: 'oops',
      backfillError: 'past went boom',
    });
    const alerts = screen.getAllByRole('alert');
    expect(alerts).toHaveLength(1);
    expect(alerts[0]).toHaveTextContent('oops');
    expect(alerts[0]).not.toHaveTextContent('past went boom');
  });

  it('does NOT render the amber backfill copy when error is also set', () => {
    renderBanners({
      error: 'oops',
      backfillError: 'past went boom',
    });
    expect(
      screen.queryByText(/Past-message backfill failed/),
    ).not.toBeInTheDocument();
  });

  // ---- empty-string edge cases -----------------------------------

  it('does NOT render a destructive banner when error is an empty string', () => {
    renderBanners({ error: '' });
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('does NOT render the amber banner when backfillError is an empty string', () => {
    renderBanners({ backfillError: '' });
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('does NOT render any banner when both error and backfillError are empty strings', () => {
    renderBanners({ error: '', backfillError: '' });
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  // ---- count of banners ------------------------------------------

  it('renders exactly one role=alert when error is set', () => {
    renderBanners({ error: 'oops' });
    expect(screen.getAllByRole('alert')).toHaveLength(1);
  });

  it('renders exactly one role=alert when only backfillError is set', () => {
    renderBanners({ backfillError: 'past went boom' });
    expect(screen.getAllByRole('alert')).toHaveLength(1);
  });

  // ---- rerender stability ----------------------------------------

  it('rerendering from no-error to error-set reveals the destructive banner', () => {
    const { rerender } = renderBanners();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    rerender(<ChatErrorBanners error="now broken" backfillError={null} />);
    expect(screen.getByRole('alert')).toHaveTextContent('now broken');
  });

  it('rerendering from error-set to no-error drops the destructive banner', () => {
    const { rerender } = renderBanners({ error: 'oops' });
    expect(screen.getByRole('alert')).toBeInTheDocument();
    rerender(<ChatErrorBanners error={null} backfillError={null} />);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('rerendering with a new error string updates the rendered text', () => {
    const { rerender } = renderBanners({ error: 'first' });
    expect(screen.getByRole('alert')).toHaveTextContent('first');
    rerender(<ChatErrorBanners error="second" backfillError={null} />);
    expect(screen.getByRole('alert')).toHaveTextContent('second');
    expect(screen.queryByText('first')).not.toBeInTheDocument();
  });

  it('rerendering from backfill-only to error-set swaps the amber for the destructive banner', () => {
    const { rerender } = renderBanners({ backfillError: 'past went boom' });
    const amber = screen.getByRole('alert');
    expect(amber.className).toMatch(/warning/);
    rerender(<ChatErrorBanners error="hard fail" backfillError="past went boom" />);
    const destructive = screen.getByRole('alert');
    expect(destructive.className).toMatch(/text-destructive/);
    expect(destructive).toHaveTextContent('hard fail');
    expect(
      screen.queryByText(/Past-message backfill failed/),
    ).not.toBeInTheDocument();
  });

  it('rerendering from error-set to backfill-only swaps the destructive for the amber banner', () => {
    const { rerender } = renderBanners({ error: 'hard fail' });
    const destructive = screen.getByRole('alert');
    expect(destructive.className).toMatch(/text-destructive/);
    rerender(<ChatErrorBanners error={null} backfillError="past went boom" />);
    const amber = screen.getByRole('alert');
    expect(amber.className).toMatch(/warning/);
    expect(amber).toHaveTextContent(/Past-message backfill failed/);
  });

  // ---- locale flip ------------------------------------------------

  it('re-renders without crashing when the locale flips (useLocale subscription)', () => {
    renderBanners({ error: 'locale-stable' });
    expect(screen.getByRole('alert')).toHaveTextContent('locale-stable');
    act(() => {
      setLocale('ko');
    });
    // Error copy is parent-supplied, not localized.
    expect(screen.getByRole('alert')).toHaveTextContent('locale-stable');
  });

  it('keeps the backfill copy English on locale flip (string is hard-coded, not localized)', () => {
    renderBanners({ backfillError: 'past went boom' });
    expect(
      screen.getByText(/Past-message backfill failed/),
    ).toBeInTheDocument();
    act(() => {
      setLocale('ko');
    });
    expect(
      screen.getByText(/Past-message backfill failed/),
    ).toBeInTheDocument();
  });
});
