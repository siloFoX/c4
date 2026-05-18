import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { setLocale } from '../lib/i18n';
import type { TemplateItem, UseTemplatesState } from '../lib/use-templates';

// Templates.tsx wires PageFrame + a single hook (useTemplates) and
// adds a local filter input. Stub the hook + PageDescriptionBanner +
// Toast so each test drives a single branch without booting fetch.

const refreshMock = vi.fn(async () => {});

let hookState: UseTemplatesState = {
  items: [],
  loading: false,
  error: null,
  refresh: refreshMock,
};

vi.mock('../lib/use-templates', () => ({
  useTemplates: (): UseTemplatesState => hookState,
}));

vi.mock('../components/PageDescriptionBanner', () => ({
  PageDescriptionBanner: () => (
    <div data-testid="page-description-banner" />
  ),
}));

vi.mock('../components/HelpUIRoot', () => ({
  openHelpDrawer: vi.fn(),
}));

interface CapturedToastProps {
  message: string;
  type: string;
}

let lastToastProps: CapturedToastProps | null = null;

vi.mock('../components/Toast', () => ({
  default: (props: CapturedToastProps & { onDismiss: () => void }) => {
    lastToastProps = { message: props.message, type: props.type };
    return (
      <div
        data-testid="toast"
        data-message={props.message}
        data-type={props.type}
      />
    );
  },
}));

import Templates from './Templates';

function makeTemplate(over: Partial<TemplateItem> = {}): TemplateItem {
  return {
    name: 'planner',
    description: 'planner template',
    model: 'opus',
    effort: 'max',
    profile: 'web',
    source: 'builtin',
    ...over,
  };
}

beforeEach(() => {
  setLocale('en');
  refreshMock.mockReset();
  refreshMock.mockResolvedValue(undefined);
  hookState = {
    items: [],
    loading: false,
    error: null,
    refresh: refreshMock,
  };
  lastToastProps = null;
});

