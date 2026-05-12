import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CircleSlash, Pause, Play, RefreshCw, RotateCcw, X } from 'lucide-react';
import { setLocale } from '../lib/i18n';
import ControlPanelActions from './ControlPanelActions';
import type { ActionKind, ActionTone, SingleAction } from './ControlPanel';

// ControlPanelActions is the single-action grid extracted from
// ControlPanel. It owns no hook state of its own (apart from
// useLocale, which only re-renders on locale flips). Every prop
// in the union is passed down by ControlPanel, so the test drives
// each variation directly with vi.fn() callbacks and asserts
// each button fires its callback with the correct action payload.

const KIND_LABELS: Record<ActionKind, string> = {
  pause: 'PauseLabel',
  resume: 'ResumeLabel',
  cancel: 'CancelLabel',
  restart: 'RestartLabel',
  rollback: 'RollbackLabel',
  close: 'CloseLabel',
};

const KIND_TONE: Record<ActionKind, ActionTone> = {
  pause: 'neutral',
  resume: 'neutral',
  cancel: 'warn',
  restart: 'warn',
  rollback: 'danger',
  close: 'danger',
};

const KIND_ENDPOINT: Record<ActionKind, string> = {
  pause: '/api/key',
  resume: '/api/key',
  cancel: '/api/cancel',
  restart: '/api/restart',
  rollback: '/api/rollback',
  close: '/api/close',
};

const ALL_KINDS: ActionKind[] = [
  'pause',
  'resume',
  'cancel',
  'restart',
  'rollback',
  'close',
];

function makeAction(
  kind: ActionKind,
  override: Partial<SingleAction> = {},
): SingleAction {
  const iconMap: Record<ActionKind, JSX.Element> = {
    pause: <Pause data-testid="icon-pause" />,
    resume: <Play data-testid="icon-resume" />,
    cancel: <CircleSlash data-testid="icon-cancel" />,
    restart: <RefreshCw data-testid="icon-restart" />,
    rollback: <RotateCcw data-testid="icon-rollback" />,
    close: <X data-testid="icon-close" />,
  };
  return {
    kind,
    label: KIND_LABELS[kind],
    description: `${KIND_LABELS[kind]} hover description`,
    endpoint: KIND_ENDPOINT[kind],
    body: { name: 'w1' },
    confirm: KIND_TONE[kind] === 'neutral' ? null : `confirm ${kind}?`,
    tone: KIND_TONE[kind],
    icon: iconMap[kind],
    successMessage: (n) => `${kind} ok ${n}`,
    ...override,
  };
}

function makeAllActions(): SingleAction[] {
  return ALL_KINDS.map((k) => makeAction(k));
}

interface RenderOpts {
  workerName?: string;
  actions?: SingleAction[];
  busyKind?: ActionKind | null;
  onRunSingle?: (a: SingleAction) => void;
}

function renderView(over: RenderOpts = {}) {
  const onRunSingle = over.onRunSingle ?? vi.fn();
  const props = {
    workerName: over.workerName ?? 'w1',
    actions: over.actions ?? makeAllActions(),
    busyKind: over.busyKind ?? null,
    onRunSingle,
  };
  const utils = render(<ControlPanelActions {...props} />);
  const user = userEvent.setup();
  return { ...utils, user, onRunSingle, props };
}

function getCard(): HTMLElement {
  return screen.getByLabelText('Worker control panel');
}

function getButton(label: string): HTMLButtonElement {
  const re = new RegExp(label);
  return screen.getByRole('button', { name: re }) as HTMLButtonElement;
}

beforeEach(() => {
  setLocale('en');
});

