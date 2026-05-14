import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { setLocale } from '../lib/i18n';
import type { UseCleanupState, CleanupResponse } from '../lib/use-cleanup';
import type { ToastState } from '../lib/use-toast';
import type { ToastType } from '../components/Toast';

// Cleanup.tsx wires PageFrame + two hooks (useCleanup, useToast) and a
// nested ConfirmDialog for the destructive "commit" path. Stub all
// three so each test drives a single branch without touching fetch or
// the dialog focus-trap. The dialog mock surfaces preview + buttons so
// the confirm/cancel routes are testable.

const previewMock = vi.fn(async () => {});
const executeCleanupMock = vi.fn(async () => {});
const commitMock = vi.fn(() => {});
const setConfirmOpenMock = vi.fn((_: boolean) => {});
const showToastMock = vi.fn((_m: string, _t: ToastType) => {});
const dismissToastMock = vi.fn(() => {});

let hookState: UseCleanupState = {
  data: null,
  loading: false,
  error: null,
  busy: false,
  confirmOpen: false,
  setConfirmOpen: setConfirmOpenMock,
  preview: previewMock,
  executeCleanup: executeCleanupMock,
  commit: commitMock,
};

let toastState: ToastState | null = null;

vi.mock('../lib/use-cleanup', () => ({
  useCleanup: (): UseCleanupState => hookState,
}));

vi.mock('../lib/use-toast', () => ({
  useToast: () => ({
    toast: toastState,
    showToast: showToastMock,
    dismissToast: dismissToastMock,
  }),
}));

vi.mock('../components/PageDescriptionBanner', () => ({
  PageDescriptionBanner: () => (
    <div data-testid="page-description-banner" />
  ),
}));

vi.mock('../components/HelpUIRoot', () => ({
  openHelpDrawer: vi.fn(),
}));

vi.mock('../components/ConfirmDialog', () => ({
  ConfirmDialog: (props: {
    open: boolean;
    title: string;
    busy?: boolean;
    confirmLabel?: string;
    cancelLabel?: string;
    preview?: React.ReactNode;
    onConfirm: () => void;
    onCancel: () => void;
  }) =>
    props.open ? (
      <div role="dialog" aria-label={props.title} data-busy={props.busy ? '1' : '0'}>
        <div data-testid="confirm-preview">{props.preview}</div>
        <button type="button" onClick={props.onConfirm}>
          {props.confirmLabel || 'Confirm'}
        </button>
        <button type="button" onClick={props.onCancel}>
          {props.cancelLabel || 'Cancel'}
        </button>
      </div>
    ) : null,
}));

import Cleanup from './Cleanup';

function makeCleanupData(over: Partial<CleanupResponse> = {}): CleanupResponse {
  return {
    dryRun: true,
    branches: [],
    worktrees: [],
    directories: [],
    ...over,
  };
}

beforeEach(() => {
  setLocale('en');
  previewMock.mockReset();
  previewMock.mockResolvedValue(undefined);
  executeCleanupMock.mockReset();
  executeCleanupMock.mockResolvedValue(undefined);
  commitMock.mockReset();
  setConfirmOpenMock.mockReset();
  showToastMock.mockReset();
  dismissToastMock.mockReset();
  hookState = {
    data: null,
    loading: false,
    error: null,
    busy: false,
    confirmOpen: false,
    setConfirmOpen: setConfirmOpenMock,
    preview: previewMock,
    executeCleanup: executeCleanupMock,
    commit: commitMock,
  };
  toastState = null;
});