describe('<Templates>', () => {
  it('renders the page title in the frame header', () => {
    render(<Templates />);
    expect(screen.getByText('Templates')).toBeInTheDocument();
  });

  it('renders the page description in the frame header', () => {
    render(<Templates />);
    expect(
      screen.getByText(/Reusable worker templates/),
    ).toBeInTheDocument();
  });

  it('renders the filter input with the right accessible label', () => {
    render(<Templates />);
    expect(screen.getByLabelText('Filter templates')).toBeInTheDocument();
  });

  it('renders the add button', () => {
    render(<Templates />);
    expect(screen.getByRole('button', { name: /Add/ })).toBeInTheDocument();
  });

  it('renders the refresh button via its sr-only label', () => {
    render(<Templates />);
    expect(
      screen.getByRole('button', { name: 'Refresh' }),
    ).toBeInTheDocument();
  });

  it('fires the hook refresh handler when refresh is clicked', async () => {
    hookState = {
      ...hookState,
      items: [makeTemplate()],
    };
    const user = userEvent.setup();
    render(<Templates />);
    await user.click(screen.getByRole('button', { name: 'Refresh' }));
    expect(refreshMock).toHaveBeenCalledTimes(1);
  });

  it('disables refresh while loading', () => {
    hookState = { ...hookState, loading: true };
    render(<Templates />);
    expect(screen.getByRole('button', { name: 'Refresh' })).toBeDisabled();
  });

  it('renders the error panel via role=alert when the hook reports an error', () => {
    hookState = { ...hookState, error: 'boom' };
    render(<Templates />);
    expect(screen.getByRole('alert')).toHaveTextContent('boom');
  });

  it('renders the loading skeleton when loading with no items yet', () => {
    // (v1.11.273, TODO 11.255) Loading state migrated from
    // LoadingSkeleton (role=status, aria-live=polite) to
    // Skeleton.List (role=status, aria-hidden=true -- consistent
    // with the rest of the Skeleton family). aria-hidden hides
    // the node from getByRole's accessibility-tree query, so
    // the assertion now goes through the data-testid that the
    // page wires onto the loading wrapper.
    hookState = { ...hookState, loading: true, items: [] };
    render(<Templates />);
    expect(screen.getByTestId('templates-loading')).toBeInTheDocument();
  });

  it('renders the empty-templates hint when not loading and items empty', () => {
    hookState = { ...hookState, loading: false, items: [] };
    render(<Templates />);
    expect(screen.getByText(/No templates defined/)).toBeInTheDocument();
  });

  it('renders the empty illustration alongside the empty hint', () => {
    hookState = { ...hookState, loading: false, items: [] };
    render(<Templates />);
    expect(
      screen.getByTestId('templates-empty-illustration'),
    ).toBeInTheDocument();
  });

  it('renders one row per template in the list', () => {
    hookState = {
      ...hookState,
      items: [
        makeTemplate({ name: 'planner' }),
        makeTemplate({ name: 'implementer' }),
      ],
    };
    render(<Templates />);
    expect(screen.getByText('planner')).toBeInTheDocument();
    expect(screen.getByText('implementer')).toBeInTheDocument();
  });

  it('renders the source / model / effort / profile badges for a template entry', () => {
    hookState = {
      ...hookState,
      items: [
        makeTemplate({
          name: 'planner',
          source: 'builtin',
          model: 'opus',
          effort: 'max',
          profile: 'web',
        }),
      ],
    };
    render(<Templates />);
    expect(screen.getByText('builtin')).toBeInTheDocument();
    expect(screen.getByText('opus')).toBeInTheDocument();
    expect(screen.getByText('max')).toBeInTheDocument();
    expect(screen.getByText('web')).toBeInTheDocument();
  });

  it('renders the description text for a template entry when present', () => {
    hookState = {
      ...hookState,
      items: [
        makeTemplate({ name: 'planner', description: 'a planning template' }),
      ],
    };
    render(<Templates />);
    expect(screen.getByText('a planning template')).toBeInTheDocument();
  });

  it('hides the description block when description is undefined', () => {
    hookState = {
      ...hookState,
      items: [makeTemplate({ name: 'planner', description: undefined })],
    };
    render(<Templates />);
    expect(
      screen.queryByText('planner template'),
    ).not.toBeInTheDocument();
  });

  it('hides the source badge when source is undefined', () => {
    hookState = {
      ...hookState,
      items: [makeTemplate({ name: 'p', source: undefined })],
    };
    render(<Templates />);
    expect(screen.queryByText('builtin')).not.toBeInTheDocument();
  });

  it('hides the model badge when model is undefined', () => {
    hookState = {
      ...hookState,
      items: [makeTemplate({ name: 'p', model: undefined })],
    };
    render(<Templates />);
    expect(screen.queryByText('opus')).not.toBeInTheDocument();
  });

  it('hides the effort badge when effort is undefined', () => {
    hookState = {
      ...hookState,
      items: [makeTemplate({ name: 'p', effort: undefined })],
    };
    render(<Templates />);
    expect(screen.queryByText('max')).not.toBeInTheDocument();
  });

  it('hides the profile badge when profile is undefined', () => {
    hookState = {
      ...hookState,
      items: [makeTemplate({ name: 'p', profile: undefined })],
    };
    render(<Templates />);
    // "web" was the profile chip; without profile it should not surface.
    expect(screen.queryByText('web')).not.toBeInTheDocument();
  });

  it('renders the per-row ListActionMenu with Edit + Remove actions inside', async () => {
    // (v1.11.280, TODO 11.262) Per-row Edit / Remove buttons
    // migrated to the canonical ListActionMenu. Open the menu via
    // its data-testid trigger and verify the action rows appear.
    hookState = {
      ...hookState,
      items: [makeTemplate({ name: 'planner' })],
    };
    const user = userEvent.setup();
    render(<Templates />);
    const trigger = screen.getByTestId('templates-row-actions-planner');
    await user.click(trigger);
    expect(screen.getByText('Edit')).toBeInTheDocument();
    expect(screen.getByText('Remove')).toBeInTheDocument();
  });

  it('fires a not-implemented toast when the add button is clicked', async () => {
    const user = userEvent.setup();
    render(<Templates />);
    await user.click(screen.getByRole('button', { name: /Add/ }));
    expect(screen.getByTestId('toast')).toBeInTheDocument();
    expect(lastToastProps?.message).toMatch(/not implemented/);
  });

  it('uses the info tone for the not-implemented toast', async () => {
    const user = userEvent.setup();
    render(<Templates />);
    await user.click(screen.getByRole('button', { name: /Add/ }));
    expect(lastToastProps?.type).toBe('info');
  });

  it('fires a not-implemented toast when the Edit action is clicked', async () => {
    hookState = {
      ...hookState,
      items: [makeTemplate({ name: 'planner' })],
    };
    const user = userEvent.setup();
    render(<Templates />);
    // (v1.11.280, TODO 11.262) Open the per-row menu first, then
    // click the Edit row.
    await user.click(screen.getByTestId('templates-row-actions-planner'));
    await user.click(screen.getByText('Edit'));
    expect(screen.getByTestId('toast')).toBeInTheDocument();
  });

  it('fires a not-implemented toast when the Remove action is clicked', async () => {
    hookState = {
      ...hookState,
      items: [makeTemplate({ name: 'planner' })],
    };
    const user = userEvent.setup();
    render(<Templates />);
    // (v1.11.280, TODO 11.262) Same migration as the Edit test
    // above -- the destructive Remove action lives inside the
    // ListActionMenu now.
    await user.click(screen.getByTestId('templates-row-actions-planner'));
    await user.click(screen.getByText('Remove'));
    expect(screen.getByTestId('toast')).toBeInTheDocument();
  });

  it('filters rows by name when the filter input has a match', async () => {
    hookState = {
      ...hookState,
      items: [
        makeTemplate({ name: 'alpha', description: 'first', model: 'a-model' }),
        makeTemplate({ name: 'beta', description: 'second', model: 'b-model' }),
      ],
    };
    const user = userEvent.setup();
    render(<Templates />);
    await user.type(screen.getByLabelText('Filter templates'), 'alpha');
    expect(screen.getByText('alpha')).toBeInTheDocument();
    expect(screen.queryByText('beta')).not.toBeInTheDocument();
  });

  it('filters rows by description when the filter matches the description text', async () => {
    hookState = {
      ...hookState,
      items: [
        makeTemplate({ name: 'a', description: 'fancy desc', model: 'a-model' }),
        makeTemplate({ name: 'b', description: 'other thing', model: 'b-model' }),
      ],
    };
    const user = userEvent.setup();
    render(<Templates />);
    await user.type(screen.getByLabelText('Filter templates'), 'fancy');
    expect(screen.getByText('a')).toBeInTheDocument();
    expect(screen.queryByText('b')).not.toBeInTheDocument();
  });

  it('filters rows by model when the filter matches the model name', async () => {
    hookState = {
      ...hookState,
      items: [
        makeTemplate({ name: 'a', description: 'first', model: 'opus' }),
        makeTemplate({ name: 'b', description: 'second', model: 'haiku' }),
      ],
    };
    const user = userEvent.setup();
    render(<Templates />);
    await user.type(screen.getByLabelText('Filter templates'), 'haiku');
    expect(screen.getByText('b')).toBeInTheDocument();
    expect(screen.queryByText('a')).not.toBeInTheDocument();
  });

  it('renders the empty hint when the filter excludes every row', async () => {
    hookState = {
      ...hookState,
      items: [makeTemplate({ name: 'planner' })],
    };
    const user = userEvent.setup();
    render(<Templates />);
    await user.type(
      screen.getByLabelText('Filter templates'),
      'zzz-not-there',
    );
    expect(screen.getByText(/No templates defined/)).toBeInTheDocument();
  });

  it('controlled filter input reflects the typed value', async () => {
    const user = userEvent.setup();
    render(<Templates />);
    const input = screen.getByLabelText('Filter templates') as HTMLInputElement;
    await user.type(input, 'planner');
    expect(input.value).toBe('planner');
  });

  it('renders all rows in a single <ul> wrapper', () => {
    hookState = {
      ...hookState,
      items: [
        makeTemplate({ name: 'a' }),
        makeTemplate({ name: 'b' }),
      ],
    };
    const { container } = render(<Templates />);
    // (v1.11.336, TODO 11.318) Page now contains additional
    // UL siblings (the Tabs primitive renders its own
    // role=tablist UL, etc) and per-row ListActionMenu
    // dropdowns mount their own nested lists. Count only
    // the direct child <li> rows of the templates-list UL.
    const ul = container.querySelector(
      '[data-section="templates-list"]',
    ) as HTMLUListElement | null;
    expect(ul).not.toBeNull();
    if (ul) {
      const directChildren = Array.from(ul.children).filter(
        (el) => el.tagName === 'LI',
      );
      expect(directChildren.length).toBe(2);
    }
  });

  it('keeps the toast slot empty until an action is fired', () => {
    hookState = {
      ...hookState,
      items: [makeTemplate({ name: 'planner' })],
    };
    render(<Templates />);
    expect(screen.queryByTestId('toast')).not.toBeInTheDocument();
  });

  it('preserves the filter input value across rerenders', async () => {
    hookState = {
      ...hookState,
      items: [makeTemplate({ name: 'planner' })],
    };
    const user = userEvent.setup();
    const { rerender } = render(<Templates />);
    const input = screen.getByLabelText('Filter templates') as HTMLInputElement;
    await user.type(input, 'plan');
    expect(input.value).toBe('plan');
    rerender(<Templates />);
    expect(
      (screen.getByLabelText('Filter templates') as HTMLInputElement).value,
    ).toBe('plan');
  });

  it('re-renders after the locale flips without crashing', () => {
    const { container } = render(<Templates />);
    expect(screen.getByText('Templates')).toBeInTheDocument();
    act(() => {
      setLocale('ko');
    });
    expect(container.firstChild).toBeInTheDocument();
  });

  // (v1.11.336, TODO 11.318) Redesign polish coverage.

  describe('source-grouping Tabs', () => {
    it('renders three tabs (All / Built-in / Custom)', () => {
      hookState = {
        ...hookState,
        items: [
          makeTemplate({ name: 'web', source: 'builtin' }),
          makeTemplate({ name: 'mine', source: 'custom' }),
        ],
      };
      render(<Templates />);
      expect(
        screen.getByRole('tab', { name: /All/i }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole('tab', { name: /Built-in/i }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole('tab', { name: /Custom/i }),
      ).toBeInTheDocument();
    });

    it('All tab is default and shows every template', () => {
      hookState = {
        ...hookState,
        items: [
          makeTemplate({ name: 'tpl-a', source: 'builtin', profile: '' }),
          makeTemplate({ name: 'tpl-b', source: 'custom', profile: '' }),
        ],
      };
      render(<Templates />);
      expect(screen.getByText('tpl-a')).toBeInTheDocument();
      expect(screen.getByText('tpl-b')).toBeInTheDocument();
    });

    it('Built-in tab filters to source=builtin', async () => {
      hookState = {
        ...hookState,
        items: [
          makeTemplate({ name: 'tpl-a', source: 'builtin', profile: '' }),
          makeTemplate({ name: 'tpl-b', source: 'custom', profile: '' }),
        ],
      };
      const user = userEvent.setup();
      render(<Templates />);
      await user.click(screen.getByRole('tab', { name: /Built-in/i }));
      expect(screen.getByText('tpl-a')).toBeInTheDocument();
      expect(screen.queryByText('tpl-b')).not.toBeInTheDocument();
    });

    it('Custom tab filters to non-builtin sources', async () => {
      hookState = {
        ...hookState,
        items: [
          makeTemplate({ name: 'tpl-a', source: 'builtin', profile: '' }),
          makeTemplate({ name: 'tpl-b', source: 'custom', profile: '' }),
        ],
      };
      const user = userEvent.setup();
      render(<Templates />);
      await user.click(screen.getByRole('tab', { name: /Custom/i }));
      expect(screen.getByText('tpl-b')).toBeInTheDocument();
      expect(screen.queryByText('tpl-a')).not.toBeInTheDocument();
    });

    it('tab labels carry the current count chip', () => {
      hookState = {
        ...hookState,
        items: [
          makeTemplate({ name: 'tpl-a', source: 'builtin', profile: '' }),
          makeTemplate({ name: 'tpl-b', source: 'custom', profile: '' }),
          makeTemplate({ name: 'tpl-c', source: 'custom', profile: '' }),
        ],
      };
      render(<Templates />);
      expect(
        screen.getByRole('tab', { name: /All \(3\)/ }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole('tab', { name: /Built-in \(1\)/ }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole('tab', { name: /Custom \(2\)/ }),
      ).toBeInTheDocument();
    });
  });

  describe('inline Textarea body editor', () => {
    it('renders the body textarea inside the import form', () => {
      render(<Templates />);
      const body = screen.getByTestId('templates-import-body');
      expect(body.tagName).toBe('TEXTAREA');
      expect(body.getAttribute('aria-label')).toBe('Template body');
    });

    it('typing into the body field updates the value', async () => {
      const user = userEvent.setup();
      render(<Templates />);
      const body = screen.getByTestId(
        'templates-import-body',
      ) as HTMLTextAreaElement;
      await user.type(body, 'Hello world');
      expect(body.value).toBe('Hello world');
    });
  });
});
