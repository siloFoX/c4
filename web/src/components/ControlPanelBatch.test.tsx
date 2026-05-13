import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { setLocale } from '../lib/i18n';
import ControlPanelBatch from './ControlPanelBatch';
import type { BatchKind, BatchOutcome } from './ControlPanel';
import type { Worker, WorkerStatus } from '../types';

// ControlPanelBatch is the batch-control Card extracted from
// ControlPanel. It owns no hook state of its own (apart from
// useLocale). The parent passes the selection Set, the selectable
// worker list, the busy / disabled flags, the last-batch outcome,
// and four callbacks for the four interaction surfaces (select-all,
// clear, per-row toggle, run-batch). Each test drives those props
// directly with vi.fn() callbacks.

function makeWorker(name: string, status: WorkerStatus = 'idle'): Worker {
  return {
    name,
    command: 'claude',
    target: 'local',
    branch: `c4/${name}`,
    worktree: `/tmp/${name}`,
    parent: null,
    scope: false,
    pid: 1234,
    status,
    unreadSnapshots: 0,
    totalSnapshots: 0,
    intervention: null,
    lastQuestion: null,
    errorCount: 0,
    phase: null,
    testFailCount: 0,
  };
}

const TWO_WORKERS: Worker[] = [makeWorker('w1'), makeWorker('w2', 'busy')];

const THREE_WORKERS: Worker[] = [
  makeWorker('w1'),
  makeWorker('w2', 'busy'),
  makeWorker('w3', 'exited'),
];

interface RenderOpts {
  selectableWorkers?: Worker[];
  selected?: Set<string>;
  selectedCount?: number;
  batchBusy?: BatchKind | null;
  disableBatch?: boolean;
  batchResults?: BatchOutcome[] | null;
  onSelectAll?: () => void;
  onClearSelection?: () => void;
  onToggleSelected?: (name: string) => void;
  onRunBatch?: (kind: BatchKind) => void;
}

function renderView(over: RenderOpts = {}) {
  const onSelectAll = over.onSelectAll ?? vi.fn();
  const onClearSelection = over.onClearSelection ?? vi.fn();
  const onToggleSelected = over.onToggleSelected ?? vi.fn();
  const onRunBatch = over.onRunBatch ?? vi.fn();
  const selected = over.selected ?? new Set<string>();
  const props = {
    selectableWorkers: over.selectableWorkers ?? TWO_WORKERS,
    selected,
    selectedCount: over.selectedCount ?? selected.size,
    batchBusy: over.batchBusy ?? null,
    disableBatch:
      over.disableBatch ??
      ((over.batchBusy ?? null) !== null ||
        (over.selectedCount ?? selected.size) === 0),
    batchResults: over.batchResults ?? null,
    onSelectAll,
    onClearSelection,
    onToggleSelected,
    onRunBatch,
  };
  const utils = render(<ControlPanelBatch {...props} />);
  const user = userEvent.setup();
  return {
    ...utils,
    user,
    onSelectAll,
    onClearSelection,
    onToggleSelected,
    onRunBatch,
    props,
  };
}

function getCard(): HTMLElement {
  return screen.getByLabelText('Batch controls');
}

function getSelectAll(): HTMLButtonElement {
  return screen.getByRole('button', { name: /Select all/ }) as HTMLButtonElement;
}

function getClear(): HTMLButtonElement {
  return screen.getByRole('button', { name: /^Clear$/ }) as HTMLButtonElement;
}

function getCancelBatch(): HTMLButtonElement {
  return screen.getByRole('button', {
    name: /^Cancel selected(?:\s\.\.\.)?$/,
  }) as HTMLButtonElement;
}

function getCloseBatch(): HTMLButtonElement {
  return screen.getByRole('button', {
    name: /^Close selected(?:\s\.\.\.)?$/,
  }) as HTMLButtonElement;
}

beforeEach(() => {
  setLocale('en');
});

