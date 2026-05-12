import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import FeatureView from './FeatureView';
import { setLocale } from '../../lib/i18n';

// FeatureSidebar has its own dedicated test; render a marker so we can
// assert that the right props are threaded through and that the
// onSelect plumbing reaches the parent hook.
vi.mock('./FeatureSidebar', () => ({
  default: ({
    open,
    selectedId,
    onSelect,
  }: {
    open: boolean;
    selectedId: string | null;
    onSelect: (id: string) => void;
  }) => (
    <button
      type="button"
      data-testid="feature-sidebar"
      data-open={open ? 'true' : 'false'}
      data-selected={selectedId ?? ''}
      onClick={() => onSelect('mock-feature')}
    >
      sidebar
    </button>
  ),
}));

// Drive the selected feature id deterministically. The real hook
// reads window.location.hash + localStorage which would tie tests to
// global state ordering; replacing it lets each test pick its branch.
const setSelectedId = vi.fn();
let currentSelected: string = 'mock-feature';
vi.mock('../../lib/use-selected-feature-id', () => ({
  useSelectedFeatureId: () => [currentSelected, setSelectedId],
}));

// The real registry's load() functions pull in the heavy page modules
// (xterm, msw fixtures, the full feature pages). Override findFeature
// so the lazy boundary resolves to a trivial component in tests; we're
// asserting the view's contract here, not the pages themselves.
vi.mock('../../pages/registry', async () => {
  const actual = await vi.importActual<typeof import('../../pages/registry')>(
    '../../pages/registry',
  );
  return {
    ...actual,
    findFeature: (id: string | null) => {
      if (id === 'mock-feature') {
        return {
          id: 'mock-feature',
          labelKey: 'feature.scribe.label',
          descriptionKey: 'feature.scribe.description',
          category: 'operations' as const,
          Icon: actual.FEATURES[0].Icon,
          load: () =>
            Promise.resolve({
              default: () => (
                <div data-testid="mock-page">mock page body</div>
              ),
            }),
        };
      }
      return undefined;
    },
  };
});

beforeEach(() => {
  setLocale('en');
  setSelectedId.mockReset();
  currentSelected = 'mock-feature';
});

describe('<FeatureView>', () => {
  it('renders the FeatureSidebar marker stub', () => {
    render(<FeatureView sidebarOpen={true} />);
    expect(screen.getByTestId('feature-sidebar')).toBeInTheDocument();
  });

  it('forwards sidebarOpen=true to FeatureSidebar', () => {
    render(<FeatureView sidebarOpen={true} />);
    expect(screen.getByTestId('feature-sidebar')).toHaveAttribute(
      'data-open',
      'true',
    );
  });

  it('forwards sidebarOpen=false to FeatureSidebar', () => {
    render(<FeatureView sidebarOpen={false} />);
    expect(screen.getByTestId('feature-sidebar')).toHaveAttribute(
      'data-open',
      'false',
    );
  });

  it('forwards the current selectedId from useSelectedFeatureId to FeatureSidebar', () => {
    render(<FeatureView sidebarOpen={true} />);
    expect(screen.getByTestId('feature-sidebar')).toHaveAttribute(
      'data-selected',
      'mock-feature',
    );
  });

  it('renders a <main> region for the feature page body', () => {
    const { container } = render(<FeatureView sidebarOpen={true} />);
    expect(container.querySelector('main')).not.toBeNull();
  });

  it('renders the lazy feature page inside Suspense when a feature is selected', async () => {
    render(<FeatureView sidebarOpen={true} />);
    await waitFor(() => {
      expect(screen.getByTestId('mock-page')).toBeInTheDocument();
    });
  });

  it('renders the empty PageFrame when the selected feature id is unknown', () => {
    currentSelected = 'does-not-exist';
    render(<FeatureView sidebarOpen={true} />);
    expect(screen.getByText('Feature')).toBeInTheDocument();
    expect(
      screen.getByText('Select a feature from the sidebar.'),
    ).toBeInTheDocument();
    expect(screen.getByText('Nothing selected.')).toBeInTheDocument();
  });

  it('does not render the lazy page body when no feature is matched', () => {
    currentSelected = 'does-not-exist';
    render(<FeatureView sidebarOpen={true} />);
    expect(screen.queryByTestId('mock-page')).not.toBeInTheDocument();
  });

  it('still renders FeatureSidebar in the empty-state branch', () => {
    currentSelected = 'does-not-exist';
    render(<FeatureView sidebarOpen={true} />);
    expect(screen.getByTestId('feature-sidebar')).toBeInTheDocument();
  });

  it('passes the unknown id straight through to FeatureSidebar in the empty branch', () => {
    currentSelected = 'does-not-exist';
    render(<FeatureView sidebarOpen={true} />);
    expect(screen.getByTestId('feature-sidebar')).toHaveAttribute(
      'data-selected',
      'does-not-exist',
    );
  });

  it('calls setSelectedId from useSelectedFeatureId when FeatureSidebar fires onSelect', async () => {
    const user = userEvent.setup();
    render(<FeatureView sidebarOpen={true} />);
    await user.click(screen.getByTestId('feature-sidebar'));
    expect(setSelectedId).toHaveBeenCalledTimes(1);
    expect(setSelectedId).toHaveBeenCalledWith('mock-feature');
  });

  it('wraps the layout in a flex row container that fills the available height', () => {
    const { container } = render(<FeatureView sidebarOpen={true} />);
    const root = container.firstChild as HTMLElement;
    expect(root).toHaveClass('flex');
    expect(root).toHaveClass('min-h-0');
    expect(root).toHaveClass('flex-1');
  });

  it('keeps overflow hidden on the outer layout container', () => {
    const { container } = render(<FeatureView sidebarOpen={true} />);
    const root = container.firstChild as HTMLElement;
    expect(root).toHaveClass('overflow-hidden');
  });

  it('renders the empty-state title inside a CardTitle wrapper', () => {
    currentSelected = 'does-not-exist';
    render(<FeatureView sidebarOpen={true} />);
    expect(screen.getByText('Feature')).toHaveClass('font-semibold');
  });

  it('applies the main region padding (p-3 / md:p-6) class set', () => {
    const { container } = render(<FeatureView sidebarOpen={true} />);
    const main = container.querySelector('main');
    expect(main).toHaveClass('p-3');
    expect(main).toHaveClass('md:p-6');
  });

  it('re-renders empty-state copy in Korean after a locale flip', () => {
    currentSelected = 'does-not-exist';
    render(<FeatureView sidebarOpen={true} />);
    expect(screen.getByText('Feature')).toBeInTheDocument();
    // useLocale subscribes to the c4:locale-changed event and re-renders
    // via setState; wrap setLocale in act() so the update flushes before
    // we assert the next frame.
    act(() => {
      setLocale('ko');
    });
    expect(screen.queryByText('Feature')).not.toBeInTheDocument();
  });
});
