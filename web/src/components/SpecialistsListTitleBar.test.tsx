import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { setLocale } from '../lib/i18n';

// SpecialistsListTitleBar renders the master-pane title row
// (title + Add + Refresh) plus the optional action-error alert
// and the SpecialistsAddPanel beneath it. Tests stub the
// AddPanel as a thin marker so we do not pull in
// useSpecialistsAddPropose. The title bar itself is pure
// controlled JSX, so we drive the loading / addOpen /
// actionError prop space and assert button labels, aria
// attributes, disabled gating, alert visibility, and that
// onToggleAdd / onRefresh / onCloseAdd / onAdded fire with the
// expected payloads.

vi.mock('./SpecialistsAddPanel', () => ({
  default: ({
    open,
    onClose,
    onAdded,
  }: {
    open: boolean;
    onClose: () => void;
    onAdded: (id: string) => void;
  }) => (
    <div data-testid="add-panel" data-open={open ? 'true' : 'false'}>
      <button type="button" data-testid="add-close" onClick={onClose}>
        close
      </button>
      <button
        type="button"
        data-testid="add-added"
        onClick={() => onAdded('new-spec-id')}
      >
        added
      </button>
    </div>
  ),
}));

import SpecialistsListTitleBar from './SpecialistsListTitleBar';

beforeEach(() => {
  setLocale('en');
});

function renderBar(
  overrides: Partial<Parameters<typeof SpecialistsListTitleBar>[0]> = {},
) {
  const props = {
    loading: false,
    addOpen: false,
    actionError: null as string | null,
    onToggleAdd: vi.fn(),
    onCloseAdd: vi.fn(),
    onAdded: vi.fn(),
    onRefresh: vi.fn(),
    ...overrides,
  };
  const utils = render(<SpecialistsListTitleBar {...props} />);
  const user = userEvent.setup();
  return { ...utils, user, props };
}

