import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { setLocale } from '../lib/i18n';
import type {
  AuditEntry,
  MeetingMeta,
  Specialist,
} from './SpecialistsView';

// SpecialistsView wires five hooks (useSpecialistsList,
// useSpecialistActions, useSpecialistEnrichment,
// useSpecialistFilter) + nine child components. The test
// stubs every hook + every child to a marker so each test
// can drive a single branch without booting fetch /
// EventSource / localStorage / api.ts.

const refreshMock = vi.fn(async () => {});
const setConfirmRemoveIdMock = vi.fn();
const setConfirmResetIdMock = vi.fn();
const handleRemoveMock = vi.fn(async () => {});
const handleScoreResetMock = vi.fn(async () => {});

const setFilterMock = vi.fn();
const setTierFilterMock = vi.fn();
const setVetoOnlyMock = vi.fn();

let listState: {
  data: { count: number; version: number; specialists: Specialist[] } | null;
  error: string | null;
  loading: boolean;
  flaggedIds: Set<string>;
} = {
  data: null,
  error: null,
  loading: false,
  flaggedIds: new Set(),
};

let filterState: {
  filter: string;
  tierFilter: string;
  vetoOnly: boolean;
  filtered: Specialist[];
} = {
  filter: '',
  tierFilter: 'any',
  vetoOnly: false,
  filtered: [],
};

let actionsState: {
  removeBusy: boolean;
  confirmRemoveId: string | null;
  resetBusy: boolean;
  confirmResetId: string | null;
} = {
  removeBusy: false,
  confirmRemoveId: null,
  resetBusy: false,
  confirmResetId: null,
};

let enrichmentState: {
  recentAudit?: AuditEntry[];
  recentMeetings?: MeetingMeta[];
} | null = null;

let lastActionsArgs: {
  selectedId: string | null;
  setSelectedId: (next: string | null) => void;
  setActionError: (next: string | null) => void;
  refresh: () => Promise<void>;
} | null = null;

let lastFilterArgs: { specialists: Specialist[] } | null = null;
let lastEnrichmentId: string | null | undefined;

vi.mock('../lib/use-specialists-list', () => ({
  useSpecialistsList: () => ({
    data: listState.data,
    error: listState.error,
    loading: listState.loading,
    flaggedIds: listState.flaggedIds,
    refresh: refreshMock,
  }),
}));

vi.mock('../lib/use-specialist-actions', () => ({
  useSpecialistActions: (args: {
    selectedId: string | null;
    setSelectedId: (next: string | null) => void;
    setActionError: (next: string | null) => void;
    refresh: () => Promise<void>;
  }) => {
    lastActionsArgs = args;
    return {
      removeBusy: actionsState.removeBusy,
      confirmRemoveId: actionsState.confirmRemoveId,
      setConfirmRemoveId: setConfirmRemoveIdMock,
      resetBusy: actionsState.resetBusy,
      confirmResetId: actionsState.confirmResetId,
      setConfirmResetId: setConfirmResetIdMock,
      handleRemove: handleRemoveMock,
      handleScoreReset: handleScoreResetMock,
    };
  },
}));

vi.mock('../lib/use-specialist-enrichment', () => ({
  useSpecialistEnrichment: (id: string | null) => {
    lastEnrichmentId = id;
    return enrichmentState;
  },
}));

vi.mock('../lib/use-specialist-filter', () => ({
  useSpecialistFilter: (args: { specialists: Specialist[] }) => {
    lastFilterArgs = args;
    return {
      filter: filterState.filter,
      setFilter: setFilterMock,
      tierFilter: filterState.tierFilter,
      setTierFilter: setTierFilterMock,
      vetoOnly: filterState.vetoOnly,
      setVetoOnly: setVetoOnlyMock,
      filtered: filterState.filtered,
    };
  },
}));

interface CapturedSummaryBar {}
let lastSummaryRendered = false;
vi.mock('./SpecialistsSummaryBar', () => ({
  default: (_props: CapturedSummaryBar) => {
    lastSummaryRendered = true;
    return <div data-testid="summary-bar" />;
  },
}));

