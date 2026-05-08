'use strict';

// (v1.10.536) Component extraction boundary tests. Locks in the
// extracted component files so future refactors don't accidentally
// re-inline them into their parent megacomponents. Each split was
// done because the parent had grown unwieldy (1300+ lines); folding
// them back would silently negate that work.
//
// Pure source-grep — no browser, no jsdom. Just asserts that the
// extracted file exists, exports the expected default, and that
// the parent imports + renders it.

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { describe, it } = require('node:test');

const ROOT = path.join(__dirname, '..');
const COMPONENTS = path.join(ROOT, 'web', 'src', 'components');

function read(file) {
  return fs.readFileSync(path.join(COMPONENTS, file), 'utf8');
}

describe('extracted: MeetingsMaintenancePanel (v1.10.529)', () => {
  it('lives in its own file with default export', () => {
    const src = read('MeetingsMaintenancePanel.tsx');
    assert.match(src, /export default function MeetingsMaintenancePanel/);
  });

  it('is imported and rendered by MeetingsView', () => {
    const parent = read('MeetingsView.tsx');
    assert.match(parent, /import\s+MeetingsMaintenancePanel\s+from\s+'\.\/MeetingsMaintenancePanel'/);
    assert.match(parent, /<MeetingsMaintenancePanel\s/);
  });

  it('owns its own state (integrity, backup, fts, prune)', () => {
    const src = read('MeetingsMaintenancePanel.tsx');
    // Sanity-check that state lives in the panel, not inherited from parent.
    assert.match(src, /useState/);
  });
});

describe('extracted: SessionsTour (v1.10.530)', () => {
  it('lives in its own file with default export', () => {
    const src = read('SessionsTour.tsx');
    assert.match(src, /export default function SessionsTour/);
  });

  it('is imported and rendered by SessionsView', () => {
    const parent = read('SessionsView.tsx');
    assert.match(parent, /import\s+SessionsTour\s+from\s+'\.\/SessionsTour'/);
    assert.match(parent, /<SessionsTour\s/);
  });

  it('reuses TOUR_STEPS exported from SessionsView', () => {
    const src = read('SessionsTour.tsx');
    assert.match(src, /import\s+\{[^}]*TOUR_STEPS[^}]*\}\s+from\s+'\.\/SessionsView'/);
  });
});

describe('extracted: SpecialistsAuditPanel (v1.10.531)', () => {
  it('lives in its own file with default export', () => {
    const src = read('SpecialistsAuditPanel.tsx');
    assert.match(src, /export default function SpecialistsAuditPanel/);
  });

  it('is imported and rendered by SpecialistsView', () => {
    const parent = read('SpecialistsView.tsx');
    assert.match(parent, /import\s+SpecialistsAuditPanel\s+from\s+'\.\/SpecialistsAuditPanel'/);
    assert.match(parent, /<SpecialistsAuditPanel\s*\/>/);
  });

  it('owns the audit polling effect (gated on auditOpen)', () => {
    const src = read('SpecialistsAuditPanel.tsx');
    assert.match(src, /if \(!auditOpen\) return/);
    assert.match(src, /window\.setInterval\(fetchAudit, 30000\)/);
  });

  it('owns the chain-verify handler', () => {
    const src = read('SpecialistsAuditPanel.tsx');
    assert.match(src, /handleVerify/);
    assert.match(src, /\/api\/audit\/verify/);
  });
});

