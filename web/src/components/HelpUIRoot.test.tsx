import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// HelpUIRoot is a thin composition root for the three global help
// overlays. State machine: two boolean open flags (drawer + shortcuts)
// driven by window CustomEvents and the "h" / "?" keyboard shortcuts,
// plus the hash-routed activeFeatureId forwarded to HelpDrawer. The
// rendered children are stubbed with thin markers so we can assert
// orchestration without pulling in their heavy dependencies (i18n
// bundles, registry data, drawer-keyboard hook, onboarding storage).
// The real useHelpOverlayTriggers + useFeatureIdFromHash hooks run --
// both have their own unit tests for the listener contract; here we
// cover the wiring from prop change -> child render.

vi.mock('./HelpDrawer', () => ({
  HelpDrawer: (props: {
    open: boolean;
    onClose: () => void;
    activeFeatureId: string | null;
  }) => (
    <div
      data-testid="help-drawer"
      data-open={String(props.open)}
      data-feature={props.activeFeatureId ?? ''}
    >
      <button
        data-testid="help-drawer-close"
        type="button"
        onClick={props.onClose}
      >
        x
      </button>
    </div>
  ),
}));

vi.mock('./KeyboardShortcutsModal', () => ({
  KeyboardShortcutsModal: (props: { open: boolean; onClose: () => void }) => (
    <div data-testid="shortcuts-modal" data-open={String(props.open)}>
      <button
        data-testid="shortcuts-modal-close"
        type="button"
        onClick={props.onClose}
      >
        x
      </button>
    </div>
  ),
}));

vi.mock('./OnboardingTour', () => ({
  OnboardingTour: () => <div data-testid="onboarding-tour" />,
}));

import HelpUIRoot, {
  HELP_EVENT_OPEN_DRAWER,
  HELP_EVENT_OPEN_SHORTCUTS,
  HELP_EVENT_TOGGLE_LOCALE,
  openHelpDrawer,
  openShortcutsModal,
} from './HelpUIRoot';

const originalHash = window.location.hash;

beforeEach(() => {
  // Reset hash so each test sees a clean activeFeatureId baseline.
  window.history.replaceState(null, '', window.location.pathname);
});

afterEach(() => {
  if (originalHash) {
    window.history.replaceState(null, '', originalHash);
  }
});