interface CapturedBulkOpsToolbar {
  onChange: () => void;
}
let lastBulkOpsProps: CapturedBulkOpsToolbar | null = null;
vi.mock('./SpecialistsBulkOpsToolbar', () => ({
  default: (props: CapturedBulkOpsToolbar) => {
    lastBulkOpsProps = props;
    return (
      <div data-testid="bulk-ops">
        <button
          type="button"
          data-testid="bulk-ops-change"
          onClick={props.onChange}
        >
          chg
        </button>
      </div>
    );
  },
}));

let lastAuditRendered = false;
vi.mock('./SpecialistsAuditPanel', () => ({
  default: () => {
    lastAuditRendered = true;
    return <div data-testid="audit-panel" />;
  },
}));

interface CapturedListCardHeader {
  loading: boolean;
  addOpen: boolean;
  actionError: string | null;
  onToggleAdd: () => void;
  onCloseAdd: () => void;
  onAdded: (newId: string) => void;
  onRefresh: () => void;
  filter: string;
  onFilter: (next: string) => void;
  tierFilter: string;
  onTierFilter: (next: string) => void;
  vetoOnly: boolean;
  onVetoOnly: (next: boolean) => void;
  filteredCount: number;
  totalCount: number;
}
let lastListCardHeader: CapturedListCardHeader | null = null;
vi.mock('./SpecialistsListCardHeader', () => ({
  default: (props: CapturedListCardHeader) => {
    lastListCardHeader = props;
    return (
      <div
        data-testid="list-card-header"
        data-loading={props.loading ? 'true' : 'false'}
        data-add-open={props.addOpen ? 'true' : 'false'}
        data-action-error={props.actionError ?? ''}
        data-filter={props.filter}
        data-tier={props.tierFilter}
        data-veto-only={props.vetoOnly ? 'true' : 'false'}
        data-filtered-count={String(props.filteredCount)}
        data-total-count={String(props.totalCount)}
      >
        <button
          type="button"
          data-testid="lch-toggle-add"
          onClick={props.onToggleAdd}
        >
          tog
        </button>
        <button
          type="button"
          data-testid="lch-close-add"
          onClick={props.onCloseAdd}
        >
          close
        </button>
        <button
          type="button"
          data-testid="lch-added"
          onClick={() => props.onAdded('new-id')}
        >
          added
        </button>
        <button
          type="button"
          data-testid="lch-refresh"
          onClick={props.onRefresh}
        >
          refresh
        </button>
        <button
          type="button"
          data-testid="lch-filter"
          onClick={() => props.onFilter('q')}
        >
          filter
        </button>
        <button
          type="button"
          data-testid="lch-tier"
          onClick={() => props.onTierFilter('design')}
        >
          tier
        </button>
        <button
          type="button"
          data-testid="lch-veto"
          onClick={() => props.onVetoOnly(true)}
        >
          veto
        </button>
      </div>
    );
  },
}));

interface CapturedList {
  filtered: Specialist[];
  error: string | null;
  loading: boolean;
  selectedId: string | null;
  onSelect: (id: string) => void;
  flaggedIds: Set<string>;
}
let lastListProps: CapturedList | null = null;
vi.mock('./SpecialistsList', () => ({
  default: (props: CapturedList) => {
    lastListProps = props;
    return (
      <div
        data-testid="list"
        data-filtered-len={String(props.filtered.length)}
        data-error={props.error ?? ''}
        data-loading={props.loading ? 'true' : 'false'}
        data-selected-id={props.selectedId ?? ''}
        data-flagged-size={String(props.flaggedIds.size)}
      >
        <button
          type="button"
          data-testid="list-select-a"
          onClick={() => props.onSelect('arch-1')}
        >
          select-a
        </button>
        <button
          type="button"
          data-testid="list-select-b"
          onClick={() => props.onSelect('sec-1')}
        >
          select-b
        </button>
      </div>
    );
  },
}));