describe('<ControlPanelActions>', () => {
  // ---- default render -------------------------------------------

  it('renders a Card surface with the localized worker.label as aria-label', () => {
    renderView();
    expect(screen.getByLabelText('Worker control panel')).toBeInTheDocument();
  });

  it('renders the localized "Control" CardTitle copy', () => {
    renderView();
    expect(screen.getByText('Control')).toBeInTheDocument();
  });

  it('renders the localized CardDescription that mentions the workerName', () => {
    renderView({ workerName: 'alpha-1' });
    expect(
      screen.getByText(/Actions for alpha-1\./),
    ).toBeInTheDocument();
  });

  it('renders one button per action when given all six action kinds', () => {
    renderView();
    const card = getCard();
    expect(within(card).getAllByRole('button')).toHaveLength(6);
  });

  it('renders exactly one button when given a single-element actions array', () => {
    renderView({ actions: [makeAction('pause')] });
    expect(within(getCard()).getAllByRole('button')).toHaveLength(1);
  });

  it('renders zero buttons when given an empty actions array', () => {
    renderView({ actions: [] });
    expect(within(getCard()).queryAllByRole('button')).toHaveLength(0);
  });

  // ---- per-kind label rendering ---------------------------------

  it('renders the pause action label inside its button', () => {
    renderView();
    expect(getButton('PauseLabel')).toBeInTheDocument();
  });

  it('renders the resume action label inside its button', () => {
    renderView();
    expect(getButton('ResumeLabel')).toBeInTheDocument();
  });

  it('renders the cancel action label inside its button', () => {
    renderView();
    expect(getButton('CancelLabel')).toBeInTheDocument();
  });

  it('renders the restart action label inside its button', () => {
    renderView();
    expect(getButton('RestartLabel')).toBeInTheDocument();
  });

  it('renders the rollback action label inside its button', () => {
    renderView();
    expect(getButton('RollbackLabel')).toBeInTheDocument();
  });

  it('renders the close action label inside its button', () => {
    renderView();
    expect(getButton('CloseLabel')).toBeInTheDocument();
  });

  // ---- description sub-line -------------------------------------

  it('renders each action description text inside the button body', () => {
    renderView();
    expect(
      screen.getByText('PauseLabel hover description'),
    ).toBeInTheDocument();
    expect(
      screen.getByText('CloseLabel hover description'),
    ).toBeInTheDocument();
  });

  it('attaches the action description as the title attribute on each button', () => {
    renderView();
    expect(getButton('PauseLabel')).toHaveAttribute(
      'title',
      'PauseLabel hover description',
    );
    expect(getButton('RollbackLabel')).toHaveAttribute(
      'title',
      'RollbackLabel hover description',
    );
  });

  // ---- icon slot ------------------------------------------------

  it('renders the JSX icon passed in via the action.icon prop', () => {
    renderView();
    expect(screen.getByTestId('icon-pause')).toBeInTheDocument();
    expect(screen.getByTestId('icon-resume')).toBeInTheDocument();
    expect(screen.getByTestId('icon-cancel')).toBeInTheDocument();
    expect(screen.getByTestId('icon-restart')).toBeInTheDocument();
    expect(screen.getByTestId('icon-rollback')).toBeInTheDocument();
    expect(screen.getByTestId('icon-close')).toBeInTheDocument();
  });

  it('renders the icon as the first inline marker inside the button label span', () => {
    renderView({ actions: [makeAction('pause')] });
    expect(
      within(getButton('PauseLabel')).getByTestId('icon-pause'),
    ).toBeInTheDocument();
  });

  // ---- tone -> variant class mapping ----------------------------

  it('applies the secondary variant class on neutral-tone buttons (pause / resume)', () => {
    renderView();
    expect(getButton('PauseLabel').className).toMatch(/bg-secondary/);
    expect(getButton('ResumeLabel').className).toMatch(/bg-secondary/);
  });

  it('applies the outline variant class on warn-tone buttons (cancel / restart)', () => {
    renderView();
    expect(getButton('CancelLabel').className).toMatch(/border-input/);
    expect(getButton('RestartLabel').className).toMatch(/border-input/);
  });

  it('applies the destructive variant class on danger-tone buttons (rollback / close)', () => {
    renderView();
    expect(getButton('RollbackLabel').className).toMatch(/bg-destructive/);
    expect(getButton('CloseLabel').className).toMatch(/bg-destructive/);
  });

  // ---- onRunSingle dispatcher per kind --------------------------

  it('fires onRunSingle with the pause action when the pause button is clicked', async () => {
    const { user, onRunSingle } = renderView();
    await user.click(getButton('PauseLabel'));
    expect(onRunSingle).toHaveBeenCalledTimes(1);
    expect(onRunSingle).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'pause', endpoint: '/api/key' }),
    );
  });

  it('fires onRunSingle with the resume action when the resume button is clicked', async () => {
    const { user, onRunSingle } = renderView();
    await user.click(getButton('ResumeLabel'));
    expect(onRunSingle).toHaveBeenCalledTimes(1);
    expect(onRunSingle).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'resume', endpoint: '/api/key' }),
    );
  });

  it('fires onRunSingle with the cancel action when the cancel button is clicked', async () => {
    const { user, onRunSingle } = renderView();
    await user.click(getButton('CancelLabel'));
    expect(onRunSingle).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'cancel', endpoint: '/api/cancel' }),
    );
  });

  it('fires onRunSingle with the restart action when the restart button is clicked', async () => {
    const { user, onRunSingle } = renderView();
    await user.click(getButton('RestartLabel'));
    expect(onRunSingle).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'restart', endpoint: '/api/restart' }),
    );
  });

  it('fires onRunSingle with the rollback action when the rollback button is clicked', async () => {
    const { user, onRunSingle } = renderView();
    await user.click(getButton('RollbackLabel'));
    expect(onRunSingle).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'rollback', endpoint: '/api/rollback' }),
    );
  });

  it('fires onRunSingle with the close action when the close button is clicked', async () => {
    const { user, onRunSingle } = renderView();
    await user.click(getButton('CloseLabel'));
    expect(onRunSingle).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'close', endpoint: '/api/close' }),
    );
  });

  it('forwards the full SingleAction object (body + confirm + tone) into onRunSingle', async () => {
    const action = makeAction('cancel', {
      body: { name: 'bravo' },
      confirm: 'sure?',
    });
    const { user, onRunSingle } = renderView({ actions: [action] });
    await user.click(getButton('CancelLabel'));
    expect(onRunSingle).toHaveBeenCalledWith(action);
  });

  it('fires onRunSingle exactly once even on rapid double-click', async () => {
    const { user, onRunSingle } = renderView();
    await user.click(getButton('PauseLabel'));
    await user.click(getButton('PauseLabel'));
    expect(onRunSingle).toHaveBeenCalledTimes(2);
  });

  // ---- keyboard handling ---------------------------------------

  it('triggers onRunSingle when the focused button receives Enter', async () => {
    const { user, onRunSingle } = renderView();
    const btn = getButton('PauseLabel');
    btn.focus();
    await user.keyboard('{Enter}');
    expect(onRunSingle).toHaveBeenCalledTimes(1);
    expect(onRunSingle).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'pause' }),
    );
  });

  it('triggers onRunSingle when the focused button receives Space', async () => {
    const { user, onRunSingle } = renderView();
    const btn = getButton('CloseLabel');
    btn.focus();
    await user.keyboard(' ');
    expect(onRunSingle).toHaveBeenCalledTimes(1);
    expect(onRunSingle).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'close' }),
    );
  });

  it('cycles focus across action buttons via Tab', async () => {
    const { user } = renderView({
      actions: [makeAction('pause'), makeAction('close')],
    });
    await user.tab();
    expect(getButton('PauseLabel')).toHaveFocus();
    await user.tab();
    expect(getButton('CloseLabel')).toHaveFocus();
  });

  // ---- busy / disabled state -----------------------------------

  it('leaves every button enabled when busyKind is null', () => {
    renderView({ busyKind: null });
    for (const kind of ALL_KINDS) {
      expect(getButton(KIND_LABELS[kind])).not.toBeDisabled();
    }
  });

  it('disables ALL buttons whenever any busyKind is set (parent owns the lock)', () => {
    renderView({ busyKind: 'restart' });
    for (const kind of ALL_KINDS) {
      expect(getButton(KIND_LABELS[kind])).toBeDisabled();
    }
  });

  it('shows the busy "{label} ..." text only on the action whose kind matches busyKind', () => {
    renderView({ busyKind: 'restart' });
    expect(screen.getByText('RestartLabel ...')).toBeInTheDocument();
    expect(screen.queryByText('PauseLabel ...')).not.toBeInTheDocument();
    expect(screen.queryByText('CloseLabel ...')).not.toBeInTheDocument();
  });

  it('shows the idle label on the non-matching actions while one kind is busy', () => {
    renderView({ busyKind: 'close' });
    expect(screen.getByText('CloseLabel ...')).toBeInTheDocument();
    expect(screen.getByText('PauseLabel')).toBeInTheDocument();
    expect(screen.getByText('RestartLabel')).toBeInTheDocument();
  });

  it('shows the idle label on every button when busyKind is null', () => {
    renderView({ busyKind: null });
    for (const kind of ALL_KINDS) {
      expect(screen.getByText(KIND_LABELS[kind])).toBeInTheDocument();
    }
  });

  it('does NOT fire onRunSingle when a disabled button is clicked (busy state)', async () => {
    const { user, onRunSingle } = renderView({ busyKind: 'cancel' });
    await user.click(getButton('CancelLabel'));
    expect(onRunSingle).not.toHaveBeenCalled();
  });

  it('does NOT fire onRunSingle for sibling buttons while another kind is busy', async () => {
    const { user, onRunSingle } = renderView({ busyKind: 'cancel' });
    await user.click(getButton('PauseLabel'));
    await user.click(getButton('CloseLabel'));
    expect(onRunSingle).not.toHaveBeenCalled();
  });

  // ---- workerName prop --------------------------------------------

  it('updates the CardDescription when workerName re-renders to a new value', () => {
    const { rerender } = renderView({ workerName: 'foo' });
    expect(screen.getByText(/Actions for foo\./)).toBeInTheDocument();
    rerender(
      <ControlPanelActions
        workerName="bar"
        actions={makeAllActions()}
        busyKind={null}
        onRunSingle={vi.fn()}
      />,
    );
    expect(screen.queryByText(/Actions for foo\./)).not.toBeInTheDocument();
    expect(screen.getByText(/Actions for bar\./)).toBeInTheDocument();
  });

  it('handles an empty workerName by interpolating an empty token into the description', () => {
    renderView({ workerName: '' });
    expect(screen.getByText(/Actions for \./)).toBeInTheDocument();
  });

  it('handles a workerName with dashes / underscores without re-encoding it', () => {
    renderView({ workerName: 'auto-w_48' });
    expect(screen.getByText(/Actions for auto-w_48\./)).toBeInTheDocument();
  });

  // ---- locale flip ----------------------------------------------

  it('re-renders the CardTitle in Korean when the locale flips to ko', () => {
    renderView();
    expect(screen.getByText('Control')).toBeInTheDocument();
    act(() => {
      setLocale('ko');
    });
    expect(screen.queryByText('Control')).not.toBeInTheDocument();
    expect(screen.getByText('제어')).toBeInTheDocument();
  });

  it('re-renders the busy template suffix in Korean when the locale flips to ko', () => {
    renderView({ busyKind: 'restart' });
    expect(screen.getByText('RestartLabel ...')).toBeInTheDocument();
    act(() => {
      setLocale('ko');
    });
    expect(screen.queryByText('RestartLabel ...')).not.toBeInTheDocument();
    expect(screen.getByText('RestartLabel 중...')).toBeInTheDocument();
  });

  it('re-renders the worker description in Korean when the locale flips to ko', () => {
    renderView({ workerName: 'alpha' });
    expect(screen.getByText(/Actions for alpha\./)).toBeInTheDocument();
    act(() => {
      setLocale('ko');
    });
    expect(screen.getByText(/alpha 워커 작업\./)).toBeInTheDocument();
  });

  // ---- structural attributes ------------------------------------

  it('sets type="button" on every rendered action button', () => {
    renderView();
    for (const kind of ALL_KINDS) {
      expect(getButton(KIND_LABELS[kind])).toHaveAttribute('type', 'button');
    }
  });

  it('exposes the localized aria-label "Worker control panel" on the Card root', () => {
    renderView();
    expect(getCard()).toHaveAttribute('aria-label', 'Worker control panel');
  });

  it('keeps the grid container as the inner layout under CardContent', () => {
    renderView({ actions: [makeAction('pause'), makeAction('close')] });
    const card = getCard();
    expect(card).toBeInTheDocument();
    expect(within(card).getAllByRole('button')).toHaveLength(2);
  });

  // ---- prop variations ------------------------------------------

  it('renders only the subset of action kinds it was given', () => {
    renderView({
      actions: [makeAction('pause'), makeAction('resume')],
    });
    expect(getButton('PauseLabel')).toBeInTheDocument();
    expect(getButton('ResumeLabel')).toBeInTheDocument();
    expect(screen.queryByText('CloseLabel')).not.toBeInTheDocument();
    expect(screen.queryByText('RollbackLabel')).not.toBeInTheDocument();
  });

  it('respects custom tone overrides supplied via the action prop', () => {
    renderView({
      actions: [makeAction('pause', { tone: 'danger' })],
    });
    expect(getButton('PauseLabel').className).toMatch(/bg-destructive/);
  });

  it('respects custom label overrides supplied via the action prop', () => {
    renderView({
      actions: [makeAction('pause', { label: 'CustomPauseText' })],
    });
    expect(
      screen.getByRole('button', { name: /CustomPauseText/ }),
    ).toBeInTheDocument();
  });

  // ---- rerender stability ---------------------------------------

  it('keeps the same set of buttons after rerendering with identical props', () => {
    const actions = makeAllActions();
    const onRunSingle = vi.fn();
    const { rerender } = render(
      <ControlPanelActions
        workerName="w1"
        actions={actions}
        busyKind={null}
        onRunSingle={onRunSingle}
      />,
    );
    expect(within(getCard()).getAllByRole('button')).toHaveLength(6);
    rerender(
      <ControlPanelActions
        workerName="w1"
        actions={actions}
        busyKind={null}
        onRunSingle={onRunSingle}
      />,
    );
    expect(within(getCard()).getAllByRole('button')).toHaveLength(6);
  });

  it('adds a new button row when an extra action is appended on rerender', () => {
    const { rerender } = render(
      <ControlPanelActions
        workerName="w1"
        actions={[makeAction('pause')]}
        busyKind={null}
        onRunSingle={vi.fn()}
      />,
    );
    expect(within(getCard()).getAllByRole('button')).toHaveLength(1);
    rerender(
      <ControlPanelActions
        workerName="w1"
        actions={[makeAction('pause'), makeAction('close')]}
        busyKind={null}
        onRunSingle={vi.fn()}
      />,
    );
    expect(within(getCard()).getAllByRole('button')).toHaveLength(2);
  });

  it('drops a button row when the actions array shrinks on rerender', () => {
    const { rerender } = render(
      <ControlPanelActions
        workerName="w1"
        actions={makeAllActions()}
        busyKind={null}
        onRunSingle={vi.fn()}
      />,
    );
    expect(within(getCard()).getAllByRole('button')).toHaveLength(6);
    rerender(
      <ControlPanelActions
        workerName="w1"
        actions={[makeAction('pause')]}
        busyKind={null}
        onRunSingle={vi.fn()}
      />,
    );
    expect(within(getCard()).getAllByRole('button')).toHaveLength(1);
  });

  it('flips a single button into busy state when busyKind transitions from null to a kind', () => {
    const onRunSingle = vi.fn();
    const { rerender } = render(
      <ControlPanelActions
        workerName="w1"
        actions={makeAllActions()}
        busyKind={null}
        onRunSingle={onRunSingle}
      />,
    );
    expect(getButton('CloseLabel')).not.toBeDisabled();
    rerender(
      <ControlPanelActions
        workerName="w1"
        actions={makeAllActions()}
        busyKind="close"
        onRunSingle={onRunSingle}
      />,
    );
    expect(getButton('CloseLabel')).toBeDisabled();
    expect(screen.getByText('CloseLabel ...')).toBeInTheDocument();
  });
});