describe('<Cleanup>', () => {
  it('renders the page title in the frame header', () => {
    render(<Cleanup />);
    expect(screen.getByText('Cleanup')).toBeInTheDocument();
  });

  it('renders the page description in the frame header', () => {
    render(<Cleanup />);
    expect(
      screen.getByText(/Remove orphan c4\/ branches/),
    ).toBeInTheDocument();
  });

  it('renders the dry-run button', () => {
    render(<Cleanup />);
    expect(
      screen.getByRole('button', { name: 'Dry-run' }),
    ).toBeInTheDocument();
  });

  it('renders the commit (Clean up) button', () => {
    render(<Cleanup />);
    expect(
      screen.getByRole('button', { name: 'Clean up' }),
    ).toBeInTheDocument();
  });

  it('renders the PageDescriptionBanner marker', () => {
    render(<Cleanup />);
    expect(screen.getByTestId('page-description-banner')).toBeInTheDocument();
  });

  it('fires preview when the dry-run button is clicked', async () => {
    const user = userEvent.setup();
    render(<Cleanup />);
    await user.click(screen.getByRole('button', { name: 'Dry-run' }));
    expect(previewMock).toHaveBeenCalledTimes(1);
  });

  it('disables the dry-run button while loading', () => {
    hookState = { ...hookState, loading: true };
    render(<Cleanup />);
    expect(
      screen.getByRole('button', { name: 'Dry-run' }),
    ).toBeDisabled();
  });

  it('disables the dry-run button while busy', () => {
    hookState = { ...hookState, busy: true };
    render(<Cleanup />);
    expect(
      screen.getByRole('button', { name: 'Dry-run' }),
    ).toBeDisabled();
  });

  it('applies the animate-spin class on the dry-run icon while loading', () => {
    hookState = { ...hookState, loading: true };
    render(<Cleanup />);
    const btn = screen.getByRole('button', { name: 'Dry-run' });
    const icon = btn.querySelector('svg');
    expect(icon?.getAttribute('class') || '').toContain('animate-spin');
  });

  it('disables the commit button when there is nothing to clean up', () => {
    hookState = { ...hookState, data: makeCleanupData() };
    render(<Cleanup />);
    expect(
      screen.getByRole('button', { name: 'Clean up' }),
    ).toBeDisabled();
  });

  it('disables the commit button while data is still loading', () => {
    hookState = { ...hookState, loading: true, data: null };
    render(<Cleanup />);
    expect(
      screen.getByRole('button', { name: 'Clean up' }),
    ).toBeDisabled();
  });

  it('enables the commit button when there is something to clean up', () => {
    hookState = {
      ...hookState,
      data: makeCleanupData({ branches: ['c4/old'] }),
    };
    render(<Cleanup />);
    expect(
      screen.getByRole('button', { name: 'Clean up' }),
    ).toBeEnabled();
  });

  it('fires commit when the Clean up button is clicked', async () => {
    hookState = {
      ...hookState,
      data: makeCleanupData({ branches: ['c4/old'] }),
    };
    const user = userEvent.setup();
    render(<Cleanup />);
    await user.click(screen.getByRole('button', { name: 'Clean up' }));
    expect(commitMock).toHaveBeenCalledTimes(1);
  });

  it('disables the commit button while busy', () => {
    hookState = {
      ...hookState,
      busy: true,
      data: makeCleanupData({ branches: ['c4/old'] }),
    };
    render(<Cleanup />);
    expect(
      screen.getByRole('button', { name: 'Clean up' }),
    ).toBeDisabled();
  });

  it('applies the animate-spin class on the commit icon while busy', () => {
    hookState = {
      ...hookState,
      busy: true,
      data: makeCleanupData({ branches: ['c4/old'] }),
    };
    render(<Cleanup />);
    const btn = screen.getByRole('button', { name: 'Clean up' });
    const icon = btn.querySelector('svg');
    expect(icon?.getAttribute('class') || '').toContain('animate-spin');
  });

  it('renders the error panel via role=alert when the hook reports an error', () => {
    hookState = { ...hookState, error: 'boom' };
    render(<Cleanup />);
    expect(screen.getByRole('alert')).toHaveTextContent('boom');
  });

  it('renders the loading skeleton when loading with no data yet', () => {
    hookState = { ...hookState, loading: true, data: null };
    render(<Cleanup />);
    // The LoadingSkeleton wrapper uses role=status. EmptyPanel also
    // uses role=status — gate on data being null so only the
    // skeleton is in the tree here.
    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  it('does NOT render the skeleton when data is already present', () => {
    hookState = {
      ...hookState,
      loading: true,
      data: makeCleanupData({ branches: ['c4/old'] }),
    };
    render(<Cleanup />);
    // role=status from EmptyPanel is gated on total === 0, so here
    // only the (non-status) list panels render — no role=status.
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('renders the empty-cleanup hint when the data set is empty', () => {
    hookState = { ...hookState, data: makeCleanupData() };
    render(<Cleanup />);
    expect(
      screen.getByText(/Nothing to clean up/),
    ).toBeInTheDocument();
  });

  it('renders the empty illustration alongside the empty-cleanup hint', () => {
    hookState = { ...hookState, data: makeCleanupData() };
    render(<Cleanup />);
    expect(
      screen.getByTestId('cleanup-empty-illustration'),
    ).toBeInTheDocument();
  });

  it('renders the branches panel when branches exist', () => {
    hookState = {
      ...hookState,
      data: makeCleanupData({ branches: ['c4/a', 'c4/b'] }),
    };
    render(<Cleanup />);
    expect(screen.getByText('Branches (2)')).toBeInTheDocument();
    expect(screen.getByText('c4/a')).toBeInTheDocument();
    expect(screen.getByText('c4/b')).toBeInTheDocument();
  });

  it('renders the worktrees panel when worktrees exist', () => {
    hookState = {
      ...hookState,
      data: makeCleanupData({ worktrees: ['/tmp/w1'] }),
    };
    render(<Cleanup />);
    expect(screen.getByText('Worktrees (1)')).toBeInTheDocument();
    expect(screen.getByText('/tmp/w1')).toBeInTheDocument();
  });

  it('renders the directories panel when directories exist', () => {
    hookState = {
      ...hookState,
      data: makeCleanupData({ directories: ['/tmp/d1'] }),
    };
    render(<Cleanup />);
    expect(screen.getByText('Directories (1)')).toBeInTheDocument();
    expect(screen.getByText('/tmp/d1')).toBeInTheDocument();
  });

  it('does NOT render a list panel when its group has no items', () => {
    hookState = {
      ...hookState,
      data: makeCleanupData({ branches: ['c4/a'] }),
    };
    render(<Cleanup />);
    expect(screen.queryByText(/Worktrees \(\d+\)/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Directories \(\d+\)/)).not.toBeInTheDocument();
  });

  it('does NOT render the confirm dialog when confirmOpen is false', () => {
    render(<Cleanup />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('renders the confirm dialog when confirmOpen is true', () => {
    hookState = { ...hookState, confirmOpen: true };
    render(<Cleanup />);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('passes the preview groups into the dialog', () => {
    hookState = {
      ...hookState,
      confirmOpen: true,
      data: makeCleanupData({
        branches: ['c4/a'],
        worktrees: ['/tmp/w'],
        directories: ['/tmp/d'],
      }),
    };
    render(<Cleanup />);
    const preview = screen.getByTestId('confirm-preview');
    expect(preview).toHaveTextContent('c4/a');
    expect(preview).toHaveTextContent('/tmp/w');
    expect(preview).toHaveTextContent('/tmp/d');
  });

  it('fires executeCleanup when the dialog confirm button is clicked', async () => {
    hookState = { ...hookState, confirmOpen: true };
    const user = userEvent.setup();
    render(<Cleanup />);
    await user.click(screen.getByRole('button', { name: 'Confirm' }));
    expect(executeCleanupMock).toHaveBeenCalledTimes(1);
  });

  it('fires setConfirmOpen(false) when the dialog cancel button is clicked', async () => {
    hookState = { ...hookState, confirmOpen: true };
    const user = userEvent.setup();
    render(<Cleanup />);
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(setConfirmOpenMock).toHaveBeenCalledWith(false);
  });

  it('renders the toast slot when the toast state is populated', () => {
    toastState = { id: 1, message: 'cleanup done', type: 'success' };
    render(<Cleanup />);
    expect(screen.getByText('cleanup done')).toBeInTheDocument();
  });

  it('does NOT render any toast when the slot is null', () => {
    render(<Cleanup />);
    expect(screen.queryByText('cleanup done')).not.toBeInTheDocument();
  });

  it('re-renders after the locale flips without crashing', () => {
    const { container } = render(<Cleanup />);
    expect(screen.getByText('Cleanup')).toBeInTheDocument();
    act(() => {
      setLocale('ko');
    });
    expect(container.firstChild).toBeInTheDocument();
  });
});