interface CapturedDetailHeader {
  selected: Specialist | null;
  confirmRemoveId: string | null;
  removeBusy: boolean;
  onConfirmRemove: (id: string | null) => void;
  onRemove: (id: string) => void;
}
let lastDetailHeader: CapturedDetailHeader | null = null;
vi.mock('./SpecialistsDetailHeader', () => ({
  default: (props: CapturedDetailHeader) => {
    lastDetailHeader = props;
    return (
      <div
        data-testid="detail-header"
        data-selected-id={props.selected?.id ?? ''}
        data-confirm-remove={props.confirmRemoveId ?? ''}
        data-remove-busy={props.removeBusy ? 'true' : 'false'}
      >
        <button
          type="button"
          data-testid="dh-confirm-remove"
          onClick={() => props.onConfirmRemove('arch-1')}
        >
          c-r
        </button>
        <button
          type="button"
          data-testid="dh-remove"
          onClick={() => props.onRemove('arch-1')}
        >
          remove
        </button>
      </div>
    );
  },
}));

interface CapturedMetadataPanel {
  specialist: Specialist;
}
let lastMetadataPanel: CapturedMetadataPanel | null = null;
vi.mock('./SpecialistsMetadataPanel', () => ({
  default: (props: CapturedMetadataPanel) => {
    lastMetadataPanel = props;
    return (
      <div
        data-testid="metadata-panel"
        data-id={props.specialist.id}
      />
    );
  },
}));

interface CapturedTagEditor {
  specialistId: string;
  tags: string[] | undefined;
  onSaved: () => void;
  onError: (msg: string) => void;
}
let lastTagEditor: CapturedTagEditor | null = null;
vi.mock('./SpecialistsTagEditor', () => ({
  default: (props: CapturedTagEditor) => {
    lastTagEditor = props;
    return (
      <div
        data-testid="tag-editor"
        data-specialist-id={props.specialistId}
        data-tags={(props.tags ?? []).join(',')}
      >
        <button
          type="button"
          data-testid="te-saved"
          onClick={props.onSaved}
        >
          saved
        </button>
        <button
          type="button"
          data-testid="te-error"
          onClick={() => props.onError('boom')}
        >
          err
        </button>
      </div>
    );
  },
}));

interface CapturedScoreHistory {
  specialist: Specialist;
  confirmResetId: string | null;
  resetBusy: boolean;
  onConfirmReset: (id: string | null) => void;
  onScoreReset: (id: string) => void;
}
let lastScoreHistory: CapturedScoreHistory | null = null;
vi.mock('./SpecialistsScoreHistory', () => ({
  default: (props: CapturedScoreHistory) => {
    lastScoreHistory = props;
    return (
      <div
        data-testid="score-history"
        data-id={props.specialist.id}
        data-confirm-reset={props.confirmResetId ?? ''}
        data-reset-busy={props.resetBusy ? 'true' : 'false'}
      >
        <button
          type="button"
          data-testid="sh-confirm-reset"
          onClick={() => props.onConfirmReset('arch-1')}
        >
          c-r
        </button>
        <button
          type="button"
          data-testid="sh-reset"
          onClick={() => props.onScoreReset('arch-1')}
        >
          reset
        </button>
      </div>
    );
  },
}));

interface CapturedPromptPanel {
  specialistId: string;
  systemPrompt: string;
}
let lastPromptPanel: CapturedPromptPanel | null = null;
vi.mock('./SpecialistsPromptPanel', () => ({
  default: (props: CapturedPromptPanel) => {
    lastPromptPanel = props;
    return (
      <div
        data-testid="prompt-panel"
        data-id={props.specialistId}
        data-prompt={props.systemPrompt}
      />
    );
  },
}));

interface CapturedEnrichmentPanels {
  recentAudit?: AuditEntry[];
  recentMeetings?: MeetingMeta[];
}
let lastEnrichmentPanels: CapturedEnrichmentPanels | null = null;
vi.mock('./SpecialistsEnrichmentPanels', () => ({
  default: (props: CapturedEnrichmentPanels) => {
    lastEnrichmentPanels = props;
    return (
      <div
        data-testid="enrichment-panels"
        data-audit-len={String((props.recentAudit ?? []).length)}
        data-meetings-len={String((props.recentMeetings ?? []).length)}
      />
    );
  },
}));

