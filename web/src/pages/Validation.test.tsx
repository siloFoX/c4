import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { setLocale } from '../lib/i18n';
import type {
  UseValidationsState,
  ValidationResponse,
} from '../lib/use-validations';
import type { Worker } from '../types';

// Validation.tsx wires PageFrame + a single hook (useValidations)
// that fans out /api/list + /api/validation?name=<w> per worker.
// Stub the hook so each test drives a single branch of the loading
// / error / empty / per-card-state matrix without booting fetch.
// PageDescriptionBanner is stubbed to a thin marker so we are not
// asserting against its long copy.

const refreshMock = vi.fn(async () => {});

let hookState: UseValidationsState = {
  workers: [],
  validations: {},
  loading: false,
  error: null,
  refresh: refreshMock,
};

vi.mock('../lib/use-validations', () => ({
  useValidations: (): UseValidationsState => hookState,
}));

vi.mock('../components/PageDescriptionBanner', () => ({
  PageDescriptionBanner: () => (
    <div data-testid="page-description-banner" />
  ),
}));

vi.mock('../components/HelpUIRoot', () => ({
  openHelpDrawer: vi.fn(),
}));

import Validation from './Validation';

function makeWorker(over: Partial<Worker> = {}): Worker {
  return {
    name: 'demo-1',
    status: 'idle',
    branch: 'c4/demo-1',
    ...over,
  } as Worker;
}

function makeReport(over: Partial<ValidationResponse> = {}): ValidationResponse {
  return {
    name: 'demo-1',
    tests: { passed: 10, failed: 0, ok: true },
    typecheck: { ok: true, errors: 0 },
    lint: { ok: true, errors: 0, warnings: 0 },
    dirty: false,
    branch: 'c4/demo-1',
    ...over,
  };
}

beforeEach(() => {
  setLocale('en');
  refreshMock.mockReset();
  refreshMock.mockResolvedValue(undefined);
  hookState = {
    workers: [],
    validations: {},
    loading: false,
    error: null,
    refresh: refreshMock,
  };
});