describe('extracted: SessionsListSection (v1.10.579)', () => {
  it('lives in its own file with default export', () => {
    const src = read('SessionsListSection.tsx');
    assert.match(src, /export default function SessionsListSection/);
  });

  it('takes 7 props', () => {
    const src = read('SessionsListSection.tsx');
    assert.match(src, /filteredGroups:\s*SessionGroup\[\]/);
    assert.match(src, /error:\s*string\s*\|\s*null/);
    assert.match(src, /loading:\s*boolean/);
    assert.match(src, /collapsed:\s*Record<string, boolean>/);
    assert.match(src, /onToggleGroup:\s*\(key:\s*string\)\s*=>\s*void/);
    assert.match(src, /selectedSessionId:\s*string\s*\|\s*null/);
    assert.match(src, /onSelect:\s*\(sessionId:\s*string\)\s*=>\s*void/);
  });

  it('reuses formatRelative + shortId + SessionGroup from SessionsView', () => {
    const src = read('SessionsListSection.tsx');
    assert.match(src, /from\s+'\.\/SessionsView'/);
    assert.match(src, /formatRelative/);
    assert.match(src, /shortId/);
  });

  it('is a pure-display component (no state, no effects)', () => {
    const src = read('SessionsListSection.tsx');
    assert.doesNotMatch(src, /useState/);
    assert.doesNotMatch(src, /useEffect/);
  });

  it('is imported and rendered by SessionsView', () => {
    const parent = read('SessionsView.tsx');
    assert.match(parent, /import\s+SessionsListSection\s+from\s+'\.\/SessionsListSection'/);
    assert.match(parent, /<SessionsListSection/);
  });

  it('parent SessionsView no longer holds the inline grouped list rendering', () => {
    const parent = read('SessionsView.tsx');
    assert.doesNotMatch(parent, /filteredGroups\.map\(\(group\) => \{/);
  });
});

describe('extracted: SessionsAttachedSection (v1.10.578)', () => {
  it('lives in its own file with default export', () => {
    const src = read('SessionsAttachedSection.tsx');
    assert.match(src, /export default function SessionsAttachedSection/);
  });

  it('takes 8 props', () => {
    const src = read('SessionsAttachedSection.tsx');
    assert.match(src, /collapsed:\s*boolean/);
    assert.match(src, /onToggle:\s*\(\)\s*=>\s*void/);
    assert.match(src, /filtered:\s*AttachedSession\[\]/);
    assert.match(src, /selectedName:\s*string\s*\|\s*null/);
    assert.match(src, /onSelect:\s*\(name:\s*string\)\s*=>\s*void/);
    assert.match(src, /onAttachClick:\s*\(\)\s*=>\s*void/);
    assert.match(src, /onDetach:\s*\(name:\s*string\)\s*=>\s*void/);
  });

  it('hosts both SessionsEmptyAttachBanner and SessionsAttachedRowActions', () => {
    const src = read('SessionsAttachedSection.tsx');
    assert.match(src, /import\s+SessionsEmptyAttachBanner/);
    assert.match(src, /import\s+SessionsAttachedRowActions/);
  });

  it('is imported and rendered by SessionsView', () => {
    const parent = read('SessionsView.tsx');
    assert.match(parent, /import\s+SessionsAttachedSection\s+from\s+'\.\/SessionsAttachedSection'/);
    assert.match(parent, /<SessionsAttachedSection/);
  });

  it('parent SessionsView no longer imports the children directly', () => {
    const parent = read('SessionsView.tsx');
    assert.doesNotMatch(parent, /import\s+SessionsEmptyAttachBanner/);
    assert.doesNotMatch(parent, /import\s+SessionsAttachedRowActions/);
  });
});

describe('extracted: SpecialistsList (v1.10.577)', () => {
  it('lives in its own file with default export', () => {
    const src = read('SpecialistsList.tsx');
    assert.match(src, /export default function SpecialistsList/);
  });

  it('takes 6 props (filtered / error / loading / selectedId / onSelect / flaggedIds)', () => {
    const src = read('SpecialistsList.tsx');
    assert.match(src, /filtered:\s*Specialist\[\]/);
    assert.match(src, /error:\s*string\s*\|\s*null/);
    assert.match(src, /loading:\s*boolean/);
    assert.match(src, /selectedId:\s*string\s*\|\s*null/);
    assert.match(src, /onSelect:\s*\(id:\s*string\)\s*=>\s*void/);
    assert.match(src, /flaggedIds:\s*Set<string>/);
  });

  it('reuses TIER_BADGE + Specialist type from SpecialistsView', () => {
    const src = read('SpecialistsList.tsx');
    assert.match(src, /from\s+'\.\/SpecialistsView'/);
    assert.match(src, /TIER_BADGE/);
  });

  it('is a pure-display component (no state, no effects)', () => {
    const src = read('SpecialistsList.tsx');
    assert.doesNotMatch(src, /useState/);
    assert.doesNotMatch(src, /useEffect/);
  });

  it('is imported and rendered by SpecialistsView', () => {
    const parent = read('SpecialistsView.tsx');
    assert.match(parent, /import\s+SpecialistsList\s+from\s+'\.\/SpecialistsList'/);
    assert.match(parent, /<SpecialistsList/);
  });

  it('parent SpecialistsView no longer holds the inline list rendering', () => {
    const parent = read('SpecialistsView.tsx');
    assert.doesNotMatch(parent, /filtered\.map\(\(s\) => \{/);
  });
});

describe('extracted: MeetingsList (v1.10.576)', () => {
  it('lives in its own file with default export', () => {
    const src = read('MeetingsList.tsx');
    assert.match(src, /export default function MeetingsList/);
  });

  it('takes 7 props (displayList / isSearchMode / searchQuery / error / loading / selectedId / onSelect)', () => {
    const src = read('MeetingsList.tsx');
    assert.match(src, /displayList:\s*MeetingSummary\[\]/);
    assert.match(src, /isSearchMode:\s*boolean/);
    assert.match(src, /searchQuery:\s*string/);
    assert.match(src, /error:\s*string\s*\|\s*null/);
    assert.match(src, /loading:\s*boolean/);
    assert.match(src, /selectedId:\s*string\s*\|\s*null/);
    assert.match(src, /onSelect:\s*\(id:\s*string\)\s*=>\s*void/);
  });

  it('reuses STATUS_BADGE + formatRelative + MeetingSummary from MeetingsView', () => {
    const src = read('MeetingsList.tsx');
    assert.match(src, /from\s+'\.\/MeetingsView'/);
    assert.match(src, /STATUS_BADGE/);
    assert.match(src, /formatRelative/);
  });

  it('is a pure-display component (no state, no effects)', () => {
    const src = read('MeetingsList.tsx');
    assert.doesNotMatch(src, /useState/);
    assert.doesNotMatch(src, /useEffect/);
  });

  it('is imported and rendered by MeetingsView', () => {
    const parent = read('MeetingsView.tsx');
    assert.match(parent, /import\s+MeetingsList\s+from\s+'\.\/MeetingsList'/);
    assert.match(parent, /<MeetingsList/);
  });

  it('parent MeetingsView no longer holds the inline list rendering', () => {
    const parent = read('MeetingsView.tsx');
    assert.doesNotMatch(parent, /displayList\.map\(\(m\) => \{/);
  });
});

describe('extracted: MeetingsListFilterRow (v1.10.575)', () => {
  it('lives in its own file with default export', () => {
    const src = read('MeetingsListFilterRow.tsx');
    assert.match(src, /export default function MeetingsListFilterRow/);
  });

  it('takes 4 props (status / track + 2 setters)', () => {
    const src = read('MeetingsListFilterRow.tsx');
    assert.match(src, /status:\s*MeetingStatus\s*\|\s*''/);
    assert.match(src, /track:\s*Track\s*\|\s*''/);
    assert.match(src, /onStatusChange/);
    assert.match(src, /onTrackChange/);
  });

  it('is a pure controlled-input component (no internal state)', () => {
    const src = read('MeetingsListFilterRow.tsx');
    assert.doesNotMatch(src, /useState/);
    assert.doesNotMatch(src, /useEffect/);
  });

  it('is imported and rendered by MeetingsView', () => {
    const parent = read('MeetingsView.tsx');
    assert.match(parent, /import\s+MeetingsListFilterRow\s+from\s+'\.\/MeetingsListFilterRow'/);
    assert.match(parent, /<MeetingsListFilterRow/);
  });

  it('parent MeetingsView no longer holds the inline list filter JSX', () => {
    const parent = read('MeetingsView.tsx');
    assert.doesNotMatch(parent, /aria-label=\{t\('meetings\.action\.listFilterStatus'\)\}/);
  });
});

describe('extracted: MeetingsSearchFilterRow (v1.10.574)', () => {
  it('lives in its own file with default export', () => {
    const src = read('MeetingsSearchFilterRow.tsx');
    assert.match(src, /export default function MeetingsSearchFilterRow/);
  });

  it('takes 8 props (status / track / since / until + 4 setters)', () => {
    const src = read('MeetingsSearchFilterRow.tsx');
    assert.match(src, /status:\s*MeetingStatus\s*\|\s*''/);
    assert.match(src, /onStatusChange/);
    assert.match(src, /track:\s*Track\s*\|\s*''/);
    assert.match(src, /since:\s*string/);
    assert.match(src, /until:\s*string/);
    assert.match(src, /onSinceChange/);
    assert.match(src, /onUntilChange/);
  });

  it('is a pure controlled-input component (no internal state)', () => {
    const src = read('MeetingsSearchFilterRow.tsx');
    assert.doesNotMatch(src, /useState/);
    assert.doesNotMatch(src, /useEffect/);
  });

  it('is imported and rendered by MeetingsView', () => {
    const parent = read('MeetingsView.tsx');
    assert.match(parent, /import\s+MeetingsSearchFilterRow\s+from\s+'\.\/MeetingsSearchFilterRow'/);
    assert.match(parent, /<MeetingsSearchFilterRow/);
  });

  it('parent MeetingsView no longer holds the inline filter row JSX', () => {
    const parent = read('MeetingsView.tsx');
    assert.doesNotMatch(parent, /searchSince\}\s*\n\s*onChange=/);
    assert.doesNotMatch(parent, /searchUntil\}\s*\n\s*onChange=/);
  });
});

describe('extracted: MeetingsSearchFacets (v1.10.573)', () => {
  it('lives in its own file with default export', () => {
    const src = read('MeetingsSearchFacets.tsx');
    assert.match(src, /export default function MeetingsSearchFacets/);
  });

  it('takes 7 props (counts + facets + selected status/track + toggle callbacks)', () => {
    const src = read('MeetingsSearchFacets.tsx');
    assert.match(src, /resultCount:\s*number/);
    assert.match(src, /total:\s*number\s*\|\s*null/);
    assert.match(src, /facets:\s*SearchFacets/);
    assert.match(src, /selectedStatus:\s*MeetingStatus\s*\|\s*''/);
    assert.match(src, /onStatusToggle/);
    assert.match(src, /onTrackToggle/);
  });

  it('is a pure-display component (no state, no effects)', () => {
    const src = read('MeetingsSearchFacets.tsx');
    assert.doesNotMatch(src, /useState/);
    assert.doesNotMatch(src, /useEffect/);
  });

  it('is imported and rendered by MeetingsView', () => {
    const parent = read('MeetingsView.tsx');
    assert.match(parent, /import\s+MeetingsSearchFacets\s+from\s+'\.\/MeetingsSearchFacets'/);
    assert.match(parent, /<MeetingsSearchFacets/);
  });

  it('parent MeetingsView no longer holds the inline facets JSX', () => {
    const parent = read('MeetingsView.tsx');
    assert.doesNotMatch(parent, /facets\.status\}\s*&&\s*Object\.keys/);
  });
});

describe('extracted: worker-classify lib (v1.10.572)', () => {
  it('lives in lib/worker-classify.ts with all 4 helpers exported', () => {
    const fs = require('fs');
    const path = require('path');
    const file = path.join(__dirname, '..', 'web', 'src', 'lib', 'worker-classify.ts');
    const src = fs.readFileSync(file, 'utf8');
    assert.match(src, /export function isInterventionActive/);
    assert.match(src, /export function mapWorkerStatusToBadgeVariant/);
    assert.match(src, /export function statusLabel/);
    assert.match(src, /export function groupOf/);
  });

  it('isInterventionActive handles the v8.21 string-enum form', () => {
    const fs = require('fs');
    const path = require('path');
    const file = path.join(__dirname, '..', 'web', 'src', 'lib', 'worker-classify.ts');
    const src = fs.readFileSync(file, 'utf8');
    assert.match(src, /typeof w\.intervention === 'string'/);
    assert.match(src, /'approval_pending'/);
  });

  it('is imported by WorkerList', () => {
    const parent = read('WorkerList.tsx');
    assert.match(parent, /from\s+'\.\.\/lib\/worker-classify'/);
    assert.match(parent, /isInterventionActive/);
    assert.match(parent, /groupOf/);
  });

  it('is imported by HierarchyTree (bug fix: no longer drifts on string enum)', () => {
    const parent = read('HierarchyTree.tsx');
    assert.match(parent, /from\s+'\.\.\/lib\/worker-classify'/);
    assert.match(parent, /isInterventionActive/);
  });

  it('parents no longer hold inline duplicates', () => {
    const wl = read('WorkerList.tsx');
    const ht = read('HierarchyTree.tsx');
    assert.doesNotMatch(wl, /^function isInterventionActive/m);
    assert.doesNotMatch(wl, /^function groupOf/m);
    assert.doesNotMatch(ht, /^function isInterventionActive/m);
    assert.doesNotMatch(ht, /^function statusLabel/m);
    assert.doesNotMatch(ht, /^function statusVariant/m);
  });
});

describe('extracted: AutonomousDigestMetrics (v1.10.570)', () => {
  it('lives in its own file with default export', () => {
    const src = read('AutonomousDigestMetrics.tsx');
    assert.match(src, /export default function AutonomousDigestMetrics/);
  });

  it('takes a digest prop typed as DigestResponse', () => {
    const src = read('AutonomousDigestMetrics.tsx');
    assert.match(src, /digest:\s*DigestResponse/);
  });

  it('owns its fmtDuration helper internally', () => {
    const src = read('AutonomousDigestMetrics.tsx');
    assert.match(src, /function fmtDuration/);
  });

  it('is a pure-display component (no state, no effects)', () => {
    const src = read('AutonomousDigestMetrics.tsx');
    assert.doesNotMatch(src, /useState/);
    assert.doesNotMatch(src, /useEffect/);
  });

  it('is imported and rendered by AutonomousView', () => {
    const parent = read('AutonomousView.tsx');
    assert.match(parent, /import\s+AutonomousDigestMetrics\s+from\s+'\.\/AutonomousDigestMetrics'/);
    assert.match(parent, /<AutonomousDigestMetrics\s+digest=\{digest\}/);
  });

  it('parent AutonomousView no longer holds the inline metrics grid nor fmtDuration', () => {
    const parent = read('AutonomousView.tsx');
    assert.doesNotMatch(parent, /^function fmtDuration/m);
    assert.doesNotMatch(parent, /grid-cols-2 gap-x-6 gap-y-1 md:grid-cols-4/);
  });
});

describe('extracted: WorkflowNodeProperties (v1.10.569)', () => {
  it('lives in its own file with default export', () => {
    const src = read('WorkflowNodeProperties.tsx');
    assert.match(src, /export default function WorkflowNodeProperties/);
  });

  it('takes a single node prop typed as WorkflowNode | null', () => {
    const src = read('WorkflowNodeProperties.tsx');
    assert.match(src, /node:\s*WorkflowNode\s*\|\s*null/);
  });

  it('imports TYPE_FILL from WorkflowGraph', () => {
    const src = read('WorkflowNodeProperties.tsx');
    assert.match(src, /import\s+\{\s*TYPE_FILL\s*\}\s+from\s+'\.\/WorkflowGraph'/);
  });

  it('is a pure-display component (no state, no effects)', () => {
    const src = read('WorkflowNodeProperties.tsx');
    assert.doesNotMatch(src, /useState/);
    assert.doesNotMatch(src, /useEffect/);
  });

  it('is imported and rendered by WorkflowEditor', () => {
    const parent = read('WorkflowEditor.tsx');
    assert.match(parent, /import\s+WorkflowNodeProperties\s+from\s+'\.\/WorkflowNodeProperties'/);
    assert.match(parent, /<WorkflowNodeProperties\s+node=\{selectedNode\}/);
  });

  it('parent WorkflowEditor no longer holds the inline component', () => {
    const parent = read('WorkflowEditor.tsx');
    assert.doesNotMatch(parent, /function NodeProperties\(/);
  });
});

describe('extracted: RiskRuleCatalogPanel (v1.10.568)', () => {
  it('lives in its own file with default export', () => {
    const src = read('RiskRuleCatalogPanel.tsx');
    assert.match(src, /export default function RiskRuleCatalogPanel/);
  });

  it('owns its own open / filter / patterns state', () => {
    const src = read('RiskRuleCatalogPanel.tsx');
    assert.match(src, /useState<PatternsResponse \| null>/);
    assert.match(src, /useState\(''\)/);
    assert.match(src, /useState\(false\)/);
  });

  it('lazy-fetches /api/risk/patterns only when opened', () => {
    const src = read('RiskRuleCatalogPanel.tsx');
    assert.match(src, /if \(!open \|\| patterns\) return/);
    assert.match(src, /\/api\/risk\/patterns/);
  });

  it('renders nothing when collapsed (button only)', () => {
    const src = read('RiskRuleCatalogPanel.tsx');
    assert.match(src, /aria-expanded=\{open\}/);
  });

  it('is imported and rendered by Risk page (zero-prop)', () => {
    const fs = require('fs');
    const path = require('path');
    const file = path.join(__dirname, '..', 'web', 'src', 'pages', 'Risk.tsx');
    const parent = fs.readFileSync(file, 'utf8');
    assert.match(parent, /import\s+RiskRuleCatalogPanel\s+from\s+'\.\.\/components\/RiskRuleCatalogPanel'/);
    assert.match(parent, /<RiskRuleCatalogPanel\s*\/>/);
  });

  it('parent Risk page no longer holds patterns state nor PatternsResponse type', () => {
    const fs = require('fs');
    const path = require('path');
    const file = path.join(__dirname, '..', 'web', 'src', 'pages', 'Risk.tsx');
    const parent = fs.readFileSync(file, 'utf8');
    assert.doesNotMatch(parent, /const \[patterns, setPatterns\]/);
    assert.doesNotMatch(parent, /interface PatternsResponse/);
  });
});

describe('extracted: WorkerListGroupHeader (v1.10.567)', () => {
  it('lives in its own file with default export', () => {
    const src = read('WorkerListGroupHeader.tsx');
    assert.match(src, /export default function WorkerListGroupHeader/);
  });

  it('takes open / onToggle / label / count / icon / accent props', () => {
    const src = read('WorkerListGroupHeader.tsx');
    assert.match(src, /open:\s*boolean/);
    assert.match(src, /onToggle:\s*\(\)\s*=>\s*void/);
    assert.match(src, /icon:\s*'crown'\s*\|\s*'wrench'/);
    assert.match(src, /accent:\s*'primary'\s*\|\s*'muted'/);
  });

  it('is a pure-display component (no state, no effects)', () => {
    const src = read('WorkerListGroupHeader.tsx');
    assert.doesNotMatch(src, /useState/);
    assert.doesNotMatch(src, /useEffect/);
  });

  it('is rendered at >= 2 call sites by WorkerList (managers + workers)', () => {
    const parent = read('WorkerList.tsx');
    assert.match(parent, /import\s+WorkerListGroupHeader\s+from\s+'\.\/WorkerListGroupHeader'/);
    const calls = parent.match(/<WorkerListGroupHeader/g) || [];
    assert.ok(calls.length >= 2, `expected >= 2 call sites, saw ${calls.length}`);
  });

  it('parent WorkerList no longer holds the header definition', () => {
    const parent = read('WorkerList.tsx');
    assert.doesNotMatch(parent, /function GroupHeader\(/);
    assert.doesNotMatch(parent, /interface GroupHeaderProps/);
  });
});

describe('extracted: ConversationTurns (v1.10.566)', () => {
  it('lives in its own file with default-exported TurnRow', () => {
    const src = read('ConversationTurns.tsx');
    assert.match(src, /export default function TurnRow/);
  });

  it('contains all six turn renderers (User / Assistant / Thinking / ToolUse / ToolResult / System)', () => {
    const src = read('ConversationTurns.tsx');
    assert.match(src, /function UserTurn/);
    assert.match(src, /function AssistantTurn/);
    assert.match(src, /function ThinkingTurn/);
    assert.match(src, /function ToolUseTurn/);
    assert.match(src, /function ToolResultTurn/);
    assert.match(src, /function SystemTurn/);
  });

  it('contains the RoleHeader sub-component', () => {
    const src = read('ConversationTurns.tsx');
    assert.match(src, /function RoleHeader/);
  });

  it('reuses the conversation-render lib helpers', () => {
    const src = read('ConversationTurns.tsx');
    assert.match(src, /from\s+'\.\.\/lib\/conversation-render'/);
  });

  it('is imported by ConversationView (just the default)', () => {
    const parent = read('ConversationView.tsx');
    assert.match(parent, /import\s+TurnRow\s+from\s+'\.\/ConversationTurns'/);
  });

  it('parent ConversationView no longer holds the turn renderers', () => {
    const parent = read('ConversationView.tsx');
    assert.doesNotMatch(parent, /^function UserTurn/m);
    assert.doesNotMatch(parent, /^function AssistantTurn/m);
    assert.doesNotMatch(parent, /^function ThinkingTurn/m);
    assert.doesNotMatch(parent, /^function ToolUseTurn/m);
    assert.doesNotMatch(parent, /^function ToolResultTurn/m);
    assert.doesNotMatch(parent, /^function SystemTurn/m);
    assert.doesNotMatch(parent, /^function TurnRow/m);
    assert.doesNotMatch(parent, /^function RoleHeader/m);
  });
});

describe('extracted: HistoryDetailPane (v1.10.564)', () => {
  it('lives in its own file with default export', () => {
    const src = read('HistoryDetailPane.tsx');
    assert.match(src, /export default function HistoryDetailPane/);
  });

  it('owns formatDate + recordStatusVariant helpers', () => {
    const src = read('HistoryDetailPane.tsx');
    assert.match(src, /function formatDate/);
    assert.match(src, /function recordStatusVariant/);
  });

  it('takes a detail prop typed as HistoryWorkerDetail', () => {
    const src = read('HistoryDetailPane.tsx');
    assert.match(src, /detail:\s*HistoryWorkerDetail/);
  });

  it('is a pure-display component (no state, no effects)', () => {
    const src = read('HistoryDetailPane.tsx');
    assert.doesNotMatch(src, /useState/);
    assert.doesNotMatch(src, /useEffect/);
  });

  it('is imported and rendered by HistoryView', () => {
    const parent = read('HistoryView.tsx');
    assert.match(parent, /import\s+HistoryDetailPane\s+from\s+'\.\/HistoryDetailPane'/);
    assert.match(parent, /<HistoryDetailPane\s+detail=\{detail\}/);
  });

  it('parent HistoryView no longer holds the detail-pane definition or its helpers', () => {
    const parent = read('HistoryView.tsx');
    assert.doesNotMatch(parent, /function HistoryDetailPane\(/);
    assert.doesNotMatch(parent, /^function formatDate/m);
    assert.doesNotMatch(parent, /^function recordStatusVariant/m);
  });
});

describe('extracted: chat-helpers lib (v1.10.563)', () => {
  it('lives in lib/chat-helpers.ts', () => {
    const fs = require('fs');
    const path = require('path');
    const file = path.join(__dirname, '..', 'web', 'src', 'lib', 'chat-helpers.ts');
    const src = fs.readFileSync(file, 'utf8');
    assert.match(src, /export function stripAnsi/);
    assert.match(src, /export function b64decode/);
    assert.match(src, /export function makeId/);
    assert.match(src, /export function formatTime/);
    assert.match(src, /export function conversationToMessages/);
    assert.match(src, /export function scrollbackToMessages/);
    assert.match(src, /export type Role/);
    assert.match(src, /export type Source/);
    assert.match(src, /export interface ChatMessage/);
    assert.match(src, /export interface ConversationShape/);
  });

  it('is imported by ChatView (typed names + functions)', () => {
    const parent = read('ChatView.tsx');
    assert.match(parent, /from\s+'\.\.\/lib\/chat-helpers'/);
    assert.match(parent, /stripAnsi/);
    assert.match(parent, /b64decode/);
    assert.match(parent, /conversationToMessages/);
    assert.match(parent, /scrollbackToMessages/);
  });

  it('parent ChatView re-exports the public API for legacy tests', () => {
    const parent = read('ChatView.tsx');
    assert.match(parent, /export\s+\{[\s\S]*stripAnsi[\s\S]*b64decode[\s\S]*conversationToMessages[\s\S]*scrollbackToMessages[\s\S]*\}\s+from\s+'\.\.\/lib\/chat-helpers'/);
  });

  it('parent ChatView no longer holds inline definitions', () => {
    const parent = read('ChatView.tsx');
    assert.doesNotMatch(parent, /^export function stripAnsi/m);
    assert.doesNotMatch(parent, /^export function b64decode/m);
    assert.doesNotMatch(parent, /^function makeId/m);
    assert.doesNotMatch(parent, /^function formatTime/m);
    assert.doesNotMatch(parent, /^export function conversationToMessages/m);
    assert.doesNotMatch(parent, /^export function scrollbackToMessages/m);
  });
});

describe('extracted: WorkflowGraph (v1.10.562)', () => {
  it('lives in its own file with default export', () => {
    const src = read('WorkflowGraph.tsx');
    assert.match(src, /export default function WorkflowGraph/);
  });

  it('exports the TYPE_FILL palette (reused by NodeProperties)', () => {
    const src = read('WorkflowGraph.tsx');
    assert.match(src, /export const TYPE_FILL/);
  });

  it('contains layoutWorkflow, NodeBox, EdgeLine helpers', () => {
    const src = read('WorkflowGraph.tsx');
    assert.match(src, /function layoutWorkflow/);
    assert.match(src, /function NodeBox/);
    assert.match(src, /function EdgeLine/);
  });

  it('takes workflow / selectedNode / onSelectNode props', () => {
    const src = read('WorkflowGraph.tsx');
    assert.match(src, /workflow:\s*Workflow/);
    assert.match(src, /selectedNode:\s*string\s*\|\s*null/);
    assert.match(src, /onSelectNode:\s*\(id:\s*string\)\s*=>\s*void/);
  });

  it('is imported and rendered by WorkflowEditor', () => {
    // (v1.10.569) NodeProperties extracted; the TYPE_FILL named
    // import moved with it to WorkflowNodeProperties.
    const parent = read('WorkflowEditor.tsx');
    assert.match(parent, /import\s+WorkflowGraph\s+from\s+'\.\/WorkflowGraph'/);
    assert.match(parent, /<WorkflowGraph/);
    // TYPE_FILL is still exported and still consumed — but now by
    // the extracted WorkflowNodeProperties (not the parent).
    const props = read('WorkflowNodeProperties.tsx');
    assert.match(props, /import\s+\{\s*TYPE_FILL\s*\}\s+from\s+'\.\/WorkflowGraph'/);
  });

  it('parent WorkflowEditor no longer holds the graph helpers', () => {
    const parent = read('WorkflowEditor.tsx');
    assert.doesNotMatch(parent, /^function layoutWorkflow/m);
    assert.doesNotMatch(parent, /^function NodeBox/m);
    assert.doesNotMatch(parent, /^function EdgeLine/m);
    assert.doesNotMatch(parent, /^const NODE_W/m);
    assert.doesNotMatch(parent, /^const TYPE_FILL/m);
  });
});

describe('extracted: StatusMessageCard (v1.10.561)', () => {
  it('lives in its own file with default export', () => {
    const src = read('StatusMessageCard.tsx');
    assert.match(src, /export default function StatusMessageCard/);
  });

  it('takes workerName + onToast props', () => {
    const src = read('StatusMessageCard.tsx');
    assert.match(src, /workerName:\s*string/);
    assert.match(src, /onToast:\s*\(message:\s*string,\s*type:\s*ToastType\)\s*=>\s*void/);
  });

  it('owns message + sending state internally', () => {
    const src = read('StatusMessageCard.tsx');
    assert.match(src, /useState\(''\)/);
    assert.match(src, /useState\(false\)/);
  });

  it('POSTs to /api/status-update with {worker, message}', () => {
    const src = read('StatusMessageCard.tsx');
    assert.match(src, /\/api\/status-update/);
    assert.match(src, /worker:\s*workerName/);
    assert.match(src, /message:\s*text/);
  });

  it('is imported and rendered by ControlPanel', () => {
    const parent = read('ControlPanel.tsx');
    assert.match(parent, /import\s+StatusMessageCard\s+from\s+'\.\/StatusMessageCard'/);
    assert.match(parent, /<StatusMessageCard/);
  });

  it('parent ControlPanel no longer holds the card definition', () => {
    const parent = read('ControlPanel.tsx');
    assert.doesNotMatch(parent, /function StatusMessageCard\(/);
  });
});

describe('extracted: conversation-render lib (v1.10.560)', () => {
  it('lives in lib/conversation-render.tsx', () => {
    const fs = require('fs');
    const path = require('path');
    const file = path.join(__dirname, '..', 'web', 'src', 'lib', 'conversation-render.tsx');
    const src = fs.readFileSync(file, 'utf8');
    assert.match(src, /export function renderMarkdown/);
    assert.match(src, /export function renderInline/);
    assert.match(src, /export function truncate/);
    assert.match(src, /export function formatTime/);
    assert.match(src, /export function formatTokens/);
    assert.match(src, /export function formatToolArgs/);
    assert.match(src, /export function formatToolResult/);
  });

  it('is imported by ConversationTurns (no inline duplicates)', () => {
    // (v1.10.566) The render helpers moved with the turn renderers
    // when ConversationTurns.tsx was extracted. ConversationView
    // no longer references them directly.
    const turns = read('ConversationTurns.tsx');
    assert.match(turns, /from\s+'\.\.\/lib\/conversation-render'/);
    assert.match(turns, /renderMarkdown/);
    assert.match(turns, /formatTokens/);
  });

  it('parent ConversationView no longer holds the helper definitions', () => {
    const parent = read('ConversationView.tsx');
    assert.doesNotMatch(parent, /^function renderMarkdown/m);
    assert.doesNotMatch(parent, /^function renderInline/m);
    assert.doesNotMatch(parent, /^function truncate/m);
    assert.doesNotMatch(parent, /^function formatTime/m);
    assert.doesNotMatch(parent, /^function formatTokens/m);
    assert.doesNotMatch(parent, /^function formatToolArgs/m);
    assert.doesNotMatch(parent, /^function formatToolResult/m);
  });
});

describe('extracted: SpecialistsTagEditor (v1.10.559)', () => {
  it('lives in its own file with default export', () => {
    const src = read('SpecialistsTagEditor.tsx');
    assert.match(src, /export default function SpecialistsTagEditor/);
  });

  it('takes specialistId / tags / onSaved / onError props', () => {
    const src = read('SpecialistsTagEditor.tsx');
    assert.match(src, /specialistId:\s*string/);
    assert.match(src, /tags:\s*string\[\]\s*\|\s*undefined/);
    assert.match(src, /onSaved:\s*\(\)\s*=>\s*void/);
    assert.match(src, /onError:\s*\(msg:\s*string\)\s*=>\s*void/);
  });

  it('owns open / value / busy state internally', () => {
    const src = read('SpecialistsTagEditor.tsx');
    assert.match(src, /useState\(false\)/);
    assert.match(src, /useState\(''\)/);
  });

  it('infers add (+...) / remove (-...) / replace from leading char', () => {
    const src = read('SpecialistsTagEditor.tsx');
    assert.match(src, /raw\.startsWith\('\+'\)/);
    assert.match(src, /raw\.startsWith\('-'\)/);
    assert.match(src, /'replace' \| 'add' \| 'remove'/);
  });

  it('guards against accidental clear (empty replace)', () => {
    const src = read('SpecialistsTagEditor.tsx');
    assert.match(src, /next\.length === 0 && mode === 'replace'/);
  });

  it('is imported and rendered by SpecialistsView', () => {
    const parent = read('SpecialistsView.tsx');
    assert.match(parent, /import\s+SpecialistsTagEditor\s+from\s+'\.\/SpecialistsTagEditor'/);
    assert.match(parent, /<SpecialistsTagEditor/);
  });

  it('parent SpecialistsView no longer holds tag-edit state nor handler', () => {
    const parent = read('SpecialistsView.tsx');
    assert.doesNotMatch(parent, /const \[tagEditOpen, setTagEditOpen\]/);
    assert.doesNotMatch(parent, /const handleTagEdit/);
  });
});

describe('extracted: SpecialistsPromptPanel (v1.10.558)', () => {
  it('lives in its own file with default export', () => {
    const src = read('SpecialistsPromptPanel.tsx');
    assert.match(src, /export default function SpecialistsPromptPanel/);
  });

  it('takes specialistId + systemPrompt props', () => {
    const src = read('SpecialistsPromptPanel.tsx');
    assert.match(src, /specialistId:\s*string/);
    assert.match(src, /systemPrompt:\s*string/);
  });

  it('owns suggest + apply state internally', () => {
    const src = read('SpecialistsPromptPanel.tsx');
    assert.match(src, /const \[suggestBusy, setSuggestBusy\]/);
    assert.match(src, /const \[suggestion, setSuggestion\]/);
    assert.match(src, /const \[applyBusy, setApplyBusy\]/);
    assert.match(src, /const \[applyResult, setApplyResult\]/);
  });

  it('owns the suggest-prompt and prompt-apply POST handlers', () => {
    const src = read('SpecialistsPromptPanel.tsx');
    assert.match(src, /handleSuggest/);
    assert.match(src, /handleApply/);
    assert.match(src, /\/suggest-prompt/);
    assert.match(src, /\/prompt-apply/);
  });

  it('confirms apply (destructive — replaces systemPrompt)', () => {
    const src = read('SpecialistsPromptPanel.tsx');
    assert.match(src, /window\.confirm\(t\('specialists\.applyConfirm'\)\)/);
  });

  it('resets state on specialistId change', () => {
    const src = read('SpecialistsPromptPanel.tsx');
    assert.match(src, /\[specialistId\]/);
  });

  it('is imported and rendered by SpecialistsView', () => {
    const parent = read('SpecialistsView.tsx');
    assert.match(parent, /import\s+SpecialistsPromptPanel\s+from\s+'\.\/SpecialistsPromptPanel'/);
    assert.match(parent, /<SpecialistsPromptPanel/);
  });

  it('parent SpecialistsView no longer holds suggest/apply state nor handlers', () => {
    const parent = read('SpecialistsView.tsx');
    assert.doesNotMatch(parent, /const \[suggestBusy, setSuggestBusy\]/);
    assert.doesNotMatch(parent, /const \[applyBusy, setApplyBusy\]/);
    assert.doesNotMatch(parent, /const handleSuggest/);
    assert.doesNotMatch(parent, /const handleApply/);
    assert.doesNotMatch(parent, /interface ApplyResult/);
  });
});

describe('extracted: MeetingsComposer (v1.10.557)', () => {
  it('lives in its own file with default export', () => {
    const src = read('MeetingsComposer.tsx');
    assert.match(src, /export default function MeetingsComposer/);
  });

  it('takes open / onClose / onCreated props', () => {
    const src = read('MeetingsComposer.tsx');
    assert.match(src, /open:\s*boolean/);
    assert.match(src, /onClose:\s*\(\)\s*=>\s*void/);
    assert.match(src, /onCreated:\s*\(newMeetingId:\s*string\)\s*=>\s*void/);
  });

  it('owns the full composer state internally', () => {
    const src = read('MeetingsComposer.tsx');
    assert.match(src, /const \[newTask, setNewTask\]/);
    assert.match(src, /const \[newTrack, setNewTrack\]/);
    assert.match(src, /const \[templates, setTemplates\]/);
    assert.match(src, /const \[templateName, setTemplateName\]/);
    assert.match(src, /const \[templateVars, setTemplateVars\]/);
    assert.match(src, /const \[previewPlan, setPreviewPlan\]/);
    assert.match(src, /const \[classifyPreview, setClassifyPreview\]/);
  });

  it('owns the handleCreate POST + the two debounced preview effects', () => {
    const src = read('MeetingsComposer.tsx');
    assert.match(src, /handleCreate/);
    assert.match(src, /\/api\/meetings\/classify-track/);
    assert.match(src, /\/api\/meetings\/plan/);
  });

  it('embeds MeetingsTemplateEditor (not in parent any more)', () => {
    const src = read('MeetingsComposer.tsx');
    assert.match(src, /import\s+MeetingsTemplateEditor\s+from\s+'\.\/MeetingsTemplateEditor'/);
    assert.match(src, /<MeetingsTemplateEditor/);
  });

  it('is imported and rendered by MeetingsView', () => {
    const parent = read('MeetingsView.tsx');
    assert.match(parent, /import\s+MeetingsComposer\s+from\s+'\.\/MeetingsComposer'/);
    assert.match(parent, /<MeetingsComposer/);
  });

  it('parent MeetingsView no longer holds composer state, handleCreate, preview effects', () => {
    const parent = read('MeetingsView.tsx');
    assert.doesNotMatch(parent, /const \[newTask, setNewTask\]/);
    assert.doesNotMatch(parent, /const \[templateName, setTemplateName\]/);
    assert.doesNotMatch(parent, /const \[previewPlan, setPreviewPlan\]/);
    assert.doesNotMatch(parent, /const handleCreate/);
    assert.doesNotMatch(parent, /\/api\/meetings\/classify-track/);
  });
});

describe('extracted: MeetingsRunControls (v1.10.556)', () => {
  it('lives in its own file with default export', () => {
    const src = read('MeetingsRunControls.tsx');
    assert.match(src, /export default function MeetingsRunControls/);
  });

  it('takes meetingId prop', () => {
    const src = read('MeetingsRunControls.tsx');
    assert.match(src, /meetingId:\s*string/);
  });

  it('owns brain / busy / error state internally', () => {
    const src = read('MeetingsRunControls.tsx');
    assert.match(src, /useState<'mock' \| 'claude'>/);
  });

  it('owns the /run POST with autoFinalize: true', () => {
    const src = read('MeetingsRunControls.tsx');
    assert.match(src, /\/run/);
    assert.match(src, /autoFinalize:\s*true/);
  });

  it('is imported and rendered by MeetingsDetailPendingActions (v1.10.595)', () => {
    const parent = read('MeetingsDetailPendingActions.tsx');
    assert.match(parent, /import\s+MeetingsRunControls\s+from\s+'\.\/MeetingsRunControls'/);
    assert.match(parent, /<MeetingsRunControls\s+meetingId=\{meetingId\}/);
  });

  it('parent MeetingsView no longer holds run state nor handler', () => {
    const parent = read('MeetingsView.tsx');
    assert.doesNotMatch(parent, /const \[runBusy, setRunBusy\]/);
    assert.doesNotMatch(parent, /const \[runBrain, setRunBrain\]/);
    assert.doesNotMatch(parent, /const handleRun/);
  });
});

describe('extracted: MeetingsStateActions (v1.10.555)', () => {
  it('lives in its own file with default export', () => {
    const src = read('MeetingsStateActions.tsx');
    assert.match(src, /export default function MeetingsStateActions/);
  });

  it('takes meetingId + mode props (pending | in-progress)', () => {
    const src = read('MeetingsStateActions.tsx');
    assert.match(src, /meetingId:\s*string/);
    assert.match(src, /mode:\s*'pending'\s*\|\s*'in-progress'/);
  });

  it('owns busy state typed by Action union', () => {
    const src = read('MeetingsStateActions.tsx');
    assert.match(src, /useState<Action \| null>/);
  });

  it('confirm-prompts escalate + abort before firing', () => {
    const src = read('MeetingsStateActions.tsx');
    assert.match(src, /'escalate', t\('meetings\.escalateConfirm'\)/);
    assert.match(src, /'abort', t\('meetings\.abortConfirm'\)/);
  });

  it('is rendered at 2 sites — pending in MeetingsDetailPendingActions, in-progress in MeetingsDetailInProgressActions (v1.10.595)', () => {
    const pending = read('MeetingsDetailPendingActions.tsx');
    assert.match(pending, /import\s+MeetingsStateActions\s+from\s+'\.\/MeetingsStateActions'/);
    assert.match(pending, /<MeetingsStateActions\s+meetingId=\{meetingId\}\s+mode="pending"/);
    const inProgress = read('MeetingsDetailInProgressActions.tsx');
    assert.match(inProgress, /import\s+MeetingsStateActions\s+from\s+'\.\/MeetingsStateActions'/);
    assert.match(inProgress, /<MeetingsStateActions\s+meetingId=\{meetingId\}\s+mode="in-progress"/);
  });

  it('parent MeetingsView no longer holds state-action handler nor state', () => {
    const parent = read('MeetingsView.tsx');
    assert.doesNotMatch(parent, /const \[stateBusy, setStateBusy\]/);
    assert.doesNotMatch(parent, /const handleStateAction/);
  });
});

describe('extracted: MeetingsPeerRetroControls (v1.10.554)', () => {
  it('lives in its own file with default export', () => {
    const src = read('MeetingsPeerRetroControls.tsx');
    assert.match(src, /export default function MeetingsPeerRetroControls/);
  });

  it('takes meetingId prop', () => {
    const src = read('MeetingsPeerRetroControls.tsx');
    assert.match(src, /meetingId:\s*string/);
  });

  it('owns brain selector state (mock | claude)', () => {
    const src = read('MeetingsPeerRetroControls.tsx');
    assert.match(src, /useState<'mock' \| 'claude'>/);
  });

  it('owns the peer-retro POST handler', () => {
    const src = read('MeetingsPeerRetroControls.tsx');
    assert.match(src, /handlePeerRetro/);
    assert.match(src, /\/peer-retro/);
  });

  it('is imported and rendered by MeetingsDetailCompletedActions (v1.10.593)', () => {
    // (v1.10.593) Moved into MeetingsDetailCompletedActions sibling
    // along with MeetingsPublishControls / MeetingsRetroActions /
    // MeetingsForkForm.
    const parent = read('MeetingsDetailCompletedActions.tsx');
    assert.match(parent, /import\s+MeetingsPeerRetroControls\s+from\s+'\.\/MeetingsPeerRetroControls'/);
    assert.match(parent, /<MeetingsPeerRetroControls\s+meetingId=\{meetingId\}/);
  });

  it('parent MeetingsView no longer holds peer-retro state nor handler', () => {
    const parent = read('MeetingsView.tsx');
    assert.doesNotMatch(parent, /const \[peerRetroBusy, setPeerRetroBusy\]/);
    assert.doesNotMatch(parent, /const \[peerBrain, setPeerBrain\]/);
    assert.doesNotMatch(parent, /const handlePeerRetro/);
  });
});

describe('extracted: MeetingsPublishControls (v1.10.553)', () => {
  it('lives in its own file with default export', () => {
    const src = read('MeetingsPublishControls.tsx');
    assert.match(src, /export default function MeetingsPublishControls/);
  });

  it('takes meetingId prop', () => {
    const src = read('MeetingsPublishControls.tsx');
    assert.match(src, /meetingId:\s*string/);
  });

  it('owns its own busy / msg / failed / git-toggle state', () => {
    const src = read('MeetingsPublishControls.tsx');
    assert.match(src, /const \[busy, setBusy\]/);
    assert.match(src, /const \[gitCommit, setGitCommit\]/);
    assert.match(src, /const \[gitPush, setGitPush\]/);
  });

  it('owns the publish POST handler with includeRetro + apply + git toggles', () => {
    const src = read('MeetingsPublishControls.tsx');
    assert.match(src, /handlePublish/);
    assert.match(src, /includeRetro:\s*true/);
    assert.match(src, /apply:\s*true/);
    assert.match(src, /\/api\/meetings\//);
  });

  it('gitPush check forces gitCommit on (and gitCommit off forces gitPush off)', () => {
    const src = read('MeetingsPublishControls.tsx');
    assert.match(src, /if \(!e\.target\.checked\) setGitPush\(false\)/);
    assert.match(src, /if \(e\.target\.checked\) setGitCommit\(true\)/);
  });

  it('is imported and rendered by MeetingsDetailCompletedActions (v1.10.593)', () => {
    const parent = read('MeetingsDetailCompletedActions.tsx');
    assert.match(parent, /import\s+MeetingsPublishControls\s+from\s+'\.\/MeetingsPublishControls'/);
    assert.match(parent, /<MeetingsPublishControls\s+meetingId=\{meetingId\}/);
  });

  it('parent MeetingsView no longer holds publish state nor handler', () => {
    const parent = read('MeetingsView.tsx');
    assert.doesNotMatch(parent, /const \[publishBusy, setPublishBusy\]/);
    assert.doesNotMatch(parent, /const \[publishGitCommit, setPublishGitCommit\]/);
    assert.doesNotMatch(parent, /const handlePublish/);
  });
});

describe('extracted: MeetingsRetroActions (v1.10.552)', () => {
  it('lives in its own file with default export', () => {
    const src = read('MeetingsRetroActions.tsx');
    assert.match(src, /export default function MeetingsRetroActions/);
  });

  it('takes meetingId prop', () => {
    const src = read('MeetingsRetroActions.tsx');
    assert.match(src, /meetingId:\s*string/);
  });

  it('owns its own busy / result / error state', () => {
    const src = read('MeetingsRetroActions.tsx');
    assert.match(src, /useState<'preview' \| 'finalize' \| null>/);
    assert.match(src, /useState<RetroResult \| null>/);
  });

  it('owns the retro / finalize POST handler (toggles by finalize: boolean)', () => {
    const src = read('MeetingsRetroActions.tsx');
    assert.match(src, /handleRetro = useCallback/);
    assert.match(src, /finalize \? 'finalize' : 'retro'/);
  });

  it('resets on meetingId change', () => {
    const src = read('MeetingsRetroActions.tsx');
    assert.match(src, /\[meetingId\]/);
  });

  it('is imported and rendered by MeetingsDetailCompletedActions (v1.10.593)', () => {
    const parent = read('MeetingsDetailCompletedActions.tsx');
    assert.match(parent, /import\s+MeetingsRetroActions\s+from\s+'\.\/MeetingsRetroActions'/);
    assert.match(parent, /<MeetingsRetroActions\s+meetingId=\{meetingId\}/);
  });

  it('parent MeetingsView no longer holds retro state nor handler', () => {
    const parent = read('MeetingsView.tsx');
    assert.doesNotMatch(parent, /const \[retroBusy, setRetroBusy\]/);
    assert.doesNotMatch(parent, /const \[retroResult, setRetroResult\]/);
    assert.doesNotMatch(parent, /const handleRetro/);
  });
});

describe('extracted: MeetingsContributePanel (v1.10.551)', () => {
  it('lives in its own file with default export', () => {
    const src = read('MeetingsContributePanel.tsx');
    assert.match(src, /export default function MeetingsContributePanel/);
  });

  it('takes open + meetingId props', () => {
    const src = read('MeetingsContributePanel.tsx');
    assert.match(src, /open:\s*boolean/);
    assert.match(src, /meetingId:\s*string/);
  });

  it('owns its full form state internally', () => {
    const src = read('MeetingsContributePanel.tsx');
    assert.match(src, /const \[specialist, setSpecialist\]/);
    assert.match(src, /const \[text, setText\]/);
    assert.match(src, /const \[vote, setVote\]/);
    assert.match(src, /const \[reason, setReason\]/);
  });

  it('owns both /contribute (with body) and /vote (vote-only) handlers', () => {
    const src = read('MeetingsContributePanel.tsx');
    assert.match(src, /handleContribute/);
    assert.match(src, /handleVoteOnly/);
    assert.match(src, /\/contribute/);
    assert.match(src, /\/vote/);
  });

  it('resets form on meetingId change so state does not leak across meetings', () => {
    const src = read('MeetingsContributePanel.tsx');
    assert.match(src, /\[meetingId\]/);
  });

  it('is imported and rendered by MeetingsDetailInProgressActions (v1.10.594)', () => {
    const parent = read('MeetingsDetailInProgressActions.tsx');
    assert.match(parent, /import\s+MeetingsContributePanel\s+from\s+'\.\/MeetingsContributePanel'/);
    assert.match(parent, /<MeetingsContributePanel\s+open=\{contribOpen\}\s+meetingId=\{meetingId\}/);
  });

  it('parent MeetingsView no longer holds contribute form state nor handlers', () => {
    const parent = read('MeetingsView.tsx');
    assert.doesNotMatch(parent, /const \[contribSpecialist, setContribSpecialist\]/);
    assert.doesNotMatch(parent, /const \[contribText, setContribText\]/);
    assert.doesNotMatch(parent, /const handleContribute/);
    assert.doesNotMatch(parent, /const handleVoteOnly/);
  });
});

describe('extracted: SessionsAttachedRowActions (v1.10.550)', () => {
  it('lives in its own file with default export', () => {
    const src = read('SessionsAttachedRowActions.tsx');
    assert.match(src, /export default function SessionsAttachedRowActions/);
  });

  it('owns the copyToClipboard + attachedRoleStyle helpers', () => {
    const src = read('SessionsAttachedRowActions.tsx');
    assert.match(src, /function copyToClipboard\(text: string\)/);
    assert.match(src, /function attachedRoleStyle\(role: AttachedRole/);
  });

  it('owns the AttachProcessState type internally', () => {
    const src = read('SessionsAttachedRowActions.tsx');
    assert.match(src, /type AttachProcessState/);
  });

  it('owns its 4 internal state pieces (showResume / showDetachConfirm / copied / procState)', () => {
    const src = read('SessionsAttachedRowActions.tsx');
    assert.match(src, /useState\(false\)/);
    assert.match(src, /useState<AttachProcessState>/);
  });

  it('polls /api/attach/<name>/process every 30s while mounted', () => {
    const src = read('SessionsAttachedRowActions.tsx');
    assert.match(src, /window\.setInterval\(poll, 30000\)/);
    assert.match(src, /\/api\/attach\/\$\{encodeURIComponent\(session\.name\)\}\/process/);
  });

  it('takes session / isSelected / onView / onDetach props', () => {
    const src = read('SessionsAttachedRowActions.tsx');
    assert.match(src, /session:\s*AttachedSession/);
    assert.match(src, /isSelected:\s*boolean/);
    assert.match(src, /onView:\s*\(\)\s*=>\s*void/);
    assert.match(src, /onDetach:\s*\(\)\s*=>\s*void/);
  });

  it('is imported by SessionsAttachedSection (since v1.10.578)', () => {
    // v1.10.578 wrapped the row in SessionsAttachedSection — that's
    // where the rendering now happens.
    const parent = read('SessionsAttachedSection.tsx');
    assert.match(parent, /import\s+SessionsAttachedRowActions\s+from\s+'\.\/SessionsAttachedRowActions'/);
    assert.match(parent, /<SessionsAttachedRowActions/);
  });

  it('parent SessionsView no longer holds the component definition or its helpers', () => {
    const parent = read('SessionsView.tsx');
    assert.doesNotMatch(parent, /function AttachedRowActions\(/);
    assert.doesNotMatch(parent, /function copyToClipboard\b/);
    assert.doesNotMatch(parent, /function attachedRoleStyle\b/);
    assert.doesNotMatch(parent, /interface AttachedRowActionsProps/);
  });
});

describe('extracted: SessionsEmptyAttachBanner (v1.10.549)', () => {
  it('lives in its own file with default export', () => {
    const src = read('SessionsEmptyAttachBanner.tsx');
    assert.match(src, /export default function SessionsEmptyAttachBanner/);
  });

  it('takes onAttachClick prop', () => {
    const src = read('SessionsEmptyAttachBanner.tsx');
    assert.match(src, /onAttachClick:\s*\(\)\s*=>\s*void/);
  });

  it('reuses EMPTY_ATTACH_* key constants from SessionsView', () => {
    const src = read('SessionsEmptyAttachBanner.tsx');
    assert.match(src, /from\s+'\.\/SessionsView'/);
    assert.match(src, /EMPTY_ATTACH_BANNER_TITLE_KEY/);
    assert.match(src, /EMPTY_ATTACH_BANNER_BODY_KEY/);
  });

  it('is imported by SessionsAttachedSection (since v1.10.578)', () => {
    const parent = read('SessionsAttachedSection.tsx');
    assert.match(parent, /import\s+SessionsEmptyAttachBanner\s+from\s+'\.\/SessionsEmptyAttachBanner'/);
    assert.match(parent, /<SessionsEmptyAttachBanner/);
  });
});

describe('extracted: SessionsComparisonCard (v1.10.549)', () => {
  it('lives in its own file with default export', () => {
    const src = read('SessionsComparisonCard.tsx');
    assert.match(src, /export default function SessionsComparisonCard/);
  });

  it('reuses COMPARISON_* key constants from SessionsView', () => {
    const src = read('SessionsComparisonCard.tsx');
    assert.match(src, /from\s+'\.\/SessionsView'/);
    assert.match(src, /COMPARISON_TITLE_KEY/);
    assert.match(src, /COMPARISON_ROW_KEYS/);
  });

  it('is rendered at >= 2 call sites combined (SessionsRightPane + SessionsEmptyPanel)', () => {
    // (v1.10.601) ComparisonCard's empty-pane site moved to
    // SessionsEmptyPanel.
    // (v1.10.607) ComparisonCard's attached-pane site moved to
    // SessionsRightPane. Count all containers to lock the
    // original "2+ usages" invariant.
    const right = read('SessionsRightPane.tsx');
    const empty = read('SessionsEmptyPanel.tsx');
    assert.match(right, /import\s+SessionsComparisonCard\s+from\s+'\.\/SessionsComparisonCard'/);
    assert.match(empty, /import\s+SessionsComparisonCard\s+from\s+'\.\/SessionsComparisonCard'/);
    const rightCalls = right.match(/<SessionsComparisonCard/g) || [];
    const emptyCalls = empty.match(/<SessionsComparisonCard/g) || [];
    const total = rightCalls.length + emptyCalls.length;
    assert.ok(
      total >= 2,
      `expected >= 2 call sites combined, saw ${total} (right=${rightCalls.length}, empty=${emptyCalls.length})`,
    );
  });

  it('parent SessionsView no longer holds the inline component definition', () => {
    const parent = read('SessionsView.tsx');
    assert.doesNotMatch(parent, /function ComparisonCard\(/);
    assert.doesNotMatch(parent, /function EmptyAttachBanner\(/);
  });
});

describe('extracted: MeetingsDetailHeader (v1.10.548)', () => {
  it('lives in its own file with default export', () => {
    const src = read('MeetingsDetailHeader.tsx');
    assert.match(src, /export default function MeetingsDetailHeader/);
  });

  it('is a pure-display component (no state, no effects)', () => {
    const src = read('MeetingsDetailHeader.tsx');
    assert.doesNotMatch(src, /useState/);
    assert.doesNotMatch(src, /useEffect/);
  });

  it('takes status / track / currentStage / currentRound / task props', () => {
    const src = read('MeetingsDetailHeader.tsx');
    assert.match(src, /status:\s*MeetingStatus/);
    assert.match(src, /currentStage:\s*string\s*\|\s*null/);
    assert.match(src, /currentRound:\s*number/);
  });

  it('is imported and rendered by MeetingsDetailBody (v1.10.596)', () => {
    const parent = read('MeetingsDetailBody.tsx');
    assert.match(parent, /import\s+MeetingsDetailHeader\s+from\s+'\.\/MeetingsDetailHeader'/);
    assert.match(parent, /<MeetingsDetailHeader/);
    assert.match(parent, /status=\{detail\.status\}/);
    assert.match(parent, /task=\{detail\.task\}/);
  });
});

describe('extracted: MeetingsStagesView (v1.10.547)', () => {
  it('lives in its own file with default export', () => {
    const src = read('MeetingsStagesView.tsx');
    assert.match(src, /export default function MeetingsStagesView/);
  });

  it('exports the StageView type', () => {
    const src = read('MeetingsStagesView.tsx');
    assert.match(src, /export interface StageView/);
  });

  it('takes stages + transcripts arrays', () => {
    const src = read('MeetingsStagesView.tsx');
    assert.match(src, /stages:\s*StageView\[\]/);
    assert.match(src, /transcripts:\s*Turn\[\]\[\]/);
  });

  it('is imported and rendered by MeetingsDetailBody (v1.10.596)', () => {
    const parent = read('MeetingsDetailBody.tsx');
    assert.match(parent, /import\s+MeetingsStagesView\s+from\s+'\.\/MeetingsStagesView'/);
    assert.match(parent, /<MeetingsStagesView\s+stages=\{detail\.stages\}\s+transcripts=\{detail\.transcripts\}/);
  });

  it('parent MeetingsView no longer holds inline StageView interface nor the stages JSX', () => {
    const parent = read('MeetingsView.tsx');
    assert.doesNotMatch(parent, /^interface StageView/m);
    assert.doesNotMatch(parent, /detail\.stages\.map\(\(stage, idx\) =>/);
  });
});

describe('extracted: SpecialistsAddPanel (v1.10.546)', () => {
  it('lives in its own file with default export', () => {
    const src = read('SpecialistsAddPanel.tsx');
    assert.match(src, /export default function SpecialistsAddPanel/);
  });

  it('takes open / onClose / onAdded props', () => {
    const src = read('SpecialistsAddPanel.tsx');
    assert.match(src, /open:\s*boolean/);
    assert.match(src, /onClose:\s*\(\)\s*=>\s*void/);
    assert.match(src, /onAdded:\s*\(newId:\s*string\)\s*=>\s*void/);
  });

  it('owns both Add (POST /specialists) and Propose (POST /specialists/propose) handlers', () => {
    const src = read('SpecialistsAddPanel.tsx');
    assert.match(src, /handleAdd/);
    assert.match(src, /handlePropose/);
    assert.match(src, /\/api\/specialists\/propose/);
  });

  it('owns its form / busy / message state internally', () => {
    const src = read('SpecialistsAddPanel.tsx');
    assert.match(src, /useState\(''\)/);
    assert.match(src, /useState\(false\)/);
    assert.match(src, /proposeRejected/);
  });

  it('is imported and rendered by SpecialistsView with onAdded wired to setSelectedId + refresh', () => {
    const parent = read('SpecialistsView.tsx');
    assert.match(parent, /import\s+SpecialistsAddPanel\s+from\s+'\.\/SpecialistsAddPanel'/);
    assert.match(parent, /<SpecialistsAddPanel/);
    assert.match(parent, /setSelectedId\(newId\)/);
  });

  it('parent SpecialistsView no longer holds add/propose state nor handlers', () => {
    const parent = read('SpecialistsView.tsx');
    assert.doesNotMatch(parent, /const \[addJson, setAddJson\]/);
    assert.doesNotMatch(parent, /const \[proposeBusy, setProposeBusy\]/);
    assert.doesNotMatch(parent, /const handleAdd /);
    assert.doesNotMatch(parent, /const handlePropose /);
  });
});

describe('extracted: SpecialistsSummaryBar (v1.10.545)', () => {
  it('lives in its own file with default export', () => {
    const src = read('SpecialistsSummaryBar.tsx');
    assert.match(src, /export default function SpecialistsSummaryBar/);
  });

  it('owns its own polling effect (30s tick)', () => {
    const src = read('SpecialistsSummaryBar.tsx');
    assert.match(src, /window\.setInterval\(fetchSummary, 30000\)/);
  });

  it('hits /api/specialists/summary directly (zero-prop self-fetch)', () => {
    const src = read('SpecialistsSummaryBar.tsx');
    assert.match(src, /apiGet<OrganismSummary>\('\/api\/specialists\/summary'\)/);
  });

  it('renders nothing when summary fetch has not yet succeeded', () => {
    const src = read('SpecialistsSummaryBar.tsx');
    assert.match(src, /if \(!summary\) return null/);
  });

  it('is imported and rendered by SpecialistsView with no props', () => {
    const parent = read('SpecialistsView.tsx');
    assert.match(parent, /import\s+SpecialistsSummaryBar\s+from\s+'\.\/SpecialistsSummaryBar'/);
    assert.match(parent, /<SpecialistsSummaryBar\s*\/>/);
  });

  it('parent SpecialistsView no longer holds OrganismSummary state', () => {
    const parent = read('SpecialistsView.tsx');
    assert.doesNotMatch(parent, /interface OrganismSummary/);
    assert.doesNotMatch(parent, /const \[summary, setSummary\]/);
  });
});

describe('extracted: MeetingsForkForm (v1.10.544)', () => {
  it('lives in its own file with default export', () => {
    const src = read('MeetingsForkForm.tsx');
    assert.match(src, /export default function MeetingsForkForm/);
  });

  it('takes open / meeting / busy / onClose / onForked props', () => {
    const src = read('MeetingsForkForm.tsx');
    assert.match(src, /open:\s*boolean/);
    assert.match(src, /meeting:\s*MeetingDetail/);
    assert.match(src, /onClose:\s*\(\)\s*=>\s*void/);
    assert.match(src, /onForked:\s*\(newId:\s*string\)\s*=>\s*void/);
  });

  it('owns its own form state (mode / task / title / track / busy / error)', () => {
    const src = read('MeetingsForkForm.tsx');
    assert.match(src, /useState<'replan' \| 'reuse'>/);
    assert.match(src, /useState<'auto' \| 'lightweight' \| 'standard' \| 'full'>/);
  });

  it('resets on meeting change so form state does not leak across meetings', () => {
    const src = read('MeetingsForkForm.tsx');
    assert.match(src, /useEffect/);
    assert.match(src, /\[meeting\.id\]/);
  });

  it('is imported and rendered by MeetingsDetailCompletedActions (v1.10.593)', () => {
    const parent = read('MeetingsDetailCompletedActions.tsx');
    assert.match(parent, /import\s+MeetingsForkForm\s+from\s+'\.\/MeetingsForkForm'/);
    assert.match(parent, /<MeetingsForkForm/);
    assert.match(parent, /onForked=/);
  });

  it('parent MeetingsView no longer holds fork form state nor handler', () => {
    const parent = read('MeetingsView.tsx');
    assert.doesNotMatch(parent, /const \[forkMode, setForkMode\]/);
    assert.doesNotMatch(parent, /const \[forkTask, setForkTask\]/);
    assert.doesNotMatch(parent, /const \[forkTitle, setForkTitle\]/);
    assert.doesNotMatch(parent, /const \[forkBusy, setForkBusy\]/);
    assert.doesNotMatch(parent, /const handleFork/);
  });
});

describe('extracted: MeetingsLineageStrip (v1.10.543)', () => {
  it('lives in its own file with default export', () => {
    const src = read('MeetingsLineageStrip.tsx');
    assert.match(src, /export default function MeetingsLineageStrip/);
  });

  it('exports the LineageResponse type', () => {
    const src = read('MeetingsLineageStrip.tsx');
    assert.match(src, /export interface LineageResponse/);
  });

  it('takes lineage / currentId / onNavigate props', () => {
    const src = read('MeetingsLineageStrip.tsx');
    assert.match(src, /lineage:\s*LineageResponse\s*\|\s*null/);
    assert.match(src, /currentId:\s*string/);
    assert.match(src, /onNavigate:\s*\(id:\s*string\)\s*=>\s*void/);
  });

  it('renders nothing when depth <= 1 (no ancestry to show)', () => {
    const src = read('MeetingsLineageStrip.tsx');
    assert.match(src, /lineage\.depth <= 1.*return null/s);
  });

  it('is imported and rendered by MeetingsDetailBody (v1.10.596)', () => {
    const parent = read('MeetingsDetailBody.tsx');
    assert.match(parent, /import MeetingsLineageStrip,\s*\{\s*type LineageResponse\s*\}\s*from\s*'\.\/MeetingsLineageStrip'/);
    assert.match(parent, /<MeetingsLineageStrip/);
  });

  it('parent MeetingsView no longer holds LineageEntry / LineageResponse', () => {
    const parent = read('MeetingsView.tsx');
    assert.doesNotMatch(parent, /^interface LineageEntry/m);
    assert.doesNotMatch(parent, /^interface LineageResponse/m);
  });
});

describe('extracted: MeetingsStuckBanner (v1.10.543)', () => {
  it('lives in its own file with default export', () => {
    const src = read('MeetingsStuckBanner.tsx');
    assert.match(src, /export default function MeetingsStuckBanner/);
  });

  it('exports the StuckResponse type', () => {
    const src = read('MeetingsStuckBanner.tsx');
    assert.match(src, /export interface StuckResponse/);
  });

  it('takes stuck / onNavigate props', () => {
    const src = read('MeetingsStuckBanner.tsx');
    assert.match(src, /stuck:\s*StuckResponse\s*\|\s*null/);
    assert.match(src, /onNavigate:\s*\(id:\s*string\)\s*=>\s*void/);
  });

  it('renders nothing when count is 0', () => {
    const src = read('MeetingsStuckBanner.tsx');
    assert.match(src, /stuck\.count === 0.*return null/s);
  });

  it('is imported and rendered by MeetingsView', () => {
    const parent = read('MeetingsView.tsx');
    assert.match(parent, /import MeetingsStuckBanner,\s*\{\s*type StuckResponse\s*\}\s*from\s*'\.\/MeetingsStuckBanner'/);
    assert.match(parent, /<MeetingsStuckBanner/);
  });

  it('parent MeetingsView no longer holds inline StuckEntry interface', () => {
    const parent = read('MeetingsView.tsx');
    assert.doesNotMatch(parent, /interface StuckEntry/);
  });
});

describe('extracted: MeetingsActionItemsPanel (v1.10.542)', () => {
  it('lives in its own file with default export', () => {
    const src = read('MeetingsActionItemsPanel.tsx');
    assert.match(src, /export default function MeetingsActionItemsPanel/);
  });

  it('exports the ActionItemsResponse type', () => {
    const src = read('MeetingsActionItemsPanel.tsx');
    assert.match(src, /export interface ActionItemsResponse/);
  });

  it('owns its own filter state (4 categories + null)', () => {
    const src = read('MeetingsActionItemsPanel.tsx');
    assert.match(src, /useState<ActionItemType \| null>/);
  });

  it('owns the JSON download + Markdown copy export handlers', () => {
    const src = read('MeetingsActionItemsPanel.tsx');
    assert.match(src, /handleDownloadJson/);
    assert.match(src, /handleCopyMd/);
    assert.match(src, /navigator\.clipboard\.writeText/);
  });

  it('is imported and rendered by MeetingsDetailBody (v1.10.596)', () => {
    const parent = read('MeetingsDetailBody.tsx');
    assert.match(parent, /import MeetingsActionItemsPanel,\s*\{\s*type ActionItemsResponse\s*\}\s*from\s*'\.\/MeetingsActionItemsPanel'/);
    assert.match(parent, /<MeetingsActionItemsPanel\s+actions=\{actions\}\s+meetingId=\{selectedId\}/);
  });

  it('parent MeetingsView no longer holds actionsFilter state nor inline UI', () => {
    const parent = read('MeetingsView.tsx');
    assert.doesNotMatch(parent, /const \[actionsFilter, setActionsFilter\]/);
    assert.doesNotMatch(parent, /interface ActionItemsResponse/);
  });
});

describe('extracted: MeetingsRecapPanel (v1.10.541)', () => {
  it('lives in its own file with default export', () => {
    const src = read('MeetingsRecapPanel.tsx');
    assert.match(src, /export default function MeetingsRecapPanel/);
  });

  it('exports the RecapResponse type', () => {
    const src = read('MeetingsRecapPanel.tsx');
    assert.match(src, /export interface RecapResponse/);
  });

  it('owns its open/closed state (collapsed by default)', () => {
    const src = read('MeetingsRecapPanel.tsx');
    assert.match(src, /useState\(false\)/);
    assert.match(src, /aria-expanded=\{open\}/);
  });

  it('is imported and rendered by MeetingsDetailBody (v1.10.596)', () => {
    const parent = read('MeetingsDetailBody.tsx');
    assert.match(parent, /import MeetingsRecapPanel,\s*\{\s*type RecapResponse\s*\}\s*from\s*'\.\/MeetingsRecapPanel'/);
    assert.match(parent, /<MeetingsRecapPanel\s+recap=\{recap\}\s*\/>/);
  });

  it('parent MeetingsView no longer holds recapOpen state nor RecapResponse type', () => {
    const parent = read('MeetingsView.tsx');
    assert.doesNotMatch(parent, /const \[recapOpen, setRecapOpen\]/);
    assert.doesNotMatch(parent, /^interface RecapResponse/m);
    assert.doesNotMatch(parent, /^interface RecapStage/m);
  });
});

describe('extracted: AttachModal (v1.10.540)', () => {
  it('lives in its own file with default export', () => {
    const src = read('AttachModal.tsx');
    assert.match(src, /export default function AttachModal/);
  });

  it('exports its props interface', () => {
    const src = read('AttachModal.tsx');
    assert.match(src, /export interface AttachModalProps/);
  });

  it('imports formatRelative + shortId + help-key constants from SessionsView', () => {
    const src = read('AttachModal.tsx');
    assert.match(src, /from\s+'\.\/SessionsView'/);
    assert.match(src, /formatRelative/);
    assert.match(src, /shortId/);
    assert.match(src, /POST_ATTACH_HELP_TITLE_KEY/);
    assert.match(src, /POST_ATTACH_HELP_ITEM_KEYS/);
  });

  it('is imported by SessionsView', () => {
    const parent = read('SessionsView.tsx');
    assert.match(parent, /import\s+AttachModal\s+from\s+'\.\/AttachModal'/);
    assert.match(parent, /<AttachModal/);
  });

  it('parent SessionsView no longer holds the modal definition', () => {
    const parent = read('SessionsView.tsx');
    assert.doesNotMatch(parent, /function AttachModal\(\{/);
    assert.doesNotMatch(parent, /interface AttachModalProps/);
  });
});

describe('extracted: NewChatModal (v1.10.539)', () => {
  it('lives in its own file with default export', () => {
    const src = read('NewChatModal.tsx');
    assert.match(src, /export default function NewChatModal/);
  });

  it('exports its props interface (consumed by SessionsView via type)', () => {
    const src = read('NewChatModal.tsx');
    assert.match(src, /export interface NewChatModalProps/);
  });

  it('hosts MODEL_CHOICES + AGENT_CHOICES constants (used only here)', () => {
    const src = read('NewChatModal.tsx');
    assert.match(src, /const MODEL_CHOICES:/);
    assert.match(src, /const AGENT_CHOICES:/);
  });

  it('is imported by SessionsView', () => {
    const parent = read('SessionsView.tsx');
    assert.match(parent, /import\s+NewChatModal\s+from\s+'\.\/NewChatModal'/);
    assert.match(parent, /<NewChatModal/);
  });

  it('parent SessionsView no longer holds the modal definition', () => {
    const parent = read('SessionsView.tsx');
    assert.doesNotMatch(parent, /function NewChatModal\(/);
    assert.doesNotMatch(parent, /interface NewChatModalProps/);
    assert.doesNotMatch(parent, /const MODEL_CHOICES:/);
  });
});

describe('extracted: MeetingsTemplateEditor (v1.10.538)', () => {
  it('lives in its own file with default export', () => {
    const src = read('MeetingsTemplateEditor.tsx');
    assert.match(src, /export default function MeetingsTemplateEditor/);
  });

  it('is a controlled component (open / tpl / onClose / onSaved / onDeleted props)', () => {
    const src = read('MeetingsTemplateEditor.tsx');
    assert.match(src, /open:\s*boolean/);
    assert.match(src, /tpl:\s*TemplateLike\s*\|\s*null/);
    assert.match(src, /onClose:\s*\(\)\s*=>\s*void/);
    assert.match(src, /onSaved:\s*\(\)\s*=>\s*void/);
    assert.match(src, /onDeleted:\s*\(deletedName:\s*string\)\s*=>\s*void/);
  });

  it('is imported and rendered by MeetingsComposer with all props wired', () => {
    // (v1.10.557) Composer extracted; the template editor now lives
    // inside it (not directly in MeetingsView).
    const parent = read('MeetingsComposer.tsx');
    assert.match(parent, /import\s+MeetingsTemplateEditor\s+from\s+'\.\/MeetingsTemplateEditor'/);
    assert.match(parent, /<MeetingsTemplateEditor/);
    assert.match(parent, /open=\{tplEditorOpen\}/);
    assert.match(parent, /tpl=\{tplEditTarget\}/);
    assert.match(parent, /onClose=\{\(\)\s*=>\s*setTplEditorOpen\(false\)\}/);
  });

  it('parent MeetingsView no longer holds template form state', () => {
    const parent = read('MeetingsView.tsx');
    assert.doesNotMatch(parent, /const \[tplName, setTplName\]/);
    assert.doesNotMatch(parent, /const \[tplTask, setTplTask\]/);
    assert.doesNotMatch(parent, /const \[tplBusy, setTplBusy\]/);
    assert.doesNotMatch(parent, /const handleTplSave/);
    assert.doesNotMatch(parent, /const handleTplDelete/);
  });
});

describe('extracted: SpecialistsBulkOpsToolbar (v1.10.532)', () => {
  it('lives in its own file with default export', () => {
    const src = read('SpecialistsBulkOpsToolbar.tsx');
    assert.match(src, /export default function SpecialistsBulkOpsToolbar/);
  });

  it('takes an onChange prop (parent refresh callback)', () => {
    const src = read('SpecialistsBulkOpsToolbar.tsx');
    assert.match(src, /onChange:\s*\(\)\s*=>\s*void\s*\|\s*Promise<void>/);
  });

  it('is imported and rendered by SpecialistsView with onChange wired to refresh', () => {
    const parent = read('SpecialistsView.tsx');
    assert.match(parent, /import\s+SpecialistsBulkOpsToolbar\s+from\s+'\.\/SpecialistsBulkOpsToolbar'/);
    assert.match(parent, /<SpecialistsBulkOpsToolbar\s+onChange=\{refresh\}\s*\/>/);
  });

  it('owns the export / import / audit-rotate handlers', () => {
    const src = read('SpecialistsBulkOpsToolbar.tsx');
    assert.match(src, /handleExport/);
    assert.match(src, /handleImportFile/);
    assert.match(src, /handleImportApply/);
    assert.match(src, /handleAuditRotate/);
  });

  it('parent SpecialistsView no longer holds bulk-ops state', () => {
    // After v1.10.532, the parent must not declare these.
    const parent = read('SpecialistsView.tsx');
    assert.doesNotMatch(parent, /const \[exportBusy, setExportBusy\]/);
    assert.doesNotMatch(parent, /const \[rotateBusy, setRotateBusy\]/);
    assert.doesNotMatch(parent, /const \[importPreview, setImportPreview\]/);
  });
});

describe('extracted: ChatComposer (v1.10.612)', () => {
  it('lives in its own file with default export', () => {
    const src = read('ChatComposer.tsx');
    assert.match(src, /export default function ChatComposer/);
  });

  it('takes textareaRef + 4 controlled inputs + 3 callback props', () => {
    const src = read('ChatComposer.tsx');
    assert.match(src, /textareaRef:\s*RefObject<HTMLTextAreaElement>/);
    assert.match(src, /input:\s*string/);
    assert.match(src, /workerName:\s*string/);
    assert.match(src, /sending:\s*boolean/);
    assert.match(src, /onChangeInput:\s*\(next:\s*string\)\s*=>\s*void/);
    assert.match(src, /onKeyDown:\s*\(e:\s*KeyboardEvent<HTMLTextAreaElement>\)\s*=>\s*void/);
    assert.match(src, /onSubmit:\s*\(e\?:\s*FormEvent<HTMLFormElement>\)\s*=>\s*void/);
  });

  it('renders textarea (Enter submits, Shift+Enter newlines via parent) + Send button', () => {
    const src = read('ChatComposer.tsx');
    assert.match(src, /chatView\.placeholder\.message/);
    assert.match(src, /chatView\.send/);
    assert.match(src, /chatView\.sending/);
  });

  it('is imported and rendered by ChatView', () => {
    const parent = read('ChatView.tsx');
    assert.match(parent, /import\s+ChatComposer\s+from\s+'\.\/ChatComposer'/);
    assert.match(parent, /<ChatComposer/);
    assert.match(parent, /onSubmit=\{handleSubmit\}/);
  });

  it('parent ChatView no longer holds the inline form', () => {
    const parent = read('ChatView.tsx');
    assert.doesNotMatch(parent, /<form onSubmit=/);
    assert.doesNotMatch(parent, /chatView\.placeholder\.message/);
    assert.doesNotMatch(parent, /<Button\b/);
  });
});

describe('extracted: WorkerDetailComposer (v1.10.611)', () => {
  it('lives in its own file with default export', () => {
    const src = read('WorkerDetailComposer.tsx');
    assert.match(src, /export default function WorkerDetailComposer/);
  });

  it('takes inputText/busy + 5 callback props', () => {
    const src = read('WorkerDetailComposer.tsx');
    assert.match(src, /inputText:\s*string/);
    assert.match(src, /busy:\s*boolean/);
    assert.match(src, /onChangeInputText:\s*\(next:\s*string\)\s*=>\s*void/);
    assert.match(src, /onSend:\s*\(\)\s*=>\s*void/);
    assert.match(src, /onEnter:\s*\(\)\s*=>\s*void/);
    assert.match(src, /onMerge:\s*\(\)\s*=>\s*void/);
    assert.match(src, /onClose:\s*\(\)\s*=>\s*void/);
  });

  it('renders text input + Send (icon) + Enter + Merge + Close buttons', () => {
    const src = read('WorkerDetailComposer.tsx');
    assert.match(src, /workerDetail\.composer\.placeholder/);
    assert.match(src, /workerDetail\.composer\.sendText/);
    assert.match(src, /workerDetail\.composer\.enter/);
    assert.match(src, /workerDetail\.composer\.merge/);
    assert.match(src, /workerDetail\.composer\.close/);
    assert.match(src, /e\.key === 'Enter' && !e\.shiftKey/);
  });

  it('is imported and rendered by WorkerDetail', () => {
    const parent = read('WorkerDetail.tsx');
    assert.match(parent, /import\s+WorkerDetailComposer\s+from\s+'\.\/WorkerDetailComposer'/);
    assert.match(parent, /<WorkerDetailComposer/);
    assert.match(parent, /onSend=\{handleSend\}/);
  });

  it('parent WorkerDetail no longer holds the inline composer row', () => {
    const parent = read('WorkerDetail.tsx');
    assert.doesNotMatch(parent, /workerDetail\.composer\.placeholder/);
    assert.doesNotMatch(parent, /<GitMerge/);
  });
});

describe('extracted: WorkerDetailKeysRow (v1.10.610)', () => {
  it('lives in its own file with default export', () => {
    const src = read('WorkerDetailKeysRow.tsx');
    assert.match(src, /export default function WorkerDetailKeysRow/);
  });

  it('takes busy + onSendKey props with SendableKey union', () => {
    const src = read('WorkerDetailKeysRow.tsx');
    assert.match(src, /export\s+type\s+SendableKey/);
    assert.match(src, /busy:\s*boolean/);
    assert.match(src, /onSendKey:\s*\(key:\s*SendableKey\)\s*=>\s*void/);
  });

  it('renders the 4 control keys (Esc/C-c/C-d/Tab) + 4 arrows + heading; mobile only', () => {
    const src = read('WorkerDetailKeysRow.tsx');
    assert.match(src, /workerDetail\.keys\.heading/);
    assert.match(src, /workerDetail\.keys\.esc/);
    assert.match(src, /workerDetail\.keys\.ctrlC/);
    assert.match(src, /workerDetail\.keys\.ctrlD/);
    assert.match(src, /workerDetail\.keys\.tab/);
    assert.match(src, /workerDetail\.keys\.arrowUp/);
    assert.match(src, /md:hidden/);
  });

  it('is imported and rendered by WorkerDetail', () => {
    const parent = read('WorkerDetail.tsx');
    assert.match(parent, /import\s+WorkerDetailKeysRow\s+from\s+'\.\/WorkerDetailKeysRow'/);
    assert.match(parent, /<WorkerDetailKeysRow/);
    assert.match(parent, /onSendKey=\{sendKey\}/);
  });

  it('parent WorkerDetail no longer holds the inline keys row', () => {
    const parent = read('WorkerDetail.tsx');
    assert.doesNotMatch(parent, /workerDetail\.keys\.heading/);
    assert.doesNotMatch(parent, /workerDetail\.keys\.arrowUp/);
  });
});

describe('extracted: WikiSearchControls (v1.10.609)', () => {
  it('lives in its own file with default export', () => {
    const src = read('WikiSearchControls.tsx');
    assert.match(src, /export default function WikiSearchControls/);
  });

  it('takes 4 controlled-input pairs + searching + onSearch props', () => {
    const src = read('WikiSearchControls.tsx');
    assert.match(src, /query:\s*string/);
    assert.match(src, /onQuery:\s*\(next:\s*string\)\s*=>\s*void/);
    assert.match(src, /type:\s*string/);
    assert.match(src, /onType:\s*\(next:\s*string\)\s*=>\s*void/);
    assert.match(src, /includeStale:\s*boolean/);
    assert.match(src, /onIncludeStale:\s*\(next:\s*boolean\)\s*=>\s*void/);
    assert.match(src, /searching:\s*boolean/);
    assert.match(src, /onSearch:\s*\(\)\s*=>\s*void/);
  });

  it('renders the input + type select + includeStale + Search button', () => {
    const src = read('WikiSearchControls.tsx');
    assert.match(src, /wiki\.search\.placeholder/);
    assert.match(src, /TYPE_OPTIONS\.map/);
    assert.match(src, /wiki\.includeStale/);
    assert.match(src, /wiki\.search\.button/);
    assert.match(src, /e\.key === 'Enter'/);
  });

  it('parent WikiView exports TYPE_OPTIONS and imports WikiSearchControls', () => {
    const parent = read('WikiView.tsx');
    assert.match(parent, /export\s+const\s+TYPE_OPTIONS/);
    assert.match(parent, /import\s+WikiSearchControls\s+from\s+'\.\/WikiSearchControls'/);
    assert.match(parent, /<WikiSearchControls/);
    assert.match(parent, /onSearch=\{runSearch\}/);
  });

  it('parent WikiView no longer holds the inline search controls', () => {
    const parent = read('WikiView.tsx');
    assert.doesNotMatch(parent, /wiki\.search\.placeholder/);
    assert.doesNotMatch(parent, /TYPE_OPTIONS\.map/);
  });
});

describe('extracted: WikiBulkPublishRow (v1.10.608)', () => {
  it('lives in its own file with default export', () => {
    const src = read('WikiBulkPublishRow.tsx');
    assert.match(src, /export default function WikiBulkPublishRow/);
  });

  it('takes busy + git toggles + msg/failed + 3 callback props', () => {
    const src = read('WikiBulkPublishRow.tsx');
    assert.match(src, /busy:\s*boolean/);
    assert.match(src, /gitCommit:\s*boolean/);
    assert.match(src, /gitPush:\s*boolean/);
    assert.match(src, /msg:\s*string\s*\|\s*null/);
    assert.match(src, /failed:\s*boolean/);
    assert.match(src, /onGitCommit:\s*\(next:\s*boolean\)\s*=>\s*void/);
    assert.match(src, /onGitPush:\s*\(next:\s*boolean\)\s*=>\s*void/);
    assert.match(src, /onPublish:\s*\(\)\s*=>\s*void/);
  });

  it('renders publish button + 2 git toggles + result message; preserves toggle interlock', () => {
    const src = read('WikiBulkPublishRow.tsx');
    assert.match(src, /wiki\.publishAll\.label/);
    assert.match(src, /wiki\.publishAll\.publishing/);
    assert.match(src, /wiki\.gitCommit/);
    assert.match(src, /wiki\.gitPush/);
    assert.match(src, /if \(!e\.target\.checked\) onGitPush\(false\)/);
    assert.match(src, /if \(e\.target\.checked\) onGitCommit\(true\)/);
  });

  it('is imported and rendered by WikiView', () => {
    const parent = read('WikiView.tsx');
    assert.match(parent, /import\s+WikiBulkPublishRow\s+from\s+'\.\/WikiBulkPublishRow'/);
    assert.match(parent, /<WikiBulkPublishRow/);
    assert.match(parent, /onPublish=\{handleBulkPublish\}/);
  });

  it('parent WikiView no longer holds the inline publish row', () => {
    const parent = read('WikiView.tsx');
    assert.doesNotMatch(parent, /wiki\.publishAll\.label/);
    assert.doesNotMatch(parent, /wiki\.gitCommit/);
  });
});

describe('extracted: SessionsRightPane (v1.10.607)', () => {
  it('lives in its own file with default export', () => {
    const src = read('SessionsRightPane.tsx');
    assert.match(src, /export default function SessionsRightPane/);
  });

  it('takes selection + empty-state flag + 2 callback props', () => {
    const src = read('SessionsRightPane.tsx');
    assert.match(src, /selection:\s*Selection\s*\|\s*null/);
    assert.match(src, /showStartFirstEmptyState:\s*boolean/);
    assert.match(src, /onNewChat:\s*\(\)\s*=>\s*void/);
    assert.match(src, /onAttachNew:\s*\(\)\s*=>\s*void/);
  });

  it('composes ConversationView (session+attached cases) + SessionsComparisonCard + SessionsEmptyPanel', () => {
    const src = read('SessionsRightPane.tsx');
    assert.match(src, /<ConversationView/);
    assert.match(src, /<SessionsComparisonCard/);
    assert.match(src, /<SessionsEmptyPanel/);
    assert.match(src, /selection\.kind === 'session'/);
    assert.match(src, /selection\.kind === 'attached'/);
  });

  it('parent SessionsView exports Selection and imports SessionsRightPane', () => {
    const parent = read('SessionsView.tsx');
    assert.match(parent, /export\s+type\s+Selection/);
    assert.match(parent, /import\s+SessionsRightPane\s+from\s+'\.\/SessionsRightPane'/);
    assert.match(parent, /<SessionsRightPane/);
  });

  it('parent SessionsView no longer imports the 3 right-pane sub-components directly', () => {
    const parent = read('SessionsView.tsx');
    assert.doesNotMatch(parent, /import\s+ConversationView\s+from/);
    assert.doesNotMatch(parent, /import\s+SessionsComparisonCard\s+from/);
    assert.doesNotMatch(parent, /import\s+SessionsEmptyPanel\s+from/);
  });
});

describe('extracted: RiskStatsGrid (v1.10.606)', () => {
  it('lives in its own file with default export', () => {
    const src = read('RiskStatsGrid.tsx');
    assert.match(src, /export default function RiskStatsGrid/);
  });

  it('takes a single stats StatsResponse prop', () => {
    const src = read('RiskStatsGrid.tsx');
    assert.match(src, /stats:\s*StatsResponse/);
    assert.match(src, /from\s+'\.\.\/pages\/Risk'/);
  });

  it('renders the totals tiles + by-level breakdown + top reasons/workers + rotations banner', () => {
    const src = read('RiskStatsGrid.tsx');
    assert.match(src, /risk\.stats\.totalEvents/);
    assert.match(src, /risk\.stats\.enforced/);
    assert.match(src, /risk\.stats\.dryRun/);
    assert.match(src, /risk\.stats\.shadowExec/);
    assert.match(src, /risk\.stats\.topReasons/);
    assert.match(src, /risk\.stats\.topWorkers/);
    assert.match(src, /ruleSetRotations > 1/);
  });

  it('parent pages/Risk exports StatsResponse', () => {
    const fs = require('fs');
    const path = require('path');
    const src = fs.readFileSync(path.join(__dirname, '..', 'web', 'src', 'pages', 'Risk.tsx'), 'utf8');
    assert.match(src, /export\s+interface\s+StatsResponse/);
  });

  it('parent Risk page imports + renders RiskStatsGrid; inline grid removed', () => {
    const fs = require('fs');
    const path = require('path');
    const src = fs.readFileSync(path.join(__dirname, '..', 'web', 'src', 'pages', 'Risk.tsx'), 'utf8');
    assert.match(src, /import\s+RiskStatsGrid\s+from\s+'\.\.\/components\/RiskStatsGrid'/);
    assert.match(src, /<RiskStatsGrid\s+stats=\{stats\}/);
    assert.doesNotMatch(src, /risk\.stats\.totalEvents/);
    assert.doesNotMatch(src, /ruleSetRotations > 1/);
  });
});

describe('extracted: RiskCheckResult (v1.10.605)', () => {
  it('lives in its own file with default export', () => {
    const src = read('RiskCheckResult.tsx');
    assert.match(src, /export default function RiskCheckResult/);
  });

  it('takes a single result CheckResponse prop', () => {
    const src = read('RiskCheckResult.tsx');
    assert.match(src, /result:\s*CheckResponse/);
    assert.match(src, /from\s+'\.\.\/pages\/Risk'/);
  });

  it('renders the level/action/wouldDeny/denyList badges + threshold caption + reasons + intent rollups', () => {
    const src = read('RiskCheckResult.tsx');
    assert.match(src, /risk\.badge\.wouldDeny/);
    assert.match(src, /risk\.badge\.denyList/);
    assert.match(src, /risk\.threshold/);
    assert.match(src, /riskPage\.reasons/);
    assert.match(src, /riskPage\.decoded/);
    assert.match(src, /riskPage\.staticIntent/);
    assert.match(src, /risk\.intent\.writes/);
    assert.match(src, /risk\.intent\.destructive/);
  });

  it('parent pages/Risk exports CheckReason/CheckResponse + LEVEL_TONE/ACTION_TONE', () => {
    const fs = require('fs');
    const path = require('path');
    const src = fs.readFileSync(path.join(__dirname, '..', 'web', 'src', 'pages', 'Risk.tsx'), 'utf8');
    assert.match(src, /export\s+interface\s+CheckReason/);
    assert.match(src, /export\s+interface\s+CheckResponse/);
    assert.match(src, /export\s+const\s+LEVEL_TONE/);
    assert.match(src, /export\s+const\s+ACTION_TONE/);
  });

  it('parent Risk page imports + renders RiskCheckResult; inline panel removed', () => {
    const fs = require('fs');
    const path = require('path');
    const src = fs.readFileSync(path.join(__dirname, '..', 'web', 'src', 'pages', 'Risk.tsx'), 'utf8');
    assert.match(src, /import\s+RiskCheckResult\s+from\s+'\.\.\/components\/RiskCheckResult'/);
    assert.match(src, /<RiskCheckResult\s+result=\{checkResult\}/);
    assert.doesNotMatch(src, /risk\.badge\.wouldDeny/);
    assert.doesNotMatch(src, /riskPage\.staticIntent/);
  });
});

describe('extracted: ChatMessageLog (v1.10.604)', () => {
  it('lives in its own file with default export', () => {
    const src = read('ChatMessageLog.tsx');
    assert.match(src, /export default function ChatMessageLog/);
  });

  it('takes scrollRef + 8 controlled props', () => {
    const src = read('ChatMessageLog.tsx');
    assert.match(src, /scrollRef:\s*RefObject<HTMLDivElement>/);
    assert.match(src, /onScroll:\s*\(e:\s*UIEvent<HTMLDivElement>\)\s*=>\s*void/);
    assert.match(src, /workerName:\s*string/);
    assert.match(src, /backfillLoading:\s*boolean/);
    assert.match(src, /backfillSource:\s*BackfillSource/);
    assert.match(src, /hasOlder:\s*boolean/);
    assert.match(src, /loadingOlder:\s*boolean/);
    assert.match(src, /messages:\s*ChatMessage\[\]/);
    assert.match(src, /onLoadOlder:\s*\(\)\s*=>\s*void/);
  });

  it('renders backfill skeleton + empty state + per-message bubbles', () => {
    const src = read('ChatMessageLog.tsx');
    assert.match(src, /chat\.loadingPast/);
    assert.match(src, /chat\.empty/);
    assert.match(src, /chat\.olderLoading/);
    assert.match(src, /chat\.loadOlder/);
    assert.match(src, /messages\.map/);
    assert.match(src, /isUser \? 'justify-end' : 'justify-start'/);
  });

  it('is imported and rendered by ChatView', () => {
    const parent = read('ChatView.tsx');
    assert.match(parent, /import\s+ChatMessageLog\s+from\s+'\.\/ChatMessageLog'/);
    assert.match(parent, /<ChatMessageLog/);
    assert.match(parent, /scrollRef=\{scrollRef\}/);
    assert.match(parent, /onScroll=\{onScroll\}/);
  });

  it('parent ChatView no longer holds the inline scroll container or per-message JSX', () => {
    const parent = read('ChatView.tsx');
    assert.doesNotMatch(parent, /chat\.empty/);
    assert.doesNotMatch(parent, /messages\.map/);
    assert.doesNotMatch(parent, /<Loader2/);
  });
});

describe('extracted: WorkflowSelectedHeader (v1.10.603)', () => {
  it('lives in its own file with default export', () => {
    const src = read('WorkflowSelectedHeader.tsx');
    assert.match(src, /export default function WorkflowSelectedHeader/);
  });

  it('takes workflow + busy + inputs state + 3 callback props', () => {
    const src = read('WorkflowSelectedHeader.tsx');
    assert.match(src, /workflow:\s*Workflow/);
    assert.match(src, /busy:\s*boolean/);
    assert.match(src, /inputsOpen:\s*boolean/);
    assert.match(src, /inputsJson:\s*string/);
    assert.match(src, /inputsError:\s*string\s*\|\s*null/);
    assert.match(src, /onToggleInputs:\s*\(\)\s*=>\s*void/);
    assert.match(src, /onChangeInputsJson:\s*\(next:\s*string\)\s*=>\s*void/);
    assert.match(src, /onRun:\s*\(\)\s*=>\s*void/);
  });

  it('renders title + description + Inputs toggle + Run button + JSON textarea', () => {
    const src = read('WorkflowSelectedHeader.tsx');
    assert.match(src, /workflows\.noDescription/);
    assert.match(src, /workflows\.inputs\.toggle\.show/);
    assert.match(src, /workflows\.inputs\.toggle\.hide/);
    assert.match(src, /workflows\.run\.button/);
    assert.match(src, /workflows\.inputs\.label/);
  });

  it('is imported and rendered by WorkflowEditor', () => {
    const parent = read('WorkflowEditor.tsx');
    assert.match(parent, /import\s+WorkflowSelectedHeader\s+from\s+'\.\/WorkflowSelectedHeader'/);
    assert.match(parent, /<WorkflowSelectedHeader/);
    assert.match(parent, /onRun=\{handleRun\}/);
    assert.match(parent, /onChangeInputsJson=\{setInputsJson\}/);
  });

  it('parent WorkflowEditor no longer holds the inline selected-header card', () => {
    const parent = read('WorkflowEditor.tsx');
    assert.doesNotMatch(parent, /workflows\.run\.button/);
    assert.doesNotMatch(parent, /workflows\.inputs\.toggle\.show/);
  });
});

describe('extracted: MeetingsListTitleBar (v1.10.602)', () => {
  it('lives in its own file with default export', () => {
    const src = read('MeetingsListTitleBar.tsx');
    assert.match(src, /export default function MeetingsListTitleBar/);
  });

  it('takes creating/loading + 2 callback props', () => {
    const src = read('MeetingsListTitleBar.tsx');
    assert.match(src, /creating:\s*boolean/);
    assert.match(src, /loading:\s*boolean/);
    assert.match(src, /onToggleCreating:\s*\(\)\s*=>\s*void/);
    assert.match(src, /onRefresh:\s*\(\)\s*=>\s*void/);
  });

  it('renders title + new + refresh buttons with i18n keys', () => {
    const src = read('MeetingsListTitleBar.tsx');
    assert.match(src, /meetings\.title/);
    assert.match(src, /meetings\.action\.newLabel/);
    assert.match(src, /meetings\.action\.refresh/);
  });

  it('is imported and rendered by MeetingsView', () => {
    const parent = read('MeetingsView.tsx');
    assert.match(parent, /import\s+MeetingsListTitleBar\s+from\s+'\.\/MeetingsListTitleBar'/);
    assert.match(parent, /<MeetingsListTitleBar/);
    assert.match(parent, /onRefresh=\{refresh\}/);
  });

  it('parent MeetingsView no longer holds the inline title row', () => {
    const parent = read('MeetingsView.tsx');
    assert.doesNotMatch(parent, /meetings\.action\.newLabel/);
    assert.doesNotMatch(parent, /<CardTitle/);
  });
});

describe('extracted: SessionsEmptyPanel (v1.10.601)', () => {
  it('lives in its own file with default export', () => {
    const src = read('SessionsEmptyPanel.tsx');
    assert.match(src, /export default function SessionsEmptyPanel/);
  });

  it('takes showStartFirst + 2 callback props', () => {
    const src = read('SessionsEmptyPanel.tsx');
    assert.match(src, /showStartFirst:\s*boolean/);
    assert.match(src, /onNewChat:\s*\(\)\s*=>\s*void/);
    assert.match(src, /onAttachNew:\s*\(\)\s*=>\s*void/);
  });

  it('renders the two distinct empty states (start-first CTAs vs select prompt)', () => {
    const src = read('SessionsEmptyPanel.tsx');
    assert.match(src, /sessions\.empty\.startFirstTitle/);
    assert.match(src, /sessions\.empty\.startFirstChat/);
    assert.match(src, /sessions\.empty\.attachExisting/);
    assert.match(src, /sessions\.empty\.selectPrompt/);
    assert.match(src, /<SessionsComparisonCard/);
  });

  it('is imported and rendered by SessionsRightPane (v1.10.607)', () => {
    const parent = read('SessionsRightPane.tsx');
    assert.match(parent, /import\s+SessionsEmptyPanel\s+from\s+'\.\/SessionsEmptyPanel'/);
    assert.match(parent, /<SessionsEmptyPanel/);
    assert.match(parent, /showStartFirst=\{showStartFirstEmptyState\}/);
  });

  it('parent SessionsView no longer holds the inline empty-state Cards', () => {
    const parent = read('SessionsView.tsx');
    assert.doesNotMatch(parent, /sessions\.empty\.startFirstTitle/);
    assert.doesNotMatch(parent, /sessions\.empty\.selectPrompt/);
  });
});

describe('extracted: WikiPageDetail (v1.10.600)', () => {
  it('lives in its own file with default export', () => {
    const src = read('WikiPageDetail.tsx');
    assert.match(src, /export default function WikiPageDetail/);
  });

  it('takes selectedPath/page/pageError + onSelectPath props', () => {
    const src = read('WikiPageDetail.tsx');
    assert.match(src, /selectedPath:\s*string\s*\|\s*null/);
    assert.match(src, /page:\s*ReadResponse\s*\|\s*null/);
    assert.match(src, /pageError:\s*string\s*\|\s*null/);
    assert.match(src, /onSelectPath:\s*\(path:\s*string\)\s*=>\s*void/);
  });

  it('renders empty/error/loading states + metadata grid + related chips + body pre', () => {
    const src = read('WikiPageDetail.tsx');
    assert.match(src, /wiki\.empty\.pickPage/);
    assert.match(src, /wiki\.loadingPage/);
    assert.match(src, /wiki\.field\.type/);
    assert.match(src, /wiki\.field\.status/);
    assert.match(src, /wiki\.field\.lastReviewed/);
    assert.match(src, /wiki\.relatedCount/);
    assert.match(src, /\{page\.body\}/);
  });

  it('parent WikiView exports ReadResponse and imports WikiPageDetail', () => {
    const parent = read('WikiView.tsx');
    assert.match(parent, /export\s+interface\s+ReadResponse/);
    assert.match(parent, /import\s+WikiPageDetail\s+from\s+'\.\/WikiPageDetail'/);
    assert.match(parent, /<WikiPageDetail/);
    assert.match(parent, /onSelectPath=\{setSelectedPath\}/);
  });

  it('parent WikiView no longer holds the inline detail body', () => {
    const parent = read('WikiView.tsx');
    assert.doesNotMatch(parent, /wiki\.empty\.pickPage/);
    assert.doesNotMatch(parent, /wiki\.field\.lastReviewed/);
    assert.doesNotMatch(parent, /wiki\.relatedCount/);
  });
});

describe('extracted: SpecialistsEnrichmentPanels (v1.10.599)', () => {
  it('lives in its own file with default export', () => {
    const src = read('SpecialistsEnrichmentPanels.tsx');
    assert.match(src, /export default function SpecialistsEnrichmentPanels/);
  });

  it('takes recentAudit/recentMeetings props', () => {
    const src = read('SpecialistsEnrichmentPanels.tsx');
    assert.match(src, /recentAudit\?:\s*AuditEntry\[\]\s*\|\s*undefined/);
    assert.match(src, /recentMeetings\?:\s*MeetingMeta\[\]\s*\|\s*undefined/);
  });

  it('renders both audit + meetings lists with array+length guards', () => {
    const src = read('SpecialistsEnrichmentPanels.tsx');
    assert.match(src, /specialists\.label\.recentAudit/);
    assert.match(src, /specialists\.label\.recentMeetings/);
    assert.match(src, /specialists\.event\.byActor/);
    assert.match(src, /Array\.isArray\(recentAudit\)/);
    assert.match(src, /Array\.isArray\(recentMeetings\)/);
  });

  it('parent SpecialistsView exports MeetingMeta + AuditEntry', () => {
    const parent = read('SpecialistsView.tsx');
    assert.match(parent, /export\s+interface\s+MeetingMeta/);
    assert.match(parent, /export\s+interface\s+AuditEntry/);
  });

  it('is imported and rendered by SpecialistsView; inline panels removed', () => {
    const parent = read('SpecialistsView.tsx');
    assert.match(parent, /import\s+SpecialistsEnrichmentPanels\s+from\s+'\.\/SpecialistsEnrichmentPanels'/);
    assert.match(parent, /<SpecialistsEnrichmentPanels/);
    assert.doesNotMatch(parent, /specialists\.label\.recentAudit/);
    assert.doesNotMatch(parent, /specialists\.label\.recentMeetings/);
  });
});

describe('extracted: SpecialistsScoreHistory (v1.10.598)', () => {
  it('lives in its own file with default export', () => {
    const src = read('SpecialistsScoreHistory.tsx');
    assert.match(src, /export default function SpecialistsScoreHistory/);
  });

  it('takes specialist + reset state + 2 callback props', () => {
    const src = read('SpecialistsScoreHistory.tsx');
    assert.match(src, /specialist:\s*Specialist/);
    assert.match(src, /confirmResetId:\s*string\s*\|\s*null/);
    assert.match(src, /resetBusy:\s*boolean/);
    assert.match(src, /onConfirmReset:\s*\(id:\s*string\s*\|\s*null\)\s*=>\s*void/);
    assert.match(src, /onScoreReset:\s*\(id:\s*string\)\s*=>\s*void/);
  });

  it('owns ScoreBar + scoreWidth + renders byDomain/byStage rolled-up', () => {
    const src = read('SpecialistsScoreHistory.tsx');
    assert.match(src, /function ScoreBar/);
    assert.match(src, /function scoreWidth/);
    assert.match(src, /specialists\.label\.byDomain/);
    assert.match(src, /specialists\.label\.byStage/);
    assert.match(src, /specialists\.action\.resetScore/);
    assert.match(src, /specialists\.empty\.scoreHistory/);
  });

  it('is imported and rendered by SpecialistsView', () => {
    const parent = read('SpecialistsView.tsx');
    assert.match(parent, /import\s+SpecialistsScoreHistory\s+from\s+'\.\/SpecialistsScoreHistory'/);
    assert.match(parent, /<SpecialistsScoreHistory/);
    assert.match(parent, /onConfirmReset=\{setConfirmResetId\}/);
    assert.match(parent, /onScoreReset=\{handleScoreReset\}/);
  });

  it('parent SpecialistsView no longer holds ScoreBar/scoreWidth nor inline score block', () => {
    const parent = read('SpecialistsView.tsx');
    assert.doesNotMatch(parent, /function ScoreBar/);
    assert.doesNotMatch(parent, /function scoreWidth/);
    assert.doesNotMatch(parent, /specialists\.label\.byDomain/);
  });
});

describe('extracted: SpecialistsMetadataPanel (v1.10.597)', () => {
  it('lives in its own file with default export', () => {
    const src = read('SpecialistsMetadataPanel.tsx');
    assert.match(src, /export default function SpecialistsMetadataPanel/);
  });

  it('takes a single specialist Specialist prop', () => {
    const src = read('SpecialistsMetadataPanel.tsx');
    assert.match(src, /specialist:\s*Specialist/);
  });

  it('renders the 4-column grid + domains/triggers/deliverables', () => {
    const src = read('SpecialistsMetadataPanel.tsx');
    assert.match(src, /specialists\.label\.tier/);
    assert.match(src, /specialists\.label\.brain/);
    assert.match(src, /specialists\.label\.model/);
    assert.match(src, /specialists\.label\.effort/);
    assert.match(src, /specialists\.label\.domains/);
    assert.match(src, /specialists\.label\.triggersStages/);
    assert.match(src, /specialists\.label\.triggersKeywords/);
    assert.match(src, /specialists\.label\.deliverables/);
  });

  it('is imported and rendered by SpecialistsView', () => {
    const parent = read('SpecialistsView.tsx');
    assert.match(parent, /import\s+SpecialistsMetadataPanel\s+from\s+'\.\/SpecialistsMetadataPanel'/);
    assert.match(parent, /<SpecialistsMetadataPanel\s+specialist=\{selected\}/);
  });

  it('parent SpecialistsView no longer holds the inline metadata grid', () => {
    const parent = read('SpecialistsView.tsx');
    assert.doesNotMatch(parent, /specialists\.label\.triggersStages/);
    assert.doesNotMatch(parent, /selected\.brain\.adapter/);
  });
});

describe('extracted: MeetingsDetailBody (v1.10.596)', () => {
  it('lives in its own file with default export', () => {
    const src = read('MeetingsDetailBody.tsx');
    assert.match(src, /export default function MeetingsDetailBody/);
  });

  it('takes selectedId/detail/lineage/recap/actions/onNavigate props', () => {
    const src = read('MeetingsDetailBody.tsx');
    assert.match(src, /selectedId:\s*string\s*\|\s*null/);
    assert.match(src, /detailError:\s*string\s*\|\s*null/);
    assert.match(src, /detail:\s*MeetingDetail\s*\|\s*null/);
    assert.match(src, /lineage:\s*LineageResponse\s*\|\s*null/);
    assert.match(src, /recap:\s*RecapResponse\s*\|\s*null/);
    assert.match(src, /actions:\s*ActionItemsResponse\s*\|\s*null/);
    assert.match(src, /onNavigate:\s*\(id:\s*string\)\s*=>\s*void/);
  });

  it('composes the 5 detail-body sub-components', () => {
    const src = read('MeetingsDetailBody.tsx');
    assert.match(src, /<MeetingsDetailHeader/);
    assert.match(src, /<MeetingsLineageStrip/);
    assert.match(src, /<MeetingsRecapPanel/);
    assert.match(src, /<MeetingsActionItemsPanel/);
    assert.match(src, /<MeetingsStagesView/);
  });

  it('handles the empty / error / loading states', () => {
    const src = read('MeetingsDetailBody.tsx');
    assert.match(src, /meetings\.empty\.pick/);
    assert.match(src, /detailError/);
    assert.match(src, /meetings\.loading/);
  });

  it('parent MeetingsView exports MeetingDetail and imports MeetingsDetailBody', () => {
    const parent = read('MeetingsView.tsx');
    assert.match(parent, /export\s+interface\s+MeetingDetail/);
    assert.match(parent, /import\s+MeetingsDetailBody\s+from\s+'\.\/MeetingsDetailBody'/);
    assert.match(parent, /<MeetingsDetailBody/);
  });

  it('parent MeetingsView no longer imports the 5 sub-components directly', () => {
    const parent = read('MeetingsView.tsx');
    assert.doesNotMatch(parent, /import\s+MeetingsDetailHeader\s+from/);
    assert.doesNotMatch(parent, /import MeetingsLineageStrip,\s*\{\s*type/);
    assert.doesNotMatch(parent, /import MeetingsRecapPanel,\s*\{\s*type/);
    assert.doesNotMatch(parent, /import MeetingsActionItemsPanel,\s*\{\s*type/);
    assert.doesNotMatch(parent, /import MeetingsStagesView,\s*\{\s*type/);
  });
});

describe('extracted: MeetingsDetailPendingActions (v1.10.595)', () => {
  it('lives in its own file with default export', () => {
    const src = read('MeetingsDetailPendingActions.tsx');
    assert.match(src, /export default function MeetingsDetailPendingActions/);
  });

  it('takes a single meetingId prop', () => {
    const src = read('MeetingsDetailPendingActions.tsx');
    assert.match(src, /meetingId:\s*string/);
  });

  it('composes RunControls (auto path) + StateActions (manual path) with orManually label', () => {
    const src = read('MeetingsDetailPendingActions.tsx');
    assert.match(src, /<MeetingsRunControls\s+meetingId=\{meetingId\}/);
    assert.match(src, /<MeetingsStateActions\s+meetingId=\{meetingId\}\s+mode="pending"/);
    assert.match(src, /meetings\.orManually\.label/);
  });

  it('is imported and rendered by MeetingsView only on pending', () => {
    const parent = read('MeetingsView.tsx');
    assert.match(parent, /import\s+MeetingsDetailPendingActions\s+from\s+'\.\/MeetingsDetailPendingActions'/);
    assert.match(parent, /<MeetingsDetailPendingActions/);
    assert.match(parent, /detail\.status === 'pending'/);
  });

  it('parent MeetingsView no longer imports RunControls/StateActions directly', () => {
    const parent = read('MeetingsView.tsx');
    assert.doesNotMatch(parent, /import\s+MeetingsRunControls\s+from/);
    assert.doesNotMatch(parent, /import\s+MeetingsStateActions\s+from/);
    assert.doesNotMatch(parent, /meetings\.orManually\.label/);
  });
});

describe('extracted: MeetingsDetailInProgressActions (v1.10.594)', () => {
  it('lives in its own file with default export', () => {
    const src = read('MeetingsDetailInProgressActions.tsx');
    assert.match(src, /export default function MeetingsDetailInProgressActions/);
  });

  it('takes meetingId/contribOpen + onContribToggle props', () => {
    const src = read('MeetingsDetailInProgressActions.tsx');
    assert.match(src, /meetingId:\s*string/);
    assert.match(src, /contribOpen:\s*boolean/);
    assert.match(src, /onContribToggle:\s*\(\)\s*=>\s*void/);
  });

  it('composes StateActions (mode=in-progress) + ContributePanel + manual label', () => {
    const src = read('MeetingsDetailInProgressActions.tsx');
    assert.match(src, /<MeetingsStateActions\s+meetingId=\{meetingId\}\s+mode="in-progress"/);
    assert.match(src, /<MeetingsContributePanel/);
    assert.match(src, /meetings\.manual\.label/);
    assert.match(src, /meetings\.contributeButton/);
  });

  it('is imported and rendered by MeetingsView only on in-progress', () => {
    const parent = read('MeetingsView.tsx');
    assert.match(parent, /import\s+MeetingsDetailInProgressActions\s+from\s+'\.\/MeetingsDetailInProgressActions'/);
    assert.match(parent, /<MeetingsDetailInProgressActions/);
    assert.match(parent, /detail\.status === 'in-progress'/);
  });

  it('parent MeetingsView no longer imports ContributePanel directly', () => {
    const parent = read('MeetingsView.tsx');
    assert.doesNotMatch(parent, /import\s+MeetingsContributePanel\s+from/);
    assert.doesNotMatch(parent, /meetings\.contributeButton/);
  });
});

describe('extracted: MeetingsDetailCompletedActions (v1.10.593)', () => {
  it('lives in its own file with default export', () => {
    const src = read('MeetingsDetailCompletedActions.tsx');
    assert.match(src, /export default function MeetingsDetailCompletedActions/);
  });

  it('takes meetingId/meetingTitle + fork open + 3 callback props', () => {
    const src = read('MeetingsDetailCompletedActions.tsx');
    assert.match(src, /meetingId:\s*string/);
    assert.match(src, /meetingTitle:\s*string/);
    assert.match(src, /forkOpen:\s*boolean/);
    assert.match(src, /onForkToggle:\s*\(\)\s*=>\s*void/);
    assert.match(src, /onForkClose:\s*\(\)\s*=>\s*void/);
    assert.match(src, /onForked:\s*\(newId:\s*string\)\s*=>\s*void/);
  });

  it('composes the 4 sub-components (Publish/PeerRetro/Retro + ForkForm)', () => {
    const src = read('MeetingsDetailCompletedActions.tsx');
    assert.match(src, /<MeetingsPublishControls/);
    assert.match(src, /<MeetingsPeerRetroControls/);
    assert.match(src, /<MeetingsRetroActions/);
    assert.match(src, /<MeetingsForkForm/);
  });

  it('owns the fork-toggle button + uses meetings.fork i18n keys', () => {
    const src = read('MeetingsDetailCompletedActions.tsx');
    assert.match(src, /meetings\.fork\.button/);
    assert.match(src, /meetings\.cancelFork/);
  });

  it('is imported and rendered by MeetingsView only on completed/escalated', () => {
    const parent = read('MeetingsView.tsx');
    assert.match(parent, /import\s+MeetingsDetailCompletedActions\s+from\s+'\.\/MeetingsDetailCompletedActions'/);
    assert.match(parent, /<MeetingsDetailCompletedActions/);
    assert.match(parent, /\['completed', 'escalated'\]\.includes\(detail\.status\)/);
  });

  it('parent MeetingsView no longer imports the 4 sub-components directly', () => {
    const parent = read('MeetingsView.tsx');
    assert.doesNotMatch(parent, /import\s+MeetingsPublishControls\s+from/);
    assert.doesNotMatch(parent, /import\s+MeetingsPeerRetroControls\s+from/);
    assert.doesNotMatch(parent, /import\s+MeetingsRetroActions\s+from/);
    assert.doesNotMatch(parent, /import\s+MeetingsForkForm\s+from/);
  });
});

describe('extracted: SpecialistsDetailHeader (v1.10.592)', () => {
  it('lives in its own file with default export', () => {
    const src = read('SpecialistsDetailHeader.tsx');
    assert.match(src, /export default function SpecialistsDetailHeader/);
  });

  it('takes selected/confirmRemoveId/removeBusy + 2 callback props', () => {
    const src = read('SpecialistsDetailHeader.tsx');
    assert.match(src, /selected:\s*Specialist\s*\|\s*null/);
    assert.match(src, /confirmRemoveId:\s*string\s*\|\s*null/);
    assert.match(src, /removeBusy:\s*boolean/);
    assert.match(src, /onConfirmRemove:\s*\(id:\s*string\s*\|\s*null\)\s*=>\s*void/);
    assert.match(src, /onRemove:\s*\(id:\s*string\)\s*=>\s*void/);
  });

  it('renders title placeholder/selected + Remove button + confirm block', () => {
    const src = read('SpecialistsDetailHeader.tsx');
    assert.match(src, /specialists\.title\.selected/);
    assert.match(src, /specialists\.title\.select/);
    assert.match(src, /specialists\.action\.removeAria/);
    assert.match(src, /specialists\.confirmRemove\.prefix/);
    assert.match(src, /specialists\.action\.confirmRemove/);
  });

  it('is imported and rendered by SpecialistsView', () => {
    const parent = read('SpecialistsView.tsx');
    assert.match(parent, /import\s+SpecialistsDetailHeader\s+from\s+'\.\/SpecialistsDetailHeader'/);
    assert.match(parent, /<SpecialistsDetailHeader/);
    assert.match(parent, /onConfirmRemove=\{setConfirmRemoveId\}/);
    assert.match(parent, /onRemove=\{handleRemove\}/);
  });

  it('parent SpecialistsView no longer holds the inline detail header', () => {
    const parent = read('SpecialistsView.tsx');
    assert.doesNotMatch(parent, /specialists\.confirmRemove\.prefix/);
    assert.doesNotMatch(parent, /specialists\.title\.selected/);
  });
});

describe('extracted: ControlPanelBatch (v1.10.591)', () => {
  it('lives in its own file with default export', () => {
    const src = read('ControlPanelBatch.tsx');
    assert.match(src, /export default function ControlPanelBatch/);
  });

  it('takes worker list / selection / batch state / 4 callback props', () => {
    const src = read('ControlPanelBatch.tsx');
    assert.match(src, /selectableWorkers:\s*Worker\[\]/);
    assert.match(src, /selected:\s*Set<string>/);
    assert.match(src, /selectedCount:\s*number/);
    assert.match(src, /batchBusy:\s*BatchKind\s*\|\s*null/);
    assert.match(src, /disableBatch:\s*boolean/);
    assert.match(src, /batchResults:\s*BatchOutcome\[\]\s*\|\s*null/);
    assert.match(src, /onSelectAll:\s*\(\)\s*=>\s*void/);
    assert.match(src, /onClearSelection:\s*\(\)\s*=>\s*void/);
    assert.match(src, /onToggleSelected:\s*\(name:\s*string\)\s*=>\s*void/);
    assert.match(src, /onRunBatch:\s*\(kind:\s*BatchKind\)\s*=>\s*void/);
  });

  it('renders header / worker list / cancel+close buttons / outcome panel', () => {
    const src = read('ControlPanelBatch.tsx');
    assert.match(src, /controlPanel\.batch\.title/);
    assert.match(src, /controlPanel\.batch\.selectAll/);
    assert.match(src, /controlPanel\.batch\.cancelSelected/);
    assert.match(src, /controlPanel\.batch\.closeSelected/);
    assert.match(src, /controlPanel\.lastBatch\.title/);
  });

  it('parent ControlPanel exports BatchKind/BatchOutcome', () => {
    const parent = read('ControlPanel.tsx');
    assert.match(parent, /export\s+type\s+BatchKind/);
    assert.match(parent, /export\s+interface\s+BatchOutcome/);
  });

  it('is imported and rendered by ControlPanel; inline batch card removed', () => {
    const parent = read('ControlPanel.tsx');
    assert.match(parent, /import\s+ControlPanelBatch\s+from\s+'\.\/ControlPanelBatch'/);
    assert.match(parent, /<ControlPanelBatch/);
    assert.match(parent, /onRunBatch=\{runBatch\}/);
    assert.doesNotMatch(parent, /controlPanel\.batch\.selectAll/);
    assert.doesNotMatch(parent, /controlPanel\.lastBatch\.title/);
  });
});

describe('extracted: ControlPanelActions (v1.10.590)', () => {
  it('lives in its own file with default export', () => {
    const src = read('ControlPanelActions.tsx');
    assert.match(src, /export default function ControlPanelActions/);
  });

  it('takes worker name + actions list + busy state + click props', () => {
    const src = read('ControlPanelActions.tsx');
    assert.match(src, /workerName:\s*string/);
    assert.match(src, /actions:\s*SingleAction\[\]/);
    assert.match(src, /busyKind:\s*ActionKind\s*\|\s*null/);
    assert.match(src, /onRunSingle:\s*\(action:\s*SingleAction\)\s*=>\s*void/);
  });

  it('renders the action grid using TONE_VARIANT + busy label format', () => {
    const src = read('ControlPanelActions.tsx');
    assert.match(src, /TONE_VARIANT\[action\.tone\]/);
    assert.match(src, /controlPanel\.action\.busy/);
    assert.match(src, /controlPanel\.worker\.title/);
  });

  it('parent ControlPanel exports SingleAction/ActionKind/ActionTone/TONE_VARIANT', () => {
    const parent = read('ControlPanel.tsx');
    assert.match(parent, /export\s+type\s+ActionKind/);
    assert.match(parent, /export\s+type\s+ActionTone/);
    assert.match(parent, /export\s+interface\s+SingleAction/);
    assert.match(parent, /export\s+const\s+TONE_VARIANT/);
  });

  it('is imported and rendered by ControlPanel; inline grid removed', () => {
    const parent = read('ControlPanel.tsx');
    assert.match(parent, /import\s+ControlPanelActions\s+from\s+'\.\/ControlPanelActions'/);
    assert.match(parent, /<ControlPanelActions/);
    assert.match(parent, /onRunSingle=\{runSingle\}/);
    assert.doesNotMatch(parent, /controlPanel\.worker\.title/);
  });
});

describe('extracted: XtermStatusBar (v1.10.589)', () => {
  it('lives in its own file with default export', () => {
    const src = read('XtermStatusBar.tsx');
    assert.match(src, /export default function XtermStatusBar/);
  });

  it('takes the 7 controlled-input props', () => {
    const src = read('XtermStatusBar.tsx');
    assert.match(src, /statusLabel:\s*string/);
    assert.match(src, /searchOpen:\s*boolean/);
    assert.match(src, /onToggleSearch:\s*\(\)\s*=>\s*void/);
    assert.match(src, /searchQuery:\s*string/);
    assert.match(src, /onSearchQuery:\s*\(next:\s*string\)\s*=>\s*void/);
    assert.match(src, /onRunSearch:\s*\(direction:\s*SearchDirection\)\s*=>\s*void/);
    assert.match(src, /onCloseSearch:\s*\(\)\s*=>\s*void/);
  });

  it('renders status bar + search button + Enter→runSearch + Escape→close', () => {
    const src = read('XtermStatusBar.tsx');
    assert.match(src, /xterm\.search\.label/);
    assert.match(src, /xterm\.search\.button/);
    assert.match(src, /xterm\.find\.placeholder/);
    assert.match(src, /e\.shiftKey \? 'prev' : 'next'/);
    assert.match(src, /e\.key === 'Escape'/);
  });

  it('is imported and rendered by XtermView', () => {
    const parent = read('XtermView.tsx');
    assert.match(parent, /import\s+XtermStatusBar\s+from\s+'\.\/XtermStatusBar'/);
    assert.match(parent, /<XtermStatusBar/);
    assert.match(parent, /onSearchQuery=\{setSearchQuery\}/);
    assert.match(parent, /onRunSearch=\{runSearch\}/);
  });

  it('parent XtermView no longer holds the inline status bar markup', () => {
    const parent = read('XtermView.tsx');
    assert.doesNotMatch(parent, /xterm\.search\.label/);
    assert.doesNotMatch(parent, /xterm\.find\.placeholder/);
  });
});

describe('extracted: WorkerDetailHeader (v1.10.588)', () => {
  it('lives in its own file with default export', () => {
    const src = read('WorkerDetailHeader.tsx');
    assert.match(src, /export default function WorkerDetailHeader/);
  });

  it('takes worker name + tab + font controls props', () => {
    const src = read('WorkerDetailHeader.tsx');
    assert.match(src, /workerName:\s*string/);
    assert.match(src, /tab:\s*TerminalTab/);
    assert.match(src, /onTabChange:\s*\(next:\s*TerminalTab\)\s*=>\s*void/);
    assert.match(src, /fontSize:\s*number/);
    assert.match(src, /onBumpFont:\s*\(delta:\s*number\)\s*=>\s*void/);
  });

  it('renders the title + tab switcher + font adjustor', () => {
    const src = read('WorkerDetailHeader.tsx');
    assert.match(src, /workerDetail\.terminalSession/);
    assert.match(src, /workerDetail\.tab\.screen/);
    assert.match(src, /workerDetail\.tab\.scrollback/);
    assert.match(src, /workerDetail\.font\.decrease/);
    assert.match(src, /workerDetail\.font\.increase/);
  });

  it('is imported and rendered by WorkerDetail', () => {
    const parent = read('WorkerDetail.tsx');
    assert.match(parent, /import\s+WorkerDetailHeader\s+from\s+'\.\/WorkerDetailHeader'/);
    assert.match(parent, /<WorkerDetailHeader/);
    assert.match(parent, /onTabChange=\{setTab\}/);
    assert.match(parent, /onBumpFont=\{bumpFont\}/);
  });

  it('parent WorkerDetail no longer holds the inline CardHeader block', () => {
    const parent = read('WorkerDetail.tsx');
    assert.doesNotMatch(parent, /<CardHeader/);
    assert.doesNotMatch(parent, /workerDetail\.font\.decrease/);
  });
});

describe('extracted: WorkflowList (v1.10.587)', () => {
  it('lives in its own file with default export', () => {
    const src = read('WorkflowList.tsx');
    assert.match(src, /export default function WorkflowList/);
  });

  it('takes workflows + error/busy + selection + 2 callback props', () => {
    const src = read('WorkflowList.tsx');
    assert.match(src, /workflows:\s*Workflow\[\]/);
    assert.match(src, /error:\s*string\s*\|\s*null/);
    assert.match(src, /busy:\s*boolean/);
    assert.match(src, /selectedId:\s*string\s*\|\s*null/);
    assert.match(src, /onSelect:\s*\(id:\s*string\)\s*=>\s*void/);
    assert.match(src, /onRefresh:\s*\(\)\s*=>\s*void/);
  });

  it('renders header / error / empty / list states with selected highlight', () => {
    const src = read('WorkflowList.tsx');
    assert.match(src, /workflows\.title/);
    assert.match(src, /workflows\.empty\.cli/);
    assert.match(src, /workflows\.status\.on/);
    assert.match(src, /workflows\.status\.off/);
    assert.match(src, /workflows\.nodesEdges\.format/);
  });

  it('is imported and rendered by WorkflowEditor', () => {
    const parent = read('WorkflowEditor.tsx');
    assert.match(parent, /import\s+WorkflowList\s+from\s+'\.\/WorkflowList'/);
    assert.match(parent, /<WorkflowList/);
    assert.match(parent, /onRefresh=\{refresh\}/);
  });

  it('parent WorkflowEditor no longer holds the inline aside markup', () => {
    const parent = read('WorkflowEditor.tsx');
    assert.doesNotMatch(parent, /workflows\.empty\.cli/);
    assert.doesNotMatch(parent, /workflows\.nodesEdges\.format/);
  });
});

describe('extracted: MeetingsDetailTitleBar (v1.10.586)', () => {
  it('lives in its own file with default export', () => {
    const src = read('MeetingsDetailTitleBar.tsx');
    assert.match(src, /export default function MeetingsDetailTitleBar/);
  });

  it('takes title/showStreamingBadge/streaming props', () => {
    const src = read('MeetingsDetailTitleBar.tsx');
    assert.match(src, /title:\s*string/);
    assert.match(src, /showStreamingBadge:\s*boolean/);
    assert.match(src, /streaming:\s*boolean/);
  });

  it('renders the title + the live/offline badge tone+text', () => {
    const src = read('MeetingsDetailTitleBar.tsx');
    assert.match(src, /<CardTitle/);
    assert.match(src, /meetings\.stream\.live/);
    assert.match(src, /meetings\.stream\.offline/);
    assert.match(src, /meetings\.stream\.tooltipLive/);
  });

  it('is imported and rendered by MeetingsView', () => {
    const parent = read('MeetingsView.tsx');
    assert.match(parent, /import\s+MeetingsDetailTitleBar\s+from\s+'\.\/MeetingsDetailTitleBar'/);
    assert.match(parent, /<MeetingsDetailTitleBar/);
    assert.match(parent, /showStreamingBadge=\{Boolean\(selectedId\)\}/);
  });

  it('parent MeetingsView no longer holds the inline title row', () => {
    const parent = read('MeetingsView.tsx');
    assert.doesNotMatch(parent, /meetings\.stream\.tooltipLive/);
    assert.doesNotMatch(parent, /<Radio /);
  });
});

describe('extracted: RiskSandboxPreview (v1.10.585)', () => {
  it('lives in its own file with default export', () => {
    const src = read('RiskSandboxPreview.tsx');
    assert.match(src, /export default function RiskSandboxPreview/);
  });

  it('takes a sandbox SandboxPreview prop', () => {
    const src = read('RiskSandboxPreview.tsx');
    assert.match(src, /sandbox:\s*SandboxPreview/);
    assert.match(src, /import\s+type\s+\{\s*SandboxPreview\s*\}\s+from\s+'\.\.\/pages\/Risk'/);
  });

  it('renders the runtime+isolation badges, capability grid, argv pre, env details', () => {
    const src = read('RiskSandboxPreview.tsx');
    assert.match(src, /risk\.sandbox\.runtime/);
    assert.match(src, /risk\.sandbox\.isolation/);
    assert.match(src, /risk\.sandbox\.network/);
    assert.match(src, /risk\.sandbox\.filesystem/);
    assert.match(src, /risk\.sandbox\.resources/);
    assert.match(src, /risk\.label\.argv/);
    assert.match(src, /Object\.keys\(sandbox\.env/);
  });

  it('SandboxPreview interface lifted to module scope and exported from pages/Risk.tsx', () => {
    const fs = require('fs');
    const path = require('path');
    const src = fs.readFileSync(path.join(__dirname, '..', 'web', 'src', 'pages', 'Risk.tsx'), 'utf8');
    assert.match(src, /export\s+interface\s+SandboxPreview/);
    // No inline definition inside the function body any more.
    assert.doesNotMatch(src, /\s\s+interface SandboxPreview/);
  });

  it('parent Risk page imports + renders + drops the inline sandbox markup', () => {
    const fs = require('fs');
    const path = require('path');
    const src = fs.readFileSync(path.join(__dirname, '..', 'web', 'src', 'pages', 'Risk.tsx'), 'utf8');
    assert.match(src, /import\s+RiskSandboxPreview\s+from\s+'\.\.\/components\/RiskSandboxPreview'/);
    assert.match(src, /<RiskSandboxPreview\s+sandbox=\{sandbox\}/);
    assert.doesNotMatch(src, /risk\.sandbox\.network/);
  });
});

describe('extracted: SessionsHeader (v1.10.584)', () => {
  it('lives in its own file with default export', () => {
    const src = read('SessionsHeader.tsx');
    assert.match(src, /export default function SessionsHeader/);
  });

  it('takes query/totals/loading + 3 callback props', () => {
    const src = read('SessionsHeader.tsx');
    assert.match(src, /query:\s*string/);
    assert.match(src, /onQuery:\s*\(next:\s*string\)\s*=>\s*void/);
    assert.match(src, /totalFiltered:\s*number/);
    assert.match(src, /total:\s*number/);
    assert.match(src, /loading:\s*boolean/);
    assert.match(src, /onNewChat:\s*\(\)\s*=>\s*void/);
    assert.match(src, /onAttachNew:\s*\(\)\s*=>\s*void/);
    assert.match(src, /onRefresh:\s*\(\)\s*=>\s*void/);
  });

  it('renders title + search input + 3 action buttons', () => {
    const src = read('SessionsHeader.tsx');
    assert.match(src, /sessions\.panel\.title/);
    assert.match(src, /sessions\.search\.placeholder/);
    assert.match(src, /sessions\.button\.newChat/);
    assert.match(src, /sessions\.button\.attachNew/);
  });

  it('is imported and rendered by SessionsView', () => {
    const parent = read('SessionsView.tsx');
    assert.match(parent, /import\s+SessionsHeader\s+from\s+'\.\/SessionsHeader'/);
    assert.match(parent, /<SessionsHeader/);
    assert.match(parent, /onQuery=\{setQuery\}/);
  });

  it('parent SessionsView no longer holds the inline CardHeader block', () => {
    const parent = read('SessionsView.tsx');
    assert.doesNotMatch(parent, /sessions\.panel\.title/);
    assert.doesNotMatch(parent, /sessions\.search\.placeholder/);
  });
});

describe('extracted: ChatHeader (v1.10.583)', () => {
  it('lives in its own file with default export', () => {
    const src = read('ChatHeader.tsx');
    assert.match(src, /export default function ChatHeader/);
  });

  it('takes worker name + backfill + sse + autoScroll + onJumpToBottom props', () => {
    const src = read('ChatHeader.tsx');
    assert.match(src, /workerName:\s*string/);
    assert.match(src, /backfillCount:\s*number/);
    assert.match(src, /backfillSource:\s*BackfillSource/);
    assert.match(src, /sseConnected:\s*boolean/);
    assert.match(src, /autoScroll:\s*boolean/);
    assert.match(src, /onJumpToBottom:\s*\(\)\s*=>\s*void/);
  });

  it('renders the title + backfill badge + live badge + jump button', () => {
    const src = read('ChatHeader.tsx');
    assert.match(src, /chat\.workerHeader\.title/);
    assert.match(src, /chat\.loadedPast\.one/);
    assert.match(src, /sseConnected \? 'live' : 'disconnected'/);
    assert.match(src, /chat\.jumpToLatest/);
  });

  it('is imported and rendered by ChatView', () => {
    const parent = read('ChatView.tsx');
    assert.match(parent, /import\s+ChatHeader\s+from\s+'\.\/ChatHeader'/);
    assert.match(parent, /<ChatHeader/);
    assert.match(parent, /onJumpToBottom=\{jumpToBottom\}/);
  });

  it('parent ChatView no longer holds the inline CardHeader block', () => {
    const parent = read('ChatView.tsx');
    assert.doesNotMatch(parent, /<CardHeader/);
    assert.doesNotMatch(parent, /chat\.workerHeader\.title/);
  });
});

describe('extracted: MeetingsSearchInput (v1.10.582)', () => {
  it('lives in its own file with default export', () => {
    const src = read('MeetingsSearchInput.tsx');
    assert.match(src, /export default function MeetingsSearchInput/);
  });

  it('takes value/onChange/searching props', () => {
    const src = read('MeetingsSearchInput.tsx');
    assert.match(src, /value:\s*string/);
    assert.match(src, /onChange:\s*\(next:\s*string\)\s*=>\s*void/);
    assert.match(src, /searching:\s*boolean/);
  });

  it('renders the search input + clear button + searching indicator', () => {
    const src = read('MeetingsSearchInput.tsx');
    assert.match(src, /meetings\.search\.placeholder/);
    assert.match(src, /meetings\.action\.clearSearch/);
    assert.match(src, /meetings\.searching/);
  });

  it('is imported and rendered by MeetingsView', () => {
    const parent = read('MeetingsView.tsx');
    assert.match(parent, /import\s+MeetingsSearchInput\s+from\s+'\.\/MeetingsSearchInput'/);
    assert.match(parent, /<MeetingsSearchInput/);
    assert.match(parent, /value=\{searchQuery\}/);
    assert.match(parent, /onChange=\{setSearchQuery\}/);
  });

  it('parent MeetingsView no longer holds the inline search input', () => {
    const parent = read('MeetingsView.tsx');
    assert.doesNotMatch(parent, /placeholder=\{t\('meetings\.search\.placeholder'\)\}/);
  });
});

describe('extracted: SpecialistsSearchFilters (v1.10.581)', () => {
  it('lives in its own file with default export', () => {
    const src = read('SpecialistsSearchFilters.tsx');
    assert.match(src, /export default function SpecialistsSearchFilters/);
  });

  it('takes the 4 controlled prop pairs + count fields', () => {
    const src = read('SpecialistsSearchFilters.tsx');
    assert.match(src, /filter:\s*string/);
    assert.match(src, /onFilter:\s*\(next:\s*string\)\s*=>\s*void/);
    assert.match(src, /tierFilter:\s*string/);
    assert.match(src, /onTierFilter:\s*\(next:\s*string\)\s*=>\s*void/);
    assert.match(src, /vetoOnly:\s*boolean/);
    assert.match(src, /onVetoOnly:\s*\(next:\s*boolean\)\s*=>\s*void/);
    assert.match(src, /filteredCount:\s*number/);
    assert.match(src, /totalCount:\s*number/);
  });

  it('renders the search input + tier select + vetoOnly checkbox + count', () => {
    const src = read('SpecialistsSearchFilters.tsx');
    assert.match(src, /specialists\.search\.placeholder/);
    assert.match(src, /Object\.keys\(TIER_BADGE\)/);
    assert.match(src, /specialists\.label\.vetoOnly/);
    assert.match(src, /\{filteredCount\}\/\{totalCount\}/);
  });

  it('is imported and rendered by SpecialistsView with all 8 props wired', () => {
    const parent = read('SpecialistsView.tsx');
    assert.match(parent, /import\s+SpecialistsSearchFilters\s+from\s+'\.\/SpecialistsSearchFilters'/);
    assert.match(parent, /<SpecialistsSearchFilters/);
    assert.match(parent, /onFilter=\{setFilter\}/);
    assert.match(parent, /onTierFilter=\{setTierFilter\}/);
    assert.match(parent, /onVetoOnly=\{setVetoOnly\}/);
  });

  it('parent SpecialistsView no longer holds the inline filter row', () => {
    const parent = read('SpecialistsView.tsx');
    assert.doesNotMatch(parent, /placeholder=\{t\('specialists\.search\.placeholder'\)\}/);
    assert.doesNotMatch(parent, /Object\.keys\(TIER_BADGE\)\.map/);
  });
});

describe('extracted: WikiSearchResults (v1.10.580)', () => {
  it('lives in its own file with default export', () => {
    const src = read('WikiSearchResults.tsx');
    assert.match(src, /export default function WikiSearchResults/);
  });

  it('takes search/searchError/selectedPath/onSelect props', () => {
    const src = read('WikiSearchResults.tsx');
    assert.match(src, /search:\s*SearchResponse\s*\|\s*null/);
    assert.match(src, /searchError:\s*string\s*\|\s*null/);
    assert.match(src, /selectedPath:\s*string\s*\|\s*null/);
    assert.match(src, /onSelect:\s*\(path:\s*string\)\s*=>\s*void/);
  });

  it('renders the four states (error / loading / empty / hit list)', () => {
    const src = read('WikiSearchResults.tsx');
    assert.match(src, /searchError/);
    assert.match(src, /wiki\.loading/);
    assert.match(src, /wiki\.empty\.format/);
    assert.match(src, /search\.hits\.map/);
  });

  it('is imported and rendered by WikiView', () => {
    const parent = read('WikiView.tsx');
    assert.match(parent, /import\s+WikiSearchResults\s+from\s+'\.\/WikiSearchResults'/);
    assert.match(parent, /<WikiSearchResults/);
    assert.match(parent, /onSelect=\{setSelectedPath\}/);
  });

  it('parent WikiView no longer holds the inline results map', () => {
    const parent = read('WikiView.tsx');
    assert.doesNotMatch(parent, /search\.hits\.map\(/);
  });
});