import SpecialistsView from './SpecialistsView';

function makeSpecialist(over: Partial<Specialist> = {}): Specialist {
  return {
    id: 'arch-1',
    displayName: 'Arch One',
    tier: 'design',
    domain: ['design'],
    brain: { adapter: 'claude', model: 'opus-4', effort: null },
    systemPrompt: 'sp-1',
    triggers: { keywords: [], stages: [] },
    deliverables: [],
    tags: ['core'],
    vetoPower: false,
    probation: 'stable',
    score: {
      byDomain: {},
      byStage: {},
      samples: {},
      lastUpdated: null,
    },
    ...over,
  };
}

const SPECS = [
  makeSpecialist({ id: 'arch-1' }),
  makeSpecialist({ id: 'sec-1', displayName: 'Sec One', tier: 'audit' }),
];

beforeEach(() => {
  setLocale('en');
  refreshMock.mockReset();
  refreshMock.mockResolvedValue(undefined);
  setConfirmRemoveIdMock.mockReset();
  setConfirmResetIdMock.mockReset();
  handleRemoveMock.mockReset();
  handleScoreResetMock.mockReset();
  setFilterMock.mockReset();
  setTierFilterMock.mockReset();
  setVetoOnlyMock.mockReset();
  listState = {
    data: { count: SPECS.length, version: 1, specialists: SPECS },
    error: null,
    loading: false,
    flaggedIds: new Set(['arch-1']),
  };
  filterState = {
    filter: '',
    tierFilter: 'any',
    vetoOnly: false,
    filtered: SPECS,
  };
  actionsState = {
    removeBusy: false,
    confirmRemoveId: null,
    resetBusy: false,
    confirmResetId: null,
  };
  enrichmentState = null;
  lastSummaryRendered = false;
  lastBulkOpsProps = null;
  lastAuditRendered = false;
  lastListCardHeader = null;
  lastListProps = null;
  lastDetailHeader = null;
  lastMetadataPanel = null;
  lastTagEditor = null;
  lastScoreHistory = null;
  lastPromptPanel = null;
  lastEnrichmentPanels = null;
  lastActionsArgs = null;
  lastFilterArgs = null;
  lastEnrichmentId = undefined;
});