describe('<SpecialistsListTitleBar>', () => {
  it('renders the Specialists title', () => {
    renderBar();
    expect(screen.getByText('Specialists')).toBeInTheDocument();
  });

  it('renders the Add specialist button with the configured aria-label', () => {
    renderBar();
    expect(
      screen.getByRole('button', { name: 'Add specialist' }),
    ).toBeInTheDocument();
  });

  it('renders the Refresh button with the configured aria-label', () => {
    renderBar();
    expect(
      screen.getByRole('button', { name: 'Refresh specialists' }),
    ).toBeInTheDocument();
  });

  it('renders the Add button with the common.add visible label', () => {
    renderBar();
    const btn = screen.getByRole('button', { name: 'Add specialist' });
    expect(btn).toHaveTextContent('Add');
  });

  it('renders the Refresh button with the common.refresh visible label', () => {
    renderBar();
    const btn = screen.getByRole('button', { name: 'Refresh specialists' });
    expect(btn).toHaveTextContent('Refresh');
  });

  it('sets aria-expanded=false on the Add button when addOpen is false', () => {
    renderBar({ addOpen: false });
    expect(
      screen.getByRole('button', { name: 'Add specialist' }),
    ).toHaveAttribute('aria-expanded', 'false');
  });

  it('sets aria-expanded=true on the Add button when addOpen is true', () => {
    renderBar({ addOpen: true });
    expect(
      screen.getByRole('button', { name: 'Add specialist' }),
    ).toHaveAttribute('aria-expanded', 'true');
  });

  it('does not disable the Refresh button when loading is false', () => {
    renderBar({ loading: false });
    expect(
      screen.getByRole('button', { name: 'Refresh specialists' }),
    ).not.toBeDisabled();
  });

  it('disables the Refresh button when loading is true', () => {
    renderBar({ loading: true });
    expect(
      screen.getByRole('button', { name: 'Refresh specialists' }),
    ).toBeDisabled();
  });

  it('does not disable the Add button when loading is true (Add stays clickable)', () => {
    renderBar({ loading: true });
    expect(
      screen.getByRole('button', { name: 'Add specialist' }),
    ).not.toBeDisabled();
  });

  it('renders the spin class on the refresh icon when loading is true', () => {
    const { container } = renderBar({ loading: true });
    const icon = container.querySelector('.animate-spin');
    expect(icon).not.toBeNull();
  });

  it('does not render the spin class on the refresh icon when loading is false', () => {
    const { container } = renderBar({ loading: false });
    const icon = container.querySelector('.animate-spin');
    expect(icon).toBeNull();
  });

  it('does NOT render an action-error alert when actionError is null', () => {
    renderBar({ actionError: null });
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('renders an action-error alert with the supplied text when actionError is set', () => {
    renderBar({ actionError: 'failed to refresh' });
    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('failed to refresh');
  });

  it('applies the destructive tone class on the action-error alert', () => {
    renderBar({ actionError: 'oops' });
    const alert = screen.getByRole('alert');
    expect(alert.className).toMatch(/text-destructive/);
  });

  it('renders the AddPanel child marker', () => {
    renderBar();
    expect(screen.getByTestId('add-panel')).toBeInTheDocument();
  });

  it('forwards addOpen=false to the AddPanel', () => {
    renderBar({ addOpen: false });
    expect(screen.getByTestId('add-panel')).toHaveAttribute(
      'data-open',
      'false',
    );
  });

  it('forwards addOpen=true to the AddPanel', () => {
    renderBar({ addOpen: true });
    expect(screen.getByTestId('add-panel')).toHaveAttribute(
      'data-open',
      'true',
    );
  });

  it('fires onToggleAdd when the Add button is clicked', async () => {
    const onToggleAdd = vi.fn();
    const { user } = renderBar({ onToggleAdd });
    await user.click(screen.getByRole('button', { name: 'Add specialist' }));
    expect(onToggleAdd).toHaveBeenCalledTimes(1);
  });

  it('fires onRefresh when the Refresh button is clicked', async () => {
    const onRefresh = vi.fn();
    const { user } = renderBar({ onRefresh });
    await user.click(
      screen.getByRole('button', { name: 'Refresh specialists' }),
    );
    expect(onRefresh).toHaveBeenCalledTimes(1);
  });

  it('does NOT fire onRefresh when the Refresh button is disabled (loading)', async () => {
    const onRefresh = vi.fn();
    const { user } = renderBar({ onRefresh, loading: true });
    await user.click(
      screen.getByRole('button', { name: 'Refresh specialists' }),
    );
    expect(onRefresh).not.toHaveBeenCalled();
  });

  it('fires onCloseAdd when the AddPanel fires its close callback', async () => {
    const onCloseAdd = vi.fn();
    const { user } = renderBar({ onCloseAdd });
    await user.click(screen.getByTestId('add-close'));
    expect(onCloseAdd).toHaveBeenCalledTimes(1);
  });

  it('fires onAdded with the new id from the AddPanel', async () => {
    const onAdded = vi.fn();
    const { user } = renderBar({ onAdded });
    await user.click(screen.getByTestId('add-added'));
    expect(onAdded).toHaveBeenCalledWith('new-spec-id');
  });

  it('does not fire any callback on initial render', () => {
    const onToggleAdd = vi.fn();
    const onRefresh = vi.fn();
    const onCloseAdd = vi.fn();
    const onAdded = vi.fn();
    renderBar({ onToggleAdd, onRefresh, onCloseAdd, onAdded });
    expect(onToggleAdd).not.toHaveBeenCalled();
    expect(onRefresh).not.toHaveBeenCalled();
    expect(onCloseAdd).not.toHaveBeenCalled();
    expect(onAdded).not.toHaveBeenCalled();
  });

  it('rerendering with addOpen flipping true updates aria-expanded + marker', () => {
    const { rerender, props } = renderBar({ addOpen: false });
    expect(
      screen.getByRole('button', { name: 'Add specialist' }),
    ).toHaveAttribute('aria-expanded', 'false');
    rerender(<SpecialistsListTitleBar {...props} addOpen={true} />);
    expect(
      screen.getByRole('button', { name: 'Add specialist' }),
    ).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByTestId('add-panel')).toHaveAttribute(
      'data-open',
      'true',
    );
  });

  it('rerendering with a new actionError shows the alert', () => {
    const { rerender, props } = renderBar({ actionError: null });
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    rerender(
      <SpecialistsListTitleBar {...props} actionError="new error appeared" />,
    );
    expect(screen.getByRole('alert')).toHaveTextContent('new error appeared');
  });

  it('rerendering with actionError flipping back to null hides the alert', () => {
    const { rerender, props } = renderBar({ actionError: 'oops' });
    expect(screen.getByRole('alert')).toBeInTheDocument();
    rerender(<SpecialistsListTitleBar {...props} actionError={null} />);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('re-renders translated labels when the locale flips to ko', () => {
    renderBar();
    expect(
      screen.getByRole('button', { name: 'Add specialist' }),
    ).toBeInTheDocument();
    act(() => {
      setLocale('ko');
    });
    expect(
      screen.queryByRole('button', { name: 'Add specialist' }),
    ).not.toBeInTheDocument();
  });
});