describe('<Validation>', () => {
  it('renders the page title in the frame header', () => {
    render(<Validation />);
    expect(screen.getByText('Validation')).toBeInTheDocument();
  });

  it('renders the page description in the frame header', () => {
    render(<Validation />);
    expect(
      screen.getByText(/Per-worker validation object/),
    ).toBeInTheDocument();
  });

  it('renders the PageDescriptionBanner marker', () => {
    render(<Validation />);
    expect(
      screen.getByTestId('page-description-banner'),
    ).toBeInTheDocument();
  });

  it('renders the filter input with the accessible label', () => {
    render(<Validation />);
    expect(screen.getByLabelText('Filter workers')).toBeInTheDocument();
  });

  it('renders the filter input with the placeholder text', () => {
    render(<Validation />);
    expect(
      screen.getByPlaceholderText('Filter workers'),
    ).toBeInTheDocument();
  });

  it('controlled filter input reflects the typed value', async () => {
    const user = userEvent.setup();
    render(<Validation />);
    const input = screen.getByLabelText('Filter workers') as HTMLInputElement;
    await user.type(input, 'demo');
    expect(input.value).toBe('demo');
  });

  it('renders the refresh button via its sr-only label', () => {
    render(<Validation />);
    expect(
      screen.getByRole('button', { name: 'Refresh' }),
    ).toBeInTheDocument();
  });

  it('fires the hook refresh handler when refresh is clicked', async () => {
    const user = userEvent.setup();
    render(<Validation />);
    await user.click(screen.getByRole('button', { name: 'Refresh' }));
    expect(refreshMock).toHaveBeenCalledTimes(1);
  });

  it('disables the refresh button while loading', () => {
    hookState = { ...hookState, loading: true };
    render(<Validation />);
    expect(
      screen.getByRole('button', { name: 'Refresh' }),
    ).toBeDisabled();
  });

  it('applies animate-spin on the refresh icon while loading', () => {
    hookState = { ...hookState, loading: true };
    render(<Validation />);
    const btn = screen.getByRole('button', { name: 'Refresh' });
    const icon = btn.querySelector('svg');
    expect(icon?.getAttribute('class') || '').toContain('animate-spin');
  });

  it('does NOT apply animate-spin on the refresh icon when idle', () => {
    render(<Validation />);
    const btn = screen.getByRole('button', { name: 'Refresh' });
    const icon = btn.querySelector('svg');
    expect(icon?.getAttribute('class') || '').not.toContain('animate-spin');
  });

  it('renders the loading skeleton when loading with no workers yet', () => {
    hookState = { ...hookState, loading: true, workers: [] };
    render(<Validation />);
    // LoadingSkeleton uses role=status; EmptyPanel also uses role=status,
    // so when the skeleton path is taken the empty hint should not appear.
    expect(screen.getByRole('status')).toBeInTheDocument();
    expect(
      screen.queryByText(/No workers to validate/),
    ).not.toBeInTheDocument();
  });

  it('renders the empty hint when not loading and no workers', () => {
    render(<Validation />);
    expect(
      screen.getByText(/No workers to validate/),
    ).toBeInTheDocument();
  });

  it('renders the error panel via role=alert when the hook reports an error', () => {
    hookState = { ...hookState, error: 'fetch broke' };
    render(<Validation />);
    expect(screen.getByRole('alert')).toHaveTextContent('fetch broke');
  });

  it('hides the error panel when error is null', () => {
    render(<Validation />);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('renders one card per worker', () => {
    hookState = {
      ...hookState,
      workers: [
        makeWorker({ name: 'w1' }),
        makeWorker({ name: 'w2' }),
      ],
      validations: {
        w1: makeReport({ name: 'w1' }),
        w2: makeReport({ name: 'w2' }),
      },
    };
    render(<Validation />);
    expect(screen.getByText('w1')).toBeInTheDocument();
    expect(screen.getByText('w2')).toBeInTheDocument();
  });

  it('renders the worker branch in the card header when set', () => {
    hookState = {
      ...hookState,
      workers: [makeWorker({ name: 'w1', branch: 'c4/feature' })],
      validations: { w1: makeReport({ name: 'w1' }) },
    };
    render(<Validation />);
    expect(screen.getByText('c4/feature')).toBeInTheDocument();
  });

  it('renders the dirty badge when the report flags dirty', () => {
    hookState = {
      ...hookState,
      workers: [makeWorker({ name: 'w1' })],
      validations: { w1: makeReport({ name: 'w1', dirty: true }) },
    };
    render(<Validation />);
    expect(screen.getByText('dirty')).toBeInTheDocument();
  });

  it('hides the dirty badge when the report is clean', () => {
    hookState = {
      ...hookState,
      workers: [makeWorker({ name: 'w1' })],
      validations: { w1: makeReport({ name: 'w1', dirty: false }) },
    };
    render(<Validation />);
    expect(screen.queryByText('dirty')).not.toBeInTheDocument();
  });

  it('renders the loading placeholder when the report is missing for a worker', () => {
    hookState = {
      ...hookState,
      workers: [makeWorker({ name: 'lonely' })],
      validations: {},
    };
    render(<Validation />);
    expect(screen.getByText('lonely')).toBeInTheDocument();
    expect(screen.getByText('Loading...')).toBeInTheDocument();
  });

  it('renders the per-worker error message when the report carries an error', () => {
    hookState = {
      ...hookState,
      workers: [makeWorker({ name: 'oops' })],
      validations: { oops: { error: 'no manifest' } },
    };
    render(<Validation />);
    expect(screen.getByText('no manifest')).toBeInTheDocument();
  });

  it('renders the Tests / Typecheck / Lint row labels when the report is populated', () => {
    hookState = {
      ...hookState,
      workers: [makeWorker({ name: 'w1' })],
      validations: { w1: makeReport({ name: 'w1' }) },
    };
    render(<Validation />);
    expect(screen.getByText('Tests')).toBeInTheDocument();
    expect(screen.getByText('Typecheck')).toBeInTheDocument();
    expect(screen.getByText('Lint')).toBeInTheDocument();
  });

  it('renders the pass badge when tests / typecheck / lint all pass', () => {
    hookState = {
      ...hookState,
      workers: [makeWorker({ name: 'w1' })],
      validations: { w1: makeReport({ name: 'w1' }) },
    };
    render(<Validation />);
    // Three rows × pass = three pass badges.
    expect(screen.getAllByText('pass')).toHaveLength(3);
  });

  it('renders the fail badge for tests when failed > 0', () => {
    hookState = {
      ...hookState,
      workers: [makeWorker({ name: 'w1' })],
      validations: {
        w1: makeReport({
          name: 'w1',
          tests: { passed: 3, failed: 2, ok: false },
        }),
      },
    };
    render(<Validation />);
    expect(screen.getAllByText('fail')).toHaveLength(1);
  });

  it('renders the n/a badge for tests when the report omits the tests slot', () => {
    hookState = {
      ...hookState,
      workers: [makeWorker({ name: 'w1' })],
      validations: {
        w1: makeReport({
          name: 'w1',
          tests: undefined,
          typecheck: undefined,
          lint: undefined,
        }),
      },
    };
    render(<Validation />);
    expect(screen.getAllByText('n/a')).toHaveLength(3);
  });

  it('renders the tests pass detail "passed/total"', () => {
    hookState = {
      ...hookState,
      workers: [makeWorker({ name: 'w1' })],
      validations: {
        w1: makeReport({
          name: 'w1',
          tests: { passed: 7, failed: 3, ok: false },
        }),
      },
    };
    render(<Validation />);
    expect(screen.getByText('7/10 pass')).toBeInTheDocument();
  });

  it('renders the typecheck errors detail', () => {
    hookState = {
      ...hookState,
      workers: [makeWorker({ name: 'w1' })],
      validations: {
        w1: makeReport({
          name: 'w1',
          typecheck: { ok: false, errors: 5 },
        }),
      },
    };
    render(<Validation />);
    expect(screen.getByText('5 errors')).toBeInTheDocument();
  });

  it('renders the lint counts detail as `<e>e / <w>w`', () => {
    hookState = {
      ...hookState,
      workers: [makeWorker({ name: 'w1' })],
      validations: {
        w1: makeReport({
          name: 'w1',
          lint: { ok: false, errors: 4, warnings: 9 },
        }),
      },
    };
    render(<Validation />);
    expect(screen.getByText('4e / 9w')).toBeInTheDocument();
  });

  it('filters worker cards when the filter input matches a name', async () => {
    hookState = {
      ...hookState,
      workers: [
        makeWorker({ name: 'alpha' }),
        makeWorker({ name: 'beta' }),
      ],
      validations: {
        alpha: makeReport({ name: 'alpha' }),
        beta: makeReport({ name: 'beta' }),
      },
    };
    const user = userEvent.setup();
    render(<Validation />);
    await user.type(screen.getByLabelText('Filter workers'), 'alpha');
    expect(screen.getByText('alpha')).toBeInTheDocument();
    expect(screen.queryByText('beta')).not.toBeInTheDocument();
  });

  it('renders the empty hint when the filter excludes every worker', async () => {
    hookState = {
      ...hookState,
      workers: [makeWorker({ name: 'alpha' })],
      validations: { alpha: makeReport({ name: 'alpha' }) },
    };
    const user = userEvent.setup();
    render(<Validation />);
    await user.type(
      screen.getByLabelText('Filter workers'),
      'zzz-not-there',
    );
    expect(
      screen.getByText(/No workers to validate/),
    ).toBeInTheDocument();
  });

  it('renders cards inside a single <ul> wrapper', () => {
    hookState = {
      ...hookState,
      workers: [
        makeWorker({ name: 'a' }),
        makeWorker({ name: 'b' }),
      ],
      validations: {
        a: makeReport({ name: 'a' }),
        b: makeReport({ name: 'b' }),
      },
    };
    const { container } = render(<Validation />);
    const ul = container.querySelector('ul');
    expect(ul).not.toBeNull();
  });

  it('forwards rerender state changes through hookState mutation', () => {
    const { rerender } = render(<Validation />);
    expect(
      screen.getByText(/No workers to validate/),
    ).toBeInTheDocument();
    hookState = {
      ...hookState,
      workers: [makeWorker({ name: 'fresh' })],
      validations: { fresh: makeReport({ name: 'fresh' }) },
    };
    rerender(<Validation />);
    expect(screen.getByText('fresh')).toBeInTheDocument();
  });

  it('re-renders after the locale flips without crashing', () => {
    const { container } = render(<Validation />);
    expect(screen.getByText('Validation')).toBeInTheDocument();
    act(() => {
      setLocale('ko');
    });
    expect(container.firstChild).toBeInTheDocument();
  });
});