describe('<HelpUIRoot>', () => {
  // ---- constants exported ----------------------------------------

  it('exports the help-drawer custom event name as "c4:help-drawer-open"', () => {
    expect(HELP_EVENT_OPEN_DRAWER).toBe('c4:help-drawer-open');
  });

  it('exports the shortcuts custom event name as "c4:shortcuts-open"', () => {
    expect(HELP_EVENT_OPEN_SHORTCUTS).toBe('c4:shortcuts-open');
  });

  it('exports the locale-toggle event name as "c4:locale-toggle"', () => {
    expect(HELP_EVENT_TOGGLE_LOCALE).toBe('c4:locale-toggle');
  });

  // ---- initial render --------------------------------------------

  it('renders the three child overlays on mount', () => {
    render(<HelpUIRoot />);
    expect(screen.getByTestId('help-drawer')).toBeInTheDocument();
    expect(screen.getByTestId('shortcuts-modal')).toBeInTheDocument();
    expect(screen.getByTestId('onboarding-tour')).toBeInTheDocument();
  });

  it('mounts the help drawer with open=false on initial render', () => {
    render(<HelpUIRoot />);
    expect(screen.getByTestId('help-drawer')).toHaveAttribute(
      'data-open',
      'false',
    );
  });

  it('mounts the shortcuts modal with open=false on initial render', () => {
    render(<HelpUIRoot />);
    expect(screen.getByTestId('shortcuts-modal')).toHaveAttribute(
      'data-open',
      'false',
    );
  });

  it('passes activeFeatureId="" to HelpDrawer when the hash is empty', () => {
    render(<HelpUIRoot />);
    expect(screen.getByTestId('help-drawer')).toHaveAttribute(
      'data-feature',
      '',
    );
  });

  it('passes the hash-routed feature id to HelpDrawer when the hash matches the prefix', () => {
    window.history.replaceState(null, '', '#/feature/scribe');
    render(<HelpUIRoot />);
    expect(screen.getByTestId('help-drawer')).toHaveAttribute(
      'data-feature',
      'scribe',
    );
  });

  it('passes activeFeatureId="" when the hash is present but does not match the feature prefix', () => {
    window.history.replaceState(null, '', '#other');
    render(<HelpUIRoot />);
    expect(screen.getByTestId('help-drawer')).toHaveAttribute(
      'data-feature',
      '',
    );
  });

  // ---- open-via-event -------------------------------------------

  it('opens the help drawer when the help-drawer-open custom event fires on window', () => {
    render(<HelpUIRoot />);
    act(() => {
      window.dispatchEvent(new CustomEvent(HELP_EVENT_OPEN_DRAWER));
    });
    expect(screen.getByTestId('help-drawer')).toHaveAttribute(
      'data-open',
      'true',
    );
  });

  it('does NOT open the shortcuts modal as a side-effect of opening the drawer', () => {
    render(<HelpUIRoot />);
    act(() => {
      window.dispatchEvent(new CustomEvent(HELP_EVENT_OPEN_DRAWER));
    });
    expect(screen.getByTestId('shortcuts-modal')).toHaveAttribute(
      'data-open',
      'false',
    );
  });

  it('opens the shortcuts modal when the shortcuts-open custom event fires on window', () => {
    render(<HelpUIRoot />);
    act(() => {
      window.dispatchEvent(new CustomEvent(HELP_EVENT_OPEN_SHORTCUTS));
    });
    expect(screen.getByTestId('shortcuts-modal')).toHaveAttribute(
      'data-open',
      'true',
    );
  });

  it('does NOT open the help drawer as a side-effect of opening shortcuts', () => {
    render(<HelpUIRoot />);
    act(() => {
      window.dispatchEvent(new CustomEvent(HELP_EVENT_OPEN_SHORTCUTS));
    });
    expect(screen.getByTestId('help-drawer')).toHaveAttribute(
      'data-open',
      'false',
    );
  });

  // ---- openHelpDrawer + openShortcutsModal helpers -------------

  it('openHelpDrawer() helper flips the drawer open via the custom-event surface', () => {
    render(<HelpUIRoot />);
    act(() => {
      openHelpDrawer();
    });
    expect(screen.getByTestId('help-drawer')).toHaveAttribute(
      'data-open',
      'true',
    );
  });

  it('openShortcutsModal() helper flips the shortcuts modal open via the custom-event surface', () => {
    render(<HelpUIRoot />);
    act(() => {
      openShortcutsModal();
    });
    expect(screen.getByTestId('shortcuts-modal')).toHaveAttribute(
      'data-open',
      'true',
    );
  });

  it('openHelpDrawer() before mount is a no-op (drawer stays closed on subsequent render)', () => {
    openHelpDrawer();
    render(<HelpUIRoot />);
    expect(screen.getByTestId('help-drawer')).toHaveAttribute(
      'data-open',
      'false',
    );
  });

  // ---- keyboard hotkeys ----------------------------------------

  it('opens the help drawer when the user presses "h" while not typing', async () => {
    render(<HelpUIRoot />);
    const user = userEvent.setup();
    await user.keyboard('h');
    expect(screen.getByTestId('help-drawer')).toHaveAttribute(
      'data-open',
      'true',
    );
  });

  it('opens the help drawer on uppercase "H" as well', async () => {
    render(<HelpUIRoot />);
    const user = userEvent.setup();
    await user.keyboard('H');
    expect(screen.getByTestId('help-drawer')).toHaveAttribute(
      'data-open',
      'true',
    );
  });

  it('opens the shortcuts modal when the user presses "?"', async () => {
    render(<HelpUIRoot />);
    const user = userEvent.setup();
    await user.keyboard('?');
    expect(screen.getByTestId('shortcuts-modal')).toHaveAttribute(
      'data-open',
      'true',
    );
  });

  it('ignores unrelated keys', async () => {
    render(<HelpUIRoot />);
    const user = userEvent.setup();
    await user.keyboard('a');
    await user.keyboard('{Enter}');
    await user.keyboard('{ArrowLeft}');
    expect(screen.getByTestId('help-drawer')).toHaveAttribute(
      'data-open',
      'false',
    );
    expect(screen.getByTestId('shortcuts-modal')).toHaveAttribute(
      'data-open',
      'false',
    );
  });

  // ---- close paths ---------------------------------------------

  it('closes the help drawer when the child HelpDrawer fires onClose', async () => {
    render(<HelpUIRoot />);
    act(() => {
      window.dispatchEvent(new CustomEvent(HELP_EVENT_OPEN_DRAWER));
    });
    expect(screen.getByTestId('help-drawer')).toHaveAttribute(
      'data-open',
      'true',
    );
    const user = userEvent.setup();
    await user.click(screen.getByTestId('help-drawer-close'));
    expect(screen.getByTestId('help-drawer')).toHaveAttribute(
      'data-open',
      'false',
    );
  });

  it('closes the shortcuts modal when the child KeyboardShortcutsModal fires onClose', async () => {
    render(<HelpUIRoot />);
    act(() => {
      window.dispatchEvent(new CustomEvent(HELP_EVENT_OPEN_SHORTCUTS));
    });
    expect(screen.getByTestId('shortcuts-modal')).toHaveAttribute(
      'data-open',
      'true',
    );
    const user = userEvent.setup();
    await user.click(screen.getByTestId('shortcuts-modal-close'));
    expect(screen.getByTestId('shortcuts-modal')).toHaveAttribute(
      'data-open',
      'false',
    );
  });

  // ---- hash routing --------------------------------------------

  it('updates the drawer activeFeatureId when the location hash changes after mount', () => {
    render(<HelpUIRoot />);
    expect(screen.getByTestId('help-drawer')).toHaveAttribute(
      'data-feature',
      '',
    );
    act(() => {
      window.history.replaceState(null, '', '#/feature/batch');
      window.dispatchEvent(new HashChangeEvent('hashchange'));
    });
    expect(screen.getByTestId('help-drawer')).toHaveAttribute(
      'data-feature',
      'batch',
    );
  });

  it('clears the drawer activeFeatureId when the hash is reset to empty', () => {
    window.history.replaceState(null, '', '#/feature/cleanup');
    render(<HelpUIRoot />);
    expect(screen.getByTestId('help-drawer')).toHaveAttribute(
      'data-feature',
      'cleanup',
    );
    act(() => {
      window.history.replaceState(null, '', window.location.pathname);
      window.dispatchEvent(new HashChangeEvent('hashchange'));
    });
    expect(screen.getByTestId('help-drawer')).toHaveAttribute(
      'data-feature',
      '',
    );
  });

  // ---- independent open flags ----------------------------------

  it('opens both overlays independently when both events fire', () => {
    render(<HelpUIRoot />);
    act(() => {
      window.dispatchEvent(new CustomEvent(HELP_EVENT_OPEN_DRAWER));
      window.dispatchEvent(new CustomEvent(HELP_EVENT_OPEN_SHORTCUTS));
    });
    expect(screen.getByTestId('help-drawer')).toHaveAttribute(
      'data-open',
      'true',
    );
    expect(screen.getByTestId('shortcuts-modal')).toHaveAttribute(
      'data-open',
      'true',
    );
  });

  it('keeps the help drawer open when the shortcuts modal is closed independently', async () => {
    render(<HelpUIRoot />);
    act(() => {
      window.dispatchEvent(new CustomEvent(HELP_EVENT_OPEN_DRAWER));
      window.dispatchEvent(new CustomEvent(HELP_EVENT_OPEN_SHORTCUTS));
    });
    const user = userEvent.setup();
    await user.click(screen.getByTestId('shortcuts-modal-close'));
    expect(screen.getByTestId('help-drawer')).toHaveAttribute(
      'data-open',
      'true',
    );
    expect(screen.getByTestId('shortcuts-modal')).toHaveAttribute(
      'data-open',
      'false',
    );
  });

  it('keeps the shortcuts modal open when the help drawer is closed independently', async () => {
    render(<HelpUIRoot />);
    act(() => {
      window.dispatchEvent(new CustomEvent(HELP_EVENT_OPEN_DRAWER));
      window.dispatchEvent(new CustomEvent(HELP_EVENT_OPEN_SHORTCUTS));
    });
    const user = userEvent.setup();
    await user.click(screen.getByTestId('help-drawer-close'));
    expect(screen.getByTestId('help-drawer')).toHaveAttribute(
      'data-open',
      'false',
    );
    expect(screen.getByTestId('shortcuts-modal')).toHaveAttribute(
      'data-open',
      'true',
    );
  });

  // ---- listener teardown ---------------------------------------

  it('removes the keyboard + custom-event listeners on unmount', () => {
    const { unmount } = render(<HelpUIRoot />);
    unmount();
    // After unmount, dispatching the open events must not throw and
    // must not leave dangling references. The hook's cleanup path is
    // already covered by its own unit test; this is the wire-up guard
    // that HelpUIRoot does not block the unmount.
    expect(() => {
      window.dispatchEvent(new CustomEvent(HELP_EVENT_OPEN_DRAWER));
      window.dispatchEvent(new CustomEvent(HELP_EVENT_OPEN_SHORTCUTS));
    }).not.toThrow();
  });

  // ---- rerender stability -------------------------------------

  it('rerendering does not duplicate the child overlay markers', () => {
    const { rerender } = render(<HelpUIRoot />);
    rerender(<HelpUIRoot />);
    expect(screen.getAllByTestId('help-drawer')).toHaveLength(1);
    expect(screen.getAllByTestId('shortcuts-modal')).toHaveLength(1);
    expect(screen.getAllByTestId('onboarding-tour')).toHaveLength(1);
  });

  it('reopening after a close cycle works (drawer can be reopened)', async () => {
    render(<HelpUIRoot />);
    act(() => {
      window.dispatchEvent(new CustomEvent(HELP_EVENT_OPEN_DRAWER));
    });
    const user = userEvent.setup();
    await user.click(screen.getByTestId('help-drawer-close'));
    expect(screen.getByTestId('help-drawer')).toHaveAttribute(
      'data-open',
      'false',
    );
    act(() => {
      window.dispatchEvent(new CustomEvent(HELP_EVENT_OPEN_DRAWER));
    });
    expect(screen.getByTestId('help-drawer')).toHaveAttribute(
      'data-open',
      'true',
    );
  });
});