describe('<ControlPanelBatch>', () => {
  // ---- default render -------------------------------------------

  it('renders a Card surface with the localized batch.label aria-label', () => {
    renderView();
    expect(screen.getByLabelText('Batch controls')).toBeInTheDocument();
  });

  it('renders the localized "Batch" CardTitle copy', () => {
    renderView();
    expect(screen.getByText('Batch')).toBeInTheDocument();
  });

  it('renders the localized CardDescription with the selectedCount interpolated', () => {
    renderView({ selectedCount: 0 });
    expect(
      screen.getByText(/^0 selected - target multiple workers/),
    ).toBeInTheDocument();
  });

  it('updates the CardDescription count when selectedCount changes', () => {
    renderView({ selectedCount: 2 });
    expect(
      screen.getByText(/^2 selected - target multiple workers/),
    ).toBeInTheDocument();
  });

  it('reflects a large selectedCount value in the CardDescription', () => {
    renderView({ selectedCount: 42 });
    expect(
      screen.getByText(/^42 selected - target multiple workers/),
    ).toBeInTheDocument();
  });

  // ---- select-all / clear toolbar -------------------------------

  it('renders the Select all and Clear buttons in the header toolbar', () => {
    renderView();
    expect(getSelectAll()).toBeInTheDocument();
    expect(getClear()).toBeInTheDocument();
  });

  it('fires onSelectAll exactly once when the Select all button is clicked', async () => {
    const { user, onSelectAll } = renderView({
      selectableWorkers: TWO_WORKERS,
    });
    await user.click(getSelectAll());
    expect(onSelectAll).toHaveBeenCalledTimes(1);
  });

  it('fires onClearSelection exactly once when the Clear button is clicked', async () => {
    const { user, onClearSelection } = renderView({
      selected: new Set(['w1']),
      selectedCount: 1,
    });
    await user.click(getClear());
    expect(onClearSelection).toHaveBeenCalledTimes(1);
  });

  it('disables Select all when no workers are selectable', () => {
    renderView({ selectableWorkers: [] });
    expect(getSelectAll()).toBeDisabled();
  });

  it('enables Select all once the worker list is non-empty', () => {
    renderView({ selectableWorkers: TWO_WORKERS });
    expect(getSelectAll()).not.toBeDisabled();
  });

  it('disables Clear when selectedCount is zero', () => {
    renderView({ selectedCount: 0 });
    expect(getClear()).toBeDisabled();
  });

  it('enables Clear once selectedCount is greater than zero', () => {
    renderView({ selected: new Set(['w1']), selectedCount: 1 });
    expect(getClear()).not.toBeDisabled();
  });

  // ---- empty workers placeholder --------------------------------

  it('renders the localized empty placeholder when selectableWorkers is empty', () => {
    renderView({ selectableWorkers: [] });
    expect(
      screen.getByText('No workers available.'),
    ).toBeInTheDocument();
  });

  it('does NOT render any worker checkbox when selectableWorkers is empty', () => {
    renderView({ selectableWorkers: [] });
    expect(screen.queryAllByRole('checkbox')).toHaveLength(0);
  });

  it('does NOT render the empty placeholder when selectableWorkers has entries', () => {
    renderView({ selectableWorkers: TWO_WORKERS });
    expect(
      screen.queryByText('No workers available.'),
    ).not.toBeInTheDocument();
  });

  // ---- worker list rendering ------------------------------------

  it('renders one li per selectable worker', () => {
    renderView({ selectableWorkers: THREE_WORKERS });
    expect(screen.getAllByRole('listitem')).toHaveLength(3);
  });

  it('renders each worker name in the row', () => {
    renderView({ selectableWorkers: TWO_WORKERS });
    expect(screen.getByText('w1')).toBeInTheDocument();
    expect(screen.getByText('w2')).toBeInTheDocument();
  });

  it('renders each worker status badge alongside the row checkbox', () => {
    renderView({ selectableWorkers: TWO_WORKERS });
    expect(screen.getByText('idle')).toBeInTheDocument();
    expect(screen.getByText('busy')).toBeInTheDocument();
  });

  it('renders each row checkbox with the tFormat-built aria-label', () => {
    renderView({ selectableWorkers: TWO_WORKERS });
    expect(screen.getByLabelText('Select w1')).toBeInTheDocument();
    expect(screen.getByLabelText('Select w2')).toBeInTheDocument();
  });

  it('marks the row checkbox as checked when its worker name is in the selected Set', () => {
    renderView({
      selectableWorkers: TWO_WORKERS,
      selected: new Set(['w1']),
      selectedCount: 1,
    });
    expect(screen.getByLabelText('Select w1')).toBeChecked();
    expect(screen.getByLabelText('Select w2')).not.toBeChecked();
  });

  it('marks all rows as checked when every worker name is in the selected Set', () => {
    renderView({
      selectableWorkers: TWO_WORKERS,
      selected: new Set(['w1', 'w2']),
      selectedCount: 2,
    });
    expect(screen.getByLabelText('Select w1')).toBeChecked();
    expect(screen.getByLabelText('Select w2')).toBeChecked();
  });

  it('renders all rows as unchecked when the selected Set is empty', () => {
    renderView({
      selectableWorkers: TWO_WORKERS,
      selected: new Set(),
      selectedCount: 0,
    });
    expect(screen.getByLabelText('Select w1')).not.toBeChecked();
    expect(screen.getByLabelText('Select w2')).not.toBeChecked();
  });

  // ---- per-row toggle callback ----------------------------------

  it('fires onToggleSelected with the worker name when a row checkbox is clicked', async () => {
    const { user, onToggleSelected } = renderView({
      selectableWorkers: TWO_WORKERS,
    });
    await user.click(screen.getByLabelText('Select w1'));
    expect(onToggleSelected).toHaveBeenCalledTimes(1);
    expect(onToggleSelected).toHaveBeenCalledWith('w1');
  });

  it('fires onToggleSelected with the second worker name when the second row is clicked', async () => {
    const { user, onToggleSelected } = renderView({
      selectableWorkers: TWO_WORKERS,
    });
    await user.click(screen.getByLabelText('Select w2'));
    expect(onToggleSelected).toHaveBeenCalledTimes(1);
    expect(onToggleSelected).toHaveBeenCalledWith('w2');
  });

  it('also fires onToggleSelected when clicking on the row label text (label association)', async () => {
    const { user, onToggleSelected } = renderView({
      selectableWorkers: [makeWorker('alpha')],
    });
    await user.click(screen.getByText('alpha'));
    expect(onToggleSelected).toHaveBeenCalledWith('alpha');
  });

  // ---- batch action buttons -------------------------------------

  it('renders the Cancel selected batch button', () => {
    renderView();
    expect(getCancelBatch()).toBeInTheDocument();
  });

  it('renders the Close selected batch button', () => {
    renderView();
    expect(getCloseBatch()).toBeInTheDocument();
  });

  it('fires onRunBatch with "cancel" when the Cancel selected button is clicked', async () => {
    const { user, onRunBatch } = renderView({
      selected: new Set(['w1']),
      selectedCount: 1,
      disableBatch: false,
    });
    await user.click(getCancelBatch());
    expect(onRunBatch).toHaveBeenCalledTimes(1);
    expect(onRunBatch).toHaveBeenCalledWith('cancel');
  });

  it('fires onRunBatch with "close" when the Close selected button is clicked', async () => {
    const { user, onRunBatch } = renderView({
      selected: new Set(['w1']),
      selectedCount: 1,
      disableBatch: false,
    });
    await user.click(getCloseBatch());
    expect(onRunBatch).toHaveBeenCalledTimes(1);
    expect(onRunBatch).toHaveBeenCalledWith('close');
  });

  it('applies the outline variant class on the Cancel selected button', () => {
    renderView();
    expect(getCancelBatch().className).toMatch(/border-input/);
  });

  it('applies the destructive variant class on the Close selected button', () => {
    renderView();
    expect(getCloseBatch().className).toMatch(/bg-destructive/);
  });

  // ---- disabled batch state -------------------------------------

  it('disables both batch buttons when disableBatch=true', () => {
    renderView({ disableBatch: true });
    expect(getCancelBatch()).toBeDisabled();
    expect(getCloseBatch()).toBeDisabled();
  });

  it('enables both batch buttons when disableBatch=false', () => {
    renderView({
      selected: new Set(['w1']),
      selectedCount: 1,
      disableBatch: false,
    });
    expect(getCancelBatch()).not.toBeDisabled();
    expect(getCloseBatch()).not.toBeDisabled();
  });

  it('does NOT fire onRunBatch when the disabled Cancel button is clicked', async () => {
    const { user, onRunBatch } = renderView({ disableBatch: true });
    await user.click(getCancelBatch());
    expect(onRunBatch).not.toHaveBeenCalled();
  });

  it('does NOT fire onRunBatch when the disabled Close button is clicked', async () => {
    const { user, onRunBatch } = renderView({ disableBatch: true });
    await user.click(getCloseBatch());
    expect(onRunBatch).not.toHaveBeenCalled();
  });

  // ---- busy text variants ---------------------------------------

  it('shows the Cancel-busy label when batchBusy="cancel"', () => {
    renderView({ batchBusy: 'cancel' });
    expect(screen.getByText('Cancel selected ...')).toBeInTheDocument();
  });

  it('shows the Close-busy label when batchBusy="close"', () => {
    renderView({ batchBusy: 'close' });
    expect(screen.getByText('Close selected ...')).toBeInTheDocument();
  });

  it('keeps the idle Close label visible when batchBusy="cancel"', () => {
    renderView({ batchBusy: 'cancel' });
    expect(screen.getByText('Close selected')).toBeInTheDocument();
    expect(screen.queryByText('Close selected ...')).not.toBeInTheDocument();
  });

  it('keeps the idle Cancel label visible when batchBusy="close"', () => {
    renderView({ batchBusy: 'close' });
    expect(screen.getByText('Cancel selected')).toBeInTheDocument();
    expect(screen.queryByText('Cancel selected ...')).not.toBeInTheDocument();
  });

  it('shows both idle labels when batchBusy is null', () => {
    renderView({ batchBusy: null });
    expect(screen.getByText('Cancel selected')).toBeInTheDocument();
    expect(screen.getByText('Close selected')).toBeInTheDocument();
  });

  // ---- batch results panel --------------------------------------

  it('does NOT render the Last batch panel when batchResults is null', () => {
    renderView({ batchResults: null });
    expect(
      screen.queryByText('Last batch results'),
    ).not.toBeInTheDocument();
  });

  it('does NOT render the Last batch panel when batchResults is an empty array', () => {
    renderView({ batchResults: [] });
    expect(
      screen.queryByText('Last batch results'),
    ).not.toBeInTheDocument();
  });

  it('renders the Last batch panel header when batchResults has entries', () => {
    renderView({
      batchResults: [{ name: 'w1', ok: true }],
    });
    expect(screen.getByText('Last batch results')).toBeInTheDocument();
  });

  it('renders one li per batch outcome in the last-batch panel', () => {
    renderView({
      batchResults: [
        { name: 'w1', ok: true },
        { name: 'w2', ok: false, error: 'boom' },
      ],
    });
    const items = screen.getAllByRole('listitem');
    expect(items.length).toBeGreaterThanOrEqual(2);
  });

  it('renders the localized status-ok suffix on successful outcomes', () => {
    renderView({
      selectableWorkers: [],
      batchResults: [{ name: 'res-1', ok: true }],
    });
    expect(screen.getByText(/^res-1/)).toBeInTheDocument();
    expect(screen.getByText(/: ok$/)).toBeInTheDocument();
  });

  it('renders the supplied error string on failed outcomes', () => {
    renderView({
      batchResults: [{ name: 'w2', ok: false, error: 'permission denied' }],
    });
    expect(
      screen.getByText(/: permission denied$/),
    ).toBeInTheDocument();
  });

  it('renders the localized fallback "failed" when a failed outcome has no error field', () => {
    renderView({
      batchResults: [{ name: 'w3', ok: false }],
    });
    expect(screen.getByText(/: failed$/)).toBeInTheDocument();
  });

  it('renders the localized fallback "failed" when a failed outcome has an empty error string', () => {
    renderView({
      batchResults: [{ name: 'w3', ok: false, error: '' }],
    });
    expect(screen.getByText(/: failed$/)).toBeInTheDocument();
  });

  it('applies the emerald color class on successful outcome rows', () => {
    renderView({
      selectableWorkers: [],
      batchResults: [{ name: 'res-1', ok: true }],
    });
    const ok = screen.getByText(/^res-1/).closest('li');
    expect(ok?.className).toMatch(/text-success/);
  });

  it('applies the destructive color class on failed outcome rows', () => {
    renderView({
      selectableWorkers: [],
      batchResults: [{ name: 'res-2', ok: false, error: 'x' }],
    });
    const fail = screen.getByText(/^res-2/).closest('li');
    expect(fail?.className).toMatch(/text-destructive/);
  });

  it('renders the worker name in font-mono inside each outcome row', () => {
    renderView({
      selectableWorkers: [],
      batchResults: [{ name: 'res-1', ok: true }],
    });
    const span = screen.getByText('res-1');
    expect(span.className).toMatch(/font-mono/);
  });

  // ---- locale flip ----------------------------------------------

  it('re-renders the CardTitle in Korean when the locale flips to ko', () => {
    renderView();
    expect(screen.getByText('Batch')).toBeInTheDocument();
    act(() => {
      setLocale('ko');
    });
    expect(screen.queryByText('Batch')).not.toBeInTheDocument();
    expect(screen.getByText('배치')).toBeInTheDocument();
  });

  it('re-renders the empty placeholder in Korean when the locale flips to ko', () => {
    renderView({ selectableWorkers: [] });
    expect(screen.getByText('No workers available.')).toBeInTheDocument();
    act(() => {
      setLocale('ko');
    });
    expect(
      screen.queryByText('No workers available.'),
    ).not.toBeInTheDocument();
    expect(screen.getByText('사용 가능한 워커가 없습니다.')).toBeInTheDocument();
  });

  it('re-renders the Cancel batch button label in Korean when the locale flips to ko', () => {
    renderView();
    expect(screen.getByText('Cancel selected')).toBeInTheDocument();
    act(() => {
      setLocale('ko');
    });
    expect(screen.queryByText('Cancel selected')).not.toBeInTheDocument();
    expect(screen.getByText('선택 항목 취소')).toBeInTheDocument();
  });

  // ---- ARIA / structural --------------------------------------

  it('exposes the localized aria-label "Batch controls" on the Card root', () => {
    renderView();
    expect(getCard()).toHaveAttribute('aria-label', 'Batch controls');
  });

  it('renders type=button on every action button in the panel', () => {
    renderView();
    expect(getSelectAll()).toHaveAttribute('type', 'button');
    expect(getClear()).toHaveAttribute('type', 'button');
    expect(getCancelBatch()).toHaveAttribute('type', 'button');
    expect(getCloseBatch()).toHaveAttribute('type', 'button');
  });

  it('renders each row checkbox with type=checkbox', () => {
    renderView({ selectableWorkers: TWO_WORKERS });
    const boxes = screen.getAllByRole('checkbox');
    expect(boxes).toHaveLength(2);
    for (const b of boxes) {
      expect(b).toHaveAttribute('type', 'checkbox');
    }
  });

  // ---- prop variation / rerender stability ----------------------

  it('rebuilds the row list when selectableWorkers changes on rerender', () => {
    const { rerender } = render(
      <ControlPanelBatch
        selectableWorkers={TWO_WORKERS}
        selected={new Set()}
        selectedCount={0}
        batchBusy={null}
        disableBatch={true}
        batchResults={null}
        onSelectAll={vi.fn()}
        onClearSelection={vi.fn()}
        onToggleSelected={vi.fn()}
        onRunBatch={vi.fn()}
      />,
    );
    expect(screen.getAllByRole('listitem')).toHaveLength(2);
    rerender(
      <ControlPanelBatch
        selectableWorkers={THREE_WORKERS}
        selected={new Set()}
        selectedCount={0}
        batchBusy={null}
        disableBatch={true}
        batchResults={null}
        onSelectAll={vi.fn()}
        onClearSelection={vi.fn()}
        onToggleSelected={vi.fn()}
        onRunBatch={vi.fn()}
      />,
    );
    expect(screen.getAllByRole('listitem')).toHaveLength(3);
  });

  it('flips a row from unchecked to checked when the selected Set adds the name on rerender', () => {
    const { rerender } = render(
      <ControlPanelBatch
        selectableWorkers={TWO_WORKERS}
        selected={new Set()}
        selectedCount={0}
        batchBusy={null}
        disableBatch={true}
        batchResults={null}
        onSelectAll={vi.fn()}
        onClearSelection={vi.fn()}
        onToggleSelected={vi.fn()}
        onRunBatch={vi.fn()}
      />,
    );
    expect(screen.getByLabelText('Select w1')).not.toBeChecked();
    rerender(
      <ControlPanelBatch
        selectableWorkers={TWO_WORKERS}
        selected={new Set(['w1'])}
        selectedCount={1}
        batchBusy={null}
        disableBatch={false}
        batchResults={null}
        onSelectAll={vi.fn()}
        onClearSelection={vi.fn()}
        onToggleSelected={vi.fn()}
        onRunBatch={vi.fn()}
      />,
    );
    expect(screen.getByLabelText('Select w1')).toBeChecked();
  });

  it('flips the batch buttons from disabled to enabled when the selection arrives on rerender', () => {
    const { rerender } = render(
      <ControlPanelBatch
        selectableWorkers={TWO_WORKERS}
        selected={new Set()}
        selectedCount={0}
        batchBusy={null}
        disableBatch={true}
        batchResults={null}
        onSelectAll={vi.fn()}
        onClearSelection={vi.fn()}
        onToggleSelected={vi.fn()}
        onRunBatch={vi.fn()}
      />,
    );
    expect(getCloseBatch()).toBeDisabled();
    rerender(
      <ControlPanelBatch
        selectableWorkers={TWO_WORKERS}
        selected={new Set(['w1'])}
        selectedCount={1}
        batchBusy={null}
        disableBatch={false}
        batchResults={null}
        onSelectAll={vi.fn()}
        onClearSelection={vi.fn()}
        onToggleSelected={vi.fn()}
        onRunBatch={vi.fn()}
      />,
    );
    expect(getCloseBatch()).not.toBeDisabled();
  });

  it('flips the Cancel button label to busy when batchBusy changes on rerender', () => {
    const { rerender } = render(
      <ControlPanelBatch
        selectableWorkers={TWO_WORKERS}
        selected={new Set(['w1'])}
        selectedCount={1}
        batchBusy={null}
        disableBatch={false}
        batchResults={null}
        onSelectAll={vi.fn()}
        onClearSelection={vi.fn()}
        onToggleSelected={vi.fn()}
        onRunBatch={vi.fn()}
      />,
    );
    expect(screen.getByText('Cancel selected')).toBeInTheDocument();
    rerender(
      <ControlPanelBatch
        selectableWorkers={TWO_WORKERS}
        selected={new Set(['w1'])}
        selectedCount={1}
        batchBusy="cancel"
        disableBatch={true}
        batchResults={null}
        onSelectAll={vi.fn()}
        onClearSelection={vi.fn()}
        onToggleSelected={vi.fn()}
        onRunBatch={vi.fn()}
      />,
    );
    expect(screen.getByText('Cancel selected ...')).toBeInTheDocument();
  });

  it('reveals the Last batch panel when batchResults transitions from null to a populated array on rerender', () => {
    const { rerender } = render(
      <ControlPanelBatch
        selectableWorkers={TWO_WORKERS}
        selected={new Set()}
        selectedCount={0}
        batchBusy={null}
        disableBatch={true}
        batchResults={null}
        onSelectAll={vi.fn()}
        onClearSelection={vi.fn()}
        onToggleSelected={vi.fn()}
        onRunBatch={vi.fn()}
      />,
    );
    expect(
      screen.queryByText('Last batch results'),
    ).not.toBeInTheDocument();
    rerender(
      <ControlPanelBatch
        selectableWorkers={TWO_WORKERS}
        selected={new Set()}
        selectedCount={0}
        batchBusy={null}
        disableBatch={true}
        batchResults={[{ name: 'w1', ok: true }]}
        onSelectAll={vi.fn()}
        onClearSelection={vi.fn()}
        onToggleSelected={vi.fn()}
        onRunBatch={vi.fn()}
      />,
    );
    expect(screen.getByText('Last batch results')).toBeInTheDocument();
  });
});