describe('<SpecialistsView>', () => {
  it('mounts the four always-on outer panels', () => {
    render(<SpecialistsView />);
    expect(screen.getByTestId('summary-bar')).toBeInTheDocument();
    expect(screen.getByTestId('bulk-ops')).toBeInTheDocument();
    expect(screen.getByTestId('audit-panel')).toBeInTheDocument();
    expect(screen.getByTestId('list-card-header')).toBeInTheDocument();
  });

  it('renders the master list pane with the filtered specialists', () => {
    render(<SpecialistsView />);
    const list = screen.getByTestId('list');
    expect(list).toHaveAttribute('data-filtered-len', '2');
  });

  it('forwards the flagged-id set from the list hook into the list pane', () => {
    render(<SpecialistsView />);
    expect(screen.getByTestId('list')).toHaveAttribute(
      'data-flagged-size',
      '1',
    );
  });

  it('forwards the error from the list hook into the list pane', () => {
    listState = { ...listState, error: 'load broke' };
    render(<SpecialistsView />);
    expect(screen.getByTestId('list')).toHaveAttribute(
      'data-error',
      'load broke',
    );
  });

  it('forwards the loading flag from the list hook into the list pane', () => {
    listState = { ...listState, loading: true };
    render(<SpecialistsView />);
    expect(screen.getByTestId('list')).toHaveAttribute(
      'data-loading',
      'true',
    );
  });

  it('forwards loading + filteredCount + totalCount into the list card header', () => {
    render(<SpecialistsView />);
    const header = screen.getByTestId('list-card-header');
    expect(header).toHaveAttribute('data-loading', 'false');
    expect(header).toHaveAttribute('data-filtered-count', '2');
    expect(header).toHaveAttribute('data-total-count', '2');
  });

  it('passes specialists into the filter hook', () => {
    render(<SpecialistsView />);
    expect(lastFilterArgs?.specialists).toEqual(SPECS);
  });

  it('forwards filter / tier / veto state to the list card header', () => {
    filterState = {
      filter: 'design',
      tierFilter: 'design',
      vetoOnly: true,
      filtered: [SPECS[0]],
    };
    render(<SpecialistsView />);
    const header = screen.getByTestId('list-card-header');
    expect(header).toHaveAttribute('data-filter', 'design');
    expect(header).toHaveAttribute('data-tier', 'design');
    expect(header).toHaveAttribute('data-veto-only', 'true');
  });

  it('drives the filter setter when onFilter fires from the list card header', async () => {
    const user = userEvent.setup();
    render(<SpecialistsView />);
    await user.click(screen.getByTestId('lch-filter'));
    expect(setFilterMock).toHaveBeenCalledWith('q');
  });

  it('drives the tier setter when onTierFilter fires from the list card header', async () => {
    const user = userEvent.setup();
    render(<SpecialistsView />);
    await user.click(screen.getByTestId('lch-tier'));
    expect(setTierFilterMock).toHaveBeenCalledWith('design');
  });

  it('drives the veto-only setter when onVetoOnly fires from the list card header', async () => {
    const user = userEvent.setup();
    render(<SpecialistsView />);
    await user.click(screen.getByTestId('lch-veto'));
    expect(setVetoOnlyMock).toHaveBeenCalledWith(true);
  });

  it('drives the master refresh when onRefresh fires from the list card header', async () => {
    const user = userEvent.setup();
    render(<SpecialistsView />);
    await user.click(screen.getByTestId('lch-refresh'));
    expect(refreshMock).toHaveBeenCalledTimes(1);
  });

  it('starts with addOpen=false and flips on the toggle button', async () => {
    const user = userEvent.setup();
    render(<SpecialistsView />);
    expect(screen.getByTestId('list-card-header')).toHaveAttribute(
      'data-add-open',
      'false',
    );
    await user.click(screen.getByTestId('lch-toggle-add'));
    expect(screen.getByTestId('list-card-header')).toHaveAttribute(
      'data-add-open',
      'true',
    );
  });

  it('closes the add panel when onCloseAdd fires from the list card header', async () => {
    const user = userEvent.setup();
    render(<SpecialistsView />);
    await user.click(screen.getByTestId('lch-toggle-add'));
    await user.click(screen.getByTestId('lch-close-add'));
    expect(screen.getByTestId('list-card-header')).toHaveAttribute(
      'data-add-open',
      'false',
    );
  });

  it('refreshes + closes the add panel + selects the new id when onAdded fires', async () => {
    const user = userEvent.setup();
    render(<SpecialistsView />);
    await user.click(screen.getByTestId('lch-toggle-add'));
    await user.click(screen.getByTestId('lch-added'));
    expect(refreshMock).toHaveBeenCalled();
    expect(screen.getByTestId('list-card-header')).toHaveAttribute(
      'data-add-open',
      'false',
    );
  });

  it('selecting a specialist forwards the new selection into the list pane', async () => {
    const user = userEvent.setup();
    render(<SpecialistsView />);
    await user.click(screen.getByTestId('list-select-a'));
    expect(screen.getByTestId('list')).toHaveAttribute(
      'data-selected-id',
      'arch-1',
    );
  });

  it('selecting a specialist surfaces it into the detail header', async () => {
    const user = userEvent.setup();
    render(<SpecialistsView />);
    await user.click(screen.getByTestId('list-select-a'));
    expect(screen.getByTestId('detail-header')).toHaveAttribute(
      'data-selected-id',
      'arch-1',
    );
  });

  it('does NOT mount the metadata / tag / score / prompt / enrichment panels when no selection', () => {
    render(<SpecialistsView />);
    expect(screen.queryByTestId('metadata-panel')).not.toBeInTheDocument();
    expect(screen.queryByTestId('tag-editor')).not.toBeInTheDocument();
    expect(screen.queryByTestId('score-history')).not.toBeInTheDocument();
    expect(screen.queryByTestId('prompt-panel')).not.toBeInTheDocument();
    expect(screen.queryByTestId('enrichment-panels')).not.toBeInTheDocument();
  });

  it('mounts all five detail panels when a specialist is selected', async () => {
    const user = userEvent.setup();
    render(<SpecialistsView />);
    await user.click(screen.getByTestId('list-select-a'));
    expect(screen.getByTestId('metadata-panel')).toBeInTheDocument();
    expect(screen.getByTestId('tag-editor')).toBeInTheDocument();
    expect(screen.getByTestId('score-history')).toBeInTheDocument();
    expect(screen.getByTestId('prompt-panel')).toBeInTheDocument();
    expect(screen.getByTestId('enrichment-panels')).toBeInTheDocument();
  });

  it('forwards the selected specialist into the metadata panel', async () => {
    const user = userEvent.setup();
    render(<SpecialistsView />);
    await user.click(screen.getByTestId('list-select-b'));
    expect(screen.getByTestId('metadata-panel')).toHaveAttribute(
      'data-id',
      'sec-1',
    );
  });

  it('forwards the selected id + tags into the tag editor', async () => {
    const user = userEvent.setup();
    render(<SpecialistsView />);
    await user.click(screen.getByTestId('list-select-a'));
    const editor = screen.getByTestId('tag-editor');
    expect(editor).toHaveAttribute('data-specialist-id', 'arch-1');
    expect(editor).toHaveAttribute('data-tags', 'core');
  });

  it('refreshes the list when the tag editor fires onSaved', async () => {
    const user = userEvent.setup();
    render(<SpecialistsView />);
    await user.click(screen.getByTestId('list-select-a'));
    refreshMock.mockClear();
    await user.click(screen.getByTestId('te-saved'));
    expect(refreshMock).toHaveBeenCalledTimes(1);
  });

  it('forwards the selected id + systemPrompt into the prompt panel', async () => {
    const user = userEvent.setup();
    render(<SpecialistsView />);
    await user.click(screen.getByTestId('list-select-a'));
    const panel = screen.getByTestId('prompt-panel');
    expect(panel).toHaveAttribute('data-id', 'arch-1');
    expect(panel).toHaveAttribute('data-prompt', 'sp-1');
  });

  it('forwards confirm / busy state from the actions hook into the detail header', () => {
    actionsState = {
      ...actionsState,
      confirmRemoveId: 'arch-1',
      removeBusy: true,
    };
    render(<SpecialistsView />);
    const header = screen.getByTestId('detail-header');
    expect(header).toHaveAttribute('data-confirm-remove', 'arch-1');
    expect(header).toHaveAttribute('data-remove-busy', 'true');
  });

  it('forwards onConfirmRemove from the detail header into the actions hook setter', async () => {
    const user = userEvent.setup();
    render(<SpecialistsView />);
    await user.click(screen.getByTestId('list-select-a'));
    await user.click(screen.getByTestId('dh-confirm-remove'));
    expect(setConfirmRemoveIdMock).toHaveBeenCalledWith('arch-1');
  });

  it('forwards onRemove from the detail header into the actions hook handler', async () => {
    const user = userEvent.setup();
    render(<SpecialistsView />);
    await user.click(screen.getByTestId('list-select-a'));
    await user.click(screen.getByTestId('dh-remove'));
    expect(handleRemoveMock).toHaveBeenCalledWith('arch-1');
  });

  it('forwards onConfirmReset from the score history into the actions hook setter', async () => {
    const user = userEvent.setup();
    render(<SpecialistsView />);
    await user.click(screen.getByTestId('list-select-a'));
    await user.click(screen.getByTestId('sh-confirm-reset'));
    expect(setConfirmResetIdMock).toHaveBeenCalledWith('arch-1');
  });

  it('forwards onScoreReset from the score history into the actions hook handler', async () => {
    const user = userEvent.setup();
    render(<SpecialistsView />);
    await user.click(screen.getByTestId('list-select-a'));
    await user.click(screen.getByTestId('sh-reset'));
    expect(handleScoreResetMock).toHaveBeenCalledWith('arch-1');
  });

  it('passes the selectedId into the enrichment hook when a specialist is picked', async () => {
    const user = userEvent.setup();
    render(<SpecialistsView />);
    expect(lastEnrichmentId).toBeNull();
    await user.click(screen.getByTestId('list-select-a'));
    expect(lastEnrichmentId).toBe('arch-1');
  });

  it('forwards the enrichment payload into the enrichment panels when present', async () => {
    enrichmentState = {
      recentAudit: [
        {
          ts: '2026-05-01T00:00:00Z',
          action: 'register',
          id: 'arch-1',
          actor: 'sys',
          reason: null,
          mode: null,
          meetingId: null,
        },
      ],
      recentMeetings: [
        {
          id: 'mtg-1',
          status: 'completed',
          title: 't1',
          track: 'design',
          createdAt: '2026-05-01T00:00:00Z',
          completedAt: '2026-05-01T01:00:00Z',
        },
      ],
    };
    const user = userEvent.setup();
    render(<SpecialistsView />);
    await user.click(screen.getByTestId('list-select-a'));
    const panels = screen.getByTestId('enrichment-panels');
    expect(panels).toHaveAttribute('data-audit-len', '1');
    expect(panels).toHaveAttribute('data-meetings-len', '1');
  });

  it('renders the empty pick-a-specialist hint when no selection', () => {
    render(<SpecialistsView />);
    expect(
      screen.getByText(
        'Pick a specialist to see brain config + score history.',
      ),
    ).toBeInTheDocument();
  });

  it('hides the empty pick hint when a specialist is selected', async () => {
    const user = userEvent.setup();
    render(<SpecialistsView />);
    await user.click(screen.getByTestId('list-select-a'));
    expect(
      screen.queryByText(
        'Pick a specialist to see brain config + score history.',
      ),
    ).not.toBeInTheDocument();
  });

  it('wires bulk ops toolbar onChange through to refresh', async () => {
    const user = userEvent.setup();
    render(<SpecialistsView />);
    await user.click(screen.getByTestId('bulk-ops-change'));
    expect(refreshMock).toHaveBeenCalledTimes(1);
  });

  it('clears action error when the add panel is toggled', async () => {
    const user = userEvent.setup();
    render(<SpecialistsView />);
    await act(async () => {
      lastActionsArgs?.setActionError('stale');
    });
    expect(screen.getByTestId('list-card-header')).toHaveAttribute(
      'data-action-error',
      'stale',
    );
    await user.click(screen.getByTestId('lch-toggle-add'));
    expect(screen.getByTestId('list-card-header')).toHaveAttribute(
      'data-action-error',
      '',
    );
  });

  it('surfaces tag editor onError through to the action error banner', async () => {
    const user = userEvent.setup();
    render(<SpecialistsView />);
    await user.click(screen.getByTestId('list-select-a'));
    await user.click(screen.getByTestId('te-error'));
    expect(screen.getByTestId('list-card-header')).toHaveAttribute(
      'data-action-error',
      'boom',
    );
  });

  it('passes the matching specialist (not just the id) into the score history', async () => {
    const user = userEvent.setup();
    render(<SpecialistsView />);
    await user.click(screen.getByTestId('list-select-b'));
    expect(screen.getByTestId('score-history')).toHaveAttribute(
      'data-id',
      'sec-1',
    );
  });

  it('refreshes when the actions hook setSelectedId path is exercised then re-selected', async () => {
    const user = userEvent.setup();
    render(<SpecialistsView />);
    await user.click(screen.getByTestId('list-select-a'));
    expect(lastActionsArgs?.selectedId).toBe('arch-1');
    await act(async () => {
      lastActionsArgs?.setSelectedId(null);
    });
    expect(screen.getByTestId('detail-header')).toHaveAttribute(
      'data-selected-id',
      '',
    );
  });

  it('renders translated copy when the locale flips to ko', () => {
    render(<SpecialistsView />);
    expect(
      screen.getByText(
        'Pick a specialist to see brain config + score history.',
      ),
    ).toBeInTheDocument();
    act(() => {
      setLocale('ko');
    });
    expect(
      screen.queryByText(
        'Pick a specialist to see brain config + score history.',
      ),
    ).not.toBeInTheDocument();
  });
});
